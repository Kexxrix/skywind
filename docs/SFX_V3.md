# SkyWind 효과음 V3

2026-09-06. 발사·명중·폭발의 주요 소리를 실제 녹음과 공개 CC0 샘플을 조합한 WAV로 교체했다. 승인된 Lyria V2 BGM 6곡과 `assets/audio/manifest.json`은 변경하지 않았다.

## 출처와 라이선스

| 제작자 / 묶음 | 공식 안내·배포 출처 | 사용한 소재 | 라이선스 보존 위치 |
|---|---|---|---|
| Kenney / Sci-fi Sounds 1.0 | [공식 다운로드 페이지](https://kenney.nl/assets/sci-fi-sounds) | 에너지 질감, 폭발 crunch, 저역 폭발, 금속 공명, force field | `assets/audio/sfx-v3/source/sci-fi/License.txt` |
| Kenney / Impact Sounds 1.0 | [공식 다운로드 페이지](https://kenney.nl/assets/impact-sounds) | 금속·판금·유리·충격 foley | `assets/audio/sfx-v3/source/impact/License.txt` |
| Ben Jaszczak 및 Free Firearm Sound Library 제작팀 | [프로젝트/CC0 안내](https://opengameart.org/content/the-free-firearm-sound-library), [보존 미러](https://github.com/buddingmonkey/FreeFirearmsSFXLibrary) | AK-47 근거리 녹음 `C_28P.wav`, AR-15 근거리 녹음 `D_32P.wav` | `assets/audio/sfx-v3/source/firearms/LICENSE.txt` |

모두 CC0로 배포된 자료다. Kenney 파일은 공식 사이트에서 ZIP을 내려받았다. Free Firearm Sound Library의 과거 홈페이지는 이번 브라우저 검색에서 열리지 않아, OGA의 프로젝트·라이선스 안내와 공개 미러의 CC0 파일을 확인한 뒤 미러의 고정 commit에서 두 원본 WAV를 받았다. 원본 ZIP, 추출한 원본 파일, 미러 파일 목록과 제작팀의 녹음 메타데이터를 `source/`에 보존한다. 상세 URL·해시는 `source/provenance.json`에 기록했다. 기존 합성 구현도 `source/audio-v2-original.js`에 보존했다.

## 소리 구성

| 이벤트 | 게임용 샘플 | 구성과 역할 |
|---|---|---|
| 기본 발사 | `shot-01`~`03.wav` | 서로 다른 실제 AK-47 발사 구간 3개. 짧은 금속 작동음과 작은 에너지 질감을 더함. 190ms 길이로 연사 사이에 긴 꼬리가 쌓이지 않음. |
| SPREAD | `spread-01`~`02.wav` | 실제 총성 두 층을 14ms 간격으로 겹쳐 넓은 공격감을 표현. 낮은 충격 몸통을 추가. |
| LANCE | `lance-01`~`02.wav` | 실제 AR-15 발사, 느린 금속 공명과 조금 긴 에너지 꼬리. |
| HELIX | `helix-01`~`02.wav` | 빠른 총성, 28ms 뒤의 두 번째 금속 질감. |
| 적 발사 | `enemy-01`~`02.wav` | 플레이어 무기보다 낮고 작은 에너지·충격 조합. |
| 적 명중 | `hit-01`~`03.wav` | 짧은 금속 접촉과 공명. 주파수 대역을 높여 발사·폭발과 구분. |
| 플레이어 피격 | `player-hit.wav` | 판금 충돌, 둔한 파열, 뒤따르는 작은 유리 조각. |
| 일반 폭발 | `explosion-01`~`03.wav` | 총성의 빠른 앞부분, crunch, 별도 저역 몸통, 시간차 판금·유리 파편. 1.13~1.25초. |
| 보스/플레이어 파괴 | `explosion-heavy.wav` | 명확한 첫 충격, 긴 파열, 160~390ms 뒤 이차 충격·파편. 2.25초. |
| 장비 획득 | `charge.wav` | force-field와 작은 금속 걸쇠음. 기존 짧은 UI 음표를 작게 함께 사용. |

20개 파일은 44.1kHz / mono / PCM 16-bit WAV이며 총 912,626바이트다. 재생 시 이벤트의 가로 위치에 따라 약하게 패닝한다. 같은 이벤트는 샘플을 순환하고 재생 속도·레벨을 작게 변화시키며, 게임의 난수 상태에는 관여하지 않는다.

파형을 확인해 녹음 앞의 대기 구간을 자르고 1ms 미만의 가장자리 처리와 짧은 끝 페이드를 적용했다. 오디오 시작 위치는 진폭 0.01 기준 최대 1.973ms다. 샘플 peak는 0.84로 맞췄다. 큰 폭발에서 저역이 과도하게 우세했던 첫 믹스는 다시 조정해, 최종 heavy 폭발의 250Hz 이하 에너지 비율은 약 44.0%다. 음량을 올리는 방식으로 해결하지 않았다.

원본 선택·필터·레이어·시간차·출력 과정은 [`design_samples.py`](../assets/audio/sfx-v3/design_samples.py)에 있다. `python assets/audio/sfx-v3/design_samples.py`로 재생성할 수 있다. 이 작업에 쓰는 numpy와 ffmpeg는 자산 제작용이며 게임의 의존성이 아니다. 개별 파일의 길이·peak·RMS·시작 위치·주파수 에너지·해시는 [`sample-analysis.json`](../assets/audio/sfx-v3/sample-analysis.json)에 기록했다.

[`sample-waveforms.png`](../assets/audio/sfx-v3/sample-waveforms.png)는 위에서부터 기본 발사, LANCE, 일반 폭발, 큰 폭발의 최종 파형이다. 각 행의 시간축은 해당 샘플 전체 길이로 정규화되어 있다. [`audition.wav`](../assets/audio/sfx-v3/audition.wav)는 기본 발사 3종 → SPREAD → LANCE → HELIX → 적 발사 → 명중 → 플레이어 피격 → 일반 폭발 → 큰 폭발 → 획득 순의 확인용 파일이다.

## 재생 구현

변경 코드는 `src/audio.js`에 한정한다. 기존 `AudioDirector`의 `playEvent`, `unlock`, 음악 상태 전환, 음소거, 일시정지 API를 유지한다. `effectsReady` getter를 추가했다.

- 생성자에서 WAV 20개를 비동기로 미리 가져오고 사용자 시작 입력의 `unlock()`에서 `AudioBuffer`로 디코딩한다. 디코딩 전에 생긴 효과음 이벤트는 지연 재생하지 않는다. 로드 오류는 `error`에 기록하며 재활성화 시 재시도한다.
- 전투 이벤트는 사전 믹스된 샘플 하나를 재생한다. 전투용 oscillator/white-noise 생성은 제거했고, 획득·보스 알림·종료의 짧은 UI 음표만 합성으로 남겼다.
- 샘플 보이스는 최대 24개. 그룹 제한은 플레이어 발사 5, 적 발사 4, 명중 5, 일반 폭발 6, 중요한 피격/파괴 2, 장비 획득 2개다. 전체 한도에서는 낮은 우선순위의 오래된 보이스부터 교체한다.
- 교체된 꼬리는 12ms로 페이드하며 추가 release 소스는 최대 4개다. 종료한 노드는 해제한다. 이 샘플 보이스 수에는 별도의 짧은 UI 음표 oscillator가 포함되지 않는다.
- 효과음 gain 0.7 → compressor(-9dB, ratio 4, attack 1ms, release 80ms) → 작은 신호를 그대로 통과시키는 출력 제한을 사용한다. 기존 음악 볼륨 0.28과 1.2초 crossfade는 유지한다.

## 검증

`node --check src/audio.js` 통과. 원본에서 최종 WAV 20개를 생성하고 전체 PCM 디코딩·길이·해시를 검사했다. 기존 V2 음악 6곡은 기존 검증 문서의 SHA-256과 모두 일치한다.

Chrome의 별도 QA 탭에서 실제 `AudioDirector`를 불러 검증했다. 게임의 실제 START 버튼 클릭 후 20/20개 샘플의 준비 상태, 기존 `normal-v2.m4a` 연결, 오류 없음도 확인했다. QA 탭은 닫았으며 최고점수·음소거 저장값은 바꾸지 않았다. 두 QA 탭의 console error/warn은 0개였다.

| 실제 WebAudio OfflineAudioContext 렌더 | peak | 클리핑 / 비정상 값 | 결과 |
|---|---:|---:|---|
| 단일 기본 발사 | 0.3020 | 0 / 0 | 정상 |
| 단일 큰 폭발 | 0.5587 | 0 / 0 | 정상 |
| 12초 밀집 전투: 65ms 간격 발사·명중·적 발사와 다수 폭발 | 0.6626 | 0 / 0 | 활성 샘플 보이스 최대 19, 종료 후 0 |
| 위 전투 + `normal-v2.m4a` 60초부터 12초, 기존 볼륨 0.28 | 0.8080 | 0 | 음악을 포함한 합산 정상 |
| 600개 샘플 요청의 보이스 교체 스트레스 | 0.6494 | 0 | 활성 최대 24, release 최대 4, 종료 후 0 |

실시간 AudioContext에서도 50ms 간격 70틱 동안 연사·명중·폭발을 재생했다. 신호를 analyser까지 흘리고 최종 출력만 0으로 두어 다른 작업의 음악과 겹치지 않게 했다. 오디오 시계는 3.491초 진행, 관측 peak 0.6595, 활성 보이스 최대 18, 꼬리 완료 후 0이었다. 일시정지 시 오디오 시계 변화 0, 음소거 시 새 이벤트 차단, 재개 시 running 상태를 확인했다.

이번 도구는 오디오 입력 청취를 지원하지 않아 실제로 들었다고 주장하지 않는다. 파형·주파수 구성·샘플 출처·디코딩·실시간 신호·중첩 출력으로 검증했고, 주관적인 음색 평가는 게임 또는 audition 파일에서 확인할 수 있다. 전체 전투가 어떤 기기에서도 레퍼런스와 같은 음질을 보장한다는 뜻은 아니다.
