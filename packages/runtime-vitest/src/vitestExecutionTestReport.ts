import {
  createExecutionTestReport,
  type ExecutionSourceTrace,
  type ExecutionTestReport,
  type ExecutionTestStatus,
} from '@prodivix/runtime-core';

type JsonObject = Readonly<Record<string, unknown>>;

export const VITEST_EXECUTION_TEST_REPORT_LIMITS = Object.freeze({
  maxInputCharacters: 4_000_000,
  maxFiles: 256,
  maxCases: 4_096,
  maxFailureMessages: 512,
  maxFailureMessagesPerOwner: 16,
  maxTextLength: 2_000,
  maxSourceTracePerOwner: 8,
});

export type ParseVitestExecutionTestReportInput = Readonly<{
  source: string | Uint8Array;
  reportId: string;
  completedAt: number;
  sourceTrace?: readonly ExecutionSourceTrace[];
  resolveSourceTrace?: (
    testFilePath: string
  ) => readonly ExecutionSourceTrace[] | undefined;
}>;

export class VitestExecutionTestReportError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'VitestExecutionTestReportError';
  }
}

const isObject = (value: unknown): value is JsonObject =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const finiteNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : undefined;

const nonEmptyString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

const normalizeStatus = (value: unknown): ExecutionTestStatus => {
  switch (value) {
    case 'passed':
      return 'passed';
    case 'failed':
      return 'failed';
    case 'todo':
      return 'todo';
    case 'pending':
    case 'skipped':
    case 'disabled':
      return 'skipped';
    default:
      return 'failed';
  }
};

const deriveFileStatus = (
  rawStatus: unknown,
  caseStatuses: readonly ExecutionTestStatus[]
): ExecutionTestStatus => {
  if (normalizeStatus(rawStatus) === 'failed') return 'failed';
  if (caseStatuses.includes('failed')) return 'failed';
  if (caseStatuses.includes('passed')) return 'passed';
  if (
    caseStatuses.length &&
    caseStatuses.every((status) => status === 'todo')
  ) {
    return 'todo';
  }
  if (caseStatuses.length) return 'skipped';
  return normalizeStatus(rawStatus);
};

const cloneSourceTrace = (
  sourceTrace: readonly ExecutionSourceTrace[] | undefined,
  label: string
): readonly ExecutionSourceTrace[] | undefined =>
  sourceTrace?.map((trace) => ({ ...trace, label }));

const decodeSource = (source: string | Uint8Array): string =>
  typeof source === 'string' ? source : new TextDecoder().decode(source);

const derivedDuration = (entry: JsonObject): number | undefined => {
  const direct = finiteNumber(entry.duration);
  if (direct !== undefined) return direct;
  const start = finiteNumber(entry.startTime);
  const end = finiteNumber(entry.endTime);
  return start !== undefined && end !== undefined && end >= start
    ? end - start
    : undefined;
};

/** Converts bounded Vitest JSON reporter output into the canonical Test report. */
export const parseVitestExecutionTestReport = (
  input: ParseVitestExecutionTestReportInput
): ExecutionTestReport => {
  const decodedSource = decodeSource(input.source);
  if (
    decodedSource.length >
    VITEST_EXECUTION_TEST_REPORT_LIMITS.maxInputCharacters
  ) {
    throw new VitestExecutionTestReportError(
      `Vitest JSON report exceeds ${VITEST_EXECUTION_TEST_REPORT_LIMITS.maxInputCharacters} characters.`
    );
  }
  let raw: unknown;
  try {
    raw = JSON.parse(decodedSource);
  } catch (error) {
    throw new VitestExecutionTestReportError(
      'Vitest did not produce a valid JSON test report.',
      { cause: error }
    );
  }
  if (!isObject(raw) || !Array.isArray(raw.testResults)) {
    throw new VitestExecutionTestReportError(
      'Vitest JSON report must declare a testResults array.'
    );
  }
  if (raw.testResults.length > VITEST_EXECUTION_TEST_REPORT_LIMITS.maxFiles) {
    throw new VitestExecutionTestReportError(
      `Vitest JSON report exceeds the ${VITEST_EXECUTION_TEST_REPORT_LIMITS.maxFiles} file limit.`
    );
  }

  let totalCases = 0;
  let totalFailureMessages = 0;
  const boundedText = (value: string, label: string): string => {
    if (value.length > VITEST_EXECUTION_TEST_REPORT_LIMITS.maxTextLength) {
      throw new VitestExecutionTestReportError(
        `Vitest ${label} exceeds the ${VITEST_EXECUTION_TEST_REPORT_LIMITS.maxTextLength} character limit.`
      );
    }
    return value;
  };
  const boundedFailureMessages = (
    value: unknown,
    label: string
  ): readonly string[] | undefined => {
    if (!Array.isArray(value)) return undefined;
    const messages = value
      .map(nonEmptyString)
      .filter((entry): entry is string => Boolean(entry));
    if (
      messages.length >
      VITEST_EXECUTION_TEST_REPORT_LIMITS.maxFailureMessagesPerOwner
    ) {
      throw new VitestExecutionTestReportError(
        `Vitest ${label} exceeds the per-owner failure message limit.`
      );
    }
    totalFailureMessages += messages.length;
    if (
      totalFailureMessages >
      VITEST_EXECUTION_TEST_REPORT_LIMITS.maxFailureMessages
    ) {
      throw new VitestExecutionTestReportError(
        `Vitest JSON report exceeds the ${VITEST_EXECUTION_TEST_REPORT_LIMITS.maxFailureMessages} failure message limit.`
      );
    }
    const normalized = messages.map((message) =>
      boundedText(message, 'failure message')
    );
    return normalized.length ? Object.freeze(normalized) : undefined;
  };
  const boundedSourceTrace = (
    value: readonly ExecutionSourceTrace[] | undefined,
    label: string
  ): readonly ExecutionSourceTrace[] | undefined => {
    if (!value?.length) return undefined;
    if (
      value.length > VITEST_EXECUTION_TEST_REPORT_LIMITS.maxSourceTracePerOwner
    ) {
      throw new VitestExecutionTestReportError(
        `Vitest ${label} exceeds the source trace limit.`
      );
    }
    return value;
  };

  const files = raw.testResults.map((entry, fileIndex) => {
    if (!isObject(entry)) {
      throw new VitestExecutionTestReportError(
        `Vitest testResults[${fileIndex}] must be an object.`
      );
    }
    const reportedPath =
      nonEmptyString(entry.name) ??
      nonEmptyString(entry.testFilePath) ??
      `unknown-test-file-${fileIndex + 1}`;
    const path = boundedText(reportedPath, 'file path');
    const fileSourceTrace = boundedSourceTrace(
      input.resolveSourceTrace?.(reportedPath) ?? input.sourceTrace,
      'file source trace'
    );
    const assertions = Array.isArray(entry.assertionResults)
      ? entry.assertionResults
      : [];
    totalCases += assertions.length;
    if (totalCases > VITEST_EXECUTION_TEST_REPORT_LIMITS.maxCases) {
      throw new VitestExecutionTestReportError(
        `Vitest JSON report exceeds the ${VITEST_EXECUTION_TEST_REPORT_LIMITS.maxCases} case limit.`
      );
    }
    const cases = assertions.map((assertion, caseIndex) => {
      if (!isObject(assertion)) {
        throw new VitestExecutionTestReportError(
          `Vitest assertionResults[${caseIndex}] in ${path} must be an object.`
        );
      }
      const name = boundedText(
        nonEmptyString(assertion.title) ??
          nonEmptyString(assertion.name) ??
          `test case ${caseIndex + 1}`,
        'case name'
      );
      const rawFullName = nonEmptyString(assertion.fullName);
      const fullName = rawFullName
        ? boundedText(rawFullName, 'case fullName')
        : undefined;
      const status = normalizeStatus(assertion.status);
      const durationMs = derivedDuration(assertion);
      const failureMessages = boundedFailureMessages(
        assertion.failureMessages,
        'case'
      );
      return {
        caseId: `${path}#${caseIndex + 1}`,
        name,
        ...(fullName ? { fullName } : {}),
        status,
        ...(durationMs === undefined ? {} : { durationMs }),
        ...(failureMessages ? { failureMessages } : {}),
        ...(fileSourceTrace
          ? {
              sourceTrace: cloneSourceTrace(fileSourceTrace, fullName ?? name),
            }
          : {}),
      };
    });
    const durationMs = derivedDuration(entry);
    const failureMessages = boundedFailureMessages(
      Array.isArray(entry.failureMessages)
        ? entry.failureMessages
        : typeof entry.message === 'string'
          ? [entry.message]
          : undefined,
      'file'
    );
    return {
      fileId: path,
      path,
      status: deriveFileStatus(
        entry.status,
        cases.map((testCase) => testCase.status)
      ),
      ...(durationMs === undefined ? {} : { durationMs }),
      cases,
      ...(failureMessages ? { failureMessages } : {}),
      ...(fileSourceTrace
        ? { sourceTrace: cloneSourceTrace(fileSourceTrace, path) }
        : {}),
    };
  });

  const startedAt = finiteNumber(raw.startTime);
  const failureMessages = boundedFailureMessages(
    raw.failureMessages,
    'root report'
  );
  return createExecutionTestReport({
    reportId: input.reportId,
    tool: { name: 'vitest' },
    ...(startedAt === undefined ? {} : { startedAt }),
    completedAt: input.completedAt,
    files,
    ...(failureMessages ? { failureMessages } : {}),
  });
};
