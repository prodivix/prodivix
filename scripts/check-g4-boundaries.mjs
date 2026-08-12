import { access, readFile, readdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const packagesRoot = join(repoRoot, 'packages');
const issues = [];
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const exists = async (path) =>
  access(path, constants.F_OK)
    .then(() => true)
    .catch(() => false);

const packageEntries = await readdir(packagesRoot, { withFileTypes: true });
const packages = new Map();
for (const entry of packageEntries) {
  if (!entry.isDirectory()) continue;
  const manifest = await readJson(
    join(packagesRoot, entry.name, 'package.json')
  ).catch(() => null);
  if (!manifest?.name?.startsWith('@prodivix/')) continue;
  packages.set(manifest.name, {
    directory: entry.name,
    dependencies: new Set(
      [
        ...Object.keys(manifest.dependencies ?? {}),
        ...Object.keys(manifest.optionalDependencies ?? {}),
      ].filter((name) => name.startsWith('@prodivix/'))
    ),
  });
}

const aiDependencies = packages.get('@prodivix/ai')?.dependencies;
const expectedAiDependencies = new Set([
  '@prodivix/assets',
  '@prodivix/diagnostics',
  '@prodivix/shared',
]);
if (
  !aiDependencies ||
  aiDependencies.size !== expectedAiDependencies.size ||
  [...aiDependencies].some(
    (dependency) => !expectedAiDependencies.has(dependency)
  )
) {
  issues.push(
    `@prodivix/ai dependencies must be exactly ${[
      ...expectedAiDependencies,
    ].join(', ')}.`
  );
}
if (!packages.get('@prodivix/workspace')?.dependencies.has('@prodivix/ai')) {
  issues.push(
    '@prodivix/workspace must compose the @prodivix/ai current owner.'
  );
}

const findPath = (from, target, visited = new Set()) => {
  if (from === target) return [from];
  if (visited.has(from)) return null;
  visited.add(from);
  for (const dependency of packages.get(from)?.dependencies ?? []) {
    const path = findPath(dependency, target, new Set(visited));
    if (path) return [from, ...path];
  }
  return null;
};
for (const dependency of aiDependencies ?? []) {
  const cycle = findPath(dependency, '@prodivix/ai');
  if (cycle) {
    issues.push(
      `G4 package dependency cycle: @prodivix/ai -> ${cycle.join(' -> ')}.`
    );
  }
}

const collectSourceFiles = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true }).catch(
    () => []
  );
  return (
    await Promise.all(
      entries.map(async (entry) => {
        if (entry.name === 'dist' || entry.name === 'node_modules') return [];
        const path = join(directory, entry.name);
        if (entry.isDirectory()) return collectSourceFiles(path);
        return /\.(?:go|ts|tsx)$/u.test(entry.name) &&
          !/\.(?:test|spec)\.(?:ts|tsx)$/u.test(entry.name)
          ? [path]
          : [];
      })
    )
  ).flat();
};

const sourceFiles = [
  ...(await collectSourceFiles(join(repoRoot, 'apps'))),
  ...(await collectSourceFiles(join(repoRoot, 'packages'))),
];
const ownerTypes = [
  'AgentPolicy',
  'AgentTaskSpec',
  'AgentRun',
  'AgentCapabilityGrant',
  'AgentContextPack',
  'AgentContextContributor',
  'AgentCapabilityProfile',
  'AgentCapabilityQualification',
  'AgentProviderConfigurationIdentity',
  'AgentModelLineage',
  'AgentUsageVector',
  'AgentModelInvocationReceipt',
  'AgentModalityProfile',
  'AgentMediaSourceDescriptor',
  'AgentMediaTransformationReceipt',
  'AgentMediaRepresentation',
  'AgentGeneratedArtifactCandidate',
  'AgentGeneratedAssetProposal',
  'AgentToolDescriptor',
  'AgentToolRegistrySnapshot',
  'AgentRetrievalIndexIdentity',
  'AgentHostedSandboxDescriptor',
  'AgentMcpServerIdentity',
  'AgentComputerUseSession',
  'AgentActionProposal',
  'AgentProposalPlanningReceipt',
  'AgentProposalPreview',
  'AgentApprovalDecision',
  'AgentWorkspaceMutationReceipt',
  'AgentCommittedVerificationPlanBinding',
  'AgentVerificationClosureReceipt',
  'AgentRepairCounterexampleSet',
  'AgentRepairRoundReceipt',
  'AgentAuditEvent',
  'AgentModelEvaluationPlan',
  'AgentModelEvaluationAttempt',
  'AgentModelEvaluationManifest',
  'AgentModelEvaluationEvidenceBundle',
  'AgentModelEvaluationEvidenceIndex',
  'AgentModelEvaluationEvidenceRoot',
  'AgentModelEvaluationEvidenceArchiveAttestation',
  'AgentEvaluationEndpointSmokeDispatchIntent',
  'AgentEvaluationEndpointSmokeResultSpoolReceipt',
  'AgentEvaluationEndpointSmokeResultSpoolDispositionReceipt',
  'AgentEvaluationEndpointSmokeReceipt',
  'AgentEvaluationTransportDispatchIntent',
  'AgentEvaluationTransportReceipt',
  'AgentEvaluationPreDispatchFailureReceipt',
  'AgentEvaluationProviderResultSpoolReceipt',
  'AgentEvaluationProviderResultSpoolDispositionReceipt',
  'AgentEvaluationInvocationTurnReceipt',
  'AgentEvaluationInvocationTurnSetReceipt',
  'AgentEvaluationResultSubmissionReceipt',
  'AgentEvaluationControlledRuntimeReceipt',
  'AgentEvaluationReviewRasterScanReceipt',
  'AgentEvaluationReviewCandidateRef',
  'AgentEvaluationBlindReviewMappingRef',
  'AgentEvaluationValidatedHumanReviewArtifact',
  'AgentEvaluationCapabilityExecutionReceipt',
  'AgentEvaluationVerificationAttemptGrantReceipt',
  'AgentEvaluationSourceReceipt',
  'AgentEvaluationExecutionReceipt',
  'AgentG4GoldenClosureManifest',
];
const declarationPattern = new RegExp(
  `^(?:export\\s+)?(?:type|interface|class)\\s+(${ownerTypes.join('|')})\\b|^type\\s+(${ownerTypes.join('|')})\\s+struct\\b`,
  'gmu'
);
const forbiddenToolName =
  /(?:^|[._:/-])(?:apply|approve|approval|commit|rollback)(?:$|[._:/-])|(?:^|[._:/-])(?:workspace[._:/-]patch|json[._:/-]patch|file[._:/-]write)(?:$|[._:/-])/iu;

for (const file of sourceFiles) {
  const source = await readFile(file, 'utf8');
  const path = relative(repoRoot, file).replaceAll('\\', '/');
  for (const match of source.matchAll(declarationPattern)) {
    if (!path.startsWith('packages/ai/src/')) {
      issues.push(
        `${path} duplicates @prodivix/ai owner type ${match[1] ?? match[2]}.`
      );
    }
  }
  if (source.includes('@prodivix/shared/llm') || source.includes('/src/llm')) {
    issues.push(`${path} still imports the retired shared LLM owner.`);
  }
  if (source.includes('@prodivix/ai/src/')) {
    issues.push(`${path} bypasses the public @prodivix/ai package boundary.`);
  }
  if (source.includes('/v1beta/interactions')) {
    issues.push(
      `${path} still references the retired Gemini Interactions v1beta production route.`
    );
  }
  if (source.includes('AiDraftToolRegistry') && source.includes('.register(')) {
    for (const match of source.matchAll(/name\s*:\s*(['"])([^'"]+)\1/gu)) {
      if (forbiddenToolName.test(match[2])) {
        issues.push(
          `${path} registers model-callable authoring tool ${match[2]}.`
        );
      }
    }
  }
}

const geminiStableInteractionSources = new Map(
  await Promise.all(
    [
      [
        'apps/agent-evaluation-runner/src/config.ts',
        ['https://generativelanguage.googleapis.com/v1/interactions?alt=sse'],
      ],
      [
        'apps/agent-evaluation-runner/src/egress.ts',
        ["endpoint.pathname !== '/v1/interactions'", "'/v1/interactions/'"],
      ],
      [
        'packages/ai/src/providers/agentCapabilityProbeProviderWire.ts',
        ["'/v1/interactions'", "'/v1/interactions/{interaction-id}'"],
      ],
      [
        'packages/ai/src/providers/agentNativeProviderCapabilityRuntime.ts',
        ["'/v1/interactions'", "'/v1/interactions/{interaction-id}'"],
      ],
    ].map(async ([path, requiredTokens]) => [
      path,
      { requiredTokens, source: await readFile(join(repoRoot, path), 'utf8') },
    ])
  )
);
for (const [
  path,
  { requiredTokens, source },
] of geminiStableInteractionSources) {
  if (requiredTokens.some((token) => !source.includes(token))) {
    issues.push(
      `${path} must retain the stable Gemini Interactions v1 production route authority.`
    );
  }
}

const sharedLlmDirectory = join(packagesRoot, 'shared', 'src', 'llm');
if ((await readdir(sharedLlmDirectory).catch(() => [])).length > 0) {
  issues.push(
    'packages/shared/src/llm must be removed by the G4 owner hard cut.'
  );
}
const sharedIndex = await readFile(
  join(packagesRoot, 'shared', 'src', 'index.ts'),
  'utf8'
);
if (/llm/iu.test(sharedIndex)) {
  issues.push(
    'The shared package root must not re-export the retired LLM owner.'
  );
}

const currentSource = await readFile(
  join(packagesRoot, 'ai', 'src', 'domain', 'agent.types.ts'),
  'utf8'
);
if (/\b(?:wireVersion|schemaVersion)\??\s*:/u.test(currentSource)) {
  issues.push('G4 current domain must not expose wire/schema version fields.');
}

const v1ProviderSource = (
  await Promise.all(
    [
      'packages/ai/src/providers/agentProvider.types.ts',
      'packages/ai/src/providers/agentProviderIdentity.ts',
      'packages/ai/src/providers/agentProviderCodec.ts',
      'packages/ai/src/providers/agentProviderAdapter.ts',
      'packages/ai/src/providers/agentCapabilityQualification.ts',
      'packages/ai/src/providers/agentInvocation.ts',
      'packages/ai/src/providers/agentInvocationFacts.ts',
      'packages/ai/src/providers/agentInvocationPreflight.ts',
      'packages/ai/src/providers/agentInvocationReceipt.ts',
      'packages/ai/src/providers/agentInvocationValidation.ts',
      'packages/ai/src/providers/agentProviderJob.ts',
      'packages/ai/src/usage/agentUsage.ts',
      'packages/ai/src/usage/agentBudgetLedger.ts',
      'packages/ai/src/wire/agentProviderWire.ts',
    ].map((path) => readFile(join(repoRoot, path), 'utf8'))
  )
).join('\n');
for (const token of [
  'AgentProviderConfigurationIdentity',
  'AgentModelLineage',
  'AgentCapabilityProfile',
  'AgentCapabilityQualification',
  'AgentProviderAdapter',
  'agentProviderFactWireSchema',
  'migrateAgentProviderFactWire',
  'runAgentCapabilityProbe',
  'preflightAgentInvocation',
  'provenIsolation',
  'AgentProviderJobReceipt',
  'AgentUsageVector',
  'reserveAgentBudget',
]) {
  if (!v1ProviderSource.includes(token)) {
    issues.push(`G4 V1 provider boundary is missing ${token}.`);
  }
}
if (
  /\bwireVersion\??\s*:/u.test(
    await readFile(
      join(packagesRoot, 'ai', 'src', 'providers', 'agentProvider.types.ts'),
      'utf8'
    )
  )
) {
  issues.push('G4 V1 provider current models must not expose wireVersion.');
}

const v1ContextSources = await Promise.all(
  [
    'packages/ai/src/context/agentContext.types.ts',
    'packages/ai/src/context/agentContextBuilder.ts',
    'packages/ai/src/context/agentContextValidation.ts',
    'packages/ai/src/policy/agentPolicyEvaluation.ts',
    'packages/workspace/src/agent/workspaceAgentContextContributors.ts',
  ].map(async (path) => ({
    path,
    source: await readFile(join(repoRoot, path), 'utf8'),
  }))
);
const v1ContextSource = v1ContextSources.map(({ source }) => source).join('\n');
for (const token of [
  'AgentPolicyLayerKind',
  'evaluateEffectiveAgentPolicy',
  'createAgentContextContributorDescriptor',
  'buildAgentContextPack',
  'createWorkspaceSemanticAgentContextContributor',
  'createWorkspaceCodeAgentContextContributor',
  'createWorkspaceSourceTraceAgentContextContributor',
  'createWorkspaceIssuesAgentContextContributor',
  'createWorkspaceScenarioAgentContextContributor',
  'createWorkspaceVerificationAgentContextContributor',
]) {
  if (!v1ContextSource.includes(token)) {
    issues.push(`G4 V1 Context/Policy boundary is missing ${token}.`);
  }
}

const v2MediaSources = await Promise.all(
  [
    'packages/ai/src/multimodal/agentMultimodal.types.ts',
    'packages/ai/src/multimodal/agentMediaIdentity.ts',
    'packages/ai/src/multimodal/agentMediaTransform.ts',
    'packages/ai/src/multimodal/agentMultimodalContext.ts',
    'packages/ai/src/multimodal/agentVisualGrounding.ts',
    'packages/ai/src/multimodal/agentGeneratedArtifact.ts',
    'packages/ai/src/multimodal/agentRealtimeMedia.ts',
    'packages/ai/src/multimodal/agentMediaCodec.ts',
    'packages/ai/src/wire/agentMediaWire.ts',
  ].map(async (path) => ({
    path,
    source: await readFile(join(repoRoot, path), 'utf8'),
  }))
);
const v2MediaSource = v2MediaSources.map(({ source }) => source).join('\n');
for (const token of [
  'createRequiredAgentMultimodalCapabilityProfiles',
  'executeAgentMediaTransformChain',
  'normalizeAgentProviderMediaBlock',
  'resolveAgentVisualObservation',
  'adoptAgentGeneratedArtifactCandidate',
  'admitFinalAgentRealtimeTurn',
  'agentMediaFactWireSchema',
  "commitAuthority: 'none-before-approval'",
]) {
  if (!v2MediaSource.includes(token)) {
    issues.push(`G4 V2 media boundary is missing ${token}.`);
  }
}
for (const { path, source } of v2MediaSources) {
  for (const pattern of [
    /from\s+['"]react/iu,
    /apps\/web/iu,
    /document\.(?:querySelector|getElementById)/u,
    /\blocalStorage\b/u,
  ]) {
    if (pattern.test(source)) {
      issues.push(
        `${path} crosses the G4 V2 transport-neutral media boundary.`
      );
    }
  }
}
if (!v2MediaSource.includes("from '@prodivix/assets'")) {
  issues.push('G4 V2 generated media must compose the public G2 Asset owner.');
}

const v3HostedSources = await Promise.all(
  [
    'packages/ai/src/hosted/agentHosted.types.ts',
    'packages/ai/src/hosted/agentToolRegistry.ts',
    'packages/ai/src/hosted/agentToolLifecycle.ts',
    'packages/ai/src/hosted/agentRetrieval.ts',
    'packages/ai/src/hosted/agentCapabilityBoundaries.ts',
    'packages/ai/src/hosted/agentHostedSandbox.ts',
    'packages/ai/src/hosted/agentMcp.ts',
    'packages/ai/src/hosted/agentComputerUse.ts',
    'packages/ai/src/hosted/agentManagedAgent.ts',
    'packages/ai/src/hosted/agentParallelTool.ts',
    'packages/ai/src/hosted/agentHostedCodec.ts',
    'packages/ai/src/wire/agentHostedWire.ts',
  ].map(async (path) => ({
    path,
    source: await readFile(join(repoRoot, path), 'utf8'),
  }))
);
const v3HostedSource = v3HostedSources.map(({ source }) => source).join('\n');
for (const token of [
  'createAgentToolDescriptor',
  'discoverAgentTools',
  'preflightAgentToolCall',
  'executeAgentHostedToolCall',
  'preflightAgentRetrievalFetch',
  'createAgentRetrievalIndexIdentity',
  'createAgentRetrievalIndexDeletionReceipt',
  'createAgentHostedSandboxDescriptor',
  'createAgentMcpServerIdentity',
  'authorizeAgentComputerUseAction',
  'createAgentParallelToolPlan',
  'joinAgentParallelToolResults',
  'createAgentManagedAgentAdmission',
  'agentHostedFactWireSchema',
  'decodeAgentHostedFact',
  "'staged-proposal-only'",
]) {
  if (!v3HostedSource.includes(token)) {
    issues.push(`G4 V3 Hosted capability boundary is missing ${token}.`);
  }
}
for (const { path, source } of v3HostedSources) {
  for (const pattern of [
    /from\s+['"]react/iu,
    /apps\/web/iu,
    /from\s+['"]@prodivix\/(?:workspace|runtime|verification)/iu,
    /\blocalStorage\b/u,
  ]) {
    if (pattern.test(source)) {
      issues.push(
        `${path} crosses the G4 V3 transport-neutral owner boundary.`
      );
    }
  }
}

const v4ControlSources = await Promise.all(
  [
    'packages/ai/src/control/agentControl.types.ts',
    'packages/ai/src/control/agentControlValidation.ts',
    'packages/ai/src/control/agentTask.ts',
    'packages/ai/src/control/agentRunFacts.ts',
    'packages/ai/src/control/agentRunReducer.ts',
    'packages/ai/src/control/agentControlPlane.ts',
    'packages/ai/src/control/agentClaimLease.ts',
    'packages/ai/src/control/agentRecovery.ts',
    'packages/ai/src/control/agentAuditSanitizer.ts',
    'packages/ai/src/control/agentAudit.ts',
    'packages/ai/src/control/agentControlCodec.ts',
    'packages/ai/src/usage/agentBudgetLedger.ts',
    'packages/ai/src/wire/agentControlWire.ts',
  ].map(async (path) => ({
    path,
    source: await readFile(join(repoRoot, path), 'utf8'),
  }))
);
const v4ControlSource = v4ControlSources.map(({ source }) => source).join('\n');
for (const token of [
  'AgentTaskRecord',
  'AgentRunSnapshot',
  'AgentRunAttempt',
  'AgentRunPendingOperation',
  'AgentRunSuccessProof',
  'createAgentTaskRecord',
  'reduceAgentRun',
  'reserveAgentRunBudget',
  'settleAgentRunBudget',
  'recoverAgentRun',
  'claimAgentRunLease',
  'createAgentAuditExport',
  'agentControlFactWireSchema',
  'callbackAuthority',
]) {
  if (!v4ControlSource.includes(token)) {
    issues.push(`G4 V4 control-plane boundary is missing ${token}.`);
  }
}
for (const { path, source } of v4ControlSources) {
  for (const pattern of [
    /from\s+['"]react/iu,
    /apps\/web/iu,
    /from\s+['"]@prodivix\/(?:workspace|workspace-sync|runtime|verification)/iu,
    /\blocalStorage\b/u,
  ]) {
    if (pattern.test(source)) {
      issues.push(
        `${path} crosses the G4 V4 transport-neutral owner boundary.`
      );
    }
  }
}

const v5ProposalSources = await Promise.all(
  [
    'packages/ai/src/proposal/agentProposal.types.ts',
    'packages/ai/src/proposal/agentActionRegistry.ts',
    'packages/ai/src/proposal/agentProposal.ts',
    'packages/ai/src/proposal/agentProposalPreview.ts',
    'packages/ai/src/proposal/agentApproval.ts',
    'packages/ai/src/proposal/agentWorkspaceMutation.ts',
    'packages/ai/src/proposal/agentProposalCodec.ts',
    'packages/ai/src/wire/agentProposalWire.ts',
    'packages/workspace/src/agent/workspaceAgentActionRegistry.ts',
    'packages/workspace-sync/src/agent/workspaceAgentProposalCoordinator.ts',
  ].map(async (path) => ({
    path,
    source: await readFile(join(repoRoot, path), 'utf8'),
  }))
);
const v5ProposalSource = v5ProposalSources
  .map(({ source }) => source)
  .join('\n');
for (const token of [
  'createAgentActionRegistrySnapshot',
  'createAgentActionProposal',
  'createAgentProposalPlanningReceipt',
  'createAgentProposalPreview',
  'createAgentApprovalDecision',
  'preflightAgentApproval',
  'preflightAgentRollback',
  'decodeAgentProposalFact',
  'WORKSPACE_AGENT_ACTION_REGISTRY',
  'createWorkspaceAgentActionTransactionPlan',
  'createWorkspaceAgentProposalProjection',
  'prepareWorkspaceAgentCommit',
  'reconcileWorkspaceAgentCommit',
  'rejectWorkspaceAgentCommitConflict',
  'prepareWorkspaceAgentRollback',
  'createWorkspaceOutboxEntry',
]) {
  if (!v5ProposalSource.includes(token)) {
    issues.push(`G4 V5 proposal/approval boundary is missing ${token}.`);
  }
}
for (const { path, source } of v5ProposalSources) {
  if (
    path.startsWith('packages/ai/') &&
    /from\s+['"]@prodivix\/(?:workspace|workspace-sync|runtime|verification)/iu.test(
      source
    )
  ) {
    issues.push(
      `${path} crosses the G4 V5 transport-neutral AI owner boundary.`
    );
  }
  if (
    path !==
      'packages/workspace-sync/src/agent/workspaceAgentProposalCoordinator.ts' &&
    /createWorkspaceOutboxEntry|prepareWorkspaceAgentCommit|prepareWorkspaceAgentRollback/u.test(
      source
    )
  ) {
    issues.push(`${path} creates a second G4 V5 Agent Workspace write path.`);
  }
}
for (const { path, source } of v5ProposalSources.filter(({ path }) =>
  path.startsWith('packages/ai/')
)) {
  for (const pattern of [
    /from\s+['"]react/iu,
    /apps\/web/iu,
    /\blocalStorage\b/u,
  ]) {
    if (pattern.test(source)) {
      issues.push(
        `${path} crosses the G4 V5 transport-neutral proposal boundary.`
      );
    }
  }
}

const v6VerificationSources = await Promise.all(
  [
    'packages/ai/src/verification/agentVerification.types.ts',
    'packages/ai/src/verification/agentVerification.ts',
    'packages/ai/src/verification/agentVerificationCodec.ts',
    'packages/ai/src/wire/agentVerificationWire.ts',
    'packages/workspace-sync/src/agent/workspaceAgentVerificationCoordinator.ts',
  ].map(async (path) => ({
    path,
    source: await readFile(join(repoRoot, path), 'utf8'),
  }))
);
const v6VerificationSource = v6VerificationSources
  .map(({ source }) => source)
  .join('\n');
for (const token of [
  'AgentCommittedVerificationPlanBinding',
  'AgentVerificationClosureReceipt',
  'AgentRepairCounterexampleSet',
  'AgentRepairRoundReceipt',
  'createAgentCommittedVerificationPlanBinding',
  'createAgentVerificationClosureReceipt',
  'createAgentRepairRoundReceipt',
  'decodeAgentVerificationFact',
  'createWorkspaceAgentVerificationPlanBinding',
  'evaluateWorkspaceAgentVerificationClosure',
  'createWorkspaceAgentApplySuccessProof',
  'deriveWorkspaceAgentRepairCounterexamples',
  'prepareWorkspaceAgentRepairRound',
  'bindWorkspaceAgentRepairProposal',
]) {
  if (!v6VerificationSource.includes(token)) {
    issues.push(`G4 V6 Verification/repair boundary is missing ${token}.`);
  }
}
for (const { path, source } of v6VerificationSources) {
  if (
    path.startsWith('packages/ai/') &&
    /from\s+['"]@prodivix\/(?:workspace|workspace-sync|runtime|verification)/iu.test(
      source
    )
  ) {
    issues.push(
      `${path} crosses the G4 V6 transport-neutral AI owner boundary.`
    );
  }
  for (const pattern of [
    /from\s+['"]react/iu,
    /apps\/web/iu,
    /\blocalStorage\b/u,
  ]) {
    if (pattern.test(source)) {
      issues.push(`${path} crosses the G4 V6 Verification/repair boundary.`);
    }
  }
}

const v7ProductSources = await Promise.all(
  [
    'packages/ai/src/product/agentProduct.types.ts',
    'packages/ai/src/product/agentProduct.ts',
    'packages/ai/src/product/agentProductCodec.ts',
    'packages/ai/src/product/agentProductLedgerCodec.ts',
    'packages/ai/src/wire/agentProductWire.ts',
    'packages/workspace-sync/src/agent/workspaceAgentProductProjection.ts',
  ].map(async (path) => ({
    path,
    source: await readFile(join(repoRoot, path), 'utf8'),
  }))
);
const v7ProductSource = v7ProductSources.map(({ source }) => source).join('\n');
for (const token of [
  'AgentProductView',
  'AgentRunUserCommand',
  'createAgentProductSupplement',
  'createAgentRunUserCommand',
  'createAgentProductView',
  'decodeAgentProductLedgerBundle',
  'agentProductViewWireSchema',
  'createWorkspaceAgentProductSupplement',
]) {
  if (!v7ProductSource.includes(token)) {
    issues.push(`G4 V7 product boundary is missing ${token}.`);
  }
}
for (const { path, source } of v7ProductSources) {
  if (
    path.startsWith('packages/ai/') &&
    /from\s+['"]@prodivix\/(?:workspace|workspace-sync|runtime|verification)/iu.test(
      source
    )
  ) {
    issues.push(
      `${path} crosses the G4 V7 transport-neutral AI owner boundary.`
    );
  }
  for (const pattern of [
    /from\s+['"]react/iu,
    /apps\/web/iu,
    /\blocalStorage\b/u,
  ]) {
    if (pattern.test(source)) {
      issues.push(`${path} crosses the G4 V7 product projection boundary.`);
    }
  }
}

const v7WebClientSource = await readFile(
  join(
    repoRoot,
    'apps',
    'web',
    'src',
    'editor',
    'features',
    'agent',
    'agentProductClient.ts'
  ),
  'utf8'
);
const v7CliSource = await readFile(
  join(repoRoot, 'apps', 'cli', 'src', 'commands', 'agent.ts'),
  'utf8'
);
for (const [surface, source] of [
  ['Web', v7WebClientSource],
  ['CLI', v7CliSource],
]) {
  if (!source.includes('decodeAgentProductLedgerBundle')) {
    issues.push(
      `G4 V7 ${surface} must consume the shared strict product decoder.`
    );
  }
  if (/skip[-_ ]approval/iu.test(source)) {
    issues.push(`G4 V7 ${surface} exposes an approval bypass.`);
  }
}

const v8EvaluationSources = await Promise.all(
  [
    'packages/ai/src/providers/agentNativeProviderAdapters.ts',
    'packages/ai/src/providers/agentProviderRuntime.ts',
    'packages/ai/src/security/agentSecurity.types.ts',
    'packages/ai/src/security/agentSecurity.ts',
    'packages/ai/src/evaluation/agentEvaluation.types.ts',
    'packages/ai/src/evaluation/agentEvaluationCorpus.ts',
    'packages/ai/src/evaluation/agentEvaluationCorpusMaterial.types.ts',
    'packages/ai/src/evaluation/agentEvaluationCorpusMaterial.ts',
    'packages/ai/src/evaluation/agentEvaluationPublicCorpusMaterial.ts',
    'packages/ai/src/evaluation/agentEvaluationArtifactGuard.ts',
    'packages/ai/src/evaluation/agentEvaluationPlan.ts',
    'packages/ai/src/evaluation/agentEvaluationResults.ts',
    'packages/ai/src/evaluation/agentEvaluationRepository.ts',
    'packages/ai/src/evaluation/agentEvaluationRunner.ts',
    'packages/ai/src/evaluation/agentEvaluationEndpointSmoke.ts',
    'packages/ai/src/evaluation/agentEvaluationEvidenceAuthenticity.types.ts',
    'packages/ai/src/evaluation/agentEvaluationEvidenceAuthenticity.ts',
    'packages/ai/src/evaluation/agentEvaluationEvidenceAuthenticityValidation.ts',
    'packages/ai/src/evaluation/agentEvaluationPreDispatchFailure.ts',
    'packages/ai/src/evaluation/agentEvaluationCapabilityExecution.ts',
    'packages/ai/src/evaluation/agentEvaluationVerificationAttemptGrant.ts',
    'packages/ai/src/evaluation/agentEvaluationControlledRuntime.ts',
    'packages/ai/src/evaluation/agentEvaluationValidatedHumanReview.ts',
    'packages/ai/src/evaluation/agentEvaluationEvidenceBundle.ts',
    'packages/ai/src/evaluation/agentEvaluationEvidenceArchive.ts',
    'packages/ai/src/evaluation/agentEvaluationCodec.ts',
    'packages/ai/src/wire/agentEvaluationWire.ts',
  ].map(async (path) => ({
    path,
    source: await readFile(join(repoRoot, path), 'utf8'),
  }))
);
const v8EvaluationSource = v8EvaluationSources
  .map(({ source }) => source)
  .join('\n');
for (const token of [
  'createOpenAIResponsesAgentProviderAdapter',
  'createAnthropicMessagesAgentProviderAdapter',
  'createGeminiInteractionsAgentProviderAdapter',
  'createOpenAICompatibleAgentProviderAdapter',
  'CallbackBoundAgentProviderInvocationMaterialResolver',
  'invokeRuntime',
  'CallbackBoundAgentSecretTransport',
  'authorizeAgentEgress',
  'inspectAgentPublicEvaluationArtifact',
  'AgentModelEvaluationPlan',
  'AgentModelEvaluationAttempt',
  'AgentModelEvaluationManifest',
  'AgentModelEvaluationEvidenceBundle',
  'AgentModelEvaluationEvidenceIndex',
  'AgentModelEvaluationEvidenceRoot',
  'AgentEvaluationEndpointSmokeDispatchIntent',
  'AgentEvaluationEndpointSmokeResultSpoolReceipt',
  'AgentEvaluationEndpointSmokeResultSpoolDispositionReceipt',
  'AgentEvaluationTransportDispatchIntent',
  'AgentEvaluationTransportReceipt',
  'AgentEvaluationProviderResultSpoolReceipt',
  'AgentEvaluationProviderResultSpoolDispositionReceipt',
  'AgentEvaluationInvocationTurnReceipt',
  'AgentEvaluationInvocationTurnSetReceipt',
  'AgentEvaluationCapabilityExecutionReceipt',
  'AgentEvaluationVerificationAttemptGrantReceipt',
  'AgentEvaluationValidatedHumanReviewArtifact',
  'verifyAgentModelEvaluationAuthorityAttestation',
  'AgentEvaluationRestrictedMaterialSource',
  'scanAndRedactAgentEvaluationPublicArtifact',
  'G4_V8_MINIMUM_EVALUATION_CORPUS',
  'minimumAgentEvaluationJourneyFloor',
  'planAgentModelEvaluationAttempts',
  'AgentModelEvaluationShardRunner',
  'InMemoryAgentEvaluationRepository',
  'createAgentModelEvaluationManifest',
  'decodeAgentEvaluationFact',
  'agentEvaluationFactWireSchema',
]) {
  if (!v8EvaluationSource.includes(token)) {
    issues.push(`G4 V8 security/evaluation boundary is missing ${token}.`);
  }
}
for (const { path, source } of v8EvaluationSources) {
  for (const pattern of [
    /from\s+['"]react/iu,
    /apps\/web/iu,
    /from\s+['"]@prodivix\/(?:workspace|workspace-sync|runtime|verification)/iu,
    /\blocalStorage\b/u,
  ]) {
    if (pattern.test(source)) {
      issues.push(
        `${path} crosses the G4 V8 transport-neutral evaluation boundary.`
      );
    }
  }
}
if (
  /\bfetch\s*\(/u.test(v8EvaluationSource) ||
  /process\.env/u.test(v8EvaluationSource)
) {
  issues.push(
    'G4 V8 evaluation owner must inject Provider transport and must not resolve credentials or network globally.'
  );
}

const evaluationRunnerRoot = join(repoRoot, 'apps', 'agent-evaluation-runner');
const evaluationRunnerManifest = await readJson(
  join(evaluationRunnerRoot, 'package.json')
);
if (
  evaluationRunnerManifest.browser !== false ||
  evaluationRunnerManifest.exports?.['.']?.browser !==
    './dist/browserDenied.js' ||
  evaluationRunnerManifest.dependencies?.['@prodivix/ai'] !== 'workspace:*' ||
  evaluationRunnerManifest.dependencies?.['@prodivix/shared'] !== 'workspace:*'
) {
  issues.push(
    'The G4 real-model runner must remain a browser-denied server composition over public AI/shared owners.'
  );
}
const evaluationRunnerSources = await collectSourceFiles(evaluationRunnerRoot);
for (const file of evaluationRunnerSources) {
  const source = await readFile(file, 'utf8');
  const path = relative(repoRoot, file).replaceAll('\\', '/');
  for (const pattern of [
    /from\s+['"]react/iu,
    /apps\/web/iu,
    /@prodivix\/ai\/src/iu,
    /\blocalStorage\b/u,
    /\bdocument\./u,
    /\bwindow\./u,
  ]) {
    if (pattern.test(source)) {
      issues.push(
        `${path} crosses the server-only evaluation-runner boundary.`
      );
    }
  }
}
const evaluationRunnerBrowserDenied = await readFile(
  join(evaluationRunnerRoot, 'src', 'browserDenied.ts'),
  'utf8'
);
if (!/throw\s+new\s+Error/u.test(evaluationRunnerBrowserDenied)) {
  issues.push('The G4 real-model runner browser export must fail closed.');
}

const v9ClosureSources = await Promise.all(
  [
    'packages/ai/src/closure/agentG4Closure.types.ts',
    'packages/ai/src/closure/agentG4Closure.ts',
    'packages/ai/src/closure/agentG4ClosureCodec.ts',
    'packages/ai/src/wire/agentG4ClosureWire.ts',
    'packages/golden-conformance/src/goldenG4V9ClosureFixture.ts',
    'apps/backend/internal/platform/agentcontract/closure_semantic.go',
    'apps/backend/internal/platform/agentcontract/contract.go',
    'scripts/g4-agent-closure-canonical-vector.mjs',
    'scripts/verify-g4-golden-evidence.mjs',
  ].map(async (path) => ({
    path,
    source: await readFile(join(repoRoot, path), 'utf8'),
  }))
);
const v9ClosureSource = v9ClosureSources.map(({ source }) => source).join('\n');
for (const token of [
  'AgentG4GoldenClosureManifest',
  'createAgentG4GoldenClosureManifest',
  'decodeAgentG4ClosureManifest',
  'executeGoldenG4V9Closure',
  'AGENT_G4_REQUIRED_RECOVERY_CASE_IDS',
  'AGENT_G4_REQUIRED_NEGATIVE_CASE_IDS',
  'requiredAttemptCount: 11_640',
  'ValidateG4ClosureManifest',
  'PRODIVIX_G4_GOLDEN_EVIDENCE',
]) {
  if (!v9ClosureSource.includes(token)) {
    issues.push(`G4 V9 Golden Closure boundary is missing ${token}.`);
  }
}
for (const { path, source } of v9ClosureSources.filter(({ path }) =>
  path.startsWith('packages/ai/')
)) {
  for (const pattern of [
    /from\s+['"]react/iu,
    /apps\/web/iu,
    /from\s+['"]@prodivix\/(?:workspace|workspace-sync|runtime|verification)/iu,
    /\blocalStorage\b/u,
    /\bfetch\s*\(/u,
    /process\.env/u,
  ]) {
    if (pattern.test(source)) {
      issues.push(
        `${path} crosses the G4 V9 transport-neutral Closure boundary.`
      );
    }
  }
}
for (const { path, source } of v1ContextSources) {
  for (const pattern of [
    /from\s+['"]react/iu,
    /apps\/web/iu,
    /editor(?:Store|\/store)/u,
    /document\.(?:querySelector|getElementById)/u,
    /\bwindow\./u,
    /\blocalStorage\b/u,
  ]) {
    if (pattern.test(source)) {
      issues.push(`${path} crosses the G4 V1 public Context boundary.`);
    }
  }
}
if (/\bversion\??\s*:\s*number\b/u.test(currentSource)) {
  issues.push('G4 current domain must not expose a numeric version field.');
}

const draftRegistrySource = await readFile(
  join(packagesRoot, 'ai', 'src', 'draft', 'aiDraftToolRegistry.ts'),
  'utf8'
);
for (const token of [
  'apply',
  'approve',
  'approval',
  'commit',
  'rollback',
  'workspace[._:/-]patch',
  'json[._:/-]patch',
  'file[._:/-]write',
]) {
  if (!draftRegistrySource.includes(token)) {
    issues.push(`AI draft registry hard cut is missing ${token}.`);
  }
}

const workspaceRegistry = await readFile(
  join(packagesRoot, 'workspace', 'src', 'workspaceContractRegistry.ts'),
  'utf8'
);
const workspaceAgentDocument = await readFile(
  join(packagesRoot, 'workspace', 'src', 'workspaceAgentPolicyDocument.ts'),
  'utf8'
);
for (const token of ["'agent-policy'", "'agent'", "prefix: 'core.agent'"]) {
  if (!workspaceRegistry.includes(token)) {
    issues.push(`Workspace G4 registry is missing ${token}.`);
  }
}
for (const token of [
  'createWorkspaceAgentPolicyDocumentCommand',
  'createWorkspaceAgentPolicyUpdateCommand',
  "namespace: 'core.agent'",
  "domainHint: 'agent'",
]) {
  if (!workspaceAgentDocument.includes(token)) {
    issues.push(`Workspace AgentPolicy owner is missing ${token}.`);
  }
}

const backendFiles = [
  'apps/backend/internal/platform/agentcontract/contract.go',
  'apps/backend/internal/platform/agentcontract/control_semantic.go',
  'apps/backend/internal/platform/agentcontract/proposal_semantic.go',
  'apps/backend/internal/platform/agentcontract/verification_semantic.go',
  'apps/backend/internal/platform/agentcontract/evaluation_semantic.go',
  'apps/backend/internal/modules/workspace/store_helpers.go',
  'apps/backend/internal/modules/agent/repository.go',
  'apps/backend/internal/modules/agent/repository_transition.go',
  'apps/backend/internal/modules/agent/repository_lease.go',
  'apps/backend/internal/modules/agent/audit.go',
  'apps/backend/internal/modules/agent/proposal_facts.go',
  'apps/backend/internal/modules/agent/proposal_repository.go',
  'apps/backend/internal/modules/agent/proposal_mutation_repository.go',
  'apps/backend/internal/modules/agent/verification_facts.go',
  'apps/backend/internal/modules/agent/verification_repository.go',
  'apps/backend/internal/modules/agent/product_facts.go',
  'apps/backend/internal/modules/agent/product_repository.go',
  'apps/backend/internal/modules/agent/evaluation_facts.go',
  'apps/backend/internal/modules/agent/evaluation_repository.go',
  'apps/backend/internal/modules/agent/evaluation_budget_repository.go',
  'apps/backend/internal/modules/agent/handler.go',
  'apps/backend/internal/platform/database/agent_policy_migration.go',
  'apps/backend/internal/platform/database/agent_control_plane_migration.go',
  'apps/backend/internal/platform/database/agent_proposal_approval_migration.go',
  'apps/backend/internal/platform/database/agent_verification_repair_migration.go',
  'apps/backend/internal/platform/database/agent_product_migration.go',
  'apps/backend/internal/platform/database/agent_model_evaluation_migration.go',
];
const backendSource = (
  await Promise.all(
    backendFiles.map((path) => readFile(join(repoRoot, path), 'utf8'))
  )
).join('\n');
for (const token of [
  'ValidateDocument',
  'CanonicalCurrentDigest',
  'WorkspaceDocumentTypeAgentPolicy',
  'g4-agent-policy-workspace-document',
  'idx_workspace_documents_single_agent_policy',
  'ValidateControlFact',
  'CreateTask',
  'CreateRun',
  'AppendTransition',
  'ClaimRun',
  'ClaimOperationDispatch',
  'ExportAudit',
  'g4-agent-control-plane',
  'agent_run_events',
  'agent_budget_reservations',
  'ValidateProposalFact',
  'StoreProposal',
  'StoreProposalPreview',
  'DecideProposal',
  'RecordWorkspaceMutation',
  'g4-agent-proposal-approval-ledger',
  'agent_workspace_mutation_receipts',
  'ValidateVerificationFact',
  'StoreVerificationPlanBinding',
  'StoreVerificationClosureReceipt',
  'StoreRepairRoundReceipt',
  'validateApplySuccessLedgerTx',
  'g4-agent-verification-repair-ledger',
  'agent_verification_plan_bindings',
  'agent_verification_closure_receipts',
  'agent_repair_round_receipts',
  'ValidateProductFact',
  'StoreProductSupplement',
  'StoreRunUserCommand',
  'GetProductLedgerBundle',
  'g4-agent-product-ledger',
  'agent_product_supplements',
  'agent_run_user_commands',
  'ValidateEvaluationFact',
  'StoreEvaluationPlan',
  'StoreEvaluationAttempt',
  'ClaimEvaluationShard',
  'RenewEvaluationShard',
  'ReserveEvaluationBudget',
  'SettleEvaluationBudget',
  'StoreEvaluationCheckpoint',
  'StoreEvaluationArtifact',
  'g4-agent-model-evaluation-ledger',
  'agent_evaluation_plans',
  'agent_evaluation_budget_ledgers',
  'agent_evaluation_attempts',
  'agent_evaluation_checkpoints',
  'agent_evaluation_budget_reservations',
]) {
  if (!backendSource.includes(token)) {
    issues.push(`Backend G4 boundary is missing ${token}.`);
  }
}

const openApiSource = await readFile(
  join(repoRoot, 'specs', 'api', 'workspace-sync.openapi.yaml'),
  'utf8'
);
for (const token of [
  '- agent-policy',
  '              agent,',
  '/api/projects/{projectId}/workspaces/{workspaceId}/agent/tasks:',
  '/api/projects/{projectId}/workspaces/{workspaceId}/agent/approvals:',
  '/api/projects/{projectId}/workspaces/{workspaceId}/agent/runs/{runId}/product:',
  '/api/projects/{projectId}/workspaces/{workspaceId}/agent/runs/{runId}/commands:',
  '/api/projects/{projectId}/workspaces/{workspaceId}/agent/runs/{runId}/audit:',
  'AgentProductLedgerEnvelope:',
]) {
  if (!openApiSource.includes(token)) {
    issues.push(`Workspace OpenAPI is missing ${token.trim()}.`);
  }
}

const workflowSource = await readFile(
  join(repoRoot, '.github', 'workflows', 'g4-boundaries.yml'),
  'utf8'
);
for (const token of [
  "- 'packages/ai/**'",
  "- 'apps/backend/internal/platform/agentcontract/**'",
  'image: postgres:16',
  'run: pnpm run verify:g4:boundaries',
  'run: pnpm run verify:g4:boundaries:postgres',
]) {
  if (!workflowSource.includes(token)) {
    issues.push(`G4 V0 workflow is missing ${token}.`);
  }
}

const v1WorkflowSource = await readFile(
  join(repoRoot, '.github', 'workflows', 'g4-v1-provider-context.yml'),
  'utf8'
);
for (const token of [
  "- 'packages/ai/**'",
  "- 'packages/golden-conformance/**'",
  "- 'packages/workspace/**'",
  'run: pnpm run verify:g4:context-policy',
  'run: pnpm run verify:g4:provider-capabilities',
]) {
  if (!v1WorkflowSource.includes(token)) {
    issues.push(`G4 V1 workflow is missing ${token}.`);
  }
}

const rootManifestSource = await readFile(
  join(repoRoot, 'package.json'),
  'utf8'
);
for (const token of [
  '"verify:g4:context-policy"',
  '"verify:g4:provider-capabilities"',
  '"verify:g4:multimodal"',
  '"verify:g4:hosted-capabilities"',
  '"verify:g4:control-plane:core"',
  '"verify:g4:control-plane:postgres"',
  '"verify:g4:control-plane"',
  '"verify:g4:proposal-approval:core"',
  '"verify:g4:proposal-approval:postgres"',
  '"verify:g4:proposal-approval"',
  '"verify:g4:verification:core"',
  '"verify:g4:verification:postgres"',
  '"verify:g4:verification"',
  '"verify:g4:product:core"',
  '"verify:g4:product:postgres"',
  '"verify:g4:product"',
  '"verify:g4:security"',
  '"verify:g4:model-eval:contract"',
  '"verify:g4:model-eval:postgres"',
  '"verify:g4:model-eval:evidence"',
  '"verify:g4:model-eval"',
  '"verify:g4:v8"',
  '"verify:g4:golden:contract"',
  '"verify:g4:golden:evidence"',
  '"verify:g4:golden"',
  '"verify:g4:postgres"',
  '"verify:g4:rootless-contract"',
  '"verify:g4:rootless"',
  '"verify:g4"',
  '"assemble:g4:closure:evidence"',
  '"verify:g4:closure:evidence"',
  '"verify:g4:closure"',
]) {
  if (!rootManifestSource.includes(token)) {
    issues.push(`G4 root Gate is missing ${token}.`);
  }
}
const rootManifest = JSON.parse(rootManifestSource);
const aiPackageManifest = await readJson(
  join(packagesRoot, 'ai', 'package.json')
);
if (
  aiPackageManifest.scripts?.['test:g4-v8-model-eval']?.includes(
    'PRODIVIX_VERIFY_G4_V8_MODEL_EVAL=1'
  ) ||
  !aiPackageManifest.scripts?.['test:g4-v8-model-eval']?.includes(
    'agentEvaluationReleasePlan.test.ts'
  ) ||
  !aiPackageManifest.scripts?.['test:g4-v8-model-eval']?.includes(
    'agentEvaluationCorpusMaterial.test.ts'
  ) ||
  !aiPackageManifest.scripts?.['test:g4-v8-model-eval']?.includes(
    'agentEvaluationPreDispatchFailure.test.ts'
  ) ||
  !aiPackageManifest.scripts?.['test:g4-v8-model-eval']?.includes(
    'agentEvaluationCapabilityExecution.test.ts'
  ) ||
  !aiPackageManifest.scripts?.['test:g4-v8-model-eval']?.includes(
    'agentEvaluationEndpointSmoke.test.ts'
  ) ||
  !aiPackageManifest.scripts?.['test:g4-v8-model-eval']?.includes(
    'agentEvaluationValidatedHumanReview.test.ts'
  ) ||
  !aiPackageManifest.scripts?.['test:g4-v8-model-eval']?.includes(
    'agentEvaluationEvidenceBundle.test.ts'
  ) ||
  !aiPackageManifest.scripts?.['test:g4-v8-model-eval']?.includes(
    'agentEvaluationEvidenceAuthenticity.test.ts'
  ) ||
  !aiPackageManifest.scripts?.['test:g4-v8-model-eval']?.includes(
    'agentEvaluationEvidenceArchive.test.ts'
  )
) {
  issues.push(
    'G4 V8 model-eval Gate must cover the full plan and streaming archive contracts while keeping retired monolithic evidence construction disabled.'
  );
}
const goldenConformanceManifest = await readJson(
  join(packagesRoot, 'golden-conformance', 'package.json')
);
if (
  !goldenConformanceManifest.scripts?.['test:g4-v9-closure']?.includes(
    'PRODIVIX_VERIFY_G4_V9_CLOSURE=1'
  )
) {
  issues.push(
    'G4 V9 controlled Golden must execute only through its explicit closure Gate.'
  );
}
if (
  !rootManifest.scripts?.['verify:g4:proposal-approval:core']?.includes(
    'pnpm run check:core-boundaries'
  ) ||
  !rootManifest.scripts?.['verify:g4:proposal-approval:core']?.includes(
    'pnpm run check:g4-wire-contracts'
  )
) {
  issues.push(
    'G4 V5 deterministic Gate must enforce core and wire boundaries.'
  );
}
if (
  !rootManifest.scripts?.['verify:g4:verification:core']?.includes(
    'pnpm run check:core-boundaries'
  ) ||
  !rootManifest.scripts?.['verify:g4:verification:core']?.includes(
    'pnpm run check:g4-wire-contracts'
  )
) {
  issues.push(
    'G4 V6 deterministic Gate must enforce core and wire boundaries.'
  );
}
if (
  !rootManifest.scripts?.['verify:g4:product:core']?.includes(
    'pnpm run check:core-boundaries'
  ) ||
  !rootManifest.scripts?.['verify:g4:product:core']?.includes(
    'pnpm run check:g4-wire-contracts'
  ) ||
  !rootManifest.scripts?.['verify:g4:product:core']?.includes(
    'pnpm --filter @prodivix/cli test'
  ) ||
  !rootManifest.scripts?.['verify:g4:product:core']?.includes(
    'pnpm --filter @prodivix/web typecheck'
  )
) {
  issues.push(
    'G4 V7 deterministic Gate must enforce Web, CLI, core, and wire boundaries.'
  );
}
if (
  !rootManifest.scripts?.['verify:g4:model-eval:contract']?.includes(
    'pnpm run check:core-boundaries'
  ) ||
  !rootManifest.scripts?.['verify:g4:model-eval:contract']?.includes(
    'pnpm run check:g4-wire-contracts'
  ) ||
  !rootManifest.scripts?.['verify:g4:model-eval:contract']?.includes(
    'pnpm --filter @prodivix/agent-evaluation-runner test'
  ) ||
  !rootManifest.scripts?.['verify:g4:model-eval:contract']?.includes(
    'pnpm --filter @prodivix/agent-evaluation-runner build'
  ) ||
  !rootManifest.scripts?.['test:g4:model-eval:operational-verifiers']?.includes(
    'scripts/verify-g4-capability-effect-provider-journal-lifecycle.test.mjs'
  ) ||
  !rootManifest.scripts?.['test:g4:model-eval:operational-verifiers']?.includes(
    'scripts/verify-g4-evaluation-owner-lifecycle.test.mjs'
  ) ||
  !rootManifest.scripts?.['test:g4:model-eval:operational-verifiers']?.includes(
    'scripts/verify-g4-hosted-retrieval-runtime-resource-health.test.mjs'
  ) ||
  !rootManifest.scripts?.['test:g4:model-eval:operational-verifiers']?.includes(
    'scripts/verify-g4-hosted-retrieval-runtime-resource-lifecycle.test.mjs'
  ) ||
  !rootManifest.scripts?.['test:g4:model-eval:operational-verifiers']?.includes(
    'scripts/verify-g4-native-provider-state-vault-health.test.mjs'
  ) ||
  !rootManifest.scripts?.['test:g4:model-eval:operational-verifiers']?.includes(
    'scripts/verify-g4-native-provider-state-vault-recovery.test.mjs'
  ) ||
  !rootManifest.scripts?.['verify:g4:model-eval:contract']?.includes(
    'pnpm run test:g4:model-eval:operational-verifiers'
  ) ||
  !rootManifest.scripts?.['verify:g4:model-eval:contract']?.includes(
    './internal/config ./internal/app ./internal/modules/verification ./cmd/server ./cmd/agent-evaluation-ledger'
  ) ||
  rootManifest.scripts?.['verify:g4:model-eval:contract']?.includes(
    'pnpm run verify:g4:model-eval:evidence'
  )
) {
  issues.push(
    'G4 V8 deterministic model-evaluation Gate must enforce core/wire and operational-verifier boundaries without consuming real-model evidence.'
  );
}
if (
  !rootManifest.scripts?.['verify:g4:golden:contract']?.includes(
    'pnpm --filter @prodivix/ai test:g4-v9-closure'
  ) ||
  !rootManifest.scripts?.['verify:g4:golden:contract']?.includes(
    'pnpm --filter @prodivix/golden-conformance test:g4-v9-closure'
  ) ||
  !rootManifest.scripts?.['verify:g4:golden:contract']?.includes(
    'pnpm run check:g4-wire-contracts'
  )
) {
  issues.push(
    'G4 V9 Golden contract Gate must enforce current/wire and authenticated Catalog conformance.'
  );
}
if (
  !rootManifest.scripts?.['verify:g4']?.includes(
    'pnpm run verify:g4:golden:contract'
  ) ||
  !rootManifest.scripts?.['verify:g4']?.includes(
    'pnpm run verify:g4:postgres'
  ) ||
  !rootManifest.scripts?.['verify:g4']?.includes(
    'pnpm run verify:g4:rootless-contract'
  ) ||
  rootManifest.scripts?.['verify:g4']?.includes('model-eval:evidence')
) {
  issues.push(
    'G4 deterministic aggregate must include Golden, PostgreSQL, and rootless contracts without consuming real-model evidence.'
  );
}
if (
  !rootManifest.scripts?.['verify:g4:closure']?.includes(
    'pnpm run verify:g4'
  ) ||
  !rootManifest.scripts?.['verify:g4:closure']?.includes(
    'pnpm run verify:g4:rootless'
  ) ||
  !rootManifest.scripts?.['verify:g4:closure']?.includes(
    'pnpm run verify:g4:closure:evidence'
  )
) {
  issues.push(
    'G4 release Closure Gate must compose deterministic, rootless, and real-model evidence.'
  );
}
if (
  !rootManifest.scripts?.['verify:g4:multimodal']?.includes(
    'pnpm run check:core-boundaries'
  )
) {
  issues.push('G4 V2 root Gate must enforce core package boundaries.');
}
if (
  !rootManifest.scripts?.['verify:g4:hosted-capabilities']?.includes(
    'pnpm run check:core-boundaries'
  )
) {
  issues.push('G4 V3 root Gate must enforce core package boundaries.');
}
if (
  !rootManifest.scripts?.['verify:g4:control-plane:core']?.includes(
    'pnpm run check:core-boundaries'
  ) ||
  !rootManifest.scripts?.['verify:g4:control-plane:core']?.includes(
    'pnpm run check:g4-wire-contracts'
  )
) {
  issues.push(
    'G4 V4 deterministic Gate must enforce core and wire boundaries.'
  );
}

const v2WorkflowSource = await readFile(
  join(repoRoot, '.github', 'workflows', 'g4-v2-multimodal.yml'),
  'utf8'
);
for (const token of [
  "- 'packages/ai/**'",
  "- 'packages/assets/**'",
  "- 'packages/golden-conformance/**'",
  "- 'scripts/check-core-package-boundaries.mjs'",
  'run: pnpm run verify:g4:multimodal',
]) {
  if (!v2WorkflowSource.includes(token)) {
    issues.push(`G4 V2 workflow is missing ${token}.`);
  }
}

const v3WorkflowSource = await readFile(
  join(repoRoot, '.github', 'workflows', 'g4-v3-hosted-capabilities.yml'),
  'utf8'
);
for (const token of [
  "- 'packages/ai/**'",
  "- 'packages/golden-conformance/**'",
  "- 'scripts/check-core-package-boundaries.mjs'",
  "- 'specs/decisions/68.hosted-tool-retrieval-and-computer-use-boundary.md'",
  'run: pnpm run verify:g4:hosted-capabilities',
]) {
  if (!v3WorkflowSource.includes(token)) {
    issues.push(`G4 V3 workflow is missing ${token}.`);
  }
}

const v4WorkflowSource = await readFile(
  join(repoRoot, '.github', 'workflows', 'g4-v4-control-plane.yml'),
  'utf8'
);
for (const token of [
  "- 'apps/backend/internal/modules/agent/**'",
  "- 'packages/ai/**'",
  "- 'packages/golden-conformance/**'",
  "- 'scripts/g4-agent-control-canonical-vector.mjs'",
  'image: postgres:16',
  'run: pnpm run verify:g4:control-plane:core',
  'run: pnpm run verify:g4:control-plane:postgres',
]) {
  if (!v4WorkflowSource.includes(token)) {
    issues.push(`G4 V4 workflow is missing ${token}.`);
  }
}

const v5WorkflowSource = await readFile(
  join(repoRoot, '.github', 'workflows', 'g4-v5-proposal-approval.yml'),
  'utf8'
);
for (const token of [
  "- 'apps/backend/internal/modules/agent/**'",
  "- 'apps/backend/internal/modules/workspace/**'",
  "- 'packages/ai/**'",
  "- 'packages/workspace-sync/**'",
  "- 'scripts/g4-agent-proposal-canonical-vector.mjs'",
  'image: postgres:16',
  'run: pnpm run verify:g4:proposal-approval:core',
  'run: pnpm run verify:g4:proposal-approval:postgres',
]) {
  if (!v5WorkflowSource.includes(token)) {
    issues.push(`G4 V5 workflow is missing ${token}.`);
  }
}

const v6WorkflowSource = await readFile(
  join(repoRoot, '.github', 'workflows', 'g4-v6-verification-repair.yml'),
  'utf8'
);
for (const token of [
  "- 'apps/backend/internal/modules/agent/**'",
  "- 'packages/ai/**'",
  "- 'packages/verification/**'",
  "- 'packages/workspace-sync/**'",
  "- 'scripts/g4-agent-verification-canonical-vector.mjs'",
  'image: postgres:16',
  'run: pnpm run verify:g4:verification:core',
  'run: pnpm run verify:g4:verification:postgres',
]) {
  if (!v6WorkflowSource.includes(token)) {
    issues.push(`G4 V6 workflow is missing ${token}.`);
  }
}

const v7WorkflowSource = await readFile(
  join(repoRoot, '.github', 'workflows', 'g4-v7-product.yml'),
  'utf8'
);
for (const token of [
  "- 'apps/backend/internal/modules/agent/**'",
  "- 'apps/cli/**'",
  "- 'apps/web/**'",
  "- 'packages/ai/**'",
  "- 'packages/workspace-sync/**'",
  "- 'scripts/g4-agent-product-canonical-vector.mjs'",
  "- 'specs/api/workspace-sync.openapi.yaml'",
  'image: postgres:16',
  'run: pnpm run verify:g4:product:core',
  'run: pnpm run verify:g4:product:postgres',
]) {
  if (!v7WorkflowSource.includes(token)) {
    issues.push(`G4 V7 workflow is missing ${token}.`);
  }
}

const v8WorkflowSource = await readFile(
  join(repoRoot, '.github', 'workflows', 'g4-v8-security-model-eval.yml'),
  'utf8'
);
for (const token of [
  "- 'apps/backend/internal/modules/agent/**'",
  "- 'packages/ai/**'",
  "- 'packages/golden-conformance/**'",
  "- 'scripts/g4-agent-evaluation-canonical-vector.mjs'",
  "- 'specs/decisions/69.real-model-evaluation-and-release-qualification.md'",
  'image: postgres:16',
  "PRODIVIX_G4_REMOTE_MODEL_UNITS: '0'",
  'run: pnpm run verify:g4:security',
  'run: pnpm run verify:g4:model-eval:contract',
  'run: pnpm run verify:g4:model-eval:postgres',
]) {
  if (!v8WorkflowSource.includes(token)) {
    issues.push(`G4 V8 workflow is missing ${token}.`);
  }
}

const v9WorkflowSource = await readFile(
  join(repoRoot, '.github', 'workflows', 'g4-v9-golden-closure.yml'),
  'utf8'
);
for (const token of [
  "- '.github/workflows/g4-hosted-runtime-resource-recovery.yml'",
  "- '.github/workflows/g4-real-model-evaluation.yml'",
  "- '.github/workflows/g4-real-model-human-review.yml'",
  "- 'apps/agent-evaluation-runner/**'",
  "- 'apps/backend/cmd/agent-evaluation-ledger/**'",
  "- 'apps/backend/cmd/server/**'",
  "- 'apps/backend/internal/app/**'",
  "- 'apps/backend/internal/config/**'",
  "- 'apps/backend/internal/modules/agent/**'",
  "- 'apps/backend/internal/modules/verification/**'",
  "- 'apps/backend/internal/platform/agentcontract/**'",
  "- 'apps/backend/internal/platform/database/**'",
  "- 'apps/remote-runner-worker/**'",
  "- 'packages/ai/**'",
  "- 'packages/golden-conformance/**'",
  "- 'packages/runtime-core/**'",
  "- 'packages/shared/**'",
  "- 'packages/verification/**'",
  "- 'packages/verification-adapters/**'",
  "- 'packages/verification-browser/**'",
  "- 'packages/workspace-sync/**'",
  "- 'scripts/ci/configure-rootless-podman.sh'",
  "- 'scripts/g4-agent-closure-canonical-vector.mjs'",
  "- 'scripts/g4-agent-evaluation-human-authority-vector.mjs'",
  "- 'scripts/g4-agent-verification-canonical-vector.mjs'",
  "- 'scripts/g4-model-evaluation-evidence-verifier.fixture.mjs'",
  "- 'scripts/g4-model-evaluation-evidence-verifier.mjs'",
  "- 'scripts/g4-model-evaluation-evidence-verifier.test.mjs'",
  "- 'scripts/verify-g4-capability-effect-provider-journal-lifecycle.mjs'",
  "- 'scripts/verify-g4-capability-effect-provider-journal-lifecycle.test.mjs'",
  "- 'scripts/verify-g4-hosted-retrieval-runtime-resource-health.mjs'",
  "- 'scripts/verify-g4-hosted-retrieval-runtime-resource-health.test.mjs'",
  "- 'scripts/verify-g4-hosted-retrieval-runtime-resource-lifecycle.mjs'",
  "- 'scripts/verify-g4-hosted-retrieval-runtime-resource-lifecycle.test.mjs'",
  "- 'scripts/verify-g4-evaluation-owner-lifecycle.mjs'",
  "- 'scripts/verify-g4-evaluation-owner-lifecycle.test.mjs'",
  "- 'scripts/verify-g4-native-provider-state-vault-health.mjs'",
  "- 'scripts/verify-g4-native-provider-state-vault-health.test.mjs'",
  "- 'scripts/verify-g4-native-provider-state-vault-recovery.mjs'",
  "- 'scripts/verify-g4-native-provider-state-vault-recovery.test.mjs'",
  "- 'specs/evaluation/**'",
  "- 'specs/operations/g4-real-model-evaluation.md'",
  'image: postgres:16',
  "PRODIVIX_G4_REMOTE_MODEL_UNITS: '0'",
  'run: bash scripts/ci/configure-rootless-podman.sh',
  'run: pnpm run build:g2-golden-dependencies',
  'PRODIVIX_ROOTLESS_INSTALL_NETWORK',
  'apps/remote-runner-worker/install-proxy/Dockerfile',
  'run: pnpm run verify:g4',
]) {
  if (!v9WorkflowSource.includes(token)) {
    issues.push(`G4 V9 workflow is missing ${token}.`);
  }
}
for (const triggerPath of [
  "- '.github/workflows/g4-hosted-runtime-resource-recovery.yml'",
  "- '.github/workflows/g4-real-model-evaluation.yml'",
  "- '.github/workflows/g4-real-model-human-review.yml'",
  "- 'apps/agent-evaluation-runner/**'",
  "- 'apps/backend/cmd/agent-evaluation-ledger/**'",
  "- 'apps/backend/cmd/server/**'",
  "- 'apps/backend/internal/app/**'",
  "- 'apps/backend/internal/config/**'",
  "- 'apps/backend/internal/modules/verification/**'",
  "- 'packages/runtime-core/**'",
  "- 'packages/verification-adapters/**'",
  "- 'packages/verification-browser/**'",
  "- 'scripts/g4-agent-evaluation-human-authority-vector.mjs'",
  "- 'scripts/g4-model-evaluation-evidence-verifier.fixture.mjs'",
  "- 'scripts/g4-model-evaluation-evidence-verifier.mjs'",
  "- 'scripts/g4-model-evaluation-evidence-verifier.test.mjs'",
  "- 'scripts/verify-g4-capability-effect-provider-journal-lifecycle.mjs'",
  "- 'scripts/verify-g4-capability-effect-provider-journal-lifecycle.test.mjs'",
  "- 'scripts/verify-g4-hosted-retrieval-runtime-resource-health.mjs'",
  "- 'scripts/verify-g4-hosted-retrieval-runtime-resource-health.test.mjs'",
  "- 'scripts/verify-g4-hosted-retrieval-runtime-resource-lifecycle.mjs'",
  "- 'scripts/verify-g4-hosted-retrieval-runtime-resource-lifecycle.test.mjs'",
  "- 'scripts/verify-g4-evaluation-owner-lifecycle.mjs'",
  "- 'scripts/verify-g4-evaluation-owner-lifecycle.test.mjs'",
  "- 'scripts/verify-g4-native-provider-state-vault-health.mjs'",
  "- 'scripts/verify-g4-native-provider-state-vault-health.test.mjs'",
  "- 'scripts/verify-g4-native-provider-state-vault-recovery.mjs'",
  "- 'scripts/verify-g4-native-provider-state-vault-recovery.test.mjs'",
  "- 'specs/evaluation/**'",
  "- 'specs/operations/g4-real-model-evaluation.md'",
]) {
  if (v9WorkflowSource.split(triggerPath).length - 1 !== 2) {
    issues.push(
      `G4 V9 workflow must bind ${triggerPath} in both pull_request and push triggers.`
    );
  }
}
if (
  v9WorkflowSource.includes('verify:g4:golden:evidence') ||
  v9WorkflowSource.includes('verify:g4:model-eval:evidence') ||
  /(?:OPENAI|ANTHROPIC|GEMINI|GOOGLE)_API_KEY/u.test(v9WorkflowSource)
) {
  issues.push(
    'G4 V9 ordinary CI must keep real-model release evidence separate and consume zero remote model units.'
  );
}
if (
  v8WorkflowSource.includes('verify:g4:model-eval:evidence') ||
  /(?:OPENAI|ANTHROPIC|GEMINI|GOOGLE)_API_KEY/u.test(v8WorkflowSource)
) {
  issues.push(
    'G4 V8 ordinary CI must stay zero-remote-token and separate from release evaluation evidence.'
  );
}

const realModelWorkflowSource = await readFile(
  join(repoRoot, '.github', 'workflows', 'g4-real-model-evaluation.yml'),
  'utf8'
);
const hostedRuntimeResourceRecoveryWorkflowSource = await readFile(
  join(
    repoRoot,
    '.github',
    'workflows',
    'g4-hosted-runtime-resource-recovery.yml'
  ),
  'utf8'
);
const realModelHumanReviewWorkflowSource = await readFile(
  join(repoRoot, '.github', 'workflows', 'g4-real-model-human-review.yml'),
  'utf8'
);
const realModelEvaluationTemplate = await readJson(
  join(repoRoot, 'specs', 'evaluation', 'g4-real-model-evaluation.example.json')
);
const exactPlanArtifactAttemptKeys = [
  'evaluationRunAttempt',
  'planArtifactDigest',
  'planArtifactName',
  'planArtifactRunAttempt',
  'planDigest',
  'repositoryCommit',
];
const admitsExactPlanArtifactAttempt = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  if (
    keys.length !== exactPlanArtifactAttemptKeys.length ||
    exactPlanArtifactAttemptKeys.some((key) => !keys.includes(key))
  ) {
    return false;
  }
  if (
    typeof value.repositoryCommit !== 'string' ||
    !/^[0-9a-f]{40}$/u.test(value.repositoryCommit) ||
    !Number.isSafeInteger(value.evaluationRunAttempt) ||
    value.evaluationRunAttempt < 1 ||
    !Number.isSafeInteger(value.planArtifactRunAttempt) ||
    value.planArtifactRunAttempt < 1 ||
    value.planArtifactRunAttempt > value.evaluationRunAttempt ||
    typeof value.planArtifactDigest !== 'string' ||
    !/^sha256:[0-9a-f]{64}$/u.test(value.planArtifactDigest) ||
    typeof value.planDigest !== 'string' ||
    !/^sha256-[0-9a-f]{64}$/u.test(value.planDigest)
  ) {
    return false;
  }
  return new RegExp(
    `^g4-real-model-plan-${value.repositoryCommit}-[a-zA-Z0-9][a-zA-Z0-9._-]{0,46}-${value.planArtifactRunAttempt}$`,
    'u'
  ).test(value.planArtifactName);
};
const planAttemptFixtureCommit = 'a'.repeat(40);
const sameAttemptPlanArtifact = {
  evaluationRunAttempt: 1,
  planArtifactDigest: `sha256:${'b'.repeat(64)}`,
  planArtifactName: `g4-real-model-plan-${planAttemptFixtureCommit}-release-1`,
  planArtifactRunAttempt: 1,
  planDigest: `sha256-${'c'.repeat(64)}`,
  repositoryCommit: planAttemptFixtureCommit,
};
const retriedPlanArtifact = {
  ...sameAttemptPlanArtifact,
  evaluationRunAttempt: 2,
};
const swappedPlanArtifact = {
  ...sameAttemptPlanArtifact,
  evaluationRunAttempt: 1,
  planArtifactName: `g4-real-model-plan-${planAttemptFixtureCommit}-release-2`,
  planArtifactRunAttempt: 2,
};
const missingPlanAttemptArtifact = { ...retriedPlanArtifact };
delete missingPlanAttemptArtifact.planArtifactRunAttempt;
const missingPlanDigestArtifact = { ...retriedPlanArtifact };
delete missingPlanDigestArtifact.planDigest;
const wrongSuffixPlanArtifact = {
  ...retriedPlanArtifact,
  planArtifactName: `g4-real-model-plan-${planAttemptFixtureCommit}-release-2`,
};
if (
  !admitsExactPlanArtifactAttempt(sameAttemptPlanArtifact) ||
  !admitsExactPlanArtifactAttempt(retriedPlanArtifact) ||
  admitsExactPlanArtifactAttempt(swappedPlanArtifact) ||
  admitsExactPlanArtifactAttempt(missingPlanAttemptArtifact) ||
  admitsExactPlanArtifactAttempt(missingPlanDigestArtifact) ||
  admitsExactPlanArtifactAttempt(wrongSuffixPlanArtifact)
) {
  issues.push(
    'G4 plan artifact producer-attempt fixtures must admit same-attempt and attempt-1-plan/attempt-2-evaluation identities while binding the exact artifact digest and plan digest and rejecting swapped, missing, or suffix-drifted authority.'
  );
}
const realModelOperationsSource = await readFile(
  join(repoRoot, 'specs', 'operations', 'g4-real-model-evaluation.md'),
  'utf8'
);
const nativeProviderStateVaultHealthVerifierSource = await readFile(
  join(repoRoot, 'scripts', 'verify-g4-native-provider-state-vault-health.mjs'),
  'utf8'
);
const nativeProviderStateVaultRecoveryVerifierSource = await readFile(
  join(
    repoRoot,
    'scripts',
    'verify-g4-native-provider-state-vault-recovery.mjs'
  ),
  'utf8'
);
const capabilityEffectProviderJournalLifecycleVerifierSource = await readFile(
  join(
    repoRoot,
    'scripts',
    'verify-g4-capability-effect-provider-journal-lifecycle.mjs'
  ),
  'utf8'
);
const hostedRetrievalRuntimeResourceHealthVerifierSource = await readFile(
  join(
    repoRoot,
    'scripts',
    'verify-g4-hosted-retrieval-runtime-resource-health.mjs'
  ),
  'utf8'
);
const hostedRetrievalRuntimeResourceLifecycleVerifierSource = await readFile(
  join(
    repoRoot,
    'scripts',
    'verify-g4-hosted-retrieval-runtime-resource-lifecycle.mjs'
  ),
  'utf8'
);
const evaluationOwnerLifecycleVerifierSource = await readFile(
  join(repoRoot, 'scripts', 'verify-g4-evaluation-owner-lifecycle.mjs'),
  'utf8'
);
const frozenConfigCommitmentSource = await readFile(
  join(
    repoRoot,
    'packages',
    'ai',
    'src',
    'evaluation',
    'agentEvaluationFrozenConfigCommitment.ts'
  ),
  'utf8'
);
const backendHoldoutAuthoritySource = await readFile(
  join(
    repoRoot,
    'apps',
    'backend',
    'internal',
    'modules',
    'agent',
    'evaluation_holdout_authority.go'
  ),
  'utf8'
);
const productionFinalizationServiceSource = await readFile(
  join(
    repoRoot,
    'apps',
    'agent-evaluation-runner',
    'src',
    'productionFinalizationService.ts'
  ),
  'utf8'
);
const productionFinalizationServiceTestSource = await readFile(
  join(
    repoRoot,
    'apps',
    'agent-evaluation-runner',
    'src',
    'productionFinalizationService.test.ts'
  ),
  'utf8'
);
const productionFrozenConfigCommitmentSource = await readFile(
  join(
    repoRoot,
    'apps',
    'agent-evaluation-runner',
    'src',
    'productionFrozenConfigCommitment.ts'
  ),
  'utf8'
);
const productionFrozenConfigCommitmentTestSource = await readFile(
  join(
    repoRoot,
    'apps',
    'agent-evaluation-runner',
    'src',
    'productionFrozenConfigCommitment.test.ts'
  ),
  'utf8'
);
const validatedHumanMetricProjectionSource = await readFile(
  join(
    repoRoot,
    'apps',
    'backend',
    'internal',
    'modules',
    'agent',
    'evaluation_validated_human_metric.go'
  ),
  'utf8'
);
const validatedHumanMetricProjectionTestSource = await readFile(
  join(
    repoRoot,
    'apps',
    'backend',
    'internal',
    'modules',
    'agent',
    'evaluation_validated_human_metric_test.go'
  ),
  'utf8'
);
const archiveFinalizationAuthoritySource = await readFile(
  join(
    repoRoot,
    'apps',
    'backend',
    'internal',
    'modules',
    'agent',
    'evaluation_archive_finalization_authority.go'
  ),
  'utf8'
);
const productionReleasePlanSource = await readFile(
  join(
    packagesRoot,
    'ai',
    'src',
    'evaluation',
    'agentEvaluationReleasePlan.ts'
  ),
  'utf8'
);
const providerCapabilityObservationSource = await readFile(
  join(
    packagesRoot,
    'ai',
    'src',
    'evaluation',
    'agentEvaluationProviderCapabilityObservation.ts'
  ),
  'utf8'
);
const capabilityEffectProviderJournalSpoolSource = await readFile(
  join(
    packagesRoot,
    'ai',
    'src',
    'evaluation',
    'agentEvaluationCapabilityEffectProviderJournalSpool.ts'
  ),
  'utf8'
);
const evidenceArchiveSource = await readFile(
  join(
    packagesRoot,
    'ai',
    'src',
    'evaluation',
    'agentEvaluationEvidenceArchive.ts'
  ),
  'utf8'
);
const evidenceArchiveTestSource = await readFile(
  join(
    packagesRoot,
    'ai',
    'src',
    'evaluation',
    'agentEvaluationEvidenceArchive.test.ts'
  ),
  'utf8'
);
const evidenceArchiveAuthorityRecordsSource = await readFile(
  join(
    packagesRoot,
    'ai',
    'src',
    'evaluation',
    'agentEvaluationEvidenceArchiveAuthorityRecords.ts'
  ),
  'utf8'
);
const modelEvaluationPostgreSQLGateSource = await readFile(
  join(repoRoot, 'scripts', 'verify-g4-model-eval-postgres.mjs'),
  'utf8'
);
const modelEvaluationEvidenceVerifierSource = await readFile(
  join(repoRoot, 'scripts', 'g4-model-evaluation-evidence-verifier.mjs'),
  'utf8'
);
const modelEvaluationEvidenceVerifierTestSource = await readFile(
  join(repoRoot, 'scripts', 'g4-model-evaluation-evidence-verifier.test.mjs'),
  'utf8'
);
const evaluationRunnerEvidenceArchiveSource = await readFile(
  join(
    repoRoot,
    'apps',
    'agent-evaluation-runner',
    'src',
    'evidenceArchive.ts'
  ),
  'utf8'
);
const evaluationRunnerEvidenceArchiveTestSource = await readFile(
  join(
    repoRoot,
    'apps',
    'agent-evaluation-runner',
    'src',
    'evidenceArchive.test.ts'
  ),
  'utf8'
);
const canonicalServiceTokenCheck = '!/^[A-Za-z0-9._~+\\/-]+={0,2}$/u.test';
if (
  realModelWorkflowSource.split(canonicalServiceTokenCheck).length - 1 !== 5 ||
  realModelWorkflowSource.includes('clean UTF-8 bytes') ||
  !realModelOperationsSource.includes(
    '`^[A-Za-z0-9._~+/-]+={0,2}$` 的独立 ASCII 随机值'
  ) ||
  !realModelOperationsSource.includes('三个 token 逐对不同')
) {
  issues.push(
    'G4 ledger, sidecar, and Verification owner tokens must share the bounded canonical ASCII contract and remain pairwise purpose-distinct.'
  );
}
const ordinaryResultSpoolProfiles = [
  realModelEvaluationTemplate.responseSpoolEncryption,
  realModelEvaluationTemplate.endpointSmokeResponseSpoolEncryption,
];
const capabilityProbeResponseSpoolProfile =
  realModelEvaluationTemplate.capabilityProbeResponseSpoolEncryption;
if (
  ordinaryResultSpoolProfiles.some(
    (profile) =>
      profile?.keyId !== 'key.g4-model-eval.result-spool.v1' ||
      profile?.keyVersion !== 1 ||
      profile?.keyEnvironmentName !==
        'PRODIVIX_G4_MODEL_EVAL_RESULT_SPOOL_KEY_BASE64' ||
      profile?.keyRef !== 'secret.g4-model-eval.result-spool.aes256gcm.v1' ||
      profile?.keyRefDigest !==
        'sha256-edb166ecbfef281d870d05a5bb3184c0c12e96cae099235971beeb74d2409522'
  ) ||
  realModelEvaluationTemplate.responseSpoolEncryption
    ?.encryptionPolicyDigest !==
    'sha256-ac9fe2da4df4334e29ad128cfd7588845715bbcdbeee9c12b649d1f7ea0452b6' ||
  realModelEvaluationTemplate.endpointSmokeResponseSpoolEncryption
    ?.encryptionPolicyDigest !==
    'sha256-480b3492e59904adfc97596bb5473a198639327788c7c91b6285d46a272cc071' ||
  capabilityProbeResponseSpoolProfile?.keyId !==
    'key.g4-model-eval.capability-probe-response-spool.v1' ||
  capabilityProbeResponseSpoolProfile?.keyVersion !== 1 ||
  capabilityProbeResponseSpoolProfile?.keyEnvironmentName !==
    'PRODIVIX_G4_MODEL_EVAL_CAPABILITY_PROBE_RESPONSE_SPOOL_KEY_BASE64' ||
  capabilityProbeResponseSpoolProfile?.keyRef !==
    'secret.g4-model-eval.capability-probe-response-spool.aes256gcm.v1' ||
  capabilityProbeResponseSpoolProfile?.keyRefDigest !==
    'sha256-365caea4c75dbabfb4869db177be98a489d13f25b121eb2e2f6dfc16fdbab105' ||
  capabilityProbeResponseSpoolProfile?.encryptionProfileDigest !==
    'sha256-1ff01d59b3f6fee661ca9a4b8c3d8dd3c5347e018d8cdf4945e37adb69533c2d' ||
  capabilityProbeResponseSpoolProfile?.encryptionPolicyDigest !==
    'sha256-b77aa148725a51c824010e1f428d3bec74de4522d201c5ab1785870b18f7eae7' ||
  !realModelOperationsSource.includes(
    '`PRODIVIX_G4_MODEL_EVAL_CAPABILITY_PROBE_RESPONSE_SPOOL_KEY_BASE64`'
  ) ||
  !realModelOperationsSource.includes(
    '`capabilityProbeResponseSpoolEncryption`'
  ) ||
  !realModelOperationsSource.includes(
    'same-run frozen plan replay 不启动 active probe'
  ) ||
  !realModelOperationsSource.includes('也不读取 probe/state-vault key')
) {
  issues.push(
    'G4 active probes must use the exact independently keyed response-spool profile while attempt and endpoint-smoke result spools retain their existing secret authority.'
  );
}
const nativeProviderStateVaultProfile =
  realModelEvaluationTemplate.nativeProviderStateVaultEncryption;
const nativeProviderStateVaultAuthority =
  nativeProviderStateVaultProfile?.authority;
const stateVaultMustDifferFromProfiles = [
  ...ordinaryResultSpoolProfiles,
  capabilityProbeResponseSpoolProfile,
];
if (
  nativeProviderStateVaultProfile?.format !==
    'prodivix.g4-native-provider-state-vault-encryption-profile' ||
  nativeProviderStateVaultProfile?.version !== 1 ||
  nativeProviderStateVaultProfile?.algorithm !== 'aes-256-gcm' ||
  nativeProviderStateVaultProfile?.nonceBytes !== 12 ||
  nativeProviderStateVaultProfile?.authenticationTagBytes !== 16 ||
  nativeProviderStateVaultProfile?.aadFormat !==
    'prodivix.agent-native-provider-state-vault-aad' ||
  nativeProviderStateVaultProfile?.aadVersion !== 1 ||
  nativeProviderStateVaultProfile?.maximumPlaintextBytes !== 512 ||
  nativeProviderStateVaultProfile?.keyId !==
    'g4-model-evaluation-native-provider-state-vault' ||
  nativeProviderStateVaultProfile?.keyVersion !== 1 ||
  nativeProviderStateVaultProfile?.keyEnvironmentName !==
    'PRODIVIX_G4_MODEL_EVAL_NATIVE_PROVIDER_STATE_VAULT_KEY_BASE64' ||
  nativeProviderStateVaultProfile?.keyRef !==
    'secret://g4-model-evaluation/native-provider-state-vault' ||
  nativeProviderStateVaultProfile?.keyRefDigest !==
    'sha256-5c54bbe814cae4fbe300e62c6c30fa48ba397331c2866e8176c03e1dcafdf7a6' ||
  nativeProviderStateVaultProfile?.retention?.maximumAgeMs !== 125_000 ||
  nativeProviderStateVaultProfile?.retention?.disposition !==
    'expire-after-source-seal-or-maximum-lifetime' ||
  nativeProviderStateVaultProfile?.retention?.retentionPolicyDigest !==
    'sha256-be8d3b9aea8bcb6cd89244a17a1280b068288b10dec62ae01aa6f6532f077935' ||
  nativeProviderStateVaultProfile?.deletionReceiptPolicy?.plaintextResidency !==
    'callback-only' ||
  nativeProviderStateVaultProfile?.deletionReceiptPolicy
    ?.encryptedReferenceDisposition !== 'cryptographic-expiry' ||
  nativeProviderStateVaultProfile?.deletionReceiptPolicy?.deletionReceipt !==
    'source-seal-or-expiry-authority' ||
  nativeProviderStateVaultProfile?.deletionReceiptPolicy
    ?.deletionReceiptPolicyDigest !==
    'sha256-02a2d21aac50f6ce65eb220f94e4f8e9425258c06093d5e4cd7202c975c97c7c' ||
  nativeProviderStateVaultProfile?.encryptionProfileDigest !==
    'sha256-e5a3bd8cb538e579da2175df7a7af364b77c9bc9337944173ef7fb63d6e0963e' ||
  nativeProviderStateVaultProfile?.encryptionPolicyDigest !==
    'sha256-abb78b537e3177d277b566d5930acc509928f9a572cf829f7e54a2619162cde7' ||
  nativeProviderStateVaultAuthority?.format !==
    'prodivix.agent-native-provider-state-vault-authority' ||
  nativeProviderStateVaultAuthority?.version !== 1 ||
  nativeProviderStateVaultAuthority?.authorityId !==
    'evaluation.native-provider-state-vault.owner.v1' ||
  nativeProviderStateVaultAuthority?.authorityImplementationDigest !==
    'sha256-70a8bce30a4b87debb41cb0be08966110f40cfe6ecec009f0483063097cf43a6' ||
  nativeProviderStateVaultAuthority?.storageMode !==
    'server-side-vault-record' ||
  nativeProviderStateVaultAuthority?.cryptographicExpiryMode !==
    'per-state-data-key-destroy' ||
  nativeProviderStateVaultAuthority?.algorithm !== 'aes-256-gcm' ||
  nativeProviderStateVaultAuthority?.keyReferenceDigest !==
    nativeProviderStateVaultProfile.keyRefDigest ||
  nativeProviderStateVaultAuthority?.keyVersion !== 1 ||
  nativeProviderStateVaultAuthority?.encryptionProfileDigest !==
    nativeProviderStateVaultProfile.encryptionProfileDigest ||
  nativeProviderStateVaultAuthority?.retentionPolicyDigest !==
    nativeProviderStateVaultProfile.retention.retentionPolicyDigest ||
  nativeProviderStateVaultAuthority?.deletionReceiptPolicyDigest !==
    nativeProviderStateVaultProfile.deletionReceiptPolicy
      .deletionReceiptPolicyDigest ||
  nativeProviderStateVaultAuthority?.maximumLifetimeMs !== 125_000 ||
  nativeProviderStateVaultAuthority?.maximumLifecycleAckDelayMs !== 30_000 ||
  nativeProviderStateVaultAuthority?.reconciliationMode !==
    'request-digest-idempotent' ||
  nativeProviderStateVaultAuthority?.authorityDigest !==
    'sha256-d00e2b445724baa7a611628b3861496c676dcdeff026f3405c221bbcea2debcf' ||
  stateVaultMustDifferFromProfiles.some(
    (profile) =>
      profile?.keyId === nativeProviderStateVaultProfile?.keyId ||
      profile?.keyEnvironmentName ===
        nativeProviderStateVaultProfile?.keyEnvironmentName ||
      profile?.keyRef === nativeProviderStateVaultProfile?.keyRef ||
      profile?.keyRefDigest === nativeProviderStateVaultProfile?.keyRefDigest ||
      profile?.encryptionProfileDigest ===
        nativeProviderStateVaultProfile?.encryptionProfileDigest
  )
) {
  issues.push(
    'G4 native Provider state must use the exact independently keyed server-side durable vault authority with per-state cryptographic expiry.'
  );
}
if (
  frozenConfigCommitmentSource.includes('workflowRunAttempt') ||
  backendHoldoutAuthoritySource.includes('WorkflowRunAttempt') ||
  !realModelWorkflowSource.includes(
    'g4-real-model-frozen-config-commitment-${EXACT_COMMIT}-${EVALUATION_ID}-${PLAN_PRODUCER_ATTEMPT}'
  ) ||
  !realModelWorkflowSource.includes(
    'Download prior-attempt same-run frozen config commitment'
  ) ||
  !realModelWorkflowSource.includes(
    'The same-run frozen config commitment artifact identity is ambiguous.'
  ) ||
  !realModelOperationsSource.includes(
    '`workflowRunAttempt` 仅绑定 shard lease、worker owner 与 execution provenance'
  ) ||
  !realModelOperationsSource.includes('attempt 2+ 重新执行 producer 时')
) {
  issues.push(
    'G4 frozen config commitment must remain byte-stable across workflow retry attempts while attempts stay in worker provenance.'
  );
}
if (
  !productionFinalizationServiceSource.includes('resolveIntent: async') ||
  !productionFinalizationServiceSource.includes(
    'await client.putFinalizationIntent'
  ) ||
  !productionFinalizationServiceSource.includes(
    'await client.getFinalizationIntent()'
  ) ||
  !productionFinalizationServiceSource.includes('throw putFailure') ||
  !productionFinalizationServiceTestSource.includes(
    'recovers a lost intent acknowledgement and reuses the durable millisecond'
  ) ||
  !productionFinalizationServiceTestSource.includes(
    "{ method: 'PUT', path: 'finalization-intent' }"
  ) ||
  !productionFinalizationServiceTestSource.includes(
    "{ method: 'GET', path: 'finalization-intent' }"
  )
) {
  issues.push(
    'G4 finalization must reconcile a lost intent acknowledgement through the Backend-owned durable intent before reusing its completion instant.'
  );
}
if (
  !productionFrozenConfigCommitmentSource.includes(
    'committedAt: plan.plannedAt'
  ) ||
  !productionFrozenConfigCommitmentSource.includes(
    'workflowRunId: identity.workflowRunId'
  ) ||
  productionFrozenConfigCommitmentSource.includes(
    'workflowRunAttempt: identity.workflowRunAttempt'
  ) ||
  !productionFrozenConfigCommitmentTestSource.includes(
    'replays byte-for-byte across matrix workers and workflow retry attempts'
  ) ||
  !productionFrozenConfigCommitmentTestSource.includes(
    "workflowRunAttempt]: '3'"
  ) ||
  !productionFrozenConfigCommitmentTestSource.includes(
    'expect(await readFile(secondOutput)).toEqual('
  )
) {
  issues.push(
    'G4 same-run attempt 2+ must reuse the exact plan/run commitment bytes while keeping run-attempt identity in execution provenance.'
  );
}
if (
  !validatedHumanMetricProjectionSource.includes(
    'evaluationValidatedHumanMetricObservationSetDigest(empty)'
  ) ||
  !validatedHumanMetricProjectionTestSource.includes(
    'TestEvaluationValidatedHumanMetricSnapshotUsesCanonicalEmptyPreReviewRoot'
  ) ||
  !validatedHumanMetricProjectionTestSource.includes(
    '"validatedHumanMetricObservationDigests": []string{}'
  ) ||
  !archiveFinalizationAuthoritySource.includes(
    'evaluation archive finalized human metric authority is empty'
  )
) {
  issues.push(
    'G4 holdout-before-review must use the canonical empty human-metric root, and finalized archives must require the exact non-empty human authority.'
  );
}
if (
  !productionReleasePlanSource.includes(
    'AGENT_PRODUCTION_RELEASE_EVALUATION_JOURNEY_COUNT = 14_040'
  ) ||
  !providerCapabilityObservationSource.includes('98_280 as const') ||
  !evidenceArchiveSource.includes('plannedJourneyCount: 14_040') ||
  !evidenceArchiveSource.includes(
    'maximumArchiveBytes: 8 * 1_024 * 1_024 * 1_024'
  ) ||
  !evidenceArchiveSource.includes(
    "'capabilityProbeProviderResourceCleanups'"
  ) ||
  !evidenceArchiveSource.includes(
    "'hostedRetrievalRuntimeResourceLifecycleJournals'"
  ) ||
  !evidenceArchiveSource.includes("'hostedRetrievalRuntimeResourceCleanups'") ||
  !evidenceArchiveSource.includes(
    "'capabilityEffectProviderRuntimeJournals'"
  ) ||
  evidenceArchiveSource.indexOf(
    "'hostedRetrievalRuntimeResourceLifecycleJournals'"
  ) >
    evidenceArchiveSource.indexOf("'hostedRetrievalRuntimeResourceCleanups'") ||
  evidenceArchiveSource.indexOf("'hostedRetrievalRuntimeResourceCleanups'") >
    evidenceArchiveSource.indexOf(
      "'capabilityEffectProviderRuntimeJournals'"
    ) ||
  evidenceArchiveSource.indexOf("'capabilityEffectProviderRuntimeJournals'") >
    evidenceArchiveSource.indexOf("'optionalCapabilityFactSources'") ||
  !evidenceArchiveSource.includes(
    'AGENT_EVALUATION_CAPABILITY_AUTHORITY_ARCHIVE_BUDGET.maximumCanonicalBytes +'
  ) ||
  !evidenceArchiveSource.includes(
    'AGENT_EVALUATION_QUALIFICATION_AUTHORITY_ARCHIVE_LIMITS.maximumCanonicalBytes'
  ) ||
  !evidenceArchiveSource.includes(
    'createAgentModelEvaluationEvidenceArchivePhysicalFamilyUsageAccumulator'
  ) ||
  !evidenceArchiveSource.includes(
    'createAgentModelEvaluationEvidenceArchivePhysicalBudget'
  ) ||
  !evidenceArchiveSource.includes(
    'isAgentModelEvaluationEvidenceArchivePhysicalCapacity'
  ) ||
  !evidenceArchiveTestSource.includes(
    'createAgentModelEvaluationEvidenceArchivePhysicalFamilyUsageAccumulator'
  ) ||
  !evidenceArchiveTestSource.includes(
    'createAgentModelEvaluationEvidenceArchivePhysicalBudget'
  ) ||
  !evidenceArchiveTestSource.includes('physicalBudget.totalArchiveBytes') ||
  !evidenceArchiveAuthorityRecordsSource.includes(
    'AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_ARCHIVE_LIMITS.maximumFamilyBytes +'
  ) ||
  !evidenceArchiveAuthorityRecordsSource.includes(
    'AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_CLEANUP_ARCHIVE_LIMITS.maximumFamilyBytes +'
  ) ||
  !evidenceArchiveAuthorityRecordsSource.includes(
    'AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_RUNTIME_ARCHIVE_LIMITS.maximumFamilyBytes +'
  ) ||
  !evidenceArchiveAuthorityRecordsSource.includes(
    'AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_SOURCE_ARCHIVE_LIMITS.maximumFamilyBytes +'
  ) ||
  !modelEvaluationEvidenceVerifierSource.includes(
    'assertG4ModelEvaluationEvidenceFamilyBudget'
  ) ||
  !modelEvaluationEvidenceVerifierSource.includes(
    'createAgentModelEvaluationEvidenceArchivePhysicalFamilyUsageAccumulator'
  ) ||
  !modelEvaluationEvidenceVerifierSource.includes(
    'createAgentModelEvaluationEvidenceArchivePhysicalBudget'
  ) ||
  !modelEvaluationEvidenceVerifierSource.includes(
    'const physicalFamilyUsages = []'
  ) ||
  !modelEvaluationEvidenceVerifierSource.includes(
    'indexBytes: indexBytes.byteLength'
  ) ||
  !modelEvaluationEvidenceVerifierSource.includes(
    'rootBytes: rootBytes.byteLength'
  ) ||
  !modelEvaluationEvidenceVerifierSource.includes(
    'physicalBudget.totalRecordCount !== index.totalRecordCount'
  ) ||
  !modelEvaluationEvidenceVerifierSource.includes(
    'physicalBudget.totalShardBytes !== observedTotalShardBytes'
  ) ||
  !modelEvaluationEvidenceVerifierSource.includes(
    'AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_ARCHIVE_LIMITS'
  ) ||
  !modelEvaluationEvidenceVerifierSource.includes(
    'isAgentEvaluationCapabilityProbeProviderResourceCleanupArchiveRecord'
  ) ||
  !modelEvaluationEvidenceVerifierSource.includes(
    'assertG4ModelEvaluationCapabilityProbeProviderResourceCleanupBinding'
  ) ||
  !modelEvaluationEvidenceVerifierSource.includes(
    'capabilityProbeProviderResourceCleanups: new Map()'
  ) ||
  !modelEvaluationEvidenceVerifierSource.includes(
    'digestAgentCapabilityProbeProviderResourceCleanupResultIngressReceipt'
  ) ||
  !modelEvaluationEvidenceVerifierSource.includes(
    'matchAgentCapabilityProbeProviderResourceCleanupResponse'
  ) ||
  !modelEvaluationEvidenceVerifierSource.includes(
    'archiveOnlyAuthorityRootKeys'
  ) ||
  !/const expectedArchiveOnlyAuthorityRootKeys = \[\s*'capabilityProbeProviderResourceCleanupSetDigest',\s*'hostedRetrievalRuntimeResourceCleanupSetDigest',\s*'capabilityEffectProviderRuntimeJournalSetDigest',?\s*\]\.sort\(compareUnicodeCodePoints\);/u.test(
    modelEvaluationEvidenceVerifierSource
  ) ||
  !modelEvaluationEvidenceVerifierSource.includes(
    'assertG4ModelEvaluationHostedRetrievalRuntimeResourceLifecycleJournalJoins'
  ) ||
  !modelEvaluationEvidenceVerifierSource.includes(
    'createAgentHostedRetrievalRuntimeResourceLifecycleBudgetClosureBindings'
  ) ||
  !modelEvaluationEvidenceVerifierSource.includes(
    'digestAgentEvaluationHostedRetrievalRuntimeResourceLifecycleBudgetClosureBindingSet'
  ) ||
  !modelEvaluationEvidenceVerifierSource.includes(
    'hostedRetrievalRuntimeResourceLifecycleBudgetClosureBindingSetDigest'
  ) ||
  !modelEvaluationEvidenceVerifierSource.includes(
    'hostedSearchQueryCount: 210'
  ) ||
  !modelEvaluationEvidenceVerifierSource.includes('hostedToolCallCount: 222') ||
  !modelEvaluationEvidenceVerifierSource.includes(
    'hostedAttemptToolCallCount: 210'
  ) ||
  !modelEvaluationEvidenceVerifierSource.includes(
    'hostedLifecycleToolCallCount: 12'
  ) ||
  !modelEvaluationEvidenceVerifierSource.includes('providerUploadBytes: 310') ||
  !modelEvaluationEvidenceVerifierSource.includes(
    'providerStorageByteSeconds: 214_272_000'
  ) ||
  !modelEvaluationEvidenceVerifierSource.includes(
    'AGENT_EVALUATION_PROVIDER_CAPABILITY_OBSERVATION_ARCHIVE_BUDGET'
  ) ||
  !modelEvaluationEvidenceVerifierSource.includes(
    "'providerCapabilityObservationReceipts'"
  ) ||
  !modelEvaluationEvidenceVerifierSource.includes(
    'resolveAgentEvaluationCapabilityDescriptor'
  ) ||
  !modelEvaluationEvidenceVerifierSource.includes(
    'AGENT_PRODUCTION_RELEASE_EVALUATION_JOURNEY_COUNT'
  ) ||
  modelEvaluationEvidenceVerifierSource.includes(
    'expectedAttemptCount < 11_640'
  ) ||
  !modelEvaluationEvidenceVerifierSource.includes(
    'createAgentEvaluationCapabilitySpecificProviderObservationProjection'
  ) ||
  !modelEvaluationEvidenceVerifierSource.includes(
    'createAgentEvaluationProviderCapabilityObservationProjection'
  ) ||
  !modelEvaluationEvidenceVerifierSource.includes(
    'matchAgentEvaluationCapabilitySpecificProviderObservationProjection'
  ) ||
  !modelEvaluationEvidenceVerifierSource.includes(
    'matchAgentEvaluationProviderCapabilityObservationFactPolicy'
  ) ||
  modelEvaluationEvidenceVerifierSource.includes(
    'const terminalFacts = receipt.facts.filter'
  ) ||
  !modelEvaluationEvidenceVerifierSource.includes(
    'createAgentEvaluationProviderCapabilityRuntimeFactEnvelope'
  ) ||
  !modelEvaluationEvidenceVerifierSource.includes(
    'createAgentEvaluationProviderCapabilityFactAuthorityFromRuntimeEnvelope'
  ) ||
  !modelEvaluationEvidenceVerifierSource.includes(
    'matchAgentEvaluationProviderCapabilityFactAuthorityBinding'
  ) ||
  !modelEvaluationEvidenceVerifierSource.includes(
    "authority.sourceAuthorityKind === 'shared-durable-capability'"
  ) ||
  !modelEvaluationEvidenceVerifierSource.includes(
    'isAgentEvaluationOptionalCapabilityNativeBootstrapFactSourceArchiveRecord'
  ) ||
  !modelEvaluationEvidenceVerifierSource.includes(
    'createAgentEvaluationProviderCapabilityRuntimeFactEnvelopeFromNativeOptionalCapabilityBootstrapSourceReceipt'
  ) ||
  !modelEvaluationEvidenceVerifierSource.includes(
    'assertG4ModelEvaluationNativeBootstrapFactAuthorityBinding'
  ) ||
  !modelEvaluationEvidenceVerifierSource.includes(
    'createAgentEvaluationCapabilityEffectInputAuthorityRegistryReceipt'
  ) ||
  !modelEvaluationEvidenceVerifierSource.includes(
    'inputAuthorityBinding.sourceRegistryReceiptDigest'
  ) ||
  !modelEvaluationEvidenceVerifierSource.includes(
    'dispatchIntentDigest: value.dispatchIntentDigest'
  ) ||
  !modelEvaluationEvidenceVerifierSource.includes(
    'optionalCapabilityFactSources: new Map()'
  ) ||
  !modelEvaluationEvidenceVerifierSource.includes(
    'optionalCapabilityFactAuthorities: new Map()'
  ) ||
  modelEvaluationEvidenceVerifierSource.includes(
    'const compactObservationFactMatchesSpecific'
  ) ||
  !modelEvaluationEvidenceVerifierTestSource.includes(
    'assert.equal(budget.maximumRecordCount, 98_280)'
  ) ||
  !modelEvaluationEvidenceVerifierTestSource.includes(
    'assert.equal(budget.maximumCanonicalFamilyBytes, 1_610_219_520)'
  ) ||
  !modelEvaluationEvidenceVerifierTestSource.includes(
    'recordCount: budget.maximumRecordCount + 1'
  ) ||
  !modelEvaluationEvidenceVerifierTestSource.includes(
    'canonicalValueBytes: budget.maximumCanonicalFamilyBytes + 1'
  ) ||
  !modelEvaluationEvidenceVerifierTestSource.includes(
    "mutation: 'legacy-13,200-production-denominator'"
  ) ||
  !modelEvaluationEvidenceVerifierTestSource.includes(
    'fixture.evidence.plan.plannedJourneyCount, 13_200'
  ) ||
  !modelEvaluationEvidenceVerifierTestSource.includes(
    "mutation: 'tamper-provider-observation-runtime-envelope'"
  ) ||
  !modelEvaluationEvidenceVerifierTestSource.includes(
    'const actualArchiveBytes ='
  ) ||
  !modelEvaluationEvidenceVerifierTestSource.includes(
    'AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumArchiveBytes'
  ) ||
  !modelEvaluationEvidenceVerifierTestSource.includes('167_936') ||
  !modelEvaluationEvidenceVerifierTestSource.includes('987_463_680') ||
  !modelEvaluationEvidenceVerifierTestSource.includes('196_608') ||
  !modelEvaluationEvidenceVerifierTestSource.includes('786_432') ||
  modelEvaluationEvidenceVerifierTestSource.includes('6_967_431_168') ||
  !modelEvaluationEvidenceVerifierTestSource.includes('3_308_032_000') ||
  !modelEvaluationEvidenceVerifierTestSource.includes('8_138_690_560') ||
  !modelEvaluationEvidenceVerifierTestSource.includes(
    'AGENT_EVALUATION_QUALIFICATION_AUTHORITY_ARCHIVE_LIMITS.maximumCanonicalBytes'
  ) ||
  !modelEvaluationEvidenceVerifierTestSource.includes(
    'AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_AUTHORITY_BUDGET.maximumCanonicalBytes'
  ) ||
  !modelEvaluationEvidenceVerifierTestSource.includes(
    "family: 'hostedRetrievalRuntimeResourceCleanups'"
  ) ||
  !modelEvaluationEvidenceVerifierTestSource.includes(
    'isAgentModelEvaluationEvidenceArchivePhysicalCapacity'
  ) ||
  !modelEvaluationEvidenceVerifierTestSource.includes(
    'maximumShardBytes + 1'
  ) ||
  !modelEvaluationEvidenceVerifierTestSource.includes(
    'fixture.rootBytes.byteLength'
  ) ||
  !modelEvaluationEvidenceVerifierTestSource.includes(
    'verified.physicalBudget.totalArchiveBytes'
  ) ||
  !modelEvaluationEvidenceVerifierTestSource.includes(
    'verified.physicalBudget.familyUsages.length, 46'
  ) ||
  !evaluationRunnerEvidenceArchiveSource.includes('physicalFamilyUsages') ||
  !evaluationRunnerEvidenceArchiveSource.includes('reservedPhysicalBudget') ||
  !evaluationRunnerEvidenceArchiveSource.includes(
    'createAgentModelEvaluationEvidenceArchivePhysicalBudget'
  ) ||
  !evaluationRunnerEvidenceArchiveTestSource.includes(
    'result.physicalFamilyUsages).toHaveLength(46)'
  ) ||
  !evaluationRunnerEvidenceArchiveTestSource.includes(
    'result.reservedPhysicalBudget.totalArchiveBytes'
  ) ||
  !modelEvaluationEvidenceVerifierTestSource.includes(
    'joins every frozen capability-probe Provider resource cleanup through its registration, deletion, owner, and terminal receipt authority'
  ) ||
  !modelEvaluationEvidenceVerifierTestSource.includes(
    "mutation: 'swap-provider-resource-cleanup-registration'"
  ) ||
  !modelEvaluationEvidenceVerifierTestSource.includes(
    "mutation: 'tamper-provider-resource-cleanup-owner'"
  ) ||
  !modelEvaluationEvidenceVerifierTestSource.includes(
    "mutation: 'tamper-provider-resource-cleanup-result'"
  ) ||
  !modelEvaluationEvidenceVerifierTestSource.includes(
    "mutation: 'missing-provider-resource-cleanup'"
  ) ||
  !modelEvaluationEvidenceVerifierTestSource.includes(
    'joins an observed native-bootstrap raw Provider receipt through its sealed shared authority and provider observation'
  ) ||
  !modelEvaluationEvidenceVerifierTestSource.includes(
    'keeps unavailable and failed native-bootstrap raw sources while forbidding synthetic shared authorities'
  ) ||
  !modelEvaluationEvidenceVerifierTestSource.includes(
    'recomputed bootstrap stage or acknowledgement swaps'
  ) ||
  !modelEvaluationEvidenceVerifierTestSource.includes(
    "'g4-provider-background-job'"
  ) ||
  !modelEvaluationEvidenceVerifierTestSource.includes(
    "'g4-provider-hosted-retrieval-core'"
  ) ||
  !modelEvaluationEvidenceVerifierTestSource.includes(
    "'g4-provider-hosted-retrieval-document'"
  ) ||
  !modelEvaluationEvidenceVerifierTestSource.includes(
    "'g4-provider-isolated-cache'"
  ) ||
  !modelEvaluationEvidenceVerifierTestSource.includes(
    "'g4-provider-reasoning-continuation'"
  ) ||
  !modelEvaluationEvidenceVerifierTestSource.includes(
    "mutation: 'swap-runtime-source-registration-receipt'"
  ) ||
  !modelEvaluationEvidenceVerifierTestSource.includes(
    "mutation: 'swap-optional-fact-authority-binding'"
  )
) {
  issues.push(
    'G4 production capacity must stream-account every canonical NDJSON record plus exact index/root bytes for all 46 families and bind the current 14,040-attempt, 98,280-turn archive within the fixed 8 GiB ceiling.'
  );
}
if (
  !modelEvaluationEvidenceVerifierSource.includes(
    'isAgentHostedRetrievalRuntimeResourceCleanupArchiveRecord'
  ) ||
  !modelEvaluationEvidenceVerifierSource.includes(
    'isAgentHostedRetrievalRuntimeResourceCleanupArchiveFamily'
  ) ||
  !modelEvaluationEvidenceVerifierSource.includes(
    'isAgentEvaluationHostedRetrievalRuntimeResourceCleanupArchiveFamilyCompleteForPlan'
  ) ||
  !modelEvaluationEvidenceVerifierSource.includes(
    'matchAgentHostedRetrievalRuntimeResourceCleanupArchiveRunTerminalFenceLedger'
  ) ||
  !modelEvaluationEvidenceVerifierSource.includes(
    'hostedRetrievalRuntimeResourceCleanups: new Map()'
  ) ||
  !modelEvaluationEvidenceVerifierSource.includes(
    'assertG4ModelEvaluationHostedRetrievalRuntimeResourceCleanupJoins'
  ) ||
  !modelEvaluationEvidenceVerifierSource.includes(
    'hostedRetrievalRuntimeResourceRegistrationIntentDigest'
  ) ||
  !modelEvaluationEvidenceVerifierSource.includes(
    'expectedRegistrationIntentDigests.size !== records.length'
  ) ||
  !modelEvaluationEvidenceVerifierSource.includes(
    "checkpoints[0].state !== 'completed'"
  ) ||
  !modelEvaluationEvidenceVerifierSource.includes(
    'checkpoints[0].missingAttemptIds.size !== 0'
  ) ||
  !modelEvaluationEvidenceVerifierSource.includes(
    'terminalAttempts: Object.freeze('
  )
) {
  issues.push(
    'G4 external evidence verification must validate the exact hosted runtime cleanup family, join the four plan registration intents, and bind its Backend-derived terminal fence to every frozen shard and terminal attempt.'
  );
}
for (const postgresTest of [
  'TestAgentModelEvaluationPostgreSQLGate',
  'TestEvaluationFinalizationIntentAndIncompleteTransactionPostgreSQL',
  'TestAgentEvaluationFinalizationAuthorityMigrationPostgreSQLV43Upgrade',
  'TestAgentEvaluationFinalizationAuthorityMigrationPostgreSQLRejectsPopulatedV43',
  'TestAgentEvaluationAttemptAuthorityMigrationPostgreSQLV41Upgrade',
  'TestAgentEvaluationAttemptAuthorityMigrationPostgreSQLQuarantinesLegacyV41Facts',
  'TestAgentEvaluationAttemptAuthorityMigrationPostgreSQLFreshV45',
  'TestAgentEvaluationAttemptAuthorityMigrationPostgreSQLRunConfigArtifactBinding',
  'TestAgentEvaluationAttemptAuthorityMigrationPostgreSQLRejectsPathOnlyClosureUpgrade',
  'TestAgentEvaluationAttemptAuthorityMigrationPostgreSQLCapabilityProbeAdmission',
  'TestAgentEvaluationAttemptAuthorityMigrationPostgreSQLCapabilityProbeProviderResource',
  'TestAgentEvaluationAttemptAuthorityMigrationPostgreSQLCapabilityProbeProviderResourceCleanup',
  'TestAgentEvaluationAttemptAuthorityMigrationPostgreSQLCapabilityEffectInputAuthority',
  'TestAgentEvaluationAttemptAuthorityMigrationPostgreSQLOptionalFactAuthorityUnavailableLifecycle',
  'TestAgentEvaluationAttemptAuthorityMigrationPostgreSQLOptionalFactAuthority',
  'TestAgentEvaluationAttemptAuthorityMigrationPostgreSQLNativeOptionalBootstrapSource',
  'TestAgentEvaluationAttemptAuthorityMigrationPostgreSQLNativeProviderStateVault',
  'TestAgentEvaluationAttemptAuthorityMigrationPostgreSQLOwnerStateLifecycle',
]) {
  if (!modelEvaluationPostgreSQLGateSource.includes(postgresTest)) {
    issues.push(
      `G4 real PostgreSQL Gate is missing the exact ${postgresTest} coverage.`
    );
  }
}
if (
  !modelEvaluationEvidenceVerifierSource.includes(
    'loadProductionAgentEvaluationRunConfigArtifact'
  ) ||
  !modelEvaluationEvidenceVerifierSource.includes(
    'isAgentEvaluationProductionRunConfigArtifactBinding'
  ) ||
  !modelEvaluationEvidenceVerifierSource.includes(
    'runConfigArtifactBinding: loaded.artifactBinding'
  ) ||
  !modelEvaluationEvidenceVerifierSource.includes(
    'AGENT_EVALUATION_PRODUCTION_RUN_CONFIG_MAXIMUM_BYTES'
  ) ||
  modelEvaluationEvidenceVerifierSource.includes('sourceConfigPath') ||
  modelEvaluationEvidenceVerifierSource.includes(
    'loadTrackedFrozenRunConfig'
  ) ||
  modelEvaluationEvidenceVerifierSource.includes("['ls-files'") ||
  modelEvaluationEvidenceVerifierSource.includes("['show'") ||
  !modelEvaluationEvidenceVerifierTestSource.includes(
    'rejects recomputed archive artifact identity and byte-length swaps'
  ) ||
  !modelEvaluationEvidenceVerifierTestSource.includes(
    "sourcePlanArtifactName: 'g4-real-model-plan-swapped'"
  ) ||
  !modelEvaluationEvidenceVerifierTestSource.includes(
    "sourcePlanWorkflowRunId: '5678'"
  ) ||
  !modelEvaluationEvidenceVerifierTestSource.includes(
    'sourcePlanWorkflowRunAttempt: 2'
  ) ||
  !modelEvaluationEvidenceVerifierTestSource.includes('runConfigByteLength: 3')
) {
  issues.push(
    'G4 external evidence verification must load the exact generated production config artifact, cross-bind its workflow identity and canonical bytes, and reject recomputed identity or byte-length swaps.'
  );
}
for (const token of [
  'workflow_dispatch:',
  'schedule:',
  'environment: g4-real-model-evaluation',
  'runs-on: [self-hosted, linux, x64, g4-real-model-evaluation]',
  'PRODIVIX_G4_MODEL_EVAL_ENABLED:',
  'PRODIVIX_G4_MODEL_EVAL_OPENAI_API_KEY:',
  'PRODIVIX_G4_MODEL_EVAL_ANTHROPIC_API_KEY:',
  'PRODIVIX_G4_MODEL_EVAL_GEMINI_API_KEY:',
  'PRODIVIX_G4_MODEL_EVAL_HOSTED_COMPATIBLE_API_KEY:',
  'PRODIVIX_G4_MODEL_EVAL_LOCAL_COMPATIBLE_API_KEY:',
  'PRODIVIX_G4_MODEL_EVAL_HOLDOUT_KEY_BASE64:',
  'PRODIVIX_G4_MODEL_EVAL_RESULT_SPOOL_KEY_BASE64:',
  'PRODIVIX_G4_MODEL_EVAL_DATABASE_URL:',
  'PRODIVIX_G4_MODEL_EVAL_SERVICE_TOKEN:',
  'PRODIVIX_G4_MODEL_EVAL_OWNER_AUTHORITY_SERVICE_TOKEN:',
  'PRODIVIX_G4_MODEL_EVAL_ATTESTATION_PRIVATE_KEY:',
  'PRODIVIX_G4_MODEL_EVAL_ATTESTATION_AUTHORITY_ID:',
  'PRODIVIX_G4_MODEL_EVAL_ENVIRONMENT_DIGEST:',
  'PRODIVIX_G4_MODEL_EVAL_WORKFLOW_RUN_ID:',
  'PRODIVIX_G4_MODEL_EVAL_RUN_CONFIG_PATH=${GENERATED_CONFIG}',
  '.providers.openaiResponses.model.modelId',
  '.providers.anthropicMessages.model.modelId',
  '.providers.geminiInteractions.model.modelId',
  '.github/workflows/g4-real-model-human-review.yml',
  'PRODIVIX_G4_MODEL_EVAL_SECRET_CANARIES:',
  'PRODIVIX_G4_MODEL_EVAL_PROTECTED_HOLDOUT_CANARIES:',
  "['MASK_SECRET_CANARIES', 'MASK_HOLDOUT_CANARIES']",
  'PRODIVIX_G4_MODEL_EVAL_TRUSTED_PUBLIC_KEYS=',
  'PRODIVIX_G4_MODEL_EVAL_SERVICE_BASE_URL: http://127.0.0.1:8790',
  'PRODIVIX_G4_MODEL_EVAL_OWNER_AUTHORITY_BASE_URL: http://127.0.0.1:8791',
  'Tracked evidence-free qualification template; generated production authority is sealed before plan publication.',
  'production-run-config.json',
  'Admit same-run generated production config',
  'Admit and cross-bind source generated production config',
  'PRODIVIX_G4_MODEL_EVAL_FROZEN_CONFIG_COMMITMENT_PATH:',
  'PRODIVIX_G4_MODEL_EVAL_REPOSITORY_ROOT:',
  'PRODIVIX_G4_MODEL_EVAL_JOB_ID: full_shards',
  'PRODIVIX_G4_MODEL_EVAL_WORKFLOW_JOB_ID: full_shards',
  'freeze-config-commitment \\',
  'node apps/agent-evaluation-runner/dist/productionOwnerAuthoritySidecarMain.js',
  'go build -trimpath -o "${LEDGER_BINARY}" ./cmd/agent-evaluation-ledger',
  'pnpm install --offline --frozen-lockfile',
  "GOPROXY: 'off'",
  'preplan \\',
  'plan \\',
  'smoke \\',
  'run-shard \\',
  '^evaluation-shard:([0-9a-f]{64})$',
  'steps.shard_artifact.outputs.value',
  'status \\',
  'export-review \\',
  'import-review \\',
  'finalize \\',
  'export-evidence \\',
  '--archive-output "${EVIDENCE_ARCHIVE_PATH}"',
  '--root-output "${EVIDENCE_ROOT_PATH}"',
  'PRODIVIX_G4_MODEL_EVAL_EVIDENCE_ARCHIVE:',
  'PRODIVIX_G4_MODEL_EVAL_EVIDENCE_ROOT:',
  'planArtifactRunAttempt',
  'planArtifactName',
  'planArtifactDigest',
  'planDigest',
  'deterministicRunId',
  '.github/workflows/g4-v9-golden-closure.yml',
  'pnpm run assemble:g4:closure:evidence',
  'pnpm run verify:g4:golden:evidence',
  'g4-closure.json',
  'pnpm run verify:g4:model-eval:evidence',
  'seal-run-config-artifact',
  'PRODIVIX_G4_MODEL_EVAL_RUN_CONFIG_ARTIFACT_NAME: ${{ steps.plan_authority.outputs.value }}',
  'PRODIVIX_G4_MODEL_EVAL_RUN_CONFIG_ARTIFACT_DIGEST: ${{ steps.artifact_authority.outputs.digest }}',
  'PRODIVIX_G4_MODEL_EVAL_RUN_CONFIG_ARTIFACT_RUN_ATTEMPT: ${{ steps.plan_authority.outputs.producer_attempt }}',
  'Resolve remote-model evidence availability',
  "mode: ${{ steps.remote_evidence.outputs.admitted == 'false' && 'evidence-pending' || steps.contract.outputs.mode }}",
  'echo \'admitted=false\' >> "${GITHUB_OUTPUT}"',
  'echo \'evidence_status=evidence-pending\' >> "${GITHUB_OUTPUT}"',
  'Configured / Evidence pending: remote-model evaluation is disabled and no Provider operation was dispatched.',
  "if: steps.remote_evidence.outputs.admitted == 'true'",
]) {
  if (!realModelWorkflowSource.includes(token)) {
    issues.push(`G4 protected real-model workflow is missing ${token}.`);
  }
}
if (
  realModelWorkflowSource.split(
    "if: steps.remote_evidence.outputs.admitted == 'true'"
  ).length -
    1 !==
    2 ||
  !realModelWorkflowSource.includes(
    "REQUEST_MODE: ${{ github.event_name == 'schedule' && 'evaluate' || inputs.mode }}"
  ) ||
  !realModelWorkflowSource.includes(
    "${{ github.event_name == 'schedule' && vars.PRODIVIX_G4_MODEL_EVAL_ENABLED || inputs.enable_remote_models }}"
  ) ||
  !realModelWorkflowSource.includes(
    'remote-model evaluation is disabled and no Provider operation was dispatched.'
  ) ||
  /\bpull_request\s*:/u.test(realModelWorkflowSource) ||
  /\bpush\s*:/u.test(realModelWorkflowSource)
) {
  issues.push(
    'G4 real-model evaluation must turn a disabled remote authority into an explicit Configured / Evidence pending success while skipping checkout, secrets, self-hosted runners, and Provider dispatch.'
  );
}
for (const [token, expectedCount] of [
  [
    'PRODIVIX_G4_MODEL_EVAL_RUN_CONFIG_ARTIFACT_NAME: ${{ needs.plan.outputs.plan_artifact_name }}',
    6,
  ],
  [
    'PRODIVIX_G4_MODEL_EVAL_RUN_CONFIG_ARTIFACT_DIGEST: ${{ needs.plan.outputs.plan_artifact_digest }}',
    6,
  ],
  [
    'PRODIVIX_G4_MODEL_EVAL_RUN_CONFIG_ARTIFACT_RUN_ID: ${{ github.run_id }}',
    8,
  ],
  [
    'PRODIVIX_G4_MODEL_EVAL_RUN_CONFIG_ARTIFACT_RUN_ATTEMPT: ${{ needs.plan.outputs.plan_artifact_run_attempt }}',
    6,
  ],
  [
    'PRODIVIX_G4_MODEL_EVAL_RUN_CONFIG_ARTIFACT_NAME: ${{ needs.preflight.outputs.source_plan_artifact_name }}',
    1,
  ],
  [
    'PRODIVIX_G4_MODEL_EVAL_RUN_CONFIG_ARTIFACT_DIGEST: ${{ needs.preflight.outputs.source_plan_artifact_digest }}',
    1,
  ],
  [
    'PRODIVIX_G4_MODEL_EVAL_RUN_CONFIG_ARTIFACT_RUN_ID: ${{ needs.preflight.outputs.source_evaluation_run_id }}',
    1,
  ],
  [
    'PRODIVIX_G4_MODEL_EVAL_RUN_CONFIG_ARTIFACT_RUN_ATTEMPT: ${{ needs.preflight.outputs.source_plan_run_attempt }}',
    1,
  ],
]) {
  if (realModelWorkflowSource.split(token).length - 1 !== expectedCount) {
    issues.push(
      `G4 generated production config artifact binding must contain ${expectedCount} exact ${token} occurrence(s).`
    );
  }
}
if (
  realModelWorkflowSource.split('probeProviderResourceAuthorityCount !== 4')
    .length -
    1 !==
    2 ||
  realModelWorkflowSource.split("'anthropic-messages'").length - 1 !== 2 ||
  realModelHumanReviewWorkflowSource.split(
    'probeProviderResourceAuthorityCount !== 4'
  ).length -
    1 !==
    1 ||
  realModelHumanReviewWorkflowSource.split("'anthropic-messages'").length -
    1 !==
    1 ||
  realModelWorkflowSource.split('providerResourceCleanupReceiptCount !== 4')
    .length -
    1 !==
    2 ||
  realModelWorkflowSource.split('preplanAuthorityOperationCount !== 41')
    .length -
    1 !==
    2 ||
  realModelHumanReviewWorkflowSource.split(
    'providerResourceCleanupReceiptCount !== 4'
  ).length -
    1 !==
    1 ||
  realModelHumanReviewWorkflowSource.split(
    'preplanAuthorityOperationCount !== 41'
  ).length -
    1 !==
    1 ||
  !realModelOperationsSource.includes(
    '4 个 durable Provider resource cleanup receipts'
  ) ||
  !realModelOperationsSource.includes('共 41 个 authority operations') ||
  !realModelOperationsSource.includes(
    '4 resource registrations → 15 runtime registrations → 18 probes → 4 durable cleanups'
  )
) {
  issues.push(
    'G4 generated production config admission must require exact 4/15/18/4 preplan authority families, 41 total operations, and reject Anthropic resource authority presence on every consumer path.'
  );
}
if (
  (
    realModelWorkflowSource.match(
      /PRODIVIX_G4_MODEL_EVAL_RUN_CONFIG_PATH: \$\{\{ needs\.preflight\.outputs\.run_config \}\}/gu
    ) ?? []
  ).length !== 0 ||
  (
    realModelWorkflowSource.match(
      /PRODIVIX_G4_MODEL_EVAL_RUN_CONFIG_TEMPLATE_PATH: \$\{\{ github\.workspace \}\}\/\$\{\{ needs\.preflight\.outputs\.run_config \}\}/gu
    ) ?? []
  ).length !== 2 ||
  (
    realModelWorkflowSource.match(
      /- name: Admit same-run generated production config/gu
    ) ?? []
  ).length !== 6 ||
  (
    realModelWorkflowSource.match(
      /echo "PRODIVIX_G4_MODEL_EVAL_RUN_CONFIG_PATH=\$\{GENERATED_CONFIG\}" >> "\$\{GITHUB_ENV\}"/gu
    ) ?? []
  ).length !== 7
) {
  issues.push(
    'G4 workflow must pass the tracked template only through the pre-plan template channel and propagate one admitted generated production config artifact through smoke, shard, review export, and finalization.'
  );
}
const fullShardsStart = realModelWorkflowSource.indexOf('\n  full_shards:');
const fullShardsEnd = realModelWorkflowSource.indexOf(
  '\n  hosted_cleanup:',
  fullShardsStart
);
const fullShardsWorkflow = realModelWorkflowSource.slice(
  fullShardsStart,
  fullShardsEnd
);
const fullShardsOrderedTokens = [
  'Download same-run frozen plan',
  'Download same-run signed frozen config commitment',
  'Admit same-run generated production config',
  'Start independent Backend Verification owner',
  'Start Backend-owned evaluation ledger bootstrap',
  'Verify instance-bound shard state-vault readiness',
  'Verify clean capability-effect Provider journal readiness',
  'Verify hosted retrieval runtime owner preactivation readiness',
  'Start controlled Workspace and G3 owner authority',
  'Verify activated Backend-owned evaluation ledger',
  'Execute exact shard with global atomic budget',
  'Upload sanitized shard status',
  'Stop PID-bound shard authorities',
];
const fullShardsTokenIndexes = fullShardsOrderedTokens.map((token) =>
  fullShardsWorkflow.indexOf(token)
);
const fullShardsOwnerStopIndex = fullShardsWorkflow.indexOf(
  `stop_owned_process "\${OWNER_AUTHORITY_PID_FILE}" 'node' 'apps/agent-evaluation-runner/dist/productionOwnerAuthoritySidecarMain.js' 'Owner authority' 120`
);
const fullShardsShutdownReceiptIndex = fullShardsWorkflow.indexOf(
  'Owner authority canonical shutdown receipt is unavailable.'
);
const fullShardsLedgerStopIndex = fullShardsWorkflow.indexOf(
  `stop_owned_process "\${LEDGER_PID_FILE}" "\${LEDGER_BINARY}" "\${LEDGER_BINARY}" 'Evaluation ledger' 60`
);
const fullShardsVerificationStopIndex = fullShardsWorkflow.indexOf(
  `stop_owned_process "\${VERIFICATION_PID_FILE}" "\${VERIFICATION_BINARY}" "\${VERIFICATION_BINARY}" 'Backend Verification owner' 60`
);
const fullShardsStateVaultRecoveryIndex = fullShardsWorkflow.indexOf(
  'recover_state_vault() {'
);
const fullShardsStateVaultClosureIndex = fullShardsWorkflow.indexOf(
  "ledger_pid_for_health=''"
);
if (
  fullShardsStart < 0 ||
  fullShardsEnd < 0 ||
  fullShardsTokenIndexes.some((index) => index < 0) ||
  fullShardsTokenIndexes.some(
    (index, position) =>
      position > 0 && index <= fullShardsTokenIndexes[position - 1]
  ) ||
  fullShardsOwnerStopIndex < 0 ||
  fullShardsShutdownReceiptIndex <= fullShardsOwnerStopIndex ||
  fullShardsStateVaultRecoveryIndex <= fullShardsShutdownReceiptIndex ||
  fullShardsStateVaultClosureIndex <= fullShardsStateVaultRecoveryIndex ||
  fullShardsVerificationStopIndex <= fullShardsStateVaultClosureIndex ||
  fullShardsLedgerStopIndex <= fullShardsVerificationStopIndex ||
  (
    fullShardsWorkflow.match(
      /PRODIVIX_G4_MODEL_EVAL_OWNER_AUTHORITY_BASE_URL: http:\/\/127\.0\.0\.1:8791/gu
    ) ?? []
  ).length !== 1 ||
  !fullShardsWorkflow.includes('kill -0 "${owner_authority_pid}"') ||
  !fullShardsWorkflow.includes('kill -0 "${ledger_pid}"') ||
  !fullShardsWorkflow.includes('kill -0 "${verification_pid}"') ||
  !fullShardsWorkflow.includes(
    'OWNER_AUTHORITY_PID_FILE: ${{ runner.temp }}/g4-model-eval-owner-authority.pid'
  ) ||
  !fullShardsWorkflow.includes(
    'PRODIVIX_G4_MODEL_EVAL_OWNER_AUTHORITY_SHUTDOWN_RECEIPT_PATH: ${{ runner.temp }}/g4-model-eval-owner-authority-state/shutdown-receipt.json'
  ) ||
  !fullShardsWorkflow.includes(
    'LEDGER_PID_FILE: ${{ runner.temp }}/g4-model-eval-ledger.pid'
  ) ||
  !fullShardsWorkflow.includes(
    'VERIFICATION_PID_FILE: ${{ runner.temp }}/g4-verification-owner.pid'
  ) ||
  !fullShardsWorkflow.includes('Build exact Backend evaluation ledger') ||
  !fullShardsWorkflow.includes(
    'go build -trimpath -o "${LEDGER_BINARY}" ./cmd/agent-evaluation-ledger'
  ) ||
  !fullShardsWorkflow.includes('"${LEDGER_BINARY}" > "${LEDGER_LOG}" 2>&1 &') ||
  !fullShardsWorkflow.includes(
    'go build -trimpath -o "${VERIFICATION_BINARY}" ./cmd/server'
  ) ||
  !fullShardsWorkflow.includes(
    '"${VERIFICATION_BINARY}" > "${VERIFICATION_LOG}" 2>&1 &'
  ) ||
  fullShardsWorkflow.includes('go run ./cmd/agent-evaluation-ledger') ||
  !fullShardsWorkflow.includes('Stop PID-bound shard authorities') ||
  !/- name: Stop PID-bound shard authorities\r?\n\s+if: always\(\)/u.test(
    fullShardsWorkflow
  ) ||
  !fullShardsWorkflow.includes(
    "'apps/agent-evaluation-runner/dist/productionOwnerAuthoritySidecarMain.js' 'Owner authority'"
  ) ||
  !fullShardsWorkflow.includes(
    'stop_owned_process "${LEDGER_PID_FILE}" "${LEDGER_BINARY}" "${LEDGER_BINARY}" \'Evaluation ledger\' 60'
  ) ||
  !fullShardsWorkflow.includes(
    'stop_owned_process "${VERIFICATION_PID_FILE}" "${VERIFICATION_BINARY}" "${VERIFICATION_BINARY}" \'Backend Verification owner\' 60'
  ) ||
  !fullShardsWorkflow.includes(
    "stop_owned_process \"${OWNER_AUTHORITY_PID_FILE}\" 'node' 'apps/agent-evaluation-runner/dist/productionOwnerAuthoritySidecarMain.js' 'Owner authority' 120"
  ) ||
  !fullShardsWorkflow.includes('readlink -f -- "/proc/${pid}/exe"') ||
  !fullShardsWorkflow.includes('for _ in $(seq 1 5); do') ||
  !fullShardsWorkflow.includes(
    'remained alive after the bounded KILL wait; preserving PID authority for diagnosis.'
  ) ||
  fullShardsWorkflow.indexOf(
    'remained alive after the bounded KILL wait; preserving PID authority for diagnosis.'
  ) > fullShardsWorkflow.indexOf('rm -f -- "${pid_file}"') ||
  !fullShardsWorkflow.includes(
    'pnpm exec tsx scripts/verify-g4-evaluation-owner-lifecycle.mjs shutdown-receipt full-attempt'
  ) ||
  !fullShardsWorkflow.includes(
    'Evaluation ledger PID authority is invalid before state-vault closure.'
  ) ||
  !fullShardsWorkflow.includes(
    'pnpm exec tsx scripts/verify-g4-native-provider-state-vault-recovery.mjs recover 130000'
  ) ||
  fullShardsWorkflow.split('recover_state_vault || cleanup_failed=1').length -
    1 !==
    3 ||
  !/else\r?\n\s+recover_state_vault \|\| cleanup_failed=1\r?\n\s+fi\r?\n\s+stop_owned_process "\$\{VERIFICATION_PID_FILE\}"/u.test(
    fullShardsWorkflow
  ) ||
  !fullShardsWorkflow.includes(
    "PRODIVIX_G4_MODEL_EVAL_NATIVE_PROVIDER_STATE_VAULT_RECOVERY_ONLY: '1'"
  ) ||
  !fullShardsWorkflow.includes(
    "PRODIVIX_G4_MODEL_EVAL_OWNER_AUTHORITY_BASE_URL: ''"
  ) ||
  !fullShardsWorkflow.includes(
    "PRODIVIX_G4_MODEL_EVAL_OWNER_AUTHORITY_SERVICE_TOKEN: ''"
  ) ||
  !fullShardsWorkflow.includes(
    "PRODIVIX_G4_MODEL_EVAL_OWNER_AUTHORITY_PURPOSE: ''"
  ) ||
  !evaluationOwnerLifecycleVerifierSource.includes(
    "'prodivix.agent-evaluation-owner-authority-shutdown'"
  ) ||
  !evaluationOwnerLifecycleVerifierSource.includes(
    "'prodivix.agent-evaluation-owner-authority-resource-retirement'"
  ) ||
  !evaluationOwnerLifecycleVerifierSource.includes(
    'value.resourceRetirementReceiptDigest !=='
  ) ||
  !evaluationOwnerLifecycleVerifierSource.includes(
    'residualResources[key].length !== 0'
  ) ||
  !evaluationOwnerLifecycleVerifierSource.includes(
    '(metadata.mode & 0o777) !== 0o600'
  ) ||
  !evaluationOwnerLifecycleVerifierSource.includes('constants.O_NOFOLLOW') ||
  !evaluationOwnerLifecycleVerifierSource.includes(
    'authorities[key] !== expectedAuthorityDigests[key]'
  ) ||
  !evaluationOwnerLifecycleVerifierSource.includes(
    'receiptDigest !== digestCanonicalValue(base)'
  )
) {
  issues.push(
    'G4 full_shards must freeze the exact config, start PID-bound Verification/ledger/owner authorities in dependency order, execute the shard, and verify clean owner and vault retirement before stopping Verification and the ledger.'
  );
}
const planJobStart = realModelWorkflowSource.indexOf('\n  plan:');
const planJobEnd = realModelWorkflowSource.indexOf('\n  smoke:', planJobStart);
const preflightJobWorkflow = realModelWorkflowSource.slice(0, planJobStart);
const planJobWorkflow = realModelWorkflowSource.slice(planJobStart, planJobEnd);
const workflowStepSource = (jobSource, stepName) => {
  const marker = `\n      - name: ${stepName}\n`;
  const start = jobSource.indexOf(marker);
  if (start < 0) return '';
  const end = jobSource.indexOf('\n      - name: ', start + marker.length);
  return jobSource.slice(start, end < 0 ? jobSource.length : end);
};
const workflowOutsideProbeSpoolKeyScopes = `${realModelWorkflowSource.slice(
  0,
  planJobStart
)}${realModelWorkflowSource.slice(
  planJobEnd,
  realModelWorkflowSource.indexOf('\n  hosted_prepare:', planJobEnd)
)}${realModelWorkflowSource.slice(
  realModelWorkflowSource.indexOf('\n  export_review:', fullShardsEnd)
)}`;
const capabilityProbeSpoolKeyEnvironmentName =
  'PRODIVIX_G4_MODEL_EVAL_CAPABILITY_PROBE_RESPONSE_SPOOL_KEY_BASE64';
const capabilityEffectProviderJournalSpoolKeyEnvironmentName =
  'PRODIVIX_G4_MODEL_EVAL_CAPABILITY_EFFECT_PROVIDER_JOURNAL_SPOOL_KEY_BASE64';
const probeSpoolMaskStep = workflowStepSource(
  planJobWorkflow,
  'Register preplan authority encryption key masks'
);
const preplanOwnerStep = workflowStepSource(
  planJobWorkflow,
  'Start preplan capability and runtime-source owner authority'
);
const planArtifactScanStep = workflowStepSource(
  planJobWorkflow,
  'Scan plan artifact for service-secret values'
);
const planStateVaultClosureStep = workflowStepSource(
  planJobWorkflow,
  'Verify or recover plan state-vault zero-residual terminus'
);
if (
  planJobStart < 0 ||
  planJobEnd < 0 ||
  probeSpoolMaskStep.length === 0 ||
  preplanOwnerStep.length === 0 ||
  planArtifactScanStep.length === 0 ||
  planStateVaultClosureStep.length === 0 ||
  realModelWorkflowSource.split(capabilityProbeSpoolKeyEnvironmentName).length -
    1 !==
    18 ||
  realModelWorkflowSource.split(
    `secrets.${capabilityProbeSpoolKeyEnvironmentName}`
  ).length -
    1 !==
    11 ||
  workflowOutsideProbeSpoolKeyScopes.includes(
    capabilityProbeSpoolKeyEnvironmentName
  ) ||
  realModelHumanReviewWorkflowSource.includes(
    capabilityProbeSpoolKeyEnvironmentName
  ) ||
  v9WorkflowSource.includes(capabilityProbeSpoolKeyEnvironmentName) ||
  planJobWorkflow.includes('PRODIVIX_G4_MODEL_EVAL_RESULT_SPOOL_KEY_BASE64') ||
  !probeSpoolMaskStep.includes(
    "if: steps.plan_authority.outputs.reused != 'true'"
  ) ||
  !probeSpoolMaskStep.includes(
    `MASK_CAPABILITY_PROBE_RESPONSE_SPOOL_KEY: \${{ secrets.${capabilityProbeSpoolKeyEnvironmentName} }}`
  ) ||
  !probeSpoolMaskStep.includes(
    "decodeCanonicalAes256Key('capability-probe response spool key'"
  ) ||
  !probeSpoolMaskStep.includes('key.byteLength !== 32') ||
  !probeSpoolMaskStep.includes("key.toString('base64') !== encoded") ||
  !probeSpoolMaskStep.includes("key.toString('base64url')") ||
  !probeSpoolMaskStep.includes("key.toString('hex')") ||
  !probeSpoolMaskStep.includes('probeSpoolKey.fill(0)') ||
  !probeSpoolMaskStep.includes(
    'nativeProviderStateVaultKey.equals(probeSpoolKey)'
  ) ||
  preplanOwnerStep.split(
    `${capabilityProbeSpoolKeyEnvironmentName}: \${{ secrets.${capabilityProbeSpoolKeyEnvironmentName} }}`
  ).length -
    1 !==
    1 ||
  preplanOwnerStep.includes('PRODIVIX_G4_MODEL_EVAL_RESULT_SPOOL_KEY_BASE64') ||
  !planArtifactScanStep.includes(
    `SCAN_CAPABILITY_PROBE_RESPONSE_SPOOL_KEY: \${{ steps.plan_authority.outputs.reused != 'true' && secrets.${capabilityProbeSpoolKeyEnvironmentName} || '' }}`
  ) ||
  !planArtifactScanStep.includes(
    'PREPLAN_AUTHORITY_REUSED: ${{ steps.plan_authority.outputs.reused }}'
  ) ||
  !planArtifactScanStep.includes(
    'preplanReused === Boolean(encodedProbeSpoolKey)'
  ) ||
  !planArtifactScanStep.includes('probeSpoolKey.byteLength !== 32') ||
  !planArtifactScanStep.includes('probeSpoolKey.fill(0)')
) {
  issues.push(
    'G4 active-probe response spool key must be exact-32-byte validated, derivation-masked, artifact-scanned, and injected only into a newly executed preplan 8791 sidecar; the full attempt may read it only in mask and artifact-scan steps for key separation, while replay and every other job remain outside its scope.'
  );
}
if (
  preflightJobWorkflow.includes('secrets.') ||
  !preflightJobWorkflow.includes(
    "mode: ${{ steps.remote_evidence.outputs.admitted == 'false' && 'evidence-pending' || steps.contract.outputs.mode }}"
  ) ||
  !preflightJobWorkflow.includes(
    "if: steps.remote_evidence.outputs.admitted == 'true'"
  ) ||
  !planJobWorkflow.includes("if: needs.preflight.outputs.mode == 'evaluate'")
) {
  issues.push(
    'G4 evidence-pending preflight must expand zero secrets and leave every protected evaluate job unreachable until remote authority is explicitly admitted.'
  );
}
if (
  planJobStart < 0 ||
  planJobEnd < 0 ||
  !planJobWorkflow.includes(
    'MASK_OWNER_AUTHORITY_TOKEN: ${{ secrets.PRODIVIX_G4_MODEL_EVAL_OWNER_AUTHORITY_SERVICE_TOKEN }}'
  ) ||
  !planJobWorkflow.includes(
    "['owner authority service token', ownerAuthorityToken]"
  ) ||
  !planJobWorkflow.includes('ownerAuthorityToken === serviceToken') ||
  !planJobWorkflow.includes('MASK_OPENAI:') ||
  !planJobWorkflow.includes('MASK_ANTHROPIC:') ||
  !planJobWorkflow.includes('MASK_GEMINI:') ||
  !planJobWorkflow.includes(
    "['MASK_SECRET_CANARIES', 'MASK_HOLDOUT_CANARIES']"
  ) ||
  !planJobWorkflow.includes("Buffer.from(value).toString('base64url')") ||
  !fullShardsWorkflow.includes(
    'MASK_OWNER_AUTHORITY_TOKEN: ${{ secrets.PRODIVIX_G4_MODEL_EVAL_OWNER_AUTHORITY_SERVICE_TOKEN }}'
  ) ||
  !fullShardsWorkflow.includes(
    "['owner authority service token', ownerAuthorityToken]"
  ) ||
  !fullShardsWorkflow.includes('ownerAuthorityToken === serviceToken') ||
  !fullShardsWorkflow.includes('verificationOwnerToken === serviceToken') ||
  !fullShardsWorkflow.includes(
    'verificationOwnerToken === ownerAuthorityToken'
  ) ||
  !fullShardsWorkflow.includes('process.env.MASK_OWNER_AUTHORITY_TOKEN') ||
  !fullShardsWorkflow.includes('process.env.MASK_VERIFICATION_OWNER_TOKEN') ||
  !fullShardsWorkflow.includes('process.env.MASK_DATABASE_URL') ||
  !fullShardsWorkflow.includes("Buffer.from(value).toString('base64url')")
) {
  issues.push(
    'G4 preplan and full_shards must validate, independently scope, and mask provider, owner, Verification, ledger, database, and canary authority values.'
  );
}

const planOrderedTokens = [
  'Resolve same-run immutable plan authority',
  'Download prior-attempt same-run frozen plan',
  'Admit prior-attempt production config and plan bytes',
  'Start Backend-owned evaluation ledger bootstrap',
  'Verify instance-bound plan state-vault readiness',
  'Verify clean plan capability-effect Provider journal readiness',
  'Verify hosted retrieval runtime owner preactivation readiness',
  'Start preplan capability and runtime-source owner authority',
  'Verify activated Backend-owned evaluation ledger',
  'Seal or replay exact preplan production authority',
  'Publish plan only after sealed preplan authority',
  'Decode bounded shard matrix',
  'Scan plan artifact for service-secret values',
  'Upload frozen plan',
  'Stop PID-bound preplan owner authority',
  'Verify or recover plan state-vault zero-residual terminus',
  'Stop PID-bound evaluation ledger',
];
const planTokenIndexes = planOrderedTokens.map((token) =>
  planJobWorkflow.indexOf(token)
);
if (
  planTokenIndexes.some((index) => index < 0) ||
  planTokenIndexes.some(
    (index, position) => position > 0 && index <= planTokenIndexes[position - 1]
  ) ||
  !planJobWorkflow.includes('timeout-minutes: 45') ||
  !planJobWorkflow.includes('actions: read') ||
  !planJobWorkflow.includes('gh api --paginate --slurp') ||
  !planJobWorkflow.includes('/attempts/${attempt}/jobs?per_page=100') ||
  !planJobWorkflow.includes('attempt<GITHUB_RUN_ATTEMPT') ||
  !planJobWorkflow.includes(
    "if: steps.plan_authority.outputs.reused == 'true'"
  ) ||
  !planJobWorkflow.includes(
    "if: steps.plan_authority.outputs.reused != 'true'"
  ) ||
  !planJobWorkflow.includes(
    "const expectedNames = ['plan.json', 'production-run-config.json', 'shards.json']"
  ) ||
  !planJobWorkflow.includes('config.plan.plannedJourneyCount !== 14_040') ||
  !planJobWorkflow.includes('probeProviderResourceAuthorityCount !== 4') ||
  !planJobWorkflow.includes("'anthropic-messages'") ||
  !planJobWorkflow.includes('qualificationProbeCount !== 18') ||
  !planJobWorkflow.includes('runtimeFactSourceCount !== 15') ||
  !planJobWorkflow.includes('providerResourceCleanupReceiptCount !== 4') ||
  !planJobWorkflow.includes('preplanAuthorityOperationCount !== 41') ||
  !evaluationOwnerLifecycleVerifierSource.includes(
    'cleanupReceiptCount !== 4'
  ) ||
  !/- name: Stop PID-bound preplan owner authority\r?\n\s+if: always\(\)/u.test(
    planJobWorkflow
  ) ||
  !/- name: Stop PID-bound evaluation ledger\r?\n\s+if: always\(\)/u.test(
    planJobWorkflow
  ) ||
  !planJobWorkflow.includes(
    'timeout --foreground --signal=TERM --kill-after=5s 30m'
  ) ||
  !planJobWorkflow.includes('preplan_deadline_epoch=') ||
  !planJobWorkflow.includes(
    'The bounded preplan authority did not complete; plan publication is forbidden.'
  ) ||
  !planJobWorkflow.includes('--config "${TRACKED_TEMPLATE}"') ||
  !planJobWorkflow.includes('--output "${GENERATED_CONFIG}"') ||
  !planJobWorkflow.includes(
    'RUN_CONFIG: ${{ runner.temp }}/g4-real-model-plan/production-run-config.json'
  ) ||
  !planJobWorkflow.includes(
    'pnpm exec tsx scripts/verify-g4-evaluation-owner-lifecycle.mjs owner-health preplan 60000'
  ) ||
  !evaluationOwnerLifecycleVerifierSource.includes(
    'capabilityProbeProviderResourceAuthorityDigest'
  ) ||
  !evaluationOwnerLifecycleVerifierSource.includes(
    'capabilityProbeProviderResourceCleanupAuthorityDigest'
  ) ||
  !evaluationOwnerLifecycleVerifierSource.includes(
    'runtimeFactSourceRegistrationAuthorityDigest'
  ) ||
  !planJobWorkflow.includes(
    'PRODIVIX_G4_MODEL_EVAL_OWNER_AUTHORITY_SHUTDOWN_RECEIPT_PATH: ${{ runner.temp }}/g4-model-eval-preplan-owner-authority-state/shutdown-receipt.json'
  ) ||
  !planJobWorkflow.includes(
    'The prior-attempt generated config drifted from the same-run plan authority'
  ) ||
  !planJobWorkflow.includes('artifact_digest="sha256:${artifact_digest}"') ||
  !planStateVaultClosureStep.includes(
    "PRODIVIX_G4_MODEL_EVAL_NATIVE_PROVIDER_STATE_VAULT_RECOVERY_ONLY: '1'"
  ) ||
  !planStateVaultClosureStep.includes(
    "PRODIVIX_G4_MODEL_EVAL_OWNER_AUTHORITY_BASE_URL: ''"
  ) ||
  !planStateVaultClosureStep.includes(
    "PRODIVIX_G4_MODEL_EVAL_OWNER_AUTHORITY_SERVICE_TOKEN: ''"
  ) ||
  !planStateVaultClosureStep.includes(
    "PRODIVIX_G4_MODEL_EVAL_OWNER_AUTHORITY_PURPOSE: ''"
  ) ||
  !planStateVaultClosureStep.includes(
    'if [[ -f "${LEDGER_PID_FILE}" ]]; then'
  ) ||
  planStateVaultClosureStep.includes('|| ! -f "${LEDGER_PID_FILE}" ||') ||
  !planStateVaultClosureStep.includes(
    'pnpm exec tsx scripts/verify-g4-native-provider-state-vault-health.mjs zero 130000'
  ) ||
  !planStateVaultClosureStep.includes(
    'pnpm exec tsx scripts/verify-g4-native-provider-state-vault-recovery.mjs recover 130000'
  ) ||
  !planStateVaultClosureStep.includes('port:8790,exclusive:true') ||
  !planStateVaultClosureStep.includes(
    '"${LEDGER_BINARY}" > "${LEDGER_LOG}" 2>&1 &'
  )
) {
  issues.push(
    'G4 plan must reuse prior same-run bytes or bootstrap 8790/vault, activate the exact 8791 preplan, and execute the bounded 4-resource, 15-registration, 18-probe, and 4-cleanup preplan before publication, then verify clean 8791/vault retirement and finally retire the ledger.'
  );
}
const smokeJobStart = realModelWorkflowSource.indexOf('\n  smoke:');
const smokeJobEnd = realModelWorkflowSource.indexOf(
  '\n  hosted_prepare:',
  smokeJobStart
);
const hostedPrepareJobStart = smokeJobEnd;
const hostedPrepareJobEnd = fullShardsStart;
const hostedCleanupJobStart = fullShardsEnd;
const hostedCleanupJobEnd = realModelWorkflowSource.indexOf(
  '\n  hosted_recovery:',
  hostedCleanupJobStart
);
const hostedRecoveryJobStart = hostedCleanupJobEnd;
const hostedRecoveryJobEnd = realModelWorkflowSource.indexOf(
  '\n  export_review:',
  hostedRecoveryJobStart
);
const exportReviewJobStart =
  realModelWorkflowSource.indexOf('\n  export_review:');
const exportReviewJobEnd = realModelWorkflowSource.indexOf(
  '\n  finalize:',
  exportReviewJobStart
);
const finalizeJobStart = realModelWorkflowSource.indexOf('\n  finalize:');
const smokeJobWorkflow = realModelWorkflowSource.slice(
  smokeJobStart,
  smokeJobEnd
);
const hostedPrepareJobWorkflow = realModelWorkflowSource.slice(
  hostedPrepareJobStart,
  hostedPrepareJobEnd
);
const hostedCleanupJobWorkflow = realModelWorkflowSource.slice(
  hostedCleanupJobStart,
  hostedCleanupJobEnd
);
const hostedRecoveryJobWorkflow = realModelWorkflowSource.slice(
  hostedRecoveryJobStart,
  hostedRecoveryJobEnd
);
const exportReviewJobWorkflow = realModelWorkflowSource.slice(
  exportReviewJobStart,
  exportReviewJobEnd
);
const finalizeJobWorkflow = realModelWorkflowSource.slice(finalizeJobStart);
const nativeProviderStateVaultKeyEnvironmentName =
  'PRODIVIX_G4_MODEL_EVAL_NATIVE_PROVIDER_STATE_VAULT_KEY_BASE64';
const nativeProviderStateVaultSecretReference = `secrets.${nativeProviderStateVaultKeyEnvironmentName}`;
const planLedgerStep = workflowStepSource(
  planJobWorkflow,
  'Start Backend-owned evaluation ledger bootstrap'
);
const fullMaskStep = workflowStepSource(
  fullShardsWorkflow,
  'Register transport and service-secret masks'
);
const fullVerificationStep = workflowStepSource(
  fullShardsWorkflow,
  'Start independent Backend Verification owner'
);
const fullLedgerStep = workflowStepSource(
  fullShardsWorkflow,
  'Start Backend-owned evaluation ledger bootstrap'
);
const fullStateVaultReadyStep = workflowStepSource(
  fullShardsWorkflow,
  'Verify instance-bound shard state-vault readiness'
);
const planHostedRetrievalRuntimeResourceHealthStep = workflowStepSource(
  planJobWorkflow,
  'Verify hosted retrieval runtime owner preactivation readiness'
);
const fullHostedRetrievalRuntimeResourceHealthStep = workflowStepSource(
  fullShardsWorkflow,
  'Verify hosted retrieval runtime owner preactivation readiness'
);
const fullOwnerStep = workflowStepSource(
  fullShardsWorkflow,
  'Start controlled Workspace and G3 owner authority'
);
const fullActivationStep = workflowStepSource(
  fullShardsWorkflow,
  'Verify activated Backend-owned evaluation ledger'
);
const fullRunStep = workflowStepSource(
  fullShardsWorkflow,
  'Execute exact shard with global atomic budget'
);
const fullArtifactScanStep = workflowStepSource(
  fullShardsWorkflow,
  'Scan shard status for protected secret values'
);
const fullCleanupStep = workflowStepSource(
  fullShardsWorkflow,
  'Stop PID-bound shard authorities'
);
const workflowOutsideFullShardsForJournal = `${realModelWorkflowSource.slice(
  0,
  hostedPrepareJobStart
)}${realModelWorkflowSource.slice(hostedRecoveryJobEnd)}`;
const ownerAuthorityPurposeEnvironmentName =
  'PRODIVIX_G4_MODEL_EVAL_OWNER_AUTHORITY_PURPOSE';
const preplanOwnerHealthCommand =
  'pnpm exec tsx scripts/verify-g4-evaluation-owner-lifecycle.mjs owner-health preplan 60000';
const fullAttemptOwnerHealthCommand =
  'pnpm exec tsx scripts/verify-g4-evaluation-owner-lifecycle.mjs owner-health full-attempt 60000';
const providerKeyEnvironmentNames = [
  'PRODIVIX_G4_MODEL_EVAL_OPENAI_API_KEY',
  'PRODIVIX_G4_MODEL_EVAL_ANTHROPIC_API_KEY',
  'PRODIVIX_G4_MODEL_EVAL_GEMINI_API_KEY',
];
if (
  realModelWorkflowSource.split(ownerAuthorityPurposeEnvironmentName).length -
    1 !==
    6 ||
  preplanOwnerStep.split(`${ownerAuthorityPurposeEnvironmentName}: preplan`)
    .length -
    1 !==
    1 ||
  fullOwnerStep.split(`${ownerAuthorityPurposeEnvironmentName}: full-attempt`)
    .length -
    1 !==
    1 ||
  planLedgerStep.split(`${ownerAuthorityPurposeEnvironmentName}: preplan`)
    .length -
    1 !==
    1 ||
  fullLedgerStep.split(`${ownerAuthorityPurposeEnvironmentName}: full-attempt`)
    .length -
    1 !==
    1 ||
  planStateVaultClosureStep.split(`${ownerAuthorityPurposeEnvironmentName}: ''`)
    .length -
    1 !==
    1 ||
  fullCleanupStep.split(`${ownerAuthorityPurposeEnvironmentName}: ''`).length -
    1 !==
    1 ||
  realModelHumanReviewWorkflowSource.includes(
    ownerAuthorityPurposeEnvironmentName
  ) ||
  v9WorkflowSource.includes(ownerAuthorityPurposeEnvironmentName) ||
  !preplanOwnerStep.includes(preplanOwnerHealthCommand) ||
  preplanOwnerStep.includes('attemptGradingAuthorityDigest') ||
  preplanOwnerStep.includes('controlledWorkspaceAuthorityDigest') ||
  preplanOwnerStep.includes('providerCapabilityAuthorityDigest') ||
  preplanOwnerStep.includes('verificationEvidenceAuthorityDigest') ||
  !fullOwnerStep.includes(fullAttemptOwnerHealthCommand) ||
  fullOwnerStep.includes('capabilityProbeAuthorityDigest') ||
  fullOwnerStep.includes('capabilityProbeProviderResourceAuthorityDigest') ||
  fullOwnerStep.includes(
    'capabilityProbeProviderResourceCleanupAuthorityDigest'
  ) ||
  fullOwnerStep.includes('runtimeFactSourceRegistrationAuthorityDigest') ||
  providerKeyEnvironmentNames.some(
    (name) =>
      preplanOwnerStep.split(`${name}: \${{ secrets.${name} }}`).length - 1 !==
        1 ||
      fullOwnerStep.split(`${name}: \${{ secrets.${name} }}`).length - 1 !== 1
  ) ||
  fullOwnerStep.includes(capabilityProbeSpoolKeyEnvironmentName) ||
  fullOwnerStep.includes('PRODIVIX_G4_MODEL_EVAL_RESULT_SPOOL_KEY_BASE64') ||
  fullRunStep.includes(ownerAuthorityPurposeEnvironmentName) ||
  !planJobWorkflow.includes(
    'pnpm exec tsx scripts/verify-g4-evaluation-owner-lifecycle.mjs shutdown-receipt preplan'
  ) ||
  !fullShardsWorkflow.includes(
    'pnpm exec tsx scripts/verify-g4-evaluation-owner-lifecycle.mjs shutdown-receipt full-attempt'
  ) ||
  !evaluationOwnerLifecycleVerifierSource.includes(
    "purpose === 'preplan' ? PREPLAN_HEALTH_KEYS : FULL_ATTEMPT_HEALTH_KEYS"
  ) ||
  !evaluationOwnerLifecycleVerifierSource.includes(
    "purpose === 'preplan' ? PREPLAN_AUTHORITY_KEYS : FULL_ATTEMPT_AUTHORITY_KEYS"
  )
) {
  issues.push(
    'G4 8791 must bind one fixed preplan or full-attempt purpose, expose only that purpose family in health and shutdown receipts, inject Provider credentials into the matching sidecar, and keep the full-attempt sidecar outside the active-probe spool key scope.'
  );
}
if (
  !capabilityEffectProviderJournalSpoolSource.includes(
    `AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_KEY_ENVIRONMENT_NAME =\n  '${capabilityEffectProviderJournalSpoolKeyEnvironmentName}' as const`
  ) ||
  !capabilityEffectProviderJournalSpoolSource.includes(
    "AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_KEY_ID =\n  'key.g4-model-eval.capability-effect-provider-journal-spool.v1' as const"
  ) ||
  !capabilityEffectProviderJournalSpoolSource.includes(
    "AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_KEY_REF =\n  'secret.g4-model-eval.capability-effect-provider-journal-spool.aes256gcm.v1' as const"
  ) ||
  realModelWorkflowSource.split(
    capabilityEffectProviderJournalSpoolKeyEnvironmentName
  ).length -
    1 !==
    16 ||
  realModelWorkflowSource.split(
    `secrets.${capabilityEffectProviderJournalSpoolKeyEnvironmentName}`
  ).length -
    1 !==
    9 ||
  workflowOutsideFullShardsForJournal.includes(
    capabilityEffectProviderJournalSpoolKeyEnvironmentName
  ) ||
  realModelHumanReviewWorkflowSource.includes(
    capabilityEffectProviderJournalSpoolKeyEnvironmentName
  ) ||
  v9WorkflowSource.includes(
    capabilityEffectProviderJournalSpoolKeyEnvironmentName
  ) ||
  !fullMaskStep.includes(
    `MASK_CAPABILITY_EFFECT_PROVIDER_JOURNAL_SPOOL_KEY: \${{ secrets.${capabilityEffectProviderJournalSpoolKeyEnvironmentName} }}`
  ) ||
  !fullMaskStep.includes(
    "decodeCanonicalAes256Key('capability-effect Provider journal spool key', process.env.MASK_CAPABILITY_EFFECT_PROVIDER_JOURNAL_SPOOL_KEY)"
  ) ||
  !fullMaskStep.includes(
    '[resultSpoolKey, capabilityProbeResponseSpoolKey, nativeProviderStateVaultKey].some((key) => capabilityEffectProviderJournalSpoolKey.equals(key))'
  ) ||
  !fullMaskStep.includes(
    "capabilityEffectProviderJournalSpoolKey.toString('base64url')"
  ) ||
  !fullMaskStep.includes(
    "capabilityEffectProviderJournalSpoolKey.toString('hex')"
  ) ||
  !fullMaskStep.includes('capabilityEffectProviderJournalSpoolKey.fill(0)') ||
  fullOwnerStep.split(
    `${capabilityEffectProviderJournalSpoolKeyEnvironmentName}: \${{ secrets.${capabilityEffectProviderJournalSpoolKeyEnvironmentName} }}`
  ).length -
    1 !==
    1 ||
  fullRunStep.includes(
    capabilityEffectProviderJournalSpoolKeyEnvironmentName
  ) ||
  !fullArtifactScanStep.includes(
    `MASK_CAPABILITY_EFFECT_PROVIDER_JOURNAL_SPOOL_KEY: \${{ secrets.${capabilityEffectProviderJournalSpoolKeyEnvironmentName} }}`
  ) ||
  !fullArtifactScanStep.includes(
    "decodeCanonicalAes256Key('capability-effect Provider journal spool key', process.env.MASK_CAPABILITY_EFFECT_PROVIDER_JOURNAL_SPOOL_KEY)"
  ) ||
  !fullArtifactScanStep.includes(
    '[resultSpoolKey, capabilityProbeResponseSpoolKey, nativeProviderStateVaultKey].some((key) => capabilityEffectProviderJournalSpoolKey.equals(key))'
  ) ||
  !fullArtifactScanStep.includes(
    "capabilityEffectProviderJournalSpoolKey.toString('base64url')"
  ) ||
  !fullArtifactScanStep.includes(
    "capabilityEffectProviderJournalSpoolKey.toString('hex')"
  ) ||
  !fullArtifactScanStep.includes(
    'capabilityEffectProviderJournalSpoolKey.fill(0)'
  ) ||
  !realModelOperationsSource.includes(
    `\`${capabilityEffectProviderJournalSpoolKeyEnvironmentName}\``
  ) ||
  !realModelOperationsSource.includes(
    '只注入 full-attempt 8791 sidecar 与对应 mask/artifact scan step'
  ) ||
  !realModelOperationsSource.includes(
    'full mask 验证 journal spool key 与 result、active-probe、state-vault key 逐对物理分离'
  ) ||
  !realModelOperationsSource.includes('preplan、8790、8792、`run-shard`、human')
) {
  issues.push(
    'G4 capability-effect Provider journal spool key must use its canonical independent key profile, enter only the full-attempt 8791 sidecar plus its mask and artifact scan, and stay byte-distinct from result, active-probe, and state-vault keys.'
  );
}
if (
  realModelWorkflowSource.includes('createHash') ||
  /\.sort\(\(left, right\)\s*=>\s*left\s*</u.test(realModelWorkflowSource) ||
  realModelWorkflowSource.split(
    'pnpm exec tsx scripts/verify-g4-evaluation-owner-lifecycle.mjs activation bootstrap preplan 60000'
  ).length -
    1 !==
    1 ||
  realModelWorkflowSource.split(
    'pnpm exec tsx scripts/verify-g4-evaluation-owner-lifecycle.mjs activation active preplan 60000'
  ).length -
    1 !==
    1 ||
  realModelWorkflowSource.split(
    'pnpm exec tsx scripts/verify-g4-evaluation-owner-lifecycle.mjs activation bootstrap full-attempt 60000'
  ).length -
    1 !==
    1 ||
  realModelWorkflowSource.split(
    'pnpm exec tsx scripts/verify-g4-evaluation-owner-lifecycle.mjs activation active full-attempt 60000'
  ).length -
    1 !==
    1 ||
  realModelWorkflowSource.split(preplanOwnerHealthCommand).length - 1 !== 1 ||
  realModelWorkflowSource.split(fullAttemptOwnerHealthCommand).length - 1 !==
    1 ||
  realModelWorkflowSource.split(
    'pnpm exec tsx scripts/verify-g4-evaluation-owner-lifecycle.mjs encode-public-response-canaries'
  ).length -
    1 !==
    1 ||
  !evaluationOwnerLifecycleVerifierSource.includes(
    "from '../packages/shared/src/canonical/index.ts'"
  ) ||
  !evaluationOwnerLifecycleVerifierSource.includes('canonicalJsonText') ||
  !evaluationOwnerLifecycleVerifierSource.includes(
    'compareUnicodeCodePoints'
  ) ||
  !evaluationOwnerLifecycleVerifierSource.includes('parseStrictJsonDocument') ||
  !evaluationOwnerLifecycleVerifierSource.includes(
    'source !== canonicalJsonText(value)'
  ) ||
  !evaluationOwnerLifecycleVerifierSource.includes(
    'digestCanonicalValue(retirementBase)'
  )
) {
  issues.push(
    'G4 workflow must delegate cross-runtime owner activation, health, shutdown, and canary canonicalization to one strict repository-owned verifier using shared canonical primitives.'
  );
}
const g3AttestationPrivateKeyEnvironmentName =
  'PRODIVIX_G4_MODEL_EVAL_G3_ATTESTATION_PRIVATE_KEY_PKCS8_BASE64URL';
const g3AttestationPrivateKeySecretReference = `secrets.${g3AttestationPrivateKeyEnvironmentName}`;
const g3AttestationPublicEnvironmentNames = [
  'PRODIVIX_G4_MODEL_EVAL_G3_ATTESTATION_KEY_ID',
  'PRODIVIX_G4_MODEL_EVAL_G3_ATTESTATION_ISSUER',
  'PRODIVIX_G4_MODEL_EVAL_G3_ATTESTATION_AUDIENCE',
  'PRODIVIX_G4_MODEL_EVAL_G3_ATTESTATION_SUBJECT',
  'PRODIVIX_G4_MODEL_EVAL_G3_ATTESTATION_TRUST',
  'PRODIVIX_G4_MODEL_EVAL_G3_ATTESTATION_POLICY_GENERATION',
  'PRODIVIX_G4_MODEL_EVAL_G3_ATTESTATION_MAXIMUM_LIFETIME_MS',
];
const workflowOutsideFullShards = `${realModelWorkflowSource.slice(
  0,
  fullShardsStart
)}${realModelWorkflowSource.slice(fullShardsEnd)}`;
if (
  realModelWorkflowSource.split(g3AttestationPrivateKeyEnvironmentName).length -
    1 !==
    4 ||
  realModelWorkflowSource.split(g3AttestationPrivateKeySecretReference).length -
    1 !==
    3 ||
  workflowOutsideFullShards.includes(g3AttestationPrivateKeyEnvironmentName) ||
  realModelHumanReviewWorkflowSource.includes(
    g3AttestationPrivateKeyEnvironmentName
  ) ||
  v9WorkflowSource.includes(g3AttestationPrivateKeyEnvironmentName) ||
  !fullMaskStep.includes(
    `MASK_G3_ATTESTATION_KEY: \${{ ${g3AttestationPrivateKeySecretReference} }}`
  ) ||
  !fullMaskStep.includes("!/^[A-Za-z0-9_-]{64}$/u.test(encoded ?? '')") ||
  !fullMaskStep.includes('key.byteLength !== 48') ||
  !fullMaskStep.includes(
    "key.subarray(0, 16).toString('hex') !== '302e020100300506032b657004220420'"
  ) ||
  !fullMaskStep.includes(
    'g3AttestationKey.equals(modelEvaluationAttestationKey)'
  ) ||
  !fullMaskStep.includes('g3AttestationKey.fill(0)') ||
  fullOwnerStep.split(
    `${g3AttestationPrivateKeyEnvironmentName}: \${{ ${g3AttestationPrivateKeySecretReference} }}`
  ).length -
    1 !==
    1 ||
  g3AttestationPublicEnvironmentNames.some(
    (name) =>
      fullOwnerStep.split(`${name}: \${{ vars.${name} }}`).length - 1 !== 1 ||
      fullMaskStep.split(
        `${name.replace('PRODIVIX_G4_MODEL_EVAL_', '')}: \${{ vars.${name} }}`
      ).length -
        1 !==
        1 ||
      realModelWorkflowSource.split(name).length - 1 !== 3
  ) ||
  !fullMaskStep.includes(
    "createPrivateKey({ key: g3AttestationKey, format: 'der', type: 'pkcs8' })"
  ) ||
  !fullMaskStep.includes(
    "createPublicKey(privateKey).export({ format: 'der', type: 'spki' })"
  ) ||
  !fullMaskStep.includes(
    "publicKeyDer.subarray(0, 12).toString('hex') !== '302a300506032b6570032100'"
  ) ||
  !fullMaskStep.includes(
    'const attestationKeys = JSON.stringify({ [keyId]: { publicKey, issuer, audience, subject, trust } })'
  ) ||
  !fullVerificationStep.includes(
    'BACKEND_VERIFICATION_ATTESTATION_KEYS: ${{ steps.g3_verification_authority.outputs.attestation_keys }}'
  ) ||
  !fullVerificationStep.includes(
    'BACKEND_VERIFICATION_ATTESTATION_POLICY_GENERATION: ${{ steps.g3_verification_authority.outputs.policy_generation }}'
  ) ||
  !fullVerificationStep.includes(
    'BACKEND_VERIFICATION_ATTESTATION_MAX_LIFETIME: ${{ steps.g3_verification_authority.outputs.maximum_lifetime }}'
  ) ||
  fullVerificationStep.includes(g3AttestationPrivateKeyEnvironmentName) ||
  fullOwnerStep.includes('PRODIVIX_G4_MODEL_EVAL_ATTESTATION_PRIVATE_KEY:') ||
  fullRunStep.includes(g3AttestationPrivateKeyEnvironmentName) ||
  !fullArtifactScanStep.includes(
    `MASK_G3_ATTESTATION_KEY: \${{ ${g3AttestationPrivateKeySecretReference} }}`
  ) ||
  !fullArtifactScanStep.includes(
    'g3AttestationKey.equals(modelEvaluationAttestationKey)'
  ) ||
  !fullArtifactScanStep.includes('g3AttestationKey.fill(0)') ||
  !realModelOperationsSource.includes(
    `\`${g3AttestationPrivateKeyEnvironmentName}\``
  ) ||
  !realModelOperationsSource.includes(
    'G3 Verification Evidence signer 与 model-evaluation archive signer 使用两个物理独立的 Ed25519 private key'
  ) ||
  g3AttestationPublicEnvironmentNames.some(
    (name) => !realModelOperationsSource.includes(`\`${name}\``)
  )
) {
  issues.push(
    'G4 G3 Verification Evidence signing must use an independent exact Ed25519 PKCS8 key in full-attempt 8791, derive the exact public descriptor for the private-key-free Backend Verification owner, and retain derived-value masks and artifact scanning.'
  );
}
const planStateVaultReadyStep = workflowStepSource(
  planJobWorkflow,
  'Verify instance-bound plan state-vault readiness'
);
const planActivationStep = workflowStepSource(
  planJobWorkflow,
  'Verify activated Backend-owned evaluation ledger'
);
const verificationOwnerTokenEnvironmentName =
  'PRODIVIX_G4_MODEL_EVAL_VERIFICATION_OWNER_TOKEN';
const verificationResumeKeyEnvironmentName =
  'PRODIVIX_G4_MODEL_EVAL_VERIFICATION_RESUME_KEY_BASE64';
for (const [purpose, bootstrapStep, activationStep] of [
  ['preplan', planLedgerStep, planActivationStep],
  ['full-attempt', fullLedgerStep, fullActivationStep],
]) {
  if (
    !bootstrapStep.includes(
      `verify-g4-evaluation-owner-lifecycle.mjs activation bootstrap ${purpose} 60000`
    ) ||
    !activationStep.includes(
      `verify-g4-evaluation-owner-lifecycle.mjs activation active ${purpose} 60000`
    ) ||
    !activationStep.includes('EXPECTED_OWNER_HEALTH_DIGEST: ${{ steps.') ||
    !evaluationOwnerLifecycleVerifierSource.includes(
      '/owner-activation/health`'
    ) ||
    !evaluationOwnerLifecycleVerifierSource.includes(
      "value.status !== (active ? 'ready' : 'waiting-for-owner-authority')"
    ) ||
    !evaluationOwnerLifecycleVerifierSource.includes(
      'value.ownerAuthorityHealthDigest !=='
    ) ||
    !evaluationOwnerLifecycleVerifierSource.includes(
      'if (response.status !== 204)'
    )
  ) {
    issues.push(
      `G4 ${purpose} ledger must expose exact authenticated bootstrap activation health before 8791 starts and exact active owner binding before dispatch.`
    );
  }
}
if (/curl[^\r\n]*Authorization:/u.test(realModelWorkflowSource)) {
  issues.push(
    'G4 loopback bearer credentials must reach curl through stdin config instead of process arguments.'
  );
}
if (
  planStateVaultReadyStep.length === 0 ||
  fullStateVaultReadyStep.length === 0 ||
  workflowOutsideFullShards.includes(verificationOwnerTokenEnvironmentName) ||
  workflowOutsideFullShards.includes(verificationResumeKeyEnvironmentName) ||
  realModelHumanReviewWorkflowSource.includes(
    verificationOwnerTokenEnvironmentName
  ) ||
  realModelHumanReviewWorkflowSource.includes(
    verificationResumeKeyEnvironmentName
  ) ||
  v9WorkflowSource.includes(verificationOwnerTokenEnvironmentName) ||
  v9WorkflowSource.includes(verificationResumeKeyEnvironmentName) ||
  !fullShardsWorkflow.includes(
    'PRODIVIX_G4_MODEL_EVAL_VERIFICATION_OWNER_BASE_URL: http://127.0.0.1:8792'
  ) ||
  !fullVerificationStep.includes('APP_ENV: test') ||
  !fullVerificationStep.includes('BACKEND_ADDR: 127.0.0.1:8792') ||
  !fullVerificationStep.includes(
    'BACKEND_DB_URL: ${{ secrets.PRODIVIX_G4_MODEL_EVAL_DATABASE_URL }}'
  ) ||
  !fullVerificationStep.includes(
    `BACKEND_VERIFICATION_RESUME_KEY: \${{ secrets.${verificationResumeKeyEnvironmentName} }}`
  ) ||
  !fullVerificationStep.includes(
    `BACKEND_VERIFICATION_AGENT_EVALUATION_OWNER_TOKEN: \${{ secrets.${verificationOwnerTokenEnvironmentName} }}`
  ) ||
  !fullVerificationStep.includes(
    '/api/internal/verification/agent-evaluation-owner/v1/health'
  ) ||
  !fullVerificationStep.includes(
    'X-Prodivix-Verification-Authority-Purpose: agent-evaluation-verification-owner'
  ) ||
  !fullVerificationStep.includes(
    'sha256-dd90cc626e7b1ea7d0ccc65a93ca01759654242a75579297db7cacda7a8a79e7'
  ) ||
  !fullOwnerStep.includes(
    `PRODIVIX_G4_MODEL_EVAL_VERIFICATION_OWNER_TOKEN: \${{ secrets.${verificationOwnerTokenEnvironmentName} }}`
  ) ||
  fullOwnerStep.includes(verificationResumeKeyEnvironmentName) ||
  fullLedgerStep.includes(verificationOwnerTokenEnvironmentName) ||
  fullLedgerStep.includes(verificationResumeKeyEnvironmentName) ||
  fullRunStep.includes(verificationOwnerTokenEnvironmentName) ||
  fullRunStep.includes(verificationResumeKeyEnvironmentName) ||
  !fullMaskStep.includes(
    `MASK_VERIFICATION_OWNER_TOKEN: \${{ secrets.${verificationOwnerTokenEnvironmentName} }}`
  ) ||
  !fullMaskStep.includes(
    `MASK_VERIFICATION_RESUME_KEY: \${{ secrets.${verificationResumeKeyEnvironmentName} }}`
  ) ||
  !fullMaskStep.includes('verificationResumeKey.equals(resultSpoolKey)') ||
  !fullMaskStep.includes(
    'verificationResumeKey.equals(nativeProviderStateVaultKey)'
  ) ||
  !fullArtifactScanStep.includes(
    `MASK_VERIFICATION_OWNER_TOKEN: \${{ secrets.${verificationOwnerTokenEnvironmentName} }}`
  ) ||
  !fullArtifactScanStep.includes(
    `MASK_VERIFICATION_RESUME_KEY: \${{ secrets.${verificationResumeKeyEnvironmentName} }}`
  ) ||
  !realModelOperationsSource.includes(
    `\`${verificationOwnerTokenEnvironmentName}\``
  ) ||
  !realModelOperationsSource.includes(
    `\`${verificationResumeKeyEnvironmentName}\``
  ) ||
  !realModelOperationsSource.includes(
    '`8791 clean → journal per-attempt/owner zero → vault per-instance zero → 8792 → 8790`'
  )
) {
  issues.push(
    'G4 full shards must keep the private signer in 8791, run a private-key-free purpose-bound Backend Verification owner on 8792, and retire 8791, the journal, the vault, 8792, then 8790 in dependency order.'
  );
}
const workflowOutsideStateVaultJobs = `${realModelWorkflowSource.slice(
  0,
  planJobStart
)}${realModelWorkflowSource.slice(
  planJobEnd,
  hostedPrepareJobStart
)}${realModelWorkflowSource.slice(hostedRecoveryJobEnd)}`;
if (
  planLedgerStep.length === 0 ||
  fullMaskStep.length === 0 ||
  fullVerificationStep.length === 0 ||
  fullLedgerStep.length === 0 ||
  fullStateVaultReadyStep.length === 0 ||
  fullOwnerStep.length === 0 ||
  fullActivationStep.length === 0 ||
  fullRunStep.length === 0 ||
  fullArtifactScanStep.length === 0 ||
  planStateVaultClosureStep.length === 0 ||
  fullCleanupStep.length === 0 ||
  realModelWorkflowSource.split(nativeProviderStateVaultKeyEnvironmentName)
    .length -
    1 !==
    24 ||
  realModelWorkflowSource.split(nativeProviderStateVaultSecretReference)
    .length -
    1 !==
    14 ||
  workflowOutsideStateVaultJobs.includes(
    nativeProviderStateVaultKeyEnvironmentName
  ) ||
  realModelHumanReviewWorkflowSource.includes(
    nativeProviderStateVaultKeyEnvironmentName
  ) ||
  v9WorkflowSource.includes(nativeProviderStateVaultKeyEnvironmentName) ||
  preplanOwnerStep.includes(nativeProviderStateVaultKeyEnvironmentName) ||
  !probeSpoolMaskStep.includes(
    `MASK_NATIVE_PROVIDER_STATE_VAULT_KEY: \${{ ${nativeProviderStateVaultSecretReference} }}`
  ) ||
  !probeSpoolMaskStep.includes(
    "decodeCanonicalAes256Key('native Provider state-vault key', process.env.MASK_NATIVE_PROVIDER_STATE_VAULT_KEY)"
  ) ||
  !probeSpoolMaskStep.includes(
    'nativeProviderStateVaultKey.equals(probeSpoolKey)'
  ) ||
  planLedgerStep.split(
    `${nativeProviderStateVaultKeyEnvironmentName}: \${{ ${nativeProviderStateVaultSecretReference} }}`
  ).length -
    1 !==
    1 ||
  planStateVaultClosureStep.split(
    `${nativeProviderStateVaultKeyEnvironmentName}: \${{ ${nativeProviderStateVaultSecretReference} }}`
  ).length -
    1 !==
    1 ||
  !planArtifactScanStep.includes(
    `SCAN_NATIVE_PROVIDER_STATE_VAULT_KEY: \${{ steps.plan_authority.outputs.reused != 'true' && ${nativeProviderStateVaultSecretReference} || '' }}`
  ) ||
  !planArtifactScanStep.includes('stateVaultKey.equals(probeSpoolKey)') ||
  !planArtifactScanStep.includes('stateVaultKey.fill(0)') ||
  !fullMaskStep.includes(
    `MASK_NATIVE_PROVIDER_STATE_VAULT_KEY: \${{ ${nativeProviderStateVaultSecretReference} }}`
  ) ||
  !fullMaskStep.includes(
    "decodeCanonicalAes256Key('native Provider state-vault key', process.env.MASK_NATIVE_PROVIDER_STATE_VAULT_KEY)"
  ) ||
  !fullMaskStep.includes('key.byteLength !== 32') ||
  !fullMaskStep.includes(
    'nativeProviderStateVaultKey.equals(resultSpoolKey)'
  ) ||
  !fullMaskStep.includes('nativeProviderStateVaultKey.fill(0)') ||
  fullOwnerStep.includes(nativeProviderStateVaultKeyEnvironmentName) ||
  fullLedgerStep.split(
    `${nativeProviderStateVaultKeyEnvironmentName}: \${{ ${nativeProviderStateVaultSecretReference} }}`
  ).length -
    1 !==
    1 ||
  fullCleanupStep.split(
    `${nativeProviderStateVaultKeyEnvironmentName}: \${{ ${nativeProviderStateVaultSecretReference} }}`
  ).length -
    1 !==
    1 ||
  fullRunStep.includes(nativeProviderStateVaultKeyEnvironmentName) ||
  !fullArtifactScanStep.includes(
    `MASK_NATIVE_PROVIDER_STATE_VAULT_KEY: \${{ ${nativeProviderStateVaultSecretReference} }}`
  ) ||
  !fullArtifactScanStep.includes(
    "decodeCanonicalAes256Key('native Provider state-vault key', process.env.MASK_NATIVE_PROVIDER_STATE_VAULT_KEY)"
  ) ||
  !fullArtifactScanStep.includes('key.byteLength !== 32') ||
  !fullArtifactScanStep.includes('nativeProviderStateVaultKey.fill(0)') ||
  !realModelOperationsSource.includes(
    '`PRODIVIX_G4_MODEL_EVAL_NATIVE_PROVIDER_STATE_VAULT_KEY_BASE64`'
  ) ||
  !realModelOperationsSource.includes(
    '只注入 plan/full shard 的 8790 durable vault owner 与 recovery-only 8790 closure'
  ) ||
  !realModelOperationsSource.includes('127.0.0.1:8790` durable vault owner') ||
  !realModelOperationsSource.includes(
    'shared-effect owner 与 `run-shard` 通过 purpose-bound ledger client'
  )
) {
  issues.push(
    'G4 native Provider state-vault key must be exact-32-byte validated, derivation-masked, artifact-scanned, and injected only into the plan/full-shard 8790 durable vault owners; 8791, runner CLI, run-shard, replay, smoke, review, and finalization must remain keyless.'
  );
}
const nativeProviderStateVaultOwnerInstanceEnvironmentName =
  'PRODIVIX_G4_MODEL_EVAL_NATIVE_PROVIDER_STATE_VAULT_OWNER_INSTANCE_ID';
const fullStateVaultOwnerInstanceBinding =
  'PRODIVIX_G4_MODEL_EVAL_NATIVE_PROVIDER_STATE_VAULT_OWNER_INSTANCE_ID: ${{ github.run_id }}.${{ github.run_attempt }}.${{ matrix.shard }}';
const planStateVaultOwnerInstanceBinding =
  'PRODIVIX_G4_MODEL_EVAL_NATIVE_PROVIDER_STATE_VAULT_OWNER_INSTANCE_ID: ${{ github.run_id }}.${{ github.run_attempt }}.plan';
const stateVaultReadyCommand =
  'pnpm exec tsx scripts/verify-g4-native-provider-state-vault-health.mjs ready 15000';
const stateVaultZeroCommand =
  'pnpm exec tsx scripts/verify-g4-native-provider-state-vault-health.mjs zero 130000';
if (
  realModelWorkflowSource.split(
    nativeProviderStateVaultOwnerInstanceEnvironmentName
  ).length -
    1 !==
    8 ||
  workflowOutsideStateVaultJobs.includes(
    nativeProviderStateVaultOwnerInstanceEnvironmentName
  ) ||
  realModelHumanReviewWorkflowSource.includes(
    nativeProviderStateVaultOwnerInstanceEnvironmentName
  ) ||
  v9WorkflowSource.includes(
    nativeProviderStateVaultOwnerInstanceEnvironmentName
  ) ||
  planJobWorkflow.split(planStateVaultOwnerInstanceBinding).length - 1 !== 4 ||
  fullShardsWorkflow.split(fullStateVaultOwnerInstanceBinding).length - 1 !==
    4 ||
  !preplanOwnerStep.includes(planStateVaultOwnerInstanceBinding) ||
  !fullOwnerStep.includes(fullStateVaultOwnerInstanceBinding) ||
  fullRunStep.includes(nativeProviderStateVaultOwnerInstanceEnvironmentName) ||
  realModelWorkflowSource.split(stateVaultReadyCommand).length - 1 !== 2 ||
  realModelWorkflowSource.split(stateVaultZeroCommand).length - 1 !== 2 ||
  planJobWorkflow.split(stateVaultReadyCommand).length - 1 !== 1 ||
  planJobWorkflow.split(stateVaultZeroCommand).length - 1 !== 1 ||
  fullShardsWorkflow.split(stateVaultReadyCommand).length - 1 !== 1 ||
  fullShardsWorkflow.split(stateVaultZeroCommand).length - 1 !== 1 ||
  !fullShardsWorkflow.includes('max-parallel: 3') ||
  !nativeProviderStateVaultHealthVerifierSource.includes(
    '/native-provider-state-vault/health'
  ) ||
  !nativeProviderStateVaultHealthVerifierSource.includes(
    'X-Prodivix-Native-Provider-State-Vault-Purpose'
  ) ||
  !nativeProviderStateVaultHealthVerifierSource.includes(
    "'native-provider-state-vault-owner'"
  ) ||
  !nativeProviderStateVaultHealthVerifierSource.includes(
    'isAgentNativeProviderStateVaultAuthority'
  ) ||
  !nativeProviderStateVaultHealthVerifierSource.includes(
    'sha256-70a8bce30a4b87debb41cb0be08966110f40cfe6ecec009f0483063097cf43a6'
  ) ||
  !nativeProviderStateVaultHealthVerifierSource.includes(
    'sha256-d00e2b445724baa7a611628b3861496c676dcdeff026f3405c221bbcea2debcf'
  ) ||
  !nativeProviderStateVaultHealthVerifierSource.includes(
    "'vaultOwnerInstanceId'"
  ) ||
  !/value\.sealedRecordCount !==\s*value\.activeEncryptedRecordCount \+\s*value\.retiredRecordCount \+\s*value\.forcedExpiryTombstoneCount/gu.test(
    nativeProviderStateVaultHealthVerifierSource
  ) ||
  !nativeProviderStateVaultHealthVerifierSource.includes(
    'value.forcedExpiryTombstoneCount !== 0'
  ) ||
  !nativeProviderStateVaultHealthVerifierSource.includes(
    'value.overdueActiveRecordCount !== 0'
  ) ||
  !nativeProviderStateVaultHealthVerifierSource.includes(
    'requireZeroResidual && value.activeEncryptedRecordCount !== 0'
  ) ||
  !nativeProviderStateVaultHealthVerifierSource.includes(
    'const MAXIMUM_POLL_TIMEOUT_MS = 130_000'
  ) ||
  !nativeProviderStateVaultHealthVerifierSource.includes(
    'const MAXIMUM_HEALTH_AGE_MS = 30_000'
  ) ||
  !nativeProviderStateVaultHealthVerifierSource.includes(
    'const MAXIMUM_HEALTH_FUTURE_SKEW_MS = 5_000'
  ) ||
  !nativeProviderStateVaultHealthVerifierSource.includes(
    'checkedAtEpochMs < nowEpochMs - MAXIMUM_HEALTH_AGE_MS'
  ) ||
  !nativeProviderStateVaultHealthVerifierSource.includes(
    'checkedAtEpochMs > nowEpochMs + MAXIMUM_HEALTH_FUTURE_SKEW_MS'
  ) ||
  !nativeProviderStateVaultHealthVerifierSource.includes(
    "Buffer.byteLength(value, 'utf8') !== value.length"
  ) ||
  !nativeProviderStateVaultHealthVerifierSource.includes(
    'response.body.getReader()'
  ) ||
  !nativeProviderStateVaultHealthVerifierSource.includes(
    'byteLength > MAXIMUM_HEALTH_BYTES'
  ) ||
  !realModelOperationsSource.includes(
    '`PRODIVIX_G4_MODEL_EVAL_NATIVE_PROVIDER_STATE_VAULT_OWNER_INSTANCE_ID`'
  ) ||
  !realModelOperationsSource.includes(
    '`${github.run_id}.${github.run_attempt}.${matrix.shard}`'
  ) ||
  !realModelOperationsSource.includes(
    '`${github.run_id}.${github.run_attempt}.plan`'
  ) ||
  !realModelOperationsSource.includes(
    '/v1/evaluations/{namespace}/native-provider-state-vault/health'
  ) ||
  !realModelOperationsSource.includes(
    'state-vault owner instance id 与 ledger token'
  ) ||
  !realModelOperationsSource.includes(
    'state-vault master key 继续由 8790 独占'
  ) ||
  !realModelOperationsSource.includes('`activeEncryptedRecordCount=0`') ||
  !realModelOperationsSource.includes('`overdueActiveRecordCount=0`') ||
  !realModelOperationsSource.includes('`forcedExpiryTombstoneCount=0`')
) {
  issues.push(
    'G4 native Provider state-vault health must use one purpose-bound canonical verifier, stable plan/full storage instance identities, per-instance zero-residual closure, and three-way shard isolation.'
  );
}
if (
  !nativeProviderStateVaultRecoveryVerifierSource.includes(
    "'native-provider-state-vault-recovery-owner'"
  ) ||
  !nativeProviderStateVaultRecoveryVerifierSource.includes(
    '`${partitionPath}/recovery`'
  ) ||
  !nativeProviderStateVaultRecoveryVerifierSource.includes(
    '/recoveries/${encodeURIComponent(recoveryRequest.recoveryRequestDigest)}'
  ) ||
  !nativeProviderStateVaultRecoveryVerifierSource.includes('/zero-residual') ||
  !nativeProviderStateVaultRecoveryVerifierSource.includes(
    'const MAXIMUM_COMPONENT_BYTES = 16_384'
  ) ||
  !nativeProviderStateVaultRecoveryVerifierSource.includes(
    'const HEALTH_LIFETIME_MS = 125_000'
  ) ||
  !nativeProviderStateVaultRecoveryVerifierSource.includes(
    'const MAXIMUM_RECORDS = 5_880'
  ) ||
  !nativeProviderStateVaultRecoveryVerifierSource.includes(
    'isAgentModelEvaluationPlan'
  ) ||
  !nativeProviderStateVaultRecoveryVerifierSource.includes(
    'isAgentNativeProviderStateVaultAuthority'
  ) ||
  !nativeProviderStateVaultRecoveryVerifierSource.includes(
    'canonicalJsonText'
  ) ||
  !nativeProviderStateVaultRecoveryVerifierSource.includes(
    'parseStrictJsonDocument'
  ) ||
  !nativeProviderStateVaultRecoveryVerifierSource.includes(
    "'Idempotency-Key': recoveryRequest.recoveryRequestDigest"
  ) ||
  !nativeProviderStateVaultRecoveryVerifierSource.includes(
    'value.retiredRecordCount !=='
  ) ||
  !nativeProviderStateVaultRecoveryVerifierSource.includes(
    'value.residualActiveEncryptedRecordCount !== 0'
  ) ||
  !nativeProviderStateVaultRecoveryVerifierSource.includes(
    'recoveryReceiptDigest !== recoveryReceipt.receiptDigest'
  ) ||
  !nativeProviderStateVaultRecoveryVerifierSource.includes(
    'A committed recovery can lose its POST acknowledgment'
  ) ||
  nativeProviderStateVaultRecoveryVerifierSource.includes(
    '.update(JSON.stringify('
  ) ||
  nativeProviderStateVaultRecoveryVerifierSource.includes('.localeCompare(')
) {
  issues.push(
    'G4 native Provider state-vault crash recovery verifier must bind the exact frozen plan/owner/authority, canonical request and receipt digests, ACK-loss durable lookup, and fresh zero-residual closure.'
  );
}
const capabilityEffectProviderJournalOwnerInstanceEnvironmentName =
  'PRODIVIX_G4_MODEL_EVAL_CAPABILITY_EFFECT_PROVIDER_JOURNAL_OWNER_INSTANCE_ID';
const legacyCapabilityEffectProviderRuntimeTransportOwnerInstanceEnvironmentName =
  'PRODIVIX_G4_MODEL_EVAL_CAPABILITY_EFFECT_PROVIDER_RUNTIME_TRANSPORT_OWNER_INSTANCE_ID';
const productionCapabilityEffectProviderJournalClientSource = await readFile(
  join(
    evaluationRunnerRoot,
    'src',
    'productionCapabilityEffectProviderJournalClient.ts'
  ),
  'utf8'
);
const productionCapabilityEffectProviderRuntimeTransportSource = await readFile(
  join(
    evaluationRunnerRoot,
    'src',
    'productionCapabilityEffectProviderRuntimeTransport.ts'
  ),
  'utf8'
);
const fullCapabilityEffectProviderJournalOwnerBinding =
  'PRODIVIX_G4_MODEL_EVAL_CAPABILITY_EFFECT_PROVIDER_JOURNAL_OWNER_INSTANCE_ID: ${{ github.run_id }}.${{ github.run_attempt }}.${{ matrix.shard }}.provider-journal';
const planCapabilityEffectProviderJournalOwnerBinding =
  'PRODIVIX_G4_MODEL_EVAL_CAPABILITY_EFFECT_PROVIDER_JOURNAL_OWNER_INSTANCE_ID: ${{ github.run_id }}.${{ github.run_attempt }}.plan.provider-journal';
const capabilityEffectProviderJournalHealthCommand =
  'pnpm exec tsx scripts/verify-g4-capability-effect-provider-journal-lifecycle.mjs health 15000';
const capabilityEffectProviderJournalCleanupCommand =
  'pnpm exec tsx scripts/verify-g4-capability-effect-provider-journal-lifecycle.mjs cleanup-shard 120000';
const fullJournalRecoveryBody = fullShardsWorkflow.slice(
  fullShardsWorkflow.indexOf('recover_state_vault() {'),
  fullShardsWorkflow.indexOf("ledger_pid_for_health=''")
);
const fullJournalRecoveryHealthIndex = fullJournalRecoveryBody.indexOf(
  capabilityEffectProviderJournalHealthCommand
);
const fullJournalRecoveryCleanupIndex = fullJournalRecoveryBody.indexOf(
  capabilityEffectProviderJournalCleanupCommand
);
const fullJournalRecoveryVaultIndex = fullJournalRecoveryBody.indexOf(
  'pnpm exec tsx scripts/verify-g4-native-provider-state-vault-recovery.mjs recover 130000'
);
const fullJournalNormalCleanupIndex = fullShardsWorkflow.lastIndexOf(
  capabilityEffectProviderJournalCleanupCommand
);
const fullJournalNormalVaultZeroIndex = fullShardsWorkflow.lastIndexOf(
  stateVaultZeroCommand
);
if (
  realModelWorkflowSource.split(
    capabilityEffectProviderJournalOwnerInstanceEnvironmentName
  ).length -
    1 !==
    8 ||
  planJobWorkflow.split(planCapabilityEffectProviderJournalOwnerBinding)
    .length -
    1 !==
    4 ||
  fullShardsWorkflow.split(fullCapabilityEffectProviderJournalOwnerBinding)
    .length -
    1 !==
    4 ||
  !preplanOwnerStep.includes(planCapabilityEffectProviderJournalOwnerBinding) ||
  smokeJobWorkflow.includes(
    capabilityEffectProviderJournalOwnerInstanceEnvironmentName
  ) ||
  exportReviewJobWorkflow.includes(
    capabilityEffectProviderJournalOwnerInstanceEnvironmentName
  ) ||
  finalizeJobWorkflow.includes(
    capabilityEffectProviderJournalOwnerInstanceEnvironmentName
  ) ||
  fullRunStep.includes(
    capabilityEffectProviderJournalOwnerInstanceEnvironmentName
  ) ||
  realModelWorkflowSource.includes(
    legacyCapabilityEffectProviderRuntimeTransportOwnerInstanceEnvironmentName
  ) ||
  realModelOperationsSource.includes(
    legacyCapabilityEffectProviderRuntimeTransportOwnerInstanceEnvironmentName
  ) ||
  productionCapabilityEffectProviderJournalClientSource.includes(
    legacyCapabilityEffectProviderRuntimeTransportOwnerInstanceEnvironmentName
  ) ||
  productionCapabilityEffectProviderRuntimeTransportSource.includes(
    legacyCapabilityEffectProviderRuntimeTransportOwnerInstanceEnvironmentName
  ) ||
  !productionCapabilityEffectProviderJournalClientSource.includes(
    `'${capabilityEffectProviderJournalOwnerInstanceEnvironmentName}' as const`
  ) ||
  !productionCapabilityEffectProviderRuntimeTransportSource.includes(
    'PRODUCTION_AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_OWNER_INSTANCE_ENVIRONMENT_NAME'
  ) ||
  !productionCapabilityEffectProviderRuntimeTransportSource.includes(
    'createEnvironmentProductionAgentEvaluationCapabilityEffectProviderJournalHealthReader'
  ) ||
  planJobWorkflow.split(capabilityEffectProviderJournalHealthCommand).length -
    1 !==
    3 ||
  fullShardsWorkflow.split(capabilityEffectProviderJournalHealthCommand)
    .length -
    1 !==
    2 ||
  fullShardsWorkflow.split(capabilityEffectProviderJournalCleanupCommand)
    .length -
    1 !==
    2 ||
  fullJournalRecoveryHealthIndex < 0 ||
  fullJournalRecoveryCleanupIndex <= fullJournalRecoveryHealthIndex ||
  fullJournalRecoveryVaultIndex <= fullJournalRecoveryCleanupIndex ||
  fullJournalNormalCleanupIndex <= fullShardsShutdownReceiptIndex ||
  fullJournalNormalVaultZeroIndex <= fullJournalNormalCleanupIndex ||
  !fullOwnerStep.includes(fullCapabilityEffectProviderJournalOwnerBinding) ||
  !fullOwnerStep.includes(
    'PRODIVIX_G4_MODEL_EVAL_SERVICE_TOKEN: ${{ secrets.PRODIVIX_G4_MODEL_EVAL_SERVICE_TOKEN }}'
  ) ||
  !preplanOwnerStep.includes(
    'PRODIVIX_G4_MODEL_EVAL_SERVICE_TOKEN: ${{ secrets.PRODIVIX_G4_MODEL_EVAL_SERVICE_TOKEN }}'
  ) ||
  preplanOwnerStep.includes(
    capabilityEffectProviderJournalSpoolKeyEnvironmentName
  ) ||
  preplanOwnerStep.includes(nativeProviderStateVaultKeyEnvironmentName) ||
  fullOwnerStep.includes(nativeProviderStateVaultKeyEnvironmentName) ||
  !fullOwnerStep.includes(
    'PRODIVIX_G4_MODEL_EVAL_FROZEN_CONFIG_COMMITMENT_PATH: ${{ runner.temp }}/g4-model-eval-frozen-config-commitment.json'
  ) ||
  !capabilityEffectProviderJournalLifecycleVerifierSource.includes(
    'createEnvironmentProductionAgentEvaluationCapabilityEffectProviderJournalClient'
  ) ||
  !capabilityEffectProviderJournalLifecycleVerifierSource.includes(
    'createEnvironmentProductionAgentEvaluationCapabilityEffectProviderJournalHealthReader'
  ) ||
  !capabilityEffectProviderJournalLifecycleVerifierSource.includes(
    'createAgentEvaluationCapabilityEffectProviderJournalCleanupRequest'
  ) ||
  !capabilityEffectProviderJournalLifecycleVerifierSource.includes(
    'doesAgentEvaluationCapabilityEffectProviderJournalCleanupReceiptMatchRequest'
  ) ||
  !capabilityEffectProviderJournalLifecycleVerifierSource.includes(
    'isAgentEvaluationCapabilityEffectProviderJournalZeroResidualReceipt'
  ) ||
  !capabilityEffectProviderJournalLifecycleVerifierSource.includes(
    'planAgentModelEvaluationAttempts'
  ) ||
  !capabilityEffectProviderJournalLifecycleVerifierSource.includes(
    "reason: 'cleanup-requested'"
  ) ||
  !capabilityEffectProviderJournalLifecycleVerifierSource.includes(
    'health.residualEncryptedSpoolCount !== 0'
  ) ||
  !capabilityEffectProviderJournalLifecycleVerifierSource.includes(
    'health.expiredEncryptedSpoolCount !== 0'
  ) ||
  !capabilityEffectProviderJournalLifecycleVerifierSource.includes(
    'health.unfinishedOwnerCount !== 0'
  ) ||
  !capabilityEffectProviderJournalLifecycleVerifierSource.includes(
    'health.overdueUnfinishedOwnerCount !== 0'
  ) ||
  !realModelOperationsSource.includes(
    '`PRODIVIX_G4_MODEL_EVAL_CAPABILITY_EFFECT_PROVIDER_JOURNAL_OWNER_INSTANCE_ID`'
  ) ||
  !realModelOperationsSource.includes(
    '`${github.run_id}.${github.run_attempt}.plan.provider-journal`'
  ) ||
  !realModelOperationsSource.includes(
    '`${github.run_id}.${github.run_attempt}.${matrix.shard}.provider-journal`'
  ) ||
  !realModelOperationsSource.includes(
    '`X-Prodivix-Capability-Effect-Provider-Journal-Purpose: capability-effect-provider-journal-owner`'
  ) ||
  !realModelOperationsSource.includes(
    '/v1/evaluations/{namespace}/capability-effect-provider-runtime-journal/health'
  ) ||
  !realModelOperationsSource.includes(
    '`8791 clean → journal per-attempt/owner zero → vault per-instance zero → 8792 → 8790`'
  ) ||
  !capabilityEffectProviderJournalLifecycleVerifierSource.includes(
    'constants.O_NOFOLLOW'
  ) ||
  capabilityEffectProviderJournalLifecycleVerifierSource.includes(
    '.update(JSON.stringify('
  ) ||
  capabilityEffectProviderJournalLifecycleVerifierSource.includes(
    '.localeCompare('
  )
) {
  issues.push(
    'G4 capability-effect Provider journal lifecycle must bind one stable full/recovery owner, verify a fresh clean pre-owner health, reconcile canonical per-attempt cleanup and zero receipts after the 8791 shutdown receipt, prove owner zero, then close the state vault.'
  );
}
const hostedRetrievalRuntimeResourceHealthCommand =
  'pnpm exec tsx scripts/verify-g4-hosted-retrieval-runtime-resource-health.mjs ready 15000';
const hostedRetrievalRuntimeResourceHealthSteps = [
  planHostedRetrievalRuntimeResourceHealthStep,
  fullHostedRetrievalRuntimeResourceHealthStep,
];
if (
  hostedRetrievalRuntimeResourceHealthSteps.some((step) => step.length === 0) ||
  realModelWorkflowSource.split(hostedRetrievalRuntimeResourceHealthCommand)
    .length -
    1 !==
    2 ||
  planJobWorkflow.split(hostedRetrievalRuntimeResourceHealthCommand).length -
    1 !==
    1 ||
  fullShardsWorkflow.split(hostedRetrievalRuntimeResourceHealthCommand).length -
    1 !==
    1 ||
  hostedRetrievalRuntimeResourceHealthSteps.some(
    (step) =>
      step.split(
        'PRODIVIX_G4_MODEL_EVAL_SERVICE_TOKEN: ${{ secrets.PRODIVIX_G4_MODEL_EVAL_SERVICE_TOKEN }}'
      ).length -
        1 !==
        1 ||
      step.split('secrets.').length - 1 !== 1 ||
      step.includes('PRODIVIX_G4_MODEL_EVAL_OPENAI_API_KEY') ||
      step.includes('PRODIVIX_G4_MODEL_EVAL_ANTHROPIC_API_KEY') ||
      step.includes('PRODIVIX_G4_MODEL_EVAL_GEMINI_API_KEY') ||
      step.includes('PRODIVIX_G4_MODEL_EVAL_HOSTED_COMPATIBLE_API_KEY') ||
      step.includes(nativeProviderStateVaultKeyEnvironmentName) ||
      step.includes(capabilityEffectProviderJournalSpoolKeyEnvironmentName) ||
      step.includes('PRODIVIX_G4_MODEL_EVAL_PLAN_PATH') ||
      step.includes('PRODIVIX_G4_MODEL_EVAL_REPOSITORY_COMMIT')
  ) ||
  smokeJobWorkflow.includes(hostedRetrievalRuntimeResourceHealthCommand) ||
  exportReviewJobWorkflow.includes(
    hostedRetrievalRuntimeResourceHealthCommand
  ) ||
  finalizeJobWorkflow.includes(hostedRetrievalRuntimeResourceHealthCommand) ||
  fullRunStep.includes(hostedRetrievalRuntimeResourceHealthCommand) ||
  !hostedRetrievalRuntimeResourceHealthVerifierSource.includes(
    'createEnvironmentAgentEvaluationHostedRetrievalRuntimeResourceOwnerHealthClient'
  ) ||
  !hostedRetrievalRuntimeResourceHealthVerifierSource.includes(
    'createProductionAgentEvaluationHostedRetrievalRuntimeResourceOwnerHealthBinding'
  ) ||
  !hostedRetrievalRuntimeResourceHealthVerifierSource.includes(
    'matchAgentHostedRetrievalRuntimeResourceOwnerHealthReceipt'
  ) ||
  !hostedRetrievalRuntimeResourceHealthVerifierSource.includes(
    'client.readOwnerHealth()'
  ) ||
  hostedRetrievalRuntimeResourceHealthVerifierSource.includes(
    '.update(JSON.stringify('
  ) ||
  hostedRetrievalRuntimeResourceHealthVerifierSource.includes(
    '.localeCompare('
  ) ||
  !realModelOperationsSource.includes(
    '`X-Prodivix-Hosted-Retrieval-Runtime-Resource-Purpose: hosted-retrieval-runtime-resource.preactivation-health.read`'
  ) ||
  !realModelOperationsSource.includes(
    '/v1/evaluations/{namespace}/hosted-retrieval-runtime-resource-owner-health'
  ) ||
  !realModelOperationsSource.includes(
    '`unfinishedCleanupCount=0` 与 `overdueCount=0`'
  ) ||
  !realModelOperationsSource.includes('vault/journal/hosted-owner-health ready')
) {
  issues.push(
    'G4 plan and full-shard bootstrap must use the single production Hosted runtime owner-health client and canonical matcher before starting 8791, require fresh zero unfinished/overdue storage, and keep this DB-only readiness path Provider-key-free.'
  );
}
const hostedLifecycleRoleEnvironmentName =
  'PRODIVIX_G4_MODEL_EVAL_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_ROLE';
const hostedLifecycleOwnerEnvironmentName =
  'PRODIVIX_G4_MODEL_EVAL_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_OWNER_INSTANCE_ID';
const hostedLifecycleSpoolKeyEnvironmentName =
  'PRODIVIX_G4_MODEL_EVAL_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_KEY_BASE64';
const hostedLifecycleOwnerBinding =
  'PRODIVIX_G4_MODEL_EVAL_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_OWNER_INSTANCE_ID: g4.hosted-lifecycle.${{ github.run_id }}.${{ github.run_attempt }}';
const hostedLifecycleSidecar =
  'apps/agent-evaluation-runner/dist/productionHostedRetrievalRuntimeResourceLifecycleSidecarMain.js';
const hostedLifecycleVerifierCommand =
  'pnpm exec tsx scripts/verify-g4-hosted-retrieval-runtime-resource-lifecycle.mjs';
const hostedLifecycleReadyCommand = `${hostedLifecycleVerifierCommand} ready 60000`;
const hostedLifecycleJobs = [
  ['prepare', hostedPrepareJobWorkflow],
  ['cleanup', hostedCleanupJobWorkflow],
  ['recovery', hostedRecoveryJobWorkflow],
];
const hostedLifecycleComparisonKeyEnvironmentNames = [
  'PRODIVIX_G4_MODEL_EVAL_RESULT_SPOOL_KEY_BASE64',
  capabilityProbeSpoolKeyEnvironmentName,
  capabilityEffectProviderJournalSpoolKeyEnvironmentName,
  nativeProviderStateVaultKeyEnvironmentName,
];
const hostedLifecycleJobSecretScopes = hostedLifecycleJobs.map(
  ([role, job]) => {
    const maskStep = workflowStepSource(
      job,
      'Register lifecycle secret masks and verify physical key isolation'
    );
    const scanStep = workflowStepSource(
      job,
      `Scan Hosted ${role} artifacts for secrets and canaries`
    );
    const listenerStep = workflowStepSource(
      job,
      'Start independent Hosted lifecycle Provider listener'
    );
    return {
      job,
      listenerStep,
      maskStep,
      outsideMaskAndScan: job.replace(maskStep, '').replace(scanStep, ''),
      role,
      scanStep,
    };
  }
);
if (
  [
    hostedPrepareJobStart,
    hostedPrepareJobEnd,
    hostedCleanupJobStart,
    hostedCleanupJobEnd,
    hostedRecoveryJobStart,
    hostedRecoveryJobEnd,
  ].some((index) => index < 0) ||
  hostedPrepareJobEnd > fullShardsStart ||
  fullShardsEnd > hostedCleanupJobStart ||
  hostedCleanupJobEnd > hostedRecoveryJobStart ||
  hostedRecoveryJobEnd > exportReviewJobStart ||
  !fullShardsWorkflow.includes('      - hosted_prepare') ||
  !hostedCleanupJobWorkflow.includes('      - full_shards') ||
  !hostedCleanupJobWorkflow.includes('needs.hosted_prepare.result ==') ||
  !hostedCleanupJobWorkflow.includes('needs.full_shards.result') ||
  !hostedRecoveryJobWorkflow.includes('if: >-\n      always() &&') ||
  !hostedRecoveryJobWorkflow.includes('      - hosted_cleanup') ||
  !exportReviewJobWorkflow.includes('      - hosted_cleanup') ||
  !exportReviewJobWorkflow.includes('      - hosted_recovery') ||
  !exportReviewJobWorkflow.includes(
    "needs.hosted_recovery.result == 'success'"
  ) ||
  realModelWorkflowSource.split(hostedLifecycleOwnerBinding).length - 1 !== 3 ||
  realModelWorkflowSource.split(hostedLifecycleOwnerEnvironmentName).length -
    1 !==
    3 ||
  realModelWorkflowSource.split(
    `secrets.${hostedLifecycleSpoolKeyEnvironmentName}`
  ).length -
    1 !==
    12 ||
  fullShardsWorkflow.includes(hostedLifecycleSpoolKeyEnvironmentName) ||
  fullShardsWorkflow.includes(hostedLifecycleOwnerEnvironmentName) ||
  fullShardsWorkflow.includes(hostedLifecycleRoleEnvironmentName) ||
  planJobWorkflow.includes(hostedLifecycleSpoolKeyEnvironmentName) ||
  planJobWorkflow.includes(hostedLifecycleOwnerEnvironmentName) ||
  planJobWorkflow.includes(hostedLifecycleRoleEnvironmentName) ||
  smokeJobWorkflow.includes(hostedLifecycleSpoolKeyEnvironmentName) ||
  exportReviewJobWorkflow.includes(hostedLifecycleSpoolKeyEnvironmentName) ||
  finalizeJobWorkflow.includes(hostedLifecycleSpoolKeyEnvironmentName) ||
  hostedLifecycleJobs.some(
    ([role, job]) =>
      !job.includes(`${hostedLifecycleRoleEnvironmentName}: ${role}`) ||
      !job.includes(hostedLifecycleOwnerBinding) ||
      !job.includes(hostedLifecycleSidecar) ||
      !job.includes(hostedLifecycleReadyCommand) ||
      !job.includes(`${hostedLifecycleVerifierCommand} mask`) ||
      !job.includes(`${hostedLifecycleVerifierCommand} scan`) ||
      !job.includes(`${hostedLifecycleVerifierCommand} ${role}`) ||
      !job.includes(
        'Register lifecycle secret masks and verify physical key isolation'
      ) ||
      !job.includes('Stop PID-bound Hosted lifecycle authorities') ||
      !job.includes('if: always()')
  ) ||
  hostedLifecycleJobSecretScopes.some(
    ({ job, listenerStep, maskStep, outsideMaskAndScan, scanStep }) =>
      listenerStep.length === 0 ||
      !listenerStep.includes(hostedLifecycleReadyCommand) ||
      !listenerStep.includes('kill -0 "${lifecycle_pid}"') ||
      !listenerStep.includes(
        'PRODIVIX_G4_MODEL_EVAL_SERVICE_TOKEN: ${{ secrets.PRODIVIX_G4_MODEL_EVAL_SERVICE_TOKEN }}'
      ) ||
      maskStep.length === 0 ||
      scanStep.length === 0 ||
      hostedLifecycleComparisonKeyEnvironmentNames.some(
        (name) =>
          job.split(name).length - 1 !== 4 ||
          job.split(`secrets.${name}`).length - 1 !== 2 ||
          !maskStep.includes(`${name}: \${{ secrets.${name} }}`) ||
          !scanStep.includes(`${name}: \${{ secrets.${name} }}`) ||
          outsideMaskAndScan.includes(name)
      )
  ) ||
  !hostedPrepareJobWorkflow.includes('Upload singleton Hosted prepared set') ||
  !hostedCleanupJobWorkflow.includes(
    'Download exact singleton Hosted prepared set'
  ) ||
  !hostedCleanupJobWorkflow.includes('--prepared-set "${PREPARED_SET_PATH}"') ||
  hostedRecoveryJobWorkflow.includes('--prepared-set') ||
  !hostedRetrievalRuntimeResourceLifecycleVerifierSource.includes(
    'assertG4HostedRetrievalRuntimeResourceLifecycleSecretIsolation'
  ) ||
  !hostedRetrievalRuntimeResourceLifecycleVerifierSource.includes(
    'AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_KEY_ENVIRONMENT_NAME'
  ) ||
  !hostedRetrievalRuntimeResourceLifecycleVerifierSource.includes(
    'createAgentEvaluationHostedRetrievalRuntimeResourceLifecycleSpoolProfile'
  ) ||
  !hostedRetrievalRuntimeResourceLifecycleVerifierSource.includes(
    'profile.keyReference.keyId'
  ) ||
  !hostedRetrievalRuntimeResourceLifecycleVerifierSource.includes(
    'profile.keyRefDigest'
  ) ||
  !hostedRetrievalRuntimeResourceLifecycleVerifierSource.includes(
    'profile.encryptionProfileDigest'
  ) ||
  !hostedRetrievalRuntimeResourceLifecycleVerifierSource.includes(
    'loadProductionAgentEvaluationFullAttemptHostedRuntimeBinding'
  ) ||
  !hostedRetrievalRuntimeResourceLifecycleVerifierSource.includes(
    'parseStrictJsonDocument'
  ) ||
  !hostedRetrievalRuntimeResourceLifecycleVerifierSource.includes(
    'A lifecycle artifact contains protected material or a canary.'
  ) ||
  !hostedRetrievalRuntimeResourceLifecycleVerifierSource.includes(
    'productionHostedRetrievalRuntimeResourceLifecycleMain.js'
  ) ||
  !hostedRetrievalRuntimeResourceLifecycleVerifierSource.includes(
    'createEnvironmentAgentEvaluationHostedRetrievalRuntimeResourceLifecycleProviderClient'
  ) ||
  !hostedRetrievalRuntimeResourceLifecycleVerifierSource.includes(
    'client.readHealth()'
  ) ||
  !hostedRetrievalRuntimeResourceLifecycleVerifierSource.includes(
    "role === 'recovery'"
  ) ||
  !hostedRetrievalRuntimeResourceLifecycleVerifierSource.includes(
    'health.unfinishedMutationCount === 0'
  ) ||
  !hostedRetrievalRuntimeResourceLifecycleVerifierSource.includes(
    'health.overdueMutationCount === 0'
  )
) {
  issues.push(
    'G4 Hosted lifecycle must prepare once before the matrix, clean once after every shard, always recover partial or failed work to a purpose-bound zero terminus, reuse one run-level owner and isolated spool key only in those singleton jobs, and scan every operational artifact before export.'
  );
}
const recoveryOnlyDiscoverJobStart =
  hostedRuntimeResourceRecoveryWorkflowSource.indexOf('\n  discover:');
const recoveryOnlyJobStart =
  hostedRuntimeResourceRecoveryWorkflowSource.indexOf('\n  recover:');
const recoveryOnlyDiscoverJob =
  hostedRuntimeResourceRecoveryWorkflowSource.slice(
    recoveryOnlyDiscoverJobStart,
    recoveryOnlyJobStart
  );
const recoveryOnlyJob =
  hostedRuntimeResourceRecoveryWorkflowSource.slice(recoveryOnlyJobStart);
const recoveryOnlyMaskStep = workflowStepSource(
  recoveryOnlyJob,
  'Register recovery secret masks and verify physical key isolation'
);
const recoveryOnlyListenerStep = workflowStepSource(
  recoveryOnlyJob,
  'Start independent recovery-only Hosted lifecycle listener'
);
const recoveryOnlyCommandStep = workflowStepSource(
  recoveryOnlyJob,
  'Reconcile delete settle and prove zero terminus'
);
const recoveryOnlyScanStep = workflowStepSource(
  recoveryOnlyJob,
  'Scan recovery artifacts for secrets and canaries'
);
const recoveryOnlyOutsideComparisonScopes = recoveryOnlyJob
  .replace(recoveryOnlyMaskStep, '')
  .replace(recoveryOnlyScanStep, '');
const planUploadStep = workflowStepSource(
  planJobWorkflow,
  'Upload frozen plan'
);
if (
  recoveryOnlyDiscoverJobStart < 0 ||
  recoveryOnlyJobStart < 0 ||
  recoveryOnlyMaskStep.length === 0 ||
  recoveryOnlyListenerStep.length === 0 ||
  recoveryOnlyCommandStep.length === 0 ||
  recoveryOnlyScanStep.length === 0 ||
  hostedRuntimeResourceRecoveryWorkflowSource.split('workflow_dispatch:')
    .length -
    1 !==
    1 ||
  hostedRuntimeResourceRecoveryWorkflowSource.split('schedule:').length - 1 !==
    1 ||
  !hostedRuntimeResourceRecoveryWorkflowSource.includes(
    "- cron: '23 4 * * *'"
  ) ||
  /\bpull_request\s*:/u.test(hostedRuntimeResourceRecoveryWorkflowSource) ||
  /\bpush\s*:/u.test(hostedRuntimeResourceRecoveryWorkflowSource) ||
  !hostedRuntimeResourceRecoveryWorkflowSource.includes('actions: read') ||
  !hostedRuntimeResourceRecoveryWorkflowSource.includes('contents: read') ||
  /:\s*write\b/u.test(hostedRuntimeResourceRecoveryWorkflowSource) ||
  !hostedRuntimeResourceRecoveryWorkflowSource.includes(
    'runs-on: [self-hosted, linux, x64, g4-real-model-recovery]'
  ) ||
  !hostedRuntimeResourceRecoveryWorkflowSource.includes(
    'environment: g4-real-model-recovery'
  ) ||
  !hostedRuntimeResourceRecoveryWorkflowSource.includes(
    "date -u -d '9 days ago'"
  ) ||
  !recoveryOnlyDiscoverJob.includes('-f created=">=${cutoff}"') ||
  !recoveryOnlyDiscoverJob.includes('| .[:32]') ||
  !recoveryOnlyDiscoverJob.includes('sort_by(.created_at, .id)') ||
  !recoveryOnlyJob.includes('max-parallel: 1') ||
  !['failure', 'cancelled', 'timed_out'].every((conclusion) =>
    recoveryOnlyDiscoverJob.includes(`.conclusion == "${conclusion}"`)
  ) ||
  !hostedRuntimeResourceRecoveryWorkflowSource.includes('source_run_id:') ||
  !hostedRuntimeResourceRecoveryWorkflowSource.includes(
    'expected_prepare_artifact_digest:'
  ) ||
  !recoveryOnlyJob.includes(
    'has ${#plan_artifacts[@]} plan artifacts; exact one is required.'
  ) ||
  !recoveryOnlyJob.includes(
    'has ${#commitment_artifacts[@]} signed frozen config commitment artifacts; exact one is required.'
  ) ||
  !recoveryOnlyJob.includes(
    'has ${#prepare_artifacts[@]} exact prepared-set artifacts; at most one optional hint is admitted.'
  ) ||
  recoveryOnlyJob.split("!= 'false'").length - 1 !== 3 ||
  !recoveryOnlyJob.includes(
    'The prepared-set artifact digest differs from the manual authority.'
  ) ||
  !recoveryOnlyJob.includes(
    'The manual prepared-set artifact digest has no source artifact.'
  ) ||
  !recoveryOnlyJob.includes(
    "if: steps.source.outputs.prepare_artifact_present == 'true'"
  ) ||
  !recoveryOnlyJob.includes(
    "exactFiles(process.env.COMMITMENT_ROOT, ['frozen-config-commitment.json'])"
  ) ||
  !recoveryOnlyJob.includes(
    'The optional prepared-set artifact does not join the signed recovery authority'
  ) ||
  !recoveryOnlyJob.includes('github-token: ${{ github.token }}') ||
  !recoveryOnlyJob.includes('run-id: ${{ matrix.sourceRunId }}') ||
  !recoveryOnlyJob.includes(
    'PRODIVIX_G4_MODEL_EVAL_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_OWNER_INSTANCE_ID=g4.hosted-lifecycle.${SOURCE_RUN_ID}.${SOURCE_RUN_ATTEMPT}'
  ) ||
  !recoveryOnlyJob.includes(
    `${hostedLifecycleRoleEnvironmentName}: recovery`
  ) ||
  !recoveryOnlyListenerStep.includes(hostedLifecycleSidecar) ||
  !recoveryOnlyListenerStep.includes(hostedLifecycleReadyCommand) ||
  !recoveryOnlyListenerStep.includes('kill -0 "${lifecycle_pid}"') ||
  !recoveryOnlyListenerStep.includes(
    'PRODIVIX_G4_MODEL_EVAL_SERVICE_TOKEN: ${{ secrets.PRODIVIX_G4_MODEL_EVAL_SERVICE_TOKEN }}'
  ) ||
  !recoveryOnlyCommandStep.includes(
    `${hostedLifecycleVerifierCommand} recovery --output "\${RECOVERY_OUTPUT_PATH}"`
  ) ||
  hostedRuntimeResourceRecoveryWorkflowSource.includes(
    `${hostedLifecycleVerifierCommand} prepare --output`
  ) ||
  hostedRuntimeResourceRecoveryWorkflowSource.includes(
    `${hostedLifecycleVerifierCommand} cleanup --prepared-set`
  ) ||
  hostedRuntimeResourceRecoveryWorkflowSource.includes('run-shard \\') ||
  hostedRuntimeResourceRecoveryWorkflowSource.includes(
    'PRODIVIX_G4_MODEL_EVAL_ATTESTATION_PRIVATE_KEY'
  ) ||
  hostedRuntimeResourceRecoveryWorkflowSource.includes(
    'PRODIVIX_G4_MODEL_EVAL_ANTHROPIC_API_KEY'
  ) ||
  hostedLifecycleComparisonKeyEnvironmentNames.some(
    (name) =>
      !recoveryOnlyMaskStep.includes(`${name}: \${{ secrets.${name} }}`) ||
      !recoveryOnlyScanStep.includes(`${name}: \${{ secrets.${name} }}`) ||
      recoveryOnlyOutsideComparisonScopes.includes(name)
  ) ||
  !recoveryOnlyMaskStep.includes(
    `${hostedLifecycleSpoolKeyEnvironmentName}: \${{ secrets.${hostedLifecycleSpoolKeyEnvironmentName} }}`
  ) ||
  !recoveryOnlyScanStep.includes(
    `${hostedLifecycleSpoolKeyEnvironmentName}: \${{ secrets.${hostedLifecycleSpoolKeyEnvironmentName} }}`
  ) ||
  !recoveryOnlyJob.includes('if-no-files-found: error') ||
  !recoveryOnlyJob.includes('retention-days: 14') ||
  !planUploadStep.includes('retention-days: 14') ||
  !hostedPrepareJobWorkflow.includes('retention-days: 14') ||
  hostedRuntimeResourceRecoveryWorkflowSource.includes('<<:') ||
  realModelWorkflowSource.includes('<<:')
) {
  issues.push(
    'G4 Hosted recovery-only operations must scan at most 32 failed, cancelled, or timed-out source runs from the last nine days oldest-first, require exact immutable plan and signed commitment authorities, admit at most one matching optional prepared hint, reuse the source run owner, expose only recovery reconcile/delete/full-charge-settle/zero, and retain recovery inputs for 14 days.'
  );
}
const ledgerJobSpecs = [
  ['plan', planJobStart, planJobEnd, 'plan'],
  ['smoke', smokeJobStart, smokeJobEnd, 'smoke'],
  ['export_review', exportReviewJobStart, exportReviewJobEnd, 'export-review'],
  ['finalize', finalizeJobStart, realModelWorkflowSource.length, 'finalize'],
];
if (
  realModelWorkflowSource.includes('go run ./cmd/agent-evaluation-ledger') ||
  (
    realModelWorkflowSource.match(
      /- name: Build exact Backend evaluation ledger/gu
    ) ?? []
  ).length !== 8 ||
  (
    realModelWorkflowSource.match(
      /- name: Start Backend-owned evaluation ledger/gu
    ) ?? []
  ).length !== 8
) {
  issues.push(
    'Every G4 ledger process must execute an exact prebuilt binary; production go run startup is forbidden.'
  );
}
for (const [jobName, start, end, identity] of ledgerJobSpecs) {
  const jobWorkflow = realModelWorkflowSource.slice(start, end);
  const orderedTokens = [
    'Build exact Backend evaluation ledger',
    'Start Backend-owned evaluation ledger',
    'Stop PID-bound evaluation ledger',
  ];
  const tokenIndexes = orderedTokens.map((token) => jobWorkflow.indexOf(token));
  if (
    start < 0 ||
    end < 0 ||
    tokenIndexes.some((index) => index < 0) ||
    tokenIndexes.some(
      (index, position) => position > 0 && index <= tokenIndexes[position - 1]
    ) ||
    !jobWorkflow.includes(`-${identity}.pid`) ||
    !jobWorkflow.includes(
      'go build -trimpath -o "${LEDGER_BINARY}" ./cmd/agent-evaluation-ledger'
    ) ||
    !jobWorkflow.includes('"${LEDGER_BINARY}" > "${LEDGER_LOG}" 2>&1 &') ||
    !jobWorkflow.includes(
      'A pre-existing evaluation ledger health endpoint is reachable.'
    ) ||
    !jobWorkflow.includes(
      'Evaluation ledger loopback port 8790 is already occupied.'
    ) ||
    !jobWorkflow.includes('kill -0 "${ledger_pid}"') ||
    !jobWorkflow.includes('readlink -f -- "/proc/${ledger_pid}/exe"') ||
    !jobWorkflow.includes('kill -TERM "${ledger_pid}"') ||
    !jobWorkflow.includes('kill -KILL "${ledger_pid}"') ||
    !jobWorkflow.includes(
      'Evaluation ledger remained alive after bounded shutdown.'
    ) ||
    !/- name: Stop PID-bound evaluation ledger\r?\n\s+if: always\(\)/u.test(
      jobWorkflow
    )
  ) {
    issues.push(
      `G4 ${jobName} must build, start, health-check, and always stop its exact PID-bound ledger binary.`
    );
  }
}
const finalizeOrderedTokens = [
  'Admit and cross-bind source generated production config',
  'Cross-bind plan and human-review digest',
  'Cross-bind deterministic manifest to the trusted GitHub run',
  'Import role-separated human review',
  'Finalize immutable evaluation manifest',
  'Export project-signed sharded evidence archive',
  'Scan final artifact for protected secret values',
  'Verify strict project-signed real-model evidence',
  'Assemble and verify exact satisfied G4 Closure',
  'Upload signed evidence archive',
  'Stop PID-bound evaluation ledger',
];
const finalizeTokenIndexes = finalizeOrderedTokens.map((token) =>
  finalizeJobWorkflow.indexOf(token)
);
if (
  finalizeJobStart < 0 ||
  finalizeTokenIndexes.some((index) => index < 0) ||
  finalizeTokenIndexes.some(
    (index, position) =>
      position > 0 && index <= finalizeTokenIndexes[position - 1]
  ) ||
  !finalizeJobWorkflow.includes(
    'PRODIVIX_G4_MODEL_EVAL_REPOSITORY_ROOT: ${{ github.workspace }}'
  ) ||
  !finalizeJobWorkflow.includes(
    'PLAN_ARTIFACT_RUN_ATTEMPT: ${{ needs.preflight.outputs.source_plan_run_attempt }}'
  ) ||
  !finalizeJobWorkflow.includes(
    'PLAN_ARTIFACT_NAME: ${{ needs.preflight.outputs.source_plan_artifact_name }}'
  ) ||
  !finalizeJobWorkflow.includes(
    'PLAN_ARTIFACT_DIGEST: ${{ needs.preflight.outputs.source_plan_artifact_digest }}'
  ) ||
  !finalizeJobWorkflow.includes(
    'EXPECTED_PLAN_DIGEST: ${{ needs.preflight.outputs.source_plan_digest }}'
  ) ||
  !finalizeJobWorkflow.includes(
    'config.plan.planDigest !== process.env.EXPECTED_PLAN_DIGEST'
  ) ||
  !finalizeJobWorkflow.includes(
    '/attempts/${PLAN_ARTIFACT_RUN_ATTEMPT}/jobs?per_page=100'
  ) ||
  !finalizeJobWorkflow.includes(
    '(( PLAN_ARTIFACT_RUN_ATTEMPT <= EVALUATION_RUN_ATTEMPT ))'
  ) ||
  !finalizeJobWorkflow.includes(
    'gh api --paginate --slurp "repos/${GITHUB_REPOSITORY}/actions/runs/${run_id}/artifacts?per_page=100"'
  ) ||
  !/- name: Stop PID-bound evaluation ledger\r?\n\s+if: always\(\)/u.test(
    finalizeJobWorkflow
  )
) {
  issues.push(
    'G4 finalize must cross-bind review and deterministic authority, import review, finalize, export, scan, externally verify, assemble Closure, publish, and always stop its exact repository-bound ledger in order.'
  );
}
for (const token of [
  'workflow_dispatch:',
  'source_plan_artifact_name:',
  'source_plan_artifact_digest:',
  'source_plan_run_attempt:',
  'runs-on: [self-hosted, linux, x64, g4-real-model-human-review]',
  'environment: g4-real-model-human-review',
  'echo "PRODIVIX_G4_MODEL_EVAL_RUN_CONFIG_PATH=${GENERATED_CONFIG}" >> "${GITHUB_ENV}"',
  'PRODIVIX_G4_MODEL_EVAL_RUN_CONFIG_ARTIFACT_NAME: ${{ needs.preflight.outputs.source_plan_artifact_name }}',
  'PRODIVIX_G4_MODEL_EVAL_RUN_CONFIG_ARTIFACT_DIGEST: ${{ needs.preflight.outputs.source_plan_artifact_digest }}',
  'PRODIVIX_G4_MODEL_EVAL_RUN_CONFIG_ARTIFACT_RUN_ID: ${{ needs.preflight.outputs.source_evaluation_run_id }}',
  'PRODIVIX_G4_MODEL_EVAL_RUN_CONFIG_ARTIFACT_RUN_ATTEMPT: ${{ needs.preflight.outputs.source_plan_run_attempt }}',
  'PRODIVIX_G4_MODEL_EVAL_HUMAN_REVIEW_INBOX_SOURCE_ROOT: /srv/prodivix/g4-human-review-inbox',
  'PRODIVIX_G4_MODEL_EVAL_HUMAN_REVIEW_PRIVATE_KEY:',
  'Download exact generated production config authority',
  '.name == $plan_name',
  '.digest == $plan_digest',
  'config.plan.plannedJourneyCount !== 14_040',
  'probeProviderResourceAuthorityCount !== 4',
  "'anthropic-messages'",
  'qualificationProbeCount !== 18',
  'runtimeFactSourceCount !== 15',
  'providerResourceCleanupReceiptCount !== 4',
  'preplanAuthorityOperationCount !== 41',
  '(( REQUEST_SOURCE_PLAN_RUN_ATTEMPT <= REQUEST_SOURCE_RUN_ATTEMPT ))',
  '/attempts/${REQUEST_SOURCE_PLAN_RUN_ATTEMPT}/jobs?per_page=100',
  'source_artifact_pages="$(gh api --paginate --slurp',
  '[.[]?.artifacts[]? |',
  'registry.planDigest !== config.plan.planDigest',
  'registry.planPlannedAt !== config.plan.plannedAt',
  'registry.trustRegistryDigest !== config.execution.humanReview.trustRegistry.registryDigest',
  'registry.adjudicationPolicyDigest !== config.execution.humanReview.adjudicationPolicy.policyDigest',
  'pnpm install --offline --frozen-lockfile',
  'validate-review \\',
  '--source-artifact-digest "${SOURCE_ARTIFACT_DIGEST}"',
  'human-review.json',
]) {
  if (!realModelHumanReviewWorkflowSource.includes(token)) {
    issues.push(`G4 protected human-review workflow is missing ${token}.`);
  }
}
if (
  /(?:OPENAI|ANTHROPIC|GEMINI|GOOGLE)_API_KEY/u.test(
    realModelHumanReviewWorkflowSource
  ) ||
  realModelHumanReviewWorkflowSource.includes(
    'PRODIVIX_G4_MODEL_EVAL_DATABASE_URL'
  ) ||
  realModelHumanReviewWorkflowSource.includes('plan.json') ||
  realModelHumanReviewWorkflowSource.includes('inputs.run_config') ||
  realModelHumanReviewWorkflowSource.includes(
    'needs.preflight.outputs.run_config'
  ) ||
  realModelHumanReviewWorkflowSource.includes(
    'qualificationAuthorityBundle.capabilityProbeAuthorities.length'
  ) ||
  realModelHumanReviewWorkflowSource.includes(
    'qualificationAuthorityBundle.runtimeFactSourceAuthorities.length'
  ) ||
  !realModelHumanReviewWorkflowSource.includes(
    'test "${REQUEST_SOURCE_PLAN_ARTIFACT_NAME}" != "${REQUEST_SOURCE_ARTIFACT_NAME}"'
  ) ||
  !realModelHumanReviewWorkflowSource.includes('.run_attempt == $attempt') ||
  !realModelHumanReviewWorkflowSource.includes(
    'expectedRepositoryCommit: process.env.EXPECTED_COMMIT'
  ) ||
  !realModelHumanReviewWorkflowSource.includes(
    'artifact_digest="sha256:${artifact_digest}"'
  )
) {
  issues.push(
    'G4 protected human-review workflow must stay blind and independent from provider/database access while exact-binding the source run, artifact digests, generated qualification config, and human authority without a tracked-template fallback.'
  );
}
if (
  !v9WorkflowSource.includes(
    'PRODIVIX_G4_DETERMINISTIC_GATE_EVIDENCE: github-actions'
  ) ||
  !v9WorkflowSource.includes(
    'Record deterministic Closure artifact identity'
  ) ||
  !v9WorkflowSource.includes('artifact_digest="sha256:${artifact_digest}"')
) {
  issues.push(
    'G4 V9 workflow must emit exact GitHub run/job-bound deterministic Gate evidence.'
  );
}
if (
  /\bpull_request\s*:/u.test(realModelWorkflowSource) ||
  (realModelWorkflowSource.match(/runs-on:\s*ubuntu-24\.04/gu) ?? []).length !==
    1 ||
  realModelWorkflowSource.includes('permissions: write-all')
) {
  issues.push(
    'G4 protected real-model workflow must have no PR trigger, exactly one secret-free hosted preflight, and least privilege.'
  );
}

for (const [workflowName, workflowSource] of [
  ['g4-real-model-evaluation', realModelWorkflowSource],
  ['g4-real-model-human-review', realModelHumanReviewWorkflowSource],
]) {
  if (
    /pnpm --filter @prodivix\/agent-evaluation-runner (?:run cli|owner-authority-sidecar)/u.test(
      workflowSource
    )
  ) {
    issues.push(
      `${workflowName} must execute built production entrypoints from the repository root.`
    );
  }
  const jobsSource = workflowSource.slice(workflowSource.indexOf('\njobs:'));
  const jobHeadings = [...jobsSource.matchAll(/^ {2}([a-z][a-z0-9_]*):/gmu)];
  for (const match of jobsSource.matchAll(
    /node apps\/agent-evaluation-runner\/dist\/cli\.js/gu
  )) {
    const jobStart = jobHeadings.findLast(
      (heading) => heading.index <= match.index
    )?.index;
    const buildIndex = jobsSource.lastIndexOf(
      'Build evaluation runner',
      match.index
    );
    if (jobStart === undefined || buildIndex < jobStart) {
      issues.push(
        `${workflowName} must build the evaluation runner before each job invokes its dist CLI.`
      );
    }
  }
}

const diagnosticSource = await readFile(
  join(packagesRoot, 'ai', 'src', 'diagnostics', 'aiDiagnosticRegistry.ts'),
  'utf8'
);
const diagnosticSpec = await readFile(
  join(repoRoot, 'specs', 'diagnostics', 'ai-diagnostic-codes.md'),
  'utf8'
);
const registryCodes = new Set(
  [...diagnosticSource.matchAll(/\[\s*'(AI-\d{4})'\s*,/gu)].map(
    (match) => match[1]
  )
);
const specifiedCodes = new Set(
  [...diagnosticSpec.matchAll(/^### `?(AI-\d{4})`?\b/gmu)].map(
    (match) => match[1]
  )
);
for (const code of new Set([...registryCodes, ...specifiedCodes])) {
  if (!registryCodes.has(code) || !specifiedCodes.has(code)) {
    issues.push(
      `${code} must exist in both the AI registry and diagnostic spec.`
    );
  }
  if (
    !(await exists(
      join(
        repoRoot,
        'apps',
        'docs',
        'reference',
        'diagnostics',
        `${code.toLowerCase()}.md`
      )
    ))
  ) {
    issues.push(`${code} generated diagnostic page is missing.`);
  }
}
for (const stage of ['task', 'tool', 'approval', 'verification', 'audit']) {
  if (!diagnosticSource.includes(`'${stage}'`)) {
    issues.push(`AI diagnostic registry is missing the ${stage} stage.`);
  }
}

if (issues.length) {
  console.error(issues.join('\n'));
  process.exitCode = 1;
} else {
  console.log(
    'G4 V0/V1/V2/V3/V4/V5/V6/V7/V8/V9 owner, current/wire, Workspace, provider, Context, media, Hosted capability, durable control-plane, proposal/approval, Verification/repair, product, security/evaluation, Golden Closure, diagnostics, and hard-cut boundaries are valid.'
  );
}
