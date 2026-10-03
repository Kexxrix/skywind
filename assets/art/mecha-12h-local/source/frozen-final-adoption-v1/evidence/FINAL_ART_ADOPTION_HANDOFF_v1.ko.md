# 채택용 아트 참조 인계

## 현재 사용할 후보

| 범위 | manifest | source/검증 참조 | 상태 |
|---|---|---|---|
| 전체5보스와 Carrier matching child | frozen-five-boss-finish-v1/manifest-candidate.json | 역할별actual.blend·source blend·production, SOURCE_RECEIPT.json, FILE_LEDGER.json, provenance/ | 전체 렌더 및 자체QC 완료. WCL전체/BA대표 방향 독립통과. BA전체 및 최신runtime 최종검수는 별도 |
| 확정 방향 일반전7종+Scarab matching child | NORMAL_SEVEN_ADOPTION_CANDIDATES.json | NORMAL_SEVEN_ADOPTION_SOURCES.json의 원본manifest/actual 경로·해시 | 기존 후보의 정확한 선택/경로 인덱스. 방향 통과와 실제 실행 채택은 구분 |
| 남은 Mantis/Orb/Claw/Needle | REMAINING_FOUR_REPRESENTATIVES_v1.json | REMAINING_FOUR_REPRESENTATIVES_SOURCE_INDEX_v1.json 및 역할별 검수 보고 | idle 끝점4PNG만. 독립 대표gate 전 추가 상태 채택/양산하지 않음 |
| Beetle | 기존 코드 총괄의 현행 소스 | 새 모델·새manifest항목 생성 없음 | 기존 동작·외형 보존 |

5보스 동결은 6entries/60고유 runtimePNG다. FILE_LEDGER의151파일 재검사 불일치0, ledger SHA256 `ff0cf0f1a123168147ea3620405f4e7d0ccab0115de8addf603d83e776696858`. WCL최종모델과 BA원본22파일은 정확한 바이트 사본이며 불필요한blend 재저장이 없다. 각원본producer의 authoritative production을 검사한 다음 복사했다. code loader의5보스/4payload 진행률별보호48건 PASS. 피해/자연개방/실제전투는 기존 기능회귀 및 최신코드 QA를 따른다.

Apex의 과거 production에 포함된 비교판4개 stalehash는 원자료 `production-representative-original.json`로 보존하고, 최종 production은 sourceblend/runtimePNG만 기록했다. 파생비교/QC는 별도 diagnostic-index다. 보존한 옛production을 최신 authoritative 검사 대상으로 사용하지 않는다. 최종 SOURCE_BYTE_LEDGER/FULL_SOURCE_PRESERVATION/FINAL_HASHES는 provenance에 있다.

일반7종 인덱스는 Dart96/1포구, Scarab144/0(독립child1포구), Pincer96/0, Dragonfly88/1, Wasp76/0, Ray118/2, Worm170/3를 선택한다. 8entries는7종과appearance-only Scarab child이며 새종8개라는 뜻이 아니다. 공통코드·원본모델·기존manifest를 바꾸지 않고 선택한 entry의 source/PNG 경로만 local-art 기준으로 연결했다.

원본 frozen-boss-candidates-v2 전체manifest를 최신5보스로 사용하지 않는다. 그 원본의 Pincer만 일반7 인덱스가 선택한다. frozen-dart-scarab-v1에는 확정Dart/Scarab/child가 있으며 Scarab child의 appearanceKey를 일반 Dragonfly 모델과 혼동하지 않는다. normal7인덱스의참조를 그대로 사용하면 서로의 source나matchingChild key를 바꾸지 않는다.

대표4종은 Mantis96/2포구·Orb82/3·Claw108/2·Needle112/1이다. index의idle4PNG를 실제display규격으로그린 NORMAL_ELEVEN_ROLE_COMPARISON_day.png/night.png를 직접 확인했다. SV01은106, 기존7종도각source display크기다. 이는 controlled synthetic 비교이며 자연플레이/실제runtime 캡처가 아니다. 기존Beetle를포함하여 일반전은총12종이며 보스와matchingChild는 별도 범주다. 새 종/거대한신규기구를추가하지 않았다.

Claw는 기존 준비된 drumgun source-idle/actual/PNG바이트를 그대로 재사용했고source projected5anchor오차0.000062px미만, loader/분리hullgap0/border0/corefalse다. 원래생성스크립트의잘못된rail sniper주석은 SOURCE_LABEL.ko.md로구분하며source바이트를다시쓰지않았다. Orb는v2슬리브matrix갱신오류를보존하고수정된v3만대표로선택했다. Orb물리포구방향.16rad는 canonical발사위상에더하지않으며코드변경0이다. Mantis/Needle의두총공간과coil receiver는현재ROLE_MAP의행동을표현한다.

이 인계는 로컬아트 생성·검증·동결까지다. 게임코드/공통manifest/최신실행채택/Git게시/배포는 수정하지 않았다. 모든collision/포구/방향점/core/노즐/pivot/스케일을출처metadata에서읽고코드총괄이공통manifest에직접통합한다. 공격·취약권한과최신타이밍은코드총괄소유다. 남은매끈한장갑/평면core는P2미감기록이며필수완료기준을낮춘것이아니다.

다음 단계는 남은4종 대표의독립방향검수와그후필요charge/fire/recovery상태의일관성완성, 최신runtime 통합확인이다. 05:00UTC신규계열중단/06:00종료를유지한다.
