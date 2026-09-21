import createEstimator from './vendor/ogs/estimator.js';
import { summarizeOwnership } from './estimate-summary.js';
self.onmessage = async ({data}) => {
  try {
    const {board, currentTurn, komi} = data;
    const size=board.length;
    if (![9,13,19].includes(size) || board.some(row=>row.length!==size || row.some(v=>![0,1,2].includes(v)))) throw new Error('棋盘无效');
    // Keep an empty board neutral instead of asking random playouts to invent ownership.
    let ownership=Array(size*size).fill(0);
    if (board.some(row=>row.includes(1)) && board.some(row=>row.includes(2))) {
      const engine=await createEstimator();
      const ptr=engine._malloc(size*size*4);
      try {
        engine.HEAP32.set(board.flat().map(v=>v===2 ? -1 : v),ptr/4);
        engine._estimate(size,size,ptr,currentTurn===1 ? 1 : -1,1000,0.1);
        ownership=Array.from(engine.HEAP32.subarray(ptr/4,ptr/4+size*size));
      } finally { engine._free(ptr); }
    }
    if (!board.some(row=>row.includes(1)) || !board.some(row=>row.includes(2))) ownership=board.flat().map(v=>v===2 ? -1 : v);
    self.postMessage({result:summarizeOwnership(board,ownership,komi)});
  } catch (error) { self.postMessage({error:'估算引擎暂时不可用，请重试'}); }
};
