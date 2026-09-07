import { GoRules } from './goRules.js';

export class RoomManager {
  constructor() {
    this.rooms = new Map();
  }

  generateRoomId() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let id = '';
    for (let i = 0; i < 6; i++) {
      id += chars[Math.floor(Math.random() * chars.length)];
    }
    return id;
  }

  createRoom(config = {}) {
    let roomId = config.roomId || this.generateRoomId();
    while (this.rooms.has(roomId)) {
      roomId = this.generateRoomId();
    }

    const boardSize = [9, 13, 19].includes(Number(config.boardSize)) ? Number(config.boardSize) : 19;
    const mode = config.mode === 'teach' ? 'teach' : 'match';
    const handicap = Number(config.handicap) || 0;
    const komi = config.komi !== undefined ? Number(config.komi) : 6.5;

    // Time controls: { type: 'none'|'1m10s'|'1m20s'|'15m20s'|'custom', mainTime: seconds, increment: seconds }
    let mainTime = 0;
    let increment = 0;
    if (config.timeControl === '1m10s') { mainTime = 60; increment = 10; }
    else if (config.timeControl === '1m20s') { mainTime = 60; increment = 20; }
    else if (config.timeControl === '15m20s') { mainTime = 900; increment = 20; }
    else if (config.timeControl === 'custom') {
      mainTime = Number(config.customMainTime) || 300;
      increment = Number(config.customIncrement) || 10;
    }

    const game = new GoRules(boardSize, handicap, komi);

    const room = {
      roomId,
      mode,
      boardSize,
      handicap,
      komi,
      timeControl: {
        type: config.timeControl || 'none',
        mainTime,
        increment
      },
      creatorColorPref: config.colorPref || 'black', // 'black', 'white', 'random'
      game,
      status: 'waiting', // waiting, playing, scoring, finished
      winner: null,
      winnerReason: null,
      players: {
        black: null,
        white: null,
        spectators: []
      },
      teachState: {
        placementMode: 'alternate', // 'alternate', 'black_only', 'white_only'
        annotations: {}
      },
      clocks: {
        blackTime: mainTime,
        whiteTime: mainTime,
        increment,
        active: false,
        lastTick: null
      },
      scoringState: {
        active: false,
        agreed: { black: false, white: false },
        result: null
      },
      createdAt: Date.now(),
      lastActivity: Date.now()
    };

    this.rooms.set(roomId, room);
    return room;
  }

  getRoom(roomId) {
    return this.rooms.get(roomId);
  }

  joinRoom(roomId, client, playerName = '棋友') {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    room.lastActivity = Date.now();
    client.roomId = roomId;
    client.playerName = playerName;

    // Assign role
    let role = 'spectator';
    const pref = room.creatorColorPref;

    if (!room.players.black && !room.players.white) {
      // First player joining
      if (pref === 'white') {
        room.players.white = client;
        client.role = 'white';
        role = 'white';
      } else if (pref === 'random') {
        const isB = Math.random() < 0.5;
        if (isB) {
          room.players.black = client;
          client.role = 'black';
          role = 'black';
        } else {
          room.players.white = client;
          client.role = 'white';
          role = 'white';
        }
      } else {
        // default black
        room.players.black = client;
        client.role = 'black';
        role = 'black';
      }
    } else if (!room.players.black && client !== room.players.white) {
      room.players.black = client;
      client.role = 'black';
      role = 'black';
    } else if (!room.players.white && client !== room.players.black) {
      room.players.white = client;
      client.role = 'white';
      role = 'white';
    } else {
      // Spectator
      client.role = 'spectator';
      role = 'spectator';
      if (!room.players.spectators.includes(client)) {
        room.players.spectators.push(client);
      }
    }

    // If both players are seated, status becomes 'playing'
    if (room.players.black && room.players.white && room.status === 'waiting') {
      room.status = 'playing';
      if (room.timeControl.mainTime > 0) {
        room.clocks.active = true;
        room.clocks.lastTick = Date.now();
      }
    }

    return role;
  }

  leaveRoom(client) {
    if (!client.roomId) return;
    const room = this.rooms.get(client.roomId);
    if (!room) return;

    if (room.players.black === client) {
      room.players.black = null;
    } else if (room.players.white === client) {
      room.players.white = null;
    } else {
      room.players.spectators = room.players.spectators.filter(c => c !== client);
    }

    client.roomId = null;
    client.role = null;

    // If both left and empty, mark for deletion or keep briefly
    if (!room.players.black && !room.players.white && room.players.spectators.length === 0) {
      setTimeout(() => {
        if (!room.players.black && !room.players.white && room.players.spectators.length === 0) {
          this.rooms.delete(room.roomId);
        }
      }, 10 * 60 * 1000); // 10 minutes grace period
    }
  }

  updateClocks(room) {
    if (!room.clocks.active || room.status !== 'playing') return;
    const now = Date.now();
    if (!room.clocks.lastTick) {
      room.clocks.lastTick = now;
      return;
    }

    const elapsed = (now - room.clocks.lastTick) / 1000;
    room.clocks.lastTick = now;

    const turn = room.game.currentTurn; // 1: black, 2: white
    if (turn === 1) {
      room.clocks.blackTime = Math.max(0, room.clocks.blackTime - elapsed);
      if (room.clocks.blackTime === 0) {
        room.status = 'finished';
        room.winner = 'white';
        room.winnerReason = '黑方超时负';
        room.clocks.active = false;
      }
    } else {
      room.clocks.whiteTime = Math.max(0, room.clocks.whiteTime - elapsed);
      if (room.clocks.whiteTime === 0) {
        room.status = 'finished';
        room.winner = 'black';
        room.winnerReason = '白方超时负';
        room.clocks.active = false;
      }
    }
  }

  handleMove(client, r, c) {
    const room = this.rooms.get(client.roomId);
    if (!room) return { success: false, reason: '房间不存在' };
    if (room.status !== 'playing' && room.mode !== 'teach') {
      return { success: false, reason: '当前非对局状态' };
    }

    const role = client.role;
    let forcedColor = null;

    if (room.mode === 'match') {
      // In match mode, must be the player's turn
      const currentTurn = room.game.currentTurn; // 1: Black, 2: White
      const playerColor = role === 'black' ? 1 : role === 'white' ? 2 : null;
      if (playerColor !== currentTurn) {
        return { success: false, reason: '未轮到您落子' };
      }
      forcedColor = playerColor;
    } else {
      // Teach mode: both players can place stones; follow placementMode
      if (room.teachState.placementMode === 'black_only') {
        forcedColor = 1;
      } else if (room.teachState.placementMode === 'white_only') {
        forcedColor = 2;
      } else {
        forcedColor = room.game.currentTurn;
      }
    }

    // Deduct time and add increment in match mode
    this.updateClocks(room);
    if (room.status === 'finished') {
      return { success: false, reason: '对局已超时结束' };
    }

    const moveRes = room.game.playMove(r, c, forcedColor, room.mode === 'teach');
    if (!moveRes.success) {
      return moveRes;
    }

    // In match mode with increment, add increment to current player
    if (room.mode === 'match' && room.clocks.active && room.clocks.increment > 0) {
      if (forcedColor === 1) {
        room.clocks.blackTime += room.clocks.increment;
      } else {
        room.clocks.whiteTime += room.clocks.increment;
      }
    }
    room.clocks.lastTick = Date.now();
    room.lastActivity = Date.now();

    return {
      success: true,
      move: moveRes
    };
  }

  handlePass(client) {
    const room = this.rooms.get(client.roomId);
    if (!room) return { success: false, reason: '房间不存在' };

    const role = client.role;
    if (room.mode === 'match') {
      const currentTurn = room.game.currentTurn;
      const playerColor = role === 'black' ? 1 : role === 'white' ? 2 : null;
      if (playerColor !== currentTurn) {
        return { success: false, reason: '未轮到您停着' };
      }
    }

    const passRes = room.game.pass(room.game.currentTurn);
    if (passRes.isGameOver) {
      // Enter scoring mode
      room.status = 'scoring';
      room.scoringState.active = true;
      room.scoringState.agreed = { black: false, white: false };
      room.scoringState.result = room.game.calculateTerritory();
      room.clocks.active = false;
    }

    return { success: true, pass: passRes, isGameOver: passRes.isGameOver };
  }

  handleResign(client) {
    const room = this.rooms.get(client.roomId);
    if (!room || room.status !== 'playing') return { success: false };

    const role = client.role;
    if (role !== 'black' && role !== 'white') return { success: false };

    room.status = 'finished';
    room.winner = role === 'black' ? 'white' : 'black';
    room.winnerReason = `${role === 'black' ? '黑方' : '白方'}认输，${room.winner === 'black' ? '黑方' : '白方'}中盘胜`;
    room.clocks.active = false;

    return { success: true, winner: room.winner, reason: room.winnerReason };
  }

  handleTeachAction(client, action, payload = {}) {
    const room = this.rooms.get(client.roomId);
    if (!room) return { success: false };

    if (action === 'set_placement_mode') {
      if (['alternate', 'black_only', 'white_only'].includes(payload.mode)) {
        room.teachState.placementMode = payload.mode;
        return { success: true, placementMode: payload.mode };
      }
    } else if (action === 'undo') {
      const ok = room.game.undo();
      return { success: ok };
    } else if (action === 'redo') {
      const ok = room.game.redo();
      return { success: ok };
    } else if (action === 'reset') {
      room.game.reset();
      room.teachState.annotations = {};
      return { success: true };
    } else if (action === 'jump_to_step') {
      const ok = room.game.jumpToStep(Number(payload.step));
      return { success: ok };
    } else if (action === 'toggle_annotation') {
      const { r, c, type, text } = payload;
      const key = `${r},${c}`;
      if (room.teachState.annotations[key] && room.teachState.annotations[key].type === type) {
        delete room.teachState.annotations[key];
      } else {
        room.teachState.annotations[key] = { type, text };
      }
      return { success: true, annotations: room.teachState.annotations };
    }

    return { success: false };
  }

  startScoring(client) {
    const room = this.rooms.get(client.roomId);
    if (!room) return { success: false };
    room.status = 'scoring';
    room.scoringState.active = true;
    room.scoringState.agreed = { black: false, white: false };
    room.scoringState.result = room.game.calculateTerritory();
    room.clocks.active = false;
    return { success: true, result: room.scoringState.result };
  }

  toggleDeadStone(client, r, c) {
    const room = this.rooms.get(client.roomId);
    if (!room || !room.scoringState.active) return { success: false };

    room.game.toggleDeadStone(r, c);
    room.scoringState.agreed = { black: false, white: false };
    room.scoringState.result = room.game.calculateTerritory();

    return { success: true, result: room.scoringState.result };
  }

  confirmScoring(client) {
    const room = this.rooms.get(client.roomId);
    if (!room || !room.scoringState.active) return { success: false };

    const role = client.role;
    if (role === 'black' || role === 'white') {
      room.scoringState.agreed[role] = true;
    }

    // In teach mode, 1 confirmation is enough, or in match mode both agree
    const bothAgreed = room.mode === 'teach' 
      ? true 
      : (room.scoringState.agreed.black && room.scoringState.agreed.white);

    if (bothAgreed) {
      room.status = 'finished';
      room.scoringState.active = false;
      const res = room.scoringState.result;
      room.winner = res.japanese.winner;
      room.winnerReason = `终局数子：${res.japanese.winnerDesc} (日规) / ${res.chinese.winnerDesc} (中规)`;
      return { success: true, finished: true, result: res, winnerReason: room.winnerReason };
    }

    return { success: true, finished: false, agreed: room.scoringState.agreed };
  }

  getRoomSnapshot(roomId, client = null) {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    this.updateClocks(room);

    return {
      roomId: room.roomId,
      mode: room.mode,
      boardSize: room.boardSize,
      handicap: room.handicap,
      komi: room.komi,
      timeControl: room.timeControl,
      status: room.status,
      winner: room.winner,
      winnerReason: room.winnerReason,
      board: room.game.board,
      currentTurn: room.game.currentTurn,
      captures: room.game.captures,
      ko: room.game.ko,
      stepCount: room.game.history.length,
      historyLength: room.game.history.length,
      redoLength: room.game.redoStack.length,
      lastMove: room.game.history.length > 0 ? room.game.history[room.game.history.length - 1] : null,
      players: {
        black: room.players.black ? { name: room.players.black.playerName } : null,
        white: room.players.white ? { name: room.players.white.playerName } : null,
        spectatorsCount: room.players.spectators.length
      },
      myRole: client ? client.role : 'spectator',
      moveNumbersMap: (() => {
        const map = {};
        room.game.history.forEach((m, idx) => {
          if (m.type === 'move') {
            map[`${m.r},${m.c}`] = idx + 1;
          }
        });
        return map;
      })(),
      clocks: {
        blackTime: Math.ceil(room.clocks.blackTime),
        whiteTime: Math.ceil(room.clocks.whiteTime),
        active: room.clocks.active
      },
      teachState: room.teachState,
      scoringState: room.scoringState.active ? {
        active: true,
        result: room.scoringState.result,
        agreed: room.scoringState.agreed
      } : { active: false }
    };
  }
}
