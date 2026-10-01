import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const appRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const distRoot = path.join(appRoot, 'dist');
const args = new Map(
  process.argv.slice(2).reduce((entries, value, index, values) => {
    if (value.startsWith('--')) entries.push([value, values[index + 1]]);
    return entries;
  }, [])
);
const port = Number(args.get('--port') ?? process.env.PORT ?? 4174);
const host = args.get('--host') ?? '127.0.0.1';
const headers = JSON.parse(
  readFileSync(path.join(distRoot, 'security-headers.json'), 'utf8')
);
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '': 'application/octet-stream',
};

const server = createServer((request, response) => {
  const requestUrl = new URL(request.url ?? '/', `http://${host}:${port}`);
  const route =
    requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname;
  let decodedRoute;
  try {
    decodedRoute = decodeURIComponent(route);
  } catch {
    response.writeHead(400).end();
    return;
  }
  const filePath = path.resolve(distRoot, `.${decodedRoute}`);
  if (
    !filePath.startsWith(`${distRoot}${path.sep}`) ||
    !existsSync(filePath) ||
    !statSync(filePath).isFile()
  ) {
    response.writeHead(404, {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    response.end();
    return;
  }
  const routeHeaders = headers[decodedRoute] ?? {
    'Cache-Control': 'no-store',
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
  };
  response.writeHead(200, {
    ...routeHeaders,
    'Content-Type': contentTypes[path.extname(filePath)] ?? contentTypes[''],
  });
  if (request.method === 'HEAD') {
    response.end();
    return;
  }
  createReadStream(filePath).pipe(response);
});

server.listen(port, host, () => {
  console.log(`Plugin sandbox origin listening on http://${host}:${port}`);
});

const shutdown = () => server.close(() => process.exit(0));
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
