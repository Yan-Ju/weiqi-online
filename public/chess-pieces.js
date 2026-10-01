// Handcrafted vector chess piece models
// Shared geometry for black and white pieces

const BLACK = {
  main: '#5c5957',
  shadow: '#474543',
  outline: '#302e2b',
};

const WHITE = {
  main: '#f7f7f7',
  shadow: '#d3d3d1',
  outline: '#302e2b',
};

// Common curved-top flat-bottom pedestal geometry for major pieces
// Arched top at y75, nearly vertical corner walls to straight y90 bottom (x22..78)
// Drawn LAST so base rim and outline cleanly meet piece bodies without stray overlap lines
const PEDESTAL_BASE_D = 'M 22 90 L 78 90 C 78.5 86, 77.5 80, 74 76 C 62 73.5, 38 73.5, 26 76 C 22.5 80, 21.5 86, 22 90 Z';
const PEDESTAL_SHADOW_D = 'M 66 74.2 C 70.5 74.8, 73 75.2, 74 76 C 77.5 80, 78.5 86, 78 90 L 72.5 90 C 74 86, 73.5 81, 71 77 C 69 75, 67 74.5, 66 74.2 Z';

function renderPedestal(theme) {
  return `<path d="${PEDESTAL_BASE_D}" fill="${theme.main}"/>` +
         `<path d="${PEDESTAL_SHADOW_D}" fill="${theme.shadow}"/>` +
         `<path d="${PEDESTAL_BASE_D}" fill="none" stroke="${theme.outline}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`;
}

// 1. ROOK (x27..74, y19..90)
// Three raised teeth, sloping notch walls, softly rounded outer top corners
// Tower top x34..66 at y40 widening to x30..70 at y75
// Curved diagonal shadow facet from center top to right lower body, no dividing horizontal line
function renderRook(theme) {
  const rookD = 'M 30 75 ' +
    'L 34 40 ' +
    'L 27 40 ' +
    'C 26.8 34, 27.1 24, 27.5 20.5 ' +
    'C 27.8 19.5, 28.6 19, 29.5 19 ' +
    'L 35.5 19 ' +
    'L 37.5 27 ' +
    'L 43.5 27 ' +
    'L 45.5 19 ' +
    'L 54.5 19 ' +
    'L 56.5 27 ' +
    'L 62.5 27 ' +
    'L 64.5 19 ' +
    'L 70.5 19 ' +
    'C 71.4 19, 72.2 19.5, 72.5 20.5 ' +
    'C 72.9 24, 73.2 34, 73 40 ' +
    'L 66 40 ' +
    'L 70 75 ' +
    'C 60 74.5, 40 74.5, 30 75 Z';

  const rookShadowD = 'M 50 19 ' +
    'L 54.5 19 ' +
    'L 56.5 27 ' +
    'L 62.5 27 ' +
    'L 64.5 19 ' +
    'L 70.5 19 ' +
    'C 71.4 19, 72.2 19.5, 72.5 20.5 ' +
    'C 72.9 24, 73.2 34, 73 40 ' +
    'L 66 40 ' +
    'L 70 75 ' +
    'C 66 74.7, 63 74.4, 60 74.2 ' +
    'C 63 64, 61 52, 51 40 ' +
    'L 50 19 Z';

  return `<g>` +
    `<path d="${rookD}" fill="${theme.main}"/>` +
    `<path d="${rookShadowD}" fill="${theme.shadow}"/>` +
    `<path d="${rookD}" fill="none" stroke="${theme.outline}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>` +
    renderPedestal(theme) +
    `</g>`;
}

// 2. KNIGHT (x17..78, y12..90)
// Sculpted horse with softly curved hook ear (x40, y12), sloping forehead (x32 y28, x29 y36),
// muzzle (x17 y51, x24 y58), jaw notch (x31 y52) to jaw tip at (52, 41),
// throat scoop through (52, 49), (47, 56), (38, 65) flaring to neck base at (34, 75),
// smoothly arched upper back from crown (50, 21) via (72, 34) and (78, 50) to (72, 75),
// tilted teardrop eye at (39, 31), and sweeping right-back shadow
function renderKnight(theme) {
  const horseD = 'M 34 75 ' +
    'C 36 69, 41 61.5, 47 56 ' +
    'C 50.5 52, 52 47, 52 41 ' +
    'C 50 43, 47 45, 44 47 ' +
    'C 40 48, 35 50, 31 52 ' +
    'C 28 54, 25 57, 23.5 58 ' +
    'C 19 57, 17 54, 17 51 ' +
    'C 17 48, 21 44, 25 40 ' +
    'C 29 36, 31 32, 32 28 ' +
    'C 33 24, 35 18, 37 15 ' +
    'C 38 13, 39 12, 40 12 ' +
    'C 42 12, 44 14, 43 18 ' +
    'C 48 18.5, 56 22, 64 26.5 ' +
    'C 68 29.5, 71 31.5, 72 34 ' +
    'C 75.5 39, 78 44, 78 50 ' +
    'C 78 59, 76 68, 72 75 ' +
    'C 60 74.5, 45 74.5, 34 75 Z';

  const horseShadowD = 'M 43 18 ' +
    'C 48 18.5, 56 22, 64 26.5 ' +
    'C 68 29.5, 71 31.5, 72 34 ' +
    'C 75.5 39, 78 44, 78 50 ' +
    'C 78 59, 76 68, 72 75 ' +
    'C 67 74.6, 62 74.3, 58 74 ' +
    'C 64 66, 66 55, 64 45 ' +
    'C 62 36, 56 26, 48 20 ' +
    'C 45 18.5, 44 18, 43 18 Z';

  const eyeD = 'M 36.5 32 C 35.5 30.5, 37.5 28.5, 41 29 C 42.5 30, 42 32.5, 39.5 33 C 38.2 33.2, 37.2 32.8, 36.5 32 Z';

  return `<g>` +
    `<path d="${horseD}" fill="${theme.main}"/>` +
    `<path d="${horseShadowD}" fill="${theme.shadow}"/>` +
    `<path d="${eyeD}" fill="${theme.outline}"/>` +
    `<path d="${horseD}" fill="none" stroke="${theme.outline}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>` +
    renderPedestal(theme) +
    `</g>`;
}

// 3. BISHOP (x27..73, y11.5..90)
// Finial at center (50, 16), curved narrow slit near center below finial
// from x51 y23 to x45 y51 to x52 y52 to x57 y24, right shoulder at x59 y26
// Body x27..73 y23..75, slit transparent on both light and dark squares
function renderBishop(theme) {
  const finialD = 'M 50 11.5 C 52.8 11.5, 55 13.7, 55 16.5 C 55 19.3, 52.8 21.5, 50 21.5 C 47.2 21.5, 45 19.3, 45 16.5 C 45 13.7, 47.2 11.5, 50 11.5 Z';
  const finialShadowD = 'M 50 11.5 C 52.8 11.5, 55 13.7, 55 16.5 C 55 19.3, 52.8 21.5, 50 21.5 C 51.5 20, 52.5 18, 52.5 16.5 C 52.5 15, 51.5 13, 50 11.5 Z';

  const mitreD = 'M 30 75 ' +
    'C 27.5 68, 27 58, 27 49 ' +
    'C 27 38, 35 26, 44 21.5 ' +
    'C 47 20, 49.5 21, 51 23 ' +
    'C 49 30, 46.5 40, 45 51 ' +
    'C 46.5 52.2, 50 52.4, 52 52 ' +
    'C 52 40, 52 34, 57 24 ' +
    'C 57.8 24.5, 58.5 25.2, 59 26 ' +
    'C 67 33, 73 42, 73 50 ' +
    'C 73 59, 72.5 68, 70 75 ' +
    'C 60 74.5, 40 74.5, 30 75 Z';

  const mitreShadowD = 'M 59 26 ' +
    'C 67 33, 73 42, 73 50 ' +
    'C 73 59, 72.5 68, 70 75 ' +
    'C 66 74.7, 63 74.5, 60 74.2 ' +
    'C 63.5 67, 65 58, 64.5 50 ' +
    'C 64 42, 61.5 33, 59 26 Z';

  return `<g>` +
    `<path d="${mitreD}" fill="${theme.main}"/>` +
    `<path d="${mitreShadowD}" fill="${theme.shadow}"/>` +
    `<path d="${mitreD}" fill="none" stroke="${theme.outline}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="${finialD}" fill="${theme.main}"/>` +
    `<path d="${finialShadowD}" fill="${theme.shadow}"/>` +
    `<path d="${finialD}" fill="none" stroke="${theme.outline}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>` +
    renderPedestal(theme) +
    `</g>`;
}

// 4. QUEEN (x12..88, y12..90)
// Four prominent circular ball finials (radius 7):
// Central balls centered at (38, 19) and (62, 19), outer balls centered at (19, 35) and (81, 35)
// Narrow shafts descending into deep V valleys at (34, 46), (50, 41), (66, 46)
// Crown body tapers smoothly inward to x30..70 at baseline y75
function renderQueen(theme) {
  const crownD = 'M 30 75 ' +
    'C 25 66, 18 54, 15 43 ' +
    'C 13.5 39.5, 12.5 38, 12.5 37 ' +
    'A 7 7 0 1 1 24.5 39.5 ' +
    'C 26 42.5, 29.5 45.5, 34 46 ' +
    'C 34.5 39, 34.5 32, 34.5 25 ' +
    'A 7 7 0 1 1 41.5 25 ' +
    'C 43.5 30, 46.5 36.5, 50 41 ' +
    'C 53.5 36.5, 56.5 30, 58.5 25 ' +
    'A 7 7 0 1 1 65.5 25 ' +
    'C 65.5 32, 65.5 39, 66 46 ' +
    'C 70.5 45.5, 74 42.5, 75.5 39.5 ' +
    'A 7 7 0 1 1 87.5 37 ' +
    'C 87.5 38, 86.5 39.5, 85 43 ' +
    'C 82 54, 75 66, 70 75 ' +
    'C 60 74.5, 40 74.5, 30 75 Z';

  const crownShadowD = 'M 50 41 ' +
    'C 53.5 36.5, 56.5 30, 58.5 25 ' +
    'A 7 7 0 1 1 65.5 25 ' +
    'C 65.5 32, 65.5 39, 66 46 ' +
    'C 70.5 45.5, 74 42.5, 75.5 39.5 ' +
    'A 7 7 0 1 1 87.5 37 ' +
    'C 87.5 38, 86.5 39.5, 85 43 ' +
    'C 82 54, 75 66, 70 75 ' +
    'C 65 74.6, 61 74.3, 57 74 ' +
    'C 63 65, 63 54, 58 46 ' +
    'C 55 42, 52 41.5, 50 41 Z';

  return `<g>` +
    `<path d="${crownD}" fill="${theme.main}"/>` +
    `<path d="${crownShadowD}" fill="${theme.shadow}"/>` +
    `<path d="${crownD}" fill="none" stroke="${theme.outline}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>` +
    renderPedestal(theme) +
    `</g>`;
}

// 5. KING (x14..86, y10..90)
// Crisp orthogonal cross x40..60 y10..32, body shoulders starting y30..32
// D/teardrop inner holes start at y44 and finish at y60:
// Left hole within x30..43, right within x57..70 with vertical inner edges x43 and x57;
// Shadow strictly constrained to outer right flank (x >= 74), well clear of right hole (x <= 69.5)
function renderKing(theme) {
  const crossD = 'M 46.5 10 L 53.5 10 L 53.5 16 L 60 16 L 60 22 L 53.5 22 L 53.5 32 L 46.5 32 L 46.5 22 L 40 22 L 40 16 L 46.5 16 Z';
  const crossShadowD = 'M 50 10 L 53.5 10 L 53.5 16 L 60 16 L 60 22 L 53.5 22 L 53.5 32 L 50 32 Z';

  const crownOuterD = 'M 46.5 32 ' +
    'C 40 29.5, 28 32, 21 38 ' +
    'C 14 44, 14 52, 17 58 ' +
    'C 21 65, 26 71, 30 75 ' +
    'C 40 74.5, 60 74.5, 70 75 ' +
    'C 74 71, 79 65, 83 58 ' +
    'C 86 52, 86 44, 79 38 ' +
    'C 72 32, 60 29.5, 53.5 32 Z';

  const leftHoleD = 'M 43 44 L 43 60 C 37 59.5, 32 55, 31 50 C 30 45, 35 44, 43 44 Z';
  const rightHoleD = 'M 57 44 L 57 60 C 63 59.5, 68 55, 69 50 C 70 45, 65 44, 57 44 Z';

  const crownCompoundD = `${crownOuterD} ${leftHoleD} ${rightHoleD}`;

  // Shadow stays strictly to the right of right hole (x >= 74 vs x <= 69.5)
  const crownShadowD = 'M 65 31 ' +
    'C 72 32, 78 36, 83 42 ' +
    'C 86.5 46.5, 86 52, 83 58 ' +
    'C 79 65, 74 71, 70 75 ' +
    'C 66 74.7, 63 74.4, 61 74 ' +
    'C 67 69, 74 61, 75 52 ' +
    'C 76 44, 72 36, 65 31 Z';

  return `<g fill-rule="evenodd">` +
    `<path d="${crownCompoundD}" fill="${theme.main}"/>` +
    `<path d="${crownShadowD}" fill="${theme.shadow}"/>` +
    `<path d="${crownOuterD}" fill="none" stroke="${theme.outline}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="${leftHoleD}" fill="none" stroke="${theme.outline}" stroke-width="2.2" stroke-linejoin="round"/>` +
    `<path d="${rightHoleD}" fill="none" stroke="${theme.outline}" stroke-width="2.2" stroke-linejoin="round"/>` +
    `<path d="${crossD}" fill="${theme.main}"/>` +
    `<path d="${crossShadowD}" fill="${theme.shadow}"/>` +
    `<path d="${crossD}" fill="none" stroke="${theme.outline}" stroke-width="2.2" stroke-linejoin="miter"/>` +
    renderPedestal(theme) +
    `</g>`;
}

// 6. PAWN (x26..74, y24..90)
// Unified coherent silhouette: round head center (50, 36) radius 12 seamlessly joined
// to sloping shoulder band at y50..56 (x36..64), curved waist at y61, and wide baseline x26..74 y90
// Clean collar chin line at neck, sliver head shade, and flowing body shadow
function renderPawn(theme) {
  const pawnD = 'M 26 90 ' +
    'L 74 90 ' +
    'C 74 88.5, 73.5 87, 71 84.5 ' +
    'C 64 77, 57.5 68, 57.5 61 ' +
    'C 57.5 58.5, 61 57.5, 64 56.5 ' +
    'C 65 55, 65 53, 64 52 ' +
    'C 61.5 50, 58.5 47.5, 56.5 46 ' +
    'A 12 12 0 1 0 43.5 46 ' +
    'C 41.5 47.5, 38.5 50, 36 52 ' +
    'C 35 53, 35 55, 36 56.5 ' +
    'C 39 57.5, 42.5 58.5, 42.5 61 ' +
    'C 42.5 68, 36 77, 29 84.5 ' +
    'C 26.5 87, 26 88.5, 26 90 Z';

  const collarD = 'M 43.5 46 C 45.5 48.2, 54.5 48.2, 56.5 46';

  const headShadowD = 'M 50 24 ' +
    'C 56.63 24, 62 29.37, 62 36 ' +
    'C 62 40, 60.5 43.5, 56.5 46 ' +
    'C 58.5 43, 59 39, 59 36 ' +
    'C 59 30.5, 55 25.5, 50 24 Z';

  const bodyShadowD = 'M 56.5 46 ' +
    'C 58.5 47.5, 61.5 50, 64 52 ' +
    'C 65 53, 65 55, 64 56.5 ' +
    'C 61 57.5, 57.5 58.5, 57.5 61 ' +
    'C 57.5 68, 64 77, 71 84.5 ' +
    'C 73.5 87, 74 88.5, 74 90 ' +
    'L 63 90 ' +
    'C 65 86, 64 80, 58 72 ' +
    'C 52 64, 49 57, 56.5 46 Z';

  return `<g>` +
    `<path d="${pawnD}" fill="${theme.main}"/>` +
    `<path d="${bodyShadowD}" fill="${theme.shadow}"/>` +
    `<path d="${headShadowD}" fill="${theme.shadow}"/>` +
    `<path d="${pawnD}" fill="none" stroke="${theme.outline}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="${collarD}" fill="none" stroke="${theme.outline}" stroke-width="2.2" stroke-linecap="round"/>` +
    `</g>`;
}

export const PIECE_PATHS = {
  // Black pieces (lowercase)
  p: renderPawn(BLACK),
  r: renderRook(BLACK),
  n: renderKnight(BLACK),
  b: renderBishop(BLACK),
  q: renderQueen(BLACK),
  k: renderKing(BLACK),

  // White pieces (uppercase)
  P: renderPawn(WHITE),
  R: renderRook(WHITE),
  N: renderKnight(WHITE),
  B: renderBishop(WHITE),
  Q: renderQueen(WHITE),
  K: renderKing(WHITE),
};
