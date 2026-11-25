import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import yaml from 'yaml';
import { fileURLToPath } from 'url';
import EventEmitter from 'node:events';

import { resolveVehicleMaxHealth, resolveWeaponDamage } from '../../src/services/VehicleHealthPolicy.js';
import GameManager from '../../src/services/GameManager.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(__dirname, '../../src/config/game-config.yaml');

function loadConfig(overrides = {}) {
    const cfg = yaml.parse(fs.readFileSync(configPath, 'utf8'));
    cfg.npc = { ...(cfg.npc || {}), enabled: false };
    cfg.game = { ...(cfg.game || {}), ...overrides };
    return cfg;
}

describe('VehicleHealthPolicy.resolveVehicleMaxHealth', () => {
    it('doubles base health for human players when multiplier is 2.0', () => {
        assert.equal(resolveVehicleMaxHealth(80, { isNpc: false, playerHealthMultiplier: 2.0 }), 160);
        assert.equal(resolveVehicleMaxHealth(150, { isNpc: false, playerHealthMultiplier: 2.0 }), 300);
        assert.equal(resolveVehicleMaxHealth(20, { isNpc: false, playerHealthMultiplier: 2.0 }), 40);
    });

    it('keeps base health unchanged for NPC vehicles regardless of multiplier', () => {
        assert.equal(resolveVehicleMaxHealth(80, { isNpc: true, playerHealthMultiplier: 2.0 }), 80);
        assert.equal(resolveVehicleMaxHealth(150, { isNpc: true, playerHealthMultiplier: 2.0 }), 150);
        assert.equal(resolveVehicleMaxHealth(20, { isNpc: true, playerHealthMultiplier: 2.0 }), 20);
    });

    it('falls back to 1.0 on missing or invalid multiplier', () => {
        assert.equal(resolveVehicleMaxHealth(80, { isNpc: false, playerHealthMultiplier: undefined }), 80);
        assert.equal(resolveVehicleMaxHealth(80, { isNpc: false, playerHealthMultiplier: 0 }), 80);
        assert.equal(resolveVehicleMaxHealth(80, { isNpc: false, playerHealthMultiplier: -2 }), 80);
        assert.equal(resolveVehicleMaxHealth(80, { isNpc: false, playerHealthMultiplier: NaN }), 80);
    });
});

describe('VehicleHealthPolicy.resolveWeaponDamage', () => {
    it('doubles machinegun and missile damage for human players and keeps 1x for NPCs', () => {
        assert.equal(resolveWeaponDamage(8, { isNpc: false, playerDamageMultiplier: 2.0 }), 16);
        assert.equal(resolveWeaponDamage(30, { isNpc: false, playerDamageMultiplier: 2.0 }), 60);
        assert.equal(resolveWeaponDamage(8, { isNpc: true, playerDamageMultiplier: 2.0 }), 8);
        assert.equal(resolveWeaponDamage(30, { isNpc: true, playerDamageMultiplier: 2.0 }), 30);
    });
});

describe('GameManager human vs NPC vehicle health & firepower integration', () => {
    it('applies 2x health and 2x firepower to human players and preserves 1x for NPCs including after respawn', () => {
        const config = loadConfig();
        assert.equal(config.game.playerHealthMultiplier, 2.0);
        assert.equal(config.game.playerDamageMultiplier, 2.0);

        const gm = new GameManager(config, new EventEmitter());
        try {
            const humanFighter = gm.addPlayer('h1', 'HumanFighter', 'fighter');
            const humanHeavy = gm.addPlayer('h2', 'HumanHeavy', 'heavy');
            const npcFighter = gm.addPlayer('n1', 'NPC1', 'fighter', { isNpc: true });
            const npcHeavy = gm.addPlayer('n2', 'NPC2', 'heavy', { isNpc: true });

            // 체력 2배 (인간) vs 1배 (NPC)
            assert.equal(humanFighter.vehicle.maxHealth, 160);
            assert.equal(humanFighter.vehicle.health, 160);
            assert.equal(humanHeavy.vehicle.maxHealth, 300);
            assert.equal(humanHeavy.vehicle.health, 300);

            assert.equal(npcFighter.vehicle.maxHealth, 80);
            assert.equal(npcFighter.vehicle.health, 80);
            assert.equal(npcHeavy.vehicle.maxHealth, 150);
            assert.equal(npcHeavy.vehicle.health, 150);

            // 화력 2배 (인간) vs 1배 (NPC) - 기관총 & 미사일 모두 검증
            assert.equal(gm.weaponSystem.weapons.get('h1').get('machinegun').damage, 16);
            assert.equal(gm.weaponSystem.weapons.get('h1').get('missile').damage, 60);
            assert.equal(gm.weaponSystem.weapons.get('h2').get('machinegun').damage, 30);
            assert.equal(gm.weaponSystem.weapons.get('h2').get('missile').damage, 60);

            assert.equal(gm.weaponSystem.weapons.get('n1').get('machinegun').damage, 8);
            assert.equal(gm.weaponSystem.weapons.get('n1').get('missile').damage, 30);
            assert.equal(gm.weaponSystem.weapons.get('n2').get('machinegun').damage, 15);
            assert.equal(gm.weaponSystem.weapons.get('n2').get('missile').damage, 30);

            // 리스폰 후에도 유저 160 / NPC 80 유지 확인
            const hfVehicle = gm.vehicleManager.getPlayerVehicle('h1');
            const nfVehicle = gm.vehicleManager.getPlayerVehicle('n1');
            hfVehicle.health = 0;
            nfVehicle.health = 0;
            gm.vehicleManager.respawnVehicle(hfVehicle);
            gm.vehicleManager.respawnVehicle(nfVehicle);

            assert.equal(hfVehicle.health, 160);
            assert.equal(hfVehicle.maxHealth, 160);
            assert.equal(nfVehicle.health, 80);
            assert.equal(nfVehicle.maxHealth, 80);
        } finally {
            gm.stopGameLoop();
        }
    });
});
