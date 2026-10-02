import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame, startGame, updateGame, consumeEvents, worldToScreen, screenToWorld, PLAYER_HIT_RADIUS } from '../src/game.js';
import { registerMechaManifest, getMechaSpec, mechaAnchorWorld, mechaTransform } from '../src/mecha-art.js';
import { bossProfile, trialDifficulty } from '../src/level.js';

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

test('a route tail above the current camera still blocks aim as altitude motion brings it back', () => {
  const game = play();
  game.cameraY = 156;
  Object.assign(game.player, screenToWorld(game, { x: 220, y: 300 }), { invincible: 100 });
  const position = screenToWorld(game, { x: 960, y: 360 });
  const enemy = { id: 80, type: 'beetle', ...position, baseY: position.y, radius: 28, hp: 3,
    speed: 0, age: 0, phase: 0, fireCooldown: 0, attack: 0 };
  game.enemies.push(enemy);
  const tail = { id: 81, sourceId: 90, pattern: 'B04', ...screenToWorld(game, { x: 500, y: -10 }),
    vx: -20, vy: 0, radius: 5.5, age: 0, power: 12 };
  game.enemyBullets.push(tail);
  assert.ok(worldToScreen(game, tail).y < 20, 'the existing row begins outside the current danger view');
  updateGame(game, 1 / 120, { y: -1 });
  assert.equal(enemy.sequence, undefined, 'aim remains prohibited before camera re-entry');
  assert.ok(!consumeEvents(game).some(event => event.type === 'charge'));
  advance(game, 0.6, { y: -1 });
  assert.ok(game.enemyBullets.includes(tail), 'the route tail has not been culled');
  assert.ok(worldToScreen(game, tail).y > 20, 'normal altitude input brings the same tail back into view');
  assert.ok(!consumeEvents(game).some(event => event.type === 'charge'));
  tail.dead = true;
  updateGame(game, 1 / 120);
  assert.ok(enemy.locked, 'only removal of the actual tail permits the next aim tell');
});

test('apex opens only its authored windows and only an actual projected core hit gains damage', () => {
  // Synthetic anchor metadata is a test fixture, never a runtime art deliverable.
  const frame = { filename: 'fixture.png', muzzlesPixels: [{ x: 25, y: 75 }, { x: 25, y: 125 }],
    corePixels: { x: 100, y: 100, radius: 9 } };
  registerMechaManifest({ schemaVersion: 1, entries: [{ key: 'apex-fixture', roles: ['apex'],
    weakpointEnabled: true,
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

function anchoredTarget({ offset = 0, radius = 96, open = true, enabled = true, withOpenFrame = true } = {}) {
  const frame = { filename: 'fixture.png', muzzlesPixels: [{ x: 20, y: 100 }],
    corePixels: { x: 100 + offset, y: 100, radius: 9 } };
  registerMechaManifest({ schemaVersion: 1, entries: [{ key: 'apex-fixture', roles: ['apex'],
    weakpointEnabled: enabled, canvasWidth: 200, canvasHeight: 200, displayWidth: 200,
    pivotPixels: { x: 100, y: 100 }, frames: { idle: frame, ...(withOpenFrame ? { open: frame } : {}) } }] });
  const game = play();
  game.phase = 'boss'; game.bossesDefeated = 4;
  Object.assign(game.player, screenToWorld(game, { x: 220, y: 360 }), { invincible: 100 });
  const boss = { id: 100, type: 'boss', bossKind: 'apex', ...screenToWorld(game, { x: 1000, y: 360 }),
    radius, hp: 100, maxHp: 100, angle: 0, artAngle: 0, age: 0, attack: 0, fireCooldown: 100,
    armorOpen: open, coreVulnerable: open, coreOpenUntil: Infinity,
    motion: { x: 1000, centerY: 360, amplitude: 0, frequency: 0, bank: 0 } };
  game.boss = boss; game.enemies = [boss]; consumeEvents(game);
  return { game, boss };
}

test('a real traveling shot reaches an open central core before awarding its bonus', () => {
  for (const rate of [30, 60, 144]) {
    try {
      const { game, boss } = anchoredTarget();
      game.bullets.push({ id: 101, x: boss.x - 180, y: boss.y, vx: 1360, vy: 0, radius: 5,
        age: 0, power: 10, weaponMode: 'normal' });
      advance(game, 0.09, {}, 1 / rate);
      assert.equal(boss.hp, 100, 'predicted alignment or the broad body proxy does not award a premature core hit');
      assert.ok(!consumeEvents(game).some(event => event.type === 'hit'));
      advance(game, 0.07, {}, 1 / rate);
      const hits = consumeEvents(game).filter(event => event.type === 'hit' && !event.player);
      assert.equal(hits.length, 1);
      assert.equal(hits[0].coreHit, true);
      assert.equal(boss.hp, 88);
    } finally { registerMechaManifest({ schemaVersion: 1, entries: [] }); }
  }
});

test('a projected open core outside the body proxy still registers its actual first contact', () => {
  try {
    const { game, boss } = anchoredTarget({ offset: -65, radius: 30 });
    game.bullets.push({ id: 101, x: boss.x - 180, y: boss.y, vx: 1360, vy: 0, radius: 5,
      age: 0, power: 10, weaponMode: 'normal' });
    advance(game, 0.1);
    assert.equal(boss.hp, 88);
    const hits = consumeEvents(game).filter(event => event.type === 'hit' && !event.player);
    assert.equal(hits.length, 1);
    assert.equal(hits[0].coreHit, true);
    assert.ok(Math.abs(hits[0].x - boss.x + 65) < 16, 'contact occurs on the actual projected core');
  } finally { registerMechaManifest({ schemaVersion: 1, entries: [] }); }
});

test('closed armor, neutral markers, missing open states and off-core shots retain normal body damage', () => {
  for (const options of [{ open: false }, { enabled: false }, { withOpenFrame: false }, { offCore: 35 }]) {
    try {
      const { game, boss } = anchoredTarget(options);
      game.bullets.push({ id: 101, x: boss.x - 180, y: boss.y + (options.offCore || 0), vx: 1360, vy: 0,
        radius: 5, age: 0, power: 10, weaponMode: 'normal' });
      advance(game, 0.16);
      const hits = consumeEvents(game).filter(event => event.type === 'hit' && !event.player);
      assert.equal(hits.length, 1);
      assert.equal(hits[0].coreHit, false);
      assert.equal(boss.hp, 90);
    } finally { registerMechaManifest({ schemaVersion: 1, entries: [] }); }
  }
});

test('swept core contact cannot be skipped when both projectile endpoints miss the small circle', () => {
  try {
    const { game, boss } = anchoredTarget();
    // A stress projectile verifies geometry, not a new gameplay weapon speed.
    game.bullets.push({ id: 101, x: boss.x - 180, y: boss.y, vx: 400000, vy: 0, radius: 5,
      age: 0, power: 10, weaponMode: 'normal' });
    updateGame(game, 0.001);
    assert.equal(boss.hp, 88);
    const hit = consumeEvents(game).find(event => event.type === 'hit');
    assert.equal(hit.coreHit, true);
    assert.ok(Math.hypot(hit.x - boss.x, hit.y - boss.y) < 1, 'VFX anchors to contact, not the far endpoint');
  } finally { registerMechaManifest({ schemaVersion: 1, entries: [] }); }
});

test('charge and first release use their actual frame anchors when muzzle positions differ', () => {
  const frame = (x, y = 100) => ({ filename: 'fixture.png', muzzlesPixels: [{ x, y }], corePixels: { x: 100, y: 100, radius: 9 } });
  registerMechaManifest({ schemaVersion: 1, entries: [{ key: 'apex-fixture', roles: ['apex'], weakpointEnabled: true,
    canvasWidth: 200, canvasHeight: 200, displayWidth: 200, pivotPixels: { x: 100, y: 100 },
    frames: { idle: frame(20), charge: frame(30), open: frame(40), fire: frame(50) } }] });
  try {
    const game = bossGame(4), boss = game.boss;
    boss.fireCooldown = 0;
    updateGame(game, 1 / 120);
    const charge = consumeEvents(game).find(event => event.type === 'charge');
    assert.equal(getMechaSpec(boss).state, 'charge');
    const chargingPort = mechaAnchorWorld(boss, getMechaSpec(boss).runtimeMuzzles[0]);
    assert.ok(Math.hypot(charge.x - chargingPort.x, charge.y - chargingPort.y) < 1e-8);
    let release;
    for (let frameIndex = 0; frameIndex < 120 && !release; frameIndex++) {
      updateGame(game, 1 / 120);
      release = consumeEvents(game).find(event => event.type === 'enemyShot');
    }
    assert.ok(release);
    assert.equal(getMechaSpec(boss).state, 'fire');
    const firingPort = mechaAnchorWorld(boss, getMechaSpec(boss).runtimeMuzzles[0]);
    assert.ok(Math.hypot(release.x - firingPort.x, release.y - firingPort.y) < 1e-8);
    assert.deepEqual(release.launchMuzzles, [firingPort]);
  } finally { registerMechaManifest({ schemaVersion: 1, entries: [] }); }
});

test('a skipped unsafe aimed shot does not leave a false fire frame or launch event', () => {
  const frame = x => ({ filename: 'fixture.png', muzzlesPixels: [{ x, y: 100 }] });
  registerMechaManifest({ schemaVersion: 1, entries: [{ key: 'beetle-fixture', roles: ['beetle'], weakpointEnabled: false,
    canvasWidth: 200, canvasHeight: 200, displayWidth: 200, pivotPixels: { x: 100, y: 100 },
    frames: { idle: frame(20), charge: frame(30), fire: frame(50) } }] });
  try {
    const game = play();
    game.bossesDefeated = 1; game.aimCounter = 2; game.player.x = 378;
    const enemy = { id: 80, type: 'beetle', x: 600, y: 360, baseY: 360, radius: 28, hp: 3,
      speed: 0, age: 0, phase: 0, fireCooldown: 0, attack: 0 };
    game.enemies = [enemy];
    advance(game, 0.9);
    const events = consumeEvents(game);
    assert.ok(events.some(event => event.type === 'attackSkipped' && event.reason === 'minimum-flight-time'));
    assert.ok(!events.some(event => event.type === 'enemyShot'));
    assert.equal(enemy.fireFlash, 0);
    assert.equal(getMechaSpec(enemy).state, 'idle');
  } finally { registerMechaManifest({ schemaVersion: 1, entries: [] }); }
});

const actualManifest = JSON.parse(readFileSync(new URL('../assets/art/mecha-8h/manifest.json', import.meta.url), 'utf8'));
const actualBossKinds = ['warden', 'carrier', 'lancer', 'bastion', 'apex'];

function actualCoreTarget(kind, { open = true, angle = 0, flipX = 1, flipY = 1, moving = false } = {}) {
  const game = createGame(913733);
  startGame(game);
  advance(game, 1.2);
  game.nextWaveAt = game.nextBossAt = game.nextPickupAt = Infinity;
  game.player.invincible = 100;
  const victories = actualBossKinds.indexOf(kind), profile = bossProfile(victories);
  game.bossesDefeated = victories;
  game.difficulty = trialDifficulty(victories);
  game.phase = 'boss'; game.phaseTime = moving ? 0.35 : 0;
  const position = screenToWorld(game, { x: 1000, y: 360 });
  const boss = { id: 700, type: 'boss', bossKind: kind, ...position, baseY: position.y, radius: profile.radius,
    hp: 1000, maxHp: 1000, score: 3500, age: 0, angle, artAngle: angle, artFlipX: flipX, artFlipY: flipY,
    fireCooldown: 1e6, coreOpenUntil: Infinity, armorOpen: open, coreVulnerable: open,
    attack: 0, phase: 0, altitudeCenter: 360, locked: true, chargeDuration: 1e6, chargeTime: 1e6,
    motion: { x: 1000, centerY: 360, amplitude: moving ? 48 : 0, frequency: moving ? 5 : 0, bank: angle } };
  game.enemies = [boss]; game.boss = boss;
  consumeEvents(game);
  return { game, boss };
}

test('combat clear keeps actual fire and charge body poses, reflection and the original atlas angle', () => {
  registerMechaManifest(actualManifest);
  try {
    const actors = [
      ...['mantis', 'orb', 'claw', 'ray', 'needle'].map(type => ({ type, fireFlash: 0.12 })),
      ...actualManifest.entries.map(entry => ({ type: actualBossKinds.includes(entry.roles[0]) ? 'boss' : entry.roles[0],
        bossKind: entry.roles[0], telegraph: 0.8, escortShield: entry.roles[0] === 'carrier' })),
      { type: 'unregistered-fallback', artAngle: undefined },
    ];
    for (const actor of actors) {
      const game = play();
      Object.assign(game, { time: 45, nextBossAt: 45 });
      const enemy = { id: 700, ...screenToWorld(game, { x: 900, y: 360 }), radius: 38,
        hp: 3, maxHp: 3, angle: 0.17, artAngle: 0.17, artFlipX: -1, artFlipY: -1, ...actor };
      game.enemies = [enemy];
      game.enemyBullets = [{ id: 701, x: 900, y: 360, radius: 5, vx: -180, vy: 0, power: 8 }];
      const filename = getMechaSpec(enemy)?.filename, transform = mechaTransform(enemy);
      updateGame(game, 1 / 120);
      const clear = consumeEvents(game).find(event => event.type === 'combatClear');
      const ghost = { ...clear.enemies[0], telegraph: 0, flash: 0 };
      assert.equal(clear.duration, 0.2);
      assert.equal(getMechaSpec(ghost)?.filename, filename, `${actor.type}: visible pose is retained`);
      assert.deepEqual(mechaTransform(ghost), transform, `${actor.type}: model rotation and reflection are retained`);
      assert.equal(ghost.angle, enemy.angle, 'original atlas fallback retains its own angle');
      assert.equal(ghost.escortShield, enemy.escortShield);
      assert.ok(!game.enemies.some(actor => actor.id === 700), 'the ghost cannot collide or score');
      assert.ok(!game.enemyBullets.some(bullet => bullet.id === 701), 'cleared bullets cannot cause damage');
    }
  } finally { registerMechaManifest({ schemaVersion: 1, entries: [] }); }
});

test('actual open boss defeat ghosts retain their final pose while rewards and transition occur once', () => {
  registerMechaManifest(actualManifest);
  try {
    for (const kind of actualBossKinds) {
      const { game, boss } = actualCoreTarget(kind, { angle: 0.17, flipX: -1, flipY: -1 });
      const filename = getMechaSpec(boss).filename, transform = mechaTransform(boss), victories = game.bossesDefeated;
      boss.hp = 1;
      for (let index = 0; index < 3; index++) shotAt(game, boss, 10000);
      updateGame(game, 1 / 120);
      const events = consumeEvents(game), clear = events.find(event => event.type === 'combatClear');
      const ghost = { ...clear.enemies.find(enemy => enemy.type === 'boss'), telegraph: 0, flash: 0 };
      assert.equal(getMechaSpec(ghost).filename, filename, `${kind}: open armor stays open during the visual exit`);
      assert.deepEqual(mechaTransform(ghost), transform);
      assert.equal(clear.duration, 0.2);
      assert.equal(events.filter(event => event.type === 'combatClear').length, 1);
      assert.equal(events.filter(event => event.type === 'bossDefeated').length, 1);
      assert.equal(events.filter(event => event.type === 'hit' && !event.player).length, 1);
      assert.equal(game.bossesDefeated, victories + 1);
      assert.equal(game.phase, 'normal');
      assert.equal(game.enemies.length, 0);
      assert.equal(game.enemyBullets.length, 0);
      assert.ok(Math.abs(game.nextBossAt - game.time - 45) <= 1 / 120);
      const score = game.score;
      advance(game, 0.3);
      assert.equal(game.score, score, 'departed visual objects never score again');
      assert.ok(!consumeEvents(game).some(event => event.type === 'bossDefeated'));
    }
  } finally { registerMechaManifest({ schemaVersion: 1, entries: [] }); }
});

test('actual core contact keeps production damage and reflected previous poses at 20, 60 and 144Hz', () => {
  // Reflections are injected boundary fixtures; current spawns do not add this content.
  registerMechaManifest(actualManifest);
  try {
    for (const kind of actualBossKinds) for (const rate of [20, 60, 144]) for (const angle of [-0.18, 0, 0.18]) {
      for (const mode of ['open', 'closed', 'off-core', 'reflected']) {
        const { game, boss } = actualCoreTarget(kind, { open: mode !== 'closed', angle,
          flipX: mode === 'reflected' ? -1 : 1, flipY: mode === 'reflected' ? -1 : 1 });
        const core = mechaAnchorWorld(boss, getMechaSpec(boss).runtimeCore);
        game.bullets.push({ id: 800, x: core.x - 180, y: core.y + (mode === 'off-core' ? 40 : 0),
          vx: 1360, vy: 0, radius: 5, age: 0, power: 10, weaponMode: 'normal' });
        advance(game, 0.25, {}, 1 / rate);
        const hits = consumeEvents(game).filter(event => event.type === 'hit' && !event.player);
        const expected = mode === 'closed' || mode === 'off-core' ? 10 : 12, label = `${kind}/${rate}/${angle}/${mode}`;
        assert.equal(hits.length, 1, label);
        assert.ok(Math.abs(1000 - boss.hp - expected) < 1e-7, `${label}: actual core bonus only`);
        assert.equal(hits[0].coreHit, expected === 12, label);
      }
    }
  } finally { registerMechaManifest({ schemaVersion: 1, entries: [] }); }
});

test('moving actual cores retain their previous reflected pose during a swept crossing', () => {
  registerMechaManifest(actualManifest);
  try {
    for (const kind of actualBossKinds) for (const [flipX, flipY] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const { game, boss } = actualCoreTarget(kind, { angle: 0.18, flipX, flipY, moving: true }), dt = 0.001;
      const previous = mechaAnchorWorld(boss, getMechaSpec(boss).runtimeCore), forecast = structuredClone(game);
      updateGame(forecast, dt);
      const next = mechaAnchorWorld(forecast.boss, getMechaSpec(forecast.boss).runtimeCore);
      assert.ok(Math.hypot(next.x - previous.x, next.y - previous.y) > 1, 'the projected core actually moves');
      // A geometry stress shot starts and ends outside the circle. It is not a new gameplay speed.
      game.bullets.push({ id: 800, x: previous.x - 160, y: previous.y,
        vx: (next.x - previous.x + 320) / dt, vy: (next.y - previous.y) / dt,
        radius: 5, age: 0, power: 10, weaponMode: 'normal' });
      updateGame(game, dt);
      const hits = consumeEvents(game).filter(event => event.type === 'hit' && !event.player);
      assert.equal(hits.length, 1, `${kind}/${flipX}/${flipY}`);
      assert.equal(hits[0].coreHit, true);
      assert.equal(boss.hp, 988);
    }
  } finally { registerMechaManifest({ schemaVersion: 1, entries: [] }); }
});
