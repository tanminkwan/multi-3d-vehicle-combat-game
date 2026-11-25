# Auth Adapter (`TokenVerifier`) & `AUTH_MODE=local | oidc` Requirements

## 1. 목적
`game-service`가 현재 `user-service`의 대칭키(`JWT_SECRET`) 검증에 강결합되어 있는 구조를 개선하여, **인증 검증을 `TokenVerifier` 포트(DIP)로 추상화**한다.
- 기본 모드(`AUTH_MODE=local`): 기존 `user-service` 로그인 및 맛보기(게스트) 모드가 변경 없이 그대로 동작한다.
- OIDC 모드(`AUTH_MODE=oidc`): 외부 OIDC IdP(Keycloak, Authentik, 사내 SSO 등)가 발급한 비대칭 서명(RS256/ES256) JWT를 **JWKS 공개키**로 검증하여 `game-service`에 연동할 수 있다.

## 2. 범위
- 설정/환경 변수: `AUTH_MODE`, `JWT_SECRET`, `OIDC_ISSUER`, `OIDC_JWKS_URI`, `OIDC_AUDIENCE`, `OIDC_USERNAME_CLAIM`, `OIDC_JWKS_CACHE_TTL_MS` (`docker-compose.yml`, `services/game-service/src/auth/authConfig.js`)
- 서버 (`services/game-service`):
  - `src/auth/authConfig.js`
  - `src/auth/LocalJwtTokenVerifier.js`
  - `src/auth/OidcJwksTokenVerifier.js`
  - `src/auth/createTokenVerifier.js`
  - `src/server.js` (Socket.IO 인증 미들웨어에 `TokenVerifier` 주입, `/api/status`에 `auth.mode` 노출)
- 테스트: 단위/통합 테스트(실제 RSA 키페어 + 모의 JWKS + 키 로테이션 + local/oidc 모드 검증) 및 Playwright Headless Browser E2E 테스트

## 3. 기능 요구사항
1. **환경 변수 기반 인증 모드 전환 (FR-1)**:
   - `AUTH_MODE=local` (기본값): 대칭키(`JWT_SECRET`) 기반 `LocalJwtTokenVerifier` 사용.
   - `AUTH_MODE=oidc`: 외부 OIDC JWKS 공개키 기반 `OidcJwksTokenVerifier` 사용.
   - 알 수 없는 `AUTH_MODE` 또는 `oidc` 모드에서 `OIDC_ISSUER`/`OIDC_JWKS_URI` 모두 누락 시 명확한 오류를 발생시킨다.
2. **OIDC JWKS 공개키 검증 및 키 로테이션 지원 (FR-2)**:
   - 외부 추가 패키지 없이 Node.js 내장 `crypto.createPublicKey({ key: jwk, format: 'jwk' })`로 JWK를 검증한다.
   - `OIDC_JWKS_URI`가 미지정이면 `${OIDC_ISSUER}/.well-known/openid-configuration`에서 `jwks_uri`를 자동 디스커버리한다.
   - JWKS 응답을 캐싱하되, 토큰 헤더의 `kid`가 캐시에 없으면 1회 강제 갱신(Key Rotation 대응) 후 재검증한다.
   - 비대칭 알고리즘(`RS256`, `RS384`, `RS512`, `ES256`, `ES384`, `ES512`)만 허용해 알고리즘 혼동 공격을 방지한다.
   - 표준 OIDC 클레임(`sub`, `preferred_username`, `name`, `email`)을 `{ userId, username, isGuest, claims }`로 정규화한다.
3. **기존 `local` 모드 100% 하위 호환 (FR-3)**:
   - 기존 `user-service`의 일반 로그인/회원가입/맛보기(`guest1..N`) 토큰이 그대로 검증되며, `/api/game/api/status`에 `auth.mode`가 노출된다.

## 4. 인수 조건 (AC)
- [ ] `AUTH_MODE=local`에서 기존 `user-service` 토큰이 정상 검증되고 잘못된 서명 토큰은 거부된다.
- [ ] `AUTH_MODE=oidc`에서 RSA 키페어로 서명된 OIDC 토큰이 JWKS 공개키로 정상 검증되고, `kid` 키 로테이션 시 자동 재조회로 통과한다.
- [ ] `AUTH_MODE=oidc`에서 잘못된 `issuer`, `audience`, 또는 HS256 대칭 서명 토큰은 거부된다.
- [ ] 단위 테스트 및 Playwright E2E 테스트가 모두 통과한다.
