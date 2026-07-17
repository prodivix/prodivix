# 全仓库静态审查记录：2026-07-17

## 状态

- 快照式发现清单（point-in-time），**非冻结契约**。
- 日期：2026-07-17。
- 基线提交：`aa9e0699`（`main`）。
- 审查范围：`apps/backend`、`apps/web`、`packages/*`、`specs/*`、`.github/workflows/*`。
- 方法：18 个互不重叠切片的只读深审（17 个由后台 subagent 并行完成，`packages/workspace` 与 `packages/workspace-sync` 由主审自读 4 个核心文件补齐）。**全程未修改任何文件。**
- 性质：发现清单，每条带置信度。**修复前必须按当前源码复核**——行号会随提交漂移，个别「疑似」项依赖未读的相邻契约。

---

## 审查方法与覆盖

1. 切片划分：后端 Go（4）、Web 编辑器（5）、领域包（5）、进度/架构/CI/文档（4），合计 18 片。
2. 每片深读整文件（非摘录），并携带架构不变量校验清单去查违规。
3. 过程备注（如实记录，供后续审查参考）：
   - 后台深审 agent 存在系统性提前收尾现象（首次返回常只剩半句即被 finalize）；通过 `SendMessage` 恢复机制可靠救回了绝大多数（含一个读了 94 个文件的 CI 切片、一个读了 52 个文件的 runtime 切片）。
   - **贯穿信号**：`TODO`/`FIXME`/`HACK`/`XXX` 在整个生产代码库中几乎为零（18 片全部报零），源于 `check:editor-hard-cut`、`check:core-boundaries` 等 lint 门的强制。债务不在「腐烂的代码」，而在「未建的表面」。
   - 异常：后台 subagent 的 `subagent_tokens` 几乎全部上报为 0（仅 1 片报 156），token 计费在该链路上似乎未归因——仅记录，未强行解释。

---

## 一、严重缺陷（Critical / High）

> 排序：Critical > High（安全）> High（正确性/崩溃）。格式：`路径:行 —— [严重度] 问题 → 为何错 → 修复方向。（置信度）`

### Critical

1. `apps/backend/internal/modules/auth/store.go:239-246`、`apps/backend/internal/modules/project/models.go:67-74` —— **[critical]** `newRandomHex` 在 `crypto/rand.Read` 失败时回退到 `hex(time.Now())` → 会话令牌、会话 ID、用户 ID、项目 ID **完全可预测**（仅约 12 字节时间戳熵）。一旦 rand 失败（fd 耗尽、容器 `/dev/urandom` 异常、内核故障）即等同直接账户接管与伪造所有权。 → `rand.Read` 失败时应 **panic 或拒绝签发**，绝不静默降级；同时把重复实现抽到单一工具函数。（置信度：已确认）

### High —— 安全

2. `apps/backend/internal/modules/auth/store.go:172-179, 188-191` —— **[high]** 会话 bearer token **明文存库**（`INSERT INTO sessions (..., token, ...)`、`WHERE token = $1`）。代码内已存在正确范式 `legacySessionID(token) = sha256(token)` 却未用作主存储。任何 DB 读访问（备份泄漏、他处 SQLi、快照、内鬼）即获得活令牌，默认有效期 24h。 → 仅存 `SHA-256(token)`，按哈希查询，原始令牌仅返回客户端一次。（置信度：已确认）
3. `apps/backend/internal/modules/auth/handlers.go:93-101` —— **[high]** 密码无长度上限，仅校验 `len(password) < 8`；`bcrypt.GenerateFromPassword` 在 72 字节处静默截断 → 任意两个共享 72 字节前缀的密码彼此等价。 → 强制 `len <= 72` 或先 SHA-256+base64 再 bcrypt。（置信度：已确认）
4. `apps/backend/internal/modules/auth/routes.go` + `apps/backend/server.go` —— **[high]** **全后端零限流**（`grep RateLimit|Throttle|limiter` 无匹配），`/auth/login` 可暴力破解与撞库。 → 在 `/auth/*` 前加按 IP 与按账号的限流中间件。（置信度：已确认）
5. `apps/backend/internal/modules/auth/handlers.go:128-136` —— **[high]** 登录时序泄漏邮箱是否存在：`GetByEmail` 未命中时立即返回，命中分支跑 `bcrypt.CompareHashAndPassword`（约 80–100ms）。 → 未命中时对一个固定 dummy 哈希跑一次 bcrypt 再返回，均衡时序。（置信度：已确认）
6. `apps/backend/internal/modules/auth/handlers.go:162-170` + `apps/backend/server.go:41` —— **[high]** `GET /users/:id`（仅 `RequireAuth`）让任何登录用户读取他人 `PublicUser`（含 `email`）；`router.Static("/uploads", "./data/uploads")` 公开所有上传文件且 `gin.Static` 经 `http.FileServer` **开启目录列举**（`GET /uploads/avatars/` 可枚举用户 ID 子目录）。 → 从 `PublicUser` 去掉 `email`（非本人/管理员）；关闭上传目录的 auto-indexing 或改走鉴权/签名 URL。（置信度：已确认）
7. `apps/backend/internal/modules/integrations/github/handlers.go:96-117`（`store.go:68-96, 141-173`）—— **[high]** **跨租户越权**：`/integrations/github/installations` 与 `/integrations/github/repositories` 对任意登录用户（无 admin/owner 校验）返回全系统所有 GitHub App installation 及其全部仓库元数据（owner、name、full_name、默认分支、private 标志）。 → 加按用户作用域过滤（如经 `github_repository_bindings` 按 `user_id` 关联）或管理员门禁。（置信度：已确认）
8. `apps/backend/internal/modules/integrations/github/handlers.go:208-225` —— **[high]** webhook 去重**永久吞掉失败的 upsert**：首次 `applyInstallationPayload` 失败 → 返回 400 → GitHub 以同 `delivery_id` 重试 → `RecordWebhookEvent` 返回 `inserted=false` → 返回 202 Accepted 且**不再重跑 apply**。单次瞬时 DB 错误即永久丢失 installation/仓库更新。`github_events.processed` 列为**死列**（全后端无 `UPDATE github_events SET processed`、无 `SELECT FROM github_events`）。 → 把去重与 apply 包进同一事务（当 `processed=false` 时重试即重跑 apply），或加后台重处理 worker。（置信度：已确认）
9. `apps/backend/internal/modules/integrations/github/handlers.go:49-58, 70-94` —— **[high]** webhook 与 dev-event 处理器 `io.ReadAll(c.Request.Body)` 无大小上限，且签名校验在缓冲完整个 body 之后 → 匿名 DoS 放大器（无需 webhook secret 即可耗尽内存）。其他模块（`auth`、`environment`、`remoteexecution`）均已用 `MaxBytesReader`/有界读取，唯独 github 遗漏。 → 两处 body 包裹 `http.MaxBytesReader`，并在缓冲前做签名校验。（置信度：已确认）
10. `apps/backend/internal/config/config.go:57, 91-94`、`deploy/docker-compose.ghcr.yml:9, 38` —— **[high]** `DatabaseURL` 默认 `postgres://postgres:postgres@localhost:5432/prodivix?sslmode=disable`（硬编码进生产二进制）；`deploy` compose 对缺失 `POSTGRES_PASSWORD` 用 `${POSTGRES_PASSWORD:-postgres}` **fail-open**；`LoadConfig()` 从不返回 error，密钥缺失全部静默降级。 → 默认值清空并强制显式配置；`POSTGRES_PASSWORD` 改 `:?required`；`LoadConfig` 返回 `(Config, error)` 并在非 development 环境拒绝缺失必需项。（置信度：已确认）

### High —— 正确性 / 崩溃

11. `apps/backend/internal/modules/workspace/data_source_validator.go:106` —— **[high]** `validateDataOperationRelations` 的可选字段数组 `["entityIdPath","valueInputPath","placement"]` 漏了 `valueOutputPath`，但 `data_source_policy_validator.go:271` 对 create/update 把它列为**必填**。因 `decodeDataObject` 拒绝未知字段，带 documentID 的生产路径会拒绝所有含 create/update optimistic policy 的数据源文档。现有测试（`domain_document_validator_test.go:120`）因未传 documentID 走了 early-return 而未命中。 → 在第 106 行可选数组加入 `"valueOutputPath"`，或与 `validateDataOptimisticPolicy` 共享字段清单。（置信度：已确认）
12. `apps/backend/internal/modules/workspace/pir_validator.go:21, 22, 27, 40, 76` —— **[high]** 多处未检查类型断言（`document["ui"].(map[string]any)`、`ui["graph"].(map[string]any)`、`graph["nodesById"].(map[string]any)`、`graph["childIdsById"].(map[string]any)`、`rawChildren.([]any)`）——一旦 `pircontract.ValidateDocument` 允许这些字段为非对象形态（schema 演化、允许 null），即生产代码 panic。 → 全部改逗号-ok 形式或加防御性 guard。（置信度：已确认）
13. `apps/backend/internal/modules/workspace/store_snapshot.go:239-362` —— **[high]** `GetSnapshotForOwner` 两次独立读（workspace 行 T1、documents T2）无事务；READ COMMITTED 下并发提交落在 T1、T2 之间会产生 mixed snapshot（workspace_rev/route_rev 与可见文档行不匹配），导致 `validateWorkspaceRouteDocumentReferences` 误失败或调用方基于混合快照决策。 → 包进只读事务（或 REPEATABLE READ），或合并为单查询。（置信度：疑似，依赖隔离级别）
14. `packages/pir-react-renderer/src/component/PIRComponentInstanceProjection.tsx:21-22`、`packages/pir-react-renderer/src/node/PIRNodeProjection.tsx:96` —— **[high]** `runtime.plan.documentsById[node.componentDocumentId]!`、`document.content.componentContract!`、`document.content.ui.graph.nodesById[nodeId]!` 等非空断言，在 stale 或部分解析的 plan 上会**抛出并崩塌整个 React 树**，违反 renderer「纯读投影、遇缺失应报 `PIRRendererBlockingIssue` 并优雅 bail」的契约（`resolvePirRendererHost` 已为 host 缺失这么做，此处却未对齐）。 → 改为防御性查找并产出 blocking issue。（置信度：已确认）
15. `apps/web/src/editor/workspaceSync/WorkspaceOutboxEffects.tsx:150-159` —— **[high]** post-loop conflict recovery 在改全局状态前**未校验当前 workspace 是否仍等于捕获的 `workspaceId`**。用户在排空循环 in-flight 时切换 workspace，此路径会 `setWorkspaceSnapshot(...)`（把用户强切回 stale workspace）再 `openWorkspaceRevisionConflict(...)`。主循环的 `adoptResumeResult`、`adoptWorkspaceRemoteSnapshot` 都带 workspace-id guard，唯独此路径漏了。 → 在 `setWorkspaceSnapshot` 前加 `if (state.workspace?.id !== workspaceId) return;`。（置信度：已确认）
16. `packages/ai/src/validation/validateStructuredOutput.ts:36` —— **[high]** `candidate = output as unknown as LlmStructuredOutput` 仅在 `isRecord` + 允许 channel 检查后即强转，对 `LlmPirCommandBatch.commands`、`LlmCodeArtifact.kind/language/content`、`riskLevel` 等**零结构校验**；该函数却对外播报 `validated-output` 事件。`{channel:"pir-command", commands:"not-an-array"}` 可直达下游 planner。 → 真正校验各 channel 的必填字段与类型；若范围有限则重命名事件。（置信度：已确认）
17. `apps/web/src/editor/features/blueprint/editor/inspector/projection/bindingProjection.ts:226-238` + `inspector/fields/triggers/TriggerNavigateFields.tsx:40-49` + `controller/useBlueprintEditorController.ts:750-755` —— **[high]** navigate trigger 往返把用户输入的路径当作 `routeId` 存储（`toEditableTrigger` 用 `destination` 兜底为 `routeId`），而 route ID 是不透明 operation ID（如 `route-node-…`）→ `routes.find((item) => item.id === trigger.routeId)` 永不命中 → **每个用户创作的内部 navigate trigger 都报「Route /products is unavailable」**。 → `TriggerNavigateFields` 按 path 查 `routeOptions` 并写入解析后的 `routeId`，或在 `toEditableTrigger` 经 route manifest 做 path→id 解析。（置信度：已确认）
18. `apps/web/src/editor/features/blueprint/editor/sidebar/SidebarDraggableCards.tsx:51-58` —— **[high]** `{...attributes} {...listeners}`（dnd-kit）展开在显式 `onKeyDown` 之后，覆盖了 `onPreviewKeyDown` → 聚焦调色板卡片按 Enter/Space 启动键盘拖拽而非切换变体预览；该 activator 还带 `role="button"` + `tabIndex={0}` 且 `onClick` 仅 `stopPropagation`（无动作），被屏幕阅读器报为「什么都不做的按钮」。 → 合并处理器（都调用），或把 activator 提到外层 toggle button 之外。（置信度：已确认）
19. `apps/backend/internal/platform/database/database.go:23-34, 304-308` —— **[high]** `RunMigrations` 复用 5s ping 的 ctx 执行约 50 条 DDL（含大表 CREATE INDEX），冷缓存或负载下可能中途超时；迁移逐条自动提交、**无外层事务、无 `schema_migrations` 版本表、无 `pg_advisory_lock`**——语句 N 失败则 1..N-1 永久残留、其余跳过，多副本启动竞态。 → 迁移用独立长超时；引入版本表 + 迁移工具 + 建议锁。（置信度：已确认）

> 另有大量 Med 级发现（runner 模块级单例无互斥、iframe `allow-scripts + allow-same-origin` 沙箱逃逸面、`response.go` 字符串前缀错误分类、PIRDocumentProjection 一帧 stale 状态、Issues 的 HMR 计数器重置、token resolver 环检测缺 visited 集合、nodegraph 持久化无 debounce、contract editor `nextId` 可能复用已删除 durable ID、Quick Fix registry 全局为空、origin 诊断全部硬编码 warning 致无 license 依赖仍可出货等），详见各切片原始报告（保留于审查会话记录中）。

---

## 二、跨切片反复出现的模式

| 模式 | 出现位置 | 性质 |
|---|---|---|
| `JSON.stringify` 当相等判断 | outbox 幂等（memory + IndexedDB）、PIR mutations 的 `changed` 检测、ComponentContractEditor `dirty`、`indexedDbCausalOutboxStore` | 键序敏感；当前因上游确定性生成而暂稳，属潜在隐患 |
| `localeCompare` 当确定性排序 | `diagnosticIssueCollection`、`semanticSnapshotIdentity`、provider-set 摘要 | **跨 locale 不可移植**（dev Windows zh-CN 与 CI Linux en-US 会产生不同 fingerprint/键）；对照之下 outbox 的 `compareUnicodeCodePoints` 用码点比较才是正确范式 |
| 模块级可变单例 | `persistedExpandedPanels`、`nextRevisionSequence`、`emptyMap`、runner 的 `activeJob`/`consumerCount`、`defaultCreateId` 用 `Date.now()+Math.random()` 生成 trace ID | HMR 或多实例下互相串状态；trace ID 非确定 |
| async 闭包捕获 stale + 无取消 | blueprint nodegraph trigger 链、`AnimationEditor.runActiveTimeline`、NodeGraph `onNodeDragStop` 的 rAF、runner effect | 切换 workspace 或卸载后仍向 canonical workspace 写入 |
| `as` 强转不校验 discriminator | TriggerDataMutationFields、CollectionInspectorPanel、token.go 解析、`openAICompatibleProvider` 的 `abortSignal` | record 形即放行，仅靠 plan 边界兜底 |
| 关键模块零测试 | `auth`（7 文件 0 测试）、`project`（7 文件 0 测试）、`integrations/github`（仅 webhook 签名测试）、`RunMigrations`（300+ 行 DDL 无测试） | 信任边界最弱处反而保护最少 |
| CI 死 gate | `verify:g0`、`verify:g1:standalone`、`verify:g1:browser` 脚本存在但**无任何 workflow 调用** | 形同虚设 |
| GitHub Actions 未 SHA pin | 全部 workflow 用 `@v6`/`@v4` 标签而非 SHA | 标签被投毒即在 CI 执行攻击代码并可取 `secrets.GITHUB_TOKEN` |

---

## 三、架构不变量核验结果（仍然成立）

这是最值得肯定的部分。各切片逐一验证如下不变量**成立**：

1. **可逆性 / Atomic Commit（最高 blast radius 区域，守得最严）**：
   - TS 侧 `applyWorkspaceDocumentCommandInternal` 与 workspace 侧均先 apply `reverseOps` 再用**键序无关**的 `valuesEqual`（递归、排序键）校验「精确还原原状」，不还原即拒绝整个 command；Transaction 逐条 apply 时关闭校验、末尾整体校验一次，允许中间态非法但保证最终原子一致。
   - Go 侧 `CommitWorkspaceOperation`/`CommitWorkspaceSettings` 以 `FOR UPDATE OF w` 串行化 + `(workspace_id, operation_id)` 唯一索引 + RequestHash 比对防重放 + `applyDocumentCommand`/`applyRouteCommand`/`applyWorkspaceCommand` 各自校验 reverseOps 还原。
2. **PIR 版本中立**：`pir.types.ts` 无 `version` 字段；codec 剥离 `$.version` 与 `$.ui.graph.version` 并拒绝含版本的 domain 文档；数字版本仅存于 `pirWire.generated.ts`（`CURRENT_PIR_WIRE_VERSION = '1.6'`）与迁移链（1.3→1.4→1.5→1.6）。
3. **ui.graph 规范化**：所有 editor 写路径均走 `replace /ui/graph` 单原子 op，无直接覆写树状态；tree view 为纯读投影（带 `visiting` 环保护）。
4. **Semantic Index = 投影非真相**：`createWorkspaceSemanticIndex` 纯从 providers facts 构建不可变快照，仅暴露读查询，无 write-back；诊断的展示/去重/生命周期正确委托给 `@prodivix/diagnostics`；Semantic Index 自身只发语义解析诊断。
5. **代码经 slot / CodeReference 接入**：UI 状态不存源码字符串；CodeArtifact/Reference/Slot 所有权与 orphan 处理正确（`codeArtifactLifecycle` 区分 workspace-module/active/orphan）。
6. **持久化始于 WorkspaceOperation**：persist-before-optimistic-apply 顺序正确，失败回滚（`workspaceVfsOutboxExecutor`）。

**两处疑似不变量违例（需后续确认）**：
- `packages/shared/src/llm/*` 把 `LlmGateway`/`LlmToolRegistry`/`LlmContextBuilder`/`InMemoryLlmTraceStore`/`MockLlmProvider` 的**实现**（不止类型）塞进 shared，而 `@prodivix/ai` 反向依赖 shared 获取自身域原语——违反「shared 只放真正跨域工具，勿把域归属搬回此处」。
- `packages/shared/src/types/PdxComponent.ts` 引入 React 类型，把 UI 运行时耦合进每个 shared 消费者（backend/cli/workspace）。

---

## 四、实现进度对照（G0 / G1 / G2）

> 自报状态「G1 Passed / G2 Foundation」经核验**准确，未虚报**。

- **G0（Truth & Change Kernel）—— Passed**：closure doc（`specs/roadmap/g0-closure-evidence.md`，2026-07-13，exit 0，8 阶段 6 gate）与代码/测试/脚本证据一致，无 divergence。
- **G1（语义混合创作）—— Passed**：closure doc（2026-07-15，7 gate）；`verify:g1:*`、golden G1 测试、Semantic Index/Component/Collection/Token/Shader/CodeSlot/External Library 均有对应代码。
- **G2（可执行全栈工作区）—— In Progress，真实代码但未闭环**：
  - **已落地**：Remote 执行底座（`packages/runtime-remote`、`runtime-remote-postgres` 真集成测试、`apps/remote-runner-control-plane`+`apps/remote-runner-worker`、`rootlessPodmanSandbox.ts` 1130 行真实 `podman run`）、Data 运行时（`packages/data` 14 个 runtime 文件 + 41 测试）、AES-256-GCM Environment Secret store、G2 CI（`g2-rootless-sandbox.yml` 为真网络隔离 + egress 白名单 gate）。
  - **决策阻塞（两个 G2 必须项无 ADR）**：**二进制 Asset pipeline** 与 **Auth/session/permission/server-function 运行时契约**（`specs/implementation/g2-executable-full-stack-workspace.md:68-69` 明确「尚无 G2 ADR」，而 `global-phases.md:268-273` 列为出口 gate）。
  - **未闭环**：`specs/roadmap/g2-closure-evidence.md` 不存在（诚实：未提前标 Passed）；第二框架目标（Vue3 候选）未开始；OpenAPI/GraphQL/AsyncAPI 适配器未开始；Remote live / server / edge runtime 未闭环；rootless Podman 的 GitHub Passed 证据尚未提交。
- **动量**：近 5 天（07-13→07-17）从 G0 跨到 G1 再启动 G2；近 4 个月 109 commits，最近 10 个 commit 里 8 个集中在 runtime + data + environment security。

---

## 五、未来方向与首要风险

**最可能的下一步工作（推断）**：
1. （高置信）闭环 Remote live Data runtime + Remote HTTP/material gateway + 完整 Secret canary gate——`global-phases.md` 反复列为「尚未实现」。
2. （高置信）Browser Project Runtime 的 Terminal / 结构化 Console / 网络恢复 UX + 跨 provider Test 矩阵。
3. （中置信）补两个缺失的 G2 ADR（二进制 Asset、Auth/server-function）。

**Top 5 风险**：
1. **G2 出口 gate 跨多个未建 ADR**，存在被拖延或被草率标「Passed」的风险（违反「no evidence = revert to Foundation/Partial」）。
2. **Secret 处理有已知 shape-only 缺口**（ADR 45:72-73）：codec 拦不住自由格式 adapter 配置里的敏感字面量，任何新协议适配器都是潜在外泄路径（进 Workspace/logs/客户端 bundle）。**G2 闭合前最致命的安全缺口。**
3. **后端 workspace 模块约 11755 行 Go**，所有持久化写入风险集中于此（blast radius 最大）；缓解：大量 `_test.go` + golden-conformance gate，但无其他模块可与之相比。
4. **PIR wire rollout 端到端只演练过一次**（1.3→1.4），生产迁移策略（后端协同迁移、atomic first-write upgrade）已设计未实战。
5. **Remote Runner + Postgres 控制面依赖未硬化的外部隔离**（in-repo sandbox 是「参考进程监督者」，生产需外部 rootless 沙箱）+ KMS/密钥轮换未建 + Secret canary gate 未完成。

**本审查补充的两条**：
- `auth`/`project` 关键模块**零测试 + 零限流**是当前最暴露的攻击面。
- `verify:g0` / `verify:g1:standalone` / `verify:g1:browser` 是 CI 死 gate，应接入 workflow。

---

## 六、覆盖与置信度声明

- **深读覆盖**：18 切片，subagent 合计逾千次 tool_use（最深的 blueprint canvas 97 次、CI 94 次、PIR 83 次、nodegraph 82 次）；`packages/workspace` 与 `packages/workspace-sync` 由主审自读 `workspaceOperationCommit.ts`、`workspaceOutbox.ts`、`workspaceHistory.ts`、`workspaceCommand.ts` 四个核心文件。
- **已确认（confirmed）**：上述 Critical 与绝大多数 High（尤其 auth rand 回退、明文 token、github 越权/重试吞错、`data_source_validator` 漏字段、renderer 非空断言、outbox guard 缺失）。
- **疑似（suspected，已标注）**：部分并发/隔离相关项（workspace snapshot mixed-read）、`localeCompare` 影响范围、contract editor durable ID 复用、`stopOwner` 的 fs 竞态。
- **明确未深读（诚实披露）**：`packages/golden-conformance` 的断言脆弱性、ESLint 规则内部、各 Dockerfile 基础镜像 pin（仅审了 workflow 层）、husky hooks（`.husky/` 为空）。
- **复核要求**：本文档为 2026-07-17、提交 `aa9e0699` 的快照。**任何修复动作前，请按当前源码重新定位行号并复核「疑似」项**；本文不构成冻结契约，不替代修复前的逐项确认。
