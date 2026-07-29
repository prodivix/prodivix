import { verifyGoldenG3V6ControlledDimensions } from '../src/goldenG3V6ControlledDimensionVerification';

const evidence = await verifyGoldenG3V6ControlledDimensions();
process.stdout.write(
  `[Golden V6 controlled dimensions] controlled=${String(evidence.actualPassedCaseCount)} totalPassed=${String(evidence.ownerPassedCaseCount)} skipped=${String(evidence.skippedCaseCount)} todo=${String(evidence.todoCaseCount)} failed=${String(evidence.failedCaseCount)} manifest=${evidence.manifestDigest} evidence=${evidence.evidenceDigest}\n`
);
