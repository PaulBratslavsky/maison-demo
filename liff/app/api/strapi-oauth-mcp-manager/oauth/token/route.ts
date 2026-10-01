import { proxyToStrapi } from '@/lib/strapi-proxy';

// oauth-mcp-manager's token endpoint on the app's own origin (LINE mode): the LINE ID token exchange.
export const POST = (request: Request) => proxyToStrapi(request, '/api/strapi-oauth-mcp-manager/oauth/token');
