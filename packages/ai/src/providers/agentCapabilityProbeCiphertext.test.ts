import { describe, expect, it } from 'vitest';
import { digestAgentCanonicalValue } from '../domain/agentCanonical';
import {
  createAgentCapabilityProbeProgram,
  digestAgentCapabilityProbeProfile,
} from './agentCapabilityProbeProgram';
import {
  AGENT_CAPABILITY_PROBE_RESPONSE_SPOOL_AAD_FORMAT,
  createAgentCapabilityProbeResponseSpoolAad,
  createAgentCapabilityProbeResponseSpoolCiphertextWire,
  createAgentCapabilityProbeResponseSpoolEncryptionProfile,
  decodeAgentCapabilityProbeResponseSpoolCiphertextWire,
  decryptAgentCapabilityProbeResponseSpoolPlaintext,
  digestAgentCapabilityProbeResponseSpoolAad,
  encryptAgentCapabilityProbeResponseSpoolPlaintext,
  isAgentCapabilityProbeResponseSpoolCiphertextEnvelope,
  isAgentCapabilityProbeResponseSpoolAad,
  matchAgentCapabilityProbeResponseSpoolAadBinding,
  matchAgentCapabilityProbeResponseSpoolAadEncryptionProfile,
  matchAgentCapabilityProbeResponseSpoolAadProgram,
} from './agentCapabilityProbeCiphertext';

const digest = (label: string) => digestAgentCanonicalValue({ label });
const program = createAgentCapabilityProbeProgram({
  capabilityProfileId: 'g4-provider-background-job',
  capabilityProfileDigest: digestAgentCapabilityProbeProfile(
    'g4-provider-background-job'
  ),
});
const profile = createAgentCapabilityProbeResponseSpoolEncryptionProfile({
  keyId: 'capability-probe-response-spool',
  keyVersion: 1,
  keyEnvironmentName: 'G4_CAPABILITY_PROBE_RESPONSE_SPOOL_KEY',
  keyRef: 'env://G4_CAPABILITY_PROBE_RESPONSE_SPOOL_KEY',
});
const input = Object.freeze({
  repositoryCommit: '1234567890abcdef1234567890abcdef12345678',
  admissionRequestDigest: digest('admission-request'),
  phase: program.providerRequestIntent.requestPhases[0]!,
  sequence: 0,
  phaseRequestDigest: digest('phase-request'),
  dispatchIntentDigest: digest('dispatch-intent'),
  transportReceiptDigest: digest('transport-receipt'),
  spoolRef: 'probe-spool.background-job.0',
  responseDigest: digest('provider-response'),
});

describe('capability probe ciphertext authority', () => {
  it('binds one pre-plan response spool to program, phase, transport, spool, policy, and key ref', () => {
    const aad = createAgentCapabilityProbeResponseSpoolAad(
      program,
      profile,
      input
    );
    expect(aad).toMatchObject({
      format: AGENT_CAPABILITY_PROBE_RESPONSE_SPOOL_AAD_FORMAT,
      probeProgramDigest: program.programDigest,
      profileProjectionDigest: program.profileProjectionDigest,
      encryptionProfileDigest: profile.encryptionProfileDigest,
      encryptionPolicyDigest: profile.encryptionPolicyDigest,
      keyRefDigest: profile.keyRefDigest,
      spoolRef: input.spoolRef,
    });
    expect(matchAgentCapabilityProbeResponseSpoolAadProgram(aad, program)).toBe(
      true
    );
    expect(
      matchAgentCapabilityProbeResponseSpoolAadEncryptionProfile(aad, profile)
    ).toBe(true);
    expect(digestAgentCapabilityProbeResponseSpoolAad(aad)).toMatch(
      /^sha256-[0-9a-f]{64}$/u
    );
    expect(
      'planDigest' in aad || 'attemptId' in aad || 'turnIndex' in aad
    ).toBe(false);
  });

  it.each([
    ['phaseRequestDigest', digest('swapped-phase-request')],
    ['transportReceiptDigest', digest('swapped-transport')],
    ['spoolRef', 'probe-spool.background-job.swapped'],
    ['responseDigest', digest('swapped-response')],
    ['encryptionPolicyDigest', digest('swapped-policy')],
    ['keyRefDigest', digest('swapped-key-ref')],
  ] as const)('rejects recomputed %s authority swaps', (key, replacement) => {
    const aad = createAgentCapabilityProbeResponseSpoolAad(
      program,
      profile,
      input
    );
    const tampered = Object.freeze({ ...aad, [key]: replacement });
    expect(
      key === 'encryptionPolicyDigest' || key === 'keyRefDigest'
        ? matchAgentCapabilityProbeResponseSpoolAadEncryptionProfile(
            tampered,
            profile
          )
        : isAgentCapabilityProbeResponseSpoolAad(tampered) &&
            matchAgentCapabilityProbeResponseSpoolAadBinding(
              tampered,
              program,
              profile,
              input
            )
    ).toBe(false);
  });

  it('rejects credential-like persisted key references', () => {
    expect(() =>
      createAgentCapabilityProbeResponseSpoolEncryptionProfile({
        keyId: 'capability-probe-response-spool',
        keyVersion: 1,
        keyEnvironmentName: 'G4_CAPABILITY_PROBE_RESPONSE_SPOOL_KEY',
        keyRef: 'Bearer secret-material',
      })
    ).toThrow(/invalid/u);
  });

  it('packs AES-GCM bytes as nonce, ciphertext, then authentication tag', () => {
    const aad = createAgentCapabilityProbeResponseSpoolAad(
      program,
      profile,
      input
    );
    const nonceBytes = new Uint8Array(12).fill(1);
    const ciphertextBytes = new Uint8Array([2, 3, 4, 5]);
    const authenticationTagBytes = new Uint8Array(16).fill(6);
    const wire = createAgentCapabilityProbeResponseSpoolCiphertextWire(
      program,
      profile,
      aad,
      { nonceBytes, ciphertextBytes, authenticationTagBytes }
    );
    expect(Object.keys(wire)).toEqual(['envelopeDigest', 'ciphertextBase64']);
    const decoded = decodeAgentCapabilityProbeResponseSpoolCiphertextWire(
      wire,
      program,
      profile,
      aad
    );
    expect([...decoded.nonceBytes]).toEqual([...nonceBytes]);
    expect([...decoded.ciphertextBytes]).toEqual([...ciphertextBytes]);
    expect([...decoded.authenticationTagBytes]).toEqual([
      ...authenticationTagBytes,
    ]);
    expect(decoded.envelope).toMatchObject({
      algorithm: 'AES-256-GCM',
      packing: 'nonce-ciphertext-authentication-tag',
      nonceBytes: 12,
      authenticationTagBytes: 16,
      plaintextSizeBytes: ciphertextBytes.byteLength,
      packedCiphertextSizeBytes: 32,
      envelopeDigest: wire.envelopeDigest,
    });
    expect(
      isAgentCapabilityProbeResponseSpoolCiphertextEnvelope(
        decoded.envelope,
        program,
        profile,
        aad,
        new Uint8Array([
          ...nonceBytes,
          ...ciphertextBytes,
          ...authenticationTagBytes,
        ])
      )
    ).toBe(true);
  });

  it('orchestrates callback-owned encryption/decryption with canonical AAD bytes', async () => {
    const aad = createAgentCapabilityProbeResponseSpoolAad(
      program,
      profile,
      input
    );
    const plaintextBytes = new TextEncoder().encode('{"status":"queued"}');
    const nonceBytes = new Uint8Array(12).fill(7);
    let encryptedAad: Uint8Array | null = null;
    const wire = await encryptAgentCapabilityProbeResponseSpoolPlaintext(
      program,
      profile,
      aad,
      {
        plaintextBytes,
        nonceBytes,
        encrypt: (callbackInput) => {
          encryptedAad = callbackInput.aadBytes;
          expect(callbackInput.keyRef).toBe(profile.keyRef);
          return Object.freeze({
            ciphertextBytes: new Uint8Array(
              callbackInput.plaintextBytes.map((value) => value ^ 0xaa)
            ),
            authenticationTagBytes: new Uint8Array(16).fill(8),
          });
        },
      }
    );
    const decrypted = await decryptAgentCapabilityProbeResponseSpoolPlaintext(
      wire,
      program,
      profile,
      aad,
      (callbackInput) => {
        expect(callbackInput.aadBytes).toEqual(encryptedAad);
        return new Uint8Array(
          callbackInput.ciphertextBytes.map((value) => value ^ 0xaa)
        );
      }
    );
    expect(decrypted).toEqual(plaintextBytes);
  });

  it('rejects packed-byte, tag, AAD, and maximum-plaintext drift', () => {
    const aad = createAgentCapabilityProbeResponseSpoolAad(
      program,
      profile,
      input
    );
    const wire = createAgentCapabilityProbeResponseSpoolCiphertextWire(
      program,
      profile,
      aad,
      {
        nonceBytes: new Uint8Array(12).fill(1),
        ciphertextBytes: new Uint8Array([2, 3, 4]),
        authenticationTagBytes: new Uint8Array(16).fill(5),
      }
    );
    const finalCharacter = wire.ciphertextBase64.at(-2)!;
    const tamperedCiphertext = `${wire.ciphertextBase64.slice(0, -2)}${
      finalCharacter === 'A' ? 'B' : 'A'
    }=`;
    expect(() =>
      decodeAgentCapabilityProbeResponseSpoolCiphertextWire(
        { ...wire, ciphertextBase64: tamperedCiphertext },
        program,
        profile,
        aad
      )
    ).toThrow(/digest drifted|invalid/u);
    expect(() =>
      createAgentCapabilityProbeResponseSpoolCiphertextWire(
        program,
        profile,
        aad,
        {
          nonceBytes: new Uint8Array(12),
          ciphertextBytes: new Uint8Array([1]),
          authenticationTagBytes: new Uint8Array(15),
        }
      )
    ).toThrow(/invalid/u);
    const swappedAad = createAgentCapabilityProbeResponseSpoolAad(
      program,
      profile,
      { ...input, responseDigest: digest('swapped-response-for-aad') }
    );
    expect(() =>
      decodeAgentCapabilityProbeResponseSpoolCiphertextWire(
        wire,
        program,
        profile,
        swappedAad
      )
    ).toThrow(/digest drifted/u);
    expect(() =>
      createAgentCapabilityProbeResponseSpoolCiphertextWire(
        program,
        profile,
        aad,
        {
          nonceBytes: new Uint8Array(12),
          ciphertextBytes: new Uint8Array(
            program.hardLimits.maximumResponseBytes + 1
          ),
          authenticationTagBytes: new Uint8Array(16),
        }
      )
    ).toThrow(/envelope is invalid/u);
  });
});
