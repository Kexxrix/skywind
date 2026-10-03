import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { barragePlan, patternGeometry, SNAPSHOT_SPEEDS, MAX_BARRAGE_SPEED } from '../src/barrage.js';
import { trialDifficulty } from '../src/level.js';
import { projectilePositionAt } from '../src/projectile-motion.js';
import * as engine from '../src/game.js';
import * as art from '../src/mecha-art.js';

const origin = { x: 960, y: 360 };
function shotFrom(point) {
  const angle = Number.isFinite(point.targetY) ? Math.atan2(point.targetY - origin.y, point.targetX - origin.x) : point.angle;
  return { ...origin, vx: Math.cos(angle) * point.speed, vy: Math.sin(angle) * point.speed, motion: point.motion };
}
function crossingTime(shot, x) {
  let low = 0, high = 8;
  assert.ok(projectilePositionAt(shot, high, shot.motion).x < x, 'the sampled advancing projectile really reaches the player plane');
  for (let n = 0; n < 45; n++) {
    const middle = (low + high) / 2;
    if (projectilePositionAt(shot, middle, shot.motion).x > x) low = middle; else high = middle;
  }
  return (low + high) / 2;
}

test('Stage1 grids and advancing rows cross the actual flight plane sooner while slower radial shapes and locked rails remain distinct', () => {
  const grid = patternGeometry(barragePlan('loom', 0).bundles[0], { screenOrigin: origin });
  const arrivals = grid.map(point => crossingTime(shotFrom(point), 240));
  assert.ok(arrivals.every(time => time > 3 && time < 3.7), 'old horizontal120 cells took six seconds from this source');
  assert.ok(Math.max(...arrivals) - Math.min(...arrivals) < .1, 'the raised speed must retain the common grid arrival plane');
  for (const point of grid) {
    const shot = shotFrom(point), pose = projectilePositionAt(shot, 2, shot.motion);
    assert.ok(Math.abs(pose.vx) > 200, 'visible horizontal progress, not only a fast label');
    assert.ok(Math.hypot(pose.vx, pose.vy) < SNAPSHOT_SPEEDS[0]);
  }
  for (const pattern of ['B04', 'B05']) {
    const plan = barragePlan(pattern, 0), points = patternGeometry(plan.bundles[0]);
    assert.ok(points.map(point => crossingTime(shotFrom(point), 240)).every(time => time < 4));
    assert.ok(points.every(point => point.windowY === 360), 'the actual fixed aperture remains open');
  }
  const slow = barragePlan('halo', 0).bundles[0].speed;
  assert.ok(slow >= 145 && slow <= 160);
  assert.ok(SNAPSHOT_SPEEDS[0] >= slow * 2 && SNAPSHOT_SPEEDS[0] <= 340);
  assert.equal(MAX_BARRAGE_SPEED, 520);
});

test('all stages shorten advancing grid and wall occupancy with actual horizontal motion while leaving room for faster locked shots', () => {
  const previousGridAdvance = [120, 120, 120, 120, 120, 120];
  let previousArrival = Infinity;
  for (let pace = 0; pace < 6; pace++) {
    const grid = barragePlan('loom', pace), points = patternGeometry(grid.bundles[0], { screenOrigin: origin });
    const arrivals = points.map(point => crossingTime(shotFrom(point), 240));
    const latestArrival = Math.max(...arrivals);
    assert.ok(latestArrival < 720 / previousGridAdvance[pace] * .65, 'forward occupancy must fall by at least a third from the old six-second cells');
    assert.ok(latestArrival < previousArrival, 'later grids advance sooner rather than only adding cells');
    assert.ok(latestArrival - Math.min(...arrivals) < .1, 'the common actual arrival plane remains aligned');
    previousArrival = latestArrival;
    for (const point of points) {
      const shot = shotFrom(point), pose = projectilePositionAt(shot, 2, shot.motion);
      assert.ok(Math.abs(pose.vx) > 200, 'measured horizontal progress must exceed the old120 cell layer even during its preserved lateral wave');
      assert.ok(Math.hypot(pose.vx, pose.vy) < SNAPSHOT_SPEEDS[pace]);
    }
    for (const pattern of ['B04', 'B05']) {
      const plan = barragePlan(pattern, pace);
      assert.ok(patternGeometry(plan.bundles[0]).every(point => crossingTime(shotFrom(point), 240) < 4));
    }
    assert.ok(SNAPSHOT_SPEEDS[pace] - grid.bundles[0].speed >= 100, 'fixed direct shots retain a separate faster role');
    assert.ok(trialDifficulty(pace).maxBulletSpeed <= 520);
  }
});

function actualWave(normalTime) {
  art.registerMechaManifest(JSON.parse(readFileSync(new URL('../' + art.MECHA_MANIFEST_PATH.replace(/^\.\//, ''), import.meta.url), 'utf8')));
  const game = engine.createGame(310031);
  game.mode = 'playing'; game.normalTime = normalTime;
  game.nextBossAt = game.nextPickupAt = Infinity;
  Object.assign(game.player, engine.screenToWorld(game, { x: 180, y: 360 }), { invincible: 0 });
  const events = [];
  for (let n = 0; n < 5.5 * 120 && game.mode === 'playing'; n++) {
    engine.updateGame(game, 1 / 120, {});
    if (!n) game.nextWaveAt = Infinity;
    events.push(...engine.consumeEvents(game));
  }
  return { game, events };
}

test('actual Stage1 authored trident and rail release different numeric velocities without weakening the flight guard or fixed lock', () => {
  // Start the actual opening, which owns both roles. The new eight-second
  // blocks make6 a late deadline fixture and22 a zipper block, not this pair.
  const field = actualWave(0), sniper = field;
  const fieldShots = field.events.filter(event => event.type === 'enemyShot' && event.pattern === 'trident').flatMap(event => event.shots);
  const rails = sniper.events.filter(event => event.type === 'enemyShot' && event.pattern === 'rail').flatMap(event => event.shots.map(shot => ({ ...shot, sourceId: event.enemyId })));
  assert.ok(fieldShots.length >= 6 && rails.length >= 3, 'both visible authored sources must actually fire');
  // The approved cross-band shape uses diagonal forward shots, so compare
  // actual vector speed rather than the previous narrow fan's x component.
  assert.ok(fieldShots.every(shot => Math.hypot(shot.vx, shot.vy) >= 205 && Math.hypot(shot.vx, shot.vy) < 320 && shot.vx < 0));
  assert.ok(rails.every(shot => Math.abs(Math.hypot(shot.vx, shot.vy) - 320) < 1e-7), 'the runtime cap must not reduce the rail to160');
  for (const shot of rails) {
    assert.ok(shot.launchedAt - shot.lockAt >= .25 - 1 / 120);
    const distance = Math.hypot(shot.lockedTarget.x - shot.x, shot.lockedTarget.y - shot.y) - shot.radius - 1.85;
    assert.ok(distance / Math.hypot(shot.vx, shot.vy) >= .9, 'the existing Stage1 post-release minimum remains required');
  }
  const sourceId = rails[0].sourceId;
  const firstBurst = rails.filter(shot => shot.sourceId === sourceId && shot.lockAt === rails[0].lockAt);
  for (const shot of firstBurst) assert.deepEqual(shot.lockedTarget, rails[0].lockedTarget);
  assert.equal(trialDifficulty(0).minTelegraph, .75);
  assert.equal(trialDifficulty(0).minimumFlightTime, .9);
});
