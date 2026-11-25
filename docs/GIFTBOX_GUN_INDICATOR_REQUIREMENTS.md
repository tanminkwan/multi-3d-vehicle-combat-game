# Gift Box Gun Hit-Zone Indicator Requirements

## 1. 목적
플레이어가 선물 상자(Gift Box)를 조준해 기관총으로 파괴하려 할 때, 명중 가능한 사정권에 들어왔는지 직관적으로 알 수 있도록 **초록 실선 박스 없이** 번쩍이는 **`기관총 사정권(FIRE!)` 표시만** 노출한다.

## 2. 범위
- 설정: `services/game-service/src/config/game-config.yaml` (`targeting.gunHitIndicator.giftBoxHitRadius`)
- 서버:
  - `services/game-service/src/services/GunHitZoneEvaluator.js`
  - `services/game-service/src/services/TargetingManager.js`
  - `services/game-service/src/services/PlayerManager.js`
  - `services/game-service/src/services/GameManager.js`
- 클라이언트:
  - `client/js/GameClient.js`
  - `client/js/ui/UIManager.js`
  - `client/css/main.css`
- 테스트: 단위 테스트 및 Playwright Headless Browser E2E 테스트

## 3. 기능 요구사항
1. **선물 상자 기관총 사정권 판별 (FR-1)**:
   - 서버는 매 틱 플레이어 기체의 총구 위치·전방 직선 탄도·기관총 사거리(`bulletRange`)·`giftBoxHitRadius`를 기준으로 명중 가능한 가장 가까운 활성 선물 상자를 계산해 `player.gunGiftBoxTargetId`에 저장한다.
   - 선물 상자는 상황 인식(초록 박스)이나 미사일 락온 대상에는 포함하지 않는다.
2. **초록 실선 박스 제외 UI 렌더링 (FR-2)**:
   - `gunGiftBoxTargetId`가 존재할 때만 해당 선물 상자 위치에 `.target-box.gun-only.gun-in-range` 요소를 표시한다.
   - `.gun-only` 스타일은 내부 초록 실선 테두리를 제거(`border: none`)하고, 바깥쪽 번쩍이는 빨강/노랑 외곽선(`::before`)과 `FIRE!` 배지(`::after`)만 표시한다.
   - 선물 상자가 사정권을 벗어나거나 파괴되면 즉시 표시를 제거한다.

## 4. 인수 조건 (AC)
- [ ] 선물 상자가 기관총 직선 사정권에 들어오면 `player.gunGiftBoxTargetId`가 설정된다.
- [ ] 선물 상자는 `awarenessTargetId` / `lockOnTargetId`에 들어가지 않는다.
- [ ] 클라이언트 화면에서 선물 상자 사정권 진입 시 `.target-box.gun-only.gun-in-range`가 표시되고 초록 실선 테두리는 렌더링되지 않는다(`borderStyle === 'none'`).
- [ ] 단위 테스트 및 Playwright E2E 테스트가 모두 통과한다.
