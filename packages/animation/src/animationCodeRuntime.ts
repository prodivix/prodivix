import type { CodeSlotBinding } from '@prodivix/authoring';
import type { AnimationMotionMode } from './animation.types';

export type AnimationCodeSlotRuntimeRole =
  'custom-easing' | 'shader' | 'script';

export type AnimationCodeSlotRuntimePlan = Readonly<{
  role: AnimationCodeSlotRuntimeRole;
  slotId: string;
  artifactId: string;
  artifactRevision: string;
  implementationDigest: string;
  inputTypeRef: string;
  outputTypeRef: string;
  effect: 'pure';
  deterministic: true;
  capabilityIds: readonly string[];
  budget: Readonly<{
    maximumInvocations: number;
    maximumCpuMs: number;
    maximumOutputBytes: number;
    maximumCompileLogBytes: number;
  }>;
  shader?: Readonly<{
    runtime: 'webgl2' | 'webgpu';
    fallback: 'disabled' | 'final-state';
    reducedFallback: 'disabled' | 'final-state';
  }>;
}>;

export type AnimationCodeSlotLeaseOutcome =
  'completed' | 'cancelled' | 'failed' | 'timed-out' | 'context-lost';

export type AnimationCodeSlotPreparedLease = Readonly<{
  release(outcome: AnimationCodeSlotLeaseOutcome): void | Promise<void>;
  onContextLost?(listener: () => void): () => void;
}>;

export type AnimationCodeRuntimeGateway = Readonly<{
  resolve(
    input: Readonly<{
      binding: CodeSlotBinding;
      role: AnimationCodeSlotRuntimeRole;
    }>
  ):
    | AnimationCodeSlotRuntimePlan
    | null
    | Promise<AnimationCodeSlotRuntimePlan | null>;
  prepare(
    input: Readonly<{
      plan: AnimationCodeSlotRuntimePlan;
      motionMode: AnimationMotionMode;
      signal: Readonly<{ aborted: boolean; reason?: unknown }>;
    }>
  ):
    | Readonly<{
        status: 'ready';
        lease: AnimationCodeSlotPreparedLease;
        compileLog?: string;
      }>
    | Readonly<{
        status: 'failed';
        code: string;
        safeMessage: string;
        compileLog?: string;
      }>
    | Promise<
        | Readonly<{
            status: 'ready';
            lease: AnimationCodeSlotPreparedLease;
            compileLog?: string;
          }>
        | Readonly<{
            status: 'failed';
            code: string;
            safeMessage: string;
            compileLog?: string;
          }>
      >;
}>;

export type AnimationCodeRuntimeIssue = Readonly<{
  code:
    | 'code-slot-unresolved'
    | 'code-slot-contract-invalid'
    | 'code-slot-capability-forbidden'
    | 'code-slot-prepare-failed';
  role: AnimationCodeSlotRuntimeRole;
  safeMessage: string;
  compileLog?: string;
}>;

export type AnimationCodeRuntimeSession = Readonly<{
  plans: readonly AnimationCodeSlotRuntimePlan[];
  compileLogs: readonly Readonly<{
    role: AnimationCodeSlotRuntimeRole;
    text: string;
  }>[];
  contextLost(): boolean;
  release(outcome: AnimationCodeSlotLeaseOutcome): Promise<void>;
}>;

export type PrepareAnimationCodeRuntimeResult =
  | Readonly<{ status: 'ready'; session: AnimationCodeRuntimeSession }>
  | Readonly<{ status: 'blocked'; issue: AnimationCodeRuntimeIssue }>;

const EXPECTED_CONTRACT = Object.freeze({
  'custom-easing': Object.freeze({
    inputTypeRef: 'number',
    outputTypeRef: 'number',
  }),
  shader: Object.freeze({
    inputTypeRef: 'AnimationShaderContext',
    outputTypeRef: 'AnimationShaderOutput',
  }),
  script: Object.freeze({
    inputTypeRef: 'AnimationTimelineScriptContext',
    outputTypeRef: 'void | Promise<void>',
  }),
});

const FORBIDDEN_CAPABILITY =
  /(?:^|[:./-])(network|secret|workspace-write|environment)(?:$|[:./-])/iu;
const DIGEST = /^sha256-[a-f0-9]{64}$/u;

const stripUnsafeControlCharacters = (value: string): string =>
  Array.from(value, (character) => {
    const codePoint = character.codePointAt(0)!;
    return codePoint === 0x7f ||
      (codePoint <= 0x1f &&
        codePoint !== 0x09 &&
        codePoint !== 0x0a &&
        codePoint !== 0x0d)
      ? ''
      : character;
  }).join('');

const sanitizedLog = (value: string | undefined, maximum: number): string =>
  stripUnsafeControlCharacters(String(value ?? ''))
    .replaceAll(
      /\b(token|secret|password|authorization)\s*[:=]\s*\S+/giu,
      '$1=[redacted]'
    )
    .slice(0, maximum);

const validPositiveInteger = (value: number, maximum: number): boolean =>
  Number.isSafeInteger(value) && value > 0 && value <= maximum;

const validatePlan = (
  binding: CodeSlotBinding,
  role: AnimationCodeSlotRuntimeRole,
  plan: AnimationCodeSlotRuntimePlan
): AnimationCodeRuntimeIssue | null => {
  const expected = EXPECTED_CONTRACT[role];
  if (
    plan.role !== role ||
    plan.slotId !== binding.slotId ||
    plan.artifactId !== binding.reference.artifactId ||
    !plan.artifactRevision.trim() ||
    plan.artifactRevision.length > 256 ||
    !DIGEST.test(plan.implementationDigest) ||
    plan.inputTypeRef !== expected.inputTypeRef ||
    plan.outputTypeRef !== expected.outputTypeRef ||
    plan.effect !== 'pure' ||
    plan.deterministic !== true ||
    !validPositiveInteger(plan.budget.maximumInvocations, 1_000_000) ||
    !validPositiveInteger(plan.budget.maximumCpuMs, 60_000) ||
    !validPositiveInteger(plan.budget.maximumOutputBytes, 16 * 1024 * 1024) ||
    !validPositiveInteger(plan.budget.maximumCompileLogBytes, 64 * 1024) ||
    (role === 'shader' &&
      (!plan.shader ||
        !plan.capabilityIds.includes('animation:gpu') ||
        (plan.shader.runtime !== 'webgl2' &&
          plan.shader.runtime !== 'webgpu'))) ||
    (role !== 'shader' && plan.shader !== undefined)
  ) {
    return Object.freeze({
      code: 'code-slot-contract-invalid',
      role,
      safeMessage:
        'Animation CodeSlot resolution did not match its exact revision-bound contract.',
    });
  }
  if (
    plan.capabilityIds.some((capability) =>
      FORBIDDEN_CAPABILITY.test(capability)
    )
  ) {
    return Object.freeze({
      code: 'code-slot-capability-forbidden',
      role,
      safeMessage:
        'Animation CodeSlot requested a forbidden network, Secret, Workspace-write, or environment capability.',
    });
  }
  return null;
};

const entries = (
  bindings: Readonly<{
    customEasing?: CodeSlotBinding;
    shader?: CodeSlotBinding;
    script?: CodeSlotBinding;
  }>
): readonly Readonly<{
  role: AnimationCodeSlotRuntimeRole;
  binding: CodeSlotBinding;
}>[] =>
  Object.freeze(
    (
      [
        ['custom-easing', bindings.customEasing],
        ['shader', bindings.shader],
        ['script', bindings.script],
      ] as const
    ).flatMap(([role, binding]) =>
      binding ? [Object.freeze({ role, binding })] : []
    )
  );

/**
 * Resolves and prepares Animation CodeSlots through one capability-bounded
 * gateway. The returned session owns all leases and tears them down exactly
 * once, including GPU context loss.
 */
export const prepareAnimationCodeRuntime = async (
  input: Readonly<{
    bindings: Readonly<{
      customEasing?: CodeSlotBinding;
      shader?: CodeSlotBinding;
      script?: CodeSlotBinding;
    }>;
    gateway: AnimationCodeRuntimeGateway;
    motionMode: AnimationMotionMode;
    signal: Readonly<{ aborted: boolean; reason?: unknown }>;
  }>
): Promise<PrepareAnimationCodeRuntimeResult> => {
  const plans: AnimationCodeSlotRuntimePlan[] = [];
  const leases: AnimationCodeSlotPreparedLease[] = [];
  const unsubscribe: Array<() => void> = [];
  const compileLogs: Array<{
    role: AnimationCodeSlotRuntimeRole;
    text: string;
  }> = [];
  let released = false;
  let lost = false;

  const release = async (
    outcome: AnimationCodeSlotLeaseOutcome
  ): Promise<void> => {
    if (released) return;
    released = true;
    unsubscribe.splice(0).forEach((dispose) => dispose());
    await Promise.allSettled(
      [...leases].reverse().map((lease) => lease.release(outcome))
    );
  };

  for (const entry of entries(input.bindings)) {
    const plan = await input.gateway.resolve(entry);
    if (!plan) {
      await release('failed');
      return Object.freeze({
        status: 'blocked',
        issue: Object.freeze({
          code: 'code-slot-unresolved',
          role: entry.role,
          safeMessage:
            'Animation CodeSlot could not be resolved in the selected revision.',
        }),
      });
    }
    const issue = validatePlan(entry.binding, entry.role, plan);
    if (issue) {
      await release('failed');
      return Object.freeze({ status: 'blocked', issue });
    }
    const prepared = await input.gateway.prepare({
      plan,
      motionMode: input.motionMode,
      signal: input.signal,
    });
    const compileLog = sanitizedLog(
      prepared.compileLog,
      plan.budget.maximumCompileLogBytes
    );
    if (compileLog) {
      compileLogs.push(Object.freeze({ role: entry.role, text: compileLog }));
    }
    if (prepared.status === 'failed') {
      await release('failed');
      return Object.freeze({
        status: 'blocked',
        issue: Object.freeze({
          code: 'code-slot-prepare-failed',
          role: entry.role,
          safeMessage: prepared.safeMessage.slice(0, 512),
          ...(compileLog ? { compileLog } : {}),
        }),
      });
    }
    plans.push(Object.freeze(plan));
    leases.push(prepared.lease);
    if (prepared.lease.onContextLost) {
      unsubscribe.push(
        prepared.lease.onContextLost(() => {
          lost = true;
          void release('context-lost');
        })
      );
    }
  }

  return Object.freeze({
    status: 'ready',
    session: Object.freeze({
      plans: Object.freeze(plans),
      compileLogs: Object.freeze(compileLogs),
      contextLost: () => lost,
      release,
    }),
  });
};
