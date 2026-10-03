# SkyWind 현재 작업 상태

기준: 2026-10-04 KST / prototype-17-final-hud.

사용자가 지정한 로컬 실행본의 소스·자산을 반영했다. 현재 게시 진행과 검증 결과는 [배포·백업 기록](docs/PUBLIC_UPDATE_20261004.md)을 따른다. 게임 추가 수정은 하지 않는다.

- 일반전 45초, 서로 다른 5보스와 반복 HELL, 편대 독립 진입·공격·퇴각, 일반분홍25/패턴33/직사10 피해 분류, 확대 스침, 최상단 파일럿 HUD 가림 방지가 적용된 버전이다.
- 원래 루트와 기존 작업 checkout의 미커밋 변경은 보존했다. 다른 환경에서는 GitHub main을 내려받아 npm start로 실행한다. 과거 .work 경로 없이 빌드할 수 있다.
- 기존 동일 소스 검사 437/437, 실제 HUD 낮밤·desktop/portrait 4조건 QA 통과. 이번 재현 빌드·파일 동일성 결과는 배포 기록에 구분한다.
- 지속 압박 목표·정상 native 60초 생존·사람 체감/최종 미감·직접 청음·실물 모바일 정량 성능은 완료로 판정하지 않았다.
- 이전 로컬 진행 상태와 결정은 docs/history/LOCAL_STATE_20261003.md 및 LOCAL_DECISIONS_20261003.md에 당시 기록으로 보존했다. 재개 명령이 아니다.

## SOURCE OF TRUTH ROUTING

프로젝트 설명:
[README.md](README.md)

게임 진행 / 보스 / 난이도:
[docs/plan/LEVEL_DESIGN.md](docs/plan/LEVEL_DESIGN.md)

탄막 / 텐션:
[docs/plan/BARRAGE_DESIGN.md](docs/plan/BARRAGE_DESIGN.md)

시청각 연출:
[docs/plan/AUDIO_VISUAL.md](docs/plan/AUDIO_VISUAL.md)

메카닉 / 아트:
[docs/plan/MECHA_ART.md](docs/plan/MECHA_ART.md)

검증:
[docs/plan/QUALITY.md](docs/plan/QUALITY.md)

사용자 결정:
[docs/plan/DECISIONS.md](docs/plan/DECISIONS.md) — 승인·충돌·선택 확인이 필요할 때 상단 Index부터.

최신 milestone report:
[docs/PUBLIC_UPDATE_20261004.md](docs/PUBLIC_UPDATE_20261004.md) — prototype-17-final-hud 게시·백업 결과.

과거 구현 인계:
[HANDOFF.md](HANDOFF.md) — 과거 구현 원인·수치·검증 근거가 필요할 때만.

과거 QA / evidence:
필요할 때만 해당 `docs/` 하위 자료 참조. R1·PATCH2 등의 당시 결과를 현재 버전 전체 검증으로 재사용하지 않음.

작업별 추가 경로:

- 전체 연결·HUD는 [IMPLEMENTATION.md](docs/plan/IMPLEMENTATION.md), 1차 포함/보류 범위는 [FIRST_IMPLEMENTATION.md](docs/plan/FIRST_IMPLEMENTATION.md).
- 효과음 제작 도구·자율 평가 조사는 [SFX_WORKBENCH.md](docs/plan/SFX_WORKBENCH.md). 초기 환경 인계의 역사적 절차는 [FIRST_IMPLEMENTATION_HANDOFF.md](FIRST_IMPLEMENTATION_HANDOFF.md).
- 실제 동작은 관련 현재 소스가 기준: 진행·흡수 [src/game.js](src/game.js), 시험값 [src/level.js](src/level.js), 패턴 [src/barrage.js](src/barrage.js), HUD [src/main.js](src/main.js)·[src/presentation.js](src/presentation.js), 표현 [src/renderer.js](src/renderer.js), 사운드 [src/audio.js](src/audio.js).

읽기 주의:

- 분야 문서는 상세 사양·제안을 찾는 경로다. `LEVEL_DESIGN`/`BARRAGE_DESIGN`의 “구현 미승인”과 `QUALITY`의 “게임 구현 미시작”은 작성 당시 표현이다. D42의 1차 승인·적용을 취소하거나 전체 제작 승인으로 확대하지 않는다.
- `LEVEL_DESIGN`의 자동 흡수 금지와 `IMPLEMENTATION`/`FIRST_IMPLEMENTATION`의 초기 배경 속도는 현재 동작과 다르다. 관련 작업에서는 Index의 D43·D45~D48, 현재 소스와 최신 milestone report를 대조한다. 분야 문서 본문과 과거 인계·QA는 이번에 다시 쓰지 않았다.
- 배포 기록과 Git 상태는 별개다. 이번에는 공개 사이트를 조회·배포하지 않았으며, D41/D49의 과거 게시 승인을 이번 변경의 게시 권한으로 재사용하지 않는다.
