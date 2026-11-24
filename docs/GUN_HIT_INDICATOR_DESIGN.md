# 기관총 사정권 표시(Gun Hit Zone Indicator) 상세 설계서

- **문서 버전:** v1.0
- **작성일:** 2026-11-24
- **대상 브랜치:** `stabilization`
- **연관 문서:** [GUN_HIT_INDICATOR_REQUIREMENTS.md](./GUN_HIT_INDICATOR_REQUIREMENTS.md)

---

## 1. 모듈 설계 (SOLID)

### 1.1 `GunHitZoneEvaluator` (`services/game-service/src/services/GunHitZoneEvaluator.js`) — SRP
- 생성자: `(config = {})` (`config.targeting?.gunHitIndicator`, `config.vehicles`)
- 메서드: `findGunTarget(shooterVehicle, enemies, hasObstacleFn = null)`
  - `enabled === false`이거나 `!shooterVehicle?.active`이면 `null` 반환.
  - 정면 벡터 `forward`: `MachineGun.js`와 동일한 `(sin(y)*cos(x), -sin(x), cos(y)*cos(x))`.
  - 총구 위치: `shooterVehicle.position + forward * muzzleOffset`.
  - 사거리: `config.vehicles?.[shooterVehicle.vehicleType]?.bulletRange ?? defaultRange`.
  - 각 활성 적에 대해 투영 거리 `t`와 수직 거리 `perpDist` 계산 → `0 <= t <= range && perpDist <= hitRadius`이고 장애물이 없으면 후보로 채택, 최소 `t` 적 반환.

### 1.2 `TargetingManager` & `PlayerManager` 연동
- `PlayerManager`: 플레이어 객체에 `gunTargetId: null` 필드 추가.
- `TargetingManager`: `GunHitZoneEvaluator`를 주입받아 `update()`에서 `player.gunTargetId = gunTarget ? gunTarget.id : null` 갱신, `clearAllTargets()`에서 `player.gunTargetId = null` 초기화.

### 1.3 클라이언트 UI (`UIManager.js`, `client/css/main.css`)
- `UIManager.updateTargetingIndicators()`:
  - 타겟별 `isGunInRange = (targetId === myPlayerData.gunTargetId)` 판별.
  - `drawTargetBox(targetVehicle, style, camera, rendererDomElement, isGunInRange)`에서 `isGunInRange`가 `true`이면 `gun-in-range` 클래스 추가.
  - `gunTargetId`가 `awarenessTargetId` / `lockOnTargetId`와 다른 적을 가리킬 때도 `awareness gun-in-range`로 표시.
- `client/css/main.css`:
  - `.target-box.gun-in-range::before`: `position: absolute; inset: -14px; border: 3px solid #ff2a2a; box-shadow: 0 0 14px #ff2a2a, inset 0 0 10px rgba(255,42,42,0.5); animation: gunFlash 0.28s infinite alternate;`
  - `.target-box.gun-in-range::after`: `content: 'FIRE!';` 외곽 상단(`top: -32px`) 빨강/노랑 번쩍임 라벨.

---

## 2. 테스트 전략
1. **단위 테스트 (`services/game-service/tests/unit/gun-hit-zone.test.js`)**:
   - 정면 사거리 내 적 → `gunTargetId` 반환
   - 사거리 초과 적 → `null`
   - 수직 오차(`perpDist > hitRadius`) 적 → `null`
   - 등 뒤(`t < 0`) 적 → `null`
   - 장애물 가림 시 → `null`
   - `TargetingManager.update()` 통합 연동 검증
2. **Playwright E2E (`tests/e2e/gun-hit-indicator.spec.js`)**:
   - 실제 `http://localhost`에서 `gunTargetId` 동기화 시 `.target-box.gun-in-range` 클래스, `::before` 외곽 프레임, `::after` `FIRE!` 라벨 및 해제 동작 검증
