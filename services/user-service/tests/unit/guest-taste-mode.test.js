import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parseAllowGuestMode } from '../../src/config/guestModeConfig.js';
import { GuestNameAllocator } from '../../src/services/GuestNameAllocator.js';
import { UserService } from '../../src/services/UserService.js';

function createInMemoryUserRepository(initialUsernames = []) {
    const users = initialUsernames.map((username, idx) => ({
        id: `id-${idx + 1}`,
        username,
        isGuest: username.startsWith('guest'),
        preferredVehicleType: 'fighter',
        toJSON() {
            return { ...this };
        }
    }));

    return {
        users,
        async findUsernamesByPrefix(prefix) {
            return users
                .filter((u) => u.username.toLowerCase().startsWith(prefix.toLowerCase()))
                .map((u) => u.username);
        },
        async create(data) {
            if (users.some((u) => u.username === data.username)) {
                const err = new Error('Unique constraint error');
                err.name = 'SequelizeUniqueConstraintError';
                throw err;
            }
            const user = {
                id: `id-${users.length + 1}`,
                ...data,
                toJSON() {
                    return { ...this };
                }
            };
            users.push(user);
            return user;
        }
    };
}

describe('guestModeConfig.parseAllowGuestMode', () => {
    it('defaults to true when env value is undefined or empty', () => {
        assert.equal(parseAllowGuestMode(undefined), true);
        assert.equal(parseAllowGuestMode(''), true);
    });

    it('parses truthy and falsy env strings accurately', () => {
        assert.equal(parseAllowGuestMode('true'), true);
        assert.equal(parseAllowGuestMode('TRUE'), true);
        assert.equal(parseAllowGuestMode('1'), true);
        assert.equal(parseAllowGuestMode('false'), false);
        assert.equal(parseAllowGuestMode('FALSE'), false);
        assert.equal(parseAllowGuestMode('0'), false);
        assert.equal(parseAllowGuestMode('no'), false);
    });
});

describe('GuestNameAllocator', () => {
    it('allocates guest1 when no guests exist, then guest2, guest3 sequentially', async () => {
        const repo = createInMemoryUserRepository([]);
        const allocator = new GuestNameAllocator(repo, 'guest');

        assert.equal(await allocator.allocateNextName(), 'guest1');
        await repo.create({ username: 'guest1', isGuest: true });
        assert.equal(await allocator.allocateNextName(), 'guest2');
        await repo.create({ username: 'guest2', isGuest: true });
        assert.equal(await allocator.allocateNextName(), 'guest3');
    });

    it('ignores non-numeric suffixes and picks maxNumber + 1', async () => {
        const repo = createInMemoryUserRepository(['guest_abc', 'guest2', 'guest10', 'guestX']);
        const allocator = new GuestNameAllocator(repo, 'guest');

        assert.equal(await allocator.allocateNextName(), 'guest11');
    });
});

describe('UserService guest taste mode', () => {
    const baseConfig = {
        jwtSecret: 'test-secret',
        jwtExpiry: '1h',
        allowGuestMode: true
    };

    it('creates guest1, guest2, guest3 sequentially when username is omitted', async () => {
        const repo = createInMemoryUserRepository([]);
        const service = new UserService(repo, baseConfig);

        const g1 = await service.createGuestUser();
        const g2 = await service.createGuestUser();
        const g3 = await service.createGuestUser();

        assert.equal(g1.success, true);
        assert.equal(g1.user.username, 'guest1');
        assert.equal(g1.user.isGuest, true);
        assert.ok(g1.token);

        assert.equal(g2.user.username, 'guest2');
        assert.equal(g3.user.username, 'guest3');
    });

    it('retries with next sequential number on unique constraint collision', async () => {
        const repo = createInMemoryUserRepository([]);
        let injectedRace = false;
        const originalCreate = repo.create.bind(repo);
        repo.create = async (data) => {
            if (!injectedRace && data.username === 'guest1') {
                injectedRace = true;
                await originalCreate({ username: 'guest1', isGuest: true });
                const err = new Error('Unique race');
                err.name = 'SequelizeUniqueConstraintError';
                throw err;
            }
            return originalCreate(data);
        };

        const service = new UserService(repo, baseConfig);
        const result = await service.createGuestUser();
        assert.equal(result.success, true);
        assert.equal(result.user.username, 'guest2');
    });

    it('rejects guest creation when allowGuestMode is false', async () => {
        const repo = createInMemoryUserRepository([]);
        const service = new UserService(repo, { ...baseConfig, allowGuestMode: false });

        assert.equal(service.isGuestModeAllowed(), false);
        const result = await service.createGuestUser();
        assert.equal(result.success, false);
        assert.equal(result.statusCode, 403);
    });
});
