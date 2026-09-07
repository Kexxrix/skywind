# SkyWind 패치 설계 및 SoundFX 검토

1. PATCH_DESIGN.html: 사용자 개선 의견을 반영한 상세 설계안. 같은 내용의 Markdown 포함.
2. SoundFX_Audition.html: 오디오가 내장된 단독 HTML. 브라우저로 열어 67개 전체 후보와 데모 비교. 별도 로컬 서버 불필요.
3. audio/demos/03_fixed_then_varied_AB.wav: 고정 반복 → 1초 무음 → 변주. 실제 게임 녹화가 아닌 제공 샘플 시험.
4. SOUND_CATALOG.md / sound_manifest.json: 모든 파일의 후보 역할과 기술 확인.
5. audio/original: 첨부 사운드 원본을 변경 없이 보존. so_com 일부는 확장자와 실제 형식이 다름.

게임 변경·배포는 하지 않았습니다. 사운드는 신호/구조 기반 후보이며 청각적 의미·음색 승인은 별도입니다. 출처·권한 미확인 파일은 공개 적용 승인으로 간주하지 않습니다.

HTML 검증: Chromium에 문서 내용을 직접 로드해 데스크톱/모바일 레이아웃, 검색, 재생 진행, 다른 음원 정지를 검사했습니다. 이 실행 환경의 file:// 탐색은 차단되어 set_content로 렌더했습니다. 귀로 듣는 품질 평가는 수행하지 않았습니다.
