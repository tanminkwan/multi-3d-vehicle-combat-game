const { test, expect } = require('@playwright/test');

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost';

test.describe('Gift Box Gun Hit-Zone Indicator E2E (Headless Browser)', () => {
    test('renders flashing FIRE! gun-in-range indicator without green solid box on aimed gift box', async ({ browser }) => {
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
            await expect(page.locator('#playerInfo')).toBeVisible({ timeout: 15000 });

            // 서버에서 giftBox가 로드되고 gunGiftBoxTargetId 필드가 동기화되었는지 확인 후,
            // 선물 상자를 카메라 전방에 배치하고 gunGiftBoxTargetId 활성화 시 UI 렌더링 검증
            const uiResult = await page.evaluate(() => {
                const client = typeof gameClient !== 'undefined' ? gameClient : null;
                if (!client || !client.myPlayer || !client.giftBoxes || client.giftBoxes.size === 0) {
                    return { ready: false };
                }

                // 자동 업데이트 일시 중지 (검증 중 덮어쓰기 방지)
                client.isRunning = false;
                client.networkManager.setCallback('onGameStateUpdate', () => {});

                const [giftBoxId, giftBoxMesh] = client.giftBoxes.entries().next().value;
                // 카메라 정면 60m에 선물 상자 배치
                client.camera.position.set(0, 100, 0);
                client.camera.lookAt(0, 100, 60);
                client.camera.updateMatrixWorld(true);
                giftBoxMesh.position.set(0, 100, 60);
                giftBoxMesh.visible = true;
                giftBoxMesh.updateMatrixWorld(true);

                // 1) 사정권 진입 상태 (초록 박스 없이 gun-only + gun-in-range만)
                const aimedPlayerData = {
                    id: client.myPlayer.id,
                    awarenessTargetId: null,
                    lockOnTargetId: null,
                    gunTargetId: null,
                    gunGiftBoxTargetId: giftBoxId,
                    lockOnState: { isLocked: false, progress: 0 }
                };
                client.uiManager.updateTargetingIndicators(
                    aimedPlayerData,
                    client.vehicles,
                    client.camera,
                    client.renderer.domElement,
                    client.giftBoxes
                );

                const box = document.querySelector('#targetingContainer .target-box.gun-only.gun-in-range');
                const computed = box ? window.getComputedStyle(box) : null;
                const afterContent = box ? window.getComputedStyle(box, '::after').content : null;
                const hasAwarenessClass = box ? box.classList.contains('awareness') : null;
                const borderStyle = computed ? computed.borderTopStyle : null;

                // 2) 사정권 이탈 시 제거 확인
                aimedPlayerData.gunGiftBoxTargetId = null;
                client.uiManager.updateTargetingIndicators(
                    aimedPlayerData,
                    client.vehicles,
                    client.camera,
                    client.renderer.domElement,
                    client.giftBoxes
                );
                const remainingAfterClear = document.querySelectorAll('#targetingContainer .target-box.gun-only').length;

                return {
                    ready: true,
                    foundBox: Boolean(box),
                    hasAwarenessClass,
                    borderStyle,
                    afterContent,
                    remainingAfterClear
                };
            });

            expect(uiResult.ready).toBe(true);
            expect(uiResult.foundBox).toBe(true);
            expect(uiResult.hasAwarenessClass).toBe(false);
            expect(uiResult.borderStyle).toBe('none');
            expect(uiResult.afterContent).toContain('FIRE!');
            expect(uiResult.remainingAfterClear).toBe(0);

            await page.click('#leaveGameBtn');
            await expect(page.locator('#vehicleSelectionScreen')).toBeVisible();
            expect(pageErrors).toEqual([]);
        } finally {
            await ctx.close();
        }
    });
});
