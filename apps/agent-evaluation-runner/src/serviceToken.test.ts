import { describe, expect, it } from 'vitest';

import {
  AGENT_EVALUATION_SERVICE_TOKEN_MAXIMUM_BYTES,
  AGENT_EVALUATION_SERVICE_TOKEN_MINIMUM_BYTES,
  isAgentEvaluationServiceToken,
} from './serviceToken';

describe('agent evaluation service token', () => {
  it('accepts the exact ASCII alphabet and byte boundaries', () => {
    expect(
      isAgentEvaluationServiceToken(
        'A._~+/-'.padEnd(AGENT_EVALUATION_SERVICE_TOKEN_MINIMUM_BYTES, '0')
      )
    ).toBe(true);
    expect(
      isAgentEvaluationServiceToken(
        'A'.repeat(AGENT_EVALUATION_SERVICE_TOKEN_MAXIMUM_BYTES - 2) + '=='
      )
    ).toBe(true);
  });

  it.each([
    undefined,
    '',
    'A'.repeat(AGENT_EVALUATION_SERVICE_TOKEN_MINIMUM_BYTES - 1),
    'A'.repeat(AGENT_EVALUATION_SERVICE_TOKEN_MAXIMUM_BYTES + 1),
    `${'A'.repeat(32)} `,
    ` ${'A'.repeat(32)}`,
    `${'A'.repeat(32)}\n`,
    `${'A'.repeat(32)}\u0000`,
    `${'A'.repeat(32)}"`,
    `${'A'.repeat(32)}\\`,
    `${'A'.repeat(32)}中`,
    `${'A'.repeat(32)}=A`,
    `${'A'.repeat(32)}===`,
  ])('rejects an unsafe or noncanonical token (%s)', (value) => {
    expect(isAgentEvaluationServiceToken(value)).toBe(false);
  });
});
