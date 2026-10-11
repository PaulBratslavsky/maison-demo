import { useSyncExternalStore } from 'react';

import { type ChatReport } from './assistant';

/**
 * The first of the two links between the Maison page and the assistant: "ask about this item", from the page to the chat.
 *
 * The page and the chat are in separate React roots. The chat lives in the assistant's host (assistantHost.tsx), outside Strapi's React tree, so it has
 * no router and the page cannot read its context. The two share this module instead. The page's code and the chat's code are chunks of one plugin
 * bundle, so they load one instance of it. It holds three things:
 * - what the chat reports about itself (`reportChat`): whether the assistant is set up, and whether an answer is on its way. The rows read it to show
 *   Ask about this, and to wait while an answer comes;
 * - the message a row asked to send (`askTheChat`), which the chat takes (`takeAsk`), opens the drawer for and sends;
 * - how many lists want the assistant checked (`wantChatStatus`). The chat checks the assistant only when the drawer is first opened, so a list that
 *   shows Ask about this says so, and the chat checks it then. The button is shown once the assistant is known to be set up.
 */

let report: ChatReport | null = null;
let pending: string | null = null;
let wanting = 0;
const listeners = new Set<() => void>();

const notify = () => {
  // A copy, so a listener that unsubscribes while it is told does not skip the one after it.
  for (const listener of [...listeners]) listener();
};

/** Calls `listener` each time the report, the ask or the wish for a check changes. Answers the function that stops it. */
export const subscribeAsk = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** What the chat last reported, or null when no chat is on the screen: the admin may not use the assistant, or its code has not loaded yet. */
export const chatReport = (): ChatReport | null => report;

/** The chat tells the page where it stands. Null means the chat is gone, and an ask that nobody took goes with it. */
export const reportChat = (next: ChatReport | null): void => {
  const changed = next === null ? report !== null || pending !== null : report === null || report.ready !== next.ready || report.busy !== next.busy;
  if (!changed) return;
  report = next;
  if (next === null) pending = null;
  notify();
};

/**
 * A row asks the chat to send `text`. It answers whether the ask was kept. It is not kept when there is no chat, when the assistant is not ready, when
 * an answer is on its way (the ask is ignored, not saved for later), and when an earlier ask is still waiting for the chat to take it, so a double
 * click sends one message.
 */
export const askTheChat = (text: string): boolean => {
  if (report === null || !report.ready || report.busy || pending !== null) return false;
  pending = text;
  notify();
  return true;
};

/** The message waiting for the chat, or null. */
export const pendingAsk = (): string | null => pending;

/** The chat takes the waiting message: it answers it once, and the store holds none after that. */
export const takeAsk = (): string | null => {
  const text = pending;
  if (text === null) return null;
  pending = null;
  notify();
  return text;
};

/** A list that shows Ask about this is on the screen and wants the assistant checked. Answers the function that says it has gone. */
export const wantChatStatus = (): (() => void) => {
  wanting += 1;
  notify();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    wanting -= 1;
    notify();
  };
};

/** Whether a list wants the assistant checked now. */
export const chatStatusWanted = (): boolean => wanting > 0;

/** The chat's report, for a component of the page. It is null on the server render, which the admin does not have. */
export const useChatReport = (): ChatReport | null => useSyncExternalStore(subscribeAsk, chatReport, () => null);

/** The message waiting for the chat, for the component that sends it. */
export const usePendingAsk = (): string | null => useSyncExternalStore(subscribeAsk, pendingAsk, () => null);

/** Whether a list wants the assistant checked, for the component that holds the chat. */
export const useChatStatusWanted = (): boolean => useSyncExternalStore(subscribeAsk, chatStatusWanted, () => false);
