# Bastion / Apex 전체 pose 마감 후보

승인된 bastion-apex-finish-v1 최종 gold 수정 원본을 새 폴더에 복사했다. 기존 대표4PNG는 bytecopy, 남은16PNG는 단일 Blender CPU2 process에서 저장된 source pose를 열어 렌더했다. actual/source blend22파일은 재저장하지 않았으며 원본·복사본 SHA 불일치0이다.

각 고유10PNG/10pose+actual을 완성했다. Bastion14 / Apex10 semantic 계약은 대표 승인 full-source manifest와 정확히 같다. 분리 hull, 포구·앞 방향점·노즐·코어·bounds·기구 진행률·고정 카메라·pivot·표시432/448는 승인 원본 그대로다. full manifest로 실제 엔진 loader 등록 및 회귀를 통과했다.

전체20PNG를 실제로 열어 확인했다. 부분0/.25/.5/.75는 물리 회색 보호, 최종1만 cyan이다. 중간 이동과 neutral/fire 반동이 이어지고 C구멍/팔 사이 간격 및 Apex 큰 금색 판을 유지한다. 원래 core P2 미감은 그대로다. 각10 decoded pose가 모두 다르고 border alpha0; hull-gap 수치는 FULL_QC.json 및 각 pixel-inspection.json에 있다. 투명 영역을 전체 hull로 합치지 않았다.

실제 frozen06 엔진 회귀: 각 보스 최종 neutral/fire66/66 core 피해1.2, 부분보호165/165 body 피해1/core0. raw pre-core core자체 접촉 B9/A8은 유지했고 비코어 구조 접근33/33 clear. FINISH_CORE_REGRESSION.json 참조. 자연 플레이 검수와 최종 채택은 부모 통합 QA 대상이다.

production.json은 현재 runtime PNG와 source blend만 authoritative SHA로 포함한다. 과거 representative production.json은 production-representative-original.json으로 그대로 보존했다. 파생 비교/QC는 diagnostic-index.json으로 분리하여 이전 Apex 파생 비교4 stalehash를 새 authoritative 자료에 섞지 않았다. source 스크립트/dependency 동봉, SOURCE_BYTE_LEDGER/FULL_SOURCE_PRESERVATION 및 FINAL_HASHES로 추적한다. 원본 FINAL_HASHES/기능 원본/공유 게임 코드·manifest/frozen은 변경하지 않았다.

CPU2 render43.8초 종료, 슬롯 반환. 낮/밤/실루엣 실표시 QC 비교는 각 compare-*.png에 있으며 synthetic 제어 합성이다. 새 GUI 캡처·영상은 없다.
