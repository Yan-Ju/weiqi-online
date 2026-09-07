import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import { RoomManager } from './roomManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const roomManager = new RoomManager();

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Support clean URLs like /room/ABC123
app.get('/room/:roomId', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// API to create room
app.post('/api/create-room', (req, res) => {
  const room = roomManager.createRoom(req.body);
  res.json({
    success: true,
    roomId: room.roomId,
    mode: room.mode,
    boardSize: room.boardSize
  });
});

// API to get room info
app.get('/api/room/:roomId', (req, res) => {
  const room = roomManager.getRoom(req.params.roomId);
  if (!room) {
    return res.status(404).json({ error: '房间不存在' });
  }
  res.json(roomManager.getRoomSnapshot(room.roomId));
});

// Broadcast room state to all clients in the room
function broadcastRoom(roomId, customEvent = null, payload = {}) {
  const room = roomManager.getRoom(roomId);
  if (!room) return;

  const clients = [...wss.clients].filter(c => c.roomId === roomId && c.readyState === WebSocket.OPEN);

  for (const client of clients) {
    const snapshot = roomManager.getRoomSnapshot(roomId, client);
    const msg = {
      type: 'room_state',
      state: snapshot,
      event: customEvent,
      ...payload
    };
    client.send(JSON.stringify(msg));
  }
}

// WebSocket message handling
wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      handleClientMessage(ws, message);
    } catch (err) {
      console.error('Error parsing client message:', err);
    }
  });

  ws.on('close', () => {
    if (ws.roomId) {
      const roomId = ws.roomId;
      roomManager.leaveRoom(ws);
      broadcastRoom(roomId, 'player_left');
    }
  });
});

function handleClientMessage(ws, message) {
  const { type, roomId, playerName } = message;

  switch (type) {
    case 'join_room': {
      let targetRoom = roomManager.getRoom(roomId);
      if (!targetRoom) {
        // Automatically create a default room if it doesn't exist
        targetRoom = roomManager.createRoom({
          roomId,
          boardSize: 19,
          mode: 'match',
          colorPref: 'black'
        });
      }

      const role = roomManager.joinRoom(targetRoom.roomId, ws, playerName || '棋友');
      ws.send(JSON.stringify({
        type: 'join_success',
        role,
        roomId: targetRoom.roomId
      }));

      broadcastRoom(targetRoom.roomId, 'player_joined', { role, playerName });
      break;
    }

    case 'move': {
      if (!ws.roomId) return;
      const { r, c } = message;
      const result = roomManager.handleMove(ws, r, c);
      if (result.success) {
        broadcastRoom(ws.roomId, 'move_played', { move: result.move });
      } else {
        ws.send(JSON.stringify({
          type: 'action_error',
          reason: result.reason
        }));
      }
      break;
    }

    case 'pass': {
      if (!ws.roomId) return;
      const result = roomManager.handlePass(ws);
      if (result.success) {
        broadcastRoom(ws.roomId, 'pass_played', { pass: result.pass, isGameOver: result.isGameOver });
      } else {
        ws.send(JSON.stringify({
          type: 'action_error',
          reason: result.reason
        }));
      }
      break;
    }

    case 'resign': {
      if (!ws.roomId) return;
      const result = roomManager.handleResign(ws);
      if (result.success) {
        broadcastRoom(ws.roomId, 'game_resigned', { winner: result.winner, reason: result.reason });
      }
      break;
    }

    case 'teach_action': {
      if (!ws.roomId) return;
      const { action, payload } = message;
      const result = roomManager.handleTeachAction(ws, action, payload);
      if (result.success) {
        broadcastRoom(ws.roomId, 'teach_action_done', { action, payload, ...result });
      }
      break;
    }

    case 'request_scoring': {
      if (!ws.roomId) return;
      const result = roomManager.startScoring(ws);
      if (result.success) {
        broadcastRoom(ws.roomId, 'scoring_started', { result: result.result });
      }
      break;
    }

    case 'toggle_dead': {
      if (!ws.roomId) return;
      const { r, c } = message;
      const result = roomManager.toggleDeadStone(ws, r, c);
      if (result.success) {
        broadcastRoom(ws.roomId, 'dead_toggled', { r, c, result: result.result });
      }
      break;
    }

    case 'confirm_scoring': {
      if (!ws.roomId) return;
      const result = roomManager.confirmScoring(ws);
      if (result.success) {
        broadcastRoom(ws.roomId, 'scoring_confirmed', {
          finished: result.finished,
          agreed: result.agreed,
          result: result.result,
          winnerReason: result.winnerReason
        });
      }
      break;
    }

    case 'chat': {
      if (!ws.roomId) return;
      const text = String(message.text || '').slice(0, 100);
      if (text.trim().length === 0) return;

      const clients = [...wss.clients].filter(c => c.roomId === ws.roomId && c.readyState === WebSocket.OPEN);
      for (const client of clients) {
        client.send(JSON.stringify({
          type: 'chat_message',
          sender: ws.playerName || '棋友',
          role: ws.role,
          text,
          time: Date.now()
        }));
      }
      break;
    }
  }
}

// Clock tick loop (every 1s)
setInterval(() => {
  for (const [roomId, room] of roomManager.rooms.entries()) {
    if (room.clocks.active && room.status === 'playing') {
      roomManager.updateClocks(room);
      broadcastRoom(roomId, 'clock_tick');
    }
  }
}, 1000);

// Heartbeat interval (every 30s)
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 围棋在线服务已启动: http://localhost:${PORT}`);
});
