import { describe, expect, it } from 'vitest';

import { type LineOs, onPhone } from './open-in-line';

describe('onPhone', () => {
  it.each<[LineOs, boolean]>([
    ['ios', true],
    ['android', true],
    ['web', false], // a desktop browser: the QR code only, to scan with a phone
    [undefined, false],
  ])("getOS() %s: the Open in LINE button %s", (os, shown) => {
    expect(onPhone(os)).toBe(shown);
  });
});
