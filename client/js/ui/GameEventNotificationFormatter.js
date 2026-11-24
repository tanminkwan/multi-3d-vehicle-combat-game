/**
 * 게임 이벤트 알림 포맷터 (순수 함수 모듈, SRP)
 * 서버에서 수신한 게임 이벤트와 현재 플레이어 컨텍스트를 기반으로
 * 화면에 표시할 토스트 알림({ message, type }) 또는 null(표시 생략)을 반환합니다.
 */

function findPlayerName(playerId, players) {
    if (!playerId || !Array.isArray(players)) return null;
    const found = players.find((p) => p && p.id === playerId);
    return found?.name || null;
}

/**
 * 게임 이벤트에 대한 알림 메시지와 타입을 결정합니다.
 * @param {string} eventType
 * @param {object} data
 * @param {{ myPlayerId?: string | null, players?: Array<{ id: string, name: string }> }} [context]
 * @returns {{ message: string, type: 'success' | 'warning' | 'error' | 'info' } | null}
 */
export function formatGameEventNotification(eventType, data = {}, context = {}) {
    const { myPlayerId = null, players = [] } = context;

    switch (eventType) {
        case 'gameStarted':
            return { message: '게임이 시작되었습니다!', type: 'success' };

        case 'gameEnded':
            return { message: '게임이 종료되었습니다.', type: 'info' };

        case 'vehicleDestroyed': {
            if (!data) return null;
            const victimId = data.playerId ?? null;
            const killerId = data.killedBy ?? data.destroyedBy ?? null;
            const victimName = data.playerName || findPlayerName(victimId, players) || '알 수 없는 플레이어';
            const killerName = data.killerName || (killerId ? findPlayerName(killerId, players) : null);

            let type = 'warning';
            if (myPlayerId && victimId === myPlayerId) {
                type = 'error';
            } else if (myPlayerId && killerId === myPlayerId && killerId !== victimId) {
                type = 'success';
            }

            if (killerName && killerId !== victimId) {
                return {
                    message: `${victimName}가 ${killerName}에게 격추되었습니다!`,
                    type
                };
            }

            return {
                message: `${victimName}가 추락했습니다!`,
                type
            };
        }

        case 'vehicleRespawned': {
            const respawnedPlayerId = data?.vehicle?.playerId ?? data?.playerId ?? null;
            if (!myPlayerId || respawnedPlayerId !== myPlayerId) {
                return null;
            }
            return { message: '차량이 리스폰되었습니다.', type: 'success' };
        }

        case 'billboardDestroyed':
            if (data && data.destroyedBy) {
                return { message: '광고판이 파괴되었습니다!', type: 'info' };
            }
            return null;

        default:
            return null;
    }
}
