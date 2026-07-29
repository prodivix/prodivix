import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import { digestVerificationValue } from '@prodivix/verification';
import {
  BrowserPrivatePayloadError,
  strictArray,
  strictBoolean,
  strictEnum,
  strictIdentifier,
  strictObject,
  strictString,
} from './privateBoundary';

const fail = (path: string, message: string): never => {
  throw new BrowserPrivatePayloadError('invalid-field', path, message);
};

const containsControlCharacter = (value: string): boolean =>
  [...value].some((character) => {
    const codePoint = character.codePointAt(0)!;
    return codePoint <= 0x1f || codePoint === 0x7f;
  });

const normalizedOrigins = (values: readonly string[]): readonly string[] => {
  const origins = strictArray(values, '$.observedOrigins', 256).map(
    (entry, index) => {
      const source = strictString(entry, `$.observedOrigins[${index}]`, 2_048);
      let parsed: URL;
      try {
        parsed = new URL(source);
      } catch {
        return fail(
          `$.observedOrigins[${index}]`,
          'Observed network origin must be absolute HTTP(S).'
        );
      }
      if (
        !['http:', 'https:'].includes(parsed.protocol) ||
        parsed.username !== '' ||
        parsed.password !== '' ||
        parsed.pathname !== '/' ||
        parsed.search !== '' ||
        parsed.hash !== '' ||
        parsed.origin !== source
      ) {
        return fail(
          `$.observedOrigins[${index}]`,
          'Observed network value must contain an origin only.'
        );
      }
      return parsed.origin;
    }
  );
  if (new Set(origins).size !== origins.length) {
    fail('$.observedOrigins', 'Observed network origins must be unique.');
  }
  return Object.freeze([...origins].sort(compareUnicodeCodePoints));
};

export const createBrowserNetworkObservationDigest = (
  observedOrigins: readonly string[]
): string =>
  digestVerificationValue({
    format: 'prodivix.browser-network-observation',
    version: 1,
    observedOrigins: normalizedOrigins(observedOrigins),
  });

const normalizedHeaderDirectives = (
  header: string,
  separator: ';' | ','
): readonly string[] => {
  if (typeof header !== 'string' || header.length > 65_536) {
    fail('$.header', 'Observed security header exceeds its byte budget.');
  }
  const directives = header
    .split(separator)
    .map((directive) => directive.trim().replace(/\s+/gu, ' '))
    .filter(Boolean);
  if (
    directives.some(
      (directive) =>
        directive.normalize('NFC') !== directive ||
        containsControlCharacter(directive)
    )
  ) {
    fail('$.header', 'Observed security header is not canonical text.');
  }
  return Object.freeze([...directives].sort(compareUnicodeCodePoints));
};

export const createBrowserCspObservationDigest = (header: string): string =>
  digestVerificationValue({
    format: 'prodivix.browser-csp-observation',
    version: 1,
    directives: normalizedHeaderDirectives(header, ';'),
  });

export const createBrowserPermissionsPolicyObservationDigest = (
  header: string
): string =>
  digestVerificationValue({
    format: 'prodivix.browser-permissions-policy-observation',
    version: 1,
    directives: normalizedHeaderDirectives(header, ','),
  });

export type BrowserSandboxObservation = Readonly<{
  contextIsolation: 'fresh-nonpersistent';
  serviceWorkerPolicy: 'blocked';
  topLevel: boolean;
  canReachParent: boolean;
  sandboxTokens: readonly string[];
}>;

export const createBrowserSandboxObservationDigest = (
  input: BrowserSandboxObservation
): string => {
  const observation = strictObject(input, '$', [
    'contextIsolation',
    'serviceWorkerPolicy',
    'topLevel',
    'canReachParent',
    'sandboxTokens',
  ]);
  const sandboxTokens = strictArray(
    observation.sandboxTokens,
    '$.sandboxTokens',
    64
  ).map((value, index) => strictIdentifier(value, `$.sandboxTokens[${index}]`));
  if (new Set(sandboxTokens).size !== sandboxTokens.length) {
    fail('$.sandboxTokens', 'Sandbox tokens must be unique.');
  }
  return digestVerificationValue({
    format: 'prodivix.browser-sandbox-observation',
    version: 1,
    contextIsolation: strictEnum(
      observation.contextIsolation,
      '$.contextIsolation',
      ['fresh-nonpersistent'] as const
    ),
    serviceWorkerPolicy: strictEnum(
      observation.serviceWorkerPolicy,
      '$.serviceWorkerPolicy',
      ['blocked'] as const
    ),
    topLevel: strictBoolean(observation.topLevel, '$.topLevel'),
    canReachParent: strictBoolean(
      observation.canReachParent,
      '$.canReachParent'
    ),
    sandboxTokens: [...sandboxTokens].sort(compareUnicodeCodePoints),
  });
};
