# SkyWind Current State

Updated: 2026-09-15 KST

Branch: `main`

HEAD: `bd0357a430c8c3d83b712cf982ab7354bbe1a7a6`

Remote `main`: `bd0357a430c8c3d83b712cf982ab7354bbe1a7a6` — 같은 날 `git ls-remote origin refs/heads/main`으로 확인.

HEAD는 이번 문서 정리의 소스 대조 기준이다. 이 문서 변경은 아직 커밋하지 않았다.

## HUMAN SUMMARY

STATUS: 1차 전투 확인본 구현됨. 전체 제작 완료·최종 사용자 승인은 아님.

현재 milestone: `SKYWIND-FIRST-R6-20260909` — I01~I07 및 R2~R6 적용.

현재 구현된 핵심:

- 일반전 45초 → 보스 실제 격파 → 다음 사이클. WARDEN/CARRIER와 첫·두 번째 시험 난도 반복.
- 상하 보급·성장·근접 흡수, 2초 텐션·4패턴, 낮밤·가속·바이저 HUD·사건별 빛/소리.

현재 검증 상태:

- 2026-09-09 보고 기록: 테스트 164/164·구문 검사·103파일 정적 빌드 통과.
- 이번에는 HEAD·원격·현재 소스·문서만 대조. 게임 테스트·빌드·브라우저 검사는 재실행하지 않음.

현재 알려진 문제:

- 분야 문서 일부에 과거 시험값·미시작 표현이 남아 있음. 아래 읽기 주의를 따름.

미검증:

- R6의 장시간 수동 플레이·모바일 실기 정량 성능, 최종 밸런스·직접 청음 승인.

현재 작업:

- 문서 체계 1차 최소 정리. 게임 코드·자산·테스트 변경, 커밋·푸시·배포는 범위 밖.

다음 후보:

- R6 플레이·청음 검토. 세 번째 이후 최종 난도·새 메카닉·효과음 제작 도구는 미구현 후속 범위.

사용자 결정 필요:

- 다음 개선 범위와 전체 제작의 미결 선택·최종 채택 기준. 이번 문서 정리를 막는 미결 선택은 없음.

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
[docs/WORK_REPORT_20260909.md](docs/WORK_REPORT_20260909.md) — 해당 소스의 검사·관측 기록이며 이번 재검증 결과가 아님.

과거 구현 인계:
[HANDOFF.md](HANDOFF.md) — 과거 구현 원인·수치·검증 근거가 필요할 때만.

과거 QA / evidence:
필요할 때만 해당 `docs/` 하위 자료 참조. R1·PATCH2 등의 당시 결과를 R6 전체 검증으로 재사용하지 않음.

작업별 추가 경로:

- 전체 연결·HUD는 [IMPLEMENTATION.md](docs/plan/IMPLEMENTATION.md), 1차 포함/보류 범위는 [FIRST_IMPLEMENTATION.md](docs/plan/FIRST_IMPLEMENTATION.md).
- 효과음 제작 도구·자율 평가 조사는 [SFX_WORKBENCH.md](docs/plan/SFX_WORKBENCH.md). 초기 환경 인계의 역사적 절차는 [FIRST_IMPLEMENTATION_HANDOFF.md](FIRST_IMPLEMENTATION_HANDOFF.md).
- 실제 동작은 관련 현재 소스가 기준: 진행·흡수 [src/game.js](src/game.js), 시험값 [src/level.js](src/level.js), 패턴 [src/barrage.js](src/barrage.js), HUD [src/main.js](src/main.js)·[src/presentation.js](src/presentation.js), 표현 [src/renderer.js](src/renderer.js), 사운드 [src/audio.js](src/audio.js).

읽기 주의:

- 분야 문서는 상세 사양·제안을 찾는 경로다. `LEVEL_DESIGN`/`BARRAGE_DESIGN`의 “구현 미승인”과 `QUALITY`의 “게임 구현 미시작”은 작성 당시 표현이다. D42의 1차 승인·적용을 취소하거나 전체 제작 승인으로 확대하지 않는다.
- `LEVEL_DESIGN`의 자동 흡수 금지와 `IMPLEMENTATION`/`FIRST_IMPLEMENTATION`의 초기 배경 속도는 현재 동작과 다르다. 관련 작업에서는 Index의 D43·D45~D48, 현재 소스와 최신 milestone report를 대조한다. 분야 문서 본문과 과거 인계·QA는 이번에 다시 쓰지 않았다.
- 배포 기록과 Git 상태는 별개다. 이번에는 공개 사이트를 조회·배포하지 않았으며, D41/D49의 과거 게시 승인을 이번 변경의 게시 권한으로 재사용하지 않는다.
