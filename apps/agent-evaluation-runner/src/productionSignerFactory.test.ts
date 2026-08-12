import { readFileSync } from 'node:fs';
import { generateKeyPairSync } from 'node:crypto';
import { resolve } from 'node:path';
import {
  G4_V8_MINIMUM_EVALUATION_CORPUS,
  createAgentEvaluationCorpusMaterialCatalog,
  createAgentEvaluationRestrictedMaterialLocator,
  digestAgentCanonicalValue,
  getG4V8PublicEvaluationCaseMaterials,
  type CanonicalDigest,
} from '@prodivix/ai';
import { describe, expect, it, vi } from 'vitest';
import { AGENT_EVALUATION_ATTESTATION_ENVIRONMENT_NAMES } from './attestationSigner';
import type { AgentEvaluationCoordinatorFilePort } from './coordinator';
import { AGENT_EVALUATION_RUNNER_ERROR_CODES } from './errors';
import {
  AGENT_EVALUATION_RUN_CONFIG_ENVIRONMENT_NAME,
  createProductionAgentEvaluationAuthoritySignerFactory,
  loadProductionAgentEvaluationFrozenRunConfigBindingForPlan,
} from './productionSignerFactory';
import { AGENT_EVALUATION_RUN_CONFIG_ARTIFACT_ENVIRONMENT_NAMES } from './productionRunConfigArtifact';
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
const fixedInstant = '2026-08-08T00:00:00.000Z';
const exactCommit = '0123456789abcdef0123456789abcdef01234567';
const configPath = resolve('state', 'production-run-config.json');
const artifactDigest = `sha256:${'a'.repeat(64)}`;
const publicKeyBase64Url = generateKeyPairSync('ed25519')
  .publicKey.export({ format: 'der', type: 'spki' })
  .subarray(-32)
  .toString('base64url');

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

const productionSource = (): unknown => {
  const source = JSON.parse(exampleText) as Record<string, unknown>;
  source.purpose = 'production';
  refreshMaterialCatalogDigests(source);
  return materializeAgentEvaluationTestProductionRunConfig(source);
};

const frozen = () =>
  requireProductionAgentEvaluationFrozenRunConfig(
    decodeAgentEvaluationFrozenRunConfig(productionSource(), {
      clock: () => fixedInstant,
      expectedRepositoryCommit: exactCommit,
    }),
    exactCommit
  );

const files = (source: unknown): AgentEvaluationCoordinatorFilePort => ({
  readJson: vi.fn(async () => source),
  readCanonicalJson: vi.fn(async () => source),
  writeCanonicalJson: vi.fn(async () => undefined),
  createCanonicalJson: vi.fn(async () => undefined),
});

const environment = (
  authorityId: string,
  keyId: string
): Record<string, string> => ({
  [AGENT_EVALUATION_RUN_CONFIG_ENVIRONMENT_NAME]: configPath,
  [AGENT_EVALUATION_RUN_CONFIG_ARTIFACT_ENVIRONMENT_NAMES.sourcePlanArtifactName]:
    'g4-plan-1234567-2',
  [AGENT_EVALUATION_RUN_CONFIG_ARTIFACT_ENVIRONMENT_NAMES.sourcePlanArtifactDigest]:
    artifactDigest,
  [AGENT_EVALUATION_RUN_CONFIG_ARTIFACT_ENVIRONMENT_NAMES.sourcePlanWorkflowRunId]:
    '1234567',
  [AGENT_EVALUATION_RUN_CONFIG_ARTIFACT_ENVIRONMENT_NAMES.sourcePlanWorkflowRunAttempt]:
    '2',
  [AGENT_EVALUATION_ATTESTATION_ENVIRONMENT_NAMES.authorityId]: authorityId,
  [AGENT_EVALUATION_ATTESTATION_ENVIRONMENT_NAMES.keyId]: keyId,
  [AGENT_EVALUATION_ATTESTATION_ENVIRONMENT_NAMES.publicKey]:
    publicKeyBase64Url,
  [AGENT_EVALUATION_ATTESTATION_ENVIRONMENT_NAMES.workflowName]:
    'g4-real-model-evaluation',
  [AGENT_EVALUATION_ATTESTATION_ENVIRONMENT_NAMES.workflowRunId]: '1234567',
  [AGENT_EVALUATION_ATTESTATION_ENVIRONMENT_NAMES.workflowRunAttempt]: '2',
  [AGENT_EVALUATION_ATTESTATION_ENVIRONMENT_NAMES.jobId]: 'finalize',
  [AGENT_EVALUATION_ATTESTATION_ENVIRONMENT_NAMES.environmentDigest]:
    digestAgentCanonicalValue('production-environment'),
});

const expectInvalid = async (action: Promise<unknown>): Promise<void> => {
  await expect(action).rejects.toMatchObject({
    code: AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid,
    message: AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid,
  });
};

describe('production authority signer factory', () => {
  it('uses the production composition run-config path environment name', () => {
    expect(AGENT_EVALUATION_RUN_CONFIG_ENVIRONMENT_NAME).toBe(
      'PRODIVIX_G4_MODEL_EVAL_RUN_CONFIG_PATH'
    );
  });

  it('reloads the production run config and binds the exact plan and public provenance', async () => {
    const config = frozen();
    const filePort = files(productionSource());
    const privateReads: string[] = [];
    const values = environment(
      config.attestation.authorityId,
      config.attestation.keyId
    );
    const factory = createProductionAgentEvaluationAuthoritySignerFactory(
      filePort,
      (name) => {
        if (
          name === AGENT_EVALUATION_ATTESTATION_ENVIRONMENT_NAMES.privateKey
        ) {
          privateReads.push(name);
        }
        return values[name];
      }
    );

    const signer = await factory.create({ plan: config.plan });

    expect(signer.identity()).toMatchObject({
      authorityId: config.attestation.authorityId,
      keyId: config.attestation.keyId,
      workflowName: 'g4-real-model-evaluation',
      workflowRunId: '1234567',
      workflowRunAttempt: 2,
      jobId: 'finalize',
    });
    expect(filePort.readCanonicalJson).toHaveBeenCalledOnce();
    expect(filePort.readCanonicalJson).toHaveBeenCalledWith(configPath);
    expect(privateReads).toEqual([]);
  }, 20_000);

  it('returns the canonical artifact binding with the frozen config commitments', async () => {
    const config = frozen();
    const binding =
      await loadProductionAgentEvaluationFrozenRunConfigBindingForPlan({
        files: files(productionSource()),
        environment: environment(
          config.attestation.authorityId,
          config.attestation.keyId
        ),
        plan: config.plan,
      });

    expect(binding).toMatchObject({
      config,
      artifactBinding: {
        sourcePlanArtifactName: 'g4-plan-1234567-2',
        sourcePlanArtifactDigest: artifactDigest,
        sourcePlanWorkflowRunId: '1234567',
        sourcePlanWorkflowRunAttempt: 2,
        sourceConfigDigest: config.sourceConfigDigest,
        frozenRunDigest: config.frozenRunDigest,
        planDigest: config.plan.planDigest,
      },
    });
    expect(binding.config.sourceConfigDigest).toBe(config.sourceConfigDigest);
    expect(binding.config.frozenRunDigest).toBe(config.frozenRunDigest);
  }, 20_000);

  it('rejects plan digest drift after reconstructing the frozen plan', async () => {
    const config = frozen();
    const driftedPlan = {
      ...config.plan,
      planDigest: digestAgentCanonicalValue('drifted-plan'),
    } as typeof config.plan;
    const factory = createProductionAgentEvaluationAuthoritySignerFactory(
      files(productionSource()),
      environment(config.attestation.authorityId, config.attestation.keyId)
    );

    await expectInvalid(factory.create({ plan: driftedPlan }));
  }, 20_000);

  it('rejects public attestation authority drift from the run config', async () => {
    const config = frozen();
    const factory = createProductionAgentEvaluationAuthoritySignerFactory(
      files(productionSource()),
      environment('authority.drifted', config.attestation.keyId)
    );

    await expectInvalid(factory.create({ plan: config.plan }));
  }, 20_000);

  it('fails closed before file access when the run config path is missing', async () => {
    const config = frozen();
    const filePort = files(productionSource());
    const values = environment(
      config.attestation.authorityId,
      config.attestation.keyId
    );
    delete values[AGENT_EVALUATION_RUN_CONFIG_ENVIRONMENT_NAME];
    const factory = createProductionAgentEvaluationAuthoritySignerFactory(
      filePort,
      values
    );

    await expectInvalid(factory.create({ plan: config.plan }));
    expect(filePort.readCanonicalJson).not.toHaveBeenCalled();
  }, 20_000);
});
