const { test, expect } = require('@playwright/test');

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost';

test.describe('Mouse Right-Click Flight Control E2E (Headless Browser)', () => {
    test('applies custom cursor, sets 3D waypoint on right-click, steers vehicle, and cancels on keyboard input', async ({ browser }) => {
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
            await expect(page.locator('#controls')).toContainText('우클릭');

            // 1. #gameCanvas 커스텀 SVG 커서 적용 확인
            await expect(page.locator('#gameCanvas')).toHaveClass(/mouse-flight-enabled/);
            const cursorValue = await page.evaluate(() => {
                const canvas = document.getElementById('gameCanvas');
                return window.getComputedStyle(canvas).cursor;
            });
            expect(cursorValue).toContain('url(');

            // 2. 캔버스 특정 공간(우측 상단 쪽) 우클릭 -> 웨이포인트 활성 + 커서 변경 + 3D 마커 표시
            const canvasBox = await page.locator('#gameCanvas').boundingBox();
            expect(canvasBox).not.toBeNull();
            await page.mouse.click(
                canvasBox.x + canvasBox.width * 0.72,
                canvasBox.y + canvasBox.height * 0.32,
                { button: 'right' }
            );

            await expect(page.locator('#gameCanvas')).toHaveClass(/mouse-flight-active/);
            const afterClick = await page.evaluate(() => {
                const client = typeof gameClient !== 'undefined' ? gameClient : null;
                return {
                    hasTarget: client?.mouseFlightController?.hasTarget() ?? false,
                    target: client?.mouseFlightController?.getTarget() ?? null,
                    markerVisible: Boolean(client?.waypointMarker?.visible)
                };
            });
            expect(afterClick.hasTarget).toBe(true);
            expect(afterClick.target).not.toBeNull();
            expect(afterClick.markerVisible).toBe(true);

            // 3. 수동 조향 입력 계산 확인 (웨이포인트로 향하는 비-제로 추력/조향)
            const steeringState = await page.evaluate(() => {
                const client = typeof gameClient !== 'undefined' ? gameClient : null;
                client.updateMouseFlightControl(0.016);
                return {
                    thrust: client.inputs.thrust,
                    yaw: client.inputs.yaw,
                    pitch: client.inputs.pitch
                };
            });
            expect(steeringState.thrust).toBeGreaterThan(0);

            // 4. 키보드 이동 키(KeyW) 입력 시 즉시 마우스 자동 이동 및 마커 취소
            await page.keyboard.down('KeyW');
            await page.evaluate(() => {
                const client = typeof gameClient !== 'undefined' ? gameClient : null;
                client.updateMouseFlightControl(0.016);
            });
            await page.keyboard.up('KeyW');

            await expect(page.locator('#gameCanvas')).not.toHaveClass(/mouse-flight-active/);
            const afterManualOverride = await page.evaluate(() => {
                const client = typeof gameClient !== 'undefined' ? gameClient : null;
                return {
                    hasTarget: client?.mouseFlightController?.hasTarget() ?? false,
                    markerVisible: Boolean(client?.waypointMarker?.visible)
                };
            });
            expect(afterManualOverride.hasTarget).toBe(false);
            expect(afterManualOverride.markerVisible).toBe(false);

            // 5. UI 나가기 버튼 정상 동작 (이동 명령 오작동 없음)
            await page.click('#leaveGameBtn');
            await expect(page.locator('#vehicleSelectionScreen')).toBeVisible();
            expect(pageErrors).toEqual([]);
        } finally {
            await ctx.close();
        }
    });
});
