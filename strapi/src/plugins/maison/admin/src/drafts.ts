import { PLUGIN_ID } from './pluginId';

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
