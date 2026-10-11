import * as React from 'react';

import { reportChat, takeAsk, useChatStatusWanted, usePendingAsk } from '../../askStore';
import { offerDraft } from '../../draftStore';
import { NO_DRAFT_ACCESS, draftPath, type DraftAccess, type PageDraft } from '../../drafts';
import { AssistantProvider, useAssistant } from './AssistantProvider';
import { ChatDrawer } from './ChatDrawer';
import { DraftLinkProvider, type DraftLink } from './draftLink';
import { Launcher } from './Launcher';

/**
 * The assistant as an admin meets it on any page: a launcher at the bottom right, and the drawer it opens. It is rendered by the assistant's host
 * (assistantHost.tsx), once, for an admin who may use the assistant, and stays while the admin moves between pages.
 *
 * - The provider is above the launcher and the drawer, so the chat, its saved chats and the draft are as staff left them when the drawer is closed
 *   and opened again. Closing the drawer does not stop an answer that is on its way.
 * - The drawer is drawn when it is first opened, and stays in the page from then on: closing hides it (see ChatDrawer). Opening it again shows the same
 *   screen, with the same messages, the same text box and the same scroll. Opening never starts a chat, never saves one and never clears the messages:
 *   only the New chat buttons start a chat. The first opening checks the assistant and reopens the most recent saved chat, once for the page load, in the provider.
 * - The provider asks the server nothing until the drawer has been opened once (`started`). This is on every admin page, and most pages never open it.
 * - The drawer's width is kept here, so it opens as wide as staff left it. Closing gives the focus back to the launcher.
 * - Ask about this, on a row of the Maison page, reaches the chat through `AskReceiver` below.
 * - Use this draft, on a draft card, goes the other way: the draft is offered to the page (draftStore.ts) and the router's `navigate` takes the admin to
 *   the tab that takes it. The drawer stays open. The host gives this component the router's `navigate` and the admin's draft permissions, since the
 *   host has no router and no Strapi provider.
 */

/**
 * The chat's end of Ask about this (askStore.ts). It tells the page where the chat stands, so the rows can show their button and wait while an answer
 * comes. And it takes the message a row asked to send: it opens the drawer when that is closed, and sends the message to the chat that is open, after
 * its messages. The message is sent as `ask`, which leaves what staff have typed in the text box as it was. It renders nothing.
 *
 * A message that arrives while an answer is on its way, or before the assistant is ready, is dropped: the rows do not offer the button then, so
 * this only happens when the state changed in the moment between the click and here.
 */
const AskReceiver = ({ onAsk }: { onAsk: () => void }) => {
  const assistant = useAssistant();
  const pending = usePendingAsk();
  const ready = assistant?.ready === true;
  const busy = assistant?.busy === true;
  const here = assistant !== null;

  // What the effect below reads, as of the latest render, so it never acts on an older state.
  const latest = React.useRef({ assistant, ready, busy, onAsk });
  latest.current = { assistant, ready, busy, onAsk };

  React.useEffect(() => {
    reportChat(here ? { ready, busy } : null);
  }, [here, ready, busy]);
  // The chat is gone from the page (the admin signed out, or lost the permission): the rows lose their button.
  React.useEffect(() => () => reportChat(null), []);

  React.useEffect(() => {
    if (pending === null) return;
    const text = takeAsk();
    const { assistant: chat, ready: isReady, busy: isBusy, onAsk: show } = latest.current;
    if (text === null || !chat || !isReady || isBusy) return;
    show();
    void chat.send(text, 'ask');
  }, [pending]);

  return null;
};

interface GlobalAssistantProps {
  /** Which drafts the admin may use: it decides which cards show Use this draft. */
  access?: DraftAccess;
  /** Strapi's router. Without it Use this draft offers the draft and goes nowhere. */
  navigate?: (to: string) => void;
}

export const GlobalAssistant = ({ access = NO_DRAFT_ACCESS, navigate }: GlobalAssistantProps) => {
  const [open, setOpen] = React.useState(false);
  const [expanded, setExpanded] = React.useState(false);
  const [started, setStarted] = React.useState(false);
  // Counts the asks, so the text box takes the focus for each one even when the drawer was open already.
  const [asks, setAsks] = React.useState(0);
  const checkStatus = useChatStatusWanted();
  const launcher = React.useRef<HTMLButtonElement>(null);
  // What a draft card needs from outside the chat. The draft goes to the page's store first, so the page finds it when it draws, and then the router
  // takes the admin there. The text is in the store and never in the address.
  const draftLink = React.useMemo<DraftLink>(
    () => ({
      access,
      openDraft: (draft: PageDraft) => {
        offerDraft(draft);
        navigate?.(draftPath(draft));
      },
    }),
    [access, navigate]
  );
  // Set when staff close the drawer, and used once the launcher is on the screen again.
  const returnsFocus = React.useRef(false);

  React.useEffect(() => {
    if (open || !returnsFocus.current) return;
    returnsFocus.current = false;
    launcher.current?.focus();
  }, [open]);

  return (
    <DraftLinkProvider value={draftLink}>
      <AssistantProvider started={started} checkStatus={checkStatus}>
        <AskReceiver
          onAsk={() => {
            setStarted(true);
            setOpen(true);
            setAsks((count) => count + 1);
          }}
        />
        <Launcher
          ref={launcher}
          open={open}
          onOpen={() => {
            setStarted(true);
            setOpen(true);
          }}
        />
        {started && (
          <ChatDrawer
            open={open}
            expanded={expanded}
            focusSignal={asks}
            onToggleExpanded={() => setExpanded((value) => !value)}
            onClose={() => {
              returnsFocus.current = true;
              setOpen(false);
            }}
          />
        )}
      </AssistantProvider>
    </DraftLinkProvider>
  );
};
