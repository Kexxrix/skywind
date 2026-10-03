import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVEL_RULES, trialDifficulty, normalEncounter, bossProfile, bossAttack, attackPolicy, LEVEL_BOSS_KINDS } from '../src/level.js';
import { barragePlan, patternGeometry, MAX_BARRAGE_SPEED, fieldOnlyPlan, relativeMinimumDistance } from '../src/barrage.js';
import * as engine from '../src/game.js';
import * as art from '../src/mecha-art.js';
import { createVisibleController } from '../tools/qa-12h-controller.mjs';
import { readFileSync } from 'node:fs';

test('twelve-hour pressure keeps five forty-five-second stages and victory-only bounded hell', () => {
  assert.equal(LEVEL_RULES.normalDuration, 45);
  assert.equal(LEVEL_RULES.quietAt, 42);
  assert.deepEqual(Array.from({ length: 6 }, (_, i) => trialDifficulty(i).minimumFlightTime), [.9, .7, .65, .6, .55, .5]);
  assert.deepEqual(Array.from({ length: 6 }, (_, i) => trialDifficulty(i).maxBulletSpeed), [320, 420, 460, 490, 505, MAX_BARRAGE_SPEED]);
  assert.equal(trialDifficulty(1000).pace, 5);
  assert.equal(trialDifficulty(1000).maxEnemyBullets, 420);
  assert.equal(trialDifficulty(1000).tier, 1001);
  assert.equal(normalEncounter(42, 2).aimLimit, 0);
  assert.deepEqual(normalEncounter(44.999, 2).roles, []);
});

test('all nine retained normals and all three new roles are authored into real bounded wave slots', () => {
  const expected = ['beetle', 'dragonfly', 'wasp', 'mantis', 'orb', 'claw', 'ray', 'worm', 'needle', 'pincer', 'dart', 'scarab'];
  const admitted = new Set();
  for (let pace = 0; pace < 6; pace++) for (let t = 0; t < 42; t++) {
    let budget = trialDifficulty(pace).waveSize;
    for (const role of normalEncounter(t, pace).roles) {
      assert.ok(role.count > 0 && role.lane >= 112 && role.lane <= 608);
      if (budget > 0) admitted.add(role.type);
      budget -= role.count;
      if (role.type === 'pincer') assert.equal(barragePlan(role.pattern, pace).total, 0);
      if (role.type === 'scarab') assert.equal(role.pattern, 'deploy');
      if (role.type === 'dart') assert.equal(role.pattern, 'rail');
    }
  }
  assert.deepEqual([...admitted].sort(), expected.sort());
});

test('Stage3 has two space-control families plus snapshots without permanent aimed-fire exclusion', () => {
  const encounter = normalEncounter(20, 2);
  const plans = encounter.roles.filter(role => role.pattern).map(role => barragePlan(role.pattern, 2, .3));
  const patternFamilies = new Set(plans.flatMap(plan => plan.families).filter(family => !['aim', 'body', 'deploy'].includes(family)));
  assert.ok(patternFamilies.size >= 2);
  assert.ok(plans.some(plan => plan.families.includes('aim')));
  assert.equal(encounter.maxPatternFamilies, 2);
  assert.equal(encounter.maxAttackFamilies, 3);
  assert.ok(encounter.aimLimit > 0);
  for (const name of ['B04', 'B05', 'loom', 'jaws']) {
    const policy = attackPolicy(name, 2);
    assert.equal(policy.movementWindow, false);
    assert.ok(!policy.forbidden.includes('aim'));
    assert.ok(policy.aimLimit > 0);
  }
  assert.equal(attackPolicy('rail', 2).family, 'aim');
  assert.equal(attackPolicy('deploy', 2).family, 'deploy');
  assert.equal(attackPolicy('lunge', 2).family, 'body');
});

test('five canonical bosses expose distinct movement, response spaces, transitions and timed actions', () => {
  assert.deepEqual(LEVEL_BOSS_KINDS, ['warden', 'carrier', 'lancer', 'bastion', 'apex']);
  const profiles = LEVEL_BOSS_KINDS.map((_, i) => bossProfile(i));
  assert.deepEqual(profiles.map(profile => profile.attackOrder[0]), ['cathedral', 'deploy', 'rail', 'jaws', 'loom']);
  for (const key of ['movement', 'responseSpace', 'transitionPolicy']) assert.equal(new Set(profiles.map(profile => profile[key].kind)).size, 5);
  assert.ok(profiles[1].attackOrder.includes('deploy'));
  assert.ok(profiles[2].attackOrder.includes('lunge'));
  assert.ok(profiles[3].attackOrder.includes('jaws'));
  for (let stage = 0; stage < 10; stage++) for (let index = 0; index < 15; index++) {
    const attack = bossAttack(stage, index, .3);
    assert.equal(attack.index, index);
    assert.equal(attack.phase, 2);
    assert.ok(attack.tell.duration >= trialDifficulty(stage).minTelegraph);
    assert.ok(attack.openWindow.delay >= 0 && attack.openWindow.duration > 0);
    assert.equal(attack.action.at, 0);
    assert.ok(attack.action.duration > 0);
    assert.ok(attack.action.targetBand >= 170 && attack.action.targetBand <= 550);
    if (attack.pattern === 'lunge') assert.equal(attack.action.kind, 'lunge');
    if (attack.pattern === 'deploy') assert.deepEqual([attack.action.kind, attack.action.count, attack.action.childLimit], ['deploy', 2, 4]);
  }
  assert.equal(bossProfile(5).kind, 'warden');
  assert.equal(bossProfile(5).hell, true);
});

test('returned encounter and boss data cannot mutate the next deterministic plan', () => {
  const encounter = normalEncounter(10, 2), profile = bossProfile(2);
  encounter.roles[0].type = 'bad'; encounter.safeLanes[0] = 999;
  profile.movement.kind = 'bad'; profile.responseSpace.bands[0] = 999; profile.transitionPolicy.thresholds[0] = 0;
  assert.equal(normalEncounter(10, 2).roles[0].type, 'worm');
  assert.equal(bossProfile(2).movement.kind, 'rail-sweep');
  assert.equal(bossProfile(2).responseSpace.bands[0], 200);
  assert.equal(bossProfile(2).transitionPolicy.thresholds[0], .72);
});

test('normal art roles match fan, drum burst, dual-port weave and rail grammar', () => {
  for (let pace = 0; pace < 6; pace++) for (let time = 0; time < 42; time++) for (const role of normalEncounter(time, pace).roles) {
    if (role.type === 'orb') assert.equal(role.pattern, 'trident');
    if (role.type === 'claw') {
      assert.equal(role.pattern, pace === 0 ? 'zipper' : 'snapshot');
      if (pace === 0) assert.equal(role.prefillMode, 'field-only', 'existing fan hull owns the first-stage weave without adding sniper shots');
    }
    if (role.type === 'ray') assert.ok(['seed', 'B04'].includes(role.pattern), 'the same route artillery owns seeds or aperture rows');
    if (role.type === 'needle' && role.pattern) assert.equal(role.pattern, 'snapshot');
  }
  const points = patternGeometry(barragePlan('trident', 2).bundles[2]);
  assert.ok(points.every(point => point.port === 2), 'the trident plan retains its third actual source port');
});


function stage3Fixture(normalTime = 0) {
  art.registerMechaManifest(JSON.parse(readFileSync(new URL('../' + art.MECHA_MANIFEST_PATH.replace(/^\.\//, ''), import.meta.url), 'utf8')));
  const game = engine.createGame(120202);
  game.mode = 'playing'; game.bossesDefeated = 2; game.normalTime = normalTime;
  game.nextPickupAt = game.nextBossAt = Infinity; game.player.invincible = 0;
  Object.assign(game.player, engine.screenToWorld(game, { x: 225, y: 360 }));
  return game;
}
const keepCenterInput = game => {
  const ship = engine.worldToScreen(game, game.player);
  return { x: Math.max(-1, Math.min(1, (225 - ship.x) / 20)),
    y: Math.max(-1, Math.min(1, (360 - ship.y) / 30)), shoot: false };
};

test('real Stage3 spawnWave retains authored hold ports and applies delayed fast first release once', () => {
  const game = stage3Fixture(), roles = normalEncounter(0, 2).roles;
  engine.updateGame(game, 1 / 120);
  const field = game.enemies.find(enemy => enemy.pattern === 'halo'), sniper = game.enemies.find(enemy => enemy.pattern === 'rail');
  assert.ok(field && sniper);
  for (const enemy of [field, sniper]) {
    const role = roles.find(role => role.type === enemy.type && role.pattern === enemy.pattern);
    assert.equal(enemy.holdScreenX, role.holdScreenX);
    assert.equal(enemy.holdScreenY, role.lane);
    assert.ok(enemy.fireCooldown >= role.initialAttackDelay);
  }
  game.nextWaveAt = Infinity;
  const events = [];
  for (let step = 0; step < 6 * 120 && game.mode === 'playing'; step++) {
    engine.updateGame(game, 1 / 120, keepCenterInput(game)); events.push(...engine.consumeEvents(game));
  }
  const firstSlow = events.find(event => event.type === 'enemyShot' && event.enemyId === field.id);
  const firstFast = events.find(event => event.type === 'enemyShot' && event.enemyId === sniper.id);
  assert.ok(firstSlow && firstFast, 'both actual authored sources reach their first release');
  const admitted=events.find(event=>event.type==='phraseAdmitted');
  const fastTiming=admitted.memberTiming.find(row=>row.enemyId===sniper.id),slowTiming=admitted.memberTiming.find(row=>row.enemyId===field.id);
  assert.ok(Math.abs(firstFast.shots[0].launchedAt-firstSlow.shots[0].launchedAt-(fastTiming.delay+fastTiming.tell-slowTiming.tell))<1/30);
  assert.ok(firstFast.shots.every(shot => shot.lockAt < shot.launchedAt && shot.speed === 460));
  const locks = events.filter(event => event.type === 'aimLock' && event.enemyId === sniper.id);
  assert.equal(locks.length, 1, 'the whole rail burst uses its pre-release snapshot');
  for (const event of events.filter(event => event.type === 'enemyShot' && event.enemyId === sniper.id))
    for (const shot of event.shots) assert.deepEqual(shot.lockedTarget, locks[0].lockedTarget);
});

// Controlled cross-arrival, with one real wave and ordinary 225/490 inputs.
// No invincibility is injected; staying central is intentionally damaged, not a survival policy.
test('a real woven wave brings slow grid and fixed-lock fast shots into the player band together', () => {
  const game = stage3Fixture(17), events = [];
  let overlap = 0, maximumSpeed = 0;
  for (let step = 0; step < 12 * 120 && game.mode === 'playing'; step++) {
    engine.updateGame(game, 1 / 120, keepCenterInput(game));
    if (!step) game.nextWaveAt = Infinity; // Isolate first actual spawnWave, preserving all its source actors.
    events.push(...engine.consumeEvents(game));
    let slow = false, fast = false;
    const ship = engine.worldToScreen(game, game.player);
    for (const bullet of game.enemyBullets) {
      const speed = Math.hypot(bullet.vx, bullet.vy), pose = engine.worldToScreen(game, bullet);
      maximumSpeed = Math.max(maximumSpeed, speed);
      const margin = Math.hypot(bullet.x - game.player.x, bullet.y - game.player.y) - bullet.radius - game.player.radius;
      if (!bullet.arming && Math.abs(pose.x - ship.x) <= 48 && margin < 32) {
        slow ||= bullet.family !== 'aim' && speed >= 210 && speed < 350;
        fast ||= bullet.family === 'aim' && (!bullet.motion || bullet.motion.kind === 'linear') && speed >= 460;
      }
    }
    if (slow && fast) overlap += 1 / 120;
    assert.ok(game.enemyBullets.length + game.enemies.reduce((sum, enemy) => sum + (enemy.reservedBullets || 0), 0) <= game.difficulty.maxEnemyBullets);
    assert.equal(game.player.radius, 1.85);
  }
  assert.ok(overlap > 0, 'launch counts alone cannot satisfy cross-arrival');
  const patterns = new Set(events.filter(event => event.type === 'enemyShot' && event.bulletCount).map(event => event.pattern));
  for (const pattern of ['loom', 'zipper', 'snapshot']) assert.ok(patterns.has(pattern), pattern);
  const fieldId = events.find(event => event.type === 'enemyShot' && event.pattern === 'loom')?.enemyId;
  const fastId = events.find(event => event.type === 'enemyShot' && event.pattern === 'snapshot')?.enemyId;
  assert.notEqual(fieldId, fastId, 'the fast burst must come from an independent visible coil source');
  assert.ok(events.some(event => event.type === 'hit' && event.player && event.sourceKind === 'projectile'));
  // Independent repeats intentionally add a second real attack opportunity.
  // This stationary witness establishes cross-arrival and the real HP ledger;
  // the following ordinary avoidance witness establishes a surviving path.
  let recordedHp=100;
  for(const event of events){
    if(event.type==='hit'&&event.player){
      assert.equal(event.hpBefore,recordedHp);assert.ok(event.effectiveDamage>0);
      assert.equal(event.hpAfter,Math.max(0,recordedHp-event.damage));recordedHp=event.hpAfter;
    }else if(event.type==='pickup'){
      assert.equal(event.hpBefore,recordedHp);assert.equal(event.hpAfter,recordedHp+event.effectiveHeal);recordedHp=event.hpAfter;
    }
  }
  assert.equal(game.player.hp,recordedHp,'damage and collection events explain all stationary-witness HP');
  assert.equal(game.mode==='gameover',recordedHp===0,'death occurs only through the real damage ledger');
  assert.ok(maximumSpeed <= 460 + 1e-7);
});

// A limited visible-state model supplies real normal inputs. This is one reproducible
// surviving path with the actual body/hull collision function, not human fun approval.
test('normal-input avoidance survives real body and projectile pressure without changing control or damage cores', () => {
  const game = stage3Fixture(27), controller = createVisibleController(engine, art, relativeMinimumDistance), events = [];
  let maximumBullets = 0, bodyDodge = null;
  for (let step = 0; step < 12 * 120 && game.mode === 'playing'; step++) {
    let input = controller.input(game);
    // React to the visible brace after 300ms, then retreat left while crossing
    // vertically for the same 1.4s. The approved pincer fire plate extends beyond
    // its charge hull; the old vertical-only path hit that real plate at 6.35s.
    // The unchanged v2 controller forecasts a radius proxy; actual game contact
    // uses registered frame hulls. This witness is not an authored-hull forecaster.
    // Both traces are retained in evidence/experiments/body-witness-local-pincer-v2.
    if (bodyDodge && game.time >= bodyDodge.at && game.time < bodyDodge.until) input = { ...input, x: -1, y: bodyDodge.y };
    assert.ok(Math.abs(input.x) <= 1 && Math.abs(input.y) <= 1, 'the surviving witness uses ordinary controls');
    engine.updateGame(game, 1 / 120, input);
    if (!step) game.nextWaveAt = Infinity;
    const current = engine.consumeEvents(game); events.push(...current);
    for (const event of current) if (event.type === 'charge' && event.body) {
      bodyDodge = { at: game.time + .3, until: game.time + .3 + 1.4,
        y: engine.worldToScreen(game, game.player).y > 360 ? -1 : 1 };
    }
    maximumBullets = Math.max(maximumBullets, game.enemyBullets.length);
    assert.equal(game.player.radius, 1.85);
    assert.ok(game.enemyBullets.length + game.enemies.reduce((sum, enemy) => sum + (enemy.reservedBullets || 0), 0) <= game.difficulty.maxEnemyBullets);
  }
  assert.ok(events.some(event => event.type === 'dashStart' && event.enemyType === 'pincer'), 'a real locked body dash participates');
  assert.ok(events.some(event => event.type === 'enemyShot' && event.pattern === 'seed' && event.bulletCount > 0));
  assert.ok(events.some(event => event.type === 'enemyShot' && event.family === 'aim' && event.bulletCount > 0));
  assert.ok(maximumBullets > 0);
  assert.equal(game.player.hp, 100);
  assert.equal(events.filter(event => event.type === 'hit' && event.player).length, 0);
});


test('a normal counterflow source outside the rolled basic firing line reaches its first shot before ordinary-fire destruction', () => {
  const role = normalEncounter(8, 2).roles.find(role => role.type === 'mantis' && role.pattern === 'zipper');
  assert.equal(role.lane, 150); assert.equal(role.holdScreenX, 1100);
  const game = stage3Fixture(8), controller = createVisibleController(engine, art, relativeMinimumDistance), events = [];
  for (let step = 0; step < 3 * 120; step++) {
    engine.updateGame(game, 1 / 120, controller.input(game));
    if (!step) game.nextWaveAt = Infinity;
    events.push(...engine.consumeEvents(game));
  }
  const source = game.enemies.find(enemy => enemy.type === 'mantis' && enemy.pattern === 'zipper');
  assert.ok(source, 'the existing low-HP source remains vulnerable but gets its first visible attack opportunity');
  const firstShot = events.find(event => event.type === 'enemyShot' && event.enemyId === source.id && event.pattern === 'zipper' && event.bulletCount > 0);
  const tell = events.find(event => event.type === 'charge' && event.enemyId === source.id);
  assert.ok(firstShot && tell, 'the visible low-HP source fires after the group settles at its existing hold ports');
  assert.ok(Math.abs(firstShot.simulationAt - tell.simulationAt - tell.duration) < 1 / 60);
  assert.ok(source.hp <= source.maxHp);
  assert.equal(role.count, 1); assert.equal(barragePlan('zipper', 2).total, 36);
});


test('normal core phrases reserve unique independent roles inside their authored normal-time block', () => {
  for (let pace = 0; pace < 6; pace++) for (let time = 0; time < 45; time += .5) {
    const encounter = normalEncounter(time, pace), difficulty = trialDifficulty(pace);
    const members = encounter.roles.filter(role => role.roleKey);
    if (!members.length) { assert.equal(encounter.phrase, null); continue; }
    const phrase = encounter.phrase;
    const firstContact = pace === 2 && encounter.blockId === '3:slow-prefill';
    assert.equal(phrase.key, encounter.blockId + '-crossfire');
    assert.ok(phrase.start <= time && time < phrase.deadline);
    assert.equal(phrase.deadline, encounter.until);
    assert.equal(phrase.maxCycles, 2,
      'every authored group permits at most two finite cycles inside its actual deadline');
    assert.deepEqual(phrase.memberRoleKeys, members.map(role => role.roleKey));
    assert.equal(new Set(phrase.memberRoleKeys).size, members.length);
    assert.ok(members.length <= difficulty.waveSize && members.length <= difficulty.maxAttackers);
    const plans = members.map((role, index) => {
      assert.equal(role.count, 1, 'an authored member denotes one actual source');
      assert.equal(role.initialAttackDelay, index * (pace ? .45 : .15));
      assert.equal(role.deployment.attackOffset, role.initialAttackDelay);
      const original = barragePlan(role.pattern, pace);
      if (role.prefillMode === 'field-only') {
        assert.equal(role.holdScreenX, firstContact ? 900 : 1100);
        assert.ok(!['rail', 'snapshot', 'lunge', 'deploy'].includes(role.pattern));
        return fieldOnlyPlan(original);
      }
      assert.ok(['rail', 'snapshot'].includes(role.pattern));
      assert.equal(role.holdScreenX, firstContact ? 1100 : pace ? 900 : 1000);
      return original;
    });
    const families = new Set(plans.flatMap(plan => plan.families));
    const fields = [...families].filter(family => !['aim', 'body', 'deploy'].includes(family));
    assert.ok(fields.length <= encounter.maxPatternFamilies);
    assert.ok(families.size <= encounter.maxAttackFamilies);
    assert.ok(plans.filter(plan => plan.families.includes('aim')).length <= encounter.aimLimit);
    assert.ok(plans.reduce((sum, plan) => sum + plan.total, 0) <= difficulty.maxEnemyBullets);
    assert.ok(plans.every(plan => plan.total <= difficulty.maxSequenceBullets));
    for (const role of encounter.roles.filter(role => ['lunge', 'deploy'].includes(role.pattern))) assert.equal(role.roleKey, undefined);
  }
  assert.deepEqual([normalEncounter(7.999, 2).phrase.start, normalEncounter(8, 2).phrase.start,
    normalEncounter(16.999, 2).phrase.deadline, normalEncounter(17, 2).phrase.start], [0, 8, 17, 17]);
  assert.equal(normalEncounter(42, 2).phrase, null);
  const editable = normalEncounter(8, 2); editable.phrase.memberRoleKeys[0] = 'changed';
  assert.ok(!normalEncounter(8, 2).phrase.memberRoleKeys.includes('changed'));
});


test('Stage3 woven roles keep a real artillery grid and an independent coil inside a ninety-three-shot phrase', () => {
  const encounter = normalEncounter(17, 2), members = encounter.roles.filter(role => role.roleKey);
  assert.deepEqual(members.map(role => [role.type, role.pattern]), [['worm', 'loom'], ['mantis', 'zipper'], ['needle', 'snapshot']]);
  const plans = members.map(role => role.prefillMode === 'field-only'
    ? fieldOnlyPlan(barragePlan(role.pattern, 2)) : barragePlan(role.pattern, 2));
  assert.equal(plans.reduce((sum, plan) => sum + plan.total, 0), 93);
  assert.deepEqual([...new Set(plans.flatMap(plan => plan.families))], ['loom', 'weave', 'aim']);
  assert.equal(encounter.roles.reduce((sum, role) => sum + role.count, 0), 5);
  assert.ok(normalEncounter(27, 2).roles.some(role => role.type === 'ray' && role.pattern === 'seed'));
  assert.ok(plans[0].bundles.every(bundle => patternGeometry(bundle).every(point => point.targetX === 240)));
});
