# Animation Diagnostics 编码规范（ANI）

## 状态

- Draft
- 日期：2026-05-03
- 关联：
  - `specs/diagnostics/README.md`
  - `specs/pir/pir-contract-v1.3.md`

## 1. 范围

`ANI-xxxx` 覆盖动画时间线、binding、track、keyframe、CSS Filter、SVG Filter 和动画预览运行时。

不覆盖：

1. `animation.targetNodeId` 指向不存在 PIR 节点时的 graph 引用问题，可由 `PIR-xxxx` 承担基础校验。
2. 动画编辑器面板交互，使用 `EDT-xxxx`。
3. 导出到目标框架时的策略失败，使用 `GEN-xxxx`。

## 2. 阶段

```ts
type AnimationDiagnosticStage =
  | 'timeline'
  | 'binding'
  | 'track'
  | 'keyframe'
  | 'preview';
```

## 3. 编码分段

| 段位       | 阶段       | 说明                          |
| ---------- | ---------- | ----------------------------- |
| `ANI-10xx` | `timeline` | 时间线形状、时长、迭代策略    |
| `ANI-20xx` | `binding`  | target node、binding 唯一性   |
| `ANI-30xx` | `track`    | track 类型、属性、filter 定义 |
| `ANI-40xx` | `keyframe` | keyframe 排序、值类型、单位   |
| `ANI-50xx` | `preview`  | 动画预览、采样、播放状态      |
| `ANI-90xx` | `preview`  | 动画未知异常                  |

## 4. 已占用码位

### `ANI-1001` 时间线时长非法

- Severity: `error`
- Stage: `timeline`
- Retryable: false
- Trigger: timeline duration 小于或等于 0
- User action: 设置大于 0 的动画时长
- Developer notes: 表单输入、schema 校验和导入器都应使用相同规则

### `ANI-1002` 时间线 ID 重复

- Severity: `error`
- Stage: `timeline`
- Retryable: false
- Trigger: 同一 animation document 中存在重复 timeline id
- User action: 重命名重复时间线
- Developer notes: 复制时间线时必须生成新 id

### `ANI-2001` Binding 目标节点不存在

- Severity: `error`
- Stage: `binding`
- Retryable: false
- Trigger: binding targetNodeId 无法解析到当前 PIR graph 节点
- User action: 重新选择动画目标节点或恢复缺失节点
- Developer notes: PIR validator 可映射到该语义；动画编辑器可展示更具体上下文

### `ANI-3001` Track 属性不支持

- Severity: `warning`
- Stage: `track`
- Retryable: false
- Trigger: 当前 runtime 或导出目标不支持该 track property
- User action: 改用支持的动画属性
- Developer notes: 预览和 codegen 可根据目标能力降级

### `ANI-3002` SVG Filter primitive 不存在

- Severity: `error`
- Stage: `track`
- Retryable: false
- Trigger: svg-filter-attr track 指向不存在的 filter primitive
- User action: 检查 SVG Filter 定义或重新绑定 track
- Developer notes: 删除 primitive 时必须清理引用

### `ANI-4001` Keyframe 时间不递增

- Severity: `warning`
- Stage: `keyframe`
- Retryable: false
- Trigger: track keyframes 未按 `atMs` 升序排列
- User action: 调整关键帧顺序或让编辑器自动排序
- Developer notes: 保存前可自动规范化，但必须保留用户可见诊断

### `ANI-5001` 动画预览采样失败

- Severity: `error`
- Stage: `preview`
- Retryable: true
- Trigger: 预览器无法在指定时间采样动画状态
- User action: 检查绑定目标、track 值和 filter 定义
- Developer notes: 预览失败不应破坏 PIR 保存态

### `ANI-9001` Animation 未知异常

- Severity: `error`
- Stage: `preview`
- Retryable: true
- Trigger: 动画编辑、预览或采样中出现未分类异常
- User action: 重试操作；若复现，携带错误码和 timelineId 上报
- Developer notes: 新增稳定复现场景后应分配更具体的码位

## 5. 预留码位

1. `ANI-1010`：iterations 非法。
2. `ANI-3010`：CSS Filter 单位不匹配。
3. `ANI-4010`：Keyframe value 类型不匹配。
4. `ANI-5010`：播放状态恢复失败。
