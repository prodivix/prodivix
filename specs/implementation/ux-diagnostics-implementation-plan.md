# UX Diagnostics Implementation Plan

## 状态

- Draft
- 日期：2026-05-10
- 关联：
  - `specs/decisions/26.ux-diagnostics.md`
  - `specs/diagnostics/ux-diagnostic-codes.md`
  - `specs/diagnostics/README.md`
  - `apps/web/src/diagnostics/`

## 目标

把 `UX-xxxx` 从文档域逐步接入实现，但先只落长期稳定的协议和数据边界，不提前实现大量不可靠 checker。

实施顺序必须遵守：

1. 先有稳定 code、domain、definition、targetRef 和 evidence 结构。
2. 再接入 Issues / Inspector / Preview 的消费入口。
3. 最后分批实现静态、预览和交互检查器。

## 非目标

1. 不一次性实现完整 WCAG checker。
2. 不把 `ux-diagnostic-codes.md` 中所有码位都写成空 checker。
3. 不为 definition 映射或文档同步增加低价值测试。
4. 不把外部工具编号作为 MFE 主 `code`。
5. 不在本阶段改变 Inspector、Canvas 或 Issues 的视觉设计。

## Phase 1：稳定诊断协议

目的：让 `UX-xxxx` 能被代码识别、创建和聚合。

范围：

1. `ProdivixDiagnosticDomain` 增加 `ux`。
2. `isDiagnostic` 接受 `ux` domain。
3. `DiagnosticTargetRef` 增加 UX 需要的稳定定位：
   - `theme-token`
   - `viewport`
   - `runtime-dom`
   - `component-slot`
4. 增加 `UxStandardRef`、`UxDiagnosticEvidence`、`UxDiagnosticMeta`、`UxDiagnostic` 类型。
5. 增加 `UX_DIAGNOSTIC_DEFINITIONS`，只包含机器可读元数据：
   - `code`
   - `domain`
   - `severity`
   - `stage`
   - `retryable`
   - `docsPath`
   - `docsUrl`
   - `defaultPlacement`
6. 不新增测试；用 typecheck、docs check 和人工审阅确认 definition 结构。

验收：

- [ ] `pnpm --filter @prodivix/web typecheck` 通过。
- [ ] `pnpm docs:diagnostics:check` 通过。
- [ ] 不新增 checker、UI 或运行时扫描逻辑。

## Phase 2：UX 诊断聚合入口

目的：让后续 checker 可以统一注册和聚合结果。

建议新增：

```ts
type UxCheckMode = 'static' | 'preview' | 'interaction' | 'export-gate';

type UxCheckContext = {
  mode: UxCheckMode;
  documentId?: string;
  routeId?: string;
  themeId?: string;
  viewport?: { width: number; height: number; device?: string };
  revision: string;
};

type UxDiagnosticProvider = {
  id: string;
  mode: UxCheckMode;
  getDiagnostics(context: UxCheckContext): ProdivixDiagnostic[];
};
```

实现边界：

1. Provider registry 只负责注册、注销、聚合。
2. Registry 不知道 Inspector、Canvas、DOM 或 theme 内部结构。
3. 聚合时保留原始 `code`、`targetRef` 和 `meta.evidence`。
4. 证据不足返回 `UX-9004` 或具体的证据不足码，不返回伪阳性。

验收：

- [ ] 空 registry 返回空数组。
- [ ] 多 provider 聚合保持顺序稳定。
- [ ] provider 抛错时映射为 `UX-9001`，且原始异常只进内部 cause。
- [ ] 只有当 registry 行为开始承载复杂分支时，才补最小行为测试。

## Phase 3：静态检查器

目的：先覆盖不依赖运行时 DOM 的高确定性规则。

首批建议：

| Code      | 来源                         | 原因                     |
| --------- | ---------------------------- | ------------------------ |
| `UX-1003` | Inspector schema / PIR props | 表单标签可静态定位       |
| `UX-1004` | component metadata / props   | 图标按钮可访问名称高频   |
| `UX-4005` | field schema                 | 必填、格式、范围说明稳定 |
| `UX-9002` | UX rule config schema        | 配置非法不依赖页面运行时 |

实施规则：

1. 静态检查器只基于 PIR、schema、component metadata、theme token metadata。
2. 不读取真实 DOM，不计算样式，不做 focus walk。
3. 如果需要运行时证据才能判断，返回 `UX-9004` 或跳过。
4. 每条诊断必须能定位到 `inspector-field`、`pir-node` 或 `operation`。

验收：

- [ ] 每个 checker 有明确输入、输出和边界说明。
- [ ] 验证时优先看 `code`、`targetRef`、`meta.evidence`，不依赖完整文案。
- [ ] 不使用 DOM 层级、`querySelector`、snapshot 或内部 class 作为验证依据。
- [ ] 只有高风险规则或曾经回归的问题才补测试。

## Phase 4：预览检查器

目的：基于 materialized DOM、computed style、viewport 和 theme matrix 判断运行时体验问题。

首批建议：

| Code      | 需要证据                         |
| --------- | -------------------------------- |
| `UX-1001` | foreground/background/ratio      |
| `UX-2003` | bounding box、target spacing     |
| `UX-3001` | viewport、scroll width、overflow |
| `UX-3003` | text overflow、full text path    |
| `UX-5001` | non-text contrast evidence       |
| `UX-5003` | theme token path、computed style |

实施规则：

1. 必须记录 `viewport`、`themeId`、`routeId` 或可复现 snapshot。
2. 与 theme token 有关的诊断必须记录 token path。
3. Preview checker 不改变 PIR，不尝试自动修复。
4. 对无法反向映射到 PIR 的结果使用 `runtime-dom` targetRef。

验收：

- [ ] 同一路由、主题、viewport 下结果稳定。
- [ ] 换 viewport 后能生成独立诊断或标记旧结果过期。
- [ ] 缺少 computed style 时返回 `UX-9004`，不返回合规或不合规。

## Phase 5：交互检查器

目的：覆盖键盘、焦点、弹层和状态流。

首批建议：

| Code      | 检查方式                        |
| --------- | ------------------------------- |
| `UX-1014` | focus enter/escape/return path  |
| `UX-2001` | keyboard path for primary tasks |
| `UX-2002` | observed focus order            |
| `UX-2010` | overlay focus management        |
| `UX-2011` | hover-only critical feedback    |

实施规则：

1. 交互检查必须基于可复现步骤或自动化 focus walk。
2. 复杂画布可以提供等价命令路径，不要求每个像素操作键盘化。
3. 不把静态猜测直接升级为 `error`；静态只能标记风险或证据不足。

验收：

- [ ] 每个失败结果包含最小复现步骤。
- [ ] 关闭弹层后焦点返回路径可被复现和验证。
- [ ] 键盘陷阱类问题默认 severity 为 `error`。

## Phase 6：展示与导出前 Gate

目的：让 UX 诊断进入用户能处理的位置。

展示策略：

1. `inspector-field`：Inspector 字段附近 + Issues。
2. `pir-node`：Canvas 节点标记 + Component tree + Issues。
3. `theme-token`：Theme/token editor + Issues。
4. `viewport`：Preview viewport badge + Issues。
5. `operation`：导出前检查或发布 gate + Issues。

Gate 策略：

1. 本地保存不因 UX warning 阻断。
2. 导出/发布可按策略阻断 `error` 级 UX 诊断。
3. 豁免必须结构化保存，且保留 owner、reason、scope、可选 expiresAt。

验收：

- [ ] Issues 展示原始 `UX-xxxx`。
- [ ] 聚合诊断保留下游 code 列表。
- [ ] 导出报告包含 diagnostics、evidence、viewport、theme 和豁免。

## 首批实现建议

最小可落地集合：

1. Phase 1 全部。
2. Phase 2 registry。
3. Phase 3 中只实现：
   - `UX-1003`
   - `UX-1004`
   - `UX-4005`
   - `UX-9002`

暂缓：

1. `UX-1001` 对比度检查，等 preview computed style 管线稳定后再做。
2. `UX-1014` / `UX-2001`，等交互自动化或 focus walk 有稳定基础后再做。
3. `UX-5005` 频闪风险，必须有采样和阈值证据后再启用。

## 验证策略

1. Definition / registry：优先使用 typecheck、docs check 和代码审阅，不为纯映射写测试。
2. Static checker：只有规则逻辑存在分支、边界或历史回归时才补行为测试。
3. Preview checker：需要自动化时使用受控 computed style fixture，不断言 DOM 层级。
4. Interaction checker：需要自动化时验证公开 focus path 和诊断 code。
5. UI 展示：只验证用户可感知行为和公开状态，不测内部 class、标签结构或 snapshot。

## 风险

1. 一次性实现过多 checker 会产生低质量误报。
2. 缺少 `targetRef` 的 UX 诊断会变成无法修复的噪音。
3. 把外部工具 code 当主 code 会破坏 MFE 长期稳定语义。
4. Preview/interaction checker 如果不记录 viewport、theme、revision，会产生不可复现结果。
