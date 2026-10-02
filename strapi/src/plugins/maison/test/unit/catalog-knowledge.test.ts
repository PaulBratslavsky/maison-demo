import { describe, expect, it, vi } from 'vitest';
import catalogService from '../../server/src/services/catalog';
import { fakeStrapi } from './fake-strapi';

type Doc = Record<string, unknown>;
type Rows = { knowledge?: Record<string, Doc[]>; products?: Record<string, Doc[]> };

/** The catalog service over published rows per locale: knowledge entries, and products found by slug. */
const catalogWith = (rows: Rows) =>
  catalogService({
    strapi: fakeStrapi({
      documents: (uid: string) => ({
        findMany: vi.fn(async ({ locale, status, filters }: { locale: string; status: string; filters?: any }) => {
          if (status !== 'published') return [];
          if (uid === 'plugin::maison.knowledge') return rows.knowledge?.[locale] ?? [];
          if (uid === 'plugin::maison.product') {
            const wanted: string[] = filters?.slug?.$in ?? [];
            return (rows.products?.[locale] ?? []).filter((product) => wanted.includes(product.slug as string));
          }
          return [];
        }),
      }),
    }),
  });

const leather = { documentId: 'k1', title: 'How do I care for the leather?', answer: 'Wipe it with a dry cloth.', category: 'care', productSlugs: [], keywords: 'leather, wipe' };
const cabin = { documentId: 'k2', title: 'Will the Cabin Case 55 fit in an overhead bin?', answer: '55 × 40 × 23 cm.', category: 'sizing', productSlugs: ['cabin-case-55'], keywords: 'fit, overhead' };

describe('catalog.searchKnowledge', () => {
  it('answers from the published entries in the locale, without their keywords', async () => {
    const result = await catalogWith({ knowledge: { en: [leather, cabin] } }).searchKnowledge('en', { query: 'How do I care for the leather?' });
    expect(result).toEqual({
      ok: true,
      value: { entries: [{ title: leather.title, answer: leather.answer, category: 'care', productSlugs: [] }] },
    });
  });

  it('fills in from the default locale where an entry has no translation', async () => {
    const japaneseOnly = { ...leather, documentId: 'k3', title: '革のお手入れ', keywords: 'leather' };
    const result = await catalogWith({ knowledge: { en: [cabin], ja: [japaneseOnly] } }).searchKnowledge('en', { query: 'leather' });
    expect(result.ok && result.value.entries.map((found) => found.title)).toEqual(['革のお手入れ']);
  });

  it('reads a productSlugs value that is not a list as an entry for every piece', async () => {
    const broken = { ...leather, productSlugs: 'weekender-50' };
    const products = { en: [{ slug: 'cabin-case-55' }] };
    const result = await catalogWith({ knowledge: { en: [broken] }, products }).searchKnowledge('en', { query: 'leather', productSlugs: ['cabin-case-55'] });
    expect(result.ok && result.value.entries[0].productSlugs).toEqual([]);
  });

  it('searches an entry that has no keywords, and answers without a keywords field', async () => {
    const withoutKeywords = { ...leather, documentId: 'k4', keywords: null };
    const result = await catalogWith({ knowledge: { en: [withoutKeywords] } }).searchKnowledge('en', { query: 'leather' });
    expect(result).toEqual({
      ok: true,
      value: { entries: [{ title: leather.title, answer: leather.answer, category: 'care', productSlugs: [] }] },
    });
  });

  it('answers an unknown or unpublished product with not_found and the search_products hint', async () => {
    const products = { en: [{ slug: 'cabin-case-55' }] };
    const result = await catalogWith({ knowledge: { en: [cabin] }, products }).searchKnowledge('en', {
      query: 'Will it fit?',
      productSlugs: ['cabin-case-55', 'no-such-piece'],
    });
    expect(result).toEqual({ ok: false, code: 'not_found', message: 'No published product "no-such-piece".', hint: 'Call search_products to find valid product slugs.' });
  });

  it('names every unknown product in the order given, in the plural', async () => {
    const products = { en: [{ slug: 'cabin-case-55' }] };
    const result = await catalogWith({ knowledge: { en: [cabin] }, products }).searchKnowledge('en', {
      query: 'Will it fit?',
      productSlugs: ['no-such-piece', 'another-missing-piece'],
    });
    expect(result).toEqual({
      ok: false,
      code: 'not_found',
      message: 'No published products "no-such-piece", "another-missing-piece".',
      hint: 'Call search_products to find valid product slugs.',
    });
  });

  it('returns no entries for a question nothing matches', async () => {
    expect(await catalogWith({ knowledge: { en: [leather, cabin] } }).searchKnowledge('en', { query: 'Can I pay in bitcoin?' })).toEqual({
      ok: true,
      value: { entries: [] },
    });
  });
});
