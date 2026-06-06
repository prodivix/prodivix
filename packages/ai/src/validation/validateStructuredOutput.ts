import type {
  LlmDiagnostic,
  LlmOutputChannel,
  LlmStructuredOutput,
} from '@prodivix/shared';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readOutputChannel = (
  output: LlmStructuredOutput
): LlmOutputChannel | 'plan' => {
  if ('channel' in output) {
    return output.channel;
  }

  return 'plan';
};

export const validateStructuredOutput = (
  output: unknown,
  allowedChannels: readonly LlmOutputChannel[]
): { output?: LlmStructuredOutput; diagnostics: readonly LlmDiagnostic[] } => {
  if (!isRecord(output)) {
    return {
      diagnostics: [
        {
          code: 'INVALID_STRUCTURED_OUTPUT',
          message: 'LLM output must be an object.',
          severity: 'error',
        },
      ],
    };
  }

  const candidate = output as unknown as LlmStructuredOutput;
  const channel = readOutputChannel(candidate);

  if (channel !== 'plan' && !allowedChannels.includes(channel)) {
    return {
      diagnostics: [
        {
          code: 'DISALLOWED_OUTPUT_CHANNEL',
          message: `LLM output channel is not allowed: ${channel}.`,
          severity: 'error',
          path: 'channel',
          allowedValues: allowedChannels,
        },
      ],
    };
  }

  return {
    output: candidate,
    diagnostics: [],
  };
};
