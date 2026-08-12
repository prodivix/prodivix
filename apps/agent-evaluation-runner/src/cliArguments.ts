import {
  basename,
  isAbsolute,
  parse,
  relative,
  resolve,
  sep,
  win32,
} from 'node:path';
import {
  AGENT_EVALUATION_RUNNER_ERROR_CODES,
  AgentEvaluationRunnerError,
} from './errors';
import { containsAsciiControlCharacter } from './textSafety';
import { AGENT_EVALUATION_PRODUCTION_RUN_CONFIG_FILE_NAME } from './productionQualification';

export type AgentEvaluationPrePlanCliArguments = Readonly<{
  command: 'preplan';
  configPath: string;
  outputPath: string;
}>;

export type AgentEvaluationPlanCliArguments = Readonly<{
  command: 'plan';
  configPath: string;
  outputPath: string;
  shardsOutputPath: string;
}>;

export type AgentEvaluationSmokeCliArguments = Readonly<{
  command: 'smoke';
  configPath: string;
  planPath: string;
  outputPath: string;
}>;

export type AgentEvaluationRunShardCliArguments = Readonly<{
  command: 'run-shard';
  planPath: string;
  shardId: string;
}>;

export type AgentEvaluationFreezeConfigCommitmentCliArguments = Readonly<{
  command: 'freeze-config-commitment';
  planPath: string;
  outputPath: string;
}>;

export type AgentEvaluationSealRunConfigArtifactCliArguments = Readonly<{
  command: 'seal-run-config-artifact';
  configPath: string;
  planPath: string;
}>;

export type AgentEvaluationStatusCliArguments = Readonly<{
  command: 'status';
  planPath: string;
  shardId?: string;
  outputPath: string;
}>;

export type AgentEvaluationExportReviewCliArguments = Readonly<{
  command: 'export-review';
  planPath: string;
  outputPath: string;
}>;

export type AgentEvaluationImportReviewCliArguments = Readonly<{
  command: 'import-review';
  planPath: string;
  inputPath: string;
}>;

export type AgentEvaluationFinalizeCliArguments = Readonly<{
  command: 'finalize';
  planPath: string;
  outputPath: string;
}>;

export type AgentEvaluationExportEvidenceCliArguments = Readonly<{
  command: 'export-evidence';
  planPath: string;
  manifestPath: string;
  archiveOutputPath: string;
  rootOutputPath: string;
}>;

export type AgentEvaluationValidateReviewCliArguments = Readonly<{
  command: 'validate-review';
  reviewBundlePath: string;
  submissionId: string;
  inboxRoot: string;
  sourceRunId: string;
  sourceRunAttempt: number;
  sourceArtifactName: string;
  sourceArtifactDigest: string;
  configPath: string;
  outputPath: string;
}>;

export type AgentEvaluationCliArguments =
  | AgentEvaluationExportEvidenceCliArguments
  | AgentEvaluationExportReviewCliArguments
  | AgentEvaluationFinalizeCliArguments
  | AgentEvaluationFreezeConfigCommitmentCliArguments
  | AgentEvaluationImportReviewCliArguments
  | AgentEvaluationPrePlanCliArguments
  | AgentEvaluationPlanCliArguments
  | AgentEvaluationRunShardCliArguments
  | AgentEvaluationSealRunConfigArtifactCliArguments
  | AgentEvaluationSmokeCliArguments
  | AgentEvaluationStatusCliArguments
  | AgentEvaluationValidateReviewCliArguments;

export type ParseAgentEvaluationCliArgumentsInput = Readonly<{
  allowedPathRoots?: readonly string[];
  cwd?: string;
}>;

type CommandName = AgentEvaluationCliArguments['command'];
type OptionName =
  | '--archive-output'
  | '--config'
  | '--inbox-root'
  | '--input'
  | '--manifest'
  | '--output'
  | '--plan'
  | '--review-bundle'
  | '--root-output'
  | '--shard'
  | '--shards-output'
  | '--source-artifact-digest'
  | '--source-artifact-name'
  | '--source-run-attempt'
  | '--source-run-id'
  | '--submission-id';

const commandOptions = Object.freeze({
  preplan: { required: ['--config', '--output'], optional: [] },
  plan: {
    required: ['--config', '--output', '--shards-output'],
    optional: [],
  },
  smoke: { required: ['--config', '--plan', '--output'], optional: [] },
  'freeze-config-commitment': {
    required: ['--plan', '--output'],
    optional: [],
  },
  'seal-run-config-artifact': {
    required: ['--config', '--plan'],
    optional: [],
  },
  'run-shard': { required: ['--plan', '--shard'], optional: [] },
  status: { required: ['--plan', '--output'], optional: ['--shard'] },
  'export-review': { required: ['--plan', '--output'], optional: [] },
  'import-review': { required: ['--plan', '--input'], optional: [] },
  finalize: { required: ['--plan', '--output'], optional: [] },
  'export-evidence': {
    required: ['--plan', '--manifest', '--archive-output', '--root-output'],
    optional: [],
  },
  'validate-review': {
    required: [
      '--review-bundle',
      '--submission-id',
      '--inbox-root',
      '--source-run-id',
      '--source-run-attempt',
      '--source-artifact-name',
      '--source-artifact-digest',
      '--config',
      '--output',
    ],
    optional: [],
  },
} as const satisfies Readonly<
  Record<
    CommandName,
    Readonly<{
      required: readonly OptionName[];
      optional?: readonly OptionName[];
    }>
  >
>);

const invalid = (): never => {
  throw new AgentEvaluationRunnerError(
    AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid
  );
};

const commandName = (value: string | undefined): CommandName => {
  if (!value || !Object.hasOwn(commandOptions, value)) return invalid();
  return value as CommandName;
};

const canonicalShardId = (value: string | undefined): string => {
  if (!value || !/^evaluation-shard:[0-9a-f]{64}$/u.test(value)) {
    return invalid();
  }
  return value;
};

const canonicalOpaqueIdentity = (
  value: string | undefined,
  maximumLength: number
): string => {
  if (
    !value ||
    value.length > maximumLength ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(value)
  ) {
    return invalid();
  }
  return value;
};

const canonicalPositiveInteger = (value: string | undefined): number => {
  if (!value || !/^[1-9][0-9]*$/u.test(value)) return invalid();
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) return invalid();
  return parsed;
};

const canonicalGitHubArtifactDigest = (value: string | undefined): string => {
  if (!value || !/^sha256:[0-9a-f]{64}$/u.test(value)) return invalid();
  return value;
};

const canonicalOperationalRoot = (value: string): string => {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > 4_096 ||
    value !== value.trim() ||
    containsAsciiControlCharacter(value) ||
    value.startsWith('\\\\') ||
    value.startsWith('//') ||
    !isAbsolute(value) ||
    (win32.isAbsolute(value) && !isAbsolute(value))
  ) {
    return invalid();
  }
  const root = resolve(value);
  if (root === parse(root).root) return invalid();
  return root;
};

const canonicalFilePath = (
  value: string | undefined,
  cwd: string,
  allowedPathRoots: readonly string[],
  repositoryRelative: boolean
): string => {
  if (
    !value ||
    value.length > 4_096 ||
    value !== value.trim() ||
    containsAsciiControlCharacter(value) ||
    value.startsWith('\\\\') ||
    value.startsWith('//')
  ) {
    return invalid();
  }
  const portable = value.replaceAll('\\', '/');
  const segments = portable.split('/');
  if (
    segments.some((segment) => segment === '.' || segment === '..') ||
    portable.endsWith('/') ||
    /^(?:file|https?):/iu.test(portable) ||
    (repositoryRelative && (isAbsolute(value) || win32.isAbsolute(value))) ||
    (win32.isAbsolute(value) && !isAbsolute(value))
  ) {
    return invalid();
  }
  const absolute = resolve(cwd, value);
  const permitted = allowedPathRoots.some((root) => {
    const displacement = relative(root, absolute);
    return (
      displacement.length > 0 &&
      displacement !== '..' &&
      !displacement.startsWith(`..${sep}`) &&
      !isAbsolute(displacement)
    );
  });
  if (!permitted) {
    return invalid();
  }
  return absolute;
};

const readOptions = (
  argv: readonly string[],
  command: CommandName
): ReadonlyMap<OptionName, string> => {
  const specification = commandOptions[command];
  const allowed = new Set<OptionName>([
    ...specification.required,
    ...specification.optional,
  ]);
  const options = new Map<OptionName, string>();
  if ((argv.length - 1) % 2 !== 0) return invalid();
  for (let index = 1; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (
      !name ||
      !allowed.has(name as OptionName) ||
      options.has(name as OptionName) ||
      !value ||
      value.startsWith('--')
    ) {
      return invalid();
    }
    options.set(name as OptionName, value);
  }
  if (specification.required.some((name) => !options.has(name))) {
    return invalid();
  }
  return options;
};

/** Strict operational CLI grammar; returned file names are absolute and traversal-free. */
export const parseAgentEvaluationCliArguments = (
  argv: readonly string[],
  input: ParseAgentEvaluationCliArgumentsInput = {}
): AgentEvaluationCliArguments => {
  const command = commandName(argv[0]);
  const options = readOptions(argv, command);
  const cwd = canonicalOperationalRoot(resolve(input.cwd ?? process.cwd()));
  const allowedPathRoots = Object.freeze([
    cwd,
    ...(input.allowedPathRoots ?? []).map(canonicalOperationalRoot),
  ]);
  const path = (name: OptionName, repositoryRelative = false): string =>
    canonicalFilePath(
      options.get(name),
      cwd,
      repositoryRelative ? [cwd] : allowedPathRoots,
      repositoryRelative
    );
  switch (command) {
    case 'preplan': {
      const outputPath = path('--output');
      if (
        basename(outputPath) !==
        AGENT_EVALUATION_PRODUCTION_RUN_CONFIG_FILE_NAME
      ) {
        return invalid();
      }
      return Object.freeze({
        command,
        configPath: path('--config', true),
        outputPath,
      });
    }
    case 'plan':
      return Object.freeze({
        command,
        configPath: path('--config'),
        outputPath: path('--output'),
        shardsOutputPath: path('--shards-output'),
      });
    case 'smoke':
      return Object.freeze({
        command,
        configPath: path('--config'),
        planPath: path('--plan'),
        outputPath: path('--output'),
      });
    case 'run-shard':
      return Object.freeze({
        command,
        planPath: path('--plan'),
        shardId: canonicalShardId(options.get('--shard')),
      });
    case 'freeze-config-commitment':
      return Object.freeze({
        command,
        planPath: path('--plan'),
        outputPath: path('--output'),
      });
    case 'seal-run-config-artifact':
      return Object.freeze({
        command,
        configPath: path('--config'),
        planPath: path('--plan'),
      });
    case 'status':
      return Object.freeze({
        command,
        planPath: path('--plan'),
        ...(options.has('--shard')
          ? { shardId: canonicalShardId(options.get('--shard')) }
          : {}),
        outputPath: path('--output'),
      });
    case 'export-review':
      return Object.freeze({
        command,
        planPath: path('--plan'),
        outputPath: path('--output'),
      });
    case 'import-review':
      return Object.freeze({
        command,
        planPath: path('--plan'),
        inputPath: path('--input'),
      });
    case 'finalize':
      return Object.freeze({
        command,
        planPath: path('--plan'),
        outputPath: path('--output'),
      });
    case 'export-evidence':
      return Object.freeze({
        command,
        planPath: path('--plan'),
        manifestPath: path('--manifest'),
        archiveOutputPath: path('--archive-output'),
        rootOutputPath: path('--root-output'),
      });
    case 'validate-review':
      return Object.freeze({
        command,
        reviewBundlePath: path('--review-bundle'),
        submissionId: canonicalOpaqueIdentity(
          options.get('--submission-id'),
          127
        ),
        inboxRoot: path('--inbox-root'),
        sourceRunId: canonicalOpaqueIdentity(
          options.get('--source-run-id'),
          32
        ),
        sourceRunAttempt: canonicalPositiveInteger(
          options.get('--source-run-attempt')
        ),
        sourceArtifactName: canonicalOpaqueIdentity(
          options.get('--source-artifact-name'),
          255
        ),
        sourceArtifactDigest: canonicalGitHubArtifactDigest(
          options.get('--source-artifact-digest')
        ),
        configPath: path('--config'),
        outputPath: path('--output'),
      });
  }
};
