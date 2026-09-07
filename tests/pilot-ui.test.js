import test from 'node:test';
import assert from 'node:assert/strict';
import { PilotUI, PILOT_IMAGES } from '../src/pilot-ui.js';
import { PILOT_UI_CONFIG as config } from '../src/pilot-state.js';

function fixture(t, reduced = false) {
  const originals = Object.fromEntries(['Image', 'matchMedia'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  t.after(() => {
    for (const [key, descriptor] of Object.entries(originals)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  globalThis.Image = class {
    constructor() { this.dataset = {}; }
    decode() { return Promise.resolve(); }
  };
  globalThis.matchMedia = () => ({ matches: reduced });
  const layer = { style: {}, children: [], append(image) { this.children.push(image); } };
  const properties = new Map();
  const root = {
    hidden: true, dataset: { mode: 'normal' }, attributes: { 'aria-label': '파일럿: 정상' },
    style: { setProperty(key, value) { properties.set(key, value); } },
    querySelector(selector) { assert.equal(selector, '.pilot-images'); return layer; },
    setAttribute(key, value) { this.attributes[key] = value; },
  };
  const ui = new PilotUI(root);
  const game = { mode: 'playing', player: { hp: 100, maxHp: 100, powerTime: 0, droneTime: 0 } };
  const visible = () => layer.children.filter(image => !image.hidden).map(image => image.dataset.portrait);
  return { ui, root, layer, properties, game, visible };
}

test('pilot DOM shows exactly one portrait and only its image layer shakes after actual damage', t => {
  const { ui, root, layer, properties, game, visible } = fixture(t);
  ui.update(game, 0);
  assert.deepEqual(visible(), ['normal']);
  game.player.powerTime = 2;
  ui.update(game, 0);
  assert.deepEqual(visible(), ['powerup']);
  game.player.hp = 25;
  ui.update(game, 0);
  assert.deepEqual(visible(), ['low']);
  const before = structuredClone(game);
  ui.update(game, 0, [{ type: 'hit', player: false, damage: 12 }, { type: 'hit', player: true, damage: 0 }]);
  assert.deepEqual(visible(), ['low']);
  assert.equal(layer.style.transform, 'translate(0px,0px)');
  ui.update(game, 0, [{ type: 'hit', player: true, damage: 12 }]);
  assert.deepEqual(visible(), ['hit']);
  assert.equal(root.attributes['aria-label'], '파일럿: 피격');
  assert.notEqual(layer.style.transform, 'translate(0px,0px)');
  assert.equal(root.style.transform, undefined);
  assert.equal(Number(properties.get('--pilot-tint-opacity')), config.HIT_TINT_MAX);
  assert.equal(Number(properties.get('--pilot-impact')), 1);
  assert.deepEqual(game, before);
  ui.update(game, config.HIT_DURATION);
  assert.deepEqual(visible(), ['low']);
  assert.equal(layer.style.transform, 'translate(0px,0px)');
});

test('title hides the portrait and a reset run clears fatal-hit feedback before entry', t => {
  const { ui, root, layer, properties, game, visible } = fixture(t);
  game.mode = 'gameover';
  game.player.hp = 0;
  ui.update(game, 0, [{ type: 'hit', player: true, damage: 100 }]);
  assert.deepEqual(visible(), ['hit']);
  ui.reset();
  game.mode = 'title';
  ui.update(game, 8);
  assert.equal(root.hidden, true);
  assert.equal(ui.state.time, 0);
  ui.reset();
  game.mode = 'entering';
  game.player.hp = 100;
  ui.update(game, 0);
  assert.equal(root.hidden, false);
  assert.deepEqual(visible(), ['normal']);
  assert.equal(root.attributes['aria-label'], '파일럿: 정상');
  assert.equal(layer.style.transform, 'translate(0px,0px)');
  assert.equal(properties.get('--pilot-fx-opacity'), '0');
  assert.equal(properties.get('--pilot-tint-opacity'), '0');
  assert.equal(properties.get('--pilot-impact'), '0');
});

test('reduced motion retains readable hit feedback while disabling the image shake', t => {
  const { ui, root, layer, properties, game, visible } = fixture(t, true);
  ui.update(game, 0, [{ type: 'hit', player: true, damage: 10 }]);
  assert.deepEqual(visible(), ['hit']);
  assert.equal(root.dataset.mode, 'hit');
  assert.equal(layer.style.transform, 'translate(0px,0px)');
  assert.equal(Number(properties.get('--pilot-fx-opacity')), config.REDUCED_HIT_OPACITY);
  assert.equal(Number(properties.get('--pilot-tint-opacity')), config.REDUCED_HIT_TINT_OPACITY);
  assert.equal(properties.get('--pilot-impact'), '0');
  assert.equal(properties.get('--pilot-scan-y'), '50%');
});

test('pilot loading checks every portrait and reports a failed image decode', async t => {
  const { ui, layer } = fixture(t);
  assert.deepEqual(layer.children.map(image => image.src), Object.values(PILOT_IMAGES));
  await ui.load();
  ui.images.get('hit').decode = () => Promise.reject(new Error('broken asset'));
  await assert.rejects(ui.load(), /파일럿 초상 이미지를 불러오지 못했습니다/);
});
