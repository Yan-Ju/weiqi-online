import { GoBoardSVG } from './board.js';
import { sound } from './audio.js';

// Global state
let board = null;
let ws = null;
let currentRoomId = null;
let currentRoomState = null;
let myRole = 'spectator'; // 'black', 'white', 'spectator'
let selectedMode = 'match'; // 'match' or 'teach'
let selectedSize = 19;
let selectedColorPref = 'black';
let handicapVal = 0;
let komiVal = 6.5;

// Toast helper
function showToast(msg, duration = 2500) {
  const toast = document.getElementById('app-toast');
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('show'), duration);
}

// Format seconds into MM:SS
function formatTime(totalSec) {
  if (totalSec == null || isNaN(totalSec) || totalSec <= 0) return '00:00';
  const mins = Math.floor(totalSec / 60);
  const secs = Math.floor(totalSec % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// Get or extract room ID from URL query or path
function getRoomIdFromURL() {
  const pathParts = window.location.pathname.split('/');
  if (pathParts[1] === 'room' && pathParts[2]) {
    return pathParts[2].toUpperCase();
  }
  const params = new URLSearchParams(window.location.search);
  const r = params.get('room');
  return r ? r.toUpperCase() : null;
}

function setRoomURL(roomId) {
  const newUrl = `${window.location.protocol}//${window.location.host}/?room=${roomId}`;
  window.history.pushState({ roomId }, '', newUrl);
  document.getElementById('invite-url-input').value = newUrl;
}

// Initialize Board SVG
function initBoard(size = 19) {
  selectedSize = size;
  board = new GoBoardSVG('board-container', {
    size: selectedSize,
    interactive: true,
    onIntersectionClick: handleIntersectionClick,
    onHoverChange: (r, c) => {
      // Hover feedback
    }
  });

  updateBoardTitleAndSwitches(size);
}

function updateBoardTitleAndSwitches(size) {
  document.getElementById('board-title').textContent = `${size} × ${size} 棋盘`;
  document.querySelectorAll('.board-size-btn').forEach(btn => {
    btn.classList.toggle('active', Number(btn.dataset.size) === Number(size));
  });
}

// Connect to WebSocket Server
function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log('Connected to Go server.');
    let roomId = getRoomIdFromURL();
    if (!roomId) {
      // Generate a temporary room code or create room
      roomId = 'ROOM' + Math.floor(1000 + Math.random() * 9000);
    }
    currentRoomId = roomId;
    setRoomURL(roomId);

    ws.send(JSON.stringify({
      type: 'join_room',
      roomId: currentRoomId,
      playerName: localStorage.getItem('weiqi_player_name') || '棋友'
    }));
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      handleServerMessage(data);
    } catch (err) {
      console.error('Error handling WS message:', err);
    }
  };

  ws.onclose = () => {
    console.warn('WS disconnected. Reconnecting in 2s...');
    setTimeout(connectWebSocket, 2000);
  };
}

function handleServerMessage(msg) {
  switch (msg.type) {
    case 'join_success': {
      myRole = msg.role;
      currentRoomId = msg.roomId;
      document.getElementById('room-id-display').textContent = '#' + currentRoomId;
      updateRoleDisplay(myRole);
      break;
    }

    case 'room_state': {
      applyRoomState(msg.state);
      break;
    }

    case 'move_played': {
      sound.playStoneClick();
      if (msg.move && msg.move.captured && msg.move.captured.length > 0) {
        sound.playCaptureSound();
      }
      break;
    }

    case 'action_error': {
      sound.playAlertSound();
      showToast('⚠️ ' + msg.reason);
      break;
    }

    case 'game_resigned': {
      sound.playAlertSound();
      showToast(`🏆 认输结束：${msg.reason}`, 4000);
      break;
    }

    case 'scoring_started': {
      showToast('🏁 进入终局点目阶段，请标记死子');
      openScoringModal(msg.result);
      break;
    }

    case 'dead_toggled': {
      sound.playStoneClick();
      updateScoringUI(msg.result);
      break;
    }

    case 'scoring_confirmed': {
      if (msg.finished) {
        sound.playAlertSound();
        showToast(`🎉 终局数子裁决：${msg.winnerReason}`, 5000);
        closeScoringModal();
      } else {
        showToast('您已确认点目，等待对方确认...');
      }
      break;
    }
  }
}

function updateRoleDisplay(role) {
  const el = document.getElementById('role-display');
  if (role === 'black') {
    el.textContent = '(执黑)';
    el.style.color = '#111827';
  } else if (role === 'white') {
    el.textContent = '(执白)';
    el.style.color = '#78350f';
  } else {
    el.textContent = '(观战)';
    el.style.color = '#0284c7';
  }
}

function applyRoomState(state) {
  if (!state) return;
  currentRoomState = state;
  currentRoomId = state.roomId;
  myRole = state.myRole;
  updateRoleDisplay(myRole);

  // Resize board if changed
  if (board.size !== state.boardSize) {
    board.setSize(state.boardSize);
    updateBoardTitleAndSwitches(state.boardSize);
  }

  // Update mode badge & panels
  const modeBadge = document.getElementById('app-mode-badge');
  const teachPanel = document.getElementById('teach-mode-panel');
  const matchPanel = document.getElementById('match-mode-panel');
  const clocksBox = document.getElementById('clocks-box');

  if (state.mode === 'teach') {
    modeBadge.textContent = '🎓 教学摆棋';
    modeBadge.className = 'mode-badge teach';
    teachPanel.style.display = 'flex';
    matchPanel.style.display = 'none';
    clocksBox.style.display = 'none';
    document.getElementById('board-subtitle').textContent = '教学模式：双方均可自由指定黑白子、撤销悔棋与摆设死活题。';
  } else {
    modeBadge.textContent = '⚔️ 对战模式';
    modeBadge.className = 'mode-badge match';
    teachPanel.style.display = 'none';
    matchPanel.style.display = 'flex';
    document.getElementById('board-subtitle').textContent = '点击交叉点落子，黑白双方轮流进行。';

    if (state.timeControl && state.timeControl.type !== 'none') {
      clocksBox.style.display = 'flex';
    } else {
      clocksBox.style.display = 'none';
    }
  }

  // Board visual state update
  board.hoverColor = state.teachState && state.mode === 'teach'
    ? (state.teachState.placementMode === 'white_only' ? 2 : (state.teachState.placementMode === 'black_only' ? 1 : state.currentTurn))
    : state.currentTurn;

  board.updateState(state.board, {
    lastMove: state.lastMove,
    deadStones: state.scoringState && state.scoringState.active ? state.scoringState.result?.deadStones : {},
    territoryMap: state.scoringState && state.scoringState.active ? state.scoringState.result?.territoryMap : null,
    annotations: state.teachState?.annotations || {},
    moveNumbersMap: state.moveNumbersMap || {},
    hoverColor: board.hoverColor
  });

  // Turn badge & text
  const turnBadge = document.getElementById('turn-badge');
  const turnText = document.getElementById('turn-text');
  if (state.mode === 'teach' && state.teachState) {
    if (state.teachState.placementMode === 'black_only') {
      turnBadge.textContent = '●';
      turnBadge.style.color = '#111';
      turnText.textContent = '摆棋：只下黑子';
    } else if (state.teachState.placementMode === 'white_only') {
      turnBadge.textContent = '○';
      turnBadge.style.color = '#888';
      turnText.textContent = '摆棋：只下白子';
    } else {
      turnBadge.textContent = state.currentTurn === 1 ? '●' : '○';
      turnBadge.style.color = state.currentTurn === 1 ? '#111' : '#888';
      turnText.textContent = state.currentTurn === 1 ? '轮到黑棋' : '轮到白棋';
    }
  } else {
    if (state.currentTurn === 1) {
      turnBadge.textContent = '●';
      turnBadge.style.color = '#111';
      turnText.textContent = '轮到黑棋';
    } else {
      turnBadge.textContent = '○';
      turnBadge.style.color = '#888';
      turnText.textContent = '轮到白棋';
    }
  }

  // Stone count
  let stoneCount = 0;
  for (let r = 0; r < state.boardSize; r++) {
    for (let c = 0; c < state.boardSize; c++) {
      if (state.board[r][c] !== 0) stoneCount++;
    }
  }
  document.getElementById('board-stone-count').textContent = `棋盘上 ${stoneCount} 子`;

  // Captures count
  const bCaptures = state.captures ? state.captures['1'] || 0 : 0;
  const wCaptures = state.captures ? state.captures['2'] || 0 : 0;
  document.getElementById('board-captures-count').textContent = `提子: 黑 ${bCaptures} · 白 ${wCaptures}`;

  // Clocks
  if (state.clocks) {
    document.getElementById('black-time').textContent = formatTime(state.clocks.blackTime);
    document.getElementById('white-time').textContent = formatTime(state.clocks.whiteTime);

    document.getElementById('black-clock').classList.toggle('active', state.clocks.active && state.currentTurn === 1);
    document.getElementById('white-clock').classList.toggle('active', state.clocks.active && state.currentTurn === 2);
  }

  // Status message
  const statusEl = document.getElementById('status-message');
  if (state.status === 'waiting') {
    statusEl.textContent = '等待好友加入...点击右上角“邀请好友”复制链接。';
  } else if (state.status === 'playing') {
    const roleMsg = myRole === 'black' ? '您执黑棋' : (myRole === 'white' ? '您执白棋' : '您正在观战');
    const turnMsg = state.currentTurn === 1 ? '黑棋先行' : '轮到白棋';
    statusEl.textContent = `对局进行中 (${roleMsg})。${turnMsg}。`;
  } else if (state.status === 'scoring') {
    statusEl.textContent = '🏁 终局点目阶段：点击棋盘死子进行标记，确认无误后点击确认。';
    if (!document.getElementById('scoring-modal').classList.contains('active')) {
      openScoringModal(state.scoringState.result);
    }
  } else if (state.status === 'finished') {
    statusEl.textContent = `🏆 对局结束：${state.winnerReason || (state.winner === 'black' ? '黑胜' : '白胜')}`;
  }

  // Teaching mode controls update
  if (state.mode === 'teach' && state.teachState) {
    const pm = state.teachState.placementMode;
    document.querySelectorAll('input[name="teach-color"]').forEach(input => {
      input.checked = input.value === pm;
      input.closest('.radio-chip').classList.toggle('active', input.value === pm);
    });

    const stepEl = document.getElementById('step-indicator');
    const totalMoves = state.historyLength + state.redoLength;
    stepEl.textContent = `第 ${state.historyLength} / ${totalMoves} 手`;

    document.getElementById('btn-teach-undo').disabled = state.historyLength === 0;
    document.getElementById('btn-teach-redo').disabled = state.redoLength === 0;
    document.getElementById('btn-step-prev').disabled = state.historyLength === 0;
    document.getElementById('btn-step-next').disabled = state.redoLength === 0;
  }
}

// Click on intersection
function handleIntersectionClick(r, c) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;

  if (currentRoomState && currentRoomState.status === 'scoring') {
    // Scoring dead stone toggle
    ws.send(JSON.stringify({
      type: 'toggle_dead',
      r,
      c
    }));
    return;
  }

  // Play move
  ws.send(JSON.stringify({
    type: 'move',
    r,
    c
  }));
}

// ==========================================================================
// Setup Dialog & Event Listeners (Figure 1 Modal)
// ==========================================================================

function openSetupModal() {
  const modal = document.getElementById('match-setup-modal');
  modal.classList.add('active');
  const url = `${window.location.protocol}//${window.location.host}/?room=${currentRoomId || 'ROOM'}`;
  document.getElementById('invite-url-input').value = url;
}

function closeSetupModal() {
  document.getElementById('match-setup-modal').classList.remove('active');
}

function setupModalEventListeners() {
  document.getElementById('btn-open-settings').addEventListener('click', openSetupModal);
  document.getElementById('btn-close-modal').addEventListener('click', closeSetupModal);

  // Copy link in header & modal
  const copyLinkAction = () => {
    const url = `${window.location.protocol}//${window.location.host}/?room=${currentRoomId}`;
    navigator.clipboard.writeText(url).then(() => {
      showToast('📋 邀请链接已复制！发给好友即可加入对弈');
    }).catch(() => {
      prompt('请复制邀请链接：', url);
    });
  };

  document.getElementById('btn-copy-link').addEventListener('click', copyLinkAction);
  document.getElementById('btn-modal-copy').addEventListener('click', copyLinkAction);

  // Mode buttons in modal
  document.getElementById('mode-opt-match').addEventListener('click', () => {
    selectedMode = 'match';
    document.getElementById('mode-opt-match').classList.add('active');
    document.getElementById('mode-opt-teach').classList.remove('active');
  });

  document.getElementById('mode-opt-teach').addEventListener('click', () => {
    selectedMode = 'teach';
    document.getElementById('mode-opt-teach').classList.add('active');
    document.getElementById('mode-opt-match').classList.remove('active');
  });

  // Board size in modal
  document.querySelectorAll('.board-size-grid .size-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.board-size-grid .size-toggle-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedSize = Number(btn.dataset.size);
    });
  });

  // Color selection in modal
  document.querySelectorAll('.color-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.color-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      selectedColorPref = chip.dataset.color;
    });
  });

  // Handicap stepper
  document.getElementById('btn-handicap-minus').addEventListener('click', () => {
    if (handicapVal > 0) {
      handicapVal = handicapVal === 2 ? 0 : handicapVal - 1;
      document.getElementById('handicap-val').textContent = handicapVal;
    }
  });
  document.getElementById('btn-handicap-plus').addEventListener('click', () => {
    if (handicapVal < 9) {
      handicapVal = handicapVal === 0 ? 2 : handicapVal + 1;
      document.getElementById('handicap-val').textContent = handicapVal;
    }
  });

  // Komi stepper
  document.getElementById('btn-komi-minus').addEventListener('click', () => {
    komiVal = Math.max(0, komiVal - 1);
    document.getElementById('komi-val').textContent = komiVal;
  });
  document.getElementById('btn-komi-plus').addEventListener('click', () => {
    komiVal += 1;
    document.getElementById('komi-val').textContent = komiVal;
  });

  // Submit modal (Create & Invite)
  document.getElementById('btn-submit-match').addEventListener('click', async () => {
    const timeControl = document.getElementById('time-control-select').value;
    const body = {
      boardSize: selectedSize,
      mode: selectedMode,
      colorPref: selectedColorPref,
      handicap: handicapVal,
      komi: komiVal,
      timeControl
    };

    try {
      const resp = await fetch('/api/create-room', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await resp.json();
      if (data.success) {
        currentRoomId = data.roomId;
        setRoomURL(data.roomId);
        closeSetupModal();
        copyLinkAction();

        // Join room in WS
        ws.send(JSON.stringify({
          type: 'join_room',
          roomId: currentRoomId,
          playerName: localStorage.getItem('weiqi_player_name') || '房主'
        }));
      }
    } catch (err) {
      console.error('Failed to create room:', err);
    }
  });

  // Board switches at top right (Figure 2)
  document.querySelectorAll('.board-size-switches .board-size-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const s = Number(btn.dataset.size);
      if (currentRoomState && currentRoomState.mode === 'teach') {
        // In teach mode, can quickly change size
        selectedSize = s;
        board.setSize(s);
        updateBoardTitleAndSwitches(s);
        fetch('/api/create-room', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomId: currentRoomId, boardSize: s, mode: 'teach' })
        }).then(() => {
          ws.send(JSON.stringify({ type: 'join_room', roomId: currentRoomId }));
        });
      } else {
        openSetupModal();
      }
    });
  });

  // Audio Toggle
  document.getElementById('btn-audio-toggle').addEventListener('click', () => {
    sound.enabled = !sound.enabled;
    document.getElementById('audio-icon').textContent = sound.enabled ? '🔊' : '🔇';
    showToast(sound.enabled ? '音效已开启' : '音效已静音');
  });
  // Tabs in modal (邀请好友 vs 对弈设置)
  const tabInvite = document.getElementById('tab-invite');
  const tabSettings = document.getElementById('tab-settings');
  const inviteSection = document.getElementById('invite-section');

  tabInvite.addEventListener('click', () => {
    tabInvite.classList.add('active');
    tabSettings.classList.remove('active');
    inviteSection.style.display = 'flex';
  });

  tabSettings.addEventListener('click', () => {
    tabSettings.classList.add('active');
    tabInvite.classList.remove('active');
    inviteSection.style.display = 'none';
  });
}

// ==========================================================================
// Teaching Mode Controls (Figure 2 Blue Dashed Box)
// ==========================================================================

function setupTeachPanelEventListeners() {
  // Placement Mode Radios (只下黑子, 只下白子, 正常交替)
  document.querySelectorAll('input[name="teach-color"]').forEach(input => {
    input.addEventListener('change', () => {
      const mode = input.value;
      document.querySelectorAll('input[name="teach-color"]').forEach(i => {
        i.closest('.radio-chip').classList.toggle('active', i.value === mode);
      });

      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'teach_action',
          action: 'set_placement_mode',
          payload: { mode }
        }));
      }
    });
  });

  // Pass, Undo, Redo, Reset
  document.getElementById('btn-teach-pass').addEventListener('click', () => {
    ws.send(JSON.stringify({ type: 'pass' }));
  });

  document.getElementById('btn-teach-undo').addEventListener('click', () => {
    ws.send(JSON.stringify({ type: 'teach_action', action: 'undo' }));
  });

  document.getElementById('btn-teach-redo').addEventListener('click', () => {
    ws.send(JSON.stringify({ type: 'teach_action', action: 'redo' }));
  });

  document.getElementById('btn-teach-reset').addEventListener('click', () => {
    if (confirm('确定要清空棋盘重新开始吗？')) {
      ws.send(JSON.stringify({ type: 'teach_action', action: 'reset' }));
    }
  });

  // Step Navigator (|<, <, >, >|)
  document.getElementById('btn-step-first').addEventListener('click', () => {
    ws.send(JSON.stringify({ type: 'teach_action', action: 'jump_to_step', payload: { step: 0 } }));
  });
  document.getElementById('btn-step-prev').addEventListener('click', () => {
    if (currentRoomState) {
      const target = Math.max(0, currentRoomState.historyLength - 1);
      ws.send(JSON.stringify({ type: 'teach_action', action: 'jump_to_step', payload: { step: target } }));
    }
  });
  document.getElementById('btn-step-next').addEventListener('click', () => {
    if (currentRoomState) {
      const target = currentRoomState.historyLength + 1;
      ws.send(JSON.stringify({ type: 'teach_action', action: 'jump_to_step', payload: { step: target } }));
    }
  });
  document.getElementById('btn-step-last').addEventListener('click', () => {
    if (currentRoomState) {
      const target = currentRoomState.historyLength + currentRoomState.redoLength;
      ws.send(JSON.stringify({ type: 'teach_action', action: 'jump_to_step', payload: { step: target } }));
    }
  });

  // Show move numbers toggle
  document.getElementById('btn-toggle-numbers').addEventListener('click', () => {
    board.showMoveNumbers = !board.showMoveNumbers;
    document.getElementById('btn-toggle-numbers').classList.toggle('primary', board.showMoveNumbers);
    board.render();
    showToast(board.showMoveNumbers ? '已开启手数标记' : '已关闭手数标记');
  });

  // Teaching scoring check
  document.getElementById('btn-teach-scoring').addEventListener('click', () => {
    ws.send(JSON.stringify({ type: 'request_scoring' }));
  });

  // Match Mode Action Buttons
  document.getElementById('btn-match-pass').addEventListener('click', () => {
    ws.send(JSON.stringify({ type: 'pass' }));
  });

  document.getElementById('btn-match-score').addEventListener('click', () => {
    ws.send(JSON.stringify({ type: 'request_scoring' }));
  });

  document.getElementById('btn-match-resign').addEventListener('click', () => {
    if (confirm('确定认输吗？')) {
      ws.send(JSON.stringify({ type: 'resign' }));
    }
  });
}

// ==========================================================================
// Scoring Dialog & Dead Stone Marking
// ==========================================================================

function openScoringModal(result) {
  const modal = document.getElementById('scoring-modal');
  modal.classList.add('active');
  if (result) updateScoringUI(result);
}

function closeScoringModal() {
  document.getElementById('scoring-modal').classList.remove('active');
}

function updateScoringUI(res) {
  if (!res) return;

  document.getElementById('score-b-alive').textContent = res.blackAlive;
  document.getElementById('score-b-territory').textContent = res.blackTerritory;
  document.getElementById('score-b-captures').textContent = (res.captures['1'] || 0) + (res.deadCount['2'] || 0);
  document.getElementById('score-b-total').textContent = res.japanese.black;

  document.getElementById('score-w-alive').textContent = res.whiteAlive;
  document.getElementById('score-w-territory').textContent = res.whiteTerritory;
  document.getElementById('score-w-komi').textContent = res.komi;
  document.getElementById('score-w-total').textContent = res.japanese.white;

  const proclamation = document.getElementById('scoring-proclamation');
  proclamation.textContent = `数目法：${res.japanese.winnerDesc} ｜ 数子法：${res.chinese.winnerDesc}`;
}

function setupScoringEventListeners() {
  document.getElementById('btn-scoring-close').addEventListener('click', closeScoringModal);

  document.getElementById('btn-scoring-confirm').addEventListener('click', () => {
    ws.send(JSON.stringify({ type: 'confirm_scoring' }));
  });
}

// Initialization on DOM Load
window.addEventListener('DOMContentLoaded', () => {
  initBoard(19);
  setupModalEventListeners();
  setupTeachPanelEventListeners();
  setupScoringEventListeners();
  connectWebSocket();

  // If entering directly without a specific room link, open modal for easy setup
  const params = new URLSearchParams(window.location.search);
  if (!params.get('room') && !window.location.pathname.startsWith('/room/')) {
    setTimeout(openSetupModal, 200);
  }
});
