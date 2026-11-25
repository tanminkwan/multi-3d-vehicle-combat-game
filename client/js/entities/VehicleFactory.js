import * as THREE from 'three';
import { VEHICLE_DEFAULTS, MATERIAL_OPACITY, COCKPIT_COLOR, ROTATION_SETTINGS } from '../config/Constants.js';
import { resolveGraphicsConfig } from '../graphics/GraphicsPresetResolver.js';

/**
 * 비행체 팩토리 클래스
 * 비행체 타입별 3D 모델 생성을 담당
 * Factory Pattern을 사용하여 확장성 제공
 */
export class VehicleFactory {
    constructor(scene, config, graphicsDeps = {}) {
        this.scene = scene;
        this.config = config;
        this.graphicsConfig = graphicsDeps.graphicsConfig || resolveGraphicsConfig(config?.client);
        this.textureFactory = graphicsDeps.textureFactory || null;
        
        // 비행체 타입별 생성 함수 등록
        this.vehicleCreators = new Map();
        this.registerVehicleCreators();
    }

    /**
     * 비행체 동체/날개용 PBR 금속 패널 재질 생성 (SRP)
     */
    createBodyMaterial(color) {
        const palette = this.graphicsConfig.palette;
        const panelTextures = this.textureFactory ? this.textureFactory.getVehiclePanelTextures() : null;
        return new THREE.MeshStandardMaterial({
            color,
            map: panelTextures?.map || null,
            bumpMap: panelTextures?.bumpMap || null,
            bumpScale: palette.vehicleBumpScale ?? 0.08,
            metalness: palette.vehicleMetalness ?? 0.55,
            roughness: palette.vehicleRoughness ?? 0.35
        });
    }

    /**
     * 조종석 틴티드 글래스 PBR 재질 생성
     */
    createCockpitMaterial() {
        return new THREE.MeshStandardMaterial({
            color: COCKPIT_COLOR,
            transparent: true,
            opacity: 0.55,
            metalness: 0.2,
            roughness: 0.08
        });
    }
    
    /**
     * 비행체 생성 함수들 등록
     */
    registerVehicleCreators() {
        this.vehicleCreators.set('fighter', this.createFighterVehicleModel.bind(this));
        this.vehicleCreators.set('heavy', this.createHeavyVehicleModel.bind(this));
        this.vehicleCreators.set('biplane', this.createBiplaneVehicleModel.bind(this));
        this.vehicleCreators.set('test', this.createTestVehicleModel.bind(this));
    }
    
    /**
     * 비행체 생성 (메인 팩토리 메서드)
     */
    createVehicle(vehicleData, vehicles, myPlayer, cameraManager) {
        const vehicleGroup = new THREE.Group();
        
        // Three.js 회전 순서 설정 (중요!)
        vehicleGroup.rotation.order = ROTATION_SETTINGS.ORDER;
        
        // 비행체 타입에 따라 다른 모델 생성
        const vehicleType = vehicleData.vehicleType || 'fighter';
        const creator = this.vehicleCreators.get(vehicleType);
        
        if (creator) {
            creator(vehicleGroup, vehicleData);
        } else {
            console.warn(`Unknown vehicle type: ${vehicleType}, using fighter as default`);
            this.createFighterVehicleModel(vehicleGroup, vehicleData);
        }
        
        // 위치 설정
        vehicleGroup.position.set(
            vehicleData.position.x || 0,
            vehicleData.position.y || 50,
            vehicleData.position.z || 0
        );
        
        // 회전 설정 - 서버에서 받은 회전값을 그대로 적용
        vehicleGroup.rotation.x = vehicleData.rotation.x || 0; // 피치 (W/S)
        vehicleGroup.rotation.y = vehicleData.rotation.y || 0; // 요 (A/D)
        vehicleGroup.rotation.z = vehicleData.rotation.z || 0; // 롤 (Q/E)
        
        // 사용자 데이터 저장 - 기존 엔진 정보를 보존
        vehicleGroup.userData.vehicleData = vehicleData;
        
        vehicles.set(vehicleData.id, vehicleGroup);
        this.scene.add(vehicleGroup);
        
        // 내 비행체인 경우 CameraManager에 설정
        if (vehicleData.playerId === myPlayer.id && cameraManager) {
            cameraManager.setMyVehicle(vehicleGroup);
        }
        
        return vehicleGroup;
    }
    
    /**
     * 비행체 타입별 기본 설정 가져오기
     */
    getVehicleDefaults(vehicleType) {
        const typeKey = vehicleType.toUpperCase();
        return VEHICLE_DEFAULTS[typeKey] || VEHICLE_DEFAULTS.FIGHTER;
    }
    
    /**
     * 전투기 모델 생성
     */
    createFighterVehicleModel(vehicleGroup, vehicleData) {
        // config에서 모델 설정 가져오기 (폴백은 Constants에서)
        const defaults = this.getVehicleDefaults('fighter');
        const modelConfig = this.config?.vehicles?.fighter?.model || {};
        const scale = this.config?.vehicles?.fighter?.scale || defaults.scale;
        const engineColor = this.config?.vehicles?.fighter?.engineColor || defaults.engineColor;
        const glowColor = this.config?.vehicles?.fighter?.glowColor || defaults.glowColor;
        
        // 뾰족한 머리 (항상 앞쪽 +Z 방향)
        const headConfig = modelConfig.head || defaults.model.head;
        const headGeometry = new THREE.ConeGeometry(headConfig.radius * scale, headConfig.length * scale, 12);
        const headMaterial = this.createBodyMaterial(vehicleData.color);
        const head = new THREE.Mesh(headGeometry, headMaterial);
        head.rotation.x = Math.PI / 2; // 앞을 향하도록 회전
        head.position.z = 4 * scale; // 앞쪽에 위치
        head.castShadow = true;
        vehicleGroup.add(head);
        
        // 조종석 (틴티드 글래스 돔)
        const cockpitConfig = modelConfig.cockpit || defaults.model.cockpit;
        const cockpitGeometry = new THREE.SphereGeometry(cockpitConfig.radius * scale, 12, 10);
        const cockpitMaterial = this.createCockpitMaterial();
        const cockpit = new THREE.Mesh(cockpitGeometry, cockpitMaterial);
        cockpit.position.set(
            cockpitConfig.position.x * scale,
            cockpitConfig.position.y * scale,
            cockpitConfig.position.z * scale
        );
        vehicleGroup.add(cockpit);
        
        // 메인 바디
        const bodyConfig = modelConfig.body || defaults.model.body;
        const bodyGeometry = new THREE.BoxGeometry(
            bodyConfig.width * scale, 
            bodyConfig.height * scale, 
            bodyConfig.length * scale
        );
        const bodyMaterial = this.createBodyMaterial(vehicleData.color);
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.castShadow = true;
        vehicleGroup.add(body);
        
        // 날개 (좌우)
        const wingsConfig = modelConfig.wings || defaults.model.wings;
        const wingGeometry = new THREE.BoxGeometry(
            wingsConfig.width * scale, 
            wingsConfig.height * scale, 
            wingsConfig.length * scale
        );
        const wingMaterial = this.createBodyMaterial(vehicleData.color);
        const wings = new THREE.Mesh(wingGeometry, wingMaterial);
        wings.castShadow = true;
        vehicleGroup.add(wings);
        
        // 단일 엔진 글로우 (뒤쪽 파란 발광)
        const engineConfig = modelConfig.engine || defaults.model.engine;
        const engineGeometry = new THREE.CylinderGeometry(
            engineConfig.radius * scale, 
            engineConfig.radius * scale, 
            engineConfig.length * scale, 
            16
        );
        const engineMaterial = new THREE.MeshBasicMaterial({ 
            color: engineColor
        });
        const engine = new THREE.Mesh(engineGeometry, engineMaterial);
        engine.position.set(
            engineConfig.position.x * scale,
            engineConfig.position.y * scale,
            engineConfig.position.z * scale
        );
        engine.rotation.x = Math.PI / 2;
        vehicleGroup.add(engine);
        
        // 엔진 글로우 효과
        const glowConfig = modelConfig.glow || defaults.model.glow;
        const glowGeometry = new THREE.CylinderGeometry(
            glowConfig.radius * scale, 
            glowConfig.radius * scale, 
            glowConfig.length * scale, 
            16
        );
        const glowMaterial = new THREE.MeshBasicMaterial({
            color: glowColor,
            transparent: true,
            opacity: MATERIAL_OPACITY.FIGHTER_GLOW
        });
        const glow = new THREE.Mesh(glowGeometry, glowMaterial);
        glow.position.set(
            glowConfig.position.x * scale,
            glowConfig.position.y * scale,
            glowConfig.position.z * scale
        );
        glow.rotation.x = Math.PI / 2;
        vehicleGroup.add(glow);
        
        // 사용자 데이터에 엔진 정보 저장
        vehicleGroup.userData.engine = engine;
        vehicleGroup.userData.glow = glow;
    }
    
    /**
     * 중형기 모델 생성
     */
    createHeavyVehicleModel(vehicleGroup, vehicleData) {
        // config에서 모델 설정 가져오기 (폴백은 Constants에서)
        const defaults = this.getVehicleDefaults('heavy');
        const modelConfig = this.config?.vehicles?.heavy?.model || {};
        const scale = this.config?.vehicles?.heavy?.scale || defaults.scale;
        const engineColor = this.config?.vehicles?.heavy?.engineColor || defaults.engineColor;
        const glowColor = this.config?.vehicles?.heavy?.glowColor || defaults.glowColor;
        
        // 더 큰 뾰족한 머리
        const headConfig = modelConfig.head || defaults.model.head;
        const headGeometry = new THREE.ConeGeometry(headConfig.radius * scale, headConfig.length * scale, 12);
        const headMaterial = this.createBodyMaterial(vehicleData.color);
        const head = new THREE.Mesh(headGeometry, headMaterial);
        head.rotation.x = Math.PI / 2;
        head.position.z = 5 * scale;
        head.castShadow = true;
        vehicleGroup.add(head);
        
        // 더 큰 조종석
        const cockpitConfig = modelConfig.cockpit || defaults.model.cockpit;
        const cockpitGeometry = new THREE.SphereGeometry(cockpitConfig.radius * scale, 12, 10);
        const cockpitMaterial = this.createCockpitMaterial();
        const cockpit = new THREE.Mesh(cockpitGeometry, cockpitMaterial);
        cockpit.position.set(
            cockpitConfig.position.x * scale,
            cockpitConfig.position.y * scale,
            cockpitConfig.position.z * scale
        );
        vehicleGroup.add(cockpit);
        
        // 더 큰 메인 바디
        const bodyConfig = modelConfig.body || defaults.model.body;
        const bodyGeometry = new THREE.BoxGeometry(
            bodyConfig.width * scale, 
            bodyConfig.height * scale, 
            bodyConfig.length * scale
        );
        const bodyMaterial = this.createBodyMaterial(vehicleData.color);
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.castShadow = true;
        vehicleGroup.add(body);
        
        // 더 큰 날개
        const wingsConfig = modelConfig.wings || defaults.model.wings;
        const wingGeometry = new THREE.BoxGeometry(
            wingsConfig.width * scale, 
            wingsConfig.height * scale, 
            wingsConfig.length * scale
        );
        const wingMaterial = this.createBodyMaterial(vehicleData.color);
        const wings = new THREE.Mesh(wingGeometry, wingMaterial);
        wings.castShadow = true;
        vehicleGroup.add(wings);
        
        // 듀얼 엔진 (좌우)
        const enginesConfig = modelConfig.engines || defaults.model.engines;
        const engineGeometry = new THREE.CylinderGeometry(
            enginesConfig.radius * scale, 
            enginesConfig.radius * scale, 
            enginesConfig.length * scale, 
            16
        );
        const engineMaterial = new THREE.MeshBasicMaterial({ 
            color: engineColor
        });
        
        const engines = [];
        enginesConfig.positions.forEach((pos, index) => {
            const engine = new THREE.Mesh(engineGeometry, engineMaterial);
            engine.position.set(pos.x * scale, pos.y * scale, pos.z * scale);
            engine.rotation.x = Math.PI / 2;
            vehicleGroup.add(engine);
            engines.push(engine);
        });
        
        // 듀얼 엔진 글로우 효과
        const glowsConfig = modelConfig.glows || defaults.model.glows;
        const glowGeometry = new THREE.CylinderGeometry(
            glowsConfig.radius * scale, 
            glowsConfig.radius * scale, 
            glowsConfig.length * scale, 
            16
        );
        const glowMaterial = new THREE.MeshBasicMaterial({
            color: glowColor,
            transparent: true,
            opacity: MATERIAL_OPACITY.HEAVY_GLOW
        });
        
        const glows = [];
        glowsConfig.positions.forEach((pos, index) => {
            const glow = new THREE.Mesh(glowGeometry, glowMaterial);
            glow.position.set(pos.x * scale, pos.y * scale, pos.z * scale);
            glow.rotation.x = Math.PI / 2;
            vehicleGroup.add(glow);
            glows.push(glow);
        });
        
        // 사용자 데이터에 엔진 정보 저장
        vehicleGroup.userData.engines = engines;
        vehicleGroup.userData.glows = glows;
    }
    
    /**
     * 테스트기 모델 생성 (작고 빠른 차량)
     */
    createTestVehicleModel(vehicleGroup, vehicleData) {
        // config에서 모델 설정 가져오기 (폴백은 Constants에서)
        const defaults = this.getVehicleDefaults('test');
        const modelConfig = this.config?.vehicles?.test?.model || {};
        const scale = this.config?.vehicles?.test?.scale || defaults.scale;
        const engineColor = this.config?.vehicles?.test?.engineColor || defaults.engineColor;
        const glowColor = this.config?.vehicles?.test?.glowColor || defaults.glowColor;
        
        // 작은 뾰족한 머리
        const headConfig = modelConfig.head || defaults.model.head;
        const headGeometry = new THREE.ConeGeometry(headConfig.radius * scale, headConfig.length * scale, 10);
        const headMaterial = this.createBodyMaterial(vehicleData.color);
        const head = new THREE.Mesh(headGeometry, headMaterial);
        head.rotation.x = Math.PI / 2;
        head.position.z = 3 * scale;
        head.castShadow = true;
        vehicleGroup.add(head);
        
        // 작은 조종석
        const cockpitConfig = modelConfig.cockpit || defaults.model.cockpit;
        const cockpitGeometry = new THREE.SphereGeometry(cockpitConfig.radius * scale, 10, 8);
        const cockpitMaterial = this.createCockpitMaterial();
        const cockpit = new THREE.Mesh(cockpitGeometry, cockpitMaterial);
        cockpit.position.set(
            cockpitConfig.position.x * scale,
            cockpitConfig.position.y * scale,
            cockpitConfig.position.z * scale
        );
        vehicleGroup.add(cockpit);
        
        // 작은 메인 바디
        const bodyConfig = modelConfig.body || defaults.model.body;
        const bodyGeometry = new THREE.BoxGeometry(
            bodyConfig.width * scale, 
            bodyConfig.height * scale, 
            bodyConfig.length * scale
        );
        const bodyMaterial = this.createBodyMaterial(vehicleData.color);
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.castShadow = true;
        vehicleGroup.add(body);
        
        // 작은 날개
        const wingsConfig = modelConfig.wings || defaults.model.wings;
        const wingGeometry = new THREE.BoxGeometry(
            wingsConfig.width * scale, 
            wingsConfig.height * scale, 
            wingsConfig.length * scale
        );
        const wingMaterial = this.createBodyMaterial(vehicleData.color);
        const wings = new THREE.Mesh(wingGeometry, wingMaterial);
        wings.castShadow = true;
        vehicleGroup.add(wings);
        
        // 작은 엔진
        const engineConfig = modelConfig.engine || defaults.model.engine;
        const engineGeometry = new THREE.CylinderGeometry(
            engineConfig.radius * scale, 
            engineConfig.radius * scale, 
            engineConfig.length * scale, 
            12
        );
        const engineMaterial = new THREE.MeshBasicMaterial({ 
            color: engineColor
        });
        const engine = new THREE.Mesh(engineGeometry, engineMaterial);
        engine.position.set(
            engineConfig.position.x * scale,
            engineConfig.position.y * scale,
            engineConfig.position.z * scale
        );
        engine.rotation.x = Math.PI / 2;
        vehicleGroup.add(engine);
        
        // 작은 엔진 글로우 효과
        const glowConfig = modelConfig.glow || defaults.model.glow;
        const glowGeometry = new THREE.CylinderGeometry(
            glowConfig.radius * scale, 
            glowConfig.radius * scale, 
            glowConfig.length * scale, 
            12
        );
        const glowMaterial = new THREE.MeshBasicMaterial({
            color: glowColor,
            transparent: true,
            opacity: MATERIAL_OPACITY.TEST_GLOW
        });
        const glow = new THREE.Mesh(glowGeometry, glowMaterial);
        glow.position.set(
            glowConfig.position.x * scale,
            glowConfig.position.y * scale,
            glowConfig.position.z * scale
        );
        glow.rotation.x = Math.PI / 2;
        vehicleGroup.add(glow);
        
        // 사용자 데이터에 엔진 정보 저장
        vehicleGroup.userData.engine = engine;
        vehicleGroup.userData.glow = glow;
    }

    /**
     * 쌍엽기(Biplane) 3D 모델 생성
     * 상·하 2단 날개, 지주 4개, 회전 프로펠러, 꼬리날개, 고정식 랜딩기어 포함
     */
    createBiplaneVehicleModel(vehicleGroup, vehicleData) {
        const cfg = this.config?.vehicles?.biplane || {};
        const m = cfg.model || {};
        const scale = cfg.scale || 1.0;
        const engineColor = cfg.engineColor || '#FFCC33';
        const glowColor = cfg.glowColor || '#FF9900';

        const bodyMaterial = this.createBodyMaterial(vehicleData.color);
        const darkMetalMaterial = new THREE.MeshStandardMaterial({
            color: 0x333840,
            metalness: 0.7,
            roughness: 0.35
        });
        const woodPropMaterial = new THREE.MeshStandardMaterial({
            color: 0x6b4423,
            metalness: 0.25,
            roughness: 0.5
        });
        const tireMaterial = new THREE.MeshStandardMaterial({
            color: 0x1e1e1e,
            metalness: 0.1,
            roughness: 0.85
        });

        // 1. 메인 동체
        const bodyCfg = m.body || { width: 1.8, height: 1.4, length: 7.2 };
        const body = new THREE.Mesh(
            new THREE.BoxGeometry(bodyCfg.width * scale, bodyCfg.height * scale, bodyCfg.length * scale),
            bodyMaterial
        );
        body.castShadow = true;
        vehicleGroup.add(body);

        // 2. 기수 엔진 카울링 (+Z 방향)
        const noseCfg = m.nose || { radiusTop: 0.65, radiusBottom: 1.05, length: 2.2, z: 4.2 };
        const nose = new THREE.Mesh(
            new THREE.CylinderGeometry(noseCfg.radiusTop * scale, noseCfg.radiusBottom * scale, noseCfg.length * scale, 12),
            darkMetalMaterial
        );
        nose.rotation.x = Math.PI / 2;
        nose.position.z = noseCfg.z * scale;
        nose.castShadow = true;
        vehicleGroup.add(nose);

        // 3. 상단 날개 (Upper Wing)
        const upperCfg = m.upperWing || { width: 13.0, height: 0.35, length: 2.4, y: 1.65, z: 1.0 };
        const upperWing = new THREE.Mesh(
            new THREE.BoxGeometry(upperCfg.width * scale, upperCfg.height * scale, upperCfg.length * scale),
            bodyMaterial
        );
        upperWing.position.set(0, upperCfg.y * scale, upperCfg.z * scale);
        upperWing.castShadow = true;
        vehicleGroup.add(upperWing);

        // 4. 하단 날개 (Lower Wing)
        const lowerCfg = m.lowerWing || { width: 11.6, height: 0.35, length: 2.2, y: -0.55, z: 0.6 };
        const lowerWing = new THREE.Mesh(
            new THREE.BoxGeometry(lowerCfg.width * scale, lowerCfg.height * scale, lowerCfg.length * scale),
            bodyMaterial
        );
        lowerWing.position.set(0, lowerCfg.y * scale, lowerCfg.z * scale);
        lowerWing.castShadow = true;
        vehicleGroup.add(lowerWing);

        // 5. 상·하 날개 연결 지주 (Struts 4개)
        const strutCfg = m.strut || { radius: 0.1, height: 2.2, xPositions: [-4.6, -2.2, 2.2, 4.6], z: 0.8 };
        const strutGeo = new THREE.CylinderGeometry(strutCfg.radius * scale, strutCfg.radius * scale, strutCfg.height * scale, 6);
        const midY = ((upperCfg.y + lowerCfg.y) / 2) * scale;
        for (const xPos of strutCfg.xPositions) {
            const strut = new THREE.Mesh(strutGeo, darkMetalMaterial);
            strut.position.set(xPos * scale, midY, strutCfg.z * scale);
            vehicleGroup.add(strut);
        }

        // 6. 오픈 조종석 (틴티드 글래스 윈드실드 돔)
        const cockpitCfg = m.cockpit || { radius: 0.85, position: { x: 0, y: 0.95, z: -0.6 } };
        const cockpit = new THREE.Mesh(
            new THREE.SphereGeometry(cockpitCfg.radius * scale, 12, 10),
            this.createCockpitMaterial()
        );
        cockpit.position.set(
            cockpitCfg.position.x * scale,
            cockpitCfg.position.y * scale,
            cockpitCfg.position.z * scale
        );
        vehicleGroup.add(cockpit);

        // 7. 십자형 꼬리날개 (수평 + 수직 미익)
        const tailHCfg = m.tailHorizontal || { width: 4.6, height: 0.25, length: 1.5, y: 0.3, z: -3.8 };
        const tailH = new THREE.Mesh(
            new THREE.BoxGeometry(tailHCfg.width * scale, tailHCfg.height * scale, tailHCfg.length * scale),
            bodyMaterial
        );
        tailH.position.set(0, tailHCfg.y * scale, tailHCfg.z * scale);
        tailH.castShadow = true;
        vehicleGroup.add(tailH);

        const tailVCfg = m.tailVertical || { width: 0.28, height: 2.0, length: 1.8, y: 1.15, z: -3.7 };
        const tailV = new THREE.Mesh(
            new THREE.BoxGeometry(tailVCfg.width * scale, tailVCfg.height * scale, tailVCfg.length * scale),
            bodyMaterial
        );
        tailV.position.set(0, tailVCfg.y * scale, tailVCfg.z * scale);
        tailV.castShadow = true;
        vehicleGroup.add(tailV);

        // 8. 고정식 랜딩기어 (바퀴 2개 + 다리)
        const gearCfg = m.landingGear || { wheelRadius: 0.55, wheelWidth: 0.28, xOffset: 1.4, y: -1.65, z: 1.4 };
        const wheelGeo = new THREE.CylinderGeometry(gearCfg.wheelRadius * scale, gearCfg.wheelRadius * scale, gearCfg.wheelWidth * scale, 12);
        const legGeo = new THREE.CylinderGeometry(0.08 * scale, 0.08 * scale, 1.3 * scale, 6);
        for (const side of [-1, 1]) {
            const wheel = new THREE.Mesh(wheelGeo, tireMaterial);
            wheel.rotation.z = Math.PI / 2;
            wheel.position.set(side * gearCfg.xOffset * scale, gearCfg.y * scale, gearCfg.z * scale);
            vehicleGroup.add(wheel);

            const leg = new THREE.Mesh(legGeo, darkMetalMaterial);
            leg.position.set(side * (gearCfg.xOffset * 0.8) * scale, (gearCfg.y + 0.6) * scale, gearCfg.z * scale);
            leg.rotation.z = side * 0.25;
            vehicleGroup.add(leg);
        }

        // 9. 회전 프로펠러 그룹 (기수 최전방 +Z)
        const propCfg = m.propeller || { bladeLength: 3.4, bladeWidth: 0.32, bladeThickness: 0.08, spinnerRadius: 0.38, z: 5.45 };
        const propellerGroup = new THREE.Group();
        propellerGroup.position.set(0, 0, propCfg.z * scale);

        const spinner = new THREE.Mesh(
            new THREE.ConeGeometry(propCfg.spinnerRadius * scale, 0.7 * scale, 10),
            darkMetalMaterial
        );
        spinner.rotation.x = Math.PI / 2;
        spinner.position.z = 0.25 * scale;
        propellerGroup.add(spinner);

        const blade = new THREE.Mesh(
            new THREE.BoxGeometry(propCfg.bladeWidth * scale, propCfg.bladeLength * scale, propCfg.bladeThickness * scale),
            woodPropMaterial
        );
        propellerGroup.add(blade);
        vehicleGroup.add(propellerGroup);

        // 10. 후방 배기/부스터 글로우 (EffectManager.updateVehicleBooster 호환)
        const engine = new THREE.Mesh(
            new THREE.CylinderGeometry(0.6 * scale, 0.6 * scale, 0.35 * scale, 10),
            new THREE.MeshBasicMaterial({ color: engineColor, transparent: true, opacity: MATERIAL_OPACITY.FIGHTER_ENGINE })
        );
        engine.position.set(0, -0.1 * scale, -3.7 * scale);
        engine.rotation.x = Math.PI / 2;
        vehicleGroup.add(engine);

        const glow = new THREE.Mesh(
            new THREE.CylinderGeometry(1.1 * scale, 1.1 * scale, 0.2 * scale, 10),
            new THREE.MeshBasicMaterial({ color: glowColor, transparent: true, opacity: MATERIAL_OPACITY.FIGHTER_GLOW })
        );
        glow.position.set(0, -0.1 * scale, -4.0 * scale);
        glow.rotation.x = Math.PI / 2;
        vehicleGroup.add(glow);

        vehicleGroup.userData.engine = engine;
        vehicleGroup.userData.glow = glow;
        vehicleGroup.userData.propeller = propellerGroup;
    }
    
    /**
     * 새로운 비행체 타입 등록 (확장성)
     */
    registerVehicleType(typeName, creatorFunction) {
        this.vehicleCreators.set(typeName, creatorFunction);
    }
    
    /**
     * 등록된 비행체 타입 목록 반환
     */
    getRegisteredTypes() {
        return Array.from(this.vehicleCreators.keys());
    }
} 