/**
 * GoBoardSVG - High quality SVG Go Board renderer
 * Supports 9x9, 13x13, 19x19 boards, realistic 3D stones, hover previews,
 * coordinate labels, move numbers, dead stone markers, and territory squares.
 */
export class GoBoardSVG {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    this.size = options.size || 19;
    this.interactive = options.interactive !== false;
    this.onIntersectionClick = options.onIntersectionClick || null;
    this.onHoverChange = options.onHoverChange || null;

    this.board = Array(this.size).fill(0).map(() => Array(this.size).fill(0));
    this.lastMove = null; // { r, c, color }
    this.hoverPos = null; // { r, c }
    this.hoverColor = 1;
    this.showMoveNumbers = false;
    this.moveNumbersMap = {}; // 'r,c' => number
    this.deadStones = {}; // 'r,c' => boolean
    this.territoryMap = null; // 'r,c' => 1 (black), 2 (white), 0 (dame)
    this.annotations = {}; // 'r,c' => { type, text }

    this.letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T'];

    this.initSVG();
  }

  setSize(size) {
    this.size = [9, 13, 19].includes(Number(size)) ? Number(size) : 19;
    this.board = Array(this.size).fill(0).map(() => Array(this.size).fill(0));
    this.lastMove = null;
    this.hoverPos = null;
    this.moveNumbersMap = {};
    this.deadStones = {};
    this.territoryMap = null;
    this.annotations = {};
    this.initSVG();
  }

  initSVG() {
    if (!this.container) return;
    this.container.innerHTML = '';

    // Calculate dimensions
    // We use a base coordinate system of 800x800 for crisp SVG scaling
    this.svgWidth = 800;
    this.svgHeight = 800;
    this.padding = 48; // Margin for coordinates
    this.boardWidth = this.svgWidth - this.padding * 2;
    this.cellSize = this.boardWidth / (this.size - 1);
    this.stoneRadius = this.cellSize * 0.48;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${this.svgWidth} ${this.svgHeight}`);
    svg.setAttribute('class', 'go-board-svg');

    // Defs: Gradients and Filters
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    defs.innerHTML = `
      <!-- Board Wood Grain Gradient -->
      <radialGradient id="boardBgGrad" cx="45%" cy="40%" r="70%">
        <stop offset="0%" stop-color="#dfb476" />
        <stop offset="70%" stop-color="#cb9f5b" />
        <stop offset="100%" stop-color="#b68943" />
      </radialGradient>

      <!-- Board Outer Shadow -->
      <filter id="boardShadow" x="-10%" y="-10%" width="125%" height="125%">
        <feDropShadow dx="0" dy="6" stdDeviation="10" flood-color="#140b03" flood-opacity="0.5" />
      </filter>

      <!-- Stone Drop Shadow -->
      <filter id="stoneShadow" x="-20%" y="-20%" width="145%" height="145%">
        <feDropShadow dx="1.5" dy="2.5" stdDeviation="2" flood-color="#000000" flood-opacity="0.45" />
      </filter>

      <!-- 3D Black Stone Radial Gradient -->
      <radialGradient id="blackStoneGrad" cx="35%" cy="30%" r="65%">
        <stop offset="0%" stop-color="#555555" />
        <stop offset="35%" stop-color="#2a2a2a" />
        <stop offset="85%" stop-color="#111111" />
        <stop offset="100%" stop-color="#050505" />
      </radialGradient>

      <!-- 3D White Stone Radial Gradient -->
      <radialGradient id="whiteStoneGrad" cx="30%" cy="25%" r="70%">
        <stop offset="0%" stop-color="#ffffff" />
        <stop offset="60%" stop-color="#f2ede4" />
        <stop offset="90%" stop-color="#d8d1c3" />
        <stop offset="100%" stop-color="#b8b0a0" />
      </radialGradient>

      <!-- Ghost Black -->
      <radialGradient id="ghostBlack" cx="35%" cy="30%" r="65%">
        <stop offset="0%" stop-color="#555555" stop-opacity="0.6" />
        <stop offset="100%" stop-color="#111111" stop-opacity="0.6" />
      </radialGradient>

      <!-- Ghost White -->
      <radialGradient id="ghostWhite" cx="30%" cy="25%" r="70%">
        <stop offset="0%" stop-color="#ffffff" stop-opacity="0.75" />
        <stop offset="100%" stop-color="#d8d1c3" stop-opacity="0.75" />
      </radialGradient>
    `;
    svg.appendChild(defs);

    // Board Base Rectangle
    const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bgRect.setAttribute('x', '0');
    bgRect.setAttribute('y', '0');
    bgRect.setAttribute('width', this.svgWidth);
    bgRect.setAttribute('height', this.svgHeight);
    bgRect.setAttribute('rx', '14');
    bgRect.setAttribute('fill', 'url(#boardBgGrad)');
    bgRect.setAttribute('filter', 'url(#boardShadow)');
    svg.appendChild(bgRect);

    // Inner Board Border
    const borderRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    borderRect.setAttribute('x', this.padding - 12);
    borderRect.setAttribute('y', this.padding - 12);
    borderRect.setAttribute('width', this.boardWidth + 24);
    borderRect.setAttribute('height', this.boardWidth + 24);
    borderRect.setAttribute('fill', 'none');
    borderRect.setAttribute('stroke', '#825c27');
    borderRect.setAttribute('stroke-width', '2');
    borderRect.setAttribute('opacity', '0.6');
    svg.appendChild(borderRect);

    // Grid lines group
    const gridGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    gridGroup.setAttribute('stroke', '#362413');
    gridGroup.setAttribute('stroke-linecap', 'round');

    for (let i = 0; i < this.size; i++) {
      const pos = this.padding + i * this.cellSize;
      const isEdge = i === 0 || i === this.size - 1;
      const strokeW = isEdge ? '2.4' : '1.4';

      // Horizontal line
      const hLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      hLine.setAttribute('x1', this.padding);
      hLine.setAttribute('y1', pos);
      hLine.setAttribute('x2', this.svgWidth - this.padding);
      hLine.setAttribute('y2', pos);
      hLine.setAttribute('stroke-width', strokeW);
      gridGroup.appendChild(hLine);

      // Vertical line
      const vLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      vLine.setAttribute('x1', pos);
      vLine.setAttribute('y1', this.padding);
      vLine.setAttribute('x2', pos);
      vLine.setAttribute('y2', this.svgHeight - this.padding);
      vLine.setAttribute('stroke-width', strokeW);
      gridGroup.appendChild(vLine);
    }
    svg.appendChild(gridGroup);

    // Star points (Hoshi)
    const starPoints = this.getStarPoints();
    starPoints.forEach(([r, c]) => {
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', this.padding + c * this.cellSize);
      circle.setAttribute('cy', this.padding + r * this.cellSize);
      circle.setAttribute('r', this.size === 19 ? '4.2' : '3.6');
      circle.setAttribute('fill', '#362413');
      svg.appendChild(circle);
    });

    // Coordinates Labels
    this.renderCoordinates(svg);

    // Dynamic Layers
    this.territoryLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    svg.appendChild(this.territoryLayer);

    this.stonesLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    svg.appendChild(this.stonesLayer);

    this.markersLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    svg.appendChild(this.markersLayer);

    this.ghostLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    svg.appendChild(this.ghostLayer);

    // Interactive Hitbox Layer
    this.hitboxLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', this.padding + c * this.cellSize - this.cellSize / 2);
        rect.setAttribute('y', this.padding + r * this.cellSize - this.cellSize / 2);
        rect.setAttribute('width', this.cellSize);
        rect.setAttribute('height', this.cellSize);
        rect.setAttribute('fill', 'transparent');
        rect.setAttribute('cursor', 'pointer');

        rect.addEventListener('click', (e) => {
          e.stopPropagation();
          if (this.interactive && this.onIntersectionClick) {
            this.onIntersectionClick(r, c);
          }
        });

        rect.addEventListener('mouseenter', () => {
          this.hoverPos = { r, c };
          this.renderGhost();
          if (this.onHoverChange) this.onHoverChange(r, c);
        });

        this.hitboxLayer.appendChild(rect);
      }
    }

    svg.addEventListener('mouseleave', () => {
      this.hoverPos = null;
      this.renderGhost();
      if (this.onHoverChange) this.onHoverChange(null, null);
    });

    svg.appendChild(this.hitboxLayer);
    this.svg = svg;
    this.container.appendChild(svg);

    this.render();
  }

  getStarPoints() {
    if (this.size === 19) {
      return [
        [3, 3], [3, 9], [3, 15],
        [9, 3], [9, 9], [9, 15],
        [15, 3], [15, 9], [15, 15]
      ];
    } else if (this.size === 13) {
      return [
        [3, 3], [3, 9],
        [6, 6],
        [9, 3], [9, 9]
      ];
    } else if (this.size === 9) {
      return [
        [2, 2], [2, 6],
        [4, 4],
        [6, 2], [6, 6]
      ];
    }
    return [];
  }

  renderCoordinates(svg) {
    const textGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    textGroup.setAttribute('fill', '#4f3318');
    textGroup.setAttribute('font-family', 'ui-monospace, Consolas, "PingFang SC", sans-serif');
    textGroup.setAttribute('font-size', this.size === 19 ? '15' : '17');
    textGroup.setAttribute('font-weight', '700');
    textGroup.setAttribute('text-anchor', 'middle');
    textGroup.setAttribute('dominant-baseline', 'central');

    for (let i = 0; i < this.size; i++) {
      const letter = this.letters[i];
      const number = String(this.size - i);
      const pos = this.padding + i * this.cellSize;

      // Top Letter
      const tLetter = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      tLetter.setAttribute('x', pos);
      tLetter.setAttribute('y', this.padding - 26);
      tLetter.textContent = letter;
      textGroup.appendChild(tLetter);

      // Bottom Letter
      const bLetter = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      bLetter.setAttribute('x', pos);
      bLetter.setAttribute('y', this.svgHeight - this.padding + 26);
      bLetter.textContent = letter;
      textGroup.appendChild(bLetter);

      // Left Number
      const lNum = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      lNum.setAttribute('x', this.padding - 26);
      lNum.setAttribute('y', pos);
      lNum.textContent = number;
      textGroup.appendChild(lNum);

      // Right Number
      const rNum = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      rNum.setAttribute('x', this.svgWidth - this.padding + 26);
      rNum.setAttribute('y', pos);
      rNum.textContent = number;
      textGroup.appendChild(rNum);
    }
    svg.appendChild(textGroup);
  }

  updateState(board, options = {}) {
    this.board = board;
    if (options.lastMove !== undefined) this.lastMove = options.lastMove;
    if (options.hoverColor !== undefined) this.hoverColor = options.hoverColor;
    if (options.moveNumbersMap !== undefined) this.moveNumbersMap = options.moveNumbersMap;
    if (options.deadStones !== undefined) this.deadStones = options.deadStones;
    if (options.territoryMap !== undefined) this.territoryMap = options.territoryMap;
    if (options.annotations !== undefined) this.annotations = options.annotations;
    if (options.interactive !== undefined) this.interactive = options.interactive;

    this.render();
  }

  render() {
    this.renderStones();
    this.renderTerritory();
    this.renderMarkers();
    this.renderGhost();
  }

  renderStones() {
    this.stonesLayer.innerHTML = '';

    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        const color = this.board[r][c];
        if (color === 0) continue;

        const cx = this.padding + c * this.cellSize;
        const cy = this.padding + r * this.cellSize;
        const isDead = !!this.deadStones[`${r},${c}`];

        const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        if (isDead) {
          group.setAttribute('opacity', '0.45');
        }

        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', cx);
        circle.setAttribute('cy', cy);
        circle.setAttribute('r', this.stoneRadius);
        circle.setAttribute('fill', color === 1 ? 'url(#blackStoneGrad)' : 'url(#whiteStoneGrad)');
        circle.setAttribute('filter', 'url(#stoneShadow)');
        group.appendChild(circle);

        // Move number or dead stone X
        if (isDead) {
          const cross = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          cross.setAttribute('x', cx);
          cross.setAttribute('y', cy);
          cross.setAttribute('fill', '#e53935');
          cross.setAttribute('font-size', this.stoneRadius * 1.2);
          cross.setAttribute('font-weight', '900');
          cross.setAttribute('text-anchor', 'middle');
          cross.setAttribute('dominant-baseline', 'central');
          cross.textContent = '✕';
          group.appendChild(cross);
        } else if (this.showMoveNumbers && this.moveNumbersMap[`${r},${c}`]) {
          const num = this.moveNumbersMap[`${r},${c}`];
          const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          text.setAttribute('x', cx);
          text.setAttribute('y', cy);
          text.setAttribute('fill', color === 1 ? '#ffffff' : '#111111');
          text.setAttribute('font-size', this.stoneRadius * 0.9);
          text.setAttribute('font-weight', 'bold');
          text.setAttribute('font-family', 'system-ui, sans-serif');
          text.setAttribute('text-anchor', 'middle');
          text.setAttribute('dominant-baseline', 'central');
          text.textContent = num;
          group.appendChild(text);
        }

        this.stonesLayer.appendChild(group);
      }
    }
  }

  renderTerritory() {
    this.territoryLayer.innerHTML = '';
    if (!this.territoryMap) return;

    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        const owner = this.territoryMap[`${r},${c}`];
        if (owner === 1 || owner === 2) {
          const cx = this.padding + c * this.cellSize;
          const cy = this.padding + r * this.cellSize;
          const sqSize = this.cellSize * 0.42;

          const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
          rect.setAttribute('x', cx - sqSize / 2);
          rect.setAttribute('y', cy - sqSize / 2);
          rect.setAttribute('width', sqSize);
          rect.setAttribute('height', sqSize);
          rect.setAttribute('rx', '2');
          rect.setAttribute('fill', owner === 1 ? '#111111' : '#ffffff');
          rect.setAttribute('fill-opacity', '0.75');
          rect.setAttribute('stroke', owner === 1 ? '#555' : '#888');
          rect.setAttribute('stroke-width', '1');
          this.territoryLayer.appendChild(rect);
        }
      }
    }
  }

  renderMarkers() {
    this.markersLayer.innerHTML = '';

    // Last move marker
    if (this.lastMove && this.lastMove.r !== undefined && this.lastMove.c !== undefined) {
      const r = this.lastMove.r;
      const c = this.lastMove.c;
      if (this.board[r] && this.board[r][c] !== 0) {
        const cx = this.padding + c * this.cellSize;
        const cy = this.padding + r * this.cellSize;
        const color = this.board[r][c];

        const ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        ring.setAttribute('cx', cx);
        ring.setAttribute('cy', cy);
        ring.setAttribute('r', this.stoneRadius * 0.42);
        ring.setAttribute('fill', 'none');
        ring.setAttribute('stroke', color === 1 ? '#ff3b30' : '#d32f2f');
        ring.setAttribute('stroke-width', '2.8');
        this.markersLayer.appendChild(ring);
      }
    }

    // Teaching annotations (triangle, square, cross, circle)
    for (const [key, item] of Object.entries(this.annotations)) {
      const [r, c] = key.split(',').map(Number);
      const cx = this.padding + c * this.cellSize;
      const cy = this.padding + r * this.cellSize;
      const onStone = this.board[r][c] !== 0;
      const strokeColor = onStone && this.board[r][c] === 1 ? '#00e5ff' : '#007aff';

      const markText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      markText.setAttribute('x', cx);
      markText.setAttribute('y', cy);
      markText.setAttribute('fill', strokeColor);
      markText.setAttribute('font-size', this.stoneRadius * 1.1);
      markText.setAttribute('font-weight', 'bold');
      markText.setAttribute('text-anchor', 'middle');
      markText.setAttribute('dominant-baseline', 'central');

      if (item.type === 'triangle') markText.textContent = '▲';
      else if (item.type === 'square') markText.textContent = '■';
      else if (item.type === 'cross') markText.textContent = '✕';
      else if (item.type === 'circle') markText.textContent = '●';
      else markText.textContent = item.text || '●';

      this.markersLayer.appendChild(markText);
    }
  }

  renderGhost() {
    this.ghostLayer.innerHTML = '';
    if (!this.interactive || !this.hoverPos) return;

    const { r, c } = this.hoverPos;
    if (this.board[r][c] !== 0) return;

    const cx = this.padding + c * this.cellSize;
    const cy = this.padding + r * this.cellSize;

    const ghost = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    ghost.setAttribute('cx', cx);
    ghost.setAttribute('cy', cy);
    ghost.setAttribute('r', this.stoneRadius);
    ghost.setAttribute('fill', this.hoverColor === 1 ? 'url(#ghostBlack)' : 'url(#ghostWhite)');
    ghost.setAttribute('pointer-events', 'none');
    this.ghostLayer.appendChild(ghost);
  }
}
