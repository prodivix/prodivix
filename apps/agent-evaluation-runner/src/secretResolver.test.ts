import { describe, expect, it, vi } from 'vitest';
import { AGENT_EVALUATION_PROVIDER_DEFINITIONS } from './config';
import { AGENT_EVALUATION_RUNNER_ERROR_CODES, safeRunnerError } from './errors';
import {
  EnvironmentAgentProviderSecretResolver,
  createCredentialCanarySignatures,
} from './secretResolver';

const definition = AGENT_EVALUATION_PROVIDER_DEFINITIONS['openai-responses'];
const request = Object.freeze({
  protocolFamily: 'openai-responses' as const,
  providerConfigurationId: definition.providerConfigurationId,
  secretRef: definition.secretRef,
  purpose: 'model-invocation' as const,
  runtimeZone: 'server' as const,
  useId: 'secret-use-1',
});

describe('environment provider secret resolver', () => {
  it('reads only the fixed slot inside a callback and zeroes material afterward', async () => {
    const secret = 'openai-test-secret-123';
    const readEnvironment = vi.fn((name: string) =>
      name === definition.secretEnvironmentName ? secret : undefined
    );
    const resolver = new EnvironmentAgentProviderSecretResolver(
      readEnvironment
    );
    let reference: Uint8Array | undefined;
    const result = await resolver.use(request, async (material) => {
      reference = material;
      expect(new TextDecoder().decode(material)).toBe(secret);
      return Object.freeze({ accepted: true });
    });

    expect(result).toEqual({ accepted: true });
    expect(readEnvironment).toHaveBeenCalledOnce();
    expect(readEnvironment).toHaveBeenCalledWith(
      definition.secretEnvironmentName
    );
    expect(reference).toBeDefined();
    expect([...reference!]).toEqual(new Array(reference!.byteLength).fill(0));
  });

  it('enforces one-shot use IDs and fixed provider bindings', async () => {
    const resolver = new EnvironmentAgentProviderSecretResolver({
      [definition.secretEnvironmentName]: 'openai-test-secret-123',
    });
    await resolver.use(request, async () => true);
    await expect(resolver.use(request, async () => true)).rejects.toMatchObject(
      {
        code: AGENT_EVALUATION_RUNNER_ERROR_CODES.secretUseDenied,
      }
    );
    await expect(
      new EnvironmentAgentProviderSecretResolver({
        [definition.secretEnvironmentName]: 'openai-test-secret-123',
      }).use(
        { ...request, providerConfigurationId: 'provider.attacker' },
        async () => true
      )
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.secretUseDenied,
    });
  });

  it('blocks raw and encoded credential canaries from callback results', async () => {
    const secret = 'openai-test-secret-123';
    const signatures = createCredentialCanarySignatures(
      new TextEncoder().encode(secret)
    );
    for (const [index, signature] of signatures.entries()) {
      const resolver = new EnvironmentAgentProviderSecretResolver({
        [definition.secretEnvironmentName]: secret,
      });
      await expect(
        resolver.use(
          { ...request, useId: `secret-canary-${index}` },
          async () => Object.freeze({ capture: signature })
        )
      ).rejects.toMatchObject({
        code: AGENT_EVALUATION_RUNNER_ERROR_CODES.responseSecretLeak,
      });
    }
  });

  it('blocks copied credential bytes and sanitizes callback failures', async () => {
    const secret = 'openai-test-secret-123';
    for (const [suffix, copy] of [
      ['array', (material: Uint8Array): unknown => Array.from(material)],
      ['view', (material: Uint8Array): unknown => Uint8Array.from(material)],
      ['buffer', (material: Uint8Array): unknown => material.slice().buffer],
    ] as const) {
      const resolver = new EnvironmentAgentProviderSecretResolver({
        [definition.secretEnvironmentName]: secret,
      });
      await expect(
        resolver.use(
          { ...request, useId: `secret-byte-copy-${suffix}` },
          async (material) => copy(material)
        )
      ).rejects.toMatchObject({
        code: AGENT_EVALUATION_RUNNER_ERROR_CODES.responseSecretLeak,
      });
    }

    const resolver = new EnvironmentAgentProviderSecretResolver({
      [definition.secretEnvironmentName]: secret,
    });
    let caught: unknown;
    try {
      await resolver.use(
        { ...request, useId: 'secret-callback-error' },
        async () => {
          throw new Error(`callback echoed ${secret}`);
        }
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.transportFailed,
    });
    expect(JSON.stringify(caught)).not.toContain(secret);
  });

  it('keeps unknown thrown values out of log-safe errors', () => {
    const secret = 'openai-test-secret-123';
    const error = safeRunnerError(new Error(`upstream echoed ${secret}`));
    expect(JSON.stringify(error)).not.toContain(secret);
    expect(error.toJSON()).toEqual({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.transportFailed,
    });
  });
});
