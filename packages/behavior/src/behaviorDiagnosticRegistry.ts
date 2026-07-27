import {
  copyReportAction,
  createDefinition,
  openDocsAction,
  openTargetAction,
  retryAction,
  type DiagnosticDefinition,
} from '@prodivix/diagnostics';

const entries = [
  ['BHV-1001', 'BehaviorScenario is invalid', 'validate', 'error', false],
  [
    'BHV-2001',
    'Behavior target cannot be resolved exactly',
    'resolve',
    'error',
    false,
  ],
  [
    'BHV-2002',
    'Action and target capability are incompatible',
    'resolve',
    'error',
    false,
  ],
  [
    'BHV-3001',
    'BehaviorScenarioProgram compilation failed',
    'compile',
    'error',
    false,
  ],
  [
    'BHV-3002',
    'Behavior program exceeds its budget',
    'compile',
    'error',
    false,
  ],
  ['BHV-4001', 'Behavior step failed', 'execute', 'error', false],
  ['BHV-4002', 'Behavior condition wait timed out', 'execute', 'error', false],
  ['BHV-4003', 'Deterministic replay diverged', 'replay', 'error', false],
  [
    'BHV-4004',
    'Behavior requested a forbidden capability',
    'execute',
    'fatal',
    false,
  ],
  [
    'BHV-4005',
    'Runtime controls were not fully applied',
    'execute',
    'error',
    false,
  ],
  [
    'BHV-4006',
    'Behavior runtime state cleanup failed',
    'execute',
    'fatal',
    true,
  ],
  [
    'BHV-5001',
    'Recorder draft cannot produce a semantic step',
    'record',
    'warning',
    false,
  ],
  ['BHV-5002', 'Recorder draft is stale', 'record', 'warning', false],
  [
    'BHV-9001',
    'Unclassified Behavior failure',
    'runtime-selected',
    'error',
    false,
  ],
] as const;

export type BehaviorDiagnosticCode = (typeof entries)[number][0];

export const BEHAVIOR_DIAGNOSTIC_CODES = Object.freeze(
  entries.map(([code]) => code)
);

export const BEHAVIOR_DIAGNOSTIC_REGISTRY = Object.freeze(
  Object.fromEntries(
    entries.map(([code, title, stage, severity, retryable]) => [
      code,
      createDefinition({
        code,
        title,
        domain: 'behavior',
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
) as Readonly<Record<BehaviorDiagnosticCode, DiagnosticDefinition>>;
