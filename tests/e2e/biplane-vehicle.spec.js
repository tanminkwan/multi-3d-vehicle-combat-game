const { test, expect } = require('@playwright/test');

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost';

test.describe('Biplane (쌍엽기) Vehicle E2E (Headless Browser)', () => {
    test('selects biplane from lobby, spawns with 210 HP and spinning 3D propeller', async ({ browser }) => {
        const ctx = await browser.newContext();
        const page = await ctx.newPage();
        const pageErrors = [];
        page.on('pageerror', (err) => pageErrors.push(err.message));

        try {
            await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
            await page.evaluate(() => localStorage.clear());
            await page.reload({ waitUntil: 'domcontentloaded' });

            await expect(page.locator('#guestLoginBtn')).toBeVisible();
            await page.click('#guestLoginBtn');

            await expect(page.locator('#vehicleSelectionScreen')).toBeVisible({ timeout: 15000 });
            await expect(page.locator('#biplaneBtn')).toBeVisible();
            await expect(page.locator('#biplaneBtn')).toContainText('쌍엽기');
            await expect(page.locator('#biplaneBtn')).toContainText('체력: 210');
            await expect(page.locator('#connectionStatus')).toContainText('서버 연결됨', { timeout: 15000 });

            // 쌍엽기 선택 후 게임 참가
            await page.click('#biplaneBtn');
            await page.click('#joinBtn');

            await expect(page.locator('#gameCanvas')).toBeVisible({ timeout: 30000 });
            await expect(page.locator('#playerInfo')).toContainText('/210', { timeout: 15000 });

            // 3D 모델에 프로펠러 존재 및 회전 확인
            const initialProp = await page.evaluate(() => {
                const client = typeof gameClient !== 'undefined' ? gameClient : null;
                const v = client?.myVehicle;
                return {
                    vehicleType: v?.userData?.vehicleData?.vehicleType ?? null,
                    maxHealth: v?.userData?.vehicleData?.maxHealth ?? null,
                    hasPropeller: Boolean(v?.userData?.propeller),
                    propRotZ: v?.userData?.propeller?.rotation?.z ?? 0
                };
            });

            expect(initialProp.vehicleType).toBe('biplane');
            expect(initialProp.maxHealth).toBe(210);
            expect(initialProp.hasPropeller).toBe(true);
            expect(initialProp.propRotZ).toBeGreaterThan(0);

            // 프로펠러가 프레임 진행에 따라 계속 회전하는지 확인 (SwiftShader CPU 경합 방지를 위해 1초 간격 폴링)
            await expect.poll(async () => {
                return page.evaluate(() => {
                    const client = typeof gameClient !== 'undefined' ? gameClient : null;
                    return client?.myVehicle?.userData?.propeller?.rotation?.z ?? 0;
                });
            }, { timeout: 25000, intervals: [1000] }).toBeGreaterThan(initialProp.propRotZ);

            await page.click('#leaveGameBtn');
            await expect(page.locator('#vehicleSelectionScreen')).toBeVisible();
            expect(pageErrors).toEqual([]);
        } finally {
            await ctx.close();
        }
    });
});
