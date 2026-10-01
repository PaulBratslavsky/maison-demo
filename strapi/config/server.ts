import type { Core } from '@strapi/strapi';

const config = ({ env }: Core.Config.Shared.ConfigParams): Core.Config.Server => {
  // 1338, not Strapi's usual 1337, so the demo runs next to another Strapi app.
  const port = env.int('PORT', 1338);
  return {
    host: env('HOST', '127.0.0.1'),
    port,
    // Absolute public address. The Maison plugin builds absolute media URLs from it, which the
    // Maison app needs because it runs on another origin. oauth-mcp-manager uses it for its metadata.
    url: env('PUBLIC_URL', '') || `http://localhost:${port}`,
    app: {
      keys: env.array('APP_KEYS')!,
    },
    webhooks: {
      populateRelations: env.bool('WEBHOOKS_POPULATE_RELATIONS', false),
    },
    // Strapi's built-in MCP server at /mcp, where the Maison tools live.
    mcp: { enabled: env.bool('MCP_ENABLED', true) },
  };
};

export default config;
