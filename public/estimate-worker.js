import { estimateInfluence } from './influence-estimator.js';
self.onmessage = ({data}) => {
  try { self.postMessage({result:estimateInfluence(data.board,data.komi)}); }
  catch { self.postMessage({error:'势力分析暂时不可用，请重试'}); }
};
