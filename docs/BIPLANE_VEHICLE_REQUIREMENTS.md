# Biplane (쌍엽기) Vehicle Requirements

## 1. 목적
기존 전투기(`fighter`), 중형기(`heavy`), 테스트기(`test`)에 더해 클래식 복엽 비행기 **쌍엽기(`biplane`)**를 신규 기체로 추가한다.

## 2. 범위
- 설정: `services/game-service/src/config/game-config.yaml` (`vehicles.biplane`)
- 서버: `services/game-service/src/services/VehicleFactory.js` (`biplane` 타입 등록)
- 클라이언트:
  - `client/js/entities/VehicleFactory.js` (쌍엽기 3D 모델 생성 및 회전 프로펠러/엔진 등록)
  - `client/js/GameClient.js` (매 프레임 쌍엽기 프로펠러 회전 애니메이션)
  - `client/js/effects/EffectManager.js` (쌍엽기 프로펠러/엔진 부스터 연동)
  - `client/index.html` (기체 선택 화면 `🛩️ 쌍엽기` 카드 추가)
- 테스트: 단위 테스트 및 Playwright Headless Browser E2E 테스트

## 3. 기능 요구사항
1. **능력치 정책 (FR-1 — 전투기 대비 약간 느리고 약간 체력이 높음)**:
   - 모든 수치는 `game-config.yaml`의 `vehicles.biplane`에 외부화한다.
   - `maxSpeed`: `50` (전투기 `60`, 중형기 `40` 사이)
   - `acceleration`: `24` (전투기 `30`보다 약간 느림)
   - `turnSpeed: 0.65`, `rollSpeed: 0.55`, `pitchSpeed: 0.55`, `yawSpeed: 0.55`
   - `health`: 기본 `105` (전투기 `80`보다 높고 중형기 `150`보다 낮음 / 인간 플레이어 2배 적용 시 **`210 HP`**)
   - `fireRate: 11`, `bulletDamage: 9` (유저 2배 `18`), `bulletSpeed: 210`, `bulletRange: 310`, `missileCount: 4`, `missileReloadTime: 25`
2. **3D 디자인 (FR-2)**:
   - 좌표계: 전방 `+Z`, 상단 `+Y`, 좌/우 `±X`, 중심 `(0, 0, 0)`.
   - 구성 요소: 상·하 2단 날개, 좌우 날개 지주(Strut) 4개, 동체, 기수 엔진 카울링, **실시간 고속 회전하는 2엽 프로펠러**, 오픈 조종석(윈드실드), 십자형 수평·수직 꼬리날개, 고정식 랜딩기어(바퀴 2개).
   - 동체/날개는 `createBodyMaterial(vehicleData.color)`를 사용해 플레이어 색상 및 PBR 금속 패널 재질을 자동 적용한다.
3. **UI 기체 선택 (FR-3)**:
   - 차량 선택 화면에 `🛩️ 쌍엽기` 버튼(`#biplaneBtn`, `체력: 210`)을 추가하고 선택 시 `biplane` 타입으로 게임에 참가할 수 있다.

## 4. 인수 조건 (AC)
- [ ] `game-config.yaml`에 `vehicles.biplane` 설정이 존재한다.
- [ ] 서버 `VehicleFactory`가 `biplane`을 생성하며, 인간 플레이어 입장 시 `210 HP`(기본 `105 × 2`), `maxSpeed: 50`이 적용된다.
- [ ] 클라이언트 `VehicleFactory`가 상/하 날개, 지주, 회전 프로펠러, 꼬리날개, 랜딩기어를 포함한 쌍엽기 3D 모델을 생성한다.
- [ ] Playwright E2E에서 `#biplaneBtn` 선택 → 게임 입장 → HUD `210/210`, 3D 프로펠러 존재 및 회전 확인, 콘솔 에러 0건을 통과한다.
