# 게임 나가기(Leave Game) 요구사항 정의서

- **문서 버전:** v1.0
- **작성일:** 2026-11-24
- **대상 브랜치:** `stabilization`
- **대상 시스템:** Multiplayer 3D Vehicle Combat Game (`services/game-service`, `client`)

---

## 1. 개요

### 1.1 목적
인게임 플레이 중 사용자가 새로고침이나 탭 종료 없이 안전하게 게임을 종료하고 차량 선택 화면(로비)으로 복귀할 수 있는 **게임 나가기(Leave Game)** 기능을 제공한다. 또한 향후 게임 종료 시 전적 저장, 통계 전송, 로그 기록 등 후속 작업을 쉽게 연결할 수 있도록 **서버 및 클라이언트 양쪽에 확장용 콜백(현재는 빈 no-op 구현)**을 호출하는 구조를 마련한다.

### 1.2 범위
- **포함 범위**
  - 인게임 HUD(`#gameUI`)에 `나가기` 버튼 추가
  - 클라이언트 게임 리소스 정리(`GameClient.cleanup()`) 및 차량 선택 화면 복귀, 재입장 정상 동작
  - 서버 `leaveGame` Socket.IO 이벤트 처리 및 `leaveSuccess` 응답, NPC 인원 재조정 연동
  - 서버/클라이언트 양측 나가기 콜백 훅(기본값은 빈 깡통 no-op 함수) 호출 및 예외 격리
- **제외 범위**
  - 콜백 내부의 실제 DB 전적 저장/통계 적재 로직 (향후 Phase에서 콜백 구현체만 주입)

---

## 2. 기능 요구사항 (Functional Requirements)

### FR-01. 인게임 나가기 버튼 UI
- 게임 진행 화면(`#gameUI`)에서 클릭 가능한 **게임 나가기(`🚪 나가기`) 버튼**(`#leaveGameBtn`)을 표시한다.
- 1인칭 시점(포인터 락 상태)에서 나가기 시 포인터 락이 자동으로 해제되어야 한다.
- 나가기 완료 후 차량 선택 화면(`#vehicleSelectionScreen`)으로 전환되며, 기존 로그인 세션과 Socket.IO 연결은 유지되어 바로 다른 비행체를 선택해 재입장할 수 있어야 한다.

### FR-02. 클라이언트 리소스 정리 (`GameClient.cleanup`)
- 게임 나가기 시 아래 리소스를 누수 없이 정리한다.
  - `requestAnimationFrame` 애니메이션 루프 중단
  - 키보드/마우스/리사이즈 이벤트 리스너 해제 (`InputManager.cleanup`)
  - 포인터 락 해제 (`CameraManager.cleanup`)
  - 3D 씬/이펙트/월드/타겟팅 DOM 정리 (`EffectManager`, `WorldManager`, `UIManager`)
  - **중요:** `NetworkManager.cleanup()`은 자신이 등록한 게임 이벤트 리스너만 해제(`socket.off`)해야 하며, 로비의 `joinSuccess` / `connect` / `disconnect` 리스너를 제거해서는 안 된다.

### FR-03. 서버 `leaveGame` 이벤트 처리 및 멱등성
- 클라이언트가 `leaveGame` 이벤트를 전송하면 서버는 해당 소켓의 플레이어를 게임에서 제거(`gameManager.removePlayer`)하고 `leaveSuccess` 이벤트를 응답한다.
- 플레이어 제거 시 기존 NPC 정책(`fill` 모드 보충, 마지막 유저 퇴장 시 NPC 전원 제거 및 `waiting` 전환)이 동일하게 동작해야 한다.
- 이미 나간 플레이어에 대해 `leaveGame`이 중복 호출되거나 이후 `disconnect`가 발생해도 중복 처리되거나 콜백이 중복 호출되지 않아야 한다(멱등성 보장).

### FR-04. 확장용 콜백(현재 깡통 no-op) 호출
- **서버 측 콜백 (`onPlayerLeave`)**
  - 플레이어가 게임에서 나갈 때(`leaveGame` 또는 `disconnect`) 등록된 콜백을 호출한다.
  - 기본 구현은 아무 동작도 하지 않는 빈 함수(no-op)로 제공한다.
  - 전달 컨텍스트: `{ playerId, userId, username, reason, vehicleType, stats: { score, kills, deaths }, joinedAt, leftAt, playTimeMs }`
  - 콜백은 동기/비동기(`Promise`) 모두 지원하며, 콜백 내부에서 예외가 발생하더라도 플레이어 제거 및 게임 루프에는 영향을 주지 않는다.
- **클라이언트 측 콜백 (`onBeforeLeave`, `onAfterLeave`)**
  - 나가기 버튼 클릭 직후(`onBeforeLeave`)와 정리·로비 복귀 완료 직후(`onAfterLeave`)에 각각 빈 no-op 콜백을 호출한다.
  - 전달 컨텍스트: `{ player, reason, leftAt }`
  - 콜백 내부 예외가 발생해도 나가기 동작은 정상 완료되어야 한다.

---

## 3. 비기능 요구사항 (Non-Functional Requirements)
- **SOLID 준수:** 콜백 기본 구현 및 실행기를 별도 모듈로 분리(SRP/OCP/DIP)하여 추후 실제 로직 교체 시 `GameManager`나 `GameClient` 수정 없이 주입 가능해야 한다.
- **재입장 안정성:** 나가기 → 재입장을 반복해도 중복 DOM(`#targetingContainer`), 중복 이벤트 리스너, 중복 애니메이션 루프가 생기지 않아야 한다.

---

## 4. 인수 조건 (Acceptance Criteria)

| ID | 시나리오 | 기대 결과 |
|---|---|---|
| **AC-01** | 게임 중 `#leaveGameBtn` 클릭 | `#vehicleSelectionScreen`으로 복귀하고 소켓 연결 유지, 페이지 콘솔 에러 0건 |
| **AC-02** | 나가기 시 서버/클라이언트 콜백 호출 | 서버 `onPlayerLeave` 및 클라이언트 `onBeforeLeave`/`onAfterLeave` 기본(no-op) 콜백이 컨텍스트와 함께 1회 호출됨 |
| **AC-03** | 콜백 예외 격리 | 콜백이 에러를 던지거나 reject해도 플레이어 제거·로비 복귀 정상 완료 |
| **AC-04** | 멱등성 | `leaveGame` 후 소켓 `disconnect` 시 `onPlayerLeave`가 중복 호출되지 않음 |
| **AC-05** | NPC 연동 | 마지막 유저가 `나가기` 클릭 시 서버의 NPC 전원 제거 및 `gameState: 'waiting'` 전환 |
| **AC-06** | 나가기 후 재입장 | 차량 선택 화면에서 다시 `게임 참가` 클릭 시 정상 입장 및 NPC 재스폰, 중복 DOM 없음 |
