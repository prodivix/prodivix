# API-003 评审记录：Workspace OpenAPI 定稿与校验

## 状态

- Completed / Amended
- 日期：2026-02-08
- 最近修订：2026-07-12
- 关联任务：`API-003`
- 关联文档：`specs/api/workspace-sync.openapi.yaml`
- 修订 ADR：`specs/decisions/36.atomic-workspace-operation-commit.md`

## 评审目标

基于 `API-001` 与 `API-002` 冻结结论，完成 Workspace OpenAPI 定稿并确认可解析、可实现、可扩展。

## 对齐项（Final）

1. 并发基线字段统一为 `expected*`
   - `expectedContentRev`
   - `expectedWorkspaceRev`
   - `expectedRouteRev`
2. 成功响应统一返回最新版本锚点
   - `workspaceRev`
   - `routeRev`
   - `opSeq`
3. 能力协商包含保留域表达
   - `core.nodegraph.*`
   - `core.animation.*`
4. Envelope 对齐 `API-002`
   - `IntentEnvelope` required 字段一致
   - `CommandEnvelope`/`PatchOp` 作为冻结 schema 收录
5. 错误码对齐 `API-002`
   - `UNSUPPORTED_INTENT`
   - `UNSUPPORTED_COMMAND`
   - `RESERVED_DOMAIN_DISABLED`
   - `INVALID_ENVELOPE_VERSION`
   - `INVALID_ENVELOPE_PAYLOAD`
   - `PIR_VALIDATION_FAILED`

## 校验记录

执行命令：

```powershell
python -c "import pathlib,yaml; yaml.safe_load(pathlib.Path('specs/api/workspace-sync.openapi.yaml').read_text(encoding='utf-8')); print('workspace-sync.openapi.yaml OK')"
```

结果：

```txt
workspace-sync.openapi.yaml OK
```

## 评审结论

1. 通过：`specs/api/workspace-sync.openapi.yaml` 进入 `Draft-Frozen（API-003）`
2. `API-001`/`API-002` 关键约束已在 OpenAPI 可见化
3. 后续 `API-004`/`API-005` 按此版本落地实现；如需破坏性调整，需重新 Gate A 评审

## 2026-07-12 Atomic Commit Hard Cut 修订

原 API-003 的 batch 部分已重新开启并完成破坏性修订：

1. 删除非原子的 `POST /api/workspaces/:workspaceId/batch`。
2. 删除 `ApplyBatchRequest`、`BatchPatchDocumentOperation`、`BatchIntentOperation` 与 `clientBatchId`。
3. 新增 `POST /api/workspaces/:workspaceId/operations/commit`，只接收 `command | transaction` WorkspaceOperation。
4. Revision baseline 改为由 Operation 写集推导的 exact expected vector，包含 workspaceRev、routeRev 与按 document id 列出的 contentRev/metaRev/absence。
5. Operation id 成为强幂等 commit identity；相同 request 重放首次结果，不重复推进 revision 或 opSeq。
6. `/batch` 不保留 alias 或转发层；旧冻结 schema 不再是当前实现依据。
7. Atomic Command 使用专用 schema：canonical identifiers、RFC3339 timestamps、stable source-id normalization，并在所有 domain 的 forward/reverse ops 中禁止 `move/copy`。
8. 当前 YAML 解析通过，68 个 local `$ref` 均可解析；OpenAPI 与文档通过 Prettier 静态检查。
