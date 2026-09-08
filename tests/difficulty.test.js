import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, startGame, updateGame, consumeEvents, difficultyAt, worldToScreen, screenToWorld, sequenceToWorld } from '../src/game.js';
import { barragePlan, AIM_SPEEDS } from '../src/barrage.js';

function playable(tier = 0) {
  const game = createGame(74912); startGame(game); game.mode = 'playing';
  Object.assign(game.player, { x: 220, y: 360, invincible: 1000 });
  game.bossesDefeated = tier; game.difficulty = difficultyAt(0, tier);
  game.nextWaveAt = game.nextBossAt = game.nextPickupAt = Infinity;
  consumeEvents(game); return game;
}
function emitter(id, type = 'beetle', pattern = null) {
  return { id, type, pattern, holdScreenY: 360, holdUntil: 30, x: 1000, y: 360, baseY: 360,
    radius: 28, hp: 999, maxHp: 999, speed: 0, phase: 0, age: 0, fireCooldown: 0, attack: 0,
    attackAngle: Math.PI, telegraph: 0, chargeTime: 0, locked: false, dashTime: 0, dead: false };
}
const active = g => g.enemies.filter(e => !e.dead && (e.locked || e.sequence || e.attackActiveUntil > g.time));
function advance(g, seconds, input = {}) {
  const events = [];
  for (let time = 0; time < seconds - 1e-9; time += 1 / 120) {
    updateGame(g, Math.min(1 / 120, seconds - time), input); events.push(...consumeEvents(g));
  }
  return events;
}

test('two trial tiers depend only on victories and hold all declared population and speed budgets', () => {
  const first = difficultyAt(0), second = difficultyAt(0, 1);
  assert.deepEqual(difficultyAt(8000), first);
  assert.deepEqual([first.maxEnemies, first.maxAttackers, first.maxEnemyBullets, first.maxSequenceBullets, first.maxBulletSpeed], [10, 2, 120, 72, 160]);
  assert.deepEqual([second.maxEnemies, second.maxAttackers, second.maxEnemyBullets, second.maxSequenceBullets, second.maxBulletSpeed], [12, 3, 180, 112, 340]);
  assert.equal(difficultyAt(8000, 99).pace, 1);
  assert.equal(difficultyAt(8000, 99).tier, 100);
});

test('B01-B04 plans retain complete geometric sequences within bundle and full-sequence budgets', () => {
  const counts = [[54, 24, 54, 40], [72, 60, 96, 84]];
  for (let tier = 0; tier < 2; tier++) for (const [index, pattern] of ['B01', 'B02', 'B03', 'B04'].entries()) {
    const plan = barragePlan(pattern, tier, 0.7), d = difficultyAt(0, tier);
    assert.equal(plan.total, counts[tier][index]);
    assert.ok(plan.total <= d.maxSequenceBullets);
    assert.ok(plan.bundles.every(bundle => bundle.count <= d.maxPatternBullets));
    assert.ok(plan.bundles.every((bundle, i) => !i || bundle.at >= plan.bundles[i - 1].at));
  }
});

test('whole attack source and bullet reservations survive every ring and port until release', () => {
  for (let tier = 0; tier < 2; tier++) for (const pattern of ['B01', 'B02', 'B03', 'B04']) {
    const g = playable(tier); g.enemies = [emitter(1, 'orb', pattern), emitter(2), emitter(3), emitter(4)];
    const seen = [];
    for (let frame = 0; frame < 7 * 120; frame++) {
      updateGame(g, 1 / 120);
      assert.ok(active(g).length <= g.difficulty.maxAttackers);
      assert.ok(active(g).filter(e => e.attackName?.startsWith('B')).length <= 1);
      const reserved = g.enemies.reduce((sum, e) => sum + (e.reservedBullets || 0), 0);
      assert.ok(g.enemyBullets.length + reserved <= g.difficulty.maxEnemyBullets);
      const events = consumeEvents(g).filter(e => e.type === 'enemyShot'); seen.push(...events);
      assert.ok(events.every(e => e.bulletCount <= g.difficulty.maxPatternBullets));
      assert.ok(g.enemyBullets.every(b => Math.hypot(b.vx, b.vy) <= g.difficulty.maxBulletSpeed + 1e-6));
    }
    assert.ok(seen.some(e => e.pattern === pattern), pattern);
  }
});

test('a sequence that cannot reserve its whole shape waits without partial tell or stray bullets', () => {
  const g = playable(); g.enemies = [emitter(1, 'orb', 'B01')];
  g.enemyBullets = Array.from({ length: 90 }, (_, i) => ({ id: i + 50, x: 650, y: 650, vx: 0, vy: 0, radius: 5.5, age: 0 }));
  advance(g, 0.5);
  assert.equal(g.enemies[0].locked, false); assert.equal(g.enemies[0].sequence, undefined);
  assert.equal(g.enemyBullets.length, 90);
  g.enemyBullets = [];
  advance(g, 0.1); assert.ok(g.enemies[0].locked); assert.equal(g.enemies[0].reservedBullets, 54);
});

test('the 42 second quiet period blocks new tells and 45 seconds clears damage with no score', () => {
  const g = playable(); g.time = g.normalTime = 42; g.recoverySpawned = true; g.nextWaveAt = 0; g.nextBossAt = 45;
  g.enemies = [emitter(1)];
  g.enemyBullets = [{ x: 800, y: 650, vx: -10, vy: 0, radius: 5.5, age: 0 }];
  advance(g, 0.1); assert.equal(g.enemies[0].locked, false); assert.equal(g.enemies.length, 1);
  assert.ok(g.enemyBullets[0].x < 800);
  advance(g, 2.91); assert.equal(g.phase, 'boss-entry'); assert.equal(g.enemies.length, 1);
  assert.equal(g.enemies[0].type, 'boss'); assert.equal(g.enemyBullets.length, 0); assert.equal(g.score, 0);
});

test('aiming tracks through its tell and locks a straight velocity at actual release for all three speeds', () => {
  for (let speedIndex = 0; speedIndex < 3; speedIndex++) {
    const g = playable(1), e = emitter(1); g.aimCounter = speedIndex; g.enemies = [e];
    advance(g, 0.4); const firstAngle = e.attackAngle;
    g.player.y = 470; advance(g, 0.3);
    const b = g.enemyBullets[0]; assert.ok(b); assert.notEqual(e.attackAngle, firstAngle);
    assert.equal(Math.round(Math.hypot(b.vx, b.vy)), AIM_SPEEDS[speedIndex]);
    const origin = { x: b.x - b.vx * b.age, y: b.y - b.vy * b.age }, angle = Math.atan2(b.aimedAt.y - origin.y, b.aimedAt.x - origin.x);
    assert.ok(Math.abs(Math.atan2(b.vy, b.vx) - angle) < 1e-8);
    const velocity = [b.vx, b.vy]; g.player.y = 200; advance(g, 0.1);
    assert.deepEqual([b.vx, b.vy], velocity);
  }
});

test('too close fast aiming delays fire instead of violating the post-release flight allowance', () => {
  const g = playable(1), e = emitter(1); g.aimCounter = 2; e.x = 550; e.baseY = g.player.y;
  g.player.x = 378; g.enemies = [e];
  const events = advance(g, 1.1);
  assert.equal(events.filter(e => e.type === 'enemyShot').length, 0);
  assert.equal(g.aimCounter, 2, 'a blocked fast release does not consume its speed slot');
});

test('natural waves and boss loops actually release all three aimed speeds in tier two while tier one stays slow', () => {
  for (const victories of [0, 1, 2]) {
    const g = createGame(74912); startGame(g); g.bossesDefeated = victories;
    const speeds = new Set(), released = new Set(), types = new Set();
    for (let frame = 0; frame < 120 * 120; frame++) {
      g.player.invincible = 2; // Load/availability observation, not survival proof.
      updateGame(g, 1 / 120);
      for (const event of consumeEvents(g)) if (event.type === 'enemyShot' && event.pattern === 'aim') {
        speeds.add(event.speedTier); types.add(event.boss ? 'boss' : 'wave');
      }
      for (const b of g.enemyBullets) if (b.aimedAt && !released.has(b.id)) {
        released.add(b.id);
        const origin = { x: b.x - b.vx * b.age, y: b.y - b.vy * b.age };
        const flightTime = (Math.hypot(b.aimedAt.x - origin.x, b.aimedAt.y - origin.y) - b.radius - g.player.radius) / Math.hypot(b.vx, b.vy);
        assert.ok(flightTime >= (victories ? 0.7 : 0.9) - 1e-8);
      }
    }
    assert.deepEqual([...speeds].sort(), victories ? ['fast', 'medium', 'slow'] : ['slow']);
    assert.deepEqual([...types].sort(), ['boss', 'wave']);
    assert.ok(released.size >= 6);
    startGame(g); assert.equal(g.aimCounter, 0, 'a retry starts a new released-shot rotation');
  }
});

test('B04 uses actual ports and preserves a core-clear cross-section window after camera movement', () => {
  for (let tier = 0; tier < 2; tier++) {
    const g = playable(tier), e = emitter(1, 'ray', 'B04'); g.enemies = [e];
    advance(g, 0.2); const plan = e.sequence;
    g.cameraY = -100; g.player.y -= 100;
    let bullets;
    for (let frame = 0; frame < 100; frame++) {
      updateGame(g, 1 / 120); consumeEvents(g);
      if (g.enemyBullets.length) { bullets = [...g.enemyBullets]; break; }
    }
    assert.ok(bullets?.length);
    const center = sequenceToWorld(plan, { x: 360, y: e.safeLane });
    for (const b of bullets) {
      // Convert world trajectories back into the original, advertised cross-section.
      const px = 640 + (b.x - 640) * plan.cos - (b.y - 360) * plan.sin;
      const py = 360 + (b.x - 640) * plan.sin + (b.y - 360) * plan.cos - plan.cameraY;
      const vx = b.vx * plan.cos - b.vy * plan.sin, vy = b.vx * plan.sin + b.vy * plan.cos;
      const crossY = py + vy * (360 - px) / vx;
      assert.ok(Math.abs(crossY - e.safeLane) >= g.difficulty.corridorWidth / 2 + b.radius + g.player.radius - 1e-6);
      assert.ok(Number.isFinite(center.x));
    }
  }
});

test('six repeated cycles retain bounded sources, ammunition and zero escort score', () => {
  const g = playable(); g.nextBossAt = 0;
  let defeated = 0;
  for (let frame = 0; frame < 170 * 120 && defeated < 6; frame++) {
    updateGame(g, 1 / 120);
    if (g.phase === 'boss' && g.phaseTime > 6) {
      g.bullets.push({ x: g.boss.x, y: g.boss.y, vx: 0, vy: 0, radius: 90, power: 10000 });
    }
    if (g.bossesDefeated > defeated) { defeated = g.bossesDefeated; g.nextBossAt = g.time + 0.5; }
    assert.ok(g.enemies.length <= g.difficulty.maxEnemies);
    assert.ok(active(g).length <= g.difficulty.maxAttackers);
    assert.ok(g.enemyBullets.length <= g.difficulty.maxEnemyBullets);
    assert.ok(g.enemies.filter(e => e.escort).every(e => e.score === 0));
    consumeEvents(g);
  }
  assert.equal(defeated, 6);
  assert.equal(g.difficulty.pace, 1);
});

test('both tiers retain a continuous normal-input survival route through each pattern plus permitted aiming sources', () => {
  // This is a controlled geometry/path regression, not a human difficulty rating.
  for (let tier = 0; tier < 2; tier++) for (const pattern of ['B01', 'B02', 'B03', 'B04']) {
    const g = playable(tier), lane = pattern === 'B04' ? 240 : pattern === 'B02' && tier ? 200 : 150;
    const followWindow = pattern === 'B04' && tier === 1;
    Object.assign(g.player, screenToWorld(g, { x: 240, y: lane }), { invincible: 0 });
    g.enemies = [emitter(90, 'orb', pattern), Object.assign(emitter(91), { x: 1100, attack: 1 })];
    if (tier) g.enemies.push(Object.assign(emitter(92), { x: 1080, attack: 2 }));
    let patternShots = 0, aimedShots = 0, travelled = 0, targetY = lane, lastDodge = -2;
    for (let frame = 0; frame < 8 * 120; frame++) {
      const before = { x: g.player.x, y: g.player.y }, screenY = worldToScreen(g, g.player).y;
      if (!followWindow) targetY = lane;
      const imminent = g.enemyBullets.map(b => {
        const arrival = (g.player.x - b.x) / (b.vx || 1);
        return { arrival, y: b.y + b.vy * arrival };
      }).filter(b => b.arrival > 0 && b.arrival < 1 && Math.abs(b.y - g.player.y) < (followWindow ? 40 : 30));
      if (imminent.length && (!followWindow || g.time - lastDodge > 0.35)) {
        const center = (Math.min(...imminent.map(b => b.y)) + Math.max(...imminent.map(b => b.y))) / 2;
        targetY = screenY + (g.player.y < center ? -1 : 1) * (followWindow ? 55 : 65);
        lastDodge = g.time;
      } else if (g.time - lastDodge > 1.3) targetY = lane;
      const pointer = screenToWorld(g, { x: 240, y: Math.max(90, Math.min(630, targetY)) });
      updateGame(g, 1 / 120, { pointer });
      travelled += Math.hypot(g.player.x - before.x, g.player.y - before.y);
      for (const event of consumeEvents(g)) if (event.type === 'enemyShot') {
        if (event.pattern === pattern) patternShots++;
        if (event.pattern === 'aim') aimedShots++;
      }
      assert.equal(g.player.hp, 100, `${pattern} tier ${tier} at ${g.time}`);
    }
    assert.ok(patternShots >= 2 && aimedShots >= 1, `${pattern} actually overlapped its aimed pressure`);
    assert.ok(travelled > 30, 'normal movement, not invulnerability or a teleported safe position, traversed the route');
  }
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

test('an uncaught pickup keeps moving across the visible lower left corner until its projected exit', () => {
  const game = playable();
  game.sceneTime = 3 * Math.PI / (2 * 0.18);
  game.altitude = 0;
  game.cameraY = 156;
  // Keep the ship away from the enlarged rear attraction area for this culling check.
  Object.assign(game.player, screenToWorld(game, { x: 378, y: 300 }));
  game.pickups = [{ id: 99, type: 'power', x: -59, y: 650, baseY: 650, radius: 22, age: 0, phase: 0 }];
  updateGame(game, 1 / 120, { y: 1 });
  assert.equal(game.pickups.length, 1);
  assert.ok(worldToScreen(game, game.pickups[0]).x > 30, 'the visible icon is preserved past world x=-60');
  game.pickups[0].x = -250;
  updateGame(game, 1 / 120, { y: 1 });
  assert.equal(game.pickups.length, 0, 'the pickup is removed after its projected left margin');
});
