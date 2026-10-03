import { projectilePositionAt } from './projectile-motion.js';

// The full sequence is reserved before its first tell. Shape budgets include delayed shots.
export const AIM_SPEEDS = Object.freeze([210, 300, 420]);
export const SNAPSHOT_SPEEDS = Object.freeze([320, 420, 460, 490, 505, 520]);
export const MAX_BARRAGE_SPEED = 520;
// Advancing grids use a faster horizontal layer than radial/curved space control.
// Diagonal and wave velocity stays below this layer's own cap and the locked shot cap.
export const FIELD_ADVANCE_SPEEDS = Object.freeze([210, 235, 260, 280, 300, 320]);
export const FIELD_SPEED_LIMITS = Object.freeze([295, 320, 350, 380, 400, 420]);
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
export function fieldOnlyPlan(plan, options = {}) {
  const field = structuredClone(plan);
  field.bundles = field.bundles.filter(bundle => bundle.family !== 'aim');
  // Normal Stage1 has two visible field sources and keeps its original transit
  // speeds/timing. Dense rows spend the existing 24-shot/72-sequence budgets;
  // bosses keep their original plan and later paces keep their current shapes.
  if (field.pace === 0) {
    const counts = { trident: 4, loom: 24, zipper: 6, petal: 24, B04: 24 };
    if (field.pattern === 'seed') {
      const first = field.bundles[0], last = field.bundles.at(-1);
      field.bundles = Array.from({ length: 4 }, (_, row) => ({ ...structuredClone(first),
        row, port: row % 2, at: first.at + (last.at - first.at) * row / 3,
        phase: first.phase + (last.phase - first.phase) * row / 3 }));
    } else if (counts[field.pattern]) {
      field.bundles = field.bundles.map(bundle => ({ ...bundle, count: counts[field.pattern],
        ...(field.pattern === 'petal' ? { perArm: 6, speedStepCount: bundle.perArm } : {}) }));
    }
    if (options.shape?.kind === 'forward-cross' && ['trident', 'seed', 'petal'].includes(field.pattern))
      field.bundles = field.bundles.map(bundle => ({ ...bundle,
        crossBand: { x: options.shape.x, fromY: options.shape.fromY, toY: options.shape.toY } }));
  }
  // Stage3 uses two dense forward arcs from the same64-shot/.58s source.
  // Later fields retain alternating rows; full boss halos remain radial.
  if(field.pattern==='halo'&&field.pace===2) {
    const first=field.bundles[0],total=field.bundles.reduce((sum,bundle)=>sum+bundle.count,0),duration=field.bundles.at(-1).at;
    field.bundles=Array.from({length:2},(_,row)=>({...first,row,port:row%2,at:row*duration,count:total/2,
      speed:FIELD_ADVANCE_SPEEDS[field.pace],forwardArc:true,motion:{kind:'linear'}}));
    // The replacement second phrase keeps its previous60-field-shot budget.
    if(options.shape==='curve-arc')field.bundles=field.bundles.map(bundle=>({...bundle,count:30,
      motion:{kind:'curve',turnRate:bundle.row%2?-.09:.09,turnSeconds:2}}));
  } else if (field.pattern === 'halo' && field.pace > 2) {
    const total = field.bundles.reduce((sum, bundle) => sum + bundle.count, 0), first = field.bundles[0];
    field.bundles = Array.from({ length: 4 }, (_, row) => ({ ...first, at: row * .38, row, port: row % 2,
      count: Math.floor(total / 4) + (row < total % 4 ? 1 : 0), forwardField: true,
      speed: FIELD_ADVANCE_SPEEDS[field.pace], horizontalSpeed: FIELD_ADVANCE_SPEEDS[field.pace],
      speedLimit: FIELD_SPEED_LIMITS[field.pace], phase: row % 2 ? -.5 : 0, motion: { kind: 'linear' } }));
  }
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
      { row, phase: row * [8, 10, 10, 11, 11, 12][t] * DEG, speed: [150, 170, 185, 195, 210, 220][t], style: 'bead', palette: 'magenta' });
  } else if (pattern === 'B02') {
    for (let port = 0; port < (t ? 2 : 1); port++) for (let row = 0; row < [8, 10, 11, 12, 13, 14][t]; row++) {
      add(port * .4 + row * [.22, .2, .2, .19, .18, .18][t], 3, port,
        { row, phase: Math.sin(row * Math.PI / 4 + port * Math.PI) * [18, 22, 22, 23, 24, 25][t] * DEG, speed: [190, 215, 245, 270, 295, 315][t], style: 'seed', palette: 'acid' });
    }
  } else if (pattern === 'B03') {
    for (let row = 0; row < [3, 4, 4, 4, 5, 5][t]; row++) add(row * [.85, .65, .65, .62, .6, .58][t], [18, 24, 26, 28, 32, 36][t], row % 2,
      { row, phase: (seedValue - .5) * 12 * DEG, speed: [150, 175, 195, 210, 230, 245][t] * (.95 + seedValue * .1), style: 'seed', palette: 'acid' });
  } else if (pattern === 'B04' || pattern === 'B05') {
    const offsets = pattern === 'B05' ? [0, 90, 0, -90] : [0, 28, 56, 84];
    const rows = pattern === 'B05' ? (t < 4 ? 3 : 4) : [2, 3, 3, 4, 4, 4][t];
    for (let row = 0; row < rows; row++) add(row * (pattern === 'B05' ? [1.25, 1.25, 1.25, 1.25, 1.2, 1.15][t] : [.95, .75, .85, .95, .95, 1][t]),
      (pattern === 'B05' ? [20, 24, 28, 30, 32, 34] : [20, 28, 30, 32, 34, 36])[t], 0,
      { row, safeOffset: offsets[row], speed: (pattern === 'B05' ? [220, 240, 260, 280, 300, 320] : [220, 245, 270, 290, 310, 330])[t], style: 'crescent', palette: 'violet', routeWindow: true });
  } else if (pattern === 'cathedral') {
    const slow = [170, 195, 220, 235, 250, 265][t];
    for (let port = 0; port < 4; port++) add(port * .08, [4, 5, 6, 7, 8, 8][t], port,
      { row: 0, phase: (port - 1.5) * .08, speed: slow, style: 'petal', palette: 'violet' });
    prefillSeconds = prefillDelay(slow, fast);
    for (let row = 0; row < burst; row++) add(prefillSeconds + row * .18, 1, 4,
      { pattern: 'snapshot', row, speed: fast, aimLock: 'snapshot', lockLead: .35, style: 'rail', palette: 'scarlet' });
    contactWindow = { referenceDistance: 600, from: 600 / slow, to: 600 / slow + .6 };
  } else if (pattern === 'halo') {
    const slow = [150, 170, 185, 195, 210, 220][t], rings = t >= 3 ? 3 : 2;
    for (let row = 0; row < rings; row++) add(row * .58, [18, 24, 32, 36, 40, 48][t], row % 2,
      { row, phase: (seedValue * 8 + row * 9) * DEG, speed: slow, style: 'bead', palette: 'magenta' });
    prefillSeconds = prefillDelay(slow, fast);
    for (let row = 0; row < burst; row++) add(prefillSeconds + row * .22, 1, row % 2,
      { pattern: 'snapshot', row, speed: fast, aimLock: 'snapshot', lockLead: .35, style: 'needle', palette: 'scarlet' });
    contactWindow = { referenceDistance: 600, from: 600 / slow, to: 600 / slow + (rings - 1) * .58 };
  } else if (pattern === 'petal') {
    const perArm = [3, 4, 5, 6, 7, 7][t];
    for (let row = 0; row < (t >= 2 ? 3 : 2); row++) add(row * .68, perArm * 4, row % 2,
      { row, perArm, phase: seedValue * 20 * DEG + row * .12, speed: [150, 165, 180, 195, 210, 225][t], style: 'petal', palette: 'violet',
        motion: { kind: 'curve', turnRate: (row % 2 ? -1 : 1) * .19, turnSeconds: 1.75 } });
  } else if (pattern === 'trident') {
    for (let row = 0; row < (t >= 3 ? 4 : 3); row++) for (let port = 0; port < 3; port++) add(row * .48 + port * .08, t ? 3 : 2, port,
      { row, phase: (port - 1) * .22 + (seedValue - .5) * .08, speed: [210, 235, 260, 285, 310, 330][t], style: 'seed', palette: 'acid' });
  } else if (pattern === 'seed') {
    for (let row = 0; row < [2, 2, 3, 3, 4, 4][t]; row++) add(row * .82, 6, row % 2,
      { row, phase: (seedValue - .5) * .12 + row * .1, speed: [175, 200, 225, 245, 265, 280][t], style: 'seed', palette: 'acid', arming: .65,
        motion: { kind: 'accelerate', acceleration: 10, maxSpeed: Math.min(fast, [225, 260, 295, 320, 345, 365][t]) } });
  } else if (pattern === 'zipper') {
    for (let row = 0; row < [8, 10, 12, 14, 16, 18][t]; row++) {
      const side = row % 2 ? -1 : 1;
      add(row * .17, 3, row % 2, { row, phase: side * (.13 + (row % 6) * .025), speed: [190, 215, 240, 260, 285, 305][t],
        style: 'seed', palette: row % 2 ? 'acid' : 'magenta', motion: { kind: 'wave', amplitude: 9 + t, frequency: 1.6 } });
    }
  } else if (pattern === 'loom') {
    const slow = FIELD_ADVANCE_SPEEDS[t], rows = t >= 3 ? 4 : 3;
    for (let row = 0; row < rows; row++) add(row * .62, [12, 16, 18, 20, 22, 24][t], row % 2,
      { row, phase: (seedValue - .5) * .12 + row * .07, speed: slow, horizontalSpeed: slow, speedLimit: Math.min(fast, FIELD_SPEED_LIMITS[t]), style: 'seed', palette: 'acid',
        motion: { kind: 'wave', amplitude: 7 + t * 2, frequency: 1.2 } });
    prefillSeconds = prefillDelay(slow, fast);
    for (let row = 0; row < burst; row++) add(prefillSeconds + row * .2, 1, row % 2,
      { pattern: 'snapshot', row, speed: fast, aimLock: 'snapshot', lockLead: .35, style: 'needle', palette: 'scarlet' });
    contactWindow = { referenceX: 240, referenceDistance: 600, from: 600 / slow, to: 600 / slow + (rows - 1) * .62 };
  } else if (pattern === 'jaws') {
    for (let row = 0; row < (t >= 3 ? 4 : 3); row++) add(row * .62, [12, 16, 18, 20, 22, 24][t], row % 2,
      { row, phase: (seedValue - .5) * .12, spread: [.85, .68, .5, .34][row], speed: [200, 225, 245, 265, 285, 305][t],
        style: 'crescent', palette: 'violet', motion: { kind: 'accelerate', acceleration: 18, maxSpeed: Math.min(fast, [270, 300, 330, 350, 375, 400][t]) } });
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

/** The Orrery's authored organs have different finite attack responsibilities. */
export function apexAttackPlan(pattern,tier=0,seedValue=.5) {
  const plan=barragePlan(pattern,tier,seedValue),t=PACE(tier);
  if(pattern==='rail') {
    for(const bundle of plan.bundles)bundle.port=1;
    plan.organs=[{port:1,name:'lower_siege_rail',role:'single-snapshot-rail-burst'}];
  }else if(pattern==='loom'||pattern==='petal') {
    for(const bundle of plan.bundles)bundle.port=bundle.family==='aim'?0:2;
    if(pattern==='petal') {
      const slow=plan.bundles[0].speed,fast=SNAPSHOT_SPEEDS[t];
      plan.prefillSeconds=prefillDelay(slow,fast);
      for(let row=0;row<(t?3:1);row++)plan.bundles.push({at:plan.prefillSeconds+row*.12,count:1,port:1,
        pattern:'rail',family:'aim',row,speed:fast,aimLock:'snapshot',lockLead:.3,style:'rail',palette:'scarlet'});
      plan.contactWindow={referenceDistance:600,from:600/slow,to:600/slow+1.36};
    }
    plan.organs=[{port:2,name:'upper_tracking',role:pattern==='loom'?'slow-spatial-grid':'curved-petal-field'},
      {port:pattern==='loom'?0:1,name:pattern==='loom'?'wrist_precision_beam':'lower_siege_rail',
        role:pattern==='loom'?'delayed-snapshot-beam':'single-snapshot-rail-burst'}];
  }
  plan.bundles.sort((a,b)=>a.at-b.at||a.port-b.port);
  plan.families=[...new Set(plan.bundles.map(bundle=>bundle.family))];
  plan.total=plan.bundles.reduce((sum,bundle)=>sum+bundle.count,0);
  plan.duration=plan.bundles.at(-1)?.at||0;
  return plan;
}

// Rotate only the launch direction of the existing curve. Its speed, signed
// turn and duration stay unchanged. The target is an authored fixed section,
// reconstructed from the actual firing port in the immutable sequence frame.
function fixedCurveDirection(speed, motion, source, target, roll) {
  const dx = target.x - source.x, dy = target.y - source.y, distance = Math.hypot(dx, dy);
  const straight = Math.atan2(dy, dx) - roll;
  const fallback = reason => ({ angle: straight, curveAligned: false, alignmentReason: reason });
  const rate = motion.turnRate, duration = motion.turnSeconds;
  if (![speed, rate, duration, source.x, source.y, target.x, target.y, roll].every(Number.isFinite)
    || speed <= 0 || duration < 0 || distance <= 0) return fallback('invalid-curve-target');
  if (Math.abs(rate * duration) >= Math.PI) return fallback('nonmonotone-turn');
  const canonical = { x: 0, y: 0, vx: speed, vy: 0 };
  const end = projectilePositionAt(canonical, duration, motion), radius = Math.hypot(end.x, end.y);
  let age;
  if (distance < radius) {
    // Radial distance increases through this finite (<pi) arc. Twenty-four
    // iterations bound the near-target error without an unbounded root search.
    let low = 0, high = duration;
    for (let step = 0; step < 24; step++) {
      const mid = (low + high) / 2, at = projectilePositionAt(canonical, mid, motion);
      if (Math.hypot(at.x, at.y) < distance) low = mid; else high = mid;
    }
    age = (low + high) / 2;
  } else {
    const ux = end.vx / speed, uy = end.vy / speed;
    const along = end.x * ux + end.y * uy, perpendicular = end.x * uy - end.y * ux;
    const discriminant = distance * distance - perpendicular * perpendicular;
    if (!Number.isFinite(discriminant) || discriminant < 0) return fallback('no-finite-curve-root');
    const after = -along + Math.sqrt(discriminant);
    if (!Number.isFinite(after) || after < -1e-9) return fallback('negative-curve-travel');
    age = duration + Math.max(0, after) / speed;
  }
  if (!Number.isFinite(age) || age >= 9) return fallback('beyond-projectile-lifetime');
  const displacement = projectilePositionAt(canonical, age, motion);
  const angle = straight - Math.atan2(displacement.y, displacement.x);
  if (!Number.isFinite(angle)) return fallback('nonfinite-launch-angle');
  return { angle, curveAligned: true, expectedFlightTime: age };
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
    if (bundle.crossBand) {
      const band = bundle.crossBand;
      const targetY = band.fromY + (count > 1 ? i / (count - 1) : .5) * (band.toY - band.fromY);
      const speed = pattern === 'petal' ? bundle.speed + i % (bundle.speedStepCount || bundle.perArm || 1) * 4 : bundle.speed;
      let direction = { targetX: band.x, targetY };
      if (pattern === 'petal' && metadata.motion.kind === 'curve') {
        let source = context.screenOrigin || { x: 960, y: 360 };
        if (context.origin && context.safeTarget) {
          const dx = context.origin.x - context.safeTarget.x, dy = context.origin.y - context.safeTarget.y;
          source = { x: referenceX + dx * Math.cos(roll) - dy * Math.sin(roll),
            y: safeLane + dx * Math.sin(roll) + dy * Math.cos(roll) };
        }
        direction = { ...fixedCurveDirection(speed, metadata.motion, source, { x: band.x, y: targetY }, roll),
          crossingX: band.x, crossingY: targetY };
      }
      points.push({ port: bundle.port || 0, ...direction, speed, ...metadata,
        ...(Number.isFinite(bundle.arming) ? { arming: bundle.arming } : {}) });
      continue;
    }
    if(pattern==='halo'&&bundle.forwardArc) {
      points.push({port:bundle.port||0,targetX:240,targetY:40+(count>1?i/(count-1):.5)*640,speed:bundle.speed,...metadata});
      continue;
    }
    if (pattern === 'halo' && bundle.forwardField) {
      const spacing = count > 1 ? 592 / (count - 1) : 0, targetY = 64 + (i + (bundle.phase || 0)) * spacing;
      let source = context.screenOrigin || { x: 960, y: 360 };
      if (context.origin && context.safeTarget) {
        const dx = context.origin.x - context.safeTarget.x, dy = context.origin.y - context.safeTarget.y;
        source = { x: referenceX + dx * Math.cos(roll) - dy * Math.sin(roll),
          y: safeLane + dx * Math.sin(roll) + dy * Math.cos(roll) };
      }
      const distance = Math.hypot(240 - source.x, targetY - source.y), cosine = distance ? Math.abs(240 - source.x) / distance : 1;
      points.push({ port: bundle.port || 0, targetX: 240, targetY,
        speed: Math.min(bundle.speedLimit, bundle.horizontalSpeed / Math.max(.01, cosine)), ...metadata });
      continue;
    }
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
      const speed = Math.min(bundle.speedLimit ?? MAX_BARRAGE_SPEED,
        Math.hypot((bundle.horizontalSpeed ?? bundle.speed) / Math.max(.01, cosine), lateral));
      points.push({ port: bundle.port || 0, targetX: 240, targetY, speed, ...metadata,
        motion: { ...metadata.motion, maxSpeed: speed } });
      continue;
    }
    else if (pattern === 'jaws') {
      const side = i % 2 ? -1 : 1, pair = Math.floor(i / 2), pairs = Math.ceil(count / 2);
      angle = Math.PI - roll + side * ((bundle.spread || .5) + pair / Math.max(1, pairs - 1) * .35) + (bundle.phase || 0);
    } else angle = Math.PI - roll + (count > 1 ? i / (count - 1) - .5 : 0) * 1.8 + (bundle.phase || 0) + Math.floor(i / 3) % 2 * .014;
    points.push({ port: bundle.port || 0, angle, speed: pattern === 'petal' ? bundle.speed + i % (bundle.speedStepCount || bundle.perArm || 1) * 4 : bundle.speed, ...metadata,
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
