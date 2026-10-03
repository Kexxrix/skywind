# 최종 5보스 로컬 제작 후보 v2

Warden/Lancer design-revision-v2, Carrier design-revision-v3, Bastion/Apex 기존 승인 방향 후보를 묶었다. 감독 및 독립 외형 방향 검수를 통과했으며, 사용자 최종 승인·실행본 통합·게시 완료와 구분한다.

manifest-candidate.json은 5개 boss role과 matching Carrier child를 제공한다. runtime/은 384 RGBA 실행 자산, editable/은 actual.blend 및 개별 실제 포즈 원본, source/는 생성 스크립트·생산 증거·원래 manifest·검사 보고다. preview/는 실제 이미지를 사용한 정적 합성이며 게임 실행 캡처가 아니다. FILE_LEDGER.json으로 모든 패키지 파일을 검증한다.

각 보스는 진행률 0/.25/.5/.75/1의 neutral/fire 실제 포즈를 갖는다. Carrier는 payload2/1near/1far/0마다 이를 제공한다. .999까지 보호 장갑, 1에서만 cyan core가 열린다. 코드 총괄은 Carrier occupied payload+floor progress로 neutral state를 고른 뒤 fireFlash에 따라 해당 _fire state를 적용하고 PNG/포구/앞방향/hull/dock를 같은 snapshot으로 갱신해야 한다. 공격·취약 권한은 코드 담당이다.

evidence/SOURCE_REOPEN_AUDIT_V2.json은 실제 원본 재개방과 projected anchors, matching child의 부모 도크 상대 형상을 검사한다. 역할별 ACTUAL_SOURCEPOSE_REGRESSION은 고정 source pose fixture를 사용한 원래 실행본 물리 검사이며 자연 게임 시계·난이도 검증이 아니다. 실제 렌더 이미지는 검수했으나 최종 실행본에서 native 크기의 탄원점/flash/피격 feedback과 조작 QA는 통합 담당의 남은 검사다.

공통 game.js/manifest, 다른 생산자의 기존 원본, Git·배포·Library 복원은 변경하지 않았다. 이전 frozen-five-boss-v1과 반려 증거를 보존했다. 대형 렌더는 CPU2로 순차 실행했으며 GPU 사용량을 측정했다고 주장하지 않는다.
