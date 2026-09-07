# 최초 GitHub 백업 검증

검증일: **2026-09-07 09:55 KST**, Windows / Node.js **v24.13.1**.

로컬 작업본과 Git 인덱스에서 추출한 깨끗한 사본을 별도로 검사했다. 깨끗한 사본에는 `.work`, `Feedback`, 임시 터널, 기존 `dist`가 없으며 저장소 파일만으로 빌드·서버가 실행됐다. 전체 게임을 다시 녹화하지 않았다.

| 검사 | 결과 |
|---|---|
| 작업본 `npm test` / 깨끗한 사본 `npm test` | 각각 **78/78 통과** |
| 두 사본 `npm run check` | 통과 |
| 두 사본 `npm run build:site` | **72개, 29,027,823바이트** 생성 |
| 기준 런타임 72개 SHA-256 | 소스·사본·빌드가 PATCH2 지문과 모두 일치 |
| 깨끗한 사본 `server.mjs` 실행 후 HTTP 읽기 | `/` 정상, 72개 실행 파일 모두 HTTP 200 및 해시 일치. 검사 서버는 종료 |
| 전체 stage 파일의 바이트 | 508개, 303,993,972바이트가 작업본과 사본에서 일치. 이 결과를 기록하는 검증 문서·JSON 2개는 이후 추가 |
| 사운드 보존 | 제공 원본 67개와 편집본 30개 기존 SHA 일치. 승인 메타데이터만 사용자 확인으로 갱신 |
| 기존 미디어 보존 | PNG 40장과 기존 완료 MP4 1개가 원본 SHA와 일치 |
| 인계 문서 링크 / 별도 문서 검토 | 현재 인계 문서 상대 경로 확인. 역사적 미완료·중간 결과를 완료와 구분 |
| 비밀정보 점검 | 공유 후보 텍스트에서 인증 토큰·비밀번호·개인키 패턴 발견 없음. 음악 제작 문서의 개인 대화 URL 식별자는 제거 |
| 새 인계 파일의 `git diff --cached --check` | 통과. 전체 최초 추가 검사에는 보존한 원문 라이선스 2개와 과거 문서/문법 로그의 기존 공백 경고가 남음. 원본 바이트를 임의 정리하지 않음 |

구조화 결과는 [backup-verification.json](backup-verification.json)에 있다. GitHub 커밋 자체가 최종 백업 식별자이며, 게임 기준 지문은 `5f7d69a37a71d12479cf8bd599905ec912da63998fd66628f980581525644b63`이다.

## 포함 / 제외와 변경 범위

포함: 현재 게임 코드·테스트·도구·제작 원본 포함 assets 전체(Windows desktop.ini 1개 제외), 기존 개발 문서, 새 인계 규칙과 가이드, 사운드 권한 기록, 패치 설계/리뷰 Markdown, PATCH2 증거/전후 화면과 완료된 기존 비교 영상.

신규/갱신 파일: `AGENTS.md`, `HANDOFF.md`, `.gitignore`, `.gitattributes`, `README.md`, 본 검증 문서/JSON, `docs/RIGHTS_STATUS.md`, `docs/patch2/`, `docs/references/`, `assets/audio/sfx-patch1/provenance.json`. 공개 백업의 개인 대화/기계 경로 정리를 위해 `docs/AUDIO_V2.md`, `docs/AUDIO_SOURCES.md`, `docs/ART_SOURCES.md`, `assets/art/leaf-surface-v3.source.json`의 출처 설명만 조정했다. 게임 소스, 실행 이미지/음악/사운드, 규칙, Sites 식별자는 변경하지 않았다.

제외: `.work/`, `Feedback/` 대용량 QA ZIP/원시 녹화, `qa-share-*/`, 외부 참고 영상 `SampleGame.mp4`, 재생성 가능한 `dist/`, 비밀정보와 캐시. 원래 PC의 제외 자료를 삭제하지 않았다. 최초 커밋이므로 이전 파일 변경 이력은 GitHub에 없고, 보존된 과거 문서/전후 화면으로만 과거 상태를 확인할 수 있다.

## 이번에 검증하지 않은 항목

- 다른 물리 PC/OS와 모바일 실기, GPU 성능, 최신 브라우저 화면 재검증.
- 실제 청음·음질/타격감 승인, 장시간 플레이, 미완성 통합 QA ZIP 완성.
- 기존 Sites 공개 버전의 현재 바이트 또는 새로운 배포. GitHub 백업 중 Sites 배포는 실행하지 않았다.
- 모든 바이너리의 내장 메타데이터에 대한 전수 개인정보 검사. 텍스트 감사와 명시 파일 범위 검토를 수행했다.
