import type { Core } from '@strapi/strapi';

/**
 * Production server options, merged over `config/server.ts`, which binds to 127.0.0.1 for the laptop.
 *
 * Strapi Cloud runs Strapi in a container behind a TLS proxy:
 * - `host` listens on every interface, so the proxy can reach Strapi, and `port` takes the one Cloud gives.
 * - `proxy: true` trusts the forwarded headers, so Strapi knows requests arrive over https.
 * - `url` is the public https address that Strapi builds absolute links from (the admin, oauth-mcp-manager's
 *   metadata). Set PUBLIC_URL to the project's Strapi Cloud URL: the admin is served there. The Maison app reaches
 *   Strapi at that address from its server.
 */
const config = ({ env }: Core.Config.Shared.ConfigParams): Partial<Core.Config.Server> => ({
  host: env('HOST', '0.0.0.0'),
  port: env.int('PORT', 1337),
  url: env('PUBLIC_URL'),
  proxy: true,
});

export default config;
