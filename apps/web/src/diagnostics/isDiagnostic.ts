import type {
  ProdivixDiagnostic,
  ProdivixDiagnosticDomain,
  ProdivixDiagnosticSeverity,
} from './diagnostic.types';

const DIAGNOSTIC_SEVERITIES: ReadonlySet<ProdivixDiagnosticSeverity> = new Set([
  'info',
  'warning',
  'error',
  'fatal',
]);

const DIAGNOSTIC_DOMAINS: ReadonlySet<ProdivixDiagnosticDomain> = new Set([
  'pir',
  'workspace',
  'route',
  'editor',
  'ux',
  'code',
  'nodegraph',
  'animation',
  'elib',
  'codegen',
  'backend',
  'ai',
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const isDiagnostic = (value: unknown): value is ProdivixDiagnostic => {
  if (!isRecord(value)) return false;
  return (
    typeof value.code === 'string' &&
    DIAGNOSTIC_SEVERITIES.has(value.severity as ProdivixDiagnosticSeverity) &&
    DIAGNOSTIC_DOMAINS.has(value.domain as ProdivixDiagnosticDomain) &&
    typeof value.message === 'string'
  );
};
