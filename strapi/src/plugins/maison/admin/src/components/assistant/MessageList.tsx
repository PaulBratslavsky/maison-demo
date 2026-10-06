import { useEffect, useRef } from 'react';

import { Sparkle } from '@strapi/icons';
import type { UIMessage } from '@tanstack/ai-client';
import styled from 'styled-components';

import { drawableParts, followsNewest, showsToolWait, showsWorking, toolBoxOf, toolResultOf, type PartLike } from '../../assistant';
import { EmptyState } from './EmptyState';
import { MarkdownBody } from './MarkdownBody';
import { ToolBox } from './ToolBox';

/**
 * The messages of the chat, copied from strapi-plugin-tanstack-ai 1.6.0 (`MessageList.tsx`): staff on the right in a primary bubble, the
 * assistant on the left in a grey one with the Sparkle avatar outside it, each starting with its label. Colours are the theme's.
 *
 * What differs from the reference, on purpose:
 * - The parts of a message are drawn in the order they arrived: text, a tool box, more text. The reference joins all the text and puts
 *   the boxes after it.
 * - A message with nothing to draw is not drawn, so a turn that failed or is still thinking leaves no empty bubble.
 * - The waiting dots come from `showsWorking`, and show once in their own row, which also covers the wait before the first words come.
 * - The list follows the newest message only while the reader is at the bottom: no smooth scrolling and no scrollIntoView.
 */

const Scroller = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const Row = styled.div<{ $isUser: boolean }>`
  display: flex;
  align-items: flex-end;
  gap: 8px;
  align-self: ${({ $isUser }) => ($isUser ? 'flex-end' : 'flex-start')};
  max-width: 80%;
`;

const Avatar = styled.div`
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: ${({ theme }) => theme.colors.primary600};
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;

  svg {
    width: 16px;
    height: 16px;
    fill: ${({ theme }) => theme.colors.neutral0};
  }
`;

const Bubble = styled.div<{ $isUser: boolean }>`
  min-width: 0;
  background-color: ${({ $isUser, theme }) => ($isUser ? theme.colors.primary600 : theme.colors.neutral100)};
  color: ${({ $isUser, theme }) => ($isUser ? theme.colors.neutral0 : theme.colors.neutral800)};
  border-radius: ${({ $isUser }) => ($isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px')};
  padding: 12px 16px;
  font-size: 15px;
  word-break: break-word;
  line-height: 1.6;
`;

const Role = styled.div<{ $isUser: boolean }>`
  font-size: 11px;
  font-weight: 600;
  margin-bottom: 4px;
  opacity: 0.7;
  color: ${({ $isUser, theme }) => ($isUser ? theme.colors.neutral0 : theme.colors.neutral600)};
`;

/** Staff text, with its line breaks: the text box holds several lines. A long word wraps instead of widening the bubble. */
const StaffText = styled.div`
  white-space: pre-wrap;
  overflow-wrap: anywhere;
`;

const TypingDots = styled.span`
  display: inline-flex;
  gap: 4px;

  span {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: ${({ theme }) => theme.colors.neutral400};
    animation: bounce 1.4s infinite ease-in-out both;
  }
  span:nth-child(1) { animation-delay: 0s; }
  span:nth-child(2) { animation-delay: 0.2s; }
  span:nth-child(3) { animation-delay: 0.4s; }

  @keyframes bounce {
    0%, 80%, 100% { transform: scale(0.4); opacity: 0.4; }
    40% { transform: scale(1); opacity: 1; }
  }

  @media (prefers-reduced-motion: reduce) {
    span { animation: none; opacity: 0.6; }
  }
`;

const ToolWait = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  padding: 6px 0;
  font-size: 12px;
  color: ${({ theme }) => theme.colors.neutral600};
`;

const WaitSpinner = styled.span`
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid ${({ theme }) => theme.colors.neutral300};
  border-top-color: ${({ theme }) => theme.colors.primary600};
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  flex-shrink: 0;

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

interface MessageListProps {
  messages: readonly UIMessage[];
  /** Whether an answer is on its way. */
  busy: boolean;
  /** A starter in the empty state was pressed. */
  onStarter: (text: string) => void;
  /** Whether a send of this text would work now: a starter that would not is switched off. */
  canStart: (text: string) => boolean;
}

export const MessageList = ({ messages, busy, onStarter, canStart }: MessageListProps) => {
  const list = useRef<HTMLDivElement>(null);
  // Whether the list follows the newest message. It does until the reader scrolls up.
  const following = useRef(true);
  const first = messages[0];
  const last = messages.at(-1);

  // A different chat (another one opened, or a new one) starts at its end, and so does a chat staff have just sent a message in.
  useEffect(() => {
    following.current = true;
  }, [first?.id]);
  useEffect(() => {
    if (last?.role === 'user') following.current = true;
  }, [last?.id, last?.role]);

  // The newest message comes into view as the answer streams in. Only the list scrolls, never the page.
  useEffect(() => {
    const element = list.current;
    if (element && following.current) element.scrollTop = element.scrollHeight;
  }, [messages, busy]);

  const working = showsWorking(busy, messages);
  const toolWait = showsToolWait(busy, messages);

  return (
    <Scroller
      ref={list}
      role="region"
      aria-label="Chat messages"
      // Keyboard users scroll the list with the arrow keys once it has the focus.
      tabIndex={0}
      onScroll={(event) => {
        following.current = followsNewest(event.currentTarget);
      }}
    >
      {messages.length === 0 && <EmptyState onStarter={onStarter} canStart={canStart} />}

      {messages.map((message, index) => {
        const parts = message.parts as readonly PartLike[];
        const drawn = drawableParts(parts);
        if (drawn.length === 0) return null;
        const fromStaff = message.role === 'user';

        return (
          // `data-message-role` is a hook for tests, as in the reference: it lets a check read one side of the chat.
          <Row key={message.id} data-message-role={message.role} $isUser={fromStaff}>
            {!fromStaff && (
              <Avatar aria-hidden="true">
                <Sparkle />
              </Avatar>
            )}
            <Bubble $isUser={fromStaff}>
              <Role $isUser={fromStaff}>{fromStaff ? 'You' : 'Assistant'}</Role>
              {drawn.map((part, partIndex) => {
                if (part.type === 'text') return fromStaff ? <StaffText key={partIndex}>{part.content}</StaffText> : <MarkdownBody key={partIndex} text={part.content} />;
                const box = toolBoxOf(part, toolResultOf(parts, part.id));
                return box ? <ToolBox key={part.id} box={box} /> : null;
              })}
              {toolWait && index === messages.length - 1 && (
                <ToolWait role="status">
                  <WaitSpinner />
                  Working on it…
                </ToolWait>
              )}
            </Bubble>
          </Row>
        );
      })}

      {working && (
        <Row data-message-role="assistant" $isUser={false}>
          <Avatar aria-hidden="true">
            <Sparkle />
          </Avatar>
          <Bubble $isUser={false}>
            <Role $isUser={false}>Assistant</Role>
            <TypingDots role="status" aria-label="Assistant is replying">
              <span />
              <span />
              <span />
            </TypingDots>
          </Bubble>
        </Row>
      )}
    </Scroller>
  );
};
