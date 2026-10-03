import test from 'node:test';
import assert from 'node:assert/strict';
import { barragePlan, fieldOnlyPlan, patternGeometry } from '../src/barrage.js';
import { projectilePositionAt } from '../src/projectile-motion.js';
import { sequenceToWorld } from '../src/game.js';

function toFrame(point, frame) {
  return { x: 640 + (point.x - 640) * frame.cos - (point.y - 360) * frame.sin,
    y: 360 + (point.x - 640) * frame.sin + (point.y - 360) * frame.cos - frame.cameraY };
}

test('both actual-height petal ports and signed rolls align each unchanged curve to its authored fixed cross-section', () => {
  // Boundary geometry uses actual-world port coordinates and the production
  // sequence transform/motion. Natural moving-camera/culling is a separate run.
  for (const source of [{ x: 1064, y: 108 }, { x: 1050, y: 157 }, { x: 1043, y: 536 }, { x: 1070, y: 579 }])
    for (const roll of [-.12, 0, .12]) for (const seed of [0, .5, 1]) {
      const frame = { cos: Math.cos(roll), sin: Math.sin(roll), cameraY: 30 };
      const shape = { kind: 'forward-cross', x: 240,
        fromY: source.y < 360 ? 240 : 80, toY: source.y < 360 ? 640 : 480 };
      const raw = barragePlan('petal', 0, seed), retained = structuredClone(raw);
      const plan = fieldOnlyPlan(raw, { shape });
      for (const bundle of plan.bundles) {
        const origin = sequenceToWorld(frame, source), safeTarget = sequenceToWorld(frame, { x: 360, y: 360 });
        const points = patternGeometry(bundle, { roll, origin, safeTarget, referenceX: 360, safeLane: 360 });
        assert.equal(points.length, 24);
        for (const point of points) {
          assert.equal(point.curveAligned, true);
          assert.equal(point.targetY, undefined, 'the existing angle branch applies the fixed launch correction');
          assert.equal(point.port, bundle.port);
          assert.deepEqual(point.motion, bundle.motion);
          assert.ok([150, 154, 158].includes(point.speed));
          const launch = { ...origin, vx: Math.cos(point.angle) * point.speed, vy: Math.sin(point.angle) * point.speed };
          const landed = toFrame(projectilePositionAt(launch, point.expectedFlightTime, point.motion), frame);
          assert.ok(Math.abs(landed.x - point.crossingX) < .001);
          assert.ok(Math.abs(landed.y - point.crossingY) < .001);
          assert.ok(point.expectedFlightTime >= .9 && point.expectedFlightTime < 9);
          let previousX = source.x;
          for (let fraction = 1; fraction <= 24; fraction++) {
            const position = projectilePositionAt(launch, point.expectedFlightTime * fraction / 24, point.motion);
            const projected = toFrame(position, frame);
            assert.ok(projected.x < previousX, 'forward curved transit never reverses into a rear radial ray');
            previousX = projected.x;
            assert.ok(Math.abs(Math.hypot(position.vx, position.vy) - point.speed) < 1e-7);
          }
        }
      }
      assert.deepEqual(raw, retained, 'normal alignment never mutates the boss plan');
    }
});

test('finite near-target search preserves signed curvature without a player query or speed change', () => {
  for (const distance of [20, 80, 200, 300]) for (const sign of [-1, 1]) {
    const bundle = { pattern: 'petal', port: 1, count: 1, speed: 154,
      crossBand: { x: 240, fromY: 360, toY: 360 },
      motion: { kind: 'curve', turnRate: sign * .19, turnSeconds: 1.75 } };
    const origin = { x: 240 + distance, y: 360 };
    const point = patternGeometry(bundle, { screenOrigin: origin })[0];
    assert.equal(point.curveAligned, true); assert.equal(point.speed, 154);
    const end = projectilePositionAt({ ...origin, vx: Math.cos(point.angle) * point.speed,
      vy: Math.sin(point.angle) * point.speed }, point.expectedFlightTime, point.motion);
    assert.ok(Math.abs(end.x - 240) < .001 && Math.abs(end.y - 360) < .001);
    assert.deepEqual(point.motion, bundle.motion);
  }
});

test('unavailable curve solutions keep the previous straight-to-section angle and explicitly mark the uncorrected case', () => {
  const base = { pattern: 'petal', count: 1, port: 0, speed: 150,
    crossBand: { x: 240, fromY: 360, toY: 360 },
    motion: { kind: 'curve', turnRate: .19, turnSeconds: 1.75 } };
  for (const { origin, bundle, reason } of [
    { origin: { x: 240, y: 360 }, bundle: base, reason: 'invalid-curve-target' },
    { origin: { x: 2200, y: 360 }, bundle: base, reason: 'beyond-projectile-lifetime' },
    { origin: { x: 1100, y: 360 }, bundle: { ...base, motion: { kind: 'curve', turnRate: 5, turnSeconds: 1.75 } }, reason: 'nonmonotone-turn' },
    { origin: { x: 1100, y: 360 }, bundle: { ...base, motion: { kind: 'curve', turnRate: NaN, turnSeconds: 1.75 } }, reason: 'invalid-curve-target' },
  ]) {
    const point = patternGeometry(bundle, { screenOrigin: origin })[0];
    assert.equal(point.curveAligned, false); assert.equal(point.alignmentReason, reason);
    assert.equal(point.angle, Math.atan2(360 - origin.y, 240 - origin.x));
    assert.equal(point.speed, 150); assert.deepEqual(point.motion, bundle.motion);
  }
});
