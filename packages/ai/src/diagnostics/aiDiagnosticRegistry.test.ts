import { describe, expect, it } from 'vitest';
import {
  AI_DIAGNOSTIC_CODES,
  AI_DIAGNOSTIC_REGISTRY,
} from './aiDiagnosticRegistry';

describe('AI diagnostic registry', () => {
  it('provides one complete definition per canonical code', () => {
    expect(new Set(AI_DIAGNOSTIC_CODES).size).toBe(AI_DIAGNOSTIC_CODES.length);
    expect(Object.keys(AI_DIAGNOSTIC_REGISTRY).sort()).toEqual(
      [...AI_DIAGNOSTIC_CODES].sort()
    );
    for (const code of AI_DIAGNOSTIC_CODES) {
      expect(AI_DIAGNOSTIC_REGISTRY[code]).toMatchObject({
        code,
        domain: 'ai',
      });
    }
  });
});
