import {
  decodeAgentTaskOutput,
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
  validateAgentTaskOutputBinding,
  type AgentModelInvocationReceipt,
  type AgentRunSnapshot,
  type AgentTaskOutput,
  type AgentTaskRecord,
  type AgentRunSuccessProof,
} from '@prodivix/ai';
import type { AgentRuntimeFileJournal } from '#src/fileJournal.js';

export type AgentRuntimeTaskOutputRecord = Readonly<{
  output: AgentTaskOutput;
  receipt: AgentModelInvocationReceipt;
  groundingDigests: readonly string[];
}>;

/** Replay the exact final answer after an uncertain publication; never replay the provider invocation. */
export const readAgentRuntimeTaskOutput = async (input: {
  journal: AgentRuntimeFileJournal;
  task: AgentTaskRecord;
  run: AgentRunSnapshot;
  effectivePolicyDigest: string;
}): Promise<AgentRuntimeTaskOutputRecord | undefined> => {
  const record = await input.journal.read<AgentRuntimeTaskOutputRecord>(
    'task-output',
    input.run.run.runId
  );
  if (!record) return undefined;
  const decoded = decodeAgentTaskOutput({
    wireVersion: 1,
    factType: 'task-output',
    value: record.output,
  });
  if (
    !decoded.ok ||
    !validateAgentTaskOutputBinding(decoded.value, {
      task: input.task,
      run: input.run,
      receipt: record.receipt,
      effectivePolicyDigest: input.effectivePolicyDigest,
    }) ||
    !Array.isArray(record.groundingDigests) ||
    !record.groundingDigests.every(isAgentCanonicalDigest) ||
    input.run.pendingOperation?.operationId !==
      record.output.modelInvocationId ||
    input.run.pendingOperation.state !== 'settled' ||
    input.run.pendingOperation.resultDigest !==
      digestAgentCanonicalValue(record.receipt)
  )
    throw new Error('AI-7006');
  return record;
};

export const agentRuntimeTaskOutputProof = (
  record: AgentRuntimeTaskOutputRecord
): Extract<AgentRunSuccessProof, { mode: 'explain' | 'plan' }> =>
  record.output.kind === 'answer'
    ? {
        mode: 'explain',
        answerDigest: record.output.contentDigest,
        groundingDigests: record.groundingDigests,
      }
    : { mode: 'plan', planDigest: record.output.contentDigest };
