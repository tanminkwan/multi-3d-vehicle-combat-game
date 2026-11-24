# Combat Event Notifications Design

## 1. 아키텍처 및 책임 분리 (SOLID)

| 모듈 | 위치 | 책임 (SRP) |
| --- | --- | --- |
| `GameManager` | `services/game-service/src/services/GameManager.js` | 차량 파괴 시 `PlayerManager`에서 피격자/격추자 이름을 조회해 `vehicleDestroyed` 이벤트 페이로드에 포함 |
| `GameEventNotificationFormatter` | `client/js/ui/GameEventNotificationFormatter.js` | 이벤트 타입·페이로드·플레이어 컨텍스트를 받아 표시할 알림 `{ message, type }` 또는 `null`을 결정하는 순수 함수 모듈 |
| `UIManager` | `client/js/ui/UIManager.js` | 포맷터 결과를 받아 DOM 알림(`showNotification`)과 게임 상태 텍스트(`updateGameStatus`)만 렌더링 |

## 2. 이벤트 페이로드 명세

### `vehicleDestroyed` (Server → Client)
```json
{
  "vehicleId": "vehicle-1",
  "playerId": "player-victim",
  "playerName": "NPC1",
  "killedBy": "player-killer",
  "killerName": "PilotA",
  "position": { "x": 0, "y": 50, "z": 0 },
  "shouldHide": true
}
```
- 지형/장애물 충돌 등으로 `collision.ownerId`가 없거나 자폭인 경우 `killedBy: null`, `killerName: null`.

### `vehicleRespawned` (Server → Client, 기존 유지)
```json
{
  "vehicle": {
    "id": "vehicle-1",
    "playerId": "player-victim",
    "position": { "x": 100, "y": 60, "z": -80 }
  },
  "shouldShow": true
}
```

## 3. 클라이언트 알림 결정 규칙 (`formatGameEventNotification`)

```js
formatGameEventNotification(eventType, data, { myPlayerId, players })
```

1. **`vehicleRespawned`**:
   - `respawnedPlayerId = data?.vehicle?.playerId ?? data?.playerId ?? null`
   - `myPlayerId && respawnedPlayerId === myPlayerId`인 경우에만 `{ message: '차량이 리스폰되었습니다.', type: 'success' }` 반환.
   - 그 외는 `null` 반환 (알림 생략).
2. **`vehicleDestroyed`**:
   - `victimId = data?.playerId ?? null`
   - `killerId = data?.killedBy ?? data?.destroyedBy ?? null`
   - `victimName = data?.playerName || findPlayerName(victimId, players) || '알 수 없는 플레이어'`
   - `killerName = data?.killerName || (killerId ? findPlayerName(killerId, players) : null)`
   - 알림 타입:
     - `victimId && victimId === myPlayerId` → `'error'`
     - `killerId && killerId === myPlayerId && killerId !== victimId` → `'success'`
     - 그 외 → `'warning'`
   - 알림 문구:
     - `killerName && killerId !== victimId`: `` `${victimName}가 ${killerName}에게 격추되었습니다!` ``
     - 그 외: `` `${victimName}가 추락했습니다!` ``
3. **기타 이벤트**:
   - `gameStarted` → `{ message: '게임이 시작되었습니다!', type: 'success' }`
   - `gameEnded` → `{ message: '게임이 종료되었습니다.', type: 'info' }`
   - `billboardDestroyed` (`data?.destroyedBy`) → `{ message: '광고판이 파괴되었습니다!', type: 'info' }`

## 4. 테스트 전략
1. **단위 테스트 (`services/game-service/tests/unit/combat-notifications.test.js`)**
   - `GameEventNotificationFormatter`: 타인/NPC 리스폰 무시, 본인 리스폰 표시, 적 격추 문구(`OOO가 XXX에게 격추되었습니다!`) 및 타입(`success`/`error`/`warning`), 추락 문구(`OOO가 추락했습니다!`), `gameState.players` 폴백 이름 조회.
   - `GameManager.handleVehicleDestroyed`: `vehicleDestroyed` 이벤트에 `playerName`과 `killerName`이 정상 포함되는지, 지형 충돌 시 `killerName: null`인지 검증.
2. **Playwright Headless Browser E2E (`tests/e2e/combat-notifications.spec.js`)**
   - 실제 게임 접속 후:
     - 타인/NPC `vehicleRespawned` 이벤트 시 `.notification`이 뜨지 않음 확인.
     - 본인 `vehicleRespawned` 이벤트 시 `차량이 리스폰되었습니다.` 표시 확인.
     - `vehicleDestroyed` 이벤트 시 `NPC1가 <player>에게 격추되었습니다!` 표시 확인.
     - 콘솔 페이지 에러 0건 확인.
