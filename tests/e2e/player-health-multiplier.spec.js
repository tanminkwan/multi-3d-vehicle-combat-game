const { test, expect } = require('@playwright/test');

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost';

test.describe('Player-Only 2x Vehicle Health & Firepower E2E (Headless Browser)', () => {
    test('exposes 2x health & damage multipliers in config, spawns human fighter with 160 HP while NPCs keep base HP', async ({ browser, request }) => {
        // 1. 게스트 토큰 발급 후 서버 설정에서 체력/화력 2배 배율 노출 확인
        const guestRes = await request.post(`${BASE_URL}/api/auth/users/guest`, { data: {} });
        expect(guestRes.ok()).toBeTruthy();
        const { token } = await guestRes.json();

        const statusRes = await request.get(`${BASE_URL}/api/game/api/status`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        expect(statusRes.status()).toBe(200);
        const statusBody = await statusRes.json();
        expect(statusBody.config.game.playerHealthMultiplier).toBe(2);
        expect(statusBody.config.game.playerDamageMultiplier).toBe(2);

        const ctx = await browser.newContext();
        const page = await ctx.newPage();
        const pageErrors = [];
        page.on('pageerror', (err) => pageErrors.push(err.message));

        try {
            await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
            await page.evaluate(() => localStorage.clear());
            await page.reload({ waitUntil: 'domcontentloaded' });

            // 맛보기 버튼으로 즉시 입장
            await expect(page.locator('#guestLoginBtn')).toBeVisible();
            await page.click('#guestLoginBtn');

            await expect(page.locator('#vehicleSelectionScreen')).toBeVisible({ timeout: 15000 });
            await expect(page.locator('#fighterBtn')).toContainText('체력: 160');
            await expect(page.locator('#heavyBtn')).toContainText('체력: 300');
            await expect(page.locator('#connectionStatus')).toContainText('서버 연결됨', { timeout: 15000 });

            await page.click('#joinBtn');
            await expect(page.locator('#gameCanvas')).toBeVisible({ timeout: 30000 });
            await expect(page.locator('#playerInfo')).toContainText('/160', { timeout: 15000 });

            // 서버에서 전달된 내 차량과 NPC 차량들의 maxHealth 비교 검증
            const healthSummary = await page.evaluate(() => {
                const client = typeof gameClient !== 'undefined' ? gameClient : null;
                if (!client || !client.latestGameState) return null;
                const playersById = new Map(client.latestGameState.players.map((p) => [p.id, p]));
                const myMaxHealth = client.myVehicle?.userData?.vehicleData?.maxHealth ?? null;
                const npcVehicles = [];
                for (const [, v] of client.vehicles) {
                    const vd = v.userData?.vehicleData;
                    if (!vd) continue;
                    const p = playersById.get(vd.playerId);
                    if (p?.isNpc) {
                        npcVehicles.push({ type: vd.vehicleType, maxHealth: vd.maxHealth });
                    }
                }
                return { myMaxHealth, npcVehicles };
            });

            expect(healthSummary).not.toBeNull();
            expect(healthSummary.myMaxHealth).toBe(160);
            expect(healthSummary.npcVehicles.length).toBeGreaterThan(0);
            for (const npc of healthSummary.npcVehicles) {
                const expectedBase = npc.type === 'heavy' ? 150 : npc.type === 'test' ? 20 : 80;
                expect(npc.maxHealth).toBe(expectedBase);
            }

            await page.click('#leaveGameBtn');
            await expect(page.locator('#vehicleSelectionScreen')).toBeVisible();
            expect(pageErrors).toEqual([]);
        } finally {
            await ctx.close();
        }
    });
});
