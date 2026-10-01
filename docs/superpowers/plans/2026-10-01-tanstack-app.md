# The Maison MINI App on TanStack: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move `liff/` from Next.js 16 and the Vercel AI SDK to TanStack Start, Router, Query and TanStack AI, with the browser holding no secrets, every screen's data and the concierge served by server functions, and the outside (screens, paths, look, commands) unchanged.

**Architecture:** Three planes, as in Paul's reference (`/Users/paul/learning/tanstack-ai/docs/ARCHITECTURE.md` §2):
- **The browser** renders routes and calls server functions.
- **The Start server** owns the customer session (an HttpOnly cookie), the MCP client to Strapi, and the `chat()` agent loop.
- **Strapi** owns the tools and their permissions.

The migration lands in stages that each run: first the old data path inside Start (Task 2), then server-side sign-in (Task 3), then server-function data (Task 4), then the concierge (Task 6).

**Tech stack:**
- TanStack Start 1.168.49 and Router 1.170.32 on Vite 8.2.2;
- TanStack Query ^5.104;
- TanStack AI: `@tanstack/ai` 0.52.0, `ai-anthropic` 0.18.3, `ai-ollama` 0.10.3, `ai-mcp` 0.3.8, `ai-react` 0.22.4;
- MCP SDK, zod 4, Tailwind 3 and LIFF 2.31.

**Spec:** `docs/superpowers/specs/2026-10-01-tanstack-app-design.md` (approved by Paul: "ok go").

## Global Constraints
- **Branch and commits:**
  - Branch `feat/tanstack-app`, made by the controller from `feat/maison-demo` after the tag `demo-stable-nextjs`.
  - Commit there, never on `main`, and never push.
  - Each commit message ends with a `Co-Authored-By:` trailer naming your model.
- **Pinned versions (Paul's reference client, known-good):**
  - TanStack Start and Router: `@tanstack/react-start` 1.168.49, `@tanstack/react-router` 1.170.32.
  - TanStack AI: `@tanstack/ai` 0.52.0, `@tanstack/ai-anthropic` 0.18.3, `@tanstack/ai-ollama` 0.10.3, `@tanstack/ai-mcp` 0.3.8, `@tanstack/ai-react` 0.22.4.
  - Build: `vite` 8.2.2, `@vitejs/plugin-react` 6.1.0.
  - Data: `@tanstack/react-query` ^5.104.0.
  - Tailwind stays ^3.4, with `tailwind.config.ts` and the PostCSS config. These stay as they are: `@line/liff`, `@line/liff-mock`, `@modelcontextprotocol/sdk`, `qrcode`, `zod`, `@fontsource/*`.
- **Unchanged outside:**
  - every route path (`/`, `/collections/<slug>`, `/products/<slug>`, `/concierge`, `/visits`, `/visits/<reference>`, `/uploads/...`);
  - every accessible name, `data-testid` and copy string;
  - the redesign's classes;
  - every npm command name.
- **The boundary:**
  - The browser never holds the customer session, a key or the Strapi origin, and never makes an MCP or Strapi call.
  - Secret custody lives in `src/lib/*.server.ts`; server functions live in `src/lib/*.functions.ts`.
- **Server functions use `.validator()`** (the reference's decision 8). If the installed types mark it deprecated, use the non-deprecated validator, and say which in the report.
- **Values go per send, never captured** (decision 10). A value that can change between sends goes in the send's body.
- **Settings:**
  - client-safe (`import.meta.env`): `VITE_LIFF_ID`, `VITE_LIFF_MOCK`, `VITE_DEMO_LINE_USER_ID`, `VITE_DEMO_LOCALE`;
  - server-only (`process.env`, only in `*.server.ts`): `STRAPI_URL`, `MAISON_CLIENT_ID`, `ANTHROPIC_API_KEY`, `OLLAMA_MODEL`, `OLLAMA_BASE_URL`.
  - No `NEXT_PUBLIC_` survives anywhere.
- **Ports:**
  - the app on 127.0.0.1:3003, Strapi on 1338, the verify mock on 4545;
  - 1337, 1340 and 3000 belong to other apps: never touch them.
- **Secrets:** no `.env` inspection, and no LINE values (LIFF ID, channel ID, ngrok domain) in commits.
- **Read the reference before writing:**
  - Each task names the reference files to read end to end, from `/Users/paul/learning/tanstack-ai/tanstack-client/src/` or `docs/ARCHITECTURE.md`.
  - Say in the report what you took from each.
  - Load each task's TanStack Intent guides with `npx @tanstack/intent@latest load <id>`.
  - Read the installed package types before using an API (`node_modules/@tanstack/*/dist/**/*.d.ts`).
  - Docs over examples, when they disagree.

## Review Focus
1. **The session cookie inside LINE's in-app browser.** An HttpOnly, SameSite=Lax first-party cookie set by `signInFn` must come back on every server-function call, in iOS WKWebView and Android alike. Otherwise every screen answers 401 in LINE.
   - **Test:** Task 3's unit tests pin the cookie's attributes.
   - **Controller:** checks on the phone right after Task 3.
2. **Session expiry mid-use.** Sessions last 1 hour. A server function's 401 must make the client sign in again (a fresh LIFF ID token) and retry once, unseen.
   - **Test:** Task 4's test for `callWithSignIn`.
3. **The language switch mid-chat.** A message sent after switching to JA must carry `locale: 'ja'`, because the locale goes per send.
   - **Test:** Task 6's test for `sendBody`.
4. **Strapi unreachable during a concierge turn.** A Maison MCP discovery failure must answer a clear "Maison can't be reached" message without calling the model. Tools must not silently vanish while the model answers from memory.
   - **Test:** Task 6's test for the `onDiscoveryError` path.
5. **Polling while the customer is reading.** A visits refetch must update in place: the "Request sent" note and the list's order don't flicker, and no spinner replaces the list.
   - **Test:** Task 4's test of `visitsQueryOptions` (interval, background off, `placeholderData` keeps the previous data).

---

## Preconditions (controller, before Task 1)
- **P1.** Task LN (LINE confirmation on every confirm path) is copied into the demo, with `LINE_CHANNEL_ACCESS_TOKEN` in `strapi/.env`. The phone flow is verified on the Next.js app (book, confirm on the board, the LINE message arrives), then tagged with `git tag demo-stable-nextjs`.
- **P2.** `git switch -c feat/tanstack-app` from that tag.
- **P3.** The app is in local mode, with `demo-strapi` on 1338. For tasks that need a browser, the controller starts the dev server (`npm run dev --prefix liff`) and says so in the dispatch.

---

### Task 1: Settings renamed for Vite, with a one-time migration of existing `.env` files

**Files:**
- Modify: `scripts/line-mode.mjs` (the keys it writes and checks; a new `migrateEnvKeys`)
- Modify: `scripts/line-mode.test.mjs`
- Modify: `strapi/scripts/maison-setup.mjs` (writes `MAISON_CLIENT_ID` and `STRAPI_URL` to `liff/.env`)
- Modify: `scripts/maison-setup.test.mjs`
- Modify: `liff/.env.example`
- Modify: `README.md` (settings names only)

**Interfaces:**
- Produces: `migrateEnvKeys(file: string): { migrated: string[] }`, exported from `scripts/line-mode.mjs`. It copies each old key's value to its new name when the new name is missing, never prints a value, and keeps the old line (removed in Task 7).
- The key map, exported as `RENAMED_KEYS`:
  ```js
  export const RENAMED_KEYS = {
    NEXT_PUBLIC_LIFF_ID: 'VITE_LIFF_ID',
    NEXT_PUBLIC_LIFF_MOCK: 'VITE_LIFF_MOCK',
    NEXT_PUBLIC_DEMO_LINE_USER_ID: 'VITE_DEMO_LINE_USER_ID',
    NEXT_PUBLIC_DEMO_LOCALE: 'VITE_DEMO_LOCALE',
    NEXT_PUBLIC_MAISON_CLIENT_ID: 'MAISON_CLIENT_ID',
    NEXT_PUBLIC_STRAPI_URL: 'STRAPI_URL',
  };
  ```
  `STRAPI_URL` may already exist in `liff/.env`, since the server reads it today. Then the old value is not copied, and the report says so.

- [ ] **Step 1: Write the failing tests** in `scripts/line-mode.test.mjs`:
```js
test('migrateEnvKeys copies old public keys to their new names, once, without printing values', () => {
  const dir = mkdtempSync(join(tmpdir(), 'maison-env-'));
  const file = join(dir, '.env');
  writeFileSync(file, 'NEXT_PUBLIC_LIFF_ID=liff-123\nNEXT_PUBLIC_LIFF_MOCK=false\nSTRAPI_URL=http://127.0.0.1:1338\nNEXT_PUBLIC_STRAPI_URL=http://localhost:1338\n');
  const logs = [];
  const { migrated } = migrateEnvKeys(file, { log: (line) => logs.push(line) });
  const env = readEnv(file);
  assert.equal(env.VITE_LIFF_ID, 'liff-123');
  assert.equal(env.VITE_LIFF_MOCK, 'false');
  assert.equal(env.STRAPI_URL, 'http://127.0.0.1:1338'); // an existing new key wins
  assert.deepEqual(migrated.sort(), ['VITE_LIFF_ID', 'VITE_LIFF_MOCK']);
  assert.ok(!logs.join('\n').includes('liff-123'));
  assert.deepEqual(migrateEnvKeys(file, { log: () => {} }).migrated, []); // a second run changes nothing
});
test('mode:line and mode:local write the VITE_ names', () => {
  // As the existing modeDifferences tests do, but expecting VITE_LIFF_ID / VITE_LIFF_MOCK.
});
```
  Write the second test in full, from the existing `modeDifferences`/`main` tests in that file, replacing each `NEXT_PUBLIC_*` with its new name.
- [ ] **Step 2: Run them, and see them fail.** `node --test scripts/line-mode.test.mjs`. Expected: FAIL, with `migrateEnvKeys` not exported and the old names still written.
- [ ] **Step 3: Implement.**
  - Add `RENAMED_KEYS` and `migrateEnvKeys`, built on the existing `readEnv`/`writeEnv`.
  - Call `migrateEnvKeys` for `liff/.env` at the start of `main()` in every mode command, logging one line: "Moved N settings to their new names: …", which lists key names only.
  - Change every written and checked key to its new name.
- [ ] **Step 4: Update the setup script.**
  - `strapi/scripts/maison-setup.mjs` writes `{ STRAPI_URL, MAISON_CLIENT_ID: app.clientId }` to `liff/.env` instead of the two `NEXT_PUBLIC_` keys.
  - Update the setup test that pins the written keys.
  - Note: `strapi develop` restarts when this file changes. That is expected in this task.
- [ ] **Step 5: Update the rest.** `liff/.env.example` uses the new names. In the README, the settings table and every mention use the new names.
- [ ] **Step 6: Run** the root `npm test`. Expected: PASS, with the counts in the report.
- [ ] **Step 7: Commit.**
```bash
files=(scripts/line-mode.mjs scripts/line-mode.test.mjs strapi/scripts/maison-setup.mjs scripts/maison-setup.test.mjs liff/.env.example README.md)
git add -- "${files[@]}" && git commit -m "chore: settings for Vite — VITE_* for the browser, server-only MAISON_CLIENT_ID, a one-time .env migration"
```

---

### Task 2: TanStack Start runs the app, on the old data path

**Reference to read first:**
- `tanstack-client/src/router.tsx`, `src/routes/__root.tsx`, `src/routes/index.tsx` and `vite.config.ts`;
- the Intent guides `@tanstack/react-start#lifecycle/migrate-from-nextjs`, `@tanstack/start-client-core#start-core`, `@tanstack/router-core#router-core/navigation` and `@tanstack/start-client-core#start-core/server-routes`.

**Files:**
- Create:
  - `liff/vite.config.ts`
  - `liff/src/router.tsx`
  - `liff/src/routes/__root.tsx`
  - `liff/src/routes/index.tsx`
  - `liff/src/routes/collections.$slug.tsx`
  - `liff/src/routes/products.$slug.tsx`
  - `liff/src/routes/concierge.tsx`
  - `liff/src/routes/visits.index.tsx`
  - `liff/src/routes/visits.$reference.tsx`
  - `liff/src/routes/mcp.ts`
  - `liff/src/routes/api.strapi-oauth-mcp-manager.oauth.token.ts`
  - `liff/src/routes/uploads.$.ts`
  - `liff/src/routes/api.concierge.ts`
- Move (`git mv`): `liff/lib` → `liff/src/lib`, `liff/components` → `liff/src/components`, `liff/app/globals.css` → `liff/src/styles.css`.
- Modify: `liff/package.json`, `liff/tsconfig.json`, `liff/vitest.config.ts`, `liff/tailwind.config.ts` (the content globs).
- Modify: the eleven files that import `next/*`, listed by `grep -rlE "from 'next/" liff/src`.
- Modify: `liff/src/lib/config.ts`, which reads `import.meta.env.VITE_*`.
- Delete: `liff/app/`, `liff/next.config.mjs`, `liff/next-env.d.ts`, `liff/src/lib/next-config.test.ts`.

**Interfaces:**
- Produces: the routes above, with the same components the Next pages rendered, and `getRouter()`.
- Server routes wrap today's framework-agnostic handlers unchanged:
  - `handleConcierge(request, deps)` from `src/lib/concierge.ts`;
  - `proxyToStrapi(request, …)` from `src/lib/strapi-proxy.ts`.
- `config` (in `src/lib/config.ts`) keeps its fields. The client no longer needs `clientId` and `strapiUrl` after Task 3; keep them here only for the old path.

- [ ] **Step 1: Dependencies.**
  - **Remove** `next`, and the scripts' uses of `next` (rewritten in Step 9).
  - **Add,** pinned:
```bash
cd liff && npm install --save-exact @tanstack/react-start@1.168.49 @tanstack/react-router@1.170.32 @tanstack/react-query@5.104.0 && npm install --save-dev --save-exact vite@8.2.2 @vitejs/plugin-react@6.1.0
```
  - **Keep** `ai` and `@ai-sdk/*` for now: Task 6 removes them.
- [ ] **Step 2: `liff/vite.config.ts`:**
```ts
import { defineConfig } from 'vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';

// Tailwind 3 runs through postcss.config.mjs, which Vite picks up. The '@/…' imports resolve through tsconfig paths.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  server: { host: '127.0.0.1', port: 3003, strictPort: true },
  preview: { host: '127.0.0.1', port: 3003, strictPort: true },
  plugins: [tanstackStart(), viteReact()],
});
```
- [ ] **Step 3: `liff/src/router.tsx`,** as in the reference:
```tsx
import { createRouter as createTanStackRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';

export function getRouter() {
  return createTanStackRouter({ routeTree, scrollRestoration: true, defaultPreload: 'intent', defaultPreloadStaleTime: 0 });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
```
- [ ] **Step 4: `liff/src/routes/__root.tsx`.**
  - Bring over everything `app/layout.tsx` did: the fonts' imports, `styles.css?url` in `head.links`, the `<html lang>`, the viewport meta with `viewport-fit=cover` (RD1's review noted it was missing), `MaisonProvider` and `PhoneFrame`.
  - Use the reference's `shellComponent` with `HeadContent` and `Scripts`. Children render through `<Outlet />` inside `PhoneFrame`.
  - Keep every class and wrapper from `app/layout.tsx` exactly.
- [ ] **Step 5: The page routes.** For each Next page, create the route file, then move the page component's body into it unchanged.
  - **The pattern:**
```tsx
import { createFileRoute } from '@tanstack/react-router';
// …the page's existing imports…

export const Route = createFileRoute('/products/$slug')({ component: ProductPage });

function ProductPage() {
  const { slug } = Route.useParams(); // was: useParams() from next/navigation
  // …the page's existing body, unchanged…
}
```
  - **Home** (`/`): render `HomeScreen`. For now, use the built-in `COPY[locale].home` text, since Task 5 adds the loader that reads Strapi.
  - **`visits.index.tsx`:** keep the `useSearchParams` usage as `Route.useSearch()`, with a `validateSearch` that accepts today's query (`?requested=<ref>`, or whatever `app/visits/page.tsx` reads).
- [ ] **Step 6: Replace `next/link` and `next/navigation`** in the eleven files.
  - `import Link from 'next/link'` becomes `import { Link } from '@tanstack/react-router'`.
  - `href="/x"` becomes `to="/x"`; a dynamic `href={`/products/${slug}`}` becomes `to="/products/$slug" params={{ slug }}`.
  - `useRouter().push(x)` becomes `useNavigate()({ to: x })`; `useParams()` becomes `Route.useParams()`, or `useParams({ strict: false })` in a shared component; `usePathname()` becomes `useLocation().pathname`.
- [ ] **Step 7: The server routes.** These wrap today's handlers.
  - The pattern:
```ts
import { createFileRoute } from '@tanstack/react-router';
import { proxyToStrapi } from '@/lib/strapi-proxy';

export const Route = createFileRoute('/mcp')({
  server: { handlers: { POST: ({ request }) => proxyToStrapi(request, '/mcp') } },
});
```
  - **The arguments:** copy each Next route's exact call, from the old `app/**/route.ts` files at `git show HEAD:liff/app/...`.
  - **`/uploads/$`:** GET only, with the splat in `params._splat`.
  - **`/api/concierge`:** POST, calling `handleConcierge(request, deps)` with the same deps the Next route built.
- [ ] **Step 8: Config, tsconfig, vitest and Tailwind.**
  - **`config.ts`:** reads `import.meta.env.VITE_*` (with the same defaults), and its header comment says so.
  - **`tsconfig.json`:** `"paths": { "@/*": ["./src/*"] }`, and add `"types": ["vite/client"]`.
  - **`vitest.config.ts`:** `include: ['src/**/*.test.ts']`, with the `@` alias pointed at `./src`.
  - **`tailwind.config.ts`:** `content: ['./src/**/*.{ts,tsx}']`.
- [ ] **Step 9: Scripts** in `liff/package.json`:
  - `"dev"`: `concurrently … "vite dev" "node --env-file-if-exists=.env scripts/mock-line-verify.mjs"`;
  - `"build"`: `"vite build"`;
  - `"start"` / `"start:line"`: the production server command from the deployment Intent guide (`@tanstack/start-client-core#start-core/deployment`, Node target), on 127.0.0.1:3003. Keep `start:line`'s `require-line` prefix.
  - `"typecheck"`: `"tsc --noEmit"`.
- [ ] **Step 10: Run the tests and typecheck.** `cd liff && npx vitest run && npm run typecheck`. Expected: PASS. All `src/lib` tests carry over, minus the deleted `next-config.test.ts`.
- [ ] **Step 11: The browser check.** The controller has local mode and Strapi running. Run `npm run dev --prefix liff`, then take Playwright screenshots of every screen at 390×844, as in RD2. Then stop your dev server.
  - Expected: every screen looks like `scratchpad/rd2/final/`.
  - The concierge answers through the old AI SDK route.
- [ ] **Step 12: Commit.** Use explicit paths: the moved trees, the new files, and the deleted Next files.
```bash
git commit -m "feat(liff): TanStack Start runs the app — file routes, Router links, Vite; data still on the old path"
```

---

### Task 3: Server-side sign-in: the customer session in an HttpOnly cookie

**Reference to read first:**
- `docs/ARCHITECTURE.md` §4 (trust and secrets);
- `tanstack-client/src/lib/mcp-servers.server.ts`, for `.server.ts` custody;
- the Intent guides `@tanstack/start-client-core#start-core/auth-server-primitives`, `start-core/server-functions`, `start-core/middleware` and `start-core/execution-model`.

**Files:**
- Create:
  - `liff/src/lib/strapi.server.ts`
  - `liff/src/lib/session.server.ts`
  - `liff/src/lib/session.functions.ts`
  - `liff/src/lib/session.server.test.ts`
- Modify:
  - `liff/src/lib/session.ts`, which keeps `createSession`'s exchange logic. It's now called only from the server; the browser use is removed.
  - `liff/src/lib/maison.ts`: the browser no longer exchanges tokens.
  - `liff/src/components/maison-provider.tsx`.

**Interfaces:**
- Produces, in `strapi.server.ts`:
  - `strapiOrigin(): string`, which reads `STRAPI_URL` and has the same fallback as today's `strapiOrigin`;
  - `maisonClientId(): string`, which reads `MAISON_CLIENT_ID` and throws "MAISON_CLIENT_ID is not set. Run `npm run setup`." when it's missing.
- Produces, in `session.server.ts`:
  - `SESSION_COOKIE = 'maison_session'`;
  - `issueSession(idToken: string, deps?: { fetchImpl?: typeof fetch }): Promise<{ token: string; expiresAt: number }>`, which exchanges through `createSession`'s request at `${strapiOrigin()}/api/strapi-oauth-mcp-manager/oauth/token`;
  - `cookieOptions(expiresAt: number, now?: number): { httpOnly: true; secure: boolean; sameSite: 'lax'; path: '/'; maxAge: number }`, where `secure` is true unless the request is to 127.0.0.1 or localhost over http;
  - `readSession(): { token: string } | null`, from the request cookie;
  - `requireCustomer`, a function middleware that adds `context.session` or throws a 401 `Response` with `{ error: { code: 'signed_out' } }`.
- Produces, in `session.functions.ts`: `signInFn`, a POST that takes `{ idToken: string }`, sets the cookie and returns `{ expiresAt: number }`. The token itself never reaches the client.

- [ ] **Step 1: Write the failing tests** in `session.server.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import { cookieOptions, issueSession } from './session.server';

describe('cookieOptions', () => {
  it('is HttpOnly, SameSite=Lax, path /, and lives as long as the session', () => {
    const now = 1_000_000;
    expect(cookieOptions(now + 3_600_000, now)).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/', maxAge: 3600 });
  });
  it('never has a negative max age', () => {
    expect(cookieOptions(0, 10_000).maxAge).toBe(0);
  });
});

describe('issueSession', () => {
  it('exchanges the LINE ID token with the token-exchange grant and the client id, as a flat form', async () => {
    vi.stubEnv('STRAPI_URL', 'http://127.0.0.1:1338');
    vi.stubEnv('MAISON_CLIENT_ID', 'mcp_client_test');
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ access_token: 'mcp_at_x', expires_in: 3600 }), { status: 200 }));
    const session = await issueSession('id.token.here', { fetchImpl });
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://127.0.0.1:1338/api/strapi-oauth-mcp-manager/oauth/token');
    const body = new URLSearchParams(String(init.body));
    expect(body.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:token-exchange');
    expect(body.get('subject_token')).toBe('id.token.here');
    expect(body.get('client_id')).toBe('mcp_client_test');
    expect(session.token).toBe('mcp_at_x');
  });
  it('keeps the OAuth error code (invalid_grant), so the client can ask LINE for a new sign-in', async () => {
    vi.stubEnv('STRAPI_URL', 'http://127.0.0.1:1338');
    vi.stubEnv('MAISON_CLIENT_ID', 'mcp_client_test');
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'expired' }), { status: 400 }));
    await expect(issueSession('stale', { fetchImpl })).rejects.toMatchObject({ code: 'invalid_grant' });
  });
});
```
- [ ] **Step 2: Run them, and see them fail.** `cd liff && npx vitest run src/lib/session.server.test.ts`. Expected: FAIL, because the module doesn't exist.
- [ ] **Step 3: Implement** `strapi.server.ts`, `session.server.ts` and `session.functions.ts`.
  - **The cookie helpers** (`getCookie`, `setCookie`) come from `@tanstack/react-start/server`. Check their names and paths in the installed types.
  - **The middleware** is `createMiddleware({ type: 'function' }).server(async ({ next }) => { … return next({ context: { session } }) })`.
  - **The exchange** reuses `createSession`'s request-building code, called once per sign-in, with no in-memory cache on the server.
- [ ] **Step 4: Run them again.** Expected: PASS.
- [ ] **Step 5: The client.**
  - `maison-provider.tsx` signs in by calling `signInFn({ data: { idToken: liff.getIdToken() } })` after `initLiff()`, and holds only `{ expiresAt }`.
  - `invalid_grant` keeps today's `signInAgain()` behaviour.
  - Remove the browser's `createSession` use from `maison.ts`.
  - **Until Task 4,** the old browser MCP path still needs a token. Add a temporary server function, `sessionTokenFn` (dev-only, local mode), that returns it. Task 4 deletes it.
- [ ] **Step 6: Typecheck, then the browser check.** Run `npm run typecheck`. Then open `npm run dev`:
  - local mode signs in;
  - the response sets `maison_session`, HttpOnly (in Playwright: `context.cookies()`);
  - a reload keeps it.
- [ ] **Step 7: Commit.**
```bash
git commit -m "feat(liff): sign in on the server — the customer session lives in an HttpOnly cookie"
```
- [ ] **Step 8: STOP and report.** Before Task 4, the controller checks cookies inside LINE on Paul's phone (Review Focus 1).

---

### Task 4: Every screen's data from server functions, through TanStack Query

**Reference to read first:**
- `docs/ARCHITECTURE.md` §5, decision 5;
- `tanstack-client/src/lib/mcp-servers.functions.ts`, as an example of server functions;
- the Intent guides `start-core/server-functions` and `router-core/data-loading`.

**Files:**
- Create:
  - `liff/src/lib/maison-mcp.server.ts`
  - `liff/src/lib/catalog.functions.ts`
  - `liff/src/lib/visits.functions.ts`
  - `liff/src/lib/queries.ts`
  - `liff/src/lib/queries.test.ts`
  - `liff/src/lib/maison-mcp.server.test.ts`
- Modify:
  - `liff/src/routes/__root.tsx`, which gets the `QueryClientProvider`;
  - every screen that used `useTool`;
  - `liff/src/components/booking-sheet.tsx`, which books through a mutation;
  - the agent-view feed in `maison-provider.tsx`.
- Delete:
  - `liff/src/lib/use-tool.ts`;
  - the browser MCP client: `liff/src/lib/mcp.ts` and its tests. Its pure helpers (`toolErrorOf`, `ToolCallRecord`) move to `src/lib/tool-call.ts` with their tests.
  - `sessionTokenFn`;
  - the routes `src/routes/mcp.ts` and `src/routes/api.strapi-oauth-mcp-manager.oauth.token.ts`.

**Interfaces:**
- Produces, in `maison-mcp.server.ts`: `callMaisonTool(session: { token: string }, name: string, args: Record<string, unknown>): Promise<{ result: CallToolResult; ms: number }>`.
  - It uses the MCP SDK `Client` with a `StreamableHTTPClientTransport` to `${strapiOrigin()}/mcp`, with `requestInit: { headers: { Authorization: `Bearer ${session.token}` } }`. It connects, calls and closes.
  - A 401 from Strapi throws a `Response` 401 `{ error: { code: 'signed_out' } }`.
- Produces, in `catalog.functions.ts`: `browseCollectionsFn`, `searchProductsFn`, `viewProductFn` and `findBoutiquesFn`.
- Produces, in `visits.functions.ts`: `myAppointmentsFn` and `requestAppointmentFn`.
- Each is a server function with `requireCustomer` and a zod validator mirroring the tool's input. Each returns `ToolResponse<T>`:
  ```ts
  export interface ToolResponse<T> { data: T | null; error: ToolError | null; call: { tool: string; args: Record<string, unknown>; ms: number; ok: boolean } }
  ```
- Produces, in `queries.ts`:
  - `maisonQueryKey(tool, args, locale)`;
  - `useMaisonQuery<T>(screen, tool, fn, args)`, which returns `{ data, error, isPending, refetch }` in the shape screens used from `useTool` (`{ loading, data, error, retry }`), so screen code barely changes;
  - `visitsQueryOptions`;
  - `callWithSignIn(fn, signIn)`, which retries once after a `signed_out` 401.

- [ ] **Step 1: Write the failing tests** in `queries.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import { callWithSignIn, maisonQueryKey, visitsQueryOptions } from './queries';

describe('maisonQueryKey', () => {
  it('keys on tool, args and locale', () => {
    expect(maisonQueryKey('my_appointments', {}, 'ja')).toEqual(['maison', 'my_appointments', {}, 'ja']);
  });
});

describe('visitsQueryOptions', () => {
  it('polls every 10 s, only while visible, on focus, and keeps the previous list while refetching', () => {
    const options = visitsQueryOptions('en');
    expect(options.refetchInterval).toBe(10_000);
    expect(options.refetchIntervalInBackground).toBe(false);
    expect(options.refetchOnWindowFocus).toBe(true);
    expect(typeof options.placeholderData).toBe('function');
  });
});

describe('callWithSignIn', () => {
  it('signs in again and retries once when the session has expired', async () => {
    const signedOut = new Response(JSON.stringify({ error: { code: 'signed_out' } }), { status: 401 });
    const fn = vi.fn().mockRejectedValueOnce(signedOut).mockResolvedValueOnce('ok');
    const signIn = vi.fn(async () => {});
    await expect(callWithSignIn(fn, signIn)).resolves.toBe('ok');
    expect(signIn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledTimes(2);
  });
  it('does not loop: a second 401 is the error', async () => {
    const signedOut = () => new Response(JSON.stringify({ error: { code: 'signed_out' } }), { status: 401 });
    const fn = vi.fn().mockRejectedValue(signedOut());
    await expect(callWithSignIn(fn, async () => {})).rejects.toBeInstanceOf(Response);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
```
  And in `maison-mcp.server.test.ts`:
  - `callMaisonTool` sends the session as `Authorization: Bearer`, using a fake transport injected through a `deps.connect` parameter, as today's `lib/mcp.ts` tests do;
  - it closes the client after the call;
  - it maps a 401 to `signed_out`.
- [ ] **Step 2: Run them, and see them fail.** Expected: FAIL, because the modules don't exist.
- [ ] **Step 3: Implement** `maison-mcp.server.ts`, the two `*.functions.ts` files and `queries.ts`.
  - `visitsQueryOptions(locale)` returns `{ queryKey: maisonQueryKey('my_appointments', {}, locale), refetchInterval: 10_000, refetchIntervalInBackground: false, refetchOnWindowFocus: true, placeholderData: keepPreviousData }`, with `keepPreviousData` from `@tanstack/react-query`.
  - Use it on `/visits` and `/visits/$reference`.
- [ ] **Step 4: Run them again.** Expected: PASS.
- [ ] **Step 5: Switch every screen.**
  - **Screens:** each one moves from `useTool(screen, name, args)` to `useMaisonQuery(screen, name, fn, args)`.
  - **The booking sheet** uses `useMutation({ mutationFn: (args) => callWithSignIn(() => requestAppointmentFn({ data: args }), signIn) })`. On success it invalidates `['maison', 'my_appointments']`. The validations and disabled states stay.
  - **The Agent view** gets one `ToolCallRecord` per first load and per mutation, from `call`. Background refetches add nothing.
- [ ] **Step 6: Delete** the browser MCP client, `use-tool.ts`, `sessionTokenFn` and the two proxy routes. Then run `grep -rn "createMcp\|useTool\|sessionTokenFn" liff/src`. Expected: no output.
- [ ] **Step 7: Run** the root `npm test` and `npm run typecheck`. Then the browser check (local mode, `npm run dev`):
  - every screen loads;
  - the Agent view lists MCP calls;
  - a booking appears on My visits at once;
  - a confirm in the Strapi admin turns the status to Confirmed within 10 s, with no reload.
- [ ] **Step 8: Commit.**
```bash
git commit -m "feat(liff): every screen's data from server functions through TanStack Query; visits poll; no MCP in the browser"
```

---

### Task 5: The Home loader, `/uploads`, the public-surface check, and the production server

**Reference to read first:**
- `tanstack-client/src/routes/oauth.callback.ts`, an example server route;
- the Intent guides `start-core/server-routes`, `start-core/deployment` and `router-core/data-loading`.

**Files:**
- Create:
  - `liff/src/lib/home.functions.ts`
  - `liff/src/lib/uploads.ts`
  - `liff/src/lib/uploads.test.ts`
  - `liff/scripts/check-public-surface.mjs`
- Modify:
  - `liff/src/routes/index.tsx`, which gets a loader;
  - `liff/src/routes/uploads.$.ts`;
  - the image URLs returned by the catalog server functions;
  - `liff/package.json` (`start`, `start:line`);
  - the scripts and README that name `check-strapi-proxy.mjs`.
- Delete: `liff/scripts/check-strapi-proxy.mjs`.

**Interfaces:**
- Produces, in `home.functions.ts`: `homePageFn`, a GET with no session needed, which returns `readHomePage()`.
- `routes/index.tsx` has `loader: () => homePageFn()` and the `HomeScreen` client component. Check the installed docs for the per-request option: a fresh read on every load, never prerendered.
- Produces, in `uploads.ts`:
  - `toAppImageUrl(strapiUrl: string): string`, which rewrites `http(s)://<strapi-origin>/uploads/<path>` to `/uploads/<path>` and leaves anything else alone;
  - `isAllowedUploadPath(path: string): boolean`: no `..` or its encoded form, image extensions only (jpg, jpeg, png, webp, gif, avif, svg).

- [ ] **Step 1: Write the failing tests** in `uploads.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { isAllowedUploadPath, toAppImageUrl } from './uploads';

describe('toAppImageUrl', () => {
  it('rewrites Strapi upload URLs to the app origin', () => {
    expect(toAppImageUrl('http://127.0.0.1:1338/uploads/product_weekender_50_abc.jpg')).toBe('/uploads/product_weekender_50_abc.jpg');
  });
  it('leaves other URLs alone', () => {
    expect(toAppImageUrl('https://cdn.example.com/a.jpg')).toBe('https://cdn.example.com/a.jpg');
  });
});
describe('isAllowedUploadPath', () => {
  it.each(['a.jpg', 'small_a.webp', 'thumb/a.png'])('allows %s', (p) => expect(isAllowedUploadPath(p)).toBe(true));
  it.each(['../admin', '..%2fadmin', 'a.html', 'a.js', ''])('refuses %s', (p) => expect(isAllowedUploadPath(p)).toBe(false));
});
```
  If Strapi Cloud serves media from a CDN origin, the CDN URL stays absolute, and the second case pins that.
- [ ] **Step 2: Run them, and see them fail.** Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **`uploads.ts`,** and the `/uploads/$` route: GET, `isAllowedUploadPath`, then a stream from `${strapiOrigin()}/uploads/<path>`.
  - **Image rewriting:** the catalog functions map every image `url` through `toAppImageUrl`.
  - **The Home loader:** `homePageFn` plus the loader. `HomeScreen` takes `{ en, ja }` as before.
- [ ] **Step 4: Run them again.** Expected: PASS.
- [ ] **Step 5: `check-public-surface.mjs`.** Same harness style as the old check: a stand-in Strapi on a free port, then the production server started with `STRAPI_URL` pointing at it. It asserts:
  1. `/mcp` and `/api/strapi-oauth-mcp-manager/oauth/token` answer 404, and the stand-in sees nothing.
  2. A data server function called without the cookie answers 401. Find the server-function URL form from the installed version; it's printed in the network tab in dev.
  3. `/uploads/a.jpg` streams, while `/uploads/..%2fadmin` and a `POST` to `/uploads/a.jpg` are refused.
  4. GET `/` renders the Home page with the stand-in's Home text, and falls back to the built-in text when the stand-in answers 500.
  5. The built client assets (in the build's client output folder) contain neither `MAISON_CLIENT_ID`'s value, nor `mcp_at_`, nor the stand-in's origin.
- [ ] **Step 6: Wire the scripts.** `start:line` runs `require-line`, then `vite build`, then the deployment guide's Node server command on 127.0.0.1:3003. Also update the README and the tunnel script's references.
- [ ] **Step 7: Commit.**
```bash
git commit -m "feat(liff): Home from a loader, /uploads as a server route, the public-surface check, the production server"
```

---

### Task 6: The concierge on TanStack AI

**Reference to read first, end to end:**
- `tanstack-client/src/lib/chat.functions.ts`, `src/lib/adapters.server.ts`, `src/lib/mcp-servers.server.ts`, `src/routes/index.tsx` and `src/components/MessageList.tsx`;
- `docs/ARCHITECTURE.md` §3;
- in `/Users/paul/learning/tanstack-ai/.reference/tanstack-ai/docs`: `migration/migration-from-vercel-ai.md`, `tools/mcp.md`, `tools/mcp-manual.md`, `tools/server-tools.md` and `chat/connection-adapters.md`.

The docs there are for `@tanstack/ai` 0.49, and we pin 0.52.0. Check every API against the installed types.

**Files:**
- Create:
  - `liff/src/lib/adapters.server.ts`
  - `liff/src/lib/chat.functions.ts`
  - `liff/src/lib/chat-tools.server.ts` (`resolve_date` as a server tool, and the locale wrapping)
  - `liff/src/lib/chat-parts.ts` (the pure mapping from TanStack AI parts to the view model)
  - `liff/src/lib/chat-parts.test.ts`
  - `liff/src/lib/chat-send.ts` (`sendBody`)
  - `liff/src/lib/chat-send.test.ts`
- Modify:
  - `liff/src/lib/concierge.ts`: keep `conciergeInstructions`, the guards, `describeModelError` and the locale logic; drop the AI SDK imports; rename the tools in the instructions to `maison_*`;
  - `liff/src/lib/concierge.test.ts`;
  - `liff/src/lib/model.ts`, which becomes `adapters.server.ts`;
  - `liff/src/routes/concierge.tsx`;
  - `liff/src/components/chat-parts.tsx`.
- Delete:
  - `liff/src/routes/api.concierge.ts`;
  - the AI SDK dependencies: `npm uninstall ai @ai-sdk/anthropic @ai-sdk/mcp @ai-sdk/openai-compatible @ai-sdk/react`.

**Interfaces:**
- Produces, in `adapters.server.ts`: `conciergeAdapter(env = process.env): { adapter; modelId: string; label: string; fix: string }`.
  - With `ANTHROPIC_API_KEY`: `anthropicText('claude-sonnet-5')`.
  - Otherwise: `ollamaText(env.OLLAMA_MODEL || 'qwen3-14b-32k')`, at `OLLAMA_BASE_URL` or the default.
  - Keep `model.ts`'s `fix` strings.
- Produces, in `chat.functions.ts`: `chatFn`, `createServerFn({ method: 'POST' }).middleware([requireCustomer]).validator((data: { messages: UIMessage[]; locale: 'ja' | 'en' }) => data)`. It returns `toServerSentEventsResponse(stream)`.
  - **The guards run first:**
    1. roles are user/assistant only;
    2. parts are well-formed;
    3. the size cap.

    A failure answers 400, with the existing messages.
  - **MCP:** `createMCPClients({ maison: { transport: { type: 'http', url: `${strapiOrigin()}/mcp`, headers: { Authorization: `Bearer ${context.session.token}` } } } })`, with `connection: 'close'`.
  - **Discovery failure** (`onDiscoveryError`): don't skip silently. Answer a one-message stream saying Maison can't be reached, in the conversation's language, and never call the model (Review Focus 4).
- Produces, in `chat-parts.ts`: `toView(part, locale): ViewPart`.
  - A `tool-call` or `tool-result` with `name` `maison_<tool>` becomes `{ kind: 'tool', source: 'MCP', tool: '<tool>', state, products?, booking?, failed }`.
  - A local `resolve_date` becomes `{ kind: 'tool', source: 'Local', tool: 'resolve_date', day }`.
  - `text` becomes `{ kind: 'text' }`.
- Produces, in `chat-send.ts`: `sendBody(locale): { locale }`, used as `sendMessage(text, { body: sendBody(locale) })`. The locale is read at send time.

- [ ] **Step 1: Write the failing tests.** Port the existing `concierge.test.ts` behaviour tests (401 first, the 400 guards, the size caps, the locale fill-in) to `chatFn`'s pieces, then add:
```ts
// chat-parts.test.ts
import { describe, expect, it } from 'vitest';
import { toView } from './chat-parts';

describe('toView', () => {
  it('shows a Maison MCP tool without its pool prefix', () => {
    const view = toView({ type: 'tool-call', name: 'maison_search_products', arguments: '{"query":"wallet"}', state: 'input-complete' }, 'en');
    expect(view).toMatchObject({ kind: 'tool', source: 'MCP', tool: 'search_products' });
  });
  it('reads arguments as a JSON string, as TanStack AI sends them', () => {
    const view = toView({ type: 'tool-call', name: 'maison_view_product', arguments: '{"slug":"carnet-wallet"}', state: 'input-complete' }, 'en');
    expect(view).toMatchObject({ args: { slug: 'carnet-wallet' } });
  });
  it('shows the local date tool with its answer', () => {
    const view = toView({ type: 'tool-result', name: 'resolve_date', toolCallId: '1', content: '{"date":"2026-10-10","weekday":"Saturday"}', state: 'complete' }, 'en');
    expect(view).toMatchObject({ kind: 'tool', source: 'Local', tool: 'resolve_date', day: 'Saturday 10 Oct' });
  });
  it('marks a failed tool result', () => {
    const view = toView({ type: 'tool-result', name: 'maison_request_appointment', toolCallId: '2', content: '{"error":{"code":"in_the_past"}}', state: 'error' }, 'en');
    expect(view).toMatchObject({ failed: true });
  });
});
```
```ts
// chat-send.test.ts
import { expect, it } from 'vitest';
import { sendBody } from './chat-send';

it('carries the locale chosen at send time', () => {
  let locale: 'en' | 'ja' = 'en';
  const body = () => sendBody(locale);
  expect(body()).toEqual({ locale: 'en' });
  locale = 'ja';
  expect(body()).toEqual({ locale: 'ja' });
});
```
  - **Day label:** match `toView`'s `day` to today's `resolvedDay` output format in `components/chat-parts.tsx`; read it first and use the same string.
  - **Discovery failure:** a fake `createMCPClients` that calls `onDiscoveryError`. The response is a short SSE with the unreachable message, and the fake adapter's `chatStream` was never called.
- [ ] **Step 2: Run them, and see them fail.** Expected: FAIL.
- [ ] **Step 3: Implement** the server side:
  - `adapters.server.ts`, `chat-tools.server.ts` and `chat.functions.ts`;
  - `resolve_date` as a TanStack AI server tool (check `toolDefinition(...).server(...)` against the installed types), with today's zod schema and `resolveDate`;
  - the locale filled in on every `maison_*` tool whose input takes one (today's `withConversationLocale`, ported to the pool's tool shape);
  - `agentLoopStrategy: maxIterations(8)`;
  - `systemPrompts`: today's `conciergeInstructions`, with tool names `maison_*`.
- [ ] **Step 4: Implement** the client:
  - `routes/concierge.tsx` uses `useChat({ fetcher: ({ messages, data }, { signal }) => chatFn({ data: { messages, locale: (data?.locale as 'ja' | 'en') ?? locale }, signal }) })`, the reference's shape;
  - every send is `sendMessage(text, { body: sendBody(locale) })`;
  - `components/chat-parts.tsx` renders `toView` results exactly as today: tool lines, the product grid, the booking card, Try again, and the suggestions;
  - the "N MCP tools" panel lists the tools the screen declares.
- [ ] **Step 5: Run them again.** `npx vitest run` and `npm run typecheck`. Expected: PASS. Then run `grep -rn "from 'ai'\|@ai-sdk" liff/src liff/package.json`. Expected: no output.
- [ ] **Step 6: The browser check,** in local mode, with the controller's Ollama or a key:
  1. ask for a gift under ¥100,000;
  2. see `MCP · search_products ✓` and the product cards;
  3. book with "Yes, please";
  4. see the booking card;
  5. switch to JA mid-chat, and check the next reply and tool calls are Japanese.
- [ ] **Step 7: Commit.**
```bash
git commit -m "feat(liff): the concierge on TanStack AI — chatFn with ai-mcp under the customer's session; no AI SDK"
```

---

### Task 7: e2e on the new surface, the leftovers, and the docs

**Reference to read first:** `docs/ARCHITECTURE.md` §7 ("Bugs found"): every row is a check worth repeating here.

**Files:**
- Modify:
  - `liff/playwright.config.ts` (the web-server command);
  - `liff/e2e/api.spec.ts`;
  - `liff/e2e/global-setup.ts`;
  - `liff/live/support.ts`;
  - `liff/live/concierge.live.test.ts`;
  - `README.md`: the stack, the architecture section with the three planes, the commands, settings and security notes, and the public surface;
  - `scripts/line-mode.mjs`, which removes the migrated `NEXT_PUBLIC_*` lines on the next mode switch.
- Delete: any remaining Next-only file (`tsconfig.tsbuildinfo` if tracked, and `postcss` entries Next needed but Vite doesn't).

**Interfaces:**
- Consumes everything above.
- `api.spec.ts` covers:
  - server functions without a cookie answer 401;
  - after `signInFn` with a mock ID token, `myAppointmentsFn` answers;
  - `/mcp` answers 404.
- The live test drives `chatFn` over HTTP with a signed-in cookie.

- [ ] **Step 1: Update the tests.** `playwright.config.ts`'s `webServer.command` becomes `npm run dev`. `api.spec.ts`'s token-exchange and proxy tests become the server-function tests above, keeping each test's intent.
- [ ] **Step 2: Grep checks.** Each must print nothing:
  - `grep -rn "NEXT_PUBLIC_" --include=*.{ts,tsx,mjs,js,json,md} . | grep -v node_modules`;
  - `grep -n '"next"\|"ai"\|@ai-sdk' liff/package.json`.
- [ ] **Step 3: Update the README.**
  - **Architecture:** the three planes, and the session in an HttpOnly cookie.
  - **Commands:** `start:line`'s new server command, and `check-public-surface.mjs` replacing the proxy check.
  - **Settings:** the new names.
  - **Credits:** the reference project (paraphrased).
- [ ] **Step 4: Run** the root `npm test` and both typechecks. Expected: PASS. Don't run e2e or live tests; the controller does.
- [ ] **Step 5: Commit.**
```bash
git commit -m "test(liff): e2e and live tests on the server-function surface; docs: the TanStack architecture"
```

---

## After Task 7 (controller)
1. **Local mode:**
   - `npm run test:e2e`: all pass;
   - `npm run test:live`, with Ollama: pass;
   - screenshots of every screen at 390, 360 and 1280×720, in EN and JA, compared with `scratchpad/rd2/final/`.
2. **LINE mode:**
   - `npm run mode:line`, restart Strapi, then `npm run start:line`;
   - `node liff/scripts/check-public-surface.mjs`: all pass;
   - the tunnel;
   - **Paul's phone run:** sign-in, Home, Agent view, a concierge booking, a confirm in Strapi, the LINE message, and My visits flipping to Confirmed.
3. **The whole-branch review** on the most capable model, then one fix wave, then merge `feat/tanstack-app` into `feat/maison-demo`.
4. **Cut-off Sunday 4 October:** if steps 1–3 aren't green, the talk runs on `demo-stable-nextjs`.
