import { compareUnicodeCodePoints } from '../packages/shared/src/canonical/index.ts';
import { isPlainObject } from '../packages/shared/src/safety/objectKeys.ts';
import { digestAgentCanonicalBytes } from '../packages/ai/src/domain/agentCanonical.ts';
import {
  AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_FAMILIES,
  createAgentModelEvaluationEvidenceArchiveFamilyDigestAccumulator,
  createAgentModelEvaluationEvidenceArchiveFamilySummary,
  createAgentModelEvaluationEvidenceArchiveOrderKey,
  createAgentModelEvaluationEvidenceArchiveRecord,
  createAgentModelEvaluationEvidenceArchiveRecordSetDigestAccumulator,
  createAgentModelEvaluationEvidenceArchiveShardDescriptor,
  encodeAgentModelEvaluationEvidenceArchiveRecordLine,
} from '../packages/ai/src/evaluation/agentEvaluationEvidenceArchive.ts';

const immutableTrees = new WeakSet();

const isImmutableJsonTree = (value, ancestors = new Set()) => {
  if (value === null || typeof value !== 'object') return true;
  if (immutableTrees.has(value)) return true;
  if (
    (!Array.isArray(value) && !isPlainObject(value)) ||
    !Object.isFrozen(value) ||
    ancestors.has(value)
  )
    return false;
  ancestors.add(value);
  const immutable = Object.values(
    Object.getOwnPropertyDescriptors(value)
  ).every(
    (descriptor) =>
      'value' in descriptor && isImmutableJsonTree(descriptor.value, ancestors)
  );
  ancestors.delete(value);
  if (immutable) immutableTrees.add(value);
  return immutable;
};

/** Only immutable fixture inputs can reuse work; mutable nested values always rebuild. */
export const memoizeFrozenFixtureFamily = (build) => {
  const cache = new WeakMap();
  return (family, values) => {
    if (!isImmutableJsonTree(values)) return build(family, values);
    let families = cache.get(values);
    if (!families) {
      families = new Map();
      cache.set(values, families);
    }
    if (!families.has(family)) families.set(family, build(family, values));
    return families.get(family);
  };
};

export const orderSemanticFixtureFamily = (family, values) =>
  Object.freeze(
    values
      .map((value) => ({
        value,
        orderKey: createAgentModelEvaluationEvidenceArchiveOrderKey(
          family,
          value
        ),
      }))
      .sort((left, right) =>
        compareUnicodeCodePoints(left.orderKey, right.orderKey)
      )
      .map(({ value }) => value)
  );

/** Reuse family bytes while rebuilding global shard positions and isolating returned buffers. */
export const createSemanticFixtureArchiveBuilder = ({
  maximumRecordsPerShard = 2_048,
} = {}) => {
  const buildFamily = memoizeFrozenFixtureFamily((family, input) => {
    const values = orderSemanticFixtureFamily(family, input);
    const semantic =
      createAgentModelEvaluationEvidenceArchiveFamilyDigestAccumulator(family);
    const recordSet =
      createAgentModelEvaluationEvidenceArchiveRecordSetDigestAccumulator();
    const records = values.map((value, recordIndex) => {
      semantic.append(value);
      const record = createAgentModelEvaluationEvidenceArchiveRecord({
        family,
        recordIndex,
        value,
      });
      recordSet.append(record.recordDigest);
      return record;
    });
    const chunks = [];
    for (
      let firstRecordIndex = 0;
      firstRecordIndex < records.length;
      firstRecordIndex += maximumRecordsPerShard
    ) {
      const chunk = records.slice(
        firstRecordIndex,
        firstRecordIndex + maximumRecordsPerShard
      );
      const bytes = Buffer.from(
        chunk.map(encodeAgentModelEvaluationEvidenceArchiveRecordLine).join(''),
        'utf8'
      );
      const chunkRecordSet =
        createAgentModelEvaluationEvidenceArchiveRecordSetDigestAccumulator();
      for (const record of chunk) chunkRecordSet.append(record.recordDigest);
      chunks.push({
        bytes,
        descriptorInput: {
          family,
          familyShardIndex: chunks.length,
          firstRecordIndex,
          lastRecordIndex: firstRecordIndex + chunk.length - 1,
          firstOrderKey: chunk[0].orderKey,
          lastOrderKey: chunk.at(-1).orderKey,
          recordCount: chunk.length,
          byteSize: bytes.byteLength,
          bytesDigest: digestAgentCanonicalBytes(bytes),
          recordSetDigest: chunkRecordSet.finalize(),
        },
      });
    }
    return {
      summary: createAgentModelEvaluationEvidenceArchiveFamilySummary({
        family,
        recordCount: records.length,
        semanticDigest: semantic.finalize(),
        recordSetDigest: recordSet.finalize(),
        shardCount: chunks.length,
        firstOrderKey: records[0]?.orderKey ?? null,
        lastOrderKey: records.at(-1)?.orderKey ?? null,
      }),
      chunks,
    };
  });
  const empty = Object.freeze([]);
  return (valuesByFamily) => {
    const families = [];
    const shards = [];
    const shardBytes = new Map();
    for (const family of AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_FAMILIES) {
      const material = buildFamily(family, valuesByFamily.get(family) ?? empty);
      families.push(material.summary);
      for (const { bytes, descriptorInput } of material.chunks) {
        const descriptor =
          createAgentModelEvaluationEvidenceArchiveShardDescriptor({
            ...descriptorInput,
            sequence: shards.length,
          });
        shards.push(descriptor);
        shardBytes.set(descriptor.fileName, Buffer.from(bytes));
      }
    }
    return Object.freeze({
      families: Object.freeze(families),
      shards: Object.freeze(shards),
      shardBytes,
    });
  };
};
