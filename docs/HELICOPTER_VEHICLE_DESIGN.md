# Helicopter (헬리콥터) Vehicle Design

## 1. 설정 스키마 (`game-config.yaml`)
```yaml
  helicopter:                        # 헬리콥터 설정 (미사일 12발, 쌍엽기 속도, 전투기 체력)
    maxSpeed: 50                     # 쌍엽기(50)와 동일
    acceleration: 24                 # 쌍엽기(24)와 동일
    turnSpeed: 0.7
    rollSpeed: 0.55
    pitchSpeed: 0.55
    yawSpeed: 0.7
    health: 80                       # 전투기(80)와 동일 (유저 2배 시 160)
    fireRate: 10
    bulletDamage: 8                  # 유저 2배 시 16
    bulletSpeed: 210
    bulletRange: 300
    scale: 1.0
    engineType: "rotor"
    engineColor: "#00E5FF"
    glowColor: "#0099CC"
    missileCount: 12                 # 미사일 기본 12발
    missileReloadTime: 25
    model:
      body: { width: 2.2, height: 1.8, length: 6.4 }
      nose: { radius: 1.1, length: 2.2, z: 3.6 }
      cockpit: { radius: 1.15, position: { x: 0, y: 0.85, z: 1.4 } }
      tailBoom: { radiusTop: 0.28, radiusBottom: 0.55, length: 6.2, z: -5.8, y: 0.3 }
      tailFin: { width: 0.25, height: 2.1, length: 1.4, y: 1.1, z: -8.6 }
      mainRotor: { mastHeight: 1.1, bladeLength: 12.6, bladeWidth: 0.36, bladeThickness: 0.07, y: 2.05, z: 0.2 }
      tailRotor: { bladeLength: 2.2, bladeWidth: 0.22, bladeThickness: 0.06, x: 0.35, y: 1.2, z: -8.6 }
      stubWing: { width: 6.2, height: 0.28, length: 1.4, y: -0.1, z: 0.4 }
      missilePod: { radius: 0.48, length: 2.0, xOffset: 2.4, y: -0.5, z: 0.5 }
      skid: { length: 5.6, radius: 0.1, xOffset: 1.35, y: -1.6, z: 0.3 }
```

## 2. 서버 & 클라이언트 구현
- **서버 `VehicleFactory.js`**: `registerVehicleType('helicopter', this.createHelicopter.bind(this))`.
- **클라이언트 `VehicleFactory.js`**: `createHelicopterVehicleModel()`에서 `vehicleGroup.userData.mainRotor`, `vehicleGroup.userData.tailRotor`, `vehicleGroup.userData.engine`, `vehicleGroup.userData.glow` 저장.
- **클라이언트 `GameClient.js`**: `updateVehiclePropellers(deltaTime)`에서 `propeller` (`rotation.z`), `mainRotor` (`rotation.y`), `tailRotor` (`rotation.x`) 회전을 함께 처리.
- **클라이언트 `client/index.html`**: `#helicopterBtn` 카드 추가 (`🚁 헬리콥터`, `체력: 160 / 미사일: 12`).

## 3. 테스트 전략
- **단위 테스트 (`services/game-service/tests/unit/helicopter-vehicle.test.js`)**: config 제약(`missileCount === 12`, `maxSpeed === biplane.maxSpeed`, `health === fighter.health`) + `GameManager.addPlayer(..., 'helicopter')` 시 `maxHealth: 160`, `missile.ammo: 12`, `missile.maxAmmo: 12` 검증.
- **Playwright E2E (`tests/e2e/helicopter-vehicle.spec.js`)**: `#helicopterBtn` 선택 → 입장 → HUD `160/160` 및 `미사일: 12/12`, `mainRotor`·`tailRotor` 존재 및 회전 확인, 콘솔 에러 0건.
