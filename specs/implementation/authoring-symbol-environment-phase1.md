# Authoring Symbol Environment Phase 1

## 状态

- Draft
- 日期：2026-05-04
- 关联：
  - `specs/decisions/25.authoring-symbol-environment.md`
  - `specs/implementation/authoring-environment-stable-structures.md`
  - `specs/diagnostics/code-diagnostic-codes.md`
  - `specs/diagnostics/README.md`

## 目标

Phase 1 只落地长期稳定的作者态契约，让后续 Blueprint、NodeGraph、Animation、Code Editor、Inspector 和 Issues 面板共享同一套诊断与定位语义。

本阶段不实现完整符号索引器，不绑定具体语言服务，不规定 UI 组件结构。目标是先把“不会轻易变”的边界固定下来。

后续稳定结构路线图见 `specs/implementation/authoring-environment-stable-structures.md`。

## 长期稳定交付物

### 1. Diagnostic 定位协议

前端诊断对象必须支持产品对象定位和源码范围定位。

```ts
type DiagnosticTargetRef =
  | { kind: 'workspace'; workspaceId: string }
  | { kind: 'document'; workspaceId?: string; documentId: string }
  | { kind: 'pir-node'; documentId: string; nodeId: string }
  | {
      kind: 'inspector-field';
      documentId: string;
      nodeId: string;
      fieldPath: string;
    }
  | { kind: 'route'; routeId: string }
  | { kind: 'nodegraph-node'; graphId: string; nodeId: string }
  | { kind: 'nodegraph-port'; graphId: string; nodeId: string; portId: string }
  | { kind: 'animation-track'; timelineId: string; trackId: string }
  | { kind: 'code-artifact'; artifactId: string }
  | { kind: 'operation'; operation: string };

type SourceSpan = {
  artifactId: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
};
```

稳定性要求：

1. `targetRef` 表示产品对象，不表示文件路径或 DOM 节点。
2. `sourceSpan` 表示 CodeArtifact 内的文本范围，不直接绑定 CodeMirror 内部状态。
3. 同一诊断可以同时携带 `targetRef` 和 `sourceSpan`。
4. `path` 仍只表示协议路径或文档路径，不替代 `targetRef`。

### 2. CodeArtifact 契约

CodeArtifact 是用户代码片段的稳定最小单元。

```ts
type CodeArtifact = {
  id: string;
  language: CodeArtifactLanguage;
  owner: CodeArtifactOwner;
  source: string;
  revision: string;
};

type CodeArtifactLanguage =
  | 'ts'
  | 'js'
  | 'css'
  | 'scss'
  | 'glsl'
  | 'wgsl'
  | 'expr';

type CodeArtifactOwner =
  | { kind: 'pir-node'; documentId: string; nodeId: string }
  | {
      kind: 'inspector-field';
      documentId: string;
      nodeId: string;
      fieldPath: string;
    }
  | { kind: 'nodegraph-node'; graphId: string; nodeId: string }
  | { kind: 'nodegraph-port'; graphId: string; nodeId: string; portId: string }
  | { kind: 'animation-track'; timelineId: string; trackId: string }
  | {
      kind: 'animation-keyframe';
      timelineId: string;
      trackId: string;
      keyframeId: string;
    }
  | { kind: 'workspace-module'; documentId: string };
```

稳定性要求：

1. 每个 CodeArtifact 必须有 owner。
2. owner 决定诊断主落点。
3. `language` 是能力枚举，不是编辑器模式字符串。
4. `revision` 只用于失效判断，不规定具体生成算法。

### 2.1 CodeArtifact Provider 契约

Phase 1 不直接扫描 Blueprint、Inspector、资源页、NodeGraph 或 Animation 当前内部结构。各模块未来通过 provider 声明自己能提供哪些 CodeArtifact。

```ts
type CodeArtifactProvider = {
  id: string;
  source: SymbolSource;
  listArtifacts(context: AuthoringContext): CodeArtifact[];
  getArtifact(id: string): CodeArtifact | null;
};
```

稳定性要求：

1. Authoring Environment 只依赖 provider contract，不依赖具体编辑器 store 或 UI 结构。
2. provider 可以随模块内部重构而替换实现，但 `CodeArtifact` 输出形状保持稳定。
3. 多个 provider 可以并存，例如 Blueprint 事件代码、Mounted CSS、资源文件、NodeGraph 函数和 Animation 表达式。
4. registry 只负责注册、取消注册、聚合查询和按 id 查找，不负责解析源码、生成符号或决定 UI 文案。

### 3. Symbol 与 Scope 契约

Phase 1 只定义符号和作用域形状，不实现全量索引。

```ts
type CodeSymbol = {
  id: string;
  name: string;
  kind: CodeSymbolKind;
  typeRef?: string;
  source: SymbolSource;
  scopeId: string;
  targetRef?: DiagnosticTargetRef;
};

type CodeScope = {
  id: string;
  parentId?: string;
  kind: CodeScopeKind;
  ownerRef: DiagnosticTargetRef;
};
```

稳定性要求：

1. `id` 是符号主键，`name` 只用于显示和源码匹配。
2. `scopeId` 是解析边界，不能用全局字符串搜索替代。
3. `targetRef` 是跳转和诊断投放入口。
4. `typeRef` 是类型引用，不在 Phase 1 规定完整类型系统。

### 3.1 CodeSymbol Provider 契约

Phase 1 不直接从 PIR、Route、NodeGraph、Animation、External Library 或 Workspace 当前内部结构扫描符号。各模块未来通过 provider 声明自己能提供哪些符号和作用域。

```ts
type CodeSymbolProvider = {
  id: string;
  source: SymbolSource;
  listSymbols(context: AuthoringContext): CodeSymbol[];
  listScopes(context: AuthoringContext): CodeScope[];
  getSymbol(id: string): CodeSymbol | null;
};
```

稳定性要求：

1. Authoring Environment 只依赖 provider contract，不依赖具体模块 store 或 UI 结构。
2. provider 可以随模块内部重构而替换实现，但 `CodeSymbol` 与 `CodeScope` 输出形状保持稳定。
3. registry 只负责注册、取消注册、聚合 symbols、聚合 scopes 和按 id 查找，不负责补全排序、类型推导或引用解析策略。
4. 真实 provider 应优先按 source 拆分，例如 PIR graph、Route manifest、Workspace resource、External Library、NodeGraph 和 Animation。

### 4. AuthoringEnvironment 查询接口

Phase 1 可以提供空实现或最小实现，但接口应稳定。

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

稳定性要求：

1. UI 通过该接口查询符号和诊断。
2. 该接口不暴露内部索引结构。
3. 空实现必须返回空数组或 `null`，不能抛出未实现异常。
4. 未来 worker、缓存、语言服务和增量图索引都只能替换内部实现，不改变查询语义。

### 4.1 Authoring Diagnostic Provider 契约

Phase 1 不直接把 PIR validator、parser、NodeGraph checker 或 Animation checker 写入 UI。各模块未来通过 provider 声明自己能提供哪些作者态诊断。

```ts
type AuthoringDiagnosticProvider = {
  id: string;
  source: SymbolSource;
  getDiagnostics(context: AuthoringContext): ProdivixDiagnostic[];
};
```

稳定性要求：

1. provider 不直接 toast。
2. provider 不决定最终 UI 文案。
3. provider 不依赖具体面板结构。
4. provider 返回的诊断应尽量携带 `targetRef` 或 `sourceSpan`。

### 4.2 Authoring Environment Composition

Phase 1 提供最小 composition，把 artifact、symbol、diagnostic registry 组合成统一查询环境。

```ts
type CreateAuthoringEnvironmentInput = {
  revision: string;
  artifactRegistry?: CodeArtifactProviderRegistry;
  symbolRegistry?: CodeSymbolProviderRegistry;
  diagnosticRegistry?: AuthoringDiagnosticProviderRegistry;
};
```

稳定性要求：

1. `querySymbols(context)` 从 symbol registry 聚合 symbols。
2. `getDiagnostics(context)` 从 diagnostic registry 聚合 diagnostics。
3. `getCompletions(context)` 可以先基于 symbols 生成最小 completion。
4. `resolveReference`、`getDefinition`、`getReferences` 在 resolver contract 落地前保持安全空结果。

### 5. DiagnosticDefinition 最小元数据

前端可以注册诊断元数据，但只注册机器语义，不注册完整 UI 文案。

```ts
type DiagnosticDefinition = {
  code: string;
  domain: DiagnosticDomain;
  severity: DiagnosticSeverity;
  stage: string;
  retryable: boolean;
  docsPath: string;
  defaultPlacement?: DiagnosticPlacement[];
};

type DiagnosticPlacement =
  | 'code-editor'
  | 'inspector'
  | 'blueprint-canvas'
  | 'nodegraph'
  | 'animation-timeline'
  | 'issues-panel'
  | 'operation-status';
```

稳定性要求：

1. `code`、`domain`、`severity`、`stage`、`retryable`、`docsPath` 是机器语义。
2. `defaultPlacement` 只是默认建议，调用点仍可根据 `targetRef` 和 `sourceSpan` 决定主落点。
3. 不在 registry 中写死完整 `message`、`hint`、`userAction` 或本地化文案。
4. 测试断言 code、domain、targetRef、sourceSpan 和 placement 规则，不断言完整自然语言文案。

## 首批 COD Definition

Phase 1 只需要注册首批 `COD-xxxx` 的最小元数据。

| Code       | Domain | Severity  | Stage         | Retryable | 默认落点                            |
| ---------- | ------ | --------- | ------------- | --------- | ----------------------------------- |
| `COD-1001` | `code` | `error`   | `parse`       | false     | Code Editor, Issues                 |
| `COD-1002` | `code` | `error`   | `parse`       | false     | Code Editor, Inspector, Issues      |
| `COD-2001` | `code` | `warning` | `symbol`      | true      | Code Editor, Inspector, Issues      |
| `COD-2002` | `code` | `error`   | `symbol`      | true      | Code Editor, Issues                 |
| `COD-2003` | `code` | `warning` | `symbol`      | false     | Code Editor, Inspector, Issues      |
| `COD-2004` | `code` | `warning` | `symbol`      | true      | Operation Status, Issues            |
| `COD-3001` | `code` | `error`   | `binding`     | false     | Inspector, Blueprint Canvas, Issues |
| `COD-3002` | `code` | `error`   | `binding`     | false     | Code Editor, Inspector, Issues      |
| `COD-3003` | `code` | `warning` | `binding`     | false     | Code Editor, Inspector, Issues      |
| `COD-4001` | `code` | `error`   | `runtime`     | true      | Code Editor, Issues                 |
| `COD-5001` | `code` | `error`   | `compile`     | true      | Code Editor, Issues                 |
| `COD-5002` | `code` | `error`   | `compile`     | false     | Code Editor, Issues                 |
| `COD-9001` | `code` | `error`   | `environment` | true      | Issues                              |

## 明确不做

Phase 1 不做以下内容：

1. 不实现完整符号索引器。
2. 不接 TypeScript language service。
3. 不接 GLSL/WGSL compiler。
4. 不实现 rename、find references、go to definition。
5. 不规定 CodeMirror 插件结构。
6. 不规定 Inspector、NodeGraph、Animation 的具体 UI 组件。
7. 不把用户可见完整文案写进前端 registry。
8. 不改变 PIR 保存态结构。

## 验收标准

1. 前端类型层能表达 `CodeArtifact`、`CodeSymbol`、`CodeScope`、`DiagnosticTargetRef` 和 `SourceSpan`。
2. 诊断对象能携带 `targetRef` 和 `sourceSpan`。
3. `code` domain 能进入 DiagnosticDomain。
4. 首批 `COD-xxxx` 能通过最小 DiagnosticDefinition 查询到稳定机器语义。
5. AuthoringEnvironment 空实现满足查询接口并稳定返回空结果。
6. CodeArtifact provider registry 能注册 provider、聚合 artifact、按 id 查找 artifact，并支持取消注册。
7. CodeSymbol provider registry 能注册 provider、聚合 symbol/scope、按 id 查找 symbol，并支持取消注册。
8. AuthoringDiagnostic provider registry 能注册 provider、聚合 diagnostics，并支持取消注册。
9. `createAuthoringEnvironment` 能组合 symbol 与 diagnostic registry，并保留安全空 resolver 行为。
10. 测试只覆盖稳定契约和公开 API，不依赖 UI 结构、DOM 层级或自然语言文案。

## 后续入口

Phase 1 完成后，后续阶段可以在不改变上述契约的前提下逐步增加：

1. PIR、Route、Workspace 和 CodeArtifact 的轻量符号来源。
2. Inspector 字段级诊断投放。
3. Code Editor inline diagnostic adapter。
4. NodeGraph 和 Animation 的 SymbolSource adapter。
5. worker 与增量索引。
