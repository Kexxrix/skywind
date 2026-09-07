# SkyWind prototype verification

The latest revision is recorded in [V2_VERIFICATION.md](V2_VERIFICATION.md). The remainder of this document is the preserved first-prototype verification and contains its earlier balance and assets.

Verified on this Windows PC in connected Chrome and the Codex in-app browser, 2026-09-05/06 (KST). Local URL: http://127.0.0.1:5173/.

## Technical and interaction checks

| Check | Evidence / result |
| --- | --- |
| Syntax | `npm run check`: all five JavaScript modules pass. |
| Simulation | `npm test`: 12/12 pass, including entry, damage cooldown, HP cap, timed power expiry, scoring, escalating stages, repeated bosses, deterministic replay, restart, and worm hit geometry. |
| Chrome loading | Real Chrome tab loaded title, START entered the game, final fresh load had no console warnings or errors. |
| Loading failure recovery | On a separate test tab, blocked the main module request via developer protocol: explicit failure text and RETRY appeared. Removed the block, clicked RETRY, and title returned. The user's original stuck page was not reproducible on a fresh Chrome connection, so its exact original cause is unconfirmed. |
| Assets | Four production images loaded. Actual PNG alpha verified. Six Lyria tracks are local; M4A responses use `audio/mp4` and HTTP 200. |
| Real input | START click, Space, mouse drag with held fire, pause/resume and fullscreen on/off exercised. Drag moved the ship, fired, and increased score. Touch emulation exposed SHOT; tapping it started the game from the title. |
| Health / power | Controlled game-state fixture placed pickups at the ship: HP 50→80; power timer 13.975 seconds after collection; AUTOCANNON ×5 and powerup music selected. |
| Clouds / drones / boss | Rendered low-altitude, above-cloud, 5-shot power, 2-drone and boss states. First boss spawn also checked at time 48 seconds. |
| Game over | Actual collision fixture reduced HP 1→0. GAME OVER appeared; score 12345 saved and reappeared after reload. Scene time remained exactly 41.65323333333308 over the observation interval. Test score was restored to the prior storage value afterwards. |
| Pause and resizing | Simulation time remained 48.70319999999987 during resize; the paused backdrop stayed drawn. |
| Music | All six states played with increasing media currentTime; fades, ending non-looping and pause verified. See AUDIO_BROWSER_QA.md. |
| Performance sample | 90 animation frames in 1490.8 ms, approximately 60 fps, during one desktop browser sample. This is not a hardware-wide guarantee. |

Viewport checks: actual Chrome viewport approximately 1920×994; in-app 1280×720 and concept-native 1536×1024 (1536×864 game with letterboxing); tablet 1024×768; phone landscape 844×390 and portrait 390×844. In portrait the final result panel is 156 px tall within the 219.375 px game area, with all controls contained. Touch was emulated; a physical iPad was not tested.

Raw CDP viewport emulation produced a duplicated compositor strip in two intermediate in-app screenshots. Those screenshots were rejected; final desktop captures use the browser's documented viewport capability. Temporary viewport, touch, network-failure and fullscreen settings were reset. Test-only game state was removed by reloading to title. The three in-app startup errors logged during deliberate request blocking are expected; Chrome's final console is clean.

## Visual comparison

The primary reference is the upper 720×498 region of SampleGame.mp4; the physical iPad image was excluded. The generated concept is [visual-concept.png](visual-concept.png). Both the concept and final browser captures were inspected with `view_image`, including at the concept's native viewport size.

| Comparison point | Implementation and review |
| --- | --- |
| Composition | Full-bleed playfield, small aircraft on the left, enemies approach from the right. Widescreen 16:9 adaptation is deliberate. No marketing wrapper or card UI. |
| Depth / altitude | Distant canopy, main forest, nearer trees, distant and nearer cloud banks move at different rates. Ground drops away and clouds pass below during ascent. |
| Camera / flight | Diagonally rising world, continuously varying roll, banking ship and curved green/cyan trail. Smoothed the trail after initial angular segments. |
| Palette | Deep blue flight corridor, green rainforest, white and blue-grey clouds, gold and red enemies. Preserved cooler shadows. |
| Light | Additive cyan shots, pink hostile projectiles, engine halo, pickup glow, sparks and explosions. Replaced hard-edged light stripes with soft atmospheric beams. |
| Terrain edges | Initial repeat seam was visible. Runtime feathering now blends overlapping terrain layers; original PNGs remain untouched. |
| UI / typography | Tiny centered ENERGY bar, six-digit score, temporary chain/weapon text. Title is SKYWIND + START + BEST; game over is clean text, score and retry/title. Removed stale in-game notices from game over. |
| Responsive | Repaired title overlay blocking SHOT and portrait result clipping. Paused canvas survives resize. |

Above-the-fold text audit: SKYWIND, START, BEST and concise controls on title; ENERGY, score, chain and active weapon on playfield. Required added state labels include WARDEN and short pickup/sector notices. No unrelated navigation or promotional copy.

The reference's main visual signatures were compared and implemented, but this is not a pixel-identical copy. Generated sprites and layered 2.5D Canvas rendering replace the video's original 3D meshes, materials, exact lighting, camera paths and terrain. The concept is a direction reference rather than a captured frame to reproduce literally. Original 3D source assets were not supplied. Boss design, numerical balance and endless scheduling are prototype decisions where the video does not establish the exact rules. Visible effects, HUD and pickup symbols are drawn in code so they can respond in real time; major environment/vehicle/enemy art comes from generated bitmap assets.

## Final visual evidence

- [Title, 1280×720](screenshots/title-verified.png)
- [Gameplay, 1536×1024 viewport](screenshots/gameplay-verified.png)
- [Mobile pause after resize](screenshots/mobile-paused.png)
- [Portrait game over](screenshots/phone-gameover-final.png)

Source footage, generated source images and Lyria source videos are preserved. No Git repository, commit, dependency installation, public deployment or system configuration change was created.
