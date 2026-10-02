import test from 'node:test';
import assert from 'node:assert/strict';
import { ENEMY_COMBAT_PROFILES, combatProfile, recoveryPolicy } from '../src/combat-tuning.js';
import { basicWeapon, LEVEL_RULES } from '../src/level.js';
import { FLIGHT_CONTROL, PLAYER_HIT_RADIUS, PICKUP_ATTRACTION } from '../src/game.js';

const EXISTING_ROLES = ['beetle', 'claw', 'worm', 'wasp', 'mantis', 'ray', 'dragonfly', 'orb', 'needle'];
const COMMITTED_ROLES = ['claw', 'worm', 'wasp', 'ray', 'orb', 'needle', 'dart', 'scarab', 'pincer'];

// An already travelling volley gives the shooter 120ms of head start. Count
// discrete full volleys, not mean DPS; aligned specials intentionally stop roles.
function incomingBasicDamage(level, seconds, tension = 1) {
  const weapon = basicWeapon(level);
  const volleys = Math.floor((seconds + 1e-9) / 0.095) + 1;
  return volleys * weapon.offsets.length * weapon.damage * tension;
}

test('D52 keeps nine existing roles, fodder, control and pickup reach', () => {
  for (const role of EXISTING_ROLES) assert.ok(ENEMY_COMBAT_PROFILES[role]);
  assert.equal(combatProfile('beetle').hp, 3);
  assert.equal(combatProfile('dragonfly').hp, 1);
  assert.equal(PLAYER_HIT_RADIUS, 1.85);
  assert.equal(FLIGHT_CONTROL.horizontalSpeed, 225);
  assert.equal(FLIGHT_CONTROL.verticalSpeed, 490);
  assert.equal(PICKUP_ATTRACTION.radius, 212);
  assert.equal(PICKUP_ATTRACTION.rearExtension, 106);
  assert.equal(LEVEL_RULES.normalDuration, 45);
});

test('ordinary first and third-stage fire leaves a first attack opportunity for committed roles', () => {
  for (const [pace, level] of [[0, 1], [2, 3]]) {
    for (const role of COMMITTED_ROLES) {
      const profile = combatProfile(role, pace);
      const damage = incomingBasicDamage(level, profile.firstAttackDelay + profile.firstTell + 0.12);
      assert.ok(profile.hp > damage, `${role} pace ${pace}: HP ${profile.hp}, incoming ${damage}`);
    }
  }
});

test('focused lance specials can stop committed threats before release without hidden immunity', () => {
  for (const role of COMMITTED_ROLES) {
    const profile = combatProfile(role, 2);
    const available = profile.firstAttackDelay + profile.firstTell;
    const lanceVolleys = Math.floor((available + 1e-9) / 0.085) + 1;
    assert.ok(lanceVolleys * 9 > profile.hp, `${role} should reward focused special fire`);
    assert.equal(profile.bodyDamage, 22);
    assert.equal(profile.projectileDamage, 12);
    assert.equal(profile.invincible, undefined);
  }
});

test('rusher contracts expose committed direction and keep body and projectile attacks separate', () => {
  const pincer = combatProfile('pincer', 2), wasp = combatProfile('wasp', 2);
  assert.equal(pincer.coreExposed, false);
  assert.equal(pincer.firstTell, 1);
  assert.equal(pincer.bodyAttack.baitSeconds, 0.65);
  assert.equal(pincer.bodyAttack.braceSeconds, 0.35);
  for (const profile of [pincer, wasp]) {
    assert.equal(profile.attackMode, 'body-dash');
    assert.equal(profile.bodyAttack.projectiles, false);
    assert.equal(profile.bodyAttack.retargetDuringDash, false);
    assert.equal(profile.bodyAttack.lockAt, 'brace');
    assert.equal(profile.recoverySeconds, 1.1);
    const committedTravel = profile.bodyAttack.dashSpeed * profile.bodyAttack.dashSeconds;
    assert.ok(committedTravel >= 590 && committedTravel <= 620, `${profile.type} does not reach a 600px approach`);
    // Even a 300ms late reaction has room to cross a radius-sized danger band.
    const usableTell = profile.firstTell - 0.3;
    const moveWithAcceleration = FLIGHT_CONTROL.verticalSpeed *
      (usableTell - (1 - Math.exp(-FLIGHT_CONTROL.verticalResponse * usableTell)) / FLIGHT_CONTROL.verticalResponse);
    assert.ok(moveWithAcceleration > profile.radius * 2 + PLAYER_HIT_RADIUS * 2);
  }
});

test('rail burst is locked before its three discrete shots and has a bounded recovery', () => {
  for (let pace = 0; pace <= 8; pace++) {
    const profile = combatProfile('dart', pace);
    assert.equal(profile.rail.chargeSeconds, 0.7);
    assert.equal(profile.rail.lockSeconds, 0.25);
    assert.equal(profile.rail.shotCount, 3);
    assert.equal(profile.rail.shotInterval, 0.12);
    assert.equal(profile.rail.lockAt, 'charge-end');
    assert.equal(profile.rail.retargetDuringBurst, false);
    assert.equal(profile.firstTell, 0.95);
    assert.ok(profile.recoverySeconds >= 1 && profile.recoverySeconds <= 1.4);
    assert.equal((profile.rail.shotCount - 1) * profile.rail.shotInterval, 0.24);
  }
});

test('brood deployment remains bounded and cannot manufacture healing or recursive children', () => {
  const { brood } = combatProfile('scarab', 4);
  assert.equal(brood.deployCount, 2);
  assert.equal(brood.maxChildren, 4);
  assert.equal(brood.childDropHealth, false);
  assert.equal(brood.childBossRewardEligible, false);
  assert.equal(brood.childCanDeploy, false);
  assert.equal(brood.childScore, 0);
  assert.equal(brood.backlog, false);
  assert.ok(brood.childFirstAttackDelay >= 0.6);
});

test('recovery retains the 24-second opportunity and reduces the later-stage healing budget', () => {
  const expected = [[24, 22], [18, 18], [14, 16], [12, 14], [10, 12], [10, 10]];
  expected.forEach(([normalHeal, bossHeal], i) => {
    const before = recoveryPolicy(i + 1, 24 - 1e-7, 0.4);
    const due = recoveryPolicy(i + 1, 24, 0.4);
    assert.equal(before.normalAt, 24);
    assert.equal(before.normalDue, false);
    assert.equal(due.normalDue, true);
    assert.equal(due.normalHeal, normalHeal);
    assert.equal(due.bossHeal, bossHeal);
  });
  const firstFour = expected.slice(0, 4).reduce((total, row) => total + row[0] + row[1], 0);
  assert.equal(firstFour, 138);
  assert.ok(firstFour < 4 * 60);
  const full = recoveryPolicy(3, 24, 1);
  assert.equal(full.normalHeal, 14);
  assert.equal(full.normalEffectiveCeiling, 0);
  const nearFull = recoveryPolicy(3, 24, 0.95);
  assert.ok(Math.abs(nearFull.normalEffectiveCeiling - 5) < 1e-9);
  assert.deepEqual(recoveryPolicy(99, 24, 0).normalHeal, 10);
});

test('the recorded early damage ledger shows why recovery alone cannot establish Stage 3 pressure', () => {
  // Prior native-assisted seed 3412810280, first 240s. Damage and pickup order
  // come from independent-qa-12h-20261002/BASELINE_MEASUREMENT.json and the
  // corresponding continuous.json. This is a fixed-event counterfactual, not a
  // replay of movement, attacks, or human difficulty. Stage uses pickup source.
  const events = [
    { damage: 12 }, { stage: 1, source: 'normal' },
    { damage: 12 }, { stage: 1, source: 'boss' },
    { damage: 12 }, { stage: 2, source: 'normal' },
    { damage: 17 }, { stage: 2, source: 'boss' },
    { damage: 22 }, { stage: 3, source: 'normal' },
    { stage: 3, source: 'boss' }, { damage: 12 }, { damage: 12 },
    { stage: 4, source: 'boss' },
  ];
  function ledger(legacy) {
    let hp = 100, damage = 0, healing = 0, afterThirdBoss;
    for (const event of events) {
      if (event.damage) { hp -= event.damage; damage += event.damage; }
      else {
        const policy = recoveryPolicy(event.stage, 24, hp / 100);
        const amount = legacy ? 30 : event.source === 'normal' ? policy.normalHeal : policy.bossHeal;
        const effective = Math.min(100 - hp, amount);
        hp += effective; healing += effective;
        if (event.stage === 3 && event.source === 'boss') afterThirdBoss = hp;
      }
    }
    return { hp, damage, healing, afterThirdBoss };
  }
  assert.deepEqual(ledger(true), { hp: 100, damage: 99, healing: 99, afterThirdBoss: 100 });
  assert.deepEqual(ledger(false), { hp: 90, damage: 99, healing: 89, afterThirdBoss: 100 });
});

test('profile snapshots are independent, deterministic and bounded through endless hell', () => {
  const original = combatProfile('dart', 2);
  const modified = combatProfile('dart', 2);
  modified.rail.shotCount = 900;
  assert.deepEqual(combatProfile('dart', 2), original);
  assert.ok(Object.isFrozen(ENEMY_COMBAT_PROFILES.dart.rail));
  for (const role of Object.keys(ENEMY_COMBAT_PROFILES)) {
    assert.deepEqual(combatProfile(role, 999), combatProfile(role, 5));
    assert.deepEqual(combatProfile(role, NaN), combatProfile(role, 0));
    assert.deepEqual(combatProfile(role, -3), combatProfile(role, 0));
    let previousHp = 0;
    for (let pace = 0; pace <= 5; pace++) {
      const profile = combatProfile(role, pace);
      assert.ok(Number.isFinite(profile.hp) && profile.hp >= previousHp);
      previousHp = profile.hp;
      assert.ok(profile.firstTell >= 0.35 && profile.firstAttackDelay > 0);
    }
  }
  assert.throws(() => combatProfile('unknown'), RangeError);
  assert.equal(recoveryPolicy(NaN, NaN, NaN).normalDue, false);
  assert.equal(recoveryPolicy(-3, 24, -1).stage, 1);
});
