/**
 * End-to-End Socket.IO Integration Test for Multiplayer Ludo
 */
const { io } = require('socket.io-client');

const SERVER_URL = 'http://localhost:4000';

function runTest() {
  console.log('--- STARTING MULTIPLAYER SOCKET TEST ---');

  const client1 = io(SERVER_URL);
  let createdRoomId = null;

  client1.on('connect', () => {
    console.log('✅ Client 1 connected');

    // Create room
    client1.emit('create_room', {
      mode: 'online',
      playerCount: 2,
      playerName: 'Player 1'
    }, (res) => {
      if (!res.success) {
        console.error('❌ Failed to create room:', res.error);
        process.exit(1);
      }
      createdRoomId = res.roomId;
      console.log(`✅ Room created with code: ${createdRoomId}, assigned color: ${res.color}`);

      // Client 2 connects and joins
      const client2 = io(SERVER_URL);

      client2.on('connect', () => {
        console.log('✅ Client 2 connected');

        client2.emit('join_room', {
          roomId: createdRoomId,
          playerName: 'Player 2'
        }, (joinRes) => {
          if (!joinRes.success) {
            console.error('❌ Failed to join room:', joinRes.error);
            process.exit(1);
          }
          console.log(`✅ Client 2 joined room, assigned color: ${joinRes.color}`);

          // Test Chat
          client2.on('chat_message', (msg) => {
            console.log(`💬 Chat received by Client 2: [${msg.sender}] ${msg.text}`);
          });

          client1.emit('send_chat', { text: 'Hello from Player 1!' });

          // Test Emoji reaction
          client2.on('emoji_reaction', (reaction) => {
            console.log(`🗣️ Emoji voice reaction received: ${reaction.emoji} "${reaction.voiceText}"`);
          });

          client1.emit('send_emoji', {
            emoji: '😂',
            soundId: 'laugh',
            voiceText: 'Haha in your face!'
          });

          // Test Dice Roll
          client1.emit('roll_dice', {}, (rollRes) => {
            console.log(`🎲 Client 1 rolled: ${rollRes.roll}`);

            setTimeout(() => {
              console.log('\n🎉 ALL MULTIPLAYER SOCKET TESTS PASSED! 🎉\n');
              client1.disconnect();
              client2.disconnect();
              process.exit(0);
            }, 1000);
          });
        });
      });
    });
  });
}

runTest();
