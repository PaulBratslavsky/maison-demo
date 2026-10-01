'use client';

import Link from 'next/link';

import { useMaison } from '@/components/maison-provider';
import { ProductImage } from '@/components/product-grid';
import { Screen } from '@/components/screen';
import { StatusNote } from '@/components/status-note';
import { COPY } from '@/lib/copy';
import type { CollectionSummary } from '@/lib/types';
import { useTool } from '@/lib/use-tool';

export default function Home() {
  const { locale } = useMaison();
  const t = COPY[locale];
  const collections = useTool<{ collections: CollectionSummary[] }>('home', 'browse_collections', { locale });
  return (
    <Screen name="home" tools={['browse_collections']}>
      <section className="px-5 pb-6 pt-8 text-center">
        <p className="font-serif text-4xl tracking-[0.35em]">MAISON</p>
        <p className="mt-2 text-xs tracking-widest text-mist">{t.tagline}</p>
        <Link href="/concierge" className="mt-6 inline-flex min-h-[44px] items-center rounded-full bg-ink px-6 text-sm text-ivory">
          {t.askConcierge}
        </Link>
      </section>
      <h2 className="px-5 pb-3 font-serif text-2xl">{t.collections}</h2>
      <StatusNote loading={collections.loading} error={collections.error} retry={collections.retry} />
      <ul className="space-y-6 px-5">
        {collections.data?.collections.map((collection) => (
          <li key={collection.slug}>
            <Link href={`/collections/${collection.slug}`} data-testid="collection-card" className="block">
              <ProductImage url={collection.heroImageUrl} alt={collection.name} className="aspect-[4/3] w-full" />
              <div className="mt-2 flex items-baseline justify-between">
                <p className="font-serif text-2xl">{collection.name}</p>
                <p className="text-xs text-mist">{t.pieces(collection.productCount)}</p>
              </div>
              <p className="text-sm text-ink/70">{collection.teaser}</p>
            </Link>
          </li>
        ))}
      </ul>
    </Screen>
  );
}
