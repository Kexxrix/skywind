import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, startGame, updateGame, consumeEvents, PLAYER_HIT_RADIUS, BOSS_KINDS } from '../src/game.js';
import { Renderer } from '../src/renderer.js';

const STEP = 1 / 120;

function playable() {
  const game = createGame(74912);
  startGame(game);
  game.mode = 'playing';
  Object.assign(game.player, { x: 220, y: 360, invincible: 0 });
  game.nextWaveAt = game.nextBossAt = game.nextPickupAt = Infinity;
  consumeEvents(game);
  return game;
}

function bullet(game, overrides = {}) {
  return { x: game.player.x, y: game.player.y, vx: 0, vy: 0, radius: 5.5, power: 12, age: 0, type: 'orb', ...overrides };
}

function enemy(game, overrides = {}) {
  return { id: 900, type: 'beetle', x: game.player.x + 100, y: game.player.y,
    baseY: game.player.y, radius: 28, hp: 10, maxHp: 10, speed: 0,
    age: 0, phase: 0, angle: 0, fireCooldown: Infinity, attack: 0, ...overrides };
}

test('damage radius matches the clear nucleus and resets independently of the ship sprite', () => {
  const game = playable();
  assert.equal(PLAYER_HIT_RADIUS, 1.85);
  assert.equal(game.player.radius, PLAYER_HIT_RADIUS);
  game.player.radius = 17;
  startGame(game);
  assert.equal(game.player.radius, PLAYER_HIT_RADIUS);
});

test('the real renderer fills the shared damage core last, with contrast entirely outside its edge', () => {
  for (const point of [{ x: 220, y: 360 }, { x: 203.25, y: -75 }, { x: 375, y: 801 }]) {
    const fills = [], stack = [];
    let path = [];
    const context = {
      globalAlpha: 0.37, fillStyle: '#000000', globalCompositeOperation: 'source-over',
      save() { stack.push({ globalAlpha: this.globalAlpha, fillStyle: this.fillStyle, globalCompositeOperation: this.globalCompositeOperation }); },
      restore() { Object.assign(this, stack.pop()); },
      beginPath() { path = []; },
      arc(x, y, radius, start, end) { path.push({ x, y, radius, start, end }); },
      fill() { fills.push({ arcs: [...path], color: this.fillStyle, alpha: this.globalAlpha }); },
      stroke() { assert.fail('a centered stroke must not cover the bright damage core'); },
    };
    const game = playable();
    Object.assign(game.player, point);
    Object.assign(game, { cameraY: 156, altitude: 0.03 });
    // Invoke the production drawing method without constructing DOM/GPU resources.
    Renderer.prototype.drawCombatCues.call({ flashes: [] }, context, game);
    assert.equal(fills.length, 2);
    const [backing, core] = fills;
    assert.deepEqual(core.arcs, [{ ...point, radius: PLAYER_HIT_RADIUS, start: 0, end: Math.PI * 2 }]);
    assert.equal(game.player.radius, core.arcs[0].radius, 'drawn bright nucleus and actual damage circle must agree');
    assert.equal(core.color, '#c8fff0');
    assert.equal(core.alpha, 1, 'the final core must remain fully opaque over its backing');
    assert.deepEqual(backing.arcs, [{ ...point, radius: PLAYER_HIT_RADIUS + 1.5, start: 0, end: Math.PI * 2 }]);
    assert.notEqual(backing.color, core.color);
    assert.equal(context.globalAlpha, 0.37, 'drawing restores the caller context');
  }
});

test('all hostile bullet styles graze wings but damage the actual central core', () => {
  for (const [type, radius, power] of [['orb', 5.5, 12], ['plasma', 7, 17], ['needle', 5.5, 12], ['mine', 12, 19]]) {
    for (const [offset, expectedHp] of [[2, 100], [-0.1, 100 - power]]) {
      const game = playable();
      game.enemyBullets.push(bullet(game, { type, radius, power, y: game.player.y + radius + PLAYER_HIT_RADIUS + offset,
        // Rendering-only values must never enlarge the collision circle.
        glowRadius: 200, flareLength: 800, arming: 0 }));
      updateGame(game, STEP);
      assert.equal(game.player.hp, expectedHp, `${type}: offset ${offset}`);
    }
  }
});

test('static and fast swept tangents are grazes, while a small penetration is a hit', () => {
  for (const speed of [0, -9600]) {
    for (const [inset, expectedHp] of [[-0.01, 100], [0, 100], [0.01, 88]]) {
      const game = playable();
      game.enemyBullets.push(bullet(game, { x: game.player.x + (speed ? 40 : 0),
        y: game.player.y + 5.5 + PLAYER_HIT_RADIUS - inset, vx: speed }));
      updateGame(game, STEP);
      assert.equal(game.player.hp, expectedHp, `velocity ${speed}, inset ${inset}`);
    }
  }
});

test('a fast bullet crossing the core between both nonoverlapping endpoints still damages once', () => {
  const game = playable();
  game.enemyBullets.push(bullet(game, { x: 260, vx: -9600 }));
  updateGame(game, STEP);
  assert.equal(game.player.hp, 88);
  assert.equal(game.enemyBullets.length, 0);
  assert.equal(consumeEvents(game).filter(e => e.type === 'hit' && e.player).length, 1);
});

test('relative sweep includes player motion and rejects parallel separated trajectories', () => {
  for (const crosses of [false, true]) {
    const game = playable();
    game.player.vx = 12000; // Deliberate stress fixture, not a changed gameplay speed.
    const prediction = structuredClone(game);
    updateGame(prediction, STEP);
    const deltaX = prediction.player.x - game.player.x;
    const deltaY = prediction.player.y - game.player.y;
    assert.ok(deltaX > 60, 'fixture crosses more than the central hit diameter');
    game.enemyBullets.push(bullet(game, { x: game.player.x + (crosses ? 70 : 50),
      vx: crosses ? -100 / STEP : deltaX / STEP, vy: deltaY / STEP }));
    updateGame(game, STEP);
    assert.equal(game.player.hp, crosses ? 88 : 100);
  }
});

test('moving enemy bodies cannot skip the player between nonoverlapping endpoints', () => {
  const game = playable();
  game.enemies.push(enemy(game, { x: 400, speed: 30000, phase: -STEP * 2.1 }));
  updateGame(game, STEP);
  assert.equal(game.player.hp, 78);
  assert.ok(game.enemies[0].x < game.player.x - 50);
});

test('circular enemy body types keep their existing radii and 22 damage with core-only contact', () => {
  for (const [type, radius] of [['beetle', 28], ['wasp', 22], ['claw', 33], ['dragonfly', 18], ['ray', 35], ['mantis', 31], ['orb', 29]]) {
    for (const [offset, expectedHp] of [[5, 100], [-0.1, 78]]) {
      const game = playable();
      game.enemies.push(enemy(game, { type, radius, x: game.player.x + radius * 0.7 + PLAYER_HIT_RADIUS + offset }));
      updateGame(game, 0.001);
      assert.equal(game.player.hp, expectedHp, `${type}: offset ${offset}`);
      assert.equal(game.enemies[0].radius, radius);
    }
  }
});

test('worm and needle preserve offset/rotated elliptical bodies without wing contact', () => {
  const dt = 0.001;
  for (const [type, hitbox, angles] of [['worm', { x: 5, y: -7, rx: 69, ry: 19 }, [-0.15, 0, 0.15]],
    ['needle', { x: 0, y: 0, rx: 50, ry: 22 }, [-1.1, 0, 1.1]]]) {
    for (const angle of angles) for (const axis of ['x', 'y']) for (const [offset, expectedHp] of [[0.1, 100], [-0.1, 78]]) {
      const game = playable();
      const c = Math.cos(angle), s = Math.sin(angle);
      const localX = hitbox.x + (axis === 'x' ? hitbox.rx + PLAYER_HIT_RADIUS + offset : 0);
      const localY = hitbox.y + (axis === 'y' ? hitbox.ry + PLAYER_HIT_RADIUS + offset : 0);
      const x = game.player.x - localX * c + localY * s;
      const y = game.player.y - localX * s - localY * c;
      const phase = type === 'worm' ? Math.acos(angle / 0.18) - dt * 1.9 : 0;
      game.enemies.push(enemy(game, { type, hitbox, x, y, angle, phase,
        baseY: type === 'worm' ? y - Math.sin(phase + dt * 1.9) * 75 : y,
        locked: type === 'needle', attackAngle: Math.PI + angle }));
      updateGame(game, dt);
      assert.equal(game.player.hp, expectedHp, `${type}, angle ${angle}, ${axis}, offset ${offset}`);
    }
  }
});

test('all boss bodies retain their circle and 30 contact damage without a wing-only hit', () => {
  for (const [index, bossKind] of BOSS_KINDS.entries()) for (const [offset, expectedHp] of [[5, 100], [-0.1, 70]]) {
    const game = playable();
    const radius = [92, 95, 78, 90][index];
    // Start overlap is intentional; moving away within the step still counts.
    game.enemies.push(enemy(game, { type: 'boss', bossKind, radius,
      x: game.player.x + radius * 0.7 + PLAYER_HIT_RADIUS + offset }));
    updateGame(game, 0.001);
    assert.equal(game.player.hp, expectedHp, `${bossKind}: offset ${offset}`);
  }
});

test('a mine only sweeps the armed part of its step, never its pre-arm path', () => {
  for (const [startX, vx, arming, expectedHp] of [[0, 0, 0.02, 100], [20, -7200, 0.005, 100], [30, -4800, 0.005, 81]]) {
    const game = playable();
    game.enemyBullets.push(bullet(game, { x: game.player.x + startX, vx, type: 'mine', radius: 12, power: 19, arming }));
    updateGame(game, STEP);
    assert.equal(game.player.hp, expectedHp);
  }
});

test('invulnerability expiry does not retroactively damage a pre-expiry crossing', () => {
  const game = playable();
  game.player.invincible = 0.001;
  game.enemyBullets.push(bullet(game, { x: game.player.x + 20, vx: -30000 }));
  updateGame(game, STEP);
  assert.equal(game.player.invincible, 0);
  assert.equal(game.player.hp, 100);
});

test('frame rates and camera altitude/bank leave the same world-space hit and graze results', () => {
  for (const hz of [30, 60, 144]) for (const [altitude, cameraY, sceneTime] of [[0.03, 156, 0], [0.5, 0, 30], [0.97, -156, 60]]) {
    for (const [offset, expectedHp] of [[0, 88], [5.5 + PLAYER_HIT_RADIUS + 0.1, 100]]) {
      const game = playable();
      Object.assign(game, { altitude, cameraY, sceneTime });
      game.enemyBullets.push(bullet(game, { x: game.player.x + 60, y: game.player.y + offset, vx: -420 }));
      for (let time = 0; time < 0.3 - 1e-9; time += 1 / hz) updateGame(game, Math.min(1 / hz, 0.3 - time));
      assert.equal(game.player.hp, expectedHp, `${hz}Hz, altitude ${altitude}, offset ${offset}`);
    }
  }
});

test('all item types use the wider 212-unit attraction boundary independently of damage', () => {
  for (const type of ['health', 'power', 'drone']) for (const [distance, attracted] of [[211.9, true], [212.1, false]]) {
    const game = playable();
    game.player.hp = 70;
    game.pickups.push({ x: game.player.x + distance + 240 * STEP,
      y: game.player.y, baseY: game.player.y - Math.sin(STEP * 2.2) * 9, radius: 22, type, phase: 0 });
    updateGame(game, STEP);
    assert.equal(Boolean(game.pickups[0].attracting), attracted, `${type}, distance ${distance}`);
    assert.equal(consumeEvents(game).filter(e => e.type === 'pickupAttract').length, attracted ? 1 : 0);
    assert.equal(game.player.radius, PLAYER_HIT_RADIUS);
  }
});
