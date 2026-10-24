# VPS deployment — interview-ai-studio

Build 2 image trên local, đẩy cả 2 lên Docker Hub dưới cùng namespace `ngocnqph12806/`, rồi kéo về VPS — không clone git.

```
hub.docker.com/u/ngocnqph12806
├── interview-ai-studio         ← app (Next.js standalone)
└── interview-ai-studio-caddy   ← Caddy + bundle Caddyfile + entrypoint bcrypt guard
```

## Sơ đồ trên VPS

```
internet ── 443/80 ──► caddy (image custom)
                          │
                          │ nội bộ Docker network (KHÔNG public)
                          ▼
                   app (image: interview-ai-studio)
                   port nội bộ 12213, /data → named volume interview-data
                                              │
                                              ▼
                              data/interview_sessions.db (+ WAL · SHM)
```

Lưu ý:
- App là unauthenticated single-tenant. Caddy chặn basic-auth (file-mounted bcrypt secret) trước khi vào app.
- Caddy **tự xin và xoay vòng Let's Encrypt**, **tắt access log** (request có thể chứa `x-api-key` / Authorization / CV), **strip mọi header identity** (`Authorization`, `X-Forwarded-*`, `Cookie`, `X-Original-*`). Không đặt CDN/TLS proxy khác phía trước — sẽ làm hỏng Origin guard của app.
- Port `12213` không publish ra `0.0.0.0`.
- Origin guard (`lib/origin-guard.ts`) check `PUBLIC_ORIGIN` runtime, sai 1 ký tự là mọi POST/DELETE bị từ chối. Dev có thể tắt chặn origin tập trung qua env `DISABLE_ORIGIN_CHECK=1` (đọc trong `lib/origin-guard.ts`), nhưng **tuyệt đối không đặt trên VPS** — instance này chưa auth, mở là lộ toàn bộ mutation.

## Yêu cầu

- Tài khoản Docker Hub: `ngocnqph12806`.
- VPS Ubuntu 22.04+ (kernel bất kỳ Docker hỗ trợ).
- Domain + DNS: tạo A record `interview.your-domain.com` trỏ về IP VPS. Caddy cần verify để xin chứng chỉ.
- Mở firewall chỉ `22`, `80`, `443`. Không mở `12213`.
- Local: chỉ cần Docker (không cần Node).

## Giai đoạn 1 — Build & push cả 2 image (chạy local / CI)

> **Quan trọng — kiến trúc CPU.** `docker build` mặc định lấy kiến trúc của máy build. Build trên Mac Apple Silicon (arm64) mà triển khai lên VPS Linux/amd64 sẽ fail với lỗi `no matching manifest for linux/amd64`. Luôn dùng `docker buildx build --platform ... --push` để vừa build đúng arch vừa đẩy lên Hub. Bump tag mới (vd `1.0.5`) thay vì đè tag cũ — manifest cũ đã tồn tại trên Hub khó rollback.

```bash
docker login -u ngocnqph12806

cd "/Users/ngocshb/IdeaProjects/untitled folder"

# Buildx builder dùng docker-container driver (mặc định của Docker Desktop đã sẵn sàng)
docker buildx create --name multiarch --driver docker-container --use 2>/dev/null \
  || docker buildx use multiarch

TAG=1.0.5
NEXT_PUBLIC_PROVIDER_ENABLE_LIST=anthropic,openai,gemini,custom
SITE_DOMAIN_FOR_BUILD=interview.your-domain.com
```

### Cách A — multi-arch (khuyến nghị nếu có thể triển khai cả amd64 lẫn arm64)

```bash
# 1) Image app — Next.js standalone. NEXT_PUBLIC_* là build-arg → bake vào bundle.
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --build-arg NEXT_PUBLIC_PROVIDER_ENABLE=${NEXT_PUBLIC_PROVIDER_ENABLE_LIST} \
  --build-arg NEXT_PUBLIC_BASE_URL=https://${SITE_DOMAIN_FOR_BUILD} \
  -t ngocnqph12806/interview-ai-studio:${TAG} \
  -t ngocnqph12806/interview-ai-studio:latest \
  --push .

# 2) Image caddy — bundle Caddyfile + caddy-entrypoint.sh.
docker buildx build \
  -f Dockerfile.caddy \
  --platform linux/amd64,linux/arm64 \
  -t ngocnqph12806/interview-ai-studio-caddy:${TAG} \
  -t ngocnqph12806/interview-ai-studio-caddy:latest \
  --push .
```

### Cách B — chỉ amd64 (nhanh hơn, dùng khi chắc chắn chỉ triển khai VPS x86)

```bash
docker buildx build \
  --platform linux/amd64 \
  --build-arg NEXT_PUBLIC_PROVIDER_ENABLE=${NEXT_PUBLIC_PROVIDER_ENABLE_LIST} \
  --build-arg NEXT_PUBLIC_BASE_URL=https://${SITE_DOMAIN_FOR_BUILD} \
  -t ngocnqph12806/interview-ai-studio:${TAG} \
  -t ngocnqph12806/interview-ai-studio:latest \
  --push .

docker buildx build \
  -f Dockerfile.caddy \
  --platform linux/amd64 \
  -t ngocnqph12806/interview-ai-studio-caddy:${TAG} \
  -t ngocnqph12806/interview-ai-studio-caddy:latest \
  --push .
```

Dùng `--push` của buildx (không `docker push` riêng) để nó tự dựng manifest list rồi đẩy 1 phát.

### Kiểm tra manifest trên Hub

```bash
docker buildx imagetools inspect ngocnqph12806/interview-ai-studio:${TAG}
docker buildx imagetools inspect ngocnqph12806/interview-ai-studio-caddy:${TAG}
```

Trong output phải thấy `linux/amd64` (và `linux/arm64` nếu chọn Cách A) trong khối `Manifests: [...]`. Nếu chỉ có `linux/arm64` nghĩa là build chưa đúng platform.

Lưu ý build-arg:
- `NEXT_PUBLIC_PROVIDER_ENABLE`: provider hiện trong dropdown. Bỏ `,custom` nếu không dùng OpenAI-compatible local.
- `NEXT_PUBLIC_BASE_URL`: optional, dùng cho OAuth callback.
- `ALLOW_PRIVATE_BASE_URL`, `PUBLIC_ORIGIN`, `DISABLE_ORIGIN_CHECK`, `INTERVIEW_DB_PATH` không đặt lúc build — set khi chạy container. `DISABLE_ORIGIN_CHECK` đọc runtime trong `lib/origin-guard.ts` (server-only), bật/tắt không cần rebuild image.

## Giai đoạn 2 — Chuẩn bị VPS

### 2.1. Cài Docker + Compose plugin

```bash
sudo apt update && sudo apt install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu \
$(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update && sudo apt install -y \
  docker-ce docker-ce-cli containerd.io docker-compose-plugin

sudo usermod -aG docker $USER && newgrp docker
docker --version && docker compose version
```

### 2.2. Firewall

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
# 12213 không mở — chỉ Caddy nội bộ chạm được app
```

### 2.3. DNS

A record `interview.your-domain.com` → IP VPS.

```bash
dig +short interview.your-domain.com
```

## Giai đoạn 3 — Deploy (chỉ pull image, không clone repo)

### 3.1. Tạo secret basic-auth

App chưa có auth → chặn ít nhất 1 lớp basic auth qua Caddy.

```bash
# Thư mục root-only
sudo install -d -m 0700 /etc/interview-studio

# Hash password (KHÔNG truyền plain vào shell history)
docker run --rm -it caddy:2 caddy hash-password
# dán password 2 lần, copy dòng bcrypt bắt đầu $2a$/$2b$/$2y$

# Ghi 1 dòng duy nhất: "owner <bcrypt-hash>"
echo "owner \$2a\$08\$......bcrypt-hash-53-ký-tự-base64......" \
  | sudo tee /etc/interview-studio/basic-auth.users > /dev/null
sudo chmod 0400 /etc/interview-studio/basic-auth.users
```

`caddy-entrypoint.sh` (đã bake trong image Caddy custom) enforce format: 1 dòng, `owner `<bcrypt>. Sai → Caddy từ chối start.

### 3.2. Tạo file compose + env trên VPS

Không clone git. Tạo 1 folder trên VPS chỉ chứa `docker-compose.yml` + `.env`:

```bash
sudo install -d -o $USER /opt
mkdir -p /opt/interview-ai-studio && cd /opt/interview-ai-studio
```

Tạo file `docker-compose.yml`:

```yaml
# /opt/interview-ai-studio/docker-compose.yml
services:
  app:
    image: ngocnqph12806/interview-ai-studio:1.0.0
    pull_policy: always
    environment:
      PUBLIC_ORIGIN: https://${SITE_DOMAIN:?Set SITE_DOMAIN in .env}
      ALLOW_PRIVATE_BASE_URL: ${ALLOW_PRIVATE_BASE_URL:-0}
      INTERVIEW_DB_PATH: /data/interview_sessions.db
    volumes:
      - interview-data:/data
    networks: [backend]
    restart: unless-stopped
    # Không publish port 12213: chỉ Caddy trên backend network truy cập app.

  caddy:
    image: ngocnqph12806/interview-ai-studio-caddy:1.0.0
    pull_policy: always
    environment:
      SITE_DOMAIN: ${SITE_DOMAIN:?Set SITE_DOMAIN in .env}
    ports:
      - "80:80"
      - "443:443"
      - "443:443/udp"
    volumes:
      - caddy_data:/data
      - caddy_config:/config
    secrets:
      - basic_auth_snippet
    networks:
      - edge
      - backend
    depends_on: [app]
    restart: unless-stopped

secrets:
  basic_auth_snippet:
    file: ${AUTH_SNIPPET_PATH:?Set AUTH_SNIPPET_PATH in .env}

volumes:
  interview-data:
  caddy_data:
  caddy_config:

networks:
  edge:
  backend:
```

Tạo file `.env` cùng thư mục:

```bash
cat > /opt/interview-ai-studio/.env <<EOF
SITE_DOMAIN=interview.your-domain.com
AUTH_SNIPPET_PATH=/etc/interview-studio/basic-auth.users
ALLOW_PRIVATE_BASE_URL=0
EOF
chmod 0600 /opt/interview-ai-studio/.env
```

`PUBLIC_ORIGIN` không đặt trong `.env` — compose tự dựng từ `SITE_DOMAIN`. Để bật cho phép custom URL trỏ về private IP (Ollama/LM Studio nội bộ), đổi `ALLOW_PRIVATE_BASE_URL=1`.

### 3.3. Pull + chạy

```bash
cd /opt/interview-ai-studio

docker compose pull        # pull cả 2 image từ Docker Hub
docker compose up -d       # tạo network + named volumes, chạy app + caddy
docker compose ps
docker compose logs -f app
docker compose logs -f caddy
```

Sau ~30s mở `https://interview.your-domain.com` — popup basic auth → đăng nhập bằng user `owner`.

## Tổng kết cấu hình

| Biến | Đặt ở đâu | Thời điểm đọc | Mục đích |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_PROVIDER_ENABLE` | `--build-arg` khi build image app | Build time | Provider hiện trong dropdown |
| `NEXT_PUBLIC_BASE_URL` | `--build-arg` | Build time | Public URL, optional, OAuth callback |
| `PUBLIC_ORIGIN` | Runtime env (compose tự dựng `https://${SITE_DOMAIN}`) | Mỗi request | Origin guard chống CSRF |
| `ALLOW_PRIVATE_BASE_URL` | Runtime env, mặc định `"0"` | Mỗi request | Cho phép custom provider URL trỏ về private IP |
| `INTERVIEW_DB_PATH` | Runtime env, mặc định `/data/interview_sessions.db` | Khi mở DB | Vị trí SQLite + WAL + SHM |
| `DISABLE_ORIGIN_CHECK` | Dev-only, **không đặt trên VPS**. Mặc định `0` (fail-closed) | Mỗi request | Tắt chặn origin toàn app trong 1 chỗ (`lib/origin-guard.ts`). Chấp nhận `1`/`true`. Chỉ dùng local. |
| `SITE_DOMAIN` | Biến cho compose/Caddy | Runtime | Domain TLS + sinh `PUBLIC_ORIGIN` |
| `AUTH_SNIPPET_PATH` | Biến cho compose | Runtime | File basic-auth cho Caddy |

## Kiểm tra sau khi lên

```bash
# Healthcheck nội bộ (chạy từ máy local, vì firewall chặn 12213 từ ngoài)
docker exec interview-ai-studio-app-1 \
  node -e "fetch('http://127.0.0.1:12213/').then(r=>process.exit(r.ok?0:1))"
# expect exit code 0

# Chứng chỉ TLS
openssl s_client -connect interview.your-domain.com:443 -servername interview.your-domain.com \
  </dev/null 2>/dev/null | openssl x509 -noout -subject -issuer

# Anonymous → 401
curl -sS -o /dev/null -w "%{http_code}\n" https://interview.your-domain.com/

# Có basic-auth → 200
curl -sS -u owner:'your-plain-password' -o /dev/null -w "%{http_code}\n" \
  https://interview.your-domain.com/

# Port 12213 phải đóng từ ngoài
nc -zv <VPS-IP> 12213    # expect connection refused
```

## Troubleshooting

| Triệu chứng | Nguyên nhân / xử lý |
| --- | --- |
| `Error response from daemon: no matching manifest for linux/amd64 in the manifest list entries` khi `docker compose pull` | Image trên Hub chỉ có manifest cho `linux/arm64` (build từ Mac Apple Silicon, dùng `docker build` thường). Build lại với `docker buildx build --platform linux/amd64,linux/arm64 --push` (xem lại Giai đoạn 1) rồi bump tag mới trong `docker-compose.yml`. |
| Caddy log: `Invalid Basic Auth secret; refusing to start Caddy` | File secret sai format (không phải 1 dòng, hash hỏng, thiếu newline cuối). Sửa file rồi `docker compose restart caddy`. |
| Caddy xin TLS thất bại | DNS chưa trỏ về VPS, hoặc port 80/443 bị firewall chặn. Verify `dig +short` + `curl -I http://<domain>/.well-known/acme-challenge/...`. |
| Browser hoặc curl trả `"Forbidden origin"` / `Invalid origin, request rejected` (POST/DELETE 403) | `lib/origin-guard.ts` so sánh `Origin` header với env `PUBLIC_ORIGIN`. Gọi thẳng `http://IP:12213/...` thường sai vì `PUBLIC_ORIGIN` đang là `https://<domain>`. Kiểm tra `docker exec interview-ai-studio-app-1 printenv PUBLIC_ORIGIN` — phải đúng scheme + host browser/curl gửi. Đường chính thức: mở app qua `https://interview.your-domain.com` (qua Caddy), không gọi thẳng port 12213. |
| BYOK Test key fail với custom URL trỏ về IP nội bộ (vd `http://10.x.x.x:11434/v1`) | `ALLOW_PRIVATE_BASE_URL=0` (mặc định). Đổi thành `1` trong `/opt/interview-ai-studio/.env`, `docker compose up -d`. Link-local/metadata IP vẫn bị chặn. |
| Dropdown provider thiếu `custom` | Quên `,custom` trong `--build-arg NEXT_PUBLIC_PROVIDER_ENABLE` lúc build. Build + push image app với tag mới, sửa tag trong `docker-compose.yml`, `docker compose pull app && docker compose up -d`. |
| Custom URL → `http://localhost:11434` không gọi được | `ALLOW_PRIVATE_BASE_URL=0`. Đổi thành `1` trong `.env`, `docker compose up -d`. |
| Container `app` restart vòng lặp | `docker compose logs app` xem chi tiết. Hay gặp khi volume `interview-data` chưa được tạo. Kiểm tra `docker volume ls`. |
| `docker compose pull` 401/403 | Chưa `docker login` trên VPS, hoặc 1 trong 2 repo (`interview-ai-studio`, `interview-ai-studio-caddy`) chưa public. |
| `interview-data` volume trống sau pull image mới | Volume độc lập với image → DB phải còn. Nếu trống, đã lỡ `down -v` trước đó. Phục hồi từ backup. |

## Cập nhật phiên bản

Trước lần nâng cấp có migration SQLite v4 (cột `sessions.origin_lesson_id` trỏ tới bài học), **dừng app**, sao lưu SQLite nhất quán trên volume đang dùng (bao gồm các WAL frame) rồi kiểm tra bản backup bằng `PRAGMA integrity_check` trên **bản sao**, trước khi khởi chạy image mới. Giữ bản DB v3 nguyên vẹn ngoài volume production. Không dùng JSON backup v4 để rollback image v3: image cũ không đọc DB v4 và JSON import cũ không biết cột nguồn bài học. Nếu cần rollback, dừng app và phục hồi bản DB v3 trước upgrade vào **bản sao volume**, kiểm chứng rồi mới chuyển volume; không chạy down-migration/xóa cột trên DB đang hoạt động. Liên kết bài học gốc phát sinh sau upgrade không thể biểu diễn trong DB v3 và sẽ mất khi rollback.

```bash
# local
docker login -u ngocnqph12806
cd "/Users/ngocshb/IdeaProjects/untitled folder"
NEW_TAG=1.1.0

# Image app — bump tag mới (vd 1.1.0). Bám sát platform multi-arch hoặc amd64-only.
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --build-arg NEXT_PUBLIC_PROVIDER_ENABLE=anthropic,openai,gemini,custom \
  --build-arg NEXT_PUBLIC_BASE_URL=https://interview.your-domain.com \
  -t ngocnqph12806/interview-ai-studio:${NEW_TAG} \
  -t ngocnqph12806/interview-ai-studio:latest \
  --push .

# Image caddy chỉ build lại khi Caddyfile / caddy-entrypoint.sh đổi.
# Nếu không đổi, giữ nguyên tag hiện tại trên Hub.
docker buildx build \
  -f Dockerfile.caddy \
  --platform linux/amd64,linux/arm64 \
  -t ngocnqph12806/interview-ai-studio-caddy:${NEW_TAG} \
  -t ngocnqph12806/interview-ai-studio-caddy:latest \
  --push .

# VPS
cd /opt/interview-ai-studio
# sửa tag trong docker-compose.yml -> ${NEW_TAG}
docker compose pull
docker compose up -d
docker image prune   # dọn manifest cũ
```

`interview-data` named volume được giữ nguyên → database sống tiếp.

## Sao lưu SQLite (an toàn khi WAL đang bật)

App dùng `node:sqlite` ở chế độ WAL → **không copy trực tiếp `.db`** lúc container đang chạy. Ví dụ trước migration v4, dừng app (không dùng `down -v`), dùng SQLite `.backup` trên volume, kiểm tra file nhận rồi mới chạy image mới:

```bash
mkdir -p /opt/backups
cd /opt/interview-ai-studio
docker compose stop app
# Volume name mặc định theo project compose; kiểm tra bằng `docker volume ls` nếu đổi project name.
docker run --rm \
  -v interview-ai-studio_interview-data:/data:ro \
  -v /opt/backups:/backup \
  alpine sh -c "apk add sqlite && \
    sqlite3 /data/interview_sessions.db \
    \".backup /backup/interview_\$(date +%F).db\""
docker run --rm -v /opt/backups:/backup:ro alpine sh -c \
  'apk add sqlite && sqlite3 /backup/interview_$(date +%F).db "PRAGMA integrity_check; PRAGMA user_version;"'
# Output integrity_check phải là ok; user_version phải là phiên bản trước nâng cấp.
# Giữ file .db này ngoài volume ứng dụng trước `docker compose up -d`.
```

Hoặc bấm **Backup** trong trang `/history` (JSON `schemaVersion=4`, 8 bảng; bao gồm CV text, transcripts, raw model output, endpoint URLs, bài học AI, đáp án quiz, lịch sử tự kiểm tra và liên kết buổi phỏng vấn với bài học gốc). File chứa dữ liệu nhạy cảm — encrypt + chmod + đặt ngoài webroot. Import v1/v2 chỉ khôi phục sáu bảng cũ, hai bảng học trống; import v3 giữ bài học và tự kiểm tra nhưng để liên kết nguồn trống. Restore thay thế toàn bộ dữ liệu, không gộp.

Để kiểm thử restore vào volume khác:

```bash
docker volume create interview-restore-drill
docker run --rm \
  -v /opt/backups:/backup:ro \
  -v interview-restore-drill:/target \
  alpine sh -c "apk add sqlite && \
    sqlite3 /target/restore.db \".restore /backup/interview_2026-10-21.db\" && \
    chmod 0644 /target/restore.db"
docker run --rm -v interview-restore-drill:/target:ro alpine sh -c \
  'apk add sqlite && sqlite3 /target/restore.db "PRAGMA integrity_check; PRAGMA user_version;"'
```

> Backup/restore qua web API **từ chối** nếu `.sql` legacy hoặc DB đã đổi sau khi operator review → mã 409. Re-run preview, không retry nguyên file cũ.
> In-process restore maintenance gate giả định đúng 1 app process — không add replica dùng chung volume.

## Reset / rotate

```bash
# Dừng, xoá containers + network (GIỮ volume interview-data)
cd /opt/interview-ai-studio
docker compose down

# Xoá cả DB
docker compose down -v

# Rotate secret basic-auth
HASH_NEW='$2a$08$...'    # từ `docker run --rm -it caddy:2 caddy hash-password`
echo "owner ${HASH_NEW}" | sudo tee /etc/interview-studio/basic-auth.users > /dev/null
sudo chmod 0400 /etc/interview-studio/basic-auth.users
docker compose restart caddy
```

## Gate an ninh cần check trước khi lộ production data

- Không đặt CDN/TLS proxy khác phía trước Caddy — `Caddyfile` đã strip mọi `X-Forwarded-*` / `Authorization` / `Cookie` / `X-Original-*` và set `Host`/`X-Forwarded-Host`/`X-Forwarded-For` từ chính nó. Lớp khác sẽ reset các header này → cần tái-evaluate.
- Bật giám sát disk `/data` (volume + WAL sidecars đầy → healthcheck fail).
- Bật alert khi `docker compose ps` thấy `caddy` hoặc `app` restart nhiều lần — cert không xoay được hoặc DB corrupted.
- Định kỳ `docker compose logs caddy 2>&1 | grep -i error` để bắt certificate renewal fail.
- `INTERVIEW_DB_PATH` mặc định `/data/interview_sessions.db` đã mount qua `interview-data` named volume — không đổi sang đường dẫn khác khi chưa migrate.
