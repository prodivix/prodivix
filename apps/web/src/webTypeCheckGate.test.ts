import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `pnpm --filter @prodivix/web typecheck` builds `apps/web/tsconfig.json`, and CI plus
 * every `verify:g2:*` gate runs that command. These assertions pin the guarantees that
 * command is expected to provide, so a local override cannot silently disable the only
 * type gate covering the editor surface.
 */

const webRoot = process.cwd();
const repoRoot = resolve(webRoot, '../..');

type TsConfig = Readonly<{
  compilerOptions?: Record<string, unknown>;
  include?: readonly string[];
}>;

const readTsConfig = (path: string): TsConfig =>
  JSON.parse(readFileSync(path, 'utf8')) as TsConfig;

const baseConfig = readTsConfig(resolve(repoRoot, 'tsconfig.base.json'));
const webConfig = readTsConfig(resolve(webRoot, 'tsconfig.json'));

const effectiveOption = (name: string): unknown =>
  webConfig.compilerOptions?.[name] ?? baseConfig.compilerOptions?.[name];

describe('web type check gate', () => {
  it.each(['strict', 'noUnusedLocals', 'noUnusedParameters'])(
    'keeps %s enabled for the project the type gate builds',
    (option) => {
      expect(effectiveOption(option)).toBe(true);
    }
  );

  it('type checks the package build configuration, not only src', () => {
    expect(webConfig.include).toContain('vite.config.ts');
    expect(webConfig.include).toContain('vitest.config.ts');
  });
});
