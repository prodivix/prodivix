# Authoring Environment Stable Structures

## 状态

- Draft
- 日期：2026-05-04
- 关联：
  - `specs/decisions/25.authoring-symbol-environment.md`
  - `specs/implementation/authoring-symbol-environment-phase1.md`
  - `specs/diagnostics/code-diagnostic-codes.md`

## 目的

本文记录 Authoring Environment 后续应保留的长期稳定结构，并区分“当前应实现”“当前只定义轻类型”“当前只保留文档”的边界。

MFE 的 Blueprint、NodeGraph、Animation、Code Editor、Inspector 和 Issues 面板会长期共享同一套作者态环境。为了避免过早绑定具体编辑器内部结构，所有跨编辑器数据来源都应通过 provider 或 resolver contract 接入。

## 当前已落地结构

### 1. CodeArtifact Provider

状态：已实现。

用途：由各模块声明自己能提供哪些用户代码片段。

```ts
type CodeArtifactProvider = {
  id: string;
  source: SymbolSource;
  listArtifacts(context: AuthoringContext): CodeArtifact[];
  getArtifact(id: string): CodeArtifact | null;
};
```

稳定边界：

1. 不扫描具体编辑器 UI 或 store。
2. 不解析源码。
3. 不决定诊断或补全。
4. 只输出稳定 `CodeArtifact`。

典型未来 provider：

1. `BlueprintEventCodeProvider`
2. `MountedCssProvider`
3. `WorkspaceCodeFileProvider`
4. `NodeGraphFunctionProvider`
5. `AnimationExpressionProvider`

### 2. CodeSymbol Provider

状态：已实现。

用途：由各模块声明自己能提供哪些符号和作用域。

```ts
type CodeSymbolProvider = {
  id: string;
  source: SymbolSource;
  listSymbols(context: AuthoringContext): CodeSymbol[];
  listScopes(context: AuthoringContext): CodeScope[];
  getSymbol(id: string): CodeSymbol | null;
};
```

稳定边界：

1. 不直接读取其他模块内部结构。
2. 不做补全排序。
3. 不做完整引用解析。
4. 只输出稳定 `CodeSymbol` 和 `CodeScope`。

典型未来 provider：

1. `PirGraphSymbolProvider`
2. `RouteSymbolProvider`
3. `WorkspaceResourceSymbolProvider`
4. `ExternalLibrarySymbolProvider`
5. `NodeGraphSymbolProvider`
6. `AnimationSymbolProvider`

## 当前应实现结构

### 3. Authoring Diagnostic Provider

状态：应实现。

用途：由各模块声明自己能提供哪些作者态诊断。

```ts
type AuthoringDiagnosticProvider = {
  id: string;
  source: SymbolSource;
  getDiagnostics(context: AuthoringContext): ProdivixDiagnostic[];
};
```

稳定边界：

1. 不直接 toast。
2. 不决定最终 UI 文案。
3. 不依赖具体面板结构。
4. 只返回稳定 `ProdivixDiagnostic`，并尽量携带 `targetRef` 或 `sourceSpan`。

典型未来 provider：

1. `PirValidationDiagnosticProvider`
2. `CodeParseDiagnosticProvider`
3. `InspectorFieldDiagnosticProvider`
4. `NodeGraphDiagnosticProvider`
5. `AnimationDiagnosticProvider`
6. `ExternalLibraryDiagnosticProvider`

### 4. Authoring Environment Composition

状态：应实现。

用途：把 artifact、symbol、diagnostic provider registry 组合成统一查询环境。

```ts
type CreateAuthoringEnvironmentInput = {
  revision: string;
  artifactRegistry?: CodeArtifactProviderRegistry;
  symbolRegistry?: CodeSymbolProviderRegistry;
  diagnosticRegistry?: AuthoringDiagnosticProviderRegistry;
};

function createAuthoringEnvironment(
  input: CreateAuthoringEnvironmentInput
): AuthoringEnvironment;
```

稳定边界：

1. 对外只暴露 `AuthoringEnvironment` 查询接口。
2. 内部可以从 Map registry 演进到 worker、缓存和增量索引。
3. 空 registry 必须安全返回空数组或 `null`。
4. Composition 不绑定 UI，也不绑定具体模块 store。

首批语义：

1. `querySymbols(context)` 聚合 symbol registry 的 symbols。
2. `getDiagnostics(context)` 聚合 diagnostic registry 的 diagnostics。
3. `getCompletions(context)` 可先基于 symbols 生成最小 completion。
4. `resolveReference`、`getDefinition`、`getReferences` 可先返回 `null` 或空数组，直到 resolver contract 落地。

## 当前只定义轻类型

### 5. Authoring Location

状态：可先定义轻类型，不做复杂跳转实现。

用途：统一 definition、reference、diagnostic jump、LLM 修复定位。

```ts
type AuthoringLocation =
  | { kind: 'target'; targetRef: DiagnosticTargetRef }
  | { kind: 'source'; sourceSpan: SourceSpan }
  | {
      kind: 'compound';
      targetRef: DiagnosticTargetRef;
      sourceSpan: SourceSpan;
    };
```

稳定边界：

1. `targetRef` 定位产品对象。
2. `sourceSpan` 定位代码片段文本范围。
3. UI adapter 决定如何打开具体视图。
4. 不直接引用 DOM、CodeMirror state 或 React component。

### 6. Diagnostic Placement Contract

状态：可先定义轻类型，不做完整规则实现。

用途：描述诊断的建议落点和主落点决策。

```ts
type DiagnosticPlacementDecision = {
  primary: DiagnosticPlacement;
  secondary: DiagnosticPlacement[];
  reason: 'source-span' | 'target-ref' | 'default-definition' | 'fallback';
};

type DiagnosticPlacementResolver = {
  resolve(
    diagnostic: ProdivixDiagnostic,
    context: AuthoringContext
  ): DiagnosticPlacementDecision;
};
```

稳定边界：

1. resolver 只做落点决策，不渲染 UI。
2. `sourceSpan` 优先指向 Code Editor。
3. `targetRef` 优先指向对应产品对象 adapter。
4. `defaultPlacement` 是兜底建议，不替代调用点判断。

## 当前只保留文档

### 7. Reference Resolver Contract

状态：暂缓实现，只保留文档。

原因：真实解析策略依赖 PIR scope、Route params、NodeGraph 端口类型、Animation binding 和 CodeArtifact parser。当前实现会过早假设。

未来形态：

```ts
type ReferenceResolver = {
  id: string;
  canResolve(reference: CodeReference, context: AuthoringContext): boolean;
  resolve(
    reference: CodeReference,
    context: AuthoringContext
  ): ResolvedReference | null;
};
```

适合落地时机：

1. `PirGraphSymbolProvider` 已提供基础 node/prop/data/list scope。
2. 至少一个 CodeArtifact provider 接入真实代码片段。
3. Code Editor 或 Inspector 需要真实 go to definition。

### 8. Capability Provider Contract

状态：暂缓实现，只保留文档。

原因：capability 来源会涉及 sandbox、导出目标、外部库 profile、组件能力、NodeGraph 和 Animation。当前阶段直接实现容易把策略写死。

未来形态：

```ts
type CodeCapability = {
  id: string;
  source: SymbolSource;
  targetRef?: DiagnosticTargetRef;
};

type AuthoringCapabilityProvider = {
  id: string;
  listCapabilities(context: AuthoringContext): CodeCapability[];
};
```

适合落地时机：

1. `COD-3003` 开始接真实校验。
2. sandbox 或导出目标能力矩阵成型。
3. 外部库能力和组件能力已有稳定 profile。

### 9. Authoring Snapshot / Revision Contract

状态：暂缓实现，只保留文档。

原因：snapshot 字段应等 composition 接入真实 provider 数据后再冻结，否则容易成为空壳或频繁改字段。

未来形态：

```ts
type AuthoringSnapshot = {
  revision: string;
  artifacts: CodeArtifact[];
  symbols: CodeSymbol[];
  scopes: CodeScope[];
  diagnostics: ProdivixDiagnostic[];
};
```

适合落地时机：

1. 至少一个 artifact provider 和一个 symbol provider 接入真实数据。
2. 需要 worker 缓存、LLM context bundle 或 debug dump。
3. revision 失效策略稳定。

## 实施顺序

建议顺序：

1. 完成 `AuthoringDiagnosticProvider` 与 registry。
2. 完成 `createAuthoringEnvironment` composition。
3. 定义 `AuthoringLocation` 轻类型。
4. 定义 `DiagnosticPlacementDecision` 轻类型。
5. 接入首个真实 provider，优先选择稳定性最高的 PIR graph symbol provider。
6. 在真实 provider 出现后再评估 Reference Resolver。
7. 在 capability 来源稳定后再评估 Capability Provider。
8. 在 worker 或 LLM context 需要稳定数据包时再评估 Snapshot。

## 验收原则

1. Provider contract 只依赖稳定类型，不依赖 UI 结构。
2. Registry 只聚合和查找，不承载领域策略。
3. Composition 只实现查询协议，不绑定具体模块。
4. 复杂 resolver、capability、snapshot 必须等真实来源稳定后再实现。
5. 测试只覆盖公开 API、稳定字段和定位语义，不断言自然语言文案或 DOM 结构。
