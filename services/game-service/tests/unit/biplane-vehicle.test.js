import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import yaml from 'yaml';
import { fileURLToPath } from 'url';
import EventEmitter from 'node:events';

import { VehicleFactory } from '../../src/services/VehicleFactory.js';
import GameManager from '../../src/services/GameManager.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(__dirname, '../../src/config/game-config.yaml');

function loadConfig() {
    const cfg = yaml.parse(fs.readFileSync(configPath, 'utf8'));
    cfg.npc = { ...(cfg.npc || {}), enabled: false };
    return cfg;
}

describe('Biplane (쌍엽기) Vehicle Config & Server Factory', () => {
    it('defines biplane in game-config.yaml slightly slower and slightly tankier than fighter', () => {
        const config = loadConfig();
        const fighter = config.vehicles.fighter;
        const heavy = config.vehicles.heavy;
        const biplane = config.vehicles.biplane;

        assert.ok(biplane, 'vehicles.biplane must be defined in game-config.yaml');
        assert.ok(biplane.maxSpeed < fighter.maxSpeed && biplane.maxSpeed > heavy.maxSpeed,
            `biplane.maxSpeed (${biplane.maxSpeed}) should be between heavy (${heavy.maxSpeed}) and fighter (${fighter.maxSpeed})`);
        assert.ok(biplane.health > fighter.health && biplane.health < heavy.health,
            `biplane.health (${biplane.health}) should be between fighter (${fighter.health}) and heavy (${heavy.health})`);
        assert.ok(biplane.model?.upperWing && biplane.model?.lowerWing && biplane.model?.propeller,
            'biplane model config must define upperWing, lowerWing, and propeller');
    });

    it('registers biplane in server VehicleFactory and applies 2x human health/firepower via GameManager', () => {
        const config = loadConfig();
        const factory = new VehicleFactory(config);
        assert.ok(factory.getAvailableTypes().includes('biplane'));

        const v = factory.createVehicle('v-bio', 'p-bio', { x: 0, y: 80, z: 0 }, { vehicleType: 'biplane', color: '#FF0000' });
        assert.equal(v.vehicleType, 'biplane');
        assert.equal(v.maxSpeed, config.vehicles.biplane.maxSpeed);
        assert.equal(v.maxHealth, config.vehicles.biplane.health);

        const gm = new GameManager(config, new EventEmitter());
        try {
            const res = gm.addPlayer('h-bio', 'RedBaron', 'biplane');
            assert.equal(res.success, true);
            assert.equal(res.vehicle.vehicleType, 'biplane');
            assert.equal(res.vehicle.maxHealth, Math.round(config.vehicles.biplane.health * config.game.playerHealthMultiplier));
            assert.equal(gm.weaponSystem.weapons.get('h-bio').get('machinegun').damage,
                Math.round(config.vehicles.biplane.bulletDamage * config.game.playerDamageMultiplier));
        } finally {
            gm.stopGameLoop();
        }
    });
});
