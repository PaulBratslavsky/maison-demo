import { describe, expect, it } from 'vitest';
import content from '../../server/seed/content.json';
import knowledge from '../../server/seed/knowledge.json';
import schema from '../../server/src/content-types/knowledge/schema.json';
import { KNOWLEDGE_CATEGORIES } from '../../server/src/constants';

const productSlugs = new Set(content.products.map((product) => product.slug));

describe('the product knowledge seed', () => {
  it('has the sixteen demo entries, each with its own title', () => {
    expect(knowledge.entries).toHaveLength(16);
    expect(new Set(knowledge.entries.map((entry) => entry.title)).size).toBe(16);
  });

  it('files every entry under a category the content type allows', () => {
    for (const entry of knowledge.entries) expect(KNOWLEDGE_CATEGORIES, entry.title).toContain(entry.category);
  });

  it('names only products the demo catalog has', () => {
    for (const entry of knowledge.entries) {
      for (const slug of entry.productSlugs) expect(productSlugs.has(slug), `${entry.title}: ${slug}`).toBe(true);
    }
  });

  it('fits the content type limits', () => {
    for (const entry of knowledge.entries) {
      expect(entry.title.length, entry.title).toBeLessThanOrEqual(schema.attributes.title.maxLength);
      expect(entry.answer.length, entry.title).toBeLessThanOrEqual(schema.attributes.answer.maxLength);
      expect(entry.keywords.length, entry.title).toBeLessThanOrEqual(schema.attributes.keywords.maxLength);
    }
  });
});

// content.json is the source of truth: what an entry says about a piece has to hold for the piece the catalog has.
describe('the product knowledge seed and the demo catalog', () => {
  it('tags the canvas care and storage entries with every piece the catalog files under trunk, the trunks and hard cases', () => {
    const trunks = content.products.filter((product) => product.category === 'trunk').map((product) => product.slug).sort();
    for (const title of ['How do I clean the canvas?', 'How should I store a trunk or hard case?']) {
      const entry = knowledge.entries.find((candidate) => candidate.title === title);
      expect([...(entry?.productSlugs ?? [])].sort(), title).toEqual(trunks);
    }
  });

  it("gives a piece's measurements as the catalog does, width × height × depth", () => {
    const given = knowledge.entries.flatMap((entry) =>
      [...entry.answer.matchAll(/measures (\d+) × (\d+)(?: × (\d+))? cm/g)].map((match) => ({ entry, numbers: match.slice(1).filter(Boolean).map(Number) }))
    );
    expect(given.length).toBeGreaterThan(0);
    for (const { entry, numbers } of given) {
      const ofItsPieces = entry.productSlugs.some((slug) => {
        const dimensions = content.products.find((product) => product.slug === slug)?.dimensionsCm ?? [];
        return numbers.every((value, index) => dimensions[index] === value);
      });
      expect(ofItsPieces, `${entry.title}: ${numbers.join(' × ')}`).toBe(true);
    }
  });

  it('gives no personalization time of its own: the catalog keeps a lead time for each piece, and the piece\'s page shows it', () => {
    const entry = knowledge.entries.find((candidate) => candidate.category === 'personalization');
    expect(entry?.answer).not.toMatch(/\d+ days?/);
  });
});
