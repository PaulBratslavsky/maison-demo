# Handoff: the Maison staff chat (7 October 2026)

This is for the agent that continues the Maison staff chat on another computer. Read it all before you touch the code.

## What you are continuing

- **Project:** maison-demo. It holds a LINE mini app for a luxury boutique (`liff/`, Next.js) and a Strapi 5.55.1 back end (`strapi/`) with a local plugin, Maison (`strapi/src/plugins/maison`). Paul Bratslavsky owns it. It was built for his "UX to AX" talk (QBurst x LY, Tokyo, 7 October 2026).
- **The feature:** a staff AI chat inside the Strapi admin. Staff ask about appointment requests, customer questions and inquiries. Seven read-only tools answer, Claude Sonnet 5.5 writes the reply, and TanStack AI 0.52.3 runs the conversation. Chats are saved per admin. The chat never sends, confirms or changes anything. It can only save the admin's own chats.
- **Where it stands:** on branch `feat/maison-staff-chat`, about 40 commits ahead of `main`. It is tested locally only. Nothing on this branch is in production.
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
   - At handoff time the unit suite was about 113 files / 3,230 tests and the integration suite 149 tests, all passing. The counts grow with each task.
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

## What was running at handoff

- **Task D1, the drawer and the compact header.** Brief: `.superpowers/sdd/2026-10-07-maison-ask-tab-rebuild/task-d1-brief.md`.
  - Maison's left-menu icon component renders the chat into `document.body` with a React portal. Strapi draws menu icons on every admin page, and no documented API exists for that, so this is the only way to reach every page.
  - The design includes:
    - an owner rule, because icons can mount more than once
    - events stopped at the chat's root, because React passes portal events up to the menu link
    - a floating launcher button
    - a 480px drawer with Expand to 760px
    - the Ask tab removed
    - a compact page header
- **Server fix round 1** for the rebuild's server review. Spec: `server-fix-1.md`, review `review-server.md`.
  - The integration test over real HTTP with two admins.
  - The schema wording: a Super Admin can read saved chats through Strapi's Content Manager API.
  - A deleted chat during update.
  - One owner query.
  - `update` refusing an empty body.
  - Titles cut by grapheme.
  - The generated types.
- **The admin-side review** of the rebuild. Its output is `review-admin.md`.

Check the rebuild ledger and `git log` to see which of these finished. A task is done only when its commit exists and the ledger says "complete".

## What is left, in order

1. **Finish whatever was still running.** Then fix what `review-admin.md` found, applied to the code as D1 left it, because D1 moved the components into the drawer. Re-review the fixes.
2. **A docs round:**
   - the README and CHANGELOG wording about who can read saved chats (server review Important 2)
   - README wording (server review Minor 8)
   - Paul's checklist item for Tools (0) (server review Minor 9)
   - a README line that the sidebar lists the newest 100 chats (server review Minor 6, parked)
   - the admin's `conversationTitle` cut by grapheme like the server
3. **Paul's browser check of the drawer.**
   - On a Content Manager page and on the Maison page.
   - Reply on LINE and Answer open above the drawer.
   - The page stays clickable beside it.
   - Escape and the focus.
   - Expand and History.
   - The compact header.
   - Tables wrap in the narrow drawer.
   - Light and dark mode.
4. **The first plan's Tasks 11 to 16, adapted** (read `preflight-11-16.md` first; its UI rulings were made before the rebuild and the drawer, so check each against the current code):
   - **11: Ask about this.** A small button on each request, question and inquiry row. It opens the drawer and sends "Tell me about request APT-4821." (or question Q-..., or inquiry <documentId>). The message must not clear the staff member's draft.
   - **12: The two draft tools on the server.** `draft_reply` for an inquiry and `draft_answer` for a question. They are client tools, plus their read routes. They join the Tools list with the labels "Draft a LINE reply" and "Draft an answer".
   - **13: Draft cards** inside the assistant's bubble, with the client tools in `admin/src/assistant-client-tools.ts`.
     - The idle cleanup (`withoutOpenToolCalls`) must never remove a draft tool call that is waiting for or running its client execute.
     - `drawableParts` must count draft tool calls.
     - Saved chats keep their results.
   - **14: Use this draft.** It opens the page's own Reply on LINE or Answer dialog, pre-filled. Staff send it themselves.
   - **15: Integration tests.** Include one request aborted mid-stream, and one schema-invalid tool input through the real `chat()`.
   - **16: The live tests with a real key, run by Paul, and the docs.**
5. **The final whole-branch review,** on the most capable model, with one fix round.
6. **`finishing-a-development-branch`.** Present Paul the options: merge, pull request, or keep. He decides. Nothing reaches `main` without him.

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
