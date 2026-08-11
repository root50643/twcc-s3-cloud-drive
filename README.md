# TWCC S3 Cloud Drive

前後端分離的 S3-compatible 檔案瀏覽與下載系統。React 前端只呼叫 REST API；Express 後端保管 S3 金鑰、驗證帳號權限並產生短效 presigned URL。系統支援多帳號、管理員介面、每帳號 S3 路徑、批量下載與稽核紀錄。

![TWCC S3 Cloud Drive 登入畫面](docs/images/login-screen.png)

## Features

- Argon2id 密碼雜湊與 SQLite 帳號資料庫
- `admin` / `user` 角色及最後管理員保護
- 管理員可新增、刪除、重設密碼及設定每帳號 S3 prefix
- 使用者可更換自己的密碼，所有既有 Session 會立即失效
- 登入、下載連結簽發及管理操作稽核，預設保留 180 天
- 資料夾瀏覽、breadcrumb、搜尋、修改時間由新到舊排序
- 單檔下載及最多 20 個獨立檔案批量下載
- SQLite Session、CSRF token、登入限流與安全 Cookie
- Docker Compose 部署，只有 Nginx frontend 對外開放 port

## Architecture

```text
Browser
  -> frontend (Nginx :80)
       -> /api/v1/*
            -> backend (Express :3000, compose internal only)
                 -> SQLite (/app/data/app.sqlite)
                 -> S3-compatible endpoint
```

S3 Access Key、Secret Key、bucket 及 Session secret 只存在部署主機的 `.env`。SQLite 與 `.env` 均不會提交 GitHub。

## Quick Start

需求：Linux 主機、Docker Engine 與 Docker Compose v2。

```bash
git clone https://github.com/root50643/twcc-s3-cloud-drive.git
cd twcc-s3-cloud-drive
cp .env.example .env
mkdir -p data
```

編輯 `.env`，至少設定 `SESSION_SECRET`、S3 endpoint、bucket 與金鑰。接著建置並初始化第一位管理員：

```bash
docker compose build
docker compose run --rm --no-deps backend npm run db:init -- \
  --username admin \
  --s3-prefix uploads/
```

初始化程式會在容器內要求輸入並確認密碼，輸入內容不會顯示。主機不需要安裝 Node.js 或 SQLite。

```bash
docker compose up -d
docker compose ps
```

開啟 `http://your-linux-host:8080`。正式環境應由 HTTPS reverse proxy 對外服務，詳見 [部署指南](docs/DEPLOYMENT.md)。

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `SESSION_SECRET` | required | Session 簽章秘密，至少 24 字元 |
| `COOKIE_SECURE` | `false` | HTTPS 正式環境設為 `true` |
| `SESSION_IDLE_MINUTES` | `60` | Session 閒置期限 |
| `SESSION_ABSOLUTE_HOURS` | `12` | Session 絕對期限 |
| `TRUST_PROXY_HOPS` | `1` | Backend 前方可信任的 proxy 層數 |
| `LOGIN_RATE_LIMIT_WINDOW_MINUTES` | `15` | 登入失敗計算窗口 |
| `LOGIN_RATE_LIMIT_PER_USERNAME` | `10` | 每帳號窗口內失敗上限 |
| `LOGIN_RATE_LIMIT_PER_IP` | `30` | 每 IP 窗口內失敗上限 |
| `AUDIT_RETENTION_DAYS` | `180` | 所有稽核紀錄保留天數 |
| `S3_ENDPOINT` | required | S3-compatible HTTPS endpoint |
| `S3_BUCKET` | required | 固定 bucket |
| `S3_REGION` | `us-east-1` | S3 signing region |
| `S3_ACCESS_KEY_ID` | required | 後端專用 Access Key |
| `S3_SECRET_ACCESS_KEY` | required | 後端專用 Secret Key |
| `S3_FORCE_PATH_STYLE` | `true` | 是否使用 path-style URL |
| `SIGNED_URL_EXPIRES_SECONDS` | `300` | 下載網址有效秒數，允許 30–3600 |
| `FRONTEND_PORT` | `8080` | 對外 HTTP port |
| `DATABASE_FILE` | `/app/data/app.sqlite` | 容器內 SQLite 路徑 |

每個帳號的 S3 prefix 由管理員在網頁設定，不再使用全域 root prefix。一般使用者不可使用空白 prefix；管理員的空白 prefix 代表整個 bucket。

## Development

本機需要 Node.js 24 與 pnpm：

```bash
pnpm install
pnpm dev:backend
pnpm dev:frontend
```

驗證指令：

```bash
pnpm typecheck
pnpm test
pnpm build
docker compose config
docker compose build
```

瀏覽器可能會在第一次批量下載時要求允許網站下載多個檔案。系統每批最多簽發 20 個獨立下載，不建立 ZIP，也不由 backend 傳輸檔案內容。

## Documentation

- [Deployment and operations](docs/DEPLOYMENT.md)
- [Account administration](docs/ADMINISTRATION.md)
- [REST API](docs/API.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Security design](docs/SECURITY.md)

## GitHub Safety

可提交：原始碼、Docker 設定、`.env.example`、lockfile 及 Markdown 文件。

不可提交：`.env`、`data/`、SQLite/WAL/journal、真實帳密、S3 金鑰、Session cookie、presigned URL 或備份檔。推送前請執行：

```bash
git status --short
git check-ignore .env data/app.sqlite
```
