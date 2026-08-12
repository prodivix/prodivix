import {
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
  isAgentControlIdentity,
  isAgentControlInstant,
  isAgentEvaluationProductionRunConfigArtifactBinding,
  isAgentModelEvaluationPlan,
  type AgentEvaluationProductionRunConfigArtifactBinding,
  type AgentModelEvaluationPlan,
  type CanonicalDigest,
} from '@prodivix/ai';
import {
  canonicalJsonText,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import type { AgentEvaluationCoordinatorFilePort } from './coordinator';
import { assertProductionAgentEvaluationG3SandboxCanaryClean } from './controlledWorkspaceG3CellAdapter';
import {
  AGENT_EVALUATION_RUNNER_ERROR_CODES,
  AgentEvaluationRunnerError,
  safeRunnerError,
} from './errors';
import {
  AGENT_EVALUATION_LEDGER_BASE_URL,
  AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES,
} from './ledgerClient';
import { createNodeAgentEvaluationCoordinatorFilePort } from './productionFiles';
import {
  loadProductionAgentEvaluationRunConfigArtifact,
  type ProductionAgentEvaluationRunConfigEnvironment,
} from './productionRunConfigArtifact';
import {
  AGENT_EVALUATION_PROTECTED_HOLDOUT_CANARIES_ENVIRONMENT_NAME,
  AGENT_EVALUATION_SECRET_CANARIES_ENVIRONMENT_NAME,
  decodeProductionAgentEvaluationCanaries,
} from './productionCanaries';
import {
  createCredentialCanarySignatures,
  textContainsCredentialCanary,
  valueContainsCredentialCanary,
  type AgentEvaluationEnvironmentReader,
} from './secretResolver';
import { isAgentEvaluationServiceToken } from './serviceToken';

export const AGENT_EVALUATION_PRODUCTION_RUN_CONFIG_ARTIFACT_INGRESS_FORMAT =
  'prodivix.agent-evaluation-production-run-config-artifact-ingress' as const;
export const AGENT_EVALUATION_PRODUCTION_RUN_CONFIG_ARTIFACT_INGRESS_RECEIPT_FORMAT =
  'prodivix.agent-evaluation-production-run-config-artifact-ingress-receipt' as const;
export const AGENT_EVALUATION_PRODUCTION_RUN_CONFIG_ARTIFACT_INGRESS_VERSION =
  1 as const;
export const AGENT_EVALUATION_PRODUCTION_RUN_CONFIG_ARTIFACT_INGRESS_TIMEOUT_MS =
  30_000 as const;

const maximumResponseBytes = 65_536;
const repositoryCommitPattern = /^[0-9a-f]{40}$/u;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8', { fatal: true });

export type AgentEvaluationProductionRunConfigArtifactIngress = Readonly<{
  format: typeof AGENT_EVALUATION_PRODUCTION_RUN_CONFIG_ARTIFACT_INGRESS_FORMAT;
  version: typeof AGENT_EVALUATION_PRODUCTION_RUN_CONFIG_ARTIFACT_INGRESS_VERSION;
  namespaceId: string;
  planDigest: CanonicalDigest;
  repositoryCommit: string;
  runConfigArtifactBinding: AgentEvaluationProductionRunConfigArtifactBinding;
  runConfig: Readonly<Record<string, unknown>>;
  ingressDigest: CanonicalDigest;
}>;

export type AgentEvaluationProductionRunConfigArtifactIngressReceipt =
  Readonly<{
    format: typeof AGENT_EVALUATION_PRODUCTION_RUN_CONFIG_ARTIFACT_INGRESS_RECEIPT_FORMAT;
    version: typeof AGENT_EVALUATION_PRODUCTION_RUN_CONFIG_ARTIFACT_INGRESS_VERSION;
    namespaceId: string;
    planDigest: CanonicalDigest;
    repositoryCommit: string;
    bindingDigest: CanonicalDigest;
    sourceConfigDigest: CanonicalDigest;
    storedAt: string;
    ingressDigest: CanonicalDigest;
    receiptDigest: CanonicalDigest;
  }>;

export type SealAgentEvaluationProductionRunConfigArtifactInput = Readonly<{
  configPath: string;
  planPath: string;
}>;

export type AgentEvaluationProductionRunConfigArtifactIngressClient = Readonly<{
  seal(
    input: SealAgentEvaluationProductionRunConfigArtifactInput
  ): Promise<AgentEvaluationProductionRunConfigArtifactIngressReceipt>;
}>;

export type CreateEnvironmentAgentEvaluationProductionRunConfigArtifactIngressClientInput =
  Readonly<{
    environment?: ProductionAgentEvaluationRunConfigEnvironment;
    fetch?: typeof fetch;
    files?: Pick<AgentEvaluationCoordinatorFilePort, 'readCanonicalJson'>;
    now?: () => string;
    timeoutMs?: number;
  }>;

const invalid = (): never => {
  throw new AgentEvaluationRunnerError(
    AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid
  );
};

const unavailable = (): never => {
  throw new AgentEvaluationRunnerError(
    AGENT_EVALUATION_RUNNER_ERROR_CODES.productionCompositionUnavailable
  );
};

const responseInvalid = (): never => {
  throw new AgentEvaluationRunnerError(
    AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid
  );
};

const readEnvironment = (
  environment: ProductionAgentEvaluationRunConfigEnvironment
): AgentEvaluationEnvironmentReader =>
  typeof environment === 'function' ? environment : (name) => environment[name];

const exactRecord = (
  value: unknown,
  expectedKeys: readonly string[]
): value is Record<string, unknown> =>
  isPlainObject(value) &&
  Object.keys(value).length === expectedKeys.length &&
  Object.keys(value).every(
    (key) => !isUnsafeObjectKey(key) && expectedKeys.includes(key)
  );

const parseSafeJson = (source: string): unknown => {
  try {
    return JSON.parse(source, (key, value: unknown) => {
      if (key && isUnsafeObjectKey(key)) return responseInvalid();
      return value;
    }) as unknown;
  } catch (caught) {
    if (caught instanceof AgentEvaluationRunnerError) throw caught;
    return responseInvalid();
  }
};

const exactJsonMediaType = (value: string | null): boolean =>
  value === 'application/json' || value === 'application/json; charset=utf-8';

const readBoundedBody = async (
  response: Response,
  signal: AbortSignal
): Promise<Uint8Array> => {
  if (!response.body) return responseInvalid();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      if (signal.aborted) return unavailable();
      const next = await reader.read();
      if (next.done) break;
      length += next.value.byteLength;
      if (length < 1 || length > maximumResponseBytes) return responseInvalid();
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  if (length < 1) return responseInvalid();
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
};

const decodePlan = (
  value: unknown,
  expectedRepositoryCommit: string
): AgentModelEvaluationPlan => {
  if (
    !isAgentModelEvaluationPlan(value) ||
    value.repositoryCommit !== expectedRepositoryCommit
  ) {
    return invalid();
  }
  return value;
};

const createIngress = (
  namespaceId: string,
  plan: AgentModelEvaluationPlan,
  binding: AgentEvaluationProductionRunConfigArtifactBinding,
  runConfig: Readonly<Record<string, unknown>>
): AgentEvaluationProductionRunConfigArtifactIngress => {
  const base = Object.freeze({
    format: AGENT_EVALUATION_PRODUCTION_RUN_CONFIG_ARTIFACT_INGRESS_FORMAT,
    version: AGENT_EVALUATION_PRODUCTION_RUN_CONFIG_ARTIFACT_INGRESS_VERSION,
    namespaceId,
    planDigest: plan.planDigest,
    repositoryCommit: plan.repositoryCommit,
    runConfigArtifactBinding: binding,
    runConfig,
  });
  return Object.freeze({
    ...base,
    ingressDigest: digestAgentCanonicalValue(base),
  });
};

const decodeReceipt = (
  value: unknown,
  ingress: AgentEvaluationProductionRunConfigArtifactIngress,
  plan: AgentModelEvaluationPlan
): AgentEvaluationProductionRunConfigArtifactIngressReceipt => {
  if (
    !exactRecord(value, [
      'format',
      'version',
      'namespaceId',
      'planDigest',
      'repositoryCommit',
      'bindingDigest',
      'sourceConfigDigest',
      'storedAt',
      'ingressDigest',
      'receiptDigest',
    ]) ||
    value.format !==
      AGENT_EVALUATION_PRODUCTION_RUN_CONFIG_ARTIFACT_INGRESS_RECEIPT_FORMAT ||
    value.version !==
      AGENT_EVALUATION_PRODUCTION_RUN_CONFIG_ARTIFACT_INGRESS_VERSION ||
    value.namespaceId !== ingress.namespaceId ||
    value.planDigest !== ingress.planDigest ||
    value.repositoryCommit !== ingress.repositoryCommit ||
    value.bindingDigest !== ingress.runConfigArtifactBinding.bindingDigest ||
    value.sourceConfigDigest !==
      ingress.runConfigArtifactBinding.sourceConfigDigest ||
    value.ingressDigest !== ingress.ingressDigest ||
    !isAgentControlInstant(value.storedAt) ||
    value.storedAt < plan.plannedAt ||
    value.storedAt > plan.expiresAt ||
    !isAgentCanonicalDigest(value.receiptDigest)
  ) {
    return responseInvalid();
  }
  const { receiptDigest, ...base } = value;
  if (digestAgentCanonicalValue(base) !== receiptDigest)
    return responseInvalid();
  return Object.freeze({
    ...(value as unknown as AgentEvaluationProductionRunConfigArtifactIngressReceipt),
  });
};

const forbiddenCanaries = (
  read: AgentEvaluationEnvironmentReader
): readonly string[] =>
  Object.freeze([
    ...decodeProductionAgentEvaluationCanaries(
      read(AGENT_EVALUATION_SECRET_CANARIES_ENVIRONMENT_NAME)
    ),
    ...decodeProductionAgentEvaluationCanaries(
      read(AGENT_EVALUATION_PROTECTED_HOLDOUT_CANARIES_ENVIRONMENT_NAME)
    ),
  ]);

/** Seals the uploaded generated config only after its GitHub artifact identity exists. */
export const createEnvironmentAgentEvaluationProductionRunConfigArtifactIngressClient =
  (
    options: CreateEnvironmentAgentEvaluationProductionRunConfigArtifactIngressClientInput = {}
  ): AgentEvaluationProductionRunConfigArtifactIngressClient => {
    const environment = options.environment ?? process.env;
    const read = readEnvironment(environment);
    const baseUrl = read(AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.baseUrl);
    const namespaceId = read(
      AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.namespace
    );
    const repositoryCommit = read(
      AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.repositoryCommit
    );
    const timeoutMs =
      options.timeoutMs ??
      AGENT_EVALUATION_PRODUCTION_RUN_CONFIG_ARTIFACT_INGRESS_TIMEOUT_MS;
    if (
      baseUrl !== AGENT_EVALUATION_LEDGER_BASE_URL ||
      !namespaceId ||
      !isAgentControlIdentity(namespaceId) ||
      !repositoryCommit ||
      !repositoryCommitPattern.test(repositoryCommit) ||
      !Number.isSafeInteger(timeoutMs) ||
      timeoutMs < 1 ||
      timeoutMs >
        AGENT_EVALUATION_PRODUCTION_RUN_CONFIG_ARTIFACT_INGRESS_TIMEOUT_MS
    ) {
      return unavailable();
    }
    const fetchImplementation = options.fetch ?? globalThis.fetch;
    if (typeof fetchImplementation !== 'function') return unavailable();
    const files =
      options.files ?? createNodeAgentEvaluationCoordinatorFilePort();
    const readCanonicalJson = files.readCanonicalJson;
    if (typeof readCanonicalJson !== 'function') return unavailable();
    const now = options.now ?? (() => new Date().toISOString());
    const url = `${baseUrl}/v1/evaluations/${encodeURIComponent(namespaceId)}/production-run-config-artifacts`;

    return Object.freeze({
      async seal(input) {
        const observedAt = now();
        if (!isAgentControlInstant(observedAt)) return invalid();
        const plan = decodePlan(
          await readCanonicalJson(input.planPath),
          repositoryCommit
        );
        const artifact = await loadProductionAgentEvaluationRunConfigArtifact({
          files: { readCanonicalJson },
          environment,
          expectedRepositoryCommit: repositoryCommit,
          expectedPlanDigest: plan.planDigest,
          expectedPlan: plan,
          observedAt,
        });
        if (
          !isAgentEvaluationProductionRunConfigArtifactBinding(
            artifact.artifactBinding
          ) ||
          artifact.absolutePath !== input.configPath ||
          !sameCanonicalJson(artifact.config.plan, plan)
        ) {
          return invalid();
        }
        const ingress = createIngress(
          namespaceId,
          plan,
          artifact.artifactBinding,
          artifact.runConfigDocument
        );
        const body = canonicalJsonText(ingress);
        const canaries = forbiddenCanaries(read);
        try {
          assertProductionAgentEvaluationG3SandboxCanaryClean(
            ingress,
            () => canaries
          );
        } catch {
          throw new AgentEvaluationRunnerError(
            AGENT_EVALUATION_RUNNER_ERROR_CODES.secretUseDenied
          );
        }
        let token: Uint8Array | undefined;
        let headers: Headers | undefined;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const tokenSource = read(
            AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.token
          );
          if (!isAgentEvaluationServiceToken(tokenSource)) {
            throw new AgentEvaluationRunnerError(
              AGENT_EVALUATION_RUNNER_ERROR_CODES.secretUnavailable
            );
          }
          token = textEncoder.encode(tokenSource);
          const signatures = createCredentialCanarySignatures(token);
          if (
            textContainsCredentialCanary(body, signatures) ||
            textContainsCredentialCanary(url, signatures)
          ) {
            throw new AgentEvaluationRunnerError(
              AGENT_EVALUATION_RUNNER_ERROR_CODES.secretUseDenied
            );
          }
          headers = new Headers({
            Accept: 'application/json',
            Authorization: `Bearer ${textDecoder.decode(token)}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': ingress.runConfigArtifactBinding.bindingDigest,
          });
          let response: Response;
          try {
            response = await fetchImplementation(url, {
              method: 'POST',
              headers,
              body,
              signal: controller.signal,
              redirect: 'error',
              referrerPolicy: 'no-referrer',
              cache: 'no-store',
              credentials: 'omit',
            });
          } catch (caught) {
            throw safeRunnerError(caught);
          } finally {
            headers.delete('Authorization');
          }
          const responseBytes = await readBoundedBody(
            response,
            controller.signal
          );
          let responseText = '';
          try {
            responseText = textDecoder.decode(responseBytes);
          } catch {
            return responseInvalid();
          } finally {
            responseBytes.fill(0);
          }
          if (textContainsCredentialCanary(responseText, signatures)) {
            throw new AgentEvaluationRunnerError(
              AGENT_EVALUATION_RUNNER_ERROR_CODES.responseSecretLeak,
              response.status
            );
          }
          if (!response.ok) {
            throw new AgentEvaluationRunnerError(
              AGENT_EVALUATION_RUNNER_ERROR_CODES.transportFailed,
              response.status
            );
          }
          if (!exactJsonMediaType(response.headers.get('content-type'))) {
            return responseInvalid();
          }
          const decoded = parseSafeJson(responseText);
          if (valueContainsCredentialCanary(decoded, token, signatures)) {
            throw new AgentEvaluationRunnerError(
              AGENT_EVALUATION_RUNNER_ERROR_CODES.responseSecretLeak,
              response.status
            );
          }
          try {
            assertProductionAgentEvaluationG3SandboxCanaryClean(
              decoded,
              () => canaries
            );
          } catch {
            throw new AgentEvaluationRunnerError(
              AGENT_EVALUATION_RUNNER_ERROR_CODES.responseSecretLeak,
              response.status
            );
          }
          return decodeReceipt(decoded, ingress, plan);
        } catch (caught) {
          throw safeRunnerError(caught);
        } finally {
          clearTimeout(timeout);
          headers?.delete('Authorization');
          token?.fill(0);
        }
      },
    });
  };
