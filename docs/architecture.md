# How Maison works

This page describes the parts of the Maison demo and how they connect: the repository, the Maison plugin's service layer and the three interfaces that call it, customer sessions, the concierge, and inquiry labelling.

## Repository layout

| Path | What it is |
|---|---|
| `strapi/` | A Strapi 5.55.1 app (TypeScript), made with `create-strapi`. It uses SQLite locally, and has the `pg` driver for PostgreSQL |
| `strapi/src/plugins/maison/` | The Maison plugin: content types, thirteen MCP tools and a prompt, REST routes, admin routes, the Maison page and the Homepage widgets, and the demo catalog. A local plugin that lives in this repo (see [The Maison plugin in this repo](maison-plugin.md)) |
| `strapi-oauth-mcp-manager` | From npm: OAuth for Strapi's MCP server, with customer sign-in by LINE ID token exchange |
| `strapi/src/api/home-page/` | The Home page single type: the words on the app's Home screen, in English and Japanese. Strapi writes the starting text when there's no Home page, and never overwrites an edit |
| `strapi/scripts/maison-setup.mjs` | `npm run setup` |
| `liff/` | The Maison app: Next.js 16, LIFF and the LIFF mock, the MCP SDK, and the concierge on AI SDK 7 |
| `liff/scripts/mock-line-verify.mjs` | The local stand-in for LINE's ID token verify endpoint |
| `scripts/init-env.mjs` | Creates the two `.env` files on `npm install` |
| `scripts/line-mode.mjs`, `scripts/line-tunnel.mjs` | Option B: `npm run mode:line` and `mode:local` switch both `.env` files, and `npm run tunnel` refuses an unsafe tunnel |
| `scripts/line-stand-in.mjs` | `npm run line:stand-in`: a local stand-in for LINE's Messaging API, so local checks of the staff follow-up reach no one's phone (see [Production notes](production.md#customer-questions)) |
| `liff/scripts/line-qr.mjs` | Option B: `npm run qr`, the app's LINE link as a QR code, saved in `liff/line/qr/` (gitignored: it holds your LIFF ID) |
| `liff/lib/strapi-proxy.ts` and its routes (`liff/app/mcp`, `liff/app/uploads`, `liff/app/api/strapi-oauth-mcp-manager`) | Option B: Strapi's `/mcp`, token endpoint and `/uploads` on the app's own origin |
| `liff/line/channel-icon.png` | The channel icon, to LINE's MINI App icon spec |
| `liff/public/line/LINE_spinner_light.svg` | LINE's loading icon: LINE's own file, from its MINI App design guidelines |

Option A and option B are in [Running with real LINE](line-setup.md).

## One service layer

Maison's services, in the Maison plugin, hold the rules: the catalog, opening hours, who may book what, and who sees a customer's LINE user ID. Three interfaces call them:

| Interface | Used by | Where |
|---|---|---|
| MCP tools | The Maison app, its concierge, and staff agents | `/mcp`, with a customer's session or an admin token |
| REST API | Websites | `/api/maison/…` |
| Admin routes | The Maison page and the Homepage widgets in the Strapi admin | `/maison/…` on Strapi's admin API |

- **The Maison app reads the catalog and books visits only through MCP.** Its **Agent view** shows the tool call each screen makes, and the concierge calls the same tools. The words on its Home screen come from the Home page single type, which the app reads over REST (`/api/home-page`).
- **The Maison page** has three tabs, each with the count of what waits for staff: **Requests** (the requests board), **Questions** (questions the concierge handed to staff) and **Inquiries** (every concierge turn, labelled). Under the tabs, **Demo data** has **Load demo catalog** and **Reset demo activity**. Reset asks first, then deletes appointments, delivery records, questions, inquiries, and the product knowledge that staff answers added.
- **The requests board** shows requests **Waiting for staff** (its default filter), **Confirmed**, or **All requests**, and refreshes every 5 seconds. **Confirm** appears on waiting requests whose visit is still ahead, and its notice says whether the customer's LINE confirmation was sent. **Send again** appears on a confirmed visit still ahead whose LINE column says "not sent". Each request shows where it was made: `app` for the product page's **Book a visit** sheet and the concierge's visit picker, `web` for the REST API.
- **The Inquiries tab** sorts every concierge turn into **Needs an answer** (its default filter), **Complaints** and **Praise**, plus **Not labelled** and **All**, from the labels a model gives each turn within a minute. The first three list only open inquiries that wait for staff, so a turn the concierge answered shows under **All** (and under **Not labelled** until it is labelled). Staff can **Reply on LINE** (with a suggested text for complaints and praise), **Close** with a reason, or **Change label**. A turn the concierge handed to staff is answered under **Questions**, and answering it marks the inquiry replied. The page shows the month's LINE messages against the plan's limit.
- **The Homepage widgets.** **Maison requests** counts **Waiting for staff**, **Confirmed, upcoming** and **LINE sent** (among the upcoming confirmed visits), lists the five newest requests, and links to the board with **Open the board**. It refreshes every 5 seconds, and shows only to admins whose role can review appointments. **Maison inquiries** counts the open inquiries in each queue, for admins who can review inquiries. A Homepage whose layout was changed before needs **Add Widget** once.

## Customer sessions

The app signs a customer in with LINE (LIFF), then exchanges the LINE ID token for a short-lived Strapi session with [strapi-oauth-mcp-manager](https://www.npmjs.com/package/strapi-oauth-mcp-manager), after LINE verifies the token ([RFC 8693](https://www.rfc-editor.org/rfc/rfc8693) token exchange). The MCP tools and the REST API's customer routes take that session.

**Token endpoint:** `POST {STRAPI}/api/strapi-oauth-mcp-manager/oauth/token`, as a form:

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
- In local mode, Strapi checks ID tokens with the local verify mock, which accepts `valid.` followed by a LINE user ID (`U` and 32 lowercase hex digits). In LINE mode, and in production, LINE checks them.

## MCP tools

The Maison plugin registers thirteen tools and one prompt on [Strapi's MCP server](https://docs.strapi.io/cms/features/strapi-mcp-server), each gated by a permission granted per token. Call them with `POST {STRAPI}/mcp` and `Authorization: Bearer <access_token>` (a customer's session) or an admin token.

| Tools | For |
|---|---|
| `browse_collections`, `search_products`, `view_product`, `find_boutiques`, `search_knowledge`, `request_appointment`, `my_appointments`, `hand_off_to_staff` | Customers: the app and its concierge, with the customer's session |
| `log_inquiry` | The app's server, which logs each finished concierge turn. The concierge's model is never offered it |
| `appointment_requests`, `confirm_appointment` | Staff agents |
| `pending_confirmations`, `record_confirmation`, and the prompt `send_pending_confirmations` | An agent that retries LINE confirmations: see [Ops tools for an agent](ops-tools.md) |

- **Errors** come back as `isError` results whose text is `{ "error": { "code", "message", "hint" } }`. Arguments the SDK rejects, such as a date that isn't on the calendar, come back as plain text that starts `Input validation error:`.
- **Each tool's permission** is listed in the plugin's README, under [Tools](../strapi/src/plugins/maison/README.md#tools).

## The REST API

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

**The customer's routes** take the session the MCP tools take (see [Customer sessions](#customer-sessions)). In local mode you can get a session with `curl`, because the verify mock accepts a made-up ID token. The client ID is the value of `NEXT_PUBLIC_MAISON_CLIENT_ID`, which `npm run setup` writes to `liff/.env`.

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
- **The session check** is `/mcp`'s own (oauth-mcp-manager's `resolveAccessToken`), and the customer is then resolved as the tools resolve it. Two checks that `/mcp` adds aren't repeated: core's expiry check on the session's admin token (`checkExpiry`), and the tool's own permission. The first gap lasts at most a session's life, `endUserAccessTokenTtl`, an hour by default.

The full contract is in the plugin's README, under [The REST routes](../strapi/src/plugins/maison/README.md#the-rest-routes).

## The concierge

The concierge is a route on the app's server (`liff/app/api/concierge`, with the logic in `liff/lib/concierge.ts`). It runs the model with the [AI SDK](https://ai-sdk.dev) as the signed-in customer: it sends the customer's own session to Strapi's `/mcp` unchanged, and adds no credential of its own. Which model answers depends on the keys in `liff/.env` (see [Requirements](../README.md#requirements)).

- **The model's tools:** seven Maison tools (every customer tool except `request_appointment`) and two of the app's own, `resolve_date` and `choose_visit`. The title bar still says "8 MCP tools", because the chat uses `request_appointment` through the visit picker.
- **When the model can't be reached,** the concierge says which model, and how to fix it.
- **Qwen3 on the local model is slower:** about 20 to 60 seconds a turn, where Claude takes seconds.

### Dates

When a customer names a day ("Saturday", "tomorrow"), the concierge asks `resolve_date`, a local tool on Tokyo's calendar, before `find_boutiques` with a date and before `choose_visit`. Its tool line reads `Local · resolve_date`. The model never works out a date itself: on the local model, "Saturday" came out as Friday until the date became a tool.

### The visit picker

The concierge prepares a visit, and the customer books it with one tap.

1. **The customer asks to visit.** The concierge calls `choose_visit` with the pieces (1 to 5 product slugs) and anything the customer named: a boutique, a day (the date `resolve_date` returned) and a time. When the customer asks to visit before choosing a piece, the concierge calls `choose_visit` in the same reply, with the pieces it suggests in that reply or suggested just before (at most three). It asks which piece only when it has none to suggest. It never asks whether to request a visit, and never says a visit is requested before the customer sends it. `choose_visit` is the app's own tool, and the customer answers it, so the reply stops there. Before the form shows, the app's server asks `find_boutiques` for the pieces: if Strapi doesn't know one of them, the call is refused with Strapi's own message, and the concierge looks the slug up and calls again. Any other failure of that check lets the form show: the form makes its own `find_boutiques` call, and offers **Try again** if that fails too.
2. **The chat shows the Book a visit form,** the same form as the product page's sheet, filled in from the call, with **Send request** and **Not now**. The line above it reads `Local · choose_visit` while it waits, and the photos of pieces a search found in that reply sit above that line, under the concierge's words. The chat scrolls to the form's top when it appears. Its heading names the pieces as `view_product` returns them. A boutique is offered when it has at least one of the pieces in stock; one with none of them shows "not in stock".
3. **Values the form can't use fall back as on the sheet.** An unknown boutique, or one with none of the pieces, becomes the first boutique that has one. A day that isn't one of the form's days becomes the next Saturday at least two days away. The form's days run from tomorrow to two weeks ahead, so when the customer asks for today or a later day, the concierge says so in one short sentence and leaves the day out of the call. A time between half-hours goes to the half-hour it falls in (14:15 becomes 14:00), and a time when the boutique is closed becomes its first slot.
4. **Send request books the visit** with `request_appointment` over MCP, with the customer's own session: the same call, input and rules as the product page's sheet. The board shows it created via `app`. A refusal (a closed day, a time too soon, three requests already waiting) shows in the form, and nothing reaches the concierge.
5. **The concierge continues.** The visit's card replaces the form, with **Chat with Maison on LINE** under it when `NEXT_PUBLIC_LINE_OA_ID` is set, and the lines above it read `Local · choose_visit ✓ requested` and `MCP · request_appointment ✓`. The concierge says in one short sentence that the visit is requested and the boutique will confirm it on LINE. After **Not now**, the form becomes "Closed without a request.", and the concierge offers help without pushing.

- **Only the newest picker can send,** and not while a reply is coming in. While its request is on its way, Send and the suggestions wait. A picker the customer moved past by typing reads "No request sent.", and the concierge answers the new message.
- **The model never books.** It isn't offered `request_appointment`, and it never says a visit is confirmed.

**The safety net.** The model decides whether to call `choose_visit`, and in production it once asked for the boutique, day and time in words instead. So when the customer's message asks for a new visit in the words of a request ("Can I book a visit?", "I'd like to see it in person", 予約したいです), a piece is known (the page's, or one that `search_products` or `view_product` returned in the conversation), and a reply that ended without an error made no `choose_visit` call, the app's server runs one extra model pass. A question about a visit, such as "Did my booking go through?", "Can I cancel my appointment?", 予約を確認したいです or whether a booking is needed, doesn't count, whatever else it says. Nor does any message once a visit was requested in the chat, or a reply that called `my_appointments`: a fresh picker there could book the same visit twice. The extra pass has only `resolve_date` and `choose_visit`, and must call `choose_visit`, after `resolve_date` for a day the customer named. Its parts continue the same reply, so the picker appears under the concierge's words and every rule above applies. It gets what is left of the route's time, 20 seconds at most, and is skipped when under 5 would be left. If it fails, runs out of time or shows no picker, the customer keeps the first reply and the server's log says why. The turn is logged once, after both passes.

### Product knowledge and staff hand-off

For care, sizing, delivery, repairs, warranty, gift wrapping and similar questions, the concierge calls `search_knowledge` and answers only from the entries it returns.

- **When no entry answers,** or the customer asks for a person, it calls `hand_off_to_staff`, a Maison tool that records the question in Strapi for Maison's client advisors. Its line reads `MCP · hand_off_to_staff ✓`, with a note under it that names the question's reference: "Thanks for asking! Give us a few minutes: one of our client advisors will message you here with the answer. (Q-4821)". **Send it in the LINE chat** under the note opens the chat with Maison, with the question already typed in, for the customer to send.
- **When the knowledge search finds nothing,** the app's server records the question for staff itself, so it doesn't depend on the model calling the tool. The note then appears under the search's line, `MCP · search_knowledge ✓ 0 results`.
- **When a hand-off fails:** one the model makes shows a red line with the error's code. When the app's own hand-off fails, the search's line stays green, and the server's log says why.
- **When nothing was recorded,** the note says only "Our team answers questions like this in Maison's LINE chat." with **Chat with Maison on LINE**, so a customer can always reach a person, and no note says the question is with the advisors.

### Empty turns

Now and then, the local model ends a turn with tool calls and no words. The concierge then shows "No reply came back." and **Try again**, which asks again. It never offers **Try again** on a turn that booked a visit, ends in a visit picker that waits for the customer, or holds a visit the picker requested, so nothing is booked twice. A `choose_visit` call cut off before it arrived whole shows no form, so it gets **Try again**. It doesn't offer it when the note is the answer either: a recorded hand-off, or a search that found nothing. After a hand-off that failed, with no words, it still offers **Try again** under the plain note, unless a search that found nothing came first: the note under that search counts as the answer.

### Inquiries

The app's server logs each finished turn in Strapi as an inquiry, with `log_inquiry`, for the Inquiries tab: one inquiry for each customer message. A turn that ends at a visit picker is logged with a note that the concierge showed a picker.

## Inquiry labelling

Strapi labels inquiries with a model of its own, in the background, every minute: the kind (question, complaint, praise, other), the sentiment, whether the concierge answered, a reason and a topic.

- **It uses the AI SDK,** with these settings in `strapi/.env`: `AI_API_KEY` (an Anthropic key: Claude Haiku 4.5 by default), and optionally `AI_PROVIDER` (`anthropic`, `openai` or `openai-compatible`), `AI_MODEL`, and `AI_BASE_URL` for a local model, such as Ollama's `http://127.0.0.1:11434/v1`.
- **Without them, labelling is off,** and new inquiries wait under **Not labelled** until it's on.
- **The queue comes from the labels in code:** a turn handed to staff always needs an answer, whatever the model says.
