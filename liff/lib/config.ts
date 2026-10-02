/** Public settings. Next.js inlines NEXT_PUBLIC_* at build time, so each is read by its full name. */
export const config = {
  strapiUrl: (
    process.env.NEXT_PUBLIC_STRAPI_URL ?? 'http://localhost:1338'
  ).replace(/\/+$/, ''),
  clientId: process.env.NEXT_PUBLIC_MAISON_CLIENT_ID ?? '',
  liffMock: process.env.NEXT_PUBLIC_LIFF_MOCK !== 'false',
  liffId: process.env.NEXT_PUBLIC_LIFF_ID ?? '',
  // Maison's LINE Official Account, by its basic ID with the @: "Chat with Maison on LINE" (lib/line-chat.ts).
  lineOaId: process.env.NEXT_PUBLIC_LINE_OA_ID ?? '',
  demoLineUserId:
    process.env.NEXT_PUBLIC_DEMO_LINE_USER_ID ||
    'U4af4980629c1a7b3f1e2d3c4b5a69788',
  demoLocale: process.env.NEXT_PUBLIC_DEMO_LOCALE || 'en',
};
