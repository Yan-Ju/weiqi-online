// Redrawn from the supplied board reference using clean, independent curves.
// Geometry uses a 100-unit square; both colours share precisely the same model.
const THEMES = {
  black: { body: '#5c5957', shade: '#474543', light: '#777573', edge: '#302e2b' },
  white: { body: '#f9f9f9', shade: '#cececc', light: '#ffffff', edge: '#302e2b' },
};

const BASE = 'M22.1 90 V83.8 C22.1 76.7 27.6 74.2 35.2 74.2 Q50.5 73 65.3 74.2 C72.9 74.2 78.9 76.7 78.9 83.8 V90 Z';

// The outline is painted last. The pedestal caps the body at a shared baseline.
function layer(d, shade, theme, details = '') {
  return `<path d="${d}" fill="${theme.body}"/>` +
    (shade ? `<path d="${shade}" fill="${theme.shade}"/>` : '') +
    details + `<path d="${d}" fill="none" stroke="${theme.edge}"/>`;
}
function pedestal(theme) { return layer(BASE, '', theme); }

function rook(t) {
  const tower = 'M30.8 76 L34.7 40.5 Q50 37.7 65.3 40.5 L69.2 76 Z';
  const towerShade = 'M45 40 Q50 38.5 65.3 40.5 L69.2 76 H62.7 C61.5 57 57.4 43.3 45 40 Z';
  const crown = 'M27.2 22 Q32.2 19.8 37.1 19.6 L39 29 H44.2 L45.8 18.4 Q50 17.5 56.8 18.4 L58 29 H63.7 L65.4 19.6 Q70.4 20.2 73.7 22 L72.7 34.5 C72.3 39.5 69.9 42 65.3 42 Q50 40.5 34.7 42 C29.9 41.5 28.2 38.2 27.8 34.5 Z';
  const crownShade = 'M32.4 20.4 L32.7 32.7 Q33 37.8 36.4 40.6 Q51 39.2 65.4 40.6 C69.1 38.8 69.6 31.5 69.8 20.9 L73.7 22 L72.7 34.5 C72.3 39.5 69.9 42 65.3 42 Q50 40.5 34.7 42 C29.9 41.5 28.2 38.2 27.8 34.5 L27.2 22 Z';
  return layer(tower, towerShade, t) + layer(crown, crownShade, t) + pedestal(t);
}

function knight(t) {
  const body = 'M32.5 76 C33.5 66.6 39.5 61.2 45.3 55.7 C50.3 51.6 52.8 48.4 51.8 44.7 C47.5 49.3 40.2 54.8 35.1 52.2 C32.3 50.7 32.3 57.3 28.7 59.1 C25.5 60.1 18.9 56.8 16.9 55 C14.4 52.5 17.5 48.7 20.2 45.1 L26 37.5 C29.1 33.7 29.8 30.1 31.7 26 C33.5 22 37.1 21.4 37.3 16.3 C37.3 11.6 39.5 10.4 41.5 13.3 L47.6 19.7 C66.6 21.4 78.5 35.8 78.3 52.5 C78.4 61.7 75.8 70.3 74.1 76 Z';
  const shade = 'M54 21.5 C69 25.2 78.5 37.5 78.3 52.5 C78.4 61.7 75.8 70.3 74.1 76 H58.4 C63.1 67.2 70 62.5 70.5 51.5 C71 38.3 65.7 27 54 21.5 Z';
  const face = 'M37.3 16.3 C37.3 11.6 39.5 10.4 41.5 13.3 C39.7 21.8 34.9 24.8 34.2 29.3 C31.8 39 26.1 44.1 20.6 55.7 L16.9 55 C14.4 52.5 17.5 48.7 20.2 45.1 L26 37.5 C29.1 33.7 29.8 30.1 31.7 26 C33.5 22 37.1 21.4 37.3 16.3 Z';
  const jaw = 'M35.1 52.2 C40.2 54.8 47.5 49.3 51.8 44.7 Q54.4 40.6 53.1 36.4 C49.4 43.1 44 48.1 39.2 50.2 Q36.6 48.6 34.8 49.8 Z';
  const eye = 'M36.5 33.3 C36.6 29.6 39.6 27.8 41.9 29 C45 31.2 40.1 33.8 36.5 33.3 Z';
  return layer(body, shade, t, `<path d="${face}" fill="${t.light}"/><path d="${jaw}" fill="${t.shade}"/><path d="${eye}" fill="${t.edge}"/>`) + pedestal(t);
}

function bishop(t) {
  // An open contour makes the mitre slit truly transparent without a painted plug.
  const body = 'M38.2 75 C24.8 63.8 24.3 46.6 32.5 33.6 C36.1 27.8 40.7 23.3 45 20.4 C41.5 17.2 41.5 12.9 45.3 11.1 C49.7 8.4 55.3 10.6 56.2 15.1 C50.4 22.5 46.1 33.4 45.4 51.8 H53.2 C52.9 39.4 55.6 29 58.9 25.6 C71.2 37 78.3 52.5 70.6 66.7 Q68.3 71.2 63.5 75 Z';
  const shade = 'M58.9 25.6 C71.2 37 78.3 52.5 70.6 66.7 Q68.3 71.2 63.5 75 H54.2 C70.2 64.5 72.5 45.7 58.9 25.6 Z';
  const leftShade = 'M45 20.4 C41.5 17.2 41.5 12.9 45.3 11.1 Q49.5 9 51.7 10.8 C42.7 19.6 37.4 31.1 34.3 44.3 C30.6 57.9 34.3 68.8 38.2 75 C24.8 63.8 24.3 46.6 32.5 33.6 C36.1 27.8 40.7 23.3 45 20.4 Z';
  return layer(body, shade, t, `<path d="${leftShade}" fill="${t.light}"/>`) + pedestal(t);
}

function queen(t) {
  // All four round finials are part of one continuous crown contour.
  const body = 'M29.9 75 L18.1 43 C12.8 42.1 11.5 36.9 14.6 32.4 C18.4 26.7 25.5 29 26.3 34.1 Q26.7 37.7 24.4 40 L34.5 48 L35.3 28 C29.4 25.2 30.9 16.8 36.8 13.5 C42.8 10.3 49.3 14.6 47.7 21.5 Q47.2 24.4 43.9 27.1 L50 44.2 L56.1 27.1 C50.4 23.4 51.7 16.8 57.6 13.5 C63.6 10.3 70.1 14.6 68.5 21.5 Q68 25.9 64.7 28 L65.5 48 L75.6 40 C70.9 36.3 73.3 30.1 78.6 29 C84.8 27.5 90.4 33.9 87 39.8 Q85.1 42.6 81.9 43 L70.1 75 Z';
  const shade = 'M78.6 29 C84.8 27.5 90.4 33.9 87 39.8 Q85.1 42.6 81.9 43 L70.1 75 H51.9 C66.5 66.5 73.2 50.2 80.1 40.2 C84.8 35.8 82.1 31.1 78.6 29 Z';
  const highlights = 'M36.8 13.5 C42.8 10.3 49.3 14.6 47.7 21.5 Q47.2 24.4 43.9 27.1 L50 44.2 L45.2 35.2 L41 26.8 C46.8 21.8 46.4 15.5 36.8 13.5 Z M57.6 13.5 C63.6 10.3 70.1 14.6 68.5 21.5 Q68 25.9 64.7 28 L65.5 48 L62.3 44 L61.9 26.8 C67.7 21.8 67.2 15.5 57.6 13.5 Z';
  return layer(body, shade, t, `<path d="${highlights}" fill="${t.light}"/>`) + pedestal(t);
}

function king(t) {
  const outer = 'M30.8 75 L19.9 63.2 C11.6 55 9.7 49 14.3 39.8 C19.3 29.9 29.6 26.9 44.5 32.2 L45.7 25.2 H38.8 V16.1 H45.7 V9.9 H54.3 V16.1 H61.2 V25.2 H54.3 L55.5 32.2 C70.4 26.9 80.7 29.9 85.7 39.8 C90.3 49 88.4 55 80.1 63.2 L69.2 75 Z';
  const holes = 'M42.4 61 V47.7 C37.6 42.7 31.7 43.4 29 47.6 C25.1 53 35.4 57.1 38.8 61 Z M57.6 61 H61.2 C64.6 57.1 74.9 53 71 47.6 C68.3 43.4 62.4 42.7 57.6 47.7 Z';
  // No global masks/IDs: the same transparent compound path can repeat on any square.
  const shade = 'M71.8 30.1 C78.4 31.4 83.4 35.3 85.7 39.8 C90.3 49 88.4 55 80.1 63.2 L69.2 75 H61.3 C75 61.8 82.1 54.3 81.1 45.9 Q80.5 36.6 71.8 30.1 Z M50 10 H54.3 V16.1 H61.2 V25.2 H54.3 L55.5 32.2 L50 33.4 Z';
  return `<path d="${outer} ${holes}" fill="${t.body}" fill-rule="evenodd"/>` +
    `<path d="${shade}" fill="${t.shade}"/>` +
    `<path d="${outer} ${holes}" fill="none" stroke="${t.edge}"/>` + pedestal(t);
}

function pawn(t) {
  const body = 'M25 90 C25 79.9 29.3 75.4 35.9 71.3 C41.2 67.8 44.1 61.9 44.7 56 H36.1 L34.8 51.5 L43 46.2 C34.8 40.4 35.7 29.2 43.2 25.6 C51.7 21.4 60.3 25.9 62.4 33.8 C63.8 39.4 61.2 43.7 57 46.2 L65.2 51.5 L63.9 56 H55.3 C55.9 61.9 58.8 67.8 64.1 71.3 C70.7 75.4 75 79.9 75 90 Z';
  const shade = 'M53.6 24.7 C58.1 26.2 61.3 29.2 62.4 33.8 C63.8 39.4 61.2 43.7 57 46.2 L65.2 51.5 L63.9 56 H55.3 C55.9 61.9 58.8 67.8 64.1 71.3 C55.2 67.5 49.6 61.9 45.1 56 L55.6 54.7 C62.9 50.9 58.6 47.6 53.3 47 C62.4 42.9 62 30.6 53.6 24.7 Z';
  const highlight = 'M44.7 56 C44.1 61.9 41.2 67.8 35.9 71.3 C29.3 75.4 25 79.9 25 90 H28.7 C28.3 82.9 34.3 79.1 39.7 75.1 C44.3 71.7 47 65.4 44.7 56 Z';
  const collar = `<path d="M36.1 56 H63.9" fill="none" stroke="${t.edge}"/>`;
  return layer(body, shade, t, `<path d="${highlight}" fill="${t.light}"/>` + collar);
}

const MODELS = { r: rook, n: knight, b: bishop, q: queen, k: king, p: pawn };
function render(model, theme) {
  return `<g stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${model(theme)}</g>`;
}
export const PIECE_PATHS = Object.fromEntries(Object.entries(MODELS).flatMap(([key, model]) => [
  [key, render(model, THEMES.black)],
  [key.toUpperCase(), render(model, THEMES.white)],
]));
