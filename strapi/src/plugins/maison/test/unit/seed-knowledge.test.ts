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
