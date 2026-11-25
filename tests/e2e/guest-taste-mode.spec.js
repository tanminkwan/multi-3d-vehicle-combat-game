const { test, expect } = require('@playwright/test');

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost';

test.describe('Guest Taste Mode E2E (Headless Browser)', () => {
    test('allows guest1, guest2 sequential login without registration when ALLOW_GUEST_MODE=true and joins game', async ({ browser, request }) => {
        // 1. 공개 auth-config 엔드포인트 확인
        const cfgRes = await request.get(`${BASE_URL}/api/auth/users/auth-config`);
        expect(cfgRes.status()).toBe(200);
        const cfgBody = await cfgRes.json();
        expect(cfgBody.success).toBe(true);
        expect(cfgBody.allowGuestMode).toBe(true);

        const ctx = await browser.newContext();
        const page = await ctx.newPage();
        const pageErrors = [];
        page.on('pageerror', (err) => pageErrors.push(err.message));

        try {
            // 2. 첫 번째 맛보기 입장
            await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
            await page.evaluate(() => localStorage.clear());
            await page.reload({ waitUntil: 'domcontentloaded' });

            const guestBtn = page.locator('#guestLoginBtn');
            await expect(guestBtn).toBeVisible();
            await guestBtn.click();

            await expect(page.locator('#vehicleSelectionScreen')).toBeVisible({ timeout: 15000 });
            await expect(page.locator('#connectionStatus')).toContainText('서버 연결됨', { timeout: 15000 });

            const firstGuestName = await page.locator('#playerName').inputValue();
            expect(firstGuestName).toMatch(/^guest\d+$/);
            const firstNum = parseInt(firstGuestName.replace('guest', ''), 10);

            // 실제 게임 입장 확인
            await page.click('#joinBtn');
            await expect(page.locator('#gameCanvas')).toBeVisible({ timeout: 30000 });
            await expect(page.locator('#playerInfo')).toContainText(firstGuestName, { timeout: 15000 });

            // 게임 나가기 → 로그아웃
            await page.click('#leaveGameBtn');
            await expect(page.locator('#vehicleSelectionScreen')).toBeVisible();
            await page.click('#vehicleSelectionScreen button:has-text("로그아웃")');
            await expect(page.locator('#loginScreen')).toBeVisible();
            await expect(guestBtn).toBeVisible();

            // 3. 두 번째 맛보기 입장 → 순번 +1 확인 (guest{N+1})
            await guestBtn.click();
            await expect(page.locator('#vehicleSelectionScreen')).toBeVisible({ timeout: 15000 });
            const secondGuestName = await page.locator('#playerName').inputValue();
            expect(secondGuestName).toBe(`guest${firstNum + 1}`);

            await page.click('#vehicleSelectionScreen button:has-text("로그아웃")');
            expect(pageErrors).toEqual([]);
        } finally {
            await ctx.close();
        }
    });

    test('hides guest button on login screen when auth-config reports allowGuestMode=false', async ({ browser }) => {
        const ctx = await browser.newContext();
        const page = await ctx.newPage();

        try {
            await page.route('**/api/auth/users/auth-config', async (route) => {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ success: true, allowGuestMode: false })
                });
            });

            await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
            await page.evaluate(() => localStorage.clear());
            await page.reload({ waitUntil: 'domcontentloaded' });

            await expect(page.locator('#loginScreen')).toBeVisible();
            await expect(page.locator('#guestLoginBtn')).toBeHidden();
        } finally {
            await ctx.close();
        }
    });
});
