# Editor Diagnostics 编码规范（EDT）

## 状态

- Draft
- 日期：2026-05-03
- 关联：
  - `specs/diagnostics/README.md`
  - `specs/decisions/06.command-history.md`
  - `specs/decisions/19.layout-pattern-and-builtin-inspector-schema.md`
  - `specs/decisions/21.inspector-panel-architecture.md`

## 1. 范围

`EDT-xxxx` 覆盖编辑器交互层问题，包括画布、组件树、拖拽、选择状态、Inspector、面板 schema 和用户操作命令入口。

不覆盖：

1. PIR graph 结构错误，使用 `PIR-xxxx`。
2. Workspace 保存和同步冲突，使用 `WKS-xxxx`。
3. 外部库加载、注册和渲染，使用 `ELIB-xxxx`。
4. 节点图运行语义，后续使用 `NGR-xxxx`。

## 2. 阶段

```ts
type EditorDiagnosticStage =
  | 'selection'
  | 'dragdrop'
  | 'inspector'
  | 'canvas'
  | 'command'
  | 'autosave';
```

## 3. 编码分段

| 段位       | 阶段        | 说明                                 |
| ---------- | ----------- | ------------------------------------ |
| `EDT-10xx` | `selection` | 选中节点、焦点、编辑上下文           |
| `EDT-20xx` | `dragdrop`  | 拖拽放置、树移动、非法目标           |
| `EDT-30xx` | `inspector` | Inspector schema、字段绑定、面板能力 |
| `EDT-40xx` | `canvas`    | 画布预览、视口、渲染降级             |
| `EDT-50xx` | `command`   | 命令创建、撤销重做、autosave 队列    |
| `EDT-90xx` | `autosave`  | 编辑器未知异常                       |

## 4. 已占用码位

### `EDT-1001` 当前选中节点不存在

- Severity: `warning`
- Stage: `selection`
- Retryable: true
- Trigger: `selectedNodeId` 无法在当前 PIR graph 中找到
- User action: 重新在画布或组件树中选择节点
- Developer notes: 删除节点、路由切换和远端同步后必须清理选中状态

### `EDT-2001` 拖拽目标非法

- Severity: `warning`
- Stage: `dragdrop`
- Retryable: true
- Trigger: 用户尝试把节点放入不接受该节点类型或该位置的目标
- User action: 将组件拖到允许的容器或区域
- Developer notes: Palette drop、tree move 和 canvas drop 应共享同一 placement 校验结果

### `EDT-2002` 拖拽会产生循环结构

- Severity: `error`
- Stage: `dragdrop`
- Retryable: false
- Trigger: 用户尝试把节点移动到自身或自身后代内
- User action: 选择其他目标位置
- Developer notes: 该错误应在生成 PIR patch 前被拦截

### `EDT-3001` Inspector 字段 schema 不可用

- Severity: `warning`
- Stage: `inspector`
- Retryable: false
- Trigger: 选中节点没有可解析的 Inspector panel schema
- User action: 继续编辑其他基础字段，或更新组件库适配
- Developer notes: 内置组件、外部库 profile 和 layout pattern schema 都应提供稳定 fallback

### `EDT-3002` Inspector 字段写入被拒绝

- Severity: `error`
- Stage: `inspector`
- Retryable: false
- Trigger: Inspector 字段生成的 patch 被 schema、capability 或 graph validator 拒绝
- User action: 撤销该字段修改，检查输入值是否符合组件约束
- Developer notes: 字段控件应在本地做轻量校验，但最终以 PIR validator 结果为准

### `EDT-4001` 画布预览降级

- Severity: `warning`
- Stage: `canvas`
- Retryable: true
- Trigger: 画布无法完整渲染当前页面，只能显示占位、错误边界或降级组件
- User action: 查看诊断详情，优先修复 PIR、外部库或数据绑定错误
- Developer notes: 画布应聚合下游 `PIR-xxxx`、`ELIB-xxxx` 等诊断，而不是吞掉原始 code

### `EDT-5001` 命令无法进入历史栈

- Severity: `warning`
- Stage: `command`
- Retryable: false
- Trigger: 编辑操作缺少 reverse ops，无法支持 Undo/Redo
- User action: 当前改动仍可保存，但可能无法撤销
- Developer notes: 所有可编辑命令都应生成 forwardOps 与 reverseOps

### `EDT-5002` Autosave 队列存在过期任务

- Severity: `warning`
- Stage: `autosave`
- Retryable: true
- Trigger: autosave 任务的 base revision 已被新的本地或远端修改替代
- User action: 等待编辑器重新保存或手动刷新冲突状态
- Developer notes: autosave 应丢弃过期任务并保留最新用户意图

### `EDT-9001` 编辑器未知异常

- Severity: `error`
- Stage: `autosave`
- Retryable: true
- Trigger: 编辑器交互、命令或面板中出现未分类异常
- User action: 重试操作；若复现，携带错误码和操作路径上报
- Developer notes: 新增稳定复现场景后应分配更具体的码位

## 5. 预留码位

1. `EDT-2010`：外部库组件不允许放入当前容器。
2. `EDT-3010`：布局范式 schema 与节点能力不匹配。
3. `EDT-4010`：视口状态恢复失败。
4. `EDT-5010`：命令 dry-run 失败。
