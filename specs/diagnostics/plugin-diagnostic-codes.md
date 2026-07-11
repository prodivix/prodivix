# Plugin Diagnostics 编码规范（PLG）

## 状态

- Draft-Frozen
- 日期：2026-07-10
- 阶段：Plugin Host Phase 2-4
- 关联：
  - `specs/diagnostics/README.md`
  - `specs/decisions/29.plugin-extension-points.md`
  - `specs/implementation/plugin-host-foundation.md`
  - `specs/implementation/plugin-host-core-phase2.md`
  - `specs/plugins/plugin-manifest-v1.schema.json`

## 1. 目的

统一 Plugin Manifest、contribution descriptor、Capability policy、Host registry、runtime lifecycle 与 cleanup 的稳定错误码。`PLG-xxxx` 诊断由 `@prodivix/plugin-contracts` 定义，由 `@prodivix/plugin-contracts` 与 `@prodivix/plugin-host` 产生，可直接进入 Issues、安装审核、日志和文档排障链路。

## 2. 编码分段

1. `PLG-10xx`：输入 bytes、严格 JSON、JSON value guard、Schema 和资源上限。
2. `PLG-20xx`：SemVer、宿主兼容性、能力声明、激活引用和资源可移植性。
3. `PLG-30xx`：Capability policy、permission snapshot、contribution contract 与 registry transaction。
4. `PLG-40xx`：Host 状态、runtime artifact、lifecycle、cleanup、audit、subscriber isolation 与后续 Browser transport。

## 3. 码位

### `PLG-1001` Manifest 源不是严格 UTF-8 JSON

- Severity: `error`
- Stage: `parse`
- Retryable: false
- Trigger: Manifest 含无效 UTF-8、BOM、注释、尾逗号、语法错误或无法安全解析的 JSON 文本
- User action: 使用无 BOM 的 UTF-8 编码，并移除注释、尾逗号和非标准 JSON 语法
- Developer notes: 签名、hash、解析和校验必须消费解析器返回的同一份 `sourceBytes`

### `PLG-1002` Manifest 包含重复对象键

- Severity: `error`
- Stage: `parse`
- Retryable: false
- Trigger: 同一 JSON object 中出现两个或更多同名 property
- User action: 每个 object property 只保留一个明确值
- Developer notes: 不允许依赖 JSON parser 的 last-value-wins 行为；诊断必须包含重复字段的 JSON Pointer

### `PLG-1003` 程序化输入不是 JSON value

- Severity: `error`
- Stage: `schema`
- Retryable: false
- Trigger: 程序化 Manifest 含 `undefined`、函数、symbol、BigInt、非有限 number、cycle、非普通对象、getter 或稀疏数组
- User action: 仅传入 JSON primitive、普通 data object 和稠密 array
- Developer notes: 不要通过 `JSON.stringify` 静默删除非法值；先运行递归 JSON value guard

### `PLG-1004` Manifest 不符合 v1 Schema

- Severity: `error`
- Stage: `schema`
- Retryable: false
- Trigger: Manifest 字段、类型、枚举、格式、必填项或封闭对象规则不符合 Plugin Manifest v1 Schema
- User action: 按诊断中的 Manifest path 修正对应字段
- Developer notes: 断言稳定的 code、JSON Pointer 和 Schema keyword，不断言 Ajv 完整自然语言消息

### `PLG-1005` Manifest 超出资源上限

- Severity: `error`
- Stage: `parse`
- Retryable: false
- Trigger: Manifest byte size、JSON depth 或 JSON node count 超过宿主配置上限
- User action: 缩小 Manifest，并把大型 contribution descriptor 移到独立资源文件
- Developer notes: 必须在进入扩展点 resolver 和插件运行时前执行资源限制

### `PLG-1010` Contribution 资源读取失败

- Severity: `error`
- Stage: `parse`
- Retryable: true
- Trigger: package reader 无法在受限 package root 内读取 contribution resource
- User action: 检查资源路径、包内容和安装源可用性后重试
- Developer notes: reader 必须继续限制 path containment；诊断不得暴露绝对路径或底层存储 handle

### `PLG-1011` Contribution 资源不是严格 JSON

- Severity: `error`
- Stage: `parse`
- Retryable: false
- Trigger: contribution resource 含 BOM、无效 UTF-8、注释、尾逗号、重复键或其他非严格 JSON 内容
- User action: 将 descriptor 改为无 BOM 的严格 UTF-8 JSON，并移除重复对象键
- Developer notes: resource descriptor 与 Manifest 复用 `parseStrictJsonDocument`，但使用独立 contribution 诊断码和 document path

### `PLG-1012` Contribution 资源完整性不匹配

- Severity: `error`
- Stage: `schema`
- Retryable: false
- Trigger: resource bytes 的 SHA-256 digest 与 Manifest 声明的 integrity 不一致，或宿主无法完成完整性校验
- User action: 恢复可信资源内容，或使用重新签发且匹配实际 bytes 的完整性元数据
- Developer notes: integrity 在 JSON 解析和 resolver 之前校验，不允许对失败资源做降级加载

### `PLG-1013` Contribution contract 不受支持

- Severity: `error`
- Stage: `schema`
- Retryable: false
- Trigger: Host 未注册 Manifest 声明的 exact contribution point 与 contract version
- User action: 使用当前宿主支持的 point/version，或安装提供该 contract 的宿主版本
- Developer notes: lookup 必须 exact match，不做 latest、minor fallback 或隐式 converter

### `PLG-1014` Contribution descriptor 不符合 contract

- Severity: `error`
- Stage: `schema`
- Retryable: false
- Trigger: inline 或 resource descriptor 未通过 point-specific contract validator
- User action: 按 contribution contract 修正 descriptor 字段和值
- Developer notes: validator 只校验 descriptor shape；Host resolver 与业务 identity 冲突使用独立 registry 诊断

### `PLG-1015` Contribution 资源超出上限

- Severity: `error`
- Stage: `parse`
- Retryable: false
- Trigger: 单资源 bytes、单插件资源数、总 bytes、descriptor depth 或 node count 超过 Host 限制
- User action: 拆分或缩小 descriptor，并移除不必要的资源数据
- Developer notes: package reader 限额和 Host 收到 bytes 后的二次限额都必须保留

### `PLG-2001` 插件版本不是有效 SemVer

- Severity: `error`
- Stage: `semantic`
- Retryable: false
- Trigger: `version` 通过基础字符串格式后仍无法被严格 SemVer parser 接受
- User action: 使用完整且规范的 SemVer 版本，例如 `1.2.3`
- Developer notes: 不使用正则表达式替代 SemVer parser

### `PLG-2002` Prodivix engine range 无效

- Severity: `error`
- Stage: `semantic`
- Retryable: false
- Trigger: `engines.prodivix` 不是有效 SemVer range
- User action: 使用有效范围，例如 `>=0.1.0 <1.0.0`
- Developer notes: range 校验和宿主兼容判断必须使用同一 SemVer 实现

### `PLG-2003` 当前宿主版本不兼容

- Severity: `error`
- Stage: `semantic`
- Retryable: false
- Trigger: 当前 Prodivix host version 不满足 `engines.prodivix`
- User action: 安装兼容的插件版本，或升级 Prodivix
- Developer notes: 只有宿主传入 `hostVersion` 时执行兼容性判断

### `PLG-2004` Publisher 与插件 scope 不一致

- Severity: `error`
- Stage: `semantic`
- Retryable: false
- Trigger: scoped plugin id 的 npm scope 与 `publisher` 不相同
- User action: 让 `publisher` 与插件 id 中的 scope 保持一致
- Developer notes: 该校验只证明声明一致性，不替代包签名与市场发布者验证

### `PLG-2010` Capability 重复声明

- Severity: `error`
- Stage: `semantic`
- Retryable: false
- Trigger: `capabilities` 中重复出现相同的 `(id, scope)`
- User action: 合并重复请求，只保留一个 reason 和 optional 决策
- Developer notes: 无 scope capability 使用空 scope 参与唯一性判断

### `PLG-2011` Contribution id 重复

- Severity: `error`
- Stage: `semantic`
- Retryable: false
- Trigger: 插件内多个 contribution 使用同一个 local id
- User action: 为每个 contribution 分配唯一 local id
- Developer notes: 稳定 identity 是 `<pluginId>/<contributionId>`，禁止静默覆盖

### `PLG-2012` Contribution 缺少注册能力

- Severity: `error`
- Stage: `semantic`
- Retryable: false
- Trigger: contribution 没有对应的 `extension.register` capability，或 capability scope 与 contribution point 不一致
- User action: 为该 contribution point 请求对应注册能力并说明 reason
- Developer notes: Manifest 只声明请求；最终 grant 仍由宿主策略决定

### `PLG-2013` Activation 引用无效

- Severity: `error`
- Stage: `semantic`
- Retryable: false
- Trigger: `contribution.use` 未引用同 point 的已声明 contribution，或宿主提供的 command catalog 中不存在 command id
- User action: 修正 contribution point、contribution id 或 command id
- Developer notes: command id 只有在 validator 收到 `knownCommandIds` 时校验，禁止从 contribution local id 猜测全局 command identity

### `PLG-2014` Activation 缺少 runtime entrypoint

- Severity: `error`
- Stage: `semantic`
- Retryable: false
- Trigger: Manifest 声明一个或多个 activation event，但没有 `entrypoints.runtime`
- User action: 声明 runtime module，或删除不需要的 activation event
- Developer notes: 纯声明型插件可以没有 runtime，但不能声明运行时激活条件

### `PLG-2015` 资源路径不可移植或发生冲突

- Severity: `error`
- Stage: `semantic`
- Retryable: false
- Trigger: 路径包含 Windows 保留设备名、尾随点空格，或多个路径在大小写不敏感文件系统上冲突
- User action: 使用唯一、规范且以 `./` 开头的包内相对路径
- Developer notes: 校验 icon、runtime、UI entrypoint 和 resource contribution 的统一路径集合

### `PLG-2016` UI entrypoint id 重复

- Severity: `error`
- Stage: `semantic`
- Retryable: false
- Trigger: `entrypoints.ui` 中多个入口使用同一个 local id
- User action: 为每个隔离 UI surface 分配唯一 id
- Developer notes: UI entrypoint id 在单个插件内唯一，不依赖路径是否不同

### `PLG-2020` Contribution 跨点引用无效

- Severity: `error`
- Stage: `semantic`
- Retryable: false
- Trigger: External Library、Palette、Blueprint Template、Render Policy、Codegen Policy 或 Icon Provider 引用了未声明的 library、Palette item、runtime type、package、export 或不兼容的 host implementation identity
- User action: 让同一插件批次中的扩展点引用精确匹配的 library、Palette item、runtime type、package coordinate、export 和 implementation id
- Developer notes: 批次语义校验必须在所有 point-specific Schema 通过后、任何 resolver prepare 或 implementation bind 前执行

### `PLG-2021` Contribution library owner 不一致

- Severity: `error`
- Stage: `semantic`
- Retryable: false
- Trigger: Render Policy、Codegen Policy、Icon Provider 或外部 Palette group 引用了不属于当前插件 owner 的 External Library
- User action: 在同一插件 package 中声明被引用的 External Library，或移除跨 owner 引用
- Developer notes: official 与 community package 都不能借用另一 owner 的 library identity 绕过生命周期和 cleanup

### `PLG-3001` Required capability 被拒绝

- Severity: `error`
- Stage: `permission`
- Retryable: false
- Trigger: effective PermissionSnapshot 中至少一个 required capability 为 deny
- User action: 授予所需能力，或保持插件为 blocked/disabled
- Developer notes: 这是正常策略结果，availability 进入 `blocked`，不得误记为 Host `failed`

### `PLG-3002` Capability policy 解析失败

- Severity: `error`
- Stage: `permission`
- Retryable: true
- Trigger: policy adapter 抛错、返回错误 owner/revision、漏判请求、改变 optional 语义或尝试授权未请求 capability
- User action: 恢复权限策略来源并重新解析授权
- Developer notes: Host 必须验证完整 `(id, scope)`、owner 与单调 permission revision，禁止 overgrant

### `PLG-3010` Contribution identity 冲突

- Severity: `error`
- Stage: `registry`
- Retryable: false
- Trigger: 同一 stable `<pluginId>/<contributionId>` 被重复 stage 或与已提交 record 冲突
- User action: 为 contribution 使用唯一 local id，并重新执行完整注册事务
- Developer notes: point 不同也不能复用同一 stable identity；禁止 last-write-wins

### `PLG-3011` Registry transaction revision 冲突

- Severity: `error`
- Stage: `registry`
- Retryable: true
- Trigger: commit 时 registry revision 或 permission revision 已不同于 transaction 捕获值
- User action: 读取最新 Host snapshot，并重新 prepare 和提交完整 transaction
- Developer notes: 不做隐式 merge；失败 transaction 必须 rollback 所有 staged disposable

### `PLG-3012` Contribution resolver 失败

- Severity: `error`
- Stage: `registry`
- Retryable: false
- Trigger: Host-side resolver 抛错、产生非法 lifetime/order，或依赖未请求或未授权 capability
- User action: 修复 Host contribution adapter 或 descriptor 后重新验证插件
- Developer notes: resolver 是受信任 Host adapter，不允许插件绕过 contract validator 直接提交 resolved value

### `PLG-3013` Plugin owner generation 已过期

- Severity: `error`
- Stage: `registry`
- Retryable: true
- Trigger: transaction、registration 或 cleanup 使用的 installation/generation 已不是当前 owner
- User action: 丢弃旧异步结果，并基于当前 generation 重新开始操作
- Developer notes: 旧 generation 只能清理自己的 lease，不能按 plugin id 宽泛删除新资源

### `PLG-3014` Contribution contract 配置冲突

- Severity: `error`
- Stage: `registry`
- Retryable: false
- Trigger: composition root 重复注册相同 contribution point 与 contract version
- User action: 保留唯一 contract owner 后重新创建 Plugin Host
- Developer notes: contract registry 在 Host 创建阶段冻结，插件不能动态替换 validator 或 resolver

### `PLG-4001` Plugin Host 状态转换非法

- Severity: `error`
- Stage: `runtime`
- Retryable: false
- Trigger: 对未发现、非 ready、无 runtime、已 rollback 或其他不允许状态执行 lifecycle/transaction 操作
- User action: 读取当前 Host snapshot，并使用该状态允许的命令
- Developer notes: availability 与 runtime 是独立状态轴，校验不得重新合并成单轴 active 状态

### `PLG-4002` Runtime activation 失败

- Severity: `error`
- Stage: `runtime`
- Retryable: true
- Trigger: runtime adapter 返回失败、抛错，或 Host 无法建立 termination listener
- User action: 检查 runtime diagnostics，修复后使用显式 retry
- Developer notes: activation transaction 必须 rollback，partial session 与 activation lease 不得残留

### `PLG-4003` Runtime 操作超时

- Severity: `error`
- Stage: `runtime`
- Retryable: true
- Trigger: activation 或 deactivation 超过 Host 配置的时间上限
- User action: 重试操作，或禁用持续无响应的插件
- Developer notes: timeout 后 abort 当前 operation；迟到成功的 session 只能自行 deactivate，不能 commit

### `PLG-4004` Owner cleanup 不完整

- Severity: `error`
- Stage: `cleanup`
- Retryable: true
- Trigger: runtime deactivation、subscription dispose、transaction rollback 或 contribution owner cleanup 失败
- User action: 重试 cleanup，并在移除或重新启用插件前确认 lease 已清零
- Developer notes: 一个 dispose 失败不能中断剩余资源清理，也不能把已移除 record 放回 registry

### `PLG-4005` Runtime transport 意外终止

- Severity: `error`
- Stage: `runtime`
- Retryable: true
- Trigger: 当前 runtime session 的 Worker、iframe 或其他 transport 非预期结束
- User action: 检查 termination reason，再显式重试 runtime
- Developer notes: 只处理当前 session token；清理 activation lifetime，保留 installation lifetime

### `PLG-4006` Host operation 已被替代

- Severity: `info`
- Stage: `runtime`
- Retryable: true
- Trigger: disable、撤权、新 generation 或更新 operation supersede 仍在执行的旧异步操作
- User action: 使用最新 Plugin Host snapshot 决定是否重新发起操作
- Developer notes: stale completion 只能 cleanup 自己持有的资源，不能更新状态或 registry

### `PLG-4007` Audit sink 不可用

- Severity: `warning`
- Stage: `audit`
- Retryable: true
- Trigger: audit event 创建失败，或 best-effort audit sink 抛错/拒绝 lifecycle event batch
- User action: 恢复 audit sink；在恢复前不要依赖完整的插件生命周期审计记录
- Developer notes: Phase 2 lifecycle audit 为 best-effort，sink 故障不回滚已提交 state；敏感 Gateway 可在后续阶段 fail closed

### `PLG-4008` Host subscriber 回调失败

- Severity: `warning`
- Stage: `registry`
- Retryable: false
- Trigger: Plugin Host 或 contribution registry subscriber 在处理已提交 snapshot/batch 时抛错
- User action: 修复或移除失败的宿主 subscriber
- Developer notes: callback 在 mutation 临界区外执行；失败不得回滚已提交 revision 或阻断其他 listener

### `PLG-4010` Runtime artifact 读取失败

- Severity: `error`
- Stage: `runtime`
- Retryable: true
- Trigger: Host 无法从当前 installation package source 读取 Manifest 指定的 runtime entrypoint
- User action: 恢复已验证插件包中的 runtime artifact 后重试 activation
- Developer notes: Host 必须在创建 sandbox 前读取 artifact；不得让 Browser adapter 通过 composition-root side channel 自行定位 package bytes

### `PLG-4011` Runtime artifact 完整性不匹配

- Severity: `error`
- Stage: `runtime`
- Retryable: false
- Trigger: Host 无法计算 runtime artifact SHA-256，digest 格式非法，或实际 digest 与 Manifest 声明的 integrity 不一致
- User action: 恢复与 Manifest/package attestation 匹配的 runtime artifact
- Developer notes: audit、integrity comparison 与 adapter activation 必须消费同一份 bytes；失败时不得调用 runtime adapter

### `PLG-4012` Runtime artifact 超出上限

- Severity: `error`
- Stage: `runtime`
- Retryable: false
- Trigger: runtime entrypoint bytes 超过 Host runtime artifact limit，即使 package reader 忽略了传入限额
- User action: 将 runtime 构建为低于 Host 上限的 self-contained ESM entry
- Developer notes: package reader 限额与 Host 收到 bytes 后的二次检查都必须保留

### `PLG-4013` Sandbox bootstrap 失败

- Severity: `error`
- Stage: `sandbox`
- Retryable: true
- Trigger: 专用 sandbox origin、broker frame、nonce/source 校验或 bootstrap transfer 无法建立
- User action: 恢复专用 sandbox 部署与安全 headers 后重试 activation
- Developer notes: 失败时不得回退到 same-origin Worker 或主线程 runtime

### `PLG-4014` Sandbox handshake 不匹配

- Severity: `error`
- Stage: `sandbox`
- Retryable: false
- Trigger: runtime ready 超时，或 protocol version、artifact digest 与绑定 session context 不匹配
- User action: 使用 Host 支持的 exact protocol 和已验证 runtime artifact 重新启动
- Developer notes: ready 前不得发送 activation，也不得提交 activation transaction

### `PLG-4015` Sandbox policy 无效

- Severity: `error`
- Stage: `sandbox`
- Retryable: false
- Trigger: iframe sandbox token、专用 origin、CSP、Permissions Policy 或 credential policy 不满足 Host 要求
- User action: 使用无 cookie 的专用 origin 和规定的 production policy
- Developer notes: 开发与生产使用同一安全 profile，不保留宽松 dev fallback

### `PLG-4020` Protocol message 非法

- Severity: `error`
- Stage: `protocol`
- Retryable: false
- Trigger: MessagePort 收到非 string、非严格 JSON、超限或不符合 Runtime Envelope v1 的消息
- User action: 发送受限 strict JSON，并满足 exact envelope 和 payload contract
- Developer notes: malformed message fail closed，并终止当前 protocol session

### `PLG-4021` Protocol contract 未注册

- Severity: `error`
- Stage: `protocol`
- Retryable: false
- Trigger: channel、method、kind 或 contract version 没有 exact contract
- User action: 使用 Host 明确注册的 exact contract identity
- Developer notes: 不做 latest、minor fallback 或隐式 payload conversion

### `PLG-4022` Protocol sequence 非单调

- Severity: `error`
- Stage: `protocol`
- Retryable: false
- Trigger: 对端 sequence 重复、回退、跳号或超出安全整数上限
- User action: 以全新 session 从 sequence 1 重启 runtime
- Developer notes: sequence violation 视为 channel compromise，不能只丢弃单条消息

### `PLG-4023` Protocol correlation 非法

- Severity: `error`
- Stage: `protocol`
- Retryable: false
- Trigger: response 缺少有效 replyTo、方向不匹配、重复回复或引用未知 pending request
- User action: 每个 request 只使用绑定 message id 回复一次
- Developer notes: 不能按插件 payload 中的 owner 或 request identity 做关联

### `PLG-4024` Protocol response 已迟到

- Severity: `warning`
- Stage: `protocol`
- Retryable: false
- Trigger: response 在 request timeout、cancel 或 close 后到达
- User action: 丢弃迟到结果，并修复 runtime 的取消传播
- Developer notes: late response 不得恢复 state、commit transaction 或激活 proxy

### `PLG-4025` Protocol request 超时

- Severity: `error`
- Stage: `protocol`
- Retryable: true
- Trigger: request 在 protocol deadline 内没有收到受验证 response
- User action: 仅在当前 runtime session 仍 active 时重试
- Developer notes: protocol timeout 与 Host lifecycle、Gateway timeout 使用不同 code

### `PLG-4026` Protocol session 已关闭

- Severity: `error`
- Stage: `protocol`
- Retryable: true
- Trigger: request/event 在 endpoint close 后发送，或 pending request 因 close 被取消
- User action: 重启 runtime session 后再发送消息
- Developer notes: close 必须 exactly-once abort pending request 并抑制后续消息

### `PLG-4030` Gateway capability 未在 Manifest 请求

- Severity: `error`
- Stage: `permission`
- Retryable: false
- Trigger: Gateway contract 推导出的 exact capability id/scope 不在 Plugin Manifest 中
- User action: 在 Manifest 声明该 exact capability 和 reason 后重新安装
- Developer notes: capability 由 contract 推导，不接受 payload 自报 capability

### `PLG-4031` Gateway capability 当前被拒绝

- Severity: `error`
- Stage: `permission`
- Retryable: false
- Trigger: live permission snapshot 未 grant capability，或调用中途撤权
- User action: 通过 Host 权限流程授权后，从当前 session 重新发起调用
- Developer notes: mid-flight revoke 必须 abort service signal 并抑制迟到 result

### `PLG-4032` Gateway request 不符合 contract

- Severity: `error`
- Stage: `gateway`
- Retryable: false
- Trigger: request payload 未通过 method-specific Schema、strict JSON 或 request byte limit
- User action: 按 exact Gateway v1 contract 修正请求
- Developer notes: validation 在 capability、audit 和 service effect 之前完成

### `PLG-4033` Gateway response 不符合 contract

- Severity: `error`
- Stage: `gateway`
- Retryable: false
- Trigger: Host handler 返回值未通过 method-specific response Schema 或 byte limit
- User action: 修复 Host service adapter 的稳定 projection
- Developer notes: 非法 response 不得跨 MessagePort，且必须记录 failed outcome audit

### `PLG-4034` Gateway handler 不可用

- Severity: `error`
- Stage: `gateway`
- Retryable: true
- Trigger: exact method/version 未注册，或对应 Host service port 未注入
- User action: 恢复 Host Gateway composition 后重启插件
- Developer notes: `secrets.read` 在 vault/redaction/consent 稳定前保持无 handler

### `PLG-4035` Gateway request 超时

- Severity: `error`
- Stage: `gateway`
- Retryable: true
- Trigger: preflight audit、service 或 network operation 超过 method/policy deadline
- User action: 确认前一次 effect 未完成后再重试
- Developer notes: timeout 必须 abort 注入 service 的 signal 并抑制迟到 response

### `PLG-4036` Gateway session 已过期

- Severity: `error`
- Stage: `gateway`
- Retryable: false
- Trigger: owner、installation、generation、plugin version 或 bound session 已不再 current
- User action: 从当前 plugin generation 重新获取 session
- Developer notes: stale generation 只能完成自身 cleanup，不能影响新 generation

### `PLG-4037` Gateway handler 执行失败

- Severity: `error`
- Stage: `gateway`
- Retryable: true
- Trigger: 注入 Host service 抛错或无法返回受限结果
- User action: 检查 Host service，再按操作幂等语义决定是否重试
- Developer notes: 不把 Error、stack、store 或底层 handle 返回给插件

### `PLG-4038` Gateway network policy 拒绝

- Severity: `error`
- Stage: `network`
- Retryable: false
- Trigger: URL、origin、method、path、header、redirect、content type、private target 或 byte limit 不符合 scope policy
- User action: 使用 capability scope 明确允许的 HTTPS 请求
- Developer notes: 每一跳重新校验；看不到 redirect Location 时 fail closed

### `PLG-4039` Gateway request 被取消

- Severity: `error`
- Stage: `gateway`
- Retryable: true
- Trigger: caller、Host shutdown、disable 或 session disposal 在完成前取消调用
- User action: 仅从 active session 且确认旧 effect 未完成时重试
- Developer notes: cancellation 与 timeout、revoke、stale generation 保持独立诊断

### `PLG-4040` Sandbox message quota 超限

- Severity: `error`
- Stage: `quota`
- Retryable: false
- Trigger: runtime 超出单条 message、消息速率或 pending request 上限
- User action: 降低 runtime 流量并重启被终止的 session
- Developer notes: quota violation 先终止 transport，再发布 diagnostic 和 cleanup

### `PLG-4041` Sandbox heartbeat 超时

- Severity: `error`
- Stage: `quota`
- Retryable: true
- Trigger: runtime 连续错过配置的 heartbeat budget
- User action: 检查 hang 或长任务后显式重试 activation
- Developer notes: 浏览器无硬 heap cap，使用 heartbeat、bounded queue 和 Worker termination

### `PLG-4042` Sandbox 已终止

- Severity: `error`
- Stage: `sandbox`
- Retryable: true
- Trigger: broker、Worker、protocol violation、crash 或 Host 命令终止当前 sandbox
- User action: 检查稳定 reason code 后决定是否重启
- Developer notes: 终止事件必须绑定 current owner/generation/session，旧事件不得改写新 snapshot

### `PLG-4043` Gateway quota 超限

- Severity: `error`
- Stage: `quota`
- Retryable: false
- Trigger: 单 session 或 method 的 request rate/concurrency 超出 Host policy
- User action: 降低 Gateway 调用频率或等待当前请求结束
- Developer notes: quota 状态按 session/method 隔离，不跨 plugin generation 复用

### `PLG-4050` Official host implementation 未通过构建证明

- Severity: `error`
- Stage: `registry`
- Retryable: false
- Trigger: package trust、publisher verification、plugin id、package digest 或 package coordinate 与 Web build 中的 official catalog 不一致
- User action: 安装与当前 Prodivix build 匹配的官方插件 package，或移除 privileged host implementation 引用
- Developer notes: community/verified package 默认 denied；development 仅允许显式本地 build mode，不能进入 production policy

### `PLG-4051` Official host implementation 不存在

- Severity: `error`
- Stage: `registry`
- Retryable: false
- Trigger: build-attested Official Host Module 无法加载，或未导出 descriptor 引用的 exact implementation id
- User action: 使用当前 Host catalog 中存在的 implementation id，并确认官方 build chunk 完整
- Developer notes: 不从 plugin bytes、URL、Gateway 或 browser singleton 回退加载实现

### `PLG-4052` Official host implementation 类型不匹配

- Severity: `error`
- Stage: `registry`
- Retryable: false
- Trigger: descriptor 需要 component-library、render-policy 或 icon-provider，但 implementation id 指向另一 kind
- User action: 引用 contract 所需类型的 host implementation
- Developer notes: kind exact match 在 callback/component 暴露给 resolved registry 前完成

### `PLG-4053` Official host implementation 绑定冲突

- Severity: `error`
- Stage: `registry`
- Retryable: false
- Trigger: official catalog 重复声明相同 plugin/digest，或同一 owner/generation/implementation id 尝试绑定不同实现
- User action: 修复 build catalog 或 contribution identity，确保单一确定的实现绑定
- Developer notes: lease 按 owner/generation 计数并 exactly-once release；generation replacement 不复用旧 owner binding

### `PLG-4060` Required Gateway audit 不可用

- Severity: `error`
- Stage: `audit`
- Retryable: true
- Trigger: required-before-effect contract 没有 audit store，或 preflight record 未能持久提交
- User action: 恢复 Host 持久审计存储后重试敏感操作
- Developer notes: preflight 失败时不得调用 service port 或产生 side effect

### `PLG-4061` Gateway outcome audit 写入失败

- Severity: `warning`
- Stage: `audit`
- Retryable: true
- Trigger: best-effort preflight 或 outcome record 未能在有界时间内持久化
- User action: 恢复 IndexedDB/audit backend，并检查 retention policy
- Developer notes: audit 仅保存脱敏、受限 metadata 和 diagnostic code，不保存 body、content、Secret 或 Token

### `PLG-4070` Official component runtime 不可用

- Severity: `error`
- Stage: `registry`
- Retryable: true
- Trigger: PIR node 引用 bundled official package 声明的 runtime type，但当前 owner generation 未发布对应 Renderer projection
- User action: 启用或重新安装拥有该 runtime type 的 official component package
- Developer notes: runtime owner 必须从 bundled catalog 数据解析，Web 和 Compiler 不得按 AntD、MUI 或 Radix type prefix 增加分支；诊断需携带 pluginId、runtimeType 和 nodeId

### `PLG-4071` Bundled official library 不存在

- Severity: `error`
- Stage: `registry`
- Retryable: false
- Trigger: Workspace component library 配置引用 bundled catalog 中不存在的 library id
- User action: 删除未知 library id，或安装 Host 明确支持的 bundled official package
- Developer notes: reconciliation 必须保留 plan.unknown 并逐项返回稳定诊断，不得尝试 remote main-realm import

### `PLG-4072` Official component runtime 已不支持

- Severity: `error`
- Stage: `registry`
- Retryable: false
- Trigger: PIR node 使用 official package 明确列入 unsupportedRuntimeTypes 的历史 runtime type
- User action: 用当前 official Palette/template 支持的 component 结构替换旧节点
- Developer notes: unsupported runtime type 由 package 生成 catalog 声明；Web 和 Compiler 不得增加库名或 type prefix 特判

## 4. 实现约束

1. `@prodivix/plugin-contracts` validator 与 `@prodivix/plugin-host` operation 必须返回 diagnostics 判别联合，不抛出面向宿主的裸校验异常。
2. `meta.manifestPath` 使用 RFC 6901 JSON Pointer；解析错误同时提供 UTF-16 offset 和一基 line / column。
3. `meta` 可以包含 plugin id、contribution id、capability、command id 和冲突资源路径，但不得包含完整源码、Secret 或 Token。
4. 测试断言 code、path 和公开结果，不绑定完整英文 message。
5. 新增或修改 PLG code 时，同步本规范、`PLUGIN_DIAGNOSTIC_DEFINITIONS` 和 `apps/docs/reference/diagnostics/` 生成结果。
