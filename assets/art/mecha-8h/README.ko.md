# 8시간 제작 메카닉 자산

`source/`는 실제 Blender 원본·원본 RGBA·생성 스크립트·당시 검증 자료를 보존한다. `runtime/`와 루트 `manifest.json`은 게임에 채택한 파생본이다. 원본을 runtime으로 옮기거나 원본 manifest를 최신 승인 상태로 덮어쓰지 않는다.

## 현재 연결

- 부모가 실제 Blender 메시/Cycles RGBA로 제작한 14역할·24PNG 원본을 수령했다.
- 수정 팩 `family-revision1`의 부모 독립 아트 재검수 PASS가 전달되었고 `orb`의 포구/노즐 보류가 해제되었다. 초기 보류 원본도 별도 버전에 보존한다.
- 채택한 14역할은 24개의 실제 PNG를 사용한다. 전역 고정 384×384 캔버스·(192,192) 피벗을 유지하고 게임의 기존 표시 폭을 메타데이터에 적용했다. `bastion`은 원본 제안300 대신 기존266을 유지한다.
- neutral 원본은 idle 상태다. charge는 **의도적으로 neutral 몸체를 공유**하고 실제 포구·공격 가족의 코드빛/예고로 구별한다. 별도 charge PNG는 필수 자산이 아니다.
- 일반 `mantis/claw/ray` 전개와 `needle` 반동의 원본 open 그림은 fire 상태로 매핑한다. `sourceState: open`을 보존하며 약점 보너스를 허가하지 않는다.
- 보스 다섯 종류의 실제 open 그림은 전투 `armorOpen/coreVulnerable`과 연결한다. 그림만으로 새 피해 규칙을 만들지 않는다. neutral에서는 핵이 보여도 보너스 피해를 주지 않는다.
- `worm` 수정본을 별도 source 버전에 보존했고 runtime을 갱신했다. 중간 포구의 2D 투영이 앞 함체와 겹치므로 실제 좌표를 유지한 채 발사 표시를 몸체·전경 이후 합성한다. 부모 모델 사출선 검수와 실제 로컬 표시 검수는 분리한다.

## 재현과 좌표

초기 대표 원본은 `source/int01/int01-wedge.blend`와 generator다. 현재 가족 원본은 `source/family-revision1/editable-export/family/sources/`의 14개 .blend다. 각 역할 manifest가 생성에 사용한 `family_generator.py`, `family_generator_v1.py` 또는 `representative_generator.py`를 가리킨다. 초기 family-v1도 보존했다. 스크립트의 기본 참조 경로를 보존할 목적으로 함께 제공된 interceptor 대표 계층도 그대로 보존했다. 재현 렌더는 별도 작업에서 명시적으로 실행하며 이 문서의 저장·검사가 렌더를 실행하지 않는다.

Blender Empty의 실제 카메라 투영값을 `muzzlesPixels`, `nozzlesPixels`, `corePixels`, `muzzleDirectionsPixels`로 보존했다. 세계 변환은 `src/mecha-art.js`의 동일한 회전·반사 함수로 처리하며 그림·포구·추진·핵·방향에 같이 적용한다. 추진불꽃은 PNG에 굽지 않고 코드층에서 그린다.

원본마다 SHA-256, 카메라/렌더 조건, 실제 제작 방식과 한계가 기록되어 있다. `SV-01`의 수치 카메라를 확보한 것으로 주장하지 않는다. 부모의 모델·대표 시각 검수와 실제 로컬 게임 크기·프레임·입력 검수는 별개다.

관련 기술 검사는 `tests/8h-visuals.test.js`, 구현·관측 기록은 `.work/8h-build/C01-notes.md`에 있다. 공개 build는 runtime manifest/PNG만 포함하며 .blend·generator·과거 검증 자료는 포함하지 않는다.
