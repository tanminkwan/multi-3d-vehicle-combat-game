import jwt from 'jsonwebtoken';

const LEGACY_FALLBACK_SECRETS = [
    'your-super-secret-jwt-key-change-in-production',
    'your-secret-key-change-in-production',
    'your-secret-key-change-this',
    'your-secret-key-here-change-in-production'
];

/**
 * 로컬 대칭키(HS256) JWT 검증 어댑터 (AUTH_MODE=local)
 * 기존 user-service가 발급한 JWT를 검증하고 표준 AuthIdentity로 정규화한다.
 */
export class LocalJwtTokenVerifier {
    constructor(options = {}) {
        this.jwtSecret = options.jwtSecret || 'your-super-secret-jwt-key-change-in-production';
        this.allowLegacyFallback = options.allowLegacyFallback !== false;
    }

    async verify(token) {
        if (!token || typeof token !== 'string') {
            throw new Error('Authentication token required');
        }

        const candidateSecrets = this.allowLegacyFallback
            ? [this.jwtSecret, ...LEGACY_FALLBACK_SECRETS.filter((s) => s !== this.jwtSecret)]
            : [this.jwtSecret];

        let decoded = null;
        for (const secret of candidateSecrets) {
            try {
                decoded = jwt.verify(token, secret);
                break;
            } catch {
                // 다음 후보 시크릿 시도
            }
        }

        if (!decoded || typeof decoded !== 'object') {
            throw new Error('Invalid local JWT token');
        }

        const userId = decoded.userId || decoded.sub || null;
        const username = decoded.username || decoded.preferred_username || decoded.name || null;

        if (!userId && !username) {
            throw new Error('Token missing user identity claims');
        }

        return {
            userId: String(userId || username),
            username: String(username || userId),
            isGuest: Boolean(decoded.isGuest),
            claims: decoded
        };
    }
}
