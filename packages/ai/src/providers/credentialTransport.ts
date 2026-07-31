import { AiDraftProviderError } from '../draft/draft.types';
import {
  carriesCredentialsSafely,
  normalizeBaseURL,
} from '@prodivix/shared/safety';

export type OpenAICompatibleCredentialTransportIssue =
  'invalid-base-url' | 'insecure-base-url';

/**
 * A provider credential leaves the caller as an `Authorization` header, so the
 * base URL must terminate somewhere it cannot be read off the wire. Loopback
 * stays allowed because a locally hosted model server has no TLS endpoint, and a
 * credential-free base URL is unconstrained because nothing secret is sent.
 */
export const readOpenAICompatibleCredentialTransportIssue = (
  baseURL: string,
  apiKey: string | undefined
): OpenAICompatibleCredentialTransportIssue | undefined => {
  if (!apiKey) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(normalizeBaseURL(baseURL));
  } catch {
    return 'invalid-base-url';
  }
  return carriesCredentialsSafely(parsed) ? undefined : 'insecure-base-url';
};

/** Fails closed before any request that would carry the credential. */
export const assertOpenAICompatibleCredentialTransport = (
  baseURL: string,
  apiKey: string | undefined
): void => {
  const issue = readOpenAICompatibleCredentialTransportIssue(baseURL, apiKey);
  if (!issue) return;
  throw new AiDraftProviderError(
    issue === 'invalid-base-url'
      ? 'OpenAI-compatible provider base URL is not a valid absolute URL.'
      : 'OpenAI-compatible provider API key requires an https base URL outside loopback.',
    { code: 'AI-1010' }
  );
};
