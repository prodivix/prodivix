import {
  decodeExecutionBuildBundle,
  EXECUTION_BUILD_BUNDLE_MEDIA_TYPE,
} from './executionBuildBundle';
import {
  decodeExecutionPreviewBundle,
  EXECUTION_PREVIEW_BUNDLE_MEDIA_TYPE,
} from './executionPreviewBundle';
import { decodeExecutionFilesystemDiff } from './executionFilesystemDiff';
import { EXECUTION_FILESYSTEM_DIFF_MEDIA_TYPE } from './executionFilesystemDiff.types';
import type {
  ExecutionSecretLeakGuard,
  ExecutionSecretLeakInspection,
  ExecutionSecretLeakSurface,
} from './executionSecretLeakGuard';

/**
 * Artifact media types whose envelope stores every file body base64-encoded, so
 * the protected bytes never appear literally in the published payload. Scanning
 * the envelope alone fails open; each payload must be decoded first.
 */
const encodedArtifactPayloadReaders = new Map<
  string,
  (contents: Uint8Array) => readonly Uint8Array[]
>([
  [
    EXECUTION_FILESYSTEM_DIFF_MEDIA_TYPE,
    (contents) =>
      decodeExecutionFilesystemDiff(contents).changes.flatMap((change) => [
        ...(change.baseline ? [change.baseline.contents] : []),
        ...(change.runtime ? [change.runtime.contents] : []),
      ]),
  ],
  [
    EXECUTION_BUILD_BUNDLE_MEDIA_TYPE,
    (contents) =>
      decodeExecutionBuildBundle(contents).files.map((file) => file.contents),
  ],
  [
    EXECUTION_PREVIEW_BUNDLE_MEDIA_TYPE,
    (contents) =>
      decodeExecutionPreviewBundle(contents).files.map((file) => file.contents),
  ],
]);

/**
 * Fails closed on every artifact payload the execution pipeline can publish.
 * Raw envelope bytes are still inspected, and encoded envelopes are additionally
 * decoded so a protected value written to a captured file cannot pass the guard
 * just because the transport re-encoded it. An envelope that no longer decodes
 * is reported as uninspectable rather than accepted.
 */
export const inspectExecutionArtifactContents = (
  guard: ExecutionSecretLeakGuard,
  surface: ExecutionSecretLeakSurface,
  mediaType: string,
  contents: Uint8Array
): ExecutionSecretLeakInspection => {
  const envelope = guard.inspectBytes(surface, contents);
  if (!envelope.safe) return envelope;
  const readPayloads = encodedArtifactPayloadReaders.get(mediaType);
  if (!readPayloads) return envelope;
  let payloads: readonly Uint8Array[];
  try {
    payloads = readPayloads(contents);
  } catch {
    return Object.freeze({
      safe: false as const,
      surface,
      reason: 'uninspectable' as const,
    });
  }
  for (const payload of payloads) {
    const inspection = guard.inspectBytes(surface, payload);
    if (!inspection.safe) return inspection;
  }
  return envelope;
};
