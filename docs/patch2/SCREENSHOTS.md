# PATCH2 실제 화면 색인

2026-09-06에 캡처된 원본 PNG를 변경 없이 보존했다. 이번 GitHub 백업에서 새로 생성한 화면이 아니다. 구름·광원 전후 쌍은 같은 조건의 실제 렌더러를 정지시킨 비교용 장면이며, 무기·충돌 화면도 필요한 상태를 주입한 테스트 장면을 포함한다. 일반 생존 플레이의 우연한 장면으로 해석하지 않는다.

| 확인 항목 | 수정 전 | 수정 후 |
|---|---|---|
| 최상공 구름 | [before](screenshots/before-cloud-high.png) | [after](screenshots/after-cloud-high.png) |
| 중앙 구름 | [before](screenshots/before-cloud-middle.png) | [after](screenshots/after-cloud-middle.png) |
| 중앙 깊이 | [before](screenshots/before-cloud-middle-depth.png) | [after](screenshots/after-cloud-middle-depth.png) |
| 저공 구름 | [before](screenshots/before-cloud-low.png) | [after](screenshots/after-cloud-low.png) |
| 무사격·동적 광원 없음 | [before](screenshots/before-light-none.png) | [after](screenshots/after-light-none.png) |
| 발사 광원 | [before](screenshots/before-light-shot.png) | [after](screenshots/after-light-shot.png) |
| 적탄 광원 | [before](screenshots/before-light-enemyShot.png) | [after](screenshots/after-light-enemyShot.png) |
| 명중 광원 | [before](screenshots/before-light-hit.png) | [after](screenshots/after-light-hit.png) |
| 피격 광원 | [before](screenshots/before-light-playerHit.png) | [after](screenshots/after-light-playerHit.png) |
| 획득 광원 | [before](screenshots/before-light-pickup.png) | [after](screenshots/after-light-pickup.png) |
| 폭발 광원 | [before](screenshots/before-light-explosion.png) | [after](screenshots/after-light-explosion.png) |
| 수목의 전투 가림 | [before](screenshots/before-low-occlusion.png) | [after](screenshots/after-low-occlusion.png) |

이동 입력 관측: [최상단](screenshots/after-high-input.png), [최하단](screenshots/after-low-input.png).

HUD/무기: [NORMAL](screenshots/after-weapon-normal.png), [SPREAD](screenshots/after-weapon-spread.png), [LANCE](screenshots/after-weapon-lance.png), [HELIX](screenshots/after-weapon-helix.png), [DRONE](screenshots/after-weapon-drone.png).

판정: [날개 스침](screenshots/after-wing-graze.png), [핵 직격](screenshots/after-core-hit.png), [고속 직격](screenshots/after-fast-core.png). 접촉 프레임 Canvas: [날개](screenshots/after-wing-graze-contact-canvas.png), [핵](screenshots/after-core-hit-contact-canvas.png), [고속](screenshots/after-fast-core-contact-canvas.png). HP 판정과 프레임 조건은 [테스트](../../tests/player-hitpoint.test.js)와 [판정 기록](hitpoint-notes.md)을 함께 본다.

종료 경계: [일시정지](screenshots/after-paused.png), [게임오버](screenshots/after-gameover.png), [타이틀 복귀](screenshots/after-title-return.png). 정지 화면 하나로 오디오 꼬리 정리를 증명하지는 않는다.
