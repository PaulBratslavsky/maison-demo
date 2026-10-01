import { describe, expect, it } from 'vitest';
import { OCCASIONS } from '../../server/src/constants';
import { validateEnumArray } from '../../server/src/domain/validation';

describe('validateEnumArray', () => {
  it('accepts an array of allowed values, including an empty one', () => {
    expect(validateEnumArray(['travel', 'wedding'], OCCASIONS, 'giftOccasions')).toBeNull();
    expect(validateEnumArray([], OCCASIONS, 'giftOccasions')).toBeNull();
  });

  it('rejects unknown values and non-arrays with a message naming the field', () => {
    expect(validateEnumArray(['travel', 'graduation'], OCCASIONS, 'giftOccasions')).toMatch(/giftOccasions.*graduation/);
    expect(validateEnumArray('travel', OCCASIONS, 'giftOccasions')).toMatch(/giftOccasions/);
  });

  it('rejects duplicates', () => {
    expect(validateEnumArray(['travel', 'travel'], OCCASIONS, 'giftOccasions')).toMatch(/more than once/);
  });
});
