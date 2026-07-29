import {
  digestVerificationValue,
  type VerificationBrowserEngine,
} from '@prodivix/verification';
import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';

export const PLAYWRIGHT_BROWSER_IMAGE_AUTHORITY_FORMAT =
  'prodivix.playwright-browser-image-authority';
export const PLAYWRIGHT_BROWSER_IMAGE_AUTHORITY_VERSION = 1;

const SHA_256_DIGEST = /^sha256-[0-9a-f]{64}$/u;
const RECEIPT_KEYS = Object.freeze([
  'engine',
  'executableContentDigest',
  'executableRelativePath',
  'fileCount',
  'fileSetDigest',
  'format',
  'imageDigest',
  'totalByteLength',
  'version',
]);

export type PlaywrightBrowserImageAuthorityReceipt = Readonly<{
  format: typeof PLAYWRIGHT_BROWSER_IMAGE_AUTHORITY_FORMAT;
  version: typeof PLAYWRIGHT_BROWSER_IMAGE_AUTHORITY_VERSION;
  engine: VerificationBrowserEngine;
  executableRelativePath: string;
  executableContentDigest: string;
  fileSetDigest: string;
  fileCount: number;
  totalByteLength: number;
  imageDigest: string;
}>;

export type PlaywrightBrowserImageAuthorityReceiptInput = Omit<
  PlaywrightBrowserImageAuthorityReceipt,
  'format' | 'version' | 'imageDigest'
>;

const assertSha256Digest = (value: string, field: string): void => {
  if (!SHA_256_DIGEST.test(value)) {
    throw new Error(
      `Playwright browser image authority ${field} must be a lowercase SHA-256 digest.`
    );
  }
};

const assertExecutableRelativePath = (value: string): void => {
  const segments = value.split('/');
  if (
    value.length === 0 ||
    value.includes('\\') ||
    value.includes(':') ||
    value.includes('\0') ||
    value.startsWith('/') ||
    segments.some(
      (segment) =>
        segment.length === 0 ||
        segment === '.' ||
        segment === '..' ||
        /^(?:chromium|firefox|webkit)-[0-9]+$/u.test(segment)
    )
  ) {
    throw new Error(
      'Playwright browser image authority executable path must be normalized and relative.'
    );
  }
};

const assertEngine = (
  value: VerificationBrowserEngine
): VerificationBrowserEngine => {
  if (value !== 'chromium' && value !== 'firefox' && value !== 'webkit') {
    throw new Error('Playwright browser image authority engine is invalid.');
  }
  return value;
};

const receiptIdentity = (input: PlaywrightBrowserImageAuthorityReceiptInput) =>
  Object.freeze({
    format: PLAYWRIGHT_BROWSER_IMAGE_AUTHORITY_FORMAT,
    version: PLAYWRIGHT_BROWSER_IMAGE_AUTHORITY_VERSION,
    engine: assertEngine(input.engine),
    executableRelativePath: input.executableRelativePath,
    executableContentDigest: input.executableContentDigest,
    fileSetDigest: input.fileSetDigest,
    fileCount: input.fileCount,
    totalByteLength: input.totalByteLength,
  });

export const createPlaywrightBrowserImageAuthorityReceipt = (
  input: PlaywrightBrowserImageAuthorityReceiptInput
): PlaywrightBrowserImageAuthorityReceipt => {
  assertExecutableRelativePath(input.executableRelativePath);
  assertSha256Digest(input.executableContentDigest, 'executableContentDigest');
  assertSha256Digest(input.fileSetDigest, 'fileSetDigest');
  if (!Number.isSafeInteger(input.fileCount) || input.fileCount < 1) {
    throw new Error(
      'Playwright browser image authority fileCount must be a positive safe integer.'
    );
  }
  if (
    !Number.isSafeInteger(input.totalByteLength) ||
    input.totalByteLength < 0
  ) {
    throw new Error(
      'Playwright browser image authority totalByteLength must be a non-negative safe integer.'
    );
  }
  const identity = receiptIdentity(input);
  return Object.freeze({
    ...identity,
    imageDigest: digestVerificationValue(identity),
  });
};

export const assertPlaywrightBrowserImageAuthorityReceipt = (
  value: PlaywrightBrowserImageAuthorityReceipt,
  expectedImageDigest?: string
): PlaywrightBrowserImageAuthorityReceipt => {
  const keys = Object.keys(value).sort(compareUnicodeCodePoints);
  if (
    keys.length !== RECEIPT_KEYS.length ||
    keys.some((key, index) => key !== RECEIPT_KEYS[index])
  ) {
    throw new Error(
      'Playwright browser image authority receipt fields are invalid.'
    );
  }
  if (
    value.format !== PLAYWRIGHT_BROWSER_IMAGE_AUTHORITY_FORMAT ||
    value.version !== PLAYWRIGHT_BROWSER_IMAGE_AUTHORITY_VERSION
  ) {
    throw new Error(
      'Playwright browser image authority receipt format is invalid.'
    );
  }
  assertSha256Digest(value.imageDigest, 'imageDigest');
  if (expectedImageDigest !== undefined) {
    assertSha256Digest(expectedImageDigest, 'expectedImageDigest');
  }
  const normalized = createPlaywrightBrowserImageAuthorityReceipt(value);
  if (
    normalized.imageDigest !== value.imageDigest ||
    (expectedImageDigest !== undefined &&
      normalized.imageDigest !== expectedImageDigest)
  ) {
    throw new Error(
      `Playwright ${value.engine} browser image authority mismatch. expected=${expectedImageDigest ?? value.imageDigest} observed=${normalized.imageDigest}.`
    );
  }
  return normalized;
};
