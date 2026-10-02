import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, updateGame, consumeEvents, screenToWorld } from '../src/game.js';
import { combatProfile } from '../src/combat-tuning.js';
import { registerMechaManifest } from '../src/mecha-art.js';

// Controlled Stage3 fixtures, with ordinary inputs and real damage. The original
// independent probe is preserved separately, including its historical fallback art.
function flightFixture(startScreenX) {
  registerMechaManifest({ schemaVersion: 1, entries: [] });
  const g = createGame(120201);
  g.mode = 'playing'; g.bossesDefeated = 2;
  g.nextWaveAt = g.nextBossAt = g.nextPickupAt = Infinity;
  Object.assign(g.player, screenToWorld(g, { x: 220, y: 360 }), { invincible: 0 });
  const combat = combatProfile('dart', 2), position = screenToWorld(g, { x: startScreenX, y: 360 });
  g.enemies = [{ id: 90, type: 'dart', ...position, baseY: position.y,
    radius: combat.radius, hp: combat.hp, maxHp: combat.hp, speed: combat.speed * 1.14,
    phase: 0, age: 0, angle: 0, attack: 0, fireCooldown: 0, combat }];
  return g;
}

test('the independently reproduced close rail cannot hit early after ordinary post-lock input', () => {
  const g = flightFixture(810), events = [];
  let locked = false;
  for (let step = 0; step < 360; step++) {
    updateGame(g, 1 / 120, locked ? { x: 1 } : {});
    const current = consumeEvents(g); events.push(...current);
    if (current.some(event => event.type === 'aimLock')) locked = true;
  }
  assert.ok(locked);
  const skipped = events.find(event => event.type === 'attackSkipped' && event.reason === 'minimum-flight-time');
  assert.ok(skipped);
  assert.ok(skipped.reachableAt < skipped.minimumFlightTime);
  assert.equal(events.filter(event => event.type === 'enemyShot').length, 0);
  assert.equal(events.filter(event => event.type === 'hit' && event.player).length, 0);
  assert.equal(g.player.hp, 100);
});

test('a safe moving rail really releases and damages after the minimum flight time', () => {
  const g = flightFixture(1040), events = [];
  for (let step = 0; step < 420; step++) {
    updateGame(g, 1 / 120, {}); events.push(...consumeEvents(g));
    if (events.some(event => event.type === 'hit' && event.player)) break;
  }
  const lock = events.find(event => event.type === 'aimLock');
  const shots = events.filter(event => event.type === 'enemyShot').flatMap(event => event.shots);
  assert.ok(lock); assert.equal(shots.length, 3);
  const hit = events.find(event => event.type === 'hit' && event.player);
  assert.ok(hit); assert.equal(hit.sourceKind, 'projectile');
  const shot = shots.find(candidate => candidate.id === hit.bulletId);
  assert.ok(shot); assert.deepEqual(shot.lockedTarget, lock.lockedTarget);
  assert.ok(shot.lockAt < shot.launchedAt);
  assert.ok(hit.simulationAt - shot.launchedAt >= g.difficulty.minimumFlightTime);
  assert.equal(shot.armedAfter, 0);
  assert.equal(g.player.hp, 88);
});

test('a normal moving dart preserves the flight minimum at the independently reproduced 144 Hz boundary', () => {
  for (const offset of [0, 8]) {
    registerMechaManifest({ schemaVersion: 1, entries: [] });
    const g = createGame(120201), events = [];
    g.mode = 'playing'; g.bossesDefeated = 2;
    g.nextWaveAt = g.nextBossAt = g.nextPickupAt = Infinity;
    Object.assign(g.player, { x: 70, y: 360, invincible: 0 });
    const combat = combatProfile('dart', 2);
    g.enemies = [{ id: 90, type: 'dart', x: 915.3862083387232 + offset,
      y: 360, baseY: 360, radius: combat.radius, hp: combat.hp, maxHp: combat.hp,
      speed: combat.speed * 1.14, phase: -2.1 * .9583333333333334,
      age: 0, angle: 0, attack: 0, fireCooldown: 0, combat }];
    for (let step = 0; step < 346; step++) {
      updateGame(g, 1 / 144, g.time >= .25 ? { x: 1 } : {});
      events.push(...consumeEvents(g));
      if (events.some(event => event.type === 'hit' && event.player)) break;
    }
    const lock = events.find(event => event.type === 'aimLock');
    const shots = events.filter(event => event.type === 'enemyShot').flatMap(event => event.shots);
    const hit = events.find(event => event.type === 'hit' && event.player);
    assert.ok(lock);
    if (offset === 0) {
      // Frozen prototype-02 damages HP here after only .645833 seconds.
      assert.ok(events.some(event => event.type === 'attackSkipped' && event.reason === 'minimum-flight-time'));
      assert.equal(shots.length, 0);
      assert.equal(hit, undefined);
      assert.equal(g.player.hp, 100);
    } else {
      // A nearby safe launch must still happen and inflict ordinary damage.
      assert.ok(hit); assert.equal(hit.sourceKind, 'projectile');
      const shot = shots.find(candidate => candidate.id === hit.bulletId);
      assert.ok(shot); assert.deepEqual(shot.lockedTarget, lock.lockedTarget);
      assert.ok(hit.simulationAt - shot.launchedAt >= g.difficulty.minimumFlightTime);
      assert.equal(g.player.hp, 88);
    }
  }
});
