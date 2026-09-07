import { GoRules } from './server/goRules.js';

function assert(condition, message) {
  if (!condition) {
    console.error('❌ FAIL:', message);
    process.exit(1);
  } else {
    console.log('✅ PASS:', message);
  }
}

console.log('--- Testing GoRules Engine ---');

// Test 1: Basic moves
const g1 = new GoRules(9);
assert(g1.currentTurn === 1, 'Initial turn is Black');
let m1 = g1.playMove(4, 4);
assert(m1.success && g1.board[4][4] === 1, 'Black played at (4, 4)');
assert(g1.currentTurn === 2, 'Turn switched to White');

// Test 2: Capture a corner stone
const g2 = new GoRules(9);
// White plays (0, 0), Black surrounds at (0, 1) and (1, 0)
g2.currentTurn = 2; // White
g2.playMove(0, 0); // White at corner
g2.playMove(0, 1); // Black at (0, 1)
g2.pass(2); // White pass
let mCapture = g2.playMove(1, 0); // Black at (1, 0)
assert(mCapture.success, 'Black played (1, 0) to capture corner');
assert(g2.board[0][0] === 0, 'Corner stone captured and removed');
assert(g2.captures[1] === 1, 'Black captures count is 1');

// Test 3: Suicide prohibition
const g3 = new GoRules(9);
// Black surrounds (0, 0) at (0, 1) and (1, 0)
g3.playMove(0, 1); // B
g3.pass(2); // W pass
g3.playMove(1, 0); // B
// Now (0, 0) has 0 liberties for White
let mSuicide = g3.canPlaceStone(0, 0, 2);
assert(!mSuicide.valid && mSuicide.reason.includes('自杀'), 'White cannot play suicide at (0, 0)');

// Test 4: Ko Rule
const gKo = new GoRules(9);
// Setup a standard Ko shape:
// B at (1, 2), (2, 1), (3, 2)
// W at (2, 3), (1, 4), (3, 4)
// B plays (2, 2)
// W plays (2, 4)? Let's build classic Ko:
//  . B W .
//  B . B W
//  . B W .
// Coordinates:
// B: (1, 2), (2, 1), (3, 2)
// W: (1, 3), (3, 3), (2, 4)
// (2, 2) is currently empty. (2, 3) is W.
// If B plays (2, 3)? No:
// Position:
// (1, 2)=B, (3, 2)=B, (2, 1)=B. If B plays (2, 3) and captures (2, 2)?
// Let's set up explicitly:
gKo.board[1][2] = 1; // B
gKo.board[2][1] = 1; // B
gKo.board[3][2] = 1; // B
gKo.board[2][2] = 2; // W

gKo.board[1][3] = 2; // W
gKo.board[3][3] = 2; // W
gKo.board[2][4] = 2; // W

gKo.currentTurn = 1; // Black's turn to capture W at (2, 2)
let bKo = gKo.playMove(2, 3); // Black plays (2, 3), capturing (2, 2)
assert(bKo.success, 'Black captured W stone in Ko');
assert(gKo.board[2][2] === 0, 'Captured stone removed');
assert(gKo.ko && gKo.ko[0] === 2 && gKo.ko[1] === 2, 'Ko point set at (2, 2)');

// White attempts immediate recapture at (2, 2)
let wRecapture = gKo.canPlaceStone(2, 2, 2);
assert(!wRecapture.valid && wRecapture.reason.includes('打劫'), 'White immediate recapture forbidden by Ko rule');

// Test 5: Undo and Redo
const gUndo = new GoRules(9);
gUndo.playMove(2, 2); // Black
gUndo.playMove(6, 6); // White
assert(gUndo.history.length === 2, 'History has 2 moves');
assert(gUndo.undo() === true, 'Undo successful');
assert(gUndo.board[6][6] === 0, 'White move undone');
assert(gUndo.currentTurn === 2, 'Current turn restored to White');
assert(gUndo.redo() === true, 'Redo successful');
assert(gUndo.board[6][6] === 2, 'White move restored by redo');

// Test 6: Territory calculation (9x9)
const gTerritory = new GoRules(9, 0, 6.5);
// Divide board in half: Black controls columns 0-3, White controls columns 5-8, column 4 is border/dame
for (let r = 0; r < 9; r++) {
  gTerritory.board[r][3] = 1; // Black wall
  gTerritory.board[r][5] = 2; // White wall
}
let res = gTerritory.calculateTerritory();
assert(res.blackTerritory === 9 * 3, 'Black territory is 27 points');
assert(res.whiteTerritory === 9 * 3, 'White territory is 27 points');
assert(res.dameCount === 9 * 1, 'Neutral dame points is 9');
console.log('Scoring Japanese diff:', res.japanese.diff, res.japanese.winnerDesc);

console.log('All tests passed! 🌟');
