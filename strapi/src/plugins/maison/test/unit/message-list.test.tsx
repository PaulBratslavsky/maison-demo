// @vitest-environment jsdom
import { lightTheme } from '@strapi/design-system';
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MessageList } from '../../admin/src/components/assistant/MessageList';
import { renderInTheme } from './render';

type Part = Record<string, any>;
const text = (content: string): Part => ({ type: 'text', content });
const staff = (id: string, content = 'Which visits are waiting?') => ({ id, role: 'user', parts: [text(content)] }) as never;
const assistant = (id: string, parts: Part[]) => ({ id, role: 'assistant', parts }) as never;
const runningCall = (id: string): Part => ({ type: 'tool-call', id, name: 'list_requests', arguments: '{}', state: 'input-complete' });
const finishedCall = (id: string, output: unknown = { requests: [{ reference: 'APT-4821' }], capped: false }): Part => ({ type: 'tool-call', id, name: 'list_requests', arguments: '{}', state: 'complete', output });
const failedCall = (id: string): Part => finishedCall(id, { error: { code: 'not_found', message: 'No request APT-4812.', hint: 'Check the reference.' } });

const list = (messages: unknown[], props: Partial<Parameters<typeof MessageList>[0]> = {}) => (
  <MessageList messages={messages as never} busy={false} onStarter={() => {}} canStart={() => true} {...props} />
);
const rows = (container: HTMLElement, role?: string) => Array.from(container.querySelectorAll(`[data-message-role${role ? `="${role}"` : ''}]`)) as HTMLElement[];

/** The rules styled-components wrote for an element: every rule in the document that starts with one of its classes. */
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

describe('the empty chat', () => {
  it('shows the empty state with the starters, and no message', () => {
    const { container } = renderInTheme(list([]));
    expect(screen.getByText('Ask Maison')).toBeTruthy();
    expect(screen.getAllByRole('button')).toHaveLength(3);
    expect(rows(container)).toHaveLength(0);
  });

  it("sends a starter's text when it is pressed, and switches off the starters that cannot send", async () => {
    const onStarter = vi.fn();
    renderInTheme(list([], { onStarter, canStart: (starter) => starter !== 'Any complaints this week?' }));
    await userEvent.click(screen.getByRole('button', { name: 'Which visits are waiting for staff?' }));
    expect(onStarter).toHaveBeenCalledExactlyOnceWith('Which visits are waiting for staff?');
    expect((screen.getByRole('button', { name: 'Any complaints this week?' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows no empty state once there is a message', () => {
    renderInTheme(list([staff('u1')]));
    expect(screen.queryByText('Ask Maison')).toBeNull();
  });
});

describe('the messages', () => {
  it('draws a staff message on the right, with the label "You", and no avatar', () => {
    const { container } = renderInTheme(list([staff('u1', 'Which visits are waiting?')]));
    const [row] = rows(container, 'user');
    expect(within(row).getByText('You')).toBeTruthy();
    expect(within(row).getByText('Which visits are waiting?')).toBeTruthy();
    expect(row.querySelector('svg')).toBeNull();
    expect(cssOf(row)).toContain('align-self:flex-end');
  });

  it('keeps the line breaks of a staff message, and wraps a long word instead of widening the bubble', () => {
    const { container } = renderInTheme(list([staff('u1', 'First line\nSecond line')]));
    const body = within(rows(container, 'user')[0]).getByText(/First line/);
    expect(body.textContent).toBe('First line\nSecond line');
    expect(cssOf(body)).toContain('white-space:pre-wrap');
    expect(cssOf(body)).toContain('overflow-wrap:anywhere');
  });

  it('draws a staff message as text, never as Markdown: what staff type is what they sent', () => {
    const { container } = renderInTheme(list([staff('u1', '**not bold** and a | b')]));
    const [row] = rows(container, 'user');
    expect(row.querySelector('strong')).toBeNull();
    expect(within(row).getByText('**not bold** and a | b')).toBeTruthy();
  });

  it('draws an assistant message on the left, with the Sparkle avatar outside its bubble and the label "Assistant"', () => {
    const { container } = renderInTheme(list([staff('u1'), assistant('a1', [text('Three visits wait.')])]));
    const [row] = rows(container, 'assistant');
    expect(within(row).getByText('Assistant')).toBeTruthy();
    const avatar = row.querySelector('svg') as SVGElement;
    expect(avatar).not.toBeNull();
    expect(avatar.parentElement?.getAttribute('aria-hidden')).toBe('true');
    expect(within(row).getByText('Three visits wait.')).toBeTruthy();
    expect(cssOf(row)).toContain('align-self:flex-start');
  });

  it("draws an assistant answer as Markdown: a table, which an answer of items with the same fields uses", () => {
    const table = ['| Reference | Status |', '| --- | --- |', '| APT-4821 | requested |'].join('\n');
    const { container } = renderInTheme(list([staff('u1'), assistant('a1', [text(table)])]));
    const [row] = rows(container, 'assistant');
    expect(within(row).getByRole('table')).toBeTruthy();
    expect(within(row).getByRole('cell', { name: 'APT-4821' })).toBeTruthy();
    expect(row.querySelector('[data-message-part="text"]')).not.toBeNull();
  });

  it('draws each part in the order it arrived: text, then a tool box, then more text', () => {
    const { container } = renderInTheme(list([staff('u1'), assistant('a1', [text('Let me look.'), finishedCall('c1'), text('One visit waits.')])]));
    const [row] = rows(container, 'assistant');
    const order = Array.from(row.querySelectorAll('[data-message-part]')).map((part) => `${part.getAttribute('data-message-part')}:${part.textContent?.slice(0, 20)}`);
    expect(order).toHaveLength(3);
    expect(order[0]).toBe('text:Let me look.');
    expect(order[1]).toMatch(/^tool:.*list_requests/);
    expect(order[2]).toBe('text:One visit waits.');
  });

  it('draws one box for each tool call, in the order of the calls, closed at first', () => {
    const { container } = renderInTheme(list([staff('u1'), assistant('a1', [finishedCall('c1'), runningCall('c2'), failedCall('c3')])]));
    const boxes = Array.from(container.querySelectorAll('[data-message-part="tool"]'));
    expect(boxes.map((box) => box.getAttribute('data-state'))).toEqual(['done', 'running', 'failed']);
    for (const box of boxes) expect(within(box as HTMLElement).getByRole('button').getAttribute('aria-expanded')).toBe('false');
  });

  it('marks a failed box, and opens a finished one to its result', async () => {
    const { container } = renderInTheme(list([staff('u1'), assistant('a1', [finishedCall('c1'), failedCall('c2')])]));
    const [done, failed] = Array.from(container.querySelectorAll('[data-message-part="tool"]')) as HTMLElement[];
    expect(within(failed).getByText('failed')).toBeTruthy();
    expect(cssOf(failed)).toContain(lightTheme.colors.danger200);
    await userEvent.click(within(done).getByRole('button'));
    expect(done.querySelector('pre')?.textContent).toContain('"reference": "APT-4821"');
  });

  it('draws no message with nothing to draw: thinking alone, or no part at all, leaves no empty bubble', () => {
    const { container } = renderInTheme(list([staff('u1'), assistant('a1', [{ type: 'thinking', content: 'Let me think.' }]), assistant('a2', []), assistant('a3', [text('   ')])]));
    expect(rows(container, 'assistant')).toHaveLength(0);
    expect(rows(container, 'user')).toHaveLength(1);
  });

  it('draws no part for a tool that has no box: a draft tool, which has a card of its own', () => {
    const { container } = renderInTheme(list([staff('u1'), assistant('a1', [text('Here.'), { type: 'tool-call', id: 'c1', name: 'draft_reply', arguments: '{}', state: 'complete' }])]));
    expect(container.querySelectorAll('[data-message-part="tool"]')).toHaveLength(0);
  });

  it('colours a staff bubble in the primary colour and an assistant bubble in grey, from the theme', () => {
    const { container } = renderInTheme(list([staff('u1'), assistant('a1', [text('Hi.')])]));
    const staffBubble = within(rows(container, 'user')[0]).getByText('You').parentElement as HTMLElement;
    const assistantBubble = within(rows(container, 'assistant')[0]).getByText('Assistant').parentElement as HTMLElement;
    expect(cssOf(staffBubble)).toContain(`background-color:${lightTheme.colors.primary600}`);
    expect(cssOf(assistantBubble)).toContain(`background-color:${lightTheme.colors.neutral100}`);
  });

  it('wraps a long word in an assistant bubble instead of widening it, and keeps the bubble at most 80% of the list', () => {
    const { container } = renderInTheme(list([staff('u1'), assistant('a1', [text('x'.repeat(400))])]));
    const row = rows(container, 'assistant')[0];
    const bubble = within(row).getByText('Assistant').parentElement as HTMLElement;
    expect(cssOf(bubble)).toContain('word-break:break-word');
    expect(cssOf(bubble)).toContain('min-width:0');
    expect(cssOf(row)).toContain('max-width:80%');
  });

  it('is a region named "Chat messages" that the keyboard can scroll', () => {
    renderInTheme(list([staff('u1')]));
    const region = screen.getByRole('region', { name: 'Chat messages' });
    expect(region.getAttribute('tabindex')).toBe('0');
  });
});

describe('waiting', () => {
  it('shows the dots in an assistant bubble with the avatar while the answer is on its way and nothing has come yet', () => {
    const { container } = renderInTheme(list([staff('u1')], { busy: true }));
    const dots = screen.getByRole('status', { name: 'Assistant is replying' });
    const row = dots.closest('[data-message-role]') as HTMLElement;
    expect(row.getAttribute('data-message-role')).toBe('assistant');
    expect(within(row).getByText('Assistant')).toBeTruthy();
    expect(row.querySelector('svg')).not.toBeNull();
    expect(dots.querySelectorAll('span')).toHaveLength(3);
    expect(rows(container)).toHaveLength(2);
  });

  it('shows the dots while the assistant message holds only thinking, and not any other time', () => {
    renderInTheme(list([staff('u1'), assistant('a1', [{ type: 'thinking', content: '...' }])], { busy: true }));
    expect(screen.getByRole('status', { name: 'Assistant is replying' })).toBeTruthy();
  });

  it('shows no dots once words or a tool box are on the screen: that is the sign of work', () => {
    const { unmount } = renderInTheme(list([staff('u1'), assistant('a1', [text('Looking.')])], { busy: true }));
    expect(screen.queryByRole('status', { name: 'Assistant is replying' })).toBeNull();
    unmount();
    renderInTheme(list([staff('u1'), assistant('a1', [runningCall('c1')])], { busy: true }));
    expect(screen.queryByRole('status', { name: 'Assistant is replying' })).toBeNull();
  });

  it('shows no dots when nothing is answering', () => {
    renderInTheme(list([staff('u1')], { busy: false }));
    expect(screen.queryByRole('status', { name: 'Assistant is replying' })).toBeNull();
  });

  it('shows "Working on it…" under the tool boxes while a tool runs below text that has already come', () => {
    const { container } = renderInTheme(list([staff('u1'), assistant('a1', [text('Let me look.'), runningCall('c1')])], { busy: true }));
    const wait = within(screen.getByRole('region', { name: 'Chat messages' })).getByRole('status');
    expect(wait.textContent).toBe('Working on it…');
    const bubble = rows(container, 'assistant')[0];
    expect(bubble.contains(wait)).toBe(true);
    const box = bubble.querySelector('[data-message-part="tool"]') as HTMLElement;
    expect(Boolean(box.compareDocumentPosition(wait) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
    expect(screen.queryByRole('status', { name: 'Assistant is replying' })).toBeNull();
  });

  it('shows no "Working on it…" with no text yet, when every tool is over, or when nothing is answering', () => {
    const { unmount: first } = renderInTheme(list([staff('u1'), assistant('a1', [runningCall('c1')])], { busy: true }));
    expect(screen.queryByText('Working on it…')).toBeNull();
    first();
    const { unmount: second } = renderInTheme(list([staff('u1'), assistant('a1', [text('Let me look.'), finishedCall('c1')])], { busy: true }));
    expect(screen.queryByText('Working on it…')).toBeNull();
    second();
    renderInTheme(list([staff('u1'), assistant('a1', [text('Let me look.'), runningCall('c1')])], { busy: false }));
    expect(screen.queryByText('Working on it…')).toBeNull();
  });
});

describe('scrolling', () => {
  /** Gives the scroller a height and a scroll position, which jsdom does not work out. */
  const measure = (region: HTMLElement, { scrollHeight, clientHeight = 400, scrollTop = 0 }: { scrollHeight: number; clientHeight?: number; scrollTop?: number }) => {
    let top = scrollTop;
    Object.defineProperty(region, 'scrollHeight', { configurable: true, get: () => scrollHeight });
    Object.defineProperty(region, 'clientHeight', { configurable: true, get: () => clientHeight });
    Object.defineProperty(region, 'scrollTop', { configurable: true, get: () => top, set: (value: number) => (top = value) });
  };

  it('follows the newest message while the reader is at the bottom', () => {
    const view = renderInTheme(list([staff('u1')]));
    const region = screen.getByRole('region', { name: 'Chat messages' });
    measure(region, { scrollHeight: 1000, scrollTop: 600 });
    view.rerender(list([staff('u1'), assistant('a1', [text('Hello.')])]));
    expect(region.scrollTop).toBe(1000);
  });

  it('lets a reader who has scrolled up read on: the answer does not pull them down', () => {
    const view = renderInTheme(list([staff('u1'), assistant('a1', [text('Hello.')])]));
    const region = screen.getByRole('region', { name: 'Chat messages' });
    measure(region, { scrollHeight: 1000, scrollTop: 100 });
    fireEvent.scroll(region);
    view.rerender(list([staff('u1'), assistant('a1', [text('Hello. And more words.')])]));
    expect(region.scrollTop).toBe(100);
  });

  it('follows again after staff send a message', () => {
    const view = renderInTheme(list([staff('u1'), assistant('a1', [text('Hello.')])]));
    const region = screen.getByRole('region', { name: 'Chat messages' });
    measure(region, { scrollHeight: 1000, scrollTop: 100 });
    fireEvent.scroll(region);
    view.rerender(list([staff('u1'), assistant('a1', [text('Hello.')]), staff('u2', 'And the questions?')]));
    expect(region.scrollTop).toBe(1000);
  });

  it('starts at the end of a different chat: another one is opened, even when the reader had scrolled up in the last', () => {
    const view = renderInTheme(list([staff('u1'), assistant('a1', [text('Hello.')])]));
    const region = screen.getByRole('region', { name: 'Chat messages' });
    measure(region, { scrollHeight: 1000, scrollTop: 100 });
    fireEvent.scroll(region);
    view.rerender(list([staff('other-1'), assistant('other-2', [text('An older chat.')])]));
    expect(region.scrollTop).toBe(1000);
  });
});

describe('the dark theme', () => {
  it('draws the messages with the dark theme\'s colours', () => {
    const { container } = renderInTheme(list([staff('u1'), assistant('a1', [text('Hi.')])]), { dark: true });
    expect(rows(container)).toHaveLength(2);
    const staffBubble = within(rows(container, 'user')[0]).getByText('You').parentElement as HTMLElement;
    expect(cssOf(staffBubble)).not.toContain(lightTheme.colors.primary600);
  });
});
