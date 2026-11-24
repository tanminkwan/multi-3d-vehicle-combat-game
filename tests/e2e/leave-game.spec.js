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

test.describe('Leave Game & Callbacks E2E (Headless Browser)', () => {
    const username = 'e2eleave1';
    const password = 'password123';
    let token;

    test.beforeAll(async ({ request }) => {
        token = await ensureUserAndToken(request, username, password);
        await request.put(`${BASE_URL}/api/game/api/npc/config`, {
            headers: { Authorization: `Bearer ${token}` },
            data: { enabled: true, mode: 'fill', defaultDifficulty: 'normal' }
        });
    });

    test('leaves game via button, invokes leave callbacks, cleans up NPCs, and rejoins cleanly', async ({ browser, request }) => {
        const ctx = await browser.newContext();
        const page = await ctx.newPage();
        const pageErrors = [];
        page.on('pageerror', (err) => pageErrors.push(err.message));

        try {
            // 1. 로그인 및 차량 선택 화면 진입
            await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
            await page.evaluate(() => localStorage.clear());
            await page.reload({ waitUntil: 'domcontentloaded' });

            await page.fill('#loginUsername', username);
            await page.fill('#loginPassword', password);
            await page.click('#loginScreen .btn-primary');

            await expect(page.locator('#vehicleSelectionScreen')).toBeVisible();
            await expect(page.locator('#connectionStatus')).toContainText('서버 연결됨');

            // 2. 게임 입장
            await page.click('#joinBtn');
            await expect(page.locator('#gameCanvas')).toBeVisible();
            await expect(page.locator('#gameUI')).toBeVisible();
            await expect(page.locator('#leaveGameBtn')).toBeVisible();
            await expect(page.locator('#players .player-item')).toHaveCount(8);

            // 3. 클라이언트 콜백 훅 스파이 등록 후 나가기 버튼 클릭
            await page.evaluate(() => {
                window.__leaveEvents = [];
                window.gameLeaveCallbacks = {
                    onBeforeLeave: async (ctx) => {
                        window.__leaveEvents.push({ phase: 'before', reason: ctx.reason, playerName: ctx.player?.name });
                    },
                    onAfterLeave: async (ctx) => {
                        window.__leaveEvents.push({ phase: 'after', reason: ctx.reason, playerName: ctx.player?.name });
                    }
                };
            });

            await page.click('#leaveGameBtn');

            // 차량 선택 화면 복귀 및 소켓 연결 유지 확인
            await expect(page.locator('#vehicleSelectionScreen')).toBeVisible();
            await expect(page.locator('#gameCanvas')).toBeHidden();
            await expect(page.locator('#gameUI')).toBeHidden();
            await expect(page.locator('#connectionStatus')).toContainText('서버 연결됨');

            // 콜백이 순서대로 호출되었는지 확인
            const events = await page.evaluate(() => window.__leaveEvents);
            expect(events).toEqual([
                { phase: 'before', reason: 'leave', playerName: username },
                { phase: 'after', reason: 'leave', playerName: username }
            ]);

            // 타겟팅 컨테이너 DOM 정리 확인
            await expect(page.locator('#targetingContainer')).toHaveCount(0);

            // 서버 상태: 유저 0, NPC 0, waiting 전환 확인
            await expect.poll(async () => {
                const res = await request.get(`${BASE_URL}/api/game/api/status`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                const body = await res.json();
                return { human: body.humanPlayers, npc: body.npcPlayers, state: body.gameState };
            }).toEqual({ human: 0, npc: 0, state: 'waiting' });

            // 4. 기본(깡통 no-op) 콜백 상태에서 같은 세션으로 재입장 및 재나가기 검증
            await page.evaluate(() => { delete window.gameLeaveCallbacks; });
            await page.click('#joinBtn');

            await expect(page.locator('#gameCanvas')).toBeVisible();
            await expect(page.locator('#gameUI')).toBeVisible();
            await expect(page.locator('#players .player-item')).toHaveCount(8);
            await expect(page.locator('#targetingContainer')).toHaveCount(1);

            await page.click('#leaveGameBtn');
            await expect(page.locator('#vehicleSelectionScreen')).toBeVisible();
            await expect(page.locator('#targetingContainer')).toHaveCount(0);

            expect(pageErrors).toEqual([]);
        } finally {
            await ctx.close();
        }
    });
});
