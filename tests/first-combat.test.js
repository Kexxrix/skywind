import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, startGame, updateGame, consumeEvents, screenToWorld, worldToScreen, PLAYER_HIT_RADIUS, WEAPON_DURATION } from '../src/game.js';
const STEP = 1 / 120;
const close = (a, b, epsilon = 1e-7) => assert.ok(Math.abs(a - b) <= epsilon, `${a} != ${b}`);
function playable(seed = 73) {
  const g = createGame(seed); startGame(g); g.mode = 'playing';
  Object.assign(g.player, { x: 220, y: 360, invincible: 0 });
  g.nextWaveAt = g.nextBossAt = g.nextPickupAt = Infinity;
  consumeEvents(g); return g;
}
function advance(g, seconds, input = {}, frame = STEP) {
  const events = [];
  for (let t = 0; t < seconds - 1e-9; t += frame) {
    updateGame(g, Math.min(frame, seconds - t), input); events.push(...consumeEvents(g));
  }
  return events;
}
function bullet(g, margin = 0, extra = {}) {
  return { id: g.nextId++, x: g.player.x, y: g.player.y + PLAYER_HIT_RADIUS + 5.5 + margin,
    vx: 0, vy: 0, radius: 5.5, power: 12, age: 0, ...extra };
}
function item(g, type, extra = {}) {
  g.pickups.push({ id: g.nextId++, type, x: g.player.x, y: g.player.y, baseY: g.player.y,
    radius: 22, phase: 0, age: 0, ...extra });
  updateGame(g, STEP); return consumeEvents(g).find(e => e.type === 'pickup');
}
function defeat(g) {
  g.bullets.push({ x: g.boss.x, y: g.boss.y, vx: 0, vy: 0, radius: 100, power: 10000 });
  updateGame(g, STEP);
}

test('entry preserves the background but does not consume combat or supply time', () => {
  const g = createGame(12); advance(g, 1); const background = g.scrollTime;
  startGame(g); advance(g, 1.2);
  assert.equal(g.mode, 'playing'); close(g.time, 0); close(g.normalTime, 0);
  assert.equal(g.nextPickupAt, 6); assert.ok(g.scrollTime > background);
  advance(g, 3); assert.equal(g.supply.items[0].status, 'preview');
  close(g.supply.items[0].remaining, 3);
});

test('both bosses enter combat without a vertical warp at any altitude or frame rate', () => {
  for (const variant of [0, 1]) for (const direction of [-1, 0, 1]) for (const frame of [1 / 30, 1 / 60, 1 / 144]) {
    const g = playable(); advance(g, 6, { y: direction });
    g.bossesDefeated = variant; g.nextBossAt = g.time + STEP;
    updateGame(g, STEP, { y: direction });
    let lastY = worldToScreen(g, g.boss).y;
    close(lastY, 320);
    const originalHp = g.boss.hp, supplyClock = g.nextPickupAt;
    let crossed = false;
    for (let t = 0; t < 1.5; t += frame) {
      const entering = g.phase === 'boss-entry';
      // Reverse during entry too: the camera must move without moving the boss's screen path.
      updateGame(g, frame, { y: t > 0.55 ? -direction : direction });
      const y = worldToScreen(g, g.boss).y;
      assert.ok(Math.abs(y - lastY) <= 128 * frame + 1e-6, `${g.boss.bossKind} moved ${y - lastY}px`);
      if (entering && g.phase === 'boss') { crossed = true; assert.ok(Math.abs(y - 320) <= 128 * frame); }
      lastY = y;
    }
    assert.ok(crossed);
    assert.equal(g.boss.hp, originalHp);
    assert.equal(g.nextPickupAt, supplyClock);
  }
});

test('boss entry is invulnerable both ways and two real deaths start two complete normal segments', () => {
  const g = playable(); g.nextBossAt = 45; g.player.invincible = 500;
  advance(g, 45); assert.equal(g.phase, 'boss-entry'); assert.equal(g.boss.hp, 420);
  const boss = g.boss; defeat(g); assert.equal(boss.hp, 420);
  advance(g, 1.2); assert.equal(g.phase, 'boss');
  const supplyClock = g.nextPickupAt; defeat(g);
  assert.equal(g.bossesDefeated, 1); assert.equal(g.normalTime, 0);
  assert.equal(g.nextPickupAt, supplyClock); assert.equal(g.phase, 'normal');
  advance(g, 45); assert.equal(g.boss.bossKind, 'carrier'); assert.equal(g.boss.maxHp, 567);
  advance(g, 1.2); defeat(g);
  assert.equal(g.bossesDefeated, 2); assert.equal(g.cycle, 3); assert.equal(g.normalTime, 0);
});

test('the named three-second boss warning emits once per normal segment and restarts with a new run', () => {
  const g = playable(); g.normalTime = g.time = 41.99;
  const first = advance(g, 0.04).filter(e => e.type === 'bossWarning');
  assert.deepEqual(first.map(e => [e.bossName, e.bossKind, e.remaining]), [['WARDEN', 'warden', 3]]);
  assert.equal(advance(g, 0.1).filter(e => e.type === 'bossWarning').length, 0);
  g.bossesDefeated = 1; g.normalTime = 41.99;
  assert.equal(advance(g, 0.04).find(e => e.type === 'bossWarning').bossName, 'IRON CARRIER');
  startGame(g); g.mode = 'playing'; g.normalTime = 41.99; g.nextBossAt = Infinity;
  assert.equal(advance(g, 0.04).filter(e => e.type === 'bossWarning').length, 1);
});

test('background keys, night transition and return integrate distance without accelerating hostile bullets', () => {
  const g = playable(); g.player.invincible = 500;
  for (const [target, speed] of [[15, 1.35], [30, 1.8], [42, 2.2]]) {
    advance(g, target - g.time); close(g.backgroundSpeed, speed); close(g.night, 0);
  }
  g.nextBossAt = 45; advance(g, 3); const start = g.scrollTime;
  advance(g, 0.8); close(g.backgroundSpeed, 4.6); close(g.daylight, 0);
  assert.ok(g.scrollTime > start && g.scrollTime < start + 7.82 * 0.8 + 1e-6);
  advance(g, 0.41); const b = bullet(g, 200, { x: 700, vx: -160 }); g.enemyBullets.push(b);
  updateGame(g, 0.1); close(b.x, 684);
  defeat(g); const beforeReturn = g.scrollTime; advance(g, 1);
  close(g.night, 0); assert.ok(g.backgroundSpeed < 1.01); assert.ok(g.scrollTime > beforeReturn);
});

test('pause and gameover freeze simulation and explicit seed restart clears run-owned state only', () => {
  const g = playable(); g.tensionTime = 2; g.player.basicLevel = 5;
  item(g, 'change', { weaponMode: 'lance' }); g.mode = 'paused';
  const before = structuredClone(g); updateGame(g, 0.12, { shoot: true }); assert.deepEqual(g, before);
  g.mode = 'gameover'; updateGame(g, 0.12); assert.equal(g.time, before.time);
  const distance = g.scrollTime; startGame(g, 912);
  assert.equal(g.seed, 912); assert.equal(g.tensionTime, 0); assert.equal(g.player.basicLevel, 1);
  assert.equal(g.supply, null); assert.equal(g.bossesDefeated, 0); assert.equal(g.scrollTime, distance);
});

test('graze uses the real radius and its closed twelve-unit outer boundary', () => {
  for (const [margin, damage, tension] of [[-0.01, 12, false], [0, 0, true], [12, 0, true], [12.01, 0, false]]) {
    const g = playable(); g.enemyBullets.push(bullet(g, margin)); updateGame(g, STEP);
    assert.equal(g.player.hp, 100 - damage); assert.equal(g.tensionTime > 0, tension, `margin ${margin}`);
  }
});

test('one bullet can reward once, another refreshes to two seconds without stacking', () => {
  const g = playable(); const b = bullet(g, 5); g.enemyBullets.push(b); updateGame(g, STEP);
  assert.equal(g.tensionTime, 2); assert.equal(b.grazed, true);
  advance(g, 0.75); close(g.tensionTime, 1.25);
  g.enemyBullets.push(bullet(g, 6)); const events = advance(g, STEP);
  assert.equal(g.tensionTime, 2); assert.equal(events.find(e => e.type === 'tension').refresh, true);
  const end = advance(g, 2.02); assert.equal(g.tensionTime, 0);
  assert.equal(end.filter(e => e.type === 'tensionEnd' && e.reason === 'expired').length, 1);
});

test('damage wins over graze for either array order and body contact in the same simulation step', () => {
  for (const reverse of [false, true]) {
    const g = playable(); g.tensionTime = 1;
    const bullets = [bullet(g, 5), bullet(g, -5)]; g.enemyBullets = reverse ? bullets.reverse() : bullets;
    const events = advance(g, STEP);
    assert.equal(g.player.hp, 88); assert.equal(g.tensionTime, 0);
    assert.equal(events.filter(e => e.type === 'tension').length, 0);
  }
  const g = playable(); g.enemyBullets = [bullet(g, 5)];
  g.enemies = [{ id: 777, type: 'beetle', x: g.player.x, y: g.player.y, baseY: g.player.y,
    radius: 28, hp: 3, speed: 0, age: 0, phase: 0, fireCooldown: 10 }];
  updateGame(g, STEP); assert.equal(g.player.hp, 78); assert.equal(g.tensionTime, 0);
});

test('unarmed and invulnerable crossings do not grant tension; armed fast relative grazes agree across frames', () => {
  for (const invincible of [0, 1]) {
    const g = playable(); g.player.invincible = invincible;
    g.enemyBullets = [bullet(g, 4, { arming: invincible ? 0 : 1 })];
    advance(g, 0.1); assert.equal(g.tensionTime, 0);
  }
  for (const frame of [1 / 30, 1 / 60, 1 / 144]) {
    const g = playable(); g.enemyBullets.push(bullet(g, 5, { x: g.player.x + 60, vx: -4000 }));
    const events = advance(g, 0.1, {}, frame);
    assert.equal(g.player.hp, 100); assert.equal(events.filter(e => e.type === 'tension').length, 1);
  }
});

test('tension damage and cues are fixed on launch for basic, specials and drone', () => {
  for (const mode of ['normal', 'spread', 'lance', 'helix', 'drone']) {
    const g = playable(); g.tensionTime = 2;
    if (mode === 'drone') g.player.droneTime = 15;
    else if (mode !== 'normal') { g.player.weaponMode = mode; g.player.powerTime = 18; }
    advance(g, STEP, { shoot: true });
    const b = g.bullets.find(b => b.weaponMode === mode);
    assert.ok(b.tension); close(b.power, (mode === 'lance' ? 3 : ['spread', 'helix'].includes(mode) ? 2 : 1) * 1.5);
    const power = b.power; g.tensionTime = 0;
    const target = { id: 900, type: 'beetle', x: b.x, y: b.y, baseY: b.y, radius: 28,
      hp: 50, maxHp: 50, speed: 0, age: 0, phase: 0, fireCooldown: 10 };
    g.enemies = [target]; g.bullets = [b]; b.vx = b.vy = 0;
    const events = advance(g, STEP);
    close(target.hp, 50 - power); assert.equal(events.find(e => e.type === 'hit' && !e.player).tension, true);
  }
});

test('basic growth retains its firing interval and survives special expiration; MAX supports drones', () => {
  const g = playable(), expected = [[2, 1], [2, 1.4], [3, 1.4], [3, 1.8], [4, 1.8]];
  for (let level = 1; level <= 5; level++) {
    assert.equal(g.player.basicLevel, level); g.bullets = []; g.player.fireCooldown = 0;
    advance(g, STEP, { shoot: true }); assert.equal(g.bullets.length, expected[level - 1][0]);
    assert.ok(g.bullets.every(b => b.power === expected[level - 1][1]));
    close(g.player.fireCooldown, 0.095);
    if (level < 5) assert.equal(item(g, 'maintain').effect, 'levelUp');
  }
  assert.equal(item(g, 'maintain').effect, 'drone'); assert.equal(g.player.droneTime, 15);
  item(g, 'change', { weaponMode: 'helix' }); g.player.powerTime = 0.004;
  advance(g, STEP); assert.equal(g.player.powerTime, 0); assert.equal(g.player.basicLevel, 5);
});

test('maintenance uses the weapon at collection, caps special time, and respects pickup ordering', () => {
  const g = playable(); g.player.droneTime = 10;
  item(g, 'change', { weaponMode: 'lance' }); assert.equal(g.player.powerTime, WEAPON_DURATION);
  item(g, 'maintain'); close(g.player.powerTime, 33 - STEP);
  item(g, 'maintain'); assert.equal(g.player.powerTime, 45);
  assert.ok(g.player.droneTime < 10); assert.equal(g.player.basicLevel, 1);
  item(g, 'change', { weaponMode: 'spread' }); assert.equal(g.player.powerTime, 18);
  g.player.powerTime = 0.004; assert.equal(item(g, 'maintain').effect, 'levelUp');
  assert.equal(g.player.basicLevel, 2); assert.equal(g.player.powerTime, 0);
  const reverse = playable(); item(reverse, 'maintain'); item(reverse, 'change', { weaponMode: 'lance' });
  assert.equal(reverse.player.basicLevel, 2); assert.equal(reverse.player.powerTime, 18);
  assert.equal(g.score, 0); assert.equal(reverse.score, 0);
});

test('supply preview fixes opposite directions and a different named weapon; collection leaves the other side', () => {
  const g = playable(); g.nextPickupAt = 6; g.player.weaponMode = 'lance'; g.player.powerTime = 30;
  advance(g, 3); const preview = structuredClone(g.supply);
  assert.deepEqual(g.supply.items.map(i => i.side), ['top', 'bottom']);
  assert.deepEqual(g.supply.items.map(i => i.type).sort(), ['change', 'maintain']);
  assert.notEqual(g.supply.items.find(i => i.type === 'change').weaponMode, 'lance');
  advance(g, 3); assert.equal(g.pickups.length, 2); assert.equal(g.nextPickupAt, 21);
  assert.deepEqual(g.supply.items.map(i => [i.type, i.weaponMode]), preview.items.map(i => [i.type, i.weaponMode]));
  const upper = g.pickups.find(i => i.side === 'top');
  g.cameraY = -156; Object.assign(g.player, { x: upper.x, y: upper.y });
  advance(g, 0.3); assert.equal(g.pickups.length, 1); assert.equal(g.pickups[0].side, 'bottom');
  assert.equal(g.supply.items[0].status, 'collected');
  advance(g, 2.2); assert.equal(g.pickups.length, 0); assert.equal(g.supply.items[1].status, 'expired');
  assert.equal(g.score, 0);
});

test('normal input can collect both altitude supplies when prepositioned; late center departure cannot', () => {
  const tryRoute = prepositioned => {
    const g = playable(73); g.nextPickupAt = 6;
    const history = [];
    for (let frame = 0; frame < 8.2 * 120; frame++) {
      const targetY = prepositioned ? (history.length ? 1900 : -900) : (g.time < 6 ? 360 : 1900);
      const pointer = screenToWorld(g, { x: g.time < 6 ? 360 : 360 - (g.time - 6) * 150, y: targetY });
      updateGame(g, STEP, { pointer });
      history.push(...consumeEvents(g).filter(e => e.type === 'pickup' && e.side));
    }
    return history;
  };
  assert.equal(tryRoute(true).length, 2);
  assert.ok(tryRoute(false).length <= 1);
});

test('supplies approach continuously from offscreen right during the existing warning', () => {
  const g = playable(); g.nextPickupAt = 6;
  advance(g, 3);
  const ids = g.pickups.map(i => i.id);
  assert.equal(ids.length, 2);
  let previousX = worldToScreen(g, g.pickups[0]).x;
  assert.ok(previousX > 1280);
  for (let i = 0; i < 390; i++) {
    updateGame(g, STEP);
    const pickup = g.pickups[0], position = worldToScreen(g, pickup);
    assert.deepEqual(g.pickups.map(item => item.id), ids, 'arrival reuses the approaching items');
    assert.ok(position.x < previousX && previousX - position.x < 5, 'no pop or teleport at arrival');
    close(position.y + g.cameraY, -60);
    previousX = position.x;
  }
  assert.equal(g.pickups[0].approach, false);
  assert.equal(g.supply.items[0].status, 'active');
  assert.equal(g.nextPickupAt, 21);
  advance(g, 1.9);
  assert.equal(g.pickups.length, 0);
  assert.ok(g.supply.items.every(i => i.status === 'expired'));
});

test('holding only up or down finds and collects the extreme altitude supply at different frame rates', () => {
  for (const side of ['top', 'bottom']) for (const frame of [1 / 30, 1 / 60, 1 / 144]) {
    const g = createGame(73); startGame(g);
    const input = { y: side === 'top' ? -1 : 1, shoot: true };
    advance(g, 5.7, input, frame); // Includes the unmodified 1.2-second ship entry.
    const p = worldToScreen(g, g.player), item = g.pickups.find(i => i.side === side);
    const position = worldToScreen(g, item);
    close(p.y, side === 'top' ? 48 : 672, 0.01);
    assert.ok(position.x > 700 && position.x < 1280, 'visible in front of the ship');
    assert.ok(position.y >= 48 && position.y <= 672, 'ring stays inside the viewport');
    close(Math.abs(position.y - p.y), 48, 0.01);
    const events = advance(g, 3.8, input, frame).filter(e => e.type === 'pickup' && e.side);
    assert.deepEqual(events.map(e => e.side), [side]);
    assert.equal(g.supply.items.find(i => i.side === side).status, 'collected');
  }
});

test('real scheduled supplies attract during approach on both sides and retain their collection at arrival', () => {
  for (const side of ['top', 'bottom']) for (const frame of [1 / 30, 1 / 60, 1 / 144]) {
    const g = createGame(71); startGame(g);
    const input = { x: 1, y: side === 'top' ? -1 : 1, shoot: true };
    advance(g, 5.7, input, frame);
    const target = g.pickups.find(i => i.side === side), chosenType = target.type;
    assert.ok(Number.isFinite(target.arrivalAt));
    let caughtAt = null, collectedAt = null;
    for (let t = 0; t < 3; t += frame) {
      updateGame(g, frame, input);
      for (const e of consumeEvents(g).filter(e => e.side === side)) {
        if (e.type === 'pickupAttract') {
          assert.equal(caughtAt, null); caughtAt = g.time;
          assert.equal(target.approach, false);
          assert.ok(target.age < 0, 'the incoming item is caught before the nominal arrival');
        }
        if (e.type === 'pickup') { assert.equal(collectedAt, null); collectedAt = g.time; assert.equal(e.pickupType, chosenType); }
      }
    }
    assert.ok(caughtAt < 6 && collectedAt < 6);
    assert.ok(collectedAt - caughtAt >= 0.14 - frame - STEP);
    assert.equal(g.supply.items.find(i => i.side === side).status, 'collected');
    assert.equal(g.nextPickupAt, 21, 'catching early does not advance the supply schedule');
  }
});

test('a normal downward flyby followed by ascent catches the supply instead of being rejected during preview', () => {
  for (const frame of [1 / 30, 1 / 60, 1 / 144]) {
    const g = createGame(71); startGame(g);
    const collected = [];
    for (let t = 0; t < 9.5; t += frame) {
      updateGame(g, frame, { y: g.time < 5.25 ? 1 : -1, shoot: true });
      collected.push(...consumeEvents(g).filter(e => e.type === 'pickup' && e.side === 'bottom'));
    }
    assert.equal(collected.length, 1, 'the previously missed lower powerup is collected exactly once');
  }
});

test('supply expiry accepts a just-before-expiry crossing but rejects an already expired item', () => {
  for (const [age, collected] of [[2.099, true], [2.101, false]]) {
    const g = playable();
    g.pickups.push({ id: 2, type: 'maintain', side: 'top', x: g.player.x, y: g.player.y, radius: 22, age });
    updateGame(g, STEP);
    assert.equal(g.player.basicLevel === 2, collected);
    assert.equal(g.pickups.length, 0);
  }
});

test('fixed recovery and marked-drone drop replace random enemy rewards', () => {
  const g = playable(); g.normalTime = 23.99; g.time = 23.99; g.droneMarked = false;
  advance(g, 0.02); assert.equal(g.pickups.filter(i => i.type === 'health').length, 1);
  advance(g, 0.05); assert.equal(g.pickups.filter(i => i.type === 'health').length, 1);
  g.normalTime = 36; g.time = 36; g.nextWaveAt = 0;
  updateGame(g, STEP); assert.equal(g.enemies.filter(e => e.markedDrone).length, 1);
  const marked = g.enemies.find(e => e.markedDrone);
  Object.assign(marked, { x: 650, y: 360, baseY: 360, speed: 0, hp: 1 });
  g.bullets = [{ x: marked.x, y: marked.y, vx: 0, vy: 0, radius: 50, power: 2 }];
  updateGame(g, STEP); assert.equal(g.pickups.filter(i => i.type === 'drone').length, 1);
});
