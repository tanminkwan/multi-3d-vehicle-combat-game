import { DEFAULT_VISUAL_PALETTE } from './GraphicsPresetResolver.js';

const REPEAT_WRAPPING = 1000; // THREE.RepeatWrapping
const SRGB_COLOR_SPACE = 'srgb'; // THREE.SRGBColorSpace

/**
 * 결정론적 의사 난수 (매 실행마다 깔끔하고 일관된 노이즈 패턴 생성)
 */
function mulberry32(seed) {
    let t = seed >>> 0;
    return () => {
        t += 0x6D2B79F5;
        let r = Math.imul(t ^ (t >>> 15), 1 | t);
        r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
        return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * 절차적(Procedural) CanvasTexture 생성·캐싱·해제 전담 클래스 (SRP / DIP)
 * 외부 대용량 이미지 없이 하늘/지형/수면/비행체 금속 패널 텍스처를 1회 생성해 재사용한다.
 */
export class ProceduralTextureFactory {
    /**
     * @param {object} graphicsConfig - resolveGraphicsConfig() 결과
     * @param {{ createCanvas?: () => HTMLCanvasElement, createTexture?: (canvas: any) => any }} [deps]
     */
    constructor(graphicsConfig = {}, deps = {}) {
        this.graphicsConfig = graphicsConfig;
        this.textureSize = graphicsConfig.textureSize || 256;
        this.palette = {
            ...DEFAULT_VISUAL_PALETTE,
            ...(graphicsConfig.palette || {})
        };
        this.createCanvasFn = deps.createCanvas || (() => document.createElement('canvas'));
        this.createTextureFn = deps.createTexture || null;
        this.cache = new Map();
    }

    makeCanvas(width = this.textureSize, height = this.textureSize) {
        const canvas = this.createCanvasFn();
        canvas.width = width;
        canvas.height = height;
        return canvas;
    }

    wrapTexture(canvas, { repeatX = 1, repeatY = 1, isColor = true } = {}) {
        if (!this.createTextureFn) {
            throw new Error('createTexture dependency must be provided');
        }
        const texture = this.createTextureFn(canvas);
        if (repeatX > 1 || repeatY > 1) {
            texture.wrapS = REPEAT_WRAPPING;
            texture.wrapT = REPEAT_WRAPPING;
            if (texture.repeat && typeof texture.repeat.set === 'function') {
                texture.repeat.set(repeatX, repeatY);
            }
        }
        if (isColor && 'colorSpace' in texture) {
            texture.colorSpace = SRGB_COLOR_SPACE;
        }
        texture.needsUpdate = true;
        return texture;
    }

    /**
     * 1. 천정 -> 중천 -> 지평선 그라데이션 + 은은한 태양 광휘 하늘 텍스처
     */
    getSkyTexture() {
        if (this.cache.has('sky')) return this.cache.get('sky');

        const size = this.textureSize;
        const canvas = this.makeCanvas(size, size);
        const ctx = canvas.getContext('2d');

        const grad = ctx.createLinearGradient(0, 0, 0, size);
        grad.addColorStop(0.0, this.palette.skyTopColor);
        grad.addColorStop(0.45, this.palette.skyMidColor);
        grad.addColorStop(0.55, this.palette.skyHorizonColor);
        grad.addColorStop(1.0, this.palette.skyHorizonColor);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, size, size);

        // 상공 은은한 태양 글로우
        const sunX = size * 0.72;
        const sunY = size * 0.28;
        const sunGrad = ctx.createRadialGradient(sunX, sunY, 2, sunX, sunY, size * 0.16);
        sunGrad.addColorStop(0, this.palette.sunColor);
        sunGrad.addColorStop(0.3, 'rgba(255, 246, 214, 0.35)');
        sunGrad.addColorStop(1, 'rgba(255, 246, 214, 0)');
        ctx.fillStyle = sunGrad;
        ctx.fillRect(0, 0, size, size);

        const tex = this.wrapTexture(canvas, { isColor: true });
        this.cache.set('sky', tex);
        return tex;
    }

    /**
     * 2. 지형 미세 노이즈 디테일 텍스처 (Vertex Color와 곱해져 질감 표현)
     */
    getTerrainDetailTexture() {
        if (this.cache.has('terrain')) return this.cache.get('terrain');

        const size = this.textureSize;
        const canvas = this.makeCanvas(size, size);
        const ctx = canvas.getContext('2d');
        const rand = mulberry32(4219);

        // 중립 밝기 베이스 (버텍스 컬러가 왜곡되지 않도록 밝은 회색 기반)
        ctx.fillStyle = '#e8e8e8';
        ctx.fillRect(0, 0, size, size);

        // 미세 지면 그레인 및 지형 패치
        const speckleCount = Math.floor(size * size * 0.08);
        for (let i = 0; i < speckleCount; i++) {
            const x = Math.floor(rand() * size);
            const y = Math.floor(rand() * size);
            const shade = 205 + Math.floor(rand() * 48);
            const dotSize = rand() > 0.85 ? 2 : 1;
            ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
            ctx.fillRect(x, y, dotSize, dotSize);
        }

        const repeat = this.graphicsConfig.terrainRepeat || 16;
        const tex = this.wrapTexture(canvas, { repeatX: repeat, repeatY: repeat, isColor: true });
        this.cache.set('terrain', tex);
        return tex;
    }

    /**
     * 3. 수면 물결 패턴 텍스처 (UV 오프셋 스크롤로 애니메이션)
     */
    getWaterTexture() {
        if (this.cache.has('water')) return this.cache.get('water');

        const size = this.textureSize;
        const canvas = this.makeCanvas(size, size);
        const ctx = canvas.getContext('2d');
        const rand = mulberry32(8831);

        ctx.fillStyle = '#d4eef8';
        ctx.fillRect(0, 0, size, size);

        // 부드러운 물결 호(wave arcs)
        const waveCount = Math.max(24, Math.floor(size * 0.25));
        for (let i = 0; i < waveCount; i++) {
            const x = rand() * size;
            const y = rand() * size;
            const w = 10 + rand() * (size * 0.14);
            const h = 2 + rand() * 4;
            ctx.strokeStyle = rand() > 0.45 ? 'rgba(255,255,255,0.45)' : 'rgba(10,65,95,0.22)';
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.quadraticCurveTo(x + w * 0.5, y - h, x + w, y);
            ctx.stroke();
        }

        const repeat = this.graphicsConfig.waterRepeat || 12;
        const tex = this.wrapTexture(canvas, { repeatX: repeat, repeatY: repeat, isColor: true });
        this.cache.set('water', tex);
        return tex;
    }

    /**
     * 4. 비행체 금속 패널 라인 + 리벳 텍스처 쌍 ({ map, bumpMap })
     */
    getVehiclePanelTextures() {
        if (this.cache.has('vehiclePanel')) return this.cache.get('vehiclePanel');

        const size = this.textureSize;
        const step = Math.max(32, Math.floor(size / 4));

        // Albedo (밝은 메탈 베이스에 패널 이음선 & 리벳 -> vertex/material color와 자연스럽게 합성)
        const mapCanvas = this.makeCanvas(size, size);
        const mCtx = mapCanvas.getContext('2d');
        mCtx.fillStyle = '#f2f4f7';
        mCtx.fillRect(0, 0, size, size);

        // 브러시드 메탈 미세 줄무늬
        mCtx.strokeStyle = 'rgba(255,255,255,0.25)';
        mCtx.lineWidth = 1;
        for (let y = 0; y < size; y += 4) {
            mCtx.beginPath();
            mCtx.moveTo(0, y);
            mCtx.lineTo(size, y);
            mCtx.stroke();
        }

        // 패널 격자 이음선 및 리벳
        mCtx.strokeStyle = 'rgba(40, 50, 65, 0.35)';
        mCtx.lineWidth = 1.5;
        for (let x = 0; x < size; x += step) {
            for (let y = 0; y < size; y += step) {
                mCtx.strokeRect(x + 1, y + 1, step - 2, step - 2);
                mCtx.fillStyle = 'rgba(55, 65, 80, 0.45)';
                const inset = 5;
                const rivets = [
                    [x + inset, y + inset],
                    [x + step - inset, y + inset],
                    [x + inset, y + step - inset],
                    [x + step - inset, y + step - inset]
                ];
                for (const [rx, ry] of rivets) {
                    mCtx.beginPath();
                    mCtx.arc(rx, ry, 1.3, 0, Math.PI * 2);
                    mCtx.fill();
                }
            }
        }

        // Bump map (패널 홈은 어둡게, 판면은 밝게)
        const bumpCanvas = this.makeCanvas(size, size);
        const bCtx = bumpCanvas.getContext('2d');
        bCtx.fillStyle = '#c8c8c8';
        bCtx.fillRect(0, 0, size, size);
        bCtx.strokeStyle = '#404040';
        bCtx.lineWidth = 2;
        for (let x = 0; x < size; x += step) {
            for (let y = 0; y < size; y += step) {
                bCtx.strokeRect(x + 1, y + 1, step - 2, step - 2);
            }
        }

        const pair = {
            map: this.wrapTexture(mapCanvas, { repeatX: 2, repeatY: 2, isColor: true }),
            bumpMap: this.wrapTexture(bumpCanvas, { repeatX: 2, repeatY: 2, isColor: false })
        };
        this.cache.set('vehiclePanel', pair);
        return pair;
    }

    /**
     * 캐시된 모든 텍스처 GPU 리소스 해제
     */
    dispose() {
        for (const value of this.cache.values()) {
            if (!value) continue;
            if (typeof value.dispose === 'function') {
                value.dispose();
            } else {
                if (value.map && typeof value.map.dispose === 'function') value.map.dispose();
                if (value.bumpMap && typeof value.bumpMap.dispose === 'function') value.bumpMap.dispose();
            }
        }
        this.cache.clear();
    }
}
