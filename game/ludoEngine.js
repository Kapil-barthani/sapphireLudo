/**
 * Core Ludo Game Engine
 * Authoritative game state, move validation, coordinates, and bot AI.
 * 
 * Step mapping per player:
 * -1: In Yard
 * 0: Player's start square on common track
 * 1..49: Common track clockwise progression
 * 50: Entrance square right outside player's home runway (marked "HOME" on board)
 * 51..55: 5 colored runway squares leading to center
 * 56: Center Victory Home!
 */

const COLORS = ['green', 'red', 'yellow', 'blue'];

const START_OFFSETS = {
  green: 0,
  red: 13,
  yellow: 26,
  blue: 39
};

// 8 safe spots on the 52-cell track (start cells + colored rings)
const SAFE_GLOBAL_CELLS = [0, 8, 13, 21, 26, 34, 39, 47];

class LudoGame {
  constructor(options = {}) {
    this.id = options.id || ('room_' + Math.random().toString(36).substring(2, 8));
    this.mode = options.mode || 'pass_and_play';
    this.playerCount = options.playerCount || 4;
    
    if (this.playerCount === 2) {
      this.activeColors = ['green', 'yellow'];
    } else if (this.playerCount === 3) {
      this.activeColors = ['green', 'red', 'yellow'];
    } else {
      this.activeColors = ['green', 'red', 'yellow', 'blue'];
    }

    this.players = {};
    this.activeColors.forEach((color, idx) => {
      this.players[color] = {
        color,
        name: options.playerNames?.[color] || `User${idx + 1}`,
        isBot: options.bots?.[color] || false,
        socketId: null,
        tokens: [-1, -1, -1, -1], // -1: yard, 0-50: common track, 51-55: runway, 56: home
        finishedCount: 0,
        hasCaptured: options.hasCaptured?.[color] || false,
        rank: null,
        hasLeft: false
      };
    });

    this.currentTurnIndex = 0;
    this.currentTurnColor = this.activeColors[this.currentTurnIndex];
    this.turnPhase = 'ROLL'; // 'ROLL', 'MOVE', 'GAME_OVER'
    this.currentRoll = null;
    this.consecutiveSixes = 0;
    this.validMoves = [];
    this.winners = [];
    this.lastAction = { type: 'GAME_STARTED', description: 'Game started! User1 (Green) to roll.' };
    this.moveHistory = [];
  }

  getCurrentPlayer() {
    return this.players[this.currentTurnColor];
  }

  static getGlobalCell(color, step) {
    if (step < 0 || step > 50) return null;
    return (START_OFFSETS[color] + step) % 52;
  }

  static isSafeCell(globalCell) {
    return SAFE_GLOBAL_CELLS.includes(globalCell);
  }

  rollDice(requestedRoll = null) {
    if (this.turnPhase !== 'ROLL') {
      return { success: false, error: 'Cannot roll now' };
    }

    const roll = requestedRoll && requestedRoll >= 1 && requestedRoll <= 6 
      ? requestedRoll 
      : Math.floor(Math.random() * 6) + 1;

    this.currentRoll = roll;

    if (roll === 6) {
      this.consecutiveSixes++;
    } else {
      this.consecutiveSixes = 0;
    }

    // 3 consecutive sixes rule: forfeit roll and turn passes
    if (this.consecutiveSixes === 3) {
      this.consecutiveSixes = 0;
      this.lastAction = {
        type: 'THREE_SIXES',
        color: this.currentTurnColor,
        roll,
        description: `${this.players[this.currentTurnColor].name} rolled three 6s! Turn forfeited.`
      };
      this.passTurn();
      return {
        success: true,
        roll,
        consecutiveSixesPenalty: true,
        validMoves: [],
        nextTurn: this.currentTurnColor,
        phase: this.turnPhase
      };
    }

    const validMoves = this.getValidMoves(this.currentTurnColor, roll);
    this.validMoves = validMoves;

    if (validMoves.length === 0) {
      this.lastAction = {
        type: 'NO_MOVES',
        color: this.currentTurnColor,
        roll,
        description: `${this.players[this.currentTurnColor].name} rolled a ${roll} (no moves).`
      };
      this.turnPhase = 'NO_MOVE_WAIT';
      return {
        success: true,
        roll,
        validMoves: [],
        autoPass: true,
        nextTurn: this.currentTurnColor,
        phase: this.turnPhase
      };
    }

    this.turnPhase = 'MOVE';
    this.lastAction = {
      type: 'ROLLED',
      color: this.currentTurnColor,
      roll,
      validMoves,
      description: `${this.players[this.currentTurnColor].name} rolled a ${roll}!`
    };

    return {
      success: true,
      roll,
      validMoves,
      phase: this.turnPhase
    };
  }

  getValidMoves(color, roll) {
    const player = this.players[color];
    if (!player) return [];

    const valid = [];
    player.tokens.forEach((step, tokenIndex) => {
      if (step === -1) {
        if (roll === 6) valid.push(tokenIndex);
      } else if (step >= 0 && step < 56) {
        if (!player.hasCaptured && step <= 50 && (step + roll > 50)) {
          // Token can loop around common track for another lap to seek a capture
          valid.push(tokenIndex);
        } else {
          const newStep = step + roll;
          if (newStep <= 56) valid.push(tokenIndex);
        }
      }
    });

    return valid;
  }

  moveToken(tokenIndex) {
    if (this.turnPhase !== 'MOVE') {
      return { success: false, error: 'Not in move phase' };
    }

    if (!this.validMoves.includes(tokenIndex)) {
      return { success: false, error: 'Invalid token move' };
    }

    const movingPlayerColor = this.currentTurnColor;
    const player = this.players[movingPlayerColor];
    const currentStep = player.tokens[tokenIndex];
    const roll = this.currentRoll;
    let newStep = currentStep;

    let fromYard = false;
    let reachedHome = false;
    let captured = null;
    let stepPath = [];

    if (currentStep === -1) {
      newStep = 0;
      fromYard = true;
      stepPath = [0];
    } else if (!player.hasCaptured && currentStep <= 50 && (currentStep + roll > 50)) {
      // Must capture an opponent token before entering home runway!
      // Token laps around the common track (51 common cells: steps 0-50)
      for (let s = currentStep + 1; s <= currentStep + roll; s++) {
        stepPath.push(s > 50 ? (s - 51) : s);
      }
      newStep = (currentStep + roll) - 51;
    } else {
      for (let s = currentStep + 1; s <= currentStep + roll; s++) {
        stepPath.push(s);
      }
      newStep = currentStep + roll;
      if (newStep === 56) {
        reachedHome = true;
        player.finishedCount++;
      }
    }

    player.tokens[tokenIndex] = newStep;

    // Check capture on common track (steps 0 to 50)
    if (newStep >= 0 && newStep <= 50) {
      const globalCell = LudoGame.getGlobalCell(movingPlayerColor, newStep);
      
      if (!LudoGame.isSafeCell(globalCell)) {
        for (const oppColor of this.activeColors) {
          if (oppColor === movingPlayerColor) continue;
          const opp = this.players[oppColor];
          opp.tokens.forEach((oppStep, oppTokenIdx) => {
            if (oppStep >= 0 && oppStep <= 50) {
              const oppGlobal = LudoGame.getGlobalCell(oppColor, oppStep);
              if (oppGlobal === globalCell) {
                opp.tokens[oppTokenIdx] = -1;
                captured = {
                  color: oppColor,
                  tokenIndex: oppTokenIdx,
                  globalCell
                };
                player.hasCaptured = true;
              }
            }
          });
        }
      }
    }

    let playerJustWon = false;
    if (player.finishedCount === 4 && !player.rank) {
      player.rank = this.winners.length + 1;
      this.winners.push(movingPlayerColor);
      playerJustWon = true;
    }

    const maxWinners = this.activeColors.length === 2 ? 1 : this.activeColors.length - 1;
    if (this.winners.length >= maxWinners) {
      this.turnPhase = 'GAME_OVER';
      this.activeColors.forEach(c => {
        if (!this.players[c].rank) {
          this.players[c].rank = this.winners.length + 1;
          this.winners.push(c);
        }
      });

      this.lastAction = {
        type: 'GAME_OVER',
        winners: this.winners,
        description: `Game Over! ${this.players[this.winners[0]].name} wins!`
      };

      return {
        success: true,
        playerColor: movingPlayerColor,
        tokenIndex,
        oldStep: currentStep,
        newStep,
        stepPath,
        fromYard,
        reachedHome,
        captured,
        bonusTurn: false,
        gameOver: true,
        winners: this.winners,
        state: this.getState()
      };
    }

    // Bonus turn if rolled 6, captured opponent, or reached home
    const bonusTurn = (roll === 6 || captured !== null || reachedHome) && !playerJustWon;

    if (bonusTurn) {
      this.turnPhase = 'ROLL';
      this.validMoves = [];
      this.currentRoll = null;
      let reason = 'rolled a 6';
      if (captured) reason = `captured ${this.players[captured.color].name}'s pawn`;
      else if (reachedHome) reason = 'reached Home';

      this.lastAction = {
        type: 'BONUS_TURN',
        color: movingPlayerColor,
        reason,
        description: `${player.name} earned a bonus roll for ${reason}!`
      };
    } else {
      this.passTurn();
    }

    return {
      success: true,
      playerColor: movingPlayerColor,
      tokenIndex,
      oldStep: currentStep,
      newStep,
      stepPath,
      fromYard,
      reachedHome,
      captured,
      bonusTurn,
      gameOver: false,
      nextTurn: this.currentTurnColor,
      phase: this.turnPhase,
      state: this.getState()
    };
  }

  passTurn() {
    this.consecutiveSixes = 0;
    this.currentRoll = null;
    this.validMoves = [];
    
    let attempts = 0;
    do {
      this.currentTurnIndex = (this.currentTurnIndex + 1) % this.activeColors.length;
      this.currentTurnColor = this.activeColors[this.currentTurnIndex];
      attempts++;
    } while (this.players[this.currentTurnColor].finishedCount === 4 && attempts <= this.activeColors.length);

    this.turnPhase = 'ROLL';
    this.lastAction = {
      type: 'TURN_CHANGED',
      color: this.currentTurnColor,
      description: `Turn passed to ${this.players[this.currentTurnColor].name}.`
    };
  }

  getBotMove() {
    if (this.turnPhase !== 'MOVE' || this.validMoves.length === 0) return null;

    const color = this.currentTurnColor;
    const player = this.players[color];
    const roll = this.currentRoll;

    let bestToken = this.validMoves[0];
    let bestScore = -9999;

    for (const tokenIdx of this.validMoves) {
      const curStep = player.tokens[tokenIdx];
      let score = 0;

      if (curStep === -1) {
        score += 90;
      } else {
        const nextStep = curStep + roll;

        if (nextStep === 56) {
          score += 180;
        }

        if (nextStep >= 51 && curStep < 51) {
          score += 80;
        }

        if (nextStep <= 50) {
          const targetGlobal = LudoGame.getGlobalCell(color, nextStep);
          if (!LudoGame.isSafeCell(targetGlobal)) {
            for (const oppColor of this.activeColors) {
              if (oppColor === color) continue;
              const opp = this.players[oppColor];
              for (const oppStep of opp.tokens) {
                if (oppStep >= 0 && oppStep <= 50) {
                  if (LudoGame.getGlobalCell(oppColor, oppStep) === targetGlobal) {
                    score += 220;
                  }
                }
              }
            }
          } else {
            score += 40;
          }
        }

        score += Math.floor(nextStep * 1.5);
      }

      if (score > bestScore) {
        bestScore = score;
        bestToken = tokenIdx;
      }
    }

    return bestToken;
  }

  getState() {
    return {
      id: this.id,
      mode: this.mode,
      playerCount: this.playerCount,
      activeColors: this.activeColors,
      players: this.players,
      currentTurnColor: this.currentTurnColor,
      turnPhase: this.turnPhase,
      currentRoll: this.currentRoll,
      validMoves: this.validMoves,
      winners: this.winners,
      lastAction: this.lastAction
    };
  }
}

module.exports = {
  LudoGame,
  COLORS,
  START_OFFSETS,
  SAFE_GLOBAL_CELLS
};
