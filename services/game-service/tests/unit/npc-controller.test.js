import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { NpcController } from '../../src/ai/NpcController.js';

const WORLD_CONFIG = {
    size: 400,
    maxHeight: 200,
    boundaryBuffer: 10,
    waterLevel: -5
};

const EASY_PROFILE = {
    reactionTimeMs: 650,
    decisionIntervalMs: 100,
    aimErrorDeg: 12.0,
    leadTargetFactor: 0.0,
    turnRateScale: 0.55,
    throttleScale: 0.6,
    detectionRange: 250,
    fireRange: 200,
    fireAngleDeg: 18,
    fireBurstMs: 500,
    fireRestMs: 800,
    missileUseChance: 1.0,
    missileReactionMs: 1000,
    evasionChance: 1.0,
    evasionHealthRatio: 0.3
};

const HARD_PROFILE = {
    reactionTimeMs: 100,
    decisionIntervalMs: 50,
    aimErrorDeg: 0.0,
    leadTargetFactor: 0.85,
    turnRateScale: 1.0,
    throttleScale: 1.0,
    detectionRange: 360,
    fireRange: 280,
    fireAngleDeg: 10,
    fireBurstMs: 1200,
    fireRestMs: 150,
    missileUseChance: 1.0,
    missileReactionMs: 150,
    evasionChance: 1.0,
    evasionHealthRatio: 0.6
};

function makeVehicle({ id = 'v1', playerId = 'npc_1', pos = [0, 100, 0], rot = [0, 0, 0], vel = [0, 0, 0], health = 80, maxHealth = 80, active = true } = {}) {
    return {
        id,
        playerId,
        position: new THREE.Vector3(...pos),
        rotation: { x: rot[0], y: rot[1], z: rot[2] },
        velocity: new THREE.Vector3(...vel),
        health,
        maxHealth,
        active
    };
}

function makeTerrain(fixedHeight = 0) {
    return { getTerrainHeight: () => fixedHeight };
}

describe('NpcController', () => {
    it('steers pitch UP (negative pitch input in YXZ Euler) when target is above and DOWN when below', () => {
        let now = 1000;
        const ctrl = new NpcController('npc_1', 'hard', HARD_PROFILE, WORLD_CONFIG, {
            now: () => now,
            random: () => 0.5
        });

        const selfVehicle = makeVehicle({ id: 'v_self', playerId: 'npc_1', pos: [0, 80, 0], rot: [0, 0, 0] });
        const highEnemy = makeVehicle({ id: 'v_enemy', playerId: 'p_human', pos: [0, 140, 80] });

        const inputsUp = ctrl.update(0.016, {
            selfPlayer: { id: 'npc_1', lockOnState: { isLocked: false } },
            selfVehicle,
            allVehicles: [selfVehicle, highEnemy],
            billboards: new Map(),
            terrainManager: makeTerrain(0),
            now
        });

        assert.ok(inputsUp.pitch < 0, `Expected negative pitch to climb toward higher target, got ${inputsUp.pitch}`);

        now += 200;
        const lowEnemy = makeVehicle({ id: 'v_enemy', playerId: 'p_human', pos: [0, 30, 80] });
        const inputsDown = ctrl.update(0.016, {
            selfPlayer: { id: 'npc_1', lockOnState: { isLocked: false } },
            selfVehicle,
            allVehicles: [selfVehicle, lowEnemy],
            billboards: new Map(),
            terrainManager: makeTerrain(0),
            now
        });

        assert.ok(inputsDown.pitch > 0, `Expected positive pitch to dive toward lower target, got ${inputsDown.pitch}`);
    });

    it('respects reactionTimeMs before firing on newly acquired target (Easy vs Hard)', () => {
        let now = 1000;
        const easyCtrl = new NpcController('npc_easy', 'easy', EASY_PROFILE, WORLD_CONFIG, {
            now: () => now,
            random: () => 0.5
        });
        const hardCtrl = new NpcController('npc_hard', 'hard', HARD_PROFILE, WORLD_CONFIG, {
            now: () => now,
            random: () => 0.5
        });

        const selfEasy = makeVehicle({ id: 'v_easy', playerId: 'npc_easy', pos: [0, 100, 0], rot: [0, 0, 0] });
        const selfHard = makeVehicle({ id: 'v_hard', playerId: 'npc_hard', pos: [0, 100, 0], rot: [0, 0, 0] });
        const enemy = makeVehicle({ id: 'v_enemy', playerId: 'p_1', pos: [0, 100, 100] });

        const ctxEasy = () => ({
            selfPlayer: { id: 'npc_easy', lockOnState: { isLocked: false } },
            selfVehicle: selfEasy,
            allVehicles: [selfEasy, enemy],
            billboards: new Map(),
            terrainManager: makeTerrain(0),
            now
        });
        const ctxHard = () => ({
            selfPlayer: { id: 'npc_hard', lockOnState: { isLocked: false } },
            selfVehicle: selfHard,
            allVehicles: [selfHard, enemy],
            billboards: new Map(),
            terrainManager: makeTerrain(0),
            now
        });

        // t=1000: target acquired -> neither fires immediately
        assert.equal(easyCtrl.update(0.016, ctxEasy()).fire, false);
        assert.equal(hardCtrl.update(0.016, ctxHard()).fire, false);

        // t=1150 (+150ms): Hard (>100ms) fires, Easy (<650ms) still waiting
        now = 1150;
        assert.equal(hardCtrl.update(0.016, ctxHard()).fire, true);
        assert.equal(easyCtrl.update(0.016, ctxEasy()).fire, false);

        // t=1700 (+700ms): Easy (>650ms) now fires
        now = 1700;
        assert.equal(easyCtrl.update(0.016, ctxEasy()).fire, true);
    });

    it('delays transition into EVADE by reactionTimeMs after being hit', () => {
        let now = 2000;
        const ctrl = new NpcController('npc_1', 'easy', EASY_PROFILE, WORLD_CONFIG, {
            now: () => now,
            random: () => 0.1
        });
        const selfVehicle = makeVehicle({ id: 'v_self', playerId: 'npc_1', pos: [0, 100, 0] });
        const enemy = makeVehicle({ id: 'v_enemy', playerId: 'p_1', pos: [0, 100, 120] });

        const makeCtx = () => ({
            selfPlayer: { id: 'npc_1', lockOnState: { isLocked: false } },
            selfVehicle,
            allVehicles: [selfVehicle, enemy],
            billboards: new Map(),
            terrainManager: makeTerrain(0),
            now
        });

        ctrl.update(0.016, makeCtx());
        ctrl.onHit('p_1', now);

        // Before 650ms reaction time -> not yet EVADE
        now = 2400;
        ctrl.update(0.016, makeCtx());
        assert.notEqual(ctrl.state, 'EVADE');

        // After 650ms reaction time -> transitions to EVADE
        now = 2700;
        ctrl.update(0.016, makeCtx());
        assert.equal(ctrl.state, 'EVADE');
    });

    it('fires missile after missileReactionMs once lock-on is acquired', () => {
        let now = 3000;
        const ctrl = new NpcController('npc_1', 'hard', HARD_PROFILE, WORLD_CONFIG, {
            now: () => now,
            random: () => 0.2
        });
        const selfVehicle = makeVehicle({ id: 'v_self', playerId: 'npc_1', pos: [0, 100, 0], rot: [0, 0, 0] });
        const enemy = makeVehicle({ id: 'v_enemy', playerId: 'p_1', pos: [0, 100, 120] });

        const makeCtx = () => ({
            selfPlayer: { id: 'npc_1', lockOnTargetId: 'v_enemy', lockOnState: { isLocked: true, progress: 1 } },
            selfVehicle,
            allVehicles: [selfVehicle, enemy],
            billboards: new Map(),
            terrainManager: makeTerrain(0),
            now
        });

        // Initial lock detection: not fired immediately
        assert.equal(ctrl.update(0.016, makeCtx()).fireMissile, false);

        // After 200ms (> missileReactionMs 150ms): fires missile
        now = 3200;
        assert.equal(ctrl.update(0.016, makeCtx()).fireMissile, true);
    });

    it('overrides into AVOID_OBSTACLE when near terrain, map boundary, or active billboard', () => {
        let now = 4000;
        const ctrl = new NpcController('npc_1', 'normal', HARD_PROFILE, WORLD_CONFIG, {
            now: () => now,
            random: () => 0.5
        });

        // 1. Low altitude over terrain
        const lowVehicle = makeVehicle({ id: 'v1', playerId: 'npc_1', pos: [0, 10, 0], rot: [0, 0, 0] });
        const lowInputs = ctrl.update(0.016, {
            selfPlayer: { id: 'npc_1', lockOnState: { isLocked: false } },
            selfVehicle: lowVehicle,
            allVehicles: [lowVehicle],
            billboards: new Map(),
            terrainManager: makeTerrain(5),
            now
        });
        assert.equal(ctrl.state, 'AVOID_OBSTACLE');
        assert.equal(lowInputs.vertical, 1);
        assert.ok(lowInputs.pitch < 0);

        // 2. Near map boundary (+X edge)
        now += 100;
        const edgeVehicle = makeVehicle({ id: 'v1', playerId: 'npc_1', pos: [185, 100, 0], rot: [0, Math.PI / 2, 0] });
        const edgeInputs = ctrl.update(0.016, {
            selfPlayer: { id: 'npc_1', lockOnState: { isLocked: false } },
            selfVehicle: edgeVehicle,
            allVehicles: [edgeVehicle],
            billboards: new Map(),
            terrainManager: makeTerrain(0),
            now
        });
        assert.equal(ctrl.state, 'AVOID_OBSTACLE');
        assert.ok(edgeInputs.thrust > 0);

        // 3. Near billboard
        now += 100;
        const bbVehicle = makeVehicle({ id: 'v1', playerId: 'npc_1', pos: [0, 100, 0], rot: [0, 0, 0] });
        const billboards = new Map([
            ['bb1', { id: 'bb1', active: true, width: 40, height: 20, position: { x: 0, y: 100, z: 20 } }]
        ]);
        ctrl.update(0.016, {
            selfPlayer: { id: 'npc_1', lockOnState: { isLocked: false } },
            selfVehicle: bbVehicle,
            allVehicles: [bbVehicle],
            billboards,
            terrainManager: makeTerrain(0),
            now
        });
        assert.equal(ctrl.state, 'AVOID_OBSTACLE');
    });

    it('returns neutral inputs and DEAD state when vehicle is inactive, and supports setProfile()', () => {
        const ctrl = new NpcController('npc_1', 'easy', EASY_PROFILE, WORLD_CONFIG);
        const deadVehicle = makeVehicle({ id: 'v1', playerId: 'npc_1', active: false });

        const inputs = ctrl.update(0.016, {
            selfPlayer: { id: 'npc_1', lockOnState: { isLocked: false } },
            selfVehicle: deadVehicle,
            allVehicles: [deadVehicle],
            billboards: new Map(),
            terrainManager: makeTerrain(0),
            now: 5000
        });

        assert.equal(ctrl.state, 'DEAD');
        assert.equal(inputs.thrust, 0);
        assert.equal(inputs.fire, false);
        assert.equal(inputs.fireMissile, false);

        ctrl.setProfile('hard', HARD_PROFILE);
        assert.equal(ctrl.difficulty, 'hard');
        assert.equal(ctrl.profile.reactionTimeMs, 100);
    });
});
