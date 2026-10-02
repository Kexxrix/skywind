import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, startGame, updateGame, consumeEvents, worldToScreen, screenToWorld, PLAYER_HIT_RADIUS } from '../src/game.js';
import { registerMechaManifest, getMechaSpec, mechaAnchorWorld } from '../src/mecha-art.js';

function play(seed = 82615) {
  const game = createGame(seed);
  startGame(game);
  game.mode = 'playing';
  Object.assign(game.player, { x: 220, y: 360, invincible: 0 });
  game.nextWaveAt = game.nextBossAt = game.nextPickupAt = Infinity;
  consumeEvents(game);
  return game;
}

function advance(game, duration, input = {}, frame = 1 / 60) {
  for (let elapsed = 0; elapsed < duration - 1e-9; elapsed += frame) {
    updateGame(game, Math.min(frame, duration - elapsed), input);
  }
}

const combatState = game => Object.fromEntries(['mode', 'time', 'rng', 'nextId', 'stage', 'cycle',
  'cameraY', 'flightAltitude', 'player', 'enemies', 'bullets', 'enemyBullets', 'pickups', 'supply', 'score',
  'tensionTime', 'bossesDefeated', 'phase', 'normalTime', 'nextBossAt', 'nextPickupAt'].map(key => [key, game[key]]));

test('title waiting and backdrop clocks cannot alter the same seeded combat replay', () => {
  const games = [createGame(56924), createGame(56924)];
  Object.assign(games[1], { sceneTime: 137, scrollTime: 920, altitude: 0.1, targetAltitude: 0.2 });
  for (const game of games) startGame(game);
  for (let frame = 0; frame < 60 * 22; frame++) {
    const input = { shoot: true, y: Math.sin(frame / 95) * 0.28, x: Math.cos(frame / 180) * 0.15 };
    for (const game of games) updateGame(game, 1 / 60, input);
  }
  assert.deepEqual(combatState(games[0]), combatState(games[1]));
  assert.notEqual(games[0].sceneTime, games[1].sceneTime, 'the artistic backdrop still retains its clock');
});

test('a vertical dodge responds within 100ms and reverses without a long inertial slide', () => {
  const game = play();
  advance(game, 0.1, { y: 1 });
  assert.ok(game.player.vy > 440, 'at least 90% of vertical speed responds within 100ms');
  const turningY = game.player.y;
  advance(game, 0.05, { y: -1 });
  assert.ok(game.player.vy < 0, 'the opposite dodge has begun within 50ms');
  assert.ok(game.player.y - turningY < 8, 'turning overshoot stays smaller than a graze margin');
  assert.equal(game.player.radius, PLAYER_HIT_RADIUS);
  assert.equal(game.player.hp, 100);
});

test('released movement settles promptly while top speed and flight core stay unchanged', () => {
  const game = play();
  advance(game, 0.5, { y: 1, x: 1 });
  assert.ok(game.player.vx <= 225 && game.player.vy <= 490);
  advance(game, 0.12);
  assert.ok(Math.abs(game.player.vx) < 13);
  assert.ok(Math.abs(game.player.vy) < 14);
  assert.equal(game.player.radius, 1.85);
});

test('10, 30, 60 and 144Hz preserve weapon expiry and combat time', () => {
  for (const rate of [10, 30, 60, 144]) {
    const game = play();
    game.player.powerTime = 3.4;
    game.player.droneTime = 2.7;
    advance(game, 3.5, {}, 1 / rate);
    assert.ok(Math.abs(game.time - 3.5) < 1e-8, `${rate}Hz keeps elapsed game time`);
    assert.equal(game.player.powerTime, 0);
    assert.equal(game.player.droneTime, 0);
    assert.equal(consumeEvents(game).filter(event => event.type === 'weaponExpired').length, 2);
  }
});

function bossGame(victories) {
  const game = play();
  game.bossesDefeated = victories;
  game.nextBossAt = 0;
  game.player.invincible = 100;
  updateGame(game, 1 / 120);
  advance(game, 1.21);
  consumeEvents(game);
  return game;
}

function shotAt(game, point, power = 10) {
  game.bullets.push({ id: game.nextId++, x: point.x, y: point.y, vx: 0, vy: 0, age: 0,
    radius: 5, power, weaponMode: 'normal' });
}

test('carrier enters with two targetable forward escorts whose destruction removes partial armor', () => {
  const game = bossGame(1), boss = game.boss;
  const escorts = game.enemies.filter(enemy => enemy.escort);
  assert.equal(escorts.length, 2);
  assert.deepEqual(escorts.map(enemy => enemy.escortSlot).sort(), [0, 1]);
  assert.ok(escorts.every(enemy => worldToScreen(game, enemy).x < worldToScreen(game, boss).x - 100));
  const originalHP = boss.hp;
  shotAt(game, boss);
  updateGame(game, 1 / 120);
  assert.ok(Math.abs(boss.hp - (originalHP - 7)) < 1e-8, 'shield is partial protection, never invulnerability');
  for (const escort of escorts) shotAt(game, escort, 100);
  updateGame(game, 1 / 120);
  assert.equal(game.enemies.filter(enemy => enemy.escort).length, 0);
  assert.equal(game.combo, 0, 'zero-score escorts cannot farm a combo');
  shotAt(game, boss);
  updateGame(game, 1 / 120);
  assert.ok(Math.abs(boss.hp - (originalHP - 17)) < 1e-8, 'destroying both escorts restores normal damage');
});

test('lancer reacts to altitude between attacks and uses both physical ports in crossfire', () => {
  const high = bossGame(2), low = bossGame(2);
  for (const [game, y] of [[high, 120], [low, 600]]) {
    Object.assign(game.player, screenToWorld(game, { x: 220, y }));
    game.boss.fireCooldown = 100;
    advance(game, 0.25);
  }
  assert.ok(worldToScreen(high, high.boss).y > worldToScreen(low, low.boss).y + 30,
    'the boss prepositions against the player altitude instead of only changing its HP');
  high.boss.fireCooldown = 0;
  updateGame(high, 1 / 120);
  assert.equal(high.boss.attackName, 'B02');
  assert.deepEqual([...new Set(high.boss.sequence.bundles.map(bundle => bundle.port))].sort(), [0, 1]);
  assert.equal(high.boss.muzzles.length, 2);
});

test('bastion discloses its ordered gate route before any gate bullet is released', () => {
  const game = bossGame(3);
  game.boss.fireCooldown = 0;
  updateGame(game, 1 / 120);
  const cue = consumeEvents(game).find(event => event.type === 'charge');
  assert.equal(cue.bossKind, 'bastion');
  assert.equal(cue.attackName, 'B05');
  assert.deepEqual(cue.routeLanes, [240, 330, 240]);
  assert.ok(cue.duration >= 1.05);
  assert.equal(game.enemyBullets.length, 0);
});

test('an aimed source waits for the last moving-route bullet to leave the player corridor', () => {
  const game = play();
  const enemy = { id: 80, type: 'beetle', x: 960, y: 360, baseY: 360, radius: 28, hp: 3,
    speed: 0, age: 0, phase: 0, fireCooldown: 0, attack: 0 };
  game.enemies.push(enemy);
  const tail = { id: 81, sourceId: 90, pattern: 'B05', ...screenToWorld(game, { x: 500, y: 400 }),
    vx: -150, vy: 0, radius: 5.5, age: 0, power: 12 };
  game.enemyBullets.push(tail);
  updateGame(game, 1 / 120);
  assert.equal(enemy.sequence, undefined);
  assert.ok(!consumeEvents(game).some(event => event.type === 'charge'));
  tail.dead = true;
  updateGame(game, 1 / 120);
  assert.equal(enemy.attackName, 'aim');
  assert.ok(enemy.locked);
});

test('apex opens only its authored windows and only an actual projected core hit gains damage', () => {
  // Synthetic anchor metadata is a test fixture, never a runtime art deliverable.
  const frame = { filename: 'fixture.png', muzzlesPixels: [{ x: 25, y: 75 }, { x: 25, y: 125 }],
    corePixels: { x: 100, y: 100, radius: 9 } };
  registerMechaManifest({ schemaVersion: 1, entries: [{ key: 'apex-fixture', roles: ['apex'],
    canvasWidth: 200, canvasHeight: 200, displayWidth: 200, pivotPixels: { x: 100, y: 100 },
    frames: { idle: frame, charge: frame, open: frame } }] });
  try {
    const game = bossGame(4), boss = game.boss;
    boss.attack = 2; boss.fireCooldown = 0;
    advance(game, 0.85);
    assert.equal(boss.attackName, 'B03');
    assert.equal(boss.coreVulnerable, true);
    const opening = consumeEvents(game).filter(event => event.type === 'coreOpen');
    assert.equal(opening.length, 1);
    const originalHP = boss.hp;
    shotAt(game, mechaAnchorWorld(boss, getMechaSpec(boss).runtimeCore));
    updateGame(game, 1 / 120);
    assert.ok(Math.abs(boss.hp - (originalHP - 12)) < 1e-8);
    assert.ok(consumeEvents(game).some(event => event.type === 'hit' && event.coreHit));
    shotAt(game, { x: boss.x, y: boss.y + 35 });
    updateGame(game, 1 / 120);
    assert.ok(Math.abs(boss.hp - (originalHP - 22)) < 1e-8);
    assert.ok(consumeEvents(game).some(event => event.type === 'hit' && !event.coreHit));
    boss.attack = 0; boss.sequence = null; boss.locked = false; boss.coreOpenUntil = 0; boss.fireCooldown = 0;
    game.enemyBullets = [];
    updateGame(game, 1 / 120);
    assert.equal(boss.attackName, 'B01');
    assert.equal(boss.coreVulnerable, false);
  } finally { registerMechaManifest({ schemaVersion: 1, entries: [] }); }
});
