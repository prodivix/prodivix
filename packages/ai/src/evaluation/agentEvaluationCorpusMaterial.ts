import {
  canonicalJsonText,
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import { isPlainObject } from '@prodivix/shared/safety';
import {
  cloneAgentControlJson,
  hasExactAgentControlKeys,
  isAgentControlIdentity,
  inspectAgentControlJson,
} from '../control/agentControlValidation';
import type { AgentJsonValue, CanonicalDigest } from '../domain/agent.types';
import {
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
} from '../domain/agentCanonical';
import { isAgentActionDescriptor } from '../proposal/agentActionRegistry';
import type {
  AgentEvaluationCorpusAccess,
  AgentModelEvaluationCase,
} from './agentEvaluation.types';
import { scanAndRedactAgentEvaluationPublicArtifact } from './agentEvaluationArtifactGuard';
import type {
  AgentEvaluationCaseMaterial,
  AgentEvaluationCorpusMaterialCatalog,
  AgentEvaluationCorpusMaterialCatalogEntry,
  AgentEvaluationCorpusMaterialCatalogEntryRef,
  AgentEvaluationDeterministicGraderMaterial,
  AgentEvaluationExpectedAuthorityMaterial,
  AgentEvaluationInvocationMaterial,
  AgentEvaluationProtectedMaterialScope,
  AgentEvaluationPublicMaterialCatalogBasis,
  AgentEvaluationRestrictedMaterialLocator,
  AgentEvaluationRestrictedMaterialSource,
  AgentEvaluationWorkspaceActionFixture,
  AgentEvaluationWorkspaceFixtureDocument,
  AgentEvaluationWorkspaceFixtureMaterial,
} from './agentEvaluationCorpusMaterial.types';

const maximumMaterialBytes = 2_097_152;
const maximumInputBlocks = 64;
const maximumContextItems = 256;
const maximumTools = 64;
const maximumFixtureDocuments = 32;
const maximumFixtureActions = 64;
const maximumFixtureCapabilities = 32;
const maximumChecks = 256;
const maximumInlineBase64Units = 1_398_104;
const maximumTextUnits = 524_288;
const maximumProtectedCanaries = 128;
const materialAuthorities = new Set([
  'system-policy',
  'canonical-workspace',
  'user-provided',
  'external-untrusted',
]);
const materialInstructionBoundaries = new Set(['developer', 'data-only']);
const deterministicGraderKinds = new Set([
  'strict-schema',
  'exact-target',
  'allowed-action',
  'forbidden-action',
  'required-source',
  'expected-diagnostic',
  'g3-plan',
  'g3-closure',
]);
const toolEffects = new Set([
  'read-only',
  'proposal-only',
  'transaction-only',
  'verification-only',
]);

const cloneAndFreeze = <T>(value: T): T => {
  const clone = cloneAgentControlJson(value);
  const freeze = (candidate: unknown): void => {
    if (candidate === null || typeof candidate !== 'object') return;
    if (Array.isArray(candidate)) {
      candidate.forEach(freeze);
      Object.freeze(candidate);
      return;
    }
    for (const child of Object.values(candidate as Record<string, unknown>)) {
      freeze(child);
    }
    Object.freeze(candidate);
  };
  freeze(clone);
  return clone;
};

const assertIdentity = (value: string, label: string): void => {
  if (!isAgentControlIdentity(value)) {
    throw new TypeError(`${label} is not a bounded canonical identity.`);
  }
};

const assertDigest = (value: string, label: string): void => {
  if (!isAgentCanonicalDigest(value)) {
    throw new TypeError(`${label} is not a canonical digest.`);
  }
};

const assertBoundedJson = (value: unknown, label: string): void => {
  if (inspectAgentControlJson(value, maximumMaterialBytes).length > 0) {
    throw new TypeError(`${label} is not bounded safe JSON.`);
  }
};

const assertUniqueIdentities = (
  values: readonly string[],
  label: string,
  allowEmpty = true
): readonly string[] => {
  if (
    (!allowEmpty && values.length === 0) ||
    new Set(values).size !== values.length ||
    values.some((value) => !isAgentControlIdentity(value))
  ) {
    throw new TypeError(`${label} must contain unique bounded identities.`);
  }
  return Object.freeze([...values].sort(compareUnicodeCodePoints));
};

const assertExactCaseDigest = (value: AgentModelEvaluationCase): void => {
  const { caseDigest, ...base } = value;
  assertDigest(caseDigest, 'Evaluation case digest');
  if (
    !['public', 'protected-holdout', 'rotating-counterexample'].includes(
      value.access
    ) ||
    digestAgentCanonicalValue(base) !== caseDigest
  ) {
    throw new TypeError('Evaluation case digest drifted from its definition.');
  }
};

const assertBase64 = (value: string, label: string): void => {
  if (
    value.length === 0 ||
    value.length > maximumInlineBase64Units ||
    value.length % 4 !== 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(
      value
    )
  ) {
    throw new TypeError(`${label} is not bounded canonical base64.`);
  }
};

export const digestAgentEvaluationInlinePayload = (
  mediaType: string,
  bytesBase64: string
): CanonicalDigest => digestAgentCanonicalValue({ mediaType, bytesBase64 });

const boundedFixtureCount = (
  value: unknown,
  maximum = 1_000_000
): value is number =>
  typeof value === 'number' &&
  Number.isSafeInteger(value) &&
  value >= 0 &&
  value <= maximum;

const canonicalizeWorkspaceFixture = (
  value: AgentEvaluationWorkspaceFixtureMaterial
): AgentEvaluationWorkspaceFixtureMaterial => {
  if (
    !hasExactAgentControlKeys(
      value,
      [
        'format',
        'version',
        'scenarioId',
        'domainOwner',
        'frameworkTarget',
        'snapshot',
        'workspaceSnapshot',
        'workspaceSnapshotDigest',
        'targetRefs',
        'sourceRefs',
        'actionRegistryId',
        'actionRegistryDigest',
        'actionRegistry',
        'capabilities',
        'expectedOutcome',
        'verificationFixture',
        'fixtureDigest',
      ],
      ['visualOracle', 'documentOracle']
    ) ||
    value.format !== 'prodivix.agent-evaluation-workspace-fixture' ||
    value.version !== 1 ||
    !isAgentControlIdentity(value.scenarioId) ||
    !isAgentControlIdentity(value.domainOwner) ||
    !['react-vite', 'vue-vite', 'pir-runtime'].includes(
      value.frameworkTarget
    ) ||
    !hasExactAgentControlKeys(value.snapshot, [
      'workspaceId',
      'workspaceName',
      'workspaceRev',
      'routeRev',
      'opSeq',
      'routeNodeId',
      'routePath',
      'activeDocumentId',
      'documents',
      'snapshotDigest',
    ]) ||
    !Array.isArray(value.snapshot.documents) ||
    value.snapshot.documents.length < 1 ||
    value.snapshot.documents.length > maximumFixtureDocuments ||
    !Array.isArray(value.targetRefs) ||
    !Array.isArray(value.sourceRefs) ||
    !Array.isArray(value.actionRegistry) ||
    value.actionRegistry.length > maximumFixtureActions ||
    !Array.isArray(value.capabilities) ||
    value.capabilities.length < 1 ||
    value.capabilities.length > maximumFixtureCapabilities ||
    !hasExactAgentControlKeys(value.expectedOutcome, [
      'proposal',
      'transaction',
      'verification',
    ])
  ) {
    throw new TypeError('Evaluation Workspace fixture shape is invalid.');
  }
  const documents: readonly AgentEvaluationWorkspaceFixtureDocument[] =
    value.snapshot.documents.map((document) => {
      if (
        !hasExactAgentControlKeys(document, [
          'documentId',
          'documentType',
          'path',
          'contentRev',
          'metaRev',
          'content',
          'contentDigest',
        ]) ||
        !isAgentControlIdentity(document.documentId) ||
        !isAgentControlIdentity(document.documentType) ||
        !isAgentControlIdentity(document.path) ||
        !boundedFixtureCount(document.contentRev) ||
        document.contentRev < 1 ||
        !boundedFixtureCount(document.metaRev) ||
        document.metaRev < 1 ||
        inspectAgentControlJson(document.content, maximumMaterialBytes).length >
          0 ||
        !isAgentCanonicalDigest(document.contentDigest) ||
        document.contentDigest !== digestAgentCanonicalValue(document.content)
      ) {
        throw new TypeError(
          'Evaluation Workspace fixture document is invalid.'
        );
      }
      return document as AgentEvaluationWorkspaceFixtureDocument;
    });
  const documentIds = documents.map(({ documentId }) => documentId);
  if (
    new Set(documentIds).size !== documentIds.length ||
    !isAgentControlIdentity(value.snapshot.workspaceId) ||
    typeof value.snapshot.workspaceName !== 'string' ||
    value.snapshot.workspaceName.length < 1 ||
    value.snapshot.workspaceName.length > 256 ||
    !boundedFixtureCount(value.snapshot.workspaceRev) ||
    value.snapshot.workspaceRev < 1 ||
    !boundedFixtureCount(value.snapshot.routeRev) ||
    value.snapshot.routeRev < 1 ||
    !boundedFixtureCount(value.snapshot.opSeq) ||
    value.snapshot.opSeq < 1 ||
    !isAgentControlIdentity(value.snapshot.routeNodeId) ||
    typeof value.snapshot.routePath !== 'string' ||
    !/^\/[a-z0-9][a-z0-9/-]{0,254}$/u.test(value.snapshot.routePath) ||
    !documentIds.includes(value.snapshot.activeDocumentId) ||
    !isAgentCanonicalDigest(value.snapshot.snapshotDigest)
  ) {
    throw new TypeError('Evaluation Workspace fixture snapshot is invalid.');
  }
  const snapshotBase = Object.freeze({
    workspaceId: value.snapshot.workspaceId,
    workspaceName: value.snapshot.workspaceName,
    workspaceRev: value.snapshot.workspaceRev,
    routeRev: value.snapshot.routeRev,
    opSeq: value.snapshot.opSeq,
    routeNodeId: value.snapshot.routeNodeId,
    routePath: value.snapshot.routePath,
    activeDocumentId: value.snapshot.activeDocumentId,
    documents,
  });
  if (
    value.snapshot.snapshotDigest !== digestAgentCanonicalValue(snapshotBase)
  ) {
    throw new TypeError('Evaluation Workspace fixture snapshot drifted.');
  }
  if (
    !hasExactAgentControlKeys(value.workspaceSnapshot, [
      'id',
      'name',
      'workspaceRev',
      'routeRev',
      'opSeq',
      'treeRootId',
      'treeById',
      'docsById',
      'routeManifest',
      'activeDocumentId',
      'activeRouteNodeId',
    ])
  ) {
    throw new TypeError(
      'Evaluation exact Workspace snapshot shape is invalid.'
    );
  }
  if (
    value.workspaceSnapshot.id !== value.snapshot.workspaceId ||
    value.workspaceSnapshot.name !== value.snapshot.workspaceName ||
    value.workspaceSnapshot.workspaceRev !== value.snapshot.workspaceRev ||
    value.workspaceSnapshot.routeRev !== value.snapshot.routeRev ||
    value.workspaceSnapshot.opSeq !== value.snapshot.opSeq ||
    value.workspaceSnapshot.activeDocumentId !==
      value.snapshot.activeDocumentId ||
    value.workspaceSnapshot.activeRouteNodeId !== value.snapshot.routeNodeId
  ) {
    throw new TypeError(
      'Evaluation exact Workspace snapshot binding is invalid.'
    );
  }
  if (
    !isAgentControlIdentity(value.workspaceSnapshot.treeRootId) ||
    !isPlainObject(value.workspaceSnapshot.treeById) ||
    !isPlainObject(value.workspaceSnapshot.docsById) ||
    !isPlainObject(value.workspaceSnapshot.routeManifest)
  ) {
    throw new TypeError(
      'Evaluation exact Workspace snapshot graph is invalid.'
    );
  }
  const workspaceSnapshotIssues = inspectAgentControlJson(
    value.workspaceSnapshot,
    maximumMaterialBytes
  );
  if (workspaceSnapshotIssues.length > 0) {
    throw new TypeError(
      `Evaluation exact Workspace snapshot JSON is invalid (${workspaceSnapshotIssues[0]!.code} at ${workspaceSnapshotIssues[0]!.path}).`
    );
  }
  if (
    !isAgentCanonicalDigest(value.workspaceSnapshotDigest) ||
    value.workspaceSnapshotDigest !==
      digestAgentCanonicalValue(value.workspaceSnapshot)
  ) {
    throw new TypeError(
      'Evaluation exact Workspace snapshot digest is invalid.'
    );
  }
  for (const document of documents) {
    const workspaceDocument =
      value.workspaceSnapshot.docsById[document.documentId];
    if (
      workspaceDocument !== undefined &&
      (!isPlainObject(workspaceDocument) ||
        workspaceDocument.id !== document.documentId ||
        workspaceDocument.type !== document.documentType ||
        workspaceDocument.path !== `/${document.path}` ||
        workspaceDocument.contentRev !== document.contentRev ||
        workspaceDocument.metaRev !== document.metaRev ||
        !sameCanonicalJson(workspaceDocument.content, document.content))
    ) {
      throw new TypeError('Evaluation Workspace projection drifted.');
    }
  }
  const targetRefs = assertUniqueIdentities(
    value.targetRefs,
    'Evaluation fixture target refs',
    false
  );
  const sourceRefs = assertUniqueIdentities(
    value.sourceRefs,
    'Evaluation fixture source refs',
    false
  );
  assertIdentity(value.actionRegistryId, 'Evaluation action registry id');
  assertDigest(value.actionRegistryDigest, 'Evaluation action registry digest');
  const actions: readonly AgentEvaluationWorkspaceActionFixture[] =
    value.actionRegistry.map((action) => {
      if (
        !hasExactAgentControlKeys(action, [
          'actionId',
          'targetRef',
          'argumentSchema',
          'descriptor',
          'action',
          'actionDigest',
          'descriptorDigest',
        ]) ||
        !isAgentControlIdentity(action.actionId) ||
        typeof action.targetRef !== 'string' ||
        !targetRefs.includes(action.targetRef) ||
        inspectAgentControlJson(action.argumentSchema, maximumMaterialBytes)
          .length > 0 ||
        !isAgentActionDescriptor(action.descriptor) ||
        !hasExactAgentControlKeys(action.action, [
          'ownerId',
          'actionType',
          'inputSchemaId',
          'target',
          'input',
        ]) ||
        !hasExactAgentControlKeys(action.action.target, ['kind', 'id']) ||
        (action.action.target.kind !== 'document' &&
          action.action.target.kind !== 'semantic-target') ||
        action.action.target.id !== action.targetRef ||
        action.actionId !== action.descriptor.descriptorId ||
        action.action.ownerId !== action.descriptor.ownerId ||
        action.action.actionType !== action.descriptor.actionType ||
        action.action.inputSchemaId !== action.descriptor.inputSchemaId ||
        !action.descriptor.allowedTargetKinds.includes(
          action.action.target.kind
        ) ||
        !isAgentCanonicalDigest(action.actionDigest) ||
        action.actionDigest !== digestAgentCanonicalValue(action.action) ||
        !isAgentCanonicalDigest(action.descriptorDigest)
      ) {
        throw new TypeError('Evaluation fixture action descriptor is invalid.');
      }
      if (action.descriptorDigest !== action.descriptor.descriptorDigest) {
        throw new TypeError('Evaluation fixture action descriptor drifted.');
      }
      return action as AgentEvaluationWorkspaceActionFixture;
    });
  if (
    new Set(actions.map(({ actionId }) => actionId)).size !== actions.length
  ) {
    throw new TypeError('Evaluation fixture action ids are duplicated.');
  }
  const capabilities = value.capabilities.map((capability) => {
    if (
      !hasExactAgentControlKeys(capability, [
        'capabilityId',
        'support',
        'toolIds',
        'expectedReceiptKinds',
        'descriptorDigest',
      ]) ||
      !isAgentControlIdentity(capability.capabilityId) ||
      typeof capability.support !== 'string' ||
      !['required', 'expected-blocked'].includes(capability.support) ||
      !Array.isArray(capability.toolIds) ||
      !Array.isArray(capability.expectedReceiptKinds) ||
      !isAgentCanonicalDigest(capability.descriptorDigest)
    ) {
      throw new TypeError('Evaluation fixture capability is invalid.');
    }
    const toolIds = assertUniqueIdentities(
      capability.toolIds,
      'Evaluation fixture capability tools'
    );
    const expectedReceiptKinds = assertUniqueIdentities(
      capability.expectedReceiptKinds,
      'Evaluation fixture receipt kinds',
      false
    );
    const base = Object.freeze({
      capabilityId: capability.capabilityId,
      support: capability.support,
      toolIds,
      expectedReceiptKinds,
    });
    if (capability.descriptorDigest !== digestAgentCanonicalValue(base)) {
      throw new TypeError('Evaluation fixture capability drifted.');
    }
    return capability;
  });
  if (
    new Set(capabilities.map(({ capabilityId }) => capabilityId)).size !==
    capabilities.length
  ) {
    throw new TypeError('Evaluation fixture capabilities are duplicated.');
  }
  const proposal = value.expectedOutcome.proposal;
  const transaction = value.expectedOutcome.transaction;
  const verification = value.expectedOutcome.verification;
  const validProposal = (() => {
    if (
      !targetRefs.includes(proposal.targetRef) ||
      !Array.isArray(proposal.sourceRefs) ||
      proposal.sourceRefs.length !== sourceRefs.length ||
      proposal.sourceRefs.some(
        (sourceRef) => !sourceRefs.includes(sourceRef)
      ) ||
      !isAgentCanonicalDigest(proposal.proposalInputDigest)
    ) {
      return false;
    }
    const { proposalInputDigest, ...base } = proposal;
    if (proposalInputDigest !== digestAgentCanonicalValue(base)) return false;
    if (proposal.status === 'ready') {
      return (
        hasExactAgentControlKeys(proposal, [
          'status',
          'actionId',
          'targetRef',
          'arguments',
          'sourceRefs',
          'proposalInputDigest',
        ]) &&
        actions.length === 1 &&
        actions[0]!.actionId === proposal.actionId &&
        sameCanonicalJson(actions[0]!.action.input, proposal.arguments) &&
        inspectAgentControlJson(proposal.arguments, maximumMaterialBytes)
          .length === 0
      );
    }
    return (
      proposal.status === 'blocked' &&
      hasExactAgentControlKeys(proposal, [
        'status',
        'unavailableCapabilityId',
        'diagnosticCode',
        'targetRef',
        'sourceRefs',
        'proposalInputDigest',
      ]) &&
      actions.length === 0 &&
      isAgentControlIdentity(proposal.unavailableCapabilityId) &&
      proposal.diagnosticCode === 'AI-5005'
    );
  })();
  if (
    !validProposal ||
    !hasExactAgentControlKeys(transaction, [
      'expectedCommandCount',
      'expectedTransactionCount',
      'changedDocumentIds',
      'transactionPolicyDigest',
    ]) ||
    !boundedFixtureCount(transaction.expectedCommandCount) ||
    !boundedFixtureCount(transaction.expectedTransactionCount) ||
    !Array.isArray(transaction.changedDocumentIds) ||
    transaction.changedDocumentIds.some(
      (documentId) => !documentIds.includes(documentId)
    ) ||
    !isAgentCanonicalDigest(transaction.transactionPolicyDigest) ||
    !hasExactAgentControlKeys(verification, [
      'requiredCheckIds',
      'expectedVerdict',
      'planPolicyDigest',
      'closurePolicyDigest',
    ]) ||
    !Array.isArray(verification.requiredCheckIds) ||
    verification.requiredCheckIds.length < 1 ||
    verification.requiredCheckIds.some(
      (checkId) => !isAgentControlIdentity(checkId)
    ) ||
    !['passed', 'failed', 'blocked'].includes(verification.expectedVerdict) ||
    !isAgentCanonicalDigest(verification.planPolicyDigest) ||
    !isAgentCanonicalDigest(verification.closurePolicyDigest)
  ) {
    throw new TypeError('Evaluation fixture expected outcome is invalid.');
  }
  const verificationFixture = value.verificationFixture;
  if (
    !hasExactAgentControlKeys(verificationFixture, [
      'format',
      'version',
      'operationIds',
      'frameworkTargets',
      'runtimeZones',
      'semanticSchemaDigest',
      'providerSetDigest',
      'impactContributor',
      'policy',
      'policyRevision',
      'policyDigest',
      'policyEvaluationInstant',
      'scenarioRegistryDigest',
      'scenarios',
      'checks',
      'adapters',
      'adapterRegistryDigest',
      'compilerDigest',
      'plannerDigest',
      'evidenceRequirements',
      'closureRequirements',
      'verificationFixtureDigest',
    ]) ||
    verificationFixture.format !==
      'prodivix.agent-evaluation-g3-verification-fixture' ||
    verificationFixture.version !== 1 ||
    !Array.isArray(verificationFixture.operationIds) ||
    verificationFixture.operationIds.length < 1 ||
    !Array.isArray(verificationFixture.frameworkTargets) ||
    verificationFixture.frameworkTargets.length < 1 ||
    !Array.isArray(verificationFixture.runtimeZones) ||
    verificationFixture.runtimeZones.length < 1 ||
    !Array.isArray(verificationFixture.scenarios) ||
    verificationFixture.scenarios.length < 1 ||
    !Array.isArray(verificationFixture.checks) ||
    verificationFixture.checks.length < 1 ||
    !Array.isArray(verificationFixture.adapters) ||
    verificationFixture.adapters.length < 1 ||
    !boundedFixtureCount(verificationFixture.policyRevision) ||
    verificationFixture.policyRevision < 1 ||
    !isAgentCanonicalDigest(verificationFixture.semanticSchemaDigest) ||
    !isAgentCanonicalDigest(verificationFixture.providerSetDigest) ||
    !isAgentCanonicalDigest(verificationFixture.policyDigest) ||
    verificationFixture.policyDigest !==
      digestAgentCanonicalValue(verificationFixture.policy) ||
    !isAgentCanonicalDigest(verificationFixture.scenarioRegistryDigest) ||
    !isAgentCanonicalDigest(verificationFixture.adapterRegistryDigest) ||
    !isAgentCanonicalDigest(verificationFixture.compilerDigest) ||
    !isAgentCanonicalDigest(verificationFixture.plannerDigest) ||
    !isAgentCanonicalDigest(verificationFixture.verificationFixtureDigest)
  ) {
    throw new TypeError('Evaluation G3 verification fixture is invalid.');
  }
  const { verificationFixtureDigest, ...verificationFixtureBase } =
    verificationFixture;
  if (
    verificationFixtureDigest !==
    digestAgentCanonicalValue(verificationFixtureBase)
  ) {
    throw new TypeError('Evaluation G3 verification fixture drifted.');
  }
  const validateOracle = (
    oracle: unknown,
    kind: 'visual' | 'document'
  ): void => {
    if (oracle === undefined) return;
    if (!isPlainObject(oracle)) {
      throw new TypeError('Evaluation fixture oracle is invalid.');
    }
    const { oracleDigest, ...base } = oracle;
    if (
      !isAgentCanonicalDigest(oracleDigest) ||
      oracleDigest !== digestAgentCanonicalValue(base) ||
      (kind === 'visual' &&
        !hasExactAgentControlKeys(oracle, [
          'sourceRef',
          'width',
          'height',
          'targetRegions',
          'oracleDigest',
        ])) ||
      (kind === 'document' &&
        !hasExactAgentControlKeys(oracle, [
          'sourceRef',
          'pageRefs',
          'requirementRefs',
          'conflictRefs',
          'untrustedInstructionRefs',
          'oracleDigest',
        ]))
    ) {
      throw new TypeError('Evaluation fixture oracle drifted.');
    }
  };
  validateOracle(value.visualOracle, 'visual');
  validateOracle(value.documentOracle, 'document');
  const { fixtureDigest, ...fixtureBase } = value;
  if (
    !isAgentCanonicalDigest(fixtureDigest) ||
    fixtureDigest !== digestAgentCanonicalValue(fixtureBase)
  ) {
    throw new TypeError('Evaluation Workspace fixture digest drifted.');
  }
  return cloneAndFreeze(value);
};

const canonicalizeInvocation = (
  value: AgentEvaluationInvocationMaterial
): AgentEvaluationInvocationMaterial => {
  if (
    value.blocks.length === 0 ||
    value.blocks.length > maximumInputBlocks ||
    value.contextItems.length === 0 ||
    value.contextItems.length > maximumContextItems ||
    value.tools.length === 0 ||
    value.tools.length > maximumTools
  ) {
    throw new TypeError('Evaluation invocation material exceeds its bounds.');
  }
  const blockIds = value.blocks.map(({ blockId }) => blockId);
  assertUniqueIdentities(blockIds, 'Evaluation input block ids', false);
  if (
    value.blocks.filter(({ kind }) => kind === 'workspace-fixture').length > 1
  ) {
    throw new TypeError(
      'Evaluation invocation accepts at most one exact Workspace fixture.'
    );
  }
  for (const block of value.blocks) {
    if (
      !materialAuthorities.has(block.authority) ||
      !materialInstructionBoundaries.has(block.instructionBoundary) ||
      ((block.authority === 'user-provided' ||
        block.authority === 'external-untrusted') &&
        block.instructionBoundary !== 'data-only')
    ) {
      throw new TypeError('Evaluation input authority boundary is invalid.');
    }
    if (block.kind === 'text') {
      if (
        !['developer', 'user'].includes(block.role) ||
        block.text.length === 0 ||
        block.text.length > maximumTextUnits ||
        (block.role === 'developer' &&
          block.instructionBoundary !== 'developer') ||
        (block.role === 'user' && block.instructionBoundary !== 'data-only')
      ) {
        throw new TypeError('Evaluation text input is invalid.');
      }
      continue;
    }
    if (block.kind === 'tool-result') {
      assertIdentity(block.toolCallId, 'Evaluation tool-call id');
      assertIdentity(block.toolId, 'Evaluation tool id');
      assertDigest(block.resultDigest, 'Evaluation tool-result digest');
      assertBoundedJson(block.result, 'Evaluation tool result');
      if (
        digestAgentCanonicalValue(block.result) !== block.resultDigest ||
        block.instructionBoundary !== 'data-only'
      ) {
        throw new TypeError('Evaluation tool-result binding drifted.');
      }
      continue;
    }
    if (block.kind === 'workspace-fixture') {
      if (
        block.authority !== 'canonical-workspace' ||
        block.instructionBoundary !== 'data-only'
      ) {
        throw new TypeError(
          'Evaluation Workspace fixture authority is invalid.'
        );
      }
      canonicalizeWorkspaceFixture(block.fixture);
      continue;
    }
    if (!['image', 'document'].includes(block.kind)) {
      throw new TypeError('Evaluation input block kind is invalid.');
    }
    assertIdentity(block.sourceRef, 'Evaluation media source reference');
    if (
      !/^[a-z0-9][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*$/u.test(block.mediaType) ||
      block.instructionBoundary !== 'data-only'
    ) {
      throw new TypeError('Evaluation inline media metadata is invalid.');
    }
    assertBase64(block.bytesBase64, 'Evaluation inline media body');
    assertDigest(block.contentDigest, 'Evaluation inline media content digest');
    if (
      digestAgentEvaluationInlinePayload(block.mediaType, block.bytesBase64) !==
      block.contentDigest
    ) {
      throw new TypeError('Evaluation inline media digest drifted.');
    }
  }

  assertUniqueIdentities(
    value.contextItems.map(({ contextItemId }) => contextItemId),
    'Evaluation Context item ids',
    false
  );
  for (const item of value.contextItems) {
    assertIdentity(item.sourceRef, 'Evaluation Context source reference');
    assertDigest(item.contentDigest, 'Evaluation Context content digest');
    if (
      !materialAuthorities.has(item.authority) ||
      !materialInstructionBoundaries.has(item.instructionBoundary) ||
      item.content.length === 0 ||
      item.content.length > maximumTextUnits ||
      digestAgentCanonicalValue(item.content) !== item.contentDigest ||
      ((item.authority === 'user-provided' ||
        item.authority === 'external-untrusted') &&
        item.instructionBoundary !== 'data-only')
    ) {
      throw new TypeError('Evaluation Context material is invalid or drifted.');
    }
  }

  assertUniqueIdentities(
    value.tools.map(({ toolId }) => toolId),
    'Evaluation tool ids',
    false
  );
  for (const tool of value.tools) {
    if (
      tool.description.length === 0 ||
      tool.description.length > 8_192 ||
      !toolEffects.has(tool.effect)
    ) {
      throw new TypeError('Evaluation tool definition is invalid.');
    }
    assertBoundedJson(tool.inputSchema, 'Evaluation tool input schema');
    assertDigest(tool.definitionDigest, 'Evaluation tool definition digest');
    const { definitionDigest, ...base } = tool;
    if (digestAgentCanonicalValue(base) !== definitionDigest) {
      throw new TypeError('Evaluation tool definition digest drifted.');
    }
  }
  return cloneAndFreeze(value);
};

const canonicalizeExpectedAuthority = (
  value: AgentEvaluationExpectedAuthorityMaterial
): AgentEvaluationExpectedAuthorityMaterial => {
  if (
    value.requiredPlan !== 'typed-plan' ||
    value.requiredClosure !== 'g3-closure'
  ) {
    throw new TypeError('Evaluation deterministic authority is incomplete.');
  }
  return cloneAndFreeze({
    ...value,
    exactTargetRefs: assertUniqueIdentities(
      value.exactTargetRefs,
      'Evaluation exact targets',
      false
    ),
    allowedActionIds: assertUniqueIdentities(
      value.allowedActionIds,
      'Evaluation allowed actions'
    ),
    forbiddenActionIds: assertUniqueIdentities(
      value.forbiddenActionIds,
      'Evaluation forbidden actions'
    ),
    requiredContextSourceRefs: assertUniqueIdentities(
      value.requiredContextSourceRefs,
      'Evaluation required Context sources',
      false
    ),
    expectedDiagnosticCodes: assertUniqueIdentities(
      value.expectedDiagnosticCodes,
      'Evaluation expected diagnostics'
    ),
  });
};

const canonicalizeGrader = (
  value: Omit<
    AgentEvaluationDeterministicGraderMaterial,
    'graderMaterialDigest'
  >
): AgentEvaluationDeterministicGraderMaterial => {
  if (
    value.deterministicFirst !== true ||
    value.checks.length === 0 ||
    value.checks.length > maximumChecks ||
    new Set(value.checks.map(({ checkId }) => checkId)).size !==
      value.checks.length
  ) {
    throw new TypeError('Evaluation deterministic grader checks are invalid.');
  }
  const checks = value.checks
    .map((check) => {
      assertIdentity(check.checkId, 'Evaluation grader check id');
      assertIdentity(check.subjectRef, 'Evaluation grader subject reference');
      assertBoundedJson(check.expected, 'Evaluation grader expectation');
      assertDigest(check.checkDigest, 'Evaluation grader check digest');
      const { checkDigest, ...base } = check;
      if (
        !deterministicGraderKinds.has(check.kind) ||
        digestAgentCanonicalValue(base) !== checkDigest
      ) {
        throw new TypeError('Evaluation grader check digest drifted.');
      }
      return cloneAndFreeze(check);
    })
    .sort((left, right) =>
      compareUnicodeCodePoints(left.checkId, right.checkId)
    );
  const base = cloneAndFreeze({
    deterministicFirst: true as const,
    checks: Object.freeze(checks),
  });
  return Object.freeze({
    ...base,
    graderMaterialDigest: digestAgentCanonicalValue(base),
  });
};

const protectedCanarySourceText = (
  input: Readonly<{
    caseDefinitionDigestInput: AgentJsonValue;
    expectedAuthorityDigestInput: AgentJsonValue;
    gradingPolicyDigestInput: AgentJsonValue;
    invocation: AgentEvaluationInvocationMaterial;
    expectedAuthority: AgentEvaluationExpectedAuthorityMaterial;
    grader: AgentEvaluationDeterministicGraderMaterial;
  }>
): string => canonicalJsonText(input);

const trustedCaseMaterials = new WeakSet<object>();

export const createAgentEvaluationCaseMaterial = (
  input: Readonly<{
    caseDefinition: AgentModelEvaluationCase;
    caseDefinitionDigestInput: AgentJsonValue;
    expectedAuthorityDigestInput: AgentJsonValue;
    gradingPolicyDigestInput: AgentJsonValue;
    invocation: AgentEvaluationInvocationMaterial;
    expectedAuthority: AgentEvaluationExpectedAuthorityMaterial;
    grader: Omit<
      AgentEvaluationDeterministicGraderMaterial,
      'graderMaterialDigest'
    >;
    protectedLeakCanaries?: readonly string[];
  }>
): AgentEvaluationCaseMaterial => {
  const evaluationCase = input.caseDefinition;
  assertExactCaseDigest(evaluationCase);
  for (const [label, value, expected] of [
    [
      'Case definition',
      input.caseDefinitionDigestInput,
      evaluationCase.caseDefinitionDigest,
    ],
    [
      'Expected authority',
      input.expectedAuthorityDigestInput,
      evaluationCase.expectedAuthorityDigest,
    ],
    [
      'Grading policy',
      input.gradingPolicyDigestInput,
      evaluationCase.gradingPolicyDigest,
    ],
  ] as const) {
    assertBoundedJson(value, `${label} digest input`);
    if (digestAgentCanonicalValue(value) !== expected) {
      throw new TypeError(
        `${label} digest input drifted from the frozen case.`
      );
    }
  }
  const invocation = canonicalizeInvocation(input.invocation);
  const expectedAuthority = canonicalizeExpectedAuthority(
    input.expectedAuthority
  );
  const grader = canonicalizeGrader(input.grader);
  const protectedLeakCanaries = Object.freeze([
    ...(input.protectedLeakCanaries ?? []),
  ]);
  if (
    new Set(protectedLeakCanaries).size !== protectedLeakCanaries.length ||
    protectedLeakCanaries.length > maximumProtectedCanaries ||
    protectedLeakCanaries.some(
      (canary) =>
        typeof canary !== 'string' || canary.length < 8 || canary.length > 8_192
    ) ||
    (evaluationCase.access === 'public' &&
      protectedLeakCanaries.length !== 0) ||
    (evaluationCase.access !== 'public' && protectedLeakCanaries.length === 0)
  ) {
    throw new TypeError(
      'Evaluation protected-material canaries violate the access boundary.'
    );
  }
  const sensitiveSource = protectedCanarySourceText({
    caseDefinitionDigestInput: input.caseDefinitionDigestInput,
    expectedAuthorityDigestInput: input.expectedAuthorityDigestInput,
    gradingPolicyDigestInput: input.gradingPolicyDigestInput,
    invocation,
    expectedAuthority,
    grader,
  });
  if (
    protectedLeakCanaries.some((canary) => !sensitiveSource.includes(canary))
  ) {
    throw new TypeError(
      'Every protected-material canary must bind actual restricted material.'
    );
  }
  const base = cloneAndFreeze({
    caseId: evaluationCase.caseId,
    caseDigest: evaluationCase.caseDigest,
    access: evaluationCase.access,
    capabilityProfileId: evaluationCase.capabilityProfileId,
    capabilityDescriptorDigest: evaluationCase.capabilityDescriptorDigest,
    fixtureRef: evaluationCase.fixtureRef,
    caseDefinitionDigest: evaluationCase.caseDefinitionDigest,
    expectedAuthorityDigest: evaluationCase.expectedAuthorityDigest,
    gradingPolicyDigest: evaluationCase.gradingPolicyDigest,
    caseDefinitionDigestInput: input.caseDefinitionDigestInput,
    expectedAuthorityDigestInput: input.expectedAuthorityDigestInput,
    gradingPolicyDigestInput: input.gradingPolicyDigestInput,
    invocation,
    expectedAuthority,
    grader,
    protectedLeakCanaries,
  });
  assertBoundedJson(base, 'Evaluation case material');
  const material = Object.freeze({
    ...base,
    materialDigest: digestAgentCanonicalValue(base),
  });
  trustedCaseMaterials.add(material);
  return material;
};

const verifyMaterialAgainstCase = (
  material: AgentEvaluationCaseMaterial,
  evaluationCase: AgentModelEvaluationCase
): void => {
  if (
    material.caseId !== evaluationCase.caseId ||
    material.caseDigest !== evaluationCase.caseDigest ||
    material.access !== evaluationCase.access ||
    material.capabilityProfileId !== evaluationCase.capabilityProfileId ||
    material.capabilityDescriptorDigest !==
      evaluationCase.capabilityDescriptorDigest ||
    material.fixtureRef !== evaluationCase.fixtureRef ||
    material.caseDefinitionDigest !== evaluationCase.caseDefinitionDigest ||
    material.expectedAuthorityDigest !==
      evaluationCase.expectedAuthorityDigest ||
    material.gradingPolicyDigest !== evaluationCase.gradingPolicyDigest
  ) {
    throw new TypeError('Evaluation case material binding drifted.');
  }
  if (evaluationCase.access === 'public') {
    const workspaceFixtureBlocks = material.invocation.blocks.filter(
      (block) => block.kind === 'workspace-fixture'
    );
    if (
      workspaceFixtureBlocks.length !== 1 ||
      workspaceFixtureBlocks[0]!.fixture.capabilities.length !== 1 ||
      workspaceFixtureBlocks[0]!.fixture.capabilities[0]!.descriptorDigest !==
        evaluationCase.capabilityDescriptorDigest
    ) {
      throw new TypeError(
        'Public evaluation material requires one exact capability-bound Workspace fixture.'
      );
    }
  }
  if (trustedCaseMaterials.has(material)) return;
  const recreated = createAgentEvaluationCaseMaterial({
    caseDefinition: evaluationCase,
    caseDefinitionDigestInput: material.caseDefinitionDigestInput,
    expectedAuthorityDigestInput: material.expectedAuthorityDigestInput,
    gradingPolicyDigestInput: material.gradingPolicyDigestInput,
    invocation: material.invocation,
    expectedAuthority: material.expectedAuthority,
    grader: {
      deterministicFirst: material.grader.deterministicFirst,
      checks: material.grader.checks,
    },
    protectedLeakCanaries: material.protectedLeakCanaries,
  });
  if (recreated.materialDigest !== material.materialDigest) {
    throw new TypeError('Evaluation case material digest drifted.');
  }
};

export const createAgentEvaluationRestrictedMaterialLocator = (
  evaluationCase: AgentModelEvaluationCase,
  input: Readonly<{
    resolverRef: string;
    encryptedMaterialDigest: CanonicalDigest;
    encryptionPolicyDigest: CanonicalDigest;
  }>
): AgentEvaluationRestrictedMaterialLocator => {
  assertExactCaseDigest(evaluationCase);
  if (evaluationCase.access === 'public') {
    throw new TypeError('Public evaluation material cannot use a resolver.');
  }
  assertIdentity(input.resolverRef, 'Evaluation restricted resolver reference');
  assertDigest(
    input.encryptedMaterialDigest,
    'Evaluation encrypted material digest'
  );
  assertDigest(
    input.encryptionPolicyDigest,
    'Evaluation encryption policy digest'
  );
  const base = Object.freeze({
    caseId: evaluationCase.caseId,
    caseDigest: evaluationCase.caseDigest,
    access: evaluationCase.access,
    capabilityDescriptorDigest: evaluationCase.capabilityDescriptorDigest,
    caseDefinitionDigest: evaluationCase.caseDefinitionDigest,
    expectedAuthorityDigest: evaluationCase.expectedAuthorityDigest,
    gradingPolicyDigest: evaluationCase.gradingPolicyDigest,
    ...input,
  });
  return Object.freeze({
    ...base,
    locatorDigest: digestAgentCanonicalValue(base),
  });
};

const verifyLocatorAgainstCase = (
  locator: AgentEvaluationRestrictedMaterialLocator,
  evaluationCase: AgentModelEvaluationCase
): void => {
  const recreated = createAgentEvaluationRestrictedMaterialLocator(
    evaluationCase,
    {
      resolverRef: locator.resolverRef,
      encryptedMaterialDigest: locator.encryptedMaterialDigest,
      encryptionPolicyDigest: locator.encryptionPolicyDigest,
    }
  );
  if (recreated.locatorDigest !== locator.locatorDigest) {
    throw new TypeError('Evaluation restricted material locator drifted.');
  }
};

const trustedPublicMaterialCatalogBases = new WeakSet<object>();
const trustedMaterialCatalogs = new WeakSet<object>();

const createEvaluationCaseRefs = (
  cases: readonly AgentModelEvaluationCase[]
): readonly Readonly<{
  caseId: string;
  caseDigest: CanonicalDigest;
  access: AgentEvaluationCorpusAccess;
}>[] => {
  if (cases.length === 0) {
    throw new TypeError('Evaluation material catalog requires cases.');
  }
  const caseIds = cases.map(({ caseId }) => caseId);
  if (new Set(caseIds).size !== caseIds.length) {
    throw new TypeError('Evaluation material catalog case ids are duplicated.');
  }
  cases.forEach(assertExactCaseDigest);
  return Object.freeze(
    cases
      .map(({ caseId, caseDigest, access }) =>
        Object.freeze({ caseId, caseDigest, access })
      )
      .sort((left, right) =>
        compareUnicodeCodePoints(left.caseId, right.caseId)
      )
  );
};

/**
 * Validates the large public bodies once and freezes a process-bound basis.
 * The returned capability is intentionally non-serializable: callers cannot
 * self-assert that an unvalidated body is prevalidated by recreating its JSON.
 */
export const createAgentEvaluationPublicMaterialCatalogBasis = (
  cases: readonly AgentModelEvaluationCase[],
  publicMaterials: readonly AgentEvaluationCaseMaterial[]
): AgentEvaluationPublicMaterialCatalogBasis => {
  const caseRefs = createEvaluationCaseRefs(cases);
  const caseById = new Map(cases.map((entry) => [entry.caseId, entry]));
  const publicCases = cases.filter(({ access }) => access === 'public');
  const suppliedIds = publicMaterials.map(({ caseId }) => caseId);
  if (
    suppliedIds.length !== publicCases.length ||
    new Set(suppliedIds).size !== suppliedIds.length ||
    suppliedIds.some((caseId) => caseById.get(caseId)?.access !== 'public')
  ) {
    throw new TypeError(
      'Evaluation public material coverage must match public case ids one-to-one.'
    );
  }
  const publicEntries = publicMaterials
    .map((material) => {
      const evaluationCase = caseById.get(material.caseId)!;
      if (material.access !== 'public') {
        throw new TypeError(
          'Evaluation public material access does not match its case.'
        );
      }
      verifyMaterialAgainstCase(material, evaluationCase);
      return Object.freeze({
        kind: 'public-material',
        caseId: material.caseId,
        access: 'public',
        caseDigest: material.caseDigest,
        materialDigest: material.materialDigest,
        material,
      } as const);
    })
    .sort((left, right) => compareUnicodeCodePoints(left.caseId, right.caseId));
  const publicEntryRefs = Object.freeze(
    publicEntries.map(({ kind, caseId, access, caseDigest, materialDigest }) =>
      Object.freeze({ kind, caseId, access, caseDigest, materialDigest })
    )
  );
  const caseSetDigest = digestAgentCanonicalValue(caseRefs);
  const publicMaterialSetDigest = digestAgentCanonicalValue(
    publicEntryRefs.map(({ caseId, materialDigest }) => ({
      caseId,
      materialDigest,
    }))
  );
  const base = Object.freeze({
    format: 'prodivix.agent-evaluation-public-material-catalog-basis' as const,
    version: 1 as const,
    caseRefs,
    publicEntryRefs,
    caseSetDigest,
    publicMaterialSetDigest,
  });
  const basis = Object.freeze({
    ...base,
    publicEntries: Object.freeze(publicEntries),
    basisDigest: digestAgentCanonicalValue(base),
  });
  trustedPublicMaterialCatalogBases.add(basis);
  return basis;
};

export const createAgentEvaluationCorpusMaterialCatalogFromPublicBasis = (
  cases: readonly AgentModelEvaluationCase[],
  publicBasis: AgentEvaluationPublicMaterialCatalogBasis,
  restrictedLocators: readonly AgentEvaluationRestrictedMaterialLocator[]
): AgentEvaluationCorpusMaterialCatalog => {
  if (!trustedPublicMaterialCatalogBases.has(publicBasis)) {
    throw new TypeError(
      'Evaluation public material basis was not validated in this process.'
    );
  }
  const caseRefs = createEvaluationCaseRefs(cases);
  const caseSetDigest = digestAgentCanonicalValue(caseRefs);
  if (
    publicBasis.caseSetDigest !== caseSetDigest ||
    !sameCanonicalJson(publicBasis.caseRefs, caseRefs)
  ) {
    throw new TypeError('Evaluation public material basis case set drifted.');
  }
  const caseById = new Map(cases.map((entry) => [entry.caseId, entry]));
  const restrictedCases = cases.filter(({ access }) => access !== 'public');
  const suppliedIds = [
    ...publicBasis.publicEntries.map(({ caseId }) => caseId),
    ...restrictedLocators.map(({ caseId }) => caseId),
  ];
  if (
    suppliedIds.length !== cases.length ||
    new Set(suppliedIds).size !== suppliedIds.length ||
    suppliedIds.some((caseId) => !caseById.has(caseId)) ||
    restrictedLocators.length !== restrictedCases.length
  ) {
    throw new TypeError(
      'Evaluation material coverage must match case ids one-to-one.'
    );
  }
  const entries: AgentEvaluationCorpusMaterialCatalogEntry[] = [
    ...publicBasis.publicEntries,
  ];
  for (const locator of restrictedLocators) {
    const evaluationCase = caseById.get(locator.caseId)!;
    if (
      evaluationCase.access === 'public' ||
      locator.access !== evaluationCase.access
    ) {
      throw new TypeError(
        'Evaluation restricted material access does not match its case.'
      );
    }
    verifyLocatorAgainstCase(locator, evaluationCase);
    entries.push(
      Object.freeze({
        kind: 'restricted-material',
        caseId: locator.caseId,
        access: locator.access,
        caseDigest: locator.caseDigest,
        locatorDigest: locator.locatorDigest,
        locator,
      })
    );
  }
  entries.sort((left, right) =>
    compareUnicodeCodePoints(left.caseId, right.caseId)
  );
  const entryRefs: readonly AgentEvaluationCorpusMaterialCatalogEntryRef[] =
    Object.freeze(
      entries.map((entry) =>
        entry.kind === 'public-material'
          ? Object.freeze({
              kind: entry.kind,
              caseId: entry.caseId,
              access: entry.access,
              caseDigest: entry.caseDigest,
              materialDigest: entry.materialDigest,
            })
          : Object.freeze({
              kind: entry.kind,
              caseId: entry.caseId,
              access: entry.access,
              caseDigest: entry.caseDigest,
              locatorDigest: entry.locatorDigest,
            })
      )
    );
  const publicMaterialSetDigest = publicBasis.publicMaterialSetDigest;
  const restrictedMaterialManifestDigest = digestAgentCanonicalValue(
    entryRefs
      .filter(
        (
          entry
        ): entry is Extract<
          AgentEvaluationCorpusMaterialCatalogEntryRef,
          { kind: 'restricted-material' }
        > => entry.kind === 'restricted-material'
      )
      .map(({ caseId, locatorDigest }) => ({ caseId, locatorDigest }))
  );
  const digestBase = Object.freeze({
    entryRefs,
    caseSetDigest,
    publicMaterialSetDigest,
    restrictedMaterialManifestDigest,
  });
  const catalog = Object.freeze({
    entries: Object.freeze(entries),
    ...digestBase,
    catalogDigest: digestAgentCanonicalValue(digestBase),
  });
  trustedMaterialCatalogs.add(catalog);
  return catalog;
};

export const createAgentEvaluationCorpusMaterialCatalog = (
  cases: readonly AgentModelEvaluationCase[],
  publicMaterials: readonly AgentEvaluationCaseMaterial[],
  restrictedLocators: readonly AgentEvaluationRestrictedMaterialLocator[]
): AgentEvaluationCorpusMaterialCatalog => {
  const basis = createAgentEvaluationPublicMaterialCatalogBasis(
    cases,
    publicMaterials
  );
  return createAgentEvaluationCorpusMaterialCatalogFromPublicBasis(
    cases,
    basis,
    restrictedLocators
  );
};

/**
 * Restricted plaintext is visible only through a revocable scope. The callback
 * must return bounded public facts; canary-bearing output is rejected before it
 * can cross the resolver boundary.
 */
export class CallbackBoundAgentEvaluationMaterialResolver {
  readonly #caseById: ReadonlyMap<string, AgentModelEvaluationCase>;
  readonly #locatorById: ReadonlyMap<
    string,
    AgentEvaluationRestrictedMaterialLocator
  >;
  readonly #source: AgentEvaluationRestrictedMaterialSource;

  constructor(
    cases: readonly AgentModelEvaluationCase[],
    catalog: AgentEvaluationCorpusMaterialCatalog,
    source: AgentEvaluationRestrictedMaterialSource
  ) {
    if (!trustedMaterialCatalogs.has(catalog)) {
      const publicMaterials = catalog.entries.flatMap((entry) =>
        entry.kind === 'public-material' ? [entry.material] : []
      );
      const restrictedLocators = catalog.entries.flatMap((entry) =>
        entry.kind === 'restricted-material' ? [entry.locator] : []
      );
      const verifiedCatalog = createAgentEvaluationCorpusMaterialCatalog(
        cases,
        publicMaterials,
        restrictedLocators
      );
      if (verifiedCatalog.catalogDigest !== catalog.catalogDigest) {
        throw new TypeError('Evaluation material catalog digest drifted.');
      }
    }
    this.#caseById = new Map(cases.map((entry) => [entry.caseId, entry]));
    this.#locatorById = new Map(
      catalog.entries.flatMap((entry) =>
        entry.kind === 'restricted-material'
          ? ([[entry.caseId, entry.locator]] as const)
          : []
      )
    );
    this.#source = source;
  }

  async use<T extends AgentJsonValue>(
    caseId: string,
    callback: (scope: AgentEvaluationProtectedMaterialScope) => Promise<T>
  ): Promise<T> {
    const evaluationCase = this.#caseById.get(caseId);
    const locator = this.#locatorById.get(caseId);
    if (!evaluationCase || !locator || evaluationCase.access === 'public') {
      throw new Error('Restricted evaluation material is unavailable.');
    }
    return this.#source.use(locator, async (material) => {
      verifyMaterialAgainstCase(material, evaluationCase);
      if (
        material.access !== locator.access ||
        material.caseDigest !== locator.caseDigest
      ) {
        throw new Error('Restricted evaluation material binding drifted.');
      }
      let active = true;
      let activeMaterial: AgentEvaluationCaseMaterial | undefined = material;
      const scope: AgentEvaluationProtectedMaterialScope = Object.freeze({
        caseId,
        access: locator.access,
        read: () => {
          if (!active || !activeMaterial) {
            throw new Error(
              'Restricted evaluation material scope was revoked.'
            );
          }
          return activeMaterial;
        },
      });
      let result: T;
      try {
        result = await callback(scope);
      } finally {
        active = false;
        activeMaterial = undefined;
      }
      const scan = scanAndRedactAgentEvaluationPublicArtifact(
        'artifact',
        result,
        { protectedMaterialCanaries: material.protectedLeakCanaries }
      );
      if (!scan.safe) {
        throw new Error(
          'Restricted evaluation callback result failed the no-leak invariant.'
        );
      }
      return result;
    });
  }
}

export const isAgentEvaluationRestrictedAccess = (
  access: AgentEvaluationCorpusAccess
): access is Exclude<AgentEvaluationCorpusAccess, 'public'> =>
  access === 'protected-holdout' || access === 'rotating-counterexample';

export const isAgentEvaluationMaterialCatalogJsonSafe = (
  value: unknown
): boolean =>
  isPlainObject(value) &&
  inspectAgentControlJson(value, maximumMaterialBytes).length === 0;
