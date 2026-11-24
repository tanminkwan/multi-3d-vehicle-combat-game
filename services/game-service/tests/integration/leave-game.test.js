import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import yaml from 'yaml';
import { fileURLToPath } from 'url';
import { EventEmitter } from 'events';
import GameManager from '../../src/services/GameManager.js';
import { defaultOnPlayerLeave, createSafeLeaveInvoker } from '../../src/services/hooks/PlayerLeaveCallback.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(__dirname, '../../src/config/game-config.yaml');

function loadConfig(npcOverride = {}) {
    const raw = yaml.parse(fs.readFileSync(configPath, 'utf8'));
    raw.npc = { ...(raw.npc || {}), ...npcOverride };
    return raw;
}

describe('Leave Game & onPlayerLeave Callback', () => {
    it('defaultOnPlayerLeave is a safe no-op function', async () => {
        const res = await defaultOnPlayerLeave({ playerId: 'p1', reason: 'leave' });
        assert.equal(res, undefined);
    });

    it('invokes injected onPlayerLeave callback once with context and is idempotent on repeated removePlayer', async () => {
        const calls = [];
        const config = loadConfig({ enabled: true, mode: 'fill' });
        const gm = new GameManager(config, new EventEmitter(), {
            autoStartLoop: false,
            onPlayerLeave: async (ctx) => {
                calls.push(ctx);
            }
        });

        gm.addPlayer('h1', 'Pilot', 'fighter');
        assert.equal(gm.playerManager.getNpcCount(), 7);

        // 1st remove (explicit leaveGame)
        const removed1 = gm.removePlayer('h1', { reason: 'leave', userId: 'u-1', username: 'Pilot' });
        assert.equal(removed1, true);
        assert.equal(gm.playerManager.getHumanCount(), 0);
        assert.equal(gm.playerManager.getNpcCount(), 0);
        assert.equal(gm.gameStateManager.getGameState(), 'waiting');

        // 2nd remove (e.g. subsequent socket disconnect) -> idempotent, no duplicate callback
        const removed2 = gm.removePlayer('h1', { reason: 'disconnect', userId: 'u-1', username: 'Pilot' });
        assert.equal(removed2, false);

        await new Promise((r) => setTimeout(r, 20));
        assert.equal(calls.length, 1);
        assert.equal(calls[0].playerId, 'h1');
        assert.equal(calls[0].userId, 'u-1');
        assert.equal(calls[0].username, 'Pilot');
        assert.equal(calls[0].reason, 'leave');
        assert.equal(calls[0].vehicleType, 'fighter');
        assert.equal(typeof calls[0].playTimeMs, 'number');
        assert.deepEqual(calls[0].stats, { score: 0, kills: 0, deaths: 0 });
    });

    it('isolates sync/async callback errors without breaking player removal or NPC cleanup', async () => {
        const invoker = createSafeLeaveInvoker(async () => {
            throw new Error('simulated callback failure');
        });
        await assert.doesNotReject(() => invoker({ playerId: 'p1' }));

        const config = loadConfig({ enabled: true, mode: 'fill' });
        const gm = new GameManager(config, new EventEmitter(), {
            autoStartLoop: false,
            onPlayerLeave: () => {
                throw new Error('sync boom');
            }
        });

        gm.addPlayer('h1', 'Pilot', 'fighter');
        assert.doesNotThrow(() => gm.removePlayer('h1', { reason: 'leave' }));
        assert.equal(gm.playerManager.getAllPlayers().length, 0);
    });

    it('does not invoke onPlayerLeave for NPC removals', async () => {
        const calls = [];
        const config = loadConfig({ enabled: true, mode: 'fixed', fixedCount: 2 });
        const gm = new GameManager(config, new EventEmitter(), {
            autoStartLoop: false,
            onPlayerLeave: (ctx) => calls.push(ctx)
        });

        gm.addPlayer('h1', 'Pilot', 'fighter');
        const npc = gm.playerManager.getNpcPlayers()[0];
        gm.npcManager.removeNpc(npc.id);

        await new Promise((r) => setTimeout(r, 20));
        assert.equal(calls.length, 0);
    });
});
