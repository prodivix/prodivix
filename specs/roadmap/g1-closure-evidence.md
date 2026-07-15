# G1 Closure Evidence

## 状态

- Global Phase：G1 Semantic Hybrid Authoring
- ProductGateStatus：Passed
- 验证日期：2026-07-15
- 唯一阶段定义：`specs/roadmap/global-phases.md`
- 详细实施清单：`specs/implementation/g1-semantic-component-collection.md`

## 退出 Gate

| Gate                      | 可重复证据                                                                                                                                                     |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PIR-current               | 生产领域 API 无版本；wire version、codec 与 migration 隔离，并由 boundary checker 约束                                                                         |
| Semantic authoring        | Workspace、Route、PIR、NodeGraph、Animation、Code、Token/Resolver 与 Asset provider 组合为同一 revision-bound Workspace Semantic Index                         |
| Blueprint reuse           | Component Definition/Public Contract/Instance、Collection、原子 subtree extraction、Inspector 与跨表面 semantic navigation 完成                                |
| Visual/code round-trip    | PIR-current ↔ canonical React/JSX + standalone CSS 受控区域双向编辑，未知源码保留，分叉 fail closed                                                            |
| Durable production writes | Command/Transaction/History Operation 统一经过 Authoring Dispatcher、Durable Outbox 与 Atomic Commit；本地项目使用同一 exact-operation Outbox 与 causal replay |
| Preview/export parity     | Renderer、Compiler、ExportProgram 与 SourceTrace 使用同一 current projection；Golden 覆盖完整 Public Contract 与 nested Collection                             |
| Independent output        | 临时 React/Vite 项目完成 install、typecheck、test、build；真实 Chrome 验证 route/form、WebGL2 link 与 WebGPU WGSL compile                                      |

## 验证入口

```text
pnpm run check:core-boundaries
pnpm run check:editor-hard-cut
pnpm run check:pir-current-boundary
pnpm run check:property-test-names
pnpm --filter @prodivix/workspace test
pnpm --filter @prodivix/web test
pnpm run test:golden
pnpm run verify:g1:standalone
pnpm run verify:g1:browser
```

`verify:g1:browser` 使用独立生产构建和真实浏览器 GPU capability，不等同于视觉回归。
视觉回归、无障碍、性能、ExecutionProvider、Data/API lifecycle、第二 framework target 与
正式 `VerificationEvidence` 分别进入后续 Global Phase，不属于 G1 退出条件。
