import {
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import {
  isAgentControlIdentity,
  isAgentControlInstant,
} from '../control/agentControlValidation';
import type { CanonicalDigest, Instant } from '../domain/agent.types';
import {
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
} from '../domain/agentCanonical';
import {
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_ACTIVE_STATE_FORMAT,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_COMPONENT_MAXIMUM_BYTES,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_MAXIMUM_READ_RECEIPTS,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_READ_MAXIMUM_LIFETIME_MS,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_READ_MINIMUM_QUERY_LEASE_MS,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_READ_LEASE_LEDGER_ROOT_FORMAT,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_READ_RECEIPT_FORMAT,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_READ_REQUEST_FORMAT,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
  activeStateKeys,
  exact,
  isAgentHostedRetrievalRuntimeResourceAuthority,
  matchAgentHostedRetrievalRuntimeResourceAuthoritySetCommitment,
  readLeaseLedgerRootKeys,
  readReceiptKeys,
  readRequestKeys,
  repositoryCommitPattern,
  safe,
  type AgentHostedRetrievalRuntimeResourceActiveState,
  type AgentHostedRetrievalRuntimeResourceAuthority,
  type AgentHostedRetrievalRuntimeResourceReadLeaseLedgerRoot,
  type AgentHostedRetrievalRuntimeResourceReadReceipt,
  type AgentHostedRetrievalRuntimeResourceReadRequest,
  type AgentHostedRetrievalRuntimeResourceSetCommitment,
} from './agentHostedRetrievalRuntimeResourceRegistration';

export const createAgentHostedRetrievalRuntimeResourceReadRequest = (
  input: Omit<
    AgentHostedRetrievalRuntimeResourceReadRequest,
    'format' | 'requestDigest' | 'version'
  >
): AgentHostedRetrievalRuntimeResourceReadRequest => {
  if (
    !exact(input, readRequestKeys.slice(2, -1)) ||
    ![
      input.namespaceId,
      input.runtimeResourceSetId,
      input.readerOwnerInstanceId,
      input.readLeaseId,
    ].every(isAgentControlIdentity) ||
    !repositoryCommitPattern.test(input.repositoryCommit) ||
    ![
      input.planDigest,
      input.runConfigArtifactBindingDigest,
      input.authorityDigest,
      input.resourceSetCommitmentDigest,
    ].every(isAgentCanonicalDigest) ||
    !isAgentControlInstant(input.minimumExpiresAt)
  ) {
    throw new TypeError('Hosted retrieval runtime read request is invalid.');
  }
  const base = Object.freeze({
    format: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_READ_REQUEST_FORMAT,
    version: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
    ...input,
  });
  return Object.freeze({
    ...base,
    requestDigest: digestAgentCanonicalValue(base),
  });
};

export const isAgentHostedRetrievalRuntimeResourceReadRequest = (
  value: unknown
): value is AgentHostedRetrievalRuntimeResourceReadRequest => {
  if (!exact(value, readRequestKeys)) return false;
  try {
    const {
      format: _format,
      version: _version,
      requestDigest: _digest,
      ...input
    } = value as AgentHostedRetrievalRuntimeResourceReadRequest;
    return sameCanonicalJson(
      value,
      createAgentHostedRetrievalRuntimeResourceReadRequest(input)
    );
  } catch {
    return false;
  }
};

export const createAgentHostedRetrievalRuntimeResourceActiveState = (
  authority: AgentHostedRetrievalRuntimeResourceAuthority,
  commitment: AgentHostedRetrievalRuntimeResourceSetCommitment,
  input: Readonly<{
    activeOwnerInstanceId: string;
    claimGeneration: number;
    readLeaseNotAfter: Instant | null;
    updatedAt: Instant;
  }>
): AgentHostedRetrievalRuntimeResourceActiveState => {
  if (
    !matchAgentHostedRetrievalRuntimeResourceAuthoritySetCommitment(
      commitment,
      authority
    ) ||
    !exact(input, [
      'activeOwnerInstanceId',
      'claimGeneration',
      'readLeaseNotAfter',
      'updatedAt',
    ]) ||
    !isAgentControlIdentity(input.activeOwnerInstanceId) ||
    !Number.isSafeInteger(input.claimGeneration) ||
    input.claimGeneration < 1 ||
    !isAgentControlInstant(input.updatedAt) ||
    (input.readLeaseNotAfter !== null &&
      (!isAgentControlInstant(input.readLeaseNotAfter) ||
        Date.parse(input.readLeaseNotAfter) <= Date.parse(input.updatedAt) ||
        Date.parse(input.readLeaseNotAfter) - Date.parse(input.updatedAt) >
          AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_READ_MAXIMUM_LIFETIME_MS))
  ) {
    throw new TypeError(
      'Hosted retrieval runtime resource active state is invalid.'
    );
  }
  const base = Object.freeze({
    format: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_ACTIVE_STATE_FORMAT,
    version: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
    authorityDigest: authority.authorityDigest,
    resourceSetCommitmentDigest: commitment.commitmentDigest,
    activeOwnerInstanceId: input.activeOwnerInstanceId,
    claimGeneration: input.claimGeneration,
    lifecycle: 'active' as const,
    readLeaseNotAfter: input.readLeaseNotAfter,
    updatedAt: input.updatedAt,
  });
  return Object.freeze({
    ...base,
    stateDigest: digestAgentCanonicalValue(base),
  });
};

export const isAgentHostedRetrievalRuntimeResourceActiveState = (
  value: unknown
): value is AgentHostedRetrievalRuntimeResourceActiveState => {
  if (!exact(value, activeStateKeys)) return false;
  const state = value as AgentHostedRetrievalRuntimeResourceActiveState;
  const { stateDigest, ...base } = state;
  return (
    state.format ===
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_ACTIVE_STATE_FORMAT &&
    state.version === AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION &&
    [
      state.authorityDigest,
      state.resourceSetCommitmentDigest,
      state.stateDigest,
    ].every(isAgentCanonicalDigest) &&
    isAgentControlIdentity(state.activeOwnerInstanceId) &&
    Number.isSafeInteger(state.claimGeneration) &&
    state.claimGeneration >= 1 &&
    state.lifecycle === 'active' &&
    isAgentControlInstant(state.updatedAt) &&
    (state.readLeaseNotAfter === null ||
      (isAgentControlInstant(state.readLeaseNotAfter) &&
        Date.parse(state.readLeaseNotAfter) > Date.parse(state.updatedAt) &&
        Date.parse(state.readLeaseNotAfter) - Date.parse(state.updatedAt) <=
          AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_READ_MAXIMUM_LIFETIME_MS)) &&
    stateDigest === digestAgentCanonicalValue(base) &&
    safe(state, AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_COMPONENT_MAXIMUM_BYTES)
  );
};

export const createAgentHostedRetrievalRuntimeResourceReadReceipt = (
  request: AgentHostedRetrievalRuntimeResourceReadRequest,
  authority: AgentHostedRetrievalRuntimeResourceAuthority,
  commitment: AgentHostedRetrievalRuntimeResourceSetCommitment,
  input: Readonly<{
    activeState: AgentHostedRetrievalRuntimeResourceActiveState;
    checkedAt: Instant;
    expiresAt: Instant;
  }>
): AgentHostedRetrievalRuntimeResourceReadReceipt => {
  if (
    !isAgentHostedRetrievalRuntimeResourceReadRequest(request) ||
    !isAgentHostedRetrievalRuntimeResourceAuthority(authority) ||
    !matchAgentHostedRetrievalRuntimeResourceAuthoritySetCommitment(
      commitment,
      authority
    ) ||
    !exact(input, ['activeState', 'checkedAt', 'expiresAt']) ||
    !isAgentHostedRetrievalRuntimeResourceActiveState(input.activeState) ||
    input.activeState.authorityDigest !== authority.authorityDigest ||
    input.activeState.resourceSetCommitmentDigest !==
      request.resourceSetCommitmentDigest ||
    request.resourceSetCommitmentDigest !== commitment.commitmentDigest ||
    input.activeState.activeOwnerInstanceId !== request.readerOwnerInstanceId ||
    input.activeState.readLeaseNotAfter === null ||
    !isAgentControlInstant(input.checkedAt) ||
    !isAgentControlInstant(input.expiresAt) ||
    request.planDigest !== authority.planDigest ||
    request.runConfigArtifactBindingDigest !==
      authority.runConfigArtifactBindingDigest ||
    request.runtimeResourceSetId !== authority.runtimeResourceSetId ||
    request.authorityDigest !== authority.authorityDigest ||
    Date.parse(input.activeState.updatedAt) > Date.parse(input.checkedAt) ||
    Date.parse(input.activeState.readLeaseNotAfter) <
      Date.parse(input.expiresAt) ||
    Date.parse(input.checkedAt) < Date.parse(authority.registeredAt) ||
    Date.parse(input.checkedAt) >= Date.parse(authority.expiresAt) ||
    Date.parse(input.expiresAt) < Date.parse(request.minimumExpiresAt) ||
    Date.parse(input.expiresAt) > Date.parse(authority.expiresAt) ||
    Date.parse(input.expiresAt) <= Date.parse(input.checkedAt) ||
    Date.parse(input.expiresAt) - Date.parse(input.checkedAt) <
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_READ_MINIMUM_QUERY_LEASE_MS ||
    Date.parse(input.expiresAt) - Date.parse(input.checkedAt) >
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_READ_MAXIMUM_LIFETIME_MS
  ) {
    throw new TypeError('Hosted retrieval runtime read receipt is invalid.');
  }
  const base = Object.freeze({
    format: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_READ_RECEIPT_FORMAT,
    version: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
    readRequestDigest: request.requestDigest,
    planDigest: authority.planDigest,
    runConfigArtifactBindingDigest: authority.runConfigArtifactBindingDigest,
    runtimeResourceSetId: authority.runtimeResourceSetId,
    authorityDigest: authority.authorityDigest,
    resourceSetCommitmentDigest: request.resourceSetCommitmentDigest,
    readLeaseId: request.readLeaseId,
    activeOwnerInstanceId: input.activeState.activeOwnerInstanceId,
    claimGeneration: input.activeState.claimGeneration,
    activeState: input.activeState,
    activeStateDigest: input.activeState.stateDigest,
    lifecycle: 'active' as const,
    checkedAt: input.checkedAt,
    expiresAt: input.expiresAt,
  });
  return Object.freeze({
    ...base,
    receiptDigest: digestAgentCanonicalValue(base),
  });
};

export const isAgentHostedRetrievalRuntimeResourceReadReceipt = (
  value: unknown
): value is AgentHostedRetrievalRuntimeResourceReadReceipt => {
  if (!exact(value, readReceiptKeys)) return false;
  const receipt = value as AgentHostedRetrievalRuntimeResourceReadReceipt;
  const { receiptDigest, ...base } = receipt;
  return (
    receipt.format ===
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_READ_RECEIPT_FORMAT &&
    receipt.version === AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION &&
    [
      receipt.readRequestDigest,
      receipt.planDigest,
      receipt.runConfigArtifactBindingDigest,
      receipt.authorityDigest,
      receipt.resourceSetCommitmentDigest,
      receipt.activeStateDigest,
      receipt.receiptDigest,
    ].every(isAgentCanonicalDigest) &&
    [
      receipt.runtimeResourceSetId,
      receipt.readLeaseId,
      receipt.activeOwnerInstanceId,
    ].every(isAgentControlIdentity) &&
    Number.isSafeInteger(receipt.claimGeneration) &&
    receipt.claimGeneration >= 1 &&
    isAgentHostedRetrievalRuntimeResourceActiveState(receipt.activeState) &&
    receipt.activeStateDigest === receipt.activeState.stateDigest &&
    receipt.activeOwnerInstanceId ===
      receipt.activeState.activeOwnerInstanceId &&
    receipt.claimGeneration === receipt.activeState.claimGeneration &&
    receipt.authorityDigest === receipt.activeState.authorityDigest &&
    receipt.resourceSetCommitmentDigest ===
      receipt.activeState.resourceSetCommitmentDigest &&
    receipt.activeState.readLeaseNotAfter !== null &&
    Date.parse(receipt.activeState.updatedAt) <=
      Date.parse(receipt.checkedAt) &&
    Date.parse(receipt.activeState.readLeaseNotAfter) >=
      Date.parse(receipt.expiresAt) &&
    receipt.lifecycle === 'active' &&
    isAgentControlInstant(receipt.checkedAt) &&
    isAgentControlInstant(receipt.expiresAt) &&
    Date.parse(receipt.expiresAt) > Date.parse(receipt.checkedAt) &&
    Date.parse(receipt.expiresAt) - Date.parse(receipt.checkedAt) >=
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_READ_MINIMUM_QUERY_LEASE_MS &&
    Date.parse(receipt.expiresAt) - Date.parse(receipt.checkedAt) <=
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_READ_MAXIMUM_LIFETIME_MS &&
    receiptDigest === digestAgentCanonicalValue(base) &&
    safe(
      receipt,
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_COMPONENT_MAXIMUM_BYTES
    )
  );
};

export const matchAgentHostedRetrievalRuntimeResourceReadReceipt = (
  receipt: AgentHostedRetrievalRuntimeResourceReadReceipt,
  request: AgentHostedRetrievalRuntimeResourceReadRequest,
  authority: AgentHostedRetrievalRuntimeResourceAuthority,
  observedAt: Instant
): boolean =>
  isAgentHostedRetrievalRuntimeResourceReadReceipt(receipt) &&
  isAgentHostedRetrievalRuntimeResourceReadRequest(request) &&
  isAgentHostedRetrievalRuntimeResourceAuthority(authority) &&
  isAgentControlInstant(observedAt) &&
  receipt.readRequestDigest === request.requestDigest &&
  receipt.authorityDigest === authority.authorityDigest &&
  receipt.resourceSetCommitmentDigest === request.resourceSetCommitmentDigest &&
  receipt.readLeaseId === request.readLeaseId &&
  receipt.activeOwnerInstanceId === request.readerOwnerInstanceId &&
  receipt.planDigest === authority.planDigest &&
  receipt.runConfigArtifactBindingDigest ===
    authority.runConfigArtifactBindingDigest &&
  receipt.runtimeResourceSetId === authority.runtimeResourceSetId &&
  Date.parse(receipt.checkedAt) <= Date.parse(observedAt) &&
  Date.parse(receipt.expiresAt) > Date.parse(observedAt) &&
  Date.parse(authority.expiresAt) > Date.parse(observedAt);

export const matchAgentHostedRetrievalRuntimeResourceActiveReadReceipt = (
  receipt: AgentHostedRetrievalRuntimeResourceReadReceipt,
  authority: AgentHostedRetrievalRuntimeResourceAuthority,
  binding: Readonly<{
    activeOwnerInstanceId: string;
    claimGeneration: number;
    activeState: AgentHostedRetrievalRuntimeResourceActiveState;
    observedAt: Instant;
  }>
): boolean =>
  isAgentHostedRetrievalRuntimeResourceReadReceipt(receipt) &&
  isAgentHostedRetrievalRuntimeResourceAuthority(authority) &&
  isAgentControlIdentity(binding.activeOwnerInstanceId) &&
  Number.isSafeInteger(binding.claimGeneration) &&
  binding.claimGeneration >= 1 &&
  isAgentHostedRetrievalRuntimeResourceActiveState(binding.activeState) &&
  isAgentControlInstant(binding.observedAt) &&
  receipt.authorityDigest === authority.authorityDigest &&
  receipt.activeOwnerInstanceId === binding.activeOwnerInstanceId &&
  receipt.claimGeneration === binding.claimGeneration &&
  receipt.activeStateDigest === binding.activeState.stateDigest &&
  sameCanonicalJson(receipt.activeState, binding.activeState) &&
  receipt.planDigest === authority.planDigest &&
  receipt.runConfigArtifactBindingDigest ===
    authority.runConfigArtifactBindingDigest &&
  receipt.runtimeResourceSetId === authority.runtimeResourceSetId &&
  Date.parse(receipt.checkedAt) <= Date.parse(binding.observedAt) &&
  Date.parse(receipt.expiresAt) > Date.parse(binding.observedAt) &&
  Date.parse(authority.registeredAt) <= Date.parse(binding.observedAt) &&
  Date.parse(authority.expiresAt) > Date.parse(binding.observedAt);

export const createAgentHostedRetrievalRuntimeResourceReadLeaseLedgerRoot = (
  authority: AgentHostedRetrievalRuntimeResourceAuthority,
  commitment: AgentHostedRetrievalRuntimeResourceSetCommitment,
  seal: Readonly<{
    ledgerAuthorityIssuerId: string;
    ledgerAuthorityImplementationDigest: CanonicalDigest;
    ledgerRevision: number;
    sealedAt: Instant;
  }>,
  entriesInput: readonly Readonly<{
    request: AgentHostedRetrievalRuntimeResourceReadRequest;
    receipt: AgentHostedRetrievalRuntimeResourceReadReceipt;
  }>[]
): AgentHostedRetrievalRuntimeResourceReadLeaseLedgerRoot => {
  if (
    !matchAgentHostedRetrievalRuntimeResourceAuthoritySetCommitment(
      commitment,
      authority
    ) ||
    !exact(seal, [
      'ledgerAuthorityIssuerId',
      'ledgerAuthorityImplementationDigest',
      'ledgerRevision',
      'sealedAt',
    ]) ||
    !isAgentControlIdentity(seal.ledgerAuthorityIssuerId) ||
    !isAgentCanonicalDigest(seal.ledgerAuthorityImplementationDigest) ||
    !Number.isSafeInteger(seal.ledgerRevision) ||
    seal.ledgerRevision < 1 ||
    !isAgentControlInstant(seal.sealedAt) ||
    !Array.isArray(entriesInput) ||
    entriesInput.length >
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_MAXIMUM_READ_RECEIPTS ||
    entriesInput.some(
      ({ request, receipt }) =>
        request.resourceSetCommitmentDigest !== commitment.commitmentDigest ||
        receipt.resourceSetCommitmentDigest !== commitment.commitmentDigest ||
        !matchAgentHostedRetrievalRuntimeResourceReadReceipt(
          receipt,
          request,
          authority,
          receipt.checkedAt
        )
    )
  ) {
    throw new TypeError(
      'Hosted retrieval runtime read lease ledger input is invalid.'
    );
  }
  const entries = Object.freeze(
    [...entriesInput].sort((left, right) =>
      compareUnicodeCodePoints(
        left.request.requestDigest,
        right.request.requestDigest
      )
    )
  );
  const readLeaseIds = entries.map(({ request }) => request.readLeaseId);
  const requestDigests = entries.map(({ request }) => request.requestDigest);
  const receiptDigests = entries.map(({ receipt }) => receipt.receiptDigest);
  if (
    new Set(readLeaseIds).size !== entries.length ||
    new Set(requestDigests).size !== entries.length ||
    new Set(receiptDigests).size !== entries.length
  ) {
    throw new TypeError(
      'Hosted retrieval runtime read lease ledger contains duplicates.'
    );
  }
  const claimGenerations = entries
    .map(({ receipt }) => receipt.claimGeneration)
    .sort((left, right) => left - right);
  const checkedTimes = entries
    .map(({ receipt }) => receipt.checkedAt)
    .sort(compareUnicodeCodePoints);
  const expiryTimes = entries
    .map(({ receipt }) => receipt.expiresAt)
    .sort(compareUnicodeCodePoints);
  const base = Object.freeze({
    format:
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_READ_LEASE_LEDGER_ROOT_FORMAT,
    version: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
    ledgerAuthorityIssuerId: seal.ledgerAuthorityIssuerId,
    ledgerAuthorityImplementationDigest:
      seal.ledgerAuthorityImplementationDigest,
    ledgerRevision: seal.ledgerRevision,
    planDigest: authority.planDigest,
    runConfigArtifactBindingDigest: authority.runConfigArtifactBindingDigest,
    runtimeResourceSetId: authority.runtimeResourceSetId,
    authorityDigest: authority.authorityDigest,
    resourceSetCommitmentDigest: commitment.commitmentDigest,
    readLeaseCount: entries.length,
    readLeaseIdSetDigest: digestAgentCanonicalValue(readLeaseIds),
    readRequestDigestSetDigest: digestAgentCanonicalValue(requestDigests),
    readReceiptDigestSetDigest: digestAgentCanonicalValue(receiptDigests),
    activeStateDigestSetDigest: digestAgentCanonicalValue(
      entries.map(({ receipt }) => receipt.activeStateDigest)
    ),
    minimumClaimGeneration: claimGenerations.at(0) ?? null,
    maximumClaimGeneration: claimGenerations.at(-1) ?? null,
    firstCheckedAt: checkedTimes.at(0) ?? null,
    lastExpiresAt: expiryTimes.at(-1) ?? null,
    sealedAt: seal.sealedAt,
  });
  if (
    base.lastExpiresAt !== null &&
    Date.parse(base.sealedAt) < Date.parse(base.lastExpiresAt)
  ) {
    throw new TypeError(
      'Hosted retrieval runtime read lease ledger was sealed before lease expiry.'
    );
  }
  const root = Object.freeze({
    ...base,
    rootDigest: digestAgentCanonicalValue(base),
  });
  if (
    !safe(root, AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_COMPONENT_MAXIMUM_BYTES)
  ) {
    throw new TypeError(
      'Hosted retrieval runtime read lease ledger root is unsafe or unbounded.'
    );
  }
  return root;
};

export const isAgentHostedRetrievalRuntimeResourceReadLeaseLedgerRoot = (
  value: unknown
): value is AgentHostedRetrievalRuntimeResourceReadLeaseLedgerRoot => {
  if (!exact(value, readLeaseLedgerRootKeys)) return false;
  const root = value as AgentHostedRetrievalRuntimeResourceReadLeaseLedgerRoot;
  const { rootDigest, ...base } = root;
  const empty = root.readLeaseCount === 0;
  return (
    root.format ===
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_READ_LEASE_LEDGER_ROOT_FORMAT &&
    root.version === AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION &&
    [
      root.ledgerAuthorityImplementationDigest,
      root.planDigest,
      root.runConfigArtifactBindingDigest,
      root.authorityDigest,
      root.resourceSetCommitmentDigest,
      root.readLeaseIdSetDigest,
      root.readRequestDigestSetDigest,
      root.readReceiptDigestSetDigest,
      root.activeStateDigestSetDigest,
      root.rootDigest,
    ].every(isAgentCanonicalDigest) &&
    [root.ledgerAuthorityIssuerId, root.runtimeResourceSetId].every(
      isAgentControlIdentity
    ) &&
    Number.isSafeInteger(root.ledgerRevision) &&
    root.ledgerRevision >= 1 &&
    Number.isSafeInteger(root.readLeaseCount) &&
    root.readLeaseCount >= 0 &&
    root.readLeaseCount <=
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_MAXIMUM_READ_RECEIPTS &&
    empty === (root.minimumClaimGeneration === null) &&
    empty === (root.maximumClaimGeneration === null) &&
    empty === (root.firstCheckedAt === null) &&
    empty === (root.lastExpiresAt === null) &&
    (empty ||
      (Number.isSafeInteger(root.minimumClaimGeneration) &&
        root.minimumClaimGeneration! >= 1 &&
        Number.isSafeInteger(root.maximumClaimGeneration) &&
        root.maximumClaimGeneration! >= root.minimumClaimGeneration! &&
        isAgentControlInstant(root.firstCheckedAt) &&
        isAgentControlInstant(root.lastExpiresAt) &&
        Date.parse(root.lastExpiresAt!) > Date.parse(root.firstCheckedAt!))) &&
    isAgentControlInstant(root.sealedAt) &&
    (root.lastExpiresAt === null ||
      Date.parse(root.sealedAt) >= Date.parse(root.lastExpiresAt)) &&
    (!empty ||
      (root.readLeaseIdSetDigest === digestAgentCanonicalValue([]) &&
        root.readRequestDigestSetDigest === digestAgentCanonicalValue([]) &&
        root.readReceiptDigestSetDigest === digestAgentCanonicalValue([]) &&
        root.activeStateDigestSetDigest === digestAgentCanonicalValue([]))) &&
    rootDigest === digestAgentCanonicalValue(base) &&
    safe(root, AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_COMPONENT_MAXIMUM_BYTES)
  );
};
