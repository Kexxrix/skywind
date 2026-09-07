const MUSIC_STATES = ['title', 'normal', 'danger', 'boss', 'powerup', 'ending'];
const MUSIC_VOLUME = 0.28;
const EFFECTS_VOLUME = 0.7;
const CROSSFADE_MS = 1200;

/** Lyria music from the asset manifest, with locally synthesized game effects. */
export class AudioDirector {
  constructor(manifestUrl = './assets/audio/manifest.json') {
    this.manifestUrl = manifestUrl;
    this.manifest = null;
    this.tracks = {};
    this.context = null;
    this._effects = null;
    this._limiter = null;
    this._saturator = null;
    this._noise = null;
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
  }

  get muted() { return this._muted; }
  get ready() { return this._unlocked && Object.keys(this.tracks).length > 0; }
  get error() { return this._contextError || this._playbackError || this._manifestError; }
  get state() { return this._state; }

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
          this._limiter = this.context.createDynamicsCompressor();
          this._limiter.threshold.value = -14;
          this._limiter.knee.value = 8;
          this._limiter.ratio.value = 10;
          this._limiter.attack.value = 0.002;
          this._limiter.release.value = 0.14;
          this._saturator = this.context.createWaveShaper();
          const curve = new Float32Array(2049);
          for (let i = 0; i < curve.length; i += 1) {
            const x = i / (curve.length - 1) * 2 - 1;
            curve[i] = 0.65 * Math.tanh(x * 1.8) / Math.tanh(1.8);
          }
          this._saturator.curve = curve;
          // Bound the effects bus to leave headroom for the 0.28-volume music mix.
          this._effects.connect(this._limiter);
          this._limiter.connect(this._saturator);
          this._saturator.connect(this.context.destination);
          this._noise = this.context.createBuffer(1, Math.ceil(this.context.sampleRate * 1.4), this.context.sampleRate);
          const samples = this._noise.getChannelData(0);
          let seed = 2047;
          for (let i = 0; i < samples.length; i += 1) {
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
            samples[i] = seed / 2147483648 - 1;
          }
        }
        if (this.context && this.context.state === 'suspended' && !this._paused) await this.context.resume();
        this._contextError = Context ? '' : 'This browser does not support synthesized sound effects.';
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
      cancelAnimationFrame(this._fadeFrame);
      for (const deck of this._decks) deck.pause();
      if (this.context?.state === 'running') void this.context.suspend().catch(() => {});
    } else if (this._unlocked) {
      if (this.context?.state === 'suspended') void this.context.resume().catch(() => {});
      void this._applyMusicState();
    }
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
      if (token !== this._switchToken || this._paused) return;
      this._playbackError = '';
      this._activeIndex = index;
      for (let i = 0; i < this._decks.length; i += 1) {
        const deck = this._decks[i];
        if (i !== index && deck.src && deck.volume > 0.001 && deck.paused) {
          void deck.play().catch(() => {});
        }
      }
      const starting = this._decks.map(deck => deck.volume);
      const started = performance.now();
      const fade = now => {
        if (token !== this._switchToken || this._paused) return;
        const t = Math.min(1, (now - started) / CROSSFADE_MS);
        const progress = t * t * (3 - 2 * t);
        for (let i = 0; i < this._decks.length; i += 1) {
          const volume = i === index ? MUSIC_VOLUME : 0;
          this._decks[i].volume = Math.max(0, Math.min(1, starting[i] + (volume - starting[i]) * progress));
        }
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

  _tone(from, to, duration, volume, type = 'sine', delay = 0) {
    const context = this.context;
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
    gain.connect(this._effects);
    oscillator.start(at);
    oscillator.stop(at + duration + 0.015);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }

  _burst(duration, volume, frequency = 1300, delay = 0, type = 'lowpass') {
    const context = this.context;
    const at = context.currentTime + delay;
    const source = context.createBufferSource();
    source.buffer = this._noise;
    const filter = context.createBiquadFilter();
    filter.type = type;
    filter.Q.value = type === 'bandpass' ? 0.8 : 0.55;
    filter.frequency.setValueAtTime(frequency, at);
    filter.frequency.exponentialRampToValueAtTime(type === 'highpass' ? 1400 : 100, at + duration);
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(volume, at + Math.min(0.002, duration * 0.05));
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this._effects);
    source.start(at, 0, duration);
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
  }

  playEvent(event) {
    if (!event || !this._unlocked || this._muted || this._paused || this.context?.state !== 'running') return;
    const now = this.context.currentTime;
    const key = event.type === 'hit' ? `hit-${Boolean(event.player)}` : event.type;
    const cooldown = event.type === 'shot' ? 0.045 : event.type === 'enemyShot' ? 0.12 : event.type === 'hit' ? 0.04 : 0.025;
    if (now - (this._lastEffects.get(key) ?? -Infinity) < cooldown) return;
    this._lastEffects.set(key, now);
    switch (event.type) {
      case 'shot':
        this._burst(0.032, event.powered ? 0.5 : 0.33, 6400, 0, 'highpass');
        this._tone(event.powered ? 2400 : 3200, 480, 0.055, event.powered ? 0.14 : 0.1, 'sawtooth');
        this._tone(event.powered ? 240 : 190, 55, 0.075, event.powered ? 0.3 : 0.2);
        if (event.powered) {
          this._burst(0.085, 0.25, 3100, 0.01, 'bandpass');
          this._tone(1100, 160, 0.12, 0.11, 'square');
        }
        break;
      case 'enemyShot':
        this._burst(0.045, event.boss ? 0.24 : 0.1, 3800, 0, 'highpass');
        this._tone(event.boss ? 760 : 1050, 150, 0.13, event.boss ? 0.13 : 0.055, 'sawtooth');
        break;
      case 'explosion':
        this._burst(0.065, event.boss ? 0.95 : 0.65, 6500, 0, 'highpass');
        this._tone(event.boss ? 165 : 210, 32, event.boss ? 1.15 : 0.46, event.boss ? 0.95 : 0.7);
        this._burst(event.boss ? 1.35 : event.player ? 0.95 : 0.62, event.boss ? 1.05 : 0.68, 1800, 0.012);
        this._burst(event.boss ? 0.8 : 0.4, event.boss ? 0.42 : 0.24, 4200, 0.055, 'bandpass');
        if (event.boss || event.player) {
          this._tone(78, 25, 1.25, 0.62, 'sine', 0.07);
          [0.13, 0.27, 0.43].forEach((delay, i) => this._burst(0.22, 0.3 / (i + 1), 5400, delay, 'highpass'));
        }
        break;
      case 'hit':
        if (event.player) {
          this._burst(0.065, 0.6, 5500, 0, 'highpass');
          this._burst(0.24, 0.4, 2400);
          this._tone(310, 48, 0.24, 0.38, 'sawtooth');
        } else {
          this._burst(0.035, 0.26, 5200, 0, 'highpass');
          this._tone(1550, 390, 0.052, 0.12, 'square');
        }
        break;
      case 'pickup': {
        const type = event.pickupType || event.itemType;
        if (type !== 'health') {
          this._tone(180, 1800, 0.32, 0.16, 'sawtooth');
          this._burst(0.3, 0.2, 3500, 0, 'bandpass');
          this._tone(90, 55, 0.4, 0.32, 'sine', 0.18);
        }
        const notes = type === 'health' ? [523, 659, 784, 1047] : type === 'drone' ? [392, 587, 784, 1175] : [440, 660, 880, 1320];
        notes.forEach((note, i) => this._tone(note, note * 1.004, 0.32, 0.13, 'sine', i * 0.055));
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
        [392, 330, 262, 131].forEach((note, i) => this._tone(note, note * 0.97, 0.65, 0.11, 'triangle', i * 0.18));
        break;
      default:
        break;
    }
  }
}

export default AudioDirector;
