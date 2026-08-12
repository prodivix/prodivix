# G4 Real-model Evaluation Operator Runbook

## 状态与适用范围

- Evaluation surface：`.github/workflows/g4-real-model-evaluation.yml`
- Human-review producer：`.github/workflows/g4-real-model-human-review.yml`
- Evaluation Environment：`g4-real-model-evaluation`
- Human-review Environment：`g4-real-model-human-review`
- 当前状态：`Configured / Evidence pending`
- 本地实现状态：`Infrastructure / Contracts / Production Reachability Implemented; Local Contract Gates Passed`
- Authority：ADR 69 的 frozen plan、完整 denominator、deterministic/human grader、project-signed evidence 与 G3
  Closure 共同决定 qualification；bounded endpoint smoke 只形成 adapter admission evidence。

本手册覆盖三个 native protocol family 的真实模型评测：OpenAI Responses、Anthropic Messages 与 Gemini
Interactions，并覆盖 hosted/local OpenAI-compatible admission。普通 PR workflow 的 remote-model units 保持为零；真实
Provider 调用只经 `workflow_dispatch` 或季度 `schedule` 进入 evaluation protected Environment。人审发布只接受独立
`workflow_dispatch`。
Gemini production transport 固定 stable Interactions v1：create 使用 `/v1/interactions`，poll 使用
`/v1/interactions/{interaction-id}`；v1beta 仅保留为明确拒绝或迁移测试向量。

## 1. 首次配置

### 1.1 Evaluation protected Environment

在 GitHub repository settings 中创建 `g4-real-model-evaluation` Environment，并配置：

1. required reviewers 使用独立于模型、grader、human reviewer 和 production approval actor 的评测操作人；
2. 启用 prevent self-review；
3. deployment branch policy 只允许受保护的 `main` exact commit；
4. reviewer 在批准前核对 exact commit、frozen config、evaluation id、三项 hard budget ceiling 与预估容量；
5. Environment 中保存下表 Secret，repository、workflow input、artifact 与 job summary 只保存引用名。

| Environment Secret                                                                    | 用途                                                                                                                                                                    |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PRODIVIX_G4_MODEL_EVAL_OPENAI_API_KEY`                                               | OpenAI Responses callback-bound transport                                                                                                                               |
| `PRODIVIX_G4_MODEL_EVAL_ANTHROPIC_API_KEY`                                            | Anthropic Messages callback-bound transport                                                                                                                             |
| `PRODIVIX_G4_MODEL_EVAL_GEMINI_API_KEY`                                               | Gemini Interactions callback-bound transport                                                                                                                            |
| `PRODIVIX_G4_MODEL_EVAL_HOSTED_COMPATIBLE_API_KEY`                                    | hosted OpenAI-compatible smoke callback-bound transport                                                                                                                 |
| `PRODIVIX_G4_MODEL_EVAL_LOCAL_COMPATIBLE_API_KEY`                                     | local OpenAI-compatible smoke 的固定 bearer transport                                                                                                                   |
| `PRODIVIX_G4_MODEL_EVAL_HOLDOUT_KEY_BASE64`                                           | protected holdout AES-256-GCM key；只注入 full shard callback                                                                                                           |
| `PRODIVIX_G4_MODEL_EVAL_RESULT_SPOOL_KEY_BASE64`                                      | bounded provider result spool AES-256-GCM key；分别只注入 smoke 与 full shard 的 provider callback                                                                      |
| `PRODIVIX_G4_MODEL_EVAL_CAPABILITY_PROBE_RESPONSE_SPOOL_KEY_BASE64`                   | active-probe response spool 的独立 AES-256-GCM key；只注入执行新 preplan 的 8791 sidecar 与对应 mask/artifact scan step                                                 |
| `PRODIVIX_G4_MODEL_EVAL_CAPABILITY_EFFECT_PROVIDER_JOURNAL_SPOOL_KEY_BASE64`          | capability-effect Provider runtime journal response spool 的独立 AES-256-GCM key；只注入 full-attempt 8791 sidecar 与对应 mask/artifact scan step                       |
| `PRODIVIX_G4_MODEL_EVAL_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_KEY_BASE64` | Hosted exact-four lifecycle response spool 的独立 AES-256-GCM key；只注入 prepare/cleanup/recovery 8791 sidecar 与对应 mask/artifact scan step                          |
| `PRODIVIX_G4_MODEL_EVAL_NATIVE_PROVIDER_STATE_VAULT_KEY_BASE64`                       | Native Provider state 的独立 AES-256-GCM master key；只注入 plan/full shard 的 8790 durable vault owner 与 recovery-only 8790 closure，以及对应 mask/artifact scan step |
| `PRODIVIX_G4_MODEL_EVAL_DATABASE_URL`                                                 | Backend evaluation ledger 的 protected PostgreSQL connection                                                                                                            |
| `PRODIVIX_G4_MODEL_EVAL_SERVICE_TOKEN`                                                | Runner 到 evaluation ledger service 的短期 purpose-bound token                                                                                                          |
| `PRODIVIX_G4_MODEL_EVAL_OWNER_AUTHORITY_SERVICE_TOKEN`                                | Backend ledger 到 controlled Workspace/G3 owner sidecar 的独立 purpose-bound token                                                                                      |
| `PRODIVIX_G4_MODEL_EVAL_VERIFICATION_OWNER_TOKEN`                                     | full-attempt 8791 到独立 Backend Verification owner 的 purpose-bound token                                                                                              |
| `PRODIVIX_G4_MODEL_EVAL_VERIFICATION_RESUME_KEY_BASE64`                               | Backend Verification promotion capability/nonce 的独立 canonical Base64 32-byte key                                                                                     |
| `PRODIVIX_G4_MODEL_EVAL_ATTESTATION_PRIVATE_KEY`                                      | full-shard frozen-config commitment 与 final export 共用的 canonical Base64URL Ed25519 PKCS8 key                                                                        |
| `PRODIVIX_G4_MODEL_EVAL_G3_ATTESTATION_PRIVATE_KEY_PKCS8_BASE64URL`                   | G3 Verification Evidence 独立 canonical 48-byte Ed25519 PKCS8 key；只注入 full-attempt 8791 与对应 mask/artifact scan step                                              |
| `PRODIVIX_G4_MODEL_EVAL_SECRET_CANARIES`                                              | verifier 使用的非空 JSON string array                                                                                                                                   |
| `PRODIVIX_G4_MODEL_EVAL_PROTECTED_HOLDOUT_CANARIES`                                   | protected holdout leak verifier 使用的非空 JSON string array                                                                                                            |

`PRODIVIX_G4_MODEL_EVAL_SERVICE_TOKEN`、`PRODIVIX_G4_MODEL_EVAL_OWNER_AUTHORITY_SERVICE_TOKEN` 与
`PRODIVIX_G4_MODEL_EVAL_VERIFICATION_OWNER_TOKEN` 分别使用 32..4096 bytes、匹配
`^[A-Za-z0-9._~+/-]+={0,2}$` 的独立 ASCII 随机值。推荐各生成至少 32 random bytes 并保存为 43-character
Base64URL。每个接触对应 loopback authority 的 protected job 都在启动数据库或 Provider callback 前执行同一 canonical
校验；三个 token 逐对不同并保持 credential scope 分离。

Provider key、holdout key、result spool key、capability-probe response spool key、capability-effect Provider journal spool key、Hosted
lifecycle spool key、Native Provider state-vault key、Verification resume key、database URL、三项 loopback token、canary 与 signing key
只注入 purpose-bound callback、mask registration 或 artifact scan step。dependency install、build、checkout 与 artifact upload step
保持 public-only。七个 symmetric key 解码后必须各自恰好为 32 bytes；新
preplan 8791 取得三项 native Provider key 与 active-probe spool key；plan 的 8790 取得 state-vault key，并验证它与 active-probe
spool key 物理分离。full-attempt 8791 取得三项 native Provider key与 capability-effect Provider journal spool key，并保持 active-probe
key 隔离；full mask 验证 journal spool key 与 result、active-probe、state-vault key 逐对物理分离。full shard 的 8790 同时验证
state-vault key 与普通 result/endpoint-smoke spool key 的物理分离；full shard 同时验证 Verification resume key 与 result spool/
state-vault key 的物理分离。Hosted prepare/cleanup/recovery 8791 callback可同时持有对应 Provider key、lifecycle spool key、
Backend token 与独立 owner token；step-level 注入、purpose binding、逐对不等、mask 与 canary scan共同限制其使用范围。
tracked profile 继续锁定独立 key id/reference/digest。preplan、8790、8792、`run-shard`、human
review、finalize、cleanup-only 与 same-run replay 保持 journal spool key-free；same-run frozen plan replay 不启动 active probe 或
stateful registration，也不读取 probe/state-vault key。workflow 在首次调用前注册 raw、Base64、Base64URL、
hex 与 URL-encoded mask，并在每次 artifact upload 前执行同族扫描。

G3 Verification Evidence signer 与 model-evaluation archive signer 使用两个物理独立的 Ed25519 private key。G3 key 必须是
64-character unpadded Base64URL、解码为 exact 48-byte PKCS8 DER 且具有 canonical Ed25519 prefix；workflow 在 full mask 与 artifact
scan 中同时解码两把 key 并拒绝相同 bytes。G3 private signer 的运行态注入范围固定为 `purpose=full-attempt` 的 8791 callback；
full mask/artifact scan 只做派生值注册与泄漏检查，preplan、8790、8792、`run-shard`、human review、finalize 与 same-run replay
保持 private-key-free。

### 1.2 Human-review protected Environment

创建独立 `g4-real-model-human-review` Environment：

1. required reviewers 使用 review-publish operator；该 operator 与两位 blind reviewer、必要 adjudicator、模型 owner、
   evaluation operator 和 production approver 分离；
2. 启用 prevent self-review，并只允许受保护的 `main` exact commit；
3. 只配置 `PRODIVIX_G4_MODEL_EVAL_HUMAN_REVIEW_PRIVATE_KEY` Secret。它是与 frozen run config 中
   `adjudicationAuthorityId`、key id 和 public key 精确对应的 canonical Base64URL Ed25519 PKCS8 key；
4. Reviewer 与 adjudicator 的 public trust registry、independence policy 和 adjudication policy 全部来自 tracked frozen
   run config。Environment Secret 不承担 trust-root 声明。

该 Environment 不提供 Provider key、holdout key、database URL、ledger token 或 final evidence signing key。人审 producer
只读取 blind bundle、受控 inbox 和 tracked public policy，输出固定根文件 `human-review.json`。

### 1.3 Fixed self-hosted runner pools 与 infrastructure egress

接触 Provider、PostgreSQL、protected holdout/canary、service token 或 final signing key 的 job 固定使用：

```yaml
runs-on: [self-hosted, linux, x64, g4-real-model-evaluation]
```

读取受控 reviewer inbox 或 human-review signing key 的 job 固定使用：

```yaml
runs-on: [self-hosted, linux, x64, g4-real-model-human-review]
```

只有不读取任何 protected Secret 的 `preflight` job 使用 GitHub-hosted `ubuntu-24.04`。两个 Environment 分别只向对应
runner pool 释放 Secret；repository 没有 fallback label、hosted fallback 或自动降级。pool 缺失、离线、label 不完整或
infrastructure attestation 失败时，job 保持 queued/blocked，状态继续为 `Configured / Evidence pending`。

两个 pool 使用单任务 ephemeral runner，或在每个 job 后完成等价的 disk、process、container、credential 与 network
namespace 重置。toolchain、Go modules 和 pnpm content-addressed store 均预先采用并固定；protected job 执行
`pnpm install --offline --frozen-lockfile`，Backend ledger 使用 `GOPROXY=off`。依赖缺失会直接 fail closed。

每台 `g4-real-model-evaluation` host 只注册一个并发 runner process。workflow 的 `max-parallel: 3` 必须落到三台相互隔离的
host；同一 host 注册多个 runner 会让固定 loopback `8790`/`8791`/`8792` 发生跨 job 串线，因此不具备准入资格。每个 job 启动时要求
自身所需端口初始 free，并先断言旧 health endpoint 不可达；`full_shards` 同时要求三个端口 free。启动后台进程后保留其 PID，
在每次 health probe 前执行存活检查。
8791 sidecar 通过 `PRODIVIX_G4_MODEL_EVAL_OWNER_AUTHORITY_PURPOSE` 固定单一 purpose。`preplan` health 只包含 capability probe、
Provider resource、Provider resource cleanup、runtime fact-source registration 与 replay journal implementation digest；
`full-attempt` health 只包含 controlled Workspace、Verification evidence、Provider capability、attempt grading 与 replay journal
implementation digest。两种 canonical ready document 都承诺 exact `purpose` 并由所属字段重算 `healthDigest`。已有进程、端口占用、
后台 PID 提前退出或 health purpose/identity/shape 漂移都会在 Provider 调用前 fail closed。

Evaluation pool 的 infrastructure default-deny egress policy只开放：

- `https://api.openai.com`；
- `https://api.anthropic.com`；
- `https://generativelanguage.googleapis.com`；
- GitHub API 与该 repository 所需的 Actions artifact/cache endpoints；
- 受控 PostgreSQL hostname/IP 与固定端口；
- runner 自身的 `127.0.0.1:8790` Backend ledger loopback；
- runner 自身的 `127.0.0.1:8791` controlled Workspace/G3 owner authority loopback；
- runner 自身的 `127.0.0.1:8792` Backend Verification direct owner loopback；
- frozen local OpenAI-compatible endpoint 的 exact loopback origin。

Hosted OpenAI-compatible admission 默认复用 frozen config 已批准的三家 origin 之一，当前首选 OpenAI hosted origin，并以
generic adapter/profile 形成独立 smoke identity。引入第四个 external aggregator 时，operator 先更新 run config 的 origin/
endpoint identity、重算 plan 与 egress policy digest，并完成基础设施 allowlist 审批。workflow 不会隐式开放额外 origin。

Human-review pool 只开放 GitHub API/artifact endpoints，并挂载只读受控 inbox
`/srv/prodivix/g4-human-review-inbox`。它没有通用 Internet、Provider、PostgreSQL 或 holdout egress。缺少该 exact pool、
read-only mount 或 default-deny policy 时，人审发布保持禁用。

Evaluation pool 的 DNS resolver、egress proxy/firewall 与 route policy 共同绑定 allowed hostname、resolved address、TLS
SNI/证书、destination IP/port、redirect target 与 purpose。每次 connect 在网络层重新应用同一 allowlist，并拒绝
private/link-local/metadata/loopback destination（固定 loopback exception 除外）、DNS rebinding、redirect drift 与解析后 IP
漂移。该基础设施 contract 闭合 native fetch 在 DNS preflight 与实际 fetch 之间的二次解析窗口。

Protected holdout body 通过受控 PostgreSQL 或预装 encrypted local volume 提供。GitHub artifact/API 只接收 sanitized
export；raw holdout、raw model stream、Secret 与 signing material 留在 protected boundary。

所有生产 CLI 在 `pnpm --filter @prodivix/agent-evaluation-runner build` 成功后，从 exact `${GITHUB_WORKSPACE}` repository root
直接执行 `node apps/agent-evaluation-runner/dist/cli.js`。filtered package script 会把 `process.cwd()` 切换到 package directory，
因此不用于 production invocation；repo-relative tracked template、Git checkout input 与 Workspace path 始终以 checkout root 为 authority。
preplan 生成的 `production-run-config.json` 由 artifact identity、canonical whole-file bytes、durable ingress 与
`runConfigArtifactBinding` 共同成为 post-preplan production config authority。

### 1.4 Public Environment / repository variables

| Variable                                                    | 要求                                                   |
| ----------------------------------------------------------- | ------------------------------------------------------ |
| `PRODIVIX_G4_MODEL_EVAL_ATTESTATION_PUBLIC_KEY`             | 32-byte Ed25519 public key 的 Base64URL 表示           |
| `PRODIVIX_G4_MODEL_EVAL_ATTESTATION_KEY_ID`                 | 冻结 key id；与 signed archive authority 完全一致      |
| `PRODIVIX_G4_MODEL_EVAL_ATTESTATION_AUTHORITY_ID`           | 冻结签名 authority id；与 run config 完全一致          |
| `PRODIVIX_G4_MODEL_EVAL_G3_ATTESTATION_KEY_ID`              | G3 signer key id；与 Backend trust set exact 匹配      |
| `PRODIVIX_G4_MODEL_EVAL_G3_ATTESTATION_ISSUER`              | G3 attestation issuer exact text                       |
| `PRODIVIX_G4_MODEL_EVAL_G3_ATTESTATION_AUDIENCE`            | G3 attestation audience exact text                     |
| `PRODIVIX_G4_MODEL_EVAL_G3_ATTESTATION_SUBJECT`             | G3 attestation subject exact text                      |
| `PRODIVIX_G4_MODEL_EVAL_G3_ATTESTATION_TRUST`               | exact `remote-attested` 或 `ci-attested`               |
| `PRODIVIX_G4_MODEL_EVAL_G3_ATTESTATION_POLICY_GENERATION`   | positive policy generation，最大 1,000,000             |
| `PRODIVIX_G4_MODEL_EVAL_G3_ATTESTATION_MAXIMUM_LIFETIME_MS` | positive lifetime，范围 1..3,600,000 ms                |
| `PRODIVIX_G4_MODEL_EVAL_ENVIRONMENT_DIGEST`                 | evaluation runner、egress 与 Environment policy digest |
| `PRODIVIX_G4_MODEL_EVAL_HOLDOUT_DIRECTORY`                  | evaluation runner 上只读 holdout 目录的绝对路径        |
| `PRODIVIX_G4_MODEL_EVAL_PUBLISH_GITHUB_ATTESTATION`         | 可选；值为 `1` 时发布 GitHub build provenance          |
| `PRODIVIX_G4_MODEL_EVAL_RUN_CONFIG`                         | schedule 专用 tracked qualification template path      |
| `PRODIVIX_G4_MODEL_EVAL_EVALUATION_ID`                      | schedule 可选稳定 resume identity                      |
| `PRODIVIX_G4_MODEL_EVAL_BUDGET_CAPS`                        | schedule JSON aggregate hard ceilings                  |
| `PRODIVIX_G4_MODEL_EVAL_ENABLED`                            | schedule 显式开关；只有 exact `1` 可进入 protected job |

Public key、key id、authority id 与 environment digest 共同形成 frozen-config commitment 和 final evidence external trust
policy。`full_shards` 与 final job 分别使用 GitHub context 固定 workflow name、run id、run attempt 与真实 job id；signer 与
strict verifier 从外部配置取得相同 expected identity，并逐字段核对 signed payload。
G3 signer 的七项 public variable 进入 full-shard public-descriptor derivation 与 full-attempt 8791，并形成独立 attestation
authority digest。derivation step 从 exact PKCS8 key 取得 32-byte Ed25519 public key，将 public key、key id、issuer、audience、
subject 与 trust 组成 `BACKEND_VERIFICATION_ATTESTATION_KEYS`，再将 policy generation/lifetime 一并只注入 8792 Backend
Verification owner；Backend 保持 private-key-free。

当 schedule variable 不是 exact `1`，或手动 `evaluate` 仍选择 `disabled` 时，唯一 hosted preflight 写入
`Configured / Evidence pending` summary 并成功结束；checkout、environment secrets、self-hosted jobs、preplan 与 Provider
dispatch 全部跳过。Provider API key 可以保持未配置，默认 `disabled` 路径的 Provider 调用计数为零。`finalize` 只消费既有 exact
artifact authority，继续按独立 source identity 运行。

### 1.5 Frozen run config

Evaluation `workflow_dispatch` 的 `run_config` 是必填 repository-relative tracked qualification template。schedule 只读取
repository variable `PRODIVIX_G4_MODEL_EVAL_RUN_CONFIG`，并且没有正式默认值。
`specs/evaluation/g4-real-model-evaluation.example.json` 只用于 evidence-free schema/template 演示；其
`purpose: template` 与 model identity 是 pre-plan 输入，不能作为 production run config 发布。

protected plan job 先启动 8790 ledger，并验证 canonical bootstrap activation health、`.plan` vault ready、clean
capability-effect Provider journal health 与 Hosted retrieval runtime owner preactivation health，再启动 8791 preplan owner authority；8790 绑定 exact 8791 health 后以 active health 和
`/healthz=204` 放行 bounded `preplan`。qualification
contract 要求 preplan 按 canonical 顺序封存
4 个 Provider resource authorities（OpenAI Responses、Gemini Interactions × hosted retrieval core/document）、
15 个 runtime fact-source registrations、18 个 capability probes 与 4 个 durable Provider resource cleanup receipts，
共 41 个 authority operations；4 个 cleanup 全部完成后才冻结并生成唯一
`production-run-config.json`。只有这份生成物包含 `purpose: production`、动态 qualification authority bundle、
`plannedAt`/`expiresAt` 与 final plan；任何缺项、过期 authority、Anthropic resource authority 或 digest 漂移都会在 plan
publication 前 fail closed。

preactivation storage health、shared-effect journal owner 与 exact 15 项 runtime fact-source readiness 已进入 production
composition。run-level Hosted exact-four 使用 singleton
`hosted_prepare → full_shards → hosted_cleanup → hosted_recovery → export_review` DAG；cleanup 在 prepare成功且 shard进入任一
terminal状态后执行，recovery 在 plan/smoke成功后始终执行，export仅在全链成功后放行。Backend dispatch-intents、
transport-receipts、records/seal、archive-read 与 health routes 已接线，workflow状态继续为
`Configured / Evidence pending`，等待 protected PostgreSQL 与真实 Provider operation evidence。

same-run retry 先读取并验证上一 attempt 的 exact `production-run-config.json`；完整 authority bundle、cleanup receipts、
plan 与摘要一致时复用原 bytes 和 `plannedAt`，不再 dispatch resource registration、runtime registration、probe 或 cleanup。

Preflight 严格读取：

```text
providers.openaiResponses.model.modelId
providers.anthropicMessages.model.modelId
providers.geminiInteractions.model.modelId
```

它们分别进入三个 `PRODIVIX_G4_MODEL_EVAL_*_MODEL_ID` env。tracked template 只通过
`PRODIVIX_G4_MODEL_EVAL_RUN_CONFIG_TEMPLATE_PATH` 进入 preplan owner。plan、smoke、full shards、review export、human review
与 finalize 都从 exact plan artifact 下载 `production-run-config.json`，将其绝对路径写入
`PRODIVIX_G4_MODEL_EVAL_RUN_CONFIG_PATH`，并同时提供 artifact name、GitHub digest、source run id 与 producer run attempt。
CLI 的显式 `--config` 参数与这份已验证生成物交叉绑定。

每个 native target 还必须冻结 9 个 `capabilityInferenceConfigurationDigests`：3 个 core required profile 与
6 个 optional provider profile（background job、两个 hosted retrieval、parallel tool、isolated cache 和 reasoning
continuation）。`declaredCapabilityProfileDigests` 只声明 Provider 真实公开的 profile；每个 optional
profile 另需一个 `capabilityProbeAuthorities` entry，将 issuer/owner/adapter、request/response、dispatch/transport、
response spool、normalized event set、observed limit、provider configuration、model lineage、profile 与有效期全部
签入 sealed authority。Preflight 重算 declaration、probe、evidence 与 self digest，并对 provider × profile 做
exact join。在有效 sealed evidence 明确返回 `supported` 时，该 target 才会成为 `required`；明确
`unsupported` 的 target 冻结为 `expected-blocked`，执行时仍需产生 exact
`capability-unavailable-receipt` 或等价真实 denial。tag、model 名称、fixture 和缺失的 observation 都不授予
support authority。三个 native target 的 3 core + 6 optional 格子因此形成固定 27-target matrix，
当前 denominator 仍由同一 frozen case/repetition plan 确定为 14,040。

Evidence archive 的 index、Ed25519 archive attestation 与 root v2 共同签入 canonical
`runConfigArtifactBinding`。该 binding 精确承诺 plan artifact name/digest、source workflow run id/producer attempt、固定文件名、
canonical byte length/digest、`sourceConfigDigest`、`frozenRunDigest`、`planDigest`、repository commit 与 self digest。
外部 verifier 通过 runner 的 bounded artifact loader 读取下载后的生成物，拒绝 symlink、duplicate key、非 canonical JSON、
TOCTOU、错误 artifact identity 与任一重承诺漂移，再交叉验证 plan、五个 pricing authority、attempt spool policy 与
endpoint-smoke spool policy。这样 release evidence 能在不公开 Secret 或 holdout material 的前提下独立证明本次运行使用的
production config artifact。

每个 completed turn 最多形成一张 sanitized `ProviderCapabilityObservationReceipt`，receipt canonical bytes
不超过 16 KiB，`facts` 只接受 0..2 条 owner-observed facts。receipt 精确绑定 plan、frozen commitment、
attempt、capability descriptor、turn、invocation request/response、adapter/protocol/provider/model、dispatch/transport、
encrypted spool、normalized event set 与 `observedAt`。owner receipt 与 capability-specific receipt 必须引用同一
observation digest/set root。native terminal/usage 事实由 Provider event 链观测；job/cache/retrieval/continuation 需
shared-durable owner source 提供同等 sealed observation。缺少观测时该 optional slice 只能进入 unavailable/
denial 路径，不得形成 supported 或 satisfied claim。

正式 config 冻结每个 restricted case 的 resolver reference、encrypted envelope digest、encryption policy digest 与
repository-independent relative path。机器 absolute path 不进入 config 或 plan。evaluation runner 从 public
`PRODIVIX_G4_MODEL_EVAL_HOLDOUT_DIRECTORY` 解析只读目录，建立逐 case absolute allowlist，再在 callback-bound scope 内使用
holdout key 完成 AES-256-GCM 解密。relative-path escape、digest 覆盖不完整或 key 缺失都会在首个 Provider invocation 前
fail closed。

每个 `full_shards` matrix worker 下载同一 plan 后、启动 Backend ledger 前执行：

```text
node apps/agent-evaluation-runner/dist/cli.js freeze-config-commitment --plan <downloaded plan.json> --output <runner.temp>/g4-model-eval-frozen-config-commitment.json
```

producer 使用 canonical run-config artifact loader 验证下载的 `production-run-config.json` 与四项 GitHub artifact metadata，
再重算 `runConfigArtifactBinding`、`sourceConfigDigest`、`frozenRunDigest`、每个 locator digest、restricted manifest、
access policy 与 encrypted corpus commitment。它还要求 generated config、downloaded plan、repository commit、plan producer
identity 和 protected case denominator 逐字段相同。输出使用 exclusive create、mode `0600` 和无尾换行 canonical JSON；签名
payload 的运行身份固定为
`workflowName=g4-real-model-evaluation`、`workflowRunId`、`jobId=full_shards`，`committedAt` 等于 plan 的 `plannedAt`。
`workflowRunAttempt` 仅绑定 shard lease、worker owner 与 execution provenance；commitment schema 维持 plan + workflow-run 级身份。
Ed25519 对相同 payload 产生确定性签名，因此同一 run 的所有 matrix worker 必须得到 byte-for-byte 相同的 commitment；任一 worker
漂移都会在 ledger 启动前 fail closed。

GitHub failed-jobs rerun 会复用 plan job 已上传的 same-run frozen plan artifact。`full_shards` 的 attempt 2+ 重新执行 producer 时，
即使 `github.run_attempt` 已增加，仍会生成与 attempt 1 byte-for-byte 相同的 commitment。若 attempt 1 已封存 holdout closure，
Backend 会直接返回数据库中的 immutable closure，再继续新的 shard lease generation；该恢复路径不会解析 holdout material，也不会发起
Provider invocation。

workflow 注入下列 machine-derived public binding：

- `PRODIVIX_G4_MODEL_EVAL_REPOSITORY_ROOT=${GITHUB_WORKSPACE}`；
- `PRODIVIX_G4_MODEL_EVAL_FROZEN_CONFIG_COMMITMENT_PATH=<runner.temp>/g4-model-eval-frozen-config-commitment.json`；
- `PRODIVIX_G4_MODEL_EVAL_WORKFLOW_NAME=g4-real-model-evaluation` 与 `PRODIVIX_G4_MODEL_EVAL_WORKFLOW_RUN_ID` 固定 commitment
  provenance；`PRODIVIX_G4_MODEL_EVAL_WORKFLOW_RUN_ATTEMPT` 绑定本次 shard/worker provenance；
- Node signer 使用 `PRODIVIX_G4_MODEL_EVAL_JOB_ID=full_shards`，Go authority 使用
  `PRODIVIX_G4_MODEL_EVAL_WORKFLOW_JOB_ID=full_shards`；
- `PRODIVIX_G4_MODEL_EVAL_ENVIRONMENT_DIGEST`、`PRODIVIX_G4_MODEL_EVAL_ATTESTATION_AUTHORITY_ID`、
  `PRODIVIX_G4_MODEL_EVAL_ATTESTATION_KEY_ID` 与 `PRODIVIX_G4_MODEL_EVAL_ATTESTATION_PUBLIC_KEY`。

mask registration 与 producer step 取得 `PRODIVIX_G4_MODEL_EVAL_ATTESTATION_PRIVATE_KEY`。workflow 使用固定 tracked entrypoint
`node apps/agent-evaluation-runner/dist/productionOwnerAuthoritySidecarMain.js` 在 `127.0.0.1:8791` 启动 purpose-bound owner authority，
并等待 `/healthz` ready。新 plan 固定 `purpose=preplan`，只组合 probe、Provider resource、durable cleanup 与 runtime registration
四族 owner；full shard 固定 `purpose=full-attempt`，只组合 controlled Workspace、Verification evidence、Provider capability 与
attempt grading 四族 owner；full-attempt 的 Verification owner 还持有独立 G3 attestation signer callback。两者使用独立
owner-authority token、runner-temp state directory 与两组 raw canary JSON，且只接受与
固定 purpose 相符的请求；任一所属 production authority 缺失都会导致 startup/health failure。

Backend ledger step 取得 model-evaluation archive public trust registry、commitment path、repository/config binding、holdout directory、
两组 canary Secret 与独立 owner-authority token，并通过同一个 `PRODIVIX_G4_MODEL_EVAL_OWNER_AUTHORITY_PURPOSE` 精确期待相邻 8791 的
`preplan`/`full-attempt` health family。plan 路径先启动 8790 listener；full shard 先让 private-key-free 8792 Verification owner ready，
再启动 8790 listener。两条路径随后都从 authenticated
`/v1/evaluations/{namespace}/owner-activation/health` 取得 canonical `phase=bootstrap`、
`status=waiting-for-owner-authority` 与 null owner binding，并验证各自 instance-bound vault ready。bootstrap 期开放 controlled Workspace
direct、owner-state health、durable state-vault direct route 与 capability-effect Provider journal health。journal health 使用
`X-Prodivix-Capability-Effect-Provider-Journal-Purpose: capability-effect-provider-journal-owner`，并从
`/v1/evaluations/{namespace}/capability-effect-provider-runtime-journal/health` 取得 fresh、self-digested、owner-bound summary；启动前要求
residual/expired encrypted spool、unfinished owner 与 overdue unfinished owner count 全部为零。Hosted owner health 使用
`X-Prodivix-Hosted-Retrieval-Runtime-Resource-Purpose: hosted-retrieval-runtime-resource.preactivation-health.read`，从
`/v1/evaluations/{namespace}/hosted-retrieval-runtime-resource-owner-health` 读取 production owner 的 canonical fresh receipt，并要求
`unfinishedCleanupCount=0` 与 `overdueCount=0`；该 DB-only readiness 调用发生在 8791 启动前，不读取 Provider key，也不发起 Provider 调用。8791 ready 后，8790 原子固定其 exact
`healthDigest`，activation health
切换到 `phase=active`/`status=ready`，且 `/healthz` 返回 204；任务 dispatch 在 active 证据之后开始。plan/full shard 的 8790 durable
vault owner还独占 state-vault master key，以及 storage-only
`PRODIVIX_G4_MODEL_EVAL_NATIVE_PROVIDER_STATE_VAULT_OWNER_INSTANCE_ID`。plan instance 固定为
`${github.run_id}.${github.run_attempt}.plan`；full-shard instance 固定为
`${github.run_id}.${github.run_attempt}.${matrix.shard}`，replacement host 复用同一值。preplan/full-attempt 8791 取得对应的同一
state-vault owner instance id 与 ledger token，只用于 readiness health；state-vault master key 继续由 8790 独占，preplan CLI 与
`run-shard` 保持 owner-instance-free。capability-effect Provider journal 使用独立的非 secret
`PRODIVIX_G4_MODEL_EVAL_CAPABILITY_EFFECT_PROVIDER_JOURNAL_OWNER_INSTANCE_ID`：plan 固定为
`${github.run_id}.${github.run_attempt}.plan.provider-journal`，full shard 固定为
`${github.run_id}.${github.run_attempt}.${matrix.shard}.provider-journal`。相邻 8790/8791 与 recovery-only replacement 复用 exact 值；
preplan purpose 只读取 journal health，full-attempt purpose 开放 stage/execution/result/snapshot/cleanup/zero lifecycle，recovery-only purpose
只开放 health/snapshot/cleanup/zero。journal spool key 仍只进入 full-attempt 8791。model-evaluation archive private signing key 只进入 frozen-config commitment 与 final
export signer callback；G3 private signing key只进入 full-attempt 8791 的 G3 Evidence signer callback、mask registration 与 artifact
scan。full-shard mask step 从 G3 PKCS8 key 有界派生 public key，并与 key id、issuer、audience、subject、trust、policy generation 与
maximum lifetime 精确绑定。`127.0.0.1:8792` Backend Verification owner只取得该 public descriptor、独立 resume key 与
`PRODIVIX_G4_MODEL_EVAL_VERIFICATION_OWNER_TOKEN`；8790 保持 G3 attestation material 隔离。
workflow 将两组 canary合并，逐项执行
UTF-8 → unpadded Base64URL，去重并按 Unicode code point 排序，形成 canonical
`PRODIVIX_G4_MODEL_EVAL_PUBLIC_RESPONSE_CANARIES_BASE64URL`，且不写日志或文件。ledger 对 commitment 做 canonical decode、
digest/signature verification，再与数据库已 sealed 的 canonical whole-artifact bytes、artifact identity 和
`runConfigArtifactBinding` 做 exact join；tracked template 的权限限定为 preplan input。最后一个 shard只能在该 authority 通过后封存 holdout
closure；review lease 随后才能创建，finalize 只消费已经封存的数据库事实。

各 loopback authority 启动后分别将 numeric PID exclusive 写入 runner-temp regular file。ledger 与 full-shard Verification owner在
Secret 注入前通过 `go build -trimpath` 生成 job-unique runner-temp exact binary，startup 直接后台执行 binary，因此 PID 归属真实
listener process。plan 与 `full_shards` 的最终 `if: always()` cleanup 先读取 PID，同时核对 `/proc/<pid>/exe` 与 cmdline 的 exact production
identity。cleanup 先向 8791 owner sidecar 发送 TERM，并在 8790 ledger 保持在线时提供 120 秒 bounded drain。`preplan` retirement
只关闭 probe、Provider resource、Provider resource cleanup 与 runtime registration 四族，并完成 exact 四项 durable cleanup
receipt、result-ingress/ACK 与 zero-residual close；`full-attempt` retirement 只关闭 controlled Workspace、Verification evidence、
Provider capability 与 attempt grading 四族。
workflow 验证 canonical shutdown receipt 后，先按 frozen plan 的 canonical attempt 集合向仍在线的 8790 journal owner 提交
purpose-bound cleanup；POST acknowledgment 丢失时从 stored owner request 恢复，逐 attempt 验证 zero-residual receipt，最后再次读取 clean
owner health。partition route 固定为
`/v1/evaluations/{namespace}/{planDigest}/{repositoryCommit}/capability-effect-provider-runtime-journal`：cleanup 使用
`POST .../cleanup`，ACK recovery 使用 `GET .../owner-requests/{ownerRequestDigest}`，每个 attempt 的 terminus 使用
`GET .../attempts/{attemptId}/zero-residual`。随后由同一 8790 durable vault owner 对未进入 effect 的 sealed state 执行 bounded
cancel/expiry sweep，要求每个 opaque ref 都有 `consumed`、`cancelled` 或 `expired` retirement。workflow 通过 purpose-bound
`/v1/evaluations/{namespace}/native-provider-state-vault/health` 读取本 instance 的 canonical self-digested health，精确核对
`vaultOwnerInstanceId`、authority、`maximumRecords=5880`、`activeEncryptedRecordCount=0`、
`overdueActiveRecordCount=0`、`forcedExpiryTombstoneCount=0`、`sealedRecordCount=retiredRecordCount`，并要求 retired count 等于三种 disposition count 之和。
存储层在超过 expiry 30 秒后销毁仍未完成 lifecycle 的记录密钥并计入 forced-expiry tombstone；该计数大于零时 health 为 unavailable，当前 run 必须 requalify，不能合成 AI retirement receipt。
`checkedAt` 必须位于本地 verifier 当前时钟之前 30 秒以内，最多接受 5 秒未来时钟漂移；已重算 self-digest 的 stale/future health
同样被拒绝。
后台 1 秒 expiry sweep 只跨 instance 处理已到期 row；SIGTERM cancel sweep 与 health summary 都限定当前 instance，因此三个并发 shard
互不退休对方的 active state。owned 8790 PID file 缺失，或其中的 numeric PID 已退出时，cleanup 使用同一 job-unique ledger binary、
PostgreSQL、ledger token、vault key 与 `vaultOwnerInstanceId` 启动 bounded recovery-only 8790。recovery composition 将 8791 URL/token/
purpose、两组 protected canary 与 public-response canary 保持为空，只开放 authenticated recovery health、recovery、stored receipt 与
zero-residual routes。workflow 按 `health → POST recovery → stored receipt on ACK ambiguity → zero-residual receipt` 验证 exact frozen
plan/commit/namespace/owner/authority；receipt 和 zero-residual 都通过后才向 recovery PID 发送 TERM。PID authority 是 symlink、权限漂移、
non-numeric，或仍存活进程的 executable/cmdline identity 不匹配时，cleanup 直接失败并保留诊断 authority。

full shard 在 journal 与 vault 的 live/recovery zero-residual 成功后依次关闭 8792 Verification owner 与 8790 ledger；两者各提供 60 秒 bounded
wait，8790 始终最后关闭。owner retirement 失败时仍保留 bounded diagnosis，随后继续执行依赖逆序 cleanup。必要的 KILL 之前再次核对
PID identity，cleanup 只删除对应 runner-temp PID file。这样 shard、status、artifact scan 或 upload 任一步失败后，都会按
`8791 clean → journal per-attempt/owner zero → vault per-instance zero → 8792 → 8790` 收口。
plan 路径采用同一 verifier 与 recovery-only closure：8790 启动后要求
`${github.run_id}.${github.run_attempt}.plan` vault instance ready 与 `.plan.provider-journal` owner clean，preplan 8791 完成 15 项 runtime
owner readiness 与 clean retirement 后再次确认 journal clean health及 plan vault instance zero-residual，再关闭 8790。same-run plan replay
复用既有 artifact bytes，保持零新 vault/journal dispatch。recovery-only
Backend/DDL 已达到 `Configured / Evidence pending`；真实 PostgreSQL startup、wrong-key 与 ACK-loss 运行证据完成后才能升级为 `Passed`。

Sidecar 还取得 owner state directory 的唯一直接子文件
`PRODIVIX_G4_MODEL_EVAL_OWNER_AUTHORITY_SHUTDOWN_RECEIPT_PATH`。TERM drain 完成后，main 先等待 in-flight request，再要求固定
purpose 的四个 owner 产生 exact clean resource-retirement，最终以 exclusive create、mode `0600`、无尾换行 canonical JSON、file
fsync 与 POSIX parent-directory fsync 写入 `prodivix.agent-evaluation-owner-authority-shutdown` receipt。cleanup 要求 receipt 的
四个 `authorityImplementationDigests` 与启动 health 的 purpose family 完全相同，并精确绑定
`replayJournalImplementationDigest`、`startupHealthDigest`；`residualResourceIds` 的四组数组和 `residualCanaryIds` 都为空，据此重建
exact resource-retirement base 并重算
`resourceRetirementReceiptDigest`，再从 shutdown receipt 其余九个字段重算 `receiptDigest`；验证成功后删除 receipt。receipt
缺失、symlink、extra field、权限/shape/digest 漂移或任何 residual 都让 cleanup fail closed。

两个 OpenAI-compatible compatibility smoke 同样冻结 endpoint、endpoint id、immutable model version、bounded request
profile 与 runtime digest。hosted/local 分别解析固定 Secret slot；config 只保存 stable Secret reference。endpoint 禁止
userinfo、query、fragment 与 redirect，runtime digest 和 smoke behavior digest 共同形成 `smokeProfileDigest`。

正式 config 还分别冻结三个 native target 与两个 OpenAI-compatible target 的 provider/model/region pricing authority，以及下列
controlled runtime / human-review contract：

- `controlledRuntime.loop` 的 per-attempt ceiling 固定为最多 7 turns、4 tool calls、2 repair rounds，并分别绑定 tool-result
  byte ceilings、continuation timeout、`loopPolicyDigest` 与 aggregate `runtimePolicyDigest`；
- `responseSpoolEncryption` 固定 AES-256-GCM、12-byte nonce、16-byte authentication tag、16 MiB plaintext ceiling、
  key id/version/reference、AAD profile 与最多 24 小时 retention policy；key 只在 server callback 内解析，PostgreSQL 只保存
  ciphertext envelope 与 public receipt metadata；durable attempt commit 后生成 `consumed-and-destroyed` disposition，仍需恢复的
  spool 生成带 exact `retainedUntil` 的 `retained-encrypted` disposition；
- `capabilityProbeResponseSpoolEncryption` 使用独立 active-probe key reference 与独立 AAD/namespace，在执行新 preplan 时只由
  `127.0.0.1:8791` sidecar 的 probe transport callback 解析；same-run plan replay、smoke、full shard、review 与 finalize 均不取得
  该 secret；
- `nativeProviderStateVaultEncryption` 固定 server-side durable vault record、per-state data-key destruction、最多 125 秒 lifetime、
  30 秒 lifecycle ACK、request-digest idempotent reconciliation 与 deletion receipt policy；key 只由 plan/full shard 的
  `127.0.0.1:8790` durable vault owner 解析，plan 8790 使用独立 `.plan` instance 完成 runtime owner readiness；8791
  shared-effect owner 与 `run-shard` 通过 purpose-bound ledger client 完成
  seal/resolve/retire/lookup，且不取得 master key 或依赖 runner-temp local vault；
- `endpointSmokeResponseSpoolEncryption` 复用同一 callback-bound key 与加密上限，同时固定独立
  `prodivix.agent-evaluation-endpoint-smoke-result-spool-aad` profile；attempt 与 smoke 的 ciphertext authority 无法跨 family 重放；
- `humanReview.publicRubrics` 只接受 `reviewWorkflow` strict decoder 重建的 canonical `binary-pass-fail` public rubric；
- `reviewerTrustRegistryDigest` 与 `trustRegistry` 精确绑定 reviewer/adjudicator authority、role、validity、public Ed25519 key、
  independence policy 和 authority-set digest；
- `randomizedPresentationPolicyDigest` 同时绑定 grader plan、human-review config 与 blind bundle；
- `adjudicationPolicy` 固定 exact adjudicator key、minimum two independent ratings、unanimous consensus 与
  `reviewer-disagreement` trigger，并要求 reviewer rating 和 adjudicator decision 的 Ed25519 signatures。

Runner 只使用 frozen pricing snapshot 计算 actual cost；human-review validator 只使用 config trust root 验证 reviewer、issuer
与 adjudicator signature。以上 digest、authority、ceiling 或 policy 任一漂移都会产生新 plan 或 fail closed。

三个 native payload 固定选择 `evaluation.result.submit` 的同一 strict typed schema。Deterministic grader 的权威输入限定为
typed tool-call receipt 与 controlled runtime receipt。Production composition 注入 `AgentEvaluationControlledRuntime`，在
disposable workspace 内完成 content-addressed artifact 解析、typed proposal 校验、隔离执行和 G3 plan/closure 验证。
主观视觉候选只从 public、`subjectiveVisualQuality`、passed controlled PNG/WebP preview receipt 投影；protected case 无法进入
subjective bundle。Public candidate projection 只保留 blind candidate id、raster、rubric 与 presentation binding，并通过
exact-key decoder 排除 attempt/case/target/source/action/context refs。

### 1.6 Durable ledger service

Plan、smoke、每个 shard、status、review import 与 finalization 共享 Backend-owned evaluation ledger。每个需要 ledger 的 job
在 Secret 注入前使用 `GOPROXY=off go build -trimpath` 将 `apps/backend/cmd/agent-evaluation-ledger` 构建为 job-unique
runner-temp binary，再在 `127.0.0.1:8790` 直接启动该短期 service；database URL 只注入启动 step。每个启动把 numeric PID
exclusive 写入 mode `0600` regular file。smoke/export-review/finalize 直接要求 exact HTTP 204；plan/full shard 先读取 authenticated
canonical bootstrap activation health，随后在 exact 8791 health 被固定后要求 active activation health 与 HTTP 204。最终
`if: always()` cleanup 核对 `/proc/<pid>/exe`、
cmdline 与 exact binary，TERM 后 bounded 等待，必要时再次核对 identity 后 KILL，并只删除归属该 job 的 PID authority。
因此 plan、smoke、export-review、full shard 或 finalize 任一步失败都不会在 persistent runner 留下 8790 listener。service 执行
immutable fact、budget CAS、lease、checkpoint 与 exact attempt dedupe。runner 只通过固定
`PRODIVIX_G4_MODEL_EVAL_SERVICE_BASE_URL` 和 service token 调用 Backend API。

full shard 同时从 `apps/backend/cmd/server` 构建 job-unique `127.0.0.1:8792` binary。该 composition root 使用同一 protected
PostgreSQL、独立 artifact root/resume key/owner token，以及从 G3 signer 派生的 public trust descriptor；purpose-bound
`/api/internal/verification/agent-evaluation-owner/v1/health` exact ready 后才启动 8790。完整启动链固定为
`8792 ready → 8790 bootstrap + vault/journal/hosted-owner-health ready → 8791 full-attempt ready → 8790 active → run-shard`。8791 通过
`PRODIVIX_G4_MODEL_EVAL_VERIFICATION_OWNER_BASE_URL` 与 `PRODIVIX_G4_MODEL_EVAL_VERIFICATION_OWNER_TOKEN` 使用 create/upload/
prepare/final-commit/current-view direct chain。

PostgreSQL v45 为 current attempt authority 增加 stage/dispatch ACK/owner implementation、owner/specific/observation commit
links 与四个 publication roots。v46 以 additive migration 增加 Hosted lifecycle dispatch/claim/history、encrypted spool、
reconciliation、journal/archive/budget closure，以及 authority-attestation/evidence-root 两张 exact side-root 表；fresh publication
要求 `v45_eligible=true`、`v46_eligible=true` 与完整 46-family joins。v41→v46 migration 保留既有行的原始字节和 migration
registry；缺少新 authority 的历史 publication保持 `requalificationRequired`，current transition、commit、export、root 与
satisfied closure保持禁用。operator 为该 slice创建新的 attempt/evaluation，走完整 current authority 链；migration 保持
append-only，不生成 stage、ACK、observation、lifecycle 或 root 占位事实。

稳定 namespace 为：

```text
g4-<evaluation_id>-<exact commit first 12 hex>
```

`evaluation_id` 为空时使用 `g4-<exact commit>`。同一 plan 的 rerun/resume 继续使用相同 evaluation id 与 commit；config、
threshold、grader、corpus、holdout 或 budget 变化产生新 plan digest 与新的 evaluation id。

## 2. Workflow modes

### 2.1 `evaluate` + `smoke`

执行链：

```text
preflight -> plan -> bounded five-endpoint smoke -> sanitized smoke artifact
```

Preflight 证明 exact 40-character commit、clean checkout、tracked qualification template、显式 enable 和正数 hard ceilings。
preplan contract 固定 4 resource registrations → 15 runtime registrations → 18 probes → 4 durable cleanups 的 41 项
authority operation 顺序。默认 shared-effect owner composition 与 15 项 runtime readiness 已实现；preplan 在任一
identity/health/reconcile失败时按 fail-closed停止，并只在全部 authority完成后冻结 production config、plan 与 shard schedule。
smoke 绑定同一 generated config、plan、namespace 与 budget ledger，依次验证三个 native
endpoint、hosted OpenAI-compatible adapter profile 和 controlled local OpenAI-compatible endpoint；每个 target 恰好一个
bounded minimal request，receipt 进入 durable ledger，public artifact 只包含 sanitized receipt export。

Dispatch `budget_caps` 与 schedule variable 使用同一 strict JSON shape：

```json
{
  "maxCostUsd": "250.00",
  "maxLogicalTokens": "5000000000",
  "maxElapsedMinutes": "1440"
}
```

Smoke terminal success 表示 credential、endpoint、stream、schema、response identity 与 exact terminal marker 通过 admission。
该结果不签发 `release-evaluated` qualification，G4 继续保持 `Evidence pending`。

### 2.2 `evaluate` + `full`

Full mode 在 smoke success 后读取 frozen `shards.json`，最多接受 64 个唯一 shard id，并以 `max-parallel: 3` 运行：

当前 canonical release plan 的完整 denominator 为 14,040 journeys；ADR 69 的 11,640 是规范性最低线。预算、分片、
Provider quota、elapsed-time ceiling 与人审容量均按 plan 中的 14,040 计算，运行时不得缩回最低线。

Hosted runtime resource lifecycle先由 singleton `hosted_prepare` 创建 exact four，再由所有 full shards只读复用；
`hosted_cleanup` 在 shard terminal后执行 durable exact-four cleanup，`hosted_recovery` 随后扫描并收口 lifecycle unfinished
与 partial-create known-resource candidate。prepare/cleanup listener startup要求 `unfinishedMutationCount=0` 与
`overdueMutationCount=0`；recovery startup允许发现待恢复记录。cleanup/recovery terminal artifact均要求
`activeResourceCount=0`、`activeReadLeaseCount=0`、`unfinishedCleanupCount=0`、`overdueCount=0`，recovery 还要求
`nextCursor=null`。null-prior recovery先保存 `post-dispatch-unknown` conservative receipt，再执行绑定该 digest 的只读
reconciliation；known-prior使用 recovery-read。可信结果缺失时请求返回失败并保留 durable unfinished，供后续 recovery继续处理。

```text
node apps/agent-evaluation-runner/dist/cli.js preplan --config <tracked qualification template> --output production-run-config.json
node apps/agent-evaluation-runner/dist/cli.js plan --config production-run-config.json --output plan.json --shards-output shards.json
node apps/agent-evaluation-runner/dist/cli.js smoke --config production-run-config.json --plan plan.json --output smoke-receipts.json
node apps/agent-evaluation-runner/dist/cli.js freeze-config-commitment --plan plan.json --output <runner.temp>/g4-model-eval-frozen-config-commitment.json
node apps/agent-evaluation-runner/dist/cli.js run-shard --plan plan.json --shard <frozen shard id>
node apps/agent-evaluation-runner/dist/cli.js status --plan plan.json --shard <frozen shard id> --output status.json
node apps/agent-evaluation-runner/dist/cli.js export-review --plan plan.json --output blind-review.json
```

全部 shard 共享 namespace 与 plan-bound aggregate budget。每次调用先在 Backend ledger 原子 reserve，再执行 transport，最后
以 actual usage/cost settle。timeout、rate limit、schema failure、blocked output 与 infrastructure failure 都保留 immutable
attempt 和 denominator；rerun 通过 exact dedupe 恢复。

`fail-fast` 保持关闭，每个 shard 上传独立 sanitized status。只有全部 frozen shard terminal success 时，`export_review` 才
生成 reviewer artifact。任何 shard failure 都会保留诊断 artifact，并让 blind review handoff 保持 blocked。

### 2.3 Reviewer-only blind bundle

Evaluation full run 的 reviewer-facing artifact 根目录只包含 `blind-review.json`，保留 30 天。当前 release plan 最多导出
18 个 public subjective visual candidate，canonical bundle 上限为 64 MiB；producer、human-review workflow 与 strict decoder
共同执行该边界。该 bundle 限定为：

- blind candidate id；
- bounded PNG/WebP raster bytes、media type、width、height、byte length 与 digest；
- public rubric definition/digest，包括 required criteria、binary scale anchors、accessibility instructions、
  `metricMappings` 与独立 inter-rater-disagreement metric id；
- randomized presentation policy、blinded set、plan 与 bundle integrity digest。

Reviewer-facing artifact 不含 `plan.json`、`status.json`、attempt id、provider/model identity、候选与 attempt mapping、protected
holdout body/fingerprint、prompt、private reasoning、raw tool output、Secret 或 production data。Blind mapping 只保留在
Backend-owned durable authority 内。

### 2.4 外部 review 与受控 inbox

两个独立 reviewer 各自对全部 sampled subjective candidate 使用 frozen rubric，且每个 candidate 至少形成两份 signed blind
rating。每份 rating 引用 `blindCandidateId + rubricDigest`，并使用 frozen trust registry 中对应 reviewer authority 的
Ed25519 key 签名。rating 内的 `criterionVerdicts` 按 rubric required criterion id 的 canonical 顺序完整列出，
每项只接受 `passed | failed`；签名 payload 同时覆盖 blind set、rubric、criterion verdicts 与 overall verdict。
overall verdict 由全部 required criterion 通过时确定为 `passed`。reviewer 同时提交 plan-bound independence attestation。

当两份 rating 产生冻结 policy 定义的 disagreement 时，独立 adjudicator 签署 decision。Adjudicator authority 与 reviewer
authority、model owner、evaluation operator 和 production approver 分离；decision 同样签署 exact ordered
`criterionVerdicts`，并绑定 blind candidate、rubric、blind set 与 rating digest set。一致结果直接保留 unanimous
criterion authority。

Finalizer 以“一个 reviewed candidate × 一个 mapped metric”为统计单位。`metricMappings` 使用 frozen `all-pass`
aggregation 投影三个质量 metric；inter-rater-disagreement 在每个 required criterion 的原始 reviewer verdict 集合都只有一个值时
为 `passed`，任一 criterion 出现分歧时为 `failed`。Reviewer 数量与 model repetition 不会扩张该 denominator。

外部/受控 review intake 将两个 fixed canonical JSON 写入：

```text
/srv/prodivix/g4-human-review-inbox/<opaque-submission-id>/
  human-review-submission.json
  independence-registry.json
```

`human-review-submission.json` 保存 signed ratings、必要的 signed adjudication decision、blind/source binding 与 inbox source
provenance。`independence-registry.json` 只保存 plan-bound attestations 和 issuer proofs；plan-independent trusted key、authority
与 policy 始终来自 source plan artifact 中的 generated production config。两个文件都使用 exact canonical bytes，submission
directory 只含这两个 root files。

Workflow input 只接受 opaque `submission_id`，不接受任意 inbox path 或 inline review JSON。protected job 先证明 fixed mount、
submission directory 和两个 files 都是 bounded non-symlink regular files，再通过 no-follow descriptor 将 exact bytes 放入
`runner.temp`。目录逃逸、symlink、额外 file、缺文件或 copy 期间变化都会 fail closed。

### 2.5 独立 `g4-real-model-human-review.yml`

完成外部 review 后，operator dispatch human-review producer，并提供：

- `repository_commit`；
- `source_evaluation_run_id` 与 `source_evaluation_run_attempt`；
- `source_plan_run_attempt`；
- `source_plan_artifact_name` 与 GitHub API 返回的 exact `sha256:<64 lowercase hex>` digest；
- `source_blind_artifact_name` 与 GitHub API 返回的 exact `sha256:<64 lowercase hex>` digest；
- opaque `submission_id`。

GitHub-hosted preflight 不接触 Secret，只验证 exact clean commit、source workflow path、evaluation attempt、plan producer
attempt、terminal success 与两份 artifact 的 name/digest。protected `publish` job 固定使用
`g4-real-model-human-review` runner pool 和 Environment；source blind artifact 必须只含 root `blind-review.json`，source plan
artifact 提供 exact `production-run-config.json` 与 `plan.json`。

第九个 server-only CLI command 的固定接线为：

```text
node apps/agent-evaluation-runner/dist/cli.js validate-review \
  --review-bundle <runner.temp>/g4-blind-review-source/blind-review.json \
  --submission-id <opaque identity> \
  --inbox-root <runner.temp>/g4-human-review-inbox \
  --source-run-id <digits> \
  --source-run-attempt <positive integer> \
  --source-artifact-name <safe identity> \
  --source-artifact-digest sha256:<64 lowercase hex> \
  --config <downloaded production-run-config.json> \
  --output <runner.temp>/g4-human-review-output/human-review.json
```

CLI 从固定 `<inbox-root>/<submission-id>/human-review-submission.json` 与 `independence-registry.json` 读取 canonical bytes，验证
source artifact provenance、plan digest、blind set、rubric、reviewer signatures、issuer proofs、role separation、minimum two
independent ratings、exact criterion coverage、metric mapping 和 disagreement adjudication policy。它使用
`PRODIVIX_G4_MODEL_EVAL_HUMAN_REVIEW_PRIVATE_KEY` 生成 final signed wrapper。输出 artifact 根目录固定只含
`human-review.json`，保留 90 天，并记录 GitHub artifact digest。

Workflow 与 runbook 可以先于 CLI production composition 部署；`validate-review` command、strict decoder 或 signer 缺失时，
producer 保持 terminal failure，且没有 artifact upload fallback。Environment 在 targeted CLI gate 通过前保持禁用。

### 2.6 `finalize`

Finalize 是独立 evaluation `workflow_dispatch`。Operator 提供同一 exact `repository_commit`、`evaluation_id` 与 tracked
qualification template path，并提供 strict `finalize_sources` JSON；production config 仍从被绑定的 source plan artifact 读取：

```json
{
  "deterministicRunId": "123456700",
  "deterministicRunAttempt": "1",
  "deterministicArtifactName": "g4-v9-deterministic-closure-<commit>-1",
  "deterministicArtifactDigest": "sha256:<64 lowercase hex>",
  "evaluationRunId": "123456789",
  "evaluationRunAttempt": "2",
  "planArtifactRunAttempt": "1",
  "planArtifactName": "g4-real-model-plan-<commit>-<evaluation-id>-1",
  "planArtifactDigest": "sha256:<64 lowercase hex>",
  "planDigest": "sha256-<64 lowercase hex>",
  "reviewRunId": "123456999",
  "reviewRunAttempt": "1",
  "reviewArtifactName": "g4-real-model-human-review-<commit>-<submission-id>-1",
  "reviewArtifactDigest": "sha256:<64 lowercase hex>"
}
```

Final job 固定使用 evaluation protected Environment，并且只为该 job 增加 `actions:read`、`id-token:write` 与
`attestations:write`。它执行：

```text
node apps/agent-evaluation-runner/dist/cli.js import-review --plan plan.json --input human-review.json
node apps/agent-evaluation-runner/dist/cli.js finalize --plan plan.json --output manifest.json
node apps/agent-evaluation-runner/dist/cli.js export-evidence --plan plan.json --manifest manifest.json --archive-output evidence-archive --root-output evidence-root.json
```

Workflow 通过 GitHub API 精确验证三个 source run 的 repository、workflow path、run attempt、event、`head_sha`、terminal
success 和 artifact name/digest。Evaluation source 固定为 `.github/workflows/g4-real-model-evaluation.yml`；deterministic
source 固定为 `.github/workflows/g4-v9-golden-closure.yml`；review source 固定为
`.github/workflows/g4-real-model-human-review.yml`。Review run 还必须包含 terminal-success job
`Validate and publish signed human review`，使用四个 exact self-hosted labels；exact-commit workflow source 必须把该 job 绑定
`g4-real-model-human-review` Environment。`human-review.json` 的 signed wrapper 继续绑定相同 run id/attempt/workflow name。

Runner decoder 验证 review signature/independence、rubric/adjudication identity、完整 denominator、holdout receipt、actual
usage/cost、metric/grader/human report 与 expiry。任一 run/attempt/path/job/environment/artifact/digest/plan binding 漂移都会
fail closed。

`export-evidence` 使用 Environment Ed25519 private key 签署 attested payload。Workflow 从 public key/key id 构造 external
trust registry，并运行 strict model-eval verifier。随后 final job 将 signed archive/root 与 exact deterministic manifest 交给
`assemble:g4:closure:evidence`，并立即运行 `verify:g4:golden:evidence`。最终 artifact 包含固定
`evidence-archive/evidence-index.json`、内容寻址的 `evidence-archive/shards/*.ndjson`、`evidence-root.json`、
`manifest.json` 和 satisfied `g4-closure.json`。

启用 `PRODIVIX_G4_MODEL_EVAL_PUBLISH_GITHUB_ATTESTATION=1` 时，final job 通过 pinned
`actions/attest-build-provenance` 为 evidence files 发布额外 GitHub provenance。项目 Ed25519 signature 与 strict verifier
始终承担核心 authority。

## 3. Approval checklist

Evaluation Environment reviewer 批准 `evaluate` 前确认：

- exact commit 位于预期 release lineage，workflow 将重新证明 clean checkout；
- config、provider operator、model-family owner、required profiles、rubric 与 human trust registry 已评审；
- cost、logical tokens 与 elapsed minutes 都是明确正数 hard ceiling；
- budget 覆盖 media、tool、compute、storage 与 human capacity；
- provider quota、region/data residency、retention、egress 与 endpoint identity 符合 frozen policy；
- protected holdout、Backend ledger、isolated disposable Workspace 和 evaluation-only approval actor 可用；
- 两个 reviewer 与必要 adjudicator 已预留独立 capacity。

Human-review Environment reviewer 批准 `publish` 前确认：

- source run/attempt、blind artifact name/digest 与 exact commit 一致；
- opaque submission directory 由 controlled intake 创建且 mount 为 read-only；
- reviewer A/B 独立，signature authority 在 frozen trust registry 中；
- disagreement 已取得独立 adjudicator signed decision；
- human-review private key 与 config adjudication authority 精确对应。

达到任一 evaluation ceiling 后，runner 记录 `budget-exhausted` 并保持 manifest `incomplete`。扩大 budget、删减 corpus/
repetition/tier 或调整 threshold 都产生新 plan。

## 4. Artifact、digest 与 retention

| Artifact                            | Retention | 内容与用途                                              |
| ----------------------------------- | --------- | ------------------------------------------------------- |
| frozen plan / shards                | 90 days   | exact plan、shard schedule、resume/finalize input       |
| bounded five-endpoint smoke receipt | 14 days   | native + compatible adapter admission                   |
| per-shard sanitized status          | 30 days   | checkpoint/denominator troubleshooting                  |
| reviewer-only blind bundle          | 30 days   | `blind-review.json`；无 plan/attempt/provider/model map |
| signed human review                 | 90 days   | `human-review.json`；role-separated review authority    |
| project-signed final evidence       | 90 days   | strict model-eval verifier 与 Closure input             |

每次 `upload-artifact` 的 SHA-256 output 写入 job summary。跨-run operator 使用 GitHub API 的 `sha256:<hex>` digest，并在
dispatch input 中逐个固定。`download-artifact` 验证传输完整性；runner 继续验证 canonical digest、plan binding 与 immutable
ledger facts。Artifact 只上传指定 sanitized root file/directory。

## 5. Evidence promotion

- production composition、local contract Gates、v46 46-family/capacity verifier：`Implemented / Local Passed`；
- Workflow、Environment 与 runner pool 已配置：`Configured / Evidence pending`；
- 本机缺少 `actionlint` 可执行文件；workflow formatting、trigger closure 与 local verifier已通过，actionlint 与 remote
  workflow execution继续为 `Evidence pending`；
- smoke terminal success：对应 endpoint admission evidence；
- full shards terminal success、blind review 待完成：model evaluation `incomplete` / Evidence pending；
- signed human-review artifact：review authority ready，Evidence pending；
- signed archive verifier terminal success：real-model qualification evidence 可进入 exact-commit Closure assembly；
- `verify:g4`、`verify:g4:model-eval`、`verify:g4:golden` 与 `verify:g4:closure` 全部 terminal success，artifact 可读取且
  decoder 通过：满足 Global G4 status promotion 条件。

Workflow run、queued job、artifact upload 与 GitHub provenance 各自证明其覆盖范围。`current-status.md` 与
`g4-closure-evidence.md` 由 Closure owner 在取得真实 terminal evidence 后统一更新。

## 6. Stop / recovery rules

- Credential、service token、database URL、signing key、Secret canary 或 holdout canary 出现在 log/artifact 时，立即撤销
  credential、隔离 artifact、保留 incident identity，并创建修复后的新 evidence lineage；
- endpoint、operator、model、prompt、Context builder、transform、tool/action registry、Policy、grader、rubric 或 corpus drift
  时，受影响 slice 标记 `expired`，按 planner 计算的最小 slice 重跑；
- quota、timeout、rate limit、worker loss 或 network failure 保留原 attempt，resume 使用相同 evaluation id/commit/plan；
- artifact 缺失、source run/attempt/path/job/environment 不一致、digest/plan mismatch、review independence 不足或 signature
  trust failure 时，review publish/finalize 均 fail closed；
- inbox path escape、symlink、额外 file、noncanonical bytes、blind-set mismatch 或 role overlap 时，submission 保持 quarantined；
- holdout body/fingerprint 进入 public artifact 时，qualification 保持 blocked，并轮换 corpus/key/canary；
- state-vault recovery health、durable receipt、zero-residual receipt、same-key unwrap 或 PID identity 任一验证失败时，cleanup 以失败状态结束，
  qualification 保持 blocked，并保留同一 owner/partition 的恢复 authority；
- Global budget 无法由 Backend 原子限制时，远端 Provider 调用保持禁用，deterministic G4 gates 可继续运行。
