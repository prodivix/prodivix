import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

it('ships a runnable stdio DAP entry with all runtime dependencies bundled', () => {
  const input = [
    {
      seq: 1,
      type: 'request',
      command: 'initialize',
      arguments: { adapterID: 'prodivix', pathFormat: 'path' },
    },
    { seq: 2, type: 'request', command: 'terminate', arguments: {} },
  ]
    .map((request) => {
      const body = JSON.stringify(request);
      return `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`;
    })
    .join('');
  const processResult = spawnSync(
    process.execPath,
    [fileURLToPath(new URL('../../dist/debugAdapter.js', import.meta.url))],
    { input, encoding: 'utf8', timeout: 5_000, windowsHide: true }
  );
  expect(processResult.error).toBeUndefined();
  expect(processResult.status).toBe(0);
  expect(processResult.stderr).toBe('');
  const messages: { command?: string; success?: boolean; event?: string }[] =
    [];
  let buffer = Buffer.from(processResult.stdout);
  while (buffer.length > 0) {
    const headerEnd = buffer.indexOf('\r\n\r\n');
    const length = Number(
      /Content-Length: (\d+)/.exec(
        buffer.subarray(0, headerEnd).toString()
      )?.[1]
    );
    messages.push(
      JSON.parse(
        buffer.subarray(headerEnd + 4, headerEnd + 4 + length).toString('utf8')
      )
    );
    buffer = buffer.subarray(headerEnd + 4 + length);
  }
  expect(
    messages.find(({ command }) => command === 'initialize')?.success
  ).toBe(true);
  expect(messages.find(({ command }) => command === 'terminate')?.success).toBe(
    true
  );
  expect(messages.some(({ event }) => event === 'terminated')).toBe(true);
});
