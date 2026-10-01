'use client';

import { useEffect, useState } from 'react';

import { COPY } from '@/lib/copy';
import { type LineOs, onPhone, openInLineBody } from '@/lib/open-in-line';
import { qrImageSource } from '@/lib/qr-image';
import { useMaison } from './maison-provider';

/**
 * LINE mode, outside the LINE app (Safari, Chrome, a desktop browser): the app doesn't sign in here, it asks to be
 * opened inside LINE. A QR code of this page's LINE link, for LINE's QR reader, and on a phone a button with the same
 * link, which the words lead to there. It isn't an error, so there's nothing to retry. <Screen> shows it in place of the
 * screen's content.
 */
export function OpenInLine({ url, os }: { url: string; os: LineOs }) {
  const { locale } = useMaison();
  const t = COPY[locale].openInLine;
  const [qr, setQr] = useState<string | null>(null);
  const [qrFailed, setQrFailed] = useState(false);

  useEffect(() => {
    let current = true;
    qrImageSource(url).then(
      (source) => {
        if (current) setQr(source);
      },
      (error: unknown) => {
        // Without the code, the button and the hint still say what to do, and the link shows as text to copy.
        console.error("The QR code of this page's LINE link couldn't be drawn.", error);
        if (current) setQrFailed(true);
      }
    );
    return () => {
      current = false;
    };
  }, [url]);

  return (
    <section className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-5 pb-10 pt-8 text-center">
      <h1 className="font-serif text-3xl">{t.title}</h1>
      <p className="mt-3 max-w-xs text-sm leading-relaxed text-ink/70">{openInLineBody(t, os)}</p>
      {/* Black on white, 240 px square (at least 220), on a white tile so the code scans on any background. */}
      <div className="mt-6 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-ink/10">
        {qr ? (
          <img src={qr} alt={t.alt} width={240} height={240} className="block h-60 w-60" />
        ) : (
          <div className="h-60 w-60" aria-hidden="true" />
        )}
      </div>
      {qrFailed && <p className="mt-3 max-w-xs select-all break-all font-mono text-xs text-ink/70">{url}</p>}
      {onPhone(os) && (
        <a href={url} className="mt-6 inline-flex min-h-[44px] items-center rounded-full bg-ink px-6 text-sm text-ivory">
          {t.button}
        </a>
      )}
      <p className="mt-6 max-w-xs text-xs leading-relaxed text-mist">{t.hint}</p>
    </section>
  );
}
