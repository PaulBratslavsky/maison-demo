# Maison: from UX to AX with Strapi MCP

A fictional luxury house whose catalog and appointments are served to people and agents through Strapi's built-in MCP server, with LINE as the customer's identity and messaging channel:
- **UX:** catalog screens in an app built for LINE (a LIFF app)
- **AX for the customer:** a concierge that acts for the signed-in customer, through the same tools
- **The human gate:** staff confirm requests on the Maison board in the Strapi admin
- **The answer on LINE:** whichever way staff confirm a visit, Strapi sends the customer's LINE confirmation itself, through the Messaging API

LINE sign-in is simulated with LINE's official LIFF mock and a local stand-in for LINE's ID token verify endpoint. Everything else is the production path. The same app also runs inside LINE on your own LIFF app, through one tunnel (option B). It follows LINE's MINI App design guidelines, so QBurst can run it as a LINE MINI App. The demo was built for "Building the AI-Powered Connected Experience" (QBurst and LY Corporation, Tokyo, 7 October 2026), where QBurst presents the LINE MINI App side (see "Handoff").

## Quick start

You need Node.js 22.12 or later, and npm. For the concierge, either Ollama with `qwen3-14b-32k`, or an Anthropic API key (see "Models").

```bash
git clone https://github.com/PaulBratslavsky/maison-demo.git
cd maison-demo
npm install   # installs strapi/ and liff/, builds the Maison plugin, creates both .env files with fresh secrets
npm run dev   # Strapi on :1338, the app on :3003 and the LINE verify mock on :4545, all on 127.0.0.1
```

The first start builds Strapi's admin, which takes a minute. Then, in a second terminal:

```bash
npm run setup   # the demo admin, the catalog and its public REST reads, the tokens and the app's OAuth client
```

Stop `npm run dev` (Ctrl-C) and start it again, so the app picks up its OAuth client. Then open:
- **The app:** http://localhost:3003. It signs in a demo customer with the LIFF mock, and starts in English: **EN**/**JA** in the header switches the language. Open it as `localhost`: Strapi's CORS lets the app call it from `http://localhost:3003`, not from `http://127.0.0.1:3003`.
- **The Strapi admin:** http://localhost:1338/admin, then **Maison** for the requests board. Sign in with `DEMO_ADMIN_EMAIL` and `DEMO_ADMIN_PASSWORD`: open `strapi/.env` in your editor to read them. `npm install` generated the password for your copy, and nothing prints it.

The ports are the demo's own, so it runs next to a Strapi on 1337. `npm run dev:strapi` and `npm run dev:app` start the two halves separately. Everything listens on this machine only: to use the app from a phone, see option B.

`npm run setup` is safe to run again. Each run:
- **replaces the "Maison app" OAuth client,** so `liff/.env` gets a new client ID. Restart the app, and reload its page: until then, the concierge answers 502 for a customer session the server has dropped.
- **mints new "Maison customer" and "Maison ops" tokens,** and rewrites `strapi/.tmp/maison-ops-token`. If you connected an agent to the ops tools, give it the new token (see "Ops tools for an agent").
- **first prints the Strapi address it sets up.** Shell variables (`PORT`, `STRAPI_URL`, `DEMO_ADMIN_EMAIL`, `DEMO_ADMIN_PASSWORD`) win over `strapi/.env`, so unset them if that address looks wrong.

## What's in the repo

| Path | What it is |
|---|---|
| `strapi/` | A Strapi 5.55.1 app (TypeScript, SQLite), made with `create-strapi` |
| `strapi/src/plugins/maison/` | The Maison plugin: content types, eleven MCP tools and a prompt, REST routes, the requests board and the homepage widget, and the demo catalog. A local plugin, copied from [strapi-store-demo-mcp](https://github.com/PaulBratslavsky/strapi-store-demo-mcp) |
| `strapi-oauth-mcp-manager` | From npm: OAuth for Strapi's MCP server, with customer sign-in by LINE ID token exchange |
| `strapi/src/extensions/maison/` | Keeps customers' LINE user IDs out of admin API responses and the list search |
| `strapi/src/api/home-page/` | The Home page single type: the words on the app's Home screen, in English and Japanese. Strapi writes the starting text when there's no Home page, and never overwrites an edit |
| `strapi/scripts/maison-setup.mjs` | `npm run setup` |
| `liff/` | The Maison app: Next.js 16, LIFF and the LIFF mock, the MCP SDK, and the concierge on AI SDK 7 |
| `liff/scripts/mock-line-verify.mjs` | The local stand-in for LINE's verify endpoint |
| `scripts/init-env.mjs` | Creates the two `.env` files on `npm install` |
| `scripts/line-mode.mjs`, `scripts/line-tunnel.mjs` | Option B: `npm run mode:line` and `mode:local` switch both `.env` files, and `npm run tunnel` refuses an unsafe tunnel |
| `liff/scripts/line-qr.mjs` | Option B: `npm run qr`, the app's LINE link as a QR code, saved in `liff/line/qr/` (gitignored: it holds your LIFF ID) |
| `liff/lib/strapi-proxy.ts` and its routes (`liff/app/mcp`, `liff/app/uploads`, `liff/app/api/strapi-oauth-mcp-manager`) | Option B: Strapi's `/mcp`, token endpoint and `/uploads` on the app's own origin |
| `liff/line/channel-icon.png` | The channel icon, to LINE's MINI App icon spec |
| `liff/public/line/LINE_spinner_light.svg` | LINE's loading icon: LINE's own file, from its MINI App design guidelines |

Two things are set up on purpose:
- **One Strapi version.** `strapi/package.json` holds eight `@strapi` packages at 5.55.1 with `overrides`. Without them, npm resolves Strapi's own `^5.0.0` peer ranges to a newer release, and a second copy of `@strapi/utils` turns Maison's 400s into 500s. (oauth-mcp-manager 1.1.0 never loads `@strapi/utils`.)
- **Maison shares Strapi's `@strapi/utils`.** Maison is a local plugin with its own dependencies, so its build would load its own copy. `strapi/scripts/share-strapi-utils.mjs` removes that copy after the build, on every `npm install` in `strapi/`, and `npm test` checks it.

## Four doors, one set of services

Maison's services hold the rules: the catalog, opening hours, who may book what, and who sees a customer's LINE user ID. Four doors lead to them:

| Door | For | Where |
|---|---|---|
| MCP | The Maison app, its concierge, and staff agents | `/mcp`, with a customer's session or an admin token |
| REST | Websites | `/api/maison/…` |
| The requests board | Staff | **Maison** in the Strapi admin |
| The homepage widget | Staff | **Maison requests** on the admin's Homepage |

- **The Maison app only uses MCP.** Its **Agent view** shows the tool call behind each screen, and the concierge calls the same tools.
- **The board** shows requests **Waiting for staff** (its default filter), **Confirmed**, or **All requests**, and refreshes every 5 seconds. **Confirm** appears on waiting requests whose visit is still ahead, and its notice says whether the customer's LINE confirmation was sent. **Send again** appears on a confirmed visit still ahead whose LINE column says "not sent". Under **Demo data**: **Load demo catalog**, and **Reset demo appointments**, which asks first.
- **The widget** counts **Waiting for staff**, **Confirmed, upcoming** and **LINE sent** (among the upcoming confirmed visits), lists the five newest requests, and links to the board with **Open the board**. It refreshes every 5 seconds, and shows only to admins whose role can review appointments. A Homepage whose layout was changed before needs **Add Widget** once.

### The REST door

**The catalog** is open to read. `npm run setup` grants the Public role exactly Maison's five catalog actions (`plugin::maison.collections.find`, `products.find`, `products.findOne`, `boutiques.find` and `knowledge.find`) and the Home page's `api::home-page.home-page.find`, and checks the role afterwards. Staff see the grant, and can change it, under **Settings → Users & Permissions plugin → Roles → Public**. A read-only, full-access or custom API token works too.

```bash
STRAPI=http://localhost:1338
curl "$STRAPI/api/maison/collections?locale=en"
curl "$STRAPI/api/maison/products?occasion=travel&maxPriceJpy=400000&inStockAt=ginza&locale=en"
curl "$STRAPI/api/maison/products/weekender-50?locale=en"
curl "$STRAPI/api/maison/boutiques?productSlugs=weekender-50&date=<YYYY-MM-DD>&locale=en"
curl "$STRAPI/api/maison/knowledge?query=How%20do%20I%20care%20for%20the%20leather%3F&locale=en"
```

- **The parameters are the tools' arguments,** with the same checks (`server/src/mcp/schemas.ts` in the plugin). Products take `query`, `collection`, `category`, `occasion`, `minPriceJpy`, `maxPriceJpy`, `personalizable`, `inStockAt` and `limit`. Product knowledge takes `query`, `productSlugs` and `locale`. A list repeats its parameter: `productSlugs=weekender-50&productSlugs=passport-cover`.
- **`locale`** is `ja` (the default) or `en`. Product knowledge is in English only, so the knowledge route answers Japanese, which has no entries, unless you send `locale=en`.
- **An unknown product** answers 404 with the tool's hint: "Call search_products to find valid product slugs."
- **Catalog calls send no `Authorization`.** Strapi reads any Bearer token on these routes as a users-permissions JWT or an API token, so a customer session there gets 401.

**The customer's routes** take the session the MCP tools take: the `access_token` from the token endpoint (see "Handoff"). You can get a session yourself with `curl`: the verify mock accepts `valid.` and a LINE user ID (`U` and 32 lowercase hex digits) as an ID token. That works in local mode only, because in LINE mode LINE checks the ID token. The client ID is the value of `NEXT_PUBLIC_MAISON_CLIENT_ID`, which `npm run setup` writes to `liff/.env`.

```bash
STRAPI=http://localhost:1338
# Local mode only: a session for a mock customer. The body is a form, as the app sends it (liff/lib/session.ts).
curl -s "$STRAPI/api/strapi-oauth-mcp-manager/oauth/token" \
  -d grant_type=urn:ietf:params:oauth:grant-type:token-exchange \
  -d 'client_id=<client id from liff/.env>' \
  -d subject_token=valid.U0123456789abcdef0123456789abcdef \
  -d subject_token_type=urn:ietf:params:oauth:token-type:id_token
SESSION='<the access_token it answered>'

curl -X POST "$STRAPI/api/maison/appointments" \
  -H "Authorization: Bearer $SESSION" -H 'Content-Type: application/json' \
  -d '{"boutique":"ginza","productSlugs":["weekender-50"],"requestedFor":"<YYYY-MM-DD>T14:00:00+09:00","note":"A gift","locale":"en"}'
curl -H "Authorization: Bearer $SESSION" "$STRAPI/api/maison/my-appointments?locale=en"
```

- **A booking** answers 201 with `{ "appointment": … }`, and the board shows it created via `web`. Pick a day ahead, at an hour the boutique is open: a visit less than 30 minutes away answers 422 `in_the_past`, and a closed hour 409 `boutique_closed`.
- **Errors** are `{ "error": { "code", "message", "hint" } }`, in the tool's own words. Every 401 carries `WWW-Authenticate: Bearer`. A fault on the server answers 503.
- **The session check** is `/mcp`'s own (oauth-mcp-manager's `resolveAccessToken`), and the customer is then resolved as the tools resolve it. Two checks that `/mcp` adds aren't repeated: core's expiry check on the session's admin token (`checkExpiry`), and the tool's own permission. The first gap lasts at most a session's life, `endUserAccessTokenTtl`, an hour by default. The planned follow-up is for oauth-mcp-manager to refuse expired admin tokens.

The whole contract is in the plugin's README (`strapi/src/plugins/maison/README.md`, "The REST routes").

## Models

The concierge uses a local model unless it has a key. Keys go in `liff/.env`; restart the app after changing it.

| Key in `liff/.env` | Model |
|---|---|
| none (the default) | `qwen3-14b-32k` on Ollama at `http://localhost:11434/v1` (`OLLAMA_MODEL`, `OLLAMA_BASE_URL`) |
| `ANTHROPIC_API_KEY` | Claude Sonnet 5 |
| `AI_GATEWAY_API_KEY` | Claude Sonnet 5, through Vercel AI Gateway |

- **The local model** is Qwen3 14B with a 32k context: `ollama pull qwen3:14b`, then `ollama create qwen3-14b-32k -f Modelfile` with a `Modelfile` of `FROM qwen3:14b` and `PARAMETER num_ctx 32768`. Any Ollama model that calls tools works through `OLLAMA_MODEL`.
- **Qwen3 is slower:** about 20–60 seconds a turn, where Claude takes seconds.
- **Dates are a tool.** When a customer names a day ("Saturday", "tomorrow"), the concierge asks `resolve_date`, a local tool on Tokyo's calendar, and its tool line reads `Local · resolve_date`. The model never works out a date itself: on the local model, "Saturday" came out as Friday until the date became a tool.
- **Product questions go to product knowledge.** For care, sizing, delivery, repairs, warranty, gift wrapping and the like, the concierge calls `search_knowledge` and answers only from the entries it returns. When none answers, it calls `hand_off_to_staff`, a local tool like `resolve_date`. Its line reads `Local · hand_off_to_staff ✓`, with "Our team answers questions like this in Maison's LINE chat." and **Chat with Maison on LINE** under it. The note also shows under a `search_knowledge` line that found nothing, even if the model skips the call. Nothing reaches staff from the app yet: the customer asks in the chat.
- **An empty turn.** Now and then, the local model ends a turn with tool calls and no words. The concierge then shows "No reply came back." and **Try again**, which asks again. A turn that booked a visit never offers it, so nothing is booked twice, and neither does a turn that shows the hand-off note: the note is the answer.
- **When the model can't be reached,** the concierge says which one, and how to fix it.
- **Strapi runs no model.** The concierge's is the demo's only model.

## Running the talk demo

### One-time setup

1. **The quick start** above: `npm install`, `npm run dev`, `npm run setup`, and restart.
2. **The concierge's model:** `ANTHROPIC_API_KEY` in `liff/.env` for Claude, then restart the app. Without it, start Ollama.
3. **The LINE confirmation on your phone:** option A (below). Without it, the board shows each confirmed visit as "not sent".

### Ops tools for an agent

Strapi sends the LINE confirmations itself, so the demo needs no agent for them. Maison also keeps two ops tools, for an agent that retries the confirmations that weren't sent:
- **`pending_confirmations`** lists each upcoming confirmed visit with its customer's LINE user ID and its ready-made message.
- **`record_confirmation`** records a delivery.
- **The prompt `send_pending_confirmations`,** titled "Send pending appointment confirmations", walks an agent through both, with LINE Bot MCP.

`npm run setup` mints their token, "Maison ops". It holds one permission, "MCP: send appointment confirmations", so nothing there confirms, publishes or edits content.

To try them as a developer in Claude Desktop on macOS, quit Claude Desktop first (⌘Q): it rewrites its config file while it runs. Then, from the repo root, add the `maison-ops` server to `~/Library/Application Support/Claude/claude_desktop_config.json`, and open Claude Desktop again. This command adds the server without printing the token, and keeps the rest of the file:

```bash
node -e '
const fs = require("fs"), os = require("os"), path = require("path");
const file = path.join(os.homedir(), "Library/Application Support/Claude/claude_desktop_config.json");
const config = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
const token = fs.readFileSync("strapi/.tmp/maison-ops-token", "utf8").trim();
const bin = path.dirname(process.execPath); // the folder of this node, and of its npx
config.mcpServers = { ...config.mcpServers, "maison-ops": { command: path.join(bin, "npx"), args: ["-y", "mcp-remote", "http://localhost:1338/mcp", "--header", "Authorization:${MAISON_OPS_AUTH}"], env: { PATH: `${bin}:/usr/bin:/bin`, MAISON_OPS_AUTH: `Bearer ${token}` } } };
fs.writeFileSync(file, JSON.stringify(config, null, 2) + "\n");
console.log("Added maison-ops to", file);
'
```

- Start Strapi before you open Claude Desktop. `mcp-remote` connects to Strapi when Claude Desktop starts it, and exits for good if Strapi doesn't answer; if that happens, quit and reopen Claude Desktop.
- Run it again, with Claude Desktop quit, after each `npm run setup`, which mints a new ops token.
- **`npx` by its absolute path.** Claude Desktop doesn't start servers with your shell's `PATH`, so when Node comes from nvm or another version manager, a bare `npx` isn't found. The command writes the path of the `npx` beside the `node` that runs it (the one `which npx` prints in that terminal), and a `PATH` in `env` that starts with its folder, because `npx` runs on `node` from the `PATH`. Run it again after you change Node versions.
- **What the connector offers:** the two ops tools and the prompt. Strapi's own `log` tool also appears while Strapi runs in development.

### Start over with a clean database

1. Stop Strapi. Delete the database and the uploaded images together, keeping `.gitkeep`:

   ```bash
   rm -f strapi/.tmp/data.db
   find strapi/public/uploads -type f ! -name .gitkeep -delete
   ```

   The catalog's images live in `strapi/public/uploads/`, and Maison's integration tests leave about 57 MB there per run. Delete uploads only together with the database: never by hand while the demo's data is loaded.
2. Start Strapi, run `npm run setup`, and restart the app and reload its page.

### Before going on stage

- [ ] The day before: start over with a clean database (above). Then no test customer, smoke-test token or rehearsal visit is left. After it, don't run `npm run test:e2e`, `test:live` or Maison's smoke tests: they leave visits or tokens behind.
- [ ] On the board, **Load demo catalog** once after updating: a catalog loaded before gets Maison's 16 product knowledge entries, in English.
- [ ] `npm run mode` says local. After option B, stop ngrok first (Ctrl-C in its terminal), then run `npm run mode:local` and restart Strapi and the app.
- [ ] Put the laptop on a phone hotspot. Only the concierge's model (with a key) and the LINE confirmation need the internet.
- [ ] `npm run dev`. `http://localhost:1338/_health` answers 204.
- [ ] In the Strapi admin: **Maison** → **Reset demo appointments** (it asks first). Set the board's filter to **All requests**.
- [ ] Open `http://localhost:3003`, or reload it after the reset. Sign-in is automatic, and the collections appear. Set the language to **EN**: each browser remembers the last choice.
- [ ] Warm up: walk the whole run once, so every screen is compiled before the audience sees it: home, a collection, a product, the booking sheet (close it without sending), **My visits**, and the concierge. Ask the concierge one question: on the local model, the first answer also loads the model.
- [ ] With option A: your phone at hand, with LINE's notifications on. The confirmation arrives there.
- [ ] Windows: the app (phone frame) beside the Strapi admin on the Maison board.
- [ ] Turn Do Not Disturb on, on the laptop (with option A, not on the phone).

### The 3-minute run

| Time | Beat | Do |
|---|---|---|
| 0:00–0:30 | UX | The app opens signed in with LINE. Browse Voyage, then the Weekender 50. Flip **Agent view**: every screen is an MCP tool call, the same tools an agent uses. |
| 0:30–1:10 | AX for the customer | **Ask the concierge**, and tap the first suggestion. A line above the answer names each tool call, and cards show the pieces it found. The `Local · resolve_date` line shows the Saturday it worked out. |
| 1:10–1:30 | Booking | Tap **Yes, please.** The request is sent and awaits the boutique. |
| 1:30–1:50 | The request arrives | On the board, the request appears, created via `concierge`, with the customer masked. |
| 1:50–2:20 | Staff confirm | Press **Confirm**. The row turns confirmed, and the notice says the customer's LINE confirmation was sent. |
| 2:20–2:45 | The answer on LINE | The phone buzzes (option A): Strapi sent the confirmation the moment staff confirmed, with no agent in between. Show the message, in the language the customer booked in, and the board's LINE column: LINE sent. |
| 2:45–3:00 | Handoff | The integration slide. "Everything is ready for a LINE MINI App: sign-in, tools, and the message." QBurst takes over. |

**Optional, 20 seconds, after the booking:** ask "How do I care for the leather?". A line above the answer reads `MCP · search_knowledge ✓ …`, and the answer comes from Maison's own product knowledge in Strapi. Ask "Can I pay in bitcoin?" instead: the search finds nothing, and the hand-off note and **Chat with Maison on LINE** appear under its line, even if the model doesn't call `hand_off_to_staff`.

**In Japanese (JA),** the same run uses the same tools, with Japanese labels: the second suggestion is はい、お願いします。, and the product page's button is 来店を予約.

**Fallbacks:**
- **The concierge stalls, or the network drops:** use **Book a visit** on the product page. It calls the same `request_appointment` tool.
- **The concierge's turn ends with no words** (the local model, now and then): tap **Try again** under it, with a line ready while it answers again.
- **The app says the limit of visit requests is reached:** the demo customer has 3 requests waiting. Confirm one on the board, or reset demo appointments.
- **The concierge shows an error:** on stage, a small technical line under the customer's message names the cause and the fix. After `npm run setup` or a clean start, reload the app's page: a session the server has dropped answers 502 until then.
- **The LINE message doesn't arrive:** show the confirmed row on the board, and the message on the slide. If the row says "not sent", **Send again** retries it.
- **Any beat stalls for more than 10 seconds:** switch to the backup video.

### Rehearse

Follow "Before going on stage" and "The 3-minute run" three times in local mode, with **Reset demo appointments** between runs. Then once more on the local model, and once in Japanese. Product knowledge is in English only, so in a Japanese chat the search finds nothing, and the concierge hands the question to the LINE chat. Before the talk, do at least one run on Claude, with your key.

Expected:
- **Each beat works,** and the whole run fits in 3 minutes. On the local model, only the waits are longer.
- **The concierge never says a visit is confirmed.** It says the visit is requested, and that the boutique will confirm it on LINE.
- **Book a visit works with the network off.** Strapi, the app, the mock and the local model all run on the laptop. Only the LINE confirmation fails: its row says "not sent", and **Send again** sends it once the network is back.

Check these once, in the admin:
- **The board.** A request made in the app appears within 5 seconds. **All requests** keeps confirmed rows. **Confirm** appears only on waiting requests whose visit is still ahead. With option A, the LINE column says LINE sent once the confirmation has gone out.
- **The reset.** **Reset demo appointments** asks first, and **Cancel** changes nothing.
- **The customer stays hidden.** In the Content Manager, Maison's appointment list and edit view have no customer column or field, and searching the list for part of the demo customer's ID (`4af49806`) finds nothing. Saving and publishing there still work.

### Record the backup video

**When:**
- after the final rehearsal passes
- on the final build and a freshly seeded database (see "Start over with a clean database")
- with the model you'll use on stage: Claude with a key, if you have one by then. Otherwise the local model, which is slower, so trim the waits in editing.

**Setup:**
- macOS screen recording (⌘⇧5, or QuickTime), at 1920×1080
- the app in its phone frame (a browser window at least 500 px wide shows it) beside the Strapi admin, on the Maison board with the filter on "All requests"
- Do Not Disturb on, and a clean browser profile with no bookmarks bar or extensions
- the cursor visible, and the system text size large enough for a projector

**Beats to capture,** in the same order as the live run:
1. LINE sign-in
2. The concierge's gift answer
3. Booking
4. The request appearing on the board
5. Staff confirming it on the board
6. The LINE confirmation arriving on the phone (option A), beside the board's LINE column

**Recording tips:**
- Record each beat as its own clip, so a bad take can be redone.
- Keep the final cut at or under 3:00, with no voiceover: you narrate live.

**On stage:**
- **Where it lives:** on the laptop, and embedded or linked in the slide right after "Meet Maison".
- **When to switch:** if any beat stalls for more than 10 seconds.
- **Either way,** the talk continues from S7.

## Option A: a real LINE message on your phone

1. In LINE Developers, create a provider and an Official Account with the Messaging API. Check first that your account can create one from your region. With option B, use your LINE Login channel's provider: LINE gives each user a different ID in each provider.
2. Add the Official Account as a friend on your phone.
3. Copy **Your user ID** from the Messaging API channel's Basic settings into `liff/.env` as `NEXT_PUBLIC_DEMO_LINE_USER_ID`. The mock sign-in then acts as you, as that provider sees you. Restart the app. With option B, skip this step: you sign in as yourself.
4. Issue a channel access token, on the Messaging API channel's **Messaging API** tab. Put it in `strapi/.env` as `LINE_CHANNEL_ACCESS_TOKEN`, and restart Strapi. Keep it out of commits and chats: it sends messages as your Official Account.
5. Book a visit and confirm it on the board. Strapi pushes the confirmation to you at once, with LINE's push API, and records it:
   - the notice says the customer's LINE confirmation was sent
   - the board shows LINE sent
   - **My visits** shows "Confirmed · LINE sent" (確定 · LINEで送信済み in Japanese)
6. Let customers add Maison themselves, since a confirmation only reaches a customer who has added the Official Account as a friend:
   - **In the app:** put the Official Account's basic ID, with its `@`, in `liff/.env` as `NEXT_PUBLIC_LINE_OA_ID`, and rebuild the app. **Chat with Maison on LINE** then appears on **My visits**, on a visit's page, after a booking and under a hand-off in the concierge. It opens `https://line.me/R/ti/p/%40…`: a friend lands in the chat with Maison, anyone else on its add-friend screen. Without the setting there's no button. LINE's links work in LINE on phones, not in LINE for PC.
   - **At sign-in (option B):** in LINE Developers, open the LINE Login channel's **Basic settings**, set **Linked LINE Official Account** to yours, and turn the LIFF app's **Add friend option** on. LINE then offers to add Maison when a customer first allows the app. With the account linked, the app also asks LINE whether the customer has added Maison, and if not, the button reads **Add Maison on LINE**.

The message's button opens the visit in the app, at `MAISON_LIFF_URL` followed by `/visits/<reference>`. In local mode `MAISON_LIFF_URL` is `http://localhost:3003`, which your phone can't open. With option B it's your LIFF URL, which opens the app inside LINE.

- **Without option A, leave `LINE_CHANNEL_ACCESS_TOKEN` empty in local mode.** The mock's customer is then a made-up user ID, and nobody would receive what Strapi pushes to it.
- **"LINE sent" means LINE took the message.** LINE's push API answers 200 even when it can't deliver, for example to a customer who has blocked the Official Account, so the board shows LINE sent then too.
- **When LINE refuses it,** or can't be reached, the row stays "not sent", and Strapi's log says why. Fix the cause, then press **Send again**.

## Option B: the real app inside LINE

The stage runs on the LIFF mock. Option B runs the same app inside LINE on your phone, signed in by LINE: your own LINE Login channel and LIFF app, on one public https origin from ngrok. Option B was run on a phone, inside LINE, on 1 October 2026: LINE sign-in, the catalog, a booking through the concierge, and staff confirmation on the board. The mock stays the default, and the stage's fallback.

How it fits together:
- **One origin.** ngrok forwards your domain to the app on :3003, a production build. The app passes three of Strapi's paths on to it: `/mcp`, the token endpoint (`/api/strapi-oauth-mcp-manager/oauth/token`) and `/uploads`. Strapi, with its admin, stays on your laptop. `MAISON_APP_ORIGIN` isn't needed, because the browser never calls Strapi on another origin.
- **The proxy passes on only what those calls need:** the headers they use, and request bodies up to 1 MB. A longer body gets 413 before any of it reaches Strapi. Answers stream through as Strapi writes them, and any other Strapi path, such as `/admin`, answers 404 from the app.
- **And only what the phone sends:** on `/mcp`, a customer session or no `Authorization` at all (anything else gets 401), and at the token endpoint, the token exchange (anything else gets 400).
- **Only LINE mode's build serves those paths.** A build for the LIFF mock, and `npm run dev`, answer 404 on them, so a tunnel left open after `npm run mode:local` reaches no Strapi that trusts the verify mock.
- **LINE verifies the ID tokens.** Strapi checks each one with LINE, for your channel, not with the local mock.
- **Your values stay in `liff/.env`:** `LINE_MODE_LIFF_ID`, `LINE_MODE_CHANNEL_ID` and `LINE_MODE_DOMAIN`. The scripts never print them. Keep them out of commits.

### Once: your LINE Login channel and LIFF app

1. Link your LINE Developers account (Business ID) to your LINE account. Only a linked account can sign in to a channel in Developing.
2. In the [LINE Developers Console](https://developers.line.biz/console/), create a provider and a LINE Login channel, with app type Web app. Name it Maison, for example: a channel's name can't contain "LINE". Leave it in **Developing**, so only its admins and testers can sign in.
3. **Basic settings → Channel icon:** upload `liff/line/channel-icon.png`.
4. **LIFF → Add:**
   - Size: Full
   - Endpoint URL: `https://<your ngrok domain>/`
   - Scopes: `openid` and `profile`
   - Add friend option: On (Normal), once the Official Account is linked (option A, step 6)
5. Get a free [ngrok](https://ngrok.com/download) account, install the agent, and add your authtoken (`ngrok config add-authtoken`). Your dev domain (`<name>.ngrok-free.dev`) is on ngrok's dashboard.
6. Add three lines to `liff/.env`:

   ```
   LINE_MODE_LIFF_ID=<your LIFF ID, from the LIFF tab>
   LINE_MODE_CHANNEL_ID=<your channel ID, digits only, from Basic settings>
   LINE_MODE_DOMAIN=<your ngrok domain, without https://>
   ```

### Each time

Stop `npm run dev` first. Then run these in order, the long-running ones each in its own terminal:

```bash
npm run mode:line     # rewrites strapi/.env and liff/.env for LINE mode, and prints no value
npm run dev:strapi    # Strapi reads the LINE channel when it starts
npm run setup         # checks Strapi's channel, and points the app at your domain
npm run start:line    # builds the app for LINE and serves it on :3003, without the verify mock
npm run tunnel        # checks it's safe, then runs ngrok on your domain
npm run qr            # prints the app's LINE link, with a QR code to scan in LINE
```

`npm run setup` also mints a new ops token: see "Ops tools for an agent", if you connected one.

**Open the app inside LINE.** Run `npm run qr`, then scan the code with LINE's QR reader: the QR icon next to the search bar on LINE's Home tab. The iPhone Camera app may hand the link to Safari instead. The code opens `https://liff.line.me/<your LIFF ID>`, and `npm run qr -- /visits` opens a given screen. It also saves the code in `liff/line/qr/`, as a PNG and an SVG.
- **If LINE opens links in Safari or Chrome:** in LINE, go to Settings → LINE Labs and turn off "Open links in your default browser". Outside LINE the app never signs in: it shows an "Open in LINE" page, with the QR code and, on a phone, a button.
- **The first time,** ngrok's free plan may show its warning page: tap **Visit Site**. ngrok remembers it for 7 days. If the app then shows an error, close it and open it again.
- **LINE asks you to allow the app,** with your channel's icon and name.
- **The app's language** follows the LINE app's language, until you switch it with **EN**/**JA**.
- **The Strapi admin** stays at http://localhost:1338/admin on the laptop. Strapi prints your public URL as its own, but the admin isn't served there.

Who can sign in:
- **While your LINE Login channel is in Developing,** only its Admins and Testers can (LINE Developers Console → your channel → **Roles**).
- **Publishing the channel opens it to anyone with LINE.** Every visit then reaches your laptop through the tunnel, the concierge answers on your model or API key, and each visitor becomes a customer in the demo database:
  - **Each sign-in** stores a session in oauth-mcp-manager: the visitor's full LINE user ID (`line:U…`), a hash of the session token (not the token), the app's client ID, and when the session expires (an hour on) and was last used. Its hourly cleanup deletes expired sessions.
  - **Each visit request** stores a Maison appointment: the same full LINE user ID, the boutique, the products, the date and time, the visitor's note if they wrote one, a reference, and where it was made (`createdVia`: `app`, `concierge` or `web`). It stays until you reset the demo appointments. Each LINE confirmation Strapi sends, or an agent records, adds a log row: the reference, sent or failed, the time and a note, with no LINE user ID. Reset deletes those too.
  - **No other personal data:** no name, picture or email, and not the ID token. Strapi checks the ID token with LINE and keeps only the user ID. Staff see it masked (`line:U4af…88`), and the admin API never returns it. Strapi reads the full ID to send the LINE confirmation, and `pending_confirmations` returns it to the ops token (see "Ops tools for an agent").
- **The QR image** holds your LIFF ID and stays out of git: `liff/line/qr/` is in `.gitignore`.

`npm run tunnel` refuses unless all of these hold:
- strapi/.env has no `LINE_VERIFY_URL`, and both `.env` files are in LINE mode
- nothing answers on the verify mock's port, 127.0.0.1:4545. `npm run dev` starts the mock, which is why LINE mode uses `npm run start:line`.
- the app on :3003 is the LINE build that `npm run start:line` serves: its `X-Maison-Liff` header says `line`. A build for the LIFF mock says `mock`, and a dev server in LINE mode says `line-dev`.
- the running Strapi, reached through the app, refuses a forged ID token with `invalid_grant`, because LINE checks it. The tunnel also stays shut when Strapi can't be reached, or can't check the token.

It refuses because, with the local verify mock behind a tunnel, anyone could sign in as any customer.

`npm run tunnel -- --dry-run` runs the checks alone. ngrok runs with `--inspect=false`, so its local inspector keeps no copy of customers' tokens. In ngrok's dashboard, leave Traffic Inspector's full capture off.

### Back to the stage setup

Stop ngrok first (Ctrl-C in its terminal). Then stop the app and Strapi (Ctrl-C in each terminal), and:

```bash
npm run mode:local
npm run dev          # Strapi, the app and the verify mock, as on stage
```

`npm run mode` says which mode you're in. `npm run dev` and `npm run dev:app` refuse to start while the app is in LINE mode. The tests (`npm run test:e2e`, `npm run test:live`) need local mode, and refuse to run in LINE mode.

## Handoff: the integration slide, and what's ready for QBurst

**Slide: plugging in a LINE MINI App**
1. The MINI App calls `liff.getIDToken()`.
2. oauth-mcp-manager exchanges it for a short-lived session, after LINE verifies it (RFC 8693).
3. The MINI App, and any agent working for that customer, calls the Maison tools on Strapi `/mcp`.
4. Staff confirm in Strapi, on the Maison board or through a staff agent. Strapi sends the customer's LINE confirmation at once, through the Messaging API. A verified MINI App could send it as a service message instead.

**What's ready:**

- **This repo.** Clone it and run it (see "Quick start"). Option B runs it inside LINE, and "Run it as a LINE MINI App" below runs it on your MINI App channel.
- **Token endpoint:** `POST {STRAPI}/api/strapi-oauth-mcp-manager/oauth/token`, as a form:

  | Parameter | Value |
  |---|---|
  | `grant_type` | `urn:ietf:params:oauth:grant-type:token-exchange` |
  | `client_id` | the LINE client's ID |
  | `subject_token` | the LINE ID token |
  | `subject_token_type` | `urn:ietf:params:oauth:token-type:id_token` |

  - It returns `access_token`, a Bearer token, and `expires_in` (an hour by default), with no refresh token: exchange a new ID token when the session ends.
  - `invalid_grant` (400): LINE rejected the ID token, so sign the customer in again.
  - `temporarily_unavailable` (503): try again after `Retry-After` seconds.
  - One LINE client can be active per Strapi.
- **MCP:** `POST {STRAPI}/mcp` with `Authorization: Bearer <access_token>`.
  - Customer tools: `browse_collections`, `search_products`, `view_product`, `find_boutiques`, `search_knowledge`, `request_appointment`, `my_appointments`
  - Staff tools, for staff agents: `appointment_requests` and `confirm_appointment`
  - Errors come back as `isError` results whose text is `{ "error": { "code", "message", "hint" } }`. Arguments the SDK rejects, such as a date that isn't on the calendar, come back as plain text that starts `Input validation error:`.
- **REST, for websites:** the catalog at `/api/maison/…` with no credentials, and the customer's own bookings with the same session (see "The REST door").
- **Confirmation:** when a visit is confirmed, whichever way, Strapi pushes the customer a flex message in the language they booked in, English or Japanese, with the Messaging API channel's token (`LINE_CHANNEL_ACCESS_TOKEN`, see option A), and records it. `pending_confirmations` returns the same message for each upcoming confirmed visit, for an agent that retries.
- **Channels:** the MINI App channel and the Messaging API channel must be in one provider.

### Run it as a LINE MINI App

A LINE MINI App is a LIFF app on a LINE MINI App channel, so this app runs as one with its LIFF ID and channel ID changed. Who can create a MINI App channel depends on LINE's MINI App Policy and your region, for example: an unverified MINI App can be created by an organization with a Japanese corporate number or a Taiwan or Thailand tax ID, an individual business owner in Japan, or an individual in Japan, Taiwan or Thailand. The presenter's LINE account couldn't create one, so the demo runs on a LINE Login channel (option B), and that path was run on a phone inside LINE on 1 October 2026.

In your provider, create both channels in the same provider. Otherwise user IDs won't match, and confirmations can't be delivered.
1. **A LINE MINI App channel,** with your region (Japan, Taiwan or Thailand, per the policy):
   - **Channel icon:** `liff/line/channel-icon.png`, drawn to LINE's icon spec: 130×130 px, with a logo between 54 and 76 px. `liff/scripts/render-channel-icon.mjs` redraws it.
   - **Channel name:** Maison, with no "LINE" in it, and a Japanese name under Localization.
   - **A description,** in English and Japanese, and your **privacy policy URL**.
   - **Web app settings:** endpoint URL `https://<your host>/`, scopes `openid` and `profile`. A MINI App's size is always Full.
2. **A Messaging API channel** (an Official Account), whose channel access token Strapi sends the confirmations with (option A). A verified MINI App can send service messages instead.

Then, in this repo:
- **Two values change.** Put the MINI App's LIFF ID and channel ID in `liff/.env` as `LINE_MODE_LIFF_ID` and `LINE_MODE_CHANNEL_ID`, put your host in `LINE_MODE_DOMAIN`, and follow option B. Nothing else changes. To serve it from your own https host instead of ngrok, leave the tunnel out: run `npm run start:line`, check it first with `npm run tunnel -- --dry-run`, which runs every check and starts nothing, and only then put the app behind that host.
- **Use one pair, from one internal channel.** A MINI App channel has three internal channels, Developing, Review and Published, and each has its own LIFF ID and channel ID. Use Developing's while you test. oauth-mcp-manager accepts one channel at a time, so switch to Published's at launch.
- **Its URL.** An unverified MINI App opens at `https://miniapp.line.me/<LIFF ID>`. `https://liff.line.me/<LIFF ID>` opens it too, so the confirmations' links (`MAISON_LIFF_URL`) keep working. Its header shows the page's title, Maison, and your domain.

Already done for LINE's MINI App guidelines:
- **The icon:** as above.
- **The safe area:** 34 px clear at the bottom in portrait, and 44 px at the sides and 21 px at the bottom in landscape, where the app fills the screen (`liff/app/globals.css`).
- **The loading icon:** LINE's own spinner, 30×30 px and centered, wherever the app waits (`liff/components/spinner.tsx`).
- **LIFF inside LINE:**
  - `liff.init()` runs at or below the endpoint URL.
  - Outside LINE the app never starts LINE Login. It shows an "Open in LINE" page instead, with a QR code of the page's LINE link (`liff/components/open-in-line.tsx`).
  - When an ID token expires (they last an hour), the app logs out and reloads, LINE's own pattern.

Still to do before LINE's review:
- **People without LINE.** LINE asks that a MINI App work in an external browser without LINE Login. Every screen here needs a LINE session, so an external browser gets the "Open in LINE" page for now. A public catalog session would come next.
- **Performance.** LINE asks for a Lighthouse Performance score of 50 or more, measured on your deployment without LINE Login.
- **The policy and the review request:**
  - the LINE MINI App Policy
  - the channel description, and the privacy policy
  - for a reservation service, test scenarios in the review request

LINE's pages behind this:
- [Get started with LINE MINI App](https://developers.line.biz/en/docs/line-mini-app/quickstart/)
- design: the [icon](https://developers.line.biz/en/docs/line-mini-app/design/line-mini-app-icon/), the [safe area](https://developers.line.biz/en/docs/line-mini-app/design/landscape/) and the [loading icon](https://developers.line.biz/en/docs/line-mini-app/design/loading-icon/)
- [settings shown to users](https://developers.line.biz/en/docs/line-mini-app/develop/configure-console/), and the [console guide](https://developers.line.biz/en/docs/line-mini-app/discover/console-guide/)
- [permanent links](https://developers.line.biz/en/docs/line-mini-app/develop/permanent-links/), and [external browsers](https://developers.line.biz/en/docs/line-mini-app/develop/external-browser/)
- the [performance guidelines](https://developers.line.biz/en/docs/line-mini-app/develop/performance-guidelines/), behind the Lighthouse score
- the [LINE MINI App Policy](https://terms2.line.me/LINE_MINI_App?lang=en)

## Tests

| Command | What it runs | Needs |
|---|---|---|
| `npm test` | The app's unit tests, Maison's unit tests, the `@strapi/utils` check, the tests of `npm run setup` and of the Home page's starting text, and the tests of option B's mode switch, tunnel guard and `npm run qr` | nothing running |
| `npm run test:e2e` | Browser tests: booking and **My visits**, Home's headline from Strapi in English and Japanese, the language a booking sends, Osaka's closed day, a boutique without the piece, a day that has become today, the agent view, an unknown product, two customers, LINE's safe area in portrait and landscape, and **Chat with Maison on LINE** (with `NEXT_PUBLIC_LINE_OA_ID` set or empty: see below). API tests: each customer's visits, the Content Manager's list and search keeping customers out, and the REST door (the public catalog, an unknown slug, and booking only with a customer's session). | Strapi, in local mode (Playwright starts the app if it isn't running) |
| `npm run test:live` | The concierge on the local model, against the running Strapi. It books visits for throwaway customers. | Strapi, Ollama, and the app's client ID from `npm run setup`. It's skipped when the client ID is missing, or Strapi or Ollama doesn't answer. Run it in local mode: it signs in with the verify mock's ID tokens. |

- **Once, before the first `npm run test:e2e`:** `(cd liff && npx playwright install chromium)`, about 276 MiB.
- **Chat with Maison on LINE needs two runs,** one per case, because the app is built with the setting: `npm run test:e2e` with `NEXT_PUBLIC_LINE_OA_ID` in `liff/.env`, then `NEXT_PUBLIC_LINE_OA_ID= npm run test:e2e`. Stop any app on :3003 before each, so Playwright starts one with the same setting. Each run tests its case and skips the other.
- **`test:e2e` deletes every appointment and notification** in the demo database, the stage's too, before it runs, and leaves a few open requests behind. Reset demo appointments before going on stage.

Maison's own suites run inside the demo too, from `strapi/src/plugins/maison`:
- **Integration tests** boot the demo's Strapi in-process, on their own `strapi/.tmp/maison-test-*.db` files, with a local stand-in for LINE's push API, so they never message anyone: `STRAPI_APP_DIR="$(cd ../../.. && pwd)" npm run test:integration`.
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

## The Maison plugin in this repo

`strapi/src/plugins/maison` is [strapi-store-demo-mcp](https://github.com/PaulBratslavsky/strapi-store-demo-mcp) at `48a79a4`, unchanged. That repo is the source of truth, so change Maison there first. What the demo changes about Maison lives outside the copy, in `strapi/src/extensions/maison/`.

To bring in a newer version from a local clone of the plugin's repo, stop Strapi first (the install rebuilds Maison under it), then:

```bash
SRC=../plugin-dev/plugins/strapi-store-demo-mcp   # your clone
SHA=$(git -C "$SRC" rev-parse --verify feat/maison-plugin)
FILES=(admin server test scripts package.json package-lock.json README.md CHANGELOG.md vitest.config.ts .gitignore .editorconfig .prettierrc .prettierignore)
test -n "$SHA" && rm -rf strapi/src/plugins/maison && mkdir strapi/src/plugins/maison
git -C "$SRC" archive "$SHA" -- "${FILES[@]}" | tar -x -C strapi/src/plugins/maison
npm install --prefix strapi   # installs and builds it, and shares @strapi/utils
git add strapi/src/plugins/maison
test -n "$SHA" && diff <(git -C "$SRC" ls-tree -r "$SHA" -- "${FILES[@]}" | awk '{print $3, $4}' | sort -k2) \
     <(git ls-files -s strapi/src/plugins/maison | awk '{sub("strapi/src/plugins/maison/", "", $4); print $2, $4}' | sort -k2) \
  && echo "The staged copy matches $SHA"
```

- **The check compares what git tracks,** blob by blob, with the plugin's commit, not the folder. `strapi/.gitignore`'s patterns apply inside the copy too, so a file on disk may not be tracked.
- **If `SRC` is wrong,** `SHA` stays empty: nothing is deleted, and the check says nothing. Without "The staged copy matches", the copy doesn't match.
- Commit with the SHA in the message, update the commit named above, and start Strapi.
- To work on the plugin in place, run `npm run watch` in its folder, and restart Strapi to load each rebuild.
- If you run `npm install` in the plugin's folder, stop Strapi and run `npm install --prefix strapi` afterwards. Until then, `npm run dev:strapi` refuses to start: the `predevelop` check finds Maison's own `@strapi/utils`.

## Production notes

- **Staff** get an admin role with the Maison actions they need (`catalog.read`, `appointments.review`, `appointments.confirm`) instead of Super Admin.
- **The customer token** belongs to a dedicated service admin with a narrow role. A token's permissions are clamped to its owner's, so a narrow owner can't be widened by mistake.
- **Never set `LINE_VERIFY_URL`** in production. Serve everything over https, with `PUBLIC_URL` set to the public origin: the app's, when it passes Strapi's paths on as in option B. `MAISON_APP_ORIGIN` is only for a website on another origin that calls Strapi directly, from the browser: it adds that origin to Strapi's CORS.
- **Bind to 127.0.0.1** unless a proxy in front needs otherwise. The demo does it for Strapi, the app and the verify mock.
- **The Public role reads the catalog and the Home page over REST,** because `npm run setup` grants it six actions on every run: the five catalog actions and `api::home-page.home-page.find`. If your catalog isn't public, take its five away under Settings → Users & Permissions plugin → Roles → Public, give websites an API token instead, and drop them from `PUBLIC_ACTIONS` in the setup script. Without the Home page's `find`, the app shows its built-in Home text.
- **The REST door's customer routes** skip two of `/mcp`'s checks (see "The REST door"). Keep sessions short, with oauth-mcp-manager's `endUserAccessTokenTtl`, until oauth-mcp-manager refuses expired admin tokens itself.
- **Staff agents read what customers wrote.** `appointment_requests` gives a staff agent customers' notes, up to 500 characters each, which could try to instruct the model. The tool descriptions tell it to treat notes as information, and to confirm only a reference the staff member asked for. Keep `appointments.confirm` off an agent's token, or add an approval step for tools that write.
- **One Strapi sends each LINE confirmation once.** A visit's `sent` record stops a second send, and two sends at the same moment share one push, but only within one Strapi process. With more than one, add a claim row, LINE's `X-Line-Retry-Key` or an outbox (the plugin's README, "LINE confirmations").
- **`strapi/src/extensions/maison/strapi-server.ts`** keeps customers' LINE user IDs out of admin API responses and the list search. Keep it until Maison's own schema does the same.
- **Nothing here needs Strapi Enterprise.** If your license includes audit logs, they also record what admins do.
