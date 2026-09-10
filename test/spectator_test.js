/**
 * Test spectator mode when room player count is full
 */
const { io } = require('socket.io-client');
const SERVER_URL = 'http://localhost:4000';

function testSpectator() {
  console.log('--- TESTING SPECTATOR MODE ---');
  const p1 = io(SERVER_URL);

  p1.on('connect', () => {
    // 2-player room
    p1.emit('create_room', { mode: 'online', playerCount: 2, playerName: 'Host' }, (res1) => {
      const roomId = res1.roomId;
      console.log(`✅ Room ${roomId} created for 2 players`);

      const p2 = io(SERVER_URL);
      p2.on('connect', () => {
        p2.emit('join_room', { roomId, playerName: 'Player Two' }, (res2) => {
          console.log(`✅ Player 2 joined. Role: ${res2.role}, Color: ${res2.color}`);

          // Now Client 3 connects and tries to enter the same room ID!
          const spectator = io(SERVER_URL);
          spectator.on('connect', () => {
            spectator.emit('join_room', { roomId, playerName: 'Viewer Alice' }, (res3) => {
              console.log(`✅ Client 3 join response:`, res3);

              if (res3.success && res3.role === 'spectator') {
                console.log('🎉 SUCCESS: Client 3 successfully joined as SPECTATOR / VIEWER!');
                console.log(`Spectator Count: ${res3.spectatorCount}`);
              } else {
                console.error('❌ FAILED: Client 3 did not get spectator role');
                process.exit(1);
              }

              p1.disconnect();
              p2.disconnect();
              spectator.disconnect();
              console.log('--- SPECTATOR TEST FINISHED ---');
              process.exit(0);
            });
          });
        });
      });
    });
  });
}

testSpectator();
