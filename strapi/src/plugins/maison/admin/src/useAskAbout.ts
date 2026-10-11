import * as React from 'react';

import { askButtonState, askMessage, type AskItem } from './assistant';
import { askTheChat, useChatReport, wantChatStatus } from './askStore';

/**
 * What a row needs for its Ask about this button: whether to show it, whether it waits, and what it does. The button is shown once the assistant is
 * set up, and waits while an answer comes. With no chat on the screen (the admin may not use the assistant) it shows nothing.
 *
 * Pressing it leaves the message in askStore.ts for the chat, which opens the drawer and sends it. While a list that uses this is on the screen it also
 * asks for the assistant to be checked, since the chat checks it only when the drawer is first opened and the button needs to know sooner.
 */
export const useAskAbout = (): { show: boolean; disabled: boolean; ask: (item: AskItem) => void } => {
  const chat = useChatReport();
  React.useEffect(() => wantChatStatus(), []);
  const { show, disabled } = askButtonState(chat);
  return {
    show,
    disabled,
    ask: (item) => {
      askTheChat(askMessage(item));
    },
  };
};
