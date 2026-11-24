/**
 * NPC 스폰 모드 전략 추상 기본 클래스 (OCP / LSP)
 * 새로운 NPC 운영 모드를 추가할 때 이 클래스를 상속하여 등록하면
 * NpcManager 코드를 수정하지 않고 확장할 수 있다.
 */
export class NpcSpawnStrategy {
    /**
     * 현재 유저 수와 정원 기준으로 유지해야 할 목표 NPC 수 계산
     * @param {number} humanCount
     * @param {number} maxPlayers
     * @param {object} npcConfig
     * @returns {number}
     */
    calculateTargetCount(humanCount, maxPlayers, npcConfig) {
        throw new Error('calculateTargetCount() must be implemented by subclass');
    }

    /**
     * 정원이 가득 찬 상태에서 신규 유저 입장을 위해 NPC를 제거할 수 있는지 여부
     * @param {object} npcConfig
     * @returns {boolean}
     */
    canEvictForHuman(npcConfig) {
        throw new Error('canEvictForHuman() must be implemented by subclass');
    }
}

/**
 * 꽉채우는 모드 ('fill'): 정원(maxPlayers)에서 남은 슬롯을 모두 NPC로 채움
 */
export class FillSpawnStrategy extends NpcSpawnStrategy {
    calculateTargetCount(humanCount, maxPlayers) {
        return Math.max(0, maxPlayers - humanCount);
    }

    canEvictForHuman() {
        return true;
    }
}

/**
 * 지정 개수 모드 ('fixed'): 설정된 fixedCount만큼 NPC 유지
 */
export class FixedSpawnStrategy extends NpcSpawnStrategy {
    calculateTargetCount(humanCount, maxPlayers, npcConfig) {
        const desired = Math.max(0, Math.min(npcConfig.fixedCount ?? 0, maxPlayers));
        if (npcConfig.prioritizeHumans !== false) {
            return Math.min(desired, Math.max(0, maxPlayers - humanCount));
        }
        return desired;
    }

    canEvictForHuman(npcConfig) {
        return npcConfig.prioritizeHumans !== false;
    }
}

/**
 * 기본 스폰 전략 레지스트리 생성
 * @returns {Map<string, NpcSpawnStrategy>}
 */
export function createDefaultSpawnStrategies() {
    return new Map([
        ['fill', new FillSpawnStrategy()],
        ['fixed', new FixedSpawnStrategy()]
    ]);
}
