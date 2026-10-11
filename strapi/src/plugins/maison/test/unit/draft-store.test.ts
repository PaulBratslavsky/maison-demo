import { afterEach, describe, expect, it, vi } from 'vitest';
import { offerDraft, pendingDraft, subscribeDraft, takeDraft } from '../../admin/src/draftStore';
import { draftPath, type PageDraft } from '../../admin/src/drafts';

/*
 * The second link between the Maison page and the assistant's drawer: the chat offers a draft, the page takes it. The two are in separate React roots,
 * so they share this module.
 */
const REPLY: PageDraft = { kind: 'reply', documentId: 'inq4abc', text: 'Thank you for telling us.' };
const ANSWER: PageDraft = { kind: 'answer', reference: 'Q-4821', text: 'Yes. A watch up to 42 mm fits.' };

afterEach(() => takeDraft());

describe('the store of drafts', () => {
  it('holds nothing until the chat offers a draft', () => {
    expect(pendingDraft()).toBeNull();
  });

  it('holds the draft the chat offered until the page takes it', () => {
    offerDraft(REPLY);
    expect(pendingDraft()).toBe(REPLY);
    takeDraft();
    expect(pendingDraft()).toBeNull();
  });

  it('holds one draft: a later offer replaces an earlier one that the page has not taken', () => {
    offerDraft(REPLY);
    offerDraft(ANSWER);
    expect(pendingDraft()).toBe(ANSWER);
  });

  it('clears only the draft the page dealt with: a newer one that arrived meanwhile stays', () => {
    offerDraft(REPLY);
    offerDraft(ANSWER);
    takeDraft(REPLY);
    expect(pendingDraft()).toBe(ANSWER);
    takeDraft(ANSWER);
    expect(pendingDraft()).toBeNull();
  });

  it('tells a listener when the draft changes, and not when taking changes nothing', () => {
    const listener = vi.fn();
    const stop = subscribeDraft(listener);
    takeDraft();
    expect(listener).not.toHaveBeenCalled();
    offerDraft(REPLY);
    expect(listener).toHaveBeenCalledTimes(1);
    takeDraft();
    expect(listener).toHaveBeenCalledTimes(2);
    stop();
    offerDraft(ANSWER);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe('the address Use this draft goes to', () => {
  it('is the Inquiries tab for a reply and the Questions tab for an answer, inside the Maison page', () => {
    expect(draftPath(REPLY)).toBe('/plugins/maison?tab=inquiries');
    expect(draftPath(ANSWER)).toBe('/plugins/maison?tab=questions');
  });

  it('never holds the text of the draft, nor the item it is for', () => {
    for (const draft of [REPLY, ANSWER]) {
      const path = draftPath(draft);
      expect(path).not.toContain(draft.text);
      expect(path).not.toContain(draft.kind === 'reply' ? draft.documentId : draft.reference);
    }
  });
});
