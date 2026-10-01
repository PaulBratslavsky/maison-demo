import { proxyToStrapi } from '@/lib/strapi-proxy';

// Strapi's MCP server on the app's own origin (LINE mode). Strapi itself answers GET and DELETE with 405.
const proxy = (request: Request) => proxyToStrapi(request, '/mcp');
export const GET = proxy;
export const POST = proxy;
export const DELETE = proxy;
