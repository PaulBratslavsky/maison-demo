import type { Core } from '@strapi/strapi';

const allowedMediaTypes = [
  'image/*',
  'video/*',
  'audio/*',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.*',
  'text/plain',
  'text/csv',
];

const deniedTypes = [
  'image/svg+xml',
  'application/vnd.microsoft.portable-executable',
  'application/x-msdownload',
  'application/x-msdos-program',
  'application/x-executable',
  'application/x-dosexec',
  'application/x-sh',
  'text/x-shellscript',
  'application/x-mach-binary',
];

const config = ({ env }: Core.Config.Shared.ConfigParams): Core.Config.Plugin => {
  // env() returns '' for a key that is in .env but empty, so empty counts as unset below.
  const lineChannelId = env('LINE_LOGIN_CHANNEL_ID', '');
  // Never in production (Strapi Cloud runs NODE_ENV=production): there LINE verifies ID tokens, whatever
  // LINE_VERIFY_URL says, because with the verify mock anyone could sign in as any customer.
  const lineVerifyUrl = env('NODE_ENV') === 'production' ? '' : env('LINE_VERIFY_URL', '');

  return {
    'users-permissions': {
      config: {
        jwtManagement: 'refresh',
        sessions: {
          httpOnly: true,
        },
      },
    },
    upload: {
      config: {
        security: {
          allowedTypes: allowedMediaTypes,
          deniedTypes,
        },
      },
    },
    // Maison: the demo's catalog and appointments, as MCP tools. A local plugin with its own
    // package.json, built by `npm install` (strapi/package.json's postinstall).
    maison: {
      enabled: true,
      resolve: 'src/plugins/maison',
      config: {
        // The base of links in LINE confirmations. Unset: pending_confirmations answers not_configured.
        liffUrl: env('MAISON_LIFF_URL', '') || null,
        // The Official Account's Messaging API channel access token. With it, confirming a visit (on the board, in the
        // admin chat, over MCP or with the Content Manager's Publish) sends the customer's LINE confirmation from Strapi.
        // Unset: nothing is sent, and the board shows "not sent". In local mode it goes to the mock's customer: you, with
        // option A's NEXT_PUBLIC_DEMO_LINE_USER_ID in liff/.env, and otherwise a made-up user ID that no one receives.
        lineChannelAccessToken: env('LINE_CHANNEL_ACCESS_TOKEN', '') || null,
        // Where Strapi reaches LINE's Messaging API. Unset everywhere but local checks, which point it at a stand-in on
        // this machine (http://127.0.0.1:<port>) so nothing reaches a real phone.
        lineApiBaseUrl: env('MAISON_LINE_API_BASE_URL', '') || null,
        // The model that labels each customer inquiry, with Pulse's settings. AI_PROVIDER is anthropic (the default),
        // openai or openai-compatible; AI_MODEL defaults per provider (claude-haiku-4-5-20251001 for Anthropic);
        // AI_BASE_URL is for a local model, such as Ollama's http://127.0.0.1:11434/v1. Unset, labelling is off, and
        // new inquiries wait under Not labelled.
        aiProvider: env('AI_PROVIDER', '') || null,
        aiModel: env('AI_MODEL', '') || null,
        aiApiKey: env('AI_API_KEY', '') || null,
        aiBaseUrl: env('AI_BASE_URL', '') || null,
      },
    },
    'strapi-oauth-mcp-manager': {
      enabled: true,
      config: {
        // Customer sign-in with LINE. channelId is the LINE Login channel's ID, digits only (not the LIFF ID).
        // LINE_VERIFY_URL points at the Maison app's mock of LINE's verify endpoint: local only, never production.
        identityProviders: lineChannelId
          ? {
              line: {
                channelId: lineChannelId,
                ...(lineVerifyUrl ? { verifyUrl: lineVerifyUrl } : {}),
              },
            }
          : {},
      },
    },
  };
};

export default config;
