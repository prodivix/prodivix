import { isAgentControlIdentity } from '@prodivix/ai';
import {
  AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_ROLE_ENVIRONMENT_NAME,
  createEnvironmentAgentEvaluationHostedRetrievalRuntimeResourceLifecycleJournalClient,
  type AgentEvaluationHostedRetrievalRuntimeResourceLifecycleRole,
} from './hostedRetrievalRuntimeResourceLifecycleClient';
import { AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES } from './ledgerClient';
import { loadProductionAgentEvaluationFullAttemptHostedRuntimeBinding } from './productionAttemptOwnerAuthorityPorts';
import { createNodeAgentEvaluationCoordinatorFilePort } from './productionFiles';
import { createEnvironmentAgentEvaluationHostedRetrievalRuntimeResourceLifecycleBudgetAuthority } from './productionHostedRetrievalRuntimeResourceLifecycleBudget';
import { createAgentEvaluationHostedRetrievalRuntimeResourceSetId } from './productionHostedRetrievalRuntimeResourceLifecycleOwner';
import { createProductionAgentEvaluationHostedRetrievalRuntimeResourceLifecycleSidecar } from './productionHostedRetrievalRuntimeResourceLifecycleSidecar';
import {
  createAgentEvaluationHostedRetrievalRuntimeResourceLifecycleSpoolCipher,
  EnvironmentAgentEvaluationHostedRetrievalRuntimeResourceLifecycleSpoolKeyResolver,
} from './productionHostedRetrievalRuntimeResourceLifecycleSpoolCipher';
import { createProductionAgentEvaluationHostedRetrievalRuntimeResourceProvider } from './productionHostedRetrievalRuntimeResourceProvider';
import { AGENT_EVALUATION_OWNER_AUTHORITY_ENVIRONMENT_NAMES } from './productionOwnerAuthoritySidecarEnvironment';
import { loadProductionAgentEvaluationRunConfigArtifact } from './productionRunConfigArtifact';
import type { AgentEvaluationEnvironmentReader } from './secretResolver';

export const AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_OWNER_INSTANCE_ENVIRONMENT_NAME =
  'PRODIVIX_G4_MODEL_EVAL_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_OWNER_INSTANCE_ID' as const;

type Environment = NodeJS.ProcessEnv | AgentEvaluationEnvironmentReader;

const readEnvironment = (
  environment: Environment
): AgentEvaluationEnvironmentReader =>
  typeof environment === 'function' ? environment : (name) => environment[name];

const invalid = (): never => {
  throw new TypeError('Hosted lifecycle production composition is invalid.');
};

export const loadProductionAgentEvaluationHostedRetrievalRuntimeResourceLifecycleBinding =
  async (input: { environment?: Environment; clock?: () => Date }) => {
    const environment = input.environment ?? process.env;
    const read = readEnvironment(environment);
    const namespaceId = read(
      AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.namespace
    );
    const role = read(
      AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_ROLE_ENVIRONMENT_NAME
    );
    const lifecycleOwnerInstanceId = read(
      AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_OWNER_INSTANCE_ENVIRONMENT_NAME
    );
    const observed = (input.clock ?? (() => new Date()))();
    if (
      !isAgentControlIdentity(namespaceId) ||
      !['cleanup', 'prepare', 'recovery'].includes(role ?? '') ||
      !isAgentControlIdentity(lifecycleOwnerInstanceId) ||
      !Number.isFinite(observed.getTime())
    ) {
      return invalid();
    }
    const binding =
      await loadProductionAgentEvaluationFullAttemptHostedRuntimeBinding({
        environment: read,
        namespaceId,
        clock: () => new Date(observed),
      });
    const files = createNodeAgentEvaluationCoordinatorFilePort({
      maximumBytes: 16_777_216,
    });
    const frozenBinding = await loadProductionAgentEvaluationRunConfigArtifact({
      files,
      environment: read,
      expectedRepositoryCommit: binding.scope.repositoryCommit,
      expectedPlanDigest: binding.scope.planDigest,
      observedAt: observed.toISOString(),
    });
    const runtimeResourceSetId =
      createAgentEvaluationHostedRetrievalRuntimeResourceSetId(binding.scope);
    if (
      frozenBinding.config.frozenRunDigest !== binding.scope.frozenRunDigest ||
      frozenBinding.artifactBinding.bindingDigest !==
        binding.scope.runConfigArtifactBindingDigest ||
      frozenBinding.config.plan.repositoryCommit !==
        binding.scope.repositoryCommit ||
      frozenBinding.config.plan.planDigest !== binding.scope.planDigest
    ) {
      return invalid();
    }
    return Object.freeze({
      role: role as AgentEvaluationHostedRetrievalRuntimeResourceLifecycleRole,
      lifecycleOwnerInstanceId,
      binding,
      frozenBinding,
      runtimeResourceSetId,
      scope: Object.freeze({
        ...binding.scope,
        runtimeResourceSetId,
      }),
    });
  };

export const createProductionAgentEvaluationHostedRetrievalRuntimeResourceLifecycleSidecarFromEnvironment =
  async (input: {
    environment?: Environment;
    fetch?: typeof fetch;
    clock?: () => Date;
  }) => {
    const environment = input.environment ?? process.env;
    const read = readEnvironment(environment);
    const loaded =
      await loadProductionAgentEvaluationHostedRetrievalRuntimeResourceLifecycleBinding(
        {
          environment,
          ...(input.clock === undefined ? {} : { clock: input.clock }),
        }
      );
    const journalClient =
      createEnvironmentAgentEvaluationHostedRetrievalRuntimeResourceLifecycleJournalClient(
        {
          namespaceId: loaded.scope.namespaceId,
          repositoryCommit: loaded.scope.repositoryCommit,
          environment,
          ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
          ...(input.clock === undefined ? {} : { clock: input.clock }),
        }
      );
    const budgetAuthorities =
      createEnvironmentAgentEvaluationHostedRetrievalRuntimeResourceLifecycleBudgetAuthority(
        {
          namespaceId: loaded.scope.namespaceId,
          plan: loaded.frozenBinding.config.plan,
          environment,
          ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
          ...(input.clock === undefined ? {} : { clock: input.clock }),
        }
      );
    const spoolCipher =
      createAgentEvaluationHostedRetrievalRuntimeResourceLifecycleSpoolCipher({
        profile:
          loaded.frozenBinding.config
            .hostedRetrievalRuntimeResourceLifecycleSpool,
        keys: new EnvironmentAgentEvaluationHostedRetrievalRuntimeResourceLifecycleSpoolKeyResolver(
          environment
        ),
      });
    const provider =
      createProductionAgentEvaluationHostedRetrievalRuntimeResourceProvider({
        lifecycleOwnerInstanceId: loaded.lifecycleOwnerInstanceId,
        lifecycleScope: loaded.scope,
        journalClient,
        spoolCipher,
        budgetClosures: budgetAuthorities,
        environment: read,
        ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
        ...(input.clock === undefined ? {} : { clock: input.clock }),
      });
    const serviceToken = read(
      AGENT_EVALUATION_OWNER_AUTHORITY_ENVIRONMENT_NAMES.serviceToken
    );
    if (serviceToken === undefined) return invalid();
    const sidecar =
      createProductionAgentEvaluationHostedRetrievalRuntimeResourceLifecycleSidecar(
        {
          provider,
          serviceToken,
          role: loaded.role,
          namespaceId: loaded.scope.namespaceId,
          lifecycleOwnerInstanceId: loaded.lifecycleOwnerInstanceId,
          ...(input.clock === undefined ? {} : { clock: input.clock }),
        }
      );
    return Object.freeze({
      ...loaded,
      journalClient,
      budgetAuthorities,
      provider,
      sidecar,
    });
  };
