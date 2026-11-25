import { LocalJwtTokenVerifier } from './LocalJwtTokenVerifier.js';
import { OidcJwksTokenVerifier } from './OidcJwksTokenVerifier.js';

/**
 * AuthMode 설정에 따라 TokenVerifier 구현체를 생성하는 팩토리 (OCP / DIP)
 */
export function createTokenVerifier(authConfig, deps = {}) {
    if (!authConfig || authConfig.mode === 'local') {
        return new LocalJwtTokenVerifier(authConfig?.local || {});
    }

    if (authConfig.mode === 'oidc') {
        return new OidcJwksTokenVerifier({
            ...(authConfig.oidc || {}),
            fetchFn: deps.fetchFn
        });
    }

    throw new Error(`Unsupported AUTH_MODE: "${authConfig.mode}"`);
}
