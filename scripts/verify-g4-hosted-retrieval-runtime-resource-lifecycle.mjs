import { spawn } from 'node:child_process';
import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { isAgentControlIdentity } from '../packages/ai/src/index.ts';
import {
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_ENCRYPTION_PROFILE_DIGEST,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_KEY_ENVIRONMENT_NAME,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_KEY_ID,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_KEY_REF,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_KEY_REF_DIGEST,
} from '../packages/ai/src/providers/agentHostedRetrievalRuntimeResourceLifecycleSpool.ts';
import { canonicalJsonText } from '../packages/shared/src/canonical/index.ts';
import { parseStrictJsonDocument } from '../packages/plugin-contracts/src/parseStrictJsonDocument.ts';
import { loadProductionAgentEvaluationFullAttemptHostedRuntimeBinding } from '../apps/agent-evaluation-runner/src/productionAttemptOwnerAuthorityPorts.ts';
import { createEnvironmentAgentEvaluationHostedRetrievalRuntimeResourceLifecycleProviderClient } from '../apps/agent-evaluation-runner/src/productionHostedRetrievalRuntimeResourceLifecycleSidecar.ts';
import {
  isProductionAgentEvaluationHostedRetrievalRuntimeResourceCleanupArtifact,
  isProductionAgentEvaluationHostedRetrievalRuntimeResourcePreparedArtifact,
  isProductionAgentEvaluationHostedRetrievalRuntimeResourceRecoveryArtifact,
} from '../apps/agent-evaluation-runner/src/productionHostedRetrievalRuntimeResourceLifecycleArtifacts.ts';
import { createAgentEvaluationHostedRetrievalRuntimeResourceSetId } from '../apps/agent-evaluation-runner/src/productionHostedRetrievalRuntimeResourceLifecycleOwner.ts';
import { AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_OWNER_IMPLEMENTATION_DIGEST } from '../apps/agent-evaluation-runner/src/productionHostedRetrievalRuntimeResourceProvider.ts';
import { createAgentEvaluationHostedRetrievalRuntimeResourceLifecycleSpoolProfile } from '../apps/agent-evaluation-runner/src/runConfig.ts';

export const G4_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_ROLES =
  Object.freeze(['prepare', 'cleanup', 'recovery']);
export const G4_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_ROLE_ENVIRONMENT_NAME =
  'PRODIVIX_G4_MODEL_EVAL_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_ROLE';
export const G4_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_OWNER_ENVIRONMENT_NAME =
  'PRODIVIX_G4_MODEL_EVAL_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_OWNER_INSTANCE_ID';
export const G4_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_KEY_ENVIRONMENT_NAME =
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_KEY_ENVIRONMENT_NAME;
export const G4_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_CLI =
  'apps/agent-evaluation-runner/dist/productionHostedRetrievalRuntimeResourceLifecycleMain.js';

const MAXIMUM_ARTIFACT_FILE_COUNT = 4_096;
const MAXIMUM_ARTIFACT_FILE_BYTES = 16_777_216;
const MAXIMUM_ARTIFACT_TOTAL_BYTES = 67_108_864;
const AES_256_KEY_ENVIRONMENT_NAMES = Object.freeze([
  G4_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_KEY_ENVIRONMENT_NAME,
  'PRODIVIX_G4_MODEL_EVAL_RESULT_SPOOL_KEY_BASE64',
  'PRODIVIX_G4_MODEL_EVAL_CAPABILITY_PROBE_RESPONSE_SPOOL_KEY_BASE64',
  'PRODIVIX_G4_MODEL_EVAL_CAPABILITY_EFFECT_PROVIDER_JOURNAL_SPOOL_KEY_BASE64',
  'PRODIVIX_G4_MODEL_EVAL_NATIVE_PROVIDER_STATE_VAULT_KEY_BASE64',
]);
const PROTECTED_VALUE_ENVIRONMENT_NAMES = Object.freeze([
  ...AES_256_KEY_ENVIRONMENT_NAMES,
  'PRODIVIX_G4_MODEL_EVAL_OPENAI_API_KEY',
  'PRODIVIX_G4_MODEL_EVAL_ANTHROPIC_API_KEY',
  'PRODIVIX_G4_MODEL_EVAL_GEMINI_API_KEY',
  'PRODIVIX_G4_MODEL_EVAL_SERVICE_TOKEN',
  'PRODIVIX_G4_MODEL_EVAL_OWNER_AUTHORITY_SERVICE_TOKEN',
  'PRODIVIX_G4_MODEL_EVAL_ATTESTATION_PRIVATE_KEY',
  'PRODIVIX_G4_MODEL_EVAL_DATABASE_URL',
]);
const LIFECYCLE_RUNTIME_PROTECTED_VALUE_ENVIRONMENT_NAMES = Object.freeze([
  ...AES_256_KEY_ENVIRONMENT_NAMES,
  'PRODIVIX_G4_MODEL_EVAL_OPENAI_API_KEY',
  'PRODIVIX_G4_MODEL_EVAL_GEMINI_API_KEY',
  'PRODIVIX_G4_MODEL_EVAL_SERVICE_TOKEN',
  'PRODIVIX_G4_MODEL_EVAL_OWNER_AUTHORITY_SERVICE_TOKEN',
  'PRODIVIX_G4_MODEL_EVAL_DATABASE_URL',
]);
const CANARY_ENVIRONMENT_NAMES = Object.freeze([
  'PRODIVIX_G4_MODEL_EVAL_SECRET_CANARIES',
  'PRODIVIX_G4_MODEL_EVAL_PROTECTED_HOLDOUT_CANARIES',
]);

const fail = (message) => {
  throw new Error(message);
};

const readEnvironment = (environment, name) =>
  typeof environment === 'function' ? environment(name) : environment[name];

const canonicalAes256Key = (environment, name) => {
  const encoded = readEnvironment(environment, name) ?? '';
  const key = Buffer.from(encoded, 'base64');
  if (
    !/^[A-Za-z0-9+/]{43}=$/u.test(encoded) ||
    key.byteLength !== 32 ||
    key.toString('base64') !== encoded
  ) {
    key.fill(0);
    fail('A lifecycle encryption key is not canonical AES-256 material.');
  }
  return key;
};

export const assertG4HostedRetrievalRuntimeResourceLifecycleSpoolProfile =
  () => {
    const profile =
      createAgentEvaluationHostedRetrievalRuntimeResourceLifecycleSpoolProfile();
    if (
      profile.keyReference.keyEnvironmentName !==
        G4_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_KEY_ENVIRONMENT_NAME ||
      profile.keyReference.keyId !==
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_KEY_ID ||
      profile.keyReference.keyRef !==
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_KEY_REF ||
      profile.keyRefDigest !==
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_KEY_REF_DIGEST ||
      profile.encryptionProfileDigest !==
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_ENCRYPTION_PROFILE_DIGEST
    ) {
      fail(
        'The lifecycle spool environment is not bound to its tracked profile.'
      );
    }
    return profile;
  };

export const assertG4HostedRetrievalRuntimeResourceLifecycleSecretIsolation = (
  environment = process.env
) => {
  assertG4HostedRetrievalRuntimeResourceLifecycleSpoolProfile();
  const keys = AES_256_KEY_ENVIRONMENT_NAMES.map((name) =>
    canonicalAes256Key(environment, name)
  );
  try {
    for (let left = 0; left < keys.length; left += 1) {
      for (let right = left + 1; right < keys.length; right += 1) {
        if (keys[left].equals(keys[right])) {
          fail(
            'The lifecycle spool key must be physically independent from every result, probe, Provider-journal, and state-vault key.'
          );
        }
      }
    }
    return Object.freeze({
      lifecycleKeyBytes: keys[0].byteLength,
      comparedKeyCount: keys.length,
    });
  } finally {
    keys.forEach((key) => key.fill(0));
  }
};

const decodeCanaries = (environment, name) => {
  let values;
  try {
    values = JSON.parse(readEnvironment(environment, name) ?? '');
  } catch {
    fail('A lifecycle artifact canary set is not valid JSON.');
  }
  if (
    !Array.isArray(values) ||
    values.length < 1 ||
    values.length > 256 ||
    values.some(
      (value) =>
        typeof value !== 'string' ||
        !/^[A-Za-z0-9._:@%+=/-]{8,4096}$/u.test(value)
    ) ||
    new Set(values).size !== values.length
  ) {
    fail('A lifecycle artifact canary set is invalid.');
  }
  return values;
};

const protectedNamesForRole = (environment) => {
  const role = readEnvironment(
    environment,
    G4_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_ROLE_ENVIRONMENT_NAME
  );
  if (!G4_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_ROLES.includes(role)) {
    return PROTECTED_VALUE_ENVIRONMENT_NAMES;
  }
  return LIFECYCLE_RUNTIME_PROTECTED_VALUE_ENVIRONMENT_NAMES;
};

const protectedValues = (
  environment,
  { requireAll = true, requiredNames = protectedNamesForRole(environment) } = {}
) => {
  const values = [];
  for (const name of PROTECTED_VALUE_ENVIRONMENT_NAMES) {
    const value = readEnvironment(environment, name) ?? '';
    if (requireAll && requiredNames.includes(name) && value.length === 0) {
      fail('A protected lifecycle value is missing.');
    }
    if (value.length > 0) values.push(value);
  }
  for (const name of CANARY_ENVIRONMENT_NAMES) {
    values.push(...decodeCanaries(environment, name));
  }
  return Object.freeze([...new Set(values)]);
};

export const createG4HostedRetrievalRuntimeResourceLifecycleSecretVariants = (
  environment = process.env,
  options
) => {
  const variants = new Set();
  for (const value of protectedValues(environment, options)) {
    const bytes = Buffer.from(value, 'utf8');
    variants.add(value);
    variants.add(bytes.toString('base64'));
    variants.add(bytes.toString('base64url'));
    variants.add(bytes.toString('hex'));
    variants.add(encodeURIComponent(value));
    bytes.fill(0);
  }
  for (const name of AES_256_KEY_ENVIRONMENT_NAMES) {
    const value = readEnvironment(environment, name);
    if (!value) continue;
    const key = canonicalAes256Key(environment, name);
    try {
      variants.add(key.toString('base64url'));
      variants.add(key.toString('hex'));
    } finally {
      key.fill(0);
    }
  }
  return Object.freeze([...variants]);
};

export const registerG4HostedRetrievalRuntimeResourceLifecycleSecretMasks = ({
  environment = process.env,
  write = (value) => process.stdout.write(value),
} = {}) => {
  assertG4HostedRetrievalRuntimeResourceLifecycleSecretIsolation(environment);
  const variants =
    createG4HostedRetrievalRuntimeResourceLifecycleSecretVariants(environment);
  for (const variant of variants) write(`::add-mask::${variant}\n`);
  return variants.length;
};

const boundedConcretePath = async (input, expectedKind) => {
  if (typeof input !== 'string' || !isAbsolute(input)) {
    fail('A lifecycle artifact path is not absolute.');
  }
  const target = resolve(input);
  const metadata = await lstat(target);
  const concrete = await realpath(target);
  const exact =
    process.platform === 'win32'
      ? concrete.toLowerCase() === target.toLowerCase()
      : concrete === target;
  if (
    metadata.isSymbolicLink() ||
    !exact ||
    (expectedKind === 'file' && !metadata.isFile()) ||
    (expectedKind === 'directory' && !metadata.isDirectory())
  ) {
    fail('A lifecycle artifact path is not a bounded concrete target.');
  }
  return Object.freeze({ target, metadata });
};

const listArtifactFiles = async (roots) => {
  const files = [];
  const pending = [...roots];
  let totalBytes = 0;
  while (pending.length > 0) {
    const current = pending.pop();
    const metadata = await lstat(current);
    if (metadata.isSymbolicLink()) {
      fail('A lifecycle artifact scan encountered a symbolic link.');
    }
    if (metadata.isDirectory()) {
      const children = await readdir(current, { withFileTypes: true });
      for (const child of children) pending.push(join(current, child.name));
      continue;
    }
    if (!metadata.isFile() || metadata.size > MAXIMUM_ARTIFACT_FILE_BYTES) {
      fail('A lifecycle artifact scan encountered an unbounded file.');
    }
    totalBytes += metadata.size;
    files.push(current);
    if (
      files.length > MAXIMUM_ARTIFACT_FILE_COUNT ||
      totalBytes > MAXIMUM_ARTIFACT_TOTAL_BYTES
    ) {
      fail('The lifecycle artifact scan exceeded its bounded envelope.');
    }
  }
  return Object.freeze(files);
};

export const scanG4HostedRetrievalRuntimeResourceLifecycleArtifacts = async ({
  roots,
  environment = process.env,
}) => {
  if (!Array.isArray(roots) || roots.length < 1 || roots.length > 16) {
    fail('The lifecycle artifact scan roots are invalid.');
  }
  const concreteRoots = [];
  for (const root of roots) {
    if (typeof root !== 'string' || !isAbsolute(root)) {
      fail('A lifecycle artifact scan root is relative.');
    }
    const target = resolve(root);
    const metadata = await lstat(target);
    if (metadata.isSymbolicLink()) {
      fail('A lifecycle artifact scan root is symbolic.');
    }
    const concrete = await realpath(target);
    const exact =
      process.platform === 'win32'
        ? concrete.toLowerCase() === target.toLowerCase()
        : concrete === target;
    if (!exact) {
      fail('A lifecycle artifact scan root escaped its concrete target.');
    }
    concreteRoots.push(target);
  }
  const needles =
    createG4HostedRetrievalRuntimeResourceLifecycleSecretVariants(environment);
  const files = await listArtifactFiles(concreteRoots);
  for (const file of files) {
    const content = await readFile(file);
    try {
      if (needles.some((needle) => content.includes(Buffer.from(needle)))) {
        fail('A lifecycle artifact contains protected material or a canary.');
      }
    } finally {
      content.fill(0);
    }
  }
  return Object.freeze({ fileCount: files.length });
};

const runChild = (executable, argumentsList, environment) =>
  new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(executable, argumentsList, {
      cwd: process.cwd(),
      env: environment,
      stdio: 'inherit',
      windowsHide: true,
    });
    child.once('error', rejectPromise);
    child.once('exit', (code, signal) => {
      if (code === 0 && signal === null) resolvePromise();
      else
        rejectPromise(
          new Error('The hosted lifecycle runner command did not complete.')
        );
    });
  });

const readCanonicalOutput = async (outputPath) => {
  const { metadata } = await boundedConcretePath(outputPath, 'file');
  if (metadata.size < 2 || metadata.size > MAXIMUM_ARTIFACT_FILE_BYTES) {
    fail('The hosted lifecycle output is outside its bounded envelope.');
  }
  const source = await readFile(outputPath, 'utf8');
  const parsed = parseStrictJsonDocument(Buffer.from(source, 'utf8'), {
    documentKind: 'contribution',
    maxBytes: MAXIMUM_ARTIFACT_FILE_BYTES,
    maxDepth: 128,
    maxNodes: 1_000_000,
  });
  if (!parsed.ok || canonicalJsonText(parsed.value) !== source) {
    fail('The hosted lifecycle output is not canonical JSON.');
  }
  return parsed.value;
};

const wait = (milliseconds) =>
  new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));

export const waitForG4HostedRetrievalRuntimeResourceLifecycleSidecarReady =
  async ({
    timeoutMs,
    environment = process.env,
    createClient = createEnvironmentAgentEvaluationHostedRetrievalRuntimeResourceLifecycleProviderClient,
    clock = () => new Date(),
    sleep = wait,
  }) => {
    if (
      !Number.isSafeInteger(timeoutMs) ||
      timeoutMs < 1_000 ||
      timeoutMs > 120_000
    ) {
      fail('The hosted lifecycle readiness timeout is invalid.');
    }
    const role = readEnvironment(
      environment,
      G4_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_ROLE_ENVIRONMENT_NAME
    );
    const namespaceId = readEnvironment(
      environment,
      'PRODIVIX_G4_MODEL_EVAL_NAMESPACE'
    );
    const lifecycleOwnerInstanceId = readEnvironment(
      environment,
      G4_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_OWNER_ENVIRONMENT_NAME
    );
    if (
      !G4_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_ROLES.includes(role) ||
      !isAgentControlIdentity(namespaceId ?? '') ||
      !isAgentControlIdentity(lifecycleOwnerInstanceId ?? '')
    ) {
      fail('The hosted lifecycle readiness authority is invalid.');
    }
    const startedAt = clock().getTime();
    if (!Number.isFinite(startedAt)) {
      fail('The hosted lifecycle readiness clock is invalid.');
    }
    const deadline = startedAt + timeoutMs;
    const client = createClient({
      environment: (name) => readEnvironment(environment, name),
    });
    while (clock().getTime() <= deadline) {
      const requestedAt = clock().getTime();
      try {
        const health = await client.readHealth();
        const receivedAt = clock().getTime();
        const checkedAt = Date.parse(health.checkedAt);
        if (
          health.role === role &&
          health.namespaceId === namespaceId &&
          health.lifecycleOwnerInstanceId === lifecycleOwnerInstanceId &&
          health.lifecycleOwnerImplementationDigest ===
            AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_OWNER_IMPLEMENTATION_DIGEST &&
          Number.isFinite(checkedAt) &&
          checkedAt >= requestedAt - 1_000 &&
          checkedAt <= receivedAt + 1_000 &&
          receivedAt - checkedAt <= 15_000 &&
          (role === 'recovery' ||
            (health.unfinishedMutationCount === 0 &&
              health.overdueMutationCount === 0))
        ) {
          return health;
        }
      } catch {
        // The authenticated sidecar may still be composing its durable owner.
      }
      const remaining = deadline - clock().getTime();
      if (remaining <= 0) break;
      await sleep(Math.min(250, remaining));
    }
    fail('The authenticated hosted lifecycle sidecar did not become ready.');
  };

export const runG4HostedRetrievalRuntimeResourceLifecycleCommand = async ({
  role,
  outputPath,
  preparedSetPath,
  environment = process.env,
  execute = runChild,
  loadBinding = loadProductionAgentEvaluationFullAttemptHostedRuntimeBinding,
  validateOutput,
}) => {
  if (
    !G4_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_ROLES.includes(role) ||
    readEnvironment(
      environment,
      G4_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_ROLE_ENVIRONMENT_NAME
    ) !== role ||
    !isAgentControlIdentity(
      readEnvironment(
        environment,
        G4_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_OWNER_ENVIRONMENT_NAME
      ) ?? ''
    ) ||
    typeof validateOutput !== 'function'
  ) {
    fail('The hosted lifecycle role authority is invalid.');
  }
  const lifecycleSpoolKey = canonicalAes256Key(
    environment,
    G4_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_KEY_ENVIRONMENT_NAME
  );
  lifecycleSpoolKey.fill(0);
  assertG4HostedRetrievalRuntimeResourceLifecycleSpoolProfile();
  const namespaceId = readEnvironment(
    environment,
    'PRODIVIX_G4_MODEL_EVAL_NAMESPACE'
  );
  const binding = await loadBinding({
    environment: (name) => readEnvironment(environment, name),
    namespaceId,
  });
  if (!binding) fail('The hosted lifecycle signed input binding is invalid.');
  if (role === 'cleanup') {
    await boundedConcretePath(preparedSetPath, 'file');
  } else if (preparedSetPath !== undefined) {
    fail('A prepared set was supplied outside cleanup.');
  }
  if (typeof outputPath !== 'string' || !isAbsolute(outputPath)) {
    fail('The hosted lifecycle output path is invalid.');
  }
  const argumentsList = [
    G4_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_CLI,
    role,
    ...(role === 'cleanup' ? ['--prepared-set', resolve(preparedSetPath)] : []),
    '--output',
    resolve(outputPath),
  ];
  await execute(process.execPath, argumentsList, environment);
  const output = await readCanonicalOutput(resolve(outputPath));
  if (!(await validateOutput(output, binding))) {
    fail('The hosted lifecycle output failed its exact signed binding.');
  }
  return Object.freeze({ output, binding });
};

const lifecycleOutputGuards = Object.freeze({
  prepare:
    isProductionAgentEvaluationHostedRetrievalRuntimeResourcePreparedArtifact,
  cleanup:
    isProductionAgentEvaluationHostedRetrievalRuntimeResourceCleanupArtifact,
  recovery:
    isProductionAgentEvaluationHostedRetrievalRuntimeResourceRecoveryArtifact,
});

const validatesLifecycleOutput = (role, environment) => (value, binding) => {
  const guard = lifecycleOutputGuards[role];
  const ownerInstanceId = readEnvironment(
    environment,
    G4_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_OWNER_ENVIRONMENT_NAME
  );
  let runtimeResourceSetId;
  try {
    runtimeResourceSetId =
      createAgentEvaluationHostedRetrievalRuntimeResourceSetId(binding.scope);
  } catch {
    return false;
  }
  return (
    guard(value) &&
    value.role === role &&
    value.namespaceId === binding.scope.namespaceId &&
    value.repositoryCommit === binding.scope.repositoryCommit &&
    value.planDigest === binding.scope.planDigest &&
    value.frozenRunDigest === binding.scope.frozenRunDigest &&
    value.runConfigArtifactBindingDigest ===
      binding.scope.runConfigArtifactBindingDigest &&
    value.runtimeResourceSetId === runtimeResourceSetId &&
    value.lifecycleOwnerInstanceId === ownerInstanceId
  );
};

export const runG4HostedRetrievalRuntimeResourceLifecycleVerifierMain = async ({
  argumentsList = process.argv.slice(2),
  environment = process.env,
  runCommand = runG4HostedRetrievalRuntimeResourceLifecycleCommand,
  waitForReady = waitForG4HostedRetrievalRuntimeResourceLifecycleSidecarReady,
} = {}) => {
  const [command, ...commandArguments] = argumentsList;
  if (command === 'mask' && commandArguments.length === 0) {
    registerG4HostedRetrievalRuntimeResourceLifecycleSecretMasks({
      environment,
    });
    return;
  }
  if (command === 'scan' && commandArguments.length > 0) {
    await scanG4HostedRetrievalRuntimeResourceLifecycleArtifacts({
      roots: commandArguments,
      environment,
    });
    return;
  }
  if (
    command === 'ready' &&
    commandArguments.length === 1 &&
    /^[1-9][0-9]{3,5}$/u.test(commandArguments[0])
  ) {
    const health = await waitForReady({
      timeoutMs: Number(commandArguments[0]),
      environment,
    });
    process.stdout.write(`${health.receiptDigest}\n`);
    return;
  }
  if (
    (command === 'prepare' || command === 'recovery') &&
    commandArguments.length === 2 &&
    commandArguments[0] === '--output'
  ) {
    await runCommand({
      role: command,
      outputPath: commandArguments[1],
      environment,
      validateOutput: validatesLifecycleOutput(command, environment),
    });
    return;
  }
  if (
    command === 'cleanup' &&
    commandArguments.length === 4 &&
    commandArguments[0] === '--prepared-set' &&
    commandArguments[2] === '--output'
  ) {
    await runCommand({
      role: command,
      preparedSetPath: commandArguments[1],
      outputPath: commandArguments[3],
      environment,
      validateOutput: validatesLifecycleOutput(command, environment),
    });
    return;
  }
  fail(
    'Usage: verify-g4-hosted-retrieval-runtime-resource-lifecycle.mjs mask | scan <absolute-root>... | ready <timeout-ms> | prepare --output <absolute-file> | cleanup --prepared-set <absolute-file> --output <absolute-file> | recovery --output <absolute-file>'
  );
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await runG4HostedRetrievalRuntimeResourceLifecycleVerifierMain();
}
