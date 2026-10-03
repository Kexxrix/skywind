# Carrier matching child 원본 편집 바인딩

local-art 아래 기존 .blend 경로를 읽기 검색했다. 독립 matching-child actual.blend는 없다. 기존 freeze가 참조한 Carrier 부모 actual.blend에 편집 가능한 두 child 그룹 **12 mesh**가 있다. 이번에는 원본 재작성·새 모델 생성·렌더·PNG/공통 metadata 변경을 하지 않았다.

최종 원본: `../carrier-lancer-finish-v1/full-candidate/carrier-finish-v1/actual.blend`, SHA256 `6574099818e0292018ee8e97acf036063bd9417a72f60be5b960ca80cf4bfa42`. frame0을 실제 재개방해 payload2 idle과 포구 metadata의 일치를 확인했다. 기본 frame100도 같은 idle이고 authored snapshot300은 phase_000_payload2다. 상세 Empty world/projection은 SOURCE_FRAME0_INSPECTION.json에 있다.

후속 편집자가 standalone을 분리할 때의 **절차 설명**은 다음과 같다. 이 절차는 실행하지 않았다.

1. 원본은 그대로 두고 별도 편집 사본에서 frame0 또는100을 먼저 평가한다. child0 mesh 여섯 개만 선택한다: `child 0 pointed spine`, `child 0 clipped wing`, `child 0 lower stabilizer`, `child 0 motor`, `child_0_rail outer tube`, `child_0_rail bore recess`.
2. 해당 원본 Empty 세 개도 함께 선택한다: `child_0_rail`, `child_0_rail_direction`, `child_0_nozzle`. 선택한 오브젝트의 현재 world transform을 보존한 뒤 location/hide_render animation을 사본에서만 끊어, timeline 변경이 도크 위치·가시성을 복원하지 않게 한다. 부모나 constraint가 없는 flat source hierarchy다.
3. 원본 dock_0 중심 **(-.95,-.56,-.64)**을 mesh6개와 Empty3개 모두에서 똑같이 뺀다. 즉 object location의 공통 translation은 **(+.95,+.56,+.64)**이다. mesh 데이터에만 변환하거나 muzzle/direction/nozzle Empty를 두고 이동하지 않는다. 원본 도크 좌표와 배경 카메라는 이동하지 않는다.
4. 렌더 사본에서는 선택한 child0 mesh만 보여 주고 다른 body/payload/core mesh는 숨긴다. 원래 카메라 `fixed orthographic source camera`를 그대로 사용한다: 위치(0,-16,3.1), ortho5.25, 원점 바라보기. 광원·재질·384RGBA·pivot192/192·display448를 유지한다. geometry/material/회전/scale을 재설계하거나 새 객체를 만들 필요가 없다.
5. child1은 똑같은 대응 이름의 여섯 mesh와 `child_1_rail`, `child_1_rail_direction`, `child_1_nozzle`을 사용하며 dock_1 **(.14,-.56,-.64)**을 뺀다. 단일 standalone PNG는 child0 기준이며 child1도 동일 상대 geometry/재질이다.

최종 child 원본 PNG는 `../carrier-lancer-finish-v1/full-candidate/carrier-finish-v1/carrier-child.png`, SHA256 `2afbac046c628a08a216459a2c353c2412c44ebbadb487bc32d43118b142193a`다. 물리 도크 pixels는 source384 기준 dock0(122.5143,245.7479), dock1(202.2400,245.7479). 실제 handoff 중심은 부모 world pivot + (dockPixel-(192,192))×448/384이고 child도 display448를 유지한다. 이 값은 본체에서 child 분리 시 코드 총괄이 사용하는 계약이며 이번 감사에서 runtime 연결을 변경하지 않았다.

최종 부모 child12 mesh의 모든 Principled 입력/geometry/Empty 정합 증거는 `../carrier-lancer-finish-v1/full-candidate/matching-child-shader.json` 및 독립 대표 검수 receipt를 상속한다. 독립 child .blend가 있는 것처럼 기록하지 않고 **부모 원본 내 편집 recipe**로 분명히 분류한다.
