# The Maison MINI App on the TanStack stack: design

**Status:** design approved in chat by Paul on 1 October 2026 (he picked "Everything before the talk", then added: "we have today, tomorrow and the whole weekend"). This spec is for his review before the plan is written.

**Reference, not to copy:** `/Users/paul/learning/tanstack-ai/tanstack-client`, his TanStack Start + TanStack AI client. In particular:
- `src/lib/chat.functions.ts`: a `createServerFn` POST that runs `chat()` and returns `toServerSentEventsResponse`;
- `src/lib/adapters.server.ts`: `anthropicText` / `ollamaText`;
- `src/lib/mcp-servers.server.ts`: `@tanstack/ai-mcp` with HTTP transport config.

## Why
- **Paul's call:** "Let's make everything be on the TanStack tech stack." Strapi's side already uses TanStack AI, through `strapi-plugin-tanstack-ai`, so the only refactor is the LINE MINI App in `liff/`.
- **Two talks:** the app is the demo for the 7 October QBurst × LY talk, and for Paul's React Summit talk on TanStack AI and Strapi. It should read as idiomatic TanStack, not a thin port.
- **Deployment:** the app will later run on Vercel or a similar host, and Strapi on Strapi Cloud. Nothing in this design may tie the app to the laptop.

## Goals
1. **Replace the stack.** Next.js 16 and the Vercel AI SDK give way to TanStack Start, TanStack Router (file routes), TanStack Query and TanStack AI (`@tanstack/ai`, `@tanstack/ai-anthropic`, `@tanstack/ai-ollama`, `@tanstack/ai-mcp`, `@tanstack/ai-react`), on Vite.
2. **Keep the outside identical:**
   - every screen, route path, accessible name and `data-testid`;
   - the redesigned look;
   - the bilingual copy;
   - LIFF sign-in and its mock;
   - the stage frame;
   - the LINE-mode proxy rules;
   - every npm command.
3. **Polling** on the visit screens, through TanStack Query (the feature Paul asked for on 1 October).
4. **Keep the existing tests.**
   - The 277 unit tests in `liff/lib/**` still pass.
   - The e2e suite (`liff/e2e/*.spec.ts`) passes against the new app with its selectors unchanged; only its web-server command may change.

## Non-goals
- The availability calendar: it has its own design and spec, after this.
- The staff AI chat in the Strapi admin: a Strapi-side task.
- Deploying to Vercel: out of scope, but keep Start's Vercel preset possible.
- Upgrading to Tailwind 4: Tailwind stays on its current major, with today's `tailwind.config.ts` tokens.

## Architecture

### Routes (`liff/src/routes/`, TanStack Router file routes)

| Today (Next app router) | TanStack Start |
| --- | --- |
| `app/page.tsx` (server component; reads the Home page) | `routes/index.tsx`: a loader runs a server function that calls `readHomePage()` on every request |
| `app/collections/[slug]/page.tsx` | `routes/collections.$slug.tsx` |
| `app/products/[slug]/page.tsx` | `routes/products.$slug.tsx` |
| `app/concierge/page.tsx` | `routes/concierge.tsx` |
| `app/visits/page.tsx` | `routes/visits.index.tsx` |
| `app/visits/[reference]/page.tsx` | `routes/visits.$reference.tsx` |
| `app/api/concierge/route.ts` | a server route `routes/api.concierge.ts`, or a `createServerFn` POST, whichever keeps the 401/413/400 order (see below); TanStack AI `chat()` |
| `app/mcp/route.ts` | server route `routes/mcp.ts` |
| `app/api/strapi-oauth-mcp-manager/oauth/token/route.ts` | server route at the same path |
| `app/uploads/[...path]/route.ts` | server route `routes/uploads.$.ts` |
| `app/layout.tsx` | `routes/__root.tsx`: fonts, `globals.css`, the provider and the phone frame |

Paths stay byte-identical: LIFF endpoints, LINE flex-message links (`/visits/<ref>`) and the e2e specs all depend on them.

### What carries over unchanged
- **`liff/lib/**` and its tests,** including the booking rules, copy, status, session, open-in-LINE, `home-page.ts`, `strapi-proxy.ts`, `concierge.ts`'s instructions and guards, and the model choice. Only the AI SDK-specific parts of `concierge.ts`/`model.ts` change (below).
- **The components** (`liff/components/**`), as plain React plus Tailwind. The only swaps: `next/link` becomes Router's `Link`, and the `next/navigation` hooks become Router's `useNavigate` and `useParams`. Eleven files import from `next/*` today.
- **The LIFF provider and its mock, the stage frame, and the fonts** (`@fontsource`, imported in the root route).

### Data: TanStack Query over the MCP tools
- **One query per screen.** Each screen's MCP tool call becomes a query keyed `['mcp', tool, args, locale]`, run through the existing MCP client (`@modelcontextprotocol/sdk` over StreamableHTTP to the app's `/mcp`, with the customer's session). Caching, retries and `isPending`/`isError` replace the hand-rolled loading state.
- **Polling:**
  - My visits and a visit's page set `refetchInterval: 10_000` with `refetchIntervalInBackground: false`, and refetch on window focus.
  - A refetch updates the list in place, with no spinner.
  - The Agent view logs a screen's first load, not its background refetches.
- **Mutations** (`request_appointment`) invalidate the visits query, so a new booking shows at once.

### The concierge: TanStack AI
- **The server function** (POST), shaped like the reference's `chatFn`:
  1. Check the session first: a missing session answers 401, before anything else.
  2. Read the body with the existing caps: 413 over 1 MB, then 400 for malformed bodies or roles other than user/assistant (`lib/concierge.ts`'s guards, reused).
  3. Connect to Strapi's MCP through `@tanstack/ai-mcp`, with HTTP transport to `${strapiOrigin()}/mcp` and an `Authorization: Bearer <customer session>` header. The agent can only do what that customer may do.
  4. Add the local `resolve_date` tool, as a TanStack AI tool with a zod schema.
  5. Fill in the conversation's locale on every Maison tool whose input has one. This is today's `withConversationLocale`, ported to TanStack AI's tool shape.
  6. Run `chat({ adapter, messages, tools, agentLoopStrategy: maxIterations(8), systemPrompts })` with today's instructions, word for word.
  7. Return `toServerSentEventsResponse(stream)`.
- **The model rule** is unchanged: `ANTHROPIC_API_KEY` gives Claude Sonnet 5 through `anthropicText`; otherwise `ollamaText` with `OLLAMA_MODEL` (default `qwen3-14b-32k`) at `OLLAMA_BASE_URL`. The model-error messages per provider (`lib/model.ts`) stay.
  - AI Gateway: kept only if `@tanstack/ai` has an adapter for it. Otherwise it's dropped, and the README says so.
- **The client:** `@tanstack/ai-react`'s `useChat` replaces the AI SDK's.
  - Message parts map onto today's rendering: assistant text, tool lines (`MCP · search_products ✓`, `Local · resolve_date ✓`), the three-column product grid, and the booking card.
  - The suggestions, Try again, and the "N MCP tools" panel stay as they are.

### The LINE-mode proxy (server routes)
- `/mcp`, the token endpoint and `/uploads/*` keep today's rules exactly (`lib/strapi-proxy.ts`):
  - 404 unless the app is in LINE mode;
  - flat-form-only token exchange;
  - 401 on a non-session bearer;
  - 1 MB caps;
  - no path climbing;
  - streaming `/mcp`.
- **The mode check.** It reads the mode at runtime on the server (`process.env`), never from a value inlined into client code.
- **The safety script.** `scripts/check-strapi-proxy.mjs` starts the new production server instead of `next start`. All 17 checks must pass.

### Public settings: `NEXT_PUBLIC_*` becomes `VITE_*`
- **The six names:** `NEXT_PUBLIC_LIFF_ID`, `_LIFF_MOCK`, `_MAISON_CLIENT_ID`, `_STRAPI_URL`, `_DEMO_LINE_USER_ID` and `_DEMO_LOCALE` become `VITE_*`.
- **Every reference updates:** `liff/`, `scripts/line-mode.mjs`, `strapi/scripts/maison-setup.mjs`, the e2e and live tests, `liff/.env.example` and the README.
- **Existing `.env` files migrate once.** `line-mode.mjs` copies each old key's value to its new name when the new one is missing, without printing it, so Paul's `liff/.env` keeps working with no re-setup.
- **Server-only settings keep their names:** `STRAPI_URL`, `ANTHROPIC_API_KEY`, `OLLAMA_*`.

### Commands (names unchanged)
- `npm run dev` (root) and `npm run dev --prefix liff`: Vite dev on 127.0.0.1:3003, plus the verify mock, with the LINE-mode guard as today.
- `npm run start:line`: `require-line`, then the production build, then the Start server on 127.0.0.1:3003. The README names the exact server command.
- `npm run tunnel`, `npm run qr`, `npm run mode*`: unchanged, except for what the env rename needs.

## Acceptance
1. **Tests:** root `npm test` passes (liff unit tests, Maison, scripts), plus both liff typechecks.
2. **e2e:** `npm run test:e2e` in local mode passes in full, with selectors unchanged; only `playwright.config.ts`'s web-server command may change.
3. **The tunnel checks:** `node liff/scripts/check-strapi-proxy.mjs` gives 17/17 against the LINE build.
4. **The browser:** every screen at 390×844, at 360 px and on the stage at 1280×720, in EN and JA, matching today's screenshots (`scratchpad/rd2/final/`). No horizontal scroll, and no dev overlay on stage.
5. **The phone, in LINE, through the tunnel:**
   1. sign-in;
   2. Home with the photos and the Strapi Home text;
   3. a booking through the concierge;
   4. staff confirm on the board;
   5. the LINE confirmation arrives (Task LN);
   6. My visits shows **Confirmed** without a reload.
6. **No `next` dependency** remains in `liff/package.json`, and no `ai`/`@ai-sdk/*` dependency.

## Safety net
1. **The LINE confirmation first.** Before the migration starts, the plugin's LINE confirmation (Task LN) is copied into the demo. The phone flow is verified on today's Next.js app, then tagged `demo-stable-nextjs`.
2. **A branch.** The migration runs on `feat/tanstack-app`, merged into `feat/maison-demo` only when the acceptance list passes.
3. **The cut-off is Sunday 4 October.** If the list isn't met by then, the talk runs on the tag.

## Risks
- **TanStack Start's server routes and streaming** must hold the `/mcp` stream open, as the Next route does. The proxy check's streaming test covers it.
- **TanStack AI's message-part shapes** differ from the AI SDK's. The concierge rendering is mapped and tested against both tool and text parts.
- **`@tanstack/ai-mcp`'s HTTP transport** must send the customer session header on every request. A unit test fakes the transport.
- **Env rename fallout:** a single grep must show zero `NEXT_PUBLIC_` left, with the one-time key migration tested.
