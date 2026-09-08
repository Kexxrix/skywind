import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame, startGame, updateGame, consumeEvents, worldToScreen, screenToWorld, PICKUP_ATTRACTION, PLAYER_HIT_RADIUS } from '../src/game.js';

const STEP = 1 / 120;
function setup(type = 'health', extra = {}) {
  const g = createGame(71); startGame(g); g.mode = 'playing';
  Object.assign(g.player, { x: 220, y: 360, hp: 70 });
  g.nextWaveAt = g.nextBossAt = g.nextPickupAt = Infinity;
  const item = { id: 9, type, x: 310, y: 360, baseY: 360, radius: 22, age: 0, phase: 0, ...extra };
  g.pickups.push(item); consumeEvents(g);
  return { g, item };
}
function advance(g, time, input = {}, frame = STEP) {
  const events = [];
  for (let t = 0; t < time - 1e-9; t += frame) {
    updateGame(g, Math.min(frame, time - t), input); events.push(...consumeEvents(g));
  }
  return events;
}

test('attraction reach doubles the previous radius and never expands the damage core', () => {
  const manifest = JSON.parse(readFileSync(new URL('../assets/art/player/sv01/manifest.json', import.meta.url)));
  assert.equal(PICKUP_ATTRACTION.radius, manifest.display_size_game_units[0] * 2);
  const { g } = setup(); updateGame(g, STEP);
  assert.equal(g.player.radius, PLAYER_HIT_RADIUS);
  assert.equal(PLAYER_HIT_RADIUS, 1.85);
});

test('every item visibly travels inward before applying its effect once', () => {
  for (const type of ['health', 'power', 'drone', 'change', 'maintain']) {
    const { g, item } = setup(type, { weaponMode: 'lance' });
    const start = advance(g, STEP);
    assert.equal(item.attracting, true);
    assert.equal(g.pickups.length, 1);
    assert.equal(g.player.hp, 70);
    assert.equal(start.filter(e => e.type === 'pickupAttract').length, 1);
    assert.ok(!start.some(e => e.type === 'pickup'));
    const firstDistance = Math.hypot(item.x - g.player.x, item.y - g.player.y);
    const middle = advance(g, 0.02);
    assert.ok(Math.hypot(item.x - g.player.x, item.y - g.player.y) < firstDistance);
    assert.equal(g.pickups.length, 1);
    const end = advance(g, 0.18);
    assert.equal(g.pickups.length, 0);
    assert.equal([...middle, ...end].filter(e => e.type === 'pickup').length, 1);
    assert.ok(![...middle, ...end].some(e => e.type === 'pickupAttract'));
    assert.ok(!advance(g, 0.3).some(e => e.type === 'pickup'));
  }
});

test('a supply caught just before expiry finishes absorption; an expired one cannot start', () => {
  for (const expired of [false, true]) {
    const { g, item } = setup('maintain', { side: 'top', age: expired ? 2.101 : 2.099 });
    const events = advance(g, 0.35);
    assert.equal(Boolean(item.attracting), !expired);
    assert.equal(g.player.basicLevel, expired ? 1 : 2);
    assert.equal(events.filter(e => e.type === 'pickup').length, expired ? 0 : 1);
  }
});

test('latched items follow a moving ship through a camera change at 30, 60 and 144Hz', () => {
  for (const frame of [1 / 30, 1 / 60, 1 / 144]) for (const y of [-1, 1]) {
    const { g, item } = setup();
    g.pickups = []; advance(g, 0.7, { y });
    Object.assign(item, { x: g.player.x + 90, y: g.player.y, baseY: g.player.y });
    g.pickups.push(item);
    updateGame(g, STEP);
    const camera = g.cameraY;
    const events = advance(g, 0.3, { x: 1, y }, frame);
    assert.equal(item.dead, true);
    assert.equal(g.player.hp, 100);
    assert.equal(events.filter(e => e.type === 'pickup').length, 1);
    assert.notEqual(g.cameraY, camera);
  }
});

test('pause and gameover freeze absorption, and restart removes an unfinished attraction', () => {
  for (const mode of ['paused', 'gameover']) {
    const { g, item } = setup(); advance(g, 0.02);
    const before = structuredClone(item);
    g.mode = mode; updateGame(g, 0.12);
    assert.deepEqual(item, before);
    assert.equal(g.player.hp, 70);
    startGame(g); assert.equal(g.pickups.length, 0);
  }
});

test('forward and vertical reach doubles, with extra rear and rear-diagonal coverage at every altitude', () => {
  const cases = [[210, 0, true], [215, 0, false], [0, 210, true], [0, -210, true],
    [0, 215, false], [-315, 0, true], [-322, 0, false], [-260, 120, true], [-260, -120, true], [-300, 140, false]];
  for (const altitude of [0, 0.5, 1]) for (const [dx, dy, expected] of cases) {
    const { g, item } = setup('maintain', { side: 'bottom', age: 0.5 });
    g.altitude = altitude; g.cameraY = (0.5 - altitude) * 312;
    const p = worldToScreen(g, g.player);
    Object.assign(item, screenToWorld(g, { x: p.x + dx, y: p.y + dy }));
    updateGame(g, 0.001);
    assert.equal(Boolean(item.attracting), expected, `altitude ${altitude}, offset ${dx},${dy}`);
  }
});

test('rear items show an inward flight before finishing within 0.18 seconds at 20, 30, 60 and 144Hz', () => {
  for (const frame of [1 / 20, 1 / 30, 1 / 60, 1 / 144]) {
    const { g, item } = setup('maintain', { side: 'bottom', age: 0.5 });
    const p = worldToScreen(g, g.player);
    Object.assign(item, screenToWorld(g, { x: p.x - 300, y: p.y + 60 }));
    const startDistance = Math.hypot(item.x - g.player.x, item.y - g.player.y);
    const first = advance(g, 0.05, { y: 1 }, frame);
    assert.equal(item.attracting, true);
    assert.ok(Math.hypot(item.x - g.player.x, item.y - g.player.y) < startDistance * 0.8);
    assert.equal(g.pickups.length, 1, 'the traveling icon remains after the first rendered frame');
    const middle = advance(g, 0.05, { y: 1 }, frame);
    assert.equal(g.pickups.length, 1, 'the inward motion spans multiple rendered frames');
    const end = advance(g, 0.08, { y: 1 }, frame);
    assert.equal(item.dead, true);
    assert.equal(g.player.basicLevel, 2);
    assert.equal([...first, ...middle, ...end].filter(e => e.type === 'pickup').length, 1);
  }
});

test('nearby health and powerup icons are not removed by the old early distance threshold', () => {
  for (const type of ['health', 'change', 'maintain']) {
    const { g, item } = setup(type, { x: 268, side: type === 'health' ? undefined : 'bottom', weaponMode: 'helix' });
    advance(g, 0.1);
    assert.equal(item.attracting, true);
    assert.equal(g.pickups.length, 1, 'a nearby icon remains visible for at least 0.14 seconds');
    assert.ok(item.x < item.attractFrom.x, 'it visibly travels toward the ship');
    const events = advance(g, 0.1);
    assert.equal(g.pickups.length, 0);
    assert.equal(events.filter(e => e.type === 'pickup').length, 1);
  }
});
