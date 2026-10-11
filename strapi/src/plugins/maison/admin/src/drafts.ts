import { SOMETHING_WRONG } from './assistant';
import type { StaffInquiry } from './inquiries';
import { PLUGIN_ID } from './pluginId';
import type { StaffQuestion } from './questions';

/**
 * The draft the assistant's drawer hands to the Maison page, and who may use one, apart from React. A draft is the text the assistant wrote
 * for one item. The chat never sends it: staff press Use this draft, the page opens the item's own dialog with the text in it, and staff send it
 * from there.
 */

/** What the drawer hands to the page between Use this draft and the list that takes it. It is held in memory (draftStore.ts), never in the address, so the text is not in the URL. */
export type PageDraft =
  | { kind: 'reply'; documentId: string; text: string }
  | { kind: 'answer'; reference: string; text: string };

/** The flags that decide whether a draft can be used. useRBAC holds only the flags the admin has, so at run time a missing one is undefined. */
export interface DraftAccess {
  canView: boolean;
  canReply: boolean;
  canRead: boolean;
  canAnswer: boolean;
}

/** An admin who may use no draft. What the drawer has before the menu icon has told it anything. */
export const NO_DRAFT_ACCESS: DraftAccess = { canView: false, canReply: false, canRead: false, canAnswer: false };

/**
 * Whether Use this draft shows on a draft's card. A reply needs the Inquiries tab, which `canView` opens, and Reply on LINE, which `canReply`
 * allows. An answer needs the Questions tab (`canRead`) and Answer (`canAnswer`). One flag of a pair is not enough: with reply alone the button
 * would lead to a tab the admin doesn't have. The server offers the draft tools under the same two pairs (`server/src/assistant/tools.ts`), and a
 * test holds the two equal.
 */
export const canUseDraft = (draft: PageDraft, access: DraftAccess): boolean =>
  draft.kind === 'reply' ? access.canView === true && access.canReply === true : access.canRead === true && access.canAnswer === true;

/**
 * The address Use this draft goes to: the Maison page on the tab that takes the draft, Inquiries for a reply and Questions for an answer. The text
 * is not in it. It is an absolute path inside the admin, as the Homepage widgets' links are, and the router adds the admin's base path.
 */
export const draftPath = (draft: PageDraft): string => `/plugins/${PLUGIN_ID}?tab=${draft.kind === 'reply' ? 'inquiries' : 'questions'}`;

/** What Use this draft does once the item has loaded: the dialog opens, or a notice says why it doesn't. */
export type DraftOutcome = { open: true } | { open: false; notice: string };

/** What staff are told when the item the draft is for can't be found any more, whether the server said 404 or answered with nothing. */
export const NOT_FOUND_NOTICE = "Couldn't find this item. It may have been deleted.";

/**
 * What Use this draft does for an inquiry, as the page loaded it just now, or null when it isn't there. A closed inquiry and a replied one take no
 * reply. A hand-off is answered under Questions, where the question's own flow and the product knowledge loop stay the one way to answer it, so the
 * notice names the question. The dialog opens in every other case, which is exactly when `canReplyTo` allows a reply.
 */
export const replyDraftOutcome = (inquiry: StaffInquiry | null): DraftOutcome => {
  if (inquiry === null) return { open: false, notice: NOT_FOUND_NOTICE };
  if (inquiry.status === 'closed') return { open: false, notice: "This inquiry is closed. The draft wasn't used." };
  if (inquiry.status === 'replied') return { open: false, notice: "This inquiry was replied to already. The draft wasn't used." };
  if (inquiry.question !== null) return { open: false, notice: `This inquiry is answered under Questions (${inquiry.question.reference}).` };
  return { open: true };
};

/**
 * What Use this draft does for a question, as the page loaded it just now, or null when it isn't there. An answered question takes no answer. An
 * open one does, and so does one a staff member took (Let them know), which is exactly when `canAnswer` allows an answer.
 */
export const answerDraftOutcome = (question: StaffQuestion | null): DraftOutcome => {
  if (question === null) return { open: false, notice: NOT_FOUND_NOTICE };
  if (question.status === 'answered') return { open: false, notice: `${question.reference} was answered already. The draft wasn't used.` };
  return { open: true };
};

/** The line above the box of a dialog that opened with a draft. Staff send the text in Maison's name, so they are told to check it first. */
export const DRAFTED_LINE = 'Drafted by the Maison assistant. Check every fact and edit it before you send.';

/** Whether a failed request was a 404: the item is gone. The errors of `useFetchClient` carry the HTTP status. */
export const isNotFoundError = (error: unknown): boolean => typeof error === 'object' && error !== null && (error as { status?: unknown }).status === 404;

/** Whether a request was cancelled. `useFetchClient` aborts a component's requests when it unmounts, so an abort means the list was left. */
export const isAbortError = (error: unknown): boolean => typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'AbortError';

/** What a list does once it has asked for the item a draft is for. A request cancelled because the tab was left shows nothing. */
export type DraftResolution<T> =
  | { action: 'open'; item: T }
  | { action: 'notify'; type: 'info' | 'danger'; message: string }
  | { action: 'cancelled' };

/**
 * Loads the item a draft is for, and says what the list does with it: open the dialog over the item, or show a notice. `load` gives null when the
 * server's answer holds no item, and throws when the request failed. A 404 is an item that is gone, and the outcome says so, as an info notice. A
 * request that was cancelled, because the tab was left, is nothing to tell anyone. Any other failure is shown in its own words as a danger notice,
 * since the item may well still be there and nothing was decided about the draft.
 */
export const resolveDraft = async <T>(load: () => Promise<T | null>, outcomeOf: (item: T | null) => DraftOutcome): Promise<DraftResolution<T>> => {
  let item: T | null;
  try {
    item = await load();
  } catch (error) {
    if (isAbortError(error)) return { action: 'cancelled' };
    if (!isNotFoundError(error)) {
      const message = error instanceof Error && error.message !== '' ? error.message : SOMETHING_WRONG;
      return { action: 'notify', type: 'danger', message };
    }
    item = null;
  }
  const outcome = outcomeOf(item);
  if (outcome.open === false) return { action: 'notify', type: 'info', message: outcome.notice };
  return item === null ? { action: 'notify', type: 'info', message: NOT_FOUND_NOTICE } : { action: 'open', item };
};
