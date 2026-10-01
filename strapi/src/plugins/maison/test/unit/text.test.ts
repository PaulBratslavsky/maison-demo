import { describe, expect, it } from 'vitest';
import { blocksToPlainText, teaser } from '../../server/src/domain/text';

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
