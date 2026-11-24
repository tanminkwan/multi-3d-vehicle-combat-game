import * as THREE from 'three';
import { FlightSteering } from './FlightSteering.js';
import { ObstacleAvoidance } from './ObstacleAvoidance.js';

const DEG_TO_RAD = Math.PI / 180;

/**
 * 개별 NPC 비행체의 전투 AI FSM 컨트롤러 (SRP / DIP)
 * 3D 조향 수학은 FlightSteering에, 장애물 회피 감지는 ObstacleAvoidance에 위임한다.
 */
export class NpcController {
    constructor(npcId, difficultyName, profile, worldConfig = {}, deps = {}) {
        this.npcId = npcId;
        this.difficulty = difficultyName || 'normal';
        this.profile = { ...profile };
        this.worldConfig = {
            size: worldConfig.size ?? 400,
            maxHeight: worldConfig.maxHeight ?? 200,
            boundaryBuffer: worldConfig.boundaryBuffer ?? 10,
            waterLevel: worldConfig.waterLevel ?? -5
        };

        this.nowFn = deps.now || (() => Date.now());
        this.randomFn = deps.random || (() => Math.random());
        this.steering = deps.steering || new FlightSteering();
        this.obstacleAvoidance = deps.obstacleAvoidance || new ObstacleAvoidance(this.worldConfig, this.steering);

        this.state = 'PATROL';
        this.targetId = null;
        this.targetAcquiredAt = 0;

        this.lastAttackerId = null;
        this.lastHitAt = 0;
        this.evadeTriggerAt = 0;
        this.evadeUntil = 0;
        this.evadeDirection = 1;

        this.lockAcquiredAt = 0;
        this.missileEvaluatedForLock = false;

        this.firePhaseStart = 0;
        this.isFiringBurst = true;

        this.lastDecisionAt = 0;
        this.aimOffsetYaw = 0;
        this.aimOffsetPitch = 0;

        this.waypoint = null;
        this.waypointSetAt = 0;
    }

    setProfile(difficultyName, profile) {
        this.difficulty = difficultyName;
        this.profile = { ...profile };
    }

    onHit(attackerId, now = this.nowFn()) {
        this.lastAttackerId = attackerId || null;
        this.lastHitAt = now;

        if (this.state === 'DEAD') return;

        const chance = this.profile.evasionChance ?? 0.5;
        if (this.randomFn() <= chance) {
            const reaction = this.profile.reactionTimeMs ?? 300;
            this.evadeTriggerAt = now + reaction;
            this.evadeDirection = this.randomFn() >= 0.5 ? 1 : -1;
        }
    }

    createNeutralInput() {
        return {
            thrust: 0,
            pitch: 0,
            yaw: 0,
            roll: 0,
            vertical: 0,
            fire: false,
            fireMissile: false
        };
    }

    update(deltaTime, context) {
        const now = context.now ?? this.nowFn();
        const { selfPlayer, selfVehicle, allVehicles = [], billboards = new Map(), terrainManager } = context;

        if (!selfVehicle || !selfVehicle.active) {
            this.resetOnDeath();
            return this.createNeutralInput();
        }

        if (this.state === 'DEAD') {
            this.state = 'PATROL';
            this.waypoint = null;
        }

        // 1. 최우선 안전 회피 위임
        const safetyOverride = this.obstacleAvoidance.computeAvoidanceInput(
            selfVehicle,
            billboards,
            terrainManager,
            this.profile.throttleScale ?? 0.8
        );
        if (safetyOverride) {
            this.state = 'AVOID_OBSTACLE';
            return safetyOverride;
        }

        // 2. 예약된 피격 반응 회피 진입 확인
        if (this.evadeTriggerAt > 0 && now >= this.evadeTriggerAt) {
            this.evadeTriggerAt = 0;
            this.evadeUntil = now + 2200;
            this.state = 'EVADE';
        }

        // 3. 저체력 회피 확인
        this.checkLowHealthEvasion(selfVehicle, now);

        // 4. 의사결정 주기마다 타겟/조준 오차 갱신
        const decisionInterval = this.profile.decisionIntervalMs ?? 200;
        if (this.lastDecisionAt === 0 || now - this.lastDecisionAt >= decisionInterval) {
            this.lastDecisionAt = now;
            this.refreshAimError();
            this.evaluateTarget(selfVehicle, allVehicles, now);
        }

        // 5. EVADE 상태 유지
        if (this.state === 'EVADE') {
            if (now < this.evadeUntil) {
                return this.computeEvadeInputs(selfVehicle);
            }
            this.state = this.targetId ? 'CHASE' : 'PATROL';
        }

        // 6. 타겟 유효성 확인
        const targetVehicle = this.findVehicleById(allVehicles, this.targetId);
        if (!targetVehicle || !targetVehicle.active) {
            this.targetId = null;
            this.targetAcquiredAt = 0;
            this.state = 'PATROL';
            return this.computePatrolInputs(selfVehicle, terrainManager, now);
        }

        // 7. 추적 및 교전 처리
        return this.computeCombatInputs(selfPlayer, selfVehicle, targetVehicle, now);
    }

    resetOnDeath() {
        this.state = 'DEAD';
        this.targetId = null;
        this.targetAcquiredAt = 0;
        this.evadeTriggerAt = 0;
        this.evadeUntil = 0;
        this.lockAcquiredAt = 0;
        this.missileEvaluatedForLock = false;
    }

    checkLowHealthEvasion(selfVehicle, now) {
        const healthRatio = selfVehicle.maxHealth > 0 ? selfVehicle.health / selfVehicle.maxHealth : 1;
        if (
            this.state !== 'EVADE' &&
            healthRatio <= (this.profile.evasionHealthRatio ?? 0.35) &&
            now - this.lastHitAt < 1500 &&
            this.evadeTriggerAt === 0 &&
            now >= this.evadeUntil + 3000
        ) {
            if (this.randomFn() <= (this.profile.evasionChance ?? 0.5)) {
                this.evadeTriggerAt = now + (this.profile.reactionTimeMs ?? 300);
                this.evadeDirection = this.randomFn() >= 0.5 ? 1 : -1;
            }
        }
    }

    evaluateTarget(selfVehicle, allVehicles, now) {
        const detectionRange = this.profile.detectionRange ?? 260;
        const maxDistSq = detectionRange * detectionRange;

        let bestTarget = null;
        let bestScore = Infinity;

        for (const other of allVehicles) {
            if (!other || !other.active || other.playerId === this.npcId) continue;

            const distSq = selfVehicle.position.distanceToSquared(other.position);
            if (distSq > maxDistSq) continue;

            let score = distSq;
            if (other.playerId === this.lastAttackerId && now - this.lastHitAt < 8000) {
                score *= 0.6;
            }
            if (other.id === this.targetId) {
                score *= 0.85;
            }

            if (score < bestScore) {
                bestScore = score;
                bestTarget = other;
            }
        }

        const nextTargetId = bestTarget ? bestTarget.id : null;
        if (nextTargetId !== this.targetId) {
            this.targetId = nextTargetId;
            this.targetAcquiredAt = nextTargetId ? now : 0;
            this.firePhaseStart = 0;
            this.isFiringBurst = true;
        }
    }

    refreshAimError() {
        const maxErrorRad = (this.profile.aimErrorDeg ?? 5.0) * DEG_TO_RAD;
        this.aimOffsetYaw = (this.randomFn() * 2 - 1) * maxErrorRad;
        this.aimOffsetPitch = (this.randomFn() * 2 - 1) * maxErrorRad;
    }

    computePatrolInputs(selfVehicle, terrainManager, now) {
        this.state = 'PATROL';
        const pos = selfVehicle.position;

        const needNewWaypoint =
            !this.waypoint ||
            now - this.waypointSetAt > 12000 ||
            pos.distanceTo(this.waypoint) < 25;

        if (needNewWaypoint) {
            const halfSpan = Math.max(50, this.worldConfig.size / 2 - (this.worldConfig.boundaryBuffer ?? 10) - 55);
            const wx = (this.randomFn() * 2 - 1) * halfSpan;
            const wz = (this.randomFn() * 2 - 1) * halfSpan;
            const terrainY = terrainManager ? terrainManager.getTerrainHeight(wx, wz) : 0;
            const minY = Math.max(60, terrainY + 35);
            const maxY = Math.min(140, this.worldConfig.maxHeight - 40);
            const wy = minY + this.randomFn() * Math.max(10, maxY - minY);

            this.waypoint = new THREE.Vector3(wx, wy, wz);
            this.waypointSetAt = now;
        }

        const turnScale = this.profile.turnRateScale ?? 0.8;
        const throttleScale = (this.profile.throttleScale ?? 0.8) * 0.75;
        return this.steering.steerTowards(selfVehicle, this.waypoint, turnScale, throttleScale);
    }

    computeCombatInputs(selfPlayer, selfVehicle, targetVehicle, now) {
        const distance = selfVehicle.position.distanceTo(targetVehicle.position);
        const bulletSpeed = 200;
        const leadFactor = this.profile.leadTargetFactor ?? 0.45;
        const leadTime = (distance / bulletSpeed) * leadFactor;

        const aimPoint = targetVehicle.position.clone();
        if (targetVehicle.velocity && leadFactor > 0) {
            aimPoint.addScaledVector(targetVehicle.velocity, leadTime);
        }

        const turnScale = this.profile.turnRateScale ?? 0.8;
        const throttleScale = this.profile.throttleScale ?? 0.8;
        const desiredThrottle = distance < 45 ? throttleScale * 0.35 : throttleScale;

        const inputs = this.steering.steerTowards(
            selfVehicle,
            aimPoint,
            turnScale,
            desiredThrottle,
            this.aimOffsetYaw,
            this.aimOffsetPitch
        );

        const angleToTargetDeg = this.steering.getAngleToPointDeg(selfVehicle, aimPoint);
        const fireRange = this.profile.fireRange ?? 220;
        const fireAngleDeg = this.profile.fireAngleDeg ?? 12;
        const reactionTime = this.profile.reactionTimeMs ?? 300;
        const hasReacted = this.targetAcquiredAt > 0 && (now - this.targetAcquiredAt) >= reactionTime;

        if (distance <= fireRange && angleToTargetDeg <= fireAngleDeg) {
            this.state = 'ENGAGE';
            if (hasReacted && this.shouldFireBurst(now)) {
                inputs.fire = true;
            }
        } else {
            this.state = 'CHASE';
        }

        this.applyMissileDecision(selfPlayer, inputs, now);
        return inputs;
    }

    applyMissileDecision(selfPlayer, inputs, now) {
        const isLocked = Boolean(selfPlayer?.lockOnState?.isLocked);
        if (isLocked) {
            if (this.lockAcquiredAt === 0) {
                this.lockAcquiredAt = now;
                this.missileEvaluatedForLock = false;
            }
            const missileDelay = this.profile.missileReactionMs ?? 450;
            if (!this.missileEvaluatedForLock && (now - this.lockAcquiredAt) >= missileDelay) {
                this.missileEvaluatedForLock = true;
                if (this.randomFn() <= (this.profile.missileUseChance ?? 0.6)) {
                    inputs.fireMissile = true;
                }
            }
        } else {
            this.lockAcquiredAt = 0;
            this.missileEvaluatedForLock = false;
        }
    }

    shouldFireBurst(now) {
        const burstMs = this.profile.fireBurstMs ?? 800;
        const restMs = this.profile.fireRestMs ?? 450;

        if (this.firePhaseStart === 0) {
            this.firePhaseStart = now;
            this.isFiringBurst = true;
        }

        const elapsed = now - this.firePhaseStart;
        if (this.isFiringBurst && elapsed >= burstMs) {
            this.isFiringBurst = false;
            this.firePhaseStart = now;
        } else if (!this.isFiringBurst && elapsed >= restMs) {
            this.isFiringBurst = true;
            this.firePhaseStart = now;
        }

        return this.isFiringBurst;
    }

    computeEvadeInputs(selfVehicle) {
        const turnScale = this.profile.turnRateScale ?? 0.8;
        const throttleScale = this.profile.throttleScale ?? 0.8;
        const pitchSign = selfVehicle.position.y > 130 ? 0.5 : -0.5;

        return {
            thrust: throttleScale,
            pitch: pitchSign * turnScale,
            yaw: this.evadeDirection * turnScale,
            roll: -this.evadeDirection * 0.7 * turnScale,
            vertical: selfVehicle.position.y > 130 ? -0.5 : 0.7,
            fire: false,
            fireMissile: false
        };
    }

    findVehicleById(allVehicles, id) {
        if (!id) return null;
        return allVehicles.find(v => v && v.id === id) || null;
    }
}
