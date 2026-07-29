import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { digestVerificationValue } from '@prodivix/verification';
import {
  GOLDEN_G3_V6_CONTROLLED_DIMENSION_MANIFEST,
  type GoldenG3V6ControlledDimensionId,
  type GoldenG3V6ControlledDimensionSuite,
} from './goldenG3V6ControlledDimensionManifest';

type VitestAssertion = Readonly<{
  title: string;
  status: 'failed' | 'passed' | 'pending' | 'skipped' | 'todo';
}>;

type VitestJsonReport = Readonly<{
  success: boolean;
  numPassedTests: number;
  numFailedTests: number;
  numPendingTests: number;
  numTodoTests: number;
  testResults: readonly Readonly<{
    assertionResults: readonly VitestAssertion[];
  }>[];
}>;

export type GoldenG3V6ControlledDimensionVerificationEvidence = Readonly<{
  manifestDigest: string;
  controlledDimensionIds: readonly GoldenG3V6ControlledDimensionId[];
  suiteIds: readonly string[];
  controlledDimensionCount: 17;
  suiteCount: 8;
  expectedPassedCaseCount: 28;
  actualPassedCaseCount: 28;
  ownerPassedCaseCount: 127;
  failedCaseCount: 0;
  skippedCaseCount: 0;
  todoCaseCount: 0;
  evidenceDigest: string;
}>;

const parseReport = async (path: string): Promise<VitestJsonReport> => {
  const parsed = JSON.parse(await readFile(path, 'utf8')) as VitestJsonReport;
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    !Array.isArray(parsed.testResults)
  ) {
    throw new Error('Golden V6 controlled-dimension JSON report is invalid.');
  }
  return parsed;
};

const assertExactPassedCases = (
  suite: GoldenG3V6ControlledDimensionSuite,
  report: VitestJsonReport
): void => {
  const expectedTitles = suite.cases.map(({ title }) => title);
  const expected = new Set(expectedTitles);
  const assertions = report.testResults.flatMap(
    ({ assertionResults }) => assertionResults
  );
  const matched = assertions.filter(({ title }) => expected.has(title));
  const matchedByTitle = new Map(
    matched.map((assertion) => [assertion.title, assertion])
  );
  const missing = expectedTitles.filter((title) => !matchedByTitle.has(title));
  const nonPassed = matched.filter(({ status }) => status !== 'passed');
  if (
    expected.size !== expectedTitles.length ||
    report.success !== true ||
    report.numFailedTests !== 0 ||
    report.numPendingTests !== 0 ||
    report.numTodoTests !== 0 ||
    matched.length !== expectedTitles.length ||
    matchedByTitle.size !== expectedTitles.length ||
    missing.length > 0 ||
    nonPassed.length > 0 ||
    assertions.length !== report.numPassedTests ||
    assertions.some(({ status }) => status !== 'passed')
  ) {
    throw new Error(
      `Golden V6 controlled-dimension suite "${suite.id}" did not pass its exact owner case set.`
    );
  }
};

const runSuite = async (
  suite: GoldenG3V6ControlledDimensionSuite,
  outputPath: string
): Promise<VitestJsonReport> => {
  const packageManagerCli = process.env.npm_execpath;
  if (!packageManagerCli) {
    throw new Error(
      'Golden V6 controlled-dimension Gate requires the pnpm CLI path.'
    );
  }
  const arguments_ = [
    packageManagerCli,
    '--filter',
    suite.packageName,
    'exec',
    'vitest',
    '--config',
    'vitest.config.ts',
    '--run',
    ...suite.files,
    '--reporter',
    'json',
    '--outputFile',
    outputPath,
  ];
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, arguments_, {
      cwd: resolve(import.meta.dirname, '../../..'),
      stdio: 'inherit',
      windowsHide: true,
    });
    child.once('error', rejectPromise);
    child.once('exit', (code, signal) => {
      if (signal) {
        rejectPromise(
          new Error(
            `Golden V6 controlled-dimension suite "${suite.id}" was terminated by ${signal}.`
          )
        );
      } else if (code !== 0) {
        rejectPromise(
          new Error(
            `Golden V6 controlled-dimension suite "${suite.id}" exited with code ${String(code)}.`
          )
        );
      } else {
        resolvePromise();
      }
    });
  });
  const report = await parseReport(outputPath);
  assertExactPassedCases(suite, report);
  return report;
};

const assertManifest = (): void => {
  const manifest = GOLDEN_G3_V6_CONTROLLED_DIMENSION_MANIFEST;
  if (
    manifest.planAxis !== false ||
    manifest.controlledDimensionIds.length !== 17 ||
    manifest.suites.length !== 8 ||
    manifest.expectedPassedCaseCount !== 28 ||
    manifest.expectedOwnerPassedCaseCount !== 127
  ) {
    throw new Error('Golden V6 controlled-dimension manifest drifted.');
  }
};

export const verifyGoldenG3V6ControlledDimensions =
  async (): Promise<GoldenG3V6ControlledDimensionVerificationEvidence> => {
    assertManifest();
    const temporaryRoot = await mkdtemp(
      join(tmpdir(), 'prodivix-g3-v6-controlled-dimensions-')
    );
    try {
      let actualPassedCaseCount = 0;
      let ownerPassedCaseCount = 0;
      for (const suite of GOLDEN_G3_V6_CONTROLLED_DIMENSION_MANIFEST.suites) {
        const outputPath = join(temporaryRoot, `${suite.id}.json`);
        const report = await runSuite(suite, outputPath);
        actualPassedCaseCount += suite.cases.length;
        ownerPassedCaseCount += report.numPassedTests;
      }
      if (
        actualPassedCaseCount !== 28 ||
        ownerPassedCaseCount !==
          GOLDEN_G3_V6_CONTROLLED_DIMENSION_MANIFEST.expectedOwnerPassedCaseCount
      ) {
        throw new Error(
          `Golden V6 controlled dimensions passed ${String(actualPassedCaseCount)}/${String(ownerPassedCaseCount)} controlled/owner cases instead of 28/127.`
        );
      }
      const stableEvidence = Object.freeze({
        format: 'prodivix.golden-g3-v6-controlled-dimension-evidence' as const,
        version: 1,
        manifestDigest:
          GOLDEN_G3_V6_CONTROLLED_DIMENSION_MANIFEST.manifestDigest,
        controlledDimensionIds:
          GOLDEN_G3_V6_CONTROLLED_DIMENSION_MANIFEST.controlledDimensionIds,
        suiteIds: Object.freeze(
          GOLDEN_G3_V6_CONTROLLED_DIMENSION_MANIFEST.suites.map(({ id }) => id)
        ),
        controlledDimensionCount: 17,
        suiteCount: 8,
        expectedPassedCaseCount: 28,
        actualPassedCaseCount,
        ownerPassedCaseCount,
        failedCaseCount: 0,
        skippedCaseCount: 0,
        todoCaseCount: 0,
      });
      return Object.freeze({
        ...stableEvidence,
        controlledDimensionCount: 17 as const,
        suiteCount: 8 as const,
        expectedPassedCaseCount: 28 as const,
        actualPassedCaseCount: 28 as const,
        ownerPassedCaseCount: 127 as const,
        failedCaseCount: 0 as const,
        skippedCaseCount: 0 as const,
        todoCaseCount: 0 as const,
        evidenceDigest: digestVerificationValue(stableEvidence),
      });
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  };
