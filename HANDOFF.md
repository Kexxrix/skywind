# SkyWind — 다른 환경 / 새 작업 인계

작성 기준: **2026-09-07 KST**. 저장소: <https://github.com/Kexxrix/skywind>, 기본 브랜치 `main`.

이 백업은 최신 **PATCH2 구현본**이다. 게임 소스와 실제 실행 자산, 제작 원본, 테스트, 설계·검토 문서를 포함한다. 최초 GitHub 백업 후 사용자의 별도 지시로 **기존 공개 사이트에도 버전 3 배포를 완료**했다. [2026-09-07 배포 기록](docs/PUBLIC_UPDATE_20260907.md)을 참고한다. 향후 GitHub push가 Sites 자동 배포를 뜻하지는 않는다.

## 다른 PC에서 시작

Git과 Node.js가 필요하다. 최초 백업 검증 환경은 **Node.js v24.13.1 / Windows**다. 같은 24.x 환경을 사용하면 재현하기 쉽다. Chrome/Edge 등 WebGL 2 및 GPU 가속 브라우저가 필요하다. 실행용 npm 의존성이 없으므로 `npm install`은 필요 없다.

```sh
git clone https://github.com/Kexxrix/skywind.git
cd skywind
npm test
npm run check
npm start
```

브라우저에서 <http://127.0.0.1:5173/>을 연다. `file://`로 열지 않는다. 서버를 종료하려면 해당 터미널에서 Ctrl+C를 누른다. 포트 충돌 시 PowerShell은 `$env:PORT='5174'`, macOS/Linux는 `PORT=5174 npm start`를 사용한다. 게임에는 고정된 드라이브 경로나 별도 서버/API 키가 없다. 최고 기록과 음소거 설정은 각 브라우저 localStorage에 남으며 Git으로 동기화되지 않는다.

Blender는 보존된 야자수 원본 재제작에만, Python + NumPy + FFmpeg는 사운드 편집본 재생성에만 필요하다. 일반 게임 실행과 테스트·정적 빌드에는 필요 없다. 제작 스크립트는 `tools/render_foliage.py`, `assets/audio/sfx-v3/design_samples.py`, `assets/audio/sfx-patch1/prepare_sound.py`를 참고한다.

## 회사 / 집 동기화

작업 전 `git status --short --branch`를 보고 로컬 변경이 없으면 `git pull --ff-only`한다. 작업 후 변경 목록을 검토하고 테스트한 뒤 해당 작업을 커밋·푸시한다. 다른 PC에서는 다시 pull한다. GitHub 쓰기에는 각 PC에서 본인의 GitHub 인증이 필요하다. 토큰을 저장소나 문서에 넣지 않는다.

```sh
git status --short --branch
git pull --ff-only
# 요청받은 변경 및 검증 후, 필요한 파일만 stage
git add <변경한-파일>
git commit -m "변경 내용"
git push origin main
```

미커밋 변경이나 브랜치 분기가 있으면 먼저 diff를 확인해 병합한다. `reset --hard`, 강제 푸시, 오래된 공개본 복사로 덮어쓰지 않는다. 최초 백업에는 PC 간 체크아웃 시 SHA-256이 바뀌지 않도록 `.gitattributes`로 자동 줄바꿈 변환을 끈다. 이 저장소에는 이전 작업의 Git 이력이 없고, 최초 백업부터 이력이 시작된다.

## 현재 구현과 검토 상태

2026-09-08 사용자가 **파일럿 HUD FX3를 통과로 승인하고 GitHub 갱신 및 기존 공개 사이트 배포를 요청**했다. [최신 기능·조정값·검증](docs/pilot-ui/FX_REVISION.md)은 10×6px 내부 반동, 적색/청색 오버레이와 실제 시간 맥동이다. 테스트 100개, 실행 빌드 101개 파일. SV-01 ±6° 회전/WebP 최적화도 함께 보존한다. [이번 공개 반영 상태](docs/PUBLIC_UPDATE_PILOT_20260908.md)를 확인한다. 제공 원본·참고 PNG 9개는 `assets/art/pilot/source/`에 바이트 그대로 백업했고 `Temp/`는 기계별 작업 폴더로 제외한다.

- 런타임 식별자: **SKYWIND-PATCH2-LOCAL-20260906-R1**
- 확정 시각: **2026-09-06T22:22:37.087618+09:00**
- 72개 실행 파일, 29,027,823바이트. 지문: `5f7d69a37a71d12479cf8bd599905ec912da63998fd66628f980581525644b63`
- 전체 개별 해시: [runtime-version.json](docs/patch2/evidence/runtime-version.json). 이번 백업에서는 게임 소스·실행 자산 바이트를 수정하지 않는다.
- [현재 패치 상태와 남은 QA](docs/patch2/STATUS.md), [실제 전후 화면](docs/patch2/SCREENSHOTS.md)을 우선 읽는다. `docs/`의 V1/V2/V3/PATCH1 보고서는 과거 기록이며 최신 상태를 대신하지 않는다.

PATCH2는 구름 중간 형태·깊이·가로줄, 근경 구름의 과도한 광원 색 번짐, 최저 고도 수목의 전투 레이어 가림을 보완했다. 플레이어의 피해 반경을 17에서 선명한 핵 **1.85**로 맞추고 빠른 상대 이동을 검사한다. 아이템 획득 여유는 유지한다. 일시정지·음소거·게임오버·재시작에서 효과음 잔류와 비동기 종료 경합도 수정했다.

이전 작업의 전체 테스트는 **78/78 통과**다. 구름·광원·충돌 스크린샷과 일부 실제 브라우저 관측은 있으나 **최종 통합 QA ZIP은 미완성**이다. 오디오 직접 청음, 최종 합성 음질, 다른 PC/모바일 실기 성능과 전체 아트 승인은 미검증이다. 완료된 기존 무기 비교 영상 하나만 보존했으며, 추가 촬영은 하지 않았다.

핵 축소 후 동일한 비반응형 입력의 20시드×120초 실험에서 생존이 4/20→18/20, 평균 최종 HP가 3.9→38.2로 증가했다. 사람의 체감 검증이나 후반 적정 난이도 승인은 아니다. 적의 수·탄속·패턴·HP·피해량을 보상적으로 올리지 않았다.

## 우선순위와 작업 한계

1. 현재 구현을 실행하고 미완료 검토를 **짧은 스크린샷·테스트** 중심으로 확인한다. 장시간 녹화 작업을 다시 시작하지 않는다.
2. 구름 근접면의 큰 덩어리와 부드러운 표면은 추가 아트 검토가 남았다. 원본 영상과 동일한 품질로 완료했다고 간주하지 않는다.
3. 사운드의 DRONE 변주 간 RMS 차이는 약 4.332dB다. 자연스러운 강약인지 불필요한 튐인지는 직접 청음 후 판단한다. 수치만으로 다시 정규화하지 않는다.
4. 지정 무기 교체·시간 연장·고도별 보급 예고·흡수 아이템은 **다음 패치로 보류**다. 이번 보완 리뷰가 끝나기 전에 구현하지 않는다.
5. 세부 유지 조건과 녹화 원칙은 [AGENTS.md](AGENTS.md)를 따른다.

## 주요 파일 / 참고 자료

| 파일 | 역할 |
|---|---|
| `src/game.js` | 게임 규칙, 월드 좌표, 난이도, 중앙점 충돌, 아이템 |
| `src/renderer.js` | 2D 전투·광원·중앙 핵 표시·배경 합성 |
| `src/volume-environment.js`, `src/terrain3d.js` | WebGL 2 볼륨 구름·숲·깊이 |
| `src/presentation.js`, `src/main.js` | 무기 공통 색·HUD·입력·화면 상태 |
| `src/audio.js` | 단발 변주, 무기×적 명중, 고정 피격음, 종료 상태 |
| `tests/` | 게임·난이도·무기/비행·오디오·중앙점 회귀 |
| `assets/` | 런타임 자산, 생성 원본, 이전 자산, Blender 파일, 출처 |
| `docs/references/patch1-design/` | 사용자 제공 설계 README / PATCH_DESIGN / SOUND_CATALOG |
| `docs/references/patch1-review/REVIEW.md` | PATCH2 입력 리뷰 |
| `docs/references/initial-feedback.md` | 초기 외부 QA 피드백 |
| `docs/patch2/` | 이번 백업에 보존한 실제 패치 검토 자료 |

설계·리뷰 문서는 참고 입력이다. 이후 사용자의 직접 지시가 우선한다. 문서의 상대 경로는 원래 ZIP 구조를 가리키기도 한다. 사운드 원본은 실제로 `assets/audio/sfx-patch1/source/`에, 편집본은 `edited/`에 있다.

## 사운드 권한 / 공개 배포

최신 공개본은 **2026-09-07 23:00 KST의 버전 4**로, SV-01 21단계 뱅크·자체 회전 ±6°·192px WebP를 반영했다. [SV-01 배포 기록](docs/PUBLIC_UPDATE_SV01_20260907.md)을 먼저 확인한다. 아래 버전 3 설명은 이전 배포 이력이며, 이번 수정은 GitHub에 아직 커밋·푸시하지 않았다.

사용자가 **2026-09-07 제공 사운드의 공개 사용 권한을 확인했고 공개 저장소 전체 백업을 승인**했다. 이 확인을 현재 provenance에 기록했다. 독립적인 라이선스 검증이나 청음 승인을 한 것은 아니다. 과거 문서의 '권한 미확인'은 당시 기록이며 현재 권한 상태는 [RIGHTS_STATUS.md](docs/RIGHTS_STATUS.md)가 우선한다.

`npm run build:site`는 현재 허용된 101개 실행 파일만 `dist/`에 생성한다. 제공 사운드 승인 기록과 30개 편집본의 SHA를 검사한다. 원본·문서·테스트는 게임 배포 산출물에 넣지 않는다. `prepare_sound.py`를 다시 실행하면 안전한 기본값으로 승인 기록이 초기화되므로, 새 산출물의 출처와 기존 사용자 승인 적용 범위를 대조한 후 메타데이터를 갱신한다.

기존 공개 게임: <https://skywind.kexxadrix.chatgpt.site/>. **2026-09-07 10:03 KST, 버전 3에 현재 PATCH2 런타임 72개를 배포했다.** 익명 HTTP에서 71개는 바이트 일치, HTML은 Cloudflare 삽입 스크립트를 제외한 앱 내용의 정확한 일치를 확인했다. 새 브라우저 플레이/직접 청음 검증은 하지 않았다. `.openai/hosting.json`의 기존 project_id와 `dist` 설정은 보존한다. Sites 전용 과거 `.work/sites-source`는 유지하고, 최신 배포에는 `.work/sites-deploy-20260907` 사본을 사용했다. 두 사본 모두 GitHub에서 제외하며 다른 PC에서 추후 배포할 때는 기존 Sites 접근 권한으로 연결해야 한다.

## 백업에서 제외한 것

- `.work/`: 이전 비교용 소스 사본, 원시 프레임·오디오·임시 도구, 로그, Sites 별도 체크아웃.
- `Feedback/`의 대용량 이전 QA ZIP/녹화, `qa-share-20260906/`와 터널 실행 파일.
- `SampleGame.mp4`: 원래 사용자가 준 외부 참고 영상. 게임 실행 자산이 아니며 공개 저장소에는 올리지 않는다. 새 환경에서 원본 비교가 필요하면 기존 PC의 이 파일을 별도로 옮긴다. 기존 분석 문서는 포함했다.
- `dist/`: `npm run build:site`로 재생성한다. `.env`, 인증정보, 캐시와 편집기별 설정도 제외한다.

위 자료는 원래 PC에서 삭제하지 않았다. `assets/audio/source/`의 음악 생성 MP4 원본은 임시 녹화가 아니므로 **전부 포함**했다. 원시 QA 자료를 재제작하거나 장시간 녹화해야 실행되는 프로젝트가 아니다.

## 새 작업에 붙여 넣을 메시지

> 이 저장소의 SkyWind 작업을 이어가라. 먼저 AGENTS.md, README.md, HANDOFF.md, docs/patch2/STATUS.md를 읽고 git status와 원격 차이를 확인해라. 최신 로컬 PATCH2를 오래된 공개본으로 덮어쓰지 마라. npm test와 npm run check를 확인한 뒤 현재 미완료 QA를 짧은 스크린샷과 상태 관측으로 검토해라. 기본적으로 영상 녹화는 하지 마라. 직접 청음하지 않았으면 음질 검증 완료라고 쓰지 마라. 새 아이템 시스템과 보상적 난이도 상향은 아직 보류다. 내가 요청한 후속 변경만 실제 구현하고 GitHub push와 Sites 배포는 요청 범위를 구분해라.
