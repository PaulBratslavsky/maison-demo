import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterEach, describe, expect, it } from 'vitest';
import { proxyToStrapi } from './strapi-proxy';

type Seen = { method: string; url: string; headers: IncomingMessage['headers']; body: string };

/** A stand-in for Strapi on a free port. It records every request it gets. */
const upstreams: Array<{ close: () => void }> = [];
const fakeStrapi = async (handle: (req: IncomingMessage, res: ServerResponse, body: string) => void) => {
  const seen: Seen[] = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      seen.push({ method: req.method ?? '', url: req.url ?? '', headers: req.headers, body });
      handle(req, res, body);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  upstreams.push({ close: () => server.close() });
  return { strapiUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, seen };
};
afterEach(() => upstreams.splice(0).forEach((upstream) => upstream.close()));

const PUBLIC = 'https://maison.example';

describe('proxyToStrapi', () => {
  it('forwards an MCP call with only the headers it needs, and passes the answer back', async () => {
    const { strapiUrl, seen } = await fakeStrapi((_req, res) => {
      res.writeHead(401, { 'Content-Type': 'application/json', 'WWW-Authenticate': 'Bearer resource_metadata="x"', 'Set-Cookie': 'koa.sess=1' });
      res.end('{"error":"invalid_token"}');
    });
    const response = await proxyToStrapi(
      new Request(`${PUBLIC}/mcp`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer mcp_at_customer',
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          'mcp-protocol-version': '2025-06-18',
          Cookie: 'ngrok_visit=1',
          Origin: PUBLIC,
          'ngrok-skip-browser-warning': '1',
        },
        body: '{"jsonrpc":"2.0","id":1,"method":"tools/list"}',
      }),
      '/mcp',
      { strapiUrl }
    );
    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toBe('Bearer resource_metadata="x"');
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(await response.text()).toBe('{"error":"invalid_token"}');
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ method: 'POST', url: '/mcp', body: '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' });
    expect(seen[0].headers).toMatchObject({
      authorization: 'Bearer mcp_at_customer',
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': '2025-06-18',
    });
    for (const name of ['cookie', 'origin', 'ngrok-skip-browser-warning']) expect(seen[0].headers).not.toHaveProperty(name);
  });

  it('streams server-sent events as Strapi writes them', async () => {
    let release = () => {};
    const released = new Promise<void>((resolve) => (release = resolve));
    const { strapiUrl } = await fakeStrapi(async (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
      res.write('event: message\ndata: {"id":1}\n\n');
      await released; // the second event waits until the test has read the first one
      res.end('event: message\ndata: {"id":2}\n\n');
    });
    const firstEvent = (async () => {
      const response = await proxyToStrapi(new Request(`${PUBLIC}/mcp`, { method: 'POST', body: '{}' }), '/mcp', { strapiUrl });
      const reader = response.body!.getReader();
      return { reader, first: await reader.read() };
    })();
    const { reader, first } = await Promise.race([
      firstEvent,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('the first event was held back')), 2000)),
    ]);
    expect(new TextDecoder().decode(first.value)).toContain('"id":1');
    release();
    let rest = '';
    for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) rest += new TextDecoder().decode(chunk.value);
    expect(rest).toContain('"id":2');
  });

  it('serves catalog images from /uploads', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const { strapiUrl, seen } = await fakeStrapi((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': png.length });
      res.end(png);
    });
    const response = await proxyToStrapi(new Request(`${PUBLIC}/uploads/weekender_50.png`), '/uploads/weekender_50.png', { strapiUrl });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(Buffer.from(await response.arrayBuffer())).toEqual(png);
    expect(seen[0]).toMatchObject({ method: 'GET', url: '/uploads/weekender_50.png' });
  });

  it('reaches nothing on Strapi but /mcp, the token endpoint and /uploads', async () => {
    const { strapiUrl, seen } = await fakeStrapi((_req, res) => res.end('reached'));
    for (const path of [
      '/admin/init',
      '/api/strapi-oauth-mcp-manager/oauth/authorize',
      '/api/strapi-oauth-mcp-manager/oauth/register',
      '/api/maison/collections',
      '/.well-known/oauth-authorization-server',
      '/_health',
      '/uploads/../admin/init',
      // the same climb, percent-encoded: fetch would undo the first, and Strapi's file server the second
      '/uploads/%2e%2e/admin/init',
      '/uploads/..%2fadmin%2finit',
      '/uploads/',
    ]) {
      const response = await proxyToStrapi(new Request(`${PUBLIC}${path}`), path, { strapiUrl });
      expect(response.status, path).toBe(404);
    }
    expect(seen).toEqual([]);
  });

  it("answers 502 temporarily_unavailable when Strapi isn't running", async () => {
    const { strapiUrl } = await fakeStrapi(() => {});
    upstreams.splice(0).forEach((upstream) => upstream.close());
    const response = await proxyToStrapi(new Request(`${PUBLIC}/mcp`, { method: 'POST', body: '{}' }), '/mcp', { strapiUrl });
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ error: 'temporarily_unavailable' });
  });
});
