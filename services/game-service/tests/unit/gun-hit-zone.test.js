import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GunHitZoneEvaluator } from '../../src/services/GunHitZoneEvaluator.js';
import { TargetingManager } from '../../src/services/TargetingManager.js';

const BASE_CONFIG = {
    vehicles: {
        fighter: { bulletRange: 300 },
        heavy: { bulletRange: 350 }
    },
    weapons: {
        missile: { maxRange: 300, missileLockAngle: 15 }
    },
    targeting: {
        maxDistance: 200,
        lockOnTime: 2,
        lockLostCooldown: 1000,
        lockOnAngleBuffer: 2,
        lockOnDistanceGraceFactor: 1.1,
        angleBrackets: [[50, 8], [100, 12], [150, 18], [200, 25]],
        gunHitIndicator: {
            enabled: true,
            muzzleOffset: 8,
            hitRadius: 5.5,
            defaultRange: 300
        }
    }
};

function makeVehicle(id, playerId, pos, rot = [0, 0, 0], vehicleType = 'fighter', active = true) {
    return {
        id,
        playerId,
        vehicleType,
        active,
        position: new THREE.Vector3(...pos),
        rotation: { x: rot[0], y: rot[1], z: rot[2] },
        mesh: new THREE.Mesh(new THREE.BoxGeometry(10, 5, 15))
    };
}

describe('GunHitZoneEvaluator & TargetingManager gunTargetId', () => {
    it('detects enemy directly in machine-gun line of fire within bulletRange', () => {
        const evaluator = new GunHitZoneEvaluator(BASE_CONFIG);
        const shooter = makeVehicle('v_me', 'p_me', [0, 100, 0], [0, 0, 0], 'fighter');
        const enemyInLine = makeVehicle('v_e1', 'p_e1', [2, 100, 150]); // perpDist=2 <= 5.5, t=142 <= 300
        const enemyFarther = makeVehicle('v_e2', 'p_e2', [0, 100, 220]);

        const hit = evaluator.findGunTarget(shooter, [enemyFarther, enemyInLine]);
        assert.equal(hit?.id, 'v_e1');
    });

    it('returns null when enemy is off-axis (perpDist > hitRadius), out of range, behind, or occluded', () => {
        const evaluator = new GunHitZoneEvaluator(BASE_CONFIG);
        const shooter = makeVehicle('v_me', 'p_me', [0, 100, 0], [0, 0, 0], 'fighter');

        const offAxis = makeVehicle('v_off', 'p_off', [15, 100, 100]); // perpDist=15 > 5.5
        const outOfRange = makeVehicle('v_far', 'p_far', [0, 100, 340]); // t=332 > 300
        const behind = makeVehicle('v_back', 'p_back', [0, 100, -50]); // t < 0

        assert.equal(evaluator.findGunTarget(shooter, [offAxis, outOfRange, behind]), null);

        // Occluded by obstacle callback
        const inLine = makeVehicle('v_in', 'p_in', [0, 100, 100]);
        assert.equal(evaluator.findGunTarget(shooter, [inLine], () => true), null);
    });

    it('updates player.gunTargetId via TargetingManager.update() and clears on inactive vehicle', () => {
        const tm = new TargetingManager(BASE_CONFIG, () => 0);
        const player = {
            id: 'p_me',
            awarenessTargetId: null,
            lockOnTargetId: null,
            gunTargetId: null,
            lockOnState: { isLocked: false, progress: 0 }
        };
        const me = makeVehicle('v_me', 'p_me', [0, 100, 0], [0, 0, 0]);
        const enemyInLine = makeVehicle('v_e1', 'p_e1', [0, 100, 120]);
        const enemySide = makeVehicle('v_e2', 'p_e2', [40, 100, 40]);

        tm.update(player, me, [enemySide, enemyInLine], 0.016);
        assert.equal(player.gunTargetId, 'v_e1');

        // Off-axis only -> awarenessTargetId exists, but gunTargetId is null
        tm.update(player, me, [enemySide], 0.016);
        assert.equal(player.awarenessTargetId, 'v_e2');
        assert.equal(player.gunTargetId, null);

        // Inactive vehicle clears gunTargetId
        me.active = false;
        tm.update(player, me, [enemyInLine], 0.016);
        assert.equal(player.gunTargetId, null);
    });
});
