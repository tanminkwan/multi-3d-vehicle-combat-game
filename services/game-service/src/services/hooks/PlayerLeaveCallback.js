/**
 * 플레이어 게임 퇴장 시 호출되는 기본 콜백 (현재는 빈 깡통 no-op 구현)
 * 향후 전적 저장, 통계 전송, 이벤트 로깅 등을 연결할 때 이 시그니처에 맞춰 교체한다.
 *
 * @param {object} context
 * @param {string} context.playerId
 * @param {string|null} context.userId
 * @param {string} context.username
 * @param {'leave'|'disconnect'} context.reason
 * @param {string} context.vehicleType
 * @param {{ score: number, kills: number, deaths: number }} context.stats
 * @param {number} context.joinedAt
 * @param {number} context.leftAt
 * @param {number} context.playTimeMs
 */
export async function defaultOnPlayerLeave(context) {
    // Intentionally empty (no-op placeholder for future leave hooks)
}

/**
 * 퇴장 콜백을 동기/비동기 예외로부터 격리하여 안전하게 실행하는 래퍼 (SRP / DIP)
 * @param {(context: object) => (void | Promise<void>)} [callback]
 */
export function createSafeLeaveInvoker(callback = defaultOnPlayerLeave) {
    const fn = typeof callback === 'function' ? callback : defaultOnPlayerLeave;
    return async function invokePlayerLeave(context) {
        try {
            await fn(context);
        } catch (error) {
            console.warn('[PlayerLeaveCallback] Callback execution failed:', error?.message || error);
        }
    };
}
