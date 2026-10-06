import * as React from 'react';

import { Box, Button, Flex, Textarea, Typography } from '@strapi/design-system';
import styled from 'styled-components';

import { askTabState, canSend, composerButtons, followsNewest, shouldSendOnKey, showsWorking, type MessageSource } from '../../assistant';
import { ChatArea } from './ChatArea';
import { ChatMessages } from './ChatMessages';
import { EmptyState } from './EmptyState';
import { useAssistant } from './AssistantProvider';

/** The messages scroll in their own box, which takes the height between the top bar and the text box. */
const MessageBox = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 24px;
`;

/**
 * The Ask tab: a chat for staff about requests, questions and inquiries. The chat itself, and the text staff have typed and not
 * sent, are in the provider above the tabs, so both are as staff left them when they come back from a list. Without a set-up
 * assistant the tab shows why, and no text box.
 */
export const AskTab = () => {
  const assistant = useAssistant();
  const box = React.useRef<HTMLTextAreaElement>(null);
  const list = React.useRef<HTMLDivElement>(null);
  // Whether the message box follows the newest message. It does until the reader scrolls up, and again after a send.
  const following = React.useRef(true);
  const messages = assistant?.messages;

  // The newest message comes into view as the answer streams in. Only the message box scrolls, never the page.
  React.useEffect(() => {
    const element = list.current;
    if (element && following.current) element.scrollTop = element.scrollHeight;
  }, [messages]);

  if (!assistant) return <Typography textColor="neutral600">The assistant is not available for your role.</Typography>;

  const state = askTabState(assistant.status, assistant.statusError);

  if (state.kind === 'loading') return <Typography textColor="neutral600">Checking the assistant…</Typography>;

  if (state.kind === 'failed' || state.kind === 'not-ready') {
    return (
      <Box background={state.kind === 'failed' ? 'danger100' : 'neutral0'} borderColor={state.kind === 'failed' ? 'danger200' : 'neutral150'} padding={6} hasRadius>
        <Flex direction="column" alignItems="flex-start" gap={3}>
          <Typography textColor={state.kind === 'failed' ? 'danger700' : 'neutral800'}>{state.text}</Typography>
          <Button size="S" variant="secondary" onClick={() => void assistant.recheck()}>
            Check again
          </Button>
        </Flex>
      </Box>
    );
  }

  const { busy, ready, notice, note, draft } = assistant;
  const buttons = composerButtons({ text: draft, busy, ready });

  const submit = (message: string, source: MessageSource) => {
    if (!canSend({ text: message, busy, ready })) return;
    following.current = true;
    void assistant.send(message, source);
    // A starter's button goes when the chat starts, and a clicked Send is switched off while the answer comes: the text box keeps the focus.
    box.current?.focus();
  };

  return (
    <ChatArea
      model={state.model}
      tools={state.tools}
      canStartOver={assistant.messages.length > 0 || notice !== null || note !== null}
      newChatOffered={notice?.newChat === true}
      onNewChat={assistant.newChat}
    >
      <MessageBox
        ref={list}
        role="region"
        aria-label="Chat messages"
        // Keyboard users scroll the box with the arrow keys once it has the focus.
        tabIndex={0}
        onScroll={(event: React.UIEvent<HTMLDivElement>) => {
          following.current = followsNewest(event.currentTarget);
        }}
      >
        {assistant.messages.length === 0 ? <EmptyState onStarter={(starter) => submit(starter, 'starter')} canStart={(starter) => canSend({ text: starter, busy, ready })} /> : <ChatMessages messages={assistant.messages} />}
      </MessageBox>

      <Flex direction="column" alignItems="stretch" gap={3} padding={4}>
        {showsWorking(busy, assistant.messages) && (
          <Typography role="status" textColor="neutral600">
            The assistant is working…
          </Typography>
        )}
        {notice && (
          <Typography role="alert" textColor="danger600">
            {notice.text}
          </Typography>
        )}
        {note && (
          <Typography role="status" textColor="neutral600">
            {note}
          </Typography>
        )}
        <Textarea
          ref={box}
          aria-label="Your message"
          placeholder="Ask about requests, questions or inquiries"
          value={draft}
          onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => assistant.setDraft(event.target.value)}
          onKeyDown={(event: React.KeyboardEvent<HTMLTextAreaElement>) => {
            // Enter sends. Shift+Enter adds a line break. Enter that confirms a Japanese conversion is not a send.
            // React's synthetic event has no isComposing: it is on the native event.
            if (shouldSendOnKey({ key: event.key, shiftKey: event.shiftKey, isComposing: event.nativeEvent.isComposing, keyCode: event.keyCode })) {
              event.preventDefault();
              submit(draft, 'box');
            }
          }}
        />
        <Flex gap={2}>
          {/* Send and Stop are two buttons side by side, each with its own key: a second click on Send, as in a double click, lands on a switched-off Send and never on Stop. */}
          <Button key="send" disabled={buttons.sendDisabled} onClick={() => submit(draft, 'box')}>
            Send
          </Button>
          {buttons.showStop && (
            <Button key="stop" variant="secondary" onClick={assistant.stop}>
              Stop
            </Button>
          )}
        </Flex>
      </Flex>
    </ChatArea>
  );
};
