import {
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
} from '../domain/agentCanonical';
import {
  cloneAgentControlJson,
  containsAgentControlCredentialLikeText,
  hasExactAgentControlKeys,
  inspectAgentControlJson,
  isAgentControlIdentity,
  isAgentControlInstant,
} from '../control/agentControlValidation';
import { scanAgentArtifactForSecretCanaries } from '../security/agentSecurity';
import type {
  AgentTaskRecord,
  AgentRunSnapshot,
} from '../control/agentControl.types';
import type { AgentModelInvocationReceipt } from '../providers/agentProvider.types';

/** User-facing final text only. This fact cannot carry raw streams, reasoning, tools or credentials. */
export type AgentTaskOutput = Readonly<{
  outputId: string;
  taskId: string;
  runId: string;
  generation: number;
  modelInvocationId: string;
  contextPackDigest: string;
  projectPolicyDigest: string;
  effectivePolicyDigest: string;
  kind: 'answer' | 'plan';
  text: string;
  contentDigest: string;
  recordedAt: string;
  outputDigest: string;
}>;
export type AgentTaskOutputWire = Readonly<{
  wireVersion: 1;
  factType: 'task-output';
  value: AgentTaskOutput;
}>;
export const AGENT_TASK_OUTPUT_MAXIMUM_UTF16_LENGTH = 65_536;

export const isAgentTaskOutputText = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.trim().length > 0 &&
  value.length <= AGENT_TASK_OUTPUT_MAXIMUM_UTF16_LENGTH &&
  !/[\uD800-\uDFFF]/u.test(value) &&
  !containsAgentControlCredentialLikeText(value);

export const createAgentTaskOutput = (
  input: Omit<AgentTaskOutput, 'contentDigest' | 'outputDigest'>,
  options: Readonly<{ secretCanaries?: readonly string[] }> = {}
): AgentTaskOutput => {
  if (
    inspectAgentControlJson(input, 524_288).length > 0 ||
    !hasExactAgentControlKeys(input, [
      'outputId',
      'taskId',
      'runId',
      'generation',
      'modelInvocationId',
      'contextPackDigest',
      'projectPolicyDigest',
      'effectivePolicyDigest',
      'kind',
      'text',
      'recordedAt',
    ]) ||
    ![input.outputId, input.taskId, input.runId, input.modelInvocationId].every(
      isAgentControlIdentity
    ) ||
    !Number.isSafeInteger(input.generation) ||
    input.generation < 1 ||
    ![
      input.contextPackDigest,
      input.projectPolicyDigest,
      input.effectivePolicyDigest,
    ].every(isAgentCanonicalDigest) ||
    !['answer', 'plan'].includes(input.kind) ||
    !isAgentTaskOutputText(input.text) ||
    !isAgentControlInstant(input.recordedAt) ||
    (options.secretCanaries &&
      options.secretCanaries.length > 0 &&
      scanAgentArtifactForSecretCanaries(input, options.secretCanaries).length >
        0)
  )
    throw new TypeError('Agent Task user output is invalid.');
  const base = cloneAgentControlJson({
    ...input,
    contentDigest: digestAgentCanonicalValue(input.text),
  });
  return Object.freeze({
    ...base,
    outputDigest: digestAgentCanonicalValue(base),
  });
};

export const decodeAgentTaskOutput = (
  wire: unknown
): Readonly<
  { ok: true; value: AgentTaskOutput } | { ok: false; message: string }
> => {
  try {
    if (
      inspectAgentControlJson(wire, 524_288).length > 0 ||
      !hasExactAgentControlKeys(wire, ['wireVersion', 'factType', 'value']) ||
      wire.wireVersion !== 1 ||
      wire.factType !== 'task-output' ||
      !hasExactAgentControlKeys(wire.value, [
        'outputId',
        'taskId',
        'runId',
        'generation',
        'modelInvocationId',
        'contextPackDigest',
        'projectPolicyDigest',
        'effectivePolicyDigest',
        'kind',
        'text',
        'contentDigest',
        'recordedAt',
        'outputDigest',
      ])
    )
      throw new TypeError();
    const { contentDigest, outputDigest, ...input } = wire.value;
    const output = createAgentTaskOutput(
      input as Omit<AgentTaskOutput, 'contentDigest' | 'outputDigest'>
    );
    if (
      output.contentDigest !== contentDigest ||
      output.outputDigest !== outputDigest
    )
      throw new TypeError();
    return { ok: true, value: output };
  } catch {
    return { ok: false, message: 'Agent Task user output wire is invalid.' };
  }
};

export const encodeAgentTaskOutput = (
  output: AgentTaskOutput
): AgentTaskOutputWire => {
  const wire = {
    wireVersion: 1 as const,
    factType: 'task-output' as const,
    value: output,
  };
  const decoded = decodeAgentTaskOutput(wire);
  if (!decoded.ok) throw new TypeError(decoded.message);
  return { ...wire, value: decoded.value };
};

/** The same public fact is checked against its immutable Task and completed invocation before publication. */
export const validateAgentTaskOutputBinding = (
  output: AgentTaskOutput,
  binding: Readonly<{
    task: AgentTaskRecord;
    run: AgentRunSnapshot;
    receipt: AgentModelInvocationReceipt;
    effectivePolicyDigest: string;
  }>
): boolean => {
  const { task, run, receipt } = binding;
  const { receiptDigest, ...receiptBody } = receipt;
  return (
    decodeAgentTaskOutput({
      wireVersion: 1,
      factType: 'task-output',
      value: output,
    }).ok &&
    receiptDigest === digestAgentCanonicalValue(receiptBody) &&
    task.spec.taskId === output.taskId &&
    run.run.taskId === output.taskId &&
    run.run.runId === output.runId &&
    run.run.generation === output.generation &&
    (!run.run.contextPackDigest ||
      run.run.contextPackDigest === output.contextPackDigest) &&
    output.projectPolicyDigest === task.spec.policyDigest &&
    output.effectivePolicyDigest === binding.effectivePolicyDigest &&
    task.spec.mode === (output.kind === 'answer' ? 'explain' : 'plan') &&
    receipt.outcome === 'completed' &&
    receipt.invocationId === output.modelInvocationId &&
    receipt.taskId === output.taskId &&
    receipt.runId === output.runId &&
    receipt.generation === output.generation &&
    receipt.contextPackDigest === output.contextPackDigest &&
    receipt.responseDigest ===
      digestAgentCanonicalValue(
        output.kind === 'answer'
          ? { answer: output.text }
          : { plan: output.text }
      ) &&
    Date.parse(output.recordedAt) >= Date.parse(receipt.completedAt)
  );
};
