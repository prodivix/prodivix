import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The icon registry used to be the one place that pulled a third-party module
 * into the editor origin, and the deployed `Content-Security-Policy` had to
 * allowlist that CDN for it to work. Now that every icon runtime is a bundled
 * workspace dependency, the editor needs no remote script origin at all; this
 * conformance test keeps that closed so a future icon (or any other) provider
 * cannot quietly re-open script execution for a host that would see the API
 * session token and the AI provider key held by this origin.
 */
const EDITOR_NGINX_CONF_RELATIVE_PATH = 'apps/web/docker/nginx.conf';

const resolveEditorNginxConfPath = () => {
  let current = process.cwd();
  for (let depth = 0; depth < 8; depth += 1) {
    const candidate = resolve(current, EDITOR_NGINX_CONF_RELATIVE_PATH);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  throw new Error(
    `Unable to locate ${EDITOR_NGINX_CONF_RELATIVE_PATH} from ${process.cwd()}.`
  );
};

const readEditorContentSecurityPolicy = () => {
  const conf = readFileSync(resolveEditorNginxConfPath(), 'utf8');
  const match = conf.match(/add_header\s+Content-Security-Policy\s+"([^"]*)"/i);
  return match?.[1] ?? null;
};

const parseDirectives = (policy: string) => {
  const directives = new Map<string, string[]>();
  policy
    .split(';')
    .map((directive) => directive.trim())
    .filter((directive) => directive !== '')
    .forEach((directive) => {
      const [name, ...sources] = directive.split(/\s+/);
      directives.set(name.toLowerCase(), sources);
    });
  return directives;
};

/** Keyword sources such as `'self'`; anything else names a fetchable host. */
const isKeywordSource = (source: string) => source.startsWith("'");

describe('deployed editor content security policy', () => {
  it('allows no third-party script origin', () => {
    const policy = readEditorContentSecurityPolicy();
    expect(policy).not.toBeNull();
    const directives = parseDirectives(policy ?? '');

    const scriptSrc = directives.get('script-src') ?? [];
    expect(scriptSrc).toContain("'self'");
    expect(scriptSrc.filter((source) => !isKeywordSource(source))).toEqual([]);
  });

  it('keeps the origin-isolating directives', () => {
    const directives = parseDirectives(readEditorContentSecurityPolicy() ?? '');

    expect(directives.get('default-src') ?? []).toEqual(["'self'"]);
    expect(directives.get('object-src') ?? []).toEqual(["'none'"]);
    expect(directives.get('base-uri') ?? []).toEqual(["'none'"]);
    expect(directives.get('frame-ancestors') ?? []).toEqual(["'none'"]);
    expect(directives.get('form-action') ?? []).toEqual(["'self'"]);
    expect(directives.get('connect-src') ?? []).toContain("'self'");
  });
});
