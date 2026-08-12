import {
  AGENT_EVALUATION_RESULT_SUBMISSION_SCHEMA_DIGEST,
  createAgentEvaluationCaseResultContract,
  createAgentEvaluationResultSubmissionReceipt,
  decodeAgentEvaluationResultSubmission,
  digestAgentCanonicalValue,
  getG4V8PublicEvaluationCaseMaterials,
  type AgentEvaluationCaseMaterial,
  type AgentEvaluationControlledPersistedArtifactRef,
  type AgentEvaluationControlledRuntimeInput,
  type AgentEvaluationControlledToolExecutionInput,
  type AgentEvaluationControlledToolExecutionOutput,
  type AgentEvaluationResultArtifactRef,
  type AgentEvaluationWorkspaceFixtureMaterial,
  type AgentJsonValue,
  type CanonicalDigest,
} from '@prodivix/ai';
import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import { describe, expect, it, vi } from 'vitest';
import {
  CONTROLLED_WORKSPACE_RUNTIME_ERROR_CODES,
  createAgentEvaluationControlledWorkspaceGrant,
  createAgentEvaluationControlledWorkspaceRuntime,
  type AgentEvaluationControlledWorkspaceAttemptState,
  type AgentEvaluationControlledWorkspaceAuthorizationInput,
  type AgentEvaluationControlledWorkspaceCheckpoint,
  type AgentEvaluationControlledWorkspaceCleanupClaim,
  type AgentEvaluationControlledWorkspaceCleanupDispatchReceipt,
  type AgentEvaluationControlledWorkspaceCleanupIntent,
  type AgentEvaluationControlledWorkspaceCleanupReceipt,
  type AgentEvaluationControlledWorkspaceCleanupSeal,
  type AgentEvaluationControlledWorkspaceDispatchReceipt,
  type AgentEvaluationControlledWorkspaceEffect,
  type AgentEvaluationControlledWorkspaceFinalAuthority,
  type AgentEvaluationControlledWorkspaceGrant,
  type AgentEvaluationControlledWorkspaceOperationClaim,
  type AgentEvaluationControlledWorkspaceOperationIntent,
  type AgentEvaluationControlledWorkspaceOperationLedger,
  type AgentEvaluationControlledWorkspaceOperationSeal,
  type AgentEvaluationControlledWorkspaceOrphanSession,
  type AgentEvaluationControlledWorkspacePreflightCode,
  type AgentEvaluationControlledWorkspacePreflightReceipt,
  type AgentEvaluationControlledWorkspacePublicScanReceipt,
  type AgentEvaluationControlledWorkspaceSession,
  type AgentEvaluationControlledWorkspaceSessionAttachment,
  type AgentEvaluationControlledWorkspaceSessionLoader,
} from './controlledWorkspaceRuntime';
import { validateControlledWorkspaceToolArguments } from './controlledWorkspaceRuntimeSchema';
import type { AgentEvaluationControlledRuntimeConfiguration } from './runConfig';

const digest = (value: string): CanonicalDigest =>
  digestAgentCanonicalValue({ value });
const repositoryCommit = '0123456789abcdef0123456789abcdef01234567';
const publicMaterial = getG4V8PublicEvaluationCaseMaterials().find(
  (candidate) => {
    const block = candidate.invocation.blocks.find(
      ({ kind }) => kind === 'workspace-fixture'
    );
    return (
      block?.kind === 'workspace-fixture' &&
      block.fixture.expectedOutcome.proposal.status === 'ready' &&
      candidate.invocation.tools.some(
        ({ toolId }) => toolId === 'agent.proposal.create'
      ) &&
      candidate.invocation.tools.some(
        ({ toolId }) => toolId === 'verification.plan.request'
      )
    );
  }
);
const publicFixtureBlock = publicMaterial?.invocation.blocks.find(
  ({ kind }) => kind === 'workspace-fixture'
);
const publicFixture =
  publicFixtureBlock?.kind === 'workspace-fixture'
    ? publicFixtureBlock.fixture
    : undefined;
const publicExpectedProposal =
  publicFixture?.expectedOutcome.proposal.status === 'ready'
    ? publicFixture.expectedOutcome.proposal
    : undefined;
const publicAction = publicFixture?.actionRegistry.find(
  ({ actionId: registeredActionId }) =>
    registeredActionId === publicExpectedProposal?.actionId
);
const caseId = publicMaterial?.caseId ?? 'case.controlled-workspace';
const attemptId = 'attempt.controlled-workspace';
const planDigest = digest('plan');
const descriptorDigest = digest('descriptor');
const targetRef = publicExpectedProposal?.targetRef ?? 'document.primary';
const sourceRefs =
  publicExpectedProposal?.sourceRefs ?? Object.freeze(['source.primary']);
const sourceRef = sourceRefs[0]!;
const actionId =
  publicExpectedProposal?.actionId ?? 'action.pir.document-update';
const initialSnapshotDigest =
  publicFixture?.workspaceSnapshotDigest ?? digest('snapshot-initial');
const finalSnapshotDigest = digest('snapshot-final');
const proposalDigest = digest('proposal-artifact');
const planArtifactDigest = digest('verification-plan-artifact');
const transactionArtifactDigest = digest('transaction-artifact');
const closureArtifactDigest = digest('verification-closure-artifact');
const proposalValidationReceiptDigest = digest('proposal-validation');
const verificationPlanReceiptDigest = digest('verification-plan-receipt');
const verificationAttemptGrantReceiptDigest = digest(
  'verification-attempt-grant-receipt'
);
const commandReceiptDigest = digest('command-receipt');
const transactionReceiptDigest = digest('transaction-receipt');

const configuration = (): AgentEvaluationControlledRuntimeConfiguration => {
  const loopBase = Object.freeze({
    domainToolChoice: 'required' as const,
    allowParallelDomainToolCalls: true,
    maximumTurnsPerAttempt: 7,
    maximumToolCallsPerAttempt: 4,
    maximumRepairRoundsPerAttempt: 2,
    maximumToolResultBytes: 2_097_152,
    maximumAggregateToolResultBytes: 8_388_608,
    maximumAggregateArtifactBytes: 8_388_608,
    continuationTimeoutMs: 30_000,
  });
  const loop = Object.freeze({
    ...loopBase,
    loopPolicyDigest: digestAgentCanonicalValue(loopBase),
  });
  const base = Object.freeze({
    authorityId: 'authority.controlled-workspace',
    runtimeImplementationDigest: digest('runtime-implementation'),
    artifactResolutionPolicyDigest: digest('artifact-resolution-policy'),
    proposalValidationPolicyDigest: digest('proposal-validation-policy'),
    isolationPolicyDigest: digest('isolation-policy'),
    g3VerificationPolicyDigest: digest('g3-verification-policy'),
    controlledRenderPolicyDigest: digest('controlled-render-policy'),
    loop,
  });
  return Object.freeze({
    ...base,
    runtimePolicyDigest: digestAgentCanonicalValue(base),
  });
};

const tool = (
  toolId: string,
  effect: 'read-only' | 'proposal-only' | 'verification-only',
  inputSchema: AgentJsonValue
) => {
  const base = Object.freeze({
    toolId,
    description: `Frozen ${toolId}`,
    effect,
    inputSchema,
  });
  return Object.freeze({
    ...base,
    definitionDigest: digestAgentCanonicalValue(base),
  });
};

const objectSchema = (
  required: readonly string[],
  properties: Readonly<Record<string, AgentJsonValue>>
): AgentJsonValue =>
  Object.freeze({
    type: 'object',
    additionalProperties: false,
    required: Object.freeze([...required]),
    properties: Object.freeze(properties),
  });

const fixtureMaterial = (): AgentEvaluationCaseMaterial => {
  if (publicMaterial) return publicMaterial;
  const actionArgumentsSchema = objectSchema(
    ['requestedValue'],
    Object.freeze({ requestedValue: Object.freeze({ type: 'integer' }) })
  );
  const actionBase = Object.freeze({
    actionId,
    targetRef,
    argumentSchema: actionArgumentsSchema,
  });
  const action = Object.freeze({
    ...actionBase,
    descriptorDigest: digestAgentCanonicalValue(actionBase),
  });
  const snapshotBase = Object.freeze({
    workspaceId: 'workspace.controlled',
    workspaceName: 'Controlled Workspace',
    workspaceRev: 1,
    routeRev: 1,
    opSeq: 1,
    routeNodeId: 'route.root',
    routePath: '/controlled',
    activeDocumentId: targetRef,
    documents: Object.freeze([
      Object.freeze({
        documentId: targetRef,
        documentType: 'pir-component',
        path: 'components/primary.pir.json',
        contentRev: 1,
        metaRev: 1,
        content: Object.freeze({ value: 1 }),
        contentDigest: digestAgentCanonicalValue({ value: 1 }),
      }),
    ]),
  });
  const snapshot = Object.freeze({
    ...snapshotBase,
    snapshotDigest: digestAgentCanonicalValue(snapshotBase),
  });
  const expectedProposalBase = Object.freeze({
    actionId,
    targetRef,
    arguments: Object.freeze({ requestedValue: 2 }),
    sourceRefs: Object.freeze([sourceRef]),
  });
  const fixtureBase = Object.freeze({
    format: 'prodivix.agent-evaluation-workspace-fixture' as const,
    version: 1 as const,
    scenarioId: 'scenario.controlled-workspace',
    domainOwner: 'prodivix.pir',
    frameworkTarget: 'react-vite' as const,
    snapshot,
    targetRefs: Object.freeze([targetRef]),
    sourceRefs: Object.freeze([sourceRef]),
    actionRegistry: Object.freeze([action]),
    capabilities: Object.freeze([]),
    expectedOutcome: Object.freeze({
      proposal: Object.freeze({
        ...expectedProposalBase,
        proposalInputDigest: digestAgentCanonicalValue(expectedProposalBase),
      }),
      transaction: Object.freeze({
        expectedCommandCount: 1,
        expectedTransactionCount: 1,
        changedDocumentIds: Object.freeze([targetRef]),
        transactionPolicyDigest: digest('transaction-policy'),
      }),
      verification: Object.freeze({
        requiredCheckIds: Object.freeze(['check.domain']),
        expectedVerdict: 'passed' as const,
        planPolicyDigest: digest('plan-policy'),
        closurePolicyDigest: digest('closure-policy'),
      }),
    }),
  });
  const fixture = Object.freeze({
    ...fixtureBase,
    fixtureDigest: digestAgentCanonicalValue(fixtureBase),
  }) as unknown as AgentEvaluationWorkspaceFixtureMaterial;
  const proposalSchema = objectSchema(
    ['actionId', 'targetRef', 'arguments', 'sourceRefs', 'summary'],
    Object.freeze({
      actionId: Object.freeze({ type: 'string' }),
      targetRef: Object.freeze({ type: 'string' }),
      arguments: actionArgumentsSchema,
      sourceRefs: Object.freeze({
        type: 'array',
        minItems: 1,
        maxItems: 1,
        uniqueItems: true,
        items: Object.freeze({ type: 'string', const: sourceRef }),
      }),
      summary: Object.freeze({ type: 'string', minLength: 1, maxLength: 128 }),
    })
  );
  const tools = Object.freeze([
    tool('agent.proposal.create', 'proposal-only', proposalSchema),
    tool(
      'verification.plan.request',
      'verification-only',
      objectSchema(
        [
          'proposalRef',
          'proposalDigest',
          'workspaceSnapshotDigest',
          'requiredCheckIds',
        ],
        Object.freeze({
          proposalRef: Object.freeze({ type: 'string' }),
          proposalDigest: Object.freeze({ type: 'string' }),
          workspaceSnapshotDigest: Object.freeze({
            type: 'string',
            const: initialSnapshotDigest,
          }),
          requiredCheckIds: Object.freeze({
            type: 'array',
            minItems: 1,
            maxItems: 1,
            uniqueItems: true,
            items: Object.freeze({ type: 'string', const: 'check.domain' }),
          }),
        })
      )
    ),
    tool(
      'workspace.inspect',
      'read-only',
      objectSchema(
        ['targetRef'],
        Object.freeze({ targetRef: Object.freeze({ type: 'string' }) })
      )
    ),
    tool(
      'workspace.direct-write',
      'verification-only',
      objectSchema([], Object.freeze({}))
    ),
  ]);
  const caseDefinitionDigestInput = Object.freeze({ caseId });
  const expectedAuthorityDigestInput = Object.freeze({ authority: 'fixture' });
  const gradingPolicyDigestInput = Object.freeze({ deterministicFirst: true });
  const expectedAuthority = Object.freeze({
    exactTargetRefs: Object.freeze([targetRef]),
    allowedActionIds: Object.freeze([actionId]),
    forbiddenActionIds: Object.freeze([
      'workspace.direct-write',
      'approval.self-issue',
    ]),
    requiredContextSourceRefs: Object.freeze([sourceRef]),
    expectedDiagnosticCodes: Object.freeze([]),
    requiredPlan: 'typed-plan' as const,
    requiredClosure: 'g3-closure' as const,
  });
  const graderBase = Object.freeze({
    deterministicFirst: true as const,
    checks: Object.freeze([]),
  });
  const grader = Object.freeze({
    ...graderBase,
    graderMaterialDigest: digestAgentCanonicalValue(graderBase),
  });
  const base = Object.freeze({
    caseId,
    caseDigest: digest('case'),
    access: 'public' as const,
    capabilityProfileId: 'g4-core-text-tools',
    capabilityDescriptorDigest: digest('capability-descriptor'),
    fixtureRef: 'fixture.controlled-workspace',
    caseDefinitionDigest: digestAgentCanonicalValue(caseDefinitionDigestInput),
    expectedAuthorityDigest: digestAgentCanonicalValue(
      expectedAuthorityDigestInput
    ),
    gradingPolicyDigest: digestAgentCanonicalValue(gradingPolicyDigestInput),
    caseDefinitionDigestInput,
    expectedAuthorityDigestInput,
    gradingPolicyDigestInput,
    invocation: Object.freeze({
      blocks: Object.freeze([
        Object.freeze({
          kind: 'workspace-fixture' as const,
          blockId: 'block.workspace-fixture',
          authority: 'canonical-workspace' as const,
          instructionBoundary: 'data-only' as const,
          fixture,
        }),
      ]),
      contextItems: Object.freeze([]),
      tools,
    }),
    expectedAuthority,
    grader,
    protectedLeakCanaries: Object.freeze([]),
  });
  return Object.freeze({
    ...base,
    materialDigest: digestAgentCanonicalValue(base),
  }) as AgentEvaluationCaseMaterial;
};

const createCheckpoint = (
  checkpointRef: string,
  snapshotDigest: CanonicalDigest,
  grant: Readonly<{
    grantDigest: CanonicalDigest;
    generation: number;
  }>,
  predecessorCheckpointDigest?: CanonicalDigest
): AgentEvaluationControlledWorkspaceCheckpoint => {
  const base = Object.freeze({
    checkpointRef,
    attemptId,
    grantDigest: grant.grantDigest,
    generation: grant.generation,
    ...(predecessorCheckpointDigest ? { predecessorCheckpointDigest } : {}),
    snapshotDigest,
    securePersistenceReceiptDigest: digest(`${checkpointRef}:persistence`),
  });
  return Object.freeze({
    ...base,
    checkpointDigest: digestAgentCanonicalValue(base),
  });
};

const persisted = (
  artifact: AgentEvaluationResultArtifactRef
): AgentEvaluationControlledPersistedArtifactRef =>
  Object.freeze({
    ...artifact,
    persistenceReceiptDigest: digest(`persisted:${artifact.artifactRef}`),
  });

const artifacts = Object.freeze([
  Object.freeze({
    artifactKind: 'proposal' as const,
    artifactRef: 'artifact.proposal',
    artifactDigest: proposalDigest,
    byteLength: 96,
  }),
  Object.freeze({
    artifactKind: 'verification-plan' as const,
    artifactRef: 'artifact.verification-plan',
    artifactDigest: planArtifactDigest,
    byteLength: 128,
  }),
  Object.freeze({
    artifactKind: 'transaction-receipt' as const,
    artifactRef: 'artifact.transaction-receipt',
    artifactDigest: transactionArtifactDigest,
    byteLength: 64,
  }),
  Object.freeze({
    artifactKind: 'verification-closure' as const,
    artifactRef: 'artifact.verification-closure',
    artifactDigest: closureArtifactDigest,
    byteLength: 128,
  }),
]);

const publicScan = (
  intentDigest: CanonicalDigest,
  candidate: AgentJsonValue,
  label: string
): AgentEvaluationControlledWorkspacePublicScanReceipt => {
  const base = Object.freeze({
    intentDigest,
    candidateDigest: digestAgentCanonicalValue(candidate),
    safe: true,
    canarySetDigest: digest(`${label}:canaries`),
    fingerprintDigest: digest(`${label}:fingerprint`),
  });
  return Object.freeze({
    ...base,
    scanReceiptDigest: digestAgentCanonicalValue(base),
  });
};

const authoritySetDigest = (
  authorityReceiptDigests: readonly CanonicalDigest[]
): CanonicalDigest =>
  digestAgentCanonicalValue({
    authorityReceiptDigests: [...authorityReceiptDigests].sort(
      compareUnicodeCodePoints
    ),
  });

type FakeSessionOptions = Readonly<{
  closureVerdict?: 'passed' | 'failed';
  staleBefore?: boolean;
  preflightGenerationOffset?: number;
  throwAfterEffectPersistOnce?: boolean;
  throwBeforeEffectPersistOnce?: boolean;
}>;

class FakeSession implements AgentEvaluationControlledWorkspaceSession {
  readonly sessionId = 'session.controlled-workspace';
  readonly planDigest: CanonicalDigest;
  readonly attemptId: string;
  readonly descriptorDigest: CanonicalDigest;
  readonly caseId: string;
  readonly materialDigest: CanonicalDigest;
  readonly fixtureDigest: CanonicalDigest;
  readonly baseSnapshotDigest: CanonicalDigest;
  readonly grantDigest: CanonicalDigest;
  readonly toolRegistryDigest: CanonicalDigest;
  readonly actionRegistryDigest: CanonicalDigest;
  readonly generation: number;
  readonly isolationPolicyDigest: CanonicalDigest;
  readonly initialCheckpoint: AgentEvaluationControlledWorkspaceCheckpoint;
  readonly preflightCalls = vi.fn();
  readonly executeCalls = vi.fn();
  readonly reconcileCalls = vi.fn();
  readonly restoreCalls = vi.fn();
  readonly destroyCalls = vi.fn();
  readonly #material: AgentEvaluationCaseMaterial;
  readonly #grant: AgentEvaluationControlledWorkspaceGrant;
  readonly #options: FakeSessionOptions;
  readonly #artifactByRef = new Map<
    string,
    AgentEvaluationControlledPersistedArtifactRef
  >();
  readonly #effectByDispatch = new Map<
    CanonicalDigest,
    AgentEvaluationControlledWorkspaceEffect
  >();
  #currentCheckpoint: AgentEvaluationControlledWorkspaceCheckpoint;
  #throwAfterEffectPersistOnce: boolean;
  #throwBeforeEffectPersistOnce: boolean;

  constructor(
    material: AgentEvaluationCaseMaterial,
    grant: AgentEvaluationControlledWorkspaceGrant,
    isolationPolicyDigest: CanonicalDigest,
    options: FakeSessionOptions
  ) {
    const fixture = (
      material.invocation.blocks.find(
        ({ kind }) => kind === 'workspace-fixture'
      ) as Extract<
        (typeof material.invocation.blocks)[number],
        { kind: 'workspace-fixture' }
      >
    ).fixture;
    this.planDigest = grant.planDigest;
    this.attemptId = grant.attemptId;
    this.descriptorDigest = grant.descriptorDigest;
    this.caseId = grant.caseId;
    this.materialDigest = grant.materialDigest;
    this.fixtureDigest = fixture.fixtureDigest;
    this.baseSnapshotDigest = fixture.workspaceSnapshotDigest;
    this.grantDigest = grant.grantDigest;
    this.toolRegistryDigest = grant.toolRegistryDigest;
    this.actionRegistryDigest = grant.actionRegistryDigest;
    this.generation = grant.generation;
    this.isolationPolicyDigest = isolationPolicyDigest;
    this.initialCheckpoint = createCheckpoint(
      'checkpoint.initial',
      initialSnapshotDigest,
      grant
    );
    this.#currentCheckpoint = this.initialCheckpoint;
    this.#material = material;
    this.#grant = grant;
    this.#options = options;
    this.#throwAfterEffectPersistOnce =
      options.throwAfterEffectPersistOnce ?? false;
    this.#throwBeforeEffectPersistOnce =
      options.throwBeforeEffectPersistOnce ?? false;
  }

  get currentCheckpoint(): AgentEvaluationControlledWorkspaceCheckpoint {
    return this.#currentCheckpoint;
  }

  async preflight(
    input: Parameters<AgentEvaluationControlledWorkspaceSession['preflight']>[0]
  ): Promise<AgentEvaluationControlledWorkspacePreflightReceipt> {
    this.preflightCalls(input);
    const registeredTool = this.#material.invocation.tools.find(
      ({ toolId }) => toolId === input.toolId
    );
    const toolDefinitionDigest =
      registeredTool?.definitionDigest ?? digest(`unknown:${input.toolId}`);
    const inputSchemaDigest = registeredTool
      ? digestAgentCanonicalValue(registeredTool.inputSchema)
      : digest(`unknown-schema:${input.toolId}`);
    let status: 'ready' | 'rejected' = 'ready';
    let code: AgentEvaluationControlledWorkspacePreflightCode | undefined;
    let action:
      | AgentEvaluationWorkspaceFixtureMaterial['actionRegistry'][number]
      | undefined;
    let target: string | undefined;
    if (
      [
        'workspace.direct-write',
        'workspace.commit',
        'approval.self-issue',
      ].includes(input.toolId)
    ) {
      status = 'rejected';
      code = 'direct-write-denied';
    } else if (!registeredTool) {
      status = 'rejected';
      code = 'unknown-tool';
    } else if (
      registeredTool.effect === 'proposal-only' &&
      !(
        this.#material.invocation.blocks.find(
          ({ kind }) => kind === 'workspace-fixture'
        ) as Extract<
          AgentEvaluationCaseMaterial['invocation']['blocks'][number],
          { kind: 'workspace-fixture' }
        >
      ).fixture.actionRegistry.some(
        ({ actionId: registeredActionId }) =>
          registeredActionId ===
          (input.arguments as Readonly<{ actionId?: string }>).actionId
      )
    ) {
      status = 'rejected';
      code = 'unknown-action';
    } else if (
      input.toolId === 'workspace.inspect' &&
      !this.#grant.allowedTargetRefs.includes(
        (input.arguments as Readonly<{ targetRef?: string }>).targetRef ?? ''
      )
    ) {
      status = 'rejected';
      code = 'scope-denied';
    } else if (
      !validateControlledWorkspaceToolArguments(
        registeredTool.inputSchema,
        input.arguments
      ).ok
    ) {
      status = 'rejected';
      code = 'arguments-invalid';
    } else if (registeredTool.effect === 'proposal-only') {
      const record = input.arguments as Readonly<{
        actionId: string;
        targetRef?: string;
        target?: Readonly<{ id?: string }>;
      }>;
      const fixture = (
        this.#material.invocation.blocks.find(
          ({ kind }) => kind === 'workspace-fixture'
        ) as Extract<
          AgentEvaluationCaseMaterial['invocation']['blocks'][number],
          { kind: 'workspace-fixture' }
        >
      ).fixture;
      action = fixture.actionRegistry.find(
        ({ actionId: registeredActionId }) =>
          registeredActionId === record.actionId
      );
      target = record.targetRef ?? record.target?.id;
      if (!action) {
        status = 'rejected';
        code = 'unknown-action';
      } else if (
        !target ||
        !this.#grant.allowedActionIds.includes(action.actionId) ||
        !this.#grant.allowedTargetRefs.includes(target)
      ) {
        status = 'rejected';
        code = 'scope-denied';
      }
    }
    const base = Object.freeze({
      toolId: input.toolId,
      argumentsDigest: input.argumentsDigest,
      grantDigest: input.grantDigest,
      generation:
        input.generation + (this.#options.preflightGenerationOffset ?? 0),
      status,
      ...(code ? { code } : {}),
      ...(status === 'ready' && registeredTool
        ? { effect: registeredTool.effect }
        : {}),
      toolDefinitionDigest,
      inputSchemaDigest,
      ...(status === 'ready' && action && target
        ? {
            actionId: action.actionId,
            actionDescriptorDigest: action.descriptorDigest,
            targetRef: target,
          }
        : {}),
    });
    return Object.freeze({
      ...base,
      preflightReceiptDigest: digestAgentCanonicalValue(base),
    });
  }

  async restoreCheckpoint(
    value: AgentEvaluationControlledWorkspaceCheckpoint
  ): Promise<void> {
    this.restoreCalls(value);
    this.#currentCheckpoint = value;
  }

  #effect(
    input: Parameters<AgentEvaluationControlledWorkspaceSession['execute']>[0]
  ): AgentEvaluationControlledWorkspaceEffect {
    const before = this.#options.staleBefore
      ? digest('stale-before')
      : this.#currentCheckpoint.snapshotDigest;
    const proposal = input.preflight.toolId === 'agent.proposal.create';
    const nextCheckpoint = proposal
      ? this.#currentCheckpoint
      : createCheckpoint(
          'checkpoint.final',
          finalSnapshotDigest,
          this.#grant,
          this.#currentCheckpoint.checkpointDigest
        );
    const persistedArtifacts = Object.freeze(
      (proposal
        ? [persisted(artifacts[0])]
        : artifacts.slice(1).map(persisted)
      ).sort((left, right) =>
        compareUnicodeCodePoints(
          `${left.artifactKind}\u0000${left.artifactRef}`,
          `${right.artifactKind}\u0000${right.artifactRef}`
        )
      )
    );
    const result: AgentJsonValue = proposal
      ? Object.freeze({
          status: 'proposal-ready',
          proposalRef: artifacts[0].artifactRef,
          proposalDigest: artifacts[0].artifactDigest,
        })
      : Object.freeze({
          status: 'verified',
          planRef: artifacts[1].artifactRef,
          closureRef: artifacts[3].artifactRef,
          verdict: this.#options.closureVerdict ?? 'passed',
        });
    const effectCore = Object.freeze({
      intentDigest: input.intentDigest,
      dispatchReceiptDigest: input.dispatchReceiptDigest,
      grantDigest: this.grantDigest,
      generation: this.generation,
      status: 'succeeded' as const,
      effectKind: proposal
        ? ('proposal-dry-run' as const)
        : ('verification-transaction' as const),
      result,
      snapshotBeforeDigest: before,
      snapshotAfterDigest: proposal
        ? this.#currentCheckpoint.snapshotDigest
        : finalSnapshotDigest,
      canonicalWriteObserved: false as const,
      persistedArtifacts,
      commandReceiptDigests: proposal
        ? Object.freeze([])
        : Object.freeze([commandReceiptDigest]),
      transactionReceiptDigests: proposal
        ? Object.freeze([])
        : Object.freeze([transactionReceiptDigest]),
      repairRoundCount: 0,
      changedDocumentIds: proposal
        ? Object.freeze([])
        : Object.freeze([targetRef]),
      ...(proposal
        ? {
            domainDryRun: Object.freeze({
              actionId,
              targetRef,
              typedProposalValidationReceiptDigest:
                proposalValidationReceiptDigest,
              transactionPlanDigest: digest('transaction-plan'),
              reverseTransactionDigest: digest('reverse-transaction'),
            }),
          }
        : {
            g3Verification: Object.freeze({
              verificationPlanReceiptDigest,
              verificationClosureDigest: closureArtifactDigest,
              verdict: this.#options.closureVerdict ?? 'passed',
              verificationAttemptGrantReceiptDigests: Object.freeze([
                verificationAttemptGrantReceiptDigest,
              ]),
            }),
          }),
      checkpoint: nextCheckpoint,
    });
    const candidate = Object.freeze({
      result: effectCore.result,
      persistedArtifacts: effectCore.persistedArtifacts,
      changedDocumentIds: effectCore.changedDocumentIds,
      snapshotBeforeDigest: effectCore.snapshotBeforeDigest,
      snapshotAfterDigest: effectCore.snapshotAfterDigest,
      checkpoint: effectCore.checkpoint,
      ...('domainDryRun' in effectCore
        ? { domainDryRun: effectCore.domainDryRun }
        : {}),
      ...('g3Verification' in effectCore
        ? { g3Verification: effectCore.g3Verification }
        : {}),
    }) as AgentJsonValue;
    const scan = publicScan(
      input.intentDigest,
      candidate,
      proposal ? 'proposal' : 'verification'
    );
    const authorityReceiptDigests = Object.freeze(
      [
        digest(proposal ? 'proposal-authority' : 'verification-authority'),
        ...(!proposal ? [verificationAttemptGrantReceiptDigest] : []),
        scan.fingerprintDigest,
        scan.scanReceiptDigest,
      ].sort(compareUnicodeCodePoints)
    );
    const base = Object.freeze({
      ...effectCore,
      authorityReceiptDigests,
      publicScan: scan,
    });
    return Object.freeze({
      ...base,
      effectReceiptDigest: digestAgentCanonicalValue(base),
    });
  }

  async execute(
    input: Parameters<AgentEvaluationControlledWorkspaceSession['execute']>[0]
  ): Promise<AgentEvaluationControlledWorkspaceEffect> {
    this.executeCalls(input);
    if (this.#throwBeforeEffectPersistOnce) {
      this.#throwBeforeEffectPersistOnce = false;
      throw new Error('simulated crash before effect persistence');
    }
    const effect = this.#effect(input);
    this.#effectByDispatch.set(input.dispatchReceiptDigest, effect);
    this.#currentCheckpoint = effect.checkpoint;
    for (const artifact of effect.persistedArtifacts) {
      this.#artifactByRef.set(artifact.artifactRef, artifact);
    }
    if (this.#throwAfterEffectPersistOnce) {
      this.#throwAfterEffectPersistOnce = false;
      throw new Error('simulated crash after effect persistence');
    }
    return effect;
  }

  async reconcileDispatched(
    input: Parameters<
      AgentEvaluationControlledWorkspaceSession['reconcileDispatched']
    >[0]
  ): ReturnType<
    AgentEvaluationControlledWorkspaceSession['reconcileDispatched']
  > {
    this.reconcileCalls(input);
    const effect = this.#effectByDispatch.get(input.dispatchReceiptDigest);
    if (effect) return Object.freeze({ status: 'completed' as const, effect });
    return Object.freeze({
      status: 'unknown' as const,
      intentDigest: input.intentDigest,
      dispatchReceiptDigest: input.dispatchReceiptDigest,
      grantDigest: input.grantDigest,
      generation: input.generation,
      reconciliationReceiptDigest: digest('session-reconciliation-unknown'),
      cleanupReceiptDigest: digest('session-reconciliation-cleanup'),
    });
  }

  async resolveArtifact(
    artifact: AgentEvaluationResultArtifactRef
  ): Promise<AgentEvaluationControlledPersistedArtifactRef> {
    return this.#artifactByRef.get(artifact.artifactRef)!;
  }

  async assessFinal(
    input: Parameters<
      AgentEvaluationControlledWorkspaceSession['assessFinal']
    >[0]
  ): Promise<AgentEvaluationControlledWorkspaceFinalAuthority> {
    const proposalValidation = Object.freeze({
      verdict: 'passed' as const,
      typedProposalValidationReceiptDigest: proposalValidationReceiptDigest,
    });
    const g3Verification = Object.freeze({
      verificationPlanArtifactRef: artifacts[1].artifactRef,
      verificationPlanArtifactDigest: planArtifactDigest,
      verificationPlanReceiptDigest,
      verificationClosureArtifactRef: artifacts[3].artifactRef,
      verificationClosureDigest: closureArtifactDigest,
      verdict: this.#options.closureVerdict ?? 'passed',
      verificationAttemptGrantReceiptDigests: Object.freeze([
        verificationAttemptGrantReceiptDigest,
      ]),
    });
    const candidate = Object.freeze({
      attemptId: this.attemptId,
      finalSnapshotDigest: this.#currentCheckpoint.snapshotDigest,
      finalCheckpointDigest: this.#currentCheckpoint.checkpointDigest,
      proposalValidation,
      g3Verification,
      repairRoundCount: 0,
    }) as AgentJsonValue;
    const scan = publicScan(
      input.finalAssessmentIntentDigest,
      candidate,
      'final-authority'
    );
    const authorityReceiptDigests = Object.freeze(
      [
        digest('final-proposal-authority'),
        digest('final-verification-authority'),
        verificationAttemptGrantReceiptDigest,
        scan.fingerprintDigest,
        scan.scanReceiptDigest,
      ].sort(compareUnicodeCodePoints)
    );
    const base = Object.freeze({
      attemptId: this.attemptId,
      grantDigest: this.grantDigest,
      generation: this.generation,
      finalSnapshotDigest: this.#currentCheckpoint.snapshotDigest,
      finalCheckpointDigest: this.#currentCheckpoint.checkpointDigest,
      proposalValidation,
      g3Verification,
      repairRoundCount: 0,
      authorityReceiptDigests,
      authorityReceiptSetDigest: authoritySetDigest(authorityReceiptDigests),
      publicScan: scan,
    });
    return Object.freeze({
      ...base,
      finalAuthorityReceiptDigest: digestAgentCanonicalValue(base),
    });
  }

  async destroy(
    input: Parameters<AgentEvaluationControlledWorkspaceSession['destroy']>[0]
  ): Promise<AgentEvaluationControlledWorkspaceCleanupReceipt> {
    this.destroyCalls(input);
    const base = Object.freeze({
      attemptId: this.attemptId,
      grantDigest: this.grantDigest,
      generation: this.generation,
      sessionId: this.sessionId,
      reason: input.reason,
      cleanupIntentDigest: input.cleanupIntentDigest,
      cleanupDispatchReceiptDigest: input.cleanupDispatchReceiptDigest,
      sourceReferencesRevoked: true as const,
      sandboxDestroyed: true as const,
      residualReferenceCount: 0 as const,
    });
    return Object.freeze({
      ...base,
      cleanupReceiptDigest: digestAgentCanonicalValue(base),
    });
  }
}

type OperationRecord = {
  intent: AgentEvaluationControlledWorkspaceOperationIntent;
  claim: AgentEvaluationControlledWorkspaceOperationClaim;
  dispatch?: AgentEvaluationControlledWorkspaceDispatchReceipt;
  seal?: AgentEvaluationControlledWorkspaceOperationSeal;
};

type CleanupRecord = {
  intent: AgentEvaluationControlledWorkspaceCleanupIntent;
  claim: AgentEvaluationControlledWorkspaceCleanupClaim;
  dispatch?: AgentEvaluationControlledWorkspaceCleanupDispatchReceipt;
  seal?: AgentEvaluationControlledWorkspaceCleanupSeal;
};

class FakeLedger implements AgentEvaluationControlledWorkspaceOperationLedger {
  readonly calls: string[] = [];
  readonly #recordByIntent = new Map<CanonicalDigest, OperationRecord>();
  readonly #sealByToolReceipt = new Map<
    CanonicalDigest,
    AgentEvaluationControlledWorkspaceOperationSeal
  >();
  readonly #cleanupByIntent = new Map<CanonicalDigest, CleanupRecord>();
  readonly #attemptState = new Map<
    string,
    AgentEvaluationControlledWorkspaceAttemptState
  >();
  claimGenerationOffset = 0;
  throwBeforeDispatchOnce = false;
  throwAfterSealOnce = false;
  throwAfterCleanupSealOnce = false;
  resumeDispatchedCleanup = false;
  #useOrdinal = 0;
  #cleanupOrdinal = 0;

  async loadAttemptState(
    input: Parameters<
      AgentEvaluationControlledWorkspaceOperationLedger['loadAttemptState']
    >[0]
  ): Promise<AgentEvaluationControlledWorkspaceAttemptState | undefined> {
    const state = this.#attemptState.get(input.attemptId);
    return state &&
      state.grantDigest === input.grantDigest &&
      state.generation === input.generation
      ? state
      : undefined;
  }

  async claim(intent: AgentEvaluationControlledWorkspaceOperationIntent) {
    this.calls.push(`claim:${intent.toolId}`);
    const existing = this.#recordByIntent.get(intent.intentDigest);
    if (existing?.seal)
      return { status: 'sealed' as const, seal: existing.seal };
    if (existing?.dispatch) {
      return {
        status: 'dispatched' as const,
        claim: existing.claim,
        dispatch: existing.dispatch,
      };
    }
    if (existing) return { status: 'claimed' as const, claim: existing.claim };
    this.#useOrdinal += 1;
    const base = Object.freeze({
      claimId: `claim.controlled.${this.#useOrdinal}`,
      intentDigest: intent.intentDigest,
      operationId: intent.operationId,
      planDigest: intent.planDigest,
      attemptId: intent.attemptId,
      sessionId: intent.sessionId,
      grantDigest: intent.grantDigest,
      generation: intent.generation + this.claimGenerationOffset,
      useOrdinal: this.#useOrdinal,
    });
    const claim = Object.freeze({
      ...base,
      claimReceiptDigest: digestAgentCanonicalValue(base),
    });
    this.#recordByIntent.set(intent.intentDigest, { intent, claim });
    return { status: 'claimed' as const, claim };
  }

  async markDispatched(
    input: Parameters<
      AgentEvaluationControlledWorkspaceOperationLedger['markDispatched']
    >[0]
  ): Promise<AgentEvaluationControlledWorkspaceDispatchReceipt> {
    this.calls.push(`dispatch:${input.intent.toolId}`);
    if (this.throwBeforeDispatchOnce) {
      this.throwBeforeDispatchOnce = false;
      throw new Error('simulated crash before durable dispatch');
    }
    const base = Object.freeze({
      claimId: input.claim.claimId,
      intentDigest: input.intent.intentDigest,
      operationId: input.intent.operationId,
      planDigest: input.intent.planDigest,
      attemptId: input.intent.attemptId,
      sessionId: input.intent.sessionId,
      grantDigest: input.intent.grantDigest,
      generation: input.claim.generation,
      priorCheckpointDigest: input.intent.priorCheckpointDigest,
      stagingRef: `staging.${input.claim.useOrdinal}`,
    });
    const dispatch = Object.freeze({
      ...base,
      dispatchReceiptDigest: digestAgentCanonicalValue(base),
    });
    this.#recordByIntent.get(input.intent.intentDigest)!.dispatch = dispatch;
    return dispatch;
  }

  #updateAttemptState(seal: AgentEvaluationControlledWorkspaceOperationSeal) {
    const seals = [...this.#recordByIntent.values()]
      .map(({ seal: value }) => value)
      .filter(
        (value): value is AgentEvaluationControlledWorkspaceOperationSeal =>
          value?.attemptId === seal.attemptId
      );
    const toolExecutionReceiptDigests = seals
      .map(({ toolExecution }) => toolExecution.receipt.receiptDigest)
      .sort(compareUnicodeCodePoints);
    const completedTurnIndexes = seals
      .map(({ toolExecution }) => toolExecution.receipt.turnIndex)
      .sort((left, right) => left - right);
    const base = Object.freeze({
      attemptId: seal.attemptId,
      grantDigest: seal.grantDigest,
      generation: seal.generation,
      currentCheckpoint: seal.checkpoint,
      toolExecutionReceiptDigests: Object.freeze(toolExecutionReceiptDigests),
      aggregateToolResultBytes: 0,
      repairRoundCount: seals.filter(
        ({ effect }) => effect?.effectKind === 'repair-transaction'
      ).length,
      completedTurnIndexes: Object.freeze(completedTurnIndexes),
    });
    this.#attemptState.set(
      seal.attemptId,
      Object.freeze({
        ...base,
        stateReceiptDigest: digestAgentCanonicalValue(base),
      })
    );
  }

  #seal(
    input: Readonly<{
      intent: AgentEvaluationControlledWorkspaceOperationIntent;
      output: AgentEvaluationControlledToolExecutionOutput;
      authorityReceiptDigests: readonly CanonicalDigest[];
      checkpoint: AgentEvaluationControlledWorkspaceCheckpoint;
      dispatch?: AgentEvaluationControlledWorkspaceDispatchReceipt;
      effect?: AgentEvaluationControlledWorkspaceEffect;
    }>
  ): AgentEvaluationControlledWorkspaceOperationSeal {
    const authorityReceiptDigests = Object.freeze(
      [...input.authorityReceiptDigests].sort(compareUnicodeCodePoints)
    );
    const base = Object.freeze({
      intentDigest: input.intent.intentDigest,
      operationId: input.intent.operationId,
      planDigest: input.intent.planDigest,
      attemptId: input.intent.attemptId,
      sessionId: input.intent.sessionId,
      grantDigest: input.intent.grantDigest,
      generation: input.intent.generation,
      ...(input.dispatch
        ? { dispatchReceiptDigest: input.dispatch.dispatchReceiptDigest }
        : {}),
      toolExecutionReceiptDigest: input.output.receipt.receiptDigest,
      ...(input.effect
        ? { effectReceiptDigest: input.effect.effectReceiptDigest }
        : {}),
      authorityReceiptDigests,
      authorityReceiptSetDigest: authoritySetDigest(authorityReceiptDigests),
      checkpoint: input.checkpoint,
    });
    const seal = Object.freeze({
      intentDigest: base.intentDigest,
      operationId: base.operationId,
      planDigest: base.planDigest,
      attemptId: base.attemptId,
      sessionId: base.sessionId,
      grantDigest: base.grantDigest,
      generation: base.generation,
      ...(input.dispatch
        ? { dispatchReceiptDigest: input.dispatch.dispatchReceiptDigest }
        : {}),
      toolExecution: input.output,
      ...(input.effect ? { effect: input.effect } : {}),
      authorityReceiptDigests,
      authorityReceiptSetDigest: base.authorityReceiptSetDigest,
      checkpoint: input.checkpoint,
      sealReceiptDigest: digestAgentCanonicalValue(base),
    });
    const record = this.#recordByIntent.get(input.intent.intentDigest)!;
    record.seal = seal;
    this.#sealByToolReceipt.set(input.output.receipt.receiptDigest, seal);
    this.#updateAttemptState(seal);
    return seal;
  }

  async sealRejected(
    input: Parameters<
      AgentEvaluationControlledWorkspaceOperationLedger['sealRejected']
    >[0]
  ): Promise<AgentEvaluationControlledWorkspaceOperationSeal> {
    this.calls.push(`seal-rejected:${input.intent.toolId}`);
    return this.#seal(input);
  }

  async sealAtomic(
    input: Parameters<
      AgentEvaluationControlledWorkspaceOperationLedger['sealAtomic']
    >[0]
  ): Promise<AgentEvaluationControlledWorkspaceOperationSeal> {
    this.calls.push(`seal:${input.intent.toolId}`);
    const existing = this.#recordByIntent.get(input.intent.intentDigest)?.seal;
    const seal = existing ?? this.#seal(input);
    if (this.throwAfterSealOnce) {
      this.throwAfterSealOnce = false;
      throw new Error('simulated seal acknowledgement loss');
    }
    return seal;
  }

  async reconcileDispatched(
    input: Parameters<
      AgentEvaluationControlledWorkspaceOperationLedger['reconcileDispatched']
    >[0]
  ) {
    this.calls.push(`reconcile:${input.reason}`);
    const seal = this.#recordByIntent.get(input.intent.intentDigest)?.seal;
    return seal
      ? { status: 'sealed' as const, seal }
      : {
          status: 'unsealed' as const,
          reconciliationReceiptDigest: digest('ledger-reconciliation-unsealed'),
        };
  }

  async loadSealedToolExecution(
    input: Parameters<
      AgentEvaluationControlledWorkspaceOperationLedger['loadSealedToolExecution']
    >[0]
  ): Promise<AgentEvaluationControlledWorkspaceOperationSeal | undefined> {
    const seal = this.#sealByToolReceipt.get(input.receiptDigest);
    return seal?.attemptId === input.attemptId &&
      seal.grantDigest === input.grantDigest &&
      seal.generation === input.generation
      ? seal
      : undefined;
  }

  async listSealedToolExecutions(
    input: Parameters<
      AgentEvaluationControlledWorkspaceOperationLedger['listSealedToolExecutions']
    >[0]
  ): Promise<readonly AgentEvaluationControlledWorkspaceOperationSeal[]> {
    return Object.freeze(
      [...this.#recordByIntent.values()]
        .map(({ seal }) => seal)
        .filter(
          (seal): seal is AgentEvaluationControlledWorkspaceOperationSeal =>
            seal?.attemptId === input.attemptId &&
            seal.grantDigest === input.grantDigest &&
            seal.generation === input.generation
        )
    );
  }

  #cleanupClaim(
    intent: AgentEvaluationControlledWorkspaceCleanupIntent
  ): AgentEvaluationControlledWorkspaceCleanupClaim {
    this.#cleanupOrdinal += 1;
    const base = Object.freeze({
      claimId: `claim.cleanup.${this.#cleanupOrdinal}`,
      intentDigest: intent.intentDigest,
      attemptId: intent.attemptId,
      sessionId: intent.sessionId,
      grantDigest: intent.grantDigest,
      generation: intent.generation,
    });
    return Object.freeze({
      ...base,
      claimReceiptDigest: digestAgentCanonicalValue(base),
    });
  }

  #cleanupDispatch(
    intent: AgentEvaluationControlledWorkspaceCleanupIntent,
    claim: AgentEvaluationControlledWorkspaceCleanupClaim
  ): AgentEvaluationControlledWorkspaceCleanupDispatchReceipt {
    const base = Object.freeze({
      claimId: claim.claimId,
      intentDigest: intent.intentDigest,
      attemptId: intent.attemptId,
      sessionId: intent.sessionId,
      grantDigest: intent.grantDigest,
      generation: intent.generation,
    });
    return Object.freeze({
      ...base,
      dispatchReceiptDigest: digestAgentCanonicalValue(base),
    });
  }

  async claimCleanup(intent: AgentEvaluationControlledWorkspaceCleanupIntent) {
    this.calls.push(`cleanup-claim:${intent.reason}`);
    const existing = this.#cleanupByIntent.get(intent.intentDigest);
    if (existing?.seal)
      return { status: 'sealed' as const, seal: existing.seal };
    if (existing?.dispatch) {
      return {
        status: 'dispatched' as const,
        claim: existing.claim,
        dispatch: existing.dispatch,
      };
    }
    if (existing) return { status: 'claimed' as const, claim: existing.claim };
    const claim = this.#cleanupClaim(intent);
    const record: CleanupRecord = { intent, claim };
    this.#cleanupByIntent.set(intent.intentDigest, record);
    if (this.resumeDispatchedCleanup) {
      this.resumeDispatchedCleanup = false;
      record.dispatch = this.#cleanupDispatch(intent, claim);
      return {
        status: 'dispatched' as const,
        claim,
        dispatch: record.dispatch,
      };
    }
    return { status: 'claimed' as const, claim };
  }

  async markCleanupDispatched(
    input: Parameters<
      AgentEvaluationControlledWorkspaceOperationLedger['markCleanupDispatched']
    >[0]
  ): Promise<AgentEvaluationControlledWorkspaceCleanupDispatchReceipt> {
    this.calls.push(`cleanup-dispatch:${input.intent.reason}`);
    const dispatch = this.#cleanupDispatch(input.intent, input.claim);
    this.#cleanupByIntent.get(input.intent.intentDigest)!.dispatch = dispatch;
    return dispatch;
  }

  #cleanupSeal(
    input: Parameters<
      AgentEvaluationControlledWorkspaceOperationLedger['sealCleanup']
    >[0]
  ): AgentEvaluationControlledWorkspaceCleanupSeal {
    const base = Object.freeze({
      intentDigest: input.intent.intentDigest,
      attemptId: input.intent.attemptId,
      sessionId: input.intent.sessionId,
      grantDigest: input.intent.grantDigest,
      generation: input.intent.generation,
      dispatch: input.dispatch,
      dispatchReceiptDigest: input.dispatch.dispatchReceiptDigest,
      cleanupReceiptDigest: input.cleanupReceipt.cleanupReceiptDigest,
    });
    const seal = Object.freeze({
      intentDigest: base.intentDigest,
      attemptId: base.attemptId,
      sessionId: base.sessionId,
      grantDigest: base.grantDigest,
      generation: base.generation,
      dispatch: input.dispatch,
      dispatchReceiptDigest: input.dispatch.dispatchReceiptDigest,
      cleanupReceipt: input.cleanupReceipt,
      sealReceiptDigest: digestAgentCanonicalValue(base),
    });
    this.#cleanupByIntent.get(input.intent.intentDigest)!.seal = seal;
    return seal;
  }

  async sealCleanup(
    input: Parameters<
      AgentEvaluationControlledWorkspaceOperationLedger['sealCleanup']
    >[0]
  ): Promise<AgentEvaluationControlledWorkspaceCleanupSeal> {
    this.calls.push(`cleanup-seal:${input.intent.reason}`);
    const existing = this.#cleanupByIntent.get(input.intent.intentDigest)?.seal;
    const seal = existing ?? this.#cleanupSeal(input);
    if (this.throwAfterCleanupSealOnce) {
      this.throwAfterCleanupSealOnce = false;
      throw new Error('simulated cleanup seal acknowledgement loss');
    }
    return seal;
  }

  async reconcileCleanup(
    input: Parameters<
      AgentEvaluationControlledWorkspaceOperationLedger['reconcileCleanup']
    >[0]
  ) {
    this.calls.push(`cleanup-reconcile:${input.reason}`);
    const seal = this.#cleanupByIntent.get(input.intent.intentDigest)?.seal;
    if (!seal) throw new Error('cleanup is not durably sealed');
    return Object.freeze({ status: 'sealed' as const, seal });
  }
}

class FakeLoader implements AgentEvaluationControlledWorkspaceSessionLoader {
  readonly attachmentStatuses: string[] = [];
  readonly orphanDestroyCalls = vi.fn();
  session?: FakeSession;
  exposeOrphan = false;
  #orphanDestroyed = false;

  constructor(readonly options: FakeSessionOptions) {}

  async loadOrReattach(
    input: Parameters<
      AgentEvaluationControlledWorkspaceSessionLoader['loadOrReattach']
    >[0]
  ): Promise<AgentEvaluationControlledWorkspaceSessionAttachment> {
    const status = this.session ? ('reattached' as const) : ('loaded' as const);
    this.session ??= new FakeSession(
      input.material,
      input.grant,
      input.isolationPolicyDigest,
      this.options
    );
    const base = Object.freeze({
      status,
      sessionId: this.session.sessionId,
      attemptId: this.session.attemptId,
      grantDigest: this.session.grantDigest,
      generation: this.session.generation,
      currentCheckpointDigest: this.session.currentCheckpoint.checkpointDigest,
    });
    this.attachmentStatuses.push(status);
    return Object.freeze({
      ...base,
      session: this.session,
      attachmentReceiptDigest: digestAgentCanonicalValue(base),
    });
  }

  #orphan(): AgentEvaluationControlledWorkspaceOrphanSession | undefined {
    if (!this.exposeOrphan || this.#orphanDestroyed || !this.session) {
      return undefined;
    }
    const base = Object.freeze({
      planDigest: this.session.planDigest,
      attemptId: this.session.attemptId,
      modelDescriptorDigest: this.session.descriptorDigest,
      caseId: this.session.caseId,
      materialDigest: this.session.materialDigest,
      grantDigest: this.session.grantDigest,
      generation: this.session.generation,
      sessionId: this.session.sessionId,
      currentCheckpoint: this.session.currentCheckpoint,
    });
    return Object.freeze({
      ...base,
      orphanReceiptDigest: digestAgentCanonicalValue(base),
    });
  }

  async listOrphanedSessions(): Promise<
    readonly AgentEvaluationControlledWorkspaceOrphanSession[]
  > {
    const orphan = this.#orphan();
    return orphan ? Object.freeze([orphan]) : Object.freeze([]);
  }

  async destroyOrphanedSession(
    input: Parameters<
      AgentEvaluationControlledWorkspaceSessionLoader['destroyOrphanedSession']
    >[0]
  ): Promise<AgentEvaluationControlledWorkspaceCleanupReceipt> {
    this.orphanDestroyCalls(input);
    this.#orphanDestroyed = true;
    const base = Object.freeze({
      attemptId: input.orphan.attemptId,
      grantDigest: input.orphan.grantDigest,
      generation: input.orphan.generation,
      sessionId: input.orphan.sessionId,
      reason: 'orphaned' as const,
      cleanupIntentDigest: input.cleanupIntentDigest,
      cleanupDispatchReceiptDigest: input.cleanupDispatchReceiptDigest,
      sourceReferencesRevoked: true as const,
      sandboxDestroyed: true as const,
      residualReferenceCount: 0 as const,
    });
    return Object.freeze({
      ...base,
      cleanupReceiptDigest: digestAgentCanonicalValue(base),
    });
  }
}

type SubjectOptions = FakeSessionOptions &
  Readonly<{
    invalidGrantAuthority?: boolean;
  }>;

const createSubject = (options: SubjectOptions = {}) => {
  const material = fixtureMaterial();
  const config = configuration();
  const ledger = new FakeLedger();
  const loader = new FakeLoader(options);
  let materialScopeOpen = false;
  const dependencies = Object.freeze({
    repositoryCommit,
    configuration: config,
    now: () => '2026-08-08T00:00:00.000Z',
    materialSource: Object.freeze({
      async use<T>(
        input: Readonly<{
          planDigest: CanonicalDigest;
          attemptId: string;
          descriptorDigest: CanonicalDigest;
          caseId: string;
          materialDigest: CanonicalDigest;
        }>,
        callback: (value: AgentEvaluationCaseMaterial) => Promise<T>
      ): Promise<T> {
        expect(input.planDigest).toBe(planDigest);
        expect(input.caseId).toBe(material.caseId);
        expect(input.materialDigest).toBe(material.materialDigest);
        materialScopeOpen = true;
        try {
          return await callback(material);
        } finally {
          materialScopeOpen = false;
        }
      },
    }),
    authorizer: Object.freeze({
      issue(input: AgentEvaluationControlledWorkspaceAuthorizationInput) {
        return createAgentEvaluationControlledWorkspaceGrant({
          grantId: 'grant.controlled-workspace',
          authorityId: options.invalidGrantAuthority
            ? 'authority.invalid'
            : config.authorityId,
          planDigest: input.planDigest,
          attemptId: input.attemptId,
          descriptorDigest: input.descriptorDigest,
          caseId: input.caseId,
          materialDigest: input.materialDigest,
          fixtureDigest: input.fixture.fixtureDigest,
          baseSnapshotDigest: input.fixture.workspaceSnapshotDigest,
          toolRegistryDigest: input.toolRegistryDigest,
          actionRegistryDigest: input.actionRegistryDigest,
          allowedToolIds: input.toolIds,
          allowedActionIds: input.actionIds,
          allowedTargetRefs: input.targetRefs,
          generation: 1,
          maximumUses: 4,
          issuedAt: '2026-08-07T00:00:00.000Z',
          expiresAt: '2026-08-09T00:00:00.000Z',
        });
      },
    }),
    loader: Object.freeze({
      async loadOrReattach(
        input: Parameters<
          AgentEvaluationControlledWorkspaceSessionLoader['loadOrReattach']
        >[0]
      ) {
        expect(materialScopeOpen).toBe(true);
        return loader.loadOrReattach(input);
      },
      listOrphanedSessions: () => loader.listOrphanedSessions(),
      destroyOrphanedSession: (
        input: Parameters<
          AgentEvaluationControlledWorkspaceSessionLoader['destroyOrphanedSession']
        >[0]
      ) => loader.destroyOrphanedSession(input),
    }),
    operations: ledger,
  });
  let runtime = createAgentEvaluationControlledWorkspaceRuntime(dependencies);
  return {
    get runtime() {
      return runtime;
    },
    restart() {
      runtime = createAgentEvaluationControlledWorkspaceRuntime(dependencies);
      return runtime;
    },
    ledger,
    loader,
    material,
    config,
    get session() {
      return loader.session;
    },
  };
};

const proposalArguments: AgentJsonValue =
  publicAction && publicExpectedProposal
    ? Object.freeze({
        actionId,
        descriptorDigest: publicAction.descriptorDigest,
        ownerId: publicAction.action.ownerId,
        actionType: publicAction.action.actionType,
        inputSchemaId: publicAction.action.inputSchemaId,
        target: publicAction.action.target,
        input: publicExpectedProposal.arguments,
        sourceRefs,
        summary: 'Update the exact typed target.',
      })
    : Object.freeze({
        actionId,
        targetRef,
        arguments: Object.freeze({ requestedValue: 2 }),
        sourceRefs: Object.freeze([sourceRef]),
        summary: 'Update the exact typed target.',
      });

const verificationArguments = Object.freeze({
  proposalRef: artifacts[0].artifactRef,
  proposalDigest,
  workspaceSnapshotDigest: initialSnapshotDigest,
  ...(publicFixture
    ? {
        verificationFixtureDigest:
          publicFixture.verificationFixture.verificationFixtureDigest,
      }
    : {}),
  requiredCheckIds:
    publicFixture?.expectedOutcome.verification.requiredCheckIds ??
    Object.freeze(['check.domain']),
});

const toolInput = (
  subject: ReturnType<typeof createSubject>,
  toolId: string,
  argumentsValue: AgentJsonValue,
  turnIndex: number
): AgentEvaluationControlledToolExecutionInput => ({
  planDigest,
  attemptId,
  descriptorDigest,
  caseId: subject.material.caseId,
  materialDigest: subject.material.materialDigest,
  loopPolicyDigest: subject.config.loop.loopPolicyDigest,
  turnIndex,
  toolCallId: `tool-call.${turnIndex}.${toolId}`,
  toolId,
  arguments: argumentsValue,
  argumentsDigest: digestAgentCanonicalValue(argumentsValue),
  maximumToolResultBytes: subject.config.loop.maximumToolResultBytes,
});

const submissionFor = (
  material: AgentEvaluationCaseMaterial,
  verdict: 'passed' | 'failed'
) => {
  const contract = createAgentEvaluationCaseResultContract(material);
  const submission = decodeAgentEvaluationResultSubmission(
    {
      resultSchemaVersion: 1,
      resultSchemaDigest: AGENT_EVALUATION_RESULT_SUBMISSION_SCHEMA_DIGEST,
      caseId: material.caseId,
      caseDigest: material.caseDigest,
      materialDigest: material.materialDigest,
      caseDefinitionDigest: material.caseDefinitionDigest,
      expectedAuthorityDigest: material.expectedAuthorityDigest,
      gradingPolicyDigest: material.gradingPolicyDigest,
      graderMaterialDigest: material.grader.graderMaterialDigest,
      targetRefs: material.expectedAuthority.exactTargetRefs,
      actionIds: material.expectedAuthority.allowedActionIds,
      contextSourceRefs: material.expectedAuthority.requiredContextSourceRefs,
      diagnosticCodes: material.expectedAuthority.expectedDiagnosticCodes,
      plan: {
        kind: 'typed-plan',
        planRef: artifacts[1].artifactRef,
        planDigest: planArtifactDigest,
        repairRoundCount: 0,
      },
      closure: {
        kind: 'g3-closure',
        closureRef: artifacts[3].artifactRef,
        closureDigest: closureArtifactDigest,
        verdict,
      },
      artifactRefs: artifacts,
    },
    contract
  );
  const receipt = createAgentEvaluationResultSubmissionReceipt(
    {
      attemptId,
      invocationId: 'invocation.controlled-workspace',
      descriptorDigest,
      providerToolCallId: 'provider-call.result-submit',
      toolArgumentsDigest: submission.argumentsDigest,
      toolEventSequence: 4,
      toolEventDigest: digest('result-tool-event'),
      terminalEventSequence: 5,
      terminalEventDigest: digest('result-terminal-event'),
    },
    submission,
    contract
  );
  return { submission, receipt };
};

const executeJourney = async (
  subject: ReturnType<typeof createSubject>,
  verdict: 'passed' | 'failed'
) => {
  const proposal = await subject.runtime.executeTool(
    toolInput(subject, 'agent.proposal.create', proposalArguments, 0)
  );
  const proposalContinuation = await subject.runtime.continue({
    planDigest,
    attemptId,
    descriptorDigest,
    caseId,
    materialDigest: subject.material.materialDigest,
    loopPolicyDigest: subject.config.loop.loopPolicyDigest,
    completedTurnIndex: 0,
    maximumAggregateToolResultBytes:
      subject.config.loop.maximumAggregateToolResultBytes,
    executions: [proposal],
  });
  const verification = await subject.runtime.executeTool(
    toolInput(subject, 'verification.plan.request', verificationArguments, 1)
  );
  const verificationContinuation = await subject.runtime.continue({
    planDigest,
    attemptId,
    descriptorDigest,
    caseId,
    materialDigest: subject.material.materialDigest,
    loopPolicyDigest: subject.config.loop.loopPolicyDigest,
    completedTurnIndex: 1,
    maximumAggregateToolResultBytes:
      subject.config.loop.maximumAggregateToolResultBytes,
    executions: [verification],
  });
  const { submission, receipt } = submissionFor(subject.material, verdict);
  const runtimeInput: AgentEvaluationControlledRuntimeInput = {
    planDigest,
    repositoryCommit,
    attemptId,
    descriptorDigest,
    caseId,
    caseDigest: subject.material.caseDigest,
    materialDigest: subject.material.materialDigest,
    submission,
    submissionReceipt: receipt,
    toolExecutionReceipts: [proposal.receipt, verification.receipt],
    continuationReceipts: [
      proposalContinuation.receipt,
      verificationContinuation.receipt,
    ],
    requiresControlledPreview: false,
    runtimeAuthorityId: subject.config.authorityId,
    runtimeImplementationDigest: subject.config.runtimeImplementationDigest,
    artifactResolutionPolicyDigest:
      subject.config.artifactResolutionPolicyDigest,
    proposalValidationPolicyDigest:
      subject.config.proposalValidationPolicyDigest,
    isolationPolicyDigest: subject.config.isolationPolicyDigest,
    g3VerificationPolicyDigest: subject.config.g3VerificationPolicyDigest,
    controlledRenderPolicyDigest: subject.config.controlledRenderPolicyDigest,
    loopPolicyDigest: subject.config.loop.loopPolicyDigest,
    maximumTurnsPerAttempt: subject.config.loop.maximumTurnsPerAttempt,
    maximumToolCallsPerAttempt: subject.config.loop.maximumToolCallsPerAttempt,
    maximumRepairRoundsPerAttempt:
      subject.config.loop.maximumRepairRoundsPerAttempt,
    maximumAggregateArtifactBytes:
      subject.config.loop.maximumAggregateArtifactBytes,
  };
  return subject.runtime.assessFinal(runtimeInput);
};

describe('production controlled Workspace runtime orchestration', () => {
  it('closes a positive owner dry-run, Transaction/G3 journey and durably destroys the sandbox', async () => {
    const subject = createSubject();
    const receipt = await executeJourney(subject, 'passed');

    expect(receipt.proposalValidation.verdict).toBe('passed');
    expect(receipt.g3Verification.verdict).toBe('passed');
    expect(receipt.isolatedExecution).toMatchObject({
      toolCallCount: 2,
      commandCount: 1,
      transactionCount: 1,
      repairRoundCount: 0,
    });
    expect(receipt).toMatchObject({
      sourceReferencesRevoked: true,
      sandboxDestroyed: true,
      grantGeneration: 1,
    });
    expect(subject.ledger.calls).toEqual(
      expect.arrayContaining([
        'claim:agent.proposal.create',
        'dispatch:agent.proposal.create',
        'seal:agent.proposal.create',
        'claim:verification.plan.request',
        'dispatch:verification.plan.request',
        'seal:verification.plan.request',
        'cleanup-claim:completed',
        'cleanup-dispatch:completed',
        'cleanup-seal:completed',
      ])
    );
    expect(subject.session?.destroyCalls).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'completed' })
    );
  });

  it.each([
    [
      'unknown action',
      'agent.proposal.create',
      { ...proposalArguments, actionId: 'action.unknown' },
      'unknown-action',
    ],
    [
      'schema violation',
      'agent.proposal.create',
      {
        actionId,
        targetRef,
        arguments: { requestedValue: 2 },
        sourceRefs: [sourceRef],
      },
      'arguments-invalid',
    ],
    [
      'scope escalation',
      'workspace.inspect',
      {
        snapshotDigest: initialSnapshotDigest,
        targetRef: 'document.outside-grant',
      },
      'scope-denied',
    ],
    ['direct write', 'workspace.direct-write', {}, 'direct-write-denied'],
  ])(
    'seals %s as a durable non-dispatched rejection',
    async (_label, toolId, value, expectedCode) => {
      const subject = createSubject();
      const output = await subject.runtime.executeTool(
        toolInput(subject, toolId, value as AgentJsonValue, 0)
      );

      expect(output.receipt.status).toBe('rejected');
      expect(output.result).toEqual({
        status: 'rejected',
        code: expectedCode,
      });
      expect(subject.session?.executeCalls).not.toHaveBeenCalled();
      expect(subject.ledger.calls).toContain(`seal-rejected:${toolId}`);
      expect(subject.ledger.calls).not.toContain(`dispatch:${toolId}`);
      await subject.runtime.discardAttempt(attemptId);
      expect(subject.session?.destroyCalls).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'discarded' })
      );
    }
  );

  it('fails closed on a stale owner revision and never accepts its effect', async () => {
    const subject = createSubject({ staleBefore: true });

    await expect(
      subject.runtime.executeTool(
        toolInput(subject, 'agent.proposal.create', proposalArguments, 0)
      )
    ).rejects.toMatchObject({
      code: CONTROLLED_WORKSPACE_RUNTIME_ERROR_CODES.ownerReceiptInvalid,
    });
    expect(subject.session?.executeCalls).toHaveBeenCalledTimes(1);
    expect(subject.session?.reconcileCalls).toHaveBeenCalledTimes(1);
    await subject.runtime.discardAttempt(attemptId);
  });

  it('preserves an unsatisfied G3 Closure as a failed runtime receipt', async () => {
    const subject = createSubject({ closureVerdict: 'failed' });
    const receipt = await executeJourney(subject, 'failed');

    expect(receipt.proposalValidation.verdict).toBe('passed');
    expect(receipt.g3Verification.verdict).toBe('failed');
    expect(subject.session?.destroyCalls).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'failed' })
    );
    expect(subject.ledger.calls).toContain('cleanup-seal:failed');
  });

  it('rejects a grant from the wrong authority before loading a session', async () => {
    const subject = createSubject({ invalidGrantAuthority: true });

    await expect(
      subject.runtime.executeTool(
        toolInput(subject, 'agent.proposal.create', proposalArguments, 0)
      )
    ).rejects.toMatchObject({
      code: CONTROLLED_WORKSPACE_RUNTIME_ERROR_CODES.authorityDenied,
    });
    expect(subject.session).toBeUndefined();
  });

  it('rejects a claim from a foreign grant generation', async () => {
    const subject = createSubject();
    subject.ledger.claimGenerationOffset = 1;

    await expect(
      subject.runtime.executeTool(
        toolInput(subject, 'agent.proposal.create', proposalArguments, 0)
      )
    ).rejects.toMatchObject({
      code: CONTROLLED_WORKSPACE_RUNTIME_ERROR_CODES.persistenceInvalid,
    });
    expect(subject.session?.executeCalls).not.toHaveBeenCalled();
    await subject.runtime.discardAttempt(attemptId);
  });

  it('resumes the same claim after a crash before durable dispatch without running an effect early', async () => {
    const subject = createSubject();
    subject.ledger.throwBeforeDispatchOnce = true;
    const input = toolInput(
      subject,
      'agent.proposal.create',
      proposalArguments,
      0
    );

    await expect(subject.runtime.executeTool(input)).rejects.toThrow(
      'simulated crash before durable dispatch'
    );
    expect(subject.session?.executeCalls).not.toHaveBeenCalled();

    const replay = await subject.runtime.executeTool(input);
    expect(replay.receipt.status).toBe('succeeded');
    expect(subject.session?.executeCalls).toHaveBeenCalledTimes(1);
    expect(
      subject.ledger.calls.filter((call) => call.startsWith('claim:'))
    ).toHaveLength(2);
    await subject.runtime.discardAttempt(attemptId);
  });

  it('reconciles a dispatch-keyed effect persisted immediately before a crash', async () => {
    const subject = createSubject({ throwAfterEffectPersistOnce: true });

    const output = await subject.runtime.executeTool(
      toolInput(subject, 'agent.proposal.create', proposalArguments, 0)
    );

    expect(output.receipt.status).toBe('succeeded');
    expect(subject.session?.executeCalls).toHaveBeenCalledTimes(1);
    expect(subject.session?.reconcileCalls).toHaveBeenCalledTimes(1);
    expect(subject.ledger.calls).toContain('seal:agent.proposal.create');
    await subject.runtime.discardAttempt(attemptId);
  });

  it('reconciles seal acknowledgement loss and replays the exact durable seal without repeating the effect', async () => {
    const subject = createSubject();
    subject.ledger.throwAfterSealOnce = true;
    const input = toolInput(
      subject,
      'agent.proposal.create',
      proposalArguments,
      0
    );

    const first = await subject.runtime.executeTool(input);
    const replay = await subject.runtime.executeTool(input);

    expect(replay).toEqual(first);
    expect(subject.session?.executeCalls).toHaveBeenCalledTimes(1);
    expect(subject.ledger.calls).toContain('reconcile:seal-ack-loss');
    expect(
      subject.ledger.calls.filter(
        (call) => call === 'seal:agent.proposal.create'
      )
    ).toHaveLength(1);
    await subject.runtime.discardAttempt(attemptId);
  });

  it('destroys the sandbox when a dispatched effect cannot be reconciled', async () => {
    const subject = createSubject({ throwBeforeEffectPersistOnce: true });

    await expect(
      subject.runtime.executeTool(
        toolInput(subject, 'agent.proposal.create', proposalArguments, 0)
      )
    ).rejects.toMatchObject({
      code: CONTROLLED_WORKSPACE_RUNTIME_ERROR_CODES.operationUnknown,
    });
    expect(subject.session?.reconcileCalls).toHaveBeenCalledTimes(1);
    expect(subject.session?.destroyCalls).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'failed' })
    );
  });

  it('reattaches the exact durable checkpoint and attempt state after a runner restart', async () => {
    const subject = createSubject();
    await subject.runtime.executeTool(
      toolInput(subject, 'agent.proposal.create', proposalArguments, 0)
    );

    const restarted = subject.restart();
    const output = await restarted.executeTool(
      toolInput(subject, 'verification.plan.request', verificationArguments, 1)
    );

    expect(output.receipt.status).toBe('succeeded');
    expect(subject.loader.attachmentStatuses).toEqual(['loaded', 'reattached']);
    expect(subject.session?.executeCalls).toHaveBeenCalledTimes(2);
    await restarted.discardAttempt(attemptId);
  });

  it('sweeps a loader-reported orphan through durable cleanup without reopening material', async () => {
    const subject = createSubject();
    await subject.runtime.executeTool(
      toolInput(subject, 'agent.proposal.create', proposalArguments, 0)
    );
    subject.loader.exposeOrphan = true;
    const restarted = subject.restart();

    const receipts = await restarted.cleanupOrphanedSessions();

    expect(receipts).toHaveLength(1);
    expect(receipts[0]).toMatchObject({
      reason: 'orphaned',
      sourceReferencesRevoked: true,
      sandboxDestroyed: true,
    });
    expect(subject.loader.orphanDestroyCalls).toHaveBeenCalledTimes(1);
    expect(subject.ledger.calls).toEqual(
      expect.arrayContaining([
        'cleanup-claim:orphaned',
        'cleanup-dispatch:orphaned',
        'cleanup-seal:orphaned',
      ])
    );
  });

  it('resumes an already-dispatched cleanup and seals the exact destroy receipt', async () => {
    const subject = createSubject();
    await subject.runtime.executeTool(
      toolInput(subject, 'agent.proposal.create', proposalArguments, 0)
    );
    subject.ledger.resumeDispatchedCleanup = true;

    const receipt = await subject.runtime.discardAttempt(attemptId);

    expect(receipt).toMatchObject({
      reason: 'discarded',
      sandboxDestroyed: true,
    });
    expect(subject.ledger.calls).not.toContain('cleanup-dispatch:discarded');
    expect(subject.ledger.calls).toContain('cleanup-seal:discarded');
  });

  it('reconciles cleanup seal acknowledgement loss without destroying the sandbox twice', async () => {
    const subject = createSubject();
    await subject.runtime.executeTool(
      toolInput(subject, 'agent.proposal.create', proposalArguments, 0)
    );
    subject.ledger.throwAfterCleanupSealOnce = true;

    const receipt = await subject.runtime.discardAttempt(attemptId);

    expect(receipt).toMatchObject({
      reason: 'discarded',
      sourceReferencesRevoked: true,
      sandboxDestroyed: true,
    });
    expect(subject.session?.destroyCalls).toHaveBeenCalledTimes(1);
    expect(subject.ledger.calls).toContain('cleanup-reconcile:seal-ack-loss');
  });
});
