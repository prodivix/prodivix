import { utf8ToBytes } from '@noble/hashes/utils.js';
import type { DiagnosticTargetRef, SourceSpan } from '@prodivix/diagnostics';
import type { ExecutionSourceTrace, ExecutionValue } from './execution.types';

export const EXECUTION_TEST_REPORT_TRACE_NAME = 'test.report' as const;
export const EXECUTION_TEST_REPORT_MEDIA_TYPE =
  'application/vnd.prodivix.test-report+json' as const;

export const EXECUTION_TEST_STATUSES = Object.freeze([
  'passed',
  'failed',
  'skipped',
  'todo',
] as const);

/**
 * Canonical report limits apply again at the transport-neutral boundary. Tool
 * adapters may be stricter, but a Remote producer cannot bypass these bounds.
 * Oversized reports fail closed; they are never re-labelled as assertion
 * failures or published as partial reports.
 */
export const EXECUTION_TEST_REPORT_LIMITS = Object.freeze({
  maxEncodedBytes: 4_000_000,
  maxFiles: 256,
  maxCases: 4_096,
  maxFailureMessages: 512,
  maxFailureMessagesPerOwner: 16,
  maxSourceTracePerOwner: 8,
  maxTextBytes: 16_384,
});

export type ExecutionTestStatus = (typeof EXECUTION_TEST_STATUSES)[number];

export type ExecutionTestTool = Readonly<{
  name: string;
  version?: string;
}>;

export type ExecutionTestCaseResult = Readonly<{
  caseId: string;
  name: string;
  fullName?: string;
  status: ExecutionTestStatus;
  durationMs?: number;
  failureMessages: readonly string[];
  sourceTrace?: readonly ExecutionSourceTrace[];
}>;

export type ExecutionTestCaseResultInput = Omit<
  ExecutionTestCaseResult,
  'failureMessages' | 'sourceTrace'
> &
  Readonly<{
    failureMessages?: readonly string[];
    sourceTrace?: readonly ExecutionSourceTrace[];
  }>;

export type ExecutionTestFileResult = Readonly<{
  fileId: string;
  path: string;
  status: ExecutionTestStatus;
  durationMs?: number;
  cases: readonly ExecutionTestCaseResult[];
  failureMessages: readonly string[];
  sourceTrace?: readonly ExecutionSourceTrace[];
}>;

export type ExecutionTestFileResultInput = Omit<
  ExecutionTestFileResult,
  'cases' | 'failureMessages' | 'sourceTrace'
> &
  Readonly<{
    cases: readonly ExecutionTestCaseResultInput[];
    failureMessages?: readonly string[];
    sourceTrace?: readonly ExecutionSourceTrace[];
  }>;

export type ExecutionTestReportSummary = Readonly<{
  totalFiles: number;
  passedFiles: number;
  failedFiles: number;
  skippedFiles: number;
  todoFiles: number;
  totalCases: number;
  passedCases: number;
  failedCases: number;
  skippedCases: number;
  todoCases: number;
}>;

export type ExecutionTestReport = Readonly<{
  kind: 'test-report';
  reportId: string;
  status: 'passed' | 'failed';
  tool: ExecutionTestTool;
  startedAt?: number;
  completedAt?: number;
  durationMs?: number;
  summary: ExecutionTestReportSummary;
  files: readonly ExecutionTestFileResult[];
  failureMessages: readonly string[];
}>;

export type ExecutionTestReportInput = Readonly<{
  reportId: string;
  tool: ExecutionTestTool;
  startedAt?: number;
  completedAt?: number;
  files: readonly ExecutionTestFileResultInput[];
  failureMessages?: readonly string[];
}>;

const statuses = new Set<ExecutionTestStatus>(EXECUTION_TEST_STATUSES);

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype ||
    Object.getPrototypeOf(value) === null);

const hasExactKeys = (
  value: Record<string, unknown>,
  allowed: readonly string[]
): boolean => {
  const keys = Object.keys(value);
  return (
    keys.length <= allowed.length && keys.every((key) => allowed.includes(key))
  );
};

const fitsTextBudget = (value: string): boolean =>
  utf8ToBytes(value).byteLength <= EXECUTION_TEST_REPORT_LIMITS.maxTextBytes;

const normalizeIdentifier = (value: string, label: string): string => {
  if (typeof value !== 'string') {
    throw new TypeError(`${label} must be a string.`);
  }
  const normalized = value.trim();
  if (!normalized) throw new TypeError(`${label} must not be empty.`);
  if (!fitsTextBudget(normalized)) {
    throw new TypeError(
      `${label} exceeds the ${EXECUTION_TEST_REPORT_LIMITS.maxTextBytes} byte limit.`
    );
  }
  return normalized;
};

const normalizeOptionalIdentifier = (
  value: string | undefined,
  label: string
): string | undefined =>
  value === undefined ? undefined : normalizeIdentifier(value, label);

const normalizeDuration = (
  value: number | undefined,
  label: string
): number | undefined => {
  if (value === undefined) return undefined;
  if (!Number.isFinite(value) || value < 0) {
    throw new TypeError(`${label} must be a finite non-negative number.`);
  }
  return value;
};

const normalizeTimestamp = (
  value: number | undefined,
  label: string
): number | undefined => {
  if (value === undefined) return undefined;
  if (!Number.isFinite(value) || value < 0) {
    throw new TypeError(`${label} must be a finite non-negative number.`);
  }
  return value;
};

const normalizeStatus = (
  value: ExecutionTestStatus,
  label: string
): ExecutionTestStatus => {
  if (!statuses.has(value)) {
    throw new TypeError(`${label} contains an unsupported status: ${value}`);
  }
  return value;
};

const normalizeFailureMessages = (
  messages: readonly string[] | undefined,
  label: string
): readonly string[] => {
  if (
    (messages?.length ?? 0) >
    EXECUTION_TEST_REPORT_LIMITS.maxFailureMessagesPerOwner
  ) {
    throw new TypeError(
      `${label} exceeds the ${EXECUTION_TEST_REPORT_LIMITS.maxFailureMessagesPerOwner} message per-owner limit.`
    );
  }
  return Object.freeze(
    (messages ?? []).map((message, index) =>
      normalizeIdentifier(message, `${label}[${index}]`)
    )
  );
};

const cloneSourceTrace = (
  traces: readonly ExecutionSourceTrace[] | undefined
): readonly ExecutionSourceTrace[] | undefined => {
  if (traces === undefined) return undefined;
  if (traces.length > EXECUTION_TEST_REPORT_LIMITS.maxSourceTracePerOwner) {
    throw new TypeError(
      `Execution test sourceTrace exceeds the ${EXECUTION_TEST_REPORT_LIMITS.maxSourceTracePerOwner} entry per-owner limit.`
    );
  }
  return Object.freeze(
    traces.map((trace, index) => {
      if (!isPlainRecord(trace) || !isDiagnosticTargetRef(trace.sourceRef)) {
        throw new TypeError(
          `Execution test sourceTrace[${index}] has an invalid sourceRef.`
        );
      }
      if (trace.sourceSpan !== undefined && !isSourceSpan(trace.sourceSpan)) {
        throw new TypeError(
          `Execution test sourceTrace[${index}] has an invalid sourceSpan.`
        );
      }
      const label = normalizeOptionalIdentifier(
        trace.label,
        `Execution test sourceTrace[${index}] label`
      );
      return Object.freeze({
        sourceRef: Object.freeze({ ...trace.sourceRef }),
        ...(trace.sourceSpan
          ? { sourceSpan: Object.freeze({ ...trace.sourceSpan }) }
          : {}),
        ...(label ? { label } : {}),
      });
    })
  );
};

const normalizeCase = (
  input: ExecutionTestCaseResultInput,
  fileLabel: string,
  index: number
): ExecutionTestCaseResult => {
  if (!isPlainRecord(input)) {
    throw new TypeError(`${fileLabel} case ${index} must be an object.`);
  }
  const status = normalizeStatus(
    input.status,
    `${fileLabel} case ${index} status`
  );
  const failureMessages = normalizeFailureMessages(
    input.failureMessages,
    `${fileLabel} case ${index} failureMessages`
  );
  if (status !== 'failed' && failureMessages.length) {
    throw new TypeError(
      `${fileLabel} case ${index} cannot contain failureMessages unless it failed.`
    );
  }
  const fullName = normalizeOptionalIdentifier(
    input.fullName,
    `${fileLabel} case ${index} fullName`
  );
  const durationMs = normalizeDuration(
    input.durationMs,
    `${fileLabel} case ${index} durationMs`
  );
  const sourceTrace = cloneSourceTrace(input.sourceTrace);
  return Object.freeze({
    caseId: normalizeIdentifier(
      input.caseId,
      `${fileLabel} case ${index} caseId`
    ),
    name: normalizeIdentifier(input.name, `${fileLabel} case ${index} name`),
    ...(fullName ? { fullName } : {}),
    status,
    ...(durationMs === undefined ? {} : { durationMs }),
    failureMessages,
    ...(sourceTrace ? { sourceTrace } : {}),
  });
};

const normalizeFile = (
  input: ExecutionTestFileResultInput,
  index: number
): ExecutionTestFileResult => {
  if (!isPlainRecord(input) || !Array.isArray(input.cases)) {
    throw new TypeError(`Execution test file ${index} must contain cases.`);
  }
  const fileId = normalizeIdentifier(
    input.fileId,
    `Execution test file ${index} fileId`
  );
  const status = normalizeStatus(
    input.status,
    `Execution test file ${index} status`
  );
  const cases = Object.freeze(
    input.cases.map((testCase, caseIndex) =>
      normalizeCase(testCase, `Execution test file ${fileId}`, caseIndex)
    )
  );
  const seenCaseIds = new Set<string>();
  cases.forEach((testCase) => {
    if (seenCaseIds.has(testCase.caseId)) {
      throw new TypeError(
        `Execution test file ${fileId} contains duplicate caseId: ${testCase.caseId}`
      );
    }
    seenCaseIds.add(testCase.caseId);
  });
  const failureMessages = normalizeFailureMessages(
    input.failureMessages,
    `Execution test file ${fileId} failureMessages`
  );
  if (
    status !== 'failed' &&
    (failureMessages.length ||
      cases.some((testCase) => testCase.status === 'failed'))
  ) {
    throw new TypeError(
      `Execution test file ${fileId} must be failed when it contains failures.`
    );
  }
  const durationMs = normalizeDuration(
    input.durationMs,
    `Execution test file ${fileId} durationMs`
  );
  const sourceTrace = cloneSourceTrace(input.sourceTrace);
  return Object.freeze({
    fileId,
    path: normalizeIdentifier(input.path, `Execution test file ${fileId} path`),
    status,
    ...(durationMs === undefined ? {} : { durationMs }),
    cases,
    failureMessages,
    ...(sourceTrace ? { sourceTrace } : {}),
  });
};

const createSummary = (
  files: readonly ExecutionTestFileResult[]
): ExecutionTestReportSummary => {
  const cases = files.flatMap((file) => file.cases);
  const countFiles = (status: ExecutionTestStatus) =>
    files.filter((file) => file.status === status).length;
  const countCases = (status: ExecutionTestStatus) =>
    cases.filter((testCase) => testCase.status === status).length;
  return Object.freeze({
    totalFiles: files.length,
    passedFiles: countFiles('passed'),
    failedFiles: countFiles('failed'),
    skippedFiles: countFiles('skipped'),
    todoFiles: countFiles('todo'),
    totalCases: cases.length,
    passedCases: countCases('passed'),
    failedCases: countCases('failed'),
    skippedCases: countCases('skipped'),
    todoCases: countCases('todo'),
  });
};

/**
 * Converts one tool-specific test result into the immutable transport contract
 * shared by Browser and Remote ExecutionProviders and the Test product surface.
 */
export const createExecutionTestReport = (
  input: ExecutionTestReportInput
): ExecutionTestReport => {
  if (!isPlainRecord(input) || !isPlainRecord(input.tool)) {
    throw new TypeError('Execution test report input must be an object.');
  }
  if (!Array.isArray(input.files)) {
    throw new TypeError('Execution test report files must be an array.');
  }
  if (input.files.length > EXECUTION_TEST_REPORT_LIMITS.maxFiles) {
    throw new TypeError(
      `Execution test report exceeds the ${EXECUTION_TEST_REPORT_LIMITS.maxFiles} file limit.`
    );
  }
  const startedAt = normalizeTimestamp(
    input.startedAt,
    'Execution test report startedAt'
  );
  const completedAt = normalizeTimestamp(
    input.completedAt,
    'Execution test report completedAt'
  );
  if (
    startedAt !== undefined &&
    completedAt !== undefined &&
    completedAt < startedAt
  ) {
    throw new TypeError(
      'Execution test report completedAt must not precede startedAt.'
    );
  }
  const files = Object.freeze(
    input.files.map((file, index) => normalizeFile(file, index))
  );
  const totalCases = files.reduce(
    (total, file) => total + file.cases.length,
    0
  );
  if (totalCases > EXECUTION_TEST_REPORT_LIMITS.maxCases) {
    throw new TypeError(
      `Execution test report exceeds the ${EXECUTION_TEST_REPORT_LIMITS.maxCases} case limit.`
    );
  }
  const seenFileIds = new Set<string>();
  const seenPaths = new Set<string>();
  files.forEach((file) => {
    if (seenFileIds.has(file.fileId)) {
      throw new TypeError(
        `Execution test report contains duplicate fileId: ${file.fileId}`
      );
    }
    if (seenPaths.has(file.path)) {
      throw new TypeError(
        `Execution test report contains duplicate file path: ${file.path}`
      );
    }
    seenFileIds.add(file.fileId);
    seenPaths.add(file.path);
  });
  const failureMessages = normalizeFailureMessages(
    input.failureMessages,
    'Execution test report failureMessages'
  );
  const summary = createSummary(files);
  const failed = Boolean(failureMessages.length || summary.failedFiles);
  const toolVersion = normalizeOptionalIdentifier(
    input.tool.version,
    'Execution test tool version'
  );
  const report = Object.freeze({
    kind: 'test-report',
    reportId: normalizeIdentifier(
      input.reportId,
      'Execution test report reportId'
    ),
    status: failed ? 'failed' : 'passed',
    tool: Object.freeze({
      name: normalizeIdentifier(input.tool.name, 'Execution test tool name'),
      ...(toolVersion ? { version: toolVersion } : {}),
    }),
    ...(startedAt === undefined ? {} : { startedAt }),
    ...(completedAt === undefined ? {} : { completedAt }),
    ...(startedAt === undefined || completedAt === undefined
      ? {}
      : { durationMs: completedAt - startedAt }),
    summary,
    files,
    failureMessages,
  });
  const totalFailureMessages =
    report.failureMessages.length +
    report.files.reduce(
      (fileTotal, file) =>
        fileTotal +
        file.failureMessages.length +
        file.cases.reduce(
          (caseTotal, testCase) => caseTotal + testCase.failureMessages.length,
          0
        ),
      0
    );
  if (totalFailureMessages > EXECUTION_TEST_REPORT_LIMITS.maxFailureMessages) {
    throw new TypeError(
      `Execution test report exceeds the ${EXECUTION_TEST_REPORT_LIMITS.maxFailureMessages} failure message limit.`
    );
  }
  if (
    utf8ToBytes(JSON.stringify(report)).byteLength >
    EXECUTION_TEST_REPORT_LIMITS.maxEncodedBytes
  ) {
    throw new TypeError(
      `Execution test report exceeds the ${EXECUTION_TEST_REPORT_LIMITS.maxEncodedBytes} byte limit.`
    );
  }
  return report;
};

const isNormalizedIdentifier = (value: unknown): value is string =>
  typeof value === 'string' &&
  Boolean(value) &&
  value === value.trim() &&
  fitsTextBudget(value);

const isNonNegativeFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

const isPositiveSafeInteger = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) >= 1;

const isSourceSpan = (value: unknown): value is SourceSpan => {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, [
      'artifactId',
      'startLine',
      'startColumn',
      'endLine',
      'endColumn',
    ]) ||
    !isNormalizedIdentifier(value.artifactId) ||
    !isPositiveSafeInteger(value.startLine) ||
    !isPositiveSafeInteger(value.startColumn) ||
    !isPositiveSafeInteger(value.endLine) ||
    !isPositiveSafeInteger(value.endColumn)
  ) {
    return false;
  }
  return (
    value.endLine > value.startLine ||
    (value.endLine === value.startLine && value.endColumn >= value.startColumn)
  );
};

const hasStrings = (
  value: Record<string, unknown>,
  fields: readonly string[]
): boolean => fields.every((field) => isNormalizedIdentifier(value[field]));

const isDiagnosticTargetRef = (
  value: unknown
): value is DiagnosticTargetRef => {
  if (!isPlainRecord(value) || !isNormalizedIdentifier(value.kind)) {
    return false;
  }
  switch (value.kind) {
    case 'workspace':
      return (
        hasExactKeys(value, ['kind', 'workspaceId']) &&
        hasStrings(value, ['workspaceId'])
      );
    case 'workspace-node':
      return (
        hasExactKeys(value, ['kind', 'workspaceId', 'nodeId']) &&
        hasStrings(value, ['workspaceId', 'nodeId'])
      );
    case 'document':
      return (
        hasExactKeys(value, ['kind', 'workspaceId', 'documentId']) &&
        hasStrings(value, ['documentId']) &&
        (value.workspaceId === undefined ||
          isNormalizedIdentifier(value.workspaceId))
      );
    case 'pir-node':
      return (
        hasExactKeys(value, ['kind', 'documentId', 'nodeId']) &&
        hasStrings(value, ['documentId', 'nodeId'])
      );
    case 'inspector-field':
      return (
        hasExactKeys(value, ['kind', 'documentId', 'nodeId', 'fieldPath']) &&
        hasStrings(value, ['documentId', 'nodeId', 'fieldPath'])
      );
    case 'route':
      return (
        hasExactKeys(value, ['kind', 'routeId']) &&
        hasStrings(value, ['routeId'])
      );
    case 'nodegraph-node':
      return (
        hasExactKeys(value, ['kind', 'documentId', 'nodeId']) &&
        hasStrings(value, ['documentId', 'nodeId'])
      );
    case 'nodegraph-port':
      return (
        hasExactKeys(value, ['kind', 'documentId', 'nodeId', 'portId']) &&
        hasStrings(value, ['documentId', 'nodeId', 'portId'])
      );
    case 'animation-timeline':
      return (
        hasExactKeys(value, ['kind', 'documentId', 'timelineId']) &&
        hasStrings(value, ['documentId', 'timelineId'])
      );
    case 'animation-track':
      return (
        hasExactKeys(value, [
          'kind',
          'documentId',
          'timelineId',
          'bindingId',
          'trackId',
        ]) &&
        hasStrings(value, ['documentId', 'timelineId', 'bindingId', 'trackId'])
      );
    case 'data-source':
      return (
        hasExactKeys(value, ['kind', 'documentId']) &&
        hasStrings(value, ['documentId'])
      );
    case 'data-operation':
      return (
        hasExactKeys(value, ['kind', 'documentId', 'operationId']) &&
        hasStrings(value, ['documentId', 'operationId'])
      );
    case 'code-artifact':
      return (
        hasExactKeys(value, ['kind', 'artifactId']) &&
        hasStrings(value, ['artifactId'])
      );
    case 'operation':
      return (
        hasExactKeys(value, ['kind', 'operation']) &&
        hasStrings(value, ['operation'])
      );
    case 'theme-token':
      return (
        hasExactKeys(value, ['kind', 'themeId', 'tokenPath']) &&
        hasStrings(value, ['themeId', 'tokenPath'])
      );
    case 'viewport':
      return (
        hasExactKeys(value, ['kind', 'routeId', 'width', 'height']) &&
        (value.routeId === undefined ||
          isNormalizedIdentifier(value.routeId)) &&
        isNonNegativeFiniteNumber(value.width) &&
        isNonNegativeFiniteNumber(value.height)
      );
    case 'runtime-dom':
      return (
        hasExactKeys(value, ['kind', 'routeId', 'stablePath']) &&
        (value.routeId === undefined ||
          isNormalizedIdentifier(value.routeId)) &&
        hasStrings(value, ['stablePath'])
      );
    case 'component-slot':
      return (
        hasExactKeys(value, ['kind', 'documentId', 'nodeId', 'slotName']) &&
        hasStrings(value, ['documentId', 'nodeId', 'slotName'])
      );
    default:
      return false;
  }
};

const isSourceTrace = (value: unknown): value is ExecutionSourceTrace =>
  isPlainRecord(value) &&
  hasExactKeys(value, ['sourceRef', 'sourceSpan', 'label']) &&
  isDiagnosticTargetRef(value.sourceRef) &&
  (value.sourceSpan === undefined || isSourceSpan(value.sourceSpan)) &&
  (value.label === undefined || isNormalizedIdentifier(value.label));

const isFailureMessages = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && value.every(isNormalizedIdentifier);

const isTestCaseResult = (value: unknown): value is ExecutionTestCaseResult =>
  isPlainRecord(value) &&
  hasExactKeys(value, [
    'caseId',
    'name',
    'fullName',
    'status',
    'durationMs',
    'failureMessages',
    'sourceTrace',
  ]) &&
  isNormalizedIdentifier(value.caseId) &&
  isNormalizedIdentifier(value.name) &&
  (value.fullName === undefined || isNormalizedIdentifier(value.fullName)) &&
  statuses.has(value.status as ExecutionTestStatus) &&
  (value.durationMs === undefined ||
    isNonNegativeFiniteNumber(value.durationMs)) &&
  isFailureMessages(value.failureMessages) &&
  value.failureMessages.length <=
    EXECUTION_TEST_REPORT_LIMITS.maxFailureMessagesPerOwner &&
  (value.status === 'failed' || value.failureMessages.length === 0) &&
  (value.sourceTrace === undefined ||
    (Array.isArray(value.sourceTrace) &&
      value.sourceTrace.length <=
        EXECUTION_TEST_REPORT_LIMITS.maxSourceTracePerOwner &&
      value.sourceTrace.every(isSourceTrace)));

const isTestFileResult = (value: unknown): value is ExecutionTestFileResult => {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, [
      'fileId',
      'path',
      'status',
      'durationMs',
      'cases',
      'failureMessages',
      'sourceTrace',
    ]) ||
    !isNormalizedIdentifier(value.fileId) ||
    !isNormalizedIdentifier(value.path) ||
    !statuses.has(value.status as ExecutionTestStatus) ||
    (value.durationMs !== undefined &&
      !isNonNegativeFiniteNumber(value.durationMs)) ||
    !Array.isArray(value.cases) ||
    !value.cases.every(isTestCaseResult) ||
    !isFailureMessages(value.failureMessages) ||
    value.failureMessages.length >
      EXECUTION_TEST_REPORT_LIMITS.maxFailureMessagesPerOwner ||
    (value.sourceTrace !== undefined &&
      (!Array.isArray(value.sourceTrace) ||
        value.sourceTrace.length >
          EXECUTION_TEST_REPORT_LIMITS.maxSourceTracePerOwner ||
        !value.sourceTrace.every(isSourceTrace)))
  ) {
    return false;
  }
  const caseIds = value.cases.map((testCase) => testCase.caseId);
  if (new Set(caseIds).size !== caseIds.length) return false;
  const hasFailures =
    value.failureMessages.length > 0 ||
    value.cases.some((testCase) => testCase.status === 'failed');
  return value.status === 'failed' || !hasFailures;
};

const summaryFields = Object.freeze([
  'totalFiles',
  'passedFiles',
  'failedFiles',
  'skippedFiles',
  'todoFiles',
  'totalCases',
  'passedCases',
  'failedCases',
  'skippedCases',
  'todoCases',
] as const);

const summaryEquals = (
  value: unknown,
  expected: ExecutionTestReportSummary
): value is ExecutionTestReportSummary =>
  isPlainRecord(value) &&
  hasExactKeys(value, summaryFields) &&
  summaryFields.every(
    (field) =>
      Number.isSafeInteger(value[field]) &&
      (value[field] as number) >= 0 &&
      value[field] === expected[field]
  );

/** Recognizes a complete canonical report without accepting stale summaries. */
export const isExecutionTestReport = (
  value: unknown
): value is ExecutionTestReport => {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, [
      'kind',
      'reportId',
      'status',
      'tool',
      'startedAt',
      'completedAt',
      'durationMs',
      'summary',
      'files',
      'failureMessages',
    ]) ||
    value.kind !== 'test-report' ||
    !isNormalizedIdentifier(value.reportId) ||
    (value.status !== 'passed' && value.status !== 'failed') ||
    !isPlainRecord(value.tool) ||
    !hasExactKeys(value.tool, ['name', 'version']) ||
    !isNormalizedIdentifier(value.tool.name) ||
    (value.tool.version !== undefined &&
      !isNormalizedIdentifier(value.tool.version)) ||
    (value.startedAt !== undefined &&
      !isNonNegativeFiniteNumber(value.startedAt)) ||
    (value.completedAt !== undefined &&
      !isNonNegativeFiniteNumber(value.completedAt)) ||
    !Array.isArray(value.files) ||
    value.files.length > EXECUTION_TEST_REPORT_LIMITS.maxFiles ||
    !value.files.every(isTestFileResult) ||
    !isFailureMessages(value.failureMessages) ||
    value.failureMessages.length >
      EXECUTION_TEST_REPORT_LIMITS.maxFailureMessagesPerOwner
  ) {
    return false;
  }
  if (
    value.startedAt !== undefined &&
    value.completedAt !== undefined &&
    value.completedAt < value.startedAt
  ) {
    return false;
  }
  const expectedDuration =
    value.startedAt === undefined || value.completedAt === undefined
      ? undefined
      : value.completedAt - value.startedAt;
  if (
    value.durationMs !== expectedDuration ||
    (value.durationMs !== undefined &&
      !isNonNegativeFiniteNumber(value.durationMs))
  ) {
    return false;
  }
  const fileIds = value.files.map((file) => file.fileId);
  const filePaths = value.files.map((file) => file.path);
  const totalCases = value.files.reduce(
    (total, file) => total + file.cases.length,
    0
  );
  const totalFailureMessages =
    value.failureMessages.length +
    value.files.reduce(
      (fileTotal, file) =>
        fileTotal +
        file.failureMessages.length +
        file.cases.reduce(
          (caseTotal, testCase) => caseTotal + testCase.failureMessages.length,
          0
        ),
      0
    );
  if (
    totalCases > EXECUTION_TEST_REPORT_LIMITS.maxCases ||
    totalFailureMessages > EXECUTION_TEST_REPORT_LIMITS.maxFailureMessages ||
    new Set(fileIds).size !== fileIds.length ||
    new Set(filePaths).size !== filePaths.length
  ) {
    return false;
  }
  try {
    if (
      utf8ToBytes(JSON.stringify(value)).byteLength >
      EXECUTION_TEST_REPORT_LIMITS.maxEncodedBytes
    ) {
      return false;
    }
  } catch {
    return false;
  }
  const expectedSummary = createSummary(value.files);
  if (!summaryEquals(value.summary, expectedSummary)) return false;
  const expectedStatus =
    value.failureMessages.length || expectedSummary.failedFiles
      ? 'failed'
      : 'passed';
  return value.status === expectedStatus;
};

/** Converts the canonical report into its transport-safe ExecutionValue form. */
export const toExecutionTestReportValue = (
  report: ExecutionTestReport
): ExecutionValue => {
  if (!isExecutionTestReport(report)) {
    throw new TypeError('Execution test report is not canonical.');
  }
  return report as unknown as ExecutionValue;
};

/** Reads a complete canonical report from an ExecutionValue payload. */
export const readExecutionTestReportValue = (
  value: unknown
): ExecutionTestReport | undefined =>
  isExecutionTestReport(value) ? value : undefined;
