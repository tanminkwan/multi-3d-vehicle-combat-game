# Player-Only Vehicle Health Multiplier Design

## 1. 모듈 책임 분리 (SOLID)
- **`VehicleHealthPolicy.js` (SRP)**:
  - `resolveVehicleMaxHealth(baseHealth, { isNpc = false, playerHealthMultiplier = 1.0 })` 순수 함수 제공.
  - `isNpc === true`이면 `baseHealth` 그대로 반환.
  - `isNpc === false`이고 `playerHealthMultiplier`가 양수 유한수이면 `Math.round(baseHealth * playerHealthMultiplier)` 반환, 아니면 `baseHealth` 반환.
- **`VehicleManager.js`**:
  - `createVehicleForPlayer(playerId, vehicleType, color, options = {})`에서 `isNpc = Boolean(options.isNpc)`를 받아 `resolveVehicleMaxHealth`로 최종 `maxHealth` 계산 후 `vehicle.maxHealth` / `vehicle.health`에 적용.
  - `Vehicle.respawn()`은 `this.health = this.maxHealth`를 사용하므로 리스폰 시 자동 유지.
- **`GameManager.js`**:
  - `addPlayer()`에서 `this.vehicleManager.createVehicleForPlayer(player.id, vehicleType, player.color, { isNpc })` 전달.
- **`client/index.html`**:
  - 차량 선택 카드의 체력 안내를 유저 기준(`전투기: 160`, `중형기: 300`, `테스트기: 40`)으로 갱신.

## 2. 설정 스키마 (`game-config.yaml`) 및 Docker 볼륨
```yaml
game:
  playerHealthMultiplier: 2.0        # 인간 플레이어 전용 체력 배율 (NPC 제외)
  playerDamageMultiplier: 2.0        # 인간 플레이어 전용 화력(기관총/미사일) 배율 (NPC 제외)
```
- `docker-compose.yml`의 `game-service`에 `./services/game-service/src/config/game-config.yaml:/app/services/game-service/src/config/game-config.yaml:ro` 볼륨을 추가해 이미지 재빌드 없이 호스트에서 수치를 조정하고 `docker compose restart game-service`로 즉시 반영한다.

## 3. 테스트 전략
- **단위 테스트 (`services/game-service/tests/unit/player-health-multiplier.test.js`)**:
  - `resolveVehicleMaxHealth` 순수 함수 검증(인간 2배, NPC 1배, 잘못된 배율 폴백).
  - `GameManager.addPlayer()`(인간 vs NPC) 및 리스폰 후 체력 유지 검증.
- **Playwright E2E (`tests/e2e/player-health-multiplier.spec.js`)**:
  - `game-service` 재시작 후 인간 플레이어 `fighter` 입장 → `maxHealth === 160`, HUD `160/160`, 같은 방의 NPC 기체들은 `80`(fighter) / `150`(heavy) 유지 확인.
