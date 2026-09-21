import influenceMap from './vendor/sabaki/influenceMap.js';
import nearestNeighborMap from './vendor/sabaki/nearestNeighborMap.js';
import radianceMap from './vendor/sabaki/radianceMap.js';
import { summarizeOwnership } from './estimate-summary.js';
export function estimateInfluence(board, komi=6.5) {
  const size=board.length;
  if (![9,13,19].includes(size) || board.some(row=>row.length!==size || row.some(v=>![0,1,2].includes(v)))) throw new Error('棋盘无效');
  const data=board.map(row=>row.map(v=>v===2?-1:v));
  const black=data.some(row=>row.includes(1)), white=data.some(row=>row.includes(-1));
  let map;
  if (black && white) map=influenceMap(data,{discrete:true});
  else if (!black && !white) map=data;
  else {
    // Upstream areaMap treats a one-color board as one enclosed region. Use
    // its bounded radiance field here so a lone stone cannot claim the world.
    const sign=black?1:-1, distance=nearestNeighborMap(data,sign), radiance=radianceMap(data,sign);
    map=data.map((row,r)=>row.map((v,c)=>v || (distance[r][c]<=6 && Math.round(radiance[r][c])>=2 ? sign:0)));
  }
  return summarizeOwnership(board,map.flat(),komi);
}
