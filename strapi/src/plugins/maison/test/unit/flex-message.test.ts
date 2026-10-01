import { describe, expect, it } from 'vitest';
import { buildConfirmationMessage } from '../../server/src/domain/flex-message';

const input = {
  houseName: 'メゾン',
  reference: 'APT-4821',
  boutiqueName: '銀座本店',
  boutiqueAddress: '東京都中央区銀座1-2-3（デモ）',
  requestedForText: '10月10日(土) 14:00',
  productNames: ['ウィークエンダー50', 'パスポートカバー'],
  appLink: 'https://liff.line.me/1234567890-AbCdEfGh/visits/APT-4821',
};

const collectTexts = (node: unknown, texts: string[] = []): string[] => {
  if (Array.isArray(node)) node.forEach((child) => collectTexts(child, texts));
  else if (node && typeof node === 'object') {
    const record = node as Record<string, unknown>;
    if (record.type === 'text') texts.push(String(record.text));
    Object.values(record).forEach((value) => collectTexts(value, texts));
  }
  return texts;
};

describe('buildConfirmationMessage', () => {
  it('builds a bubble whose footer button opens the app link', () => {
    const message = buildConfirmationMessage(input);
    expect(message.altText).toBe('ご来店予約が確定しました（APT-4821）');
    expect(message.contents.type).toBe('bubble');
    const footer = message.contents.footer as { contents: Array<{ action: { type: string; uri: string; label: string } }> };
    expect(footer.contents[0].action).toEqual({ type: 'uri', label: '予約を確認する', uri: input.appLink });
  });

  it('includes every detail and never an empty text node', () => {
    const texts = collectTexts(buildConfirmationMessage(input).contents);
    for (const expected of ['メゾン', 'APT-4821', '銀座本店', '10月10日(土) 14:00', 'ウィークエンダー50、パスポートカバー']) {
      expect(texts).toContain(expected);
    }
    expect(texts.every((text) => text.length > 0)).toBe(true);
  });

  it('replaces an empty address with a dash, because LINE rejects empty text', () => {
    const texts = collectTexts(buildConfirmationMessage({ ...input, boutiqueAddress: '' }).contents);
    expect(texts).toContain('—');
  });
});
