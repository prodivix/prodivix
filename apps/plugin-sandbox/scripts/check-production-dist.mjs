import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const distRoot = path.join(appRoot, 'dist');
const readDist = (fileName) =>
  readFile(path.join(distRoot, fileName), 'utf8');
const digest = (source) =>
  `sha256-${createHash('sha256').update(source).digest('base64')}`;

const [
  runtimeSource,
  uiSource,
  runtimeHtml,
  uiHtml,
  serializedHeaders,
  cloudflareHeaders,
  nginxConfig,
] = await Promise.all([
  readDist('runtime-broker.js'),
  readDist('ui-conformance.js'),
  readDist('runtime-broker.html'),
  readDist('ui-conformance.html'),
  readDist('security-headers.json'),
  readDist('_headers'),
  readDist('nginx.conf'),
]);

const headers = JSON.parse(serializedHeaders);
const routes = Object.keys(headers).sort();
assert.deepEqual(routes, [
  '/index.html',
  '/runtime-broker.html',
  '/runtime-broker.js',
  '/ui-conformance.html',
  '/ui-conformance.js',
]);

const runtimeHash = digest(runtimeSource);
const uiHash = digest(uiSource);
const runtimePolicy = headers['/runtime-broker.html'];
const uiPolicy = headers['/ui-conformance.html'];
const runtimeScriptPolicy = headers['/runtime-broker.js'];

for (const [route, policy] of Object.entries(headers)) {
  assert.equal(policy['Cache-Control'], 'no-store', `${route} cache policy`);
  assert.equal(
    policy['Cross-Origin-Resource-Policy'],
    'cross-origin',
    `${route} cross-origin resource policy`
  );
  assert.equal(policy['Referrer-Policy'], 'no-referrer');
  assert.equal(policy['X-Content-Type-Options'], 'nosniff');
  assert.equal(policy['Set-Cookie'], undefined);
  assert.match(policy['Permissions-Policy'], /geolocation=\(\)/);
  assert.match(policy['Permissions-Policy'], /camera=\(\)/);

  assert.match(cloudflareHeaders, new RegExp(`^${route}$`, 'm'));
  assert.match(nginxConfig, new RegExp(`location = ${route.replaceAll('.', '\\.')} \\{`));
  for (const [name, value] of Object.entries(policy)) {
    assert.ok(cloudflareHeaders.includes(`  ${name}: ${value}`));
    assert.ok(nginxConfig.includes(`add_header ${name} "${value}" always;`));
  }
}

assert.ok(runtimeHtml.includes(`integrity="${runtimeHash}"`));
assert.ok(uiHtml.includes(`integrity="${uiHash}"`));
assert.ok(
  runtimePolicy['Content-Security-Policy'].includes(
    `script-src '${runtimeHash}' blob:`
  )
);
assert.ok(
  runtimePolicy['Content-Security-Policy'].includes('worker-src blob:')
);
assert.ok(
  uiPolicy['Content-Security-Policy'].includes(`script-src '${uiHash}'`)
);
assert.ok(uiPolicy['Content-Security-Policy'].includes("worker-src 'none'"));
assert.equal(runtimeScriptPolicy['Access-Control-Allow-Origin'], '*');
assert.ok(!serializedHeaders.includes('unsafe-eval'));
assert.ok(!serializedHeaders.includes('unsafe-inline'));
assert.ok(nginxConfig.includes('listen 8080;'));
assert.ok(nginxConfig.includes('location / { return 404; }'));

console.log('Plugin sandbox production artifacts satisfy the security policy.');
