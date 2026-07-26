# Semantic Authoring

Workspace Semantic Index 让 Route、PIR、Component、Collection、NodeGraph、Animation、Code、Token 和 Asset 在整个项目中可寻址、可引用和可分析。

## 全局可寻址，不是全局可见

每个 `WorkspaceSymbol` 都有稳定的 identity 和 owner，但解析仍受 `WorkspaceScope`、类型与 capability 约束。一个符号能被 Issues 定位，不代表它会出现在所有编辑器的 completion 中。

## Revision-bound snapshot

Semantic Index 绑定：

- Canonical Workspace 的 partitioned revisions
- semantic schema
- provider set

其中任何一项发生变化，都应构建新的 snapshot。索引是只读的，可丢弃、可重建，不允许用来保存领域创作状态。

## Provider contribution

各领域只发布自己的 symbols、scopes、references、diagnostic targets 与 source spans。Index 负责汇总并提供稳定的查询接口，但不扫描编辑器私有结构。

```mermaid
flowchart TD
  Route --> Index["Workspace Semantic Index"]
  PIR --> Index
  Graph["NodeGraph / Animation"] --> Index
  Code["Code Language Contribution"] --> Index
  Asset["Token / Asset / Resolver"] --> Index
  Index --> Query["definition / references / resolution / impact"]
  Query --> UI["Editors / Inspector / Resources / AI"]
```

## Code Language 的位置

Language Service 通过 Code Semantic Contribution 接入，不拥有 Component、Route 或 Collection 的 identity policy。它负责发布代码符号信息并提供 language capability；跨领域的 rename/impact 则由 authoring 与 Workspace transaction 协同完成。

## Diagnostics 的位置

Semantic Index 只生成 scope/reference/resolution 类 semantic diagnostics。Provider lifecycle、去重、presentation 和 Issues query 属于 `@prodivix/diagnostics`。

稳定接口见[Workspace Semantic Index 参考](/reference/authoring-symbol-environment)。
