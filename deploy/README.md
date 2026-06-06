# Docker + GitHub Actions 部署

## 1) GitHub Actions 构建并推送镜像

工作流文件：`.github/workflows/docker-images.yml`

- 推送到 `main` 或打 `v*` tag 时自动构建。
- 构建两个镜像并推送到 GHCR：
  - `ghcr.io/<owner>/prodivix-backend`
  - `ghcr.io/<owner>/prodivix-web`
- 同时打 `latest`（默认分支）、`sha-*`、`tag` 三种标签。

## 2) 服务器上拉取并启动（无需本地构建）

```bash
cd deploy
cp .env.example .env
# 编辑 .env，至少把 GHCR_NAMESPACE 改成你的组织/用户名
docker compose -f docker-compose.ghcr.yml --env-file .env up -d
```

## 3) 关键配置说明

- `deploy/docker-compose.ghcr.yml`
  - `web` 使用 Nginx 托管前端，并将 `/api/*` 反向代理到 `backend`。
  - `backend` 通过 `BACKEND_DB_URL` 连接 `postgres`。
  - `postgres` 挂载了：
    - `deploy/postgres/postgresql.conf`
    - `deploy/postgres/init/001-extensions.sql`
- `apps/web/Dockerfile`
  - 通过 `VITE_API_BASE=/` 构建前端，运行时走同域 `/api`。
- `apps/backend/Dockerfile`
  - 构建入口改为 `./cmd/server`，输出可运行的后端二进制。

## 4) 首次启用 GHCR 拉取权限（私有仓库常见）

如果镜像是私有的，需要在服务器先登录：

```bash
echo "$GHCR_TOKEN" | docker login ghcr.io -u <github-username> --password-stdin
```
