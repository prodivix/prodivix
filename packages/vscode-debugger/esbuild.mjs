import { build } from 'esbuild';

await build({
  entryPoints: ['src/debugAdapter.ts'],
  outfile: 'lib/debugAdapter.js',
  platform: 'node',
  mainFields: ['module', 'main'],
  format: 'esm',
  bundle: true,
  external: ['@vscode/debugadapter'],
});
await build({
  entryPoints: ['src/debugAdapterMain.ts'],
  outfile: 'lib/debugAdapterMain.cjs',
  platform: 'node',
  mainFields: ['module', 'main'],
  format: 'cjs',
  bundle: true,
});
