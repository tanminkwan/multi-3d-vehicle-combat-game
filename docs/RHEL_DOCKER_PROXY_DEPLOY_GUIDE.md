# Red Hat (RHEL) + HTTP Proxy 환경 Docker 설치·배포 E2E 가이드

Red Hat Enterprise Linux (RHEL 8/9) 서버에서 **사내 HTTP Proxy**를 거쳐 `git clone`부터 Docker 이미지 빌드, 서비스 기동, 방화벽/SELinux 설정, 종단 간(E2E) 동작 확인까지 한 번에 진행하는 가이드입니다.

> **안내**: 문서 내 `<PROXY_HOST>`, `<PROXY_PORT>`, `<YOUR_DB_PASSWORD>`, `<YOUR_JWT_SECRET>` 등은 실제 환경 값으로 치환해서 사용하세요.

---

## 1. 사전 준비: 쉘 & Git HTTP Proxy 설정

### 1.1 현재 쉘 프록시 환경 변수 설정
```bash
export HTTP_PROXY="http://<PROXY_HOST>:<PROXY_PORT>"
export HTTPS_PROXY="http://<PROXY_HOST>:<PROXY_PORT>"
export http_proxy="$HTTP_PROXY"
export https_proxy="$HTTPS_PROXY"
export NO_PROXY="localhost,127.0.0.1,::1,user-service,game-service,user-service-db,nginx"
export no_proxy="$NO_PROXY"
```
> **중요**: `NO_PROXY`에 `localhost,127.0.0.1` 및 내부 Docker 서비스명(`user-service`, `game-service`, `user-service-db`, `nginx`)을 반드시 포함해야 컨테이너 헬스체크(`curl http://localhost:...`)가 프록시를 타지 않고 정상 통과합니다.

*(프록시 인증이 필요한 경우 `http://<USER>:<PASS>@<PROXY_HOST>:<PROXY_PORT>` 형식 사용)*

### 1.2 Git 프록시 설정 및 저장소 Clone
```bash
# Git 설치 확인 (미설치 시)
sudo dnf install -y git

# Git 프록시 설정
git config --global http.proxy "http://<PROXY_HOST>:<PROXY_PORT>"
git config --global https.proxy "http://<PROXY_HOST>:<PROXY_PORT>"

# 저장소 클론
git clone https://github.com/tanminkwan/multi-3d-vehicle-combat-game.git
cd multi-3d-vehicle-combat-game
```

---

## 2. RHEL에 Docker Engine & Docker Compose 설치

### 2.1 `dnf` 프록시 설정 (필요 시)
`/etc/dnf/dnf.conf`에 아래 항목이 없다면 추가합니다.
```ini
proxy=http://<PROXY_HOST>:<PROXY_PORT>
```

### 2.2 Docker 설치 (RHEL 8/9)
```bash
# 기존 podman 충돌 패키지 제거 (선택, Docker CE 사용 시)
sudo dnf remove -y podman buildah

# Docker 공식 리포지토리 등록 및 설치
sudo dnf install -y dnf-utils
sudo dnf config-manager --add-repo https://download.docker.com/linux/rhel/docker-ce.repo
sudo dnf install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# 현재 사용자 docker 그룹 추가 (재로그인 또는 newgrp docker 필요)
sudo usermod -aG docker $USER
```

---

## 3. Docker Daemon 및 Build HTTP Proxy 설정

### 3.1 Docker Daemon 프록시 설정 (`docker pull` 용)
`postgres:15`, `node:18-alpine`, `nginx:alpine` 이미지를 받기 위해 systemd 프록시를 설정합니다.

```bash
sudo mkdir -p /etc/systemd/system/docker.service.d

sudo tee /etc/systemd/system/docker.service.d/http-proxy.conf > /dev/null <<'EOF'
[Service]
Environment="HTTP_PROXY=http://<PROXY_HOST>:<PROXY_PORT>"
Environment="HTTPS_PROXY=http://<PROXY_HOST>:<PROXY_PORT>"
Environment="NO_PROXY=localhost,127.0.0.1,::1,user-service,game-service,user-service-db,nginx"
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now docker

# 프록시 반영 확인
sudo systemctl show --property=Environment docker
```

### 3.2 Docker CLI / Build 프록시 설정 (`apk add`, `npm ci` 용)
`Dockerfile` 빌드 단계에서 `apk add curl`과 `npm ci`가 외부 네트워크를 사용하므로, `~/.docker/config.json`에 프록시를 등록해 두면 빌드 시 자동으로 주입됩니다.

```bash
mkdir -p ~/.docker
cat <<'EOF' > ~/.docker/config.json
{
  "proxies": {
    "default": {
      "httpProxy": "http://<PROXY_HOST>:<PROXY_PORT>",
      "httpsProxy": "http://<PROXY_HOST>:<PROXY_PORT>",
      "noProxy": "localhost,127.0.0.1,::1,user-service,game-service,user-service-db,nginx"
    }
  }
}
EOF
```

*(사내 SSL 검사 프록시로 인해 `UNABLE_TO_VERIFY_LEAF_SIGNATURE` 등이 발생하면 사내 Root CA 인증서를 시스템/Node에 추가하거나, 임시 확인 시 빌드 인자로 `NODE_TLS_REJECT_UNAUTHORIZED` 검토)*

---

## 4. 운영 환경 설정 (보안, 맛보기 모드, SELinux, 방화벽)

### 4.1 민감 정보 및 맛보기 모드 설정
운영 서버에서는 [docker-compose.yml](../docker-compose.yml)의 기본 비밀번호와 `JWT_SECRET`을 반드시 안전한 값으로 변경하세요.
- `user-service-db`: `POSTGRES_PASSWORD` (및 [init-db.sql](../services/user-service/scripts/init-db.sql)의 `app_user` 비밀번호)
- `user-service`: `DB_PASS`, `JWT_SECRET`, `ALLOW_GUEST_MODE`
- `game-service`: `JWT_SECRET` (`user-service`와 동일해야 함)

**맛보기(게스트) 모드 제어**:
- 기본값은 허용(`ALLOW_GUEST_MODE=true`)입니다.
- 비활성화하려면 실행 시 환경 변수를 지정합니다:
  ```bash
  export ALLOW_GUEST_MODE=false   # 또는 true
  ```

### 4.2 RHEL SELinux 컨텍스트 허용 (Enforcing 환경)
RHEL에서 SELinux가 `Enforcing`이면 볼륨 마운트(`./nginx.conf`, `./client`, `./services/user-service/scripts/init-db.sql`) 시 `Permission denied`가 발생할 수 있습니다. 프로젝트 루트에서 한 번 실행합니다:
```bash
getenforce
# Enforcing 출력 시 아래 실행
sudo chcon -Rt container_file_t ./nginx.conf ./client ./services/user-service/scripts/init-db.sql
```

### 4.3 방화벽(firewalld) 80 포트 개방
외부 브라우저에서 `http://<RHEL_SERVER_IP>`로 접속할 수 있도록 HTTP 포트를 엽니다.
```bash
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --reload
sudo firewall-cmd --list-services
```

---

## 5. Docker 빌드 및 서비스 기동

### 5.1 운영 모드 기동 (권장)
`docker-compose.override.yml`(개발용 `nodemon` 설정)을 제외하고 운영용 `docker-compose.yml`만으로 빌드·기동합니다.
```bash
# 빌드 (프록시 build-arg 명시 전달)
docker compose -f docker-compose.yml build \
  --build-arg HTTP_PROXY="$HTTP_PROXY" \
  --build-arg HTTPS_PROXY="$HTTPS_PROXY" \
  --build-arg NO_PROXY="$NO_PROXY"

# 백그라운드 기동
docker compose -f docker-compose.yml up -d
```

> **개발 모드**로 소스 변경 시 자동 리로드(`nodemon`)가 필요하면 `-f docker-compose.yml` 없이 `docker compose up -d --build`를 사용합니다.

### 5.2 컨테이너 기동 및 헬스체크 확인
```bash
docker compose -f docker-compose.yml ps
```
아래 4개 컨테이너가 모두 `Up (healthy)` 상태여야 합니다:
- `vehicle-game-postgres`
- `vehicle-game-user-service`
- `vehicle-game-game-service`
- `vehicle-game-nginx` (`0.0.0.0:80->80/tcp`)

문제 발생 시 로그 확인:
```bash
docker compose -f docker-compose.yml logs -f
```

---

## 6. E2E 동작 검증

### 6.1 API & 클라이언트 빠른 스모크 테스트 (`curl`)
서버 내부에서 프록시를 우회(`--noproxy '*'`)하여 전체 스택을 검증합니다.

```bash
# 1. Nginx 정적 클라이언트 응답 확인 (200 OK)
curl -I --noproxy '*' http://localhost/

# 2. 공개 인증 설정(맛보기 모드) 확인
curl -s --noproxy '*' http://localhost/api/auth/users/auth-config
# 기대 결과: {"success":true,"allowGuestMode":true}

# 3. 맛보기(게스트) 계정 발급 및 JWT 토큰 획득
GUEST_RES=$(curl -s --noproxy '*' -X POST http://localhost/api/auth/users/guest \
  -H "Content-Type: application/json" -d '{}')
echo "$GUEST_RES"
# 기대 결과: {"success":true,"user":{"username":"guest1","isGuest":true,...},"token":"..."}

# 4. 게임 서비스 상태 확인 (JWT 인증 포함)
TOKEN=$(echo "$GUEST_RES" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
curl -s --noproxy '*' -H "Authorization: Bearer $TOKEN" http://localhost/api/game/api/status
```

### 6.2 브라우저 접속 테스트
1. PC 브라우저에서 `http://<RHEL_SERVER_IP>` 접속
2. 로그인 화면에서 **`🎮 맛보기 (게스트 참여)`** 클릭 (또는 회원가입 후 로그인)
3. 기체 선택 화면에서 `서버 연결됨` 표시 확인 → 기체 선택 → **`게임 참가`** 클릭
4. 3D 화면, NPC(`NPC1~NPC7`), 조작(WASD / P / M), `🚪 게임 나가기` 동작 확인

### 6.3 (선택) Playwright Headless Browser E2E 자동화 테스트
RHEL 서버에 Node.js 18+가 설치되어 있다면 전체 E2E 테스트 스위트를 실행할 수 있습니다.
```bash
# npm 프록시 설정
npm config set proxy "http://<PROXY_HOST>:<PROXY_PORT>"
npm config set https-proxy "http://<PROXY_HOST>:<PROXY_PORT>"

# 루트 의존성 및 Chromium 설치
npm install
npx playwright install chromium

# E2E 테스트 실행 (프록시 우회로 localhost 접속)
NO_PROXY="localhost,127.0.0.1" npx playwright test
```

---

## 7. 운영 관리 & 트러블슈팅

### 자주 쓰는 운영 명령
```bash
# game-config.yaml 변경 후 반영
docker compose -f docker-compose.yml restart game-service

# 서비스 중지 (DB 데이터 볼륨 유지)
docker compose -f docker-compose.yml down

# DB 볼륨까지 완전 초기화 후 재기동
docker compose -f docker-compose.yml down -v
docker compose -f docker-compose.yml up -d --build
```

### 자주 발생하는 문제 해결
| 증상 | 원인 | 해결 |
|---|---|---|
| `docker pull` 타임아웃 | Docker Daemon 프록시 미설정 | 3.1절 `/etc/systemd/system/docker.service.d/http-proxy.conf` 확인 후 `systemctl restart docker` |
| `apk add` / `npm ci` 빌드 실패 | 빌드 컨테이너에 프록시 미전달 | 3.2절 `~/.docker/config.json` 설정 또는 `--build-arg HTTP_PROXY=...` 전달 |
| 컨테이너가 `unhealthy` 유지 | `curl http://localhost:...`가 프록시를 경유함 | `NO_PROXY`에 `localhost,127.0.0.1` 포함 확인 |
| nginx 시작 시 `nginx.conf` `Permission denied` | RHEL SELinux 차단 | 4.2절 `sudo chcon -Rt container_file_t ...` 실행 |
| 외부에서 `http://<IP>` 접속 불가 | RHEL `firewalld` 80 포트 차단 | 4.3절 `firewall-cmd --permanent --add-service=http` 실행 |
