# Orb82 trident idle 대표 후보

새 로컬 Blender 대표 idle1PNG와 실제 소스 검사를 완료했다. 현재 후보는 이 폴더의 actual.blend/manifest-candidate.json/orb-idle.png다. 기존 준비 v1과 실패 v2는 보존하며 완료 후보로 혼용하지 않는다. charge/fire source는 준비했지만 아직 렌더하거나 채택하지 않았다. 4종 독립 대표방향 gate와 후속 필요한 상태 양산은 대기한다.

ROLE_MAP2215의 Orb는 Stage1 trident fan이다. 길이가 서로 다른 3개 큰 firing prong, 둥근 후방 feed cassette·노출 feed wheel, 소형 rear engine을 실제 mesh로 제작했다. 와인색 긴 중앙 발사기관, 짧은 아이보리 상부, 황동 하부로 82 실표시에서 무장과 실루엣을 구분한다. 박스 어깨/hex core/보스 축소/Pincer 해머를 사용하지 않았다. 신규 행동·종·거대한 기구는 추가하지 않았다.

**포구 index0=lower `trident_2`, index1=center `trident_1`, index2=upper `trident_0`**. 실제3포구/3 forward Empty/1 nozzle, corePixels=null/coreExposed=false/weakpointEnabled=false. rounded cassette는 약점 코어가 아니다. physical outer head ±.16rad는 실제 앞방향 metadata이며 canonical trident base phase -.22/0/+.22에 더하지 않는다. 읽기 전용 checkout game.js L398~401은 authored 포구 위치만 사용하고, L628~636은 patternGeometry point.angle을 그대로 enemyBullet에 전달한다. barrage.js L98~100/L196의 기존 각도·seed 변동 권한도 보존했다. 게임 코드 변경0.

첫 v2 실제 픽셀에서 sliding sleeve의 새 rod matrix 갱신 누락으로 의도치 않은 세로 부품을 발견했다. v3는 기울임 전에 view_layer.update로 변환을 확정했고 포구·방향·hull을 모두 같은 실제 geometry로 재생성했다. v2 실패 증거는 남겨 두고 사용하지 않는다.

- validation.json: 대표 idle loader/원본 해시 PASS, 포구3/nozzle1/분리 convex hull30. 384RGBA/pivot192/192/왼쪽/fixed ortho3.6/display82, 추진 불꽃 미포함.
- source-anchor-inspection.json: 실제 idle/charge/fire source blend 재개방, camera/앵커 투영 최대 .000065px 미만. 실제 bore 축 끝과 muzzle/forward Empty 오차 <1.4e-7world. source3는 모두 corefalse다.
- hull-inspection.json: 실제384 idle 전체 hull 내부 투명 pixel0, border alpha0. 기구 사이 틈은 mesh별 hull로 유지했다.
- orb-idle.png와 representative-day/night/silhouette-82.png, normal-four-and-orb-native.png를 직접 봤다. SV01 106 및 기존 Dragonfly88/Wasp76/Ray118/Worm170와 각 실제 표시 폭으로 비교했다. 3prong 실루엣·서로 다른 길이·큰 색면이 기존4종과 구분된다. 우측384 확대는 참고용이며 실제82와 명시적으로 구분했다. 합성은 통제된 배경이고 자연 게임 플레이 증거가 아니다.

source-index.json에 script/source/runtime/검사 해시 및 포구 index 계약이 있다. actual SHA256 `187f2305a21ba108ad274e9eb6a93779f8aaec7fbce9656fa62dfc18113443f4`. Blender5.2.2LTS/Cycles CPU2/24samples, 최종 idle 렌더2.75초 후 슬롯 반환했다. 소스는 actual.blend와 source-idle/charge/fire.blend이며 manifest-source-poses.json은 미렌더 상태를 포함한 준비 계약이다. 게임·공통 manifest·다른 worker 자산·GUI·Library·설치·Git·배포 변경0.
