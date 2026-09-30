// Shared SVG marks for both teaching boards. Colors follow the live position.
const NS = 'http://www.w3.org/2000/svg';
function svg(tag, attrs = {}) {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
}
export function annotationColor(value) {
  return value === 1 || (typeof value === 'string' && /^[pnbrqk]$/.test(value)) ? '#fff' : '#111';
}
export function renderAnnotations(layer, annotations, board, {coord, radius, boardColor, halo = false}) {
  layer.replaceChildren();
  const valid = p => p && Number.isInteger(p.r) && Number.isInteger(p.c) && p.r >= 0 && p.c >= 0 && p.r < board.length && p.c < board.length;
  // Long lines first so point labels remain legible on top.
  for (const item of Object.values(annotations)) {
    if (!['line','arrow'].includes(item.type) || !valid(item.from) || !valid(item.to)) continue;
    const a = coord(item.from.r,item.from.c), b = coord(item.to.r,item.to.c);
    const color = annotationColor(board[item.from.r][item.from.c]);
    const width = Math.max(2, radius * .14), angle = Math.atan2(b.y-a.y,b.x-a.x), head = radius * .6;
    const group = svg('g', {'data-mark':item.type, stroke:color, 'stroke-width':width, 'stroke-linecap':'round', fill:'none'});
    const tip = item.type === 'arrow' ? {x:b.x-head*.65*Math.cos(angle),y:b.y-head*.65*Math.sin(angle)} : b;
    group.append(svg('line', {x1:a.x,y1:a.y,x2:tip.x,y2:tip.y}));
    if (item.type === 'arrow') group.append(svg('path', {d:`M${b.x},${b.y} L${b.x-head*Math.cos(angle-.48)},${b.y-head*Math.sin(angle-.48)} L${b.x-head*Math.cos(angle+.48)},${b.y-head*Math.sin(angle+.48)} Z`, fill:color,stroke:'none'}));
    layer.append(group);
  }
  for (const [key,item] of Object.entries(annotations)) {
    const [r,c] = key.split(',').map(Number);
    if (!valid({r,c}) || ['line','arrow'].includes(item.type)) continue;
    const {x,y} = coord(r,c), value = board[r][c], color = annotationColor(value);
    const group = svg('g', {'data-mark':item.type, 'data-point':key, fill:'none',stroke:color,'stroke-width':Math.max(2,radius*.14),'stroke-linejoin':'miter','pointer-events':'none'});
    const size=radius*.62;
    if (!value && boardColor) group.append(svg('rect',{x:x-size-3,y:y-size-3,width:(size+3)*2,height:(size+3)*2,fill:boardColor,stroke:'none'}));
    if (item.type === 'triangle') group.append(svg('path',{d:`M${x},${y-size} L${x-size},${y+size*.75} L${x+size},${y+size*.75} Z`}));
    else if(item.type==='square') group.append(svg('rect',{x:x-size*.8,y:y-size*.8,width:size*1.6,height:size*1.6}));
    else if(item.type==='circle') group.append(svg('circle',{cx:x,cy:y,r:size*.85}));
    else if(item.type==='cross') group.append(svg('path',{d:`M${x-size*.75},${y-size*.75} L${x+size*.75},${y+size*.75} M${x-size*.75},${y+size*.75} L${x+size*.75},${y-size*.75}`}));
    else if(['number','letter','text'].includes(item.type)) {
      const text=svg('text',{x,y,fill:color,stroke:'none','font-family':'Arial, sans-serif','font-size':radius*1.15,'font-weight':'700','text-anchor':'middle','dominant-baseline':'central'});
      text.textContent=String(item.text || '').slice(0,8); group.append(text);
    }
    if(halo && value) {
      // A narrow outline keeps hollow marks clear across a chess piece's cutouts.
      const under=group.cloneNode(true); under.removeAttribute('data-mark'); under.removeAttribute('data-point');
      under.setAttribute('stroke', color === '#fff' ? '#333' : '#fff');
      under.setAttribute('stroke-width',Math.max(2,radius*.14)+2);
      for(const text of under.querySelectorAll('text')) {text.setAttribute('stroke',color === '#fff' ? '#333' : '#fff');text.setAttribute('stroke-width','2');}
      layer.append(under);
    }
    layer.append(group);
  }
}
