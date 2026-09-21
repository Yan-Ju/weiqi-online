export function summarizeOwnership(board, ownership, komi) {
  const size = board.length;
  if (ownership.length !== size * size || ownership.some(v => ![-1, 0, 1].includes(v))) throw new Error('估算结果无效');
  const result = { blackArea: 0, whiteArea: 0, uncertain: 0, blackStones: 0, whiteStones: 0, blackTerritory: 0, whiteTerritory: 0, suspectedBlackDead: 0, suspectedWhiteDead: 0, territoryMap: {}, komi };
  for (let r=0; r<size; r++) for (let c=0; c<size; c++) {
    const stone=board[r][c], owner=ownership[r*size+c], key=`${r},${c}`;
    if (stone) result[stone===1 ? 'blackStones' : 'whiteStones']++;
    if (owner===0) result.uncertain++;
    else {
      result[owner===1 ? 'blackArea' : 'whiteArea']++;
      if (!stone || stone !== (owner===1 ? 1 : 2)) {
        result.territoryMap[key]=owner===1 ? 1 : 2;
        result[owner===1 ? 'blackTerritory' : 'whiteTerritory']++;
        if (stone) result[stone===1 ? 'suspectedBlackDead' : 'suspectedWhiteDead']++;
      }
    }
  }
  result.whiteTotal=result.whiteArea+komi;
  result.diff=result.blackArea-result.whiteTotal;
  return result;
}
