export const DEFAULT_DIFFICULTY_PROFILES = {
    easy: {
        reactionTimeMs: 650,
        decisionIntervalMs: 400,
        aimErrorDeg: 12.0,
        leadTargetFactor: 0.0,
        turnRateScale: 0.55,
        throttleScale: 0.6,
        detectionRange: 180,
        fireRange: 150,
        fireAngleDeg: 18,
        fireBurstMs: 450,
        fireRestMs: 900,
        missileUseChance: 0.2,
        missileReactionMs: 1000,
        evasionChance: 0.25,
        evasionHealthRatio: 0.3
    },
    normal: {
        reactionTimeMs: 300,
        decisionIntervalMs: 200,
        aimErrorDeg: 5.0,
        leadTargetFactor: 0.45,
        turnRateScale: 0.8,
        throttleScale: 0.8,
        detectionRange: 260,
        fireRange: 220,
        fireAngleDeg: 12,
        fireBurstMs: 800,
        fireRestMs: 450,
        missileUseChance: 0.6,
        missileReactionMs: 450,
        evasionChance: 0.6,
        evasionHealthRatio: 0.45
    },
    hard: {
        reactionTimeMs: 100,
        decisionIntervalMs: 80,
        aimErrorDeg: 1.5,
        leadTargetFactor: 0.85,
        turnRateScale: 1.0,
        throttleScale: 1.0,
        detectionRange: 360,
        fireRange: 280,
        fireAngleDeg: 8,
        fireBurstMs: 1200,
        fireRestMs: 150,
        missileUseChance: 0.95,
        missileReactionMs: 150,
        evasionChance: 0.9,
        evasionHealthRatio: 0.6
    }
};

const DIFFICULTY_FIELD_RULES = {
    reactionTimeMs: { min: 0, max: 10000 },
    decisionIntervalMs: { min: 16, max: 5000 },
    aimErrorDeg: { min: 0, max: 90 },
    leadTargetFactor: { min: 0, max: 1 },
    turnRateScale: { min: 0.1, max: 1 },
    throttleScale: { min: 0.1, max: 1 },
    detectionRange: { min: 20, max: 2000 },
    fireRange: { min: 10, max: 2000 },
    fireAngleDeg: { min: 1, max: 90 },
    fireBurstMs: { min: 50, max: 10000 },
    fireRestMs: { min: 0, max: 10000 },
    missileUseChance: { min: 0, max: 1 },
    missileReactionMs: { min: 0, max: 10000 },
    evasionChance: { min: 0, max: 1 },
    evasionHealthRatio: { min: 0, max: 1 }
};

function mergeDifficulties(source = {}) {
    const keys = new Set([...Object.keys(DEFAULT_DIFFICULTY_PROFILES), ...Object.keys(source)]);
    const merged = {};
    for (const key of keys) {
        const base = DEFAULT_DIFFICULTY_PROFILES[key] || DEFAULT_DIFFICULTY_PROFILES.normal;
        merged[key] = { ...base, ...(source[key] || {}) };
    }
    return merged;
}

/**
 * NPC 설정 저장소, 동적 난이도 프리셋 관리 및 패치 검증 전담 클래스 (SRP / OCP)
 */
export class NpcConfigManager {
    constructor(gameConfig = {}, allowedModes = ['fill', 'fixed'], deps = {}) {
        this.maxPlayers = gameConfig.game?.maxPlayers ?? 8;
        this.allowedModes = new Set(allowedModes);
        this.randomFn = deps.random || (() => Math.random());

        const rawNpc = gameConfig.npc || {};
        const difficulties = mergeDifficulties(rawNpc.difficulties);
        const presetKeys = Object.keys(difficulties);
        const defaultDiff = (rawNpc.defaultDifficulty === 'mixed' || presetKeys.includes(rawNpc.defaultDifficulty))
            ? rawNpc.defaultDifficulty
            : 'normal';

        const defaultWeights = {};
        for (const key of presetKeys) {
            if (rawNpc.difficultyWeights?.[key] !== undefined) {
                defaultWeights[key] = rawNpc.difficultyWeights[key];
            } else if (key === 'easy') {
                defaultWeights[key] = 30;
            } else if (key === 'normal') {
                defaultWeights[key] = 50;
            } else if (key === 'hard') {
                defaultWeights[key] = 20;
            } else {
                defaultWeights[key] = 0;
            }
        }

        this.config = {
            enabled: rawNpc.enabled !== false,
            mode: this.allowedModes.has(rawNpc.mode) ? rawNpc.mode : 'fill',
            fixedCount: Number.isInteger(rawNpc.fixedCount) ? rawNpc.fixedCount : 3,
            keepAliveWhenEmpty: Boolean(rawNpc.keepAliveWhenEmpty),
            prioritizeHumans: rawNpc.prioritizeHumans !== false,
            defaultDifficulty: defaultDiff,
            difficultyWeights: defaultWeights,
            vehicleTypes: Array.isArray(rawNpc.vehicleTypes) && rawNpc.vehicleTypes.length > 0
                ? [...rawNpc.vehicleTypes]
                : ['fighter', 'heavy'],
            namePrefix: rawNpc.namePrefix || 'NPC',
            difficulties
        };
    }

    registerMode(modeName) {
        this.allowedModes.add(modeName);
    }

    getPresetKeys() {
        return Object.keys(this.config.difficulties);
    }

    getConfig() {
        return {
            ...this.config,
            difficultyWeights: { ...this.config.difficultyWeights },
            vehicleTypes: [...this.config.vehicleTypes],
            difficulties: mergeDifficulties(this.config.difficulties)
        };
    }

    validatePatch(patch) {
        const errors = [];
        if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
            return ['Request body must be a JSON object'];
        }

        const presetKeys = this.getPresetKeys();
        const validDifficulties = [...presetKeys, 'mixed'];

        if (patch.enabled !== undefined && typeof patch.enabled !== 'boolean') {
            errors.push('enabled must be a boolean');
        }
        if (patch.mode !== undefined && !this.allowedModes.has(patch.mode)) {
            errors.push(`mode must be one of: ${Array.from(this.allowedModes).join(', ')}`);
        }
        if (patch.fixedCount !== undefined) {
            if (!Number.isInteger(patch.fixedCount) || patch.fixedCount < 0 || patch.fixedCount > this.maxPlayers) {
                errors.push(`fixedCount must be an integer between 0 and ${this.maxPlayers}`);
            }
        }
        if (patch.prioritizeHumans !== undefined && typeof patch.prioritizeHumans !== 'boolean') {
            errors.push('prioritizeHumans must be a boolean');
        }
        if (patch.defaultDifficulty !== undefined && !validDifficulties.includes(patch.defaultDifficulty)) {
            errors.push(`defaultDifficulty must be one of: ${validDifficulties.join(', ')}`);
        }
        if (patch.difficultyWeights !== undefined) {
            if (typeof patch.difficultyWeights !== 'object' || patch.difficultyWeights === null) {
                errors.push('difficultyWeights must be an object');
            } else {
                let sum = 0;
                for (const key of presetKeys) {
                    const val = patch.difficultyWeights[key];
                    if (val !== undefined) {
                        if (typeof val !== 'number' || Number.isNaN(val) || val < 0) {
                            errors.push(`difficultyWeights.${key} must be a non-negative number`);
                        } else {
                            sum += val;
                        }
                    } else {
                        sum += this.config.difficultyWeights[key] ?? 0;
                    }
                }
                if (sum <= 0) {
                    errors.push('difficultyWeights sum must be greater than 0');
                }
            }
        }
        if (patch.difficulties !== undefined) {
            if (typeof patch.difficulties !== 'object' || patch.difficulties === null || Array.isArray(patch.difficulties)) {
                errors.push('difficulties must be an object');
            } else {
                for (const [diffKey, diffValues] of Object.entries(patch.difficulties)) {
                    if (!presetKeys.includes(diffKey)) {
                        errors.push(`Unknown difficulty preset: ${diffKey}`);
                        continue;
                    }
                    if (!diffValues || typeof diffValues !== 'object') {
                        errors.push(`difficulties.${diffKey} must be an object`);
                        continue;
                    }
                    for (const [field, value] of Object.entries(diffValues)) {
                        const rule = DIFFICULTY_FIELD_RULES[field];
                        if (!rule) {
                            errors.push(`Unknown difficulty field: difficulties.${diffKey}.${field}`);
                            continue;
                        }
                        if (typeof value !== 'number' || Number.isNaN(value) || value < rule.min || value > rule.max) {
                            errors.push(`difficulties.${diffKey}.${field} must be between ${rule.min} and ${rule.max}`);
                        }
                    }
                }
            }
        }

        return errors;
    }

    applyPatch(patch) {
        const errors = this.validatePatch(patch);
        if (errors.length > 0) {
            return { success: false, errors };
        }

        const difficultyChanged = patch.defaultDifficulty !== undefined || patch.difficultyWeights !== undefined;
        const profilesChanged = patch.difficulties !== undefined;

        if (patch.enabled !== undefined) this.config.enabled = patch.enabled;
        if (patch.mode !== undefined) this.config.mode = patch.mode;
        if (patch.fixedCount !== undefined) this.config.fixedCount = patch.fixedCount;
        if (patch.prioritizeHumans !== undefined) this.config.prioritizeHumans = patch.prioritizeHumans;
        if (patch.defaultDifficulty !== undefined) this.config.defaultDifficulty = patch.defaultDifficulty;

        if (patch.difficultyWeights) {
            for (const key of this.getPresetKeys()) {
                if (patch.difficultyWeights[key] !== undefined) {
                    this.config.difficultyWeights[key] = patch.difficultyWeights[key];
                }
            }
        }

        if (patch.difficulties) {
            for (const [diffKey, diffValues] of Object.entries(patch.difficulties)) {
                this.config.difficulties[diffKey] = {
                    ...this.config.difficulties[diffKey],
                    ...diffValues
                };
            }
        }

        return {
            success: true,
            difficultyChanged,
            profilesChanged
        };
    }

    pickVehicleType() {
        const types = this.config.vehicleTypes;
        const idx = Math.floor(this.randomFn() * types.length);
        return types[Math.min(idx, types.length - 1)] || 'fighter';
    }

    pickDifficulty() {
        if (this.config.defaultDifficulty !== 'mixed') {
            return this.config.defaultDifficulty;
        }
        const presetKeys = this.getPresetKeys();
        const weights = this.config.difficultyWeights;
        const total = presetKeys.reduce((acc, key) => acc + (weights[key] || 0), 0);
        if (total <= 0) return 'normal';

        let r = this.randomFn() * total;
        for (const key of presetKeys) {
            r -= weights[key] || 0;
            if (r <= 0) return key;
        }
        return 'normal';
    }

    getDifficultyProfile(difficultyName) {
        return {
            ...(this.config.difficulties[difficultyName] || this.config.difficulties.normal)
        };
    }
}
