# PIR-001 评审记录：Data Scope 与 List Render 契约草案

## 状态

- Completed
- 日期：2026-02-08
- 关联任务：`PIR-001`
- 关联文档：
  - `specs/decisions/15.pir-data-scope-and-list-render.md`
  - `specs/pir/pir-contract-v1.2.md`
  - `specs/pir/PIR-v1.2.json`

## 评审目标

完成“组件数据模型继承 + 列表模板渲染”的第一步规范落地，形成后续实现的统一契约。

## 结论摘要

1. PIR v1.2 新增节点字段：`data`、`list`
2. PIR v1.2 新增引用类型：`$data`、`$item`、`$index`
3. 继承语义固定：父 scope -> 子 scope，支持 `source/pick/extend`
4. list 语义固定：节点即模板，按数组迭代并注入 `item/index`

## 冻结范围（PIR-001）

本阶段冻结：

1. 字段命名：`data.source/pick/extend`、`list.source/itemAs/indexAs/keyBy/emptyNodeId`
2. 引用命名：`$data`、`$item`、`$index`
3. 基础错误码建议集（文档级）

本阶段不冻结：

1. Inspector 交互细节
2. 运行时优化策略（memo、虚拟化）
3. 导出器目标框架细节差异

## 验证记录

执行命令：

```powershell
python -c "import json, pathlib; json.loads(pathlib.Path('specs/pir/PIR-v1.2.json').read_text(encoding='utf-8')); print('PIR-v1.2.json OK')"
```

结果：

```txt
PIR-v1.2.json OK
```

## 后续任务入口

1. `PIR-002`：渲染器实现 scope/list 语义
2. `PIR-003`：Inspector 配置入口
3. `PIR-004`：校验与错误码落地
4. `PIR-005`：代码生成器一致性
