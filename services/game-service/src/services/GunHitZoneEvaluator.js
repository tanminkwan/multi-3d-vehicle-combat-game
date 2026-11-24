import * as THREE from 'three';

/**
 * 기관총 직선 탄도 기반 명중 가능 타겟 판별 전담 클래스 (SRP / OCP)
 * MachineGun의 총구 위치, 발사 방향, 사거리(bulletRange), 충돌 반경(hitRadius)을 기준으로
 * 지금 발사 시 명중 가능한 가장 가까운 적 비행체를 찾는다.
 */
export class GunHitZoneEvaluator {
    constructor(config = {}) {
        const indicatorCfg = config.targeting?.gunHitIndicator || {};
        this.enabled = indicatorCfg.enabled !== false;
        this.muzzleOffset = indicatorCfg.muzzleOffset ?? 8;
        this.hitRadius = indicatorCfg.hitRadius ?? 5.5;
        this.defaultRange = indicatorCfg.defaultRange ?? 300;
        this.vehiclesConfig = config.vehicles || {};
    }

    /**
     * 비행체 타입별 기관총 사거리 반환
     */
    getRangeForVehicle(vehicleType) {
        return this.vehiclesConfig?.[vehicleType]?.bulletRange ?? this.defaultRange;
    }

    /**
     * 지금 기관총을 발사하면 맞출 수 있는 가장 가까운 적 비행체 반환
     * @param {object} shooterVehicle
     * @param {Array<object>} enemies
     * @param {((from: object, to: object, enemies: Array<object>) => boolean) | null} [hasObstacleFn]
     * @returns {object | null}
     */
    findGunTarget(shooterVehicle, enemies = [], hasObstacleFn = null) {
        if (!this.enabled || !shooterVehicle || !shooterVehicle.active) {
            return null;
        }

        const rotX = shooterVehicle.rotation?.x || 0;
        const rotY = shooterVehicle.rotation?.y || 0;

        // MachineGun.js와 동일한 정면 발사 방향 벡터
        const forward = new THREE.Vector3(
            Math.sin(rotY) * Math.cos(rotX),
            -Math.sin(rotX),
            Math.cos(rotY) * Math.cos(rotX)
        ).normalize();

        const muzzlePos = new THREE.Vector3()
            .copy(shooterVehicle.position)
            .addScaledVector(forward, this.muzzleOffset);

        const maxRange = this.getRangeForVehicle(shooterVehicle.vehicleType);
        const hitRadiusSq = this.hitRadius * this.hitRadius;

        let bestTarget = null;
        let bestProjection = Infinity;

        for (const enemy of enemies) {
            if (!enemy || !enemy.active || enemy.id === shooterVehicle.id) continue;

            const toEnemy = new THREE.Vector3().subVectors(enemy.position, muzzlePos);
            const projection = toEnemy.dot(forward);

            // 등 뒤이거나 사거리 밖이면 제외
            if (projection < 0 || projection > maxRange) continue;

            // 발사 직선에서 적 중심까지의 수직 거리 제곱
            const closestPointOnRay = new THREE.Vector3().copy(forward).multiplyScalar(projection);
            const perpDistSq = toEnemy.sub(closestPointOnRay).lengthSq();

            if (perpDistSq > hitRadiusSq) continue;

            if (hasObstacleFn && hasObstacleFn(shooterVehicle, enemy, enemies)) {
                continue;
            }

            if (projection < bestProjection) {
                bestProjection = projection;
                bestTarget = enemy;
            }
        }

        return bestTarget;
    }
}
