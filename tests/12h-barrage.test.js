import test from 'node:test';
import assert from 'node:assert/strict';
import { barragePlan, patternGeometry, prefillDelay, fitPrefillPlan, fieldOnlyPlan, SNAPSHOT_SPEEDS, MAX_BARRAGE_SPEED, relativeMinimumDistance } from '../src/barrage.js';
import { trialDifficulty } from '../src/level.js';
import { projectilePositionAt } from '../src/projectile-motion.js';

const patterns = ['B01', 'B02', 'B03', 'B04', 'B05', 'cathedral', 'halo', 'petal', 'zipper', 'loom', 'jaws', 'trident', 'seed', 'snapshot', 'rail', 'deploy', 'lunge'];

test('all authored families reserve complete deterministic sequences within pace budgets', () => {
  for (let pace = 0; pace < 6; pace++) for (const pattern of patterns) {
    const d = trialDifficulty(pace), plan = barragePlan(pattern, pace, .73);
    assert.deepEqual(plan, barragePlan(pattern, pace, .73));
    assert.equal(plan.total, plan.bundles.reduce((sum, row) => sum + row.count, 0));
    assert.ok(plan.total <= d.maxSequenceBullets, `${pace} ${pattern} ${plan.total}`);
    assert.ok(plan.bundles.every(row => row.count <= d.maxPatternBullets));
    assert.ok(plan.duration < 5);
    assert.ok(plan.bundles.every((row, i) => !i || row.at >= plan.bundles[i - 1].at));
    for (const bundle of plan.bundles) {
      assert.ok(bundle.pattern && bundle.family);
      assert.ok(bundle.speed <= d.maxBulletSpeed);
      assert.ok((bundle.motion?.maxSpeed ?? 0) <= d.maxBulletSpeed);
      for (const point of patternGeometry(bundle, { portCount: 3 })) {
        assert.ok(Number.isFinite(point.angle) || Number.isFinite(point.targetY));
        assert.ok(point.speed > 0 && point.speed <= d.maxBulletSpeed, `${pattern} ${point.speed} > ${d.maxBulletSpeed}`);
        assert.ok(['bead', 'seed', 'needle', 'rail', 'petal', 'crescent'].includes(point.style));
        assert.ok(['magenta', 'scarlet', 'violet', 'acid'].includes(point.palette));
        assert.ok(['linear', 'curve', 'wave', 'accelerate'].includes(point.motion.kind));
      }
    }
  }
  assert.equal(Math.max(...SNAPSHOT_SPEEDS), MAX_BARRAGE_SPEED);
  assert.equal(barragePlan('deploy', 2).total, 0);
  assert.equal(barragePlan('lunge', 2).total, 0);
});

test('radial and fan geometry no longer delete bullets in a player-relative safe lane', () => {
  for (const pattern of ['B01', 'B03', 'halo', 'petal', 'trident']) {
    for (const bundle of barragePlan(pattern, 2, .2).bundles.filter(bundle => bundle.family !== 'aim')) {
      const first = patternGeometry(bundle, { safeLane: 180, safeTarget: { x: 360, y: 180 }, origin: { x: 980, y: 360 } });
      const second = patternGeometry(bundle, { safeLane: 540, safeTarget: { x: 220, y: 540 }, origin: { x: 980, y: 360 } });
      assert.equal(first.length, bundle.count);
      assert.deepEqual(first, second, pattern);
    }
  }
});

test('slow prefill and faster snapshot arrivals overlap at the authored contact section', () => {
  for (const pattern of ['halo', 'loom']) for (let pace = 1; pace < 6; pace++) {
    const plan = barragePlan(pattern, pace), slow = plan.bundles.find(bundle => bundle.family !== 'aim');
    const shots = plan.bundles.filter(bundle => bundle.family === 'aim');
    assert.ok(shots.length === 3 && shots[0].at > 2);
    assert.ok(plan.families.includes('aim') && plan.families.length === 2);
    assert.ok(plan.prefillSeconds > 0);
    for (const shot of shots) {
      const arrival = shot.at + plan.contactWindow.referenceDistance / shot.speed;
      assert.ok(arrival >= plan.contactWindow.from - 1e-9 && arrival <= plan.contactWindow.to + 1e-9);
      assert.equal(shot.aimLock, 'snapshot');
      assert.ok(shot.lockLead >= .25 && shot.lockLead <= .45);
      assert.ok(shot.speed > slow.speed * 2);
    }
  }
  assert.equal(prefillDelay(125, 430), 600 / 125 - 600 / 430);
  assert.equal(prefillDelay(0, 430), 0);
  assert.equal(prefillDelay(125, 100), 0);
});

test('petal arms separate beads by speed and curved trajectories rather than duplicate positions', () => {
  const bundle = barragePlan('petal', 4, .3).bundles[0];
  const points = patternGeometry(bundle);
  assert.equal(bundle.perArm, 7);
  assert.equal(new Set(points.slice(0, 7).map(point => point.speed)).size, 7);
  const positions = points.map(point => projectilePositionAt({ x: 980, y: 360, vx: Math.cos(point.angle) * point.speed, vy: Math.sin(point.angle) * point.speed }, 2, point.motion));
  for (let i = 0; i < positions.length; i++) for (let j = i + 1; j < positions.length; j++) assert.ok(Math.hypot(positions[i].x - positions[j].x, positions[i].y - positions[j].y) > 8);
  assert.ok(points.every(point => point.motion.kind === 'curve' && point.motion.turnSeconds > 0));
});

function shotFrom(point, origin, at = 0) {
  const angle = Number.isFinite(point.targetY) ? Math.atan2(point.targetY - origin.y, point.targetX - origin.x) : point.angle;
  return { ...origin, vx: Math.cos(angle) * point.speed, vy: Math.sin(angle) * point.speed, motion: point.motion, at, radius: 5.5 };
}
function atX(shot, x) {
  let low = 0, high = 10;
  for (let i = 0; i < 50; i++) {
    const middle = (low + high) / 2;
    if (projectilePositionAt(shot, middle, shot.motion).x > x) low = middle; else high = middle;
  }
  return projectilePositionAt(shot, (low + high) / 2, shot.motion);
}

test('counterflow braid paths actually exchange altitude before the player section', () => {
  const plan = barragePlan('zipper', 2, .4);
  const first = patternGeometry(plan.bundles[0])[1], second = patternGeometry(plan.bundles[1])[1];
  const top = shotFrom(first, { x: 960, y: 300 }), bottom = shotFrom(second, { x: 960, y: 420 }, .17);
  assert.ok(atX(top, 700).y < atX(bottom, 700).y);
  assert.ok(atX(top, 400).y > atX(bottom, 400).y);
  assert.ok(plan.bundles[1].at > plan.bundles[0].at, 'counterflow ports have a visible authored stagger');
});

test('visible row apertures move while allowing separate aimed pressure', () => {
  for (const pattern of ['B04', 'B05']) {
    const plan = barragePlan(pattern, 3);
    assert.equal(plan.routeWindow, true);
    assert.equal(plan.movementWindow, false);
    const centers = plan.bundles.map(bundle => patternGeometry(bundle, { safeLane: 220, corridorWidth: 40, portCount: 2 })[0].windowY);
    assert.ok(new Set(centers).size > 1);
    for (const bundle of plan.bundles) for (const point of patternGeometry(bundle, { safeLane: 220, corridorWidth: 40, portCount: 2 })) assert.ok(Math.abs(point.targetY - point.windowY) >= 27.35);
  }
});

// This is a bounded mathematical path check at fixed sources and snapshot targets, not human difficulty approval.
test('a swept normal-speed path remains in a controlled Stage3 prefill plus counterflow combination', () => {
  const shots = [], pace = 2;
  for (const [pattern, offset] of [['halo', 0], ['zipper', 1]]) {
    const plan = barragePlan(pattern, pace, .25);
    for (const bundle of plan.bundles) {
      const origins = [{ x: 960, y: pattern === 'zipper' ? 300 : 360 }, { x: 960, y: pattern === 'zipper' ? 420 : 360 }];
      if (bundle.family === 'aim') {
        shots.push(shotFrom({ angle: Math.PI, speed: bundle.speed, motion: { kind: 'linear' } }, { x: 960, y: 360 }, offset + bundle.at));
      } else for (const point of patternGeometry(bundle)) shots.push(shotFrom(point, origins[point.port % origins.length], offset + bundle.at));
    }
  }
  assert.ok(shots.length <= trialDifficulty(pace).maxEnemyBullets);
  const step = 1 / 60, x = 360, lanes = Array.from({ length: 83 }, (_, i) => 114 + i * 6);
  let reachable = new Set([lanes.indexOf(360)]);
  for (let t = 0; t < 7; t += step) {
    const next = new Set();
    for (const index of reachable) for (const delta of [-1, 0, 1]) {
      const targetIndex = index + delta;
      if (targetIndex < 0 || targetIndex >= lanes.length) continue;
      const y0 = lanes[index], y1 = lanes[targetIndex];
      assert.ok(Math.abs(y1 - y0) / step <= 490);
      let safe = true;
      for (const shot of shots) {
        if (t + step < shot.at) continue;
        const activeFrom = Math.max(0, (shot.at - t) / step);
        const before = projectilePositionAt(shot, Math.max(0, t - shot.at), shot.motion);
        const after = projectilePositionAt(shot, t + step - shot.at, shot.motion);
        const activeY0 = y0 + (y1 - y0) * activeFrom;
        if (relativeMinimumDistance({ x: before.x - x, y: before.y - activeY0 }, { x: after.x - x, y: after.y - y1 }) <= shot.radius + 1.85) { safe = false; break; }
      }
      if (safe) next.add(targetIndex);
    }
    reachable = next;
    assert.ok(reachable.size, `no continuous six-pixel path at ${t.toFixed(3)}s`);
  }
  assert.ok([...reachable].some(index => lanes[index] >= 200 && lanes[index] <= 500));
});


test('cathedral opens with four real tower ports and a delayed locked center lance', () => {
  const plan = barragePlan('cathedral', 2, .4);
  assert.deepEqual(plan.bundles.filter(bundle => bundle.pattern === 'cathedral').map(bundle => bundle.port), [0, 1, 2, 3]);
  assert.ok(plan.bundles.filter(bundle => bundle.pattern === 'snapshot').every(bundle => bundle.port === 4));
  assert.ok(plan.bundles.at(-1).at > 3);
  for (const bundle of plan.bundles.filter(bundle => bundle.pattern === 'cathedral')) {
    assert.ok(patternGeometry(bundle).every(point => point.port === bundle.port));
  }
});


test('prefill fitting aligns arrivals at 420, 600 and 760 without changing reservations or burst cadence', () => {
  for (const pattern of ['cathedral', 'halo', 'loom']) for (let pace = 1; pace < 6; pace++) {
    const original = barragePlan(pattern, pace, .4), retained = structuredClone(original);
    const originalAim = original.bundles.filter(bundle => bundle.family === 'aim');
    for (const distance of [420, 600, 760]) {
      const fitted = fitPrefillPlan(original, distance);
      assert.equal(fitted.total, original.total);
      assert.deepEqual(fitted.bundles.map(bundle => bundle.count).sort((a, b) => a - b), original.bundles.map(bundle => bundle.count).sort((a, b) => a - b));
      assert.deepEqual(fitted.bundles.filter(bundle => bundle.family !== 'aim'), original.bundles.filter(bundle => bundle.family !== 'aim'));
      const shots = fitted.bundles.filter(bundle => bundle.family === 'aim');
      for (let i = 0; i < shots.length; i++) {
        const arrival = shots[i].at + distance / shots[i].speed;
        assert.ok(arrival >= fitted.contactWindow.from - 1e-9 && arrival <= fitted.contactWindow.to + 1e-9);
        assert.ok(Math.abs((shots[i].at - shots[0].at) - (originalAim[i].at - originalAim[0].at)) < 1e-9);
        assert.ok(shots[i].at >= 0);
      }
      if (distance === 600) assert.deepEqual(fitted.bundles, original.bundles);
    }
    assert.deepEqual(original, retained, 'fitting must leave the authored plan untouched');
  }
  const noPrefill = barragePlan('petal', 2);
  assert.deepEqual(fitPrefillPlan(noPrefill, 420), noPrefill);
  assert.deepEqual(fitPrefillPlan(barragePlan('halo', 2), NaN), barragePlan('halo', 2));
});


// A flight-plane alignment check, not a claim about rendered readability or human difficulty.
test('loom cells reach their fixed plane together under actual source and frozen camera transforms', () => {
  for (let pace = 0; pace < 6; pace++) for (const roll of [-.27, -.09]) {
    const plan = barragePlan('loom', pace), bundle = plan.bundles[0];
    const source = { x: 1100, y: 170 }, cameraY = 78, c = Math.cos(roll), sin = Math.sin(roll);
    const world = point => ({ x: 640 + (point.x - 640) * c + (point.y + cameraY - 360) * sin,
      y: 360 - (point.x - 640) * sin + (point.y + cameraY - 360) * c });
    const points = patternGeometry(bundle, { origin: world(source), safeTarget: world({ x: 360, y: 440 }),
      referenceX: 360, safeLane: 440, roll });
    const authored = structuredClone(bundle), times = [];
    assert.equal(points.length, bundle.count);
    for (const point of points) {
      assert.equal(point.targetX, 240);
      assert.ok(point.speed < 200 && point.speed <= trialDifficulty(pace).maxBulletSpeed);
      assert.equal(point.motion.maxSpeed, point.speed);
      const shot = shotFrom(point, source);
      let low = 0, high = 9;
      for (let i = 0; i < 50; i++) {
        const middle = (low + high) / 2;
        if (projectilePositionAt(shot, middle, shot.motion).x > 240) low = middle; else high = middle;
      }
      const at = (low + high) / 2; times.push(at);
      assert.ok(Math.abs(at - (source.x - 240) / bundle.horizontalSpeed) < .08);
      for (const age of [0, 2, at]) {
        const pose = projectilePositionAt(shot, age, shot.motion);
        assert.ok(Math.hypot(pose.vx, pose.vy) <= point.motion.maxSpeed + 1e-9);
      }
    }
    assert.ok(Math.max(...times) - Math.min(...times) < .15, 'wave lateral offsets may shift arrival slightly, without diagonal-cell drift');
    assert.deepEqual(bundle, authored);
    assert.equal(plan.contactWindow.referenceX, 240);
  }
});

test('near extreme loom ports retain the slow cap even when perfect plane alignment is impossible', () => {
  const bundle = barragePlan('loom', 5).bundles[0];
  const points = patternGeometry(bundle, { screenOrigin: { x: 550, y: 90 } });
  assert.equal(points.length, bundle.count);
  assert.ok(points.some(point => point.speed === 199), 'long diagonal cells reach the authored slow cap');
  assert.ok(points.every(point => point.speed <= 199 && point.motion.maxSpeed <= 199));
  const arrivals = points.map(point => {
    const shot = shotFrom(point, { x: 550, y: 90 });
    let low = 0, high = 9;
    for (let i = 0; i < 50; i++) {
      const middle = (low + high) / 2;
      if (projectilePositionAt(shot, middle, shot.motion).x > 240) low = middle; else high = middle;
    }
    return (low + high) / 2;
  });
  assert.ok(Math.max(...arrivals) - Math.min(...arrivals) > .5, 'clamped ports explicitly do not inherit the normal distant-port arrival guarantee');
});

test('seed and loom share space-control accounting while keeping arming and grid behavior distinct', () => {
  const seed = barragePlan('seed', 2), loom = barragePlan('loom', 2);
  assert.equal(seed.family, 'loom'); assert.equal(loom.family, 'loom');
  assert.equal(seed.routeWindow, false); assert.equal(loom.routeWindow, false);
  const armed = patternGeometry(seed.bundles[0]), grid = patternGeometry(loom.bundles[0]);
  assert.ok(armed.every(point => point.arming === .65 && point.motion.kind === 'accelerate' && Number.isFinite(point.angle)));
  assert.ok(grid.every(point => point.motion.kind === 'wave' && point.targetX === 240));
  assert.deepEqual(patternGeometry(loom.bundles[0], { screenOrigin: { x: 1100, y: 170 }, safeLane: 180 }),
    patternGeometry(loom.bundles[0], { screenOrigin: { x: 1100, y: 170 }, safeLane: 540 }), 'no player-relative lane carve is restored');
});


test('a field-only normal plan removes its late sniper dependency without changing the field shape', () => {
  for (let pace = 1; pace < 6; pace++) for (const pattern of ['halo', 'loom', 'petal', 'seed', 'zipper']) {
    const original = barragePlan(pattern, pace, .37), retained = structuredClone(original);
    const field = fieldOnlyPlan(original), difficulty = trialDifficulty(pace);
    assert.ok(!field.families.includes('aim'));
    assert.deepEqual(field.bundles, original.bundles.filter(bundle => bundle.family !== 'aim'));
    assert.ok(field.total <= original.total && field.total <= difficulty.maxSequenceBullets);
    assert.ok(field.bundles.every(bundle => bundle.count <= difficulty.maxPatternBullets));
    assert.equal(field.duration, field.bundles.at(-1)?.at || 0);
    assert.equal(field.prefillSeconds, 0);
    const aimCount = original.bundles.filter(bundle => bundle.family === 'aim').reduce((sum, bundle) => sum + bundle.count, 0);
    assert.equal(original.total - field.total, aimCount);
    if (field.bundles[0]?.motion) field.bundles[0].motion.kind = 'changed';
    if (field.contactWindow) field.contactWindow.referenceX = -1;
    field.families.push('changed');
    assert.deepEqual(original, retained, 'normal filtering cannot alter the full boss or future source signature');
    assert.deepEqual(barragePlan(pattern, pace, .37), retained);
  }
  assert.equal(fieldOnlyPlan(barragePlan('halo', 2)).total, 64);
  assert.equal(fieldOnlyPlan(barragePlan('loom', 2)).total, 54);
  for (const pattern of ['deploy', 'lunge']) assert.deepEqual(fieldOnlyPlan(barragePlan(pattern, 2)), barragePlan(pattern, 2));
});

test('field-only contact fitting updates real slow travel without adding hidden aimed releases', () => {
  for (const pattern of ['halo', 'loom']) for (const distance of [0, 420, 600, 760]) {
    const field = fieldOnlyPlan(barragePlan(pattern, 2)), retained = structuredClone(field);
    const fitted = fitPrefillPlan(field, distance), slow = field.bundles[0];
    assert.ok(Math.abs(fitted.contactWindow.from - distance / slow.speed) < 1e-9);
    assert.ok(Math.abs(fitted.contactWindow.to - fitted.contactWindow.from
      - (field.contactWindow.to - field.contactWindow.from)) < 1e-9);
    assert.equal(fitted.contactWindow.referenceDistance, distance);
    assert.deepEqual(fitted.bundles, field.bundles);
    assert.equal(fitted.total, field.total);
    assert.equal(fitted.duration, field.duration);
    assert.ok(!fitted.families.includes('aim'));
    fitted.bundles[0].count = 0;
    assert.deepEqual(field, retained);
  }
  const fullBoss = barragePlan('loom', 4);
  assert.equal(fullBoss.bundles.filter(bundle => bundle.family === 'aim').length, 3);
  assert.deepEqual(fullBoss.families, ['loom', 'aim']);
});
