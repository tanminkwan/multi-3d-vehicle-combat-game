import { v4 as uuidv4 } from 'uuid';
import { NpcController } from '../ai/NpcController.js';
import { createDefaultSpawnStrategies } from './npc/NpcSpawnStrategy.js';
import { NpcConfigManager } from './npc/NpcConfigManager.js';
import { NpcEvictionPolicy } from './npc/NpcEvictionPolicy.js';

/**
 * NPC 생명주기 및 AI 틱 오케스트레이터 (SRP / OCP / LSP / ISP / DIP)
 *
 * - 구체 GameManager에 의존하지 않고 최소한의 포트 인터페이스(worldPort)만 주입받는다 (ISP / DIP).
 * - 모드 계산은 NpcSpawnStrategy에 위임한다 (OCP / LSP).
 * - 설정 검증/관리는 NpcConfigManager에 위임한다 (SRP).
 * - 제거 대상 선정은 NpcEvictionPolicy에 위임한다 (SRP / OCP).
 * - 컨트롤러 생성은 controllerFactory에 위임한다 (DIP / LSP).
 */
export class NpcManager {
    /**
     * @param {object} config - 전체 게임 설정 객체
     * @param {object} worldPort - 최소화된 게임 월드 포트 인터페이스
     * @param {object} [deps] - 선택적 의존성 주입 (전략, 정책, 설정 매니저, 팩토리, 시계/난수)
     */
    constructor(config, worldPort, deps = {}) {
        this.gameConfig = config;
        this.worldPort = worldPort;
        this.maxPlayers = config.game?.maxPlayers ?? 8;

        this.nowFn = deps.now || (() => Date.now());
        this.randomFn = deps.random || (() => Math.random());

        this.strategies = deps.strategies || createDefaultSpawnStrategies();
        this.configManager = deps.configManager || new NpcConfigManager(
            config,
            Array.from(this.strategies.keys()),
            { random: this.randomFn }
        );
        this.evictionPolicy = deps.evictionPolicy || new NpcEvictionPolicy();
        this.controllerFactory = deps.controllerFactory || ((npcId, difficulty, profile, worldConfig) => (
            new NpcController(npcId, difficulty, profile, worldConfig, {
                now: this.nowFn,
                random: this.randomFn
            })
        ));

        /** @type {Map<string, { controller: object, number: number, createdAt: number, difficulty: string }>} */
        this.controllers = new Map();
        this.usedNumbers = new Set();
    }

    /**
     * 신규 NPC 스폰 모드 전략 등록 (OCP)
     * @param {string} modeName
     * @param {import('./npc/NpcSpawnStrategy.js').NpcSpawnStrategy} strategy
     */
    registerStrategy(modeName, strategy) {
        this.strategies.set(modeName, strategy);
        this.configManager.registerMode(modeName);
    }

    getActiveStrategy() {
        const mode = this.configManager.config.mode;
        return this.strategies.get(mode) || this.strategies.values().next().value;
    }

    calculateTargetNpcCount(humanCount) {
        const cfg = this.configManager.config;
        if (!cfg.enabled) return 0;
        if (humanCount <= 0 && !cfg.keepAliveWhenEmpty) return 0;

        const strategy = this.getActiveStrategy();
        return strategy.calculateTargetCount(humanCount, this.maxPlayers, cfg);
    }

    /**
     * 유저 입장 직전 호출: 정원이 가득 찬 경우 전략과 제거 정책에 따라 NPC 1명 제거
     */
    makeRoomForHuman() {
        if (this.worldPort.getTotalPlayerCount() < this.maxPlayers) return false;
        if (this.controllers.size === 0) return false;

        const strategy = this.getActiveStrategy();
        if (!strategy.canEvictForHuman(this.configManager.config)) {
            return false;
        }

        const victimId = this.selectNpcToRemove();
        if (!victimId) return false;

        return this.removeNpc(victimId);
    }

    reconcile() {
        const humanCount = this.worldPort.getHumanCount();
        const targetCount = this.calculateTargetNpcCount(humanCount);

        while (this.controllers.size > targetCount) {
            const victimId = this.selectNpcToRemove();
            if (!victimId) break;
            this.removeNpc(victimId);
        }

        while (this.controllers.size < targetCount) {
            const spawned = this.spawnNpc();
            if (!spawned) break;
        }
    }

    spawnNpc() {
        const number = this.allocateNpcNumber();
        const npcId = `npc_${number}_${uuidv4().slice(0, 8)}`;
        const name = `${this.configManager.config.namePrefix}${number}`;
        const vehicleType = this.configManager.pickVehicleType();
        const difficulty = this.configManager.pickDifficulty();
        const profile = this.configManager.getDifficultyProfile(difficulty);

        const result = this.worldPort.addNpcPlayer(npcId, name, vehicleType, difficulty);
        if (!result || !result.success) {
            this.releaseNpcNumber(number);
            return null;
        }

        const controller = this.controllerFactory(npcId, difficulty, profile, this.gameConfig.world);
        this.controllers.set(npcId, {
            controller,
            number,
            difficulty,
            createdAt: this.nowFn()
        });

        return npcId;
    }

    removeNpc(npcId) {
        const entry = this.controllers.get(npcId);
        if (!entry) return false;

        this.controllers.delete(npcId);
        this.releaseNpcNumber(entry.number);
        this.worldPort.removeNpcPlayer(npcId);
        return true;
    }

    selectNpcToRemove() {
        return this.evictionPolicy.selectVictim(
            this.controllers,
            (id) => this.worldPort.getPlayerVehicle(id),
            this.nowFn()
        );
    }

    update(deltaTime, nowOverride = null) {
        if (this.controllers.size === 0) return;

        const humanCount = this.worldPort.getHumanCount();
        if (humanCount <= 0 && !this.configManager.config.keepAliveWhenEmpty) return;

        const now = nowOverride ?? this.nowFn();
        const allVehicles = this.worldPort.getAllVehicles();
        const billboards = this.worldPort.getBillboards();
        const terrainManager = this.worldPort.getTerrainManager();

        for (const [npcId, entry] of this.controllers.entries()) {
            const selfPlayer = this.worldPort.getPlayer(npcId);
            const selfVehicle = this.worldPort.getPlayerVehicle(npcId);
            if (!selfPlayer || !selfVehicle) continue;

            const inputs = entry.controller.update(deltaTime, {
                selfPlayer,
                selfVehicle,
                allVehicles,
                billboards,
                terrainManager,
                now
            });

            this.worldPort.handleNpcInput(npcId, inputs);
        }
    }

    notifyNpcHit(npcId, attackerId, nowOverride = null) {
        const entry = this.controllers.get(npcId);
        if (entry) {
            entry.controller.onHit(attackerId, nowOverride ?? this.nowFn());
        }
    }

    updateConfig(patch) {
        const applied = this.configManager.applyPatch(patch);
        if (!applied.success) {
            return { success: false, errors: applied.errors };
        }

        if (applied.difficultyChanged || applied.profilesChanged) {
            for (const [npcId, entry] of this.controllers.entries()) {
                const nextDifficulty = applied.difficultyChanged
                    ? this.configManager.pickDifficulty()
                    : entry.difficulty;
                const nextProfile = this.configManager.getDifficultyProfile(nextDifficulty);
                entry.difficulty = nextDifficulty;
                entry.controller.setProfile(nextDifficulty, nextProfile);

                const player = this.worldPort.getPlayer(npcId);
                if (player) {
                    player.difficulty = nextDifficulty;
                }
            }
        }

        this.reconcile();
        this.worldPort.syncGameState();

        return {
            success: true,
            ...this.getStatus()
        };
    }

    getStatus() {
        const activeNpcs = [];
        const prefix = this.configManager.config.namePrefix;
        for (const [npcId, entry] of this.controllers.entries()) {
            const player = this.worldPort.getPlayer(npcId);
            activeNpcs.push({
                id: npcId,
                name: player?.name || `${prefix}${entry.number}`,
                vehicleType: player?.vehicleType || 'fighter',
                difficulty: entry.difficulty,
                state: entry.controller.state
            });
        }

        const human = this.worldPort.getHumanCount();
        const npc = this.worldPort.getNpcCount();

        return {
            config: this.configManager.getConfig(),
            activeNpcs,
            counts: {
                human,
                npc,
                total: human + npc,
                maxPlayers: this.maxPlayers
            }
        };
    }

    allocateNpcNumber() {
        let n = 1;
        while (this.usedNumbers.has(n)) {
            n++;
        }
        this.usedNumbers.add(n);
        return n;
    }

    releaseNpcNumber(number) {
        this.usedNumbers.delete(number);
    }
}
