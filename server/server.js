import express from 'express';
import { performance } from 'node:perf_hooks';
import { sampleServerStats } from './serverStats.js';
import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { fileURLToPath } from 'node:url';
import { RoomManager } from './roomManager.js';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, maxPayload: 8192 });
const rooms = new RoomManager();
let lastCpu = process.cpuUsage();
let lastSample = performance.now();
let serverStats = sampleServerStats(rooms.rooms, 0, null, process.memoryUsage().rss);
function updateServerStats() {
  const now = performance.now();
  const cpu = process.cpuUsage();
  const elapsed = now - lastSample;
  const percent = elapsed > 0 ? ((cpu.user - lastCpu.user) + (cpu.system - lastCpu.system)) / (elapsed * 10) : null;
  lastCpu = cpu; lastSample = now;
  serverStats = sampleServerStats(rooms.rooms, wss.clients.size, percent, process.memoryUsage().rss);
}

app.use(express.json({ limit: '8kb' }));
app.use(express.static(fileURLToPath(new URL('../public', import.meta.url))));
app.get('/room/:roomId', (_req, res) => res.sendFile(fileURLToPath(new URL('../public/index.html', import.meta.url))));
app.get('/health', (_req, res) => res.json({ status: 'ok', version: '1.3.0' }));

app.get('/api/server-stats', (_req, res) => { res.set('Cache-Control', 'no-store'); res.json(serverStats); });

// Bound anonymous creation as well as the lifetime of never-joined rooms.
const creationRates = new Map();
app.post('/api/create-room', (req, res) => {
  const key = req.socket.remoteAddress;
  const now = Date.now();
  let rate = creationRates.get(key);
  if (!rate || now - rate.start > 60000) rate = { start: now, count: 0 };
  creationRates.set(key, rate);
  if (++rate.count > 60) return res.status(429).json({ success: false, reason: '创建过于频繁，请稍后再试' });
  try {
    const room = rooms.createRoom(req.body);
    res.json({ success: true, roomId: room.roomId, mode: room.mode, boardSize: room.boardSize });
  } catch (err) { res.status(400).json({ success: false, reason: err.message }); }
});
app.get('/api/room/:roomId', (req, res) => {
  const state = rooms.getRoomSnapshot(req.params.roomId);
  if (!state) return res.status(404).json({ error: '房间不存在或已关闭' });
  res.json(state);
});

function send(ws, message) {
  if (ws.readyState !== WebSocket.OPEN) return;
  if (ws.bufferedAmount > 1024 * 1024) return ws.terminate();
  ws.send(JSON.stringify(message));
}
function broadcast(id, event = null, payload = {}) {
  const room = rooms.getRoom(id);
  if (!room) return;
  const snapshot = rooms.getRoomSnapshot(id);
  for (const ws of [room.players.black, room.players.white, ...room.players.spectators]) {
    if (ws) send(ws, { type: 'room_state', event, ...payload, state: { ...snapshot, myRole: ws.role } });
  }
}
function join(ws, id, name) {
  if (typeof id !== 'string' || !/^[A-Z0-9]{4,12}$/.test(id) || !rooms.getRoom(id)) {
    send(ws, { type: 'action_error', code: 'room_missing', reason: '房间不存在或已关闭，请创建新房间' });
    return;
  }
  const previous = ws.roomId;
  const role = rooms.joinRoom(id, ws, name);
  if (previous && previous !== id) broadcast(previous, 'player_left');
  send(ws, { type: 'join_success', role, roomId: id });
  broadcast(id, 'player_joined');
}

wss.on('connection', ws => {
  send(ws, { type: 'server_stats', stats: serverStats });
  ws.isAlive = true;
  ws.rate = { start: Date.now(), count: 0 };
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('error', () => {});
  ws.on('message', data => {
    if (Date.now() - ws.rate.start > 1000) ws.rate = { start: Date.now(), count: 0 };
    if (++ws.rate.count > 50) return ws.close(1008, 'Too many messages');
    try {
      const msg = JSON.parse(data.toString());
      if (!msg || typeof msg !== 'object' || Array.isArray(msg)) throw new Error('消息格式无效');
      if (msg.type === 'join_room') return join(ws, msg.roomId, msg.playerName);
      if (msg.type === 'create_room') {
        if (ws.lastCreate && Date.now() - ws.lastCreate < 1000) throw new Error('创建过于频繁，请稍后再试');
        const room = rooms.createRoom(msg.config || {});
        ws.lastCreate = Date.now();
        join(ws, room.roomId, msg.playerName);
        return;
      }
      if (!ws.roomId) throw new Error('请先加入房间');
      if (msg.type === 'request_estimate') {
        const room = rooms.getRoom(ws.roomId);
        if (!room) throw new Error('房间已关闭');
        send(ws, { type: 'position_estimate', result: room.game.estimatePosition() });
        return;
      }
      const operations = {
        move: () => rooms.handleMove(ws, msg.r, msg.c),
        pass: () => rooms.handlePass(ws),
        resign: () => rooms.handleResign(ws),
        teach_action: () => rooms.handleTeachAction(ws, msg.action, msg.payload),
        request_scoring: () => rooms.startScoring(ws),
        toggle_dead: () => rooms.toggleDeadStone(ws, msg.r, msg.c),
        confirm_scoring: () => rooms.confirmScoring(ws),
        resume_game: () => rooms.resumeGame(ws),
        new_game: () => rooms.newGame(ws),
        change_board_size: () => rooms.changeBoardSize(ws, msg.boardSize)
      };
      const events = { move: 'move_played', pass: 'pass_played', resign: 'game_resigned', request_scoring: 'scoring_started', toggle_dead: 'dead_toggled', confirm_scoring: 'scoring_confirmed' };
      if (Object.hasOwn(operations, msg.type)) {
        const result = operations[msg.type]();
        if (!result.success) send(ws, { type: 'action_error', reason: result.reason || '当前不能执行此操作' });
        // Also publish a timeout reached while processing a rejected action.
        broadcast(ws.roomId, result.success ? (events[msg.type] || msg.type) : null, result.success ? result : {});
      } else if (msg.type === 'chat') {
        const text = String(msg.text || '').trim().slice(0, 100);
        if (text) for (const peer of wss.clients) if (peer.roomId === ws.roomId) send(peer, { type: 'chat_message', sender: ws.playerName, role: ws.role, text, time: Date.now() });
      } else throw new Error('未知操作');
    } catch (err) { send(ws, { type: 'action_error', reason: err.message || '消息无效' }); }
  });
  ws.on('close', () => {
    const id = ws.roomId;
    rooms.leaveRoom(ws);
    if (id) broadcast(id, 'player_left');
  });
});

setInterval(() => {
  rooms.cleanupRooms();
  for (const [key, rate] of creationRates) if (Date.now() - rate.start > 60000) creationRates.delete(key);
  for (const [id, room] of rooms.rooms) {
    if (room.clocks.active && room.status === 'playing') {
      rooms.updateClocks(room);
      broadcast(id, 'clock_tick');
    }
  }
}, 1000).unref();
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000).unref();
// One shared sample/broadcast for all clients; no per-tab polling timers.
setInterval(() => {
  updateServerStats();
  for (const ws of wss.clients) send(ws, { type: 'server_stats', stats: serverStats });
}, 5000).unref();
server.listen(process.env.PORT || 3000, '0.0.0.0', () => console.log(`Go server listening on ${server.address().port}`));
