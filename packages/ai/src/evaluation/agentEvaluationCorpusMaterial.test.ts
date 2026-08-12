import { describe, expect, it } from 'vitest';
import { sameCanonicalJson } from '@prodivix/shared/canonical';
import { isPlainObject } from '@prodivix/shared/safety';
import type { AgentJsonValue } from '../domain/agent.types';
import { digestAgentCanonicalValue } from '../domain/agentCanonical';
import type { AgentModelEvaluationCase } from './agentEvaluation.types';
import { scanAndRedactAgentEvaluationPublicArtifact } from './agentEvaluationArtifactGuard';
import { digestAgentEvaluationCapabilityDescriptor } from './agentEvaluationCapabilityExecution';
import { G4_V8_MINIMUM_EVALUATION_CORPUS } from './agentEvaluationCorpus';
import {
  CallbackBoundAgentEvaluationMaterialResolver,
  createAgentEvaluationCaseMaterial,
  createAgentEvaluationCorpusMaterialCatalog,
  createAgentEvaluationRestrictedMaterialLocator,
} from './agentEvaluationCorpusMaterial';
import type {
  AgentEvaluationCaseMaterial,
  AgentEvaluationDeterministicGraderCheck,
  AgentEvaluationRestrictedMaterialLocator,
  AgentEvaluationRestrictedMaterialSource,
} from './agentEvaluationCorpusMaterial.types';
import {
  getG4V8PublicEvaluationCaseMaterials,
  matchAgentEvaluationCapabilityEffectSpecializedToolSchemas,
  specializeAgentEvaluationCapabilityEffectToolSchemas,
} from './agentEvaluationPublicCorpusMaterial';
import { createAgentEvaluationCapabilityEffectRequestRefAuthorityReceipt } from './agentEvaluationCapabilityEffectAuthority';
import {
  createAgentModelEvaluationCase,
  createAgentModelEvaluationCaseExecutionRequirement,
} from './agentEvaluationPlan';

const protectedCases = G4_V8_MINIMUM_EVALUATION_CORPUS.cases.filter(
  ({ access }) => access === 'protected-holdout'
);
const publicMaterials = getG4V8PublicEvaluationCaseMaterials();

const encryptionPolicyDigest = digestAgentCanonicalValue({
  policy: 'test-protected-material-envelope',
});

const locatorFor = (
  evaluationCase: AgentModelEvaluationCase
): AgentEvaluationRestrictedMaterialLocator =>
  createAgentEvaluationRestrictedMaterialLocator(evaluationCase, {
    resolverRef: `resolver://${evaluationCase.caseId}`,
    encryptedMaterialDigest: digestAgentCanonicalValue({
      ciphertext: `sealed://${evaluationCase.caseId}`,
    }),
    encryptionPolicyDigest,
  });

const check = (
  evaluationCase: AgentModelEvaluationCase,
  kind: AgentEvaluationDeterministicGraderCheck['kind'],
  suffix: string,
  subjectRef: string,
  expected: AgentJsonValue
): AgentEvaluationDeterministicGraderCheck => {
  const base = {
    checkId: `check.${evaluationCase.caseId}.${suffix}`,
    kind,
    subjectRef,
    expected,
  } as const;
  return Object.freeze({
    ...base,
    checkDigest: digestAgentCanonicalValue(base),
  });
};

const restrictedMaterialFor = (
  evaluationCase: AgentModelEvaluationCase,
  canary: string
): AgentEvaluationCaseMaterial => {
  const targetRef = `target://${evaluationCase.caseId}`;
  const contextSourceRef = `workspace://${evaluationCase.caseId}`;
  const toolResult = Object.freeze({
    targetRef,
    protectedObservation: canary,
  });
  const tool = Object.freeze({
    toolId: 'workspace.inspect',
    description: 'Read one exact target.',
    effect: 'read-only' as const,
    inputSchema: Object.freeze({
      type: 'object',
      additionalProperties: false,
    }),
  });
  const restrictedPrefix =
    evaluationCase.access === 'rotating-counterexample'
      ? 'rotating'
      : 'holdout';
  return createAgentEvaluationCaseMaterial({
    caseDefinition: evaluationCase,
    caseDefinitionDigestInput: Object.freeze({
      caseId: evaluationCase.caseId,
      encryptedDefinitionRef: `${restrictedPrefix}-encrypted://${evaluationCase.caseId}`,
    }),
    expectedAuthorityDigestInput: Object.freeze({
      requiredBehavior: `${restrictedPrefix}-authority://${evaluationCase.caseId}`,
      forbiddenBehavior: `${restrictedPrefix}-forbidden://${evaluationCase.caseId}`,
    }),
    gradingPolicyDigestInput: Object.freeze({
      bucket: evaluationCase.primaryBucket,
      deterministicFirst: true,
      familyId: evaluationCase.familyId,
    }),
    invocation: Object.freeze({
      blocks: Object.freeze([
        Object.freeze({
          kind: 'text' as const,
          blockId: `block.${evaluationCase.caseId}.policy`,
          role: 'developer' as const,
          authority: 'system-policy' as const,
          instructionBoundary: 'developer' as const,
          text: 'Apply the frozen evaluation policy.',
        }),
        Object.freeze({
          kind: 'text' as const,
          blockId: `block.${evaluationCase.caseId}.protected`,
          role: 'user' as const,
          authority: 'external-untrusted' as const,
          instructionBoundary: 'data-only' as const,
          text: `Protected test body ${canary}`,
        }),
        Object.freeze({
          kind: 'tool-result' as const,
          blockId: `block.${evaluationCase.caseId}.tool-result`,
          authority: 'external-untrusted' as const,
          instructionBoundary: 'data-only' as const,
          toolCallId: `call.${evaluationCase.caseId}.inspect`,
          toolId: 'workspace.inspect',
          result: toolResult,
          resultDigest: digestAgentCanonicalValue(toolResult),
        }),
      ]),
      contextItems: Object.freeze([
        Object.freeze({
          contextItemId: `context.${evaluationCase.caseId}.canonical`,
          sourceRef: contextSourceRef,
          authority: 'canonical-workspace' as const,
          instructionBoundary: 'data-only' as const,
          content: `Protected Context ${canary}`,
          contentDigest: digestAgentCanonicalValue(
            `Protected Context ${canary}`
          ),
        }),
      ]),
      tools: Object.freeze([
        Object.freeze({
          ...tool,
          definitionDigest: digestAgentCanonicalValue(tool),
        }),
      ]),
    }),
    expectedAuthority: Object.freeze({
      exactTargetRefs: Object.freeze([targetRef]),
      allowedActionIds: Object.freeze(['agent.proposal.create']),
      forbiddenActionIds: Object.freeze(['workspace.direct-write']),
      requiredContextSourceRefs: Object.freeze([contextSourceRef]),
      expectedDiagnosticCodes: Object.freeze(['AI-7002']),
      requiredPlan: 'typed-plan',
      requiredClosure: 'g3-closure',
    }),
    grader: Object.freeze({
      deterministicFirst: true,
      checks: Object.freeze([
        check(
          evaluationCase,
          'strict-schema',
          'schema',
          'response://typed-proposal',
          true
        ),
        check(evaluationCase, 'exact-target', 'target', targetRef, true),
        check(
          evaluationCase,
          'forbidden-action',
          'write',
          'workspace.direct-write',
          false
        ),
      ]),
    }),
    protectedLeakCanaries: Object.freeze([canary]),
  });
};

class TestRestrictedMaterialSource implements AgentEvaluationRestrictedMaterialSource {
  constructor(readonly material: AgentEvaluationCaseMaterial) {}

  async use<T>(
    locator: AgentEvaluationRestrictedMaterialLocator,
    callback: (material: AgentEvaluationCaseMaterial) => Promise<T>
  ): Promise<T> {
    if (locator.caseId !== this.material.caseId) {
      throw new Error('Test material locator mismatch.');
    }
    return callback(this.material);
  }
}

describe('G4 real-model corpus material', () => {
  it('limits blind subjective review to public visual cases', () => {
    const subjectiveCases = G4_V8_MINIMUM_EVALUATION_CORPUS.cases.filter(
      ({ subjectiveVisualQuality }) => subjectiveVisualQuality
    );
    expect(subjectiveCases.length).toBeGreaterThan(0);
    expect(
      subjectiveCases.every(
        ({ access, capabilityProfileId }) =>
          access === 'public' && capabilityProfileId === 'g4-visual-input'
      )
    ).toBe(true);
  });

  it('defines concrete text, tool, Context, image, document, and grader material for every public case', () => {
    const publicCases = G4_V8_MINIMUM_EVALUATION_CORPUS.cases.filter(
      ({ access }) => access === 'public'
    );
    expect(publicMaterials).toHaveLength(publicCases.length);
    expect(new Set(publicMaterials.map(({ caseId }) => caseId)).size).toBe(
      publicCases.length
    );
    expect(
      publicMaterials.every(
        ({ access, invocation, expectedAuthority, grader }) =>
          access === 'public' &&
          invocation.blocks.some(({ kind }) => kind === 'text') &&
          invocation.blocks.some(({ kind }) => kind === 'workspace-fixture') &&
          invocation.contextItems.length > 0 &&
          invocation.tools.length > 0 &&
          expectedAuthority.exactTargetRefs.length > 0 &&
          grader.deterministicFirst &&
          grader.checks.length > 0
      )
    ).toBe(true);
    const priorTurnCaseIds = publicMaterials
      .filter(({ invocation }) =>
        invocation.blocks.some(({ kind }) => kind === 'tool-result')
      )
      .map(({ caseId }) => caseId);
    expect(priorTurnCaseIds.length).toBeGreaterThan(0);
    expect(
      publicMaterials
        .filter(({ caseId }) => !priorTurnCaseIds.includes(caseId))
        .every(
          ({ invocation }) =>
            !invocation.blocks.some(({ kind }) => kind === 'tool-result')
        )
    ).toBe(true);
    expect(
      publicMaterials.some(({ invocation }) =>
        invocation.blocks.some(({ kind }) => kind === 'image')
      )
    ).toBe(true);
    expect(
      publicMaterials.some(({ invocation }) =>
        invocation.blocks.some(({ kind }) => kind === 'document')
      )
    ).toBe(true);
    const imageBlocks = publicMaterials.flatMap(({ invocation }) =>
      invocation.blocks.flatMap((block) =>
        block.kind === 'image' ? [block] : []
      )
    );
    expect(imageBlocks).toHaveLength(15);
    expect(
      new Set(imageBlocks.map(({ contentDigest }) => contentDigest)).size
    ).toBe(imageBlocks.length);
    for (const image of imageBlocks) {
      expect(image.mediaType).toBe('image/png');
      const decoded = atob(image.bytesBase64);
      const bytes = Uint8Array.from(decoded, (character) =>
        character.charCodeAt(0)
      );
      const readUint32 = (offset: number): number =>
        (((bytes[offset] ?? 0) << 24) |
          ((bytes[offset + 1] ?? 0) << 16) |
          ((bytes[offset + 2] ?? 0) << 8) |
          (bytes[offset + 3] ?? 0)) >>>
        0;
      expect([...bytes.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
      expect(readUint32(16)).toBe(640);
      expect(readUint32(20)).toBe(360);
      expect(bytes[24]).toBe(1);
      expect(bytes[25]).toBe(0);
      expect(String.fromCharCode(...bytes.slice(37, 41))).toBe('IDAT');
      expect(bytes.slice(-12, -8)).toEqual(Uint8Array.of(0, 0, 0, 0));
      expect(String.fromCharCode(...bytes.slice(-8, -4))).toBe('IEND');
    }

    const sharedEffectPatterns = Object.freeze({
      'provider.background-job.poll':
        '^capability-effect-ref\\.provider-job\\.[0-9a-f]{64}$',
      'provider.cache.inspect':
        '^capability-effect-ref\\.provider-cache\\.[0-9a-f]{64}$',
      'provider.continuation.resume':
        '^capability-effect-ref\\.opaque-continuation\\.[0-9a-f]{64}$',
      'provider.retrieval.search':
        '^capability-effect-ref\\.hosted-retrieval-query\\.[0-9a-f]{64}$',
    });
    const sharedEffectTools = publicMaterials.flatMap(({ invocation }) =>
      invocation.tools.filter(({ toolId }) =>
        Object.hasOwn(sharedEffectPatterns, toolId)
      )
    );
    expect(new Set(sharedEffectTools.map(({ toolId }) => toolId))).toEqual(
      new Set(Object.keys(sharedEffectPatterns))
    );
    for (const tool of sharedEffectTools) {
      expect(isPlainObject(tool.inputSchema)).toBe(true);
      const properties = isPlainObject(tool.inputSchema)
        ? tool.inputSchema.properties
        : null;
      expect(isPlainObject(properties)).toBe(true);
      const requestRef = isPlainObject(properties)
        ? properties.requestRef
        : null;
      expect(requestRef).toEqual(
        Object.freeze({
          type: 'string',
          pattern:
            sharedEffectPatterns[
              tool.toolId as keyof typeof sharedEffectPatterns
            ],
        })
      );
    }

    const publicArtifact = JSON.stringify(publicMaterials);
    expect(
      protectedCases.every(({ caseId }) => !publicArtifact.includes(caseId))
    ).toBe(true);
  });

  it('specializes a shared-effect tool with one pre-issued visible requestRef authority', () => {
    const material = publicMaterials.find(({ invocation }) =>
      invocation.tools.some(
        ({ toolId }) => toolId === 'provider.retrieval.search'
      )
    )!;
    const retrievalTool = material.invocation.tools.find(
      ({ toolId }) => toolId === 'provider.retrieval.search'
    )!;
    const schema = isPlainObject(retrievalTool.inputSchema)
      ? retrievalTool.inputSchema
      : null;
    const properties = isPlainObject(schema?.properties)
      ? schema.properties
      : null;
    const targetRefSchema = isPlainObject(properties?.targetRef)
      ? properties.targetRef
      : null;
    const targetRef = String(targetRefSchema?.const);
    const authority =
      createAgentEvaluationCapabilityEffectRequestRefAuthorityReceipt({
        namespaceId: 'namespace.release',
        planDigest: digestAgentCanonicalValue({ plan: 'release' }),
        repositoryCommit: '1234567890abcdef1234567890abcdef12345678',
        attemptId: 'attempt.release.1',
        descriptorDigest: digestAgentCanonicalValue({ descriptor: 'release' }),
        turnIndex: 2,
        invocationId: 'invocation.release.3',
        bindingKind: 'hosted-retrieval-query',
        capabilityId: 'provider.hosted-retrieval',
        toolId: 'provider.retrieval.search',
        targetRef,
        protocolFamily: 'openai-responses',
        providerConfigurationId: 'provider.release.openai-responses',
        modelLineageDigest: digestAgentCanonicalValue({ lineage: 'release' }),
        adapterDigest: digestAgentCanonicalValue({ adapter: 'release' }),
        runtimeFactSourceAuthorityDigest: digestAgentCanonicalValue({
          runtimeSource: 'release',
        }),
        registrationReceiptDigest: digestAgentCanonicalValue({
          registration: 'release',
        }),
        issuedAt: '2026-08-09T03:00:00.000Z',
        expiresAt: '2026-08-09T03:02:05.000Z',
      });
    const specialized = specializeAgentEvaluationCapabilityEffectToolSchemas(
      material.invocation.tools,
      Object.freeze([authority])
    );
    const specializedTool = specialized.find(
      ({ toolId }) => toolId === authority.toolId
    )!;
    const specializedSchema = isPlainObject(specializedTool.inputSchema)
      ? specializedTool.inputSchema
      : null;
    const specializedProperties = isPlainObject(specializedSchema?.properties)
      ? specializedSchema.properties
      : null;
    expect(
      isPlainObject(specializedProperties?.requestRef)
        ? specializedProperties.requestRef.const
        : null
    ).toBe(authority.requestRef);
    expect(
      matchAgentEvaluationCapabilityEffectSpecializedToolSchemas(
        material.invocation.tools,
        Object.freeze([authority]),
        specialized
      )
    ).toBe(true);
    expect(retrievalTool.inputSchema).toEqual(schema);
    expect(() =>
      specializeAgentEvaluationCapabilityEffectToolSchemas(
        material.invocation.tools,
        Object.freeze([
          createAgentEvaluationCapabilityEffectRequestRefAuthorityReceipt({
            ...(() => {
              const {
                format: _format,
                version: _version,
                authorityDigest: _authorityDigest,
                requestRef: _requestRef,
                receiptDigest: _receiptDigest,
                ...input
              } = authority;
              return input;
            })(),
            targetRef: 'target.release.swapped',
          }),
        ])
      )
    ).toThrow(/schema authority drifted/u);
  });

  it('freezes 96 materially distinct Workspace fixtures against the existing action registry', () => {
    const fixtures = G4_V8_MINIMUM_EVALUATION_CORPUS.publicFixtures;
    expect(fixtures).toHaveLength(96);
    expect(
      new Set(fixtures.map(({ fixtureDigest }) => fixtureDigest)).size
    ).toBe(fixtures.length);
    expect(
      new Set(
        fixtures.map(
          ({ workspaceFixture }) => workspaceFixture.workspaceSnapshotDigest
        )
      ).size
    ).toBe(fixtures.length);
    expect(
      new Set(
        fixtures.map(
          ({ workspaceFixture }) =>
            workspaceFixture.verificationFixture.verificationFixtureDigest
        )
      ).size
    ).toBe(fixtures.length);
    expect(JSON.stringify(fixtures)).not.toContain('Variant ');
    const caseById = new Map(
      G4_V8_MINIMUM_EVALUATION_CORPUS.cases.map((evaluationCase) => [
        evaluationCase.caseId,
        evaluationCase,
      ])
    );
    expect(
      fixtures.every(({ caseId, workspaceFixture }) => {
        const [capability] = workspaceFixture.capabilities;
        const evaluationCase = caseById.get(caseId);
        return (
          workspaceFixture.capabilities.length === 1 &&
          capability !== undefined &&
          evaluationCase !== undefined &&
          capability.descriptorDigest ===
            digestAgentEvaluationCapabilityDescriptor({
              capabilityId: capability.capabilityId,
              supportExpectation: capability.support,
              expectedToolIds: capability.toolIds,
              expectedReceiptKinds: capability.expectedReceiptKinds,
            }) &&
          capability.descriptorDigest ===
            evaluationCase?.capabilityDescriptorDigest &&
          evaluationCase.capabilityDescriptor.capabilityId ===
            capability.capabilityId &&
          evaluationCase.capabilityDescriptor.supportExpectation ===
            capability.support &&
          sameCanonicalJson(
            evaluationCase.capabilityDescriptor.expectedToolIds,
            capability.toolIds
          ) &&
          sameCanonicalJson(
            evaluationCase.capabilityDescriptor.expectedReceiptKinds,
            capability.expectedReceiptKinds
          )
        );
      })
    ).toBe(true);

    const readyFixtures = fixtures.filter(
      ({ workspaceFixture }) =>
        workspaceFixture.expectedOutcome.proposal.status === 'ready'
    );
    const blockedFixtures = fixtures.filter(
      ({ workspaceFixture }) =>
        workspaceFixture.expectedOutcome.proposal.status === 'blocked'
    );
    expect(
      new Set(
        readyFixtures.flatMap(({ workspaceFixture }) =>
          workspaceFixture.actionRegistry.map(({ actionId }) => actionId)
        )
      )
    ).toEqual(
      new Set([
        'action.animation.document-update',
        'action.code.slot-edit',
        'action.data.document-update',
        'action.nodegraph.document-update',
        'action.pir.document-update',
        'action.route.child-create',
      ])
    );
    expect(
      readyFixtures.every(({ workspaceFixture }) => {
        const proposal = workspaceFixture.expectedOutcome.proposal;
        if (proposal.status !== 'ready') return false;
        const action = workspaceFixture.actionRegistry[0];
        return (
          workspaceFixture.actionRegistry.length === 1 &&
          action?.actionId === proposal.actionId &&
          action.targetRef === proposal.targetRef &&
          action.actionDigest === digestAgentCanonicalValue(action.action)
        );
      })
    ).toBe(true);
    expect(blockedFixtures.length).toBeGreaterThan(0);
    expect(
      blockedFixtures.every(
        ({ workspaceFixture }) =>
          workspaceFixture.actionRegistry.length === 0 &&
          workspaceFixture.expectedOutcome.transaction.expectedCommandCount ===
            0 &&
          workspaceFixture.expectedOutcome.transaction
            .expectedTransactionCount === 0 &&
          workspaceFixture.capabilities.every(
            ({ support }) => support === 'expected-blocked'
          )
      )
    ).toBe(true);
    expect(
      fixtures.every(({ workspaceFixture }) => {
        const checkIds = new Set(
          workspaceFixture.verificationFixture.checks.flatMap((check) =>
            isPlainObject(check) && typeof check.id === 'string'
              ? [check.id]
              : []
          )
        );
        return workspaceFixture.expectedOutcome.verification.requiredCheckIds.every(
          (checkId) => checkIds.has(checkId)
        );
      })
    ).toBe(true);
    for (const { caseId, workspaceFixture } of fixtures) {
      const [scenario] = workspaceFixture.verificationFixture.scenarios;
      const [check] = workspaceFixture.verificationFixture.checks;
      const [adapter] = workspaceFixture.verificationFixture.adapters;
      expect(
        isPlainObject(scenario) ? scenario.capabilityIds : undefined,
        `${caseId}:scenario-capability`
      ).toEqual(['agent-evaluation.controlled-workspace-runtime']);
      expect(
        isPlainObject(check) ? check.capabilityIds : undefined,
        `${caseId}:check-capability`
      ).toEqual(['agent-evaluation.controlled-workspace-runtime']);
      expect(
        isPlainObject(adapter) && isPlainObject(adapter.descriptor)
          ? adapter.descriptor.controlCapabilities
          : undefined,
        `${caseId}:adapter-capability`
      ).toEqual(['agent-evaluation.controlled-workspace-runtime']);
    }
  });

  it('requires exact one-to-one public and restricted coverage', () => {
    const restrictedLocators = protectedCases.map(locatorFor);
    const catalog = createAgentEvaluationCorpusMaterialCatalog(
      G4_V8_MINIMUM_EVALUATION_CORPUS.cases,
      publicMaterials,
      restrictedLocators
    );
    expect(catalog.entries).toHaveLength(128);
    expect(new Set(catalog.entries.map(({ caseId }) => caseId)).size).toBe(128);
    expect(
      catalog.entries.filter(({ kind }) => kind === 'restricted-material')
    ).toHaveLength(32);

    expect(() =>
      createAgentEvaluationCorpusMaterialCatalog(
        G4_V8_MINIMUM_EVALUATION_CORPUS.cases,
        publicMaterials.slice(1),
        restrictedLocators
      )
    ).toThrow(/one-to-one/u);
    expect(() =>
      createAgentEvaluationCorpusMaterialCatalog(
        G4_V8_MINIMUM_EVALUATION_CORPUS.cases,
        [...publicMaterials, publicMaterials[0]!],
        restrictedLocators
      )
    ).toThrow(/one-to-one/u);
  }, 30_000);

  it('rejects material digest drift and access mismatches', () => {
    const restrictedLocators = protectedCases.map(locatorFor);
    const first = publicMaterials[0]!;
    const firstTextIndex = first.invocation.blocks.findIndex(
      ({ kind }) => kind === 'text'
    );
    const driftedBlocks = first.invocation.blocks.map((block, index) =>
      index === firstTextIndex && block.kind === 'text'
        ? { ...block, text: `${block.text} drift` }
        : block
    );
    const drifted = {
      ...first,
      invocation: { ...first.invocation, blocks: driftedBlocks },
    };
    expect(() =>
      createAgentEvaluationCorpusMaterialCatalog(
        G4_V8_MINIMUM_EVALUATION_CORPUS.cases,
        [drifted, ...publicMaterials.slice(1)],
        restrictedLocators
      )
    ).toThrow(/digest drifted/u);

    expect(() =>
      createAgentEvaluationCorpusMaterialCatalog(
        G4_V8_MINIMUM_EVALUATION_CORPUS.cases,
        [
          {
            ...first,
            capabilityDescriptorDigest: digestAgentCanonicalValue(
              'capability-binding-drift'
            ),
          },
          ...publicMaterials.slice(1),
        ],
        restrictedLocators
      )
    ).toThrow(/binding drifted/u);

    const publicCase = G4_V8_MINIMUM_EVALUATION_CORPUS.cases.find(
      ({ access }) => access === 'public'
    )!;
    expect(() => locatorFor(publicCase)).toThrow(/cannot use a resolver/u);

    const accessDrift = {
      ...restrictedLocators[0]!,
      access: 'rotating-counterexample' as const,
    };
    expect(() =>
      createAgentEvaluationCorpusMaterialCatalog(
        G4_V8_MINIMUM_EVALUATION_CORPUS.cases,
        publicMaterials,
        [accessDrift, ...restrictedLocators.slice(1)]
      )
    ).toThrow(/access does not match/u);
  }, 30_000);

  it('keeps rotating counterexamples on the same restricted resolver boundary', () => {
    const caseId = 'g4-rotating.counterexample.1';
    const caseDefinitionDigestInput = Object.freeze({
      caseId,
      encryptedDefinitionRef: `rotating-encrypted://${caseId}`,
    });
    const expectedAuthorityDigestInput = Object.freeze({
      requiredBehavior: `rotating-authority://${caseId}`,
      forbiddenBehavior: `rotating-forbidden://${caseId}`,
    });
    const gradingPolicyDigestInput = Object.freeze({
      bucket: 'adversarial-security',
      deterministicFirst: true,
      familyId: 'adversarial.rotating-counterexample',
    });
    const evaluationCase = createAgentModelEvaluationCase({
      caseId,
      familyId: 'adversarial.rotating-counterexample',
      primaryBucket: 'adversarial-security',
      riskClass: 'critical',
      access: 'rotating-counterexample',
      capabilityProfileId: 'g4-core-text-tools',
      capabilityDescriptor: Object.freeze({
        capabilityId: 'fixture.adversarial-rotating-counterexample',
        supportExpectation: 'required',
        expectedToolIds: Object.freeze(['workspace.inspect']),
        expectedReceiptKinds: Object.freeze([
          'tool-execution-receipt',
          'verification-closure-receipt',
        ]),
        descriptorDigest: digestAgentCanonicalValue({
          capabilityId: 'fixture.adversarial-rotating-counterexample',
          support: 'required',
          toolIds: ['workspace.inspect'],
          expectedReceiptKinds: [
            'tool-execution-receipt',
            'verification-closure-receipt',
          ],
        }),
      }),
      capabilityDescriptorDigest: digestAgentCanonicalValue({
        capabilityId: 'fixture.adversarial-rotating-counterexample',
        support: 'required',
        toolIds: ['workspace.inspect'],
        expectedReceiptKinds: [
          'tool-execution-receipt',
          'verification-closure-receipt',
        ],
      }),
      fixtureRef: `rotating://${caseId}`,
      caseDefinitionDigest: digestAgentCanonicalValue(
        caseDefinitionDigestInput
      ),
      expectedAuthorityDigest: digestAgentCanonicalValue(
        expectedAuthorityDigestInput
      ),
      gradingPolicyDigest: digestAgentCanonicalValue(gradingPolicyDigestInput),
      contextSentinel: false,
      mediaSentinel: false,
      subjectiveVisualQuality: false,
      executionRequirement: createAgentModelEvaluationCaseExecutionRequirement({
        minimumToolCalls: 1,
        minimumRepairRounds: 0,
        minimumTransactions: 0,
        verificationClosureRequired: true,
      }),
      tags: Object.freeze(['counterexample', 'rotating']),
    });
    const material = restrictedMaterialFor(
      evaluationCase,
      'rotating-protected-canary-a665a4592042'
    );
    const locator = locatorFor(evaluationCase);
    const catalog = createAgentEvaluationCorpusMaterialCatalog(
      [evaluationCase],
      [],
      [locator]
    );
    expect(material.access).toBe('rotating-counterexample');
    expect(catalog.entries[0]).toMatchObject({
      kind: 'restricted-material',
      access: 'rotating-counterexample',
    });
  });

  it('redacts and blocks protected plaintext in plan, attempt, log, and artifact outputs', () => {
    const canary = 'protected-holdout-canary-9f86d081884c';
    for (const artifactKind of [
      'plan',
      'attempt',
      'log',
      'artifact',
    ] as const) {
      const scan = scanAndRedactAgentEvaluationPublicArtifact(
        artifactKind,
        {
          body: `prefix:${canary}`,
          encoded: encodeURIComponent(canary),
        },
        { protectedMaterialCanaries: [canary] }
      );
      expect(scan.safe).toBe(false);
      expect(scan.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'AI-8011', blocking: true }),
        ])
      );
      expect(JSON.stringify(scan.findings)).not.toContain(canary);
      expect(JSON.stringify(scan.redactedArtifact)).not.toContain(canary);
      expect(JSON.stringify(scan.redactedArtifact)).toContain(
        'REDACTED_PROTECTED_MATERIAL'
      );
    }

    expect(
      scanAndRedactAgentEvaluationPublicArtifact(
        'artifact',
        { caseId: 'public.case', verdict: 'passed' },
        { protectedMaterialCanaries: [canary] }
      ).safe
    ).toBe(true);
    expect(
      scanAndRedactAgentEvaluationPublicArtifact(
        'artifact',
        { unsafe: 1n },
        { protectedMaterialCanaries: [canary] }
      )
    ).toMatchObject({ safe: false, redactedArtifact: null });
  });

  it('exposes protected material only inside a revocable callback and rejects callback leakage', async () => {
    const evaluationCase = protectedCases[0]!;
    const canary = 'protected-body-canary-5e884898da28';
    const material = restrictedMaterialFor(evaluationCase, canary);
    const locator = locatorFor(evaluationCase);
    const catalog = createAgentEvaluationCorpusMaterialCatalog(
      [evaluationCase],
      [],
      [locator]
    );
    const resolver = new CallbackBoundAgentEvaluationMaterialResolver(
      [evaluationCase],
      catalog,
      new TestRestrictedMaterialSource(material)
    );
    let retainedScope:
      Parameters<Parameters<typeof resolver.use>[1]>[0] | undefined;
    await expect(
      resolver.use(evaluationCase.caseId, async (scope) => {
        retainedScope = scope;
        expect(scope.read().materialDigest).toBe(material.materialDigest);
        return Object.freeze({
          verdict: 'passed',
          observationDigest: digestAgentCanonicalValue({ verdict: 'passed' }),
        });
      })
    ).resolves.toMatchObject({ verdict: 'passed' });
    expect(() => retainedScope!.read()).toThrow(/revoked/u);

    await expect(
      resolver.use(evaluationCase.caseId, async (scope) => ({
        log: scope.read().protectedLeakCanaries[0]!,
      }))
    ).rejects.toThrow(/no-leak/u);
  });
});
