# Helicopter (헬리콥터) Vehicle Requirements

## 1. 목적
미사일 화력에 특화된 신규 공격 헬리콥터 기체(`helicopter`)를 추가한다.

## 2. 범위
- 설정: `services/game-service/src/config/game-config.yaml` (`vehicles.helicopter`)
- 서버: `services/game-service/src/services/VehicleFactory.js` (`helicopter` 타입 등록)
- 클라이언트:
  - `client/js/entities/VehicleFactory.js` (공격 헬리콥터 3D 모델 + 메인/테일 로터)
  - `client/js/GameClient.js` (매 프레임 메인 로터 Y축 및 테일 로터 X축 회전 애니메이션)
  - `client/index.html` (`🚁 헬리콥터` 기체 선택 카드 추가)
- 테스트: 단위 테스트 및 Playwright Headless Browser E2E 테스트

## 3. 기능 요구사항
1. **능력치 정책 (FR-1)**:
   - 모든 수치는 `game-config.yaml`의 `vehicles.helicopter`에 외부화한다.
   - **미사일**: 기본 `missileCount: 12` (재장전 `25초`)
   - **속도**: 쌍엽기와 동일 (`maxSpeed: 50`, `acceleration: 24`)
   - **체력**: 전투기와 동일 (`health: 80` / 인간 플레이어 2배 적용 시 **`160 HP`**)
   - 기관총: `fireRate: 10`, `bulletDamage: 8` (유저 2배 `16`), `bulletSpeed: 210`, `bulletRange: 300`
2. **3D 디자인 (FR-2)**:
   - 좌표계: 전방 `+Z`, 상단 `+Y`, 좌/우 `±X`, 중심 `(0, 0, 0)`.
   - 구성 요소: 동체, 틴티드 글래스 조종석, **상단 4엽 회전 메인 로터**, 테일 붐 + 수직 미익 + **회전 테일 로터**, 좌우 무장 스텁 윙 + 미사일 포드 2개, 하단 스키드 랜딩기어, 후방 배기 글로우.
   - 동체/스텁윙은 `createBodyMaterial(vehicleData.color)`를 사용해 플레이어 색상 및 PBR 금속 패널 재질을 적용한다.
3. **UI 기체 선택 (FR-3)**:
   - 차량 선택 화면에 `🚁 헬리콥터` 버튼(`#helicopterBtn`, `체력: 160 / 미사일: 12`)을 추가한다.

## 4. 인수 조건 (AC)
- [ ] `game-config.yaml`의 `helicopter` 설정이 `missileCount === 12`, `maxSpeed === biplane.maxSpeed`, `health === fighter.health`를 만족한다.
- [ ] 서버 `GameManager.addPlayer(..., 'helicopter')` 시 유저 `160 HP`, 미사일 `12/12`가 장착된다.
- [ ] 클라이언트 3D 모델에 `mainRotor`와 `tailRotor`가 존재하고 매 프레임 회전한다.
- [ ] 단위 테스트 및 Playwright E2E 테스트가 모두 통과한다.
