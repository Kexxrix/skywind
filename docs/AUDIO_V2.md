# SkyWind audio revision 2

Date: 2026-09-06 (Asia/Seoul).
Request: faster, aggressive futuristic metal music and sharper, more forceful weapons and explosions.
Generation source: https://gemini.google.com/app?hl=ko (personal conversation identifier omitted in public backup) — Gemini music creation / Lyria.

Previous audio files and original video sources are retained. `assets/audio/manifest-v1.json` preserves the previous state mapping. Revised audio uses `-v2` filenames. Generation prompts describe original music characteristics without requesting reproduction of an existing soundtrack.

## Music prompts

### normal-v2

> SkyWind soundtrack revision: generate an ORIGINAL instrumental futuristic industrial metal track titled "SkyWind — Razor Circuit", for normal high-speed aerial combat gameplay. 184 BPM. Tight violently syncopated distorted seven-string guitar riffs, precise staccato palm-muted chugs, rapid double-kick drums, cracking snares, aggressive synth bass, razor-sharp electronic accents and brief soaring lead guitar hooks. Relentless cyborg combat energy, mechanically precise, visceral and exhilarating. Full-band impact from the first second, no ambient or orchestral introduction. Maintain an intense loop-friendly driving groove, give game weapon transients room in the mix. No vocals, no speech, no lyrics. Entirely original composition, do not copy any existing soundtrack or melody. Generate the actual audio.

Generated source: `kinetic_protocol.mp4`, preserved as `assets/audio/source/normal-v2-kinetic_protocol.mp4`; AAC extracted without re-encoding to `assets/audio/normal-v2.m4a` (133.355 seconds). The first request returned a service generation error; its official retry succeeded.

### danger-v2

> Generate a NEW original instrumental track, not an edit: "SkyWind — Redline Fracture", the LOW HP DANGER cue for a futuristic aerial shooter. 190 BPM cyber-industrial metal, dry slicing distorted low-tuned guitar riffs in urgent staccato patterns, relentless double-kick drums, hard cracking snare, tense dissonant high guitar bends and racing distorted synth bass. No vocals, no lyrics, no speech. Immediate intense start, absolutely no ambient introduction, no calm breakdown. Desperate mechanically precise combat momentum, darker and more anxious than Razor Circuit. Original melody and riffs only; no copied soundtrack material. Generate the actual music audio.

### boss-v2

> Generate a NEW original instrumental music track: "SkyWind — Tyrant Machine", BOSS BATTLE for a futuristic aerial combat game. 178 BPM extremely powerful industrial progressive metal: massive low-tuned distorted guitar riffs, synchronized double-kick patterns, explosive hard snare, metallic percussion, aggressive electronic bass, ominous synthetic textures and a soaring original lead guitar theme. Mechanical colossus confrontation, huge weight with rapid movement. Start immediately with the central heavy riff and drums; build through tense variations while retaining continuous battle energy. No vocals, no choir, no speech, no copied soundtrack melody. Generate actual music audio, original composition only.

### powerup-v2

> Generate a NEW original instrumental music track: "SkyWind — Overclock Dominion", TEMPORARY SUPER-WEAPON POWER-UP music for a futuristic aerial shooter. 188 BPM explosive uplifting cyber metal. Violently tight distorted guitar riffs and double-kick drums with a triumphant soaring lead guitar hook, bright razor-edged synth arpeggios, crushing bass and hard snare. Feel unstoppable and supercharged, blazing energy, rapid precision, more victorious and electrifying than normal battle. Immediate full-energy riff from the first beat; keep a relentless loop-friendly groove. No vocals, no lyrics, no speech, no choir, no copied melodies or soundtrack material. Generate the actual original audio.

### title-v2

> Generate a NEW original instrumental title-screen music track for SkyWind: "SkyWind — Machine Awakening". Futuristic industrial metal identity, 128 BPM, restrained but powerful chugging distorted guitars, a memorable original electric-guitar melody, pulsing cyber synth bass, crisp mechanical drums, cool dark electronic atmosphere. A war machine coming online before a high-speed aerial battle. Confident anticipation, clear rhythmic hook immediately, a steady looping menu groove, no long ambient intro, less crowded than the 184 BPM combat music. No vocals, no lyrics, no speech, no choir, no orchestral strings. Generate actual original music audio with no copied melody.

### ending-v2

> Generate a NEW original instrumental ending and game-over music cue for SkyWind: "SkyWind — Signal Aftermath". Futuristic metal soundtrack palette, now reflective and dignified. 84 BPM half-time, expressive clean electric guitar melody with a restrained distorted guitar swell, deep warm synth bass, sparse mechanical drum pulse and cool digital ambience. A damaged flying war machine powers down at sunset after a ferocious battle. Begin the memorable bittersweet original guitar motif immediately; concise emotional development with a natural soft resolution. No orchestral strings, no vocals, no lyrics, no speech, no choir, no copied soundtrack material. Generate actual original music audio.


## Synthesized effects

`src/audio.js` keeps the existing event interface, audio unlocking, mute, pause and music transition system.

- Player shots: 2 ms high-frequency noise transient, short descending saw pulse and a low-frequency body. Powered fire adds a band-limited crack and a longer square-wave energy tail.
- Enemy shots: a distinct lower descending pulse with a short high-frequency snap.
- Enemy impacts: a sharp metallic noise transient and short square pulse. Player impacts add stronger low and mid-frequency impact layers.
- Explosions: high-frequency initial crack, deep descending sine impact, filtered rumble, and a separate debris layer. Boss/player explosions add a longer sub-bass tail and staggered debris bursts.
- Weapon and drone pickups: rising charge pulse, filtered energy swell and a bass hit, retaining the existing state-specific ascending notes.
- Effects gain is 0.7, followed by a compressor (threshold -14 dB, ratio 10:1, 2 ms attack, 140 ms release) and a bounded saturator with peak curve output 0.65. The music remains at 0.28 volume, retaining mix headroom.
- Effect cooldowns keep fast weapon feedback audible while bounding repeated event density.

## Effect verification

Chrome's real `OfflineAudioContext` rendered the production AudioDirector graph and actual playEvent synthesis. A temporary test-only AudioContext adapter supplied offline time scheduling; no production graph was replaced. No speaker output or score/preferences writes were used.

| Event test | Peak amplitude | RMS over 4 s | Clipped samples | Nonfinite samples |
| --- | ---: | ---: | ---: | ---: |
| Normal shot | 0.273162 | 0.004827 | 0 | 0 |
| Powered shot | 0.406154 | 0.007029 | 0 | 0 |
| Normal explosion | 0.556168 | 0.033188 | 0 | 0 |
| Boss explosion | 0.608280 | 0.077886 | 0 | 0 |
| Dense battle, 90 mixed events | 0.636446 | 0.186112 | 0 | 0 |

`node --check src/audio.js` passed. All offline cases returned an empty AudioDirector error. The stress-test peak remained below the 0.65 effects ceiling.



## Delivered revised soundtrack

| State | Generated source title/filename | Runtime file | Duration | Requested tempo |
| --- | --- | --- | ---: | ---: |
| normal | kinetic_protocol.mp4 | assets/audio/normal-v2.m4a | 133.355 s | 184 BPM |
| danger | piston_collapse.mp4 | assets/audio/danger-v2.m4a | 137.822 s | 190 BPM |
| boss | siege_of_the_titan.mp4 | assets/audio/boss-v2.m4a | 132.153 s | 178 BPM |
| powerup | apex_surge.mp4 | assets/audio/powerup-v2.m4a | 132.232 s | 188 BPM |
| title | armored_protocol.mp4 | assets/audio/title-v2.m4a | 138.762 s | 128 BPM |
| ending | sunset_over_the_hull.mp4 | assets/audio/ending-v2.m4a | 132.728 s | 84 BPM |

All generated MP4 originals are preserved as `assets/audio/source/<state>-v2-<original filename>`. The local AAC soundtrack is copied without re-encoding. The six revised files fully decode, and each compressed audio-stream hash matches its source MP4. All six earlier M4A files still match the original SHA-256 values in `docs/AUDIO_VERIFICATION.json`. Revised hashes and media metadata are recorded separately in `docs/AUDIO_V2_VERIFICATION.json`.

Generation counts: 7 attempts, 6 successful media outputs, 1 initial service failure resolved by the official retry. The tempo values above describe the generation prompts; they are not independent tempo measurements.

The active `assets/audio/manifest.json` was updated only after all six media files passed decode and stream-copy verification. The previous mapping is retained in `assets/audio/manifest-v1.json`.

## Final browser verification

A separate Chrome QA tab loaded http://127.0.0.1:5173/ and used its real START button for audio unlocking. The application's exported game/audio instances and actual `chooseMusic()` frame-loop selection were exercised with isolated title, normal, HP 30, boss-present, powered-weapon and game-over-mode conditions.

- Each selected state resolved to its matching `-v2.m4a` file.
- All six actual HTMLAudioElements reached readyState 4 and advanced 0.599–0.601 seconds across a 0.6-second sample.
- Every settled crossfade reached volume 0.28 and paused the previous deck.
- All tracks loop except ending, which plays once.
- AudioDirector and media errors were empty; Chrome console errors/warnings were empty.
- The new production compressor graph was present at threshold -14 dB / ratio 10.
- Pausing stopped both decks, with playback times stable over a further 0.6-second sample.
- Music remained muted during this technical check to avoid overlapping concurrent tabs. No sound preference or best-score values changed. Ending was set without emitting a score-saving game-over event.
- The temporary QA tab was closed; the user-facing game tab was untouched.

This verifies generated-file integrity, actual browser playback and music selection, plus the synthesized effects graph. The music's requested instrumentation and tempo are generation directions; technical checks do not independently prove every stylistic detail. Final listening balance can be judged in the running game.
