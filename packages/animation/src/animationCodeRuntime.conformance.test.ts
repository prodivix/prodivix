import { describe, expect, it, vi } from 'vitest';
import {
  prepareAnimationCodeRuntime,
  type AnimationCodeRuntimeGateway,
  type AnimationCodeSlotRuntimePlan,
} from './index';

const binding = Object.freeze({
  slotId: 'animation-code-slot:intro:shader',
  reference: Object.freeze({ artifactId: 'shader-artifact' }),
});

const plan = (
  overrides: Partial<AnimationCodeSlotRuntimePlan> = {}
): AnimationCodeSlotRuntimePlan => ({
  role: 'shader',
  slotId: binding.slotId,
  artifactId: binding.reference.artifactId,
  artifactRevision: 'revision-7',
  implementationDigest:
    'sha256-3b5d5c3712955042212316173ccf37be800c69c3dd6651b9149a86cf38e42782',
  inputTypeRef: 'AnimationShaderContext',
  outputTypeRef: 'AnimationShaderOutput',
  effect: 'pure',
  deterministic: true,
  capabilityIds: ['animation:gpu'],
  budget: {
    maximumInvocations: 120,
    maximumCpuMs: 200,
    maximumOutputBytes: 4096,
    maximumCompileLogBytes: 48,
  },
  shader: {
    runtime: 'webgl2',
    fallback: 'final-state',
    reducedFallback: 'final-state',
  },
  ...overrides,
});

describe('Animation CodeSlot runtime conformance', () => {
  it('prepares an exact shader plan, sanitizes logs, and cleans up once on context loss', async () => {
    const release = vi.fn();
    let loseContext: () => void = () => undefined;
    const gateway: AnimationCodeRuntimeGateway = {
      resolve: () => plan(),
      prepare: () => ({
        status: 'ready',
        compileLog:
          'shader\u0000 ready authorization=do-not-leak more compiler detail than the budget',
        lease: {
          release,
          onContextLost(listener) {
            loseContext = listener;
            return () => {
              loseContext = () => undefined;
            };
          },
        },
      }),
    };

    const result = await prepareAnimationCodeRuntime({
      bindings: { shader: binding },
      gateway,
      motionMode: 'reduced',
      signal: { aborted: false },
    });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.session.plans).toHaveLength(1);
    expect(result.session.compileLogs[0]?.text).toContain(
      'authorization=[redacted]'
    );
    expect(result.session.compileLogs[0]?.text).not.toContain('\u0000');
    expect(result.session.compileLogs[0]?.text.length).toBeLessThanOrEqual(48);

    loseContext();
    await Promise.resolve();
    expect(result.session.contextLost()).toBe(true);
    expect(release).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledWith('context-lost');
    await result.session.release('completed');
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('rejects forbidden ambient capabilities before preparing code', async () => {
    const prepare = vi.fn();
    const result = await prepareAnimationCodeRuntime({
      bindings: { shader: binding },
      gateway: {
        resolve: () =>
          plan({
            capabilityIds: ['animation:gpu', 'secret:read'],
          }),
        prepare,
      },
      motionMode: 'full',
      signal: { aborted: false },
    });
    expect(result).toMatchObject({
      status: 'blocked',
      issue: {
        code: 'code-slot-capability-forbidden',
        role: 'shader',
      },
    });
    expect(prepare).not.toHaveBeenCalled();
  });

  it('rejects stale, mistyped, or unbounded plans fail closed', async () => {
    for (const invalid of [
      plan({ artifactRevision: '' }),
      plan({ implementationDigest: 'stale' }),
      plan({ outputTypeRef: 'string' }),
      plan({
        budget: {
          ...plan().budget,
          maximumCpuMs: Number.POSITIVE_INFINITY,
        },
      }),
      plan({ shader: undefined }),
    ]) {
      const result = await prepareAnimationCodeRuntime({
        bindings: { shader: binding },
        gateway: {
          resolve: () => invalid,
          prepare: () => {
            throw new Error('Invalid plans must not reach preparation.');
          },
        },
        motionMode: 'full',
        signal: { aborted: false },
      });
      expect(result).toMatchObject({
        status: 'blocked',
        issue: { code: 'code-slot-contract-invalid' },
      });
    }
  });
});
