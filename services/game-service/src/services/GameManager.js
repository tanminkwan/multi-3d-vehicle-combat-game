import { EventEmitter } from 'events';
import { PlayerManager } from './PlayerManager.js';
import { VehicleManager } from './VehicleManager.js';
import { CollisionSystem } from './CollisionSystem.js';
import { GameStateManager } from './GameStateManager.js';
import { EffectSystem } from './EffectSystem.js';
import { WeaponSystem } from './WeaponSystem.js';
import { PerformanceMonitor } from './PerformanceMonitor.js';
import { TerrainManager } from './TerrainManager.js';
import { VehicleFactory } from './VehicleFactory.js';
import { BillboardManager } from './BillboardManager.js';
import { TargetingManager } from './TargetingManager.js';
import { GiftBoxManager } from './GiftBoxManager.js';
import { NpcManager } from './NpcManager.js';
import { defaultOnPlayerLeave, createSafeLeaveInvoker } from './hooks/PlayerLeaveCallback.js';

/**
 * 게임의 모든 시스템을 총괄하고 오케스트레이션하는 최상위 클래스
 */
export default class GameManager {
    constructor(config, eventEmitter, options = {}) {
        this.config = config;
        this.eventEmitter = eventEmitter;
        
        // 시스템들 (Dependency Injection)
        this.playerManager = new PlayerManager(config, eventEmitter);
        this.terrainManager = new TerrainManager(config);
        this.vehicleFactory = new VehicleFactory(config);
        this.vehicleManager = new VehicleManager(config, eventEmitter, this.vehicleFactory, this.terrainManager);
        this.weaponSystem = new WeaponSystem(config);
        this.effectSystem = new EffectSystem(eventEmitter);
        this.collisionSystem = new CollisionSystem(config, eventEmitter, this.weaponSystem);
        this.gameStateManager = new GameStateManager(config, eventEmitter);
        this.billboardManager = new BillboardManager(config, this.terrainManager);
        this.giftBoxManager = new GiftBoxManager(config);
        this.targetingManager = new TargetingManager(config, (x, z) => this.terrainManager.getTerrainHeight(x, z));
        this.performanceMonitor = new PerformanceMonitor(config);
        this.npcManager = new NpcManager(config, this.createNpcWorldPort(), options.npcDeps);

        // 리스폰 타이머 관리 (플레이어/NPC 제거 시 유령 리스폰 방지)
        this.respawnTimers = new Map();

        // 플레이어 퇴장 확장용 콜백 (기본값: 빈 no-op 콜백)
        this.invokePlayerLeave = createSafeLeaveInvoker(options.onPlayerLeave || defaultOnPlayerLeave);

        // 게임 루프
        this.lastUpdateTime = Date.now();
        this.tickRate = config.server.tickRate;
        this.tickInterval = 1000 / this.tickRate;
        this.gameLoopTimer = null;

        // 이벤트 리스너 설정
        this.setupEventListeners();
        
        if (options.autoStartLoop !== false) {
            this.startGameLoop();
        }
    }

    /**
     * NpcManager에 주입할 최소화된 월드 포트 어댑터 생성 (ISP / DIP)
     */
    createNpcWorldPort() {
        return {
            getTotalPlayerCount: () => this.playerManager.getAllPlayers().length,
            getHumanCount: () => this.playerManager.getHumanCount(),
            getNpcCount: () => this.playerManager.getNpcCount(),
            getPlayer: (playerId) => this.playerManager.getPlayer(playerId),
            getPlayerVehicle: (playerId) => this.vehicleManager.getPlayerVehicle(playerId),
            getAllVehicles: () => this.vehicleManager.getAllVehicles(),
            getBillboards: () => this.billboardManager.getAllBillboards(),
            getTerrainManager: () => this.terrainManager,
            addNpcPlayer: (npcId, name, vehicleType, difficulty) => this.addNpcPlayer(npcId, name, vehicleType, difficulty),
            removeNpcPlayer: (npcId) => this.removeNpcPlayer(npcId),
            handleNpcInput: (npcId, inputs) => this.handlePlayerInput(npcId, inputs),
            syncGameState: () => this.syncGameState()
        };
    }

    /**
     * 이벤트 리스너 설정
     */
    setupEventListeners() {
        this.eventEmitter.on('vehicleHit', this.handleVehicleHit.bind(this));
        this.eventEmitter.on('billboardHit', this.handleBillboardHit.bind(this));
        this.eventEmitter.on('giftBoxHit', this.handleGiftBoxHit.bind(this));
        this.eventEmitter.on('vehicleBillboardCollision', (data) => this.effectSystem.createImpactEffect(data.position, 'collision'));
        this.eventEmitter.on('createEffect', (data) => this.effectSystem.createEffect(data));
    }

    /**
     * 플레이어(유저) 추가 오케스트레이션
     */
    addPlayer(playerId, playerName, vehicleType = 'fighter', options = {}) {
        const isNpc = Boolean(options.isNpc);

        // 실제 유저 입장 시 정원이 가득 찼다면 NPC 슬롯 확보
        if (!isNpc) {
            this.npcManager.makeRoomForHuman();
        }

        const playerResult = this.playerManager.addPlayer(playerId, playerName, vehicleType, options);
        if (!playerResult.success) {
            return { success: false, reason: playerResult.reason };
        }
        const { player } = playerResult;

        const vehicle = this.vehicleManager.createVehicleForPlayer(player.id, vehicleType, player.color);
        const vehicleConfig = this.config.vehicles[vehicleType] || this.config.vehicles.fighter;

        this.weaponSystem.equipWeapon(player.id, 'machinegun', {
            damage: vehicleConfig.bulletDamage,
            speed: vehicleConfig.bulletSpeed,
            range: vehicleConfig.bulletRange,
            cooldown: 1000 / vehicleConfig.fireRate
        });
        this.weaponSystem.equipWeapon(player.id, 'missile', {
            ammo: vehicleConfig.missileCount || 4,
            maxAmmo: vehicleConfig.missileCount || 4,
            reloadTime: (vehicleConfig.missileReloadTime || 25) * 1000
        });

        if (!isNpc) {
            this.gameStateManager.updatePlayerCount(this.playerManager.getHumanCount());
            this.npcManager.reconcile();
            this.syncGameState();
        }

        return { 
            success: true, 
            player: player,
            vehicle: vehicle.serialize(),
            weapons: this.weaponSystem.getPlayerWeapons(player.id)
        };
    }

    /**
     * NPC 플레이어 추가 (NpcManager 전용)
     */
    addNpcPlayer(npcId, npcName, vehicleType = 'fighter', difficulty = 'normal') {
        return this.addPlayer(npcId, npcName, vehicleType, { isNpc: true, difficulty });
    }

    /**
     * NPC 플레이어 제거 (NpcManager 전용)
     */
    removeNpcPlayer(npcId) {
        return this.removePlayer(npcId, { fromNpcManager: true });
    }

    /**
     * 플레이어 퇴장 콜백 교체 (OCP / DIP)
     */
    setOnPlayerLeave(callback) {
        this.invokePlayerLeave = createSafeLeaveInvoker(callback);
    }

    /**
     * 플레이어 제거 오케스트레이션 (멱등성 보장)
     */
    removePlayer(playerId, options = {}) {
        // 진행 중인 리스폰 타이머 취소 (유령 리스폰 방지)
        const pendingTimer = this.respawnTimers.get(playerId);
        if (pendingTimer) {
            clearTimeout(pendingTimer);
            this.respawnTimers.delete(playerId);
        }

        const existingPlayer = this.playerManager.getPlayer(playerId);
        if (!existingPlayer) {
            return false;
        }
        const wasNpc = Boolean(existingPlayer.isNpc);

        this.vehicleManager.removeVehicleForPlayer(playerId);
        this.weaponSystem.removePlayerWeapons(playerId);
        this.playerManager.removePlayer(playerId);

        if (!wasNpc && !options.fromNpcManager) {
            const leftAt = Date.now();
            const leaveContext = {
                playerId: existingPlayer.id,
                userId: options.userId || null,
                username: options.username || existingPlayer.name,
                reason: options.reason || 'disconnect',
                vehicleType: existingPlayer.vehicleType,
                stats: {
                    score: existingPlayer.score || 0,
                    kills: existingPlayer.kills || 0,
                    deaths: existingPlayer.deaths || 0
                },
                joinedAt: existingPlayer.joinedAt,
                leftAt,
                playTimeMs: Math.max(0, leftAt - (existingPlayer.joinedAt || leftAt))
            };
            this.invokePlayerLeave(leaveContext);

            this.npcManager.reconcile();
            this.gameStateManager.updatePlayerCount(this.playerManager.getHumanCount());
            this.syncGameState();
        }
        return true;
    }

    /**
     * 플레이어 입력 처리
     */
    handlePlayerInput(playerId, inputs) {
        const vehicle = this.vehicleManager.getPlayerVehicle(playerId);
        if (!vehicle) return;

        vehicle.handleInput(inputs);

        if (inputs.fire) {
            const projectile = this.weaponSystem.fireWeapon(playerId, 'machinegun', vehicle.position, vehicle.rotation, this.vehicleManager.getAllVehicles());
            if (projectile) {
                this.effectSystem.createMuzzleFlash(playerId, vehicle.position, vehicle.rotation);
                this.eventEmitter.emit('muzzleFlash', { playerId: playerId, vehicleId: vehicle.id });
            }
        }
        
        if (inputs.fireMissile) {
            const player = this.playerManager.getPlayer(playerId);
            let targetId = (player?.lockOnState?.isLocked && player.lockOnTargetId) ? player.lockOnTargetId : null;
            
            if (targetId) {
                const missile = this.weaponSystem.fireWeapon(playerId, 'missile', vehicle.position, vehicle.rotation, this.vehicleManager.getAllVehicles(), targetId);
                if (missile) {
                    this.eventEmitter.emit('missileLaunched', {
                        playerId: playerId, vehicleId: vehicle.id, missileId: missile.id, targetId: targetId
                    });
                }
            }
        }
    }

    /**
     * 게임 루프 시작
     */
    startGameLoop() {
        if (this.gameLoopTimer) return;
        this.gameLoopTimer = setInterval(() => this.update(), this.tickInterval);
    }

    /**
     * 게임 루프 및 대기 타이머 정지
     */
    stopGameLoop() {
        if (this.gameLoopTimer) {
            clearInterval(this.gameLoopTimer);
            this.gameLoopTimer = null;
        }
        if (this.performanceMonitor?.stopMonitoring) {
            this.performanceMonitor.stopMonitoring();
        }
        for (const timer of this.respawnTimers.values()) {
            clearTimeout(timer);
        }
        this.respawnTimers.clear();
    }

    /**
     * 게임 업데이트
     */
    update(fixedDeltaTime = null, nowOverride = null) {
        const now = nowOverride ?? Date.now();
        const deltaTime = fixedDeltaTime !== null ? fixedDeltaTime : (now - this.lastUpdateTime) / 1000;
        this.lastUpdateTime = now;

        if (this.gameStateManager.getGameState() === 'playing') {
            this.npcManager.update(deltaTime, now);
            this.vehicleManager.update(deltaTime);
            this.updatePlayerTargetsAndLockOn(deltaTime);
            this.weaponSystem.updateProjectiles(deltaTime, this.vehicleManager.getAllVehicles());
            this.effectSystem.update(deltaTime);
            
            const vehicles = this.vehicleManager.getAllVehicles();
            const billboards = this.billboardManager.getAllBillboards();
            const giftBoxes = this.giftBoxManager.getAllGiftBoxes();

            // Collision Detection
            const projectileCollisions = this.weaponSystem.checkCollisions(vehicles, billboards, giftBoxes);
            for (const collision of projectileCollisions) {
                this.collisionSystem.handleProjectileCollision(collision);
            }
            this.collisionSystem.update(vehicles, billboards);
        }

        this.syncGameState();
    }

    getNpcStatus() {
        return this.npcManager.getStatus();
    }

    updateNpcConfig(patch) {
        return this.npcManager.updateConfig(patch);
    }

    updatePlayerTargetsAndLockOn(deltaTime) {
        for (const player of this.playerManager.getAllPlayers()) {
            const playerVehicle = this.vehicleManager.getPlayerVehicle(player.id);
            if (!playerVehicle) continue;
            const enemies = this.vehicleManager.getAllVehicles().filter(v => v.playerId !== player.id && v.active);
            this.targetingManager.update(player, playerVehicle, enemies, deltaTime);
        }
    }

    handleVehicleHit(collision) {
        const vehicle = this.vehicleManager.getVehicle(collision.targetId);
        if (!vehicle || !vehicle.active) return;

        // 리스폰 무적 시간 중에는 타격을 받지 않음
        if (vehicle.isInvulnerable()) return;

        // NPC 피격 시 회피 반응 예약
        this.npcManager.notifyNpcHit(vehicle.playerId, collision.ownerId);

        if (vehicle.takeDamage(collision.damage)) {
            this.handleVehicleDestroyed(vehicle, collision);
        } else {
            const { explosionRadiusSmall, explosionDurationSmall, explosionIntensitySmall } = this.config.collision;
            this.effectSystem.createExplosion(vehicle.position, explosionRadiusSmall, explosionDurationSmall, explosionIntensitySmall);
        }
    }

    handleBillboardHit(collision) {
        const billboard = this.billboardManager.getBillboard(collision.targetId);
        if (!billboard) return;
        billboard.addBulletHole(collision.position, collision.damage);
        if (billboard.takeDamage(collision.damage)) {
            this.handleBillboardDestroyed(billboard, collision);
        } else {
            this.effectSystem.createImpactEffect(collision.position, 'billboard');
        }
    }

    handleGiftBoxHit(collision) {
        const giftBox = this.giftBoxManager.getGiftBox(collision.targetId);
        if (!giftBox || !giftBox.active) return;

        // 미사일은 선물 상자에 데미지를 줄 수 없음 (게임 디자인 결정사항)
        if (collision.projectileType === 'missile') return;

        if (giftBox.takeDamage(collision.damage)) {
            this.handleGiftBoxDestroyed(giftBox, collision);
        } else {
            this.effectSystem.createImpactEffect(collision.position, 'giftbox');
        }
    }

    handleBillboardDestroyed(billboard, collision) {
        const { explosionRadius, explosionDuration, explosionIntensity } = this.config.billboards.destruction;
        this.effectSystem.createExplosion(billboard.position, explosionRadius, explosionDuration, explosionIntensity);
        const debrisData = billboard.getDebrisData();
        if (debrisData) {
            this.eventEmitter.emit('billboardDestroyed', {
                billboardId: billboard.id,
                debris: debrisData,
                destroyedBy: collision.ownerId || 'unknown'
            });
        }
        this.billboardManager.removeBillboard(billboard.id);
        this.playerManager.updatePlayerStats(billboard.playerId, collision.ownerId);
    }

    handleGiftBoxDestroyed(giftBox, collision) {
        const ownerId = collision.ownerId;
        if (!ownerId) return;

        // 1. 폭발 효과 생성
        const { explosionRadius, explosionDuration, explosionIntensity } = this.config.giftBoxes.destruction;
        this.effectSystem.createExplosion(giftBox.position, explosionRadius, explosionDuration, explosionIntensity);

        // 2. 보상 지급
        const rewards = this.config.giftBoxes.rewards;
        this.weaponSystem.addMissileAmmo(ownerId, rewards.missiles);
        this.playerManager.addScore(ownerId, rewards.score);

        // 3. 파괴 이벤트 전송 (클라이언트에서 모델 제거용)
        this.eventEmitter.emit('giftBoxDestroyed', {
            giftBoxId: giftBox.id,
            destroyedBy: ownerId
        });

        // 4. 기존 상자 제거 및 새 상자 스폰
        this.giftBoxManager.destroyAndRespawn(giftBox.id);

        // 5. 파괴한 플레이어에게 알림
        const player = this.playerManager.getPlayer(ownerId);
        if(player) {
            this.eventEmitter.emit('playerNotification', {
                playerId: ownerId,
                message: `선물 상자 파괴! 미사일 +${rewards.missiles}, 점수 +${rewards.score}`
            });
        }
    }

    handleVehicleDestroyed(vehicle, collision) {
        if (!vehicle) return;
        vehicle.active = false;
        this.eventEmitter.emit('vehicleDestroyed', {
            vehicleId: vehicle.id, playerId: vehicle.playerId, killedBy: collision.ownerId || null,
            position: vehicle.position, shouldHide: true
        });
        const { explosionRadiusLarge, explosionDurationLarge, explosionIntensityLarge } = this.config.collision;
        this.effectSystem.createExplosion(vehicle.position, explosionRadiusLarge, explosionDurationLarge, explosionIntensityLarge);
        this.playerManager.updatePlayerStats(vehicle.playerId, collision.ownerId);

        const existingTimer = this.respawnTimers.get(vehicle.playerId);
        if (existingTimer) {
            clearTimeout(existingTimer);
        }
        const respawnTimer = setTimeout(() => {
            this.respawnTimers.delete(vehicle.playerId);
            if (this.playerManager.getPlayer(vehicle.playerId) && this.vehicleManager.getVehicle(vehicle.id)) {
                this.vehicleManager.respawnVehicle(vehicle);
            }
        }, this.config.game.respawnTime || 5000);
        this.respawnTimers.set(vehicle.playerId, respawnTimer);

        this.syncGameState();
    }

    syncGameState() {
        const gameState = this.getGameState();
        this.eventEmitter.emit('gameStateUpdate', gameState);
    }

    getGameState() {
        return {
            vehicles: this.vehicleManager.getAllVehicles().filter(v => v.active).map(v => v.serialize()),
            players: this.playerManager.getAllPlayers().map(p => ({
                ...p,
                weapons: this.weaponSystem.getPlayerWeapons(p.id)
            })),
            billboards: Array.from(this.billboardManager.getAllBillboards().values()).map(b => b.serialize()),
            giftBoxes: this.giftBoxManager.getAllGiftBoxes().map(gb => gb.serialize()),
            projectiles: this.weaponSystem.getAllProjectiles().map(p => p.serialize()),
            effects: this.effectSystem.serialize(),
            gameState: this.gameStateManager.getGameState(),
            timestamp: Date.now()
        };
    }
} 