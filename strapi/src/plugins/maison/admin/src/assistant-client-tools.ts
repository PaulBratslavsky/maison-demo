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

/**
 * What the page tells the draft tools about Stop. After Stop, ai-client still processes the chunks it had already read. A run that ends in a draft
 * call has the call, a snapshot of the messages and a RUN_FINISHED with the interrupt, which arrive one after another, so a Stop that lands between
 * the arrival and the processing leaves the interrupt to be processed afterwards. Running the tool then would send the follow-up request by itself.
 * - `stopped` says whether staff have pressed Stop (or New chat) since they last sent a message.
 * - `halt` stops the chat again. Called from inside a tool, it makes ai-client drop the tool's result and send no follow-up.
 */
export interface DraftGuard {
  stopped: () => boolean;
  halt: () => void;
}

/** The tool's page part: it shows the draft, unless staff have pressed Stop, when it does nothing and drops the run. */
const showUnlessStopped = (guard: DraftGuard) => () => {
  if (!guard.stopped()) return show();
  guard.halt();
  return { shown: false };
};

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

/** The client tools of one chat, which do nothing once staff have pressed Stop. */
export const draftClientTools = (guard: DraftGuard) => {
  const run = showUnlessStopped(guard);
  return [draftReply.client(run), draftAnswer.client(run)];
};

/** The same tools with no Stop to look at, for a test that runs them without a provider. */
export const DRAFT_CLIENT_TOOLS = [draftReply.client(show), draftAnswer.client(show)];
