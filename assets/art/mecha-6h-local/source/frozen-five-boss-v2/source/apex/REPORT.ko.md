# Apex 열린 수직 뼈대 전체 후보 v3

후보 폴더 apex-full-v3. 기존16-final 넓은 citadel/keel/왕관 상자판을 제거하고, 위·아래 길이/방향이 다른 수직 execution wing, 좁은 흑연 backbone/금색 구조 tendon, 열린 대각 하중 뼈대로 바꿨다. 비대칭3관절 precision arm / 아래 heavy siege rail / 작은 tracking turret의 역할은 유지한다. 실제크기 검수에서 끊긴 lower siege root는 실제 tapered cantilever로 backbone에 연결했다. 새 공격기구·장식 양산·Bastion jaws 복사는 없다.

고유10 PNG(5phase×neutral/fire), source10pose.blend와 actual.blend를 제작했다. 원시10장 및16-final 실제 낮/밤 배경+SV106, 표시448의 전후/실루엣6장 모두 직접 열어 확인했다. 합성은 현재 게임 장면 캡처가 아니다. 상자형 큰몸통 대신 열린 뼈대/수직날개가 읽히고 팔 사이·허리 빈 공간, gold 구조선이 유지된다. .25/.5/.75는 물리 gray iris 보호, 1만cyan. 기존 flat core P2 미감은 변경하지 않았다.

16-final에 대한 포구순서/forwardpoint/노즐/core 좌표·반경 투영 비교 불일치0. 카메라ortho5.7/384RGBA/pivot192/display448/left 유지. 폐기된 넓은 옛 몸통hull은 남기지 않았다. 새 실제 evalmesh 기준으로 오목spar/tendon만 earclip→인접convex merge→실제evalbevel mesh clip 각2cells, 다른wing1cell을 사용해 과도한수백삼각형 hull 없이 보존했다. 총 hull은 partial63 / final64. 엄밀numpy pixel-center 검사 전10 hullTransparentPixels0/borderAlpha0. 단순.NET fillPolygon 진단의 약0.13%는 raster 경계 방식 차이이며 엄밀 검사와 구분한다.

ASSET_CONTRACT에 맞춘 개별manifest: key/role apex, 상대 PNG경로·frame별SHA256·muzzleNames3·neutral/fireByProgress5exact. read-only16-final loader 단독등록/9floor(.999=.75)/fire bindings5/10frameSHA 검증PASS. production(runtime10PNG/source11blend) SHA0불일치. 실행 당시 generator-rendered-v3.py와 production-rendered-v3.json을 보존했으며 generator.py는 geometry 동일, canonical key/frameSHA 계약만추가했다. dependency_v1.py 동결경로/SHA를 명시한다.

16-final 실제엔진 motion-only controller fixture 결과 요청neutral/fire 합66core hit 및피해1.2, 부분닫힘controller165 bodyhit/core0 유지. 요청open_fire도 controller가 실제open으로 재선택했고 부분progress는닫힘clock 중다른floor로변한다. 따라서 이 결과를 source각pose 고정접근 검증이나 자연 플레이 완성으로 확대하지 않는다. CORE_REGRESSION.json에 observedImpactFrames/실제선택phase를 남겼으며 부모의fixedsourcepose fixture 보강/이동·반사·성능·native 독립검수는별도 남았다. rawcore 자체8earlycontacts는 원본mesh/반경 그대로 유지, 구조앞접근33/33 clear, 판정제외우회없음.

Blender5.2.2LTS/CyclesCPU2/24samples, v3render26.4초. lightarray검사종료후Carrier팀에슬롯반환. 이전v1/v2/16-final 원본 및 게임 코드/공통manifest는 보존했다. 신규후보 제작·자체QC 완료이며 사용자최종승인/채택/통합완료는아니다. freeze추천 대상은이v3폴더. 최종파일해시는FINAL_HASHES.json, 파생자료는diagnostic-index.json에 별도로 기록한다.
