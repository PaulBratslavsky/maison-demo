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
 *
 * A draft that no list takes does not stay: the admin may leave the Maison page before it has checked their permissions, or may have no tab for the
 * draft. Left in memory it would open a dialog the next time that tab is drawn, much later and for another task. So it is dropped after
 * DRAFT_LIFETIME_MS, which is long enough for the page to load and check, and for the list to take it.
 */

/** How long a draft waits for a list to take it, in milliseconds. */
export const DRAFT_LIFETIME_MS = 30_000;

let pending: PageDraft | null = null;
let expiry: ReturnType<typeof setTimeout> | null = null;

const stopExpiry = () => {
  if (expiry !== null) {
    clearTimeout(expiry);
    expiry = null;
  }
};
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
  stopExpiry();
  expiry = setTimeout(() => {
    expiry = null;
    if (pending !== draft) return;
    pending = null;
    notify();
  }, DRAFT_LIFETIME_MS);
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
  stopExpiry();
  notify();
};

/** The draft waiting for the page, for a component of the page. */
export const usePendingDraft = (): PageDraft | null => useSyncExternalStore(subscribeDraft, pendingDraft, () => null);
