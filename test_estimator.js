import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateInfluence } from './public/influence-estimator.js';
const empty = size => Array.from({length:size},()=>Array(size).fill(0));
function screenshotPosition() {
  const b=empty(19);
  for(const [r,c] of [[4,2],[7,2],[15,3],[15,6],[15,15]]) b[r][c]=1;
  for(const c of [2,5,8,16]) b[2][c]=2;
  return b;
}
test('reported opening: stable corner coverage with unclaimed center, no invented dead stones',()=>{
  const b=screenshotPosition(),before=structuredClone(b),r=estimateInfluence(b);
  for(let row=16;row<19;row++) for(let col=16;col<19;col++) assert.equal(r.territoryMap[`${row},${col}`],1);
  for(let row=17;row<19;row++) for(let col=0;col<6;col++) assert.equal(r.territoryMap[`${row},${col}`],1);
  assert.equal(r.territoryMap['0,0'],2); assert.equal(r.territoryMap['9,9'],undefined);
  assert.equal(r.suspectedBlackDead+r.suspectedWhiteDead,0);
  for(let i=0;i<5;i++)assert.deepEqual(estimateInfluence(b),r);
  assert.deepEqual(b,before);
});
test('empty and single-color openings do not claim the whole board on any size',()=>{
  for(const size of [9,13,19]){
    const b=empty(size); assert.equal(estimateInfluence(b).uncertain,size*size);
    for(const color of [1,2]){
      b[2][2]=color; const r=estimateInfluence(b);
      assert.ok(r.uncertain>0);assert.equal(r.territoryMap[`${size-1},${size-1}`],undefined);
      assert.equal(r.blackArea+r.whiteArea+r.uncertain,size*size);
    }
  }
});
test('influence preserves stones of both colors; komi cannot move influence boundaries',()=>{
  const b=screenshotPosition();b[18][18]=2;
  const r=estimateInfluence(b,0),other=estimateInfluence(b,7.5);
  assert.equal(r.territoryMap['18,18'],undefined);
  assert.deepEqual(r.territoryMap,other.territoryMap);
  assert.equal(r.blackArea+r.whiteArea+r.uncertain,361);
});
