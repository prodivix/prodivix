import { readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { digestAgentCanonicalValue } from '@prodivix/ai';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AGENT_EVALUATION_RUNNER_ERROR_CODES } from './errors';
import { AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES } from './ledgerClient';
import { createNodeAgentEvaluationCoordinatorFilePort } from './productionFiles';
import {
  AGENT_EVALUATION_PRODUCTION_RUN_CONFIG_FILE_NAME,
  AGENT_EVALUATION_RUN_CONFIG_ARTIFACT_ENVIRONMENT_NAMES,
} from './productionRunConfigArtifact';
import {
  AGENT_EVALUATION_PRODUCTION_RUN_CONFIG_ARTIFACT_INGRESS_RECEIPT_FORMAT,
  AGENT_EVALUATION_PRODUCTION_RUN_CONFIG_ARTIFACT_INGRESS_VERSION,
  createEnvironmentAgentEvaluationProductionRunConfigArtifactIngressClient,
} from './productionRunConfigArtifactIngress';
import {
  AGENT_EVALUATION_PROTECTED_HOLDOUT_CANARIES_ENVIRONMENT_NAME,
  AGENT_EVALUATION_SECRET_CANARIES_ENVIRONMENT_NAME,
} from './productionCanaries';
import {
  decodeAgentEvaluationFrozenRunConfig,
  requireProductionAgentEvaluationFrozenRunConfig,
} from './runConfig';
import { materializeAgentEvaluationTestProductionRunConfig } from './runConfig.fixture';

const repositoryCommit = '0123456789abcdef0123456789abcdef01234567';
const observedAt = '2026-08-08T00:00:00.000Z';
const namespaceId = 'g4-artifact-ingress-test';
const serviceToken = 'service-token-for-artifact-ingress-test';
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
    await mkdtemp(join(tmpdir(), 'prodivix-g4-run-config-ingress-'))
  );
  directories.push(directory);
  return directory;
};

const environmentFor = (path: string): Record<string, string> => ({
  [AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.baseUrl]: 'http://127.0.0.1:8790',
  [AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.namespace]: namespaceId,
  [AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.repositoryCommit]:
    repositoryCommit,
  [AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.token]: serviceToken,
  [AGENT_EVALUATION_SECRET_CANARIES_ENVIRONMENT_NAME]: JSON.stringify([
    'secret-canary-artifact-ingress',
  ]),
  [AGENT_EVALUATION_PROTECTED_HOLDOUT_CANARIES_ENVIRONMENT_NAME]:
    JSON.stringify(['holdout-canary-artifact-ingress']),
  [AGENT_EVALUATION_RUN_CONFIG_ARTIFACT_ENVIRONMENT_NAMES.path]: path,
  [AGENT_EVALUATION_RUN_CONFIG_ARTIFACT_ENVIRONMENT_NAMES.sourcePlanArtifactName]:
    'g4-plan-1234567-2',
  [AGENT_EVALUATION_RUN_CONFIG_ARTIFACT_ENVIRONMENT_NAMES.sourcePlanArtifactDigest]: `sha256:${'a'.repeat(64)}`,
  [AGENT_EVALUATION_RUN_CONFIG_ARTIFACT_ENVIRONMENT_NAMES.sourcePlanWorkflowRunId]:
    '1234567',
  [AGENT_EVALUATION_RUN_CONFIG_ARTIFACT_ENVIRONMENT_NAMES.sourcePlanWorkflowRunAttempt]:
    '2',
});

const writeFixture = async () => {
  const directory = await temporaryDirectory();
  const configPath = join(
    directory,
    AGENT_EVALUATION_PRODUCTION_RUN_CONFIG_FILE_NAME
  );
  const planPath = join(directory, 'plan.json');
  const document = productionDocument();
  const config = productionConfig(document);
  await writeFile(configPath, canonicalJsonText(document), 'utf8');
  await writeFile(planPath, canonicalJsonText(config.plan), 'utf8');
  return Object.freeze({ configPath, planPath, config });
};

afterEach(async () => {
  vi.restoreAllMocks();
  for (const directory of directories.splice(0)) {
    await rm(directory, { force: true, recursive: true });
  }
});

describe('production run-config artifact ingress', () => {
  it('seals canonical config bytes after plan publication and accepts exact replay', async () => {
    const fixture = await writeFixture();
    const requests: Readonly<{ url: string; init: RequestInit }>[] = [];
    const fetchImplementation = vi.fn(
      async (url: string | URL | Request, init?: RequestInit) => {
        const requestUrl = String(url);
        const requestInit = init ?? {};
        requests.push({
          url: requestUrl,
          init: { ...requestInit, headers: new Headers(requestInit.headers) },
        });
        const ingress = JSON.parse(String(requestInit.body)) as Record<
          string,
          unknown
        >;
        const binding = ingress.runConfigArtifactBinding as Record<
          string,
          unknown
        >;
        const base = {
          format:
            AGENT_EVALUATION_PRODUCTION_RUN_CONFIG_ARTIFACT_INGRESS_RECEIPT_FORMAT,
          version:
            AGENT_EVALUATION_PRODUCTION_RUN_CONFIG_ARTIFACT_INGRESS_VERSION,
          namespaceId,
          planDigest: fixture.config.plan.planDigest,
          repositoryCommit,
          bindingDigest: binding.bindingDigest,
          sourceConfigDigest: fixture.config.sourceConfigDigest,
          storedAt: fixture.config.plan.plannedAt,
          ingressDigest: ingress.ingressDigest,
        };
        return new Response(
          canonicalJsonText({
            ...base,
            receiptDigest: digestAgentCanonicalValue(base),
          }),
          {
            status: requests.length === 1 ? 201 : 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }
    );
    const client =
      createEnvironmentAgentEvaluationProductionRunConfigArtifactIngressClient({
        environment: environmentFor(fixture.configPath),
        files: createNodeAgentEvaluationCoordinatorFilePort(),
        fetch: fetchImplementation as typeof fetch,
        now: () => observedAt,
      });

    const first = await client.seal({
      configPath: fixture.configPath,
      planPath: fixture.planPath,
    });
    const replay = await client.seal({
      configPath: fixture.configPath,
      planPath: fixture.planPath,
    });

    expect(replay).toEqual(first);
    expect(requests).toHaveLength(2);
    expect(requests[0]?.url).toBe(
      `http://127.0.0.1:8790/v1/evaluations/${namespaceId}/production-run-config-artifacts`
    );
    expect(requests[0]?.init.method).toBe('POST');
    expect(new Headers(requests[0]?.init.headers).get('Idempotency-Key')).toBe(
      first.bindingDigest
    );
    expect(new Headers(requests[0]?.init.headers).get('Authorization')).toBe(
      `Bearer ${serviceToken}`
    );
    const request = JSON.parse(String(requests[0]?.init.body)) as Record<
      string,
      unknown
    >;
    expect(Object.keys(request)).toEqual([
      'format',
      'ingressDigest',
      'namespaceId',
      'planDigest',
      'repositoryCommit',
      'runConfig',
      'runConfigArtifactBinding',
      'version',
    ]);
    expect(
      digestAgentCanonicalValue(request.runConfig as Record<string, unknown>)
    ).toBe(fixture.config.sourceConfigDigest);
  }, 30_000);

  it('rejects response recommitment before returning a receipt', async () => {
    const fixture = await writeFixture();
    const fetchImplementation = vi.fn(
      async (_url: string | URL | Request, init?: RequestInit) => {
        const ingress = JSON.parse(String(init?.body)) as Record<
          string,
          unknown
        >;
        const binding = ingress.runConfigArtifactBinding as Record<
          string,
          unknown
        >;
        const base = {
          format:
            AGENT_EVALUATION_PRODUCTION_RUN_CONFIG_ARTIFACT_INGRESS_RECEIPT_FORMAT,
          version: 1,
          namespaceId,
          planDigest: fixture.config.plan.planDigest,
          repositoryCommit,
          bindingDigest: binding.bindingDigest,
          sourceConfigDigest: fixture.config.sourceConfigDigest,
          storedAt: fixture.config.plan.plannedAt,
          ingressDigest: ingress.ingressDigest,
        };
        return new Response(
          canonicalJsonText({
            ...base,
            receiptDigest: digestAgentCanonicalValue({
              ...base,
              sourceConfigDigest: digestAgentCanonicalValue('swapped'),
            }),
          }),
          { status: 201, headers: { 'Content-Type': 'application/json' } }
        );
      }
    );
    const client =
      createEnvironmentAgentEvaluationProductionRunConfigArtifactIngressClient({
        environment: environmentFor(fixture.configPath),
        files: createNodeAgentEvaluationCoordinatorFilePort(),
        fetch: fetchImplementation as typeof fetch,
        now: () => observedAt,
      });

    await expect(
      client.seal({
        configPath: fixture.configPath,
        planPath: fixture.planPath,
      })
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid,
    });
  }, 30_000);

  it('rejects a caller path that differs from the admitted artifact before fetch', async () => {
    const fixture = await writeFixture();
    const fetchImplementation = vi.fn();
    const client =
      createEnvironmentAgentEvaluationProductionRunConfigArtifactIngressClient({
        environment: environmentFor(fixture.configPath),
        files: createNodeAgentEvaluationCoordinatorFilePort(),
        fetch: fetchImplementation as typeof fetch,
        now: () => observedAt,
      });

    await expect(
      client.seal({
        configPath: join(resolve(fixture.configPath, '..'), 'different.json'),
        planPath: fixture.planPath,
      })
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid,
    });
    expect(fetchImplementation).not.toHaveBeenCalled();
  }, 30_000);
});
