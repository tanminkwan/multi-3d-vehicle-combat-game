import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import yaml from 'yaml';
import { fileURLToPath } from 'url';
import { EventEmitter } from 'events';
import GameManager from '../../src/services/GameManager.js';
import { createGameServer } from '../../src/server.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(__dirname, '../../src/config/game-config.yaml');

function loadConfig(overrides = {}) {
    const raw = yaml.parse(fs.readFileSync(configPath, 'utf8'));
    if (overrides.npc) {
        raw.npc = { ...(raw.npc || {}), ...overrides.npc };
    }
    if (overrides.game) {
        raw.game = { ...(raw.game || {}), ...overrides.game };
    }
    return raw;
}

describe('GameManager + NPC full integration', () => {
    it('NPCs fly, engage each other (Deathmatch), and clean up completely when last human leaves', () => {
        const config = loadConfig({
            npc: { enabled: true, mode: 'fixed', fixedCount: 2, defaultDifficulty: 'hard' }
        });
        const ee = new EventEmitter();
        const gm = new GameManager(config, ee, { autoStartLoop: false });

        gm.addPlayer('h1', 'Pilot', 'fighter');
        assert.equal(gm.gameStateManager.getGameState(), 'playing');
        assert.equal(gm.playerManager.getNpcCount(), 2);

        const [npc1, npc2] = gm.playerManager.getNpcPlayers();
        const v1 = gm.vehicleManager.getPlayerVehicle(npc1.id);
        const v2 = gm.vehicleManager.getPlayerVehicle(npc2.id);
        const vHuman = gm.vehicleManager.getPlayerVehicle('h1');

        // Place human far away and two NPCs facing each other to verify NPC-vs-NPC combat
        vHuman.position.set(180, 150, 180);
        v1.position.set(0, 100, 0);
        v1.rotation = { x: 0, y: 0, z: 0 };
        v2.position.set(0, 100, 90);
        v2.rotation = { x: 0, y: Math.PI, z: 0 };

        const startPos1 = v1.position.clone();
        let npcBulletsFired = 0;
        ee.on('muzzleFlash', (data) => {
            if (data.playerId === npc1.id || data.playerId === npc2.id) {
                npcBulletsFired++;
            }
        });

        // Simulate 40 ticks (~640ms at 60Hz)
        let simNow = Date.now();
        for (let i = 0; i < 40; i++) {
            simNow += 16;
            gm.update(0.016, simNow);
        }

        // NPC1 moved from its initial position and fired at NPC2
        assert.ok(v1.position.distanceTo(startPos1) > 0.5, 'Expected NPC1 to fly and change position');
        assert.ok(npcBulletsFired > 0, 'Expected NPCs to engage and fire weapons at each other');

        // Last human leaves -> all NPCs, vehicles, colors cleaned up
        gm.removePlayer('h1');
        assert.equal(gm.playerManager.getAllPlayers().length, 0);
        assert.equal(gm.vehicleManager.getAllVehicles().length, 0);
        assert.equal(gm.playerManager.usedColors.size, 0);
        assert.equal(gm.gameStateManager.getGameState(), 'waiting');
    });

    it('cancels respawn timer when a destroyed NPC is removed so no ghost respawn occurs', async () => {
        const config = loadConfig({
            game: { respawnTime: 60 },
            npc: { enabled: true, mode: 'fill' }
        });
        const ee = new EventEmitter();
        const gm = new GameManager(config, ee, { autoStartLoop: false });

        gm.addPlayer('h1', 'Pilot', 'fighter');
        const targetNpc = gm.playerManager.getNpcPlayers()[0];
        const targetVehicle = gm.vehicleManager.getPlayerVehicle(targetNpc.id);

        let ghostRespawned = false;
        ee.on('vehicleRespawned', (data) => {
            if (data.vehicle.playerId === targetNpc.id) {
                ghostRespawned = true;
            }
        });

        // Destroy the NPC -> schedules 60ms respawn timer
        gm.handleVehicleDestroyed(targetVehicle, { ownerId: 'h1' });
        assert.equal(targetVehicle.active, false);

        // Incoming 2nd human removes the inactive NPC before respawn fires
        gm.addPlayer('h2', 'Pilot2', 'fighter');
        assert.equal(gm.playerManager.getPlayer(targetNpc.id), undefined);

        // Wait past respawnTime
        await new Promise(resolve => setTimeout(resolve, 120));
        assert.equal(ghostRespawned, false, 'Removed NPC must not ghost-respawn');
        assert.equal(gm.vehicleManager.getPlayerVehicle(targetNpc.id), null);
    });

    it('exposes GET/PUT /api/npc/config and NPC stats on GET /api/status', async () => {
        const config = loadConfig({
            npc: { enabled: true, mode: 'fill', defaultDifficulty: 'normal' }
        });
        const { server, io, gameManager } = createGameServer(config, { autoStartLoop: false });

        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        const port = server.address().port;
        const base = `http://127.0.0.1:${port}`;

        try {
            // Add 1 human so NPCs are active
            gameManager.addPlayer('h1', 'ApiTester', 'fighter');

            // 1. GET /api/npc/config
            const getRes = await fetch(`${base}/api/npc/config`);
            assert.equal(getRes.status, 200);
            const getBody = await getRes.json();
            assert.equal(getBody.config.mode, 'fill');
            assert.equal(getBody.counts.npc, 7);

            // 2. PUT /api/npc/config (valid update)
            const putRes = await fetch(`${base}/api/npc/config`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mode: 'fixed',
                    fixedCount: 2,
                    defaultDifficulty: 'hard',
                    difficulties: { hard: { reactionTimeMs: 90 } }
                })
            });
            assert.equal(putRes.status, 200);
            const putBody = await putRes.json();
            assert.equal(putBody.success, true);
            assert.equal(putBody.config.mode, 'fixed');
            assert.equal(putBody.counts.npc, 2);
            assert.equal(putBody.activeNpcs.length, 2);
            assert.equal(putBody.activeNpcs[0].difficulty, 'hard');

            // 3. PUT /api/npc/config (invalid payload -> 400)
            const badRes = await fetch(`${base}/api/npc/config`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mode: 'bogus', fixedCount: 999 })
            });
            assert.equal(badRes.status, 400);
            const badBody = await badRes.json();
            assert.equal(badBody.success, false);

            // 4. GET /api/status includes humanPlayers & npcPlayers
            const statusRes = await fetch(`${base}/api/status`);
            assert.equal(statusRes.status, 200);
            const statusBody = await statusRes.json();
            assert.equal(statusBody.humanPlayers, 1);
            assert.equal(statusBody.npcPlayers, 2);
            assert.equal(statusBody.players, 3);
        } finally {
            gameManager.stopGameLoop();
            io.close();
            await new Promise((resolve) => server.close(resolve));
        }
    });
});
