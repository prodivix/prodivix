# UX 诊断

UX 诊断用于发现页面和应用在真实使用中的体验问题，例如可访问性、键盘操作、响应式布局、文案说明、视觉对比、动效舒适性和检查器自身状态。

UX 诊断使用 `UX-xxxx` 命名空间。它不是代码语法错误，也不是编辑器操作错误，而是面向最终用户体验的质量信号。

## 什么时候会出现 UX 诊断

常见场景包括：

1. 文本颜色和背景色对比度不足。
2. 图标按钮没有可访问名称。
3. 表单控件缺少 label 或字段约束说明。
4. 关键操作只能用鼠标完成，键盘无法完成。
5. 小屏视口下出现不可访问的横向溢出。
6. 错误消息只说明失败，没有给出修复建议。
7. 动效没有 reduced motion 降级。
8. UX 检查器缺少足够证据，无法判断某条规则是否通过。

这些问题不一定阻止保存或预览，但会影响用户理解、操作、阅读或发布质量。

## 与其他错误码的区别

| 问题类型                                         | 使用命名空间 |
| ------------------------------------------------ | ------------ |
| PIR graph 结构、ValueRef、校验                   | `PIR-xxxx`   |
| 选择、拖拽、Inspector 写入、画布命令             | `EDT-xxxx`   |
| 用户代码解析、类型、运行时、编译                 | `COD-xxxx`   |
| Official plugin package、contribution、Host 注册 | `PLG-xxxx`   |
| 导出和代码生成失败                               | `GEN-xxxx`   |
| 用户体验质量问题                                 | `UX-xxxx`    |

一个问题可能同时产生多个诊断。例如 CSS 语法错误使用 `COD-1001`；如果 CSS 可以运行但导致文本对比度不足，则使用 `UX-1001`。Issues 面板应该保留所有原始错误码，而不是把上游错误折叠成 UX 错误。

## UX 诊断分段

| 段位      | 方向     | 说明                                       |
| --------- | -------- | ------------------------------------------ |
| `UX-10xx` | 可访问性 | WCAG、ARIA、语义、替代文本和辅助技术可读性 |
| `UX-20xx` | 交互     | 键盘、焦点、指针目标、输入反馈和交互状态   |
| `UX-30xx` | 布局     | 响应式、溢出、滚动、遮挡和安全区域         |
| `UX-40xx` | 内容     | 文案、标签、说明、错误建议和状态消息       |
| `UX-50xx` | 视觉     | 对比、层级、密度、主题、动效和可读性       |
| `UX-90xx` | 检查器   | UX 检查器配置、执行和结果生命周期          |

完整码表见 [UX 错误码](/reference/diagnostics/ux)。

## 核心诊断列表

当前核心 UX 诊断共 86 个：

| Code                                        | 名称                                      |
| ------------------------------------------- | ----------------------------------------- |
| [`UX-1001`](/reference/diagnostics/ux-1001) | 文本对比度不满足 WCAG                     |
| [`UX-1002`](/reference/diagnostics/ux-1002) | 非文本内容缺少可访问替代                  |
| [`UX-1003`](/reference/diagnostics/ux-1003) | 表单控件缺少可关联标签                    |
| [`UX-1004`](/reference/diagnostics/ux-1004) | 交互控件缺少可访问名称                    |
| [`UX-1005`](/reference/diagnostics/ux-1005) | 标题层级跳跃或页面缺少结构标题            |
| [`UX-1006`](/reference/diagnostics/ux-1006) | Landmark 或区域语义缺失                   |
| [`UX-1007`](/reference/diagnostics/ux-1007) | ARIA 引用目标不存在                       |
| [`UX-1008`](/reference/diagnostics/ux-1008) | ARIA role 与元素语义冲突                  |
| [`UX-1009`](/reference/diagnostics/ux-1009) | 状态变化未向辅助技术公告                  |
| [`UX-1010`](/reference/diagnostics/ux-1010) | 颜色是唯一的信息表达                      |
| [`UX-1011`](/reference/diagnostics/ux-1011) | 焦点指示器不可见或对比不足                |
| [`UX-1012`](/reference/diagnostics/ux-1012) | 媒体缺少字幕、说明或控制                  |
| [`UX-1013`](/reference/diagnostics/ux-1013) | 语言或文本方向声明缺失                    |
| [`UX-1014`](/reference/diagnostics/ux-1014) | 键盘陷阱风险                              |
| [`UX-1015`](/reference/diagnostics/ux-1015) | 目标 WCAG 等级无法验证                    |
| [`UX-1016`](/reference/diagnostics/ux-1016) | 页面标题缺失或不明确                      |
| [`UX-1017`](/reference/diagnostics/ux-1017) | 缺少跳过重复内容的路径                    |
| [`UX-1018`](/reference/diagnostics/ux-1018) | 内容在缩放或重排后不可用                  |
| [`UX-1019`](/reference/diagnostics/ux-1019) | 文本间距调整后内容不可读                  |
| [`UX-1020`](/reference/diagnostics/ux-1020) | 输入目的或自动完成语义缺失                |
| [`UX-1021`](/reference/diagnostics/ux-1021) | 自定义控件缺少 name、role 或 value        |
| [`UX-1022`](/reference/diagnostics/ux-1022) | 认证流程依赖认知测试且缺少替代            |
| [`UX-1023`](/reference/diagnostics/ux-1023) | 焦点被固定层遮挡                          |
| [`UX-1024`](/reference/diagnostics/ux-1024) | 页面方向被锁定且无必要理由                |
| [`UX-2001`](/reference/diagnostics/ux-2001) | 关键交互无法通过键盘完成                  |
| [`UX-2002`](/reference/diagnostics/ux-2002) | Tab 顺序与视觉或任务顺序不一致            |
| [`UX-2003`](/reference/diagnostics/ux-2003) | 指针或触摸目标尺寸过小                    |
| [`UX-2004`](/reference/diagnostics/ux-2004) | 交互状态缺失                              |
| [`UX-2005`](/reference/diagnostics/ux-2005) | 禁用控件缺少原因或替代路径                |
| [`UX-2006`](/reference/diagnostics/ux-2006) | 输入错误反馈不及时或不可定位              |
| [`UX-2007`](/reference/diagnostics/ux-2007) | Loading 或异步状态不可感知                |
| [`UX-2008`](/reference/diagnostics/ux-2008) | destructive action 缺少确认或撤销路径     |
| [`UX-2009`](/reference/diagnostics/ux-2009) | 手势交互缺少等价控件                      |
| [`UX-2010`](/reference/diagnostics/ux-2010) | 弹层焦点管理不完整                        |
| [`UX-2011`](/reference/diagnostics/ux-2011) | 交互反馈只依赖 hover                      |
| [`UX-2012`](/reference/diagnostics/ux-2012) | 操作结果缺少就地反馈                      |
| [`UX-2013`](/reference/diagnostics/ux-2013) | 快捷键与保留快捷键冲突                    |
| [`UX-2014`](/reference/diagnostics/ux-2014) | 定时消失内容缺少暂停或延长路径            |
| [`UX-2015`](/reference/diagnostics/ux-2015) | 取消、撤销或退出路径缺失                  |
| [`UX-2016`](/reference/diagnostics/ux-2016) | 指针取消行为不安全                        |
| [`UX-3001`](/reference/diagnostics/ux-3001) | 小屏视口出现不可访问横向溢出              |
| [`UX-3002`](/reference/diagnostics/ux-3002) | 内容被固定层或弹层遮挡                    |
| [`UX-3003`](/reference/diagnostics/ux-3003) | 文本在容器内截断且无恢复路径              |
| [`UX-3004`](/reference/diagnostics/ux-3004) | 关键操作在目标断点不可见                  |
| [`UX-3005`](/reference/diagnostics/ux-3005) | 阅读行宽或文本密度超出可读范围            |
| [`UX-3006`](/reference/diagnostics/ux-3006) | 滚动容器嵌套导致操作困难                  |
| [`UX-3007`](/reference/diagnostics/ux-3007) | Safe area 或视口单位处理不完整            |
| [`UX-3008`](/reference/diagnostics/ux-3008) | 空状态或错误状态破坏布局                  |
| [`UX-3009`](/reference/diagnostics/ux-3009) | 组件响应式约束缺失                        |
| [`UX-3010`](/reference/diagnostics/ux-3010) | 弹层位置在视口边缘不可达                  |
| [`UX-3011`](/reference/diagnostics/ux-3011) | 320px 宽度下内容不可重排                  |
| [`UX-3012`](/reference/diagnostics/ux-3012) | 屏幕方向切换后布局或状态丢失              |
| [`UX-3013`](/reference/diagnostics/ux-3013) | 软键盘遮挡输入或主要操作                  |
| [`UX-3014`](/reference/diagnostics/ux-3014) | 打印或导出视图布局不可读                  |
| [`UX-4001`](/reference/diagnostics/ux-4001) | 可见控件文案不明确                        |
| [`UX-4002`](/reference/diagnostics/ux-4002) | 链接文本无法说明目标                      |
| [`UX-4003`](/reference/diagnostics/ux-4003) | 错误消息缺少修复建议                      |
| [`UX-4004`](/reference/diagnostics/ux-4004) | 空状态缺少下一步行动                      |
| [`UX-4005`](/reference/diagnostics/ux-4005) | 必填、格式或约束说明缺失                  |
| [`UX-4006`](/reference/diagnostics/ux-4006) | 状态标签缺少可理解含义                    |
| [`UX-4007`](/reference/diagnostics/ux-4007) | 破坏性操作文案未说明影响范围              |
| [`UX-4008`](/reference/diagnostics/ux-4008) | 本地化文本缺失或混用异常                  |
| [`UX-4009`](/reference/diagnostics/ux-4009) | 数字、日期或单位缺少上下文                |
| [`UX-4010`](/reference/diagnostics/ux-4010) | 状态反馈与实际结果不一致                  |
| [`UX-4011`](/reference/diagnostics/ux-4011) | 术语或行话缺少解释                        |
| [`UX-4012`](/reference/diagnostics/ux-4012) | 帮助入口不一致或缺失                      |
| [`UX-4013`](/reference/diagnostics/ux-4013) | 多步骤流程缺少进度和当前位置              |
| [`UX-4014`](/reference/diagnostics/ux-4014) | 重复输入或重复确认要求过多                |
| [`UX-5001`](/reference/diagnostics/ux-5001) | 非文本图形对比度不足                      |
| [`UX-5002`](/reference/diagnostics/ux-5002) | 视觉层级无法支撑主要任务                  |
| [`UX-5003`](/reference/diagnostics/ux-5003) | 主题变量组合导致状态不可读                |
| [`UX-5004`](/reference/diagnostics/ux-5004) | 动效缺少 reduced motion 降级              |
| [`UX-5005`](/reference/diagnostics/ux-5005) | 闪烁或频闪风险                            |
| [`UX-5006`](/reference/diagnostics/ux-5006) | Disabled、selected 或 active 状态区分不足 |
| [`UX-5007`](/reference/diagnostics/ux-5007) | 可读字号或行高低于目标策略                |
| [`UX-5008`](/reference/diagnostics/ux-5008) | 高密度界面缺少分组或分隔                  |
| [`UX-5009`](/reference/diagnostics/ux-5009) | Skeleton 或占位内容与最终布局差异过大     |
| [`UX-5010`](/reference/diagnostics/ux-5010) | 图表或数据可视化缺少可读编码              |
| [`UX-5011`](/reference/diagnostics/ux-5011) | 图片文字缺少可访问替代                    |
| [`UX-5012`](/reference/diagnostics/ux-5012) | 主题切换时出现短暂不可读闪烁              |
| [`UX-9001`](/reference/diagnostics/ux-9001) | UX 检查器未知异常                         |
| [`UX-9002`](/reference/diagnostics/ux-9002) | UX 规则配置非法                           |
| [`UX-9003`](/reference/diagnostics/ux-9003) | UX 检测结果已过期                         |
| [`UX-9004`](/reference/diagnostics/ux-9004) | UX 检查器证据不足                         |
| [`UX-9005`](/reference/diagnostics/ux-9005) | UX 规则被显式豁免                         |
| [`UX-9006`](/reference/diagnostics/ux-9006) | UX 诊断需要人工复核                       |

## 如何阅读一条 UX 诊断

一条 UX 诊断通常包含：

| 字段        | 用途                                                |
| ----------- | --------------------------------------------------- |
| `code`      | 稳定错误码，例如 `UX-1001`                          |
| `severity`  | 严重程度，决定是否应在发布前处理                    |
| `targetRef` | 指向可修复的位置，例如节点、字段、主题 token 或视口 |
| `meta`      | 结构化证据，例如 WCAG 条款、颜色、对比度、视口尺寸  |
| `docsUrl`   | 对应说明页                                          |

示例：

```json
{
  "code": "UX-1001",
  "domain": "ux",
  "severity": "warning",
  "message": "文本对比度不满足 WCAG。",
  "targetRef": {
    "kind": "theme-token",
    "themeId": "monochrome-light",
    "tokenPath": "semantic.text.secondary"
  },
  "meta": {
    "standardRef": [
      {
        "standard": "WCAG",
        "version": "2.2",
        "criterion": "1.4.3",
        "level": "AA"
      }
    ],
    "evidence": {
      "foreground": "#737373",
      "background": "#ffffff",
      "contrastRatio": 4.1,
      "requiredRatio": 4.5
    }
  }
}
```

`UX-1001` 是 Prodivix 的稳定产品错误码。WCAG 条款、axe rule、Lighthouse audit 或其他外部工具编号只作为 `meta.standardRef` 里的证据，不替代主错误码。

## 严重程度

| 严重程度  | UX 含义                                      |
| --------- | -------------------------------------------- |
| `info`    | 可读性、说明、结构或一致性改进，不阻断流程   |
| `warning` | 影响部分用户完成任务，建议在发布前修复       |
| `error`   | 关键任务不可完成、严重可访问性风险或频闪风险 |
| `fatal`   | 保留给检查上下文无法继续的极端情况           |

本地保存通常不应被 UX warning 阻断。导出或发布可以根据项目策略阻断 `error` 级 UX 诊断。

## 检查模式

UX 诊断按证据来源分为四类：

| 模式        | 输入                                             | 示例                              |
| ----------- | ------------------------------------------------ | --------------------------------- |
| Static      | PIR、组件 metadata、Inspector schema、主题 token | `UX-1003`、`UX-1004`、`UX-4005`   |
| Preview     | 渲染后的 DOM、computed style、viewport           | `UX-1001`、`UX-3001`、`UX-5003`   |
| Interaction | focus walk、键盘路径、状态变化                   | `UX-1014`、`UX-2001`、`UX-2010`   |
| Export gate | 路由集合、主题矩阵、目标视口                     | 发布前聚合 `UX-xxxx` 与其他错误码 |

如果检查器缺少证据，应该返回 `UX-9004` 或更具体的证据不足诊断，而不是把结果伪装成通过或失败。

## 典型处理方式

1. 先看 `code` 和严重程度，判断是否影响发布。
2. 看 `targetRef`，定位到节点、字段、主题 token、视口或运行时 DOM。
3. 看 `meta.evidence`，确认检查器为什么判断失败。
4. 按对应错误码页面的建议修复。
5. 如果确实需要暂时接受风险，使用带原因和范围的结构化豁免。

## 结构化豁免

部分实验页面、第三方内容或临时设计可能需要豁免。豁免不等于删除诊断，它应该记录：

```ts
type UxExemption = {
  code: `UX-${number}`;
  targetRef: DiagnosticTargetRef;
  reason: string;
  owner?: string;
  expiresAt?: string;
  createdAt: string;
};
```

豁免必须有明确原因和范围。到期后应重新检查。对于频闪风险、键盘陷阱等高风险问题，不建议用长期豁免隐藏。

## 常用入口

- [UX 错误码索引](/reference/diagnostics/ux)
- [错误码总索引](/reference/diagnostic-codes)
- [`UX-1001` 文本对比度不满足 WCAG](/reference/diagnostics/ux-1001)
- [`UX-2001` 关键交互无法通过键盘完成](/reference/diagnostics/ux-2001)
- [`UX-3001` 小屏视口出现不可访问横向溢出](/reference/diagnostics/ux-3001)
- [`UX-9004` UX 检查器证据不足](/reference/diagnostics/ux-9004)
