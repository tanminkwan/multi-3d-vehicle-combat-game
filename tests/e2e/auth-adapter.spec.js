const { test, expect } = require('@playwright/test');

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost';

test.describe('Auth Adapter (TokenVerifier / AUTH_MODE) E2E (Headless Browser)', () => {
    test('exposes auth.mode=local in game status and authenticates Socket.IO session via TokenVerifier', async ({ browser, request }) => {
        const guestRes = await request.post(`${BASE_URL}/api/auth/users/guest`, { data: {} });
        expect(guestRes.ok()).toBeTruthy();
        const { token } = await guestRes.json();

        const statusRes = await request.get(`${BASE_URL}/api/game/api/status`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        expect(statusRes.status()).toBe(200);
        const statusBody = await statusRes.json();
        expect(statusBody.auth).toEqual({
            mode: 'local',
            issuer: null
        });

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
            await expect(page.locator('#connectionStatus')).toContainText('서버 연결됨', { timeout: 15000 });

            await page.click('#joinBtn');
            await expect(page.locator('#gameCanvas')).toBeVisible({ timeout: 30000 });
            await expect(page.locator('#gameUI')).toBeVisible();

            await page.click('#leaveGameBtn');
            await expect(page.locator('#vehicleSelectionScreen')).toBeVisible();
            expect(pageErrors).toEqual([]);
        } finally {
            await ctx.close();
        }
    });
});
