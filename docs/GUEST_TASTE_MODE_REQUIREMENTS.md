# Guest Taste Mode (맛보기 모드) Requirements

## 1. 목적
신규 방문자가 별도의 회원가입 절차 없이 로그인 화면의 **맛보기** 버튼을 클릭해 `guest1`, `guest2`, `guest3` ... 형태로 즉시 게임에 참여할 수 있도록 지원한다. 또한 운영 환경에 따라 맛보기 모드 허용 여부를 환경 변수로 제어할 수 있어야 한다.

## 2. 범위
- 환경 설정: `ALLOW_GUEST_MODE` 환경 변수 (`docker-compose.yml`, `services/user-service`)
- 서버 (`user-service`):
  - 공개 설정 조회 API (`GET /api/users/auth-config`, nginx 경유 `GET /api/auth/users/auth-config`)
  - 게스트 생성 API (`POST /api/users/guest`, nginx 경유 `POST /api/auth/users/guest`) 확장 및 접근 제어
  - 순차 게스트 이름 할당기 (`GuestNameAllocator`)
- 클라이언트 (`client/index.html`, `client/css/main.css`):
  - 로그인 화면 `🎮 맛보기` 버튼 추가 및 `allowGuestMode` 상태에 따른 조건부 표시
  - 원클릭 게스트 로그인 후 차량 선택 화면 자동 전환
- 테스트: 단위 테스트(Node test) 및 Playwright Headless Browser E2E 테스트

## 3. 기능 요구사항
1. **환경 변수 기반 활성화/비활성화 (FR-1)**
   - `ALLOW_GUEST_MODE` 환경 변수로 맛보기 모드 허용 여부를 제어한다. (기본값: `true`)
   - `'false'`, `'0'`, `'no'` 설정 시 비활성화되며, `'true'`, `'1'`, `'yes'` 또는 미설정 시 활성화된다.
2. **공개 인증 설정 API (FR-2)**
   - `GET /api/auth/users/auth-config` 호출 시 `{ success: true, allowGuestMode: boolean }`을 인증 없이 반환한다.
3. **순차 게스트 계정 자동 발급 (FR-3)**
   - `POST /api/auth/users/guest` 요청 시 `username`을 생략하면 서버가 기존 게스트 번호를 조회해 `guest1`, `guest2`, `guest3`, ... 순으로 자동 발급하고 JWT 토큰과 사용자 정보를 반환한다.
   - 동시 요청으로 동일 이름이 충돌(`SequelizeUniqueConstraintError`)하면 다음 번호(`guest{N+1}`)로 안전하게 재시도한다.
   - `ALLOW_GUEST_MODE=false` 상태에서는 `POST /api/auth/users/guest` 요청을 `403 Forbidden`으로 거부한다.
4. **로그인 화면 맛보기 버튼 UX (FR-4)**
   - 로그인 화면 로드 시 `GET /api/auth/users/auth-config`를 조회한다.
   - `allowGuestMode === true`일 때만 `🎮 맛보기 (게스트 참여)` 버튼(`#guestLoginBtn`)을 표시한다.
   - 버튼 클릭 시 회원가입/입력 없이 게스트 토큰을 발급받아 차량 선택 화면으로 이동하고, 플레이어 이름 입력란에 발급된 `guestN` 이름이 자동 채워진다.

## 4. 비기능 요구사항
- **하드코딩 금지**: 맛보기 모드 허용 여부는 `ALLOW_GUEST_MODE` 환경 변수로 외부화한다.
- **SOLID 준수**: 환경 변수 파싱(`guestModeConfig.js`)과 순차 이름 할당(`GuestNameAllocator.js`)을 독립 모듈(SRP/DIP)로 분리한다.
- **하위 호환성**: 기존처럼 `POST /api/auth/users/guest`에 명시적 `username`을 전달하는 호출도 계속 지원한다.

## 5. 인수 조건 (AC)
- [ ] `ALLOW_GUEST_MODE=true`일 때 로그인 화면에 `🎮 맛보기 (게스트 참여)` 버튼이 표시된다.
- [ ] 맛보기 버튼 클릭 시 회원가입 없이 `guest1`, `guest2`, `guest3` 순으로 계정이 생성되고 차량 선택 및 게임 입장이 정상 동작한다.
- [ ] `ALLOW_GUEST_MODE=false`일 때 `GET /api/auth/users/auth-config`가 `allowGuestMode: false`를 반환하고, `POST /api/auth/users/guest`는 `403`을 반환하며, 로그인 화면에 맛보기 버튼이 표시되지 않는다.
- [ ] 단위 테스트 및 Playwright Headless Browser E2E 테스트가 통과한다.
