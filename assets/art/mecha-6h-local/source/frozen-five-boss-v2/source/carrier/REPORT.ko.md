# Carrier 분리 화물 아치 대표 v3

v2의 넓은 상판·연속 직선 측면 띠를 없앴다. 앞·뒤 두꺼운 다면 화물 아치를 각각 경사진 두 구간으로 만들고, 사이 x[-.48,.29]에는 상부 선체 없이 실제 공기층을 남겼다. 낮은 구조 교량·노출 piston만 연결한다. 큰 후방 추진부는 좁은 coupling과 단차로 구분한다. 두 독립 cargo opening·내부 하중 spindle·매달린 두 자식/부두를 유지하며 스파이크 장식이나 턱 구조를 추가하지 않았다.

대표 closed `carrier-phase_000_payload2.png`, final open `carrier-phase_100_payload0.png` 두 장만 CPU2 단일 프로세스로 렌더했다(7.903초). `actual.blend`와 대표별 `source-*.blend` 두 개 저장. 기존 v1/v2 전부 보존, 새 쓰기는 이 폴더만 수행했다. 아직 미감 gate·채택 승인 전이다.

실제 raw384와 v2→v3 전후448/SV01 106 합성을 직접 확인했다. `before-after-day-phase_000_payload2.png` 및 final open 동일 시트, night 시트 제공. 큰 빈 공간이 두 화물 아치를 실제 실루엣에서 나누며, 연속 상판과 띠가 남지 않는다.

카메라/384RGBA/피벗192/192/왼쪽/표시448/직교5.25 유지. 포구 index0 `defence_upper`는 앞 아치 받침으로 이동하여 actual projection 갱신했고 index1 `defence_keel` 유지, 방향점 이름은 각각 `_direction`. 상부 source origin 변경은 metadata에 반영했으며 공격 역할/타이밍/탄 각도 규칙은 미변경이다. core center/radius/최종-only cyan 및 부분 gray lock, 두 dock/child 상대 geometry·scale 유지. 분리 hull은 새 실제 mesh별 재산출이며 중앙 공기층을 단일 union으로 메우지 않는다.

`manifest-candidate.json`은 렌더 대표2+idle/open alias와 inherited child만 가진 **대표 검수용**이다. `actual.blend`/`manifest-source-all40-unrendered.json`에는 5phase×4payload×neutral/fire 전체40 소스 snapshot이 있으나 나머지38 PNG·개별source blend는 아직 없다. 승인 전 대량 렌더 미실행. child PNG/독립 source-child.blend는 이전 full-v2 byte exact로 유지했다.

`source-front-gate-representative.json`: 읽기 전용 16-final loader/collision 순수 기하1584행. 최종264/264 clear, 부분/.9991320/1320 protected. 코어/탄 반경·게임 물리코드 미변경. actual updateGame의 자연 상태 선택/지속시간/전체 포즈 실사격 시험과는 별도다. Carrier occupied payload+fireFlash actual recoil snapshot 선택 연결은 총괄 권한이다.

`source-geometry-qc.json`: actual.blend 재개방 전체40 source snapshot의 포구/forward/노즐/core/bounds/각 mesh hull 투영 exact. 양 child12mesh vertices/relativeDock/diffuse도 기존 full-v2 exact. `hull-inspection.json`: 대표2+alias2+child 전체5 상태의 hull 투명0/border alpha0. `central-gap-pixel.json`: 중앙 공기층 pixel(190,130)은 closed/open 모두 alpha0. 미렌더38상태의 픽셀 검증은 아니다. `source-index.json`/`validation.json`/`handoff-hashes.json` 제공, 원본 production hash 불일치0. 모든 Blender 프로세스 종료 후 root Warden QC에 슬롯 반환.
