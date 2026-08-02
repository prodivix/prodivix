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
    'packages/ai/src/security/agentSecurity.types.ts',
    'packages/ai/src/security/agentSecurity.ts',
    'packages/ai/src/evaluation/agentEvaluation.types.ts',
    'packages/ai/src/evaluation/agentEvaluationCorpus.ts',
    'packages/ai/src/evaluation/agentEvaluationPlan.ts',
    'packages/ai/src/evaluation/agentEvaluationResults.ts',
    'packages/ai/src/evaluation/agentEvaluationRepository.ts',
    'packages/ai/src/evaluation/agentEvaluationRunner.ts',
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
  'CallbackBoundAgentSecretTransport',
  'authorizeAgentEgress',
  'inspectAgentPublicEvaluationArtifact',
  'AgentModelEvaluationPlan',
  'AgentModelEvaluationAttempt',
  'AgentModelEvaluationManifest',
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
  !aiPackageManifest.scripts?.['test:g4-v8-model-eval']?.includes(
    'PRODIVIX_VERIFY_G4_V8_MODEL_EVAL=1'
  )
) {
  issues.push(
    'G4 V8 full-denominator evaluation must execute only through its explicit model-eval Gate.'
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
  rootManifest.scripts?.['verify:g4:model-eval:contract']?.includes(
    'model-eval:evidence'
  )
) {
  issues.push(
    'G4 V8 deterministic model-evaluation Gate must enforce core/wire boundaries without consuming real-model evidence.'
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
  "- 'apps/backend/internal/modules/agent/**'",
  "- 'apps/backend/internal/platform/agentcontract/**'",
  "- 'apps/backend/internal/platform/database/**'",
  "- 'apps/remote-runner-worker/**'",
  "- 'packages/ai/**'",
  "- 'packages/golden-conformance/**'",
  "- 'packages/shared/**'",
  "- 'packages/verification/**'",
  "- 'packages/workspace-sync/**'",
  "- 'scripts/ci/configure-rootless-podman.sh'",
  "- 'scripts/g4-agent-closure-canonical-vector.mjs'",
  "- 'scripts/g4-agent-verification-canonical-vector.mjs'",
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
