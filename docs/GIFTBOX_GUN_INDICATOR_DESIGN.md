# Gift Box Gun Hit-Zone Indicator Design

## 1. 책임 분리 (SOLID)
- **`GunHitZoneEvaluator.js` (SRP / OCP)**:
  - `findGunTarget(shooterVehicle, candidates, hasObstacleFn, hitRadiusOverride)`로 일반화.
  - `findGunGiftBoxTarget(shooterVehicle, giftBoxes, hasObstacleFn)` 메서드를 추가해 `this.giftBoxHitRadius`로 활성 선물 상자를 판별.
- **`TargetingManager.js`**:
  - `update(player, vehicle, enemies, deltaTime, giftBoxes = [])`에서 `player.gunGiftBoxTargetId`를 갱신하며, 기존 적 비행체 `awarenessTargetId`/`lockOnTargetId`/`gunTargetId` 로직은 그대로 유지.
- **`UIManager.js` & `client/css/main.css`**:
  - `updateTargetingIndicators(..., giftBoxes)`에서 `myPlayerData.gunGiftBoxTargetId`가 있으면 `drawTargetBox(giftBoxMesh, 'gun-only', ..., true, myPlayerData.gunGiftBoxTargetId)` 호출.
  - `.target-box.gun-only { border: none; }`로 초록 실선 박스를 제거하고 `.gun-in-range::before` / `::after`(`FIRE!`)만 표시.

## 2. 설정 스키마 (`game-config.yaml`)
```yaml
targeting:
  gunHitIndicator:
    enabled: true
    muzzleOffset: 8
    hitRadius: 5.5
    giftBoxHitRadius: 5.5
    defaultRange: 300
```

## 3. 테스트 전략
- **단위 테스트 (`services/game-service/tests/unit/giftbox-gun-indicator.test.js`)**:
  - `GunHitZoneEvaluator.findGunGiftBoxTarget`: 정면 사거리 내 선물 상자 탐지, 측면/후방/사거리 초과/비활성 상자 제외.
  - `TargetingManager.update`: 선물 상자 조준 시 `gunGiftBoxTargetId`만 설정되고 `awarenessTargetId`는 `null` 유지.
- **Playwright E2E (`tests/e2e/giftbox-gun-indicator.spec.js`)**:
  - 실제 게임 접속 후 선물 상자 정면 조준 시 `.target-box.gun-only.gun-in-range` 표시, `border-style: none`(초록 실선 박스 없음), `FIRE!` 배지 활성 확인 및 해제 시 제거 검증.
