import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parseWebGlShaderCompileLog } from './browserShaderCompilerBackends';

describe('browser shader compiler backend properties', () => {
  it('normalizes WebGL line diagnostics without changing their severity', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10_000 }),
        fc.stringMatching(/^[A-Za-z0-9][A-Za-z0-9 _.-]{0,79}$/u),
        (line, message) => {
          expect(
            parseWebGlShaderCompileLog(`ERROR: 0:${line}: ${message}`)
          ).toEqual([
            {
              severity: 'error',
              message: message.trim(),
              line,
            },
          ]);
        }
      )
    );
  });
});
