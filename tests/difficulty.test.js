import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, startGame, updateGame, consumeEvents, difficultyAt, cameraRoll, worldToScreen, screenToWorld, ENEMY_TYPES, BOSS_KINDS } from '../src/game.js';
import { Renderer } from '../src/renderer.js';

function playable(time = 0) {
  const game = createGame(74912);
  startGame(game);
  game.mode = 'playing';
  game.time = time;
  game.player.x = 220;
  game.player.invincible = 1000;
  game.nextWaveAt = Infinity;
  game.nextBossAt = Infinity;
  game.nextPickupAt = Infinity;
  consumeEvents(game);
  return game;
}

function emitter(id, type = 'beetle') {
  return { id, type, x: 1000, y: 360, baseY: 360, radius: 28, hp: 999, maxHp: 999,
    speed: 0, phase: 0, age: 0, fireCooldown: 0, attack: 0, attackAngle: Math.PI,
    telegraph: 0, chargeTime: 0, locked: false, dashTime: 0, dead: false };
}

const active = game => game.enemies.filter(e => !e.dead && (e.locked || e.dashTime > 0 || e.attackActiveUntil > game.time));

test('combat phases add sources gradually and preserve scenery speed regardless of boss victories', () => {
  for (const [time, count] of [[0, 1], [30, 1], [59.99, 1], [60, 2], [179.99, 2], [180, 3], [299.99, 3], [300, 4], [420, 5], [7200, 5]]) {
    const d = difficultyAt(time, 50);
    assert.equal(d.maxAttackers, count, `time ${time}`);
    assert.equal(d.scrollSpeed, 1.3 + Math.min(1.3, time / 95));
    assert.equal(d.hpBonus, Math.min(2, Math.floor(time / 180)));
    assert.ok(d.maxEnemies <= 14 && d.maxBulletSpeed <= 330 && d.maxPatternBullets <= 16);
    assert.equal(d.waveInterval, difficultyAt(time).waveInterval, 'boss victories do not multiply spawn pressure');
  }
  assert.ok(difficultyAt(30).waveInterval > difficultyAt(0).waveInterval * 0.9);
  assert.ok(difficultyAt(60).enemySpeed <= 1.1);
});

test('ready enemies share the phase source cap across charge, release and its short reservation', () => {
  for (const time of [0, 60, 180, 300, 420]) {
    const game = playable(time);
    game.enemies = Array.from({ length: 14 }, (_, index) => emitter(index + 1));
    let fired = 0;
    for (let step = 0; step < 90; step += 1) {
      updateGame(game, 1 / 120);
      const shots = consumeEvents(game).filter(event => event.type === 'enemyShot');
      fired += shots.length;
      assert.ok(shots.length <= game.difficulty.maxAttackers);
      assert.ok(active(game).length <= game.difficulty.maxAttackers);
    }
    assert.equal(fired, difficultyAt(time).maxAttackers, `time ${time}: other emitters wait after release`);
  }
});

test('opening regular attacks remain a single shot or a told dive despite the old stage counter', () => {
  for (const type of ENEMY_TYPES) {
    const game = playable(55);
    game.enemies = [emitter(1, type)];
    for (let step = 0; step < 110; step += 1) updateGame(game, 1 / 120);
    const events = consumeEvents(game).filter(event => event.type === 'enemyShot');
    assert.equal(events.length, 1, type);
    assert.equal(events[0].bulletCount, type === 'wasp' ? 0 : 1, type);
  }
});

test('all boss patterns retain phase bullet and speed caps including their secondary emitters', () => {
  for (const time of [60, 180, 300, 420]) {
    for (let kind = 0; kind < BOSS_KINDS.length; kind += 1) {
      for (let pattern = 0; pattern < 3; pattern += 1) {
        const game = playable(time);
        game.bossesDefeated = kind;
        game.nextBossAt = 0;
        updateGame(game, 1 / 120);
        Object.assign(game.boss, { x: 1040, fireCooldown: 0, attack: pattern });
        consumeEvents(game);
        for (let step = 0; step < 135; step += 1) updateGame(game, 1 / 120);
        const shots = consumeEvents(game).filter(event => event.type === 'enemyShot' && event.boss);
        assert.equal(shots.length, 1, `${time} ${BOSS_KINDS[kind]} ${pattern}`);
        assert.ok(shots[0].bulletCount <= game.difficulty.maxPatternBullets);
        assert.ok(game.enemyBullets.every(bullet => Math.hypot(bullet.vx, bullet.vy) <= game.difficulty.maxBulletSpeed + 1e-6));
        assert.ok(game.enemies.length <= game.difficulty.maxEnemies);
      }
    }
  }
});

test('24 seconds of combat are followed by six seconds without new waves or attack starts', () => {
  for (let start = 60; start <= 270; start += 30) {
    assert.equal(difficultyAt(start + 23.99).recovery, false);
    assert.equal(difficultyAt(start + 24).recovery, true);
    assert.equal(difficultyAt(start + 29.99).recovery, true);
    assert.equal(difficultyAt(start + 30).recovery, false);
  }
  const game = playable(84);
  game.nextWaveAt = 0;
  game.enemies = [emitter(1)];
  game.enemyBullets.push({ id: 2, x: 900, y: 360, vx: -10, vy: 0, age: 0, radius: 5, power: 12 });
  updateGame(game, 0.1);
  assert.equal(game.enemies.length, 1);
  assert.equal(game.enemies[0].locked, false);
  assert.equal(game.enemyBullets.length, 1, 'recovery leaves existing bullets moving');
  assert.ok(game.enemyBullets[0].x < 900);
  assert.ok(!consumeEvents(game).some(event => event.type === 'wave' || event.type === 'enemyShot'));
  Object.assign(game.enemies[0], { locked: true, chargeDuration: 0.34, chargeTime: 0.01 });
  updateGame(game, 0.02);
  assert.ok(consumeEvents(game).some(event => event.type === 'enemyShot'), 'an already announced attack finishes');
});

test('a boss waits for population room, and default opening keeps the unchanged first pickup schedule', () => {
  const full = playable(120);
  full.enemies = Array.from({ length: difficultyAt(120).maxEnemies }, (_, index) => emitter(index + 1));
  full.nextBossAt = 0;
  updateGame(full, 1 / 120);
  assert.equal(full.boss, null);
  full.enemies.pop();
  updateGame(full, 1 / 120);
  assert.equal(full.boss.type, 'boss');
  assert.equal(full.enemies.length, full.difficulty.maxEnemies);

  const game = createGame(74912);
  startGame(game);
  assert.equal(game.nextBossAt, 120);
  assert.equal(game.nextPickupAt, 3);
  for (let step = 0; step < 361; step += 1) updateGame(game, 1 / 120);
  assert.ok(game.pickups.some(item => item.type === 'power'));
  assert.ok(game.nextPickupAt >= 13 && game.nextPickupAt < 13.02);
});

test('five minute invincible load replay obeys bodies, attack sources, active bullets and speed limits', () => {
  const game = createGame(74912);
  startGame(game);
  for (let step = 0; step < 300 * 120; step += 1) {
    game.player.invincible = 2; // Load observation only; this does not test survival balance.
    updateGame(game, 1 / 120, { x: 0, y: Math.sin(step / 240) * 0.2, shoot: true });
    assert.ok(game.enemies.length <= game.difficulty.maxEnemies, `bodies at ${game.time}`);
    assert.ok(active(game).length <= game.difficulty.maxAttackers, `sources at ${game.time}`);
    assert.ok(game.enemyBullets.length <= game.difficulty.maxEnemyBullets, `bullets at ${game.time}`);
    assert.ok(game.enemyBullets.every(b => Math.hypot(b.vx, b.vy) <= game.difficulty.maxBulletSpeed + 1e-6));
    consumeEvents(game);
  }
  assert.ok(Math.abs(game.time - 300) < 1e-6);
});

test('an enemy projected beyond the right edge cannot begin or finish a hidden attack', () => {
  for (const locked of [false, true]) {
    const game = playable();
    game.sceneTime = 3 * Math.PI / (2 * 0.18);
    game.altitude = 0;
    game.cameraY = 156;
    Object.assign(game.player, screenToWorld(game, { x: 220, y: 672 }));
    const enemy = Object.assign(emitter(99, 'dragonfly'), { x: 1225, y: 960, baseY: 960, radius: 18, locked, chargeTime: 0, chargeDuration: 0.34 });
    game.enemies = [enemy];
    updateGame(game, 1 / 120, { y: 1 });
    assert.ok(worldToScreen(game, enemy).x > 1280 + 44, 'entire 88px sprite is outside the view');
    assert.equal(enemy.locked, false);
    assert.equal(enemy.telegraph, 0);
    assert.ok(!consumeEvents(game).some(event => event.type === 'enemyShot'));
  }
});

test('a pickup keeps moving across the visible lower left corner until its projected exit', () => {
  const game = playable();
  game.sceneTime = 3 * Math.PI / (2 * 0.18);
  game.altitude = 0;
  game.cameraY = 156;
  Object.assign(game.player, screenToWorld(game, { x: 220, y: 672 }));
  game.pickups = [{ id: 99, type: 'power', x: -59, y: 650, baseY: 650, radius: 22, age: 0, phase: 0 }];
  updateGame(game, 1 / 120, { y: 1 });
  assert.equal(game.pickups.length, 1);
  assert.ok(worldToScreen(game, game.pickups[0]).x > 30, 'the visible icon is preserved past world x=-60');
  game.pickups[0].x = -250;
  updateGame(game, 1 / 120, { y: 1 });
  assert.equal(game.pickups.length, 0, 'the pickup is removed after its projected left margin');
});

test('carrier walls cycle three viewport lanes and match their rendered tell at both camera extremes', () => {
  for (const cameraY of [-156, 156]) {
    const game = playable(180);
    game.bossesDefeated = 1;
    game.nextBossAt = 0;
    updateGame(game, 1 / 120);
    const boss = game.boss;
    const direction = Math.sign(cameraY);
    for (const [attack, safeLane] of [[0, 160], [3, 350], [6, 540]]) {
      game.sceneTime = 0;
      game.altitude = direction < 0 ? 1 : 0;
      game.cameraY = cameraY;
      Object.assign(game.player, screenToWorld(game, { x: 220, y: direction < 0 ? 48 : 672 }));
      Object.assign(boss, { x: 1035, age: Math.PI / (2 * 0.42), attack, locked: false, fireCooldown: 0, dashTime: 0 });
      game.enemies = [boss];
      game.enemyBullets = [];
      consumeEvents(game);
      updateGame(game, 1 / 120, { y: direction });
      assert.equal(boss.locked, true);
      assert.equal(boss.safeLane, safeLane);

      // Read drawThreats' actual polygon vertices without constructing a browser renderer.
      const polygons = [];
      let path = [];
      const context = {
        save() {}, restore() {}, setLineDash() {}, beginPath() { path = []; }, closePath() {},
        moveTo(x, y) { path.push({ x, y }); }, lineTo(x, y) { path.push({ x, y }); },
        fill() { polygons.push(path); }, stroke() {},
      };
      Renderer.prototype.drawThreats.call({ glow() {} }, context, game);
      const projected = polygons[0].map(point => worldToScreen(game, point));
      const expected = [{ x: 0, y: safeLane - 90 }, { x: 1280, y: safeLane - 90 }, { x: 1280, y: safeLane + 90 }, { x: 0, y: safeLane + 90 }];
      projected.forEach((point, index) => assert.ok(Math.hypot(point.x - expected[index].x, point.y - expected[index].y) < 1e-6));

      let fired = false;
      for (let step = 0; step < 150 && !fired; step += 1) {
        updateGame(game, 1 / 120, { y: direction });
        fired = consumeEvents(game).some(event => event.type === 'enemyShot' && event.boss);
      }
      assert.equal(fired, true);
      const wall = game.enemyBullets.filter(bullet => bullet.sourceId === boss.id);
      const rows = wall.map(bullet => worldToScreen(game, bullet).y);
      assert.ok(rows.every(y => Math.abs(y - safeLane) >= 90 - 1e-6));
      assert.ok(Math.min(...rows) <= 30.001 && Math.max(...rows) >= 669.999, 'wall spans current top and bottom');
      for (const bullet of wall) {
        const roll = cameraRoll(game);
        assert.ok(Math.abs(bullet.vx * Math.sin(roll) + bullet.vy * Math.cos(roll)) < 1e-6, 'new wall travels horizontally in the projected view');
      }
    }
  }
});

test('all four bosses keep their normal vertical path visible for thirty seconds at either camera extreme', () => {
  const radii = [92, 95, 78, 90];
  for (const direction of [-1, 1]) {
    for (let kind = 0; kind < BOSS_KINDS.length; kind += 1) {
      const game = playable(170);
      for (let step = 0; step < 1200; step += 1) updateGame(game, 1 / 120, { y: direction });
      game.bossesDefeated = kind;
      game.nextBossAt = 0;
      let shots = 0, sawDash = false;
      consumeEvents(game);
      for (let step = 0; step < 30 * 120; step += 1) {
        updateGame(game, 1 / 120, { y: direction });
        const boss = game.boss;
        assert.equal(boss.radius, radii[kind]);
        assert.equal(boss.speed, 75);
        const screen = worldToScreen(game, boss);
        assert.ok(screen.y - boss.radius >= 50 && screen.y + boss.radius <= 670, `${BOSS_KINDS[kind]} at ${game.time}, camera ${game.cameraY}: ${screen.y}`);
        sawDash ||= boss.dashTime > 0;
        shots += consumeEvents(game).filter(event => event.type === 'enemyShot' && event.boss).length;
      }
      assert.ok(shots >= 3, `${BOSS_KINDS[kind]} must keep its attack loop available`);
      if (BOSS_KINDS[kind] === 'leviathan') assert.equal(sawDash, true, 'the normal surge remains in the visible corridor');
      assert.ok(Math.abs(game.cameraY - direction * 156) < 1e-6);
    }
  }
});
