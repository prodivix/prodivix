import {
  createExecutionConsoleSnapshot,
  redactExecutionConsoleText,
  type ExecutionConsoleCategory,
  type ExecutionConsoleLevel,
  type ExecutionSourceTrace,
  type ExecutionSessionSnapshot,
} from '@prodivix/runtime-core';

export type ExecutionConsoleFilter =
  'all' | 'errors' | 'application' | 'system';

export type ExecutionConsoleDiagnostic = Readonly<{
  code: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  path?: string;
}>;

export type ExecutionConsoleLine = Readonly<{
  id: string;
  category: ExecutionConsoleCategory;
  level: ExecutionConsoleLevel;
  label: string;
  message: string;
  recordedAt?: number;
  detail?: string;
  redacted: boolean;
  truncated: boolean;
  sourceTrace?: readonly ExecutionSourceTrace[];
}>;

export type ExecutionConsoleView = Readonly<{
  lines: readonly ExecutionConsoleLine[];
  retainedBytes: number;
  droppedRecords: number;
  truncated: boolean;
}>;

const maximumDetailCharacters = 4_000;
const maximumCopyCharacters = 128 * 1024;

const serializeDetail = (value: unknown): string | undefined => {
  if (value === undefined) return undefined;
  try {
    const serialized = JSON.stringify(value);
    return serialized.length > maximumDetailCharacters
      ? `${serialized.slice(0, maximumDetailCharacters)}…`
      : serialized;
  } catch {
    return '[Unserializable console detail]';
  }
};

const matchesFilter = (
  line: ExecutionConsoleLine,
  filter: ExecutionConsoleFilter
): boolean => {
  if (filter === 'errors') return line.level === 'error';
  if (filter === 'application') return line.category === 'application';
  if (filter === 'system') return line.category !== 'application';
  return true;
};

export const createExecutionConsoleView = (input: {
  session?: ExecutionSessionSnapshot;
  diagnostics?: readonly ExecutionConsoleDiagnostic[];
  filter?: ExecutionConsoleFilter;
}): ExecutionConsoleView => {
  const snapshot = input.session
    ? createExecutionConsoleSnapshot({ session: input.session })
    : undefined;
  const eventLines = (snapshot?.records ?? []).map((record) => {
    const detailArguments =
      record.arguments[0] === record.message
        ? record.arguments.slice(1)
        : record.arguments;
    return Object.freeze({
      id: record.recordId,
      category: record.category,
      level: record.level,
      label: record.label,
      message: record.message,
      recordedAt: record.recordedAt,
      ...(detailArguments.length
        ? { detail: serializeDetail(detailArguments) }
        : {}),
      redacted: record.redacted,
      truncated: record.truncated,
      ...(record.sourceTrace ? { sourceTrace: record.sourceTrace } : {}),
    });
  });
  const diagnosticLines = (input.diagnostics ?? []).map((diagnostic, index) => {
    const message = redactExecutionConsoleText(diagnostic.message);
    const detail = diagnostic.path
      ? redactExecutionConsoleText(diagnostic.path)
      : undefined;
    return Object.freeze({
      id: `preflight:${diagnostic.code}:${index}`,
      category: 'diagnostic' as const,
      level: diagnostic.severity,
      label: diagnostic.code,
      message: message.value,
      ...(detail ? { detail: detail.value } : {}),
      redacted: message.redacted || (detail?.redacted ?? false),
      truncated: false,
    });
  });
  const filter = input.filter ?? 'all';
  const lines = Object.freeze(
    [...eventLines, ...diagnosticLines].filter((line) =>
      matchesFilter(line, filter)
    )
  );
  return Object.freeze({
    lines,
    retainedBytes: snapshot?.retainedBytes ?? 0,
    droppedRecords: snapshot?.droppedRecords ?? 0,
    truncated: snapshot?.truncated ?? false,
  });
};

export const createExecutionConsoleLines = (
  input: Parameters<typeof createExecutionConsoleView>[0]
): readonly ExecutionConsoleLine[] => createExecutionConsoleView(input).lines;

/** Creates a bounded copy payload exclusively from already-sanitized Console records. */
export const createExecutionConsoleCopyText = (
  lines: readonly ExecutionConsoleLine[]
): string => {
  const text = lines
    .map((line) => {
      const timestamp =
        line.recordedAt === undefined
          ? 'preflight'
          : new Date(line.recordedAt).toISOString();
      const markers = [
        ...(line.redacted ? ['redacted'] : []),
        ...(line.truncated ? ['truncated'] : []),
      ];
      return `${timestamp} ${line.level.toUpperCase()} ${line.category}/${line.label}${markers.length ? ` [${markers.join(',')}]` : ''} ${line.message}${line.detail ? ` ${line.detail}` : ''}`;
    })
    .join('\n');
  const bounded =
    text.length > maximumCopyCharacters
      ? `${text.slice(0, maximumCopyCharacters)}\n[Console copy truncated]`
      : text;
  return redactExecutionConsoleText(bounded).value;
};
