import { describe, expect, it } from 'vitest';
import {
  COD_DIAGNOSTIC_DEFINITIONS,
  createDiagnostic,
  isDiagnostic,
  isDiagnosticDomain,
} from '@/diagnostics';

describe('diagnostics contract', () => {
  it('registers COD definitions as machine-readable metadata', () => {
    expect(COD_DIAGNOSTIC_DEFINITIONS.COD_2001).toMatchObject({
      code: 'COD-2001',
      domain: 'code',
      severity: 'warning',
      stage: 'symbol',
      retryable: true,
      docsPath: '/reference/diagnostics/cod-2001',
    });
    expect(COD_DIAGNOSTIC_DEFINITIONS.COD_2001).not.toHaveProperty('message');
    expect(COD_DIAGNOSTIC_DEFINITIONS.COD_2001.defaultPlacement).toContain(
      'code-editor'
    );
  });

  it('supports stable product and source locations on diagnostics', () => {
    const diagnostic = createDiagnostic({
      ...COD_DIAGNOSTIC_DEFINITIONS.COD_1001,
      message: 'Code parse failed.',
      targetRef: {
        kind: 'inspector-field',
        documentId: 'doc-1',
        nodeId: 'node-1',
        fieldPath: 'events.onClick',
      },
      sourceSpan: {
        artifactId: 'artifact-1',
        startLine: 1,
        startColumn: 2,
        endLine: 1,
        endColumn: 8,
      },
    });

    expect(isDiagnostic(diagnostic)).toBe(true);
    expect(diagnostic).toMatchObject({
      code: 'COD-1001',
      domain: 'code',
      targetRef: {
        kind: 'inspector-field',
        fieldPath: 'events.onClick',
      },
      sourceSpan: {
        artifactId: 'artifact-1',
        startLine: 1,
      },
    });
  });

  it('accepts plugin contract diagnostics in the shared domain guard', () => {
    const diagnostic = createDiagnostic({
      code: 'PLG-1001',
      domain: 'plugin',
      severity: 'error',
      message: 'Plugin Manifest is not strict JSON.',
    });

    expect(isDiagnostic(diagnostic)).toBe(true);
    expect(isDiagnosticDomain('plugin')).toBe(true);
    expect(isDiagnosticDomain('elib')).toBe(false);
    expect(isDiagnosticDomain('unknown')).toBe(false);
  });
});
