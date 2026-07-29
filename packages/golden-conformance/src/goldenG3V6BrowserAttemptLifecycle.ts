export type GoldenG3V6AttemptCleanupError = Readonly<{
  stepId: string;
  error: unknown;
}>;

export type GoldenG3V6AttemptCleanupScope = Readonly<{
  defer(stepId: string, cleanup: () => void | Promise<void>): void;
  runAll(): Promise<readonly GoldenG3V6AttemptCleanupError[]>;
}>;

export const auditGoldenG3V6RuntimeControlRetirement = <
  Evidence extends Readonly<{ evidenceDigest: string }>,
>(input: {
  attemptId: string;
  retiredEvidence: Evidence | undefined;
  assertReleased(): Evidence;
  snapshot(): Readonly<{
    registered: number;
    acquired: number;
    started: number;
    released: number;
    active: number;
  }>;
}): Evidence | undefined => {
  if (input.retiredEvidence === undefined) {
    const snapshot = input.snapshot();
    if (Object.values(snapshot).some((count) => count !== 0)) {
      throw new Error(
        `Golden V6 failed attempt "${input.attemptId}" retained runtime-control state.`
      );
    }
    return undefined;
  }
  const auditedEvidence = input.assertReleased();
  if (input.retiredEvidence.evidenceDigest !== auditedEvidence.evidenceDigest) {
    throw new Error(
      `Golden V6 attempt "${input.attemptId}" runtime-control retirement evidence drifted before audit.`
    );
  }
  return auditedEvidence;
};

export const createGoldenG3V6AttemptCleanupScope =
  (): GoldenG3V6AttemptCleanupScope => {
    const steps: Array<
      Readonly<{
        stepId: string;
        cleanup: () => void | Promise<void>;
      }>
    > = [];
    let cleaned = false;
    return Object.freeze({
      defer(stepId, cleanup) {
        if (cleaned) {
          throw new Error(
            `Golden V6 cleanup step "${stepId}" was registered after cleanup.`
          );
        }
        if (steps.some((step) => step.stepId === stepId)) {
          throw new Error(
            `Golden V6 cleanup step "${stepId}" was registered twice.`
          );
        }
        steps.push(Object.freeze({ stepId, cleanup }));
      },
      async runAll() {
        if (cleaned) {
          throw new Error('Golden V6 attempt cleanup ran more than once.');
        }
        cleaned = true;
        const errors: GoldenG3V6AttemptCleanupError[] = [];
        for (const step of [...steps].reverse()) {
          try {
            await step.cleanup();
          } catch (error) {
            errors.push(Object.freeze({ stepId: step.stepId, error }));
          }
        }
        return Object.freeze(errors);
      },
    });
  };

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export const throwGoldenG3V6AttemptFailure = (
  attemptId: string,
  primaryError: unknown,
  cleanupErrors: readonly GoldenG3V6AttemptCleanupError[]
): void => {
  if (primaryError === undefined && cleanupErrors.length === 0) return;
  if (primaryError !== undefined && cleanupErrors.length === 0) {
    throw primaryError;
  }
  const errors = [
    ...(primaryError === undefined ? [] : [primaryError]),
    ...cleanupErrors.map(
      ({ stepId, error }) =>
        new Error(
          `Golden V6 cleanup step "${stepId}" failed: ${errorMessage(error)}`,
          { cause: error }
        )
    ),
  ];
  throw new AggregateError(
    errors,
    `Golden V6 attempt "${attemptId}" failed with ${String(cleanupErrors.length)} cleanup error(s).`
  );
};
