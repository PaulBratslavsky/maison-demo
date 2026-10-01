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
  const lineVerifyUrl = env('LINE_VERIFY_URL', '');

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
