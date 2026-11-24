const { test, expect } = require('@playwright/test');

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost';

async function ensureUser(request, username, password) {
    await request.post(`${BASE_URL}/api/auth/users/register`, {
        data: { username, email: `${username}@example.com`, password }
    });
}

test.describe('Visual & Texture Upgrade E2E (Headless Browser)', () => {
    const username = 'e2evisual1';
    const password = 'password123';

    test.beforeAll(async ({ request }) => {
        await ensureUser(request, username, password);
    });

    test('renders procedural textures, PBR vehicles, HemisphereLight, ACESFilmicToneMapping, InstancedMesh trees, and animated water with zero errors', async ({ browser }) => {
        const ctx = await browser.newContext();
        const page = await ctx.newPage();
        const pageErrors = [];
        page.on('pageerror', (err) => pageErrors.push(err.message));

        try {
            await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
            await page.evaluate(() => localStorage.clear());
            await page.reload({ waitUntil: 'domcontentloaded' });

            await page.fill('#loginUsername', username);
            await page.fill('#loginPassword', password);
            await page.click('#loginScreen .btn-primary');

            await expect(page.locator('#vehicleSelectionScreen')).toBeVisible();
            await expect(page.locator('#connectionStatus')).toContainText('서버 연결됨');

            await page.click('#joinBtn');
            await expect(page.locator('#gameCanvas')).toBeVisible();
            await expect(page.locator('#gameUI')).toBeVisible();

            // 1. 씬/렌더러 비주얼 업그레이드 요소 검증
            const visualInfo = await page.evaluate(() => {
                const client = typeof gameClient !== 'undefined' ? gameClient : null;
                if (!client) return null;

                let hasHemisphereLight = false;
                let instancedMeshCount = 0;
                client.scene.traverse(obj => {
                    if (obj.isHemisphereLight) hasHemisphereLight = true;
                    if (obj.isInstancedMesh) instancedMeshCount++;
                });

                const terrainMat = client.worldManager?.terrain?.material;
                const terrainHasVertexColors = Boolean(
                    terrainMat?.vertexColors && client.worldManager?.terrain?.geometry?.getAttribute('color')
                );
                const skyHasMap = Boolean(client.worldManager?.sky?.material?.map);
                const waterHasMap = Boolean(client.worldManager?.water?.material?.map);

                let vehicleHasPbrPanel = false;
                if (client.myVehicle) {
                    client.myVehicle.traverse(child => {
                        if (child.isMesh && child.material?.isMeshStandardMaterial && child.material.map && child.material.bumpMap) {
                            vehicleHasPbrPanel = true;
                        }
                    });
                }

                return {
                    toneMapping: client.renderer?.toneMapping,
                    hasHemisphereLight,
                    hasEnvironmentMap: Boolean(client.scene?.environment),
                    instancedMeshCount,
                    terrainHasVertexColors,
                    terrainHasDetailMap: Boolean(terrainMat?.map),
                    skyHasMap,
                    waterHasMap,
                    vehicleHasPbrPanel,
                    waterOffsetX: client.worldManager?.waterTexture?.offset?.x ?? null
                };
            });

            expect(visualInfo).not.toBeNull();
            expect(visualInfo.toneMapping).toBe(4); // THREE.ACESFilmicToneMapping === 4
            expect(visualInfo.hasHemisphereLight).toBe(true);
            expect(visualInfo.hasEnvironmentMap).toBe(true);
            expect(visualInfo.instancedMeshCount).toBe(3); // trunk + lower + upper conifer foliage
            expect(visualInfo.terrainHasVertexColors).toBe(true);
            expect(visualInfo.terrainHasDetailMap).toBe(true);
            expect(visualInfo.skyHasMap).toBe(true);
            expect(visualInfo.waterHasMap).toBe(true);
            expect(visualInfo.vehicleHasPbrPanel).toBe(true);

            // 2. 수면 UV 스크롤 애니메이션 동작 확인
            await expect.poll(async () => {
                return await page.evaluate(() => {
                    const client = typeof gameClient !== 'undefined' ? gameClient : null;
                    return client?.worldManager?.waterTexture?.offset?.x ?? null;
                });
            }, { timeout: 10000 }).not.toBe(visualInfo.waterOffsetX);

            // 3. 나가기 -> 재입장 시 리소스 정리 및 재생성 정상 확인
            await page.click('#leaveGameBtn');
            await expect(page.locator('#vehicleSelectionScreen')).toBeVisible();

            await page.click('#joinBtn');
            await expect(page.locator('#gameCanvas')).toBeVisible();
            await expect(page.locator('#gameUI')).toBeVisible();

            await page.click('#leaveGameBtn');
            await expect(page.locator('#vehicleSelectionScreen')).toBeVisible();

            expect(pageErrors).toEqual([]);
        } finally {
            await ctx.close();
        }
    });
});
