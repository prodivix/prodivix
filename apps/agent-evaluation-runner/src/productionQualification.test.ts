import { readFileSync } from 'node:fs';
import {
  AGENT_PRODUCTION_EVALUATION_FACT_BACKED_OPTIONAL_CAPABILITY_PROFILES,
  AGENT_PRODUCTION_EVALUATION_OPTIONAL_CAPABILITY_PROFILES,
  AGENT_PRODUCTION_EVALUATION_PROBE_PROVIDER_RESOURCE_PROTOCOL_FAMILIES,
  AGENT_PRODUCTION_EVALUATION_RETRIEVAL_CAPABILITY_PROFILES,
  type AgentProductionEvaluationNativeProtocolFamily,
  type AgentProductionEvaluationOptionalCapabilityProfileId,
} from '@prodivix/ai';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import { describe, expect, it, vi } from 'vitest';
import type { AgentEvaluationCapabilityProbeAdmissionRequest } from './capabilityProbeAdmissionClient';
import type { AgentEvaluationCapabilityProbeAdmissionResponse } from './capabilityProbeAdmissionHttpClient';
import { AGENT_EVALUATION_RUNNER_ERROR_CODES } from './errors';
import {
  AGENT_EVALUATION_PREPLAN_MAXIMUM_DURATION_MS,
  AGENT_EVALUATION_PRODUCTION_RUN_CONFIG_FILE_NAME,
  createAgentEvaluationProductionQualificationDocument,
  produceEnvironmentAgentEvaluationProductionRunConfig,
  type AgentEvaluationProductionQualificationClients,
  type AgentEvaluationProductionQualificationFilePort,
} from './productionQualification';
import {
  createAgentEvaluationTestProbeProviderResourceAuthorityBundle,
  createAgentEvaluationTestQualificationAuthorityBundle,
  refreshAgentEvaluationTestMaterialCatalogDigests,
} from './runConfig.fixture';
import {
  createAgentEvaluationNativeProviderStateVaultEncryptionProfile,
  decodeAgentEvaluationRunConfigQualificationTemplate,
} from './runConfig';
import type { AgentEvaluationRuntimeFactSourceRegistrationRequest } from './runtimeFactSourceRegistration';
import type { AgentEvaluationRuntimeFactSourceRegistration } from './runtimeFactSourceRegistrationClient';

const namespaceId = 'evaluation.production-qualification.test';
const exactCommit = '0123456789abcdef0123456789abcdef01234567';
const startedAt = '2026-08-08T00:00:00.000Z';
const completedAt = '2026-08-08T00:01:00.000Z';
const examplePath = new URL(
  '../../../specs/evaluation/g4-real-model-evaluation.example.json',
  import.meta.url
);

const templateDocument = (): Record<string, unknown> => {
  const template = JSON.parse(readFileSync(examplePath, 'utf8')) as Record<
    string,
    unknown
  >;
  refreshAgentEvaluationTestMaterialCatalogDigests(template);
  return template;
};

const protocolForProvider = (
  protocolsByProvider: ReadonlyMap<
    string,
    AgentProductionEvaluationNativeProtocolFamily
  >,
  providerConfigurationId: string
): AgentProductionEvaluationNativeProtocolFamily => {
  const family = protocolsByProvider.get(providerConfigurationId);
  if (
    family !== 'openai-responses' &&
    family !== 'anthropic-messages' &&
    family !== 'gemini-interactions'
  ) {
    throw new TypeError('Test provider protocol is unavailable.');
  }
  return family;
};

type QualificationCallScheduler = <T>(
  call: string,
  operation: () => T | Promise<T>
) => Promise<T>;

const runImmediately: QualificationCallScheduler = async (_call, operation) =>
  operation();

const clientsFor = (
  template: ReturnType<typeof templateDocument>,
  calls: string[],
  options: Readonly<{
    scheduler?: QualificationCallScheduler;
    minimumExpiresAts?: string[];
  }> = Object.freeze({})
): AgentEvaluationProductionQualificationClients => {
  const bundle =
    createAgentEvaluationTestQualificationAuthorityBundle(template);
  const resourceBundle =
    createAgentEvaluationTestProbeProviderResourceAuthorityBundle(template);
  const schedule = options.scheduler ?? runImmediately;
  const protocolsByProvider = new Map(
    decodeAgentEvaluationRunConfigQualificationTemplate(
      template
    ).nativeIdentities.map((identity) => [
      identity.providerConfigurationId,
      identity.protocolFamily,
    ])
  );
  return Object.freeze({
    async prepareProbeProviderResourceAuthorities(input) {
      await Promise.all(
        input.providerLanes.map(async ({ protocolFamily }) => {
          for (const profileId of AGENT_PRODUCTION_EVALUATION_RETRIEVAL_CAPABILITY_PROFILES) {
            const call = `resource:${protocolFamily}:${profileId}`;
            calls.push(call);
            options.minimumExpiresAts?.push(input.minimumExpiresAt);
            await schedule(call, () => undefined);
          }
        })
      );
      return Object.freeze({ authorities: resourceBundle.authorities });
    },
    async cleanupProbeProviderResourceAuthorities(input) {
      await Promise.all(
        input.providerLanes.map(async ({ protocolFamily }) => {
          for (const profileId of AGENT_PRODUCTION_EVALUATION_RETRIEVAL_CAPABILITY_PROFILES) {
            const call = `cleanup:${protocolFamily}:${profileId}`;
            calls.push(call);
            await schedule(call, () => undefined);
          }
        })
      );
      return resourceBundle;
    },
    runtimeFactSourceRegistration: Object.freeze({
      async register(
        request: AgentEvaluationRuntimeFactSourceRegistrationRequest
      ) {
        const call = `register:${request.protocolFamily}:${request.capabilityProfileId}`;
        calls.push(call);
        options.minimumExpiresAts?.push(request.minimumExpiresAt);
        return schedule(call, () => {
          const authority =
            bundle.runtimeFactSourceAuthorities[request.protocolFamily][
              request.capabilityProfileId
            ];
          return Object.freeze({
            authority,
            receipt: Object.freeze({}),
          }) as unknown as AgentEvaluationRuntimeFactSourceRegistration;
        });
      },
    }),
    capabilityProbeAdmission: Object.freeze({
      async admit(request: AgentEvaluationCapabilityProbeAdmissionRequest) {
        const protocolFamily = protocolForProvider(
          protocolsByProvider,
          request.providerConfiguration.providerConfigurationId
        );
        const profileId =
          request.qualificationCapabilityProfileId as AgentProductionEvaluationOptionalCapabilityProfileId;
        const expectedResourceAuthority =
          AGENT_PRODUCTION_EVALUATION_PROBE_PROVIDER_RESOURCE_PROTOCOL_FAMILIES.includes(
            protocolFamily as (typeof AGENT_PRODUCTION_EVALUATION_PROBE_PROVIDER_RESOURCE_PROTOCOL_FAMILIES)[number]
          ) &&
          AGENT_PRODUCTION_EVALUATION_RETRIEVAL_CAPABILITY_PROFILES.includes(
            profileId as (typeof AGENT_PRODUCTION_EVALUATION_RETRIEVAL_CAPABILITY_PROFILES)[number]
          )
            ? resourceBundle.authorities[
                protocolFamily as (typeof AGENT_PRODUCTION_EVALUATION_PROBE_PROVIDER_RESOURCE_PROTOCOL_FAMILIES)[number]
              ][
                profileId as (typeof AGENT_PRODUCTION_EVALUATION_RETRIEVAL_CAPABILITY_PROFILES)[number]
              ]
            : null;
        expect(request.probeProviderResourceAuthority).toEqual(
          expectedResourceAuthority
        );
        const call = `probe:${protocolFamily}:${profileId}`;
        calls.push(call);
        options.minimumExpiresAts?.push(request.minimumExpiresAt);
        return schedule(
          call,
          () =>
            Object.freeze({
              probeEvidence:
                bundle.capabilityProbeAuthorities[protocolFamily][profileId],
            }) as unknown as AgentEvaluationCapabilityProbeAdmissionResponse
        );
      },
    }),
  });
};

describe('production qualification pre-plan orchestration', () => {
  it('seals 4 resources, 15 runtime sources, and 18 probes before freezing one production document', async () => {
    const template = templateDocument();
    const calls: string[] = [];
    const clock = vi
      .fn<() => string>()
      .mockReturnValueOnce(startedAt)
      .mockReturnValueOnce(startedAt);
    const result = await createAgentEvaluationProductionQualificationDocument({
      templateDocument: template,
      namespaceId,
      clock,
      clients: clientsFor(template, calls),
    });

    expect(calls).toHaveLength(41);
    expect(
      calls.slice(0, 4).every((call) => call.startsWith('resource:'))
    ).toBe(true);
    expect(
      calls.slice(4, 19).every((call) => call.startsWith('register:'))
    ).toBe(true);
    expect(calls.slice(19, 37).every((call) => call.startsWith('probe:'))).toBe(
      true
    );
    expect(calls.slice(37).every((call) => call.startsWith('cleanup:'))).toBe(
      true
    );
    expect(new Set(calls)).toHaveProperty('size', 41);
    expect(result).toMatchObject({
      replayed: false,
      config: {
        purpose: 'production',
        plan: { capabilityQualificationTargets: expect.any(Array) },
      },
      document: {
        purpose: 'production',
        plannedAt: startedAt,
        expiresAt: '2026-08-15T00:00:00.000Z',
      },
    });
    expect(result.config.plan.capabilityQualificationTargets).toHaveLength(27);
    expect(result.config.qualificationAuthorityBundle).toEqual(
      createAgentEvaluationTestQualificationAuthorityBundle(template)
    );
    expect(result.config.probeProviderResourceAuthorityBundle).toEqual(
      createAgentEvaluationTestProbeProviderResourceAuthorityBundle(template)
    );
    expect(result.config.nativeProviderStateVaultEncryption).toEqual(
      createAgentEvaluationNativeProviderStateVaultEncryptionProfile()
    );
    expect(result.document.nativeProviderStateVaultEncryption).toEqual(
      result.config.nativeProviderStateVaultEncryption
    );
    expect(clock).toHaveBeenCalledTimes(2);
  }, 15_000);

  it('reuses an exact generated config before reading credentials or dispatching qualification', async () => {
    const template = templateDocument();
    const calls: string[] = [];
    const created = await createAgentEvaluationProductionQualificationDocument({
      templateDocument: template,
      namespaceId,
      clock: vi
        .fn<() => string>()
        .mockReturnValueOnce(startedAt)
        .mockReturnValueOnce(completedAt),
      clients: clientsFor(template, calls),
    });
    const filePort: AgentEvaluationProductionQualificationFilePort =
      Object.freeze({
        readCanonicalJson: async () => template,
        readExistingCanonicalJson: async () =>
          JSON.parse(canonicalJsonText(created.document)) as unknown,
        createCanonicalJson: vi.fn(async () => undefined),
      });
    const replay = await produceEnvironmentAgentEvaluationProductionRunConfig({
      templatePath: 'g4-template.json',
      outputPath: AGENT_EVALUATION_PRODUCTION_RUN_CONFIG_FILE_NAME,
      environment: Object.freeze({}),
      filePort,
      clock: () => {
        throw new Error('replay must preserve the original plannedAt');
      },
    });

    expect(replay.replayed).toBe(true);
    expect(replay.config.frozenRunDigest).toBe(created.config.frozenRunDigest);
    expect(replay.config.nativeProviderStateVaultEncryption).toEqual(
      created.config.nativeProviderStateVaultEncryption
    );
    expect(filePort.createCanonicalJson).not.toHaveBeenCalled();
  }, 15_000);

  it('fails closed before network dispatch when the real provider-resource preparation port is absent', async () => {
    const template = templateDocument();
    const fetchImplementation = vi.fn<typeof fetch>();
    const filePort: AgentEvaluationProductionQualificationFilePort =
      Object.freeze({
        readCanonicalJson: async () => template,
        readExistingCanonicalJson: async () => undefined,
        createCanonicalJson: vi.fn(async () => undefined),
      });

    await expect(
      produceEnvironmentAgentEvaluationProductionRunConfig({
        templatePath: 'g4-template.json',
        outputPath: AGENT_EVALUATION_PRODUCTION_RUN_CONFIG_FILE_NAME,
        environment: Object.freeze({
          PRODIVIX_G4_MODEL_EVAL_SERVICE_BASE_URL: 'http://127.0.0.1:8790',
          PRODIVIX_G4_MODEL_EVAL_NAMESPACE: namespaceId,
          PRODIVIX_G4_MODEL_EVAL_REPOSITORY_COMMIT: exactCommit,
        }),
        fetch: fetchImplementation,
        filePort,
        clock: () => startedAt,
      })
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.productionShardRuntimeUnavailable,
    });
    expect(fetchImplementation).not.toHaveBeenCalled();
    expect(filePort.createCanonicalJson).not.toHaveBeenCalled();
  });

  it('rejects a cross-provider resource authority before registration or probe dispatch', async () => {
    const template = templateDocument();
    const calls: string[] = [];
    const valid =
      createAgentEvaluationTestProbeProviderResourceAuthorityBundle(template);
    const swapped = Object.freeze({
      authorities: Object.freeze({
        ...valid.authorities,
        'openai-responses': Object.freeze({
          ...valid.authorities['openai-responses'],
          'g4-provider-hosted-retrieval-core':
            valid.authorities['gemini-interactions'][
              'g4-provider-hosted-retrieval-core'
            ],
        }),
      }),
    });
    const clients = clientsFor(template, calls);

    await expect(
      createAgentEvaluationProductionQualificationDocument({
        templateDocument: template,
        namespaceId,
        clock: () => startedAt,
        clients: Object.freeze({
          ...clients,
          prepareProbeProviderResourceAuthorities: async () => swapped,
        }),
      })
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid,
    });
    expect(calls).toHaveLength(0);
  });

  it('rejects a swapped existing qualification bundle before any new dispatch', async () => {
    const template = templateDocument();
    const calls: string[] = [];
    const created = await createAgentEvaluationProductionQualificationDocument({
      templateDocument: template,
      namespaceId,
      clock: vi
        .fn<() => string>()
        .mockReturnValueOnce(startedAt)
        .mockReturnValueOnce(completedAt),
      clients: clientsFor(template, calls),
    });
    const swapped = structuredClone(created.document) as Record<
      string,
      unknown
    >;
    const bundle = swapped.qualificationAuthorityBundle as Record<
      string,
      unknown
    >;
    bundle.bundleDigest = `sha256-${'f'.repeat(64)}`;
    const filePort: AgentEvaluationProductionQualificationFilePort =
      Object.freeze({
        readCanonicalJson: async () => template,
        readExistingCanonicalJson: async () => swapped,
        createCanonicalJson: vi.fn(async () => undefined),
      });

    await expect(
      produceEnvironmentAgentEvaluationProductionRunConfig({
        templatePath: 'g4-template.json',
        outputPath: AGENT_EVALUATION_PRODUCTION_RUN_CONFIG_FILE_NAME,
        environment: Object.freeze({}),
        filePort,
      })
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid,
    });
    expect(filePort.createCanonicalJson).not.toHaveBeenCalled();
    expect(calls).toHaveLength(41);
  }, 15_000);

  it('uses at most three canonical provider lanes and ignores lane completion order in frozen bytes', async () => {
    const template = templateDocument();
    const runWithDelays = async (
      delays: Readonly<
        Record<AgentProductionEvaluationNativeProtocolFamily, number>
      >
    ) => {
      const calls: string[] = [];
      let active = 0;
      let maximumActive = 0;
      const scheduler: QualificationCallScheduler = async (call, operation) => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        const protocolFamily = call.split(':')[1];
        if (
          protocolFamily !== 'openai-responses' &&
          protocolFamily !== 'anthropic-messages' &&
          protocolFamily !== 'gemini-interactions'
        ) {
          throw new TypeError('Unexpected protocol family.');
        }
        try {
          await new Promise((resolve) =>
            setTimeout(resolve, delays[protocolFamily])
          );
          return await operation();
        } finally {
          active -= 1;
        }
      };
      const result = await createAgentEvaluationProductionQualificationDocument(
        {
          templateDocument: template,
          namespaceId,
          clock: vi
            .fn<() => string>()
            .mockReturnValueOnce(startedAt)
            .mockReturnValueOnce(completedAt),
          clients: clientsFor(template, calls, { scheduler }),
        }
      );
      return Object.freeze({ result, calls, maximumActive });
    };
    const forward = await runWithDelays({
      'openai-responses': 1,
      'anthropic-messages': 2,
      'gemini-interactions': 3,
    });
    const reverse = await runWithDelays({
      'openai-responses': 3,
      'anthropic-messages': 2,
      'gemini-interactions': 1,
    });

    expect(forward.maximumActive).toBe(3);
    expect(reverse.maximumActive).toBe(3);
    expect(
      forward.calls.slice(0, 4).every((call) => call.startsWith('resource:'))
    ).toBe(true);
    expect(
      reverse.calls.slice(0, 4).every((call) => call.startsWith('resource:'))
    ).toBe(true);
    expect(
      forward.calls.slice(4, 19).every((call) => call.startsWith('register:'))
    ).toBe(true);
    expect(
      reverse.calls.slice(4, 19).every((call) => call.startsWith('register:'))
    ).toBe(true);
    expect(canonicalJsonText(forward.result.document)).toBe(
      canonicalJsonText(reverse.result.document)
    );
  }, 30_000);

  it('accepts 29:59.999, freezes one expiry lower bound, and fails closed at 30:00.000', async () => {
    const template = templateDocument();
    const acceptedCalls: string[] = [];
    const minimumExpiresAts: string[] = [];
    const acceptedAt = '2026-08-08T00:29:59.999Z';
    const accepted = await createAgentEvaluationProductionQualificationDocument(
      {
        templateDocument: template,
        namespaceId,
        clock: vi
          .fn<() => string>()
          .mockReturnValueOnce(startedAt)
          .mockReturnValueOnce(acceptedAt),
        clients: clientsFor(template, acceptedCalls, { minimumExpiresAts }),
      }
    );

    expect(accepted.document).toMatchObject({
      plannedAt: acceptedAt,
      expiresAt: '2026-08-15T00:29:59.999Z',
    });
    expect(new Set(minimumExpiresAts)).toEqual(
      new Set(['2026-08-15T00:30:00.000Z'])
    );
    expect(minimumExpiresAts).toHaveLength(37);
    expect(
      Date.parse(minimumExpiresAts[0] ?? '') -
        Date.parse(accepted.config.plan.expiresAt)
    ).toBe(1);

    const rejectedCalls: string[] = [];
    await expect(
      createAgentEvaluationProductionQualificationDocument({
        templateDocument: template,
        namespaceId,
        clock: vi
          .fn<() => string>()
          .mockReturnValueOnce(startedAt)
          .mockReturnValueOnce(
            new Date(
              Date.parse(startedAt) +
                AGENT_EVALUATION_PREPLAN_MAXIMUM_DURATION_MS
            ).toISOString()
          ),
        clients: clientsFor(template, rejectedCalls),
      })
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.productionShardRuntimeUnavailable,
    });
    expect(rejectedCalls).toHaveLength(
      AGENT_PRODUCTION_EVALUATION_PROBE_PROVIDER_RESOURCE_PROTOCOL_FAMILIES.length *
        AGENT_PRODUCTION_EVALUATION_RETRIEVAL_CAPABILITY_PROFILES.length *
        2 +
        3 *
          (AGENT_PRODUCTION_EVALUATION_FACT_BACKED_OPTIONAL_CAPABILITY_PROFILES.length +
            AGENT_PRODUCTION_EVALUATION_OPTIONAL_CAPABILITY_PROFILES.length)
    );
  }, 30_000);
});
