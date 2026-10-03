# Carrier v3 전체 생산 완료

감독과 독립 대표 방향 검수를 통과하여 승인된 남은 38포즈를 제작했다. 이는 사용자 최종 미감 승인과 별도이다. 대표 형상·카메라·재질·판정 계약은 변경하지 않았다. 기존 대표 기록은 representative-evidence/에 보존했고 기존 REPORT.ko.md도 대표 시점 증거로 유지한다.

전체 5phase × 4payload × neutral/fire = 40포즈 PNG와 개별 source-*.blend 40개가 완성됐다. 자식 PNG 1개를 더해 고유 실행 PNG41개이며, actual.blend 1개와 source-child.blend 1개를 포함한 production blend 총42개이다. manifest-candidate.json과 manifest-full-source.json은 전체40+idle/charge/open/fire alias4+child1, 총45 의미 상태를 담는다. source-index.json과 production.json에는 실행/소스83파일 SHA가 있으며 모든 frame.sha256과 일치한다.

CPU2 headless 단일 process 추가 렌더: 2026-10-03 10:36:22.437768–10:38:11.806155 UTC, 109.575초. 대표 PNG2/대표 source2/actual.blend/child PNG·source는 기존 SHA 그대로이다. 기하·카메라·재질 재생성 없이 기존 actual.blend의 저장된 snapshot을 렌더했다. 새 Blender 렌더 및 numpy 검사 모두 종료했고 CPU 슬롯을 root에 반환했다.

검증 결과:
- 45 의미 상태 전체 Blender numpy hull 배열 검사: 투명 hull 픽셀0, 테두리 alpha0.
- final16 registerMechaManifest 및 48 explicit selector 검사 PASS(.999 floor 포함).
- 전체20 중립/반동쌍의 실제 PNG SHA가 서로 다르고, 포구 recoil은 +.14/+.12worldX 투영값과 일치한다. 모든 쌍 core/dock metadata 동일.
- 전체40 축소 실제 픽셀 시트를 직접 확인했다. 네 payload 상태, 부분 gray lock, 최종 cyan, 실제 두 포신 반동, 아치 사이 빈 공간이 유지된다. 대표448/SV106 전후 합성도 보존했다.
- 순수 source 기하1584행: 최종264 clear, 부분/.9991320 protected.
- root 독립 source80 재개방 감사 PASS, Carrier child 상대 geometry 최대 오차 7.0288636774e-8. root 보고 근거 ART/SOURCE_REOPEN_AUDIT_V2.json.
- root 고정 sourcepose 실제 엔진 회귀 Carrier1320행 PASS: 최종 core264, 부분 body1056, miss0/mismatch0, engine SHA 변경0. 근거 ACTUAL_SOURCEPOSE_REGRESSION. 자연 controller 시험과 구분한다.

payload/기구/반동 선택은 같은 PNG·포구/forward·코어·분리 hull snapshot을 사용해야 한다. 공격 타이밍·HP·취약 권한은 코드 총괄 소유이며 아트 작업자는 게임 코드·반경·충돌 예외를 변경하지 않았다. 최종 manifest 통합과 native 게임 화면 검수·사용자 최종 미감 승인은 총괄 후속 범위이다.

대표 source 단계의 manifest-source-all40-unrendered.json과 source-geometry-qc.json은 당시 기록이며, 현재 완성 인계에는 manifest-candidate.json, manifest-full-source.json, source-index.json, validation.json, hull-inspection.json, loader-qc.json, FULL_REPORT.ko.md, handoff-hashes.json을 사용한다.
