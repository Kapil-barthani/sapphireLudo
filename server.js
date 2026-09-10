/**
 * Multiplayer Ludo Game Server
 * Express + Socket.IO backend with room management, real-time sync, chat, emoji voice taunts, and bot automation.
 */

const express = require('express');
const http = require('http');
const https = require('https');
const { Server } = require('socket.io');
const path = require('path');
const os = require('os');
const selfsigned = require('selfsigned');
const { LudoGame, COLORS } = require('./game/ludoEngine');

const app = express();
const httpServer = http.createServer(app);
const io = new Server({
  cors: { origin: '*' }
});
io.attach(httpServer);

const PORT = process.env.PORT || 4000;
const HTTPS_PORT = process.env.HTTPS_PORT || 4001;

// Serve static frontend
app.use(express.static(path.join(__dirname, 'public')));

// Room storage: roomId -> { game, hostSocketId, players: { socketId: { color, name } }, chatHistory: [] }
const rooms = new Map();

// Helper to generate readable 6-character room codes
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return rooms.has(code) ? generateRoomCode() : code;
}

// Get primary local network IP for LAN play
function getLocalNetworkIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

// Calculate how many player slots are filled (by humans or bots)
function getJoinedPlayerCount(room) {
  if (!room || !room.game) return 0;
  const activeColors = room.game.activeColors;
  const socketColors = Object.values(room.socketToColor || {});
  const playerColors = Object.values(room.playerIdToColor || {});
  const filled = activeColors.filter(c => {
    const isBot = room.game.players[c]?.isBot;
    const isTaken = socketColors.includes(c) || playerColors.includes(c);
    return isBot || isTaken;
  });
  return filled.length;
}

// Check and trigger bot turns automatically
function handleBotTurnIfActive(room) {
  const game = room.game;
  if (game.turnPhase === 'GAME_OVER') return;

  const currentPlayer = game.getCurrentPlayer();
  if (!currentPlayer || !currentPlayer.isBot) return;

  // Bot Turn Automation
  setTimeout(() => {
    // 1. Bot rolls
    if (game.turnPhase === 'ROLL') {
      const rollRes = game.rollDice();
      io.to(room.id).emit('dice_rolled', {
        color: game.currentTurnColor,
        roll: rollRes.roll,
        validMoves: rollRes.validMoves,
        autoPass: rollRes.autoPass || false,
        consecutiveSixesPenalty: rollRes.consecutiveSixesPenalty || false,
        state: game.getState()
      });

      if (rollRes.autoPass || rollRes.consecutiveSixesPenalty) {
        setTimeout(() => {
          game.passTurn();
          io.to(room.id).emit('turn_passed', {
            currentTurnColor: game.currentTurnColor,
            state: game.getState()
          });
          handleBotTurnIfActive(room);
        }, 1200);
        return;
      }

      // 2. Bot selects move
      setTimeout(() => {
        const botTokenIdx = game.getBotMove();
        if (botTokenIdx !== null && botTokenIdx !== undefined) {
          const moveRes = game.moveToken(botTokenIdx);
          io.to(room.id).emit('token_moved', moveRes);

          // If bonus turn or next turn is also bot, continue
          setTimeout(() => {
            handleBotTurnIfActive(room);
          }, 1000);
        }
      }, 1000);
    }
  }, 1000);
}

io.on('connection', (socket) => {
  let currentRoomId = null;

  // 1. Create Room
  socket.on('create_room', (data, callback) => {
    const roomId = generateRoomCode();
    const playerCount = Math.min(Math.max(parseInt(data.playerCount) || 4, 2), 4);
    const hostName = (data.playerName || 'Host').trim().substring(0, 16);
    const mode = data.mode || 'online'; // 'online', 'pass_and_play', 'vs_bots'

    const game = new LudoGame({
      id: roomId,
      mode,
      playerCount,
      playerNames: { green: hostName },
      bots: {}
    });

    // If online multiplayer, start in LOBBY phase until all required players join and host clicks Start!
    if (mode === 'online') {
      game.turnPhase = 'LOBBY';
    }

    const playerId = data.playerId || ('p_' + socket.id);
    const room = {
      id: roomId,
      hostSocketId: socket.id,
      hostPlayerId: playerId,
      game,
      socketToColor: { [socket.id]: 'green' },
      playerIdToColor: { [playerId]: 'green' },
      spectators: new Map(), // socketId -> { name, socketId, playerId }
      chatHistory: []
    };

    rooms.set(roomId, room);
    currentRoomId = roomId;
    socket.join(roomId);

    const joinedCount = getJoinedPlayerCount(room);
    const canStart = (joinedCount >= game.playerCount);

    if (typeof callback === 'function') {
      callback({
        success: true,
        roomId,
        role: 'player',
        color: 'green',
        isHost: true,
        state: game.getState(),
        playerCount: game.playerCount,
        joinedCount,
        canStart,
        spectatorCount: 0
      });
    }

    io.to(roomId).emit('room_updated', {
      roomId,
      hostSocketId: room.hostSocketId,
      hostPlayerId: room.hostPlayerId,
      state: game.getState(),
      playerCount: game.playerCount,
      joinedCount,
      canStart,
      spectatorCount: 0,
      spectators: []
    });
  });

  // 2. Join Room (Handles both Player seat and Spectator / Viewer mode)
  socket.on('join_room', (data, callback) => {
    const roomId = (data.roomId || '').trim().toUpperCase();
    const playerName = (data.playerName || 'Player').trim().substring(0, 16);

    const room = rooms.get(roomId);
    if (!room) {
      if (typeof callback === 'function') callback({ success: false, error: 'Room not found. Please verify the 6-character code.' });
      return;
    }

    const game = room.game;
    // Find first available slot in activeColors
    const takenColors = Object.values(room.socketToColor);
    const availableColor = game.activeColors.find(c => !takenColors.includes(c) && !game.players[c].isBot);

    // If all seats are taken (or game has 4 players already), join as SPECTATOR / VIEWER!
    if (!availableColor) {
      room.spectators.set(socket.id, { name: playerName, socketId: socket.id });
      currentRoomId = roomId;
      socket.join(roomId);

      if (typeof callback === 'function') {
        callback({
          success: true,
          roomId,
          role: 'spectator',
          color: null,
          state: game.getState(),
          spectatorCount: room.spectators.size,
          spectators: Array.from(room.spectators.values())
        });
      }

      // Announce spectator in chat
      const specMsg = {
        sender: 'System',
        color: 'spectator',
        text: `👁️ ${playerName} joined as a Spectator (Viewer)!`,
        timestamp: Date.now()
      };
      room.chatHistory.push(specMsg);
      io.to(roomId).emit('chat_message', specMsg);

      io.to(roomId).emit('spectators_updated', {
        spectatorCount: room.spectators.size,
        spectators: Array.from(room.spectators.values())
      });
      return;
    }

    // Normal player join
    const playerId = data.playerId || ('p_' + socket.id);
    room.socketToColor[socket.id] = availableColor;
    if (!room.playerIdToColor) room.playerIdToColor = {};
    room.playerIdToColor[playerId] = availableColor;
    game.players[availableColor].name = playerName;
    game.players[availableColor].hasLeft = false;
    game.players[availableColor].isBot = false;
    currentRoomId = roomId;
    socket.join(roomId);

    const isHost = (room.hostPlayerId === playerId) || (room.hostSocketId === socket.id);
    const joinedCount = getJoinedPlayerCount(room);
    const canStart = (joinedCount >= game.playerCount);

    if (typeof callback === 'function') {
      callback({
        success: true,
        roomId,
        role: 'player',
        color: availableColor,
        isHost,
        state: game.getState(),
        playerCount: game.playerCount,
        joinedCount,
        canStart,
        spectatorCount: room.spectators.size,
        spectators: Array.from(room.spectators.values())
      });
    }

    // Announce player joined in chat
    const joinMsg = {
      sender: 'System',
      color: availableColor,
      text: `${playerName} joined as ${availableColor.toUpperCase()}! (${joinedCount}/${game.playerCount} Players)`,
      timestamp: Date.now()
    };
    room.chatHistory.push(joinMsg);

    io.to(roomId).emit('chat_message', joinMsg);
    io.to(roomId).emit('room_updated', {
      roomId,
      hostSocketId: room.hostSocketId,
      hostPlayerId: room.hostPlayerId,
      state: game.getState(),
      playerCount: game.playerCount,
      joinedCount,
      canStart,
      spectatorCount: room.spectators.size,
      spectators: Array.from(room.spectators.values())
    });
  });

  // Start Game (Only Host can trigger once all players have joined!)
  socket.on('start_game', (callback) => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;

    const isHost = (room.hostSocketId === socket.id);
    if (!isHost) {
      if (typeof callback === 'function') callback({ success: false, error: 'Only the room creator (Host) can start the game.' });
      return;
    }

    const joinedCount = getJoinedPlayerCount(room);
    if (joinedCount < room.game.playerCount) {
      if (typeof callback === 'function') callback({
        success: false,
        error: `Cannot start yet! Waiting for all ${room.game.playerCount} players to join (${joinedCount}/${room.game.playerCount}).`
      });
      return;
    }

    room.game.turnPhase = 'ROLL';
    io.to(room.id).emit('game_started', {
      state: room.game.getState(),
      roomId: room.id
    });

    const startMsg = {
      sender: 'System',
      color: 'gold',
      text: '🚀 All players joined! Game started! Green rolls first.',
      timestamp: Date.now()
    };
    room.chatHistory.push(startMsg);
    io.to(room.id).emit('chat_message', startMsg);

    if (typeof callback === 'function') callback({ success: true });
  });

  // 3. Add or Remove Bot (Host only)
  socket.on('toggle_bot', (data) => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (!room || room.hostSocketId !== socket.id) return;

    const { color } = data;
    const game = room.game;
    if (!game.players[color]) return;

    // Check if slot is taken by a human
    const humanColor = room.socketToColor;
    const isHuman = Object.values(humanColor).includes(color);
    if (isHuman) return;

    const currentlyBot = game.players[color].isBot;
    game.players[color].isBot = !currentlyBot;
    if (game.players[color].isBot) {
      game.players[color].name = `Bot (${color.toUpperCase()})`;
    } else {
      game.players[color].name = color.charAt(0).toUpperCase() + color.slice(1);
    }

    io.to(currentRoomId).emit('room_updated', {
      roomId: currentRoomId,
      hostSocketId: room.hostSocketId,
      state: game.getState()
    });

    handleBotTurnIfActive(room);
  });

  // 4. Roll Dice
  socket.on('roll_dice', (data, callback) => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;

    const game = room.game;
    const playerColor = room.game.mode === 'pass_and_play' 
      ? game.currentTurnColor 
      : room.socketToColor[socket.id];

    if (playerColor !== game.currentTurnColor) {
      if (typeof callback === 'function') callback({ success: false, error: 'Not your turn' });
      return;
    }

    const rollRes = game.rollDice(data && data.requestedRoll ? data.requestedRoll : null);
    if (!rollRes.success) {
      if (typeof callback === 'function') callback(rollRes);
      return;
    }

    io.to(currentRoomId).emit('dice_rolled', {
      color: game.currentTurnColor,
      roll: rollRes.roll,
      validMoves: rollRes.validMoves,
      autoPass: rollRes.autoPass || false,
      consecutiveSixesPenalty: rollRes.consecutiveSixesPenalty || false,
      state: game.getState()
    });

    if (typeof callback === 'function') callback(rollRes);

    if (rollRes.autoPass || rollRes.consecutiveSixesPenalty) {
      setTimeout(() => {
        game.passTurn();
        io.to(currentRoomId).emit('turn_passed', {
          currentTurnColor: game.currentTurnColor,
          state: game.getState()
        });
        handleBotTurnIfActive(room);
      }, 1300);
    }
  });

  // 5. Move Token
  socket.on('move_token', (data, callback) => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;

    const game = room.game;
    const playerColor = room.game.mode === 'pass_and_play' 
      ? game.currentTurnColor 
      : room.socketToColor[socket.id];

    if (playerColor !== game.currentTurnColor) {
      if (typeof callback === 'function') callback({ success: false, error: 'Not your turn' });
      return;
    }

    const moveRes = game.moveToken(data.tokenIndex);
    if (!moveRes.success) {
      if (typeof callback === 'function') callback(moveRes);
      return;
    }

    io.to(currentRoomId).emit('token_moved', moveRes);
    if (typeof callback === 'function') callback(moveRes);

    setTimeout(() => {
      handleBotTurnIfActive(room);
    }, 1000);
  });

  // 6. In-Game Chat
  socket.on('send_chat', (data) => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;

    const text = (data.text || '').trim().substring(0, 150);
    if (!text) return;

    const isSpectator = room.spectators.has(socket.id);
    let senderName = 'Player';
    let senderColor = 'blue';

    if (isSpectator) {
      senderName = room.spectators.get(socket.id)?.name || 'Spectator';
      senderColor = 'spectator';
    } else {
      senderColor = room.socketToColor[socket.id] || room.game.currentTurnColor || 'red';
      senderName = room.game.players[senderColor]?.name || data.senderName || 'Player';
    }

    const msg = {
      sender: isSpectator ? `${senderName} [Viewer]` : senderName,
      color: senderColor,
      text,
      timestamp: Date.now()
    };

    room.chatHistory.push(msg);
    if (room.chatHistory.length > 50) room.chatHistory.shift();

    io.to(currentRoomId).emit('chat_message', msg);
  });

  // 7. Emoji Reaction & Voice Taunts
  socket.on('send_emoji', (data) => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;

    const isSpectator = room.spectators.has(socket.id);
    let senderName = 'Player';
    let senderColor = 'green';

    if (isSpectator) {
      senderName = room.spectators.get(socket.id)?.name || 'Spectator';
      senderColor = 'spectator';
    } else {
      senderColor = room.socketToColor[socket.id] || room.game.currentTurnColor || 'green';
      senderName = room.game.players[senderColor]?.name || 'Player';
    }

    const payload = {
      sender: isSpectator ? `${senderName} [Viewer]` : senderName,
      color: senderColor,
      emoji: data.emoji || '🎲',
      voiceText: data.voiceText || '',
      soundId: data.soundId || 'laugh',
      timestamp: Date.now()
    };

    io.to(currentRoomId).emit('emoji_reaction', payload);
  });

  // 8. Voice Chat Audio Streaming
  socket.on('voice_audio_chunk', (data) => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;

    const playerColor = room.socketToColor[socket.id] || (room.spectators.has(socket.id) ? 'spectator' : null);
    if (!playerColor) return;

    // Relay audio chunk to all other peers in the room
    socket.to(currentRoomId).emit('voice_audio_chunk', {
      senderId: socket.id,
      color: playerColor,
      sampleRate: data.sampleRate || 44100,
      pcm: data.pcm || data.audioData
    });
  });

  // 9. Voice Speaking State (Rippling soundwaves indicator)
  socket.on('voice_speaking_state', (data) => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;

    const playerColor = room.socketToColor[socket.id] || (room.spectators.has(socket.id) ? 'spectator' : null);
    socket.to(currentRoomId).emit('voice_speaking_state', {
      senderId: socket.id,
      color: playerColor,
      isSpeaking: data.isSpeaking
    });
  });

  // 10. Pass / Skip Turn
  socket.on('pass_turn', () => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;

    const game = room.game;
    const playerColor = room.game.mode === 'pass_and_play' 
      ? game.currentTurnColor 
      : room.socketToColor[socket.id];

    if (playerColor !== game.currentTurnColor) return;

    game.passTurn();
    io.to(currentRoomId).emit('turn_passed', {
      currentTurnColor: game.currentTurnColor,
      state: game.getState()
    });

    handleBotTurnIfActive(room);
  });

  // 11. Reconnect existing session on page reload
  socket.on('reconnect_session', (data, callback) => {
    const roomId = (data.roomId || '').trim().toUpperCase();
    const playerId = data.playerId;
    const room = rooms.get(roomId);

    if (!room) {
      if (typeof callback === 'function') callback({ success: false, error: 'Room no longer exists' });
      return;
    }

    const assignedColor = room.playerIdToColor ? room.playerIdToColor[playerId] : null;
    if (!assignedColor) {
      if (typeof callback === 'function') callback({ success: false, error: 'No active seat found' });
      return;
    }

    // Re-link socket
    room.socketToColor[socket.id] = assignedColor;
    currentRoomId = roomId;
    socket.join(roomId);

    const isHost = (room.hostPlayerId === playerId) || (room.hostSocketId === socket.id);
    if (isHost) {
      room.hostSocketId = socket.id;
    }

    const game = room.game;
    if (game.players[assignedColor]) {
      game.players[assignedColor].hasLeft = false;
      game.players[assignedColor].isBot = false;
      if (data.playerName) game.players[assignedColor].name = data.playerName;
    }

    if (typeof callback === 'function') {
      callback({
        success: true,
        roomId,
        role: 'player',
        color: assignedColor,
        isHost,
        state: game.getState(),
        spectatorCount: room.spectators.size
      });
    }

    io.to(roomId).emit('room_updated', {
      roomId,
      hostSocketId: room.hostSocketId,
      state: game.getState(),
      spectatorCount: room.spectators.size
    });
  });

  // 12. Explicit Leave Room (frees seat, marks player left, enables bot)
  socket.on('leave_room', (data, callback) => {
    if (!currentRoomId) {
      if (typeof callback === 'function') callback({ success: true });
      return;
    }
    const room = rooms.get(currentRoomId);
    if (!room) {
      currentRoomId = null;
      if (typeof callback === 'function') callback({ success: true });
      return;
    }

    const playerColor = room.socketToColor[socket.id];
    const playerId = data?.playerId;

    if (playerColor && room.game.players[playerColor]) {
      const p = room.game.players[playerColor];
      p.hasLeft = true;
      p.isBot = true; // Bot takes over so game doesn't freeze
      delete room.socketToColor[socket.id];
      if (playerId && room.playerIdToColor) delete room.playerIdToColor[playerId];

      io.to(room.id).emit('player_left', {
        color: playerColor,
        name: p.name,
        state: room.game.getState()
      });

      if (room.game.currentTurnColor === playerColor && room.game.turnPhase !== 'GAME_OVER') {
        setTimeout(() => handleBotTurnIfActive(room), 1000);
      }
    }

    if (room.spectators.has(socket.id)) {
      room.spectators.delete(socket.id);
      io.to(room.id).emit('spectators_updated', {
        spectatorCount: room.spectators.size,
        spectators: Array.from(room.spectators.values())
      });
    }

    socket.leave(currentRoomId);
    currentRoomId = null;

    if (typeof callback === 'function') callback({ success: true });
  });

  // 13. Restart / Rematch (Host Only)
  socket.on('restart_game', (data, callback) => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;

    // Only host can restart
    if (room.hostSocketId !== socket.id) {
      if (typeof callback === 'function') callback({ success: false, error: 'Only the room creator can restart.' });
      return;
    }

    const oldBots = {};
    const oldNames = {};
    room.game.activeColors.forEach(c => {
      oldBots[c] = room.game.players[c].isBot;
      oldNames[c] = room.game.players[c].name;
    });

    room.game = new LudoGame({
      id: room.id,
      mode: room.game.mode,
      playerCount: room.game.playerCount,
      playerNames: oldNames,
      bots: oldBots
    });

    io.to(currentRoomId).emit('game_restarted', {
      state: room.game.getState()
    });

    handleBotTurnIfActive(room);
  });

  // Disconnect handler
  socket.on('disconnect', () => {
    if (currentRoomId) {
      const room = rooms.get(currentRoomId);
      if (room) {
        const playerColor = room.socketToColor[socket.id];
        if (playerColor && room.game.players[playerColor]) {
          const p = room.game.players[playerColor];
          p.hasLeft = true;

          io.to(currentRoomId).emit('player_left', {
            color: playerColor,
            name: p.name,
            state: room.game.getState()
          });

          // Wait 3s then let bot play if still disconnected on their turn
          if (room.game.currentTurnColor === playerColor && room.game.turnPhase !== 'GAME_OVER') {
            setTimeout(() => {
              if (room.game.currentTurnColor === playerColor && !room.socketToColor[socket.id]) {
                p.isBot = true;
                handleBotTurnIfActive(room);
              }
            }, 3000);
          }
        }

        if (room.spectators.has(socket.id)) {
          room.spectators.delete(socket.id);
          io.to(currentRoomId).emit('spectators_updated', {
            spectatorCount: room.spectators.size,
            spectators: Array.from(room.spectators.values())
          });
        }

        delete room.socketToColor[socket.id];

        if (Object.keys(room.socketToColor).length === 0 && room.spectators.size === 0) {
          setTimeout(() => {
            if (rooms.has(currentRoomId) && Object.keys(rooms.get(currentRoomId).socketToColor).length === 0 && rooms.get(currentRoomId).spectators.size === 0) {
              rooms.delete(currentRoomId);
            }
          }, 300000);
        }
      }
    }
  });
});

async function startServer() {
  const localIp = getLocalNetworkIp();

  // Detect if running on cloud platforms (Railway, Render, etc.)
  const isCloudEnv = Boolean(
    process.env.PORT ||
    process.env.RAILWAY_PROJECT_ID ||
    process.env.RAILWAY_SERVICE_ID ||
    process.env.RAILWAY_ENVIRONMENT ||
    process.env.RAILWAY_ENVIRONMENT_NAME ||
    process.env.RENDER ||
    process.env.NODE_ENV === 'production'
  );

  if (!isCloudEnv) {
    // Local dev only: self-signed certificate for local WiFi mobile mic testing
    try {
      const pems = await selfsigned.generate([
        { name: 'commonName', value: 'LudoKingdom' },
        { name: 'organizationName', value: 'LudoKingdom' }
      ], { days: 365 });

      const httpsServer = https.createServer({
        key: pems.private,
        cert: pems.cert
      }, app);

      io.attach(httpsServer);

      httpsServer.listen(HTTPS_PORT, '0.0.0.0', () => {
        console.log(`🔒  Local HTTPS Server (Voice Chat enabled):`);
        console.log(`    👉  Local machine:      https://localhost:${HTTPS_PORT}`);
        console.log(`    👉  Mobile/LAN devices: https://${localIp}:${HTTPS_PORT}`);
      });
    } catch (err) {
      console.warn('⚠️  Could not initialize local HTTPS server:', err.message);
    }
  }

  // Primary HTTP server (Railway / cloud connects here)
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`\n======================================================`);
    console.log(`🎲  LUDO MULTIPLAYER SERVER IS LIVE!`);
    console.log(`👉  HTTP Port: ${PORT}`);
    console.log(`======================================================\n`);
  });

  // Cloud compatibility: In case Railway domain routes specifically to 4001 or 4000,
  // ensure plain HTTP listeners exist on both ports so 502 never happens!
  if (isCloudEnv) {
    const backupPorts = [4000, 4001].filter(p => String(p) !== String(PORT));
    backupPorts.forEach(port => {
      try {
        const backupServer = http.createServer(app);
        io.attach(backupServer);
        backupServer.listen(port, '0.0.0.0', () => {
          console.log(`👉  Cloud HTTP fallback listening on port ${port}`);
        });
      } catch (err) {
        console.warn(`Could not bind fallback port ${port}:`, err.message);
      }
    });
  }
}

startServer();
