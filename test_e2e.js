import { WebSocket } from 'ws';

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runE2ETest() {
  console.log('🚀 Starting End-to-End WebSocket & Room Integration Test...');

  // Step 1: Create room via REST API
  const createResp = await fetch('http://localhost:3000/api/create-room', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      boardSize: 9,
      mode: 'teach',
      colorPref: 'black',
      handicap: 0,
      komi: 6.5
    })
  });
  const roomData = await createResp.json();
  if (!roomData.success || !roomData.roomId) {
    throw new Error('Failed to create room via REST API: ' + JSON.stringify(roomData));
  }
  const roomId = roomData.roomId;
  console.log(`✅ Room created: #${roomId} (9x9, Teach Mode)`);

  // Step 2: Connect Client A (Teacher)
  const clientA = new WebSocket('ws://localhost:3000');
  let stateA = null;
  clientA.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.type === 'room_state') stateA = msg.state;
  });

  await new Promise((resolve) => clientA.on('open', resolve));
  clientA.send(JSON.stringify({
    type: 'join_room',
    roomId,
    playerName: '围棋老师'
  }));
  await delay(150);

  if (!stateA || stateA.roomId !== roomId) {
    throw new Error('Client A failed to join room');
  }
  console.log('✅ Client A (Teacher) joined room successfully as', stateA.myRole);

  // Step 3: Connect Client B (Student)
  const clientB = new WebSocket('ws://localhost:3000');
  let stateB = null;
  clientB.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.type === 'room_state') stateB = msg.state;
  });

  await new Promise((resolve) => clientB.on('open', resolve));
  clientB.send(JSON.stringify({
    type: 'join_room',
    roomId,
    playerName: '围棋学员'
  }));
  await delay(150);

  if (!stateB || stateB.roomId !== roomId) {
    throw new Error('Client B failed to join room');
  }
  console.log('✅ Client B (Student) joined room successfully as', stateB.myRole);

  // Step 4: Client A plays move at (4, 4) Tengen
  clientA.send(JSON.stringify({ type: 'move', r: 4, c: 4 }));
  await delay(150);
  if (stateB.board[4][4] !== 1) {
    throw new Error('Client B did not receive move at (4,4)');
  }
  console.log('✅ Move at (4, 4) synchronized across both clients');

  // Step 5: Test Teaching Mode - Set "black_only" mode and place another black stone
  clientA.send(JSON.stringify({
    type: 'teach_action',
    action: 'set_placement_mode',
    payload: { mode: 'black_only' }
  }));
  await delay(100);
  if (stateB.teachState.placementMode !== 'black_only') {
    throw new Error('Teaching mode placement sync failed');
  }
  console.log('✅ Teach mode "只下黑子" synchronized across both clients');

  // Client B places another Black stone at (2, 2)
  clientB.send(JSON.stringify({ type: 'move', r: 2, c: 2 }));
  await delay(150);
  if (stateA.board[2][2] !== 1) {
    throw new Error('Client A did not receive 2nd black stone in black_only mode');
  }
  console.log('✅ Consecutively placed Black stone at (2, 2) synchronized');

  // Step 6: Test Undo (撤销)
  clientA.send(JSON.stringify({ type: 'teach_action', action: 'undo' }));
  await delay(150);
  if (stateA.board[2][2] !== 0 || stateB.board[2][2] !== 0) {
    throw new Error('Undo sync failed');
  }
  console.log('✅ Undo (悔棋) synchronized on both clients');

  // Step 7: Test Redo (重做)
  clientB.send(JSON.stringify({ type: 'teach_action', action: 'redo' }));
  await delay(150);
  if (stateA.board[2][2] !== 1 || stateB.board[2][2] !== 1) {
    throw new Error('Redo sync failed');
  }
  console.log('✅ Redo synchronized on both clients');

  // Step 8: Test Scoring Mode (终局点目)
  clientA.send(JSON.stringify({ type: 'request_scoring' }));
  await delay(150);
  if (!stateA.scoringState.active || !stateB.scoringState.active) {
    throw new Error('Scoring mode did not activate');
  }
  console.log('✅ Scoring mode activated and territory calculated for both clients');

  // Step 9: Confirm scoring
  clientA.send(JSON.stringify({ type: 'confirm_scoring' }));
  await delay(150);
  if (stateA.status !== 'finished' || stateB.status !== 'finished') {
    throw new Error('Scoring confirmation did not finish the game');
  }
  console.log('✅ Scoring confirmed and game finished smoothly!');

  clientA.close();
  clientB.close();
  console.log('🎉 ALL E2E INTEGRATION TESTS PASSED 100%! 🎉');
}

runE2ETest().catch(err => {
  console.error('❌ E2E Test failed:', err);
  process.exit(1);
});
