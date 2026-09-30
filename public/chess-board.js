const NAMES = { k:'王', q:'后', r:'车', b:'象', n:'马', p:'兵' };
import { PIECE_PATHS } from './chess-pieces.js';
import { renderAnnotations } from './annotations.js';
export function pieceSVG(piece) {
  return `<svg viewBox="0 0 100 100" class="chess-piece" aria-hidden="true">${PIECE_PATHS[piece] || ''}</svg>`;
}
export class ChessBoard {
  constructor(containerId, { onIntersectionClick } = {}) {
    this.container = document.getElementById(containerId); this.onIntersectionClick = onIntersectionClick;
    this.size = 8; this.board = Array.from({length:8}, () => Array(8).fill(0));
    this.selected = null; this.legalMoves = []; this.interactive = true; this.flipped = false;
    this.frame = document.createElement('div'); this.frame.className = 'chess-frame';
    this.root = document.createElement('div'); this.root.className = 'chess-board'; this.root.setAttribute('role','group'); this.root.setAttribute('aria-label','国际象棋棋盘');
    this.frame.append(this.root);
    this.annotationLayer = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.annotationLayer.setAttribute('viewBox', '0 0 800 800');
    this.annotationLayer.setAttribute('class', 'chess-annotations');
    this.annotationLayer.setAttribute('aria-hidden', 'true');
    this.frame.append(this.annotationLayer);
    this.annotations = {};
    this.container.replaceChildren(this.frame);
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
    this.board=board; this.annotations=options.annotations || {}; Object.assign(this,{lastMove:options.lastMove,legalMoves:options.legalMoves || [],interactive:options.interactive});
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
      cell.classList.toggle('last-move',!this.annotations[`${r},${c}`] && this.lastMove?.type==='move' && ((this.lastMove.r===r && this.lastMove.c===c)||(this.lastMove.fromR===r && this.lastMove.fromC===c)));
      cell.setAttribute('aria-label',`${String.fromCharCode(97+c)}${8-r} ${piece ? (piece===piece.toUpperCase() ? '白' : '黑')+NAMES[piece.toLowerCase()] : '空格'}`);
      cell.setAttribute('aria-pressed',String(this.selected?.r===r && this.selected?.c===c));
    }
    renderAnnotations(this.annotationLayer, this.annotations, this.board, {
      coord: (r,c) => ({x:(this.flipped ? 7-c : c)*100+50, y:(this.flipped ? 7-r : r)*100+55}),
      radius: 34, halo: true
    });
  }
}
