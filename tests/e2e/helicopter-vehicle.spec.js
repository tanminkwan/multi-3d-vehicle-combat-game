const { test, expect } = require('@playwright/test');

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost';

test.describe('Helicopter (헬리콥터) Vehicle E2E (Headless Browser)', () => {
    test('selects helicopter from lobby, spawns with 160 HP, 12 missiles, and spinning main/tail rotors', async ({ browser }) => {
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
            await expect(page.locator('#helicopterBtn')).toBeVisible();
            await expect(page.locator('#helicopterBtn')).toContainText('헬리콥터');
            await expect(page.locator('#helicopterBtn')).toContainText('미사일 12발');
            await expect(page.locator('#connectionStatus')).toContainText('서버 연결됨', { timeout: 15000 });

            await page.click('#helicopterBtn');
            await page.click('#joinBtn');

            await expect(page.locator('#gameCanvas')).toBeVisible({ timeout: 30000 });
            await expect(page.locator('#playerInfo')).toContainText('/160', { timeout: 15000 });
            await expect(page.locator('#playerInfo')).toContainText('12/12', { timeout: 15000 });

            const initialState = await page.evaluate(() => {
                const client = typeof gameClient !== 'undefined' ? gameClient : null;
                const v = client?.myVehicle;
                return {
                    vehicleType: v?.userData?.vehicleData?.vehicleType ?? null,
                    maxHealth: v?.userData?.vehicleData?.maxHealth ?? null,
                    hasMainRotor: Boolean(v?.userData?.mainRotor),
                    hasTailRotor: Boolean(v?.userData?.tailRotor),
                    mainRotY: v?.userData?.mainRotor?.rotation?.y ?? 0,
                    tailRotX: v?.userData?.tailRotor?.rotation?.x ?? 0
                };
            });

            expect(initialState.vehicleType).toBe('helicopter');
            expect(initialState.maxHealth).toBe(160);
            expect(initialState.hasMainRotor).toBe(true);
            expect(initialState.hasTailRotor).toBe(true);
            expect(initialState.mainRotY).toBeGreaterThan(0);
            expect(initialState.tailRotX).toBeGreaterThan(0);

            const afterStep = await page.evaluate(() => {
                const client = typeof gameClient !== 'undefined' ? gameClient : null;
                client.updateVehiclePropellers(0.05);
                return {
                    mainRotY: client?.myVehicle?.userData?.mainRotor?.rotation?.y ?? 0,
                    tailRotX: client?.myVehicle?.userData?.tailRotor?.rotation?.x ?? 0
                };
            });
            expect(afterStep.mainRotY).toBeGreaterThan(initialState.mainRotY);
            expect(afterStep.tailRotX).toBeGreaterThan(initialState.tailRotX);

            await page.click('#leaveGameBtn');
            await expect(page.locator('#vehicleSelectionScreen')).toBeVisible();
            expect(pageErrors).toEqual([]);
        } finally {
            await ctx.close();
        }
    });
});
