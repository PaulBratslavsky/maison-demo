import type { Core } from '@strapi/strapi';

import { SAVED_CHATS, UID } from '../constants';
import { toStoredMessages, readStoredMessages, type StoredMessages } from '../assistant/stored-messages';
import { failure, type ServiceResult } from '../domain/service-result';

/** What the sidebar lists of a chat: no messages, so a long history stays a short answer. */
export interface SavedChatRow {
  documentId: string;
  title: string;
  updatedAt: string;
}

/** A chat as the page opens it. */
export interface SavedChat extends SavedChatRow {
  createdAt: string;
  messages: StoredMessages['messages'];
}

/** What the page saves: the title is cut to its limit, and the messages are checked. */
export interface SaveInput {
  title?: unknown;
  messages?: unknown;
}

const NO_CHAT = 'There is no saved chat with that ID.';
const NO_CHAT_HINT = 'Reload the page: it may have been deleted.';
const NOT_SAVED = 'This chat could not be saved.';
const NOT_SAVED_HINT = 'Start a new chat and try again.';

/** The title staff see in the sidebar: the words on one line, cut to its limit by characters, so an emoji or a Japanese character is never split. */
export const cutTitle = (title: unknown): string => {
  const text = typeof title === 'string' ? title.replace(/\s+/g, ' ').trim() : '';
  return text === '' ? 'New chat' : Array.from(text).slice(0, SAVED_CHATS.titleChars).join('');
};

/**
 * The Ask tab's saved chats. Every method takes the admin it is for, and answers only for that admin's own chats: a chat that belongs to
 * someone else is answered as one that is not there (`not_found`), the same words as for an ID nobody has, so the answer never confirms
 * that it exists.
 */
export default ({ strapi }: { strapi: Core.Strapi }) => {
  const documents = () => strapi.documents(UID.conversation);

  /**
   * The chat, when this admin owns it, in one query on the ID and the admin together. A chat that belongs to someone else and an ID nobody
   * has then take the same path and cost the same work. With `fields`, only those are read: update and remove need the ID, and not the
   * messages, which can be up to 1 MB.
   */
  const owned = (adminId: number, documentId: string, fields?: string[]) =>
    documents().findFirst({ filters: { documentId: { $eq: documentId }, adminUserId: { $eq: adminId } }, ...(fields ? { fields } : {}) });

  const summary = (row: any): SavedChatRow => ({ documentId: row.documentId, title: row.title, updatedAt: row.updatedAt });

  return {
    /** The admin's chats, newest first, at most 100. */
    async list(adminId: number): Promise<SavedChatRow[]> {
      const rows = (await documents().findMany({
        filters: { adminUserId: { $eq: adminId } },
        fields: ['title', 'updatedAt'],
        sort: { updatedAt: 'desc' },
        limit: SAVED_CHATS.listRows,
      })) as any[];
      return rows.map(summary);
    },

    /** One chat with its messages. A stored value that cannot be read opens as an empty chat, and the log says which one. */
    async view(adminId: number, documentId: string): Promise<ServiceResult<SavedChat>> {
      const row: any = await owned(adminId, documentId);
      if (!row) return failure('not_found', NO_CHAT, NO_CHAT_HINT);
      const { messages, error } = readStoredMessages(row.messages);
      if (error) strapi.log.warn(`[maison] Saved chat ${documentId} has messages that can't be read (${error}), so it opens empty. The stored value is left as it is.`);
      return { ok: true, value: { ...summary(row), createdAt: row.createdAt, messages } };
    },

    /** Saves a new chat for the admin. The admin is the one signed in, whatever the body says. */
    async create(adminId: number, input: SaveInput): Promise<ServiceResult<SavedChatRow>> {
      const stored = toStoredMessages(input.messages);
      if (!stored.ok) return failure('invalid_input', NOT_SAVED, NOT_SAVED_HINT);
      const row = await documents().create({ data: { title: cutTitle(input.title), messages: stored.value as never, adminUserId: adminId } });
      return { ok: true, value: summary(row) };
    },

    /** Saves a chat the admin owns again: the title, the messages, or both. Nothing is written when the body is not valid. */
    async update(adminId: number, documentId: string, input: SaveInput): Promise<ServiceResult<SavedChatRow>> {
      if (!(await owned(adminId, documentId, ['documentId']))) return failure('not_found', NO_CHAT, NO_CHAT_HINT);
      const data: Record<string, unknown> = {};
      if (input.title !== undefined) data.title = cutTitle(input.title);
      if (input.messages !== undefined) {
        const stored = toStoredMessages(input.messages);
        if (!stored.ok) return failure('invalid_input', NOT_SAVED, NOT_SAVED_HINT);
        data.messages = stored.value;
      }
      const row = await documents().update({ documentId, data: data as never });
      return { ok: true, value: summary(row) };
    },

    /** Deletes a chat the admin owns, at once. */
    async remove(adminId: number, documentId: string): Promise<ServiceResult<{ documentId: string }>> {
      if (!(await owned(adminId, documentId, ['documentId']))) return failure('not_found', NO_CHAT, NO_CHAT_HINT);
      await documents().delete({ documentId });
      return { ok: true, value: { documentId } };
    },
  };
};
