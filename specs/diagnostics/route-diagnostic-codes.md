# Route Diagnostics 编码规范（RTE）

## 状态

- Draft
- 日期：2026-05-03
- 关联：
  - `specs/diagnostics/README.md`
  - `specs/decisions/08.route-manifest-outlet.md`
  - `specs/decisions/09.component-route-composition.md`
  - `specs/decisions/13.route-runtime-contract.md`
  - `specs/router/route-manifest.md`

## 1. 范围

`RTE-xxxx` 覆盖 Route manifest、布局路由、Outlet 占位、导航运行时和路由与组件文档之间的组合关系。

不覆盖：

1. Workspace 中 route document 的保存和 revision 冲突，使用 `WKS-xxxx`。
2. PIR graph 内部结构错误，使用 `PIR-xxxx`。
3. 编辑器地址栏、画布选中和预览交互，使用 `EDT-xxxx`。

## 2. 阶段

```ts
type RouteDiagnosticStage =
  | 'manifest'
  | 'resolve'
  | 'outlet'
  | 'navigate'
  | 'runtime';
```

## 3. 编码分段

| 段位       | 阶段       | 说明                       |
| ---------- | ---------- | -------------------------- |
| `RTE-10xx` | `manifest` | 路由清单形状、路径、唯一性 |
| `RTE-20xx` | `resolve`  | 路由匹配、组件文档解析     |
| `RTE-30xx` | `outlet`   | 布局路由与 Outlet 占位     |
| `RTE-40xx` | `navigate` | 导航动作、参数、重定向     |
| `RTE-90xx` | `runtime`  | 路由运行时未知异常         |

## 4. 已占用码位

### `RTE-1001` 路由路径重复

- Severity: `error`
- Stage: `manifest`
- Retryable: false
- Trigger: Route manifest 中存在重复 path
- User action: 修改重复路由路径
- Developer notes: 路由创建、复制和导入都必须做唯一性校验

### `RTE-1002` 路由路径非法

- Severity: `error`
- Stage: `manifest`
- Retryable: false
- Trigger: 路由 path 为空、缺少 `/` 前缀或包含不支持片段
- User action: 使用合法路径重新保存路由
- Developer notes: 地址栏输入、manifest 编辑和后端校验应共享路径规则

### `RTE-2001` 路由目标组件不存在

- Severity: `error`
- Stage: `resolve`
- Retryable: false
- Trigger: 路由指向的 component document 无法在 workspace 中找到
- User action: 重新选择路由组件或恢复缺失文档
- Developer notes: 删除组件文档时必须检查 route manifest 引用

### `RTE-3001` 布局路由缺少 Outlet

- Severity: `warning`
- Stage: `outlet`
- Retryable: false
- Trigger: 布局路由存在子路由，但对应组件没有可用 Outlet
- User action: 在布局组件中添加 Outlet，或调整路由层级
- Developer notes: 画布预览和导出应使用同一 Outlet 诊断

### `RTE-3002` Outlet 无法匹配子路由

- Severity: `warning`
- Stage: `outlet`
- Retryable: true
- Trigger: 当前 route chain 中没有可渲染的子路由内容
- User action: 检查当前路径和子路由配置
- Developer notes: 该诊断可作为预览占位，不一定阻断编辑

### `RTE-4001` 导航目标无法解析

- Severity: `error`
- Stage: `navigate`
- Retryable: false
- Trigger: `navigate` action 的目标路径或 route id 无法解析
- User action: 检查事件绑定中的导航目标
- Developer notes: PIR action registry 和 route runtime 应共享解析逻辑

### `RTE-9001` Route 未知异常

- Severity: `error`
- Stage: `runtime`
- Retryable: true
- Trigger: 路由匹配、Outlet 渲染或导航执行中出现未分类异常
- User action: 重试操作；若复现，携带错误码和路径上报
- Developer notes: 新增稳定复现场景后应分配更具体的码位

## 5. 预留码位

1. `RTE-1010`：动态路径参数命名非法。
2. `RTE-2010`：路由 loader 数据无法解析。
3. `RTE-3010`：多个 Outlet 匹配同一 region 时产生歧义。
4. `RTE-4010`：外部链接安全策略拒绝导航。
