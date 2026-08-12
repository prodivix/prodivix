import {
  AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_FAMILIES,
  AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS,
  assertAgentModelEvaluationEvidenceArchiveFamilyPage,
  isAgentEvaluationProductionRunConfigArtifactBinding,
  isAgentCanonicalDigest,
  isAgentModelEvaluationEvidenceArchiveAttestation,
  isAgentModelEvaluationEvidenceArchiveAuthorityRoots,
  isAgentModelEvaluationEvidenceIndex,
  isAgentModelEvaluationEvidenceRoot,
  type AgentEvaluationEvidenceArchiveFamily,
  type AgentEvaluationProductionRunConfigArtifactBinding,
  type AgentModelEvaluationEvidenceArchiveCommitments,
  type AgentModelEvaluationEvidenceArchiveFamilyPage,
  type AgentModelEvaluationEvidenceArchiveFamilySource,
  type AgentModelEvaluationEvidenceArchiveSource,
  type AgentModelEvaluationManifest,
  type AgentModelEvaluationPlan,
} from '@prodivix/ai';
import {
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import { isPlainObject } from '@prodivix/shared/safety';
import type {
  AgentEvaluationEvidenceArchiveClosureRepository,
  AgentEvaluationEvidenceArchiveSourceFactory,
} from './evidenceArchiveExporter';
import {
  createEnvironmentAgentEvaluationLedgerClient,
  type AgentEvaluationLedgerClient,
  type CreateEnvironmentAgentEvaluationLedgerClientInput,
} from './ledgerClient';
import {
  AGENT_EVALUATION_RUNNER_ERROR_CODES,
  AgentEvaluationRunnerError,
} from './errors';

const identityPattern = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,255}$/u;
const cursorPattern = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u;
const repositoryCommitPattern = /^[0-9a-f]{40}$/u;
const maximumLeaseDurationMs = 2 * 60 * 60 * 1_000;

type EnvironmentLedgerInput = Omit<
  CreateEnvironmentAgentEvaluationLedgerClientInput,
  'planDigest'
>;

type ExportFamilyCommitment = Readonly<{
  family: AgentEvaluationEvidenceArchiveFamily;
  familyIndex: number;
  expectedRecordCount: number;
  expectedRecordSetDigest: string;
  expectedSemanticDigest: string;
  expectedTotalBytes: number;
  firstOrderKey: string | null;
  lastOrderKey: string | null;
}>;

type ExportLease = Readonly<{
  leaseId: string;
  leaseDigest: string;
  commitments: AgentModelEvaluationEvidenceArchiveCommitments;
  families: readonly ExportFamilyCommitment[];
  totalRecordCount: number;
  totalRecordBytes: number;
  createdAt: string;
  expiresAt: string;
}>;

const fail = (): never => {
  throw new AgentEvaluationRunnerError(
    AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid
  );
};

const exactKeys = (
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = []
): value is Record<string, unknown> => {
  if (!isPlainObject(value)) return false;
  const keys = Object.keys(value);
  const allowed = new Set([...required, ...optional]);
  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    keys.every((key) => allowed.has(key))
  );
};

const isCanonicalInstant = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString() === value;

const isCount = (value: unknown, maximum: number): value is number =>
  typeof value === 'number' &&
  Number.isSafeInteger(value) &&
  value >= 0 &&
  value <= maximum;

const isOrderKey = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length >= 1 &&
  value.length <= 8_192 &&
  value === value.trim();

const decodeCommitments = (
  value: unknown,
  plan: AgentModelEvaluationPlan,
  manifest: AgentModelEvaluationManifest,
  expected: Readonly<{
    runConfigArtifactBinding: AgentEvaluationProductionRunConfigArtifactBinding;
    sourceConfigDigest: string;
    frozenRunDigest: string;
  }>
): AgentModelEvaluationEvidenceArchiveCommitments => {
  if (
    !exactKeys(
      value,
      [
        'runConfigArtifactBinding',
        'sourceConfigDigest',
        'frozenRunDigest',
        'planDigest',
        'repositoryCommit',
        'evidenceSetDigest',
        'authorityPayloadDigest',
        'authorityAttestationDigest',
        'authorityRoots',
        'evaluationManifestDigest',
        'createdAt',
      ],
      ['reviewLeaseDigest']
    ) ||
    !isAgentEvaluationProductionRunConfigArtifactBinding(
      value.runConfigArtifactBinding
    ) ||
    !sameCanonicalJson(
      value.runConfigArtifactBinding,
      expected.runConfigArtifactBinding
    ) ||
    !isAgentCanonicalDigest(value.sourceConfigDigest) ||
    value.sourceConfigDigest !== expected.sourceConfigDigest ||
    !isAgentCanonicalDigest(value.frozenRunDigest) ||
    value.frozenRunDigest !== expected.frozenRunDigest ||
    value.planDigest !== plan.planDigest ||
    value.repositoryCommit !== plan.repositoryCommit ||
    value.evaluationManifestDigest !== manifest.manifestDigest ||
    value.runConfigArtifactBinding.sourceConfigDigest !==
      value.sourceConfigDigest ||
    value.runConfigArtifactBinding.frozenRunDigest !== value.frozenRunDigest ||
    value.runConfigArtifactBinding.planDigest !== value.planDigest ||
    value.runConfigArtifactBinding.repositoryCommit !==
      value.repositoryCommit ||
    !isAgentCanonicalDigest(value.evidenceSetDigest) ||
    !isAgentCanonicalDigest(value.authorityPayloadDigest) ||
    !isAgentCanonicalDigest(value.authorityAttestationDigest) ||
    !isAgentModelEvaluationEvidenceArchiveAuthorityRoots(
      value.authorityRoots
    ) ||
    (value.reviewLeaseDigest !== undefined &&
      !isAgentCanonicalDigest(value.reviewLeaseDigest)) ||
    value.reviewLeaseDigest !== value.authorityRoots.reviewLeaseDigest ||
    !isCanonicalInstant(value.createdAt)
  ) {
    return fail();
  }
  return Object.freeze({
    runConfigArtifactBinding: value.runConfigArtifactBinding,
    sourceConfigDigest: value.sourceConfigDigest,
    frozenRunDigest: value.frozenRunDigest,
    planDigest: value.planDigest,
    repositoryCommit: value.repositoryCommit,
    evidenceSetDigest: value.evidenceSetDigest,
    authorityPayloadDigest: value.authorityPayloadDigest,
    authorityAttestationDigest: value.authorityAttestationDigest,
    authorityRoots: value.authorityRoots,
    ...(value.reviewLeaseDigest === undefined
      ? {}
      : { reviewLeaseDigest: value.reviewLeaseDigest }),
    evaluationManifestDigest: value.evaluationManifestDigest,
    createdAt: value.createdAt,
  });
};

const decodeFamily = (
  value: unknown,
  familyIndex: number
): ExportFamilyCommitment => {
  const expectedFamily =
    AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_FAMILIES[familyIndex];
  if (
    expectedFamily === undefined ||
    !exactKeys(value, [
      'family',
      'familyIndex',
      'expectedRecordCount',
      'expectedRecordSetDigest',
      'expectedSemanticDigest',
      'expectedTotalBytes',
      'firstOrderKey',
      'lastOrderKey',
    ]) ||
    value.family !== expectedFamily ||
    value.familyIndex !== familyIndex ||
    !isCount(
      value.expectedRecordCount,
      AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumRecords
    ) ||
    !isAgentCanonicalDigest(value.expectedRecordSetDigest) ||
    !isAgentCanonicalDigest(value.expectedSemanticDigest) ||
    !isCount(
      value.expectedTotalBytes,
      AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumArchiveBytes
    ) ||
    (value.expectedRecordCount === 0
      ? value.firstOrderKey !== null || value.lastOrderKey !== null
      : !isOrderKey(value.firstOrderKey) ||
        !isOrderKey(value.lastOrderKey) ||
        compareUnicodeCodePoints(value.firstOrderKey, value.lastOrderKey) > 0)
  ) {
    return fail();
  }
  return Object.freeze({
    family: expectedFamily,
    familyIndex,
    expectedRecordCount: value.expectedRecordCount,
    expectedRecordSetDigest: value.expectedRecordSetDigest,
    expectedSemanticDigest: value.expectedSemanticDigest,
    expectedTotalBytes: value.expectedTotalBytes,
    firstOrderKey: value.firstOrderKey as string | null,
    lastOrderKey: value.lastOrderKey as string | null,
  });
};

const decodeLease = (
  value: unknown,
  plan: AgentModelEvaluationPlan,
  manifest: AgentModelEvaluationManifest,
  expected: Readonly<{
    runConfigArtifactBinding: AgentEvaluationProductionRunConfigArtifactBinding;
    sourceConfigDigest: string;
    frozenRunDigest: string;
  }>
): ExportLease => {
  if (
    !exactKeys(value, [
      'format',
      'version',
      'leaseId',
      'leaseDigest',
      'commitments',
      'families',
      'totalRecordCount',
      'totalRecordBytes',
      'createdAt',
      'expiresAt',
      'replayed',
    ]) ||
    value.format !== 'prodivix.agent-evaluation-export-lease' ||
    value.version !== 1 ||
    typeof value.leaseId !== 'string' ||
    !identityPattern.test(value.leaseId) ||
    !isAgentCanonicalDigest(value.leaseDigest) ||
    !Array.isArray(value.families) ||
    value.families.length !==
      AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_FAMILIES.length ||
    !isCount(
      value.totalRecordCount,
      AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumRecords
    ) ||
    !isCount(
      value.totalRecordBytes,
      AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumArchiveBytes
    ) ||
    !isCanonicalInstant(value.createdAt) ||
    !isCanonicalInstant(value.expiresAt) ||
    typeof value.replayed !== 'boolean'
  ) {
    return fail();
  }
  const createdAtMs = Date.parse(value.createdAt);
  const expiresAtMs = Date.parse(value.expiresAt);
  if (
    expiresAtMs <= createdAtMs ||
    expiresAtMs - createdAtMs > maximumLeaseDurationMs
  ) {
    return fail();
  }
  const commitments = decodeCommitments(
    value.commitments,
    plan,
    manifest,
    expected
  );
  const families = Object.freeze(
    value.families.map((family, index) => decodeFamily(family, index))
  );
  if (
    families.reduce(
      (total, family) => total + family.expectedRecordCount,
      0
    ) !== value.totalRecordCount ||
    families.reduce((total, family) => total + family.expectedTotalBytes, 0) !==
      value.totalRecordBytes
  ) {
    return fail();
  }
  const validatedReviewArtifacts = families.find(
    ({ family }) => family === 'validatedHumanReviewArtifacts'
  )!;
  if (
    validatedReviewArtifacts.expectedRecordCount > 1 ||
    (validatedReviewArtifacts.expectedRecordCount === 1) !==
      (commitments.reviewLeaseDigest !== undefined)
  ) {
    return fail();
  }
  return Object.freeze({
    leaseId: value.leaseId,
    leaseDigest: value.leaseDigest,
    commitments,
    families,
    totalRecordCount: value.totalRecordCount,
    totalRecordBytes: value.totalRecordBytes,
    createdAt: value.createdAt,
    expiresAt: value.expiresAt,
  });
};

const pageSource = (
  client: AgentEvaluationLedgerClient,
  lease: ExportLease,
  commitment: ExportFamilyCommitment
): AsyncIterable<AgentModelEvaluationEvidenceArchiveFamilyPage> =>
  Object.freeze({
    async *[Symbol.asyncIterator]() {
      let cursor: string | undefined;
      let pageOrdinal = 0;
      let firstRecordOrdinal = 0;
      let previousOrderKey: string | null = null;
      do {
        const raw = await client.getEvidenceExportFamilyPage(
          lease.leaseId,
          commitment.family,
          cursor
        );
        if (raw === null) {
          if (
            commitment.expectedRecordCount !== 0 ||
            firstRecordOrdinal !== 0
          ) {
            return fail();
          }
          return;
        }
        let page: AgentModelEvaluationEvidenceArchiveFamilyPage;
        try {
          page = assertAgentModelEvaluationEvidenceArchiveFamilyPage(
            raw,
            lease.leaseId,
            commitment.family,
            pageOrdinal,
            firstRecordOrdinal,
            previousOrderKey
          );
        } catch {
          return fail();
        }
        const nextOrdinal = firstRecordOrdinal + page.recordCount;
        if (
          nextOrdinal > commitment.expectedRecordCount ||
          (pageOrdinal === 0 &&
            page.records[0]!.orderKey !== commitment.firstOrderKey) ||
          (page.nextCursor === undefined &&
            (nextOrdinal !== commitment.expectedRecordCount ||
              page.records.at(-1)!.orderKey !== commitment.lastOrderKey)) ||
          (page.nextCursor !== undefined &&
            (page.nextCursor.length > 8_192 ||
              !cursorPattern.test(page.nextCursor)))
        ) {
          return fail();
        }
        yield page;
        firstRecordOrdinal = nextOrdinal;
        previousOrderKey = page.records.at(-1)!.orderKey;
        cursor = page.nextCursor;
        pageOrdinal += 1;
      } while (cursor !== undefined);
    },
  });

const sourceFor = (
  client: AgentEvaluationLedgerClient,
  lease: ExportLease
): AgentModelEvaluationEvidenceArchiveSource =>
  Object.freeze({
    leaseId: lease.leaseId,
    leaseDigest: lease.leaseDigest,
    commitments: lease.commitments,
    families: Object.freeze({
      async *[Symbol.asyncIterator]() {
        for (const commitment of lease.families) {
          const familySource: AgentModelEvaluationEvidenceArchiveFamilySource =
            Object.freeze({
              family: commitment.family,
              familyIndex: commitment.familyIndex,
              expectedRecordCount: commitment.expectedRecordCount,
              expectedRecordSetDigest: commitment.expectedRecordSetDigest,
              expectedTotalBytes: commitment.expectedTotalBytes,
              pages: pageSource(client, lease, commitment),
            });
          yield familySource;
        }
      },
    }),
  });

const openClient = (
  plan: AgentModelEvaluationPlan,
  input: EnvironmentLedgerInput
): AgentEvaluationLedgerClient => {
  const client = createEnvironmentAgentEvaluationLedgerClient({
    ...input,
    planDigest: plan.planDigest,
  });
  if (
    client.scope.planDigest !== plan.planDigest ||
    client.scope.repositoryCommit !== plan.repositoryCommit
  ) {
    return fail();
  }
  return client;
};

/** Opens one immutable, server-paged evidence source without loading a snapshot. */
export const createEnvironmentAgentEvaluationEvidenceArchiveSourceFactory = (
  input: EnvironmentLedgerInput = {}
): AgentEvaluationEvidenceArchiveSourceFactory =>
  Object.freeze({
    open: async ({
      plan,
      manifest,
      runConfigArtifactBinding,
      sourceConfigDigest,
      frozenRunDigest,
    }: Readonly<{
      plan: AgentModelEvaluationPlan;
      manifest: AgentModelEvaluationManifest;
      runConfigArtifactBinding: AgentEvaluationProductionRunConfigArtifactBinding;
      sourceConfigDigest: string;
      frozenRunDigest: string;
    }>) => {
      const client = openClient(plan, input);
      const lease = decodeLease(
        await client.openEvidenceExportLease(
          Object.freeze({
            runConfigArtifactBinding,
            sourceConfigDigest,
            frozenRunDigest,
          })
        ),
        plan,
        manifest,
        Object.freeze({
          runConfigArtifactBinding,
          sourceConfigDigest,
          frozenRunDigest,
        })
      );
      return sourceFor(client, lease);
    },
  });

const closureBody = (
  input: Parameters<
    AgentEvaluationEvidenceArchiveClosureRepository['putArchiveClosure']
  >[0]
) => {
  if (
    !repositoryCommitPattern.test(input.plan.repositoryCommit) ||
    !isAgentModelEvaluationEvidenceIndex(input.evidenceIndex) ||
    !isAgentModelEvaluationEvidenceArchiveAttestation(
      input.archiveAttestation
    ) ||
    !isAgentModelEvaluationEvidenceRoot(input.root) ||
    input.evidenceIndex.planDigest !== input.plan.planDigest ||
    input.evidenceIndex.repositoryCommit !== input.plan.repositoryCommit ||
    input.archiveAttestation.indexDigest !== input.evidenceIndex.indexDigest ||
    input.root.indexDigest !== input.evidenceIndex.indexDigest ||
    input.root.archiveAttestationDigest !==
      input.archiveAttestation.attestationDigest
  ) {
    return fail();
  }
  return Object.freeze({
    exportLeaseId: input.evidenceIndex.exportLeaseId,
    exportLeaseDigest: input.evidenceIndex.exportLeaseDigest,
    evidenceIndex: input.evidenceIndex,
    archiveAttestation: input.archiveAttestation,
    evidenceRoot: input.root,
  });
};

const exactClosureAcknowledgement = (
  value: unknown,
  expected: ReturnType<typeof closureBody>
): boolean =>
  exactKeys(
    value,
    [
      'exportLeaseId',
      'exportLeaseDigest',
      'evidenceIndex',
      'archiveAttestation',
      'evidenceRoot',
    ],
    ['replayed']
  ) &&
  (value.replayed === undefined || typeof value.replayed === 'boolean') &&
  sameCanonicalJson(
    Object.freeze({
      exportLeaseId: value.exportLeaseId,
      exportLeaseDigest: value.exportLeaseDigest,
      evidenceIndex: value.evidenceIndex,
      archiveAttestation: value.archiveAttestation,
      evidenceRoot: value.evidenceRoot,
    }),
    expected
  );

/** Persists the archive index, attestation and root as one exact replayable fact. */
export const createEnvironmentAgentEvaluationEvidenceArchiveClosureRepository =
  (
    input: EnvironmentLedgerInput = {}
  ): AgentEvaluationEvidenceArchiveClosureRepository =>
    Object.freeze({
      putArchiveClosure: async (
        closure: Parameters<
          AgentEvaluationEvidenceArchiveClosureRepository['putArchiveClosure']
        >[0]
      ) => {
        const expected = closureBody(closure);
        const client = openClient(closure.plan, input);
        let acknowledgement: unknown;
        try {
          acknowledgement = await client.putArchiveClosure(expected);
        } catch (caught) {
          try {
            acknowledgement = await client.getArchiveClosure();
          } catch {
            throw caught;
          }
        }
        if (!exactClosureAcknowledgement(acknowledgement, expected))
          return fail();
      },
    });
