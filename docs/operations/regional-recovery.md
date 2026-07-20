# Remote Execution regional recovery runbook

本 runbook 对应 ADR 52 的 repository-only operator closure。它不宣称已经完成真实云端 DNS/Anycast、数据库
promotion 或 RPO/RTO drill；这些仍需要独立云环境和外部 evidence。

## 固定安全边界

1. operator 是独立 one-shot process：`pnpm --filter @prodivix/remote-runner-control-plane regional-recovery`。
   公共 Control Plane HTTP handler 不注册 cutover route。
2. 一个 request 包含 1-128 个唯一 execution id；排序后的集合只以 SHA-256 出现在 evidence。整个 batch 在一个
   exclusive traffic-authority transaction 中准备，并只推进一个 epoch。
3. authorization、infrastructure fence、replication attestation 使用三个不能复用的 Ed25519 public key set。
   callback-bound proof bytes 与数据库 URL 不进入 request、evidence、日志或 PostgreSQL；数据库只保存已消费
   authorization proof 的 digest 和时间。
4. `planned` 必须读到 source/target exact checkpoint，任何 cursor lag、ahead、state drift 或 identity drift都拒绝。
5. `source-unavailable` 不连接 source probe，但必须同时满足：
   - one-shot authorization scope exact；
   - 旧 Region ingress、scheduler、worker 已被外部基础设施 fence；
   - replication controller 对 exact target batch checkpoint 与 `lastReplicatedAt` 签名；
   - `cutoverAt - lastReplicatedAt` 不超过 request 和 deployment 两层 RPO 上限；
   - 旧 worker lease 已到期。即使已有 fence，也不凭空制造第二个 live lease。
6. 不能迁移 PTY transport。需要 recovery 的 Terminal row 先在 target 以 `transport-lost` 关闭并重新 capture
   验证，之后才允许 traffic epoch 前进。

## Request 与 scope

request 文件不包含任何 proof 或 Secret：

```json
{
  "format": "prodivix.remote-execution-regional-recovery-operator",
  "version": 1,
  "operationId": "dr-2026-07-20-001",
  "mode": "planned",
  "executionIds": ["execution-a", "execution-b"],
  "expectedTrafficEpoch": 7,
  "initiatedAt": 1784505600000,
  "cutoverAt": 1784505660000
}
```

`source-unavailable` 另加非负 `maximumAcceptedRpoMs`。issuer 必须使用
`createRemoteExecutionRegionalRecoveryAuthorizationScope` 与
`createRemoteExecutionRegionalRecoveryAuthorizationScopeDigest` 生成 exact scope；不能自行拼接 JSON。

replication controller 使用 target Region 的
`createPostgresRemoteExecutionRegionalRecoveryProbe` capture 同一批 execution，再调用
`createRemoteExecutionRegionalRecoveryTargetCheckpointDigest` 取得 challenge。challenge 中不需要输出 raw
execution id。若 preflight 后 target state 变化，operator 计算出的 digest 不再匹配，cutover fail closed。

三个 issuer 分别调用 `encodeRemoteRegionalRecoverySignedProofPayload` 获取 canonical bytes，在隔离系统中签名，
再由 `encodeRemoteRegionalRecoverySignedProof` 形成 proof 文件。private key 不得部署到 operator job。

## Job 配置

所有文件路径必须是绝对路径，input/output 不得相同。proof 建议通过只读、短期、内存型 Secret volume 注入；
evidence path 必须不存在，job 使用 create-new 与 `0600` 请求创建。

| 变量                                                              | 用途                                                                       |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `REMOTE_DR_DEPLOYMENT_ID`                                         | exact traffic authority deployment                                         |
| `REMOTE_DR_SOURCE_REGION_ID` / `REMOTE_DR_TARGET_REGION_ID`       | distinct region id                                                         |
| `REMOTE_DR_SOURCE_DATABASE_URL` / `REMOTE_DR_TARGET_DATABASE_URL` | execution authorities；source-unavailable 不查询 source                    |
| `REMOTE_DR_TRAFFIC_DATABASE_URL`                                  | 独立 traffic/replay authority                                              |
| `REMOTE_DR_*_PUBLIC_KEYS_JSON`                                    | authorization/fence/replication 三个 role-separated Ed25519 public key map |
| `REMOTE_DR_REQUEST_PATH`                                          | strict request JSON                                                        |
| `REMOTE_DR_AUTHORIZATION_PROOF_PATH`                              | 必需、一次性 grant                                                         |
| `REMOTE_DR_INFRASTRUCTURE_FENCE_PROOF_PATH`                       | source-unavailable 必需                                                    |
| `REMOTE_DR_REPLICATION_ATTESTATION_PATH`                          | source-unavailable 必需                                                    |
| `REMOTE_DR_EVIDENCE_PATH`                                         | 新建 sanitized JSON evidence                                               |
| `REMOTE_DR_MAXIMUM_*`                                             | batch、并发、request age、proof lifetime、worker attempts、RPO hard limits |

target Terminal 还必须使用与 target Control Plane 相同的 `REMOTE_TERMINAL_STATE_*` 配置。AWS 模式应指向
当地 related MRK replica exact ARN；static key 仅用于本地 drill/迁移。

traffic schema migration与初始 authority必须在部署阶段完成。operator job不会在事故处理中运行 DDL，也不会初始化
或重置 epoch。配置会忽略credential/query差异并拒绝明显指向同一host/port/database的三个URL；DNS alias、proxy和
实际故障域独立性仍必须由部署拓扑审查确认，不能靠字符串比较冒充多区域隔离。

## 执行顺序

### Planned

1. 确认 source 是当前 active Region，停止新的业务调度，并记录当前 epoch。
2. 等待数据库复制追平，为 exact batch 生成 request 与短期 authorization grant。
3. 在受保护环境运行 one-shot job。
4. 验证返回 evidence 的 `targetTrafficEpoch=sourceTrafficEpoch+1`，并用
   `listCutovers` 确认 durable `checkpointDigest` 等于 `evidenceDigest`；evidence 内的
   `cutoverCheckpointDigest` 另行绑定 exact scope、target checkpoint 与 aggregate outcome。
5. 从新 active Region 做 readiness、claim、lease renewal 与有限 smoke；旧 Region 必须返回 standby。

### Source unavailable

1. 先由基础设施层撤销旧 Region ingress、scheduler 和 worker mutation capability；确认 traffic authority 的
   exclusive lock 可以 drain。没有 fence proof 不得继续。
2. replication controller 确认 target promotion/last applied position，对 exact target checkpoint 与
   `lastReplicatedAt` 出具 attestation。
3. 等待 batch 内所有旧 worker lease 到期；不要人工改 lease row。
4. 签发 exact one-shot authorization，运行 job，并按 evidence 检查 RPO upper bound 与 operator-prepared RTO。
5. 新 Region smoke 后保持旧 Region隔离；修复旧 Region 前不得让它重新取得 traffic authority。

## Evidence 与失败处理

evidence 只含 deployment/region/epoch、execution count/set digest、target/cutover digest、principal/grant/fence/
attestation digest、outcome aggregate、RPO upper bound 和时间。它不含 execution/request/owner id、ARN、URL、
proof、token、ciphertext、Terminal session id 或应用输入输出。codec 会拒绝未知字段和不一致的 self-digest/timing；
真实性必须再用 immutable traffic cutover row 中的 `checkpointDigest=evidenceDigest` 验证，不能只信任 evidence 文件自身。

- authorization 已消费但 cutover conflict/失败：安全地签发新 operation/grant；旧 grant不可重放。
- `replication-lag`/`rpo-bound-exceeded`：等待复制或终止，不提高上限来“让测试通过”。
- `recovery-blocked` 且 lease 尚存活：等 lease自然到期。
- traffic cutover 已有 durable digest 但 evidence 文件写失败：保持新 Region active，禁止重跑旧 epoch；从受保护
  job 日志、traffic cutover row 与同一 prepared evidence buffer 做人工 incident record，不回切来修 evidence。
- rollback 是另一个方向相反、epoch 单调增加的新 operation，不允许把 epoch 写回旧值。
