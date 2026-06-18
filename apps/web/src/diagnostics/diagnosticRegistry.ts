import type { DiagnosticRegistryEntry } from './diagnosticShared';

export {
  copyReportAction,
  createDefinition,
  createExemptionAction,
  openDocsAction,
  openSourceAction,
  openTargetAction,
  retryAction,
  type DiagnosticDefinition,
  type DiagnosticPlacement,
  type DiagnosticRegistryEntry,
  upstreamEvidence,
  uxEvidence,
  uxStandardEvidence,
} from './diagnosticShared';
export { COD_DIAGNOSTIC_DEFINITIONS } from './codeDiagnosticRegistry';
export { UX_DIAGNOSTIC_DEFINITIONS } from './uxDiagnosticRegistry';

export const PIR_DIAGNOSTIC_REGISTRY = {
  PIR_1001: {
    code: 'PIR-1001',
    domain: 'pir',
    severity: 'error',
    docsUrl: '/reference/diagnostic-codes#pir',
  },
  PIR_1002: {
    code: 'PIR-1002',
    domain: 'pir',
    severity: 'error',
    docsUrl: '/reference/diagnostic-codes#pir',
  },
  PIR_1003: {
    code: 'PIR-1003',
    domain: 'pir',
    severity: 'error',
    docsUrl: '/reference/diagnostic-codes#pir',
  },
  PIR_2001: {
    code: 'PIR-2001',
    domain: 'pir',
    severity: 'error',
    docsUrl: '/reference/diagnostic-codes#pir',
  },
  PIR_2002: {
    code: 'PIR-2002',
    domain: 'pir',
    severity: 'error',
    docsUrl: '/reference/diagnostic-codes#pir',
  },
  PIR_2003: {
    code: 'PIR-2003',
    domain: 'pir',
    severity: 'error',
    docsUrl: '/reference/diagnostic-codes#pir',
  },
  PIR_2004: {
    code: 'PIR-2004',
    domain: 'pir',
    severity: 'error',
    docsUrl: '/reference/diagnostic-codes#pir',
  },
  PIR_2005: {
    code: 'PIR-2005',
    domain: 'pir',
    severity: 'error',
    docsUrl: '/reference/diagnostic-codes#pir',
  },
  PIR_2006: {
    code: 'PIR-2006',
    domain: 'pir',
    severity: 'warning',
    docsUrl: '/reference/diagnostic-codes#pir',
  },
  PIR_2007: {
    code: 'PIR-2007',
    domain: 'pir',
    severity: 'error',
    docsUrl: '/reference/diagnostic-codes#pir',
  },
  PIR_3001: {
    code: 'PIR-3001',
    domain: 'pir',
    severity: 'warning',
    docsUrl: '/reference/diagnostic-codes#pir',
  },
  PIR_3002: {
    code: 'PIR-3002',
    domain: 'pir',
    severity: 'warning',
    docsUrl: '/reference/diagnostic-codes#pir',
  },
  PIR_3010: {
    code: 'PIR-3010',
    domain: 'pir',
    severity: 'warning',
    docsUrl: '/reference/diagnostic-codes#pir',
  },
  PIR_4001: {
    code: 'PIR-4001',
    domain: 'pir',
    severity: 'error',
    docsUrl: '/reference/diagnostic-codes#pir',
  },
  PIR_9001: {
    code: 'PIR-9001',
    domain: 'pir',
    severity: 'error',
    docsUrl: '/reference/diagnostic-codes#pir',
  },
} as const satisfies Record<string, DiagnosticRegistryEntry>;
