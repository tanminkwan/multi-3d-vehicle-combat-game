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

describe('Helicopter (헬리콥터) Vehicle Config & Server Factory', () => {
    it('defines helicopter with 12 missiles, biplane speed, and fighter health in game-config.yaml', () => {
        const config = loadConfig();
        const fighter = config.vehicles.fighter;
        const biplane = config.vehicles.biplane;
        const heli = config.vehicles.helicopter;

        assert.ok(heli, 'vehicles.helicopter must be defined in game-config.yaml');
        assert.equal(heli.missileCount, 12);
        assert.equal(heli.maxSpeed, biplane.maxSpeed);
        assert.equal(heli.acceleration, biplane.acceleration);
        assert.equal(heli.health, fighter.health);
        assert.ok(heli.model?.mainRotor && heli.model?.tailRotor && heli.model?.missilePod);
    });

    it('registers helicopter in VehicleFactory and equips 12 missiles + 160 human HP via GameManager', () => {
        const config = loadConfig();
        const factory = new VehicleFactory(config);
        assert.ok(factory.getAvailableTypes().includes('helicopter'));

        const gm = new GameManager(config, new EventEmitter());
        try {
            const res = gm.addPlayer('h-heli', 'Apache1', 'helicopter');
            assert.equal(res.success, true);
            assert.equal(res.vehicle.vehicleType, 'helicopter');
            assert.equal(res.vehicle.maxHealth, 160);
            assert.equal(gm.vehicleManager.getPlayerVehicle('h-heli').maxSpeed, 50);

            const missileWeapon = gm.weaponSystem.weapons.get('h-heli').get('missile');
            assert.equal(missileWeapon.ammo, 12);
            assert.equal(missileWeapon.maxAmmo, 12);
        } finally {
            gm.stopGameLoop();
        }
    });
});
