import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { planAgentModelEvaluationAttempts } from '@prodivix/ai';
import { describe, expect, it, vi } from 'vitest';
import { AGENT_EVALUATION_RUNNER_ERROR_CODES } from './errors';
import {
  AGENT_EVALUATION_PROTECTED_HOLDOUT_CANARIES_ENVIRONMENT_NAME,
  AGENT_EVALUATION_SECRET_CANARIES_ENVIRONMENT_NAME,
  createProductionAgentEvaluationAttemptAuthoritySourceFromEnvironment,
  decodeProductionAgentEvaluationCanaries,
} from './productionComposition';
import {
  AGENT_EVALUATION_LEDGER_BASE_URL,
  AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES,
} from './ledgerClient';
import {
  AGENT_EVALUATION_HOLDOUT_DIRECTORY_ENV,
  decodeAgentEvaluationFrozenRunConfig,
  requireProductionAgentEvaluationFrozenRunConfig,
} from './runConfig';
import { materializeAgentEvaluationTestProductionRunConfig } from './runConfig.fixture';

const fixedInstant = '2026-08-08T00:00:00.000Z';
const repositoryCommit = '0123456789abcdef0123456789abcdef01234567';
const productionSource = (): unknown =>
  materializeAgentEvaluationTestProductionRunConfig({
    ...(JSON.parse(
      readFileSync(
        new URL(
          '../../../specs/evaluation/g4-real-model-evaluation.example.json',
          import.meta.url
        ),
        'utf8'
      )
    ) as Record<string, unknown>),
  });
const config = requireProductionAgentEvaluationFrozenRunConfig(
  decodeAgentEvaluationFrozenRunConfig(productionSource(), {
    clock: () => fixedInstant,
    expectedRepositoryCommit: repositoryCommit,
  }),
  repositoryCommit
);

const authorityEnvironment = Object.freeze({
  [AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.baseUrl]:
    AGENT_EVALUATION_LEDGER_BASE_URL,
  [AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.namespace]:
    'evaluation.production.composition',
  [AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.repositoryCommit]:
    repositoryCommit,
  [AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.token]: 's'.repeat(32),
  [AGENT_EVALUATION_SECRET_CANARIES_ENVIRONMENT_NAME]: JSON.stringify([
    'secret-canary-composition',
  ]),
  [AGENT_EVALUATION_PROTECTED_HOLDOUT_CANARIES_ENVIRONMENT_NAME]:
    JSON.stringify(['holdout-canary-composition']),
  [AGENT_EVALUATION_HOLDOUT_DIRECTORY_ENV]: fileURLToPath(
    new URL('../../../specs/evaluation/holdout', import.meta.url)
  ),
});

describe('production evaluation composition inputs', () => {
  it('loads the default production attempt authority composition before dispatch', async () => {
    const fetchSpy = vi.fn<typeof fetch>(async () => {
      throw new Error(
        'Pre-dispatch composition unexpectedly used the network.'
      );
    });
    const authorities =
      await createProductionAgentEvaluationAttemptAuthoritySourceFromEnvironment(
        {
          environment: authorityEnvironment,
          fetch: fetchSpy,
          now: () => fixedInstant,
        }
      ).load({ config, plan: config.plan });

    expect(authorities).toEqual(
      expect.objectContaining({
        controlledRuntime: expect.objectContaining({
          executeTool: expect.any(Function),
          continue: expect.any(Function),
          assessFinal: expect.any(Function),
        }),
        capabilityRuntime: expect.objectContaining({
          executeTool: expect.any(Function),
          assessCapability: expect.any(Function),
        }),
        prepareVerificationAttemptGrants: expect.any(Function),
        gradeAndPersist: expect.any(Function),
      })
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fails closed while loading the default attempt authorities when service configuration is missing', async () => {
    const fetchSpy = vi.fn<typeof fetch>(async () => {
      throw new Error('Invalid configuration unexpectedly used the network.');
    });
    await expect(
      createProductionAgentEvaluationAttemptAuthoritySourceFromEnvironment({
        environment: {
          [AGENT_EVALUATION_HOLDOUT_DIRECTORY_ENV]:
            authorityEnvironment[AGENT_EVALUATION_HOLDOUT_DIRECTORY_ENV],
          [AGENT_EVALUATION_SECRET_CANARIES_ENVIRONMENT_NAME]:
            authorityEnvironment[
              AGENT_EVALUATION_SECRET_CANARIES_ENVIRONMENT_NAME
            ],
          [AGENT_EVALUATION_PROTECTED_HOLDOUT_CANARIES_ENVIRONMENT_NAME]:
            authorityEnvironment[
              AGENT_EVALUATION_PROTECTED_HOLDOUT_CANARIES_ENVIRONMENT_NAME
            ],
        },
        fetch: fetchSpy,
        now: () => fixedInstant,
      }).load({ config, plan: config.plan })
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.productionShardRuntimeUnavailable,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('routes pre-dispatch G3 cell admission through the sealed Backend authority', async () => {
    const fetchSpy = vi.fn<typeof fetch>(
      async () =>
        new Response('{}', {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        })
    );
    const authorities =
      await createProductionAgentEvaluationAttemptAuthoritySourceFromEnvironment(
        {
          environment: authorityEnvironment,
          fetch: fetchSpy,
          now: () => fixedInstant,
        }
      ).load({ config, plan: config.plan });
    const publicCaseIds = new Set(
      config.materialCatalog.entries
        .filter(({ kind }) => kind === 'public-material')
        .map(({ caseId }) => caseId)
    );
    const descriptor = planAgentModelEvaluationAttempts(config.plan).find(
      ({ caseId }) => publicCaseIds.has(caseId)
    );
    if (!descriptor)
      throw new Error('Public production descriptor is missing.');

    await expect(
      authorities.prepareVerificationAttemptGrants({
        namespaceId:
          authorityEnvironment[
            AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.namespace
          ],
        plan: config.plan,
        descriptor,
        leaseGeneration: 1,
      })
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.productionShardRuntimeUnavailable,
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, request] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toMatch(/\/g3-cell-admission$/u);
    expect(request).toEqual(
      expect.objectContaining({
        method: 'POST',
        cache: 'no-store',
        credentials: 'omit',
      })
    );
    expect(new Headers(request?.headers).get('Idempotency-Key')).toMatch(
      /^sha256-[0-9a-f]{64}$/u
    );
  });

  it('accepts at most 256 unique server-only canaries', () => {
    const canaries = Array.from(
      { length: 256 },
      (_, index) => `evaluation-canary-${index.toString().padStart(3, '0')}`
    );
    expect(
      decodeProductionAgentEvaluationCanaries(JSON.stringify(canaries))
    ).toEqual(canaries);
  });

  it('rejects a 257-entry canary set', () => {
    const canaries = Array.from(
      { length: 257 },
      (_, index) => `evaluation-canary-${index.toString().padStart(3, '0')}`
    );
    expect(() =>
      decodeProductionAgentEvaluationCanaries(JSON.stringify(canaries))
    ).toThrowError(
      expect.objectContaining({
        code: AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid,
      })
    );
  });

  it.each(['canary"quoted', 'canary\\escaped', 'canary\nline', 'canary-密文'])(
    'rejects a canary outside the frozen ASCII token alphabet',
    (canary) => {
      expect(() =>
        decodeProductionAgentEvaluationCanaries(JSON.stringify([canary]))
      ).toThrowError(
        expect.objectContaining({
          code: AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid,
        })
      );
    }
  );
});
