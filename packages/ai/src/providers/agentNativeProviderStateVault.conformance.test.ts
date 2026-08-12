import { describe, expect, it, vi } from 'vitest';
import type { Instant } from '../domain/agent.types';
import { digestAgentCanonicalValue } from '../domain/agentCanonical';
import {
  createAgentNativeProviderStateVaultAuthority,
  createAgentNativeProviderStateVaultOpaqueRef,
  createAgentNativeProviderStateVaultResolveReceipt,
  createAgentNativeProviderStateVaultResolveRequest,
  createAgentNativeProviderStateVaultRetirementReceipt,
  createAgentNativeProviderStateVaultRetireRequest,
  createAgentNativeProviderStateVaultSealReceipt,
  createAgentNativeProviderStateVaultSealRequest,
  digestAgentNativeProviderStateReference,
  isAgentNativeProviderStateVaultResolveReceipt,
  isAgentNativeProviderStateVaultRetirementPolicyCompliant,
  isAgentNativeProviderStateVaultRetirementReceipt,
  isAgentNativeProviderStateVaultSealReceipt,
  reconcileAgentNativeProviderStateVaultRetirementReceipt,
  resolveAgentNativeProviderStateVaultState,
  retireAgentNativeProviderStateVaultState,
  type AgentNativeProviderStateVaultPort,
} from './agentNativeProviderStateVault';

const digest = (label: string) => digestAgentCanonicalValue({ label });
const observedAt = '2026-08-09T03:00:00.000Z' as Instant;
const expiresAt = '2026-08-09T03:02:05.000Z' as Instant;
const sealedAt = '2026-08-09T03:00:00.250Z' as Instant;
const requestedAt = '2026-08-09T03:00:01.000Z' as Instant;
const resolvedAt = '2026-08-09T03:00:01.250Z' as Instant;
const retireRequestedAt = '2026-08-09T03:00:02.000Z' as Instant;
const retiredAt = '2026-08-09T03:00:02.250Z' as Instant;
const callbackHandle = 'resp.state-vault.1';

const authority = createAgentNativeProviderStateVaultAuthority({
  authorityId: 'provider-state-vault.production.1',
  authorityImplementationDigest: digest('vault-implementation'),
  algorithm: 'aes-256-gcm',
  keyReferenceDigest: digest('vault-wrapping-key-reference'),
  keyVersion: 4,
  encryptionProfileDigest: digest('vault-encryption-profile'),
  retentionPolicyDigest: digest('vault-retention-policy'),
  deletionReceiptPolicyDigest: digest('vault-deletion-receipt-policy'),
});

const sealRequest = createAgentNativeProviderStateVaultSealRequest({
  authorityDigest: authority.authorityDigest,
  purpose: 'reasoning-continuation-state',
  attemptId: 'attempt.state-vault.1',
  protocolFamily: 'openai-responses',
  providerStateReferenceKind: 'response-id',
  providerStateReferenceDigest: digestAgentNativeProviderStateReference(
    'response-id',
    callbackHandle
  ),
  probeProgramDigest: digest('probe-program'),
  capabilityProfileDigest: digest('continuation-profile'),
  invocationId: 'invocation.state-vault.source.1',
  requestDigest: digest('provider-request'),
  responseDigest: digest('provider-response'),
  responseBodyDigest: digest('provider-response-body'),
  sealedResponseJsonDigest: digest('sealed-provider-response-json'),
  providerConfigurationId: 'provider.openai.production',
  modelLineageDigest: digest('model-lineage'),
  adapterDigest: digest('adapter'),
  taskId: 'task.state-vault.1',
  runId: 'run.state-vault.1',
  generation: 2,
  observedAt,
  expiresAt,
});

const stateKeyCreationReceiptDigest = digest('state-data-key-created');
const sealReceipt = createAgentNativeProviderStateVaultSealReceipt(
  sealRequest,
  {
    status: 'sealed',
    opaqueProviderStateRef: createAgentNativeProviderStateVaultOpaqueRef({
      authorityDigest: authority.authorityDigest,
      sealRequestDigest: sealRequest.sealRequestDigest,
      stateKeyCreationReceiptDigest,
    }),
    stateKeyCreationReceiptDigest,
    sealedAt,
  }
);

const resolveRequest = createAgentNativeProviderStateVaultResolveRequest({
  sealRequest,
  sealReceipt,
  consumerAttemptId: 'attempt.state-vault.1',
  consumerInvocationId: 'invocation.state-vault.consumer.1',
  consumerGeneration: 2,
  requestedAt,
});

const resolveReceipt = createAgentNativeProviderStateVaultResolveReceipt(
  resolveRequest,
  {
    status: 'resolved',
    callbackLocalProviderStateHandle: callbackHandle,
    resolvedAt,
  }
);

const retireRequest = createAgentNativeProviderStateVaultRetireRequest({
  sealRequest,
  sealReceipt,
  resolveRequest,
  resolveReceipt,
  disposition: 'consumed',
  requestedAt: retireRequestedAt,
});

const retirementReceipt = createAgentNativeProviderStateVaultRetirementReceipt(
  retireRequest,
  sealRequest,
  sealReceipt,
  {
    status: 'retired',
    stateKeyDestructionReceiptDigest: digest('state-data-key-destroyed'),
    opaqueRecordDeletionReceiptDigest: digest('vault-record-deleted'),
    retiredAt,
  }
);

describe('native Provider state vault conformance', () => {
  it('keeps Provider state callback-local and closes it with durable cryptographic expiry evidence', async () => {
    expect(authority).toMatchObject({
      storageMode: 'server-side-vault-record',
      cryptographicExpiryMode: 'per-state-data-key-destroy',
      reconciliationMode: 'request-digest-idempotent',
      maximumLifetimeMs: 125_000,
    });
    expect(
      isAgentNativeProviderStateVaultSealReceipt(sealReceipt, sealRequest)
    ).toBe(true);
    expect(
      isAgentNativeProviderStateVaultResolveReceipt(
        resolveReceipt,
        resolveRequest
      )
    ).toBe(true);
    expect(
      isAgentNativeProviderStateVaultRetirementReceipt(
        retirementReceipt,
        retireRequest,
        sealRequest,
        sealReceipt
      )
    ).toBe(true);

    const port: AgentNativeProviderStateVaultPort = Object.freeze({
      authority,
      seal: vi.fn(async () => {
        throw new Error('already sealed before cross-host resolve');
      }),
      resolve: vi.fn(async () => ({
        status: 'resolved' as const,
        callbackLocalProviderStateHandle: callbackHandle,
        resolvedAt,
      })),
      retire: vi.fn(async () => ({
        status: 'retired' as const,
        stateKeyDestructionReceiptDigest:
          retirementReceipt.stateKeyDestructionReceiptDigest,
        opaqueRecordDeletionReceiptDigest:
          retirementReceipt.opaqueRecordDeletionReceiptDigest,
        retiredAt,
      })),
      lookupRetirementReceipt: vi.fn(async () => retirementReceipt),
    });
    const resolved = await resolveAgentNativeProviderStateVaultState(
      port,
      resolveRequest
    );
    expect(resolved.callbackLocalProviderStateHandle).toBe(callbackHandle);
    expect(JSON.stringify(resolved.receipt)).not.toContain(callbackHandle);
    await expect(
      retireAgentNativeProviderStateVaultState(
        port,
        retireRequest,
        sealRequest,
        sealReceipt
      )
    ).resolves.toEqual(retirementReceipt);
    expect(
      JSON.stringify({ sealReceipt, resolveReceipt, retirementReceipt })
    ).not.toContain(callbackHandle);
    expect(JSON.stringify(sealReceipt)).not.toContain('ciphertext');
  });

  it('reconciles ACK loss to the original receipt and rejects replay drift', async () => {
    const ackLostPort: AgentNativeProviderStateVaultPort = Object.freeze({
      authority,
      seal: vi.fn(async () => {
        throw new Error('unused');
      }),
      resolve: vi.fn(async () => {
        throw new Error('unused');
      }),
      retire: vi.fn(async () => {
        throw new Error('ACK lost after durable retirement');
      }),
      lookupRetirementReceipt: vi.fn(async () => retirementReceipt),
    });
    await expect(
      retireAgentNativeProviderStateVaultState(
        ackLostPort,
        retireRequest,
        sealRequest,
        sealReceipt
      )
    ).resolves.toEqual(retirementReceipt);

    const swapped = Object.freeze({
      ...retirementReceipt,
      opaqueRecordDeletionReceiptDigest: digest('swapped-record-deletion'),
    });
    expect(() =>
      reconcileAgentNativeProviderStateVaultRetirementReceipt(
        retireRequest,
        sealRequest,
        sealReceipt,
        retirementReceipt,
        swapped
      )
    ).toThrow(/invalid|drift/u);
  });

  it('fails closed on attempt, invocation, generation, expiry, handle, and deletion swaps', () => {
    expect(() =>
      createAgentNativeProviderStateVaultResolveRequest({
        sealRequest,
        sealReceipt,
        consumerAttemptId: 'attempt.state-vault.swapped',
        consumerInvocationId: 'invocation.state-vault.consumer.1',
        consumerGeneration: 3,
        requestedAt,
      })
    ).toThrow(/resolve request is invalid/u);
    expect(() =>
      createAgentNativeProviderStateVaultResolveReceipt(resolveRequest, {
        status: 'resolved',
        callbackLocalProviderStateHandle: 'resp.state-vault.swapped',
        resolvedAt,
      })
    ).toThrow(/resolve result is invalid/u);
    expect(() =>
      createAgentNativeProviderStateVaultResolveRequest({
        sealRequest,
        sealReceipt,
        consumerAttemptId: 'attempt.state-vault.1',
        consumerInvocationId: 'invocation.state-vault.consumer.1',
        consumerGeneration: 2,
        requestedAt: expiresAt,
      })
    ).toThrow(/resolve request is invalid/u);
    expect(() =>
      createAgentNativeProviderStateVaultRetirementReceipt(
        retireRequest,
        sealRequest,
        sealReceipt,
        {
          status: 'retired',
          stateKeyDestructionReceiptDigest: digest('state-data-key-destroyed'),
          opaqueRecordDeletionReceiptDigest: digest('vault-record-deleted'),
          retiredAt: '2026-08-09T03:00:32.001Z' as Instant,
        }
      )
    ).toThrow(/retirement result is invalid/u);
  });

  it('requires expiry retirement when a sealed state was never resolved', () => {
    const expiredRequest = createAgentNativeProviderStateVaultRetireRequest({
      sealRequest,
      sealReceipt,
      resolveRequest: null,
      resolveReceipt: null,
      disposition: 'expired',
      requestedAt: expiresAt,
    });
    const receipt = createAgentNativeProviderStateVaultRetirementReceipt(
      expiredRequest,
      sealRequest,
      sealReceipt,
      {
        status: 'retired',
        stateKeyDestructionReceiptDigest: digest('expired-key-destroyed'),
        opaqueRecordDeletionReceiptDigest: digest('expired-record-deleted'),
        retiredAt: '2026-08-09T03:02:05.250Z' as Instant,
      }
    );
    expect(receipt.disposition).toBe('expired');
    expect(receipt.resolveReceiptDigest).toBeNull();
  });

  it('destroys overdue state after an outage and records a release-blocking violation tombstone', () => {
    const overdueRequest = createAgentNativeProviderStateVaultRetireRequest({
      sealRequest,
      sealReceipt,
      resolveRequest: null,
      resolveReceipt: null,
      disposition: 'overdue-expired',
      requestedAt: '2026-08-09T04:00:00.000Z' as Instant,
    });
    const receipt = createAgentNativeProviderStateVaultRetirementReceipt(
      overdueRequest,
      sealRequest,
      sealReceipt,
      {
        status: 'retired',
        stateKeyDestructionReceiptDigest: digest(
          'overdue-state-data-key-destroyed'
        ),
        opaqueRecordDeletionReceiptDigest: digest(
          'overdue-vault-record-deleted'
        ),
        retiredAt: '2026-08-09T04:00:00.250Z' as Instant,
      }
    );
    expect(receipt).toMatchObject({
      disposition: 'overdue-expired',
      retirementTimeliness: 'overdue-violation',
    });
    expect(receipt.policyViolationDigest).toMatch(/^sha256-/u);
    expect(
      isAgentNativeProviderStateVaultRetirementReceipt(
        receipt,
        overdueRequest,
        sealRequest,
        sealReceipt
      )
    ).toBe(true);
    expect(
      isAgentNativeProviderStateVaultRetirementPolicyCompliant(receipt)
    ).toBe(false);
    expect(
      isAgentNativeProviderStateVaultRetirementReceipt(
        {
          ...receipt,
          policyViolationDigest: digest('swapped-overdue-violation'),
        },
        overdueRequest,
        sealRequest,
        sealReceipt
      )
    ).toBe(false);
  });
});
