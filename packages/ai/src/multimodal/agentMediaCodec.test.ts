import { describe, expect, it } from 'vitest';
import {
  createAgentGeneratedArtifactCandidate,
  createAgentProviderArtifactRef,
  createBinaryAssetSanitizeMediaTransformer,
  decodeAgentMediaFact,
  digestAgentCanonicalValue,
  encodeAgentMediaFact,
  executeAgentMediaTransformChain,
  serializeAgentMediaFact,
} from '../index';
import {
  V2_PNG,
  createV2CleanPngScanner,
  createV2RequiredProfiles,
  createV2ScreenshotSource,
} from '../__tests__/agentV2Fixtures';

const createTransformed = () =>
  executeAgentMediaTransformChain({
    taskMode: 'plan',
    profile: createV2RequiredProfiles().screenshot,
    source: createV2ScreenshotSource(),
    contents: new Uint8Array(V2_PNG),
    steps: [
      {
        operation: 'redact',
        parameters: { stripMetadata: true },
        transformer: createBinaryAssetSanitizeMediaTransformer(),
      },
    ],
    scanner: createV2CleanPngScanner(),
  });

describe('G4 V2 media fact wire codec', () => {
  it('round-trips source, transform, representation, and candidate current facts', async () => {
    const transformed = await createTransformed();
    expect(transformed.status).toBe('ready');
    if (transformed.status !== 'ready') return;
    const candidate = createAgentGeneratedArtifactCandidate({
      candidateId: 'candidate.codec',
      taskId: 'task.codec',
      runId: 'run.codec',
      generation: 1,
      producingInvocationId: 'invocation.codec',
      capabilityQualificationDigest: digestAgentCanonicalValue('qualification'),
      inputRepresentationDigests: [
        transformed.representation.representationDigest,
      ],
      promptPolicyDigest: digestAgentCanonicalValue('prompt-policy'),
      providerArtifactRef: createAgentProviderArtifactRef({
        providerArtifactId: 'artifact.codec',
        providerConfigurationId: 'provider.codec',
        artifactIdentityDigest: digestAgentCanonicalValue('artifact.codec'),
        expiresAt: '2026-08-01T12:00:00.000Z',
      }),
      declaredMediaType: 'image/png',
      declaredByteLength: V2_PNG.byteLength,
      provenanceClaims: [],
    });
    const facts = [
      {
        factType: 'media-source-descriptor' as const,
        value: createV2ScreenshotSource(),
      },
      {
        factType: 'media-transformation-receipt' as const,
        value: transformed.transformationReceipts[0]!,
      },
      {
        factType: 'media-representation' as const,
        value: transformed.representation,
      },
      {
        factType: 'generated-artifact-candidate' as const,
        value: candidate,
      },
    ];
    for (const fact of facts) {
      const wire = encodeAgentMediaFact(fact);
      expect(decodeAgentMediaFact(wire)).toEqual({ ok: true, value: fact });
      expect(serializeAgentMediaFact(fact)).toContain('"wireVersion":1');
    }
  });

  it('rejects future versions, unknown fields, unsafe keys, and digest drift', async () => {
    const fact = {
      factType: 'media-source-descriptor' as const,
      value: createV2ScreenshotSource(),
    };
    const wire = encodeAgentMediaFact(fact);
    expect(decodeAgentMediaFact({ ...wire, wireVersion: 2 })).toMatchObject({
      ok: false,
      issues: [expect.objectContaining({ path: '/wireVersion' })],
    });
    expect(
      decodeAgentMediaFact({ ...wire, unexpectedAuthority: 'apply' })
    ).toMatchObject({ ok: false });
    const unsafe = JSON.parse(
      '{"wireVersion":1,"factType":"media-source-descriptor","value":{"__proto__":{"apply":true}}}'
    ) as unknown;
    expect(decodeAgentMediaFact(unsafe)).toMatchObject({
      ok: false,
      issues: [
        expect.objectContaining({ message: expect.stringMatching(/unsafe/iu) }),
      ],
    });
    expect(
      decodeAgentMediaFact({
        ...wire,
        value: {
          ...wire.value,
          descriptorDigest: digestAgentCanonicalValue('drifted'),
        },
      })
    ).toMatchObject({ ok: false });

    const { descriptorDigest: _descriptorDigest, ...sourceBase } = fact.value;
    const invalidSourceBase = {
      ...sourceBase,
      kind: 'telepathic-image',
    };
    expect(
      decodeAgentMediaFact({
        ...wire,
        value: {
          ...invalidSourceBase,
          descriptorDigest: digestAgentCanonicalValue(invalidSourceBase),
        },
      })
    ).toMatchObject({ ok: false });
  });
});
