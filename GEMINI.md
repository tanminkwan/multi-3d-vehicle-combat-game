# Project Development Workflow & Guidelines

이 프로젝트에서 모든 신규 기능(Phase) 및 주요 변경 작업은 아래 절차를 기본 워크플로우로 따른다.

## 1. 표준 개발 프로세스
1. **요구사항 정의서 작성 (`docs/<FEATURE>_REQUIREMENTS.md`)**
   - 목적, 범위, 기능/비기능 요구사항, 설정 스키마, 인수 조건(AC)을 명확히 정의하고 정책을 확정한 뒤 다음 단계로 넘어간다.
2. **설계서 작성 (`docs/<FEATURE>_DESIGN.md`)**
   - 모듈/클래스 책임 분리(SOLID), 데이터 모델, 상태 전이/시퀀스, API 명세, 테스트 전략(단위/통합/E2E)을 구체적으로 설계한다.
3. **TDD 기반 구현 (Red → Green → Refactor)**
   - 프로덕션 코드 작성 전에 실패하는 단위/통합 테스트를 먼저 작성한다.
   - 테스트를 통과하는 최소 구현 후 리팩토링하며, 모든 테스트 통과를 확인한다.
4. **Headless Browser / Playwright E2E 테스트**
   - 실제 실행 환경(예: `http://localhost` Docker 스택)을 대상으로 Playwright 기반 headless browser E2E 테스트를 작성·실행하여 UI, WebSocket, REST API, 게임 동작을 종단 간 검증한다.

## 2. 코드 및 설정 원칙
- 하드코딩 금지: 모든 정책·수치·난이도·환경 설정은 `game-config.yaml` 등 설정 파일로 외부화한다.
- 기존 시스템의 SOLID 원칙(SRP/OCP/DIP)을 준수하여 신규 로직을 독립 모듈로 분리한다.
