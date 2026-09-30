const NAMES = { k:'王', q:'后', r:'车', b:'象', n:'马', p:'兵' };
const SHAPES = {
  p: '<circle cx="50" cy="26" r="11"/><path d="M42 37h16l-3 12q0 11 9 21H36q9-10 9-21z"/><path d="M34 70h32l4 9H30z"/>',
  r: '<path d="M29 18h10v10h7V18h8v10h7V18h10v22l-10 6 3 23H36l3-23-10-6z"/><path d="M33 69h34l4 11H29z"/><path d="M37 40h26" fill="none"/>',
  b: '<path d="M50 12c-10 10-20 17-20 28 0 9 9 15 20 15s20-6 20-15c0-11-10-18-20-28z"/><path d="M53 22l-9 19" fill="none"/><path d="M41 55h18l-3 7 7 10H37l7-10zM33 72h34l4 8H29z"/>',
  n: '<path d="M36 17l8 9 12-5 11 10q13 20 0 39H34q-1-12 12-25l-14 7-11-7 12-17z"/><path d="M54 35q11 13 0 26M31 43l6-3" fill="none"/><circle cx="43" cy="33" r="2.3" fill="currentColor"/><path d="M32 70h36l4 10H28z"/>',
  q: '<path d="M25 28l13 11 12-18 12 18 13-11-9 28H34z"/><circle cx="25" cy="24" r="4"/><circle cx="50" cy="17" r="4"/><circle cx="75" cy="24" r="4"/><path d="M35 56h30l-7 9 7 7H35l7-7zM31 73h38l4 8H27z"/>',
  k: '<path d="M47 10h6v7h8v6h-8v8h-6v-8h-8v-6h8z"/><path d="M50 32c-20-17-34 3-21 15l9 10h24l9-10c13-12-1-32-21-15z"/><path d="M38 57h24l-5 8 9 8H34l9-8zM31 73h38l4 8H27z"/>'
};
export function pieceSVG(piece, id) {
  const white = piece === piece.toUpperCase();
  const fill = white ? '#f4f4f1' : '#687078';
  const stroke = white ? '#8b9294' : '#3d444a';
  return `<svg viewBox="0 0 100 100" class="chess-piece" aria-hidden="true"><ellipse cx="51" cy="85" rx="27" ry="5" fill="#263238" opacity=".18"/><g fill="${fill}" stroke="${stroke}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round">${SHAPES[piece.toLowerCase()]}<path d="M29 81h42l3 5H26z"/></g></svg>`;
}
export class ChessBoard {
  constructor(containerId, { onIntersectionClick } = {}) {
    this.container = document.getElementById(containerId); this.onIntersectionClick = onIntersectionClick;
    this.size = 8; this.board = Array.from({length:8}, () => Array(8).fill(0));
    this.selected = null; this.legalMoves = []; this.interactive = true; this.flipped = false;
    this.frame = document.createElement('div'); this.frame.className = 'chess-frame';
    this.root = document.createElement('div'); this.root.className = 'chess-board'; this.root.setAttribute('role','group'); this.root.setAttribute('aria-label','国际象棋棋盘');
    this.frame.append(this.root); this.container.replaceChildren(this.frame);
    this.cells = [];
    for (let r=0;r<8;r++) for (let c=0;c<8;c++) {
      const cell = document.createElement('button'); cell.type='button'; cell.className=`chess-cell ${(r+c)%2 ? 'dark' : 'light'}`;
      cell.dataset.r=r; cell.dataset.c=c;
      cell.addEventListener('click',() => { if (this.interactive) this.onIntersectionClick?.(r,c); });
      cell.addEventListener('keydown',e => { const d={ArrowUp:-8,ArrowDown:8,ArrowLeft:-1,ArrowRight:1}[e.key]; if (d) { e.preventDefault(); this.cells[Math.max(0,Math.min(63,r*8+c+(this.flipped ? -d : d)))].focus(); } });
      this.root.append(cell); this.cells.push(cell);
    }
    this.render();
  }
  select(r,c) { this.selected={r,c}; this.render(); }
  clearSelection() { this.selected=null; this.render(); }
  flip() { this.flipped=!this.flipped; this.render(); }
  updateState(board, options={}) {
    this.board=board; Object.assign(this,{lastMove:options.lastMove,legalMoves:options.legalMoves || [],interactive:options.interactive});
    if (options.clearSelection) this.selected=null;
    this.render();
  }
  render() {
    for(let r=0;r<8;r++) for(let c=0;c<8;c++) {
      const cell=this.cells[r*8+c], piece=this.board[r]?.[c] || 0;
      const file=this.flipped ? r===0 : r===7;
      cell.style.order=this.flipped ? 63-(r*8+c) : r*8+c;
      cell.innerHTML = (piece ? pieceSVG(piece,`cell-${r}-${c}`) : '') + `<span class="square-label">${(!this.flipped && c===0 || this.flipped && c===7) ? 8-r : ''}</span><span class="file-label">${file ? String.fromCharCode(97+c) : ''}</span>`;
      cell.classList.toggle('selected',this.selected?.r===r && this.selected?.c===c);
      const legal=this.selected && this.legalMoves.some(m => m.from.r===this.selected.r && m.from.c===this.selected.c && m.to.r===r && m.to.c===c);
      cell.classList.toggle('legal-target',!!legal); cell.classList.toggle('occupied',!!piece);
      cell.classList.toggle('last-move',this.lastMove?.type==='move' && ((this.lastMove.r===r && this.lastMove.c===c)||(this.lastMove.fromR===r && this.lastMove.fromC===c)));
      cell.setAttribute('aria-label',`${String.fromCharCode(97+c)}${8-r} ${piece ? (piece===piece.toUpperCase() ? '白' : '黑')+NAMES[piece.toLowerCase()] : '空格'}`);
      cell.setAttribute('aria-pressed',String(this.selected?.r===r && this.selected?.c===c));
    }
  }
}
