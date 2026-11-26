import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { FirstPersonViewPolicy } from '../../../../client/js/camera/FirstPersonViewPolicy.js';

const defaultConfig = {
    camera: {
        firstPerson: {
            hideOwnVehicle: true,
            usePointerLock: false
        }
    },
    client: {
        mouseFlight: {
            enabled: true,
            allowInFirstPerson: true
        }
    }
};

describe('FirstPersonViewPolicy', () => {
    it('hides own vehicle in first-person view even when server reports visible or invulnerable blink', () => {
        const policy = new FirstPersonViewPolicy(defaultConfig);

        assert.equal(
            policy.resolveVehicleVisibility({
                isOwnVehicle: true,
                isFirstPerson: true,
                serverVisible: true,
                isInvulnerable: false,
                blinkVisible: true
            }),
            false
        );

        assert.equal(
            policy.resolveVehicleVisibility({
                isOwnVehicle: true,
                isFirstPerson: true,
                serverVisible: true,
                isInvulnerable: true,
                blinkVisible: true
            }),
            false
        );
    });

    it('keeps other players and NPC vehicles visible in first-person view and restores own vehicle in third-person view', () => {
        const policy = new FirstPersonViewPolicy(defaultConfig);

        // Other vehicle in first-person view
        assert.equal(
            policy.resolveVehicleVisibility({
                isOwnVehicle: false,
                isFirstPerson: true,
                serverVisible: true
            }),
            true
        );

        // Own vehicle restored in third-person view
        assert.equal(
            policy.resolveVehicleVisibility({
                isOwnVehicle: true,
                isFirstPerson: false,
                serverVisible: true
            }),
            true
        );

        // Destroyed/hidden vehicle remains hidden in third-person view
        assert.equal(
            policy.resolveVehicleVisibility({
                isOwnVehicle: true,
                isFirstPerson: false,
                serverVisible: false
            }),
            false
        );

        // Invulnerable vehicle blinks in third-person view
        assert.equal(
            policy.resolveVehicleVisibility({
                isOwnVehicle: true,
                isFirstPerson: false,
                serverVisible: true,
                isInvulnerable: true,
                blinkVisible: false
            }),
            false
        );
    });

    it('allows mouse flight and disables pointer lock in first-person view according to config', () => {
        const policy = new FirstPersonViewPolicy(defaultConfig);

        assert.equal(policy.shouldHideOwnVehicle(), true);
        assert.equal(policy.shouldUsePointerLock(), false);
        assert.equal(policy.canUseMouseFlight(false), true);
        assert.equal(policy.canUseMouseFlight(true), true);
        assert.equal(policy.shouldClearWaypointOnViewToggle(true), false);
    });

    it('respects config overrides when first-person mouse flight is disabled or pointer lock is enabled', () => {
        const restrictedPolicy = new FirstPersonViewPolicy({
            camera: {
                firstPerson: {
                    hideOwnVehicle: false,
                    usePointerLock: true
                }
            },
            client: {
                mouseFlight: {
                    enabled: true,
                    allowInFirstPerson: false
                }
            }
        });

        assert.equal(restrictedPolicy.shouldHideOwnVehicle(), false);
        assert.equal(restrictedPolicy.shouldUsePointerLock(), true);
        assert.equal(restrictedPolicy.canUseMouseFlight(false), true);
        assert.equal(restrictedPolicy.canUseMouseFlight(true), false);
        assert.equal(restrictedPolicy.shouldClearWaypointOnViewToggle(true), true);
        assert.equal(
            restrictedPolicy.resolveVehicleVisibility({
                isOwnVehicle: true,
                isFirstPerson: true,
                serverVisible: true
            }),
            true
        );
    });
});
