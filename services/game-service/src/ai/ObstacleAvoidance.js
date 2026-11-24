import * as THREE from 'three';

/**
 * 지형·맵 경계·광고판 안전 회피 감지 전담 클래스 (SRP / OCP)
 * 추가 장애물 감지기를 registerDetector()로 확장할 수 있다.
 */
export class ObstacleAvoidance {
    constructor(worldConfig = {}, steering) {
        this.worldConfig = {
            size: worldConfig.size ?? 400,
            maxHeight: worldConfig.maxHeight ?? 200,
            boundaryBuffer: worldConfig.boundaryBuffer ?? 10,
            waterLevel: worldConfig.waterLevel ?? -5
        };
        this.steering = steering;
        this.customDetectors = [];
    }

    /**
     * 신규 장애물 감지기 등록 (OCP)
     * @param {(selfVehicle, context, steering) => object | null} detector
     */
    registerDetector(detector) {
        if (typeof detector === 'function') {
            this.customDetectors.push(detector);
        }
    }

    /**
     * 위험 근접 시 회피 입력 반환, 안전하면 null 반환
     */
    computeAvoidanceInput(selfVehicle, billboards, terrainManager, defaultThrottle = 0.8) {
        const terrainInput = this.checkTerrain(selfVehicle, terrainManager);
        if (terrainInput) return terrainInput;

        const boundaryInput = this.checkMapBoundary(selfVehicle, defaultThrottle);
        if (boundaryInput) return boundaryInput;

        const billboardInput = this.checkBillboards(selfVehicle, billboards);
        if (billboardInput) return billboardInput;

        for (const detector of this.customDetectors) {
            const customInput = detector(selfVehicle, { billboards, terrainManager, worldConfig: this.worldConfig }, this.steering);
            if (customInput) return customInput;
        }

        return null;
    }

    checkTerrain(selfVehicle, terrainManager) {
        if (!terrainManager) return null;

        const pos = selfVehicle.position;
        const rot = selfVehicle.rotation;
        const forwardX = Math.sin(rot.y || 0);
        const forwardZ = Math.cos(rot.y || 0);
        const currentTerrain = terrainManager.getTerrainHeight(pos.x, pos.z);
        const aheadTerrain = terrainManager.getTerrainHeight(pos.x + forwardX * 25, pos.z + forwardZ * 25);
        const minSafeHeight = Math.max(currentTerrain, aheadTerrain) + 25;

        if (pos.y < minSafeHeight) {
            const climbPoint = new THREE.Vector3(
                pos.x + forwardX * 50,
                Math.min(this.worldConfig.maxHeight - 30, minSafeHeight + 35),
                pos.z + forwardZ * 50
            );
            const inputs = this.steering.steerTowards(selfVehicle, climbPoint, 1.0, 1.0);
            inputs.pitch = Math.min(inputs.pitch, -0.7);
            inputs.vertical = 1;
            return inputs;
        }
        return null;
    }

    checkMapBoundary(selfVehicle, defaultThrottle) {
        const pos = selfVehicle.position;
        const halfMap = this.worldConfig.size / 2;
        const margin = (this.worldConfig.boundaryBuffer ?? 10) + 35;
        const limit = Math.max(40, halfMap - margin);

        if (Math.abs(pos.x) > limit || Math.abs(pos.z) > limit || pos.y > this.worldConfig.maxHeight - 25) {
            const centerTarget = new THREE.Vector3(0, Math.min(110, this.worldConfig.maxHeight - 50), 0);
            const inputs = this.steering.steerTowards(selfVehicle, centerTarget, 1.0, defaultThrottle);
            if (pos.y > this.worldConfig.maxHeight - 25) {
                inputs.vertical = -1;
            }
            return inputs;
        }
        return null;
    }

    checkBillboards(selfVehicle, billboards) {
        if (!billboards || billboards.size === 0) return null;

        const pos = selfVehicle.position;
        for (const billboard of billboards.values()) {
            if (!billboard || !billboard.active) continue;
            const dx = pos.x - billboard.position.x;
            const dy = pos.y - billboard.position.y;
            const dz = pos.z - billboard.position.z;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            const safeRadius = Math.max(billboard.width || 40, billboard.height || 20) * 0.75 + 15;

            if (dist < safeRadius) {
                const away = new THREE.Vector3(dx, dy + 20, dz);
                if (away.lengthSq() < 0.001) away.set(1, 1, 0);
                away.normalize().multiplyScalar(60).add(pos);
                const inputs = this.steering.steerTowards(selfVehicle, away, 1.0, 1.0);
                inputs.vertical = 1;
                return inputs;
            }
        }
        return null;
    }
}
