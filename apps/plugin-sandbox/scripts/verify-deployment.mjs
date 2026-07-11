import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const baseUrl = new URL(process.argv[2] ?? 'http://127.0.0.1:4174/');
const request = (path) =>
  fetch(new URL(path, baseUrl), {
    credentials: 'omit',
    redirect: 'manual',
  });
const digest = (source) =>
  `sha256-${createHash('sha256').update(source).digest('base64')}`;
const assertSharedHeaders = (response, route) => {
  assert.equal(response.status, 200, `${route} must return 200`);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(
    response.headers.get('cross-origin-resource-policy'),
    'cross-origin'
  );
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('set-cookie'), null);
  assert.match(response.headers.get('permissions-policy') ?? '', /camera=\(\)/);
  assert.match(
    response.headers.get('permissions-policy') ?? '',
    /geolocation=\(\)/
  );
};

const [runtime, ui, runtimeScript, uiScript, missing] = await Promise.all([
  request('/runtime-broker.html'),
  request('/ui-conformance.html'),
  request('/runtime-broker.js'),
  request('/ui-conformance.js'),
  request('/__prodivix_sandbox_policy_probe__'),
]);

assertSharedHeaders(runtime, '/runtime-broker.html');
assertSharedHeaders(ui, '/ui-conformance.html');
assertSharedHeaders(runtimeScript, '/runtime-broker.js');
assertSharedHeaders(uiScript, '/ui-conformance.js');
assert.equal(missing.status, 404, 'unknown sandbox routes must fail closed');

const runtimeSource = await runtimeScript.text();
const uiSource = await uiScript.text();
const runtimeCsp = runtime.headers.get('content-security-policy') ?? '';
const uiCsp = ui.headers.get('content-security-policy') ?? '';
assert.match(runtimeCsp, /default-src 'none'/);
assert.match(runtimeCsp, /connect-src 'none'/);
assert.match(runtimeCsp, /worker-src blob:/);
assert.ok(runtimeCsp.includes(`script-src '${digest(runtimeSource)}' blob:`));
assert.match(uiCsp, /default-src 'none'/);
assert.match(uiCsp, /worker-src 'none'/);
assert.ok(uiCsp.includes(`script-src '${digest(uiSource)}'`));
assert.equal(runtimeScript.headers.get('access-control-allow-origin'), '*');
assert.equal(uiScript.headers.get('access-control-allow-origin'), '*');
assert.ok(!runtimeCsp.includes('unsafe-eval'));
assert.ok(!uiCsp.includes('unsafe-inline'));

console.log(`Verified production plugin sandbox at ${baseUrl.origin}.`);
