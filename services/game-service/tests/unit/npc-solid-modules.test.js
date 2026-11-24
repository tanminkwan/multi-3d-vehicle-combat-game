import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
    NpcSpawnStrategy,
    FillSpawnStrategy,
    FixedSpawnStrategy,
    createDefaultSpawnStrategies
} from '../../src/services/npc/NpcSpawnStrategy.js';
import { NpcConfigManager } from '../../src/services/npc/NpcConfigManager.js';
import { NpcEvictionPolicy } from '../../src/services/npc/NpcEvictionPolicy.js';
import { FlightSteering } from '../../src/ai/FlightSteering.js';
import { ObstacleAvoidance } from '../../src/ai/ObstacleAvoidance.js';
import { NpcManager } from '../../src/services/NpcManager.js';

describe('SOLID Module Unit Tests', () => {
    describe('NpcSpawnStrategy (OCP & LSP)', () => {
        it('FillSpawnStrategy and FixedSpawnStrategy satisfy NpcSpawnStrategy contract interchangeably', () => {
            const strategies = [new FillSpawnStrategy(), new FixedSpawnStrategy()];
            const cfg = { fixedCount: 3, prioritizeHumans: true };

            for (const strategy of strategies) {
                assert.ok(strategy instanceof NpcSpawnStrategy);
                const count = strategy.calculateTargetCount(2, 8, cfg);
                assert.equal(typeof count, 'number');
                assert.ok(count >= 0 && count <= 8);
                assert.equal(typeof strategy.canEvictForHuman(cfg), 'boolean');
            }

            assert.equal(new FillSpawnStrategy().calculateTargetCount(2, 8, cfg), 6);
            assert.equal(new FixedSpawnStrategy().calculateTargetCount(2, 8, cfg), 3);
            assert.equal(new FixedSpawnStrategy().calculateTargetCount(6, 8, cfg), 2);
            assert.equal(new FixedSpawnStrategy().calculateTargetCount(6, 8, { fixedCount: 3, prioritizeHumans: false }), 3);
        });

        it('supports registering a custom strategy without modifying NpcManager (OCP)', () => {
            class DoubleHumanStrategy extends NpcSpawnStrategy {
                calculateTargetCount(humanCount, maxPlayers) {
                    return Math.min(humanCount * 2, Math.max(0, maxPlayers - humanCount));
                }
                canEvictForHuman() {
                    return true;
                }
            }

            const strategies = createDefaultSpawnStrategies();
            strategies.set('double', new DoubleHumanStrategy());
            assert.equal(strategies.get('double').calculateTargetCount(2, 8, {}), 4);
        });
    });

    describe('NpcConfigManager (SRP & OCP)', () => {
        it('validates patches and supports custom difficulty presets defined in YAML', () => {
            const cfgMgr = new NpcConfigManager({
                game: { maxPlayers: 8 },
                npc: {
                    mode: 'fill',
                    defaultDifficulty: 'ace',
                    difficulties: {
                        ace: { reactionTimeMs: 40, aimErrorDeg: 0.5 }
                    }
                }
            }, ['fill', 'fixed']);

            assert.equal(cfgMgr.getConfig().defaultDifficulty, 'ace');
            assert.equal(cfgMgr.getDifficultyProfile('ace').reactionTimeMs, 40);

            const bad = cfgMgr.applyPatch({ mode: 'unknown', fixedCount: -1 });
            assert.equal(bad.success, false);
            assert.ok(bad.errors.length >= 2);
        });
    });

    describe('NpcEvictionPolicy (SRP)', () => {
        it('selects inactive NPC first, then non-engaged, then oldest', () => {
            const policy = new NpcEvictionPolicy();
            const controllers = new Map([
                ['npc1', { createdAt: 100, controller: { lastHitAt: 9500 } }], // recently engaged
                ['npc2', { createdAt: 200, controller: { lastHitAt: 0 } }],    // non-engaged
                ['npc3', { createdAt: 300, controller: { lastHitAt: 9800 } }]  // inactive vehicle
            ]);
            const vehicles = {
                npc1: { active: true },
                npc2: { active: true },
                npc3: { active: false }
            };

            const victim1 = policy.selectVictim(controllers, id => vehicles[id], 10000);
            assert.equal(victim1, 'npc3');

            vehicles.npc3.active = true;
            const victim2 = policy.selectVictim(controllers, id => vehicles[id], 10000);
            assert.equal(victim2, 'npc2');
        });
    });

    describe('FlightSteering & ObstacleAvoidance (SRP)', () => {
        it('FlightSteering computes correct YXZ pitch/yaw and target angle', () => {
            const steering = new FlightSteering();
            const vehicle = {
                position: new THREE.Vector3(0, 80, 0),
                rotation: { x: 0, y: 0, z: 0 }
            };
            const inputsUp = steering.steerTowards(vehicle, new THREE.Vector3(0, 120, 60), 1.0, 1.0);
            assert.ok(inputsUp.pitch < 0);
            assert.equal(Math.round(steering.getAngleToPointDeg(vehicle, new THREE.Vector3(0, 80, 100))), 0);
        });

        it('ObstacleAvoidance detects low terrain and returns safe climb point', () => {
            const steering = new FlightSteering();
            const avoidance = new ObstacleAvoidance({ size: 400, maxHeight: 200, boundaryBuffer: 10 }, steering);
            const lowVehicle = {
                position: new THREE.Vector3(0, 12, 0),
                rotation: { x: 0, y: 0, z: 0 }
            };
            const inputs = avoidance.computeAvoidanceInput(lowVehicle, new Map(), { getTerrainHeight: () => 5 }, 0.8);
            assert.ok(inputs);
            assert.equal(inputs.vertical, 1);
            assert.ok(inputs.pitch < 0);
        });
    });

    describe('NpcManager with injected DIP ports (ISP & DIP isolation)', () => {
        it('operates completely without GameManager using minimal port mocks', () => {
            const players = new Map([['h1', { id: 'h1', name: 'Human', isNpc: false }]]);
            const receivedInputs = [];

            const mockWorldPort = {
                getTotalPlayerCount: () => players.size,
                getHumanCount: () => Array.from(players.values()).filter(p => !p.isNpc).length,
                getNpcCount: () => Array.from(players.values()).filter(p => p.isNpc).length,
                getPlayer: (id) => players.get(id),
                getPlayerVehicle: (id) => ({ id: `v_${id}`, playerId: id, active: true, position: new THREE.Vector3(0, 100, 0), rotation: { x: 0, y: 0, z: 0 } }),
                getAllVehicles: () => Array.from(players.keys()).map(id => ({ id: `v_${id}`, playerId: id, active: true })),
                getBillboards: () => new Map(),
                getTerrainManager: () => ({ getTerrainHeight: () => 0 }),
                addNpcPlayer: (id, name, vehicleType, difficulty) => {
                    players.set(id, { id, name, vehicleType, difficulty, isNpc: true });
                    return { success: true };
                },
                removeNpcPlayer: (id) => {
                    players.delete(id);
                    return true;
                },
                handleNpcInput: (id, inputs) => {
                    receivedInputs.push({ id, inputs });
                },
                syncGameState: () => {}
            };

            const mockControllerFactory = (npcId, difficulty, profile) => ({
                npcId,
                difficulty,
                profile,
                state: 'PATROL',
                lastHitAt: 0,
                setProfile(d, p) { this.difficulty = d; this.profile = p; },
                onHit() {},
                update() { return { thrust: 1, pitch: 0, yaw: 0, roll: 0, vertical: 0, fire: false, fireMissile: false }; }
            });

            const manager = new NpcManager(
                { game: { maxPlayers: 4 }, world: { size: 400 }, npc: { enabled: true, mode: 'fill' } },
                mockWorldPort,
                { controllerFactory: mockControllerFactory }
            );

            manager.reconcile();
            assert.equal(mockWorldPort.getNpcCount(), 3);

            manager.update(0.016, 1000);
            assert.equal(receivedInputs.length, 3);
        });
    });
});
