// Plans reserve the complete sequence before its first tell. No mid-ring truncation.
export const AIM_SPEEDS = Object.freeze([160, 240, 340]);
const DEG = Math.PI / 180;
export function barragePlan(pattern, tier = 0, seedValue = 0.5) {
  const t = Math.min(5, Math.max(0, Math.floor(Number.isFinite(tier) ? tier : 0))), bundles = [];
  seedValue = Math.max(0, Math.min(1, Number.isFinite(seedValue) ? seedValue : 0.5));
  const add = (at, count, port = 0, extra = {}) => bundles.push({ at, count, port, ...extra });
  if (pattern === 'B01') {
    for (let row = 0; row < [3, 3, 4, 4, 4, 5][t]; row++) add(row * [0.65, 0.5, 0.48, 0.46, 0.44, 0.42][t], [18, 24, 26, 28, 32, 36][t], 0,
      { row, phase: row * [8, 10, 10, 11, 11, 12][t] * DEG, speed: [120, 145, 155, 165, 175, 185][t] });
  } else if (pattern === 'B02') {
    for (let port = 0; port < [1, 2, 2, 2, 2, 2][t]; port++) for (let row = 0; row < [8, 10, 11, 12, 13, 14][t]; row++) {
      add(port * 0.4 + row * [0.22, 0.2, 0.2, 0.19, 0.18, 0.18][t], 3, port,
        { row, phase: Math.sin(row * Math.PI / 4 + port * Math.PI) * [18, 22, 22, 23, 24, 25][t] * DEG, speed: [125, 150, 155, 165, 175, 185][t] });
    }
  } else if (pattern === 'B03') {
    for (let row = 0; row < [3, 4, 4, 4, 5, 5][t]; row++) add(row * [0.85, 0.65, 0.65, 0.62, 0.6, 0.58][t], [18, 24, 26, 28, 32, 36][t], row % 2,
      { row, phase: (seedValue - 0.5) * 12 * DEG, speed: [110, 130, 140, 150, 160, 170][t] * (0.95 + seedValue * 0.1) });
  } else if (pattern === 'B04') {
    for (let row = 0; row < [2, 3, 3, 4, 4, 4][t]; row++) add(row * [0.95, 0.75, 0.85, 0.95, 0.95, 1][t], [20, 28, 30, 32, 34, 36][t], 0,
      { row, safeOffset: row * [28, 28, 24, 22, 20, 18][t], speed: [140, 165, 175, 180, 185, 190][t] });
  } else if (pattern === 'B05') {
    // A disclosed lane sequence has an actual travel interval; aimed shots cannot stack with it.
    const offsets = [0, 90, 0, -90];
    for (let row = 0; row < (t < 4 ? 3 : 4); row++) add(row * [1.25, 1.25, 1.25, 1.25, 1.2, 1.15][t], [20, 24, 28, 30, 32, 34][t], 0,
      { row, safeOffset: offsets[row], speed: [140, 155, 165, 175, 185, 195][t], movementWindow: true });
  } else add(0, pattern === 'escort' ? 0 : 1);
  bundles.sort((a, b) => a.at - b.at || a.port - b.port);
  return { pattern, bundles, total: bundles.reduce((sum, b) => sum + b.count, 0),
    duration: bundles.at(-1)?.at || 0, seedValue, pace: t,
    movementWindow: pattern === 'B04' || pattern === 'B05' };
}

/** Geometry is authored in the firing snapshot. The caller owns muzzle positions and world conversion. */
export function patternGeometry(bundle, context = {}) {
  const pattern = bundle.pattern || context.pattern;
  const count = Math.max(0, Math.floor(bundle.count || 0)), points = [];
  const referenceX = context.referenceX ?? 360, safeLane = context.safeLane ?? 360;
  const safeHalf = (context.corridorWidth ?? 80) / 2 + (context.playerRadius ?? 1.85) + (context.bulletRadius ?? 5.5);
  const direction = context.safeDirection || 1, roll = context.roll || 0;
  if (pattern === 'B04' || pattern === 'B05') {
    const safeCenter = Math.max(155, Math.min(565, safeLane + (bundle.safeOffset ?? (bundle.row || 0) * 28) * direction));
    for (let i = 0; i < count; i++) {
      const targetY = count > 1 ? 65 + i * 590 / (count - 1) : 360;
      if (Math.abs(targetY - safeCenter) < safeHalf) continue;
      points.push({ port: i % (context.portCount || 2), targetX: referenceX, targetY, speed: bundle.speed,
        windowY: safeCenter, corridorWidth: context.corridorWidth ?? 80 });
    }
    return points;
  }
  const origin = context.origin || { x: 1000, y: 360 }, safeTarget = context.safeTarget || { x: referenceX, y: safeLane };
  const safeAngle = Math.atan2(safeTarget.y - origin.y, safeTarget.x - origin.x);
  const gapAngle = Math.atan2(safeHalf, Math.max(220, Math.hypot(safeTarget.x - origin.x, safeTarget.y - origin.y)));
  for (let i = 0; i < count; i++) {
    let angle;
    if (pattern === 'B01') angle = i * Math.PI * 2 / count + (bundle.phase || 0) - roll;
    else if (pattern === 'B02') angle = Math.PI - roll + (bundle.phase || 0) + (i - (count - 1) / 2) * 0.075;
    else angle = Math.PI - roll + (count > 1 ? i / (count - 1) - 0.5 : 0) * 1.8 + (bundle.phase || 0) + Math.floor(i / 3) % 2 * 0.014;
    const difference = Math.abs(Math.atan2(Math.sin(angle - safeAngle), Math.cos(angle - safeAngle)));
    if (difference < gapAngle && pattern !== 'B02') continue;
    points.push({ port: bundle.port || 0, angle, speed: bundle.speed });
  }
  return points;
}

export function relativeMinimumDistance(from, to, activeFrom = 0, activeTo = 1) {
  const dx = to.x - from.x, dy = to.y - from.y, length = dx * dx + dy * dy;
  const at = length ? Math.max(activeFrom, Math.min(activeTo, -(from.x * dx + from.y * dy) / length)) : activeTo;
  return Math.hypot(from.x + dx * at, from.y + dy * at);
}
