import {
  createExecutionTestReport,
  EXECUTION_TEST_REPORT_LIMITS,
  type ExecutionSourceTrace,
  type ExecutionTestReport,
  type ExecutionTestStatus,
} from '@prodivix/runtime-core';

type JsonObject = Readonly<Record<string, unknown>>;

export const VITEST_EXECUTION_TEST_REPORT_LIMITS = Object.freeze({
  maxInputCharacters: 4_000_000,
  maxFiles: EXECUTION_TEST_REPORT_LIMITS.maxFiles,
  maxCases: EXECUTION_TEST_REPORT_LIMITS.maxCases,
  maxFailureMessages: EXECUTION_TEST_REPORT_LIMITS.maxFailureMessages,
  maxFailureMessagesPerOwner:
    EXECUTION_TEST_REPORT_LIMITS.maxFailureMessagesPerOwner,
  maxTextLength: 2_000,
  maxSourceTracePerOwner: EXECUTION_TEST_REPORT_LIMITS.maxSourceTracePerOwner,
});

export type ParseVitestExecutionTestReportInput = Readonly<{
  source: string | Uint8Array;
  reportId: string;
  completedAt: number;
  toolVersion: string;
  /**
   * The provider-owned process exit code, when available. Browser and Remote
   * providers also enforce this correlation at their own boundary; accepting
   * it here lets other controlled callers fail before publishing a report.
   */
  exitCode?: number;
  sourceTrace?: readonly ExecutionSourceTrace[];
  /**
   * Maps the reporter-owned absolute file path to one exact snapshot-relative
   * identity while the provider root is still available. Providers must fail
   * closed rather than using suffix matches.
   */
  resolveFileIdentity: (
    reportedPath: string
  ) => VitestExecutionFileIdentity | undefined;
  resolveSourceTrace?: (
    testFilePath: string
  ) => readonly ExecutionSourceTrace[] | undefined;
}>;

export type VitestExecutionFileIdentity = Readonly<{
  fileId: string;
  path: string;
  sourceTrace?: readonly ExecutionSourceTrace[];
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

const normalizeStatus = (
  value: unknown,
  label: string
): ExecutionTestStatus => {
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
      throw new VitestExecutionTestReportError(
        `Vitest ${label} has an unsupported status.`
      );
  }
};

const deriveFileStatus = (
  rawStatus: unknown,
  caseStatuses: readonly ExecutionTestStatus[],
  label: string
): ExecutionTestStatus => {
  if (normalizeStatus(rawStatus, label) === 'failed') return 'failed';
  if (caseStatuses.includes('failed')) return 'failed';
  if (caseStatuses.includes('passed')) return 'passed';
  if (
    caseStatuses.length &&
    caseStatuses.every((status) => status === 'todo')
  ) {
    return 'todo';
  }
  if (caseStatuses.length) return 'skipped';
  return normalizeStatus(rawStatus, label);
};

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

/**
 * The private reporter does not expose a durable case identity. Bind the
 * canonical id to the owned file plus the fully-qualified case name instead
 * of the reporter's array position, so reordering cannot change identity.
 */
const caseId = (
  filePath: string,
  name: string,
  fullName: string | undefined
): string => {
  const identity = fullName ?? name;
  return `case:${filePath.length}:${filePath}:${identity}`;
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

const ROOT_REPORTER_FIELDS = new Set([
  'coverageMap',
  'failureMessages',
  'numFailedTestSuites',
  'numFailedTests',
  'numPassedTestSuites',
  'numPassedTests',
  'numPendingTestSuites',
  'numPendingTests',
  'numRuntimeErrorTestSuites',
  'numTodoTests',
  'numTotalTestSuites',
  'numTotalTests',
  'openHandles',
  'snapshot',
  'startTime',
  'success',
  'testResults',
  'wasInterrupted',
]);
const FILE_REPORTER_FIELDS = new Set([
  'assertionResults',
  'endTime',
  'failureMessage',
  'failureMessages',
  'message',
  'name',
  'startTime',
  'status',
  'summary',
  'testFilePath',
]);
const CASE_REPORTER_FIELDS = new Set([
  'ancestorTitles',
  'duration',
  'failureDetails',
  'failureMessages',
  'fullName',
  'location',
  'meta',
  'name',
  'status',
  'tags',
  'title',
]);
const UNSAFE_FIELDS = new Set(['__proto__', 'constructor', 'prototype']);

const assertKnownFields = (
  value: JsonObject,
  fields: ReadonlySet<string>,
  label: string
): void => {
  const unknown = Object.keys(value).find(
    (key) => UNSAFE_FIELDS.has(key) || !fields.has(key)
  );
  if (unknown) {
    throw new VitestExecutionTestReportError(
      `Vitest ${label} has an unknown or unsafe field.`
    );
  }
};

const PRIVATE_LOCATION_PATTERN =
  /(?:\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>]*|(?:^|[\s"'(=])(?:[A-Za-z]:[\\/]|\\\\[^\\/\s]+[\\/])|(?:^|[\s"'(=])\/(?!\/)(?:[A-Za-z0-9._-]+\/)+[A-Za-z0-9._-]*)/iu;

const canonicalRelativePath = (value: unknown, label: string): string => {
  const path = nonEmptyString(value);
  const normalized = path?.replace(/\\/gu, '/');
  if (
    !path ||
    path !== normalized ||
    PRIVATE_LOCATION_PATTERN.test(path) ||
    path.startsWith('/') ||
    /^[A-Za-z]:\//u.test(path) ||
    path
      .split('/')
      .some(
        (segment) => segment.length === 0 || segment === '.' || segment === '..'
      )
  ) {
    throw new VitestExecutionTestReportError(
      `Vitest ${label} must be a canonical snapshot-relative path.`
    );
  }
  return path;
};

const sanitizeFailureMessage = (value: string): string =>
  PRIVATE_LOCATION_PATTERN.test(value)
    ? 'Provider-private failure detail redacted.'
    : value;

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
  assertKnownFields(raw, ROOT_REPORTER_FIELDS, 'root report');
  if (
    raw.coverageMap !== undefined &&
    raw.coverageMap !== null &&
    !isObject(raw.coverageMap)
  ) {
    throw new VitestExecutionTestReportError(
      'Vitest root report coverageMap is invalid.'
    );
  }
  const toolVersion = nonEmptyString(input.toolVersion);
  if (
    !toolVersion ||
    !/^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/u.test(toolVersion)
  ) {
    throw new VitestExecutionTestReportError(
      'Vitest provider toolVersion must be an exact attested semantic version.'
    );
  }
  if (raw.testResults.length > VITEST_EXECUTION_TEST_REPORT_LIMITS.maxFiles) {
    throw new VitestExecutionTestReportError(
      `Vitest JSON report exceeds the ${VITEST_EXECUTION_TEST_REPORT_LIMITS.maxFiles} file limit.`
    );
  }
  if (raw.testResults.length === 0) {
    throw new VitestExecutionTestReportError(
      'Vitest JSON report did not contain any test files.'
    );
  }
  if (raw.success !== undefined && typeof raw.success !== 'boolean') {
    throw new VitestExecutionTestReportError(
      'Vitest JSON report success must be a boolean when present.'
    );
  }
  if (
    input.exitCode !== undefined &&
    (!Number.isSafeInteger(input.exitCode) || input.exitCode < 0)
  ) {
    throw new VitestExecutionTestReportError(
      'Vitest process exit code must be a non-negative safe integer.'
    );
  }
  if (typeof input.resolveFileIdentity !== 'function') {
    throw new VitestExecutionTestReportError(
      'Vitest provider must supply an exact executable snapshot file identity resolver.'
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
      boundedText(sanitizeFailureMessage(message), 'failure message')
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
    assertKnownFields(entry, FILE_REPORTER_FIELDS, `testResults[${fileIndex}]`);
    const reportedPath =
      nonEmptyString(entry.name) ??
      nonEmptyString(entry.testFilePath) ??
      `unknown-test-file-${fileIndex + 1}`;
    const identity = input.resolveFileIdentity(reportedPath);
    if (!identity) {
      throw new VitestExecutionTestReportError(
        `Vitest testResults[${fileIndex}] is not mapped to the executable snapshot.`
      );
    }
    if (
      identity &&
      (!isObject(identity) ||
        Object.keys(identity).some(
          (key) => key !== 'fileId' && key !== 'path' && key !== 'sourceTrace'
        ))
    ) {
      throw new VitestExecutionTestReportError(
        'Vitest file identity has unknown fields.'
      );
    }
    const path = boundedText(
      identity
        ? canonicalRelativePath(identity.path, 'file identity path')
        : reportedPath,
      'file path'
    );
    const fileId = identity
      ? boundedText(
          canonicalRelativePath(identity.fileId, 'file identity fileId'),
          'file identity fileId'
        )
      : path;
    if (identity && fileId !== path) {
      throw new VitestExecutionTestReportError(
        'Vitest file identity fileId and path must name the same snapshot-relative file.'
      );
    }
    const fileSourceTrace = boundedSourceTrace(
      identity?.sourceTrace ??
        input.resolveSourceTrace?.(reportedPath) ??
        input.sourceTrace,
      'file source trace'
    );
    if (!Array.isArray(entry.assertionResults)) {
      throw new VitestExecutionTestReportError(
        `Vitest assertionResults in ${path} must be an array.`
      );
    }
    const assertions = entry.assertionResults;
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
      assertKnownFields(
        assertion,
        CASE_REPORTER_FIELDS,
        `assertionResults[${caseIndex}]`
      );
      if (
        assertion.meta !== undefined &&
        assertion.meta !== null &&
        !isObject(assertion.meta)
      ) {
        throw new VitestExecutionTestReportError(
          `Vitest assertionResults[${caseIndex}].meta is invalid.`
        );
      }
      if (
        assertion.tags !== undefined &&
        (!Array.isArray(assertion.tags) || assertion.tags.length > 1_000)
      ) {
        throw new VitestExecutionTestReportError(
          `Vitest assertionResults[${caseIndex}].tags is invalid.`
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
      const status = normalizeStatus(
        assertion.status,
        `case "${fullName ?? name}"`
      );
      const durationMs = derivedDuration(assertion);
      const failureMessages = boundedFailureMessages(
        assertion.failureMessages,
        'case'
      );
      return {
        caseId: caseId(path, name, fullName),
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
    const seenCaseIds = new Set<string>();
    for (const testCase of cases) {
      if (seenCaseIds.has(testCase.caseId)) {
        throw new VitestExecutionTestReportError(
          `Vitest report contains duplicate case identity in ${path}: ${testCase.caseId}.`
        );
      }
      seenCaseIds.add(testCase.caseId);
    }
    cases.sort((left, right) => compareText(left.caseId, right.caseId));
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
      fileId,
      path,
      status: deriveFileStatus(
        entry.status,
        cases.map((testCase) => testCase.status),
        `file "${path}"`
      ),
      ...(durationMs === undefined ? {} : { durationMs }),
      cases,
      ...(failureMessages ? { failureMessages } : {}),
      ...(fileSourceTrace
        ? { sourceTrace: cloneSourceTrace(fileSourceTrace, path) }
        : {}),
    };
  });
  const seenFileIds = new Set<string>();
  const seenFilePaths = new Set<string>();
  for (const file of files) {
    if (seenFileIds.has(file.fileId) || seenFilePaths.has(file.path)) {
      throw new VitestExecutionTestReportError(
        `Vitest report contains duplicate mapped file identity: ${file.path}.`
      );
    }
    seenFileIds.add(file.fileId);
    seenFilePaths.add(file.path);
  }
  files.sort((left, right) => compareText(left.fileId, right.fileId));
  if (totalCases === 0) {
    throw new VitestExecutionTestReportError(
      'Vitest JSON report did not contain any test cases.'
    );
  }
  const caseStatuses = files.flatMap((file) =>
    file.cases.map((testCase) => testCase.status)
  );
  if (
    caseStatuses.every((status) => status === 'skipped' || status === 'todo')
  ) {
    throw new VitestExecutionTestReportError(
      'Vitest JSON report contained only skipped or todo test cases.'
    );
  }

  const startedAt = finiteNumber(raw.startTime);
  const failureMessages = boundedFailureMessages(
    raw.failureMessages,
    'root report'
  );
  const report = createExecutionTestReport({
    reportId: input.reportId,
    tool: { name: 'vitest', version: toolVersion },
    ...(startedAt === undefined ? {} : { startedAt }),
    completedAt: input.completedAt,
    files,
    ...(failureMessages ? { failureMessages } : {}),
  });
  const passed = report.status === 'passed';
  if (raw.success !== undefined && raw.success !== passed) {
    throw new VitestExecutionTestReportError(
      'Vitest success flag and canonical report status diverged.'
    );
  }
  if (input.exitCode !== undefined && (input.exitCode === 0) !== passed) {
    throw new VitestExecutionTestReportError(
      'Vitest process exit code and canonical report status diverged.'
    );
  }
  return report;
};
