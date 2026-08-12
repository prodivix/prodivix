import { resolve } from 'node:path';
import type { AgentEvaluationCommandCoordinator } from './coordinator';
import { describe, expect, it, vi } from 'vitest';
import {
  agentEvaluationCliArgumentsFromProcess,
  createAgentEvaluationCliCoordinatorHandler,
  runAgentEvaluationCli,
} from './cli';
import { AGENT_EVALUATION_RUNNER_ERROR_CODES } from './errors';

const cwd = resolve('agent-evaluation-cli-handler-test');
const shardId = `evaluation-shard:${'a'.repeat(64)}`;

const coordinatorWithCalls = () => {
  const calls: Array<readonly [string, unknown]> = [];
  const method =
    (name: string) =>
    async (input: unknown): Promise<unknown> => {
      calls.push([name, input]);
      return Object.freeze({ ok: true });
    };
  const coordinator: AgentEvaluationCommandCoordinator = {
    plan: method('plan'),
    smoke: method('smoke'),
    runShard: method('runShard'),
    status: method('status'),
    exportReview: method('exportReview'),
    importReview: method('importReview'),
    finalize: method('finalize'),
    exportEvidence: method('exportEvidence'),
    validateReview: method('validateReview'),
  };
  return { calls, coordinator };
};

describe('agent evaluation CLI coordinator dispatch', () => {
  it('removes the single pnpm script delimiter and leaves command grammar intact', () => {
    expect(
      agentEvaluationCliArgumentsFromProcess(['--', 'status', '--plan', 'p'])
    ).toEqual(['status', '--plan', 'p']);
    expect(
      agentEvaluationCliArgumentsFromProcess([
        '--',
        '--',
        'status',
        '--plan',
        'p',
      ])
    ).toEqual(['--', 'status', '--plan', 'p']);
  });

  it('dispatches every frozen command with exact coordinator fields', async () => {
    const { calls, coordinator } = coordinatorWithCalls();
    const handler = createAgentEvaluationCliCoordinatorHandler(coordinator);
    const commands: readonly (readonly string[])[] = [
      [
        'plan',
        '--config',
        'config.json',
        '--output',
        'plan.json',
        '--shards-output',
        'shards.json',
      ],
      [
        'smoke',
        '--config',
        'config.json',
        '--plan',
        'plan.json',
        '--output',
        'smoke.json',
      ],
      ['run-shard', '--plan', 'plan.json', '--shard', shardId],
      [
        'status',
        '--plan',
        'plan.json',
        '--shard',
        shardId,
        '--output',
        'status.json',
      ],
      ['export-review', '--plan', 'plan.json', '--output', 'review.json'],
      ['import-review', '--plan', 'plan.json', '--input', 'human-review.json'],
      ['finalize', '--plan', 'plan.json', '--output', 'manifest.json'],
      [
        'export-evidence',
        '--plan',
        'plan.json',
        '--manifest',
        'manifest.json',
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
        'submission-01',
        '--inbox-root',
        'inbox',
        '--source-run-id',
        '123456',
        '--source-run-attempt',
        '2',
        '--source-artifact-name',
        'g4-blind-review',
        '--source-artifact-digest',
        `sha256:${'a'.repeat(64)}`,
        '--config',
        'config.json',
        '--output',
        'human-review.json',
      ],
    ];
    for (const command of commands) {
      await runAgentEvaluationCli(command, handler, { cwd });
    }
    expect(calls.map(([name]) => name)).toEqual([
      'plan',
      'smoke',
      'runShard',
      'status',
      'exportReview',
      'importReview',
      'finalize',
      'exportEvidence',
      'validateReview',
    ]);
    expect(calls.at(-1)?.[1]).toEqual({
      reviewBundlePath: resolve(cwd, 'blind-review.json'),
      submissionId: 'submission-01',
      inboxRoot: resolve(cwd, 'inbox'),
      sourceRunId: '123456',
      sourceRunAttempt: 2,
      sourceArtifactName: 'g4-blind-review',
      sourceArtifactDigest: `sha256:${'a'.repeat(64)}`,
      configPath: resolve(cwd, 'config.json'),
      outputPath: resolve(cwd, 'human-review.json'),
    });
  });

  it('sanitizes coordinator failures and rejects grammar before dispatch', async () => {
    const secret = 'coordinator-secret-value';
    const coordinator = coordinatorWithCalls().coordinator;
    coordinator.plan = vi.fn(async () => {
      throw new Error(secret);
    });
    let serialized = '';
    try {
      await runAgentEvaluationCli(
        [
          'plan',
          '--config',
          'config.json',
          '--output',
          'plan.json',
          '--shards-output',
          'shards.json',
        ],
        createAgentEvaluationCliCoordinatorHandler(coordinator),
        { cwd }
      );
    } catch (caught) {
      serialized = JSON.stringify(caught);
    }
    expect(serialized).toContain(
      AGENT_EVALUATION_RUNNER_ERROR_CODES.transportFailed
    );
    expect(serialized).not.toContain(secret);

    const handler = vi.fn(async () => undefined);
    await expect(
      runAgentEvaluationCli(['unknown'], handler, { cwd })
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid,
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it.each([
    [
      'preplan',
      [
        'preplan',
        '--config',
        'config.json',
        '--output',
        'production-run-config.json',
      ],
    ],
    [
      'freeze-config-commitment',
      [
        'freeze-config-commitment',
        '--plan',
        'plan.json',
        '--output',
        'frozen-config-commitment.json',
      ],
    ],
  ] as const)(
    'keeps the %s production operation outside coordinator dispatch',
    async (_name, command) => {
      const { calls, coordinator } = coordinatorWithCalls();
      await expect(
        runAgentEvaluationCli(
          command,
          createAgentEvaluationCliCoordinatorHandler(coordinator),
          { cwd }
        )
      ).rejects.toMatchObject({
        code: AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid,
      });
      expect(calls).toEqual([]);
    }
  );
});
