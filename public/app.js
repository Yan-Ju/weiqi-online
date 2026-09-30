import { GoBoardSVG } from './board.js';
import { ChessBoard, pieceSVG } from './chess-board.js';
import { sound } from './audio.js';

// Global state
let board = null;
let selectedGameType = 'go';
let renderedGameType = 'go';
let setupNewRoom = true;
let pendingPromotion = null;
let chessSelection = null;
let chessSetupPiece = 'move';
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
let selectedTeachTool = 'move';
let markupStart = null;

function stopEstimateJob() {
  clearTimeout(estimateTimer); clearTimeout(estimateTimeout);
  estimateWorker?.terminate(); estimateWorker = null;
}
function closeEstimate() {
  stopEstimateJob(); estimateEnabled = false; estimateResult = null; estimateKey = '';
  document.getElementById('estimate-panel').hidden = true;
  document.getElementById('btn-estimate').textContent = '形势估算';
  if (currentRoomState && board?.renderTerritory) { board.territoryMap = currentRoomState.scoringState?.active ? currentRoomState.scoringState.result?.territoryMap : null; board.renderTerritory(); }
}
function refreshEstimate(force = false) {
  if (!estimateEnabled || !currentRoomState || currentRoomState.gameType === 'chess') return;
  const state = currentRoomState;
  const key = JSON.stringify([state.roomId,state.board,state.currentTurn,state.komi]);
  if (!force && key === estimateKey) return;
  estimateKey = key; stopEstimateJob(); estimateResult = null;
  if (board?.renderTerritory) { board.territoryMap = null; board.renderTerritory(); }
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
        if (board?.renderTerritory) { board.territoryMap = estimateResult.territoryMap; board.renderTerritory(); }
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

}

// Initialize Board SVG
function initBoard(size = 19, gameType = selectedGameType) {
  renderedGameType = gameType;
  document.querySelector('.board-wrapper').classList.toggle('is-chess', gameType === 'chess');
  chessSelection = null;
  const BoardClass = gameType === 'chess' ? ChessBoard : GoBoardSVG;
  board = new BoardClass('board-container', {
    size,
    interactive: true,
    onIntersectionClick: handleIntersectionClick,
    onHoverChange: (r, c) => {
      // Hover feedback
    }
  });

  updateBoardTitleAndSwitches(size);
}

function updateBoardTitleAndSwitches(size) {
  document.getElementById('board-title').textContent = renderedGameType === 'chess' ? '国际象棋 · 8 × 8' : `${size} × ${size} 棋盘`;
  document.querySelectorAll('.board-size-btn').forEach(btn => {
    btn.classList.toggle('active', Number(btn.dataset.size) === Number(size));
    btn.hidden = renderedGameType === 'chess';
  });
  document.getElementById('brand-title').textContent = renderedGameType === 'chess' ? '棋局在线 · 国际象棋' : '棋局在线 · 围棋';
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
      if (['configure_room', 'respond_config'].includes(msg.event)) { document.getElementById('btn-submit-match').disabled = false; closeSetupModal(); showToast(msg.pending ? '已申请更换设置，等待对手确认' : msg.cancelled ? '设置申请已取消' : '房间设置已更新'); }
      if (msg.event) handleServerMessage({ ...msg, type: msg.event });
      break;
    }

    case 'move_played': {
      sound.playStoneClick(renderedGameType);
      if (msg.move && msg.move.captured && msg.move.captured.length > 0) {
        sound.playCaptureSound();
      }
      break;
    }

    case 'action_error': {
      creatingRoom = false;
      document.getElementById('btn-submit-match').disabled = false;
      if (msg.code === 'room_missing') { currentRoomState = null; currentRoomId = null; document.getElementById('btn-copy-link').disabled = true; for (const id of ['btn-copy-link','btn-open-settings','room-tag']) document.getElementById(id).hidden = true; document.getElementById('btn-create-another').textContent = '创建房间'; closeScoringModal(); openSetupModal(); }
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

    case 'teach_action': { if (renderedGameType === 'chess') sound.playStoneClick('chess'); break; }
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
  const boardChanged = JSON.stringify([currentRoomState?.revision,currentRoomState?.board,currentRoomState?.gameType,currentRoomState?.mode,currentRoomState?.status]) !== JSON.stringify([state.revision,state.board,state.gameType,state.mode,state.status]);
  if (boardChanged) { chessSelection = null; pendingPromotion = null; document.getElementById('promotion-modal').classList.remove('active'); }
  const contextChanged = ['roomId','gameType','mode','revision','boardSize'].some(key => currentRoomState?.[key] !== state[key]);
  if (contextChanged) { selectedTeachTool='move'; chessSetupPiece='move'; markupStart=null; }
  if (boardChanged) markupStart=null;
  currentRoomState = state;
  currentRoomId = state.roomId;
  myRole = state.myRole;
  updateRoleDisplay(myRole);

  // Resize board if changed
  if (renderedGameType !== (state.gameType || 'go')) {
    closeEstimate(); closeScoringModal();
    initBoard(state.boardSize, state.gameType || 'go');
  } else if (board.size !== state.boardSize && renderedGameType === 'go') {
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
    document.getElementById('board-subtitle').textContent = renderedGameType === 'chess' ? '摆棋模式：选择棋子后点击棋盘放置；橡皮可清除棋子。' : '教学模式：双方均可自由指定黑白子、撤销悔棋与摆设死活题。';
  } else {
    modeBadge.textContent = '⚔️ 对战模式';
    modeBadge.className = 'mode-badge match';
    teachPanel.style.display = 'none';
    matchPanel.style.display = 'flex';
    document.getElementById('board-subtitle').textContent = renderedGameType === 'chess' ? '选择棋子，再点击目标格。白方先行。' : '点击交叉点落子，黑白双方轮流进行。';

    if (state.timeControl && state.timeControl.type !== 'none') {
      clocksBox.style.display = 'flex';
    } else {
      clocksBox.style.display = 'none';
    }
  }

  document.getElementById('chess-setup-tools').hidden = renderedGameType !== 'chess' || state.mode !== 'teach';
  document.getElementById('go-markup-tools').hidden = state.mode !== 'teach';
  document.querySelector('.teach-row-mode').hidden = renderedGameType === 'chess';

  // Board visual state update
  if (renderedGameType === 'chess') {
    board.updateState(state.board, { lastMove: state.lastMove, annotations: state.teachState?.annotations || {}, legalMoves: state.chess?.legalMoves || [], clearSelection: boardChanged, interactive: (myRole === 'black' || myRole === 'white') && state.status === 'playing' });
  } else {
  board.hoverColor = state.teachState && state.mode === 'teach'
    ? (state.teachState.placementMode === 'white_only' ? 2 : (state.teachState.placementMode === 'black_only' ? 1 : state.currentTurn))
    : state.currentTurn;

  board.updateState(state.board, {
    lastMove: state.lastMove,
    deadStones: state.scoringState && state.scoringState.active ? state.scoringState.result?.deadStones : {},
    territoryMap: state.scoringState && state.scoringState.active ? state.scoringState.result?.territoryMap : (estimateEnabled ? estimateResult?.territoryMap : null),
    annotations: state.teachState?.annotations || {},
    moveNumbersMap: state.moveNumbersMap || {},
    hoverColor: board.hoverColor,
    interactive: ['black','white'].includes(myRole) && ['playing','scoring'].includes(state.status)
  });
  }

  refreshTeachTools();
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
    const turnMsg = state.currentTurn === 1 ? '轮到黑棋' : '轮到白棋';
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
  document.getElementById('btn-estimate').disabled = state.status === 'scoring' || renderedGameType === 'chess';
  const isPlayer = myRole === 'black' || myRole === 'white';
  document.getElementById('btn-show-scoring').hidden = state.status !== 'scoring';
  document.getElementById('btn-resume-game').hidden = state.status !== 'scoring';
  document.getElementById('btn-resume-game').disabled = !isPlayer;
  document.getElementById('btn-scoring-resume').disabled = !isPlayer;
  document.getElementById('btn-scoring-confirm').disabled = estimatePreview || !isPlayer || !!state.scoringState?.agreed?.[myRole];
  document.getElementById('btn-new-game').disabled = !isPlayer;
  document.getElementById('btn-new-game').textContent = Object.values(state.newGameAgreed || {}).some(Boolean) ? '同意开始新一局' : '开始新一局';
  for (const id of ['btn-match-pass', 'btn-match-score', 'btn-match-resign', 'btn-teach-pass', 'btn-teach-scoring']) document.getElementById(id).disabled = !isPlayer || state.status !== 'playing' || (renderedGameType === 'chess' && id !== 'btn-match-resign');
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

    document.getElementById('btn-teach-undo').disabled = !isPlayer || state.historyLength === 0;
    document.getElementById('btn-teach-redo').disabled = !isPlayer || state.redoLength === 0;
    document.getElementById('btn-step-prev').disabled = state.historyLength === 0;
    document.getElementById('btn-step-next').disabled = state.redoLength === 0;
  }
  updateBoardTitleAndSwitches(state.boardSize);
  const chess = renderedGameType === 'chess';
  document.body.dataset.game = renderedGameType;
  document.getElementById('btn-copy-link').disabled = false;
  for (const id of ['btn-copy-link','btn-open-settings','room-tag']) document.getElementById(id).hidden = false;
  document.getElementById('btn-create-another').textContent = '新房间';
  document.getElementById('btn-open-settings').disabled = !isPlayer;
  document.getElementById('player-black').textContent = `黑方 · ${state.players.black?.name || '等待入座'}`;
  document.getElementById('player-white').textContent = `白方 · ${state.players.white?.name || '等待入座'}`;
  document.getElementById('board-material').textContent = chess ? '经典绿白棋盘 / 参考图棋子'  : '榧木色棋盘 / 黑玉与白贝';
  document.getElementById('btn-flip').hidden = !chess;
  document.querySelector('.board-size-switches').hidden = chess;
  for (const id of ['btn-estimate','btn-match-pass','btn-match-score','btn-teach-pass','btn-teach-scoring','btn-toggle-numbers']) document.getElementById(id).hidden = chess;
  document.getElementById('btn-draw').hidden = !chess;
  document.getElementById('btn-draw').disabled = !isPlayer || state.status !== 'playing' || state.drawOffer === myRole;
  document.getElementById('btn-draw').textContent = state.drawOffer && state.drawOffer !== myRole ? '同意和棋' : state.drawOffer ? '已提和，等待回应' : '提议和棋';
  document.getElementById('match-hint').textContent = chess ? '将军时必须解将；支持易位、吃过路兵及四种升变。' : '双方连续停着或点击“终局点目”进入胜负判定';
  document.getElementById('chess-moves-panel').hidden = !chess || state.mode === 'teach';
  document.getElementById('chess-moves').textContent = state.chess?.moves?.map((m,i) => i % 2 === 0 ? `${Math.floor(i/2)+1}. ${m}` : m).join('  ') || '等待第一步';
  document.getElementById('chess-turn').value = String(state.currentTurn);
  for (const el of document.querySelectorAll('#chess-setup-tools button, #chess-setup-tools select, #btn-teach-reset, .teach-step-nav button')) el.disabled = !isPlayer;
  if (chess) {
    document.getElementById('board-captures-count').textContent = `吃子：白 ${wCaptures} · 黑 ${bCaptures}`;
    turnText.textContent = state.mode === 'teach' ? '自由摆棋' : `${state.currentTurn === 2 ? '白' : '黑'}方行棋${state.chess?.check ? ' · 将军' : ''}`;
    if (state.status === 'finished') turnText.textContent = '对局结束';
    if (state.mode === 'teach') statusEl.textContent = '选择棋子放置；再点已选棋子即可恢复移动。双方可共同编辑。';
  }
  const proposal = state.pendingConfig;
  document.getElementById('config-proposal').hidden = !proposal;
  if (proposal) {
    const cfg = proposal.config;
    document.getElementById('config-proposal-text').textContent = `${proposal.by === 'black' ? '黑' : '白'}方申请：${cfg.gameType === 'chess' ? '国际象棋' : `围棋 ${cfg.boardSize} 路`} · ${cfg.mode === 'teach' ? '教学摆棋' : '正常对弈'}。确认后重置当前棋局，房间链接不变。`;
    document.getElementById('config-accept').hidden = proposal.by === myRole || !isPlayer;
    document.getElementById('config-reject').disabled = !isPlayer;
  }

}

// Click on intersection
async function handleIntersectionClick(r, c) {
  const state = currentRoomState;
  if (!ws || ws.readyState !== WebSocket.OPEN || !state || !['black','white'].includes(myRole)) return;
  if (state.status === 'scoring') { sendAction({type:'toggle_dead',r,c}); return; }
  if (state.status !== 'playing') return;
  if (state.mode === 'teach' && selectedTeachTool !== 'move') {
    if (['line','arrow'].includes(selectedTeachTool)) {
      if (!markupStart) { markupStart={r,c}; refreshTeachTools(); }
      else {
        if (markupStart.r !== r || markupStart.c !== c) sendAction({type:'teach_action',action:'markup',payload:{type:selectedTeachTool,r:markupStart.r,c:markupStart.c,toR:r,toC:c}});
        markupStart=null; refreshTeachTools();
      }
    } else sendAction({type:'teach_action',action:'markup',payload:{type:selectedTeachTool,r,c}});
    return;
  }
  if (renderedGameType === 'chess') {
    if (state.status !== 'playing') return;
    if (state.mode === 'teach' && chessSetupPiece !== 'move') {
      sendAction({ type: 'teach_action', action: 'set_chess_piece', payload: { r, c, piece: chessSetupPiece } }); return;
    }
    const piece = state.board[r][c];
    const own = piece && ((myRole === 'white' && piece === piece.toUpperCase()) || (myRole === 'black' && piece === piece.toLowerCase()));
    if (!chessSelection || (state.mode === 'match' && own)) {
      if (!piece || (state.mode === 'match' && !own)) return;
      chessSelection = {r,c}; board.select(r,c); return;
    }
    const from = chessSelection;
    chessSelection = null; board.clearSelection();
    if (from.r === r && from.c === c) return;
    const action = { type: 'move', r: from.r, c: from.c, toR:r, toC:c };
    if (state.mode === 'match') {
      const legal = state.chess.legalMoves.filter(m => m.from.r === from.r && m.from.c === from.c && m.to.r === r && m.to.c === c);
      if (!legal.length) { showToast('这一步不合法，请选择提示的目标格'); return; }
      if (legal.some(m => m.promotion)) { pendingPromotion = action; document.getElementById('promotion-modal').classList.add('active'); return; }
    }
    sendAction(action); return;
  }
  sendAction({ type: state.status === 'scoring' ? 'toggle_dead' : 'move', r, c });
}

// ==========================================================================
// Setup Dialog & Event Listeners (Figure 1 Modal)
// ==========================================================================

function refreshSetupUI() {
  const chess = selectedGameType === 'chess';
  document.getElementById('setup-title').textContent = setupNewRoom ? '创建房间' : '房间设置';
  document.querySelector('.setup-intro > span:last-child').textContent = setupNewRoom ? '进入房间后，邀请好友共赴一局。' : '更换设置会重置棋局，房间链接与执子身份保留。';
  document.getElementById('btn-submit-match').textContent = setupNewRoom ? '创建房间 · 开始一局' : '应用房间设置';
  document.getElementById('go-options').hidden = chess;
  document.getElementById('chess-options').hidden = !chess;
  document.getElementById('color-options').hidden = !setupNewRoom || selectedMode === 'teach';
  document.querySelectorAll('.go-only-option').forEach(el => el.hidden = chess);
  document.querySelector('.stepper-row').classList.toggle('chess-settings',chess);
  document.getElementById('time-control-select').disabled = selectedMode === 'teach';
  refreshTimeControlUI();
  for (const type of ['go','chess']) document.getElementById(`game-opt-${type}`).classList.toggle('active',type === selectedGameType);
  for (const mode of ['match','teach']) document.getElementById(`mode-opt-${mode}`).classList.toggle('active',mode === selectedMode);
  document.querySelectorAll('.board-size-grid .size-toggle-btn').forEach(btn => btn.classList.toggle('active',Number(btn.dataset.size) === selectedSize));
  document.querySelectorAll('.color-chip').forEach(btn => btn.classList.toggle('active',btn.dataset.color === selectedColorPref));
  document.getElementById('handicap-val').textContent = handicapVal;
  document.getElementById('komi-val').textContent = komiVal;
}
function refreshTimeControlUI() {
  const select = document.getElementById('time-control-select');
  const fields = document.getElementById('time-custom-fields');
  if (!select || !fields) return;
  if (selectedMode === 'teach') {
    select.value = 'none';
    fields.hidden = true;
  } else {
    fields.hidden = select.value !== 'custom';
  }
}
function openSetupModal(newRoom = !currentRoomState) {
  setupNewRoom = newRoom;
  if (currentRoomState) {
    selectedGameType = currentRoomState.gameType;
    selectedMode = currentRoomState.mode;
    selectedSize = currentRoomState.gameType === 'chess' ? 19 : currentRoomState.boardSize;
    handicapVal = currentRoomState.handicap;
    komiVal = currentRoomState.gameType === 'chess' ? 6.5 : currentRoomState.komi;
    document.getElementById('time-control-select').value = currentRoomState.timeControl.type;
    document.getElementById('custom-main-minutes').value = Math.max(1, Math.round((currentRoomState.timeControl.mainTime || 300) / 60));
    document.getElementById('custom-increment-seconds').value = currentRoomState.timeControl.increment || 0;
  }
  refreshSetupUI();
  document.getElementById('match-setup-modal').classList.add('active');
}
function closeSetupModal() { document.getElementById('match-setup-modal').classList.remove('active'); }
function setupModalEventListeners() {
  document.getElementById('btn-copy-link').disabled = !currentRoomId;
  document.getElementById('btn-open-settings').addEventListener('click', () => openSetupModal(!currentRoomState));
  document.getElementById('btn-create-another').addEventListener('click', () => openSetupModal(true));
  document.getElementById('btn-close-modal').addEventListener('click', closeSetupModal);
  document.getElementById('btn-copy-link').addEventListener('click', async () => {
    if (!currentRoomId) return;
    const url = `${location.origin}/?room=${currentRoomId}`;
    try { await navigator.clipboard.writeText(url); showToast('邀请链接已复制，发给好友即可加入'); }
    catch { prompt('请复制邀请链接：',url); }
  });
  for (const game of ['go','chess']) document.getElementById(`game-opt-${game}`).addEventListener('click', () => {
    selectedGameType = game; selectedColorPref = game === 'chess' ? 'white' : 'black'; refreshSetupUI();
  });
  for (const mode of ['match','teach']) document.getElementById(`mode-opt-${mode}`).addEventListener('click', () => { selectedMode = mode; refreshSetupUI(); });
  document.getElementById('time-control-select').addEventListener('change', refreshTimeControlUI);
  document.querySelectorAll('.board-size-grid .size-toggle-btn').forEach(btn => btn.addEventListener('click', () => { selectedSize = Number(btn.dataset.size); handicapVal = Math.min(handicapVal, selectedSize === 19 ? 9 : 5); refreshSetupUI(); }));
  document.querySelectorAll('.color-chip').forEach(btn => btn.addEventListener('click', () => { selectedColorPref = btn.dataset.color; refreshSetupUI(); }));
  for (const [id, delta] of [['btn-handicap-minus',-1],['btn-handicap-plus',1]]) document.getElementById(id).addEventListener('click', () => { handicapVal = Math.max(0,Math.min(selectedSize === 19 ? 9 : 5, handicapVal + delta)); if (handicapVal === 1) handicapVal = delta > 0 ? 2 : 0; refreshSetupUI(); });
  for (const [id, delta] of [['btn-komi-minus',-1],['btn-komi-plus',1]]) document.getElementById(id).addEventListener('click', () => { komiVal = Math.max(0,Math.min(100,komiVal + delta)); refreshSetupUI(); });
  document.getElementById('btn-submit-match').addEventListener('click', async () => {
    if (creatingRoom) return;
    if (currentRoomState && !await confirmAction(setupNewRoom ? '将离开当前房间并创建新房间，继续吗？' : '应用设置将重新开始棋局。正式对弈双方在线时需对手确认；房间链接保持不变。继续吗？')) return;
    const timeControl = selectedMode === 'teach' ? 'none' : document.getElementById('time-control-select').value;
    const config = { gameType:selectedGameType, boardSize:selectedSize, mode:selectedMode, colorPref:selectedColorPref,
      handicap:handicapVal, komi:komiVal, timeControl,
      customMainTime: Math.max(1, Number(document.getElementById('custom-main-minutes').value || 5)) * 60,
      customIncrement: Math.max(0, Number(document.getElementById('custom-increment-seconds').value || 0)) };
    if (sendAction(setupNewRoom ? { type:'create_room', playerName:localStorage.getItem('weiqi_player_name') || '棋友', config } : { type:'configure_room', config })) {
      creatingRoom = setupNewRoom; document.getElementById('btn-submit-match').disabled = true;
    }
  });
  document.querySelectorAll('.board-size-switches .board-size-btn').forEach(btn => btn.addEventListener('click', async () => {
    const size = Number(btn.dataset.size);
    if (!currentRoomState) { selectedSize = size; openSetupModal(); return; }
    if (size === currentRoomState.boardSize) return;
    if (currentRoomState.mode === 'teach' && currentRoomState.historyLength && !await confirmAction('切换棋盘将清空当前摆棋，继续吗？')) return;
    sendAction({ type:'change_board_size', boardSize:size });
  }));
  document.getElementById('btn-audio-toggle').addEventListener('click', () => {
    sound.enabled = !sound.enabled; localStorage.setItem('boardroom_sound',String(sound.enabled));
    document.getElementById('audio-icon').textContent = sound.enabled ? '🔊' : '🔇';
    showToast(sound.enabled ? '音效已开启' : '音效已静音');
  });
  document.getElementById('btn-flip').addEventListener('click', () => board.flip?.());
  for (const [id,accept] of [['config-accept',true],['config-reject',false]]) document.getElementById(id).addEventListener('click', () => sendAction({type:'respond_config',id:currentRoomState?.pendingConfig?.id,accept}));
  document.getElementById('btn-draw').addEventListener('click', () => sendAction({type:'offer_draw'}));
  document.querySelectorAll('[data-promotion]').forEach(btn => btn.addEventListener('click', () => {
    if (pendingPromotion) sendAction({...pendingPromotion,promotion:btn.dataset.promotion});
    pendingPromotion = null; document.getElementById('promotion-modal').classList.remove('active');
  }));
  document.getElementById('promotion-cancel').addEventListener('click', () => { pendingPromotion = null; document.getElementById('promotion-modal').classList.remove('active'); });
}

// ==========================================================================
// Teaching Mode Controls (Figure 2 Blue Dashed Box)
// ==========================================================================

function canUseTeachTools() {
  return currentRoomState?.mode === 'teach' && currentRoomState.status === 'playing' && ['black','white'].includes(myRole);
}
function refreshTeachTools() {
  const enabled=canUseTeachTools();
  document.querySelectorAll('.markup-tool').forEach(btn => {
    const active=btn.dataset.tool === selectedTeachTool;
    btn.classList.toggle('active',active); btn.disabled=!enabled;
    if(btn.dataset.tool !== 'clear') btn.setAttribute('aria-pressed',String(active));
  });
  document.querySelectorAll('.chess-palette-btn').forEach(btn => {
    const active=String(chessSetupPiece) === btn.dataset.piece;
    btn.classList.toggle('active',active); btn.setAttribute('aria-pressed',String(active)); btn.disabled=!enabled;
  });
  board?.setMarkupMode?.(enabled && selectedTeachTool !== 'move');
  const hints={triangle:'点击棋子或空点标记三角形',square:'点击棋子或空点标记方形',circle:'点击棋子或空点标记圆形',cross:'点击棋子或空点标记叉号',number:'点击自动编号',letter:'点击添加字母',line:'依次点击起点和终点',arrow:'依次点击起点和终点',eraser:'点击擦除标记；线段点任一端点'};
  document.getElementById('markup-tool-hint').textContent=markupStart ? '请选择终点；再点起点取消' : selectedTeachTool === 'move' ? '选择工具开始标记，再点一次恢复下棋' : (hints[selectedTeachTool]+' · 再点工具退出');
}

function setupTeachPanelEventListeners() {
  document.querySelectorAll('.markup-tool').forEach(btn => {
    btn.setAttribute('aria-label',btn.title);
    btn.addEventListener('click', () => {
      if (!canUseTeachTools()) return;
      markupStart=null;
      if (btn.dataset.tool === 'clear') {
        sendAction({type:'teach_action',action:'clear_annotations'});
      } else {
        selectedTeachTool=selectedTeachTool === btn.dataset.tool ? 'move' : btn.dataset.tool;
        chessSetupPiece='move'; chessSelection=null; board.clearSelection?.();
      }
      refreshTeachTools();
    });
  });
  document.getElementById('chess-clear').addEventListener('click', async () => { if (await confirmAction('清空棋盘上的所有棋子？可以通过撤销恢复。')) sendAction({type:'teach_action',action:'clear_board'}); });
  document.getElementById('chess-turn').addEventListener('change', e => sendAction({type:'teach_action',action:'set_turn',payload:{color:Number(e.target.value)}}));
  document.querySelectorAll('.chess-palette-btn').forEach(btn => {
    const piece=btn.dataset.piece;
    if (!['move','0'].includes(piece)) { btn.innerHTML=pieceSVG(piece,'palette-'+piece); btn.setAttribute('aria-label', (piece === piece.toUpperCase() ? '白' : '黑')+({p:'兵',n:'马',b:'象',r:'车',q:'后',k:'王'}[piece.toLowerCase()])); }
  });
  document.querySelectorAll('.chess-palette-btn').forEach(btn => btn.addEventListener('click', () => {
    if (!canUseTeachTools()) return;
    const piece=btn.dataset.piece === '0' ? 0 : btn.dataset.piece;
    chessSetupPiece=chessSetupPiece === piece ? 'move' : piece;
    selectedTeachTool='move'; markupStart=null;
    chessSelection = null; board.clearSelection?.();
    refreshTeachTools();
  }));
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
  document.getElementById('audio-icon').textContent = sound.enabled ? '🔊' : '🔇';
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
