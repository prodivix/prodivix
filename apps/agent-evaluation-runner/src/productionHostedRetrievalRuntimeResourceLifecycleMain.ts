import { isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  createAgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveFamily,
  type AgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveRecord,
  type Instant,
} from '@prodivix/ai';
import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import {
  createEnvironmentAgentEvaluationHostedRetrievalRuntimeResourceCleanupClient,
  createEnvironmentAgentEvaluationHostedRetrievalRuntimeResourcePrepareClient,
  createEnvironmentAgentEvaluationHostedRetrievalRuntimeResourceRecoveryClient,
} from './hostedRetrievalRuntimeResourceLifecycleClient';
import { createEnvironmentAgentEvaluationHostedRetrievalRuntimeResourceOwnerHealthClient } from './hostedRetrievalRuntimeResourceClient';
import { createNodeAgentEvaluationCoordinatorFilePort } from './productionFiles';
import { createEnvironmentAgentEvaluationHostedRetrievalRuntimeResourceLifecycleBudgetAuthority } from './productionHostedRetrievalRuntimeResourceLifecycleBudget';
import {
  createProductionAgentEvaluationHostedRetrievalRuntimeResourceLifecycleArtifact,
  isProductionAgentEvaluationHostedRetrievalRuntimeResourcePreparedArtifact,
  type ProductionAgentEvaluationHostedRetrievalRuntimeResourceCleanupArtifact,
  type ProductionAgentEvaluationHostedRetrievalRuntimeResourcePreparedArtifact,
  type ProductionAgentEvaluationHostedRetrievalRuntimeResourceRecoveryArtifact,
} from './productionHostedRetrievalRuntimeResourceLifecycleArtifacts';
import { loadProductionAgentEvaluationHostedRetrievalRuntimeResourceLifecycleBinding } from './productionHostedRetrievalRuntimeResourceLifecycleComposition';
import {
  createProductionAgentEvaluationHostedRetrievalRuntimeResourceCleanupOwner,
  createProductionAgentEvaluationHostedRetrievalRuntimeResourcePrepareOwner,
  createProductionAgentEvaluationHostedRetrievalRuntimeResourceRecoveryOwner,
  deriveAgentEvaluationHostedRetrievalRuntimeResourceExpectedShardIds,
} from './productionHostedRetrievalRuntimeResourceLifecycleOwner';
import { createEnvironmentAgentEvaluationHostedRetrievalRuntimeResourceLifecycleProviderClient } from './productionHostedRetrievalRuntimeResourceLifecycleSidecar';
import { createProductionAgentEvaluationHostedRetrievalRuntimeResourceOwnerHealthBinding } from './productionSharedEffectHostedOwner';

type Command =
  | Readonly<{ role: 'prepare' | 'recovery'; outputPath: string }>
  | Readonly<{
      role: 'cleanup';
      preparedSetPath: string;
      outputPath: string;
    }>;

const invalid = (): never => {
  throw new TypeError('Hosted lifecycle command is invalid.');
};

const absolutePath = (value: string | undefined): string => {
  if (
    typeof value !== 'string' ||
    !isAbsolute(value) ||
    resolve(value) !== value
  ) {
    return invalid();
  }
  return value;
};

export const parseProductionAgentEvaluationHostedRetrievalRuntimeResourceLifecycleArguments =
  (argumentsList: readonly string[]): Command => {
    if (
      (argumentsList[0] === 'prepare' || argumentsList[0] === 'recovery') &&
      argumentsList.length === 3 &&
      argumentsList[1] === '--output'
    ) {
      return Object.freeze({
        role: argumentsList[0],
        outputPath: absolutePath(argumentsList[2]),
      });
    }
    if (
      argumentsList[0] === 'cleanup' &&
      argumentsList.length === 5 &&
      argumentsList[1] === '--prepared-set' &&
      argumentsList[3] === '--output'
    ) {
      return Object.freeze({
        role: 'cleanup',
        preparedSetPath: absolutePath(argumentsList[2]),
        outputPath: absolutePath(argumentsList[4]),
      });
    }
    return invalid();
  };

const nowInstant = (clock: () => Date): Instant => {
  const value = clock();
  return Number.isFinite(value.getTime())
    ? (value.toISOString() as Instant)
    : invalid();
};

const recordOrderKey = (
  value: AgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveRecord
): string => {
  const record = value.journalRecord;
  return `${record.operation}\u0000${record.registrationRequestDigest}\u0000${record.businessResult.resourceRole ?? ''}\u0000${record.businessResult.resourceId ?? ''}`;
};

const canonicalRecords = (
  records: readonly AgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveRecord[]
) =>
  Object.freeze(
    [...records].sort((left, right) =>
      compareUnicodeCodePoints(recordOrderKey(left), recordOrderKey(right))
    )
  );

const terminalHealth = async (input: {
  namespaceId: string;
  environment: NodeJS.ProcessEnv;
  clock: () => Date;
}) => {
  const binding =
    createProductionAgentEvaluationHostedRetrievalRuntimeResourceOwnerHealthBinding(
      input.namespaceId
    );
  const receipt =
    await createEnvironmentAgentEvaluationHostedRetrievalRuntimeResourceOwnerHealthClient(
      {
        ...binding,
        environment: input.environment,
        clock: input.clock,
      }
    ).readOwnerHealth();
  if (
    receipt === undefined ||
    receipt.storageSummary.activeResourceCount !== 0 ||
    receipt.storageSummary.activeReadLeaseCount !== 0 ||
    receipt.storageSummary.unfinishedCleanupCount !== 0 ||
    receipt.storageSummary.overdueCount !== 0
  ) {
    return invalid();
  }
  return receipt;
};

export const runProductionAgentEvaluationHostedRetrievalRuntimeResourceLifecycle =
  async (
    input: {
      argumentsList?: readonly string[];
      environment?: NodeJS.ProcessEnv;
      clock?: () => Date;
    } = {}
  ): Promise<void> => {
    const command =
      parseProductionAgentEvaluationHostedRetrievalRuntimeResourceLifecycleArguments(
        input.argumentsList ?? process.argv.slice(2)
      );
    const environment = input.environment ?? process.env;
    const clock = input.clock ?? (() => new Date());
    const loaded =
      await loadProductionAgentEvaluationHostedRetrievalRuntimeResourceLifecycleBinding(
        { environment, clock }
      );
    if (loaded.role !== command.role) return invalid();
    const files = createNodeAgentEvaluationCoordinatorFilePort({
      maximumBytes: 16_777_216,
    });
    const readCanonicalJson = files.readCanonicalJson;
    if (readCanonicalJson === undefined) return invalid();
    const provider =
      createEnvironmentAgentEvaluationHostedRetrievalRuntimeResourceLifecycleProviderClient(
        { environment }
      );
    const common = Object.freeze({
      namespaceId: loaded.scope.namespaceId,
      repositoryCommit: loaded.scope.repositoryCommit,
      planDigest: loaded.scope.planDigest,
      frozenRunDigest: loaded.scope.frozenRunDigest,
      runConfigArtifactBindingDigest:
        loaded.scope.runConfigArtifactBindingDigest,
      runtimeResourceSetId: loaded.runtimeResourceSetId,
      lifecycleOwnerInstanceId: loaded.lifecycleOwnerInstanceId,
    });
    let artifact:
      | ProductionAgentEvaluationHostedRetrievalRuntimeResourceCleanupArtifact
      | ProductionAgentEvaluationHostedRetrievalRuntimeResourcePreparedArtifact
      | ProductionAgentEvaluationHostedRetrievalRuntimeResourceRecoveryArtifact;
    if (command.role === 'prepare') {
      const budgetAuthorities =
        createEnvironmentAgentEvaluationHostedRetrievalRuntimeResourceLifecycleBudgetAuthority(
          {
            namespaceId: loaded.scope.namespaceId,
            plan: loaded.frozenBinding.config.plan,
            environment,
            clock,
          }
        );
      const owner =
        createProductionAgentEvaluationHostedRetrievalRuntimeResourcePrepareOwner(
          {
            namespaceId: loaded.scope.namespaceId,
            plan: loaded.frozenBinding.config.plan,
            frozenBinding: loaded.frozenBinding,
            client:
              createEnvironmentAgentEvaluationHostedRetrievalRuntimeResourcePrepareClient(
                {
                  namespaceId: loaded.scope.namespaceId,
                  repositoryCommit: loaded.scope.repositoryCommit,
                  environment,
                  clock,
                }
              ),
            budgetAuthorities,
            provider,
            clock,
          }
        );
      const prepared = await owner.prepare();
      await owner.close();
      const snapshot = await provider.readSnapshot();
      if (
        snapshot.unfinishedMutationCount !== 0 ||
        snapshot.overdueMutationCount !== 0
      ) {
        return invalid();
      }
      artifact =
        createProductionAgentEvaluationHostedRetrievalRuntimeResourceLifecycleArtifact<ProductionAgentEvaluationHostedRetrievalRuntimeResourcePreparedArtifact>(
          {
            format:
              'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-prepared-artifact',
            version: 1,
            role: 'prepare',
            ...common,
            completedAt: nowInstant(clock),
            registrationResults: prepared.registrationResults,
            authoritySet: prepared.authoritySet,
            resourceSetCommitment: prepared.resourceSetCommitment,
            journalArchiveRecords: snapshot.journalArchiveRecords,
            budgetClosureProjections: snapshot.budgetClosureProjections,
          }
        );
    } else if (command.role === 'cleanup') {
      const preparedValue = await readCanonicalJson(command.preparedSetPath);
      if (
        !isProductionAgentEvaluationHostedRetrievalRuntimeResourcePreparedArtifact(
          preparedValue
        ) ||
        preparedValue.namespaceId !== common.namespaceId ||
        preparedValue.repositoryCommit !== common.repositoryCommit ||
        preparedValue.planDigest !== common.planDigest ||
        preparedValue.frozenRunDigest !== common.frozenRunDigest ||
        preparedValue.runConfigArtifactBindingDigest !==
          common.runConfigArtifactBindingDigest ||
        preparedValue.runtimeResourceSetId !== common.runtimeResourceSetId ||
        preparedValue.lifecycleOwnerInstanceId !==
          common.lifecycleOwnerInstanceId
      ) {
        return invalid();
      }
      const owner =
        createProductionAgentEvaluationHostedRetrievalRuntimeResourceCleanupOwner(
          {
            namespaceId: common.namespaceId,
            repositoryCommit: common.repositoryCommit,
            cleanupOwnerInstanceId: common.lifecycleOwnerInstanceId,
            client:
              createEnvironmentAgentEvaluationHostedRetrievalRuntimeResourceCleanupClient(
                {
                  namespaceId: common.namespaceId,
                  repositoryCommit: common.repositoryCommit,
                  environment,
                  clock,
                }
              ),
            provider,
            clock,
          }
        );
      const cleanupResults = await owner.cleanup(
        {
          registrationResults: preparedValue.registrationResults,
          resourceSetCommitment: preparedValue.resourceSetCommitment,
        },
        deriveAgentEvaluationHostedRetrievalRuntimeResourceExpectedShardIds(
          loaded.frozenBinding.config.plan
        )
      );
      const snapshot = await provider.readSnapshot();
      await provider.close();
      if (
        snapshot.unfinishedMutationCount !== 0 ||
        snapshot.overdueMutationCount !== 0
      ) {
        return invalid();
      }
      const journalArchiveRecords = canonicalRecords([
        ...preparedValue.journalArchiveRecords,
        ...snapshot.journalArchiveRecords,
      ]);
      const lifecycleArchiveFamily =
        createAgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveFamily(
          journalArchiveRecords
        );
      if (lifecycleArchiveFamily.closureStatus !== 'zeroed') return invalid();
      artifact =
        createProductionAgentEvaluationHostedRetrievalRuntimeResourceLifecycleArtifact<ProductionAgentEvaluationHostedRetrievalRuntimeResourceCleanupArtifact>(
          {
            format:
              'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-cleanup-artifact',
            version: 1,
            role: 'cleanup',
            ...common,
            completedAt: nowInstant(clock),
            cleanupResults,
            cleanupArchiveRecords: Object.freeze(
              cleanupResults.map(
                (result) => result.cleanupArchiveRecord ?? invalid()
              )
            ),
            journalArchiveRecords,
            lifecycleArchiveFamily,
            terminalHealthReceipt: await terminalHealth({
              namespaceId: common.namespaceId,
              environment,
              clock,
            }),
            closureStatus: 'zeroed',
          }
        );
    } else {
      await provider.recoverUnfinished();
      const owner =
        createProductionAgentEvaluationHostedRetrievalRuntimeResourceRecoveryOwner(
          {
            namespaceId: common.namespaceId,
            cleanupOwnerInstanceId: common.lifecycleOwnerInstanceId,
            client:
              createEnvironmentAgentEvaluationHostedRetrievalRuntimeResourceRecoveryClient(
                {
                  namespaceId: common.namespaceId,
                  repositoryCommit: common.repositoryCommit,
                  environment,
                  clock,
                }
              ),
            provider,
            clock,
          }
        );
      const recoveredCleanupResults = [];
      let nextCursor = null;
      do {
        const page = await owner.recoverPage(nextCursor);
        recoveredCleanupResults.push(...page.terminalResults);
        nextCursor = page.nextCursor;
      } while (nextCursor !== null);
      const snapshot = await provider.readSnapshot();
      await provider.close();
      if (
        snapshot.unfinishedMutationCount !== 0 ||
        snapshot.overdueMutationCount !== 0
      ) {
        return invalid();
      }
      const journalArchiveRecords = canonicalRecords(
        snapshot.journalArchiveRecords
      );
      const lifecycleArchiveFamily =
        journalArchiveRecords.length === 0
          ? null
          : createAgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveFamily(
              journalArchiveRecords
            );
      if (
        lifecycleArchiveFamily !== null &&
        lifecycleArchiveFamily.closureStatus !== 'zeroed'
      )
        return invalid();
      artifact =
        createProductionAgentEvaluationHostedRetrievalRuntimeResourceLifecycleArtifact<ProductionAgentEvaluationHostedRetrievalRuntimeResourceRecoveryArtifact>(
          {
            format:
              'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-recovery-artifact',
            version: 1,
            role: 'recovery',
            ...common,
            completedAt: nowInstant(clock),
            recoveredCleanupResults: Object.freeze(recoveredCleanupResults),
            recoveredCleanupArchiveRecords: Object.freeze(
              recoveredCleanupResults.map(
                (result) => result.cleanupArchiveRecord ?? invalid()
              )
            ),
            journalArchiveRecords,
            lifecycleArchiveFamily,
            terminalHealthReceipt: await terminalHealth({
              namespaceId: common.namespaceId,
              environment,
              clock,
            }),
            closureStatus: 'zeroed',
            nextCursor: null,
          }
        );
    }
    await files.createCanonicalJson(command.outputPath, artifact);
  };

const invokedPath = process.argv[1];
if (
  typeof invokedPath === 'string' &&
  pathToFileURL(invokedPath).href === import.meta.url
) {
  runProductionAgentEvaluationHostedRetrievalRuntimeResourceLifecycle().catch(
    () => {
      process.stderr.write(
        'G4_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_COMMAND_FAILED_CLOSED\n'
      );
      process.exitCode = 1;
    }
  );
}
