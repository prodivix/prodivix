# Prodivix Diagnostics 诊断体系

## 状态

- Draft
- 日期：2026-05-03
- 适用范围：PIR、Workspace、Plugin、Route、Editor、UX、Code、NodeGraph、Animation、External Library、Codegen、Backend、AI
- 后端错误响应：`specs/decisions/24.backend-diagnostic-envelope.md`

## 1. 目的

Prodivix 是浏览器端可视化 IDE。错误、警告和可恢复异常需要成为稳定、可检索、可文档化的工程对象，而不是散落在 UI、日志和测试里的临时字符串。

Prodivix Diagnostics 用于统一：

1. 编辑器面板、Toast、日志、后端响应和测试断言中的错误语义。
2. 用户文档中的排障入口。
3. Telemetry、问题上报和 LLM 辅助排障的结构化上下文。
4. 前后端共享链路中的错误码命名与保留规则。
5. 后端 API 错误响应与前端就地提示之间的稳定桥接。

## 2. 适用边界

应该进入 Diagnostics 的问题：

1. 核心模型错误：PIR graph、Workspace VFS、Route manifest、NodeGraph、Animation。
2. 跨模块链路错误：保存、同步、导出、代码生成、部署、外部库运行时、AI Provider。
3. 可恢复但需要定位的问题：引用断裂、缺失节点、重复注册、Capability 不匹配、同步冲突。
4. 需要写文档、打日志、做测试断言或上报 telemetry 的稳定语义。

不应该进入 Diagnostics 的内容：

1. 成功提示，例如“保存成功”“复制完成”。
2. 纯 UI 引导、空状态、onboarding 文案。
3. 非稳定的调试日志。
4. 局部表单即时校验，除非该校验属于公开协议或后端 API 契约。

## 3. 统一结构

```ts
type ProdivixDiagnostic = {
  code: string;
  severity: 'info' | 'warning' | 'error' | 'fatal';
  domain:
    | 'pir'
    | 'workspace'
    | 'plugin'
    | 'route'
    | 'editor'
    | 'ux'
    | 'code'
    | 'nodegraph'
    | 'animation'
    | 'codegen'
    | 'backend'
    | 'ai';
  message: string;
  hint?: string;
  docsUrl?: string;
  retryable?: boolean;
  cause?: unknown;
  meta?: Record<string, unknown>;
};
```

字段要求：

| 字段        | 要求                                                      |
| ----------- | --------------------------------------------------------- |
| `code`      | 稳定错误码，同一语义只能使用一个码位                      |
| `severity`  | 面向用户和日志的严重程度                                  |
| `domain`    | 错误所属的主域，便于文档分组、过滤和 telemetry 聚合       |
| `message`   | 面向用户或开发者的短消息，允许本地化                      |
| `hint`      | 可选修复建议，避免只描述失败                              |
| `docsUrl`   | 可选文档链接，公开错误码应指向文档站或 specs              |
| `retryable` | 指明重试是否可能改变结果                                  |
| `cause`     | 原始异常，仅用于日志或开发调试，不直接暴露给普通用户      |
| `meta`      | 结构化上下文，不放隐私数据、Token、源码片段或完整用户输入 |

## 4. 严重程度

| 等级      | 说明                                                 | UI 行为建议                      |
| --------- | ---------------------------------------------------- | -------------------------------- |
| `info`    | 不阻断流程的状态说明，可用于诊断详情                 | 默认折叠或放在详情面板           |
| `warning` | 功能可继续，但结果可能降级、不完整或需要用户确认     | 在相关面板可见，允许继续         |
| `error`   | 当前操作失败，但应用可继续运行                       | 默认可见，展示修复建议           |
| `fatal`   | 当前编辑上下文或运行时不可继续，必须回退、重载或隔离 | 阻断相关流程，提供恢复或上报入口 |

## 5. 编码域

| 前缀       | 领域        | 说明                                           | 码表                                              |
| ---------- | ----------- | ---------------------------------------------- | ------------------------------------------------- |
| `PIR-xxxx` | PIR         | Schema、graph、ValueRef、materialize、校验     | `specs/diagnostics/pir-diagnostic-codes.md`       |
| `WKS-xxxx` | Workspace   | VFS、文档保存、revision、同步冲突、capability  | `specs/diagnostics/workspace-diagnostic-codes.md` |
| `PLG-xxxx` | Plugin      | Manifest、contract、权限、注册事务、runtime    | `specs/diagnostics/plugin-diagnostic-codes.md`    |
| `RTE-xxxx` | Route       | Route manifest、Outlet、导航运行时             | `specs/diagnostics/route-diagnostic-codes.md`     |
| `EDT-xxxx` | Editor      | 编辑器交互、选择、拖拽、Inspector、画布状态    | `specs/diagnostics/editor-diagnostic-codes.md`    |
| `UX-xxxx`  | UX          | 可访问性、交互、响应式布局、内容和视觉反馈     | `specs/diagnostics/ux-diagnostic-codes.md`        |
| `COD-xxxx` | Code        | 用户代码片段、符号解析、类型、宿主绑定、运行时 | `specs/diagnostics/code-diagnostic-codes.md`      |
| `NGR-xxxx` | NodeGraph   | 节点图端口、连线、执行、调试                   | `specs/diagnostics/nodegraph-diagnostic-codes.md` |
| `ANI-xxxx` | Animation   | Timeline、binding、track、target node          | `specs/diagnostics/animation-diagnostic-codes.md` |
| `GEN-xxxx` | Codegen     | IR 构建、依赖解析、代码发射、导出              | `specs/diagnostics/codegen-diagnostic-codes.md`   |
| `API-xxxx` | Backend/API | HTTP、鉴权、权限、后端校验、持久化             | `specs/diagnostics/api-diagnostic-codes.md`       |
| `AI-xxxx`  | AI          | Provider、模型发现、Prompt、结构化响应解析     | `specs/diagnostics/ai-diagnostic-codes.md`        |

## 6. 码位规则

1. 同一错误码只能表达一个稳定语义，禁止复用。
2. 已发布或被文档引用的码位即使废弃，也必须保留并标注 `Deprecated`。
3. 新增码位必须包含：含义、触发条件、用户可见建议、开发者排查入口。
4. 跨端共享场景使用同一个码值，不允许前端和后端各自创造近义码。
5. UI 文案可以本地化，但 `code`、`domain`、`severity` 必须稳定。
6. 测试优先断言 `code` 和公开状态，不断言完整自然语言文案。
7. 码位文档先于或随实现一起提交，不能在实现后补猜。

## 7. 分段建议

每个域可按阶段分配 `xx00` 段：

| 段位   | 建议用途                       |
| ------ | ------------------------------ |
| `10xx` | 输入、加载、解析、Schema 形状  |
| `20xx` | 引用、解析、依赖关系           |
| `30xx` | 写入、Patch、Command、状态变更 |
| `40xx` | 运行时、渲染、执行             |
| `50xx` | 代码生成、导出、部署           |
| `90xx` | 未知异常、兜底错误             |

域内可以根据实际链路调整分段，但必须在对应码表中说明。

## 8. 文档模板

新增码位时使用以下格式：

```md
### `PIR-1001` 根节点不存在

- Severity: `error`
- Stage: validate
- Retryable: false
- Trigger: `ui.graph.rootId` 无法在 `nodesById` 中找到
- User action: 回到最近一次有效保存，或让编辑器执行 graph repair
- Developer notes: 检查创建节点、删除节点、导入旧文档和 patch 应用链路
```

## 9. 展示与可观测性

1. 编辑器错误面板、Toast、日志和后端响应应尽量使用同一诊断对象。
2. `error` 和 `fatal` 默认可见；`warning` 在相关详情中可见；`info` 可折叠。
3. 诊断对象可以聚合，但聚合项必须保留原始 code 列表。
4. 前端不得把 `cause` 里的原始堆栈直接暴露给普通用户。
5. 用户上报问题时，应鼓励携带 `code`、发生模块、操作路径和时间。

## 10. 后端响应协议

后端 API 必须使用 Backend Diagnostic Envelope 表达长期稳定错误协议。Envelope 负责把 HTTP status、diagnostic code、requestId、details 和可选 diagnostics 数组统一到一个响应结构中。

规范见 `specs/decisions/24.backend-diagnostic-envelope.md`。

## 11. 落地顺序

1. 建立本总规范与首批域码表。
2. Plugin package、artifact、contribution 与 lifecycle 使用 `PLG-xxxx`；已删除无消费者的旧 remote runtime `ELIB-xxxx` 域。
3. 优先收敛 PIR、Workspace、Editor 三个域，因为它们影响保存态与编辑体验。
4. 后续实现 `createDiagnostic` / `isDiagnostic` 等轻量 helper。
5. 文档站提供错误码参考页，链接到用户可理解的修复建议。
