import { describe, expect, it } from 'vitest';
import { utf8ToBytes } from '@noble/hashes/utils.js';
import {
  createExecutionSecretLeakDiagnostic,
  createExecutionSecretLeakGuard,
  createExecutionSecretTextStreamRedactor,
  EXECUTION_SECRET_LEAK_DIAGNOSTIC_CODE,
  EXECUTION_SECRET_LEAK_SURFACES,
  EXECUTION_SECRET_REDACTION_MARKER,
} from '../executionSecretLeakGuard';

const canary = 'secret-canary-7f31c8';

describe('execution Secret leak guard', () => {
  it('detects protected material without reflecting its value or position', () => {
    const guard = createExecutionSecretLeakGuard({
      secretValues: [canary],
    });

    EXECUTION_SECRET_LEAK_SURFACES.forEach((surface) => {
      const inspection = guard.inspectValue(surface, {
        nested: [{ output: `prefix:${canary}:suffix` }],
      });
      expect(inspection).toEqual({
        safe: false,
        surface,
        reason: 'secret-canary',
      });
      expect(JSON.stringify(inspection)).not.toContain(canary);
      const diagnostic = createExecutionSecretLeakDiagnostic({ surface });
      expect(diagnostic).toMatchObject({
        code: EXECUTION_SECRET_LEAK_DIAGNOSTIC_CODE,
        severity: 'fatal',
        retryable: false,
        meta: { surface },
      });
      expect(JSON.stringify(diagnostic)).not.toContain(canary);
    });
    expect(JSON.stringify(guard)).not.toContain(canary);
  });

  it('scans UTF-8 artifact bytes and structured property names', () => {
    const guard = createExecutionSecretLeakGuard({ secretValues: [canary] });
    expect(
      guard.inspectBytes(
        'artifact-content',
        utf8ToBytes(`binary-prefix\0${canary}\0binary-suffix`)
      )
    ).toMatchObject({ safe: false, reason: 'secret-canary' });
    expect(
      guard.inspectValue('diagnostic', { [`field-${canary}`]: 'value' })
    ).toMatchObject({ safe: false, reason: 'secret-canary' });
  });

  it('redacts longest protected values first and reports the redaction', () => {
    const guard = createExecutionSecretLeakGuard({
      secretValues: ['secret-value', 'secret-value-with-suffix'],
    });
    const result = guard.redactText(
      'secret-value-with-suffix and secret-value'
    );
    expect(result).toEqual({
      value: `${EXECUTION_SECRET_REDACTION_MARKER} and ${EXECUTION_SECRET_REDACTION_MARKER}`,
      redacted: true,
    });
    expect(result.value).not.toContain('secret-value');
  });

  it('redacts protected values split across arbitrary stream chunks', () => {
    const redactor = createExecutionSecretTextStreamRedactor({
      secretValues: [canary],
    });
    const output = [
      redactor.push('visible:secret-'),
      redactor.push('canary-'),
      redactor.push('7f31c8:tail'),
      redactor.flush(),
    ];
    const value = output.map((entry) => entry.value).join('');
    expect(value).toBe(`visible:${EXECUTION_SECRET_REDACTION_MARKER}:tail`);
    expect(value).not.toContain(canary);
    expect(output.some((entry) => entry.redacted)).toBe(true);
  });

  it('fails closed on getters without evaluating them', () => {
    let evaluated = false;
    const value = Object.defineProperty({}, 'unsafe', {
      enumerable: true,
      get() {
        evaluated = true;
        return canary;
      },
    });
    const result = createExecutionSecretLeakGuard({
      secretValues: [canary],
    }).inspectValue('terminal', value);
    expect(result).toEqual({
      safe: false,
      surface: 'terminal',
      reason: 'uninspectable',
    });
    expect(evaluated).toBe(false);
  });

  it('keeps an empty guard inert and handles circular plain values', () => {
    const value: Record<string, unknown> = { message: 'safe' };
    value.self = value;
    const guard = createExecutionSecretLeakGuard({ secretValues: [] });
    expect(guard.inspectValue('log', value)).toEqual({ safe: true });
    expect(guard.redactText('safe')).toEqual({
      value: 'safe',
      redacted: false,
    });
    expect(() =>
      createExecutionSecretLeakGuard({
        secretValues: [1] as unknown as readonly string[],
      })
    ).toThrow(/must be strings/u);
  });
});
