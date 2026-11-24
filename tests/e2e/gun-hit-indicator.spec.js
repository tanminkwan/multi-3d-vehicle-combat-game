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
    return (await loginRes.json()).token;
}

test.describe('Gun Hit Zone Indicator E2E (Headless Browser)', () => {
    const username = 'e2egunhit1';
    const password = 'password123';
    let token;

    test.beforeAll(async ({ request }) => {
        token = await ensureUserAndToken(request, username, password);
    });

    test('renders flashing outer box (.gun-in-range) outside green awareness box when enemy is in gun line of fire', async ({ browser, request }) => {
        // 1. 서버 설정에 gunHitIndicator 설정이 로드되었는지 확인
        const statusRes = await request.get(`${BASE_URL}/api/game/api/status`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        expect(statusRes.status()).toBe(200);
        const statusBody = await statusRes.json();
        expect(statusBody.config.targeting.gunHitIndicator.enabled).toBe(true);

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
            await expect(page.locator('#players .player-item')).toHaveCount(8);

            // 2. 서버 플레이어 상태에 gunTargetId 필드가 포함되어 있는지 확인
            const hasGunTargetField = await page.evaluate(() => {
                const client = typeof gameClient !== 'undefined' ? gameClient : null;
                const me = client?.latestGameState?.players?.find(p => p.id === client.myPlayer.id);
                return Boolean(me && Object.prototype.hasOwnProperty.call(me, 'gunTargetId'));
            });
            expect(hasGunTargetField).toBe(true);

            // 3. 적 1대를 카메라 전방에 배치하고 gunTargetId 설정 시 초록 박스 바깥쪽 번쩍임(.gun-in-range) 스타일 검증
            const indicatorInfo = await page.evaluate(() => {
                const client = typeof gameClient !== 'undefined' ? gameClient : null;
                if (!client) return null;

                let enemyVehicle = null;
                for (const [, v] of client.vehicles) {
                    if (v !== client.myVehicle && v.userData.vehicleData?.active) {
                        enemyVehicle = v;
                        break;
                    }
                }
                if (!enemyVehicle) return null;

                // 카메라 정면 80유닛 앞에 위치시켜 화면 중앙에 투영되도록 함
                const dir = client.camera.getWorldDirection(enemyVehicle.position.clone());
                enemyVehicle.position.copy(client.camera.position).add(dir.multiplyScalar(80));
                enemyVehicle.updateMatrixWorld(true);

                const enemyId = enemyVehicle.userData.vehicleData.id;
                client.uiManager.updateTargetingIndicators(
                    {
                        id: client.myPlayer.id,
                        awarenessTargetId: enemyId,
                        lockOnTargetId: null,
                        gunTargetId: enemyId,
                        lockOnState: { isLocked: false, progress: 0 }
                    },
                    client.vehicles,
                    client.camera,
                    client.renderer.domElement
                );

                const box = document.querySelector('#targetingContainer .target-box.awareness.gun-in-range');
                if (!box) return { found: false };
                const beforeStyle = window.getComputedStyle(box, '::before');
                const afterStyle = window.getComputedStyle(box, '::after');
                return {
                    found: true,
                    gunInRangeAttr: box.dataset.gunInRange,
                    beforeAnimation: beforeStyle.animationName,
                    afterContent: afterStyle.content
                };
            });

            expect(indicatorInfo).not.toBeNull();
            expect(indicatorInfo.found).toBe(true);
            expect(indicatorInfo.gunInRangeAttr).toBe('true');
            expect(indicatorInfo.beforeAnimation).toContain('gunHitOuterFlash');
            expect(indicatorInfo.afterContent).toContain('FIRE!');

            // 4. gunTargetId가 null로 바뀌면 외곽 번쩍임(.gun-in-range)이 해제되고 초록 박스만 남는지 확인
            const cleared = await page.evaluate(() => {
                const client = typeof gameClient !== 'undefined' ? gameClient : null;
                let enemyId = null;
                for (const [, v] of client.vehicles) {
                    if (v !== client.myVehicle && v.userData.vehicleData?.active) {
                        enemyId = v.userData.vehicleData.id;
                        break;
                    }
                }
                client.uiManager.updateTargetingIndicators(
                    {
                        id: client.myPlayer.id,
                        awarenessTargetId: enemyId,
                        lockOnTargetId: null,
                        gunTargetId: null,
                        lockOnState: { isLocked: false, progress: 0 }
                    },
                    client.vehicles,
                    client.camera,
                    client.renderer.domElement
                );
                return {
                    hasAwareness: Boolean(document.querySelector('#targetingContainer .target-box.awareness')),
                    hasGunInRange: Boolean(document.querySelector('#targetingContainer .target-box.gun-in-range'))
                };
            });
            expect(cleared).toEqual({ hasAwareness: true, hasGunInRange: false });

            await page.click('#leaveGameBtn');
            await expect(page.locator('#vehicleSelectionScreen')).toBeVisible();
            expect(pageErrors).toEqual([]);
        } finally {
            await ctx.close();
        }
    });
});
