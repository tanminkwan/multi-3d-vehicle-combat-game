const { test, expect } = require('@playwright/test');

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost';

async function ensureUserAndToken(request, username, password) {
    // 회원가입 시도 (이미 존재하면 무시)
    await request.post(`${BASE_URL}/api/auth/users/register`, {
        data: { username, email: `${username}@example.com`, password }
    });

    const loginRes = await request.post(`${BASE_URL}/api/auth/users/login`, {
        data: { username, password }
    });
    expect(loginRes.ok()).toBeTruthy();
    const body = await loginRes.json();
    expect(body.token).toBeTruthy();
    return body.token;
}

async function loginAndJoinGame(page, username, password) {
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'domcontentloaded' });

    await page.fill('#loginUsername', username);
    await page.fill('#loginPassword', password);
    await page.click('#loginScreen .btn-primary');

    // 차량 선택 화면 전환 및 소켓 연결 대기
    await expect(page.locator('#vehicleSelectionScreen')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#connectionStatus')).toContainText('서버 연결됨', { timeout: 15000 });

    // 게임 참가
    await page.click('#joinBtn');
    await expect(page.locator('#gameCanvas')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#gameUI')).toBeVisible({ timeout: 15000 });

    return pageErrors;
}

test.describe('NPC Player E2E (Headless Browser)', () => {
    const user1 = 'e2epilot1';
    const user2 = 'e2epilot2';
    const password = 'password123';
    let token1;

    test.beforeAll(async ({ request }) => {
        token1 = await ensureUserAndToken(request, user1, password);
        await ensureUserAndToken(request, user2, password);

        // 기본 fill 모드로 초기화
        const resetRes = await request.put(`${BASE_URL}/api/game/api/npc/config`, {
            headers: { Authorization: `Bearer ${token1}` },
            data: {
                enabled: true,
                mode: 'fill',
                fixedCount: 3,
                defaultDifficulty: 'normal'
            }
        });
        expect(resetRes.status()).toBe(200);
    });

    test.afterAll(async ({ request }) => {
        if (!token1) return;
        await request.put(`${BASE_URL}/api/game/api/npc/config`, {
            headers: { Authorization: `Bearer ${token1}` },
            data: {
                enabled: true,
                mode: 'fill',
                fixedCount: 3,
                defaultDifficulty: 'normal',
                difficulties: { hard: { reactionTimeMs: 100 } }
            }
        });
    });

    test('fill mode, NPC flight & UI rendering, 2nd human slot replacement, dynamic API config, and 0-human cleanup', async ({ browser, request }) => {
        const ctx1 = await browser.newContext();
        const page1 = await ctx1.newPage();
        let ctx2 = null;

        try {
            // 1. 첫 번째 유저 로그인 및 게임 입장
            const pageErrors1 = await loginAndJoinGame(page1, user1, password);

            // 플레이어 목록에 8명(유저 1 + NPC 7) 표시 확인
            await expect(page1.locator('#players .player-item')).toHaveCount(8, { timeout: 15000 });
            await expect(page1.locator('#players .player-item[data-is-npc="true"]')).toHaveCount(7, { timeout: 15000 });

            // NPC1 ~ NPC7 이름 확인
            const npcNames = await page1.locator('#players .player-item[data-is-npc="true"]').evaluateAll(
                els => els.map(el => el.dataset.playerName).sort()
            );
            expect(npcNames).toEqual(['NPC1', 'NPC2', 'NPC3', 'NPC4', 'NPC5', 'NPC6', 'NPC7']);

            // 서버 API 상태 확인
            const status1 = await (await request.get(`${BASE_URL}/api/game/api/status`, {
                headers: { Authorization: `Bearer ${token1}` }
            })).json();
            expect(status1.humanPlayers).toBe(1);
            expect(status1.npcPlayers).toBe(7);
            expect(status1.gameState).toBe('playing');

            // 2. NPC 비행 이동 확인 (1.2초 간격으로 위치 변화 검증)
            const getNpcPositions = () => page1.evaluate(() => {
                const client = typeof gameClient !== 'undefined' ? gameClient : null;
                const state = client?.latestGameState;
                if (!state) return {};
                const npcIds = new Set(state.players.filter(p => p.isNpc).map(p => p.id));
                const map = {};
                for (const v of state.vehicles) {
                    if (npcIds.has(v.playerId)) {
                        map[v.playerId] = { ...v.position };
                    }
                }
                return map;
            });

            const posBefore = await getNpcPositions();
            await page1.waitForTimeout(1200);
            const posAfter = await getNpcPositions();

            let movedCount = 0;
            for (const id of Object.keys(posBefore)) {
                if (!posAfter[id]) continue;
                const dx = posAfter[id].x - posBefore[id].x;
                const dy = posAfter[id].y - posBefore[id].y;
                const dz = posAfter[id].z - posBefore[id].z;
                if (Math.hypot(dx, dy, dz) > 0.5) movedCount++;
            }
            expect(movedCount).toBeGreaterThan(0);

            // 3. 두 번째 유저 입장 -> fill 모드에서 NPC 7 -> 6 감소 및 stale 차량 정리 확인
            ctx2 = await browser.newContext();
            const page2 = await ctx2.newPage();
            await loginAndJoinGame(page2, user2, password);

            await expect(page1.locator('#players .player-item')).toHaveCount(8, { timeout: 15000 });
            await expect(page1.locator('#players .player-item[data-is-npc="true"]')).toHaveCount(6, { timeout: 15000 });

            // 4. REST API로 동적 변경: fixed 모드 2명 + hard 난이도 + reactionTimeMs 85ms
            const updateRes = await request.put(`${BASE_URL}/api/game/api/npc/config`, {
                headers: { Authorization: `Bearer ${token1}` },
                data: {
                    mode: 'fixed',
                    fixedCount: 2,
                    defaultDifficulty: 'hard',
                    difficulties: { hard: { reactionTimeMs: 85 } }
                }
            });
            expect(updateRes.status()).toBe(200);
            const updateBody = await updateRes.json();
            expect(updateBody.config.mode).toBe('fixed');
            expect(updateBody.counts.npc).toBe(2);
            expect(updateBody.activeNpcs.every(n => n.difficulty === 'hard')).toBe(true);

            // 브라우저 UI에서도 즉시 NPC 2명(총 4명: 유저 2 + NPC 2) + hard 배지 반영 확인
            await expect(page1.locator('#players .player-item[data-is-npc="true"]')).toHaveCount(2, { timeout: 15000 });
            await expect(page1.locator('#players .player-item')).toHaveCount(4, { timeout: 15000 });
            const badges = await page1.locator('#players .npc-badge').allTextContents();
            expect(badges).toEqual(['hard', 'hard']);

            // 잘못된 설정 요청 시 400 반환 확인
            const badRes = await request.put(`${BASE_URL}/api/game/api/npc/config`, {
                headers: { Authorization: `Bearer ${token1}` },
                data: { mode: 'invalid', fixedCount: 99 }
            });
            expect(badRes.status()).toBe(400);

            // 페이지 런타임 에러 없음 확인
            expect(pageErrors1).toEqual([]);
        } finally {
            if (ctx2) await ctx2.close();
            await ctx1.close();
        }

        // 5. 모든 유저 퇴장 후 0명 상태 -> NPC 전원 정리 및 waiting 전환 확인
        await expect.poll(async () => {
            const res = await request.get(`${BASE_URL}/api/game/api/status`, {
                headers: { Authorization: `Bearer ${token1}` }
            });
            const body = await res.json();
            return { human: body.humanPlayers, npc: body.npcPlayers, state: body.gameState };
        }, { timeout: 15000 }).toEqual({ human: 0, npc: 0, state: 'waiting' });
    });
});
