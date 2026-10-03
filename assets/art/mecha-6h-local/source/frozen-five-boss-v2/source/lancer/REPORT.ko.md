# Lancer full 후보

독립 대표 gate를 통과한 큰 형태 그대로 5기구진행률×neutral/fire=10 PNG와 각 source blend를 생성했다. actual.blend는 closed neutral이며 각 source 파일이 정확한 pose inspection 원본이다. 고정384RGBA/피벗192/왼쪽/직교5.35/표시400, CPU2 24samples이다. 기존 대표와 freeze는 보존했다.

포구순서 siege_lance,offset_suppressor와 forward/nozzle/core projected 좌표는 기존 Lancer 계약v2의 10상태 전부 정확히 일치한다. 실제 반동0.52로 포신과 첫 포구가 이동한다. 단일 core0.21/이동 경로는 유지했다. .25/.5/.75에서는 gray physical lock 및 숨겨진 cyan,1만 최종 cyan이다. charge는 현 neutral+runtimeVFX, damaged는 현pose+runtimeeffect이며 timing/attack권한은 코드 소유다. semanticAliases는 정확한 5neutral/5fire이며 .999는 .75 선택 계약이다.

직접 .75fire/finalfire PNG와 표시400 밤 합성을 확인했다. 실제 장면 배경+SV106 비교 합성은 통제된 자산 비교이며 현재 게임 적용 증거가 아니다. full10 source 재개방에서 actual evaluated mesh hull/anchors/core metadata 정확일치 PASS. 엄밀 numpy10 검사에서 투명 hull 픽셀0/경계 alpha0, decoded RGBA10개 독립이다. runtime physics 회귀/최종통합 채택은 총괄 담당이며 이 보고로 완료 주장하지 않는다.

등록 수정: 필수 idle alias 누락으로 최초 root 등록은 실패했다. idle/charge/damaged→phase_000, fire→phase_000_fire, open→phase_100의 실제 기존 PNG semantic aliases를 추가했다. damaged는 현재 pose effect 정책이며 alias는 기본 fallback이다. PNG/blend는 재작성하지 않았다. 최종16-final의 registerMechaManifest/getMechaSpec 실제 실행(check-root-contract.mjs)으로 15state lookups/10PNG, 기구 floor/최종1만노출 PASS다. generator도 alias 재현 가능하도록 갱신했으며 이전 production.json sourceSHA는 렌더 당시 provenance로 유지한다. 현재 authoritative-production/FINAL_HASHES가 현 파일 해시이다.
