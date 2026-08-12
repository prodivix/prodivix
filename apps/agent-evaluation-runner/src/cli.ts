import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  AGENT_EVALUATION_RUNNER_ERROR_CODES,
  AgentEvaluationRunnerError,
  safeRunnerError,
} from './errors';
import {
  parseAgentEvaluationCliArguments,
  type AgentEvaluationCliArguments,
  type ParseAgentEvaluationCliArgumentsInput,
} from './cliArguments';
import type { AgentEvaluationCommandCoordinator } from './coordinator';
import { produceAgentEvaluationFrozenConfigCommitment } from './productionFrozenConfigCommitment';
import { produceEnvironmentAgentEvaluationProductionRunConfig } from './productionQualification';
import { createEnvironmentAgentEvaluationProductionRunConfigArtifactIngressClient } from './productionRunConfigArtifactIngress';

export type AgentEvaluationCliCoordinatorHandler = (
  command: AgentEvaluationCliArguments
) => Promise<void>;

export const createAgentEvaluationCliCoordinatorHandler =
  (
    coordinator: AgentEvaluationCommandCoordinator
  ): AgentEvaluationCliCoordinatorHandler =>
  async (command): Promise<void> => {
    switch (command.command) {
      case 'preplan':
        throw new AgentEvaluationRunnerError(
          AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid
        );
      case 'plan':
        await coordinator.plan({
          configPath: command.configPath,
          outputPath: command.outputPath,
          shardsOutputPath: command.shardsOutputPath,
        });
        return;
      case 'smoke':
        await coordinator.smoke({
          configPath: command.configPath,
          planPath: command.planPath,
          outputPath: command.outputPath,
        });
        return;
      case 'run-shard':
        await coordinator.runShard({
          planPath: command.planPath,
          shardId: command.shardId,
        });
        return;
      case 'freeze-config-commitment':
      case 'seal-run-config-artifact':
        throw new AgentEvaluationRunnerError(
          AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid
        );
      case 'status':
        await coordinator.status({
          planPath: command.planPath,
          ...(command.shardId === undefined
            ? {}
            : { shardId: command.shardId }),
          outputPath: command.outputPath,
        });
        return;
      case 'export-review':
        await coordinator.exportReview({
          planPath: command.planPath,
          outputPath: command.outputPath,
        });
        return;
      case 'import-review':
        await coordinator.importReview({
          planPath: command.planPath,
          inputPath: command.inputPath,
        });
        return;
      case 'finalize':
        await coordinator.finalize({
          planPath: command.planPath,
          outputPath: command.outputPath,
        });
        return;
      case 'export-evidence':
        await coordinator.exportEvidence({
          planPath: command.planPath,
          manifestPath: command.manifestPath,
          archiveOutputPath: command.archiveOutputPath,
          rootOutputPath: command.rootOutputPath,
        });
        return;
      case 'validate-review':
        await coordinator.validateReview({
          reviewBundlePath: command.reviewBundlePath,
          submissionId: command.submissionId,
          inboxRoot: command.inboxRoot,
          sourceRunId: command.sourceRunId,
          sourceRunAttempt: command.sourceRunAttempt,
          sourceArtifactName: command.sourceArtifactName,
          sourceArtifactDigest: command.sourceArtifactDigest,
          configPath: command.configPath,
          outputPath: command.outputPath,
        });
    }
  };

const productionCompositionModule = './productionComposition.js';

const productionCompositionUnavailable = (): never => {
  throw new AgentEvaluationRunnerError(
    AGENT_EVALUATION_RUNNER_ERROR_CODES.productionCompositionUnavailable
  );
};

const isCommandCoordinator = (
  value: unknown
): value is AgentEvaluationCommandCoordinator => {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as Partial<AgentEvaluationCommandCoordinator>;
  return [
    candidate.plan,
    candidate.smoke,
    candidate.runShard,
    candidate.status,
    candidate.exportReview,
    candidate.importReview,
    candidate.finalize,
    candidate.exportEvidence,
    candidate.validateReview,
  ].every((method) => typeof method === 'function');
};

/** Fixed-module production loader; it has no caller-controlled import path. */
export const createAgentEvaluationProductionCliHandler =
  (): AgentEvaluationCliCoordinatorHandler => async (command) => {
    if (command.command === 'preplan') {
      await produceEnvironmentAgentEvaluationProductionRunConfig({
        templatePath: command.configPath,
        outputPath: command.outputPath,
      });
      return;
    }
    if (command.command === 'freeze-config-commitment') {
      await produceAgentEvaluationFrozenConfigCommitment({
        planPath: command.planPath,
        outputPath: command.outputPath,
      });
      return;
    }
    if (command.command === 'seal-run-config-artifact') {
      await createEnvironmentAgentEvaluationProductionRunConfigArtifactIngressClient().seal(
        {
          configPath: command.configPath,
          planPath: command.planPath,
        }
      );
      return;
    }
    let module: unknown;
    try {
      module = await import(productionCompositionModule);
    } catch {
      return productionCompositionUnavailable();
    }
    const factory = (
      module as Readonly<{
        createProductionAgentEvaluationCoordinator?: () => Promise<unknown>;
      }>
    ).createProductionAgentEvaluationCoordinator;
    if (typeof factory !== 'function') {
      return productionCompositionUnavailable();
    }
    let coordinator: unknown;
    try {
      coordinator = await factory();
    } catch (caught) {
      if (caught instanceof AgentEvaluationRunnerError) throw caught;
      return productionCompositionUnavailable();
    }
    if (!isCommandCoordinator(coordinator)) {
      return productionCompositionUnavailable();
    }
    await createAgentEvaluationCliCoordinatorHandler(coordinator)(command);
  };

export const runAgentEvaluationCli = async (
  argv: readonly string[],
  coordinator: AgentEvaluationCliCoordinatorHandler,
  input: ParseAgentEvaluationCliArgumentsInput = {}
): Promise<void> => {
  if (typeof coordinator !== 'function') {
    throw new AgentEvaluationRunnerError(
      AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid
    );
  }
  const command = parseAgentEvaluationCliArguments(argv, input);
  try {
    await coordinator(command);
  } catch (caught) {
    throw safeRunnerError(caught);
  }
};

export const agentEvaluationCliArgumentsFromProcess = (
  argv: readonly string[]
): readonly string[] => (argv[0] === '--' ? argv.slice(1) : argv);

const directExecution =
  typeof process.argv[1] === 'string' &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (directExecution) {
  runAgentEvaluationCli(
    agentEvaluationCliArgumentsFromProcess(process.argv.slice(2)),
    createAgentEvaluationProductionCliHandler(),
    {
      cwd: process.cwd(),
      allowedPathRoots:
        typeof process.env.RUNNER_TEMP === 'string'
          ? [process.env.RUNNER_TEMP]
          : [],
    }
  ).catch((caught) => {
    process.stderr.write(
      `${JSON.stringify(safeRunnerError(caught).toJSON())}\n`
    );
    process.exitCode = 1;
  });
}
