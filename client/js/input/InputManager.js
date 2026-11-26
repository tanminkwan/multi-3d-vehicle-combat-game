/**
 * 입력 관리자 클래스
 * 키보드, 마우스 입력을 처리하고 게임 입력 상태를 관리
 */
export class InputManager {
    constructor(options = {}) {
        // 입력 상태 - 원래 게임과 동일
        this.keys = {};
        this.mouseX = 0;
        this.mouseY = 0;
        this.moveMouseButton = options.moveMouseButton ?? 2; // 기본 우클릭 이동
        this.allowFirstPersonMouseFlight = options.allowFirstPersonMouseFlight !== false;
        this.usePointerLockInFirstPerson = options.usePointerLockInFirstPerson === true;
        this.inputs = {
            thrust: 0,
            pitch: 0,
            yaw: 0,
            roll: 0,
            vertical: 0,
            fire: false,
            fireMissile: false, // 미사일 발사 입력 추가
            targetId: null      // 타겟 ID (2단계에서는 사용하지 않음)
        };
        
        // 시점 상태
        this.isFirstPerson = false;
        
        // 콜백 함수들
        this.onFirstPersonToggle = null;
        this.onMoveClick = null;
        
        // CameraManager 참조
        this.cameraManager = null;
        
        // 이벤트 리스너들을 저장 (cleanup용)
        this.eventListeners = [];
        
        this.setupEventListeners();
    }
    
    /**
     * 이벤트 리스너 설정
     */
    setupEventListeners() {
        // 키보드 이벤트
        const keydownHandler = (e) => {
            this.keys[e.code] = true;
            
            // 시점 전환 (V키)
            if (e.code === 'KeyV') {
                this.toggleFirstPerson();
            }
            
            // 발사 (P키) - 한 번만 발사 (마우스와 동일한 방식)
            if (e.code === 'KeyP') {
                this.inputs.fire = true;
            }
            
            // 미사일 발사 (M키)
            if (e.code === 'KeyM') {
                this.inputs.fireMissile = true;
            }
            
            // 기본 동작 방지 (스페이스바 스크롤 등)
            if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
                e.preventDefault();
            }
        };
        
        const keyupHandler = (e) => {
            this.keys[e.code] = false;
            
            // 발사 (P키) - 키를 뗄 때 false로 설정
            if (e.code === 'KeyP') {
                this.inputs.fire = false;
            }
            
            // 미사일 발사 (M키) - 키를 뗄 때 false로 설정
            if (e.code === 'KeyM') {
                this.inputs.fireMissile = false;
            }
            
            // 기본 동작 방지
            if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
                e.preventDefault();
            }
        };
        
        // 마우스 이벤트 (1인칭 시점용)
        const mousemoveHandler = (e) => {
            if (this.isFirstPerson && document.pointerLockElement) {
                this.mouseX += e.movementX * 0.002;
                this.mouseY += e.movementY * 0.002;
                this.mouseY = Math.max(-Math.PI/2, Math.min(Math.PI/2, this.mouseY));
            }
        };
        
        const mousedownHandler = (e) => {
            const canvas = document.getElementById('gameCanvas');
            const isOnCanvas = canvas && e.target === canvas;

            if (e.button === 0 && isOnCanvas) { // 좌클릭: 기존 기관총 발사 유지 (UI 버튼 클릭 제외)
                this.inputs.fire = true;
            } else if (e.button === this.moveMouseButton && isOnCanvas && (!this.isFirstPerson || this.allowFirstPersonMouseFlight)) {
                // 우클릭: 클릭한 3D 공간으로 이동 (1인칭 시점 포함)
                e.preventDefault();
                if (this.onMoveClick) {
                    const rect = canvas.getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 0) {
                        const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
                        const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
                        this.onMoveClick({ ndcX, ndcY, clientX: e.clientX, clientY: e.clientY });
                    }
                }
            }
        };
        
        const mouseupHandler = (e) => {
            if (e.button === 0) {
                this.inputs.fire = false;
            }
        };

        const contextmenuHandler = (e) => {
            const canvas = document.getElementById('gameCanvas');
            if (canvas && e.target === canvas) {
                e.preventDefault();
            }
        };
        
        // 이벤트 리스너 등록
        document.addEventListener('keydown', keydownHandler);
        document.addEventListener('keyup', keyupHandler);
        document.addEventListener('mousemove', mousemoveHandler);
        document.addEventListener('mousedown', mousedownHandler);
        document.addEventListener('mouseup', mouseupHandler);
        document.addEventListener('contextmenu', contextmenuHandler);
        
        // cleanup을 위해 저장
        this.eventListeners = [
            { element: document, event: 'keydown', handler: keydownHandler },
            { element: document, event: 'keyup', handler: keyupHandler },
            { element: document, event: 'mousemove', handler: mousemoveHandler },
            { element: document, event: 'mousedown', handler: mousedownHandler },
            { element: document, event: 'mouseup', handler: mouseupHandler },
            { element: document, event: 'contextmenu', handler: contextmenuHandler }
        ];
    }
    
    /**
     * 게임 캔버스에 포커스 설정
     */
    setupCanvasFocus() {
        const canvas = document.getElementById('gameCanvas');
        if (canvas) {
            canvas.setAttribute('tabindex', '0');
            canvas.focus();
            canvas.addEventListener('click', () => {
                canvas.focus();
            });
        }
    }
    
    /**
     * CameraManager 설정
     */
    setCameraManager(cameraManager) {
        this.cameraManager = cameraManager;
    }
    
    /**
     * 시점 전환
     */
    toggleFirstPerson() {
        this.isFirstPerson = !this.isFirstPerson;
        
        // CameraManager에 시점 전환 위임
        if (this.cameraManager) {
            this.cameraManager.toggleFirstPerson();
        } else {
            // CameraManager가 없는 경우 기본 처리
            if (this.isFirstPerson) {
                // 1인칭 시점으로 전환
                if (this.usePointerLockInFirstPerson && document.body?.requestPointerLock) {
                    document.body.requestPointerLock();
                }
            } else {
                // 3인칭 시점으로 전환
                if (document.pointerLockElement && document.exitPointerLock) {
                    document.exitPointerLock();
                }
                this.mouseX = 0;
                this.mouseY = 0;
            }
        }
        
        // 콜백 호출
        if (this.onFirstPersonToggle) {
            this.onFirstPersonToggle(this.isFirstPerson);
        }
    }
    
    /**
     * 입력 업데이트 - 원래 게임과 동일
     */
    updateInputs() {
        // 추력 (Shift: 가속, Ctrl: 감속)
        if (this.keys['ShiftLeft'] || this.keys['ShiftRight']) {
            this.inputs.thrust = 1;
        } else if (this.keys['ControlLeft'] || this.keys['ControlRight']) {
            this.inputs.thrust = -1;
        } else {
            this.inputs.thrust = 0;
        }
        
        // 피치 (W: 기수 상승, S: 기수 하강)
        if (this.keys['KeyW'] || this.keys['ArrowUp']) {
            this.inputs.pitch = 1; // W키: 위로 보기 (양수)
        } else if (this.keys['KeyS'] || this.keys['ArrowDown']) {
            this.inputs.pitch = -1; // S키: 아래로 보기 (음수)
        } else {
            this.inputs.pitch = 0;
        }
        
        // 요 (A: 우회전, D: 좌회전)
        if (this.keys['KeyA'] || this.keys['ArrowLeft']) {
            this.inputs.yaw = 1;
        } else if (this.keys['KeyD'] || this.keys['ArrowRight']) {
            this.inputs.yaw = -1;
        } else {
            this.inputs.yaw = 0;
        }
        
        // 롤 (Q: 좌롤, E: 우롤)
        if (this.keys['KeyQ']) {
            this.inputs.roll = -1;
        } else if (this.keys['KeyE']) {
            this.inputs.roll = 1;
        } else {
            this.inputs.roll = 0;
        }
        
        // 수직 이동 (Space: 상승, X: 하강)
        if (this.keys['Space']) {
            this.inputs.vertical = 1;
        } else if (this.keys['KeyX']) {
            this.inputs.vertical = -1;
        } else {
            this.inputs.vertical = 0;
        }
        
        // 발사는 keydown/keyup 이벤트에서 처리 (P키 연발 방지)
        // if (this.keys['KeyP']) {
        //     this.inputs.fire = true;
        // }
    }
    
    /**
     * 현재 입력 상태 반환
     */
    getInputs() {
        return { ...this.inputs };
    }
    
    /**
     * 마우스 위치 반환 (1인칭 시점용)
     */
    getMousePosition() {
        return { x: this.mouseX, y: this.mouseY };
    }
    
    /**
     * 시점 상태 반환
     */
    getFirstPersonState() {
        return this.isFirstPerson;
    }
    
    /**
     * 발사 입력 리셋 (네트워크 전송 후 호출)
     */
    resetFireInput() {
        this.inputs.fire = false;
        this.inputs.fireMissile = false; // 미사일 발사 입력도 리셋
    }
    
    /**
     * 부스터 활성화 상태 확인
     */
    isBoosterActive() {
        return this.inputs.thrust > 0; // Shift 키가 눌려있을 때 부스터 활성화
    }
    
    /**
     * 수동 비행 조종 키(WASD/방향키/Q/E/Space/X/Shift/Ctrl)가 눌려 있는지 여부 반환
     */
    hasManualFlightInput() {
        return Boolean(
            this.keys['KeyW'] || this.keys['KeyS'] || this.keys['ArrowUp'] || this.keys['ArrowDown'] ||
            this.keys['KeyA'] || this.keys['KeyD'] || this.keys['ArrowLeft'] || this.keys['ArrowRight'] ||
            this.keys['KeyQ'] || this.keys['KeyE'] ||
            this.keys['Space'] || this.keys['KeyX'] ||
            this.keys['ShiftLeft'] || this.keys['ShiftRight'] ||
            this.keys['ControlLeft'] || this.keys['ControlRight']
        );
    }

    /**
     * 콜백 함수 설정
     */
    setCallback(callbackName, callback) {
        if (callbackName === 'onFirstPersonToggle') {
            this.onFirstPersonToggle = callback;
        } else if (callbackName === 'onMoveClick') {
            this.onMoveClick = callback;
        }
    }
    
    /**
     * 정리 작업
     */
    cleanup() {
        // 이벤트 리스너 제거
        this.eventListeners.forEach(({ element, event, handler }) => {
            element.removeEventListener(event, handler);
        });
        this.eventListeners = [];
        
        // 포인터 락 해제
        if (document.pointerLockElement) {
            document.exitPointerLock();
        }
    }
} 