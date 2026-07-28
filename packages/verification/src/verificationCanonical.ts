import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import {
  canonicalJsonText,
  compareUnicodeCodePoints,
} from '@prodivix/shared/canonical';

export const compareVerificationText = compareUnicodeCodePoints;

export const digestVerificationValue = (value: unknown): string =>
  `sha256-${bytesToHex(sha256(utf8ToBytes(canonicalJsonText(value))))}`;

export const serializeVerificationValue = (value: unknown): string =>
  canonicalJsonText(value);

export const uniqueVerificationText = (
  values: readonly string[]
): readonly string[] =>
  Object.freeze([...new Set(values)].sort(compareVerificationText));

export const compareOptionalVerificationText = (
  left: string | undefined,
  right: string | undefined
): number => compareVerificationText(left ?? '', right ?? '');

const RFC3339_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

/** Parses only an explicit UTC instant; callers never fall back to ambient time. */
export const parseVerificationInstant = (value: string): number | undefined => {
  if (!RFC3339_INSTANT.test(value)) return undefined;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return undefined;
  const normalized = value.includes('.')
    ? value.replace(
        /\.(\d{1,3})Z$/,
        (_match, fraction: string) => `.${fraction.padEnd(3, '0')}Z`
      )
    : value.replace(/Z$/, '.000Z');
  return new Date(parsed).toISOString() === normalized ? parsed : undefined;
};
