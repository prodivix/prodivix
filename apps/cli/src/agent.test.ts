import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  createDefaultAgentPolicy,
  createAgentTaskRecord,
  decodeAgentControlFact,
  digestAgentCanonicalValue,
  digestAgentPolicy,
  digestAgentTaskAdmission,
  encodeAgentControlFact,
  evaluateEffectiveAgentPolicy,
  type AgentCapabilityGrant,
} from '@prodivix/ai';
import type { Option } from 'commander';
import { AGENT_COMMAND_NAMES, createAgentCommand } from './commands/agent.js';

test('Agent CLI exposes the complete explicit V7 product loop', () => {
  const command = createAgentCommand();
  assert.deepEqual(
    command.commands.map((child) => child.name()),
    [...AGENT_COMMAND_NAMES]
  );
  assert.doesNotMatch(command.helpInformation(), /skip[- ]approval/iu);
  for (const child of command.commands) {
    assert.doesNotMatch(child.helpInformation(), /skip[- ]approval/iu);
  }
});

test('approval and rejection remain separate human commands', () => {
  const command = createAgentCommand();
  const approve = command.commands.find((child) => child.name() === 'approve');
  const reject = command.commands.find((child) => child.name() === 'reject');
  assert.ok(approve);
  assert.ok(reject);
  const rollback = approve.options.find(({ long }) => long === '--rollback');
  assert.ok(
    rollback?.mandatory,
    'approve must require explicit rollback choice'
  );
  assert.equal(
    reject.options.some(({ long }) => long === '--rollback'),
    false,
    'rejection cannot smuggle rollback authority'
  );
});

test('approval command has no bypass option in its parser contract', () => {
  const command = createAgentCommand();
  const approve = command.commands.find((child) => child.name() === 'approve');
  assert.ok(approve);
  assert.equal(
    approve.options.some(({ long }) => long === '--skip-approval'),
    false
  );
});

test('offline inspect does not require remote authority options', () => {
  const command = createAgentCommand();
  const inspect = command.commands.find((child) => child.name() === 'inspect');
  assert.ok(inspect);
  for (const optionName of [
    '--base-url',
    '--project',
    '--workspace',
    '--run',
  ]) {
    const matchingOption: Option | undefined = inspect.options.find(
      (candidate) => candidate.long === optionName
    );
    assert.ok(matchingOption);
    assert.equal(matchingOption.mandatory, false);
  }
});

const admissionFixture = () => {
  const policy = createDefaultAgentPolicy('policy.cli', 'CLI policy');
  const instant = new Date().toISOString();
  const intent = 'Inspect the CLI Workspace.';
  const task = createAgentTaskRecord({
    taskId: 'task.cli.fixture',
    projectId: 'project.cli',
    workspaceId: 'workspace.cli',
    actor: { kind: 'user', principalId: 'user.cli' },
    mode: 'explain',
    baseRevision: {
      workspaceRev: 1,
      routeRev: 1,
      opSeq: 1,
      documents: [{ documentId: policy.id, contentRev: 1, metaRev: 1 }],
    },
    intent,
    intentDigest: digestAgentCanonicalValue(intent),
    targetScope: { targets: [{ kind: 'workspace', id: 'workspace.cli' }] },
    policyRef: { documentId: policy.id },
    policyDigest: digestAgentPolicy(policy),
    initialGrantRef: { grantId: 'grant.provisional' },
    budget: policy.budgetCeiling,
    verificationRequirement: {
      policyRef: 'verification.cli',
      requiredCheckKinds: [],
    },
    createdAt: instant,
    idempotencyKey: 'idempotency.cli.fixture',
  });
  const effective = evaluateEffectiveAgentPolicy({
    projectPolicyRef: task.spec.policyRef,
    actorAuthorizationDigest: digestAgentCanonicalValue('actor'),
    evaluatedAt: instant,
    layers: (['platform', 'project', 'actor', 'grant'] as const).map(
      (kind) => ({
        kind,
        issuer: `issuer.${kind}`,
        policy,
        policyDigest: digestAgentPolicy(policy),
      })
    ),
  });
  assert.ok(effective.ok);
  const admittedTask = createAgentTaskRecord({
    ...task.spec,
    initialGrantRef: { grantId: 'grant.cli.admitted' },
  });
  const grant: AgentCapabilityGrant = {
    grantId: 'grant.cli.admitted',
    subject: task.spec.actor,
    taskId: task.spec.taskId,
    workspaceId: task.spec.workspaceId,
    baseRevision: task.spec.baseRevision,
    targetScope: task.spec.targetScope,
    capabilities: ['read', 'execute'],
    toolIds: [],
    runtimeZones: ['server', 'native'],
    secretRefs: [],
    limits: { budget: task.spec.budget, maxUses: 1 },
    policyRef: task.spec.policyRef,
    policyDigest: task.spec.policyDigest,
    issuedAt: instant,
    expiresAt: new Date(Date.parse(instant) + 60_000).toISOString(),
    maxUses: 1,
  };
  const result = {
    admissionId: 'admission.cli.fixture',
    challengeDigest: digestAgentCanonicalValue('challenge'),
    task: admittedTask,
    effectivePolicy: effective.value,
    grant,
    status: 'admitted' as const,
    diagnosticCodes: [],
  };
  return {
    task,
    admittedTask,
    challenge: {
      admissionId: result.admissionId,
      challengeDigest: result.challengeDigest,
      status: 'pending',
    },
    result: {
      ...result,
      admissionDigest: digestAgentTaskAdmission(result),
      task: encodeAgentControlFact({
        factType: 'task-record',
        value: admittedTask,
      }),
    },
  };
};

type AdmissionFixture = ReturnType<typeof admissionFixture>;
const withCreateCommand = async (
  run: (input: {
    fixture: AdmissionFixture;
    invoke: (project?: string) => Promise<void>;
    output: string;
  }) => Promise<void>
) => {
  const directory = mkdtempSync(join(tmpdir(), 'prodivix-cli-admission-'));
  const previousFetch = globalThis.fetch;
  const previousToken = process.env.PRODIVIX_ACCESS_TOKEN;
  const fixture = admissionFixture();
  try {
    process.env.PRODIVIX_ACCESS_TOKEN = 'fixture-access-token';
    const fact = join(directory, 'task.json');
    const output = join(directory, 'created.json');
    writeFileSync(
      fact,
      JSON.stringify(
        encodeAgentControlFact({ factType: 'task-record', value: fixture.task })
      )
    );
    const invoke = async (project = 'project.cli') => {
      await createAgentCommand().parseAsync(
        [
          'create',
          '--base-url',
          'http://127.0.0.1:8080',
          '--project',
          project,
          '--workspace',
          'workspace.cli',
          '--fact',
          fact,
          '--output',
          output,
        ],
        { from: 'user' }
      );
    };
    await run({ fixture, invoke, output });
  } finally {
    globalThis.fetch = previousFetch;
    if (previousToken === undefined) delete process.env.PRODIVIX_ACCESS_TOKEN;
    else process.env.PRODIVIX_ACCESS_TOKEN = previousToken;
    rmSync(directory, { recursive: true });
  }
};
const jsonResponse = (value: unknown) =>
  new Response(JSON.stringify(value), {
    headers: { 'Content-Type': 'application/json' },
  });

test('CLI Create performs admission and pending polling before one exact admitted Task create', async () => {
  await withCreateCommand(async ({ fixture, invoke, output }) => {
    const calls: string[] = [];
    let polls = 0;
    globalThis.fetch = async (url, init) => {
      const path = new URL(String(url)).pathname;
      calls.push(path);
      assert.equal(init?.redirect, 'error');
      assert.equal(
        new Headers(init?.headers).get('Authorization'),
        'Bearer fixture-access-token'
      );
      if (path.endsWith('/task-admissions')) {
        const body = JSON.parse(String(init?.body));
        assert.deepEqual(Object.keys(body), ['task']);
        const requested = decodeAgentControlFact(body.task);
        assert.ok(requested.ok && requested.value.factType === 'task-record');
        assert.equal(requested.value.value.taskDigest, fixture.task.taskDigest);
        return jsonResponse(fixture.challenge);
      }
      if (path.includes('/task-admissions/')) {
        return jsonResponse(
          ++polls === 1
            ? { ...fixture.challenge, diagnosticCodes: [] }
            : fixture.result
        );
      }
      assert.ok(path.endsWith('/tasks'));
      assert.deepEqual(JSON.parse(String(init?.body)), {
        admissionId: fixture.result.admissionId,
        admissionDigest: fixture.result.admissionDigest,
        task: fixture.result.task,
      });
      return jsonResponse({ task: fixture.result.task, replayed: false });
    };
    await invoke();
    assert.deepEqual(calls, [
      '/api/projects/project.cli/workspaces/workspace.cli/agent/task-admissions',
      '/api/projects/project.cli/workspaces/workspace.cli/agent/task-admissions/admission.cli.fixture',
      '/api/projects/project.cli/workspaces/workspace.cli/agent/task-admissions/admission.cli.fixture',
      '/api/projects/project.cli/workspaces/workspace.cli/agent/tasks',
    ]);
    assert.deepEqual(JSON.parse(readFileSync(output, 'utf8')), {
      task: fixture.result.task,
      replayed: false,
    });
  });
});

test('CLI Create fails closed on blocked, malformed and changed admission identities', async () => {
  await withCreateCommand(async ({ fixture, invoke }) => {
    for (const state of [
      { ...fixture.challenge, status: 'blocked', diagnosticCodes: ['AI-6010'] },
      {
        ...fixture.result,
        admissionDigest: digestAgentCanonicalValue('tampered'),
      },
      {
        ...fixture.result,
        challengeDigest: digestAgentCanonicalValue('unrelated'),
      },
      { ...fixture.result, bypassApproval: true },
    ]) {
      let creates = 0;
      globalThis.fetch = async (url) => {
        const path = String(url);
        if (path.endsWith('/task-admissions'))
          return jsonResponse(fixture.challenge);
        if (path.endsWith('/tasks')) creates += 1;
        return jsonResponse(state);
      };
      await assert.rejects(
        invoke(),
        /AI-6010|strict validation|identity changed/u
      );
      assert.equal(creates, 0);
    }
  });
});

test('CLI Create rejects a different scope before transport and a different created Task afterwards', async () => {
  await withCreateCommand(async ({ fixture, invoke }) => {
    let calls = 0;
    globalThis.fetch = async (url) => {
      calls += 1;
      const path = String(url);
      if (path.endsWith('/task-admissions'))
        return jsonResponse(fixture.challenge);
      if (path.includes('/task-admissions/'))
        return jsonResponse(fixture.result);
      const different = createAgentTaskRecord({
        ...fixture.admittedTask.spec,
        mode: 'plan',
      });
      return jsonResponse({
        task: encodeAgentControlFact({
          factType: 'task-record',
          value: different,
        }),
      });
    };
    await assert.rejects(invoke('other-project'), /selected project/u);
    assert.equal(calls, 0);
    await assert.rejects(invoke(), /does not match the admitted fact/u);
  });
});

test('CLI Create cancels an unresolved admission request on SIGINT and removes its listener', async () => {
  await withCreateCommand(async ({ invoke }) => {
    const previousListeners = process.listenerCount('SIGINT');
    let observedSignal: AbortSignal | undefined;
    globalThis.fetch = async (_url, init) => {
      observedSignal = init?.signal ?? undefined;
      queueMicrotask(() => process.emit('SIGINT'));
      return new Promise(() => {});
    };
    await assert.rejects(invoke(), /cancelled/u);
    assert.equal(observedSignal?.aborted, true);
    assert.equal(process.listenerCount('SIGINT'), previousListeners);
  });
});

test('CLI repair requires an exact authenticated parent Run and carries no approval choice', () => {
  const repair = createAgentCommand().commands.find(
    (child) => child.name() === 'repair'
  );
  assert.ok(repair);
  for (const name of [
    '--base-url',
    '--project',
    '--workspace',
    '--run',
    '--actor',
  ])
    assert.equal(
      repair.options.find(({ long }) => long === name)?.mandatory,
      true
    );
  assert.equal(
    repair.options.some(
      ({ long }) => long === '--rollback' || long === '--skip-approval'
    ),
    false
  );
});

test('CLI repair aborts parent discovery on SIGINT and releases its listener', async () => {
  const previousFetch = globalThis.fetch;
  const previousToken = process.env.PRODIVIX_ACCESS_TOKEN;
  const previousListeners = process.listenerCount('SIGINT');
  let observedSignal: AbortSignal | undefined;
  const calls: string[] = [];
  try {
    process.env.PRODIVIX_ACCESS_TOKEN = 'fixture-access-token';
    globalThis.fetch = async (url, init) => {
      calls.push(String(url));
      observedSignal = init?.signal ?? undefined;
      queueMicrotask(() => process.emit('SIGINT'));
      return new Promise<Response>(() => {});
    };
    await assert.rejects(
      createAgentCommand().parseAsync(
        [
          'repair',
          '--base-url',
          'http://127.0.0.1:8080',
          '--project',
          'project.test',
          '--workspace',
          'workspace.test',
          '--run',
          'run.failed',
          '--actor',
          'user.test',
        ],
        { from: 'user' }
      ),
      /cancelled/u
    );
    assert.equal(observedSignal?.aborted, true);
    assert.equal(calls.length, 1);
    assert.ok(calls[0].endsWith('/runs/run.failed/product'));
    assert.equal(process.listenerCount('SIGINT'), previousListeners);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousToken === undefined) delete process.env.PRODIVIX_ACCESS_TOKEN;
    else process.env.PRODIVIX_ACCESS_TOKEN = previousToken;
  }
});
