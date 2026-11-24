/**
 * 지형 고도 기반 바이옴 버텍스 컬러 계산 전담 클래스 (SRP / OCP)
 * 모래(해변) -> 초원 -> 숲 -> 암석 -> 설원 순으로 부드럽게 보간한다.
 */
export const DEFAULT_BIOME_STOPS = [
    { height: -2, color: '#c8b588' }, // 모래사장
    { height: 10, color: '#4f7d43' }, // 저지대 초원
    { height: 26, color: '#3b5e36' }, // 고지대 숲
    { height: 42, color: '#706c66' }, // 암석 산악
    { height: 58, color: '#e6edf2' }  // 설원 정상
];

function parseHexToRgb(hex) {
    const clean = String(hex).replace('#', '');
    const num = parseInt(clean, 16);
    if (Number.isNaN(num)) return { r: 0.3, g: 0.45, b: 0.25 };
    return {
        r: ((num >> 16) & 255) / 255,
        g: ((num >> 8) & 255) / 255,
        b: (num & 255) / 255
    };
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

export class TerrainColorizer {
    /**
     * @param {Array<{ height: number, color: string }>} [biomeStops]
     */
    constructor(biomeStops = null) {
        const source = Array.isArray(biomeStops) && biomeStops.length >= 2
            ? biomeStops
            : DEFAULT_BIOME_STOPS;

        this.stops = source
            .map(s => ({ height: s.height, rgb: parseHexToRgb(s.color) }))
            .sort((a, b) => a.height - b.height);
    }

    /**
     * 단일 고도에 대한 선형 보간 RGB 반환 (0..1)
     */
    getColorForHeight(height) {
        const first = this.stops[0];
        const last = this.stops[this.stops.length - 1];

        if (height <= first.height) return { ...first.rgb };
        if (height >= last.height) return { ...last.rgb };

        for (let i = 0; i < this.stops.length - 1; i++) {
            const lower = this.stops[i];
            const upper = this.stops[i + 1];
            if (height >= lower.height && height <= upper.height) {
                const span = Math.max(0.0001, upper.height - lower.height);
                const t = (height - lower.height) / span;
                return {
                    r: lerp(lower.rgb.r, upper.rgb.r, t),
                    g: lerp(lower.rgb.g, upper.rgb.g, t),
                    b: lerp(lower.rgb.b, upper.rgb.b, t)
                };
            }
        }
        return { ...first.rgb };
    }

    /**
     * PlaneGeometry position 배열(x, y, z=높이)에서 버텍스 컬러 Float32Array 생성
     */
    buildVertexColors(positionArray) {
        const colors = new Float32Array(positionArray.length);
        for (let i = 0; i < positionArray.length; i += 3) {
            const height = positionArray[i + 2];
            const rgb = this.getColorForHeight(height);
            colors[i] = rgb.r;
            colors[i + 1] = rgb.g;
            colors[i + 2] = rgb.b;
        }
        return colors;
    }
}
