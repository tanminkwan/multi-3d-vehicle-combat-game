# User Service - Database Setup Scripts

이 디렉토리는 User Service의 PostgreSQL 데이터베이스 설정을 위한 스크립트들을 포함합니다.

## 📁 파일 구조

```
scripts/
├── setup-database.bat     # PostgreSQL 데이터베이스 및 사용자 자동 생성
├── create-user.sql        # SQL 스크립트 (setup-database.bat에서 사용)
├── test-connection.bat    # 데이터베이스 연결 테스트
└── README.md             # 이 파일
```

## 🚀 사용 방법

### 1. 데이터베이스 설정 (최초 1회)

```bash
# User Service 디렉토리에서 실행
cd services/user-service
scripts/setup-database.bat
```

**생성되는 것들:**
- 데이터베이스: `vehicle_game`
- 사용자: `app_user` (비밀번호: `<YOUR_DB_PASSWORD>`)
- 필요한 권한들

### 2. 연결 테스트

```bash
scripts/test-connection.bat
```

**확인하는 것들:**
- PostgreSQL 서비스 상태
- 관리자 계정 연결
- User Service 데이터베이스 연결
- 포트 상태 (5432, 3002)

### 3. User Service 시작

```bash
# 데이터베이스 설정 완료 후
cd ..
npm start
```

## ⚙️ 환경 요구사항

- **PostgreSQL 17** (또는 호환 버전)
- **관리자 비밀번호**: `<YOUR_ADMIN_PASSWORD>` (환경 변수 `PGPASSWORD`로 전달)
- **Windows 환경** (배치 파일)

## 🔧 설정 변경

### PostgreSQL 관리자 비밀번호 변경
`setup-database.bat`와 `test-connection.bat`에서 다음 라인 수정:
```batch
set PGPASSWORD=your_admin_password
```

### 데이터베이스명 변경
`create-user.sql`에서 다음 라인 수정:
```sql
SELECT 'CREATE DATABASE your_db_name'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'your_db_name')\gexec
```

### User Service 사용자 정보 변경
`create-user.sql`에서 다음 라인 수정:
```sql
CREATE ROLE your_user LOGIN PASSWORD 'your_password';
```

## 🚨 문제 해결

### PostgreSQL 서비스가 시작되지 않는 경우
```bash
# 관리자 권한으로 실행
net start postgresql-x64-17
```

### 연결 실패 시
1. PostgreSQL 서비스 상태 확인
2. 관리자 비밀번호 확인
3. 방화벽 설정 확인
4. 포트 5432 사용 여부 확인

### 권한 오류 시
```sql
-- PostgreSQL에 관리자로 접속 후 실행
GRANT ALL PRIVILEGES ON DATABASE vehicle_game TO app_user;
```

## 📝 참고사항

- 이 스크립트들은 **개발 환경용**입니다
- 프로덕션에서는 보안을 고려한 별도 설정이 필요합니다
- User Service는 ORM(Sequelize)을 사용하여 테이블을 자동 생성합니다 