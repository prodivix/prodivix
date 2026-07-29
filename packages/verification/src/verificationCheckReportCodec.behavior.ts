import { sameCanonicalJson } from '@prodivix/shared/canonical';
import {
  createVerificationBehaviorAssertionReceipt,
  VERIFICATION_BEHAVIOR_ASSERTION_RECEIPT_FORMAT,
  VERIFICATION_BEHAVIOR_ASSERTION_RECEIPT_VERSION,
  type VerificationBehaviorAssertionReceipt,
} from './verificationBehaviorAssertionReceipt';
import {
  addVerificationReportIssue,
  readVerificationReportArray,
  verificationReportDigest,
  verificationReportRecord,
  verificationReportToken,
  type VerificationReportDecodeState,
} from './verificationCheckReportCodec.common';

export const readVerificationBehaviorAssertionReceipt = (
  value: unknown,
  path: string,
  state: VerificationReportDecodeState
): VerificationBehaviorAssertionReceipt | undefined => {
  const data = verificationReportRecord(
    value,
    [
      'format',
      'version',
      'attemptId',
      'cellId',
      'scenarioId',
      'executableSnapshotDigest',
      'scenarioProgramDigest',
      'controlProfileDigest',
      'fixtureSetDigests',
      'targetLeaseBindingDigest',
      'runtimeFixtureBindingDigest',
      'blackBoxAssertionSetDigest',
      'receiptDigest',
    ],
    [],
    path,
    state
  );
  if (!data) return undefined;
  if (data.format !== VERIFICATION_BEHAVIOR_ASSERTION_RECEIPT_FORMAT) {
    addVerificationReportIssue(
      state,
      `${path}/format`,
      'Unknown Behavior assertion receipt format.',
      'contract-mismatch',
      'VER-4001'
    );
  }
  if (data.version !== VERIFICATION_BEHAVIOR_ASSERTION_RECEIPT_VERSION) {
    addVerificationReportIssue(
      state,
      `${path}/version`,
      'Unknown Behavior assertion receipt version.',
      'contract-mismatch',
      'VER-4001'
    );
  }
  const attemptId = verificationReportToken(
    data.attemptId,
    `${path}/attemptId`,
    state
  );
  const cellId = verificationReportToken(data.cellId, `${path}/cellId`, state);
  const scenarioId = verificationReportToken(
    data.scenarioId,
    `${path}/scenarioId`,
    state
  );
  const executableSnapshotDigest = verificationReportDigest(
    data.executableSnapshotDigest,
    `${path}/executableSnapshotDigest`,
    state
  );
  const scenarioProgramDigest = verificationReportDigest(
    data.scenarioProgramDigest,
    `${path}/scenarioProgramDigest`,
    state
  );
  const controlProfileDigest = verificationReportDigest(
    data.controlProfileDigest,
    `${path}/controlProfileDigest`,
    state
  );
  const fixtureSetDigests = readVerificationReportArray(
    data.fixtureSetDigests,
    `${path}/fixtureSetDigests`,
    state,
    (entry, entryPath, nextState) =>
      verificationReportDigest(entry, entryPath, nextState)
  );
  const targetLeaseBindingDigest = verificationReportDigest(
    data.targetLeaseBindingDigest,
    `${path}/targetLeaseBindingDigest`,
    state
  );
  const runtimeFixtureBindingDigest = verificationReportDigest(
    data.runtimeFixtureBindingDigest,
    `${path}/runtimeFixtureBindingDigest`,
    state
  );
  const blackBoxAssertionSetDigest = verificationReportDigest(
    data.blackBoxAssertionSetDigest,
    `${path}/blackBoxAssertionSetDigest`,
    state
  );
  const receiptDigest = verificationReportDigest(
    data.receiptDigest,
    `${path}/receiptDigest`,
    state
  );
  if (
    !attemptId ||
    !cellId ||
    !scenarioId ||
    !executableSnapshotDigest ||
    !scenarioProgramDigest ||
    !controlProfileDigest ||
    !fixtureSetDigests ||
    !targetLeaseBindingDigest ||
    !runtimeFixtureBindingDigest ||
    !blackBoxAssertionSetDigest ||
    !receiptDigest
  ) {
    return undefined;
  }
  let receipt: VerificationBehaviorAssertionReceipt;
  try {
    receipt = createVerificationBehaviorAssertionReceipt({
      attemptId,
      cellId,
      scenarioId,
      executableSnapshotDigest,
      scenarioProgramDigest,
      controlProfileDigest,
      fixtureSetDigests,
      targetLeaseBindingDigest,
      runtimeFixtureBindingDigest,
      blackBoxAssertionSetDigest,
    });
  } catch {
    addVerificationReportIssue(
      state,
      path,
      'Behavior assertion receipt contains invalid canonical bindings.',
      'contract-mismatch',
      'VER-4001'
    );
    return undefined;
  }
  if (receipt.receiptDigest !== receiptDigest) {
    addVerificationReportIssue(
      state,
      `${path}/receiptDigest`,
      'Behavior assertion receipt digest does not match its exact bindings.',
      'contract-mismatch',
      'VER-4001'
    );
    return undefined;
  }
  if (!sameCanonicalJson(fixtureSetDigests, receipt.fixtureSetDigests)) {
    addVerificationReportIssue(
      state,
      `${path}/fixtureSetDigests`,
      'Behavior assertion receipt Fixture Set digests are not in canonical order.',
      'contract-mismatch',
      'VER-4001'
    );
    return undefined;
  }
  return receipt;
};
