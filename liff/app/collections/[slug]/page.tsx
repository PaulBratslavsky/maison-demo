'use client';

import { useParams } from 'next/navigation';

import { useMaison } from '@/components/maison-provider';
import { ProductGrid } from '@/components/product-grid';
import { Screen } from '@/components/screen';
import { StatusNote } from '@/components/status-note';
import type { CollectionSummary, ProductCard } from '@/lib/types';
import { useTool } from '@/lib/use-tool';

export default function CollectionPage() {
  const { slug } = useParams<{ slug: string }>();
  const { locale } = useMaison();
  const collections = useTool<{ collections: CollectionSummary[] }>('collection', 'browse_collections', { locale });
  const products = useTool<{ total: number; products: ProductCard[] }>('collection', 'search_products', { collection: slug, locale, limit: 20 });
  const collection = collections.data?.collections.find((c) => c.slug === slug);
  return (
    <Screen name="collection" tools={['browse_collections', 'search_products']}>
      <header className="px-5 pb-5 pt-6">
        <h1 className="font-serif text-4xl">{collection?.name ?? ''}</h1>
        {collection && <p className="mt-1 text-sm text-ink/70">{collection.teaser}</p>}
      </header>
      <StatusNote loading={products.loading} error={products.error} retry={products.retry} />
      {products.data && <ProductGrid products={products.data.products} locale={locale} />}
    </Screen>
  );
}
