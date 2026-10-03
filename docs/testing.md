# Testing

Three commands run the demo's tests from the repo root, and Maison's own suites run from the plugin's folder.

| Command | What it runs | Needs |
|---|---|---|
| `npm test` | The app's unit tests, Maison's unit tests, the `@strapi/utils` check, the tests of `npm run setup` and of the Home page's starting text, the tests of option B's mode switch, tunnel guard and `npm run qr`, and those of the LINE stand-in | Nothing running |
| `npm run test:e2e` | Browser tests: booking and **My visits**, Home's headline from Strapi in English and Japanese, the language a booking sends, Osaka's closed day, a boutique without the piece, a day that has become today, the agent view, an unknown product, two customers, LINE's safe area in portrait and landscape, and **Chat with Maison on LINE** (with `NEXT_PUBLIC_LINE_OA_ID` set or empty: see below). API tests: each customer's visits, the Content Manager's list and search keeping customers out, and the REST API (the public catalog, an unknown slug, and booking only with a customer's session). | Strapi, in local mode (Playwright starts the app if it isn't running) |
| `npm run test:live` | The concierge through the app's real route, against the running Strapi, on the local model or, opt-in, on Claude (see [The live test](#the-live-test)) | Strapi, in local mode, and the app's client ID from `npm run setup`. Then Ollama for the local model, or a Claude key for Claude |

## Browser and API tests

- **Once, before the first `npm run test:e2e`:** `(cd liff && npx playwright install chromium)`, about 276 MiB.
- **Chat with Maison on LINE needs two runs,** one per case, because the app is built with the setting: `npm run test:e2e` with `NEXT_PUBLIC_LINE_OA_ID` in `liff/.env`, then `NEXT_PUBLIC_LINE_OA_ID= npm run test:e2e`. Stop any app on :3003 before each, so Playwright starts one with the same setting. Each run tests its case and skips the other.
- **`test:e2e` deletes every appointment and notification** in the demo database, including the ones for the talk demo, before it runs, and leaves a few open requests behind. Its reset also deletes every customer question and inquiry, and the product knowledge that staff answers added. **Reset demo activity** before going on stage.

## The live test

`npm run test:live` sends real messages to the concierge's route, signed in as one fixed test customer with the verify mock's ID tokens, so it needs local mode and refuses to run in LINE mode. It is skipped when the app's client ID is missing, Strapi doesn't answer, or the model isn't there.

**The local model** (the default) always uses Ollama, even when a Claude key is set, so it costs nothing and runs offline. It checks that:
- the demo's gift question is answered from the catalog tools, and names only products they returned
- the demo's first suggestion asks `resolve_date`, then ends in a visit picker for Ginza, the next Saturday in Tokyo and 14:00, for pieces a search in that turn returned. Nothing is booked: the model doesn't call `request_appointment`, and the reply doesn't say a visit is confirmed, doesn't say it is requested before the customer sends it, and names no other day
- "How do I care for the leather?" is answered from Maison's product knowledge
- "Can I pay in bitcoin?" shows the hand-off note, with Strapi's reference only when Strapi recorded the question

**Claude** runs with `LIVE_MODEL=claude npm run test:live`, with the key the app uses from `liff/.env`: `ANTHROPIC_API_KEY`, or `AI_GATEWAY_API_KEY`. It is skipped without one, and only checks that a key is set, never printing it. Each run calls Claude, which costs money. It checks the visit picker's three cases:
- "Can we schedule one?", asked from the Weekender 50's page, shows one picker for that piece, with no boutique, day or time filled in, no call to `resolve_date`, and a reply that says no visit is confirmed or requested
- the demo's first suggestion ends in the same picker as on the local model
- Paul's production conversation of 3 October, then "I would like to book a visit to see cabin case", ends in a picker for the Cabin Case 55, and the reply doesn't say the visit is requested. The "What do you have" reply goes back as the page sends it, with its `search_products` call, so the piece is known from an earlier turn. The picker may come from the model's own call or from the safety net's extra pass, but Claude rarely slips, so this case mostly checks the model's own call. The unit tests check the extra pass

**What it leaves in the demo database:** each turn is logged as an inquiry, and the bitcoin test leaves a question for staff open until you reset or answer it. Strapi allows a customer five questions open or taken: past that, nothing is recorded, and the test still passes, on the plain note. Reset between rehearsals.

## Maison's own suites

These run inside the demo too, from `strapi/src/plugins/maison`:

- **The live labelling test** sends five sample turns to the real model with your key from `strapi/.env`, and checks the labels (about a tenth of a cent). Without AI settings it's skipped.

  ```bash
  node --env-file=../../.env node_modules/vitest/vitest.mjs run --config vitest.live.config.ts
  ```

- **Integration tests** start the demo's Strapi in-process, on their own `strapi/.tmp/maison-test-*.db` files, with a local stand-in for LINE's push API, so they never message anyone. They also leave about 57 MB of images in `strapi/public/uploads/` per run (see [Start over with a clean database](../README.md#start-over-with-a-clean-database)).

  ```bash
  STRAPI_APP_DIR="$(cd ../../.. && pwd)" npm run test:integration
  ```

- **MCP smoke tests** run against the running Strapi, with tokens the plugin's script mints as the demo admin:

  ```bash
  node --env-file=../../../.env --input-type=module -e "process.env.ADMIN_EMAIL = process.env.DEMO_ADMIN_EMAIL; process.env.ADMIN_PASSWORD = process.env.DEMO_ADMIN_PASSWORD; await import('./scripts/mcp-dev-tokens.mjs');"
  npm run test:mcp
  ```

  The script mints three tokens that never expire, one of them a staff token. Delete them afterwards, from the repo root:

  ```bash
  node --env-file=strapi/.env --input-type=module -e "
  const base = 'http://localhost:1338';
  const login = await (await fetch(base + '/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: process.env.DEMO_ADMIN_EMAIL, password: process.env.DEMO_ADMIN_PASSWORD }) })).json();
  const api = (method, path) => fetch(base + path, { method, headers: { Authorization: 'Bearer ' + login.data.token } });
  const smokeTokens = async () => (await (await api('GET', '/admin/admin-tokens')).json()).data.filter((token) => /^maison-(customer|staff|ops)-\d+$/.test(token.name));
  const minted = await smokeTokens();
  for (const token of minted) await api('DELETE', '/admin/admin-tokens/' + token.id);
  console.log('smoke-test tokens deleted:', minted.length, '| left:', (await smokeTokens()).length);
  "
  rm -f strapi/src/plugins/maison/test/mcp/.tokens.json
  ```
