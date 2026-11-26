# Mouse Click-to-Fly Control Design

## 1. 아키텍처 및 책임 분리 (SOLID)

| 모듈 | 위치 | 책임 (SRP) |
| --- | --- | --- |
| `MouseFlightController` | `client/js/input/MouseFlightController.js` | 3D 목표 지점(Waypoint) 클램핑·상태 관리 및 `YXZ`(+Z 전방) 좌표계 기반 자동 조향 입력(`{ thrust, pitch, yaw, roll, vertical }`) 산출 순수 모듈 (DOM 비의존) |
| `InputManager` | `client/js/input/InputManager.js` | 키보드 수동 입력 감지(`hasManualFlightInput()`), 캔버스 우클릭(`button === moveMouseButton`) 수신 및 `contextmenu` 차단, 좌클릭 기관총 발사 유지 |
| `GameClient` | `client/js/GameClient.js` | `THREE.Raycaster`로 클릭 NDC → 3D 목표 지점 계산, `MouseFlightController`와 `InputManager` 입력 병합, 3D 웨이포인트 마커 렌더링/애니메이션/정리, `#gameCanvas` 커서 클래스 전환 |
| `main.css` & `index.html` | `client/css/main.css`, `client/index.html` | SVG data-URI 커스텀 비행 커서(`.mouse-flight-enabled`, `.mouse-flight-active`) 및 조작법 HUD 안내 |

## 2. 3D 좌표계 및 조향 알고리즘 (`MouseFlightController`)

기존 `Vehicle.js` 및 `FlightSteering.js`와 동일한 `YXZ` Euler(+Z 전방) 규약을 사용한다:
- `desiredYaw = Math.atan2(dx, dz)`
- `yawError = normalizeAngle(desiredYaw - vehicleRotation.y)`
  - `yawError > 0` → 좌회전(`yaw = +1`), `yawError < 0` → 우회전(`yaw = -1`)
- `desiredPitch = -Math.atan2(dy, horizontalDist)` *(Vehicle.js에서 `rotation.x < 0`이 기수 상승)*
- `pitchError = normalizeAngle(desiredPitch - vehicleRotation.x)`
  - `pitchError < 0` → 기수 상승(`pitch = -1`, W키와 동일), `pitchError > 0` → 기수 하강(`pitch = +1`, S키와 동일)
- 비례 제어(`clamp(error / 0.5, -1, 1)`) + 데드존(`steerDeadzoneRad`)으로 부드럽게 목표 방향에 수렴하고, 목표 선회 방향에 맞춰 자연스러운 뱅크(롤) 및 자동 추력(`autoThrottle`)을 생성한다.
- 도착 판정: `distance <= arrivalRadius`이면 `clearTarget()` 호출 후 중립 입력 반환.

## 3. Raycaster 목표 지점 산출 (`GameClient`)
1. `InputManager`가 `#gameCanvas` 위에서의 우클릭 `(clientX, clientY)`를 정규화 좌표 `ndc = { x, y }`로 전달.
2. `GameClient`가 `raycaster.setFromCamera(ndc, this.camera)`로 광선을 생성.
3. 지형(`worldManager.terrain`)과 교차 검사:
   - 교차점이 `minTargetDistance ~ maxTargetDistance` 범위 내에 있으면 교차점 `(x, y + minTerrainClearance, z)` 사용.
   - 그 외(하늘/원거리)에는 `ray.origin + ray.direction * defaultTargetDistance` 사용.
4. `MouseFlightController.setTarget(rawPoint, terrainHeight)`로 맵 경계 및 최소 안전 고도 클램핑 후 웨이포인트 확정.

## 4. 테스트 전략
- **단위 테스트 (`services/game-service/tests/unit/mouse-flight-controller.test.js`)**:
  - `setTarget`: 맵 경계 및 지형 안전 고도 클램핑 검증.
  - `computeSteering`: 정면/좌측/우측/상단/하단 목표 지점에 대한 정확한 `yaw`/`pitch`/`thrust` 부호 및 도착 시 자동 해제 검증.
  - `enabled: false` 비활성화 시 no-op 검증.
- **Playwright Headless Browser E2E (`tests/e2e/mouse-flight-control.spec.js`)**:
  - `#gameCanvas` 커스텀 SVG 커서 적용 확인 (`cursor` 스타일에 `url(` 포함).
  - 캔버스 우클릭 시 `contextmenu` 미표시, 웨이포인트 활성(`.mouse-flight-active` 클래스 + 3D 마커 `visible === true`), 비행체 회전/이동 발생 확인.
  - `KeyW` 키보드 입력 시 웨이포인트 및 마커 즉시 해제 확인.
  - `#leaveGameBtn` 클릭 시 정상 퇴장(이동 명령 오작동 없음) 및 콘솔 에러 0건 확인.
