import { describe, expect, it } from 'vitest';
import {
  decodeAgentPolicy,
  digestAgentPolicy,
  encodeAgentPolicy,
  migrateAgentPolicyWire,
  serializeAgentPolicy,
  validateAgentPolicy,
} from './agentPolicyCodec';
import { createDefaultAgentPolicy } from './agentPolicyDefaults';

describe('AgentPolicy current/wire contract', () => {
  it('round-trips the unversioned current model through wire v1', () => {
    const policy = createDefaultAgentPolicy(
      'agent.policy.default',
      'Policy <&> — 雪 😀'
    );
    const wire = encodeAgentPolicy(policy);
    expect(wire.wireVersion).toBe(1);
    expect(policy).not.toHaveProperty('wireVersion');
    expect(policy).not.toHaveProperty('version');
    expect(decodeAgentPolicy(wire)).toEqual({ ok: true, value: policy });
    expect(serializeAgentPolicy(policy)).toContain('"wireVersion":1');
    expect(digestAgentPolicy(policy)).toMatch(/^sha256-[a-f0-9]{64}$/u);
  });

  it('migrates the only admitted legacy shape with deny-by-default privacy', () => {
    const policy = createDefaultAgentPolicy('agent.policy.legacy');
    const { privacy: _privacy, ...legacy } = policy;
    const migrated = migrateAgentPolicyWire({ ...legacy, wireVersion: 0 });
    expect(migrated).toMatchObject({
      ok: true,
      value: {
        wireVersion: 1,
        privacy: {
          maximumSensitivity: 'public',
          allowedRegions: [],
          providerTraining: 'deny',
          providerTelemetry: 'deny',
          rawArtifactCapture: 'deny',
        },
      },
    });
  });

  it('fails closed on future, ambiguous, unsafe, oversized, and non-canonical values', () => {
    const policy = createDefaultAgentPolicy('agent.policy.invalid');
    const wire = encodeAgentPolicy(policy);
    expect(decodeAgentPolicy({ ...wire, wireVersion: 2 })).toMatchObject({
      ok: false,
    });
    expect(validateAgentPolicy({ ...policy, wireVersion: 1 })).toMatchObject({
      ok: false,
    });
    expect(validateAgentPolicy({ ...policy, version: 1 })).toMatchObject({
      ok: false,
    });
    expect(
      decodeAgentPolicy({ ...wire, unexpectedAuthority: true })
    ).toMatchObject({ ok: false });

    const unsafe = JSON.parse(
      JSON.stringify(wire).replace('"name":', '"__proto__":{},"name":')
    ) as unknown;
    expect(decodeAgentPolicy(unsafe)).toMatchObject({ ok: false });
    expect(
      validateAgentPolicy({ ...policy, name: 'x'.repeat(1_048_577) })
    ).toMatchObject({ ok: false });

    expect(
      validateAgentPolicy({
        ...policy,
        contextRules: {
          ...policy.contextRules,
          allowedAuthorities: ['derived', 'canonical'],
        },
      })
    ).toMatchObject({ ok: false });

    const duplicatedRuleId = {
      ...policy,
      providerRules: [
        {
          id: 'rule.duplicate',
          effect: 'deny' as const,
          providerConfigurationIds: [],
          protocolFamilies: [],
          endpointClasses: [],
          regions: [],
          minimumSupportTier: 'disabled' as const,
          maximumSensitivity: 'public' as const,
        },
      ],
      modelRules: [
        {
          id: 'rule.duplicate',
          effect: 'deny' as const,
          modelIds: [],
          modelFamilyIds: [],
          capabilityProfileIds: [],
          minimumSupportTier: 'disabled' as const,
        },
      ],
    };
    expect(validateAgentPolicy(duplicatedRuleId)).toMatchObject({ ok: false });
  });

  it('rejects accessors and non-JSON properties without evaluating them', () => {
    const policy = createDefaultAgentPolicy('agent.policy.accessor');
    let getterCalls = 0;
    const currentWithAccessor = { ...policy };
    Object.defineProperty(currentWithAccessor, 'name', {
      enumerable: true,
      get: () => {
        getterCalls += 1;
        throw new Error('must not execute');
      },
    });
    expect(validateAgentPolicy(currentWithAccessor)).toMatchObject({
      ok: false,
    });

    const wireWithAccessor = { ...encodeAgentPolicy(policy) };
    Object.defineProperty(wireWithAccessor, 'wireVersion', {
      enumerable: false,
      get: () => {
        getterCalls += 1;
        throw new Error('must not execute');
      },
    });
    expect(decodeAgentPolicy(wireWithAccessor)).toMatchObject({ ok: false });

    const currentWithSymbol = {
      ...policy,
      [Symbol('hidden')]: 'not-json',
    };
    expect(validateAgentPolicy(currentWithSymbol)).toMatchObject({ ok: false });

    const currentWithToJSON = {
      ...policy,
      toJSON: () => {
        getterCalls += 1;
        throw new Error('must not execute');
      },
    };
    expect(validateAgentPolicy(currentWithToJSON)).toMatchObject({ ok: false });
    expect(getterCalls).toBe(0);
  });
});
