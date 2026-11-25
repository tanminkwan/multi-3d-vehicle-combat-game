import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

const ALLOWED_OIDC_ALGORITHMS = ['RS256', 'RS384', 'RS512', 'ES256', 'ES384', 'ES512'];

/**
 * 외부 OIDC IdP JWKS 공개키 기반 JWT 검증 어댑터 (AUTH_MODE=oidc)
 * - OIDC Discovery(.well-known/openid-configuration) 지원
 * - JWKS 캐싱 + kid 미스 시 1회 자동 갱신(키 로테이션 대응)
 * - 비대칭 서명 알고리즘만 허용해 HS256 키 혼동 공격 차단
 */
export class OidcJwksTokenVerifier {
    constructor(options = {}) {
        this.issuer = options.issuer ? options.issuer.replace(/\/+$/, '') : null;
        this.jwksUri = options.jwksUri || null;
        this.audience = options.audience || null;
        this.usernameClaim = options.usernameClaim || 'preferred_username';
        this.jwksCacheTtlMs = options.jwksCacheTtlMs || 300000;
        this.fetchFn = options.fetchFn || globalThis.fetch;

        if (!this.issuer && !this.jwksUri) {
            throw new Error('OIDC mode requires OIDC_ISSUER or OIDC_JWKS_URI');
        }

        this.resolvedJwksUri = this.jwksUri;
        this.keyCache = new Map(); // kid -> PEM string
        this.cacheExpiresAt = 0;
    }

    async resolveJwksUri() {
        if (this.resolvedJwksUri) {
            return this.resolvedJwksUri;
        }

        const discoveryUrl = `${this.issuer}/.well-known/openid-configuration`;
        const response = await this.fetchFn(discoveryUrl);
        if (!response || !response.ok) {
            throw new Error(`Failed to fetch OIDC discovery document from ${discoveryUrl}`);
        }

        const doc = await response.json();
        if (!doc?.jwks_uri) {
            throw new Error('OIDC discovery document missing jwks_uri');
        }

        this.resolvedJwksUri = doc.jwks_uri;
        return this.resolvedJwksUri;
    }

    async refreshJwksCache() {
        const uri = await this.resolveJwksUri();
        const response = await this.fetchFn(uri);
        if (!response || !response.ok) {
            throw new Error(`Failed to fetch JWKS from ${uri}`);
        }

        const body = await response.json();
        const keys = Array.isArray(body?.keys) ? body.keys : [];
        const nextCache = new Map();

        for (const jwk of keys) {
            if (!jwk || !jwk.kty) continue;
            if (jwk.use && jwk.use !== 'sig') continue;
            try {
                const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
                const pem = publicKey.export({ type: 'spki', format: 'pem' });
                const keyId = jwk.kid || '__default__';
                nextCache.set(keyId, pem);
            } catch {
                // 지원되지 않는 JWK 항목은 무시
            }
        }

        this.keyCache = nextCache;
        this.cacheExpiresAt = Date.now() + this.jwksCacheTtlMs;
    }

    async getPublicKeyPem(kid) {
        const lookupKey = kid || '__default__';
        const now = Date.now();

        if (now >= this.cacheExpiresAt || this.keyCache.size === 0) {
            await this.refreshJwksCache();
        }

        let pem = this.keyCache.get(lookupKey);
        if (!pem && kid) {
            // 키 로테이션 대응: 캐시에 없는 kid면 1회 강제 재조회
            await this.refreshJwksCache();
            pem = this.keyCache.get(lookupKey);
        }

        if (!pem && !kid && this.keyCache.size === 1) {
            pem = this.keyCache.values().next().value;
        }

        if (!pem) {
            throw new Error(`No matching JWK found for kid: ${kid || '(none)'}`);
        }

        return pem;
    }

    async verify(token) {
        if (!token || typeof token !== 'string') {
            throw new Error('Authentication token required');
        }

        const decodedComplete = jwt.decode(token, { complete: true });
        if (!decodedComplete || !decodedComplete.header) {
            throw new Error('Malformed JWT token');
        }

        const { alg, kid } = decodedComplete.header;
        if (!ALLOWED_OIDC_ALGORITHMS.includes(alg)) {
            throw new Error(`Disallowed JWT algorithm for OIDC mode: ${alg}`);
        }

        const publicKeyPem = await this.getPublicKeyPem(kid);
        const verifyOptions = {
            algorithms: ALLOWED_OIDC_ALGORITHMS
        };
        if (this.issuer) {
            verifyOptions.issuer = this.issuer;
        }
        if (this.audience) {
            verifyOptions.audience = this.audience;
        }

        const decoded = jwt.verify(token, publicKeyPem, verifyOptions);
        if (!decoded || typeof decoded !== 'object') {
            throw new Error('Invalid OIDC token payload');
        }

        const userId = decoded.sub || decoded.userId || null;
        const username =
            decoded[this.usernameClaim] ||
            decoded.preferred_username ||
            decoded.name ||
            decoded.email ||
            userId;

        if (!userId) {
            throw new Error('OIDC token missing sub claim');
        }

        return {
            userId: String(userId),
            username: String(username),
            isGuest: Boolean(decoded.isGuest),
            claims: decoded
        };
    }
}
