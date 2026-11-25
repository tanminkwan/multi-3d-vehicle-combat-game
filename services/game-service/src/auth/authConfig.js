/**
 * 인증 모드 및 OIDC/Local 설정 파서 (SRP)
 * 환경 변수(AUTH_MODE=local | oidc)를 기반으로 인증 어댑터 설정을 정규화한다.
 */
const SUPPORTED_AUTH_MODES = new Set(['local', 'oidc']);

export function resolveAuthConfig(env = process.env) {
    const rawMode = (env.AUTH_MODE || 'local').trim().toLowerCase();
    if (!SUPPORTED_AUTH_MODES.has(rawMode)) {
        throw new Error(`Unsupported AUTH_MODE: "${rawMode}". Expected "local" or "oidc".`);
    }

    const cacheTtlMs = Number(env.OIDC_JWKS_CACHE_TTL_MS);

    return {
        mode: rawMode,
        local: {
            jwtSecret: env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production',
            allowLegacyFallback: env.ALLOW_LEGACY_JWT_FALLBACK !== 'false'
        },
        oidc: {
            issuer: (env.OIDC_ISSUER || '').trim().replace(/\/+$/, '') || null,
            jwksUri: (env.OIDC_JWKS_URI || '').trim() || null,
            audience: (env.OIDC_AUDIENCE || '').trim() || null,
            usernameClaim: (env.OIDC_USERNAME_CLAIM || 'preferred_username').trim(),
            jwksCacheTtlMs: Number.isFinite(cacheTtlMs) && cacheTtlMs > 0 ? cacheTtlMs : 300000
        }
    };
}
