interface BlockNode {
  type?: string;
  text?: string;
  children?: BlockNode[];
}

const textOf = (node: BlockNode): string => {
  if (typeof node.text === 'string') return node.text;
  if (Array.isArray(node.children)) return node.children.map(textOf).join('');
  return '';
};

/** Strapi blocks → plain text: blocks separated by blank lines, list items by newlines. */
export function blocksToPlainText(blocks: unknown): string {
  if (!Array.isArray(blocks)) return '';
  return (blocks as BlockNode[])
    .map((block) =>
      block.type === 'list' && Array.isArray(block.children) ? block.children.map(textOf).join('\n') : textOf(block)
    )
    .filter((text) => text.length > 0)
    .join('\n\n');
}

/** Collapses whitespace and cuts to `max` characters (code points), ending with "…" when cut. */
export function teaser(text: string, max = 160): string {
  const chars = Array.from(text.replace(/\s+/g, ' ').trim());
  return chars.length <= max ? chars.join('') : `${chars.slice(0, max - 1).join('')}…`;
}
