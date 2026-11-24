# 👤 User Service

**Version:** v4.0  
**Port:** 3002  
**Database:** PostgreSQL  
**Architecture:** Independent Microservice

## 📖 서비스 개요

User Service는 사용자 인증, 권한 관리, 프로필 관리를 담당하는 독립적인 마이크로서비스입니다. JWT 토큰 기반 인증 시스템과 PostgreSQL 데이터베이스를 사용하여 사용자 데이터를 안전하게 관리합니다.

## 🎯 주요 기능

### 🔐 인증 시스템
- **회원가입**: 사용자명, 이메일, 비밀번호 기반 계정 생성
- **로그인**: JWT 토큰 발급을 통한 인증
- **게스트 계정**: 임시 사용자 계정 생성
- **토큰 검증**: JWT 토큰 유효성 검사

### 👥 사용자 관리
- **프로필 조회**: 사용자 정보 및 게임 통계 조회
- **차량 설정**: 선호 차량 타입 및 커스터마이징 설정
- **게임 통계**: 킬/데스, 점수, 플레이 시간 등 통계 관리
- **사용자 목록**: 관리자용 사용자 목록 조회

## 🏗️ 기술 스택

```json
{
  "dependencies": {
    "express": "^4.18.2",
    "sequelize": "^6.35.2",
    "pg": "^8.11.3",
    "bcryptjs": "^2.4.3",
    "jsonwebtoken": "^9.0.2",
    "express-rate-limit": "^7.1.5",
    "helmet": "^7.1.0",
    "cors": "^2.8.5",
    "dotenv": "^16.3.1"
  },
  "devDependencies": {
    "nodemon": "^3.0.2"
  }
}
```

## 🚀 빠른 시작

### 1. 환경 변수 설정

`.env` 파일을 생성하고 다음 내용을 입력하세요:

```env
# 서버 설정
NODE_ENV=development
PORT=3002

# 데이터베이스 설정
DB_TYPE=postgres
DB_HOST=localhost
DB_PORT=5432
DB_NAME=user_service
DB_USER=app_user
DB_PASS="<YOUR_DB_PASSWORD>"

# JWT 설정
JWT_SECRET="your-super-secret-jwt-key-change-in-production"
JWT_EXPIRY=24h

# 프록시 설정 (필요한 경우)
HTTP_PROXY=http://<PROXY_HOST>:<PROXY_PORT>
HTTPS_PROXY=http://<PROXY_HOST>:<PROXY_PORT>
NO_PROXY=localhost,127.0.0.1,::1
```

### 2. 데이터베이스 설정

PostgreSQL에서 데이터베이스와 사용자를 생성하세요:

```sql
-- PostgreSQL에 접속
psql -U postgres -h localhost

-- 데이터베이스 및 사용자 생성
CREATE DATABASE user_service;
CREATE USER app_user WITH PASSWORD '<YOUR_DB_PASSWORD>';
GRANT ALL PRIVILEGES ON DATABASE user_service TO app_user;

-- 연결 테스트
\c user_service app_user
\q
```

### 3. 의존성 설치 및 실행

```bash
# 의존성 설치
npm install

# 개발 모드 실행
npm run dev

# 프로덕션 모드 실행
npm start
```

## 📊 데이터베이스 스키마

### Users 테이블

```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE,
    password_hash VARCHAR(255),
    is_guest BOOLEAN DEFAULT true,
    preferred_vehicle_type VARCHAR(20) DEFAULT 'fighter',
    game_stats JSON DEFAULT '{"totalKills":0,"totalDeaths":0,"totalGames":0,"totalScore":0,"bestScore":0,"playTime":0}',
    customization JSON DEFAULT '{"vehicleColor":null,"unlockedItems":[],"equippedItems":[]}',
    game_points INTEGER DEFAULT 0,
    last_login_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL
);

-- 인덱스 생성
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_is_active ON users(is_active);
```

### 데이터 구조

#### game_stats JSON 구조
```json
{
  "totalKills": 0,
  "totalDeaths": 0,
  "totalGames": 0,
  "totalScore": 0,
  "bestScore": 0,
  "playTime": 0
}
```

#### customization JSON 구조
```json
{
  "vehicleColor": null,
  "unlockedItems": [],
  "equippedItems": []
}
```

## 🌐 API 엔드포인트

### 인증 API (인증 불필요)

#### POST /api/auth/users/register
사용자 회원가입

**Request Body:**
```json
{
  "username": "string",
  "email": "string",
  "password": "string"
}
```

**Response:**
```json
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "user": {
      "id": "uuid",
      "username": "string",
      "email": "string",
      "isGuest": false
    },
    "token": "jwt_token"
  }
}
```

#### POST /api/auth/users/login
사용자 로그인

**Request Body:**
```json
{
  "username": "string",
  "password": "string"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "id": "uuid",
      "username": "string",
      "email": "string",
      "isGuest": false,
      "preferredVehicleType": "fighter"
    },
    "token": "jwt_token"
  }
}
```

#### POST /api/auth/users/guest
게스트 계정 생성

**Response:**
```json
{
  "success": true,
  "message": "Guest user created successfully",
  "data": {
    "user": {
      "id": "uuid",
      "username": "Guest_12345",
      "isGuest": true
    },
    "token": "jwt_token"
  }
}
```

#### GET /api/auth/users/verify-token
JWT 토큰 검증 (nginx 내부 사용)

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "userId": "uuid",
    "username": "string",
    "isGuest": false
  }
}
```

### 사용자 API (인증 필요)

#### GET /api/user/users/profile
사용자 프로필 조회

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "username": "string",
    "email": "string",
    "isGuest": false,
    "preferredVehicleType": "fighter",
    "gameStats": {
      "totalKills": 10,
      "totalDeaths": 5,
      "totalGames": 3,
      "totalScore": 1500,
      "bestScore": 800,
      "playTime": 3600
    },
    "customization": {
      "vehicleColor": "#ff0000",
      "unlockedItems": ["skin1", "weapon1"],
      "equippedItems": ["skin1"]
    },
    "gamePoints": 100,
    "lastLoginAt": "2025-06-12T10:00:00Z",
    "createdAt": "2025-01-20T10:00:00Z"
  }
}
```

#### PUT /api/user/users/vehicle-settings
차량 설정 업데이트

**Request Body:**
```json
{
  "preferredVehicleType": "heavy",
  "customization": {
    "vehicleColor": "#00ff00",
    "equippedItems": ["skin2", "weapon2"]
  }
}
```

#### POST /api/user/users/game-stats
게임 통계 업데이트

**Request Body:**
```json
{
  "kills": 3,
  "deaths": 1,
  "score": 500,
  "playTime": 600
}
```

#### GET /api/user/users/list
사용자 목록 조회 (관리자용)

**Query Parameters:**
- `page`: 페이지 번호 (기본값: 1)
- `limit`: 페이지당 항목 수 (기본값: 10)
- `search`: 검색어 (사용자명 또는 이메일)

#### GET /api/user/database/info
데이터베이스 정보 조회

**Response:**
```json
{
  "success": true,
  "data": {
    "totalUsers": 150,
    "activeUsers": 120,
    "guestUsers": 30,
    "registeredUsers": 120,
    "databaseStatus": "connected"
  }
}
```

## 🔐 보안 기능

### JWT 토큰 구조

```json
{
  "header": {
    "alg": "HS256",
    "typ": "JWT"
  },
  "payload": {
    "userId": "uuid",
    "username": "string",
    "isGuest": "boolean",
    "iat": "timestamp",
    "exp": "timestamp"
  }
}
```

### 보안 미들웨어

1. **Helmet**: HTTP 헤더 보안
2. **CORS**: Cross-Origin 요청 제어
3. **Rate Limiting**: API 호출 제한 (1000 requests/15분)
4. **bcryptjs**: 비밀번호 해싱 (saltRounds: 10)
5. **Input Validation**: 요청 데이터 검증

### 비밀번호 정책

- 최소 6자 이상
- 영문, 숫자 조합 권장
- bcrypt 해싱 적용 (saltRounds: 10)

## 🛠️ 개발 가이드

### 프로젝트 구조

```
src/
├── controllers/
│   ├── authController.js      # 인증 관련 컨트롤러
│   └── userController.js      # 사용자 관리 컨트롤러
├── middleware/
│   ├── auth.js               # JWT 인증 미들웨어
│   ├── rateLimiter.js        # Rate limiting
│   └── validation.js         # 입력 검증
├── models/
│   ├── index.js              # Sequelize 설정
│   └── User.js               # User 모델
├── routes/
│   ├── auth.js               # 인증 라우트
│   └── user.js               # 사용자 라우트
├── config/
│   └── database.js           # 데이터베이스 설정
├── utils/
│   ├── jwt.js                # JWT 유틸리티
│   └── logger.js             # 로깅 유틸리티
└── index.js                  # 서버 진입점
```

### 환경별 설정

#### 개발 환경
```env
NODE_ENV=development
PORT=3002
DB_HOST=localhost
JWT_SECRET="dev-secret-key"
```

#### 프로덕션 환경
```env
NODE_ENV=production
PORT=3002
DB_HOST=production-db-host
JWT_SECRET="production-secret-key-very-long-and-secure"
```

## 🧪 테스트

### API 테스트

```bash
# 회원가입 테스트
curl -X POST http://localhost:3002/api/auth/users/register \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","email":"test@example.com","password":"password123"}'

# 로그인 테스트
curl -X POST http://localhost:3002/api/auth/users/login \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"password123"}'

# 프로필 조회 테스트 (토큰 필요)
curl -X GET http://localhost:3002/api/user/users/profile \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 데이터베이스 연결 테스트

```bash
# 데이터베이스 정보 조회
curl -X GET http://localhost:3002/api/user/database/info \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## 🔧 문제 해결

### 일반적인 문제들

#### 1. 데이터베이스 연결 실패
**증상**: `password authentication failed for user "app_user"`

**해결방법**:
```sql
-- PostgreSQL에서 사용자 재생성
DROP USER IF EXISTS app_user;
CREATE USER app_user WITH PASSWORD '<YOUR_DB_PASSWORD>';
GRANT ALL PRIVILEGES ON DATABASE user_service TO app_user;
```

#### 2. JWT 토큰 오류
**증상**: `invalid signature` 또는 `jwt malformed`

**해결방법**:
- Game Service와 동일한 JWT_SECRET 사용 확인
- 토큰 형식 확인 (Bearer 토큰)
- 토큰 만료 시간 확인

#### 3. 환경 변수 문제
**증상**: 특수문자가 포함된 비밀번호 인식 실패

**해결방법**:
```env
# 따옴표로 감싸기
DB_PASS="<YOUR_DB_PASSWORD>"  # ✅ 올바름
DB_PASS=<YOUR_PASSWORD_WITH_#>    # ❌ 틀림
```

#### 4. Rate Limiting 오류
**증상**: `429 Too Many Requests`

**해결방법**:
- API 호출 빈도 조절
- Rate limit 설정 확인 (현재: 1000 requests/15분)

## 📊 모니터링

### 로그 레벨

- **ERROR**: 시스템 오류, 데이터베이스 연결 실패
- **WARN**: 인증 실패, 잘못된 요청
- **INFO**: 사용자 등록, 로그인 성공
- **DEBUG**: 상세 디버그 정보 (개발 환경만)

### 성능 메트릭

- **응답 시간**: 평균 < 200ms
- **데이터베이스 쿼리**: 평균 < 100ms
- **메모리 사용량**: < 512MB
- **CPU 사용률**: < 70%

## 🚀 배포

### Docker 배포

```dockerfile
# Dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY src/ ./src/

EXPOSE 3002

CMD ["npm", "start"]
```

### 환경 변수 (프로덕션)

```env
NODE_ENV=production
PORT=3002
DB_HOST=postgres-server
DB_PORT=5432
DB_NAME=user_service
DB_USER=app_user
DB_PASS="secure-production-password"
JWT_SECRET="very-long-and-secure-production-jwt-secret-key"
JWT_EXPIRY=24h
```

## 📝 라이센스

MIT License

---

**🔐 User Service는 게임의 모든 사용자 인증과 관리를 담당하는 핵심 서비스입니다.**

**⚠️ 프로덕션 환경에서는 반드시 JWT_SECRET과 데이터베이스 비밀번호를 변경하세요!** 