import { describe, expect, it } from 'vitest';
import { digestAgentCanonicalValue } from '../domain/agentCanonical';
import {
  createAgentTaskOutput,
  decodeAgentTaskOutput,
  encodeAgentTaskOutput,
  isAgentTaskOutputText,
} from './agentTaskOutput';

const input = {
  outputId: 'invocation.runtime.output',
  taskId: 'task.runtime',
  runId: 'run.runtime',
  generation: 1,
  modelInvocationId: 'invocation.runtime',
  contextPackDigest: digestAgentCanonicalValue('context'),
  projectPolicyDigest: digestAgentCanonicalValue('project-policy'),
  effectivePolicyDigest: digestAgentCanonicalValue('effective-policy'),
  kind: 'answer' as const,
  text: 'The current count is 1. 计数为一。😀',
  recordedAt: '2026-10-01T00:00:01.000Z',
};

describe('bounded user-visible Agent Task output', () => {
  it('round trips safe Unicode with independently bound content and fact digests', () => {
    const output = createAgentTaskOutput(input);
    const { outputDigest, ...base } = output;
    expect(output.contentDigest).toBe(digestAgentCanonicalValue(input.text));
    expect(outputDigest).toBe(digestAgentCanonicalValue(base));
    expect(
      decodeAgentTaskOutput(
        JSON.parse(JSON.stringify(encodeAgentTaskOutput(output)))
      )
    ).toEqual({ ok: true, value: output });
    expect(
      createAgentTaskOutput({
        ...input,
        kind: 'plan',
        text: '1. Inspect the bound document.\n2. Preview the change.',
      }).kind
    ).toBe('plan');
  });
  it('enforces the text bound and rejects malformed Unicode, credential-like text and callback-local canaries', () => {
    expect(isAgentTaskOutputText('a'.repeat(65_536))).toBe(true);
    for (const text of [
      '',
      ' ',
      'a'.repeat(65_537),
      '\uD800',
      '\uDC00',
      'Bearer fixturecredential',
      'sk-fixturecredential',
    ]) {
      expect(() => createAgentTaskOutput({ ...input, text })).toThrow(
        'Agent Task user output is invalid.'
      );
    }
    expect(() =>
      createAgentTaskOutput(
        { ...input, text: 'fixture-private-material' },
        { secretCanaries: ['fixture-private-material'] }
      )
    ).toThrow();
  });
  it('rejects unknown fields, digest drift and invalid identity or time instead of migrating them', () => {
    const wire = encodeAgentTaskOutput(createAgentTaskOutput(input));
    for (const bad of [
      { ...wire, debug: true },
      { ...wire, value: { ...wire.value, rawStream: 'x' } },
      { ...wire, value: { ...wire.value, text: 'changed' } },
      {
        ...wire,
        value: {
          ...wire.value,
          outputDigest: digestAgentCanonicalValue('other'),
        },
      },
      { ...wire, value: { ...wire.value, generation: 0 } },
      { ...wire, value: { ...wire.value, recordedAt: '2026-10-01T00:00:01Z' } },
    ]) {
      expect(decodeAgentTaskOutput(bad).ok).toBe(false);
    }
  });
});
