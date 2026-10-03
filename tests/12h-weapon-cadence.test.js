import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, startGame, updateGame, consumeEvents } from '../src/game.js';
import { basicWeapon } from '../src/level.js';

const rates = [30, 60, 144];
function fixture(entering = false) {
  const g = createGame(140302);
  startGame(g);
  if (!entering) g.mode = 'playing';
  g.nextWaveAt = g.nextBossAt = g.nextPickupAt = Infinity;
  g.recoverySpawned = true;
  consumeEvents(g);
  return g;
}
function advance(g, seconds, fps, input) {
  const shots = [];
  for (let elapsed = 0; elapsed < seconds - 1e-9; elapsed += 1 / fps) {
    updateGame(g, Math.min(1 / fps, seconds - elapsed), input);
    shots.push(...consumeEvents(g).filter(e => e.type === 'shot'));
  }
  return shots;
}
function cadence(shots, interval) {
  assert.ok(shots.length > 1);
  for (let i = 0; i < shots.length; i++) {
    const error = shots[i].simulationAt - shots[0].simulationAt - i * interval;
    assert.ok(Math.abs(error) < 1 / 120 + 1e-8, `shot ${i} accumulated ${error}s error`);
  }
}

test('the original 30-second entering/default-gun QA input has equal shot counts at 30/60/144 Hz', () => {
  const rows = rates.map(fps => {
    const g = fixture(true), shots = advance(g, 30, fps, { shoot: true });
    assert.equal(g.player.basicLevel, 1);
    assert.equal(g.player.hp, 100);
    cadence(shots, .095);
    return shots.length;
  });
  assert.deepEqual(rows, [304, 304, 304]);
});

test('all basic levels and powered volleys retain their geometry and equal game-time cadence', () => {
  for (const mode of ['normal', 'spread', 'lance', 'helix']) {
    for (const level of mode === 'normal' ? [1, 2, 3, 4, 5] : [1]) {
      const rows = rates.map(fps => {
        const g = fixture();
        Object.assign(g.player, { basicLevel: level, weaponMode: mode, powerTime: mode === 'normal' ? 0 : 45 });
        updateGame(g, 1 / fps, { shoot: true });
        const first = consumeEvents(g).filter(e => e.type === 'shot');
        const volleySize = mode === 'normal' ? basicWeapon(level).offsets.length : { spread: 5, lance: 3, helix: 4 }[mode];
        assert.equal(first.length, 1);
        assert.equal(g.bullets.length, volleySize, mode + ' stays one complete volley');
        const shots = first.concat(advance(g, 3 - 1 / fps, fps, { shoot: true }));
        assert.ok(Math.abs(g.time - 3) < 1e-8);
        cadence(shots, mode === 'normal' ? .095 : .085);
        return shots.length;
      });
      assert.deepEqual(rows, mode === 'normal' ? [32, 32, 32] : [36, 36, 36], `${mode}/Lv${level}`);
    }
  }
});

test('drone and primary clocks remain independent with equal shot counts at every update rate', () => {
  for (const mode of ['normal', 'lance']) {
    const rows = rates.map(fps => {
      const g = fixture();
      Object.assign(g.player, { weaponMode: mode, powerTime: mode === 'normal' ? 0 : 45, droneTime: 45 });
      const shots = advance(g, 3, fps, { shoot: true });
      const primary = shots.filter(e => !e.drone), drone = shots.filter(e => e.drone);
      cadence(primary, mode === 'normal' ? .095 : .085);
      cadence(drone, .17);
      return [primary.length, drone.length];
    });
    assert.deepEqual(rows, mode === 'normal' ? [[32, 18], [32, 18], [32, 18]] : [[36, 18], [36, 18], [36, 18]]);
  }
});

test('release, pause, zero-time updates, long idle and restart never bank catch-up volleys', () => {
  for (const fps of rates) {
    const g = fixture();
    g.player.droneTime = 45;
    advance(g, .3, fps, { shoot: true });
    g.mode = 'paused';
    const paused = structuredClone(g);
    updateGame(g, 120, { shoot: true });
    updateGame(g, 0, { shoot: true });
    assert.deepEqual(g, paused);
    g.mode = 'playing';
    advance(g, 30, fps, { shoot: false });
    g.player.droneTime = 45;
    const resumed = advance(g, 1 / fps, fps, { shoot: true });
    assert.equal(resumed.filter(e => !e.drone).length, 1);
    assert.equal(resumed.filter(e => e.drone).length, 1);
    advance(g, 30, fps, { shoot: false });
    updateGame(g, 120, { shoot: true });
    assert.ok(consumeEvents(g).filter(e => e.type === 'shot' && !e.drone).length <= 2, 'existing .12s dt clamp bounds catch-up');
    startGame(g);
    assert.equal(g.player.fireCooldown, 0);
    assert.equal(g.player.droneCooldown, 0);
    assert.equal(g.bullets.length, 0);
    assert.deepEqual(consumeEvents(g).map(e => e.type), ['start']);
  }
});
