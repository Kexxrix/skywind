# SkyWind 패치 1 사운드 편집 근거

원본 67개는 수정하지 않았습니다. 아래 30개는 각각 한 발사·명중·알림 이벤트이며, 연사 데모나 원본 반복 구간 전체를 재생하지 않습니다.

**청음 미검증 / 공개 배포 권한 미확인.** 표는 기술 측정값이며 타격감·음질·재질 의미의 승인을 뜻하지 않습니다.

편집본은 모노 PCM16 48 kHz입니다. 시작/끝 샘플은 모두 0, 클리핑 샘플은 0입니다. 무기별 소리는 소스·편집 구간·주파수 필터·엔벌로프로 구분하며 피치만 바꾼 파일이 아닙니다.

`player-damage-fixed.wav`에만 planemetalscrew와 planerico2를 사용했습니다. 고정 재생속도·중앙 패닝·고정 gain은 런타임에서 유지해야 합니다. 폭발·적 발사·음악은 이 제작에 포함하지 않았습니다.

| 편집본 | 원본 구간(초) | 길이 ms | Peak dBFS | RMS dBFS |
|---|---|---:|---:|---:|
| `edited/shot-normal-01.wav` | gun1.wav 0.000–0.095 | 95.25 | -8.00 | -22.02 |
| `edited/shot-normal-02.wav` | gun2.wav 0.000–0.094 | 93.98 | -8.00 | -23.81 |
| `edited/shot-normal-03.wav` | gun3.wav 0.000–0.098 | 97.79 | -8.00 | -22.45 |
| `edited/shot-spread-01.wav` | planegunlight.wav 0.000–0.084 | 84.00 | -8.20 | -19.00 |
| `edited/shot-spread-02.wav` | planegunmedium.wav 0.100–0.184 | 84.00 | -8.00 | -20.73 |
| `edited/shot-spread-03.wav` | planegunheavy.wav 0.000–0.084 | 84.00 | -8.00 | -19.38 |
| `edited/shot-lance-01.wav` | so_com_hllcrshr_zaps_a.wav 0.022–0.147 | 125.00 | -10.00 | -27.59 |
| `edited/shot-lance-02.wav` | so_com_hllcrshr_zaps_b.wav 0.025–0.160 | 135.00 | -10.00 | -27.38 |
| `edited/shot-lance-03.wav` | so_com_hllcrshr_zaps_a.wav 0.140–0.270 | 130.00 | -10.00 | -26.08 |
| `edited/shot-helix-01.wav` | so_com_hllcrshr_zaps_b.wav 0.265–0.410 | 145.00 | -10.00 | -24.64 |
| `edited/shot-helix-02.wav` | so_com_hllcrshr_zaps_a.wav 0.310–0.455 | 145.00 | -10.00 | -26.09 |
| `edited/shot-helix-03.wav` | so_com_hllcrshr_zaps_b.wav 0.385–0.530 | 145.00 | -10.00 | -25.66 |
| `edited/shot-drone-01.wav` | gun1.wav 0.000–0.068 | 68.00 | -13.00 | -29.29 |
| `edited/shot-drone-02.wav` | gun2.wav 0.000–0.068 | 68.00 | -13.00 | -33.62 |
| `edited/shot-drone-03.wav` | gun3.wav 0.000–0.068 | 68.00 | -13.00 | -33.00 |
| `edited/hit-weapon-normal.wav` | gun3.wav 0.000–0.045 | 45.00 | -15.00 | -33.44 |
| `edited/hit-weapon-spread.wav` | planegunheavy.wav 0.000–0.074 | 74.00 | -15.00 | -31.19 |
| `edited/hit-weapon-lance.wav` | so_com_hllcrshr_zaps_a.wav 0.190–0.290 | 100.00 | -15.00 | -31.63 |
| `edited/hit-weapon-helix.wav` | so_com_hllcrshr_zaps_b.wav 0.255–0.375 | 120.00 | -15.00 | -33.52 |
| `edited/hit-weapon-drone.wav` | gun2.wav 0.005–0.050 | 45.00 | -15.00 | -34.28 |
| `edited/hit-target-light-01.wav` | planerico1.wav 0.000–0.175 | 175.00 | -13.00 | -27.10 |
| `edited/hit-target-light-02.wav` | planerico3.wav 0.000–0.175 | 175.00 | -13.00 | -25.71 |
| `edited/hit-target-armored-01.wav` | rico1.wav 0.000–0.180 | 180.00 | -13.00 | -26.73 |
| `edited/hit-target-armored-02.wav` | rico2.wav 0.000–0.180 | 180.00 | -13.00 | -25.79 |
| `edited/hit-target-armored-03.wav` | rico3.wav 0.000–0.180 | 180.00 | -13.00 | -27.48 |
| `edited/hit-target-special-01.wav` | so_com_hllcrshr_zaps_a.wav 0.400–0.510 | 110.00 | -13.00 | -27.54 |
| `edited/hit-target-special-02.wav` | so_com_hllcrshr_zaps_b.wav 0.390–0.500 | 110.00 | -13.00 | -29.37 |
| `edited/player-damage-fixed.wav` | planemetalscrew.wav 0.000–0.300 + planerico2.wav 0.000–0.300 | 300.00 | -7.50 | -21.69 |
| `edited/weapon-change.wav` | so_com_get_boost_a.wav 0.025–0.385 | 360.00 | -10.50 | -24.00 |
| `edited/weapon-expire.wav` | so_com_get_boost_b.wav 0.210–0.490 | 280.00 | -11.50 | -29.06 |

재현: 이 스크립트 옆 `source/`의 보존 원본 67개를 입력으로 `python prepare_sound.py`를 실행하면 `edited/`와 `provenance.json`을 생성합니다. 상세 source/output SHA-256, trim, 필터, envelope, gain은 `provenance.json`에 있습니다.

남은 조정: 실제 혼합 청음으로 샘플 계열감, 무기·대상 구분, 반복 피로도와 UI 큐 의미를 평가해야 합니다. 소스 간 peak와 RMS를 기술적으로 제한했지만 청감 음량의 일치를 주장하지 않습니다.
