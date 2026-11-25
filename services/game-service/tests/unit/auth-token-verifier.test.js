import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

import { resolveAuthConfig } from '../../src/auth/authConfig.js';
import { LocalJwtTokenVerifier } from '../../src/auth/LocalJwtTokenVerifier.js';
import { OidcJwksTokenVerifier } from '../../src/auth/OidcJwksTokenVerifier.js';
import { createTokenVerifier } from '../../src/auth/createTokenVerifier.js';

function createRsaKeyPairWithJwk(kid) {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const jwk = publicKey.export({ format: 'jwk' });
    return {
        kid,
        privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }),
        jwk: { ...jwk, kid, use: 'sig', alg: 'RS256' }
    };
}

describe('authConfig.resolveAuthConfig', () => {
    it('defaults to local mode and parses oidc env vars cleanly', () => {
        const localCfg = resolveAuthConfig({ JWT_SECRET: 'my-secret' });
        assert.equal(localCfg.mode, 'local');
        assert.equal(localCfg.local.jwtSecret, 'my-secret');

        const oidcCfg = resolveAuthConfig({
            AUTH_MODE: 'oidc',
            OIDC_ISSUER: 'https://idp.example.com/realms/game',
            OIDC_AUDIENCE: 'vehicle-game',
            OIDC_USERNAME_CLAIM: 'preferred_username'
        });
        assert.equal(oidcCfg.mode, 'oidc');
        assert.equal(oidcCfg.oidc.issuer, 'https://idp.example.com/realms/game');
        assert.equal(oidcCfg.oidc.audience, 'vehicle-game');
    });

    it('rejects unknown AUTH_MODE or oidc mode missing issuer/jwksUri', () => {
        assert.throws(() => resolveAuthConfig({ AUTH_MODE: 'saml' }), /Unsupported AUTH_MODE/);
        assert.throws(() => createTokenVerifier(resolveAuthConfig({ AUTH_MODE: 'oidc' })), /OIDC_ISSUER|OIDC_JWKS_URI/);
    });
});

describe('LocalJwtTokenVerifier (AUTH_MODE=local)', () => {
    it('verifies valid user-service JWT and rejects tampered tokens', async () => {
        const verifier = new LocalJwtTokenVerifier({ jwtSecret: 'local-test-secret', allowLegacyFallback: false });
        const token = jwt.sign({ userId: 'u-1', username: 'PilotLocal', isGuest: true }, 'local-test-secret', { expiresIn: '1h' });

        const identity = await verifier.verify(token);
        assert.equal(identity.userId, 'u-1');
        assert.equal(identity.username, 'PilotLocal');
        assert.equal(identity.isGuest, true);

        const badToken = jwt.sign({ userId: 'u-1', username: 'Hacker' }, 'wrong-secret', { expiresIn: '1h' });
        await assert.rejects(() => verifier.verify(badToken));
    });
});

describe('OidcJwksTokenVerifier (AUTH_MODE=oidc)', () => {
    it('discovers JWKS from issuer, verifies RS256 OIDC JWT, and handles key rotation (kid miss)', async () => {
        const key1 = createRsaKeyPairWithJwk('key-1');
        const key2 = createRsaKeyPairWithJwk('key-2');
        let activeJwks = [key1.jwk];
        let jwksFetchCount = 0;

        const mockFetch = async (url) => {
            if (url === 'https://idp.example.com/.well-known/openid-configuration') {
                return {
                    ok: true,
                    json: async () => ({ jwks_uri: 'https://idp.example.com/protocol/openid-connect/certs' })
                };
            }
            if (url === 'https://idp.example.com/protocol/openid-connect/certs') {
                jwksFetchCount += 1;
                return {
                    ok: true,
                    json: async () => ({ keys: activeJwks })
                };
            }
            throw new Error(`Unexpected fetch URL: ${url}`);
        };

        const verifier = new OidcJwksTokenVerifier({
            issuer: 'https://idp.example.com',
            audience: 'vehicle-game',
            usernameClaim: 'preferred_username',
            fetchFn: mockFetch
        });

        // 1. key-1 서명 토큰 검증 (Discovery + JWKS 조회)
        const token1 = jwt.sign(
            { sub: 'oidc-sub-1', preferred_username: 'corp_pilot1' },
            key1.privateKeyPem,
            { algorithm: 'RS256', keyid: 'key-1', issuer: 'https://idp.example.com', audience: 'vehicle-game', expiresIn: '1h' }
        );
        const id1 = await verifier.verify(token1);
        assert.equal(id1.userId, 'oidc-sub-1');
        assert.equal(id1.username, 'corp_pilot1');
        assert.equal(jwksFetchCount, 1);

        // 2. 캐시 히트 (JWKS 재조회 없음)
        await verifier.verify(token1);
        assert.equal(jwksFetchCount, 1);

        // 3. IdP 키 로테이션(key-2 도입) -> kid 미스 시 1회 자동 재조회 후 검증 성공
        activeJwks = [key1.jwk, key2.jwk];
        const token2 = jwt.sign(
            { sub: 'oidc-sub-2', preferred_username: 'corp_pilot2' },
            key2.privateKeyPem,
            { algorithm: 'RS256', keyid: 'key-2', issuer: 'https://idp.example.com', audience: 'vehicle-game', expiresIn: '1h' }
        );
        const id2 = await verifier.verify(token2);
        assert.equal(id2.userId, 'oidc-sub-2');
        assert.equal(id2.username, 'corp_pilot2');
        assert.equal(jwksFetchCount, 2);

        // 4. 잘못된 issuer / audience / HS256 알고리즘 혼동 공격 거부
        const wrongIssuerToken = jwt.sign(
            { sub: 'u', preferred_username: 'x' },
            key1.privateKeyPem,
            { algorithm: 'RS256', keyid: 'key-1', issuer: 'https://evil.example.com', audience: 'vehicle-game', expiresIn: '1h' }
        );
        await assert.rejects(() => verifier.verify(wrongIssuerToken));

        const hs256ConfusionToken = jwt.sign(
            { sub: 'u', preferred_username: 'x' },
            'some-symmetric-secret',
            { algorithm: 'HS256', keyid: 'key-1', issuer: 'https://idp.example.com', audience: 'vehicle-game', expiresIn: '1h' }
        );
        await assert.rejects(() => verifier.verify(hs256ConfusionToken));
    });
});
