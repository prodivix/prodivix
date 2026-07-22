import { describe, expect, it, vi } from 'vitest';
import { buildDiagnosticPresentation } from './buildDiagnosticPresentation';

describe('buildDiagnosticPresentation', () => {
  it('passes resolved locations to custom evidence formatters', () => {
    const formatEvidence = vi.fn(() => []);
    const presentation = buildDiagnosticPresentation({
      diagnostic: {
        code: 'TEST-1001',
        severity: 'warning',
        domain: 'code',
        message: 'Test diagnostic',
        sourceSpan: {
          artifactId: 'artifact-1',
          startLine: 2,
          startColumn: 3,
          endLine: 2,
          endColumn: 8,
        },
      },
      template: {
        titleFallback: 'Test',
        summaryTemplate: { defaultText: 'Test diagnostic' },
      },
      resolver: { formatEvidence },
    });

    expect(formatEvidence).toHaveBeenCalledWith(
      expect.objectContaining({ locations: presentation.locations })
    );
  });

  it('formats location-backed evidence with the default formatter', () => {
    const presentation = buildDiagnosticPresentation({
      diagnostic: {
        code: 'TEST-1002',
        severity: 'warning',
        domain: 'workspace',
        message: 'Test diagnostic',
        targetRef: { kind: 'document', documentId: 'doc-1' },
      },
      template: {
        titleFallback: 'Test',
        summaryTemplate: { defaultText: 'Test diagnostic' },
        evidence: [
          {
            id: 'location-label',
            labelFallback: 'Location',
            source: { kind: 'location', path: '0.label' },
          },
        ],
      },
    });

    expect(presentation.evidence).toEqual([
      expect.objectContaining({
        id: 'location-label',
        value: presentation.locations[0]?.label,
      }),
    ]);
  });
});
