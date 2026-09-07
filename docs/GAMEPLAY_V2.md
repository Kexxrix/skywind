# SkyWind gameplay V2

2026-09-06. The new rules keep the existing HP, score, endless run, pickup and restart APIs. They make pressure, enemy behavior and weapon changes visible during the first minute.

## Research and design decisions

- **Thunder Force III:** SEGA's official manual describes several distinct weapons, speed settings and CLAW satellites that expand the firing area. SkyWind uses a fast default double shot, three visibly different timed weapon patterns, and two temporary escorts. These are adaptations; it does not reproduce that game's full selection system. [SEGA English manual](https://manuals.sega.com/genesismini/pdf/THUNDER_FORCE_III.pdf), [SEGA Japanese weapon diagrams](https://www.sega.jp/mdmini/manual/pdf/m_jp_thunder-force3.pdf).
- **Gradius:** Nintendo's official manual describes capsules, formations, double shots, lasers and an attacking Option ally. SkyWind uses recognizable formations and a pickup reward loop while retaining the requested HP-based survival rules. [Nintendo manual, pages 3–5](https://www.nintendo.co.jp/clv/manuals/en/pdf/CLV-P-NABRE_en.pdf).
- **R-Type Final 2:** the publisher's official description emphasizes distinct wave cannons, Force units, bit devices and evolving enemies. SkyWind's lance, spread and helix patterns serve different firing areas; enemy silhouettes correspond to distinct behaviors. [Publisher description on Nintendo](https://www.nintendo.com/us/store/products/r-type-final-2-switch/).
- **Survival pacing:** Valve's Michael Booth describes alternating build-up, peak and recovery periods, explicitly distinguishing pacing from difficulty. SkyWind adapts that separation: a deterministic time-based difficulty curve raises pressure, with a short four-second breathing interval every 22 seconds. The formula and timings below are SkyWind design choices, not a formula taken from Valve. [Valve presentation, pages 79–81 and 91](https://steamcdn-a.akamaihd.net/apps/valve/2009/ai_systems_of_l4d_mike_booth.pdf).

## Pressure curve

Values below exclude boss bonuses and the brief recovery interval. Larger heavy units use two fewer enemies per formation, with a minimum of two.

| Run time | Base wave interval | Formation size | Enemy movement multiplier | Base hostile projectile speed | Active enemy cap |
|---|---:|---:|---:|---:|---:|
| 0 seconds | 2.35 s | 3 | 1.00 | 230 px/s | 15 |
| 30 seconds | 1.31 s | 4 | 1.32 | 280 px/s | 17 |
| 60 seconds | 0.91 s | 6 | 1.63 | 329 px/s | 20 |
| 120 seconds | 0.62 s | 8 | 2.10 | 365 px/s | 25 |

- Stage changes every 18 seconds and after boss victories. Ordinary enemy HP rises more slowly than density; bosses keep gaining HP over repeated cycles.
- The first boss arrives at 38 seconds. Later bosses arrive 28–36 seconds after the previous boss dies, cycling through all four bosses.
- A boss left alive for 14 seconds starts receiving two to four escorts every 6–12 seconds. Its firing recovery also tightens gradually, so stalling one encounter does not freeze survival pressure.
- Standard projectile speed caps at 365 px/s; every special projectile also respects an absolute 420 px/s cap. Hostile bullets cap at 260 and ordinary active enemies cap at 44.
- Every attack has a visible 0.34–1.0 second tell. Needle ships and wasps lock the player's position before releasing their attack. Enemies cannot begin an attack offscreen or within the player's horizontal movement corridor.
- Boss curtains retain a 180px vertical opening. Circular patterns omit an angular wedge. Mine hazards arm for 0.8 seconds before damaging the player.

## Nine regular enemy behaviors

| Type | Behavior | Response |
|---|---|---|
| beetle | Fast diagonal/sine formations; later paired aimed shots | Clear the front of the formation and sidestep its locked aim |
| wasp | Slows, signals a lock, then commits to a high-speed dive | Move after its targeting tell; it does not reacquire during the dive |
| claw | Brakes in the right half and fires a broad fan | Use the spaces between fan lines |
| dragonfly | Small, fragile, very fast dart groups | Sweep the group before it crosses the screen |
| worm | Long serpentine body, paired offset shots | Follow its vertical arc; its long narrow body uses an ellipse hitbox |
| ray | Broad glide and separated horizontal curtain shots | Use the open central corridor |
| mantis | Angular zigzag and split aimed shots | Cross its previous vertical lane after the tell |
| orb | Slow rotating emitter, radial leftward pattern with a gap | Follow the broad omitted wedge |
| needle | Brakes, holds its aim for 0.75 seconds, then fires fast needles | Sidestep after the line locks; elongated hull uses an ellipse hitbox |

## Four boss encounters

| Boss | Distinct attacks | Counterplay |
|---|---|---|
| WARDEN | Aimed fan; broad arc with an omitted wedge; fast three-shot burst | Read the fan spacing, then move after the burst locks |
| IRON CARRIER | Horizontal wall with a 180px gap; separated crossfire; escort launch | Move into the marked lane early, then clear the escorts |
| LEVIATHAN | Double crescents; split seam; a telegraphed forward surge | Use the seam between crescents and reposition before the surge |
| QUEEN HIVE | Gapped petal rings; arming mines; spiral and aimed accents | Follow the omitted wedge and move before slow mines reach the left side |

Bosses change phase below half HP. Their central cores are vulnerable; large armored wings are not separate damage targets.

## Flight and pickups

- Keyboard maximum horizontal velocity is 225 px/s with gentler acceleration, versus 490 px/s vertically. Pointer steering follows the same velocity limits.
- `cameraRoll(game)` is shared by simulation and renderer. Player position is constrained in projected screen space: the nose stays inside the left 33%, while vertical motion reaches screen y=48–672. The projected bounds are intersected with world x=70–380. Strong camera roll can therefore produce a negative world y without placing the ship offscreen.
- `scrollTime` integrates speed, freezes on gameover and survives a restart. Scene transitions must preserve it alongside `sceneTime`.
- Basic fire uses two fast shots. Each power pickup grants 14 seconds and cycles **spread** (five-way coverage), **lance** (three concentrated piercing shots), **helix** (four oscillating streams). Expiration returns to basic fire. Restart returns the cycle to spread.
- Drone pickups grant two escort cannons for 15 seconds. Health pickups restore 30 HP, capped at 100. Guaranteed pickups arrive every ten seconds, with health preferred when HP is critical.

## Integration and verification

Existing exports remain: `createGame`, `startGame`, `updateGame`, `consumeEvents`. Added exports are `cameraRoll`, `playerMuzzle`, `difficultyAt`, `ENEMY_TYPES`, `BOSS_KINDS`, `MAX_ENEMY_BULLET_SPEED`. `playerMuzzle(player)` rotates the visible nose at local (+30, -4) by the renderer's bank angle; primary shot flashes and projectile origins share that position while projectile headings remain forward.

Regular enemy types are the nine keys above. All bosses retain `type: 'boss'` and add `bossKind`, `bossName`, `variant`, `attackName`, `safeLane`, `safeAngle`, `telegraph`, `attackAngle`, `chargeTime`. Player adds `vx`, `vy`, `weaponMode`, `powerPickups`; bullets expose `weaponMode`; mines expose `arming`.

`node --test tests/game.test.js` verifies the HP/score/restart rules, deterministic replay, projected left-third and vertical boundaries under changing roll, the first-minute difficulty ramp, all nine enemy behaviors, four distinct boss attacks, locked tells, carrier gaps, special bullet speed caps, arming mines, and weapon changes/piercing. A seeded 130-second simulation exercised sustained enemy spawning and two boss encounters without unbounded entity growth. Visual timing and atlas fitting require the renderer's browser QA.
