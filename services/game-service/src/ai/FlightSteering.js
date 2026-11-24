import * as THREE from 'three';

const RAD_TO_DEG = 180 / Math.PI;

export function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

export function normalizeAngle(angle) {
    let a = angle;
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
}

/**
 * 3D 비행 조향 수학 전담 클래스 (SRP)
 * Three.js YXZ 오일러 좌표계(+Z 전방) 기준으로 목표 지점 조향 입력 및 시야각을 계산한다.
 */
export class FlightSteering {
    /**
     * 목표 지점으로 향하는 표준 Vehicle 입력 산출
     */
    steerTowards(selfVehicle, targetPoint, turnScale = 1.0, throttleScale = 1.0, yawNoise = 0, pitchNoise = 0) {
        const dx = targetPoint.x - selfVehicle.position.x;
        const dy = targetPoint.y - selfVehicle.position.y;
        const dz = targetPoint.z - selfVehicle.position.z;
        const horizDist = Math.sqrt(dx * dx + dz * dz);

        const desiredYaw = Math.atan2(dx, dz) + yawNoise;
        // Three.js YXZ 오일러에서 +Z 벡터에 +X 회전은 기수 하강(-Y)이므로 부호 반전
        const desiredPitch = -Math.atan2(dy, Math.max(0.001, horizDist)) + pitchNoise;

        const yawDiff = normalizeAngle(desiredYaw - (selfVehicle.rotation.y || 0));
        const pitchDiff = clamp(desiredPitch, -Math.PI / 2.2, Math.PI / 2.2) - (selfVehicle.rotation.x || 0);

        const yawInput = clamp(yawDiff / 0.45, -1, 1) * turnScale;
        const pitchInput = clamp(pitchDiff / 0.45, -1, 1) * turnScale;

        // 선회 시 자연스러운 롤 뱅킹, 직진 시 수평 복귀
        const desiredRoll = clamp(-yawInput * 0.5, -Math.PI / 5, Math.PI / 5);
        const rollDiff = desiredRoll - (selfVehicle.rotation.z || 0);
        const rollInput = clamp(rollDiff / 0.5, -1, 1) * turnScale;

        return {
            thrust: clamp(throttleScale, -1, 1),
            pitch: clamp(pitchInput, -1, 1),
            yaw: clamp(yawInput, -1, 1),
            roll: clamp(rollInput, -1, 1),
            vertical: clamp(dy / 40, -0.6, 0.6),
            fire: false,
            fireMissile: false
        };
    }

    /**
     * 비행체 정면 벡터와 목표 지점 사이의 각도(도) 계산
     */
    getAngleToPointDeg(selfVehicle, targetPoint) {
        const forward = new THREE.Vector3(0, 0, 1);
        const q = new THREE.Quaternion().setFromEuler(
            new THREE.Euler(
                selfVehicle.rotation.x || 0,
                selfVehicle.rotation.y || 0,
                selfVehicle.rotation.z || 0,
                'YXZ'
            )
        );
        forward.applyQuaternion(q);

        const toTarget = new THREE.Vector3().subVectors(targetPoint, selfVehicle.position);
        if (toTarget.lengthSq() < 0.0001) return 0;
        toTarget.normalize();

        return forward.angleTo(toTarget) * RAD_TO_DEG;
    }
}
