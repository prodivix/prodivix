import { createRequire } from 'node:module';
import { open } from 'node:fs/promises';
import { decodeG3DriverConfiguration } from '#src/g3/config.js';
import { createG3DriverService } from '#src/g3/service.js';
globalThis.require = createRequire(import.meta.url);
if (process.argv.includes('--help'))
  process.stdout.write(
    'Prodivix ordinary G3 production driver\nUsage: agent-g3-driver <configuration.json>\nListens on 127.0.0.1 behind a configured TLS reverse proxy. No model or evaluation authority is accepted.\n'
  );
else {
  const path = process.argv[2];
  if (!path || path.startsWith('--'))
    throw new Error('G3 driver configuration path is required.');
  const handle = await open(path, 'r');
  let source: string;
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > 1048576)
      throw new Error('G3 configuration exceeds its limit.');
    const bytes = Buffer.alloc(stat.size + 1);
    const count = await handle.read(bytes, 0, bytes.length, 0);
    if (count.bytesRead !== stat.size)
      throw new Error('G3 configuration changed while being read.');
    source = new TextDecoder('utf8', { fatal: true }).decode(
      bytes.subarray(0, count.bytesRead)
    );
  } finally {
    await handle.close();
  }
  const config = decodeG3DriverConfiguration(JSON.parse(source));
  const service = await createG3DriverService(config);
  await new Promise<void>((resolve, reject) => {
    service.server.once('error', reject);
    service.server.listen(config.port, '127.0.0.1', () => {
      service.server.removeListener('error', reject);
      resolve();
    });
  });
  process.stdout.write(
    'Prodivix ordinary G3 driver is listening. Resource qualification is checked before preflight or dispatch.\n'
  );
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    void service.close().catch(() => {
      process.exitCode = 1;
    });
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}
