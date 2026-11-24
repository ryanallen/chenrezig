// Where the offerings stand, read by frame.js (their cards, while the models stream in) and by build.mjs (the models'
// places). Each: its name (its painting is concept-art/offerings/<name>.png and its model concept-art/models/<name>.glb),
// x, the foot of its painting (y), z, and size (its painting's width and height, in metres). The paintings stand 4%
// above their foot. The models turn 35 degrees toward the east, between the table's front and the start view.
// The back row of the offering table: mirror, flowers, mandala, incense, torma, fruit, conch; the front row: silks,
// damaru, bell and dorje, saffron water, mani pills, grain, khapse, cymbals; the nga drum on the floor right of the altar;
// the precious offerings on the altar top at the statue's feet, in the gap the water bowls leave.
const OFFERINGS = [
  ['incense-burner', -3, 0.382, -2.64, 0.45],
  ['flowers', -3.46, 0.38, -2.64, 0.5],
  ['mandala', -3.23, 0.383, -2.64, 0.425],
  ['fruit', -2.54, 0.385, -2.64, 0.375],
  ['khapse', -2.48, 0.39, -2.5, 0.26],
  ['torma', -2.77, 0.379, -2.64, 0.525],
  ['conch', -2.31, 0.387, -2.64, 0.325],
  ['mirror', -3.69, 0.381, -2.64, 0.475],
  ['silks', -3.74, 0.391, -2.5, 0.234],
  ['bell-dorje', -3.32, 0.39, -2.5, 0.26],
  ['damaru', -3.53, 0.39, -2.5, 0.26],
  ['cymbals', -2.27, 0.39, -2.5, 0.26],
  ['nga-drum', -1.6, -0.03, -3.35, 1.3],
  ['saffron-water', -3.11, 0.393, -2.5, 0.182],
  ['grain', -2.69, 0.392, -2.5, 0.208],
  ['mani-pills', -2.9, 0.394, -2.5, 0.156],
  ['jewel-bowl', -3.255, 0.942, -3.13, 0.2],
  ['norbu', -3.085, 0.94, -3.13, 0.24],
  ['treasure-vase', -2.915, 0.94, -3.13, 0.24],
  ['gold-silver', -2.745, 0.942, -3.13, 0.2],
  ['coral-turquoise', -3.425, 0.942, -3.13, 0.2],
  ['crystal', -2.575, 0.942, -3.13, 0.2],
];
const OFFER_TURN = 35; // degrees toward the east
// The statue: its painting 1.3 m wide, centred at x -3, its foot on the altar top, its back plane at z -3.52.
const STATUE_AT = [-3, 0.95, -3.52, 1.3];
