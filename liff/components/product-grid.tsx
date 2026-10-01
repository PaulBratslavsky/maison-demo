'use client';

import Link from 'next/link';

import { COPY } from '@/lib/copy';
import { mediaUrl, yen } from '@/lib/format';
import type { Locale, ProductCard } from '@/lib/types';

/** A catalog image, or its quiet wash while it loads and where there's none. */
export function ProductImage({ url, alt, className = '' }: { url: string | null; alt: string; className?: string }) {
  const src = mediaUrl(url);
  return src ? (
    <img src={src} alt={alt} className={`bg-wash object-cover ${className}`} />
  ) : (
    <div aria-hidden className={`bg-wash ${className}`} />
  );
}

export function ProductGrid({ products, locale }: { products: ProductCard[]; locale: Locale }) {
  return (
    <ul className="grid grid-cols-2 gap-x-3 gap-y-6 px-5">
      {products.map((product) => (
        <li key={product.slug}>
          <Link href={`/products/${product.slug}`} data-testid="product-card" className="block">
            {/* Decorative: the link's name is the product name below it. */}
            <ProductImage url={product.imageUrl} alt="" className="aspect-square w-full" />
            <p className="mt-2 font-serif text-lg leading-tight">{product.name}</p>
            <p className="text-xs text-mist">{yen(product.priceJpy, locale)}</p>
            {product.personalizable && <p className="mt-1 text-[10px] uppercase tracking-wider text-gold">{COPY[locale].personalizable}</p>}
          </Link>
        </li>
      ))}
    </ul>
  );
}
