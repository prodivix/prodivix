# UX Diagnostics 编码规范（UX）

## 状态

- Draft
- 日期：2026-05-10
- 关联：
  - `specs/diagnostics/README.md`
  - `specs/decisions/26.ux-diagnostics.md`
  - `specs/decisions/01.monochrome-ui.md`
  - `specs/decisions/21.inspector-panel-architecture.md`
  - `specs/pir/pir-contract-v1.3.md`

## 1. 范围

`UX-xxxx` 覆盖 Prodivix 项目产物和作者态画布中的用户体验质量诊断，包括可访问性、交互可用性、响应式布局、内容语义、视觉反馈、动效舒适性和体验检查器自身异常。

包括：

1. 与 WCAG、WAI-ARIA、HTML 语义和键盘可达性相关的稳定问题。
2. 交互控件、焦点顺序、输入反馈、目标尺寸和状态表达问题。
3. 响应式布局、滚动、溢出、安全区域和可读宽度问题。
4. 文案、标签、表单提示、错误建议和状态反馈缺失问题。
5. 视觉对比、密度、层级、遮挡、运动和主题可读性问题。
6. UX checker 无法完成扫描、规则配置非法或检测结果过期的问题。

不覆盖：

1. PIR 保存态结构错误，使用 `PIR-xxxx`。
2. Inspector 字段写入、拖拽、选择和编辑器命令错误，使用 `EDT-xxxx`。
3. 用户代码解析、类型、运行时和 Mounted CSS 语法错误，使用 `COD-xxxx`。
4. Official plugin package、contribution 和 Host 注册错误使用 `PLG-xxxx`；旧 remote runtime `ELIB-xxxx` 域已删除。
5. 目标框架代码生成或导出失败，使用 `GEN-xxxx`。
6. 纯审美偏好、品牌风格选择或一次性设计建议，除非它们被稳定规则、标准或项目约束定义。

## 2. 阶段

```ts
type UxDiagnosticStage =
  'accessibility' | 'interaction' | 'layout' | 'content' | 'visual' | 'checker';
```

## 3. 编码分段

| 段位      | 阶段            | 说明                                       |
| --------- | --------------- | ------------------------------------------ |
| `UX-10xx` | `accessibility` | WCAG、ARIA、语义、替代文本和辅助技术可读性 |
| `UX-20xx` | `interaction`   | 键盘、焦点、指针目标、输入反馈和交互状态   |
| `UX-30xx` | `layout`        | 响应式、溢出、滚动、遮挡和安全区域         |
| `UX-40xx` | `content`       | 文案、标签、说明、错误建议和状态消息       |
| `UX-50xx` | `visual`        | 对比、层级、密度、主题、动效和可读性       |
| `UX-90xx` | `checker`       | UX 检查器配置、执行和结果生命周期          |

## 4. 已占用码位

### `UX-1001` 文本对比度不满足 WCAG

- Severity: `warning`
- Stage: `accessibility`
- Retryable: false
- Trigger: 可见文本与背景色的对比度低于目标 WCAG 等级要求
- User action: 调整文本色、背景色、字号或字重，直到对比度满足目标等级
- Developer notes: `meta.standardRef` 应记录 WCAG success criterion；检查器应保留前景色、背景色和计算出的 contrast ratio

### `UX-1002` 非文本内容缺少可访问替代

- Severity: `warning`
- Stage: `accessibility`
- Retryable: false
- Trigger: 有语义的信息图像、图标按钮、图表或媒体没有可访问名称、替代文本或等价说明
- User action: 添加 `alt`、`aria-label`、可见文本标签或图表摘要；纯装饰内容应明确标记为装饰
- Developer notes: 规则必须区分信息性内容、控件图标和纯装饰内容，避免要求所有装饰图形提供文案

### `UX-1003` 表单控件缺少可关联标签

- Severity: `warning`
- Stage: `accessibility`
- Retryable: false
- Trigger: 输入框、选择器、开关、滑块或自定义表单控件没有可由辅助技术读取的稳定标签
- User action: 为控件添加可见 label、`aria-label` 或 `aria-labelledby`
- Developer notes: 诊断应定位到具体 field 或 PIR node；placeholder 不能作为唯一标签

### `UX-1004` 交互控件缺少可访问名称

- Severity: `warning`
- Stage: `accessibility`
- Retryable: false
- Trigger: button、link、menuitem、tab 或自定义交互控件没有可访问名称
- User action: 添加明确按钮文本、图标按钮标签或关联说明
- Developer notes: 图标按钮是高频来源；应检查 visible text、aria 属性和关联 labelledby

### `UX-1005` 标题层级跳跃或页面缺少结构标题

- Severity: `info`
- Stage: `accessibility`
- Retryable: false
- Trigger: 页面或区域标题层级无法形成可导航结构，或关键 section 缺少标题
- User action: 调整 heading 层级，确保页面和主要区域能被快速浏览
- Developer notes: 对组件片段应使用 scoped heading policy，不能要求每个组件都从 `h1` 开始

### `UX-1006` Landmark 或区域语义缺失

- Severity: `info`
- Stage: `accessibility`
- Retryable: false
- Trigger: 页面缺少 main、nav、aside、header、footer 或等价 landmark，导致辅助技术无法快速跳转
- User action: 为页面主要区域添加语义元素或 landmark role
- Developer notes: 对嵌入式组件只检查其局部区域角色，不把完整页面规则强加给组件预览

### `UX-1007` ARIA 引用目标不存在

- Severity: `warning`
- Stage: `accessibility`
- Retryable: false
- Trigger: `aria-labelledby`、`aria-describedby`、`aria-controls` 或 `aria-owns` 指向不存在的 ID
- User action: 修正引用 ID，或删除无效 ARIA 引用
- Developer notes: 若 ID 由运行时生成，检查器应基于 materialized preview 结果而不是静态 PIR 猜测

### `UX-1008` ARIA role 与元素语义冲突

- Severity: `warning`
- Stage: `accessibility`
- Retryable: false
- Trigger: 元素的 role、ARIA 属性或可交互行为与原生语义冲突
- User action: 优先使用原生语义元素；必要时修正 role 和 ARIA 属性组合
- Developer notes: 规则应引用 WAI-ARIA allowed roles 或项目内 role policy，不做自由文本判断

### `UX-1009` 状态变化未向辅助技术公告

- Severity: `warning`
- Stage: `accessibility`
- Retryable: false
- Trigger: 保存结果、表单错误、异步加载完成或动态列表变化没有 live region、focus move 或等价公告
- User action: 为关键状态变化添加 `role="status"`、`aria-live` 或明确焦点转移
- Developer notes: 只对用户必须感知的状态变化报错，避免把所有微小动画或计数变化都变成 live region

### `UX-1010` 颜色是唯一的信息表达

- Severity: `warning`
- Stage: `accessibility`
- Retryable: false
- Trigger: 错误、选中、成功、风险或分类信息只能通过颜色区分
- User action: 同时使用文本、图标、形状、边框或模式来表达状态
- Developer notes: 应检查同一状态是否存在非颜色通道；不要因存在颜色本身就报错

### `UX-1011` 焦点指示器不可见或对比不足

- Severity: `warning`
- Stage: `accessibility`
- Retryable: false
- Trigger: 可聚焦元素没有可见 focus indicator，或指示器与相邻颜色对比不足
- User action: 添加清晰的 focus ring、outline 或其他稳定焦点样式
- Developer notes: 需要检查实际主题和状态组合；不要只检查 CSS 属性名是否存在

### `UX-1012` 媒体缺少字幕、说明或控制

- Severity: `warning`
- Stage: `accessibility`
- Retryable: false
- Trigger: 音频、视频、自动播放媒体或时间型内容缺少字幕、文本说明、暂停或音量控制
- User action: 添加字幕、文字稿、媒体控制或禁用自动播放
- Developer notes: 首批可以只检查显式媒体节点和项目内 media component metadata

### `UX-1013` 语言或文本方向声明缺失

- Severity: `info`
- Stage: `accessibility`
- Retryable: false
- Trigger: 页面、文档或文本区域缺少 `lang`、`dir` 或等价语言方向声明
- User action: 为页面或局部文本设置正确语言和方向
- Developer notes: 多语言内容应允许局部覆盖；不应只按 workspace 默认语言推断

### `UX-1014` 键盘陷阱风险

- Severity: `error`
- Stage: `accessibility`
- Retryable: false
- Trigger: 焦点进入 modal、drawer、canvas overlay 或自定义 widget 后无法通过键盘离开或关闭
- User action: 修复焦点管理，提供 Escape、关闭按钮或合理的焦点返回路径
- Developer notes: 需要运行时或 preview focus walk 证据；静态规则只能标记风险

### `UX-1015` 目标 WCAG 等级无法验证

- Severity: `info`
- Stage: `accessibility`
- Retryable: true
- Trigger: 检查器缺少主题变量、字体尺寸、背景叠加或运行时状态，无法判断是否满足目标 WCAG 等级
- User action: 补齐主题变量、预览状态或检查配置后重新扫描
- Developer notes: 这是不确定结果，不应伪装成合规或不合规；应记录 missing evidence

### `UX-1016` 页面标题缺失或不明确

- Severity: `warning`
- Stage: `accessibility`
- Retryable: false
- Trigger: 页面、路由或预览文档缺少可识别标题，或标题无法说明当前页面用途
- User action: 为页面设置明确标题，说明当前页面、任务或对象
- Developer notes: 静态检查应优先读取 route metadata、document title 和页面级 heading，不要求组件片段都有完整页面标题

### `UX-1017` 缺少跳过重复内容的路径

- Severity: `warning`
- Stage: `accessibility`
- Retryable: false
- Trigger: 页面存在重复导航、工具栏或长列表，但键盘用户无法快速跳到主内容或关键区域
- User action: 添加 skip link、landmark、区域快捷导航或等价键盘命令
- Developer notes: 对工具型界面可接受命令面板或区域导航作为替代，不强制只使用传统 skip link

### `UX-1018` 内容在缩放或重排后不可用

- Severity: `warning`
- Stage: `accessibility`
- Retryable: false
- Trigger: 文本缩放、浏览器 zoom 或窄宽度 reflow 后，内容被裁切、重叠或关键操作不可达
- User action: 修复响应式布局、文本换行、容器约束和滚动策略
- Developer notes: 应记录 zoom level、viewport 和溢出证据；可与 `UX-3001` 聚合但语义不同

### `UX-1019` 文本间距调整后内容不可读

- Severity: `info`
- Stage: `accessibility`
- Retryable: false
- Trigger: 行高、字距、词距或段落间距被用户样式调整后，文本重叠、截断或控件不可用
- User action: 避免固定高度锁死文本，给内容区域留出可伸缩空间
- Developer notes: 首批可作为 preview checker；静态规则只能标记高风险固定尺寸组合

### `UX-1020` 输入目的或自动完成语义缺失

- Severity: `info`
- Stage: `accessibility`
- Retryable: false
- Trigger: 常见个人信息、认证、地址、联系方式或支付字段缺少 autocomplete、inputMode 或等价输入目的声明
- User action: 为字段补充正确的输入目的、键盘类型或自动完成语义
- Developer notes: 仅对 schema 能确认字段语义的输入触发；不要从字段名自由猜测隐私敏感用途

### `UX-1021` 自定义控件缺少 name、role 或 value

- Severity: `warning`
- Stage: `accessibility`
- Retryable: false
- Trigger: 自定义 switch、slider、tab、menu、combobox、tree 或 canvas widget 没有可被辅助技术读取的名称、角色或当前值
- User action: 优先使用原生控件；必要时补齐 role、aria 属性和状态同步
- Developer notes: 与 `UX-1004` 的区别是本码位关注复合控件的完整可访问对象模型

### `UX-1022` 认证流程依赖认知测试且缺少替代

- Severity: `warning`
- Stage: `accessibility`
- Retryable: false
- Trigger: 登录、验证或关键操作要求记忆、解谜、识别图像、转写字符等认知测试，且没有替代方式
- User action: 提供密码管理器兼容、一次性链接、生物识别、支持粘贴或其他可访问替代
- Developer notes: 只对认证和高价值流程触发；普通表单校验不应归入本码位

### `UX-1023` 焦点被固定层遮挡

- Severity: `warning`
- Stage: `accessibility`
- Retryable: false
- Trigger: 当前焦点元素被 sticky header、floating toolbar、toast、drawer 或软键盘部分或完全遮挡
- User action: 调整滚动定位、safe area、层级、焦点滚动或 overlay 布局
- Developer notes: 需要 observed focus rectangle 和遮挡元素证据；可与 `UX-3002` 聚合

### `UX-1024` 页面方向被锁定且无必要理由

- Severity: `info`
- Stage: `accessibility`
- Retryable: false
- Trigger: 页面或功能强制横屏/竖屏，且不是绘图、游戏、媒体或其他方向敏感任务
- User action: 支持双方向布局，或提供方向锁定原因和替代访问路径
- Developer notes: 判断应读取 page capability 或 app manifest，不用单一 CSS 媒体查询推断

### `UX-2001` 关键交互无法通过键盘完成

- Severity: `error`
- Stage: `interaction`
- Retryable: false
- Trigger: 导航、提交、关闭、选择、拖放替代或主要编辑动作只能通过鼠标或触摸完成
- User action: 添加键盘操作路径、快捷键、菜单命令或可聚焦控件
- Developer notes: 应优先检查关键任务路径；复杂画布可提供等价命令而不是逐像素键盘拖动

### `UX-2002` Tab 顺序与视觉或任务顺序不一致

- Severity: `warning`
- Stage: `interaction`
- Retryable: false
- Trigger: Tab 顺序跳跃、反向、进入隐藏内容或与主要任务顺序明显不一致
- User action: 调整 DOM 顺序、tabindex、焦点容器或弹层焦点管理
- Developer notes: 正 `tabindex` 应作为强风险信号；最终判断以可观测 focus order 为准

### `UX-2003` 指针或触摸目标尺寸过小

- Severity: `warning`
- Stage: `interaction`
- Retryable: false
- Trigger: 可点击、可拖动或可触摸目标小于项目目标尺寸或 WCAG 目标尺寸要求
- User action: 增大目标区域、增加间距，或提供等价大目标操作入口
- Developer notes: `meta.standardRef` 可记录 WCAG target size criterion；紧邻目标的间距也应纳入判断

### `UX-2004` 交互状态缺失

- Severity: `warning`
- Stage: `interaction`
- Retryable: false
- Trigger: 可交互元素缺少 hover、focus、active、selected、disabled、loading 或 pressed 等必要状态表达
- User action: 为控件补齐与功能相关的状态样式和语义属性
- Developer notes: 只要求与控件角色相关的状态；不可交互文本不应被检查

### `UX-2005` 禁用控件缺少原因或替代路径

- Severity: `info`
- Stage: `interaction`
- Retryable: false
- Trigger: 关键操作被禁用，但用户无法理解禁用原因或下一步行动
- User action: 提供 tooltip、说明、校验信息或引导到可完成前置条件的位置
- Developer notes: 对 destructive 或 primary action 优先检查；普通低价值按钮可降级为 info

### `UX-2006` 输入错误反馈不及时或不可定位

- Severity: `warning`
- Stage: `interaction`
- Retryable: false
- Trigger: 表单输入错误只在提交后以全局消息出现，或错误无法定位到具体字段
- User action: 在相关字段附近展示错误信息，并把错误与字段建立可访问关联
- Developer notes: 可与 `UX-1003`、`UX-4003` 聚合，但不要复用同一 code 表达不同语义

### `UX-2007` Loading 或异步状态不可感知

- Severity: `warning`
- Stage: `interaction`
- Retryable: true
- Trigger: 长耗时操作没有 loading、progress、skeleton、禁用状态或状态公告
- User action: 为操作入口和结果区域添加明确异步状态
- Developer notes: 阈值应可配置；极短操作不需要稳定 loading 诊断

### `UX-2008` destructive action 缺少确认或撤销路径

- Severity: `warning`
- Stage: `interaction`
- Retryable: false
- Trigger: 删除、覆盖、清空、发布或不可逆变更没有确认、预览、撤销或恢复机制
- User action: 添加确认、撤销、回收站、版本回退或明确风险提示
- Developer notes: 是否 destructive 应来自 command metadata 或 component action schema

### `UX-2009` 手势交互缺少等价控件

- Severity: `warning`
- Stage: `interaction`
- Retryable: false
- Trigger: 滑动、拖拽、长按、双指缩放或悬停才能完成的任务没有按钮、菜单或键盘等价路径
- User action: 添加显式控件或命令入口
- Developer notes: 画布编辑可以用命令面板、属性面板或快捷键作为等价路径

### `UX-2010` 弹层焦点管理不完整

- Severity: `warning`
- Stage: `interaction`
- Retryable: false
- Trigger: modal、popover、menu、tooltip 或 drawer 打开后焦点未进入、未限制、未返回或错误落入背景内容
- User action: 修复打开、循环、关闭和返回焦点策略
- Developer notes: modal 与 non-modal popover 规则不同；诊断应记录 overlay kind

### `UX-2011` 交互反馈只依赖 hover

- Severity: `warning`
- Stage: `interaction`
- Retryable: false
- Trigger: 关键说明、操作入口或状态反馈只有 hover 时可见，键盘和触摸用户无法获得
- User action: 提供 focus、click、可见文本或触摸可用的等价反馈
- Developer notes: tooltip 可作为补充，不应成为唯一关键信息来源

### `UX-2012` 操作结果缺少就地反馈

- Severity: `info`
- Stage: `interaction`
- Retryable: true
- Trigger: 保存、复制、应用、导入、导出或生成操作完成后没有在触发区域或结果区域反馈
- User action: 在操作入口附近显示成功、失败或下一步状态
- Developer notes: 与全局 toast 不冲突；优先要求就地反馈以保留上下文

### `UX-2013` 快捷键与保留快捷键冲突

- Severity: `warning`
- Stage: `interaction`
- Retryable: false
- Trigger: 页面或组件快捷键覆盖浏览器、系统、屏幕阅读器、编辑器保留快捷键，或与同一作用域内其他命令冲突
- User action: 调整快捷键、限定作用域，或提供可配置快捷键
- Developer notes: 应读取 shortcut registry 和平台保留列表；不要只按字符串重复判断

### `UX-2014` 定时消失内容缺少暂停或延长路径

- Severity: `warning`
- Stage: `interaction`
- Retryable: false
- Trigger: toast、提示、验证码、会话、自动轮播或限时操作在用户可处理前自动消失，且无法暂停、延长或重新打开
- User action: 增加暂停、延长、重新打开、历史记录或非限时替代
- Developer notes: 短暂的非关键信息可豁免；错误、成功结果和安全提示应优先检查

### `UX-2015` 取消、撤销或退出路径缺失

- Severity: `warning`
- Stage: `interaction`
- Retryable: false
- Trigger: 多步骤流程、弹层、批量操作、AI apply 或 destructive action 缺少取消、撤销、返回或退出路径
- User action: 添加取消、撤销、返回上一步、关闭或恢复机制
- Developer notes: 与 `UX-2008` 不同，本码位覆盖广义用户控制和自由度

### `UX-2016` 指针取消行为不安全

- Severity: `warning`
- Stage: `interaction`
- Retryable: false
- Trigger: 按下鼠标或触摸时立即触发高影响操作，用户无法通过移动指针、松开外部或取消手势来避免执行
- User action: 将高影响操作放到 pointer up/click，或提供取消、确认、撤销机制
- Developer notes: 对拖拽、长按和 destructive action 优先检查；普通 hover/press 视觉反馈不触发

### `UX-3001` 小屏视口出现不可访问横向溢出

- Severity: `warning`
- Stage: `layout`
- Retryable: false
- Trigger: 移动或窄视口下正文、表单、工具栏或关键操作产生不可访问横向滚动
- User action: 调整响应式断点、换行、网格轨道或 overflow 策略
- Developer notes: 数据表、代码块和画布可允许受控横向滚动，但必须可发现且不遮挡关键操作

### `UX-3002` 内容被固定层或弹层遮挡

- Severity: `warning`
- Stage: `layout`
- Retryable: false
- Trigger: fixed header、toolbar、toast、modal、drawer 或 floating panel 遮挡关键内容或操作入口
- User action: 调整层级、间距、safe area、portal 位置或滚动定位
- Developer notes: 需要基于实际 viewport 和 z-index stacking 结果判断

### `UX-3003` 文本在容器内截断且无恢复路径

- Severity: `warning`
- Stage: `layout`
- Retryable: false
- Trigger: 标签、按钮、表头、错误信息或关键状态文本被截断，且没有 tooltip、展开或响应式换行路径
- User action: 调整布局、允许换行、缩短文案或提供完整文本查看方式
- Developer notes: 纯装饰或重复低价值文本可降级；关键操作文案不应被截断

### `UX-3004` 关键操作在目标断点不可见

- Severity: `error`
- Stage: `layout`
- Retryable: false
- Trigger: 保存、提交、关闭、返回、继续或主要导航在某个目标断点不可见或不可触达
- User action: 调整移动端导航、sticky action、overflow 或布局优先级
- Developer notes: 目标断点应来自项目 viewport policy，不硬编码单一设备尺寸

### `UX-3005` 阅读行宽或文本密度超出可读范围

- Severity: `info`
- Stage: `layout`
- Retryable: false
- Trigger: 长文本区域过宽、过窄、行距过低或密度过高，影响连续阅读
- User action: 设置最大宽度、行高、段落间距或内容布局
- Developer notes: Dashboard、表格和工具面板可使用不同密度阈值；不要用文章规则约束所有 UI

### `UX-3006` 滚动容器嵌套导致操作困难

- Severity: `warning`
- Stage: `layout`
- Retryable: false
- Trigger: 嵌套滚动区域使用户难以到达内容、焦点滚动错位或滚轮事件被错误截获
- User action: 简化滚动层级，明确主滚动容器，并修复焦点滚动策略
- Developer notes: 画布、代码编辑器和数据表是允许嵌套滚动的例外，但必须有清晰边界

### `UX-3007` Safe area 或视口单位处理不完整

- Severity: `warning`
- Stage: `layout`
- Retryable: false
- Trigger: 移动端浏览器 chrome、刘海屏、软键盘或 dynamic viewport 导致内容被裁切
- User action: 使用 safe-area inset、dynamic viewport 单位或键盘避让策略
- Developer notes: 只对移动目标断点启用；桌面预览不应触发该码位

### `UX-3008` 空状态或错误状态破坏布局

- Severity: `warning`
- Stage: `layout`
- Retryable: false
- Trigger: 无数据、加载失败、权限不足或过滤结果为空时，布局塌陷、操作错位或信息不可见
- User action: 为状态容器设置稳定尺寸、说明和恢复操作
- Developer notes: 检查器应覆盖正常、空、错误和加载四类状态

### `UX-3009` 组件响应式约束缺失

- Severity: `warning`
- Stage: `layout`
- Retryable: false
- Trigger: 固定宽高、绝对定位、不可换行文本或无 min/max 约束导致组件无法适配目标容器
- User action: 添加 min/max、aspect-ratio、container query、flex/grid 约束或换行策略
- Developer notes: 需要区分工具类固定画布和普通内容组件；不要禁止所有固定尺寸

### `UX-3010` 弹层位置在视口边缘不可达

- Severity: `warning`
- Stage: `layout`
- Retryable: false
- Trigger: menu、popover、tooltip、dropdown 或 context panel 超出视口且无法滚动访问
- User action: 添加 collision detection、flip、shift、max-height 或 portal 策略
- Developer notes: 应记录触发视口、anchor 和 overlay 尺寸，便于复现

### `UX-3011` 320px 宽度下内容不可重排

- Severity: `warning`
- Stage: `layout`
- Retryable: false
- Trigger: 目标页面在 320 CSS px 宽度或项目最小宽度下无法单列重排，导致内容裁切或横向滚动
- User action: 调整布局断点、网格、容器宽度和文本换行策略
- Developer notes: 数据表、代码编辑器和画布可使用受控横向滚动，但关键表单和导航不应依赖横向滚动

### `UX-3012` 屏幕方向切换后布局或状态丢失

- Severity: `warning`
- Stage: `layout`
- Retryable: true
- Trigger: 设备横竖屏切换后，焦点、滚动位置、弹层、输入内容或关键操作状态丢失
- User action: 修复方向变化时的状态保持和布局恢复策略
- Developer notes: 需要交互或 preview 证据；静态检查只能标记方向锁定或固定尺寸风险

### `UX-3013` 软键盘遮挡输入或主要操作

- Severity: `warning`
- Stage: `layout`
- Retryable: false
- Trigger: 移动端软键盘打开后，当前输入、提交按钮、错误信息或下一步操作被遮挡且无法滚动到可见区域
- User action: 添加键盘避让、scroll into view、sticky action 调整或 dynamic viewport 策略
- Developer notes: 应记录 viewport、keyboard inset 和 focused field；桌面环境不触发

### `UX-3014` 打印或导出视图布局不可读

- Severity: `info`
- Stage: `layout`
- Retryable: false
- Trigger: 打印、PDF、图片导出或分享预览中内容裁切、分页错误、背景丢失或关键状态不可读
- User action: 添加 print/export 专用布局、分页规则、背景策略和替代文本
- Developer notes: 只对声明支持打印或导出的页面触发；普通编辑器工作台可豁免

### `UX-4001` 可见控件文案不明确

- Severity: `info`
- Stage: `content`
- Retryable: false
- Trigger: 按钮、菜单项、链接或标题使用含糊文案，无法从上下文判断动作或目标
- User action: 使用具体动作、对象和结果描述文案
- Developer notes: 不做自由审美评价；应基于禁用词表、重复标签或缺失对象上下文判断

### `UX-4002` 链接文本无法说明目标

- Severity: `info`
- Stage: `content`
- Retryable: false
- Trigger: 链接文本为“点击这里”“更多”“查看”等，脱离上下文无法判断目标
- User action: 改为说明目标页面、资源或动作的链接文本
- Developer notes: 若 aria-label 或 surrounding context 可稳定说明目标，可不触发

### `UX-4003` 错误消息缺少修复建议

- Severity: `warning`
- Stage: `content`
- Retryable: false
- Trigger: 错误消息只描述失败，没有说明用户可以如何修复、重试或上报
- User action: 补充下一步建议、相关入口、可重试说明或上报信息
- Developer notes: 可与 diagnostics `hint` 字段联动；自然语言可本地化，code 必须稳定

### `UX-4004` 空状态缺少下一步行动

- Severity: `info`
- Stage: `content`
- Retryable: false
- Trigger: 列表、表格、面板或资源区域为空时，只显示空白或无行动建议
- User action: 说明为什么为空，并提供创建、导入、清除筛选或返回入口
- Developer notes: 如果空状态本身是成功结果，也应说明当前状态而不是留白

### `UX-4005` 必填、格式或约束说明缺失

- Severity: `warning`
- Stage: `content`
- Retryable: false
- Trigger: 表单字段有必填、格式、长度、范围或唯一性约束，但提交前没有可见说明
- User action: 在字段附近补充约束说明或示例
- Developer notes: 字段 schema 是首选证据来源；不要从错误文案反推所有约束

### `UX-4006` 状态标签缺少可理解含义

- Severity: `info`
- Stage: `content`
- Retryable: false
- Trigger: badge、tag、chip、颜色点或图标状态没有文本含义或图例
- User action: 添加状态文本、说明、图例或 tooltip
- Developer notes: 若状态在同一屏已由表头、图例或 aria label 解释，可不触发

### `UX-4007` 破坏性操作文案未说明影响范围

- Severity: `warning`
- Stage: `content`
- Retryable: false
- Trigger: 删除、重置、覆盖、撤销发布等操作没有说明受影响对象或后果
- User action: 在按钮、确认框或详情中说明影响范围和恢复方式
- Developer notes: 可与 `UX-2008` 聚合；本码位关注文案信息，不关注确认机制本身

### `UX-4008` 本地化文本缺失或混用异常

- Severity: `info`
- Stage: `content`
- Retryable: false
- Trigger: 同一界面混用占位 key、未翻译文本、错误语言或不可读编码
- User action: 补齐本地化资源，或标记允许的技术词汇和专名
- Developer notes: 技术标识、代码、品牌名和用户输入应作为例外

### `UX-4009` 数字、日期或单位缺少上下文

- Severity: `info`
- Stage: `content`
- Retryable: false
- Trigger: 价格、尺寸、时间、百分比、性能或计数没有单位、时区、精度或含义说明
- User action: 添加单位、时间范围、时区、比较基准或格式化说明
- Developer notes: 应从数据 schema、locale 和 formatter metadata 获取证据

### `UX-4010` 状态反馈与实际结果不一致

- Severity: `warning`
- Stage: `content`
- Retryable: true
- Trigger: UI 文案显示成功、已保存、已同步或已发布，但公开状态或后端响应表明结果未完成
- User action: 修正状态映射，避免过早显示完成结果
- Developer notes: 这是跨状态诊断，需要 command result、revision 或 API response 作为证据

### `UX-4011` 术语或行话缺少解释

- Severity: `info`
- Stage: `content`
- Retryable: false
- Trigger: 页面使用专业术语、缩写、内部概念或错误码简称，但没有上下文解释、链接或帮助入口
- User action: 添加简短解释、tooltip、文档链接或更贴近用户任务的文案
- Developer notes: 技术型工作台允许领域术语，但首次出现或关键决策处应可理解

### `UX-4012` 帮助入口不一致或缺失

- Severity: `info`
- Stage: `content`
- Retryable: false
- Trigger: 复杂功能、错误状态、空状态或高风险操作缺少帮助入口，或同类页面帮助入口位置和形式不一致
- User action: 添加稳定帮助入口，并在同类流程中保持位置和命名一致
- Developer notes: 可从 docsUrl、help metadata、panel schema 或 operation metadata 判断

### `UX-4013` 多步骤流程缺少进度和当前位置

- Severity: `warning`
- Stage: `content`
- Retryable: false
- Trigger: 导入、发布、授权、AI apply、迁移或配置向导没有说明当前步骤、总步骤、完成状态或返回路径
- User action: 添加步骤指示、当前状态、剩余任务和返回/取消入口
- Developer notes: 对单步表单不触发；只检查明确的 multi-step flow

### `UX-4014` 重复输入或重复确认要求过多

- Severity: `info`
- Stage: `content`
- Retryable: false
- Trigger: 系统已知的信息要求用户重复填写、重复选择或重复确认，且没有安全、隐私或业务必要性
- User action: 复用已有数据、自动填充、记住选择，或解释为什么必须重复输入
- Developer notes: 判断应基于 flow state 和 schema；敏感信息确认可以作为例外

### `UX-5001` 非文本图形对比度不足

- Severity: `warning`
- Stage: `visual`
- Retryable: false
- Trigger: 图标、边框、焦点轮廓、图表元素或控件状态与相邻颜色对比不足，导致状态难以辨认
- User action: 调整颜色、粗细、背景或状态形状
- Developer notes: `meta.standardRef` 应记录 WCAG non-text contrast criterion；纯装饰元素可豁免

### `UX-5002` 视觉层级无法支撑主要任务

- Severity: `info`
- Stage: `visual`
- Retryable: false
- Trigger: 页面主要操作、当前状态或关键内容与次要元素层级过近，导致扫描困难
- User action: 调整尺寸、权重、间距、位置或色彩强调
- Developer notes: 必须基于 design intent metadata、组件角色或任务优先级判断，避免把主观偏好编码成错误

### `UX-5003` 主题变量组合导致状态不可读

- Severity: `warning`
- Stage: `visual`
- Retryable: false
- Trigger: 某主题下文本、边框、图标、背景、selection 或 disabled 状态不可读
- User action: 调整主题 token、组件 token 或状态 token 映射
- Developer notes: 应记录 theme id、token path 和实际计算色值；不要只报告最终 hex

### `UX-5004` 动效缺少 reduced motion 降级

- Severity: `warning`
- Stage: `visual`
- Retryable: false
- Trigger: 自动播放、循环、视差、缩放、闪烁或大幅位移动效没有 `prefers-reduced-motion` 降级
- User action: 提供 reduced motion 样式、关闭入口或静态替代
- Developer notes: 只对可能影响舒适性的动效触发；微小 transition 可不触发

### `UX-5005` 闪烁或频闪风险

- Severity: `error`
- Stage: `visual`
- Retryable: false
- Trigger: 页面或动画存在高频闪烁、强对比闪烁或大面积频闪风险
- User action: 降低闪烁频率、对比度或面积，或移除该动效
- Developer notes: 检测器必须保存采样窗口和阈值；不确定时降级为风险提示

### `UX-5006` Disabled、selected 或 active 状态区分不足

- Severity: `warning`
- Stage: `visual`
- Retryable: false
- Trigger: 控件状态之间只存在极弱视觉差异，用户难以判断当前状态
- User action: 增强状态颜色、边框、图标、文本或形状差异
- Developer notes: 应同时考虑颜色和非颜色通道；与 `UX-1010` 可聚合但语义不同

### `UX-5007` 可读字号或行高低于目标策略

- Severity: `info`
- Stage: `visual`
- Retryable: false
- Trigger: 正文、标签、表格、按钮或说明文字低于项目可读性策略设定的字号或行高
- User action: 调整 typography token、组件密度或断点样式
- Developer notes: 工具栏、代码编辑器、数据密集表格可有单独策略；不要使用全局单阈值

### `UX-5008` 高密度界面缺少分组或分隔

- Severity: `info`
- Stage: `visual`
- Retryable: false
- Trigger: 大量字段、操作或数据在同一区域内缺少分组、分隔、标题或空间节奏
- User action: 使用 panel、group、divider、heading、tabs 或 progressive disclosure 组织内容
- Developer notes: Prodivix 的 Inspector 和工作台允许高密度，但仍需要稳定扫描结构

### `UX-5009` Skeleton 或占位内容与最终布局差异过大

- Severity: `info`
- Stage: `visual`
- Retryable: true
- Trigger: loading skeleton、placeholder 或 optimistic UI 与最终内容尺寸差异过大，导致布局跳动
- User action: 让占位结构接近最终布局，并为动态区域设置稳定尺寸
- Developer notes: 可与 CLS 或 layout shift 采样联动

### `UX-5010` 图表或数据可视化缺少可读编码

- Severity: `warning`
- Stage: `visual`
- Retryable: false
- Trigger: 图表只靠颜色、无图例、坐标轴缺失、单位缺失或数据点无法理解
- User action: 添加图例、标签、单位、表格替代或交互说明
- Developer notes: 可与 `UX-1010`、`UX-4009` 聚合；本码位关注可视化整体可读性

### `UX-5011` 图片文字缺少可访问替代

- Severity: `warning`
- Stage: `visual`
- Retryable: false
- Trigger: 关键信息以图片文字、截图文字或不可选择文本形式出现，且没有等价文本或真实文本替代
- User action: 使用真实文本，或提供等价说明、caption、alt text 或数据表
- Developer notes: Logo、品牌字标和必要截图可豁免，但截图中的操作说明应有文本替代

### `UX-5012` 主题切换时出现短暂不可读闪烁

- Severity: `info`
- Stage: `visual`
- Retryable: true
- Trigger: 深浅色主题、品牌主题或高对比主题切换时，文本、图标或背景短暂处于不可读组合
- User action: 优化主题变量加载顺序、过渡策略和初始主题同步
- Developer notes: 应记录 theme pair、duration 和 token path；可与 `UX-5003` 聚合

### `UX-9001` UX 检查器未知异常

- Severity: `error`
- Stage: `checker`
- Retryable: true
- Trigger: UX checker 执行中出现未分类异常，无法完成扫描
- User action: 重试扫描；若复现，携带错误码、目标页面和检查配置上报
- Developer notes: 新增稳定复现场景后应分配更具体的 `UX-90xx` 码位

### `UX-9002` UX 规则配置非法

- Severity: `error`
- Stage: `checker`
- Retryable: false
- Trigger: 项目配置的目标 WCAG 等级、断点、主题、规则集或豁免项格式非法
- User action: 修正 UX 检查配置后重新扫描
- Developer notes: 配置 schema 校验应返回具体 path；不要把规则配置错误报告成页面 UX 问题

### `UX-9003` UX 检测结果已过期

- Severity: `info`
- Stage: `checker`
- Retryable: true
- Trigger: PIR、主题、viewport、资源或运行时状态已变化，现有 UX 诊断不再对应当前预览
- User action: 重新运行 UX 检查
- Developer notes: 应记录 source revision、theme revision、viewport 和 generatedAt

### `UX-9004` UX 检查器证据不足

- Severity: `info`
- Stage: `checker`
- Retryable: true
- Trigger: 检查器缺少 DOM snapshot、computed style、theme token、viewport、资源尺寸或交互状态，无法可靠判断规则
- User action: 打开可预览页面、补齐资源或切换到支持的检查模式后重试
- Developer notes: 与 `UX-1015` 不同，本码位表示检查器整体证据不足，而不是单个 WCAG 等级无法判断

### `UX-9005` UX 规则被显式豁免

- Severity: `info`
- Stage: `checker`
- Retryable: false
- Trigger: 某个 UX 规则命中，但项目、页面、节点或组件配置了带原因和范围的显式豁免
- User action: 检查豁免原因是否仍然有效，到期后重新评估
- Developer notes: 豁免必须记录 owner、reason、scope 和 optional expiresAt；不能用豁免隐藏未知错误

### `UX-9006` UX 诊断需要人工复核

- Severity: `info`
- Stage: `checker`
- Retryable: false
- Trigger: 检查器发现高风险 UX 模式，但缺少足够上下文自动判定通过或失败，需要人工确认
- User action: 查看证据、确认设计意图，并选择修复、豁免或标记为已复核
- Developer notes: 用于自动规则边界之外的风险提示；不能替代明确的 fail 诊断

## 5. 预留码位

1. `UX-1025`：第三方嵌入内容缺少可访问替代或 fallback。
2. `UX-2017`：拖拽排序缺少批量移动或精确定位替代。
3. `UX-3015`：复杂表格在小屏下缺少替代表达。
4. `UX-4015`：AI 生成内容缺少来源、置信度或人工确认标记。
5. `UX-5013`：品牌图片、背景视频或装饰层干扰正文可读性。
6. `UX-9010`：第三方规则引擎返回了无法映射的诊断。
