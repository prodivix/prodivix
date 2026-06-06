# 后端 API

Prodivix 后端服务提供用户认证和数据管理 API。

## 概述

- **技术栈**: Go + Gin Web Framework
- **认证方式**: Session-based Token 认证
- **存储**: PostgreSQL（自动建表）
- **默认地址**: `http://localhost:8080`

## 基础信息

### Base URL

```
http://localhost:8080/api
```

### 认证

大部分 API 需要认证。在请求头中添加 Token：

```http
Authorization: Bearer <token>
```

或使用：

```http
X-Auth-Token: <token>
```

### 响应格式

所有响应均为 JSON 格式。

**成功响应**:

```json
{
  "user": { ... },
  "token": "..."
}
```

**错误响应**:

```json
{
  "error": {
    "code": "API-1001",
    "message": "错误描述"
  }
}
```

错误响应不保留旧顶层 `message`、字符串型 `error` 或 `legacyError` 字段。前端和文档都以 `error.code` 作为稳定定位入口。

## API 端点

### 健康检查

检查服务是否正常运行。

```http
GET /api/ping
```

**响应**:

```json
{
  "message": "pong"
}
```

---

### 认证 API

#### 注册

创建新用户账号。

```http
POST /api/auth/register
```

**请求体**:

```json
{
  "email": "user@example.com",
  "password": "password123",
  "name": "用户名",
  "description": "个人简介"
}
```

| 字段          | 类型   | 必填 | 描述              |
| ------------- | ------ | ---- | ----------------- |
| `email`       | string | 是   | 邮箱地址          |
| `password`    | string | 是   | 密码（至少 8 位） |
| `name`        | string | 否   | 用户名            |
| `description` | string | 否   | 个人简介          |

**成功响应** (201 Created):

```json
{
  "user": {
    "id": "usr_a1b2c3d4e5f6g7h8",
    "email": "user@example.com",
    "name": "用户名",
    "description": "个人简介",
    "createdAt": "2024-01-15T10:30:00Z"
  },
  "token": "abc123def456...",
  "expiresAt": "2024-01-16T10:30:00Z"
}
```

**错误响应**:

| HTTP 状态码 | 错误码                  | 描述               |
| ----------- | ----------------------- | ------------------ |
| 400         | `API-1001`              | 请求体格式错误     |
| 400         | `API-4001`              | 邮箱或密码规则无效 |
| 409         | `API-4009`              | 邮箱已被注册       |
| 500         | `API-5001` / `API-9001` | 服务器错误         |

---

#### 登录

使用邮箱和密码登录。

```http
POST /api/auth/login
```

**请求体**:

```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**成功响应** (200 OK):

```json
{
  "user": {
    "id": "usr_a1b2c3d4e5f6g7h8",
    "email": "user@example.com",
    "name": "用户名",
    "description": "个人简介",
    "createdAt": "2024-01-15T10:30:00Z"
  },
  "token": "abc123def456...",
  "expiresAt": "2024-01-16T10:30:00Z"
}
```

**错误响应**:

| HTTP 状态码 | 错误码     | 描述           |
| ----------- | ---------- | -------------- |
| 400         | `API-1001` | 请求体格式错误 |
| 401         | `API-2001` | 邮箱或密码错误 |

---

#### 登出

退出登录，使当前 Token 失效。

```http
POST /api/auth/logout
```

**请求头**: 需要认证

**成功响应** (204 No Content): 无响应体

---

#### 获取当前用户

获取当前登录用户的信息。

```http
GET /api/auth/me
```

**请求头**: 需要认证

**成功响应** (200 OK):

```json
{
  "user": {
    "id": "usr_a1b2c3d4e5f6g7h8",
    "email": "user@example.com",
    "name": "用户名",
    "description": "个人简介",
    "createdAt": "2024-01-15T10:30:00Z"
  }
}
```

---

### 用户 API

#### 获取用户信息

根据 ID 获取用户公开信息。

```http
GET /api/users/:id
```

**请求头**: 需要认证

**路径参数**:

| 参数 | 类型   | 描述    |
| ---- | ------ | ------- |
| `id` | string | 用户 ID |

**成功响应** (200 OK):

```json
{
  "user": {
    "id": "usr_a1b2c3d4e5f6g7h8",
    "email": "user@example.com",
    "name": "用户名",
    "description": "个人简介",
    "createdAt": "2024-01-15T10:30:00Z"
  }
}
```

**错误响应**:

| HTTP 状态码 | 错误码     | 描述       |
| ----------- | ---------- | ---------- |
| 404         | `API-4004` | 用户不存在 |

---

### 项目 API

#### 创建项目

```http
POST /api/projects
```

**请求头**: 需要认证

**请求体**:

```json
{
  "name": "My Project",
  "description": "optional",
  "resourceType": "project",
  "isPublic": true,
  "pir": {
    "version": "1.0",
    "ui": { "root": { "id": "root", "type": "container" } }
  }
}
```

`resourceType` 支持三类：`project` / `component` / `nodegraph`。  
`isPublic=true` 时会公开到社区列表。

#### 发布已有项目到社区

```http
POST /api/projects/:id/publish
```

**请求头**: 需要认证  
将当前用户的私有项目改为公开项目。

---

### 社区 API

#### 获取公开项目列表

```http
GET /api/community/projects
```

**查询参数**:

| 参数           | 类型   | 必填 | 默认值   | 描述                                            |
| -------------- | ------ | ---- | -------- | ----------------------------------------------- |
| `keyword`      | string | 否   | -        | 名称/描述/作者模糊搜索                          |
| `resourceType` | string | 否   | -        | 资源类型：`project` / `component` / `nodegraph` |
| `sort`         | string | 否   | `latest` | 排序方式：`latest` 或 `popular`                 |
| `page`         | number | 否   | `1`      | 页码                                            |
| `pageSize`     | number | 否   | `20`     | 每页条数（最大 100）                            |

**成功响应**:

```json
{
  "projects": [
    {
      "id": "prj_xxx",
      "resourceType": "project",
      "name": "SaaS Dashboard",
      "description": "Public template",
      "authorId": "usr_xxx",
      "authorName": "Alice",
      "starsCount": 12,
      "createdAt": "2026-02-07T09:30:00Z",
      "updatedAt": "2026-02-07T10:00:00Z"
    }
  ],
  "page": 1,
  "pageSize": 20,
  "sort": "latest"
}
```

#### 获取公开项目详情（含 PIR）

```http
GET /api/community/projects/:id
```

仅返回已发布（`isPublic=true`）项目。

---

#### 更新当前用户

更新当前登录用户的信息。

```http
PATCH /api/users/me
```

**请求头**: 需要认证

**请求体**:

```json
{
  "name": "新用户名",
  "description": "新的个人简介"
}
```

| 字段          | 类型   | 必填 | 描述       |
| ------------- | ------ | ---- | ---------- |
| `name`        | string | 否   | 新用户名   |
| `description` | string | 否   | 新个人简介 |

**成功响应** (200 OK):

```json
{
  "user": {
    "id": "usr_a1b2c3d4e5f6g7h8",
    "email": "user@example.com",
    "name": "新用户名",
    "description": "新的个人简介",
    "createdAt": "2024-01-15T10:30:00Z"
  }
}
```

**错误响应**:

| HTTP 状态码 | 错误码     | 描述           |
| ----------- | ---------- | -------------- |
| 400         | `API-1001` | 请求体格式错误 |
| 404         | `API-4004` | 用户不存在     |
| 500         | `API-5001` | 更新失败       |

---

### 项目 API

#### 获取项目列表

获取当前用户的所有项目。

```http
GET /api/projects
```

**请求头**: 需要认证

**成功响应** (200 OK):

```json
{
  "projects": [
    {
      "id": "prj_xxx",
      "resourceType": "project",
      "name": "My Project",
      "description": "Project description",
      "isPublic": false,
      "starsCount": 0,
      "createdAt": "2024-01-15T10:30:00Z",
      "updatedAt": "2024-01-15T12:00:00Z"
    }
  ]
}
```

---

#### 创建项目

创建新项目。

```http
POST /api/projects
```

**请求头**: 需要认证

**请求体**:

```json
{
  "name": "My Project",
  "description": "Project description",
  "resourceType": "project",
  "isPublic": false,
  "pir": {
    "version": "1.0",
    "ui": { "root": { "id": "root", "type": "div" } }
  }
}
```

| 字段           | 类型    | 必填 | 描述                                            |
| -------------- | ------- | ---- | ----------------------------------------------- |
| `name`         | string  | 是   | 项目名称                                        |
| `description`  | string  | 否   | 项目描述                                        |
| `resourceType` | string  | 否   | 资源类型：`project` / `component` / `nodegraph` |
| `isPublic`     | boolean | 否   | 是否公开到社区（默认 false）                    |
| `pir`          | object  | 否   | PIR 文档内容                                    |

**成功响应** (201 Created):

```json
{
  "project": {
    "id": "prj_xxx",
    "resourceType": "project",
    "name": "My Project",
    "description": "Project description",
    "isPublic": false,
    "starsCount": 0,
    "createdAt": "2024-01-15T10:30:00Z",
    "updatedAt": "2024-01-15T10:30:00Z"
  }
}
```

---

#### 获取项目详情

根据 ID 获取项目详情。

```http
GET /api/projects/:id
```

**请求头**: 需要认证

**成功响应** (200 OK):

```json
{
  "project": {
    "id": "prj_xxx",
    "resourceType": "project",
    "name": "My Project",
    "description": "Project description",
    "isPublic": false,
    "starsCount": 0,
    "pir": { ... },
    "createdAt": "2024-01-15T10:30:00Z",
    "updatedAt": "2024-01-15T12:00:00Z"
  }
}
```

---

#### 获取项目 PIR

获取项目的 PIR 文档内容。

```http
GET /api/projects/:id/pir
```

**请求头**: 需要认证

**成功响应** (200 OK):

```json
{
  "id": "prj_xxx",
  "pir": { ... },
  "updatedAt": "2024-01-15T12:00:00Z"
}
```

---

#### 保存项目 PIR

保存项目的 PIR 文档内容。

```http
PUT /api/projects/:id/pir
```

**请求头**: 需要认证

**请求体**:

```json
{
  "pir": {
    "version": "1.0",
    "ui": { "root": { "id": "root", "type": "div" } }
  }
}
```

---

#### 发布项目

将项目发布到社区。

```http
POST /api/projects/:id/publish
```

**请求头**: 需要认证

**成功响应** (200 OK):

```json
{
  "project": {
    "id": "prj_xxx",
    "isPublic": true,
    ...
  }
}
```

---

#### 删除项目

删除指定项目。

```http
DELETE /api/projects/:id
```

**请求头**: 需要认证

**成功响应** (204 No Content): 无响应体

---

### 工作区 API

工作区 API 提供协作编辑功能，支持版本控制和冲突检测。

#### 获取工作区快照

获取工作区的完整快照，包括所有文档。

```http
GET /api/workspaces/:workspaceId
```

**请求头**: 需要认证

**成功响应** (200 OK):

```json
{
  "workspace": {
    "id": "ws_xxx",
    "workspaceRev": 1,
    "routeRev": 1,
    "opSeq": 100,
    "tree": null,
    "documents": [
      {
        "id": "doc_root",
        "type": "pir_page",
        "path": "/",
        "contentRev": 5,
        "metaRev": 2,
        "content": { ... },
        "updatedAt": "2024-01-15T12:00:00Z"
      }
    ],
    "routeManifest": null
  }
}
```

---

#### 获取工作区能力

获取工作区支持的功能能力。

```http
GET /api/workspaces/:workspaceId/capabilities
```

**请求头**: 需要认证

**成功响应** (200 OK):

```json
{
  "workspaceId": "ws_xxx",
  "capabilities": {
    "core.pir.document.update@1.0": true,
    "core.route.manifest.update@1.0": true,
    "core.nodegraph.node.move@1.0": false,
    "core.nodegraph.edge.connect@1.0": false,
    "core.animation.timeline.keyframe.add@1.0": false,
    "core.animation.clip.bind@1.0": false
  }
}
```

---

#### 保存工作区文档

保存工作区中的文档内容，支持乐观更新和冲突检测。

```http
PUT /api/workspaces/:workspaceId/documents/:documentId
```

**请求头**: 需要认证

**请求体**:

```json
{
  "expectedContentRev": 5,
  "expectedWorkspaceRev": 1,
  "expectedRouteRev": 1,
  "content": { ... },
  "clientMutationId": "mutation_123",
  "command": {
    "id": "cmd_xxx",
    "namespace": "core.pir",
    "type": "document.update",
    "version": "1.0"
  }
}
```

| 字段                   | 类型   | 必填 | 描述               |
| ---------------------- | ------ | ---- | ------------------ |
| `expectedContentRev`   | number | 是   | 期望的内容版本号   |
| `expectedWorkspaceRev` | number | 否   | 期望的工作区版本号 |
| `expectedRouteRev`     | number | 否   | 期望的路由版本号   |
| `content`              | object | 是   | PIR 文档内容       |
| `clientMutationId`     | string | 否   | 客户端变更 ID      |
| `command`              | object | 否   | 命令信封           |

**成功响应** (200 OK):

```json
{
  "workspaceId": "ws_xxx",
  "workspaceRev": 2,
  "routeRev": 1,
  "opSeq": 101,
  "updatedDocuments": [
    {
      "id": "doc_root",
      "contentRev": 6,
      "metaRev": 2
    }
  ],
  "acceptedMutationId": "mutation_123"
}
```

**冲突响应** (409 Conflict):

```json
{
  "error": {
    "code": "WKS-4003",
    "message": "Revision conflict.",
    "severity": "warning",
    "domain": "workspace",
    "retryable": true,
    "details": {
      "conflictType": "DOCUMENT_CONFLICT",
      "workspaceId": "ws_xxx",
      "serverWorkspaceRev": 3,
      "serverRouteRev": 1,
      "opSeq": 150,
      "serverDocument": {
        "id": "doc_root",
        "contentRev": 10,
        "metaRev": 2
      }
    }
  }
}
```

---

#### 应用工作区意图

应用意图驱动的操作（如路由更新）。

```http
POST /api/workspaces/:workspaceId/intents
```

**请求头**: 需要认证

**请求体**:

```json
{
  "expectedWorkspaceRev": 1,
  "expectedRouteRev": 1,
  "intent": {
    "id": "intent_xxx",
    "namespace": "core.route",
    "type": "manifest.update",
    "version": "1.0",
    "payload": {
      "routeManifest": { ... }
    },
    "idempotencyKey": "key_123",
    "issuedAt": "2024-01-15T12:00:00Z"
  },
  "clientMutationId": "mutation_123"
}
```

---

#### 批量操作

执行多个工作区操作的批量请求。

```http
POST /api/workspaces/:workspaceId/batch
```

**请求头**: 需要认证

**请求体**:

```json
{
  "expectedWorkspaceRev": 1,
  "expectedRouteRev": 1,
  "operations": [
    {
      "op": "saveDocument",
      "documentId": "doc_root",
      "expectedContentRev": 5,
      "content": { ... }
    },
    {
      "op": "intent",
      "intent": { ... }
    }
  ],
  "clientBatchId": "batch_123"
}
```

**成功响应** (200 OK):

```json
{
  "workspaceId": "ws_xxx",
  "workspaceRev": 3,
  "routeRev": 2,
  "opSeq": 102,
  "acceptedMutationId": "batch_123"
}
```

---

## 数据模型

### User

```typescript
interface User {
  id: string; // 格式: "usr_" + 16位随机十六进制
  email: string; // 邮箱（小写标准化）
  name: string; // 用户名
  description: string; // 个人简介
  createdAt: string; // ISO 8601 格式时间戳
}
```

### Session

```typescript
interface Session {
  token: string; // 32位十六进制字符串
  userId: string; // 关联的用户 ID
  createdAt: string; // 创建时间
  expiresAt: string; // 过期时间
}
```

### ProjectSummary

```typescript
interface ProjectSummary {
  id: string;
  resourceType: 'project' | 'component' | 'nodegraph';
  name: string;
  description: string;
  isPublic: boolean;
  starsCount: number;
  createdAt: string;
  updatedAt: string;
}
```

### WorkspaceDocument

```typescript
interface WorkspaceDocument {
  id: string;
  type: 'pir_page' | 'pir_component' | 'pir_nodegraph';
  path: string;
  contentRev: number;
  metaRev: number;
  content: PIRDocument;
  updatedAt: string;
}
```

### WorkspaceSnapshot

```typescript
interface WorkspaceSnapshot {
  id: string;
  workspaceRev: number;
  routeRev: number;
  opSeq: number;
  tree: unknown;
  documents: WorkspaceDocument[];
  routeManifest: unknown;
}
```

## 配置

后端服务通过环境变量配置：

| 环境变量                    | 默认值                                                                 | 描述                                        |
| --------------------------- | ---------------------------------------------------------------------- | ------------------------------------------- |
| `BACKEND_ADDR`              | `:8080`                                                                | 服务监听地址                                |
| `BACKEND_TOKEN_TTL`         | `24h`                                                                  | Token 有效期（支持 Go duration 格式或秒数） |
| `BACKEND_ALLOWED_ORIGINS`   | `http://localhost:5173,http://localhost:5174`                          | 允许的 CORS 来源（逗号分隔）                |
| `BACKEND_DB_URL`            | `postgres://postgres:postgres@localhost:5432/prodivix?sslmode=disable` | PostgreSQL 连接字符串                       |
| `BACKEND_DB_MAX_OPEN_CONNS` | `10`                                                                   | 最大打开连接数                              |
| `BACKEND_DB_MAX_IDLE_CONNS` | `5`                                                                    | 最大空闲连接数                              |
| `BACKEND_DB_MAX_LIFETIME`   | `30m`                                                                  | 连接最大生命周期                            |

**示例**:

```bash
export BACKEND_ADDR=":3000"
export BACKEND_TOKEN_TTL="48h"
export BACKEND_ALLOWED_ORIGINS="http://localhost:5173,https://myapp.com"
export BACKEND_DB_URL="postgres://postgres:postgres@localhost:5432/prodivix?sslmode=disable"
```

## CORS

后端配置了以下 CORS 头：

```http
Access-Control-Allow-Origin: <configured origins>
Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS
Access-Control-Allow-Headers: Authorization, Content-Type, X-Auth-Token
Access-Control-Expose-Headers: Authorization, Content-Type
```

## 使用示例

### JavaScript/TypeScript

```typescript
// 注册
const registerResponse = await fetch(
  'http://localhost:8080/api/auth/register',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'user@example.com',
      password: 'password123',
      name: '用户名',
    }),
  }
);
const { user, token } = await registerResponse.json();

// 使用 Token 请求
const meResponse = await fetch('http://localhost:8080/api/auth/me', {
  headers: { Authorization: `Bearer ${token}` },
});
const { user: currentUser } = await meResponse.json();

// 更新用户信息
const updateResponse = await fetch('http://localhost:8080/api/users/me', {
  method: 'PATCH',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify({ name: '新名字' }),
});
```

### cURL

```bash
# 注册
curl -X POST http://localhost:8080/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password123","name":"用户名"}'

# 登录
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password123"}'

# 获取当前用户
curl http://localhost:8080/api/auth/me \
  -H "Authorization: Bearer <token>"

# 更新用户
curl -X PATCH http://localhost:8080/api/users/me \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"name":"新名字"}'
```

## 开发说明

### 启动后端服务

```bash
pnpm dev:backend
```

### 热重载启动（可选）

```bash
go install github.com/air-verse/air@latest
pnpm dev:backend
```

说明：`pnpm dev:backend` 默认优先使用 Air 热重载；如果本机未安装 Air，会自动回退到 `go run .`。

### 本地 PostgreSQL（Docker）

```bash
cd apps/backend
docker compose up -d
```

服务启动时会自动初始化 `users` 和 `sessions` 表。

### 当前限制

- 节点图编辑器功能未完全启用（工作区能力中 `core.nodegraph.*` 为 false）
- 动画编辑器功能未完全启用（工作区能力中 `core.animation.*` 为 false）

### 计划功能

- [ ] 文件上传 API
- [ ] OAuth 第三方登录
- [ ] API 速率限制
- [ ] 团队协作功能
