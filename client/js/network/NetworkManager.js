/**
 * 네트워크 관리자 클래스
 * Socket.IO 통신, 게임 이벤트 처리, 입력 전송을 담당
 */
export class NetworkManager {
    constructor(socket, config) {
        this.socket = socket;
        this.config = config;
        
        // 입력 전송 관리
        this.lastInputSend = 0;
        this.inputSendRate = this.config?.client?.inputSendRate || 60; // Hz
        
        // 콜백 함수들 (GameClient에서 설정)
        this.callbacks = {
            onGameStateUpdate: null,
            onBulletCreated: null,
            onMuzzleFlash: null,
            onBulletDestroyed: null,
            onExplosionCreated: null,
            onExplosionDestroyed: null,
            onBulletHoleCreated: null,
            onBillboardDestroyed: null,
            onVehicleDestroyed: null,
            onVehicleRespawned: null,
            onGameStarted: null,
            onGameEnded: null,
            onMissileLaunched: null,
            onGiftBoxDestroyed: null,
            onPlayerNotification: null
        };
        
        // 등록한 소켓 리스너 추적 (로비 리스너를 보존하면서 게임 리스너만 해제하기 위함)
        this.boundSocketListeners = [];

        this.setupSocketListeners();
    }
    
    /**
     * 소켓 이벤트 리스너 등록 헬퍼
     */
    registerSocketListener(eventName, handler) {
        this.socket.on(eventName, handler);
        this.boundSocketListeners.push({ eventName, handler });
    }

    /**
     * 소켓 이벤트 리스너 설정
     */
    setupSocketListeners() {
        const mappings = [
            ['gameStateUpdate', 'onGameStateUpdate'],
            ['bulletCreated', 'onBulletCreated'],
            ['muzzleFlash', 'onMuzzleFlash'],
            ['missileLaunched', 'onMissileLaunched'],
            ['bulletDestroyed', 'onBulletDestroyed'],
            ['explosionCreated', 'onExplosionCreated'],
            ['explosionDestroyed', 'onExplosionDestroyed'],
            ['bulletHoleCreated', 'onBulletHoleCreated'],
            ['billboardDestroyed', 'onBillboardDestroyed'],
            ['giftBoxDestroyed', 'onGiftBoxDestroyed'],
            ['vehicleDestroyed', 'onVehicleDestroyed'],
            ['vehicleRespawned', 'onVehicleRespawned'],
            ['playerNotification', 'onPlayerNotification'],
            ['gameStarted', 'onGameStarted'],
            ['gameEnded', 'onGameEnded']
        ];

        for (const [eventName, callbackKey] of mappings) {
            this.registerSocketListener(eventName, (data) => {
                if (this.callbacks[callbackKey]) {
                    this.callbacks[callbackKey](data);
                }
            });
        }
    }
    
    /**
     * 입력을 서버로 전송
     */
    sendInputs(inputs) {
        const now = Date.now();
        if (now - this.lastInputSend < 1000 / this.inputSendRate) {
            return false; // 전송하지 않음
        }
        
        // 입력이 있을 때만 전송하거나 주기적으로 전송
        const hasInput = Object.values(inputs).some(val => val !== 0 && val !== false);
        
        if (hasInput || (now - this.lastInputSend) > 100) { // 최소 100ms마다 전송
            this.socket.emit('playerInput', inputs);
            this.lastInputSend = now;
            return true; // 전송됨
        }
        
        return false; // 전송하지 않음
    }
    
    /**
     * 콜백 함수 설정
     */
    setCallback(eventName, callback) {
        if (this.callbacks.hasOwnProperty(eventName)) {
            this.callbacks[eventName] = callback;
        } else {
            console.warn(`Unknown network callback: ${eventName}`);
        }
    }
    
    /**
     * 여러 콜백 함수를 한 번에 설정
     */
    setCallbacks(callbackMap) {
        Object.keys(callbackMap).forEach(eventName => {
            this.setCallback(eventName, callbackMap[eventName]);
        });
    }
    
    /**
     * 소켓 연결 상태 확인
     */
    isConnected() {
        return this.socket && this.socket.connected;
    }
    
    /**
     * 소켓 연결 해제
     */
    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
        }
    }
    
    /**
     * 정리 작업 (NetworkManager가 등록한 게임 리스너만 해제하여 로비 리스너 보존)
     */
    cleanup() {
        if (this.socket) {
            for (const { eventName, handler } of this.boundSocketListeners) {
                this.socket.off(eventName, handler);
            }
        }
        this.boundSocketListeners = [];
        
        // 콜백 초기화
        Object.keys(this.callbacks).forEach(key => {
            this.callbacks[key] = null;
        });
    }
} 