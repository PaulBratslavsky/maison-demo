// Self-hosted, so nothing comes from a CDN: the app works inside LINE and offline on stage. Jost for Latin text, Zen
// Kaku Gothic New for Japanese (tailwind.config.ts). Each face's CSS splits it by script, and Japanese into small slices,
// so a browser downloads only the characters a page shows.
import '@fontsource/jost/300.css';
import '@fontsource/jost/400.css';
import '@fontsource/jost/500.css';
import '@fontsource/zen-kaku-gothic-new/400.css';
import '@fontsource/zen-kaku-gothic-new/500.css';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import { MaisonProvider } from '@/components/maison-provider';
import { PhoneFrame } from '@/components/phone-frame';

import './globals.css';

export const metadata: Metadata = {
  title: 'Maison',
  description:
    'A fictional luxury house, served to people and agents through Strapi MCP.',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <PhoneFrame>
          <MaisonProvider>{children}</MaisonProvider>
        </PhoneFrame>
      </body>
    </html>
  );
}
