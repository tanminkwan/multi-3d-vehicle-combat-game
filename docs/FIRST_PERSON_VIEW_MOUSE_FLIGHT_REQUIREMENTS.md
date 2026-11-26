# 1인칭 시점 전환 시 내 기체 숨김 및 마우스 이동 지원 요구사항 정의서

## 1. 목적 (Purpose)
플레이어가 `V` 키로 시점 전환(1인칭 조종석 시점)을 했을 때:
1. 서버 상태 동기화(`gameState` / 리스폰 이벤트)로 인해 **내 비행체(`myVehicle`)가 다시 표시되어 전방 시야를 완전히 가리는 문제**를 해결한다.
2. 1인칭 시점 전환 상태에서도 포인터 락으로 커서가 사라지지 않고, 3인칭과 동일하게 **마우스 우클릭 3D 공간 이동(Mouse Flight)** 이 정상 동작하도록 개선한다.

## 2. 범위 (Scope)
- **포함**:
  - `game-config.yaml`에 1인칭 시점 정책(`camera.firstPerson.hideOwnVehicle`, `camera.firstPerson.usePointerLock`) 및 마우스 이동 1인칭 허용 설정(`client.mouseFlight.allowInFirstPerson`) 추가
  - 1인칭 시점 가시성/마우스 이동 정책 모듈(`FirstPersonViewPolicy`) 신설 (SOLID 준수)
  - `CameraManager`, `InputManager`, `GameClient` 통합 (매 프레임 `gameState` 업데이트, 리스폰, 무적 깜빡임, 생성 시에도 내 기체 숨김 유지; 다른 플레이어/NPC 기체는 정상 표시)
  - 1인칭 시점에서의 커스텀 비행 커서 유지, 우클릭 3D 레이캐스팅 웨이포인트 설정 및 자동 비행 조향
  - 단위 테스트 및 Playwright Headless Browser E2E 테스트
- **제외**:
  - 별도 조종석(HUD/Cockpit) 3D 내부 모델링 추가
  - 서버 물리/충돌 로직 변경

## 3. 기능 요구사항 (Functional Requirements)

| ID | 요구사항 | 상세 설명 |
|---|---|---|
| FR-01 | 1인칭 시점 내 기체 완전 숨김 | `V` 키로 1인칭 시점 전환 시 `myVehicle.visible`이 `false`가 되며, 이후 서버 `gameState` 주기 업데이트, 무적 깜빡임, 리스폰 시에도 `false`가 유지되어야 한다. |
| FR-02 | 타 기체 가시성 유지 | 1인칭 시점에서도 다른 플레이어 및 NPC 기체는 서버 가시성(`visible`/`active`)에 따라 정상적으로 화면에 표시되어야 한다. |
| FR-03 | 3인칭 복귀 시 내 기체 복원 | `V` 키로 다시 3인칭 시점으로 전환하면, 내 기체가 활성(`visible !== false && active !== false`) 상태일 때 즉시 다시 표시되어야 한다. |
| FR-04 | 1인칭 시점 마우스 우클릭 이동 | 1인칭 시점에서도 `gameCanvas` 우클릭 시 1인칭 카메라 기준 3D 레이캐스팅으로 웨이포인트가 설정되고 기체가 해당 지점으로 자동 조향·이동해야 한다. |
| FR-05 | 1인칭 시점 포인터 락 비활성화 및 커서 유지 | `camera.firstPerson.usePointerLock: false` 및 `client.mouseFlight.allowInFirstPerson: true` 설정 시 1인칭 전환 후에도 포인터 락을 요청하지 않으며, 커스텀 비행 커서(`.mouse-flight-enabled` / `.mouse-flight-active`)가 유지되어야 한다. |
| FR-06 | 시점 전환 시 웨이포인트 연속성 | `allowInFirstPerson: true`일 때 비행 중 `V` 키로 시점을 전환해도 진행 중인 마우스 웨이포인트가 강제 취소되지 않아야 한다. |
| FR-07 | 키보드 수동 오버라이드 유지 | 1인칭 마우스 이동 중에도 키보드 이동 키(`W/A/S/D/Shift/Ctrl/Space/X/Q/E`) 입력 시 마우스 자동 이동이 즉시 취소되어야 한다. |

## 4. 비기능 요구사항 (Non-Functional Requirements)
- **NFR-01 (설정 외부화)**: 하드코딩 없이 `services/game-service/src/config/game-config.yaml`의 `camera.firstPerson.*` 및 `client.mouseFlight.allowInFirstPerson`으로 정책을 제어한다.
- **NFR-02 (SOLID 원칙)**: 시점별 가시성 및 마우스 비행 허용 판정 로직을 DOM 비의존 순수 모듈(`FirstPersonViewPolicy.js`)로 분리한다(SRP/OCP/DIP).
- **NFR-03 (회귀 방지)**: 기존 3인칭 마우스 비행, 좌클릭 기관총 사격, `V` 키 시점 전환, 리스폰/파괴 동작에 회귀가 없어야 한다.

## 5. 설정 스키마 (`game-config.yaml`)
```yaml
camera:
  followDistance: 50
  followHeight: 20
  smoothing: 0.1
  minDistance: 10
  maxDistance: 500
  firstPerson:
    hideOwnVehicle: true
    usePointerLock: false

client:
  mouseFlight:
    enabled: true
    allowInFirstPerson: true
```

## 6. 인수 조건 (Acceptance Criteria)
1. **AC-01**: 게임 접속 후 `V` 키로 1인칭 전환 시 `gameClient.isFirstPerson === true`이고, 여러 번의 서버 `gameState` 업데이트 후에도 `gameClient.myVehicle.visible === false`가 유지된다.
2. **AC-02**: 1인칭 상태에서 다른 기체(NPC/상대 플레이어)의 `visible`은 서버 상태대로 `true`를 유지한다.
3. **AC-03**: 1인칭 상태에서 `#gameCanvas`에 `.mouse-flight-enabled` 커서 클래스가 유지되고, 캔버스 우클릭 시 3D 웨이포인트가 생성되며(`.mouse-flight-active`, `waypointMarker.visible === true`), 기체가 목표 방향으로 조향·이동한다.
4. **AC-04**: `V` 키로 다시 3인칭 전환 시 `gameClient.myVehicle.visible === true`로 복원된다.
5. **AC-05**: 단위 테스트 및 Playwright Headless Browser E2E 테스트가 오류 없이 통과한다.
