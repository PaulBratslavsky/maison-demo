// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ChatArea } from '../../admin/src/components/assistant/ChatArea';
import { renderInTheme } from './render';

const TOOLS = [
  { name: 'list_requests', label: 'Visit requests' },
  { name: 'inquiry_counts', label: 'Inquiry counts' },
];

const area = (props: Partial<Parameters<typeof ChatArea>[0]> = {}) => (
  <ChatArea model="claude-sonnet-5-5" tools={TOOLS} canStartOver newChatOffered={false} onNewChat={() => {}} {...props}>
    <p>The messages and the composer</p>
  </ChatArea>
);

describe('ChatArea', () => {
  it('has the tools, the model and New chat in the top bar, in that order, and what it is given under it', () => {
    renderInTheme(area());
    const tools = screen.getByRole('button', { name: 'Tools (2)' });
    const model = screen.getByText('claude-sonnet-5-5');
    const newChat = screen.getByRole('button', { name: 'New chat' });
    const body = screen.getByText('The messages and the composer');
    const before = (a: Node, b: Node) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(before(tools, model)).toBe(true);
    expect(before(model, newChat)).toBe(true);
    expect(before(newChat, body)).toBe(true);
  });

  it('names the model as the status gave it: the ID as it is, which the badge draws in capitals', () => {
    renderInTheme(area({ model: 'claude-sonnet-5' }));
    expect(screen.getByText('claude-sonnet-5')).toBeTruthy();
  });

  it('counts the tools it is given on the Tools button', () => {
    renderInTheme(area({ tools: [] }));
    expect(screen.getByRole('button', { name: 'Tools (0)' })).toBeTruthy();
  });

  it('starts a new chat when New chat is pressed', async () => {
    const onNewChat = vi.fn();
    renderInTheme(area({ onNewChat }));
    await userEvent.click(screen.getByRole('button', { name: 'New chat' }));
    expect(onNewChat).toHaveBeenCalledOnce();
  });

  it('switches New chat off when there is no chat to start over from', async () => {
    const onNewChat = vi.fn();
    renderInTheme(area({ canStartOver: false, onNewChat }));
    const button = screen.getByRole('button', { name: 'New chat' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    await userEvent.click(button);
    expect(onNewChat).not.toHaveBeenCalled();
  });

  it('shows the words "New chat" on the button when the notice offers a new chat as the way on, and only then', () => {
    const { unmount } = renderInTheme(area({ newChatOffered: true }));
    expect(screen.getByRole('button', { name: 'New chat' }).textContent).toBe('New chat');
    unmount();
    renderInTheme(area({ newChatOffered: false }));
    expect(screen.getByRole('button', { name: 'New chat' }).textContent).toBe('');
  });

  it('does not copy the reference\'s memories, notes or context badge', () => {
    renderInTheme(area());
    for (const name of [/memories/i, /notes/i, /context/i, /local/i]) expect(screen.queryByRole('button', { name })).toBeNull();
  });

  it('draws in the dark theme too', () => {
    renderInTheme(area(), { dark: true });
    expect(screen.getByText('claude-sonnet-5-5')).toBeTruthy();
  });
});
