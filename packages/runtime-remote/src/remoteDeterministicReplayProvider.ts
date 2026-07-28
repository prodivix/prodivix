import {
  DETERMINISTIC_RUNTIME_CONTROL_IDS,
  createDeterministicRuntimeProvider,
  type DeterministicIsolationResidual,
  type DeterministicRuntimeControlDeclaration,
  type DeterministicRuntimeControlPlan,
  type DeterministicRuntimeProvider,
} from '@prodivix/runtime-core';

export type RemoteDeterministicControlTransport = Readonly<{
  reset(
    input: Readonly<{
      namespace: string;
      plan: DeterministicRuntimeControlPlan;
    }>
  ): void | Promise<void>;
  apply(
    input: Readonly<{
      namespace: string;
      plan: DeterministicRuntimeControlPlan;
      expectedControlDigest: string;
    }>
  ):
    | Readonly<{ appliedControlDigest: string; fontReady: boolean }>
    | Promise<Readonly<{ appliedControlDigest: string; fontReady: boolean }>>;
  probe(
    input: Readonly<{
      namespace: string;
      phase: 'after-reset' | 'after-cleanup';
    }>
  ): DeterministicIsolationResidual | Promise<DeterministicIsolationResidual>;
  cleanup(
    input: Readonly<{
      namespace: string;
      plan: DeterministicRuntimeControlPlan;
    }>
  ): void | Promise<void>;
}>;

export type CreateRemoteDeterministicReplayProviderInput = Readonly<{
  id?: string;
  version?: string;
  implementationDigest: string;
  transport: RemoteDeterministicControlTransport;
  controls?: readonly DeterministicRuntimeControlDeclaration[];
  maximumResetAttempts?: number;
}>;

const resetWithRecovery = async (
  transport: RemoteDeterministicControlTransport,
  request: Readonly<{
    namespace: string;
    plan: DeterministicRuntimeControlPlan;
  }>,
  maximumAttempts: number
): Promise<void> => {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    try {
      await transport.reset(request);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < maximumAttempts) {
        // Recovery is allowed only before effects and only after the failed
        // namespace has been torn down successfully.
        await transport.cleanup(request);
      }
    }
  }
  throw lastError;
};

/**
 * Remote adapter keeps control payloads transport-safe and only retries the
 * pre-effect reset boundary. Runtime effects are never guessed or replayed.
 */
export const createRemoteDeterministicReplayProvider = (
  input: CreateRemoteDeterministicReplayProviderInput
): DeterministicRuntimeProvider => {
  const maximumResetAttempts = input.maximumResetAttempts ?? 2;
  if (
    !Number.isSafeInteger(maximumResetAttempts) ||
    maximumResetAttempts < 1 ||
    maximumResetAttempts > 3
  ) {
    throw new TypeError(
      'Remote deterministic reset attempts must be an integer from one to three.'
    );
  }
  const controls =
    input.controls ??
    Object.freeze(
      DETERMINISTIC_RUNTIME_CONTROL_IDS.map((controlId) =>
        Object.freeze({
          controlId,
          status: 'supported' as const,
          implementationDigest: input.implementationDigest,
        })
      )
    );
  return createDeterministicRuntimeProvider({
    id: input.id ?? 'prodivix.remote.deterministic-replay',
    version: input.version ?? '1',
    surface: 'remote',
    implementationDigest: input.implementationDigest,
    controls,
    hooks: {
      reset: (request) =>
        resetWithRecovery(input.transport, request, maximumResetAttempts),
      apply: (request) => input.transport.apply(request),
      probe: (request) => input.transport.probe(request),
      cleanup: (request) => input.transport.cleanup(request),
    },
  });
};
