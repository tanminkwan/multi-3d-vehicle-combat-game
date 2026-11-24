import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import yaml from 'yaml';
import { fileURLToPath } from 'url';
import { EventEmitter } from 'events';
import GameManager from '../../src/services/GameManager.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(__dirname, '../../src/config/game-config.yaml');

function loadConfig(npcOverride = {}) {
    const raw = yaml.parse(fs.readFileSync(configPath, 'utf8'));
    raw.npc = {
        ...(raw.npc || {}),
        ...npcOverride
    };
    return raw;
}

describe('NpcManager modes, naming, difficulty, and dynamic config', () => {
    it('fill mode: 0 humans -> 0 NPCs; 1 human -> 7 NPCs (NPC1..NPC7); more humans reduce NPCs 1-by-1; leaving restores NPCs', () => {
        const config = loadConfig({ enabled: true, mode: 'fill', keepAliveWhenEmpty: false });
        const gm = new GameManager(config, new EventEmitter(), { autoStartLoop: false });

        // Initially 0 humans -> 0 NPCs
        assert.equal(gm.playerManager.getHumanCount(), 0);
        assert.equal(gm.playerManager.getNpcCount(), 0);

        // 1st human joins -> 7 NPCs spawned (total 8)
        const r1 = gm.addPlayer('h1', 'Alice', 'fighter');
        assert.equal(r1.success, true);
        assert.equal(gm.playerManager.getHumanCount(), 1);
        assert.equal(gm.playerManager.getNpcCount(), 7);
        assert.equal(gm.playerManager.getAllPlayers().length, 8);

        const names = gm.playerManager.getNpcPlayers().map(p => p.name).sort();
        assert.deepEqual(names, ['NPC1', 'NPC2', 'NPC3', 'NPC4', 'NPC5', 'NPC6', 'NPC7']);

        // 2nd and 3rd humans join -> NPCs drop 7 -> 6 -> 5
        assert.equal(gm.addPlayer('h2', 'Bob', 'heavy').success, true);
        assert.equal(gm.playerManager.getNpcCount(), 6);
        assert.equal(gm.addPlayer('h3', 'Carol', 'fighter').success, true);
        assert.equal(gm.playerManager.getNpcCount(), 5);
        assert.equal(gm.playerManager.getAllPlayers().length, 8);

        // Fill remaining 5 slots with humans -> NPCs drop to 0
        for (let i = 4; i <= 8; i++) {
            assert.equal(gm.addPlayer(`h${i}`, `User${i}`, 'fighter').success, true);
        }
        assert.equal(gm.playerManager.getHumanCount(), 8);
        assert.equal(gm.playerManager.getNpcCount(), 0);

        // 9th human rejected with Game is full
        const r9 = gm.addPlayer('h9', 'Overflow', 'fighter');
        assert.equal(r9.success, false);
        assert.equal(r9.reason, 'Game is full');

        // 1 human leaves -> 1 NPC added back (NPC1)
        gm.removePlayer('h8');
        assert.equal(gm.playerManager.getHumanCount(), 7);
        assert.equal(gm.playerManager.getNpcCount(), 1);
        assert.equal(gm.playerManager.getNpcPlayers()[0].name, 'NPC1');

        // All remaining humans leave -> 0 NPCs, game ends
        for (let i = 1; i <= 7; i++) {
            gm.removePlayer(`h${i}`);
        }
        assert.equal(gm.playerManager.getHumanCount(), 0);
        assert.equal(gm.playerManager.getNpcCount(), 0);
        assert.equal(gm.playerManager.getAllPlayers().length, 0);
        assert.equal(gm.gameStateManager.getGameState(), 'waiting');
    });

    it('fixed mode: maintains fixedCount NPCs and shrinks/recovers when humans exceed remaining slots', () => {
        const config = loadConfig({ enabled: true, mode: 'fixed', fixedCount: 3, prioritizeHumans: true });
        const gm = new GameManager(config, new EventEmitter(), { autoStartLoop: false });

        // 1 human -> 3 NPCs
        assert.equal(gm.addPlayer('h1', 'Alice', 'fighter').success, true);
        assert.equal(gm.playerManager.getNpcCount(), 3);

        // 5 humans total -> still 3 NPCs (5 + 3 = 8)
        for (let i = 2; i <= 5; i++) {
            assert.equal(gm.addPlayer(`h${i}`, `User${i}`, 'fighter').success, true);
        }
        assert.equal(gm.playerManager.getNpcCount(), 3);

        // 6th human -> prioritizes human, NPC shrinks to 2
        assert.equal(gm.addPlayer('h6', 'User6', 'fighter').success, true);
        assert.equal(gm.playerManager.getHumanCount(), 6);
        assert.equal(gm.playerManager.getNpcCount(), 2);

        // 6th human leaves -> NPC recovers to 3
        gm.removePlayer('h6');
        assert.equal(gm.playerManager.getHumanCount(), 5);
        assert.equal(gm.playerManager.getNpcCount(), 3);
    });

    it('reuses smallest unused NPC number and spawns only fighter/heavy vehicle types', () => {
        const config = loadConfig({ enabled: true, mode: 'fixed', fixedCount: 3, vehicleTypes: ['fighter', 'heavy'] });
        const gm = new GameManager(config, new EventEmitter(), { autoStartLoop: false });

        gm.addPlayer('h1', 'Alice', 'fighter');
        const npcs = gm.playerManager.getNpcPlayers();
        assert.equal(npcs.length, 3);
        for (const npc of npcs) {
            assert.ok(['fighter', 'heavy'].includes(npc.vehicleType), `Unexpected vehicleType: ${npc.vehicleType}`);
        }

        // Remove NPC2 specifically, then increase fixedCount to 3 again via reconcile
        const npc2 = npcs.find(p => p.name === 'NPC2');
        assert.ok(npc2);
        gm.npcManager.removeNpc(npc2.id);
        assert.equal(gm.playerManager.getNpcCount(), 2);

        gm.npcManager.reconcile();
        const updatedNames = gm.playerManager.getNpcPlayers().map(p => p.name).sort();
        assert.deepEqual(updatedNames, ['NPC1', 'NPC2', 'NPC3']);
    });

    it('prioritizes removing inactive (respawning) NPC when making room for incoming human', () => {
        const config = loadConfig({ enabled: true, mode: 'fill' });
        const gm = new GameManager(config, new EventEmitter(), { autoStartLoop: false });

        gm.addPlayer('h1', 'Alice', 'fighter');
        const npcs = gm.playerManager.getNpcPlayers();
        const targetNpc = npcs.find(p => p.name === 'NPC4');
        const targetVehicle = gm.vehicleManager.getPlayerVehicle(targetNpc.id);
        targetVehicle.active = false; // simulate destroyed / waiting for respawn

        // 2nd human enters -> NPC4 (inactive) should be chosen for removal
        gm.addPlayer('h2', 'Bob', 'fighter');
        assert.equal(gm.playerManager.getPlayer(targetNpc.id), undefined);
        assert.equal(gm.playerManager.getNpcCount(), 6);
    });

    it('updateConfig dynamically switches mode, fixedCount, difficulty, and rejects invalid inputs', () => {
        const config = loadConfig({ enabled: true, mode: 'fill', defaultDifficulty: 'normal' });
        const gm = new GameManager(config, new EventEmitter(), { autoStartLoop: false });

        gm.addPlayer('h1', 'Alice', 'fighter');
        assert.equal(gm.playerManager.getNpcCount(), 7);

        // Dynamically switch to fixed mode (2 hard NPCs with custom reactionTimeMs)
        const ok = gm.updateNpcConfig({
            mode: 'fixed',
            fixedCount: 2,
            defaultDifficulty: 'hard',
            difficulties: {
                hard: { reactionTimeMs: 75 }
            }
        });
        assert.equal(ok.success, true);
        assert.equal(gm.playerManager.getNpcCount(), 2);
        for (const npc of gm.playerManager.getNpcPlayers()) {
            assert.equal(npc.difficulty, 'hard');
            const entry = gm.npcManager.controllers.get(npc.id);
            assert.equal(entry.controller.profile.reactionTimeMs, 75);
        }

        // Invalid patch rejected without mutating existing config
        const bad = gm.updateNpcConfig({
            mode: 'invalid_mode',
            fixedCount: -5,
            defaultDifficulty: 'godmode'
        });
        assert.equal(bad.success, false);
        assert.ok(bad.errors.length >= 3);
        assert.equal(gm.getNpcStatus().config.mode, 'fixed');
        assert.equal(gm.getNpcStatus().config.fixedCount, 2);
    });
});
