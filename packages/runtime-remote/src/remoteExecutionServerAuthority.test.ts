import { describe, expect, it } from 'vitest';
import {
  createRemoteExecutionServerAuthorityLease,
  readRemoteExecutionServerAuthority,
  readRemoteExecutionServerAuthorityLease,
  REMOTE_EXECUTION_SERVER_AUTHORITY_FORMAT,
} from './remoteExecutionServerAuthority';

const authority = Object.freeze({
  format: REMOTE_EXECUTION_SERVER_AUTHORITY_FORMAT,
  principal: Object.freeze({
    providerId: 'prodivix-product-session',
    principalId: 'user-1',
  }),
  permissions: Object.freeze(['workspace.owner']),
  workspaceId: 'workspace-1',
  snapshotId: 'snapshot-1',
  expiresAt: 120_000,
});

describe('remote execution server authority codec', () => {
  it('keeps only the exact principal projection and rejects session material', () => {
    expect(readRemoteExecutionServerAuthority(authority)).toEqual(authority);
    expect(
      readRemoteExecutionServerAuthority({
        ...authority,
        sessionId: 'session-must-not-cross',
      })
    ).toBeUndefined();
    expect(
      readRemoteExecutionServerAuthority({
        ...authority,
        permissions: ['workspace.write', 'workspace.owner'],
      })
    ).toBeUndefined();
    expect(
      readRemoteExecutionServerAuthority({
        ...authority,
        permissions: ['workspace.owner', 'workspace.owner'],
      })
    ).toBeUndefined();
    expect(
      readRemoteExecutionServerAuthority({
        ...authority,
        principal: {
          ...authority.principal,
          token: 'bearer-must-not-cross',
        },
      })
    ).toBeUndefined();
  });

  it('binds the projection to one worker attempt without copying a lease token', () => {
    const lease = createRemoteExecutionServerAuthorityLease({
      authority,
      executionId: 'execution-1',
      workerId: 'worker-1',
      workerAttempt: 2,
    });
    expect(readRemoteExecutionServerAuthorityLease(lease)).toEqual(lease);
    expect(lease).toMatchObject({
      executionId: 'execution-1',
      workerId: 'worker-1',
      workerAttempt: 2,
      principal: authority.principal,
      permissions: authority.permissions,
    });
    expect(JSON.stringify(lease)).not.toContain('leaseToken');
    expect(
      readRemoteExecutionServerAuthorityLease({ ...lease, workerAttempt: 0 })
    ).toBeUndefined();
  });
});
