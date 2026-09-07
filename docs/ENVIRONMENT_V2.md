# SkyWind environment and impact revision

The upper game view in `SampleGame.mp4` remains the visual target. Source video and all V1 generated assets are preserved. Quantitative motion and reference timestamps are recorded in [REFERENCE_MOTION_V2.md](REFERENCE_MOTION_V2.md).

## Motion and depth

The former foreground moved at 112 logical pixels/second. At the opening speed, the revised world uses 110, 350, 670, 1080 and 1380 px/s for the horizon, distant canopy, closer foliage, palms and closest leaves. Reference measurements of nearby forest correspond to roughly 900–1190 px/s at the 1280-pixel game width. The closest leaves are intentionally faster than the measured median canopy. The world accelerates continuously as survival difficulty rises; offsets integrate velocity rather than multiplying elapsed time by a changing speed.

Cloud layers use 135, 170, 215, 320, 510 and 760 px/s. Independent periodic banks contain four varied volume silhouettes, different scale, offset and spacing. Cached cloud strips reduce repeated alpha composition. Forest texture edges use complementary premultiplied alpha weights before wrapping, avoiding a dark seam where two faded edges overlap. Separate close foliage has no blue distant-horizon band.

The common `cameraRoll(game)` controls both rendering and projected player bounds. The ship can pitch approximately 66 degrees while its nose remains inside the left third. The continuous tapered exhaust preserves its recent flight path and advects backward with the airflow.

## Occlusion and light

Cloud layers render on both sides of the craft. Near the middle cloud deck, dense foreground cloud cores cover the player and enemies. As altitude increases, those banks move below the corridor. Gaps in the banks reveal the craft again.

A separate cloud alpha mask clips cyan/mint firing light, moving projectile light, pink hostile light and orange explosions to the foreground volume. The clouds retain their surface shading while brightening. Foreground shading and masked emission are distinct passes; the ship is not merely faded out. Attack warnings remain visible through cloud cover, and the carrier's 180-pixel safe lane is indicated before its wall fires.

Impacts combine a short white core, independent fire lobes, flying fragments, an expanding elliptical shockwave and a horizontal flare. Brief exposure and camera impulse are reduced when the operating system requests reduced motion. Sharp gunfire and layered explosions are described in [AUDIO_V2.md](AUDIO_V2.md).

## Original assets

| New file | Source and role |
|---|---|
| `assets/art/clouds-v2.png` | Built-in Image Gen; four detailed cumulus forms. Each runtime atlas cell receives a soft perimeter mask; no source PNG is edited. |
| `assets/art/canopy-v2.png` | Built-in Image Gen; dense nearly level jungle canopy, used for the distant forest field. |
| `assets/art/foliage-v2.png` | Built-in Image Gen; close glossy palms and broad leaves without a foggy horizon. |
| `assets/art/palms-blender-v2.png` | Blender Cycles render of 21 original palms, each with 15 modeled fronds and folded individual leaflets. |
| `assets/art/palms-v2.blend` | Editable source geometry, materials, sun, camera and render settings. |
| `tools/render_foliage.py` | Reproducible modeling and transparent-render script. |

The Blender command used the installed Blender 5.2.1 LTS in a separate background process with `--factory-startup`; the open interactive scene was not changed. It rendered 2048 × 1024 RGBA with Cycles, 32 samples and denoising. Re-render explicitly with:

```powershell
& 'C:/Program Files (x86)/Steam/steamapps/common/Blender/blender.exe' --background --factory-startup --python tools/render_foliage.py
```

All runtime image paths are local. No new npm dependency, remote image fetch or 3D engine is needed to play. Blender is only needed to regenerate the palm asset. This remains a 2.5D recreation with original assets, not the reference game's original models or an exact pixel match.

Three environment Image Gen calls returned three selected images; zero failures, zero rejected, zero skipped. One Blender modeling/render run succeeded. The cloud atlas's soft edge handling is a runtime composition choice. Enemy/boss generation counts and full prompts are separate in [REFERENCE_MOTION_V2.md](REFERENCE_MOTION_V2.md).

## Image Gen prompt provenance

All source images remain under `C:/Users/USER/.codex/generated_images/01a071d1-4502-7cf2-a744-7935fae38b3c/`:

- `exec-c32e9e01-6b5b-4e4e-b519-2370a2834117.png` → `clouds-v2.png`
- `exec-65a265b6-94e2-4c63-9e40-80304d2b198f.png` → `canopy-v2.png`
- `exec-f04180b8-23ad-4bc2-8b3a-cdd5e179910c.png` → `foliage-v2.png`

Full prompts follow.

### foliage

Original game foreground parallax asset. Genuinely transparent background. Wide landscape 2048x1024. A continuous dense hedge-like bank of tropical TREETOPS, dense luxurious palm fronds and enormous glossy broad banana/philodendron leaves, no trunks visible, no empty holes in lower half. An irregular beautifully detailed leaf silhouette across the upper edge at about 30% down from top. Leaves and branches overlap in complex natural layers, extending all the way to left and right and bottom edges. Close camera low above jungle canopy, camera sees mostly top of leaves. Highly detailed photorealistic 3D rendered leaves with physical veins and folds, natural variation, not rows of identical palm fans. Dark forest green in shadow, vivid yellow-green highlights on sunlit glossy leaf surfaces. Sunlight from upper right. NO fog, NO blue or grey haze, NO distant horizon, NO sky, NO clouds, NO mountains, NO text, NO planes. Pure isolated foreground vegetation on alpha, sized for fast-scrolling foreground of a cinematic aerial shooter. Left/right density and upper contour height should match seamlessly. Not a complete landscape photograph; only richly modeled foreground foliage.

### canopy

Game production environmental parallax asset. A very wide seamless tropical rainforest canopy ribbon, 3D cinematic rendering quality, 2048x1024 landscape. Genuinely transparent sky/background in upper 35 percent, rich dense jungle in lower 65 percent that extends beyond left, right and bottom boundaries. Nearly LEVEL CONTINUOUS canopy top across left and right edges, NO mountain peaks and NO large tree landmarks. Camera flying just over the treetops looking forward and slightly down. Deep saturated olive/emerald leaves, many hundreds of distinctly layered palm crowns, glossy broad-leaf trees, tiny branching details, deep blue teal shadows and crisp gold-green highlights from sun upper right. Near foreground foliage larger and detailed. Horizon softly fades through airy bluish depth. Natural realistic dense fine vegetation like a cinematic flythrough, not pixel art, not vector. The left and right edges match in height, color and lighting to tile in a horizontal scrolling game. No sky painted behind canopy, no text, no aircraft, no ground rocks, no empty path. Large-scale contour nearly flat, many fine-scale tree shapes.

### clouds

Use case: stylized-concept. Game production asset: a 2 by 2 sprite atlas of FOUR DISTINCT isolated volumetric cumulus clouds on a genuinely transparent background. Each cloud occupies its own cell with clear transparent gutter, never overlaps another cell. No text, no border, no checkerboard. Reference mood: rich three-dimensional Japanese cinematic aerial side-scrolling shooter; bright white sunlit towers and deep blue-grey underside, finely turbulent fractal billows. Top left a very wide horizontal low stratocumulus shelf, top right a rounded towering cumulus cauliflower mass, bottom left a sweeping curling dark cloud underside tunnel, bottom right a wispy broken bright near-camera mist bank. Each is a complete floating mass with irregular soft naturally dissipating edges on ALL sides, no straight crop or flat base. Camera near cloud altitude viewing slightly down, light from upper right. Natural detailed film VFX volume render, dense cores that occlude a spaceship behind them, varied fine curls and large smooth lobes. Not cartoon cotton balls, not uniform circles, not a painted sky background. Deliver 2048x2048 transparent RGBA atlas. No planes, landscape, UI or effects.
