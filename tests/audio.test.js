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
  assert.equal(audio._buses.shot.gain.value, 0.78);
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
      const voice = [...audio._voices].at(-1), expectedGain = mode === 'drone' ? 0.7 : ['lance', 'helix'].includes(mode) ? 0.84 : 0.82;
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
