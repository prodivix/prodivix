import { utf8ToBytes } from '@noble/hashes/utils.js';
import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import {
  inspectVerificationJpeg,
  inspectVerificationPng,
} from './verificationArtifactImage';
import {
  ACTIVE_DETECTED_VERIFICATION_ARTIFACT_MEDIA,
  ACTIVE_VERIFICATION_ARTIFACT_MEDIA_TYPES,
  ARCHIVE_DETECTED_VERIFICATION_ARTIFACT_MEDIA,
  ARCHIVE_VERIFICATION_ARTIFACT_MEDIA_TYPES,
  IMAGE_VERIFICATION_ARTIFACT_KINDS,
  isVerificationArtifactJsonMediaType,
  JSON_VERIFICATION_ARTIFACT_KINDS,
  UNSUPPORTED_DETECTED_VERIFICATION_ARTIFACT_MEDIA,
} from './verificationArtifactMedia';
import {
  decodeVerificationArtifactEnvelope,
  isVerificationStructuredArtifactKind,
} from './verificationArtifactEnvelope';
import type {
  VerificationArtifactDetectedMediaType,
  VerificationArtifactPolicy,
  VerificationArtifactPolicyCandidate,
  VerificationArtifactPolicyDiagnosticReason,
  VerificationArtifactTargetPolicy,
} from './verificationArtifactPolicy.types';
import { decodeVerificationArtifactUtf8Strict } from './verificationArtifactUtf8';

const validateJsonValue = (
  value: unknown,
  policy: VerificationArtifactPolicy
): boolean => {
  let nodes = 0;
  const visit = (entry: unknown, depth: number): boolean => {
    nodes += 1;
    if (depth > policy.maximumJsonDepth || nodes > policy.maximumJsonNodes) {
      return false;
    }
    if (
      entry === null ||
      typeof entry === 'boolean' ||
      (typeof entry === 'number' &&
        Number.isFinite(entry) &&
        !Object.is(entry, -0))
    ) {
      return true;
    }
    if (typeof entry === 'string') {
      return utf8ToBytes(entry).byteLength <= policy.maximumJsonStringBytes;
    }
    if (Array.isArray(entry)) {
      return entry.every((item) => visit(item, depth + 1));
    }
    if (!isPlainObject(entry)) return false;
    for (const key of Object.keys(entry).sort(compareUnicodeCodePoints)) {
      nodes += 1;
      if (
        nodes > policy.maximumJsonNodes ||
        isUnsafeObjectKey(key) ||
        utf8ToBytes(key).byteLength > policy.maximumJsonStringBytes ||
        !visit(entry[key], depth + 1)
      ) {
        return false;
      }
    }
    return true;
  };
  return visit(value, 0);
};

const hasCanonicalRawJsonIdentity = (text: string): boolean => {
  const stack: Array<
    | Readonly<{ kind: 'array' }>
    | Readonly<{ kind: 'object'; keys: Set<string> }>
  > = [];
  const numberPattern = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/u;
  for (let index = 0; index < text.length;) {
    const character = text[index]!;
    if (character === '"') {
      let end = index + 1;
      while (end < text.length) {
        if (text[end] === '\\') {
          end += 2;
          continue;
        }
        if (text[end] === '"') break;
        end += 1;
      }
      if (end >= text.length) return false;
      let next = end + 1;
      while (next < text.length && /\s/u.test(text[next]!)) next += 1;
      const context = stack.at(-1);
      if (context?.kind === 'object' && text[next] === ':') {
        let key: string;
        try {
          key = JSON.parse(text.slice(index, end + 1)) as string;
        } catch {
          return false;
        }
        if (context.keys.has(key)) return false;
        context.keys.add(key);
      }
      index = end + 1;
      continue;
    }
    if (character === '{') {
      stack.push({ kind: 'object', keys: new Set<string>() });
      index += 1;
      continue;
    }
    if (character === '[') {
      stack.push({ kind: 'array' });
      index += 1;
      continue;
    }
    if (character === '}' || character === ']') {
      stack.pop();
      index += 1;
      continue;
    }
    if (character === '-' || (character >= '0' && character <= '9')) {
      const token = numberPattern.exec(text.slice(index))?.[0];
      if (!token || Object.is(Number(token), -0)) return false;
      index += token.length;
      continue;
    }
    index += 1;
  }
  return true;
};

const inspectJson = (
  contents: Uint8Array,
  policy: VerificationArtifactPolicy
): Readonly<{ text: string; value: unknown }> | undefined => {
  if (
    contents.byteLength > policy.maximumJsonBytes ||
    contents.byteLength < 1
  ) {
    return undefined;
  }
  const text = decodeVerificationArtifactUtf8Strict(contents);
  if (text === undefined) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return undefined;
  }
  return hasCanonicalRawJsonIdentity(text) && validateJsonValue(parsed, policy)
    ? Object.freeze({ text, value: parsed })
    : undefined;
};

const isAsciiControlCharacter = (value: string): boolean => {
  const codePoint = value.codePointAt(0);
  return codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f);
};

const inspectText = (
  contents: Uint8Array,
  policy: VerificationArtifactPolicy
): string | undefined => {
  if (contents.byteLength > policy.maximumTextBytes) return undefined;
  const text = decodeVerificationArtifactUtf8Strict(contents);
  if (
    text === undefined ||
    [...text].some(
      (character) =>
        isAsciiControlCharacter(character) &&
        character !== '\n' &&
        character !== '\r' &&
        character !== '\t'
    )
  ) {
    return undefined;
  }
  return text;
};

export type VerificationArtifactStructureValidation =
  | Readonly<{
      accepted: true;
      inspectionText: string;
      imageMetadata?: Readonly<{ width: number; height: number }>;
    }>
  | Readonly<{
      accepted: false;
      reason: VerificationArtifactPolicyDiagnosticReason;
    }>;

export const validateVerificationArtifactMediaAndStructure = (
  candidate: VerificationArtifactPolicyCandidate,
  detectedMediaType: VerificationArtifactDetectedMediaType,
  policy: VerificationArtifactPolicy,
  targetPolicy?: VerificationArtifactTargetPolicy
): VerificationArtifactStructureValidation => {
  if (ACTIVE_VERIFICATION_ARTIFACT_MEDIA_TYPES.has(candidate.mediaType)) {
    return Object.freeze({ accepted: false, reason: 'active-content' });
  }
  if (ARCHIVE_VERIFICATION_ARTIFACT_MEDIA_TYPES.has(candidate.mediaType)) {
    return Object.freeze({ accepted: false, reason: 'archive' });
  }
  if (ACTIVE_DETECTED_VERIFICATION_ARTIFACT_MEDIA.has(detectedMediaType)) {
    return Object.freeze({ accepted: false, reason: 'active-content' });
  }
  if (ARCHIVE_DETECTED_VERIFICATION_ARTIFACT_MEDIA.has(detectedMediaType)) {
    return Object.freeze({ accepted: false, reason: 'archive' });
  }
  if (UNSUPPORTED_DETECTED_VERIFICATION_ARTIFACT_MEDIA.has(detectedMediaType)) {
    return Object.freeze({ accepted: false, reason: 'unsupported-media' });
  }

  if (IMAGE_VERIFICATION_ARTIFACT_KINDS.has(candidate.kind)) {
    if (!targetPolicy || targetPolicy.capture === 'forbidden-sensitive') {
      return Object.freeze({ accepted: false, reason: 'sensitive-target' });
    }
    if (
      (candidate.mediaType !== 'image/png' &&
        candidate.mediaType !== 'image/jpeg') ||
      detectedMediaType !== candidate.mediaType
    ) {
      return Object.freeze({ accepted: false, reason: 'media-mismatch' });
    }
    const metadata =
      candidate.mediaType === 'image/png'
        ? inspectVerificationPng(candidate.contents, policy)
        : inspectVerificationJpeg(candidate.contents, policy);
    return metadata
      ? Object.freeze({
          accepted: true,
          // PNG metadata chunks and JPEG application/comment segments are
          // rejected structurally, so compressed raster bytes are not treated
          // as text for entropy or PII scanning.
          inspectionText: '',
          imageMetadata: metadata,
        })
      : Object.freeze({ accepted: false, reason: 'invalid-image' });
  }

  if (candidate.kind === 'build-log') {
    if (
      candidate.mediaType !== 'text/plain' ||
      (detectedMediaType !== 'text/plain' &&
        detectedMediaType !== 'application/json')
    ) {
      return Object.freeze({ accepted: false, reason: 'media-mismatch' });
    }
    const text = inspectText(candidate.contents, policy);
    return text === undefined
      ? Object.freeze({ accepted: false, reason: 'invalid-text' })
      : Object.freeze({ accepted: true, inspectionText: text });
  }

  if (!JSON_VERIFICATION_ARTIFACT_KINDS.has(candidate.kind)) {
    return Object.freeze({ accepted: false, reason: 'unsupported-media' });
  }
  if (!isVerificationArtifactJsonMediaType(candidate.mediaType)) {
    return Object.freeze({ accepted: false, reason: 'media-mismatch' });
  }
  const inspected = inspectJson(candidate.contents, policy);
  const sourceTraceBound =
    candidate.kind === 'trace' ||
    candidate.kind === 'console-summary' ||
    candidate.kind === 'replay-record';
  if (
    inspected === undefined ||
    !isVerificationStructuredArtifactKind(candidate.kind) ||
    (sourceTraceBound && candidate.sourceTraceDigest === undefined) ||
    !decodeVerificationArtifactEnvelope(inspected.value, candidate.kind, {
      ...(candidate.sourceTraceDigest
        ? { expectedSourceTraceDigest: candidate.sourceTraceDigest }
        : {}),
    }).ok
  ) {
    return Object.freeze({ accepted: false, reason: 'invalid-json' });
  }
  return Object.freeze({ accepted: true, inspectionText: inspected.text });
};
