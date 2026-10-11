import { toolDefinition } from '@tanstack/ai/client';

import { DRAFT_TOOLS } from './assistant';

/**
 * The browser's part of the two draft tools, for `useChat`. The server lists them with no `execute` (`server/src/assistant/tools.ts`), so a call to
 * one ends the run and comes here. `show` changes nothing and sends nothing: the card in the chat is the result, drawn from the message parts, and
 * the page's own dialogs send it. `useChat` sends `{ shown: true }` back by itself, and the model answers in one short sentence. The input schemas
 * are plain JSON Schema, so no schema library joins the admin bundle. A test holds their fields equal to the server's.
 *
 * They are in a file of their own, with no React in it, so `assistant.ts` stays free of any package and a test can run the same definitions the
 * page runs. They are made once, outside the component, because `useChat` keeps the options of its first render.
 */
const show = () => ({ shown: true });

const draftReply = toolDefinition({
  name: DRAFT_TOOLS.reply,
  description: 'Shows staff a draft reply to an inquiry. It sends nothing.',
  inputSchema: {
    type: 'object',
    properties: { documentId: { type: 'string' }, text: { type: 'string' } },
    required: ['documentId', 'text'],
  },
});

const draftAnswer = toolDefinition({
  name: DRAFT_TOOLS.answer,
  description: 'Shows staff a draft answer to a customer question. It sends nothing.',
  inputSchema: {
    type: 'object',
    properties: { reference: { type: 'string' }, text: { type: 'string' } },
    required: ['reference', 'text'],
  },
});

export const DRAFT_CLIENT_TOOLS = [draftReply.client(show), draftAnswer.client(show)];
