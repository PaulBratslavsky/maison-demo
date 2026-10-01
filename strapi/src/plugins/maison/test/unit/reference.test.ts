import { describe, expect, it } from 'vitest';
import { generateReference } from '../../server/src/domain/reference';

describe('generateReference', () => {
  it('produces APT- followed by four digits', () => {
    expect(generateReference()).toMatch(/^APT-\d{4}$/);
  });

  it('spans APT-1000 to APT-9999', () => {
    expect(generateReference(() => 0)).toBe('APT-1000');
    expect(generateReference(() => 0.99999)).toBe('APT-9999');
  });
});
