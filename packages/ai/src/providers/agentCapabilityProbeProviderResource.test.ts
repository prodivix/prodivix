import { describe, expect, it } from 'vitest';
import { digestAgentCanonicalValue } from '../domain/agentCanonical';
import {
  createAgentCapabilityProbeProgram,
  digestAgentCapabilityProbeProfile,
} from './agentCapabilityProbeProgram';
import {
  createAgentCapabilityProbeProviderResourceAuthority,
  createAgentCapabilityProbeProviderResourceCleanupAuthorityRequest,
  createAgentCapabilityProbeProviderResourceCleanupReceipt,
  createAgentCapabilityProbeProviderResourceCleanupResponse,
  createAgentCapabilityProbeProviderResourceCleanupResourceResult,
  createAgentCapabilityProbeProviderResourceDeletionAuthorityReceipt,
  createAgentCapabilityProbeProviderResourceDeletionRequestProjection,
  isAgentCapabilityProbeProviderResourceAuthority,
  isAgentCapabilityProbeProviderResourceCleanupReceipt,
  isAgentCapabilityProbeProviderResourceCleanupAuthorityRequest,
  isAgentCapabilityProbeProviderResourceCleanupResponse,
  isAgentCapabilityProbeProviderResourceDeletionAuthorityReceipt,
  isAgentCapabilityProbeProviderResourceDeletionRequestProjection,
  matchAgentCapabilityProbeProviderResourceAuthority,
  matchAgentCapabilityProbeProviderResourceCleanupReceipt,
  matchAgentCapabilityProbeProviderResourceCleanupResponse,
  matchAgentCapabilityProbeProviderResourceDeletionAuthority,
} from './agentCapabilityProbeProviderResource';

const digest = (label: string) => digestAgentCanonicalValue({ label });
const program = createAgentCapabilityProbeProgram({
  capabilityProfileId: 'g4-provider-hosted-retrieval-core',
  capabilityProfileDigest: digestAgentCapabilityProbeProfile(
    'g4-provider-hosted-retrieval-core'
  ),
});
const deletionRequestProjection =
  createAgentCapabilityProbeProviderResourceDeletionRequestProjection({
    requestDigest: digest('provider-resource-request'),
    protocolFamily: 'openai-responses',
    providerResourceId: 'vs_prodivix_capability_probe_v1',
    auxiliaryResourceIds: Object.freeze([
      'file_prodivix_capability_probe_document',
      'file_prodivix_capability_probe_manifest',
    ]),
  });
const deletionAuthorityReceipt =
  createAgentCapabilityProbeProviderResourceDeletionAuthorityReceipt({
    resourceManifestDigest: digest('resource-manifest'),
    deletionRequestProjection,
    registeredAt: '2026-08-01T22:00:00.000Z',
    expiresAt: '2026-08-09T22:00:00.000Z',
  });
const input = Object.freeze({
  protocolFamily: 'openai-responses' as const,
  providerConfigurationId: 'provider.release.openai-responses',
  modelId: 'gpt-release',
  modelLineageDigest: digest('model-lineage'),
  adapterDigest: digest('adapter'),
  providerResourceId: 'vs_prodivix_capability_probe_v1',
  resourceManifestDigest: digest('resource-manifest'),
  contentUploadReceiptDigest: digest('content-upload-receipt'),
  deletionAuthorityReceiptDigest:
    deletionAuthorityReceipt.deletionAuthorityReceiptDigest,
  registeredAt: '2026-08-01T22:00:00.000Z',
  expiresAt: '2026-08-09T22:00:00.000Z',
});
const cleanupReceipt = createAgentCapabilityProbeProviderResourceCleanupReceipt(
  {
    deletionAuthorityReceipt,
    resourceResults: Object.freeze([
      createAgentCapabilityProbeProviderResourceCleanupResourceResult({
        resourceId: input.providerResourceId,
        resourceRole: 'primary',
        outcome: 'deleted',
        dispatchIntentDigest: digest('delete-primary-dispatch'),
        transportReceiptDigest: digest('delete-primary-transport'),
        completedAt: '2026-08-02T00:00:00.000Z',
      }),
      ...deletionRequestProjection.auxiliaryResourceIds.map(
        (resourceId, index) =>
          createAgentCapabilityProbeProviderResourceCleanupResourceResult({
            resourceId,
            resourceRole: 'auxiliary',
            outcome: index === 0 ? 'deleted' : 'already-absent',
            dispatchIntentDigest: digest(`delete-${resourceId}-dispatch`),
            transportReceiptDigest: digest(`delete-${resourceId}-transport`),
            completedAt: `2026-08-02T00:00:0${index + 1}.000Z`,
          })
      ),
    ]),
  }
);
const cleanupRequest =
  createAgentCapabilityProbeProviderResourceCleanupAuthorityRequest({
    repositoryCommit: '1234567890abcdef1234567890abcdef12345678',
    resourceRegistrationRequestDigest: cleanupReceipt.requestDigest,
    deletionAuthorityReceiptDigest:
      deletionAuthorityReceipt.deletionAuthorityReceiptDigest,
  });
const cleanupResponse =
  createAgentCapabilityProbeProviderResourceCleanupResponse({
    repositoryCommit: cleanupRequest.repositoryCommit,
    resourceRegistrationRequestDigest:
      cleanupRequest.resourceRegistrationRequestDigest,
    ownerImplementationDigest: digest('cleanup-owner-implementation'),
    cleanupReceipt,
  });

describe('capability probe provider resource authority', () => {
  it('binds a provider-resolvable resource to the repo-owned descriptor', () => {
    const authority = createAgentCapabilityProbeProviderResourceAuthority(
      program,
      input
    );
    expect(authority).toMatchObject({
      capabilityProfileId: 'g4-provider-hosted-retrieval-core',
      probeProgramDigest: program.programDigest,
      publicResourceDescriptorDigest:
        program.providerRequestIntent.publicProbeResource?.descriptorDigest,
      providerResourceKind: 'openai-vector-store-id',
    });
    expect(
      isAgentCapabilityProbeProviderResourceAuthority(authority, program)
    ).toBe(true);
    expect(
      matchAgentCapabilityProbeProviderResourceDeletionAuthority(
        deletionAuthorityReceipt,
        authority,
        program,
        { requestDigest: deletionRequestProjection.requestDigest }
      )
    ).toBe(true);
    expect(
      matchAgentCapabilityProbeProviderResourceAuthority(authority, program, {
        protocolFamily: input.protocolFamily,
        providerConfigurationId: input.providerConfigurationId,
        modelId: input.modelId,
        modelLineageDigest: input.modelLineageDigest,
        adapterDigest: input.adapterDigest,
        authorityDigest: authority.authorityDigest,
        observedAt: '2026-08-02T00:00:00.000Z',
      })
    ).toBe(true);
  });

  it('carries the complete bounded deletion preimage for cross-host cleanup', () => {
    expect(Object.keys(deletionRequestProjection)).toEqual([
      'format',
      'version',
      'requestDigest',
      'protocolFamily',
      'providerResourceKind',
      'providerResourceId',
      'auxiliaryResourceIds',
    ]);
    expect(deletionRequestProjection).toMatchObject({
      providerResourceKind: 'openai-vector-store-id',
      providerResourceId: input.providerResourceId,
      auxiliaryResourceIds: [
        'file_prodivix_capability_probe_document',
        'file_prodivix_capability_probe_manifest',
      ],
    });
    expect(Object.keys(deletionAuthorityReceipt)).toEqual([
      'format',
      'version',
      'requestDigest',
      'resourceManifestDigest',
      'providerResourceKind',
      'providerResourceId',
      'deletionRouteBinding',
      'deletionRequestProjection',
      'deletionRequestProjectionDigest',
      'registeredAt',
      'expiresAt',
      'deletionAuthorityReceiptDigest',
    ]);
    expect(
      isAgentCapabilityProbeProviderResourceDeletionRequestProjection(
        deletionRequestProjection
      )
    ).toBe(true);
    expect(
      isAgentCapabilityProbeProviderResourceDeletionAuthorityReceipt(
        deletionAuthorityReceipt
      )
    ).toBe(true);
    expect(Object.keys(cleanupReceipt)).toEqual([
      'format',
      'version',
      'requestDigest',
      'deletionAuthorityReceiptDigest',
      'deletionRequestProjectionDigest',
      'protocolFamily',
      'providerResourceKind',
      'providerResourceId',
      'auxiliaryResourceIds',
      'cleanupStageDigest',
      'cleanupDispatchAckDigest',
      'resourceResults',
      'resourceResultSetDigest',
      'completedAt',
      'cleanupReceiptDigest',
    ]);
    expect(
      isAgentCapabilityProbeProviderResourceCleanupReceipt(cleanupReceipt)
    ).toBe(true);
    expect(
      matchAgentCapabilityProbeProviderResourceCleanupReceipt(
        cleanupReceipt,
        deletionAuthorityReceipt,
        createAgentCapabilityProbeProviderResourceAuthority(program, input),
        program,
        {
          probeObservedAt: '2026-08-01T23:00:00.000Z',
          plannedAt: '2026-08-02T01:00:00.000Z',
        }
      )
    ).toBe(true);
    expect(Object.keys(cleanupRequest)).toEqual([
      'format',
      'version',
      'repositoryCommit',
      'resourceRegistrationRequestDigest',
      'deletionAuthorityReceiptDigest',
      'cleanupRequestDigest',
    ]);
    expect(Object.keys(cleanupResponse)).toEqual([
      'format',
      'version',
      'repositoryCommit',
      'resourceRegistrationRequestDigest',
      'cleanupRequestDigest',
      'deletionAuthorityReceiptDigest',
      'ownerImplementationDigest',
      'stageDigest',
      'ownerAdmissionDigest',
      'dispatchAckDigest',
      'resultIngressDigest',
      'resultIngressReceiptDigest',
      'cleanupReceipt',
      'responseDigest',
    ]);
    expect(
      isAgentCapabilityProbeProviderResourceCleanupAuthorityRequest(
        cleanupRequest
      )
    ).toBe(true);
    expect(
      isAgentCapabilityProbeProviderResourceCleanupResponse(cleanupResponse)
    ).toBe(true);
    expect(
      matchAgentCapabilityProbeProviderResourceCleanupResponse(
        cleanupResponse,
        cleanupRequest,
        deletionAuthorityReceipt,
        cleanupReceipt
      )
    ).toBe(true);
  });

  it('rejects dropped, duplicated, swapped, or post-plan cleanup evidence', () => {
    expect(() =>
      createAgentCapabilityProbeProviderResourceCleanupReceipt({
        deletionAuthorityReceipt,
        resourceResults: cleanupReceipt.resourceResults.slice(0, 2),
      })
    ).toThrow(/result set drifted/u);
    expect(() =>
      createAgentCapabilityProbeProviderResourceCleanupReceipt({
        deletionAuthorityReceipt,
        resourceResults: Object.freeze([
          cleanupReceipt.resourceResults[0]!,
          cleanupReceipt.resourceResults[0]!,
          cleanupReceipt.resourceResults[2]!,
        ]),
      })
    ).toThrow(/result set drifted/u);
    const { cleanupReceiptDigest: _cleanupDigest, ...cleanupBase } =
      cleanupReceipt;
    const swappedBase = Object.freeze({
      ...cleanupBase,
      cleanupDispatchAckDigest: digest('swapped-cleanup-ack'),
    });
    expect(
      isAgentCapabilityProbeProviderResourceCleanupReceipt(
        Object.freeze({
          ...swappedBase,
          cleanupReceiptDigest: digestAgentCanonicalValue(swappedBase),
        })
      )
    ).toBe(false);
    expect(
      matchAgentCapabilityProbeProviderResourceCleanupReceipt(
        cleanupReceipt,
        deletionAuthorityReceipt,
        createAgentCapabilityProbeProviderResourceAuthority(program, input),
        program,
        {
          probeObservedAt: '2026-08-01T23:00:00.000Z',
          plannedAt: '2026-08-01T23:59:59.999Z',
        }
      )
    ).toBe(false);
    const { responseDigest: _responseDigest, ...cleanupResponseBase } =
      cleanupResponse;
    const swappedResponseBase = Object.freeze({
      ...cleanupResponseBase,
      stageDigest: digest('swapped-cleanup-authority-stage'),
    });
    expect(
      isAgentCapabilityProbeProviderResourceCleanupResponse({
        ...swappedResponseBase,
        responseDigest: digestAgentCanonicalValue(swappedResponseBase),
      })
    ).toBe(false);
  });

  it('canonicalizes auxiliary handles and rejects drop, swap, duplicate, and credential-like values', () => {
    const reordered =
      createAgentCapabilityProbeProviderResourceDeletionRequestProjection({
        requestDigest: deletionRequestProjection.requestDigest,
        protocolFamily: 'openai-responses',
        providerResourceId: input.providerResourceId,
        auxiliaryResourceIds: Object.freeze([
          'file_prodivix_capability_probe_manifest',
          'file_prodivix_capability_probe_document',
        ]),
      });
    expect(reordered).toEqual(deletionRequestProjection);

    const droppedProjection =
      createAgentCapabilityProbeProviderResourceDeletionRequestProjection({
        requestDigest: deletionRequestProjection.requestDigest,
        protocolFamily: 'openai-responses',
        providerResourceId: input.providerResourceId,
        auxiliaryResourceIds: Object.freeze([
          'file_prodivix_capability_probe_document',
        ]),
      });
    const droppedReceipt =
      createAgentCapabilityProbeProviderResourceDeletionAuthorityReceipt({
        resourceManifestDigest: input.resourceManifestDigest,
        deletionRequestProjection: droppedProjection,
        registeredAt: input.registeredAt,
        expiresAt: input.expiresAt,
      });
    expect(
      matchAgentCapabilityProbeProviderResourceDeletionAuthority(
        droppedReceipt,
        createAgentCapabilityProbeProviderResourceAuthority(program, input),
        program,
        { requestDigest: deletionRequestProjection.requestDigest }
      )
    ).toBe(false);

    const { deletionAuthorityReceiptDigest: _digest, ...receiptBase } =
      deletionAuthorityReceipt;
    const swappedProjection = Object.freeze({
      ...deletionRequestProjection,
      providerResourceId: 'vs_swapped',
    });
    const swappedBase = Object.freeze({
      ...receiptBase,
      deletionRequestProjection: swappedProjection,
      deletionRequestProjectionDigest:
        digestAgentCanonicalValue(swappedProjection),
    });
    const recomputed = Object.freeze({
      ...swappedBase,
      deletionAuthorityReceiptDigest: digestAgentCanonicalValue(swappedBase),
    });
    expect(
      isAgentCapabilityProbeProviderResourceDeletionAuthorityReceipt(recomputed)
    ).toBe(false);

    expect(() =>
      createAgentCapabilityProbeProviderResourceDeletionRequestProjection({
        requestDigest: deletionRequestProjection.requestDigest,
        protocolFamily: 'openai-responses',
        providerResourceId: input.providerResourceId,
        auxiliaryResourceIds: Object.freeze([
          'file_duplicate',
          'file_duplicate',
        ]),
      })
    ).toThrow(/invalid/u);
    expect(() =>
      createAgentCapabilityProbeProviderResourceDeletionRequestProjection({
        requestDigest: deletionRequestProjection.requestDigest,
        protocolFamily: 'openai-responses',
        providerResourceId: input.providerResourceId,
        auxiliaryResourceIds: Object.freeze(['Bearer secret-resource-handle']),
      })
    ).toThrow(/invalid|unsafe/u);
  });

  it.each([
    ['providerResourceId', 'vs_swapped'],
    ['resourceManifestDigest', digest('swapped-manifest')],
    ['contentUploadReceiptDigest', digest('swapped-upload')],
    ['deletionAuthorityReceiptDigest', digest('swapped-delete')],
    ['modelLineageDigest', digest('swapped-lineage')],
  ] as const)(
    'rejects a fully recomputed %s swap at the frozen binding',
    (key, replacement) => {
      const frozen = createAgentCapabilityProbeProviderResourceAuthority(
        program,
        input
      );
      const authority = createAgentCapabilityProbeProviderResourceAuthority(
        program,
        {
          ...input,
          [key]: replacement,
        }
      );
      expect(
        matchAgentCapabilityProbeProviderResourceAuthority(authority, program, {
          protocolFamily: input.protocolFamily,
          providerConfigurationId: input.providerConfigurationId,
          modelId: input.modelId,
          modelLineageDigest: input.modelLineageDigest,
          adapterDigest: input.adapterDigest,
          authorityDigest: frozen.authorityDigest,
          observedAt: '2026-08-02T00:00:00.000Z',
        })
      ).toBe(false);
    }
  );

  it('rejects an expired or credential-like provider resource', () => {
    expect(
      matchAgentCapabilityProbeProviderResourceAuthority(
        createAgentCapabilityProbeProviderResourceAuthority(program, input),
        program,
        {
          protocolFamily: input.protocolFamily,
          providerConfigurationId: input.providerConfigurationId,
          modelId: input.modelId,
          modelLineageDigest: input.modelLineageDigest,
          adapterDigest: input.adapterDigest,
          authorityDigest: createAgentCapabilityProbeProviderResourceAuthority(
            program,
            input
          ).authorityDigest,
          observedAt: '2026-08-10T00:00:00.000Z',
        }
      )
    ).toBe(false);
    expect(() =>
      createAgentCapabilityProbeProviderResourceAuthority(program, {
        ...input,
        providerResourceId: 'Bearer secret-resource',
      })
    ).toThrow(/invalid|unsafe/u);
  });
});
