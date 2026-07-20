import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readRemoteRegionalRecoveryOperatorConfiguration } from './regionalRecoveryOperatorConfiguration';

const environment = () => ({
  REMOTE_DR_DEPLOYMENT_ID: 'deployment-1',
  REMOTE_DR_SOURCE_REGION_ID: 'region-a',
  REMOTE_DR_TARGET_REGION_ID: 'region-b',
  REMOTE_DR_SOURCE_DATABASE_URL: 'postgres://source/db',
  REMOTE_DR_TARGET_DATABASE_URL: 'postgres://target/db',
  REMOTE_DR_TRAFFIC_DATABASE_URL: 'postgres://traffic/db',
  REMOTE_DR_AUTHORIZATION_PUBLIC_KEYS_JSON: JSON.stringify({
    authorization: 'a'.repeat(64),
  }),
  REMOTE_DR_INFRASTRUCTURE_FENCE_PUBLIC_KEYS_JSON: JSON.stringify({
    fence: 'b'.repeat(64),
  }),
  REMOTE_DR_REPLICATION_ATTESTATION_PUBLIC_KEYS_JSON: JSON.stringify({
    replication: 'c'.repeat(64),
  }),
  REMOTE_DR_REQUEST_PATH: resolve('request.json'),
  REMOTE_DR_AUTHORIZATION_PROOF_PATH: resolve('authorization.proof'),
  REMOTE_DR_INFRASTRUCTURE_FENCE_PROOF_PATH: resolve('fence.proof'),
  REMOTE_DR_REPLICATION_ATTESTATION_PATH: resolve('replication.proof'),
  REMOTE_DR_EVIDENCE_PATH: resolve('evidence.json'),
});

describe('regional recovery operator configuration', () => {
  it('reads one explicit isolated job configuration with bounded defaults', () => {
    expect(
      readRemoteRegionalRecoveryOperatorConfiguration(environment())
    ).toMatchObject({
      deploymentId: 'deployment-1',
      sourceRegionId: 'region-a',
      targetRegionId: 'region-b',
      maximumWorkerAttempts: 3,
      maximumBatchSize: 128,
      maximumConcurrentCaptures: 8,
      maximumRequestAgeMs: 300_000,
      maximumProofLifetimeMs: 600_000,
      maximumAcceptedRpoMs: 60_000,
    });
  });

  it('rejects shared authorities, relative files and input/output aliasing', () => {
    expect(() =>
      readRemoteRegionalRecoveryOperatorConfiguration({
        ...environment(),
        REMOTE_DR_TARGET_DATABASE_URL: 'postgres://source/db',
      })
    ).toThrow('database authorities must be distinct');
    expect(() =>
      readRemoteRegionalRecoveryOperatorConfiguration({
        ...environment(),
        REMOTE_DR_TARGET_DATABASE_URL:
          'postgresql://different-user:password@SOURCE:5432/db?sslmode=require',
      })
    ).toThrow('database authorities must be distinct');
    expect(() =>
      readRemoteRegionalRecoveryOperatorConfiguration({
        ...environment(),
        REMOTE_DR_REQUEST_PATH: 'request.json',
      })
    ).toThrow('absolute path');
    const common = environment();
    expect(() =>
      readRemoteRegionalRecoveryOperatorConfiguration({
        ...common,
        REMOTE_DR_EVIDENCE_PATH: common.REMOTE_DR_REQUEST_PATH,
      })
    ).toThrow('paths must be distinct');
  });

  it('rejects partial identity and unbounded operating limits', () => {
    const missing = environment();
    delete (missing as Partial<typeof missing>).REMOTE_DR_DEPLOYMENT_ID;
    expect(() =>
      readRemoteRegionalRecoveryOperatorConfiguration(missing)
    ).toThrow('REMOTE_DR_DEPLOYMENT_ID is required');
    expect(() =>
      readRemoteRegionalRecoveryOperatorConfiguration({
        ...environment(),
        REMOTE_DR_MAXIMUM_BATCH_SIZE: '129',
      })
    ).toThrow('REMOTE_DR_MAXIMUM_BATCH_SIZE is invalid');
  });
});
