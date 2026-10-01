import '@fontsource/cormorant-garamond/400.css';
import '@fontsource/cormorant-garamond/600.css';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

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
        <PhoneFrame>{children}</PhoneFrame>
      </body>
    </html>
  );
}
