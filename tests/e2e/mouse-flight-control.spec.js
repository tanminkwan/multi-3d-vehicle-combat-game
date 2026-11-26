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

            // 3. 자동 조향 입력 계산 확인 (턴-앤-번 정책상 회전 우선 또는 전진 추력 중 하나 이상 활성)
            const steeringState = await page.evaluate(() => {
                const client = typeof gameClient !== 'undefined' ? gameClient : null;
                client.updateMouseFlightControl(0.016);
                return {
                    thrust: client.inputs.thrust,
                    yaw: client.inputs.yaw,
                    pitch: client.inputs.pitch
                };
            });
            expect(
                steeringState.thrust > 0 ||
                Math.abs(steeringState.yaw) > 0 ||
                Math.abs(steeringState.pitch) > 0
            ).toBe(true);

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

    test('hides own vehicle across gameState ticks and supports right-click mouse flight in first-person view', async ({ browser }) => {
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
            await expect(page.locator('#gameCanvas')).toHaveClass(/mouse-flight-enabled/);

            // 1. V키로 1인칭 시점 전환 -> 내 기체 숨김 & 포인터 락 미사용 확인
            await page.keyboard.press('KeyV');
            await expect.poll(async () => {
                return page.evaluate(() => ({
                    isFirstPerson: Boolean(gameClient?.isFirstPerson),
                    myVisible: gameClient?.myVehicle?.visible,
                    pointerLocked: Boolean(document.pointerLockElement)
                }));
            }, { timeout: 5000 }).toEqual({
                isFirstPerson: true,
                myVisible: false,
                pointerLocked: false
            });

            // 2. 여러 번의 서버 gameState 수신 후에도 내 기체는 계속 숨김, 타 기체는 표시 유지
            await page.waitForTimeout(800);
            const afterTicks = await page.evaluate(() => {
                const others = [];
                for (const v of gameClient.vehicles.values()) {
                    if (v !== gameClient.myVehicle && v.userData?.vehicleData?.active !== false) {
                        others.push(v.visible);
                    }
                }
                return {
                    isFirstPerson: gameClient.isFirstPerson,
                    myVisible: gameClient.myVehicle?.visible,
                    otherVehiclesAllVisible: others.every(Boolean)
                };
            });
            expect(afterTicks.isFirstPerson).toBe(true);
            expect(afterTicks.myVisible).toBe(false);
            expect(afterTicks.otherVehiclesAllVisible).toBe(true);

            // 3. 1인칭 상태에서도 커서 유지 및 우클릭으로 3D 웨이포인트 이동 동작
            await expect(page.locator('#gameCanvas')).toHaveClass(/mouse-flight-enabled/);
            const canvasBox = await page.locator('#gameCanvas').boundingBox();
            expect(canvasBox).not.toBeNull();
            await page.mouse.click(
                canvasBox.x + canvasBox.width * 0.65,
                canvasBox.y + canvasBox.height * 0.42,
                { button: 'right' }
            );

            await expect(page.locator('#gameCanvas')).toHaveClass(/mouse-flight-active/);
            const beforeMove = await page.evaluate(() => {
                const target = gameClient.mouseFlightController.getTarget();
                const pos = gameClient.myVehicle.position;
                return {
                    hasTarget: gameClient.mouseFlightController.hasTarget(),
                    markerVisible: Boolean(gameClient.waypointMarker?.visible),
                    dist: target ? Math.hypot(target.x - pos.x, target.y - pos.y, target.z - pos.z) : null
                };
            });
            expect(beforeMove.hasTarget).toBe(true);
            expect(beforeMove.markerVisible).toBe(true);
            expect(beforeMove.dist).toBeGreaterThan(10);

            // 실제 비행 이동 진행 확인 (SwiftShader 프레임 지연을 고려해 폴링으로 거리 감소/도착 확인)
            await expect.poll(async () => {
                return page.evaluate((initialDist) => {
                    const target = gameClient.mouseFlightController.getTarget();
                    const pos = gameClient.myVehicle.position;
                    const dist = target ? Math.hypot(target.x - pos.x, target.y - pos.y, target.z - pos.z) : 0;
                    return {
                        myVisible: gameClient.myVehicle?.visible,
                        movedCloser: !target || dist < initialDist - 1
                    };
                }, beforeMove.dist);
            }, { timeout: 15000, intervals: [500] }).toEqual({
                myVisible: false,
                movedCloser: true
            });

            // 4. V키로 3인칭 복귀 시 내 기체 다시 표시
            await page.keyboard.press('KeyV');
            await expect.poll(async () => {
                return page.evaluate(() => ({
                    isFirstPerson: Boolean(gameClient?.isFirstPerson),
                    myVisible: gameClient?.myVehicle?.visible
                }));
            }, { timeout: 5000 }).toEqual({
                isFirstPerson: false,
                myVisible: true
            });

            await page.click('#leaveGameBtn');
            await expect(page.locator('#vehicleSelectionScreen')).toBeVisible();
            expect(pageErrors).toEqual([]);
        } finally {
            await ctx.close();
        }
    });
});
