import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    resolveGraphicsConfig,
    DEFAULT_GRAPHICS_PRESETS
} from '../../../../client/js/graphics/GraphicsPresetResolver.js';
import { TerrainColorizer } from '../../../../client/js/graphics/TerrainColorizer.js';
import { ProceduralTextureFactory } from '../../../../client/js/graphics/ProceduralTextureFactory.js';

function createMockCanvas() {
    const drawCalls = [];
    const ctx = {
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 1,
        globalAlpha: 1,
        createLinearGradient: () => ({ addColorStop: () => {} }),
        createRadialGradient: () => ({ addColorStop: () => {} }),
        fillRect: (...args) => drawCalls.push(['fillRect', ...args]),
        strokeRect: (...args) => drawCalls.push(['strokeRect', ...args]),
        beginPath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        arc: () => {},
        fill: () => {},
        stroke: () => drawCalls.push(['stroke']),
        quadraticCurveTo: () => {}
    };
    return {
        width: 0,
        height: 0,
        drawCalls,
        getContext: () => ctx
    };
}

function createMockTexture(canvas) {
    return {
        image: canvas,
        wrapS: null,
        wrapT: null,
        colorSpace: null,
        repeat: {
            x: 1,
            y: 1,
            set(x, y) { this.x = x; this.y = y; }
        },
        needsUpdate: false,
        disposed: false,
        dispose() { this.disposed = true; }
    };
}

describe('Visual Upgrade Graphics Modules', () => {
    describe('GraphicsPresetResolver', () => {
        it('resolves medium preset by default and falls back on unknown preset names', () => {
            const def = resolveGraphicsConfig({});
            assert.equal(def.preset, 'medium');
            assert.equal(def.textureSize, DEFAULT_GRAPHICS_PRESETS.medium.textureSize);

            const fallback = resolveGraphicsConfig({ graphics: { preset: 'ultra_invalid' } });
            assert.equal(fallback.preset, 'medium');
        });

        it('merges preset values and custom overrides cleanly', () => {
            const high = resolveGraphicsConfig({
                graphics: {
                    preset: 'high',
                    toneMappingExposure: 1.25,
                    presets: {
                        high: { textureSize: 512, enableEnvironmentMap: true }
                    }
                }
            });
            assert.equal(high.preset, 'high');
            assert.equal(high.textureSize, 512);
            assert.equal(high.toneMappingExposure, 1.25);
            assert.equal(high.enableEnvironmentMap, true);
        });
    });

    describe('TerrainColorizer', () => {
        it('maps low/mid/high elevations to sand, grass, and snow colors with smooth interpolation', () => {
            const colorizer = new TerrainColorizer();
            const sand = colorizer.getColorForHeight(-5);
            const grass = colorizer.getColorForHeight(12);
            const snow = colorizer.getColorForHeight(70);

            // Sand has warm red/green > blue
            assert.ok(sand.r > sand.b);
            // Grass has green dominant
            assert.ok(grass.g > grass.r && grass.g > grass.b);
            // Snow is bright across all channels
            assert.ok(snow.r > 0.8 && snow.g > 0.8 && snow.b > 0.8);
        });

        it('builds Float32Array vertex colors matching PlaneGeometry position array', () => {
            const colorizer = new TerrainColorizer();
            const positions = new Float32Array([
                0, 0, -5,
                10, 0, 15,
                20, 0, 65
            ]);
            const colors = colorizer.buildVertexColors(positions);
            assert.ok(colors instanceof Float32Array);
            assert.equal(colors.length, positions.length);
            for (const c of colors) {
                assert.ok(c >= 0 && c <= 1);
            }
        });
    });

    describe('ProceduralTextureFactory', () => {
        it('creates, caches, and disposes sky, terrain, water, and vehicle panel textures', () => {
            let canvasCreations = 0;
            const factory = new ProceduralTextureFactory(
                { textureSize: 128 },
                {
                    createCanvas: () => {
                        canvasCreations++;
                        return createMockCanvas();
                    },
                    createTexture: createMockTexture
                }
            );

            const sky1 = factory.getSkyTexture();
            const sky2 = factory.getSkyTexture();
            assert.equal(sky1, sky2, 'Sky texture should be cached');

            const terrain = factory.getTerrainDetailTexture();
            const water = factory.getWaterTexture();
            const vehicle1 = factory.getVehiclePanelTextures();
            const vehicle2 = factory.getVehiclePanelTextures();
            assert.equal(vehicle1.map, vehicle2.map);
            assert.equal(vehicle1.bumpMap, vehicle2.bumpMap);
            assert.equal(canvasCreations, 5); // sky, terrain, water, vehicleMap, vehicleBump

            assert.ok(terrain.repeat.x > 1);
            assert.ok(water.repeat.x > 1);

            factory.dispose();
            assert.equal(sky1.disposed, true);
            assert.equal(terrain.disposed, true);
            assert.equal(water.disposed, true);
            assert.equal(vehicle1.map.disposed, true);
            assert.equal(vehicle1.bumpMap.disposed, true);
        });
    });
});
