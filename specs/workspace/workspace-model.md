# Canonical Workspace Model

## 状态

- DecisionStatus：Accepted
- ImplementationStatus：Implemented
- ProductGateStatus：Passed
- Global Phase：G0 Truth & Change Kernel
- 日期：2026-07-14
- 关联：
  - `specs/decisions/05.workspace-vfs.md`
  - `specs/decisions/06.command-history.md`
  - `specs/decisions/35.canonical-workspace-hard-cut.md`
  - `specs/decisions/36.atomic-workspace-operation-commit.md`
  - `specs/decisions/38.blueprint-component-instance-and-collection.md`
  - `specs/roadmap/g0-closure-evidence.md`

## 核心结论

`WorkspaceSnapshot` 是 Prodivix 作者态的唯一 canonical aggregate。RouteManifest、PIR、NodeGraph、Animation、Code、Asset 和 Project Config 都是 Workspace 内由领域 owner 管理的文档或清单。

Tree、Canvas、Timeline、Code Editor、Preview、Export、Git、Issues、Semantic Index 和 AI Context 都是读投影，不得成为可独立演化的第二真相源。

## Canonical contract

当前稳定 TypeScript owner 是 `@prodivix/workspace`：

```ts
type WorkspaceDocumentType =
  | 'pir-page'
  | 'pir-layout'
  | 'pir-component'
  | 'pir-graph'
  | 'pir-animation'
  | 'code'
  | 'asset'
  | 'project-config';

type WorkspaceDocument = {
  id: WorkspaceDocumentId;
  type: WorkspaceDocumentType;
  name?: string;
  path: string;
  contentRev: number;
  metaRev: number;
  content: unknown;
  updatedAt?: string;
  capabilities?: string[];
};

type WorkspaceVfsNode = {
  id: WorkspaceVfsNodeId;
  kind: 'dir' | 'doc';
  name: string;
  parentId: WorkspaceVfsNodeId | null;
  children?: WorkspaceVfsNodeId[];
  docId?: WorkspaceDocumentId;
};

type WorkspaceSnapshot = {
  id: WorkspaceId;
  name?: string;
  workspaceRev: number;
  routeRev: number;
  opSeq: number;
  treeRootId: WorkspaceVfsNodeId;
  treeById: Record<WorkspaceVfsNodeId, WorkspaceVfsNode>;
  docsById: Record<WorkspaceDocumentId, WorkspaceDocument>;
  routeManifest: WorkspaceRouteManifest;
  activeDocumentId?: WorkspaceDocumentId;
  activeRouteNodeId?: string;
};
```

具体领域 content 由 document type 对应的 package codec 与 validator narrowing；Workspace 不把所有文档压成一个巨型 PIR JSON。PIR document content 使用无版本 `PIRDocument` current model，数字 wire version 在 transport / persistence 边界完成 strict decode、migration 与 encode，不进入 Workspace 领域分派。

## Identity 与 path

1. `WorkspaceSnapshot.id` 是 Workspace identity。
2. `WorkspaceDocument.id` 是 document 的 canonical stable identity。
3. `WorkspaceDocument.path` 是用户可理解的 VFS path，用于文件树、导出与 Git projection。
4. rename、move 和 path 调整保持 document id 不变。
5. 文档内部实体使用 `{ documentId, localEntityId }` 形成跨文档稳定 target。
6. Route、Component Instance、CodeReference、Animation target 和 NodeGraph reference 使用类型化稳定引用，不以显示名称作为主键。

PIR-current 的 Component Contract 归所属 `pir-component` document 所有，不重复保存 document id；Component Instance 以 `componentDocumentId` 指向目标 Definition。

## VFS 不变量

Workspace Validator 必须保证：

1. `treeRootId` 存在，root 是无 parent 的 directory。
2. 每个 VFS node 的 map key 与内部 id 相同。
3. directory children 存在、去重，并反向指向同一个 parent。
4. document node 只引用一个存在的 document；每个 document 只由一个 VFS node 挂载。
5. document path 与 VFS tree materialization 一致。
6. tree 不含 cycle、orphan 或 duplicate sibling name。
7. `workspaceRev`、`routeRev`、`opSeq`、`contentRev` 与 `metaRev` 满足非负和单调约束。
8. active document 与 active route 存在且类型合法。
9. RouteManifest 的 page/layout references 存在并满足 route contract。
10. document content 通过 Workspace 基础校验与对应领域 validator。

## 领域 owner

| Workspace 内容                                                       | Owner                                              |
| -------------------------------------------------------------------- | -------------------------------------------------- |
| Snapshot、VFS、Command、Transaction、History、基础 validator         | `@prodivix/workspace`                              |
| Revision vector、conflict、Outbox、Atomic Commit plan、local replica | `@prodivix/workspace-sync`                         |
| RouteManifest、matching、navigation 与 route validation              | `@prodivix/router`                                 |
| `pir-page` / `pir-layout` / `pir-component` graph                    | `@prodivix/pir`                                    |
| `pir-graph`                                                          | `@prodivix/nodegraph`                              |
| `pir-animation`                                                      | `@prodivix/animation`                              |
| Workspace Semantic Index contract、provider composition 与稳定查询   | `@prodivix/authoring`                              |
| CodeArtifact projection、CodeReference、CodeSlot 与代码作者体验      | `@prodivix/authoring` / Code Authoring Environment |
| `asset` / `project-config`                                           | Workspace Resource owner 与对应 adapter            |

## 唯一写入链路

```text
Human gesture / AI proposal / Plugin action / Importer
  -> domain planner
  -> reversible Command or atomic Transaction
  -> Workspace + domain validation
  -> local History
  -> WorkspaceOperation
  -> Durable Outbox
  -> strong-idempotent Atomic Commit
  -> Canonical Backend Workspace
  -> confirmed local replica
```

Intent 只作为 planner 输入。Patch 只作为 Command 内部可逆操作。Settings 使用独立的 durable Settings Outbox / Atomic Commit。

跨文档变更先构造最终候选 Workspace，再执行 Workspace 与所有相关领域 validator；任一约束失败时整个 Transaction 不生效。

## 读取投影

1. `createWorkspacePirProjectionPlan` 从 validated current PIR documents 生成 revision-bound 临时投影；Renderer 与 Export 不修改该投影或写回派生树。
2. CodeArtifact 从 Workspace code document 派生，code document 继续是源码事实源。
3. Git projection 从同一 Workspace revision 生成文件与审计 metadata。
4. confirmed local replica 加 pending Operation materialization 形成离线读取快照。
5. Workspace Semantic Index 在 G1 由 partitioned Workspace revisions、semantic schema 与 provider set 生成可重建 snapshot。

## G1 Component 与 Collection

PIR-current 在现有 Workspace identity 和 Transaction 语义上承载：

1. `pir-component` Public Contract 与 Component Instance reference。
2. Component dependency DAG、cycle validation 与删除影响分析。
3. subtree extraction 的跨文档 relocation plan 和原子 Transaction。
4. first-class Collection、item/index scope 与显式 state regions。
5. Component/Collection semantic contribution、Preview/Export parity 与 SourceTrace。

这些能力继续使用同一个 `WorkspaceDocument.id`、History、WorkspaceOperation、Outbox 和 Atomic Commit；Canonical Workspace VFS 继续承载唯一作者态存储。

## PIR wire 演进边界

1. `PIR-v<version>.json` 是不可变持久化 snapshot；`PIR-current.version.json` 选择当前写出格式。
2. persistence adapter 在数据进入 Canonical Workspace 前完成版本 dispatch、strict decode 与确定性 migration，并只交付无版本 `PIRDocument`。
3. 保存端把 current model 编码成 activation manifest 选中的 wire contract；Workspace Command、History 与 conflict 不保存版本化领域副本。
4. 普通 wire 升级只新增 snapshot、generated wire contracts 与 migration。`WorkspaceDocument`、Transaction、projection、Semantic Index、Renderer、Compiler 和 Web 不随数字版本改名或复制。
