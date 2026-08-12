import {
  planAgentModelEvaluationAttempts,
  type AgentModelEvaluationPlan,
  type CanonicalDigest,
} from '@prodivix/ai';
import {
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import {
  AgentEvaluationCoordinator,
  type AgentEvaluationCanarySource,
  type AgentEvaluationCoordinatorDependencies,
  type AgentEvaluationCoordinatorHoldoutSealer,
  type AgentEvaluationCoordinatorLedgerFactory,
  type AgentEvaluationCoordinatorShardRunnerFactory,
  type AgentEvaluationCoordinatorSmokeQualifier,
  type AgentEvaluationCoordinatorStatusSource,
  type AgentEvaluationCoordinatorReviewLeaseSource,
  type AgentEvaluationCoordinatorFinalizationService,
  type AgentEvaluationProductionPlanFactory,
} from './coordinator';
import { createEnvironmentAgentEvaluationBlindReviewMappingStore } from './blindReviewMappingStore';
import {
  createEnvironmentAgentEvaluationCoordinatorLedger,
  createEnvironmentAgentEvaluationReviewArtifactSource,
} from './coordinatorLedgerAdapter';
import {
  AGENT_EVALUATION_RUNNER_ERROR_CODES,
  AgentEvaluationRunnerError,
} from './errors';
import type { CreateEnvironmentAgentEvaluationLedgerClientInput } from './ledgerClient';
import {
  createNodeAgentEvaluationCoordinatorFilePort,
  type NodeAgentEvaluationCoordinatorFilePortOptions,
} from './productionFiles';
import {
  createProductionAgentEvaluationAuthoritySignerFactory,
  loadProductionAgentEvaluationFrozenRunConfigBindingForPlan,
} from './productionSignerFactory';
import { createAgentEvaluationEvidenceArchiveAssembler } from './evidenceArchive';
import {
  createAgentEvaluationEvidenceArchiveExporter,
  type AgentEvaluationEvidenceArchiveClosureRepository,
  type AgentEvaluationEvidenceArchiveExporter,
  type AgentEvaluationEvidenceArchiveSourceFactory,
} from './evidenceArchiveExporter';
import {
  createEnvironmentAgentEvaluationEvidenceArchiveClosureRepository,
  createEnvironmentAgentEvaluationEvidenceArchiveSourceFactory,
} from './productionEvidenceArchiveLedger';
import {
  createEnvironmentAgentEvaluationCoordinatorFinalizationService,
  createEnvironmentAgentEvaluationCoordinatorHoldoutSealer,
} from './productionFinalizationService';
import {
  createNodeAgentEvaluationEvidenceArchiveFilePort,
  type AgentEvaluationEvidenceArchiveFilePort,
} from './productionEvidenceArchiveFiles';
import { createProductionAgentEvaluationPublicReviewRubricSource } from './productionReviewRubricSource';
import { createEnvironmentAgentEvaluationCoordinatorReviewLeaseSource } from './productionReviewLeaseSource';
import { createProductionAgentEvaluationCoordinatorStatusSource } from './productionStatusSource';
import {
  createProductionAgentEvaluationAttemptExecutorFactorySource,
  createProductionAgentEvaluationCoordinatorShardRunnerFactory,
  type ProductionAgentEvaluationAttemptAuthoritySource,
  type ProductionAgentEvaluationAttemptExecutorFactorySource,
} from './productionShardRunnerFactory';
import { createEnvironmentAgentEvaluationAttemptAuthorityClients } from './productionAttemptAuthorityClient';
import { createProductionAgentEvaluationAttemptMaterialSource } from './productionAttemptExecutorFactory';
import { createEnvironmentProductionAgentEvaluationNativeProviderStateVaultClient } from './productionNativeProviderStateVaultClient';
import {
  createProductionAgentEvaluationHumanReviewImportVerifier,
  createProductionAgentEvaluationReviewValidationService,
} from './reviewValidation';
import {
  decodeAgentEvaluationFrozenRunConfig,
  requireProductionAgentEvaluationFrozenRunConfig,
  type AgentEvaluationProductionFrozenRunConfig,
} from './runConfig';
import {
  createAgentEvaluationControlledWorkspaceRuntime,
  type AgentEvaluationControlledWorkspaceMaterialSource,
  type CreateAgentEvaluationControlledWorkspaceRuntimeInput,
} from './controlledWorkspaceRuntime';
import {
  createProductionAgentEvaluationControlledWorkspaceG3Authority,
  createProductionAgentEvaluationVerificationAttemptGrantPreparationAuthority,
  type CreateProductionAgentEvaluationControlledWorkspaceG3AuthorityInput,
} from './controlledWorkspaceRuntimeProduction';
import { createEnvironmentAgentEvaluationControlledWorkspaceG3AdmissionAuthority } from './controlledWorkspaceG3AdmissionClient';
import { createEnvironmentAgentEvaluationControlledWorkspaceService } from './controlledWorkspaceRuntimeService';
import { createEnvironmentAgentEvaluationVerificationEvidenceBridge } from './evaluationVerificationEvidenceBridge';
import { createEnvironmentAgentEvaluationVerificationAttemptGrantIssuer } from './verificationAttemptGrantClient';
import { createEnvironmentAgentEvaluationEndpointSmokeTransportFactory } from './endpointSmokeTransport';
import { createEnvironmentAgentEvaluationEndpointSmokeResultSpoolCipher } from './endpointSmokeResultSpoolCipher';
import { createEnvironmentAgentEvaluationEndpointSmokeJournal } from './productionEndpointSmokeJournal';
import { AGENT_EVALUATION_G3_SANDBOX_ADAPTER_DESCRIPTOR } from './controlledWorkspaceG3CellAdapter';
import {
  createAgentEvaluationEndpointSmokeQualifier,
  createAgentEvaluationFrozenRunConfigSmokeAuthorityResolver,
  type AgentEvaluationEndpointSmokeJournal,
} from './smokeQualifier';
import {
  AGENT_EVALUATION_PROTECTED_HOLDOUT_CANARIES_ENVIRONMENT_NAME,
  AGENT_EVALUATION_SECRET_CANARIES_ENVIRONMENT_NAME,
  decodeProductionAgentEvaluationCanaries,
} from './productionCanaries';

export {
  AGENT_EVALUATION_PROTECTED_HOLDOUT_CANARIES_ENVIRONMENT_NAME,
  AGENT_EVALUATION_SECRET_CANARIES_ENVIRONMENT_NAME,
  decodeProductionAgentEvaluationCanaries,
} from './productionCanaries';
export const AGENT_EVALUATION_REPOSITORY_COMMIT_ENVIRONMENT_NAME =
  'PRODIVIX_G4_MODEL_EVAL_REPOSITORY_COMMIT' as const;

export type ProductionAgentEvaluationCoordinatorOptions = Readonly<{
  environment?: NodeJS.ProcessEnv;
  fetch?: typeof fetch;
  now?: () => string;
  files?: ReturnType<typeof createNodeAgentEvaluationCoordinatorFilePort>;
  fileOptions?: NodeAgentEvaluationCoordinatorFilePortOptions;
  smokeQualifier?: AgentEvaluationCoordinatorSmokeQualifier;
  statusSource?: AgentEvaluationCoordinatorStatusSource;
  reviewLeaseSource?: AgentEvaluationCoordinatorReviewLeaseSource;
  finalizationService?: AgentEvaluationCoordinatorFinalizationService;
  /** External server/runtime authorities; production has no in-memory fallback. */
  attemptAuthoritySource?: ProductionAgentEvaluationAttemptAuthoritySource;
  /** Test-only seam for a fully composed descriptor executor. */
  attemptExecutorFactorySource?: ProductionAgentEvaluationAttemptExecutorFactorySource;
  shardRunnerFactory?: AgentEvaluationCoordinatorShardRunnerFactory;
  holdoutSealer?: AgentEvaluationCoordinatorHoldoutSealer;
  evidenceArchiveExporter?: AgentEvaluationEvidenceArchiveExporter;
  evidenceArchiveSourceFactory?: AgentEvaluationEvidenceArchiveSourceFactory;
  evidenceArchiveClosureRepository?: AgentEvaluationEvidenceArchiveClosureRepository;
  evidenceArchiveFiles?: AgentEvaluationEvidenceArchiveFilePort;
}>;

export type ProductionAgentEvaluationControlledWorkspaceG3AuthorityOptions =
  Omit<
    CreateProductionAgentEvaluationControlledWorkspaceG3AuthorityInput,
    'verificationAttemptGrantIssuer' | 'evidenceBridge'
  > &
    Readonly<{
      environment?: NodeJS.ProcessEnv;
      fetch?: typeof fetch;
    }>;

export type ProductionAgentEvaluationControlledWorkspaceRuntimeOptions = Omit<
  CreateAgentEvaluationControlledWorkspaceRuntimeInput,
  'authorizer' | 'loader' | 'operations'
> &
  Readonly<{
    evaluationPlanDigest: CanonicalDigest;
    environment?: NodeJS.ProcessEnv;
    fetch?: typeof fetch;
  }>;

export type ProductionAgentEvaluationEndpointSmokeQualifierOptions = Readonly<{
  environment?: NodeJS.ProcessEnv;
  fetch?: typeof fetch;
  now?: () => string;
  journal?: AgentEvaluationEndpointSmokeJournal;
}>;

/** Composes the real five-target smoke qualifier with pinned egress and the Backend v40 journal. */
export const createProductionAgentEvaluationEndpointSmokeQualifierFromEnvironment =
  (
    options: ProductionAgentEvaluationEndpointSmokeQualifierOptions = {}
  ): AgentEvaluationCoordinatorSmokeQualifier => {
    const environment = options.environment ?? process.env;
    const now = options.now ?? (() => new Date().toISOString());
    return createAgentEvaluationEndpointSmokeQualifier({
      authorityResolver:
        createAgentEvaluationFrozenRunConfigSmokeAuthorityResolver(),
      transportFactory:
        createEnvironmentAgentEvaluationEndpointSmokeTransportFactory({
          environment,
          now,
        }),
      spoolCipher:
        createEnvironmentAgentEvaluationEndpointSmokeResultSpoolCipher({
          environment,
        }),
      journal:
        options.journal ??
        createEnvironmentAgentEvaluationEndpointSmokeJournal({
          environment,
          ...(options.fetch ? { fetch: options.fetch } : {}),
        }),
      now,
    });
  };

/**
 * Composes the controlled Workspace G3 authority exclusively from the
 * evaluation service boundary. Missing or drifted service configuration is
 * rejected before any adapter/provider dispatch.
 */
export const createProductionAgentEvaluationControlledWorkspaceG3AuthorityFromEnvironment =
  (options: ProductionAgentEvaluationControlledWorkspaceG3AuthorityOptions) => {
    const { environment, fetch: fetchImplementation, ...authority } = options;
    const service = Object.freeze({
      evaluationPlanDigest: authority.evaluationPlanDigest,
      repositoryCommit: authority.repositoryCommit,
      ...(environment ? { environment } : {}),
      ...(fetchImplementation ? { fetch: fetchImplementation } : {}),
      operationTimeoutMs:
        AGENT_EVALUATION_G3_SANDBOX_ADAPTER_DESCRIPTOR.budgets
          .maximumDurationMs,
    });
    return createProductionAgentEvaluationControlledWorkspaceG3Authority({
      ...authority,
      verificationAttemptGrantIssuer:
        createEnvironmentAgentEvaluationVerificationAttemptGrantIssuer(service),
      evidenceBridge:
        createEnvironmentAgentEvaluationVerificationEvidenceBridge(service),
    });
  };

/**
 * Binds the orchestration runtime to the server-only durable grant, sandbox,
 * reattach, effect, and operation-journal authority.
 */
export const createProductionAgentEvaluationControlledWorkspaceRuntimeFromEnvironment =
  (options: ProductionAgentEvaluationControlledWorkspaceRuntimeOptions) => {
    const {
      evaluationPlanDigest,
      environment,
      fetch: fetchImplementation,
      ...runtime
    } = options;
    const service = createEnvironmentAgentEvaluationControlledWorkspaceService({
      planDigest: evaluationPlanDigest,
      repositoryCommit: runtime.repositoryCommit,
      ...(environment ? { environment } : {}),
      ...(fetchImplementation ? { fetch: fetchImplementation } : {}),
      operationTimeoutMs: runtime.configuration.loop.continuationTimeoutMs,
    });
    return createAgentEvaluationControlledWorkspaceRuntime({
      ...runtime,
      authorizer: service.authorizer,
      loader: service.loader,
      operations: service.operations,
    });
  };

const unavailable = (
  code: (typeof AGENT_EVALUATION_RUNNER_ERROR_CODES)[keyof typeof AGENT_EVALUATION_RUNNER_ERROR_CODES] = AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid
): never => {
  throw new AgentEvaluationRunnerError(code);
};

const productionPlanFactory: AgentEvaluationProductionPlanFactory =
  Object.freeze({
    create: (
      input: Parameters<AgentEvaluationProductionPlanFactory['create']>[0]
    ) => {
      const { config, repositoryCommit, now } = input;
      const frozen = requireProductionAgentEvaluationFrozenRunConfig(
        decodeAgentEvaluationFrozenRunConfig(config, {
          clock: () => now,
          expectedRepositoryCommit: repositoryCommit,
        }),
        repositoryCommit
      );
      if (frozen.execution.retry.maximumAttempts !== 1) return unavailable();
      return frozen.plan;
    },
  });

const parseCanaries = (
  environment: NodeJS.ProcessEnv,
  name: string
): readonly string[] =>
  decodeProductionAgentEvaluationCanaries(environment[name]);

const createCanarySource = (
  environment: NodeJS.ProcessEnv
): AgentEvaluationCanarySource =>
  Object.freeze({
    secretCanaries: () =>
      parseCanaries(
        environment,
        AGENT_EVALUATION_SECRET_CANARIES_ENVIRONMENT_NAME
      ),
    protectedHoldoutCanaries: () =>
      parseCanaries(
        environment,
        AGENT_EVALUATION_PROTECTED_HOLDOUT_CANARIES_ENVIRONMENT_NAME
      ),
  });

const repositoryCommitSource =
  (environment: NodeJS.ProcessEnv): (() => string) =>
  () => {
    const commit =
      environment[AGENT_EVALUATION_REPOSITORY_COMMIT_ENVIRONMENT_NAME];
    return typeof commit === 'string' && /^[0-9a-f]{40}$/u.test(commit)
      ? commit
      : unavailable();
  };

const createControlledWorkspaceMaterialSource = (
  config: AgentEvaluationProductionFrozenRunConfig,
  source: ReturnType<
    typeof createProductionAgentEvaluationAttemptMaterialSource
  >
): AgentEvaluationControlledWorkspaceMaterialSource => {
  const descriptors = new Map(
    planAgentModelEvaluationAttempts(config.plan).map((descriptor) => [
      descriptor.attemptId,
      descriptor,
    ])
  );
  const materialSource: AgentEvaluationControlledWorkspaceMaterialSource = {
    async use(input, callback) {
      const descriptor = descriptors.get(input.attemptId);
      if (
        !descriptor ||
        descriptor.descriptorDigest !== input.descriptorDigest ||
        descriptor.caseId !== input.caseId
      ) {
        return unavailable(
          AGENT_EVALUATION_RUNNER_ERROR_CODES.productionShardRuntimeUnavailable
        );
      }
      return source.use({ plan: config.plan, descriptor }, async (material) => {
        if (material.materialDigest !== input.materialDigest) {
          return unavailable(
            AGENT_EVALUATION_RUNNER_ERROR_CODES.productionShardRuntimeUnavailable
          );
        }
        return callback(material);
      });
    },
  };
  return Object.freeze(materialSource);
};

export type ProductionAgentEvaluationAttemptAuthoritySourceEnvironmentOptions =
  Readonly<{
    environment?: NodeJS.ProcessEnv;
    fetch?: typeof fetch;
    now?: () => string;
  }>;

/**
 * Resolves the production attempt authorities from one exact frozen plan. The
 * environment is validated while loading so a shard cannot reach Provider
 * composition with a partial authority set.
 */
export const createProductionAgentEvaluationAttemptAuthoritySourceFromEnvironment =
  (
    options: ProductionAgentEvaluationAttemptAuthoritySourceEnvironmentOptions = {}
  ): ProductionAgentEvaluationAttemptAuthoritySource => {
    const environment = options.environment ?? process.env;
    const now = options.now ?? (() => new Date().toISOString());
    return Object.freeze({
      async load(input) {
        if (
          input.config.purpose !== 'production' ||
          !sameCanonicalJson(input.config.plan, input.plan)
        ) {
          return unavailable(
            AGENT_EVALUATION_RUNNER_ERROR_CODES.productionShardRuntimeUnavailable
          );
        }
        const secretCanaries = parseCanaries(
          environment,
          AGENT_EVALUATION_SECRET_CANARIES_ENVIRONMENT_NAME
        );
        const protectedHoldoutCanaries = parseCanaries(
          environment,
          AGENT_EVALUATION_PROTECTED_HOLDOUT_CANARIES_ENVIRONMENT_NAME
        );
        const forbiddenCanaries = Object.freeze(
          [...new Set([...secretCanaries, ...protectedHoldoutCanaries])].sort(
            compareUnicodeCodePoints
          )
        );
        const authorityClients =
          createEnvironmentAgentEvaluationAttemptAuthorityClients({
            plan: input.plan,
            environment,
            ...(options.fetch ? { fetch: options.fetch } : {}),
          });
        const stateVault =
          createEnvironmentProductionAgentEvaluationNativeProviderStateVaultClient(
            {
              planDigest: input.plan.planDigest,
              repositoryCommit: input.plan.repositoryCommit,
              expectedAuthority:
                input.config.nativeProviderStateVaultEncryption.authority,
              environment,
              ...(options.fetch ? { fetch: options.fetch } : {}),
              forbiddenCanaries: () => forbiddenCanaries,
            }
          );
        const materialSource =
          createProductionAgentEvaluationAttemptMaterialSource(
            input.config,
            environment
          );
        const controlledWorkspaceMaterialSource =
          createControlledWorkspaceMaterialSource(input.config, materialSource);
        const verificationGrantPreparation =
          createProductionAgentEvaluationVerificationAttemptGrantPreparationAuthority(
            {
              materialSource,
              admissionAuthority:
                createEnvironmentAgentEvaluationControlledWorkspaceG3AdmissionAuthority(
                  {
                    evaluationPlanDigest: input.plan.planDigest,
                    repositoryCommit: input.plan.repositoryCommit,
                    environment,
                    ...(options.fetch ? { fetch: options.fetch } : {}),
                    forbiddenCanaries: () => forbiddenCanaries,
                  }
                ),
              now,
            }
          );
        const controlledRuntime =
          createProductionAgentEvaluationControlledWorkspaceRuntimeFromEnvironment(
            {
              evaluationPlanDigest: input.plan.planDigest,
              repositoryCommit: input.plan.repositoryCommit,
              configuration: input.config.controlledRuntime,
              materialSource: controlledWorkspaceMaterialSource,
              now,
              secretCanaries: () => secretCanaries,
              environment,
              ...(options.fetch ? { fetch: options.fetch } : {}),
            }
          );
        return Object.freeze({
          controlledRuntime,
          capabilityRuntime: authorityClients.capabilityRuntime,
          stateVault,
          prepareVerificationAttemptGrants:
            verificationGrantPreparation.prepare,
          gradeAndPersist: authorityClients.gradeAndPersist,
        });
      },
    });
  };

/**
 * Production composition binds bounded Backend projections, durable five-target
 * smoke qualification, a durable shard journal, and signed streamed evidence.
 * Capability, grading, G3-plan, controlled-runtime, and Native Provider state
 * authorities are resolved before any Provider dispatch.
 */
export const createProductionAgentEvaluationCoordinator = async (
  options: ProductionAgentEvaluationCoordinatorOptions = {}
): Promise<AgentEvaluationCoordinator> => {
  const environment = options.environment ?? process.env;
  const files =
    options.files ??
    createNodeAgentEvaluationCoordinatorFilePort(options.fileOptions);
  const clientInput: Omit<
    CreateEnvironmentAgentEvaluationLedgerClientInput,
    'planDigest'
  > = Object.freeze({
    environment,
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });
  const ledgerFactory: AgentEvaluationCoordinatorLedgerFactory = Object.freeze({
    open: (
      partition: Parameters<AgentEvaluationCoordinatorLedgerFactory['open']>[0]
    ) =>
      createEnvironmentAgentEvaluationCoordinatorLedger(partition, clientInput),
  });
  const signerFactory = createProductionAgentEvaluationAuthoritySignerFactory(
    files,
    environment
  );
  const now = options.now ?? (() => new Date().toISOString());
  const attemptExecutorFactorySource =
    options.attemptExecutorFactorySource ??
    createProductionAgentEvaluationAttemptExecutorFactorySource({
      authorities:
        options.attemptAuthoritySource ??
        createProductionAgentEvaluationAttemptAuthoritySourceFromEnvironment({
          environment,
          ...(options.fetch ? { fetch: options.fetch } : {}),
          now,
        }),
      environment,
      now,
    });
  const evidenceArchiveExporter =
    options.evidenceArchiveExporter ??
    createAgentEvaluationEvidenceArchiveExporter({
      sourceFactory:
        options.evidenceArchiveSourceFactory ??
        createEnvironmentAgentEvaluationEvidenceArchiveSourceFactory(
          clientInput
        ),
      sourceConfigBindingSource: Object.freeze({
        load: async ({
          plan,
        }: Readonly<{ plan: AgentModelEvaluationPlan }>) => {
          const binding =
            await loadProductionAgentEvaluationFrozenRunConfigBindingForPlan({
              files,
              environment,
              plan,
            });
          return Object.freeze({
            runConfigArtifactBinding: binding.artifactBinding,
            sourceConfigDigest: binding.config.sourceConfigDigest,
            frozenRunDigest: binding.config.frozenRunDigest,
          });
        },
      }),
      assembler: createAgentEvaluationEvidenceArchiveAssembler(
        options.evidenceArchiveFiles ??
          createNodeAgentEvaluationEvidenceArchiveFilePort()
      ),
      signerFactory,
      repository:
        options.evidenceArchiveClosureRepository ??
        createEnvironmentAgentEvaluationEvidenceArchiveClosureRepository(
          clientInput
        ),
      rootFiles: files,
      now,
    });
  const dependencies: AgentEvaluationCoordinatorDependencies = Object.freeze({
    files,
    planFactory: productionPlanFactory,
    ledgerFactory,
    shardRunnerFactory:
      options.shardRunnerFactory ??
      createProductionAgentEvaluationCoordinatorShardRunnerFactory({
        files,
        environment,
        ...(options.fetch ? { fetch: options.fetch } : {}),
        now,
        attemptExecutorFactorySource,
      }),
    holdoutSealer:
      options.holdoutSealer ??
      createEnvironmentAgentEvaluationCoordinatorHoldoutSealer(clientInput),
    smokeQualifier:
      options.smokeQualifier ??
      createProductionAgentEvaluationEndpointSmokeQualifierFromEnvironment({
        environment,
        ...(options.fetch ? { fetch: options.fetch } : {}),
        now,
      }),
    statusSource:
      options.statusSource ??
      createProductionAgentEvaluationCoordinatorStatusSource(clientInput),
    reviewLeaseSource:
      options.reviewLeaseSource ??
      createEnvironmentAgentEvaluationCoordinatorReviewLeaseSource(clientInput),
    finalizationService:
      options.finalizationService ??
      createEnvironmentAgentEvaluationCoordinatorFinalizationService(
        clientInput
      ),
    reviewArtifactSource:
      createEnvironmentAgentEvaluationReviewArtifactSource(clientInput),
    reviewRubrics: createProductionAgentEvaluationPublicReviewRubricSource({
      files,
      environment,
    }),
    blindReviewMappings:
      createEnvironmentAgentEvaluationBlindReviewMappingStore(clientInput),
    reviewValidator: createProductionAgentEvaluationReviewValidationService({
      files,
      environment,
      ...(options.now ? { now: options.now } : {}),
    }),
    reviewImportVerifier:
      createProductionAgentEvaluationHumanReviewImportVerifier({
        files,
        environment,
      }),
    evidenceArchiveExporter,
    canaries: createCanarySource(environment),
    repositoryCommit: repositoryCommitSource(environment),
    now,
  });
  return new AgentEvaluationCoordinator(dependencies);
};
