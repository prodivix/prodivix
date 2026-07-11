# React 生产级代码生成策略（Historical / Superseded）

## 状态

- Superseded
- 日期：2026-02-22
- 取代日期：2026-07-11
- 当前 contract：`specs/plugins/codegen-policy-contribution-v1.schema.json`
- 当前实现记录：`specs/implementation/official-component-plugins-phase46-48.md`
- 关联：
  - `specs/decisions/17.external-library-runtime-and-adapter.md`

本文记录早期 callback policy、`workspace | esm-sh` import strategy、MUI 建议清单与 NodeGraph v1.1 增补，不再是当前 compiler contract。以下接口、策略包与 Gate E 仅用于历史追溯，不得恢复为生产 fallback。

当前实现由 JSON-only `codegenPolicy@1.0` resource、Web 生成的 immutable `CodegenPolicySnapshot` 和 Compiler generic composite adapter组成。每条 rule 明确 runtime type、exact package、import kind、element path 与 children policy；Compiler 只为实际使用的 policy 输出 exact dependency closure，不读取 Web Host/browser singleton，也不生成 official esm.sh import。AntD-only、MUI-only、Radix-only 与三库组合导出项目均已通过 install、build 和 browser behavior gate。

## 1. 背景与目标

Blueprint 外部库接入已经具备运行时可渲染能力，但导出链路仍需要明确的生产标准。

本规范的目标是：

1. 导出代码可直接用于生产工程，而非临时预览产物。
2. 代码生成对齐可维护性：结构可读、语义稳定、依赖明确。
3. 消除“依赖运行时对象快照导出”的隐式耦合。

## 2. 术语约定

1. 渲染侧术语使用 **Render Policy**（可映射到现有渲染适配机制）。
2. 生成侧术语统一使用 **Codegen Policy**。
3. 对外沟通不再使用 “generator adapter” 表述。
4. 允许在内部保留最小策略接口，但其职责仅限“规则映射”，不承载运行时行为。

## 3. 设计原则

1. **静态可解析**：导入语句必须可由打包器静态分析。
2. **确定性输出**：同一输入 PIR 在同一策略版本下输出一致。
3. **生产可维护**：组件名、props、事件表达形式符合常见 React 工程习惯。
4. **诊断优先**：不可安全生成时必须输出结构化诊断，而非静默降级。
5. **渐进覆盖**：首批组件先可用，再逐步增强复杂语义。

## 4. 标准调用链路

`PIR Canonical Node -> Codegen Policy Resolver -> Import Plan -> JSX Emit -> File Bundle -> Diagnostics`

约束：

1. 生成过程只消费 Canonical IR，不直接读取运行时注册对象内部形态。
2. 导入计划先于 JSX 输出计算，禁止后置字符串拼接式注入 import。
3. 生成诊断必须带节点定位与策略阶段信息。

## 5. 策略接口（v1 草案）

```ts
type CodegenPolicyContext = {
  target: 'react';
  importStrategy: 'workspace' | 'esm-sh';
  packageVersions?: Record<string, string>;
};

type CodegenNodeResolution = {
  element: string;
  imports: Array<{
    source: string;
    imported: string;
    local?: string;
    kind?: 'value' | 'type';
  }>;
  props: Record<string, unknown>;
  diagnostics?: Array<{
    code: string;
    level: 'info' | 'warning' | 'error';
    message: string;
    hint?: string;
  }>;
};

type CodegenPolicy = {
  id: string;
  priority: number;
  match: (nodeType: string) => boolean;
  resolve: (
    node: {
      id: string;
      type: string;
      props?: Record<string, unknown>;
      text?: string;
    },
    context: CodegenPolicyContext
  ) => CodegenNodeResolution;
};
```

## 6. Import 规则（v1）

1. `workspace` 策略：优先输出包名 import（如 `@mui/material`）。
2. `esm-sh` 策略：输出显式版本 URL（如 `https://esm.sh/lodash-es@x.y.z`）。
3. 同源 import 去重与排序稳定（先 source，再 imported）。
4. 不生成动态 `import()` 作为默认路径（除非显式配置异步分包策略）。

## 7. Props 与事件规则（v1）

1. 空值策略：
   - `undefined` props 不输出。
   - `null` 按组件语义显式输出。
2. 函数策略：
   - 事件处理函数默认生成具名占位函数，并在诊断中提示待接线。
3. 对象策略：
   - 可 JSON 序列化对象直接输出字面量。
   - 不可序列化值输出 `CGEN-EXTERNAL-3001` 诊断并降级。
4. children 策略：
   - 优先保留 PIR children。
   - 仅在策略显式声明时，允许 text 回填为 children。

## 8. 外部库策略包（v1）

### 8.1 `@prodivix/ui`（内建）

1. 作为默认策略包，保证现有导出行为稳定。
2. 与 Blueprint 组件命名保持 1:1 映射。

### 8.2 MUI（首批）

1. 首批覆盖建议：`Button/TextField/Dialog/Card/Box/Stack/Grid/Alert/Snackbar/Tabs/Accordion`。
2. Dialog 等复杂组件默认输出安全 props（如 `open={false}`）并附提示注释或诊断。
3. 对需要上下文组件，策略需给出最小可运行方案或诊断建议。

### 8.3 Antd（已存在能力整合）

1. 将既有生成映射统一收敛到 Codegen Policy 概念下。
2. 补齐与 MUI 同级的诊断与测试标准。

## 9. NodeGraph 导出存储分层（v1.1 增补）

### 9.1 分层目标

1. `logic.graphs` 只承载运行语义（执行节点与连线关系）。
2. 编辑器布局与交互状态通过 `x-` 扩展字段承载，避免污染运行模型。
3. 导出与回读都保持“运行语义稳定 + 编辑态可恢复”。

### 9.2 PIR 字段约定

```ts
type RuntimeGraphNode = {
  id: string;
  type: string;
  data: Record<string, unknown>;
};

type RuntimeGraphEdge = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
};

type RuntimeGraph = {
  id: string;
  name: string;
  nodes: RuntimeGraphNode[];
  edges: RuntimeGraphEdge[];
};

type NodeGraphEditorNodeState = {
  id: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  parentId?: string;
  extent?: 'parent';
  zIndex?: number;
  collapsed?: true;
};

type NodeGraphEditorState = {
  version: 1;
  activeGraphId?: string;
  graphs: Array<{
    id: string;
    nodes: NodeGraphEditorNodeState[];
  }>;
};

type PirLogicWithNodeGraph = {
  graphs?: RuntimeGraph[];
  'x-nodeGraphEditor'?: NodeGraphEditorState;
};
```

约束：

1. `collapsed` 仅在值为 `true` 时输出；默认展开态不输出。
2. `logic.graphs.nodes[*].data` 不允许包含布局字段（如 `x/y/width/height/auto*`）。
3. `x-nodeGraphEditor` 的 `graphs[*].id` 必须与 `logic.graphs[*].id` 对齐。

### 9.3 导出行为约束

1. 代码生成与运行时编译仅消费 `logic.graphs`。
2. 导出产物在保留 PIR 原文档场景下必须透传 `x-nodeGraphEditor`。
3. 导出器不得把编辑器字段回写到 `logic.graphs`（禁止混层）。
4. 当 `x-nodeGraphEditor.activeGraphId` 无效时，回读流程回退到第一张可用图。

### 9.4 兼容迁移约束

1. 旧结构若在 `logic.graphs` 节点内混入布局字段，保存时必须自动拆分到 `x-nodeGraphEditor`。
2. 缺失 `x-nodeGraphEditor` 时，编辑器可从当前节点位置推导并补齐。
3. 未识别的其他 `x-<namespace>` 字段必须原样保留，不得删除。

## 10. 诊断规范（Codegen）

建议编码段：

1. `CGEN-EXTERNAL-1xxx`：组件映射缺失
2. `CGEN-EXTERNAL-2xxx`：import 解析失败
3. `CGEN-EXTERNAL-3xxx`：props 不可安全序列化
4. `CGEN-EXTERNAL-4xxx`：复杂组件语义降级
5. `CGEN-EXTERNAL-5xxx`：产物一致性或策略冲突

最小字段：

```ts
type CodegenDiagnostic = {
  code: string;
  level: 'info' | 'warning' | 'error';
  nodeId?: string;
  nodeType?: string;
  stage: 'resolve' | 'imports' | 'props' | 'emit' | 'bundle';
  message: string;
  hint?: string;
};
```

## 11. 测试与验收

### 11.1 必测项

1. 单测：每个策略包至少覆盖映射成功与映射失败两个分支。
2. 快照：导出代码快照稳定（含 import 顺序）。
3. 构建冒烟：生成产物可通过最小构建流程。
4. 回归：Blueprint 渲染语义与导出代码语义一致。

### 11.2 Gate E 验收门槛

1. 首批 MUI 组件导出构建通过率达到约定阈值。
2. 阻断级导出错误必须具备结构化诊断。
3. 不允许依赖运行时快照对象拼装生产代码。

## 12. 非目标（v1）

1. 不定义完整的状态管理或数据层生成框架。
2. 不自动生成业务级 API 请求逻辑。
3. 不承诺一次性覆盖所有外部组件库所有组件。
