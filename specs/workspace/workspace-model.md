# Workspace 模型草案（VFS）

## 文档状态

- Draft-Frozen（API-001）
- 日期：2026-02-08
- 冻结批次：`API-001`
- 关联 ADR：`specs/decisions/05.workspace-vfs.md`、`specs/decisions/06.command-history.md`

## 1. 目标

定义编辑器工作区的数据模型，支持：

1. 多文档管理
2. 内部文件树组织（系统管理）
3. 路由清单映射
4. 跨编辑器统一操作历史

补充：用户只操作 Blueprint 中可见的页面/布局/组件，不直接编辑 VFS 树。

## 2. 核心类型（Draft）

```ts
export type WorkspaceId = string;
export type DocumentId = string;
export type VfsNodeId = string;

export type WorkspaceDocumentType =
  | 'pir-page'
  | 'pir-layout'
  | 'pir-component'
  | 'pir-graph' // 预留：节点图文档
  | 'pir-animation'; // 预留：动画文档

export interface WorkspaceDocument {
  id: DocumentId;
  type: WorkspaceDocumentType;
  name: string;
  path: string;
  contentRev: number;
  metaRev: number;
  content: unknown; // PIRDocument | GraphDocument | AnimationDocument（由上层 narrowing）
  updatedAt: string;
  capabilities?: string[]; // 预留：声明该文档允许的编辑域能力
}

export interface VfsNode {
  id: VfsNodeId;
  kind: 'dir' | 'doc';
  name: string;
  parentId: VfsNodeId | null;
  children?: VfsNodeId[]; // dir only
  docId?: DocumentId; // doc only
}

export interface RouteManifest {
  version: '1';
  root: RouteNode;
}

export interface RouteNode {
  id: string;
  segment?: string;
  index?: boolean;
  layoutDocId?: DocumentId;
  pageDocId?: DocumentId;
  children?: RouteNode[];
}

export interface WorkspaceState {
  id: WorkspaceId;
  name: string;
  workspaceRev: number;
  routeRev: number;
  opSeq: number;
  treeRootId: VfsNodeId;
  treeById: Record<VfsNodeId, VfsNode>;
  docsById: Record<DocumentId, WorkspaceDocument>;
  routeManifest: RouteManifest;
  activeDocumentId: DocumentId;
  activeRouteNodeId?: string;
}
```

## 3. 约束规则

1. `VfsNode.kind=doc` 时必须存在 `docId`
2. `WorkspaceDocument.path` 必须与树路径一致（由系统维护，用户不可直接写）
3. `contentRev/metaRev` 必须单调递增
4. `activeDocumentId` 必须存在于 `docsById`
5. `routeManifest` 引用的 `layoutDocId/pageDocId` 必须存在
6. `pir-graph` / `pir-animation` 在本期仅作为数据契约预留，不提供编辑器 UI

## 4. 默认初始化模板

```txt
/
  pages/
    home.pir.json
  layouts/
    root-layout.pir.json
  graphs/
  animations/
```

默认路由：

- `/` -> `layout: root-layout` + `page: home`

## 5. Store 行为建议

```ts
interface WorkspaceStore {
  workspace?: WorkspaceState;
  setWorkspace(snapshot: WorkspaceState): void;
  setActiveDocument(docId: DocumentId): void;
  updateDocument(
    docId: DocumentId,
    updater: (doc: WorkspaceDocument) => WorkspaceDocument
  ): void;
  applyWorkspaceCommand(command: CommandEnvelope): void;
}
```

说明：

- 全量切换到 `workspace.docsById`，不保留 `pirDoc` 兼容 API
- 任何“文档树变更”由 Blueprint 意图触发，避免暴露文件级 UI 操作

## 6. 与 Undo/Redo 的关系

1. 所有修改必须以 Command 进入
2. `Command.domain` 本期至少支持 `pir/workspace`；未来域通过 `namespace` 扩展
3. 每条命令记录 `documentId`（若适用）
4. Command 必须可序列化，支持离线队列与重放

## 7. Hard Cutover 清单（Draft）

1. 抽离 `pirDoc` 访问点
2. Blueprint/Inspector/Export 切换到 workspace 模型
3. NodeGraph/动画仅完成协议接线（capability + envelope 校验），不落地编辑器 UI
4. 删除所有 `pirDoc` 状态字段与调用点
5. CI 增加检查，阻止单文档模型回流

## 8. 开放问题

1. 大文档分片加载策略（按目录还是按最近使用）
2. 文档重命名是否影响 `docId`
3. 图文档（nodegraph）是否复用 PIR 容器还是独立 schema
4. 分区 rev 的 SDK 封装边界（客户端还是网关层）

## 9. 冻结规则（API-001）

以下字段进入冻结窗口，直至 Gate A 结束：

1. `WorkspaceState.workspaceRev`
2. `WorkspaceState.routeRev`
3. `WorkspaceState.opSeq`
4. `WorkspaceDocument.contentRev`
5. `WorkspaceDocument.metaRev`

冻结窗口内允许：

1. 文案与注释修正
2. 新增可选字段（不得改变既有字段语义）

冻结窗口内禁止：

1. 删除或重命名上述字段
2. 修改字段语义与并发控制职责
3. 将分区 rev 回退为单 rev 模型
