import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GunHitZoneEvaluator } from '../../src/services/GunHitZoneEvaluator.js';
import { TargetingManager } from '../../src/services/TargetingManager.js';

const baseConfig = {
    targeting: {
        maxDistance: 200,
        lockOnTime: 2,
        gunHitIndicator: {
            enabled: true,
            muzzleOffset: 8,
            hitRadius: 5.5,
            giftBoxHitRadius: 5.5,
            defaultRange: 300
        }
    },
    weapons: {
        missile: { maxRange: 200 }
    },
    vehicles: {
        fighter: { bulletRange: 300 }
    },
    server: { tickRate: 60 }
};

describe('Gift Box Gun Hit-Zone Indicator (Server)', () => {
    it('detects active gift box in machine-gun line of fire and ignores off-axis, behind, out-of-range, or inactive boxes', () => {
        const evaluator = new GunHitZoneEvaluator(baseConfig);
        const shooter = {
            id: 'v-shooter',
            vehicleType: 'fighter',
            active: true,
            position: { x: 0, y: 100, z: 0 },
            rotation: { x: 0, y: 0, z: 0 } // +Z forward
        };

        const boxes = [
            { id: 'gb-inactive', active: false, position: { x: 0, y: 100, z: 40 } },
            { id: 'gb-behind', active: true, position: { x: 0, y: 100, z: -40 } },
            { id: 'gb-offaxis', active: true, position: { x: 20, y: 100, z: 80 } },
            { id: 'gb-far', active: true, position: { x: 0, y: 100, z: 350 } },
            { id: 'gb-hit', active: true, position: { x: 2, y: 100, z: 120 } }
        ];

        const hit = evaluator.findGunGiftBoxTarget(shooter, boxes);
        assert.equal(hit?.id, 'gb-hit');
    });

    it('sets player.gunGiftBoxTargetId without setting awarenessTargetId or lockOnTargetId for gift boxes', () => {
        const tm = new TargetingManager(baseConfig, () => 0);
        const player = {
            id: 'p1',
            awarenessTargetId: null,
            lockOnTargetId: null,
            gunTargetId: null,
            gunGiftBoxTargetId: null,
            lockOnState: { isLocked: false, progress: 0 }
        };
        const vehicle = {
            id: 'v1',
            playerId: 'p1',
            vehicleType: 'fighter',
            active: true,
            position: { x: 0, y: 100, z: 0 },
            rotation: { x: 0, y: 0, z: 0 }
        };
        const giftBoxes = [
            { id: 'gb-1', active: true, position: { x: 0, y: 100, z: 90 } }
        ];

        tm.update(player, vehicle, [], 0.016, giftBoxes);

        assert.equal(player.gunGiftBoxTargetId, 'gb-1');
        assert.equal(player.awarenessTargetId, null);
        assert.equal(player.lockOnTargetId, null);
        assert.equal(player.gunTargetId, null);

        // 비활성 차량일 때 초기화 확인
        vehicle.active = false;
        tm.update(player, vehicle, [], 0.016, giftBoxes);
        assert.equal(player.gunGiftBoxTargetId, null);
    });
});
