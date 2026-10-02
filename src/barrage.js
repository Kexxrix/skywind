// The full sequence is reserved before its first tell. Shape budgets include delayed shots.
export const AIM_SPEEDS = Object.freeze([160, 240, 340]);
export const SNAPSHOT_SPEEDS = Object.freeze([160, 340, 430, 470, 490, 520]);
export const MAX_BARRAGE_SPEED = 520;
const DEG = Math.PI / 180;
const PACE = value => Math.min(5, Math.max(0, Math.floor(Number.isFinite(value) ? value : 0)));
const FAMILY = { B01: 'radial', halo: 'radial', B02: 'weave', zipper: 'weave', B03: 'fan', petal: 'fan', trident: 'fan', seed: 'loom',
  B04: 'loom', loom: 'loom', cathedral: 'loom', B05: 'gate', jaws: 'gate', aim: 'aim', snapshot: 'aim', rail: 'aim',
  escort: 'deploy', deploy: 'deploy', lunge: 'body' };

/** A fixed authored contact distance schedules faster shots into a slow field already in flight. */
export function prefillDelay(slowSpeed, fastSpeed, distance = 600) {
  if (![slowSpeed, fastSpeed, distance].every(Number.isFinite) || slowSpeed <= 0 || fastSpeed <= 0 || distance < 0) return 0;
  return Math.max(0, distance / slowSpeed - distance / fastSpeed);
}

/** Keep a normal field independent from the separately reserved sniper source. */
export function fieldOnlyPlan(plan) {
  const field = structuredClone(plan);
  field.bundles = field.bundles.filter(bundle => bundle.family !== 'aim');
  field.families = [...new Set(field.bundles.map(bundle => bundle.family))];
  field.total = field.bundles.reduce((sum, bundle) => sum + bundle.count, 0);
  field.duration = field.bundles.at(-1)?.at || 0;
  field.prefillSeconds = 0;
  return field;
}

/** Fit the delay once at the tell snapshot; this never tracks the player after launch. */
export function fitPrefillPlan(plan, referenceDistance) {
  const bundles = plan.bundles.map(bundle => ({ ...bundle, ...(bundle.motion ? { motion: { ...bundle.motion } } : {}) }));
  const fitted = { ...plan, bundles, families: [...plan.families],
    ...(plan.contactWindow ? { contactWindow: { ...plan.contactWindow } } : {}) };
  if (!plan.contactWindow || !Number.isFinite(referenceDistance) || referenceDistance < 0) return fitted;
  const slow = bundles.find(bundle => bundle.family !== 'aim' && bundle.count > 0);
  const fast = bundles.find(bundle => bundle.family === 'aim' && bundle.count > 0);
  if (!slow || !Number.isFinite(slow.speed) || slow.speed <= 0) return fitted;
  const travel = referenceDistance / slow.speed;
  fitted.contactWindow = { ...plan.contactWindow, referenceDistance, from: travel,
    to: travel + plan.contactWindow.to - plan.contactWindow.from };
  if (fast && Number.isFinite(fast.speed) && fast.speed > 0) {
    const delay = prefillDelay(slow.speed, fast.speed, referenceDistance);
    const shift = delay - plan.prefillSeconds;
    for (const bundle of bundles) if (bundle.family === 'aim') bundle.at += shift;
    bundles.sort((a, b) => a.at - b.at || a.port - b.port);
    fitted.prefillSeconds = delay;
  }
  fitted.duration = bundles.at(-1)?.at || 0;
  return fitted;
}

export function barragePlan(pattern, tier = 0, seedValue = .5) {
  const t = PACE(tier), bundles = [];
  seedValue = Math.max(0, Math.min(1, Number.isFinite(seedValue) ? seedValue : .5));
  const add = (at, count, port = 0, extra = {}) => {
    const shotPattern = extra.pattern || pattern;
    bundles.push({ at, count, port, pattern: shotPattern, family: FAMILY[shotPattern] || 'fan', ...extra });
  };
  const fast = SNAPSHOT_SPEEDS[t], burst = t ? 3 : 1;
  let contactWindow, prefillSeconds = 0;
  if (pattern === 'B01') {
    for (let row = 0; row < [3, 3, 4, 4, 4, 5][t]; row++) add(row * [.65, .5, .48, .46, .44, .42][t], [18, 24, 26, 28, 32, 36][t], 0,
      { row, phase: row * [8, 10, 10, 11, 11, 12][t] * DEG, speed: [120, 145, 155, 165, 175, 185][t], style: 'bead', palette: 'magenta' });
  } else if (pattern === 'B02') {
    for (let port = 0; port < (t ? 2 : 1); port++) for (let row = 0; row < [8, 10, 11, 12, 13, 14][t]; row++) {
      add(port * .4 + row * [.22, .2, .2, .19, .18, .18][t], 3, port,
        { row, phase: Math.sin(row * Math.PI / 4 + port * Math.PI) * [18, 22, 22, 23, 24, 25][t] * DEG, speed: [125, 150, 155, 165, 175, 185][t], style: 'seed', palette: 'acid' });
    }
  } else if (pattern === 'B03') {
    for (let row = 0; row < [3, 4, 4, 4, 5, 5][t]; row++) add(row * [.85, .65, .65, .62, .6, .58][t], [18, 24, 26, 28, 32, 36][t], row % 2,
      { row, phase: (seedValue - .5) * 12 * DEG, speed: [110, 130, 140, 150, 160, 170][t] * (.95 + seedValue * .1), style: 'seed', palette: 'acid' });
  } else if (pattern === 'B04' || pattern === 'B05') {
    const offsets = pattern === 'B05' ? [0, 90, 0, -90] : [0, 28, 56, 84];
    const rows = pattern === 'B05' ? (t < 4 ? 3 : 4) : [2, 3, 3, 4, 4, 4][t];
    for (let row = 0; row < rows; row++) add(row * (pattern === 'B05' ? [1.25, 1.25, 1.25, 1.25, 1.2, 1.15][t] : [.95, .75, .85, .95, .95, 1][t]),
      (pattern === 'B05' ? [20, 24, 28, 30, 32, 34] : [20, 28, 30, 32, 34, 36])[t], 0,
      { row, safeOffset: offsets[row], speed: (pattern === 'B05' ? [140, 155, 165, 175, 185, 195] : [140, 165, 175, 180, 185, 190])[t], style: 'crescent', palette: 'violet', routeWindow: true });
  } else if (pattern === 'cathedral') {
    const slow = [120, 125, 130, 135, 140, 145][t];
    for (let port = 0; port < 4; port++) add(port * .08, [4, 5, 6, 7, 8, 8][t], port,
      { row: 0, phase: (port - 1.5) * .08, speed: slow, style: 'petal', palette: 'violet' });
    prefillSeconds = prefillDelay(slow, fast);
    for (let row = 0; row < burst; row++) add(prefillSeconds + row * .18, 1, 4,
      { pattern: 'snapshot', row, speed: fast, aimLock: 'snapshot', lockLead: .35, style: 'rail', palette: 'scarlet' });
    contactWindow = { referenceDistance: 600, from: 600 / slow, to: 600 / slow + .6 };
  } else if (pattern === 'halo') {
    const slow = 125, rings = t >= 3 ? 3 : 2;
    for (let row = 0; row < rings; row++) add(row * .58, [18, 24, 32, 36, 40, 48][t], row % 2,
      { row, phase: (seedValue * 8 + row * 9) * DEG, speed: slow, style: 'bead', palette: 'magenta' });
    prefillSeconds = prefillDelay(slow, fast);
    for (let row = 0; row < burst; row++) add(prefillSeconds + row * .22, 1, row % 2,
      { pattern: 'snapshot', row, speed: fast, aimLock: 'snapshot', lockLead: .35, style: 'needle', palette: 'scarlet' });
    contactWindow = { referenceDistance: 600, from: 600 / slow, to: 600 / slow + (rings - 1) * .58 };
  } else if (pattern === 'petal') {
    const perArm = [3, 4, 5, 6, 7, 7][t];
    for (let row = 0; row < (t >= 2 ? 3 : 2); row++) add(row * .68, perArm * 4, row % 2,
      { row, perArm, phase: seedValue * 20 * DEG + row * .12, speed: [120, 125, 130, 135, 140, 145][t], style: 'petal', palette: 'violet',
        motion: { kind: 'curve', turnRate: (row % 2 ? -1 : 1) * .19, turnSeconds: 1.75 } });
  } else if (pattern === 'trident') {
    for (let row = 0; row < (t >= 3 ? 4 : 3); row++) for (let port = 0; port < 3; port++) add(row * .48 + port * .08, t ? 3 : 2, port,
      { row, phase: (port - 1) * .22 + (seedValue - .5) * .08, speed: [120, 130, 140, 150, 160, 170][t], style: 'seed', palette: 'acid' });
  } else if (pattern === 'seed') {
    for (let row = 0; row < [2, 2, 3, 3, 4, 4][t]; row++) add(row * .82, 6, row % 2,
      { row, phase: (seedValue - .5) * .12 + row * .1, speed: [105, 115, 125, 130, 135, 140][t], style: 'seed', palette: 'acid', arming: .65,
        motion: { kind: 'accelerate', acceleration: 10, maxSpeed: Math.min(fast, 175) } });
  } else if (pattern === 'zipper') {
    for (let row = 0; row < [8, 10, 12, 14, 16, 18][t]; row++) {
      const side = row % 2 ? -1 : 1;
      add(row * .17, 3, row % 2, { row, phase: side * (.13 + (row % 6) * .025), speed: [130, 145, 150, 155, 160, 165][t],
        style: 'seed', palette: row % 2 ? 'acid' : 'magenta', motion: { kind: 'wave', amplitude: 9 + t, frequency: 1.6 } });
    }
  } else if (pattern === 'loom') {
    const slow = [120, 125, 130, 135, 140, 145][t], rows = t >= 3 ? 4 : 3;
    for (let row = 0; row < rows; row++) add(row * .62, [12, 16, 18, 20, 22, 24][t], row % 2,
      { row, phase: (seedValue - .5) * .12 + row * .07, speed: slow, horizontalSpeed: slow, speedLimit: Math.min(fast, 199), style: 'seed', palette: 'acid',
        motion: { kind: 'wave', amplitude: 7 + t * 2, frequency: 1.2 } });
    prefillSeconds = prefillDelay(slow, fast);
    for (let row = 0; row < burst; row++) add(prefillSeconds + row * .2, 1, row % 2,
      { pattern: 'snapshot', row, speed: fast, aimLock: 'snapshot', lockLead: .35, style: 'needle', palette: 'scarlet' });
    contactWindow = { referenceX: 240, referenceDistance: 600, from: 600 / slow, to: 600 / slow + (rows - 1) * .62 };
  } else if (pattern === 'jaws') {
    for (let row = 0; row < (t >= 3 ? 4 : 3); row++) add(row * .62, [12, 16, 18, 20, 22, 24][t], row % 2,
      { row, phase: (seedValue - .5) * .12, spread: [.85, .68, .5, .34][row], speed: [130, 145, 155, 165, 175, 185][t],
        style: 'crescent', palette: 'violet', motion: { kind: 'accelerate', acceleration: 18, maxSpeed: Math.min(fast, 230) } });
  } else if (pattern === 'snapshot' || pattern === 'rail') {
    for (let row = 0; row < burst; row++) add(row * (pattern === 'rail' ? .12 : .22), 1, row % 2,
      { row, speed: fast, aimLock: 'snapshot', lockLead: pattern === 'rail' ? .3 : .35,
        style: pattern === 'rail' ? 'rail' : 'needle', palette: 'scarlet' });
  } else add(0, ['escort', 'deploy', 'lunge'].includes(pattern) ? 0 : 1,
    0, { speed: AIM_SPEEDS[0], style: 'bead', palette: 'magenta' });
  bundles.sort((a, b) => a.at - b.at || a.port - b.port);
  const families = [...new Set(bundles.map(bundle => bundle.family))];
  return { pattern, initialPattern: pattern, family: FAMILY[pattern] || 'fan', families, bundles,
    total: bundles.reduce((sum, bundle) => sum + bundle.count, 0), duration: bundles.at(-1)?.at || 0,
    seedValue, pace: t, prefillSeconds, contactWindow,
    // routeWindow is a visible row aperture; it no longer grants blanket attack exclusivity.
    routeWindow: pattern === 'B04' || pattern === 'B05', movementWindow: false };
}

/** Geometry uses the firing snapshot; it never consults the player's position to carve a hole. */
export function patternGeometry(bundle, context = {}) {
  const pattern = bundle.pattern || context.pattern;
  const count = Math.max(0, Math.floor(bundle.count || 0)), points = [];
  const referenceX = context.referenceX ?? 360, safeLane = context.safeLane ?? 360;
  const safeHalf = (context.corridorWidth ?? 80) / 2 + (context.playerRadius ?? 1.85) + (context.bulletRadius ?? 5.5);
  const direction = context.safeDirection || 1, roll = context.roll || 0;
  const metadata = { style: bundle.style || 'bead', palette: bundle.palette || 'magenta',
    motion: bundle.motion ? { ...bundle.motion } : { kind: 'linear' } };
  if (pattern === 'B04' || pattern === 'B05') {
    const safeCenter = Math.max(155, Math.min(565, safeLane + (bundle.safeOffset ?? (bundle.row || 0) * 28) * direction));
    for (let i = 0; i < count; i++) {
      const targetY = count > 1 ? 65 + i * 590 / (count - 1) : 360;
      if (Math.abs(targetY - safeCenter) < safeHalf) continue;
      points.push({ port: i % (context.portCount || 2), targetX: referenceX, targetY, speed: bundle.speed,
        windowY: safeCenter, corridorWidth: context.corridorWidth ?? 80, ...metadata });
    }
    return points;
  }
  if (['aim', 'snapshot', 'rail', 'deploy', 'escort', 'lunge'].includes(pattern)) return points;
  for (let i = 0; i < count; i++) {
    let angle;
    if (pattern === 'B01' || pattern === 'halo') angle = i * Math.PI * 2 / count + (bundle.phase || 0) - roll;
    else if (pattern === 'zipper') {
      const side = bundle.port % 2 ? -1 : 1;
      const targetY = 360 + side * (48 + ((bundle.row || 0) % 6 - 2.5) * 8) + (i - (count - 1) / 2) * 18;
      points.push({ port: bundle.port || 0, targetX: referenceX, targetY, speed: bundle.speed, ...metadata,
        motion: { ...metadata.motion, phase: bundle.port % 2 ? Math.PI : 0 } });
      continue;
    } else if (pattern === 'B02') angle = Math.PI - roll + (bundle.phase || 0) + (i - (count - 1) / 2) * .075;
    else if (pattern === 'cathedral') angle = Math.PI - roll + (bundle.phase || 0) + (count > 1 ? i / (count - 1) - .5 : 0) * .42;
    else if (pattern === 'trident') angle = Math.PI - roll + (bundle.phase || 0) + (i - (count - 1) / 2) * .09;
    else if (pattern === 'seed') angle = Math.PI - roll + (Math.floor(i / 2) - 1) * .28 + (i % 2 ? .045 : -.045) + (bundle.phase || 0);
    else if (pattern === 'petal') {
      const perArm = bundle.perArm || Math.max(1, Math.floor(count / 4));
      angle = Math.floor(i / perArm) * Math.PI / 2 + (i % perArm) * .055 + (bundle.phase || 0) - roll;
    } else if (pattern === 'loom') {
      // A fixed cross-section covers the flight space without a player-centred exception.
      const targetY = Math.max(80, Math.min(640, 85 + (count > 1 ? i / (count - 1) : .5) * 550 + (bundle.row || 0) * 7));
      // Recover the actual port in the immutable sequence frame, not the current camera frame.
      // Equal horizontal travel keeps the whole grid at the same arrival plane;
      // reserve lateral wave velocity as well so neither speed nor slow-family caps are bypassed.
      let source = context.screenOrigin || { x: 960, y: 360 };
      if (context.origin && context.safeTarget) {
        const dx = context.origin.x - context.safeTarget.x, dy = context.origin.y - context.safeTarget.y;
        source = { x: referenceX + dx * Math.cos(roll) - dy * Math.sin(roll),
          y: safeLane + dx * Math.sin(roll) + dy * Math.cos(roll) };
      }
      const distance = Math.hypot(240 - source.x, targetY - source.y);
      const cosine = distance ? Math.abs(240 - source.x) / distance : 1;
      const lateral = (metadata.motion.amplitude || 0) * (metadata.motion.frequency || 0);
      const speed = Math.min(bundle.speedLimit ?? 199,
        Math.hypot((bundle.horizontalSpeed ?? bundle.speed) / Math.max(.01, cosine), lateral));
      points.push({ port: bundle.port || 0, targetX: 240, targetY, speed, ...metadata,
        motion: { ...metadata.motion, maxSpeed: speed } });
      continue;
    }
    else if (pattern === 'jaws') {
      const side = i % 2 ? -1 : 1, pair = Math.floor(i / 2), pairs = Math.ceil(count / 2);
      angle = Math.PI - roll + side * ((bundle.spread || .5) + pair / Math.max(1, pairs - 1) * .35) + (bundle.phase || 0);
    } else angle = Math.PI - roll + (count > 1 ? i / (count - 1) - .5 : 0) * 1.8 + (bundle.phase || 0) + Math.floor(i / 3) % 2 * .014;
    points.push({ port: bundle.port || 0, angle, speed: pattern === 'petal' ? bundle.speed + i % (bundle.perArm || 1) * 4 : bundle.speed, ...metadata,
      ...(Number.isFinite(bundle.arming) ? { arming: bundle.arming } : {}),
      ...(metadata.motion ? { motion: { ...metadata.motion } } : {}) });
  }
  return points;
}

export function relativeMinimumDistance(from, to, activeFrom = 0, activeTo = 1) {
  const dx = to.x - from.x, dy = to.y - from.y, length = dx * dx + dy * dy;
  const at = length ? Math.max(activeFrom, Math.min(activeTo, -(from.x * dx + from.y * dy) / length)) : activeTo;
  return Math.hypot(from.x + dx * at, from.y + dy * at);
}
