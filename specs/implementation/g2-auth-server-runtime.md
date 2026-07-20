# G2 Auth 与 Server Runtime 实施计划

## 状态

- DecisionStatus：Accepted
- 本文定义 implementation contract、停止条件与验证方法，不维护当前 milestone 状态。
- Auth/Server 当前状态唯一来源：[`../roadmap/g2-auth-server-runtime-milestones.md`](../roadmap/g2-auth-server-runtime-milestones.md)。
- G2 全局状态唯一来源：[`../roadmap/current-status.md`](../roadmap/current-status.md)。
- Global Phase：G2 Executable Full-stack Workspace
- 日期：2026-07-19
- Owner：`@prodivix/server-runtime`、Compiler、Remote composition、Backend、Remote Worker
- 关联：
  - `specs/decisions/46.auth-and-server-runtime.md`
  - `specs/implementation/g2-executable-full-stack-workspace.md`
  - `specs/diagnostics/server-runtime-diagnostic-codes.md`

## 目标

让同一个 canonical route CodeReference 在 Preview/Test/Export 中使用稳定 Auth/permission/Server Function
语义；Remote current-principal/owner-guard 与 deterministic Auth Test/action 两条纵切共同证明 identity、
authorization、schema、client/server partition、fixture isolation、取消和 mutation replay，而不在 Backend API
进程执行任意项目源码。

## Canonical 与运行态边界

| 内容                                          | Owner / 持久性                                              |
| --------------------------------------------- | ----------------------------------------------------------- |
| code source、`prodivix.serverRuntime` profile | Canonical Workspace code document，durable                  |
| route loader/action/guard binding             | RouteManifest CodeReference，durable                        |
| Auth provider 与 permission catalog           | `/config/auth.json` project-config，reference-only、durable |
| product principal/session                     | Auth service；session server-only                           |
| permission decision                           | invocation-local，可审计但不写 Workspace                    |
| invocation/outcome/redirect/error             | execution/session-local，可丢弃                             |
| iframe bridge                                 | bounded value-only transport，不含 authority material       |
| generated isolated server bundle              | derived artifact，可重建，不是作者态真相                    |
| Server Function environment policy            | canonical profile 只保存 field -> SecretRef identity        |
| environment snapshot/grant/Secret material    | Backend Environment store；execution-local、短期、可审计    |

## 实施阶段

### A0：Decision 与 owner hard cut

状态：Implemented。

- Accepted ADR 冻结 metadata、Auth、permission、invocation、outcome、target 与安全边界。
- Server Function 复用 code document/CodeReference/route CodeSlot，不新增私有保存态。

### A1：Transport-neutral contract/kernel

状态：Implemented。

- `@prodivix/server-runtime` 提供 strict profile、bridge codec、adapter registry。
- authorization 与 input schema 在 effect 前；output schema 与 outcome compatibility 在 effect 后。
- adapter 只看到 value input、workspace/function/invocation identity 与 principal，不看到 session/token。

### A2：Backend Auth first vertical

状态：Implemented。

- execution grant 无条件绑定创建 session。
- exact snapshot partition读取 `code` content revision。
- strict profile 与 JSON Schema 2020-12 validation；schema/code document 具有 bytes/depth/nodes 预算且不解析外部 ref。
- read 只允许 `core.auth.current-principal` 和 `core.auth.require-workspace-owner`；不执行 source。
- live mutation 只允许 `core.server.execution-state.put`，将 typed Route action value 写入 execution-scoped
  durable state；不执行 source、不访问网络/Secret、不写 Canonical Workspace。
- authenticated/no-store endpoint 与稳定 `SVR-*` error envelope。

### A3：Remote Preview bridge

状态：Implemented。

- generated iframe 发送 value-only function reference/input，并以 1 MiB/64-depth/65536-node 预算 fail closed。
- Web 校验 exact active frame 与 opaque capability origin，token 只用于 Web -> Backend。
- run coordinator 以 generation/job fencing 拒绝旧 Preview response。
- completion 只通过 `server.function` / `prodivix.server-function-invocation-trace.v1` 投影 metadata-only
  observation，并要求 exact active generation、Session 与 Job；terminal finite Preview 不被重新打开。

### A4：Compiler/Route first vertical

状态：Implemented。

- static-client 与 execution-parent-gateway target manifest。
- route profile export/kind/adapter/auth compatibility preflight；整个 profiled Code document 从客户端文件图隔离。
- server module 不进入 App import graph；Remote Preview snapshot 要求 `server-function` capability。
- guard -> loader -> render；deny/redirect/error fail closed。
- Browser Preview/ZIP 未配置安全 target 时 compile blocked。

### A5：Deterministic Auth Test 与 route action

状态：Implemented。

- `@prodivix/server-runtime` 提供 strict execution-only principal/permission/function fixture 与 isolated session；
  未命中 fixture不 fallback live。
- Executable Project Snapshot v6 保留 provision digest/Remote strict codec，只在 Test filesystem 投影
  `deterministic-test`；Preview/Build 投影 `disabled` 且不含 fixture value。
- Compiler `deterministic-test` target 在 effect 前验证 exact fixture、principal、permission 与 mutation
  invocation-key policy；Workspace Test为当前内置 Auth adapter生成默认 fixture，任意 action 需要显式 fixture。
- generated React/Vite runtime 提供 typed Route action input、redirect/error、AbortSignal/navigation cancel、
  invocation-key replay/conflict fence与 value outcome 后 loader revalidation。
- iframe cancel 经 exact frame/origin decoder、active run coordinator、AbortController 与 HTTP signal 终止请求。
- 当时 Remote live mutation 保持关闭；后续 A6.5 已只为 execution-state 安全 adapter 开放该边界。

### A6：Isolated full-stack server target

状态：Authenticated + `workspace.owner` permission read/guard + bounded import graph Implemented；更新后的 GitHub rootless Gate 与证据上传已通过；Secret 由 A9 实现，项目源码 mutation 由 A13 扩展。

- Snapshot v6 新增 digest-bound `production` entrypoint 与 strict `serverFunctionPlan`；Remote codec、
  Control Plane 与独立 `prodivix.remote.server-function` provider使用同一 neutral contract。
- Compiler `isolated-server-function` target 将一个 canonical TypeScript/JavaScript named export 及其 relative static
  ESM dependencies 转译为确定性 Node ESM graph；最多 128 modules、64 depth、4 MiB UTF-8 source。exact/
  extensionless/`.js -> .ts` resolution 必须唯一，cycle 可保留；external/dynamic/CommonJS/import-type/triple-slash、
  missing/ambiguous/escape 与非 TS/JS target 在 snapshot 创建前 fail closed。当前 policy 接受
  `public|authenticated|permission(workspace.owner|workspace.read) + read + server + prodivix.code-export`；A15
  允许 `workspace.read` 复用 A9 的 reference-only one-shot Secret channel，但仍必须命中 exact read authority。A13 另只开放 exact
  Secret-free `workspace.write + mutation + invocation-key + server + prodivix.code-export`；其他 permission、edge 或 adapter 仍 blocked。
- Backend 从 exact Workspace owner 或 canonical viewer/editor role解析后，于 authenticated create 的受信 transport header 中投影短期
  `providerId + principalId + sorted allowed permissions + Workspace + snapshot + expiry` attestation；permission list
  严格去重、最多 32 项；owner只签发有界 `workspace.owner/read/write`，viewer只签发 `workspace.read`，editor只签发
  `workspace.read/write`。TTL 默认 2 分钟、最大 5 分钟且不晚于
  product session。它不进入 public Remote envelope、ExecutionRequest、snapshot 或源码。Control Plane 将 authority
  与 execution 同事务写入独立 PostgreSQL row，SHA-256 idempotency identity 绑定 principal/target；Worker claim
  再绑定 execution/worker/attempt，终态删除 authority。session id、Bearer、cookie、service token 与 Secret 不在该 shape。
- Worker 在 rootless Podman networkless runtime 中投影 exact value-only invocation；可信 Server Runtime/Worker
  会再次强制 read-only policy，或 A13 exact workspace.write source-mutation policy。protected function 必须获得未过期且 exact
  execution/worker-attempt/Workspace/snapshot 匹配的 authority；permission function 还必须命中 exact
  profile 所声明的 exact grant；owner grant 不替代 `workspace.read` grant。Worker 只向 sandbox 写入最小 `AuthPrincipal + allowed permissions` 文件，generated runner
  在调用项目代码前严格校验并删除，public function 不接收该 projection。随后按原始 snapshot
  profile/output schema校验结果，再发布唯一 canonical result artifact。request/result/authority runtime path
  不进入 filesystem diff，预算、取消、lease fencing、Secret canary 与 orphan cleanup 复用现有边界。
- Worker canonical result 聚合 root/import module 的 bounded CodeArtifact SourceTrace；GitHub rootless Gate 的 production
  探针已真实执行 transitive helper module，并通过 runtime network hard cut、result contract、source trace、cleanup 与
  evidence upload。
- Worker 只在 canonical result 二次校验和 artifact upload 成功后发布 strict metadata-only `server.function` durable
  trace；Remote provider 以 request/span/function identity、artifact status/error、唯一 root CodeArtifact 与 exact
  artifact/trace SourceTrace correlation 双重校验，缺失、乱序、重复或漂移时不能接受 production success。
- Backend API 与 Control Plane 继续不加载或执行项目源码；A9 只让 isolated Worker 在 exact claim/lease
  下取得直接密封给临时 Worker key 的 one-shot Secret material。isolated code-export project-source mutation
  由 A13 在无 Secret/网络的独立边界开放；A15 只组合 exact `workspace.read` authority 与 A9 Secret channel，
  其他 permission 与完整 Remote Preview gateway parity仍保持关闭。

### A6.5：Remote live mutation 安全 Gate

状态：Implemented。

- Compiler 的 execution-parent-gateway target 只放行
  `core.server.execution-state.put + route-action + server + mutation + authenticated + invocation-key`；其他
  mutation adapter、public/permission 组合、缺 replay policy 与 Browser/ZIP target 在 effect 前 fail closed。
- Web parent HTTP client 固定发送 `X-Prodivix-Server-Function-Intent: mutation-v1`，Bearer 仍不进入 iframe；
  Backend mutation 要求 exact `BACKEND_ALLOWED_ORIGINS` Origin。missing/cross-origin/wrong-intent 与同 invocation
  跨 allowed-origin replay 均拒绝，CORS preflight 只开放显式 intent header。
- Backend 在 exact execution principal/session/permission/snapshot/code revision 与 input schema 后执行审计过的 state adapter。
  adapter 只接收 generated `prodivix.route-action-input.v1` 的 JSON `{ key, value }`，不接收 session、token、
  cookie、Origin、源码或 Secret；credential canary 命中时不调用 effect，响应只保留固定安全 code。
- PostgreSQL migration v6 以 execution/function/state-key 隔离最多 256 个 state entry，并以
  execution/function/invocation 隔离最多 256 个 replay。snapshot/code revision、origin、adapter、function 与
  canonical input 共同形成 SHA-256 identity；state revision 与 replay result 在同一 transaction 中提交。
  exact duplicate 返回首次结果，identity drift、取消、容量耗尽和 execution authority 删除均 fail closed。
- 本机 PostgreSQL/CI Gate 重复验证 24-way concurrent exact replay 只有一次 effect、revision 1 与一条 ledger，
  并覆盖第二 mutation revision、identity drift、取消、双容量预算和 authority cascade。

### A7：产品闭环与 G2 Golden

状态：Golden target contract matrix + Route/Auth Configuration Authoring/Issues + Vue authenticated Catalog product
vertical + Remote Preview/Browser Test/Remote Test/isolated production Invocation Devtools Implemented；完整产品闭环继续建设。

- Workspace 从 canonical Code document profile 确定性投影 loader/action/guard 候选、Route binding 与 exact
  profile/export/definition/slot issue；projection 不拥有源码或 binding。现有候选的 bind/unbind 复用
  `set-runtime-ref` 可逆 Route intent，不建立第二套 registry/config 保存态。
- Blueprint Inspector Code 页已为 active canonical Route 提供 Guard/Loader/Action 选择、跳转 CodeArtifact，以及
  Remote audited adapter / isolated code-export 两种 `workspace.owner` guard preset。preset 在单个 Workspace
  Transaction 中同时创建 canonical TypeScript CodeArtifact 和 Route guard binding；只读 Workspace 与 mounted
  Route module 继续 fail closed。
- Web Issues 复用同一 Workspace projection 发布 `WKS-EXPORT-SERVER-PROFILE-INVALID`、
  `WKS-EXPORT-SERVER-EXPORT-REQUIRED`、`WKS-EXPORT-SERVER-DEFINITION-MISSING` 与
  `WKS-EXPORT-SERVER-SLOT-MISMATCH`；诊断 metadata 只含 path/route/slot/artifact/export identity，不含源码、
  authority 或调用 value。
- `@prodivix/server-runtime` 已提供 `/config/auth.json` 的 exact reference-only contract；只允许 version、provider id
  与 sorted unique 32-item permission catalog，credential-shaped/unknown field fail closed。Workspace read/create/update
  只经可逆 Operation，Resources 已提供产品会话启用、`workspace.owner` declaration 与 Route binding 状态视图。
- 受保护 binding 在作者投影、Issues、React/Vite Remote target 与 isolated production target 同时要求 valid config、
  exact supported provider 和 declared permission。Golden fixture 固定 config wire persist/reload，并覆盖 missing/
  undeclared fail-close。声明不替代 runtime permission decision，Test principal 继续是 execution-only。
- Remote Preview completion、Browser/Remote Test 与 isolated production Worker 现在以同一 strict metadata-only contract
  关联 exact active Session/Job 或 durable execution；Test trace 只在 canonical `test.report` 后发布且私有 JSONL artifact
  不进入 durable/public artifact list，isolated trace 只在 canonical artifact upload 后发布，Remote provider强制
  report/artifact/trace correlation。Execution Center 的独立 Server 表面显示 function/export、attempt、result kind/
  安全错误码与 duration；仅对唯一 root CodeArtifact 显示源码按钮，并在打开共享 Code Authoring overlay 前重算
  exact Workspace snapshot。input/output、principal/session/cookie/token/Secret/source 不进入 detail；stale snapshot/
  generation、missing/stale Session Job、ambiguous source、conflict 与未知字段 fail closed，terminal Job 保持 terminal。
- 第三方 Auth provider、组织级 permission policy 编辑与未来 producer-specific debugger extension属于 post-G2。
- loader result 与 Data/PIR runtime composition 已由 authenticated Vue Catalog deterministic/Remote journey关闭。
- Living Golden Auth/Server fixture 在同一 server-owned code document 中保存两个具有相同
  `route-guard + permission(workspace.owner) + read + server + input/outcome` contract 的 canonical export：
  审计内置 `core.auth.require-workspace-owner` 与 isolated `prodivix.code-export`。矩阵显式验证
  Browser/static 两者均 blocked、deterministic Test 两者均 supported、Remote live 只允许审计内置 adapter、
  isolated production 只允许 code-export；不把 target-specific adapter 差异伪装成全目标通用执行。
- deterministic Test 对两个 export 执行 exact fixture/permission session；isolated production 实际 materialize
  production filesystem、执行 transitive helper import、消费 `0600` one-shot authority，并以原 request/function/schema
  二次校验响应。Remote live 验证 source-free React/Vite gateway projection，真实 Backend effect 继续由现有
  Auth/Server Backend Gate 覆盖。
- matrix 同时固定 invocation correlation、root/helper CodeArtifact SourceTrace、client snapshot source isolation、
  snapshot/result credential canary 与 strict invocation/authority extra-field rejection，并进入普通 execution matrix
  和 GitHub rootless workflow。
- Golden Gate 另从两种产品 preset 出发，验证原子 create+bind、Workspace wire persist/reload、无 authoring issue、
  Remote source-free gateway compile 与 isolated TypeScript transpile/production plan，避免手写 fixture 掩盖作者链路漂移。
- ADR 54 的 Vue current-contract target 复用同一 Auth config、Route guard/loader/action 与 deterministic
  `workspace.owner` fixture；独立 Catalog 工程通过 install/vue-tsc/Vitest/build/Chrome，并验证 loader value、CRUD 与
  exact PNG。Remote 单元格已通过 source-free snapshot/capability/codec、真实 Chrome strict parent bridge与
  authenticated PostgreSQL Data/Server effect/replay/non-owner denial Gate。
- token/session/cookie/Secret/source leak canary 覆盖 request、snapshot、log、trace、artifact、crash。

### A8：Remote live audited Secret HMAC first vertical

状态：Implemented；A9 已另行关闭 isolated Worker Secret resolution，A11/A14关闭本地 key rotation/managed-KMS adapter，
当前 G2 output/client surface canary matrix已通过；任意新 adapter Secret surface属于 post-G2，必须重新进入该矩阵。

- `@prodivix/server-runtime` profile 新增 exact reference-only `environment.secretsByField`，最多 32 个 field，
  每项只能是 `SecretRef { bindingId }`。authorization/schema kernel 只向 adapter 提供声明 field 的
  callback-bound `useSecret`，拒绝 missing/extra lease、undeclared field 与 material-bearing output，并在所有终态 revoke lease。
- Remote execution-parent Compiler 只放行
  `core.server.hmac-sha256 + route-action + server + read + authenticated + exactly key SecretRef`；已有 Auth/mutation
  adapter 携带 environment privilege 会 blocked。ready snapshot 的 Preview capability 同时要求
  `server-function` 与 `environment-binding`。Browser/static、deterministic Test 与 isolated production 分别以
  gateway/environment/isolated-policy blocking code fail closed，Test fixture 不能模拟或降级 live Secret。
- Backend 从 exact execution principal/session/permission/snapshot/code revision 与 live environment authority 解析 profile；HMAC input
  必须是 strict typed Route action + JSON submission。Environment store grant 固定
  `prodivix.remote.server-function-gateway/sandboxed/trusted-service/server/process`，并绑定
  workspace、principal/session、environment revision、execution/artifact/export/invocation、binding 与 `key` field；
  TTL 最多 30 秒且受 product session expiry 截断。
- Secret 只以 bytes 进入 `UseSecret` callback，长度预算为 32-4096 bytes；callback 内对 canonical JSON value 计算
  HMAC-SHA256，只返回 algorithm 与 64 位 hex digest。grant 在 callback 后立即 revoke；material/source/session/grant/
  binding identity 均不进入 bridge response。Backend fake-store contract 覆盖 exact IssueGrant/UseSecret/Revoke 与 HTTP
  composition，真实 PostgreSQL grant/audit/at-rest 语义复用已建立的 Environment integration Gate。
- Living Golden matrix 新增 `audited-secret-hmac` 列：Browser/static blocked、deterministic Test blocked、Remote live
  supported、isolated production blocked；Remote cell 必须同时携带 `environment-binding` 与 `server-function`，并继续
  通过 client snapshot source isolation 与 credential/Secret canary。
- `audited-secret-hmac` 仍不能降级为 isolated code export；A9 使用独立 `isolated-secret-code-export` target cell，
  不复用 HMAC adapter 或扩大 Remote live adapter allowlist。

### A9：Isolated Worker sealed Secret resolution first vertical

状态：Implemented；A10 已另行关闭 bounded cross-worker-attempt recovery，A11 已关闭 static KMS/key rotation，A12/A15已关闭
Secret-free/Secret-bearing `workspace.read`，A13 已实现独立 source mutation，A16/A17已实现 viewer/editor exact authority；
更高 organization permission/role与新 adapter surface属于 post-G2。

- isolated Compiler 对 `prodivix.code-export + read + server + public|authenticated|workspace.owner|workspace.read`
  放行 reference-only environment policy，并在 production snapshot 显式要求 `environment-binding`；`workspace.read`
  由 A15 额外要求 exact authority，mutation、edge、其他 adapter 与未知 permission 仍在 snapshot 前 blocked。
- Worker 为每次 resolution 生成临时 X25519 recipient key；Control Plane 的 worker-token endpoint 先验证 exact
  execution/worker/lease/attempt、snapshot digest、production plan 与 environment capability，再只向 Backend broker
  转发公钥和不可变 function/invocation identity。resolution 只允许初始 `starting` 或 exact active lease reclaim 的
  `running` phase，Worker 请求固定 15 秒超时，
  Backend 与 Control Plane 两段 ciphertext response 都强制 JSON + `no-store` + `nosniff`，并在读取时执行 768 KiB
  streaming hard cut；网络、状态、解封或 identity 失败统一成为 `secret-resolution-denied`。Control Plane、claim、
  authority、snapshot 与 request 均不承载 material。
- Backend internal broker 使用独立 service token，重新读取 exact execution authority、code content revision 与 canonical
  profile，要求 live environment/session/workspace/snapshot/binding 全匹配后签发
  `remote-isolated/isolated-runner/server/process` 30 秒 grant。Secret 只在 `UseSecret` callback 中进入内存，随后直接以
  X25519 + HKDF-SHA256 + AES-256-GCM 密封给 Worker，grant 立即 revoke。
- PostgreSQL migration 7 以 execution 为主键保存 current worker attempt、function、invocation、recipient key 与 ciphertext-only
  envelope；exact retry 返回同一 envelope，pending、同 attempt key drift 与 function/invocation drift fail closed。明文、environment grant 与
  service credential 不进入该 replay row。
- Worker 将解封后的 exact sorted field map加入当前执行 output guard，只向 rootless sandbox 写 mode-0600 one-shot
  material 文件。install-phase payload 不含 invocation/authority/Secret；install 结束后先清除残留进程、完成 runtime
  network-none 验证、删除并 mode-0700 重建 reserved `.prodivix` transport directory、固定四个 canonical path，再通过每次执行随机 nonce 绑定的第二 control message 投影 runtime material，防止 install output
  伪造 phase marker。generated runner 在 import/effect 前严格校验并删除，只通过 callback-bound `useSecret` 暴露声明
  字段，对返回值递归执行 material leak scan；runtime 结束后再次清除残留进程才允许 filesystem capture。Worker 在所有
  终态清空 field projection，Worker/Control Plane 双输出 Gate继续覆盖 log/trace/artifact/report/crash。
- Living Golden matrix 新增 `isolated-secret-code-export`：Browser/static、deterministic Test、Remote live blocked，isolated
  production supported并真实执行/消费 material；GitHub rootless probe 同时验证 owner authority、Secret use、transport
  file exclusion、runtime network hard cut、canonical result 与 source trace。

### A10：Worker-attempt Secret recovery first vertical

状态：Implemented；仅覆盖同一 immutable read-only isolated invocation 的 lease-expiry recovery，KMS/key rotation、mutation replay、跨 replica artifact/quota recovery 与任意 identity drift 继续关闭。

- Execution repository 继续只在旧 lease 过期后 reclaim `starting|running|cancelling` Job，并原子递增 attempt；Worker 对
  reclaimed `running` Job 不再重复提交非法 `running -> running` transition。reclaimed `cancelling` 在读取 snapshot、
  resolution 或启动 sandbox 前直接完成 cancellation。
- Backend resolution row 保持每个 execution 唯一一行。更高 attempt 只有在 artifact/export/invocation identity 完全不变时
  才能通过 PostgreSQL conditional upsert 原子替换 worker/recipient，清空旧 envelope并成为新的 pending current attempt；
  同 attempt key drift、低 attempt、跨 function/invocation drift全部冲突。
- rotation 之后，旧 attempt 的延迟 `Complete`、exact replay 与 abandon 都无法修改 current row；新 attempt 重新读取 exact
  environment revision、签发独立短期 grant、使用新 X25519 recipient 生成新 envelope。旧 ciphertext 不能被新 Worker
  解封，数据库也不保留 superseded envelope history。
- Control Plane 只对 exact active worker/lease、positive attempt、未过期 `starting|running` 状态开放 broker；HTTP response
  仍执行完整 identity校验。Worker Gate 真实覆盖 attempt 2 在 `running` 状态重新解析 Secret、执行、上传 canonical result
  并终态成功，且没有第二次 running transition。

### A11：Backend Environment Secret KMS envelope 与 key rotation first vertical

状态：Implemented；关闭 Backend at-rest versioned key ring、per-record envelope encryption、bounded concurrent
rotation 与 legacy migration first vertical。A14 已另行配置 AWS managed KMS adapter；当前 G2 surface matrix已关闭。
其他 permission和更宽项目源码 mutation不复用 KMS/Secret通道，A13只在无 Secret的独立 isolated policy下开放。

- 每条新 Secret 生成独立 256-bit data key；material 使用 `AES-256-GCM` 和 exact
  workspace/environment/revision/binding AAD 加密，data key 再由 active versioned KMS key authenticated wrap。
  PostgreSQL migration 8 只保存 algorithm/provider/key id、wrapped data key、nonce 和 ciphertext；KMS key id 不进入
  Workspace、request、snapshot、Control Plane、Worker sealed envelope、trace 或 artifact。
- static key-ring KMS adapter 最多接受 16 个 canonical key id，active id 必须精确存在；旧单 key 只作为
  `legacy-v1` 兼容入口。新写入固定 active key。旧 key 在 row 未完成 rewrap 前移除时，runtime resolution 与整批
  rotation 都 fail closed，不会尝试错误 key 或明文降级。
- rotation maintenance 以 1-256 bounded batch 和 `FOR UPDATE SKIP LOCKED` 原子领取 row。正常轮换只
  unwrap/rewrap data key，保持 Secret nonce/ciphertext byte-exact；历史 direct-cipher row 才在一次性 migration 中
  短暂解密并立即清零。任一 unwrap/update/audit 失败回滚整批。
- durable rotation audit 仅记录 active provider/key id 与 rewrapped/migrated/remaining aggregate count，不记录
  Workspace/environment/binding identity、wrapped key、ciphertext 或 material。最后一批 `remaining=0` 后才允许 operator
  删除旧 key。
- 真实 PostgreSQL Gate 使用四个并发 rotator 对八条旧 key row 验证 `SKIP LOCKED` exact-once claim、ciphertext
  byte stability、aggregate audit、active-key-only resolution 与 retired-key denial；同一 Gate 已接入
  `G2 PostgreSQL Gates` 并取得 GitHub 远端通过证据，unit contract 同时进入 Auth/Server 与 rootless aggregate。

### A12：Secret-free `workspace.read` isolated permission first vertical

状态：Implemented；关闭第二个明确 permission 的 contract、作者态、authority、Worker 与 Golden/rootless Gate。
`workspace.write` 项目源码 mutation 由 A13 以独立 Gate 承接；read + Secret 由 A15、collaborator viewer role resolution
由 A16 承接；editor/write collaborator role与分享产品面由 A17 承接，更高 permission继续关闭。

- `@prodivix/server-runtime` 统一拥有 isolated definition policy：`workspace.owner` 与 `workspace.read` 均只允许
  `read + server + prodivix.code-export`，但后者额外要求无 environment。Compiler 与 Worker 复用同一 predicate，
  避免 compile/runtime allowlist 分叉。
- A12 首次证据由 verified Workspace owner 的 sorted authority建立；A16 进一步允许 canonical viewer创建仅含
  `['workspace.read']` 的短期 authority。Control Plane/Worker 保持 exact execution、snapshot、attempt、
  expiry fence。runner 必须命中 profile 要求的 `workspace.read`，单独 owner grant不能降级通过。
- `/config/auth.json`、Resources Auth & Server Runtime 与 Blueprint Inspector 新增 reference-only
  `workspace.read` 声明和原子 isolated read-guard preset；CodeArtifact + Route binding 仍以单个可逆 Workspace
  Transaction进入 History/Outbox，不持久化 principal、decision 或 credential。
- Living Golden matrix 新增 Browser/static blocked、deterministic Test supported、Remote live blocked、isolated
  production supported 的显式单元格，并实际执行 owner/read 两条 one-shot authority path。GitHub rootless Gate 新增
  独立 networkless、Secret-free read probe，校验 authority 消费、trusted result、root/helper SourceTrace、transport-file
  exclusion 与 cleanup；真实远端 Gate 与 evidence upload 已通过。

### A13：`workspace.write` isolated project-source mutation first vertical

状态：Implemented；canonical contract、作者态、Compiler、Worker、Golden、本地 aggregate 与 GitHub rootless
real probe/evidence 已通过。

- 唯一开放 profile 是
  `workspace.write + mutation + invocation-key + server + prodivix.code-export`。它必须无 Secret、无 runtime network，
  Browser/static、deterministic Test 与 Remote live 全部以显式 target diagnostic fail closed；其他 mutation、permission、
  adapter、zone 与 idempotency policy 不得复用该例外。
- Compiler 只把 bounded canonical import graph 中的 TS/JS CodeArtifact 复制到
  `src/.prodivix-project-source/` staging 区，并以 exact whole-file CodeArtifact SourceTrace 标记。generated context 只暴露
  `replaceProjectSource({ artifactId, source })`；一次 invocation 必须且只能调用一次，只能命中 staging target，UTF-8
  replacement 最多 1 MiB且不得包含 NUL。项目代码不能看到 canonical Workspace writer。
- sandbox 只改 execution-local staging 文件。Worker 在任何 artifact upload、trace 或 success transition 前，必须把成功
  Server Function response 与唯一 complete filesystem diff 相关联：只接受一个 `modified` change、exact snapshot/workspace/
  partition revisions、exact baseline、非空 whole-file trace和 import-graph target；missing/extra/add/delete/unchanged/binary/
  invalid UTF-8/NUL/partial trace/descriptor drift 均固定失败为 `invalid-project-source-mutation`。
- Backend 对 write profile 只允许 Workspace owner或 A17 editor permission set投影排序后的 `workspace.write`；A16 viewer set不含 write，
  editor set也不含 owner/Environment/Secret。
  profile 所需 exact write grant 在 Worker/runner effect
  前再次校验；owner grant 本身不替代 write grant。Control Plane、Backend API 与 Worker host 都不直接写 Canonical Workspace。
- `@prodivix/workspace` preset 在一个可逆 Transaction 中创建一个 mutation action、一个初始目标 CodeArtifact并绑定 Route
  action；action 以 static relative import 将目标纳入 graph并硬编码唯一 artifact id。Resources 只声明 reference-only
  `workspace.write` permission，Blueprint 提供显式 preset，不接收 credential。
- Living Golden 新增 source-mutation 列：Browser/static、Test、Remote live blocked，isolated production supported。真实 runner
  产生一个 staging diff；Workspace 在选择前保持 byte-exact，Execution Center 既有 Runtime Files planner 只对用户显式选择
  的 change 建立单个 revision/content/meta/baseline-fenced Transaction，并验证并发 content revision 漂移时拒绝采纳。
- rootless contract Gate 已验证 exact plan/authority/staging SourceTrace；GitHub Actions 真实 Podman probe 已验证
  network-none runtime、Secret absent、唯一 whole-file modified diff、transport exclusion、trusted result 与 cleanup。

### A14：AWS managed-cloud KMS adapter first vertical

状态：Configured / Evidence pending；official SDK adapter、配置、static-to-cloud migration、unit/PostgreSQL Gate 与
GitHub OIDC live workflow 已实现，真实 AWS KMS run 尚未取得。

- active provider已hard-cut为`aws.kms/v2`。配置只接受`aws-kms`、exact region、1-16个canonical local key label -> immutable
  AWS KMS key ARN 和一个 exact active label；alias、region drift、unknown active、generic HTTP provider、超过 30 秒 timeout、
  static active identity 与 AWS active identity 混用均启动失败。AWS credential 只来自官方 SDK default chain，不进入
  Prodivix config、Workspace、数据库、日志或 runtime transport。
- 每条 data key 通过官方 `Encrypt/Decrypt` 与 `SYMMETRIC_DEFAULT` 处理。AWS request 的 encryption context 只包含固定
  purpose 和 canonical AAD 的 SHA-256，不发送 raw Workspace/environment/revision/binding identity；response 必须返回 exact
  configured key ARN、algorithm、32-byte plaintext且不得返回 recipient ciphertext。cloud error、timeout、identity/size drift
  与 wrong context 均 fail closed。
- `wrapped_key`保存AWS KMS ciphertext；`wrapped_key_nonce`对AWS provider保存32-byte local correlation digest，绑定
  provider-local label、ciphertext、AAD与stable key identity。single-Region key固定exact ARN；MRK固定
  partition/account/`mrk-*` resource id，同时Encrypt/Decrypt response仍必须返回当前Region exact local ARN。related replica可
  解密primary envelope，unrelated MRK、account/partition drift和single-Region cross-Region均在远端调用/plaintext释放前fail closed。
  该digest不是key material，也不替代KMS authentication。
- static-to-cloud migration 只允许 AWS provider 作为 active writer。旧 static ring 通过 persisted provider identity 注册为
  decrypt-only source；bounded `SKIP LOCKED` transaction 只 unwrap/rewrap data key，保持 Secret nonce/ciphertext byte-exact，
  写入 aggregate-only active provider/key/count audit。source provider 缺失时整批回滚；`remaining=0` 后才可移除旧 key。
- 本地 adapter matrix 覆盖 exact request/context、raw identity absence、tamper、wrong AAD、unknown/retired key、response drift、
  timeout、AWS-to-AWS rotation和 static-to-AWS migration。真实 PostgreSQL Gate 验证 provider migration、32-byte correlation
  metadata、ciphertext stability、aggregate audit 与 post-migration resolution。
- `.github/workflows/g2-managed-kms.yml`仅允许`workflow_dispatch`，使用受保护environment + GitHub OIDC短期role，
  对两个distinct exact key ARN执行真实Encrypt/Decrypt/rewrap/retirement fence，并以related MRK primary/replica分别运行
  Environment与Terminal跨区decrypt Gate。`deploy/aws/g2-managed-kms`提供不自动部署的primary/replica key与exact-sub OIDC role
  CloudFormation参考；未取得首次run前不得标记Implemented，GCP/Azure/HSM等其他provider继续关闭。

### A15：isolated `workspace.read` + Secret permission composition first vertical

状态：Implemented；shared policy、Backend broker、Compiler/runner、Worker、reference-only authoring、Living Golden、
本地 Gate 与 GitHub rootless real probe/evidence 已通过。

- 唯一新增组合是
  `permission(workspace.read) + read + server + prodivix.code-export + reference-only environment.secretsByField`。
  它不新增 adapter、zone、effect 或 Secret transport；`workspace.write` + Secret、mutation + Secret、任意其他 permission
  与 Browser/static/Test/Remote live code-export 继续 fail closed。
- Compiler 与 Worker 复用 `@prodivix/server-runtime` 的同一 isolated predicate。Worker 必须先以 exact execution/snapshot/
  worker-attempt authority命中 profile 声明的 `workspace.read`，之后才允许调用 A9 broker；`workspace.owner` 单独存在、
  Secret envelope 可解析或 Environment grant可签发，都不能替代 read grant。generated runner分别消费并删除 mode-0600
  authority 与 Secret material，二者缺一均在项目 effect 前失败。
- Backend isolated Secret broker 的 allowlist 只从 `public|authenticated|workspace.owner` 扩到 exact `workspace.read`，仍重新读取
  exact code revision/profile/environment snapshot并签发 callback-bound `remote-isolated/isolated-runner` grant。material继续只密封给
  ephemeral Worker recipient；Control Plane、authority、snapshot、request、日志、trace、artifact与 result不承载明文。
- `@prodivix/workspace` 新增 Route loader preset：只接受 canonical Secret binding id，生成 reference-only profile，并以一个可逆
  Transaction 原子创建 CodeArtifact + loader binding。Blueprint Inspector 的 binding 输入不会接收或保存 Secret value；Resources
  只声明 `workspace.read` permission catalog。
- Living Golden 新增独立 `isolated-workspace-read-secret-code-export` 列：Browser/static、deterministic Test 与 Remote live blocked，
  isolated production supported并真实消费 authority + Secret。rootless 主 Secret probe 现使用 exact `workspace.read` profile，contract
  额外证明 owner-only authority不能通过；完整 Podman probe继续验证 network-none、transport exclusion、SourceTrace、output canary与 cleanup。
  GitHub Actions 真实 Podman probe 已覆盖同一 authority-before-broker、one-shot material、network-none 与 cleanup 边界。

### A16：Workspace collaborator viewer exact execution authority first vertical

状态：Implemented；canonical role persistence、Backend resolver、durable principal/permission grant、Data/Server/Secret
effect recheck、GitHub PostgreSQL viewer Gate 与 read-only rootless real probe/evidence 已完成。

- Backend migration v9 新增 `workspace_execution_role_grants`，当前只允许 owner-fenced、非 self 的 exact `viewer`。
  Store 提供 grant/revoke persistence boundary，但不把 Auth catalog当授权，也不提前建设 G5 分享 UI。owner 解析为 sorted
  `workspace.owner + workspace.read + workspace.write`，viewer 解析为唯一 `workspace.read`；missing/unknown/corrupt role
  与非 canonical permission set都在 Control Plane 前 fail closed。
- 历史 `remote_execution_grants.owner_id` 被 hard-cut 为 `principal_id`，并新增 exact `permissions_json`；只允许 owner 三项集
  或 viewer 单项 read 集。initiating principal/session/permission/Workspace/snapshot/revisions/environment共同参与 durable
  idempotency fence，permission drift不能复用旧 execution。
- viewer create 不能携带 Environment reference，且该拒绝发生在 Environment verifier 前，因此当前不能进入 live Data、
  Remote HMAC 或 isolated Secret。role revoke 立即拒绝新的 create；已签发 authority不被可变 ACL 原地重写，只在原 session
  内存活且受最多五分钟 expiry硬限。
- Backend consumer 不再只相信 initiating principal：Data query 在 effect 前要求 durable `workspace.read`，mutation 要求
  `workspace.write`；Remote live owner adapter还要同时命中 durable owner grant和当前 Workspace owner；isolated Secret broker
  要求 profile 声明的 exact permission存在。credential、role row 与 permission JSON不进入 public request/snapshot/event/artifact。
- rootless `workspace.read` runner/fixture 从 owner-derived三项 authority收紧为真正的单项 read authority，并在 snapshot contract
  证明该 authority不能执行 `workspace.write` mutation。`.github/workflows/g2-postgres.yml` 的真实 role grant/resolve/create/
  durable permission/revoke Gate 与更新后的 GitHub rootless evidence 均已通过；
  `pnpm run verify:g2:isolated-server-collaborator-read` 是本地汇总入口。

### A17：Workspace collaborator editor 与 sharing surface

状态：Implemented；canonical role/API、isolated execution policy、Project Settings 产品面、本机与 GitHub PostgreSQL、
product/rootless Gate 已完成。

- Backend migration v11 将 role constraint 从唯一 `viewer` 扩展为 exact `viewer|editor`。owner-only
  `GET|PUT|DELETE /workspaces/:workspaceId/execution-roles` 对已存在用户执行 normalized-email grant、bounded list 与
  revoke；4 KiB strict JSON、unknown field、self-grant、non-owner、missing principal/workspace 与未知 role 均在写入前
  fail closed，响应固定 `no-store`。
- editor authority 是唯一 sorted `workspace.read + workspace.write`，不含 `workspace.owner`。它可以创建 A13 的
  Secret-free、networkless、invocation-key-fenced isolated source proposal；Remote owner adapter、Environment reference、
  Secret broker 与 owner guard继续拒绝。viewer/read、editor/read+write、owner/owner+read+write 三种 permission set在
  Backend create、durable grant、Control Plane authority 与 Worker pre-effect policy间保持 exact。
- Project Settings 的 Workspace Collaboration 面板由 owner显式输入用户 email、选择 viewer/editor、grant/update/revoke；
  Web strict decoder拒绝 unknown/malformed response。UI 明确说明两种角色都没有 owner、Environment 或 Secret权限，
  不保存第二份 ACL、不提供未实现的 admin 角色。
- `pnpm run verify:g2:workspace-collaboration` 覆盖 Worker/rootless snapshot、Web API/UI、Backend store/handler/database；
  `TestWorkspaceExecutionCollaboratorRolesPostgreSQLGate` 在本机 PostgreSQL 18真实验证 viewer -> editor upgrade、
  durable permission、Control Plane create、invalid role constraint与 revoke。

## First vertical 调用链

```mermaid
sequenceDiagram
    participant Frame as Remote Preview iframe
    participant Web as Web composition
    participant API as Authenticated Backend
    participant DB as Canonical Workspace DB
    Frame->>Web: value-only functionRef + input
    Web->>Web: exact source/origin/generation fence
    Web->>API: Bearer product session + invocation
    API->>API: execution principal/session/permission authority
    API->>DB: exact code content revision
    DB-->>API: code profile
    API->>API: auth + permission + input schema
    API->>API: audited built-in adapter
    API->>API: output schema
    API-->>Web: value-only outcome
    Web->>Web: strict metadata-only Session observation
    Web-->>Frame: correlated strict response
```

## 验证证据

- `pnpm --filter @prodivix/server-runtime test`
- `pnpm --filter @prodivix/workspace test`
- `pnpm --filter @prodivix/runtime-core test`
- `pnpm --filter @prodivix/runtime-remote test`
- `pnpm --filter @prodivix/prodivix-compiler test`
- `pnpm --filter @prodivix/web test`
- `pnpm --filter @prodivix/remote-runner-control-plane test`
- `pnpm --filter @prodivix/remote-runner-worker test`
- `cd apps/backend && go test ./internal/modules/remoteexecution`
- `cd apps/backend && go test ./internal/modules/environment ./internal/app`
- `pnpm check:core-boundaries`
- 汇总 Gate：`pnpm verify:g2:auth-server-runtime`
- Golden target matrix Gate：`pnpm verify:g2:auth-server-golden`
- live mutation 汇总 Gate：`pnpm verify:g2:auth-server-live-mutation`
- live mutation PostgreSQL Gate：
  `go test ./internal/modules/remoteexecution -run '^TestServerFunctionLiveMutationPostgreSQLGate$' -count=1 -v`
- isolated 汇总 Gate：`pnpm verify:g2:isolated-server-runtime`
- Environment Secret key rotation 汇总 Gate：`pnpm verify:g2:environment-secret-key-rotation`
- Managed KMS local contract：`pnpm verify:g2:environment-secret-managed-kms`
- Managed KMS live AWS Gate：`.github/workflows/g2-managed-kms.yml`
- Environment Secret key rotation PostgreSQL Gate：
  `go test ./internal/modules/environment -run '^TestEnvironmentSecretKeyRotationPostgreSQLGate$' -count=1 -v`
- static-to-managed KMS PostgreSQL Gate：
  `go test ./internal/modules/environment -run '^TestEnvironmentSecretAWSKMSMigrationPostgreSQLGate$' -count=1 -v`
- isolated import graph Gate：`pnpm verify:g2:isolated-server-import-graph`
- isolated authenticated/permission authority Gate：`pnpm verify:g2:isolated-server-auth-authority`
- isolated project-source mutation Gate：`pnpm verify:g2:isolated-server-source-mutation`
- isolated worker-attempt Secret recovery Gate：`pnpm verify:g2:isolated-server-secret-recovery`
- Workspace collaboration Gate：`pnpm verify:g2:workspace-collaboration`
- collaborator roles PostgreSQL Gate：
  `go test ./internal/modules/remoteexecution -run '^TestWorkspaceExecutionCollaboratorRolesPostgreSQLGate$' -count=1 -v`
- recovery PostgreSQL concurrency Gate：
  `go test ./internal/modules/remoteexecution -run '^TestIsolatedSecretResolutionPostgreSQLAttemptRecoveryGate$' -count=1 -v`
- Linux rootless Gate：`pnpm verify:g2:rootless-sandbox`（GitHub Actions）

Contract tests必须证明：unknown field、session mismatch、revision drift、schema mismatch、unsupported adapter、
Browser/static target、cross-origin frame、HTTP Origin/intent 与 stale generation 均在 effect/render 前失败；
mutation exact replay 只执行一次，跨 origin/input drift、取消、容量与 credential echo 均 fail closed；成功响应
不得出现 session id、token、cookie、source 或 Secret canary。Test 还必须证明 fixture missing、permission/principal missing、
mutation replay conflict、取消，以及 Preview/Build disabled projection 均 fail closed。
Secret vertical 还必须证明 profile 只含 reference、undeclared/missing/extra lease fail closed、Backend grant/use/revoke
完全绑定 execution/principal/session/environment/function/invocation/binding/field、material echo 被拒绝，以及
Remote capability propagation和 Browser/Test/isolated target matrix 不发生降级。
Remote Preview invocation observation 还必须证明 exact generation/session/job correlation、post-terminal retention、
stale/cancel/conflict 语义、strict unknown-field rejection，以及 input/output/credential/source canary 不进入 detail；
Browser/Remote Test producer还必须证明 canonical report-before-trace、private trace artifact exclusion、exact capability/
fixture/SourceTrace alignment。Browser Preview未有安全 producer时不得伪造 Server observation。
Isolated target 还必须证明 production plan/digest codec、provider identity、invocation correlation、output schema二次校验、
result artifact唯一性、runtime断网与 container cleanup；authenticated authority 的 missing/expired/target/attempt drift、
session/token extra field，以及不支持的 auth/effect/adapter 和 external/dynamic/unresolved/
ambiguous/budget-exhausted import graph 必须在执行前失败。
Source mutation 还必须证明 Browser/Test/Remote target denial、exact write grant、一次且仅一次 bounded target proposal、
成功 response 与 complete single-modified diff 的 pre-upload correlation，以及 missing/extra/add/delete/unchanged/stale/
baseline drift/binary/NUL/partial trace/descriptor drift 在任何 durable artifact 或 success 前 fail closed。Workspace adoption
必须保持用户显式选择、exact document content/meta revision、baseline 与单个可逆 Transaction；sandbox 不得直接写 VFS。
Managed KMS 还必须证明 exact immutable key ARN/region/active label、official SDK call shape、hashed-only encryption context、
timeout、response key/algorithm/plaintext correlation、local metadata tamper denial、static decrypt-only provider migration、
Secret ciphertext byte stability、aggregate-only audit 和 old-provider retirement fence；真实云证据只能使用短期 OIDC role。

## 风险与停止条件

1. 任一设计要求把产品 credential 传入 iframe、Workspace、snapshot 或生成源码时停止。
2. 任一 custom adapter 需要在 Backend API 进程加载项目 source 时停止，转入 isolated target。
3. 未有 deterministic fixture 时 Workspace Test 不得 fallback live Auth。
4. 除 A6.5 审计过的 execution-state adapter 外，未有 CSRF/idempotency/replay fence 时不得启用 live route action mutation。
5. profile/route kind/target capability不匹配时必须 compile blocked，不允许跳过 guard。
6. isolated production target 需要 product credential 或 runtime network 时停止；principal 只能通过独立短期 authority
   lease 投影，Secret 只能通过 A9 exact lease + ephemeral recipient sealed channel进入 one-shot material 文件。它们都不能进入
   value request、snapshot、源码或通用 Worker authority。A15 `workspace.read` + Secret必须同时命中 exact read grant与
   one-shot material，任一方不得替代另一方。Remote live 仅允许 A8 审计 HMAC，不得复用任一例外扩张 adapter。
7. project-source mutation 要求 Secret、runtime network、add/delete、多文件 diff、partial SourceSpan、未进入 import graph 的
   artifact，或绕过 Runtime Files 显式采纳时停止；不得把 `workspace.write` authority 当成 Canonical Workspace writer。
8. managed KMS 要求长期 cloud credential、自定义任意 HTTP endpoint、mutable alias、raw Workspace identity encryption
   context、明文 data key persistence或跨 provider 无 source decryptor降级时停止；不得以 mock/local Gate冒充真实云证据。

## 验收标准

- [x] 没有第二套 Server 源码/route binding 保存态。
- [x] Auth/session/permission 与 Server Function 公开 contract、错误语义、owner 已稳定。
- [x] Remote authenticated guard/loader first vertical 可重复验证。
- [x] Browser/static/client graph 与 session/token boundary fail closed。
- [x] deterministic Test、typed action mutation/replay/cancel/revalidation 完成。
- [x] public|authenticated|workspace.owner-permission/read 与 workspace.read-permission/read bounded canonical TS/JS graph 的 isolated production vertical 完成；A15 已配置 reference-only Secret 组合。
- [x] Remote execution-state live mutation 的 exact-origin/intent、durable replay 与 canary 安全 Gate 完成。
- [x] static relative import graph 的 deterministic projection、预算、transitive fail-close、本地执行与 SourceTrace Gate 完成。
- [x] isolated authenticated read/guard 的 Backend attestation、Control Plane atomic store、worker-attempt lease、runner
      one-shot principal projection 与本地 PostgreSQL/canary Gate 完成。
- [x] isolated `workspace.owner` permission read/guard 的 sorted bounded grant、idempotency identity、Worker/runner
      pre-effect enforcement 与 rootless probe contract完成。
- [x] Auth/Server Golden target matrix first vertical 覆盖 Browser/static、deterministic Test、Remote live gateway
      projection 与 isolated production 的显式支持/拒绝单元格、真实 Test/production 执行、correlation、SourceTrace
      和 credential/source boundary。
- [x] Route Auth/Server authoring first vertical 完成 canonical candidate/binding/issue projection、可逆 bind/unbind、
      原子 Remote/isolated owner-guard preset、Blueprint Inspector/Code jump、Issues 与 wire reload -> compile Golden Gate。
- [x] Auth provider/permission configuration authoring first vertical 完成 strict reference-only contract、
      `/config/auth.json` 可逆 Workspace authoring、Resources/Issues 产品面、Remote/isolated compile Gate 与 Golden reload。
- [x] Vue current-contract Auth/Server 产品纵切完成 reference-only Auth、protected Route guard/loader/action、
      deterministic authenticated Catalog Chrome Gate、Remote source-free snapshot 与 static protected export fail-close。
- [x] Remote Preview invocation devtools first vertical 完成 metadata-only trace contract、exact Session/Job
      correlation、terminal retention、CodeArtifact SourceTrace、Execution Center Server 表面与 credential canary Gate。
- [x] isolated production invocation devtools second producer 完成 artifact-upload-before-trace、Remote artifact/trace
      双校验、唯一 root CodeArtifact、exact Workspace snapshot SourceTrace navigation 与 missing-trace fail-close Gate。
- [x] Browser/Remote Test invocation producer完成 strict bounded JSONL、canonical report-before-trace、request/provider/
      snapshot capability alignment、exact CodeArtifact SourceTrace、private artifact exclusion与 credential canary Gate。
- [x] Remote live audited Secret HMAC first vertical 完成 reference-only profile/kernel、exact Backend
      IssueGrant/UseSecret/Revoke、HTTP composition、`environment-binding` propagation、Golden target matrix 与 canary Gate。
- [x] isolated Worker sealed Secret resolution first vertical 完成 exact claim/lease broker、X25519 sealed envelope、
      PostgreSQL one-shot replay、remote-isolated grant、Worker/rootless one-shot `useSecret`、Golden target matrix 与 leak Gate。
- [x] 更新后的 transitive import rootless GitHub probe 已取得远端通过证据。
- [x] exact active lease 下的 read-only isolated Secret cross-worker-attempt recovery、旧 ciphertext/attempt revoke 与 PostgreSQL concurrency Gate。
- [x] Backend Environment Secret per-record KMS envelope、versioned key ring、bounded atomic rewrap、legacy migration、
      aggregate-only audit 与真实 PostgreSQL concurrency Gate。
- [x] Secret-free `workspace.read` isolated permission 的 shared policy、owner-derived bounded authority、Resources/
      Blueprint authoring、Golden matrix、真实 rootless Gate 与远端 evidence upload完成。
- [x] `workspace.write` isolated project-source mutation 的 exact policy、single whole-file staging proposal、Worker pre-upload
      correlation、owner-derived authority、Resources/Blueprint preset、Golden 执行与 revision-fenced显式采纳、本地 aggregate
      和 rootless contract/real probe 配置完成。
- [x] AWS managed KMS official adapter、exact key ARN/config、hashed AAD、bounded timeout、static decrypt-only migration、
      PostgreSQL cross-provider Gate 与 OIDC live workflow 配置完成。
- [x] isolated `workspace.read` + Secret 的 shared policy、exact authority-before-broker、Backend allowlist、原子 reference-only
      authoring、Living Golden 与 rootless contract/real probe 配置完成。
- [x] A16 canonical viewer role、owner/read exact resolver、durable principal/permission grant、Data/Server/Secret
      effect recheck、PostgreSQL Gate 与 read-only rootless contract/real probe 配置完成。
- [x] A13/A15/A16 真实 GitHub rootless/PostgreSQL evidence 已取得。
- [x] A17 canonical editor role、sharing API、Secret-free write policy、Project Settings UI、本机 PostgreSQL Gate与
      GitHub PostgreSQL/product/rootless evidence完成。
- [x] Auth/Server current G2 Golden、loader/Data composition、target/security/canary matrix与本地 Product Gate closure完成。
- [ ] A14 新增真实 AWS OIDC/KMS run。

其他 managed KMS/Auth provider、更高 organization permission/role与未来 producer/adapter surface是 post-G2扩展，
不再作为本地 G2 closure的伪阻塞项。
