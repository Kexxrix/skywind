# SkyWind 검증본 공개 반영 — 2026-10-02

사용자가 `2026-10-02 17:02:40 UTC`에 “배포사이트에 적용해”라고 요청했다(D51). 종료된 8시간 제작과 별개의 기존 사이트 배포 승인이다. 게임 기능·자산·난도는 추가로 수정하지 않았다.

**결과: 기존 공개 사이트에 Sites 버전7 반영 성공.** 호스팅의 `succeeded` 시각은 `2026-10-02 17:24:47.539510 UTC`이며, 후속 동일 대상 조회에서 공개 범위와 버전·URL을 확인했다.

- 공개 주소: https://skywind.kexxadrix.chatgpt.site
- 대상: `appgprj_6a9c5fa064288191a799816ed259f986`(SkyWind), 기존 `public` 유지.
- 버전 ID: `appgprj_6a9c5fa064288191a799816ed259f986~appgver_0429a344995c81918f7a038aabdc5f5e`.
- 배포 ID: `appgdep_6abfe8cf89308191bd40ac896decf963`.
- 검증 게임 커밋: `e5e139c46a7e00c4c23cde3efe56040c5079c595`; 로컬 문서 커밋은 `1f13ea16766b2cc73a45da0b68e3ac9f399c2e79`.
- 기존 Sites 전용 저장소의 배포 소스 커밋: `000394529ace79ee3ac53fc3c8df29a2793037be`. GitHub `Kexxrix/skywind`의 main·원격 설정은 변경하지 않았다. 기존 Sites 저장소만 정상 push했으며 새 저장소·강제 push·공개 범위 확대는 없다.

## 적용과 검증

checkpoint-03의5단계·실제5보스·반복 지옥, 조작·전투·실제3D 렌더 자산·효과음 연결과 두 QA 결함 수정본을 반영했다. 실행129파일/34,304,426바이트의 집계 SHA256은 `02eb951781d6d8b44eff48dd5191bed0f48486076d9a4bdc7380bce0e072746d`다. 기존 Sites 소스를 전용 폴더에 복원하고 검증 커밋의 동일 실행 바이트를 반영했다. 패키지 안의129파일도 각각 크기·SHA256이 같으며, 호스팅 설정1파일을 포함한130파일이 저장됐다.

동일 게임 소스의210/210테스트·205건 결함 재현 실패0·실시간5보스 후 지옥 관측은 [제작 보고서](WORK_REPORT_20261002_8H.ko.md)의 결과를 재사용했다. 배포 때문에 재빌드·전체5분 QA를 반복하지 않았다. 현재 Sites 지침에 따라 native 성공 상태·URL을 완료 근거로 사용했으며, 게시 후 공개 HTTP fetch·브라우저 탐색은 하지 않았다. 새 캡처·영상0, 설치·새 생성 API·Library 저장 재시도0이다. 기존 로컬 게임은 음소거·정지 상태를 유지했다. 직접 청음·실기 모바일·사람 난이도/재미 검수는 계속 보류다.

## 롤백과 기록

배포 직전 실제 공개본은 문서의 과거 버전5가 아니라 **버전6**이었다. 복구 대상은 `appgprj_6a9c5fa064288191a799816ed259f986~appgver_566c778699f481918c7b3406a54d74f8`, 소스 `961ef8fb13e7602784a5e13841529b10b85f46a0`이며 기존 archive가 보존되어 있다. 필요하면 같은 Sites 대상에서 이 저장 버전을 다시 배포한다. Git reset·force push는 필요하지 않다.

로컬 증거는 `.work/deploy-20261002/DEPLOYMENT_RECEIPT.json`, `PREPARED_SOURCE.json`, `ARCHIVE_IDENTITY.json`이다. 배포 패키지는 같은 폴더의 `SkyWind_checkpoint03_site.tar.gz`이며 공식 Sites 저장에 사용했다. 앞선 제작 보고서와 Library 실패 영수증은 변경하지 않았다.
