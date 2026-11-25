# Auth Adapter (`TokenVerifier`) & `AUTH_MODE=local | oidc` Design

## 1. 아키텍처 및 SOLID 책임 분리

```
                  TokenVerifier Port (DIP)
                verify(token) => AuthIdentity
                 /                         \
   LocalJwtTokenVerifier           OidcJwksTokenVerifier
   (AUTH_MODE=local, HS256)        (AUTH_MODE=oidc, RS256/ES256 JWKS)
```

| 모듈 | 위치 | 책임 (SRP) |
| --- | --- | --- |
| `authConfig.js` | `services/game-service/src/auth/authConfig.js` | `AUTH_MODE`, `JWT_SECRET`, `OIDC_*` 환경 변수 파싱 및 유효성 검증 |
| `LocalJwtTokenVerifier.js` | `services/game-service/src/auth/LocalJwtTokenVerifier.js` | 기존 `user-service` 대칭키 JWT 검증 및 `AuthIdentity` 정규화 |
| `OidcJwksTokenVerifier.js` | `services/game-service/src/auth/OidcJwksTokenVerifier.js` | OIDC Discovery / JWKS 조회·캐싱·키 로테이션 재조회 및 비대칭 서명 검증 |
| `createTokenVerifier.js` | `services/game-service/src/auth/createTokenVerifier.js` | 설정에 따라 적절한 `TokenVerifier` 구현체를 생성하는 팩토리 (OCP) |
| `server.js` | `services/game-service/src/server.js` | `options.tokenVerifier` 주입 또는 팩토리 생성 후 Socket.IO `io.use()` 미들웨어에 연결 |

## 2. 정규화된 인증 결과 (`AuthIdentity`)
```ts
interface AuthIdentity {
  userId: string;
  username: string;
  isGuest: boolean;
  claims: Record<string, unknown>;
}
```
- **Local 매핑**: `userId = decoded.userId || decoded.sub`, `username = decoded.username || decoded.preferred_username || decoded.name`
- **OIDC 매핑**: `userId = decoded.sub || decoded.userId`, `username = decoded[usernameClaim] || decoded.preferred_username || decoded.name || decoded.email || decoded.sub`

## 3. 환경 변수 (`docker-compose.yml`)
```yaml
game-service:
  environment:
    AUTH_MODE: ${AUTH_MODE:-local}
    JWT_SECRET: your-super-secret-jwt-key-change-in-production
    OIDC_ISSUER: ${OIDC_ISSUER:-}
    OIDC_JWKS_URI: ${OIDC_JWKS_URI:-}
    OIDC_AUDIENCE: ${OIDC_AUDIENCE:-}
    OIDC_USERNAME_CLAIM: ${OIDC_USERNAME_CLAIM:-preferred_username}
```

## 4. 테스트 전략
- **단위 테스트 (`services/game-service/tests/unit/auth-token-verifier.test.js`)**:
  - `resolveAuthConfig`: 기본 `local`, `oidc` 파싱, 잘못된 모드 및 필수값 누락 에러.
  - `LocalJwtTokenVerifier`: 정상 토큰 검증, 변조 서명 거부.
  - `OidcJwksTokenVerifier`: Node `crypto.generateKeyPairSync('rsa')`로 실제 RS256 JWT 발급 + 모의 OIDC Discovery/JWKS `fetchFn` 주입 → 정상 검증, `kid` 키 로테이션 자동 갱신, 잘못된 `issuer`/`audience`/HS256 알고리즘 혼동 공격 거부 검증.
- **Playwright E2E (`tests/e2e/auth-adapter.spec.js`)**:
  - 라이브 스택에서 `/api/game/api/status`의 `auth.mode === 'local'` 노출 확인 및 맛보기 로그인 → Socket.IO 인증 통과 → 게임 입장 정상 동작 검증.
