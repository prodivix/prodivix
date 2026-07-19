# G2 Binary Asset milestones

> 本文件是 Binary Asset 子系统阶段状态的唯一来源。实现 contract 见 [`../implementation/g2-binary-asset-pipeline.md`](../implementation/g2-binary-asset-pipeline.md)，架构边界见 [`../decisions/47.binary-asset-pipeline.md`](../decisions/47.binary-asset-pipeline.md)。

## 当前判断

| Milestone                                                     | 状态                             | 已关闭的边界                                                                                                                                                                                                                         | 尚未包含                                                                     |
| ------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| B0-B3 owner、contract、blob store、Executable materialization | Implemented                      | `@prodivix/assets` owner、reference-only Workspace contract、SHA-256 exact-byte store、authorized materialization、Compiler/Snapshot/Remote projection 与 Golden first vertical。                                                    | 额外格式与 deployment adapter 不扩张 current contract。                      |
| B4 Browser Resources 与 local/cloud bytes                     | Implemented                      | Workspace-scoped IndexedDB、bytes-first upload/preview/download、Run/Test/Export、duplicate/delete lifecycle、bounded multipart local-to-cloud atomic import。                                                                       | durable public publish/purge 属 post-G2 deployment promotion。               |
| B5 transform、scanner 与 delivery                             | Implemented locally / CI pending | deterministic PNG/JPEG sanitizer + Sharp full-raster re-encode、structural + required ClamAV/YARA-X chain、quarantine、replica/freshness/policy generation、bounded cache、capability Asset Delivery Host。                          | 新 ClamAV + YARA-X rootless Actions证据待推送后取得；更多格式非 G2 blocker。 |
| B6 retention、Git/LFS、runtime filesystem                     | Implemented (first vertical)     | PostgreSQL orphan clock/reference reconcile/row-lock sweep、deterministic Git binary/LFS projection、managed attributes、exact upload-receipt-fenced Asset import/replace。                                                          | runtime Asset delete。                                                       |
| B7 Golden 与 Browser product journey                          | Implemented locally              | Living Golden blob-backed PNG、Browser JPEG upload/durable reload/full-raster/capability-origin decode、React/Vue exact-byte Browser/Test/Remote Preview/Test/Build matrix、protected static fail-close 与 Vue Chrome product Gate。 | 新增 target matrix 的 GitHub CI evidence待推送后取得。                       |

## Gate 入口

- Aggregate Binary Asset：`pnpm run verify:g2:binary-assets`
- Browser journey：`pnpm run verify:g2:binary-assets:browser`
- Real required engines/rootless：`pnpm run verify:g2:binary-asset-malware`
- Remote workflow：`.github/workflows/g2-binary-asset-malware.yml`

## 状态变更规则

- scanner/transform 支持必须同时有 deterministic contract、negative corpus、readiness/freshness 与真实 daemon 证据。
- Browser harness、mock scanner 或 workflow 配置不能替代真实 malware Gate。
- 详细实现过程保留在 implementation/ADR；本文件只保存 milestone 判断。
