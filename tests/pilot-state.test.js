import test from 'node:test';
import assert from 'node:assert/strict';
import { createPilotState, updatePilotState, resetPilotState, PILOT_UI_CONFIG as config } from '../src/pilot-state.js';

const player = (overrides = {}) => ({ hp: 100, maxHp: 100, powerTime: 0, droneTime: 0, ...overrides });
const hit = { type: 'hit', player: true, damage: 13 };
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

test('pilot priority is actual damage, low HP, either power timer, then normal', () => {
  const state = createPilotState(() => 0.5);
  updatePilotState(state, 0, player());
  assert.equal(state.mode, 'normal');
  updatePilotState(state, 0, player({ powerTime: 1 }));
  assert.equal(state.mode, 'powerup');
  updatePilotState(state, 0, player({ droneTime: 1 }));
  assert.equal(state.mode, 'powerup');
  updatePilotState(state, 0, player({ hp: 50.01, maxHp: 200, powerTime: 1 }));
  assert.equal(state.mode, 'powerup');
  updatePilotState(state, 0, player({ hp: 50, maxHp: 200, powerTime: 1 }));
  assert.equal(state.mode, 'low');
  updatePilotState(state, 0, player({ hp: 1, powerTime: 1 }), [hit]);
  assert.equal(state.mode, 'hit');
  assert.equal(state.image, 'hit');
});

test('hit completion resolves the current HP and power state, including changes during the hit', () => {
  for (const [currentPlayer, expected] of [
    [player({ hp: 25, powerTime: 4 }), 'low'],
    [player({ powerTime: 4 }), 'powerup'],
    [player({ droneTime: 4 }), 'powerup'],
    [player(), 'normal'],
  ]) {
    const state = createPilotState(() => 0);
    updatePilotState(state, 0, player({ hp: 10 }), [hit]);
    updatePilotState(state, config.HIT_DURATION, currentPlayer);
    assert.equal(state.mode, expected);
    assert.equal(state.image, expected);
    assert.equal(state.shakeX, 0);
    assert.equal(state.shakeY, 0);
  }
});

test('enemy hits, explosions and zero damage do not trigger pilot hit feedback', () => {
  const state = createPilotState();
  updatePilotState(state, 0, player(), [
    { type: 'hit', damage: 5 }, { type: 'hit', player: false, damage: 5 },
    { type: 'explosion', player: true, damage: 5 },
    { type: 'hit', player: true, damage: 0 }, { type: 'hit', player: true, damage: -1 },
  ]);
  assert.equal(state.mode, 'normal');
  assert.equal(state.hitAge, Infinity);
});

test('normal blink waits 3–6 seconds, closes briefly, and reschedules after opening', () => {
  for (const random of [0, 0.5, 1]) {
    const state = createPilotState(() => random);
    const wait = 3 + random * 3;
    close(state.blinkWait, wait);
    updatePilotState(state, wait - 0.001, player());
    assert.equal(state.image, 'normal');
    updatePilotState(state, 0.001, player());
    assert.equal(state.image, 'blink');
    assert.equal(state.blink, true);
    updatePilotState(state, config.BLINK_DURATION, player());
    assert.equal(state.image, 'normal');
    close(state.blinkWait, wait);
  }
});

test('every non-normal state cancels blink; normal return begins a fresh interval', () => {
  for (const [currentPlayer, events] of [
    [player({ powerTime: 1 }), []], [player({ hp: 25 }), []], [player(), [hit]],
  ]) {
    const state = createPilotState(() => 0);
    updatePilotState(state, 3, player());
    assert.equal(state.blink, true);
    updatePilotState(state, 0, currentPlayer, events);
    assert.equal(state.blink, false);
    updatePilotState(state, config.HIT_DURATION, player());
    assert.equal(state.mode, 'normal');
    assert.equal(state.image, 'normal');
    close(state.blinkWait, 3);
  }
});

test('repeated real damage restarts the short hit and bounded image-only shake timers', () => {
  const state = createPilotState();
  updatePilotState(state, 0, player(), [hit]);
  assert.equal(state.hitAge, 0);
  assert.equal(state.overlayOpacity, config.HIT_OPACITY_MAX);
  for (let step = 0; step < Math.ceil(config.SHAKE_DURATION / 0.01) + 1; step++) {
    updatePilotState(state, 0.01, player());
    assert.ok(Math.abs(state.shakeX) <= config.SHAKE_AMPLITUDE_X);
    assert.ok(Math.abs(state.shakeY) <= config.SHAKE_AMPLITUDE_Y);
    assert.ok(state.overlayOpacity <= config.HIT_OPACITY_MAX);
    assert.ok(state.tintOpacity <= config.HIT_TINT_MAX);
  }
  assert.equal(state.shakeX, 0);
  assert.equal(state.shakeY, 0);
  updatePilotState(state, 0.01, player(), [hit]);
  assert.equal(state.hitAge, 0);
  close(state.hitRemaining, config.HIT_DURATION);
  assert.notEqual(state.shakeX, 0);
});

test('warning speeds up with lower HP and overlays keep their configured opacity bounds', () => {
  const state = createPilotState();
  for (const hp of [25, 10, 0]) {
    for (let i = 0; i < 120; i++) {
      updatePilotState(state, 1 / 60, player({ hp }));
      assert.ok(state.overlayOpacity >= config.LOW_HP_OPACITY_MIN);
      assert.ok(state.overlayOpacity <= config.LOW_HP_OPACITY_MAX);
    }
    close(state.warningPeriod, config.LOW_HP_PULSE_MIN + (config.LOW_HP_PULSE_MAX - config.LOW_HP_PULSE_MIN) * hp / 25);
  }
  for (let i = 0; i < 120; i++) {
    updatePilotState(state, 1 / 60, player({ powerTime: 10 }));
    close(state.warningPeriod, 1.8);
    assert.ok(state.overlayOpacity >= config.POWERUP_OPACITY_MIN);
    assert.ok(state.overlayOpacity <= config.POWERUP_OPACITY_MAX);
  }
});

test('blink timers and hit expiry are independent of frame subdivision, including a large step', () => {
  for (const hitFirst of [false, true]) {
    const small = createPilotState(() => 0.5);
    const large = createPilotState(() => 0.5);
    if (hitFirst) {
      updatePilotState(small, 0, player(), [hit]);
      updatePilotState(large, 0, player(), [hit]);
    }
    for (let i = 0; i < 6000; i++) updatePilotState(small, 1 / 60, player());
    updatePilotState(large, 100, player());
    assert.equal(small.image, large.image);
    assert.equal(small.blink, large.blink);
    close(small.blinkWait, large.blinkWait);
    close(small.blinkRemaining, large.blinkRemaining);
    close(small.time, large.time);
  }
});

test('UI state changes do not mutate player or events or call the gameplay random source', () => {
  const currentPlayer = Object.freeze(player({ hp: 18, powerTime: 3 }));
  const events = Object.freeze([Object.freeze({ ...hit })]);
  const before = JSON.stringify({ currentPlayer, events });
  const state = createPilotState(() => 0.2);
  updatePilotState(state, 1 / 60, currentPlayer, events);
  assert.equal(JSON.stringify({ currentPlayer, events }), before);
  assert.equal(state.mode, 'hit');
});

test('reset clears feedback and time and requests a fresh independent blink interval', () => {
  let calls = 0;
  const state = createPilotState(() => calls++ ? 1 : 0);
  updatePilotState(state, 10, player({ hp: 10 }), [hit]);
  assert.equal(resetPilotState(state), state);
  assert.equal(state.mode, 'normal');
  assert.equal(state.image, 'normal');
  assert.equal(state.time, 0);
  assert.equal(state.hitAge, Infinity);
  assert.equal(state.hitRemaining, 0);
  assert.equal(state.blink, false);
  assert.equal(state.overlayOpacity, 0);
  assert.equal(state.tintOpacity, 0);
  assert.equal(state.impact, 0);
  assert.equal(state.pulsePhase, 0);
  assert.equal(state.shakeX, 0);
  assert.equal(state.shakeY, 0);
  close(state.blinkWait, 6);
});

test('hit has two bounded flashes with a weaker echo and a separate short impact light', () => {
  const state = createPilotState(() => 0);
  updatePilotState(state, 0, player(), [hit]);
  close(state.overlayOpacity, config.HIT_OPACITY_MAX);
  close(state.tintOpacity, config.HIT_TINT_MAX);
  assert.equal(state.impact, 1);
  updatePilotState(state, config.IMPACT_DURATION, player());
  assert.equal(state.impact, 0);
  const trough = state.overlayOpacity;
  updatePilotState(state, config.HIT_PULSE_PERIOD - config.IMPACT_DURATION, player());
  assert.ok(state.overlayOpacity > trough);
  assert.ok(state.overlayOpacity < config.HIT_OPACITY_MAX);
  assert.ok(state.tintOpacity < config.HIT_TINT_MAX);
  updatePilotState(state, config.HIT_PULSE_PERIOD * 0.75, player());
  close(state.overlayOpacity, config.HIT_OPACITY_MIN);
  close(state.tintOpacity, config.HIT_TINT_MIN);
  updatePilotState(state, config.HIT_PULSE_PERIOD * 0.25, player());
  assert.equal(state.mode, 'hit');
  close(state.overlayOpacity, config.HIT_OPACITY_MIN);
  close(state.tintOpacity, config.HIT_TINT_MIN);
  updatePilotState(state, config.HIT_DURATION - 2 * config.HIT_PULSE_PERIOD, player());
  assert.equal(state.mode, 'normal');
  assert.equal(state.tintOpacity, 0);
});

test('changing low HP changes frequency without discontinuously changing pulse phase or tint', () => {
  const state = createPilotState();
  updatePilotState(state, 0.57, player({ hp: 25 }));
  const previous = { phase: state.phase, overlay: state.overlayOpacity, tint: state.tintOpacity };
  updatePilotState(state, 0, player({ hp: 1 }));
  close(state.phase, previous.phase);
  close(state.overlayOpacity, previous.overlay);
  close(state.tintOpacity, previous.tint);
  const period = state.warningPeriod;
  updatePilotState(state, 0.01, player({ hp: 1 }));
  close(state.phase, previous.phase + 0.01 / period);
});

test('warning pulse and tint remain consistent across frame rates and freeze at zero dt', () => {
  for (const currentPlayer of [player({ hp: 10 }), player({ powerTime: 3 })]) {
    const single = createPilotState();
    const split = createPilotState();
    updatePilotState(single, 1.137, currentPlayer);
    for (let i = 0; i < 100; i++) updatePilotState(split, 1.137 / 100, currentPlayer);
    close(single.phase, split.phase);
    close(single.overlayOpacity, split.overlayOpacity);
    close(single.tintOpacity, split.tintOpacity);
    const snapshot = JSON.stringify(single);
    updatePilotState(single, 0, currentPlayer);
    assert.equal(JSON.stringify(single), snapshot);
  }
});

test('image shake has a readable initial reversal followed by a smaller settling motion', () => {
  const state = createPilotState();
  updatePilotState(state, 0, player(), [hit]);
  close(state.shakeX, config.SHAKE_AMPLITUDE_X);
  updatePilotState(state, Math.PI / config.SHAKE_FREQUENCY_X, player());
  assert.ok(state.shakeX < -3);
  updatePilotState(state, config.SHAKE_IMPACT_DURATION, player());
  assert.ok(Math.abs(state.shakeX) < config.SHAKE_AMPLITUDE_X * config.SHAKE_TAIL_STRENGTH);
  updatePilotState(state, config.SHAKE_DURATION, player());
  assert.equal(state.shakeX, 0);
  assert.equal(state.shakeY, 0);
});
