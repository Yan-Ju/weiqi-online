import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { WebSocket } from 'ws';

test('real server: multiple clients, scoring, resize, rematch, room cleanup and invalid messages', { timeout: 20000 }, async t => {
  const server = spawn(process.execPath, ['server/server.js'], { cwd: import.meta.dirname, env: { ...process.env, PORT: '0' }, windowsHide: true });
  t.after(() => server.kill());
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Server startup timeout')), 5000);
    server.stdout.on('data', data => {
      const match = String(data).match(/listening on (\d+)/);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
    server.once('error', reject);
    server.once('exit', code => { clearTimeout(timer); reject(new Error(`Server exited ${code}`)); });
  });
  const url = `http://127.0.0.1:${port}`;
  async function client() {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    const queue = [], pending = [];
    ws.on('message', data => {
      const msg = JSON.parse(String(data));
      const idx = pending.findIndex(p => p.predicate(msg));
      if (idx >= 0) { const p = pending.splice(idx, 1)[0]; clearTimeout(p.timer); p.resolve(msg); }
      else queue.push(msg);
    });
    await once(ws, 'open');
    t.after(() => ws.terminate());
    return {
      ws,
      send: msg => ws.send(JSON.stringify(msg)),
      wait(predicate) {
        const idx = queue.findIndex(predicate);
        if (idx >= 0) return Promise.resolve(queue.splice(idx, 1)[0]);
        return new Promise((resolve, reject) => {
          const item = { predicate, resolve, timer: setTimeout(() => { const i = pending.indexOf(item); if (i >= 0) pending.splice(i, 1); reject(new Error('Message timeout: ' + predicate)); }, 3000) };
          pending.push(item);
        });
      }
    };
  }
  const [a, b, spectator] = await Promise.all([client(), client(), client()]);
  a.send({ type: 'create_room', config: { boardSize: 9, mode: 'teach' } });
  const { roomId } = await a.wait(m => m.type === 'join_success');
  b.send({ type: 'join_room', roomId });
  assert.equal((await b.wait(m => m.type === 'join_success')).role, 'white');
  spectator.send({ type: 'join_room', roomId });
  assert.equal((await spectator.wait(m => m.type === 'join_success')).role, 'spectator');
  a.send({ type: 'join_room', roomId });
  assert.equal((await a.wait(m => m.type === 'join_success')).role, 'black');
  a.send({ type: 'move', r: 4, c: 4 });
  assert.equal((await b.wait(m => m.event === 'move_played')).state.board[4][4], 1);
  spectator.send({ type: 'teach_action', action: 'reset' });
  assert.equal((await spectator.wait(m => m.type === 'action_error')).type, 'action_error');
  a.send({ type: 'request_estimate' });
  const estimate = await a.wait(m => m.type === 'position_estimate');
  assert.ok(estimate.result.dameCount > 0);
  assert.ok(estimate.result.blackTerritory < 40);
  assert.equal((await (await fetch(`${url}/api/room/${roomId}`)).json()).status, 'playing');
  a.send({ type: 'request_scoring' });
  assert.equal((await b.wait(m => m.event === 'scoring_started')).state.status, 'scoring');
  b.send({ type: 'toggle_dead', r: 4, c: 4 });
  assert.ok((await a.wait(m => m.event === 'dead_toggled')).state.scoringState.result.deadStones['4,4']);
  a.send({ type: 'resume_game' });
  assert.equal((await b.wait(m => m.event === 'resume_game')).state.status, 'playing');
  a.send({ type: 'change_board_size', boardSize: 13 });
  assert.equal((await b.wait(m => m.event === 'change_board_size')).state.boardSize, 13);
  a.send({ type: 'request_scoring' });
  await a.wait(m => m.event === 'scoring_started');
  a.send({ type: 'confirm_scoring' });
  assert.equal((await b.wait(m => m.event === 'scoring_confirmed')).state.status, 'finished');
  a.send({ type: 'new_game' });
  assert.equal((await b.wait(m => m.event === 'new_game')).state.status, 'playing');
  const created = await (await fetch(`${url}/api/create-room`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode: 'match' }) })).json();
  for (const c of [a, b, spectator]) {
    c.send({ type: 'join_room', roomId: created.roomId });
    await c.wait(m => m.type === 'join_success' && m.roomId === created.roomId);
  }
  assert.equal((await fetch(`${url}/api/room/${roomId}`)).status, 404);
  a.send({ type: 'move', r: 1, c: 1 });
  await b.wait(m => m.event === 'move_played' && m.state.roomId === created.roomId);
  a.send({ type: 'new_game' });
  assert.equal((await b.wait(m => m.event === 'new_game' && m.state.roomId === created.roomId)).restarted, false);
  b.send({ type: 'new_game' });
  assert.equal((await b.wait(m => m.event === 'new_game' && m.restarted)).state.historyLength, 0);
  b.send({ type: 'configure_room', config: { gameType:'chess', mode:'match', timeControl:'none' } });
  const proposed = await a.wait(m => m.event === 'configure_room' && m.pending);
  assert.equal(proposed.state.gameType,'go');
  a.send({ type:'respond_config', id:proposed.state.pendingConfig.id, accept:true });
  const switched = await b.wait(m => m.event === 'respond_config' && m.changed);
  assert.equal(switched.state.roomId,created.roomId); assert.equal(switched.state.gameType,'chess'); assert.equal(switched.state.board[7][4],'K');
  b.send({type:'move',r:6,c:4,toR:4,toC:4});
  assert.equal((await a.wait(m => m.event === 'move_played' && m.state.gameType === 'chess')).state.board[4][4],'P');
  spectator.send({type:'configure_room',config:{gameType:'go',mode:'teach'}});
  assert.equal((await spectator.wait(m => m.type === 'action_error')).type,'action_error');
  b.send({type:'configure_room',config:{gameType:'chess',mode:'teach',timeControl:'none'}});
  const teaching = await a.wait(m => m.event === 'configure_room' && m.pending);
  a.send({type:'respond_config',id:teaching.state.pendingConfig.id,accept:true});
  await b.wait(m => m.event === 'respond_config' && m.state.mode === 'teach');
  b.send({type:'teach_action',action:'set_chess_piece',payload:{r:3,c:3,piece:'Q'}});
  assert.equal((await a.wait(m => m.event === 'teach_action')).state.board[3][3],'Q');
  a.send({type:'configure_room',config:{gameType:'go',mode:'teach',boardSize:9,komi:6.5,timeControl:'none'}});
  const back = await b.wait(m => m.event === 'configure_room' && m.changed);
  assert.equal(back.state.boardSize,9); assert.equal(back.state.roomId,created.roomId); assert.equal(back.state.historyLength,0);
  a.ws.send('null');
  assert.equal((await a.wait(m => m.type === 'action_error')).type, 'action_error');
  a.send({ type: 'move', r: 0.1, c: 0 });
  assert.equal((await a.wait(m => m.type === 'action_error')).type, 'action_error');
  const missing = await client();
  missing.send({ type: 'join_room', roomId: 'ZZZZZZ' });
  assert.equal((await missing.wait(m => m.type === 'action_error')).code, 'room_missing');
  assert.equal((await fetch(`${url}/api/room/ZZZZZZ`)).status, 404);
  for (const path of [`/room/${created.roomId}`, '/app.js', '/board.js', '/chess-board.js', '/audio.js', '/style.css', '/health']) assert.equal((await fetch(url + path)).status, 200);
});
