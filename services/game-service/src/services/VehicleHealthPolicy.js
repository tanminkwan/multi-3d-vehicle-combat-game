/**
 * 플레이어 전용 전투 스탯(체력·화력) 배율 정책 계산기 (SRP)
 * NPC 비행체는 기본 스탯을 유지하고, 인간 플레이어 비행체에만 config 배율을 적용합니다.
 */
function applyPlayerMultiplier(baseValue, isNpc, multiplier, fallbackBase = 1) {
    const safeBase = Number.isFinite(baseValue) && baseValue > 0 ? baseValue : fallbackBase;
    if (Boolean(isNpc)) {
        return safeBase;
    }

    const numericMultiplier = Number(multiplier);
    if (!Number.isFinite(numericMultiplier) || numericMultiplier <= 0) {
        return safeBase;
    }

    return Math.round(safeBase * numericMultiplier);
}

export function resolveVehicleMaxHealth(baseHealth, options = {}) {
    return applyPlayerMultiplier(baseHealth, options.isNpc, options.playerHealthMultiplier, 100);
}

export function resolveWeaponDamage(baseDamage, options = {}) {
    return applyPlayerMultiplier(baseDamage, options.isNpc, options.playerDamageMultiplier, 10);
}
