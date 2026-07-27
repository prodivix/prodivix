import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The editor's Content-Security-Policy lives in the deployment config rather
 * than in source, so nothing type-checks it and a widening edit reads as an
 * ordinary config tweak. These assertions are the gate: each one names an
 * invariant the policy comment claims, so relaxing the policy has to be a
 * deliberate act that also edits this file.
 */
const nginxConf = readFileSync(
  resolve(process.cwd(), 'docker/nginx.conf'),
  'utf8'
);

const policy = (() => {
  const match = /add_header Content-Security-Policy "([^"]+)"/.exec(nginxConf);
  if (!match) throw new Error('nginx.conf declares no Content-Security-Policy');
  return match[1]!;
})();

const directive = (name: string): readonly string[] => {
  const found = policy
    .split(';')
    .map((part) => part.trim())
    .find((part) => part === name || part.startsWith(`${name} `));
  if (found === undefined) throw new Error(`CSP declares no ${name}`);
  return found.slice(name.length).trim().split(/\s+/).filter(Boolean);
};

describe('editor Content-Security-Policy', () => {
  it('serves scripts only from this origin', () => {
    // Every runtime the editor loads, including the icon runtimes, is a bundled
    // workspace dependency served from here. A host source or 'unsafe-inline'
    // in script-src would mean something reintroduced a remote script.
    expect(directive('script-src')).toEqual(["'self'"]);
  });

  it('allows inline styles but no remote stylesheet host', () => {
    // The PIR renderer writes style attributes per node, which is what
    // 'unsafe-inline' covers here. A host source would be a remote stylesheet.
    expect(new Set(directive('style-src'))).toEqual(
      new Set(["'self'", "'unsafe-inline'"])
    );
  });

  it.each([
    ['base-uri', "'none'"],
    ['object-src', "'none'"],
    ['frame-ancestors', "'none'"],
    ['default-src', "'self'"],
    ['form-action', "'self'"],
  ])('pins %s to %s', (name, expected) =>
    expect(directive(name)).toEqual([expected])
  );

  it('does not grant a wildcard to any directive', () => {
    const wildcarded = policy
      .split(';')
      .map((part) => part.trim())
      .filter((part) => /(^|\s)\*(\s|$)/.test(part));
    expect(wildcarded).toEqual([]);
  });

  it('limits plaintext http sources to loopback', () => {
    // A bare `http:` source would let any downgraded origin load into the
    // editor. Loopback is allowed so a local backend, sandbox or runner can be
    // pointed at during development.
    const httpSources = policy
      .split(';')
      .flatMap((part) => part.trim().split(/\s+/))
      .filter((source) => source.startsWith('http://') || source === 'http:');
    httpSources.forEach((source) =>
      expect(source, `${source} must be loopback`).toMatch(
        /^http:\/\/localhost(:\*|:\d+)?$/
      )
    );
  });

  it('keeps the widened fetch directives documented in the file', () => {
    // connect-src and frame-src carry `https:` because the AI assistant calls
    // user-configured provider endpoints from the browser and the sandbox,
    // asset and runner hosts are deployment parameters. That is a deliberate
    // trade-off, so it must stay explained where a reader will see it.
    const widened = ['connect-src', 'frame-src'].filter((name) =>
      directive(name).includes('https:')
    );
    widened.forEach((name) =>
      expect(
        nginxConf,
        `${name} allows https: without a rationale comment`
      ).toMatch(new RegExp(`#[^\\n]*${name}`))
    );
  });
});
