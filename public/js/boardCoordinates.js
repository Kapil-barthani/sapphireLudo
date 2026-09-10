/**
 * Precise Board Coordinates for 15x15 Ludo Kingdom Grid
 * Continuous 56-step path with exact alignment to screenshot
 */

// 52 Common Track Cells [row, col]
const TRACK_COORDINATES = [
  [6, 1],   // 0: Green Start
  [6, 2],   // 1
  [6, 3],   // 2
  [6, 4],   // 3
  [6, 5],   // 4
  [5, 6],   // 5
  [4, 6],   // 6
  [3, 6],   // 7
  [2, 6],   // 8: Gold Ring (Top Safe Spot)
  [1, 6],   // 9
  [0, 6],   // 10
  [0, 7],   // 11: Red "HOME" label
  [0, 8],   // 12
  [1, 8],   // 13: Red Start
  [2, 8],   // 14
  [3, 8],   // 15
  [4, 8],   // 16
  [5, 8],   // 17
  [6, 9],   // 18
  [6, 10],  // 19
  [6, 11],  // 20
  [6, 12],  // 21: Red Ring (Right Safe Spot)
  [6, 13],  // 22
  [6, 14],  // 23
  [7, 14],  // 24: Yellow "HOME" label
  [8, 14],  // 25
  [8, 13],  // 26: Yellow Start
  [8, 12],  // 27
  [8, 11],  // 28
  [8, 10],  // 29
  [8, 9],   // 30
  [9, 8],   // 31
  [10, 8],  // 32
  [11, 8],  // 33
  [12, 8],  // 34: Gold Ring (Bottom Safe Spot)
  [13, 8],  // 35
  [14, 8],  // 36
  [14, 7],  // 37: Blue "HOME" label
  [14, 6],  // 38
  [13, 6],  // 39: Blue Start
  [12, 6],  // 40
  [11, 6],  // 41
  [10, 6],  // 42
  [9, 6],   // 43
  [8, 5],   // 44
  [8, 4],   // 45
  [8, 3],   // 46
  [8, 2],   // 47: Blue Ring (Left Safe Spot)
  [8, 1],   // 48
  [8, 0],   // 49
  [7, 0],   // 50: Green "HOME" label
  [6, 0]    // 51
];

// 4 Yard Bases: 4 sockets per base [row, col]
const YARD_SLOTS = {
  green: [
    [1.65, 1.65], [1.65, 3.35],
    [3.35, 1.65], [3.35, 3.35]
  ],
  red: [
    [1.65, 10.65], [1.65, 12.35],
    [3.35, 10.65], [3.35, 12.35]
  ],
  yellow: [
    [10.65, 10.65], [10.65, 12.35],
    [12.35, 10.65], [12.35, 12.35]
  ],
  blue: [
    [10.65, 1.65], [10.65, 3.35],
    [12.35, 1.65], [12.35, 3.35]
  ]
};

// 4 Home Runways (steps 51 to 55) [row, col]
const HOME_RUNWAYS = {
  green: [
    [7, 1], [7, 2], [7, 3], [7, 4], [7, 5]
  ],
  red: [
    [1, 7], [2, 7], [3, 7], [4, 7], [5, 7]
  ],
  yellow: [
    [7, 13], [7, 12], [7, 11], [7, 10], [7, 9]
  ],
  blue: [
    [13, 7], [12, 7], [11, 7], [10, 7], [9, 7]
  ]
};

// Center Triangle Home Destinations (step 56) [row, col]
const HOME_CENTERS = {
  green: [7, 6.2],
  red: [6.2, 7],
  yellow: [7, 7.8],
  blue: [7.8, 7]
};

const START_OFFSETS = {
  green: 0,
  red: 13,
  yellow: 26,
  blue: 39
};

const SAFE_GLOBAL_CELLS = [0, 8, 13, 21, 26, 34, 39, 47];

/**
 * Get row and column coordinate for a token at a given step.
 */
function getTokenCoordinate(color, tokenIndex, step) {
  if (step === -1) {
    return YARD_SLOTS[color][tokenIndex];
  }
  if (step >= 0 && step <= 50) {
    const globalCell = (START_OFFSETS[color] + step) % 52;
    return TRACK_COORDINATES[globalCell];
  }
  if (step >= 51 && step <= 55) {
    return HOME_RUNWAYS[color][step - 51];
  }
  if (step === 56) {
    const [baseR, baseC] = HOME_CENTERS[color];
    const offsets = [
      [-0.14, -0.14],
      [-0.14, 0.14],
      [0.14, -0.14],
      [0.14, 0.14]
    ];
    return [baseR + offsets[tokenIndex][0], baseC + offsets[tokenIndex][1]];
  }
  return [0, 0];
}

window.LudoCoords = {
  TRACK_COORDINATES,
  YARD_SLOTS,
  HOME_RUNWAYS,
  HOME_CENTERS,
  START_OFFSETS,
  SAFE_GLOBAL_CELLS,
  getTokenCoordinate
};
