import { describe, expect, it } from 'vitest';
import {
  createDefinition,
  createDiagnostic,
  isDiagnostic,
  isDiagnosticDomain,
  openDocsAction,
} from '..';

const codeParseDefinition = createDefinition({
  code: 'COD-1001',
  title: 'Code parse failed',
  domain: 'code',
  severity: 'error',
  stage: 'parse',
  retryable: false,
  defaultPlacement: ['code-editor', 'issues-panel'],
  primaryLocation: 'source-then-target',
  actions: [openDocsAction],
});

describe('diagnostics contract', () => {
  it('creates machine-readable diagnostic definitions', () => {
    expect(codeParseDefinition).toMatchObject({
      code: 'COD-1001',
      domain: 'code',
      severity: 'error',
      stage: 'parse',
      retryable: false,
      docsPath: '/reference/diagnostics/cod-1001',
    });
    expect(codeParseDefinition).not.toHaveProperty('message');
    expect(codeParseDefinition.defaultPlacement).toContain('code-editor');
  });

  it('supports stable product and source locations on diagnostics', () => {
    const diagnostic = createDiagnostic({
      ...codeParseDefinition,
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
    expect(isDiagnosticDomain('semantic')).toBe(true);
    expect(isDiagnosticDomain('elib')).toBe(false);
    expect(isDiagnosticDomain('unknown')).toBe(false);
  });
});
