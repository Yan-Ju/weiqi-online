import { Chess } from 'chess.js';

const square = (r, c) => String.fromCharCode(97 + c) + (8 - r);
const coords = s => ({ r: 8 - Number(s[1]), c: s.charCodeAt(0) - 97 });
const clone = value => structuredClone(value);

// A stable room interface around chess.js. Free setup intentionally permits
// incomplete positions; only normal matches use the legal-move engine.
export class ChessRules {
  constructor() {
    this.engine = new Chess();
    this.history = [];
    this.redoStack = [];
    this.captures = { 1: 0, 2: 0 };
    this.sync();
  }
  sync() {
    this.board = this.engine.board().map(row => row.map(p => p ? (p.color === 'w' ? p.type.toUpperCase() : p.type) : 0));
    this.currentTurn = this.engine.turn() === 'w' ? 2 : 1;
  }
  isValidCoord(r, c) { return Number.isInteger(r) && Number.isInteger(c) && r >= 0 && r < 8 && c >= 0 && c < 8; }
  snapshot() { return clone({ board: this.board, currentTurn: this.currentTurn, captures: this.captures }); }
  record(entry, before) { this.history.push({ ...entry, before, after: this.snapshot() }); this.redoStack = []; }
  playMove(r, c, toR, toC, color = this.currentTurn, teach = false, promotion = 'q') {
    if (!this.isValidCoord(r, c) || !this.isValidCoord(toR, toC)) return { success: false, reason: '坐标无效' };
    if (!['q', 'r', 'b', 'n'].includes(promotion)) return { success: false, reason: '升变棋子无效' };
    if (teach) return this.edit('move_piece', { r, c, toR, toC });
    if (color !== this.currentTurn) return { success: false, reason: '未轮到您走棋' };
    const before = this.snapshot();
    let move;
    try { move = this.engine.move({ from: square(r,c), to: square(toR,toC), promotion }); }
    catch { return { success: false, reason: '不合法的走法：请检查走子路线和将军状态' }; }
    this.sync();
    if (move.captured) this.captures[color]++;
    const result = { type: 'move', fromR: r, fromC: c, r: toR, c: toC, color, san: move.san,
      captured: move.captured ? [move.captured] : [], promotion: move.promotion || null };
    this.record(result, before);
    return { success: true, ...result, outcome: this.outcome() };
  }
  outcome() {
    if (this.engine.isCheckmate()) return { winner: this.currentTurn === 2 ? 'black' : 'white', reason: `${this.currentTurn === 2 ? '黑' : '白'}方将死获胜` };
    if (this.engine.isStalemate()) return { winner: 'draw', reason: '逼和：无合法走法且未被将军' };
    if (this.engine.isInsufficientMaterial()) return { winner: 'draw', reason: '和棋：双方子力不足' };
    if (this.engine.isThreefoldRepetition()) return { winner: 'draw', reason: '和棋：三次重复局面' };
    if (this.engine.isDrawByFiftyMoves()) return { winner: 'draw', reason: '和棋：五十回合未吃子或动兵' };
    return null;
  }
  legalMoves() { return this.engine.moves({ verbose: true }).map(m => ({ from: coords(m.from), to: coords(m.to), promotion: m.promotion || null })); }
  edit(action, payload = {}) {
    const before = this.snapshot();
    const { r, c, toR, toC, piece } = payload;
    if (action === 'set_chess_piece') {
      if (!this.isValidCoord(r,c) || !['P','N','B','R','Q','K','p','n','b','r','q','k',0].includes(piece)) return { success: false, reason: '棋子或坐标无效' };
      this.board[r][c] = piece;
    } else if (action === 'move_piece') {
      if (!this.isValidCoord(r,c) || !this.isValidCoord(toR,toC) || !this.board[r][c]) return { success: false, reason: '请选择棋子和目标格' };
      if (r === toR && c === toC) return { success: false, reason: '请选择另一个格子' };
      this.board[toR][toC] = this.board[r][c]; this.board[r][c] = 0;
    } else if (action === 'clear_board') {
      this.board = Array.from({length: 8}, () => Array(8).fill(0)); this.captures = { 1: 0, 2: 0 };
    } else if (action === 'set_turn' && [1,2].includes(payload.color)) {
      this.currentTurn = payload.color;
    } else return { success: false, reason: '摆棋操作无效' };
    this.record({ type: 'setup', action }, before);
    return { success: true };
  }
  undo() {
    const entry = this.history.pop(); if (!entry) return false;
    this.redoStack.push(entry);
    if (entry.type === 'move') this.engine.undo();
    Object.assign(this, clone(entry.before)); return true;
  }
  redo() {
    const entry = this.redoStack.pop(); if (!entry) return false;
    if (entry.type === 'move') this.engine.move(entry.san);
    this.history.push(entry); Object.assign(this, clone(entry.after)); return true;
  }
  jumpToStep(step) {
    if (!Number.isInteger(step) || step < 0 || step > this.history.length + this.redoStack.length) return false;
    while (this.history.length > step) this.undo();
    while (this.history.length < step) this.redo();
    return true;
  }
}
