# SkyWind reference motion and additional sprite evidence

Second inspection of the unchanged `SampleGame.mp4`. Only the upper **720 × 498** game region was sampled; the lower filmed iPad view remains excluded. These are observations from the reference, not claims that the implementation already matches it.

## Screen-space motion measurements

`ffmpeg` decoded eight 0.8-second intervals at 30 fps without rescaling. Adjacent frames were compared with NumPy windowed phase correlation on 128 × 128 local tiles. Five horizontal tile centres were sampled at several vertical positions in each interval. Low-contrast tiles, weak correlation peaks and gross displacement outliers were excluded. A synthetic known translation of **−7 px horizontally, +3 px vertically** verified displacement sign and scale before measurement.

The method measures motion visible on screen, including camera pan, climb/dive, perspective and parallax. It is not a measurement of world speed or a direct extraction of engine parameters. Patches crossing sky, cloud, foliage, bullets or different depth layers produce a range of speeds; the interquartile range is retained below. “Magnitude” is the median of individual tile-vector magnitudes, so it need not equal the magnitude of the separately median-filtered x/y components. Width-normalized speed is magnitude divided by the original **720-pixel view width**.

| Reference interval | Sampled layer/region | Median x / y px/s | Median magnitude px/s | Middle 50% px/s | View widths/s | Accepted tile pairs |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 0.20–1.00 s | Close canopy during upward camera transition | +58 / +446 | 448 | 361–505 | 0.622 | 143 |
| 5.10–5.90 s | Cloud tops below craft | −116 / −24 | 125 | 65–352 | 0.174 | 175 |
| 53.30–54.10 s | Middle-distance forest region, mixed depth | −242 / +38 | 274 | 116–449 | 0.381 | 175 |
| 53.30–54.10 s | Close forest/canopy | **−501 / +82** | **506** | 395–607 | **0.703** | 223 |
| 89.20–90.00 s | Cloud-bank turn | −35 / −73 | 161 | 114–226 | 0.224 | 310 |
| 139.20–140.00 s | Middle-distance forest region, mixed depth | −248 / +91 | 384 | 121–600 | 0.534 | 151 |
| 139.20–140.00 s | Close forest/canopy | **−635 / +161** | **670** | 504–799 | **0.930** | 180 |
| 170.20–171.00 s | Bright clouds during dive and flash | −122 / −116 | 247 | 159–306 | 0.343 | 78 |
| 191.20–192.00 s | Close canopy during camera climb | −330 / +361 | 512 | 437–599 | 0.712 | 182 |

An additional 18.20–19.00 s region contained low-detail haze and mixed sky/ground, producing conflicting near-zero and fast estimates. It remains in the raw JSON but is not used as a cloud-speed target. The 170.20 s estimate also has lower confidence because intense lighting changes the image during the measurement.

The clearest low-altitude intervals put the fast canopy around **0.7–0.93 view widths/second**: approximately **900–1,190 logical pixels/second in a 1280-wide game view**. Distant and intermediate layers should remain much slower. Reusing one near-identical speed for every layer loses the reference's depth, while a foreground speed near 100 px/s in a 1280-wide view loses much of its apparent acceleration.

Evidence and reproduction:

- `.work/motion-v2/analyze_motion.py` — measurement script; requires the existing Python runtime, NumPy, Pillow and ffmpeg.
- `.work/motion-v2/measurements.json` — all accepted counts, intervals, regions, confidence peaks and speed distributions.
- `.work/motion-v2/*-start.png` and `*-end.png` — unscaled source crops for each interval.

## Diagonal composition and camera movement

Low-altitude terrain moves left and down, rather than strictly left: the stable sampled close-canopy vectors at 53.3 s and 139.2 s have slopes corresponding to roughly **9° and 14°** from horizontal. Camera movement also contributes, so those vector angles are not an isolated measurement of camera roll.

In `canopy-fire-start.png` at 139.2 s, a robust line fit to bright cyan streak pixels spanning x=220–642 gives a screen slope of approximately **−0.304**, or **−16.9°** (screen y increases downward). The scene visibly uses multiple changing diagonals; this is one measured firing/streak direction, not a fixed angle throughout the video.

The first second and the 191 s interval include hundreds of pixels per second of vertical environmental travel. High-altitude changes therefore require a substantial camera/environment transition; moving the craft up while leaving the cloud and ground layout almost unchanged misses the motion in the reference.

## Cloud occlusion and firing-light timeline

The following observations use 0.5-second samples for the first sequence and 0.25-second samples for the other two. Event boundaries therefore have that sampling uncertainty. The video does not establish the original shader or light implementation.

| Time | Visible evidence | Implication for the prototype |
| --- | --- | --- |
| 32.00 s | Craft and green trail are clearly visible while climbing toward a large cloud mass. | Establish a clear pre-occlusion silhouette. |
| 32.50 s | The craft is obscured inside the cloud; a broad mint-green patch and firing traces remain visible through it. | The cloud can hide the solid craft while still showing diffused emitted light. |
| 33.00–33.50 s | Cloud forms occupy most of the view; the craft is almost completely hidden. | Foreground clouds need genuinely strong occlusion, not only a faint full-screen haze. |
| 34.00 s | Only a small faint green trail fragment is visible within the cloud. | Occlusion persists as the camera travels through the cloud. |
| 34.50 s | The craft becomes clearly visible above the cloud edge again. | The strong hiding phase spans roughly 1.5–2 seconds in these samples, with gradual entry/exit. |
| 35.50–37.50 s | Pink enemy-fire glow and mint player-fire glow tint cloud areas; a large bright cyan double-lobed projectile appears at 36.50 s. | Cloud lighting follows combat activity and projectile travel, with local coloured regions. |
| 106.00–106.75 s | Fine cyan crescents repeatedly curl around the front/top/bottom of the craft. | A visible gathering/attack phase precedes the larger release in this sequence. |
| 107.00–107.50 s | A very large bright cyan twin-lobed/curved shot crosses ahead of the craft; cloud regions turn intense mint and near-white, with fragments and explosions nearby. | The empowered shot changes shape, size and lighting response, beyond simply adding ordinary bullet rows. |
| 107.75–108.00 s | The large flash recedes into green haze; smaller regular cyan shots remain. | Strong release lighting is brief and fades, rather than remaining a constant bright overlay. |
| 108.25–109.75 s | Repeated white/yellow impact flashes and expanding arcs accompany enemy destruction. | Impact light has sharp peaks, debris and a quick falloff. |
| 169.50–170.25 s | A large cyan release moves across the lower cloud layer during a dive; lower/right clouds brighten to mint and white while pink spots appear independently. | The bright region travels through environmental depth, distinct from a glow fixed on the player. |
| 171.00–172.25 s | Another bright cyan release and nearby impacts light successive foreground cloud lobes almost white; the player remains much darker than the illuminated cloud. | Preserve both the dark craft silhouette and strong cloud-surface contrast. |

Contact sheets: `.work/motion-v2/occlusion-contact.jpg`, `firing-light-contact.jpg`, `cloud-flash-contact.jpg`. Every cell is labelled with its source timestamp; corresponding full-size PNG crops are alongside them.

## Additional enemy and boss atlas contract

Existing assets were preserved. Two new PNGs were generated with the built-in `image_gen` tool, visually inspected, checked for genuine alpha and copied without local resizing, cropping, recolouring or alpha manipulation. Their game key contract was sent to both renderer and simulation owners before integration.

| File | Actual size | Grid | Alpha | Fully transparent pixels |
| --- | --- | --- | --- | ---: |
| `assets/art/enemies-v2.png` | 1536 × 1024 | 3 columns × 2 rows; 512 × 512 cells | RGBA, 0–254 | 1,433,145 |
| `assets/art/bosses-v2.png` | 2172 × 724 | 3 columns × 1 row; 724 × 724 cells | RGBA, 0–255 | 1,039,229 |

`source rectangle` below is **x, y, width, height**. Local silhouette bounds are **left, top, right, bottom**, with exclusive right/bottom coordinates, measured at alpha ≥ 128. Every cell has **zero alpha ≥ 128 pixels on its outer border**, so the main silhouettes do not touch neighbouring cells. Very faint antialiased fringes can extend beyond the listed silhouette bounds.

| Game key | Source rectangle | Local silhouette bounds | Cell area at alpha ≥ 128 |
| --- | --- | --- | ---: |
| `wasp` | 0, 0, 512, 512 | 154, 156, 398, 308 | 3.50% |
| `mantis` | 512, 0, 512, 512 | 117, 154, 388, 361 | 6.19% |
| `ray` | 1024, 0, 512, 512 | 101, 141, 403, 364 | 6.95% |
| `dragonfly` | 0, 512, 512, 512 | 147, 115, 401, 381 | 5.76% |
| `orb` | 512, 512, 512, 512 | 176, 143, 340, 321 | 7.84% |
| `needle` | 1024, 512, 512, 512 | 77, 161, 390, 302 | 4.30% |
| `carrier` | 0, 0, 724, 724 | 16, 101, 700, 557 | 31.56% |
| `leviathan` | 724, 0, 724, 724 | 11, 213, 712, 478 | 12.25% |
| `hive` | 1448, 0, 724, 724 | 36, 16, 709, 683 | 41.36% |

All heads/noses face left. The six regular enemies have deliberately generous canvas spacing; drawing the entire square at a desired physical enemy width would make them too small. Use the silhouette bounds plus a modest antialias padding when normalizing their rendered size. Collision geometry must follow the final render crop/scale, especially for the narrow needle, broad ray and curved leviathan. The suggested framing percentages in prompts were approximate: boss margins are tighter than requested, but the actual main silhouettes are complete and separated, as verified above.

Machine-readable evidence: `.work/motion-v2/sprites-v2-validation.json` includes source paths, dimensions, alpha ranges, border checks, per-type bounds and selected-file SHA-256 hashes.

## Generation provenance

All three outputs below remain under `C:\Users\USER\.codex\generated_images\01a071e0-0ef6-7451-9388-c9d8c98235b3\`.

| Attempt | Source output | Result |
| --- | --- | --- |
| Additional enemy draft | `exec-e2980f04-82d8-4a90-8f11-8aee68d7f908.png` | Six distinct shapes and true alpha, but a few alpha ≥ 128 pixels touched internal cell boundaries. Rejected for atlas spacing; not used by game code. |
| Three-boss atlas | `exec-14269935-28fd-4441-818b-9b836f603194.png` | Selected as `bosses-v2.png`; true alpha, three complete distinct shapes, no cell-border contact. |
| Additional enemy spaced atlas | `exec-2a6d86c3-8630-4d6e-9524-07fdcec79050.png` | Selected as `enemies-v2.png`; true alpha, six complete shapes with broad gutters, no cell-border contact. |

Three generation attempts returned images: two selected, one rejected, zero skipped. No existing source or selected asset was overwritten. These additional forms extend the reference's metallic insect/organic silhouette language; they are newly generated designs rather than identified exact enemy models from the source game.

### Selected enemy prompt

> A PNG sprite sheet on a TRUE TRANSPARENT BACKGROUND. Landscape 3:2 aspect ratio. EXACTLY 6 SMALL mechanical flying enemies in a perfectly regular 3 columns by 2 rows grid of equal square cells. Put each sprite at the exact centre of its cell and make it occupy only the INNER HALF of its cell. Large empty transparent gutters between every sprite. The objects must be SMALL, not fill the canvas. All complete silhouettes contained comfortably inside each cell, no cell-edge contact. All face LEFT in oblique side view slightly seen from above. Rich cinematic realistic 3D rendering, metal with dark graphite, polished gold/bronze, ivory enamel and amber reactor lights, fine detail and clear distinct silhouettes. Top-left WASP: thin golden striped abdomen, black waist, pointed left head and two long swept fins. Top-middle MANTIS: bronze rust armoured mantis with tall jagged silhouette and two long folded hooked foreclaws reaching LEFT. Top-right RAY: wide dark-silver manta fighter with broad smooth crescent wings, short left-pointed head, slender tail RIGHT. Bottom-left DRAGONFLY: gold mechanical dragonfly with four narrow filigree metal wings in X layout, thin long abdomen, head LEFT. Bottom-middle ORB: round bronze sentry with large glowing eye facing LEFT and six short heavy protective plates around the sphere. Bottom-right NEEDLE: long narrow ivory-black spear interceptor, very sharp nose LEFT and small twin stabilizer fins at rear RIGHT. One complete isolated sprite per cell, tiny relative to the cell, wide transparent margins all around. Empty areas must have alpha ZERO, actual transparent RGBA PNG. No visible background, no colored glow backdrop, no checkerboard pattern, no text, no grid lines, no labels, no ground shadow, no exhaust, no smoke, no weapons firing, no particles, no more than six objects.

### Selected boss prompt

> Create a WIDE 3:1 transparent PNG sprite atlas, requested size 1536x512, of EXACTLY THREE completely isolated cinematic 3D science-fiction aerial bosses for SkyWind. One horizontal row of three equally sized SQUARE cells; 3 columns, 1 row. The three bosses are SMALL in their cells, with a full 15% transparent margin on every side of each square cell. Every complete object stays comfortably away from ALL cell boundaries. All heads/noses point LEFT. Oblique elevated side camera for a side-scrolling shooter. True transparent alpha background; no scenery, no colored backdrop, no gradients, no floor, no shadows, no smoke, no particles, no separate little ships, no text, no labels, no grid. Consistent richly detailed chrome, ivory enamel, tarnished bronze/gold, dark graphite, amber-red luminous machinery, realistic daylight shading and silver edge highlights. LEFT CELL: CARRIER, a colossal broad heavily armoured twin-deck sky fortress, left-facing blunt pointed prow, four short broad swept wings, an angular solid rectangular central hull with stacked metal terraces and integrated turret details, bright red central reactor; dense imposing squat fortress silhouette, entirely one connected ship. MIDDLE CELL: LEVIATHAN, a long sleek ivory-and-brass segmented mechanical sky serpent, a fierce broad armoured head at LEFT and eight connected plated segments tapering to a forked tail at RIGHT, whole horizontal body curling in a shallow S inside the middle cell, distinct long narrow silhouette, no disconnected pieces. RIGHT CELL: HIVE, a huge rounded dark bronze biomechanical queen/carrier, spherical layered honeycomb armoured centre with a glowing amber eye facing LEFT, six broad claw-like radial armoured petals forming a dramatic sunburst silhouette, big curved mandibles on the left; symmetrical mass with intricate red-hot cavities, entirely one connected enemy. All three shapes strikingly DIFFERENT, complete, clearly separated, individually centered with lots of truly transparent empty space. Polished high-quality production game sprites. Transparent-background PNG cutouts, actual alpha zero around all objects, no checkerboard painted into the image.
