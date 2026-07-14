import {
  tryNormalizePirDocument,
  type PIRDecodeResult,
  type PIRDocument,
} from '@prodivix/pir';

/** Safely normalizes unknown Workspace content through the canonical PIR codec. */
export const tryNormalizeWorkspacePirContent = (
  content: unknown
): PIRDecodeResult => {
  try {
    return tryNormalizePirDocument(content as PIRDocument);
  } catch (cause) {
    return {
      ok: false,
      issues: [
        {
          code: 'PIR_WIRE_INVALID',
          path: '$',
          message:
            cause instanceof Error
              ? cause.message
              : 'PIR content could not be normalized.',
        },
      ],
    };
  }
};
