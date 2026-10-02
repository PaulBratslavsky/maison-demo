# The Maison MINI App on the TanStack stack: design

> **On hold, and changing shape (1 Oct 2026, evening).** Paul: "will refactor to tanstack after the presentation", then "build another frontend with tanstack so we have two examples". The talk runs on the Next.js app (tag `demo-stable-nextjs`). After 7 Oct this becomes a second frontend beside `liff/`, on the same Strapi, not a migration of it: sections that remove or replace the Next.js app no longer apply, and the document needs that revision, and Paul's review, before anyone builds from it.

**Status:** direction approved by Paul on 1 October 2026: "Everything before the talk", then "we have today, tomorrow and the whole weekend". This revision follows his reference project, which he shared "for a reason: it has an implementation example for TanStack". It is for his review before the plan is written.

## The reference, and how to use it
`/Users/paul/learning/tanstack-ai`: Paul's TanStack Start + TanStack AI client, and his `strapi-plugin-tanstack-ai`. It's a reference, not code to copy. Its own rule applies: before writing a file, read the reference's equivalent end to end, name the decision carried over, then write fresh.

| Concern | Reference file | Decision carried over |
| --- | --- | --- |
| Architecture | `docs/ARCHITECTURE.md` §2–5 | Three planes. The browser holds no secrets. The Start server owns inference, MCP and secrets. Strapi owns the tools and their permissions. **Server functions for all data fetching; the chat stream is the only exception** (decision 5). |
| Chat transport | `tanstack-client/src/lib/chat.functions.ts` | A `createServerFn({ method: 'POST' }).validator(...)` running `chat()`, returning `toServerSentEventsResponse`. The MCP pool uses `connection: 'close'` (never close it early: tools run lazily) and `onDiscoveryError` (a source down doesn't kill the chat). `agentLoopStrategy: maxIterations(n)`. |
| Adapters | `tanstack-client/src/lib/adapters.server.ts` | The only provider-specific code, in a `.server.ts`: `anthropicText` / `ollamaText`. The model that answered is echoed back and shown, never assumed. |
| MCP pool config | `tanstack-client/src/lib/mcp-servers.server.ts` | `createMCPClients({ <key>: { transport: { type: 'http', url, headers } } })`, where the pool key prefixes the tool names. A bearer goes in the headers, server-side only. |
| Client chat | `tanstack-client/src/routes/index.tsx`, `components/MessageList.tsx` | `useChat({ fetcher: (input, { signal }) => chatFn({ data, signal }) })`. **Values go per send, through `sendMessage(text, { body })`, never captured** (decision 10: a stale closure fails silently). Message parts are `text`, `thinking`, `tool-call` (with `name` and `arguments` as a JSON string) and `tool-result`. |
| Root and router | `routes/__root.tsx`, `router.tsx`, `vite.config.ts` | `shellComponent` with `HeadContent`/`Scripts`; `getRouter()` with `scrollRestoration` and `defaultPreload: 'intent'`; the `tanstackStart()` Vite plugin. |
| Server-only enforcement | `ARCHITECTURE.md` §4 | `*.server.ts` naming, so an accidental client import fails at build time. Verify that secrets are absent from the client bundle. |
| API details | `AGENTS.md` (TanStack Intent), `.reference/tanstack-ai`, `.reference/tanstack-router` | Before editing, load the matching guides: `pnpm dlx @tanstack/intent@latest load @tanstack/react-start#lifecycle/migrate-from-nextjs`, plus `start-core/server-functions`, `start-core/server-routes`, `start-core/execution-model`, `start-core/auth-server-primitives`, `router-core/data-loading` and `start-core/deployment`. **Docs over examples** when they disagree (decision 9). Use `.validator()`, never `.inputValidator()` (decision 8). |

## Why
- **Paul's call:** "Let's make everything be on the TanStack tech stack." Strapi's side already uses TanStack AI, through `strapi-plugin-tanstack-ai`, so the refactor is the LINE MINI App in `liff/`.
- **Two talks:** the app is the demo for the 7 October QBurst × LY talk and for Paul's React Summit talk on TanStack AI and Strapi. It must read as idiomatic TanStack.
- **Deployment:** the app will run on Vercel or a similar host, and Strapi on Strapi Cloud.

## Goals
1. **Replace the stack.** Next.js 16 and the Vercel AI SDK give way to TanStack Start, Router (file routes), Query and TanStack AI (`@tanstack/ai`, `ai-anthropic`, `ai-ollama`, `ai-mcp`, `ai-react`), on Vite.
2. **Follow the reference's boundary.** The browser holds no secrets, makes no MCP calls and never calls Strapi. Every screen's data and the concierge come from server functions, which call Strapi's MCP as the signed-in customer.
3. **Keep the outside identical:**
   - every screen, path, accessible name and `data-testid`;
   - the redesign;
   - the bilingual copy;
   - LIFF sign-in and its mock;
   - the stage frame;
   - every npm command.
4. **Polling** on the visit screens, through TanStack Query.
5. **Keep the tests.** The pure `lib/**` tests still pass. The e2e browser specs pass with their selectors unchanged.

## Non-goals
- The availability calendar: its own spec, after this.
- The staff chat in the Strapi admin: Strapi-side.
- The deploy itself: keep Start's Vercel deployment path open.
- Tailwind 4: Tailwind stays on its current major with today's tokens, so the redesign carries over untouched.

## Architecture

### Three planes
- **Browser (presentation):**
  - The routes and components.
  - LIFF, which yields the LINE ID token.
  - TanStack Query, whose queries call server functions.
  - `useChat`.
  - It holds no session token, no key and no Strapi URL.
- **Start server (inference and data access):**
  - Server functions in `src/lib/*.functions.ts`.
  - Secret custody in `src/lib/*.server.ts`: the customer session, the Strapi origin and the OAuth client ID, and the model keys.
  - The MCP client to Strapi.
  - `chat()`.
- **Strapi (data):** unchanged. The Maison tools, under the customer token's permissions.

### Sign-in and session (HttpOnly cookie)
1. The browser initialises LIFF (or the mock), then sends the ID token to `signInFn`.
2. `signInFn` exchanges it with Strapi's oauth-mcp-manager, server-side (the token-exchange grant, as `lib/session.ts` builds it today). It stores the customer session in an **HttpOnly, Secure, SameSite=Lax cookie** that expires with the session, and returns the masked customer and the expiry.
3. Every other server function reads the cookie through one middleware (`requireCustomer`). With no valid session it answers 401; the client then signs in again (LIFF gives a fresh ID token) and retries once.
4. **What this removes:** today's public `/mcp` proxy and token-endpoint proxy, and with them the "only what the phone sends" rules. Nothing the browser sends reaches Strapi except through a server function.

### Data: server functions plus TanStack Query
- **One server function per tool the screens use:** `browse_collections`, `search_products`, `view_product`, `find_boutiques`, `request_appointment`, `my_appointments`.
  - Each validates its input with zod and calls the Maison tool through Strapi's MCP as the customer (`maison-mcp.server.ts`: MCP SDK client, StreamableHTTP, `Authorization: Bearer <session>`).
  - Each returns `{ data, call }`, where `call` is `{ tool, args, ms, ok }`. **The Agent view still shows every screen's MCP calls**, as on stage today.
- **Queries:**
  - keyed `['maison', tool, args, locale]`, so caching, retries and pending and error states come built in;
  - **polling:** My visits and a visit refetch every 10 s while visible (`refetchIntervalInBackground: false`) and on focus, updating in place;
  - **mutations:** `request_appointment` invalidates the visits query.
  - Background refetches don't add Agent view entries; first loads do.
- **Home:** the route's loader calls a server function that runs `readHomePage()` on every request (no cache).

### The concierge: `chatFn` (the only stream)
`chatFn` is `createServerFn({ method: 'POST' }).validator(...)`. In order:
1. **The session (from the cookie) first:** 401 without one.
2. **The guards,** which carry over from `lib/concierge.ts`: messages only user/assistant, the size caps, well-formed parts.
3. **The model:** `adapters.server.ts`. With `ANTHROPIC_API_KEY`, `anthropicText('claude-sonnet-5')`; otherwise `ollamaText(OLLAMA_MODEL)`. The per-provider error messages stay. The answering model is returned to the client and shown in the Agent view.
4. **MCP:** `createMCPClients({ maison: { transport: { type: 'http', url: `${strapiOrigin()}/mcp`, headers: { Authorization: `Bearer ${session}` } } } })`, with `connection: 'close'` and `onDiscoveryError`. The tools come prefixed `maison_*`. The instructions use those names, and the UI strips the prefix for display (`MCP · search_products ✓`).
5. **`resolve_date`:** a local server tool through `toolDefinition(...).server(...)`.
6. **The locale is sent per message** with `sendMessage(text, { body: { locale } })`, never captured. The server fills it in on every Maison tool whose input takes one (today's `withConversationLocale`).
7. **`chat({ adapter, messages, mcp, tools, systemPrompts, agentLoopStrategy: maxIterations(8) })`,** with today's instructions, renamed for `maison_*`. Returned through `toServerSentEventsResponse`.
8. **The client:** `useChat({ fetcher })` as in the reference. The parts map onto today's rendering: assistant text, tool lines (including `Local · resolve_date ✓`), the product grid, the booking card, the suggestions, Try again and the "N MCP tools" panel.

### Images
`/uploads/*` stays a server route, so images load through the tunnel and on Vercel alike: GET only, image types only, no path climbing (today's rules). Product and boutique image URLs from the tools are rewritten to it.

### Public surface (LINE mode through the tunnel)
- **Exposed:** the pages, Start's server-function endpoint and `/uploads/*`. Server functions are same-origin, CSRF-guarded by Start, and every data function needs the session cookie.
- **Gone:** `/mcp`, `/api/strapi-oauth-mcp-manager/*` and any other path to Strapi: they answer 404.
- **The check script:** `liff/scripts/check-strapi-proxy.mjs` becomes `check-public-surface.mjs` and proves it against the production server:
  - those 404s;
  - a data function without a cookie answers 401;
  - `/uploads` refuses climbing and non-GET;
  - Strapi is reached only through server functions with a session.

### Settings
- **Client-safe values become `VITE_*`:** the LIFF ID, the mock flag, the demo locale and the demo LINE user ID. They're read through `import.meta.env`.
- **Server-only values:** `STRAPI_URL`, `MAISON_CLIENT_ID`, `ANTHROPIC_API_KEY` and `OLLAMA_*`. The OAuth client ID becomes server-only, since the exchange runs on the server.
- **Who writes them:** `scripts/line-mode.mjs` and `strapi/scripts/maison-setup.mjs` write the new names.
- **Existing `.env` files migrate once:** old `NEXT_PUBLIC_*` values copy to the new names, without printing.
- **No old names left:** `grep NEXT_PUBLIC_` finds nothing.

### Layout
```
liff/
  src/
    routes/   __root.tsx, index.tsx, collections.$slug.tsx, products.$slug.tsx,
              concierge.tsx, visits.index.tsx, visits.$reference.tsx, uploads.$.ts
    lib/      *.functions.ts  (signIn, catalog, visits, homePage, chat)
              *.server.ts     (session, maison-mcp, adapters, strapi origin)
              pure modules carried over with their tests (booking, copy, status, open-in-line, …)
    components/  the redesign's components (next/link → Router Link)
    router.tsx
```

### Commands (names unchanged)
- **`npm run dev`:** Vite dev on 127.0.0.1:3003 plus the verify mock, with the LINE-mode guard.
- **`npm run start:line`:** `require-line`, the production build, then the Start server on 127.0.0.1:3003.
- **`npm run tunnel`, `qr`, `mode*`:** as today, reworked for the settings names.

## Acceptance
1. **Unit tests and typechecks:** root `npm test` passes; liff typechecks are clean.
2. **e2e browser specs:** `npm run test:e2e` passes in full in local mode, with selectors unchanged.
   - `api.spec.ts` changes to match the new surface: it tests server functions and their 401s instead of the proxy.
3. **The surface check:** `check-public-surface.mjs` passes against the LINE build, and no secret, Strapi URL or session appears in the client bundle (grep).
4. **The browser:**
   - every screen at 390×844, at 360 px and on the stage at 1280×720, in EN and JA, matches today's screenshots;
   - no horizontal scroll;
   - no dev overlay on stage.
5. **The phone, in LINE, through the tunnel:**
   1. sign-in;
   2. Home with the photos and the Strapi Home text;
   3. the Agent view shows MCP calls;
   4. a booking through the concierge;
   5. staff confirm in the Strapi admin;
   6. the LINE confirmation arrives (Task LN);
   7. My visits shows **Confirmed** without a reload.
6. **No old dependencies:** no `next`, `ai` or `@ai-sdk/*` remains in `liff/package.json`.

## Safety net
1. **The LINE confirmation first.** Task LN goes into today's Next.js app first. The phone flow is verified, then tagged `demo-stable-nextjs`.
2. **A branch.** The migration runs on `feat/tanstack-app`, merged into `feat/maison-demo` only when the acceptance list passes.
3. **Cut-off: Sunday 4 October.** Otherwise the talk runs on the tag.

## Risks
- **Cookies in LINE's in-app browser.** HttpOnly first-party cookies must work in LIFF on iOS and Android. Verify early, on the phone, before building every screen on it.
- **TanStack AI part shapes** differ from the AI SDK's (`tool-call.arguments` is a JSON string). The rendering is mapped and tested for both tool and text parts.
- **The `maison_` prefix** changes the tool names the model sees. The instructions, the tests and the UI's display must all agree.
- **The settings rename:** a single grep shows zero `NEXT_PUBLIC_`, and the one-time migration has tests.
