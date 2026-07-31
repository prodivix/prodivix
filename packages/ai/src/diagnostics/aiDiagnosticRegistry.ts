import {
  copyReportAction,
  createDefinition,
  openDocsAction,
  openTargetAction,
  retryAction,
  type DiagnosticDefinition,
  type ProdivixDiagnosticSeverity,
} from '@prodivix/diagnostics';

export type AiDiagnosticStage =
  | 'provider'
  | 'models'
  | 'prompt'
  | 'response'
  | 'command'
  | 'task'
  | 'tool'
  | 'approval'
  | 'verification'
  | 'audit';

const entries = [
  [
    'AI-1001',
    'AI provider configuration is missing',
    'provider',
    'warning',
    false,
  ],
  ['AI-1002', 'AI provider request failed', 'provider', 'error', true],
  [
    'AI-1010',
    'AI provider base URL is unsafe or invalid',
    'provider',
    'error',
    false,
  ],
  ['AI-2001', 'AI model discovery failed', 'models', 'warning', true],
  [
    'AI-2002',
    'AI model capability is insufficient',
    'models',
    'warning',
    false,
  ],
  ['AI-3001', 'AI prompt context is empty', 'prompt', 'warning', false],
  ['AI-4001', 'AI response is empty', 'response', 'error', true],
  ['AI-4002', 'AI response cannot be decoded', 'response', 'error', true],
  ['AI-4010', 'AI response stream was interrupted', 'response', 'error', true],
  [
    'AI-4011',
    'AI streamed response cannot be decoded',
    'response',
    'error',
    true,
  ],
  ['AI-4012', 'AI response stream is unreadable', 'response', 'warning', true],
  ['AI-5001', 'Agent action dry-run failed', 'command', 'error', false],
  ['AI-5002', 'Agent action target is out of scope', 'command', 'error', false],
  ['AI-5003', 'Agent action field is unauthorized', 'command', 'error', false],
  [
    'AI-5004',
    'Code-owned output is not a CodeArtifact',
    'command',
    'error',
    false,
  ],
  [
    'AI-5005',
    'Agent action domain validator is missing',
    'command',
    'error',
    false,
  ],
  [
    'AI-5006',
    'Agent approval decision is missing or expired',
    'command',
    'error',
    true,
  ],
  ['AI-6001', 'AgentTask base revision is stale', 'task', 'error', false],
  ['AI-6002', 'Agent budget is exhausted', 'task', 'error', false],
  ['AI-6003', 'AgentRun callback lost authority', 'task', 'warning', false],
  ['AI-6004', 'AgentRun cannot recover safely', 'task', 'error', true],
  [
    'AI-6010',
    'Provider capability qualification is missing or expired',
    'task',
    'error',
    true,
  ],
  [
    'AI-6011',
    'Provider state or effective context is unverifiable',
    'task',
    'error',
    false,
  ],
  [
    'AI-6012',
    'Provider background callback is invalid',
    'task',
    'warning',
    false,
  ],
  ['AI-6013', 'Provider usage requires reconciliation', 'task', 'error', true],
  ['AI-7001', 'Agent capability was denied', 'tool', 'error', false],
  [
    'AI-7002',
    'Untrusted instruction or prompt injection detected',
    'tool',
    'error',
    false,
  ],
  ['AI-7003', 'Agent Secret use was denied', 'tool', 'error', false],
  ['AI-7004', 'Agent network request was denied', 'tool', 'error', false],
  [
    'AI-7005',
    'Agent self-approval or escalation was denied',
    'approval',
    'error',
    false,
  ],
  [
    'AI-7006',
    'Agent approval identity is incompatible',
    'approval',
    'error',
    false,
  ],
  [
    'AI-7010',
    'Multimodal context or transformation was denied',
    'tool',
    'error',
    false,
  ],
  [
    'AI-7011',
    'Generated artifact candidate failed the adoption boundary',
    'tool',
    'error',
    false,
  ],
  [
    'AI-7012',
    'Hosted tool or dynamic capability is unauthorized',
    'tool',
    'error',
    false,
  ],
  ['AI-7013', 'Retrieval source or index is unusable', 'tool', 'error', true],
  [
    'AI-7014',
    'MCP, computer use, or managed agent was denied',
    'tool',
    'error',
    false,
  ],
  [
    'AI-7015',
    'Parallel or nested tool results cannot be joined safely',
    'tool',
    'error',
    true,
  ],
  [
    'AI-8001',
    'Agent Verification Closure is unsatisfied',
    'verification',
    'error',
    false,
  ],
  [
    'AI-8002',
    'Agent repair limit is exhausted',
    'verification',
    'error',
    false,
  ],
  ['AI-8003', 'Agent audit chain is incomplete', 'audit', 'error', false],
  ['AI-8004', 'Agent rollback was blocked', 'verification', 'error', false],
  [
    'AI-8005',
    'Agent model evaluation evidence is incomplete or expired',
    'verification',
    'error',
    true,
  ],
  [
    'AI-8010',
    'Agent model evaluation statistical floor is unmet',
    'verification',
    'error',
    true,
  ],
  [
    'AI-8011',
    'Agent holdout, grader, or human-review evidence is invalid',
    'verification',
    'error',
    false,
  ],
  ['AI-9001', 'Unclassified AI failure', 'command', 'error', true],
] as const satisfies readonly (readonly [
  `AI-${number}`,
  string,
  AiDiagnosticStage,
  ProdivixDiagnosticSeverity,
  boolean,
])[];

export type AiDiagnosticCode = (typeof entries)[number][0];

export const AI_DIAGNOSTIC_CODES = Object.freeze(entries.map(([code]) => code));

export const AI_DIAGNOSTIC_REGISTRY = Object.freeze(
  Object.fromEntries(
    entries.map(([code, title, stage, severity, retryable]) => [
      code,
      createDefinition({
        code,
        title,
        domain: 'ai',
        severity,
        stage,
        retryable,
        defaultPlacement: ['issues-panel', 'operation-status'],
        primaryLocation: 'target-then-source',
        actions: [
          openTargetAction,
          ...(retryable ? [retryAction] : []),
          openDocsAction,
          copyReportAction,
        ],
      }),
    ])
  )
) as Readonly<Record<AiDiagnosticCode, DiagnosticDefinition>>;
