export const ROOTLESS_PODMAN_DEFAULT_PREPARATION_TIMEOUT_MS = 60_000;
export const ROOTLESS_PODMAN_MAXIMUM_PREPARATION_TIMEOUT_MS = 60_000;

export type RootlessPodmanTimeoutPhase = 'preparation' | 'execution';

const positiveSafeInteger = (value: number, label: string): number => {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive safe integer.`);
  }
  return value;
};

export const resolveRootlessPodmanPreparationTimeoutMs = (
  value = ROOTLESS_PODMAN_DEFAULT_PREPARATION_TIMEOUT_MS
): number => {
  const timeoutMs = positiveSafeInteger(value, 'Sandbox preparation timeout');
  if (timeoutMs > ROOTLESS_PODMAN_MAXIMUM_PREPARATION_TIMEOUT_MS) {
    throw new TypeError(
      `Sandbox preparation timeout must not exceed ${ROOTLESS_PODMAN_MAXIMUM_PREPARATION_TIMEOUT_MS} ms.`
    );
  }
  return timeoutMs;
};

export const resolveRootlessPodmanExecutionTimeoutMs = (
  value: number
): number => positiveSafeInteger(value, 'Sandbox execution timeout');

/**
 * Installation/isolation handoff and authored execution have independent
 * deadlines. A cold dependency install must not consume the execution budget,
 * while neither phase is allowed to run without a positive hard limit.
 */
export const createRootlessPodmanLifecycleTimeout = (input: {
  preparationTimeoutMs: number;
  executionTimeoutMs: number;
  onTimeout: (phase: RootlessPodmanTimeoutPhase) => void;
}): Readonly<{
  enterExecutionPhase(): boolean;
  clear(): void;
  activePhase(): RootlessPodmanTimeoutPhase | undefined;
}> => {
  const preparationTimeoutMs = resolveRootlessPodmanPreparationTimeoutMs(
    input.preparationTimeoutMs
  );
  const executionTimeoutMs = resolveRootlessPodmanExecutionTimeoutMs(
    input.executionTimeoutMs
  );
  let activePhase: RootlessPodmanTimeoutPhase | undefined = 'preparation';
  let timer: ReturnType<typeof setTimeout>;
  const expire = (): void => {
    const phase = activePhase;
    if (phase === undefined) return;
    activePhase = undefined;
    input.onTimeout(phase);
  };
  timer = setTimeout(expire, preparationTimeoutMs);

  return Object.freeze({
    enterExecutionPhase(): boolean {
      if (activePhase !== 'preparation') return false;
      clearTimeout(timer);
      activePhase = 'execution';
      timer = setTimeout(expire, executionTimeoutMs);
      return true;
    },
    clear(): void {
      if (activePhase === undefined) return;
      activePhase = undefined;
      clearTimeout(timer);
    },
    activePhase: () => activePhase,
  });
};
