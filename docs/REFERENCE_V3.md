# SkyWind V3: perspective, cloud form and lighting targets

The reference's depth comes from changing perspective, solid cloud masses with soft boundaries, coherent lighting and rapid nearby scenery. Increasing the number or opacity of sliding pictures does not produce those relationships. This document separates observations from proposed V3 settings; it does not certify a new renderer as complete.

## Evidence inspected

The original `SampleGame.mp4` remains unchanged. Reference crops use only the upper 720 × 498 game region. The V2 captures below were supplied by the implementation task and inspected directly:

`C:\Users\USER\.codex\visualizations\2026\09\05\01a071d1-4502-7cf2-a744-7935fae38b3c\skywind-v2\`

- `low-flight-final.png`
- `high-clouds-check.png`
- `cloud-illuminated-final.png`

The current Canvas environment implementation was also read for the relationship between image placement, cloud masks and light blending. No rendering or game code was changed for this review.

| Reference | Use for comparison | What must be visible |
| --- | --- | --- |
| `.work/reference/game-000.png` | Very low flight over tropical canopy | Distinct near fronds, overlapping middle tree crowns and a fine distant canopy, with substantial ground coverage |
| `.work/motion-v2/low-canopy-start.png` — 53.3 s | Fast low-altitude combat corridor | Diagonal terrain, large near/middle speed separation and a clear dark-blue corridor |
| `.work/reference/game-090.png` | Flight above/between clouds | Rounded towers and deep gaps, several apparent cloud scales, soft blue-grey shadow volumes |
| `.work/reference/game-130.png` | Steep climb through a cloud opening | Cloud masses surrounding the flight corridor, with convincing height and depth |
| `.work/motion-v2/occlusion-contact.jpg` — 32–37.5 s | Entering and leaving cloud | Roughly 1.5–2 seconds of strong craft occlusion, while diffuse green light can remain visible |
| `.work/motion-v2/firing-light-contact.jpg` — 106–109.75 s | Powerful shot and destruction | Small gathering crescents, large curved cyan release, mint/white cloud illumination, quick impact flashes |
| `.work/motion-v2/cloud-flash-contact.jpg` — 169.5–172.25 s | Light travelling through cloud depth | Successive cloud lobes lighting up, with independent cyan and pink regions |

## Why the V2 pictures fail

1. **The large forms are wrong.** `high-clouds-check.png` reads as a few huge curled sheets or waves. Fine streaky fibres cover almost every surface. The reference has many connected, rounded cauliflower-like bulges with broad quiet shading inside them. A soft cloud is not a uniformly blurred image, nor a sheet covered in tiny threads.
2. **Depth is baked into each picture.** A card can move and change size, but its internal near/far features, silhouette and lighting keep the same relation. During a climb, the reference reveals different overlap relationships and apparent surfaces. Sliding a cloud picture down does not turn its underside into its top.
3. **Ground texture scale stays too uniform.** V2's low-flight frame contains a broad carpet of similarly busy foliage. The source has clearly separable crown and frond sizes across depth, dark gaps between near trees and fine detail that compresses with distance. The foreground should sometimes pass rapidly through the lower edge instead of remaining a flat decorative strip.
4. **Baked atmosphere becomes repeated terrain bands.** Earlier near-layer reuse also repeated the hazy horizon contained inside a forest picture. Removing that strip helps a seam but does not solve the absence of perspective or consistent ground geometry.
5. **Light is painted on a surface.** The V2 mint patch in `cloud-illuminated-final.png` follows a flat image mask. It does not establish how much cloud lies between the emitter, the lit point and the eye. Dense volumetric scattering, thin bright edges and shadowed inner gaps require different responses.
6. **The static screenshots cannot prove speed.** The stronger V2 effects do not establish that its motion now matches the video. Speed has to be compared in moving sequences with identical viewport normalization, using nearby features rather than only projectile streaks.

## Quantitative camera and depth targets

These are **proposed starting parameters**, not recovered original camera settings. Keep the gameplay plane and the environment on the same projection.

| Control | Proposed starting target | Reason / evidence |
| --- | --- | --- |
| Vertical field of view | 45° at 16:9, approximately 72.7° horizontally | Enough perspective for near/far scale changes without an extreme wide-angle view |
| Low-flight downward pitch | Approximately 10–16°, tuned against the 0 s and 53.3 s frames | The clip alternates between ground occupying most of the lower view and a wider open flight corridor |
| Roll / diagonal flow | Usually around −9° to −17° in representative low-flight views, with gradual variation | Reference terrain-flow slopes were about 9° and 14°; a 139.2 s cyan streak fitted −16.9°. Camera pan also affects these measurements |
| Gameplay depth | 40 m, if retained by the V3 integration | A shared reference plane for sprites, emitters and cloud front/back splitting |
| Example forward camera speed | 50 m/s in the illustrative world scale below | Calibrates near scenery to measured screen speed; rescale world units together if needed |
| Close visible scenery depth | 36–48 m in the same example | Produces about 0.71–0.94 view widths/s |
| Middle scenery depth | 65–120 m | Produces about 0.28–0.52 view widths/s |
| Distant cloud/tree depth | 150–220 m, with a still slower horizon beyond | Produces about 0.15–0.23 view widths/s |

For a sideward camera translation, the useful approximation is:

`screen widths per second = world speed / (2 × view depth × tan(horizontal FOV / 2))`

At 50 m/s and a 72.7° horizontal FOV, a feature at 36 m moves about 0.943 view widths/s; at 48 m, 0.707; at 150 m, 0.226. Pitch, roll and changing depth affect the actual vector, so validate rendered footage rather than treating these numbers as fixed stage scroll constants.

The measured reference near-canopy medians were **0.703 widths/s at 53.3–54.1 s** and **0.930 widths/s at 139.2–140.0 s**, equivalent to about **900–1,190 px/s at a 1280-wide viewport**. Cloud-bank samples were roughly **0.17–0.34 widths/s**. See `REFERENCE_MOTION_V2.md` and `.work/motion-v2/measurements.json` for method, confidence and distributions.

At the source's 720-pixel width, useful visual size ranges are approximately **1–5 px for distant crowns**, **10–35 px for middle crowns**, and **80–220 px for occasional close palms/fronds**. These are visual matching targets from the 0 s frame, not exact object measurements. Instance depth, size, overlap and optical flow should vary together. A small set of randomly scaled flat tree icons all placed at one depth will still read as a carpet.

## Density shape targets for a feasible volumetric pass

The following world dimensions assume the 40 m gameplay-plane / 50 m/s example and can be rescaled consistently.

- **Macro organisation:** place connected cloud groups over roughly 80–180 m regions, with broad clear gaps. Do not fill a uniform height slab with equal-frequency noise. A few tall groups should dominate a composition, with smaller formations receding behind them.
- **Tower and lobe scale:** use rounded primary bulges about 15–45 m across, with independently varying local top heights. Let groups merge into banks while retaining several distinct lobes. Avoid a row of identical balls, a uniform ceiling plane or long sinusoidal wave crests.
- **Fine erosion:** reserve approximately 2–6 m detail for silhouette breakup and wispy lower edges. Keep dense interiors smoother. Strong high-frequency density everywhere recreates V2's woolly surface and overwhelms the large shapes.
- **Height profile:** softer, thinner lower wisps and denser rising bodies; variable local tops rather than one global flat cap. Blend cloud types slowly across the coverage field. Small domain warps can connect and disturb forms without turning them into curls.
- **World anchoring:** the camera moves through a stable density field. Slow wind advection and gentle evolution should be secondary to camera travel; visible clouds should not boil or slide in screen space as the camera climbs.
- **Opacity range:** dense core optical depth around 2.3–4 gives approximately 10–2% transmittance. Thin edges around 0.1–0.7 retain about 90–50%. These are initial optical targets for a strong core and soft edge, not directly measured original coefficients.
- **Immersion duration:** at 50 m/s, a 75–100 m effective dense crossing lasts about 1.5–2 seconds. The reference has such a crossing, but the entire flight must not remain continuously hidden.

For a first bounded WebGL2 implementation, the agreed **48–64 view samples and about six sun-shadow samples** are a starting budget to profile, not a guaranteed frame rate. Prefer a precomputed, filtered 3D noise texture over many expensive procedural hash evaluations per sample. Use coarse empty-space checks and stop once transmittance is negligible. Resolve an attractive large cloud body before spending samples on fine erosion.

The primary Guerrilla presentation models connected clouds using a low-frequency Perlin-Worley base, height/coverage control and a separate erosion detail signal. Its lighting discussion combines transmittance, directional scattering and a cloud-specific interior/edge response. These ideas support separating **large form, edge detail and lighting** rather than using a single noisy density value for all three. [Schneider and Vos, SIGGRAPH 2015 presentation](https://advances.realtimerendering.com/s2015/The%20Real-time%20Volumetric%20Cloudscapes%20of%20Horizon%20-%20Zero%20Dawn%20-%20ARTR.pdf)

The later Nubis publication identifies regional authoring, transition control, atmosphere integration and Perlin-Worley generation as production concerns. For SkyWind, this supports an explicit coverage/height field that selects tower regions and open corridors; raw noise alone does not specify a useful composition. This last application is our implementation inference. [Guerrilla, Nubis 2017](https://www.guerrilla-games.com/read/nubis-authoring-real-time-volumetric-cloudscapes-with-the-decima-engine)

## Lighting and compositing targets

- Use one world-space sun direction for cloud and forest shading. Sunlit cloud surfaces should be soft off-white, recesses blue-grey, with a restrained ambient contribution that keeps shaded interiors readable. Do not compensate for unlit black cores by applying a uniform white overlay.
- Compute the sun's cloud optical depth at the density sample. Larger dense formations should cast broader internal shadows; a constant top-bright/bottom-dark tint cannot reveal overlapping volumes.
- Add local cyan and pink emitter energy inside the density integration. It should brighten the cloud where there is material, attenuate through thickness and fade with emitter lifetime. Avoid a bright circle that remains fixed on the screen independently of the cloud's shape or depth.
- For the strong reference release at 107–107.5 s, allow a short broad mint/near-white response covering multiple lobes. Retain some shaded recesses and a darker craft silhouette. The 0.25-second source samples do not establish an exact original light decay curve.
- Compute cloud ranges using ray/plane intersections. A gameplay plane at 40 m view depth is not `t = 40` along every off-axis ray. Use the shared camera and plane normal to obtain each ray's split distance.
- Composite premultiplied front-cloud colour with the attenuated gameplay/background result: `Cfront + Tfront × Cbehind`. Use the same convention throughout; extra multiplication by alpha creates dark cloud fringes.
- A terrain depth texture contains projection depth. Reconstruct ray distance with the same camera projection before stopping the cloud march. This keeps rear clouds behind terrain and foreground clouds in front while the camera rolls or pitches.
- Do not let the game's bright shot/explosion sprites simply paint over all foreground clouds. A hidden emitter may still light the cloud while its sharp core is attenuated.

Guerrilla's 2022 work explicitly treats fly-through clouds, fast motion, internal lighting and temporal artifacts as connected challenges. For this fast-scrolling prototype, temporal accumulation must be checked during turns, occlusion and flashes, not just in a still sky. A clean spatial result is preferable to long-lived history smearing. This is a feasibility recommendation, not a claim to reproduce Nubis. [Guerrilla, Nubis Evolved](https://www.guerrilla-games.com/read/nubis-evolved)

## Acceptance checks before claiming fidelity improvement

- [ ] Compare a V3 low-flight capture against **both** 0 s and 53.3 s reference views at the same normalized game viewport. Tree crowns become smaller, slower and more atmosphere-muted with depth; no duplicated horizon or visible repeat strip remains.
- [ ] Track at least three near and three middle foliage features over a one-second clip. Near apparent motion reaches the reference's approximately 0.7–0.93 widths/s range in the designated fast section, while the distant horizon remains slower.
- [ ] Compare a cloud-top still against 90 s and 130 s. Large rounded lobes and deep gaps read before fine texture; there are several scales of cloud detail and no repeated wave/sheet silhouette.
- [ ] Move the camera vertically through a bank. Overlap and visible cloud surfaces change continuously in depth; the scene is not merely a downward translation of a fixed picture.
- [ ] Record one 1.5–2-second strong cloud crossing. The craft becomes mostly hidden, emerges naturally and remains understandable through the trail or diffuse light without a permanently clear cutout around it.
- [ ] Record a power release inside the cloud. Mint light follows the moving projectile/emitter and nearby density, affects multiple lobes and fades; pink fire can create a separate local colour response.
- [ ] Check the horizon, screen edges and terrain intersections while rolling. Cloud density does not clip to rectangular cards, dark alpha seams or a fixed depth plane.
- [ ] Profile the actual target browser after the density shape is correct. Record frame time during dense cloud, near forest and simultaneous combat. No frame-rate claim is based solely on another renderer's published performance.

No new images, gameplay changes or renderer modifications were made as part of this V3 analysis. Camera/world-scale, density and performance values above are proposals for implementation and visual validation; the reference engine's internal parameters are unavailable.

## Altitude-range follow-up: low, immersed and fully above clouds

This follow-up addresses the request that the lowest and highest altitude look unmistakably different, with the strongly obscuring cloud layer occupying a relatively narrow part of the altitude range. All paths below were checked to exist. `.work` is hidden from default `rg --files` enumeration; use `rg --files --hidden .work` or open the absolute file directly.

| State | Verified absolute reference path | Ground, cloud, horizon and craft relationship |
| --- | --- | --- |
| Lowest / canopy skimming | `E:\codexwork\Skywind\.work\reference\game-000.png` | Forest occupies roughly the lower 70–75% of the view, with recognisable close palms and broad leaves. Distant canopy compresses toward the upper part of the view. The craft is clearly over the trees; open dark air remains behind it. |
| Low open combat corridor | `E:\codexwork\Skywind\.work\motion-v2\low-canopy-start.png` | A diagonally rising forest fills the lower/right region; the craft flies in the dark gap below the cloud ceiling. This provides a second valid low-altitude composition, with less ground coverage than the 0 s frame. |
| Strong cloud immersion | `E:\codexwork\Skywind\.work\motion-v2\occlusion-033.00.png` | Cloud bodies and blue-grey cloud shadow occupy almost all the view. The craft is nearly invisible, terrain is absent, and no clean empty corridor is reserved around the player. |
| Emerging through the top | `E:\codexwork\Skywind\.work\motion-v2\occlusion-034.50.png` | The craft becomes distinct again against cloud tops and open blue gaps; the forest remains hidden far below. This is an emergence view, not the maximum-altitude target. |
| Among tall cloud tops | `E:\codexwork\Skywind\.work\reference\game-090.png` and `E:\codexwork\Skywind\.work\reference\game-180.png` | The craft is visible, but large cloud towers still occupy much of the view. These demonstrate the intermediate-to-high transition, rather than the most open sky. |
| Highest / clear upper sky | `E:\codexwork\Skywind\.work\reference\game-150.png` | Roughly 85–90% of the view is open deep blue sky. Only distant cloud crests enter the lowest 10–15%, mainly toward the right. The craft, trail and pickups have a clear silhouette; no forest is visible. This is the correct maximum-altitude acceptance frame. |

Coverage percentages are approximate visual composition targets, not automated segmentation results. The 90 s or 180 s cloud-filled view should not substitute for the 150 s clear-sky target when judging the maximum altitude.

### Confirmed reason the earlier height range was too narrow

The inspected earlier code used `cameraY = 28 + altitude × 90`, giving a camera range of **28–118 m**, while the cloud slab covered **50–118 m**. Its 68 m thickness occupied **75.6%** of the 90 m camera range.

There was also a view-plane offset: `normalize([0.55, -0.25, -1]).y ≈ -0.214`. At a 43 m gameplay plane, its central world point was approximately **9.2 m below the camera**. At maximum camera height 118 m, that point was therefore still around **108.8 m**, inside the cloud slab. Reaching the cloud's ceiling with the camera did not put the gameplay view clearly above it.

During this review the renderer was updated to a provisional `cameraY = 28 + altitude × 190` (**28–218 m**) and cloud slab **58–103 m**. Those live edits belong to the implementation task. The new slab occupies **23.7%** of the camera range, which is a suitable starting direction for a narrower obscuring layer and more distinct extremes; it still requires visual validation.

With the original downward view direction in the lower/middle range, the gameplay-plane centre crosses that provisional slab at approximately normalized altitude **0.206–0.443**. A narrower dense interior, for example around world Y **66–94 m**, would affect that centre at about **0.248–0.396**, roughly **15%** of the control range. Preserve soft cloud boundaries around this dense interval instead of making the entire expanded camera range equally foggy.

### Recommended regime targets for the current world scale

| Control region | Suggested camera / visual target |
| --- | --- |
| Minimum, approximately altitude 0–0.15 | Camera around 26–55 m, adjusted to remain above the actual local canopy. Clearly visible nearby leaves and tree crowns; reference-like rapid foreground flow. Do not lower it into permanently opaque foliage. |
| Narrow strong immersion, approximately 0.25–0.40 | The gameplay plane passes through the dense cloud body. Strong obscuration is possible for about 1.5–2 seconds during a crossing, but clear holes and soft entry/exit remain. |
| Clear emergence, approximately 0.45–0.70 | The gameplay plane clears the dense top, with large cloud towers below and beside it. Terrain is mostly hidden. |
| Maximum, approximately 0.85–1 | Camera around 190–220 m, at least roughly 80–110 m above a 103 m cloud ceiling. The craft is well above the cloud slab. Tilt toward the horizon or slightly upward so cloud crests remain only along the lower edge, matching 150 s. |

A camera maximum around **210–225 m** and a cloud slab about **40–50 m thick** are appropriate initial values in this existing world scale. Raising the cloud ceiling along with the camera maximum would undo the separation. Keep the density's hard slab clip, local cloud height profile, ray-march slab bounds and light-height calculations consistent when changing cloud bounds.

The implementation's new high-altitude direction change from forward Y component −0.25 toward +0.20 before normalization is compatible with a clear-sky maximum. Check its framing in an actual capture: a constant downward pitch from high altitude can continue to fill the image with cloud tops even when the camera is physically above them.

### Separate control limitation found in the simulation

The inspected simulation computes `targetAltitude = routeAltitude × 0.67 + flightAltitude × 0.33`, with the route varying approximately 0.02–0.98. Consequently, even if the player's flight input spans the full theoretical 0–1 range:

- At the route minimum, holding the highest flight position can reach only a target near **0.3434**.
- At the route maximum, holding the lowest flight position can lower the target only to about **0.6566**.

Expanding the render camera range alone does not remove this route-dependent restriction. If the intended control is that sustained ascent or descent can reach the upper or lower regime whenever the player requests it, the simulation owner must separately adjust how automatic route altitude and player input combine. The visual targets here do not mandate a particular gameplay-control implementation.

Acceptance should include holding ascent and descent at more than one route phase, then capturing the actual reached low and high views. A scripted screenshot at forced altitude 0 or 1 proves the rendering range but does not prove the player can reach it through normal controls.
