import { describe, expect, it } from 'vitest';
import {
  V3_LATER,
  V3_NOW,
  V3_REVISION,
  v3Digest,
} from '../__tests__/agentV3Fixtures';
import {
  admitAgentRetrievalIndex,
  canonicalizeAgentRetrievalUrl,
  createAgentExternalSourceResult,
  createAgentRetrievalIndexDeletionReceipt,
  createAgentRetrievalIndexIdentity,
  createAgentRetrievalQueryReceipt,
  isAgentRetrievalIndexDeletionComplete,
  mapAgentExternalSourceToSourceTrace,
  preflightAgentRetrievalFetch,
} from './agentRetrieval';

const createIndex = () =>
  createAgentRetrievalIndexIdentity({
    indexId: 'index.catalog.g4-v3',
    projectId: 'project.catalog',
    workspaceId: 'workspace.catalog',
    operatorId: 'operator.provider.test',
    providerConfigurationId: 'provider.test',
    corpusRevision: V3_REVISION,
    corpusManifestDigest: v3Digest('catalog-corpus'),
    chunkerId: 'chunker.markdown',
    chunkerVersion: '1.0.0',
    chunkerDigest: v3Digest('chunker'),
    embeddingModelDigest: v3Digest('embedding-model'),
    rankerDigest: v3Digest('ranker'),
    visibilityPolicyDigest: v3Digest('visibility'),
    storageRegion: 'us-east-1',
    retentionPolicyDigest: v3Digest('retention'),
    tenantIsolation: 'proven',
    createdAt: V3_NOW,
    expiresAt: '2026-08-02T06:00:00.000Z',
  });

describe('G4 V3 retrieval source and index boundary', () => {
  it('keeps citations external-untrusted until a source owner maps an exact snapshot', () => {
    const source = createAgentExternalSourceResult({
      sourceResultId: 'source.catalog.reference',
      canonicalUrl: 'https://example.com/catalog',
      retrievedAt: V3_LATER,
      contentDigest: v3Digest('external-catalog-body'),
      snapshotRef: 'snapshot.catalog.reference',
      providerCitationRef: 'citation.provider.1',
      availability: 'snapshotted',
    });
    expect(source).toMatchObject({
      authority: 'external-untrusted',
      instructionBoundary: 'data-only',
    });
    expect(source).not.toHaveProperty('sourceTraceRef');

    const receipt = createAgentRetrievalQueryReceipt({
      queryId: 'query.catalog.g4-v3',
      toolDescriptorDigest: v3Digest('tool-descriptor'),
      queryDigest: v3Digest('catalog query'),
      purpose: 'public-research',
      networkPolicyDigest: v3Digest('network-policy'),
      sources: [source],
      usageRef: 'usage.catalog-search',
      startedAt: V3_NOW,
      completedAt: V3_LATER,
    });
    expect(receipt.sourceResultDigests).toEqual([source.resultDigest]);

    const mapping = mapAgentExternalSourceToSourceTrace({
      source,
      sourceTraceRef: 'source-trace.catalog.reference',
      sourceOwnerId: 'owner.source-trace',
      verifiedSnapshotDigest: source.contentDigest,
      mappedAt: V3_LATER,
    });
    expect(mapping.verifiedSnapshotDigest).toBe(source.contentDigest);
    expect(() =>
      mapAgentExternalSourceToSourceTrace({
        source,
        sourceTraceRef: 'source-trace.catalog.forged',
        sourceOwnerId: 'owner.source-trace',
        verifiedSnapshotDigest: v3Digest('forged-body'),
        mappedAt: V3_LATER,
      })
    ).toThrow(/does not match/iu);
  });

  it('rejects unsafe URL forms and unavailable sources that invent content', () => {
    expect(() =>
      canonicalizeAgentRetrievalUrl('http://example.com/catalog')
    ).toThrow(/HTTPS/iu);
    expect(() =>
      canonicalizeAgentRetrievalUrl('https://user:secret@example.com/catalog')
    ).toThrow(/HTTPS/iu);
    expect(() => canonicalizeAgentRetrievalUrl('https://127.0.0.1/')).toThrow(
      /HTTPS/iu
    );
    expect(() =>
      createAgentExternalSourceResult({
        sourceResultId: 'source.unavailable',
        retrievedAt: V3_LATER,
        contentDigest: v3Digest('invented-content'),
        availability: 'unavailable',
      })
    ).toThrow(/inconsistent/iu);
  });

  it('revalidates URL, DNS, redirect, bytes, method, and disclosure per fetch attempt', () => {
    const policy = Object.freeze({
      id: 'network.public-research',
      effect: 'allow' as const,
      hosts: Object.freeze(['example.com']),
      methods: Object.freeze(['GET', 'HEAD'] as const),
      maxRequestBytes: 1024,
      maxResponseBytes: 32_768,
      redirectPolicy: 'same-origin' as const,
      tls: 'required' as const,
    });
    expect(
      preflightAgentRetrievalFetch({
        policy,
        url: 'https://example.com/catalog',
        method: 'GET',
        resolvedAddresses: ['93.184.216.34'],
        requestBytes: 0,
        expectedResponseBytes: 4096,
        disclosedSensitivity: 'public',
        maximumSensitivity: 'internal',
      })
    ).toMatchObject({ ok: true });
    expect(
      preflightAgentRetrievalFetch({
        policy,
        url: 'https://example.com/admin',
        method: 'POST',
        redirectFrom: 'https://other.example/catalog',
        resolvedAddresses: ['10.0.0.1'],
        requestBytes: 2048,
        expectedResponseBytes: 65_536,
        disclosedSensitivity: 'restricted',
        maximumSensitivity: 'internal',
      })
    ).toMatchObject({ ok: false });
  });

  it('binds Provider indexes to exact corpus identity and requires deletion evidence', () => {
    const index = createIndex();
    expect(
      admitAgentRetrievalIndex({
        identity: index,
        projectId: 'project.catalog',
        workspaceId: 'workspace.catalog',
        currentRevision: V3_REVISION,
        at: V3_LATER,
        taskMode: 'apply',
      })
    ).toEqual({ ok: true, indexDigest: index.indexDigest });

    const stale = admitAgentRetrievalIndex({
      identity: index,
      projectId: 'project.catalog',
      workspaceId: 'workspace.catalog',
      currentRevision: Object.freeze({ ...V3_REVISION, opSeq: 90 }),
      at: V3_LATER,
      taskMode: 'propose',
    });
    expect(stale).toMatchObject({
      ok: false,
      issues: [{ code: 'AI-7013', path: '/corpusRevision' }],
    });

    const poisoned = admitAgentRetrievalIndex({
      identity: Object.freeze({ ...index, tenantIsolation: 'unproven' }),
      projectId: 'project.other',
      workspaceId: 'workspace.other',
      currentRevision: V3_REVISION,
      at: V3_LATER,
      taskMode: 'explain',
    });
    expect(poisoned).toMatchObject({ ok: false });

    const deletion = createAgentRetrievalIndexDeletionReceipt({
      indexId: index.indexId,
      indexDigest: index.indexDigest,
      operatorId: index.operatorId,
      status: 'deleted',
      residualState: 'none',
      deletedAt: V3_LATER,
      providerReceiptDigest: v3Digest('provider-deletion'),
    });
    expect(isAgentRetrievalIndexDeletionComplete(deletion)).toBe(true);
    expect(
      isAgentRetrievalIndexDeletionComplete({
        ...deletion,
        residualState: 'detected',
      })
    ).toBe(false);
  });
});
