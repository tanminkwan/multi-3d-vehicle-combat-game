# Biplane (쌍엽기) Vehicle Design

## 1. 설정 스키마 (`services/game-service/src/config/game-config.yaml`)
```yaml
  biplane:                           # 쌍엽기 설정 (전투기 대비 약간 느리고 약간 높은 체력)
    maxSpeed: 50                     # 전투기(60)보다 약간 느림
    acceleration: 24                 # 전투기(30)보다 약간 느림
    turnSpeed: 0.65
    rollSpeed: 0.55
    pitchSpeed: 0.55
    yawSpeed: 0.55
    health: 105                      # 전투기(80)보다 높음 (유저 2배 시 210)
    fireRate: 11
    bulletDamage: 9                  # 유저 2배 시 18
    bulletSpeed: 210
    bulletRange: 310
    scale: 1.0
    engineType: "propeller"
    engineColor: "#FFCC33"
    glowColor: "#FF9900"
    missileCount: 4
    missileReloadTime: 25
    model:
      body: { width: 1.8, height: 1.4, length: 7.2 }
      nose: { radiusTop: 0.65, radiusBottom: 1.05, length: 2.2, z: 4.2 }
      upperWing: { width: 13.0, height: 0.35, length: 2.4, y: 1.65, z: 1.0 }
      lowerWing: { width: 11.6, height: 0.35, length: 2.2, y: -0.55, z: 0.6 }
      strut: { radius: 0.1, height: 2.2, xPositions: [-4.6, -2.2, 2.2, 4.6], z: 0.8 }
      propeller: { bladeLength: 3.4, bladeWidth: 0.32, bladeThickness: 0.08, spinnerRadius: 0.38, z: 5.45 }
      cockpit: { radius: 0.85, position: { x: 0, y: 0.95, z: -0.6 } }
      tailHorizontal: { width: 4.6, height: 0.25, length: 1.5, y: 0.3, z: -3.8 }
      tailVertical: { width: 0.28, height: 2.0, length: 1.8, y: 1.15, z: -3.7 }
      landingGear: { wheelRadius: 0.55, wheelWidth: 0.28, xOffset: 1.4, y: -1.65, z: 1.4 }
```

## 2. 서버 확장 (Factory Pattern / OCP)
- `services/game-service/src/services/VehicleFactory.js`:
  - `registerVehicleType('biplane', this.createBiplane.bind(this))` 추가.
  - 기존 `Vehicle`, `VehicleManager`, `VehicleHealthPolicy`와 그대로 결합되어 인간 플레이어 2배 체력(`210`) 및 화력(`18`/`60`) 자동 적용.

## 3. 클라이언트 3D 모델 및 프로펠러 애니메이션
- `client/js/entities/VehicleFactory.js`:
  - `registerVehicleCreators()`에 `'biplane'` 등록 및 `createBiplaneVehicleModel(vehicleGroup, vehicleData)` 구현.
  - 프로펠러 그룹(`propellerGroup`)을 `vehicleGroup.userData.propeller = propellerGroup`으로 저장.
  - `GameClient.animate()`에서 `updateVehiclePropellers(deltaTime)`를 호출해 모든 `userData.propeller` 보유 기체의 프로펠러를 `rotation.z += spinSpeed * deltaTime`로 회전(가속 시 더 빠르게 회전).
- `client/js/effects/EffectManager.js`:
  - `updateBoosterEffect`에서 `biplane` 타입(프로펠러 + 배기 글로우)도 안전하게 처리.
- `client/index.html`:
  - `#biplaneBtn` 카드 추가 및 `selectVehicle('biplane')` 하이라이트 처리.

## 4. 테스트 전략
- **단위 테스트 (`services/game-service/tests/unit/biplane-vehicle.test.js`)**:
  - `game-config.yaml`의 `biplane` 스탯이 전투기 대비 약간 느리고(`biplane.maxSpeed < fighter.maxSpeed`), 체력이 더 높은지(`biplane.health > fighter.health`) 검증.
  - `VehicleFactory.createVehicle(..., { vehicleType: 'biplane' })` 생성 및 `GameManager.addPlayer(..., 'biplane')` 시 유저 `210 HP` / `maxSpeed: 50` / 기관총 데미지 `18` 검증.
- **Playwright E2E (`tests/e2e/biplane-vehicle.spec.js`)**:
  - `#biplaneBtn` 표시·선택 → 게임 입장 → HUD `210/210`, `myVehicle.userData.propeller` 존재 및 프로펠러 회전 확인, 콘솔 에러 0건 검증.
