/**
 * GoRules - Complete Go (Weiqi) Rule Engine
 * Supports 9x9, 13x13, 19x19 boards
 * Handles liberties, captures, suicide prevention, Ko rule, handicap, and endgame territory scoring.
 */
export class GoRules {
  constructor(size = 19, handicap = 0, komi = 6.5) {
    this.size = [9, 13, 19].includes(Number(size)) ? Number(size) : 19;
    this.komi = Number(komi) || 6.5;
    this.handicap = Number(handicap) || 0;
    this.reset();
  }

  reset() {
    this.board = Array(this.size).fill(0).map(() => Array(this.size).fill(0)); // 0: empty, 1: black, 2: white
    this.currentTurn = 1; // 1: black, 2: white
    this.captures = { 1: 0, 2: 0 }; // 1: captured by black, 2: captured by white
    this.ko = null; // [r, c] where recapture is forbidden
    this.consecutivePasses = 0;
    this.history = []; // Array of move records
    this.redoStack = []; // For redo support in teaching mode
    this.deadStones = {}; // { 'r,c': true } for scoring

    if (this.handicap > 0) {
      this.applyHandicap(this.handicap);
    }
  }

  // Clone a board matrix
  cloneBoard(board = this.board) {
    return board.map(row => [...row]);
  }

  isValidCoord(r, c) {
    return r >= 0 && r < this.size && c >= 0 && c < this.size;
  }

  getNeighbors(r, c) {
    const neighbors = [];
    if (r > 0) neighbors.push([r - 1, c]);
    if (r < this.size - 1) neighbors.push([r + 1, c]);
    if (c > 0) neighbors.push([r, c - 1]);
    if (c < this.size - 1) neighbors.push([r, c + 1]);
    return neighbors;
  }

  /**
   * Breadth-First Search to find connected chain of stones and its liberties.
   */
  getGroup(r, c, board = this.board) {
    const color = board[r][c];
    if (color === 0) return { stones: [], liberties: [], color: 0 };

    const visitedStones = new Set();
    const libertiesSet = new Set();
    const queue = [[r, c]];
    visitedStones.add(`${r},${c}`);

    while (queue.length > 0) {
      const [currR, currC] = queue.shift();
      const neighbors = this.getNeighbors(currR, currC);

      for (const [nr, nc] of neighbors) {
        const neighborColor = board[nr][nc];
        if (neighborColor === 0) {
          libertiesSet.add(`${nr},${nc}`);
        } else if (neighborColor === color) {
          const key = `${nr},${nc}`;
          if (!visitedStones.has(key)) {
            visitedStones.add(key);
            queue.push([nr, nc]);
          }
        }
      }
    }

    const stones = Array.from(visitedStones).map(key => key.split(',').map(Number));
    const liberties = Array.from(libertiesSet).map(key => key.split(',').map(Number));

    return { stones, liberties, color };
  }

  /**
   * Validate if a move at [r, c] for color is legal.
   */
  canPlaceStone(r, c, color = this.currentTurn) {
    if (!this.isValidCoord(r, c)) {
      return { valid: false, reason: '坐标超出棋盘范围' };
    }
    if (this.board[r][c] !== 0) {
      return { valid: false, reason: '该位置已有棋子' };
    }

    // Ko check
    if (this.ko && this.ko[0] === r && this.ko[1] === c) {
      return { valid: false, reason: '打劫禁全同：不可立即回提' };
    }

    const opponent = color === 1 ? 2 : 1;
    const tempBoard = this.cloneBoard();
    tempBoard[r][c] = color;

    // Check opponent neighbors for capture
    const captured = [];
    const neighbors = this.getNeighbors(r, c);
    const visitedOpponentGroups = new Set();

    for (const [nr, nc] of neighbors) {
      if (tempBoard[nr][nc] === opponent) {
        const key = `${nr},${nc}`;
        if (!visitedOpponentGroups.has(key)) {
          const group = this.getGroup(nr, nc, tempBoard);
          group.stones.forEach(([gr, gc]) => visitedOpponentGroups.add(`${gr},${gc}`));
          if (group.liberties.length === 0) {
            captured.push(...group.stones);
          }
        }
      }
    }

    // Suicide check: if no stones are captured, own group must have >= 1 liberty
    if (captured.length === 0) {
      const ownGroup = this.getGroup(r, c, tempBoard);
      if (ownGroup.liberties.length === 0) {
        return { valid: false, reason: '禁着点（自杀无气）' };
      }
    }

    return { valid: true, captured };
  }

  /**
   * Execute a move. Returns result object.
   */
  playMove(r, c, forcedColor = null, isTeachMode = false) {
    const color = forcedColor || this.currentTurn;
    const check = this.canPlaceStone(r, c, color);

    if (!check.valid) {
      return { success: false, reason: check.reason };
    }

    const prevBoard = this.cloneBoard();
    const prevCaptures = { ...this.captures };
    const prevKo = this.ko ? [...this.ko] : null;
    const prevTurn = this.currentTurn;

    // Place stone
    this.board[r][c] = color;

    // Remove captured stones
    const captured = check.captured;
    if (captured.length > 0) {
      for (const [cr, cc] of captured) {
        this.board[cr][cc] = 0;
      }
      this.captures[color] += captured.length;
    }

    // Update Ko
    // Ko occurs when: exactly 1 stone is captured, placed stone has exactly 1 liberty, and placed stone's group size is 1
    const ownGroup = this.getGroup(r, c);
    if (captured.length === 1 && ownGroup.stones.length === 1 && ownGroup.liberties.length === 1) {
      this.ko = [captured[0][0], captured[0][1]];
    } else {
      this.ko = null;
    }

    this.consecutivePasses = 0;

    // In teaching mode, next turn depends on placementMode; in match mode, alternate turns
    const nextTurn = color === 1 ? 2 : 1;
    this.currentTurn = nextTurn;

    const moveRecord = {
      type: 'move',
      r,
      c,
      color,
      captured,
      ko: this.ko ? [...this.ko] : null,
      prevBoard,
      prevCaptures,
      prevKo,
      prevTurn,
      step: this.history.length + 1
    };

    this.history.push(moveRecord);
    this.redoStack = []; // clear redo on new move

    return {
      success: true,
      r,
      c,
      color,
      captured,
      currentTurn: this.currentTurn,
      step: moveRecord.step
    };
  }

  pass(color = this.currentTurn) {
    this.consecutivePasses += 1;
    this.ko = null;

    const prevTurn = this.currentTurn;
    this.currentTurn = color === 1 ? 2 : 1;

    const moveRecord = {
      type: 'pass',
      color,
      prevBoard: this.cloneBoard(),
      prevCaptures: { ...this.captures },
      prevKo: null,
      prevTurn,
      step: this.history.length + 1
    };

    this.history.push(moveRecord);
    this.redoStack = [];

    const isGameOver = this.consecutivePasses >= 2;
    return {
      success: true,
      color,
      consecutivePasses: this.consecutivePasses,
      isGameOver,
      currentTurn: this.currentTurn
    };
  }

  undo() {
    if (this.history.length === 0) return false;
    const lastMove = this.history.pop();
    this.redoStack.push(lastMove);

    this.board = this.cloneBoard(lastMove.prevBoard);
    this.captures = { ...lastMove.prevCaptures };
    this.ko = lastMove.prevKo ? [...lastMove.prevKo] : null;
    this.currentTurn = lastMove.prevTurn;
    this.consecutivePasses = 0;
    return true;
  }

  redo() {
    if (this.redoStack.length === 0) return false;
    const moveToRedo = this.redoStack.pop();

    if (moveToRedo.type === 'move') {
      this.board[moveToRedo.r][moveToRedo.c] = moveToRedo.color;
      if (moveToRedo.captured && moveToRedo.captured.length > 0) {
        for (const [cr, cc] of moveToRedo.captured) {
          this.board[cr][cc] = 0;
        }
        this.captures[moveToRedo.color] += moveToRedo.captured.length;
      }
      this.ko = moveToRedo.ko ? [...moveToRedo.ko] : null;
      this.currentTurn = moveToRedo.color === 1 ? 2 : 1;
    } else if (moveToRedo.type === 'pass') {
      this.currentTurn = moveToRedo.color === 1 ? 2 : 1;
      this.consecutivePasses += 1;
    }

    this.history.push(moveToRedo);
    return true;
  }

  /**
   * Jump to a specific step (1 to history.length, or 0 for empty board)
   */
  jumpToStep(targetStep) {
    if (targetStep < 0 || targetStep > this.history.length + this.redoStack.length) return false;

    // First undo all to step 0
    const fullHistory = [...this.history, ...this.redoStack.reverse()];
    this.reset();

    for (let i = 0; i < targetStep && i < fullHistory.length; i++) {
      const item = fullHistory[i];
      if (item.type === 'move') {
        this.playMove(item.r, item.c, item.color);
      } else if (item.type === 'pass') {
        this.pass(item.color);
      }
    }

    this.redoStack = fullHistory.slice(targetStep);
    return true;
  }

  applyHandicap(numStones) {
    const starPoints = this.getHandicapPositions(numStones);
    starPoints.forEach(([r, c]) => {
      this.board[r][c] = 1; // Black stones
    });
    // In handicap games, Black places stones first, so White moves first
    this.currentTurn = 2;
  }

  getHandicapPositions(numStones) {
    const n = Math.min(Math.max(Number(numStones), 0), 9);
    if (n < 2) return [];

    if (this.size === 19) {
      const p = {
        tl: [3, 3], tr: [3, 15], bl: [15, 3], br: [15, 15],
        tc: [3, 9], bc: [15, 9], cl: [9, 3], cr: [9, 15],
        c: [9, 9]
      };
      switch (n) {
        case 2: return [p.bl, p.tr];
        case 3: return [p.bl, p.tr, p.br];
        case 4: return [p.bl, p.br, p.tl, p.tr];
        case 5: return [p.bl, p.br, p.tl, p.tr, p.c];
        case 6: return [p.bl, p.br, p.tl, p.tr, p.cl, p.cr];
        case 7: return [p.bl, p.br, p.tl, p.tr, p.cl, p.cr, p.c];
        case 8: return [p.bl, p.br, p.tl, p.tr, p.cl, p.cr, p.tc, p.bc];
        case 9: return [p.bl, p.br, p.tl, p.tr, p.cl, p.cr, p.tc, p.bc, p.c];
        default: return [];
      }
    } else if (this.size === 13) {
      const p = {
        tl: [3, 3], tr: [3, 9], bl: [9, 3], br: [9, 9],
        c: [6, 6]
      };
      switch (n) {
        case 2: return [p.bl, p.tr];
        case 3: return [p.bl, p.tr, p.br];
        case 4: return [p.bl, p.br, p.tl, p.tr];
        case 5: return [p.bl, p.br, p.tl, p.tr, p.c];
        default: return [p.bl, p.br, p.tl, p.tr, p.c];
      }
    } else if (this.size === 9) {
      const p = {
        tl: [2, 2], tr: [2, 6], bl: [6, 2], br: [6, 6],
        c: [4, 4]
      };
      switch (n) {
        case 2: return [p.bl, p.tr];
        case 3: return [p.bl, p.tr, p.br];
        case 4: return [p.bl, p.br, p.tl, p.tr];
        case 5: return [p.bl, p.br, p.tl, p.tr, p.c];
        default: return [p.bl, p.br, p.tl, p.tr, p.c];
      }
    }
    return [];
  }

  toggleDeadStone(r, c) {
    if (this.board[r][c] === 0) return null;
    const group = this.getGroup(r, c);
    const key = `${r},${c}`;
    const willBeDead = !this.deadStones[key];

    for (const [gr, gc] of group.stones) {
      if (willBeDead) {
        this.deadStones[`${gr},${gc}`] = true;
      } else {
        delete this.deadStones[`${gr},${gc}`];
      }
    }
    return willBeDead;
  }

  /**
   * Territory Scoring (终局点目)
   * Evaluates territory for Black and White, taking dead stones into account.
   */
  calculateTerritory() {
    // Virtual board where dead stones are treated as empty
    const vBoard = this.cloneBoard();
    const deadCount = { 1: 0, 2: 0 }; // dead black stones, dead white stones

    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        if (this.deadStones[`${r},${c}`]) {
          deadCount[vBoard[r][c]] += 1;
          vBoard[r][c] = 0; // Empty in territory calculation
        }
      }
    }

    const visited = Array(this.size).fill(0).map(() => Array(this.size).fill(false));
    const territoryMap = {}; // 'r,c' => 1 (black), 2 (white), 0 (dame)
    let blackTerritory = 0;
    let whiteTerritory = 0;
    let dameCount = 0;

    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        if (vBoard[r][c] === 0 && !visited[r][c]) {
          // BFS empty region
          const queue = [[r, c]];
          visited[r][c] = true;
          const region = [[r, c]];
          const borderingColors = new Set();

          while (queue.length > 0) {
            const [cr, cc] = queue.shift();
            const neighbors = this.getNeighbors(cr, cc);

            for (const [nr, nc] of neighbors) {
              const neighborColor = vBoard[nr][nc];
              if (neighborColor === 0) {
                if (!visited[nr][nc]) {
                  visited[nr][nc] = true;
                  queue.push([nr, nc]);
                  region.push([nr, nc]);
                }
              } else {
                borderingColors.add(neighborColor);
              }
            }
          }

          let owner = 0; // dame
          if (borderingColors.size === 1) {
            if (borderingColors.has(1)) owner = 1;
            else if (borderingColors.has(2)) owner = 2;
          }

          for (const [rr, cc] of region) {
            territoryMap[`${rr},${cc}`] = owner;
          }

          if (owner === 1) blackTerritory += region.length;
          else if (owner === 2) whiteTerritory += region.length;
          else dameCount += region.length;
        }
      }
    }

    // Count alive stones on board
    let blackAlive = 0;
    let whiteAlive = 0;
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        if (!this.deadStones[`${r},${c}`]) {
          if (this.board[r][c] === 1) blackAlive += 1;
          else if (this.board[r][c] === 2) whiteAlive += 1;
        }
      }
    }

    // Japanese Territory count (数目法): territory + captures + dead stones of opponent + komi
    const blackJapanese = blackTerritory + this.captures[1] + deadCount[2];
    const whiteJapanese = whiteTerritory + this.captures[2] + deadCount[1] + this.komi;

    // Chinese Area count (数子法): alive stones + territory (dame shared or excluded) + komi
    const blackChinese = blackAlive + blackTerritory;
    const whiteChinese = whiteAlive + whiteTerritory + this.komi;

    const japaneseDiff = +(blackJapanese - whiteJapanese).toFixed(1);
    const chineseDiff = +(blackChinese - whiteChinese).toFixed(1);

    return {
      blackTerritory,
      whiteTerritory,
      dameCount,
      territoryMap,
      deadStones: { ...this.deadStones },
      deadCount,
      blackAlive,
      whiteAlive,
      captures: { ...this.captures },
      komi: this.komi,
      japanese: {
        black: blackJapanese,
        white: whiteJapanese,
        diff: japaneseDiff,
        winner: japaneseDiff > 0 ? 'black' : 'white',
        winnerDesc: japaneseDiff > 0 ? `黑胜 ${Math.abs(japaneseDiff)} 目` : `白胜 ${Math.abs(japaneseDiff)} 目`
      },
      chinese: {
        black: blackChinese,
        white: whiteChinese,
        diff: chineseDiff,
        winner: chineseDiff > 0 ? 'black' : 'white',
        winnerDesc: chineseDiff > 0 ? `黑胜 ${Math.abs(chineseDiff)} 子/目` : `白胜 ${Math.abs(chineseDiff)} 子/目`
      }
    };
  }
}
