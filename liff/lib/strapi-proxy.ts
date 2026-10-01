/**
 * The app's proxy for the three Strapi paths a phone needs in LINE mode. The phone only ever talks to the app's own
 * origin (the ngrok tunnel), and Strapi, with its admin, stays on this machine:
 *   /mcp                                          Strapi's MCP server (streamable HTTP)
 *   /api/strapi-oauth-mcp-manager/oauth/token     the LINE ID token exchange
 *   /uploads/*                                    catalog images
 * Responses stream through as Strapi writes them: an MCP answer is a server-sent event stream. Only the request
 * headers those calls use reach Strapi: no cookies, no Origin, nothing hop-by-hop. A request body is read whole, up to
 * MAX_BODY_BYTES, before any of it is passed on. And only what the phone sends: on /mcp a customer session or no
 * Authorization at all, and on the token endpoint the token exchange.
 * Only LINE mode's build serves it. In any other build every path answers 404, so a tunnel left open after
 * `npm run mode:local` can't reach a Strapi that trusts the verify mock, where anyone could mint a customer session.
 */
const PROXIED = /^(\/mcp|\/api\/strapi-oauth-mcp-manager\/oauth\/token|\/uploads\/[^?#]+)$/;
const TOKEN_PATH = '/api/strapi-oauth-mcp-manager/oauth/token';
const TOKEN_EXCHANGE = 'urn:ietf:params:oauth:grant-type:token-exchange';
const FORM = 'application/x-www-form-urlencoded';
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
 * The largest request body the proxy passes on. An MCP message or a token exchange is a few kB. A longer body is refused
 * with 413 before any of it reaches Strapi, and the proxy never holds more than this of one in memory.
 */
export const MAX_BODY_BYTES = 1024 * 1024;

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

const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9a-z-]+$/;
/** The headers a Connection header names: hop-by-hop, for that one connection (RFC 9110, section 7.6.1). */
const namedByConnection = (headers: Headers) =>
  new Set(
    (headers.get('connection') ?? '')
      .split(',')
      .map((name) => name.trim().toLowerCase())
      .filter((name) => HEADER_NAME.test(name))
  );

/**
 * The request's body, or null when it's longer than `limit` bytes: by its Content-Length, before reading any of it, or
 * as it arrives, for a body that has none (chunked) or is longer than it says. It throws when the body can't be read to
 * its end (the caller went away).
 */
export const readBody = async (request: Request, limit: number): Promise<Uint8Array<ArrayBuffer> | null> => {
  if (Number(request.headers.get('content-length')) > limit) return null;
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
    size += chunk.value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(chunk.value);
  }
  return Buffer.concat(chunks, size);
};

/**
 * Where the app's server reaches Strapi: STRAPI_URL, else Strapi's default address. Never NEXT_PUBLIC_STRAPI_URL,
 * which in LINE mode is the app's own public address, so the proxy would call itself.
 */
export const strapiOrigin = (env: Record<string, string | undefined> = process.env) =>
  (env.STRAPI_URL || 'http://127.0.0.1:1338').replace(/\/+$/, '');

/**
 * Refuses to go on in LINE mode, for the e2e and live tests: they sign in with the verify mock's ID tokens, as the demo
 * admin, and delete or create the demo's appointments. They reach Strapi with strapiOrigin().
 */
export const requireLocalMode = (env: Record<string, string | undefined> = process.env): void => {
  if (env.NEXT_PUBLIC_LIFF_MOCK === 'false') {
    throw new Error('These tests need local mode: run npm run mode:local, then restart Strapi and the app.');
  }
};

/** A customer's session, as the token exchange issues it: the only credential the app sends. The concierge's rule too. */
export const isCustomerSession = (authorization: string | null): boolean => /^Bearer mcp_at_\S+$/.test(authorization ?? '');

/**
 * A token endpoint body as the phone sends it: a form whose grant_type is the token exchange. The form that goes on to
 * Strapi, encoded again, or null for anything else. A key sent twice, or with brackets, is refused rather than read two
 * ways: Strapi reads `grant_type=…&grant_type[]=…` as one array. And Strapi gets the form this has checked, as a form:
 * nothing it would read another way, such as JSON or another charset.
 */
const tokenExchange = (contentType: string | null, body: Uint8Array): Uint8Array<ArrayBuffer> | null => {
  if ((contentType ?? '').split(';')[0].trim().toLowerCase() !== FORM) return null;
  const form = new URLSearchParams(new TextDecoder().decode(body));
  const keys = [...form.keys()];
  const flat = new Set(keys).size === keys.length && !keys.some((key) => /[[\]]/.test(key));
  return flat && form.get('grant_type') === TOKEN_EXCHANGE ? new TextEncoder().encode(form.toString()) : null;
};

export async function proxyToStrapi(
  request: Request,
  path: string,
  { strapiUrl = strapiOrigin(), fetchImpl = fetch }: { strapiUrl?: string; fetchImpl?: typeof fetch } = {}
): Promise<Response> {
  // Inlined when the app is built: 'false' only in LINE mode's build (npm run start:line), the one behind the tunnel.
  if (process.env.NEXT_PUBLIC_LIFF_MOCK !== 'false' || !PROXIED.test(path) || climbs(path)) {
    return Response.json({ error: 'not_found' }, { status: 404 });
  }
  // No Authorization goes on, so Strapi answers 401 with its resource metadata. Anything but a session, such as an
  // admin token, has no business on the public origin.
  if (path === '/mcp' && request.headers.has('authorization') && !isCustomerSession(request.headers.get('authorization'))) {
    return Response.json(
      { error: 'invalid_token', error_description: 'Only a customer session is accepted here.' },
      { status: 401, headers: { 'WWW-Authenticate': 'Bearer error="invalid_token"' } }
    );
  }
  const hopByHop = namedByConnection(request.headers);
  const headers = new Headers();
  for (const name of REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value !== null && !hopByHop.has(name)) headers.set(name, value);
  }
  let body: Uint8Array<ArrayBuffer> | undefined;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    let read: Uint8Array<ArrayBuffer> | null;
    try {
      read = await readBody(request, MAX_BODY_BYTES);
    } catch {
      return Response.json({ error: 'invalid_request', error_description: "The request's body couldn't be read." }, { status: 400 });
    }
    if (read === null) {
      return Response.json({ error: 'invalid_request', error_description: 'The request body is over 1 MB.' }, { status: 413 });
    }
    body = read;
  }
  if (path === TOKEN_PATH) {
    const exchange = tokenExchange(request.headers.get('content-type'), body ?? new Uint8Array(0));
    if (exchange === null) return Response.json({ error: 'unsupported_grant_type' }, { status: 400 });
    body = exchange;
    headers.set('content-type', FORM);
  }
  let upstream: Response;
  try {
    upstream = await fetchImpl(`${strapiUrl}${path}${new URL(request.url).search}`, {
      method: request.method,
      headers,
      body,
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
  for (const name of [...DROPPED_RESPONSE_HEADERS, ...namedByConnection(upstream.headers)]) responseHeaders.delete(name);
  return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: responseHeaders });
}
