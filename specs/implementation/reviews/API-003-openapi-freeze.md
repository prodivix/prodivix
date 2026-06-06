# API-003 评审记录：Workspace OpenAPI 定稿与校验

## 状态

- Completed
- 日期：2026-02-08
- 关联任务：`API-003`
- 关联文档：`specs/api/workspace-sync.openapi.yaml`

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
