import * as THREE from 'three';
import { resolveGraphicsConfig } from '../graphics/GraphicsPresetResolver.js';
import { TerrainColorizer } from '../graphics/TerrainColorizer.js';

/**
 * 월드 관리자 클래스
 * 게임 월드의 지형, 하늘, 구름, 나무 등 환경 요소 생성 및 관리
 */
export class WorldManager {
    constructor(scene, config, graphicsDeps = {}) {
        this.scene = scene;
        this.config = config;
        this.graphicsConfig = graphicsDeps.graphicsConfig || resolveGraphicsConfig(config?.client);
        this.textureFactory = graphicsDeps.textureFactory || null;
        this.terrainColorizer = graphicsDeps.terrainColorizer || new TerrainColorizer(this.graphicsConfig.biomes);
        
        // 월드 객체들
        this.terrain = null;
        this.sky = null;
        this.water = null;
        this.waterTexture = null;
        this.clouds = [];
        this.trees = [];
        this.treeInstancedMeshes = [];
        this.boundaries = [];
    }
    
    /**
     * 월드 생성 (메인 메서드)
     */
    createWorld() {
        this.createTerrain();
        this.createSky();
        this.createClouds();
        this.createTrees();
        this.createMapBoundaries();
        
        console.log('🌍 월드 생성 완료:', {
            terrain: !!this.terrain,
            sky: !!this.sky,
            water: !!this.water,
            clouds: this.clouds.length,
            trees: this.trees.length,
            boundaries: this.boundaries.length
        });
    }
    
    /**
     * 지형 생성
     */
    createTerrain() {
        const size = this.config.world.size;
        const detail = this.config.world.terrainDetail;
        
        const geometry = new THREE.PlaneGeometry(size, size, detail, detail);
        
        // 높이 맵 생성
        const vertices = geometry.attributes.position.array;
        for (let i = 0; i < vertices.length; i += 3) {
            const x = vertices[i];
            const y = vertices[i + 1];
            
            const height = 
                Math.sin(x * 0.008) * 25 +
                Math.cos(y * 0.008) * 25 +
                Math.sin(x * 0.015) * 15 +
                Math.cos(y * 0.015) * 15 +
                Math.sin(x * 0.03) * 8 +
                Math.cos(y * 0.03) * 8 +
                Math.sin(x * 0.05) * 4 +
                Math.cos(y * 0.05) * 4 +
                (Math.random() - 0.5) * 6;
                
            vertices[i + 2] = height;
        }
        
        geometry.attributes.position.needsUpdate = true;
        geometry.computeVertexNormals();

        // 고도별 바이옴 버텍스 컬러 적용 (모래 -> 초원 -> 숲 -> 암석 -> 설원)
        const vertexColors = this.terrainColorizer.buildVertexColors(vertices);
        geometry.setAttribute('color', new THREE.BufferAttribute(vertexColors, 3));

        const terrainDetailMap = this.textureFactory ? this.textureFactory.getTerrainDetailTexture() : null;
        const material = new THREE.MeshStandardMaterial({
            vertexColors: true,
            map: terrainDetailMap,
            roughness: 0.92,
            metalness: 0.02
        });

        this.terrain = new THREE.Mesh(geometry, material);
        this.terrain.rotation.x = -Math.PI / 2;
        this.terrain.receiveShadow = true;
        this.scene.add(this.terrain);

        // 물 생성
        this.createWater();
    }
    
    /**
     * 물 생성 (절차적 물결 텍스처 + PBR 수면 반사)
     */
    createWater() {
        const size = this.config.world.size;
        const palette = this.graphicsConfig.palette;
        const waterGeometry = new THREE.PlaneGeometry(size, size, 32, 32);
        this.waterTexture = this.textureFactory ? this.textureFactory.getWaterTexture() : null;

        const waterMaterial = new THREE.MeshStandardMaterial({
            color: this.config?.world?.waterColor || palette.waterColor || 0x1b7fa3,
            map: this.waterTexture,
            transparent: true,
            opacity: this.config?.world?.waterOpacity || palette.waterOpacity || 0.72,
            roughness: 0.18,
            metalness: 0.25
        });
        
        this.water = new THREE.Mesh(waterGeometry, waterMaterial);
        this.water.rotation.x = -Math.PI / 2;
        this.water.position.y = this.config.world.waterLevel;
        this.water.receiveShadow = true;
        this.scene.add(this.water);
    }
    
    /**
     * 하늘 생성 (그라데이션 돔 + 태양 광휘)
     */
    createSky() {
        const skyRadius = this.config?.world?.skyRadius || 1500;
        const skyGeometry = new THREE.SphereGeometry(skyRadius, 32, 24);
        const skyTexture = this.textureFactory ? this.textureFactory.getSkyTexture() : null;
        const skyMaterial = skyTexture
            ? new THREE.MeshBasicMaterial({ map: skyTexture, side: THREE.BackSide, fog: false })
            : new THREE.MeshBasicMaterial({
                color: this.config?.world?.skyColor || 0x87CEEB,
                side: THREE.BackSide,
                fog: false
            });
        
        this.sky = new THREE.Mesh(skyGeometry, skyMaterial);
        this.scene.add(this.sky);
    }
    
    /**
     * 구름 생성 (다중 구체 뭉게구름 클러스터)
     */
    createClouds() {
        const cloudCount = this.config?.client?.clouds?.count || 20;
        const heightMin = this.config?.client?.clouds?.heightMin || 50;
        const heightMax = this.config?.client?.clouds?.heightMax || 150;
        const cloudSize = this.config?.client?.clouds?.size || 18;
        const cloudOpacity = this.config?.client?.clouds?.opacity || 0.72;
        const spreadRange = this.config?.client?.clouds?.spreadRange || 800;
        const puffCount = Math.max(1, this.graphicsConfig.cloudPuffs || 3);

        const sharedGeo = new THREE.SphereGeometry(cloudSize, 10, 8);
        const sharedMat = new THREE.MeshLambertMaterial({
            color: this.config?.client?.clouds?.color || 0xf8fbff,
            transparent: true,
            opacity: cloudOpacity
        });

        for (let i = 0; i < cloudCount; i++) {
            const cloudGroup = new THREE.Group();
            for (let p = 0; p < puffCount; p++) {
                const puff = new THREE.Mesh(sharedGeo, sharedMat);
                const angle = (p / puffCount) * Math.PI * 2;
                const offsetR = p === 0 ? 0 : cloudSize * 0.65;
                puff.position.set(
                    Math.cos(angle) * offsetR,
                    (p === 0 ? 0.15 : -0.1) * cloudSize,
                    Math.sin(angle) * offsetR * 0.7
                );
                const puffScale = p === 0 ? 1.0 : 0.65 + (p % 2) * 0.15;
                puff.scale.set(puffScale * 1.2, puffScale * 0.65, puffScale);
                cloudGroup.add(puff);
            }

            cloudGroup.position.set(
                (Math.random() - 0.5) * spreadRange,
                heightMin + Math.random() * (heightMax - heightMin),
                (Math.random() - 0.5) * spreadRange
            );
            cloudGroup.scale.setScalar(0.6 + Math.random() * 0.5);
            cloudGroup.userData = {
                velocity: this.config?.client?.clouds?.velocity || 0.1,
                resetPosition: spreadRange
            };

            this.clouds.push(cloudGroup);
            this.scene.add(cloudGroup);
        }
    }
    
    /**
     * 나무 생성 (2단 침엽수 InstancedMesh - 드로우콜 3회로 최적화)
     */
    createTrees() {
        const treeCount = this.config?.client?.trees?.count || 100;
        const minHeightAboveWater = this.config?.client?.trees?.minHeightAboveWater || 2;
        const spreadRange = this.config?.client?.trees?.spreadRange || 300;

        const treeConfig = this.config?.client?.trees || {};
        const trunkHeight = treeConfig.trunkHeight || 8;
        const trunkRadius = treeConfig.trunkRadius || { bottom: 0.9, top: 0.45 };
        const leavesRadius = treeConfig.leavesRadius || 4.2;

        const trunkGeo = new THREE.CylinderGeometry(trunkRadius.top, trunkRadius.bottom, trunkHeight, 6);
        const trunkMat = new THREE.MeshStandardMaterial({ color: treeConfig.trunkColor || 0x6b4423, roughness: 0.9 });

        const lowerConeGeo = new THREE.ConeGeometry(leavesRadius, leavesRadius * 2.1, 7);
        const upperConeGeo = new THREE.ConeGeometry(leavesRadius * 0.72, leavesRadius * 1.8, 7);
        const leavesMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0.02 });

        const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);
        const lowerInst = new THREE.InstancedMesh(lowerConeGeo, leavesMat, treeCount);
        const upperInst = new THREE.InstancedMesh(upperConeGeo, leavesMat, treeCount);

        const dummy = new THREE.Object3D();
        const color = new THREE.Color();
        const foliagePalette = [0x246b32, 0x2d7d3c, 0x1e5a2b, 0x368846];

        for (let i = 0; i < treeCount; i++) {
            let x, z, terrainHeight;
            let attempts = 0;
            do {
                x = (Math.random() - 0.5) * spreadRange;
                z = (Math.random() - 0.5) * spreadRange;
                terrainHeight = this.getTerrainHeight(x, z);
                attempts++;
            } while (terrainHeight <= this.config.world.waterLevel + minHeightAboveWater && attempts < 10);

            const scale = 0.8 + Math.random() * 0.5;
            const rotY = Math.random() * Math.PI * 2;

            // 줄기
            dummy.position.set(x, terrainHeight + (trunkHeight * scale) / 2, z);
            dummy.rotation.set(0, rotY, 0);
            dummy.scale.setScalar(scale);
            dummy.updateMatrix();
            trunkInst.setMatrixAt(i, dummy.matrix);

            // 하단 원뿔 잎
            dummy.position.set(x, terrainHeight + (trunkHeight + leavesRadius * 0.55) * scale, z);
            dummy.updateMatrix();
            lowerInst.setMatrixAt(i, dummy.matrix);

            // 상단 원뿔 잎
            dummy.position.set(x, terrainHeight + (trunkHeight + leavesRadius * 1.45) * scale, z);
            dummy.updateMatrix();
            upperInst.setMatrixAt(i, dummy.matrix);

            color.setHex(foliagePalette[i % foliagePalette.length]);
            lowerInst.setColorAt(i, color);
            color.offsetHSL(0, 0, 0.04);
            upperInst.setColorAt(i, color);

            this.trees.push({ x, y: terrainHeight, z });
        }

        trunkInst.instanceMatrix.needsUpdate = true;
        lowerInst.instanceMatrix.needsUpdate = true;
        upperInst.instanceMatrix.needsUpdate = true;
        if (lowerInst.instanceColor) lowerInst.instanceColor.needsUpdate = true;
        if (upperInst.instanceColor) upperInst.instanceColor.needsUpdate = true;

        this.treeInstancedMeshes = [trunkInst, lowerInst, upperInst];
        this.treeInstancedMeshes.forEach(mesh => this.scene.add(mesh));
    }
    
    /**
     * 맵 경계 표시 생성
     */
    createMapBoundaries() {
        const mapSize = this.config.world.size;
        const boundaryHeight = this.config.world.maxHeight / 2 || 100;
        const boundaryConfig = this.config?.world?.boundaries || {};
        
        // 경계 벽 재질 (반투명한 빨간색)
        const boundaryMaterial = new THREE.MeshBasicMaterial({
            color: boundaryConfig.color || 0xff0000,
            transparent: true,
            opacity: boundaryConfig.opacity || 0.3,
            side: THREE.DoubleSide
        });
        
        // 북쪽 벽
        const northWall = new THREE.PlaneGeometry(mapSize, boundaryHeight);
        const northMesh = new THREE.Mesh(northWall, boundaryMaterial);
        northMesh.position.set(0, boundaryHeight / 2, mapSize / 2);
        northMesh.rotation.x = 0;
        this.boundaries.push(northMesh);
        this.scene.add(northMesh);
        
        // 남쪽 벽
        const southWall = new THREE.PlaneGeometry(mapSize, boundaryHeight);
        const southMesh = new THREE.Mesh(southWall, boundaryMaterial);
        southMesh.position.set(0, boundaryHeight / 2, -mapSize / 2);
        southMesh.rotation.x = 0;
        southMesh.rotation.y = Math.PI;
        this.boundaries.push(southMesh);
        this.scene.add(southMesh);
        
        // 동쪽 벽
        const eastWall = new THREE.PlaneGeometry(mapSize, boundaryHeight);
        const eastMesh = new THREE.Mesh(eastWall, boundaryMaterial);
        eastMesh.position.set(mapSize / 2, boundaryHeight / 2, 0);
        eastMesh.rotation.y = -Math.PI / 2;
        this.boundaries.push(eastMesh);
        this.scene.add(eastMesh);
        
        // 서쪽 벽
        const westWall = new THREE.PlaneGeometry(mapSize, boundaryHeight);
        const westMesh = new THREE.Mesh(westWall, boundaryMaterial);
        westMesh.position.set(-mapSize / 2, boundaryHeight / 2, 0);
        westMesh.rotation.y = Math.PI / 2;
        this.boundaries.push(westMesh);
        this.scene.add(westMesh);
        
        // 천장 (높이 제한 표시)
        const ceilingGeometry = new THREE.PlaneGeometry(mapSize, mapSize);
        const ceilingMaterial = new THREE.MeshBasicMaterial({
            color: boundaryConfig.ceilingColor || 0xff0000,
            transparent: true,
            opacity: boundaryConfig.ceilingOpacity || 0.1,
            side: THREE.DoubleSide
        });
        const ceiling = new THREE.Mesh(ceilingGeometry, ceilingMaterial);
        ceiling.position.set(0, this.config.world.maxHeight, 0);
        ceiling.rotation.x = -Math.PI / 2;
        this.boundaries.push(ceiling);
        this.scene.add(ceiling);
    }
    
    /**
     * 지형 높이 계산
     */
    getTerrainHeight(x, z) {
        // 실제 지형 생성과 동일한 높이 계산
        const height = 
            Math.sin(x * 0.008) * 25 +
            Math.cos(z * 0.008) * 25 +
            Math.sin(x * 0.015) * 15 +
            Math.cos(z * 0.015) * 15 +
            Math.sin(x * 0.03) * 8 +
            Math.cos(z * 0.03) * 8 +
            Math.sin(x * 0.05) * 4 +
            Math.cos(z * 0.05) * 4;
            // 랜덤 요소는 제외 (일관성을 위해)
            
        return Math.max(height, this.config.world.waterLevel + 1); // 물 위에만 배치
    }
    
    /**
     * 구름 애니메이션 업데이트
     */
    updateClouds() {
        this.clouds.forEach(cloud => {
            cloud.position.x += cloud.userData.velocity;
            if (cloud.position.x > cloud.userData.resetPosition) {
                cloud.position.x = -cloud.userData.resetPosition;
            }
        });
    }

    /**
     * 수면 물결 UV 스크롤 애니메이션
     */
    updateWater(deltaTime) {
        if (!this.waterTexture) return;
        const speed = this.graphicsConfig.waterScrollSpeed || 0.03;
        this.waterTexture.offset.x = (this.waterTexture.offset.x + deltaTime * speed) % 1;
        this.waterTexture.offset.y = (this.waterTexture.offset.y + deltaTime * speed * 0.6) % 1;
    }
    
    /**
     * 월드 정리 (메모리 해제)
     */
    cleanup() {
        // 지형 제거
        if (this.terrain) {
            this.scene.remove(this.terrain);
            this.terrain.geometry.dispose();
            this.terrain.material.dispose();
            this.terrain = null;
        }
        
        // 물 제거
        if (this.water) {
            this.scene.remove(this.water);
            this.water.geometry.dispose();
            this.water.material.dispose();
            this.water = null;
        }
        this.waterTexture = null;
        
        // 하늘 제거
        if (this.sky) {
            this.scene.remove(this.sky);
            this.sky.geometry.dispose();
            this.sky.material.dispose();
            this.sky = null;
        }
        
        // 구름 제거 (공유 지오메트리/재질 안전 해제)
        const disposedGeos = new Set();
        const disposedMats = new Set();
        this.clouds.forEach(cloud => {
            this.scene.remove(cloud);
            cloud.traverse(child => {
                if (child.geometry && !disposedGeos.has(child.geometry)) {
                    child.geometry.dispose();
                    disposedGeos.add(child.geometry);
                }
                if (child.material && !disposedMats.has(child.material)) {
                    child.material.dispose();
                    disposedMats.add(child.material);
                }
            });
        });
        this.clouds = [];
        
        // InstancedMesh 나무 제거
        this.treeInstancedMeshes.forEach(mesh => {
            this.scene.remove(mesh);
            if (mesh.geometry) mesh.geometry.dispose();
            if (mesh.material) mesh.material.dispose();
        });
        this.treeInstancedMeshes = [];
        this.trees = [];
        
        // 경계 제거
        this.boundaries.forEach(boundary => {
            this.scene.remove(boundary);
            boundary.geometry.dispose();
            boundary.material.dispose();
        });
        this.boundaries = [];
        
        console.log('🌍 월드 정리 완료');
    }
    
    /**
     * 월드 통계 반환
     */
    getWorldStats() {
        return {
            terrain: !!this.terrain,
            water: !!this.water,
            sky: !!this.sky,
            cloudsCount: this.clouds.length,
            treesCount: this.trees.length,
            boundariesCount: this.boundaries.length
        };
    }
} 