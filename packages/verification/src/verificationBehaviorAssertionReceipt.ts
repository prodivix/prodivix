import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import { digestVerificationValue } from './verificationCanonical';

export const VERIFICATION_BEHAVIOR_ASSERTION_RECEIPT_FORMAT =
  'prodivix.verification-behavior-assertion-receipt' as const;
export const VERIFICATION_BEHAVIOR_ASSERTION_RECEIPT_VERSION = 1 as const;

export type VerificationBehaviorAssertionReceipt = Readonly<{
  format: typeof VERIFICATION_BEHAVIOR_ASSERTION_RECEIPT_FORMAT;
  version: typeof VERIFICATION_BEHAVIOR_ASSERTION_RECEIPT_VERSION;
  attemptId: string;
  cellId: string;
  scenarioId: string;
  executableSnapshotDigest: string;
  scenarioProgramDigest: string;
  controlProfileDigest: string;
  fixtureSetDigests: readonly string[];
  targetLeaseBindingDigest: string;
  runtimeFixtureBindingDigest: string;
  blackBoxAssertionSetDigest: string;
  receiptDigest: string;
}>;

export type CreateVerificationBehaviorAssertionReceiptInput = Omit<
  VerificationBehaviorAssertionReceipt,
  'format' | 'version' | 'fixtureSetDigests' | 'receiptDigest'
> &
  Readonly<{ fixtureSetDigests: readonly string[] }>;

const TOKEN_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;
const DIGEST_PATTERN = /^sha256-[a-f0-9]{64}$/u;

const token = (value: string, label: string): string => {
  if (
    typeof value !== 'string' ||
    value !== value.normalize('NFC') ||
    !TOKEN_PATTERN.test(value)
  ) {
    throw new TypeError(`${label} must be a canonical identifier.`);
  }
  return value;
};

const digest = (value: string, label: string): string => {
  if (typeof value !== 'string' || !DIGEST_PATTERN.test(value)) {
    throw new TypeError(`${label} must be a canonical SHA-256 digest.`);
  }
  return value;
};

/**
 * Creates the public, attempt-bound receipt for an adapter-observed black-box
 * assertion set. The assertion bytes stay adapter-owned; this receipt is the
 * stable cross-owner correlation surface.
 */
export const createVerificationBehaviorAssertionReceipt = (
  input: CreateVerificationBehaviorAssertionReceiptInput
): VerificationBehaviorAssertionReceipt => {
  const fixtureSetDigests = Object.freeze(
    [...input.fixtureSetDigests].sort(compareUnicodeCodePoints)
  );
  if (new Set(fixtureSetDigests).size !== fixtureSetDigests.length) {
    throw new TypeError(
      'Behavior assertion receipt Fixture Set digests must be unique.'
    );
  }
  fixtureSetDigests.forEach((value) =>
    digest(value, 'Behavior assertion receipt Fixture Set digest')
  );
  const identity = Object.freeze({
    format: VERIFICATION_BEHAVIOR_ASSERTION_RECEIPT_FORMAT,
    version: VERIFICATION_BEHAVIOR_ASSERTION_RECEIPT_VERSION,
    attemptId: token(input.attemptId, 'Behavior assertion receipt attempt id'),
    cellId: token(input.cellId, 'Behavior assertion receipt cell id'),
    scenarioId: token(
      input.scenarioId,
      'Behavior assertion receipt Scenario id'
    ),
    executableSnapshotDigest: digest(
      input.executableSnapshotDigest,
      'Behavior assertion receipt executable Snapshot digest'
    ),
    scenarioProgramDigest: digest(
      input.scenarioProgramDigest,
      'Behavior assertion receipt Scenario Program digest'
    ),
    controlProfileDigest: digest(
      input.controlProfileDigest,
      'Behavior assertion receipt Control Profile digest'
    ),
    fixtureSetDigests,
    targetLeaseBindingDigest: digest(
      input.targetLeaseBindingDigest,
      'Behavior assertion receipt target lease binding digest'
    ),
    runtimeFixtureBindingDigest: digest(
      input.runtimeFixtureBindingDigest,
      'Behavior assertion receipt runtime Fixture binding digest'
    ),
    blackBoxAssertionSetDigest: digest(
      input.blackBoxAssertionSetDigest,
      'Behavior assertion receipt black-box assertion Set digest'
    ),
  });
  return Object.freeze({
    ...identity,
    receiptDigest: digestVerificationValue(identity),
  });
};
