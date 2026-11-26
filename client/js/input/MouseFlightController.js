/**
 * 마우스 우클릭 3D 웨이포인트 비행 제어기 (SRP / DOM 비의존 순수 모듈)
 * - 3D 목표 지점을 맵 경계 및 지형 안전 고도 내로 클램핑
 * - Vehicle.js의 YXZ (+Z 전방) 좌표계에 맞춰 피치/요/롤/추력 자동 조향 입력 산출
 */

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function normalizeAngle(angle) {
    let a = angle;
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
}

export class MouseFlightController {
    constructor(config = {}) {
        const mf = config.client?.mouseFlight || {};
        const world = config.world || {};

        this.enabled = mf.enabled !== false;
        this.moveMouseButton = mf.moveMouseButton ?? 2; // 기본 우클릭
        this.defaultTargetDistance = mf.defaultTargetDistance ?? 120;
        this.minTargetDistance = mf.minTargetDistance ?? 25;
        this.maxTargetDistance = mf.maxTargetDistance ?? 220;
        this.arrivalRadius = mf.arrivalRadius ?? 12;
        this.minTerrainClearance = mf.minTerrainClearance ?? 18;
        this.autoThrottle = mf.autoThrottle ?? 0.85;
        this.steerDeadzoneRad = mf.steerDeadzoneRad ?? 0.04;
        this.maxBankAngleRad = mf.maxBankAngleRad ?? 0.45;
        this.waypointMarkerEnabled = mf.waypointMarkerEnabled !== false;

        const worldSize = world.size ?? 400;
        const buffer = world.boundaryBuffer ?? 10;
        this.halfBound = worldSize / 2 - buffer;
        this.maxHeight = (world.maxHeight ?? 200) - buffer;

        this.targetPoint = null;
    }

    isEnabled() {
        return this.enabled;
    }

    hasTarget() {
        return Boolean(this.enabled && this.targetPoint);
    }

    getTarget() {
        return this.targetPoint ? { ...this.targetPoint } : null;
    }

    clearTarget() {
        this.targetPoint = null;
    }

    /**
     * 클릭으로 산출된 3D 목표 지점을 맵 경계 및 지형 안전 고도 내로 클램핑하여 저장합니다.
     * @param {{ x: number, y: number, z: number }} rawPoint
     * @param {number} [terrainHeight=0]
     * @returns {{ x: number, y: number, z: number } | null}
     */
    setTarget(rawPoint, terrainHeight = 0) {
        if (!this.enabled || !rawPoint) {
            return null;
        }

        const safeTerrain = Number.isFinite(terrainHeight) ? terrainHeight : 0;
        const minSafeY = safeTerrain + this.minTerrainClearance;

        const clamped = {
            x: clamp(rawPoint.x, -this.halfBound, this.halfBound),
            y: clamp(rawPoint.y, minSafeY, this.maxHeight),
            z: clamp(rawPoint.z, -this.halfBound, this.halfBound)
        };

        this.targetPoint = clamped;
        return { ...clamped };
    }

    /**
     * 현재 비행체 위치·회전(YXZ, +Z 전방)에서 웨이포인트로 향하는 조향 입력을 계산합니다.
     * @param {{ x: number, y: number, z: number }} position
     * @param {{ x: number, y: number, z: number }} rotation
     * @returns {{ active: boolean, arrived: boolean, distance: number, thrust: number, pitch: number, yaw: number, roll: number, vertical: number }}
     */
    computeSteering(position, rotation) {
        if (!this.enabled || !this.targetPoint || !position || !rotation) {
            return { active: false, arrived: false, distance: 0, thrust: 0, pitch: 0, yaw: 0, roll: 0, vertical: 0 };
        }

        const dx = this.targetPoint.x - position.x;
        const dy = this.targetPoint.y - position.y;
        const dz = this.targetPoint.z - position.z;
        const distance = Math.hypot(dx, dy, dz);

        if (distance <= this.arrivalRadius) {
            this.clearTarget();
            return { active: false, arrived: true, distance, thrust: 0, pitch: 0, yaw: 0, roll: 0, vertical: 0 };
        }

        const horizontalDist = Math.max(0.001, Math.hypot(dx, dz));
        const desiredYaw = Math.atan2(dx, dz);
        const yawError = normalizeAngle(desiredYaw - (rotation.y || 0));

        // Vehicle.js: rotation.x < 0 이 기수 상승(+Y), rotation.x > 0 이 기수 하강(-Y)
        const desiredPitch = -Math.atan2(dy, horizontalDist);
        const pitchError = normalizeAngle(desiredPitch - (rotation.x || 0));

        const yaw = Math.abs(yawError) <= this.steerDeadzoneRad
            ? 0
            : clamp(yawError / 0.55, -1, 1);

        const pitch = Math.abs(pitchError) <= this.steerDeadzoneRad
            ? 0
            : clamp(pitchError / 0.55, -1, 1);

        // 선회 방향에 맞춰 부드러운 롤(뱅크) 유도, 수평 복귀 지원
        const desiredRoll = clamp(-yaw * this.maxBankAngleRad, -this.maxBankAngleRad, this.maxBankAngleRad);
        const rollError = normalizeAngle(desiredRoll - (rotation.z || 0));
        const roll = Math.abs(rollError) <= this.steerDeadzoneRad
            ? 0
            : clamp(rollError / 0.6, -1, 1);

        // 각도 오차가 클 때(> 50도)는 감속하며 회전 반경을 줄여 오버슈트/무한 선회를 방지하고,
        // 기수가 목표를 향하면 풀 추력(autoThrottle)으로 직진 돌입한다.
        const absYawError = Math.abs(yawError);
        let thrust;
        if (absYawError > 0.9) {
            thrust = 0;
        } else if (absYawError > 0.35) {
            const t = 1 - (absYawError - 0.35) / (0.9 - 0.35);
            thrust = clamp(this.autoThrottle * (0.25 + 0.75 * t), 0.25, 1.0);
        } else {
            thrust = clamp(this.autoThrottle, 0.5, 1.0);
        }

        // 고도 차이가 크면 수직 보조 추력(vertical)도 함께 사용해 빠르게 목표 고도에 수렴
        const vertical = Math.abs(dy) > 4 ? clamp(dy / 25, -1, 1) : 0;

        return {
            active: true,
            arrived: false,
            distance,
            thrust,
            pitch,
            yaw,
            roll,
            vertical
        };
    }
}
