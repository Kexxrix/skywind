import test from 'node:test';
import assert from 'node:assert/strict';
import { supplyPresentation, tensionPresentation, healthPresentation, weaponPresentation, pickupPresentation, gameViewport, SUPPLY_COLORS } from '../src/presentation.js';
import { createGame, getWeaponStatus } from '../src/game.js';

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} differs from ${expected}`);
const supply = (side, type = 'change', extra = {}) => ({ id: side === 'top' ? 41 : 42, side, type, weaponMode: 'lance', status: 'preview', remaining: 3, ...extra });

test('supply action colors stay yellow for maintenance and blue for replacement at either altitude', () => {
  const player = Object.freeze({ basicLevel: 2, powerTime: 0 });
  for (const type of ['change', 'maintain']) {
    const top = supplyPresentation(Object.freeze(supply('top', type)), player);
    const bottom = supplyPresentation(Object.freeze(supply('bottom', type)), player);
    const group=type==='change'?'change':'maintain';
    assert.equal(top.color, type==='change'?'#70BCFF':'#FFD46B');
    assert.equal(bottom.color,top.color);
    assert.equal(top.color,SUPPLY_COLORS[group]);
    assert.equal(bottom.colorGroup,group);
    assert.ok(top.label.startsWith('↑ '));
    assert.ok(bottom.label.startsWith('↓ '));
    assert.equal(top.effect, bottom.effect);
  }
});

test('an announced change keeps its chosen weapon through player expiry, growth and replacement', () => {
  const item = Object.freeze(supply('top', 'change', { weaponMode: 'helix', remaining: 1.25 }));
  const before = JSON.stringify(item);
  for (const player of [
    { powerTime: 0, basicLevel: 1, weaponMode: 'spread' },
    { powerTime: 0.001, basicLevel: 3, weaponMode: 'spread' },
    { powerTime: 45, basicLevel: 5, weaponMode: 'lance' },
  ]) {
    const shown = supplyPresentation(item, Object.freeze(player));
    assert.equal(shown.effect, 'SWAP · HELIX 18s');
    assert.equal(shown.mode, 'helix');
    assert.equal(shown.id, 41);
  }
  assert.equal(JSON.stringify(item), before, 'presentation cannot redraw the supply choice');
});

test('maintain label follows current main weapon, including the exact expiry and basic MAX boundaries', () => {
  const item = Object.freeze(supply('bottom', 'maintain'));
  const cases = [
    [{ powerTime: 0.001, basicLevel: 2 }, 'EXTEND +15s'],
    [{ powerTime: 0, basicLevel: 2 }, 'BASE Lv.2 → 3'],
    [{ powerTime: 0, basicLevel: 4, droneTime: 15 }, 'BASE Lv.4 → 5'],
    [{ powerTime: 0, basicLevel: 5, droneTime: 0 }, 'DRONE 15s'],
    [{ powerTime: 0, basicLevel: 5, droneTime: 9 }, 'DRONE 15s'],
    [{ powerTime: 35, basicLevel: 5, droneTime: 15 }, 'EXTEND +10s'],
    [{ powerTime: 44.5, basicLevel: 5, droneTime: 15 }, 'EXTEND +0.5s'],
    [{ powerTime: 44.999, basicLevel: 5, droneTime: 15 }, 'EXTEND +<0.1s'],
    [{ powerTime: 45, basicLevel: 5, droneTime: 15 }, 'MAX 45s'],
  ];
  for (const [player, expected] of cases) assert.equal(supplyPresentation(item, Object.freeze(player)).effect, expected);
  assert.equal(item.weaponMode, 'lance', 'current-effect labels do not mutate the supply seed or selection');
});

test('preview is arrival countdown, active is collection lifetime and neither creates a HUD timer', () => {
  const player = Object.freeze({ basicLevel: 1, powerTime: 0 });
  const previewItem = Object.freeze(supply('top', 'change', { remaining: 1.5 }));
  const preview = supplyPresentation(previewItem, player);
  assert.equal(preview.phase, 'APPROACH');
  assert.equal(preview.label, '↑ SWAP · LANCE 18s · 1.5s');
  near(preview.gauge, 0.5);
  const active = supplyPresentation(Object.freeze({ ...previewItem, status: 'active', remaining: 1.05 }), player);
  assert.equal(active.phase, 'COLLECT');
  assert.equal(active.remaining, 1.05);
  near(active.gauge, 0.5);
  for (let frame = 0; frame < 100; frame += 1) assert.deepEqual(supplyPresentation(previewItem, player), preview);
});

test('collecting or expiring one supply only removes that side and a new schedule can reuse the side', () => {
  const player = Object.freeze({ basicLevel: 3, powerTime: 0 });
  const bottom = Object.freeze(supply('bottom', 'maintain', { status: 'active', remaining: 1.2 }));
  const shownBottom = supplyPresentation(bottom, player);
  for (const status of ['collected', 'expired', 'inactive']) {
    assert.equal(supplyPresentation(supply('top', 'change', { status }), player), null);
    assert.deepEqual(supplyPresentation(bottom, player), shownBottom);
  }
  assert.equal(supplyPresentation(null, player), null);
  assert.equal(supplyPresentation(undefined, player), null);
  assert.equal(supplyPresentation(supply('top', 'change', { id: 43 }), player).id, 43);
});

test('display gauges cannot overfill or run backwards near supply transitions', () => {
  const player = { basicLevel: 1, powerTime: 0 };
  for (const [status, maximum] of [['preview', 3], ['active', 2.1]]) {
    for (const remaining of [-0.001, 0, maximum, maximum + 0.001]) {
      const shown = supplyPresentation(supply('top', 'change', { status, remaining }), player);
      assert.ok(shown.gauge >= 0 && shown.gauge <= 1);
      assert.ok(shown.remaining >= 0);
      if (remaining <= 0) assert.ok(shown.label.endsWith('0.0s'));
    }
  }
});

test('tension countdown, refresh and expiry are direct projections of the two-second combat state', () => {
  assert.deepEqual(tensionPresentation(2), { active: true, remaining: 2, gauge: 1, label: '2.0s' });
  assert.deepEqual(tensionPresentation(1.5), { active: true, remaining: 1.5, gauge: 0.75, label: '1.5s' });
  assert.deepEqual(tensionPresentation(2), tensionPresentation(20), 'late UI frames cannot overfill the gauge');
  for (const remaining of [0, -0.1, undefined]) {
    assert.deepEqual(tensionPresentation(remaining), { active: false, remaining: 0, gauge: 0, label: 'GRAZE TO CHARGE' });
  }
  assert.equal(tensionPresentation(0.001).active, true, 'the UI must not expire the last fraction of a second early');
});

test('actual weapon status uses the 45-second ceiling while drone remains an independent 15-second slot', () => {
  const base = createGame(74912).player;
  for (const [remaining, expectedGauge] of [[18, 0.4], [33, 33 / 45], [45, 1], [0.001, 0.001 / 45]]) {
    const player = Object.freeze({ ...base, basicLevel: 4, weaponMode: 'helix', powerTime: remaining, droneTime: 7.5 });
    const shown = getWeaponStatus(player);
    assert.equal(shown.mode, 'helix');
    assert.equal(shown.remaining, remaining);
    assert.equal(shown.maxDuration, 45);
    near(shown.gauge, expectedGauge);
    assert.equal(shown.level, 4);
    assert.deepEqual(shown.drone, { remaining: 7.5, gauge: 0.5 });
  }
  const expired = getWeaponStatus(Object.freeze({ ...base, powerTime: 0, basicLevel: 5, droneTime: 15 }));
  assert.equal(expired.mode, 'normal');
  assert.equal(expired.remaining, 0);
  assert.equal(expired.level, 5);
  assert.equal(expired.drone.gauge, 1, 'main expiry does not clear the support slot');
});

test('HUD viewport excludes letterbox bars for desktop, tablet and mobile including fullscreen', () => {
  const cases = [
    [1920, 1080, 1920, 1080, 0, 0, 'large'],
    [1366, 768, 1365.3333333333333, 768, 1 / 3, 0, 'large'],
    [1024, 768, 1024, 576, 0, 96, 'medium'],
    [844, 390, 693.3333333333333, 390, 75.33333333333337, 0, 'small'],
    [390, 844, 390, 219.375, 0, 312.3125, 'small'],
    [2560, 1080, 1920, 1080, 320, 0, 'large'],
  ];
  for (const [width, height, expectedWidth, expectedHeight, left, top, size] of cases) {
    const view = gameViewport(width, height);
    near(view.width, expectedWidth); near(view.height, expectedHeight);
    near(view.left, left); near(view.top, top);
    assert.equal(view.size, size);
    near(view.width / view.height, 16 / 9);
    assert.ok(view.width <= width && view.height <= height);
    const ordinaryShell = gameViewport(view.width, view.height);
    near(ordinaryShell.left, 0); near(ordinaryShell.top, 0);
    near(ordinaryShell.width, view.width);
  }
});

test('compact and responsive boundaries use the game rectangle rather than the outer window', () => {
  const cases = [
    [639, 'small', true], [640, 'small', false],
    [799, 'small', false], [800, 'medium', false],
    [1279, 'medium', false], [1280, 'large', false],
  ];
  for (const [width, size, compact] of cases) {
    const view = gameViewport(width, 1080);
    assert.equal(view.size, size); assert.equal(view.compact, compact);
  }
  const portrait = gameViewport(390, 844), landscape = gameViewport(844, 390);
  assert.equal(portrait.compact, true); assert.equal(portrait.short, true);
  assert.equal(landscape.size, 'small', '844px browser does not provide an 844px game region');
  assert.equal(landscape.compact, false); assert.equal(landscape.short, false);
  const shortened = gameViewport(844, 280);
  assert.equal(shortened.compact, true); assert.equal(shortened.short, true);
  near(shortened.top, 0);
});

test('HP warning labels and meter use actual HP with exact warning boundaries', () => {
  for (const [hp,state,label] of [[100,'stable','HP'],[56,'stable','HP'],[55,'warning','CAUTION'],
    [31,'warning','CAUTION'],[30,'critical','LOW HP'],[1,'critical','LOW HP'],[0,'critical','LOW HP']]) {
    const player=Object.freeze({hp,maxHp:100}),shown=healthPresentation(player);
    assert.equal(shown.state,state);assert.equal(shown.label,label);
    assert.equal(shown.value,String(hp));near(shown.gauge,hp/100);
    assert.equal(player.hp,hp,'HUD cannot heal or damage the player');
  }
  assert.equal(healthPresentation({hp:120,maxHp:150}).value,'120');
  near(healthPresentation({hp:120,maxHp:150}).gauge,.8);
  assert.equal(healthPresentation({hp:200,maxHp:150}).gauge,1);
  assert.equal(healthPresentation({hp:-1,maxHp:100}).gauge,0);
});

test('weapon projection retains the last combat fraction and returns to the actual base growth', () => {
  const base=createGame(74912).player;
  for (const level of [1,2,3,4,5]) {
    const player=Object.freeze({...base,basicLevel:level,weaponMode:'helix',powerTime:0,droneTime:0});
    const shown=weaponPresentation(player);
    assert.equal(shown.mode,'normal');assert.equal(shown.special,false);
    assert.equal(shown.time,level===5?'MAX':`Lv.${level}`);near(shown.gauge,level/5);
    assert.equal(shown.drone,null);
  }
  for (const remaining of [45,18,3,.001]) {
    const player=Object.freeze({...base,basicLevel:4,weaponMode:'helix',powerTime:remaining,droneTime:.001});
    const before=JSON.stringify(player),shown=weaponPresentation(player);
    assert.equal(shown.mode,'helix');assert.equal(shown.special,true);
    assert.equal(shown.warning,remaining<=3);near(shown.gauge,remaining/45);
    assert.equal(shown.drone.time,'0.1s');assert.equal(shown.drone.warning,true);
    assert.equal(JSON.stringify(player),before);
  }
  assert.equal(weaponPresentation({...base,powerTime:.001,weaponMode:'helix'}).time,'0.1s');
});

test('item action projection distinguishes extension, base growth, support and real replacement without side input', () => {
  const base=createGame(74912).player;
  const cases=[
    [{...base,powerTime:18,weaponMode:'lance'},'maintain','extend','maintain','EXTEND +15s'],
    [{...base,powerTime:44.5,weaponMode:'lance'},'maintain','extend','maintain','EXTEND +0.5s'],
    [{...base,powerTime:45,weaponMode:'lance'},'maintain','extend','maintain','MAX 45s'],
    [{...base,powerTime:0,basicLevel:4},'maintain','levelUp','maintain','BASE Lv.4 → 5'],
    [{...base,powerTime:0,basicLevel:5},'maintain','drone','maintain','DRONE 15s'],
    [{...base,powerTime:45,weaponMode:'lance'},'power','change','change','SWAP · HELIX 18s'],
    [{...base,hp:90},'health','heal','heal','HP +10'],
  ];
  for (const [player,type,action,group,label] of cases) {
    const item=Object.freeze({type,weaponMode:'helix'}),before=JSON.stringify(player);
    const shown=pickupPresentation(item,Object.freeze(player));
    assert.equal(shown.action,action);assert.equal(shown.colorGroup,group);
    assert.equal(shown.color,SUPPLY_COLORS[group]);assert.equal(shown.effect,label);
    assert.equal(JSON.stringify(player),before);
  }
});
