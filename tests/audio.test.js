import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { AudioDirector } from '../src/audio.js';

class Param {
  constructor(value = 0) { this.value = value; this.events = []; }
  setValueAtTime(value, time) { this.events.push(['set', value, time]); }
  exponentialRampToValueAtTime(value, time) { this.events.push(['exponential', value, time]); }
  linearRampToValueAtTime(value, time) { this.events.push(['linear', value, time]); }
  setTargetAtTime(value, time, constant) { this.events.push(['target', value, time, constant]); }
  cancelScheduledValues(time) { this.events.push(['cancel', time]); }
  cancelAndHoldAtTime(time) { this.events.push(['hold', time]); }
}

class Node {
  constructor() { this.connections = []; this.disconnected = false; }
  connect(node) { this.connections.push(node); return node; }
  disconnect() { this.connections = []; this.disconnected = true; }
}

class Source extends Node {
  constructor(context) { super(); this.context = context; this.playbackRate = new Param(1); this.frequency = new Param(); }
  start(at) { this.startedAt = at; }
  stop(at) { this.stoppedAt = at; }
}

class Context {
  constructor() { this.currentTime = 0; this.state = 'running'; this.destination = new Node(); this.sources = []; this.decoded = 0; }
  createGain() { const node = new Node(); node.gain = new Param(1); return node; }
  createStereoPanner() { const node = new Node(); node.pan = new Param(); return node; }
  createBufferSource() { const node = new Source(this); this.sources.push(node); return node; }
  createOscillator() { const node = new Source(this); this.sources.push(node); return node; }
  createWaveShaper() { return new Node(); }
  createDynamicsCompressor() {
    const node = new Node();
    for (const key of ['threshold', 'knee', 'ratio', 'attack', 'release']) node[key] = new Param();
    return node;
  }
  async decodeAudioData(data) {
    this.decoded += 1;
    const view = new DataView(data);
    assert.equal(view.getUint32(0, false), 0x52494646, 'preloaded sample must be a WAV');
    return { duration: (data.byteLength - 44) / view.getUint32(28, true) };
  }
  async resume() { this.state = 'running'; }
  async suspend() { this.state = 'suspended'; }
  advance(seconds) {
    this.currentTime += seconds;
    for (const source of this.sources) {
      const naturalEnd = source.buffer ? source.startedAt + source.buffer.duration / source.playbackRate.value : Infinity;
      if (!source.disconnected && Math.min(source.stoppedAt ?? Infinity, naturalEnd) <= this.currentTime) source.onended?.();
    }
  }
}

class Deck {
  constructor() { this.src = ''; this.paused = true; this.volume = 0; }
  addEventListener() {}
  pause() { this.paused = true; }
  load() {}
  async play() { this.paused = false; }
}

async function readyAudio(t, options = {}, missingAsset = null) {
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async url => {
    requests += 1;
    const requested = String(url);
    const asset = requested.includes('/assets/audio/') ? requested.split('/assets/audio/')[1] : 'manifest.json';
    const filename = process.env.SKYWIND_PATCH_ASSETS && asset.startsWith('sfx-patch1/edited/')
      ? path.join(process.env.SKYWIND_PATCH_ASSETS, path.basename(asset)) : path.resolve('assets/audio', asset);
    if (path.basename(filename) === missingAsset) return { ok: false, status: 404 };
    const bytes = await readFile(filename);
    return { ok: true, json: async () => JSON.parse(bytes), arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
  });
  const names = ['Audio', 'window', 'document', 'requestAnimationFrame', 'cancelAnimationFrame'];
  const previous = names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]);
  Object.assign(globalThis, {
    Audio: Deck, window: { AudioContext: Context }, document: { baseURI: 'http://127.0.0.1:5173/' },
    requestAnimationFrame: () => 0, cancelAnimationFrame: () => {},
  });
  t.after(() => {
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  });
  const audio = new AudioDirector(undefined, options);
  await audio.unlock();
  if (!missingAsset) { assert.equal(audio.error, ''); assert.equal(audio.effectsReady, true); }
  return { audio, context: audio.context, requests: () => requests };
}

test('samples load/decode once; combat reuses buffers without fetching and music routing is preserved', async t => {
  const { audio, context, requests } = await readyAudio(t);
  assert.equal(requests(), 51);
  assert.equal(context.decoded, 50);
  assert.deepEqual(Object.keys(audio.tracks), ['title', 'normal', 'danger', 'boss', 'powerup', 'ending']);
  for (const state of Object.keys(audio.tracks)) assert.ok(audio.tracks[state].endsWith(`/${state}-v2.m4a`));
  assert.equal(audio._buses.shot.gain.value, 0.84);
  assert.equal(audio._buses.impact.gain.value, 0.94);
  assert.equal(audio._buses.ui.gain.value, 0.92);
  for (const bus of Object.values(audio._buses)) assert.equal(bus.connections[0], audio._effects);
  for (let i = 0; i < 30; i += 1) {
    context.advance(0.095);
    audio.playEvent({ type: 'shot', weaponMode: 'normal' });
  }
  await audio.unlock();
  assert.equal(requests(), 51);
  assert.equal(context.decoded, 50);
});

test('each volley starts one sample and drone volleys do not suppress simultaneous main fire', async t => {
  const { audio, context } = await readyAudio(t);
  for (const mode of ['normal', 'spread', 'lance', 'helix']) {
    const before = context.sources.length;
    audio.playEvent({ type: 'shot', weaponMode: mode, powered: mode !== 'normal', bullets: 5 });
    assert.equal(context.sources.length, before + 1);
    const source = context.sources.at(-1);
    assert.ok(source.stoppedAt - source.startedAt <= (mode === 'normal' ? 0.127 : 0.232));
    context.advance(0.4);
  }
  audio.playEvent({ type: 'shot', weaponMode: 'normal' });
  const beforeDrone = context.sources.length;
  audio.playEvent({ type: 'shot', weaponMode: 'drone', drone: true });
  assert.equal(context.sources.length, beforeDrone + 1);
  assert.ok(context.sources.at(-1).buffer === [...audio._voices].at(-1).source.buffer);
  assert.match([...audio._voices].at(-1).sampleName, /^shot-drone-0[123]$/);
  audio.playEvent({ type: 'shot', weaponMode: 'drone', drone: true });
  assert.equal(context.sources.length, beforeDrone + 1, 'sound-only duplicate throttle');
});

test('weapon-original mode and actual target type select exactly two independently counted hit layers', async t => {
  const { audio, context } = await readyAudio(t);
  for (const mode of ['normal', 'spread', 'lance', 'helix', 'drone']) {
    for (const [enemyType, profile] of [['beetle', 'light'], ['worm', 'armored'], ['orb', 'special'], ['boss', 'armored']]) {
      context.advance(0.3);
      const event = Object.freeze({ type: 'hit', weaponMode: mode, drone: mode === 'drone', enemyType, player: false, damage: 3 });
      const before = context.sources.length;
      audio.playEvent(event);
      assert.equal(context.sources.length, before + 2);
      const voices = [...audio._voices].slice(-2);
      assert.equal(voices[0].sampleName, `hit-weapon-${mode}`);
      assert.match(voices[1].sampleName, new RegExp(`^hit-target-${profile}-0[123]$`));
      assert.deepEqual(voices.map(voice => voice.priority), [3, 3]);
      for (let i = 0; i < 10; i += 1) audio.playEvent(event);
      assert.equal(context.sources.length, before + 2, 'same-profile rapid impacts are grouped only in audio');
      assert.equal(event.damage, 3);
    }
  }
});

test('target-profile throttles permit different surfaces in the same frame and keep bounded keys', async t => {
  const { audio, context } = await readyAudio(t);
  const before = context.sources.length;
  for (const enemyType of ['wasp', 'claw', 'ray']) audio.playEvent({ type: 'hit', player: false, weaponMode: 'lance', enemyType });
  assert.equal(context.sources.length, before + 6);
  assert.equal([...audio._lastEffects.keys()].filter(key => key.startsWith('hit-')).length, 3);
  assert.ok(audio._voices.size <= 4, 'hit group counts the two layers separately');
  for (let i = 0; i < 100; i += 1) audio.playEvent({ type: 'hit', weaponMode: 'normal', enemyType: `unknown-${i}` });
  assert.equal([...audio._lastEffects.keys()].filter(key => key.startsWith('hit-')).length, 3);
});

test('player damage is one identical fixed sample, gain, rate and center pan for every actual event', async t => {
  const { audio, context } = await readyAudio(t);
  const records = [];
  for (let i = 0; i < 10; i += 1) {
    context.advance(0.9);
    audio.playEvent({ type: 'hit', player: true, damage: 12, weaponMode: i % 2 ? 'helix' : 'normal', x: i * 140 });
    const voice = [...audio._voices].at(-1);
    records.push([voice.sampleName, voice.source.playbackRate.value, voice.volume, voice.pan.pan.value, voice.priority]);
    assert.equal(voice.source.buffer, audio._buffers.get('player-damage-fixed'));
    assert.ok(voice.source.stoppedAt - voice.startedAt <= 0.3000001);
  }
  for (const record of records) assert.deepEqual(record, ['player-damage-fixed', 1, 0.9, 0, 6]);
  assert.equal(context.sources.length, 10);
  context.advance(0.08);
  audio.playEvent({ type: 'hit', player: false, weaponMode: 'normal', enemyType: 'beetle' });
  assert.equal(audio._duckLevel, 0.32, 'ordinary hit cannot undo player-danger duck');
});

test('dense effects keep protected cues and respect voice/release ceilings', async t => {
  const { audio, context } = await readyAudio(t);
  const fill = (name, group, priority, count) => {
    for (let i = 0; i < count; i += 1) audio._sample(name, group, 0.3, {}, priority);
  };
  fill('heavy', 'critical', 6, 3);
  fill('charge', 'ui', 5, 2);
  const protectedSources = [...audio._voices].map(voice => voice.source);
  for (let i = 0; i < 100; i += 1) {
    fill('shot', 'shot', 2, 1);
    fill('enemy', 'enemy', 1, 1);
    fill('hit', 'hit', 3, 1);
    fill('explosion', 'explosion', 4, 1);
    assert.ok(audio._voices.size <= 20);
    assert.ok(audio._retiringVoices.size <= 4);
  }
  for (const source of protectedSources) assert.equal(source.stoppedAt, undefined);
  assert.equal(audio._sample('shot', 'shot', 0.2, {}, 1), false, 'drone cannot steal main-fire group');
  context.advance(3);
  assert.equal(audio._voices.size, 0);
  assert.equal(audio._retiringVoices.size, 0);
});

test('warning/expiry are quiet one-shots per slot with no loop or wall-clock timer', async t => {
  const { audio, context } = await readyAudio(t);
  for (const type of ['weaponWarning', 'weaponExpired']) {
    const before = context.sources.length;
    for (const slot of ['weapon', 'drone']) {
      const event = { type, slot, weaponMode: slot === 'drone' ? 'drone' : 'lance' };
      audio.playEvent(event);
      audio.playEvent(event);
    }
    assert.equal(context.sources.length, before + 2);
  }
  for (const source of context.sources) {
    assert.equal(source.loop, undefined);
    assert.ok(source.stoppedAt <= 0.281);
    if (source.buffer) assert.equal(source.buffer, audio._buffers.get('weapon-expire'));
    const next = source.connections[0].connections[0];
    assert.equal(source.buffer ? next.connections[0] : next, audio._buses.ui);
  }
  const before = context.sources.length;
  context.advance(10);
  assert.equal(audio._uiTones.size, 0);
  assert.equal(context.sources.length, before, 'elapsed time does not generate another warning');
  for (let i = 0; i < 100; i += 1) audio._tone(440, 330, 0.2, 0.035);
  assert.equal(audio._uiTones.size, 12);
});

test('muted/paused events are skipped; resuming reuses context and cached samples', async t => {
  const { audio, context, requests } = await readyAudio(t);
  const event = { type: 'shot', weaponMode: 'lance' };
  audio.setMuted(true);
  audio.playEvent(event);
  assert.equal(context.sources.length, 0);
  audio.setMuted(false);
  audio.setPaused(true);
  audio.playEvent(event);
  assert.equal(context.state, 'suspended');
  assert.equal(context.sources.length, 0);
  audio.setPaused(false);
  audio.playEvent(event);
  assert.equal(context.sources.length, 1);
  assert.equal(audio.context, context);
  assert.equal(requests(), 51);
});


test('shuffled shot bags avoid adjacent repeats across bags and preserve every actual shot timestamp', async t => {
  const { audio, context } = await readyAudio(t, { audioSeed: 12345 });
  t.mock.method(Math, 'random', () => { throw new Error('Game/global RNG must not be used by sound'); });
  for (const mode of ['normal', 'spread', 'lance', 'helix', 'drone']) {
    const names = [], accents = [];
    for (let index = 0; index < 120; index += 1) {
      context.advance(0.17);
      const before = context.sources.length, event = Object.freeze({ type: 'shot', weaponMode: mode, drone: mode === 'drone', x: 220 });
      audio.playEvent(event);
      assert.equal(context.sources.length, before + 1, 'no random shot dropout or extra rhythmic audio source');
      const voice = [...audio._voices].at(-1), expectedGain = ({ normal: 0.9, spread: 0.88, lance: 0.91, helix: 0.9, drone: 0.56 })[mode];
      assert.equal(voice.startedAt, context.currentTime);
      const cents = 1200 * Math.log2(voice.source.playbackRate.value);
      const db = 20 * Math.log10(voice.volume / expectedGain);
      assert.ok(cents >= -25.0001 && cents <= 25.0001);
      assert.ok(db >= -0.6001 && db <= 1.4001);
      if (voice.accent) accents.push(index);
      names.push(voice.sampleName);
    }
    for (let index = 1; index < names.length; index += 1) assert.notEqual(names[index], names[index - 1]);
    for (let index = 0; index < names.length; index += 3) assert.equal(new Set(names.slice(index, index + 3)).size, 3);
    const intervals = accents.slice(1).map((value, index) => value - accents[index]);
    assert.ok(intervals.every(value => value >= 4 && value <= 7));
    assert.ok(new Set(intervals).size > 1, 'accents must not become a fixed beat');
  }
});

test('soundVariation false is a fixed A/B control without changing scheduling, music or event data', async t => {
  const { audio, context } = await readyAudio(t, { soundVariation: false });
  const rngBefore = audio._audioRng, music = { ...audio.tracks };
  for (const mode of ['normal', 'spread', 'lance', 'helix', 'drone']) {
    const settings = [];
    for (let i = 0; i < 12; i += 1) {
      context.advance(0.17);
      const event = Object.freeze({ type: 'shot', weaponMode: mode, drone: mode === 'drone', gameplaySeed: 74912 });
      audio.playEvent(event);
      const voice = [...audio._voices].at(-1);
      settings.push([voice.sampleName, voice.source.playbackRate.value, voice.volume, voice.accent]);
      assert.equal(voice.startedAt, context.currentTime);
      assert.equal(event.gameplaySeed, 74912);
    }
    for (const setting of settings) assert.deepEqual(setting, settings[0]);
    assert.equal(settings[0][0], `shot-${mode}-01`);
    assert.equal(settings[0][1], 1);
    assert.equal(settings[0][3], false);
  }
  assert.equal(audio._audioRng, rngBefore);
  assert.deepEqual(audio.tracks, music);
});

test('change/expiry outrank destruction and fixed damage remains the highest protected cue', async t => {
  const { audio, context } = await readyAudio(t);
  audio.playEvent({ type: 'pickup', pickupType: 'power', weaponMode: 'spread' });
  let voice = [...audio._voices].at(-1);
  assert.equal(voice.sampleName, 'weapon-change');assert.equal(voice.priority, 5);
  audio.playEvent({ type: 'weaponExpired', slot: 'weapon', weaponMode: 'spread' });
  voice = [...audio._voices].at(-1);
  assert.equal(voice.sampleName, 'weapon-expire');assert.equal(voice.priority, 5);
  audio.playEvent({ type: 'hit', player: true, damage: 12 });
  const fixed = [...audio._voices].at(-1);
  audio.playEvent({ type: 'explosion', boss: true });
  assert.equal([...audio._voices].at(-1).priority, 4);
  for (let i = 0; i < 60; i += 1) {
    context.advance(0.001);
    audio._sample('explosion', 'explosion', 0.5, {}, 4);
    audio._sample('impact-normal', 'hit', 0.8, {}, 3, 1, 0.16, { variation: false });
    audio._sample('targetArmored', 'hit', 0.85, {}, 3, 1, 0.19, { variation: false });
    assert.ok(audio._voices.size <= 20);assert.ok(audio._retiringVoices.size <= 4);
  }
  assert.ok(audio._voices.has(fixed));
});


test('a missing patch asset remains an explicit preparation error rather than silently substituting a legacy cue', async t => {
  const { audio, context } = await readyAudio(t, {}, 'player-damage-fixed.wav');
  assert.equal(audio.effectsReady, false);
  assert.equal(audio._buffers.size, 49);
  assert.match(audio.error, /sound effect samples could not be loaded/);
  const before = context.sources.length;
  audio.playEvent({ type: 'hit', player: true, damage: 12 });
  assert.equal(context.sources.length, before, 'missing fixed cue must not silently become a random ordinary hit');
  assert.equal(audio._buffers.has('player-hit'), true, 'legacy asset exists but is not substituted');
});

test('pause disposes active tails and scheduled UI notes before suspension; resume starts only fresh effects', async t => {
  const { audio, context } = await readyAudio(t);
  audio.playEvent({ type: 'shot', weaponMode: 'normal' });
  audio.playEvent({ type: 'boss' });
  audio.playEvent({ type: 'weaponExpired', slot: 'weapon' });
  for (let i = 0; i < 7; i += 1) audio._sample('fire-normal', 'shot', 0.82, {}, 2);
  assert.ok(audio._retiringVoices.size > 0);
  assert.ok([...audio._uiTones].some(tone => tone.oscillator.startedAt > context.currentTime));
  const oldSources = [...context.sources];
  audio.setPaused(true);
  assert.equal(context.state, 'suspended');
  assert.equal(audio._voices.size, 0);
  assert.equal(audio._retiringVoices.size, 0);
  assert.equal(audio._uiTones.size, 0);
  assert.equal(audio._lastEffects.size, 0);
  assert.equal(audio._duckLevel, 1);
  for (const source of oldSources) {
    assert.equal(source.disconnected, true);
    assert.equal(source.stoppedAt, context.currentTime);
  }
  audio.setPaused(false);
  audio.playEvent({ type: 'shot', weaponMode: 'normal' });
  assert.equal(context.sources.length, oldSources.length + 1, 'fresh resume shot is not throttled by the pre-pause shot');
  context.advance(1);
  assert.equal(context.sources.length, oldSources.length + 1, 'no deferred boss or expiry cue is recreated');
});

test('mute removes effects rather than revealing old tails when quickly unmuted', async t => {
  const { audio, context, requests } = await readyAudio(t);
  audio.playEvent({ type: 'pickup', pickupType: 'health' });
  audio.playEvent({ type: 'hit', player: true, damage: 12 });
  const oldSources = [...context.sources];
  audio.setMuted(true);
  assert.equal(audio._voices.size + audio._retiringVoices.size + audio._uiTones.size, 0);
  for (const source of oldSources) assert.equal(source.disconnected, true);
  audio.setMuted(false);
  context.advance(0.1);
  assert.equal(context.sources.length, oldSources.length);
  audio.playEvent({ type: 'shot', weaponMode: 'drone', drone: true });
  assert.equal(context.sources.length, oldSources.length + 1);
  assert.equal(requests(), 51, 'cleanup keeps all decoded buffers and music data');
});

test('gameover keeps its fixed damage and death blast but drops old combat cues; retry/title reset cancels the ending motif', async t => {
  const { audio, context } = await readyAudio(t);
  audio.playEvent({ type: 'boss' });
  const oldTones = [...audio._uiTones];
  audio.playEvent({ type: 'shot', weaponMode: 'lance' });
  const oldShot = [...audio._voices].at(-1);
  audio.playEvent({ type: 'hit', player: true, damage: 12 });
  const damage = [...audio._voices].at(-1);
  audio.playEvent({ type: 'explosion', player: true });
  const deathBlast = [...audio._voices].at(-1);
  audio.playEvent({ type: 'gameover' });
  assert.equal(oldShot.source.disconnected, true);
  for (const tone of oldTones) assert.equal(tone.oscillator.disconnected, true);
  assert.ok(audio._voices.has(damage));
  assert.ok(audio._voices.has(deathBlast));
  assert.equal(damage.gain.gain.value, 0.9, 'actual gain node retains the fixed player-damage level');
  assert.equal(damage.source.playbackRate.value, 1);
  assert.equal(damage.pan.pan.value, 0);
  assert.equal(audio._uiTones.size, 4, 'only the existing ending motif is scheduled');
  const sourceCount = context.sources.length;
  audio.playEvent({ type: 'weaponExpired', slot: 'weapon' });
  audio.playEvent({ type: 'shot', weaponMode: 'normal' });
  audio.playEvent({ type: 'gameover' });
  assert.equal(context.sources.length, sourceCount, 'late gameplay and duplicate ending events are ignored');
  const endingSources = [...context.sources];
  audio.resetEffects();
  assert.equal(audio._voices.size + audio._retiringVoices.size + audio._uiTones.size, 0);
  for (const source of endingSources) assert.equal(source.disconnected, true);
  audio.playEvent({ type: 'shot', weaponMode: 'normal' });
  assert.equal(context.sources.length, sourceCount + 1, 'fresh run can emit immediately');
});

test('rapid pause changes honor the latest intent when AudioContext promises settle late', async t => {
  const { audio, context } = await readyAudio(t);
  let finishSuspend;
  const suspend = t.mock.method(context, 'suspend', () => new Promise(resolve => {
    finishSuspend = () => { context.state = 'suspended'; resolve(); };
  }));
  audio.setPaused(true);
  audio.setPaused(false);
  finishSuspend();
  await Promise.resolve(); await Promise.resolve();
  assert.equal(context.state, 'running', 'late suspend must not leave a resumed game silent');
  suspend.mock.restore();
  audio.setPaused(true);
  let finishResume;
  t.mock.method(context, 'resume', () => new Promise(resolve => {
    finishResume = () => { context.state = 'running'; resolve(); };
  }));
  audio.setPaused(false);
  audio.setPaused(true);
  finishResume();
  await Promise.resolve(); await Promise.resolve();
  assert.equal(context.state, 'suspended', 'late resume must not restart a paused context');
});

test('a music play promise settling after pause cannot restart its deck', async t => {
  const { audio } = await readyAudio(t);
  let finishPlay, target;
  t.mock.method(Deck.prototype, 'play', function () {
    target = this;
    return new Promise(resolve => { finishPlay = () => { this.paused = false; resolve(); }; });
  });
  audio.setState('boss');
  audio.setPaused(true);
  finishPlay();
  await Promise.resolve(); await Promise.resolve();
  assert.equal(target.paused, true);
});

test('tension adds a bounded immediate weapon accent and keeps the fired shot timbre after expiry', async t => {
  const { audio, context } = await readyAudio(t, { soundVariation: false });
  const tracks = { ...audio.tracks };
  t.mock.method(Math, 'random', () => { throw new Error('Combat accents must not consume the game RNG'); });
  for (const mode of ['normal', 'spread', 'lance', 'helix', 'drone']) {
    context.advance(1);
    audio.playEvent({ type: 'shot', weaponMode: mode, drone: mode === 'drone', tension: false });
    const ordinary = [...audio._voices].at(-1);
    context.advance(0.3);
    const event = Object.freeze({ type: 'shot', weaponMode: mode, drone: mode === 'drone', tension: true });
    audio.playEvent(event);
    const enhanced = [...audio._voices].at(-1), resonance = [...audio._uiTones].at(-1);
    assert.equal(enhanced.sampleName, ordinary.sampleName);
    assert.ok(enhanced.source.playbackRate.value > ordinary.source.playbackRate.value);
    assert.ok(enhanced.volume <= ordinary.volume * 1.041, 'enhancement mainly changes timbre, not loudness');
    assert.equal(enhanced.startedAt, context.currentTime);
    assert.equal(resonance.oscillator.startedAt, context.currentTime, 'never waits for a music phase');
    assert.equal(resonance.combat, true);
    assert.equal(resonance.gain.connections[0], audio._buses.impact);
    audio.playEvent({ type: 'tensionEnd', reason: 'expired' });
    context.advance(0.3);
    // This event is the still-in-flight enhanced projectile, after the player reverted.
    audio.playEvent(Object.freeze({ type: 'hit', weaponMode: mode, drone: mode === 'drone', enemyType: 'worm', tension: true }));
    const [weapon, surface] = [...audio._voices].slice(-2);
    assert.equal(weapon.source.playbackRate.value, enhanced.source.playbackRate.value);
    assert.equal(weapon.sampleName, `hit-weapon-${mode}`);
    assert.match(surface.sampleName, /^hit-target-armored-/);
    assert.equal(surface.source.playbackRate.value, 1, 'the target material stays recognizable');
    assert.equal(weapon.tension, true);
    context.advance(0.3);
    audio.playEvent({ type: 'hit', weaponMode: mode, enemyType: 'worm', tension: false });
    assert.equal([...audio._voices].slice(-2)[0].source.playbackRate.value, 1, 'an ordinary in-flight projectile stays ordinary');
    assert.deepEqual(event, { type: 'shot', weaponMode: mode, drone: mode === 'drone', tension: true });
  }
  assert.deepEqual(audio.tracks, tracks);
  assert.equal(audio.state, 'title');
});

test('tension start, grouped refresh and quiet expiry are distinct; damage clears and suppresses reward tones', async t => {
  const { audio, context } = await readyAudio(t);
  audio.playEvent({ type: 'tension', refresh: false, remaining: 2 });
  const start = [...audio._uiTones][0];
  assert.deepEqual(start.oscillator.frequency.events[0], ['set', 523, 0]);
  for (let i = 0; i < 30; i += 1) audio.playEvent({ type: 'tension', refresh: true, remaining: 2 });
  assert.equal(context.sources.length, 3, 'same-frame graze burst is grouped');
  context.advance(0.17);
  audio.playEvent({ type: 'tension', refresh: true, remaining: 2 });
  const refresh = [...audio._uiTones].at(-1);
  assert.equal(refresh.oscillator.frequency.events[0][1], 1175);
  assert.ok(refresh.endsAt - context.currentTime < 0.111);
  audio.playEvent({ type: 'hit', player: true, damage: 12 });
  assert.equal(audio._uiTones.size, 0);
  assert.equal(start.oscillator.disconnected, true);
  assert.equal(refresh.oscillator.disconnected, true);
  const sourceCount = context.sources.length;
  audio.playEvent({ type: 'tensionEnd', reason: 'hit' });
  audio.playEvent({ type: 'explosion', chain: 100, tension: true });
  audio.playEvent({ type: 'tension', refresh: false });
  assert.equal(context.sources.length, sourceCount + 1, 'only the real destruction sample may play during danger hold');
  const damage = [...audio._voices].find(voice => voice.playerCue);
  assert.deepEqual([damage.sampleName, damage.source.playbackRate.value, damage.volume, damage.pan.pan.value, damage.priority],
    ['player-damage-fixed', 1, 0.9, 0, 6]);
  context.advance(0.3);
  audio.playEvent({ type: 'tensionEnd', reason: 'expired' });
  assert.equal([...audio._uiTones].at(-1).oscillator.frequency.events[0][1], 784);
});

test('chain accents use four capped notes at constant gain with no unbounded source or throttle keys', async t => {
  const { audio, context } = await readyAudio(t);
  const notes = [], gains = [];
  for (const chain of [1, 4, 7, 10, 99999]) {
    context.advance(1);
    audio.playEvent(Object.freeze({ type: 'explosion', chain, tension: false }));
    const tone = [...audio._uiTones].at(-1);
    notes.push(tone.oscillator.frequency.events[0][1]);
    gains.push(tone.gain.gain.events[1][1]);
    assert.equal(tone.oscillator.startedAt, context.currentTime);
  }
  assert.deepEqual(notes, [392, 494, 587, 784, 784]);
  assert.ok(gains.every(gain => gain === 0.045));
  for (let i = 0; i < 1000; i += 1) {
    context.advance(0.003);
    audio.playEvent({ type: 'explosion', chain: i + 1, tension: true });
    audio.playEvent({ type: 'shot', weaponMode: 'helix', tension: true });
    audio.playEvent({ type: 'hit', weaponMode: 'lance', enemyType: 'boss', tension: true });
    assert.ok(audio._voices.size <= 20);
    assert.ok(audio._retiringVoices.size <= 4);
    assert.ok([...audio._uiTones].filter(tone => tone.combat).length <= 4);
    assert.ok(audio._uiTones.size <= 12);
  }
  assert.ok(audio._lastEffects.size <= 6, 'keys do not contain chain counts or enemy ids');
});

test('same-frame change and maintain pickups keep their different meanings and warning slots stay protected', async t => {
  const { audio, context } = await readyAudio(t);
  audio.playEvent({ type: 'pickup', effect: 'change', pickupType: 'power', weaponMode: 'spread' });
  assert.equal([...audio._voices].at(-1).sampleName, 'weapon-change');
  audio.playEvent({ type: 'pickup', effect: 'extend', pickupType: 'maintain', weaponMode: 'spread' });
  assert.equal(audio._uiTones.size, 2, 'maintain is not swallowed by simultaneous change');
  assert.deepEqual([...audio._uiTones].map(tone => tone.oscillator.frequency.events[0][1]), [660, 880]);
  context.advance(1);
  audio.playEvent({ type: 'pickup', effect: 'levelUp', pickupType: 'maintain', weaponMode: 'normal' });
  assert.deepEqual([...audio._uiTones].map(tone => tone.oscillator.frequency.events[0][1]), [523, 784, 1047]);
  context.advance(1);
  audio.playEvent({ type: 'shot', weaponMode: 'helix', tension: true });
  for (let i = 0; i < 11; i += 1) audio._tone(440, 440, 0.2, 0.03);
  assert.equal(audio._uiTones.size, 12);
  const accent = [...audio._uiTones].find(tone => tone.combat);
  audio.playEvent({ type: 'weaponWarning', slot: 'weapon' });
  assert.equal(audio._uiTones.size, 12);
  assert.equal(accent.oscillator.disconnected, true, 'warning displaces a reward accent at the tone ceiling');
  assert.equal([...audio._uiTones].at(-1).oscillator.frequency.events[0][1], 660);
});

test('combat accents leave no delayed tails after pause, mute, gameover or retry', async t => {
  const { audio, context } = await readyAudio(t);
  for (const boundary of ['pause', 'mute', 'gameover', 'retry']) {
    audio.resetEffects();
    audio.playEvent({ type: 'tension', refresh: false });
    audio.playEvent({ type: 'shot', weaponMode: 'spread', tension: true });
    audio.playEvent({ type: 'hit', weaponMode: 'spread', enemyType: 'beetle', tension: true });
    audio.playEvent({ type: 'explosion', chain: 9, tension: true });
    const accents = [...audio._uiTones].filter(tone => tone.combat);
    assert.ok(accents.length > 0);
    if (boundary === 'pause') audio.setPaused(true);
    else if (boundary === 'mute') audio.setMuted(true);
    else if (boundary === 'gameover') audio.playEvent({ type: 'gameover' });
    else audio.resetEffects();
    for (const tone of accents) assert.equal(tone.oscillator.disconnected, true);
    assert.equal([...audio._uiTones].filter(tone => tone.combat).length, 0);
    const sources = context.sources.length;
    context.advance(1);
    assert.equal(context.sources.length, sources);
    audio.setPaused(false); audio.setMuted(false);
  }
  audio.resetEffects();
  audio.playEvent({ type: 'tension', refresh: false });
  assert.equal(audio._uiTones.size, 3, 'a new run starts immediately without stale suppression');
});


test('tension startup survives a saturated combat accent budget without stealing warnings', async t => {
  const { audio, context } = await readyAudio(t);
  for (let i = 0; i < 4; i += 1) audio._tone(440, 440, 0.5, 0.03, 'sine', 0, true);
  const ordinary = [...audio._uiTones];
  audio.playEvent({ type: 'tension', refresh: false });
  const startup = [...audio._uiTones].filter(tone => tone.priority === 2);
  assert.equal(startup.length, 3, 'all three startup layers survive busy fire and impact');
  assert.equal(ordinary.filter(tone => tone.oscillator.disconnected).length, 3);
  assert.equal(audio._uiTones.size, 4);
  assert.ok(startup.every(tone => tone.combat));
  assert.equal(startup[0].oscillator.startedAt, context.currentTime);
  assert.equal(startup[2].oscillator.startedAt, context.currentTime + 0.1);
  for (let i = 0; i < 8; i += 1) audio._tone(660, 660, 0.5, 0.03);
  const warnings = [...audio._uiTones].filter(tone => tone.priority === 3);
  audio.playEvent({ type: 'weaponWarning', slot: 'weapon' });
  assert.equal(audio._uiTones.size, 12);
  assert.ok(warnings.every(tone => !tone.oscillator.disconnected));
  assert.equal([...audio._uiTones].at(-1).priority, 3);
});

test('music duck ramps independently of crossfade and restores both deck levels', async t => {
  const { audio, context } = await readyAudio(t);
  const tracks = { ...audio.tracks };
  audio._musicVolumes = [0.14, 0.14];
  audio._applyMusicVolumes();
  const positions = audio._decks.map(deck => deck.currentTime);
  audio.playEvent({ type: 'tension', refresh: false });
  assert.deepEqual(audio._decks.map(deck => deck.volume), [0.14, 0.14], 'duck begins without a discontinuity');
  context.advance(0.04);
  audio._applyMusicVolumes();
  for (const deck of audio._decks) assert.ok(Math.abs(deck.volume - 0.14 * 0.58) < 1e-9);
  audio._musicVolumes = [0.07, 0.21];
  audio._applyMusicVolumes();
  assert.ok(Math.abs(audio._decks[1].volume / audio._decks[0].volume - 3) < 1e-9, 'crossfade balance survives duck');
  context.advance(0.5);
  audio._applyMusicVolumes();
  assert.deepEqual(audio._decks.map(deck => deck.volume), [0.07, 0.21]);
  assert.deepEqual(audio.tracks, tracks);
  assert.deepEqual(audio._decks.map(deck => deck.currentTime), positions);
});

test('pause, mute, gameover and retry cancel pending music duck work and restore nominal gain', async t => {
  const { audio, context } = await readyAudio(t);
  const pending = new Map(); let next = 1;
  t.mock.method(globalThis, 'requestAnimationFrame', callback => { const id = next++; pending.set(id, callback); return id; });
  t.mock.method(globalThis, 'cancelAnimationFrame', id => pending.delete(id));
  for (const boundary of ['pause', 'mute', 'gameover', 'retry']) {
    audio.resetEffects();
    audio._musicVolumes = [0.28, 0];
    audio.playEvent({ type: 'tension', refresh: false });
    assert.ok(pending.has(audio._musicDuckFrame));
    context.advance(0.04);
    audio._applyMusicVolumes();
    assert.ok(audio._decks[0].volume < 0.28);
    if (boundary === 'pause') audio.setPaused(true);
    else if (boundary === 'mute') audio.setMuted(true);
    else if (boundary === 'gameover') audio.playEvent({ type: 'gameover' });
    else audio.resetEffects();
    assert.equal(audio._musicDuckFrame, 0);
    assert.equal(pending.size, 0);
    assert.deepEqual(audio._decks.map(deck => deck.volume), [0.28, 0]);
    audio.setPaused(false); audio.setMuted(false);
    await Promise.resolve();
    // A resumed music state owns its separate crossfade frame.
    pending.delete(audio._fadeFrame);
  }
});

test('pickup approach is grouped and actual collection keeps its distinct reward cue', async t => {
  const { audio, context } = await readyAudio(t);
  const event = Object.freeze({ type: 'pickupAttract', pickupType: 'maintain', x: 330, y: 360 });
  audio.playEvent(event);
  const approach = [...audio._uiTones][0];
  assert.equal(approach.oscillator.startedAt, context.currentTime);
  assert.equal(approach.oscillator.frequency.events[0][1], 330);
  for (let i = 0; i < 20; i += 1) audio.playEvent(event);
  assert.equal(context.sources.length, 1);
  context.advance(0.2);
  audio.playEvent({ type: 'pickup', effect: 'extend', pickupType: 'maintain' });
  assert.deepEqual([...audio._uiTones].map(tone => tone.oscillator.frequency.events[0][1]), [660, 880]);
  audio.setMuted(true);
  assert.equal(audio._uiTones.size, 0);
});
