# Workspace 重构实施计划（Full Refactor）

## 状态

- In Progress
- 日期：2026-02-08
- 关联：
  - `specs/implementation/workspace-task-backlog.md`
  - `specs/decisions/05.workspace-vfs.md`
  - `specs/decisions/06.command-history.md`
  - `specs/decisions/07.workspace-sync.md`
  - `specs/decisions/08.route-manifest-outlet.md`
  - `specs/decisions/09.component-route-composition.md`
  - `specs/decisions/10.pir-contract-validation.md`
  - `specs/decisions/11.revision-partitioning.md`
  - `specs/decisions/12.intent-command-extension.md`
  - `specs/decisions/13.route-runtime-contract.md`
  - `specs/decisions/14.plugin-sandbox-and-capability.md`
  - `specs/decisions/15.pir-data-scope-and-list-render.md`

## 当前进展（2026-02-08）

1. 后端已具备 workspace 首建能力；hard cutover 后老项目不再自动补建或迁移。
2. Blueprint 保存路径已切到“优先文档级保存”；hard cutover 后不保留项目级 PIR 回退。
3. 前端保存状态反馈、能力协商等待、失败重试文案与 i18n 已接入。
4. BlueprintEditor 已完成模块化拆分，主文件收敛为编排层。
5. 当前开发阶段允许破坏性更新：旧单 PIR 项目全部舍弃，新项目只使用 Workspace。

## 0. 目标与边界

### 目标

1. 从单 `pirDoc` 架构切换到 `workspace` 架构（hard cutover，无旧项目兼容、无项目级 PIR 回退）
2. 用户只操作 Blueprint 可见对象（路由/页面/布局/组件），不操作 VFS
3. 完成分区 rev 同步链路（`workspaceRev/routeRev/contentRev/metaRev`）
4. 建立可序列化 Command/Intent 协议，为插件与协作预留扩展能力

### 非目标（本计划不做）

1. CRDT 协同编辑
2. 插件市场上线
3. 完整 SSR/SSG 产物链
4. 节点图编辑器功能实现（节点面板、画布交互、执行调试）
5. 动画编辑器功能实现（时间轴、关键帧、动效面板）
6. 任何新增业务编辑器的完整交互开发（仅做协议预留与 mock 校验）

### 预留接口（本计划必须做）

1. 文档类型预留：`pir-graph`、`pir-animation` 可存储、可同步、不可编辑
2. 能力预留：`core.nodegraph.*`、`core.animation.*` 能出现在 capability map
3. 命令预留：保留域命令可被解析、记录并返回结构化状态（默认 no-op）
4. 监控预留：未处理保留域命令统一上报 `UNHANDLED_RESERVED_DOMAIN`

## 1. 总体工作流

按四条泳道并行推进，每阶段设 Gate，不达标不进入下一阶段：

1. **Data & API**
2. **Editor Core（Store/Command）**
3. **Blueprint UX（Route/Layout/Outlet）**
4. **Hard Cutover & Quality**

## 2. Phase 计划

### Phase A：契约冻结（Gate A）

目标：冻结最小可实现契约，避免边开发边漂移。

任务：

1. 冻结 `workspace-model` 字段集（含分区 rev）
2. 冻结 `intent envelope` 与 `command envelope` 最小字段
3. 冻结 `route-manifest` v1（含 runtime 最小字段）
4. 冻结 `PIR-v1.3` graph-only 合同（含 `x-*` 扩展规则、data/list 扩展）
5. 冻结保留域命名与错误码：`core.nodegraph.*`、`core.animation.*`

输出：

- 规格文档标记 `Draft-Frozen`

验收：

- [ ] 评审会通过
- [ ] 冻结期间禁止增删字段（仅修正文案）

---

### Phase B：后端落地（Gate B）

目标：提供可用 workspace API 与冲突协议。

任务：

1. 设计并创建 workspace 数据表（工作区、文档、路由清单、操作序列）
2. 实现接口：
   - `GET /api/workspaces/:id`
   - `GET /api/workspaces/:id/capabilities`
   - `PATCH /api/workspaces/:id/commands`
3. 实现分区 rev 校验与冲突返回（`DOCUMENT/WORKSPACE/ROUTE/HYBRID`）
4. 接入 Workspace、Route Manifest 和 PIR v1.3 graph-only 校验

输出：

- 后端 workspace API 可跑通
- OpenAPI 与实现一致

验收：

- [ ] 文档级 command 不影响无关文档 rev
- [ ] 路由 command 可递增 `routeRev`
- [ ] 冲突响应字段完整

---

### Phase C：前端核心重构（Gate C）

目标：彻底移除 `pirDoc`，切换 workspace store。

任务：

1. 替换 `useEditorStore`：
   - 移除 `pirDoc/setPirDoc/updatePirDoc`
   - 引入 `workspace/activeDocumentId/applyCommand`
2. 实现 Command 执行器：
   - 支持 `forwardOps/reverseOps`
   - 支持事务合并
3. 实现 Outbox：
   - 本地即时应用 command transaction
   - 防抖批量同步 command transaction
4. 接入 capabilities 拉取与 command 发送
5. 预留域命令默认 no-op（记录历史与遥测，不触发 UI 行为）

输出：

- Editor 在 workspace 模型下可打开、编辑、保存

验收：

- [ ] 代码中无 `state.pirDoc` 引用
- [ ] Undo/Redo 可跨页面与内部结构操作
- [ ] 离线编辑可积压命令并重放

---

### Phase D：Blueprint 路由化改造（Gate D）

目标：让用户“只见路由与页面”，系统内部维护 VFS。

任务：

1. 将现有 `routes/currentPath` 本地状态替换为 `routeManifest + activeRouteNodeId`
2. 增加用户意图操作：
   - 新建页面
   - 新建子路由
   - 拆分/合并布局
   - 删除页面/路由
3. 自动维护内部文档树（不暴露文件操作 UI）
4. Outlet 诊断与错误提示

输出：

- Blueprint 路由树可视化与页面切换

验收：

- [ ] 用户可完成多级路由编辑且无需文件视图
- [ ] 缺失 Outlet 可实时诊断
- [ ] 内部文档关系一致性校验通过

---

### Phase E：Hard Cutover（Gate E）

目标：删除旧单 PIR 编辑链路，新项目全量切换到 workspace-only。

任务：

1. 新项目创建只 bootstrap workspace snapshot。
2. 删除前端 `saveProjectPir` 和 project PIR fallback 调用。
3. `GET /projects/:id/pir` 返回 retired single-PIR 格式错误或从编辑器路由中移除。
4. 停止 `projects.pir_json` 作为编辑器读写来源。
5. 打开旧项目时提示创建新的 workspace 项目。

输出：

- 新项目全部进入 workspace-only 模型
- 旧单 PIR 项目被明确拒绝

验收：

- [ ] 新项目创建后具备多文档 workspace 文件树
- [ ] 旧单 PIR 项目打开时返回明确 retired 错误
- [ ] 切换后无 project PIR 写流量

---

### Phase F：质量与扩展验证（Gate F）

目标：验证扩展性防线是否真实有效。

任务：

1. 新增压力测试：
   - 高频文档写入并发
   - 路由/文档混合事务冲突
   - 命令重放一致性
2. 新增回归测试：
   - Blueprint 操作链路
   - Export 产物一致性
   - PIR 校验错误提示
3. 预演两个“未来功能”：
   - 插件意图命名空间接入（mock）
   - Route runtime loader/guard mock 执行
4. 预演保留域协议：
   - `core.nodegraph.*` envelope 回放（不落地编辑器）
   - `core.animation.*` envelope 回放（不落地编辑器）

验收：

- [ ] P0 崩溃缺陷为 0
- [ ] 冲突提示可被用户理解
- [ ] 新增 mock 功能无需改动核心协议字段

## 3. 关键风险与止损规则

### 风险 1：协议漂移

- 触发条件：一周内两次以上字段临时变更
- 止损：冻结合并，回到 Phase A 重新评审

### 风险 2：旧入口未完全删除

- 触发条件：新项目或编辑器仍调用 `projects.pir_json` / `saveProjectPir`
- 止损：阻断发布，删除旧入口调用后再继续

### 风险 3：命令重放不一致

- 触发条件：同一命令链回放结果不一致
- 止损：禁止上线，先修复 Command 执行器幂等

## 4. 交付清单（按优先级）

1. 后端 workspace API + rev 分区冲突处理
2. 前端 workspace store + command executor + outbox
3. Blueprint route-manifest 化 + 自动文档管理
4. hard cutover runbook
5. 测试矩阵与质量基线

## 5. Definition of Done

1. 用户只在 Blueprint 层完成页面与路由编辑
2. 系统内部自动管理文档与结构，无文件级 UI 暴露
3. 默认保存链路不再依赖 `pirDoc`；项目级 PIR 回退写入被删除
4. 新增功能（插件意图、路由运行时）可通过扩展协议接入而不破坏核心模型
