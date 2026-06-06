# Canonical External IR v1（冻结草案）

## 状态

- Draft-Frozen
- 日期：2026-02-17
- 阶段：Phase 0 / Gate A
- 关联：
  - `specs/decisions/17.external-library-runtime-and-adapter.md`
  - `specs/implementation/external-library-execution-plan.md`
  - `specs/implementation/external-library-task-backlog.md`

## 1. 目的

Canonical External IR 是外部组件库接入链路的唯一事实层，Render Policy 与 Codegen Policy 共同消费该层数据，避免两侧维护分叉语义。

## 2. 版本策略

1. 当前版本：`v1`。
2. `v1` 仅允许向后兼容扩展（新增可选字段），禁止破坏性改动。
3. 破坏性改动必须新增主版本（`v2`），并提供迁移说明。

## 3. 字段最小集（v1 Frozen）

```ts
type CanonicalExternalComponentV1 = {
  // 唯一定位
  libraryId: string;
  componentName: string;
  runtimeType: string;
  itemId: string;
  path: string;

  // 运行时渲染
  component: unknown;
  preview?: unknown;
  renderPreview?: (options: { size?: string; status?: string }) => unknown;

  // 交互与展示
  defaultProps?: Record<string, unknown>;
  sizeOptions?: Array<{ id: string; label: string; value: string }>;
  propsSchema?: Record<string, unknown>;
  slots?: string[];
  behaviorTags?: string[];

  // 生成与扩展
  codegenHints?: Record<string, unknown>;
};
```

## 4. 字段语义约束

1. `libraryId`：外部库稳定标识（如 `mui`、`antd`），在项目内唯一。
2. `componentName`：用于 UI 展示的组件名，可被 manifest 覆盖。
3. `runtimeType`：写入 PIR 节点 `type` 的最终类型名，必须稳定可逆。
4. `itemId`：Palette 拖拽标识，必须在同库内唯一。
5. `path`：来源路径（导出路径），用于 manifest 定位与诊断定位。
6. `defaultProps`：仅放可安全序列化默认值。
7. `codegenHints`：仅表达生成策略提示，不承载运行时执行逻辑。

## 5. 不变量（v1）

1. Palette、Component Tree、Canvas 渲染都必须从 Canonical External IR 派生，不允许私有解析分支。
2. `runtimeType` 一旦写入 PIR，不得在保存后自动漂移。
3. Codegen 必须基于 Canonical IR + Codegen Policy，禁止回读运行时对象快照。

## 6. 扩展点

1. manifest 覆盖属于“增量覆盖”，不替代 Canonical IR 基础字段。
2. Render Policy 与 Codegen Policy 只能消费/增强字段，不能重定义字段含义。
3. 新增字段必须文档化：字段名、语义、默认值、兼容策略。

## 7. 非目标

1. 本文档不定义第三方库许可合规字段。
2. 本文档不定义完整 props 类型系统（仅保留 `propsSchema` 扩展口）。
