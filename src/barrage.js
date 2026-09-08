// Plans reserve the complete sequence before its first tell. No mid-ring truncation.
export const AIM_SPEEDS = Object.freeze([160, 240, 340]);
const DEG = Math.PI / 180;
export function barragePlan(pattern, tier = 0, seedValue = 0.5) {
  const t = Math.min(1, Math.max(0, tier)), bundles = [];
  const add = (at, count, port = 0, extra = {}) => bundles.push({ at, count, port, ...extra });
  if (pattern === 'B01') {
    for (let row = 0; row < 3; row++) add(row * [0.65, 0.5][t], [18, 24][t], 0,
      { row, phase: row * [8, 10][t] * DEG, speed: [120, 145][t] });
  } else if (pattern === 'B02') {
    for (let port = 0; port < [1, 2][t]; port++) for (let row = 0; row < [8, 10][t]; row++) {
      add(port * 0.4 + row * [0.22, 0.2][t], 3, port,
        { row, phase: Math.sin(row * Math.PI / 4 + port * Math.PI) * [18, 22][t] * DEG, speed: [125, 150][t] });
    }
  } else if (pattern === 'B03') {
    for (let row = 0; row < [3, 4][t]; row++) add(row * [0.85, 0.65][t], [18, 24][t], row % 2,
      { row, phase: (seedValue - 0.5) * 12 * DEG, speed: [110, 130][t] * (0.95 + seedValue * 0.1) });
  } else if (pattern === 'B04') {
    for (let row = 0; row < [2, 3][t]; row++) add(row * [0.95, 0.75][t], [20, 28][t], 0,
      { row, speed: [140, 165][t] });
  } else add(0, pattern === 'escort' ? 0 : 1);
  bundles.sort((a, b) => a.at - b.at || a.port - b.port);
  return { pattern, bundles, total: bundles.reduce((sum, b) => sum + b.count, 0),
    duration: bundles.at(-1)?.at || 0, seedValue };
}

export function relativeMinimumDistance(from, to, activeFrom = 0, activeTo = 1) {
  const dx = to.x - from.x, dy = to.y - from.y, length = dx * dx + dy * dy;
  const at = length ? Math.max(activeFrom, Math.min(activeTo, -(from.x * dx + from.y * dy) / length)) : activeTo;
  return Math.hypot(from.x + dx * at, from.y + dy * at);
}
