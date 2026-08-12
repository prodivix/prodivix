import {
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import {
  hasExactAgentControlKeys,
  isAgentControlIdentity,
} from '../control/agentControlValidation';
import type { CanonicalDigest } from '../domain/agent.types';
import {
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
} from '../domain/agentCanonical';
import type { AgentCapabilityProbePublicResourceMaterial } from './agentCapabilityProbeProgram';
import { isAgentHostedRetrievalRuntimeResourceCleanupArchiveRecord } from './agentHostedRetrievalRuntimeResourceCleanup';
import {
  isAgentHostedRetrievalRuntimeResourceLifecycleBudgetClosureProjection,
  matchAgentHostedRetrievalRuntimeResourceLifecycleBudgetClosure,
  matchAgentHostedRetrievalRuntimeResourceLifecycleBudgetMaterial,
  type AgentHostedRetrievalRuntimeResourceLifecycleBudgetClosureProjection,
} from './agentHostedRetrievalRuntimeResourceLifecycleBudget';
import {
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_EXACT_COUNT,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
  repositoryCommitPattern,
  safe,
  type AgentHostedRetrievalRuntimeResourceCleanupArchiveRecord,
  type AgentHostedRetrievalRuntimeResourceRegistrationResult,
} from './agentHostedRetrievalRuntimeResourceRegistration';
import {
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_ARCHIVE_FAMILY_MAXIMUM_BYTES,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_ARCHIVE_RECORD_MAXIMUM_BYTES,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_MAXIMUM_RECORDS,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_TRANSPORT_JOURNAL_ARCHIVE_FAMILY_FORMAT,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_TRANSPORT_JOURNAL_ARCHIVE_RECORD_FORMAT,
  isAgentHostedRetrievalRuntimeResourceLifecycleTransportJournalRecord,
  matchAgentHostedRetrievalRuntimeResourceCleanupResultLifecycleJournal,
  matchAgentHostedRetrievalRuntimeResourceRegistrationResultLifecycleJournal,
  type AgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveFamily,
  type AgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveRecord,
  type AgentHostedRetrievalRuntimeResourceLifecycleTransportJournalRecord,
} from './agentHostedRetrievalRuntimeResourceLifecycleTransportJournal';

const exact = (value: unknown, keys: readonly string[]): boolean =>
  hasExactAgentControlKeys(value, keys);
const setRoot = (values: readonly CanonicalDigest[]): CanonicalDigest =>
  digestAgentCanonicalValue(
    Object.freeze([...values].sort(compareUnicodeCodePoints))
  );

const journalArchiveRecordKeys = Object.freeze([
  'format',
  'version',
  'journalRecord',
  'journalRecordDigest',
  'budgetClosureProjection',
  'budgetClosureProjectionDigest',
  'archiveRecordDigest',
] as const);

export const createAgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveRecord =
  (
    journalRecord: AgentHostedRetrievalRuntimeResourceLifecycleTransportJournalRecord,
    input: Readonly<{
      budgetClosureProjection: AgentHostedRetrievalRuntimeResourceLifecycleBudgetClosureProjection | null;
      budgetClosureProjectionDigest: CanonicalDigest;
    }>
  ): AgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveRecord => {
    const firstIntent = journalRecord.dispatchIntentSet.intents[0];
    if (
      !isAgentHostedRetrievalRuntimeResourceLifecycleTransportJournalRecord(
        journalRecord
      ) ||
      !firstIntent ||
      !exact(input, [
        'budgetClosureProjection',
        'budgetClosureProjectionDigest',
      ]) ||
      !isAgentCanonicalDigest(input.budgetClosureProjectionDigest) ||
      (journalRecord.operation === 'create'
        ? !isAgentHostedRetrievalRuntimeResourceLifecycleBudgetClosureProjection(
            input.budgetClosureProjection
          ) ||
          input.budgetClosureProjection.projectionDigest !==
            input.budgetClosureProjectionDigest ||
          input.budgetClosureProjection.budgetReservationAuthorityDigest !==
            firstIntent.budgetReservationAuthorityDigest ||
          input.budgetClosureProjection.reservationId !==
            firstIntent.budgetReservationId ||
          Date.parse(input.budgetClosureProjection.reservedAt) >
            Date.parse(firstIntent.createdAt)
        : input.budgetClosureProjection !== null)
    ) {
      throw new TypeError(
        'Hosted lifecycle journal archive record is invalid.'
      );
    }
    const base = Object.freeze({
      format:
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_TRANSPORT_JOURNAL_ARCHIVE_RECORD_FORMAT,
      version: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
      journalRecord,
      journalRecordDigest: journalRecord.recordDigest,
      budgetClosureProjection: input.budgetClosureProjection,
      budgetClosureProjectionDigest: input.budgetClosureProjectionDigest,
    });
    const value = Object.freeze({
      ...base,
      archiveRecordDigest: digestAgentCanonicalValue(base),
    });
    if (
      !safe(
        value,
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_ARCHIVE_RECORD_MAXIMUM_BYTES
      )
    ) {
      throw new TypeError('Hosted lifecycle journal archive record is unsafe.');
    }
    return value;
  };

export const isAgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveRecord =
  (
    value: unknown
  ): value is AgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveRecord => {
    if (!exact(value, journalArchiveRecordKeys)) return false;
    try {
      const candidate =
        value as AgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveRecord;
      return sameCanonicalJson(
        candidate,
        createAgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveRecord(
          candidate.journalRecord,
          {
            budgetClosureProjection: candidate.budgetClosureProjection,
            budgetClosureProjectionDigest:
              candidate.budgetClosureProjectionDigest,
          }
        )
      );
    } catch {
      return false;
    }
  };

const journalFamilyKeys = Object.freeze([
  'format',
  'version',
  'namespaceId',
  'repositoryCommit',
  'planDigest',
  'frozenRunDigest',
  'runConfigArtifactBindingDigest',
  'runtimeResourceSetId',
  'closureStatus',
  'records',
  'recordDigests',
  'creationRecordSetDigest',
  'cleanupRecordSetDigest',
  'familyDigest',
] as const);

const recordOrderKey = (
  value: AgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveRecord
): string => {
  const record = value.journalRecord;
  return `${record.operation}\u0000${record.registrationRequestDigest}\u0000${record.businessResult.resourceRole ?? ''}\u0000${record.businessResult.resourceId ?? ''}`;
};

const resourceKey = (
  registrationRequestDigest: CanonicalDigest,
  role: 'auxiliary' | 'primary',
  resourceId: string
): string => `${registrationRequestDigest}\u0000${role}\u0000${resourceId}`;

export const createAgentHostedRetrievalRuntimeResourceLifecycleEmptyTransportJournalArchiveFamily =
  (
    scope: Readonly<{
      namespaceId: string;
      repositoryCommit: string;
      planDigest: CanonicalDigest;
      frozenRunDigest: CanonicalDigest;
      runConfigArtifactBindingDigest: CanonicalDigest;
      runtimeResourceSetId: string;
    }>
  ): AgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveFamily => {
    if (
      !exact(scope, [
        'namespaceId',
        'repositoryCommit',
        'planDigest',
        'frozenRunDigest',
        'runConfigArtifactBindingDigest',
        'runtimeResourceSetId',
      ]) ||
      !isAgentControlIdentity(scope.namespaceId) ||
      !repositoryCommitPattern.test(scope.repositoryCommit) ||
      ![
        scope.planDigest,
        scope.frozenRunDigest,
        scope.runConfigArtifactBindingDigest,
      ].every(isAgentCanonicalDigest) ||
      !isAgentControlIdentity(scope.runtimeResourceSetId)
    ) {
      throw new TypeError('Hosted lifecycle empty journal scope is invalid.');
    }
    const emptyRecords = Object.freeze([]);
    const emptyDigest = setRoot([]);
    const base = Object.freeze({
      format:
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_TRANSPORT_JOURNAL_ARCHIVE_FAMILY_FORMAT,
      version: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
      ...scope,
      closureStatus: 'zeroed' as const,
      records: emptyRecords,
      recordDigests: emptyRecords,
      creationRecordSetDigest: emptyDigest,
      cleanupRecordSetDigest: emptyDigest,
    });
    const value = Object.freeze({
      ...base,
      familyDigest: digestAgentCanonicalValue(base),
    });
    if (
      !safe(
        value,
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_ARCHIVE_FAMILY_MAXIMUM_BYTES
      )
    ) {
      throw new TypeError('Hosted lifecycle empty journal family is unsafe.');
    }
    return value;
  };

export const createAgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveFamily =
  (
    recordsInput: readonly AgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveRecord[]
  ): AgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveFamily => {
    if (
      recordsInput.length < 1 ||
      recordsInput.length >
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_MAXIMUM_RECORDS ||
      recordsInput.some(
        (value) =>
          !isAgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveRecord(
            value
          )
      )
    ) {
      throw new TypeError(
        'Hosted lifecycle journal archive family is invalid.'
      );
    }
    const records = Object.freeze(
      [...recordsInput].sort((left, right) =>
        compareUnicodeCodePoints(recordOrderKey(left), recordOrderKey(right))
      )
    );
    if (
      !sameCanonicalJson(records, recordsInput) ||
      new Set(records.map(({ archiveRecordDigest }) => archiveRecordDigest))
        .size !== records.length
    ) {
      throw new TypeError('Hosted lifecycle journal archive order is invalid.');
    }
    const first = records[0]!;
    const firstIntent = first.journalRecord.dispatchIntentSet.intents[0]!;
    if (
      records.some((archiveRecord) => {
        const intent =
          archiveRecord.journalRecord.dispatchIntentSet.intents[0]!;
        return (
          intent.namespaceId !== firstIntent.namespaceId ||
          intent.repositoryCommit !== firstIntent.repositoryCommit ||
          intent.planDigest !== firstIntent.planDigest ||
          intent.frozenRunDigest !== firstIntent.frozenRunDigest ||
          intent.runConfigArtifactBindingDigest !==
            firstIntent.runConfigArtifactBindingDigest ||
          intent.runtimeResourceSetId !== firstIntent.runtimeResourceSetId
        );
      })
    ) {
      throw new TypeError('Hosted lifecycle journal archive scope drifted.');
    }
    const creationRecords = records.filter(
      ({ journalRecord }) => journalRecord.operation === 'create'
    );
    const cleanupRecords = records.filter(
      ({ journalRecord }) => journalRecord.operation === 'delete'
    );
    if (
      creationRecords.length >
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_EXACT_COUNT ||
      new Set(
        creationRecords.map(
          ({ journalRecord }) => journalRecord.registrationRequestDigest
        )
      ).size !== creationRecords.length
    ) {
      throw new TypeError(
        'Hosted lifecycle journal creation set is incomplete.'
      );
    }
    const closureByRequest = new Map(
      creationRecords.map((record) => [
        record.journalRecord.registrationRequestDigest,
        record.budgetClosureProjectionDigest,
      ])
    );
    if (
      cleanupRecords.some((record) => {
        const localClosure = closureByRequest.get(
          record.journalRecord.registrationRequestDigest
        );
        return (
          record.budgetClosureProjection !== null ||
          localClosure === undefined ||
          localClosure !== record.budgetClosureProjectionDigest
        );
      })
    ) {
      throw new TypeError(
        'Hosted lifecycle budget closure references drifted.'
      );
    }
    const expectedResourceKeys: string[] = [];
    let hasUnresolved = false;
    let hasIncompleteCreate =
      creationRecords.length !==
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_EXACT_COUNT;
    for (const { journalRecord } of creationRecords) {
      const result = journalRecord.businessResult;
      hasUnresolved ||= result.outcome === 'provider-outcome-unresolved';
      hasIncompleteCreate ||= result.outcome !== 'created-and-uploaded';
      if (result.providerResourceId !== null) {
        expectedResourceKeys.push(
          resourceKey(
            journalRecord.registrationRequestDigest,
            'primary',
            result.providerResourceId
          )
        );
      }
      expectedResourceKeys.push(
        ...result.auxiliaryResourceIds.map((resourceId) =>
          resourceKey(
            journalRecord.registrationRequestDigest,
            'auxiliary',
            resourceId
          )
        )
      );
    }
    const actualResourceKeys = cleanupRecords.map(({ journalRecord }) =>
      resourceKey(
        journalRecord.registrationRequestDigest,
        journalRecord.businessResult.resourceRole!,
        journalRecord.businessResult.resourceId!
      )
    );
    const expected = Object.freeze(
      [...new Set(expectedResourceKeys)].sort(compareUnicodeCodePoints)
    );
    const actual = Object.freeze(
      [...actualResourceKeys].sort(compareUnicodeCodePoints)
    );
    if (new Set(actualResourceKeys).size !== actualResourceKeys.length) {
      throw new TypeError(
        'Hosted lifecycle cleanup resource set is ambiguous.'
      );
    }
    const closureStatus =
      hasUnresolved ||
      hasIncompleteCreate ||
      !sameCanonicalJson(actual, expected)
        ? ('audit-incomplete' as const)
        : ('zeroed' as const);
    const recordDigests = Object.freeze(
      records.map(({ archiveRecordDigest }) => archiveRecordDigest)
    );
    const base = Object.freeze({
      format:
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_TRANSPORT_JOURNAL_ARCHIVE_FAMILY_FORMAT,
      version: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
      namespaceId: firstIntent.namespaceId,
      repositoryCommit: firstIntent.repositoryCommit,
      planDigest: firstIntent.planDigest,
      frozenRunDigest: firstIntent.frozenRunDigest,
      runConfigArtifactBindingDigest:
        firstIntent.runConfigArtifactBindingDigest,
      runtimeResourceSetId: firstIntent.runtimeResourceSetId,
      closureStatus,
      records,
      recordDigests,
      creationRecordSetDigest: setRoot(
        creationRecords.map(({ journalRecord }) => journalRecord.recordDigest)
      ),
      cleanupRecordSetDigest: setRoot(
        cleanupRecords.map(({ journalRecord }) => journalRecord.recordDigest)
      ),
    });
    const value = Object.freeze({
      ...base,
      familyDigest: digestAgentCanonicalValue(base),
    });
    if (
      !safe(
        value,
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_ARCHIVE_FAMILY_MAXIMUM_BYTES
      )
    ) {
      throw new TypeError('Hosted lifecycle journal archive family is unsafe.');
    }
    return value;
  };

export const isAgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveFamily =
  (
    value: unknown
  ): value is AgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveFamily => {
    if (!exact(value, journalFamilyKeys)) return false;
    try {
      const candidate =
        value as AgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveFamily;
      if (candidate.records.length === 0) {
        return sameCanonicalJson(
          candidate,
          createAgentHostedRetrievalRuntimeResourceLifecycleEmptyTransportJournalArchiveFamily(
            {
              namespaceId: candidate.namespaceId,
              repositoryCommit: candidate.repositoryCommit,
              planDigest: candidate.planDigest,
              frozenRunDigest: candidate.frozenRunDigest,
              runConfigArtifactBindingDigest:
                candidate.runConfigArtifactBindingDigest,
              runtimeResourceSetId: candidate.runtimeResourceSetId,
            }
          )
        );
      }
      return sameCanonicalJson(
        candidate,
        createAgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveFamily(
          candidate.records
        )
      );
    } catch {
      return false;
    }
  };

export const matchAgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveFamily =
  (
    family: AgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveFamily,
    registrationResults: readonly AgentHostedRetrievalRuntimeResourceRegistrationResult[],
    cleanupArchiveRecords: readonly AgentHostedRetrievalRuntimeResourceCleanupArchiveRecord[],
    publicResourceMaterials: readonly AgentCapabilityProbePublicResourceMaterial[]
  ): boolean => {
    if (
      !isAgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveFamily(
        family
      ) ||
      family.closureStatus !== 'zeroed' ||
      registrationResults.length !==
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_EXACT_COUNT ||
      cleanupArchiveRecords.length !==
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_EXACT_COUNT ||
      publicResourceMaterials.length < 1 ||
      publicResourceMaterials.length >
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_EXACT_COUNT ||
      family.records.length <
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_EXACT_COUNT * 2
    ) {
      return false;
    }
    try {
      if (
        cleanupArchiveRecords.some(
          (record) =>
            !isAgentHostedRetrievalRuntimeResourceCleanupArchiveRecord(record)
        )
      )
        return false;
      const createRecords = family.records.filter(
        ({ journalRecord }) => journalRecord.operation === 'create'
      );
      const cleanupRecords = family.records.filter(
        ({ journalRecord }) => journalRecord.operation === 'delete'
      );
      const createByRequest = new Map(
        createRecords.map(
          (record) =>
            [record.journalRecord.registrationRequestDigest, record] as const
        )
      );
      const registrationByRequest = new Map(
        registrationResults.map(
          (result) => [result.registrationRequestDigest, result] as const
        )
      );
      const cleanupByRequest = new Map(
        cleanupArchiveRecords.map(
          (record) =>
            [
              record.registrationResult.registrationRequestDigest,
              record,
            ] as const
        )
      );
      const materialByDescriptor = new Map(
        publicResourceMaterials.map(
          (material) =>
            [material.descriptor.descriptorDigest, material] as const
        )
      );
      const requestKeys = [...createByRequest.keys()].sort(
        compareUnicodeCodePoints
      );
      const requiredMaterialDescriptors = [
        ...new Set(
          registrationResults.map(
            (result) =>
              result.registrationRequest.registrationIntent
                .publicResourceDescriptorDigest
          )
        ),
      ].sort(compareUnicodeCodePoints);
      if (
        createRecords.length !==
          AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_EXACT_COUNT ||
        createByRequest.size !== createRecords.length ||
        registrationByRequest.size !== registrationResults.length ||
        cleanupByRequest.size !== cleanupArchiveRecords.length ||
        !publicResourceMaterials.every((material) =>
          sameCanonicalJson(
            material,
            materialByDescriptor.get(material.descriptor.descriptorDigest)
          )
        ) ||
        !sameCanonicalJson(
          [...materialByDescriptor.keys()].sort(compareUnicodeCodePoints),
          requiredMaterialDescriptors
        ) ||
        !sameCanonicalJson(
          [...registrationByRequest.keys()].sort(compareUnicodeCodePoints),
          requestKeys
        ) ||
        !sameCanonicalJson(
          [...cleanupByRequest.keys()].sort(compareUnicodeCodePoints),
          requestKeys
        ) ||
        new Set(
          createRecords.map(
            ({ budgetClosureProjection }) =>
              budgetClosureProjection!.reservationId
          )
        ).size !== AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_EXACT_COUNT ||
        new Set(
          createRecords.map(
            ({ budgetClosureProjection }) =>
              budgetClosureProjection!.budgetReservationAuthorityDigest
          )
        ).size !== AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_EXACT_COUNT
      ) {
        return false;
      }
      for (const requestDigest of requestKeys) {
        const createRecord = createByRequest.get(requestDigest);
        const registrationResult = registrationByRequest.get(requestDigest);
        const cleanupArchiveRecord = cleanupByRequest.get(requestDigest);
        if (!createRecord || !registrationResult || !cleanupArchiveRecord) {
          return false;
        }
        const material = materialByDescriptor.get(
          registrationResult.registrationRequest.registrationIntent
            .publicResourceDescriptorDigest
        );
        const closure = createRecord.budgetClosureProjection;
        if (
          !material ||
          closure === null ||
          !matchAgentHostedRetrievalRuntimeResourceRegistrationResultLifecycleJournal(
            registrationResult,
            createRecord.journalRecord
          ) ||
          !matchAgentHostedRetrievalRuntimeResourceLifecycleBudgetClosure(
            closure,
            registrationResult.authority.budgetReservationAuthority,
            cleanupArchiveRecord.cleanupReceipt.completedAt
          ) ||
          !matchAgentHostedRetrievalRuntimeResourceLifecycleBudgetMaterial(
            closure,
            registrationResult.registrationRequest.registrationIntent,
            material
          )
        ) {
          return false;
        }
      }
      const consumedCleanupDigests = new Set<CanonicalDigest>();
      for (const archiveRecord of cleanupArchiveRecords) {
        const resultByKey = new Map(
          archiveRecord.cleanupReceipt.resourceResults.map(
            (result) =>
              [
                resourceKey(
                  archiveRecord.registrationResult.registrationRequestDigest,
                  result.resourceRole,
                  result.resourceId
                ),
                result,
              ] as const
          )
        );
        if (
          resultByKey.size !==
          archiveRecord.cleanupReceipt.resourceResults.length
        ) {
          return false;
        }
        const relevant = cleanupRecords.filter(
          ({ journalRecord }) =>
            journalRecord.registrationRequestDigest ===
            archiveRecord.registrationResult.registrationRequestDigest
        );
        const recordByKey = new Map(
          relevant.map(
            (record) =>
              [
                resourceKey(
                  record.journalRecord.registrationRequestDigest,
                  record.journalRecord.businessResult.resourceRole!,
                  record.journalRecord.businessResult.resourceId!
                ),
                record,
              ] as const
          )
        );
        if (
          recordByKey.size !== relevant.length ||
          !sameCanonicalJson(
            [...recordByKey.keys()].sort(compareUnicodeCodePoints),
            [...resultByKey.keys()].sort(compareUnicodeCodePoints)
          )
        )
          return false;
        for (const [key, record] of recordByKey) {
          const result = resultByKey.get(key);
          if (
            !result ||
            !matchAgentHostedRetrievalRuntimeResourceCleanupResultLifecycleJournal(
              result,
              record.journalRecord,
              archiveRecord.registrationResult,
              archiveRecord.storedCleanupClaimAuthorityReceipt
            )
          )
            return false;
          consumedCleanupDigests.add(record.archiveRecordDigest);
        }
      }
      return (
        consumedCleanupDigests.size === cleanupRecords.length &&
        new Set(
          cleanupRecords.map(
            ({ journalRecord }) => journalRecord.registrationRequestDigest
          )
        ).size === AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_EXACT_COUNT
      );
    } catch {
      return false;
    }
  };
