import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

import { canonicalJsonText } from '../packages/shared/src/canonical/index.ts';
import {
  G4_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_CLI,
  assertG4HostedRetrievalRuntimeResourceLifecycleSecretIsolation,
  createG4HostedRetrievalRuntimeResourceLifecycleSecretVariants,
  registerG4HostedRetrievalRuntimeResourceLifecycleSecretMasks,
  runG4HostedRetrievalRuntimeResourceLifecycleCommand,
  runG4HostedRetrievalRuntimeResourceLifecycleVerifierMain,
  scanG4HostedRetrievalRuntimeResourceLifecycleArtifacts,
  waitForG4HostedRetrievalRuntimeResourceLifecycleSidecarReady,
} from './verify-g4-hosted-retrieval-runtime-resource-lifecycle.mjs';
import { AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_OWNER_IMPLEMENTATION_DIGEST } from '../apps/agent-evaluation-runner/src/productionHostedRetrievalRuntimeResourceProvider.ts';

const temporaryDirectory = await mkdtemp(
  join(tmpdir(), 'prodivix-g4-hosted-lifecycle-')
);

after(async () => {
  await rm(temporaryDirectory, { recursive: true, force: true });
});

const key = (fill) => Buffer.alloc(32, fill).toString('base64');

const protectedEnvironment = Object.freeze({
  PRODIVIX_G4_MODEL_EVAL_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_KEY_BASE64:
    key(1),
  PRODIVIX_G4_MODEL_EVAL_RESULT_SPOOL_KEY_BASE64: key(2),
  PRODIVIX_G4_MODEL_EVAL_CAPABILITY_PROBE_RESPONSE_SPOOL_KEY_BASE64: key(3),
  PRODIVIX_G4_MODEL_EVAL_CAPABILITY_EFFECT_PROVIDER_JOURNAL_SPOOL_KEY_BASE64:
    key(4),
  PRODIVIX_G4_MODEL_EVAL_NATIVE_PROVIDER_STATE_VAULT_KEY_BASE64: key(5),
  PRODIVIX_G4_MODEL_EVAL_OPENAI_API_KEY: 'openai-secret-fixture',
  PRODIVIX_G4_MODEL_EVAL_ANTHROPIC_API_KEY: 'anthropic-secret-fixture',
  PRODIVIX_G4_MODEL_EVAL_GEMINI_API_KEY: 'gemini-secret-fixture',
  PRODIVIX_G4_MODEL_EVAL_SERVICE_TOKEN: 'service-token-fixture-0123456789',
  PRODIVIX_G4_MODEL_EVAL_OWNER_AUTHORITY_SERVICE_TOKEN:
    'owner-token-fixture-012345678901',
  PRODIVIX_G4_MODEL_EVAL_ATTESTATION_PRIVATE_KEY:
    'attestation-private-key-fixture',
  PRODIVIX_G4_MODEL_EVAL_DATABASE_URL: 'postgres://evaluation-secret-fixture',
  PRODIVIX_G4_MODEL_EVAL_SECRET_CANARIES: JSON.stringify([
    'secret-canary-fixture',
  ]),
  PRODIVIX_G4_MODEL_EVAL_PROTECTED_HOLDOUT_CANARIES: JSON.stringify([
    'holdout-canary-fixture',
  ]),
});

test('accepts five canonical pairwise-independent AES-256 keys and masks every encoded form', () => {
  assert.deepEqual(
    assertG4HostedRetrievalRuntimeResourceLifecycleSecretIsolation(
      protectedEnvironment
    ),
    { lifecycleKeyBytes: 32, comparedKeyCount: 5 }
  );
  const variants =
    createG4HostedRetrievalRuntimeResourceLifecycleSecretVariants(
      protectedEnvironment
    );
  assert.ok(
    variants.includes(
      protectedEnvironment.PRODIVIX_G4_MODEL_EVAL_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_KEY_BASE64
    )
  );
  assert.ok(variants.includes(Buffer.alloc(32, 1).toString('hex')));
  assert.ok(variants.includes('secret-canary-fixture'));

  const commands = [];
  const count = registerG4HostedRetrievalRuntimeResourceLifecycleSecretMasks({
    environment: protectedEnvironment,
    write: (value) => commands.push(value),
  });
  assert.equal(count, variants.length);
  assert.equal(commands.length, variants.length);
  assert.ok(commands.every((value) => /^::add-mask::[^\r\n]+\n$/u.test(value)));
});

test('rejects non-canonical and reused lifecycle spool keys', () => {
  assert.throws(
    () =>
      assertG4HostedRetrievalRuntimeResourceLifecycleSecretIsolation({
        ...protectedEnvironment,
        PRODIVIX_G4_MODEL_EVAL_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_KEY_BASE64:
          'not-base64',
      }),
    /not canonical AES-256/u
  );
  assert.throws(
    () =>
      assertG4HostedRetrievalRuntimeResourceLifecycleSecretIsolation({
        ...protectedEnvironment,
        PRODIVIX_G4_MODEL_EVAL_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_KEY_BASE64:
          protectedEnvironment.PRODIVIX_G4_MODEL_EVAL_RESULT_SPOOL_KEY_BASE64,
      }),
    /physically independent/u
  );
});

test('scans bounded lifecycle artifacts for raw, encoded, decoded-key, and canary leakage', async () => {
  const cleanPath = join(temporaryDirectory, 'clean.json');
  await writeFile(cleanPath, canonicalJsonText({ status: 'clean' }), 'utf8');
  assert.deepEqual(
    await scanG4HostedRetrievalRuntimeResourceLifecycleArtifacts({
      roots: [cleanPath],
      environment: protectedEnvironment,
    }),
    { fileCount: 1 }
  );

  for (const [name, leaked] of [
    ['raw', protectedEnvironment.PRODIVIX_G4_MODEL_EVAL_OPENAI_API_KEY],
    ['decoded-key', Buffer.alloc(32, 1).toString('hex')],
    ['canary', 'holdout-canary-fixture'],
  ]) {
    const contaminatedPath = join(temporaryDirectory, `${name}.txt`);
    await writeFile(contaminatedPath, leaked, 'utf8');
    await assert.rejects(
      scanG4HostedRetrievalRuntimeResourceLifecycleArtifacts({
        roots: [contaminatedPath],
        environment: protectedEnvironment,
      }),
      /contains protected material or a canary/u
    );
  }
});

test('orchestrates the frozen prepare and cleanup CLI shapes after signed input validation', async () => {
  const binding = Object.freeze({
    scope: Object.freeze({
      namespaceId: 'g4-evaluation-fixture-0123456789ab',
    }),
  });
  const baseEnvironment = {
    ...protectedEnvironment,
    PRODIVIX_G4_MODEL_EVAL_NAMESPACE: binding.scope.namespaceId,
    PRODIVIX_G4_MODEL_EVAL_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_OWNER_INSTANCE_ID:
      'g4.hosted-lifecycle.123.1',
  };
  const preparedPath = join(temporaryDirectory, 'prepared-input.json');
  await writeFile(preparedPath, canonicalJsonText({ prepared: true }), 'utf8');

  for (const role of ['prepare', 'cleanup']) {
    const outputPath = join(temporaryDirectory, `${role}-output.json`);
    const output = Object.freeze({ role, status: 'clean' });
    const observed = [];
    const result = await runG4HostedRetrievalRuntimeResourceLifecycleCommand({
      role,
      outputPath,
      ...(role === 'cleanup' ? { preparedSetPath: preparedPath } : {}),
      environment: {
        ...baseEnvironment,
        PRODIVIX_G4_MODEL_EVAL_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_ROLE: role,
      },
      execute: async (executable, argumentsList) => {
        observed.push(executable, ...argumentsList);
        await writeFile(outputPath, canonicalJsonText(output), 'utf8');
      },
      loadBinding: async ({ namespaceId }) => {
        assert.equal(namespaceId, binding.scope.namespaceId);
        return binding;
      },
      validateOutput: (value, signedBinding) =>
        value.role === role &&
        value.status === 'clean' &&
        signedBinding === binding,
    });
    assert.deepEqual(result.output, output);
    assert.equal(observed[0], process.execPath);
    assert.equal(
      observed[1],
      G4_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_CLI
    );
    assert.deepEqual(
      observed.slice(2),
      role === 'cleanup'
        ? ['cleanup', '--prepared-set', preparedPath, '--output', outputPath]
        : ['prepare', '--output', outputPath]
    );
  }
});

test('fails closed on a role mismatch or unsigned output projection', async () => {
  const outputPath = join(temporaryDirectory, 'recovery-output.json');
  const environment = {
    ...protectedEnvironment,
    PRODIVIX_G4_MODEL_EVAL_NAMESPACE: 'g4-evaluation-fixture-0123456789ab',
    PRODIVIX_G4_MODEL_EVAL_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_ROLE: 'cleanup',
    PRODIVIX_G4_MODEL_EVAL_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_OWNER_INSTANCE_ID:
      'g4.hosted-lifecycle.123.1',
  };
  await assert.rejects(
    runG4HostedRetrievalRuntimeResourceLifecycleCommand({
      role: 'recovery',
      outputPath,
      environment,
      execute: async () => undefined,
      loadBinding: async () => Object.freeze({}),
      validateOutput: () => true,
    }),
    /role authority is invalid/u
  );

  environment.PRODIVIX_G4_MODEL_EVAL_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_ROLE =
    'recovery';
  await assert.rejects(
    runG4HostedRetrievalRuntimeResourceLifecycleCommand({
      role: 'recovery',
      outputPath,
      environment,
      execute: async () => {
        await writeFile(
          outputPath,
          canonicalJsonText({ status: 'unknown' }),
          'utf8'
        );
      },
      loadBinding: async () => Object.freeze({ scope: Object.freeze({}) }),
      validateOutput: () => false,
    }),
    /failed its exact signed binding/u
  );
});

test('admits fresh authenticated role-bound sidecar health with role-specific backlog semantics', async () => {
  let now = Date.parse('2026-08-12T00:00:00.000Z');
  const baseEnvironment = {
    PRODIVIX_G4_MODEL_EVAL_NAMESPACE: 'g4-evaluation-fixture-0123456789ab',
    PRODIVIX_G4_MODEL_EVAL_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_OWNER_INSTANCE_ID:
      'g4.hosted-lifecycle.123.1',
  };
  const health = (role, unfinishedMutationCount, overdueMutationCount) => ({
    role,
    namespaceId: baseEnvironment.PRODIVIX_G4_MODEL_EVAL_NAMESPACE,
    lifecycleOwnerInstanceId:
      baseEnvironment.PRODIVIX_G4_MODEL_EVAL_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_OWNER_INSTANCE_ID,
    lifecycleOwnerImplementationDigest:
      AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_OWNER_IMPLEMENTATION_DIGEST,
    unfinishedMutationCount,
    overdueMutationCount,
    checkedAt: new Date(now).toISOString(),
    receiptDigest: `sha256-${'a'.repeat(64)}`,
  });
  const common = {
    timeoutMs: 1_000,
    clock: () => new Date(now),
    sleep: async (milliseconds) => {
      now += milliseconds;
    },
  };
  await assert.doesNotReject(
    waitForG4HostedRetrievalRuntimeResourceLifecycleSidecarReady({
      ...common,
      environment: {
        ...baseEnvironment,
        PRODIVIX_G4_MODEL_EVAL_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_ROLE:
          'prepare',
      },
      createClient: () => ({ readHealth: async () => health('prepare', 0, 0) }),
    })
  );

  now = Date.parse('2026-08-12T00:00:00.000Z');
  await assert.rejects(
    waitForG4HostedRetrievalRuntimeResourceLifecycleSidecarReady({
      ...common,
      environment: {
        ...baseEnvironment,
        PRODIVIX_G4_MODEL_EVAL_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_ROLE:
          'cleanup',
      },
      createClient: () => ({ readHealth: async () => health('cleanup', 1, 0) }),
    }),
    /did not become ready/u
  );

  now = Date.parse('2026-08-12T00:00:00.000Z');
  const recoveryHealth =
    await waitForG4HostedRetrievalRuntimeResourceLifecycleSidecarReady({
      ...common,
      environment: {
        ...baseEnvironment,
        PRODIVIX_G4_MODEL_EVAL_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_ROLE:
          'recovery',
      },
      createClient: () => ({
        readHealth: async () => health('recovery', 2, 1),
      }),
    });
  assert.equal(recoveryHealth.unfinishedMutationCount, 2);
  assert.equal(recoveryHealth.overdueMutationCount, 1);
});

test('routes the exact prepare cleanup and recovery command shapes', async () => {
  const baseEnvironment = Object.freeze({
    PRODIVIX_G4_MODEL_EVAL_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_OWNER_INSTANCE_ID:
      'g4.hosted-lifecycle.123.1',
  });
  const preparedSetPath = join(temporaryDirectory, 'prepared-command.json');
  const observed = [];
  for (const role of ['prepare', 'cleanup', 'recovery']) {
    const outputPath = join(temporaryDirectory, `${role}-command.json`);
    const argumentsList =
      role === 'cleanup'
        ? [role, '--prepared-set', preparedSetPath, '--output', outputPath]
        : [role, '--output', outputPath];
    await runG4HostedRetrievalRuntimeResourceLifecycleVerifierMain({
      argumentsList,
      environment: {
        ...baseEnvironment,
        PRODIVIX_G4_MODEL_EVAL_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_ROLE: role,
      },
      runCommand: async (input) => observed.push(input),
    });
  }
  assert.equal(observed.length, 3);
  assert.deepEqual(
    observed.map(({ role, outputPath, preparedSetPath: prepared }) => ({
      role,
      outputPath,
      preparedSetPath: prepared,
    })),
    [
      {
        role: 'prepare',
        outputPath: join(temporaryDirectory, 'prepare-command.json'),
        preparedSetPath: undefined,
      },
      {
        role: 'cleanup',
        outputPath: join(temporaryDirectory, 'cleanup-command.json'),
        preparedSetPath,
      },
      {
        role: 'recovery',
        outputPath: join(temporaryDirectory, 'recovery-command.json'),
        preparedSetPath: undefined,
      },
    ]
  );
  assert.ok(
    observed.every(({ validateOutput }) => typeof validateOutput === 'function')
  );
  await assert.rejects(
    runG4HostedRetrievalRuntimeResourceLifecycleVerifierMain({
      argumentsList: ['cleanup', '--output', 'x', '--prepared-set', 'y'],
      environment: baseEnvironment,
      runCommand: async () => undefined,
    }),
    /Usage:/u
  );
});

test('routes the authenticated readiness command without exposing its bearer token', async () => {
  const observed = [];
  const writes = [];
  const originalWrite = process.stdout.write;
  process.stdout.write = (value) => {
    writes.push(value);
    return true;
  };
  try {
    await runG4HostedRetrievalRuntimeResourceLifecycleVerifierMain({
      argumentsList: ['ready', '60000'],
      environment: { TOKEN: 'not-forwarded-as-output' },
      waitForReady: async (input) => {
        observed.push(input);
        return { receiptDigest: `sha256-${'b'.repeat(64)}` };
      },
    });
  } finally {
    process.stdout.write = originalWrite;
  }
  assert.equal(observed.length, 1);
  assert.equal(observed[0].timeoutMs, 60_000);
  assert.deepEqual(writes, [`sha256-${'b'.repeat(64)}\n`]);
});

test('CLI subprocess advertises and fail-closes an incomplete lifecycle command', () => {
  const result = spawnSync(
    process.execPath,
    [
      join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs'),
      join(
        process.cwd(),
        'scripts',
        'verify-g4-hosted-retrieval-runtime-resource-lifecycle.mjs'
      ),
      'prepare',
    ],
    { encoding: 'utf8', windowsHide: true }
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /prepare --output <absolute-file>/u);
});
