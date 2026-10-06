import * as React from 'react';

import { Box, Button, Flex, Textarea, Typography } from '@strapi/design-system';

import { askTabState, canSend, composerButtons, shouldSendOnKey, type MessageSource } from '../../assistant';
import { ChatArea } from './ChatArea';
import { MessageList } from './MessageList';
import { useAssistant } from './AssistantProvider';

/**
 * The Ask tab: a chat for staff about requests, questions and inquiries. The chat itself, and the text staff have typed and not
 * sent, are in the provider above the tabs, so both are as staff left them when they come back from a list. Without a set-up
 * assistant the tab shows why, and no text box.
 */
export const AskTab = () => {
  const assistant = useAssistant();
  const box = React.useRef<HTMLTextAreaElement>(null);

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
      <MessageList messages={assistant.messages} busy={busy} onStarter={(starter) => submit(starter, 'starter')} canStart={(starter) => canSend({ text: starter, busy, ready })} />

      <Flex direction="column" alignItems="stretch" gap={3} padding={4}>
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
