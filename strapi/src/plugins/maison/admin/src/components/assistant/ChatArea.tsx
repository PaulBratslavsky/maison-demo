import type { ReactNode } from 'react';

import type { ToolInfo } from '../../assistant';
import { ChatColumn, ChatLayout, ChatTopBar, TopBarSpacer } from './ChatFrame';
import { ModelBadge } from './ModelBadge';
import { ToolsPopover } from './ToolsPopover';
import { HistoryIcon, NewChatIcon, TopBarIcon } from './TopBarIcon';

interface ChatAreaProps {
  model: string;
  tools: readonly ToolInfo[];
  /** Whether there is a chat to start over from: messages, or a notice. With none, New chat does nothing and is switched off. */
  canStartOver: boolean;
  /** The notice under the messages offers a new chat as the way on: the button says so, in words. */
  newChatOffered: boolean;
  onNewChat: () => void;
  /** The history sidebar, to the left of the chat column. */
  sidebar: ReactNode;
  /** Whether the sidebar is open: the History button shows it, and its label says what it will do. */
  historyOpen: boolean;
  onToggleHistory: () => void;
  /** The chat column under the top bar: the messages, the error box and the composer. */
  children: ReactNode;
}

/**
 * The chat area: a white rectangle with the sidebar and the chat column in it, and in the column the top bar and what is under it. From
 * the left, the top bar has History, the tools and the model, and at the right end New chat. strapi-plugin-tanstack-ai's context badge,
 * "local" marker, memories and notes are not copied.
 */
export const ChatArea = ({ model, tools, canStartOver, newChatOffered, onNewChat, sidebar, historyOpen, onToggleHistory, children }: ChatAreaProps) => (
  <ChatLayout>
    {sidebar}
    <ChatColumn>
      <ChatTopBar>
        <TopBarIcon label={historyOpen ? 'Hide history' : 'History'} active={historyOpen} expanded={historyOpen} onClick={onToggleHistory}>
          <HistoryIcon />
        </TopBarIcon>
        <ToolsPopover tools={tools} />
        <ModelBadge model={model} />
        <TopBarSpacer />
        <TopBarIcon label="New chat" disabled={!canStartOver} emphasis={newChatOffered ? 'New chat' : undefined} onClick={onNewChat}>
          <NewChatIcon />
        </TopBarIcon>
      </ChatTopBar>
      {children}
    </ChatColumn>
  </ChatLayout>
);
