/**
 * 그래픽 품질 프리셋 해석 전담 모듈 (SRP / OCP)
 * game-config.yaml의 client.graphics 설정을 해석하여 최종 렌더링 파라미터를 반환한다.
 */
export const DEFAULT_GRAPHICS_PRESETS = {
    low: {
        textureSize: 128,
        enableEnvironmentMap: false,
        toneMappingExposure: 1.05,
        waterScrollSpeed: 0.02,
        cloudPuffs: 2,
        terrainRepeat: 12,
        waterRepeat: 10
    },
    medium: {
        textureSize: 256,
        enableEnvironmentMap: true,
        toneMappingExposure: 1.1,
        waterScrollSpeed: 0.03,
        cloudPuffs: 3,
        terrainRepeat: 16,
        waterRepeat: 12
    },
    high: {
        textureSize: 512,
        enableEnvironmentMap: true,
        toneMappingExposure: 1.15,
        waterScrollSpeed: 0.035,
        cloudPuffs: 4,
        terrainRepeat: 20,
        waterRepeat: 16
    }
};

export const DEFAULT_VISUAL_PALETTE = {
    skyTopColor: '#1a4b8c',
    skyMidColor: '#5fa4db',
    skyHorizonColor: '#cfe6f7',
    sunColor: '#fff6d6',
    hemisphereSkyColor: '#b8dcff',
    hemisphereGroundColor: '#485a40',
    hemisphereIntensity: 0.75,
    directionalLightIntensity: 1.15,
    waterColor: '#1b7fa3',
    waterOpacity: 0.72,
    vehicleMetalness: 0.55,
    vehicleRoughness: 0.35,
    vehicleBumpScale: 0.08
};

/**
 * client.graphics 설정에서 최종 그래픽 파라미터 계산
 * @param {object} [clientConfig]
 */
export function resolveGraphicsConfig(clientConfig = {}) {
    const raw = clientConfig?.graphics || {};
    const mergedPresets = {
        low: { ...DEFAULT_GRAPHICS_PRESETS.low, ...(raw.presets?.low || {}) },
        medium: { ...DEFAULT_GRAPHICS_PRESETS.medium, ...(raw.presets?.medium || {}) },
        high: { ...DEFAULT_GRAPHICS_PRESETS.high, ...(raw.presets?.high || {}) }
    };

    const presetName = Object.prototype.hasOwnProperty.call(mergedPresets, raw.preset)
        ? raw.preset
        : 'medium';

    const selected = mergedPresets[presetName];
    const palette = {
        ...DEFAULT_VISUAL_PALETTE,
        ...(raw.palette || {})
    };

    return {
        preset: presetName,
        textureSize: raw.textureSize ?? selected.textureSize,
        enableEnvironmentMap: raw.enableEnvironmentMap ?? selected.enableEnvironmentMap,
        toneMappingExposure: raw.toneMappingExposure ?? selected.toneMappingExposure,
        waterScrollSpeed: raw.waterScrollSpeed ?? selected.waterScrollSpeed,
        cloudPuffs: raw.cloudPuffs ?? selected.cloudPuffs,
        terrainRepeat: raw.terrainRepeat ?? selected.terrainRepeat,
        waterRepeat: raw.waterRepeat ?? selected.waterRepeat,
        palette,
        biomes: Array.isArray(raw.biomes) && raw.biomes.length >= 2 ? raw.biomes : null
    };
}
