import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as engine from '../src/game.js';
import * as art from '../src/mecha-art.js';
import { patternGeometry } from '../src/barrage.js';
import { projectilePositionAt } from '../src/projectile-motion.js';

const DT = 1 / 120;
function firstPetal() {
  art.registerMechaManifest(JSON.parse(readFileSync(new URL('../' + art.MECHA_MANIFEST_PATH.replace(/^\.\//, ''), import.meta.url), 'utf8')));
  const game = engine.createGame(620261003);
  game.mode = 'playing'; game.normalTime = 24;
  game.nextWaveAt = 0; game.nextBossAt = game.nextPickupAt = Infinity;
  Object.assign(game.player, engine.screenToWorld(game, { x: 225, y: 360 }), { invincible: 0 });
  for (let frame = 0; frame < 3 / DT; frame++) {
    engine.updateGame(game, DT, { shoot: false });
    if (frame === 0) game.nextWaveAt = Infinity;
    const event = engine.consumeEvents(game).find(e => e.type === 'enemyShot' && e.pattern === 'petal' && e.bulletCount);
    if (event) return { game, event, source: game.enemies.find(e => e.id === event.enemyId) };
  }
  assert.fail('real upper source must emit its first unchanged petal bundle');
}

test('real petal release computes the fixed section from the selected actual fire-pose port and frozen sequence epoch', () => {
  const { game, event, source } = firstPetal(), sequence = source.sequence;
  assert.ok(sequence && Number.isFinite(sequence.roll));
  const origin = event.launchPorts.find(p => p.index === 0);
  assert.ok(origin && event.bulletCount === 24);
  const bundle = sequence.bundles[0], safeTarget = engine.sequenceToWorld(sequence, { x: 360, y: source.safeLane });
  const points = patternGeometry(bundle, { roll: sequence.roll, origin, safeTarget,
    referenceX: 360, safeLane: source.safeLane, portCount: source.muzzles.length });
  assert.equal(points.length, event.shots.length);
  for (const [index, point] of points.entries()) {
    const shot = event.shots[index];
    assert.equal(point.curveAligned, true);
    assert.equal(shot.x, origin.x); assert.equal(shot.y, origin.y);
    assert.ok(Math.abs(Math.cos(point.angle) * point.speed - shot.vx) < 1e-8);
    assert.ok(Math.abs(Math.sin(point.angle) * point.speed - shot.vy) < 1e-8);
    const landed = projectilePositionAt({ x: shot.x, y: shot.y, vx: shot.vx, vy: shot.vy }, point.expectedFlightTime, point.motion);
    const goal = engine.sequenceToWorld(sequence, { x: point.crossingX, y: point.crossingY });
    assert.ok(Math.hypot(landed.x - goal.x, landed.y - goal.y) < .001);
    assert.ok(point.expectedFlightTime >= .9 && point.expectedFlightTime < 9);
    assert.deepEqual(point.motion, bundle.motion);
    assert.equal(shot.armedAfter, bundle.arming || 0);
  }
  assert.equal(game.player.radius, 1.85); assert.equal(game.difficulty.minimumFlightTime, .9);
});

test('opposite ordinary vertical inputs and changing cameras cannot retarget or reverse an already launched petal', () => {
  const { game, event } = firstPetal();
  const upper = structuredClone(game), lower = structuredClone(game);
  const original = new Map(event.bulletIds.map(id => [id, structuredClone(game.enemyBullets.find(b => b.id === id))]));
  const launchFrame = { ...game.enemies.find(e => e.id === event.enemyId).sequence };
  for (let step = 0; step < 2.5 / DT; step++) {
    engine.updateGame(upper, DT, { y: -1, shoot: false });
    engine.updateGame(lower, DT, { y: 1, shoot: false });
    for (const [id, before] of original) {
      const a = upper.enemyBullets.find(b => b.id === id), b = lower.enemyBullets.find(b => b.id === id);
      assert.ok(a && b, 'this controlled pre-contact interval keeps the observed original bundle alive');
      assert.deepEqual(a.motionOrigin, before.motionOrigin); assert.deepEqual(b.motionOrigin, before.motionOrigin);
      assert.deepEqual(a.motion, before.motion); assert.deepEqual(b.motion, before.motion);
      for (const key of ['x', 'y', 'vx', 'vy', 'age']) assert.ok(Math.abs(a[key] - b[key]) < 1e-10);
      const relativeVx = a.vx * launchFrame.cos - a.vy * launchFrame.sin;
      assert.ok(relativeVx < 0, 'existing signed curvature remains a forward launch in its authored frame');
      assert.equal(a.aimedAt, undefined); assert.equal(b.aimedAt, undefined);
    }
  }
  assert.ok(Math.abs(upper.cameraY - lower.cameraY) > 1);
  assert.ok(Math.abs(engine.cameraRoll(upper) - engine.cameraRoll(lower)) > .001);
  assert.equal(upper.player.radius, 1.85); assert.equal(lower.player.radius, 1.85);
});
