import { proxyToStrapi } from '@/lib/strapi-proxy';

// Catalog images on the app's own origin (LINE mode). Strapi builds their absolute URLs from PUBLIC_URL.
const proxy = (request: Request) => proxyToStrapi(request, new URL(request.url).pathname);
export const GET = proxy;
export const HEAD = proxy;
