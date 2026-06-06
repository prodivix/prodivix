# Authoring Symbol Environment

Authoring Symbol Environment 是 Prodivix 作者态的共享符号环境。它让 Blueprint、NodeGraph、Animation 和 Code Editor 使用同一套符号、作用域、诊断和定位语义。

## 为什么需要

三编辑器共同维护同一个项目环境：

1. Blueprint 提供 PIR 节点、props、事件、数据绑定和样式挂载。
2. NodeGraph 提供 graph input、graph output、端口类型和函数能力。
3. Animation 提供 timeline、track、binding target 和 filter primitive。
4. Code Editor 提供 TypeScript、JavaScript、CSS、GLSL、WGSL 和表达式片段。

如果每个编辑器各自扫描模型并生成补全和诊断，UI 会出现过期提示、重复错误和互相冲突的类型规则。共享符号环境把这些能力收敛为一个查询层。

## 核心概念

| 概念                   | 说明                                             |
| ---------------------- | ------------------------------------------------ |
| `AuthoringEnvironment` | 编辑器共享查询层，提供补全、诊断、定义和引用解析 |
| `CodeArtifact`         | 用户在 MFE 中编写或挂载的最小代码片段            |
| `CodeSymbol`           | 可被代码、Inspector、节点图或动画引用的符号      |
| `CodeScope`            | 符号可见范围，例如文档、节点、列表项或节点图     |
| `TargetRef`            | 指向产品对象的定位协议                           |
| `SourceSpan`           | 指向代码片段文本范围的定位协议                   |
| `EditorAdapter`        | 把符号和诊断投放到具体 UI 的适配层               |

## 稳定查询接口

UI 不直接扫描 PIR、NodeGraph 或 Animation，而是通过环境查询：

```ts
type AuthoringEnvironment = {
  revision: string;
  querySymbols(context: AuthoringContext): CodeSymbol[];
  resolveReference(
    reference: CodeReference,
    context: AuthoringContext
  ): ResolvedReference | null;
  getCompletions(context: AuthoringContext): CodeCompletion[];
  getDiagnostics(context: AuthoringContext): ProdivixDiagnostic[];
  getDefinition(
    reference: CodeReference,
    context: AuthoringContext
  ): DefinitionLocation | null;
  getReferences(
    symbolId: string,
    context?: AuthoringContext
  ): ReferenceLocation[];
};
```

## 诊断落点

| 场景                             | 主落点                         |
| -------------------------------- | ------------------------------ |
| 有 `sourceSpan` 的语法或类型错误 | Code Editor inline diagnostic  |
| `inspector-field` 诊断           | Inspector 字段或 Panel         |
| `pir-node` 引用断裂              | 画布节点标记 + Issues          |
| `nodegraph-port` 类型问题        | NodeGraph 端口或连线           |
| `animation-track` 绑定问题       | Animation track 或 binding row |
| 无法定位到单一对象的聚合错误     | Issues 面板                    |

## COD 错误码

用户代码片段和共享符号环境相关问题使用 `COD-xxxx` 命名空间。常见码位包括：

| Code                                          | 名称                         |
| --------------------------------------------- | ---------------------------- |
| [`COD-1001`](/reference/diagnostics/cod-1001) | 代码解析失败                 |
| [`COD-2001`](/reference/diagnostics/cod-2001) | 符号无法解析                 |
| [`COD-2003`](/reference/diagnostics/cod-2003) | 类型不兼容                   |
| [`COD-3001`](/reference/diagnostics/cod-3001) | 代码片段绑定目标不存在       |
| [`COD-3002`](/reference/diagnostics/cod-3002) | 代码片段返回值不满足宿主契约 |
| [`COD-4001`](/reference/diagnostics/cod-4001) | 用户代码运行时抛错           |
| [`COD-5002`](/reference/diagnostics/cod-5002) | Shader 编译失败              |

完整决策见 `specs/decisions/25.authoring-symbol-environment.md`。
