import {
  createDefinition,
  openSourceAction,
  openTargetAction,
  type DiagnosticDefinition,
} from '@prodivix/diagnostics';

const semanticDefinition = (
  code: `SEM-${number}`,
  title: string
): DiagnosticDefinition =>
  createDefinition({
    code,
    title,
    domain: 'semantic',
    severity: 'warning',
    stage: 'resolution',
    retryable: false,
    defaultPlacement: [
      'code-editor',
      'inspector',
      'blueprint-canvas',
      'nodegraph',
      'animation-timeline',
      'issues-panel',
    ],
    primaryLocation: 'source-then-target',
    actions: [openSourceAction, openTargetAction],
  });

export const SEM_DIAGNOSTIC_DEFINITIONS = {
  SEM_2001: semanticDefinition('SEM-2001', '语义引用目标不存在'),
  SEM_2002: semanticDefinition('SEM-2002', '语义引用目标在当前作用域不可见'),
  SEM_2003: semanticDefinition('SEM-2003', '语义引用解析结果不唯一'),
  SEM_2004: semanticDefinition('SEM-2004', '语义引用目标类型或能力不兼容'),
  SEM_2005: semanticDefinition('SEM-2005', '语义索引快照已过期'),
} as const satisfies Record<string, DiagnosticDefinition>;
