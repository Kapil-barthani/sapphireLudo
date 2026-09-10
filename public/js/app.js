/**
 * Ludo Kingdom Client Controller
 * Exact 1:1 reproduction of reference screenshot layout,
 * Real-time Voice Chat (Mic & Speaker), 3D Dice, Step Animations, and Overlay Chat.
 */

(function () {
  const socket = io();
  const voiceChat = new window.VoiceChatManager(socket);

  // Local state
  let currentRoomId = null;
  let myRole = 'player'; // 'player' or 'spectator'
  let myColor = 'green'; // 'green', 'red', 'yellow', 'blue'
  let isHost = false;
  let gameState = null;
  let isAnimatingMove = false;
  let isRollingDice = false;
  let autoMoveEnabled = false;

  // Persistent Player ID
  let myPlayerId = localStorage.getItem('ludo_player_id');
  if (!myPlayerId) {
    myPlayerId = 'p_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
    localStorage.setItem('ludo_player_id', myPlayerId);
  }

  // DOM Elements
  const boardEl = document.getElementById('ludo-board');
  const tokenLayerEl = document.getElementById('token-layer');
  const dice3DEl = document.getElementById('dice-3d');
  const dicePedestalWrapper = document.getElementById('dice-pedestal-wrapper');
  const diceDockEl = document.getElementById('dice-dock');
  const pedestalGlowEl = document.getElementById('pedestal-glow');
  const diceLabelEl = document.getElementById('dice-label');
  const autoMoveBtn = document.getElementById('auto-move-btn');
  const roomCodeDisplay = document.getElementById('room-code-display');
  const roomBadge = document.getElementById('room-code-badge');
  const spectatorBanner = document.getElementById('spectator-banner');
  const unreadChatDot = document.getElementById('unread-chat-dot');
  const gameStatusToast = document.getElementById('game-status-toast');
  const toastText = document.getElementById('toast-text');
  const toastIcon = document.getElementById('toast-icon');
  const leaveRoomBtn = document.getElementById('leave-room-btn');
  const modalLeaveGameBtn = document.getElementById('modal-leave-game-btn');
  const activeGameBanner = document.getElementById('active-game-banner');
  const activeGameRoomId = document.getElementById('active-game-room-id');

  // Token cache
  const tokenEls = {
    green: [],
    red: [],
    yellow: [],
    blue: []
  };

  // Set status toast message
  function showStatusToast(text, icon = '🎲', color = null) {
    if (toastText) toastText.textContent = text;
    if (toastIcon) toastIcon.textContent = icon;
    if (gameStatusToast) {
      gameStatusToast.className = 'game-status-toast';
      if (color) gameStatusToast.classList.add(`turn-${color}`);
    }
  }

  // Initialize tokens in their yard slots immediately
  function placeTokensInYards() {
    const colors = ['green', 'red', 'yellow', 'blue'];
    const boardWidth = boardEl.clientWidth || 500;
    const cellSize = boardWidth / 15;

    colors.forEach(color => {
      for (let i = 0; i < 4; i++) {
        const tokenEl = tokenEls[color]?.[i];
        if (tokenEl) {
          const [row, col] = LudoCoords.YARD_SLOTS[color][i];
          tokenEl.style.left = `${(col + 0.5) * cellSize}px`;
          tokenEl.style.top = `${(row + 0.5) * cellSize}px`;
        }
      }
    });
  }

  // Voice & Nav Buttons
  const toggleMicBtn = document.getElementById('toggle-mic-btn');
  const micIcon = document.getElementById('mic-icon');
  const toggleSpeakerBtn = document.getElementById('toggle-speaker-btn');
  const speakerIcon = document.getElementById('speaker-icon');
  const openMenuBtn = document.getElementById('open-menu-btn');
  const openChatBtn = document.getElementById('open-chat-btn');
  const closeChatBtn = document.getElementById('close-chat-btn');
  const chatOverlayModal = document.getElementById('chat-overlay-modal');
  const chatMessagesEl = document.getElementById('chat-messages');
  const chatForm = document.getElementById('chat-form');
  const chatInput = document.getElementById('chat-input');
  const wheelBtn = document.getElementById('wheel-btn');

  // Modals
  const gameMenuModal = document.getElementById('game-menu-modal');
  const closeMenuBtn = document.getElementById('close-menu-btn');
  const roomLobbyModal = document.getElementById('room-lobby-modal');
  const lobbyRoomCode = document.getElementById('lobby-room-code');
  const lobbyRoster = document.getElementById('lobby-roster');
  const lobbyStatusBanner = document.getElementById('lobby-status-banner');
  const lobbyStartGameBtn = document.getElementById('lobby-start-game-btn');
  const lobbyWaitText = document.getElementById('lobby-wait-text');
  const lobbyCopyCodeBtn = document.getElementById('lobby-copy-code-btn');
  const lobbyCopyLinkBtn = document.getElementById('lobby-copy-link-btn');
  const closeLobbyBtn = document.getElementById('close-lobby-btn');
  const victoryModal = document.getElementById('victory-modal');
  const victoryPodium = document.getElementById('victory-podium');
  const rematchBtn = document.getElementById('rematch-btn');
  const victoryLeaveBtn = document.getElementById('victory-leave-btn');
  const victoryLobbyBtn = document.getElementById('victory-lobby-btn');

  // Dice rotations
  const DICE_ROTATIONS = {
    1: { x: 0, y: 0 },
    2: { x: 0, y: -90 },
    3: { x: -90, y: 0 },
    4: { x: 90, y: 0 },
    5: { x: 0, y: 90 },
    6: { x: 0, y: 180 }
  };

  // Build 15x15 board matching the screenshot
  function buildBoardGrid() {
    boardEl.innerHTML = '';

    // 1. Green Yard (Top Left)
    const greenYard = document.createElement('div');
    greenYard.className = 'yard yard-green';
    greenYard.dataset.color = 'green';
    greenYard.innerHTML = `
      <div class="yard-inner">
        <div class="yard-slot" data-color="green" data-slot="0"></div><div class="yard-slot" data-color="green" data-slot="1"></div>
        <div class="yard-slot" data-color="green" data-slot="2"></div><div class="yard-slot" data-color="green" data-slot="3"></div>
      </div>
    `;
    greenYard.addEventListener('click', () => onYardClick('green'));
    boardEl.appendChild(greenYard);

    // 2. Red Yard (Top Right)
    const redYard = document.createElement('div');
    redYard.className = 'yard yard-red';
    redYard.dataset.color = 'red';
    redYard.innerHTML = `
      <div class="yard-inner">
        <div class="yard-slot" data-color="red" data-slot="0"></div><div class="yard-slot" data-color="red" data-slot="1"></div>
        <div class="yard-slot" data-color="red" data-slot="2"></div><div class="yard-slot" data-color="red" data-slot="3"></div>
      </div>
    `;
    redYard.addEventListener('click', () => onYardClick('red'));
    boardEl.appendChild(redYard);

    // 3. Blue Yard (Bottom Left)
    const blueYard = document.createElement('div');
    blueYard.className = 'yard yard-blue';
    blueYard.dataset.color = 'blue';
    blueYard.innerHTML = `
      <div class="yard-inner">
        <div class="yard-slot" data-color="blue" data-slot="0"></div><div class="yard-slot" data-color="blue" data-slot="1"></div>
        <div class="yard-slot" data-color="blue" data-slot="2"></div><div class="yard-slot" data-color="blue" data-slot="3"></div>
      </div>
    `;
    blueYard.addEventListener('click', () => onYardClick('blue'));
    boardEl.appendChild(blueYard);

    // 4. Yellow Yard (Bottom Right)
    const yellowYard = document.createElement('div');
    yellowYard.className = 'yard yard-yellow';
    yellowYard.dataset.color = 'yellow';
    yellowYard.innerHTML = `
      <div class="yard-inner">
        <div class="yard-slot" data-color="yellow" data-slot="0"></div><div class="yard-slot" data-color="yellow" data-slot="1"></div>
        <div class="yard-slot" data-color="yellow" data-slot="2"></div><div class="yard-slot" data-color="yellow" data-slot="3"></div>
      </div>
    `;
    yellowYard.addEventListener('click', () => onYardClick('yellow'));
    boardEl.appendChild(yellowYard);

    // 5. Center 3x3 Home Triangle Convergence (Exact SVG 4-color convergence)
    const centerHome = document.createElement('div');
    centerHome.className = 'center-home';
    centerHome.innerHTML = `
      <svg viewBox="0 0 120 120" style="position: absolute; top: 0; left: 0; width: 120px; height: 120px; display: block;">
        <defs>
          <linearGradient id="grad-green" x1="0%" y1="50%" x2="100%" y2="50%">
            <stop offset="0%" stop-color="#22B96B"/>
            <stop offset="100%" stop-color="#199353"/>
          </linearGradient>
          <linearGradient id="grad-red" x1="50%" y1="0%" x2="50%" y2="100%">
            <stop offset="0%" stop-color="#E8384F"/>
            <stop offset="100%" stop-color="#BA2135"/>
          </linearGradient>
          <linearGradient id="grad-yellow" x1="100%" y1="50%" x2="0%" y2="50%">
            <stop offset="0%" stop-color="#F5B930"/>
            <stop offset="100%" stop-color="#C98F12"/>
          </linearGradient>
          <linearGradient id="grad-blue" x1="50%" y1="100%" x2="50%" y2="0%">
            <stop offset="0%" stop-color="#3A82F2"/>
            <stop offset="100%" stop-color="#2464C9"/>
          </linearGradient>
        </defs>
        <!-- Green Triangle (Left edge to center 60,60) -->
        <polygon points="0,0 60,60 0,120" fill="url(#grad-green)" />
        <!-- Red Triangle (Top edge to center 60,60) -->
        <polygon points="0,0 120,0 60,60" fill="url(#grad-red)" />
        <!-- Yellow Triangle (Right edge to center 60,60) -->
        <polygon points="120,0 120,120 60,60" fill="url(#grad-yellow)" />
        <!-- Blue Triangle (Bottom edge to center 60,60) -->
        <polygon points="0,120 120,120 60,60" fill="url(#grad-blue)" />
      </svg>
      <div class="center-trophy">👑</div>
    `;
    boardEl.appendChild(centerHome);

    // 6. 15x15 Track Cells
    for (let r = 0; r < 15; r++) {
      for (let c = 0; c < 15; c++) {
        // Skip yard areas
        if ((r < 6 && c < 6) || (r < 6 && c > 8) || (r > 8 && c < 6) || (r > 8 && c > 8)) continue;
        // Skip center 3x3
        if (r >= 6 && r <= 8 && c >= 6 && c <= 8) continue;

        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.style.gridRow = r + 1;
        cell.style.gridColumn = c + 1;

        // Home Runways
        if (r === 7 && c >= 1 && c <= 5) cell.classList.add('runway-green');
        else if (c === 7 && r >= 1 && r <= 5) cell.classList.add('runway-red');
        else if (r === 7 && c >= 9 && c <= 13) cell.classList.add('runway-yellow');
        else if (c === 7 && r >= 9 && r <= 13) cell.classList.add('runway-blue');

        // "HOME" label cells on the 4 arm caps (from screenshot)
        if ((r === 7 && c === 0) || (r === 0 && c === 7) || (r === 7 && c === 14) || (r === 14 && c === 7)) {
          cell.classList.add('home-label');
        }

        // Starting cells
        if (r === 6 && c === 1) cell.classList.add('cell-start-green');
        else if (r === 1 && c === 8) cell.classList.add('cell-start-red');
        else if (r === 8 && c === 13) cell.classList.add('cell-start-yellow');
        else if (r === 13 && c === 6) cell.classList.add('cell-start-blue');

        // Safe Rings (from screenshot)
        if (r === 2 && c === 6) cell.classList.add('ring-safe', 'ring-gold');
        else if (r === 6 && c === 12) cell.classList.add('ring-safe', 'ring-red');
        else if (r === 12 && c === 8) cell.classList.add('ring-safe', 'ring-gold');
        else if (r === 8 && c === 2) cell.classList.add('ring-safe', 'ring-blue');

        boardEl.appendChild(cell);
      }
    }

    if (tokenLayerEl && !boardEl.contains(tokenLayerEl)) {
      boardEl.appendChild(tokenLayerEl);
    }
  }

  // Build 3D tokens (supports 2-player, 3-player, and 4-player activeColors)
  function buildTokens(activeColors) {
    tokenLayerEl.innerHTML = '';
    const allColors = ['green', 'red', 'yellow', 'blue'];
    const colors = activeColors || (gameState ? gameState.activeColors : allColors);

    allColors.forEach(c => {
      tokenEls[c] = [];
      const yardEl = document.querySelector(`.yard-${c}`);
      if (yardEl) {
        yardEl.style.opacity = colors.includes(c) ? '1' : '0.28';
      }
    });

    colors.forEach(color => {
      tokenEls[color] = [];
      for (let i = 0; i < 4; i++) {
        const token = document.createElement('div');
        token.className = `token token-${color}`;
        token.dataset.color = color;
        token.dataset.index = i;
        const handleSelect = (e) => {
          e.stopPropagation();
          onTokenClick(color, i);
        };
        token.addEventListener('pointerdown', handleSelect);
        token.addEventListener('click', handleSelect);
        tokenLayerEl.appendChild(token);
        tokenEls[color].push(token);
      }
    });
  }

  // Position tokens on board
  function updateTokenPositions(state) {
    if (!state) return;

    const cellOccupancy = {};

    state.activeColors.forEach(color => {
      const player = state.players[color];
      player.tokens.forEach((step, tokenIdx) => {
        let key = `${color}_yard_${tokenIdx}`;
        if (step >= 0) {
          const [r, c] = LudoCoords.getTokenCoordinate(color, tokenIdx, step);
          key = `cell_${r.toFixed(2)}_${c.toFixed(2)}`;
        }
        if (!cellOccupancy[key]) cellOccupancy[key] = [];
        cellOccupancy[key].push({ color, tokenIdx, step });
      });
    });

    state.activeColors.forEach(color => {
      const player = state.players[color];
      player.tokens.forEach((step, tokenIdx) => {
        const tokenEl = tokenEls[color][tokenIdx];
        if (!tokenEl) return;

        const [row, col] = LudoCoords.getTokenCoordinate(color, tokenIdx, step);
        const boardWidth = boardEl.clientWidth;
        const cellSize = boardWidth / 15;

        let left = (col + 0.5) * cellSize;
        let top = (row + 0.5) * cellSize;

        let key = (step === -1) ? `${color}_yard_${tokenIdx}` : `cell_${row.toFixed(2)}_${col.toFixed(2)}`;
        if (cellOccupancy[key] && cellOccupancy[key].length > 1) {
          const occList = cellOccupancy[key];
          const posIdx = occList.findIndex(o => o.color === color && o.tokenIdx === tokenIdx);
          const spread = cellSize * 0.22;
          const offsets = [
            [-spread, -spread],
            [spread, -spread],
            [-spread, spread],
            [spread, spread]
          ];
          if (offsets[posIdx]) {
            left += offsets[posIdx][0];
            top += offsets[posIdx][1];
          }
        }

        tokenEl.style.left = `${left}px`;
        tokenEl.style.top = `${top}px`;

        const isMyTurn = (myRole === 'player') && (gameState.mode === 'pass_and_play' || myColor === gameState.currentTurnColor);
        const canMoveThis = isMyTurn && gameState.turnPhase === 'MOVE' && gameState.currentTurnColor === color && gameState.validMoves.includes(tokenIdx);
        if (canMoveThis) {
          tokenEl.classList.add('can-move');
          tokenEl.style.zIndex = '60';
        } else {
          tokenEl.classList.remove('can-move');
          tokenEl.style.zIndex = '10';
        }
      });
    });
  }

  // Animate token walking along the track
  async function animateTokenMovement(moveData) {
    isAnimatingMove = true;
    const { playerColor, tokenIndex, stepPath, oldStep, newStep, captured, reachedHome, fromYard } = moveData;
    const tokenEl = tokenEls[playerColor]?.[tokenIndex];

    if (!tokenEl) {
      updateTokenPositions(gameState);
      isAnimatingMove = false;
      return;
    }

    tokenEl.style.zIndex = '100';

    if (fromYard || stepPath.length <= 1) {
      window.ludoAudio.playTokenHop();
      tokenEl.style.transform = 'translate(-50%, -85%) scale(1.35)';
      tokenEl.style.filter = 'brightness(1.25) drop-shadow(0 10px 18px rgba(0,0,0,0.5))';
      updateTokenPositions(gameState);
      await delay(280);
      tokenEl.style.transform = '';
      tokenEl.style.filter = '';
    } else {
      for (const step of stepPath) {
        const [row, col] = LudoCoords.getTokenCoordinate(playerColor, tokenIndex, step);
        const cellSize = boardEl.clientWidth / 15;
        tokenEl.style.left = `${(col + 0.5) * cellSize}px`;
        tokenEl.style.top = `${(row + 0.5) * cellSize}px`;

        window.ludoAudio.playTokenHop();
        await delay(120);
      }
    }

    if (captured) {
      window.ludoAudio.playCapture();
      spawnFloatingReaction('💥', playerColor);
    } else if (reachedHome) {
      window.ludoAudio.playVictory();
      spawnFloatingReaction('⭐', playerColor);
    } else if (newStep >= 0 && newStep <= 51) {
      const global = (LudoCoords.START_OFFSETS[playerColor] + newStep) % 52;
      if (LudoCoords.SAFE_GLOBAL_CELLS.includes(global)) {
        window.ludoAudio.playSafe();
      }
    }

    tokenEl.style.zIndex = '';
    updateTokenPositions(gameState);
    isAnimatingMove = false;

    // Handle auto-move if enabled
    if (autoMoveEnabled) {
      checkAutoMove();
    }
  }

  // Token Click Handler
  let lastTokenClickTime = 0;
  let singleMoveTimer = null;

  function onTokenClick(color, tokenIndex) {
    if (singleMoveTimer) {
      clearTimeout(singleMoveTimer);
      singleMoveTimer = null;
    }
    const now = Date.now();
    if (now - lastTokenClickTime < 160) return;
    lastTokenClickTime = now;

    if (isAnimatingMove || isRollingDice) return;
    if (!gameState || gameState.turnPhase !== 'MOVE') return;
    if (myRole === 'spectator') return;

    const canPlayThisColor = (gameState.mode === 'pass_and_play' || myColor === color);
    if (!canPlayThisColor || gameState.currentTurnColor !== color) return;

    if (!gameState.validMoves.includes(tokenIndex)) return;

    socket.emit('move_token', { tokenIndex }, (res) => {
      if (!res.success) console.warn('Move error:', res.error);
    });
  }

  // Yard Click Handler: Allows tapping anywhere in the yard box or yard slot
  function onYardClick(color) {
    if (isAnimatingMove || isRollingDice) return;
    if (!gameState || gameState.turnPhase !== 'MOVE') return;
    const isMyTurn = (myRole === 'player') && (gameState.mode === 'pass_and_play' || myColor === gameState.currentTurnColor);
    if (!isMyTurn || gameState.currentTurnColor !== color) return;

    const player = gameState.players[color];
    if (!player) return;

    // Only move a yard token out if 6 was rolled and any token is still in yard!
    const yardValidIdx = gameState.validMoves.find(idx => player.tokens[idx] === -1);
    if (yardValidIdx !== undefined) {
      onTokenClick(color, yardValidIdx);
    }
  }

  // Smart Board Click Resolver:
  // When clicking on or near any movable token on the board (within 46px),
  // accurately finds and moves THAT EXACT TOKEN without offset!
  boardEl?.addEventListener('click', (e) => {
    // If the click directly hit a .token, token's own listener handles it
    if (e.target.closest('.token')) return;
    if (isAnimatingMove || isRollingDice) return;
    if (!gameState || gameState.turnPhase !== 'MOVE') return;

    const isMyTurn = (myRole === 'player') && (gameState.mode === 'pass_and_play' || myColor === gameState.currentTurnColor);
    if (!isMyTurn) return;

    const currentColor = gameState.currentTurnColor;
    const validMoves = gameState.validMoves;
    if (!validMoves || validMoves.length === 0) return;

    const clickX = e.clientX;
    const clickY = e.clientY;

    let closestTokenIdx = null;
    let minDistance = 46;

    validMoves.forEach(tokenIdx => {
      const tokenEl = tokenEls[currentColor]?.[tokenIdx];
      if (!tokenEl) return;
      const rect = tokenEl.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const dist = Math.hypot(clickX - centerX, clickY - centerY);
      if (dist < minDistance) {
        minDistance = dist;
        closestTokenIdx = tokenIdx;
      }
    });

    if (closestTokenIdx !== null) {
      onTokenClick(currentColor, closestTokenIdx);
    }
  });

  // Auto-move for single valid choices (e.g. 6 rolled with tokens in yard, or only 1 movable token)
  function checkSingleChoiceAutoExit() {
    if (singleMoveTimer) clearTimeout(singleMoveTimer);
    if (!gameState || isAnimatingMove || isRollingDice) return;
    if (gameState.turnPhase !== 'MOVE') return;

    const isMyTurn = (myRole === 'player') && (gameState.mode === 'pass_and_play' || myColor === gameState.currentTurnColor);
    if (!isMyTurn) return;

    const currentColor = gameState.currentTurnColor;
    const player = gameState.players[currentColor];
    if (!player || !gameState.validMoves || gameState.validMoves.length === 0) return;

    // If all movable tokens are in the yard (step -1, standard 6 roll exit) or only 1 valid move exists
    const allMovableInYard = gameState.validMoves.every(idx => player.tokens[idx] === -1);
    const isSingleChoice = (gameState.validMoves.length === 1) || allMovableInYard;

    if (isSingleChoice) {
      const chosenTokenIdx = gameState.validMoves[0];
      singleMoveTimer = setTimeout(() => {
        if (gameState && gameState.turnPhase === 'MOVE' && gameState.currentTurnColor === currentColor && !isAnimatingMove && !isRollingDice) {
          onTokenClick(currentColor, chosenTokenIdx);
        }
      }, 550);
    }
  }

  // 3D Dice Roll Animation
  function triggerDiceRoll(rollValue, onFinish) {
    if (singleMoveTimer) clearTimeout(singleMoveTimer);
    isRollingDice = true;
    window.ludoAudio.playDiceRoll();

    const extraX = (Math.floor(Math.random() * 3) + 2) * 360;
    const extraY = (Math.floor(Math.random() * 3) + 2) * 360;
    const target = DICE_ROTATIONS[rollValue] || { x: 0, y: 0 };

    dice3DEl.style.transition = 'transform 0.75s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
    dice3DEl.style.transform = `rotateX(${target.x + extraX}deg) rotateY(${target.y + extraY}deg)`;

    setTimeout(() => {
      isRollingDice = false;
      if (rollValue === 6) {
        window.ludoAudio.playSix();
      }
      if (onFinish) onFinish();

      if (autoMoveEnabled) {
        checkAutoMove();
      } else {
        checkSingleChoiceAutoExit();
      }
    }, 750);
  }

  // Roll Dice Action
  function onRollDiceClicked() {
    if (isRollingDice || isAnimatingMove) return;
    if (!gameState) return;

    if (gameState.turnPhase === 'LOBBY') {
      showStatusToast('Waiting for all players to join before starting!', '⏳', 'gold');
      roomLobbyModal?.classList.remove('hidden');
      return;
    }

    // If player taps dice during MOVE phase, execute their valid move!
    if (gameState.turnPhase === 'MOVE') {
      const isMyTurn = (myRole === 'player') && (gameState.mode === 'pass_and_play' || myColor === gameState.currentTurnColor);
      if (isMyTurn && gameState.validMoves && gameState.validMoves.length > 0) {
        const currentColor = gameState.currentTurnColor;
        const player = gameState.players[currentColor];
        const yardToken = gameState.validMoves.find(idx => player?.tokens[idx] === -1);
        const chosenIdx = (yardToken !== undefined) ? yardToken : gameState.validMoves[0];
        onTokenClick(currentColor, chosenIdx);
        return;
      }
    }

    if (gameState.turnPhase !== 'ROLL') return;
    if (myRole === 'spectator') return;

    const canRoll = (gameState.mode === 'pass_and_play' || myColor === gameState.currentTurnColor);
    if (!canRoll) return;

    socket.emit('roll_dice', {}, (res) => {
      if (!res.success) console.warn('Roll error:', res.error);
    });
  }

  // Auto-move helper
  function checkAutoMove() {
    if (singleMoveTimer) clearTimeout(singleMoveTimer);
    if (!gameState || isAnimatingMove || isRollingDice) return;
    const isMyTurn = (myRole === 'player') && (gameState.mode === 'pass_and_play' || myColor === gameState.currentTurnColor);
    if (!isMyTurn) return;

    if (gameState.turnPhase === 'ROLL') {
      setTimeout(() => onRollDiceClicked(), 400);
    } else if (gameState.turnPhase === 'MOVE' && gameState.validMoves.length > 0) {
      setTimeout(() => {
        const tokenIdx = gameState.validMoves[0];
        onTokenClick(gameState.currentTurnColor, tokenIdx);
      }, 500);
    }
  }

  // Spawn floating emoji reaction
  function spawnFloatingReaction(emoji, color) {
    const bubble = document.createElement('div');
    bubble.className = 'floating-reaction';
    bubble.textContent = emoji;

    const positions = {
      green: { top: '15%', left: '15%' },
      red: { top: '15%', left: '85%' },
      blue: { top: '85%', left: '15%' },
      yellow: { top: '85%', left: '85%' }
    };

    const pos = positions[color] || { top: '50%', left: '50%' };
    bubble.style.top = pos.top;
    bubble.style.left = pos.left;

    const wrapper = document.getElementById('board-wrapper');
    wrapper.appendChild(bubble);

    setTimeout(() => {
      if (bubble.parentNode) bubble.parentNode.removeChild(bubble);
    }, 2200);
  }

  // Traveling Dice Dock: Positions next to each player's profile pod
  const DICE_DOCK_POSITIONS = {
    green:  { top: '216px', left: '95px' },
    red:    { top: '216px', left: '1107px' },
    yellow: { top: '516px', left: '1107px' },
    blue:   { top: '516px', left: '95px' }
  };

  function updateDiceDockPosition(color, phase) {
    if (!diceDockEl) return;
    const targetColor = color || 'green';
    const pos = DICE_DOCK_POSITIONS[targetColor] || DICE_DOCK_POSITIONS.green;
    diceDockEl.style.top = pos.top;
    diceDockEl.style.left = pos.left;

    if (pedestalGlowEl) {
      pedestalGlowEl.className = `pedestal-glow glow-${targetColor}`;
    }

    if (diceLabelEl) {
      const isMyTurn = (myRole === 'player') && (gameState?.mode === 'pass_and_play' || myColor === targetColor);
      if (phase === 'MOVE') {
        diceLabelEl.textContent = isMyTurn ? 'MOVE GOTI' : `${targetColor.toUpperCase()} MOVING`;
      } else if (phase === 'ROLL') {
        diceLabelEl.textContent = isMyTurn ? 'TAP TO ROLL' : `${targetColor.toUpperCase()}'S TURN`;
      } else if (phase === 'GAME_OVER') {
        diceLabelEl.textContent = 'GAME OVER';
      } else if (phase === 'LOBBY') {
        diceLabelEl.textContent = 'LOBBY';
      } else {
        diceLabelEl.textContent = isMyTurn ? 'ROLL' : `${targetColor.toUpperCase()}`;
      }
    }
  }

  // Update Player Pods, Turn Spinners, and UI
  function updateUIState(state) {
    if (!state) return;
    gameState = state;

    const currentColor = state.currentTurnColor;
    const allColors = ['green', 'red', 'yellow', 'blue'];

    // Move dice dock to active player's profile pod
    updateDiceDockPosition(currentColor, state.turnPhase);

    // Update Player Pods
    allColors.forEach(c => {
      const p = state.players[c];
      const podEl = document.getElementById(`pod-${c}`);
      const spinnerEl = document.getElementById(`timer-spinner-${c}`);

      if (p) {
        if (podEl) {
          podEl.style.display = 'flex';
          if (p.hasLeft) {
            podEl.classList.add('player-left');
            podEl.style.opacity = '0.38';
          } else {
            podEl.classList.remove('player-left');
            podEl.style.opacity = '1';
          }
        }
        const nameEl = document.getElementById(`name-${c}`);
        const scoreEl = document.getElementById(`score-${c}`);
        if (nameEl) nameEl.textContent = p.hasLeft ? `${p.name} (Left)` : p.name;
        if (scoreEl) {
          if (p.hasLeft) {
            scoreEl.textContent = 'Left Game';
          } else {
            const statusSuffix = p.hasCaptured ? '⚔️ Unlocked' : '🔒 Need Kill';
            scoreEl.textContent = `${p.finishedCount}/4 Home · ${statusSuffix}`;
          }
        }

        // Turn Spinner & Turn Tag (Only active color shows the spinner and tag!)
        if (spinnerEl) {
          if (c === currentColor && state.turnPhase !== 'GAME_OVER' && !p.hasLeft) {
            spinnerEl.classList.remove('hidden');
          } else {
            spinnerEl.classList.add('hidden');
          }
        }
        const turnTagEl = document.getElementById(`turn-tag-${c}`);
        if (turnTagEl) {
          if (c === currentColor && state.turnPhase !== 'GAME_OVER' && state.turnPhase !== 'LOBBY' && !p.hasLeft) {
            turnTagEl.classList.remove('hidden');
          } else {
            turnTagEl.classList.add('hidden');
          }
        }
      } else if (podEl) {
        // Not playing in 2-player or 3-player mode
        podEl.style.display = 'none';
      }
    });

    // Update Toast message for clear player feedback
    const isMyTurn = (myRole === 'player') && (state.mode === 'pass_and_play' || myColor === currentColor);
    const activePlayerName = state.players[currentColor]?.name || currentColor;
    const activePlayerHasCaptured = state.players[currentColor]?.hasCaptured;

    if (state.turnPhase === 'LOBBY') {
      showStatusToast('Waiting for all players to join the room...', '👥', 'gold');
    } else if (state.turnPhase === 'GAME_OVER') {
      showStatusToast(`Game Over! ${state.players[state.winners[0]]?.name} Won!`, '🏆', currentColor);
    } else if (state.turnPhase === 'ROLL') {
      if (isMyTurn) {
        const killNote = activePlayerHasCaptured ? '' : ' (Kill needed to enter Home)';
        showStatusToast(`Your Turn (${activePlayerName})! Tap dice to roll.${killNote}`, '🎲', currentColor);
      } else {
        showStatusToast(`${activePlayerName}'s Turn - Rolling the dice...`, '⏳', currentColor);
      }
    } else if (state.turnPhase === 'MOVE') {
      if (isMyTurn) {
        if (state.currentRoll === 6) {
          showStatusToast('🎉 Rolled a 6! Moving goti out to board... (Tap goti / yard / dice)', '🚀', currentColor);
        } else {
          showStatusToast(`You rolled a ${state.currentRoll}! Tap glowing token to move.`, '👉', currentColor);
        }
      } else {
        showStatusToast(`${activePlayerName} rolled a ${state.currentRoll}! Moving token...`, '🎲', currentColor);
      }
    } else if (state.turnPhase === 'NO_MOVE_WAIT') {
      showStatusToast(`${activePlayerName} rolled a ${state.currentRoll} (no moves). Passing turn...`, '⚠️', currentColor);
    }

    // Spectator banner
    if (myRole === 'spectator') {
      spectatorBanner.classList.remove('hidden');
    } else {
      spectatorBanner.classList.add('hidden');
    }

    // Check Victory
    if (state.turnPhase === 'GAME_OVER') {
      showVictoryModal(state);
    }

    if (autoMoveEnabled) {
      checkAutoMove();
    }
  }

  // Render Lobby Roster & Start Game Controls
  function renderLobbyRoster(state, playerCount, joinedCount, canStart) {
    if (!state || !lobbyRoster) return;
    lobbyRoster.innerHTML = '';

    const activeColors = state.activeColors || ['green', 'red', 'yellow', 'blue'];
    const totalRequired = playerCount || state.playerCount || activeColors.length;

    let count = 0;
    activeColors.forEach((color) => {
      const player = state.players[color];
      // A slot is filled if player has a name assigned and has not left
      const isTaken = player && !player.hasLeft;
      const isPlayerHost = (color === 'green'); // Host is always Green
      if (isTaken) count++;

      const row = document.createElement('div');
      row.className = `lobby-player-row ${isTaken ? 'joined' : 'waiting'}`;

      const colorHexMap = {
        green: '#22B96B',
        red: '#E8384F',
        yellow: '#F5B930',
        blue: '#3A82F2'
      };
      const colHex = colorHexMap[color] || '#38bdf8';

      let statusBadge = '';
      if (isTaken) {
        statusBadge = `<span style="color:#10b981; font-weight:700;">✅ Joined</span>`;
      } else {
        statusBadge = `<span style="color:#94a3b8; font-style:italic;">⏳ Waiting...</span>`;
      }

      const hostBadge = isPlayerHost 
        ? '<span style="background: linear-gradient(135deg, #f59e0b, #d97706); color:#fff; font-size:10px; font-weight:800; padding:2px 7px; border-radius:6px; margin-left:6px; letter-spacing:0.5px;">HOST</span>' 
        : '';

      row.innerHTML = `
        <div style="display:flex; align-items:center; gap:8px;">
          <div style="width:14px; height:14px; border-radius:50%; background:${colHex}; box-shadow:0 0 8px ${colHex};"></div>
          <strong style="color:#fff;">${player?.name || `Slot (${color.toUpperCase()})`}</strong>
          ${hostBadge}
        </div>
        ${statusBadge}
      `;
      lobbyRoster.appendChild(row);
    });

    const actualJoined = (joinedCount !== undefined && joinedCount !== null) ? joinedCount : count;
    const isReadyToStart = canStart || (actualJoined >= totalRequired);

    if (lobbyStatusBanner) {
      if (isReadyToStart) {
        lobbyStatusBanner.textContent = `🎉 All ${totalRequired}/${totalRequired} Players Joined!`;
        lobbyStatusBanner.style.color = '#10b981';
      } else {
        lobbyStatusBanner.textContent = `⏳ Waiting for players to join (${actualJoined}/${totalRequired})...`;
        lobbyStatusBanner.style.color = '#facc15';
      }
    }

    if (state.turnPhase === 'LOBBY') {
      if (isReadyToStart) {
        if (isHost) {
          lobbyStartGameBtn?.classList.remove('hidden');
          lobbyWaitText?.classList.add('hidden');
        } else {
          lobbyStartGameBtn?.classList.add('hidden');
          lobbyWaitText?.classList.remove('hidden');
        }
      } else {
        lobbyStartGameBtn?.classList.add('hidden');
        lobbyWaitText?.classList.add('hidden');
      }
    } else {
      lobbyStartGameBtn?.classList.add('hidden');
      lobbyWaitText?.classList.add('hidden');
    }
  }

  // Show Game Over / Victory Modal
  function showVictoryModal(state) {
    victoryModal.classList.remove('hidden');
    victoryPodium.innerHTML = '';

    // Only host can start a rematch
    if (rematchBtn) {
      if (isHost) {
        rematchBtn.style.display = 'inline-block';
        rematchBtn.textContent = '🔄 Rematch (Play Again)';
      } else {
        rematchBtn.style.display = 'none';
      }
    }

    const medals = ['🥇 1st Place', '🥈 2nd Place', '🥉 3rd Place', '4th Place'];
    state.winners.forEach((color, idx) => {
      const p = state.players[color];
      const podItem = document.createElement('div');
      podItem.className = `podium-item podium-rank-${idx + 1}`;
      podItem.innerHTML = `
        <span>${medals[idx] || `${idx + 1}th Place`}: <strong>${p.name}</strong> (${color.toUpperCase()})</span>
        <span>🏆</span>
      `;
      victoryPodium.appendChild(podItem);
    });

    startConfetti();
  }

  // Confetti Particle Celebration
  function startConfetti() {
    const canvas = document.getElementById('confetti-canvas');
    canvas.style.display = 'block';
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const pieces = [];
    const colors = ['#10b981', '#ef4444', '#f59e0b', '#3b82f6', '#ec4899', '#8b5cf6'];
    for (let i = 0; i < 140; i++) {
      pieces.push({
        x: Math.random() * canvas.width,
        y: Math.random() * -canvas.height,
        size: Math.random() * 8 + 4,
        speed: Math.random() * 4 + 2,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * 360
      });
    }

    let frames = 0;
    function renderConfetti() {
      if (frames++ > 380) {
        canvas.style.display = 'none';
        return;
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      pieces.forEach(p => {
        p.y += p.speed;
        p.rotation += 2.5;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
      });
      requestAnimationFrame(renderConfetti);
    }
    renderConfetti();
  }

  // Utility Delay
  function delay(ms) {
    return new Promise(res => setTimeout(res, ms));
  }

  // Copy helper
  function copyTextToClipboard(text, triggerEl, successMsg = 'Copied!') {
    navigator.clipboard.writeText(text).then(() => {
      const original = triggerEl.innerHTML;
      triggerEl.innerHTML = `✅ ${successMsg}`;
      setTimeout(() => { triggerEl.innerHTML = original; }, 2000);
    });
  }

  // --- SOCKET.IO EVENT LISTENERS ---

  socket.on('connect', () => {
    console.log('Connected to Ludo Kingdom, socketId:', socket.id);
  });

  socket.on('room_updated', (data) => {
    currentRoomId = data.roomId;
    roomCodeDisplay.textContent = data.roomId;
    lobbyRoomCode.textContent = data.roomId;
    if (data.isHost !== undefined) isHost = data.isHost;
    if (data.hostSocketId && socket.id === data.hostSocketId) isHost = true;
    updateUIState(data.state);
    updateTokenPositions(data.state);
    renderLobbyRoster(data.state, data.playerCount, data.joinedCount, data.canStart);
    voiceChat.init(myColor);
  });

  socket.on('game_started', (data) => {
    roomLobbyModal?.classList.add('hidden');
    if (data.state) {
      updateUIState(data.state);
      updateTokenPositions(data.state);
    }
    window.ludoAudio?.playVictory();
    showStatusToast('🚀 Game Started! All players joined.', '🎲', 'green');
  });

  socket.on('dice_rolled', (data) => {
    updateUIState(data.state);
    triggerDiceRoll(data.roll, () => {
      updateTokenPositions(data.state);
    });
  });

  socket.on('token_moved', async (moveData) => {
    gameState = moveData.state;
    await animateTokenMovement(moveData);
    updateUIState(moveData.state);
  });

  socket.on('turn_passed', (data) => {
    updateUIState(data.state);
    updateTokenPositions(data.state);
  });

  socket.on('chat_message', (msg) => {
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble';

    let colorStyle = 'color: #38bdf8;';
    if (msg.color === 'spectator') colorStyle = 'color: #c084fc;';
    else if (msg.color) colorStyle = `color: var(--${msg.color}-main);`;

    bubble.innerHTML = `
      <div class="bubble-sender" style="${colorStyle}">${msg.sender}</div>
      ${msg.text}
    `;
    chatMessagesEl.appendChild(bubble);
    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;

    // Show unread indicator if drawer is closed
    if (chatOverlayModal.classList.contains('hidden')) {
      unreadChatDot.classList.remove('hidden');
    }
  });

  socket.on('emoji_reaction', (payload) => {
    spawnFloatingReaction(payload.emoji, payload.color);
    window.ludoAudio.playEmojiSound(payload.soundId);
    if (payload.voiceText) {
      window.ludoAudio.speakTaunt(payload.voiceText, payload.emoji);
    }
  });

  socket.on('game_restarted', (data) => {
    victoryModal.classList.add('hidden');
    updateUIState(data.state);
    updateTokenPositions(data.state);
  });

  socket.on('player_left', (data) => {
    if (data.state) {
      gameState = data.state;
      updateUIState(data.state);
      updateTokenPositions(data.state);
    }
    showStatusToast(`${data.name || data.color} left the game (AI Bot playing).`, '🚪', data.color);
  });

  // Leave Room handler
  function leaveRoom() {
    if (!currentRoomId || currentRoomId === 'PASS & PLAY') {
      currentRoomId = null;
      localStorage.removeItem('ludo_active_session');
      location.reload();
      return;
    }

    if (confirm('Are you sure you want to leave this game room?')) {
      socket.emit('leave_room', { roomId: currentRoomId, playerId: myPlayerId }, () => {
        localStorage.removeItem('ludo_active_session');
        currentRoomId = null;
        gameState = null;
        location.reload();
      });
    }
  }

  // --- UI LISTENERS ---

  // 1. Dice Roll Click
  dicePedestalWrapper?.addEventListener('click', onRollDiceClicked);
  dice3DEl?.addEventListener('click', onRollDiceClicked);

  // 2. Auto-Move Toggle
  autoMoveBtn?.addEventListener('click', () => {
    autoMoveEnabled = !autoMoveEnabled;
    if (autoMoveBtn) {
      if (autoMoveEnabled) {
        autoMoveBtn.classList.add('active');
        autoMoveBtn.style.color = '#34d399';
        autoMoveBtn.style.borderColor = '#34d399';
        autoMoveBtn.style.boxShadow = '0 0 12px rgba(52,211,153,0.5)';
      } else {
        autoMoveBtn.classList.remove('active');
        autoMoveBtn.style.color = '#ffffff';
        autoMoveBtn.style.borderColor = '';
        autoMoveBtn.style.boxShadow = '';
      }
    }
    if (autoMoveEnabled) checkAutoMove();
  });

  // 3. Leave Room Listeners
  leaveRoomBtn?.addEventListener('click', leaveRoom);
  modalLeaveGameBtn?.addEventListener('click', leaveRoom);
  victoryLeaveBtn?.addEventListener('click', leaveRoom);

  // 4. Voice Chat: Mic Toggle (Requested)
  toggleMicBtn?.addEventListener('click', async () => {
    const isMicOn = await voiceChat.toggleMic();
    if (isMicOn) {
      toggleMicBtn?.classList.add('active');
      toggleMicBtn?.classList.remove('muted');
      if (micIcon) micIcon.textContent = '🎙️';
    } else {
      toggleMicBtn?.classList.remove('active');
      toggleMicBtn?.classList.add('muted');
      if (micIcon) micIcon.textContent = '🔇';
    }
  });

  // 5. Voice Chat: Speaker Toggle (Requested)
  toggleSpeakerBtn?.addEventListener('click', () => {
    const isSpeakerOn = voiceChat.toggleSpeaker();
    if (isSpeakerOn) {
      toggleSpeakerBtn?.classList.remove('muted');
      if (speakerIcon) speakerIcon.textContent = '🔊';
    } else {
      toggleSpeakerBtn?.classList.add('muted');
      if (speakerIcon) speakerIcon.textContent = '🔈';
    }
  });

  // 6. In-Game Chat Overlay Toggle (Requested)
  openChatBtn?.addEventListener('click', () => {
    chatOverlayModal?.classList.toggle('hidden');
    unreadChatDot?.classList.add('hidden');
  });

  closeChatBtn?.addEventListener('click', () => {
    chatOverlayModal?.classList.add('hidden');
  });

  // Chat Form Submit
  chatForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = chatInput?.value?.trim();
    if (!text) return;
    socket.emit('send_chat', { text });
    if (chatInput) chatInput.value = '';
  });

  // Quick Chat Chips inside Drawer
  document.querySelectorAll('.quick-text-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      socket.emit('send_chat', { text: btn.dataset.msg });
    });
  });

  // Emoji & Reaction Chips (Image 2 Quick Voice Reactions)
  document.querySelectorAll('.quick-reaction-btn, .emoji-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const emoji = btn.dataset.emoji || '😂';
      const soundId = btn.dataset.sound || 'laugh';
      const voiceText = btn.dataset.voice || '';

      // Play sound & speech immediately on local click
      window.ludoAudio.playEmojiSound(soundId);
      if (voiceText) {
        window.ludoAudio.speakTaunt(voiceText, emoji);
      }
      spawnFloatingReaction(emoji, myColor || 'green');

      // Broadcast to room
      socket.emit('send_emoji', {
        emoji,
        soundId,
        voiceText
      });
    });
  });

  // Taunts & Reactions Button (Image 1 "😂 Taunts" button opens Image 2 Reaction Drawer)
  wheelBtn?.addEventListener('click', () => {
    chatOverlayModal?.classList.remove('hidden');
    unreadChatDot?.classList.add('hidden');
  });

  openMenuBtn?.addEventListener('click', () => {
    if (currentRoomId && currentRoomId !== 'PASS & PLAY') {
      if (activeGameBanner) {
        activeGameBanner.classList.remove('hidden');
        if (activeGameRoomId) activeGameRoomId.textContent = currentRoomId;
      }
    } else {
      if (activeGameBanner) activeGameBanner.classList.add('hidden');
    }
    gameMenuModal?.classList.remove('hidden');
  });

  // Copy Room Link
  roomBadge?.addEventListener('click', () => {
    if (!currentRoomId || currentRoomId === 'PASS & PLAY') return;
    const url = `${window.location.origin}/?room=${currentRoomId}`;
    copyTextToClipboard(url, roomCodeDisplay, 'Copied!');
  });

  lobbyCopyCodeBtn?.addEventListener('click', () => {
    if (!currentRoomId) return;
    copyTextToClipboard(currentRoomId, lobbyCopyCodeBtn, 'Copied!');
  });

  lobbyCopyLinkBtn?.addEventListener('click', () => {
    if (!currentRoomId) return;
    const url = `${window.location.origin}/?room=${currentRoomId}`;
    copyTextToClipboard(url, lobbyCopyLinkBtn, 'Copied Link!');
  });

  closeMenuBtn?.addEventListener('click', () => {
    gameMenuModal?.classList.add('hidden');
  });

  closeLobbyBtn?.addEventListener('click', () => {
    roomLobbyModal?.classList.add('hidden');
  });

  lobbyStartGameBtn?.addEventListener('click', () => {
    if (!isHost) return;
    socket.emit('start_game', (res) => {
      if (!res || !res.success) {
        alert(res?.error || 'Waiting for all players to join before starting.');
      }
    });
  });

  // Clicking ribbon reopens lobby if still in LOBBY phase
  document.querySelector('.ribbon')?.addEventListener('click', () => {
    if (gameState?.turnPhase === 'LOBBY' && currentRoomId && currentRoomId !== 'PASS & PLAY') {
      roomLobbyModal?.classList.remove('hidden');
    }
  });

  victoryLobbyBtn?.addEventListener('click', () => {
    victoryModal?.classList.add('hidden');
    gameMenuModal?.classList.remove('hidden');
  });

  rematchBtn?.addEventListener('click', () => {
    if (!isHost) {
      alert('Only the room creator (Host) can restart the game.');
      return;
    }
    socket.emit('restart_game');
  });

  // Modal Tabs Switching
  document.querySelectorAll('.tab-btn').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => {
        c.classList.remove('active');
        c.classList.add('hidden');
        c.style.display = 'none';
      });

      tab.classList.add('active');
      const targetId = `tab-${tab.dataset.tab}`;
      const targetContent = document.getElementById(targetId);
      if (targetContent) {
        targetContent.classList.remove('hidden');
        targetContent.classList.add('active');
        targetContent.style.display = 'block';
      }
    });
  });

  // Create Room
  document.getElementById('create-room-btn')?.addEventListener('click', () => {
    const name = document.getElementById('create-player-name')?.value?.trim() || 'User 1';
    const count = parseInt(document.getElementById('create-player-count')?.value || '4');

    socket.emit('create_room', {
      mode: 'online',
      playerCount: count,
      playerName: name,
      playerId: myPlayerId
    }, (res) => {
      if (res.success) {
        isHost = true;
        myRole = 'player';
        myColor = res.color;
        currentRoomId = res.roomId;
        roomCodeDisplay.textContent = res.roomId;
        lobbyRoomCode.textContent = res.roomId;

        localStorage.setItem('ludo_active_session', JSON.stringify({
          roomId: res.roomId,
          playerName: name,
          playerId: myPlayerId,
          color: res.color,
          role: 'player',
          isHost: true
        }));

        gameMenuModal.classList.add('hidden');
        roomLobbyModal.classList.remove('hidden');
        buildTokens(res.state.activeColors);
        updateUIState(res.state);
        updateTokenPositions(res.state);
        renderLobbyRoster(res.state, res.playerCount, res.joinedCount, res.canStart);
        voiceChat.init(myColor);
      }
    });
  });

  // Join Room
  document.getElementById('join-room-btn')?.addEventListener('click', () => {
    const name = document.getElementById('join-player-name')?.value?.trim() || 'Guest';
    const code = document.getElementById('join-room-code')?.value?.trim().toUpperCase();

    if (!code || code.length < 4) {
      alert('Please enter a valid 6-letter Room ID.');
      return;
    }

    socket.emit('join_room', {
      roomId: code,
      playerName: name,
      playerId: myPlayerId
    }, (res) => {
      if (res.success) {
        isHost = res.isHost || false;
        myRole = res.role;
        myColor = res.color || 'green';
        currentRoomId = res.roomId;
        roomCodeDisplay.textContent = res.roomId;
        lobbyRoomCode.textContent = res.roomId;

        localStorage.setItem('ludo_active_session', JSON.stringify({
          roomId: res.roomId,
          playerName: name,
          playerId: myPlayerId,
          color: myColor,
          role: myRole,
          isHost: isHost
        }));

        gameMenuModal.classList.add('hidden');
        if (res.role === 'spectator') {
          spectatorBanner.classList.remove('hidden');
        } else {
          spectatorBanner.classList.add('hidden');
          if (res.state.turnPhase === 'LOBBY') {
            roomLobbyModal.classList.remove('hidden');
          }
        }

        buildTokens(res.state.activeColors);
        updateUIState(res.state);
        updateTokenPositions(res.state);
        renderLobbyRoster(res.state, res.playerCount, res.joinedCount, res.canStart);
        voiceChat.init(myColor);
      } else {
        alert(res.error || 'Failed to join room.');
      }
    });
  });

  // Pass & Play
  document.getElementById('start-pass-play-btn')?.addEventListener('click', () => {
    const playerCount = parseInt(document.getElementById('pass-player-count')?.value || '4');
    myRole = 'player';
    myColor = null;

    socket.emit('create_room', {
      mode: 'pass_and_play',
      playerCount,
      playerName: 'User 1'
    }, (res) => {
      if (res.success) {
        currentRoomId = 'PASS & PLAY';
        roomCodeDisplay.textContent = 'PASS & PLAY';
        gameMenuModal.classList.add('hidden');
        spectatorBanner.classList.add('hidden');
        buildTokens(res.state.activeColors);
        updateUIState(res.state);
        updateTokenPositions(res.state);
        voiceChat.init('green');
      }
    });
  });

  // Play vs Bots
  document.getElementById('start-vs-bots-btn')?.addEventListener('click', () => {
    const name = document.getElementById('bot-player-name')?.value?.trim() || 'User 1';
    const count = parseInt(document.getElementById('bot-opponents-count')?.value || '4');
    myRole = 'player';

    socket.emit('create_room', {
      mode: 'vs_bots',
      playerCount: count,
      playerName: name,
      playerId: myPlayerId
    }, (res) => {
      if (res.success) {
        myColor = res.color;
        currentRoomId = res.roomId;
        roomCodeDisplay.textContent = res.roomId;
        gameMenuModal.classList.add('hidden');
        spectatorBanner.classList.add('hidden');

        res.state.activeColors.forEach(color => {
          if (color !== res.color) {
            socket.emit('toggle_bot', { color });
          }
        });

        buildTokens(res.state.activeColors);
        updateUIState(res.state);
        updateTokenPositions(res.state);
        voiceChat.init(myColor);
      }
    });
  });

  // Check URL param ?room=XYZ
  const urlParams = new URLSearchParams(window.location.search);
  const roomParam = urlParams.get('room');
  if (roomParam) {
    document.getElementById('join-room-code').value = roomParam;
    const joinTab = document.querySelector('[data-tab="join-room"]');
    if (joinTab) joinTab.click();
    gameMenuModal.classList.remove('hidden');
  }

  // Session Reconnection on Page Reload
  const savedSessionStr = localStorage.getItem('ludo_active_session');
  if (savedSessionStr) {
    try {
      const sess = JSON.parse(savedSessionStr);
      if (sess.roomId && sess.roomId !== 'PASS & PLAY') {
        socket.emit('reconnect_session', {
          roomId: sess.roomId,
          playerId: myPlayerId,
          playerName: sess.playerName
        }, (res) => {
          if (res && res.success) {
            myRole = res.role;
            myColor = res.color;
            isHost = res.isHost;
            currentRoomId = res.roomId;
            roomCodeDisplay.textContent = res.roomId;
            lobbyRoomCode.textContent = res.roomId;
            gameMenuModal.classList.add('hidden');
            buildTokens(res.state.activeColors);
            updateUIState(res.state);
            updateTokenPositions(res.state);
            if (res.state.turnPhase === 'LOBBY' && res.role === 'player') {
              roomLobbyModal.classList.remove('hidden');
              renderLobbyRoster(res.state, res.playerCount, res.joinedCount, res.canStart);
            }
            voiceChat.init(myColor);
            showStatusToast(`Reconnected to Room ${res.roomId}!`, '🔄', myColor);
          } else {
            localStorage.removeItem('ludo_active_session');
            if (!roomParam) gameMenuModal.classList.remove('hidden');
          }
        });
      } else {
        if (!roomParam) gameMenuModal.classList.remove('hidden');
      }
    } catch (e) {
      localStorage.removeItem('ludo_active_session');
      if (!roomParam) gameMenuModal.classList.remove('hidden');
    }
  } else {
    if (!roomParam) gameMenuModal.classList.remove('hidden');
  }

  // Window resize
  window.addEventListener('resize', () => {
    if (gameState) {
      updateTokenPositions(gameState);
    }
  });

  // Initialize Board
  buildBoardGrid();
  buildTokens();
  updateDiceDockPosition('green', 'LOBBY');
  setTimeout(placeTokensInYards, 80);

})();
