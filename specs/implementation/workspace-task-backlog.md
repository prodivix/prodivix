# Workspace 重构执行任务清单（Backlog v0）

## 状态

- In Progress
- 日期：2026-02-08
- 关联：
  - `specs/implementation/workspace-refactor-plan.md`
  - `specs/decisions/README.md`

## 0. 边界与执行原则

1. 本清单仅覆盖 workspace 重构，不实现 NodeGraph/动画编辑器 UI。
2. 必须保留未来扩展接口（`pir-graph`/`pir-animation`、`core.nodegraph.*`、`core.animation.*`）。
3. 用户侧只暴露 Blueprint 对象操作，不暴露 VFS 文件操作 UI。
4. 目标是不保留 `pirDoc` 兼容层；过渡期允许 capability 控制的回退写入，待迁移完成后移除。

## 0.1 最新落地（2026-02-08）

1. 已完成：项目创建时 workspace 快照引导、legacy 项目读取补建 workspace。
2. 已完成：Blueprint 优先文档级保存，能力未就绪/不支持时回退项目级保存。
3. 已完成：保存状态图标与 i18n 文案（中英文）上线，保存成功后自动回到 idle。
4. 已完成：BlueprintEditor 主文件拆分为多个子模块，便于后续继续拆分任务并行推进。

## 1. 里程碑与 Gate

1. `M1 / Gate A`：契约冻结（Schema/OpenAPI/Envelope）
2. `M2 / Gate B`：后端 workspace API 可用
3. `M3 / Gate C`：前端 store + command + outbox 切换完成
4. `M4 / Gate D`：Blueprint 路由化改造完成
5. `M5 / Gate E`：迁移与切换完成
6. `M6 / Gate F`：质量回归与扩展预演完成

## 2. 可执行任务（按泳道拆分）

### A. Data & API

- [x] `API-001` 冻结 `workspace-model` 字段（`workspaceRev/routeRev/contentRev/metaRev/opSeq`）
  - 产出：字段冻结记录 + 评审结论
  - 依赖：无
  - 验收：冻结期间不新增破坏性字段
  - 结果：`specs/workspace/workspace-model.md`、`specs/implementation/reviews/API-001-workspace-model-freeze.md`

- [x] `API-002` 冻结 `IntentEnvelope/CommandEnvelope`（含 reserved domain 错误码）
  - 产出：固定字段表 + 示例 payload
  - 依赖：`API-001`
  - 验收：`core.nodegraph.*`/`core.animation.*` 可协商为 `false`
  - 结果：`specs/decisions/12.intent-command-extension.md`、`specs/implementation/reviews/API-002-intent-command-freeze.md`

- [x] `API-003` 完成 OpenAPI 定稿并校验
  - 产出：`specs/api/workspace-sync.openapi.yaml`
  - 依赖：`API-001`、`API-002`
  - 验收：YAML 解析通过；响应模型统一使用 `expected*` 与最新 rev 返回
  - 结果：`specs/api/workspace-sync.openapi.yaml`、`specs/implementation/reviews/API-003-openapi-freeze.md`

- [x] `API-004` 后端数据表与仓储层改造（workspace/docs/route/op_seq）
  - 产出：DDL + DAO + 单测
  - 依赖：`API-003`
  - 验收：文档内容更新不误增无关分区 rev
  - 结果：`apps/backend/database.go`、`apps/backend/workspace_store.go`、`apps/backend/workspace_store_test.go`、`specs/implementation/reviews/API-004-workspace-store.md`

- [ ] `API-005` 实现 5 个 workspace 接口（snapshot/capabilities/document/intents/batch）
  - 产出：handler + service + 错误码
  - 依赖：`API-004`
  - 验收：`DOCUMENT/WORKSPACE/ROUTE/HYBRID` 冲突可稳定复现

### A1. PIR Data Scope / List Render（v1.2）

- [x] `PIR-001` 完成 ADR + PIR v1.2 契约草案 + JSON Schema 草案
  - 产出：`specs/decisions/15.pir-data-scope-and-list-render.md`、`specs/pir/pir-contract-v1.2.md`、`specs/pir/PIR-v1.2.json`
  - 依赖：`API-001`、`API-002`、`API-003`
  - 验收：v1.2 明确 `data/list` 字段、`$data/$item/$index` 语义与错误码建议
  - 结果：`specs/implementation/reviews/PIR-001-data-scope-list-contract.md`

- [ ] `PIR-002` 渲染器支持 data scope 继承与 list 模板渲染
  - 产出：`PIRRenderer` 上下文求值扩展 + 单测
  - 依赖：`PIR-001`
  - 验收：同一模板可基于数组稳定渲染，子节点可继承父 scope

- [ ] `PIR-003` Inspector 增加“绑定数据模型/提升为列表”面板
  - 产出：节点配置 UI + 引导文案 + 诊断提示
  - 依赖：`PIR-001`
  - 验收：用户可在 Blueprint 内完成数据绑定与 list 配置

- [ ] `PIR-004` 前后端校验接入 v1.2 错误模型
  - 产出：schema 校验器 + 错误码映射（`PIR_LIST_SOURCE_NOT_ARRAY` 等）
  - 依赖：`PIR-001`、`API-005`
  - 验收：保存/导出前后都能返回字段级错误

- [ ] `PIR-005` 代码生成器支持 list 输出与引用解析
  - 产出：React 生成器 `.map()` 支持 + 回归测试
  - 依赖：`PIR-002`、`PIR-004`
  - 验收：渲染预览与生成代码语义一致

### B. Editor Core（Store / Command / Outbox）

- [ ] `CORE-001` 重构 `useEditorStore`，移除 `pirDoc` 状态入口
  - 产出：`workspace + activeDocumentId + activeRouteNodeId` 状态模型
  - 依赖：`API-003`
  - 验收：代码中无 `state.pirDoc` 引用

- [ ] `CORE-002` 实现 Command Executor（forward/reverse/transaction/mergeKey）
  - 产出：执行器 + 历史栈模块 + 单测
  - 依赖：`CORE-001`
  - 验收：拖拽/连续输入可按 merge 规则折叠历史

- [ ] `CORE-003` 实现 Outbox（本地即时应用 + 防抖批量 flush + 重放）
  - 产出：outbox 模块 + 重放策略
  - 依赖：`CORE-002`、`API-005`
  - 验收：离线编辑后恢复网络可重放并收敛 rev

- [ ] `CORE-004` 接入 capabilities 协商与 reserved domain no-op
  - 产出：能力缓存 + `UNHANDLED_RESERVED_DOMAIN` 遥测
  - 依赖：`CORE-003`
  - 验收：收到保留域命令不崩溃、不触发 UI 行为

### C. Blueprint UX（Route/Layout/Outlet）

- [ ] `UX-001` 将 `routes/currentPath` 切换为 `routeManifest + activeRouteNodeId`
  - 产出：路由树状态与渲染映射层
  - 依赖：`CORE-001`
  - 验收：URL 预览选择与持久化路由节点一致

- [ ] `UX-002` 实现路由意图操作（新建页面/子路由/拆分布局/删除）
  - 产出：Blueprint 操作入口 -> Intent Dispatch
  - 依赖：`UX-001`、`API-005`
  - 验收：同一操作可写入 routeRev 与相关 doc metaRev/contentRev

- [ ] `UX-003` 实现内部文档自动维护（不暴露文件 UI）
  - 产出：系统级文档创建/重命名/归档策略
  - 依赖：`UX-002`
  - 验收：用户无文件系统心智也可完成多页面编辑

- [ ] `UX-004` 增加 Outlet/路由诊断（OUTLET_MISSING 等）
  - 产出：诊断引擎 + 编辑器提示
  - 依赖：`UX-002`
  - 验收：阻断发布级错误；可点击定位到节点

### D. Migration & Quality

- [ ] `MIG-001` 编写 `projects.pir_json -> workspace snapshot` 迁移器
  - 产出：迁移脚本 + 失败报告格式
  - 依赖：`API-005`、`CORE-001`
  - 验收：迁移成功率目标 `>=99%`

- [ ] `MIG-002` 切换 runbook（停写旧接口 -> 执行迁移 -> 发布客户端 -> 验证）
  - 产出：上线手册 + 回滚手册
  - 依赖：`MIG-001`
  - 验收：回滚演练至少 1 次成功

- [ ] `QA-001` 压测：高频编辑 / 混合事务冲突 / 命令重放一致性
  - 产出：压测报告 + 基线阈值
  - 依赖：`CORE-003`、`API-005`
  - 验收：30 次/分钟编辑无明显卡顿

- [ ] `QA-002` 回归：Blueprint 全链路 + Export 一致性 + PIR 校验错误提示
  - 产出：自动化测试清单（单测/E2E）
  - 依赖：`UX-004`
  - 验收：P0 崩溃缺陷为 0

- [ ] `QA-003` 扩展预演（仅协议，不落地编辑器）
  - 产出：`core.nodegraph.*` / `core.animation.*` mock 回放报告
  - 依赖：`CORE-004`
  - 验收：新增 mock 不改核心协议字段

## 3. 关键依赖图（简化）

```txt
API-001/002 -> API-003 -> API-004 -> API-005
API-001/002/003 -> PIR-001 -> PIR-002 -> PIR-004 -> PIR-005
PIR-001 -> PIR-003
API-003 -> CORE-001 -> CORE-002 -> CORE-003 -> CORE-004
CORE-001 -> UX-001 -> UX-002 -> UX-003/UX-004
API-005 + CORE-001 -> MIG-001 -> MIG-002
CORE-003 + UX-004 -> QA-001/QA-002 ; CORE-004 -> QA-003
```

## 4. 每周执行节奏（建议）

1. 周初：锁定当周任务（仅拉取 `Ready` 状态条目）
2. 周中：完成开发 + 单测 + 自测，失败即回退到上一 Gate
3. 周末：Gate Review（按验收条目逐项打勾）

## 5. Ready/Done 标准

### Ready（可开工）

1. 依赖任务已完成
2. 输入/输出字段定义完整
3. 验收口径可自动化验证或可复现

### Done（可关闭）

1. 代码与规范一致（无 `pirDoc` 回流）
2. 关联测试通过
3. 文档更新完成（至少更新变更点与风险）
4. 不突破边界（未引入 NodeGraph/动画编辑器 UI）

## 6. 第一批开工建议（按顺序）

1. `API-001` + `API-002`（同一评审会一次冻结）
2. `API-003`（冻结后立即定稿）
3. `CORE-001`（先拆 `pirDoc`，降低后续耦合）
4. `API-004` + `API-005`（后端接口并行）
5. `CORE-002` + `CORE-003`（前端核心链路闭环）
6. `PIR-002` + `PIR-003`（数据模型与列表渲染可视化能力）
