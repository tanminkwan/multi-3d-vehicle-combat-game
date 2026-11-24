const { test, expect } = require('@playwright/test');

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost';

async function ensureUserAndToken(request, username, password) {
    await request.post(`${BASE_URL}/api/auth/users/register`, {
        data: { username, email: `${username}@example.com`, password }
    });
    const loginRes = await request.post(`${BASE_URL}/api/auth/users/login`, {
        data: { username, password }
    });
    expect(loginRes.ok()).toBeTruthy();
    const body = await loginRes.json();
    return body.token;
}

test.describe('Combat Event Notifications E2E (Headless Browser)', () => {
    const username = 'e2enotify1';
    const password = 'password123';

    test.beforeAll(async ({ request }) => {
        await ensureUserAndToken(request, username, password);
    });

    test('suppresses other/NPC respawn toast, shows own respawn toast, and displays "OOO가 XXX에게 격추되었습니다!"', async ({ browser }) => {
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

            // 기존 초기 알림 제거
            await page.evaluate(() => {
                document.querySelectorAll('.notification').forEach((el) => el.remove());
            });

            // 1. NPC 리스폰 이벤트: 내 차량이 아니므로 알림이 뜨지 않아야 함
            const afterNpcRespawnCount = await page.evaluate(() => {
                const client = typeof gameClient !== 'undefined' ? gameClient : null;
                client.uiManager.showGameEvent('vehicleRespawned', {
                    vehicle: { id: 'veh-npc-1', playerId: 'npc-other-999' },
                    shouldShow: true
                });
                return document.querySelectorAll('.notification').length;
            });
            expect(afterNpcRespawnCount).toBe(0);

            // 2. 내 차량 리스폰 이벤트: 알림이 표시되어야 함
            await page.evaluate(() => {
                const client = typeof gameClient !== 'undefined' ? gameClient : null;
                client.uiManager.showGameEvent('vehicleRespawned', {
                    vehicle: { id: 'veh-me', playerId: client.myPlayer.id },
                    shouldShow: true
                });
            });
            await expect(page.locator('.notification')).toContainText('차량이 리스폰되었습니다.');

            // 기존 알림 제거 후 격추 이벤트 검증
            await page.evaluate(() => {
                document.querySelectorAll('.notification').forEach((el) => el.remove());
            });

            // 3. 격추 이벤트: "OOO가 XXX에게 격추되었습니다!" 표시
            await page.evaluate(() => {
                const client = typeof gameClient !== 'undefined' ? gameClient : null;
                client.uiManager.showGameEvent('vehicleDestroyed', {
                    vehicleId: 'veh-npc-1',
                    playerId: 'npc-1',
                    playerName: 'NPC1',
                    killedBy: client.myPlayer.id,
                    killerName: client.myPlayer.name
                });
            });
            await expect(page.locator('.notification')).toContainText(`NPC1가 ${username}에게 격추되었습니다!`);

            // 나가기 정리
            await page.click('#leaveGameBtn');
            await expect(page.locator('#vehicleSelectionScreen')).toBeVisible();

            expect(pageErrors).toEqual([]);
        } finally {
            await ctx.close();
        }
    });
});
