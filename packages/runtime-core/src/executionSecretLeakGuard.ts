import type {
  DiagnosticTargetRef,
  ProdivixDiagnostic,
} from '@prodivix/diagnostics';
import { utf8ToBytes } from '@noble/hashes/utils.js';

export const EXECUTION_SECRET_REDACTION_MARKER = '[REDACTED]' as const;
export const EXECUTION_SECRET_LEAK_DIAGNOSTIC_CODE = 'EXE-5004' as const;
export const EXECUTION_SECRET_LEAK_FAILURE_CODE =
  'EXECUTION_SECRET_LEAK_BLOCKED' as const;
export const EXECUTION_SECRET_LEAK_REASON = 'secret-material-detected' as const;

export const EXECUTION_SECRET_LEAK_SURFACES = Object.freeze([
  'request',
  'snapshot',
  'cache-key',
  'log',
  'diagnostic',
  'trace',
  'artifact-descriptor',
  'artifact-content',
  'test-report',
  'console-copy',
  'terminal',
  'crash',
] as const);

export type ExecutionSecretLeakSurface =
  (typeof EXECUTION_SECRET_LEAK_SURFACES)[number];

export type ExecutionSecretLeakInspection =
  | Readonly<{ safe: true }>
  | Readonly<{
      safe: false;
      surface: ExecutionSecretLeakSurface;
      reason: 'secret-canary' | 'uninspectable';
    }>;

export type ExecutionSecretRedaction = Readonly<{
  value: string;
  redacted: boolean;
}>;

export type ExecutionSecretTextStreamRedactor = Readonly<{
  push(value: string): ExecutionSecretRedaction;
  flush(): ExecutionSecretRedaction;
}>;

export type ExecutionSecretLeakGuard = Readonly<{
  inspectText(
    surface: ExecutionSecretLeakSurface,
    value: string
  ): ExecutionSecretLeakInspection;
  inspectBytes(
    surface: ExecutionSecretLeakSurface,
    value: Uint8Array
  ): ExecutionSecretLeakInspection;
  inspectValue(
    surface: ExecutionSecretLeakSurface,
    value: unknown
  ): ExecutionSecretLeakInspection;
  redactText(value: string): ExecutionSecretRedaction;
}>;

export type CreateExecutionSecretLeakGuardInput = Readonly<{
  secretValues: readonly string[];
}>;

type ByteMatcherNode = {
  readonly transitions: Map<number, number>;
  failure: number;
  match: boolean;
};

const safeInspection = Object.freeze({ safe: true as const });
const maximumSecretValues = 64;
const maximumSecretBytes = 64 * 1024;
const maximumInspectionDepth = 64;
const maximumInspectionNodes = 100_000;
const minimumSecretLength = 4;

const unsafeInspection = (
  surface: ExecutionSecretLeakSurface,
  reason: 'secret-canary' | 'uninspectable'
): ExecutionSecretLeakInspection =>
  Object.freeze({ safe: false, surface, reason });

const normalizeSecretValues = (
  values: readonly string[]
): readonly string[] => {
  if (
    !Array.isArray(values) ||
    values.some((value) => typeof value !== 'string')
  )
    throw new TypeError(
      'Execution Secret guard protected values must be strings.'
    );
  const normalized = [
    ...new Set(values.filter((value) => value.length >= minimumSecretLength)),
  ].sort(
    (left, right) => right.length - left.length || left.localeCompare(right)
  );
  if (normalized.length > maximumSecretValues)
    throw new TypeError(
      'Execution Secret guard has too many protected values.'
    );
  const totalBytes = normalized.reduce(
    (sum, value) => sum + utf8ToBytes(value).byteLength,
    0
  );
  if (totalBytes > maximumSecretBytes)
    throw new TypeError(
      'Execution Secret guard protected values exceed their byte budget.'
    );
  return Object.freeze(normalized);
};

const redactSecretValues = (
  value: string,
  secretValues: readonly string[]
): ExecutionSecretRedaction => {
  let redacted = false;
  const output = secretValues.reduce((current, secret) => {
    if (!current.includes(secret)) return current;
    redacted = true;
    return current.split(secret).join(EXECUTION_SECRET_REDACTION_MARKER);
  }, value);
  return Object.freeze({ value: output, redacted });
};

const longestSecretPrefixSuffix = (
  value: string,
  secretValues: readonly string[]
): number => {
  let retained = 0;
  for (const secret of secretValues) {
    for (
      let length = Math.min(secret.length - 1, value.length);
      length > retained;
      length -= 1
    ) {
      if (value.endsWith(secret.slice(0, length))) {
        retained = length;
        break;
      }
    }
  }
  return retained;
};

/**
 * Redacts protected values across arbitrary transport chunk boundaries. Only a
 * suffix that can still become a protected value is retained between pushes.
 */
export const createExecutionSecretTextStreamRedactor = (
  input: CreateExecutionSecretLeakGuardInput
): ExecutionSecretTextStreamRedactor => {
  const secretValues = normalizeSecretValues(input.secretValues);
  let pending = '';
  return Object.freeze({
    push(value) {
      if (typeof value !== 'string')
        throw new TypeError('Execution Secret stream input must be a string.');
      const redaction = redactSecretValues(`${pending}${value}`, secretValues);
      const retainedLength = longestSecretPrefixSuffix(
        redaction.value,
        secretValues
      );
      pending = retainedLength ? redaction.value.slice(-retainedLength) : '';
      return Object.freeze({
        value: retainedLength
          ? redaction.value.slice(0, -retainedLength)
          : redaction.value,
        redacted: redaction.redacted,
      });
    },
    flush() {
      const redaction = redactSecretValues(pending, secretValues);
      pending = '';
      return redaction;
    },
  });
};

const buildByteMatcher = (patterns: readonly Uint8Array[]) => {
  const nodes: ByteMatcherNode[] = [
    { transitions: new Map(), failure: 0, match: false },
  ];
  patterns.forEach((pattern) => {
    let nodeIndex = 0;
    pattern.forEach((byte) => {
      const existing = nodes[nodeIndex]!.transitions.get(byte);
      if (existing !== undefined) {
        nodeIndex = existing;
        return;
      }
      const created = nodes.length;
      nodes.push({ transitions: new Map(), failure: 0, match: false });
      nodes[nodeIndex]!.transitions.set(byte, created);
      nodeIndex = created;
    });
    nodes[nodeIndex]!.match = true;
  });

  const queue = [...nodes[0]!.transitions.values()];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const parentIndex = queue[cursor]!;
    const parent = nodes[parentIndex]!;
    parent.transitions.forEach((childIndex, byte) => {
      queue.push(childIndex);
      let fallback = parent.failure;
      while (fallback !== 0 && !nodes[fallback]!.transitions.has(byte))
        fallback = nodes[fallback]!.failure;
      const candidate = nodes[fallback]!.transitions.get(byte);
      const child = nodes[childIndex]!;
      child.failure = candidate ?? 0;
      child.match ||= nodes[child.failure]!.match;
    });
  }

  return (value: Uint8Array): boolean => {
    let nodeIndex = 0;
    for (const byte of value) {
      while (nodeIndex !== 0 && !nodes[nodeIndex]!.transitions.has(byte))
        nodeIndex = nodes[nodeIndex]!.failure;
      nodeIndex = nodes[nodeIndex]!.transitions.get(byte) ?? 0;
      if (nodes[nodeIndex]!.match) return true;
    }
    return false;
  };
};

/**
 * Holds protected material only inside one runtime-owned closure. Decisions
 * expose the output surface and reason, never the matched value or position.
 */
export const createExecutionSecretLeakGuard = (
  input: CreateExecutionSecretLeakGuardInput
): ExecutionSecretLeakGuard => {
  const secretValues = normalizeSecretValues(input.secretValues);
  const containsText = (value: string): boolean =>
    secretValues.some((secret) => value.includes(secret));
  const containsBytes = buildByteMatcher(
    secretValues.map((value) => utf8ToBytes(value))
  );

  const inspectText = (
    surface: ExecutionSecretLeakSurface,
    value: string
  ): ExecutionSecretLeakInspection =>
    containsText(value)
      ? unsafeInspection(surface, 'secret-canary')
      : safeInspection;

  const inspectBytes = (
    surface: ExecutionSecretLeakSurface,
    value: Uint8Array
  ): ExecutionSecretLeakInspection =>
    containsBytes(value)
      ? unsafeInspection(surface, 'secret-canary')
      : safeInspection;

  const inspectValue = (
    surface: ExecutionSecretLeakSurface,
    value: unknown
  ): ExecutionSecretLeakInspection => {
    const visited = new Set<object>();
    let inspectedNodes = 0;
    const visit = (
      entry: unknown,
      depth: number
    ): 'safe' | 'secret-canary' | 'uninspectable' => {
      inspectedNodes += 1;
      if (
        inspectedNodes > maximumInspectionNodes ||
        depth > maximumInspectionDepth
      )
        return 'uninspectable';
      if (typeof entry === 'string')
        return containsText(entry) ? 'secret-canary' : 'safe';
      if (
        entry === null ||
        entry === undefined ||
        typeof entry === 'boolean' ||
        typeof entry === 'number'
      )
        return 'safe';
      if (
        typeof entry === 'bigint' ||
        typeof entry === 'function' ||
        typeof entry === 'symbol'
      )
        return 'uninspectable';
      if (entry instanceof Uint8Array)
        return containsBytes(entry) ? 'secret-canary' : 'safe';
      if (typeof entry !== 'object') return 'uninspectable';
      if (visited.has(entry)) return 'safe';
      visited.add(entry);

      let descriptors: PropertyDescriptorMap;
      let symbols: readonly symbol[];
      try {
        const prototype = Object.getPrototypeOf(entry) as unknown;
        if (
          !Array.isArray(entry) &&
          prototype !== Object.prototype &&
          prototype !== null
        )
          return 'uninspectable';
        descriptors = Object.getOwnPropertyDescriptors(entry);
        symbols = Object.getOwnPropertySymbols(entry);
      } catch {
        return 'uninspectable';
      }
      if (symbols.length) return 'uninspectable';
      for (const [key, descriptor] of Object.entries(descriptors)) {
        if (containsText(key)) return 'secret-canary';
        if (!('value' in descriptor)) return 'uninspectable';
        const result = visit(descriptor.value, depth + 1);
        if (result !== 'safe') return result;
      }
      return 'safe';
    };
    const result = visit(value, 0);
    return result === 'safe'
      ? safeInspection
      : unsafeInspection(surface, result);
  };

  return Object.freeze({
    inspectText,
    inspectBytes,
    inspectValue,
    redactText(value) {
      return redactSecretValues(value, secretValues);
    },
  });
};

export const createExecutionSecretLeakDiagnostic = (
  input: Readonly<{
    surface?: ExecutionSecretLeakSurface;
    targetRef?: DiagnosticTargetRef;
  }> = {}
): ProdivixDiagnostic =>
  Object.freeze({
    code: EXECUTION_SECRET_LEAK_DIAGNOSTIC_CODE,
    severity: 'fatal',
    domain: 'backend',
    message:
      'Execution output was blocked because it contained protected material.',
    hint: 'Review the runtime output path and Secret injection boundary before starting a new execution.',
    retryable: false,
    ...(input.targetRef
      ? { targetRef: Object.freeze({ ...input.targetRef }) }
      : {}),
    ...(input.surface
      ? { meta: Object.freeze({ surface: input.surface }) }
      : {}),
  });
