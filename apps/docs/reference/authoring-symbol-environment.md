# Workspace Semantic Index

Workspace Semantic Index 是 Prodivix 的跨领域语义查询层。它让 Blueprint、NodeGraph、Animation、Code Editor、Inspector、Resources 和 AI 使用同一套 identity、scope、reference、impact 与定位语义，并把 semantic diagnostic snapshot 交给统一 Issues 系统。

`@prodivix/authoring` 提供 revision-bound Workspace Semantic Index、canonical semantic address、统一 resolution 与 `SEM-xxxx` diagnostics；`@prodivix/workspace` 从同一 WorkspaceSnapshot 组合 Workspace、Route、PIR-current Component/Collection、standalone NodeGraph、Animation、Code Language、Token/Resolver 与专用 Asset provider contribution。

## 核心边界

```text
Canonical Workspace VFS @ partitioned revisions
  -> Workspace / Route / PIR / Component / Collection providers
  -> NodeGraph / Animation providers
  -> Code Semantic Contribution / Language Capability providers
  -> Token / Asset / Contract providers
  -> Workspace Semantic Index snapshot
```

1. Index 是绑定 partitioned Workspace revisions、semantic schema 和 provider-set digest、可丢弃和重建的只读投影；Canonical Workspace VFS 继续承载作者态真相。
2. 全项目 symbol 在同一 snapshot 内都可寻址；持久对象使用跨 revision durable identity，语言推导的 local symbol 可以只拥有 revision-scoped address。Scope、type 和 capability 仍限制解析、补全与绑定可见性。
3. Route、Component、Collection、NodeGraph、Animation 和 Code 等领域继续保存自己的类型化引用；Index 只生成统一 reference graph。
4. TypeScript、CSS、GLSL/WGSL Language Service 通过 facts contribution 与 language-native capability 两类 Provider 接入，跨领域协议保持 language-neutral。
5. Provider 读取 canonical snapshot，并在稳定的领域边界上发布语义 contribution。

## 核心概念

| 概念                             | 说明                                                                                                               |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `WorkspaceSemanticIndex`         | definition、references、visible symbols、completion、impact 和 semantic diagnostics 的稳定查询面                   |
| `WorkspaceSymbol`                | Route、Component member、PIR node、Collection item、graph port、timeline、code export、token 或 asset 等可引用对象 |
| `WorkspaceScope`                 | Workspace、document、route、component、Collection item、NodeGraph、Animation 或 code 的显式可见性边界              |
| `WorkspaceReferenceEdge`         | 领域类型化引用的统一索引投影，区分 resolved、missing、not-visible 与 ambiguous                                     |
| `CodeArtifact` / `CodeReference` | Canonical code document 的作者态投影和稳定代码引用                                                                 |
| `DiagnosticTargetRef`            | 指向产品对象的稳定定位协议                                                                                         |
| `SourceSpan`                     | 指向 CodeArtifact 文本范围的定位协议                                                                               |

## 查询语义

```ts
type WorkspaceSemanticIndex = {
  snapshotIdentity: SemanticSnapshotIdentity;
  getScope(scopeId: string): WorkspaceScope | null;
  getSymbol(symbolId: string): WorkspaceSymbol | null;
  getReference(referenceId: string): WorkspaceReferenceEdge | null;
  getDependency(dependencyId: string): WorkspaceDependencyEdge | null;
  queryVisibleSymbols(
    context: SemanticQueryContext
  ): SemanticVisibleSymbolsResult;
  resolveReference(referenceId: string): SemanticResolutionResult;
  getDefinition(referenceId: string): SemanticResolutionResult;
  getReferences(symbolId: string): SemanticReferencesResult;
  getImpact(symbolIds: readonly string[]): SemanticImpactResult;
  getCompletions(context: SemanticQueryContext): SemanticCompletionsResult;
  getSemanticDiagnostics(): SemanticDiagnosticsResult;
};
```

`resolveReference` 返回 discriminated `resolved / missing / not-visible / ambiguous / type-incompatible / stale` 结果，保留完整解析状态。`getSymbol(id)` 可以定位当前上下文不可见的对象；`queryVisibleSymbols`、completion 和 bind 操作必须应用统一跨领域 visibility policy。只有宿主上下文加入后才能绑定的 provisional fact 可以延迟 Issue 投影，但查询仍如实返回 `missing`；持久化显式引用不得借此隐藏错误。语言 Provider 继续执行语言原生 lexical/module/type resolution，Index 负责编排并规范化结果。

rename、delete、move 和 component extraction 只从 Index 获取影响图，实际写入必须由领域 Command planner 形成一个原子 Workspace Transaction。

## 诊断落点

| 场景                                          | 主落点                        |
| --------------------------------------------- | ----------------------------- |
| 有 `SourceSpan` 的语法或类型错误              | Code Editor inline diagnostic |
| Component Contract 或 Collection binding 错误 | Inspector / Canvas / Issues   |
| PIR target 或 Component Instance 引用断裂     | Canvas marker / Issues        |
| NodeGraph port 类型问题                       | NodeGraph port / edge         |
| Animation target 问题                         | Animation track / binding row |
| 无法定位到单一对象的聚合错误                  | Issues                        |

Code-owned 解析、符号和绑定问题使用 `COD-xxxx`；PIR、Route、NodeGraph、Animation、Workspace 和 Compiler 结构错误使用各自诊断域。Index 将 missing、not-visible、ambiguous、type-incompatible 与 stale 解析状态投影为 `SEM-2001` 至 `SEM-2005`；`@prodivix/diagnostics` 拥有全域 snapshot lifecycle、去重、presentation 和 Issues 查询。

完整 contract 见 `specs/decisions/25.authoring-symbol-environment.md`；Component Instance 与 Collection scope 见 `specs/decisions/38.blueprint-component-instance-and-collection.md`。
