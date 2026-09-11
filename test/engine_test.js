/**
 * Unit tests for LudoGame engine
 */
const { LudoGame, SAFE_GLOBAL_CELLS } = require('../game/ludoEngine');

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ PASSED: ${message}`);
  }
}

console.log('--- RUNNING LUDO ENGINE TESTS ---');

// Test 1: Initialization
const game = new LudoGame({ playerCount: 4 });
assert(game.activeColors.length === 4, '4 active colors initialized');
assert(game.currentTurnColor === 'green', 'First turn is green');
assert(game.turnPhase === 'ROLL', 'Initial turn phase is ROLL');

// Test 2: Cannot move before roll
const invalidMove = game.moveToken(0);
assert(!invalidMove.success, 'Cannot move token before rolling');

// Test 3: Roll not 6 with all tokens in yard gives 0 valid moves and autoPass
const rollResult = game.rollDice(4);
assert(rollResult.success && rollResult.roll === 4, 'Rolled 4');
assert(rollResult.validMoves.length === 0, 'No valid moves on roll 4 when all in yard');
assert(rollResult.autoPass === true, 'Auto pass flagged');

// Test 4: Passing turn
game.passTurn();
assert(game.currentTurnColor === 'red', 'Turn passed from green to red');

// Test 5: Roll 6 allows releasing token from yard
const roll6 = game.rollDice(6);
assert(roll6.success && roll6.roll === 6, 'Red rolled a 6');
assert(roll6.validMoves.length === 4, 'All 4 tokens can be released on 6');

const moveRes = game.moveToken(0);
assert(moveRes.success, 'Moved red token 0 out of yard');
assert(game.players.red.tokens[0] === 0, 'Red token 0 is now at step 0');
assert(moveRes.bonusTurn === true, 'Player earns bonus turn after rolling a 6');
assert(game.currentTurnColor === 'red', 'Turn stays with red on bonus turn');
assert(moveRes.playerColor === 'red', 'moveRes.playerColor is red on bonus turn');

// Test 5b: Second roll after 6 (non-bonus roll) - User bug scenario:
// Moving token when bonusTurn is false MUST return playerColor = 'red' and nextTurn = 'yellow'
const roll4 = game.rollDice(4);
assert(roll4.success && roll4.roll === 4, 'Red rolled a 4 on bonus roll');
assert(roll4.validMoves.includes(0), 'Red token 0 can advance by 4');
const moveResNonBonus = game.moveToken(0);
assert(moveResNonBonus.success, 'Moved red token 0 by 4');
assert(game.players.red.tokens[0] === 4, 'Red token 0 is at step 4');
assert(moveResNonBonus.bonusTurn === false, 'Bonus turn is false');
assert(moveResNonBonus.playerColor === 'red', 'CRITICAL BUG FIX: moveRes.playerColor MUST be red, NOT yellow!');
assert(moveResNonBonus.nextTurn === 'yellow', 'nextTurn is yellow');
assert(game.currentTurnColor === 'yellow', 'Current turn passed to yellow');

// Test 6: Advance token and capture
const testCaptureGame = new LudoGame({ playerCount: 4 });
// Blue start offset is 39. At step 15 -> global cell (39 + 15) % 52 = 2
testCaptureGame.players.blue.tokens[0] = 15;
// Green start offset is 0. At step 1 -> global cell 1
testCaptureGame.players.green.tokens[0] = 1;
testCaptureGame.currentTurnColor = 'green';
testCaptureGame.turnPhase = 'MOVE';
testCaptureGame.currentRoll = 1;
testCaptureGame.validMoves = [0];

const greenMoveRes = testCaptureGame.moveToken(0);
assert(greenMoveRes.success, 'Green moved from step 1 to 2');
assert(testCaptureGame.players.green.tokens[0] === 2, 'Green token is at step 2');
assert(greenMoveRes.captured !== null, 'Captured blue token');
assert(greenMoveRes.captured.color === 'blue', 'Captured token belongs to blue');
assert(testCaptureGame.players.blue.tokens[0] === -1, 'Blue token knocked back to yard (-1)');
assert(greenMoveRes.bonusTurn === true, 'Green gets bonus turn for capture');

// Test 7: Safe spot protects against capture
const safeGame = new LudoGame({ playerCount: 4 });
// Global cell 8 is safe
// Red start is 0, so step 8 is global cell 8.
safeGame.players.red.tokens[0] = 8;
// Green start is 13. Step to global cell 8: (8 - 13 + 52) = 47.
safeGame.players.green.tokens[0] = 46; // Step 46 -> global cell 7
safeGame.currentTurnColor = 'green';
safeGame.turnPhase = 'MOVE';
safeGame.currentRoll = 1;
safeGame.validMoves = [0];

const safeMoveRes = safeGame.moveToken(0);
assert(safeMoveRes.success, 'Green moved to step 47 (global cell 8)');
assert(safeMoveRes.captured === null, 'No capture on safe spot 8');
assert(safeGame.players.red.tokens[0] === 8, 'Red token still safe on spot 8');

// Test 8: Home reach and exact roll
const homeGame = new LudoGame({ playerCount: 2 });
homeGame.players.green.tokens[0] = 54; // 2 steps away from 56 (center home)
homeGame.currentTurnColor = 'green';
homeGame.turnPhase = 'ROLL';

// If roll 3, cannot move (overshoot 56)
homeGame.rollDice(3);
assert(!homeGame.validMoves.includes(0), 'Cannot overshoot home (roll 3 when 2 steps away)');

// If roll 2, can reach home
homeGame.turnPhase = 'ROLL';
homeGame.rollDice(2);
assert(homeGame.validMoves.includes(0), 'Can reach home with exact roll 2');
const homeMove = homeGame.moveToken(0);
assert(homeMove.reachedHome === true, 'Token reached Home!');
assert(homeGame.players.green.tokens[0] === 56, 'Token position is 56');
assert(homeGame.players.green.finishedCount === 1, 'Green finished count is 1');

// Test 9: Bot move calculation
const botGame = new LudoGame({ playerCount: 4, bots: { yellow: true } });
botGame.currentTurnColor = 'yellow';
botGame.turnPhase = 'MOVE';
botGame.currentRoll = 6;
botGame.validMoves = [0, 1, 2, 3];
const botChoice = botGame.getBotMove();
assert(botChoice !== null, 'Bot selected a valid move');

// Test 10: Must capture opponent token before entering home runway (52-cell track wrap)
const noKillGame = new LudoGame({ playerCount: 4 });
noKillGame.players.green.hasCaptured = false;
noKillGame.players.green.tokens[0] = 50; // At home threshold
noKillGame.currentTurnColor = 'green';
noKillGame.turnPhase = 'ROLL';
noKillGame.rollDice(3);
assert(noKillGame.validMoves.includes(0), 'Can move even if not captured yet (will lap track)');
const lapMove = noKillGame.moveToken(0);
assert(lapMove.newStep === 1, 'Roll 3 from 50: (50 -> 50.5 corner -> 0 start -> 1). newStep MUST be 1, NOT 2!');
assert(lapMove.stepPath.length === 3, 'stepPath length strictly matches roll 3');
assert(!lapMove.reachedHome, 'Did not enter home without capture');

// Test 10b: Exact roll steps from 50 (Roll 1 lands on 50.5 corner cell)
const loopRoll1Game = new LudoGame({ playerCount: 4 });
loopRoll1Game.players.green.hasCaptured = false;
loopRoll1Game.players.green.tokens[0] = 50;
loopRoll1Game.currentTurnColor = 'green';
loopRoll1Game.turnPhase = 'ROLL';
loopRoll1Game.rollDice(1);
const moveCorner = loopRoll1Game.moveToken(0);
assert(moveCorner.newStep === 50.5, 'Roll 1 from 50 lands on corner cell 50.5');
assert(moveCorner.stepPath.length === 1, 'stepPath length strictly matches roll 1');

// Test 10c: Moving from corner cell 50.5 with roll 2 lands on step 1
loopRoll1Game.currentTurnColor = 'green';
loopRoll1Game.turnPhase = 'ROLL';
loopRoll1Game.rollDice(2);
assert(loopRoll1Game.validMoves.includes(0), 'Can move from corner cell');
const fromCornerMove = loopRoll1Game.moveToken(0);
assert(fromCornerMove.newStep === 1, 'Roll 2 from 50.5 corner cell lands on step 1 (0 -> 1)');
assert(fromCornerMove.stepPath.length === 2, 'stepPath length strictly matches roll 2');

// Test 11: 3 consecutive sixes rule (3rd six forfeited, next player is NOT skipped)
const threeSixesGame = new LudoGame({ playerCount: 4 });
assert(threeSixesGame.currentTurnColor === 'green', 'Game starts with green');

// Roll 1: 6
const r1 = threeSixesGame.rollDice(6);
assert(r1.success && r1.roll === 6, 'Green rolled 1st six');
threeSixesGame.moveToken(0); // move token out of yard

// Roll 2: 6
const r2 = threeSixesGame.rollDice(6);
assert(r2.success && r2.roll === 6, 'Green rolled 2nd six');
threeSixesGame.moveToken(0); // move token 6 steps

// Roll 3: 6
const r3 = threeSixesGame.rollDice(6);
assert(r3.success && r3.roll === 6, 'Green rolled 3rd six');
assert(r3.consecutiveSixesPenalty === true, '3rd six penalty flagged');
assert(r3.validMoves.length === 0, 'No moves allowed on 3rd six');
assert(threeSixesGame.turnPhase === 'NO_MOVE_WAIT', 'Phase is NO_MOVE_WAIT before single pass');

// Server passes turn after wait
threeSixesGame.passTurn();
assert(threeSixesGame.currentTurnColor === 'red', 'Turn passes to Red (next player)');
assert(threeSixesGame.turnPhase === 'ROLL', 'Red phase is ROLL (NOT skipped!)');
const redRoll = threeSixesGame.rollDice(4);
assert(redRoll.success && redRoll.roll === 4, 'Red can successfully roll dice!');

console.log('\n🎉 ALL ENGINE TESTS PASSED SUCCESSFULLY! 🎉\n');
