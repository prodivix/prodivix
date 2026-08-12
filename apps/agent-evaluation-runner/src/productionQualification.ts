import { lstat } from 'node:fs/promises';
import { basename } from 'node:path';
import {
  AGENT_PRODUCTION_EVALUATION_NATIVE_PROTOCOL_FAMILIES,
  AGENT_PRODUCTION_EVALUATION_FACT_BACKED_OPTIONAL_CAPABILITY_PROFILES,
  AGENT_PRODUCTION_EVALUATION_OPTIONAL_CAPABILITY_PROFILES,
  AGENT_PRODUCTION_EVALUATION_PROBE_PROVIDER_RESOURCE_PROTOCOL_FAMILIES,
  AGENT_PRODUCTION_EVALUATION_RETRIEVAL_CAPABILITY_PROFILES,
  createAgentProductionEvaluationQualificationAuthorityBundle,
  isAgentControlIdentity,
  isAgentControlInstant,
  matchAgentCapabilityProbeProviderResourceAuthority,
  type AgentProductionEvaluationNativeIdentity,
  type AgentCapabilityProbeProviderResourceAuthority,
  type AgentProductionEvaluationProbeProviderResourceAuthorityBundle,
  type AgentProductionEvaluationProbeProviderResourceProtocolFamily,
  type AgentProductionEvaluationQualificationAuthorityBundle,
  resolveAgentProductionEvaluationNativeProviderIdentity,
} from '@prodivix/ai';
import { sameCanonicalJson } from '@prodivix/shared/canonical';
import { isPlainObject } from '@prodivix/shared/safety';
import {
  createAgentEvaluationCapabilityProbeAdmissionRequest,
  type AgentEvaluationCapabilityProbeAdmissionRequest,
} from './capabilityProbeAdmissionClient';
import {
  createEnvironmentAgentEvaluationCapabilityProbeAdmissionHttpClient,
  type AgentEvaluationCapabilityProbeAdmissionHttpClient,
} from './capabilityProbeAdmissionHttpClient';
import {
  AGENT_EVALUATION_RUNNER_ERROR_CODES,
  AgentEvaluationRunnerError,
} from './errors';
import { AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES } from './ledgerClient';
import { createNodeAgentEvaluationCoordinatorFilePort } from './productionFiles';
import { AGENT_EVALUATION_PRODUCTION_RUN_CONFIG_FILE_NAME } from './productionRunConfigArtifact';
import {
  createAgentEvaluationProductionRunConfigDocument,
  decodeAgentEvaluationFrozenRunConfig,
  decodeAgentEvaluationRunConfigQualificationTemplate,
  requireProductionAgentEvaluationFrozenRunConfig,
  type AgentEvaluationProductionFrozenRunConfig,
  type AgentEvaluationRunConfigClock,
  type AgentEvaluationRunConfigQualificationTemplate,
} from './runConfig';
import {
  createAgentEvaluationRuntimeFactSourceRegistrationRequest,
  type AgentEvaluationRuntimeFactSourceRegistrationRequest,
} from './runtimeFactSourceRegistration';
import {
  createEnvironmentAgentEvaluationRuntimeFactSourceRegistrationClient,
  type AgentEvaluationRuntimeFactSourceRegistrationClient,
} from './runtimeFactSourceRegistrationClient';
import type { AgentEvaluationEnvironmentReader } from './secretResolver';
import { createEnvironmentAgentEvaluationCapabilityProbeProviderResourceAuthorityPreparationPort } from './productionCapabilityProbeProviderResourceAuthority';
import { createEnvironmentAgentEvaluationCapabilityProbeProviderResourceAuthorityCleanupPort } from './productionCapabilityProbeProviderResourceCleanupAuthority';

export { AGENT_EVALUATION_PRODUCTION_RUN_CONFIG_FILE_NAME } from './productionRunConfigArtifact';
export const AGENT_EVALUATION_PREPLAN_MAXIMUM_DURATION_MS = 30 * 60 * 1_000;
const maximumRegistrationLifetimeMs = 8 * 24 * 60 * 60 * 1_000;

type Environment = NodeJS.ProcessEnv | AgentEvaluationEnvironmentReader;

export type AgentEvaluationProductionQualificationClients = Readonly<{
  prepareProbeProviderResourceAuthorities: AgentEvaluationProbeProviderResourceAuthorityPreparationPort;
  cleanupProbeProviderResourceAuthorities: AgentEvaluationProbeProviderResourceAuthorityCleanupPort;
  capabilityProbeAdmission: AgentEvaluationCapabilityProbeAdmissionHttpClient;
  runtimeFactSourceRegistration: AgentEvaluationRuntimeFactSourceRegistrationClient;
}>;

export type AgentEvaluationProbeProviderResourceAuthorityPreparationInput =
  Readonly<{
    namespaceId: string;
    template: AgentEvaluationRunConfigQualificationTemplate;
    providerLanes: readonly Readonly<{
      protocolFamily: AgentProductionEvaluationProbeProviderResourceProtocolFamily;
      identity: AgentProductionEvaluationNativeIdentity;
    }>[];
    minimumExpiresAt: string;
    deadlineSignal: AbortSignal;
  }>;

export type AgentEvaluationProbeProviderResourceAuthorityPreparationPort = (
  input: AgentEvaluationProbeProviderResourceAuthorityPreparationInput
) => Promise<AgentEvaluationPreparedProbeProviderResourceAuthorities>;

export type AgentEvaluationPreparedProbeProviderResourceAuthorities = Readonly<{
  authorities: AgentProductionEvaluationProbeProviderResourceAuthorityBundle['authorities'];
}>;

export type AgentEvaluationProbeProviderResourceAuthorityCleanupInput =
  AgentEvaluationProbeProviderResourceAuthorityPreparationInput &
    Readonly<{
      prepared: AgentEvaluationPreparedProbeProviderResourceAuthorities;
    }>;

export type AgentEvaluationProbeProviderResourceAuthorityCleanupPort = (
  input: AgentEvaluationProbeProviderResourceAuthorityCleanupInput
) => Promise<AgentProductionEvaluationProbeProviderResourceAuthorityBundle>;

export type AgentEvaluationProductionQualificationResult = Readonly<{
  document: Readonly<Record<string, unknown>>;
  config: AgentEvaluationProductionFrozenRunConfig;
  replayed: boolean;
}>;

export type AgentEvaluationProductionQualificationFilePort = Readonly<{
  readCanonicalJson(path: string): Promise<unknown>;
  readExistingCanonicalJson(path: string): Promise<unknown | undefined>;
  createCanonicalJson(path: string, value: unknown): Promise<void>;
}>;

export type CreateAgentEvaluationProductionQualificationDocumentInput =
  Readonly<{
    templateDocument: unknown;
    namespaceId: string;
    clock: AgentEvaluationRunConfigClock;
    clients: AgentEvaluationProductionQualificationClients;
  }>;

export type ProduceEnvironmentAgentEvaluationProductionRunConfigInput =
  Readonly<{
    templatePath: string;
    outputPath: string;
    environment?: Environment;
    fetch?: typeof fetch;
    clock?: AgentEvaluationRunConfigClock;
    filePort?: AgentEvaluationProductionQualificationFilePort;
    prepareProbeProviderResourceAuthorities?: AgentEvaluationProbeProviderResourceAuthorityPreparationPort;
    cleanupProbeProviderResourceAuthorities?: AgentEvaluationProbeProviderResourceAuthorityCleanupPort;
  }>;

const invalid = (): never => {
  throw new AgentEvaluationRunnerError(
    AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid
  );
};

const unavailable = (): never => {
  throw new AgentEvaluationRunnerError(
    AGENT_EVALUATION_RUNNER_ERROR_CODES.productionShardRuntimeUnavailable
  );
};

const instantFor = (clock: AgentEvaluationRunConfigClock): string => {
  const sampled = clock();
  const instant = sampled instanceof Date ? sampled.toISOString() : sampled;
  if (!isAgentControlInstant(instant)) return invalid();
  return instant;
};

const qualificationMinimumExpiresAt = (
  template: AgentEvaluationRunConfigQualificationTemplate,
  startedAt: string
): string => {
  if (
    template.planLifetimeMs + AGENT_EVALUATION_PREPLAN_MAXIMUM_DURATION_MS >
    maximumRegistrationLifetimeMs
  ) {
    return invalid();
  }
  const milliseconds =
    Date.parse(startedAt) +
    template.planLifetimeMs +
    AGENT_EVALUATION_PREPLAN_MAXIMUM_DURATION_MS;
  if (!Number.isSafeInteger(milliseconds)) return invalid();
  return new Date(milliseconds).toISOString();
};

const registrationRequestFor = (
  namespaceId: string,
  repositoryCommit: string,
  minimumExpiresAt: string,
  identity: AgentProductionEvaluationNativeIdentity,
  profileId: (typeof AGENT_PRODUCTION_EVALUATION_FACT_BACKED_OPTIONAL_CAPABILITY_PROFILES)[number]
): AgentEvaluationRuntimeFactSourceRegistrationRequest => {
  const source = identity.expectedRuntimeFactSourceIdentities[profileId];
  return createAgentEvaluationRuntimeFactSourceRegistrationRequest({
    namespaceId,
    repositoryCommit,
    sourceAuthorityKind: source.kind,
    sourceKind: source.sourceKind,
    sourceAuthorityId: source.sourceAuthorityId,
    sourceAuthorityImplementationDigest:
      source.sourceAuthorityImplementationDigest,
    routeBinding: source.routeBinding,
    capabilityProfileId: profileId,
    capabilityProfileDigest: source.capabilityProfileDigest,
    capabilityId: source.capabilityId,
    protocolFamily: identity.protocolFamily,
    providerConfigurationId: source.providerConfigurationId,
    modelId: source.modelId,
    modelLineageDigest: source.modelLineageDigest,
    adapterDigest: source.adapterDigest,
    ...(source.hostedRetrievalRuntimeResourceRegistrationIntentDigest
      ? {
          hostedRetrievalRuntimeResourceRegistrationIntentDigest:
            source.hostedRetrievalRuntimeResourceRegistrationIntentDigest,
        }
      : {}),
    minimumExpiresAt,
  });
};

const admissionRequestFor = (
  namespaceId: string,
  repositoryCommit: string,
  minimumExpiresAt: string,
  identity: AgentProductionEvaluationNativeIdentity,
  profileId: (typeof AGENT_PRODUCTION_EVALUATION_OPTIONAL_CAPABILITY_PROFILES)[number],
  probeProviderResourceAuthority: AgentCapabilityProbeProviderResourceAuthority | null
): AgentEvaluationCapabilityProbeAdmissionRequest => {
  const probeProgram = identity.capabilityProbePrograms[profileId];
  const { provider, model } =
    resolveAgentProductionEvaluationNativeProviderIdentity(identity);
  return createAgentEvaluationCapabilityProbeAdmissionRequest({
    namespaceId,
    repositoryCommit,
    providerConfiguration: provider,
    modelLineage: model,
    qualificationCapabilityProfileId: profileId,
    qualificationCapabilityProfileDigest:
      probeProgram.profileProjection.capabilityProfileDigest,
    capabilityId: probeProgram.profileProjection.capabilityId,
    declaredCapabilityProfileDigests: identity.declaredCapabilityProfileDigests,
    probeProgram,
    probeProviderResourceAuthority,
    minimumExpiresAt,
  });
};

/**
 * Seals four provider resources before the exact 15 owner registrations and 18
 * active probe admissions, then freezes one production config after every
 * authority is durable. Registration and probe phases each use one canonical
 * sequential lane per provider.
 */
export const createAgentEvaluationProductionQualificationDocument = async (
  input: CreateAgentEvaluationProductionQualificationDocumentInput
): Promise<AgentEvaluationProductionQualificationResult> => {
  if (!isAgentControlIdentity(input.namespaceId)) return invalid();
  const template = decodeAgentEvaluationRunConfigQualificationTemplate(
    input.templateDocument
  );
  const startedAt = instantFor(input.clock);
  const minimumExpiresAt = qualificationMinimumExpiresAt(template, startedAt);
  const identitiesByProtocol = new Map(
    template.nativeIdentities.map((identity) => [
      identity.protocolFamily,
      identity,
    ])
  );
  if (
    identitiesByProtocol.size !==
      AGENT_PRODUCTION_EVALUATION_NATIVE_PROTOCOL_FAMILIES.length ||
    AGENT_PRODUCTION_EVALUATION_NATIVE_PROTOCOL_FAMILIES.some(
      (protocolFamily) => !identitiesByProtocol.has(protocolFamily)
    )
  ) {
    return invalid();
  }

  const resourceProviderLanes = Object.freeze(
    AGENT_PRODUCTION_EVALUATION_PROBE_PROVIDER_RESOURCE_PROTOCOL_FAMILIES.map(
      (protocolFamily) => {
        const identity = identitiesByProtocol.get(protocolFamily);
        if (!identity) return invalid();
        return Object.freeze({ protocolFamily, identity });
      }
    )
  );
  const deadlineSignal = AbortSignal.timeout(
    AGENT_EVALUATION_PREPLAN_MAXIMUM_DURATION_MS
  );
  let preparedProbeProviderResourceAuthorities: AgentEvaluationPreparedProbeProviderResourceAuthorities;
  try {
    preparedProbeProviderResourceAuthorities =
      await input.clients.prepareProbeProviderResourceAuthorities({
        namespaceId: input.namespaceId,
        template,
        providerLanes: resourceProviderLanes,
        minimumExpiresAt,
        deadlineSignal,
      });
  } catch {
    return unavailable();
  }
  for (const { protocolFamily, identity } of resourceProviderLanes) {
    const { provider, model } =
      resolveAgentProductionEvaluationNativeProviderIdentity(identity);
    for (const profileId of AGENT_PRODUCTION_EVALUATION_RETRIEVAL_CAPABILITY_PROFILES) {
      const authority =
        preparedProbeProviderResourceAuthorities.authorities[protocolFamily][
          profileId
        ];
      if (
        !matchAgentCapabilityProbeProviderResourceAuthority(
          authority,
          identity.capabilityProbePrograms[profileId],
          {
            protocolFamily,
            providerConfigurationId: provider.providerConfigurationId,
            modelId: model.modelId,
            modelLineageDigest: model.lineageDigest,
            adapterDigest: provider.adapter.adapterDigest,
            authorityDigest: authority.authorityDigest,
            observedAt: authority.registeredAt,
          }
        ) ||
        Date.parse(authority.expiresAt) < Date.parse(minimumExpiresAt)
      ) {
        return invalid();
      }
    }
  }
  if (deadlineSignal.aborted) return unavailable();

  const runtimeFactSourceAuthorityEntries = await Promise.all(
    AGENT_PRODUCTION_EVALUATION_NATIVE_PROTOCOL_FAMILIES.map(
      async (protocolFamily) => {
        const identity = identitiesByProtocol.get(protocolFamily);
        if (!identity) return invalid();
        const registered = Object.create(null) as Record<string, unknown>;
        for (const profileId of AGENT_PRODUCTION_EVALUATION_FACT_BACKED_OPTIONAL_CAPABILITY_PROFILES) {
          const registration =
            await input.clients.runtimeFactSourceRegistration.register(
              registrationRequestFor(
                input.namespaceId,
                template.repositoryCommit,
                minimumExpiresAt,
                identity,
                profileId
              )
            );
          registered[profileId] = registration.authority;
        }
        return Object.freeze([
          protocolFamily,
          Object.freeze({ ...registered }),
        ] as const);
      }
    )
  );
  const runtimeFactSourceAuthorities = Object.freeze(
    Object.fromEntries(runtimeFactSourceAuthorityEntries)
  );

  const capabilityProbeAuthorityEntries = await Promise.all(
    AGENT_PRODUCTION_EVALUATION_NATIVE_PROTOCOL_FAMILIES.map(
      async (protocolFamily) => {
        const identity = identitiesByProtocol.get(protocolFamily);
        if (!identity) return invalid();
        const admitted = Object.create(null) as Record<string, unknown>;
        for (const profileId of AGENT_PRODUCTION_EVALUATION_OPTIONAL_CAPABILITY_PROFILES) {
          const response = await input.clients.capabilityProbeAdmission.admit(
            admissionRequestFor(
              input.namespaceId,
              template.repositoryCommit,
              minimumExpiresAt,
              identity,
              profileId,
              AGENT_PRODUCTION_EVALUATION_PROBE_PROVIDER_RESOURCE_PROTOCOL_FAMILIES.includes(
                protocolFamily as AgentProductionEvaluationProbeProviderResourceProtocolFamily
              ) &&
                AGENT_PRODUCTION_EVALUATION_RETRIEVAL_CAPABILITY_PROFILES.includes(
                  profileId as (typeof AGENT_PRODUCTION_EVALUATION_RETRIEVAL_CAPABILITY_PROFILES)[number]
                )
                ? preparedProbeProviderResourceAuthorities.authorities[
                    protocolFamily as AgentProductionEvaluationProbeProviderResourceProtocolFamily
                  ][
                    profileId as (typeof AGENT_PRODUCTION_EVALUATION_RETRIEVAL_CAPABILITY_PROFILES)[number]
                  ]
                : null
            )
          );
          admitted[profileId] = response.probeEvidence;
        }
        return Object.freeze([
          protocolFamily,
          Object.freeze({ ...admitted }),
        ] as const);
      }
    )
  );
  const capabilityProbeAuthorities = Object.freeze(
    Object.fromEntries(capabilityProbeAuthorityEntries)
  );

  let probeProviderResourceAuthorityBundle: AgentProductionEvaluationProbeProviderResourceAuthorityBundle;
  try {
    probeProviderResourceAuthorityBundle =
      await input.clients.cleanupProbeProviderResourceAuthorities({
        namespaceId: input.namespaceId,
        template,
        providerLanes: resourceProviderLanes,
        minimumExpiresAt,
        deadlineSignal,
        prepared: preparedProbeProviderResourceAuthorities,
      });
  } catch {
    return unavailable();
  }

  const completedAt = instantFor(input.clock);
  if (
    Date.parse(completedAt) < Date.parse(startedAt) ||
    Date.parse(completedAt) - Date.parse(startedAt) >=
      AGENT_EVALUATION_PREPLAN_MAXIMUM_DURATION_MS
  ) {
    return unavailable();
  }
  const qualificationAuthorityBundle =
    createAgentProductionEvaluationQualificationAuthorityBundle({
      capabilityProbeAuthorities:
        capabilityProbeAuthorities as AgentProductionEvaluationQualificationAuthorityBundle['capabilityProbeAuthorities'],
      runtimeFactSourceAuthorities:
        runtimeFactSourceAuthorities as AgentProductionEvaluationQualificationAuthorityBundle['runtimeFactSourceAuthorities'],
      providerResourceCleanupReceipts:
        probeProviderResourceAuthorityBundle.cleanupReceipts,
    });
  const document = createAgentEvaluationProductionRunConfigDocument(
    input.templateDocument,
    qualificationAuthorityBundle,
    probeProviderResourceAuthorityBundle,
    completedAt
  );
  const config = requireProductionAgentEvaluationFrozenRunConfig(
    decodeAgentEvaluationFrozenRunConfig(document, {
      clock: () => completedAt,
      expectedRepositoryCommit: template.repositoryCommit,
    }),
    template.repositoryCommit
  );
  return Object.freeze({ document, config, replayed: false });
};

const templateDigestFromProductionDocument = (
  value: unknown
): Readonly<Record<string, unknown>> => {
  if (!isPlainObject(value) || value.purpose !== 'production') return invalid();
  const template = structuredClone(value) as Record<string, unknown>;
  template.purpose = 'template';
  delete template.plannedAt;
  delete template.expiresAt;
  delete template.qualificationAuthorityBundle;
  delete template.probeProviderResourceAuthorityBundle;
  return Object.freeze(template);
};

const validateExistingProductionDocument = (
  value: unknown,
  template: AgentEvaluationRunConfigQualificationTemplate
): AgentEvaluationProductionQualificationResult => {
  const templateProjection = templateDigestFromProductionDocument(value);
  const projected = decodeAgentEvaluationRunConfigQualificationTemplate(
    templateProjection,
    { expectedRepositoryCommit: template.repositoryCommit }
  );
  if (projected.sourceConfigDigest !== template.sourceConfigDigest) {
    return invalid();
  }
  const plannedAt = (value as Record<string, unknown>).plannedAt;
  if (!isAgentControlInstant(plannedAt)) return invalid();
  const config = requireProductionAgentEvaluationFrozenRunConfig(
    decodeAgentEvaluationFrozenRunConfig(value, {
      clock: () => plannedAt,
      expectedRepositoryCommit: template.repositoryCommit,
    }),
    template.repositoryCommit
  );
  return Object.freeze({
    document: Object.freeze({ ...(value as Record<string, unknown>) }),
    config,
    replayed: true,
  });
};

export const createNodeAgentEvaluationProductionQualificationFilePort =
  (): AgentEvaluationProductionQualificationFilePort => {
    const files = createNodeAgentEvaluationCoordinatorFilePort({
      maximumBytes: 16_777_216,
    });
    const readCanonicalJson = files.readCanonicalJson;
    if (!readCanonicalJson) return invalid();
    return Object.freeze({
      readCanonicalJson: (path: string) => readCanonicalJson(path),
      async readExistingCanonicalJson(path: string) {
        try {
          await lstat(path);
        } catch (caught) {
          if ((caught as NodeJS.ErrnoException).code === 'ENOENT') {
            return undefined;
          }
          return invalid();
        }
        return readCanonicalJson(path);
      },
      createCanonicalJson: files.createCanonicalJson,
    });
  };

const readEnvironment = (environment: Environment) =>
  typeof environment === 'function'
    ? environment
    : (name: string): string | undefined => environment[name];

/** Creates or exactly reuses the one generated production run config. */
export const produceEnvironmentAgentEvaluationProductionRunConfig = async (
  input: ProduceEnvironmentAgentEvaluationProductionRunConfigInput
): Promise<AgentEvaluationProductionQualificationResult> => {
  if (
    basename(input.outputPath) !==
    AGENT_EVALUATION_PRODUCTION_RUN_CONFIG_FILE_NAME
  ) {
    return invalid();
  }
  const filePort =
    input.filePort ??
    createNodeAgentEvaluationProductionQualificationFilePort();
  const templateDocument = await filePort.readCanonicalJson(input.templatePath);
  const template =
    decodeAgentEvaluationRunConfigQualificationTemplate(templateDocument);
  const existing = await filePort.readExistingCanonicalJson(input.outputPath);
  if (existing !== undefined) {
    return validateExistingProductionDocument(existing, template);
  }
  const environment = input.environment ?? process.env;
  const namespaceId = readEnvironment(environment)(
    AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.namespace
  );
  if (!namespaceId || !isAgentControlIdentity(namespaceId))
    return unavailable();
  const clients = Object.freeze({
    prepareProbeProviderResourceAuthorities:
      input.prepareProbeProviderResourceAuthorities ??
      createEnvironmentAgentEvaluationCapabilityProbeProviderResourceAuthorityPreparationPort(
        {
          environment,
          ...(input.fetch ? { fetch: input.fetch } : {}),
        }
      ),
    cleanupProbeProviderResourceAuthorities:
      input.cleanupProbeProviderResourceAuthorities ??
      createEnvironmentAgentEvaluationCapabilityProbeProviderResourceAuthorityCleanupPort(
        {
          environment,
          ...(input.fetch ? { fetch: input.fetch } : {}),
        }
      ),
    capabilityProbeAdmission:
      createEnvironmentAgentEvaluationCapabilityProbeAdmissionHttpClient({
        namespaceId,
        repositoryCommit: template.repositoryCommit,
        environment,
        ...(input.fetch ? { fetch: input.fetch } : {}),
      }),
    runtimeFactSourceRegistration:
      createEnvironmentAgentEvaluationRuntimeFactSourceRegistrationClient({
        namespaceId,
        repositoryCommit: template.repositoryCommit,
        environment,
        ...(input.fetch ? { fetch: input.fetch } : {}),
      }),
  });
  const created = await createAgentEvaluationProductionQualificationDocument({
    templateDocument,
    namespaceId,
    clock: input.clock ?? (() => new Date()),
    clients,
  });
  try {
    await filePort.createCanonicalJson(input.outputPath, created.document);
    return created;
  } catch (caught) {
    const raced = await filePort.readExistingCanonicalJson(input.outputPath);
    if (raced === undefined || !sameCanonicalJson(raced, created.document)) {
      throw caught;
    }
    return validateExistingProductionDocument(raced, template);
  }
};
