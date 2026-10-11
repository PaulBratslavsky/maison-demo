import * as React from 'react';

import { NO_DRAFT_ACCESS, type DraftAccess, type PageDraft } from '../../drafts';

/**
 * What a draft card needs from outside the chat: who may use a draft, and what Use this draft does. The assistant's host knows both (the menu icon
 * tells it the permissions and the router's navigate function), and GlobalAssistant provides them here. Without a provider nobody may use a draft,
 * so a card in a test with no host shows its draft and no button.
 */
export interface DraftLink {
  access: DraftAccess;
  /** Use this draft was pressed: the draft goes to the Maison page, and the page goes to the tab that takes it. */
  openDraft: (draft: PageDraft) => void;
}

const DraftLinkContext = React.createContext<DraftLink>({ access: NO_DRAFT_ACCESS, openDraft: () => {} });

export const DraftLinkProvider = DraftLinkContext.Provider;

export const useDraftLink = (): DraftLink => React.useContext(DraftLinkContext);
