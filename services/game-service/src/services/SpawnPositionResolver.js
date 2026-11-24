/**
 * 안전한 임의 스폰/리스폰 위치 계산 전담 클래스 (SRP / DIP)
 * - 맵 경계(boundaryBuffer) 내 위치 보장
 * - 지형 높이(TerrainManager) + 안전 고도 마진(+25) 이상 보장
 * - 이전 파괴 위치(previousPosition)와 최소 이격 거리 이상 떨어진 위치 선정
 */
export class SpawnPositionResolver {
    constructor(worldConfig = {}, terrainManager = null, options = {}) {
        this.worldConfig = worldConfig || {};
        this.terrainManager = terrainManager;
        this.randomFn = options.random || (() => Math.random());
        this.minDistanceFromPrevious = options.minDistanceFromPrevious ?? 40;
        this.terrainClearance = options.terrainClearance ?? 25;
        this.maxAttempts = options.maxAttempts ?? 12;
    }

    /**
     * 안전한 임의 스폰 위치 반환
     * @param {{ x: number, y: number, z: number } | null} [previousPosition]
     * @returns {{ x: number, y: number, z: number }}
     */
    resolve(previousPosition = null) {
        const size = this.worldConfig.size ?? 400;
        const boundaryBuffer = this.worldConfig.boundaryBuffer ?? 10;
        const limit = Math.max(20, size / 2 - boundaryBuffer);
        const maxHeight = this.worldConfig.maxHeight ?? 200;

        const minDistance = this.worldConfig.spawnDistance?.min ?? 50;
        const maxDistance = Math.min(limit, this.worldConfig.spawnDistance?.max ?? 150);
        const minHeight = this.worldConfig.spawnHeight?.min ?? 80;
        const maxSpawnHeight = Math.min(maxHeight - 10, this.worldConfig.spawnHeight?.max ?? 120);

        let bestCandidate = null;
        let bestDist = -1;

        for (let attempt = 0; attempt < this.maxAttempts; attempt++) {
            const angle = this.randomFn() * Math.PI * 2;
            const distance = minDistance + this.randomFn() * Math.max(0, maxDistance - minDistance);
            const rawX = Math.cos(angle) * distance;
            const rawZ = Math.sin(angle) * distance;

            const x = Math.max(-limit, Math.min(limit, rawX));
            const z = Math.max(-limit, Math.min(limit, rawZ));

            const terrainY = this.terrainManager ? this.terrainManager.getTerrainHeight(x, z) : 0;
            const safeMinY = terrainY + this.terrainClearance;
            const baseY = minHeight + this.randomFn() * Math.max(0, maxSpawnHeight - minHeight);
            const y = Math.min(maxHeight - 10, Math.max(baseY, safeMinY));

            const candidate = { x, y, z };
            if (!previousPosition) {
                return candidate;
            }

            const dist = Math.hypot(x - previousPosition.x, z - previousPosition.z);
            if (dist >= this.minDistanceFromPrevious) {
                return candidate;
            }
            if (dist > bestDist) {
                bestDist = dist;
                bestCandidate = candidate;
            }
        }

        return bestCandidate;
    }
}
