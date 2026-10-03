import test from 'node:test';
import assert from 'node:assert/strict';
import { normalEncounter, trialDifficulty, LEVEL_RULES, attackPolicy } from '../src/level.js';
import { barragePlan, fieldOnlyPlan, MAX_BARRAGE_SPEED } from '../src/barrage.js';

test('the first normal wave has two independent field families and a locked source within declared early budgets', () => {
  const encounter = normalEncounter(0, 0), difficulty = trialDifficulty(0);
  const sources = encounter.roles.filter(role => role.roleKey);
  assert.deepEqual(sources.map(role => role.pattern), ['trident', 'loom', 'rail']);
  assert.equal(sources.length, 3);
  assert.ok(sources.length <= difficulty.maxAttackers);
  assert.ok(encounter.roles.reduce((sum, role) => sum + role.count, 0) <= difficulty.waveSize);
  const plans = sources.map(role => role.prefillMode === 'field-only'
    ? fieldOnlyPlan(barragePlan(role.pattern, 0)) : barragePlan(role.pattern, 0));
  assert.equal(new Set(plans.filter(plan => plan.family !== 'aim').map(plan => plan.family)).size, 2);
  assert.ok(plans.reduce((sum, plan) => sum + plan.total, 0) <= difficulty.maxEnemyBullets);
  assert.ok(plans.every(plan => plan.total <= difficulty.maxSequenceBullets
    && plan.bundles.every(bundle => bundle.count <= difficulty.maxPatternBullets)));
  assert.equal(difficulty.minimumFlightTime, .9);
  assert.equal(difficulty.minTelegraph, .75);
  assert.equal(difficulty.maxBulletSpeed, 320);
  assert.equal(MAX_BARRAGE_SPEED, 520);
});

test('Stage1 uses short same-side visible entry while later sources retain large opposite vertical entries', () => {
  for (let pace = 0; pace < 6; pace++) for (let time = 0; time < 42; time += .5) {
    const encounter = normalEncounter(time, pace), sources = encounter.roles.filter(role => role.roleKey);
    for (let i = 0; i < sources.length; i++) {
      const source = sources[i], entry = source.deployment;
      assert.ok(entry);
      if (pace) assert.ok(Math.abs(entry.spawnY - entry.holdY) >= 260, 'later entry retains its large vertical movement');
      else {
        assert.ok(Math.abs(entry.spawnY - entry.holdY) <= 40, 'first tell no longer waits through the central firing line');
        assert.ok([140, 560].includes(entry.holdY));
        assert.equal(encounter.phrase.independentEntry, true);
      }
      assert.ok(entry.spawnY >= 96 && entry.spawnY <= 624 && entry.holdY >= 112 && entry.holdY <= 608);
      assert.equal(entry.holdY, source.lane); assert.equal(entry.holdX, source.holdScreenX);
      assert.equal(entry.bankSign, Math.sign(entry.holdY - entry.spawnY));
      assert.equal(entry.approachSeconds, pace ? 1.35 + i * .25 : .9 + i * .1);
      assert.ok(entry.spawnOffsetX >= 0 && entry.spawnOffsetX <= 100);
      assert.equal(entry.attackOffset, i * (pace ? .45 : .15));
      assert.equal(source.initialAttackDelay, entry.attackOffset, 'the offset is one canonical first-wait value');
    }
    assert.ok(sources.length <= trialDifficulty(pace).maxAttackers);
    for (const body of encounter.roles.filter(role => ['lunge', 'deploy'].includes(role.pattern)))
      assert.equal(body.deployment, undefined, 'body retirement and bay ownership use their existing paths');
  }
});

test('formation results are isolated and keep the quiet period, recovery schedule and safety rules', () => {
  const first = normalEncounter(0, 0); first.roles[0].deployment.holdY = 360;
  assert.equal(normalEncounter(0, 0).roles[0].deployment.holdY, 560);
  for (let pace = 0; pace < 6; pace++) {
    assert.deepEqual(normalEncounter(42, pace).roles, []);
    assert.equal(normalEncounter(44.9, pace).aimLimit, 0);
    assert.equal(attackPolicy('rail', pace).minFlightTime, trialDifficulty(pace).minimumFlightTime);
    assert.equal(attackPolicy('rail', pace).aimLock, 'snapshot');
  }
  assert.equal(LEVEL_RULES.normalDuration, 45); assert.equal(LEVEL_RULES.quietAt, 42);
  assert.equal(LEVEL_RULES.firstSupply, 6); assert.equal(LEVEL_RULES.supplyInterval, 15);
  assert.equal(LEVEL_RULES.grazeMargin, 12);
});

test('the longer eight-second opening permits at most two cycles under its real deadline like later blocks', () => {
  for (let pace = 0; pace < 6; pace++) for (let time = 0; time < 45; time += .5) {
    const encounter = normalEncounter(time, pace);
    if (!encounter.phrase) continue;
    assert.equal(encounter.phrase.maxCycles, 2);
    assert.equal(encounter.phrase.independentRepeats, true);
    assert.equal(encounter.phrase.deadline, encounter.until);
    assert.ok(encounter.phrase.start <= time && time < encounter.phrase.deadline);
  }
  const later = normalEncounter(6, 0); later.phrase.maxCycles = 99;
  assert.equal(normalEncounter(6, 0).phrase.maxCycles, 2, 'cycle limits belong to one returned plan only');
  assert.equal(normalEncounter(42, 0).phrase, null, 'the quiet period never becomes a repeat block');
});

test('both first-stage zipper blocks use an existing durable Claw role without increasing any combat profile', () => {
  for (let time = 32; time < 39; time += .25) {
    const encounter = normalEncounter(time, 0);
    const sources = encounter.roles.filter(role => role.roleKey);
    const zipper = sources.find(role => role.pattern === 'zipper');
    assert.equal(encounter.blockId, '1:window-introduction');
    assert.equal(zipper.type, 'claw');
    assert.equal(zipper.lane, 140);
    assert.deepEqual(zipper.deployment, { spawnY: 120, spawnOffsetX: 35,
      approachSeconds: 1, holdY: 140, holdX: 1100, attackOffset: .15, bankSign: 1 });
    assert.equal(zipper.initialAttackDelay, .15);
    assert.equal(zipper.count, 1);
    assert.deepEqual(sources.filter(role => role.type !== 'claw').map(role => [role.type, role.lane,
      role.deployment.approachSeconds, role.deployment.spawnOffsetX, role.initialAttackDelay]),
    [['ray', 560, .9, 0, 0], ['dart', 560, 1.1, 70, .3]]);
    assert.equal(encounter.phrase.deadline, 39);
    assert.equal(encounter.phrase.maxCycles, 2);
  }
  const earlier = normalEncounter(16, 0).roles.find(role => role.pattern === 'zipper' && role.roleKey);
  assert.equal(earlier.type, 'claw'); assert.equal(earlier.lane, 560);
  for (let pace = 0; pace < 6; pace++) for (let time = 0; time < 45; time++) {
    const encounter = normalEncounter(time, pace);
    for (const source of encounter.roles.filter(role => role.roleKey)) {
      if (pace) assert.notEqual(encounter.phrase.independentEntry, true, 'later entry policy is unchanged');
    }
    assert.equal(trialDifficulty(pace).minimumFlightTime, [.9, .7, .65, .6, .55, .5][pace]);
    assert.ok(trialDifficulty(pace).maxBulletSpeed <= MAX_BARRAGE_SPEED);
  }
});
