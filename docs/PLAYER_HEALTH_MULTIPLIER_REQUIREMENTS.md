# Player-Only Vehicle Health Multiplier Requirements

## 1. 목적
NPC 비행체의 체력은 기존 기본값을 유지하면서, 실제 유저(인간 플레이어) 비행체의 체력만 기존 대비 2배로 상향하여 플레이어 생존성과 전투 재미를 높인다.

## 2. 범위
- 설정: `services/game-service/src/config/game-config.yaml` (`game.playerHealthMultiplier: 2.0`, `game.playerDamageMultiplier: 2.0`)
- 인프라: `docker-compose.yml` `game-service`에 `game-config.yaml` 읽기 전용 볼륨 마운트 추가 (호스트에서 외부 편집 가능)
- 서버:
  - `services/game-service/src/services/VehicleHealthPolicy.js` (신규 SRP 모듈)
  - `services/game-service/src/services/VehicleManager.js`
  - `services/game-service/src/services/GameManager.js`
- 클라이언트: `client/index.html` 기체 선택 카드 체력 표시 동기화
- 테스트: 단위 테스트 및 Playwright Headless Browser E2E 테스트

## 3. 기능 요구사항
1. **설정 외부화 (FR-1)**: `game-config.yaml`의 `game.playerHealthMultiplier` (기본값 `2.0`)로 유저 전용 체력 배율을 관리한다.
2. **NPC 제외 유저 전용 적용 (FR-2)**:
   - 인간 플레이어(`isNpc === false`): `maxHealth = Math.round(baseHealth * playerHealthMultiplier)`
     - 전투기(`fighter`): `80 → 160`
     - 중형기(`heavy`): `150 → 300`
     - 테스트기(`test`): `20 → 40`
   - NPC 플레이어(`isNpc === true`): 배율을 적용하지 않고 기존 `baseHealth` 유지 (`fighter: 80`, `heavy: 150`, `test: 20`).
3. **리스폰 시 체력 유지 (FR-3)**: 인간 플레이어 리스폰 시 상향된 `maxHealth`로 복구되며, NPC 리스폰 시 기존 기본 `maxHealth`로 복구된다.
4. **방어적 폴백 (FR-4)**: `playerHealthMultiplier`가 미설정·0 이하·NaN인 경우 `1.0`으로 폴백한다.

## 4. 인수 조건 (AC)
- [ ] `game-config.yaml`에 `game.playerHealthMultiplier: 2.0`이 정의되어 있다.
- [ ] 인간 플레이어 생성 및 리스폰 시 `fighter=160`, `heavy=300`, `test=40` 체력이 적용된다.
- [ ] NPC 생성 및 리스폰 시 `fighter=80`, `heavy=150`, `test=20` 체력이 유지된다.
- [ ] 단위 테스트 및 Playwright E2E 테스트가 모두 통과한다.
