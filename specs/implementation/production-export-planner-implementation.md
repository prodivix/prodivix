# Production Export Planner Implementation Plan

## 状态

- Draft
- 日期：2026-06-28
- 关联：
  - `specs/decisions/31.production-export-planner.md`
  - `specs/decisions/05.workspace-vfs.md`
  - `specs/decisions/08.route-manifest-outlet.md`
  - `specs/decisions/09.component-route-composition.md`
  - `specs/decisions/25.authoring-symbol-environment.md`
  - `specs/decisions/28.code-authoring-environment.md`
  - `specs/decisions/30.react-flow-nodegraph-editor.md`
  - `specs/codegen/react-production-policy-v1.md`
  - `specs/implementation/code-authoring-environment-phase2.md`

## 1. 最终目标

将当前 React 导出链路从“领域编译器直接产出最终文件”迁移为“领域编译器产出 Export Program IR，Production Export Planner 统一规划文件拓扑”。

最终状态：

1. Blueprint、NodeGraph、Animation、CodeArtifact、Assets 都通过 Export Program contribution 接入导出。
2. 领域编译器只表达模块、样式、资源、运行时和依赖意图，不直接决定最终文件路径。
3. CSS 以 component、route/page、layout、global stylesheet bundle 聚合，不再按 node、slot 或 authoring artifact 生成文件。
4. JS / TS 以 component、page、domain module、runtime helper、workspace module 等生产运行时边界组织。
5. 外部源码、vendor 文件、plugin contribution、remote asset 和 workspace module 都有明确 origin、ownership、license、hash 和 update policy。
6. 导出结果保留从产物 contribution 回到 PIR / CodeArtifact / NodeGraph / Animation 的 source trace。
7. React / Vite 是首个 target preset，但类型和 planner 结构必须能扩展到 Vue、Svelte、Solid、Lit、Astro、原生 Web Components 等目标。
8. 删除旧的 `mountedCssFiles` 作为最终文件模型，不写兼容层。

## 2. 当前状态

已有基础：

1. `compilePirToReactComponent` 已生成 React module、dependency origin、stylesheet contribution、workspace artifact contribution 和 runtime requirement。
2. React project scaffold 已通过 `ExportProgram` / `ProductionExportPlanner` 规划 Vite React 项目。
3. `ReactGeneratorCodeArtifact` 已表达 React generator 内部的一部分代码 artifact。
4. Export 页面已把 Workspace project files、public assets、i18n config、external library config 和 dependency intent 投影为 `ExportProgramContribution`，不再在页面层手工拼接最终文件列表。
5. `ExportFileContribution.baseDirectory` 已支持 `project-root`、`source-root`、`public-root` 路径语义，源码内资源由 target preset 的 `sourceRoot` 统一落位。
6. `compileNodeGraphExportContributions` 已提供 NodeGraph 领域模块 contribution 的稳定接入口，并通过 shared `nodegraph-runtime` helper 暴露 definition + execution context 边界。
7. `compileAnimationExportContributions` 已提供 Animation timeline module、Web Animations keyframe manifest、style contribution、SVG filter manifest 和 runtime requirement 的稳定接入口。
8. `ExportBundle.metadata` 已包含 `pathRewrites`、`referencedAssets`、`dependencySummary`、`sourceTraceCount` 和 `sourceTraceSummary`。
9. Planner 已生成 `.prodivix/export-manifest.json`，记录最终文件、最终入口、依赖、path rewrite、referenced asset、diagnostics 和 source trace 摘要，供真实项目审计与后续工具读取；它是导出工具元数据，不属于业务源码目录。
10. `ExportFile.contentHash` 已覆盖所有导出文件，origin 缺省 hash 由 planner 注入。
11. `specs/decisions/31.production-export-planner.md` 已冻结导出规划器的长期边界。
12. Planner 已生成 `.prodivix/origins.json` 与 `.prodivix/licenses.json`，并在 bundle metadata 中暴露 `originSummary`、`licenseSummary`、`deploymentSummary` 和 `diagnosticSummary`。
13. Asset contribution 已支持 `copy`、`public`、`vendor`、`reference` 四类 delivery policy：复制资源进入 `src/assets`，public 资源进入 `public`，vendor 资源进入 `src/vendor/assets`，reference 资源只进入审计 metadata。
14. Export origin policy 已接入 planner diagnostics，缺失 owner、writePolicy、updatePolicy、第三方 identity、license 或引用型 vendored hash 时会输出 `source: "export"` 的诊断。
15. Export 页面默认加入 neutral `static-hosting` deployment contribution，输出 `.prodivix/static-hosting.json` 而不是把部署配置混入业务源码。
16. `codeArtifactPlanner.ts` 已成为 workspace code document / CodeArtifact 投影到 `ExportArtifactContribution` 的共享入口，React compiler 不再私有维护 shader、TS/JS、JSON、CSS artifact 的路径与 kind 规则。
17. Export 页面通过 `AuthoringEnvironment.listArtifacts` 获取 CodeArtifact，再传入 compiler；页面层不直接扫描 code document 内容。
18. `ExportArtifactContribution` 已作为目标文件类型的统一上层入口接入 planner：style artifact 展开为 stylesheet contribution，asset artifact 展开为 asset contribution，source/runtime/domain/shader/config/deployment/metadata/documentation/adapter artifact 展开为 file contribution。
19. Export 页面已把 project files、public assets、i18n resources 和 external library config 改为 artifact contribution，再交由 planner 统一规划路径、delivery policy、origin 和 manifest。
20. 主屏 diagnostics 已区分编译/生成问题与 export origin/license 审计缺口；`source: "export"` 的来源策略诊断进入 `.prodivix` 审计文件和 license/origin summary，不再作为顶部 warning banner 直接显示。
21. `packageOriginResolver.ts` 已抽出 package origin/license 源头，React compiler 与 React / Vite scaffold 共用同一套 `createExportPackageOrigin`，避免 `@prodivix/ui` 等依赖在不同链路中丢失 license/owner。
22. CodeArtifact 的 TS/JS/JSON/shader 文件与 mounted CSS artifact 已迁移到 `ExportArtifactContribution`；React compile result 不再把 workspace code artifact 暴露为低层 file contribution。
23. `sourceResolver.ts` 已作为外部来源解析层接入，统一 package、esm.sh / remote URL、vendored、plugin、workspace document 和 generated source 的 owner、writePolicy、updatePolicy、deliveryPolicy 与 origin kind。
24. `PackageResolution` 已携带 `sourceKind` 与 `url`，React compiler 可以区分 npm package、esm.sh URL、远程 URL 和相对导入。
25. Planner 已在 manifest 与 bundle metadata 中输出 `sourceSummary`，供后续审计 UI、Git 投影和 license/source review 不再重复扫描 origins。
26. `ExportProgram.sources` 已作为“引用但不生成文件、不进入 package.json”的外部来源入口，例如 esm.sh / remote URL import；这些来源仍会进入 origins 和 sourceSummary。

主要缺口：

1. Code Authoring Environment 的 artifact、symbol、scope、origin 和 ownership 尚未成为导出输入的完整标准来源。
2. NodeGraph contribution 目前保留 graph definition、execution context 和 runtime executor 边界，尚未实现完整节点语义编译。
3. Animation contribution 已能把 style / css-filter track 编译为 Web Animations keyframe，SVG filter attr 目前先输出 filter manifest，尚未生成完整运行时 SVG attribute patcher。
4. Shader、adapter、更多 deployment target、vendored/remote asset UI 和 lockfile/license resolver 仍需继续接入。
5. Export 页面还需要展示 path rewrite、referenced asset、origin、license、deployment、dependency 和 source trace metadata。

## 3. 目标架构

新增 compiler 侧导出规划模块：

```text
packages/prodivix-compiler/src/export/
  types.ts
  codeArtifactPlanner.ts
  programBuilder.ts
  planner.ts
  pathPlanner.ts
  importPlanner.ts
  dependencyPlanner.ts
  stylePlanner.ts
  sourceTrace.ts
  presets/
    reactVite.ts
```

主链路：

```text
Workspace VFS / PIR / CodeArtifact / NodeGraph / Animation / Assets
  -> Domain Compilers
  -> ExportArtifact / ExportModule / ExportStyle / ExportAsset Contributions
  -> ExportProgramBuilder
  -> ExportProgram
  -> ProductionExportPlanner
  -> ExportBundle
  -> Target Scaffold Writer
```

核心职责：

1. **Domain Compilers**：产出语义 contribution，例如 React module、target artifact、style contribution、runtime requirement、asset contribution、dependency intent。
2. **ExportProgramBuilder**：聚合不同领域的 contribution，补齐 root、owner、source trace、dependency 和 diagnostics。
3. **ProductionExportPlanner**：根据 target preset 规划生产文件边界、路径、import、stylesheet bundle、runtime helper、asset copy 和 scaffold。
4. **Target Scaffold Writer**：只负责把 `ExportBundle.files` 写成 zip / VFS projection / preview file list，不再理解 authoring artifact 细节。

## 4. 核心类型

### 4.1 ExportProgram

```ts
type ExportProgram = {
  target: ExportTarget;
  roots: ExportRoot[];
  artifacts: ExportArtifactContribution[];
  modules: ExportModule[];
  styles: ExportStyleContribution[];
  assets: ExportAssetContribution[];
  files: ExportFileContribution[];
  sources: ExportSourceOrigin[];
  runtimeRequirements: ExportRuntimeRequirement[];
  dependencies: ExportDependency[];
  diagnostics: CompileDiagnostic[];
  metadata?: ExportProgramMetadata;
};
```

### 4.1.1 ExportArtifactContribution

```ts
type ExportArtifactKind =
  | 'source'
  | 'style'
  | 'runtime'
  | 'domain'
  | 'shader'
  | 'asset'
  | 'config'
  | 'deployment'
  | 'metadata'
  | 'documentation'
  | 'adapter';

type ExportArtifactContribution = {
  id: string;
  kind: ExportArtifactKind;
  ownerRootId?: string;
  suggestedName: string;
  language?: string;
  mimeType?: string;
  contents?: string | Uint8Array;
  sourcePath?: string;
  publicPath?: string;
  placement?: {
    desiredPath?: string;
    baseDirectory?: 'project-root' | 'source-root' | 'public-root';
    deliveryPolicy?: 'copy' | 'reference' | 'vendor' | 'public';
    importMode?: 'module' | 'side-effect' | 'asset-url' | 'copy-only';
    fileKind?: ExportFileKind;
    styleScope?: 'component' | 'route' | 'layout' | 'global';
  };
  sourceTrace: ExportSourceTrace[];
  origin?: ExportSourceOrigin;
};
```

`ExportArtifactContribution` 是页面层、Code Authoring Environment、plugin、Workspace VFS 和外部资源进入导出器的首选入口。Planner 会在内部把它展开成 file/style/asset contribution；领域编译器已经明确 production module 边界时，仍可直接输出 `ExportModule`、`ExportStyleContribution` 或 `ExportAssetContribution`。

### 4.2 ExportRoot

```ts
type ExportRoot = {
  id: string;
  kind: 'app' | 'route' | 'page' | 'component' | 'nodegraph' | 'animation';
  displayName: string;
  routePath?: string;
  sourceRef: DiagnosticTargetRef;
};
```

### 4.3 ExportModule

```ts
type ExportModuleKind =
  | 'react-component'
  | 'react-entry'
  | 'nodegraph-runtime'
  | 'animation-runtime'
  | 'event-handler'
  | 'adapter'
  | 'workspace-module'
  | 'runtime-helper'
  | 'domain-module';

type ExportModule = {
  id: string;
  kind: ExportModuleKind;
  ownerRootId?: string;
  suggestedName: string;
  language: 'ts' | 'tsx' | 'js' | 'jsx';
  imports: ExportImportIntent[];
  body: string;
  sourceTrace: ExportSourceTrace[];
  origin?: ExportSourceOrigin;
};
```

### 4.4 ExportStyleContribution

```ts
type ExportStyleContribution = {
  id: string;
  ownerRootId?: string;
  scope: 'component' | 'route' | 'layout' | 'global';
  suggestedName?: string;
  cssText: string;
  orderHint?: ExportOrderHint;
  selectors?: string[];
  imports?: ExportImportIntent[];
  sourceTrace: ExportSourceTrace[];
  origin?: ExportSourceOrigin;
};
```

### 4.5 ExportFile

```ts
type ExportFileKind =
  | 'source-module'
  | 'stylesheet'
  | 'runtime-module'
  | 'domain-module'
  | 'shader'
  | 'asset'
  | 'config'
  | 'deployment'
  | 'metadata'
  | 'documentation';

type ExportFile = {
  path: string;
  kind: ExportFileKind;
  language?: string;
  mimeType?: string;
  importMode?: 'module' | 'side-effect' | 'asset-url' | 'copy-only';
  contents: string | Uint8Array;
  sourceTrace: ExportSourceTrace[];
  origin?: ExportSourceOrigin;
};
```

### 4.6 ExportSourceOrigin

```ts
type ExportSourceOriginKind =
  | 'generated'
  | 'workspace-document'
  | 'external-package'
  | 'plugin'
  | 'vendored'
  | 'remote-url';

type ExportSourceOrigin = {
  kind: ExportSourceOriginKind;
  owner?: 'prodivix' | 'workspace' | 'plugin' | 'third-party';
  packageName?: string;
  packageVersion?: string;
  url?: string;
  license?: string;
  contentHash?: string;
  writePolicy?: 'generated' | 'preserve-user-edits' | 'copy' | 'reference-only';
  updatePolicy?: 'regenerate' | 'pin' | 'manual' | 'follow-package';
};
```

## 5. 目标文件类型

Planner 必须从第一版开始支持通用 file kind，而不是只支持 React source 和 CSS。

| File kind        | 示例路径                         | 来源                         | 说明                               |
| ---------------- | -------------------------------- | ---------------------------- | ---------------------------------- |
| `source-module`  | `src/routes/home/Home.tsx`       | Blueprint / Workspace module | 普通 TS / TSX / JS / JSX 源码      |
| `stylesheet`     | `src/routes/home/Home.css`       | mounted CSS / theme / layout | 聚合后的 CSS bundle                |
| `runtime-module` | `src/runtime/prodivix-events.ts` | Runtime requirement          | 共享 runtime helper                |
| `domain-module`  | `src/logic/nodegraphs/fetch.ts`  | NodeGraph / Animation        | 领域运行时模块                     |
| `shader`         | `src/shaders/wave.glsl`          | Animation / WebGL adapter    | GLSL / WGSL 等 shader 文件         |
| `asset`          | `src/assets/logo.svg`            | Assets / remote / plugin     | 图片、字体、二进制资源             |
| `config`         | `vite.config.ts`                 | Target preset                | 构建工具配置                       |
| `deployment`     | `nginx.conf`                     | Deployment target            | 部署配置                           |
| `metadata`       | `package.json`                   | Planner                      | 包信息、manifest、license metadata |
| `documentation`  | `README.md`                      | Target preset / template     | 导出项目文档                       |

## 6. 外部源码与资源模型

Production Export Planner 不应把所有输入都视为生成文本。进入导出的来源至少包括：

1. Prodivix 生成的源码。
2. Workspace VFS 中用户维护的 code document。
3. npm / esm.sh 等外部 package import。
4. plugin 提供的 adapter、runtime helper、template 或 asset。
5. vendored 到项目内的第三方源码或资源。
6. remote URL asset，例如字体、图片、CDN 脚本。

规则：

1. 所有非 generated origin 都必须携带 origin metadata。
2. 可复制到项目内的文件需要 `writePolicy`；只引用不复制的资源使用 `reference-only`。
3. 第三方来源需要尽量携带 `license`、`packageName`、`packageVersion` 或 `url`。
4. vendored 文件需要 `contentHash`，用于后续检查是否被用户修改或上游变更。
5. workspace document 的 production path 可以尊重用户路径，但仍要经过 path planner 防止冲突和越界。
6. plugin contribution 必须通过稳定插件贡献接口进入 Export Program，不允许 planner 直接读取插件内部私有状态。
7. reference asset 不生成产物文件，但必须进入 `.prodivix/export-manifest.json`、origin summary 和 license summary。
8. public asset 是部署静态根的一部分，不应被误搬到 `src/assets`；vendor asset 则必须明确进入 `src/vendor/assets` 这类可审计目录。
9. package、esm.sh、remote URL、vendored、plugin、workspace document 和 generated source 必须通过 `sourceResolver.ts` 或其上层封装进入 `ExportSourceOrigin`，不要在业务 UI 或领域编译器里手写来源策略对象。
10. 只引用不安装、也不生成文件的来源必须进入 `ExportProgram.sources`，而不是伪造成 dependency 或 asset。

## 7. 与 Code Authoring Environment 的连接

Export Program Builder 只能从稳定作者态接口读取 code-owned 内容：

1. 从 Code Authoring Environment 获取 CodeArtifact、CodeReference、CodeSlot binding、artifact lifecycle 和 workspace code document。
2. 从 Authoring Symbol Environment 获取 symbol、scope、export、diagnostic、source span 和引用关系。
3. 从 Workspace VFS 获取 asset、config、route manifest 和 project metadata。
4. 从 NodeGraph / Animation 的稳定编译接口获取领域 contribution。

禁止：

1. Planner 直接扫描 Blueprint / NodeGraph / Animation 编辑器内部 store。
2. Planner 通过裸字符串猜测模块 ownership。
3. 三编辑器绕过 Code Authoring Environment，把任意源码字符串塞进导出器。
4. 使用 authoring node id、slot id、track id 作为生产文件边界。

实现要求：

1. CodeArtifact 到 export contribution 的投影必须通过 compiler 侧共享 helper，例如 `codeArtifactPlanner.ts`，不应散落在 React、NodeGraph、Animation 各自编译器里。
2. CSS artifact 进入 `ExportArtifactContribution(kind: "style")` 或低层 `ExportStyleContribution`，由 `stylePlanner` 聚合；TS/JS/JSON/shader artifact 进入 `ExportArtifactContribution` 后由 planner 展开为 file contribution。
3. Shader artifact 使用 `kind: "shader"` 与 `importMode: "asset-url"`，作为后续 WebGL/WebGPU adapter 和 Animation shader track 的共同基础。
4. Export UI、AI、Issues 和 compiler bridge 都应通过 Code Authoring Environment 的稳定接口读取 CodeArtifact，不直接遍历 workspace document 私有结构。
5. Project files、i18n、external library config、deployment config、plugin template 和 public asset 不应绕过 artifact 层在 UI 里直接拼最终文件列表。
6. Package、remote URL、vendored 和 plugin 来源不应各自手写 origin；统一走 `sourceResolver.ts`，package metadata 通过 `packageOriginResolver.ts` 补齐。

## 8. 落地阶段

### Gate A：Export IR 与 Planner 骨架

交付物：

1. 新增 `packages/prodivix-compiler/src/export/types.ts`。
2. 新增 `ProductionExportPlanner` shell，输入 `ExportProgram`，输出 `ExportBundle`。
3. 新增 path normalization、relative import path、file conflict resolution、dependency merge helper。
4. 新增 React / Vite target preset 的最小目录规则。

验收：

1. Planner unit tests 覆盖路径规范化、重复文件冲突、相对 import 计算、dependency 去重。
2. `ExportFile` 具备 `kind`、`mimeType`、`importMode`、`sourceTrace`。
3. 不改现有 UI 行为。

### Gate B：React compiler 迁移到 ExportProgram

交付物：

1. `compilePirToReactComponent` 产出 `ExportModule` 和 `ExportStyleContribution`，不再返回最终 CSS 文件。
2. `mountedCssFiles` 从公共 compile result 中删除。
3. React project scaffold 消费 `ExportBundle.files`。
4. CSS import 由 planner 注入到 owning module。

验收：

1. React 导出仍可生成可运行 Vite 项目。
2. 产物中不出现 `styles/mounted/<node-id>.css` 这类节点级文件。
3. 编译测试断言文件语义和 import 关系，不断言内部临时字段。

### Gate C：CSS Projection

交付物：

1. 新增 `stylePlanner.ts`，把 `ExportStyleContribution` 聚合为 stylesheet bundle。
2. 支持 component、route/page、layout、global 四层 stylesheet。
3. 过滤空 CSS、只有占位注释的 CSS、未引用 CSS、失效 owner CSS、cleared selector / className CSS。
4. 建立稳定排序：global -> layout -> route/page -> component，同 bundle 内按 source order / tree order / artifact id 排序。

验收：

1. 同一组件的 mounted CSS 聚合到组件 stylesheet。
2. 页面级 mounted CSS 聚合到 route/page stylesheet。
3. 同一 artifact 被多处引用时只输出一次。
4. 空 CSS 和未引用 CSS 不进入产物。

### Gate D：外部来源与通用文件类型

交付物：

1. 升级现有 `ReactExportFile` 或替换为通用 `ExportFile`。
2. 所有文件携带 `kind`、`language` / `mimeType`、`sourceTrace` 和可选 `origin`。
3. 建立 `ExportSourceOrigin` 到 package dependency、asset copy、license metadata 的连接。
4. Workspace code document 可以作为 `workspace-module` contribution 进入导出。

验收：

1. 外部 package dependency 去重并进入 `package.json`。
2. workspace module path 经过 path planner 后进入产物。
3. vendored / remote / plugin origin 能在 bundle metadata 中追踪。

### Gate E：NodeGraph 与 Animation 接入

交付物：

1. NodeGraph compiler 输出 `nodegraph-runtime` / `domain-module` contribution。
2. Animation compiler 输出 animation runtime module、CSS keyframes style contribution、shader asset contribution。
3. Planner 统一生成 shared runtime helper，避免每个 graph / timeline 重复写 helper。
4. 建立 shared usage 分析：多 root 共享模块提升到 shared runtime 或 shared domain module。

验收：

1. NodeGraph 不以单个 node 生成文件，而以 graph / domain module 生成文件。
2. Animation 不以 track / keyframe 生成 TS 文件，而以 timeline / stylesheet / shader asset 生成文件。
3. shared runtime helper 只生成一次。

### Gate F：Target Presets

交付物：

1. 固化 React / Vite preset。
2. 抽象 framework preset 接口，预留 Vue、Svelte、Solid、Lit、Astro、Web Components。
3. 抽象 deployment preset 接口，预留 Nginx、Cloudflare、Vercel、Netlify、GitHub Pages。
4. 建立 deployment contribution summary，部署配置文件与部署 metadata 一起进入 `.prodivix/export-manifest.json`。

验收：

1. React / Vite preset 不把 React 专有规则写死在通用 planner 类型中。
2. 新 target 可以复用 path、import、dependency、style、asset planner。
3. Scaffold writer 只消费 `ExportBundle`，不反向读取 compiler 内部状态。
4. Neutral static-hosting metadata 可以无侵入进入导出目录，平台专属配置由显式 deployment target contribution 生成。

## 9. 测试策略

只测试稳定语义，不测试 DOM 层级、内部 class、具体标签结构或临时字段。

必须覆盖：

1. Path planner：安全路径、重名冲突、非法字符、相对 import、Windows / POSIX 分隔符。
2. Import planner：package import、relative module import、CSS side-effect import、asset URL import。
3. Dependency planner：版本去重、peer dependency、runtime helper dependency、plugin dependency。
4. Style planner：bundle 分层、空 CSS 过滤、稳定排序、重复 artifact 去重、owner 失效过滤。
5. Export bundle：file kind、mime type、source trace、origin metadata。
6. React compiler：React module 与 stylesheet contribution 的语义，不再断言 `mountedCssFiles`。
7. External origin：workspace document、external package、plugin、vendored、remote URL 的元数据保留。
8. Diagnostics：compile diagnostic 可以从产物 contribution 回溯到作者态 `sourceRef`。

不做：

1. 不写依赖 DOM 结构的导出测试。
2. 不为旧 `mountedCssFiles` 写兼容测试。
3. 不把某个临时目录模板当成长期 API 过度固化。

## 10. Cutover 规则

alpha 阶段直接切换，不保留兼容层。

1. 删除 `mountedCssFiles` 作为公共 compiler result。
2. 删除节点级 mounted CSS 文件输出。
3. Export 页面消费 `ExportBundle.files`，不直接消费 React compiler 内部结果。
4. 旧测试 fixture 若依赖 `mountedCssFiles`，直接改为 Export Program / Export Bundle 语义断言。
5. 文档和类型同时更新，避免“新旧两套导出模型”并存。

## 11. 验收标准

- [x] `packages/prodivix-compiler/src/export/` 存在 Export Program 和 planner 基础模块。
- [x] React 导出从 `ExportProgram` 规划出 `ExportBundle`。
- [x] 公共 compile result 不再暴露 `mountedCssFiles`。
- [x] 产物 CSS 不按 node id、slot id 或 mounted artifact id 分文件。
- [x] CSS 按 component、route/page、layout、global bundle 聚合。
- [x] JS / TS 文件按 component、page、domain module、runtime helper、workspace module 边界组织。
- [x] ExportFile 支持 source-module、stylesheet、runtime-module、domain-module、shader、asset、config、deployment、metadata、documentation。
- [x] 外部 source / asset origin 能记录 ownership、license、hash、writePolicy 和 updatePolicy，并通过 origin policy diagnostics 暴露缺口。
- [x] Workspace project files、public assets、i18n resources 和 external library config 通过 contribution 接入 planner。
- [x] Workspace project files、public assets、i18n resources 和 external library config 已迁移到 `ExportArtifactContribution` 上层入口。
- [x] External library package dependency 能进入 planner dependency merge，并由 React / Vite scaffold 写入 `package.json`。
- [x] 文件 contribution 支持 source-root / public-root / project-root 路径语义。
- [x] Bundle metadata 能记录 path rewrite、referenced asset、diagnostic summary 和 source trace summary。
- [x] 导出产物包含 `.prodivix/export-manifest.json` 作为稳定审计入口，并记录最终入口与 diagnostics。
- [x] 导出产物包含 `.prodivix/origins.json` 与 `.prodivix/licenses.json` 作为来源和 license 审计入口。
- [x] 导出文件包含稳定 `contentHash`，供后续覆盖、审计和 Git 投影使用。
- [x] Asset delivery policy 可以区分 copy、public、vendor 和 reference。
- [x] Deployment contribution 可以进入 planner，并在 manifest / metadata 中输出 deployment summary。
- [x] CodeArtifact 文件与 CSS 投影已经抽到共享 `codeArtifactPlanner.ts`，供 Blueprint、NodeGraph、Animation 后续复用。
- [x] CodeArtifact 文件与 mounted CSS artifact 已通过 `ExportArtifactContribution` 进入 planner，不再作为 React compiler 私有 file/style 输出。
- [x] Package origin/license 已抽到 `packageOriginResolver.ts`，React compiler 和 React / Vite scaffold 共用同一源头。
- [x] 外部来源解析层已抽到 `sourceResolver.ts`，覆盖 package、esm.sh / remote URL、vendored、plugin、workspace document 和 generated source。
- [x] Manifest / bundle metadata 已输出 `sourceSummary`。
- [x] `ExportProgram.sources` 已支持 remote/esm-sh 等 reference-only 来源进入 manifest/origin/source summary。
- [x] Export 页面读取 CodeArtifact 已接入 `AuthoringEnvironment.listArtifacts`，不再自行扫描 code document。
- [x] NodeGraph 和 Animation 能通过 contribution 接入同一 planner。
- [x] Source trace 可以从导出文件回溯到作者态对象。
- [x] Export 页面只消费最终 bundle list 和 diagnostics。
- [x] 主屏不直接展示 export origin/license 审计 warning；审计详情进入 summary 与 `.prodivix/*` 文件。

## 12. 非目标

1. 不一次性实现所有 framework target。
2. 不一次性实现 CSS Modules、code splitting、source map、tree shaking 的全部高级能力。
3. 不把 Workspace VFS path 简单等同于 production path。
4. 不为旧 mounted CSS 文件模型保留兼容层。
5. 不要求本阶段实现完整 License UI 或 dependency audit UI，但 origin metadata 必须预留。
