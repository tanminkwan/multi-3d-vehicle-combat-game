/**
 * 1인칭 시점 전환 시 내 비행체 가시성, 포인터 락 및 마우스 이동 허용 정책 (SRP / DOM 비의존 순수 모듈)
 */
export class FirstPersonViewPolicy {
    constructor(config = {}) {
        const firstPerson = config?.camera?.firstPerson || {};
        const mouseFlight = config?.client?.mouseFlight || {};

        this.hideOwnVehicle = firstPerson.hideOwnVehicle !== false;
        this.usePointerLock = firstPerson.usePointerLock === true;
        this.mouseFlightEnabled = mouseFlight.enabled !== false;
        this.allowMouseFlightInFirstPerson = mouseFlight.allowInFirstPerson !== false;
    }

    shouldHideOwnVehicle() {
        return this.hideOwnVehicle;
    }

    shouldUsePointerLock() {
        return this.usePointerLock;
    }

    canUseMouseFlight(isFirstPerson = false) {
        if (!this.mouseFlightEnabled) {
            return false;
        }
        return !isFirstPerson || this.allowMouseFlightInFirstPerson;
    }

    shouldClearWaypointOnViewToggle(isFirstPerson = false) {
        return Boolean(isFirstPerson && !this.allowMouseFlightInFirstPerson);
    }

    /**
     * 서버 상태·무적 깜빡임·1인칭 시점 정책을 종합해 최종 비행체 가시성을 결정합니다.
     * @param {{ isOwnVehicle: boolean, isFirstPerson: boolean, serverVisible?: boolean, isInvulnerable?: boolean, blinkVisible?: boolean }} params
     * @returns {boolean}
     */
    resolveVehicleVisibility({
        isOwnVehicle,
        isFirstPerson,
        serverVisible = true,
        isInvulnerable = false,
        blinkVisible = true
    }) {
        if (isOwnVehicle && isFirstPerson && this.hideOwnVehicle) {
            return false;
        }
        if (!serverVisible) {
            return false;
        }
        if (isInvulnerable) {
            return Boolean(blinkVisible);
        }
        return true;
    }
}
