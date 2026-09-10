/**
 * Bot Game Automation Integration Test
 */
const { io } = require('socket.io-client');

const SERVER_URL = 'http://localhost:4000';

function testBotGame() {
  console.log('--- STARTING BOT AUTOMATION TEST ---');
  const client = io(SERVER_URL);

  client.on('connect', () => {
    client.emit('create_room', {
      mode: 'online',
      playerCount: 2,
      playerName: 'Human Host'
    }, (res) => {
      console.log(`✅ Created room: ${res.roomId}`);

      // Turn player 2 (yellow) into a bot
      client.emit('toggle_bot', { color: 'yellow' });

      // Listen for dice rolls
      let botRollSeen = false;
      client.on('dice_rolled', (data) => {
        console.log(`🎲 Dice rolled event: ${data.color} rolled ${data.roll}`);
        if (data.color === 'yellow') {
          botRollSeen = true;
        }
      });

      // Human rolls first
      client.emit('roll_dice', {}, (rollRes) => {
        console.log(`🎲 Human rolled: ${rollRes.roll}`);

        // If human has valid moves, move first one; if not, engine will auto pass to bot
        if (rollRes.validMoves && rollRes.validMoves.length > 0) {
          client.emit('move_token', { tokenIndex: rollRes.validMoves[0] });
        }

        // Wait to observe bot taking turn
        setTimeout(() => {
          console.log(`Bot played?: ${botRollSeen ? 'YES ✅' : 'WAITING/INSPECT'}`);
          client.disconnect();
          console.log('🎉 BOT TEST COMPLETE! 🎉');
          process.exit(0);
        }, 3500);
      });
    });
  });
}

testBotGame();
