# SkyWind reference analysis

Source: `SampleGame.mp4`, inspected locally with ffprobe, ffmpeg frame extraction, and visual review. The original file was not modified.

- Duration: 209.91 seconds.
- Source video: 720 × 960, 60 fps, with audio.
- Reference game region: top 720 × 498 pixels. The black divider and lower filmed iPad view are excluded.
- The tiny operating-system status bar and the upper-left close control are recording/application chrome, not proposed SkyWind game UI.
- Extracted source crops and labelled contact sheets are in `.work/reference/`.

## Visual identity

The reference is a richly lit, three-dimensional-looking side-view aerial shooter. A small, sharply pointed metallic craft flies over dense tropical forest and through enormous banks of white cumulus clouds. Dark navy/teal air creates contrast with white-blue projectiles, the craft's vivid green/turquoise exhaust, and pink enemy fire. Objects are shaded with directional light, rather than rendered as flat icons.

The reference has three overlapping depth regimes:

1. **Near the canopy:** an apparently distant dark tree carpet, a middle layer of distinct green tree crowns, and a fast, close layer of large palms and broad leaves. Foreground leaves can occupy a substantial part of the lower edge. The world reads as forest extending into distance, not a thin ground strip.
2. **Inside the cloud layer:** dark blue shadow below large billowing cloud ceilings; patches of lighter mist occlude distant objects and the craft. Foreground clouds may obscure almost the whole field for a moment.
3. **Above clouds:** towering, rounded cloud masses occupy the lower and middle frame, with many smaller repeating forms into the distance; deep blue sky remains above. Cloud surfaces contain strong highlights, complex silhouette contours, and broad blue-grey shadow areas.

Scene transitions happen continuously throughout the clip. They should not be interpreted as separate static stages. The player and camera climb and dive, and the background shifts vertically as well as horizontally. Cloud and forest layers move at different speeds.

## Camera and motion

- The visible ground/cloud horizon and firing paths frequently run upward to the right, approximately 10–18 degrees. This banked view is a central part of the sense of speed.
- The craft rotates into climbs and dives, sometimes reaching roughly 45–70 degrees away from horizontal. It does not remain a fixed horizontal sprite while translating vertically.
- The exhaust is a continuous, tapering, slightly translucent turquoise/green ribbon that preserves the recent curved flight path. It grows longer during fast directional movement.
- Short white-blue streaks, fine projectile trails, foreground parallax, and occasional soft motion haze reinforce acceleration.
- The player is generally a small object, approximately 5–8% of game-view width, leaving considerable environmental space. The composition is not dominated by a giant player craft or a large HUD.
- The camera allows play across much of the field; the craft is often near the left third, but can pass through the centre or move toward a screen edge.

## Craft, enemies, weapons, and light

**Player:** a dark silver/black, sharply swept, triangular science-fiction aircraft with small reddish panels or nose/cockpit accents. It has thin wing tips and a bright turquoise/green engine. At some moments, a small circular satellite/drone follows nearby. `DRONE X2` is visible at the beginning of the supplied clip.

**Observed enemy silhouettes:**

- Small gold/brass and cream insect-like craft with darker bodies and small protrusions, arriving in lines of several units.
- Reddish/orange curved scorpion or hooked insect shapes with a large curled tail and claw-like appendages, usually appearing in groups.
- A much larger cream/gold segmented serpentine body, bending in an arc through the field.
- A compact rounded red armoured creature/craft, visible near 139 seconds.

The broad silver form around 30 seconds is not a reliable player model reference; its identity is unclear in the still. The repeated small black/red craft with the green trail is the reliable player reference. A distinct boss encounter and boss health bar cannot be confirmed from the reviewed clip.

**Shots and effects:**

- Player projectiles have bright white/cyan cores and thin, long cyan trails. Several streams fire at the same time during stronger attacks.
- `AUTOCANNON X3` is clearly visible at approximately 61 seconds.
- Strong firing produces a green/cyan bloom around the craft and muzzle, with visible light haze spilling into the surrounding air/clouds.
- Curved, thin white-cyan energy crescents form above and below the craft during some attacks (clear near 106 seconds).
- Enemy projectiles appear as saturated pink/magenta glowing orbs or short streaks. They remain readable against both sky and cloud shadows.
- Explosions have bright white/yellow centres, orange edges, and separate fragments. They briefly flare, then give way to debris and smoke.
- Large green and pink glows are visibly diffused across cloud surfaces. White star-like glints sometimes punctuate the blue sky.

## HUD and items

- HUD is small, centred near the top: a very thin horizontal green bar, six-digit score beneath, then temporary pickup/chain messages.
- The bar is labelled `ENERGY`, and `RECHARGING` is legible around 61 seconds. The video alone does not establish the exact energy-versus-health mechanic; SkyWind's HP, death, and recovery rules come from the user's explicit request.
- Temporary messages include `DRONE X2`, `AUTOCANNON X3`, `FULL HP`, and `+N Xn CHAIN`.
- Pickups are floating, glowing, lightly rotated square outlines, mostly green/turquoise, with white interior symbols. A pale gold square and white square are also visible around 116 seconds.
- Pickups commonly form a loose rising arc or diagonal chain of 3–5, giving the craft a visible route through the scene.
- There is no large on-screen control panel in the upper captured game view. The user's title, start interaction, game-over display, persistent best score, endless difficulty increase, and timed power-up behavior are requested additions where the clip does not establish exact rules.

## Time-indexed visual evidence

| Time | Evidence | Extracted crop |
| --- | --- | --- |
| 0 s | Dense tropical canopy; close palm fronds and broad leaves; small player; `DRONE X2` | `.work/reference/game-000.png` |
| 5 s | Above-cloud flight; cyan shots; long green exhaust; small gold enemies | `.work/reference/game-005.png` |
| 10–20 s | Large layered cloud ceiling, dark underside, steep flight path | `.work/reference/game-010.png`, `game-020.png` |
| 29 s | Reddish hooked enemy groups, three long cyan shot trails, green muzzle glow, tilted ground | `.work/reference/game-029.png` |
| 54–56 s | Near-canopy banked flight and parallel light trails | `.work/reference/game-054.png`, `game-056.png` |
| 61 s | `AUTOCANNON X3`, square pickup, gold enemy line, `RECHARGING` | `.work/reference/game-061.png` |
| 88–92 s | Segmented serpent enemy, cloud flight, item arc, craft rotating into a dive | `.work/reference/contact-items.jpg` |
| 90 s | Detailed small player silhouette over bright cloud mass, nearby gold enemies and glowing pickups | `.work/reference/game-090.png` |
| 106 s | Curved cyan energy crescents, orange enemy/debris, low-altitude view | `.work/reference/game-106.png` |
| 116 s | `FULL HP`, multiple pickup colors, green flight trail | `.work/reference/game-116.png` |
| 130 s | Large segmented enemy, steep player climb, shadowed cloud gap | `.work/reference/game-130.png` |
| 139–140 s | Red armoured enemy, cyan shooting, large white/yellow explosions over forest | `.work/reference/game-139.png`, `game-140.png` |
| 150 s | Clear player/exhaust profile; surrounding energy arc and pickup line | `.work/reference/game-150.png` |
| 170–180 s | Tall cumulus formations, strong mint and pink cloud lighting, dramatic dive/climb | `.work/reference/game-170.png`, `game-180.png` |
| 190–207 s | Return to forest followed by ascent above clouds | `.work/reference/contact-3.jpg` |

## Practical fidelity priorities

1. Continuous transitions between dense forest, dark cloud undersides, and bright cloud tops.
2. Several independently moving and occluding environment layers, with strong scale differences.
3. Sloped flight composition, craft rotation, and a long curved emissive exhaust trail.
4. Small metallic player, organic/insect-like enemy silhouettes, and relatively sparse central HUD.
5. Bright cyan player fire, pink enemy fire, crisp glowing pickups, explosive white/yellow flashes, and colored cloud illumination.

Frame review supports these visible characteristics. It does not establish exact collision boxes, spawn rates, weapon durations, score formulas, or audio state transitions; those should be treated as prototype design choices under the user's instructions.
