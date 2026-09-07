# SV-01 R4 적용 파일 목록

2026-09-07. 로컬 프로젝트 `E:/codexwork/skywind`에 적용 완료. 전달 ZIP은 아래 **29파일**을 프로젝트 상대 경로로 포함합니다. 전체 게임 ZIP이 아닙니다.

## 기존 파일 수정 — 2개

- `src/renderer.js`: 매니페스트·21장 로딩, 기존 `player.angle`에서 뱅크 프레임 선택, 본체 이미지 참조 교체. 기존 중심·106×106 표시·화면 회전 유지.
- `tools/build-site.mjs`: 정적 빌드에 매니페스트와 21 PNG 포함.

## 새 파일 — 27개

- `tests/player-sv01.test.js`: 자산 규격·해시·순서·피벗, 포즈 선택, 게임 상태 불변, 드론 보존 회귀 검사 3개.
- `docs/SV01_R4_CHANGED_FILES.md`: 이 목록.
- `assets/art/player/sv01/README_APPLY.md`: 적용·인계 안내.
- `assets/art/player/sv01/manifest.json`: 코드가 실제로 읽는 프레임 순서·각도·피벗·해시.
- `assets/art/player/sv01/preview_sheet.png`: 21포즈 확인 이미지 1장.
- `assets/art/player/sv01/alpha_check.png`: 검정·흰색·체커 배경 확인 이미지 1장.
- `assets/art/player/sv01/sv01_bank_00_desc_74.png`
- `assets/art/player/sv01/sv01_bank_01_desc_66p6.png`
- `assets/art/player/sv01/sv01_bank_02_desc_59p2.png`
- `assets/art/player/sv01/sv01_bank_03_desc_51p8.png`
- `assets/art/player/sv01/sv01_bank_04_desc_44p4.png`
- `assets/art/player/sv01/sv01_bank_05_desc_37p0.png`
- `assets/art/player/sv01/sv01_bank_06_desc_29p6.png`
- `assets/art/player/sv01/sv01_bank_07_desc_22p2.png`
- `assets/art/player/sv01/sv01_bank_08_desc_14p8.png`
- `assets/art/player/sv01/sv01_bank_09_desc_7p4.png`
- `assets/art/player/sv01/sv01_bank_10_neutral_0.png`
- `assets/art/player/sv01/sv01_bank_11_asc_7p4.png`
- `assets/art/player/sv01/sv01_bank_12_asc_14p8.png`
- `assets/art/player/sv01/sv01_bank_13_asc_22p2.png`
- `assets/art/player/sv01/sv01_bank_14_asc_29p6.png`
- `assets/art/player/sv01/sv01_bank_15_asc_37p0.png`
- `assets/art/player/sv01/sv01_bank_16_asc_44p4.png`
- `assets/art/player/sv01/sv01_bank_17_asc_51p8.png`
- `assets/art/player/sv01/sv01_bank_18_asc_59p2.png`
- `assets/art/player/sv01/sv01_bank_19_asc_66p6.png`
- `assets/art/player/sv01/sv01_bank_20_asc_74.png`

## 실제 검증

- 승인 R4에서 21개 1024 원본 렌더 성공, 256 RGBA 최종 21개 성공 / 실패 0 / 제외 0. 모든 파일 읽기·PNG 헤더·해시·완전 투명 영역·가장자리 여백 확인.
- 고정 카메라·조명 행렬과 기존 21개 각도를 각 렌더에서 확인. 승인 `.blend` SHA-256 불변.
- 검정·흰색·체커 합성 및 21포즈 시트를 눈으로 확인. 추가 리디자인 없음.
- `npm test`: **81/81 통과**. `npm run check`, `git diff --check`: 통과.
- `npm run build:site`: **94파일 생성**. 새 매니페스트와 21 PNG가 원본과 바이트 일치. 빌드 결과 `dist/`는 파생 출력이며 ZIP에 중복 포함하지 않음.
- Chrome 152 / 1440×900: 로딩 → START → 하강 → 중립 → 상승 → 중립 → 발사 → 일시정지·재개 확인. 실제 렌더 호출에서 00–20 모든 프레임 관측. 콘솔·페이지·네트워크 오류 0.
- Chrome 844×390 모바일 에뮬레이션: 게임·SV-01 표시와 터치 조작 UI 확인. 모바일 실기 검증은 아님.

## 유지·남은 제한

기존 `src/game.js`, 무기·피격·난이도·이동·오디오·배경·기존 아트 파일은 바이트 그대로 유지했습니다. 본체용 R4 원본도 보존했습니다. 기존 궤적·광원·무기·드론 효과를 수정하지 않았으며 본체 PNG에 새 이펙트를 합성하지 않았습니다.

모바일 실기, 다른 브라우저/GPU, 장시간 플레이 성능은 미검증입니다. 공개 배포·커밋·푸시는 수행하지 않았습니다. 추가 영상/GIF/QA 웹페이지를 만들지 않았습니다.
