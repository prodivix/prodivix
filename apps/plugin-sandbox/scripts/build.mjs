import { createHash } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import {
  createSandboxSecurityPolicy,
  renderCloudflareHeaders,
  renderNginxConfig,
} from './security-policy.mjs';

const appRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const distRoot = path.join(appRoot, 'dist');

const bundle = async (entry, fileName) => {
  const result = await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      write: false,
      target: 'es2022',
      minify: true,
      sourcemap: false,
      lib: {
        entry: path.join(appRoot, entry),
        formats: ['es'],
        fileName: () => fileName,
      },
      rollupOptions: {
        output: { codeSplitting: false },
      },
    },
  });
  const outputs = Array.isArray(result) ? result : [result];
  const chunk = outputs
    .flatMap((output) => output.output)
    .find((output) => output.type === 'chunk' && output.isEntry);
  if (!chunk || chunk.type !== 'chunk') {
    throw new Error(`Sandbox build did not emit ${fileName}.`);
  }
  return chunk.code;
};

const sha256 = (source) =>
  `sha256-${createHash('sha256').update(source).digest('base64')}`;

const runtimeSource = await bundle(
  'src/runtimeBroker.ts',
  'runtime-broker.js'
);
const uiSource = await bundle('src/uiConformance.ts', 'ui-conformance.js');
const runtimeHash = sha256(runtimeSource);
const uiHash = sha256(uiSource);

const headers = createSandboxSecurityPolicy({ runtimeHash, uiHash });

const html = (title, script, integrity) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="referrer" content="no-referrer" />
    <title>${title}</title>
  </head>
  <body>
    <script type="module" src="/${script}" integrity="${integrity}" crossorigin="anonymous"></script>
  </body>
</html>
`;

const cloudflareHeaders = renderCloudflareHeaders(headers);
const nginxConfig = renderNginxConfig(headers);

await rm(distRoot, { recursive: true, force: true });
await mkdir(distRoot, { recursive: true });
await Promise.all([
  writeFile(path.join(distRoot, 'runtime-broker.js'), runtimeSource, 'utf8'),
  writeFile(path.join(distRoot, 'ui-conformance.js'), uiSource, 'utf8'),
  writeFile(
    path.join(distRoot, 'runtime-broker.html'),
    html('Prodivix Runtime Sandbox', 'runtime-broker.js', runtimeHash),
    'utf8'
  ),
  writeFile(
    path.join(distRoot, 'ui-conformance.html'),
    html('Prodivix UI Sandbox', 'ui-conformance.js', uiHash),
    'utf8'
  ),
  writeFile(
    path.join(distRoot, 'index.html'),
    '<!doctype html><html lang="en"><title>Prodivix Sandbox</title></html>\n',
    'utf8'
  ),
  writeFile(
    path.join(distRoot, 'security-headers.json'),
    `${JSON.stringify(headers, null, 2)}\n`,
    'utf8'
  ),
  writeFile(path.join(distRoot, '_headers'), `${cloudflareHeaders}\n`, 'utf8'),
  writeFile(path.join(distRoot, 'nginx.conf'), nginxConfig, 'utf8'),
]);

console.log('Built dedicated plugin sandbox origin.');
