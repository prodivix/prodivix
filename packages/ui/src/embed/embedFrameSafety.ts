import {
  parseHttpUrl,
  resolveSafeEmbedUrl,
  type SafeEmbedType,
} from '@prodivix/shared/safety';

/**
 * Shared hardening for every `<iframe>` rendered by `@prodivix/ui`.
 *
 * Embed components receive their props from untrusted authoring input: a PIR node
 * prop bag reaches the component unfiltered (`prodivixLeafAdapter` declares no prop
 * schema), so an imported document, shared template, plugin contribution or AI
 * output can set any prop. The invariant enforced here is that a framed document
 * can never script the embedder origin, no matter which props arrive.
 */

/** Loaded instead of an unsafe or unresolvable URL; never falls back to `''`, which resolves to the embedder document. */
export const BLANK_FRAME_SRC = 'about:blank';

/** Prop names that would let a caller replace the framed document or bypass the resolved sandbox. */
const BLOCKED_FRAME_PROP_NAMES = new Set([
  'children',
  'dangerouslysetinnerhtml',
  'sandbox',
  'src',
  'srcdoc',
]);

/**
 * Sandbox tokens an author may request. `allow-top-navigation` is deliberately
 * absent: only its user-activation-gated form is accepted.
 */
const ALLOWED_SANDBOX_TOKENS = new Set([
  'allow-downloads',
  'allow-forms',
  'allow-modals',
  'allow-orientation-lock',
  'allow-pointer-lock',
  'allow-popups',
  'allow-popups-to-escape-sandbox',
  'allow-presentation',
  'allow-same-origin',
  'allow-scripts',
  'allow-storage-access-by-user-activation',
  'allow-top-navigation-by-user-activation',
]);

const DEFAULT_SANDBOX_TOKENS = [
  'allow-forms',
  'allow-popups',
  'allow-presentation',
  'allow-same-origin',
  'allow-scripts',
];

export interface FrameSandboxInput {
  /** Author-supplied token string. Unknown tokens are dropped; an empty result stays empty (maximally restrictive). */
  requested?: string;
  /** The already-resolved URL the frame will load. */
  src: string;
  /** True when the frame renders an inline `srcdoc` document. */
  inlineDocument?: boolean;
}

const readEmbedderOrigin = () => {
  const origin = globalThis.location?.origin;
  return origin && origin !== 'null' ? origin : null;
};

/**
 * An inline document always inherits the embedder origin, and so does any URL we
 * cannot prove to be cross-origin. Both cases must lose `allow-same-origin`.
 */
const inheritsEmbedderOrigin = (src: string) => {
  const parsed = parseHttpUrl(src);
  if (!parsed) return true;

  const embedderOrigin = readEmbedderOrigin();
  if (!embedderOrigin) return true;

  return parsed.origin === embedderOrigin;
};

/**
 * Always returns a sandbox token string, so the attribute is always emitted and the
 * frame can never inherit the embedder origin implicitly. `allow-scripts` combined
 * with `allow-same-origin` lets a framed document remove its own sandbox, so
 * `allow-same-origin` is dropped whenever the framed document could be same-origin
 * with the embedder.
 */
export const resolveFrameSandbox = ({
  requested,
  src,
  inlineDocument = false,
}: FrameSandboxInput): string => {
  const requestedTokens = requested?.trim().length
    ? requested.trim().toLowerCase().split(/\s+/u)
    : undefined;
  const tokens = new Set(
    (requestedTokens ?? DEFAULT_SANDBOX_TOKENS).filter((token) =>
      ALLOWED_SANDBOX_TOKENS.has(token)
    )
  );

  if (
    tokens.has('allow-scripts') &&
    (inlineDocument || inheritsEmbedderOrigin(src))
  ) {
    tokens.delete('allow-same-origin');
  }

  return [...tokens].sort().join(' ');
};

/** Resolves an author-supplied URL through the shared embed policy, never returning a document-relative `''`. */
export const resolveSafeFrameSrc = (
  type: SafeEmbedType,
  url: string | undefined
): string => (url ? resolveSafeEmbedUrl(type, url) : '') || BLANK_FRAME_SRC;

/** Drops pass-through props that could replace the framed document or override the resolved sandbox. */
export const filterFramePassThroughProps = <Props extends object>(
  props: Props
): Props =>
  Object.fromEntries(
    Object.entries(props).filter(
      ([name]) => !BLOCKED_FRAME_PROP_NAMES.has(name.toLowerCase())
    )
  ) as Props;
