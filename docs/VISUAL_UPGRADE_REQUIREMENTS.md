# 비주얼 & 텍스처 업그레이드(Visual Upgrade) 요구사항 정의서

- **문서 버전:** v1.0
- **작성일:** 2026-11-24
- **대상 브랜치:** `stabilization`
- **대상 시스템:** Multiplayer 3D Vehicle Combat Game (`client`, `services/game-service/src/config/game-config.yaml`)

---

## 1. 개요

### 1.1 목적
현재 단색 `MeshLambertMaterial`과 단순 기하 도형으로 구성된 3D 화면의 시각적 완성도를 끌어올린다. 외부 대용량 이미지/모델 에셋에 의존하지 않고 **절차적(Procedural) `CanvasTexture` + PBR(`MeshStandardMaterial`) + 조명/톤매핑/환경 반사 + `InstancedMesh` 최적화**를 적용하여, 저사양 PC 성능을 유지하면서도 세련된 비행 전투 그래픽을 제공한다.

### 1.2 범위
- **포함 범위**
  - `game-config.yaml` 기반 그래픽 품질 프리셋(`low`, `medium`, `high`) 및 비주얼 팔레트 외부화
  - 절차적 텍스처 생성·캐싱 모듈 (`ProceduralTextureFactory`)
  - 고도별 지형 바이옴 버텍스 컬러링 (`TerrainColorizer`: 모래 → 초원 → 암석 → 설원) + 미세 노이즈 디테일 맵
  - 그라데이션 하늘 돔 + 지평선 안개(`Fog`) 색상 일체화
  - 물결 텍스처 + 매 프레임 UV 스크롤 애니메이션
  - 비행체 PBR 금속 재질(`MeshStandardMaterial`, 패널 라인/리벳 텍스처 + `bumpMap`, 유리 조종석 반사)
  - `HemisphereLight` + `ACESFilmicToneMapping` + `RoomEnvironment` 경량 환경 반사
  - 2단 침엽수 `THREE.InstancedMesh` 나무(드로우콜 대폭 절감) 및 다중 구체 뭉게구름
- **제외 범위**
  - 외부 `.glb`/`.gltf` 3D 모델 다운로드 또는 대용량 2K/4K PBR 이미지 번들링
  - 포스트프로세싱 블룸(EffectComposer) 등 고부하 셰이더 파이프라인

---

## 2. 기능 요구사항 (Functional Requirements)

### FR-01. 그래픽 품질 프리셋 외부화 (`game-config.yaml`)
- `client.graphics` 섹션에서 `preset`(`low` | `medium` | `high`)과 프리셋별 파라미터(`textureSize`, `enableEnvironmentMap`, `toneMappingExposure`, `waterScrollSpeed`, `treeSegments`, `cloudPuffs`)를 설정한다.
- 기본 프리셋은 `medium`으로 하며, `lowPerformanceMode: true`와 충돌 없이 호환되어야 한다.

### FR-02. 조명 · 톤매핑 · 환경 반사
- 렌더러에 `THREE.ACESFilmicToneMapping` 및 설정된 `toneMappingExposure`를 적용한다.
- 기존 `AmbientLight`를 **`THREE.HemisphereLight`**(하늘색/지면 반사색)로 대체·보강하여 입체 음영을 개선한다.
- 프리셋에서 `enableEnvironmentMap: true`인 경우 `PMREMGenerator` + `RoomEnvironment`를 사용해 경량 환경 반사(`scene.environment`)를 생성하고, `GameClient.cleanup()` 시 `dispose()`한다.

### FR-03. 지형 · 하늘 · 수면 비주얼 업그레이드
- **지형:** 각 정점 높이에 따라 `water/sand → grass → rock → snow` 4단계 바이옴 색상을 보간하여 `vertexColors: true`로 적용하고, 반복 타일링(`RepeatWrapping`) 절차적 노이즈 디테일 텍스처를 얹는다.
- **하늘:** 단색 구체 대신 천정 → 중천 → 지평선 3단 그라데이션 `CanvasTexture`를 생성해 적용하고, `scene.fog` 및 `renderer.setClearColor`를 지평선 색상과 일치시킨다.
- **수면:** 절차적 물결 패턴 `CanvasTexture`를 `RepeatWrapping`으로 적용하고, `WorldManager.updateWater(deltaTime)`로 매 프레임 UV `offset`을 스크롤한다.

### FR-04. 비행체 PBR 재질 및 패널 텍스처
- `fighter`, `heavy`, `test` 비행체 바디/기수/날개에 `MeshStandardMaterial`(`metalness`, `roughness`, 절차적 금속 패널/리벳 `map` + `bumpMap`)을 적용한다.
- 플레이어별 고유 색상(`vehicleData.color`)은 그대로 유지하면서 금속 질감과 패널 디테일이 드러나도록 한다.
- 조종석 돔은 높은 광택/환경 반사를 갖는 틴티드 글래스 재질로 개선한다.

### FR-05. 나무(`InstancedMesh`) 및 뭉게구름 개선
- 나무는 1개의 구 대신 **줄기 + 2단 원뿔 침엽수** 형태로 업그레이드하고, `THREE.InstancedMesh`를 사용해 나무 개수와 무관하게 드로우콜을 최소화(줄기 1 + 잎 2 = 총 3 드로우콜)한다.
- 구름은 단일 구체 대신 3~4개 구체를 조합한 뭉게구름 그룹으로 구성한다.

---

## 3. 비기능 요구사항 (Non-Functional Requirements)
- **성능:** `InstancedMesh` 및 텍스처 캐싱(종류별 1회 생성 후 재사용)을 통해 드로우콜과 메모리 사용량을 기존 대비 절감하거나 동등 이하로 유지한다.
- **메모리 관리:** `GameClient.cleanup()` 시 캐싱된 텍스처, `PMREMGenerator` 렌더 타겟, `InstancedMesh` 지오메트리/재질을 모두 `dispose()`하여 재입장 시 GPU 메모리 누수가 없어야 한다.
- **SOLID 준수:** 프리셋 해석(`GraphicsPresetResolver`), 텍스처 생성(`ProceduralTextureFactory`), 지형 바이옴 색상 계산(`TerrainColorizer`)을 독립 모듈로 분리한다.

---

## 4. 인수 조건 (Acceptance Criteria)

| ID | 검증 항목 | 기대 결과 |
|---|---|---|
| **AC-01** | 그래픽 프리셋 해석 | `low`/`medium`/`high` 프리셋 및 부분 오버라이드가 정확히 병합되고 잘못된 프리셋명은 기본값으로 폴백 |
| **AC-02** | 절차적 텍스처 생성 및 캐싱 | 동일 키 재요청 시 캐시된 텍스처 인스턴스를 재사용하며 `dispose()`로 일괄 해제 가능 |
| **AC-03** | 지형 바이옴 색상 | 고도에 따라 모래 → 초원 → 암석 → 설원 색상이 연속적으로 계산되어 `color` 버텍스 속성에 반영 |
| **AC-04** | 실시간 E2E 렌더링 검증 | `http://localhost` headless 브라우저에서 페이지 에러 0건, `ACESFilmicToneMapping`, `HemisphereLight`, `InstancedMesh` 나무, `MeshStandardMaterial` 비행체(패널 텍스처 포함), 수면 UV 스크롤 동작 확인 |
| **AC-05** | 퇴장 및 재입장 안정성 | `게임 나가기` 후 재입장 시 GPU 리소스 정리 및 정상 재렌더링 확인 |
