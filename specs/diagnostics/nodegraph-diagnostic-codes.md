# NodeGraph Diagnostics 编码规范（NGR）

## 状态

- Draft
- 日期：2026-05-03
- 关联：
  - `specs/diagnostics/README.md`
  - `specs/decisions/20.node-graph-port-semantics.md`
  - `specs/implementation/node-graph-control-flow-ui-spec.md`

## 1. 范围

`NGR-xxxx` 覆盖节点图结构、端口语义、连线约束、执行计划、调试状态和节点图运行时。

不覆盖：

1. PIR 事件绑定中的 `executeGraph` action 形状错误，优先使用 `PIR-xxxx`。
2. 编辑器拖拽和选择交互，使用 `EDT-xxxx`。
3. 后端保存和同步，使用 `WKS-xxxx`。

## 2. 阶段

```ts
type NodeGraphDiagnosticStage =
  | 'schema'
  | 'port'
  | 'edge'
  | 'execute'
  | 'debug';
```

## 3. 编码分段

| 段位       | 阶段      | 说明                         |
| ---------- | --------- | ---------------------------- |
| `NGR-10xx` | `schema`  | graph 文档形状、节点定义     |
| `NGR-20xx` | `port`    | 端口类型、方向、必填输入     |
| `NGR-30xx` | `edge`    | 连线合法性、循环、控制流约束 |
| `NGR-40xx` | `execute` | 执行计划、节点运行、数据传递 |
| `NGR-50xx` | `debug`   | 断点、单步、时间线和变量视图 |
| `NGR-90xx` | `execute` | 节点图未知异常               |

## 4. 已占用码位

### `NGR-1001` 节点定义不存在

- Severity: `error`
- Stage: `schema`
- Retryable: false
- Trigger: graph 中引用的 node type 未注册
- User action: 更新节点库或替换该节点
- Developer notes: 外部节点包和内置节点 registry 应统一返回该诊断

### `NGR-2001` 必填输入端口未连接

- Severity: `warning`
- Stage: `port`
- Retryable: false
- Trigger: 执行前发现 required input port 没有值或连线
- User action: 补齐端口输入或设置默认值
- Developer notes: 静态校验和执行前校验应共享端口 required 语义

### `NGR-2002` 端口类型不兼容

- Severity: `error`
- Stage: `port`
- Retryable: false
- Trigger: 输出端口类型无法赋给输入端口类型
- User action: 使用转换节点或连接兼容端口
- Developer notes: 连线 UI 应在创建 edge 前阻止该错误

### `NGR-3001` 控制流连线形成非法循环

- Severity: `error`
- Stage: `edge`
- Retryable: false
- Trigger: 控制流 edge 产生不受支持的循环
- User action: 移除循环连线，或使用显式循环节点
- Developer notes: 数据流循环和控制流循环可采用不同规则，但必须明确诊断

### `NGR-4001` 节点执行失败

- Severity: `error`
- Stage: `execute`
- Retryable: true
- Trigger: 单个节点运行时抛出异常或返回失败状态
- User action: 查看节点输入、输出和错误详情
- Developer notes: 诊断 meta 应包含 graphId、nodeId 和 runId，不包含敏感输入

### `NGR-5001` 断点目标不存在

- Severity: `warning`
- Stage: `debug`
- Retryable: false
- Trigger: 调试配置中的 breakpoint 指向不存在的 graph node
- User action: 删除失效断点或重新设置断点
- Developer notes: 删除节点时应同步清理断点

### `NGR-9001` NodeGraph 未知异常

- Severity: `error`
- Stage: `execute`
- Retryable: true
- Trigger: 节点图校验、执行或调试中出现未分类异常
- User action: 重试运行；若复现，携带错误码和 graphId 上报
- Developer notes: 新增稳定复现场景后应分配更具体的码位

## 5. 预留码位

1. `NGR-2010`：端口方向非法。
2. `NGR-3010`：重复 edge。
3. `NGR-4010`：执行超时。
4. `NGR-5010`：调试会话状态过期。
