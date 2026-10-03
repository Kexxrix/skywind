# 오목 prism hull 최소 분해

같은폴더 convex_section_cells.py의 split_section(authored_world_XZ_polygon)으로 earclip 후 인접 convex union만 합쳐 cells를 얻는다. Apex spar/tendon 각2, 나머지wing1이다.

metadata에서 실제 evaluated mesh에 대해 evaluated_convex_cells(o,mesh,cells,clip_mesh,project,convex,bpy,Vector)를 호출한다. 반환(hull,name)을 bodyHullPixels/bodyHullComponentNames에 넣는다. 기존 clip_mesh 함수는 정확한 실제 bevel mesh를 cell경계로 잘라 cap하고 sourcecamera로 투영한다. 완성 actual/source/PNG는 수정·재저장하지 않아도 된다.

중요: cells는 해당 pose의 실제 authored world XZ polygon을 사용한다. local축/다른축 mesh에 임의 적용하거나 core/gray lock을 hull검사에서 제외하지 않는다. phase에 따라 이동하는 polygon은 같은 source pose 값으로 polygon을 계산한다. 폴더 동결시 이 helper 복사 및 SHA 명시한다. 임의 반경확대/투명전체hull/판정제외는 없다.

Apex metadata-only 예제 inspect_saved_poses.py는 apex-full-v2에 있다. generator prefix의 metadata 함수만 준비한 다음 저장source를 열고 camera/parts/anchors를 실제 scene에서 재바인딩해 manifest만 재산출한다. Blender save/render를 호출하지 않고 source/PNG byteledger를 검증한다.
