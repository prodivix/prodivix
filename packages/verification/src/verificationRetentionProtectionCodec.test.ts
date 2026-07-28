import { describe, expect, it } from 'vitest';
import {
  decodeVerificationEvidenceRetentionProtection,
  decodeVerificationEvidenceRetentionProtections,
  encodeVerificationEvidenceRetentionProtection,
  encodeVerificationEvidenceRetentionProtections,
} from './verificationRetentionProtectionCodec';
import {
  VERIFICATION_EVIDENCE_G3_MUTABLE_RETENTION_PROTECTION_KINDS,
  type VerificationEvidenceRetentionProtection,
} from './verificationRetention';

const protection = (
  overrides: Partial<VerificationEvidenceRetentionProtection> = {}
): VerificationEvidenceRetentionProtection => ({
  id: 'protection-1',
  evidenceId: 'evidence-1',
  kind: 'change',
  externalRef: 'change-42',
  active: true,
  version: 1,
  ...overrides,
});

describe('Verification Evidence retention protection codec', () => {
  it('roundtrips exact immutable active read projections', () => {
    const decoded = decodeVerificationEvidenceRetentionProtection(
      protection({ version: 0 })
    );
    expect(decoded).toMatchObject({ ok: true });
    if (!decoded.ok) throw new Error('Expected protection to decode.');
    expect(Object.isFrozen(decoded.value)).toBe(true);

    const encoded = encodeVerificationEvidenceRetentionProtection(
      decoded.value
    );
    expect(encoded).toEqual(protection({ version: 0 }));
    expect(decodeVerificationEvidenceRetentionProtection(encoded)).toEqual(
      decoded
    );

    const list = encodeVerificationEvidenceRetentionProtections([
      decoded.value,
    ]);
    expect(Object.isFrozen(list)).toBe(true);
    expect(decodeVerificationEvidenceRetentionProtections(list)).toEqual({
      ok: true,
      value: list,
    });
  });

  it('sorts by immutable id using Unicode code-point order', () => {
    const decoded = decodeVerificationEvidenceRetentionProtections([
      protection({
        id: 'protection_a',
        externalRef: 'change-underscore',
      }),
      protection({
        id: 'protection-a',
        externalRef: 'change-dash',
      }),
    ]);
    expect(decoded).toMatchObject({ ok: true });
    if (!decoded.ok) throw new Error('Expected protections to decode.');
    expect(decoded.value.map(({ id }) => id)).toEqual([
      'protection-a',
      'protection_a',
    ]);
  });

  it('exposes legal holds as read-only without adding them to G3 mutation kinds', () => {
    const decoded = decodeVerificationEvidenceRetentionProtection(
      protection({
        id: 'legal-hold-1',
        kind: 'legal-hold',
        externalRef: 'legal-case-1',
      })
    );
    expect(decoded).toMatchObject({
      ok: true,
      value: { kind: 'legal-hold', active: true },
    });
    expect(VERIFICATION_EVIDENCE_G3_MUTABLE_RETENTION_PROTECTION_KINDS).toEqual(
      ['change', 'release']
    );
    expect(
      VERIFICATION_EVIDENCE_G3_MUTABLE_RETENTION_PROTECTION_KINDS
    ).not.toContain('legal-hold');
  });

  it('rejects non-plain, inexact, unsafe, accessor-backed, and false-active records', () => {
    const accessor = protection() as Record<string, unknown>;
    let getterCalled = false;
    Object.defineProperty(accessor, 'externalRef', {
      enumerable: true,
      get() {
        getterCalled = true;
        return 'change-42';
      },
    });
    const unsafe = protection() as Record<string, unknown>;
    Object.defineProperty(unsafe, '__proto__', {
      enumerable: true,
      value: 'pollution',
    });

    for (const value of [
      null,
      { ...protection(), unknown: true },
      unsafe,
      accessor,
      protection({ active: false as true }),
    ]) {
      expect(decodeVerificationEvidenceRetentionProtection(value).ok).toBe(
        false
      );
    }
    expect(getterCalled).toBe(false);
  });

  it('rejects oversized, malformed Unicode, and invalid versions', () => {
    for (const value of [
      protection({ id: `p${'a'.repeat(256)}` }),
      protection({ evidenceId: 'evidence-\ud800' }),
      protection({ externalRef: `r${'a'.repeat(256)}` }),
      protection({ version: -1 }),
      protection({ version: Number.MAX_SAFE_INTEGER + 1 }),
    ]) {
      expect(decodeVerificationEvidenceRetentionProtection(value).ok).toBe(
        false
      );
    }
  });

  it('rejects URL, query, and credential-like raw external references without echoing them', () => {
    const references = [
      'https://release.example.test/42',
      'release-42?token=value',
      `ghp_${'a'.repeat(24)}`,
      'release:client-secret:value',
    ];
    for (const externalRef of references) {
      const decoded = decodeVerificationEvidenceRetentionProtection(
        protection({ externalRef })
      );
      expect(decoded).toMatchObject({
        ok: false,
        issues: [
          {
            code: 'VER-5002',
            path: '/externalRef',
          },
        ],
      });
      if (decoded.ok) throw new Error('Expected external ref to be rejected.');
      expect(JSON.stringify(decoded.issues)).not.toContain(externalRef);
    }
  });

  it('accepts sha256 and opaque references but rejects duplicate identities', () => {
    const digestRef = `sha256-${'a'.repeat(64)}`;
    expect(
      decodeVerificationEvidenceRetentionProtection(
        protection({ externalRef: digestRef })
      ).ok
    ).toBe(true);

    const duplicateId = decodeVerificationEvidenceRetentionProtections([
      protection(),
      protection({ externalRef: 'change-43' }),
    ]);
    expect(duplicateId).toMatchObject({
      ok: false,
      issues: [{ path: '/1/id' }],
    });

    const duplicateStorageIdentity =
      decodeVerificationEvidenceRetentionProtections([
        protection(),
        protection({ id: 'protection-2' }),
      ]);
    expect(duplicateStorageIdentity).toMatchObject({
      ok: false,
      issues: [{ path: '/1' }],
    });
  });

  it('rejects sparse or custom-field arrays and encode fails closed', () => {
    const sparse = new Array<VerificationEvidenceRetentionProtection>(2);
    sparse[1] = protection();
    const custom = [
      protection(),
    ] as Array<VerificationEvidenceRetentionProtection> &
      Record<string, unknown>;
    custom.extra = true;

    expect(decodeVerificationEvidenceRetentionProtections(sparse).ok).toBe(
      false
    );
    expect(decodeVerificationEvidenceRetentionProtections(custom).ok).toBe(
      false
    );
    expect(() =>
      encodeVerificationEvidenceRetentionProtections([
        protection({ version: -1 }),
      ])
    ).toThrow('nonnegative safe integer');
  });
});
