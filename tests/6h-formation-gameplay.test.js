import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as engine from '../src/game.js';
import * as art from '../src/mecha-art.js';
import { normalEncounter } from '../src/level.js';

const DT = 1 / 120;
function fixture(seed = 620261003, normalTime = 0) {
  art.registerMechaManifest(JSON.parse(readFileSync(new URL('../' + art.MECHA_MANIFEST_PATH.replace(/^\.\//, ''), import.meta.url), 'utf8')));
  const game = engine.createGame(seed);
  game.mode = 'playing'; game.nextWaveAt = 0; game.nextBossAt = game.nextPickupAt = Infinity;
  game.normalTime = normalTime;
  Object.assign(game.player, engine.screenToWorld(game, { x: 225, y: 360 }), { invincible: 0 });
  const events = [];
  engine.updateGame(game, DT, { shoot: true });
  game.nextWaveAt = Infinity; events.push(...engine.consumeEvents(game));
  return { game, events, sources: game.enemies.filter(enemy => enemy.roleKey) };
}
function centeredFire(game) {
  const player = engine.worldToScreen(game, game.player);
  return { x: Math.max(-1, Math.min(1, (225 - player.x) / 20)),
    y: Math.max(-1, Math.min(1, (360 - player.y) / 30)), shoot: true };
}

test('real first-wave sources begin at their different entry altitudes instead of teleporting to hold lanes', () => {
  const { game, sources } = fixture(), roles = normalEncounter(0, 0).roles;
  assert.equal(sources.length, 3);
  for (const source of sources) {
    const role = roles.find(role => role.roleKey === source.roleKey), pose = engine.worldToScreen(game, source);
    assert.ok(source.deployment, 'the game must consume the authored deployment contract');
    for (const key of ['spawnY', 'holdY', 'holdX', 'approachSeconds', 'attackOffset', 'bankSign'])
      assert.equal(source.deployment[key], role.deployment[key]);
    const bornX = 1320 + role.deployment.spawnOffsetX;
    assert.ok(bornX - pose.x >= -1e-6 && bornX - pose.x <= source.speed * DT + 1,
      'spawn spacing uses the role offset rather than the accumulated wave index');
    assert.ok(Object.isFrozen(source.deployment), 'entry configuration is immutable during a run');
    assert.ok(Math.abs(pose.y - role.deployment.spawnY) < 2);
    assert.ok(Math.abs(pose.y - role.deployment.holdY) >= 19 && Math.abs(pose.y - role.deployment.holdY) <= 41);
    assert.ok(!source.sequence && !source.pendingAttackPlan, 'no attack begins inside its entry');
  }
});

test('ordinary centered fire leaves three same-side sources a visible first-release opportunity without HP protection', () => {
  const { game, events, sources } = fixture();
  const trace = new Map(sources.map(source => [source.id, { minY: Infinity, maxY: -Infinity }]));
  let maximumCommitted = 0;
  for (let frame = 0; frame < 5.5 / DT && game.mode === 'playing'; frame++) {
    for (const source of sources) if (!source.dead) {
      const pose = engine.worldToScreen(game, source), range = trace.get(source.id);
      range.minY = Math.min(range.minY, pose.y); range.maxY = Math.max(range.maxY, pose.y);
    }
    engine.updateGame(game, DT, centeredFire(game));
    const current = engine.consumeEvents(game); events.push(...current);
    const reserved = game.enemies.reduce((sum, enemy) => sum + (enemy.reservedBullets || 0), 0);
    maximumCommitted = Math.max(maximumCommitted, game.enemyBullets.length + reserved);
    assert.ok(game.enemyBullets.length + reserved <= game.difficulty.maxEnemyBullets);
    assert.equal(game.player.radius, 1.85);
    assert.ok(game.enemyBullets.every(bullet => Math.hypot(bullet.vx, bullet.vy) <= game.difficulty.maxBulletSpeed + 1e-6));
  }
  const firstCharges = [], firstShots = [];
  for (const source of sources) {
    const range = trace.get(source.id), charge = events.find(event => event.type === 'charge' && event.enemyId === source.id);
    const shot = events.find(event => event.type === 'enemyShot' && event.enemyId === source.id && event.bulletCount > 0);
    assert.ok(range.maxY - range.minY >= 15, 'the actual source enters smoothly without teleporting');
    assert.ok(charge && shot, `${source.roleKey} must actually charge and emit`);
    assert.ok(charge.simulationAt - source.spawnedAt >= source.deployment.approachSeconds - DT);
    assert.ok(shot.simulationAt - charge.simulationAt >= charge.duration - DT);
    const earlierDeath = events.find(event => event.type === 'explosion' && event.enemyId === source.id);
    assert.ok(!earlierDeath || earlierDeath.simulationAt >= shot.simulationAt, 'friendly fire can kill a source but not before this first-release witness');
    assert.equal(source.maxHp, source.combat.hp, 'source health retains the ordinary combat profile');
    firstCharges.push(charge.simulationAt); firstShots.push(shot.simulationAt);
  }
  assert.ok(Math.max(...firstCharges) - Math.min(...firstCharges) >= .4, 'own visible entry and first offsets retain distinct cues');
  assert.ok(Math.max(...firstShots) - Math.min(...firstShots) >= .6, 'actual field/rail releases retain a time difference');
  assert.ok(maximumCommitted > 30, 'the witness observes actual multi-source field pressure');
  const rails = events.filter(event => event.type === 'enemyShot' && event.pattern === 'rail').flatMap(event => event.shots);
  assert.ok(rails.length >= 3);
  for (const shot of rails) {
    assert.ok(shot.launchedAt - shot.lockAt >= .25 - DT);
    assert.deepEqual(shot.lockedTarget, rails[0].lockedTarget);
    const flight = (Math.hypot(shot.lockedTarget.x - shot.x, shot.lockedTarget.y - shot.y) - shot.radius - 1.85) / Math.hypot(shot.vx, shot.vy);
    assert.ok(flight >= .9, 'first-wave pressure retains the Stage1 post-release flight guard');
  }
});

test('pausing an actual entry preserves its position and pending first attack without catch-up', () => {
  const { game } = fixture();
  for (let frame = 0; frame < 60; frame++) engine.updateGame(game, DT, centeredFire(game));
  game.mode = 'paused'; const snapshot = structuredClone(game);
  for (let frame = 0; frame < 40; frame++) engine.updateGame(game, .12, { x: 1, y: 1, shoot: true });
  assert.deepEqual(game, snapshot);
  game.mode = 'playing'; engine.updateGame(game, DT, centeredFire(game));
  assert.ok(Math.abs(game.time - snapshot.time - DT) < 1e-9);
});

test('the controlled late Stage1 wave gives the existing Claw zipper its first real release under centered fire', () => {
  // A fresh-camera controlled wave is separate from the natural 32-second path.
  for (const seed of [620261003, 620261004]) {
    const { game, events, sources } = fixture(seed, 32);
    const zipper = sources.find(source => source.pattern === 'zipper');
    assert.equal(sources.length, 3);
    assert.equal(zipper.type, 'claw'); assert.equal(zipper.maxHp, 26);
    assert.equal(zipper.deployment.holdY, 140);
    assert.equal(zipper.deployment.approachSeconds, 1);
    assert.equal(game.player.invincible, 0);
    for (let frame = 0; frame < 5.5 / DT && game.mode === 'playing'; frame++) {
      engine.updateGame(game, DT, centeredFire(game));
      events.push(...engine.consumeEvents(game));
      const reserved = game.enemies.reduce((sum, enemy) => sum + (enemy.reservedBullets || 0), 0);
      assert.ok(game.enemyBullets.length + reserved <= game.difficulty.maxEnemyBullets);
      assert.equal(game.player.radius, 1.85);
      assert.ok(game.enemyBullets.every(bullet => Math.hypot(bullet.vx, bullet.vy) <= game.difficulty.maxBulletSpeed + 1e-6));
    }
    for (const source of sources) {
      const charge = events.find(event => event.type === 'charge' && event.enemyId === source.id);
      const shot = events.find(event => event.type === 'enemyShot' && event.enemyId === source.id && event.bulletCount > 0);
      assert.ok(charge && shot, `${seed}: ${source.roleKey} must really emit`);
      assert.ok(shot.simulationAt - charge.simulationAt >= charge.duration - DT);
      assert.ok(charge.duration >= .75);
      assert.ok(shot.simulationAt < 7, 'the normalTime39 deadline is unchanged');
      const death = events.find(event => event.type === 'explosion' && event.enemyId === source.id);
      assert.ok(!death || death.simulationAt >= shot.simulationAt);
      assert.equal(source.maxHp, source.combat.hp);
    }
    assert.equal(game.difficulty.minimumFlightTime, .9);
  }
});
