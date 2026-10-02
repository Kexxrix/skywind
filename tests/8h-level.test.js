import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVEL_RULES, trialDifficulty, normalEncounter, normalPattern, bossProfile, bossAttack, attackPolicy, LEVEL_BOSS_KINDS } from '../src/level.js';
import { barragePlan, patternGeometry } from '../src/barrage.js';
import { createGame, startGame, updateGame, consumeEvents, worldToScreen, screenToWorld } from '../src/game.js';

test('difficulty has five learning stages and a capped endless sixth row without clock progression', () => {
  const rows = Array.from({ length: 6 }, (_, i) => trialDifficulty(i));
  assert.deepEqual(rows.map(row => row.pace), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(rows.map(row => row.maxEnemyBullets), [120, 180, 240, 300, 360, 420]);
  assert.deepEqual(rows.map(row => row.minimumFlightTime), [.9, .7, .65, .6, .55, .5]);
  assert.equal(rows[5].hell, true);
  assert.equal(trialDifficulty(1000).maxEnemies, rows[5].maxEnemies);
  assert.equal(trialDifficulty(1000).bossHp, rows[5].bossHp);
  for (const invalid of [-5, NaN, Infinity]) assert.deepEqual(trialDifficulty(invalid), rows[0]);
  assert.equal(LEVEL_RULES.normalDuration, 45);
  assert.equal(LEVEL_RULES.quietAt, 42);
});

test('each normal stage has a runtime script with distinct teaching blocks and a real boss rest', () => {
  const scripts = [];
  for (let pace = 0; pace < 6; pace++) {
    const blocks = new Map();
    for (let second = 0; second < 45; second++) {
      const encounter = normalEncounter(second, pace);
      blocks.set(encounter.blockId, encounter);
      assert.equal(normalPattern(second, pace), encounter.pattern);
      assert.ok(encounter.roles.every(role => role.count > 0 && role.lane >= 112 && role.lane <= 608));
      assert.equal(encounter.movementWindow, false, 'row apertures no longer exclude all other pressure');
      assert.ok(encounter.maxPatternFamilies <= 2);
      assert.ok(encounter.maxAttackFamilies <= 3, 'simultaneous families remain explicitly bounded');
      if (second >= 42) {
        assert.equal(encounter.pattern, null);
        assert.deepEqual(encounter.roles, []);
        assert.equal(encounter.aimLimit, 0);
      }
    }
    assert.ok(blocks.size >= 6);
    scripts.push([...blocks.keys()].join('|'));
    assert.ok(normalEncounter(9, pace).roles.some(role => role.pattern));
  }
  assert.equal(new Set(scripts).size, 6);
  assert.ok(normalEncounter(9, 3).roles.some(role => role.pattern === 'zipper'));
  assert.ok(normalEncounter(21, 2).roles.some(role => role.type === 'worm' && role.lane === 500 && role.pattern === 'loom' && role.prefillMode === 'field-only' && role.holdScreenX === 1100));
  const editable = normalEncounter(10, 0); editable.roles[0].type = 'bad'; editable.safeLanes[0] = 999;
  assert.equal(normalEncounter(10, 0).roles[0].type, 'orb');
  assert.equal(normalEncounter(10, 0).safeLanes[0], 220);
});

test('five bosses differ in attack actions and movement rather than color or HP alone', () => {
  assert.deepEqual(LEVEL_BOSS_KINDS, ['warden', 'carrier', 'lancer', 'bastion', 'apex']);
  const profiles = Array.from({ length: 5 }, (_, i) => bossProfile(i));
  assert.equal(new Set(profiles.map(p => p.attackOrder.join(','))).size, 5);
  assert.equal(new Set(profiles.map(p => JSON.stringify(p.motion))).size, 5);
  assert.equal(new Set(profiles.map(p => p.mechanic)).size, 5);
  assert.ok(profiles[1].attackOrder.includes('deploy'));
  assert.ok(profiles[3].attackOrder.includes('B05'));
  for (let stage = 0; stage < 10; stage++) for (let attackIndex = 0; attackIndex < 12; attackIndex++) {
    const attack = bossAttack(stage, attackIndex);
    assert.ok(attack.telegraph >= trialDifficulty(stage).minTelegraph);
    assert.equal(attack.aimLock, attackPolicy(attack.pattern).family === 'aim' ? 'snapshot' : 'release');
    if (attack.movementWindow) { assert.equal(attack.aimLimit, 0); assert.ok(attack.pauseAfter >= 1.1); }
  }
  assert.equal(bossProfile(5).kind, 'warden');
  assert.equal(bossProfile(5).hell, true);
});

test('all stage plans reserve complete shapes within bundle, sequence, speed and time bounds', () => {
  for (let pace = 0; pace <= 5; pace++) for (const pattern of ['B01', 'B02', 'B03', 'B04', 'B05']) {
    const d = trialDifficulty(pace), plan = barragePlan(pattern, pace, .73);
    assert.equal(plan.total, plan.bundles.reduce((sum, row) => sum + row.count, 0));
    assert.ok(plan.total <= d.maxSequenceBullets, `${pace} ${pattern}: ${plan.total}`);
    assert.ok(plan.bundles.every(row => row.count <= d.maxPatternBullets));
    assert.ok(plan.bundles.every(row => row.speed <= d.maxBulletSpeed));
    assert.ok(plan.duration < 5);
    for (let i = 1; i < plan.bundles.length; i++) assert.ok(plan.bundles[i].at >= plan.bundles[i - 1].at);
  }
  assert.ok(barragePlan('B01', 5).total > barragePlan('B01', 0).total);
  assert.equal(barragePlan('B05', 5).bundles.length, 4);
  assert.deepEqual(barragePlan('B05', 5).bundles.map(row => row.safeOffset), [0, 90, 0, -90]);
});

test('geometry preserves advertised corridors while retaining source ports and straight velocities', () => {
  for (let pace = 0; pace <= 5; pace++) for (const pattern of ['B04', 'B05']) {
    const d = trialDifficulty(pace);
    for (const bundle of barragePlan(pattern, pace).bundles) for (const lane of [240, 360, 480]) {
      const points = patternGeometry(bundle, { pattern, safeLane: lane, safeDirection: lane > 400 ? -1 : 1,
        corridorWidth: d.corridorWidth, playerRadius: 1.85, bulletRadius: 7, portCount: 2 });
      assert.ok(points.length > 0 && points.length <= bundle.count);
      for (const point of points) {
        assert.ok(point.port === 0 || point.port === 1);
        assert.equal(point.targetX, 360);
        assert.ok(Math.abs(point.targetY - point.windowY) >= d.corridorWidth / 2 + 8.85);
      }
    }
  }
  for (const pattern of ['B04', 'B05']) assert.ok(!attackPolicy(pattern, 5).forbidden.includes('aim'));
});

test('an uninterrupted runtime reaches all five bosses and hell only after six real defeat transitions', () => {
  const g = createGame(48271); startGame(g);
  g.player.invincible = 1000; // Transition/load observation only, never a survival proof.
  const entries = [], deaths = [], kinds = [], patternSets = [], waveBlocks = new Set();
  let activePatterns = new Set(), framesSinceBoss = 0;
  for (let frame = 0; frame < 410 * 60 && g.bossesDefeated < 6; frame++) {
    const before = g.bossesDefeated;
    updateGame(g, 1 / 60);
    for (const event of consumeEvents(g)) {
      if (event.type === 'boss') { entries.push(g.time); kinds.push(event.bossKind); activePatterns = new Set(); framesSinceBoss = 0; }
      if (event.type === 'wave' && event.blockId) waveBlocks.add(event.blockId);
      if (event.type === 'enemyShot' && event.boss) activePatterns.add(event.pattern);
      if (event.type === 'bossDefeated') deaths.push(g.time);
    }
    assert.ok(g.enemies.length <= g.difficulty.maxEnemies);
    assert.ok(g.enemyBullets.length <= g.difficulty.maxEnemyBullets);
    assert.ok(g.enemies.reduce((sum, e) => sum + (e.reservedBullets || 0), 0) + g.enemyBullets.length <= g.difficulty.maxEnemyBullets);
    if (g.phase === 'boss' && ++framesSinceBoss > 15 * 60) {
      g.bullets.push({ x: g.boss.x, y: g.boss.y, vx: 0, vy: 0, radius: 100, power: 10000 });
      // Two simultaneous fatal rounds must still award one defeat/reward.
      g.bullets.push({ x: g.boss.x, y: g.boss.y, vx: 0, vy: 0, radius: 100, power: 10000 });
    }
    if (g.bossesDefeated !== before) {
      assert.equal(g.bossesDefeated, before + 1);
      assert.equal(g.phase, 'normal'); assert.ok(g.normalTime >= 0 && g.normalTime <= 1 / 60);
      assert.equal(g.cycle, g.bossesDefeated + 1);
      patternSets.push(activePatterns);
    }
  }
  assert.equal(g.bossesDefeated, 6);
  assert.deepEqual(kinds, [...LEVEL_BOSS_KINDS, 'warden']);
  assert.equal(deaths.length, 6);
  assert.ok(Math.abs(entries[0] - 45) < 1 / 60);
  for (let i = 1; i < entries.length; i++) assert.ok(Math.abs(entries[i] - deaths[i - 1] - 45) < 1 / 60);
  assert.equal(g.difficulty.pace, 5); assert.equal(g.difficulty.hell, true);
  assert.ok(patternSets[0].has('B01'));
  assert.ok(patternSets[1].has('B04'));
  assert.ok(patternSets[2].has('B02'));
  assert.ok(patternSets[3].has('B05'));
  assert.ok(patternSets[4].has('B01'));
  assert.ok(waveBlocks.size >= 20, 'the actual wave runtime consumes stage-specific block scripts');
});

test('a surviving boss is never deleted or advanced by the five-minute tempo target', () => {
  const g = createGame(731); startGame(g); g.mode = 'playing';
  Object.assign(g.player, { x: 220, y: 360, invincible: 1000 });
  g.nextWaveAt = g.nextPickupAt = Infinity; g.nextBossAt = 0;
  updateGame(g, 1 / 60);
  const boss = g.boss, hp = boss.hp;
  g.time = 299;
  for (let frame = 0; frame < 8 * 60; frame++) updateGame(g, 1 / 60);
  assert.equal(g.boss, boss); assert.equal(boss.hp, hp);
  assert.equal(g.phase, 'boss'); assert.equal(g.bossesDefeated, 0);
  assert.equal(g.difficulty.pace, 0);
  assert.ok(Number.isFinite(worldToScreen(g, boss).y));
});

test('an offscreen row tail remains alive without granting blanket aimed-fire exclusivity', () => {
  for (const route of ['B04', 'B05']) {
    const g = createGame(9317); startGame(g); g.mode = 'playing'; g.bossesDefeated = 3;
    g.normalTime = 1; g.nextWaveAt = g.nextBossAt = g.nextPickupAt = Infinity;
    Object.assign(g.player, { x: 220, y: 360, invincible: 0 });
    const screenPoint = { x: 700, y: 760 };
    const point = screenToWorld(g, screenPoint);
    g.enemyBullets = [{ id: 91, ...point, vx: -175, vy: 0, radius: 5.5, power: 12, age: 0, pattern: route }];
    const enemy = { id: 90, type: 'beetle', x: 1000, y: 360, baseY: 360, radius: 28,
      hp: 20, maxHp: 20, speed: 0, phase: 0, age: 0, fireCooldown: 0, attack: 0,
      attackAngle: Math.PI, telegraph: 0, chargeTime: 0, locked: false, dashTime: 0, dead: false };
    g.enemies = [enemy]; consumeEvents(g);
    updateGame(g, 1 / 120, { y: 1 });
    assert.equal(g.enemyBullets.length, 1, 'the tail is still alive inside the projected culling margin');
    assert.ok(worldToScreen(g, g.enemyBullets[0]).y > 700, 'this tail is outside the current visible attack window');
    assert.equal(enemy.locked, true, `${route} retains its real tail while a separate aimed family can warn`);
    assert.ok(consumeEvents(g).some(event => event.type === 'charge' && event.attackName === 'aim'));
  }
});
