# SkyWind INT-01 대표 적 검토본

상태: 실제 3D 모델과 중립 렌더가 생성됨. 부모 아트 검토 및 독립 시각 검토 전이며 최종 채택/게임 실행 검증을 뜻하지 않음.

## 내용
- `int01-wedge.blend`: Blender 4.3.2 편집 원본, 분리된 장갑/프레임/추진/무장/안정판 메시와 비파괴 bevel/weighted-normal 수정자
- `generator.py`: 외부 설치 없이 headless Blender에서 동일 메시/재질/카메라/렌더/투영 앵커를 재생성하는 스크립트
- `renders/int01-neutral.png`: 실제 CPU Cycles 투명 RGBA 렌더. 384×384, 128 samples. 추력 불꽃 없음
- `manifest.json`: 고정 피벗, 카메라 수치, 축, 포구/추진구/핵의 Blender Empty 투영 픽셀과 파일 해시
- `review/int01-review.png`: 기존 SV-01과 신규 적을 게임 표시 크기로 합성한 낮/밤 비교. 과거 배경에 대한 컨셉 적합성 비교이며 게임 실행 스크린샷이 아님

## 좌표와 적용
- 모델 전방 -X(화면 왼쪽), 기체 우현 +Y, 위 +Z
- 직교 카메라 위치 (0,-15,4), 목표 원점, ortho scale 5.15
- 이미지 픽셀 원점은 왼쪽 위. 원본 피벗 (192,192), 자동 크롭/재중앙 없음
- 런타임 역할 ID `beetle`, displayWidth 87. 모델 내부 디자인 ID는 `int01-wedge`
- 포구/노즐/핵은 손으로 배치하지 않고 명시된 Empty의 world-to-camera 투영에서 계산
- 핵 표시는 연결 기준점이며 중립 상태의 약점 피해 규칙을 승인한 것이 아님
- 원본 SV-01 카메라/조명 수치를 확보하지 못했으므로 기존 PNG를 참고한 시각적 추정이다. 수치 일치라고 주장하지 않음

## 재현
`blender --background --python generator.py -- --samples 128 --resolution 384`

기본 출력은 스크립트와 같은 폴더다. 이 Blender 빌드에 OpenImageDenoise가 없어 denoising을 사용하지 않는다. CPU Cycles 128 samples로 렌더했다.

## 검증 범위
- Blender 실제 메시 생성 및 .blend 저장 성공
- Cycles 실제 렌더, RGBA/투명 여백, 전방 왼쪽, 포구/노즐/핵의 카메라 투영 확인
- 기존 SV-01 참조 PNG SHA-256은 530b68cbad52545909579ad8d922fa933b85aecc8a2fab954c83760451ad0c9f 그대로
- 단일 중립 상태만 제작. 상태 전환/전체 가족/게임 탄 생성/약점 판정/메모리 검증은 이번 대표 검토본의 범위 밖

참조: `Kexxrix/skywind` 커밋 `8f9277cee5051d05cacdc39ddc5f05d4aafc3170`의 SV-01 중립·74도 PNG, MECHA_ART, 원본·실행 manifest, 당시 낮/밤 게임 이미지. 사용자 PC의 최신 미커밋 작업이나 현재 실행 증거를 대신하지 않는다.
