import { useSyncExternalStore } from 'react';

import type { PageDraft } from './drafts';

/**
 * The second of the two links between the Maison page and the assistant: "use this draft", from the chat to the page.
 *
 * The chat is in the assistant's host, a React root of its own, and the Maison page is in Strapi's. They share this module, as askStore.ts
 * explains. The chat offers the draft here (`offerDraft`) when staff press Use this draft, and goes to the page's tab. The page reads it
 * (`usePendingDraft`), hands it to the list that takes it, and clears it (`takeDraft`) once the list has dealt with it, either by opening the
 * dialog or by saying why not. The text is held in memory only: it is never in the address.
 *
 * One draft is held at a time. A second Use this draft before the page has taken the first replaces it, because it is the later choice.
 */

let pending: PageDraft | null = null;
const listeners = new Set<() => void>();

const notify = () => {
  // A copy, so a listener that unsubscribes while it is told does not skip the one after it.
  for (const listener of [...listeners]) listener();
};

/** Calls `listener` each time the pending draft changes. Answers the function that stops it. */
export const subscribeDraft = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** The chat offers a draft to the page, in place of any draft the page has not taken yet. */
export const offerDraft = (draft: PageDraft): void => {
  pending = draft;
  notify();
};

/** The draft waiting for the page, or null. */
export const pendingDraft = (): PageDraft | null => pending;

/**
 * The page has dealt with the draft. With `draft`, only that draft is cleared: a newer one that arrived while the page was loading the item
 * stays for the next turn. Without it, whatever is waiting is cleared.
 */
export const takeDraft = (draft?: PageDraft): void => {
  if (pending === null || (draft !== undefined && pending !== draft)) return;
  pending = null;
  notify();
};

/** The draft waiting for the page, for a component of the page. */
export const usePendingDraft = (): PageDraft | null => useSyncExternalStore(subscribeDraft, pendingDraft, () => null);
