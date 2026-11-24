# 기관총 사정권 표시(Gun Hit Zone Indicator) 요구사항 정의서

- **문서 버전:** v1.0
- **작성일:** 2026-11-24
- **대상 브랜치:** `stabilization`
- **대상 시스템:** Multiplayer 3D Vehicle Combat Game (`services/game-service`, `client`)

---

## 1. 개요

### 1.1 목적
현재 초록 실선 박스(`awareness`)는 전방 ±90도 내 가장 가까운 적의 위치만 알려주므로, 실제 기관총을 발사했을 때 명중하는지 사용자가 직관적으로 알기 어렵다. 기관총의 실제 탄도(총구 위치, 정면 직선 방향, 사거리, 충돌 반경)를 기준으로 **지금 발사하면 맞출 수 있는 적**을 판별하고, **초록 실선 박스 바깥쪽에 번쩍이는 외곽 표시**를 띄워 즉각적인 사격 타이밍을 인지할 수 있게 한다.

### 1.2 범위
- **포함 범위**
  - `game-config.yaml`에 기관총 사정권 판별 파라미터(`targeting.gunHitIndicator`) 외부화
  - 기관총 직선 탄도 기반 명중 가능 타겟 판별 모듈 (`GunHitZoneEvaluator`, SOLID SRP)
  - `TargetingManager` / `PlayerManager`에 `gunTargetId` 상태 추가 및 `gameStateUpdate` 동기화
  - 클라이언트 `UIManager` 및 `main.css`에 초록 실선 박스 바깥쪽의 고시인성 번쩍임 외곽 프레임(`.gun-in-range`) 및 `FIRE` 라벨 추가

---

## 2. 기능 요구사항 (Functional Requirements)

### FR-01. 기관총 명중 가능 판별 (서버)
- 실제 `MachineGun` 발사체 물리(`muzzleOffset = 8`, 정면 방향 벡터 `forward`, 비행체별 `bulletRange`, `WeaponSystem` 충돌 반경 `5` 유닛)와 동일한 기하 조건으로 판별한다.
  1. 총구 위치 $\vec{p}_m = \vec{p}_{\text{self}} + \hat{f} \cdot \text{muzzleOffset}$ 에서 정면 단위벡터 $\hat{f}$ 방향 투영 거리 $t = (\vec{p}_{\text{enemy}} - \vec{p}_m) \cdot \hat{f}$ 가 $0 \le t \le \text{bulletRange}$ 일 것
  2. 탄도 직선과 적 중심 사이의 수직 거리 $d_\perp = \|(\vec{p}_{\text{enemy}} - \vec{p}_m) - \hat{f} \cdot t\|$ 가 `hitRadius` 이내일 것
  3. 적 비행체가 활성(`active === true`) 상태이며 지형 장애물에 가려지지 않았을 것
- 조건을 만족하는 적이 여럿이면 가장 가까운 적을 `player.gunTargetId`로 설정하고, 없으면 `null`로 설정한다.

### FR-02. 초록 실선 박스 바깥쪽 번쩍임 표시 (클라이언트 UI)
- `myPlayerData.gunTargetId`에 해당하는 타겟의 `.target-box`에 `gun-in-range` 클래스를 적용한다.
- 초록 실선 박스(`awareness`) 바깥쪽(`inset: -12px`)에 **강렬한 빨강/주황 네온 외곽 프레임**이 빠르게 번쩍이는 애니메이션(`gunFlash`)으로 표시되어야 한다.
- 외곽 상단에 `FIRE` 텍스트가 함께 번쩍여 한눈에 사격 가능 시점을 인지할 수 있어야 한다.
- 적이 사정권이나 조준선에서 벗어나 `gunTargetId === null`이 되면 외곽 번쩍임 표시가 즉시 사라지고 원래 초록/노란 박스만 남는다.
- 미사일 락온 박스(`lock-on-progress` / `locked-on`)가 활성화된 적이라도 기관총 사정권에 들어오면 동일하게 외곽 번쩍임이 함께 표시된다.

---

## 3. 비기능 요구사항 (Non-Functional Requirements)
- **하드코딩 금지:** `muzzleOffset`, `hitRadius`, `defaultRange`, `enabled`는 `game-config.yaml`에서 로드한다.
- **SOLID 준수:** 기관총 탄도 판별 로직을 `GunHitZoneEvaluator`로 분리(SRP)하고 `TargetingManager`에 주입(DIP)한다.

---

## 4. 인수 조건 (Acceptance Criteria)

| ID | 테스트 시나리오 | 기대 결과 |
|---|---|---|
| **AC-01** | 정면 조준선 + 사거리 내 적 배치 | `player.gunTargetId`가 해당 적 차량 ID로 설정됨 |
| **AC-02** | 사거리 초과 또는 측면(수직 오차 > `hitRadius`) 적 배치 | `player.gunTargetId === null` (초록 박스는 유지되어도 사정권 표시 없음) |
| **AC-03** | 클라이언트 외곽 번쩍임 UI (Playwright E2E) | `gunTargetId` 설정 시 `.target-box.gun-in-range`가 렌더링되고 외곽 `::before`/`::after` 애니메이션 스타일이 적용되며, `null` 시 즉시 해제됨 |
