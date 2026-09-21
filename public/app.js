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
let creatingRoom = false;
let reconnectAttempts = 0;
let scoringPanelHidden = false;
let estimatePreview = false;
let estimateEnabled = false, estimateResult = null, estimateKey = '', estimateWorker = null, estimateTimer = null, estimateTimeout = null;
function stopEstimateJob() {
  clearTimeout(estimateTimer); clearTimeout(estimateTimeout);
  estimateWorker?.terminate(); estimateWorker = null;
}
function closeEstimate() {
  stopEstimateJob(); estimateEnabled = false; estimateResult = null; estimateKey = '';
  document.getElementById('estimate-panel').hidden = true;
  document.getElementById('btn-estimate').textContent = '形势估算';
  if (currentRoomState) { board.territoryMap = currentRoomState.scoringState?.active ? currentRoomState.scoringState.result?.territoryMap : null; board.renderTerritory(); }
}
function refreshEstimate(force = false) {
  if (!estimateEnabled || !currentRoomState) return;
  const state = currentRoomState;
  const key = JSON.stringify([state.roomId,state.board,state.currentTurn,state.komi]);
  if (!force && key === estimateKey) return;
  estimateKey = key; stopEstimateJob(); estimateResult = null;
  board.territoryMap = null; board.renderTerritory();
  document.getElementById('estimate-details').hidden = true;
  document.getElementById('estimate-progress').textContent = '正在分析势力…';
  estimateTimer = setTimeout(() => {
    const fail = () => { stopEstimateJob(); document.getElementById('estimate-progress').textContent = '分析未完成，请点击重新估算。'; };
    try {
      const worker = new Worker('/estimate-worker.js', {type:'module'});
      estimateWorker = worker;
      estimateTimeout = setTimeout(fail, 15000);
      worker.onerror = fail;
      worker.onmessage = ({data}) => {
        if (estimateWorker !== worker || !estimateEnabled || estimateKey !== key) return;
        if (data.error) { fail(); return; }
        stopEstimateJob(); estimateResult = data.result;
        board.territoryMap = estimateResult.territoryMap; board.renderTerritory();
        const r = estimateResult;
        for (const color of ['black','white']) for (const [suffix,field] of [['stones','Stones'],['area','Area'],['territory','Territory']]) document.getElementById(`est-${color}-${suffix}`).textContent = r[color+field];
        document.getElementById('est-black-dead').textContent = '未判断';
        document.getElementById('est-white-dead').textContent = '未判断';
        const coverageDiff = r.blackTerritory - r.whiteTerritory;
        document.getElementById('estimate-result').textContent = coverageDiff === 0 ? '双方势力覆盖相同（不代表胜负）' : `${coverageDiff>0?'黑':'白'}方势力多覆盖 ${Math.abs(coverageDiff)} 个空点（不代表胜负）`;
        document.getElementById('estimate-komi').textContent = `贴目设置：${r.komi}；势力图不扣贴目、不计算终局分数。`;
        document.getElementById('estimate-uncertain').textContent = `未划分空点：${r.uncertain}；尚未形成明确势力或双方争夺。`;
        document.getElementById('estimate-progress').textContent = '已更新 · Sabaki 静态势力图';
        document.getElementById('estimate-details').hidden = false;
      };
      worker.postMessage({board:state.board,currentTurn:state.currentTurn,komi:state.komi});
    } catch { fail(); }
  }, 350);
}

let statsReceivedAt = 0;
function updateServerStatsUI(stats) {
  statsReceivedAt = Date.now();
  document.getElementById('server-status').dataset.stale = 'false';
  document.getElementById('server-status-fresh').textContent = '实时';
  document.getElementById('server-cpu').textContent = stats.cpuPercent == null ? '采样中' : `${stats.cpuPercent.toFixed(1)}%`;
  document.getElementById('server-memory').textContent = `${stats.memoryMiB.toFixed(1)} MiB`;
  document.getElementById('server-rooms').textContent = `${stats.occupiedRooms} / ${stats.rooms}`;
  document.getElementById('server-empty').textContent = stats.emptyRooms;
  document.getElementById('server-connections').textContent = stats.connections;
}
function markStatsStale() {
  document.getElementById('server-status').dataset.stale = 'true';
  document.getElementById('server-status-fresh').textContent = '连接中断 / 待更新';
  for (const id of ['server-cpu', 'server-memory', 'server-rooms', 'server-empty', 'server-connections']) document.getElementById(id).textContent = '—';
}


function sendAction(message) {
  if (!ws || ws.readyState !== WebSocket.OPEN) { showToast('连接已断开，正在重连，请稍后重试'); return false; }
  ws.send(JSON.stringify(message));
  return true;
}

// In-page confirmation works consistently on mobile and embedded browsers.
let pendingConfirmation = null;
function confirmAction(message) {
  if (pendingConfirmation) return Promise.resolve(false);
  document.getElementById('confirmation-message').textContent = message;
  document.getElementById('confirmation-modal').classList.add('active');
  document.getElementById('confirmation-cancel').focus();
  return new Promise(resolve => { pendingConfirmation = resolve; });
}
function finishConfirmation(accepted) {
  document.getElementById('confirmation-modal').classList.remove('active');
  pendingConfirmation?.(accepted);
  pendingConfirmation = null;
}

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
    reconnectAttempts = 0;
    const roomId = getRoomIdFromURL();
    if (roomId) sendAction({ type: 'join_room', roomId, playerName: localStorage.getItem('weiqi_player_name') || '棋友' });
    else openSetupModal();
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
    markStatsStale();
    closeEstimate();
    console.warn('WS disconnected. Reconnecting in 2s...');
    creatingRoom = false;
    document.getElementById('btn-submit-match').disabled = false;
    showToast('连接已断开，正在重连…');
    setTimeout(connectWebSocket, Math.min(30000, 1000 * 2 ** reconnectAttempts++));
  };
}

function handleServerMessage(msg) {
  switch (msg.type) {
    case 'server_stats': updateServerStatsUI(msg.stats); break;
    case 'position_estimate': break; // Legacy server response; browser worker now owns estimates.
    case 'new_game': {
      showToast(msg.restarted ? '新一局已开始' : '已申请新一局，等待另一方点击同意');
      break;
    }
    case 'join_success': {
      closeEstimate();
      myRole = msg.role;
      currentRoomId = msg.roomId;
      setRoomURL(currentRoomId);
      currentRoomState = null;
      scoringPanelHidden = false;
      estimatePreview = false;
      closeScoringModal();
      if (creatingRoom) { closeSetupModal(); showToast('房间已创建，点击邀请好友分享链接'); }
      creatingRoom = false;
      document.getElementById('btn-submit-match').disabled = false;
      document.getElementById('room-id-display').textContent = '#' + currentRoomId;
      updateRoleDisplay(myRole);
      break;
    }

    case 'room_state': {
      applyRoomState(msg.state);
      if (msg.event) handleServerMessage({ ...msg, type: msg.event });
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
      creatingRoom = false;
      document.getElementById('btn-submit-match').disabled = false;
      if (msg.code === 'room_missing') { currentRoomState = null; currentRoomId = null; closeScoringModal(); openSetupModal(); }
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
      if (!scoringPanelHidden) openScoringModal(msg.result);
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
        showToast('点目确认状态已更新，等待双方确认');
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
  const wasScoring = currentRoomState?.status === 'scoring';
  if (!wasScoring && state.status === 'scoring') { scoringPanelHidden = false; estimatePreview = false; }
  if (state.status === 'scoring') closeEstimate();
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
    territoryMap: state.scoringState && state.scoringState.active ? state.scoringState.result?.territoryMap : (estimateEnabled ? estimateResult?.territoryMap : null),
    annotations: state.teachState?.annotations || {},
    moveNumbersMap: state.moveNumbersMap || {},
    hoverColor: board.hoverColor
  });

  refreshEstimate();

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
    updateScoringUI(state.scoringState.result);
    if (!scoringPanelHidden && !document.getElementById('scoring-modal').classList.contains('active')) {
      openScoringModal(state.scoringState.result);
    }
  } else if (state.status === 'paused') {
    statusEl.textContent = '对手已离开，对局与计时暂停，等待重新加入。';
  } else if (state.status === 'finished') {
    statusEl.textContent = `🏆 对局结束：${state.winnerReason || (state.winner === 'black' ? '黑胜' : '白胜')}`;
  }

  if (state.status !== 'scoring' && !estimatePreview) closeScoringModal();
  document.getElementById('btn-estimate').disabled = state.status === 'scoring';
  const isPlayer = myRole === 'black' || myRole === 'white';
  document.getElementById('btn-show-scoring').hidden = state.status !== 'scoring';
  document.getElementById('btn-resume-game').hidden = state.status !== 'scoring';
  document.getElementById('btn-resume-game').disabled = !isPlayer;
  document.getElementById('btn-scoring-resume').disabled = !isPlayer;
  document.getElementById('btn-scoring-confirm').disabled = estimatePreview || !isPlayer || !!state.scoringState?.agreed?.[myRole];
  document.getElementById('btn-new-game').disabled = !isPlayer;
  document.getElementById('btn-new-game').textContent = Object.values(state.newGameAgreed || {}).some(Boolean) ? '同意开始新一局' : '开始新一局';
  for (const id of ['btn-match-pass', 'btn-match-score', 'btn-match-resign', 'btn-teach-pass', 'btn-teach-scoring']) document.getElementById(id).disabled = !isPlayer || state.status !== 'playing';
  if (Object.values(state.newGameAgreed || {}).some(Boolean)) statusEl.textContent += ' 有玩家申请新一局，请点击“同意开始新一局”。';

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
    sendAction({
      type: 'toggle_dead',
      r,
      c
    });
    return;
  }

  // Play move
  sendAction({
    type: 'move',
    r,
    c
  });
}

// ==========================================================================
// Setup Dialog & Event Listeners (Figure 1 Modal)
// ==========================================================================

function openSetupModal() {
  document.querySelectorAll('.board-size-grid .size-toggle-btn').forEach(btn => btn.classList.toggle('active', Number(btn.dataset.size) === selectedSize));
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
  document.getElementById('btn-submit-match').addEventListener('click', () => {
    if (creatingRoom) return;
    if (sendAction({ type: 'create_room', playerName: localStorage.getItem('weiqi_player_name') || '房主', config: {
      boardSize: selectedSize, mode: selectedMode, colorPref: selectedColorPref,
      handicap: handicapVal, komi: komiVal, timeControl: document.getElementById('time-control-select').value
    } })) {
      creatingRoom = true;
      document.getElementById('btn-submit-match').disabled = true;
    }
  });

  document.querySelectorAll('.board-size-switches .board-size-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const size = Number(btn.dataset.size);
      if (!currentRoomState) { selectedSize = size; openSetupModal(); return; }
      if (size === currentRoomState.boardSize) return;
      if (currentRoomState.mode === 'teach' && currentRoomState.historyLength && !await confirmAction('切换棋盘将清空当前摆棋，继续吗？')) return;
      sendAction({ type: 'change_board_size', boardSize: size });
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
        sendAction({
          type: 'teach_action',
          action: 'set_placement_mode',
          payload: { mode }
        });
      }
    });
  });

  // Pass, Undo, Redo, Reset
  document.getElementById('btn-teach-pass').addEventListener('click', () => {
    sendAction({ type: 'pass' });
  });

  document.getElementById('btn-teach-undo').addEventListener('click', () => {
    sendAction({ type: 'teach_action', action: 'undo' });
  });

  document.getElementById('btn-teach-redo').addEventListener('click', () => {
    sendAction({ type: 'teach_action', action: 'redo' });
  });

  document.getElementById('btn-teach-reset').addEventListener('click', async () => {
    if (await confirmAction('确定要清空棋盘重新开始吗？')) {
      sendAction({ type: 'teach_action', action: 'reset' });
    }
  });

  // Step Navigator (|<, <, >, >|)
  document.getElementById('btn-step-first').addEventListener('click', () => {
    sendAction({ type: 'teach_action', action: 'jump_to_step', payload: { step: 0 } });
  });
  document.getElementById('btn-step-prev').addEventListener('click', () => {
    if (currentRoomState) {
      const target = Math.max(0, currentRoomState.historyLength - 1);
      sendAction({ type: 'teach_action', action: 'jump_to_step', payload: { step: target } });
    }
  });
  document.getElementById('btn-step-next').addEventListener('click', () => {
    if (currentRoomState) {
      const target = currentRoomState.historyLength + 1;
      sendAction({ type: 'teach_action', action: 'jump_to_step', payload: { step: target } });
    }
  });
  document.getElementById('btn-step-last').addEventListener('click', () => {
    if (currentRoomState) {
      const target = currentRoomState.historyLength + currentRoomState.redoLength;
      sendAction({ type: 'teach_action', action: 'jump_to_step', payload: { step: target } });
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
    sendAction({ type: 'request_scoring' });
  });

  // Match Mode Action Buttons
  document.getElementById('btn-match-pass').addEventListener('click', () => {
    sendAction({ type: 'pass' });
  });

  document.getElementById('btn-match-score').addEventListener('click', () => {
    sendAction({ type: 'request_scoring' });
  });

  document.getElementById('btn-match-resign').addEventListener('click', async () => {
    if (await confirmAction('确定认输吗？')) {
      sendAction({ type: 'resign' });
    }
  });
}

// ==========================================================================
// Scoring Dialog & Dead Stone Marking
// ==========================================================================

function openScoringModal(result) {
  const modal = document.getElementById('scoring-modal');
  document.querySelector('.scoring-title').textContent = estimatePreview ? '形势粗估（当前盘面快照）' : '点目试算 / 终局确认';
  document.getElementById('btn-scoring-confirm').hidden = estimatePreview;
  document.getElementById('btn-scoring-resume').hidden = estimatePreview;
  document.getElementById('btn-scoring-close').textContent = estimatePreview ? '关闭估算，继续对局' : '返回棋盘继续标记';
  modal.classList.add('active');
  document.getElementById('scoring-tip').textContent = estimatePreview ? '根据棋子距离粗略估计影响范围；不判断死活、双活或劫争。结果仅供学习参考，对局和计时不会暂停。' : '终局点目：双方确认死活后统计围地。关闭此面板后，点击棋子标记或取消死子；也可以取消点目继续对局。双活等特殊局面请双方另行核对。';
  if (result) updateScoringUI(result);
}

function closeScoringModal() {
  document.getElementById('scoring-modal').classList.remove('active');
  estimatePreview = false;
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
  proclamation.textContent = res.estimated ? `粗估：${res.chinese.winnerDesc}；未定区域 ${res.dameCount} 点。未判断死活，不作为终局结果。对局与计时继续。` : `数目法：${res.japanese.winnerDesc} ｜ 数子法：${res.chinese.winnerDesc}`;
}

function setupScoringEventListeners() {
  document.getElementById('btn-estimate').addEventListener('click', () => {
    if (estimateEnabled) { closeEstimate(); return; }
    if (!currentRoomState || ws?.readyState !== WebSocket.OPEN) return;
    estimateEnabled = true;
    document.getElementById('estimate-panel').hidden = false;
    document.getElementById('btn-estimate').textContent = '关闭形势估算';
    refreshEstimate(true);
  });
  document.getElementById('estimate-close').addEventListener('click', closeEstimate);
  document.getElementById('estimate-retry').addEventListener('click', () => refreshEstimate(true));
  document.getElementById('btn-scoring-close').addEventListener('click', () => { scoringPanelHidden = true; closeScoringModal(); });
  document.getElementById('btn-show-scoring').addEventListener('click', () => { estimatePreview = false; scoringPanelHidden = false; openScoringModal(currentRoomState?.scoringState?.result); });
  for (const id of ['btn-resume-game', 'btn-scoring-resume']) document.getElementById(id).addEventListener('click', () => sendAction({ type: 'resume_game' }));
  document.getElementById('btn-new-game').addEventListener('click', async () => { if (await confirmAction('开始新一局会清空棋盘；对战双方在场时须双方同意。继续吗？')) sendAction({ type: 'new_game' }); });

  document.getElementById('btn-scoring-confirm').addEventListener('click', () => {
    sendAction({ type: 'confirm_scoring' });
  });
}

// Initialization on DOM Load
window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('confirmation-ok').addEventListener('click', () => finishConfirmation(true));
  document.getElementById('confirmation-cancel').addEventListener('click', () => finishConfirmation(false));
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && pendingConfirmation) finishConfirmation(false); });
  setInterval(() => { if (statsReceivedAt && Date.now() - statsReceivedAt > 12000) markStatsStale(); }, 1000);
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
