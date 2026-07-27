export const normalizeBaseURL = (baseURL: string) => {
  let end = baseURL.length;
  while (end > 0 && baseURL[end - 1] === '/') {
    end -= 1;
  }
  return baseURL.slice(0, end);
};

export const parseHttpUrl = (url: string): URL | null => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
      ? parsed
      : null;
  } catch {
    return null;
  }
};

/** Every address in 127.0.0.0/8 is loopback, but only as an IPv4 literal. */
const isLoopbackIPv4Literal = (hostname: string): boolean => {
  const octets = hostname.split('.');
  if (octets.length !== 4) return false;
  if (!octets.every((octet) => /^(0|[1-9]\d{0,2})$/.test(octet))) return false;
  const values = octets.map(Number);
  return values[0] === 127 && values.every((value) => value <= 255);
};

/**
 * True when a request to `hostname` cannot leave the machine.
 *
 * The tempting shortcut — `hostname.startsWith('127.')` — matches the
 * registrable domain `127.evil.com`, so the whole 127.0.0.0/8 range is
 * recognised by parsing the literal instead. `*.localhost` is included because
 * RFC 6761 reserves the name and requires it to resolve to loopback.
 */
export const isLoopbackHostname = (hostname: string): boolean => {
  const bare =
    hostname.startsWith('[') && hostname.endsWith(']')
      ? hostname.slice(1, -1)
      : hostname;
  const lower = bare.toLowerCase();
  if (lower === 'localhost' || lower.endsWith('.localhost')) return true;
  if (lower === '::1' || lower === '0:0:0:0:0:0:0:1') return true;
  return isLoopbackIPv4Literal(lower);
};

/**
 * True when a credential may be sent to `url`: TLS terminates it, or the
 * request never leaves the machine. Every caller that attaches an
 * `Authorization` header, a broker token or a session secret to a configurable
 * endpoint asks this same question, so it is answered once here.
 */
export const carriesCredentialsSafely = (url: URL): boolean =>
  url.protocol === 'https:' ||
  (url.protocol === 'http:' && isLoopbackHostname(url.hostname));
