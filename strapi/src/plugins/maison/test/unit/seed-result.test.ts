import { describe, expect, it } from 'vitest';
import { describeSeed } from '../../admin/src/seed-result';

const nothing = { created: false, collections: 0, products: 0, boutiques: 0, stockLevels: 0, knowledge: 0 };

describe('describeSeed', () => {
  it('names everything a first load created', () => {
    expect(describeSeed({ created: true, collections: 3, products: 12, boutiques: 3, stockLevels: 36, knowledge: 16 })).toBe(
      'Loaded 12 products, 3 collections, 3 boutiques, 36 stock levels and 16 product knowledge entries.'
    );
  });

  it('says when only the product knowledge was added', () => {
    expect(describeSeed({ ...nothing, knowledge: 16 })).toBe('The demo catalog is already loaded. Added 16 product knowledge entries.');
  });

  it('says when nothing changed', () => {
    expect(describeSeed(nothing)).toBe('The demo catalog and its product knowledge are already loaded.');
  });
});
