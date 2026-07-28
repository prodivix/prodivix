import { describe, expect, it } from 'vitest';
import {
  appendVerificationTrustRevocationRecord,
  createVerificationEffectiveRevocationView,
  createVerificationTrustRevocationRecord,
  normalizeVerificationTrustRevocationRecord,
  normalizeVerificationTrustRevocationRecords,
  verificationTrustRevocationApplies,
  type VerificationTrustRevocationRecordInput,
} from './verificationRevocation';

const input = (
  overrides: Partial<VerificationTrustRevocationRecordInput> = {}
): VerificationTrustRevocationRecordInput => ({
  id: 'revocation-1',
  scope: {
    kind: 'key',
    issuer: 'https://attestor.example.test',
    keyId: 'remote-2026-07',
  },
  reasonCode: 'key-compromise',
  reason: 'The attestation key was compromised.',
  actorId: 'security-owner',
  recordedAt: '2026-07-28T12:00:00.000Z',
  effectiveAt: '2026-07-28T11:00:00.000Z',
  ...overrides,
});

describe('Verification trust revocation', () => {
  it('creates immutable self-digested append-only records', () => {
    const created = createVerificationTrustRevocationRecord(input());
    expect(created.recordDigest).toMatch(/^sha256-[0-9a-f]{64}$/u);
    expect(normalizeVerificationTrustRevocationRecord(created)).toEqual(
      created
    );

    const replayed = appendVerificationTrustRevocationRecord(
      [created],
      input()
    );
    expect(replayed).toHaveLength(1);
    expect(replayed[0]).toEqual(created);

    expect(() =>
      appendVerificationTrustRevocationRecord(
        [created],
        input({ reason: 'A different immutable reason.' })
      )
    ).toThrow('id conflicts');

    expect(() =>
      normalizeVerificationTrustRevocationRecord({
        ...created,
        actorId: 'different-actor',
      })
    ).toThrow('digest is invalid');
  });

  it('normalizes record order by Unicode code points and rejects duplicate ids', () => {
    const underscore = createVerificationTrustRevocationRecord(
      input({ id: 'revocation_a' })
    );
    const dash = createVerificationTrustRevocationRecord(
      input({ id: 'revocation-a' })
    );
    expect(
      normalizeVerificationTrustRevocationRecords([underscore, dash]).map(
        ({ id }) => id
      )
    ).toEqual(['revocation-a', 'revocation_a']);
    expect(() =>
      normalizeVerificationTrustRevocationRecords([underscore, underscore])
    ).toThrow('ids must be unique');
  });

  it('applies exact issuer, key, and evidence scopes without cross-issuer drift', () => {
    const evidence = {
      evidenceId: 'evidence-1',
      attestation: {
        issuer: 'https://attestor.example.test',
        keyId: 'remote-2026-07',
      },
    };
    const issuer = createVerificationTrustRevocationRecord(
      input({
        id: 'issuer-revocation',
        scope: {
          kind: 'issuer',
          issuer: 'https://attestor.example.test',
        },
      })
    );
    const key = createVerificationTrustRevocationRecord(input());
    const exactEvidence = createVerificationTrustRevocationRecord(
      input({
        id: 'evidence-revocation',
        scope: { kind: 'evidence', evidenceId: 'evidence-1' },
      })
    );
    expect(verificationTrustRevocationApplies(issuer, evidence)).toBe(true);
    expect(verificationTrustRevocationApplies(key, evidence)).toBe(true);
    expect(verificationTrustRevocationApplies(exactEvidence, evidence)).toBe(
      true
    );
    expect(
      verificationTrustRevocationApplies(
        createVerificationTrustRevocationRecord(
          input({
            id: 'other-issuer',
            scope: {
              kind: 'key',
              issuer: 'https://other.example.test',
              keyId: 'remote-2026-07',
            },
          })
        ),
        evidence
      )
    ).toBe(false);
    expect(
      verificationTrustRevocationApplies(key, { evidenceId: 'local-evidence' })
    ).toBe(false);
  });

  it('derives an order-independent effective view and revocation digest', () => {
    const records = [
      createVerificationTrustRevocationRecord(
        input({
          id: 'revocation-key',
          scope: {
            kind: 'key',
            issuer: 'https://attestor.example.test',
            keyId: 'remote-2026-07',
          },
        })
      ),
      createVerificationTrustRevocationRecord(
        input({
          id: 'revocation-evidence',
          scope: { kind: 'evidence', evidenceId: 'evidence-local' },
        })
      ),
    ];
    const evidence = [
      { evidenceId: 'evidence-local' },
      {
        evidenceId: 'evidence-remote',
        attestation: {
          issuer: 'https://attestor.example.test',
          keyId: 'remote-2026-07',
        },
      },
      {
        evidenceId: 'evidence-other-key',
        attestation: {
          issuer: 'https://attestor.example.test',
          keyId: 'remote-2026-08',
        },
      },
    ];
    const forward = createVerificationEffectiveRevocationView({
      records,
      evidence,
      evaluationInstant: '2026-07-28T12:00:00.000Z',
    });
    const reversed = createVerificationEffectiveRevocationView({
      records: [...records].reverse(),
      evidence: [...evidence].reverse(),
      evaluationInstant: '2026-07-28T12:00:00.000Z',
    });
    expect(forward.revokedEvidenceIds).toEqual([
      'evidence-local',
      'evidence-remote',
    ]);
    expect(reversed.revocationRecordDigest).toBe(
      forward.revocationRecordDigest
    );
    expect(reversed.effectiveRecords).toEqual(forward.effectiveRecords);
  });

  it('excludes scheduled and not-yet-recorded revocations until both instants pass', () => {
    const scheduled = createVerificationTrustRevocationRecord(
      input({
        recordedAt: '2026-07-28T12:00:00.000Z',
        effectiveAt: '2026-07-28T13:00:00.000Z',
        scope: { kind: 'evidence', evidenceId: 'evidence-1' },
      })
    );
    const notRecorded = createVerificationTrustRevocationRecord(
      input({
        id: 'revocation-2',
        recordedAt: '2026-07-28T13:00:00.000Z',
        effectiveAt: '2026-07-28T11:00:00.000Z',
        scope: { kind: 'evidence', evidenceId: 'evidence-1' },
      })
    );
    const before = createVerificationEffectiveRevocationView({
      records: [scheduled, notRecorded],
      evidence: [{ evidenceId: 'evidence-1' }],
      evaluationInstant: '2026-07-28T12:30:00.000Z',
    });
    expect(before.effectiveRecords).toEqual([]);
    expect(before.revokedEvidenceIds).toEqual([]);

    const after = createVerificationEffectiveRevocationView({
      records: [scheduled, notRecorded],
      evidence: [{ evidenceId: 'evidence-1' }],
      evaluationInstant: '2026-07-28T13:00:00.000Z',
    });
    expect(after.effectiveRecords).toHaveLength(2);
    expect(after.revokedEvidenceIds).toEqual(['evidence-1']);
    expect(after.revocationRecordDigest).not.toBe(
      before.revocationRecordDigest
    );
  });

  it('fails closed on malformed scopes, instants, digests, and evidence identities', () => {
    expect(() =>
      createVerificationTrustRevocationRecord(
        input({
          scope: {
            kind: 'key',
            issuer: 'https://attestor.example.test',
            keyId: '',
          },
        })
      )
    ).toThrow('scope is invalid');
    expect(() =>
      createVerificationTrustRevocationRecord(
        input({ effectiveAt: '2026-07-28' })
      )
    ).toThrow('record is invalid');
    const record = createVerificationTrustRevocationRecord(input());
    expect(() =>
      normalizeVerificationTrustRevocationRecord({
        ...record,
        recordDigest: 'sha256-invalid',
      })
    ).toThrow('record is invalid');
    expect(() =>
      createVerificationEffectiveRevocationView({
        records: [record],
        evidence: [{ evidenceId: 'evidence-1' }, { evidenceId: 'evidence-1' }],
        evaluationInstant: '2026-07-28T12:00:00.000Z',
      })
    ).toThrow('Evidence ids must be unique');
  });

  it('rejects accessor-backed records without invoking the getter', () => {
    const malicious = { ...input() };
    let getterCalls = 0;
    Object.defineProperty(malicious, 'reason', {
      enumerable: true,
      get() {
        getterCalls += 1;
        throw new Error('must not execute');
      },
    });
    expect(() =>
      createVerificationTrustRevocationRecord(
        malicious as VerificationTrustRevocationRecordInput
      )
    ).toThrow('record is invalid');
    expect(getterCalls).toBe(0);

    const scope = {
      issuer: 'https://attestor.example.test',
      keyId: 'remote-2026-07',
    };
    Object.defineProperty(scope, 'kind', {
      enumerable: true,
      get() {
        getterCalls += 1;
        throw new Error('must not execute');
      },
    });
    expect(() =>
      createVerificationTrustRevocationRecord(
        input({
          scope:
            scope as unknown as VerificationTrustRevocationRecordInput['scope'],
        })
      )
    ).toThrow('scope is invalid');
    expect(getterCalls).toBe(0);
  });

  it('rejects records with a custom prototype', () => {
    const malicious = Object.assign(
      Object.create({ inherited: true }),
      input()
    );
    expect(() =>
      createVerificationTrustRevocationRecord(
        malicious as VerificationTrustRevocationRecordInput
      )
    ).toThrow('record is invalid');
  });

  it('rejects records with unsafe own keys', () => {
    const malicious = { ...input() };
    Object.defineProperty(malicious, '__proto__', {
      configurable: true,
      enumerable: true,
      value: 'must-not-enter-the-record',
    });
    expect(() =>
      createVerificationTrustRevocationRecord(
        malicious as VerificationTrustRevocationRecordInput
      )
    ).toThrow('record is invalid');
  });

  it('rejects accessor-backed revocation arrays without invoking getters', () => {
    const records: ReturnType<
      typeof createVerificationTrustRevocationRecord
    >[] = [];
    let getterCalls = 0;
    Object.defineProperty(records, '0', {
      configurable: true,
      enumerable: true,
      get() {
        getterCalls += 1;
        throw new Error('must not execute');
      },
    });
    expect(() => normalizeVerificationTrustRevocationRecords(records)).toThrow(
      'set is invalid'
    );
    expect(getterCalls).toBe(0);
  });
});
