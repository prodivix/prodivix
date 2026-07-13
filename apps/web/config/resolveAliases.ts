import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AliasOptions } from 'vite';

const configDir = fileURLToPath(new URL('.', import.meta.url));
const webRoot = resolve(configDir, '..');
const repoRoot = resolve(webRoot, '../..');

const packageSource = (packageName: string) =>
  resolve(repoRoot, `packages/${packageName}/src`);

const packageManifest = (packageName: string) =>
  resolve(repoRoot, `packages/${packageName}/package.json`);

export const createWebResolveAliases = (): AliasOptions => ({
  '@': resolve(webRoot, 'src'),
  '#src': packageSource('prodivix-compiler'),
  '@prodivix/ai': packageSource('ai'),
  '@prodivix/animation': packageSource('animation'),
  '@prodivix/authoring': packageSource('authoring'),
  '@prodivix/diagnostics': packageSource('diagnostics'),
  '@prodivix/i18n': packageSource('i18n'),
  '@prodivix/nodegraph': packageSource('nodegraph'),
  '@prodivix/plugin-antd': packageSource('plugin-antd'),
  '@prodivix/plugin-browser': packageSource('plugin-browser'),
  '@prodivix/plugin-contracts': packageSource('plugin-contracts'),
  '@prodivix/plugin-host': packageSource('plugin-host'),
  '@prodivix/plugin-mui': packageSource('plugin-mui'),
  '@prodivix/plugin-package': packageSource('plugin-package'),
  '@prodivix/plugin-protocol': packageSource('plugin-protocol'),
  '@prodivix/plugin-radix': packageSource('plugin-radix'),
  '@prodivix/plugin-react-host': packageSource('plugin-react-host'),
  '@prodivix/pir': packageSource('pir'),
  '@prodivix/pir-react-renderer': packageSource('pir-react-renderer'),
  '@prodivix/prodivix-compiler': packageSource('prodivix-compiler'),
  '@prodivix/runtime-core': packageSource('runtime-core'),
  '@prodivix/runtime-browser': packageSource('runtime-browser'),
  '@prodivix/router': packageSource('router'),
  '@prodivix/shared/safety': resolve(packageSource('shared'), 'safety'),
  '@prodivix/shared/package.json': packageManifest('shared'),
  '@prodivix/shared': packageSource('shared'),
  '@prodivix/ui/package.json': packageManifest('ui'),
  '@prodivix/ui': packageSource('ui'),
  '@prodivix/themes/package.json': packageManifest('themes'),
  '@prodivix/themes': packageSource('themes'),
  '@prodivix/workspace': packageSource('workspace'),
  '@prodivix/workspace-sync': packageSource('workspace-sync'),
  '#antd': packageSource('plugin-antd'),
  '#browser': packageSource('plugin-browser'),
  '#contracts': packageSource('plugin-contracts'),
  '#host': packageSource('plugin-host'),
  '#mui-plugin': packageSource('plugin-mui'),
  '#package': packageSource('plugin-package'),
  '#protocol': packageSource('plugin-protocol'),
  '#radix': packageSource('plugin-radix'),
  '#react-host': packageSource('plugin-react-host'),
});
