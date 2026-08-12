import { describe, expect, it } from 'vitest';
import { digestAgentCanonicalValue } from '../domain/agentCanonical';
import {
  AGENT_CAPABILITY_PROBE_PROFILE_IDS,
  createAgentCapabilityProbeNormalizedObservationSourceProjection,
  createAgentCapabilityProbeProgram,
  createAgentCapabilityProbeProgramObservation,
  createAgentCapabilityProbeObservedLimits,
  createAgentCapabilityProbeProgramReceipt,
  createAgentCapabilityProbeSupportedSemanticProof,
  digestAgentCapabilityProbeNormalizedObservationSourceProjection,
  digestAgentCapabilityProbeProfile,
  isAgentCapabilityProbeNormalizedObservationSourceProjection,
  isAgentCapabilityProbeProgram,
  isAgentCapabilityProbeProgramObservation,
  matchAgentCapabilityProbeSemanticProofPhaseLeaves,
  projectAgentCapabilityProbeNormalizedObservationSource,
  projectAgentCapabilityProbeSemanticProofPhaseLeaves,
  resolveAgentCapabilityProbeNetworkRoundTripPhase,
  resolveAgentCapabilityProbeCachePrefixMaterial,
  validateAgentCapabilityProbeNetworkRoundTripSequence,
  resolveAgentCapabilityProbePublicResource,
  type AgentCapabilityProbeProgram,
} from './agentCapabilityProbeProgram';

const digest = (label: string) => digestAgentCanonicalValue({ label });
const observedAt = '2026-08-09T02:00:00.000Z';
const expiresAt = '2026-08-10T02:00:00.000Z';

const programFor = (
  capabilityProfileId: (typeof AGENT_CAPABILITY_PROBE_PROFILE_IDS)[number]
) =>
  createAgentCapabilityProbeProgram({
    capabilityProfileId,
    capabilityProfileDigest:
      digestAgentCapabilityProbeProfile(capabilityProfileId),
  });

const supportedFacts = (program: AgentCapabilityProbeProgram) =>
  Object.freeze(
    program.observationContract.supportedRequirements.flatMap((requirement) =>
      Array.from({ length: requirement.minimumCount }, (_, index) =>
        Object.freeze({
          factKind: requirement.factKind,
          factDigest: digest(
            `${program.programId}.${requirement.factKind}.${index}`
          ),
          providerEventType: requirement.providerEventType,
        })
      )
    )
  );

const supportedSemanticProof = (
  program: AgentCapabilityProbeProgram,
  facts: ReturnType<typeof supportedFacts>
) => {
  const factDigest = (factKind: string) =>
    facts.find((fact) => fact.factKind === factKind)!.factDigest;
  switch (program.profileProjection.capabilityProfileId) {
    case 'g4-provider-background-job':
      return createAgentCapabilityProbeSupportedSemanticProof(program, {
        proofKind: 'background-job-lifecycle',
        jobReceiptDigest: factDigest('provider-job-receipt'),
        jobIdDigest: digest(`${program.programId}.job-id`),
        submitRequestDigest: digest(`${program.programId}.submit`),
        pollResponseDigest: digest(`${program.programId}.poll`),
        terminalResponseDigest: digest(
          `${program.programId}.terminal-response`
        ),
      });
    case 'g4-provider-hosted-retrieval-core':
    case 'g4-provider-hosted-retrieval-document': {
      const resource = program.providerRequestIntent.publicProbeResource!;
      return createAgentCapabilityProbeSupportedSemanticProof(program, {
        proofKind:
          program.profileProjection.capabilityProfileId ===
          'g4-provider-hosted-retrieval-core'
            ? 'hosted-retrieval-public-text'
            : 'hosted-retrieval-public-document',
        retrievalQueryReceiptDigest: factDigest('retrieval-query-receipt'),
        resourceDescriptorDigest: resource.descriptorDigest,
        queryDigest: resource.queryDigest,
        indexDigest: resource.indexDigest,
        expectedMarkerDigest: resource.expectedMarkerDigest,
        resultMarkerDigest: resource.expectedMarkerDigest,
        documentBytesDigest: resource.documentBytesDigest,
        providerResponseDigest: digest(
          `${program.programId}.provider-response`
        ),
      });
    }
    case 'g4-provider-isolated-cache': {
      const descriptor = program.providerRequestIntent.cachePrefixResource!;
      return createAgentCapabilityProbeSupportedSemanticProof(program, {
        proofKind: 'isolated-cache-roundtrip',
        cacheReceiptDigest: factDigest('provider-cache-receipt'),
        usageVectorDigest: factDigest('usage-vector'),
        cachePrefixDescriptorDigest: descriptor.descriptorDigest,
        coldPrefixDigest: descriptor.prefixDigest,
        warmPrefixDigest: descriptor.prefixDigest,
        coldSuffixDigest: descriptor.coldSuffixDigest,
        warmSuffixDigest: descriptor.warmSuffixDigest,
        cacheKeyDigest: digest(`${program.programId}.cache-key`),
        coldResponseDigest: digest(`${program.programId}.cold-response`),
        warmResponseDigest: digest(`${program.programId}.warm-response`),
        usageDeltaDigest: digest(`${program.programId}.usage-delta`),
        isolationScopeDigest: digest(`${program.programId}.isolation-scope`),
        coldCachedTokenCount: 0,
        warmCachedTokenCount: 1,
        cacheHitObserved: true,
      });
    }
    case 'g4-provider-parallel-tool':
      return createAgentCapabilityProbeSupportedSemanticProof(program, {
        proofKind: 'parallel-tool-call-set',
        providerResponseDigest: digest(
          `${program.programId}.provider-response`
        ),
        toolCalls: Object.freeze(
          program.providerRequestIntent.requiredToolNames.map(
            (toolName, index) =>
              Object.freeze({
                toolName,
                toolCallId: `probe-tool-call-${index + 1}`,
                factDigest: facts[index]!.factDigest,
              })
          )
        ),
      });
    case 'g4-provider-reasoning-continuation':
      return createAgentCapabilityProbeSupportedSemanticProof(program, {
        proofKind: 'opaque-continuation-roundtrip',
        continuationFactDigest: factDigest('opaque-continuation'),
        parentResponseDigest: digest(`${program.programId}.parent-response`),
        opaqueHandleDigest: digest(`${program.programId}.opaque-handle`),
        resumeRequestDigest: digest(`${program.programId}.resume-request`),
        resumeResponseDigest: digest(`${program.programId}.resume-response`),
      });
  }
};

const observedLimitsFor = (
  program: AgentCapabilityProbeProgram,
  normalizedFactCount: number
) =>
  createAgentCapabilityProbeObservedLimits(program, {
    requestBytes: 1_024,
    responseBytes: 4_096,
    normalizedFactCount,
    toolCallCount: program.providerRequestIntent.requiredToolNames.length,
    providerRoundTripCount: Math.min(
      2,
      program.hardLimits.maximumProviderRoundTrips
    ),
    pollAttemptCount:
      program.profileProjection.capabilityProfileId ===
      'g4-provider-background-job'
        ? 1
        : 0,
    observedMaximumSingleDispatchMs: 1_000,
    observedExecutionDurationMs: 2_000,
  });

const observationFor = (
  program: AgentCapabilityProbeProgram,
  status: 'supported' | 'unsupported' | 'inconclusive'
) =>
  (() => {
    const observedFacts =
      status === 'supported' ? supportedFacts(program) : Object.freeze([]);
    const providerResponseDigest = digest(`${program.programId}.response`);
    return createAgentCapabilityProbeProgramObservation(program, {
      providerConfigurationDigest: digest('provider-configuration'),
      modelLineageDigest: digest('model-lineage'),
      adapterDigest: digest('adapter'),
      probeRequestDigest: digest(`${program.programId}.request`),
      providerResponseDigest,
      normalizedEventSetDigest: digest(`${program.programId}.normalized`),
      status,
      observedFacts,
      semanticProof:
        status === 'supported'
          ? supportedSemanticProof(program, observedFacts)
          : null,
      denial:
        status === 'supported'
          ? null
          : Object.freeze({
              denialKind:
                status === 'unsupported'
                  ? ('provider-feature-unavailable' as const)
                  : ('provider-response-unavailable' as const),
              denialFactDigest: digest(`${program.programId}.${status}`),
            }),
      observedLimits: observedLimitsFor(program, observedFacts.length),
      observedAt,
    });
  })();

describe('canonical optional capability probe programs', () => {
  it('maps synchronous probes to one network row and background to bounded repeated polls', () => {
    for (const profileId of [
      'g4-provider-hosted-retrieval-core',
      'g4-provider-hosted-retrieval-document',
      'g4-provider-parallel-tool',
    ] as const) {
      const program = programFor(profileId);
      expect(program.providerRequestIntent.requestPhases).toEqual([
        'dispatch-terminal',
      ]);
      expect(resolveAgentCapabilityProbeNetworkRoundTripPhase(program, 0)).toBe(
        'dispatch-terminal'
      );
      expect(resolveAgentCapabilityProbeNetworkRoundTripPhase(program, 1)).toBe(
        null
      );
    }
    const background = programFor('g4-provider-background-job');
    expect(
      Array.from({ length: 5 }, (_, sequence) =>
        resolveAgentCapabilityProbeNetworkRoundTripPhase(background, sequence)
      )
    ).toEqual(['submit', 'poll', 'poll', 'poll', 'poll']);
    expect(
      resolveAgentCapabilityProbeNetworkRoundTripPhase(background, 5)
    ).toBe(null);
    expect(() =>
      createAgentCapabilityProbeObservedLimits(background, {
        requestBytes: 1_024,
        responseBytes: 4_096,
        normalizedFactCount: 0,
        toolCallCount: 0,
        providerRoundTripCount: 4,
        pollAttemptCount: 1,
        observedMaximumSingleDispatchMs: 1_000,
        observedExecutionDurationMs: 4_000,
      })
    ).toThrow(/roundtrips drifted/u);
    expect(
      validateAgentCapabilityProbeNetworkRoundTripSequence(
        background,
        Object.freeze([
          Object.freeze({
            phase: 'submit' as const,
            sequence: 0,
            outcome: 'completed' as const,
            programTerminal: false,
            providerJobStatus: 'queued' as const,
          }),
          Object.freeze({
            phase: 'poll' as const,
            sequence: 1,
            outcome: 'completed' as const,
            programTerminal: false,
            providerJobStatus: 'in-progress' as const,
          }),
          Object.freeze({
            phase: 'poll' as const,
            sequence: 2,
            outcome: 'completed' as const,
            programTerminal: true,
            providerJobStatus: 'completed' as const,
          }),
        ])
      )
    ).toHaveLength(3);
    expect(() =>
      validateAgentCapabilityProbeNetworkRoundTripSequence(
        background,
        Object.freeze([
          Object.freeze({
            phase: 'submit' as const,
            sequence: 0,
            outcome: 'completed' as const,
            programTerminal: true,
            providerJobStatus: 'queued' as const,
          }),
        ])
      )
    ).toThrow(/incomplete or invalid/u);
  });

  it('freezes six explicit sanitized programs with bounded provider intents', () => {
    const programs = AGENT_CAPABILITY_PROBE_PROFILE_IDS.map(programFor);
    expect(programs).toHaveLength(6);
    expect(
      new Set(programs.map(({ programDigest }) => programDigest)).size
    ).toBe(6);
    expect(
      programs.map(({ profileProjection }) => profileProjection.capabilityId)
    ).toEqual([
      'provider.background-job',
      'provider.hosted-retrieval',
      'provider.hosted-retrieval',
      'provider.isolated-cache',
      'provider.parallel-tool',
      'provider.reasoning-continuation',
    ]);
    expect(programs.every(isAgentCapabilityProbeProgram)).toBe(true);
    expect(
      programs.every(
        ({ hardLimits, providerRequestIntent }) =>
          providerRequestIntent.publicPayload.marker ===
            'prodivix-capability-probe-v1' &&
          providerRequestIntent.publicPayload.instruction.length > 0 &&
          hardLimits.maximumSingleDispatchMs === 30_000 &&
          hardLimits.maximumExecutionDurationMs === 120_000
      )
    ).toBe(true);
    const retrievalPrograms = programs.filter(
      ({ profileProjection }) =>
        profileProjection.capabilityId === 'provider.hosted-retrieval'
    );
    expect(retrievalPrograms).toHaveLength(2);
    expect(
      retrievalPrograms.every(
        ({ providerRequestIntent }) =>
          providerRequestIntent.publicProbeResource !== null
      )
    ).toBe(true);
    expect(
      programFor('g4-provider-hosted-retrieval-document').providerRequestIntent
        .publicProbeResource?.documentBytesDigest
    ).toBeTypeOf('string');
    expect(
      programFor('g4-provider-hosted-retrieval-core').providerRequestIntent
        .publicProbeResource?.documentBytesDigest
    ).toBeNull();
    const cache = programFor('g4-provider-isolated-cache');
    const cacheMaterial =
      resolveAgentCapabilityProbeCachePrefixMaterial(cache)!;
    expect(cache.hardLimits.maximumRequestBytes).toBe(65_536);
    expect(cacheMaterial.descriptor).toEqual(
      cache.providerRequestIntent.cachePrefixResource
    );
    expect(new TextEncoder().encode(cacheMaterial.prefixText).length).toBe(
      cacheMaterial.descriptor.prefixByteLength
    );
    expect(cacheMaterial.descriptor.minimumTokenCountByProtocol).toEqual({
      'anthropic-messages': 4096,
      'gemini-interactions': 4096,
      'openai-responses': 1024,
    });
    expect(cacheMaterial.coldSuffixText).not.toBe(cacheMaterial.warmSuffixText);
    expect(
      resolveAgentCapabilityProbeCachePrefixMaterial(programs[0]!)
    ).toBeNull();
  });

  it('accepts supported only from the exact required normalized facts', () => {
    for (const capabilityProfileId of AGENT_CAPABILITY_PROBE_PROFILE_IDS) {
      const program = programFor(capabilityProfileId);
      const observation = observationFor(program, 'supported');
      expect(
        isAgentCapabilityProbeProgramObservation(observation, program),
        capabilityProfileId
      ).toBe(true);
      const sourceProjection =
        projectAgentCapabilityProbeNormalizedObservationSource(
          observation,
          program
        );
      expect(
        isAgentCapabilityProbeNormalizedObservationSourceProjection(
          sourceProjection,
          program
        )
      ).toBe(true);
      expect(sourceProjection).not.toHaveProperty('normalizedEventSetDigest');
      expect(sourceProjection).not.toHaveProperty('observationDigest');
      expect(Object.keys(sourceProjection)).toHaveLength(17);
      const {
        format: _format,
        version: _version,
        observationSource: _observationSource,
        probeProgramDigest: _probeProgramDigest,
        profileProjectionDigest: _profileProjectionDigest,
        observedLimitDigest: _observedLimitDigest,
        ...sourceInput
      } = sourceProjection;
      expect(
        createAgentCapabilityProbeNormalizedObservationSourceProjection(
          program,
          sourceInput
        )
      ).toEqual(sourceProjection);
      expect(
        digestAgentCapabilityProbeNormalizedObservationSourceProjection(
          sourceProjection,
          program
        )
      ).toBe(digestAgentCanonicalValue(sourceProjection));
      const receipt = createAgentCapabilityProbeProgramReceipt({
        probeId: `probe.${capabilityProfileId}`,
        program,
        observation,
        declaredCapabilityProfileDigests: Object.freeze([
          program.profileProjection.capabilityProfileDigest,
        ]),
        probedAt: observedAt,
        expiresAt,
      });
      expect(receipt).toMatchObject({
        status: 'supported',
        probeProgramDigest: program.programDigest,
        profileProjectionDigest: program.profileProjectionDigest,
        normalizedObservationDigest: observation.observationDigest,
        observedProfileDigest:
          program.profileProjection.capabilityProfileDigest,
      });
      const phaseLeaves = projectAgentCapabilityProbeSemanticProofPhaseLeaves(
        program,
        observation.semanticProof!
      );
      expect(
        phaseLeaves.responsePhaseDigests.every(
          ({ digest: phaseDigest }) =>
            phaseDigest !== observation.providerResponseDigest
        )
      ).toBe(true);
    }
  });

  it('keeps raw semantic phase leaves separate from outer response roots and rejects a leaf swap join', () => {
    for (const capabilityProfileId of AGENT_CAPABILITY_PROBE_PROFILE_IDS) {
      const program = programFor(capabilityProfileId);
      const observation = observationFor(program, 'supported');
      const proof = observation.semanticProof!;
      const phaseLeaves = projectAgentCapabilityProbeSemanticProofPhaseLeaves(
        program,
        proof
      );
      const { proofDigest: _proofDigest, ...proofInput } = proof;
      const swappedInput = (() => {
        switch (proofInput.proofKind) {
          case 'background-job-lifecycle':
            return {
              ...proofInput,
              terminalResponseDigest: digest('swapped-terminal-response'),
            };
          case 'hosted-retrieval-public-document':
          case 'hosted-retrieval-public-text':
          case 'parallel-tool-call-set':
            return {
              ...proofInput,
              providerResponseDigest: digest('swapped-provider-response'),
            };
          case 'isolated-cache-roundtrip':
            return {
              ...proofInput,
              warmResponseDigest: digest('swapped-warm-response'),
            };
          case 'opaque-continuation-roundtrip':
            return {
              ...proofInput,
              resumeResponseDigest: digest('swapped-resume-response'),
            };
        }
      })();
      const swappedProof = createAgentCapabilityProbeSupportedSemanticProof(
        program,
        swappedInput
      );
      expect(
        matchAgentCapabilityProbeSemanticProofPhaseLeaves(
          program,
          swappedProof,
          phaseLeaves
        )
      ).toBe(false);
    }
  });

  it('resolves retrieval material through the canonical repo-owned resource registry', () => {
    const core = programFor('g4-provider-hosted-retrieval-core');
    const document = programFor('g4-provider-hosted-retrieval-document');
    const coreMaterial = resolveAgentCapabilityProbePublicResource(core);
    const documentMaterial =
      resolveAgentCapabilityProbePublicResource(document);
    expect(coreMaterial).toMatchObject({
      descriptor: core.providerRequestIntent.publicProbeResource,
      documentText: null,
    });
    expect(documentMaterial).toMatchObject({
      descriptor: document.providerRequestIntent.publicProbeResource,
      documentText:
        'Public capability probe document. Marker: prodivix-capability-probe-v1.',
    });
    expect(
      resolveAgentCapabilityProbePublicResource(
        programFor('g4-provider-background-job')
      )
    ).toBeNull();
  });

  it('rejects fully recomputed profile proof drift, extra facts, and limit overflow', () => {
    for (const capabilityProfileId of AGENT_CAPABILITY_PROBE_PROFILE_IDS) {
      const program = programFor(capabilityProfileId);
      const observation = observationFor(program, 'supported');
      const proof = observation.semanticProof!;
      const { proofDigest: _proofDigest, ...proofInput } = proof;
      const tamperedProofInput = (() => {
        switch (proofInput.proofKind) {
          case 'background-job-lifecycle':
            return { ...proofInput, jobReceiptDigest: digest('swap') };
          case 'hosted-retrieval-public-document':
          case 'hosted-retrieval-public-text':
            return { ...proofInput, queryDigest: digest('swap') };
          case 'isolated-cache-roundtrip':
            return { ...proofInput, usageVectorDigest: digest('swap') };
          case 'parallel-tool-call-set':
            return {
              ...proofInput,
              toolCalls: proofInput.toolCalls.map((call, index) => ({
                ...call,
                toolName: `wrong_probe_tool_${index + 1}`,
              })),
            };
          case 'opaque-continuation-roundtrip':
            return { ...proofInput, continuationFactDigest: digest('swap') };
        }
      })();
      const tamperedProof = createAgentCapabilityProbeSupportedSemanticProof(
        program,
        tamperedProofInput
      );
      const {
        format: _format,
        version: _version,
        observationSource: _observationSource,
        probeProgramDigest: _probeProgramDigest,
        profileProjectionDigest: _profileProjectionDigest,
        observedLimitDigest: _observedLimitDigest,
        observationDigest: _observationDigest,
        ...observationInput
      } = observation;
      expect(() =>
        createAgentCapabilityProbeProgramObservation(program, {
          ...observationInput,
          semanticProof: tamperedProof,
        })
      ).toThrow(/required normalized fact or denial authority/u);
    }

    const parallel = programFor('g4-provider-parallel-tool');
    const parallelObservation = observationFor(parallel, 'supported');
    const {
      format: _format,
      version: _version,
      observationSource: _observationSource,
      probeProgramDigest: _probeProgramDigest,
      profileProjectionDigest: _profileProjectionDigest,
      observedLimitDigest: _observedLimitDigest,
      observationDigest: _observationDigest,
      ...parallelInput
    } = parallelObservation;
    const extraFact = Object.freeze({
      factKind: 'provider-event' as const,
      factDigest: digest('parallel.extra-tool-call'),
      providerEventType: 'tool-call',
    });
    const { limitDigest: _limitDigest, ...parallelObservedLimitInput } =
      parallelInput.observedLimits;
    expect(() =>
      createAgentCapabilityProbeProgramObservation(parallel, {
        ...parallelInput,
        observedFacts: Object.freeze([
          ...parallelInput.observedFacts,
          extraFact,
        ]),
        observedLimits: createAgentCapabilityProbeObservedLimits(parallel, {
          ...parallelObservedLimitInput,
          normalizedFactCount: 3,
          toolCallCount: 3,
        }),
      })
    ).toThrow(/observed limits exceeded/u);
    expect(() =>
      createAgentCapabilityProbeObservedLimits(parallel, {
        requestBytes: 1,
        responseBytes: 1,
        normalizedFactCount: 2,
        toolCallCount: 2,
        providerRoundTripCount: 1,
        pollAttemptCount: 0,
        observedMaximumSingleDispatchMs: 30_001,
        observedExecutionDurationMs: 1,
      })
    ).toThrow(/exceeded the program/u);
  });

  it('requires a normalized denial or unavailable fact for unsupported and inconclusive', () => {
    const program = programFor('g4-provider-background-job');
    expect(observationFor(program, 'unsupported')).toMatchObject({
      status: 'unsupported',
      denial: { denialKind: 'provider-feature-unavailable' },
    });
    expect(observationFor(program, 'inconclusive')).toMatchObject({
      status: 'inconclusive',
      denial: { denialKind: 'provider-response-unavailable' },
    });
    expect(
      createAgentCapabilityProbeProgramObservation(program, {
        providerConfigurationDigest: digest('provider-configuration'),
        modelLineageDigest: digest('model-lineage'),
        adapterDigest: digest('adapter'),
        probeRequestDigest: digest('timeout.request'),
        providerResponseDigest: digest('timeout.response'),
        normalizedEventSetDigest: digest('timeout.normalized'),
        status: 'inconclusive',
        observedFacts: [],
        semanticProof: null,
        denial: Object.freeze({
          denialKind: 'probe-execution-timeout',
          denialFactDigest: digest('timeout.denial'),
        }),
        observedLimits: observedLimitsFor(program, 0),
        observedAt,
      })
    ).toMatchObject({
      status: 'inconclusive',
      denial: { denialKind: 'probe-execution-timeout' },
    });
    expect(() =>
      createAgentCapabilityProbeProgramObservation(program, {
        providerConfigurationDigest: digest('provider-configuration'),
        modelLineageDigest: digest('model-lineage'),
        adapterDigest: digest('adapter'),
        probeRequestDigest: digest('request'),
        providerResponseDigest: digest('response'),
        normalizedEventSetDigest: digest('normalized'),
        status: 'supported',
        observedFacts: [],
        semanticProof: null,
        denial: null,
        observedLimits: observedLimitsFor(program, 0),
        observedAt,
      })
    ).toThrow(/required normalized fact or denial authority/u);
    expect(() =>
      createAgentCapabilityProbeProgramObservation(program, {
        providerConfigurationDigest: digest('provider-configuration'),
        modelLineageDigest: digest('model-lineage'),
        adapterDigest: digest('adapter'),
        probeRequestDigest: digest('request'),
        providerResponseDigest: digest('response'),
        normalizedEventSetDigest: digest('normalized'),
        status: 'unsupported',
        observedFacts: [],
        semanticProof: null,
        denial: null,
        observedLimits: observedLimitsFor(program, 0),
        observedAt,
      })
    ).toThrow(/required normalized fact or denial authority/u);
  });

  it('rejects profile swaps and fully recomputed program or observation tampering', () => {
    const background = programFor('g4-provider-background-job');
    const retrieval = programFor('g4-provider-hosted-retrieval-core');
    expect(() =>
      createAgentCapabilityProbeProgram({
        capabilityProfileId: 'g4-provider-background-job',
        capabilityProfileDigest:
          retrieval.profileProjection.capabilityProfileDigest,
      })
    ).toThrow(/profile identity/u);

    const { programDigest: _programDigest, ...programBase } = background;
    const tamperedIntent = Object.freeze({
      ...background.providerRequestIntent,
      publicPayload: Object.freeze({
        ...background.providerRequestIntent.publicPayload,
        instruction: 'Bearer credential-like-material',
      }),
    });
    const tamperedProgramBase = Object.freeze({
      ...programBase,
      providerRequestIntent: tamperedIntent,
    });
    const tamperedProgram = Object.freeze({
      ...tamperedProgramBase,
      programDigest: digestAgentCanonicalValue(tamperedProgramBase),
    });
    expect(isAgentCapabilityProbeProgram(tamperedProgram)).toBe(false);

    const observation = observationFor(background, 'supported');
    const { observationDigest: _observationDigest, ...observationBase } =
      observation;
    const swappedObservationBase = Object.freeze({
      ...observationBase,
      probeProgramDigest: retrieval.programDigest,
      profileProjectionDigest: retrieval.profileProjectionDigest,
    });
    const swappedObservation = Object.freeze({
      ...swappedObservationBase,
      observationDigest: digestAgentCanonicalValue(swappedObservationBase),
    });
    expect(
      isAgentCapabilityProbeProgramObservation(swappedObservation, background)
    ).toBe(false);
  });
});
