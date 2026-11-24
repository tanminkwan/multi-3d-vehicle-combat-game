# Vehicle Game - Docker 환경

이 문서는 Vehicle Game의 Docker 환경 구성과 사용법을 설명합니다.

## 🏗️ 아키텍처

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Nginx (80)    │    │ User Service    │    │ Game Service    │
│   API Gateway   │◄──►│    (3002)       │◄──►│    (3001)       │
│                 │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌─────────────────┐
                       │  PostgreSQL     │
                       │    (5432)       │
                       │                 │
                       └─────────────────┘
```

## 📦 컨테이너 구성

| 서비스 | 컨테이너명 | 포트 | 설명 |
|--------|------------|------|------|
| nginx | vehicle-game-nginx | 80 | API Gateway & Static Files |
| user-service | vehicle-game-user-service | 3002 | 사용자 인증 서비스 |
| game-service | vehicle-game-game-service | 3001 | 게임 로직 서비스 |
| user-service-db | vehicle-game-postgres | 5432 | PostgreSQL 데이터베이스 |

## 🚀 빠른 시작

### 1. Docker 환경 시작

```bash
# Windows
docker-start.bat

# Linux/Mac
docker-compose up -d
```

### 2. 서비스 확인

```bash
# 컨테이너 상태 확인
docker-compose ps

# 로그 확인
docker-compose logs -f
```

### 3. 애플리케이션 접속

- **웹 애플리케이션**: http://localhost
- **API 테스트**: http://localhost/api-test.html

## 🛠️ 개발 환경

### 개발 모드로 실행

```bash
# 개발 환경 오버라이드 적용
docker-compose -f docker-compose.yml -f docker-compose.override.yml up -d
```

개발 모드에서는:
- 소스 코드가 볼륨 마운트됨 (실시간 반영)
- nodemon으로 자동 재시작
- 디버그 로그 활성화
- 데이터베이스 쿼리 로그 활성화

### 소스 코드 수정

개발 모드에서는 소스 코드 변경 시 자동으로 서비스가 재시작됩니다:

```bash
# User Service 소스 수정
services/user-service/src/

# Game Service 소스 수정
services/game-service/src/
```

## 🔧 관리 명령어

### 기본 명령어

```bash
# 서비스 시작
docker-compose up -d

# 서비스 중지
docker-compose stop

# 컨테이너 삭제
docker-compose down

# 볼륨까지 삭제 (데이터 초기화)
docker-compose down -v
```

### 로그 확인

```bash
# 전체 로그
docker-compose logs -f

# 특정 서비스 로그
docker-compose logs -f user-service
docker-compose logs -f game-service
docker-compose logs -f user-service-db
```

### 이미지 관리

```bash
# 이미지 다시 빌드
docker-compose build --no-cache

# 이미지 삭제
docker-compose down --rmi all
```

## 🗄️ 데이터베이스

### 자동 초기화

PostgreSQL 컨테이너는 시작 시 자동으로 다음을 수행합니다:

1. `vehicle_game` 데이터베이스 생성
2. `app_user` 사용자 생성 (비밀번호: `.env` 또는 `docker-compose.yml`에서 설정)
3. 필요한 권한 부여

초기화 스크립트: `services/user-service/scripts/init-db.sql`

### 데이터베이스 접속

```bash
# 컨테이너 내부에서 접속
docker-compose exec user-service-db psql -U app_user -d vehicle_game

# 호스트에서 접속 (PostgreSQL 클라이언트 필요)
psql -h localhost -U app_user -d vehicle_game
```

### 데이터 백업/복원

```bash
# 백업
docker-compose exec user-service-db pg_dump -U app_user vehicle_game > backup.sql

# 복원
docker-compose exec -T user-service-db psql -U app_user -d vehicle_game < backup.sql
```

## 🔒 보안 설정

### 프로덕션 환경

프로덕션에서는 다음 설정을 변경하세요:

1. **JWT Secret 변경**:
   ```yaml
   environment:
     JWT_SECRET: your-production-secret-key
   ```

2. **데이터베이스 비밀번호 변경**:
   ```yaml
   environment:
     POSTGRES_PASSWORD: your-secure-password
     DB_PASS: your-secure-app-password
   ```

3. **외부 포트 제한**:
   ```yaml
   ports:
     # 개발 환경에서만 노출
     # - "3001:3001"
     # - "3002:3002"
   ```

## 🐛 문제 해결

### 컨테이너가 시작되지 않는 경우

```bash
# 상세 로그 확인
docker-compose logs service-name

# 컨테이너 상태 확인
docker-compose ps

# 헬스체크 상태 확인
docker inspect container-name
```

### 데이터베이스 연결 실패

```bash
# PostgreSQL 컨테이너 로그 확인
docker-compose logs user-service-db

# 데이터베이스 연결 테스트
docker-compose exec user-service-db pg_isready -U postgres
```

### 포트 충돌

기본 포트가 사용 중인 경우 `docker-compose.yml`에서 포트를 변경:

```yaml
ports:
  - "8080:80"    # nginx
  - "5433:5432"  # postgresql
```

## 📊 모니터링

### 리소스 사용량 확인

```bash
# 컨테이너 리소스 사용량
docker stats

# 특정 컨테이너만
docker stats vehicle-game-user-service vehicle-game-game-service
```

### 헬스체크 상태

```bash
# 헬스체크 상태 확인
docker-compose ps

# 상세 헬스체크 정보
docker inspect --format='{{.State.Health.Status}}' container-name
```

## 🔄 업데이트

### 애플리케이션 업데이트

```bash
# 1. 최신 코드 pull
git pull

# 2. 이미지 다시 빌드
docker-compose build

# 3. 서비스 재시작
docker-compose up -d
```

### 무중단 업데이트

```bash
# 1. 새 이미지 빌드
docker-compose build

# 2. 서비스별 순차 업데이트
docker-compose up -d --no-deps user-service
docker-compose up -d --no-deps game-service
``` 