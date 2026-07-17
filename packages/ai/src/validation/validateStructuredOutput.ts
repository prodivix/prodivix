import type {
  LlmCodeArtifactKind,
  LlmDiagnostic,
  LlmOutputChannel,
  LlmRiskLevel,
  LlmStructuredOutput,
} from '@prodivix/shared';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const riskLevels = new Set<LlmRiskLevel>(['low', 'medium', 'high']);
const codeArtifactKinds = new Set<LlmCodeArtifactKind>([
  'node-code',
  'external-runtime-code',
  'adapter-code',
  'test-code',
  'shader-code',
  'worker-code',
  'utility-code',
]);

const invalid = (message: string, path?: string) => ({
  diagnostics: [
    {
      code: 'INVALID_STRUCTURED_OUTPUT',
      message,
      severity: 'error',
      ...(path ? { path } : {}),
    } satisfies LlmDiagnostic,
  ],
});

const isStringArray = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

const validatePlan = (
  candidate: Record<string, unknown>
): string | undefined => {
  if (typeof candidate.goal !== 'string') return 'goal';
  if (!isStringArray(candidate.assumptions)) return 'assumptions';
  if (!Array.isArray(candidate.milestones)) return 'milestones';
  for (let index = 0; index < candidate.milestones.length; index += 1) {
    const milestone = candidate.milestones[index];
    if (!isRecord(milestone)) return `milestones.${index}`;
    if (typeof milestone.id !== 'string') return `milestones.${index}.id`;
    if (typeof milestone.title !== 'string') return `milestones.${index}.title`;
    if (
      milestone.description !== undefined &&
      typeof milestone.description !== 'string'
    ) {
      return `milestones.${index}.description`;
    }
  }
  return undefined;
};

const validateRisk = (value: unknown): value is LlmRiskLevel =>
  typeof value === 'string' && riskLevels.has(value as LlmRiskLevel);

export const validateStructuredOutput = (
  output: unknown,
  allowedChannels: readonly LlmOutputChannel[]
): { output?: LlmStructuredOutput; diagnostics: readonly LlmDiagnostic[] } => {
  if (!isRecord(output)) {
    return invalid('LLM output must be an object.');
  }
  const channel = output.channel;
  if (channel === undefined) {
    const invalidPath = validatePlan(output);
    return invalidPath
      ? invalid('LLM plan output has an invalid field.', invalidPath)
      : { output: output as unknown as LlmStructuredOutput, diagnostics: [] };
  }
  if (
    channel !== 'pir-command' &&
    channel !== 'node-graph-operation' &&
    channel !== 'code-artifact'
  ) {
    return invalid('LLM output channel is invalid.', 'channel');
  }
  if (!allowedChannels.includes(channel)) {
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
  if (!validateRisk(output.riskLevel)) {
    return invalid('LLM output riskLevel is invalid.', 'riskLevel');
  }
  if (channel === 'pir-command' && !Array.isArray(output.commands)) {
    return invalid('LLM PIR commands must be an array.', 'commands');
  }
  if (channel === 'node-graph-operation' && !Array.isArray(output.operations)) {
    return invalid('LLM NodeGraph operations must be an array.', 'operations');
  }
  if (channel === 'code-artifact') {
    if (typeof output.id !== 'string')
      return invalid('Code artifact id is required.', 'id');
    if (
      typeof output.kind !== 'string' ||
      !codeArtifactKinds.has(output.kind as LlmCodeArtifactKind)
    ) {
      return invalid('Code artifact kind is invalid.', 'kind');
    }
    if (typeof output.language !== 'string') {
      return invalid('Code artifact language is required.', 'language');
    }
    if (typeof output.content !== 'string') {
      return invalid('Code artifact content is required.', 'content');
    }
    if (output.ownerId !== undefined && typeof output.ownerId !== 'string') {
      return invalid('Code artifact ownerId is invalid.', 'ownerId');
    }
    if (
      output.bindTargetId !== undefined &&
      typeof output.bindTargetId !== 'string'
    ) {
      return invalid('Code artifact bindTargetId is invalid.', 'bindTargetId');
    }
  }
  return { output: output as unknown as LlmStructuredOutput, diagnostics: [] };
};
