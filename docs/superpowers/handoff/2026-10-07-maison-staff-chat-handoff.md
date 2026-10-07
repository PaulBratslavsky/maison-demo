# Handoff: the Maison staff chat (7 October 2026)

This is for the agent that continues the Maison staff chat on another computer. Read it all before you touch the code.

## What you are continuing

- **Project:** maison-demo. It holds a LINE mini app for a luxury boutique (`liff/`, Next.js) and a Strapi 5.55.1 back end (`strapi/`) with a local plugin, Maison (`strapi/src/plugins/maison`). Paul Bratslavsky owns it. It was built for his "UX to AX" talk (QBurst x LY, Tokyo, 7 October 2026).
- **The feature:** a staff AI chat inside the Strapi admin. Staff ask about appointment requests, customer questions and inquiries. Seven read-only tools answer, Claude Sonnet 5.5 writes the reply, and TanStack AI 0.52.3 runs the conversation. Chats are saved per admin. The chat never sends, confirms or changes anything. It can only save the admin's own chats.
- **Where it stands:** on branch `feat/maison-staff-chat`, pushed to GitHub and about 60 commits ahead of `main`. It is tested locally only. Nothing on this branch is in production. The last commit is unfinished work: read "State at handoff" below.
- **Paul's last design decisions,** all recorded in the spec:
  - The chat looks and works like the chat in his own plugin, strapi-plugin-tanstack-ai 1.6.0.
  - It opens as a drawer from a floating button on every admin page.
  - The Maison page gets a compact header.

## Rules that are not negotiable

- **Never push to `main`, merge, or open a pull request without Paul's explicit OK.** Strapi Cloud deploys `main` on every push, and that is his production LINE app. Pushing `feat/maison-staff-chat` is allowed: Paul approved it on 7 October.
- **Never print, paste or commit a secret.** That covers any value from a `.env` file, a token, or a password. Read variable names only. The credentials come in the handoff folder, described below. They stay out of git and out of chat.
- **The local Strapi admin password is Paul's.** He types it. Never store it.
- **Commits are pathspec commits at the repo root,** each message ending with `Co-Authored-By: <the model you run as> <noreply@anthropic.com>`. Leave the untracked `.vscode/`, `liff/AGENTS.md` and `liff/CLAUDE.md` alone.
- **Writing rules** for every staff-facing string, comment, doc and commit message: plain English, short sentences, no em dashes, no en dashes, no metaphors or analogies. Name things literally.
- **Model choice (Paul):**
  - Sonnet for the app's model features. Opus is overkill.
  - The chat is `claude-sonnet-5-5`, and inquiry labelling stays on Claude Haiku 4.5.
  - Subagents that implement or review run on Sonnet. Only a final whole-branch review runs on the most capable model.
- **Verify Strapi facts** against docs.strapi.io or the installed source before you give instructions, and name the page.
- **Reference projects cover every layer, UI included.** When Paul names one, read its code for the part you build and match it. The chat's reference is strapi-plugin-tanstack-ai at https://github.com/PaulBratslavsky/strapi-plugin-tanstack-ai (1.6.0, also on npm). Clone it next to this repo if you need to compare.
- **Model calls only through TanStack AI** (server `chat()`, admin `useChat`) or the AI SDK. Never a raw `fetch` to a provider.
- **By-hand checks that could message a real phone use the made-up demo customers** (`line:Udec0de...01` to `...05`). Rows marked "Your LINE" belong to Paul and send real LINE messages.
- **Don't run a local Postgres or Docker.** Local development is SQLite.

## Set up the new computer

1. **Install the tools.**
   - Node 24 (this laptop runs v24.16.0; `engines` asks for >= 22.12.0) and npm 11.
   - git.
   - Claude Code with the superpowers plugin. The build uses its `subagent-driven-development`, `writing-plans` and `finishing-a-development-branch` skills.
2. **Get the code.**
   ```bash
   git clone https://github.com/PaulBratslavsky/maison-demo.git
   cd maison-demo
   git checkout feat/maison-staff-chat
   ```
3. **Use the handoff folder Paul brings,** `maison-handoff-2026-10-07`. It was on his laptop's Desktop. Keep it outside the repo. It holds this document as `HANDOFF.md`, plus the credentials and files below, copied as they were. Copy each file into place:

   | In the handoff folder | Goes to (inside the repo) | What it is |
   | --- | --- | --- |
   | `env/strapi.env` | `strapi/.env` | Strapi's secrets: app keys, JWT secrets, the AI key (`AI_API_KEY`), LINE tokens, demo settings |
   | `env/liff.env` | `liff/.env` | The LINE app's server-side settings |
   | `env/liff.env.local` | `liff/.env.local` | The LINE app's local overrides |
   | `env/root.env.cloud` | `.env.cloud` | Production settings, kept for reference. Not used locally |
   | `env/liff.env.cloud` | `liff/.env.cloud` | The same, for the LINE app |
   | `strapi-tmp/data.db` | `strapi/.tmp/data.db` | The local SQLite database, with Paul's local admin account and demo data |
   | `strapi-tmp/maison-ops-token`, `strapi-tmp/maison-ops-token.cloud` | `strapi/.tmp/` | Tokens for the ops scripts |
   | `sdd/2026-10-06-maison-staff-chat/`, `sdd/2026-10-07-maison-ask-tab-rebuild/` | `.superpowers/sdd/` | The build ledgers, task briefs, reports and reviews (git-ignored, so they don't come with the clone) |

   Then set the permissions:
   ```bash
   chmod 600 strapi/.env liff/.env liff/.env.local .env.cloud liff/.env.cloud strapi/.tmp/maison-ops-token*
   ```

   The variable names, never the values, are listed in `strapi/.env.example` and `liff/.env.example`.
4. **Install.** From the repo root, `npm install`. Its `postinstall` installs `strapi/` (whose own `postinstall` installs and builds the Maison plugin, then runs `strapi/scripts/share-strapi-utils.mjs`) and `liff/`, then runs `scripts/init-env.mjs`.
   - If you install only Strapi: `npm install --prefix strapi`.
   - After any `npm install` inside `strapi/src/plugins/maison`, run `node ../../../scripts/share-strapi-utils.mjs` from that folder. Without it, the plugin loads its own copy of `@strapi/utils`, and Content Manager errors turn into 500s.
5. **Run Strapi.**
   ```bash
   cd strapi && npm run dev
   ```
   - Open http://localhost:1338/admin. Ports 1337 and 3000 are kept free on Paul's machines.
   - Paul signs in with his local admin account, which is in `data.db`.
   - The chat needs `AI_API_KEY` (an Anthropic key, `AI_PROVIDER` unset or `anthropic`). Leave `AI_CHAT_MODEL` empty to use `claude-sonnet-5-5`.
   - The LINE app (`npm run dev --prefix liff`, port 3003) isn't needed for the staff chat.
6. **Check that everything is green** before you change anything:
   ```bash
   cd strapi/src/plugins/maison
   npm test
   npm run test:ts:back && npm run test:ts:front
   rm -rf dist && npm run build && node scripts/check-esm-import.mjs && node ../../../scripts/share-strapi-utils.mjs --check
   STRAPI_APP_DIR="$(cd ../../.. && pwd)" node --test --test-reporter=tap --test-concurrency=1 test/integration/*.test.mjs
   ```
   - At handoff the unit suite was 123 files with 3,426 tests. 3,419 passed; the 7 failures are the README tests of the unfinished D1 commit. The integration suite was 155 tests, all passing, before D1. The counts grow with each task.
   - Integration tests use their own SQLite databases and `listen(0)`, so they never touch the dev server on 1338.
   - No test calls Anthropic or LINE.

## The documents that drive the work

| File | What it is |
| --- | --- |
| `docs/superpowers/specs/2026-10-06-maison-staff-chat-design.md` | The spec. Sections 1 to 5 are the original design (6 Oct). Read the last two sections closely: "The Ask tab rebuild (7 October 2026)" and "The chat drawer and a compact page header (7 October 2026)". The later section wins where they disagree. |
| `docs/superpowers/plans/2026-10-06-maison-staff-chat.md` | The first plan, 16 tasks. Tasks 1 to 10 are built. Tasks 11 to 16 are still to do, adapted to the new components. |
| `docs/superpowers/plans/2026-10-07-maison-ask-tab-rebuild.md` | The rebuild plan, 8 tasks. All 8 are built. |
| `.superpowers/sdd/2026-10-06-maison-staff-chat/progress.md` | The first ledger: every "Ruling:" line for Tasks 1 to 10, the pre-flight scan, and `preflight-11-16.md` (48 places where Tasks 11 to 16 no longer fit the code, with proposed rulings) |
| `.superpowers/sdd/2026-10-07-maison-ask-tab-rebuild/progress.md` | The rebuild ledger, the latest state. Read it last: it says what is running, what was decided and why. |
| `.superpowers/sdd/2026-10-06-maison-staff-chat/reference-chat-ui-map.md` | A verified map of how Paul's plugin's chat looks and works, with what to copy |
| `strapi/src/plugins/maison/README.md` | The plugin's README, including the Ask section and Paul's browser checklist |

## What is built

- **First plan, Tasks 1 to 10.**
  - The permission "Use the Maison assistant".
  - The model setting.
  - The seven read tools, with masking and customer-text fences.
  - The instructions.
  - The stream wrapper.
  - The service, the routes and the error texts.
  - The first Ask tab.

  Each task was reviewed and fixed.
- **The rebuild, all 8 tasks** (commits 7cbe793 to 5bdb5af, plus the lockfile fix 16b1ae3):
  - the status answer lists the tools
  - Markdown answers with tables (images blocked, safe links only)
  - the chat area, the top bar (History, Tools (N), the model badge, New chat), the bubbles and the Sparkle avatar
  - collapsible tool boxes with tag-free JSON, failures in red
  - the typing dots, the composer, the error box and the set-up notice
  - saved chats (a content type, five owner-only routes, the history sidebar), and Reset demo activity clears them
  - component tests with jsdom and Testing Library
- **Paul tried the rebuilt chat on 7 October** and it worked: the model badge, a Markdown table of requests, the bullets and the avatar.

## State at handoff (7 October 2026, about 10:30 JST)

The branch is pushed. Its last commit is a work-in-progress commit:

- **`wip(maison): the chat drawer and the compact header, unfinished`.** This is Task D1, stopped part way for the move. Brief: `.superpowers/sdd/2026-10-07-maison-ask-tab-rebuild/task-d1-brief.md`.
  - Unit suite: 3,419 of 3,426 pass. The 7 failures are all in `test/unit/readme-ask.test.ts`, because the README's Ask section was being rewritten for the drawer. Both type checks are clean.
  - It has not been reviewed, and the cold build and integration tests have not been run on it.
  - What it holds:
    - the menu-icon mount (`MaisonMenuIcon.tsx`, `menuIconOwner.ts`, `assistantHost.tsx`, `GlobalAssistant.tsx`)
    - `Launcher.tsx`, `ChatDrawer.tsx`, `drawerWidth.ts` and `layer.ts` (the z-index)
    - the compact `PageHeader.tsx`
    - the Ask tab removed (`AskTab.tsx` deleted, its tests moved to `chat-drawer.test.tsx`)
    - many new component tests
- **Paul's seven pieces of feedback on the drawer.** He gave them while trying the unfinished drawer in his browser. All seven are in the spec's drawer section (commits 8fbf03d, 83d76fc, 7f673a9, a109a15), and they override the D1 brief. Some were in progress when D1 stopped. **Check each one against the code. Assume none is done until you see it and its test:**
  1. The drawer opens at 600px, not 480px.
  2. Tables:
     - header cells on one line
     - body cells break only between words (`overflow-wrap: break-word`, never `anywhere`), with about 7rem to 22rem per column
     - dates like `2026-10-05` and masked customers like `line:Udec…02` stay on one line
     - a wide table scrolls sideways inside the bubble
     - in the drawer, the assistant's bubble uses the full width beside the avatar

     His screenshots showed headers breaking as "Rec / eive / d" and dates as "202 / 6- / 10- / 05".
  3. Only the message list scrolls up and down. The top bar and the composer stay put, and a table's sideways scroll moves nothing else.
  4. Opening the drawer never starts or clears a chat. Closing and reopening shows the same chat. The first opening in a page load reopens the most recent saved chat. Only New chat starts a new one. He saw a new chat on every opening.
  5. The table fix applies at both widths.
  6. Expand only widens the chat, 600px to 960px. It doesn't open History.
  7. History adds width and never takes it from the chat. Opening it makes the drawer 260px wider (860px or 1220px), so the chat keeps its width. The list always sits beside the chat, with no overlay form. All widths are capped at 90vw.
- **Server fix round 1** for the rebuild's server review is done and committed (1b0edb8 to 52876d3, 13 commits). Its scoped re-review was started and stopped for the move, so it has not run. Report: `server-fix-1-report.md`.
- **The admin-side review** of the rebuild is done: `review-admin.md`, 1 Important and 9 Minors, with tests (Appendix A) and patches (Appendix C) ready. The fix round has not run. It applies to the code as D1 leaves it.

## What is left, in order

1. **Finish D1.**
   - Check Paul's seven changes and do what is missing, test first.
   - Fix the README section and `readme-ask.test.ts`. The section describes the drawer, with Paul's browser checklist for it.
   - Run every check: the whole unit suite, both type checks, the cold build, `check-esm-import`, `share-strapi-utils --check`, and the integration files `assistant-conversations`, `permissions` and `demo-activity`.
   - Then replace the WIP commit's subject in the history, or follow it with a normal commit that finishes the task. Don't rewrite anything already on `main`.
2. **A review of D1** on Sonnet, plus the scoped re-review of the server fix round (`server-fix-1.md`, review `review-server.md`). One fix round for both.
3. **The admin fix round** (`review-admin.md`, ruling R-AFIX in the rebuild ledger):
   - Important 1: the five tests in Appendix A.
   - Minors L1, L2 and L3: the patches in Appendix C.
   - L4: the admin's `conversationTitle` cut by grapheme like the server's `cutTitle`, with the server's test cases.
   - L5: `React.memo`.
   - L6: the accessibility names.
   - L7: the spec points with no test, and the order-dependent CSS asserts.
   - L8: idioms in comments. The status-check notice gets a fixed staff text, with the raw text going to the log.
   - L9: hide the footnote heading.
4. **A docs round.**
   - README and CHANGELOG: don't promise that only the admin can read a saved chat, because a Super Admin can, through the Content Manager API (server review Important 2).
   - README wording (server review Minor 8).
   - Paul's checklist item for Tools (0) (Minor 9).
   - A README line that the sidebar lists the newest 100 chats (Minor 6).
   - The saved-chat schema description still says "Ask tab of the Maison page". Reword it for the drawer and commit the regenerated `strapi/types/generated/contentTypes.d.ts`, which Strapi writes on its next start.
5. **Paul's browser check of the drawer.** Run `cd strapi && npm run dev`, and he signs in. Check:
   - the drawer on a Content Manager page and on the Maison page
   - Reply on LINE and Answer open above it
   - the page stays clickable
   - Escape and the focus
   - Expand and History widths
   - tables
   - reopening keeps the chat
   - the compact header
   - light and dark
6. **Merge to production. Paul approved this on 7 October, to happen after the drawer, the server fixes and the admin fixes are in and every check passes.** Confirm with him before you merge, because his production LINE app runs on this stack.
   - Open a pull request from `feat/maison-staff-chat` to `main` with `gh pr create`, and merge it with `gh pr merge`.
   - Strapi Cloud then deploys `main` (project `reassuring-feast-8a3e120af6`). Watch the deploy until it is live.
   - The deploy adds a new table, `maison_conversations`, on Postgres.
   - `AI_API_KEY` is already set on Strapi Cloud, and the model defaults to `claude-sonnet-5-5`. Super Admin gets the new permission automatically.
7. **The first plan's Tasks 11 to 16, adapted.** Read `preflight-11-16.md` first. Its UI rulings were made before the rebuild and the drawer, so check each against the current code.
   - **11: Ask about this.** A small button on each request, question and inquiry row. It opens the drawer and sends "Tell me about request APT-4821." (or question Q-..., or inquiry <documentId>). It must not clear the staff member's draft.
   - **12: The two draft tools on the server.** `draft_reply` for an inquiry and `draft_answer` for a question, as client tools, plus their read routes. They join the Tools list as "Draft a LINE reply" and "Draft an answer".
   - **13: Draft cards** inside the assistant's bubble, with the client tools in `admin/src/assistant-client-tools.ts`.
     - The idle cleanup (`withoutOpenToolCalls`) must never remove a draft tool call that is waiting for or running its client execute.
     - `drawableParts` must count draft tool calls.
     - Saved chats keep their results.
   - **14: Use this draft.** It opens the page's own Reply on LINE or Answer dialog, pre-filled. Staff send it themselves.
   - **15: Integration tests.** Include one request aborted mid-stream, and one schema-invalid tool input through the real `chat()`.
   - **16: The live tests with a real key, run by Paul, and the docs.**
8. **The final whole-branch review** on the most capable model, with one fix round. Then `finishing-a-development-branch`: Paul decides how it lands.

## How the work has been run

- Superpowers subagent-driven development. A brief is extracted per task (`task-brief PLAN N`). A Sonnet implementer writes the code test first, runs the full checks and commits. A Sonnet reviewer checks the spec and the quality from a review package (`review-package PLAN BASE HEAD`). Then come a fix round and a scoped re-review. Every decision goes in the ledger as `Ruling: <what> - <why> - <cost if wrong>`.
- On 7 October Paul said the process was too slow. Two changes followed:
  - The rebuild's 8 tasks were taken from the plan writer's replayed commits.
  - One combined review replaced 8 task reviews.

  Keep it lean: batch small fixes, review once per meaningful change, and don't wait on Paul between tasks.
- Paul's local Strapi runs from the same checkout. `strapi develop` restarts when files change. Stop it while many files change, and start it again for his checks.

## Production, for reference only

- Strapi Cloud project `reassuring-feast-8a3e120af6` deploys on every push to `main`.
- The LINE app is on Vercel (`maison-demo-neon`).
- Production has no `AI_CHAT_MODEL` and no staff chat until Paul approves.
- `MAISON_DEMO_LINE_USER_ID` on Strapi Cloud is Paul's LINE user ID. It gives him "Your LINE" demo rows that send real messages.
