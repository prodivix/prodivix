import {
  parse,
  printParseErrorCode,
  visit,
  type JSONPath,
  type ParseError,
} from 'jsonc-parser';
import {
  createPluginDiagnostic,
  PLUGIN_DIAGNOSTIC_CODES,
  type PluginDiagnostic,
  type PluginDiagnosticMeta,
} from '#contracts/diagnostics';
import type { JsonValue } from '#contracts/generated/pluginManifest.generated';
import {
  validateJsonValue,
  type JsonValueValidationOptions,
} from '#contracts/jsonValue';
import { toJsonPointer } from '#contracts/jsonPointer';

export const DEFAULT_STRICT_JSON_MAX_BYTES = 256 * 1024;

export type StrictJsonDocumentKind = 'manifest' | 'contribution';

export type ParseStrictJsonDocumentOptions = JsonValueValidationOptions & {
  documentKind: StrictJsonDocumentKind;
  maxBytes?: number;
  diagnosticMeta?: Omit<PluginDiagnosticMeta, 'stage'>;
};

export type ParseStrictJsonDocumentResult =
  | {
      ok: true;
      value: JsonValue;
      sourceBytes: Uint8Array;
      diagnostics: readonly [];
    }
  | {
      ok: false;
      diagnostics: readonly PluginDiagnostic[];
    };

const strictParseOptions = {
  allowEmptyContent: false,
  allowTrailingComma: false,
  disallowComments: true,
} as const;

const normalizeMaxBytes = (value: number | undefined): number =>
  Number.isSafeInteger(value) && (value ?? 0) > 0
    ? (value as number)
    : DEFAULT_STRICT_JSON_MAX_BYTES;

const startsWithBom = (bytes: Uint8Array): boolean =>
  (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) ||
  (bytes[0] === 0xfe && bytes[1] === 0xff) ||
  (bytes[0] === 0xff && bytes[1] === 0xfe) ||
  (bytes[0] === 0x00 &&
    bytes[1] === 0x00 &&
    bytes[2] === 0xfe &&
    bytes[3] === 0xff);

/**
 * jsonc-parser recovers from every syntax error, so a hostile document can carry
 * one error per byte. Reported problems stay bounded and positions resolve
 * against a single line index instead of rescanning the source per error.
 */
const MAX_REPORTED_SOURCE_PROBLEMS = 32;

type LineIndex = Readonly<{ starts: readonly number[]; length: number }>;

const createLineIndex = (source: string): LineIndex => {
  const starts = [0];
  for (let index = 0; index < source.length; index += 1) {
    if (source.charCodeAt(index) === 10) starts.push(index + 1);
  }
  return { starts, length: source.length };
};

const positionAt = (
  index: LineIndex,
  offset: number
): { line: number; column: number } => {
  const target = Math.min(Math.max(offset, 0), index.length);
  let low = 0;
  let high = index.starts.length - 1;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if (index.starts[middle] <= target) low = middle;
    else high = middle - 1;
  }
  return { line: low + 1, column: target - index.starts[low] + 1 };
};

const documentLabel = (kind: StrictJsonDocumentKind): string =>
  kind === 'manifest' ? 'Plugin Manifest' : 'Contribution descriptor';

const invalidSourceCode = (kind: StrictJsonDocumentKind) =>
  kind === 'manifest'
    ? PLUGIN_DIAGNOSTIC_CODES.INVALID_SOURCE
    : PLUGIN_DIAGNOSTIC_CODES.INVALID_CONTRIBUTION_JSON;

const duplicateKeyCode = (kind: StrictJsonDocumentKind) =>
  kind === 'manifest'
    ? PLUGIN_DIAGNOSTIC_CODES.DUPLICATE_KEY
    : PLUGIN_DIAGNOSTIC_CODES.INVALID_CONTRIBUTION_JSON;

const resourceLimitCode = (kind: StrictJsonDocumentKind) =>
  kind === 'manifest'
    ? PLUGIN_DIAGNOSTIC_CODES.RESOURCE_LIMIT
    : PLUGIN_DIAGNOSTIC_CODES.CONTRIBUTION_RESOURCE_LIMIT;

const pathMeta = (
  kind: StrictJsonDocumentKind,
  path: string
): Pick<PluginDiagnosticMeta, 'manifestPath' | 'documentPath'> =>
  kind === 'manifest' ? { manifestPath: path } : { documentPath: path };

const parseErrorDiagnostic = (
  lineIndex: LineIndex,
  error: ParseError,
  options: ParseStrictJsonDocumentOptions
): PluginDiagnostic => {
  const position = positionAt(lineIndex, error.offset);
  return createPluginDiagnostic(
    invalidSourceCode(options.documentKind),
    `${documentLabel(options.documentKind)} is not strict JSON: ${printParseErrorCode(error.error)}.`,
    {
      ...options.diagnosticMeta,
      offset: error.offset,
      length: error.length,
      line: position.line,
      column: position.column,
    }
  );
};

const findDuplicateKeys = (
  source: string,
  options: ParseStrictJsonDocumentOptions,
  budget: number
): { diagnostics: PluginDiagnostic[]; suppressed: number } => {
  const objectKeys: Array<Set<string>> = [];
  const diagnostics: PluginDiagnostic[] = [];
  let suppressed = 0;

  visit(
    source,
    {
      onObjectBegin: () => {
        objectKeys.push(new Set());
      },
      onObjectProperty: (
        property,
        offset,
        length,
        startLine,
        startCharacter,
        pathSupplier
      ) => {
        const currentKeys = objectKeys.at(-1);
        if (!currentKeys || !currentKeys.has(property)) {
          currentKeys?.add(property);
          return;
        }
        if (diagnostics.length >= budget) {
          suppressed += 1;
          return;
        }

        const propertyPath: JSONPath = [...pathSupplier(), property];
        diagnostics.push(
          createPluginDiagnostic(
            duplicateKeyCode(options.documentKind),
            `${documentLabel(options.documentKind)} repeats the object key ${JSON.stringify(property)}.`,
            {
              ...options.diagnosticMeta,
              ...pathMeta(options.documentKind, toJsonPointer(propertyPath)),
              offset,
              length,
              line: startLine + 1,
              column: startCharacter + 1,
            }
          )
        );
      },
      onObjectEnd: () => {
        objectKeys.pop();
      },
    },
    strictParseOptions
  );

  return { diagnostics, suppressed };
};

const decodeSource = (
  source: string | Uint8Array,
  options: ParseStrictJsonDocumentOptions
):
  | { ok: true; text: string; sourceBytes: Uint8Array }
  | { ok: false; diagnostic: PluginDiagnostic } => {
  const sourceBytes =
    typeof source === 'string'
      ? new TextEncoder().encode(source)
      : new Uint8Array(source);
  const maxBytes = normalizeMaxBytes(options.maxBytes);
  const label = documentLabel(options.documentKind);

  if (sourceBytes.byteLength > maxBytes) {
    return {
      ok: false,
      diagnostic: createPluginDiagnostic(
        resourceLimitCode(options.documentKind),
        `${label} exceeds the ${maxBytes} byte limit.`,
        {
          ...options.diagnosticMeta,
          limit: maxBytes,
          actual: sourceBytes.byteLength,
        }
      ),
    };
  }
  if (
    startsWithBom(sourceBytes) ||
    (typeof source === 'string' && source.charCodeAt(0) === 0xfeff)
  ) {
    return {
      ok: false,
      diagnostic: createPluginDiagnostic(
        invalidSourceCode(options.documentKind),
        `${label} must not contain a byte order mark.`,
        options.diagnosticMeta
      ),
    };
  }

  try {
    const text = new TextDecoder('utf-8', {
      fatal: true,
      ignoreBOM: true,
    }).decode(sourceBytes);
    if (typeof source === 'string' && text !== source) {
      return {
        ok: false,
        diagnostic: createPluginDiagnostic(
          invalidSourceCode(options.documentKind),
          `${label} string cannot be represented as strict UTF-8.`,
          options.diagnosticMeta
        ),
      };
    }
    return { ok: true, text, sourceBytes };
  } catch {
    return {
      ok: false,
      diagnostic: createPluginDiagnostic(
        invalidSourceCode(options.documentKind),
        `${label} contains invalid UTF-8 bytes.`,
        options.diagnosticMeta
      ),
    };
  }
};

const remapJsonDiagnostic = (
  diagnostic: PluginDiagnostic,
  options: ParseStrictJsonDocumentOptions
): PluginDiagnostic => {
  const manifestPath = diagnostic.meta.manifestPath ?? '';
  const code =
    diagnostic.code === PLUGIN_DIAGNOSTIC_CODES.RESOURCE_LIMIT
      ? resourceLimitCode(options.documentKind)
      : invalidSourceCode(options.documentKind);
  return createPluginDiagnostic(code, diagnostic.message, {
    ...options.diagnosticMeta,
    ...diagnostic.meta,
    ...pathMeta(options.documentKind, manifestPath),
    manifestPath:
      options.documentKind === 'manifest' ? manifestPath : undefined,
  });
};

export const parseStrictJsonDocument = (
  source: string | Uint8Array,
  options: ParseStrictJsonDocumentOptions
): ParseStrictJsonDocumentResult => {
  const decoded = decodeSource(source, options);
  if (!decoded.ok) {
    return { ok: false, diagnostics: [decoded.diagnostic] };
  }

  try {
    const parseErrors: ParseError[] = [];
    const value: unknown = parse(decoded.text, parseErrors, strictParseOptions);
    const lineIndex = createLineIndex(decoded.text);
    const reportedParseErrors = parseErrors.slice(
      0,
      MAX_REPORTED_SOURCE_PROBLEMS
    );
    const duplicateKeys = findDuplicateKeys(
      decoded.text,
      options,
      MAX_REPORTED_SOURCE_PROBLEMS
    );
    const suppressed =
      parseErrors.length -
      reportedParseErrors.length +
      duplicateKeys.suppressed;
    const diagnostics = [
      ...reportedParseErrors.map((error) =>
        parseErrorDiagnostic(lineIndex, error, options)
      ),
      ...duplicateKeys.diagnostics,
    ];
    if (suppressed > 0) {
      diagnostics.push(
        createPluginDiagnostic(
          invalidSourceCode(options.documentKind),
          `${documentLabel(options.documentKind)} has ${suppressed} further reported problems that were suppressed.`,
          options.diagnosticMeta
        )
      );
    }
    if (diagnostics.length > 0) {
      return { ok: false, diagnostics };
    }

    const jsonResult = validateJsonValue(value, options);
    if (!jsonResult.ok) {
      return {
        ok: false,
        diagnostics: jsonResult.diagnostics.map((diagnostic) =>
          remapJsonDiagnostic(diagnostic, options)
        ),
      };
    }

    return {
      ok: true,
      value: jsonResult.value,
      sourceBytes: decoded.sourceBytes,
      diagnostics: [],
    };
  } catch {
    return {
      ok: false,
      diagnostics: [
        createPluginDiagnostic(
          invalidSourceCode(options.documentKind),
          `${documentLabel(options.documentKind)} could not be parsed safely.`,
          options.diagnosticMeta
        ),
      ],
    };
  }
};
