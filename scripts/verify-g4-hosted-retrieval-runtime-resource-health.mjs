import { pathToFileURL } from 'node:url';

import {
  isAgentControlIdentity,
  matchAgentHostedRetrievalRuntimeResourceOwnerHealthReceipt,
} from '../packages/ai/src/index.ts';
import { createEnvironmentAgentEvaluationHostedRetrievalRuntimeResourceOwnerHealthClient } from '../apps/agent-evaluation-runner/src/hostedRetrievalRuntimeResourceClient.ts';
import { createProductionAgentEvaluationHostedRetrievalRuntimeResourceOwnerHealthBinding } from '../apps/agent-evaluation-runner/src/productionSharedEffectHostedOwner.ts';

const MAXIMUM_TIMEOUT_MS = 120_000;
const RETRY_DELAY_MS = 100;

const fail = (message) => {
  throw new Error(message);
};

const wait = (delayMs) =>
  new Promise((resolvePromise) => setTimeout(resolvePromise, delayMs));

const validateTimeout = (timeoutMs) => {
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > MAXIMUM_TIMEOUT_MS
  ) {
    fail('Hosted retrieval runtime resource owner health timeout is invalid.');
  }
  return timeoutMs;
};

export const waitForG4HostedRetrievalRuntimeResourceOwnerHealth = async ({
  client,
  binding,
  timeoutMs,
  clock = () => new Date(),
  delay = wait,
}) => {
  if (
    !client ||
    typeof client.readOwnerHealth !== 'function' ||
    !binding ||
    !isAgentControlIdentity(binding.namespaceId) ||
    typeof clock !== 'function' ||
    typeof delay !== 'function'
  ) {
    fail(
      'Hosted retrieval runtime resource owner health authority is invalid.'
    );
  }
  const boundedTimeoutMs = validateTimeout(timeoutMs);
  const startedAt = clock().getTime();
  if (!Number.isFinite(startedAt)) {
    fail('Hosted retrieval runtime resource owner health clock is invalid.');
  }
  const deadline = startedAt + boundedTimeoutMs;
  while (clock().getTime() <= deadline) {
    const receipt = await client.readOwnerHealth();
    const now = clock();
    if (
      Number.isFinite(now.getTime()) &&
      receipt !== undefined &&
      matchAgentHostedRetrievalRuntimeResourceOwnerHealthReceipt(
        receipt,
        binding,
        now.toISOString()
      )
    ) {
      return receipt;
    }
    const remaining = deadline - now.getTime();
    if (remaining <= 0) break;
    await delay(Math.min(RETRY_DELAY_MS, remaining));
  }
  fail(
    'Hosted retrieval runtime resource owner did not reach exact clean preactivation health.'
  );
};

const main = async () => {
  const [command, timeoutText] = process.argv.slice(2);
  if (command !== 'ready' || !/^[1-9][0-9]{0,8}$/u.test(timeoutText ?? '')) {
    fail(
      'Usage: verify-g4-hosted-retrieval-runtime-resource-health.mjs ready <timeout-ms>'
    );
  }
  const namespaceId = process.env.PRODIVIX_G4_MODEL_EVAL_NAMESPACE ?? '';
  const binding =
    createProductionAgentEvaluationHostedRetrievalRuntimeResourceOwnerHealthBinding(
      namespaceId
    );
  const client =
    createEnvironmentAgentEvaluationHostedRetrievalRuntimeResourceOwnerHealthClient(
      {
        ...binding,
        timeoutMs: Math.min(Number(timeoutText), 15_000),
      }
    );
  const receipt = await waitForG4HostedRetrievalRuntimeResourceOwnerHealth({
    client,
    binding,
    timeoutMs: Number(timeoutText),
  });
  process.stdout.write(receipt.receiptDigest);
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
