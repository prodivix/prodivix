import { describe, expect, it } from 'vitest';
import {
  computeVerificationArtifactContentDigest,
  createVerificationArtifactPolicy,
  evaluateVerificationArtifactPromotion,
  isVerificationArtifactJsonMediaType,
  readCanonicalVerificationArtifactPath,
  sniffVerificationArtifactMediaType,
  type VerificationArtifactPolicyCandidate,
  VERIFICATION_ARTIFACT_POLICY_DEFAULTS,
} from './verificationArtifactPolicy';
import {
  VERIFICATION_ARTIFACT_ENVELOPE_FORMAT,
  VERIFICATION_ARTIFACT_ENVELOPE_VERSION,
} from './verificationArtifactEnvelope';

const encoder = new TextEncoder();
const publicTargetPolicy = Object.freeze({
  authority: 'verification-policy' as const,
  policyDigest: `sha256-${'a'.repeat(64)}`,
  semanticTargetId: 'semantic:catalog.hero',
  capture: 'allowed' as const,
});

const artifact = (
  contents: Uint8Array,
  overrides: Partial<VerificationArtifactPolicyCandidate> = {}
): VerificationArtifactPolicyCandidate =>
  Object.freeze({
    id: 'artifact-1',
    path: 'reports/result.json',
    kind: 'security-report',
    digest: computeVerificationArtifactContentDigest(contents),
    size: contents.byteLength,
    mediaType: 'application/json',
    contents,
    ...overrides,
  });

const securityReportContents = (): Uint8Array =>
  encoder.encode(
    JSON.stringify({
      format: VERIFICATION_ARTIFACT_ENVELOPE_FORMAT,
      version: VERIFICATION_ARTIFACT_ENVELOPE_VERSION,
      kind: 'security-report',
      summary: {
        passed: 1,
        failed: 0,
        findings: [],
      },
    })
  );

const traceContents = (sourceTraceDigest: string): Uint8Array =>
  encoder.encode(
    JSON.stringify({
      format: VERIFICATION_ARTIFACT_ENVELOPE_FORMAT,
      version: VERIFICATION_ARTIFACT_ENVELOPE_VERSION,
      kind: 'trace',
      sourceTraceDigest,
      events: [],
    })
  );

const networkSummaryContents = (pathTemplate: string): Uint8Array =>
  encoder.encode(
    JSON.stringify({
      format: VERIFICATION_ARTIFACT_ENVELOPE_FORMAT,
      version: VERIFICATION_ARTIFACT_ENVELOPE_VERSION,
      kind: 'network-summary',
      operations: [
        {
          method: 'GET',
          host: 'api.example.invalid',
          pathTemplate,
          status: 200,
          timing: { startOffsetMs: 0, durationMs: 1 },
          operationId: 'catalog.read',
        },
      ],
    })
  );

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

const crc32 = (contents: Uint8Array): number => {
  let value = 0xffffffff;
  for (const byte of contents) {
    value = (crcTable[(value ^ byte) & 0xff] ?? 0) ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
};

const uint32 = (value: number): Uint8Array =>
  new Uint8Array([
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ]);

const concat = (parts: readonly Uint8Array[]): Uint8Array => {
  const output = new Uint8Array(
    parts.reduce((total, part) => total + part.byteLength, 0)
  );
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
};

const pngChunk = (type: string, data: Uint8Array): Uint8Array => {
  const typeBytes = encoder.encode(type);
  return concat([
    uint32(data.byteLength),
    typeBytes,
    data,
    uint32(crc32(concat([typeBytes, data]))),
  ]);
};

const png = (
  width = 1,
  height = 1,
  imageData = new Uint8Array([1])
): Uint8Array =>
  concat([
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk(
      'IHDR',
      concat([uint32(width), uint32(height), new Uint8Array([8, 6, 0, 0, 0])])
    ),
    pngChunk('IDAT', imageData),
    pngChunk('IEND', new Uint8Array()),
  ]);

const jpeg = (width = 1, height = 1): Uint8Array =>
  new Uint8Array([
    0xff,
    0xd8,
    0xff,
    0xc0,
    0x00,
    0x0b,
    0x08,
    (height >>> 8) & 0xff,
    height & 0xff,
    (width >>> 8) & 0xff,
    width & 0xff,
    0x01,
    0x01,
    0x11,
    0x00,
    0xff,
    0xda,
    0x00,
    0x08,
    0x01,
    0x01,
    0x00,
    0x00,
    0x3f,
    0x00,
    0x01,
    0xff,
    0xd9,
  ]);

describe('verification artifact policy', () => {
  it('uses the production promotion budget rather than the wider wire intake limit', () => {
    expect(VERIFICATION_ARTIFACT_POLICY_DEFAULTS).toMatchObject({
      maximumArtifacts: 128,
      maximumSingleArtifactBytes: 16 * 1024 * 1024,
      maximumTotalArtifactBytes: 64 * 1024 * 1024,
      maximumPathSegments: 16,
      maximumImagePixels: 40_000_000,
    });

    const contents = new Uint8Array(
      VERIFICATION_ARTIFACT_POLICY_DEFAULTS.maximumSingleArtifactBytes + 1
    );
    expect(
      evaluateVerificationArtifactPromotion({
        artifacts: [
          artifact(contents, {
            path: 'logs/oversized.txt',
            kind: 'build-log',
            mediaType: 'text/plain',
          }),
        ],
      })
    ).toMatchObject({
      status: 'rejected',
      diagnostics: [{ reason: 'budget-exceeded' }],
    });
  });

  it('accepts only canonical relative POSIX paths', () => {
    expect(
      readCanonicalVerificationArtifactPath('screenshots/catalog/desktop.png')
    ).toBe('screenshots/catalog/desktop.png');

    for (const path of [
      '/absolute/report.json',
      '../report.json',
      'reports/../report.json',
      'reports\\report.json',
      'C:/report.json',
      'reports//report.json',
      'reports/report.json/',
      'reports/con/file.txt',
      'reports/e\u0301.json',
    ]) {
      expect(() => readCanonicalVerificationArtifactPath(path)).toThrow(
        /canonical/u
      );
    }

    const contents = encoder.encode('{}');
    expect(
      evaluateVerificationArtifactPromotion({
        artifacts: [artifact(contents, { path: '../report.json' })],
      })
    ).toMatchObject({
      status: 'rejected',
      diagnostics: [{ reason: 'invalid-path' }],
    });
  });

  it('accepts bounded JSON and vendor +json media after exact identity checks', () => {
    const contents = securityReportContents();
    const decision = evaluateVerificationArtifactPromotion({
      artifacts: [
        artifact(contents, {
          mediaType: 'application/vnd.prodivix.security-report+json',
        }),
      ],
    });

    expect(decision).toMatchObject({
      status: 'accepted',
      totalBytes: contents.byteLength,
      artifacts: [
        {
          detectedMediaType: 'application/json',
          descriptor: {
            path: 'reports/result.json',
            kind: 'security-report',
          },
        },
      ],
    });
  });

  it('accepts a passive canonical vendor JSON build summary as a build log', () => {
    const contents = encoder.encode(
      JSON.stringify({
        format: 'prodivix.verification-build-summary.v1',
        subjectDigest: `sha256-${'b'.repeat(64)}`,
        outcome: 'passed',
        transformedModuleCount: 4,
        emittedFileCount: 2,
        outputs: ['dist/index.js'],
        sourceTrace: [],
      })
    );
    expect(
      evaluateVerificationArtifactPromotion({
        artifacts: [
          artifact(contents, {
            path: 'logs/build-summary.json',
            kind: 'build-log',
            mediaType:
              'application/vnd.prodivix.verification-build-summary+json',
          }),
        ],
      })
    ).toMatchObject({
      status: 'accepted',
      totalBytes: contents.byteLength,
      artifacts: [
        {
          detectedMediaType: 'application/json',
          descriptor: {
            path: 'logs/build-summary.json',
            kind: 'build-log',
          },
        },
      ],
    });
  });

  it('limits structured suffix JSON media to the application tree', () => {
    expect(
      isVerificationArtifactJsonMediaType(
        'application/vnd.prodivix.security-report+json'
      )
    ).toBe(true);
    expect(isVerificationArtifactJsonMediaType('text/report+json')).toBe(false);
  });

  it('rejects duplicate raw JSON members and negative zero before canonical decoding', () => {
    const valid = new TextDecoder().decode(securityReportContents());
    for (const text of [
      valid.replace(
        '{"format":',
        `{"format":"${VERIFICATION_ARTIFACT_ENVELOPE_FORMAT}","format":`
      ),
      valid.replace('"passed":1', '"passed":-0'),
    ]) {
      expect(
        evaluateVerificationArtifactPromotion({
          artifacts: [artifact(encoder.encode(text))],
        })
      ).toMatchObject({
        status: 'rejected',
        diagnostics: [{ reason: 'invalid-json' }],
      });
    }
  });

  it('binds trace envelopes to the candidate SourceTrace digest', () => {
    const expectedSourceTraceDigest = `sha256-${'1'.repeat(64)}`;
    const matching = traceContents(expectedSourceTraceDigest);
    expect(
      evaluateVerificationArtifactPromotion({
        artifacts: [
          artifact(matching, {
            path: 'traces/matching.json',
            kind: 'trace',
            sourceTraceDigest: expectedSourceTraceDigest,
          }),
        ],
      })
    ).toMatchObject({ status: 'accepted' });

    const contents = traceContents(`sha256-${'2'.repeat(64)}`);
    expect(
      evaluateVerificationArtifactPromotion({
        artifacts: [
          artifact(contents, {
            path: 'traces/result.json',
            kind: 'trace',
            sourceTraceDigest: expectedSourceTraceDigest,
          }),
        ],
      })
    ).toMatchObject({
      status: 'rejected',
      diagnostics: [{ reason: 'invalid-json' }],
    });
  });

  it('rejects duplicate canonical paths for the complete promotion', () => {
    const contents = securityReportContents();
    const decision = evaluateVerificationArtifactPromotion({
      artifacts: [
        artifact(contents),
        artifact(contents, {
          id: 'artifact-2',
          path: 'reports/result.json',
        }),
      ],
    });

    expect(decision).toEqual({
      status: 'rejected',
      diagnostics: [
        {
          code: 'VER-5005',
          reason: 'duplicate-path',
          artifactIndex: 1,
        },
      ],
    });
    expect('artifacts' in decision).toBe(false);
  });

  it('rejects duplicate artifact ids for the complete promotion', () => {
    const contents = securityReportContents();
    const decision = evaluateVerificationArtifactPromotion({
      artifacts: [
        artifact(contents),
        artifact(contents, {
          path: 'reports/second.json',
        }),
      ],
    });

    expect(decision).toEqual({
      status: 'rejected',
      diagnostics: [
        {
          code: 'VER-5005',
          reason: 'duplicate-id',
          artifactIndex: 1,
        },
      ],
    });
    expect('artifacts' in decision).toBe(false);
  });

  it('rejects size, digest, per-artifact, and aggregate budget drift', () => {
    const contents = securityReportContents();
    expect(
      evaluateVerificationArtifactPromotion({
        artifacts: [artifact(contents, { size: contents.byteLength + 1 })],
      })
    ).toMatchObject({
      status: 'rejected',
      diagnostics: [{ code: 'VER-5001', reason: 'size-mismatch' }],
    });
    expect(
      evaluateVerificationArtifactPromotion({
        artifacts: [artifact(contents, { digest: `sha256-${'0'.repeat(64)}` })],
      })
    ).toMatchObject({
      status: 'rejected',
      diagnostics: [{ code: 'VER-5001', reason: 'digest-mismatch' }],
    });
    expect(
      evaluateVerificationArtifactPromotion({
        policy: createVerificationArtifactPolicy({
          maximumSingleArtifactBytes: 2,
          maximumTotalArtifactBytes: 3,
          maximumJsonBytes: 2,
          maximumTextBytes: 2,
        }),
        artifacts: [
          artifact(contents),
          artifact(contents, {
            id: 'artifact-2',
            path: 'reports/second.json',
          }),
        ],
      })
    ).toMatchObject({
      status: 'rejected',
      diagnostics: [
        {
          artifactIndex: 0,
          code: 'VER-5005',
          reason: 'budget-exceeded',
        },
        {
          artifactIndex: 1,
          code: 'VER-5005',
          reason: 'budget-exceeded',
        },
      ],
    });
  });

  it('sniffs safe, active, archive, and unsupported signatures', () => {
    expect(sniffVerificationArtifactMediaType(png())).toBe('image/png');
    expect(sniffVerificationArtifactMediaType(jpeg())).toBe('image/jpeg');
    expect(
      sniffVerificationArtifactMediaType(encoder.encode('{"ok":true}'))
    ).toBe('application/json');
    expect(
      sniffVerificationArtifactMediaType(encoder.encode('<svg></svg>'))
    ).toBe('image/svg+xml');
    expect(
      sniffVerificationArtifactMediaType(
        new Uint8Array([0x50, 0x4b, 0x03, 0x04])
      )
    ).toBe('application/zip');
    expect(sniffVerificationArtifactMediaType(encoder.encode('%PDF-1.7'))).toBe(
      'application/pdf'
    );
  });

  it('accepts structurally bounded PNG and JPEG screenshots', () => {
    const pngContents = png(2, 3);
    const jpegContents = jpeg(4, 5);
    const decision = evaluateVerificationArtifactPromotion({
      targetPolicy: publicTargetPolicy,
      artifacts: [
        artifact(pngContents, {
          id: 'screenshot-png',
          path: 'screenshots/catalog.png',
          kind: 'screenshot',
          mediaType: 'image/png',
        }),
        artifact(jpegContents, {
          id: 'screenshot-jpeg',
          path: 'screenshots/catalog.jpg',
          kind: 'visual-diff',
          mediaType: 'image/jpeg',
        }),
      ],
    });

    expect(decision).toMatchObject({
      status: 'accepted',
      artifacts: [
        { imageMetadata: { width: 2, height: 3 } },
        { imageMetadata: { width: 4, height: 5 } },
      ],
    });
  });

  it('rejects malformed images and pixel budget overflow', () => {
    const oversized = png(3, 2);
    expect(
      evaluateVerificationArtifactPromotion({
        targetPolicy: publicTargetPolicy,
        policy: createVerificationArtifactPolicy({
          maximumImageWidth: 2,
          maximumImageHeight: 2,
          maximumImagePixels: 4,
        }),
        artifacts: [
          artifact(oversized, {
            path: 'screenshots/oversized.png',
            kind: 'screenshot',
            mediaType: 'image/png',
          }),
        ],
      })
    ).toMatchObject({
      status: 'rejected',
      diagnostics: [{ reason: 'invalid-image' }],
    });

    const malformed = png();
    malformed[malformed.byteLength - 1] ^= 1;
    expect(
      evaluateVerificationArtifactPromotion({
        targetPolicy: publicTargetPolicy,
        artifacts: [
          artifact(malformed, {
            path: 'screenshots/malformed.png',
            kind: 'screenshot',
            mediaType: 'image/png',
          }),
        ],
      })
    ).toMatchObject({
      status: 'rejected',
      diagnostics: [{ reason: 'invalid-image' }],
    });
  });

  it('fails closed on active content, archives, and unsupported binary media', () => {
    const fixtures = [
      {
        contents: encoder.encode('<!doctype html><script>run()</script>'),
        mediaType: 'text/plain',
        reason: 'active-content',
      },
      {
        contents: new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
        mediaType: 'text/plain',
        reason: 'archive',
      },
      {
        contents: encoder.encode('%PDF-1.7'),
        mediaType: 'text/plain',
        reason: 'unsupported-media',
      },
      {
        contents: encoder.encode('safe-looking text'),
        mediaType: 'text/html',
        reason: 'active-content',
      },
      {
        contents: encoder.encode('safe-looking text'),
        mediaType: 'application/zip',
        reason: 'archive',
      },
    ] as const;

    fixtures.forEach((fixture, index) => {
      expect(
        evaluateVerificationArtifactPromotion({
          artifacts: [
            artifact(fixture.contents, {
              id: `build-log-${index}`,
              path: `logs/build-${index}.txt`,
              kind: 'build-log',
              mediaType: fixture.mediaType,
            }),
          ],
        })
      ).toMatchObject({
        status: 'rejected',
        diagnostics: [{ reason: fixture.reason }],
      });
    });
  });

  it('rejects malformed, unsafe-key, deep, and invalid UTF-8 documents', () => {
    const unsafe = encoder.encode('{"__proto__":{"polluted":true}}');
    const deep = encoder.encode('{"a":{"b":{"c":true}}}');
    const malformed = encoder.encode('{"status":');
    for (const contents of [unsafe, malformed]) {
      expect(
        evaluateVerificationArtifactPromotion({
          artifacts: [artifact(contents)],
        })
      ).toMatchObject({
        status: 'rejected',
        diagnostics: [{ reason: 'invalid-json' }],
      });
    }
    expect(
      evaluateVerificationArtifactPromotion({
        policy: createVerificationArtifactPolicy({ maximumJsonDepth: 1 }),
        artifacts: [artifact(deep)],
      })
    ).toMatchObject({
      status: 'rejected',
      diagnostics: [{ reason: 'invalid-json' }],
    });

    const invalidUtf8 = new Uint8Array([0xc3, 0x28]);
    expect(
      evaluateVerificationArtifactPromotion({
        artifacts: [
          artifact(invalidUtf8, {
            path: 'logs/build.txt',
            kind: 'build-log',
            mediaType: 'text/plain',
          }),
        ],
      })
    ).toMatchObject({
      status: 'rejected',
      diagnostics: [{ reason: 'unsupported-media' }],
    });
  });

  it('reads candidate data descriptors without invoking hostile object code', () => {
    const contents = encoder.encode('{}');
    const base = { ...artifact(contents) };
    let getterCalls = 0;
    const accessor = { ...base };
    Object.defineProperty(accessor, 'path', {
      enumerable: true,
      get: () => {
        getterCalls += 1;
        throw new Error('must not execute');
      },
    });

    class CandidateRecord {}
    const classInstance = Object.assign(new CandidateRecord(), base);
    const symbolKey = { ...base, [Symbol('hidden')]: 'hidden' };
    const unsafeKey = { ...base };
    Object.defineProperty(unsafeKey, '__proto__', {
      enumerable: true,
      value: 'unsafe',
    });
    const hostileProxy = new Proxy(
      { ...base },
      {
        ownKeys: () => {
          throw new Error('must fail closed');
        },
      }
    );

    for (const candidate of [
      accessor,
      classInstance,
      symbolKey,
      unsafeKey,
      hostileProxy,
    ]) {
      expect(
        evaluateVerificationArtifactPromotion({ artifacts: [candidate] })
      ).toMatchObject({
        status: 'rejected',
        diagnostics: [{ reason: 'invalid-candidate' }],
      });
    }
    expect(getterCalls).toBe(0);
  });

  it('blocks canary, Authorization, Cookie, credential, env, and PII without echoing values', () => {
    const secrets = [
      'exact-canary-value',
      'Bearer top-secret-authorization',
      'session=top-secret-cookie',
      'ghp_123456789012345678901234567890',
      'environment-secret-value',
      'person@example.test',
    ];
    const payloads = [
      `canary=${secrets[0]}`,
      `Authorization: ${secrets[1]}`,
      `Cookie: ${secrets[2]}`,
      secrets[3] as string,
      `API_KEY=${secrets[4]}`,
      `owner=${secrets[5]}`,
    ];
    const decision = evaluateVerificationArtifactPromotion({
      secretCanaries: [secrets[0] as string],
      artifacts: payloads.map((payload, index) => {
        const contents = encoder.encode(payload);
        return artifact(contents, {
          id: `build-log-${index}`,
          path: `logs/build-${index}.txt`,
          kind: 'build-log',
          mediaType: 'text/plain',
        });
      }),
    });

    expect(decision.status).toBe('rejected');
    if (decision.status !== 'rejected') throw new Error('Expected rejection.');
    expect(new Set(decision.diagnostics.map(({ reason }) => reason))).toEqual(
      new Set([
        'secret-canary',
        'authorization',
        'cookie',
        'credential',
        'environment-secret',
        'pii',
      ])
    );
    const serialized = JSON.stringify(decision);
    for (const secret of secrets) {
      expect(serialized).not.toContain(secret);
    }
  });

  it('blocks bounded high-entropy credential-like tokens in text and JSON', () => {
    const credential = 'Qk9Qx7mK2vN8cR4sT6yW1zA5dF3hJ9uL0pE7gC2b';
    const text = encoder.encode(`opaque=${credential}`);
    const json = networkSummaryContents(`/opaque/${credential}`);
    const decision = evaluateVerificationArtifactPromotion({
      artifacts: [
        artifact(text, {
          id: 'entropy-log',
          path: 'logs/entropy.txt',
          kind: 'build-log',
          mediaType: 'text/plain',
        }),
        artifact(json, {
          id: 'entropy-json',
          path: 'reports/entropy.json',
          kind: 'network-summary',
        }),
      ],
    });

    expect(decision).toMatchObject({
      status: 'rejected',
      diagnostics: [
        { artifactIndex: 0, reason: 'credential' },
        { artifactIndex: 1, reason: 'credential' },
      ],
    });
    expect(JSON.stringify(decision)).not.toContain(credential);
  });

  it('does not entropy-scan compressed raster bytes as text', () => {
    const compressedLike = encoder.encode(
      'Qk9Qx7mK2vN8cR4sT6yW1zA5dF3hJ9uL0pE7gC2b'
    );
    const contents = png(1, 1, compressedLike);
    expect(
      evaluateVerificationArtifactPromotion({
        targetPolicy: {
          ...publicTargetPolicy,
          capture: 'masked',
        },
        artifacts: [
          artifact(contents, {
            id: 'compressed-raster',
            path: 'screenshots/compressed.png',
            kind: 'screenshot',
            mediaType: 'image/png',
          }),
        ],
      })
    ).toMatchObject({
      status: 'accepted',
      artifacts: [{ detectedMediaType: 'image/png' }],
    });
  });

  it('hard-cuts image capture for authoritative sensitive semantic targets', () => {
    const contents = png();
    expect(
      evaluateVerificationArtifactPromotion({
        artifacts: [
          artifact(contents, {
            id: 'unclassified-screenshot',
            path: 'screenshots/unclassified.png',
            kind: 'screenshot',
            mediaType: 'image/png',
          }),
        ],
      })
    ).toMatchObject({
      status: 'rejected',
      diagnostics: [{ reason: 'sensitive-target' }],
    });

    expect(
      evaluateVerificationArtifactPromotion({
        targetPolicy: publicTargetPolicy,
        artifacts: [
          artifact(contents, {
            id: 'public-screenshot',
            path: 'screenshots/catalog.png',
            kind: 'screenshot',
            mediaType: 'image/png',
          }),
        ],
      })
    ).toMatchObject({ status: 'accepted' });

    const decision = evaluateVerificationArtifactPromotion({
      targetPolicy: {
        authority: 'verification-policy',
        policyDigest: `sha256-${'a'.repeat(64)}`,
        semanticTargetId: 'semantic:auth.password-field',
        capture: 'forbidden-sensitive',
      },
      artifacts: [
        artifact(contents, {
          id: 'sensitive-screenshot',
          path: 'screenshots/password.png',
          kind: 'screenshot',
          mediaType: 'image/png',
        }),
      ],
    });

    expect(decision).toEqual({
      status: 'rejected',
      diagnostics: [
        {
          code: 'VER-5005',
          reason: 'sensitive-target',
          artifactIndex: 0,
        },
      ],
    });
  });

  it('allows explicit redaction markers and clones accepted bytes', () => {
    const contents = encoder.encode(
      'Authorization: [REDACTED]\nCookie: <redacted>\nAPI_KEY=***'
    );
    const decision = evaluateVerificationArtifactPromotion({
      artifacts: [
        artifact(contents, {
          path: 'logs/redacted.txt',
          kind: 'build-log',
          mediaType: 'text/plain',
        }),
      ],
    });

    expect(decision.status).toBe('accepted');
    if (decision.status !== 'accepted') throw new Error('Expected acceptance.');
    const acceptedBytes = new Uint8Array(
      decision.artifacts[0]?.contents ?? new Uint8Array()
    );
    expect(decision.artifacts[0]?.contents).not.toBe(contents);
    expect(decision.artifacts[0]?.contents).toEqual(contents);
    contents.fill(0);
    expect(decision.artifacts[0]?.contents).toEqual(acceptedBytes);
  });

  it('does not return partial accepted artifacts when any group member fails', () => {
    const valid = securityReportContents();
    const invalid = encoder.encode('<script>steal()</script>');
    const decision = evaluateVerificationArtifactPromotion({
      artifacts: [
        artifact(valid),
        artifact(invalid, {
          id: 'build-log',
          path: 'logs/build.txt',
          kind: 'build-log',
          mediaType: 'text/plain',
        }),
      ],
    });

    expect(decision).toMatchObject({
      status: 'rejected',
      diagnostics: [{ artifactIndex: 1, reason: 'active-content' }],
    });
    expect('artifacts' in decision).toBe(false);
  });
});
