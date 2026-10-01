/**
 * The app's proxy for the three Strapi paths a phone needs in LINE mode. The phone only ever talks to the app's own
 * origin (the ngrok tunnel), and Strapi, with its admin, stays on this machine:
 *   /mcp                                          Strapi's MCP server (streamable HTTP)
 *   /api/strapi-oauth-mcp-manager/oauth/token     the LINE ID token exchange
 *   /uploads/*                                    catalog images
 * Responses stream through as Strapi writes them: an MCP answer is a server-sent event stream. Only the request
 * headers those calls use reach Strapi: no cookies, no Origin.
 */
const PROXIED = /^(\/mcp|\/api\/strapi-oauth-mcp-manager\/oauth\/token|\/uploads\/[^?#]+)$/;
const REQUEST_HEADERS = [
  'accept',
  'authorization',
  'content-type',
  'if-modified-since',
  'if-none-match',
  'last-event-id',
  'mcp-protocol-version',
  'mcp-session-id',
  'range',
];
// Hop-by-hop headers, cookies, and what fetch has already undone: it decompresses, so the encoding and length go too.
const DROPPED_RESPONSE_HEADERS = [
  'connection',
  'content-encoding',
  'content-length',
  'keep-alive',
  'proxy-authenticate',
  'set-cookie',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
];

/**
 * Whether a path climbs out of its folder: a `..` segment, also with its dots or its slash percent-encoded. fetch
 * resolves an encoded `%2e%2e` before it sends the path, and Strapi's file server decodes `..%2f`.
 */
const climbs = (path: string) => {
  try {
    return decodeURIComponent(path).split(/[/\\]/).includes('..');
  } catch {
    return true; // a malformed escape
  }
};

/**
 * Where the app's server reaches Strapi: STRAPI_URL, else Strapi's default address. Never NEXT_PUBLIC_STRAPI_URL,
 * which in LINE mode is the app's own public address, so the proxy would call itself.
 */
export const strapiOrigin = (env: Record<string, string | undefined> = process.env) =>
  (env.STRAPI_URL || 'http://127.0.0.1:1338').replace(/\/+$/, '');

export async function proxyToStrapi(
  request: Request,
  path: string,
  { strapiUrl = strapiOrigin(), fetchImpl = fetch }: { strapiUrl?: string; fetchImpl?: typeof fetch } = {}
): Promise<Response> {
  if (!PROXIED.test(path) || climbs(path)) {
    return Response.json({ error: 'not_found' }, { status: 404 });
  }
  const headers = new Headers();
  for (const name of REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  let upstream: Response;
  try {
    upstream = await fetchImpl(`${strapiUrl}${path}${new URL(request.url).search}`, {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
      redirect: 'manual',
      signal: request.signal,
    });
  } catch {
    return Response.json(
      { error: 'temporarily_unavailable', error_description: "The app couldn't reach Strapi." },
      { status: 502 }
    );
  }
  const responseHeaders = new Headers(upstream.headers);
  for (const name of DROPPED_RESPONSE_HEADERS) responseHeaders.delete(name);
  return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: responseHeaders });
}
