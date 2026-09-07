# SkyWind audio browser QA

Date: 2026-09-05 (Asia/Seoul)
Target: http://127.0.0.1:5173/
Browser: connected Chrome, a separate temporary QA tab at the existing default viewport. The in-app browser was unavailable when this verification task resumed.

## Method

1. Opened the app and clicked its real START control to unlock the exported `AudioDirector` through an ordinary user gesture.
2. Muted only this in-memory audio instance, without saving the user's sound preference.
3. Used supported CDP development inspection to set isolated fixture conditions on the exported game object. The app's real frame loop and `chooseMusic()` selected each track: normal gameplay, title, HP 30 danger, boss present, temporary weapon power, and game-over mode.
4. Inspected the actual `HTMLAudioElement` decks, waited through loading and crossfades, and sampled `currentTime` twice approximately 0.6 seconds apart.
5. Kept the fixture invulnerable and prevented enemy and pickup spawning. The ending fixture changed the mode without emitting a `gameover` event, so it did not invoke score saving.
6. Paused the audio, confirmed its playback times stopped, and closed the QA tab. The root user-facing game tab and browser viewport were not modified.

## Results

| Selected state | File | Browser duration (seconds) | Time sample 1 | Time sample 2 | Loop |
| --- | --- | ---: | ---: | ---: | --- |
| normal | assets/audio/normal.m4a | 139.990 | 42.340 | 42.939 | yes |
| title | assets/audio/title.m4a | 131.892 | 0.156 | 0.758 | yes |
| danger | assets/audio/danger.m4a | 136.829 | 1.387 | 1.988 | yes |
| boss | assets/audio/boss.m4a | 142.393 | 1.369 | 1.969 | yes |
| powerup | assets/audio/powerup.m4a | 135.810 | 1.356 | 1.957 | yes |
| ending | assets/audio/ending.m4a | 116.636 | 1.373 | 1.972 | no |

- All six selections matched their expected state and local source file.
- All six elements reached `readyState = 4`, had a finite duration, were playing, and advanced by approximately 0.6 seconds between samples.
- No AudioDirector or media-element error was present.
- Once each transition settled, the active deck volume reached 0.28 and the previous deck was paused. The title and ending samples initially caught a fade still in progress; a follow-up settlement check confirmed both completed normally.
- Explicit audio pause stopped both decks; their times remained stable across a further 0.6-second sample.
- AudioContext was running after START.
- No Chrome console errors or warnings were recorded for this QA tab.
- `skywind.best.v1` and `skywind.muted.v1` values were identical before and after the test.

## Scope

This verifies browser loading, decoding, playback progression, runtime music selection, loop settings, completed crossfades and pausing. State selection used isolated game fixtures, so this is not a natural gameplay run through six events. Audio remained muted for this check to avoid overlapping music from concurrent game tabs. The temporary fixture state was discarded by closing the QA tab.
