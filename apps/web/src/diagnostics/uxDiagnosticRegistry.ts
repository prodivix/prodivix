import {
  copyReportAction,
  createDefinition,
  createExemptionAction,
  openDocsAction,
  openSourceAction,
  openTargetAction,
  retryAction,
  type DiagnosticDefinition,
  type DiagnosticPlacement,
  type ProdivixDiagnosticSeverity,
  uxEvidence,
  uxStandardEvidence,
} from './diagnosticShared';

const uxPlacementForStage = (
  stage:
    | 'accessibility'
    | 'interaction'
    | 'layout'
    | 'content'
    | 'visual'
    | 'checker'
): DiagnosticPlacement[] => {
  if (stage === 'checker') return ['operation-status', 'issues-panel'];
  if (stage === 'content') return ['inspector', 'issues-panel'];
  return ['inspector', 'blueprint-canvas', 'issues-panel'];
};

const uxDefinition = (
  code: `UX-${number}`,
  title: string,
  severity: ProdivixDiagnosticSeverity,
  stage:
    | 'accessibility'
    | 'interaction'
    | 'layout'
    | 'content'
    | 'visual'
    | 'checker',
  retryable: boolean
): DiagnosticDefinition =>
  createDefinition({
    code,
    title,
    domain: 'ux',
    severity,
    stage,
    retryable,
    defaultPlacement: uxPlacementForStage(stage),
    primaryLocation: 'target-then-source',
    evidence: [uxStandardEvidence, uxEvidence],
    actions: [
      openTargetAction,
      openSourceAction,
      createExemptionAction,
      retryAction,
      openDocsAction,
      copyReportAction,
    ],
  });

export const UX_DIAGNOSTIC_DEFINITIONS = {
  UX_1001: uxDefinition(
    'UX-1001',
    '文本对比度不满足 WCAG',
    'warning',
    'accessibility',
    false
  ),
  UX_1002: uxDefinition(
    'UX-1002',
    '非文本内容缺少可访问替代',
    'warning',
    'accessibility',
    false
  ),
  UX_1003: uxDefinition(
    'UX-1003',
    '表单控件缺少可关联标签',
    'warning',
    'accessibility',
    false
  ),
  UX_1004: uxDefinition(
    'UX-1004',
    '交互控件缺少可访问名称',
    'warning',
    'accessibility',
    false
  ),
  UX_1005: uxDefinition(
    'UX-1005',
    '标题层级跳跃或页面缺少结构标题',
    'info',
    'accessibility',
    false
  ),
  UX_1006: uxDefinition(
    'UX-1006',
    'Landmark 或区域语义缺失',
    'info',
    'accessibility',
    false
  ),
  UX_1007: uxDefinition(
    'UX-1007',
    'ARIA 引用目标不存在',
    'warning',
    'accessibility',
    false
  ),
  UX_1008: uxDefinition(
    'UX-1008',
    'ARIA role 与元素语义冲突',
    'warning',
    'accessibility',
    false
  ),
  UX_1009: uxDefinition(
    'UX-1009',
    '状态变化未向辅助技术公告',
    'warning',
    'accessibility',
    false
  ),
  UX_1010: uxDefinition(
    'UX-1010',
    '颜色是唯一的信息表达',
    'warning',
    'accessibility',
    false
  ),
  UX_1011: uxDefinition(
    'UX-1011',
    '焦点指示器不可见或对比不足',
    'warning',
    'accessibility',
    false
  ),
  UX_1012: uxDefinition(
    'UX-1012',
    '媒体缺少字幕、说明或控制',
    'warning',
    'accessibility',
    false
  ),
  UX_1013: uxDefinition(
    'UX-1013',
    '语言或文本方向声明缺失',
    'info',
    'accessibility',
    false
  ),
  UX_1014: uxDefinition(
    'UX-1014',
    '键盘陷阱风险',
    'error',
    'accessibility',
    false
  ),
  UX_1015: uxDefinition(
    'UX-1015',
    '目标 WCAG 等级无法验证',
    'info',
    'accessibility',
    true
  ),
  UX_1016: uxDefinition(
    'UX-1016',
    '页面标题缺失或不明确',
    'warning',
    'accessibility',
    false
  ),
  UX_1017: uxDefinition(
    'UX-1017',
    '缺少跳过重复内容的路径',
    'warning',
    'accessibility',
    false
  ),
  UX_1018: uxDefinition(
    'UX-1018',
    '内容在缩放或重排后不可用',
    'warning',
    'accessibility',
    false
  ),
  UX_1019: uxDefinition(
    'UX-1019',
    '文本间距调整后内容不可读',
    'warning',
    'accessibility',
    false
  ),
  UX_1020: uxDefinition(
    'UX-1020',
    '输入目的或自动完成语义缺失',
    'info',
    'accessibility',
    false
  ),
  UX_1021: uxDefinition(
    'UX-1021',
    '自定义控件缺少 name、role 或 value',
    'warning',
    'accessibility',
    false
  ),
  UX_1022: uxDefinition(
    'UX-1022',
    '认证流程依赖认知测试且缺少替代',
    'warning',
    'accessibility',
    false
  ),
  UX_1023: uxDefinition(
    'UX-1023',
    '焦点被固定层遮挡',
    'warning',
    'accessibility',
    false
  ),
  UX_1024: uxDefinition(
    'UX-1024',
    '页面方向被锁定且无必要理由',
    'info',
    'accessibility',
    false
  ),
  UX_2001: uxDefinition(
    'UX-2001',
    '关键交互无法通过键盘完成',
    'error',
    'interaction',
    false
  ),
  UX_2002: uxDefinition(
    'UX-2002',
    'Tab 顺序与视觉或任务顺序不一致',
    'warning',
    'interaction',
    false
  ),
  UX_2003: uxDefinition(
    'UX-2003',
    '指针或触摸目标尺寸过小',
    'warning',
    'interaction',
    false
  ),
  UX_2004: uxDefinition(
    'UX-2004',
    '交互状态缺失',
    'warning',
    'interaction',
    false
  ),
  UX_2005: uxDefinition(
    'UX-2005',
    '禁用控件缺少原因或替代路径',
    'info',
    'interaction',
    false
  ),
  UX_2006: uxDefinition(
    'UX-2006',
    '输入错误反馈不及时或不可定位',
    'warning',
    'interaction',
    false
  ),
  UX_2007: uxDefinition(
    'UX-2007',
    'Loading 或异步状态不可感知',
    'warning',
    'interaction',
    true
  ),
  UX_2008: uxDefinition(
    'UX-2008',
    'destructive action 缺少确认或撤销路径',
    'warning',
    'interaction',
    false
  ),
  UX_2009: uxDefinition(
    'UX-2009',
    '手势交互缺少等价控件',
    'warning',
    'interaction',
    false
  ),
  UX_2010: uxDefinition(
    'UX-2010',
    '弹层焦点管理不完整',
    'warning',
    'interaction',
    false
  ),
  UX_2011: uxDefinition(
    'UX-2011',
    '交互反馈只依赖 hover',
    'warning',
    'interaction',
    false
  ),
  UX_2012: uxDefinition(
    'UX-2012',
    '操作结果缺少就地反馈',
    'info',
    'interaction',
    true
  ),
  UX_2013: uxDefinition(
    'UX-2013',
    '快捷键与保留快捷键冲突',
    'warning',
    'interaction',
    false
  ),
  UX_2014: uxDefinition(
    'UX-2014',
    '定时消失内容缺少暂停或延长路径',
    'warning',
    'interaction',
    false
  ),
  UX_2015: uxDefinition(
    'UX-2015',
    '取消、撤销或退出路径缺失',
    'warning',
    'interaction',
    false
  ),
  UX_2016: uxDefinition(
    'UX-2016',
    '指针取消行为不安全',
    'warning',
    'interaction',
    false
  ),
  UX_3001: uxDefinition(
    'UX-3001',
    '小屏视口出现不可访问横向溢出',
    'warning',
    'layout',
    false
  ),
  UX_3002: uxDefinition(
    'UX-3002',
    '内容被固定层或弹层遮挡',
    'warning',
    'layout',
    false
  ),
  UX_3003: uxDefinition(
    'UX-3003',
    '文本在容器内截断且无恢复路径',
    'warning',
    'layout',
    false
  ),
  UX_3004: uxDefinition(
    'UX-3004',
    '关键操作在目标断点不可见',
    'error',
    'layout',
    false
  ),
  UX_3005: uxDefinition(
    'UX-3005',
    '阅读行宽或文本密度超出可读范围',
    'info',
    'layout',
    false
  ),
  UX_3006: uxDefinition(
    'UX-3006',
    '滚动容器嵌套导致操作困难',
    'warning',
    'layout',
    false
  ),
  UX_3007: uxDefinition(
    'UX-3007',
    'Safe area 或视口单位处理不完整',
    'warning',
    'layout',
    false
  ),
  UX_3008: uxDefinition(
    'UX-3008',
    '空状态或错误状态破坏布局',
    'warning',
    'layout',
    false
  ),
  UX_3009: uxDefinition(
    'UX-3009',
    '组件响应式约束缺失',
    'warning',
    'layout',
    false
  ),
  UX_3010: uxDefinition(
    'UX-3010',
    '弹层位置在视口边缘不可达',
    'warning',
    'layout',
    false
  ),
  UX_3011: uxDefinition(
    'UX-3011',
    '320px 宽度下内容不可重排',
    'warning',
    'layout',
    false
  ),
  UX_3012: uxDefinition(
    'UX-3012',
    '屏幕方向切换后布局或状态丢失',
    'warning',
    'layout',
    false
  ),
  UX_3013: uxDefinition(
    'UX-3013',
    '软键盘遮挡输入或主要操作',
    'warning',
    'layout',
    false
  ),
  UX_3014: uxDefinition(
    'UX-3014',
    '打印或导出视图布局不可读',
    'info',
    'layout',
    false
  ),
  UX_4001: uxDefinition(
    'UX-4001',
    '可见控件文案不明确',
    'info',
    'content',
    false
  ),
  UX_4002: uxDefinition(
    'UX-4002',
    '链接文本无法说明目标',
    'info',
    'content',
    false
  ),
  UX_4003: uxDefinition(
    'UX-4003',
    '错误消息缺少修复建议',
    'warning',
    'content',
    false
  ),
  UX_4004: uxDefinition(
    'UX-4004',
    '空状态缺少下一步行动',
    'info',
    'content',
    false
  ),
  UX_4005: uxDefinition(
    'UX-4005',
    '必填、格式或约束说明缺失',
    'warning',
    'content',
    false
  ),
  UX_4006: uxDefinition(
    'UX-4006',
    '状态标签缺少可理解含义',
    'info',
    'content',
    false
  ),
  UX_4007: uxDefinition(
    'UX-4007',
    '破坏性操作文案未说明影响范围',
    'warning',
    'content',
    false
  ),
  UX_4008: uxDefinition(
    'UX-4008',
    '本地化文本缺失或混用异常',
    'info',
    'content',
    false
  ),
  UX_4009: uxDefinition(
    'UX-4009',
    '数字、日期或单位缺少上下文',
    'info',
    'content',
    false
  ),
  UX_4010: uxDefinition(
    'UX-4010',
    '状态反馈与实际结果不一致',
    'warning',
    'content',
    true
  ),
  UX_4011: uxDefinition(
    'UX-4011',
    '术语或行话缺少解释',
    'info',
    'content',
    false
  ),
  UX_4012: uxDefinition(
    'UX-4012',
    '帮助入口不一致或缺失',
    'info',
    'content',
    false
  ),
  UX_4013: uxDefinition(
    'UX-4013',
    '多步骤流程缺少进度和当前位置',
    'warning',
    'content',
    false
  ),
  UX_4014: uxDefinition(
    'UX-4014',
    '重复输入或重复确认要求过多',
    'info',
    'content',
    false
  ),
  UX_5001: uxDefinition(
    'UX-5001',
    '非文本图形对比度不足',
    'warning',
    'visual',
    false
  ),
  UX_5002: uxDefinition(
    'UX-5002',
    '视觉层级无法支撑主要任务',
    'info',
    'visual',
    false
  ),
  UX_5003: uxDefinition(
    'UX-5003',
    '主题变量组合导致状态不可读',
    'warning',
    'visual',
    false
  ),
  UX_5004: uxDefinition(
    'UX-5004',
    '动效缺少 reduced motion 降级',
    'warning',
    'visual',
    false
  ),
  UX_5005: uxDefinition('UX-5005', '闪烁或频闪风险', 'error', 'visual', false),
  UX_5006: uxDefinition(
    'UX-5006',
    'Disabled、selected 或 active 状态区分不足',
    'warning',
    'visual',
    false
  ),
  UX_5007: uxDefinition(
    'UX-5007',
    '可读字号或行高低于目标策略',
    'info',
    'visual',
    false
  ),
  UX_5008: uxDefinition(
    'UX-5008',
    '高密度界面缺少分组或分隔',
    'info',
    'visual',
    false
  ),
  UX_5009: uxDefinition(
    'UX-5009',
    'Skeleton 或占位内容与最终布局差异过大',
    'info',
    'visual',
    true
  ),
  UX_5010: uxDefinition(
    'UX-5010',
    '图表或数据可视化缺少可读编码',
    'warning',
    'visual',
    false
  ),
  UX_5011: uxDefinition(
    'UX-5011',
    '图片文字缺少可访问替代',
    'warning',
    'visual',
    false
  ),
  UX_5012: uxDefinition(
    'UX-5012',
    '主题切换时出现短暂不可读闪烁',
    'warning',
    'visual',
    true
  ),
  UX_9001: uxDefinition(
    'UX-9001',
    'UX 检查器未知异常',
    'error',
    'checker',
    true
  ),
  UX_9002: uxDefinition(
    'UX-9002',
    'UX 规则配置非法',
    'error',
    'checker',
    false
  ),
  UX_9003: uxDefinition(
    'UX-9003',
    'UX 检测结果已过期',
    'info',
    'checker',
    true
  ),
  UX_9004: uxDefinition(
    'UX-9004',
    'UX 检查器证据不足',
    'info',
    'checker',
    true
  ),
  UX_9005: uxDefinition(
    'UX-9005',
    'UX 规则被显式豁免',
    'info',
    'checker',
    false
  ),
  UX_9006: uxDefinition(
    'UX-9006',
    'UX 诊断需要人工复核',
    'info',
    'checker',
    false
  ),
} as const satisfies Record<string, DiagnosticDefinition>;
