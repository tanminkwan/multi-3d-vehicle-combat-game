# Mouse Click-to-Fly Control (마우스 우클릭 비행 조종) Requirements

## 1. 목적
키보드(`WASD` / 화살표 / `Q/E` / `Space/X`)만으로는 진입 장벽이 있는 3D 비행 조종을 직관적으로 개선한다.
사용자가 **게임 화면의 특정 공간을 오른쪽 마우스로 클릭(우클릭)**하면 해당 3D 공간 지점을 향해 비행체가 자동으로 기수를 돌려 이동하도록 하고, 게임 캔버스 위에서 **전용 마우스 커서**가 표시되도록 한다.

## 2. 범위
- **브랜치**: `feat/mouse-click-flight`
- **설정 (`services/game-service/src/config/game-config.yaml`)**: `client.mouseFlight` 설정 섹션 추가 (하드코딩 금지)
- **클라이언트 (`client/`)**:
  - `client/js/input/MouseFlightController.js` (3D 웨이포인트 계산·경계 클램핑·조향 입력 산출 순수 모듈, SRP)
  - `client/js/input/InputManager.js` (우클릭 이동 이벤트·`contextmenu` 차단·키보드 수동 우선권 처리, 기존 좌클릭/`P` 기관총 발사 유지)
  - `client/js/GameClient.js` (Raycaster 목표 지점 산출, 3D 웨이포인트 마커, 커서 상태 클래스 전환, 리스폰/퇴장 시 정리)
  - `client/css/main.css` (전용 커스텀 SVG 비행 커서 및 이동 활성 커서 스타일)
  - `client/index.html` (조작법 HUD 안내 업데이트)
- **테스트**: 단위 테스트 및 Playwright Headless Browser E2E 테스트

---

## 3. 확정된 기능 요구사항

### FR-1. 우클릭 3D 공간 이동 (Right-Click to Fly)
1. 3인칭 게임 진행 중 사용자가 게임 캔버스(`#gameCanvas`)의 임의 위치를 **오른쪽 마우스 버튼으로 클릭**하면 브라우저 컨텍스트 메뉴(`contextmenu`)를 차단하고, 카메라 기준 `Raycaster`로 클릭 방향의 3D 목표 지점(Waypoint)을 계산한다.
   - 지형을 직접 클릭한 경우: 교차 지점 위 안전 고도(`minTerrainClearance`)를 목표 지점으로 설정한다.
   - 허공(하늘)을 클릭한 경우: 카메라 광선 방향의 기본 거리(`defaultTargetDistance`, 기본 `120` 유닛) 지점을 목표 지점으로 설정한다.
   - 계산된 목표 지점은 맵 경계(`[-world.size/2 + boundaryBuffer, +world.size/2 - boundaryBuffer]`, 고도 `[terrainHeight + minTerrainClearance, world.maxHeight - boundaryBuffer]`) 안으로 클램핑한다.
2. 목표 지점이 설정되면 비행체는 매 프레임 목표 방향을 향해 자동으로 피치(`pitch`), 요(`yaw`), 롤(`roll`) 및 추력(`thrust`) 입력을 생성해 이동한다.
3. 비행체와 목표 지점 간 거리가 도착 반경(`arrivalRadius`, 기본 `12` 유닛) 이내가 되면 자동 이동을 해제하고 기존 관성/순항을 유지한다.
4. 이동 중 다른 공간을 다시 우클릭하면 기존 웨이포인트를 새 위치로 즉시 갱신한다.
5. 비행체가 파괴·리스폰되거나 게임 퇴장(`leaveGame`) 시 진행 중인 웨이포인트는 즉시 취소한다.

### FR-2. 웨이포인트 시각 피드백
1. 우클릭으로 목표 지점이 설정되면 해당 3D 공간에 **웨이포인트 마커**(빛나는 원형 링/비콘)를 표시한다.
2. 목표에 도착하거나 키보드 조작 등으로 취소되면 마커를 즉시 숨긴다.

### FR-3. 전용 마우스 커서 변경
1. 게임 플레이 중(`#gameCanvas` 위)에는 기본 브라우저 화살표 대신 **커스텀 SVG 비행 크로스헤어 커서**로 변경된다.
2. 자동 이동(웨이포인트 활성) 중에는 강조된 **활성 이동 커서**(`.mouse-flight-active`)로 변경된다.
3. UI 패널(`#gameUI`, `#leaveGameBtn`, `#players` 등) 위에서는 기존 `pointer`/`default` 커서를 유지하며, UI 요소 클릭은 비행 이동 명령으로 처리하지 않는다.

### FR-4. 기존 키보드 조종 및 무기 발사와의 공존
1. **기관총 발사 유지**: 기존 **좌클릭 및 `P` 키** 기관총 발사 동작을 그대로 유지한다.
2. **키보드 우선권 (Manual Override)**: 자동 이동 중 사용자가 이동 키(`W/A/S/D`, 방향키, `Q/E`, `Space/X`)를 입력하면 즉시 웨이포인트를 취소하고 키보드 수동 조종으로 전환한다.
3. **1인칭 시점(`V`키 PointerLock)**: 1인칭 시점에서는 기존 PointerLock 시선 조종을 유지하고 우클릭 이동은 비활성화한다.
4. **조작법 HUD 반영**: 좌측 하단 조작법 패널에 `우클릭: 클릭 지점으로 이동`, `좌클릭 / P: 기관총 발사`를 안내한다.

---

## 4. 설정 스키마 (`services/game-service/src/config/game-config.yaml`)

```yaml
client:
  mouseFlight:
    enabled: true                    # 마우스 클릭 이동 기능 활성화 여부
    moveMouseButton: 2               # 이동 명령 마우스 버튼 (2: 우클릭, 0: 좌클릭)
    defaultTargetDistance: 120       # 허공 클릭 시 목표 지점 거리 (유닛)
    minTargetDistance: 25            # 최소 목표 거리
    maxTargetDistance: 220           # 최대 목표 거리
    arrivalRadius: 12                # 목표 도착 판정 반경
    minTerrainClearance: 18          # 지형/수면 위 최소 안전 고도
    autoThrottle: 0.85               # 자동 이동 시 기본 추력 (0~1)
    steerDeadzoneRad: 0.04           # 미세 떨림 방지 조향 데드존 (라디안)
    maxBankAngleRad: 0.45            # 선회 시 롤 기울기 한계
    waypointMarkerEnabled: true      # 3D 웨이포인트 마커 표시 여부
```

---

## 5. 인수 조건 (AC)
- [ ] 게임 캔버스(`#gameCanvas`) 위에서 마우스 커서가 커스텀 SVG 비행 커서로 변경된다.
- [ ] 캔버스의 특정 공간을 오른쪽 마우스로 클릭하면 브라우저 컨텍스트 메뉴가 뜨지 않고, 3D 웨이포인트와 마커가 생성되며, 비행체가 목표 방향으로 선회·이동한다.
- [ ] 이동 중에는 `#gameCanvas`에 `.mouse-flight-active` 커서 클래스가 적용되고, 도착 또는 취소 시 제거된다.
- [ ] 자동 이동 중 키보드 이동 키(`W/A/S/D`, 방향키 등)를 누르면 즉시 자동 이동과 마커가 취소된다.
- [ ] 좌클릭 및 `P` 키 기관총 발사가 기존과 동일하게 동작한다.
- [ ] UI 버튼(`#leaveGameBtn` 등) 우클릭/클릭 시 이동 명령이 발생하지 않는다.
- [ ] 단위 테스트 및 Playwright Headless Browser E2E 테스트가 모두 통과한다.
