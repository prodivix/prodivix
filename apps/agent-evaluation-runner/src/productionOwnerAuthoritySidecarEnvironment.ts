import { lstat, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';

import type { AgentEvaluationEnvironmentReader } from './secretResolver';
import { createEnvironmentAgentEvaluationAttemptAuthorityResultIngressClient } from './attemptAuthorityResultIngressClient';
import {
  createAgentEvaluationCapabilityProbeProviderResourceResultIngressRequest,
  createEnvironmentAgentEvaluationCapabilityProbeProviderResourceClient,
} from './capabilityProbeProviderResourceClient';
import { createEnvironmentAgentEvaluationCapabilityProbeProviderResourceCleanupClient } from './capabilityProbeProviderResourceCleanupClient';
import {
  createProductionAgentEvaluationOwnerAuthoritySidecar,
  type AgentEvaluationOwnerAuthorityPurpose,
  type AgentEvaluationProductionOwnerAuthorityPorts,
  type AgentEvaluationProductionOwnerAuthoritySidecar,
} from './productionOwnerAuthoritySidecar';
import { createFileAgentEvaluationOwnerAuthorityReplayJournal } from './productionOwnerAuthoritySidecarJournal';
import { isAgentEvaluationServiceToken } from './serviceToken';
import { containsAsciiControlCharacter } from './textSafety';

export const AGENT_EVALUATION_OWNER_AUTHORITY_ENVIRONMENT_NAMES = Object.freeze(
  {
    baseUrl: 'PRODIVIX_G4_MODEL_EVAL_OWNER_AUTHORITY_BASE_URL',
    serviceToken: 'PRODIVIX_G4_MODEL_EVAL_OWNER_AUTHORITY_SERVICE_TOKEN',
    stateDirectory: 'PRODIVIX_G4_MODEL_EVAL_OWNER_AUTHORITY_STATE_DIRECTORY',
    purpose: 'PRODIVIX_G4_MODEL_EVAL_OWNER_AUTHORITY_PURPOSE',
    runConfigTemplatePath: 'PRODIVIX_G4_MODEL_EVAL_RUN_CONFIG_TEMPLATE_PATH',
    shutdownReceiptPath:
      'PRODIVIX_G4_MODEL_EVAL_OWNER_AUTHORITY_SHUTDOWN_RECEIPT_PATH',
    secretCanaries: 'PRODIVIX_G4_MODEL_EVAL_SECRET_CANARIES',
    protectedHoldoutCanaries:
      'PRODIVIX_G4_MODEL_EVAL_PROTECTED_HOLDOUT_CANARIES',
  } as const
);

export const AGENT_EVALUATION_OWNER_AUTHORITY_DEFAULT_BASE_URL =
  'http://127.0.0.1:8791' as const;

type Environment = NodeJS.ProcessEnv | AgentEvaluationEnvironmentReader;

const canaryPattern = /^[A-Za-z0-9._:@%+=/-]+$/u;
const maximumRunConfigTemplateBytes = 16_777_216;

export type AgentEvaluationProductionOwnerAuthorityPortFactoryInput = Readonly<{
  environment: AgentEvaluationEnvironmentReader;
  forbiddenCanaries: () => readonly string[];
}>;

export type AgentEvaluationProductionPurposeBoundOwnerAuthorityPortFactoryInput =
  AgentEvaluationProductionOwnerAuthorityPortFactoryInput &
    Readonly<{ purpose: AgentEvaluationOwnerAuthorityPurpose }>;

export type AgentEvaluationProductionOwnerAuthorityPortFactory = (
  input: AgentEvaluationProductionPurposeBoundOwnerAuthorityPortFactoryInput
) => Promise<AgentEvaluationProductionOwnerAuthorityPorts>;

export type CreateProductionAgentEvaluationOwnerAuthoritySidecarFromEnvironmentInput =
  Readonly<{
    environment?: Environment;
    createAuthorities?: AgentEvaluationProductionOwnerAuthorityPortFactory;
  }>;

const fail = (message: string): never => {
  throw new TypeError(
    `G4_OWNER_AUTHORITY_SIDECAR_CONFIGURATION_INVALID: ${message}`
  );
};

const readerFor = (
  environment: Environment
): AgentEvaluationEnvironmentReader =>
  typeof environment === 'function'
    ? environment
    : (name: string): string | undefined => environment[name];

const required = (
  read: AgentEvaluationEnvironmentReader,
  name: string,
  maximum = 1_048_576
): string => {
  const value = read(name);
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > maximum ||
    value !== value.trim() ||
    containsAsciiControlCharacter(value)
  ) {
    return fail(`Required environment ${name} is invalid.`);
  }
  return value;
};

const parseCanaryArray = (source: string, name: string): readonly string[] => {
  let value: unknown;
  try {
    value = JSON.parse(source) as unknown;
  } catch {
    return fail(`${name} is not JSON.`);
  }
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > 256 ||
    value.some(
      (entry) =>
        typeof entry !== 'string' ||
        entry.length < 8 ||
        entry.length > 4_096 ||
        !canaryPattern.test(entry)
    ) ||
    new Set(value).size !== value.length
  ) {
    return fail(`${name} is invalid.`);
  }
  return Object.freeze([...value] as string[]);
};

/**
 * Environment composition accepts only the repo-owned factory statically
 * imported by the executable. Environment-controlled module loading is
 * rejected so implementation identity cannot drift outside the frozen build.
 */
export const createProductionAgentEvaluationOwnerAuthoritySidecarFromEnvironment =
  async (
    options: CreateProductionAgentEvaluationOwnerAuthoritySidecarFromEnvironmentInput = {}
  ): Promise<
    Readonly<{
      sidecar: AgentEvaluationProductionOwnerAuthoritySidecar;
      host: '127.0.0.1';
      port: 8791;
      shutdownReceiptPath: string;
    }>
  > => {
    const environment = options.environment ?? process.env;
    const read = readerFor(environment);
    if (read('PRODIVIX_G4_MODEL_EVAL_OWNER_AUTHORITY_MODULE') !== undefined) {
      return fail(
        'Environment-selected owner authority modules are forbidden.'
      );
    }
    const baseUrl = required(
      read,
      AGENT_EVALUATION_OWNER_AUTHORITY_ENVIRONMENT_NAMES.baseUrl,
      2_048
    );
    if (baseUrl !== AGENT_EVALUATION_OWNER_AUTHORITY_DEFAULT_BASE_URL) {
      return fail('Owner authority base URL must be exact numeric loopback.');
    }
    const serviceTokenSource = required(
      read,
      AGENT_EVALUATION_OWNER_AUTHORITY_ENVIRONMENT_NAMES.serviceToken,
      4_096
    );
    if (!isAgentEvaluationServiceToken(serviceTokenSource)) {
      return fail('Owner authority service token is invalid.');
    }
    const serviceToken = serviceTokenSource;
    const purposeSource = required(
      read,
      AGENT_EVALUATION_OWNER_AUTHORITY_ENVIRONMENT_NAMES.purpose,
      64
    );
    if (purposeSource !== 'preplan' && purposeSource !== 'full-attempt') {
      return fail('Owner authority purpose is invalid.');
    }
    const purpose: AgentEvaluationOwnerAuthorityPurpose = purposeSource;
    const stateDirectorySource = required(
      read,
      AGENT_EVALUATION_OWNER_AUTHORITY_ENVIRONMENT_NAMES.stateDirectory,
      32_768
    );
    if (!isAbsolute(stateDirectorySource)) {
      return fail('Owner authority state directory must be absolute.');
    }
    const stateDirectory = resolve(stateDirectorySource);
    const shutdownReceiptPathSource = required(
      read,
      AGENT_EVALUATION_OWNER_AUTHORITY_ENVIRONMENT_NAMES.shutdownReceiptPath,
      32_768
    );
    if (!isAbsolute(shutdownReceiptPathSource)) {
      return fail('Owner authority shutdown receipt path must be absolute.');
    }
    const shutdownReceiptPath = resolve(shutdownReceiptPathSource);
    if (dirname(shutdownReceiptPath) !== stateDirectory) {
      return fail(
        'Owner authority shutdown receipt must be a direct child of the state directory.'
      );
    }
    const runConfigTemplatePathSource = required(
      read,
      AGENT_EVALUATION_OWNER_AUTHORITY_ENVIRONMENT_NAMES.runConfigTemplatePath,
      32_768
    );
    if (
      !isAbsolute(runConfigTemplatePathSource) ||
      resolve(runConfigTemplatePathSource) !== runConfigTemplatePathSource
    ) {
      return fail('Run config template path must be canonical and absolute.');
    }
    const runConfigTemplatePath = resolve(runConfigTemplatePathSource);
    let runConfigTemplateMetadata: Awaited<ReturnType<typeof lstat>>;
    let canonicalRunConfigTemplatePath: string;
    try {
      runConfigTemplateMetadata = await lstat(runConfigTemplatePath);
      canonicalRunConfigTemplatePath = await realpath(runConfigTemplatePath);
    } catch {
      return fail('Run config template is unavailable.');
    }
    if (
      runConfigTemplateMetadata.isSymbolicLink() ||
      !runConfigTemplateMetadata.isFile() ||
      runConfigTemplateMetadata.size < 1 ||
      runConfigTemplateMetadata.size > maximumRunConfigTemplateBytes ||
      canonicalRunConfigTemplatePath !== runConfigTemplatePath
    ) {
      return fail(
        'Run config template must be a bounded regular file without symlinks.'
      );
    }
    const secretCanaries = parseCanaryArray(
      required(
        read,
        AGENT_EVALUATION_OWNER_AUTHORITY_ENVIRONMENT_NAMES.secretCanaries
      ),
      AGENT_EVALUATION_OWNER_AUTHORITY_ENVIRONMENT_NAMES.secretCanaries
    );
    const protectedCanaries = parseCanaryArray(
      required(
        read,
        AGENT_EVALUATION_OWNER_AUTHORITY_ENVIRONMENT_NAMES.protectedHoldoutCanaries
      ),
      AGENT_EVALUATION_OWNER_AUTHORITY_ENVIRONMENT_NAMES.protectedHoldoutCanaries
    );
    const canaries = Object.freeze([
      serviceToken,
      ...secretCanaries,
      ...protectedCanaries,
    ]);
    if (new Set(canaries).size !== canaries.length) {
      return fail('Owner authority canary sets overlap.');
    }
    const forbiddenCanaries = () => canaries;
    const createAuthorities =
      options.createAuthorities ??
      fail('Repo-owned owner authority composition is unavailable.');
    try {
      await lstat(shutdownReceiptPath);
      return fail('Owner authority shutdown receipt path already exists.');
    } catch (caught) {
      if ((caught as NodeJS.ErrnoException).code !== 'ENOENT') throw caught;
    }
    const journal =
      await createFileAgentEvaluationOwnerAuthorityReplayJournal(
        stateDirectory
      );
    const authorities = await createAuthorities({
      purpose,
      environment: read,
      forbiddenCanaries,
    });
    if (authorities.purpose !== purpose) {
      await authorities.close();
      return fail('Owner authority factory purpose drifted.');
    }
    const sidecar =
      authorities.purpose === 'preplan'
        ? createProductionAgentEvaluationOwnerAuthoritySidecar({
            serviceToken,
            authorities,
            journal,
            forbiddenCanaries,
            capabilityProbeProviderResourceResultIngress: Object.freeze({
              seal: async (input) => {
                const request =
                  createAgentEvaluationCapabilityProbeProviderResourceResultIngressRequest(
                    {
                      namespaceId: input.request.namespaceId,
                      repositoryCommit: input.request.repositoryCommit,
                      registrationRequest: input.request,
                      ownerImplementationDigest:
                        input.ownerImplementationDigest,
                      stageDigest: input.stageDigest,
                      resourceResult: input.resourceResult,
                    }
                  );
                return createEnvironmentAgentEvaluationCapabilityProbeProviderResourceClient(
                  {
                    namespaceId: input.request.namespaceId,
                    repositoryCommit: input.request.repositoryCommit,
                    environment: read,
                  }
                ).storeResult(request, AbortSignal.timeout(30_000));
              },
            }),
            capabilityProbeProviderResourceCleanupResultIngress: Object.freeze({
              seal: (request) =>
                createEnvironmentAgentEvaluationCapabilityProbeProviderResourceCleanupClient(
                  {
                    namespaceId: request.namespaceId,
                    repositoryCommit: request.repositoryCommit,
                    environment: read,
                  }
                ).storeResult(request, AbortSignal.timeout(30_000)),
            }),
          })
        : createProductionAgentEvaluationOwnerAuthoritySidecar({
            serviceToken,
            authorities,
            journal,
            forbiddenCanaries,
            attemptAuthorityResultIngress: Object.freeze({
              seal: (input) =>
                createEnvironmentAgentEvaluationAttemptAuthorityResultIngressClient(
                  {
                    environment: read,
                    forbiddenCanaries,
                  }
                ).seal(input),
            }),
          });
    return Object.freeze({
      sidecar,
      host: '127.0.0.1',
      port: 8791,
      shutdownReceiptPath,
    });
  };
