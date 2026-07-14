# Code Diagnostics 编码规范（COD）

## 状态

- Draft
- 日期：2026-05-04
- 关联：
  - `specs/diagnostics/README.md`
  - `specs/decisions/25.authoring-symbol-environment.md`
  - `specs/decisions/21.inspector-panel-architecture.md`
  - `specs/decisions/20.node-graph-port-semantics.md`
  - `specs/pir/PIR-contract-v1.3.md`

## 1. 范围

`COD-xxxx` 覆盖用户在 Prodivix 中编写、挂载、引用和执行的代码片段，以及这些代码片段依赖的共享符号环境。

包括：

1. Code Editor 中的 TypeScript、JavaScript、CSS、SCSS、GLSL、WGSL 和表达式片段。
2. Blueprint 中的事件代码、Mounted CSS、绑定表达式和节点级代码挂载。
3. NodeGraph 暴露给代码环境的 graph input、graph output、函数节点、变量节点和端口类型。
4. Animation 中的表达式、filter、track value 和 keyframe 计算逻辑。
5. Route、PIR、Workspace、External Library 等来源注入到代码环境中的共享符号。

不覆盖：

1. PIR 保存态 graph、ValueRef 与 materialize 契约，使用 `PIR-xxxx`。
2. Inspector 写入、拖拽、选择和编辑器交互，使用 `EDT-xxxx`。
3. NodeGraph 结构、端口连线和执行计划本身，使用 `NGR-xxxx`。
4. Animation timeline、binding、track 和 keyframe 结构本身，使用 `ANI-xxxx`。
5. 目标框架项目代码生成和导出产物，使用 `GEN-xxxx`。
6. Prodivix 自身前端应用崩溃。后续如需稳定分类，应新增独立应用运行时域。

## 2. 阶段

```ts
type CodeDiagnosticStage =
  'parse' | 'symbol' | 'binding' | 'runtime' | 'compile' | 'environment';
```

## 3. 编码分段

| 段位       | 阶段          | 说明                                          |
| ---------- | ------------- | --------------------------------------------- |
| `COD-10xx` | `parse`       | 源码解析、语言模式、片段形状                  |
| `COD-20xx` | `symbol`      | 符号解析、类型、import、共享环境 revision     |
| `COD-30xx` | `binding`     | 代码片段与 Blueprint/NodeGraph/Animation 契约 |
| `COD-40xx` | `runtime`     | 用户代码运行时、sandbox、worker、执行权限     |
| `COD-50xx` | `compile`     | 转译、编译、shader compile、语言服务产物      |
| `COD-90xx` | `environment` | 代码环境未知异常                              |

## 4. 已占用码位

### `COD-1001` 代码解析失败

- Severity: `error`
- Stage: `parse`
- Retryable: false
- Trigger: 用户代码片段无法被当前语言 parser 解析，例如 TypeScript、JavaScript、CSS、GLSL、WGSL 或表达式语法错误
- User action: 根据 Code Editor 中的行列提示修正语法错误
- Developer notes: 诊断应尽量包含 `sourceSpan`、`artifactId` 和语言模式；UI 主落点是 Code Editor inline diagnostic

### `COD-1002` 不支持的语言模式

- Severity: `error`
- Stage: `parse`
- Retryable: false
- Trigger: 代码片段声明的 language 不在当前 Authoring Environment 支持列表中
- User action: 切换为当前功能支持的代码语言，或移除该代码片段
- Developer notes: Inspector、Code Editor 和导入器必须共享语言模式枚举，避免出现无法编辑但可保存的片段

### `COD-1003` 代码片段为空或形状非法

- Severity: `warning`
- Stage: `parse`
- Retryable: false
- Trigger: 代码片段为空、只有注释、缺少入口、缺少声明部分，或片段形状不符合当前宿主要求
- User action: 补全代码片段内容，或删除不需要的空片段
- Developer notes: 空代码不一定是 parser 错误；该码用于区分“没有可执行/可分析内容”和真实语法错误

### `COD-1004` 表达式片段不是单一表达式

- Severity: `error`
- Stage: `parse`
- Retryable: false
- Trigger: 绑定表达式、条件表达式、computed value 或动画表达式包含多条语句、声明或无法作为单一表达式求值的结构
- User action: 将片段改为单一表达式，或切换到支持语句块的代码宿主
- Developer notes: 表达式模式和脚本模式必须分开处理；不要把表达式片段强行包成函数后吞掉错误

### `COD-1005` 代码片段包含当前模式禁止的顶层语句

- Severity: `error`
- Stage: `parse`
- Retryable: false
- Trigger: 当前代码模式禁止 `import`、`export`、`await`、`return`、DOM 全局写入或其他顶层语句，但片段包含了这些结构
- User action: 移除不允许的顶层语句，或把代码移动到支持该结构的资源文件或模块中
- Developer notes: 禁止列表应来自 CodeArtifact language/mode 和宿主能力，不应由单个编辑器硬编码

### `COD-1006` 源码编码或文本范围非法

- Severity: `error`
- Stage: `parse`
- Retryable: false
- Trigger: 代码片段包含无法解码字符、非法 surrogate、损坏换行，或上游诊断返回的 source range 超出片段边界
- User action: 重新输入或粘贴代码，移除异常字符后重试
- Developer notes: 该码用于保护 sourceSpan、语言服务和编辑器装饰层；不要把范围越界折叠成未知异常

### `COD-2001` 符号无法解析

- Severity: `warning`
- Stage: `symbol`
- Retryable: true
- Trigger: 代码片段引用的变量、节点、route param、graph output、data scope 或外部导出无法在当前作用域中解析
- User action: 检查引用名称、当前节点作用域、数据源、路由参数或节点图输出
- Developer notes: 诊断应包含 `symbolId`、`scopeId` 和可选 `targetRef`；同一语义不要折叠到 `PIR-3001`

### `COD-2002` import 无法解析

- Severity: `error`
- Stage: `symbol`
- Retryable: true
- Trigger: 代码片段中的 import specifier 无法映射到 workspace 文档、外部库、esm.sh 依赖或内置模块
- User action: 检查依赖是否已安装、外部库是否已注册，或改用可用的导入路径
- Developer notes: 依赖解析属于作者环境时使用该码；导出目标项目解析失败时使用 `GEN-3001`

### `COD-2003` 类型不兼容

- Severity: `warning`
- Stage: `symbol`
- Retryable: false
- Trigger: 代码片段的表达式、返回值、赋值或调用参数不满足当前符号或宿主字段的类型约束
- User action: 调整表达式类型、返回值或宿主字段配置
- Developer notes: TypeScript language service、NodeGraph 端口类型和 Inspector 字段 schema 应尽量共享类型诊断语义

### `COD-2004` 共享符号环境过期

- Severity: `warning`
- Stage: `symbol`
- Retryable: true
- Trigger: 当前代码诊断基于过期的 Authoring Environment revision，可能不反映最新 Blueprint、NodeGraph、Animation 或 Workspace 状态
- User action: 等待编辑器重新索引，或手动刷新当前项目上下文
- Developer notes: 该诊断用于索引延迟和 worker 同步状态，不应阻断保存；稳定后应自动消失

### `COD-2010` 重命名符号存在冲突

- Severity: `warning`
- Stage: `symbol`
- Retryable: false
- Trigger: rename、AI 修复或批量替换会让新符号名与当前作用域内已有符号、导入、宿主变量或保留名冲突
- User action: 换用不会冲突的名称，或先调整已有符号
- Developer notes: 该码表达作者态符号冲突；目标项目构建阶段的命名冲突使用 `GEN-xxxx`

### `COD-2011` 循环 import 或循环符号依赖

- Severity: `error`
- Stage: `symbol`
- Retryable: false
- Trigger: 代码片段、workspace module、external symbol 或 computed expression 之间形成循环依赖，导致解析或求值无法稳定完成
- User action: 拆分共享逻辑，移除循环 import，或把公共符号移动到独立模块
- Developer notes: 应记录依赖链摘要；不要输出完整源码或完整模块内容

### `COD-2012` 符号解析结果不唯一

- Severity: `warning`
- Stage: `symbol`
- Retryable: false
- Trigger: 同一个引用名在当前作用域内匹配多个候选符号，例如局部变量、route param、graph output、外部库导出或宿主注入变量同名
- User action: 使用更明确的名称、命名空间或导入别名
- Developer notes: 诊断应包含候选符号摘要和 scopeId；不要随机选择一个候选继续解析

### `COD-2013` 引用了当前作用域不可见的符号

- Severity: `warning`
- Stage: `symbol`
- Retryable: false
- Trigger: 代码引用的符号存在于项目中，但不在当前 WorkspaceScope、节点上下文、Collection item 上下文、NodeGraph 或 Animation binding 中可见
- User action: 将代码移动到正确作用域，或通过参数、props、data scope、graph input 显式传入
- Developer notes: 与 `COD-2001` 的区别是符号存在但不可见；应提供可见性边界证据

### `COD-2014` 外部库导出类型缺失或不可用

- Severity: `warning`
- Stage: `symbol`
- Retryable: true
- Trigger: 已注册外部库可以运行，但缺少类型声明、导出元数据或 props/events 类型，导致作者态补全和类型校验降级
- User action: 为外部库补充类型声明、适配器 metadata 或手动声明 props/events 类型
- Developer notes: official plugin package/contribution failure 使用 `PLG-xxxx`；这里仅表示代码环境无法取得类型信息

### `COD-2015` 泛型或类型参数无法满足约束

- Severity: `warning`
- Stage: `symbol`
- Retryable: false
- Trigger: 函数调用、组件泛型、NodeGraph 泛型端口或工具类型的类型参数不满足上界、默认值或推断约束
- User action: 调整类型参数、输入值或宿主字段类型
- Developer notes: TypeScript 上游码如 `TS2344` 应进入 `meta.upstream`，主码保持 `COD-2015`

### `COD-2016` 类型推断超过复杂度上限

- Severity: `warning`
- Stage: `symbol`
- Retryable: true
- Trigger: 表达式、泛型、条件类型、递归类型或大型 union 导致语言服务或作者态类型推断超过时间、深度或内存上限
- User action: 拆分表达式，添加显式类型，或减少泛型递归复杂度
- Developer notes: 该码用于可恢复降级；不应让语言服务卡死编辑器主线程

### `COD-3001` 代码片段绑定目标不存在

- Severity: `error`
- Stage: `binding`
- Retryable: false
- Trigger: 代码片段 owner 指向的 PIR 节点、Inspector 字段、NodeGraph 节点、Animation track 或其他宿主对象已不存在
- User action: 重新选择代码挂载目标，或删除失效代码片段
- Developer notes: 删除宿主对象时应清理相关 `CodeArtifact`；无法清理时必须保留可定位诊断

### `COD-3002` 代码片段返回值不满足宿主契约

- Severity: `error`
- Stage: `binding`
- Retryable: false
- Trigger: 事件处理、表达式、computed value、shader entry 或动画计算片段的返回值不满足宿主协议
- User action: 按当前字段、事件、节点端口或动画 track 要求调整返回值
- Developer notes: 诊断应包含宿主期望类型或能力名；Code Editor 和 Inspector 可同时展示同一诊断

### `COD-3003` 代码访问了当前上下文不可用的能力

- Severity: `warning`
- Stage: `binding`
- Retryable: false
- Trigger: 代码片段访问了当前 sandbox、运行目标、导出目标或宿主对象未声明支持的 capability
- User action: 移除不可用 API，或切换到支持该能力的运行目标
- Developer notes: capability 来源应来自 Authoring Environment，不允许各编辑器硬编码互相冲突的规则

### `COD-3010` 事件 handler 参数签名不匹配

- Severity: `warning`
- Stage: `binding`
- Retryable: false
- Trigger: Blueprint 事件、DOM 事件、组件事件或 NodeGraph 事件入口绑定的 handler 参数数量、顺序、名称或类型与宿主事件契约不一致
- User action: 按当前事件定义调整 handler 参数，或重新选择匹配的事件入口
- Developer notes: TypeScript 参数错误可进入 `meta.upstream`；主诊断应保留事件宿主、事件名和期望签名摘要

### `COD-3011` Mounted CSS selector 超出节点作用域

- Severity: `warning`
- Stage: `binding`
- Retryable: false
- Trigger: Mounted CSS 中的 selector 指向当前挂载节点作用域之外的 DOM、全局选择器或不可稳定定位的生成结构
- User action: 将 selector 限定在当前节点及其子树内，或把全局样式移动到明确的样式资源
- Developer notes: CSS 语法错误使用 `COD-1001`；作用域策略冲突使用该码，避免把宿主隔离规则伪装成 CSS parser 错误

### `COD-3012` 代码片段 owner 类型不支持当前宿主

- Severity: `error`
- Stage: `binding`
- Retryable: false
- Trigger: 代码片段声明的 owner kind、host kind 或 artifact kind 与实际挂载位置不匹配，例如把 shader 片段挂到普通事件字段
- User action: 重新选择支持该代码类型的挂载位置，或把片段转换为当前宿主支持的语言和模式
- Developer notes: 该码用于持久化数据与宿主能力不一致；如果 owner 目标已经不存在，使用 `COD-3001`

### `COD-3013` 生命周期 hook 与宿主阶段不匹配

- Severity: `warning`
- Stage: `binding`
- Retryable: false
- Trigger: 代码片段绑定到当前宿主不支持的生命周期阶段，例如在静态样式宿主中声明 mount/update/unmount hook
- User action: 改用当前宿主支持的生命周期，或把代码移动到支持该 hook 的组件、节点或运行目标
- Developer notes: 需要记录宿主支持的 lifecycle 列表；目标框架生命周期映射失败应归入 `GEN-xxxx`

### `COD-3014` 异步返回值不被宿主接受

- Severity: `warning`
- Stage: `binding`
- Retryable: false
- Trigger: 当前宿主要求同步结果，但代码片段返回 Promise、async function、stream 或其他异步结果
- User action: 改为同步返回值，或把逻辑移动到支持异步执行的事件、worker 或资源模块中
- Developer notes: 该码表达宿主契约限制；运行时 Promise reject 仍使用 `COD-4001`

### `COD-3015` 代码片段修改了只读上下文

- Severity: `error`
- Stage: `binding`
- Retryable: false
- Trigger: 代码片段尝试写入只读 props、route param、computed input、graph input、PIR snapshot 或受控注入上下文
- User action: 改为返回新值、发出允许的 command，或写入当前宿主声明为可变的状态位置
- Developer notes: ESLint 或自定义 lint 的只读写入规则可进入 `meta.upstream`；主码应指向 Prodivix 作者态上下文契约

### `COD-4001` 用户代码运行时抛错

- Severity: `error`
- Stage: `runtime`
- Retryable: true
- Trigger: 用户代码片段在预览、调试、表达式求值、worker 或 sandbox 中执行时抛出异常或返回失败状态
- User action: 查看代码位置、输入上下文和运行时错误摘要后修复代码
- Developer notes: 原始 stack 只进入开发调试详情；普通用户 UI 应展示 code、sourceSpan、artifactId 和受控摘要

### `COD-4010` 用户代码执行超时

- Severity: `error`
- Stage: `runtime`
- Retryable: true
- Trigger: 用户代码片段在表达式求值、预览、worker 或 sandbox 中执行超过当前宿主允许的时间上限
- User action: 拆分长任务，减少循环或递归，或把耗时逻辑移动到支持异步和取消的执行环境
- Developer notes: 应记录超时阈值和执行入口；不要继续等待无取消能力的执行任务阻塞编辑器

### `COD-4011` sandbox 权限拒绝

- Severity: `error`
- Stage: `runtime`
- Retryable: false
- Trigger: 用户代码访问了 sandbox 未授权的全局对象、网络、存储、文件、DOM、计时器或其他受控能力
- User action: 移除受限 API，或切换到显式声明并允许该能力的运行目标
- Developer notes: 与 `COD-3003` 的区别是该码来自实际执行边界拒绝；UI 应显示能力名而不是泄露 sandbox 内部策略

### `COD-4012` 用户代码产生非确定性副作用

- Severity: `warning`
- Stage: `runtime`
- Retryable: false
- Trigger: 代码片段在要求纯函数或可重放求值的宿主中产生随机数、时间读取、外部写入、全局状态修改或不可重放副作用
- User action: 把副作用移到事件或明确的 effect 阶段，或把随机和时间输入显式建模为参数
- Developer notes: 静态检查发现时也可使用该码；上游 lint 规则名进入 `meta.upstream`

### `COD-4013` 用户代码递归或循环超过限制

- Severity: `error`
- Stage: `runtime`
- Retryable: false
- Trigger: 用户代码递归深度、循环次数、微任务链或依赖求值链超过当前执行环境限制
- User action: 增加终止条件，拆分计算，或减少递归和循环复杂度
- Developer notes: 该码比通用超时更具体；应尽量提供触发限制类型和阈值摘要

### `COD-4014` 用户代码返回不可序列化结果

- Severity: `error`
- Stage: `runtime`
- Retryable: false
- Trigger: worker、sandbox、预览桥接或持久化边界收到 function、symbol、DOM node、循环引用、class instance 或其他不可序列化结果
- User action: 返回 plain object、array、string、number、boolean 或当前宿主明确支持的结构
- Developer notes: 该码用于跨边界结果；宿主类型不匹配仍使用 `COD-3002` 或 `COD-2003`

### `COD-5001` 转译失败

- Severity: `error`
- Stage: `compile`
- Retryable: true
- Trigger: 用户代码片段在 TypeScript、JavaScript、CSS、SCSS 或表达式转译阶段失败
- User action: 修复代码语法、类型或不支持的语言特性后重试
- Developer notes: 作者态转译失败使用该码；目标项目代码发射失败使用 `GEN-4001`

### `COD-5002` Shader 编译失败

- Severity: `error`
- Stage: `compile`
- Retryable: false
- Trigger: GLSL 或 WGSL 代码片段无法通过 shader compiler 校验或编译
- User action: 根据 shader 编译日志修正入口函数、类型、uniform、binding 或语法
- Developer notes: 编译日志需脱敏和裁剪；UI 主落点是 Code Editor inline diagnostic 和 Preview 受控错误提示

### `COD-5010` 语言服务 worker 初始化失败

- Severity: `error`
- Stage: `compile`
- Retryable: true
- Trigger: TypeScript、CSS、SCSS、GLSL、WGSL 或自定义语言服务 worker 无法初始化、加载编译器、加载规则集或建立通信
- User action: 刷新项目上下文后重试；若持续失败，携带语言模式、项目上下文和错误码上报
- Developer notes: 该码表示作者态语言服务基础设施失败；单个代码片段语法或类型错误不应使用该码

### `COD-5011` Source map 生成或映射失败

- Severity: `warning`
- Stage: `compile`
- Retryable: true
- Trigger: 转译后的诊断、运行时 stack、shader log 或预处理器错误无法稳定映射回原始代码片段 source span
- User action: 根据可见的代码片段和错误摘要手动定位；若反复出现，重新保存或拆分代码片段
- Developer notes: 该码通常作为次级诊断；不得因为 source map 失败而丢弃主错误

### `COD-5012` CSS/SCSS 预处理失败

- Severity: `error`
- Stage: `compile`
- Retryable: false
- Trigger: CSS、SCSS 或 Mounted CSS 在变量解析、嵌套展开、mixin/include、import、PostCSS 或预处理阶段失败
- User action: 修正样式语法、变量、mixin、导入路径或不支持的预处理特性
- Developer notes: 原始 Sass/PostCSS 错误码进入 `meta.upstream`；宿主作用域问题使用 `COD-3011`

### `COD-5013` 目标运行模式不支持当前语言特性

- Severity: `warning`
- Stage: `compile`
- Retryable: false
- Trigger: 当前预览、sandbox、worker 或导出前作者态运行模式不支持代码片段使用的语法、模块格式、CSS 特性或 shader 能力
- User action: 改用当前运行模式支持的写法，或切换到支持该语言特性的目标模式
- Developer notes: 该码属于作者态执行/预览能力；最终目标框架构建不支持时使用 `GEN-xxxx`

### `COD-9001` 代码环境未知异常

- Severity: `error`
- Stage: `environment`
- Retryable: true
- Trigger: 代码解析、符号索引、语言服务、sandbox 或编译链路出现未分类异常
- User action: 重试操作；若复现，携带错误码、代码片段位置和项目上下文上报
- Developer notes: 新增稳定复现场景后应分配更具体的码位

### `COD-9002` 代码诊断证据不足

- Severity: `warning`
- Stage: `environment`
- Retryable: true
- Trigger: 上游语言服务、worker、sandbox、导入器或 AI 修复链路报告了问题，但缺少稳定 code、source span、artifactId 或宿主上下文，无法归类为更具体的 COD 码
- User action: 刷新诊断或重新打开代码片段；若仍出现，携带当前代码片段位置和操作步骤上报
- Developer notes: 该码用于保护诊断质量，不应用来隐藏已知错误；补齐证据后必须映射到更具体码位

## 5. 预留码位

1. `COD-1010`：代码片段超过宿主允许的源码大小。
2. `COD-2017`：代码引用了已废弃符号。
3. `COD-3016`：代码片段声明的资源依赖与宿主资源槽不匹配。
4. `COD-4015`：用户代码触发受控资源配额限制。
5. `COD-5014`：lint rule 配置非法或与语言模式不兼容。
6. `COD-9010`：第三方语言服务返回无法映射的诊断。
