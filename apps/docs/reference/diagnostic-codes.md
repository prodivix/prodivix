# 错误码索引

Prodivix 使用稳定错误码帮助定位问题。每个错误码都对应独立说明页，用于快速理解含义、确认触发条件，并找到建议处理方式。

## 如何使用

1. 在界面或响应中找到稳定错误码，例如 `WKS-4003`。
2. 打开对应的错误码页面，先看严重程度、阶段和触发条件。
3. 按建议操作修复。若需要上报，使用下方模板。

## 上报模板

```txt
错误码
requestId
操作时间
当前项目或工作区
复现步骤
错误截图或日志摘要
```

不要上报 API key、Token、完整 Prompt 或其他敏感内容。

## 编码域

| 前缀       | 范围     | 说明                                                                       |
| ---------- | -------- | -------------------------------------------------------------------------- |
| `PIR-xxxx` | PIR 文档 | 文档形状、UI graph、ValueRef、materialize 和运行前校验                     |
| `WKS-xxxx` | 工作区   | 工作区加载、文档保存、同步冲突、capability 和 patch 应用                   |
| `PLG-xxxx` | 插件     | Plugin Manifest、contribution contract、权限、注册事务和 runtime lifecycle |
| `EDT-xxxx` | 编辑器   | 选择、拖拽、Inspector、画布、命令和 autosave                               |
| `UX-xxxx`  | 用户体验 | 可访问性、交互、响应式布局、内容、视觉反馈和体验检查器                     |
| `COD-xxxx` | 用户代码 | 代码片段、符号解析、类型、宿主绑定、运行时和转译编译                       |
| `GEN-xxxx` | 代码生成 | Canonical IR、adapter、依赖解析、代码发射和导出产物                        |
| `API-xxxx` | 后端/API | 请求、鉴权、权限、业务校验、持久化和第三方集成                             |
| `AI-xxxx`  | AI 助手  | Provider、模型发现、Prompt、响应解析和 AI command                          |
| `RTE-xxxx` | 路由     | 路由清单、匹配、Outlet、导航和运行时                                       |
| `NGR-xxxx` | 节点图   | 节点图结构、端口、连线、执行和调试                                         |
| `ANI-xxxx` | 动画     | Timeline、binding、track、keyframe、filter 和预览运行时                    |

## 命名空间索引

- [PIR](/reference/diagnostics/pir)
- [Workspace](/reference/diagnostics/wks)
- [Plugin](/reference/diagnostics/plg)
- [Editor](/reference/diagnostics/edt)
- [UX](/reference/diagnostics/ux)
- [Code](/reference/diagnostics/cod)
- [Codegen](/reference/diagnostics/gen)
- [Backend/API](/reference/diagnostics/api)
- [AI](/reference/diagnostics/ai)
- [Route](/reference/diagnostics/rte)
- [NodeGraph](/reference/diagnostics/ngr)
- [Animation](/reference/diagnostics/ani)

## 所有错误码

### PIR

| Code                                          | 名称                      | 严重程度  |
| --------------------------------------------- | ------------------------- | --------- |
| [`PIR-1001`](/reference/diagnostics/pir-1001) | 禁止保存树形 UI 根节点    | `error`   |
| [`PIR-1002`](/reference/diagnostics/pir-1002) | UI graph 缺失             | `error`   |
| [`PIR-1003`](/reference/diagnostics/pir-1003) | 节点字段非法              | `error`   |
| [`PIR-2001`](/reference/diagnostics/pir-2001) | 根节点不存在              | `error`   |
| [`PIR-2002`](/reference/diagnostics/pir-2002) | 节点 key 与节点 ID 不一致 | `error`   |
| [`PIR-2003`](/reference/diagnostics/pir-2003) | 子节点引用不存在          | `error`   |
| [`PIR-2004`](/reference/diagnostics/pir-2004) | UI graph 存在环           | `error`   |
| [`PIR-2005`](/reference/diagnostics/pir-2005) | 节点存在多个结构父级      | `error`   |
| [`PIR-2006`](/reference/diagnostics/pir-2006) | 存在未受控孤儿节点        | `warning` |
| [`PIR-2007`](/reference/diagnostics/pir-2007) | 跨结构节点引用不存在      | `error`   |
| [`PIR-2011`](/reference/diagnostics/pir-2011) | 组件组合规则不满足        | `error`   |
| [`PIR-3001`](/reference/diagnostics/pir-3001) | ValueRef 路径无法解析     | `warning` |
| [`PIR-3002`](/reference/diagnostics/pir-3002) | 数据作用域配置非法        | `warning` |
| [`PIR-3010`](/reference/diagnostics/pir-3010) | 列表渲染配置非法          | `warning` |
| [`PIR-4001`](/reference/diagnostics/pir-4001) | Materialize 失败          | `error`   |
| [`PIR-9001`](/reference/diagnostics/pir-9001) | PIR 未知异常              | `error`   |

### Workspace

| Code                                          | 名称                       | 严重程度  |
| --------------------------------------------- | -------------------------- | --------- |
| [`WKS-1001`](/reference/diagnostics/wks-1001) | 工作区不存在               | `error`   |
| [`WKS-1002`](/reference/diagnostics/wks-1002) | 工作区快照损坏             | `error`   |
| [`WKS-2001`](/reference/diagnostics/wks-2001) | 能力协商不支持当前写入协议 | `error`   |
| [`WKS-3001`](/reference/diagnostics/wks-3001) | 文档不存在                 | `error`   |
| [`WKS-3002`](/reference/diagnostics/wks-3002) | 文档类型不支持该操作       | `error`   |
| [`WKS-4001`](/reference/diagnostics/wks-4001) | Workspace revision 冲突    | `warning` |
| [`WKS-4002`](/reference/diagnostics/wks-4002) | Route revision 冲突        | `warning` |
| [`WKS-4003`](/reference/diagnostics/wks-4003) | Content revision 冲突      | `warning` |
| [`WKS-5001`](/reference/diagnostics/wks-5001) | Intent 类型不支持          | `error`   |
| [`WKS-5002`](/reference/diagnostics/wks-5002) | Patch 应用失败             | `error`   |
| [`WKS-9001`](/reference/diagnostics/wks-9001) | Workspace 未知异常         | `error`   |

### Plugin

| Code                                          | 名称                                        | 严重程度  |
| --------------------------------------------- | ------------------------------------------- | --------- |
| [`PLG-1001`](/reference/diagnostics/plg-1001) | Manifest 源不是严格 UTF-8 JSON              | `error`   |
| [`PLG-1002`](/reference/diagnostics/plg-1002) | Manifest 包含重复对象键                     | `error`   |
| [`PLG-1003`](/reference/diagnostics/plg-1003) | 程序化输入不是 JSON value                   | `error`   |
| [`PLG-1004`](/reference/diagnostics/plg-1004) | Manifest 不符合 v1 Schema                   | `error`   |
| [`PLG-1005`](/reference/diagnostics/plg-1005) | Manifest 超出资源上限                       | `error`   |
| [`PLG-1010`](/reference/diagnostics/plg-1010) | Contribution 资源读取失败                   | `error`   |
| [`PLG-1011`](/reference/diagnostics/plg-1011) | Contribution 资源不是严格 JSON              | `error`   |
| [`PLG-1012`](/reference/diagnostics/plg-1012) | Contribution 资源完整性不匹配               | `error`   |
| [`PLG-1013`](/reference/diagnostics/plg-1013) | Contribution contract 不受支持              | `error`   |
| [`PLG-1014`](/reference/diagnostics/plg-1014) | Contribution descriptor 不符合 contract     | `error`   |
| [`PLG-1015`](/reference/diagnostics/plg-1015) | Contribution 资源超出上限                   | `error`   |
| [`PLG-2001`](/reference/diagnostics/plg-2001) | 插件版本不是有效 SemVer                     | `error`   |
| [`PLG-2002`](/reference/diagnostics/plg-2002) | Prodivix engine range 无效                  | `error`   |
| [`PLG-2003`](/reference/diagnostics/plg-2003) | 当前宿主版本不兼容                          | `error`   |
| [`PLG-2004`](/reference/diagnostics/plg-2004) | Publisher 与插件 scope 不一致               | `error`   |
| [`PLG-2010`](/reference/diagnostics/plg-2010) | Capability 重复声明                         | `error`   |
| [`PLG-2011`](/reference/diagnostics/plg-2011) | Contribution id 重复                        | `error`   |
| [`PLG-2012`](/reference/diagnostics/plg-2012) | Contribution 缺少注册能力                   | `error`   |
| [`PLG-2013`](/reference/diagnostics/plg-2013) | Activation 引用无效                         | `error`   |
| [`PLG-2014`](/reference/diagnostics/plg-2014) | Activation 缺少 runtime entrypoint          | `error`   |
| [`PLG-2015`](/reference/diagnostics/plg-2015) | 资源路径不可移植或发生冲突                  | `error`   |
| [`PLG-2016`](/reference/diagnostics/plg-2016) | UI entrypoint id 重复                       | `error`   |
| [`PLG-2020`](/reference/diagnostics/plg-2020) | Contribution 跨点引用无效                   | `error`   |
| [`PLG-2021`](/reference/diagnostics/plg-2021) | Contribution library owner 不一致           | `error`   |
| [`PLG-3001`](/reference/diagnostics/plg-3001) | Required capability 被拒绝                  | `error`   |
| [`PLG-3002`](/reference/diagnostics/plg-3002) | Capability policy 解析失败                  | `error`   |
| [`PLG-3010`](/reference/diagnostics/plg-3010) | Contribution identity 冲突                  | `error`   |
| [`PLG-3011`](/reference/diagnostics/plg-3011) | Registry transaction revision 冲突          | `error`   |
| [`PLG-3012`](/reference/diagnostics/plg-3012) | Contribution resolver 失败                  | `error`   |
| [`PLG-3013`](/reference/diagnostics/plg-3013) | Plugin owner generation 已过期              | `error`   |
| [`PLG-3014`](/reference/diagnostics/plg-3014) | Contribution contract 配置冲突              | `error`   |
| [`PLG-4001`](/reference/diagnostics/plg-4001) | Plugin Host 状态转换非法                    | `error`   |
| [`PLG-4002`](/reference/diagnostics/plg-4002) | Runtime activation 失败                     | `error`   |
| [`PLG-4003`](/reference/diagnostics/plg-4003) | Runtime 操作超时                            | `error`   |
| [`PLG-4004`](/reference/diagnostics/plg-4004) | Owner cleanup 不完整                        | `error`   |
| [`PLG-4005`](/reference/diagnostics/plg-4005) | Runtime transport 意外终止                  | `error`   |
| [`PLG-4006`](/reference/diagnostics/plg-4006) | Host operation 已被替代                     | `info`    |
| [`PLG-4007`](/reference/diagnostics/plg-4007) | Audit sink 不可用                           | `warning` |
| [`PLG-4008`](/reference/diagnostics/plg-4008) | Host subscriber 回调失败                    | `warning` |
| [`PLG-4010`](/reference/diagnostics/plg-4010) | Runtime artifact 读取失败                   | `error`   |
| [`PLG-4011`](/reference/diagnostics/plg-4011) | Runtime artifact 完整性不匹配               | `error`   |
| [`PLG-4012`](/reference/diagnostics/plg-4012) | Runtime artifact 超出上限                   | `error`   |
| [`PLG-4013`](/reference/diagnostics/plg-4013) | Sandbox bootstrap 失败                      | `error`   |
| [`PLG-4014`](/reference/diagnostics/plg-4014) | Sandbox handshake 不匹配                    | `error`   |
| [`PLG-4015`](/reference/diagnostics/plg-4015) | Sandbox policy 无效                         | `error`   |
| [`PLG-4020`](/reference/diagnostics/plg-4020) | Protocol message 非法                       | `error`   |
| [`PLG-4021`](/reference/diagnostics/plg-4021) | Protocol contract 未注册                    | `error`   |
| [`PLG-4022`](/reference/diagnostics/plg-4022) | Protocol sequence 非单调                    | `error`   |
| [`PLG-4023`](/reference/diagnostics/plg-4023) | Protocol correlation 非法                   | `error`   |
| [`PLG-4024`](/reference/diagnostics/plg-4024) | Protocol response 已迟到                    | `warning` |
| [`PLG-4025`](/reference/diagnostics/plg-4025) | Protocol request 超时                       | `error`   |
| [`PLG-4026`](/reference/diagnostics/plg-4026) | Protocol session 已关闭                     | `error`   |
| [`PLG-4030`](/reference/diagnostics/plg-4030) | Gateway capability 未在 Manifest 请求       | `error`   |
| [`PLG-4031`](/reference/diagnostics/plg-4031) | Gateway capability 当前被拒绝               | `error`   |
| [`PLG-4032`](/reference/diagnostics/plg-4032) | Gateway request 不符合 contract             | `error`   |
| [`PLG-4033`](/reference/diagnostics/plg-4033) | Gateway response 不符合 contract            | `error`   |
| [`PLG-4034`](/reference/diagnostics/plg-4034) | Gateway handler 不可用                      | `error`   |
| [`PLG-4035`](/reference/diagnostics/plg-4035) | Gateway request 超时                        | `error`   |
| [`PLG-4036`](/reference/diagnostics/plg-4036) | Gateway session 已过期                      | `error`   |
| [`PLG-4037`](/reference/diagnostics/plg-4037) | Gateway handler 执行失败                    | `error`   |
| [`PLG-4038`](/reference/diagnostics/plg-4038) | Gateway network policy 拒绝                 | `error`   |
| [`PLG-4039`](/reference/diagnostics/plg-4039) | Gateway request 被取消                      | `error`   |
| [`PLG-4040`](/reference/diagnostics/plg-4040) | Sandbox message quota 超限                  | `error`   |
| [`PLG-4041`](/reference/diagnostics/plg-4041) | Sandbox heartbeat 超时                      | `error`   |
| [`PLG-4042`](/reference/diagnostics/plg-4042) | Sandbox 已终止                              | `error`   |
| [`PLG-4043`](/reference/diagnostics/plg-4043) | Gateway quota 超限                          | `error`   |
| [`PLG-4050`](/reference/diagnostics/plg-4050) | Official host implementation 未通过构建证明 | `error`   |
| [`PLG-4051`](/reference/diagnostics/plg-4051) | Official host implementation 不存在         | `error`   |
| [`PLG-4052`](/reference/diagnostics/plg-4052) | Official host implementation 类型不匹配     | `error`   |
| [`PLG-4053`](/reference/diagnostics/plg-4053) | Official host implementation 绑定冲突       | `error`   |
| [`PLG-4060`](/reference/diagnostics/plg-4060) | Required Gateway audit 不可用               | `error`   |
| [`PLG-4061`](/reference/diagnostics/plg-4061) | Gateway outcome audit 写入失败              | `warning` |
| [`PLG-4070`](/reference/diagnostics/plg-4070) | Official component runtime 不可用           | `error`   |
| [`PLG-4071`](/reference/diagnostics/plg-4071) | Bundled official library 不存在             | `error`   |
| [`PLG-4072`](/reference/diagnostics/plg-4072) | Official component runtime 已不支持         | `error`   |

### Editor

| Code                                          | 名称                         | 严重程度  |
| --------------------------------------------- | ---------------------------- | --------- |
| [`EDT-1001`](/reference/diagnostics/edt-1001) | 当前选中节点不存在           | `warning` |
| [`EDT-2001`](/reference/diagnostics/edt-2001) | 拖拽目标非法                 | `warning` |
| [`EDT-2002`](/reference/diagnostics/edt-2002) | 拖拽会产生循环结构           | `error`   |
| [`EDT-3001`](/reference/diagnostics/edt-3001) | Inspector 字段 schema 不可用 | `warning` |
| [`EDT-3002`](/reference/diagnostics/edt-3002) | Inspector 字段写入被拒绝     | `error`   |
| [`EDT-4001`](/reference/diagnostics/edt-4001) | 画布预览降级                 | `warning` |
| [`EDT-5001`](/reference/diagnostics/edt-5001) | 命令无法进入历史栈           | `warning` |
| [`EDT-5002`](/reference/diagnostics/edt-5002) | Autosave 队列存在过期任务    | `warning` |
| [`EDT-9001`](/reference/diagnostics/edt-9001) | 编辑器未知异常               | `error`   |

### UX

| Code                                        | 名称                                      | 严重程度  |
| ------------------------------------------- | ----------------------------------------- | --------- |
| [`UX-1001`](/reference/diagnostics/ux-1001) | 文本对比度不满足 WCAG                     | `warning` |
| [`UX-1002`](/reference/diagnostics/ux-1002) | 非文本内容缺少可访问替代                  | `warning` |
| [`UX-1003`](/reference/diagnostics/ux-1003) | 表单控件缺少可关联标签                    | `warning` |
| [`UX-1004`](/reference/diagnostics/ux-1004) | 交互控件缺少可访问名称                    | `warning` |
| [`UX-1005`](/reference/diagnostics/ux-1005) | 标题层级跳跃或页面缺少结构标题            | `info`    |
| [`UX-1006`](/reference/diagnostics/ux-1006) | Landmark 或区域语义缺失                   | `info`    |
| [`UX-1007`](/reference/diagnostics/ux-1007) | ARIA 引用目标不存在                       | `warning` |
| [`UX-1008`](/reference/diagnostics/ux-1008) | ARIA role 与元素语义冲突                  | `warning` |
| [`UX-1009`](/reference/diagnostics/ux-1009) | 状态变化未向辅助技术公告                  | `warning` |
| [`UX-1010`](/reference/diagnostics/ux-1010) | 颜色是唯一的信息表达                      | `warning` |
| [`UX-1011`](/reference/diagnostics/ux-1011) | 焦点指示器不可见或对比不足                | `warning` |
| [`UX-1012`](/reference/diagnostics/ux-1012) | 媒体缺少字幕、说明或控制                  | `warning` |
| [`UX-1013`](/reference/diagnostics/ux-1013) | 语言或文本方向声明缺失                    | `info`    |
| [`UX-1014`](/reference/diagnostics/ux-1014) | 键盘陷阱风险                              | `error`   |
| [`UX-1015`](/reference/diagnostics/ux-1015) | 目标 WCAG 等级无法验证                    | `info`    |
| [`UX-1016`](/reference/diagnostics/ux-1016) | 页面标题缺失或不明确                      | `warning` |
| [`UX-1017`](/reference/diagnostics/ux-1017) | 缺少跳过重复内容的路径                    | `warning` |
| [`UX-1018`](/reference/diagnostics/ux-1018) | 内容在缩放或重排后不可用                  | `warning` |
| [`UX-1019`](/reference/diagnostics/ux-1019) | 文本间距调整后内容不可读                  | `info`    |
| [`UX-1020`](/reference/diagnostics/ux-1020) | 输入目的或自动完成语义缺失                | `info`    |
| [`UX-1021`](/reference/diagnostics/ux-1021) | 自定义控件缺少 name、role 或 value        | `warning` |
| [`UX-1022`](/reference/diagnostics/ux-1022) | 认证流程依赖认知测试且缺少替代            | `warning` |
| [`UX-1023`](/reference/diagnostics/ux-1023) | 焦点被固定层遮挡                          | `warning` |
| [`UX-1024`](/reference/diagnostics/ux-1024) | 页面方向被锁定且无必要理由                | `info`    |
| [`UX-2001`](/reference/diagnostics/ux-2001) | 关键交互无法通过键盘完成                  | `error`   |
| [`UX-2002`](/reference/diagnostics/ux-2002) | Tab 顺序与视觉或任务顺序不一致            | `warning` |
| [`UX-2003`](/reference/diagnostics/ux-2003) | 指针或触摸目标尺寸过小                    | `warning` |
| [`UX-2004`](/reference/diagnostics/ux-2004) | 交互状态缺失                              | `warning` |
| [`UX-2005`](/reference/diagnostics/ux-2005) | 禁用控件缺少原因或替代路径                | `info`    |
| [`UX-2006`](/reference/diagnostics/ux-2006) | 输入错误反馈不及时或不可定位              | `warning` |
| [`UX-2007`](/reference/diagnostics/ux-2007) | Loading 或异步状态不可感知                | `warning` |
| [`UX-2008`](/reference/diagnostics/ux-2008) | destructive action 缺少确认或撤销路径     | `warning` |
| [`UX-2009`](/reference/diagnostics/ux-2009) | 手势交互缺少等价控件                      | `warning` |
| [`UX-2010`](/reference/diagnostics/ux-2010) | 弹层焦点管理不完整                        | `warning` |
| [`UX-2011`](/reference/diagnostics/ux-2011) | 交互反馈只依赖 hover                      | `warning` |
| [`UX-2012`](/reference/diagnostics/ux-2012) | 操作结果缺少就地反馈                      | `info`    |
| [`UX-2013`](/reference/diagnostics/ux-2013) | 快捷键与保留快捷键冲突                    | `warning` |
| [`UX-2014`](/reference/diagnostics/ux-2014) | 定时消失内容缺少暂停或延长路径            | `warning` |
| [`UX-2015`](/reference/diagnostics/ux-2015) | 取消、撤销或退出路径缺失                  | `warning` |
| [`UX-2016`](/reference/diagnostics/ux-2016) | 指针取消行为不安全                        | `warning` |
| [`UX-3001`](/reference/diagnostics/ux-3001) | 小屏视口出现不可访问横向溢出              | `warning` |
| [`UX-3002`](/reference/diagnostics/ux-3002) | 内容被固定层或弹层遮挡                    | `warning` |
| [`UX-3003`](/reference/diagnostics/ux-3003) | 文本在容器内截断且无恢复路径              | `warning` |
| [`UX-3004`](/reference/diagnostics/ux-3004) | 关键操作在目标断点不可见                  | `error`   |
| [`UX-3005`](/reference/diagnostics/ux-3005) | 阅读行宽或文本密度超出可读范围            | `info`    |
| [`UX-3006`](/reference/diagnostics/ux-3006) | 滚动容器嵌套导致操作困难                  | `warning` |
| [`UX-3007`](/reference/diagnostics/ux-3007) | Safe area 或视口单位处理不完整            | `warning` |
| [`UX-3008`](/reference/diagnostics/ux-3008) | 空状态或错误状态破坏布局                  | `warning` |
| [`UX-3009`](/reference/diagnostics/ux-3009) | 组件响应式约束缺失                        | `warning` |
| [`UX-3010`](/reference/diagnostics/ux-3010) | 弹层位置在视口边缘不可达                  | `warning` |
| [`UX-3011`](/reference/diagnostics/ux-3011) | 320px 宽度下内容不可重排                  | `warning` |
| [`UX-3012`](/reference/diagnostics/ux-3012) | 屏幕方向切换后布局或状态丢失              | `warning` |
| [`UX-3013`](/reference/diagnostics/ux-3013) | 软键盘遮挡输入或主要操作                  | `warning` |
| [`UX-3014`](/reference/diagnostics/ux-3014) | 打印或导出视图布局不可读                  | `info`    |
| [`UX-4001`](/reference/diagnostics/ux-4001) | 可见控件文案不明确                        | `info`    |
| [`UX-4002`](/reference/diagnostics/ux-4002) | 链接文本无法说明目标                      | `info`    |
| [`UX-4003`](/reference/diagnostics/ux-4003) | 错误消息缺少修复建议                      | `warning` |
| [`UX-4004`](/reference/diagnostics/ux-4004) | 空状态缺少下一步行动                      | `info`    |
| [`UX-4005`](/reference/diagnostics/ux-4005) | 必填、格式或约束说明缺失                  | `warning` |
| [`UX-4006`](/reference/diagnostics/ux-4006) | 状态标签缺少可理解含义                    | `info`    |
| [`UX-4007`](/reference/diagnostics/ux-4007) | 破坏性操作文案未说明影响范围              | `warning` |
| [`UX-4008`](/reference/diagnostics/ux-4008) | 本地化文本缺失或混用异常                  | `info`    |
| [`UX-4009`](/reference/diagnostics/ux-4009) | 数字、日期或单位缺少上下文                | `info`    |
| [`UX-4010`](/reference/diagnostics/ux-4010) | 状态反馈与实际结果不一致                  | `warning` |
| [`UX-4011`](/reference/diagnostics/ux-4011) | 术语或行话缺少解释                        | `info`    |
| [`UX-4012`](/reference/diagnostics/ux-4012) | 帮助入口不一致或缺失                      | `info`    |
| [`UX-4013`](/reference/diagnostics/ux-4013) | 多步骤流程缺少进度和当前位置              | `warning` |
| [`UX-4014`](/reference/diagnostics/ux-4014) | 重复输入或重复确认要求过多                | `info`    |
| [`UX-5001`](/reference/diagnostics/ux-5001) | 非文本图形对比度不足                      | `warning` |
| [`UX-5002`](/reference/diagnostics/ux-5002) | 视觉层级无法支撑主要任务                  | `info`    |
| [`UX-5003`](/reference/diagnostics/ux-5003) | 主题变量组合导致状态不可读                | `warning` |
| [`UX-5004`](/reference/diagnostics/ux-5004) | 动效缺少 reduced motion 降级              | `warning` |
| [`UX-5005`](/reference/diagnostics/ux-5005) | 闪烁或频闪风险                            | `error`   |
| [`UX-5006`](/reference/diagnostics/ux-5006) | Disabled、selected 或 active 状态区分不足 | `warning` |
| [`UX-5007`](/reference/diagnostics/ux-5007) | 可读字号或行高低于目标策略                | `info`    |
| [`UX-5008`](/reference/diagnostics/ux-5008) | 高密度界面缺少分组或分隔                  | `info`    |
| [`UX-5009`](/reference/diagnostics/ux-5009) | Skeleton 或占位内容与最终布局差异过大     | `info`    |
| [`UX-5010`](/reference/diagnostics/ux-5010) | 图表或数据可视化缺少可读编码              | `warning` |
| [`UX-5011`](/reference/diagnostics/ux-5011) | 图片文字缺少可访问替代                    | `warning` |
| [`UX-5012`](/reference/diagnostics/ux-5012) | 主题切换时出现短暂不可读闪烁              | `info`    |
| [`UX-9001`](/reference/diagnostics/ux-9001) | UX 检查器未知异常                         | `error`   |
| [`UX-9002`](/reference/diagnostics/ux-9002) | UX 规则配置非法                           | `error`   |
| [`UX-9003`](/reference/diagnostics/ux-9003) | UX 检测结果已过期                         | `info`    |
| [`UX-9004`](/reference/diagnostics/ux-9004) | UX 检查器证据不足                         | `info`    |
| [`UX-9005`](/reference/diagnostics/ux-9005) | UX 规则被显式豁免                         | `info`    |
| [`UX-9006`](/reference/diagnostics/ux-9006) | UX 诊断需要人工复核                       | `info`    |

### Code

| Code                                          | 名称                                | 严重程度  |
| --------------------------------------------- | ----------------------------------- | --------- |
| [`COD-1001`](/reference/diagnostics/cod-1001) | 代码解析失败                        | `error`   |
| [`COD-1002`](/reference/diagnostics/cod-1002) | 不支持的语言模式                    | `error`   |
| [`COD-1003`](/reference/diagnostics/cod-1003) | 代码片段为空或形状非法              | `warning` |
| [`COD-1004`](/reference/diagnostics/cod-1004) | 表达式片段不是单一表达式            | `error`   |
| [`COD-1005`](/reference/diagnostics/cod-1005) | 代码片段包含当前模式禁止的顶层语句  | `error`   |
| [`COD-1006`](/reference/diagnostics/cod-1006) | 源码编码或文本范围非法              | `error`   |
| [`COD-2001`](/reference/diagnostics/cod-2001) | 符号无法解析                        | `warning` |
| [`COD-2002`](/reference/diagnostics/cod-2002) | import 无法解析                     | `error`   |
| [`COD-2003`](/reference/diagnostics/cod-2003) | 类型不兼容                          | `warning` |
| [`COD-2004`](/reference/diagnostics/cod-2004) | 共享符号环境过期                    | `warning` |
| [`COD-2010`](/reference/diagnostics/cod-2010) | 重命名符号存在冲突                  | `warning` |
| [`COD-2011`](/reference/diagnostics/cod-2011) | 循环 import 或循环符号依赖          | `error`   |
| [`COD-2012`](/reference/diagnostics/cod-2012) | 符号解析结果不唯一                  | `warning` |
| [`COD-2013`](/reference/diagnostics/cod-2013) | 引用了当前作用域不可见的符号        | `warning` |
| [`COD-2014`](/reference/diagnostics/cod-2014) | 外部库导出类型缺失或不可用          | `warning` |
| [`COD-2015`](/reference/diagnostics/cod-2015) | 泛型或类型参数无法满足约束          | `warning` |
| [`COD-2016`](/reference/diagnostics/cod-2016) | 类型推断超过复杂度上限              | `warning` |
| [`COD-3001`](/reference/diagnostics/cod-3001) | 代码片段绑定目标不存在              | `error`   |
| [`COD-3002`](/reference/diagnostics/cod-3002) | 代码片段返回值不满足宿主契约        | `error`   |
| [`COD-3003`](/reference/diagnostics/cod-3003) | 代码访问了当前上下文不可用的能力    | `warning` |
| [`COD-3010`](/reference/diagnostics/cod-3010) | 事件 handler 参数签名不匹配         | `warning` |
| [`COD-3011`](/reference/diagnostics/cod-3011) | Mounted CSS selector 超出节点作用域 | `warning` |
| [`COD-3012`](/reference/diagnostics/cod-3012) | 代码片段 owner 类型不支持当前宿主   | `error`   |
| [`COD-3013`](/reference/diagnostics/cod-3013) | 生命周期 hook 与宿主阶段不匹配      | `warning` |
| [`COD-3014`](/reference/diagnostics/cod-3014) | 异步返回值不被宿主接受              | `warning` |
| [`COD-3015`](/reference/diagnostics/cod-3015) | 代码片段修改了只读上下文            | `error`   |
| [`COD-4001`](/reference/diagnostics/cod-4001) | 用户代码运行时抛错                  | `error`   |
| [`COD-4010`](/reference/diagnostics/cod-4010) | 用户代码执行超时                    | `error`   |
| [`COD-4011`](/reference/diagnostics/cod-4011) | sandbox 权限拒绝                    | `error`   |
| [`COD-4012`](/reference/diagnostics/cod-4012) | 用户代码产生非确定性副作用          | `warning` |
| [`COD-4013`](/reference/diagnostics/cod-4013) | 用户代码递归或循环超过限制          | `error`   |
| [`COD-4014`](/reference/diagnostics/cod-4014) | 用户代码返回不可序列化结果          | `error`   |
| [`COD-5001`](/reference/diagnostics/cod-5001) | 转译失败                            | `error`   |
| [`COD-5002`](/reference/diagnostics/cod-5002) | Shader 编译失败                     | `error`   |
| [`COD-5010`](/reference/diagnostics/cod-5010) | 语言服务 worker 初始化失败          | `error`   |
| [`COD-5011`](/reference/diagnostics/cod-5011) | Source map 生成或映射失败           | `warning` |
| [`COD-5012`](/reference/diagnostics/cod-5012) | CSS/SCSS 预处理失败                 | `error`   |
| [`COD-5013`](/reference/diagnostics/cod-5013) | 目标运行模式不支持当前语言特性      | `warning` |
| [`COD-9001`](/reference/diagnostics/cod-9001) | 代码环境未知异常                    | `error`   |
| [`COD-9002`](/reference/diagnostics/cod-9002) | 代码诊断证据不足                    | `warning` |

### Codegen

| Code                                          | 名称                  | 严重程度  |
| --------------------------------------------- | --------------------- | --------- |
| [`GEN-1001`](/reference/diagnostics/gen-1001) | Canonical IR 构建失败 | `error`   |
| [`GEN-2001`](/reference/diagnostics/gen-2001) | 组件 Adapter 缺失     | `warning` |
| [`GEN-2002`](/reference/diagnostics/gen-2002) | 目标框架不支持该能力  | `warning` |
| [`GEN-3001`](/reference/diagnostics/gen-3001) | 依赖包无法解析        | `error`   |
| [`GEN-3002`](/reference/diagnostics/gen-3002) | 依赖许可证策略不满足  | `warning` |
| [`GEN-4001`](/reference/diagnostics/gen-4001) | 代码发射失败          | `error`   |
| [`GEN-5001`](/reference/diagnostics/gen-5001) | 导出包生成失败        | `error`   |
| [`GEN-9001`](/reference/diagnostics/gen-9001) | Codegen 未知异常      | `error`   |

### Backend/API

| Code                                          | 名称               | 严重程度  |
| --------------------------------------------- | ------------------ | --------- |
| [`API-1001`](/reference/diagnostics/api-1001) | 请求体无法解析     | `error`   |
| [`API-1002`](/reference/diagnostics/api-1002) | 请求参数缺失       | `error`   |
| [`API-2001`](/reference/diagnostics/api-2001) | 用户未登录         | `error`   |
| [`API-2002`](/reference/diagnostics/api-2002) | 会话已过期         | `warning` |
| [`API-3001`](/reference/diagnostics/api-3001) | 权限不足           | `error`   |
| [`API-4001`](/reference/diagnostics/api-4001) | 后端业务校验失败   | `error`   |
| [`API-4004`](/reference/diagnostics/api-4004) | 资源不存在或不可见 | `error`   |
| [`API-4009`](/reference/diagnostics/api-4009) | 业务冲突           | `error`   |
| [`API-5001`](/reference/diagnostics/api-5001) | 数据库写入失败     | `error`   |
| [`API-6001`](/reference/diagnostics/api-6001) | 第三方集成调用失败 | `error`   |
| [`API-9001`](/reference/diagnostics/api-9001) | 后端未知异常       | `error`   |

### AI

| Code                                        | 名称                                   | 严重程度  |
| ------------------------------------------- | -------------------------------------- | --------- |
| [`AI-1001`](/reference/diagnostics/ai-1001) | Provider 配置缺失                      | `warning` |
| [`AI-1002`](/reference/diagnostics/ai-1002) | Provider 请求失败                      | `error`   |
| [`AI-2001`](/reference/diagnostics/ai-2001) | 模型发现失败                           | `warning` |
| [`AI-2002`](/reference/diagnostics/ai-2002) | 模型能力不满足当前任务                 | `warning` |
| [`AI-3001`](/reference/diagnostics/ai-3001) | Prompt 上下文为空                      | `warning` |
| [`AI-4001`](/reference/diagnostics/ai-4001) | 响应为空                               | `error`   |
| [`AI-4002`](/reference/diagnostics/ai-4002) | 响应结构无法解析                       | `error`   |
| [`AI-4010`](/reference/diagnostics/ai-4010) | 流式响应中断                           | `error`   |
| [`AI-4011`](/reference/diagnostics/ai-4011) | 流式响应结构无法解析                   | `error`   |
| [`AI-4012`](/reference/diagnostics/ai-4012) | 流式响应不可读                         | `warning` |
| [`AI-5001`](/reference/diagnostics/ai-5001) | AI Action dry-run 失败                 | `error`   |
| [`AI-5002`](/reference/diagnostics/ai-5002) | AI Action 目标越界                     | `error`   |
| [`AI-5003`](/reference/diagnostics/ai-5003) | AI Action 编辑字段未授权               | `error`   |
| [`AI-5004`](/reference/diagnostics/ai-5004) | Code-owned 输出未使用 CodeArtifact     | `error`   |
| [`AI-5005`](/reference/diagnostics/ai-5005) | AI Action 需要的 domain validator 缺失 | `error`   |
| [`AI-5006`](/reference/diagnostics/ai-5006) | AI Apply token 缺失或过期              | `error`   |
| [`AI-9001`](/reference/diagnostics/ai-9001) | AI 未知异常                            | `error`   |

### Route

| Code                                          | 名称                  | 严重程度  |
| --------------------------------------------- | --------------------- | --------- |
| [`RTE-1001`](/reference/diagnostics/rte-1001) | 路由路径重复          | `error`   |
| [`RTE-1002`](/reference/diagnostics/rte-1002) | 路由路径非法          | `error`   |
| [`RTE-2001`](/reference/diagnostics/rte-2001) | 路由目标组件不存在    | `error`   |
| [`RTE-3001`](/reference/diagnostics/rte-3001) | 布局路由缺少 Outlet   | `warning` |
| [`RTE-3002`](/reference/diagnostics/rte-3002) | Outlet 无法匹配子路由 | `warning` |
| [`RTE-4001`](/reference/diagnostics/rte-4001) | 导航目标无法解析      | `error`   |
| [`RTE-9001`](/reference/diagnostics/rte-9001) | Route 未知异常        | `error`   |

### NodeGraph

| Code                                          | 名称                   | 严重程度  |
| --------------------------------------------- | ---------------------- | --------- |
| [`NGR-1001`](/reference/diagnostics/ngr-1001) | 节点定义不存在         | `error`   |
| [`NGR-2001`](/reference/diagnostics/ngr-2001) | 必填输入端口未连接     | `warning` |
| [`NGR-2002`](/reference/diagnostics/ngr-2002) | 端口类型不兼容         | `error`   |
| [`NGR-3001`](/reference/diagnostics/ngr-3001) | 控制流连线形成非法循环 | `error`   |
| [`NGR-4001`](/reference/diagnostics/ngr-4001) | 节点执行失败           | `error`   |
| [`NGR-5001`](/reference/diagnostics/ngr-5001) | 断点目标不存在         | `warning` |
| [`NGR-9001`](/reference/diagnostics/ngr-9001) | NodeGraph 未知异常     | `error`   |

### Animation

| Code                                          | 名称                        | 严重程度  |
| --------------------------------------------- | --------------------------- | --------- |
| [`ANI-1001`](/reference/diagnostics/ani-1001) | 时间线时长非法              | `error`   |
| [`ANI-1002`](/reference/diagnostics/ani-1002) | 时间线 ID 重复              | `error`   |
| [`ANI-2001`](/reference/diagnostics/ani-2001) | Binding 目标节点不存在      | `error`   |
| [`ANI-3001`](/reference/diagnostics/ani-3001) | Track 属性不支持            | `warning` |
| [`ANI-3002`](/reference/diagnostics/ani-3002) | SVG Filter primitive 不存在 | `error`   |
| [`ANI-4001`](/reference/diagnostics/ani-4001) | Keyframe 时间不递增         | `warning` |
| [`ANI-5001`](/reference/diagnostics/ani-5001) | 动画预览采样失败            | `error`   |
| [`ANI-9001`](/reference/diagnostics/ani-9001) | Animation 未知异常          | `error`   |

## Backend API

后端 API 错误响应会将稳定错误码放在 `error.code` 中，并可能同时返回 `requestId`。

```json
{
  "error": {
    "code": "WKS-4003",
    "message": "Revision conflict.",
    "requestId": "req_...",
    "retryable": true,
    "details": {}
  }
}
```
