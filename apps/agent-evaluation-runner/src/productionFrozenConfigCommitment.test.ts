import { generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  G4_V8_MINIMUM_EVALUATION_CORPUS,
  createAgentEvaluationCorpusMaterialCatalog,
  createAgentEvaluationRestrictedMaterialLocator,
  digestAgentCanonicalValue,
  digestAgentEvaluationEncryptedHoldoutCorpus,
  getG4V8PublicEvaluationCaseMaterials,
  isAgentEvaluationFrozenConfigCommitment,
  type CanonicalDigest,
} from '@prodivix/ai';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import { afterEach, describe, expect, it } from 'vitest';
import { AGENT_EVALUATION_ATTESTATION_ENVIRONMENT_NAMES } from './attestationSigner';
import type { AgentEvaluationCoordinatorFilePort } from './coordinator';
import { AGENT_EVALUATION_RUNNER_ERROR_CODES } from './errors';
import { AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES } from './ledgerClient';
import {
  AGENT_EVALUATION_FROZEN_CONFIG_COMMITMENT_ENVIRONMENT_NAMES,
  produceAgentEvaluationFrozenConfigCommitment,
} from './productionFrozenConfigCommitment';
import { createNodeAgentEvaluationCoordinatorFilePort } from './productionFiles';
import { AGENT_EVALUATION_RUN_CONFIG_ENVIRONMENT_NAME } from './productionSignerFactory';
import {
  AGENT_EVALUATION_PRODUCTION_RUN_CONFIG_FILE_NAME,
  AGENT_EVALUATION_RUN_CONFIG_ARTIFACT_ENVIRONMENT_NAMES,
} from './productionRunConfigArtifact';
import {
  decodeAgentEvaluationFrozenRunConfig,
  requireProductionAgentEvaluationFrozenRunConfig,
} from './runConfig';
import { materializeAgentEvaluationTestProductionRunConfig } from './runConfig.fixture';

const exampleText = readFileSync(
  new URL(
    '../../../specs/evaluation/g4-real-model-evaluation.example.json',
    import.meta.url
  ),
  'utf8'
);
const exactCommit = '0123456789abcdef0123456789abcdef01234567';
const fixedInstant = '2026-08-08T00:00:00.000Z';
const sourceConfigPath = AGENT_EVALUATION_PRODUCTION_RUN_CONFIG_FILE_NAME;
const temporaryRoots: string[] = [];

const refreshMaterialCatalogDigests = (
  source: Record<string, unknown>
): void => {
  const material = source.material as Record<string, unknown>;
  const locatorInputs = material.restrictedEnvelopeLocators as Array<
    Record<string, unknown>
  >;
  const caseById = new Map(
    G4_V8_MINIMUM_EVALUATION_CORPUS.cases.map((evaluationCase) => [
      evaluationCase.caseId,
      evaluationCase,
    ])
  );
  const restrictedLocators = locatorInputs.map((input) => {
    const evaluationCase = caseById.get(String(input.caseId));
    if (!evaluationCase) throw new Error('Restricted case fixture is missing.');
    return createAgentEvaluationRestrictedMaterialLocator(evaluationCase, {
      resolverRef: String(input.resolverRef),
      encryptedMaterialDigest: input.encryptedMaterialDigest as CanonicalDigest,
      encryptionPolicyDigest: input.encryptionPolicyDigest as CanonicalDigest,
    });
  });
  const catalog = createAgentEvaluationCorpusMaterialCatalog(
    G4_V8_MINIMUM_EVALUATION_CORPUS.cases,
    getG4V8PublicEvaluationCaseMaterials(),
    restrictedLocators
  );
  material.catalogDigests = Object.freeze({
    caseSetDigest: catalog.caseSetDigest,
    publicMaterialSetDigest: catalog.publicMaterialSetDigest,
    restrictedMaterialManifestDigest: catalog.restrictedMaterialManifestDigest,
    catalogDigest: catalog.catalogDigest,
  });
};

const productionSource = (): Record<string, unknown> => {
  const source = JSON.parse(exampleText) as Record<string, unknown>;
  source.purpose = 'production';
  const graders = source.graders as Record<string, unknown>;
  const execution = source.execution as Record<string, unknown>;
  const humanReview = execution.humanReview as Record<string, unknown>;
  const adjudicationPolicy = humanReview.adjudicationPolicy as Record<
    string,
    unknown
  >;
  graders.disagreementPolicyDigest = adjudicationPolicy.policyDigest;
  refreshMaterialCatalogDigests(source);
  return materializeAgentEvaluationTestProductionRunConfig(source);
};

const frozen = (source: unknown = productionSource()) =>
  requireProductionAgentEvaluationFrozenRunConfig(
    decodeAgentEvaluationFrozenRunConfig(source, {
      clock: () => fixedInstant,
      expectedRepositoryCommit: exactCommit,
    }),
    exactCommit
  );

const keyMaterial = () => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return Object.freeze({
    privateKeyBase64Url: privateKey
      .export({ format: 'der', type: 'pkcs8' })
      .toString('base64url'),
    publicKeyBase64Url: publicKey
      .export({ format: 'der', type: 'spki' })
      .subarray(-32)
      .toString('base64url'),
  });
};

const makeRoot = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'prodivix-frozen-config-'));
  temporaryRoots.push(root);
  return root;
};

const harness = async () => {
  const source = productionSource();
  const config = frozen(source);
  const keys = keyMaterial();
  const root = await makeRoot();
  const planPath = join(root, 'plan.json');
  const runConfigPath = join(root, sourceConfigPath);
  const outputPath = join(root, 'commitment.json');
  const nativeFiles = createNodeAgentEvaluationCoordinatorFilePort({
    maximumBytes: 2_097_152,
  });
  await nativeFiles.createCanonicalJson(planPath, config.plan);
  await nativeFiles.createCanonicalJson(runConfigPath, source);
  const files: Pick<
    AgentEvaluationCoordinatorFilePort,
    'createCanonicalJson' | 'readCanonicalJson'
  > = {
    createCanonicalJson: nativeFiles.createCanonicalJson,
    readCanonicalJson: nativeFiles.readCanonicalJson,
  };
  const environment: Record<string, string> = {
    [AGENT_EVALUATION_FROZEN_CONFIG_COMMITMENT_ENVIRONMENT_NAMES.outputPath]:
      outputPath,
    [AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.repositoryCommit]: exactCommit,
    [AGENT_EVALUATION_RUN_CONFIG_ENVIRONMENT_NAME]: runConfigPath,
    [AGENT_EVALUATION_RUN_CONFIG_ARTIFACT_ENVIRONMENT_NAMES.sourcePlanArtifactName]:
      'g4-plan-123456789-2',
    [AGENT_EVALUATION_RUN_CONFIG_ARTIFACT_ENVIRONMENT_NAMES.sourcePlanArtifactDigest]: `sha256:${'a'.repeat(64)}`,
    [AGENT_EVALUATION_RUN_CONFIG_ARTIFACT_ENVIRONMENT_NAMES.sourcePlanWorkflowRunId]:
      '123456789',
    [AGENT_EVALUATION_RUN_CONFIG_ARTIFACT_ENVIRONMENT_NAMES.sourcePlanWorkflowRunAttempt]:
      '2',
    [AGENT_EVALUATION_ATTESTATION_ENVIRONMENT_NAMES.authorityId]:
      config.attestation.authorityId,
    [AGENT_EVALUATION_ATTESTATION_ENVIRONMENT_NAMES.keyId]:
      config.attestation.keyId,
    [AGENT_EVALUATION_ATTESTATION_ENVIRONMENT_NAMES.publicKey]:
      keys.publicKeyBase64Url,
    [AGENT_EVALUATION_ATTESTATION_ENVIRONMENT_NAMES.privateKey]:
      keys.privateKeyBase64Url,
    [AGENT_EVALUATION_ATTESTATION_ENVIRONMENT_NAMES.workflowName]:
      'g4-real-model-evaluation',
    [AGENT_EVALUATION_ATTESTATION_ENVIRONMENT_NAMES.workflowRunId]: '123456789',
    [AGENT_EVALUATION_ATTESTATION_ENVIRONMENT_NAMES.workflowRunAttempt]: '2',
    [AGENT_EVALUATION_ATTESTATION_ENVIRONMENT_NAMES.jobId]: 'full_shards',
    [AGENT_EVALUATION_ATTESTATION_ENVIRONMENT_NAMES.environmentDigest]:
      digestAgentCanonicalValue({ environment: 'g4-production' }),
  };
  return {
    config,
    environment,
    files,
    keys,
    outputPath,
    planPath,
    runConfigPath,
    source,
  };
};

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true }))
  );
});

const expectInvalid = async (action: Promise<unknown>): Promise<void> => {
  await expect(action).rejects.toMatchObject({
    code: AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid,
  });
};

describe('production frozen config commitment', () => {
  it('writes canonical 0600 bytes and binds the exact full_shards provenance', async () => {
    const fixture = await harness();

    const produced = await produceAgentEvaluationFrozenConfigCommitment({
      planPath: fixture.planPath,
      outputPath: fixture.outputPath,
      environment: fixture.environment,
      files: fixture.files,
    });

    expect(isAgentEvaluationFrozenConfigCommitment(produced.commitment)).toBe(
      true
    );
    expect(produced.commitment).toMatchObject({
      runConfigArtifactBinding: {
        sourcePlanArtifactName: 'g4-plan-123456789-2',
        sourcePlanArtifactDigest: `sha256:${'a'.repeat(64)}`,
        sourcePlanWorkflowRunId: '123456789',
        sourcePlanWorkflowRunAttempt: 2,
        runConfigFileName: sourceConfigPath,
      },
      sourceConfigDigest: fixture.config.sourceConfigDigest,
      frozenRunDigest: fixture.config.frozenRunDigest,
      planDigest: fixture.config.plan.planDigest,
      repositoryCommit: exactCommit,
      committedAt: fixture.config.plan.plannedAt,
      workflowName: 'g4-real-model-evaluation',
      workflowRunId: '123456789',
      jobId: 'full_shards',
      authorityId: fixture.config.attestation.authorityId,
      keyId: fixture.config.attestation.keyId,
      algorithm: 'Ed25519',
    });
    expect(produced.commitment.protectedEnvelopeAllowlist).toHaveLength(
      fixture.config.restrictedEnvelopeLocators.length
    );
    expect('workflowRunAttempt' in produced.commitment).toBe(false);
    expect(produced.encryptedCorpusDigest).toBe(
      digestAgentEvaluationEncryptedHoldoutCorpus(produced.commitment)
    );
    const bytes = await readFile(fixture.outputPath);
    expect(bytes.toString('utf8')).toBe(canonicalJsonText(produced.commitment));
    expect(bytes.at(-1)).not.toBe(0x0a);
    expect(bytes.toString('utf8')).not.toContain(keysPrivate(fixture.keys));
    if (process.platform !== 'win32') {
      expect((await stat(fixture.outputPath)).mode & 0o777).toBe(0o600);
    }
  }, 60_000);

  it('replays byte-for-byte across matrix workers and workflow retry attempts', async () => {
    const first = await harness();
    const secondRoot = await makeRoot();
    const secondOutput = join(secondRoot, 'commitment.json');
    const secondEnvironment = {
      ...first.environment,
      [AGENT_EVALUATION_FROZEN_CONFIG_COMMITMENT_ENVIRONMENT_NAMES.outputPath]:
        secondOutput,
      [AGENT_EVALUATION_ATTESTATION_ENVIRONMENT_NAMES.workflowRunAttempt]: '3',
    };

    const firstResult = await produceAgentEvaluationFrozenConfigCommitment({
      planPath: first.planPath,
      outputPath: first.outputPath,
      environment: first.environment,
      files: first.files,
    });
    const secondResult = await produceAgentEvaluationFrozenConfigCommitment({
      planPath: first.planPath,
      outputPath: secondOutput,
      environment: secondEnvironment,
      files: first.files,
    });

    expect(secondResult.commitment).toEqual(firstResult.commitment);
    expect(await readFile(secondOutput)).toEqual(
      await readFile(first.outputPath)
    );
  }, 60_000);

  it('fails closed on artifact config or job drift without creating output', async () => {
    const fixture = await harness();
    const driftedSource = productionSource();
    driftedSource.purpose = 'template';
    await writeFile(
      fixture.runConfigPath,
      canonicalJsonText(driftedSource),
      'utf8'
    );
    await expectInvalid(
      produceAgentEvaluationFrozenConfigCommitment({
        planPath: fixture.planPath,
        outputPath: fixture.outputPath,
        environment: fixture.environment,
        files: fixture.files,
      })
    );
    await expect(readFile(fixture.outputPath)).rejects.toMatchObject({
      code: 'ENOENT',
    });

    await writeFile(
      fixture.runConfigPath,
      canonicalJsonText(fixture.source),
      'utf8'
    );
    fixture.environment[AGENT_EVALUATION_ATTESTATION_ENVIRONMENT_NAMES.jobId] =
      'finalize';
    await expectInvalid(
      produceAgentEvaluationFrozenConfigCommitment({
        planPath: fixture.planPath,
        outputPath: fixture.outputPath,
        environment: fixture.environment,
        files: fixture.files,
      })
    );
    await expect(readFile(fixture.outputPath)).rejects.toMatchObject({
      code: 'ENOENT',
    });
  }, 60_000);

  it('preserves an existing output under exclusive-create failure', async () => {
    const fixture = await harness();
    const existing = Buffer.from('existing-authority', 'utf8');
    await writeFile(fixture.outputPath, existing, { flag: 'wx', mode: 0o600 });

    await expect(
      produceAgentEvaluationFrozenConfigCommitment({
        planPath: fixture.planPath,
        outputPath: fixture.outputPath,
        environment: fixture.environment,
        files: fixture.files,
      })
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.captureFailed,
    });
    expect(await readFile(fixture.outputPath)).toEqual(existing);
  }, 20_000);
});

const keysPrivate = (keys: Readonly<{ privateKeyBase64Url: string }>): string =>
  keys.privateKeyBase64Url;
