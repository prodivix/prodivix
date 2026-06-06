# PIR Contract v1.1 草案

## 文档状态

- Draft
- 日期：2026-02-08
- 关联 ADR：`specs/decisions/10.pir-contract-validation.md`

## 1. 目标

统一 PIR 的类型来源、保存校验与错误反馈，避免运行时类型分叉。

## 2. 范围

v1.1 覆盖以下语义：

1. `ui.root` 组件树
2. `logic.props` 与 `logic.state`
3. `logic.graphs`（节点图引用与定义）
4. `events` 的触发器与动作参数

## 3. 核心结构（Draft）

```ts
type PIRDocumentV11 = {
  version: '1.1';
  metadata?: {
    name?: string;
    description?: string;
    author?: string;
    createdAt?: string;
    updatedAt?: string;
  };
  ui: {
    root: ComponentNode;
  };
  logic?: {
    props?: Record<string, PropDef>;
    state?: Record<string, StateDef>;
    graphs?: GraphDef[];
  };
};
```

## 4. 关键约束

1. `ui.root.id` 必填且全树唯一
2. `events.*.trigger` 必填
3. `events.*.action` 允许内建动作或自定义动作标识
4. `$param/$state` 引用必须指向存在键
5. 非核心扩展字段须使用 `x-<namespace>` 前缀

## 5. 错误模型（建议）

后端返回：

```json
{
  "error": "invalid_pir",
  "message": "PIR validation failed.",
  "details": [
    {
      "code": "PIR_EVENT_TRIGGER_REQUIRED",
      "path": "/ui/root/children/1/events/click/trigger",
      "message": "trigger is required"
    }
  ]
}
```

## 6. 校验接入

### 前端

1. 编辑时可选实时校验
2. 发布与导出前强校验

### 后端

1. 创建与保存请求强校验
2. 未通过不入库

## 7. 迁移策略（全量重构场景）

1. 迁移任务读取旧项目 PIR
2. 执行字段映射与默认补全
3. 生成 v1.1 合法文档后写入 workspace 文档
4. 迁移失败项目输出诊断报告并阻止切换

## 8. 与代码生成/渲染的关系

1. 渲染器以 v1.1 契约解释文档
2. 代码生成器输入仅接受 v1.1（或经过升级器）
3. 节点图执行器通过 `logic.graphs` 读取图定义

## 9. 后续产物

1. `specs/pir/PIR-v1.1.json`（Schema）
2. `packages/shared/src/types/pir-v1_1.ts`（生成类型）
3. 校验脚本与 CI 检查（阻止未校验写入）

## 10. 扩展字段策略（Draft）

1. 核心字段由 PIR Schema 严格约束
2. 插件/实验字段仅允许出现在 `x-*` 命名空间
3. 导出器可按目标平台选择保留或剥离 `x-*` 字段
