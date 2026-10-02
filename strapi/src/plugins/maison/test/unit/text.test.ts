import { describe, expect, it } from 'vitest';
import { blocksToPlainText, fitUnits, teaser } from '../../server/src/domain/text';

const blocks = [
  { type: 'heading', level: 2, children: [{ type: 'text', text: '旅のために' }] },
  { type: 'paragraph', children: [{ type: 'text', text: 'Hand-stitched ' }, { type: 'text', text: 'in Paris.', bold: true }] },
  { type: 'list', format: 'unordered', children: [
    { type: 'list-item', children: [{ type: 'text', text: 'Canvas' }] },
    { type: 'list-item', children: [{ type: 'text', text: 'Brass' }] },
  ] },
];

describe('blocksToPlainText', () => {
  it('joins blocks with blank lines and list items with newlines', () => {
    expect(blocksToPlainText(blocks)).toBe('旅のために\n\nHand-stitched in Paris.\n\nCanvas\nBrass');
  });

  it('returns an empty string for anything that is not a blocks array', () => {
    expect(blocksToPlainText(null)).toBe('');
    expect(blocksToPlainText('text')).toBe('');
  });
});

describe('teaser', () => {
  it('returns short text unchanged, with whitespace collapsed', () => {
    expect(teaser('  A   short\nstory ')).toBe('A short story');
  });

  it('cuts long text to max characters including the ellipsis', () => {
    const result = teaser('あ'.repeat(200), 160);
    expect(Array.from(result)).toHaveLength(160);
    expect(result.endsWith('…')).toBe(true);
  });
});

// Strapi's string maxLength counts UTF-16 units (JavaScript's .length), so a field that holds 100 characters
// takes 50 emoji, not 100.
describe('fitUnits', () => {
  it('returns text that fits collapsed and trimmed, uncut, counting its length after the collapse', () => {
    expect(fitUnits('  A   short\nstory ', 200)).toBe('A short story');
    expect(fitUnits('a'.repeat(200), 200)).toBe('a'.repeat(200));
    expect(fitUnits(`a${' '.repeat(300)}b`, 10)).toBe('a b');
  });

  it('cuts 201 letters to 199 and an ellipsis, which makes 200 UTF-16 units', () => {
    const result = fitUnits('a'.repeat(201), 200);
    expect(result).toBe(`${'a'.repeat(199)}…`);
    expect(result).toHaveLength(200);
  });

  it('cuts 201 Japanese characters to 199 and an ellipsis', () => {
    const result = fitUnits('あ'.repeat(201), 200);
    expect(result).toBe(`${'あ'.repeat(199)}…`);
    expect(result).toHaveLength(200);
  });

  it('cuts 100 emoji to 49 and an ellipsis, 99 units, never splitting one in half', () => {
    const result = fitUnits('😀'.repeat(100), 100);
    expect(result).toBe(`${'😀'.repeat(49)}…`);
    expect(result).toHaveLength(99);
    expect(result.length).toBeLessThanOrEqual(100);
  });
});
