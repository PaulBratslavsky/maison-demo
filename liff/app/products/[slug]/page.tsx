'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';

import { BookingSheet } from '@/components/booking-sheet';
import { useMaison } from '@/components/maison-provider';
import { ProductImage } from '@/components/product-grid';
import { Screen } from '@/components/screen';
import { StatusNote } from '@/components/status-note';
import { COPY } from '@/lib/copy';
import { personalizationKind, yen } from '@/lib/format';
import type { Product } from '@/lib/types';
import { useTool } from '@/lib/use-tool';

export default function ProductPage() {
  // Slugs are lower case: /products/Weekender-50 is the Weekender 50 too.
  const slug = useParams<{ slug: string }>().slug.toLowerCase();
  const { locale } = useMaison();
  const t = COPY[locale];
  const product = useTool<{ product: Product }>('product', 'view_product', { slug, locale });
  const [booking, setBooking] = useState(false);
  const item = product.data?.product;

  return (
    <Screen name="product" tools={['view_product', 'find_boutiques', 'request_appointment']}>
      <StatusNote loading={product.loading} error={product.error} retry={product.retry} fromUrl />
      {item && (
        <article>
          <ProductImage url={item.images[0]?.url ?? null} alt={item.images[0]?.alt ?? item.name} className="mt-3 aspect-square w-full" />
          <div className="space-y-5 px-5 pt-5">
            <div>
              {item.collection && <p className="text-xs uppercase tracking-widest text-mist">{item.collection.name}</p>}
              <h1 className="font-serif text-4xl leading-tight">{item.name}</h1>
              <p className="mt-1 text-lg">{yen(item.priceJpy, locale)}</p>
            </div>
            <p className="whitespace-pre-line text-sm leading-relaxed">{item.description}</p>
            {/* Italic in English only: Japanese type has no italic, so the browser would slant the glyphs. */}
            {item.craftStory && <p className={`border-l-2 border-gold pl-3 font-serif text-lg ${locale === 'en' ? 'italic' : ''}`}>{item.craftStory}</p>}
            {item.personalization.offered && (
              <section>
                <h2 className="text-xs uppercase tracking-widest text-mist">{t.personalization}</h2>
                <p className="text-sm">
                  {item.personalization.kinds.map((kind) => personalizationKind(kind, locale)).join(' · ')}
                  {item.personalization.leadDays ? ` · ${t.leadDays(item.personalization.leadDays)}` : ''}
                </p>
              </section>
            )}
            <section>
              <h2 className="text-xs uppercase tracking-widest text-mist">{t.stockByBoutique}</h2>
              <ul className="mt-1 divide-y divide-ink/10 text-sm">
                {item.stock.map((entry) => (
                  <li key={entry.boutique} className="flex justify-between py-2">
                    <span>{entry.name}</span>
                    <span className={entry.quantity > 0 ? '' : 'text-mist'}>{entry.quantity > 0 ? t.inStock(entry.quantity) : t.outOfStock}</span>
                  </li>
                ))}
              </ul>
            </section>
            <button type="button" onClick={() => setBooking(true)} className="min-h-[48px] w-full rounded-full bg-ink text-sm text-ivory">
              {t.bookVisit}
            </button>
          </div>
        </article>
      )}
      {booking && item && <BookingSheet product={item} onClose={() => setBooking(false)} />}
    </Screen>
  );
}
