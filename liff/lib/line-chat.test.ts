import { describe, expect, it } from 'vitest';

import { COPY } from './copy';
import { lineChatUrl, lineChatWords } from './line-chat';

describe("the button's copy", () => {
  it('names the chat with Maison, says where the confirmation arrives, and asks to add Maison, in English', () => {
    expect(COPY.en.lineChat).toEqual({
      button: 'Chat with Maison on LINE',
      line: 'Your confirmation arrives in the Maison chat.',
      addButton: 'Add Maison on LINE',
      addLine: 'Add Maison on LINE to get your confirmation there.',
    });
  });

  it('and in Japanese', () => {
    expect(COPY.ja.lineChat).toEqual({
      button: 'LINEでMaisonにメッセージ',
      line: '確定のご連絡はMaisonのLINEトークにお届けします。',
      addButton: 'Maisonを友だち追加',
      addLine: '確定のご連絡をLINEで受け取るには、Maisonを友だち追加してください。',
    });
  });
});

describe('lineChatWords: the nudge, from what liff.getFriendship() said', () => {
  it('asks a customer who has not added Maison yet (friendFlag false) to add it', () => {
    expect(lineChatWords(COPY.en.lineChat, false)).toEqual({
      button: 'Add Maison on LINE',
      line: 'Add Maison on LINE to get your confirmation there.',
    });
    expect(lineChatWords(COPY.ja.lineChat, false)).toEqual({
      button: 'Maisonを友だち追加',
      line: '確定のご連絡をLINEで受け取るには、Maisonを友だち追加してください。',
    });
  });

  it('offers a friend (friendFlag true) the chat', () => {
    expect(lineChatWords(COPY.en.lineChat, true)).toEqual({
      button: 'Chat with Maison on LINE',
      line: 'Your confirmation arrives in the Maison chat.',
    });
    expect(lineChatWords(COPY.ja.lineChat, true)).toEqual({
      button: 'LINEでMaisonにメッセージ',
      line: '確定のご連絡はMaisonのLINEトークにお届けします。',
    });
  });

  it("shows the plain button when the call failed, or hasn't answered yet (null): LINE opens the right screen either way", () => {
    for (const locale of ['en', 'ja'] as const) {
      expect(lineChatWords(COPY[locale].lineChat, null), locale).toEqual(lineChatWords(COPY[locale].lineChat, true));
    }
  });
});

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
