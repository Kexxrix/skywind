# SkyWind V3 — 3D environment and altitude revision

2026-09-06. The V2 sliding background pictures have been replaced in the running game by a WebGL 2 forest and a raymarched three-dimensional cloud field. The existing Canvas gameplay sprites, UI, scoring, enemies, bosses and music remain connected to the same game loop.

## Changed files

- `src/volume-environment.js`: camera projection, instanced terrain integration, cloud volume generation, sunlight cache, front/back cloud integration, local firing/explosion light, depth compositing and short terrain motion blur.
- `src/terrain3d.js`: 8,572 trees and palms across near, middle and distant geometry, curved leaves, branching crowns, fog, leaf material and directional lighting. The scene has 2,195,944 instanced triangles and 12 terrain draw calls.
- `src/renderer.js`: load the new leaf surface, create the 3D environment, pass active light events into the background, retain the existing gameplay and effects.
- `assets/art/leaf-surface-v3.png` and `.source.json`: generated leaf surface and original prompt/path/hash provenance. The original generated file is preserved.
- `src/game.js`, `tests/game.test.js`: screen-height-based altitude control, weaker automatic route bias at the center, full endpoints, smooth entry altitude and related regressions. Projectile culling now uses projected viewport coordinates: previously, normal shots at the upper screen edge could be deleted immediately because their world-space Y was below -100 despite being visible on screen.
- `src/audio.js`, `assets/audio/sfx-v3/`: twenty sample-based combat sounds, source files/licenses and the existing AudioDirector API. See `SFX_V3.md` for detailed source and signal checks.
- `package.json`, `README.md` and V3 verification/reference documents: execution checks and current implementation documentation.

## Height and composition

The camera spans world heights **28–218**. The volume allocation covers **58–116**, but density varies within that range and fades at the boundary. Strong craft occlusion occurs in a smaller central part of the range. The lowest corridor fades overhead cloud visibility to reveal the forest; the highest camera also tilts up to open the blue sky and leave cloud tops at the bottom of the image. These are authored prototype settings, not measurements of the original engine.

Keyboard and pointer movement use the ship's **projected screen Y**, so the visible top/bottom edges map to target altitude **1/0**. Automatic route variation is approximately ±0.15 at the center and vanishes at the endpoints. The camera follows at exponential rate 1.1. The model test reaches above 0.989 or below 0.009 after 4.5 seconds across different route phases. An actual START/input-handler/game-loop browser check reached altitude **0.99276**, target **1**, with the ship at screen Y **48** after 5.2 seconds of upward input. Downward input also reached target **0** and the lowest corridor.

The reference's absolute high-altitude target is the 150-second upper-game crop, distinct from the lower cloud-top views around 90 seconds. See `REFERENCE_V3.md`. The source video's lower physical iPad display is excluded from analysis and is never used as a game asset.

## Geometry, cloud and light checks

The cloud shader integrates density along each view ray. A shared camera matrix reconstructs terrain depth and intersects the gameplay plane. Cloud behind the ship is drawn first; near cloud attenuates ship/trail/projectile pixels afterward. Firing and explosion events are projected into this same three-dimensional volume and add local colored light. Front-cloud extinction is deliberately lower than background extinction to retain faint silhouette and firing cues during dense crossings.

The cached volume is 256 × 64 × 256 RGBA voxels over a periodic 512-unit horizontal region. Density and static sunlight are prepared once on the GPU. Runtime marching uses up to 96 samples and early transmittance termination, with local lights evaluated during integration. This avoids calculating multiple sun-shadow rays at every runtime sample. Four-sample terrain antialiasing is resolved into color/depth textures. Camera overscan is 180 pixels around the 1280 × 720 gameplay viewport, covering the game's roll and shake range.

Generated foliage surface colors, veins, derivative-based small normal changes, transmission and gloss were checked after actual browser loading. The image is decoded before creating the renderer. No external npm rendering library or build step was added.

## Motion measurement

`MOTION_V3.json` records a controlled 0.8-second sequence of 17 rendered low-altitude frames at 0.05-second simulation intervals. The scene contains background only; it does not certify uninterrupted real-time frame rate.

The validated local feature tracks give near foliage **1.413 viewport widths/s** and middle foliage **1.031 widths/s** at the initial environment speed. The same tracking method gives reference near foliage **0.708 / 0.845 widths/s** in two sampled segments. This version is therefore faster than those reference segments; it is not reported as an exact speed match. Perspective, feature depth and movement direction change the visible local speed. The existing difficulty multiplier continues to increase travel speed with survival time.

## Technical and performance checks

- `npm run check`: JavaScript syntax checks, including both new WebGL modules.
- `npm test`: all **26** game-rule, altitude and projectile-boundary regressions passed.
- Actual Chrome load: loading overlay dismissed, `VolumeEnvironment` active, leaf image decoded, WebGL error **0** and four-sample terrain target complete.
- `V3_GPU_VERIFICATION.json`: six GPU timer samples at each of four altitudes, with firing/explosion/enemy-shot/hit events. Tested WebGL target **1640 × 1080**, visible canvas **1666 × 937**. GPU-only medians were **5.73 / 5.53 / 2.44 / 1.65 ms** at altitudes 0 / 0.3 / 0.5 / 1. Disjoint samples are excluded by the measurement code; none occurred in the reported samples.
- These GPU timings exclude overall browser scheduling, UI/audio work, display synchronization and recording overhead. They do not establish a universal 60 FPS result. Earlier browser automation surfaces scheduled many runs around 30 Hz, including trivial rendering fixtures.
- Effect-sample decode **20/20**; dense combat mixed with the retained BGM had peak **0.808** and no clipping. The SFX agent checked pause, mute, voice cleanup and storage preservation. See `SFX_V3.md` for scope and the fact that direct listening was unavailable through the tools.

## Integrated play recording and preserved loop

`V3_PLAY_VERIFICATION.json` records an actual START click followed by timed key events through the normal input handler and game loop: descend while firing, ascend while firing, then stop and pause. Altitude reached **0.0130** after the downward section and **0.9930** after the upward section. There were **13 active player shots** at the upper edge, confirming the projectile-culling correction in the browser. Effect samples were ready and WebGL error remained zero.

The canvas was recorded to `flight-verification.webm` in the task's `skywind-v3` visualization directory. Extracted playback frames were inspected for low forest, cloud overlap/local light and the wide blue high-altitude opening. This is a **muted visual QA recording with temporary player invulnerability** to keep the flight sequence uninterrupted. That temporary fixture was not written into the game source and was cleared by reload. The recording's rAF interval median was 33.3 ms and p95 was 50 ms; recording/display scheduling differs from the GPU-only timing above.

A separate fatal-hit fixture produced the actual GAME OVER UI and a frozen canvas whose pixel checksum stayed unchanged across 350 ms. RETRY returned to entering mode with 100 HP, zero score and the renderer unfrozen. The Chrome best score (`84230`) and muted storage (`null`) were unchanged before/after these checks. Test inputs and overrides were cleared, and the QA tab was returned to the title screen.

The user's existing in-app localhost tab was at the title screen before refresh. It was refreshed to V3 and independently reported `VolumeEnvironment`, loading complete, WebGL error zero and no console error/warning. Its separate best score remained `50`.

## Preserved data and practical limits

`SampleGame.mp4`, all V1/V2 artwork, the Blender source/render, the six V2 Lyria tracks and their manifest are preserved. The old `src/environment.js` is retained as source history and is no longer imported by the current renderer. No Git repository, commit, dependency migration or public deployment was created.

The original scene's models, textures, animation and renderer are unavailable. V3 has its own authored geometry, leaf material and procedural cloud forms, so visible shape/material differences from the source remain. The cloud field repeats in world space; the small browser prototype is not a reproduction of an unrestricted weather simulation. Runtime requires a browser with WebGL 2 and hardware acceleration. This PC's Chrome path was tested; physical mobile devices and other GPUs were not certified.
