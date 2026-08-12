import { createHash } from 'node:crypto';
import {
  AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_FAMILIES,
  AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS,
  AGENT_MODEL_EVALUATION_EVIDENCE_INDEX_FILE_NAME,
  AGENT_MODEL_EVALUATION_EVIDENCE_SHARD_DIRECTORY_NAME,
  assertAgentModelEvaluationEvidenceArchiveFamilyPage,
  createAgentModelEvaluationEvidenceArchiveFamilyDigestAccumulator,
  createAgentModelEvaluationEvidenceArchiveFamilySummary,
  createAgentModelEvaluationEvidenceArchivePhysicalBudget,
  createAgentModelEvaluationEvidenceArchivePhysicalFamilyUsageAccumulator,
  createAgentModelEvaluationEvidenceArchiveRecord,
  createAgentModelEvaluationEvidenceArchiveShardDescriptor,
  createAgentModelEvaluationEvidenceIndex,
  digestAgentCanonicalBytes,
  digestAgentModelEvaluationEvidenceArchiveSemanticRecord,
  digestAgentModelEvaluationEvidenceArchiveRecordSet,
  encodeAgentModelEvaluationEvidenceArchiveRecordLine,
  encodeAgentModelEvaluationEvidenceIndex,
  isAgentEvaluationCapabilitySpecificArchiveBudget,
  isAgentEvaluationAttemptAuthorityOwnerArchiveBudget,
  type AgentEvaluationEvidenceArchiveFamily,
  type AgentModelEvaluationEvidenceArchiveFamilySource,
  type AgentModelEvaluationEvidenceArchivePhysicalBudget,
  type AgentModelEvaluationEvidenceArchivePhysicalFamilyUsage,
  type AgentModelEvaluationEvidenceArchiveFamilySummary,
  type AgentModelEvaluationEvidenceArchiveShardDescriptor,
  type AgentModelEvaluationEvidenceArchiveSource,
  type AgentModelEvaluationEvidenceIndex,
  type CanonicalDigest,
} from '@prodivix/ai';
import {
  canonicalJsonText,
  compareUnicodeCodePoints,
} from '@prodivix/shared/canonical';
import {
  AGENT_EVALUATION_RUNNER_ERROR_CODES,
  AgentEvaluationRunnerError,
} from './errors';
import type {
  AgentEvaluationEvidenceArchiveFilePort,
  AgentEvaluationEvidenceArchiveFileReceipt,
  AgentEvaluationEvidenceArchiveStagingFiles,
} from './productionEvidenceArchiveFiles';

const utf8Encoder = new TextEncoder();

const responseInvalid = (): never => {
  throw new AgentEvaluationRunnerError(
    AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid
  );
};

const guarded = <T>(operation: () => T): T => {
  try {
    return operation();
  } catch (caught) {
    if (caught instanceof AgentEvaluationRunnerError) throw caught;
    return responseInvalid();
  }
};

class CanonicalDigestSetAccumulator {
  readonly #hash = createHash('sha256');
  #count = 0;
  #closed = false;

  constructor() {
    this.#hash.update('[');
  }

  append(value: CanonicalDigest): void {
    if (
      this.#closed ||
      this.#count >=
        AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumRecords ||
      !/^sha256-[0-9a-f]{64}$/u.test(value)
    ) {
      responseInvalid();
    }
    if (this.#count > 0) this.#hash.update(',');
    this.#hash.update(canonicalJsonText(value));
    this.#count += 1;
  }

  finalize(): CanonicalDigest {
    if (this.#closed) responseInvalid();
    this.#closed = true;
    this.#hash.update(']');
    return `sha256-${this.#hash.digest('hex')}`;
  }
}

const concatBytes = (
  chunks: readonly Uint8Array[],
  byteLength: number
): Uint8Array => {
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  if (offset !== byteLength) responseInvalid();
  return bytes;
};

type MutableShard = {
  chunks: Uint8Array[];
  byteLength: number;
  recordDigests: CanonicalDigest[];
  firstRecordIndex: number;
  firstOrderKey: string;
  lastOrderKey: string;
};

type FamilyAssembly = Readonly<{
  summary: AgentModelEvaluationEvidenceArchiveFamilySummary;
  shards: readonly AgentModelEvaluationEvidenceArchiveShardDescriptor[];
  physicalUsage: AgentModelEvaluationEvidenceArchivePhysicalFamilyUsage;
}>;

const emptyShard = (): MutableShard => ({
  chunks: [],
  byteLength: 0,
  recordDigests: [],
  firstRecordIndex: 0,
  firstOrderKey: '',
  lastOrderKey: '',
});

const assertFamilySource = (
  source: AgentModelEvaluationEvidenceArchiveFamilySource,
  expectedFamily: AgentEvaluationEvidenceArchiveFamily,
  expectedFamilyIndex: number
): void => {
  if (
    source.family !== expectedFamily ||
    source.familyIndex !== expectedFamilyIndex ||
    !Number.isSafeInteger(source.expectedRecordCount) ||
    source.expectedRecordCount < 0 ||
    source.expectedRecordCount >
      AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumRecords ||
    !Number.isSafeInteger(source.expectedTotalBytes) ||
    source.expectedTotalBytes < 0 ||
    source.expectedTotalBytes >
      AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumArchiveBytes ||
    (expectedFamily === 'capabilitySpecificReceipts' &&
      !isAgentEvaluationCapabilitySpecificArchiveBudget(
        source.expectedRecordCount,
        source.expectedTotalBytes
      )) ||
    (expectedFamily === 'attemptAuthorityOwnerReceipts' &&
      !isAgentEvaluationAttemptAuthorityOwnerArchiveBudget(
        source.expectedRecordCount,
        source.expectedTotalBytes
      )) ||
    !/^sha256-[0-9a-f]{64}$/u.test(source.expectedRecordSetDigest) ||
    source.pages === null ||
    typeof source.pages !== 'object' ||
    !(Symbol.asyncIterator in source.pages)
  ) {
    responseInvalid();
  }
};

const createOneChunkIterable = (bytes: Uint8Array): AsyncIterable<Uint8Array> =>
  Object.freeze({
    async *[Symbol.asyncIterator]() {
      yield bytes;
    },
  });

const assembleFamily = async (
  input: Readonly<{
    source: AgentModelEvaluationEvidenceArchiveFamilySource;
    expectedFamily: AgentEvaluationEvidenceArchiveFamily;
    expectedFamilyIndex: number;
    firstShardSequence: number;
    staging: AgentEvaluationEvidenceArchiveStagingFiles;
    expectedLeaseId: string;
  }>
): Promise<Readonly<FamilyAssembly & { leaseId?: string }>> => {
  const {
    source,
    expectedFamily,
    expectedFamilyIndex,
    firstShardSequence,
    staging,
  } = input;
  assertFamilySource(source, expectedFamily, expectedFamilyIndex);

  const semantic = guarded(() =>
    createAgentModelEvaluationEvidenceArchiveFamilyDigestAccumulator(
      expectedFamily
    )
  );
  const physicalUsage = guarded(() =>
    createAgentModelEvaluationEvidenceArchivePhysicalFamilyUsageAccumulator(
      expectedFamily
    )
  );
  const familyRecordSet = new CanonicalDigestSetAccumulator();
  const shards: AgentModelEvaluationEvidenceArchiveShardDescriptor[] = [];
  let shard = emptyShard();
  let recordIndex = 0;
  let pageOrdinal = 0;
  let totalValueBytes = 0;
  let previousOrderKey: string | undefined;
  let previousPageHadNextCursor = true;
  const leaseId = input.expectedLeaseId;

  const flushShard = async (): Promise<void> => {
    if (shard.recordDigests.length === 0) return;
    const bytes = concatBytes(shard.chunks, shard.byteLength);
    const bytesDigest = digestAgentCanonicalBytes(bytes);
    const descriptor = guarded(() =>
      createAgentModelEvaluationEvidenceArchiveShardDescriptor({
        sequence: firstShardSequence + shards.length,
        family: expectedFamily,
        familyShardIndex: shards.length,
        firstRecordIndex: shard.firstRecordIndex,
        lastRecordIndex:
          shard.firstRecordIndex + shard.recordDigests.length - 1,
        firstOrderKey: shard.firstOrderKey,
        lastOrderKey: shard.lastOrderKey,
        recordCount: shard.recordDigests.length,
        byteSize: bytes.byteLength,
        bytesDigest,
        recordSetDigest: digestAgentModelEvaluationEvidenceArchiveRecordSet(
          shard.recordDigests
        ),
      })
    );
    const receipt = await staging.createFile({
      relativePath: `${AGENT_MODEL_EVALUATION_EVIDENCE_SHARD_DIRECTORY_NAME}/${descriptor.fileName}`,
      expectedByteSize: descriptor.byteSize,
      expectedBytesDigest: descriptor.bytesDigest,
      chunks: createOneChunkIterable(bytes),
    });
    if (
      receipt.byteSize !== descriptor.byteSize ||
      receipt.bytesDigest !== descriptor.bytesDigest ||
      receipt.relativePath !==
        `${AGENT_MODEL_EVALUATION_EVIDENCE_SHARD_DIRECTORY_NAME}/${descriptor.fileName}`
    ) {
      responseInvalid();
    }
    shards.push(descriptor);
    shard = emptyShard();
  };

  for await (const rawPage of source.pages) {
    if (!previousPageHadNextCursor) responseInvalid();
    const page = guarded(() =>
      assertAgentModelEvaluationEvidenceArchiveFamilyPage(
        rawPage,
        leaseId,
        expectedFamily,
        pageOrdinal,
        recordIndex,
        previousOrderKey ?? null
      )
    );

    for (const sourceRecord of page.records) {
      const record = guarded(() =>
        createAgentModelEvaluationEvidenceArchiveRecord({
          family: expectedFamily,
          recordIndex,
          value: sourceRecord.value,
        })
      );
      if (
        sourceRecord.orderKey !== record.orderKey ||
        sourceRecord.recordDigest !==
          digestAgentModelEvaluationEvidenceArchiveSemanticRecord(
            expectedFamily,
            sourceRecord.value
          ) ||
        (previousOrderKey !== undefined &&
          compareUnicodeCodePoints(previousOrderKey, record.orderKey) >= 0)
      ) {
        responseInvalid();
      }
      const line = utf8Encoder.encode(
        guarded(() =>
          encodeAgentModelEvaluationEvidenceArchiveRecordLine(record)
        )
      );
      if (
        shard.byteLength > 0 &&
        shard.byteLength + line.byteLength >
          AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumShardBytes
      ) {
        await flushShard();
      }
      if (
        line.byteLength >
        AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumShardBytes
      ) {
        responseInvalid();
      }
      if (shard.recordDigests.length === 0) {
        shard.firstRecordIndex = recordIndex;
        shard.firstOrderKey = record.orderKey;
      }
      shard.lastOrderKey = record.orderKey;
      shard.chunks.push(line);
      shard.byteLength += line.byteLength;
      shard.recordDigests.push(record.recordDigest);
      familyRecordSet.append(sourceRecord.recordDigest);
      guarded(() => semantic.append(record.value));
      guarded(() => physicalUsage.append(record));
      totalValueBytes += sourceRecord.byteLength;
      if (
        !Number.isSafeInteger(totalValueBytes) ||
        totalValueBytes >
          AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumArchiveBytes
      ) {
        responseInvalid();
      }
      previousOrderKey = record.orderKey;
      recordIndex += 1;
    }
    previousPageHadNextCursor = page.nextCursor !== undefined;
    pageOrdinal += 1;
  }

  if (pageOrdinal > 0 && previousPageHadNextCursor) responseInvalid();
  await flushShard();
  const recordSetDigest = familyRecordSet.finalize();
  const semanticDigest = guarded(() => semantic.finalize());
  const finalizedPhysicalUsage = guarded(() => physicalUsage.finalize());
  if (
    recordIndex !== source.expectedRecordCount ||
    totalValueBytes !== source.expectedTotalBytes ||
    recordSetDigest !== source.expectedRecordSetDigest
  ) {
    responseInvalid();
  }
  const summary = guarded(() =>
    createAgentModelEvaluationEvidenceArchiveFamilySummary({
      family: expectedFamily,
      recordCount: recordIndex,
      semanticDigest,
      recordSetDigest,
      shardCount: shards.length,
      firstOrderKey: recordIndex === 0 ? null : shards[0]!.firstOrderKey,
      lastOrderKey: recordIndex === 0 ? null : shards.at(-1)!.lastOrderKey,
    })
  );
  return Object.freeze({
    summary,
    shards: Object.freeze(shards),
    physicalUsage: finalizedPhysicalUsage,
    leaseId,
  });
};

export type AgentEvaluationEvidenceArchiveStagedAssembly = Readonly<{
  index: AgentModelEvaluationEvidenceIndex;
  indexBytes: Uint8Array;
  indexFile: AgentEvaluationEvidenceArchiveFileReceipt;
  physicalFamilyUsages: readonly AgentModelEvaluationEvidenceArchivePhysicalFamilyUsage[];
  reservedPhysicalBudget: AgentModelEvaluationEvidenceArchivePhysicalBudget;
}>;

export type AgentEvaluationEvidenceArchiveAssembly<T> = Readonly<
  AgentEvaluationEvidenceArchiveStagedAssembly & {
    publicationValue: T;
    files: readonly AgentEvaluationEvidenceArchiveFileReceipt[];
  }
>;

export interface AgentEvaluationEvidenceArchiveAssembler {
  assemble<T>(
    input: Readonly<{
      source: AgentModelEvaluationEvidenceArchiveSource;
      archiveOutputPath: string;
      beforePublish: (
        staged: AgentEvaluationEvidenceArchiveStagedAssembly
      ) => Promise<T>;
    }>
  ): Promise<AgentEvaluationEvidenceArchiveAssembly<T>>;
}

/**
 * Writes repository-paged evidence in canonical family order. Memory remains
 * bounded to one 32 MiB shard plus the small index descriptor set.
 */
export const createAgentEvaluationEvidenceArchiveAssembler = (
  files: AgentEvaluationEvidenceArchiveFilePort
): AgentEvaluationEvidenceArchiveAssembler =>
  Object.freeze({
    assemble: async <T>({
      source,
      archiveOutputPath,
      beforePublish,
    }: Readonly<{
      source: AgentModelEvaluationEvidenceArchiveSource;
      archiveOutputPath: string;
      beforePublish: (
        staged: AgentEvaluationEvidenceArchiveStagedAssembly
      ) => Promise<T>;
    }>) => {
      if (
        typeof source.leaseId !== 'string' ||
        source.leaseId.length < 1 ||
        source.leaseId.length > 2_048 ||
        !/^sha256-[0-9a-f]{64}$/u.test(source.leaseDigest)
      ) {
        responseInvalid();
      }
      const result = await files.createArchive({
        archiveOutputPath,
        write: async (staging) => {
          const summaries: AgentModelEvaluationEvidenceArchiveFamilySummary[] =
            [];
          const shards: AgentModelEvaluationEvidenceArchiveShardDescriptor[] =
            [];
          const physicalFamilyUsages: AgentModelEvaluationEvidenceArchivePhysicalFamilyUsage[] =
            [];
          let familyIndex = 0;
          for await (const familySource of source.families) {
            const expectedFamily =
              AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_FAMILIES[familyIndex];
            if (expectedFamily === undefined) responseInvalid();
            const assembled = await assembleFamily({
              source: familySource,
              expectedFamily,
              expectedFamilyIndex: familyIndex,
              firstShardSequence: shards.length,
              staging,
              expectedLeaseId: source.leaseId,
            });
            summaries.push(assembled.summary);
            shards.push(...assembled.shards);
            physicalFamilyUsages.push(assembled.physicalUsage);
            familyIndex += 1;
          }
          if (
            familyIndex !==
            AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_FAMILIES.length
          ) {
            responseInvalid();
          }
          const index = guarded(() =>
            createAgentModelEvaluationEvidenceIndex({
              exportLeaseId: source.leaseId,
              exportLeaseDigest: source.leaseDigest,
              runConfigArtifactBinding:
                source.commitments.runConfigArtifactBinding,
              sourceConfigDigest: source.commitments.sourceConfigDigest,
              frozenRunDigest: source.commitments.frozenRunDigest,
              planDigest: source.commitments.planDigest,
              repositoryCommit: source.commitments.repositoryCommit,
              evidenceSetDigest: source.commitments.evidenceSetDigest,
              authorityPayloadDigest: source.commitments.authorityPayloadDigest,
              authorityAttestationDigest:
                source.commitments.authorityAttestationDigest,
              authorityRoots: source.commitments.authorityRoots,
              ...(source.commitments.reviewLeaseDigest === undefined
                ? {}
                : {
                    reviewLeaseDigest: source.commitments.reviewLeaseDigest,
                  }),
              evaluationManifestDigest:
                source.commitments.evaluationManifestDigest,
              families: Object.freeze(summaries),
              shards: Object.freeze(shards),
              createdAt: source.commitments.createdAt,
            })
          );
          const indexBytes = utf8Encoder.encode(
            guarded(() => encodeAgentModelEvaluationEvidenceIndex(index))
          );
          const reservedPhysicalBudget = guarded(() =>
            createAgentModelEvaluationEvidenceArchivePhysicalBudget({
              familyUsages: Object.freeze(physicalFamilyUsages),
              indexBytes: indexBytes.byteLength,
              rootBytes:
                AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumRootBytes,
            })
          );
          const indexFile = await staging.createFile({
            relativePath: AGENT_MODEL_EVALUATION_EVIDENCE_INDEX_FILE_NAME,
            expectedByteSize: indexBytes.byteLength,
            expectedBytesDigest: digestAgentCanonicalBytes(indexBytes),
            chunks: createOneChunkIterable(indexBytes),
          });
          const staged = Object.freeze({
            index,
            indexBytes,
            indexFile,
            physicalFamilyUsages: Object.freeze(physicalFamilyUsages),
            reservedPhysicalBudget,
          });
          const publicationValue = await beforePublish(staged);
          return Object.freeze({ ...staged, publicationValue });
        },
      });
      return Object.freeze({
        ...result.value,
        files: result.files,
      });
    },
  });
