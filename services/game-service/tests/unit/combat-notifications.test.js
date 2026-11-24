import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import yaml from 'yaml';
import { fileURLToPath } from 'url';
import EventEmitter from 'node:events';

import { formatGameEventNotification } from '../../../../client/js/ui/GameEventNotificationFormatter.js';
import GameManager from '../../src/services/GameManager.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(__dirname, '../../src/config/game-config.yaml');

function loadGameConfig() {
    const cfg = yaml.parse(fs.readFileSync(configPath, 'utf8'));
    cfg.npc = { ...(cfg.npc || {}), enabled: false };
    return cfg;
}

describe('GameEventNotificationFormatter (Client Combat Notifications)', () => {
    it('suppresses vehicleRespawned notification when another player or NPC respawns', () => {
        const result = formatGameEventNotification(
            'vehicleRespawned',
            { vehicle: { id: 'veh-npc', playerId: 'npc-1' }, shouldShow: true },
            { myPlayerId: 'player-me', players: [] }
        );
        assert.equal(result, null);
    });

    it('shows respawn notification only when my own vehicle respawns', () => {
        const result = formatGameEventNotification(
            'vehicleRespawned',
            { vehicle: { id: 'veh-me', playerId: 'player-me' }, shouldShow: true },
            { myPlayerId: 'player-me', players: [] }
        );
        assert.deepEqual(result, {
            message: '차량이 리스폰되었습니다.',
            type: 'success'
        });
    });

    it('formats vehicleDestroyed with victim and killer names ("OOO가 XXX에게 격추되었습니다!")', () => {
        const myKill = formatGameEventNotification(
            'vehicleDestroyed',
            {
                vehicleId: 'veh-npc',
                playerId: 'npc-1',
                playerName: 'NPC1',
                killedBy: 'player-me',
                killerName: 'PilotA'
            },
            { myPlayerId: 'player-me', players: [] }
        );
        assert.deepEqual(myKill, {
            message: 'NPC1가 PilotA에게 격추되었습니다!',
            type: 'success'
        });

        const myDeath = formatGameEventNotification(
            'vehicleDestroyed',
            {
                vehicleId: 'veh-me',
                playerId: 'player-me',
                playerName: 'PilotA',
                killedBy: 'npc-1',
                killerName: 'NPC1'
            },
            { myPlayerId: 'player-me', players: [] }
        );
        assert.deepEqual(myDeath, {
            message: 'PilotA가 NPC1에게 격추되었습니다!',
            type: 'error'
        });

        const otherKill = formatGameEventNotification(
            'vehicleDestroyed',
            {
                vehicleId: 'veh-npc2',
                playerId: 'npc-2',
                playerName: 'NPC2',
                killedBy: 'npc-1',
                killerName: 'NPC1'
            },
            { myPlayerId: 'player-me', players: [] }
        );
        assert.deepEqual(otherKill, {
            message: 'NPC2가 NPC1에게 격추되었습니다!',
            type: 'warning'
        });
    });

    it('falls back to players list when playerName or killerName is missing from payload', () => {
        const result = formatGameEventNotification(
            'vehicleDestroyed',
            { vehicleId: 'veh-2', playerId: 'p2', killedBy: 'p1' },
            {
                myPlayerId: 'p3',
                players: [
                    { id: 'p1', name: 'Ace' },
                    { id: 'p2', name: 'NPC2' }
                ]
            }
        );
        assert.deepEqual(result, {
            message: 'NPC2가 Ace에게 격추되었습니다!',
            type: 'warning'
        });
    });

    it('formats crash notification when there is no killer (terrain/obstacle collision)', () => {
        const result = formatGameEventNotification(
            'vehicleDestroyed',
            {
                vehicleId: 'veh-npc',
                playerId: 'npc-1',
                playerName: 'NPC1',
                killedBy: null,
                killerName: null
            },
            { myPlayerId: 'player-me', players: [] }
        );
        assert.deepEqual(result, {
            message: 'NPC1가 추락했습니다!',
            type: 'warning'
        });
    });
});

describe('GameManager.handleVehicleDestroyed payload (Server)', () => {
    it('emits playerName and killerName in vehicleDestroyed event', () => {
        const config = loadGameConfig();
        const eventEmitter = new EventEmitter();
        const gm = new GameManager(config, eventEmitter);

        try {
            const p1 = gm.addPlayer('p1', 'PilotA', 'fighter');
            const p2 = gm.addPlayer('p2', 'NPC1', 'fighter', { isNpc: true });
            assert.equal(p1.success, true);
            assert.equal(p2.success, true);

            const emitted = [];
            eventEmitter.on('vehicleDestroyed', (payload) => emitted.push(payload));

            const victimVehicle = gm.vehicleManager.getPlayerVehicle('p2');
            gm.handleVehicleDestroyed(victimVehicle, { ownerId: 'p1' });

            assert.equal(emitted.length, 1);
            assert.equal(emitted[0].playerId, 'p2');
            assert.equal(emitted[0].playerName, 'NPC1');
            assert.equal(emitted[0].killedBy, 'p1');
            assert.equal(emitted[0].killerName, 'PilotA');
        } finally {
            gm.stopGameLoop();
            for (const timer of gm.respawnTimers.values()) {
                clearTimeout(timer);
            }
            gm.respawnTimers.clear();
            gm.performanceMonitor?.stopMonitoring?.();
        }
    });

    it('emits killerName as null when destroyed without attacker', () => {
        const config = loadGameConfig();
        const eventEmitter = new EventEmitter();
        const gm = new GameManager(config, eventEmitter);

        try {
            gm.addPlayer('p1', 'PilotA', 'fighter');

            const emitted = [];
            eventEmitter.on('vehicleDestroyed', (payload) => emitted.push(payload));

            const victimVehicle = gm.vehicleManager.getPlayerVehicle('p1');
            gm.handleVehicleDestroyed(victimVehicle, {});

            assert.equal(emitted.length, 1);
            assert.equal(emitted[0].playerName, 'PilotA');
            assert.equal(emitted[0].killedBy, null);
            assert.equal(emitted[0].killerName, null);
        } finally {
            gm.stopGameLoop();
            for (const timer of gm.respawnTimers.values()) {
                clearTimeout(timer);
            }
            gm.respawnTimers.clear();
            gm.performanceMonitor?.stopMonitoring?.();
        }
    });
});
