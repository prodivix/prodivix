import type { ExportModule } from '#src/export';

export const WORKSPACE_EXECUTION_CONSOLE_RUNTIME_MODULE_ID =
  'workspace-execution-console-runtime';

const executionConsoleRuntimeSource = `type ProdivixConsoleValue =
  | null
  | boolean
  | number
  | string
  | readonly ProdivixConsoleValue[]
  | Readonly<{ [key: string]: ProdivixConsoleValue }>;

type ProdivixConsoleBudget = {
  nodes: number;
  redacted: boolean;
  truncated: boolean;
  ancestors: WeakSet<object>;
};

const PRODIVIX_CONSOLE_BRIDGE_TYPE = 'prodivix.execution-console-bridge.v1' as const;
const PRODIVIX_CONSOLE_TRUNCATION_MARKER = '[TRUNCATED]' as const;
const PRODIVIX_CONSOLE_MAX_ARGUMENTS = 20;
const PRODIVIX_CONSOLE_MAX_ENTRIES = 64;
const PRODIVIX_CONSOLE_MAX_DEPTH = 8;
const PRODIVIX_CONSOLE_MAX_NODES = 512;
const PRODIVIX_CONSOLE_MAX_STRING_BYTES = 4 * 1024;
const PRODIVIX_CONSOLE_MAX_MESSAGE_BYTES = 8 * 1024;
const PRODIVIX_CONSOLE_MAX_BRIDGE_BYTES = 32 * 1024;
const PRODIVIX_CONSOLE_REDACTION_MARKER = '[REDACTED]' as const;

const prodivixConsoleByteLength = (value: string): number =>
  new TextEncoder().encode(value).byteLength;

const prodivixSensitiveConsoleKey = (value: string): boolean =>
  /^(authorization|proxyauthorization|cookie|setcookie|xapikey|apikey|password|passwd|secret|clientsecret|clientkey|token|authtoken|accesstoken|refreshtoken|idtoken|sessiontoken|csrftoken|jwt|credential|credentials|sessionid|privatekey)$/u.test(
    value.replace(/[-_\\s]/gu, '').toLowerCase()
  );

const prodivixRedactConsoleText = (
  value: string,
  budget: ProdivixConsoleBudget
): string => {
  const redacted = value
    .replace(
      /(^|[\\s,;])((?:authorization|proxy-authorization|cookie|set-cookie)\\s*:\\s*)[^\\r\\n]*/gimu,
      (_match, prefix: string, key: string) =>
        prefix + key + PRODIVIX_CONSOLE_REDACTION_MARKER
    )
    .replace(
      /\\b(Bearer|Basic)\\s+[A-Za-z0-9._~+/=-]+/giu,
      (_match, scheme: string) => scheme + ' ' + PRODIVIX_CONSOLE_REDACTION_MARKER
    )
    .replace(
      /([?&](?:access[_-]?token|refresh[_-]?token|id[_-]?token|api[_-]?key|password|secret|signature|sig)=)[^&#\\s]*/giu,
      '$1' + PRODIVIX_CONSOLE_REDACTION_MARKER
    )
    .replace(/:\\/\\/[^/@:\\s]+:[^/@\\s]+@/gu, '://' + PRODIVIX_CONSOLE_REDACTION_MARKER + '@')
    .replace(
      /(^|[\\s,{;])(["']?(?:authorization|proxy-authorization|cookie|set-cookie|x-api-key|api-key|password|passwd|secret|client[_-]?secret|token|auth[_-]?token|access[_-]?token|refresh[_-]?token|id[_-]?token|session[_-]?token|csrf[_-]?token|credential|credentials)["']?\\s*[:=]\\s*)(?:"[^"\\r\\n]*"|'[^'\\r\\n]*'|[^\\s,;}\\r\\n]+)/gimu,
      (_match, prefix: string, key: string) =>
        prefix + key + PRODIVIX_CONSOLE_REDACTION_MARKER
    )
    .replace(
      /-----BEGIN [A-Z ]*PRIVATE KEY-----[\\s\\S]*?-----END [A-Z ]*PRIVATE KEY-----/gu,
      PRODIVIX_CONSOLE_REDACTION_MARKER
    );
  budget.redacted ||= redacted !== value;
  return redacted;
};

const prodivixTruncateConsoleText = (
  value: string,
  maximumBytes: number,
  budget: ProdivixConsoleBudget
): string => {
  if (prodivixConsoleByteLength(value) <= maximumBytes) return value;
  budget.truncated = true;
  const suffix = '…';
  const suffixBytes = prodivixConsoleByteLength(suffix);
  let output = '';
  let bytes = 0;
  for (const character of value) {
    const nextBytes = prodivixConsoleByteLength(character);
    if (bytes + nextBytes + suffixBytes > maximumBytes) break;
    output += character;
    bytes += nextBytes;
  }
  return output + suffix;
};

const prodivixReadConsoleMessage = (
  value: ProdivixConsoleValue | undefined
): string | undefined => {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    return undefined;
  const message = (
    value as Readonly<Record<string, ProdivixConsoleValue>>
  ).message;
  return typeof message === 'string' ? message : undefined;
};

const prodivixSerializeConsoleValue = (
  value: unknown,
  depth: number,
  budget: ProdivixConsoleBudget
): ProdivixConsoleValue => {
  budget.nodes += 1;
  if (budget.nodes > PRODIVIX_CONSOLE_MAX_NODES || depth > PRODIVIX_CONSOLE_MAX_DEPTH) {
    budget.truncated = true;
    return PRODIVIX_CONSOLE_TRUNCATION_MARKER;
  }
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (typeof value === 'string')
    return prodivixTruncateConsoleText(
      prodivixRedactConsoleText(value, budget),
      PRODIVIX_CONSOLE_MAX_STRING_BYTES,
      budget
    );
  if (typeof value === 'undefined') return '[undefined]';
  if (typeof value === 'bigint') return value.toString() + 'n';
  if (typeof value === 'symbol') return String(value);
  if (typeof value === 'function') return '[Function]';
  if (typeof value !== 'object') return '[Unsupported value]';
  if (budget.ancestors.has(value)) return '[Circular]';
  budget.ancestors.add(value);
  try {
    if (value instanceof Error) {
      return Object.freeze({
        name: prodivixTruncateConsoleText(prodivixRedactConsoleText(value.name, budget), 256, budget),
        message: prodivixTruncateConsoleText(prodivixRedactConsoleText(value.message, budget), PRODIVIX_CONSOLE_MAX_STRING_BYTES, budget),
        ...(typeof value.stack === 'string'
          ? { stack: prodivixTruncateConsoleText(prodivixRedactConsoleText(value.stack, budget), PRODIVIX_CONSOLE_MAX_STRING_BYTES, budget) }
          : {}),
      });
    }
    if (Array.isArray(value)) {
      const retained = value.slice(0, PRODIVIX_CONSOLE_MAX_ENTRIES);
      budget.truncated ||= retained.length !== value.length;
      return Object.freeze(
        retained.map((entry) => prodivixSerializeConsoleValue(entry, depth + 1, budget))
      );
    }
    const prototype = Object.getPrototypeOf(value) as unknown;
    if (prototype !== Object.prototype && prototype !== null) return '[Unsupported object]';
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const entries = Object.entries(descriptors)
      .sort(([left], [right]) => left.localeCompare(right))
      .slice(0, PRODIVIX_CONSOLE_MAX_ENTRIES);
    budget.truncated ||= entries.length !== Object.keys(descriptors).length;
    return Object.freeze(
      Object.fromEntries(
        entries.map(([key, descriptor]) => [
          prodivixTruncateConsoleText(key, 256, budget),
          prodivixSensitiveConsoleKey(key)
            ? ((budget.redacted = true), PRODIVIX_CONSOLE_REDACTION_MARKER)
            : 'value' in descriptor
            ? prodivixSerializeConsoleValue(descriptor.value, depth + 1, budget)
            : '[Accessor]',
        ])
      )
    );
  } catch {
    return '[Uninspectable value]';
  } finally {
    budget.ancestors.delete(value);
  }
};

const prodivixConsoleRoot = globalThis as typeof globalThis & {
  __prodivixExecutionConsoleBridgeInstalled?: boolean;
};

if (
  typeof window !== 'undefined' &&
  window.parent !== window &&
  !prodivixConsoleRoot.__prodivixExecutionConsoleBridgeInstalled
) {
  Object.defineProperty(prodivixConsoleRoot, '__prodivixExecutionConsoleBridgeInstalled', {
    configurable: false,
    enumerable: false,
    value: true,
    writable: false,
  });
  const frameId =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
  let sequence = 0;
  const publish = (
    level: 'debug' | 'info' | 'warning' | 'error',
    category: 'application' | 'runtime',
    values: readonly unknown[]
  ): void => {
    try {
      const budget: ProdivixConsoleBudget = {
        nodes: 0,
        redacted: false,
        truncated: values.length > PRODIVIX_CONSOLE_MAX_ARGUMENTS,
        ancestors: new WeakSet<object>(),
      };
      let args: readonly ProdivixConsoleValue[] = Object.freeze(
        values
          .slice(0, PRODIVIX_CONSOLE_MAX_ARGUMENTS)
          .map((value) => prodivixSerializeConsoleValue(value, 0, budget))
      );
      const first = args[0];
      const firstMessage = prodivixReadConsoleMessage(first);
      let message =
        typeof first === 'string'
          ? first
          : firstMessage ?? 'console.' + level;
      message = prodivixTruncateConsoleText(
        prodivixRedactConsoleText(message, budget),
        PRODIVIX_CONSOLE_MAX_MESSAGE_BYTES,
        budget
      );
      let log = Object.freeze({
        level,
        category,
        message,
        arguments: args,
        redacted: budget.redacted,
        truncated: budget.truncated,
      });
      if (prodivixConsoleByteLength(JSON.stringify(log)) > PRODIVIX_CONSOLE_MAX_BRIDGE_BYTES) {
        args = Object.freeze([PRODIVIX_CONSOLE_TRUNCATION_MARKER]);
        log = Object.freeze({
          level,
          category,
          message,
          arguments: args,
          redacted: budget.redacted,
          truncated: true,
        });
      }
      sequence += 1;
      window.parent.postMessage(
        Object.freeze({
          type: PRODIVIX_CONSOLE_BRIDGE_TYPE,
          messageId: frameId + ':' + sequence,
          log,
        }),
        '*'
      );
    } catch {
      // Console observation must never alter application behavior.
    }
  };

  const consoleMethods = Object.freeze({
    debug: 'debug',
    log: 'info',
    info: 'info',
    warn: 'warning',
    error: 'error',
  } as const);
  const consolePort = console as unknown as Record<
    string,
    ((...values: unknown[]) => void) | undefined
  >;
  Object.entries(consoleMethods).forEach(([method, level]) => {
    const original = consolePort[method]?.bind(console);
    if (!original) return;
    consolePort[method] = (...values: unknown[]) => {
      original(...values);
      publish(level, 'application', values);
    };
  });
  window.addEventListener('error', (event) => {
    publish('error', 'runtime', [
      {
        name: 'WindowError',
        message: event.message,
        filename: event.filename,
        line: event.lineno,
        column: event.colno,
        ...(event.error instanceof Error ? { error: event.error } : {}),
      },
    ]);
  });
  window.addEventListener('unhandledrejection', (event) => {
    publish('error', 'runtime', [
      { name: 'UnhandledRejection', reason: event.reason },
    ]);
  });
}

export {};
`;

/** Emits an embed-only Console bridge; standalone windows remain untouched. */
export const createWorkspaceExecutionConsoleRuntimeModule = (): ExportModule =>
  Object.freeze({
    id: WORKSPACE_EXECUTION_CONSOLE_RUNTIME_MODULE_ID,
    kind: 'runtime-helper',
    suggestedName: 'prodivix-console-runtime',
    desiredPath: 'src/prodivix-console-runtime.ts',
    language: 'ts',
    imports: [],
    body: executionConsoleRuntimeSource,
    sourceTrace: [],
    origin: Object.freeze({
      kind: 'generated',
      owner: 'prodivix',
      writePolicy: 'generated',
      updatePolicy: 'regenerate',
    }),
  });
