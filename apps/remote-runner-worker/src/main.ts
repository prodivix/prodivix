import { createFilesystemProcessSandbox } from './filesystemProcessSandbox';
import { createRemoteWorkerHttpControlPlaneClient } from './httpControlPlaneClient';
import {
  createRootlessPodmanSandbox,
  verifyRootlessPodmanEngine,
} from './rootlessPodmanSandbox';
import { createRemoteWorkerAgent } from './workerAgent';

const required = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new TypeError(`${name} is required.`);
  return value;
};
const integer = (name: string, fallback: number): number => {
  const value =
    process.env[name] === undefined ? fallback : Number(process.env[name]);
  if (!Number.isSafeInteger(value) || value < 1)
    throw new TypeError(`${name} must be a positive integer.`);
  return value;
};

const workerId = required('REMOTE_WORKER_ID');
const workerToken = required('REMOTE_WORKER_TOKEN');
const leaseDurationMs = integer('REMOTE_WORKER_LEASE_MS', 30_000);
const pollIntervalMs = integer('REMOTE_WORKER_POLL_MS', 1_000);
const sandboxMode = process.env.REMOTE_WORKER_SANDBOX_MODE ?? 'rootless-podman';
const installNetworkName = process.env.REMOTE_WORKER_INSTALL_NETWORK?.trim();
const installAllowedHosts =
  process.env.REMOTE_WORKER_INSTALL_ALLOWED_HOSTS?.split(',')
    .map((host) => host.trim())
    .filter(Boolean);
const sandbox =
  sandboxMode === 'rootless-podman'
    ? createRootlessPodmanSandbox({
        imageReference: required('REMOTE_WORKER_SANDBOX_IMAGE'),
        podmanCommand: process.env.REMOTE_WORKER_PODMAN_COMMAND,
        installNetworkPolicy: installNetworkName
          ? {
              mode: 'proxy-allowlist',
              networkName: installNetworkName,
              proxyUrl: required('REMOTE_WORKER_INSTALL_PROXY_URL'),
              proxyContainerName: required(
                'REMOTE_WORKER_INSTALL_PROXY_CONTAINER'
              ),
              allowedHosts: installAllowedHosts ?? [],
            }
          : { mode: 'none' },
        limits: {
          maximumCpuCores: integer('REMOTE_WORKER_MAX_CPU_CORES', 2),
          maximumMemoryMb: integer('REMOTE_WORKER_MAX_MEMORY_MB', 2_048),
          maximumDiskMb: integer('REMOTE_WORKER_MAX_DISK_MB', 4_096),
          maximumPids: integer('REMOTE_WORKER_MAX_PIDS', 256),
          maximumOpenFiles: integer('REMOTE_WORKER_MAX_OPEN_FILES', 1_024),
          temporaryDirectoryMb: integer('REMOTE_WORKER_TMP_MB', 256),
          maximumArtifactBytes: integer(
            'REMOTE_WORKER_MAX_ARTIFACT_BYTES',
            64 * 1024 * 1024
          ),
        },
      })
    : sandboxMode === 'filesystem-reference' &&
        process.env.NODE_ENV !== 'production'
      ? createFilesystemProcessSandbox({
          rootDirectory: process.env.REMOTE_WORKER_TEMP_ROOT,
        })
      : (() => {
          throw new TypeError(
            'Unsupported or unsafe REMOTE_WORKER_SANDBOX_MODE.'
          );
        })();
if (sandboxMode === 'rootless-podman')
  await verifyRootlessPodmanEngine(process.env.REMOTE_WORKER_PODMAN_COMMAND);
const agent = createRemoteWorkerAgent({
  workerId,
  providerId: required('REMOTE_WORKER_PROVIDER_ID'),
  client: createRemoteWorkerHttpControlPlaneClient({
    baseUrl: required('REMOTE_WORKER_CONTROL_PLANE_URL'),
    workerToken,
  }),
  sandbox,
  leaseDurationMs,
  heartbeatIntervalMs: integer(
    'REMOTE_WORKER_HEARTBEAT_MS',
    Math.floor(leaseDurationMs / 3)
  ),
  defaultTimeoutMs: integer('REMOTE_WORKER_DEFAULT_TIMEOUT_MS', 5 * 60_000),
  defaultMaximumOutputBytes: integer(
    'REMOTE_WORKER_DEFAULT_OUTPUT_BYTES',
    4 * 1024 * 1024
  ),
  artifactRetentionMs: integer(
    'REMOTE_WORKER_ARTIFACT_RETENTION_MS',
    60 * 60 * 1_000
  ),
  redactValues: [workerToken],
});

let stopping = false;
process.once('SIGINT', () => {
  stopping = true;
});
process.once('SIGTERM', () => {
  stopping = true;
});
while (!stopping) {
  let handled = false;
  try {
    handled = await agent.pollOnce();
  } catch {
    // The lease will expire and be reclaimed; do not expose credentials or replay terminal mutations.
  }
  if (!handled)
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
}
