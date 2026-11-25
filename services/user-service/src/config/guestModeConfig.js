/**
 * 맛보기(게스트) 모드 환경 변수 파서 (SRP)
 * ALLOW_GUEST_MODE 환경 변수 문자열을 불리언 정책으로 변환합니다.
 */
export function parseAllowGuestMode(envValue, defaultValue = true) {
    if (envValue === undefined || envValue === null) {
        return defaultValue;
    }

    const normalized = String(envValue).trim().toLowerCase();
    if (normalized === '') {
        return defaultValue;
    }

    if (['false', '0', 'no', 'off'].includes(normalized)) {
        return false;
    }

    if (['true', '1', 'yes', 'on'].includes(normalized)) {
        return true;
    }

    return defaultValue;
}
