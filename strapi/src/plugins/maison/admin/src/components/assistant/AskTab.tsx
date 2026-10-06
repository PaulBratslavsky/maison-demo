import * as React from 'react';

import { Box, Button, Flex, Textarea, Typography } from '@strapi/design-system';

import { STARTERS, askTabState, canSend, shouldSendOnKey } from '../../assistant';
import { ChatMessages } from './ChatMessages';
import { useAssistant } from './AssistantProvider';

/**
 * The Ask tab: a chat for staff about requests, questions and inquiries. The chat itself is in the provider above the tabs,
 * so it is as staff left it when they come back from a list. Without a set-up assistant the tab shows why, and no text box.
 */
export const AskTab = () => {
  const assistant = useAssistant();
  const [text, setText] = React.useState('');
  const end = React.useRef<HTMLDivElement>(null);
  const messageCount = assistant?.messages.length ?? 0;
  const lastMessage = assistant?.messages.at(-1);

  // The newest message comes into view as the answer streams in.
  React.useEffect(() => {
    end.current?.scrollIntoView?.({ block: 'nearest' });
  }, [messageCount, lastMessage]);

  if (!assistant) return <Typography textColor="neutral600">The assistant is not available for your role.</Typography>;

  const state = askTabState(assistant.status, assistant.statusError);

  if (state.kind === 'loading') return <Typography textColor="neutral600">Checking the assistant…</Typography>;

  if (state.kind === 'failed' || state.kind === 'not-ready') {
    return (
      <Box background={state.kind === 'failed' ? 'danger100' : 'neutral100'} padding={6} hasRadius>
        <Flex direction="column" alignItems="flex-start" gap={3}>
          <Typography textColor={state.kind === 'failed' ? 'danger700' : 'neutral800'}>{state.text}</Typography>
          <Button size="S" variant="secondary" onClick={() => void assistant.recheck()}>
            Check again
          </Button>
        </Flex>
      </Box>
    );
  }

  const { busy, ready, messages, notice, note } = assistant;
  const sendable = canSend({ text, busy, ready });

  const submit = (message: string) => {
    if (!canSend({ text: message, busy, ready })) return;
    setText('');
    void assistant.send(message);
  };

  return (
    <Flex direction="column" alignItems="stretch" gap={4}>
      <Flex direction="column" alignItems="flex-start" gap={1}>
        <Typography variant="delta" tag="h2">
          Ask
        </Typography>
        <Typography variant="pi" textColor="neutral600">
          Ask about requests, questions and inquiries. The assistant looks things up and never sends, confirms or changes anything. Model: {state.model}.
        </Typography>
      </Flex>

      {messages.length === 0 && (
        <Flex role="group" aria-label="Suggestions" gap={2} wrap="wrap">
          {STARTERS.map((starter) => (
            <Button key={starter} size="S" variant="secondary" disabled={!canSend({ text: starter, busy, ready })} onClick={() => submit(starter)}>
              {starter}
            </Button>
          ))}
        </Flex>
      )}

      {messages.length > 0 && <ChatMessages messages={messages} />}
      {busy && lastMessage?.role === 'user' && <Typography textColor="neutral600">The assistant is working…</Typography>}

      {(notice || note) && (
        <Flex direction="column" alignItems="flex-start" gap={2} role="status">
          {notice && <Typography textColor="danger600">{notice.text}</Typography>}
          {note && <Typography textColor="neutral600">{note}</Typography>}
        </Flex>
      )}
      <div ref={end} />

      <Flex direction="column" alignItems="stretch" gap={2}>
        <Textarea
          aria-label="Your message"
          placeholder="Ask about requests, questions or inquiries"
          value={text}
          onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => setText(event.target.value)}
          onKeyDown={(event: React.KeyboardEvent<HTMLTextAreaElement>) => {
            // Enter sends. Shift+Enter adds a line break. Enter that confirms a Japanese conversion is not a send.
            // React's synthetic event has no isComposing: it is on the native event.
            if (shouldSendOnKey({ key: event.key, shiftKey: event.shiftKey, isComposing: event.nativeEvent.isComposing, keyCode: event.keyCode })) {
              event.preventDefault();
              submit(text);
            }
          }}
        />
        <Flex gap={2} justifyContent="space-between">
          <Flex gap={2}>
            {busy ? (
              <Button variant="secondary" onClick={assistant.stop}>
                Stop
              </Button>
            ) : (
              <Button disabled={!sendable} onClick={() => submit(text)}>
                Send
              </Button>
            )}
          </Flex>
          {(messages.length > 0 || notice) && (
            <Button variant={notice?.newChat ? 'default' : 'tertiary'} onClick={assistant.newChat}>
              New chat
            </Button>
          )}
        </Flex>
      </Flex>
    </Flex>
  );
};
