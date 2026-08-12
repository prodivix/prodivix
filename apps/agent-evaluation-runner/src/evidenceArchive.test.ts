import { lstat, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  AGENT_EVALUATION_ATTEMPT_AUTHORITY_OWNER_ARCHIVE_BUDGET,
  AGENT_EVALUATION_CAPABILITY_SPECIFIC_ARCHIVE_BUDGET,
  AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_FAMILIES,
  AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS,
  AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_SINGLETON_FAMILIES,
  AGENT_MODEL_EVALUATION_EVIDENCE_INDEX_FILE_NAME,
  createAgentEvaluationProductionRunConfigArtifactBinding,
  createAgentModelEvaluationEvidenceArchiveRecord,
  createAgentModelEvaluationEvidenceArchiveFamilyDigestAccumulator,
  digestAgentCanonicalValue,
  digestAgentModelEvaluationEvidenceArchiveSemanticRecord,
  digestAgentModelEvaluationEvidenceArchiveRecordSet,
  type AgentEvaluationEvidenceArchiveFamily,
  type AgentModelEvaluationEvidenceArchiveAuthorityRoots,
  type AgentModelEvaluationEvidenceArchiveFamilyPage,
  type AgentModelEvaluationEvidenceArchiveFamilySource,
  type AgentModelEvaluationEvidenceArchiveSource,
  type AgentModelEvaluationManifest,
  type AgentModelEvaluationPlan,
} from '@prodivix/ai';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAgentEvaluationEvidenceArchiveAssembler } from './evidenceArchive';
import { createAgentEvaluationEvidenceArchiveExporter } from './evidenceArchiveExporter';
import { AGENT_EVALUATION_RUNNER_ERROR_CODES } from './errors';
import { createNodeAgentEvaluationEvidenceArchiveFilePort } from './productionEvidenceArchiveFiles';

const utf8Encoder = new TextEncoder();
const digest = (seed: string): string => digestAgentCanonicalValue({ seed });
const leaseId = 'evaluation-export-lease:test';
const sourceConfigDigest = digest('source-config');
const frozenRunDigest = digest('frozen-run');
const planDigest = digest('plan');
const repositoryCommit = 'a'.repeat(40);
const sourceConfigBinding = Object.freeze({
  runConfigArtifactBinding:
    createAgentEvaluationProductionRunConfigArtifactBinding({
      sourcePlanArtifactName: 'g4-plan-1234567-1',
      sourcePlanArtifactDigest: `sha256:${'1'.repeat(64)}`,
      sourcePlanWorkflowRunId: '1234567',
      sourcePlanWorkflowRunAttempt: 1,
      runConfigFileName: 'production-run-config.json',
      runConfigByteLength: 1_024,
      runConfigCanonicalBytesDigest: sourceConfigDigest,
      sourceConfigDigest,
      frozenRunDigest,
      planDigest,
      repositoryCommit,
    }),
  sourceConfigDigest,
  frozenRunDigest,
});
const temporaryRoots: string[] = [];
const emptyFamilyDigest = (
  family: AgentEvaluationEvidenceArchiveFamily
): string =>
  createAgentModelEvaluationEvidenceArchiveFamilyDigestAccumulator(
    family
  ).finalize();

const authorityRoots = (
  input: {
    validatedHumanReviewArtifactSetDigest?: string;
    validatedHumanMetricObservationSetDigest?: string;
    reviewLeaseDigest?: string;
  } = {}
): AgentModelEvaluationEvidenceArchiveAuthorityRoots =>
  Object.freeze({
    capabilityProbeAdmissionSetDigest: emptyFamilyDigest(
      'capabilityProbeAdmissions'
    ),
    capabilityProbeReferenceReceiptSetDigest: emptyFamilyDigest(
      'capabilityProbeReferenceReceipts'
    ),
    runtimeFactSourceOwnerRegistrationSetDigest: emptyFamilyDigest(
      'runtimeFactSourceOwnerRegistrations'
    ),
    capabilityProbeProviderResourceCleanupSetDigest: emptyFamilyDigest(
      'capabilityProbeProviderResourceCleanups'
    ),
    hostedRetrievalRuntimeResourceLifecycleJournalSetDigest: emptyFamilyDigest(
      'hostedRetrievalRuntimeResourceLifecycleJournals'
    ),
    hostedRetrievalRuntimeResourceCleanupSetDigest: emptyFamilyDigest(
      'hostedRetrievalRuntimeResourceCleanups'
    ),
    capabilityEffectProviderRuntimeJournalSetDigest: emptyFamilyDigest(
      'capabilityEffectProviderRuntimeJournals'
    ),
    optionalCapabilityFactSourceSetDigest: emptyFamilyDigest(
      'optionalCapabilityFactSources'
    ),
    optionalCapabilityFactAuthoritySetDigest: emptyFamilyDigest(
      'optionalCapabilityFactAuthorities'
    ),
    endpointSmokeSetDigest: emptyFamilyDigest('endpointSmokeReceipts'),
    endpointSmokeDispatchIntentSetDigest: emptyFamilyDigest(
      'endpointSmokeDispatchIntents'
    ),
    endpointSmokeTransportReceiptSetDigest: emptyFamilyDigest(
      'endpointSmokeTransportReceipts'
    ),
    endpointSmokeResultSpoolReceiptSetDigest: emptyFamilyDigest(
      'endpointSmokeResultSpoolReceipts'
    ),
    endpointSmokeResultSpoolDispositionReceiptSetDigest: emptyFamilyDigest(
      'endpointSmokeResultSpoolDispositionReceipts'
    ),
    endpointSmokeValidationFailureReceiptSetDigest: emptyFamilyDigest(
      'endpointSmokeValidationFailureReceipts'
    ),
    preDispatchFailureReceiptSetDigest: emptyFamilyDigest(
      'preDispatchFailureReceipts'
    ),
    transportDispatchIntentSetDigest: emptyFamilyDigest(
      'transportDispatchIntents'
    ),
    transportReceiptSetDigest: emptyFamilyDigest('transportReceipts'),
    providerResultSpoolReceiptSetDigest: emptyFamilyDigest(
      'providerResultSpoolReceipts'
    ),
    providerResultSpoolDispositionReceiptSetDigest: emptyFamilyDigest(
      'providerResultSpoolDispositionReceipts'
    ),
    invocationTurnReceiptSetDigest: emptyFamilyDigest('invocationTurnReceipts'),
    invocationTurnSetReceiptSetDigest: emptyFamilyDigest(
      'invocationTurnSetReceipts'
    ),
    resultSubmissionReceiptSetDigest: emptyFamilyDigest(
      'resultSubmissionReceipts'
    ),
    attemptAuthorityOwnerReceiptSetDigest: emptyFamilyDigest(
      'attemptAuthorityOwnerReceipts'
    ),
    controlledRuntimeReceiptSetDigest: emptyFamilyDigest(
      'controlledRuntimeReceipts'
    ),
    capabilityExecutionReceiptSetDigest: emptyFamilyDigest(
      'capabilityExecutionReceipts'
    ),
    capabilitySpecificReceiptSetDigest: emptyFamilyDigest(
      'capabilitySpecificReceipts'
    ),
    providerCapabilityObservationReceiptSetDigest: emptyFamilyDigest(
      'providerCapabilityObservationReceipts'
    ),
    verificationAttemptGrantReceiptSetDigest: emptyFamilyDigest(
      'verificationAttemptGrantReceipts'
    ),
    validatedHumanReviewArtifactSetDigest:
      input.validatedHumanReviewArtifactSetDigest ??
      emptyFamilyDigest('validatedHumanReviewArtifacts'),
    validatedHumanMetricObservationSetDigest:
      input.validatedHumanMetricObservationSetDigest ??
      emptyFamilyDigest('validatedHumanMetricObservations'),
    ...(input.reviewLeaseDigest === undefined
      ? {}
      : { reviewLeaseDigest: input.reviewLeaseDigest }),
    reviewRasterScanReceiptSetDigest: emptyFamilyDigest(
      'reviewRasterScanReceipts'
    ),
    reviewCandidateRefSetDigest: emptyFamilyDigest('reviewCandidateRefs'),
    blindReviewMappingSetDigest: emptyFamilyDigest('blindReviewMappingRefs'),
    sourceReceiptSetDigest: emptyFamilyDigest('sourceReceipts'),
    executionReceiptSetDigest: emptyFamilyDigest('executionReceipts'),
    holdoutExecutionReceiptDigest: digest('holdoutExecutionReceipt'),
    secretCanarySetDigest: digest('secret-canary'),
    protectedHoldoutCanarySetDigest: digest('holdout-canary'),
  });

const semanticDigestField = (
  family: AgentEvaluationEvidenceArchiveFamily
): string => {
  switch (family) {
    case 'plan':
      return 'planDigest';
    case 'budgetLedger':
      return 'ledgerDigest';
    case 'metricReport':
    case 'graderReport':
    case 'humanReviewReport':
      return 'reportDigest';
    case 'holdoutExecutionReceipt':
      return 'receiptDigest';
    case 'authorityAttestation':
      return 'attestationDigest';
    case 'manifest':
      return 'manifestDigest';
    default:
      throw new Error(`Unexpected singleton family ${family}`);
  }
};

const pageFor = (
  family: AgentEvaluationEvidenceArchiveFamily,
  value: Readonly<Record<string, unknown>>,
  recordDigestOverride?: string
): AgentModelEvaluationEvidenceArchiveFamilyPage => {
  const record = createAgentModelEvaluationEvidenceArchiveRecord({
    family,
    recordIndex: 0,
    value,
  });
  const sourceRecord = Object.freeze({
    orderKey: record.orderKey,
    recordDigest:
      recordDigestOverride ??
      digestAgentModelEvaluationEvidenceArchiveSemanticRecord(family, value),
    contentDigest: digestAgentCanonicalValue(value),
    byteLength: utf8Encoder.encode(canonicalJsonText(value)).byteLength,
    value,
  });
  const base = Object.freeze({
    leaseId,
    family,
    pageOrdinal: 0,
    firstRecordOrdinal: 0,
    records: Object.freeze([sourceRecord]),
    recordCount: 1,
    recordBytes: sourceRecord.byteLength,
    pageRecordSetDigest: digestAgentCanonicalValue([sourceRecord.recordDigest]),
  });
  return Object.freeze({
    ...base,
    pageDigest: digestAgentCanonicalValue(base),
  });
};

const pages = (
  values: readonly AgentModelEvaluationEvidenceArchiveFamilyPage[]
): AsyncIterable<AgentModelEvaluationEvidenceArchiveFamilyPage> => ({
  async *[Symbol.asyncIterator]() {
    yield* values;
  },
});

const source = (
  options: Readonly<{
    corruptFamily?: AgentEvaluationEvidenceArchiveFamily;
    validatedHumanReview?: boolean;
    commitmentReviewLeaseDigest?: string;
    authorityReviewLeaseDigest?: string;
    configBinding?: typeof sourceConfigBinding;
  }> = {}
): AgentModelEvaluationEvidenceArchiveSource => {
  const reviewArtifactValue = Object.freeze({
    artifactId: 'validated-human-review.test',
    artifactDigest: digest('validated-human-review'),
  });
  const reviewArtifactSemantic =
    createAgentModelEvaluationEvidenceArchiveFamilyDigestAccumulator(
      'validatedHumanReviewArtifacts'
    );
  if (options.validatedHumanReview) {
    reviewArtifactSemantic.append(reviewArtifactValue);
  }
  const humanMetricObservationValue = Object.freeze({
    observationId: 'validated-human-metric-observation.test',
    observationDigest: digest('validated-human-metric-observation'),
  });
  const humanMetricObservationSemantic =
    createAgentModelEvaluationEvidenceArchiveFamilyDigestAccumulator(
      'validatedHumanMetricObservations'
    );
  if (options.validatedHumanReview) {
    humanMetricObservationSemantic.append(humanMetricObservationValue);
  }
  const familySources = AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_FAMILIES.map(
    (family, familyIndex): AgentModelEvaluationEvidenceArchiveFamilySource => {
      if (
        family === 'validatedHumanReviewArtifacts' &&
        options.validatedHumanReview
      ) {
        const page = pageFor(family, reviewArtifactValue);
        return Object.freeze({
          family,
          familyIndex,
          expectedRecordCount: 1,
          expectedRecordSetDigest:
            digestAgentModelEvaluationEvidenceArchiveRecordSet(
              page.records.map(({ recordDigest }) => recordDigest)
            ),
          expectedTotalBytes: page.recordBytes,
          pages: pages([page]),
        });
      }
      if (
        family === 'validatedHumanMetricObservations' &&
        options.validatedHumanReview
      ) {
        const page = pageFor(family, humanMetricObservationValue);
        return Object.freeze({
          family,
          familyIndex,
          expectedRecordCount: 1,
          expectedRecordSetDigest:
            digestAgentModelEvaluationEvidenceArchiveRecordSet(
              page.records.map(({ recordDigest }) => recordDigest)
            ),
          expectedTotalBytes: page.recordBytes,
          pages: pages([page]),
        });
      }
      const singleton = (
        AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_SINGLETON_FAMILIES as readonly string[]
      ).includes(family);
      if (!singleton) {
        return Object.freeze({
          family,
          familyIndex,
          expectedRecordCount: 0,
          expectedRecordSetDigest:
            digestAgentModelEvaluationEvidenceArchiveRecordSet([]),
          expectedTotalBytes: 0,
          pages: pages([]),
        });
      }
      const value = Object.freeze({
        [semanticDigestField(family)]: digest(family),
      });
      const page = pageFor(
        family,
        value,
        options.corruptFamily === family
          ? digest('corrupted-record')
          : undefined
      );
      return Object.freeze({
        family,
        familyIndex,
        expectedRecordCount: 1,
        expectedRecordSetDigest:
          digestAgentModelEvaluationEvidenceArchiveRecordSet(
            page.records.map(({ recordDigest }) => recordDigest)
          ),
        expectedTotalBytes: page.recordBytes,
        pages: pages([page]),
      });
    }
  );
  return Object.freeze({
    leaseId,
    leaseDigest: digest('lease'),
    commitments: Object.freeze({
      ...(options.configBinding ?? sourceConfigBinding),
      planDigest,
      repositoryCommit,
      evidenceSetDigest: digest('evidence-set'),
      authorityPayloadDigest: digest('authority-payload'),
      authorityAttestationDigest: digest('authorityAttestation'),
      authorityRoots: authorityRoots({
        validatedHumanReviewArtifactSetDigest:
          reviewArtifactSemantic.finalize(),
        validatedHumanMetricObservationSetDigest:
          humanMetricObservationSemantic.finalize(),
        ...(options.authorityReviewLeaseDigest === undefined
          ? {}
          : {
              reviewLeaseDigest: options.authorityReviewLeaseDigest,
            }),
      }),
      ...(options.commitmentReviewLeaseDigest === undefined
        ? {}
        : { reviewLeaseDigest: options.commitmentReviewLeaseDigest }),
      evaluationManifestDigest: digest('manifest'),
      createdAt: '2026-01-15T00:00:00.000Z',
    }),
    families: {
      async *[Symbol.asyncIterator]() {
        yield* familySources;
      },
    },
  });
};

const createRoot = async (): Promise<string> => {
  const value = await mkdtemp(join(tmpdir(), 'prodivix-g4-stream-archive-'));
  temporaryRoots.push(value);
  return value;
};

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true }))
  );
});

describe('streaming evidence archive assembler', () => {
  it('streams every canonical family, publishes content-addressed shards, and writes the index last', async () => {
    const root = await createRoot();
    const archiveOutputPath = join(root, 'archive');
    const assembler = createAgentEvaluationEvidenceArchiveAssembler(
      createNodeAgentEvaluationEvidenceArchiveFilePort({
        randomSuffix: () => 'a'.repeat(32),
        syncDirectory: async () => undefined,
      })
    );

    const result = await assembler.assemble({
      source: source(),
      archiveOutputPath,
      beforePublish: async () => undefined,
    });

    expect(result.index.exportLeaseId).toBe(leaseId);
    expect(result.index.families.map(({ family }) => family)).toEqual(
      AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_FAMILIES
    );
    expect(result.index.totalRecordCount).toBe(
      AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_SINGLETON_FAMILIES.length
    );
    expect(result.physicalFamilyUsages).toHaveLength(46);
    expect(result.reservedPhysicalBudget.familyUsages).toEqual(
      result.physicalFamilyUsages
    );
    expect(result.reservedPhysicalBudget.totalShardBytes).toBe(
      result.index.totalShardBytes
    );
    expect(result.reservedPhysicalBudget.indexBytes).toBe(
      result.indexBytes.byteLength
    );
    expect(result.reservedPhysicalBudget.rootBytes).toBe(
      AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumRootBytes
    );
    expect(result.reservedPhysicalBudget.totalArchiveBytes).toBeLessThanOrEqual(
      AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumArchiveBytes
    );
    expect(result.files.at(-1)?.relativePath).toBe(
      AGENT_MODEL_EVALUATION_EVIDENCE_INDEX_FILE_NAME
    );
    await expect(
      readFile(
        join(
          archiveOutputPath,
          AGENT_MODEL_EVALUATION_EVIDENCE_INDEX_FILE_NAME
        ),
        'utf8'
      )
    ).resolves.toBe(canonicalJsonText(result.index));
    for (const shard of result.index.shards) {
      await expect(
        readFile(join(archiveOutputPath, 'shards', shard.fileName))
      ).resolves.toHaveLength(shard.byteSize);
    }
  });

  it('rejects a repository page whose immutable archive record digest drifts', async () => {
    const root = await createRoot();
    const archiveOutputPath = join(root, 'archive');
    const assembler = createAgentEvaluationEvidenceArchiveAssembler(
      createNodeAgentEvaluationEvidenceArchiveFilePort({
        randomSuffix: () => 'b'.repeat(32),
        syncDirectory: async () => undefined,
      })
    );

    await expect(
      assembler.assemble({
        source: source({ corruptFamily: 'plan' }),
        archiveOutputPath,
        beforePublish: async () => undefined,
      })
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid,
    });
  });

  it.each([
    {
      family: 'capabilitySpecificReceipts' as const,
      maximumRecordCount:
        AGENT_EVALUATION_CAPABILITY_SPECIFIC_ARCHIVE_BUDGET.maximumRecordCount,
    },
    {
      family: 'attemptAuthorityOwnerReceipts' as const,
      maximumRecordCount:
        AGENT_EVALUATION_ATTEMPT_AUTHORITY_OWNER_ARCHIVE_BUDGET.maximumRecordCount,
    },
  ])(
    'rejects an oversized $family source before iterating its pages',
    async ({ family, maximumRecordCount }) => {
      const root = await createRoot();
      const baseline = source();
      let oversizedPagesIterated = false;
      const oversizedSource: AgentModelEvaluationEvidenceArchiveSource =
        Object.freeze({
          ...baseline,
          families: {
            async *[Symbol.asyncIterator]() {
              for await (const familySource of baseline.families) {
                if (familySource.family !== family) {
                  yield familySource;
                  continue;
                }
                yield Object.freeze({
                  ...familySource,
                  expectedRecordCount: maximumRecordCount + 1,
                  pages: {
                    async *[Symbol.asyncIterator]() {
                      oversizedPagesIterated = true;
                      for await (const page of familySource.pages) {
                        yield page;
                      }
                    },
                  },
                });
              }
            },
          },
        });
      const assembler = createAgentEvaluationEvidenceArchiveAssembler(
        createNodeAgentEvaluationEvidenceArchiveFilePort({
          randomSuffix: () => '9'.repeat(32),
          syncDirectory: async () => undefined,
        })
      );

      await expect(
        assembler.assemble({
          source: oversizedSource,
          archiveOutputPath: join(root, 'archive'),
          beforePublish: async () => undefined,
        })
      ).rejects.toMatchObject({
        code: AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid,
      });
      expect(oversizedPagesIterated).toBe(false);
    }
  );

  it('propagates one exact review lease through the streamed index', async () => {
    const root = await createRoot();
    const reviewLeaseDigest = digest('review-lease');
    const assembler = createAgentEvaluationEvidenceArchiveAssembler(
      createNodeAgentEvaluationEvidenceArchiveFilePort({
        randomSuffix: () => 'e'.repeat(32),
        syncDirectory: async () => undefined,
      })
    );

    const result = await assembler.assemble({
      source: source({
        validatedHumanReview: true,
        commitmentReviewLeaseDigest: reviewLeaseDigest,
        authorityReviewLeaseDigest: reviewLeaseDigest,
      }),
      archiveOutputPath: join(root, 'archive'),
      beforePublish: async () => undefined,
    });

    expect(result.index.reviewLeaseDigest).toBe(reviewLeaseDigest);
    expect(result.index.authorityRoots.reviewLeaseDigest).toBe(
      reviewLeaseDigest
    );
  });

  it.each([
    {
      label: 'missing',
      options: { validatedHumanReview: true },
    },
    {
      label: 'extra',
      options: {
        commitmentReviewLeaseDigest: digest('review-lease'),
        authorityReviewLeaseDigest: digest('review-lease'),
      },
    },
    {
      label: 'drifted',
      options: {
        validatedHumanReview: true,
        commitmentReviewLeaseDigest: digest('review-lease-a'),
        authorityReviewLeaseDigest: digest('review-lease-b'),
      },
    },
  ] as const)(
    'rejects a $label review lease commitment',
    async ({ options }) => {
      const root = await createRoot();
      const assembler = createAgentEvaluationEvidenceArchiveAssembler(
        createNodeAgentEvaluationEvidenceArchiveFilePort({
          randomSuffix: () => 'f'.repeat(32),
          syncDirectory: async () => undefined,
        })
      );

      await expect(
        assembler.assemble({
          source: source(options),
          archiveOutputPath: join(root, 'archive'),
          beforePublish: async () => undefined,
        })
      ).rejects.toMatchObject({
        code: AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid,
      });
    }
  );
});

describe('evidence archive exporter', () => {
  const archivePlan = Object.freeze({
    planDigest: digest('plan'),
    repositoryCommit: 'a'.repeat(40),
  }) as AgentModelEvaluationPlan;
  const archiveManifest = Object.freeze({
    manifestDigest: digest('manifest'),
    outcome: 'satisfied',
  }) as AgentModelEvaluationManifest;
  const signer = Object.freeze({
    identity: () =>
      Object.freeze({
        authorityId: 'evaluation-authority',
        keyId: 'evaluation-key',
        publicKeyBase64Url: 'A'.repeat(43),
      }),
    signArchive: vi.fn(async () => 'A'.repeat(86)),
    verify: vi.fn(async () => true),
  });

  it('persists the signed archive closure before publishing the standalone root', async () => {
    const root = await createRoot();
    const calls: string[] = [];
    const putArchiveClosure = vi.fn(async () => {
      calls.push('persist');
    });
    const createCanonicalJson = vi.fn(async () => {
      calls.push('root');
    });
    const open = vi.fn(async () => source());
    const exporter = createAgentEvaluationEvidenceArchiveExporter({
      sourceFactory: { open },
      sourceConfigBindingSource: { load: async () => sourceConfigBinding },
      assembler: createAgentEvaluationEvidenceArchiveAssembler(
        createNodeAgentEvaluationEvidenceArchiveFilePort({
          randomSuffix: () => 'c'.repeat(32),
          syncDirectory: async () => undefined,
        })
      ),
      signerFactory: { create: async () => signer },
      repository: { putArchiveClosure },
      rootFiles: { createCanonicalJson },
      now: () => '2026-01-15T00:00:01.000Z',
    });

    const evidenceRoot = await exporter.export({
      plan: archivePlan,
      manifest: archiveManifest,
      archiveOutputPath: join(root, 'archive'),
      rootOutputPath: join(root, 'evidence-root.json'),
    });

    expect(evidenceRoot.version).toBe(2);
    expect(evidenceRoot.runConfigArtifactBinding).toEqual(
      sourceConfigBinding.runConfigArtifactBinding
    );
    expect(evidenceRoot.sourceConfigDigest).toBe(
      sourceConfigBinding.sourceConfigDigest
    );
    expect(evidenceRoot.frozenRunDigest).toBe(
      sourceConfigBinding.frozenRunDigest
    );
    expect(open).toHaveBeenCalledWith({
      plan: archivePlan,
      manifest: archiveManifest,
      ...sourceConfigBinding,
    });
    expect(evidenceRoot.archiveAttestation.signature).toBe('A'.repeat(86));
    expect(calls).toEqual(['persist', 'root']);
  });

  it('leaves no standalone root when durable archive closure persistence fails', async () => {
    const root = await createRoot();
    const createCanonicalJson = vi.fn(async () => undefined);
    const exporter = createAgentEvaluationEvidenceArchiveExporter({
      sourceFactory: { open: async () => source() },
      sourceConfigBindingSource: { load: async () => sourceConfigBinding },
      assembler: createAgentEvaluationEvidenceArchiveAssembler(
        createNodeAgentEvaluationEvidenceArchiveFilePort({
          randomSuffix: () => 'd'.repeat(32),
          syncDirectory: async () => undefined,
        })
      ),
      signerFactory: { create: async () => signer },
      repository: {
        putArchiveClosure: async () => {
          throw new Error('durable closure failure');
        },
      },
      rootFiles: { createCanonicalJson },
      now: () => '2026-01-15T00:00:01.000Z',
    });

    await expect(
      exporter.export({
        plan: archivePlan,
        manifest: archiveManifest,
        archiveOutputPath: join(root, 'archive'),
        rootOutputPath: join(root, 'evidence-root.json'),
      })
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.captureFailed,
    });
    expect(createCanonicalJson).not.toHaveBeenCalled();
    await expect(lstat(join(root, 'archive'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('rejects a Backend lease whose tracked run-config binding drifts', async () => {
    const root = await createRoot();
    const assembler = createAgentEvaluationEvidenceArchiveAssembler(
      createNodeAgentEvaluationEvidenceArchiveFilePort({
        randomSuffix: () => '1'.repeat(32),
        syncDirectory: async () => undefined,
      })
    );
    const exporter = createAgentEvaluationEvidenceArchiveExporter({
      sourceFactory: {
        open: async () =>
          source({
            configBinding: Object.freeze({
              ...sourceConfigBinding,
              frozenRunDigest: digest('drifted-frozen-run'),
            }),
          }),
      },
      sourceConfigBindingSource: { load: async () => sourceConfigBinding },
      assembler,
      signerFactory: { create: async () => signer },
      repository: { putArchiveClosure: vi.fn(async () => undefined) },
      rootFiles: { createCanonicalJson: vi.fn(async () => undefined) },
      now: () => '2026-01-15T00:00:01.000Z',
    });

    await expect(
      exporter.export({
        plan: archivePlan,
        manifest: archiveManifest,
        archiveOutputPath: join(root, 'archive'),
        rootOutputPath: join(root, 'evidence-root.json'),
      })
    ).rejects.toThrow('source partition binding is invalid');
    await expect(lstat(join(root, 'archive'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });
});
