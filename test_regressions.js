import test from 'node:test';
import assert from 'node:assert/strict';
import { GoRules } from './server/goRules.js';
import { RoomManager } from './server/roomManager.js';

function fixture(mode = 'teach', config = {}) {
  const manager = new RoomManager();
  const room = manager.createRoom({ mode, boardSize: 9, ...config });
  const a = {}, b = {}, spectator = {};
  manager.joinRoom(room.roomId, a, 'black');
  manager.joinRoom(room.roomId, b, 'white');
  manager.joinRoom(room.roomId, spectator, 'viewer');
  return { manager, room, a, b, spectator };
}

test('rejoining is idempotent; switching rooms removes stale seats and deletes empty rooms', () => {
  const m = new RoomManager(), a = {};
  let room = m.createRoom();
  m.joinRoom(room.roomId, a);
  assert.equal(m.joinRoom(room.roomId, a), 'black');
  assert.equal(room.players.spectators.length, 0);
  for (let i = 0; i < 100; i++) {
    const previous = room;
    room = m.createRoom();
    m.joinRoom(room.roomId, a);
    assert.equal(previous.players.black, null);
    assert.equal(m.rooms.size, 1);
  }
  m.leaveRoom(a, { immediate: true });
  assert.equal(m.rooms.size, 0);
});

test('never joined rooms expire; occupied rooms survive sweeping', () => {
  const m = new RoomManager();
  const empty = m.createRoom(), used = m.createRoom();
  m.joinRoom(used.roomId, {});
  m.cleanupRooms(Date.now() + 61000);
  assert.equal(m.getRoom(empty.roomId), undefined);
  assert.ok(m.getRoom(used.roomId));
});

test('refresh and brief disconnect retain a lone player game during grace period', () => {
  const m = new RoomManager(), a = {};
  const room = m.createRoom({ mode: 'teach' });
  m.joinRoom(room.roomId, a);
  m.handleMove(a, 4, 4);
  m.leaveRoom(a);
  assert.ok(m.getRoom(room.roomId));
  const replacement = {};
  m.joinRoom(room.roomId, replacement);
  m.cleanupRooms(Date.now() + 61000);
  assert.equal(room.game.board[4][4], 1);
  assert.equal(m.rooms.size, 1);
  m.leaveRoom(replacement);
  m.cleanupRooms(Date.now() + 61000);
  assert.equal(m.rooms.size, 0);
});

test('resize is authoritative, keeps room and clients, clears old scoring and history', () => {
  const { manager: m, room, a, b } = fixture();
  m.handleMove(a, 4, 4);
  m.startScoring(a);
  assert.ok(m.changeBoardSize(a, 13).success);
  assert.equal(m.rooms.size, 1);
  assert.equal(m.getRoomSnapshot(room.roomId, b).boardSize, 13);
  assert.equal(room.game.board.length, 13);
  assert.equal(room.status, 'playing');
  assert.equal(room.scoringState.active, false);
  assert.equal(room.game.history.length, 0);
});

test('scoring can resume unchanged board, clear marks, play and start a new game', () => {
  const { manager: m, room, a } = fixture();
  m.handleMove(a, 4, 4);
  const board = structuredClone(room.game.board);
  m.startScoring(a);
  assert.ok(m.toggleDeadStone(a, 4, 4).success);
  assert.equal(m.handleMove(a, 2, 2).success, false);
  assert.ok(m.resumeGame(a).success);
  assert.deepEqual(room.game.board, board);
  assert.deepEqual(room.game.deadStones, {});
  assert.ok(m.handleMove(a, 2, 2).success);
  m.startScoring(a);
  assert.ok(m.confirmScoring(a).finished);
  assert.equal(m.handleMove(a, 1, 1).success, false);
  assert.ok(m.newGame(a).restarted);
  assert.equal(room.status, 'playing');
  assert.equal(room.winner, null);
  assert.equal(room.game.history.length, 0);
});

test('spectators cannot change games even in teaching mode', () => {
  for (const mode of ['teach', 'match']) {
    const { manager: m, a, spectator: s } = fixture(mode);
    for (const fn of [() => m.handleMove(s, 1, 1), () => m.handlePass(s), () => m.startScoring(s), () => m.newGame(s), () => m.changeBoardSize(s, 13), () => m.handleTeachAction(s, 'reset')]) assert.equal(fn().success, false);
    m.startScoring(a);
    for (const fn of [() => m.toggleDeadStone(s, 1, 1), () => m.confirmScoring(s), () => m.resumeGame(s)]) assert.equal(fn().success, false);
  }
});

test('match reset and final score require both players; dead edits invalidate confirmations', () => {
  const { manager: m, room, a, b } = fixture('match');
  m.handleMove(a, 4, 4);
  assert.equal(m.changeBoardSize(a, 13).success, false);
  assert.equal(m.handleTeachAction(a, 'reset').success, false);
  m.startScoring(a);
  assert.equal(m.confirmScoring(a).finished, false);
  m.toggleDeadStone(b, 4, 4);
  assert.equal(room.scoringState.agreed.black, false);
  assert.equal(m.confirmScoring(b).finished, false);
  assert.equal(m.confirmScoring(a).finished, true);
  assert.equal(m.newGame(a).restarted, false);
  assert.equal(m.newGame(b).restarted, true);
});

test('pass deducts elapsed time, adds increment; scoring resumes clocks without charging pause', () => {
  const { manager: m, room, a, b } = fixture('match', { timeControl: '1m10s' });
  room.clocks.lastTick = Date.now() - 5000;
  assert.ok(m.handlePass(a).success);
  assert.ok(room.clocks.blackTime > 64 && room.clocks.blackTime <= 65);
  assert.ok(m.handlePass(b).isGameOver);
  assert.equal(room.status, 'scoring');
  room.clocks.lastTick = Date.now() - 600000;
  m.resumeGame(a);
  assert.equal(room.game.consecutivePasses, 0);
  assert.ok(room.clocks.active);
  assert.ok(m.handleMove(a, 1, 1).success);
});

test('timeout prevents a pass or scoring from reviving game; disconnect pauses clocks', () => {
  const { manager: m, room, a, b } = fixture('match', { timeControl: '1m10s' });
  m.leaveRoom(b);
  assert.equal(room.status, 'paused');
  assert.equal(room.clocks.active, false);
  m.joinRoom(room.roomId, b);
  assert.equal(room.status, 'playing');
  room.clocks.lastTick = Date.now() - 61000;
  assert.equal(m.handlePass(a).success, false);
  assert.equal(room.status, 'finished');
  assert.equal(m.startScoring(a).success, false);
});

test('zero komi and draw; invalid and fractional coordinates are rejected', () => {
  const g = new GoRules(9, 0, 0);
  assert.equal(g.komi, 0);
  assert.equal(g.calculateTerritory().japanese.winner, 'draw');
  for (const [r, c] of [[0.5, 0], ['1', 1], [NaN, 0], [-1, 0], [0, 99]]) {
    assert.equal(g.playMove(r, c).success, false);
    assert.equal(g.toggleDeadStone(r, c), null);
  }
});

test('step navigation preserves chronological redo, passes, captures and ko', () => {
  const g = new GoRules(9);
  g.playMove(4, 4); g.pass(); g.playMove(3, 3); g.playMove(2, 2);
  const final = structuredClone(g.board);
  assert.ok(g.jumpToStep(1));
  assert.ok(g.redo());
  assert.equal(g.consecutivePasses, 1);
  assert.ok(g.redo());
  assert.equal(g.consecutivePasses, 0);
  assert.ok(g.jumpToStep(4));
  assert.deepEqual(g.board, final);
  assert.ok(g.jumpToStep(0));
  assert.ok(g.jumpToStep(4));
  assert.deepEqual(g.board, final);
  assert.equal(g.jumpToStep(1.5), false);
  g.ko = [0, 0]; g.pass(); g.undo();
  assert.deepEqual(g.ko, [0, 0]);
  g.redo(); assert.equal(g.ko, null);
});
