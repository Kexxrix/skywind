# 남은 일반전4종 끝점 검수

REMAINING_FOUR_REPRESENTATIVES_v1.json은 Mantis/Orb/Claw/Needle의 idle 1장씩 총 4PNG를 선택한다. 384RGBA, pivot192/192, 왼쪽, 고정 직교 카메라, corefalse, 추진 불꽃 미포함이다. 기존 공격 동작·게임 각도·피해·출현 규칙은 바꾸지 않았다. 독립 대표 검수 전 전체 상태 제작을 완료했다고 보고하지 않는다.

| role | display | 포구 | 실루엣/무장 |
|---|---:|---:|---|
| mantis |96|2|회록비대칭핀과분리된두receiver·포신, 두총사이공간|
| orb |82|3|와인색중앙·아이보리상부·황토하부의길이다른삼지발사부, 둥근후면feed|
| claw |108|2|큰공유구리드럼과두중포신, 하부받침|
| needle |112|1|청회색굵은capacitor receiver와짧은코일, Dart의긴rail과구분|

네 native PNG와 NORMAL_ELEVEN_ROLE_COMPARISON_day/night의 실제 크기를 직접 열어 확인했다. 낮·밤에 두 총·삼지·드럼·짧은 코일을 구분할 수 있으며 확정7종의 외형·색·총수와 대조했다. 이 시트는 논리1280×720 합성이며 승인 SV01 106을 함께 그린 검수판이다. 자연 플레이 QA를 대신하지 않는다.

Mantis/Needle은 ROLE_QC/LOADER_QC/FINAL_HASHES, Orb는 v3 validation/source-anchor-inspection/source-index, Claw는 source-anchor-inspection/hull-inspection/production이 근거다. 전체 loader와 원본 production hash는 PASS다. actual source와 정확한 포구 앞방향점·노즐·분리 convex hull을 보존했다. Claw의 2포구·2forward·1nozzle 재개방 투영 오차는 최대0.000062px 미만이다. hull 투명 비율은 Mantis0.029%/Needle0.028%, Orb/Claw0이며 border alpha0이다. 실제 개별 mesh 기하를 검사했다.

Claw의 준비된 idle 원본은 정확한 바이트로 재사용했으며 재렌더하지 않았다. 원래3상태 source·출력은 normal-claw에 보존하고 대표 manifest에는 idle만 선택했다. Orb 실패 v2는 보존하고 기구 matrix 갱신을 수정한 v3만 선택했다. Mantis/Needle도 idle만 완료이며 준비 source와 runtime 출력을 구분한다. 개별 보고는 각 source 폴더의 REPORT.ko.md와 Claw의 SOURCE_LABEL.ko.md를 따른다.

새로운 거대 기구·새 종·동작 추가 없이 현재 ROLE_MAP의 무장 형태를 읽게 하는 완성 범위다. 독립 검수 뒤 필요한 상태만 연결한다. 코드·공통 manifest·Git·배포·Library 접근·GUI 캡처·녹화·청음은 변경 또는 실행하지 않았다. 헤드리스 렌더는 CPU2를 순차 사용한 뒤 슬롯을 반환했다.
