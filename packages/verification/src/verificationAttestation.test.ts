import { utf8ToBytes } from '@noble/hashes/utils.js';
import { describe, expect, it, vi } from 'vitest';
import {
  createVerificationAttestationClaimSet,
  createVerificationAttestationClaimsDigest,
  createVerificationAttestationPresentationDigest,
  createVerificationAttestationProofDigest,
  createVerificationArtifactSetDigest,
  createVerificationEvidenceStatementDigest,
  normalizeVerificationEvidenceStatement,
  serializeVerificationEvidenceStatement,
  verificationTrustForOrigin,
  verifyVerificationEvidenceAttestation,
  type VerificationAttestationClaimSet,
  type VerificationAttestationExpectedClaims,
  type VerificationAttestationVerifierClaims,
  type VerificationEvidenceAttestationVerifier,
  type VerificationEvidenceStatement,
} from './verificationAttestation';

const sha = (character: string): string => `sha256-${character.repeat(64)}`;
const defaultProof = Uint8Array.from([1]);
const ciIdentity = (commitCharacter = 'a') =>
  Object.freeze({
    repository: 'github:prodivix/prodivix',
    ref: 'refs/heads/main',
    commit: `sha1-${commitCharacter.repeat(40)}`,
  });

const statement = (
  overrides: Partial<VerificationEvidenceStatement> = {}
): VerificationEvidenceStatement => ({
  evidenceId: 'evidence-1',
  candidateId: 'candidate-1',
  candidateDigest: sha('0'),
  evidenceCoreDigest: sha('1'),
  projectId: 'project-1',
  workspaceId: 'workspace-1',
  workspaceRevision: 42,
  partitionRevisionsDigest: sha('1'),
  executableSnapshotDigest: sha('2'),
  policyDigest: sha('3'),
  planDigest: sha('4'),
  cellId: 'cell-1',
  checkId: 'check-1',
  checkKind: 'e2e',
  targetId: 'target-react-vite',
  targetPolicyDigest: sha('f'),
  attemptId: 'attempt-1',
  producer: {
    origin: 'remote',
    producerId: 'producer-1',
    providerId: 'remote-provider',
    runId: 'run-1',
    jobId: 'job-1',
    workerId: 'worker-1',
    workerAttempt: 2,
    sandboxImageDigest: sha('5'),
  },
  execution: {
    surface: 'preview',
    frameworkTarget: 'react-vite',
    runtimeZone: 'browser',
    browserEngine: 'chromium',
    operatingSystemIdentity: 'linux-x64',
    viewport: { id: 'desktop', width: 1440, height: 900 },
    devicePixelRatio: 1,
    colorScheme: 'light',
    motion: 'full',
    locale: 'en-US',
    timezone: 'UTC',
    fontSetDigest: sha('d'),
    sandboxImageDigest: sha('5'),
  },
  toolchainDigest: sha('6'),
  normalizationDigest: sha('e'),
  controlDigest: sha('7'),
  inputDigest: sha('8'),
  resultDigest: sha('9'),
  sourceTraceDigest: sha('a'),
  createdAt: '2026-07-28T12:00:00.000Z',
  retention: 'change',
  artifacts: [
    {
      id: 'artifact-z',
      path: 'traces/artifact-z.json',
      kind: 'trace',
      digest: sha('b'),
      size: 20,
      mediaType: 'application/json',
    },
    {
      id: 'artifact-a',
      path: 'screenshots/artifact-a.png',
      kind: 'screenshot',
      digest: sha('c'),
      size: 10,
      mediaType: 'image/png',
    },
  ],
  ...overrides,
});

const expected = (
  overrides: Partial<VerificationAttestationExpectedClaims> = {}
): VerificationAttestationExpectedClaims => ({
  trust: 'remote-attested',
  issuer: 'https://attestor.example.test',
  audience: 'prodivix-verification',
  subject: 'remote-worker:worker-1',
  nonce: 'promotion-nonce-sensitive',
  policyGeneration: 3,
  verificationInstant: '2026-07-28T12:01:00.000Z',
  maximumLifetimeMs: 5 * 60_000,
  statement: statement(),
  ...overrides,
});

const verifierClaims = (
  expectation: VerificationAttestationExpectedClaims,
  overrides: Partial<VerificationAttestationVerifierClaims> = {},
  proof: Uint8Array = defaultProof
): VerificationAttestationVerifierClaims => {
  const claims = {
    ...createVerificationAttestationClaimSet({
      expected: expectation,
      issuedAt: '2026-07-28T12:00:30.000Z',
      notBefore: '2026-07-28T12:00:30.000Z',
      expiresAt: '2026-07-28T12:02:30.000Z',
    }),
    ...overrides,
  };
  return Object.freeze({
    ...claims,
    claimsDigest: createVerificationAttestationClaimsDigest(
      claims as VerificationAttestationClaimSet
    ),
    proofDigest: createVerificationAttestationProofDigest(proof),
    algorithm: 'Ed25519',
    keyId: 'remote-2026-07',
    verifierId: 'core.ed25519',
    verifierVersion: '1.0.0',
    verifiedAt: expectation.verificationInstant,
    ...overrides,
  }) as VerificationAttestationVerifierClaims;
};

const verifier = (
  expectation: VerificationAttestationExpectedClaims,
  overrides: Partial<VerificationAttestationVerifierClaims> = {},
  proof: Uint8Array = defaultProof
): VerificationEvidenceAttestationVerifier => ({
  async verify() {
    return {
      kind: 'verified',
      claims: verifierClaims(expectation, overrides, proof),
    };
  },
});

describe('Verification Evidence attestation', () => {
  it('canonically normalizes the detached statement and artifact set', () => {
    const forward = statement();
    const reversed = statement({ artifacts: [...forward.artifacts].reverse() });
    const normalized = normalizeVerificationEvidenceStatement(forward);
    expect(normalized.artifacts.map(({ id }) => id)).toEqual([
      'artifact-a',
      'artifact-z',
    ]);
    expect(createVerificationEvidenceStatementDigest(forward)).toBe(
      createVerificationEvidenceStatementDigest(reversed)
    );
    expect(createVerificationArtifactSetDigest(forward.artifacts)).toBe(
      createVerificationArtifactSetDigest(reversed.artifacts)
    );
    const changedPath = statement({
      artifacts: forward.artifacts.map((artifact, index) =>
        index === 0
          ? { ...artifact, path: 'traces/renamed-artifact.json' }
          : artifact
      ),
    });
    expect(createVerificationArtifactSetDigest(changedPath.artifacts)).not.toBe(
      createVerificationArtifactSetDigest(forward.artifacts)
    );
    expect(createVerificationEvidenceStatementDigest(changedPath)).not.toBe(
      createVerificationEvidenceStatementDigest(forward)
    );
    expect(
      createVerificationEvidenceStatementDigest(
        statement({ evidenceId: 'evidence-2' })
      )
    ).not.toBe(createVerificationEvidenceStatementDigest(forward));
    const serialized = serializeVerificationEvidenceStatement(forward);
    expect(serialized).not.toContain('attestationDigest');
    expect(serialized).not.toContain('manifestDigest');
    expect(serialized.indexOf('artifact-a')).toBeLessThan(
      serialized.indexOf('artifact-z')
    );
  });

  it('covers candidate and evidence-core digests in the signed claims digest', () => {
    const expectation = expected();
    const times = {
      issuedAt: '2026-07-28T12:00:30.000Z',
      notBefore: '2026-07-28T12:00:30.000Z',
      expiresAt: '2026-07-28T12:02:30.000Z',
    };
    const baseDigest = createVerificationAttestationClaimsDigest(
      createVerificationAttestationClaimSet({ expected: expectation, ...times })
    );
    for (const changedStatement of [
      statement({ candidateDigest: sha('e') }),
      statement({ evidenceCoreDigest: sha('e') }),
    ]) {
      expect(
        createVerificationAttestationClaimsDigest(
          createVerificationAttestationClaimSet({
            expected: expected({ statement: changedStatement }),
            ...times,
          })
        )
      ).not.toBe(baseDigest);
    }
  });

  it('double-checks adapter claims and returns only a secret-free projection', async () => {
    const expectation = expected();
    const proofSecret = 'callback-only-proof-secret';
    const proof = utf8ToBytes(proofSecret);
    const expectedProofDigest = createVerificationAttestationProofDigest(proof);
    const adapter = {
      verify: vi.fn(async (_expected, received: Uint8Array) => {
        received[0] = 9;
        return {
          kind: 'verified' as const,
          claims: verifierClaims(expectation, {}, proof),
        };
      }),
    };
    const result = await verifyVerificationEvidenceAttestation({
      expected: expectation,
      proof,
      verifier: adapter,
    });
    expect(result.status).toBe('verified');
    expect(proof).toEqual(utf8ToBytes(proofSecret));
    expect(adapter.verify).toHaveBeenCalledOnce();
    if (result.status !== 'verified') throw new Error('expected verified');
    expect(result.claims).toMatchObject({
      trust: 'remote-attested',
      statementDigest: createVerificationEvidenceStatementDigest(
        expectation.statement
      ),
      candidateDigest: expectation.statement.candidateDigest,
      evidenceCoreDigest: expectation.statement.evidenceCoreDigest,
      artifactSetDigest: createVerificationArtifactSetDigest(
        expectation.statement.artifacts
      ),
      algorithm: 'Ed25519',
      keyId: 'remote-2026-07',
      proofDigest: expectedProofDigest,
      attestationDigest: createVerificationAttestationPresentationDigest({
        algorithm: 'Ed25519',
        keyId: 'remote-2026-07',
        claimsDigest: result.claims.claimsDigest,
        proofDigest: expectedProofDigest,
      }),
    });
    expect(result.claims.nonceDigest).toMatch(/^sha256-[0-9a-f]{64}$/u);
    expect(result.claims.replayKey).toMatch(/^sha256-[0-9a-f]{64}$/u);
    expect(JSON.stringify(result)).not.toContain(expectation.nonce);
    expect(JSON.stringify(result)).not.toContain(proofSecret);
    expect(JSON.stringify(result)).not.toContain('signature');
  });

  it('pins the proof and presentation digest bytes independently of the verifier', () => {
    expect(
      createVerificationAttestationProofDigest(Uint8Array.from([1, 2, 3, 4]))
    ).toBe(
      'sha256-9f64a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a'
    );
    expect(
      createVerificationAttestationPresentationDigest({
        algorithm: 'Ed25519',
        keyId: 'remote-2026-07',
        claimsDigest: sha('a'),
        proofDigest: sha('b'),
      })
    ).toBe(
      'sha256-9039453f39b49358fe536469e7bd885cddce5c1694547974aeefab1ab8eaedab'
    );
  });

  it('rejects a proof digest that does not match the exact callback bytes', async () => {
    const expectation = expected();
    const claims = {
      ...verifierClaims(expectation),
      proofDigest: sha('f'),
    };
    const result = await verifyVerificationEvidenceAttestation({
      expected: expectation,
      proof: defaultProof,
      verifier: {
        async verify() {
          return { kind: 'verified', claims };
        },
      },
    });
    expect(result).toMatchObject({
      status: 'invalid',
      reasonCode: 'VER-5003',
    });
  });

  it('rejects a verifier that self-reports an attestation digest', async () => {
    const expectation = expected();
    const claims = {
      ...verifierClaims(expectation),
      attestationDigest: sha('d'),
    };
    const result = await verifyVerificationEvidenceAttestation({
      expected: expectation,
      proof: defaultProof,
      verifier: {
        async verify() {
          return {
            kind: 'verified',
            claims,
          } as unknown as Awaited<
            ReturnType<VerificationEvidenceAttestationVerifier['verify']>
          >;
        },
      },
    });
    expect(result).toMatchObject({
      status: 'invalid',
      reasonCode: 'VER-5003',
    });
  });

  it.each([
    ['trust', 'ci-attested'],
    ['issuer', 'https://other.example.test'],
    ['audience', 'other-audience'],
    ['subject', 'remote-worker:other'],
    ['nonce', 'different-nonce'],
    ['policyGeneration', 4],
    ['statementDigest', sha('e')],
    ['candidateDigest', sha('e')],
    ['evidenceCoreDigest', sha('e')],
    ['artifactSetDigest', sha('f')],
    ['workspaceRevision', 43],
    ['planDigest', sha('0')],
    ['cellId', 'cell-other'],
    ['checkKind', 'unit'],
    ['targetId', 'target-other'],
    ['targetPolicyDigest', sha('0')],
    ['attemptId', 'attempt-other'],
    ['executionDigest', sha('0')],
    ['toolchainDigest', sha('e')],
    ['normalizationDigest', sha('f')],
  ] as const)(
    'rejects a verifier decision whose %s claim drifted',
    async (field, value) => {
      const expectation = expected();
      const result = await verifyVerificationEvidenceAttestation({
        expected: expectation,
        proof: Uint8Array.from([1]),
        verifier: verifier(expectation, { [field]: value }),
      });
      expect(result).toEqual({
        status: 'invalid',
        reasonCode: 'VER-5003',
        message: 'Evidence attestation is invalid.',
      });
    }
  );

  it.each([
    {
      issuedAt: '2026-07-28T11:59:00.000Z',
      notBefore: '2026-07-28T11:59:00.000Z',
      expiresAt: '2026-07-28T12:01:00.000Z',
    },
    {
      issuedAt: '2026-07-28T12:01:30.000Z',
      notBefore: '2026-07-28T12:01:30.000Z',
      expiresAt: '2026-07-28T12:02:00.000Z',
    },
    {
      issuedAt: '2026-07-28T12:00:30.000Z',
      notBefore: '2026-07-28T12:01:30.000Z',
      expiresAt: '2026-07-28T12:02:00.000Z',
    },
    {
      issuedAt: '2026-07-28T11:50:00.000Z',
      notBefore: '2026-07-28T11:50:00.000Z',
      expiresAt: '2026-07-28T12:02:00.000Z',
    },
  ])('rejects expired, future, or over-lifetime claims', async (times) => {
    const expectation = expected();
    const result = await verifyVerificationEvidenceAttestation({
      expected: expectation,
      proof: Uint8Array.from([1]),
      verifier: verifier(expectation, times),
    });
    expect(result).toMatchObject({
      status: 'invalid',
      reasonCode: 'VER-5003',
    });
  });

  it('hard-cuts local and imported origins before invoking a verifier', async () => {
    expect(verificationTrustForOrigin('local')).toBe('local-unattested');
    expect(verificationTrustForOrigin('remote')).toBe('remote-attested');
    expect(verificationTrustForOrigin('ci')).toBe('ci-attested');
    expect(verificationTrustForOrigin('import')).toBe('imported-untrusted');
    for (const trust of ['local-unattested', 'imported-untrusted'] as const) {
      const adapter = { verify: vi.fn() };
      const result = await verifyVerificationEvidenceAttestation({
        expected: {
          ...expected(),
          trust,
        } as unknown as VerificationAttestationExpectedClaims,
        proof: Uint8Array.from([1]),
        verifier: adapter as unknown as VerificationEvidenceAttestationVerifier,
      });
      expect(result).toMatchObject({
        status: 'invalid',
        reasonCode: 'VER-5003',
      });
      expect(adapter.verify).not.toHaveBeenCalled();
    }
  });

  it('requires and persists exact structured CI repository identity', async () => {
    const ci = ciIdentity();
    const expectation = expected({
      trust: 'ci-attested',
      statement: statement({
        producer: {
          origin: 'ci',
          producerId: 'github-actions',
          providerId: 'github',
          runId: 'run-ci-1',
          jobId: 'job-ci-1',
          ci,
        },
        execution: {
          ...statement().execution,
          surface: 'ci',
        },
      }),
    });
    const adapter = {
      verify: vi.fn(async (presentation) => {
        expect(presentation.claims).toMatchObject({
          trust: 'ci-attested',
          ci,
          checkKind: 'e2e',
          targetId: 'target-react-vite',
        });
        return {
          kind: 'verified' as const,
          claims: verifierClaims(expectation),
        };
      }),
    };
    const result = await verifyVerificationEvidenceAttestation({
      expected: expectation,
      proof: Uint8Array.from([1]),
      verifier: adapter,
    });
    expect(result).toMatchObject({
      status: 'verified',
      claims: {
        trust: 'ci-attested',
        ci,
      },
    });
  });

  it('rejects missing, forged, or cross-origin CI identity', async () => {
    const remoteStatement = statement();
    const missing = await verifyVerificationEvidenceAttestation({
      expected: expected({
        trust: 'ci-attested',
        statement: remoteStatement,
      }),
      proof: Uint8Array.from([1]),
      verifier: verifier(
        expected({ trust: 'ci-attested', statement: remoteStatement })
      ),
    });
    expect(missing).toMatchObject({
      status: 'invalid',
      reasonCode: 'VER-5003',
    });

    const ci = ciIdentity();
    const ciExpectation = expected({
      trust: 'ci-attested',
      statement: statement({
        producer: {
          origin: 'ci',
          producerId: 'github-actions',
          providerId: 'github',
          runId: 'run-ci-1',
          jobId: 'job-ci-1',
          ci,
        },
      }),
    });
    const forged = await verifyVerificationEvidenceAttestation({
      expected: ciExpectation,
      proof: Uint8Array.from([1]),
      verifier: verifier(ciExpectation, { ci: ciIdentity('b') }),
    });
    expect(forged).toMatchObject({
      status: 'invalid',
      reasonCode: 'VER-5003',
    });

    const crossOrigin = expected({
      statement: statement({
        producer: {
          origin: 'ci',
          producerId: 'github-actions',
          providerId: 'github',
          runId: 'run-ci-1',
          jobId: 'job-ci-1',
          ci,
        },
      }),
    });
    const remote = await verifyVerificationEvidenceAttestation({
      expected: crossOrigin,
      proof: Uint8Array.from([1]),
      verifier: verifier(crossOrigin),
    });
    expect(remote).toMatchObject({
      status: 'invalid',
      reasonCode: 'VER-5003',
    });

    const smuggled = await verifyVerificationEvidenceAttestation({
      expected: expected(),
      proof: Uint8Array.from([1]),
      verifier: verifier(expected(), { ci }),
    });
    expect(smuggled).toMatchObject({
      status: 'invalid',
      reasonCode: 'VER-5003',
    });
  });

  it('rejects non-canonical CI commit hashes and non-CI statement smuggling', () => {
    expect(() =>
      normalizeVerificationEvidenceStatement(
        statement({
          producer: {
            origin: 'ci',
            producerId: 'github-actions',
            providerId: 'github',
            runId: 'run-ci-1',
            ci: {
              ...ciIdentity(),
              commit: 'A'.repeat(40),
            },
          },
        })
      )
    ).toThrow('producer statement is invalid');

    const accessorCi = {
      repository: 'github:prodivix/prodivix',
      ref: 'refs/heads/main',
    };
    let getterCalls = 0;
    Object.defineProperty(accessorCi, 'commit', {
      enumerable: true,
      get() {
        getterCalls += 1;
        throw new Error('must not execute');
      },
    });
    expect(() =>
      normalizeVerificationEvidenceStatement(
        statement({
          producer: {
            origin: 'ci',
            producerId: 'github-actions',
            providerId: 'github',
            runId: 'run-ci-1',
            ci: accessorCi as unknown as ReturnType<typeof ciIdentity>,
          },
        })
      )
    ).toThrow('producer statement is invalid');
    expect(getterCalls).toBe(0);

    expect(() =>
      normalizeVerificationEvidenceStatement(
        statement({
          producer: {
            ...statement().producer,
            origin: 'remote',
            ci: ciIdentity(),
          } as unknown as VerificationEvidenceStatement['producer'],
        })
      )
    ).toThrow('producer statement is invalid');
  });

  it('does not reflect proof bytes or verifier failures', async () => {
    const secret = 'oidc-assertion-secret';
    const result = await verifyVerificationEvidenceAttestation({
      expected: expected(),
      proof: utf8ToBytes(secret),
      verifier: {
        async verify() {
          throw new Error(secret);
        },
      },
    });
    expect(result).toEqual({
      status: 'invalid',
      reasonCode: 'VER-5003',
      message: 'Evidence attestation is invalid.',
    });
    expect(JSON.stringify(result)).not.toContain(secret);
  });

  it('rejects verifier output that carries undeclared credential material', async () => {
    const expectation = expected();
    const claims = {
      ...verifierClaims(expectation),
      rawToken: 'must-not-cross-the-port',
    };
    const result = await verifyVerificationEvidenceAttestation({
      expected: expectation,
      proof: Uint8Array.from([1]),
      verifier: {
        async verify() {
          return {
            kind: 'verified',
            claims,
          } as unknown as ReturnType<
            VerificationEvidenceAttestationVerifier['verify']
          > extends Promise<infer Decision>
            ? Decision
            : never;
        },
      },
    });
    expect(result).toMatchObject({
      status: 'invalid',
      reasonCode: 'VER-5003',
    });
  });

  it('rejects accessor-backed verifier claims without invoking the getter', async () => {
    const expectation = expected();
    const claims = { ...verifierClaims(expectation) };
    let getterCalls = 0;
    Object.defineProperty(claims, 'issuer', {
      enumerable: true,
      get() {
        getterCalls += 1;
        throw new Error('must not execute');
      },
    });
    const result = await verifyVerificationEvidenceAttestation({
      expected: expectation,
      proof: Uint8Array.from([1]),
      verifier: {
        async verify() {
          return {
            kind: 'verified',
            claims,
          } as unknown as Awaited<
            ReturnType<VerificationEvidenceAttestationVerifier['verify']>
          >;
        },
      },
    });
    expect(result).toMatchObject({
      status: 'invalid',
      reasonCode: 'VER-5003',
    });
    expect(getterCalls).toBe(0);
  });

  it('rejects verifier decisions with a custom prototype', async () => {
    const expectation = expected();
    const decision = Object.assign(Object.create({ inherited: true }), {
      kind: 'verified',
      claims: verifierClaims(expectation),
    });
    const result = await verifyVerificationEvidenceAttestation({
      expected: expectation,
      proof: Uint8Array.from([1]),
      verifier: {
        async verify() {
          return decision;
        },
      } as unknown as VerificationEvidenceAttestationVerifier,
    });
    expect(result).toMatchObject({
      status: 'invalid',
      reasonCode: 'VER-5003',
    });
  });

  it('rejects verifier claims with unsafe own keys', async () => {
    const expectation = expected();
    const claims = { ...verifierClaims(expectation) };
    Object.defineProperty(claims, '__proto__', {
      configurable: true,
      enumerable: true,
      value: 'must-not-cross-the-port',
    });
    const result = await verifyVerificationEvidenceAttestation({
      expected: expectation,
      proof: Uint8Array.from([1]),
      verifier: {
        async verify() {
          return {
            kind: 'verified',
            claims,
          } as unknown as Awaited<
            ReturnType<VerificationEvidenceAttestationVerifier['verify']>
          >;
        },
      },
    });
    expect(result).toMatchObject({
      status: 'invalid',
      reasonCode: 'VER-5003',
    });
  });

  it('rejects accessor-backed artifact arrays without invoking getters', () => {
    const artifacts: VerificationEvidenceStatement['artifacts'] = [];
    let getterCalls = 0;
    Object.defineProperty(artifacts, '0', {
      configurable: true,
      enumerable: true,
      get() {
        getterCalls += 1;
        throw new Error('must not execute');
      },
    });
    expect(() =>
      normalizeVerificationEvidenceStatement(statement({ artifacts }))
    ).toThrow('statement is invalid');
    expect(getterCalls).toBe(0);
  });
});
