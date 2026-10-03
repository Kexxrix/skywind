import test from 'node:test';
import assert from 'node:assert/strict';
import { barragePlan, fieldOnlyPlan, patternGeometry } from '../src/barrage.js';
import { normalEncounter, trialDifficulty } from '../src/level.js';
import { combatProfile } from '../src/combat-tuning.js';
import { projectilePositionAt } from '../src/projectile-motion.js';

test('Stage1 normal fields use dense finite plans without changing their original transit duration or boss plan', () => {
  const expected = { trident: 36, loom: 72, seed: 24, zipper: 48, petal: 48, B04: 48 };
  const difficulty = trialDifficulty(0);
  for (const [pattern, total] of Object.entries(expected)) for (const seed of [0, .5, 1]) {
    const boss = barragePlan(pattern, 0, seed), retained = structuredClone(boss);
    const field = fieldOnlyPlan(boss);
    assert.equal(field.total, total);
    assert.equal(field.duration, boss.bundles.filter(b => b.family !== 'aim').at(-1).at);
    assert.ok(field.total <= difficulty.maxSequenceBullets);
    assert.ok(field.bundles.every(b => b.count <= difficulty.maxPatternBullets));
    assert.ok(field.bundles.every(b => b.family !== 'aim'));
    for (const bundle of field.bundles) {
      const points = patternGeometry(bundle, { safeLane: 240, safeWidth: 80 });
      if (pattern === 'B04') {
        assert.ok(points.length > 0 && points.length <= bundle.count, 'the reserved wall still leaves its original row aperture');
        for (const point of points) assert.ok(Math.abs(point.targetY - point.windowY) >= 80 / 2 + 1.85 + 5.5);
      } else assert.equal(points.length, bundle.count);
      assert.ok(points.every(p => Number.isFinite(p.speed) && p.speed > 0 && p.speed <= difficulty.maxBulletSpeed));
    }
    assert.deepEqual(boss, retained, 'normal density never mutates the boss source');
    field.bundles[0].count = 0;
    assert.deepEqual(boss, retained, 'the transformed plan owns independent bundles');
  }
});

test('dense seed rows stay in the existing time and ray-angle range with their original arming and acceleration', () => {
  for (const seed of [0, .5, 1]) {
    const boss = barragePlan('seed', 0, seed), field = fieldOnlyPlan(boss);
    assert.equal(field.bundles.length, 4);
    const originalAngles = boss.bundles.flatMap(b => patternGeometry(b).map(p => p.angle));
    for (let row = 0; row < 4; row++) {
      const bundle = field.bundles[row];
      assert.equal(bundle.count, 6);
      assert.equal(bundle.port, row % 2);
      assert.ok(bundle.at >= 0 && bundle.at <= .82);
      assert.equal(bundle.arming, .65);
      assert.deepEqual(bundle.motion, boss.bundles[0].motion);
      for (const point of patternGeometry(bundle)) {
        assert.ok(point.angle >= Math.min(...originalAngles) - 1e-12);
        assert.ok(point.angle <= Math.max(...originalAngles) + 1e-12);
        assert.ok(Math.cos(point.angle) < 0, 'added rows keep their forward ray direction');
      }
    }
    assert.equal(field.bundles[0].at, 0);
    assert.equal(field.bundles.at(-1).at, .82);
  }
});

test('extra normal petal density preserves the three actual speed steps while later normal fields keep their old budgets', () => {
  const original = barragePlan('petal', 0), field = fieldOnlyPlan(original);
  assert.deepEqual([...new Set(patternGeometry(field.bundles[0]).map(p => p.speed))],
    [...new Set(patternGeometry(original.bundles[0]).map(p => p.speed))]);
  assert.equal(field.bundles[0].perArm, 6);
  assert.equal(field.bundles[0].speedStepCount, 3);
  for (let pace = 1; pace < 6; pace++) for (const pattern of ['trident', 'loom', 'seed', 'zipper', 'petal', 'B04']) {
    const boss = barragePlan(pattern, pace), normal = fieldOnlyPlan(boss);
    assert.equal(normal.total, boss.bundles.filter(b => b.family !== 'aim').reduce((n, b) => n + b.count, 0));
    assert.equal(normal.duration, boss.bundles.filter(b => b.family !== 'aim').at(-1).at);
    assert.ok(normal.bundles.every(b => b.speedStepCount === undefined));
  }
});

test('whole first groups stay inside the unchanged 180-shot cap and every normal group declares bounded independent repeats', () => {
  const totals = [];
  for (const time of [0, 8, 16, 24, 32]) {
    const encounter = normalEncounter(time, 0), sources = encounter.roles.filter(r => r.roleKey);
    const total = sources.reduce((sum, role) => {
      const combat = combatProfile(role.type, 0), original = barragePlan(role.pattern, 0);
      const plan = role.prefillMode === 'field-only' ? fieldOnlyPlan(original) : original;
      return sum + (role.pattern === 'rail' && combat.rail ? combat.rail.shotCount : plan.total);
    }, 0);
    assert.ok(total <= trialDifficulty(0).maxEnemyBullets);
    totals.push(total);
  }
  assert.deepEqual(totals, [111, 63, 123, 75, 99]);
  for (let pace = 0; pace < 6; pace++) for (let time = 0; time < 45; time++) {
    const e = normalEncounter(time, pace);
    if (e.phrase) {
      assert.equal(e.phrase.independentRepeats, true);
      assert.equal(e.phrase.maxCycles, 2);
      assert.equal(e.phrase.deadline, e.until);
    }
  }
  assert.equal(trialDifficulty(0).maxEnemyBullets, 180);
  assert.equal(trialDifficulty(0).maxPatternBullets, 24);
  assert.equal(trialDifficulty(0).maxSequenceBullets, 72);
  assert.equal(trialDifficulty(0).maxAttackers, 3);
});

test('only Stage1 forward fields redistribute direction while preserving every reserved shot and trajectory material', () => {
  for (const time of [0, 8, 24]) for (const role of normalEncounter(time).roles.filter(r => r.fieldShape)) {
    const raw = barragePlan(role.pattern, 0), old = fieldOnlyPlan(raw), next = fieldOnlyPlan(raw, { shape: role.fieldShape });
    assert.equal(next.total, old.total); assert.equal(next.duration, old.duration);
    for (const [index, bundle] of next.bundles.entries()) {
      const { crossBand, ...rest } = bundle;
      assert.deepEqual(rest, old.bundles[index]);
      const points = patternGeometry(bundle);
      assert.equal(points.length, bundle.count);
      assert.ok(points.every(p => (p.crossingX ?? p.targetX) === 240
        && (p.crossingY ?? p.targetY) >= crossBand.fromY && (p.crossingY ?? p.targetY) <= crossBand.toY));
      assert.deepEqual(points.map(p => p.speed), patternGeometry(old.bundles[index]).map(p => p.speed));
      for (const p of points) { assert.deepEqual(p.motion, bundle.motion || { kind: 'linear' }); assert.equal(p.arming, bundle.arming); }
    }
  }
  for (let pace = 1; pace < 6; pace++) for (let time = 0; time < 45; time++)
    assert.ok(normalEncounter(time, pace).roles.every(r => r.fieldShape?.kind !== 'forward-cross'));
});

test('fixed forward petal curvature crosses the player plane in both row directions without radial rear shots', () => {
  // Launch/trajectory boundary uses the production analytic motion, not a
  // natural input route or a human survival claim. Actual runtime-port evidence
  // is recorded separately in the frozen candidate probe.
  for (const sourceY of [140, 560]) {
    const shape = { kind: 'forward-cross', x: 240, fromY: sourceY < 360 ? 240 : 80, toY: sourceY < 360 ? 640 : 480 };
    const plan = fieldOnlyPlan(barragePlan('petal'), { shape });
    const landings = [];
    for (const bundle of plan.bundles) for (const point of patternGeometry(bundle, { screenOrigin: { x: 1100, y: sourceY } })) {
      const origin = { x: 1100, y: sourceY };
      const angle = point.angle;
      Object.assign(origin, { vx: Math.cos(angle) * point.speed, vy: Math.sin(angle) * point.speed });
      assert.ok(origin.vx < 0);
      let before = origin, landed;
      for (let age = 1 / 120; age < 9; age += 1 / 120) {
        const next = projectilePositionAt(origin, age, point.motion);
        assert.ok(Math.hypot(next.vx, next.vy) <= 158 + 1e-9);
        if (before.x >= 240 && next.x <= 240) {
          landed = before.y + (next.y - before.y) * (before.x - 240) / (before.x - next.x); break;
        }
        before = next;
      }
      assert.ok(Number.isFinite(landed), 'both original curve signs reach the fixed flight section before expiry');
      landings.push(landed);
    }
    assert.ok(landings.every(y => y >= shape.fromY - .001 && y <= shape.toY + .001), 'both original curve signs reach every fixed playable target');
    assert.ok(Math.max(...landings) - Math.min(...landings) >= 400 - .001, 'two opposing curves do not collapse into one narrow stripe');
  }
});
