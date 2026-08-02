import {
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import {
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
  sameAgentWorkspaceRevision,
} from '../domain/agentCanonical';
import type {
  AgentContextPack,
  AgentJsonValue,
  AgentWorkspaceRevisionVector,
} from '../domain/agent.types';
import {
  cloneAgentControlJson,
  containsAgentControlCredentialLikeText,
  hasExactAgentControlKeys,
  inspectAgentControlJson,
  isAgentControlIdentity,
  isAgentControlInstant,
} from '../control/agentControlValidation';
import {
  isAgentControlEvent,
  isAgentRun,
  isAgentRunSnapshot,
} from '../control/agentRunFacts';
import { createAgentTaskRecord, isAgentTaskRecord } from '../control/agentTask';
import { isAgentAuditExport } from '../control/agentAudit';
import { isAgentProposalPlanningReceipt } from '../proposal/agentProposalPreview';
import { isAgentProposalPreviewFact } from '../proposal/agentProposalCodec';
import { isAgentApprovalDecision } from '../proposal/agentApproval';
import { isAgentWorkspaceMutationReceipt } from '../proposal/agentWorkspaceMutation';
import {
  isAgentCommittedVerificationPlanBinding,
  isAgentRepairRoundReceipt,
  isAgentVerificationClosureReceipt,
} from '../verification/agentVerification';
import {
  createAgentUsageVector,
  normalizeAgentCosts,
} from '../usage/agentUsage';
import { isAgentBudgetLedgerState } from '../usage/agentBudgetLedger';
import type {
  AgentProductAction,
  AgentProductDiagnostic,
  AgentProductFact,
  AgentProductLedger,
  AgentProductModelIdentity,
  AgentProductProposalReview,
  AgentProductRuntimeSummary,
  AgentProductSupplement,
  AgentProductTimelineEntry,
  AgentProductToolIdentity,
  AgentProductView,
  AgentRunUserCommand,
} from './agentProduct.types';

const maximumProductBytes = 8_388_608;
const maximumDiagnostics = 1_000;
const maximumIdentityRefs = 128;
const productCapabilities = new Set([
  'read',
  'execute',
  'propose',
  'approve',
  'commit',
  'rollback',
]);
const protocolFamilies = new Set([
  'openai-responses',
  'anthropic-messages',
  'gemini-interactions',
  'openai-compatible',
]);

const assertSafeProductValue = (value: unknown, label: string): void => {
  const issues = inspectAgentControlJson(value, maximumProductBytes);
  if (issues.length > 0) {
    throw new TypeError(
      `${label} is not bounded safe JSON: ${issues.map(({ message }) => message).join('; ')}`
    );
  }
};

function assertBoundedText(
  value: unknown,
  label: string,
  maximum = 4_096
): asserts value is string {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    [...value].length > maximum ||
    containsAgentControlCredentialLikeText(value)
  ) {
    throw new TypeError(`${label} is empty, oversized, or credential-like.`);
  }
}

const canonicalRevision = (
  revision: AgentWorkspaceRevisionVector
): AgentWorkspaceRevisionVector => {
  const cloned = cloneAgentControlJson(revision);
  if (!sameAgentWorkspaceRevision(cloned, revision)) {
    throw new TypeError('Agent product Workspace revision is not canonical.');
  }
  return Object.freeze(cloned);
};

const canonicalDiagnostic = (
  diagnostic: AgentProductDiagnostic
): AgentProductDiagnostic => {
  if (
    !hasExactAgentControlKeys(
      diagnostic,
      ['code', 'severity', 'state', 'message', 'identityRefs'],
      ['nextAction']
    ) ||
    !/^AI-\d{4}$/u.test(diagnostic.code) ||
    !new Set(['info', 'warning', 'error']).has(diagnostic.severity) ||
    !new Set(['active', 'resolved']).has(diagnostic.state) ||
    !Array.isArray(diagnostic.identityRefs) ||
    diagnostic.identityRefs.length > maximumIdentityRefs ||
    diagnostic.identityRefs.some(
      (identity) => !isAgentControlIdentity(identity)
    )
  ) {
    throw new TypeError('Agent product diagnostic identity is invalid.');
  }
  assertBoundedText(diagnostic.message, 'Agent product diagnostic message');
  if (diagnostic.nextAction !== undefined) {
    assertBoundedText(
      diagnostic.nextAction,
      'Agent product diagnostic next action'
    );
  }
  return Object.freeze({
    code: diagnostic.code,
    severity: diagnostic.severity,
    state: diagnostic.state,
    message: diagnostic.message,
    ...(diagnostic.nextAction ? { nextAction: diagnostic.nextAction } : {}),
    identityRefs: Object.freeze(
      [...diagnostic.identityRefs].sort(compareUnicodeCodePoints)
    ),
  });
};

const canonicalModel = (
  model: AgentProductModelIdentity
): AgentProductModelIdentity => {
  if (
    !hasExactAgentControlKeys(
      model,
      [
        'invocationId',
        'providerConfigurationId',
        'protocolFamily',
        'providerOperatorId',
        'modelId',
        'capabilityProfileId',
        'outcome',
      ],
      ['modelVersion', 'receiptDigest']
    ) ||
    !isAgentControlIdentity(model.invocationId) ||
    !isAgentControlIdentity(model.providerConfigurationId) ||
    !protocolFamilies.has(model.protocolFamily) ||
    !isAgentControlIdentity(model.providerOperatorId) ||
    !isAgentControlIdentity(model.modelId) ||
    !isAgentControlIdentity(model.capabilityProfileId) ||
    (model.modelVersion !== undefined &&
      !isAgentControlIdentity(model.modelVersion)) ||
    (model.receiptDigest !== undefined &&
      !isAgentCanonicalDigest(model.receiptDigest)) ||
    !new Set([
      'running',
      'completed',
      'refused',
      'blocked',
      'failed',
      'cancelled',
    ]).has(model.outcome)
  ) {
    throw new TypeError('Agent product model identity is invalid.');
  }
  return Object.freeze({ ...model });
};

const canonicalTool = (
  tool: AgentProductToolIdentity
): AgentProductToolIdentity => {
  if (
    !hasExactAgentControlKeys(
      tool,
      ['callId', 'toolId', 'executionLocus', 'state'],
      ['receiptDigest']
    ) ||
    !isAgentControlIdentity(tool.callId) ||
    !isAgentControlIdentity(tool.toolId) ||
    !new Set([
      'client-hosted',
      'prodivix-runtime',
      'provider-hosted',
      'pinned-mcp',
    ]).has(tool.executionLocus) ||
    !new Set([
      'authorized',
      'running',
      'completed',
      'rejected',
      'cancelled',
    ]).has(tool.state) ||
    (tool.receiptDigest !== undefined &&
      !isAgentCanonicalDigest(tool.receiptDigest))
  ) {
    throw new TypeError('Agent product tool identity is invalid.');
  }
  return Object.freeze({ ...tool });
};

const canonicalRuntime = (
  runtime: AgentProductRuntimeSummary
): AgentProductRuntimeSummary => {
  if (
    !hasExactAgentControlKeys(
      runtime,
      ['models', 'tools', 'usage', 'costs', 'budgetLedgerDigest'],
      ['usageVectorDigest']
    ) ||
    !Array.isArray(runtime.models) ||
    !Array.isArray(runtime.tools) ||
    !Array.isArray(runtime.usage) ||
    !Array.isArray(runtime.costs) ||
    !isAgentCanonicalDigest(runtime.budgetLedgerDigest) ||
    (runtime.usageVectorDigest !== undefined &&
      !isAgentCanonicalDigest(runtime.usageVectorDigest))
  ) {
    throw new TypeError('Agent product runtime summary is invalid.');
  }
  const usage = createAgentUsageVector(runtime.usage);
  if (
    runtime.usageVectorDigest !== undefined &&
    runtime.usageVectorDigest !== usage.vectorDigest
  ) {
    throw new TypeError('Agent product usage vector digest drifted.');
  }
  return Object.freeze({
    models: Object.freeze(
      runtime.models
        .map(canonicalModel)
        .sort((left, right) =>
          compareUnicodeCodePoints(left.invocationId, right.invocationId)
        )
    ),
    tools: Object.freeze(
      runtime.tools
        .map(canonicalTool)
        .sort((left, right) =>
          compareUnicodeCodePoints(left.callId, right.callId)
        )
    ),
    usage: usage.amounts,
    costs: normalizeAgentCosts(runtime.costs),
    ...(runtime.usageVectorDigest
      ? { usageVectorDigest: runtime.usageVectorDigest }
      : {}),
    budgetLedgerDigest: runtime.budgetLedgerDigest,
  });
};

const proposalReviewBase = (
  input: Omit<AgentProductProposalReview, 'reviewDigest'>
) => ({
  proposalId: input.proposalId,
  previewId: input.previewId,
  semanticDiff: cloneAgentControlJson(input.semanticDiff),
  semanticDiffDigest: input.semanticDiffDigest,
  impact: cloneAgentControlJson(input.impact),
  impactDigest: input.impactDigest,
  verificationPlan: cloneAgentControlJson(input.verificationPlan),
  verificationPlanDigest: input.verificationPlanDigest,
  permissions: Object.freeze(
    [...input.permissions].sort(compareUnicodeCodePoints)
  ),
  risks: Object.freeze(
    input.risks
      .map((risk) => Object.freeze({ ...risk }))
      .sort((left, right) => compareUnicodeCodePoints(left.id, right.id))
  ),
  rollback: Object.freeze({ ...input.rollback }),
});

export const createAgentProductProposalReview = (
  input: Omit<AgentProductProposalReview, 'reviewDigest'>
): AgentProductProposalReview => {
  assertSafeProductValue(input, 'Agent product proposal review');
  if (
    !isAgentControlIdentity(input.proposalId) ||
    !isAgentControlIdentity(input.previewId) ||
    !isAgentCanonicalDigest(input.semanticDiffDigest) ||
    !isAgentCanonicalDigest(input.impactDigest) ||
    !isAgentCanonicalDigest(input.verificationPlanDigest) ||
    !isAgentCanonicalDigest(input.rollback.reverseTransactionDigest) ||
    !new Set(['none', 'on-unsatisfied-closure']).has(
      input.rollback.authorization
    ) ||
    input.permissions.length > 16 ||
    input.permissions.some(
      (capability) => !productCapabilities.has(capability)
    ) ||
    input.risks.length > 512 ||
    input.risks.some(
      (risk) =>
        !isAgentControlIdentity(risk.id) ||
        !new Set(['low', 'medium', 'high', 'critical']).has(risk.level) ||
        typeof risk.message !== 'string' ||
        risk.message.length > 4_096 ||
        containsAgentControlCredentialLikeText(risk.message)
    ) ||
    digestAgentCanonicalValue(input.semanticDiff) !==
      input.semanticDiffDigest ||
    digestAgentCanonicalValue(input.impact) !== input.impactDigest ||
    digestAgentCanonicalValue(input.verificationPlan) !==
      input.verificationPlanDigest
  ) {
    throw new TypeError(
      'Agent product proposal review identity or artifact digest is invalid.'
    );
  }
  const base = proposalReviewBase(input);
  return Object.freeze({
    ...base,
    reviewDigest: digestAgentCanonicalValue(base),
  });
};

export const isAgentProductProposalReview = (
  value: unknown
): value is AgentProductProposalReview => {
  try {
    if (
      !hasExactAgentControlKeys(value, [
        'proposalId',
        'previewId',
        'semanticDiff',
        'semanticDiffDigest',
        'impact',
        'impactDigest',
        'verificationPlan',
        'verificationPlanDigest',
        'permissions',
        'risks',
        'rollback',
        'reviewDigest',
      ]) ||
      !isAgentCanonicalDigest(value.reviewDigest)
    ) {
      return false;
    }
    const { reviewDigest: _reviewDigest, ...input } = value;
    return sameCanonicalJson(
      createAgentProductProposalReview(
        input as Omit<AgentProductProposalReview, 'reviewDigest'>
      ),
      value
    );
  } catch {
    return false;
  }
};

const contextIsMetadataOnly = (context: AgentContextPack): boolean => {
  if (
    !isAgentControlIdentity(context.contextPackId) ||
    !isAgentControlIdentity(context.taskId) ||
    !isAgentControlIdentity(context.runId) ||
    !isAgentCanonicalDigest(context.manifestDigest) ||
    context.contextPackId !==
      `context-pack:${context.manifestDigest.slice('sha256-'.length)}` ||
    !isAgentCanonicalDigest(context.semanticProviderSetDigest) ||
    !isAgentCanonicalDigest(context.contextContributorSetDigest) ||
    !isAgentCanonicalDigest(context.providerSetDigest) ||
    !isAgentCanonicalDigest(context.policyDigest) ||
    !Array.isArray(context.items) ||
    !Array.isArray(context.omitted)
  ) {
    return false;
  }
  return context.items.every(
    (item) =>
      isAgentControlIdentity(item.itemId) &&
      isAgentCanonicalDigest(item.contentDigest) &&
      Number.isSafeInteger(item.byteLength) &&
      item.byteLength >= 0 &&
      typeof item.mediaType === 'string' &&
      item.mediaType.length <= 256 &&
      !Object.hasOwn(item as object, 'content')
  );
};

const supplementBase = (
  input: Omit<AgentProductSupplement, 'supplementDigest'>
) => ({
  supplementId: input.supplementId,
  taskId: input.taskId,
  runId: input.runId,
  generation: input.generation,
  runSnapshotDigest: input.runSnapshotDigest,
  ...(input.context ? { context: cloneAgentControlJson(input.context) } : {}),
  ...(input.proposalReview
    ? { proposalReview: cloneAgentControlJson(input.proposalReview) }
    : {}),
  runtime: canonicalRuntime(input.runtime),
  diagnostics: Object.freeze(
    input.diagnostics
      .map(canonicalDiagnostic)
      .sort(
        (left, right) =>
          compareUnicodeCodePoints(left.code, right.code) ||
          compareUnicodeCodePoints(left.message, right.message)
      )
  ),
  producer: Object.freeze({ ...input.producer }),
  projectedAt: input.projectedAt,
});

export const createAgentProductSupplement = (
  input: Omit<AgentProductSupplement, 'supplementDigest'>
): AgentProductSupplement => {
  assertSafeProductValue(input, 'Agent product supplement');
  if (
    !isAgentControlIdentity(input.supplementId) ||
    !isAgentControlIdentity(input.taskId) ||
    !isAgentControlIdentity(input.runId) ||
    !Number.isSafeInteger(input.generation) ||
    input.generation < 0 ||
    !isAgentCanonicalDigest(input.runSnapshotDigest) ||
    input.producer.kind !== 'service' ||
    !isAgentControlIdentity(input.producer.principalId) ||
    !isAgentControlInstant(input.projectedAt) ||
    input.diagnostics.length > maximumDiagnostics ||
    (input.context !== undefined && !contextIsMetadataOnly(input.context)) ||
    (input.proposalReview !== undefined &&
      !isAgentProductProposalReview(input.proposalReview))
  ) {
    throw new TypeError('Agent product supplement is invalid.');
  }
  const base = supplementBase(input);
  return Object.freeze({
    ...base,
    supplementDigest: digestAgentCanonicalValue(base),
  });
};

export const isAgentProductSupplement = (
  value: unknown
): value is AgentProductSupplement => {
  try {
    if (
      !hasExactAgentControlKeys(
        value,
        [
          'supplementId',
          'taskId',
          'runId',
          'generation',
          'runSnapshotDigest',
          'runtime',
          'diagnostics',
          'producer',
          'projectedAt',
          'supplementDigest',
        ],
        ['context', 'proposalReview']
      ) ||
      !isAgentCanonicalDigest(value.supplementDigest)
    ) {
      return false;
    }
    const { supplementDigest: _supplementDigest, ...input } = value;
    return sameCanonicalJson(
      createAgentProductSupplement(
        input as Omit<AgentProductSupplement, 'supplementDigest'>
      ),
      value
    );
  } catch {
    return false;
  }
};

const userCommandBase = (
  input: Omit<AgentRunUserCommand, 'commandDigest'>
) => ({
  commandId: input.commandId,
  taskId: input.taskId,
  runId: input.runId,
  kind: input.kind,
  actor: Object.freeze({ ...input.actor }),
  expectedGeneration: input.expectedGeneration,
  expectedSnapshotDigest: input.expectedSnapshotDigest,
  idempotencyKey: input.idempotencyKey,
  ...(input.reason ? { reason: input.reason } : {}),
  requestedAt: input.requestedAt,
});

export const createAgentRunUserCommand = (
  input: Omit<AgentRunUserCommand, 'commandDigest'>
): AgentRunUserCommand => {
  assertSafeProductValue(input, 'Agent Run user command');
  if (
    !isAgentControlIdentity(input.commandId) ||
    !isAgentControlIdentity(input.taskId) ||
    !isAgentControlIdentity(input.runId) ||
    !new Set(['cancel', 'recover']).has(input.kind) ||
    input.actor.kind !== 'user' ||
    !isAgentControlIdentity(input.actor.principalId) ||
    !Number.isSafeInteger(input.expectedGeneration) ||
    input.expectedGeneration < 0 ||
    !isAgentCanonicalDigest(input.expectedSnapshotDigest) ||
    !isAgentControlIdentity(input.idempotencyKey) ||
    !isAgentControlInstant(input.requestedAt)
  ) {
    throw new TypeError('Agent Run user command identity is invalid.');
  }
  if (input.reason !== undefined) {
    assertBoundedText(input.reason, 'Agent Run user command reason', 2_048);
  }
  const base = userCommandBase(input);
  return Object.freeze({
    ...base,
    commandDigest: digestAgentCanonicalValue(base),
  });
};

export const isAgentRunUserCommand = (
  value: unknown
): value is AgentRunUserCommand => {
  try {
    if (
      !hasExactAgentControlKeys(
        value,
        [
          'commandId',
          'taskId',
          'runId',
          'kind',
          'actor',
          'expectedGeneration',
          'expectedSnapshotDigest',
          'idempotencyKey',
          'requestedAt',
          'commandDigest',
        ],
        ['reason']
      ) ||
      !isAgentCanonicalDigest(value.commandDigest)
    ) {
      return false;
    }
    const { commandDigest: _commandDigest, ...input } = value;
    return sameCanonicalJson(
      createAgentRunUserCommand(
        input as Omit<AgentRunUserCommand, 'commandDigest'>
      ),
      value
    );
  } catch {
    return false;
  }
};

export const isAgentProductFact = (value: unknown): value is AgentProductFact =>
  hasExactAgentControlKeys(value, ['factType', 'value']) &&
  ((value.factType === 'product-supplement' &&
    isAgentProductSupplement(value.value)) ||
    (value.factType === 'run-user-command' &&
      isAgentRunUserCommand(value.value)));

const validateEventChain = (
  ledger: AgentProductLedger
): readonly AgentProductTimelineEntry[] => {
  const events = [...ledger.events].sort(
    (left, right) => left.sequence - right.sequence
  );
  if (events.length !== ledger.run.cursor || events.length === 0) {
    throw new TypeError(
      'Agent product event ledger does not cover the Run cursor.'
    );
  }
  let previous: string | undefined;
  const timeline = events.map((event, index) => {
    if (
      !isAgentControlEvent(event) ||
      event.sequence !== index + 1 ||
      event.taskId !== ledger.task.spec.taskId ||
      event.runId !== ledger.run.run.runId ||
      event.previousEventDigest !== previous
    ) {
      throw new TypeError('Agent product event ledger is not contiguous.');
    }
    previous = event.eventDigest;
    return Object.freeze({
      sequence: event.sequence,
      eventId: event.eventId,
      family: event.family,
      type: event.type,
      generation: event.generation,
      occurredAt: event.occurredAt,
      eventDigest: event.eventDigest,
      ...(event.data.diagnosticCode
        ? { diagnosticCode: event.data.diagnosticCode }
        : {}),
    });
  });
  if (previous !== ledger.run.run.latestEventDigest) {
    throw new TypeError('Agent product event head does not match the Run.');
  }
  return Object.freeze(timeline);
};

const validateProposalLedger = (ledger: AgentProductLedger): void => {
  const { proposal, planning, preview, approval, supplement } = ledger;
  if (
    !proposal &&
    (planning || preview || approval || supplement?.proposalReview)
  ) {
    throw new TypeError('Agent product proposal descendants lack a proposal.');
  }
  if (proposal) {
    const { proposalDigest, ...proposalBase } = proposal;
    if (
      !hasExactAgentControlKeys(proposal, [
        'proposalId',
        'taskId',
        'runId',
        'baseRevision',
        'contextPackDigest',
        'actions',
        'explanation',
        'assumptions',
        'requestedVerification',
        'modelInvocationRefs',
        'proposalDigest',
      ]) ||
      !isAgentCanonicalDigest(proposalDigest) ||
      digestAgentCanonicalValue(proposalBase) !== proposalDigest ||
      proposal.taskId !== ledger.task.spec.taskId ||
      proposal.runId !== ledger.run.run.runId
    ) {
      throw new TypeError('Agent product proposal identity is invalid.');
    }
  }
  if (
    planning &&
    (!isAgentProposalPlanningReceipt(planning) ||
      planning.proposalId !== proposal?.proposalId)
  ) {
    throw new TypeError('Agent product planning receipt is invalid.');
  }
  if (
    preview &&
    (!isAgentProposalPreviewFact(preview) ||
      preview.proposalId !== proposal?.proposalId)
  ) {
    throw new TypeError('Agent product proposal preview is invalid.');
  }
  if (
    preview &&
    planning &&
    (preview.transactionDigest !== planning.transactionDigest ||
      preview.impactDigest !== planning.impactDigest ||
      preview.verificationPlanDigest !== planning.verificationPlanDigest)
  ) {
    throw new TypeError('Agent product preview drifted from domain planning.');
  }
  if (
    approval &&
    (!isAgentApprovalDecision(approval) ||
      approval.taskId !== ledger.task.spec.taskId ||
      approval.runId !== ledger.run.run.runId ||
      approval.previewId !== preview?.previewId ||
      approval.previewDigest !== preview?.previewDigest)
  ) {
    throw new TypeError(
      'Agent product approval does not bind the exact preview.'
    );
  }
  if (supplement?.proposalReview) {
    const review = supplement.proposalReview;
    if (
      review.proposalId !== proposal?.proposalId ||
      review.previewId !== preview?.previewId ||
      review.semanticDiffDigest !== planning?.semanticDiffDigest ||
      review.impactDigest !== planning?.impactDigest ||
      review.verificationPlanDigest !== planning?.verificationPlanDigest ||
      review.rollback.reverseTransactionDigest !==
        planning?.reverseTransactionDigest
    ) {
      throw new TypeError(
        'Agent product review drifted from the exact preview.'
      );
    }
  }
};

const validateVerificationLedger = (ledger: AgentProductLedger): void => {
  for (const mutation of ledger.mutations) {
    if (
      !isAgentWorkspaceMutationReceipt(mutation) ||
      mutation.taskId !== ledger.task.spec.taskId ||
      mutation.runId !== ledger.run.run.runId
    ) {
      throw new TypeError('Agent product mutation receipt is invalid.');
    }
  }
  for (const binding of ledger.verificationBindings) {
    if (
      !isAgentCommittedVerificationPlanBinding(binding) ||
      binding.taskId !== ledger.task.spec.taskId ||
      binding.runId !== ledger.run.run.runId ||
      !ledger.mutations.some(
        ({ receiptId }) => receiptId === binding.mutationReceiptId
      )
    ) {
      throw new TypeError('Agent product Verification binding is invalid.');
    }
  }
  for (const closure of ledger.verificationClosures) {
    if (
      !isAgentVerificationClosureReceipt(closure) ||
      closure.taskId !== ledger.task.spec.taskId ||
      closure.runId !== ledger.run.run.runId ||
      !ledger.verificationBindings.some(
        ({ bindingId }) => bindingId === closure.bindingId
      )
    ) {
      throw new TypeError('Agent product Closure receipt is invalid.');
    }
  }
  for (const repair of ledger.repairRounds) {
    if (
      !isAgentRepairRoundReceipt(repair) ||
      repair.taskId !== ledger.task.spec.taskId ||
      repair.runId !== ledger.run.run.runId ||
      !ledger.verificationClosures.some(
        ({ receiptId }) => receiptId === repair.failedClosureReceiptId
      )
    ) {
      throw new TypeError('Agent product repair receipt is invalid.');
    }
  }
};

const latestBy = <T>(
  values: readonly T[],
  compare: (left: T, right: T) => number
): T | undefined => [...values].sort(compare).at(-1);

const deriveActions = (
  ledger: AgentProductLedger,
  latestClosure: AgentProductLedger['verificationClosures'][number] | undefined
): readonly AgentProductAction[] => {
  const actions: AgentProductAction[] = [];
  const run = ledger.run.run;
  const currentCommand = (kind: 'cancel' | 'recover') =>
    ledger.commands.some(
      (command) =>
        command.kind === kind &&
        command.expectedGeneration === run.generation &&
        command.expectedSnapshotDigest === ledger.run.snapshotDigest
    );
  if (
    run.phase === 'awaiting-approval' &&
    ledger.preview &&
    !ledger.approval &&
    ledger.actorAuthorized
  ) {
    actions.push('approve', 'reject');
  }
  if (
    run.phase !== 'terminal' &&
    run.phase !== 'cancelling' &&
    !currentCommand('cancel')
  ) {
    actions.push('cancel');
  }
  if (
    (ledger.run.cleanupState === 'residual' ||
      ledger.run.pendingOperation?.state === 'reconciliation-required') &&
    run.phase !== 'terminal' &&
    !currentCommand('recover')
  ) {
    actions.push('recover');
  }
  if (
    latestClosure?.verdict === 'unsatisfied' &&
    !ledger.repairRounds.some(
      (repair) => repair.state === 'blocked' && repair.round >= 1
    )
  ) {
    actions.push('repair');
  }
  if (ledger.events.length > 0) actions.push('export-audit');
  return Object.freeze(actions);
};

const derivedDiagnostics = (
  ledger: AgentProductLedger,
  latestClosure: AgentProductLedger['verificationClosures'][number] | undefined
): readonly AgentProductDiagnostic[] => {
  const diagnostics = [...(ledger.supplement?.diagnostics ?? [])];
  const refs = Object.freeze([ledger.task.spec.taskId, ledger.run.run.runId]);
  if (!ledger.actorAuthorized) {
    diagnostics.push(
      canonicalDiagnostic({
        code: 'AI-7001',
        severity: 'error',
        state: 'active',
        message: 'The current actor is not authorized for this Agent Run.',
        nextAction: 'Restore the exact project and Workspace authorization.',
        identityRefs: refs,
      })
    );
  }
  if (
    !sameAgentWorkspaceRevision(
      ledger.currentRevision,
      ledger.run.run.baseRevision
    ) &&
    !ledger.mutations.length
  ) {
    diagnostics.push(
      canonicalDiagnostic({
        code: 'AI-6001',
        severity: 'error',
        state: 'active',
        message: 'The Agent Task base revision is stale.',
        nextAction:
          'Create a new proposal and exact approval for the current revision.',
        identityRefs: refs,
      })
    );
  }
  if (latestClosure?.verdict === 'unsatisfied') {
    diagnostics.push(
      canonicalDiagnostic({
        code: 'AI-8001',
        severity: 'error',
        state: 'active',
        message: 'The required Verification Closure is unsatisfied.',
        nextAction:
          'Review failed Evidence before starting an approval-bound repair.',
        identityRefs: Object.freeze([...refs, latestClosure.receiptId]),
      })
    );
  }
  if (ledger.run.cleanupState === 'residual') {
    diagnostics.push(
      canonicalDiagnostic({
        code: 'AI-6004',
        severity: 'error',
        state: 'active',
        message: 'Run cleanup left residual state and requires recovery.',
        nextAction:
          'Request bounded recovery without replaying a completed side effect.',
        identityRefs: refs,
      })
    );
  }
  return Object.freeze(
    diagnostics
      .map(canonicalDiagnostic)
      .sort(
        (left, right) =>
          compareUnicodeCodePoints(left.code, right.code) ||
          compareUnicodeCodePoints(left.message, right.message)
      )
  );
};

const viewBase = (ledger: AgentProductLedger) => {
  if (!isAgentTaskRecord(ledger.task) || !isAgentRunSnapshot(ledger.run)) {
    throw new TypeError('Agent product Task or Run is invalid.');
  }
  if (
    ledger.run.run.taskId !== ledger.task.spec.taskId ||
    ledger.run.taskDigest !== ledger.task.taskDigest ||
    ledger.run.run.policyDigest !== ledger.task.spec.policyDigest
  ) {
    throw new TypeError('Agent product Task and Run identity drifted.');
  }
  canonicalRevision(ledger.currentRevision);
  const timeline = validateEventChain(ledger);
  validateProposalLedger(ledger);
  validateVerificationLedger(ledger);
  if (
    ledger.supplement &&
    (!isAgentProductSupplement(ledger.supplement) ||
      ledger.supplement.taskId !== ledger.task.spec.taskId ||
      ledger.supplement.runId !== ledger.run.run.runId ||
      ledger.supplement.generation !== ledger.run.run.generation ||
      ledger.supplement.runSnapshotDigest !== ledger.run.snapshotDigest ||
      (ledger.supplement.context !== undefined &&
        (ledger.supplement.context.taskId !== ledger.task.spec.taskId ||
          ledger.supplement.context.runId !== ledger.run.run.runId ||
          ledger.supplement.context.manifestDigest !==
            ledger.run.run.contextPackDigest)))
  ) {
    throw new TypeError('Agent product supplement is stale or incompatible.');
  }
  for (const command of ledger.commands) {
    if (
      !isAgentRunUserCommand(command) ||
      command.taskId !== ledger.task.spec.taskId ||
      command.runId !== ledger.run.run.runId ||
      command.actor.principalId !== ledger.task.spec.actor.principalId
    ) {
      throw new TypeError('Agent product user command is invalid.');
    }
  }
  if (
    ledger.audit &&
    (!isAgentAuditExport(ledger.audit) ||
      ledger.audit.runId !== ledger.run.run.runId)
  ) {
    throw new TypeError('Agent product audit export is invalid.');
  }
  const mutations = Object.freeze(
    [...ledger.mutations].sort((left, right) =>
      compareUnicodeCodePoints(left.startedAt, right.startedAt)
    )
  );
  const verificationBindings = Object.freeze(
    [...ledger.verificationBindings].sort((left, right) =>
      compareUnicodeCodePoints(left.boundAt, right.boundAt)
    )
  );
  const verificationClosures = Object.freeze(
    [...ledger.verificationClosures].sort((left, right) =>
      compareUnicodeCodePoints(left.evaluatedAt, right.evaluatedAt)
    )
  );
  const repairRounds = Object.freeze(
    [...ledger.repairRounds].sort(
      (left, right) =>
        left.round - right.round ||
        compareUnicodeCodePoints(left.recordedAt, right.recordedAt)
    )
  );
  const commands = Object.freeze(
    [...ledger.commands].sort((left, right) =>
      compareUnicodeCodePoints(left.requestedAt, right.requestedAt)
    )
  );
  const latestMutation = mutations.at(-1);
  const latestBinding = verificationBindings.at(-1);
  const latestClosure = latestBy(verificationClosures, (left, right) =>
    compareUnicodeCodePoints(left.evaluatedAt, right.evaluatedAt)
  );
  const runtime =
    ledger.supplement?.runtime ??
    canonicalRuntime({
      models: [],
      tools: [],
      usage: [],
      costs: [],
      budgetLedgerDigest: ledger.run.budgetLedger.ledgerDigest,
    });
  const identity = Object.freeze({
    projectId: ledger.task.spec.projectId,
    workspaceId: ledger.task.spec.workspaceId,
    taskId: ledger.task.spec.taskId,
    taskDigest: ledger.task.taskDigest,
    runId: ledger.run.run.runId,
    runSnapshotDigest: ledger.run.snapshotDigest,
    generation: ledger.run.run.generation,
    attempt: ledger.run.run.attempt,
    cursor: ledger.run.cursor,
    ...(ledger.run.run.latestEventDigest
      ? { latestEventDigest: ledger.run.run.latestEventDigest }
      : {}),
    ...(ledger.run.run.contextPackDigest
      ? { contextPackDigest: ledger.run.run.contextPackDigest }
      : {}),
    ...(ledger.proposal
      ? {
          proposalId: ledger.proposal.proposalId,
          proposalDigest: ledger.proposal.proposalDigest,
        }
      : {}),
    ...(ledger.preview
      ? {
          previewId: ledger.preview.previewId,
          previewDigest: ledger.preview.previewDigest,
        }
      : {}),
    ...(ledger.approval ? { decisionId: ledger.approval.decisionId } : {}),
    ...(latestMutation ? { mutationReceiptId: latestMutation.receiptId } : {}),
    ...(latestBinding
      ? { verificationBindingId: latestBinding.bindingId }
      : {}),
    ...(latestClosure
      ? {
          verificationClosureReceiptId: latestClosure.receiptId,
          verificationClosureDigest: latestClosure.closureDigest,
        }
      : {}),
  });
  return {
    identity,
    task: cloneAgentControlJson(ledger.task.spec),
    run: cloneAgentControlJson(ledger.run.run),
    cleanupState: ledger.run.cleanupState,
    budgetLedger: cloneAgentControlJson(ledger.run.budgetLedger),
    ...(ledger.supplement?.context
      ? { context: cloneAgentControlJson(ledger.supplement.context) }
      : {}),
    ...(ledger.proposal
      ? { proposal: cloneAgentControlJson(ledger.proposal) }
      : {}),
    ...(ledger.planning
      ? { planning: cloneAgentControlJson(ledger.planning) }
      : {}),
    ...(ledger.preview
      ? { preview: cloneAgentControlJson(ledger.preview) }
      : {}),
    ...(ledger.supplement?.proposalReview
      ? {
          proposalReview: cloneAgentControlJson(
            ledger.supplement.proposalReview
          ),
        }
      : {}),
    ...(ledger.approval
      ? { approval: cloneAgentControlJson(ledger.approval) }
      : {}),
    mutations,
    verificationBindings,
    verificationClosures,
    repairRounds,
    runtime,
    diagnostics: derivedDiagnostics(ledger, latestClosure),
    timeline,
    commands,
    availableActions: deriveActions(ledger, latestClosure),
    ...(ledger.audit
      ? {
          audit: Object.freeze({
            fromSequence: ledger.audit.fromSequence,
            toSequence: ledger.audit.toSequence,
            eventCount: ledger.audit.eventCount,
            chainRootDigest: ledger.audit.chainRootDigest,
            chainHeadDigest: ledger.audit.chainHeadDigest,
            exportDigest: ledger.audit.exportDigest,
          }),
        }
      : {}),
  };
};

export const createAgentProductView = (
  ledger: AgentProductLedger
): AgentProductView => {
  assertSafeProductValue(ledger, 'Agent product ledger');
  const base = viewBase(ledger);
  return Object.freeze({
    ...base,
    viewDigest: digestAgentCanonicalValue(base),
  });
};

export const isAgentProductView = (
  value: unknown
): value is AgentProductView => {
  try {
    if (
      inspectAgentControlJson(value, maximumProductBytes).length > 0 ||
      !hasExactAgentControlKeys(
        value,
        [
          'identity',
          'task',
          'run',
          'cleanupState',
          'budgetLedger',
          'mutations',
          'verificationBindings',
          'verificationClosures',
          'repairRounds',
          'runtime',
          'diagnostics',
          'timeline',
          'commands',
          'availableActions',
          'viewDigest',
        ],
        [
          'context',
          'proposal',
          'planning',
          'preview',
          'proposalReview',
          'approval',
          'audit',
        ]
      ) ||
      !isAgentCanonicalDigest(value.viewDigest)
    ) {
      return false;
    }
    const view = value as AgentProductView;
    const identity = view.identity;
    if (
      !hasExactAgentControlKeys(
        identity,
        [
          'projectId',
          'workspaceId',
          'taskId',
          'taskDigest',
          'runId',
          'runSnapshotDigest',
          'generation',
          'attempt',
          'cursor',
        ],
        [
          'latestEventDigest',
          'contextPackDigest',
          'proposalId',
          'proposalDigest',
          'previewId',
          'previewDigest',
          'decisionId',
          'mutationReceiptId',
          'verificationBindingId',
          'verificationClosureReceiptId',
          'verificationClosureDigest',
        ]
      ) ||
      ![
        identity.projectId,
        identity.workspaceId,
        identity.taskId,
        identity.runId,
      ].every(isAgentControlIdentity) ||
      ![
        identity.taskDigest,
        identity.runSnapshotDigest,
        identity.latestEventDigest,
        identity.contextPackDigest,
        identity.proposalDigest,
        identity.previewDigest,
        identity.verificationClosureDigest,
      ].every(
        (digest) => digest === undefined || isAgentCanonicalDigest(digest)
      ) ||
      ![
        identity.proposalId,
        identity.previewId,
        identity.decisionId,
        identity.mutationReceiptId,
        identity.verificationBindingId,
        identity.verificationClosureReceiptId,
      ].every((id) => id === undefined || isAgentControlIdentity(id)) ||
      !Number.isSafeInteger(identity.generation) ||
      identity.generation < 0 ||
      !Number.isSafeInteger(identity.attempt) ||
      identity.attempt < 0 ||
      !Number.isSafeInteger(identity.cursor) ||
      identity.cursor < 1 ||
      !isAgentRun(view.run) ||
      !isAgentBudgetLedgerState(view.budgetLedger) ||
      !new Set(['not-required', 'pending', 'clean', 'residual']).has(
        view.cleanupState
      )
    ) {
      return false;
    }
    const task = createAgentTaskRecord(view.task);
    if (
      task.taskDigest !== identity.taskDigest ||
      view.task.projectId !== identity.projectId ||
      view.task.workspaceId !== identity.workspaceId ||
      view.task.taskId !== identity.taskId ||
      view.run.runId !== identity.runId ||
      view.run.taskId !== identity.taskId ||
      view.run.generation !== identity.generation ||
      view.run.attempt !== identity.attempt ||
      view.run.policyDigest !== view.task.policyDigest ||
      view.run.latestEventDigest !== identity.latestEventDigest ||
      view.run.contextPackDigest !== identity.contextPackDigest ||
      !sameAgentWorkspaceRevision(
        view.run.baseRevision,
        view.task.baseRevision
      ) ||
      canonicalRuntime(view.runtime).budgetLedgerDigest !==
        view.budgetLedger.ledgerDigest ||
      !sameCanonicalJson(canonicalRuntime(view.runtime), view.runtime)
    ) {
      return false;
    }
    if (
      (view.context !== undefined &&
        (!contextIsMetadataOnly(view.context) ||
          view.context.taskId !== identity.taskId ||
          view.context.runId !== identity.runId ||
          view.context.manifestDigest !== identity.contextPackDigest)) ||
      !Array.isArray(view.timeline) ||
      view.timeline.length !== identity.cursor ||
      view.timeline.some((entry, index) => {
        if (
          !hasExactAgentControlKeys(
            entry,
            [
              'sequence',
              'eventId',
              'family',
              'type',
              'generation',
              'occurredAt',
              'eventDigest',
            ],
            ['diagnosticCode']
          )
        ) {
          return true;
        }
        const timelineEntry = entry as unknown as AgentProductTimelineEntry;
        return (
          timelineEntry.sequence !== index + 1 ||
          !isAgentControlIdentity(timelineEntry.eventId) ||
          !Number.isSafeInteger(timelineEntry.generation) ||
          timelineEntry.generation < 0 ||
          !isAgentControlInstant(timelineEntry.occurredAt) ||
          !isAgentCanonicalDigest(timelineEntry.eventDigest) ||
          (timelineEntry.diagnosticCode !== undefined &&
            !/^AI-\d{4}$/u.test(timelineEntry.diagnosticCode))
        );
      }) ||
      view.timeline.at(-1)?.eventDigest !== identity.latestEventDigest
    ) {
      return false;
    }
    const proposalLedger = {
      task,
      run: Object.freeze({ run: view.run }),
      proposal: view.proposal,
      planning: view.planning,
      preview: view.preview,
      approval: view.approval,
      supplement: view.proposalReview
        ? Object.freeze({ proposalReview: view.proposalReview })
        : undefined,
    } as AgentProductLedger;
    validateProposalLedger(proposalLedger);
    if (
      view.proposal?.proposalId !== identity.proposalId ||
      view.proposal?.proposalDigest !== identity.proposalDigest ||
      view.preview?.previewId !== identity.previewId ||
      view.preview?.previewDigest !== identity.previewDigest ||
      view.approval?.decisionId !== identity.decisionId
    ) {
      return false;
    }
    const verificationLedger = {
      task,
      run: Object.freeze({ run: view.run }),
      mutations: view.mutations,
      verificationBindings: view.verificationBindings,
      verificationClosures: view.verificationClosures,
      repairRounds: view.repairRounds,
    } as AgentProductLedger;
    validateVerificationLedger(verificationLedger);
    if (
      view.mutations.at(-1)?.receiptId !== identity.mutationReceiptId ||
      view.verificationBindings.at(-1)?.bindingId !==
        identity.verificationBindingId ||
      view.verificationClosures.at(-1)?.receiptId !==
        identity.verificationClosureReceiptId ||
      view.verificationClosures.at(-1)?.closureDigest !==
        identity.verificationClosureDigest ||
      !Array.isArray(view.commands) ||
      view.commands.some(
        (command) =>
          !isAgentRunUserCommand(command) ||
          command.taskId !== identity.taskId ||
          command.runId !== identity.runId ||
          command.actor.principalId !== view.task.actor.principalId
      ) ||
      !Array.isArray(view.diagnostics) ||
      view.diagnostics.length > maximumDiagnostics ||
      !sameCanonicalJson(
        view.diagnostics.map(canonicalDiagnostic),
        view.diagnostics
      ) ||
      !Array.isArray(view.availableActions) ||
      new Set(view.availableActions).size !== view.availableActions.length ||
      view.availableActions.some(
        (action) =>
          !new Set([
            'approve',
            'reject',
            'cancel',
            'recover',
            'repair',
            'export-audit',
          ]).has(action)
      )
    ) {
      return false;
    }
    if (
      view.audit !== undefined &&
      (!hasExactAgentControlKeys(view.audit, [
        'fromSequence',
        'toSequence',
        'eventCount',
        'chainRootDigest',
        'chainHeadDigest',
        'exportDigest',
      ]) ||
        view.audit.fromSequence !== 1 ||
        view.audit.toSequence !== identity.cursor ||
        view.audit.eventCount !== view.timeline.length ||
        view.audit.chainRootDigest !== view.timeline[0]?.eventDigest ||
        view.audit.chainHeadDigest !== identity.latestEventDigest ||
        !isAgentCanonicalDigest(view.audit.exportDigest))
    ) {
      return false;
    }
    const { viewDigest: _viewDigest, ...base } = view;
    return digestAgentCanonicalValue(base) === view.viewDigest;
  } catch {
    return false;
  }
};

export const projectAgentProductReviewArtifacts = (
  input: Readonly<{
    proposalId: string;
    previewId: string;
    semanticDiff: AgentJsonValue;
    impact: AgentJsonValue;
    verificationPlan: AgentJsonValue;
    permissions: readonly AgentProductProposalReview['permissions'][number][];
    risks: AgentProductProposalReview['risks'];
    reverseTransactionDigest: string;
    rollbackAuthorization: AgentProductProposalReview['rollback']['authorization'];
  }>
): AgentProductProposalReview =>
  createAgentProductProposalReview({
    proposalId: input.proposalId,
    previewId: input.previewId,
    semanticDiff: input.semanticDiff,
    semanticDiffDigest: digestAgentCanonicalValue(input.semanticDiff),
    impact: input.impact,
    impactDigest: digestAgentCanonicalValue(input.impact),
    verificationPlan: input.verificationPlan,
    verificationPlanDigest: digestAgentCanonicalValue(input.verificationPlan),
    permissions: input.permissions,
    risks: input.risks,
    rollback: Object.freeze({
      reverseTransactionDigest: input.reverseTransactionDigest,
      authorization: input.rollbackAuthorization,
    }),
  });

export const productRevisionDigest = (
  revision: AgentWorkspaceRevisionVector
): string => digestAgentCanonicalValue(canonicalRevision(revision));

export const productJson = (value: AgentJsonValue): AgentJsonValue => {
  assertSafeProductValue(value, 'Agent product JSON');
  return cloneAgentControlJson(value);
};
