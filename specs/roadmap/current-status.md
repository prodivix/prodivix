# Prodivix 当前状态

> StatusDate: 2026-07-29
> 本文件是 G0/G1/G2/G3 当前完成状态的唯一来源。`global-phases.md` 定义阶段目标与退出条件；evidence 文档保存可重复验证证据，不重复声明当前状态。

## 全局阶段

| Phase                              | Product Gate | 当前判断                                                                                                                                                                                                                                                                                               |
| ---------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| G0 Truth & Change Kernel           | Passed       | Canonical Workspace、可逆 change、唯一生产写入链、conflict/outbox/local replica 与 Issues closure 已验证。                                                                                                                                                                                             |
| G1 Semantic Hybrid Authoring       | Passed       | PIR-current、Semantic Index、Code/Shader、Component/Collection、controlled round-trip、Asset semantic surface 与 React/Vite Golden 已验证。                                                                                                                                                            |
| G2 Executable Full-stack Workspace | Passed       | current G2 scope 的本地 implementation/product/security closure 与 commit `3f3047b8` 的 non-cloud GitHub evidence 已通过；AWS/真实云 evidence 继续作为外部 pending，不宣称 Passed。                                                                                                                    |
| G3 Behavior & Verification Closure | In Progress  | V0-V2 已有 commit `90fcf961` 的 durable CI evidence；V3 已由 commit `3def9168` 的 CI Gate 验证；V4 Impact/Policy/Plan 已由 commit `a6aa0bf9` 的本地与 CI Gate 验证；V5 Evidence plane 已由 commit `f3d91b9d` 的本地与 CI Gate 验证；V6 本地 root aggregate 已通过、CI evidence pending；V7-V8 未完成。 |
| G4 Verified Agentic Development    | Blocked      | 等待 G3。                                                                                                                                                                                                                                                                                              |
| G5 Collaborative Production Loop   | Blocked      | 等待前置阶段。                                                                                                                                                                                                                                                                                         |
| G6 Trusted Ecosystem               | Blocked      | 等待前置阶段。                                                                                                                                                                                                                                                                                         |

阶段定义与退出条件：[`global-phases.md`](./global-phases.md)。G0/G1 重复验证边界：
[`g0-closure-evidence.md`](./g0-closure-evidence.md)、[`g1-closure-evidence.md`](./g1-closure-evidence.md)。
G2 可重复证据与外部 pending：[`g2-closure-evidence.md`](./g2-closure-evidence.md)。
G3 contract 与阶段状态：[`../implementation/g3-behavior-verification-closure.md`](../implementation/g3-behavior-verification-closure.md)、
[`g3-behavior-verification-milestones.md`](./g3-behavior-verification-milestones.md)；证据模板：
[`g3-closure-evidence.md`](./g3-closure-evidence.md)。

## G3 当前进度

截至 2026-07-29，V0 已建立 `@prodivix/behavior`、`@prodivix/verification`、五种 Workspace document、
`core.behavior` / `core.verification` Command namespace、严格 current/wire codec、Backend schema/migration、
BHV/VER registry/reference 和 package/application boundary Gate。V1 已建立 domain-owned Behavior registry、
revision-bound semantic target、Scenario CRUD/impact/history、Secret-free recorder review/atomic adoption、
deterministic Program/SourceTrace/digest，以及 React/Vue 共用 Program 的 authenticated Catalog browser Golden。
V2 已建立 canonical parallel/barrier lowering、provider-neutral capability runtime 与真实 Preview/Export/CI
surface adapter。NodeGraph 已完成 current/wire v2、deterministic v1 migration、TypeScript/Go/DB hard cut、
strict planner、bounded loop/Auth/subgraph closure、first-party runtime、frame/Behavior correlation 与产品
Runtime Inspector；Animation/Route 已完成 wire v2、stable-instance controls、composition、target/property
conflict、deterministic lifecycle、motion policy、CodeSlot/shader 与 full/reduced required marker parity。
React/Vue standalone projection 共用 NodeGraph/Animation compiler/runtime helper；独立项目 install/typecheck/
test/build/Chromium smoke验证 authenticated Catalog optimistic conflict、目标特定 visual hash、ARIA、
focus 与 operability兼容。
V3 已增加 canonical scheduler、logical clock/scoped random/id、control profile/preflight/digest、
fixture-only network、fresh storage/auth/service-worker isolation、render/motion controls、bounded
ReplayRecord codec/first divergence/fresh replay debugger，以及 Browser/Remote/Export/CI provider
conformance。NodeGraph 产品 Inspector 现通过与普通 Run 互斥的 identity-fenced Debug attempt执行
pause/step/continue/cancel/fresh replay，避免 sidecar重复 effect；16 个 semantic matrix cell 与真实
React/Vue Chromium full/reduced target均完成三次
fresh replay，random/schedule/network drift negative可定位首个分歧。
V4 已建立 before/after Semantic Index ImpactSet 与 domain contributor、unknown/incomplete conservative
expansion、可逆 verification-policy Command、required/advisory/forbidden precedence、matrix/budget/retry/
exemption evaluator，以及 deterministic discovery、DAG/resource dependency、canonical Plan/Closure/
explanation projection。Web Verification resource surface与可执行 CLI 共用 exact JSON projector；Catalog
PIR、Data、Route guard、NodeGraph、Animation、shared CodeSlot 六个隔离域 Golden 与组合 Golden
固定 Plan digest
`sha256-99a7139cd204c124c94b5ff36b74d7a62d0596feb70ff34177bdaf863db0fcd8`。
V5 已建立独立于 Workspace/Execution 的 append-only Evidence plane：strict Candidate/Plan/manifest/artifact
codec、server-issued immutable AttemptGrant 与一次性 claim、PostgreSQL atomic promotion、content-addressed
artifact store、local/remote/CI/import trust、两阶段 attestation、revocation/comparison/supersession、retention/
protection/tombstone/GC，以及可重算 Closure。Web Evidence panel 使用 strict verified-view codec 和安全
JSON/raster/text viewer，SourceTrace 只导航到实际持久化引用。`protectReleaseEvidence` 在 V5 只作为
Plan/AttemptGrant policy signal；真实 change/release owner 的 external reference protection 由后续 owner
materialize，Backend 不伪造 G5 identity。
V6 已新增 `@prodivix/verification-adapters` 与 `@prodivix/verification-browser` owner，接入
diagnostics/build/unit/integration 与 E2E/visual/accessibility/performance/security 的 controlled boundary；
root `verify:g3:adapter-matrix` 聚合 Verification Core、两类 adapter、Runtime providers、Compiler production
probe、66-cell/8-row/80-attempt Golden、Scenario-internal Data/Auth/Recovery companion Gate 与 owner
boundaries。2026-07-29 本地 root aggregate 已完整通过：80 attempts 全部 reported/passed，真实三浏览器 adapter
tests、Backend verification contract、remote worker 与 rootless snapshot contract 同步通过。独立 workflow 已
pin `ubuntu-24.04`，并由共享 registry 按 pre-adopted runner `ImageVersion` 绑定同族 Podman、OCI runtime、
conmon 与受支持的 cgroup manager；Linux controlled static install 已将 image build 的 frozen package-manager
验证与 runtime immutable package seed 物化分离，并以 30 秒 bounded Node authority command 取代
network-none runtime 中不确定的 package-manager 调用，重算完整 toolchain file-set identity；同时配置
Chromium/Firefox/WebKit 与真实 rootless Podman 执行，远端 CI evidence 尚待固定 commit/run identity。
`pnpm run verify:g3:boundaries`、
`pnpm run verify:g3:scenario-authoring`、`pnpm run verify:g3:behavior-composition` 与 `pnpm run build`
在本地通过；commit
[`90fcf961`](https://github.com/prodivix/prodivix/commit/90fcf96134d880156c19c0da64692a3a39564841)
的 [G3 CI run](https://github.com/prodivix/prodivix/actions/runs/30260091776) 三个独立 Job 全部通过并形成
V0-V2 durable evidence。`pnpm run verify:g3:deterministic-replay` 已在本地通过；commit
[`3def9168`](https://github.com/prodivix/prodivix/commit/3def9168a436594db1145274e011632e228a0db9)
的 [V3 CI Job](https://github.com/prodivix/prodivix/actions/runs/30319894969/job/90153389007)
也已通过并形成 durable evidence。`pnpm run verify:g3:verification-plan` 已在本地通过；commit
[`a6aa0bf9`](https://github.com/prodivix/prodivix/commit/a6aa0bf9452d66598c168e01f695f4d85deeacad)
的 [V4 CI Job](https://github.com/prodivix/prodivix/actions/runs/30327609403/job/90176153041)
也已通过并形成 durable evidence。`pnpm run verify:g3:evidence` 已于 2026-07-28 在本地通过，包含
真实 PostgreSQL integration、184 个 Verification tests、16 个 V5 Golden tests、52 个 Web tests、
Backend short suite 与 owner/wire boundaries；commit
[`f3d91b9d`](https://github.com/prodivix/prodivix/commit/f3d91b9dfc786b167fa5df825cd45116441c725c)
的 [V5 CI Job](https://github.com/prodivix/prodivix/actions/runs/30343213393/job/90223334935)
也已通过并形成 durable evidence。V6 Adapter matrix 的本地 Gate 已通过、CI 入口已配置；取得 durable CI
evidence 后继续进入 V7-V8。G3
Product Gate 继续保持 `In Progress`。

## G2 当前完成面

2026-07-20，统一 `pnpm run verify:g2` 已在本机 PostgreSQL 18 下完整通过（596.1s），Runner/DR、Data、
Auth/Server 与 Binary Asset 四个 aggregate 全部闭合；monorepo test、lint 与 build 也通过。随后 current-scope
GitHub PostgreSQL、authenticated Catalog rootless Preview/Test/Build、ClamAV + YARA-X real-engine 与相关 matrix
全部取得通过证据。commit `3f3047b895cf2806a0f8a6f7ecf4d7ab4ede0184` 又完成 regional operator、MRK v2、
PIR wire migration 与相关回归的远端闭环：14/14 个自动 workflow、25/25 个 check-run 全部成功。因此 current-scope
G2 Exit Gate 已通过；真实云 regional RPO/RTO 与 A14 AWS OIDC/KMS/MRK live run 继续作为明确的外部 evidence pending，
不升级对应 provider milestone，也不构成已经取得真实云证据的声明。

| 主线                  | current G2 closure                                                                                                                                                                                                                                                                                                                                                               | 未取得的外部证据                                                       |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Execution             | neutral Request/Provider/Job/Session/Snapshot；Browser/Remote Preview/Test/Build/production；rootless contract/real Gate；Console/Terminal/Network/Files/Test/SourceTrace；bounded reconnect/artifact/quota/worker-loss；NodeGraph/Animation G2 slice；regional DR exact/batch/one-shot operator/source-unavailable fencing/attested-RPO/sanitized evidence本地PostgreSQL Gate。 | 真实云 regional promotion/fencing/RPO/RTO；AWS KMS/MRK live evidence。 |
| Data                  | typed authoring、HTTP/OpenAPI、GraphQL、受限 AsyncAPI、mock/live policy、CRUD/retry/pagination/cache/optimistic lifecycle、same-execution stream recovery、React/Vue target matrix、authenticated Remote Catalog 与 D8 security matrix。                                                                                                                                         | 无 current G2 external evidence 缺口。                                 |
| Auth / Server Runtime | A0-A13/A15-A17 current-scope closure；A17 sharing/editor已有GitHub PostgreSQL/product/rootless evidence；A14 official `aws.kms/v2` exact-ARN/MRK stable-identity adapter、Environment/Terminal跨区contract、本地/PostgreSQL Gate、OIDC workflow与参考IaC；完整current-surface canary/Golden matrix。                                                                             | A14真实AWS OIDC/KMS/MRK run。                                          |
| Binary Asset          | B0-B7 exact-byte local/cloud store、full-raster PNG/JPEG、required ClamAV/YARA-X、delivery、retention、Git/LFS、runtime import/replace、Browser JPEG 与 React/Vue cross-target matrix；双引擎 rootless real Gate 已通过。                                                                                                                                                        | 无 current G2 external evidence 缺口。                                 |

Auth/Server milestone：[`g2-auth-server-runtime-milestones.md`](./g2-auth-server-runtime-milestones.md)。
Binary Asset milestone：[`g2-binary-asset-milestones.md`](./g2-binary-asset-milestones.md)。

## 明确的 post-G2 边界

以下能力不再作为 G2 Passed 的伪阻塞项：

- WebSocket/GraphQL WS、Kafka/MQTT、durable/cross-execution stream recovery；
- 第三方 Auth/managed KMS provider、更高 organization permission/role；
- 更宽 isolated source mutation profile、未来 producer-specific debugger；
- 更多 raster 格式、额外 malware vendor、durable public-CDN promotion 与 public Target SDK。

## 状态维护规则

1. 当前完成状态只在本文件更新；不要在 `AGENTS.md`、ADR 或 architecture 文档中追加“最新状态”或“覆盖上方描述”。
2. milestone 文件记录子系统阶段状态与剩余 Gate；implementation 文档记录 contract 和验证方法；evidence 文档记录具体运行证据。
3. 未取得本地或远端证据时，不把“workflow 已配置”写成“Gate 已通过”。
4. 当前 worktree 的本地 closure 不能替代未执行的 GitHub isolation、真实 daemon 或云 provider evidence。
