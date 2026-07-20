# Prodivix 当前状态

> StatusDate: 2026-07-20
> 本文件是 G0/G1/G2/G3 当前完成状态的唯一来源。`global-phases.md` 定义阶段目标与退出条件；evidence 文档保存可重复验证证据，不重复声明当前状态。

## 全局阶段

| Phase                              | Product Gate | 当前判断                                                                                                                                                                            |
| ---------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G0 Truth & Change Kernel           | Passed       | Canonical Workspace、可逆 change、唯一生产写入链、conflict/outbox/local replica 与 Issues closure 已验证。                                                                          |
| G1 Semantic Hybrid Authoring       | Passed       | PIR-current、Semantic Index、Code/Shader、Component/Collection、controlled round-trip、Asset semantic surface 与 React/Vite Golden 已验证。                                         |
| G2 Executable Full-stack Workspace | In Progress  | current G2 scope本地implementation/product/security closure已完成；本轮regional operator与MRK v2更新的GitHub non-cloud evidence待后续明确提交推送后取得，AWS/真实云evidence仍延后。 |
| G3 Behavior & Verification Closure | Blocked      | ADR 56-63 与完整 implementation/milestone contract 已冻结；实现尚未开始并等待 G2 退出 Gate。当前 Test/trace 仍是运行态输入，不提前等同于 `VerificationEvidence`。                   |
| G4 Verified Agentic Development    | Blocked      | 等待 G3。                                                                                                                                                                           |
| G5 Collaborative Production Loop   | Blocked      | 等待前置阶段。                                                                                                                                                                      |
| G6 Trusted Ecosystem               | Blocked      | 等待前置阶段。                                                                                                                                                                      |

阶段定义与退出条件：[`global-phases.md`](./global-phases.md)。G0/G1 重复验证边界：
[`g0-closure-evidence.md`](./g0-closure-evidence.md)、[`g1-closure-evidence.md`](./g1-closure-evidence.md)。
G2 可重复证据与外部 pending：[`g2-closure-evidence.md`](./g2-closure-evidence.md)。
G3 contract 与阶段状态：[`../implementation/g3-behavior-verification-closure.md`](../implementation/g3-behavior-verification-closure.md)、
[`g3-behavior-verification-milestones.md`](./g3-behavior-verification-milestones.md)；证据模板：
[`g3-closure-evidence.md`](./g3-closure-evidence.md)。

## G2 当前完成面

2026-07-20，统一 `pnpm run verify:g2` 已在本机 PostgreSQL 18 下完整通过（596.1s），Runner/DR、Data、
Auth/Server 与 Binary Asset 四个 aggregate 全部闭合；monorepo test、lint 与 build 也通过。随后 current-scope
GitHub PostgreSQL、authenticated Catalog rootless Preview/Test/Build、ClamAV + YARA-X real-engine 与相关 matrix
全部取得通过证据。`In Progress`不再表示已知本地或 non-cloud CI 功能缺口。

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
