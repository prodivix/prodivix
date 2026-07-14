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

export const PRODIVIX_DIAGNOSTIC_DOMAINS = [
  'pir',
  'workspace',
  'plugin',
  'route',
  'editor',
  'ux',
  'code',
  'nodegraph',
  'animation',
  'codegen',
  'backend',
  'semantic',
  'ai',
] as const satisfies readonly ProdivixDiagnosticDomain[];

const DIAGNOSTIC_DOMAINS: ReadonlySet<ProdivixDiagnosticDomain> = new Set(
  PRODIVIX_DIAGNOSTIC_DOMAINS
);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const isDiagnosticDomain = (
  value: unknown
): value is ProdivixDiagnosticDomain =>
  typeof value === 'string' &&
  DIAGNOSTIC_DOMAINS.has(value as ProdivixDiagnosticDomain);

export const isDiagnostic = (value: unknown): value is ProdivixDiagnostic => {
  if (!isRecord(value)) return false;
  return (
    typeof value.code === 'string' &&
    DIAGNOSTIC_SEVERITIES.has(value.severity as ProdivixDiagnosticSeverity) &&
    isDiagnosticDomain(value.domain) &&
    typeof value.message === 'string'
  );
};
