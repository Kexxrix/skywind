import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, startGame, updateGame, consumeEvents, worldToScreen, screenToWorld, getWeaponStatus,
  FLIGHT_CENTER_Y, FLIGHT_MIN_Y, FLIGHT_MAX_Y, VIEW_MIN_Y, VIEW_MAX_Y, WEAPON_DURATION, DRONE_DURATION,
} from '../src/game.js';

const close = (actual, expected, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} should be within ${tolerance} of ${expected}`);

function playable(seed = 9381) {
  const game = createGame(seed);
  startGame(game);
  game.mode = 'playing';
  Object.assign(game.player, screenToWorld(game, { x: 240, y: 360 }));
  game.nextWaveAt = game.nextBossAt = game.nextPickupAt = Infinity;
  consumeEvents(game);
  return game;
}

function advance(game, seconds, input = {}, frame = 1 / 60) {
  const events = [];
  for (let elapsed = 0; elapsed < seconds - 1e-9; elapsed += frame) {
    updateGame(game, Math.min(frame, seconds - elapsed), input);
    events.push(...consumeEvents(game));
  }
  return events;
}

function collect(game, ...types) {
  for (const type of types) game.pickups.push({
    type, x: game.player.x, y: game.player.y, baseY: game.player.y, radius: 22, phase: 0, age: 0,
  });
  updateGame(game, 1 / 120);
  return consumeEvents(game);
}

test('flight expands both sides of the fixed 360 baseline by 1.5 while keeping the ship inside the viewport', () => {
  assert.equal(FLIGHT_CENTER_Y, 360);
  assert.equal(FLIGHT_CENTER_Y - FLIGHT_MIN_Y, (360 - 48) * 1.5);
  assert.equal(FLIGHT_MAX_Y - FLIGHT_CENTER_Y, (672 - 360) * 1.5);
  assert.equal(VIEW_MIN_Y, 48);
  assert.equal(VIEW_MAX_Y, 672);
  for (const direction of [-1, 1]) {
    const game = playable();
    advance(game, 6, { y: direction });
    const screen = worldToScreen(game, game.player);
    close(game.cameraY, direction * 156, 0.001);
    close(screen.y, direction < 0 ? VIEW_MIN_Y : VIEW_MAX_Y, 0.001);
    close(screen.y + game.cameraY, direction < 0 ? FLIGHT_MIN_Y : FLIGHT_MAX_Y, 0.001);
    assert.ok(screen.y - game.player.radius > 0);
    assert.ok(screen.y + game.player.radius < 720);
    assert.ok(screen.x >= 58 - 1e-6 && screen.x <= 1280 * 0.33 - 44 + 1e-6);
  }
});

test('small central dodges retain a stable camera and broad travel begins camera following', () => {
  const game = playable();
  advance(game, 0.3, { y: 0.3 });
  const dodged = worldToScreen(game, game.player);
  assert.ok(dodged.y > 375 && dodged.y < 430, 'the small dodge actually moved the ship');
  assert.equal(game.cameraY, 0, 'central movement stays inside the dead zone');
  advance(game, 0.25, { y: -0.3 });
  assert.equal(game.cameraY, 0);
  advance(game, 1, { y: -1 });
  assert.ok(game.cameraY < -1 && game.cameraY >= -156);
});

test('world/screen coordinates invert at both extreme camera offsets and preserve the offset sign', () => {
  const game = playable();
  game.sceneTime = 93;
  game.altitude = 0.82;
  game.player.angle = -0.31;
  const points = [{ x: 70, y: -108 }, { x: 220, y: 360 }, { x: 1030, y: 828 }, { x: 1280, y: 50 }];
  for (const cameraY of [-156, 0, 156]) {
    for (const point of points) {
      game.cameraY = 0;
      const unshifted = worldToScreen(game, point);
      game.cameraY = cameraY;
      const projected = worldToScreen(game, point);
      close(projected.x, unshifted.x);
      close(projected.y, unshifted.y - cameraY);
      const restored = screenToWorld(game, projected);
      close(restored.x, point.x);
      close(restored.y, point.y);
      const roundtrip = worldToScreen(game, screenToWorld(game, point));
      close(roundtrip.x, point.x);
      close(roundtrip.y, point.y);
    }
  }
});

test('weapon status exposes independent eighteen/fifteen-second slots and bounded gauges', () => {
  const game = playable();
  assert.deepEqual(getWeaponStatus(game.player), { mode: 'normal', remaining: 0, gauge: 0, level: 1, maxDuration: 45, drone: null });
  collect(game, 'power', 'drone');
  let status = getWeaponStatus(game.player);
  assert.equal(status.mode, 'spread');
  assert.equal(status.remaining, WEAPON_DURATION);
  assert.equal(status.gauge, 18 / 45);
  assert.deepEqual(status.drone, { remaining: DRONE_DURATION, gauge: 1 });
  advance(game, 7);
  status = getWeaponStatus(game.player);
  close(status.remaining, 11);
  close(status.gauge, 11 / 45);
  close(status.drone.remaining, 8);
  close(status.drone.gauge, 8 / 15);
  const overfilled = getWeaponStatus({ ...game.player, powerTime: 50, droneTime: 30 });
  assert.equal(overfilled.gauge, 1);
  assert.equal(overfilled.drone.gauge, 1);
  const inactive = getWeaponStatus({ ...game.player, powerTime: -1, droneTime: -1 });
  assert.deepEqual(inactive, { mode: 'normal', remaining: 0, gauge: 0, level: 1, maxDuration: 45, drone: null });
});

test('power pickups refresh eighteen seconds and cycle spread/lance/helix without overwriting the drone slot', () => {
  const game = playable();
  collect(game, 'drone');
  for (const mode of ['spread', 'lance', 'helix', 'spread']) {
    const beforeDrone = game.player.droneTime;
    const events = collect(game, 'power');
    const status = getWeaponStatus(game.player);
    assert.equal(status.mode, mode);
    assert.equal(status.remaining, 18, 'pickup refreshes, rather than adds, duration');
    assert.equal(status.gauge, 18 / 45);
    close(status.drone.remaining, beforeDrone - 1 / 120);
    assert.equal(events.filter(event => event.type === 'pickup' && event.pickupType === 'power').length, 1);
    advance(game, 1.5);
  }
  const beforePower = game.player.powerTime;
  collect(game, 'drone');
  close(game.player.powerTime, beforePower - 1 / 120);
  assert.equal(game.player.droneTime, 15);
  assert.equal(getWeaponStatus(game.player).mode, 'spread');
});

test('each slot warns and expires once at its independent new duration', () => {
  const game = playable();
  collect(game, 'power', 'drone');
  const events = advance(game, 12.01);
  assert.deepEqual(events.filter(event => event.type === 'weaponWarning').map(event => event.slot), ['drone']);
  events.push(...advance(game, 3));
  assert.equal(getWeaponStatus(game.player).mode, 'spread');
  assert.equal(getWeaponStatus(game.player).drone, null);
  assert.deepEqual(events.filter(event => event.type === 'weaponWarning').map(event => event.slot), ['drone', 'weapon']);
  events.push(...advance(game, 3));
  assert.deepEqual(events.filter(event => event.type === 'weaponExpired').map(event => event.slot), ['drone', 'weapon']);
  assert.equal(getWeaponStatus(game.player).mode, 'normal');
  assert.equal(events.filter(event => event.type === 'weaponWarning').length, 2);
});

test('same-frame slot crossings each emit a cue, and refreshing after a warning re-arms only the renewed duration', () => {
  const simultaneous = playable();
  Object.assign(simultaneous.player, { powerTime: 3.005, droneTime: 3.005, weaponMode: 'helix' });
  const together = advance(simultaneous, 0.01);
  assert.deepEqual(together.filter(event => event.type === 'weaponWarning').map(event => event.slot), ['weapon', 'drone']);
  together.push(...advance(simultaneous, 3.1));
  assert.deepEqual(together.filter(event => event.type === 'weaponExpired').map(event => event.slot), ['weapon', 'drone']);

  for (const [type, duration, slot] of [['power', 18, 'weapon'], ['drone', 15, 'drone']]) {
    const game = playable();
    collect(game, type);
    const first = advance(game, duration - 2.9);
    assert.equal(first.filter(event => event.type === 'weaponWarning' && event.slot === slot).length, 1);
    collect(game, type);
    const afterRefresh = advance(game, 3.1);
    assert.equal(afterRefresh.filter(event => event.type === 'weaponExpired').length, 0, 'old expiry was replaced');
    afterRefresh.push(...advance(game, duration - 3));
    const warnings = afterRefresh.filter(event => event.type === 'weaponWarning' && event.slot === slot);
    const expired = afterRefresh.filter(event => event.type === 'weaponExpired' && event.slot === slot);
    assert.equal(warnings.length, 1);
    assert.equal(expired.length, 1);
    assert.equal(warnings[0].weaponMode, type === 'power' ? 'lance' : 'drone');
    assert.equal(expired[0].weaponMode, warnings[0].weaponMode);
  }
});

test('weapon timers and one-shot cues agree across 30 Hz and 144 Hz update schedules', () => {
  const results = [];
  for (const frame of [1 / 30, 1 / 144]) {
    const game = playable();
    collect(game, 'power', 'drone');
    const events = advance(game, 12.5, {}, frame);
    const active = getWeaponStatus(game.player);
    close(active.remaining, 5.5);
    close(active.drone.remaining, 2.5);
    events.push(...advance(game, 6, {}, frame));
    results.push(events.filter(event => event.type === 'weaponWarning' || event.type === 'weaponExpired').map(event => [event.type, event.slot, event.weaponMode]));
  }
  assert.deepEqual(results[0], results[1]);
  assert.equal(results[0].length, 4);
});

test('restart clears old weapon/drone state, projectiles, camera offset, and cue history', () => {
  const game = playable();
  collect(game, 'power', 'drone');
  advance(game, 11.2);
  game.player.fireCooldown = 0;
  advance(game, 0.01, { shoot: true });
  assert.ok(game.bullets.length > 0);
  game.cameraY = 156;
  game.events.push({ type: 'weaponWarning', slot: 'weapon', weaponMode: 'spread' });
  startGame(game);
  assert.equal(game.cameraY, 0);
  assert.equal(game.time, 0);
  assert.equal(game.player.powerPickups, 0);
  assert.equal(game.player.fireCooldown, 0);
  assert.equal(game.player.droneCooldown, 0);
  assert.equal(game.bullets.length, 0);
  assert.deepEqual(getWeaponStatus(game.player), { mode: 'normal', remaining: 0, gauge: 0, level: 1, maxDuration: 45, drone: null });
  assert.deepEqual(consumeEvents(game).map(event => event.type), ['start']);
  game.mode = 'playing';
  Object.assign(game.player, screenToWorld(game, { x: 240, y: 360 }));
  game.nextWaveAt = game.nextBossAt = game.nextPickupAt = Infinity;
  const events = advance(game, 30);
  assert.equal(events.filter(event => event.type === 'weaponWarning' || event.type === 'weaponExpired').length, 0, 'normal fire has no expiry timer');
  collect(game, 'power');
  assert.equal(getWeaponStatus(game.player).mode, 'spread', 'new run restarts the existing pickup cycle');
});

test('real volleys tag their original mode, including drones, and hits retain it after a weapon pickup', () => {
  const patternCounts = { normal: 2, spread: 5, lance: 3, helix: 4, drone: 2 };
  for (const mode of Object.keys(patternCounts)) {
    const game = playable();
    const pickupCount = { normal: 0, spread: 1, lance: 2, helix: 3, drone: 0 }[mode];
    for (let i = 0; i < pickupCount; i += 1) collect(game, 'power');
    if (mode === 'drone') collect(game, 'drone');
    const events = advance(game, 1 / 120, { shoot: true });
    const projectiles = game.bullets.filter(bullet => bullet.weaponMode === mode);
    assert.equal(projectiles.length, patternCounts[mode]);
    assert.equal(events.filter(event => event.type === 'shot' && event.weaponMode === mode).length, 1, 'one event per volley, rather than one per projectile');
    if (mode === 'drone') assert.equal(events.filter(event => event.type === 'shot' && event.weaponMode === 'normal').length, 1);
    const bullet = projectiles[0];
    game.bullets = [bullet];
    collect(game, 'power');
    assert.notEqual(getWeaponStatus(game.player).mode, mode);
    assert.equal(bullet.weaponMode, mode);
    const enemy = {
      id: 100001, type: 'beetle', x: bullet.x + bullet.vx / 120, y: bullet.y, baseY: bullet.y,
      radius: 30, hp: 100, maxHp: 100, speed: 0, fireCooldown: Infinity, phase: 0, age: 0,
    };
    game.enemies.push(enemy);
    const impact = advance(game, 1 / 120).filter(event => event.type === 'hit' && !event.player);
    assert.equal(impact.length, 1, mode);
    assert.equal(impact[0].weaponMode, mode);
    assert.equal(impact[0].drone, mode === 'drone');
    assert.equal(enemy.hp, 100 - bullet.power, 'audio provenance leaves damage unchanged');
  }
});
