'use client';

import Link from 'next/link';

import { useMaison } from '@/components/maison-provider';
import { ProductImage } from '@/components/product-grid';
import { Screen } from '@/components/screen';
import { StatusNote } from '@/components/status-note';
import { COPY } from '@/lib/copy';
import type { CollectionSummary } from '@/lib/types';
import { useTool } from '@/lib/use-tool';

/**
 * Home: the eyebrow, the headline and the concierge's button, then the collections, each a full-bleed photo with its
 * name and piece count under it.
 */
export default function Home() {
  const { locale } = useMaison();
  const t = COPY[locale];
  const text = t.home;
  const collections = useTool<{ collections: CollectionSummary[] }>('home', 'browse_collections', { locale });
  const list = collections.data?.collections ?? [];
  return (
    <Screen name="home" tools={['browse_collections']}>
      <section className="flex flex-col gap-3.5 px-5 pb-8 pt-5">
        <p className="eyebrow">{text.eyebrow}</p>
        <h1 className="text-headline">{text.headline}</h1>
        <Link href="/concierge" className="btn-primary mt-3">
          {text.ctaLabel}
        </Link>
      </section>
      <div className="flex items-baseline justify-between px-5 pb-3.5">
        <h2 className="label">{t.collections}</h2>
        {collections.data && <span className="text-[12px] tabular-nums text-mist">{t.pieces(list.reduce((sum, collection) => sum + collection.productCount, 0))}</span>}
      </div>
      <StatusNote loading={collections.loading} error={collections.error} retry={collections.retry} />
      <ul>
        {list.map((collection, index) => (
          <li key={collection.slug}>
            <Link href={`/collections/${collection.slug}`} data-testid="collection-card" className="flex flex-col">
              {/* Decorative: the link's name is the collection name below it. */}
              <ProductImage url={collection.heroImageUrl} alt="" className="h-60 w-full" loading={index === 0 ? 'eager' : 'lazy'} />
              <span className="flex items-center justify-between px-5 pb-[26px] pt-3.5">
                <span className="text-[13px] font-medium uppercase tracking-[0.24em]">{collection.name}</span>
                <span className="text-[12px] tabular-nums text-graphite">{t.pieces(collection.productCount)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Screen>
  );
}
