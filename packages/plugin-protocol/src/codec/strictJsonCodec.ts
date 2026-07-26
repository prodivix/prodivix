import {
  createPluginDiagnostic,
  PLUGIN_DIAGNOSTIC_CODES,
  type JsonValue,
  type PluginDiagnostic,
} from '@prodivix/plugin-contracts';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import {
  parse,
  printParseErrorCode,
  visit,
  type ParseError,
} from 'jsonc-parser';
import {
  protocolFailure,
  protocolSuccess,
  type ProtocolResult,
} from '#protocol/result';

export type ProtocolJsonLimits = Readonly<{
  maxBytes: number;
  maxDepth: number;
  maxNodes: number;
}>;

export const DEFAULT_PROTOCOL_JSON_LIMITS: ProtocolJsonLimits = Object.freeze({
  maxBytes: 8 * 1024 * 1024,
  maxDepth: 48,
  maxNodes: 20_000,
});

const strictParseOptions = {
  allowEmptyContent: false,
  allowTrailingComma: false,
  disallowComments: true,
} as const;

const normalizeLimit = (value: number, fallback: number): number =>
  Number.isSafeInteger(value) && value > 0 ? value : fallback;

export const normalizeProtocolJsonLimits = (
  input: Partial<ProtocolJsonLimits> = {}
): ProtocolJsonLimits =>
  Object.freeze({
    maxBytes: normalizeLimit(
      input.maxBytes ?? 0,
      DEFAULT_PROTOCOL_JSON_LIMITS.maxBytes
    ),
    maxDepth: normalizeLimit(
      input.maxDepth ?? 0,
      DEFAULT_PROTOCOL_JSON_LIMITS.maxDepth
    ),
    maxNodes: normalizeLimit(
      input.maxNodes ?? 0,
      DEFAULT_PROTOCOL_JSON_LIMITS.maxNodes
    ),
  });

const malformed = (message: string, meta: Record<string, JsonValue> = {}) =>
  createPluginDiagnostic(
    PLUGIN_DIAGNOSTIC_CODES.MALFORMED_PROTOCOL_MESSAGE,
    message,
    meta
  );

const limitFailure = (
  message: string,
  limit: number,
  actual: number
): ProtocolResult<never> =>
  protocolFailure([
    createPluginDiagnostic(
      PLUGIN_DIAGNOSTIC_CODES.MALFORMED_PROTOCOL_MESSAGE,
      message,
      { limit, actual }
    ),
  ]);

const isWellFormedUnicode = (source: string): boolean => {
  for (let index = 0; index < source.length; index += 1) {
    const code = source.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = source.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return false;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return false;
    }
  }
  return true;
};

const objectKeyDiagnostics = (source: string): PluginDiagnostic[] => {
  const objectKeys: Array<Set<string>> = [];
  const diagnostics: PluginDiagnostic[] = [];
  visit(
    source,
    {
      onObjectBegin: () => {
        objectKeys.push(new Set());
      },
      onObjectProperty: (property, offset, length) => {
        // jsonc-parser assigns object properties with `parent[key] = value` on
        // a plain `{}`, so a prototype-mutating key would hide the whole
        // subtree from own-property consumers while schema validation still
        // walks it through the prototype chain.
        if (isUnsafeObjectKey(property)) {
          diagnostics.push(
            malformed(
              `Protocol message uses the reserved object key ${JSON.stringify(property)}.`,
              { offset, length }
            )
          );
          return;
        }
        const current = objectKeys.at(-1);
        if (!current?.has(property)) {
          current?.add(property);
          return;
        }
        diagnostics.push(
          malformed(
            `Protocol message repeats the object key ${JSON.stringify(property)}.`,
            { offset, length }
          )
        );
      },
      onObjectEnd: () => {
        objectKeys.pop();
      },
    },
    strictParseOptions
  );
  return diagnostics;
};

const inspectJsonValue = (
  value: unknown,
  limits: ProtocolJsonLimits
): ProtocolResult<JsonValue> => {
  const pending: Array<{ value: unknown; depth: number }> = [
    { value, depth: 0 },
  ];
  let nodes = 0;
  while (pending.length > 0) {
    const current = pending.pop()!;
    nodes += 1;
    if (nodes > limits.maxNodes) {
      return limitFailure(
        `Protocol message exceeds the ${limits.maxNodes} node limit.`,
        limits.maxNodes,
        nodes
      );
    }
    if (current.depth > limits.maxDepth) {
      return limitFailure(
        `Protocol message exceeds the ${limits.maxDepth} level depth limit.`,
        limits.maxDepth,
        current.depth
      );
    }
    if (current.value === null) continue;
    const valueType = typeof current.value;
    if (
      valueType === 'string' &&
      !isWellFormedUnicode(current.value as string)
    ) {
      return protocolFailure([
        malformed('Protocol message contains an unpaired UTF-16 surrogate.'),
      ]);
    }
    if (
      valueType === 'string' ||
      valueType === 'boolean' ||
      (valueType === 'number' && Number.isFinite(current.value))
    ) {
      continue;
    }
    if (Array.isArray(current.value)) {
      for (const item of current.value) {
        pending.push({ value: item, depth: current.depth + 1 });
      }
      continue;
    }
    if (valueType === 'object') {
      if (!isPlainObject(current.value)) {
        return protocolFailure([
          malformed('Protocol message contains a non-plain object.'),
        ]);
      }
      for (const child of Object.values(current.value)) {
        pending.push({ value: child, depth: current.depth + 1 });
      }
      continue;
    }
    return protocolFailure([
      malformed('Protocol message contains a non-JSON value.'),
    ]);
  }
  return protocolSuccess(value as JsonValue);
};

export const decodeProtocolJsonText = (
  source: unknown,
  inputLimits: Partial<ProtocolJsonLimits> = {}
): ProtocolResult<JsonValue> => {
  const limits = normalizeProtocolJsonLimits(inputLimits);
  if (typeof source !== 'string') {
    return protocolFailure([
      malformed('Protocol transport accepts strict JSON text only.'),
    ]);
  }
  if (!isWellFormedUnicode(source)) {
    return protocolFailure([
      malformed('Protocol message contains an unpaired UTF-16 surrogate.'),
    ]);
  }
  const bytes = new TextEncoder().encode(source);
  if (bytes.byteLength > limits.maxBytes) {
    return limitFailure(
      `Protocol message exceeds the ${limits.maxBytes} byte limit.`,
      limits.maxBytes,
      bytes.byteLength
    );
  }

  const parseErrors: ParseError[] = [];
  let value: unknown;
  try {
    value = parse(source, parseErrors, strictParseOptions);
  } catch {
    return protocolFailure([
      malformed('Protocol message could not be parsed safely.'),
    ]);
  }
  const diagnostics = [
    ...parseErrors.map((error) =>
      malformed(
        `Protocol message is not strict JSON: ${printParseErrorCode(error.error)}.`,
        { offset: error.offset, length: error.length }
      )
    ),
    ...objectKeyDiagnostics(source),
  ];
  if (diagnostics.length > 0) {
    return protocolFailure(
      diagnostics as [PluginDiagnostic, ...PluginDiagnostic[]]
    );
  }
  return inspectJsonValue(value, limits);
};

export const encodeProtocolJsonText = (
  value: JsonValue,
  inputLimits: Partial<ProtocolJsonLimits> = {}
): ProtocolResult<string> => {
  const limits = normalizeProtocolJsonLimits(inputLimits);
  const inspected = inspectJsonValue(value, limits);
  if (!inspected.ok) return inspected;
  let source: string;
  try {
    source = JSON.stringify(inspected.value);
  } catch {
    return protocolFailure([
      malformed('Protocol message could not be serialized safely.'),
    ]);
  }
  const bytes = new TextEncoder().encode(source);
  if (bytes.byteLength > limits.maxBytes) {
    return limitFailure(
      `Protocol message exceeds the ${limits.maxBytes} byte limit.`,
      limits.maxBytes,
      bytes.byteLength
    );
  }
  return protocolSuccess(source);
};
