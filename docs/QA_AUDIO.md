# SkyWind 오디오 피드백 수정·검증

2026-09-06. 범위: `Feedback/Skywind_Codex_Feedback.md` 0·4·5의 오디오. 기존 `AudioDirector`, WAV 20개, 음악 6곡을 사용했다. 신규 사운드 다운로드·파일 변환·플러그인·라이브러리 추가는 하지 않았다. 실제로 소리를 들은 평가나 사용자 청음 승인을 완료한 것으로 취급하지 않는다.

## 수정 전 확인값

`src/audio.js`와 `src/game.js`를 직접 읽었다. 생성자에서 20개 WAV를 가져오고 시작 조작의 `unlock()`에서 디코드하며 `_buffers`에 캐시한다. 발사 시 fetch하지 않는다. 음악은 HTMLAudioElement 두 deck에서 상태별 파일을 전환한다. 음악 볼륨 **0.28**, smoothstep crossfade **1200ms**, ending 외 반복 재생이다. 효과음은 별도 Web Audio 경로이며 마스터 **0.7** → 기존 compressor(-9dB, knee 6, ratio 4, attack 1ms, release 80ms) → 기존 WaveShaper를 사용한다.

| 실제 기존 이벤트 | 재생 그룹 / 파일 | 소스 gain / priority | 오디오 재생 간격 |
|---|---|---:|---:|
| `shot`, powered=false | shot-01~03 | 0.52 / 3 | 40ms |
| `shot`, powered=true | spread-01~02, lance-01~02, helix-01~02 | 0.58 / 3 | 40ms, 동일 shot 키 |
| drone의 보조 발사 | 발사 이벤트 없음 | 없음 | 없음 |
| `enemyShot` | enemy-01~02 | 일반 0.19, 보스 0.31 / 1 | 100ms |
| `hit`, player=false | hit-01~03 | 0.25 / 2 | 55ms |
| `hit`, player=true | player-hit | 0.65 / 5 | 55ms, 적 명중과 다른 키 |
| `explosion`, 일반 적 | explosion-01~03 | 0.68 / 4 | 65ms |
| `explosion`, boss 또는 player | explosion-heavy | 보스 0.92, 플레이어 0.80 / 5 | 65ms, 각각 다른 키 |
| `pickup`, power 또는 drone | charge + UI 음표 4개 | 0.34 / 5, 음표 0.075 | 80ms |
| `pickup`, health | UI 음표 4개 | 음표 0.075 | 80ms |
| `boss` | sawtooth+sine 3쌍 | 각 0.13 | 80ms |
| `bossDefeated` / `gameover` | triangle 음표 각 4개 | 0.10 / 0.11 | 80ms |

기존 모든 샘플과 UI 음표는 하나의 효과음 gain으로 들어갔다. 샘플 발음 상한은 총 **24**, 그룹별 shot 5 / enemy 4 / hit 5 / explosion 6 / critical 2 / ui 2였다. 도난된 꼬리는 12ms release를 두고 최대 4개를 추가 허용했다. 기존 UI oscillator는 샘플 발음 수에 포함되지 않았고 별도 상한도 없었다. 발사 priority 3이 적 명중 2보다 높았다. 무기별 명중은 구분하지 않았으며 경고·만료 큐도 없었다.

기존 실제 게임 이벤트는 `firePlayer()` 한 호출당 shot 1회다. 기본탄 2발, SPREAD 5발, LANCE 3발, HELIX 4발을 각각 생성하지만 발당 반복 오디오를 호출하지 않는다. 기본 발사 주기는 95ms, 강화는 85ms다. 플레이어 hit는 `damagePlayer()`에서 실제 HP가 감소한 뒤, explosion은 실제 적 파괴에서 발생한다. 오디오 throttle은 데미지·충돌 상태에 접근하지 않는다.

## 보존한 자산과 출처

20개 WAV의 SHA-256이 기존 `assets/audio/sfx-v3/sample-analysis.json`과 모두 일치함을 이번 작업에서 재검사했다. 아래 길이/peak/RMS는 그 해시와 일치하는 자산의 기존 측정 기록이다. 새 청음 판정으로 작성한 값이 아니다. WAV는 mono / 44.1kHz / PCM 16-bit다.

| 기존 파일 | 원본 길이 | 저장된 peak | 저장된 RMS 범위 |
|---|---:|---:|---:|
| shot-01~03 | 190ms | 0.84 | 0.08137~0.10602 |
| spread-01~02 | 250ms | 0.84 | 0.09159~0.10109 |
| lance-01~02 | 386ms | 0.84 | 0.06246~0.06489 |
| helix-01~02 | 225.4~260.8ms | 0.84 | 0.07338~0.07684 |
| enemy-01~02 | 260ms | 0.84 | 0.16440~0.17518 |
| hit-01~03 | 184ms | 0.84 | 0.07878~0.11510 |
| player-hit | 515ms | 0.84 | 0.13634 |
| explosion-01~03 | 1127.2~1250ms | 0.84 | 0.11751~0.13553 |
| explosion-heavy | 2250.2ms | 0.84 | 0.07024 |
| charge | 550ms | 0.84 | 0.17458 |

원본·출처는 이미 저장된 다음 파일로 확인했다. 기존 WAV의 제작 레이어·정확한 소스 파일과 변환은 `assets/audio/sfx-v3/design_samples.py`, URL·원본 해시는 `assets/audio/sfx-v3/source/provenance.json`을 유지한다.

| 제작자 / 묶음 | 저장된 출처 | 저장된 라이선스 |
|---|---|---|
| Kenney / Sci-fi Sounds | https://kenney.nl/assets/sci-fi-sounds | `assets/audio/sfx-v3/source/sci-fi/License.txt`: CC0 |
| Kenney / Impact Sounds | https://kenney.nl/assets/impact-sounds | `assets/audio/sfx-v3/source/impact/License.txt`: CC0 |
| Ben Jaszczak 및 Free Firearm Sound Library 팀 | https://opengameart.org/content/the-free-firearm-sound-library / 보존 미러 https://github.com/buddingmonkey/FreeFirearmsSFXLibrary | `assets/audio/sfx-v3/source/firearms/LICENSE.txt`: CC0 1.0 |

총성 원본은 미러 commit `beb2f4041f3d6740fa0aeaf0e71159bd65a78c1b`의 AK-47 `C_28P.wav`, AR-15 `D_32P.wav`다. 이번 작업에서는 새로운 다운로드나 웹상의 라이선스 상태 재조사를 하지 않았다. Sounds Resource의 기존 게임 음원은 사용하지 않았다.

음악 파일·매니페스트의 수정 전 SHA-256:

| 파일 | SHA-256 |
|---|---|
| manifest.json | 9fd4c92cb6287ba99313bb419986f438e7685f5c67cf1280aa49877565296faa |
| title-v2.m4a | 67ba85ff085f4943e1932b9bbc8c8696b54e28ad5c3d710a2e1d08b4d03ddc89 |
| normal-v2.m4a | 3e2361eec40e3f896a1640f81f2674daaa946ec8608f183c796fcbab43e11901 |
| danger-v2.m4a | 703b82f9cb33dc2816bf5098f4fb5e9468b3edc13a86ac98a444ee07c01ec47f |
| boss-v2.m4a | c3538c185e06bab6dc963aadab490c321c7b145983b1ec30bed393300d35baab |
| powerup-v2.m4a | 5d4cebf981b8cd003afb4c98c2686f93e7c8b5bd20acc26fbc087ab6f8625aa7 |
| ending-v2.m4a | 4b097e75d8e8672d3cbcc6ed0649915ab691aecca591d6849185a83b098c2529 |

## 현재 믹스

음악 deck과 그 볼륨·전환 코드는 보존했다. 기존 하나의 AudioContext 안에서 효과음 경로만 shot **0.78**, impact **0.94**, UI **0.92**로 나눴다. 각 버스는 기존 effects 0.7에 연결한다. 음악은 기존 독립 경로를 유지한다. 컴프레서·WaveShaper의 값도 변경하지 않았다.

| 실제 탄환 종류 | 발사 그룹 | 발사 source gain / rate / 최대 길이 | 적 명중 source gain / rate / 최대 길이 |
|---|---|---|---|
| normal | shot | 0.43 / 1.06 / 125ms | 0.28 / 1.05 / 105ms |
| spread | spread | 0.47 / 1.00 / 180ms | 0.28 / 0.92 / 130ms |
| lance | lance | 0.46 / 1.00 / 230ms | 0.31 / 1.30 / 150ms |
| helix | helix | 0.44 / 1.07 / 180ms | 0.27 / 1.15 / 100ms |
| drone | shot | 0.25 / 1.42 / 80ms | 0.19 / 1.50 / 75ms |

명중은 모두 기존 hit-01~03의 짧은 금속 접촉을 사용하되 실제 탄환 종류에 따라 음높이와 길이를 다르게 한다. rate에는 기존 결정적 변주 `[1, 1.025, 0.98, 1.01]`, source gain에는 `[1, 0.95, 1.02, 0.97]`도 적용된다. 표의 gain은 버스/마스터 이전 값이다. 파일은 자르지 않고 소스 gain의 마지막 25ms를 release해 예약 종료한다. LANCE는 실제 펄스 사격이므로 루프 음원을 만들지 않았다.

- 적 발사: source gain 일반 0.17 / 보스 0.27, 최대 200ms, priority 1.
- 주 무기 발사: priority 2, 드론 priority 1. shot 버스를 공유한다. 주 무기와 드론은 별도 재생 간격 키를 쓰므로 같은 프레임의 한 쌍이 서로 차단하지 않는다. 드론은 꽉 찬 주 무기 발음 그룹을 밀어내지 않는다.
- 적 명중: priority 3, 65ms 간격은 소리에만 적용한다. 명중 시 발사 버스를 기준의 82%로 35ms 낮춘다.
- 적 일반 파괴: source gain 0.56, 최대 720ms, priority 4, 75ms 간격. 발사 버스를 67%로 90ms 낮춘다.
- 플레이어 피격: 고유 player-hit 샘플, source gain 0.66, priority 6. 발사 버스를 32%로 180ms 낮춘다. 일반 명중과 별도 간격 키를 사용한다.
- 보스/플레이어 파괴: 기존 heavy 샘플, source gain 0.80/0.76, priority 6. 발사 버스를 40%로 200ms 낮춘다.
- 획득: 기존 상승 4음 모티프와 charge(source gain 0.30, priority 5). 발사 버스를 48%로 220ms 낮춘다. health는 기존처럼 charge 없이 모티프만 재생한다.
- duck 진입은 8ms, 복귀는 100ms다. 기존 강한 player-hit duck 동안 작은 hit가 들어와도 약한 값으로 덮어쓰지 않는다. 음악 gain에는 duck을 적용하지 않는다.

현재 샘플 활성 상한 **20**, 그룹별 shot 4 / enemy 3 / hit 4 / explosion 4 / critical 3 / ui 2, release 등록 상한 **4**다. 같은 그룹 내에서도 낮은 priority부터 교체한다. UI oscillator는 예약된 음을 포함해 **12개** 상한을 둔다. 끝난 소스·gain·pan은 해제한다. 게임 난수, HP, 충돌, 탄환 수, 데미지 빈도는 이 코드에서 변경하지 않는다.

## 게임과의 이벤트 계약

| 이벤트 | 필요한 실제 상태 | 오디오 동작 |
|---|---|---|
| `shot` | `weaponMode` normal/spread/lance/helix/drone, `drone`, `powered`, 위치 | 주 무기 volley 1회, 보조 드론 쌍 1회당 각 샘플 하나 |
| `hit` | 적 명중은 충돌 탄환의 `weaponMode`와 `drone`; 플레이어는 `player:true` | 현 플레이어 무기 상태를 다시 조회하지 않음 |
| `pickup` | 기존 `pickupType`/`itemType` | 기존 상승 큐 |
| `weaponWarning` | `slot:'weapon'|'drone'`, 만료할 `weaponMode` | weapon 660Hz / drone 740Hz에서 살짝 하강, 130ms, source gain 0.035 |
| `weaponExpired` | 같은 slot/weaponMode | weapon 440Hz / drone 494Hz에서 72%로 하강, 190ms, source gain 0.035 |

경고·만료 발생 시점과 회수는 게임 시뮬레이션이 정한다. 오디오 쪽에 별도 무기 타이머·반복 큐·wall-clock 만료 상태를 만들지 않았다. slot별 간격 키를 사용하므로 무기/드론의 같은 프레임 만료가 누락되지 않는다. 정상적인 경고는 3초 경계 통과 시 1회, 만료 시 1회 발생해야 한다. 오디오의 80ms throttle은 잘못된 중복 요청에 대한 짧은 방어일 뿐, 일회성 게임 상태를 대신하지 않는다.

새 루프가 없으므로 교체·만료·사망에서 중지해야 할 무기 루프도 없다. 일시정지는 기존 AudioContext suspend와 음악 pause를, 재개는 같은 Context와 캐시를 사용한다. 음소거·일시정지 중 새 이벤트를 나중에 지연 재생하지 않는다.

## 개발용 A/B와 검증

`npm start` 후 [오디오 비교 페이지](http://127.0.0.1:5173/Feedback/audio-review.html)를 연다. 게임의 최고점수·음소거 저장값은 변경하지 않는다. 이 페이지는 공개 빌드 목록에 추가하지 않았다.

1. **오디오 준비**: 20/20 decode와 오류 여부를 표시한다. 음악은 처음에는 재생하지 않는다.
2. **A/B/C 듣기**: A는 이 수정 전의 `_tone`, `_retireVoice`, `_sample`, `playEvent`를 복사한 기준이다. 정지 버튼을 위한 oscillator 추적만 추가했다. B는 현재 `src/audio.js`를 직접 import한다. C는 같은 WAV의 다른 rate/gain/길이 후보로, 게임에는 미적용이다. 기존에 없던 경고·만료는 A 버튼을 비활성화한다.
3. **A/B 연사 12초**: 같은 예약 이벤트 목록으로 무기 5종, 빠른 명중·적 발사·폭발, 플레이어 피격·획득·경고·만료를 비교한다. 게임 난이도나 FPS 검증으로 취급하지 않는다. 마지막 3초는 꼬리가 종료되도록 기다린다.
4. **A/B 오프라인 신호 측정**: 실제 OfflineAudioContext로 15초 출력의 peak/RMS/clipped/invalid와 보이스 수를 표시한다. 음악 체크 시 기존 NORMAL 곡의 60초 구간을 0.28로 합산한다. 오프라인 렌더 예약용 시계는 개발 페이지에만 있다.
5. 게임에서 각 실제 무기의 획득→발사→명중→재획득→교체→만료→기본 복귀와 드론 병행, 일시정지→재개→재시작을 확인한다. 무기 교체 후 남아 있던 탄이 이전 무기 종류로 명중하는지도 확인한다.

이번 오디오 작업의 자동 검증:

| 방법 | 확인 범위 | 결과 |
|---|---|---|
| `node --test tests/audio.test.js` | WAV 실제 로드 + Mock Web Audio 노드 그래프, 캐시 20개/요청 21회, 음악 파일 연결, 발당 중복 없음, 5종 명중, 피격 우선순위, 보이스 교체 스트레스, slot 큐, 음소거/일시정지 | 6개 통과 |
| `node --check src/audio.js` | 런타임 JS 구문 | 통과 |
| 개발 HTML module 추출 후 `node --input-type=module --check` | 비교 화면 인라인 module 구문 | 통과 |
| SHA-256 대조 | WAV 20개, 원본 ZIP/WAV 4개, 음악 6곡+매니페스트 | 20/20, 4/4, 7/7 일치 |

## 브라우저 통합 검증 결과

2026-09-06 루트 작업의 실제 브라우저 UI에서 **오디오 준비 → 기존 NORMAL 음악 함께 듣기 체크 → A/B 오프라인 신호 측정**을 실행했다. 결과 원본은 [`Feedback/QA/audio-offline-ab.json`](../Feedback/QA/audio-offline-ab.json)에 보관했다. 이 검증은 위 개발 페이지가 실제 OfflineAudioContext로 렌더한 출력이다. 이전 `docs/SFX_V3.md`의 수치를 재사용하지 않았다.

조건은 A/B 각각 15초, 같은 밀집 전투 이벤트 목록, 기존 `normal-v2.m4a`의 60초부터 15초 구간을 음악 볼륨 0.28로 합산한 것이다. 브라우저 console warning/error는 없었다.

| 측정 | A · 수정 전 | B · 현재 |
|---|---:|---:|
| 합산 출력 peak | 0.716374 | 0.516214 |
| 합산 출력 RMS | 0.123545 | 0.095069 |
| 절댓값 1 이상 샘플 | 0 | 0 |
| 비정상 수치 샘플 | 0 | 0 |
| 최대 활성 샘플 보이스 | 14 | 11 |
| 최대 release 보이스 | 1 | 1 |
| 렌더 종료 후 활성 보이스 | 0 | 0 |
| 렌더 종료 후 release 보이스 | 0 | 0 |

이 시나리오에서는 현재 믹스의 합산 peak와 RMS, 동시 발음 수가 감소했으며 양쪽 모두 클리핑 샘플이나 비정상 수치 없이 꼬리까지 종료됐다. RMS는 선형 신호 측정값이며 주관적 음량이나 음색 우열의 판정이 아니다. 다른 전투 조합·곡 구간·출력 기기 전체에 대한 무클리핑 보장으로 확대하지 않는다.

보존 검증도 이미 확보했다. 런타임 WAV **20/20개**는 기존 `sample-analysis.json`의 SHA-256과 일치했고, 원본 ZIP/WAV **4/4개**는 `source/provenance.json`과 일치했다. 기존 음악 **6/6곡**과 매니페스트 **1/1개**도 위 수정 전 SHA-256과 일치했다. 음원·소스 파일·음악 매니페스트는 수정하지 않았다.

자동 노드 테스트와 실제 브라우저 신호 렌더는 스피커·귀를 대체하지 않는다. 이번 작업에서는 소리를 직접 듣고 음색 취향을 평가하지 않았다. 현재 기기에서의 발사 선명도, 곡과의 주관적 음량 균형, 연사 중 위험 큐의 식별성에 대한 사용자 청음은 남아 있다.
