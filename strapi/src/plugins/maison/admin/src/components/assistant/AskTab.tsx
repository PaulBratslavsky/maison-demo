import * as React from 'react';

import { Loader, Typography } from '@strapi/design-system';

import { askTabState, canSend, type MessageSource } from '../../assistant';
import { useAssistant } from './AssistantProvider';
import { ChatArea } from './ChatArea';
import { Composer } from './Composer';
import { ErrorBox, NoteBox } from './ErrorBox';
import { MessageList } from './MessageList';
import { SetupNotice } from './SetupNotice';

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

  if (state.kind === 'loading') return <Loader small>Checking the assistant…</Loader>;

  if (state.kind === 'failed') {
    return (
      <SetupNotice tone="danger" onCheckAgain={() => void assistant.recheck()}>
        {state.text}
      </SetupNotice>
    );
  }

  if (state.kind === 'not-ready') {
    return (
      <SetupNotice title="The assistant isn't set up" onCheckAgain={() => void assistant.recheck()}>
        {state.text}
      </SetupNotice>
    );
  }

  const { busy, ready, notice, note, draft } = assistant;

  const send = (message: string, source: MessageSource) => {
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
      <MessageList messages={assistant.messages} busy={busy} onStarter={(starter) => send(starter, 'starter')} canStart={(starter) => canSend({ text: starter, busy, ready })} />
      {notice && <ErrorBox>{notice.text}</ErrorBox>}
      {note && <NoteBox>{note}</NoteBox>}
      <Composer draft={draft} onDraft={assistant.setDraft} busy={busy} ready={ready} onSend={(text) => send(text, 'box')} onStop={assistant.stop} textareaRef={box} />
    </ChatArea>
  );
};
