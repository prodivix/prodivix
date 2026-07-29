import { createBrowserVerificationOriginDigest } from '@prodivix/verification-browser';
import type { GoldenG3V6RuntimeControlRegistrationInput } from './goldenG3V6RuntimeControlEvidence';

export const validateGoldenG3V6RuntimeControlRegistration = (
  input: GoldenG3V6RuntimeControlRegistrationInput,
  authFixtureSetDigest: string
): void => {
  const security = input.cell.checkKind === 'security';
  const declaresAuthFixture =
    input.cell.fixtureSetRef?.digest === authFixtureSetDigest;
  if (
    !input.attemptId ||
    input.attemptId !== input.attemptId.trim() ||
    !Number.isSafeInteger(input.generation) ||
    input.generation < 1
  ) {
    throw new TypeError(
      'Golden V6 runtime control attempt coordinates are invalid.'
    );
  }
  const origin = new URL(input.targetLease.origin).origin;
  if (
    input.targetLease.binding.attemptId !== input.attemptId ||
    input.targetLease.binding.generation !== input.generation ||
    input.targetLease.binding.executableSnapshotDigest !==
      input.snapshot.contentDigest ||
    input.targetLease.binding.targetId !== input.cell.targetId ||
    input.targetLease.binding.frameworkTarget !== input.cell.frameworkTarget ||
    input.targetLease.binding.surface !== input.cell.surface ||
    input.targetLease.binding.browserEngine !== input.cell.browserEngine ||
    (security
      ? input.cell.fixtureSetRef !== undefined ||
        input.fixtureProjectionReceipt !== undefined ||
        !input.productionSecurityAuthority
      : !declaresAuthFixture ||
        !input.fixtureProjectionReceipt ||
        input.productionSecurityAuthority !== undefined) ||
    input.targetLease.binding.originDigest !==
      createBrowserVerificationOriginDigest(origin)
  ) {
    throw new TypeError(
      'Golden V6 runtime control registration drifted from its target lease.'
    );
  }
};
