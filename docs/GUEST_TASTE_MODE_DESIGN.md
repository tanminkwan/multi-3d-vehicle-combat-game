# Guest Taste Mode (맛보기 모드) Design

## 1. 아키텍처 및 책임 분리 (SOLID)

| 모듈 | 위치 | 책임 (SRP) |
| --- | --- | --- |
| `guestModeConfig` | `services/user-service/src/config/guestModeConfig.js` | `ALLOW_GUEST_MODE` 환경 변수를 불리언 정책으로 파싱 |
| `GuestNameAllocator` | `services/user-service/src/services/GuestNameAllocator.js` | 저장소 포트(`findUsernamesByPrefix`)를 통해 `guest1`, `guest2`, `guest3` ... 순차 번호 계산 (DIP) |
| `UserRepository` | `services/user-service/src/models/User.js` | `findUsernamesByPrefix(prefix)` 쿼리 제공 |
| `UserService` | `services/user-service/src/services/UserService.js` | `isGuestModeAllowed()` 검사, `GuestNameAllocator` 연동 및 중복 시 순차 재시도 |
| `UserController` & `userRoutes` | `services/user-service/src/controllers/UserController.js`, `routes/userRoutes.js` | `GET /api/users/auth-config` 노출 및 `POST /api/users/guest` 정책 검사/`username` 선택 파라미터 지원 |
| Login UI | `client/index.html`, `client/css/main.css` | `auth-config` 조회 후 `#guestLoginBtn` 조건부 렌더링 및 `performGuestLogin()` 처리 |

## 2. API 명세

### `GET /api/auth/users/auth-config` (Public)
- **Response `200 OK`**:
```json
{
  "success": true,
  "allowGuestMode": true
}
```

### `POST /api/auth/users/guest` (Public when enabled)
- **Request Body**:
```json
{
  "username": "optionalAlphanumName",
  "vehicleType": "fighter"
}
```
  - `username` 생략 시 `GuestNameAllocator`가 `guest1`, `guest2`, `guest3`, ... 순으로 자동 생성.
- **Response `201 Created`**:
```json
{
  "success": true,
  "user": { "id": "...", "username": "guest1", "isGuest": true, "preferredVehicleType": "fighter" },
  "token": "<jwt>"
}
```
- **Response `403 Forbidden`** (`ALLOW_GUEST_MODE=false`):
```json
{
  "success": false,
  "message": "맛보기(게스트) 모드가 비활성화되어 있습니다."
}
```

## 3. 순차 이름 할당 알고리즘 (`GuestNameAllocator`)
1. 저장소에서 `prefix` (`'guest'`)로 시작하는 사용자명 목록 조회.
2. 정규식 `/^guest(\d+)$/i`와 일치하는 항목에서 양의 정수 최대값 `maxNumber` 추출 (없으면 `0`).
3. 후보 이름 `guest${maxNumber + 1}` 반환.
4. `UserService.createGuestUser`에서 DB 유니크 제약 충돌(`SequelizeUniqueConstraintError`) 발생 시 `maxRetries` (기본 20회) 범위에서 다음 순번(`guest${nextNum}`)으로 재시도.

## 4. 테스트 전략
1. **단위 테스트 (`services/user-service/tests/unit/guest-taste-mode.test.js`)**
   - `parseAllowGuestMode`: `true`/`false`/`0`/`1`/`undefined` 파싱 검증.
   - `GuestNameAllocator`: 빈 목록 → `guest1`, `['guest1', 'guest2']` → `guest3`, 비정형 이름(`guest_abc`, `guest10`) 혼재 시 `guest11` 반환.
   - `UserService.createGuestUser`: `allowGuestMode: false`일 때 거부, `username` 생략 시 `guest1` → `guest2` → `guest3` 순차 생성, 유니크 충돌 시 다음 순번 재시도.
2. **Playwright Headless Browser E2E (`tests/e2e/guest-taste-mode.spec.js`)**
   - `GET /api/auth/users/auth-config` 응답 확인 (`allowGuestMode: true`).
   - 로그인 화면에 `#guestLoginBtn` 표시 확인 및 클릭 → `guestN`으로 자동 로그인 → 차량 선택 → 게임 입장(`#gameCanvas` 및 `#playerInfo`에 `guestN` 표시) 검증.
   - 연속 2회 게스트 입장 시 번호가 순차 증가(`guestN` → `guest{N+1}`)하는지 검증.
   - `page.route`로 `auth-config`가 `{ allowGuestMode: false }`를 반환할 때 로그인 화면에서 `#guestLoginBtn`이 숨겨지는지 검증.
