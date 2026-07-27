import { describe, expect, it } from 'vitest';
import {
  parseStrictJsonDocument,
  PLUGIN_DIAGNOSTIC_CODES,
} from '#contracts/index';

const parseManifestSource = (source: string) =>
  parseStrictJsonDocument(source, { documentKind: 'manifest' });

describe('parseStrictJsonDocument', () => {
  it('bounds the reported problems for a document that recovers from an error per byte', () => {
    const result = parseManifestSource(`[${','.repeat(50_000)}`);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics.length).toBeLessThanOrEqual(33);
    expect(
      result.diagnostics.some(({ message }) =>
        message.includes('further reported problems that were suppressed')
      )
    ).toBe(true);
    expect(result.diagnostics[0]?.code).toBe(
      PLUGIN_DIAGNOSTIC_CODES.INVALID_SOURCE
    );
  });

  it('bounds the reported duplicate keys of a document that repeats one key', () => {
    const repeated = Array.from({ length: 5_000 }, () => '"id":"example"').join(
      ','
    );

    const result = parseManifestSource(`{${repeated}}`);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics.length).toBeLessThanOrEqual(33);
    expect(
      result.diagnostics.filter(
        ({ code }) => code === PLUGIN_DIAGNOSTIC_CODES.DUPLICATE_KEY
      )
    ).toHaveLength(32);
  });

  it('reports the line and column of a parse error in a multi-line document', () => {
    const result = parseManifestSource('{\n  "id": "example",\n  "name":\n}');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    const [first] = result.diagnostics;
    expect(first?.meta.line).toBe(4);
    expect(first?.meta.column).toBe(1);
  });
});
