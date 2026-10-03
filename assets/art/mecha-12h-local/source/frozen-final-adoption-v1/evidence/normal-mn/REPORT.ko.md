# Mantis / Needle idle 대표

기존 준비 geometry를 재사용하여 신규 거대 기구 없이 대표를 제작했다. 현재 ROLE_MAP의 Mantis dualgun96 / Needle coil snapshot112와 실제 포구2/1을 따른다. 독립 대표4종 gate 전이므로 각 idle1PNG만 제작했으며 charge/fire 전체 상태 생산은 진행하지 않았다.

Mantis: 회녹색 비대칭 조향 몸통, 높이가 다른 조향판, 분리된 두 receiver/총신과 각 구리 zipper feed pawl. 칼·집게를 추가하지 않았고 앞쪽 총 사이 빈 공간을 보존한다.
Needle: 흑연색 짧고 굵은 capacitor receiver, 위쪽 회녹색 축전기와 구리 bus, 실제3환 코일, 짧은 단일 총신과 반동 cradle. Dart96의 가늘고 긴 rail 실루엣과 별개이며 Lancer 축소형이 아니다.

각384RGBA/pivot192/left fixedortho(M3.9/N3.4), actual.blend/source-idle.blend/standalone generator.py를 저장했다. source카메라 projected 포구·forward Empty·노즐/mesh별 evaluated convex hull이 manifest에 있다. Needle 코일은 annular16sector hull로 중앙 빈 공간을 합치지 않았다. corefalse, 추진불꽃은 구워 넣지 않았다.

현재 src/mecha-art.js loader read-only 등록 검증 PASS: display96/112, 실제 gun2/1, nozzle각1, 방향왼쪽, core disabled. 모든 forward point는 분리 hull 밖이다. alpha border0, hulltransparent M0.029%/N0.028%. 원본/생성기/실행 PNG 해시 일치0오류. ROLE_QC/LOADER_QC/production/FINAL_HASHES 참조.

원시 대표2PNG, hull overlay2장, 실제표시96/112+SV106+Dart96 낮/밤/검정실루엣 합성3장을 실제 열어 확인했다. 작은크기에서 총수·쌍총 빈틈·굵은coil receiver와 긴rail 차이가 유지된다. synthetic 제어 배경 합성이며 게임캡처/자연전투검수는 아니다. 공격 timing·현재 pose damaged effect는 코드 담당 권한이다.

Blender5.2.2LTS CyclesCPU2/24samples 단일process2대표 렌더 약4.8초 종료, 슬롯 반환. 준비 원본/공유 게임코드/manifest는 수정하지 않았다. 독립 대표 gate와 통합 검수·채택은 남아 있다.
