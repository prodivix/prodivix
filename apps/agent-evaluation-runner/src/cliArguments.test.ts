import { parse, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AGENT_EVALUATION_RUNNER_ERROR_CODES } from './errors';
import { parseAgentEvaluationCliArguments } from './cliArguments';

const cwd = resolve('agent-evaluation-cli-test');
const shardId = `evaluation-shard:${'a'.repeat(64)}`;

describe('agent evaluation operational CLI arguments', () => {
  it.each([
    [
      [
        'preplan',
        '--config',
        'specs/eval.json',
        '--output',
        'state/production-run-config.json',
      ],
      {
        command: 'preplan',
        configPath: resolve(cwd, 'specs/eval.json'),
        outputPath: resolve(cwd, 'state/production-run-config.json'),
      },
    ],
    [
      [
        'plan',
        '--config',
        'specs/eval.json',
        '--output',
        'state/plan.json',
        '--shards-output',
        'state/shards.json',
      ],
      { command: 'plan', configPath: resolve(cwd, 'specs/eval.json') },
    ],
    [
      [
        'smoke',
        '--config',
        'specs/eval.json',
        '--plan',
        'state/plan.json',
        '--output',
        'state/smoke.json',
      ],
      { command: 'smoke', planPath: resolve(cwd, 'state/plan.json') },
    ],
    [
      ['run-shard', '--plan', 'state/plan.json', '--shard', shardId],
      { command: 'run-shard', shardId },
    ],
    [
      [
        'freeze-config-commitment',
        '--plan',
        'state/plan.json',
        '--output',
        'state/frozen-config-commitment.json',
      ],
      {
        command: 'freeze-config-commitment',
        outputPath: resolve(cwd, 'state/frozen-config-commitment.json'),
      },
    ],
    [
      [
        'seal-run-config-artifact',
        '--config',
        'state/production-run-config.json',
        '--plan',
        'state/plan.json',
      ],
      {
        command: 'seal-run-config-artifact',
        configPath: resolve(cwd, 'state/production-run-config.json'),
        planPath: resolve(cwd, 'state/plan.json'),
      },
    ],
    [
      ['status', '--plan', 'state/plan.json', '--output', 'state/status.json'],
      { command: 'status' },
    ],
    [
      [
        'status',
        '--plan',
        'state/plan.json',
        '--shard',
        shardId,
        '--output',
        'state/status.json',
      ],
      { command: 'status', shardId },
    ],
    [
      [
        'export-review',
        '--plan',
        'state/plan.json',
        '--output',
        'state/review.json',
      ],
      { command: 'export-review' },
    ],
    [
      [
        'import-review',
        '--plan',
        'state/plan.json',
        '--input',
        'state/human-review.json',
      ],
      { command: 'import-review' },
    ],
    [
      [
        'finalize',
        '--plan',
        'state/plan.json',
        '--output',
        'state/manifest.json',
      ],
      { command: 'finalize' },
    ],
    [
      [
        'export-evidence',
        '--plan',
        'state/plan.json',
        '--manifest',
        'state/manifest.json',
        '--archive-output',
        'state/evidence-archive',
        '--root-output',
        'state/evidence-root.json',
      ],
      {
        command: 'export-evidence',
        archiveOutputPath: resolve(cwd, 'state/evidence-archive'),
        rootOutputPath: resolve(cwd, 'state/evidence-root.json'),
      },
    ],
    [
      [
        'validate-review',
        '--review-bundle',
        'state/blind-review.json',
        '--submission-id',
        'submission-01',
        '--inbox-root',
        'state/inbox',
        '--source-run-id',
        '123456',
        '--source-run-attempt',
        '2',
        '--source-artifact-name',
        'g4-blind-review',
        '--source-artifact-digest',
        `sha256:${'a'.repeat(64)}`,
        '--config',
        'specs/eval.json',
        '--output',
        'state/human-review.json',
      ],
      {
        command: 'validate-review',
        submissionId: 'submission-01',
        sourceRunAttempt: 2,
        sourceArtifactDigest: `sha256:${'a'.repeat(64)}`,
      },
    ],
  ])('parses the frozen command %#', (argv, expected) => {
    expect(parseAgentEvaluationCliArguments(argv, { cwd })).toMatchObject(
      expected
    );
  });

  const malformedArguments: readonly (readonly string[])[] = [
    [],
    ['unknown'],
    [
      'preplan',
      '--config',
      'specs/eval.json',
      '--output',
      'state/dynamic-name.json',
    ],
    ['plan', '--config', 'specs/eval.json'],
    [
      'plan',
      '--config',
      'specs/eval.json',
      '--config',
      'specs/other.json',
      '--output',
      'plan.json',
      '--shards-output',
      'shards.json',
    ],
    ['run-shard', '--plan', 'plan.json', '--shard', 'shard-1'],
    ['run-shard', '--plan', 'plan.json', '--shard', '../shard'],
    [
      'status',
      '--plan',
      'plan.json',
      '--unknown',
      'value',
      '--output',
      'status.json',
    ],
    ['finalize', '--plan=plan.json', '--output', 'manifest.json'],
    [
      'export-evidence',
      '--plan',
      'plan.json',
      '--manifest',
      '--archive-output',
      'evidence-archive',
      '--root-output',
      'evidence-root.json',
    ],
    [
      'validate-review',
      '--review-bundle',
      'blind-review.json',
      '--submission-id',
      '../submission',
      '--inbox-root',
      'inbox',
      '--source-run-id',
      '123',
      '--source-run-attempt',
      '1',
      '--source-artifact-name',
      'artifact',
      '--source-artifact-digest',
      `sha256:${'a'.repeat(64)}`,
      '--config',
      'config.json',
      '--output',
      'human-review.json',
    ],
  ];
  malformedArguments.forEach((argv, index) => {
    it(`rejects unknown, duplicate, missing, or malformed arguments ${index}`, () => {
      expect(() =>
        parseAgentEvaluationCliArguments(argv, { cwd })
      ).toThrowError(
        expect.objectContaining({
          code: AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid,
        })
      );
    });
  });

  it.each([
    '../outside.json',
    'state/../../outside.json',
    './state/output.json',
    'state/../output.json',
    'file:///tmp/output.json',
    '\\\\.\\pipe\\evaluation-ledger',
    '//server/share/output.json',
    'state/output.json/',
  ])('rejects path escape or non-file path %s', (unsafePath) => {
    expect(() =>
      parseAgentEvaluationCliArguments(
        ['finalize', '--plan', 'plan.json', '--output', unsafePath],
        { cwd }
      )
    ).toThrowError(
      expect.objectContaining({
        code: AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid,
      })
    );
  });

  it('keeps the tracked qualification template repository-relative', () => {
    expect(() =>
      parseAgentEvaluationCliArguments(
        [
          'preplan',
          '--config',
          resolve(cwd, 'config.json'),
          '--output',
          'production-run-config.json',
        ],
        { cwd }
      )
    ).toThrowError(
      expect.objectContaining({
        code: AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid,
      })
    );
  });

  it('allows absolute state files only beneath an explicit operational root', () => {
    const runnerTemp = resolve('agent-evaluation-runner-temp');
    const outputPath = resolve(runnerTemp, 'plan.json');
    expect(
      parseAgentEvaluationCliArguments(
        [
          'plan',
          '--config',
          'specs/eval.json',
          '--output',
          outputPath,
          '--shards-output',
          resolve(runnerTemp, 'shards.json'),
        ],
        { cwd, allowedPathRoots: [runnerTemp] }
      )
    ).toMatchObject({ outputPath });
    expect(
      parseAgentEvaluationCliArguments(
        [
          'plan',
          '--config',
          resolve(runnerTemp, 'production-run-config.json'),
          '--output',
          outputPath,
          '--shards-output',
          resolve(runnerTemp, 'shards.json'),
        ],
        { cwd, allowedPathRoots: [runnerTemp] }
      )
    ).toMatchObject({
      configPath: resolve(runnerTemp, 'production-run-config.json'),
    });
    expect(() =>
      parseAgentEvaluationCliArguments(
        [
          'finalize',
          '--plan',
          'plan.json',
          '--output',
          resolve('outside-operational-root', 'manifest.json'),
        ],
        { cwd }
      )
    ).toThrowError(
      expect.objectContaining({
        code: AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid,
      })
    );
    expect(() =>
      parseAgentEvaluationCliArguments(
        [
          'finalize',
          '--plan',
          'plan.json',
          '--output',
          resolve('outside-operational-root', 'manifest.json'),
        ],
        { cwd, allowedPathRoots: [parse(cwd).root] }
      )
    ).toThrowError(
      expect.objectContaining({
        code: AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid,
      })
    );
  });
});
