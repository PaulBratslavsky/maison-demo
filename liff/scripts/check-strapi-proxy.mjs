// Checks the app's Strapi proxy end to end, the way LINE mode serves it: the production build (`next start`, with
// Next's compression on) in front of a stand-in for Strapi, both on free ports. Run `npm run build` first.
//   - an MCP answer streams: its first event arrives before Strapi writes the second, 1.5 s later
//   - the token endpoint's answer, status and Retry-After come back as Strapi sent them
//   - a catalog image comes back byte for byte
//   - nothing else reaches Strapi: /admin, the OAuth authorize and register pages, Maison's REST API, /.well-known,
//     /_health, and a climb out of /uploads
//   - every answer says which LIFF the build signs in with (X-Maison-Liff), which `npm run tunnel` checks
// From liff/: node scripts/check-strapi-proxy.mjs. Exits 1 on the first failed check.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const freePort = () =>
  new Promise((resolve) => {
    const server = createServer().listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });

// The stand-in for Strapi records every path it's asked for.
const reached = [];
const strapi = createServer((req, res) => {
  reached.push(`${req.method} ${req.url}`);
  if (req.url === '/mcp') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
    res.write('event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{}}\n\n');
    setTimeout(() => res.end('event: message\ndata: {"jsonrpc":"2.0","id":2,"result":{}}\n\n'), 1500);
  } else if (req.url === '/api/strapi-oauth-mcp-manager/oauth/token') {
    res.writeHead(503, { 'Content-Type': 'application/json', 'Retry-After': '5' });
    res.end('{"error":"temporarily_unavailable"}');
  } else if (req.url === '/uploads/weekender_50.png') {
    res.writeHead(200, { 'Content-Type': 'image/png' });
    res.end(PNG);
  } else {
    res.writeHead(200);
    res.end('Strapi was reached');
  }
});
await new Promise((resolve) => strapi.listen(0, '127.0.0.1', resolve));
const appPort = await freePort();
const app = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', String(appPort)], {
  env: { ...process.env, STRAPI_URL: `http://127.0.0.1:${strapi.address().port}` },
  stdio: ['ignore', 'ignore', 'inherit'],
});
process.on('exit', () => app.kill('SIGTERM')); // also when a check throws
const base = `http://127.0.0.1:${appPort}`;

let failed = false;
const check = (ok, label) => {
  console.log(`${ok ? 'ok' : 'FAILED'}: ${label}`);
  if (!ok) failed = true;
};
try {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    try {
      await fetch(`${base}/`);
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  const home = await fetch(`${base}/`);
  const liff = home.headers.get('x-maison-liff');
  check(home.status === 200 && (liff === 'mock' || liff === 'line'), `the app answers with X-Maison-Liff: ${liff}`);

  const started = performance.now();
  const mcp = await fetch(`${base}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'Accept-Encoding': 'gzip' },
    body: '{"jsonrpc":"2.0","id":1,"method":"tools/list"}',
  });
  const reader = mcp.body.getReader();
  const first = await reader.read();
  const firstAt = performance.now() - started;
  let rest = '';
  for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) rest += new TextDecoder().decode(chunk.value);
  check(
    mcp.status === 200 && new TextDecoder().decode(first.value).includes('"id":1') && firstAt < 1000 && rest.includes('"id":2'),
    `/mcp streams: the first event after ${Math.round(firstAt)} ms, before Strapi wrote the second (1500 ms)`
  );

  const token = await fetch(`${base}/api/strapi-oauth-mcp-manager/oauth/token`, { method: 'POST', body: 'grant_type=x' });
  check(
    token.status === 503 && token.headers.get('retry-after') === '5' && (await token.json()).error === 'temporarily_unavailable',
    'the token endpoint passes back 503, Retry-After: 5 and temporarily_unavailable'
  );

  const image = await fetch(`${base}/uploads/weekender_50.png`);
  check(image.headers.get('content-type') === 'image/png' && Buffer.from(await image.arrayBuffer()).equals(PNG), '/uploads serves the image');

  const before = reached.length;
  for (const [method, path] of [
    ['GET', '/admin'],
    ['GET', '/admin/init'],
    ['GET', '/api/strapi-oauth-mcp-manager/oauth/authorize'],
    ['POST', '/api/strapi-oauth-mcp-manager/oauth/register'],
    ['GET', '/api/maison/collections'],
    ['GET', '/.well-known/oauth-authorization-server'],
    ['GET', '/_health'],
    ['GET', '/uploads/..%2fadmin%2finit'],
  ]) {
    const response = await fetch(`${base}${path}`, { method });
    check(response.status === 404, `${method} ${path} answers 404 from the app`);
  }
  check(reached.length === before, `Strapi was reached only for the three proxied paths (${reached.join(', ')})`);
} finally {
  app.kill('SIGTERM');
  strapi.close();
}
process.exitCode = failed ? 1 : 0;
