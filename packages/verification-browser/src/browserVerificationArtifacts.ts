import { canonicalJsonText } from '@prodivix/shared/canonical';
import {
  decodeVerificationArtifactEnvelope,
  type VerificationArtifactKind,
  type VerificationStructuredArtifactEnvelope,
  type VerificationStructuredArtifactKind,
} from '@prodivix/verification';
import { digestBrowserVerificationBytes } from './browserVerificationCellInput';
import { strictIdentifier } from './privateBoundary';
import { decodeRgbaPng, encodeRgbaPng } from './rgbaPng';

export type PreparedBrowserVerificationArtifact = Readonly<{
  id: string;
  kind: VerificationArtifactKind;
  mediaType: string;
  bytes: Uint8Array;
  digest: string;
  size: number;
}>;

export const createStructuredBrowserVerificationArtifact = <
  K extends VerificationStructuredArtifactKind,
>(
  input: Readonly<{
    id: string;
    kind: K;
    envelope: Extract<
      VerificationStructuredArtifactEnvelope,
      Readonly<{ kind: K }>
    >;
    expectedSourceTraceDigest?: string;
  }>
): PreparedBrowserVerificationArtifact => {
  const decoded = decodeVerificationArtifactEnvelope(
    input.envelope,
    input.kind,
    input.expectedSourceTraceDigest === undefined
      ? {}
      : { expectedSourceTraceDigest: input.expectedSourceTraceDigest }
  );
  if (!decoded.ok) {
    throw new TypeError(
      `Browser artifact envelope is invalid: ${decoded.issues[0]?.path ?? '/'}.`
    );
  }
  const bytes = new TextEncoder().encode(canonicalJsonText(decoded.value));
  return Object.freeze({
    id: strictIdentifier(input.id, '$.artifact.id'),
    kind: input.kind,
    mediaType: `application/vnd.prodivix.${input.kind}+json`,
    bytes,
    digest: digestBrowserVerificationBytes(bytes),
    size: bytes.byteLength,
  });
};

export const createPngBrowserVerificationArtifact = (
  input: Readonly<{
    id: string;
    kind: 'screenshot' | 'visual-diff';
    bytes: Uint8Array;
  }>
): PreparedBrowserVerificationArtifact => {
  const supplied = new Uint8Array(input.bytes);
  const bytes = encodeRgbaPng(decodeRgbaPng(supplied));
  if (
    bytes.byteLength !== supplied.byteLength ||
    bytes.some((byte, index) => byte !== supplied[index])
  ) {
    throw new TypeError(
      'Browser raster artifact must use the canonical metadata-free RGBA PNG encoding.'
    );
  }
  return Object.freeze({
    id: strictIdentifier(input.id, '$.artifact.id'),
    kind: input.kind,
    mediaType: 'image/png',
    bytes,
    digest: digestBrowserVerificationBytes(bytes),
    size: bytes.byteLength,
  });
};
