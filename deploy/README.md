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

GHCR 包当前是公开的，裸服务器只需要 Docker 和 Docker Compose v2：

```bash
cd deploy
chmod +x ./start-app.sh
./start-app.sh
```

脚本会交互式生成或更新 `.env`，拉取公开镜像并启动服务。常用非交互参数：

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
# 编辑 .env，至少把 GHCR_NAMESPACE 改成你的组织/用户名
docker compose -f docker-compose.ghcr.yml --env-file .env up -d
```

## 4) 关键配置说明

- `deploy/docker-compose.ghcr.yml`
  - `web` 使用 Nginx 托管前端，并将 `/api/*` 反向代理到 `backend`。
  - `sandbox` 使用独立 Nginx 容器和端口托管 opaque plugin broker，不携带登录 Cookie 或用户数据；未知路径固定返回 404。
  - `backend` 通过 `BACKEND_DB_URL` 连接 `postgres`。
  - `postgres` 挂载了：
    - `deploy/postgres/postgresql.conf`
    - `deploy/postgres/init/001-extensions.sql`
- `apps/web/Dockerfile`
  - 通过 `VITE_API_BASE=/` 构建前端，运行时走同域 `/api`。
  - GitHub Actions repository variable `VITE_PLUGIN_SANDBOX_URL` 必须配置为公开 sandbox origin 的 `runtime-broker.html` URL；未配置时 runtime activation 保持 fail closed。
- `apps/plugin-sandbox/Dockerfile`
  - 构建时生成带脚本哈希的 CSP、Permissions Policy、Cloudflare `_headers` 和 production `nginx.conf`。
  - `deploy-smoke.yml` 在 `main` push 上先从当前源码构建三个本地镜像，再用 `--skip-pull` 启动 Compose，避免与 GHCR 发布工作流竞态；手动触发时仍可验证指定的已发布 image tag。
  - 部署 smoke 会访问真实 Nginx 响应，验证 CSP 哈希、跨域脚本头、无 Cookie 和未知路径 404。
- `apps/backend/Dockerfile`
  - 构建入口改为 `./cmd/server`，输出可运行的后端二进制。
