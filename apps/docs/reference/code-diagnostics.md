# Code 诊断

`COD-xxxx` 涵盖用户代码、Code Artifact、Language Capability、Code Slot binding、运行时和编译等方面的问题。它不是 Prodivix 应用自身的崩溃码，也不替代目标工具链的原始错误码。

## 分段

| 范围       | 阶段        | 示例                                         |
| ---------- | ----------- | -------------------------------------------- |
| `COD-10xx` | parse       | 语法、语言模式、片段形状                     |
| `COD-20xx` | symbol      | import、symbol、type、revision               |
| `COD-30xx` | binding     | Code Slot、host contract、artifact lifecycle |
| `COD-40xx` | runtime     | sandbox、timeout、执行权限                   |
| `COD-50xx` | compile     | 转译、source map、shader compile             |
| `COD-90xx` | environment | 无法进一步归类的代码环境异常                 |

完整、自动生成的码表见[Code 诊断分类](/reference/diagnostics/cod)。

## 稳定主码与上游信息

TypeScript、CSS parser、Sass、GLSL/WGSL compiler 等上游错误保留在 diagnostic metadata 中；UI 以稳定 Prodivix 主码聚合。

例如 TypeScript `TS2322` 可以作为 `COD-2003` 的上游证据，Shader compiler log 可以作为 `COD-5002` 的证据。不要将上游 message 字符串硬编码为跨版本的产品 identity。

## Snapshot identity

Code Editor inline diagnostic 与 Issues 必须使用同一个 revision-bound language/compile snapshot。当 Artifact revision、language provider、semantic schema 或 compile profile 发生变化后，旧诊断不能继续显示为当前结果。

## 定位

能定位到源码时，诊断应同时提供：

- `DiagnosticTargetRef`：产品对象或 Code Artifact
- `SourceSpan`：稳定文本范围
- provider 与 snapshot identity
- 可选 upstream source/code/message

纯 Code 问题显示在 Code Editor 中；涉及跨领域 binding 的问题也应支持从 Issues 跳转到 Blueprint Inspector、NodeGraph port 或 Animation track。

## Shader compile

Language diagnostics 与 GPU compile diagnostics 需要区分。GLSL/WGSL 符号能够解析，不代表在指定的 WebGL2/WebGPU profile 下已成功编译。目标不可用、profile 不匹配和 compiler message 都应如实呈现。

## Quick Fix

Quick Fix 必须生成 revision-bound proposal，由 Workspace Command/Transaction 统一应用。Language Service 或 Issues provider 不得直接覆写 code document。
