# SkyWind V2 verification — 2026-09-06

Local server: http://127.0.0.1:5173/ (loopback, process 39260 at verification time). No deployment, Git operation, dependency installation or source-video modification.

## Changed files

- `src/game.js`: nine enemy behaviors, four bosses, time-based survival pressure, locked attack tells, screen-space left-third bounds, three timed weapons, shared tilted muzzle position.
- `src/renderer.js`: tapered exhaust ribbon, stronger layered impacts, shot crescents, new atlas crops, boss/attack warning rendering and masked cloud illumination integration.
- `src/environment.js`: independently scrolling jungle/palm/cloud layers, periodic texture caches, foreground occlusion and emission mask.
- `src/main.js`: correct weapon names, boss names and retained backdrop clock.
- `src/audio.js`, `assets/audio/manifest.json`: original futuristic metal Lyria tracks and stronger synthesized SFX. Six new `*-v2.m4a` files and six `source/*-v2.mp4` sources; V1 manifest/music preserved.
- `assets/art/clouds-v2.png`, `canopy-v2.png`, `foliage-v2.png`, `palms-blender-v2.png`, `enemies-v2.png`, `bosses-v2.png`: new transparent environment/enemy assets.
- `assets/art/palms-v2.blend`, `tools/render_foliage.py`: original editable Blender palms and reproducible rendering.
- `tests/game.test.js`, `package.json`: meaningful gameplay regression coverage and syntax checks including the environment module.
- `README.md`, `docs/ENVIRONMENT_V2.md`, `REFERENCE_MOTION_V2.md`, `GAMEPLAY_V2.md`, `AUDIO_V2.md`, `AUDIO_V2_VERIFICATION.json`, `ART_V2_VERIFICATION.json`, this file: reference measurements, source prompts, research, current rules and verification. `ART_SOURCES.md`/`VERIFICATION.md` link the new records while preserving V1 history.

## Checks

| Method | Result |
|---|---|
| `npm run check` | All six runtime modules pass syntax checking. |
| `npm test` | 21/21 tests pass: HP/death freeze, score/storage-independent state, recovery, restart, tilted muzzle, projected bounds, timed weapons, all enemy/boss types, tells/gaps, mines and entity/speed ceilings. |
| Blender background Cycles render | Completed; 2048 × 1024 RGBA; editable `.blend` saved; interactive scene unchanged. |
| Six new art files | Decoded; real alpha; dimensions and SHA-256 recorded in `ART_V2_VERIFICATION.json`. |
| Connected Chrome, 1920 × 889 viewport | START enters gameplay; updated assets load; no app errors/warnings. Carrier state produces the actual HUD label `IRON CARRIER`. |
| In-app browser, 844 × 390 touch emulation | START → pause → RESUME works. Simulation time stays equal during a 250 ms pause check. Joystick and shot button remain inside the game viewport. |
| In-app browser, 390 × 844 | A controlled enemy-hit fixture exhausts HP through the real collision path; GAME OVER/score/best/RETRY remain inside the game frame. RETRY restores HP100, score0, entering mode. Existing best50 retained. |
| Cloud occlusion sweep | Eighty positions at altitude0.48 range from alpha0 to0.9653 at the ship. The most opaque position hides the ship, and a powered-shot event lights the same cloud surface cyan/mint. Before/after renders visually inspected. |
| Four boss render fixtures | Warden, carrier, leviathan and hive silhouettes are distinct and complete. The carrier's 180px safe corridor and locked targeting warnings are visible. |
| Audio | Six actual game music states decode/play/advance normally with crossfades; ending does not loop. 90 simultaneous SFX events peak0.636, with zero clipped/non-finite samples. Details in the audio V2 documents. |

QA used the provided CUA browser APIs and origin-scoped CDP for deterministic development fixtures. The separate Browser-skill plugin was absent; the installed CUA browser surface provided screenshots, DOM, input and console inspection. No extra browser package was installed. Browser fixtures, temporary canvas changes, touch emulation and viewport overrides were removed with resets/reloads. The user's pre-existing Chrome game tab was left intact; a separate Chrome tab was used for V2 QA.

## Motion/performance limits

The reference is 60fps. The visible nearby forest measures 0.70–0.93 screen widths/second in representative intervals; V2 uses approximately0.84 widths/second for the initial near canopy/palms and1.08 for closest leaves. Simulation and scrolling use elapsed seconds, not frames.

In this automated Chrome surface the final scene's frame median was about33.3ms, and a minimal alternating40px rectangle produced the same33.3ms median (p95 33.4ms). This is a roughly30Hz verification surface, not evidence of verified60fps gameplay. The cached renderer avoids repeatedly assembling whole cloud banks. A range of physical devices and high-refresh displays has not been benchmarked.

## Reference comparison ledger

| Reference feature | V2 result / deliberate limit |
|---|---|
| Fast oblique forest travel | Measured multi-layer speeds replace14/42/112px/s scrolling. Shared roughly5–15-degree negative roll and much stronger ship pitch. |
| Dense forest with close leaves | New dense canopy plus two distinct foliage sources, including Blender geometry. Near layers no longer repeat the distant blue horizon band. |
| Cloud deck crossing | Multiple back/front volume forms move vertically with altitude. True foreground alpha can nearly completely conceal the craft. |
| Gunfire visible inside cloud | A broad mint/cyan masked light pass brightens the cloud surface while the hull remains covered; hostile warnings remain readable. |
| Fine curved green exhaust | A continuously tapered ribbon and finer filaments replace the blunt constant-width trail. |
| Brilliant impacts | Brief white core, warm fire lobes, shockwave, debris, streaks and stronger sound; reduced-motion preference reduces exposure/impulse. |
| Sparse HUD and clean screens | Existing title/gameover layout retained; correct dynamic boss/weapon text. Desktop and two mobile orientations inspected. |

The original video, generated V1 images/music, score-storage keys and approved screen layout were preserved. New enemies/bosses and survival mechanics are original adaptations informed by the cited official game manuals and Valve pacing presentation. This remains a 2.5D recreation: original source models/animation and exact per-pixel motion are unavailable, and human playtesting is still needed to tune the stronger survival curve.

Visual QA captures are outside the repository at `C:/Users/USER/.codex/visualizations/2026/09/05/01a071d1-4502-7cf2-a744-7935fae38b3c/skywind-v2/` (low/high flight, cloud covered/lit comparison, four bosses, mobile pause and phone gameover). They include deterministic renderer fixtures and are not claims of a single uninterrupted playthrough.
