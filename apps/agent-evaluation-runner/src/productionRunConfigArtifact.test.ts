import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  createAgentEvaluationProductionRunConfigArtifactBinding,
  digestAgentCanonicalValue,
  isAgentEvaluationProductionRunConfigArtifactBinding,
} from '@prodivix/ai';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import { afterEach, describe, expect, it } from 'vitest';
import { AGENT_EVALUATION_RUNNER_ERROR_CODES } from './errors';
import { createNodeAgentEvaluationCoordinatorFilePort } from './productionFiles';
import {
  AGENT_EVALUATION_PRODUCTION_RUN_CONFIG_FILE_NAME,
  AGENT_EVALUATION_RUN_CONFIG_ARTIFACT_ENVIRONMENT_NAMES,
  loadProductionAgentEvaluationRunConfigArtifact,
} from './productionRunConfigArtifact';
import {
  decodeAgentEvaluationFrozenRunConfig,
  requireProductionAgentEvaluationFrozenRunConfig,
} from './runConfig';
import { materializeAgentEvaluationTestProductionRunConfig } from './runConfig.fixture';

const repositoryCommit = '0123456789abcdef0123456789abcdef01234567';
const observedAt = '2026-08-08T00:00:00.000Z';
const artifactDigest = `sha256:${'a'.repeat(64)}`;
const directories: string[] = [];
const exampleText = readFileSync(
  new URL(
    '../../../specs/evaluation/g4-real-model-evaluation.example.json',
    import.meta.url
  ),
  'utf8'
);

const productionDocument = (): Readonly<Record<string, unknown>> =>
  materializeAgentEvaluationTestProductionRunConfig(
    JSON.parse(exampleText) as Record<string, unknown>
  );

const productionConfig = (document: Readonly<Record<string, unknown>>) =>
  requireProductionAgentEvaluationFrozenRunConfig(
    decodeAgentEvaluationFrozenRunConfig(document, {
      clock: () => observedAt,
      expectedRepositoryCommit: repositoryCommit,
    }),
    repositoryCommit
  );

const temporaryDirectory = async (): Promise<string> => {
  const directory = resolve(
    await mkdtemp(join(tmpdir(), 'prodivix-g4-run-config-artifact-'))
  );
  directories.push(directory);
  return directory;
};

const environmentFor = (path: string): Record<string, string> => ({
  [AGENT_EVALUATION_RUN_CONFIG_ARTIFACT_ENVIRONMENT_NAMES.path]: path,
  [AGENT_EVALUATION_RUN_CONFIG_ARTIFACT_ENVIRONMENT_NAMES.sourcePlanArtifactName]:
    'g4-plan-1234567-2',
  [AGENT_EVALUATION_RUN_CONFIG_ARTIFACT_ENVIRONMENT_NAMES.sourcePlanArtifactDigest]:
    artifactDigest,
  [AGENT_EVALUATION_RUN_CONFIG_ARTIFACT_ENVIRONMENT_NAMES.sourcePlanWorkflowRunId]:
    '1234567',
  [AGENT_EVALUATION_RUN_CONFIG_ARTIFACT_ENVIRONMENT_NAMES.sourcePlanWorkflowRunAttempt]:
    '2',
});

const expectInvalid = async (action: Promise<unknown>): Promise<void> => {
  await expect(action).rejects.toMatchObject({
    code: AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid,
  });
};

afterEach(async () => {
  for (const directory of directories.splice(0)) {
    await rm(directory, { force: true, recursive: true });
  }
});

describe('production run-config artifact loader', () => {
  it('loads canonical bytes from one absolute artifact path and binds plan provenance', async () => {
    const directory = await temporaryDirectory();
    const path = join(
      directory,
      AGENT_EVALUATION_PRODUCTION_RUN_CONFIG_FILE_NAME
    );
    const document = productionDocument();
    await writeFile(path, canonicalJsonText(document), 'utf8');
    const expected = productionConfig(document);

    const loaded = await loadProductionAgentEvaluationRunConfigArtifact({
      files: createNodeAgentEvaluationCoordinatorFilePort(),
      environment: environmentFor(path),
      expectedRepositoryCommit: repositoryCommit,
      expectedPlanDigest: expected.plan.planDigest,
      expectedPlan: expected.plan,
      observedAt,
    });

    expect(loaded.absolutePath).toBe(path);
    expect(loaded.config).toEqual(expected);
    expect(loaded.artifactBinding).toMatchObject({
      sourcePlanArtifactName: 'g4-plan-1234567-2',
      sourcePlanArtifactDigest: artifactDigest,
      sourcePlanWorkflowRunId: '1234567',
      sourcePlanWorkflowRunAttempt: 2,
      runConfigFileName: AGENT_EVALUATION_PRODUCTION_RUN_CONFIG_FILE_NAME,
      runConfigByteLength: Buffer.byteLength(canonicalJsonText(document)),
      runConfigCanonicalBytesDigest: expected.sourceConfigDigest,
      sourceConfigDigest: expected.sourceConfigDigest,
      frozenRunDigest: expected.frozenRunDigest,
      planDigest: expected.plan.planDigest,
      repositoryCommit,
    });
    expect(
      isAgentEvaluationProductionRunConfigArtifactBinding(
        loaded.artifactBinding
      )
    ).toBe(true);
  }, 30_000);

  it.each([
    ['relative path', 'production-run-config.json', undefined, undefined],
    ['wrong file name', undefined, 'different.json', undefined],
    ['invalid artifact name', undefined, undefined, 'artifact/name'],
  ])(
    'rejects %s before admitting config bytes',
    async (_name, pathValue, fileName, artifactName) => {
      const directory = await temporaryDirectory();
      const path = join(
        directory,
        fileName ?? AGENT_EVALUATION_PRODUCTION_RUN_CONFIG_FILE_NAME
      );
      const document = productionDocument();
      await writeFile(path, canonicalJsonText(document), 'utf8');
      const expected = productionConfig(document);
      const environment = environmentFor(pathValue ?? path);
      if (artifactName) {
        environment[
          AGENT_EVALUATION_RUN_CONFIG_ARTIFACT_ENVIRONMENT_NAMES.sourcePlanArtifactName
        ] = artifactName;
      }
      await expectInvalid(
        loadProductionAgentEvaluationRunConfigArtifact({
          files: createNodeAgentEvaluationCoordinatorFilePort(),
          environment,
          expectedRepositoryCommit: repositoryCommit,
          expectedPlanDigest: expected.plan.planDigest,
          observedAt,
        })
      );
    },
    30_000
  );

  it('rejects non-canonical file bytes and a symlinked parent directory', async () => {
    const directory = await temporaryDirectory();
    const physicalDirectory = join(directory, 'physical');
    const aliasDirectory = join(directory, 'alias');
    await mkdir(physicalDirectory);
    await symlink(
      physicalDirectory,
      aliasDirectory,
      process.platform === 'win32' ? 'junction' : 'dir'
    );
    const physicalPath = join(
      physicalDirectory,
      AGENT_EVALUATION_PRODUCTION_RUN_CONFIG_FILE_NAME
    );
    const aliasPath = join(
      aliasDirectory,
      AGENT_EVALUATION_PRODUCTION_RUN_CONFIG_FILE_NAME
    );
    const document = productionDocument();
    const expected = productionConfig(document);
    await writeFile(physicalPath, `${canonicalJsonText(document)}\n`, 'utf8');
    await expectInvalid(
      loadProductionAgentEvaluationRunConfigArtifact({
        files: createNodeAgentEvaluationCoordinatorFilePort(),
        environment: environmentFor(physicalPath),
        expectedRepositoryCommit: repositoryCommit,
        expectedPlanDigest: expected.plan.planDigest,
        observedAt,
      })
    );
    await writeFile(physicalPath, canonicalJsonText(document), 'utf8');
    await expectInvalid(
      loadProductionAgentEvaluationRunConfigArtifact({
        files: createNodeAgentEvaluationCoordinatorFilePort(),
        environment: environmentFor(aliasPath),
        expectedRepositoryCommit: repositoryCommit,
        expectedPlanDigest: expected.plan.planDigest,
        observedAt,
      })
    );
  }, 30_000);

  it('rejects plan drift and any mutation of a sealed artifact binding', async () => {
    const document = productionDocument();
    const expected = productionConfig(document);
    const binding = createAgentEvaluationProductionRunConfigArtifactBinding({
      sourcePlanArtifactName: 'g4-plan-1234567-2',
      sourcePlanArtifactDigest: artifactDigest,
      sourcePlanWorkflowRunId: '1234567',
      sourcePlanWorkflowRunAttempt: 2,
      runConfigFileName: AGENT_EVALUATION_PRODUCTION_RUN_CONFIG_FILE_NAME,
      runConfigByteLength: Buffer.byteLength(canonicalJsonText(document)),
      runConfigCanonicalBytesDigest: expected.sourceConfigDigest,
      sourceConfigDigest: expected.sourceConfigDigest,
      frozenRunDigest: expected.frozenRunDigest,
      planDigest: expected.plan.planDigest,
      repositoryCommit,
    });
    expect(
      isAgentEvaluationProductionRunConfigArtifactBinding({
        ...binding,
        sourcePlanArtifactDigest: `sha256:${'b'.repeat(64)}`,
      })
    ).toBe(false);

    const directory = await temporaryDirectory();
    const path = join(
      directory,
      AGENT_EVALUATION_PRODUCTION_RUN_CONFIG_FILE_NAME
    );
    await writeFile(path, canonicalJsonText(document), 'utf8');
    await expectInvalid(
      loadProductionAgentEvaluationRunConfigArtifact({
        files: createNodeAgentEvaluationCoordinatorFilePort(),
        environment: environmentFor(path),
        expectedRepositoryCommit: repositoryCommit,
        expectedPlanDigest: digestAgentCanonicalValue('different-plan'),
        observedAt,
      })
    );
  }, 30_000);
});
