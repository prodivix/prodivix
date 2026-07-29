import { digestVerificationValue } from './verificationCanonical';
import type {
  ExecuteVerificationAdapterLifecycleInput,
  VerificationAdapterLifecycleResult,
} from './verificationAdapterRuntime.types';
import { VerificationLifecycleContractError } from './verificationAdapterLifecycleValidation';

type ActiveVerificationAdapterAttempt = Readonly<{
  bindingDigest: string;
  result: Promise<VerificationAdapterLifecycleResult>;
}>;

const lifecycleAttemptKey = (
  input: ExecuteVerificationAdapterLifecycleInput
): string =>
  [
    input.planDigest,
    input.cell.id,
    input.attemptId,
    String(input.generation),
  ].join('\0');

const lifecycleAttemptBindingDigest = (
  input: ExecuteVerificationAdapterLifecycleInput
): string =>
  digestVerificationValue({
    format: 'prodivix.verification-adapter-attempt-binding',
    version: 1,
    planDigest: input.planDigest,
    cell: input.cell,
    attemptId: input.attemptId,
    generation: input.generation,
    providerKind: input.providerKind,
    registrySnapshotDigest: input.registrySnapshot.snapshotDigest,
    runtimeZone: input.context.runtimeZone,
    runtimeEnvironmentDigest: input.context.runtimeEnvironmentDigest,
    executableSnapshotDigest: input.context.executableSnapshotDigest,
    scenarioProgramDigest: input.context.scenarioProgramDigest ?? null,
    controlProfileDigest: input.context.controlProfileDigest,
    fixtureSetDigests: input.context.fixtureSetDigests,
    baselineSetDigest: input.context.baselineSetDigest ?? null,
    controlCapabilityIds: input.context.controlCapabilityIds,
    controlCapabilitySnapshotDigest:
      input.context.controlCapabilitySnapshotDigest,
    appliedControlDigest: input.context.appliedControlDigest,
    inputRefs: input.context.inputRefs,
  });

/**
 * Core owns concurrent single-flight in one process. Sequential and
 * cross-process exactly-once remains with AttemptGrant issuance and promotion
 * claim authority; generation only fences runtime and artifact writes.
 */
export const createVerificationAdapterLifecycleCoordinator = (
  executeOnce: (
    input: ExecuteVerificationAdapterLifecycleInput
  ) => Promise<VerificationAdapterLifecycleResult>
): ((
  input: ExecuteVerificationAdapterLifecycleInput
) => Promise<VerificationAdapterLifecycleResult>) => {
  const activeAttempts = new Map<string, ActiveVerificationAdapterAttempt>();
  return (input) => {
    let attemptKey: string;
    let bindingDigest: string;
    try {
      attemptKey = lifecycleAttemptKey(input);
      bindingDigest = lifecycleAttemptBindingDigest(input);
    } catch (error) {
      return Promise.reject(error);
    }
    const active = activeAttempts.get(attemptKey);
    if (active) {
      return active.bindingDigest === bindingDigest
        ? active.result
        : Promise.reject(
            new VerificationLifecycleContractError(
              'VER-4001',
              'Concurrent lifecycle invocation drifted for an active attempt generation.'
            )
          );
    }
    const result = executeOnce(input);
    activeAttempts.set(attemptKey, Object.freeze({ bindingDigest, result }));
    void result.then(
      () => {
        if (activeAttempts.get(attemptKey)?.result === result) {
          activeAttempts.delete(attemptKey);
        }
      },
      () => {
        if (activeAttempts.get(attemptKey)?.result === result) {
          activeAttempts.delete(attemptKey);
        }
      }
    );
    return result;
  };
};
