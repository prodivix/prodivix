import { randomUUID } from 'node:crypto';
import { open } from 'node:fs/promises';
import { Pool } from 'pg';
import {
  createRemoteExecutionRegionalRecoveryOperator,
  createReplicatedRemoteExecutionTerminalBroker,
  decodeRemoteExecutionRegionalRecoveryOperatorRequest,
  encodeRemoteExecutionRegionalRecoveryOperatorEvidence,
} from '@prodivix/runtime-remote';
import {
  createPostgresRemoteExecutionRegionalRecoveryGrantReplayStore,
  createPostgresRemoteExecutionRegionalRecoveryProbe,
  createPostgresRemoteExecutionRegionalTrafficAuthority,
  createPostgresRemoteExecutionRepository,
  createPostgresRemoteExecutionTerminalStateStore,
} from '@prodivix/runtime-remote-postgres';
import { readRemoteRegionalRecoveryOperatorConfiguration } from './regionalRecoveryOperatorConfiguration';
import { createRemoteRegionalRecoverySignedProofPorts } from './regionalRecoverySignedProof';
import { createAwsKmsRemoteExecutionTerminalStateKeyManagementService } from './terminalStateAwsKms';
import { createAesGcmRemoteExecutionTerminalStateCipher } from './terminalStateCipher';
import {
  readRemoteTerminalStateCipherConfiguration,
  REMOTE_TERMINAL_STATE_KMS_PROVIDER_STATIC,
} from './terminalStateConfiguration';
import { createManagedRemoteExecutionTerminalStateCipher } from './terminalStateManagedCipher';

const maximumRequestBytes = 64 * 1_024;
const maximumProofBytes = 16 * 1_024;

export const readBoundedRemoteRegionalRecoveryFile = async (
  path: string,
  maximumBytes: number
): Promise<Uint8Array> => {
  const handle = await open(path, 'r');
  let buffer: Buffer | undefined;
  try {
    const before = await handle.stat();
    if (
      !before.isFile() ||
      !Number.isSafeInteger(before.size) ||
      before.size < 1 ||
      before.size > maximumBytes
    )
      throw new TypeError('Remote regional recovery input file is invalid.');
    buffer = Buffer.alloc(before.size);
    let offset = 0;
    while (offset < buffer.byteLength) {
      const { bytesRead } = await handle.read(
        buffer,
        offset,
        buffer.byteLength - offset,
        offset
      );
      if (bytesRead < 1)
        throw new TypeError('Remote regional recovery input file is invalid.');
      offset += bytesRead;
    }
    const extra = Buffer.alloc(1);
    try {
      const { bytesRead } = await handle.read(extra, 0, 1, offset);
      if (bytesRead !== 0)
        throw new TypeError('Remote regional recovery input file is invalid.');
    } finally {
      extra.fill(0);
    }
    const after = await handle.stat();
    if (
      after.size !== before.size ||
      after.mtimeMs !== before.mtimeMs ||
      after.ctimeMs !== before.ctimeMs
    )
      throw new TypeError('Remote regional recovery input file is invalid.');
    return buffer;
  } catch (error) {
    buffer?.fill(0);
    throw error;
  } finally {
    await handle.close();
  }
};

const createTargetTerminalCipher = (environment: NodeJS.ProcessEnv) => {
  const configuration = readRemoteTerminalStateCipherConfiguration(environment);
  return configuration.provider === REMOTE_TERMINAL_STATE_KMS_PROVIDER_STATIC
    ? createAesGcmRemoteExecutionTerminalStateCipher(configuration)
    : createManagedRemoteExecutionTerminalStateCipher({
        keyManagementService:
          createAwsKmsRemoteExecutionTerminalStateKeyManagementService({
            region: configuration.region,
            activeKeyId: configuration.activeKeyId,
            keyArns: configuration.keyArns,
            operationTimeoutMs: configuration.operationTimeoutMs,
          }),
        ...(configuration.legacyStaticKeys.length
          ? {
              legacyStaticCipher:
                createAesGcmRemoteExecutionTerminalStateCipher({
                  activeKeyId: configuration.legacyStaticKeys[0]!.keyId,
                  keys: configuration.legacyStaticKeys,
                }),
            }
          : {}),
      });
};

/**
 * Runs outside the HTTP service as a one-shot process. Schema migrations and
 * traffic-authority initialization are deliberately deployment-time steps,
 * never incident-time side effects of this job.
 */
export const runRemoteRegionalRecoveryOperatorJob = async (
  environment: NodeJS.ProcessEnv = process.env
): Promise<void> => {
  const configuration =
    readRemoteRegionalRecoveryOperatorConfiguration(environment);
  let requestBytes: Uint8Array | undefined;
  let authorizationGrant: Uint8Array | undefined;
  let infrastructureFenceProof: Uint8Array | undefined;
  let replicationAttestation: Uint8Array | undefined;
  let sourcePool: Pool | undefined;
  let targetPool: Pool | undefined;
  let trafficPool: Pool | undefined;
  try {
    requestBytes = await readBoundedRemoteRegionalRecoveryFile(
      configuration.requestPath,
      maximumRequestBytes
    );
    authorizationGrant = await readBoundedRemoteRegionalRecoveryFile(
      configuration.authorizationProofPath,
      maximumProofBytes
    );
    let requestText: string;
    try {
      requestText = new TextDecoder('utf-8', { fatal: true }).decode(
        requestBytes
      );
    } catch {
      throw new TypeError('Remote regional recovery request is invalid.');
    } finally {
      requestBytes.fill(0);
    }
    const request =
      decodeRemoteExecutionRegionalRecoveryOperatorRequest(requestText);
    if (request.mode === 'source-unavailable') {
      if (
        !configuration.infrastructureFenceProofPath ||
        !configuration.replicationAttestationPath
      )
        throw new TypeError(
          'Source-unavailable recovery requires fence and replication proof files.'
        );
      infrastructureFenceProof = await readBoundedRemoteRegionalRecoveryFile(
        configuration.infrastructureFenceProofPath,
        maximumProofBytes
      );
      replicationAttestation = await readBoundedRemoteRegionalRecoveryFile(
        configuration.replicationAttestationPath,
        maximumProofBytes
      );
    }
    const terminalStateConfiguration =
      readRemoteTerminalStateCipherConfiguration(environment);
    const terminalStateCipher = createTargetTerminalCipher(environment);
    sourcePool = new Pool({
      connectionString: configuration.sourceDatabaseUrl,
      max: configuration.maximumConcurrentCaptures + 2,
    });
    targetPool = new Pool({
      connectionString: configuration.targetDatabaseUrl,
      max: configuration.maximumConcurrentCaptures + 4,
    });
    trafficPool = new Pool({
      connectionString: configuration.trafficDatabaseUrl,
      max: 4,
    });
    const proofPorts = createRemoteRegionalRecoverySignedProofPorts({
      authorizationPublicKeys: configuration.authorizationPublicKeys,
      infrastructureFencePublicKeys:
        configuration.infrastructureFencePublicKeys,
      replicationAttestationPublicKeys:
        configuration.replicationAttestationPublicKeys,
      grantReplayStore:
        createPostgresRemoteExecutionRegionalRecoveryGrantReplayStore(
          trafficPool
        ),
    });
    const targetRepository =
      createPostgresRemoteExecutionRepository(targetPool);
    const targetTerminalBroker = createReplicatedRemoteExecutionTerminalBroker({
      stateStore: createPostgresRemoteExecutionTerminalStateStore(targetPool),
      stateCipher: terminalStateCipher,
      resolveExecution: (executionId) => targetRepository.get(executionId),
      createTerminalSessionId: () => `terminal-${randomUUID()}`,
      createAccessToken: () =>
        `terminal-access-${randomUUID()}-${randomUUID()}`,
      accessTokenTtlMs: 60_000,
      secretValues: [
        configuration.sourceDatabaseUrl,
        configuration.targetDatabaseUrl,
        configuration.trafficDatabaseUrl,
        ...terminalStateConfiguration.encodedSecretValues,
      ],
    });
    const operator = createRemoteExecutionRegionalRecoveryOperator({
      deploymentId: configuration.deploymentId,
      sourceRegionId: configuration.sourceRegionId,
      targetRegionId: configuration.targetRegionId,
      source: createPostgresRemoteExecutionRegionalRecoveryProbe(sourcePool, {
        regionId: configuration.sourceRegionId,
      }),
      target: createPostgresRemoteExecutionRegionalRecoveryProbe(targetPool, {
        regionId: configuration.targetRegionId,
      }),
      trafficAuthority:
        createPostgresRemoteExecutionRegionalTrafficAuthority(trafficPool),
      authorization: proofPorts.authorization,
      infrastructureFence: proofPorts.infrastructureFence,
      replicationAttestation: proofPorts.replicationAttestation,
      targetTerminalBroker,
      maximumWorkerAttempts: configuration.maximumWorkerAttempts,
      maximumBatchSize: configuration.maximumBatchSize,
      maximumConcurrentCaptures: configuration.maximumConcurrentCaptures,
      maximumRequestAgeMs: configuration.maximumRequestAgeMs,
      maximumProofLifetimeMs: configuration.maximumProofLifetimeMs,
      maximumAcceptedRpoMs: configuration.maximumAcceptedRpoMs,
    });
    const result = await operator.execute(request, {
      authorizationGrant,
      ...(infrastructureFenceProof ? { infrastructureFenceProof } : {}),
      ...(replicationAttestation ? { replicationAttestation } : {}),
    });
    if (result.kind === 'conflict')
      throw new TypeError('Remote regional recovery traffic epoch conflicted.');
    if (result.state.checkpointDigest !== result.evidence.evidenceDigest)
      throw new TypeError(
        'Remote regional recovery evidence is not durably anchored.'
      );
    const evidenceHandle = await open(configuration.evidencePath, 'wx', 0o600);
    try {
      await evidenceHandle.writeFile(
        encodeRemoteExecutionRegionalRecoveryOperatorEvidence(result.evidence),
        { encoding: 'utf8' }
      );
      await evidenceHandle.sync();
    } finally {
      await evidenceHandle.close();
    }
  } finally {
    requestBytes?.fill(0);
    authorizationGrant?.fill(0);
    infrastructureFenceProof?.fill(0);
    replicationAttestation?.fill(0);
    await Promise.allSettled([
      sourcePool?.end(),
      targetPool?.end(),
      trafficPool?.end(),
    ]);
  }
};
