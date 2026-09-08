import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, startGame, updateGame, consumeEvents, cameraRoll, playerMuzzle, playerHeading, difficultyAt, screenToWorld, worldToScreen, ENEMY_TYPES, BOSS_KINDS, MAX_ENEMY_BULLET_SPEED } from '../src/game.js';

function playable(seed = 12) {
  const game = createGame(seed);
  startGame(game);
  game.mode = 'playing';
  game.player.x = 220;
  game.player.invincible = 0;
  game.nextWaveAt = Infinity;
  game.nextBossAt = Infinity;
  game.nextPickupAt = Infinity;
  consumeEvents(game);
  return game;
}

function advance(game, seconds, input = {}) {
  for (let elapsed = 0; elapsed < seconds - 1e-8; elapsed += 1 / 60) {
    updateGame(game, Math.min(1 / 60, seconds - elapsed), input);
  }
}

function hostileBullet(game, power = 13) {
  return { x: game.player.x, y: game.player.y, vx: 0, vy: 0, radius: 6, power, age: 0 };
}

test('title remains empty; start animates the ship in before play', () => {
  const game = createGame();
  advance(game, 2, { shoot: true });
  assert.equal(game.mode, 'title');
  assert.equal(game.bullets.length, 0);
  startGame(game);
  advance(game, 0.5);
  assert.equal(game.mode, 'entering');
  assert.ok(game.player.x > -160 && game.player.x < 220);
  advance(game, 0.8);
  assert.equal(game.mode, 'playing');
  assert.ok(Math.abs(game.player.x - 220) < 1e-8);
});

test('damage is bounded by invulnerability; zero HP freezes game and emits one gameover', () => {
  const game = playable();
  game.player.hp = 20;
  game.enemyBullets.push(hostileBullet(game), hostileBullet(game));
  updateGame(game, 1 / 60);
  assert.equal(game.player.hp, 7);
  game.player.invincible = 0;
  game.enemyBullets.push(hostileBullet(game));
  updateGame(game, 1 / 60);
  assert.equal(game.player.hp, 0);
  assert.equal(game.mode, 'gameover');
  const time = game.time;
  const sceneTime = game.sceneTime;
  advance(game, 2, { shoot: true, x: 1 });
  assert.equal(game.time, time);
  assert.equal(game.sceneTime, sceneTime);
  assert.equal(consumeEvents(game).filter(event => event.type === 'gameover').length, 1);
});

test('health pickups cap at maximum HP and are collected only once', () => {
  const game = playable();
  game.player.hp = 87;
  game.pickups.push({ x: 220, y: 360, baseY: 360, radius: 22, type: 'health', phase: 0 });
  updateGame(game, 1 / 60);
  assert.equal(game.player.hp, 100);
  assert.equal(game.score, 50);
  assert.equal(game.pickups.length, 0);
  advance(game, 0.5);
  assert.equal(game.score, 50);
});

test('power lasts eighteen seconds, changes the projectile pattern, then expires', () => {
  const game = playable();
  updateGame(game, 1 / 120, { shoot: true });
  assert.equal(game.bullets.length, 2);
  game.bullets = [];
  game.pickups.push({ x: 220, y: 360, baseY: 360, radius: 22, type: 'power', phase: 0 });
  updateGame(game, 1 / 120);
  assert.equal(game.player.powerTime, 18);
  game.player.fireCooldown = 0;
  updateGame(game, 1 / 120, { shoot: true });
  assert.equal(game.bullets.length, 5);
  assert.ok(game.bullets.every(bullet => bullet.power === 2));
  assert.ok(game.bullets.some(bullet => bullet.vy < 0));
  assert.ok(game.bullets.some(bullet => bullet.vy > 0));
  advance(game, 18.1);
  assert.equal(game.player.powerTime, 0);
  game.bullets = [];
  game.player.fireCooldown = 0;
  updateGame(game, 1 / 120, { shoot: true });
  assert.equal(game.bullets.length, 2);
});

test('destroying an enemy awards score exactly once even when two shots overlap', () => {
  const game = playable();
  game.enemies.push({ id: 123, type: 'beetle', x: 500, y: 360, baseY: 360, radius: 28, hp: 1, maxHp: 1, speed: 0, score: 175, fireCooldown: 10 });
  game.bullets.push(
    { x: 500, y: 360, vx: 0, vy: 0, radius: 5, power: 1 },
    { x: 500, y: 360, vx: 0, vy: 0, radius: 5, power: 1 },
  );
  updateGame(game, 1 / 120);
  assert.equal(game.score, 175);
  assert.equal(game.enemies.length, 0);
  assert.equal(game.combo, 1);
  assert.equal(consumeEvents(game).filter(event => event.type === 'explosion').length, 1);
});

test('normal combat reaches the first boss at 45 seconds and only victories raise its cycle', () => {
  const game = playable();
  game.nextBossAt = createGame().nextBossAt;
  assert.equal(game.nextBossAt, 45);
  advance(game, 44.9);
  assert.equal(game.stage, 1);
  assert.equal(game.boss, null);
  assert.ok(Math.abs(game.backgroundSpeed - 2.2) < 1e-8);
  advance(game, 0.2);
  assert.equal(game.boss.bossKind, 'warden');
  assert.equal(game.boss.maxHp, 420);
  assert.equal(game.phase, 'boss-entry');
});

test('defeating a vulnerable boss clears combat once and starts the next full normal segment', () => {
  const game = playable();
  game.nextBossAt = 0;
  updateGame(game, 1 / 120);
  advance(game, 1.21);
  const boss = game.boss;
  boss.hp = 1;
  game.bullets.push({ x: boss.x, y: boss.y, vx: 0, vy: 0, radius: 50, power: 2 });
  game.enemyBullets.push({ x: 600, y: 600, vx: -80, vy: 0, radius: 6, power: 20 });
  updateGame(game, 1 / 120);
  assert.equal(game.boss, null);
  assert.equal(game.bossesDefeated, 1);
  assert.equal(game.enemyBullets.length, 0);
  assert.equal(game.score, 3500);
  assert.deepEqual(game.pickups.map(item => item.type), ['health']);
  assert.equal(game.nextBossAt, game.time + 45);
  assert.equal(game.phase, 'normal');
});

test('horizontal acceleration is gentler than vertical and diagonal input preserves each axis', () => {
  const horizontal = playable();
  const diagonal = playable();
  updateGame(horizontal, 0.1, { x: 1 });
  updateGame(diagonal, 0.1, { x: 1, y: 1 });
  assert.ok(Math.abs(horizontal.player.x - diagonal.player.x) < 1e-6);
  assert.ok(diagonal.player.y - 360 > (horizontal.player.x - 220) * 2);
  assert.ok(horizontal.player.vx > 0 && horizontal.player.vx < 225);
});

test('same seed and input replay produce identical simulation state', () => {
  const a = createGame(55);
  const b = createGame(55);
  startGame(a);
  startGame(b);
  for (let frame = 0; frame < 1200; frame += 1) {
    const input = { shoot: true, y: Math.sin(frame / 120) * 0.2 };
    updateGame(a, 1 / 60, input);
    updateGame(b, 1 / 60, input);
  }
  assert.deepEqual(a, b);
});

test('restarting resets gameplay without resetting the animated backdrop clock', () => {
  const game = playable();
  advance(game, 3, { shoot: true });
  game.score = 4000;
  game.player.hp = 1;
  game.mode = 'gameover';
  const sceneTime = game.sceneTime;
  startGame(game);
  assert.equal(game.mode, 'entering');
  assert.equal(game.score, 0);
  assert.equal(game.player.hp, 100);
  assert.equal(game.bullets.length, 0);
  assert.equal(game.sceneTime, sceneTime);
});

function gameWithWorm() {
  const game = playable();
  game.normalTime = 23; game.patternSection = 'B03';
  game.nextWaveAt = 0;
  updateGame(game, 1 / 120);
  const worm = game.enemies.find(enemy => enemy.type === 'worm');
  Object.assign(worm, { x: 270, y: 360, baseY: 360, phase: 0, age: 0, speed: 0, fireCooldown: 10 });
  worm.pattern = null;
  game.enemies = [worm];
  game.nextWaveAt = Infinity;
  return { game, worm };
}

test('both ends of the visible worm body register shots and player contact', () => {
  for (const offset of [-58, 66]) {
    const { game, worm } = gameWithWorm();
    const hp = worm.hp;
    game.bullets.push({ x: worm.x + offset, y: worm.y - 7, vx: 0, vy: 0, radius: 5, power: 1 });
    // The small player core must lie on the actual rotated body, not its old hull margin.
    const c = Math.cos(worm.angle), s = Math.sin(worm.angle);
    game.player.x = worm.x + offset * c + 7 * s;
    game.player.y = worm.y + offset * s - 7 * c;
    updateGame(game, 1 / 120);
    assert.equal(worm.hp, hp - 1, `shot at body x=${offset}`);
    assert.equal(game.player.hp, 78, `contact at body x=${offset}`);
  }
});

test('the empty band below the worm body does not register shots or contact', () => {
  const { game, worm } = gameWithWorm();
  const hp = worm.hp;
  game.bullets.push({ x: worm.x, y: worm.y + 30, vx: 0, vy: 0, radius: 5, power: 1 });
  game.player.x = worm.x;
  game.player.y = worm.y + 35;
  updateGame(game, 1 / 120);
  assert.equal(worm.hp, hp);
  assert.equal(game.player.hp, 100);
  assert.equal(game.bullets.length, 1);
});

function screenPosition(game) {
  const angle = cameraRoll(game), c = Math.cos(angle), s = Math.sin(angle);
  return {
    x: 640 + (game.player.x - 640) * c - (game.player.y - 360) * s,
    y: 360 + (game.player.x - 640) * s + (game.player.y - 360) * c - (game.cameraY || 0),
  };
}

test('keyboard and pointer keep the projected ship in the left third at every altitude and bank', () => {
  for (const usePointer of [false, true]) {
    const game = playable();
    let top = 720, bottom = 0;
    for (let frame = 0; frame < 60 * 22; frame += 1) {
      const up = Math.floor(frame / 180) % 2 === 0;
      game.altitude = frame % 2;
      updateGame(game, 1 / 60, usePointer ? { pointer: { x: 1900, y: up ? -900 : 1900 } } : { x: 1, y: up ? -1 : 1 });
      const screen = screenPosition(game);
      assert.ok(screen.x + 44 <= 1280 * 0.33 + 1e-6, `nose exceeded third at ${screen.x}`);
      assert.ok(game.player.x <= 380 + 1e-6 && game.player.x >= 70 - 1e-6);
      assert.ok(screen.y >= 48 - 1e-6 && screen.y <= 672 + 1e-6);
      top = Math.min(top, screen.y); bottom = Math.max(bottom, screen.y);
    }
    assert.ok(top <= 49 && bottom >= 671, 'vertical movement must reach both screen edges');
  }
});

test('keyboard and pointer reach ground and high sky at either screen edge regardless of route phase', () => {
  for (const usePointer of [false, true]) {
    for (const routeTime of [0, Math.PI / 0.24, Math.PI / 0.12, 3 * Math.PI / 0.24]) {
      for (const up of [false, true]) {
        const game = playable();
        game.time = routeTime;
        game.sceneTime = routeTime * 1.7;
        game.altitude = up ? 0 : 1;
        for (let frame = 0; frame < 480; frame += 1) {
          const angle = cameraRoll(game), c = Math.cos(angle), s = Math.sin(angle);
          const screenY = up ? 0 : 720;
          const input = usePointer ? { pointer: screenToWorld(game,{x:220,y:screenY}) } : { y: up ? -1 : 1 };
          updateGame(game, 1 / 60, input);
        }
        const message = `${usePointer ? 'pointer' : 'keyboard'}, route ${routeTime}, ${up ? 'top' : 'bottom'}`;
        assert.ok(Math.abs(screenPosition(game).y - (up ? 48 : 672)) < 1e-6, message);
        assert.ok(Math.abs(game.targetAltitude - (up ? 1 : 0)) < .001, message);
        assert.ok(up ? game.altitude > 0.95 : game.altitude < 0.05, `${message}: altitude ${game.altitude}`);
      }
    }
  }
});

test('automatic altitude route gently varies around the projected screen center', () => {
  const targets = [];
  for (const routeTime of [0, Math.PI / 0.24, Math.PI / 0.12, 3 * Math.PI / 0.24]) {
    const game = playable();
    game.time = routeTime;
    game.altitude = 0.5;
    const angle = cameraRoll(game), c = Math.cos(angle), s = Math.sin(angle);
    game.player.x = 640 + (220 - 640) * c;
    game.player.y = 360 - (220 - 640) * s;
    updateGame(game, 1 / 120);
    assert.ok(game.targetAltitude >= 0.349 && game.targetAltitude <= 0.651);
    targets.push(game.targetAltitude);
  }
  assert.ok(Math.max(...targets) - Math.min(...targets) > 0.28, 'the central route still varies automatically');
});

test('title starts above the cloud band and entering preserves the current backdrop altitude', () => {
  const game = createGame();
  assert.ok(game.altitude > 0.6);
  advance(game, 12);
  const altitude = game.altitude, targetAltitude = game.targetAltitude;
  startGame(game);
  assert.equal(game.altitude, altitude);
  assert.equal(game.targetAltitude, targetAltitude);
  updateGame(game, 1 / 60);
  assert.ok(Math.abs(game.altitude - altitude) < 0.02, 'starting must not snap the camera into the cloud layer');
});

test('combat tier is independent of elapsed time and capped at the second trial row', () => {
  assert.deepEqual(difficultyAt(0), difficultyAt(7200));
  const first = difficultyAt(0), second = difficultyAt(0, 1), late = difficultyAt(7200, 50);
  assert.equal(first.maxAttackers, 2); assert.equal(second.maxAttackers, 3);
  assert.equal(first.maxEnemyBullets, 120); assert.equal(second.maxEnemyBullets, 180);
  assert.equal(late.maxEnemyBullets, second.maxEnemyBullets);
  assert.equal(late.tier, 51);
});

test('opening normal sequence assigns the four taught patterns to existing sprites', () => {
  const game = playable(); game.nextWaveAt = 0;
  const patterns = new Set(), types = new Set();
  for (let frame = 0; frame < 40 * 60; frame++) {
    game.player.invincible = 2; updateGame(game, 1 / 60);
    for (const enemy of game.enemies) { if (enemy.pattern) patterns.add(enemy.pattern); types.add(enemy.type); }
  }
  assert.deepEqual([...patterns].sort(), ['B01', 'B02', 'B03', 'B04']);
  assert.deepEqual([...types].sort(), ['beetle', 'claw', 'dragonfly', 'orb', 'ray', 'worm']);
});

function gameWithBoss(index = 0, time = 0) {
  const game = playable();
  game.time = time;
  game.bossesDefeated = index;
  game.nextBossAt = 0;
  game.player.invincible = 100;
  updateGame(game, 1 / 120);
  advance(game, 1.21);
  const boss = game.boss;
  boss.x = 1040;
  boss.fireCooldown = 0;
  consumeEvents(game);
  return { game, boss };
}

test('the two trial bosses open with their designed ring and moving window tells', () => {
  for (let index = 0; index < 2; index++) {
    const { game, boss } = gameWithBoss(index);
    updateGame(game, 1 / 120);
    assert.equal(boss.attackName, index ? 'B04' : 'B01');
    advance(game, 0.5);
    assert.equal(game.enemyBullets.length, 0);
    assert.ok(boss.telegraph > 0);
    advance(game, 0.5);
    assert.ok(game.enemyBullets.length > 0);
  }
});

test('late boss special attacks respect the absolute projectile speed ceiling', () => {
  for (let index = 0; index < 2; index += 1) {
    const { game, boss } = gameWithBoss(index, 7200);
    boss.attack = 0;
    advance(game, 1.15);
    assert.ok(game.enemyBullets.length > 0);
    assert.ok(game.enemyBullets.every(b => Math.hypot(b.vx, b.vy) <= MAX_ENEMY_BULLET_SPEED + 1e-6));
  }
});

test('hive mines announce their arming period before they can hurt the player', () => {
  const game = playable();
  game.enemyBullets.push({ ...hostileBullet(game, 19), type: 'mine', radius: 12, arming: 0.8 });
  advance(game, 0.5);
  assert.equal(game.player.hp, 100);
  advance(game, 0.35);
  assert.equal(game.player.hp, 81);
});

test('successive timed power items change firing behavior and lance hits each target once', () => {
  const game = playable();
  const patterns = [];
  for (let item = 0; item < 3; item += 1) {
    game.pickups.push({ x: game.player.x, y: game.player.y, baseY: game.player.y, radius: 22, type: 'power', phase: 0 });
    updateGame(game, 1 / 120);
    game.bullets = [];
    game.player.fireCooldown = 0;
    updateGame(game, 1 / 120, { shoot: true });
    patterns.push({ mode: game.player.weaponMode, count: game.bullets.length });
    if (item === 1) {
      const shot = game.bullets[0];
      game.enemies = [{ id: 900, type: 'beetle', x: 500, y: 360, baseY: 360, radius: 28, hp: 20, maxHp: 20, speed: 0, fireCooldown: 10 }];
      game.bullets = [Object.assign(shot, { x: 500, y: 360, vx: 0, vy: 0 })];
      advance(game, 0.1);
      assert.equal(game.enemies[0].hp, 17, 'piercing shot must not damage the same body on every substep');
      game.enemies = [];
    }
  }
  assert.deepEqual(patterns, [{ mode: 'spread', count: 5 }, { mode: 'lance', count: 3 }, { mode: 'helix', count: 4 }]);
});

test('a stalled carrier stays in tier two and never accumulates more than two escorts', () => {
  const { game } = gameWithBoss(1);
  let sawEscort = false;
  for (let frame = 0; frame < 60 * 65; frame++) {
    game.player.invincible = 2; updateGame(game, 1 / 60);
    const escorts = game.enemies.filter(enemy => enemy.escort);
    sawEscort ||= escorts.length > 0;
    assert.ok(escorts.length <= 2);
    assert.ok(game.enemies.length <= game.difficulty.maxEnemies);
    assert.ok(game.enemyBullets.length <= game.difficulty.maxEnemyBullets);
  }
  assert.ok(sawEscort);
  assert.equal(game.boss.bossKind, 'carrier'); assert.equal(game.bossesDefeated, 1);
});

test('tilted ships fire and flash from the rotated visible nose while shots travel forward', () => {
  for (const tilt of [-0.48, 0, 0.48]) {
    const game = playable();
    game.player.angle = tilt;
    const dt = 1 / 120;
    updateGame(game, dt, { shoot: true });
    const muzzle = playerMuzzle(game.player);
    const shot = consumeEvents(game).find(event => event.type === 'shot');
    assert.ok(Math.hypot(shot.x - muzzle.x, shot.y - muzzle.y) < 1e-6);
    const angle = playerHeading(game.player);
    assert.ok(Math.abs(muzzle.x - game.player.x - (30 * Math.cos(angle) + 4 * Math.sin(angle))) < 1e-6);
    assert.ok(Math.abs(muzzle.y - game.player.y - (30 * Math.sin(angle) - 4 * Math.cos(angle))) < 1e-6);
    game.bullets.forEach((bullet, index) => {
      assert.ok(Math.abs(bullet.x - bullet.vx * dt - shot.x - 2) < 1e-6);
      assert.equal(bullet.vy, 0);
      assert.ok(Math.abs(bullet.y - shot.y - (index === 0 ? -8 : 8)) < 1e-6);
    });
  }
});

test('normal, powered and drone volleys survive firing at both banked screen edges', () => {
  for (const top of [true, false]) {
    for (const [weaponMode, count] of [['normal', 2], ['spread', 5], ['lance', 3], ['helix', 4]]) {
      const game = playable();
      game.sceneTime = 3 * Math.PI / (2 * 0.18);
      game.altitude = top ? 1 : 0;
      Object.assign(game.player, {
        angle: top ? -0.48 : 0.48, vx: -225, vy: top ? -490 : 490,
        powerTime: weaponMode === 'normal' ? 0 : 14, weaponMode, droneTime: 15,
      });
      const roll = cameraRoll(game), c = Math.cos(roll), s = Math.sin(roll);
      const screenY = top ? 48 : 672;
      game.cameraY=top?-156:156;
      Object.assign(game.player,screenToWorld(game,{x:58,y:screenY}));
      const input = { x: -1, y: top ? -1 : 1, shoot: true };
      updateGame(game, 1 / 120, input);
      const message = `${top ? 'top' : 'bottom'} ${weaponMode}`;
      assert.ok(Math.abs(screenPosition(game).y - screenY) < 1e-6, message);
      assert.equal(game.bullets.length, count + 2, `${message}: full volley and both drones must remain`);
      const fired = game.bullets.map(bullet => bullet.id);
      updateGame(game, 1 / 120, input);
      assert.deepEqual(game.bullets.map(bullet => bullet.id), fired, `${message}: shots must continue after spawning`);
    }
  }
});

test('both projectile pools use projected viewport margins and still remove dead or expired shots', () => {
  const game = playable();
  game.sceneTime = 3 * Math.PI / (2 * 0.18);
  const roll = cameraRoll(game), c = Math.cos(roll), s = Math.sin(roll);
  const samples = [
    { id: 'left-in', x: -79, y: 360 }, { id: 'left-out', x: -81, y: 360 },
    { id: 'right-in', x: 1399, y: 360 }, { id: 'right-out', x: 1401, y: 360 },
    { id: 'top-in', x: 640, y: -99 }, { id: 'top-out', x: 640, y: -101 },
    { id: 'bottom-in', x: 640, y: 819 }, { id: 'bottom-out', x: 640, y: 821 },
    { id: 'dead', x: 640, y: 360, dead: true }, { id: 'expired', x: 640, y: 360, age: 9 },
  ];
  for (const pool of ['bullets', 'enemyBullets']) {
    game[pool] = samples.map(sample => ({
      ...sample, age: sample.age || 0, vx: 0, vy: 0, radius: 5, power: 1,
      x: 640 + (sample.x - 640) * c + (sample.y - 360) * s,
      y: 360 - (sample.x - 640) * s + (sample.y - 360) * c,
    }));
  }
  updateGame(game, 1 / 120);
  for (const pool of ['bullets', 'enemyBullets']) {
    assert.deepEqual(game[pool].map(bullet => bullet.id), ['left-in', 'right-in', 'top-in', 'bottom-in'], pool);
  }
});
