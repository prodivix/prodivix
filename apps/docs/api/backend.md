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
  "pir": { "version": "1.3", "ui": { "graph": { ... } } }
}
```

`resourceType` 支持三类：`project` / `component` / `nodegraph`。`isPublic=true` 时会在同一事务中生成初始发布投影并公开到社区列表。

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
  "pir": { "version": "1.3", "ui": { "graph": { ... } } }
}
```

| 字段           | 类型    | 必填 | 描述                                                         |
| -------------- | ------- | ---- | ------------------------------------------------------------ |
| `name`         | string  | 是   | 项目名称                                                     |
| `description`  | string  | 否   | 项目描述                                                     |
| `resourceType` | string  | 否   | 资源类型：`project` / `component` / `nodegraph`              |
| `isPublic`     | boolean | 否   | 是否公开到社区（默认 false）                                 |
| `pir`          | object  | 否   | canonical Workspace 根页面的初始内容；不会保存为 Project PIR |

Project metadata、初始 Workspace、Route、Settings、Documents 以及可选的初始发布投影在同一数据库事务中创建；任一步失败都会整体回滚，不会留下缺失 Workspace 的孤儿 Project。该创建端点未声明跨请求 idempotency key，重复的成功请求会创建新的 Project identity。

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
    "createdAt": "2024-01-15T10:30:00Z",
    "updatedAt": "2024-01-15T12:00:00Z"
  }
}
```

---

#### 发布项目

从当前 canonical Workspace 生成不可编辑的社区 PIR 投影并发布。再次发布会刷新投影；社区投影不会被编辑器读取，也不会在 Workspace 缺失时用于恢复。

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

除创建/导入入口外，Workspace snapshot、capabilities 和 mutation 端点均只允许 Workspace owner 访问。不存在的 Workspace 与属于其他用户的 Workspace 统一返回不含 `details` 的 `WKS-1001`（404），避免泄露 Workspace 是否存在、当前 revision 或文档元数据。

#### 导入本地项目

```http
POST /api/workspaces/import-local-project
```

导入入口会在同一数据库事务中创建新的 Project metadata 并导入完整 canonical Workspace snapshot；validation、Project、Workspace、Route、Settings 或任一 Document 写入失败时全部回滚。该端点同样未声明跨请求 idempotency key，重复的成功导入会生成新的 Project identity。

#### 获取工作区快照

获取工作区的完整快照，包括所有文档。

```http
GET /api/workspaces/:workspaceId
```

**请求头**: 需要认证，且当前用户必须是 Workspace owner

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
        "type": "pir-page",
        "path": "/pir.json",
        "contentRev": 5,
        "metaRev": 2,
        "content": { ... },
        "updatedAt": "2024-01-15T12:00:00Z"
      }
    ],
    "routeManifest": { "version": "1", "root": { "id": "root" } },
    "settings": {}
  }
}
```

---

#### 获取工作区能力

获取工作区支持的功能能力。

```http
GET /api/workspaces/:workspaceId/capabilities
```

**请求头**: 需要认证，且当前用户必须是 Workspace owner

**成功响应** (200 OK):

```json
{
  "workspaceId": "ws_xxx",
  "capabilities": {
    "core.workspace.operation.commit@1.0": true,
    "core.settings.commit@1.0": true,
    "core.pir.document.update@1.0": true,
    "core.route.manifest.update@1.0": true,
    "core.nodegraph.graph.update@1.0": true,
    "core.animation.definition.update@1.0": true,
    "core.resource.project-config.value.update@1.0": true
  }
}
```

---

#### Canonical revision 冲突

Atomic WorkspaceOperation Commit 与 Settings Commit 都使用统一的 canonical 409。冲突响应只包含安全 revision metadata，客户端随后读取最新 Workspace snapshot 做 semantic recovery。

**响应** (409 Conflict):

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
      "expected": {
        "document": {
          "id": "doc_root",
          "contentRev": 5
        }
      },
      "current": {
        "workspaceRev": 3,
        "routeRev": 1,
        "opSeq": 150,
        "document": {
          "id": "doc_root",
          "type": "pir-page",
          "path": "/pir.json",
          "contentRev": 10,
          "metaRev": 2,
          "updatedAt": "2026-06-16T08:01:30Z"
        }
      }
    }
  }
}
```

三个 revision 分区使用同一个 canonical `details` 外形：

| 错误码     | `conflictType`       | `expected`                                   | `current`                                                                  |
| ---------- | -------------------- | -------------------------------------------- | -------------------------------------------------------------------------- |
| `WKS-4001` | `WORKSPACE_CONFLICT` | `workspaceRev`，路由写入时也包含 `routeRev`  | `workspaceRev`、`routeRev`、`opSeq`                                        |
| `WKS-4002` | `ROUTE_CONFLICT`     | `workspaceRev`、`routeRev`                   | `workspaceRev`、`routeRev`、`opSeq`                                        |
| `WKS-4003` | `DOCUMENT_CONFLICT`  | `document.id` 及 contentRev/metaRev baseline | Workspace revisions、`opSeq` 与安全 metadata；远端已删除时 `document:null` |

`DOCUMENT_CONFLICT.expected.document` 至少包含 contentRev/metaRev 之一；metadata-only 仍使用 WKS-4003。`current.document` 属性必需，远端存在时返回安全 revision metadata，远端已删除时为 `null`。新增 Document 的 `contentRev:null + metaRev:null` absence precondition 若发现 identity 已存在，也返回 WKS-4003。

冲突详情只返回 rebase 所需的 revision 与文档元数据，不返回文档正文。客户端应重新读取已授权的最新 Workspace snapshot，再进行语义合并或提示用户处理冲突。非 owner 在进入 revision 检查前即按 404 拒绝，因此不会收到 409 或任何 `current` 元数据。

---

#### 原子提交 WorkspaceOperation

把一个 Command 或 Transaction 作为单一持久化 commit。所有 revision CAS、Command Apply、reverse/final validation、Workspace/Document/Route 更新、revision 推进、operation log 和幂等结果都位于同一数据库事务。

```http
POST /api/workspaces/:workspaceId/operations/commit
```

**请求头**: 需要认证，且当前用户必须是 Workspace owner

**请求体**:

```json
{
  "expected": {
    "workspaceRev": 3,
    "routeRev": 2,
    "documents": [{ "id": "doc_root", "contentRev": 5 }]
  },
  "operation": {
    "kind": "transaction",
    "transaction": {
      "id": "operation_route_and_page_1",
      "workspaceId": "ws_xxx",
      "issuedAt": "2026-07-12T08:00:00Z",
      "label": "Update page and route",
      "commands": [
        {
          "id": "operation_route_and_page_1:document",
          "namespace": "core.pir",
          "type": "document.update",
          "version": "1.0",
          "issuedAt": "2026-07-12T08:00:00Z",
          "target": {
            "workspaceId": "ws_xxx",
            "documentId": "doc_root"
          },
          "domainHint": "pir",
          "forwardOps": [
            {
              "op": "replace",
              "path": "/ui/graph/nodesById/title/props/text",
              "value": "Next"
            }
          ],
          "reverseOps": [
            {
              "op": "replace",
              "path": "/ui/graph/nodesById/title/props/text",
              "value": "Previous"
            }
          ]
        },
        {
          "id": "operation_route_and_page_1:route",
          "namespace": "core.route",
          "type": "manifest.update",
          "version": "1.0",
          "issuedAt": "2026-07-12T08:00:00Z",
          "target": { "workspaceId": "ws_xxx" },
          "domainHint": "route",
          "forwardOps": [
            {
              "op": "replace",
              "path": "/routeManifest",
              "value": { "version": "1", "root": { "id": "next-root" } }
            }
          ],
          "reverseOps": [
            {
              "op": "replace",
              "path": "/routeManifest",
              "value": { "version": "1", "root": { "id": "root" } }
            }
          ]
        }
      ]
    },
    "sourceOperationIds": ["local_operation_1"]
  }
}
```

`operation.kind` 只允许 `command` 或 `transaction`。Intent 是 Operation planner 的输入，不是 Commit wire union 的第三种 kind。

Atomic wire 还执行以下 canonicalization 与 Hard Cut：

1. Operation/Transaction/Command、namespace/type/version、Workspace 和可选 target Document/Route 标识符必须非空且无首尾空白；当前不强制 UUID 或特定字符集。
2. Transaction 与所有 Command 的 `issuedAt` 必须是 RFC3339 timestamp。
3. `undoOf` 与 `redoOf` 在 trim 后互斥；`sourceOperationIds` 逐项 trim、拒绝空值，并按首次出现顺序稳定去重后再计算 request digest。
4. 所有 domain 的 forward/reverse ops 都禁止 `move` / `copy`，必须展开为显式 granular `add` / `remove` / `replace` / `test`。
5. `asset` / `project-config` 只接受 `resource` domain 的可逆 document command，并使用专属 path policy 与 content validator。

`expected` 必须与服务端从 Operation 写集推导的分区完全一致：

| 写入范围                             | 必需 baseline                                                   |
| ------------------------------------ | --------------------------------------------------------------- |
| 已有 Document content                | `documents[{id, contentRev}]`                                   |
| 已有 Document name/path/capabilities | `workspaceRev + documents[{id, metaRev}]`                       |
| 新增 Document                        | `workspaceRev + documents[{id, contentRev:null, metaRev:null}]` |
| 删除 Document                        | `workspaceRev + documents[{id, contentRev, metaRev}]`           |
| Workspace tree                       | `workspaceRev`                                                  |
| RouteManifest                        | `workspaceRev + routeRev`                                       |
| Mixed Transaction                    | 全部受影响分区的并集                                            |

`expected.documents` 始终存在；没有文档写入时为 `[]`，有文档写入时按 id 的 Unicode code-point 顺序排序且 id 唯一，不依赖 locale。同一文档在 Transaction 内出现多个 Command 时只提供一次初始 baseline，不手工传递 `N + 1` revision。

`settings` 不属于这个作者态 Commit endpoint。`activeDocumentId` / `activeRouteNodeId` 是本地 ephemeral selection，服务端不会持久化或为其要求 revision；只包含 selection patch、没有任何持久写入的 Operation 返回 422。

Command 或 Transaction id 是强幂等 commit identity：

1. 相同 id、相同 canonical request 重试时返回首次提交的 mutation，不再次 Apply，也不推进 revision/opSeq。
2. 相同 id、不同 request 返回 422，`details.reason` 为 `COMMIT_IDENTITY_MISMATCH`。
3. 缺少/多余 revision partition、unsupported path 或非法 Operation 返回 422，`details.reason` 为 `COMMIT_VALIDATION_FAILED`。

**成功响应** (200 OK):

```json
{
  "workspaceId": "ws_xxx",
  "workspaceRev": 4,
  "routeRev": 3,
  "opSeq": 103,
  "updatedDocuments": [
    {
      "id": "doc_root",
      "type": "pir-page",
      "path": "/pir.json",
      "contentRev": 6,
      "metaRev": 2,
      "content": { "...": "..." },
      "updatedAt": "2026-07-12T08:00:01Z"
    }
  ],
  "routeManifest": { "version": "1", "root": { "id": "next-root" } },
  "acceptedMutationId": "operation_route_and_page_1"
}
```

响应聚合整条 Operation 的全部 delta；`acceptedMutationId` 必须等于 Command 或 Transaction id。一次 Commit 只推进一次 `opSeq` 并只写一条 operation-log record；任一后续 Command/validator/SQL 失败时全部 rollback。

`opSeq` 不参与 CAS；若不相交分区在 base snapshot 后先行提交，本响应的 `opSeq` 可以跨越多步。响应只聚合当前 Operation 的 delta，不是 catch-up stream；Web 检测到序列缺口后会重新读取 canonical snapshot，再采用成功 ACK。

`200` 只表示 canonical Workspace 数据库已经提交。该 Handler 不同步写 Project mirror，避免乱序投影和幂等 replay 重复产生外部副作用；需要可靠跨系统投影时必须由同事务写入的 transactional outbox 驱动。

旧 `POST /api/workspaces/:workspaceId/batch` 是逐条 Store commit，从未具备原子性，现已连同 `ApplyBatchRequest`、`clientBatchId` 和 Web adapter 一起 Hard Cut；不提供转发或兼容层。

---

#### 提交 Workspace Settings

Settings 不属于作者态 WorkspaceOperation。客户端先把 exact request 写入 Settings Outbox，再调用独立的强幂等 Commit：

```http
POST /api/workspaces/:workspaceId/settings/commit
```

```json
{
  "commitId": "settings_01",
  "issuedAt": "2026-07-13T08:00:00Z",
  "expectedWorkspaceRev": 4,
  "settings": {
    "global": { "theme": "dark" },
    "projectGlobalById": {}
  }
}
```

相同 `commitId` 与相同 canonical request 返回首次结果，不重复推进 revision；同 id 不同 request 返回 422。成功响应包含完整 `settings`、权威 `workspaceRev/opSeq`，且 `acceptedMutationId` 等于 `commitId`。409 后客户端基于 base/local/remote 做三方设置合并，并以 fresh commit id 重试。

旧 document `PATCH` 与 `POST /intents` 已连同 Handler、直写 Store 事务和 Web API 一并删除。所有作者态领域写入必须先规划为 Command/Transaction，再进入 Operation Outbox。

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
  type:
    | 'pir-page'
    | 'pir-layout'
    | 'pir-component'
    | 'pir-graph'
    | 'pir-animation'
    | 'code'
    | 'asset'
    | 'project-config';
  path: string;
  contentRev: number;
  metaRev: number;
  content: PIRDocument | WorkspaceCodeDocumentContent | unknown;
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
