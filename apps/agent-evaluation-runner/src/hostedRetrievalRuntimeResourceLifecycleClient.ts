import {
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_ARCHIVE_ADMISSION_MAXIMUM_BYTES,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_CLEANUP_RECEIPT_MAXIMUM_BYTES,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_COMPONENT_MAXIMUM_BYTES,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_RAW_MAXIMUM_BYTES,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_RECONCILIATION_MAXIMUM_BYTES,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_POST_MATRIX_CLEANUP_CLAIM_REQUEST_MAXIMUM_BYTES,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PURPOSES,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_RECOVERY_CLAIM_RECEIPT_MAXIMUM_BYTES,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_REGISTRATION_RESULT_MAXIMUM_BYTES,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_ROUTES,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_TERMINAL_FENCE_DERIVE_RECEIPT_MAXIMUM_BYTES,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_TERMINAL_FENCE_DERIVE_REQUEST_MAXIMUM_BYTES,
  isAgentHostedRetrievalRuntimeResourceCleanupReceipt,
  isAgentHostedRetrievalRuntimeResourceCleanupResultReadReceipt,
  isAgentHostedRetrievalRuntimeResourceCleanupResultReadRequest,
  isAgentHostedRetrievalRuntimeResourcePostMatrixCleanupClaimRequest,
  isAgentHostedRetrievalRuntimeResourceRecoveryClaimReceipt,
  isAgentHostedRetrievalRuntimeResourceRecoveryClaimRequest,
  isAgentHostedRetrievalRuntimeResourceRecoveryPage,
  isAgentHostedRetrievalRuntimeResourceRecoveryScanRequest,
  isAgentHostedRetrievalRuntimeResourceRegistrationRequest,
  isAgentHostedRetrievalRuntimeResourceRegistrationResult,
  isAgentHostedRetrievalRuntimeResourceTerminalFenceDeriveRequest,
  isAgentHostedRetrievalRuntimeResourceLifecycleSealReceipt,
  isAgentHostedRetrievalRuntimeResourceLifecycleSealRequest,
  isAgentHostedRetrievalRuntimeResourceLifecycleStageReceipt,
  isAgentHostedRetrievalRuntimeResourceLifecycleStageRequest,
  isAgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationReceipt,
  isAgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationStoreRequest,
  isAgentHostedRetrievalRuntimeResourceLifecycleArchiveReadPage,
  isAgentHostedRetrievalRuntimeResourceLifecycleArchiveReadRequest,
  isAgentHostedRetrievalRuntimeResourceLifecycleTransportRecoveryReadReceipt,
  isAgentHostedRetrievalRuntimeResourceLifecycleTransportRecoveryReadRequest,
  isAgentHostedRetrievalRuntimeResourceLifecycleTransportStoreReceipt,
  isAgentHostedRetrievalRuntimeResourceLifecycleTransportStoreRequest,
  isAgentHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchPage,
  isAgentHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchReadRequest,
  matchAgentHostedRetrievalRuntimeResourceCleanupReceipt,
  matchAgentHostedRetrievalRuntimeResourcePostMatrixCleanupClaimReceipt,
  matchAgentHostedRetrievalRuntimeResourceRecoveryClaimReceipt,
  matchAgentHostedRetrievalRuntimeResourceTerminalFenceDeriveReceipt,
  type AgentHostedRetrievalRuntimeResourceCleanupReceipt,
  type AgentHostedRetrievalRuntimeResourceCleanupResultReadReceipt,
  type AgentHostedRetrievalRuntimeResourceCleanupResultReadRequest,
  type AgentHostedRetrievalRuntimeResourcePostMatrixCleanupClaimRequest,
  type AgentHostedRetrievalRuntimeResourceRecoveryClaimReceipt,
  type AgentHostedRetrievalRuntimeResourceRecoveryClaimRequest,
  type AgentHostedRetrievalRuntimeResourceRecoveryPage,
  type AgentHostedRetrievalRuntimeResourceRecoveryScanRequest,
  type AgentHostedRetrievalRuntimeResourceRegistrationRequest,
  type AgentHostedRetrievalRuntimeResourceRegistrationResult,
  type AgentHostedRetrievalRuntimeResourceTerminalFenceDeriveReceipt,
  type AgentHostedRetrievalRuntimeResourceTerminalFenceDeriveRequest,
  type AgentHostedRetrievalRuntimeResourceLifecycleSealReceipt,
  type AgentHostedRetrievalRuntimeResourceLifecycleSealRequest,
  type AgentHostedRetrievalRuntimeResourceLifecycleStageReceipt,
  type AgentHostedRetrievalRuntimeResourceLifecycleStageRequest,
  type AgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationReceipt,
  type AgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationStoreRequest,
  type AgentHostedRetrievalRuntimeResourceLifecycleArchiveReadPage,
  type AgentHostedRetrievalRuntimeResourceLifecycleArchiveReadRequest,
  type AgentHostedRetrievalRuntimeResourceLifecycleTransportRecoveryReadReceipt,
  type AgentHostedRetrievalRuntimeResourceLifecycleTransportRecoveryReadRequest,
  type AgentHostedRetrievalRuntimeResourceLifecycleTransportStoreReceipt,
  type AgentHostedRetrievalRuntimeResourceLifecycleTransportStoreRequest,
  type AgentHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchPage,
  type AgentHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchReadRequest,
  type Instant,
} from '@prodivix/ai';
import { sameCanonicalJson } from '@prodivix/shared/canonical';
import {
  AGENT_EVALUATION_RUNNER_ERROR_CODES,
  AgentEvaluationRunnerError,
} from './errors';
import {
  createEnvironmentAgentEvaluationHostedRetrievalRuntimeResourceHttpTransport,
  type CreateEnvironmentAgentEvaluationHostedRetrievalRuntimeResourceHttpTransportInput,
} from './hostedRetrievalRuntimeResourceHttpTransport';
import type { AgentEvaluationEnvironmentReader } from './secretResolver';

export const AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_ROLE_ENVIRONMENT_NAME =
  'PRODIVIX_G4_MODEL_EVAL_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_ROLE' as const;

export type AgentEvaluationHostedRetrievalRuntimeResourceLifecycleRole =
  'cleanup' | 'prepare' | 'recovery';

export type AgentEvaluationHostedRetrievalRuntimeResourcePrepareClient =
  Readonly<{
    stageRegistration(
      request: AgentHostedRetrievalRuntimeResourceRegistrationRequest
    ): Promise<
      AgentHostedRetrievalRuntimeResourceRegistrationRequest | undefined
    >;
    storeRegistrationResult(
      result: AgentHostedRetrievalRuntimeResourceRegistrationResult
    ): Promise<
      AgentHostedRetrievalRuntimeResourceRegistrationResult | undefined
    >;
  }>;

export type AgentEvaluationHostedRetrievalRuntimeResourceCleanupClient =
  Readonly<{
    deriveTerminalFence(
      request: AgentHostedRetrievalRuntimeResourceTerminalFenceDeriveRequest
    ): Promise<
      AgentHostedRetrievalRuntimeResourceTerminalFenceDeriveReceipt | undefined
    >;
    claimPostMatrixCleanup(
      request: AgentHostedRetrievalRuntimeResourcePostMatrixCleanupClaimRequest
    ): Promise<
      AgentHostedRetrievalRuntimeResourceRecoveryClaimReceipt | undefined
    >;
    storeCleanupReceipt(
      receipt: AgentHostedRetrievalRuntimeResourceCleanupReceipt,
      claimReceipt: AgentHostedRetrievalRuntimeResourceRecoveryClaimReceipt
    ): Promise<AgentHostedRetrievalRuntimeResourceCleanupReceipt | undefined>;
    readCleanupResult(
      request: AgentHostedRetrievalRuntimeResourceCleanupResultReadRequest,
      claimReceipt: AgentHostedRetrievalRuntimeResourceRecoveryClaimReceipt
    ): Promise<
      AgentHostedRetrievalRuntimeResourceCleanupResultReadReceipt | undefined
    >;
  }>;

export type AgentEvaluationHostedRetrievalRuntimeResourceRecoveryClient =
  Readonly<{
    listRecoveryCandidates(
      request: AgentHostedRetrievalRuntimeResourceRecoveryScanRequest
    ): Promise<AgentHostedRetrievalRuntimeResourceRecoveryPage | undefined>;
    claimRecoveryCleanup(
      request: AgentHostedRetrievalRuntimeResourceRecoveryClaimRequest
    ): Promise<
      AgentHostedRetrievalRuntimeResourceRecoveryClaimReceipt | undefined
    >;
    storeCleanupReceipt: AgentEvaluationHostedRetrievalRuntimeResourceCleanupClient['storeCleanupReceipt'];
    readCleanupResult: AgentEvaluationHostedRetrievalRuntimeResourceCleanupClient['readCleanupResult'];
  }>;

/**
 * Durable Provider-mutation journal ingress. Every write is keyed by the
 * public request digest; an ACK loss is recovered by replaying the same write
 * and accepting only the exact public receipt binding.
 */
export type AgentEvaluationHostedRetrievalRuntimeResourceLifecycleJournalClient =
  Readonly<{
    stageDispatch(
      request: AgentHostedRetrievalRuntimeResourceLifecycleStageRequest
    ): Promise<
      AgentHostedRetrievalRuntimeResourceLifecycleStageReceipt | undefined
    >;
    storeTransport(
      request: AgentHostedRetrievalRuntimeResourceLifecycleTransportStoreRequest
    ): Promise<
      | AgentHostedRetrievalRuntimeResourceLifecycleTransportStoreReceipt
      | undefined
    >;
    readTransportForRecovery(
      request: AgentHostedRetrievalRuntimeResourceLifecycleTransportRecoveryReadRequest
    ): Promise<
      | AgentHostedRetrievalRuntimeResourceLifecycleTransportRecoveryReadReceipt
      | undefined
    >;
    listUnfinishedDispatches(
      request: AgentHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchReadRequest
    ): Promise<
      | AgentHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchPage
      | undefined
    >;
    storeReconciliationObservation(
      request: AgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationStoreRequest
    ): Promise<
      | AgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationReceipt
      | undefined
    >;
    readArchive(
      request: AgentHostedRetrievalRuntimeResourceLifecycleArchiveReadRequest
    ): Promise<
      AgentHostedRetrievalRuntimeResourceLifecycleArchiveReadPage | undefined
    >;
    sealJournal(
      request: AgentHostedRetrievalRuntimeResourceLifecycleSealRequest
    ): Promise<
      AgentHostedRetrievalRuntimeResourceLifecycleSealReceipt | undefined
    >;
  }>;

type LifecycleClientInput =
  CreateEnvironmentAgentEvaluationHostedRetrievalRuntimeResourceHttpTransportInput &
    Readonly<{
      clock?: () => Date;
    }>;

const invalid = (): never => {
  throw new AgentEvaluationRunnerError(
    AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid
  );
};

const readEnvironment = (
  environment: NodeJS.ProcessEnv | AgentEvaluationEnvironmentReader
): AgentEvaluationEnvironmentReader =>
  typeof environment === 'function' ? environment : (name) => environment[name];

const assertRole = (
  input: LifecycleClientInput,
  role: AgentEvaluationHostedRetrievalRuntimeResourceLifecycleRole
): void => {
  const read = readEnvironment(input.environment ?? process.env);
  if (
    read(
      AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_ROLE_ENVIRONMENT_NAME
    ) !== role
  ) {
    invalid();
  }
};

const cleanupResultReadMaximumBytes =
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_ARCHIVE_ADMISSION_MAXIMUM_BYTES +
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_CLEANUP_RECEIPT_MAXIMUM_BYTES +
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_COMPONENT_MAXIMUM_BYTES;

const exactJournalWrite = async <T>(
  operation: () => Promise<unknown | undefined>,
  decode: (value: unknown) => T | undefined
): Promise<T | undefined> => {
  const first = decode(await operation());
  if (first !== undefined) return first;
  return decode(await operation());
};

export const createEnvironmentAgentEvaluationHostedRetrievalRuntimeResourceLifecycleJournalClient =
  (
    input: LifecycleClientInput
  ): AgentEvaluationHostedRetrievalRuntimeResourceLifecycleJournalClient => {
    const read = readEnvironment(input.environment ?? process.env);
    const role = read(
      AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_ROLE_ENVIRONMENT_NAME
    );
    if (!['cleanup', 'prepare', 'recovery'].includes(role ?? '')) invalid();
    const transport =
      createEnvironmentAgentEvaluationHostedRetrievalRuntimeResourceHttpTransport(
        input
      );
    return Object.freeze({
      async stageDispatch(request) {
        if (
          !isAgentHostedRetrievalRuntimeResourceLifecycleStageRequest(
            request
          ) ||
          request.dispatchIntent.namespaceId !== input.namespaceId ||
          (input.repositoryCommit !== undefined &&
            request.dispatchIntent.repositoryCommit !==
              input.repositoryCommit) ||
          (role === 'prepare' &&
            request.dispatchIntent.operation !== 'create') ||
          (role === 'cleanup' &&
            request.dispatchIntent.operation !== 'delete') ||
          (role === 'recovery' &&
            request.dispatchStageClaimRequest
              .expectedPriorStageClaimReceiptDigest === null &&
            !(
              request.dispatchIntent.operation === 'delete' &&
              request.dispatchIntent.lifecycleClaimReceiptDigest !== null
            ))
        ) {
          return undefined;
        }
        return exactJournalWrite(
          () =>
            transport.post({
              route:
                AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_ROUTES.lifecycleJournalDispatchIntents,
              purpose:
                AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PURPOSES.stageLifecycleJournalDispatch,
              request,
              idempotencyKey: request.requestDigest,
              maximumRequestBytes:
                AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_RAW_MAXIMUM_BYTES,
              maximumResponseBytes:
                AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_RAW_MAXIMUM_BYTES,
              acceptedStatuses: Object.freeze([200, 201]),
            }),
          (value) =>
            isAgentHostedRetrievalRuntimeResourceLifecycleStageReceipt(value) &&
            value.requestDigest === request.requestDigest &&
            value.dispatchIntentDigest ===
              request.dispatchIntent.intentDigest &&
            value.dispatchStageClaimReceipt.claimRequestDigest ===
              request.dispatchStageClaimRequest.requestDigest &&
            (role !== 'recovery' ||
              value.dispatchStageClaimReceipt.deliveryDisposition ===
                (request.dispatchIntent.operation === 'delete' &&
                request.dispatchStageClaimRequest
                  .expectedPriorStageClaimReceiptDigest === null
                  ? 'dispatch-authorized-first-delivery'
                  : 'reconcile-only-replay'))
              ? value
              : undefined
        );
      },
      async storeTransport(request) {
        if (
          !isAgentHostedRetrievalRuntimeResourceLifecycleTransportStoreRequest(
            request
          ) ||
          request.dispatchIntentSet.intents[0]?.namespaceId !==
            input.namespaceId ||
          (input.repositoryCommit !== undefined &&
            request.dispatchIntentSet.intents[0]?.repositoryCommit !==
              input.repositoryCommit) ||
          (role === 'prepare' &&
            request.dispatchIntentSet.operation !== 'create') ||
          (role === 'cleanup' &&
            request.dispatchIntentSet.operation !== 'delete') ||
          (role === 'recovery' &&
            request.transportReceiptSet.receipts.some(
              (receipt) =>
                receipt.outcome !== 'post-dispatch-unknown' ||
                receipt.responseProjection?.outcome !== 'unknown'
            ))
        ) {
          return undefined;
        }
        return exactJournalWrite(
          () =>
            transport.post({
              route:
                AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_ROUTES.lifecycleJournalTransportReceipts,
              purpose:
                AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PURPOSES.storeLifecycleJournalTransport,
              request,
              idempotencyKey: request.requestDigest,
              maximumRequestBytes:
                AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_RAW_MAXIMUM_BYTES,
              maximumResponseBytes:
                AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_RAW_MAXIMUM_BYTES,
              acceptedStatuses: Object.freeze([200, 201]),
            }),
          (value) =>
            isAgentHostedRetrievalRuntimeResourceLifecycleTransportStoreReceipt(
              value
            ) &&
            value.requestDigest === request.requestDigest &&
            value.dispatchIntentSetDigest ===
              request.dispatchIntentSet.setDigest &&
            value.dispatchStageClaimReceiptSetDigest ===
              request.dispatchStageClaimReceiptSet.setDigest &&
            value.transportReceiptSetDigest ===
              request.transportReceiptSet.setDigest &&
            value.spoolEnvelopeDigest ===
              request.spoolEnvelopeAuthority.envelopeDigest &&
            value.spoolReceiptDigest === request.spoolReceipt.receiptDigest
              ? value
              : undefined
        );
      },
      async readTransportForRecovery(request) {
        if (
          role !== 'recovery' ||
          !isAgentHostedRetrievalRuntimeResourceLifecycleTransportRecoveryReadRequest(
            request
          ) ||
          request.namespaceId !== input.namespaceId
        ) {
          return undefined;
        }
        return exactJournalWrite(
          () =>
            transport.post({
              route:
                AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_ROUTES.lifecycleJournalTransportReceipts,
              purpose:
                AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PURPOSES.readLifecycleJournalTransportRecovery,
              request,
              idempotencyKey: request.requestDigest,
              maximumRequestBytes:
                AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_RAW_MAXIMUM_BYTES,
              maximumResponseBytes:
                AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_RAW_MAXIMUM_BYTES,
              acceptedStatuses: Object.freeze([200]),
            }),
          (value) =>
            isAgentHostedRetrievalRuntimeResourceLifecycleTransportRecoveryReadReceipt(
              value
            ) &&
            value.requestDigest === request.requestDigest &&
            value.request.dispatchIntentDigest ===
              request.dispatchIntentDigest &&
            value.request.dispatchStageClaimReceiptDigest ===
              request.dispatchStageClaimReceiptDigest &&
            value.request.expectedPriorTransportReceiptDigest ===
              request.expectedPriorTransportReceiptDigest &&
            value.request.spoolRef === request.spoolRef &&
            value.request.lifecycleOwnerInstanceId ===
              request.lifecycleOwnerInstanceId
              ? value
              : undefined
        );
      },
      async listUnfinishedDispatches(request) {
        if (
          !isAgentHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchReadRequest(
            request
          ) ||
          request.namespaceId !== input.namespaceId ||
          (input.repositoryCommit !== undefined &&
            request.repositoryCommit !== input.repositoryCommit)
        ) {
          return undefined;
        }
        return exactJournalWrite(
          () =>
            transport.post({
              route:
                AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_ROUTES.lifecycleJournalDispatchIntents,
              purpose:
                AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PURPOSES.readLifecycleJournalUnfinishedDispatches,
              request,
              idempotencyKey: request.requestDigest,
              maximumRequestBytes:
                AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_RAW_MAXIMUM_BYTES,
              maximumResponseBytes:
                AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_RAW_MAXIMUM_BYTES,
              acceptedStatuses: Object.freeze([200]),
            }),
          (value) =>
            isAgentHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchPage(
              value
            ) && value.requestDigest === request.requestDigest
              ? value
              : undefined
        );
      },
      async storeReconciliationObservation(request) {
        if (
          role !== 'recovery' ||
          !isAgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationStoreRequest(
            request
          )
        ) {
          return undefined;
        }
        return exactJournalWrite(
          () =>
            transport.post({
              route:
                AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_ROUTES.lifecycleJournalTransportReceipts,
              purpose:
                AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PURPOSES.storeLifecycleJournalTransportReconciliationObservation,
              request,
              idempotencyKey: request.requestDigest,
              maximumRequestBytes:
                AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_RECONCILIATION_MAXIMUM_BYTES *
                2,
              maximumResponseBytes:
                AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_RECONCILIATION_MAXIMUM_BYTES,
              acceptedStatuses: Object.freeze([200, 201]),
            }),
          (value) =>
            isAgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationReceipt(
              value
            ) &&
            value.requestDigest === request.authorizationRequestDigest &&
            value.dispatchIntentDigest ===
              request.authorizationRequest.dispatchIntentDigest &&
            value.dispatchStageClaimReceiptDigest ===
              request.authorizationRequest.dispatchStageClaimReceiptDigest &&
            value.transportReceiptDigest ===
              request.authorizationRequest.transportReceiptDigest
              ? value
              : undefined
        );
      },
      async readArchive(request) {
        if (
          role !== 'recovery' ||
          !isAgentHostedRetrievalRuntimeResourceLifecycleArchiveReadRequest(
            request
          ) ||
          request.namespaceId !== input.namespaceId ||
          (input.repositoryCommit !== undefined &&
            request.repositoryCommit !== input.repositoryCommit)
        ) {
          return undefined;
        }
        return exactJournalWrite(
          () =>
            transport.post({
              route:
                AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_ROUTES.lifecycleJournalRecords,
              purpose:
                AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PURPOSES.readLifecycleJournalArchive,
              request,
              idempotencyKey: request.requestDigest,
              maximumRequestBytes:
                AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_RAW_MAXIMUM_BYTES,
              maximumResponseBytes:
                AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_RAW_MAXIMUM_BYTES,
              acceptedStatuses: Object.freeze([200]),
            }),
          (value) =>
            isAgentHostedRetrievalRuntimeResourceLifecycleArchiveReadPage(
              value
            ) && value.requestDigest === request.requestDigest
              ? value
              : undefined
        );
      },
      async sealJournal(request) {
        if (
          !isAgentHostedRetrievalRuntimeResourceLifecycleSealRequest(request) ||
          request.journalRecord.dispatchIntentSet.intents[0]?.namespaceId !==
            input.namespaceId ||
          (input.repositoryCommit !== undefined &&
            request.journalRecord.dispatchIntentSet.intents[0]
              ?.repositoryCommit !== input.repositoryCommit) ||
          (role === 'prepare' &&
            request.journalRecord.operation !== 'create') ||
          (role === 'cleanup' && request.journalRecord.operation !== 'delete')
        ) {
          return undefined;
        }
        return exactJournalWrite(
          () =>
            transport.post({
              route:
                AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_ROUTES.lifecycleJournalRecords,
              purpose:
                AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PURPOSES.sealLifecycleJournalRecord,
              request,
              idempotencyKey: request.requestDigest,
              maximumRequestBytes:
                AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_RAW_MAXIMUM_BYTES,
              maximumResponseBytes:
                AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_RAW_MAXIMUM_BYTES,
              acceptedStatuses: Object.freeze([200, 201]),
            }),
          (value) =>
            isAgentHostedRetrievalRuntimeResourceLifecycleSealReceipt(value) &&
            value.requestDigest === request.requestDigest &&
            value.journalRecordDigest === request.journalRecord.recordDigest &&
            value.transportStoreReceiptHistoryDigest ===
              request.transportStoreReceiptHistory.historyDigest &&
            value.spoolDispositionReceiptDigest ===
              request.spoolDispositionReceipt.receiptDigest
              ? value
              : undefined
        );
      },
    });
  };

const createCleanupResultMethods = (
  transport: ReturnType<
    typeof createEnvironmentAgentEvaluationHostedRetrievalRuntimeResourceHttpTransport
  >,
  claimSource: AgentHostedRetrievalRuntimeResourceRecoveryClaimReceipt['claimSource']
) =>
  Object.freeze({
    async storeCleanupReceipt(
      receipt: AgentHostedRetrievalRuntimeResourceCleanupReceipt,
      claimReceipt: AgentHostedRetrievalRuntimeResourceRecoveryClaimReceipt
    ) {
      if (
        !isAgentHostedRetrievalRuntimeResourceRecoveryClaimReceipt(
          claimReceipt
        ) ||
        claimReceipt.claimSource !== claimSource ||
        !matchAgentHostedRetrievalRuntimeResourceCleanupReceipt(
          receipt,
          claimReceipt.cleanupRequest,
          claimReceipt.registrationResult,
          claimReceipt.resourceSetCommitment,
          claimReceipt.cleanupClaimAuthorityReceipt,
          claimReceipt.storedPriorActiveState,
          claimReceipt.readLeaseLedgerRoot,
          claimReceipt.storedRunTerminalFence,
          claimReceipt.overdueReceipt
        )
      ) {
        return undefined;
      }
      const value = await transport.post({
        route: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_ROUTES.cleanups,
        purpose:
          claimSource === 'post-matrix'
            ? AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PURPOSES.executePostMatrixCleanup
            : AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PURPOSES.executeCleanup,
        request: receipt,
        idempotencyKey: receipt.cleanupReceiptDigest,
        maximumRequestBytes:
          AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_CLEANUP_RECEIPT_MAXIMUM_BYTES,
        maximumResponseBytes:
          AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_CLEANUP_RECEIPT_MAXIMUM_BYTES,
        acceptedStatuses: Object.freeze([200, 201]),
      });
      return isAgentHostedRetrievalRuntimeResourceCleanupReceipt(value) &&
        sameCanonicalJson(value, receipt)
        ? value
        : undefined;
    },
    async readCleanupResult(
      request: AgentHostedRetrievalRuntimeResourceCleanupResultReadRequest,
      claimReceipt: AgentHostedRetrievalRuntimeResourceRecoveryClaimReceipt
    ) {
      const expectedPurpose =
        claimSource === 'post-matrix'
          ? AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PURPOSES.readPostMatrixCleanupResult
          : AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PURPOSES.readCleanupResult;
      if (
        !isAgentHostedRetrievalRuntimeResourceCleanupResultReadRequest(
          request
        ) ||
        request.purpose !== expectedPurpose ||
        !isAgentHostedRetrievalRuntimeResourceRecoveryClaimReceipt(
          claimReceipt
        ) ||
        claimReceipt.claimSource !== claimSource ||
        request.authorityDigest !==
          claimReceipt.registrationResult.authorityDigest ||
        request.cleanupRequestDigest !==
          claimReceipt.cleanupRequest.requestDigest ||
        request.recoveryClaimReceiptDigest !== claimReceipt.receiptDigest
      ) {
        return undefined;
      }
      const value = await transport.post({
        route: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_ROUTES.cleanupResults,
        purpose: expectedPurpose,
        request,
        idempotencyKey: request.requestDigest,
        maximumRequestBytes:
          AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_COMPONENT_MAXIMUM_BYTES,
        maximumResponseBytes: cleanupResultReadMaximumBytes,
        acceptedStatuses: Object.freeze([200]),
      });
      if (
        !isAgentHostedRetrievalRuntimeResourceCleanupResultReadReceipt(value) ||
        value.requestDigest !== request.requestDigest
      ) {
        return undefined;
      }
      if (
        value.status === 'cleaned' &&
        !matchAgentHostedRetrievalRuntimeResourceCleanupReceipt(
          value.cleanupReceipt!,
          claimReceipt.cleanupRequest,
          claimReceipt.registrationResult,
          claimReceipt.resourceSetCommitment,
          claimReceipt.cleanupClaimAuthorityReceipt,
          claimReceipt.storedPriorActiveState,
          claimReceipt.readLeaseLedgerRoot,
          claimReceipt.storedRunTerminalFence,
          claimReceipt.overdueReceipt
        )
      ) {
        return undefined;
      }
      return value;
    },
  });

export const createEnvironmentAgentEvaluationHostedRetrievalRuntimeResourcePrepareClient =
  (
    input: LifecycleClientInput
  ): AgentEvaluationHostedRetrievalRuntimeResourcePrepareClient => {
    assertRole(input, 'prepare');
    const transport =
      createEnvironmentAgentEvaluationHostedRetrievalRuntimeResourceHttpTransport(
        input
      );
    return Object.freeze({
      async stageRegistration(request) {
        if (
          !isAgentHostedRetrievalRuntimeResourceRegistrationRequest(request) ||
          request.namespaceId !== input.namespaceId ||
          request.repositoryCommit !== input.repositoryCommit
        ) {
          return undefined;
        }
        const value = await transport.post({
          route: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_ROUTES.registrations,
          purpose: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PURPOSES.prepare,
          request,
          idempotencyKey: request.requestDigest,
          maximumRequestBytes:
            AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_COMPONENT_MAXIMUM_BYTES,
          maximumResponseBytes:
            AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_COMPONENT_MAXIMUM_BYTES,
          acceptedStatuses: Object.freeze([200, 201]),
        });
        return isAgentHostedRetrievalRuntimeResourceRegistrationRequest(
          value
        ) && sameCanonicalJson(value, request)
          ? value
          : undefined;
      },
      async storeRegistrationResult(result) {
        if (
          !isAgentHostedRetrievalRuntimeResourceRegistrationResult(result) ||
          result.registrationRequest.namespaceId !== input.namespaceId ||
          result.registrationRequest.repositoryCommit !== input.repositoryCommit
        ) {
          return undefined;
        }
        const value = await transport.post({
          route:
            AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_ROUTES.registrationResults,
          purpose: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PURPOSES.prepare,
          request: result,
          idempotencyKey: result.resultDigest,
          maximumRequestBytes:
            AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_REGISTRATION_RESULT_MAXIMUM_BYTES,
          maximumResponseBytes:
            AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_REGISTRATION_RESULT_MAXIMUM_BYTES,
          acceptedStatuses: Object.freeze([200, 201]),
        });
        return isAgentHostedRetrievalRuntimeResourceRegistrationResult(value) &&
          sameCanonicalJson(value, result)
          ? value
          : undefined;
      },
    });
  };

export const createEnvironmentAgentEvaluationHostedRetrievalRuntimeResourceCleanupClient =
  (
    input: LifecycleClientInput
  ): AgentEvaluationHostedRetrievalRuntimeResourceCleanupClient => {
    assertRole(input, 'cleanup');
    const transport =
      createEnvironmentAgentEvaluationHostedRetrievalRuntimeResourceHttpTransport(
        input
      );
    const clock = input.clock ?? (() => new Date());
    return Object.freeze({
      async deriveTerminalFence(request) {
        if (
          !isAgentHostedRetrievalRuntimeResourceTerminalFenceDeriveRequest(
            request
          ) ||
          request.namespaceId !== input.namespaceId ||
          request.repositoryCommit !== input.repositoryCommit
        ) {
          return undefined;
        }
        const value = await transport.post({
          route:
            AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_ROUTES.terminalFenceDerivations,
          purpose:
            AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PURPOSES.deriveTerminalFence,
          request,
          idempotencyKey: request.requestDigest,
          maximumRequestBytes:
            AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_TERMINAL_FENCE_DERIVE_REQUEST_MAXIMUM_BYTES,
          maximumResponseBytes:
            AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_TERMINAL_FENCE_DERIVE_RECEIPT_MAXIMUM_BYTES,
          acceptedStatuses: Object.freeze([200, 201]),
        });
        const now = clock();
        if (!Number.isFinite(now.getTime())) return undefined;
        return matchAgentHostedRetrievalRuntimeResourceTerminalFenceDeriveReceipt(
          value as AgentHostedRetrievalRuntimeResourceTerminalFenceDeriveReceipt,
          request,
          now.toISOString() as Instant
        )
          ? (value as AgentHostedRetrievalRuntimeResourceTerminalFenceDeriveReceipt)
          : undefined;
      },
      async claimPostMatrixCleanup(request) {
        if (
          !isAgentHostedRetrievalRuntimeResourcePostMatrixCleanupClaimRequest(
            request
          ) ||
          request.namespaceId !== input.namespaceId ||
          request.repositoryCommit !== input.repositoryCommit
        ) {
          return undefined;
        }
        const value = await transport.post({
          route: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_ROUTES.cleanupClaims,
          purpose:
            AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PURPOSES.claimPostMatrixCleanup,
          request,
          idempotencyKey: request.requestDigest,
          maximumRequestBytes:
            AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_POST_MATRIX_CLEANUP_CLAIM_REQUEST_MAXIMUM_BYTES,
          maximumResponseBytes:
            AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_RECOVERY_CLAIM_RECEIPT_MAXIMUM_BYTES,
          acceptedStatuses: Object.freeze([200, 201]),
        });
        return matchAgentHostedRetrievalRuntimeResourcePostMatrixCleanupClaimReceipt(
          value as AgentHostedRetrievalRuntimeResourceRecoveryClaimReceipt,
          request
        )
          ? (value as AgentHostedRetrievalRuntimeResourceRecoveryClaimReceipt)
          : undefined;
      },
      ...createCleanupResultMethods(transport, 'post-matrix'),
    });
  };

export const createEnvironmentAgentEvaluationHostedRetrievalRuntimeResourceRecoveryClient =
  (
    input: LifecycleClientInput
  ): AgentEvaluationHostedRetrievalRuntimeResourceRecoveryClient => {
    assertRole(input, 'recovery');
    const transport =
      createEnvironmentAgentEvaluationHostedRetrievalRuntimeResourceHttpTransport(
        input
      );
    return Object.freeze({
      async listRecoveryCandidates(request) {
        if (
          !isAgentHostedRetrievalRuntimeResourceRecoveryScanRequest(request) ||
          request.namespaceId !== input.namespaceId
        ) {
          return undefined;
        }
        const value = await transport.post({
          route:
            AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_ROUTES.recoveryCandidates,
          purpose:
            AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PURPOSES.listRecovery,
          request,
          idempotencyKey: request.requestDigest,
          maximumRequestBytes:
            AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_COMPONENT_MAXIMUM_BYTES,
          maximumResponseBytes:
            AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_COMPONENT_MAXIMUM_BYTES * 4,
          acceptedStatuses: Object.freeze([200]),
        });
        return isAgentHostedRetrievalRuntimeResourceRecoveryPage(value) &&
          value.requestDigest === request.requestDigest
          ? value
          : undefined;
      },
      async claimRecoveryCleanup(request) {
        if (
          !isAgentHostedRetrievalRuntimeResourceRecoveryClaimRequest(request) ||
          request.namespaceId !== input.namespaceId
        ) {
          return undefined;
        }
        const value = await transport.post({
          route: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_ROUTES.cleanupClaims,
          purpose:
            AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PURPOSES.claimCleanup,
          request,
          idempotencyKey: request.requestDigest,
          maximumRequestBytes:
            AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_COMPONENT_MAXIMUM_BYTES * 5,
          maximumResponseBytes:
            AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_RECOVERY_CLAIM_RECEIPT_MAXIMUM_BYTES,
          acceptedStatuses: Object.freeze([200, 201]),
        });
        return matchAgentHostedRetrievalRuntimeResourceRecoveryClaimReceipt(
          value as AgentHostedRetrievalRuntimeResourceRecoveryClaimReceipt,
          request
        )
          ? (value as AgentHostedRetrievalRuntimeResourceRecoveryClaimReceipt)
          : undefined;
      },
      ...createCleanupResultMethods(transport, 'recovery'),
    });
  };
