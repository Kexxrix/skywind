# SkyWind generated sprite sources

V2 adds new environment images, Blender foliage and enemy/boss atlases. See [ENVIRONMENT_V2.md](ENVIRONMENT_V2.md), [REFERENCE_MOTION_V2.md](REFERENCE_MOTION_V2.md) and [ART_V2_VERIFICATION.json](ART_V2_VERIFICATION.json). The entries below preserve the first generation's provenance.

The player and enemy assets below were generated for this project with the built-in `image_gen` tool using the `imagegen` skill. No third-party sprite files were downloaded. The video was used for visual analysis; `docs/visual-concept.png` was inspected for the shared art direction. The source video was not edited or used as final game artwork.

## Selected game assets

| Asset | Selected source | Validation |
| --- | --- | --- |
| `assets/art/player.png` | `[local generated-image source]/exec-52ed45d0-b809-4a87-a0cc-accb314192c6.png` | 1254 × 1254 RGBA; actual alpha range 0–255; 1,476,667 fully transparent pixels; right-facing isolated aircraft, no long exhaust, wide margins |
| `assets/art/enemies.png` | `[local generated-image source]/exec-12f9e724-9727-49ea-bffb-79fcfae3739b.png` | 1254 × 1254 RGBA; actual alpha range 0–255; 1,294,211 fully transparent pixels; four separate left-facing sprites in equal 627 × 627 quadrants |

Selected PNGs are byte-for-byte copies of their generated sources. Source outputs are preserved in the generator directory. No local crop, resize, recolor, alpha removal, or recompression was performed. Python/Pillow was used only for image metadata and alpha inspection, not to alter the images.

### Renderer geometry

Coordinates are `(left, top, right, bottom)` and use exclusive right/bottom bounds. Main silhouette bounds use alpha ≥ 128 to exclude faint antialiased fringes. These bounds are guidance for runtime positioning; the delivered files remain unchanged.

| Sprite | Fixed source rectangle | Main silhouette bounds, local to rectangle |
| --- | --- | --- |
| Player | `(0, 0, 1254, 1254)` | `(330, 455, 982, 786)` |
| Gold beetle | `(0, 0, 627, 627)` | `(121, 197, 516, 482)` |
| Red scorpion | `(627, 0, 1254, 627)` | `(64, 140, 525, 518)` |
| Ivory segmented worm | `(0, 627, 627, 1254)` | `(74, 219, 585, 356)` |
| Crescent boss | `(627, 627, 1254, 1254)` | `(52, 33, 582, 490)` |

The player art occupies about 52% of its canvas width, so displaying the entire square at the desired physical craft width would make the aircraft smaller than expected. The boss's upper margin is 33 pixels; it is tighter than the other sprites, but its main shape remains inside its quadrant with no neighbouring sprite overlap. The model did not reproduce every suggested percentage exactly; observed bounds are reported here rather than claimed as exact prompt compliance.

The mechanical boss is a prototype design extrapolation from the reference's metallic and organic enemy language. A distinct boss design was not established by the reference video. Other exact game statistics and effect durations are defined by the implementation, not by these sprite images.

## Final generation prompts

### Player — selected

> A production-ready PNG cutout of ONE futuristic fighter jet with transparent background. The aircraft is SMALL and centrally framed with abundant empty alpha on every side: it occupies only the middle TWO THIRDS of the total square canvas width. Keep at least 15% of canvas width fully empty on LEFT and RIGHT. Sharp narrow triangular black graphite and chrome silver aircraft with red nose panels and a red cockpit canopy, slender swept angular wings, small turquoise engine nozzle at the rear. Front nose points RIGHT and rear engine is LEFT. Neutral horizontal flight. Oblique side view, camera slightly above so upper wing and body surfaces show. Cinematic detailed realistic 3D rendering of metal, bright silver highlights from top left, strong clean readable silhouette. Small subject in the center of a much larger square TRANSPARENT canvas. Keep the complete aircraft inside the central region, no wing cropping. No scenery, no floor, no shadow, no color background, no painted checkerboard pattern, no text, no border, no second aircraft. No exhaust or projectile trails. Actual PNG RGBA transparency is essential.

### Enemies — selected

> Create ONE square production PNG game sprite sheet with TRUE TRANSPARENT BACKGROUND, alpha channel. A strict 2x2 arrangement of exactly FOUR SMALL isolated objects, no background and no drawn grid. Composition: each object is centered at the center of its own square quadrant and is SMALL enough to leave a broad fully transparent moat around it. Each object fills no more than 65% of its quadrant's width AND no more than 65% of its quadrant's height. This generous spacing is essential. All four objects front/head/nose point LEFT in horizontal neutral flight, viewed from a slightly elevated oblique side camera for a side-scrolling aerial shooter. Top-left quarter: a gold brass and black mechanical flying beetle, oval shell, pointed head LEFT, small legs/fins. Top-right quarter: a dark red bronze mechanical flying scorpion with head and front hooked claws pointing LEFT and curled tail on its right. Bottom-left quarter: a single long ivory brass mechanical flying worm with exactly five connected plated body segments, complete horizontal body from head LEFT to tail RIGHT, contains its entire tail, small within quadrant. Bottom-right quarter: a silver chrome and bronze armoured aerial boss craft, sharp nose LEFT, bright amber/red circular central core and two broad swept crescent wings, both wings entirely contained inside its own quadrant with generous space above and below. All four share richly detailed cinematic realistic 3D metal rendering, strong readable silhouettes, upper-left daylight highlights, dark underside shading, amber light accents. Keep objects small and well-spaced, no clipping, no touching quarter boundaries. Truly transparent PNG background: all space around the four isolated objects has alpha zero. No checkerboard pattern painted into pixels, no text, no UI, no letters, no border, no floor, no shadows, no exhaust, no landscape, no particles, no extra objects.

## Generation and selection history

All source filenames in this table are under `[local generated-image source]/`.

| Attempt | Source filename | Rule / prompt intent | Status |
| --- | --- | --- | --- |
| 1 | `exec-c1277850-cc82-4690-b91a-082245982d50.png` | One right-facing black/chrome/red fighter with small cyan nozzle; transparent square; approximately 70% width | Superseded: real RGBA, visually suitable, but craft filled about 93% of canvas width |
| 2 | `exec-2720a620-4f64-4104-b738-8030b98d220e.png` | Four left-facing metal enemies in equal quadrants: gold beetle, red scorpion, ivory five-segment worm, crescent boss; request at least 12% local margins | Superseded: real RGBA, four clear quadrants; boss upper margin only 9 pixels |
| 3 | `exec-c1028573-9ce5-4240-9896-3fbc442b5c4d.png` | Edit attempt 1: change framing only to central 70% width, retain exact craft and alpha | Rejected: returned RGB with a painted checkerboard; not transparent |
| 4 | `exec-222d469c-c9fb-4ab6-af44-6995ba6969b7.png` | Edit attempt 3: remove painted checkerboard, retain craft framing and design, output RGBA | Rejected: still RGB with a painted checkerboard |
| 5 | `exec-52ed45d0-b809-4a87-a0cc-accb314192c6.png` | New player generation using the final prompt above | Selected: true alpha, correct pose/design, wide margins |
| 6 | `exec-12f9e724-9727-49ea-bffb-79fcfae3739b.png` | New enemy generation using the final prompt above | Selected: true alpha, all four shapes complete and separated inside fixed quadrants |

Counts: 6 image-generation attempts; 6 tool calls returned images; 4 had genuine alpha; 2 failed transparency validation; 2 final assets selected; 2 earlier alpha candidates superseded; 0 skipped. The four unselected results are not referenced by game code.

Machine-readable selected alpha reports are `.work/reference/player-alpha-check.json` and `.work/reference/enemies-alpha-check.json`. Visual verification checked direction, appearance, object count, containment, transparency, and absence of long exhaust, text, UI, or scenery.

## Environment and concept sources

These assets were generated separately by the main implementation task with the built-in `image_gen` tool. Their selected generated outputs were copied into the project without image transformation. Current source files and project copies were checked directly; each pair has identical SHA-256 hashes.

All source filenames in this section are under `[local generated-image source]/`.

| Project asset | Generated source filename | Current verification | Status |
| --- | --- | --- | --- |
| `assets/art/cloud-bank.png` | `exec-5981b470-3b8e-4809-b16b-d1c5076ea2ba.png` | 1536 × 1024 RGBA; alpha 0–253; 570,769 fully transparent pixels; exact source copy | Selected environment layer |
| `assets/art/forest.png` | `exec-4eee6cc1-a217-40fa-9db9-e5e54628af01.png` | 1536 × 1024 RGBA; alpha 0–254; 663,848 fully transparent pixels; exact source copy | Selected environment layer |
| `docs/visual-concept.png` | `exec-f24271fb-ce1e-4852-8691-558a92172b4f.png` | 1536 × 1024 RGB; exact source copy; intended as a full-scene reference rather than a transparent layer | Selected visual concept |

Prompt-intent summaries below describe the supplied creative direction. They are summaries, not quoted copies of the full tool prompts:

- **Cloud bank:** an isolated cinematic billowing cumulus bank, silver-white highlights and blue-grey shadowed volumes, detailed rounded forms, true transparent surroundings, suitable for overlapping parallax layers.
- **Forest:** a dense green tropical forest canopy with distinct trees and foliage, deep perspective and directional daylight, transparent area above the treeline, suitable for multiple scrolling landscape layers.
- **Visual concept:** a cinematic diagonal aerial-shooter composition above tropical forest and massive cumulus clouds, deep blue sky, a small silver/black/red fighter with turquoise exhaust, gold insect-like enemies, cyan fire and glowing pickups, with a restrained top-centre HUD.

The cloud and forest images are runtime assets. The concept image guides art direction and is not drawn as the full game background. Their generation counts are separate from the six sprite attempts listed above.

Overall image pass: 9 attempts returned images; 5 final outputs selected (4 runtime assets and 1 concept), 2 rejected for failed transparency, 2 valid earlier candidates superseded, 0 skipped. Original images were preserved; terrain edge feathering takes place in an offscreen canvas at runtime without modifying the source PNG.
