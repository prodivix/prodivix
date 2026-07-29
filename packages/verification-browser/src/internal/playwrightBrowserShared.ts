import type { BrowserVerificationRuntimeIdentity } from '../browserAdapter.types';
import type { BrowserToolPoolAcquireInput } from '../browserVerificationPort';
import { digestVerificationValue } from '@prodivix/verification';
import type { VerificationBrowserEngine } from '@prodivix/verification';

export const PLAYWRIGHT_SCHEMA_DIGEST = digestVerificationValue({
  format: 'prodivix.playwright-browser-report',
  version: 1,
});
export const AXE_SCHEMA_DIGEST = digestVerificationValue({
  format: 'prodivix.axe-accessibility-report',
  version: 1,
});
export const KEYBOARD_SCHEMA_DIGEST = digestVerificationValue({
  format: 'prodivix.keyboard-focus-report',
  version: 1,
});
export const PERFORMANCE_SCHEMA_DIGEST = digestVerificationValue({
  format: 'prodivix.browser-performance-report',
  version: 1,
});
export const SECURITY_SCHEMA_DIGEST = digestVerificationValue({
  format: 'prodivix.browser-owned-security-report',
  version: 1,
});

export const PLAYWRIGHT_VERSION = '1.61.1';
export const AXE_VERSION = '4.12.1';
export const VERIFICATION_PROBE_ENDPOINT = '__PRODIVIX_VERIFICATION_PROBE_V1__';
export const VERIFICATION_PROBE_CANARY = '__PRODIVIX_VERIFY_ONLY_CANARY_V1__';
export const KEYBOARD_ACTIVATION_STATE =
  '__PRODIVIX_KEYBOARD_ACTIVATION_STATE_V1__';
export const SEMANTIC_ELEMENT_SELECTOR =
  '[data-pir-document-id][data-pir-node-id]';

export const toolIdentity = (schemaDigest: string) =>
  Object.freeze({
    name: 'playwright' as const,
    version: PLAYWRIGHT_VERSION,
    schemaDigest,
  });

export const browserToolDiagnosticCodes = (prefix: string): readonly string[] =>
  Object.freeze([prefix]);

export const roundMilliseconds = (value: number): number =>
  Math.round(Math.max(0, value) * 1_000) / 1_000;

export const assertOrigin = (value: string): string => {
  const parsed = new URL(value);
  if (
    !['http:', 'https:'].includes(parsed.protocol) ||
    parsed.username !== '' ||
    parsed.password !== '' ||
    parsed.pathname !== '/' ||
    parsed.search !== '' ||
    parsed.hash !== '' ||
    value !== parsed.origin
  ) {
    throw new TypeError(
      'Browser verification target lease must provide an HTTP(S) origin only.'
    );
  }
  return parsed.origin;
};

const cloneRuntimeIdentity = (
  identity: BrowserVerificationRuntimeIdentity,
  observed: Readonly<{
    browserEngine: VerificationBrowserEngine;
    browserVersion: string;
    viewport: Readonly<{
      widthCssPixels: number;
      heightCssPixels: number;
      devicePixelRatio: number;
    }>;
    colorScheme: 'light' | 'dark';
    motionPreference: 'full' | 'reduced';
    locale: string;
  }>
): BrowserVerificationRuntimeIdentity =>
  Object.freeze({
    machineClass: identity.machineClass,
    operatingSystemImageDigest: identity.operatingSystemImageDigest,
    browserImageDigest: identity.browserImageDigest,
    browserEngine: observed.browserEngine,
    browserVersion: observed.browserVersion,
    fontSetDigest: identity.fontSetDigest,
    viewport: Object.freeze({ ...observed.viewport }),
    colorScheme: observed.colorScheme,
    motionPreference: observed.motionPreference,
    locale: observed.locale,
    cacheClass: identity.cacheClass,
    rendererGeneration: identity.rendererGeneration,
    normalizer: Object.freeze({ ...identity.normalizer }),
  });

export const assertObservedRuntime = (
  input: BrowserToolPoolAcquireInput,
  browserVersion: string,
  observation: Readonly<{
    widthCssPixels: number;
    heightCssPixels: number;
    devicePixelRatio: number;
    colorScheme: 'light' | 'dark';
    motionPreference: 'full' | 'reduced';
    locale: string;
  }>
): BrowserVerificationRuntimeIdentity => {
  const cellEngine = input.cell.browserEngine;
  if (
    cellEngine === undefined ||
    cellEngine !== input.engine ||
    input.runtimeIdentity.browserEngine !== input.engine ||
    input.runtimeIdentity.browserVersion !== browserVersion ||
    input.runtimeIdentity.viewport.widthCssPixels !==
      observation.widthCssPixels ||
    input.runtimeIdentity.viewport.heightCssPixels !==
      observation.heightCssPixels ||
    input.runtimeIdentity.viewport.devicePixelRatio !==
      observation.devicePixelRatio ||
    input.runtimeIdentity.colorScheme !== observation.colorScheme ||
    input.runtimeIdentity.motionPreference !== observation.motionPreference ||
    input.runtimeIdentity.locale !== observation.locale ||
    input.cell.viewport.width !== observation.widthCssPixels ||
    input.cell.viewport.height !== observation.heightCssPixels ||
    input.cell.colorScheme !== observation.colorScheme ||
    input.cell.motion !== observation.motionPreference ||
    input.cell.locale !== observation.locale
  ) {
    throw new TypeError(
      'Playwright runtime observation drifted from the provider-attested target lease.'
    );
  }
  return cloneRuntimeIdentity(input.runtimeIdentity, {
    browserEngine: input.engine,
    browserVersion,
    viewport: Object.freeze({
      widthCssPixels: observation.widthCssPixels,
      heightCssPixels: observation.heightCssPixels,
      devicePixelRatio: observation.devicePixelRatio,
    }),
    colorScheme: observation.colorScheme,
    motionPreference: observation.motionPreference,
    locale: observation.locale,
  });
};
