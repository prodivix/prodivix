import {
  createBinaryAssetPngStructuralScanner,
  createBinaryAssetScannerChain,
  type BinaryAssetContentScanner,
} from '@prodivix/assets';
import { describe, expect, it, vi } from 'vitest';
import {
  adoptAgentGeneratedArtifactCandidate,
  createAgentGeneratedArtifactCandidate,
  createAgentProviderArtifactRef,
  createAgentUntrustedProvenanceClaim,
  createCallbackBoundAgentProviderArtifactResolver,
  digestAgentCanonicalValue,
  encodeAgentMediaFact,
  decodeAgentMediaFact,
} from '../index';
import { V2_PNG, createV2G2ScannerChain } from '../__tests__/agentV2Fixtures';

const createCandidate = () =>
  createAgentGeneratedArtifactCandidate({
    candidateId: 'candidate.catalog.hero-image',
    taskId: 'task.g4-v2.catalog',
    runId: 'run.g4-v2.catalog',
    generation: 1,
    producingInvocationId: 'invocation.g4-v2.catalog',
    capabilityQualificationDigest: digestAgentCanonicalValue(
      'qualification.generated-image'
    ),
    inputRepresentationDigests: Object.freeze([
      digestAgentCanonicalValue('catalog-screenshot-representation'),
    ]),
    promptPolicyDigest: digestAgentCanonicalValue('prompt-policy.g4-v2'),
    providerArtifactRef: createAgentProviderArtifactRef({
      providerArtifactId: 'artifact.provider.catalog-hero',
      providerConfigurationId: 'provider.openai.catalog',
      artifactIdentityDigest: digestAgentCanonicalValue(
        'provider-artifact.catalog-hero'
      ),
      expiresAt: '2026-08-01T12:00:00.000Z',
    }),
    declaredMediaType: 'image/png',
    declaredByteLength: V2_PNG.byteLength,
    providerSafetyReceiptRef: 'provider-safety.catalog-hero',
    provenanceClaims: Object.freeze([
      createAgentUntrustedProvenanceClaim({
        kind: 'license',
        claim: 'Provider claims that the output is original.',
        confidence: 'provider-claimed',
      }),
    ]),
  });

describe('G4 V2 generated artifact adoption', () => {
  it('uses callback-bound bytes and the G2 sanitizer/scanner before typed proposal', async () => {
    const scanner = createV2G2ScannerChain();
    const resolve = vi.fn(async () => ({
      contents: new Uint8Array(V2_PNG),
      mediaType: 'image/png',
    }));
    const result = await adoptAgentGeneratedArtifactCandidate({
      candidate: createCandidate(),
      resolver: createCallbackBoundAgentProviderArtifactResolver(resolve),
      assetDocumentId: 'asset.catalog.hero-generated',
      scanner,
      scannerPolicyDigest: digestAgentCanonicalValue(scanner.descriptor),
      maxArtifactBytes: 1_048_576,
      resolvedAt: '2026-08-01T02:00:00.000Z',
    });
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('proposed');
    if (result.status !== 'proposed') return;
    expect(result.proposal).toMatchObject({
      proposalKind: 'asset-create',
      requiredApproval: 'exact-human',
      commitAuthority: 'none-before-approval',
      scanAttestation: { verdict: 'clean' },
      provenance: { licenseDisposition: 'unknown' },
    });
    expect(result.proposal.provenance.sourceDigest).toMatch(/^sha256-/u);
    expect(result.proposal.provenance.sanitizedDigest).toBe(
      result.proposal.finalReference.digest
    );
    expect(JSON.stringify(result.proposal)).not.toMatch(
      /https?:|signed|authorization|contents/iu
    );
    expect('transaction' in result.proposal).toBe(false);
    expect(result.usage.amounts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ unit: 'generated-artifact' }),
        expect.objectContaining({ unit: 'generated-artifact-byte' }),
      ])
    );

    const decoded = decodeAgentMediaFact(
      encodeAgentMediaFact({
        factType: 'generated-asset-proposal',
        value: result.proposal,
      })
    );
    expect(decoded).toEqual({
      ok: true,
      value: {
        factType: 'generated-asset-proposal',
        value: result.proposal,
      },
    });
  });

  it('rejects quarantine, byte drift, unsupported active output, and direct Provider URL refs', async () => {
    const structural = createBinaryAssetPngStructuralScanner();
    const malware: BinaryAssetContentScanner = Object.freeze({
      descriptor: Object.freeze({
        id: 'test.g4-v2.malware-quarantine',
        version: '1',
        supportedMediaTypes: Object.freeze(['image/png']),
      }),
      async scan() {
        return Object.freeze({
          verdict: 'quarantined' as const,
          findingCodes: Object.freeze(['test-malware']),
        });
      },
    });
    const scanner = createBinaryAssetScannerChain({
      id: 'test.g4-v2.quarantine-chain',
      version: '1',
      supportedMediaTypes: ['image/png'],
      scanners: [structural, malware],
    });
    const quarantined = await adoptAgentGeneratedArtifactCandidate({
      candidate: createCandidate(),
      resolver: createCallbackBoundAgentProviderArtifactResolver(async () => ({
        contents: new Uint8Array(V2_PNG),
        mediaType: 'image/png',
      })),
      assetDocumentId: 'asset.catalog.quarantined',
      scanner,
      scannerPolicyDigest: digestAgentCanonicalValue(scanner.descriptor),
      maxArtifactBytes: 1_048_576,
      resolvedAt: '2026-08-01T02:00:00.000Z',
    });
    expect(quarantined).toMatchObject({
      status: 'blocked',
      issues: [expect.objectContaining({ code: 'AI-7011' })],
    });

    const clean = createV2G2ScannerChain();
    const drifted = await adoptAgentGeneratedArtifactCandidate({
      candidate: createCandidate(),
      resolver: createCallbackBoundAgentProviderArtifactResolver(async () => ({
        contents: new Uint8Array([1, 2, 3]),
        mediaType: 'image/png',
      })),
      assetDocumentId: 'asset.catalog.drifted',
      scanner: clean,
      scannerPolicyDigest: digestAgentCanonicalValue(clean.descriptor),
      maxArtifactBytes: 1_048_576,
      resolvedAt: '2026-08-01T02:00:00.000Z',
    });
    expect(drifted).toMatchObject({
      status: 'blocked',
      issues: [expect.objectContaining({ code: 'AI-6002' })],
    });

    const active = await adoptAgentGeneratedArtifactCandidate({
      candidate: createCandidate(),
      resolver: createCallbackBoundAgentProviderArtifactResolver(async () => ({
        contents: new TextEncoder().encode('<svg><script/></svg>'),
        mediaType: 'image/svg+xml',
      })),
      assetDocumentId: 'asset.catalog.active-svg',
      scanner: clean,
      scannerPolicyDigest: digestAgentCanonicalValue(clean.descriptor),
      maxArtifactBytes: 1_048_576,
      resolvedAt: '2026-08-01T02:00:00.000Z',
    });
    expect(active).toMatchObject({
      status: 'blocked',
      issues: expect.arrayContaining([
        expect.objectContaining({ code: 'AI-7011' }),
      ]),
    });

    expect(() =>
      createAgentProviderArtifactRef({
        providerArtifactId:
          'https://provider.example/output.png?signature=secret-value',
        providerConfigurationId: 'provider.test',
        artifactIdentityDigest: digestAgentCanonicalValue('artifact'),
        expiresAt: '2026-08-01T12:00:00.000Z',
      })
    ).toThrow(/opaque/iu);
  });
});
