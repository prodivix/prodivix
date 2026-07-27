import { describe, expect, it } from 'vitest';
import { carriesCredentialsSafely, isLoopbackHostname } from '../index';

describe('isLoopbackHostname', () => {
  it('rejects a registrable domain that merely starts with 127.', () => {
    // The reason this function exists rather than `startsWith('127.')`:
    // `127.evil.com` is a name anyone can register, and the shortcut treats it
    // as loopback — which would send a credential in plaintext to the holder.
    expect('127.evil.com'.startsWith('127.')).toBe(true);
    expect(isLoopbackHostname('127.evil.com')).toBe(false);
    expect(isLoopbackHostname('localhost.attacker.com')).toBe(false);
  });

  it('accepts the whole 127.0.0.0/8 range as an IPv4 literal', () => {
    ['127.0.0.1', '127.1.2.3', '127.255.255.254'].forEach((hostname) =>
      expect(isLoopbackHostname(hostname), hostname).toBe(true)
    );
  });

  it('rejects malformed literals that are not addresses at all', () => {
    ['1270.0.0.1', '127.0.0.256', '127.0.0', '127.0.0.1.5', '127.a.b.c'].forEach(
      (hostname) => expect(isLoopbackHostname(hostname), hostname).toBe(false)
    );
  });

  it('accepts localhost and the RFC 6761 reserved subtree', () => {
    ['localhost', 'LOCALHOST', 'api.localhost', 'a.b.localhost'].forEach(
      (hostname) => expect(isLoopbackHostname(hostname), hostname).toBe(true)
    );
  });

  it('accepts IPv6 loopback with or without brackets', () => {
    ['::1', '[::1]', '0:0:0:0:0:0:0:1'].forEach((hostname) =>
      expect(isLoopbackHostname(hostname), hostname).toBe(true)
    );
  });

  it('rejects ordinary public hostnames', () => {
    ['api.openai.com', 'example.com', '8.8.8.8'].forEach((hostname) =>
      expect(isLoopbackHostname(hostname), hostname).toBe(false)
    );
  });
});

describe('carriesCredentialsSafely', () => {
  it('allows TLS to any host and plaintext only to loopback', () => {
    expect(carriesCredentialsSafely(new URL('https://api.openai.com/v1'))).toBe(
      true
    );
    expect(carriesCredentialsSafely(new URL('http://127.0.0.1:11434/v1'))).toBe(
      true
    );
    expect(carriesCredentialsSafely(new URL('http://api.openai.com/v1'))).toBe(
      false
    );
    expect(carriesCredentialsSafely(new URL('http://127.evil.com/v1'))).toBe(
      false
    );
  });

  it('refuses a scheme that is neither http nor https', () => {
    expect(carriesCredentialsSafely(new URL('ftp://127.0.0.1/v1'))).toBe(false);
  });
});
