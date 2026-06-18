import {
  createDefinition,
  openDocsAction,
  openSourceAction,
  openTargetAction,
  retryAction,
  upstreamEvidence,
  type DiagnosticDefinition,
  type DiagnosticPlacement,
  type ProdivixDiagnosticSeverity,
} from './diagnosticShared';

const codePlacementForStage = (stage: string): DiagnosticPlacement[] => {
  if (stage === 'binding') {
    return ['code-editor', 'inspector', 'blueprint-canvas', 'issues-panel'];
  }
  if (stage === 'runtime' || stage === 'environment') {
    return ['code-editor', 'operation-status', 'issues-panel'];
  }
  return ['code-editor', 'issues-panel'];
};

const codeDefinition = (
  code: `COD-${number}`,
  title: string,
  severity: ProdivixDiagnosticSeverity,
  stage: 'parse' | 'symbol' | 'binding' | 'runtime' | 'compile' | 'environment',
  retryable: boolean,
  defaultPlacement: DiagnosticPlacement[] = codePlacementForStage(stage)
): DiagnosticDefinition =>
  createDefinition({
    code,
    title,
    domain: 'code',
    severity,
    stage,
    retryable,
    defaultPlacement,
    primaryLocation: 'source-then-target',
    evidence: [upstreamEvidence],
    actions: [openSourceAction, openTargetAction, retryAction, openDocsAction],
  });

export const COD_DIAGNOSTIC_DEFINITIONS = {
  COD_1001: codeDefinition('COD-1001', '代码解析失败', 'error', 'parse', false),
  COD_1002: codeDefinition(
    'COD-1002',
    '不支持的语言模式',
    'error',
    'parse',
    false
  ),
  COD_1003: codeDefinition(
    'COD-1003',
    '代码片段为空或形状非法',
    'warning',
    'parse',
    false
  ),
  COD_1004: codeDefinition(
    'COD-1004',
    '表达式片段不是单一表达式',
    'error',
    'parse',
    false
  ),
  COD_1005: codeDefinition(
    'COD-1005',
    '代码片段包含当前模式禁止的顶层语句',
    'error',
    'parse',
    false
  ),
  COD_1006: codeDefinition(
    'COD-1006',
    '源码编码或文本范围非法',
    'error',
    'parse',
    false
  ),
  COD_2001: codeDefinition(
    'COD-2001',
    '符号无法解析',
    'warning',
    'symbol',
    true
  ),
  COD_2002: codeDefinition(
    'COD-2002',
    'import 无法解析',
    'error',
    'symbol',
    true
  ),
  COD_2003: codeDefinition(
    'COD-2003',
    '类型不兼容',
    'warning',
    'symbol',
    false
  ),
  COD_2004: codeDefinition(
    'COD-2004',
    '共享符号环境过期',
    'warning',
    'symbol',
    true,
    ['operation-status', 'issues-panel']
  ),
  COD_2010: codeDefinition(
    'COD-2010',
    '重命名符号存在冲突',
    'warning',
    'symbol',
    false
  ),
  COD_2011: codeDefinition(
    'COD-2011',
    '循环 import 或循环符号依赖',
    'error',
    'symbol',
    false
  ),
  COD_2012: codeDefinition(
    'COD-2012',
    '符号解析结果不唯一',
    'warning',
    'symbol',
    false
  ),
  COD_2013: codeDefinition(
    'COD-2013',
    '引用了当前作用域不可见的符号',
    'warning',
    'symbol',
    false
  ),
  COD_2014: codeDefinition(
    'COD-2014',
    '外部库导出类型缺失或不可用',
    'warning',
    'symbol',
    true
  ),
  COD_2015: codeDefinition(
    'COD-2015',
    '泛型或类型参数无法满足约束',
    'warning',
    'symbol',
    false
  ),
  COD_2016: codeDefinition(
    'COD-2016',
    '类型推断超过复杂度上限',
    'warning',
    'symbol',
    true
  ),
  COD_3001: codeDefinition(
    'COD-3001',
    '代码片段绑定目标不存在',
    'error',
    'binding',
    false
  ),
  COD_3002: codeDefinition(
    'COD-3002',
    '代码片段返回值不满足宿主契约',
    'error',
    'binding',
    false
  ),
  COD_3003: codeDefinition(
    'COD-3003',
    '代码访问了当前上下文不可用的能力',
    'warning',
    'binding',
    false
  ),
  COD_3010: codeDefinition(
    'COD-3010',
    '事件 handler 参数签名不匹配',
    'warning',
    'binding',
    false
  ),
  COD_3011: codeDefinition(
    'COD-3011',
    'Mounted CSS selector 超出节点作用域',
    'warning',
    'binding',
    false
  ),
  COD_3012: codeDefinition(
    'COD-3012',
    '代码片段 owner 类型不支持当前宿主',
    'error',
    'binding',
    false
  ),
  COD_3013: codeDefinition(
    'COD-3013',
    '生命周期 hook 与宿主阶段不匹配',
    'warning',
    'binding',
    false
  ),
  COD_3014: codeDefinition(
    'COD-3014',
    '异步返回值不被宿主接受',
    'warning',
    'binding',
    false
  ),
  COD_3015: codeDefinition(
    'COD-3015',
    '代码片段修改了只读上下文',
    'error',
    'binding',
    false
  ),
  COD_4001: codeDefinition(
    'COD-4001',
    '用户代码运行时抛错',
    'error',
    'runtime',
    true
  ),
  COD_4010: codeDefinition(
    'COD-4010',
    '用户代码执行超时',
    'error',
    'runtime',
    true
  ),
  COD_4011: codeDefinition(
    'COD-4011',
    'sandbox 权限拒绝',
    'error',
    'runtime',
    false
  ),
  COD_4012: codeDefinition(
    'COD-4012',
    '用户代码产生非确定性副作用',
    'warning',
    'runtime',
    false
  ),
  COD_4013: codeDefinition(
    'COD-4013',
    '用户代码递归或循环超过限制',
    'error',
    'runtime',
    false
  ),
  COD_4014: codeDefinition(
    'COD-4014',
    '用户代码返回不可序列化结果',
    'error',
    'runtime',
    false
  ),
  COD_5001: codeDefinition('COD-5001', '转译失败', 'error', 'compile', true),
  COD_5002: codeDefinition(
    'COD-5002',
    'Shader 编译失败',
    'error',
    'compile',
    false
  ),
  COD_5010: codeDefinition(
    'COD-5010',
    '语言服务 worker 初始化失败',
    'error',
    'compile',
    true
  ),
  COD_5011: codeDefinition(
    'COD-5011',
    'Source map 生成或映射失败',
    'warning',
    'compile',
    true
  ),
  COD_5012: codeDefinition(
    'COD-5012',
    'CSS/SCSS 预处理失败',
    'error',
    'compile',
    false
  ),
  COD_5013: codeDefinition(
    'COD-5013',
    '目标运行模式不支持当前语言特性',
    'warning',
    'compile',
    false
  ),
  COD_9001: codeDefinition(
    'COD-9001',
    '代码环境未知异常',
    'error',
    'environment',
    true
  ),
  COD_9002: codeDefinition(
    'COD-9002',
    '代码诊断证据不足',
    'warning',
    'environment',
    true
  ),
} as const satisfies Record<string, DiagnosticDefinition>;
