import type { ComponentProps } from 'react';

import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import styled from 'styled-components';

import { safeLink } from '../../assistant';

/**
 * The assistant's answer, drawn from Markdown: paragraphs, lists, tables, code, quotes and links. Copied from strapi-plugin-tanstack-ai
 * 1.6.0 (`MarkdownBody` in `MessageList.tsx`), with these changes.
 * - The four tints that were literal black overlays are theme colours, so inline code, code blocks and table headers show in the dark theme.
 * - Lists have their markers and headings their weight. The design system's global style takes both away (`list-style: none`, `font: unset`).
 * - Images are not drawn, and only an `http:` or `https:` link is a link (see `MarkdownLink`). The model reads customer text, and an image
 *   address or a link could carry other customers' words out of the page.
 * Raw HTML in an answer is shown as text: react-markdown does not render it.
 */
const Body = styled.div`
  p { margin: 0 0 8px; &:last-child { margin-bottom: 0; } }
  ul, ol { margin: 4px 0; padding-left: 20px; }
  ul { list-style: disc; }
  ol { list-style: decimal; }
  li { margin: 2px 0; }
  code {
    font-size: 0.85em;
    padding: 1px 4px;
    border-radius: 3px;
    background: ${({ theme }) => theme.colors.neutral150};
  }
  pre {
    margin: 8px 0;
    padding: 8px 10px;
    border-radius: 6px;
    overflow-x: auto;
    font-size: 0.85em;
    background: ${({ theme }) => theme.colors.neutral150};
    code { padding: 0; background: none; }
  }
  h1, h2, h3, h4 { margin: 12px 0 4px; font-weight: 600; &:first-child { margin-top: 0; } }
  h1 { font-size: 1.3em; } h2 { font-size: 1.15em; } h3 { font-size: 1.05em; }
  blockquote {
    margin: 8px 0;
    padding-left: 12px;
    border-left: 3px solid ${({ theme }) => theme.colors.neutral300};
    opacity: 0.85;
  }
  a { color: ${({ theme }) => theme.colors.primary600}; }
  table {
    border-collapse: collapse;
    margin: 8px 0;
    font-size: 0.9em;
    width: 100%;
    overflow-x: auto;
    display: block;
  }
  th, td {
    border: 1px solid ${({ theme }) => theme.colors.neutral300};
    padding: 4px 8px;
    text-align: left;
    white-space: nowrap;
  }
  th { background: ${({ theme }) => theme.colors.neutral150}; font-weight: 600; }
`;

/**
 * A link in an answer. Only an `http:` or `https:` address is a link: it opens in a new tab and gives the page no way back to its window.
 * Anything else is its text, as plain text. react-markdown hands its own `node` to a custom component, which is left out here so it does not
 * land on the element as an attribute.
 */
const MarkdownLink = ({ href, children, node: _node, ...props }: ComponentProps<'a'> & { node?: unknown }) => {
  const address = safeLink(href);
  if (!address) return <span>{children}</span>;
  return (
    <a {...props} href={address} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
};

const components = { a: MarkdownLink } as ComponentProps<typeof Markdown>['components'];

export const MarkdownBody = ({ text }: { text: string }) => (
  // `data-message-part` is a hook for tests: it lets a check read the rendered answer and nothing else in the message.
  <Body data-message-part="text">
    <Markdown remarkPlugins={[remarkGfm]} components={components} disallowedElements={['img']}>
      {text}
    </Markdown>
  </Body>
);
