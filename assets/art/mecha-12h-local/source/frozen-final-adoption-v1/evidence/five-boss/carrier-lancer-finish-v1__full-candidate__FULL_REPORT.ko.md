# Carrier/Lancer 전체 마감 후보 완료

독립 대표방향 통과 후 승인된 남은24PNG 렌더와 전체 QC를 완료했다. 최종 후보는 이 폴더의 **carrier-finish-v1/**, **lancer-finish-v1/**와 합동 **manifest.json**이다. 기존 v4·대표 후보·pre-child-material-fix는 보존했고, 중간 자식 수정 이전 자산은 사용하지 않았다.

최종 자식 정합이 적용된 대표 actual.blend를 바이트 그대로 복사하고 저장된 timeline snapshot에서 렌더했다. 새 geometry/source 생성0. 한 Cycles CPU2 process에서 남은24 PNG를58.7초에 완료하고 슬롯을 반환했다. 기존 최종 대표6PNG와 원본 child1PNG는 그대로 재사용했다. **본체30pose/38semantic, child1, 총31 고유 runtime PNG**다.

- `../full-validation.json`: 전체 loader Carrier24/Lancer14 상태와 child PASS. 원본 source/PNG 해시 불일치0, 최종 대표 source byte 동일. 포구2·forward/nozzle·core 중심반경·분리 hull·기구/payload/recoil 계약38개 정확히 동일.
- 각 `hull-inspection.json`, `full-pixel-qc.json`: Carrier25/Lancer14 resolved states에서 전체384 hull 내부 투명 pixel 최대0, border alpha0. 실제30pose decoded RGBA hash는20/10 모두 서로 다르다. 부분0/.25/.5/.75는 cyan 숨김, 최종1만 노출한다.
- 실제 `all-source-poses-contact.png` 두 장의 모든30pose를 직접 봤다. Carrier payload2/near/far/0와 Lancer neutral/recoil 변이, 회색 잠금판·rail/coupler·최종cyan, 도장/금속 대비가 유지되고 재질이 튀거나 기구가 사라지는 문제를 발견하지 않았다. 추가448/400 반개방 near/far·neutral/recoil 합성도 직접 확인했다. contact는384 native source 배치, 합성은 통제된 배경이며 자연 게임 플레이 증거가 아니다.
- 실제 source 자세30개 투영과 child12mesh 재질/geometry/Empty/도크 정합은 통과한 대표검수 증거를 상속한다. actual.blend 바이트가 완전히 동일하다. child PNG SHA256 `2afbac046c628a08a216459a2c353c2412c44ebbadb487bc32d43118b142193a` 보존.
- 판정38계약이 v4와 정확히 같아 기존 최종198 접근 clear/부분990 보호와 실제 엔진192core/6경계body, drift 보상 진단198core의 근거도 유지한다. 이번 전체 마감 후보의 모든 자세를 실제 엔진에서 새로 재생했다는 주장은 하지 않는다.

`source-index.json`은 현재 후보 source/runtime/manifest/검사 해시를 묶으며, 각 production.json에 카메라·버전·렌더 설정·원본 generator 및 이번 render_remaining.py 해시가 있다. 384RGBA/pivot192/192/왼쪽 고정 직교/표시448·400/추진 불꽃 미포함은 유지했다. 원본 actual SHA256은 Carrier `6574099818e0292018ee8e97acf036063bd9417a72f60be5b960ca80cf4bfa42`, Lancer `ebdcbad947dd136e2e414a36311676cf2445618f41ef0a5df8f2e5f88309843e`다. derived 진단·합성은 runtime production 해시와 분리한다.

코어 깊이 마감의 P2 한계는 이번 대표방향에서 인정된 상태 그대로이며, 코어 고리 복사/반경 확대/충돌 예외는 없다. 완성 후보의 독립 전체 검수·runtime 채택·자식 분리 handoff/자연 개방창 확인은 총괄 통합 단계에 인계한다. 일반 Orb 제작은 재개하지 않았다. 코드·공통 manifest·GUI·Library·설치·Git·배포 변경0.
