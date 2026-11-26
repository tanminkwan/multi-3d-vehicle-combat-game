import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { MouseFlightController } from '../../../../client/js/input/MouseFlightController.js';

const baseConfig = {
    world: {
        size: 400,
        maxHeight: 200,
        boundaryBuffer: 10
    },
    client: {
        mouseFlight: {
            enabled: true,
            moveMouseButton: 2,
            defaultTargetDistance: 120,
            minTargetDistance: 25,
            maxTargetDistance: 220,
            arrivalRadius: 12,
            minTerrainClearance: 18,
            autoThrottle: 0.85,
            steerDeadzoneRad: 0.04,
            maxBankAngleRad: 0.45,
            waypointMarkerEnabled: true
        }
    }
};

describe('MouseFlightController (Client Click-to-Fly Steering)', () => {
    it('clamps target waypoint inside map bounds and above terrain safety clearance', () => {
        const ctrl = new MouseFlightController(baseConfig);
        const target = ctrl.setTarget({ x: 500, y: -10, z: -500 }, 20);

        assert.equal(ctrl.hasTarget(), true);
        assert.equal(target.x, 190);  // 400/2 - 10
        assert.equal(target.z, -190); // -(400/2 - 10)
        assert.equal(target.y, 38);   // terrain(20) + clearance(18)

        const highTarget = ctrl.setTarget({ x: 0, y: 999, z: 0 }, 0);
        assert.equal(highTarget.y, 190); // maxHeight(200) - buffer(10)
    });

    it('computes accurate YXZ (+Z forward) yaw, pitch, and thrust toward target', () => {
        const ctrl = new MouseFlightController(baseConfig);
        const pos = { x: 0, y: 100, z: 0 };
        const rot = { x: 0, y: 0, z: 0 }; // facing +Z

        // Target to the LEFT (+X) and UP (+Y)
        ctrl.setTarget({ x: 80, y: 140, z: 80 }, 0);
        const steerLeftUp = ctrl.computeSteering(pos, rot);
        assert.ok(steerLeftUp.active);
        assert.ok(steerLeftUp.yaw > 0, `expected positive yaw (turn left toward +X), got ${steerLeftUp.yaw}`);
        assert.ok(steerLeftUp.pitch < 0, `expected negative pitch (nose up toward +Y), got ${steerLeftUp.pitch}`);
        assert.ok(steerLeftUp.thrust > 0, `expected positive thrust, got ${steerLeftUp.thrust}`);

        // Target to the RIGHT (-X) and DOWN (-Y)
        ctrl.setTarget({ x: -80, y: 60, z: 80 }, 0);
        const steerRightDown = ctrl.computeSteering(pos, rot);
        assert.ok(steerRightDown.yaw < 0, `expected negative yaw (turn right toward -X), got ${steerRightDown.yaw}`);
        assert.ok(steerRightDown.pitch > 0, `expected positive pitch (nose down toward -Y), got ${steerRightDown.pitch}`);
    });

    it('clears waypoint automatically upon entering arrivalRadius', () => {
        const ctrl = new MouseFlightController(baseConfig);
        ctrl.setTarget({ x: 0, y: 100, z: 10 }, 0);

        const res = ctrl.computeSteering({ x: 0, y: 100, z: 0 }, { x: 0, y: 0, z: 0 });
        assert.equal(res.active, false);
        assert.equal(res.arrived, true);
        assert.equal(ctrl.hasTarget(), false);
    });

    it('acts as a no-op when mouseFlight.enabled is false', () => {
        const disabledConfig = {
            ...baseConfig,
            client: { mouseFlight: { ...baseConfig.client.mouseFlight, enabled: false } }
        };
        const ctrl = new MouseFlightController(disabledConfig);
        assert.equal(ctrl.isEnabled(), false);
        assert.equal(ctrl.setTarget({ x: 10, y: 100, z: 50 }, 0), null);
        assert.equal(ctrl.hasTarget(), false);
    });
});
