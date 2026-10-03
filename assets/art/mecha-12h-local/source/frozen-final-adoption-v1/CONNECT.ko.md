# 최종 로컬 채택 인계 v1

manifest-candidate.json을 기준으로 runtime/ PNG만 실행 자산에 복사한다. 19 asset key는 VALIDATION.json에 있다: 보존 Beetle + 일반11종 + 5보스 + appearance-only matching child2. 동일 role/key 중복과 빠진 실행 파일은 없다. editable/에는 원본 바이트 actual.blend와 보존 source pose, source/에는 원본 manifest·ROLE_MAP·투영/child 변환 근거, evidence/에는 당시 QC와 실패/연결 기록을 둔다. 원본 manifest의 옛 경로는 역사적 출처이며 실행 경로는 최종 manifest만 따른다.

코드 총괄은 sourcePortBindings의 포구 순서와 실제 앞방향점, matchingChild의 도크 중심·스케일을 사용한다. Carrier child는 editable/carrier/actual.blend의 child0, Scarab child는 editable/scarab/actual.blend의 child 그룹이다. 독립 child 원본이 있다고 표시하지 않았으며 CHILD_SOURCE_BINDINGS.json의 도크 빼기 변환을 적용해 편집한다. 부모·child에 같은 camera scale을 유지한다.

일반4종은 idle 그림을 charge/locked/fire/recovery alias로 공유한다. Needle은 최소 예고0.65와 aim lock이 코드 소유이며, charge/locked에 조준·coil 예고, fire에 실제 muzzle 효과, recovery에 기존 회복 시간을 연결해야 한다. 새 반동/기구/탄각도는 추가하지 않는다. damaged는 현재 선택 포즈를 유지한다. 보스의 neutralByProgress/fireByProgress와 Carrier·Scarab payload 선택을 원자적으로 사용하며 .999는 최종 exposed가 아니다. Beetle는 원래 포구만 있고 authored directionpoint는 없어 기존 조준 정책을 보존했다.

권장 검수 순서: FILE_LEDGER 해시/경로 → asset key/role/state lookup → 일반4종 예고(특히 Needle lock)·발사 효과 → 보스 부분 보호/최종 core 및 neutral-fire pose → Carrier/Scarab child 분리 시 부모 payload 제거와 같은 도크·scale 일치 → 실제 전투 가독성. 정적 방향 검수와 기능회귀는 통과했으나 최신 runtime 연결·최종 미감·게시/배포는 코드/QA팀 소유다. 이 작업은 공통 코드·채택 manifest·Git·배포를 바꾸지 않았다. 신규 디자인 생성은 종료했으며 필요한 runtime 수정만 대기한다.

PNG 수와 decoded RGBA 산식은 VALIDATION.json의 검증 범위만 보고했다. 이번 포장 중 모델생성/렌더0. 세션 전체 생성시도 수는 추측하지 않았다. 과거 원본·해시·실패 증거는 local-art에 그대로 보존했다.
