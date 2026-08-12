import { Buffer } from 'node:buffer';
import { isAbsolute, parse, resolve, win32 } from 'node:path';
import {
  createAgentEvaluationFrozenConfigCommitment,
  createAgentEvaluationFrozenConfigCommitmentBase,
  createAgentEvaluationFrozenConfigCommitmentSigningPayload,
  createAgentEvaluationFrozenConfigProtectedEnvelope,
  digestAgentEvaluationEncryptedHoldoutCorpus,
  isAgentModelEvaluationPlan,
  type AgentEvaluationFrozenConfigCommitment,
  type AgentEvaluationFrozenConfigProtectedEnvelope,
  type AgentModelEvaluationPlan,
  type CanonicalDigest,
} from '@prodivix/ai';
import {
  canonicalJsonText,
  compareUnicodeCodePoints,
} from '@prodivix/shared/canonical';
import { createEnvironmentAgentEvaluationAuthoritySigner } from './attestationSigner';
import type { AgentEvaluationCoordinatorFilePort } from './coordinator';
import {
  AGENT_EVALUATION_RUNNER_ERROR_CODES,
  AgentEvaluationRunnerError,
} from './errors';
import { AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES } from './ledgerClient';
import { createNodeAgentEvaluationCoordinatorFilePort } from './productionFiles';
import {
  loadProductionAgentEvaluationFrozenRunConfigBindingForPlan,
  type ProductionAgentEvaluationRunConfigEnvironment,
} from './productionSignerFactory';
import type { AgentEvaluationEnvironmentReader } from './secretResolver';
import { containsAsciiControlCharacter } from './textSafety';

export const AGENT_EVALUATION_FROZEN_CONFIG_COMMITMENT_ENVIRONMENT_NAMES =
  Object.freeze({
    outputPath: 'PRODIVIX_G4_MODEL_EVAL_FROZEN_CONFIG_COMMITMENT_PATH' as const,
  });

const repositoryCommitPattern = /^[0-9a-f]{40}$/u;

const invalid = (): never => {
  throw new AgentEvaluationRunnerError(
    AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid
  );
};

const environmentReader = (
  environment: ProductionAgentEvaluationRunConfigEnvironment
): AgentEvaluationEnvironmentReader =>
  typeof environment === 'function' ? environment : (name) => environment[name];

const canonicalAbsolutePath = (value: string | undefined): string => {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > 4_096 ||
    value !== value.trim() ||
    containsAsciiControlCharacter(value) ||
    value.startsWith('\\\\') ||
    value.startsWith('//') ||
    !isAbsolute(value) ||
    (win32.isAbsolute(value) && !isAbsolute(value)) ||
    resolve(value) !== value ||
    value === parse(value).root
  ) {
    return invalid();
  }
  return value;
};

type FrozenConfigCommitmentFiles = Pick<
  AgentEvaluationCoordinatorFilePort,
  'createCanonicalJson' | 'readCanonicalJson'
>;

export type ProduceAgentEvaluationFrozenConfigCommitmentInput = Readonly<{
  planPath: string;
  outputPath: string;
  environment?: ProductionAgentEvaluationRunConfigEnvironment;
  files?: FrozenConfigCommitmentFiles;
}>;

export type ProducedAgentEvaluationFrozenConfigCommitment = Readonly<{
  commitment: AgentEvaluationFrozenConfigCommitment;
  encryptedCorpusDigest: CanonicalDigest;
}>;

const exactPlan = async (
  files: FrozenConfigCommitmentFiles,
  planPath: string,
  expectedRepositoryCommit: string
): Promise<AgentModelEvaluationPlan> => {
  if (typeof files.readCanonicalJson !== 'function') return invalid();
  const value = await files.readCanonicalJson(planPath);
  if (
    !isAgentModelEvaluationPlan(value) ||
    value.repositoryCommit !== expectedRepositoryCommit
  ) {
    return invalid();
  }
  return value;
};

const protectedEnvelopeAllowlist = (
  plan: AgentModelEvaluationPlan,
  locators: ReadonlyArray<
    Readonly<{
      locator: Readonly<{
        caseId: string;
        caseDigest: CanonicalDigest;
        access: 'protected-holdout' | 'rotating-counterexample';
        capabilityDescriptorDigest: CanonicalDigest;
        caseDefinitionDigest: CanonicalDigest;
        expectedAuthorityDigest: CanonicalDigest;
        gradingPolicyDigest: CanonicalDigest;
        resolverRef: string;
        encryptedMaterialDigest: CanonicalDigest;
        encryptionPolicyDigest: CanonicalDigest;
        locatorDigest: CanonicalDigest;
      }>;
      relativePath: string;
    }>
  >
): readonly AgentEvaluationFrozenConfigProtectedEnvelope[] => {
  const cases = plan.concreteCases
    .filter(({ access }) => access !== 'public')
    .sort((left, right) => compareUnicodeCodePoints(left.caseId, right.caseId));
  if (
    cases.length < 1 ||
    cases.length !== locators.length ||
    cases.some(({ access }) => access !== 'protected-holdout')
  ) {
    return invalid();
  }
  const locatorByCaseId = new Map(
    locators.map((entry) => [entry.locator.caseId, entry] as const)
  );
  if (locatorByCaseId.size !== locators.length) return invalid();
  return Object.freeze(
    cases.map((evaluationCase) => {
      const entry = locatorByCaseId.get(evaluationCase.caseId) ?? invalid();
      const locator = entry.locator;
      if (
        locator.access !== 'protected-holdout' ||
        locator.caseDigest !== evaluationCase.caseDigest ||
        locator.capabilityDescriptorDigest !==
          evaluationCase.capabilityDescriptorDigest ||
        locator.caseDefinitionDigest !== evaluationCase.caseDefinitionDigest ||
        locator.expectedAuthorityDigest !==
          evaluationCase.expectedAuthorityDigest ||
        locator.gradingPolicyDigest !== evaluationCase.gradingPolicyDigest
      ) {
        return invalid();
      }
      return createAgentEvaluationFrozenConfigProtectedEnvelope({
        caseId: evaluationCase.caseId,
        fixtureRef: evaluationCase.fixtureRef,
        caseDigest: evaluationCase.caseDigest,
        access: 'protected-holdout',
        capabilityDescriptorDigest: evaluationCase.capabilityDescriptorDigest,
        caseDefinitionDigest: evaluationCase.caseDefinitionDigest,
        expectedAuthorityDigest: evaluationCase.expectedAuthorityDigest,
        gradingPolicyDigest: evaluationCase.gradingPolicyDigest,
        resolverRef: locator.resolverRef,
        relativePath: entry.relativePath,
        encryptedMaterialDigest: locator.encryptedMaterialDigest,
        encryptionPolicyDigest: locator.encryptionPolicyDigest,
        locatorDigest: locator.locatorDigest,
      });
    })
  );
};

/**
 * Creates the signed authority file consumed lazily by the full_shards Go
 * ledger. The output is the final operation and uses exclusive 0600 creation.
 */
export const produceAgentEvaluationFrozenConfigCommitment = async (
  input: ProduceAgentEvaluationFrozenConfigCommitmentInput
): Promise<ProducedAgentEvaluationFrozenConfigCommitment> => {
  let message: Buffer | undefined;
  try {
    const environment = input.environment ?? process.env;
    const read = environmentReader(environment);
    const files = input.files ?? createNodeAgentEvaluationCoordinatorFilePort();
    const planPath = canonicalAbsolutePath(input.planPath);
    const outputPath = canonicalAbsolutePath(input.outputPath);
    if (
      canonicalAbsolutePath(
        read(
          AGENT_EVALUATION_FROZEN_CONFIG_COMMITMENT_ENVIRONMENT_NAMES.outputPath
        )
      ) !== outputPath
    ) {
      return invalid();
    }
    const repositoryCommit = read(
      AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.repositoryCommit
    );
    if (!repositoryCommitPattern.test(repositoryCommit ?? '')) return invalid();
    const plan = await exactPlan(files, planPath, repositoryCommit!);
    const workingBinding =
      await loadProductionAgentEvaluationFrozenRunConfigBindingForPlan({
        files,
        environment,
        plan,
      });
    const trackedConfig = workingBinding.config;
    if (
      trackedConfig.plan.planDigest !== plan.planDigest ||
      trackedConfig.materialCatalog.restrictedMaterialManifestDigest !==
        plan.protectedHoldoutManifestDigest
    ) {
      return invalid();
    }
    const allowlist = protectedEnvelopeAllowlist(
      plan,
      trackedConfig.restrictedEnvelopeLocators
    );
    const signer = createEnvironmentAgentEvaluationAuthoritySigner({
      environment,
      expectedAttestation: trackedConfig.attestation,
      expectedJobId: 'full_shards',
    });
    const identity = signer.identity();
    const base = createAgentEvaluationFrozenConfigCommitmentBase({
      runConfigArtifactBinding: workingBinding.artifactBinding,
      sourceConfigDigest: trackedConfig.sourceConfigDigest,
      frozenRunDigest: trackedConfig.frozenRunDigest,
      planDigest: plan.planDigest,
      repositoryCommit: plan.repositoryCommit,
      protectedHoldoutManifestDigest: plan.protectedHoldoutManifestDigest,
      restrictedMaterialManifestDigest:
        trackedConfig.materialCatalog.restrictedMaterialManifestDigest,
      protectedEnvelopeAllowlist: allowlist,
      committedAt: plan.plannedAt,
      workflowName: 'g4-real-model-evaluation',
      workflowRunId: identity.workflowRunId,
      jobId: 'full_shards',
      environmentDigest: identity.environmentDigest,
      authorityId: identity.authorityId,
      keyId: identity.keyId,
      algorithm: 'Ed25519',
    });
    const payload =
      createAgentEvaluationFrozenConfigCommitmentSigningPayload(base);
    message = Buffer.from(canonicalJsonText(payload), 'utf8');
    const signatureBase64Url = await signer.signFrozenConfigCommitment({
      payload,
      message,
    });
    if (
      !signer.verify({
        publicKeyBase64Url: identity.publicKeyBase64Url,
        signatureBase64Url,
        message,
      })
    ) {
      return invalid();
    }
    const commitment = createAgentEvaluationFrozenConfigCommitment({
      payload,
      signatureBase64Url,
    });
    const encryptedCorpusDigest =
      digestAgentEvaluationEncryptedHoldoutCorpus(commitment);
    await files.createCanonicalJson(outputPath, commitment);
    return Object.freeze({ commitment, encryptedCorpusDigest });
  } catch (caught) {
    if (caught instanceof AgentEvaluationRunnerError) throw caught;
    return invalid();
  } finally {
    message?.fill(0);
  }
};
