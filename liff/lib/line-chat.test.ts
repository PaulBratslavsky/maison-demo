import { describe, expect, it } from 'vitest';

import { lineChatUrl } from './line-chat';

// Made-up IDs in the forms LINE gives: never Maison's real basic ID in this repo.
describe('lineChatUrl', () => {
  it("opens the chat with Maison's Official Account: LINE's link, with the basic ID percent-encoded", () => {
    expect(lineChatUrl('@123abcde')).toBe('https://line.me/R/ti/p/%40123abcde');
  });

  it("takes a premium ID too, as in LINE's own example, and one with a dot, a hyphen and an underscore", () => {
    expect(lineChatUrl('@linedevelopers')).toBe('https://line.me/R/ti/p/%40linedevelopers');
    expect(lineChatUrl('@maison.ginza_jp-1')).toBe('https://line.me/R/ti/p/%40maison.ginza_jp-1');
  });

  it('leaves out spaces around the ID, which a hand-edited .env can keep', () => {
    expect(lineChatUrl(' @123abcde\n')).toBe('https://line.me/R/ti/p/%40123abcde');
  });

  it.each([
    ['unset', undefined],
    ['empty', ''],
    ['blank', '   '],
    ['without its @', '123abcde'],
    ['only the @', '@'],
    ['encoded already', '%40123abcde'],
    ['with a space inside', '@123 abcde'],
    ['with a path after it', '@123abcde/x'],
    ['a whole link', 'https://line.me/R/ti/p/%40123abcde'],
  ])('gives no link, so no button anywhere, for a setting %s', (_, value) => {
    expect(lineChatUrl(value)).toBeNull();
  });
});
