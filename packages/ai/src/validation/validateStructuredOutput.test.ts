import { describe, expect, it } from 'vitest';
import { validateStructuredOutput } from './validateStructuredOutput';

describe('validateStructuredOutput', () => {
  it('rejects malformed allowed-channel payloads', () => {
    const result = validateStructuredOutput(
      { channel: 'pir-command', commands: 'not-an-array', riskLevel: 'low' },
      ['pir-command']
    );
    expect(result.output).toBeUndefined();
    expect(result.diagnostics[0]?.path).toBe('commands');
  });

  it('rejects malformed plan milestones', () => {
    const result = validateStructuredOutput(
      { goal: 'Build', assumptions: [], milestones: [{ id: 'one' }] },
      []
    );
    expect(result.output).toBeUndefined();
    expect(result.diagnostics[0]?.path).toBe('milestones.0.title');
  });

  it('accepts a complete code artifact', () => {
    const output = {
      channel: 'code-artifact' as const,
      id: 'artifact-1',
      kind: 'utility-code' as const,
      language: 'ts',
      content: 'export {};',
      riskLevel: 'low' as const,
    };
    expect(validateStructuredOutput(output, ['code-artifact']).output).toEqual(
      output
    );
  });
});
