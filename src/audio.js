const MUSIC_STATES = ['title', 'normal', 'danger', 'boss', 'powerup', 'ending'];
const MUSIC_VOLUME = 0.28;
const EFFECTS_VOLUME = 0.7;
const CROSSFADE_MS = 1200;
const WEAPON_MODES = ['normal', 'spread', 'lance', 'helix', 'drone'];
const PATCH_GROUPS = {
  ...Object.fromEntries(WEAPON_MODES.map(mode => [`fire-${mode}`, [1, 2, 3].map(index => `shot-${mode}-0${index}`)])),
  ...Object.fromEntries(WEAPON_MODES.map(mode => [`impact-${mode}`, [`hit-weapon-${mode}`]])),
  targetLight: ['hit-target-light-01', 'hit-target-light-02'],
  targetArmored: ['hit-target-armored-01', 'hit-target-armored-02', 'hit-target-armored-03'],
  targetSpecial: ['hit-target-special-01', 'hit-target-special-02'],
  fixedPlayerDamage: ['player-damage-fixed'],
  weaponChange: ['weapon-change'],
  weaponExpire: ['weapon-expire'],
};
const PATCH_SAMPLES = new Set(Object.values(PATCH_GROUPS).flat());
// These are sound profiles for existing types, not armor or damage rules.
const TARGET_SOUNDS = {
  beetle: 'targetLight', wasp: 'targetLight', dragonfly: 'targetLight',
  claw: 'targetArmored', worm: 'targetArmored', mantis: 'targetArmored', needle: 'targetArmored', boss: 'targetArmored',
  ray: 'targetSpecial', orb: 'targetSpecial',
};
const SAMPLE_GROUPS = {
  ...PATCH_GROUPS,
  shot: ['shot-01', 'shot-02', 'shot-03'],
  spread: ['spread-01', 'spread-02'],
  lance: ['lance-01', 'lance-02'],
  helix: ['helix-01', 'helix-02'],
  enemy: ['enemy-01', 'enemy-02'],
  hit: ['hit-01', 'hit-02', 'hit-03'],
  playerHit: ['player-hit'],
  explosion: ['explosion-01', 'explosion-02', 'explosion-03'],
  heavy: ['explosion-heavy'],
  charge: ['charge'],
};
const BUS_VOLUME = { shot: 0.84, impact: 0.94, ui: 0.92 };
const VOICE_LIMITS = { shot: 4, enemy: 3, hit: 4, explosion: 4, critical: 3, ui: 2 };
const MAX_VOICES = 20;
const WEAPON_SOUNDS = {
  normal: { sample: 'fire-normal', volume: 0.9, duration: 0.14 },
  spread: { sample: 'fire-spread', volume: 0.88, duration: 0.18 },
  lance: { sample: 'fire-lance', volume: 0.91, duration: 0.22 },
  helix: { sample: 'fire-helix', volume: 0.9, duration: 0.2 },
  drone: { sample: 'fire-drone', volume: 0.56, duration: 0.12 },
};
// Short event accents use their own small budget, never a music/beat clock.
const COMBAT_ACCENTS = {
  maxTones: 4,
  playerDamageHold: 0.24,
  shotCooldown: 0.12,
  hitCooldown: 0.1,
  chainCooldown: 0.1,
  chainNotes: [392, 494, 587, 784],
  weapons: {
    normal: { note: 660, rate: 1.08, duration: 0.075, volume: 0.06, wave: 'triangle' },
    spread: { note: 523, rate: 1.035, duration: 0.1, volume: 0.064, wave: 'triangle' },
    lance: { note: 988, rate: 1.12, duration: 0.13, volume: 0.053, wave: 'sine' },
    helix: { note: 784, rate: 1.065, duration: 0.12, volume: 0.058, wave: 'triangle' },
    drone: { note: 1320, rate: 1.1, duration: 0.055, volume: 0.028, wave: 'sine' },
  },
};
const PICKUP_EFFECTS = new Set(['change', 'extend', 'levelUp', 'drone', 'health']);

/** Existing music, preloaded effects and bounded, immediate combat/UI accents. */
export class AudioDirector {
  constructor(manifestUrl = './assets/audio/manifest.json', { soundVariation = true, pitchCents = 25, gainDb = 0.6, accentDb = 0.8, audioSeed = 0x5a17c3d9 } = {}) {
    this.soundVariation = Boolean(soundVariation);
    const bounded = (value, fallback, maximum) => Number.isFinite(value) ? Math.max(0, Math.min(maximum, value)) : fallback;
    this._shotSettings = { pitchCents: bounded(pitchCents, 25, 35), gainDb: bounded(gainDb, 0.6, 0.8), accentDb: bounded(accentDb, 0.8, 1.2) };
    this._audioRng = Number.isFinite(audioSeed) ? audioSeed >>> 0 : 0x5a17c3d9;
    this._shotBags = new Map();
    this.manifestUrl = manifestUrl;
    this.manifest = null;
    this.tracks = {};
    this.context = null;
    this._effects = null;
    this._buses = {};
    this._duckUntil = 0;
    this._duckLevel = 1;
    this._musicVolumes = [0, 0];
    this._musicDuckUntil = 0;
    this._musicDuckLevel = 1;
    this._musicDuckFrame = 0;
    this._musicDuckFrom = 1;
    this._musicDuckStarted = 0;
    this._combatQuietUntil = 0;
    this._uiTones = new Set();
    this._limiter = null;
    this._saturator = null;
    this._sampleData = new Map();
    this._buffers = new Map();
    this._sampleCursor = new Map();
    this._sampleLoading = null;
    this._sampleDecoding = null;
    this._sampleError = '';
    this._voices = new Set();
    this._retiringVoices = new Set();
    this._effectsEnded = false;
    this._muted = false;
    this._paused = false;
    this._unlocked = false;
    this._state = 'title';
    this._activeIndex = -1;
    this._fadeFrame = 0;
    this._switchToken = 0;
    this._loading = null;
    this._unlocking = null;
    this._manifestError = '';
    this._playbackError = '';
    this._contextError = '';
    this._lastEffects = new Map();
    this._decks = [new Audio(), new Audio()];
    for (const deck of this._decks) {
      deck.preload = 'auto';
      deck.volume = 0;
      deck.addEventListener('error', () => {
        if (deck.src) this._playbackError = `Music could not be loaded: ${deck.src.split('/').pop()}`;
      });
    }
    void this._loadManifest();
    void this._loadSamples();
  }

  get muted() { return this._muted; }
  get ready() { return this._unlocked && Object.keys(this.tracks).length > 0; }
  get effectsReady() { return this._buffers.size === Object.values(SAMPLE_GROUPS).flat().length; }
  get error() { return this._contextError || this._playbackError || this._manifestError || this._sampleError; }
  get state() { return this._state; }

  async _loadSamples() {
    if (this._sampleLoading) return this._sampleLoading;
    this._sampleLoading = (async () => {
      const names = Object.values(SAMPLE_GROUPS).flat();
      const results = await Promise.allSettled(names.map(async name => {
        if (this._sampleData.has(name) || this._buffers.has(name)) return;
        const folder = PATCH_SAMPLES.has(name) ? 'sfx-patch1/edited' : 'sfx-v3';
        const url = new URL(`../assets/audio/${folder}/${name}.wav`, import.meta.url);
        const response = await fetch(url);
        if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
        this._sampleData.set(name, await response.arrayBuffer());
      }));
      const failed = results.filter(result => result.status === 'rejected');
      this._sampleError = failed.length ? `${failed.length} sound effect samples could not be loaded.` : '';
      return !failed.length;
    })();
    try { return await this._sampleLoading; }
    finally { this._sampleLoading = null; }
  }

  async _decodeSamples() {
    if (this._sampleDecoding) return this._sampleDecoding;
    this._sampleDecoding = (async () => {
      if (!await this._loadSamples()) await this._loadSamples();
      if (!this.context) return false;
      const results = await Promise.allSettled([...this._sampleData].map(async ([name, data]) => {
        if (!this._buffers.has(name)) this._buffers.set(name, await this.context.decodeAudioData(data.slice(0)));
      }));
      if (results.some(result => result.status === 'rejected')) this._sampleError = 'Some sound effects could not be decoded.';
      return this.effectsReady;
    })();
    try { return await this._sampleDecoding; }
    finally { this._sampleDecoding = null; }
  }

  async _loadManifest() {
    if (this._loading) return this._loading;
    this._loading = (async () => {
      try {
        const response = await fetch(this.manifestUrl, { cache: 'no-cache' });
        if (!response.ok) throw new Error(`Music manifest: HTTP ${response.status}`);
        const manifest = await response.json();
        const collection = manifest.tracks || manifest.music || manifest;
        const entries = Array.isArray(collection)
          ? collection.map(track => [track.state || track.id || track.name, track])
          : Object.entries(collection);
        const tracks = {};
        for (const [name, value] of entries) {
          if (!MUSIC_STATES.includes(name)) continue;
          const source = typeof value === 'string' ? value : value.src || value.path || value.file || value.url;
          if (typeof source !== 'string' || !source) continue;
          const base = /^(?:\.?\/?assets\/|\/|https?:|blob:|data:)/.test(source)
            ? document.baseURI
            : new URL(this.manifestUrl, document.baseURI);
          tracks[name] = new URL(source, base).href;
        }
        if (!Object.keys(tracks).length) throw new Error('No generated music tracks are available in the manifest.');
        this.manifest = manifest;
        this.tracks = tracks;
        this._manifestError = '';
        if (this._unlocked && !this._paused) void this._applyMusicState();
        return true;
      } catch (error) {
        this._manifestError = error?.message || 'Music manifest could not be loaded.';
        return false;
      } finally {
        this._loading = null;
      }
    })();
    return this._loading;
  }

  /** Call directly from the Start button, pointer, or keyboard gesture. */
  async unlock() {
    if (this._unlocking) return this._unlocking;
    this._unlocking = (async () => {
      try {
        const Context = window.AudioContext || window.webkitAudioContext;
        if (Context && !this.context) {
          this.context = new Context();
          this._effects = this.context.createGain();
          this._effects.gain.value = this._muted ? 0 : EFFECTS_VOLUME;
          for (const [name, volume] of Object.entries(BUS_VOLUME)) {
            const bus = this.context.createGain();
            bus.gain.value = volume;
            bus.connect(this._effects);
            this._buses[name] = bus;
          }
          this._limiter = this.context.createDynamicsCompressor();
          this._limiter.threshold.value = -9;
          this._limiter.knee.value = 6;
          this._limiter.ratio.value = 4;
          this._limiter.attack.value = 0.001;
          this._limiter.release.value = 0.08;
          this._saturator = this.context.createWaveShaper();
          const curve = new Float32Array(2049);
          for (let i = 0; i < curve.length; i += 1) {
            const x = i / (curve.length - 1) * 2 - 1;
            const magnitude = Math.abs(x);
            curve[i] = Math.sign(x) * (magnitude < 0.45 ? magnitude : 0.45 + 0.23 * Math.tanh((magnitude - 0.45) / 0.23));
          }
          this._saturator.curve = curve;
          // Bound the effects bus to leave headroom for the 0.28-volume music mix.
          this._effects.connect(this._limiter);
          this._limiter.connect(this._saturator);
          this._saturator.connect(this.context.destination);
        }
        if (this.context && this.context.state === 'suspended' && !this._paused) await this.context.resume();
        if (this._paused) this._syncContextPause();
        this._contextError = Context ? '' : 'This browser does not support sound effects.';
        if (this.context) await this._decodeSamples();
      } catch (error) {
        this._contextError = error?.message || 'Audio could not be activated.';
      }
      this._unlocked = true;
      if (!Object.keys(this.tracks).length) {
        await this._loadManifest();
        // A preload that failed while assets were being prepared must not block Start.
        if (!Object.keys(this.tracks).length) await this._loadManifest();
      }
      await this._applyMusicState();
      this._unlocking = null;
      return this.ready;
    })();
    return this._unlocking;
  }

  setState(state) {
    if (!MUSIC_STATES.includes(state) || state === this._state) return;
    this._state = state;
    if (this._unlocked && !Object.keys(this.tracks).length) void this._loadManifest();
    void this._applyMusicState();
  }

  setMuted(muted) {
    this._muted = Boolean(muted);
    if (this._muted) this._stopEffects();
    for (const deck of this._decks) deck.muted = this._muted;
    if (this._effects && this.context) {
      this._effects.gain.setTargetAtTime(this._muted ? 0 : EFFECTS_VOLUME, this.context.currentTime, 0.025);
    }
  }

  setPaused(paused) {
    if (this._paused === Boolean(paused)) return;
    this._paused = Boolean(paused);
    this._switchToken += 1;
    if (this._paused) {
      this._stopEffects();
      cancelAnimationFrame(this._fadeFrame);
      for (const deck of this._decks) deck.pause();
      this._syncContextPause();
    } else if (this._unlocked) {
      this._syncContextPause();
      void this._applyMusicState();
    }
  }

  _syncContextPause() {
    const context = this.context, paused = this._paused;
    if (!context || !['running', 'suspended'].includes(context.state) || context.state === (paused ? 'suspended' : 'running')) return;
    void context[paused ? 'suspend' : 'resume']().then(() => {
      // A rapid second toggle can arrive before the first context operation ends.
      if (this._paused !== paused) this._syncContextPause();
    }).catch(() => {});
  }

  /** Reset effect lifetime at retry/title boundaries; keep music and decoded buffers. */
  resetEffects() {
    this._effectsEnded = false;
    this._stopEffects();
  }

  _stopEffects(preservePlayerCues = false) {
    const now = this.context?.currentTime || 0;
    for (const voice of [...this._voices, ...this._retiringVoices]) {
      if (preservePlayerCues && voice.playerCue && voice.group === 'critical') continue;
      try { voice.source.stop(now); } catch { /* The source may already have ended. */ }
      voice.source.onended = null;
      voice.source.disconnect(); voice.gain.disconnect(); voice.pan.disconnect();
      this._voices.delete(voice); this._retiringVoices.delete(voice);
    }
    for (const tone of this._uiTones) {
      try { tone.oscillator.stop(now); } catch { /* Includes scheduled, not-yet-audible notes. */ }
      tone.oscillator.onended = null;
      tone.oscillator.disconnect(); tone.gain.disconnect();
    }
    this._uiTones.clear();
    this._lastEffects.clear();
    this._duckUntil = 0; this._duckLevel = 1;
    cancelAnimationFrame(this._musicDuckFrame);
    this._musicDuckFrame = 0;
    this._musicDuckUntil = 0; this._musicDuckLevel = 1;
    this._musicDuckFrom = 1;
    this._applyMusicVolumes();
    this._combatQuietUntil = 0;
    const gain = this._buses.shot?.gain;
    if (gain) { gain.cancelScheduledValues(now); gain.setValueAtTime(BUS_VOLUME.shot, now); }
  }

  async _applyMusicState() {
    if (!this._unlocked || this._paused) return;
    const source = this.tracks[this._state];
    if (!source) {
      if (Object.keys(this.tracks).length) this._playbackError = `Generated music is missing for: ${this._state}`;
      return;
    }
    const token = ++this._switchToken;
    cancelAnimationFrame(this._fadeFrame);
    let index = this._decks.findIndex(deck => deck.src === source);
    if (index < 0) {
      index = this._decks[0].volume <= this._decks[1].volume ? 0 : 1;
      const deck = this._decks[index];
      deck.pause();
      this._musicVolumes[index] = 0;
      deck.volume = 0;
      deck.src = source;
      deck.load();
    }
    const target = this._decks[index];
    target.loop = this._state !== 'ending';
    target.muted = this._muted;
    try {
      if (target.ended) target.currentTime = 0;
      await target.play();
      if (this._paused) { target.pause(); return; }
      if (token !== this._switchToken) return;
      this._playbackError = '';
      this._activeIndex = index;
      for (let i = 0; i < this._decks.length; i += 1) {
        const deck = this._decks[i];
        if (i !== index && deck.src && deck.volume > 0.001 && deck.paused) {
          void deck.play().catch(() => {});
        }
      }
      const starting = [...this._musicVolumes];
      const started = performance.now();
      const fade = now => {
        if (token !== this._switchToken || this._paused) return;
        const t = Math.min(1, (now - started) / CROSSFADE_MS);
        const progress = t * t * (3 - 2 * t);
        for (let i = 0; i < this._decks.length; i += 1) {
          const volume = i === index ? MUSIC_VOLUME : 0;
          this._musicVolumes[i] = Math.max(0, Math.min(1, starting[i] + (volume - starting[i]) * progress));
        }
        this._applyMusicVolumes();
        if (t < 1) this._fadeFrame = requestAnimationFrame(fade);
        else for (let i = 0; i < this._decks.length; i += 1) if (i !== index) this._decks[i].pause();
      };
      this._fadeFrame = requestAnimationFrame(fade);
    } catch (error) {
      if (token === this._switchToken && error?.name !== 'AbortError') {
        this._playbackError = error?.message || 'Music playback could not begin.';
      }
    }
  }

  _applyMusicVolumes() {
    const now = this.context?.currentTime || 0;
    const release = Math.max(0, Math.min(1, (now - this._musicDuckUntil) / 0.24));
    const attack = Math.max(0, Math.min(1, (now - this._musicDuckStarted) / 0.035));
    const held = this._musicDuckFrom + (this._musicDuckLevel - this._musicDuckFrom) * attack;
    const level = held + (1 - held) * release;
    for (let i = 0; i < this._decks.length; i += 1) this._decks[i].volume = this._musicVolumes[i] * level;
    return level;
  }

  _duckMusic(level, hold) {
    const now = this.context.currentTime;
    // Mix contrast only: retain the same tracks, playback position and state crossfade.
    this._musicDuckFrom = this._applyMusicVolumes();
    this._musicDuckLevel = now < this._musicDuckUntil ? Math.min(level, this._musicDuckLevel) : Math.min(level, this._musicDuckFrom);
    this._musicDuckStarted = now;
    this._musicDuckUntil = Math.max(this._musicDuckUntil, now + hold);
    cancelAnimationFrame(this._musicDuckFrame);
    const update = () => {
      this._applyMusicVolumes();
      this._musicDuckFrame = this.context.currentTime < this._musicDuckUntil + 0.24
        ? requestAnimationFrame(update) : 0;
    };
    update();
  }

  _tone(from, to, duration, volume, type = 'sine', delay = 0, combat = false, priority = combat ? 1 : 3) {
    const context = this.context;
    // UI motifs have a separate small ceiling, including notes scheduled ahead.
    for (const tone of this._uiTones) if (tone.endsAt <= context.currentTime) this._uiTones.delete(tone);
    const accents = [...this._uiTones].filter(tone => tone.combat);
    if (combat && context.currentTime < this._combatQuietUntil) return false;
    // Tension lifecycle cues can replace ordinary combat resonance; warnings remain above both.
    if (combat && accents.length >= COMBAT_ACCENTS.maxTones) {
      const victim = accents.sort((a, b) => a.priority - b.priority || a.endsAt - b.endsAt)[0];
      if (victim.priority >= priority) return false;
      this._stopTone(victim);
    }
    if (this._uiTones.size >= 12) {
      const victim = [...this._uiTones].sort((a, b) => a.priority - b.priority || a.endsAt - b.endsAt)[0];
      if (victim.priority >= priority) return false;
      this._stopTone(victim);
    }
    const at = context.currentTime + delay;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, at);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, to), at + duration);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(volume, at + Math.min(0.003, duration * 0.08));
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    oscillator.connect(gain);
    gain.connect(this._buses[combat ? 'impact' : 'ui'] || this._effects);
    const tone = { oscillator, gain, combat, priority, endsAt: at + duration + 0.015 };
    this._uiTones.add(tone);
    oscillator.start(at);
    oscillator.stop(at + duration + 0.015);
    oscillator.onended = () => { this._uiTones.delete(tone); oscillator.disconnect(); gain.disconnect(); };
    return true;
  }

  _stopTone(tone) {
    try { tone.oscillator.stop(this.context.currentTime); } catch { /* An already ended note is harmless. */ }
    tone.oscillator.onended = null;
    tone.oscillator.disconnect(); tone.gain.disconnect();
    this._uiTones.delete(tone);
  }

  _combatAccent(key, from, to, duration, volume, wave = 'triangle', cooldown = 0.1, priority = 1) {
    const now = this.context.currentTime, throttleKey = `accent-${key}`;
    if (now - (this._lastEffects.get(throttleKey) ?? -Infinity) < cooldown) return false;
    if (!this._tone(from, to, duration, volume, wave, 0, true, priority)) return false;
    this._lastEffects.set(throttleKey, now);
    return true;
  }

  _duckShots(level, hold) {
    const gain = this._buses.shot?.gain;
    if (!gain) return;
    const now = this.context.currentTime;
    // A quieter notification cannot cancel a player-damage duck already in progress.
    this._duckLevel = now < this._duckUntil ? Math.min(level, this._duckLevel) : level;
    this._duckUntil = Math.max(this._duckUntil, now + hold);
    const current = gain.value;
    if (gain.cancelAndHoldAtTime) gain.cancelAndHoldAtTime(now);
    else { gain.cancelScheduledValues(now); gain.setValueAtTime(current, now); }
    gain.linearRampToValueAtTime(BUS_VOLUME.shot * this._duckLevel, now + 0.008);
    gain.setValueAtTime(BUS_VOLUME.shot * this._duckLevel, this._duckUntil);
    gain.linearRampToValueAtTime(BUS_VOLUME.shot, this._duckUntil + 0.1);
  }

  _retireVoice(voice) {
    this._voices.delete(voice);
    const now = this.context.currentTime;
    const current = voice.gain.gain.value;
    if (voice.gain.gain.cancelAndHoldAtTime) voice.gain.gain.cancelAndHoldAtTime(now);
    else { voice.gain.gain.cancelScheduledValues(now); voice.gain.gain.setValueAtTime(current, now); }
    voice.gain.gain.linearRampToValueAtTime(0, now + 0.012);
    voice.source.stop(now + 0.013);
    voice.retiresAt = now + 0.013;
    this._retiringVoices.add(voice);
    // A brief release avoids clicks on stolen tails, with at most four extra sources.
    if (this._retiringVoices.size > 4) {
      const oldest = this._retiringVoices.values().next().value;
      oldest.source.stop(now);
      this._retiringVoices.delete(oldest);
    }
  }

  _randomSound() {
    // Private audio RNG: never reads or changes the game's enemy/drop seed.
    let value = (this._audioRng = (this._audioRng + 0x6d2b79f5) >>> 0);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }

  _shotVariation(mode) {
    const choices = PATCH_GROUPS[`fire-${mode}`];
    if (!this.soundVariation) return { sampleName: choices[0], rate: 1, gain: 1, accent: false };
    let bag = this._shotBags.get(mode);
    if (!bag) {
      bag = { remaining: [], last: null, untilAccent: 4 + Math.floor(this._randomSound() * 4) };
      this._shotBags.set(mode, bag);
    }
    if (!bag.remaining.length) {
      bag.remaining = [...choices];
      for (let index = bag.remaining.length - 1; index > 0; index -= 1) {
        const other = Math.floor(this._randomSound() * (index + 1));
        [bag.remaining[index], bag.remaining[other]] = [bag.remaining[other], bag.remaining[index]];
      }
      // pop() is the next playback; preserve no-repeat across shuffled bags.
      const last = bag.remaining.length - 1;
      if (bag.remaining[last] === bag.last) [bag.remaining[0], bag.remaining[last]] = [bag.remaining[last], bag.remaining[0]];
    }
    const sampleName = bag.remaining.pop();
    bag.last = sampleName;
    const accent = --bag.untilAccent === 0;
    if (accent) bag.untilAccent = 4 + Math.floor(this._randomSound() * 4);
    const settings = this._shotSettings;
    const cents = (this._randomSound() * 2 - 1) * settings.pitchCents;
    const decibels = (this._randomSound() * 2 - 1) * settings.gainDb + (accent ? settings.accentDb : 0);
    return { sampleName, rate: 2 ** (cents / 1200), gain: 10 ** (decibels / 20), accent };
  }

  _sample(name, group, volume, event = {}, priority = 2, rate = 1, duration = Infinity, options = {}) {
    const choices = SAMPLE_GROUPS[name];
    if (!choices) return false;
    const cursor = this._sampleCursor.get(name) || 0;
    const sampleName = options.sampleName || choices[cursor % choices.length];
    const buffer = this._buffers.get(sampleName);
    if (!buffer) return false;
    const now = this.context.currentTime;
    // Natural source endings can precede the onended task by a frame.
    for (const voice of this._voices) if (voice.endsAt <= now) this._voices.delete(voice);
    for (const voice of this._retiringVoices) if (voice.retiresAt <= now) this._retiringVoices.delete(voice);
    const sameGroup = [...this._voices].filter(voice => voice.group === group);
    if (sameGroup.length >= VOICE_LIMITS[group]) {
      const victim = sameGroup.sort((a, b) => a.priority - b.priority || a.startedAt - b.startedAt)[0];
      if (victim.priority > priority) return false;
      this._retireVoice(victim);
    }
    if (this._voices.size >= MAX_VOICES) {
      const victim = [...this._voices].sort((a, b) => a.priority - b.priority || a.startedAt - b.startedAt)[0];
      if (victim.priority > priority) return false;
      this._retireVoice(victim);
    }
    this._sampleCursor.set(name, cursor + 1);
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    const pan = this.context.createStereoPanner();
    // New shots supply their own variation. Fixed damage/cues opt out entirely.
    source.buffer = buffer;
    source.playbackRate.value = rate * (options.variation === false ? 1 : [1, 1.025, 0.98, 1.01][cursor % 4]);
    gain.gain.value = volume * (options.variation === false ? 1 : [1, 0.95, 1.02, 0.97][cursor % 4]);
    pan.pan.value = options.centered ? 0 : Number.isFinite(event.x) ? Math.max(-0.35, Math.min(0.35, (event.x / 1280 - 0.5) * 0.7)) : 0;
    source.connect(gain);
    gain.connect(pan);
    const bus = group === 'shot' || group === 'enemy' ? 'shot' : group === 'ui' ? 'ui' : 'impact';
    pan.connect(this._buses[bus] || this._effects);
    const playDuration = Math.min(buffer.duration / source.playbackRate.value, duration);
    if (Number.isFinite(duration)) {
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.setValueAtTime(gain.gain.value, now + Math.max(0, playDuration - 0.025));
      gain.gain.linearRampToValueAtTime(0, now + playDuration);
    }
    const voice = { source, gain, pan, group, priority, sampleName, playerCue: Boolean(event.player), tension: event.tension === true, accent: Boolean(options.accent), volume: gain.gain.value,
      startedAt: now, endsAt: now + playDuration };
    this._voices.add(voice);
    source.onended = () => {
      this._voices.delete(voice);
      this._retiringVoices.delete(voice);
      source.disconnect(); gain.disconnect(); pan.disconnect();
    };
    source.start(now);
    if (Number.isFinite(duration)) source.stop(now + playDuration);
    return true;
  }

  playEvent(event) {
    if (event?.type === 'start') { this.resetEffects(); return; }
    if (!event || this._effectsEnded) return;
    if (event.type === 'gameover') this._effectsEnded = true;
    if (!this._unlocked || this._muted || this._paused || this.context?.state !== 'running') return;
    const now = this.context.currentTime;
    const weaponMode = event.drone || event.weaponMode === 'drone' ? 'drone'
      : event.type === 'shot' && event.powered === false ? 'normal'
        : Object.hasOwn(WEAPON_SOUNDS, event.weaponMode) ? event.weaponMode : 'normal';
    const targetProfile = TARGET_SOUNDS[event.enemyType] || 'targetLight';
    const tension = event.tension === true, accent = COMBAT_ACCENTS.weapons[weaponMode];
    const pickupEffect = PICKUP_EFFECTS.has(event.effect) ? event.effect
      : (event.pickupType || event.itemType) === 'health' ? 'health' : 'change';
    // Three bounded target-profile keys allow distinct surfaces in one frame.
    const key = event.type === 'hit' && !event.player ? `hit-${targetProfile}`
      : event.type === 'hit' || event.type === 'explosion' ? `${event.type}-${Boolean(event.player)}-${Boolean(event.boss)}`
        : event.type === 'shot' ? `shot-${weaponMode === 'drone' ? 'drone' : 'weapon'}`
          : event.type === 'weaponWarning' || event.type === 'weaponExpired' ? `${event.type}-${event.slot || 'weapon'}`
            : event.type === 'pickup' ? `pickup-${pickupEffect}` : event.type;
    const cooldown = event.type === 'shot' ? 0.04 : event.type === 'enemyShot' ? 0.1
      : event.type === 'hit' ? (event.player ? 0 : 0.065) : event.type === 'explosion' ? 0.075 : 0.08;
    if (now - (this._lastEffects.get(key) ?? -Infinity) < cooldown) return;
    this._lastEffects.set(key, now);
    switch (event.type) {
      case 'shot': {
        const sound = WEAPON_SOUNDS[weaponMode];
        const variation = this._shotVariation(weaponMode);
        const played = this._sample(sound.sample, 'shot', sound.volume * variation.gain * (tension ? 1.04 : 1), event, weaponMode === 'drone' ? 1 : 2,
          variation.rate * (tension ? accent.rate : 1), sound.duration, { ...variation, variation: false });
        if (played && tension) this._combatAccent(`shot-${weaponMode === 'drone' ? 'drone' : 'weapon'}`, accent.note * 1.5, accent.note,
          accent.duration, accent.volume, accent.wave, COMBAT_ACCENTS.shotCooldown);
        break;
      }
      case 'enemyShot':
        this._sample('enemy', 'enemy', event.boss ? 0.27 : 0.17, event, 1, event.boss ? 0.82 : 1, 0.2);
        break;
      case 'explosion': {
        if (event.boss || event.player) {
          if (this._sample('heavy', 'critical', event.boss ? 0.86 : 0.78, event, 4, 1, event.boss ? 0.9 : 0.72)) this._duckShots(0.4, 0.2);
        } else if (this._sample('explosion', 'explosion', 0.62, event, 4, 1, 0.46)) this._duckShots(0.67, 0.09);
        if (!event.player && Number.isFinite(event.chain) && event.chain > 0) {
          const step = Math.min(3, Math.floor((event.chain - 1) / 3));
          const note = COMBAT_ACCENTS.chainNotes[step] * (tension ? 1.5 : 1);
          this._combatAccent('chain', note, note, event.boss ? 0.19 : 0.12, event.boss ? 0.06 : 0.045,
            'triangle', COMBAT_ACCENTS.chainCooldown);
        }
        break;
      }
      case 'hit': {
        if (event.player) {
          this._combatQuietUntil = now + COMBAT_ACCENTS.playerDamageHold;
          for (const tone of [...this._uiTones]) if (tone.combat) this._stopTone(tone);
          if (this._sample('fixedPlayerDamage', 'critical', 0.9, event, 6, 1, 0.3, { variation: false, centered: true })) {
            this._duckShots(0.32, 0.18);
            this._duckMusic(0.52, 0.2);
          }
        } else {
          const weaponHit = this._sample(`impact-${weaponMode}`, 'hit', (weaponMode === 'drone' ? 0.5 : 0.86) * (tension ? 1.04 : 1), event, 3,
            tension ? accent.rate : 1, 0.16, { variation: false });
          const targetHit = this._sample(targetProfile, 'hit', weaponMode === 'drone' ? 0.5 : 0.58, event, 3, 1, 0.14, { variation: false });
          if (weaponHit || targetHit) this._duckShots(0.82, 0.035);
          if ((weaponHit || targetHit) && tension) this._combatAccent('hit', accent.note, accent.note * 0.75,
            0.085, weaponMode === 'drone' ? 0.025 : 0.05, accent.wave, COMBAT_ACCENTS.hitCooldown);
        }
        break;
      }
      case 'pickupAttract':
        // One short approach cue; actual collection still owns the reward motif.
        this._combatAccent('pickup-attract', 330, 880, 0.14, 0.075, 'sine', 0.12, 2);
        break;
      case 'pickup': {
        if (pickupEffect === 'health') {
          [523, 659, 784, 1047].forEach((note, i) => this._tone(note, note * 1.004, 0.25, 0.09, 'sine', i * 0.055));
        } else if (pickupEffect === 'extend') {
          [660, 880].forEach((note, i) => this._tone(note, note, 0.16, 0.08, 'sine', i * 0.065));
        } else if (pickupEffect === 'levelUp') {
          [523, 784, 1047].forEach((note, i) => this._tone(note, note, 0.18, 0.08, 'triangle', i * 0.055));
        } else {
          this._sample('weaponChange', 'ui', pickupEffect === 'drone' ? 0.65 : 0.82, event, 5,
            pickupEffect === 'drone' ? 1.12 : 1, 0.36, { variation: false, centered: true });
        }
        this._duckShots(0.48, 0.22);
        break;
      }
      case 'tension':
        if (event.refresh) {
          if (this._combatAccent('tension-refresh', 1175, 1568, 0.095, 0.07, 'triangle', 0.24, 2)) this._duckShots(0.72, 0.08);
        } else if (this._combatAccent('tension-start', 523, 1047, 0.21, 0.18, 'triangle', 0.24, 2)) {
          this._tone(131, 262, 0.2, 0.1, 'sine', 0, true, 2);
          this._tone(1568, 1568, 0.18, 0.075, 'sine', 0.1, true, 2);
          this._duckShots(0.38, 0.24);
          this._duckMusic(0.58, 0.22);
        }
        break;
      case 'tensionEnd':
        // Damage/defeat owns the danger cue; do not layer a reward-ending note over it.
        if (event.reason === 'expired') this._combatAccent('tension-end', 784, 392, 0.16, 0.055, 'sine', 0.2, 2);
        break;
      case 'weaponWarning': {
        const note = event.slot === 'drone' ? 740 : 660;
        this._tone(note, note * 0.94, 0.13, 0.035, 'sine');
        break;
      }
      case 'weaponExpired': {
        if (this._sample('weaponExpire', 'ui', 0.65, event, 5, 1, 0.28, { variation: false, centered: true })) this._duckShots(0.55, 0.16);
        break;
      }
      case 'boss':
        [0, 0.32, 0.64].forEach(delay => {
          this._tone(146, 110, 0.24, 0.13, 'sawtooth', delay);
          this._tone(73, 55, 0.28, 0.13, 'sine', delay);
        });
        break;
      case 'bossDefeated':
        [392, 494, 587, 784].forEach((note, i) => this._tone(note, note, 0.6, 0.1, 'triangle', i * 0.11));
        break;
      case 'gameover':
        this._stopEffects(true);
        [392, 330, 262, 131].forEach((note, i) => this._tone(note, note * 0.97, 0.65, 0.11, 'triangle', i * 0.18));
        break;
      default:
        break;
    }
  }
}

export default AudioDirector;
