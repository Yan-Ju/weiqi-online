import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import createEstimator from './public/vendor/ogs/estimator.js';
import { summarizeOwnership } from './public/estimate-summary.js';
test('ownership summary handles white sign, neutral points, komi and suspected captures without mutating board', () => {
  const board=[[1,0],[0,2]], copy=structuredClone(board);
  const r=summarizeOwnership(board,[-1,1,0,-1],6.5);
  assert.equal(r.blackArea,1); assert.equal(r.whiteArea,2); assert.equal(r.uncertain,1);
  assert.equal(r.suspectedBlackDead,1); assert.equal(r.diff,-7.5);
  assert.equal(r.territoryMap['0,0'],2); assert.equal(r.territoryMap['0,1'],1);
  assert.deepEqual(board,copy);
});
test('actual OGS WASM runs on 9, 13 and 19 boards and returns bounded ownership', async () => {
  const wasmBinary=await readFile(new URL('./public/vendor/ogs/estimator.wasm',import.meta.url));
  const engine=await createEstimator({wasmBinary});
  for(const size of [9,13,19]) {
    const input=new Int32Array(size*size);input[2*size+2]=1;input[(size-3)*size+size-3]=-1;
    const ptr=engine._malloc(input.byteLength);
    try {
      engine.HEAP32.set(input,ptr/4);
      const start=performance.now();engine._estimate(size,size,ptr,1,1000,0.1);
      const output=Array.from(engine.HEAP32.subarray(ptr/4,ptr/4+size*size));
      assert.ok(output.every(v=>[-1,0,1].includes(v)));assert.ok(output.includes(1));assert.ok(output.includes(-1));
      console.log(`OGS ${size}x${size}: ${Math.round(performance.now()-start)} ms`);
    }finally{engine._free(ptr);}
  }
});
