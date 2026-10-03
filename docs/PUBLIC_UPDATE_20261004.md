# SkyWind prototype-17-final-hud 배포·백업 기록

기준일: 2026-10-04 KST. 사용자가 지정한 `prototype-17-final-hud/dist/index.html`을 기존 공개 사이트와 GitHub에 반영하는 작업이다. 게임 코드·규칙·자산의 추가 튜닝은 하지 않았다.

## 대상과 동일성

- 선택된 로컬 실행본: `.work/6h-feedback-20261003/prototype-17-final-hud/dist`.
- 편집 가능한 동결 소스: `.work/6h-feedback-20261003/checkpoint-17-final-hud/source`.
- 실행 233파일, 58,021,489 bytes, 집계 SHA256: `2138373d7fecd78610daf6684d1528c3d3b34b5185faf1bbef21f946c646fd5f`.
- 집계 방식: UTF-8 코드 순서의 `상대경로 + NUL + 파일 SHA256 + LF`를 SHA256으로 계산.
- 새 GitHub 백업용 소스에서 `npm run build:site`로 재생성한 233파일과 게시 준비 파일이 원본 실행본과 각각 바이트 단위로 일치했다.
- 기존 GitHub의 문서 정리 커밋 `8f9277c`와 로컬 제작 이력 `5d60b99`를 병합했다. 기존 root 및 제작 checkout의 미커밋 변경과 이전 후보는 그대로 보존했다.

## 게시 상태

기존 Sites 공개 사이트 업데이트 및 GitHub main 백업을 진행 중이다. 성공 결과는 아래에 후속 기록한다. 새 사이트·터널·공개 범위 변경은 없다.

## 백업 내용과 다른 환경 실행

소스·테스트·빌더·기존 및 새 실행 자산을 루트의 정상 경로에 반영했다. `.work`가 없는 다른 환경에서도 실행과 빌드가 가능하다.

```sh
git clone https://github.com/Kexxrix/skywind.git
cd skywind
npm start
```

Node.js와 하드웨어 가속/WebGL 2를 지원하는 브라우저를 사용한다. 현재 npm 런타임 의존성은 없어 설치 단계가 필요하지 않다. 기존 checkout에서는 미커밋 작업을 먼저 보존하고 실제 원격 차이를 확인한다. 현재 문서는 `AGENTS.md` → `STATE.md` 순서로 읽는다.

새 채택 메카닉의 편집 원본도 포함했다.

| 보관 경로 | 내용 |
|---|---|
| `assets/art/mecha-12h-local/source/frozen-final-adoption-v1/` | 기존 최종 일반기·보스 원본 패키지, 266파일 / 44,319,956 bytes |
| `assets/art/mecha-6h-local/source/frozen-five-boss-v2/` | 새 5보스·자식 기체 원본 패키지, 262파일 / 65,175,436 bytes |

두 패키지의 Blender·PNG·생성 스크립트·원장을 원래 구조로 보존했다. 현재 활성 메카닉 PNG 123개가 위 원본과 일치한다. 일부 과거 제작 스크립트의 원래 PC 경로는 역사 기록이며, 새 환경에서 Blender 재생성 시 입력/출력 경로를 맞춰야 한다. 게임 실행과 정적 빌드는 그 경로에 의존하지 않는다.

제공 사운드는 기존 `RIGHTS_STATUS.md`의 사용자 공개 권한 확인과 provenance를 유지한다. `.work`, `.env`, 인증정보, 임시 터널, 원시 QA 영상은 백업/공개 실행물에 포함하지 않는다.

## 이번 검증

- `npm test`: 437/437 통과, 실패·취소·건너뜀 0, 약 16.65초.
- `npm run check`: 19모듈 구문 검사 통과.
- `npm run build:site`: 233파일 / 55.33 MiB 생성, 사운드 승인·편집본 및 메카닉 해시 검사를 포함해 통과.
- 선택 원본 / 재현 빌드 / 게시 준비본의 모든 파일 SHA256·크기·집계값 일치.
- `git diff --cached --check`: 실제 게임 코드·테스트·빌더와 이번 문서 변경은 통과했다. 보존 복사한 과거 제작 Python 2개와 과거 현황 보고서 1개의 끝 빈 줄 경고는 원본 바이트 보존을 위해 남겼다. 병합 충돌 표시는 모두 해소했다.
- 기존 정확한 HUD 후보의 실제 Chrome 낮밤·desktop/portrait 4조건, 이동/복원 173표본의 QA 기록을 보존했다. 이번 배포를 위해 새 장시간 플레이·녹화는 하지 않았다.

식별 원장과 과거 QA 영수증은 [releases/prototype-17-final-hud](releases/prototype-17-final-hud/)에 있다. 그 안의 로컬 경로와 당시 `pending` 문구는 작성 시점의 증거이며 최신 배포 결과가 아니다. 이번 복제·재빌드 대조는 `RELEASE_BYTE_EQUIVALENCE.json`을 따른다.

## 남은 검토와 미변경 범위

지속 압박 목표, 정상 native 60초 생존, 사람의 난도·재미/최종 미감, 직접 청음, 실물 모바일 정량 성능은 합격으로 확대하지 않는다. 기존 QA에서 확인된 조건 내 HUD 가림 해소와 자동 검사 통과만 근거로 유지한다. 이번 작업은 지정 버전의 게시·백업이며 추가 구현은 하지 않았다.

이전 제작 상태·결정의 원문은 `docs/history/LOCAL_STATE_20261003.md`, `LOCAL_DECISIONS_20261003.md`에 당시 기록으로 보존했다. 과거 시간 예산·미게시 조건·로컬 `.work` 경로는 새 작업을 자동 재개하거나 이번 게시 승인을 취소하는 지시가 아니다.
