# Combat Event Notifications Requirements

## 1. 목적
멀티플레이어 및 NPC 전투 환경에서 발생하는 `vehicleRespawned`와 `vehicleDestroyed` 알림을 정확하고 직관적으로 개선한다.
- 타 플레이어나 NPC가 리스폰될 때 내 화면에 `차량이 리스폰되었습니다.`가 오표시되는 버그를 제거한다.
- 격추 이벤트 발생 시 실제 피격자/격추자 이름을 포함한 명확한 전투 알림(`OOO가 XXX에게 격추되었습니다!`)을 표시한다.

## 2. 범위
- 서버: `services/game-service/src/services/GameManager.js`의 `vehicleDestroyed` 이벤트 페이로드 확장
- 클라이언트: 알림 포맷팅 로직 분리(`client/js/ui/GameEventNotificationFormatter.js`) 및 `client/js/ui/UIManager.js` 연동
- 테스트: 단위 테스트(서버 이벤트 페이로드 + 클라이언트 포맷터) 및 Playwright Headless Browser E2E 테스트

## 3. 기능 요구사항
1. **내 차량 전용 리스폰 알림 (FR-1)**
   - `vehicleRespawned` 이벤트 수신 시, 리스폰된 차량의 `playerId`가 현재 로그인한 본인(`myPlayer.id`)과 일치할 때만 `차량이 리스폰되었습니다.` 알림을 표시한다.
   - 다른 플레이어나 NPC의 리스폰 이벤트에 대해서는 알림을 표시하지 않는다.
2. **격추 알림 문구 및 필드 정합성 (FR-2)**
   - 서버 `GameManager.handleVehicleDestroyed`는 `vehicleDestroyed` 이벤트에 `playerName`(피격자 이름)과 `killerName`(격추자 이름, 없으면 `null`)을 포함해 전송한다.
   - 클라이언트는 `killedBy`(하위 호환을 위해 `destroyedBy` 포함) 및 이름 정보를 기반으로 알림을 생성한다.
   - 적(타 플레이어 또는 NPC)에게 격추된 경우: `<피격자>가 <격추자>에게 격추되었습니다!`를 표시한다.
   - 격추자가 없거나 본인 충돌(지형/장애물 등)로 파괴된 경우: `<피격자>가 추락했습니다!`를 표시한다.
3. **알림 타입 구분 (FR-3)**
   - 본인이 적을 격추한 경우 `success`, 본인이 격추/추락한 경우 `error`, 그 외 전투 알림은 `warning` 스타일로 표시한다.
4. **기존 이벤트 호환 (FR-4)**
   - `gameStarted`, `gameEnded`, `billboardDestroyed` 이벤트 동작은 기존과 동일하게 유지한다.

## 4. 비기능 요구사항
- **SRP/OCP 준수**: 알림 메시지 생성 및 필터링 로직을 DOM 의존성이 없는 순수 모듈(`GameEventNotificationFormatter.js`)로 분리하여 Node 환경에서 단위 테스트가 가능하도록 한다.
- **방어적 폴백**: 페이로드에 `playerName` 또는 `killerName`이 누락된 경우 `gameState.players` 목록에서 ID로 이름을 조회하고, 그래도 없으면 안전한 기본 문구로 폴백한다.

## 5. 인수 조건 (AC)
- [ ] NPC 또는 다른 플레이어의 `vehicleRespawned` 이벤트 수신 시 알림 DOM(`.notification`)이 생성되지 않는다.
- [ ] 본인 차량의 `vehicleRespawned` 이벤트 수신 시 `차량이 리스폰되었습니다.` 알림이 표시된다.
- [ ] `vehicleDestroyed` 이벤트 수신 시 `<피격자>가 <격추자>에게 격추되었습니다!` 알림이 표시된다.
- [ ] 격추자가 없는 `vehicleDestroyed` 이벤트 수신 시 `<피격자>가 추락했습니다!` 알림이 표시된다.
- [ ] 단위 테스트 및 Playwright Headless Browser E2E 테스트가 모두 통과한다.
