# Docker + GitHub Actions 部署

## 1) GitHub Actions 构建并推送镜像

工作流文件：`.github/workflows/docker-images.yml`

- 推送到 `main` 或打 `v*` tag 时自动构建。
- 构建三个镜像并推送到 GHCR：
  - `ghcr.io/<owner>/prodivix-backend`
  - `ghcr.io/<owner>/prodivix-web`
  - `ghcr.io/<owner>/prodivix-plugin-sandbox`
- 同时打 `latest`（默认分支）、`sha-*`、`tag` 三种标签。

## 2) 服务器上交互式部署（无需本地构建）

GHCR 包当前是公开的，裸服务器只需要 Docker 和 Docker Compose v2.24 或更新版本：

```bash
cd deploy
chmod +x ./start-app.sh
./start-app.sh
```

脚本会交互式生成或更新 owner-only 的 `.env`，并生成或复用 Postgres 密码和
`BACKEND_VERIFICATION_RESUME_KEY`，随后拉取公开镜像并启动服务。常用非交互参数：

```bash
./start-app.sh --yes --tag latest
./start-app.sh --tag sha-95bd22e
./start-app.sh --skip-pull
```

默认数据库端口只绑定 `127.0.0.1:5432`，避免直接暴露到公网。

## 3) 手动拉取并启动

```bash
cd deploy
cp .env.example .env
# 编辑 .env：至少修改 GHCR_NAMESPACE、POSTGRES_PASSWORD，并把
# BACKEND_VERIFICATION_RESUME_KEY 替换为 32 个随机字节的 canonical standard-base64
docker compose -f docker-compose.ghcr.yml --env-file .env up -d
```

## 4) 关键配置说明

- `deploy/docker-compose.ghcr.yml`
  - `web` 使用 Nginx 托管前端，并将 `/api/*` 反向代理到 `backend`。
  - `sandbox` 使用独立 Nginx 容器和端口托管 opaque plugin broker，不携带登录 Cookie 或用户数据；未知路径固定返回 404。
  - `backend` 通过 `BACKEND_DB_URL` 连接 `postgres`；`BACKEND_VERIFICATION_RESUME_KEY`
    必须在所有 Backend replica 和 active promotion 恢复窗口内保持一致。轮换前应先排空旧恢复窗口。
  - `backend` 将 Verification artifact 字节保存在 `verification-artifacts` named volume，固定路径为
    `/app/data/verification`；镜像预先创建由运行用户拥有的目录。备份与恢复必须同时包含 PostgreSQL
    和这个 volume，恢复期间停止写入；只恢复数据库不能恢复 artifact 字节。`docker compose down -v`
    会删除这两份持久数据。
  - 密码重置配置通过 `BACKEND_PASSWORD_RESET_URL/TTL` 与 `BACKEND_SMTP_HOST/PORT/FROM/USERNAME/PASSWORD/TLS_MODE`
    显式传入 Backend。生产 reset URL 必须是无 query/fragment 的可信 HTTPS 页面，例如
    `https://editor.example.com/reset-password`；SMTP 使用 `starttls` 或 `implicit`。
    必填 URL、HOST、FROM 未配置时服务保持禁用。`start-app.sh` 会保留已配置的这些值。
  - `postgres` 挂载了：
    - `deploy/postgres/postgresql.conf`
    - `deploy/postgres/init/001-extensions.sql`
- `apps/web/Dockerfile`
  - 通过 `VITE_API_BASE=/` 构建前端，运行时走同域 `/api`。
  - Nginx 在成功和错误响应上发送 `Cross-Origin-Opener-Policy: same-origin` 与
    `Cross-Origin-Embedder-Policy: credentialless`，与开发环境保持相同的浏览器运行时隔离条件。
  - GitHub Actions repository variable `VITE_PLUGIN_SANDBOX_URL` 必须配置为公开 sandbox origin 的 `runtime-broker.html` URL；未配置时 runtime activation 保持 fail closed。
- `apps/plugin-sandbox/Dockerfile`
  - 构建时生成带脚本哈希的 CSP、Permissions Policy、Cloudflare `_headers` 和 production `nginx.conf`。
  - `deploy-smoke.yml` 在 `main` push 上先从当前源码构建三个本地镜像，再用 `--skip-pull` 启动 Compose，避免与 GHCR 发布工作流竞态；手动触发时仍可验证指定的已发布 image tag。
  - 部署 smoke 会访问真实 Nginx 响应，验证 CSP 哈希、跨域脚本头、无 Cookie 和未知路径 404。
- `apps/backend/Dockerfile`
  - 构建入口改为 `./cmd/server`，输出可运行的后端二进制。

## 5) 服务器端 AI 草案配置

浏览器仅选择服务器公开的 provider/model ID。需要计划草案时，将 `backend.env.example`
复制为 `backend.env`，替换 HTTPS endpoint、模型与服务器凭据，再执行 `chmod 600 backend.env`
并重建 Backend 容器。Compose 的可选 `env_file` 仅注入 Backend；交互部署脚本不会重写这个文件。
凭据的环境变量引用必须与 `credentialEnvironmentKey` 相同，实际值只在短期服务端请求 callback 内使用。
未配置时公开目录为空，草案请求返回不可用状态。

`/api/agent/drafts` 仅返回经过严格解码的计划草案。该入口不授予 Workspace 写权限，也不代表
Native Agent 的 provider qualification 或 G4 release evaluation 已通过。
