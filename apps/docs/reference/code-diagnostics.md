# Code 诊断

Code 诊断用于描述用户在 Prodivix 中编写、挂载、引用和执行的代码片段问题，包括 TypeScript、JavaScript、CSS、SCSS、GLSL、WGSL、表达式片段，以及这些代码依赖的作者态共享符号环境。

Code 诊断使用 `COD-xxxx` 命名空间。它不是 Prodivix 自身应用崩溃码，也不是目标项目最终构建码，而是作者态代码环境给用户的稳定产品错误码。

## 什么时候会出现 Code 诊断

常见场景包括：

1. 代码片段语法错误、语言模式不支持或片段形状不符合宿主要求。
2. 变量、import、route param、graph output 或外部库导出无法解析。
3. TypeScript 类型、泛型、函数参数或宿主字段类型不兼容。
4. Blueprint 事件、Mounted CSS、NodeGraph 端口或 Animation track 的宿主契约不满足。
5. 用户代码在预览、worker、sandbox 或表达式求值中抛错、超时或被权限拒绝。
6. TypeScript、CSS、SCSS、shader 或 source map 转译编译链路失败。
7. 上游语言服务返回了错误，但证据不足，暂时无法映射到更具体的 COD 码。

这些问题应该落到 Code Editor inline diagnostic、Inspector 字段、NodeGraph 端口、Animation track、Preview 错误提示或 Issues 面板中。只要能定位到代码片段，优先保留 `sourceSpan`。

## 与其他错误码的区别

| 问题类型                                         | 使用命名空间 |
| ------------------------------------------------ | ------------ |
| PIR graph、ValueRef、materialize                 | `PIR-xxxx`   |
| Inspector 写入、拖拽、选择、画布命令             | `EDT-xxxx`   |
| NodeGraph 结构、端口连线、执行计划               | `NGR-xxxx`   |
| Animation timeline、track、keyframe              | `ANI-xxxx`   |
| Official plugin package、contribution、Host 注册 | `PLG-xxxx`   |
| 目标项目代码生成和导出                           | `GEN-xxxx`   |
| 用户体验质量问题                                 | `UX-xxxx`    |
| 用户代码和作者态代码环境                         | `COD-xxxx`   |

例如 CSS parser 报错使用 `COD-1001`；同一段 CSS 如果可以解析但导致文本对比度不足，则另行产生 `UX-1001`。Official plugin package 或 contribution 失败使用 `PLG-xxxx`；组件库已经可运行但代码环境缺少类型信息时使用 `COD-2014`。

## 上游错误码如何呈现

TypeScript、ESLint、CSS parser、Sass/PostCSS、GLSL 或 WGSL compiler 的错误码不作为 Prodivix 主错误码展示。用户界面应该展示稳定的 Prodivix 主码，例如 `COD-2003 类型不兼容`，并在详情中展示上游来源和原始码，例如 `TypeScript TS2322`。

推荐结构：

```ts
type UpstreamDiagnostic = {
  source: 'typescript' | 'eslint' | 'css' | 'scss' | 'glsl' | 'wgsl';
  code?: string | number;
  severity?: 'info' | 'warning' | 'error';
  message: string;
  sourceSpan?: SourceSpan;
  docsUrl?: string;
};
```

示例：

```json
{
  "code": "COD-2003",
  "domain": "code",
  "severity": "warning",
  "message": "返回值类型不满足宿主字段的类型约束。",
  "sourceSpan": {
    "artifactId": "code_artifact_01",
    "startLine": 4,
    "startColumn": 10,
    "endLine": 4,
    "endColumn": 24
  },
  "targetRef": {
    "kind": "inspector-field",
    "fieldPath": "props.value"
  },
  "meta": {
    "upstream": [
      {
        "source": "typescript",
        "code": "TS2322",
        "severity": "error",
        "message": "Type 'string' is not assignable to type 'number'."
      }
    ]
  }
}
```

展示层建议：

1. 列表主标题使用 `COD-xxxx` 和 Prodivix 诊断名称。
2. 详情区展示上游来源、原始码、原始 message 和文档链接。
3. 筛选和聚合优先按 `COD-xxxx`，再允许用户按上游来源过滤。
4. 不要把多个上游错误直接暴露成多个产品主码，除非它们对应不同的 Prodivix 作者态语义。

## 常见映射

| 上游来源             | 上游示例                 | Prodivix 主码                   |
| -------------------- | ------------------------ | ------------------------------- |
| TypeScript parser    | `TS1005`                 | `COD-1001` 代码解析失败         |
| TypeScript typecheck | `TS2322`、`TS2345`       | `COD-2003` 类型不兼容           |
| TypeScript module    | `TS2307`                 | `COD-2002` import 无法解析      |
| TypeScript generic   | `TS2344`                 | `COD-2015` 泛型或类型参数不满足 |
| ESLint               | `no-undef`               | `COD-2001` 符号无法解析         |
| 自定义 lint          | readonly context rule    | `COD-3015` 修改只读上下文       |
| CSS parser           | declaration parse error  | `COD-1001` 代码解析失败         |
| Mounted CSS rule     | selector escapes scope   | `COD-3011` selector 超出作用域  |
| Sass/PostCSS         | mixin/import/variable    | `COD-5012` CSS/SCSS 预处理失败  |
| GLSL/WGSL compiler   | entry、binding、type log | `COD-5002` Shader 编译失败      |
| Language worker      | init or bridge failure   | `COD-5010` 语言服务 worker 失败 |
| Source map           | bad generated mapping    | `COD-5011` Source map 映射失败  |

映射不是按字符串硬编码一一对应，而是按 Prodivix 作者态语义归类。同一个上游码在不同宿主下可能映射到不同 COD 码。

## Code 诊断分段

| 段位       | 阶段          | 说明                                          |
| ---------- | ------------- | --------------------------------------------- |
| `COD-10xx` | `parse`       | 源码解析、语言模式、片段形状                  |
| `COD-20xx` | `symbol`      | 符号解析、类型、import、共享环境 revision     |
| `COD-30xx` | `binding`     | 代码片段与 Blueprint/NodeGraph/Animation 契约 |
| `COD-40xx` | `runtime`     | 用户代码运行时、sandbox、worker、执行权限     |
| `COD-50xx` | `compile`     | 转译、编译、shader compile、语言服务产物      |
| `COD-90xx` | `environment` | 代码环境未知异常                              |

完整码表见 [Code 错误码](/reference/diagnostics/cod)。

## 核心诊断列表

当前核心 Code 诊断共 40 个：

| Code                                          | 名称                                |
| --------------------------------------------- | ----------------------------------- |
| [`COD-1001`](/reference/diagnostics/cod-1001) | 代码解析失败                        |
| [`COD-1002`](/reference/diagnostics/cod-1002) | 不支持的语言模式                    |
| [`COD-1003`](/reference/diagnostics/cod-1003) | 代码片段为空或形状非法              |
| [`COD-1004`](/reference/diagnostics/cod-1004) | 表达式片段不是单一表达式            |
| [`COD-1005`](/reference/diagnostics/cod-1005) | 代码片段包含当前模式禁止的顶层语句  |
| [`COD-1006`](/reference/diagnostics/cod-1006) | 源码编码或文本范围非法              |
| [`COD-2001`](/reference/diagnostics/cod-2001) | 符号无法解析                        |
| [`COD-2002`](/reference/diagnostics/cod-2002) | import 无法解析                     |
| [`COD-2003`](/reference/diagnostics/cod-2003) | 类型不兼容                          |
| [`COD-2004`](/reference/diagnostics/cod-2004) | 共享符号环境过期                    |
| [`COD-2010`](/reference/diagnostics/cod-2010) | 重命名符号存在冲突                  |
| [`COD-2011`](/reference/diagnostics/cod-2011) | 循环 import 或循环符号依赖          |
| [`COD-2012`](/reference/diagnostics/cod-2012) | 符号解析结果不唯一                  |
| [`COD-2013`](/reference/diagnostics/cod-2013) | 引用了当前作用域不可见的符号        |
| [`COD-2014`](/reference/diagnostics/cod-2014) | 外部库导出类型缺失或不可用          |
| [`COD-2015`](/reference/diagnostics/cod-2015) | 泛型或类型参数无法满足约束          |
| [`COD-2016`](/reference/diagnostics/cod-2016) | 类型推断超过复杂度上限              |
| [`COD-3001`](/reference/diagnostics/cod-3001) | 代码片段绑定目标不存在              |
| [`COD-3002`](/reference/diagnostics/cod-3002) | 代码片段返回值不满足宿主契约        |
| [`COD-3003`](/reference/diagnostics/cod-3003) | 代码访问了当前上下文不可用的能力    |
| [`COD-3010`](/reference/diagnostics/cod-3010) | 事件 handler 参数签名不匹配         |
| [`COD-3011`](/reference/diagnostics/cod-3011) | Mounted CSS selector 超出节点作用域 |
| [`COD-3012`](/reference/diagnostics/cod-3012) | 代码片段 owner 类型不支持当前宿主   |
| [`COD-3013`](/reference/diagnostics/cod-3013) | 生命周期 hook 与宿主阶段不匹配      |
| [`COD-3014`](/reference/diagnostics/cod-3014) | 异步返回值不被宿主接受              |
| [`COD-3015`](/reference/diagnostics/cod-3015) | 代码片段修改了只读上下文            |
| [`COD-4001`](/reference/diagnostics/cod-4001) | 用户代码运行时抛错                  |
| [`COD-4010`](/reference/diagnostics/cod-4010) | 用户代码执行超时                    |
| [`COD-4011`](/reference/diagnostics/cod-4011) | sandbox 权限拒绝                    |
| [`COD-4012`](/reference/diagnostics/cod-4012) | 用户代码产生非确定性副作用          |
| [`COD-4013`](/reference/diagnostics/cod-4013) | 用户代码递归或循环超过限制          |
| [`COD-4014`](/reference/diagnostics/cod-4014) | 用户代码返回不可序列化结果          |
| [`COD-5001`](/reference/diagnostics/cod-5001) | 转译失败                            |
| [`COD-5002`](/reference/diagnostics/cod-5002) | Shader 编译失败                     |
| [`COD-5010`](/reference/diagnostics/cod-5010) | 语言服务 worker 初始化失败          |
| [`COD-5011`](/reference/diagnostics/cod-5011) | Source map 生成或映射失败           |
| [`COD-5012`](/reference/diagnostics/cod-5012) | CSS/SCSS 预处理失败                 |
| [`COD-5013`](/reference/diagnostics/cod-5013) | 目标运行模式不支持当前语言特性      |
| [`COD-9001`](/reference/diagnostics/cod-9001) | 代码环境未知异常                    |
| [`COD-9002`](/reference/diagnostics/cod-9002) | 代码诊断证据不足                    |

## 常用入口

- [Code 错误码索引](/reference/diagnostics/cod)
- [错误码总索引](/reference/diagnostic-codes)
- [Workspace Semantic Index](/reference/authoring-symbol-environment)
- [`COD-1001` 代码解析失败](/reference/diagnostics/cod-1001)
- [`COD-2003` 类型不兼容](/reference/diagnostics/cod-2003)
- [`COD-3011` Mounted CSS selector 超出节点作用域](/reference/diagnostics/cod-3011)
- [`COD-5012` CSS/SCSS 预处理失败](/reference/diagnostics/cod-5012)
