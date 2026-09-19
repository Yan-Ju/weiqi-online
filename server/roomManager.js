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
    this.cleanupRooms();
    if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('房间设置无效');
    if (this.rooms.size >= 500) throw new Error('房间已满，请稍后重试');
    let roomId = typeof config.roomId === 'string' && /^[A-Z0-9]{4,12}$/.test(config.roomId) ? config.roomId : this.generateRoomId();
    while (this.rooms.has(roomId)) {
      roomId = this.generateRoomId();
    }

    const boardSize = [9, 13, 19].includes(Number(config.boardSize)) ? Number(config.boardSize) : 19;
    const mode = config.mode === 'teach' ? 'teach' : 'match';
    const handicap = Math.min(boardSize === 19 ? 9 : 5, Math.max(0, Math.trunc(Number(config.handicap) || 0)));
    const komi = Number.isFinite(Number(config.komi)) ? Math.min(100, Math.max(0, Number(config.komi))) : 6.5;

    // Time controls: { type: 'none'|'1m10s'|'1m20s'|'15m20s'|'custom', mainTime: seconds, increment: seconds }
    let mainTime = 0;
    let increment = 0;
    if (config.timeControl === '1m10s') { mainTime = 60; increment = 10; }
    else if (config.timeControl === '1m20s') { mainTime = 60; increment = 20; }
    else if (config.timeControl === '15m20s') { mainTime = 900; increment = 20; }
    else if (config.timeControl === 'custom') {
      mainTime = Math.min(86400, Math.max(1, Number(config.customMainTime) || 300));
      increment = Math.min(600, Math.max(0, Number(config.customIncrement ?? 10) || 0));
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
      status: mode === 'teach' ? 'playing' : 'waiting', // waiting, playing, scoring, finished
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
      emptySince: Date.now(),
      newGameAgreed: { black: false, white: false },
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

    if (client.roomId === roomId && (room.players.black === client || room.players.white === client || room.players.spectators.includes(client))) return client.role;
    if (client.roomId) this.leaveRoom(client, { immediate: true });
    room.emptySince = null;
    room.lastActivity = Date.now();
    client.roomId = roomId;
    client.playerName = String(playerName || '棋友').slice(0, 40);

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
    if (room.players.black && room.players.white && ['waiting', 'paused'].includes(room.status)) {
      room.status = 'playing';
      if (room.mode === 'match' && room.timeControl.mainTime > 0) {
        room.clocks.active = true;
        room.clocks.lastTick = Date.now();
      }
    }

    return role;
  }

  leaveRoom(client, { immediate = false } = {}) {
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

    room.newGameAgreed = { black: false, white: false };
    room.scoringState.agreed = { black: false, white: false };
    if (!room.players.black && !room.players.white && room.players.spectators.length === 0) {
      if (immediate) this.rooms.delete(room.roomId);
      else room.emptySince = Date.now();
    }
    if (room.mode === 'match' && room.status === 'playing' && (!room.players.black || !room.players.white)) {
      this.updateClocks(room);
      if (room.status !== 'finished') room.status = 'paused';
      room.clocks.active = false;
    }
  }

  cleanupRooms(now = Date.now()) {
    for (const [id, room] of this.rooms) {
      if (room.emptySince !== null && now - room.emptySince > 60000) this.rooms.delete(id);
    }
  }

  isPlayer(room, client) {
    return !!room && (room.players.black === client || room.players.white === client);
  }

  resetGame(room, size = room.boardSize) {
    room.boardSize = size;
    room.handicap = Math.min(room.handicap, size === 19 ? 9 : 5);
    room.game = new GoRules(size, room.handicap, room.komi);
    room.winner = null;
    room.winnerReason = null;
    room.teachState.annotations = {};
    room.scoringState = { active: false, agreed: { black: false, white: false }, result: null };
    room.newGameAgreed = { black: false, white: false };
    room.status = room.mode === 'teach' || (room.players.black && room.players.white) ? 'playing' : 'waiting';
    room.clocks.blackTime = room.clocks.whiteTime = room.timeControl.mainTime;
    room.clocks.active = room.mode === 'match' && room.status === 'playing' && room.timeControl.mainTime > 0;
    room.clocks.lastTick = Date.now();
  }

  changeBoardSize(client, size) {
    const room = this.rooms.get(client.roomId);
    if (!this.isPlayer(room, client)) return { success: false, reason: '观战者不能更改棋盘' };
    if (![9, 13, 19].includes(size)) return { success: false, reason: '棋盘尺寸无效' };
    if (room.mode === 'match' && (room.game.history.length || room.status === 'scoring' || room.status === 'finished')) return { success: false, reason: '请双方先同意新一局，再切换棋盘' };
    this.resetGame(room, size);
    return { success: true };
  }

  newGame(client) {
    const room = this.rooms.get(client.roomId);
    if (!this.isPlayer(room, client)) return { success: false, reason: '观战者不能重开对局' };
    room.newGameAgreed[client.role] = true;
    if (room.mode === 'teach' || !(room.players.black && room.players.white) || (room.newGameAgreed.black && room.newGameAgreed.white)) {
      this.resetGame(room);
      return { success: true, restarted: true };
    }
    return { success: true, restarted: false };
  }

  resumeGame(client) {
    const room = this.rooms.get(client.roomId);
    if (!this.isPlayer(room, client) || room.status !== 'scoring') return { success: false, reason: '当前不能恢复对局' };
    room.scoringState = { active: false, agreed: { black: false, white: false }, result: null };
    room.game.deadStones = {};
    room.game.consecutivePasses = 0;
    room.status = room.mode === 'teach' || (room.players.black && room.players.white) ? 'playing' : 'paused';
    room.clocks.active = room.status === 'playing' && room.mode === 'match' && room.timeControl.mainTime > 0;
    room.clocks.lastTick = Date.now();
    return { success: true };
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
    if (!this.isPlayer(room, client)) return { success: false, reason: '观战者不能操作对局' };
    if (room.status !== 'playing') {
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

    if (!this.isPlayer(room, client) || room.status !== 'playing') return { success: false, reason: '当前不能停着' };
    this.updateClocks(room);
    if (room.status === 'finished') return { success: false, reason: '对局已超时' };
    const role = client.role;
    if (room.mode === 'match') {
      const currentTurn = room.game.currentTurn;
      const playerColor = role === 'black' ? 1 : role === 'white' ? 2 : null;
      if (playerColor !== currentTurn) {
        return { success: false, reason: '未轮到您停着' };
      }
    }

    const color = room.game.currentTurn;
    if (room.clocks.active) room.clocks[color === 1 ? 'blackTime' : 'whiteTime'] += room.clocks.increment;
    const passRes = room.game.pass(color);
    room.lastActivity = Date.now();
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

    if (!this.isPlayer(room, client) || room.mode !== 'teach') return { success: false, reason: '仅教学参与者可使用此操作' };
    if (action === 'reset') { this.resetGame(room); return { success: true }; }
    if (room.status !== 'playing') return { success: false, reason: '请先返回继续对局' };
    if (!payload || typeof payload !== 'object') return { success: false };
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
    } else if (action === 'jump_to_step') {
      const ok = room.game.jumpToStep(Number(payload.step));
      return { success: ok };
    } else if (action === 'toggle_annotation') {
      const { r, c, type, text } = payload;
      if (!room.game.isValidCoord(r, c) || !['circle', 'triangle', 'square', 'cross', 'text'].includes(type)) return { success: false };
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
    if (!this.isPlayer(room, client) || room.status !== 'playing') return { success: false, reason: '当前不能开始点目' };
    this.updateClocks(room);
    if (room.status === 'finished') return { success: false, reason: '对局已超时' };
    room.game.deadStones = {};
    room.status = 'scoring';
    room.scoringState.active = true;
    room.scoringState.agreed = { black: false, white: false };
    room.scoringState.result = room.game.calculateTerritory();
    room.clocks.active = false;
    return { success: true, result: room.scoringState.result };
  }

  toggleDeadStone(client, r, c) {
    const room = this.rooms.get(client.roomId);
    if (!this.isPlayer(room, client) || room.status !== 'scoring' || !room.scoringState.active) return { success: false, reason: '仅对局参与者可以点目' };

    if (room.game.toggleDeadStone(r, c) === null) return { success: false, reason: '请选择棋盘上的棋子' };
    room.scoringState.agreed = { black: false, white: false };
    room.scoringState.result = room.game.calculateTerritory();

    return { success: true, result: room.scoringState.result };
  }

  confirmScoring(client) {
    const room = this.rooms.get(client.roomId);
    if (!this.isPlayer(room, client) || room.status !== 'scoring' || !room.scoringState.active) return { success: false, reason: '仅对局参与者可以点目' };

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
      lastMove: room.game.history.length > 0 ? (({ type, r, c, color, step }) => ({ type, r, c, color, step }))(room.game.history.at(-1)) : null,
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
      newGameAgreed: room.newGameAgreed,
      teachState: room.teachState,
      scoringState: room.scoringState.active ? {
        active: true,
        result: room.scoringState.result,
        agreed: room.scoringState.agreed
      } : { active: false }
    };
  }
}
