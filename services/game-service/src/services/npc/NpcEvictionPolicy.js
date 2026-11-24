/**
 * NPC 제거 대상 선정 정책 전담 클래스 (SRP / OCP)
 * 우선순위:
 * 1) 파괴되어 리스폰 대기 중 (!vehicle.active)
 * 2) 최근 교전/피격 이력이 없는 NPC
 * 3) 가장 먼저 생성된 NPC
 */
export class NpcEvictionPolicy {
    constructor(engagedWindowMs = 5000) {
        this.engagedWindowMs = engagedWindowMs;
    }

    selectVictim(controllers, getPlayerVehicle, now) {
        if (!controllers || controllers.size === 0) return null;

        const candidates = [];
        for (const [npcId, entry] of controllers.entries()) {
            const vehicle = getPlayerVehicle(npcId);
            const isInactive = !vehicle || !vehicle.active;
            const lastHitAt = entry.controller?.lastHitAt || 0;
            const recentlyEngaged = lastHitAt > 0 && (now - lastHitAt) < this.engagedWindowMs;

            let priorityRank = 2;
            if (isInactive) {
                priorityRank = 0;
            } else if (!recentlyEngaged) {
                priorityRank = 1;
            }

            candidates.push({ npcId, priorityRank, createdAt: entry.createdAt });
        }

        candidates.sort((a, b) => {
            if (a.priorityRank !== b.priorityRank) return a.priorityRank - b.priorityRank;
            return a.createdAt - b.createdAt;
        });

        return candidates[0]?.npcId || null;
    }
}
