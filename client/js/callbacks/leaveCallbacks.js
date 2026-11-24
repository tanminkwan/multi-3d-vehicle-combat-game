/**
 * 게임 나가기 직전 호출되는 기본 콜백 (현재는 빈 깡통 no-op 구현)
 * 향후 클라이언트 측 통계 저장, 로그 전송, 확인 처리 등을 연결할 때 교체한다.
 *
 * @param {{ player: object|null, reason: string, leftAt: number }} context
 */
export async function defaultOnBeforeLeave(context) {
    // Intentionally empty (no-op placeholder for future client leave hooks)
}

/**
 * 게임 나가기 및 로비 복귀 완료 후 호출되는 기본 콜백 (현재는 빈 깡통 no-op 구현)
 *
 * @param {{ player: object|null, reason: string, leftAt: number }} context
 */
export async function defaultOnAfterLeave(context) {
    // Intentionally empty (no-op placeholder for future client leave hooks)
}

/**
 * 클라이언트 나가기 콜백 안전 실행 헬퍼 (예외 격리)
 */
export async function invokeSafeLeaveCallback(callback, context) {
    if (typeof callback !== 'function') return;
    try {
        await callback(context);
    } catch (error) {
        console.warn('[LeaveCallback] Callback execution failed:', error);
    }
}
