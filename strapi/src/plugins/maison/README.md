# Maison: a luxury house's catalog over Strapi MCP

A Strapi 5 plugin that shows one content model serving people and AI agents. It adds a fictional luxury house, "Maison": collections, products, boutiques and stock. Signed-in customers can request boutique visits, and staff review and confirm them.

- **Twelve MCP tools and one MCP prompt** on Strapi's `/mcp`, each gated by a permission you grant per token
- **REST routes at `/api/maison`** for websites: the catalog under Strapi's role permissions, and bookings for the signed-in LINE customer, on the same services, input checks and sign-in as the tools
- **Six of the tools in the admin's AI chat**, through [strapi-plugin-tanstack-ai](https://github.com/PaulBratslavsky/strapi-plugin-tanstack-ai) 1.6
- **A human gate:** agents can request appointments, but only staff confirm them
- **Customer questions for staff:** when the concierge can't answer, Strapi records the question, staff let the customer know or answer on LINE in their own name, and an answer can become product knowledge ([Customer questions](#customer-questions))
- **Customer identity comes from sign-in, never from the model**, through [strapi-oauth-mcp-manager](https://github.com/PaulBratslavsky/strapi-oauth-mcp-manager) 1.1 and LINE
- **A live requests board and demo data** in the admin panel, with content in Japanese and English

Maison is fictional. The plugin uses no real brand's names, products or images.

## Five surfaces, one set of services

| Surface | Who uses it | What decides access |
|---|---|---|
| MCP tools on `/mcp` | The customer app, its AI concierge, an ops agent in Claude Desktop | The admin token's Maison permissions |
| REST routes at `/api/maison` | Websites and other apps | The catalog: a role or API token holding its action. Bookings: a LINE customer session |
| The admin's AI chat | Staff, through strapi-plugin-tanstack-ai | The admin's role, tool by tool |
| The Maison admin page and Homepage widget | Staff | The admin's role |
| The Content Manager | Staff | Content Manager permissions |

The tools, the REST routes, the chat, the board and the Homepage widget call the same services, so they give the same answers. The Content Manager goes through the Document Service instead, with the same validation on create and update.

Confirming a request is one act wherever it happens: the `confirm_appointment` tool, the board's **Confirm** button and **Publish** in the Content Manager all publish the appointment, and Strapi then sends the customer the LINE confirmation ([LINE confirmations](#line-confirmations)). One difference: **Publish** in the Content Manager doesn't check the visit time, so it can confirm a visit that has already passed.

## Requirements

- Strapi `^5.55.1`, with the MCP server enabled: `mcp: { enabled: true }` in `config/server.ts`
- The i18n plugin, which is on by default
- For the customer tools and the customer routes, strapi-oauth-mcp-manager 1.1 with LINE sign-in configured. Without it, those tools answer `not_signed_in` and those routes answer 503.
- For the admin chat, strapi-plugin-tanstack-ai 1.6 with its chat configured. Maison needs no setup for it: the chat finds Maison's tools by itself.

## Install for local development

```bash
git clone https://github.com/PaulBratslavsky/strapi-store-demo-mcp.git
cd strapi-store-demo-mcp
npm install
npm run link          # builds, then publishes to a local yalc store
```

In your Strapi app:

```bash
npx yalc@1.0.0-pre.53 add --link strapi-store-demo-mcp
yarn install          # or npm install
```

```ts
// config/plugins.ts
export default ({ env }) => ({
  maison: {
    enabled: true,
    config: {
      liffUrl: env('MAISON_LIFF_URL', null),
      lineChannelAccessToken: env('LINE_CHANNEL_ACCESS_TOKEN', null),
    },
  },
});
```

Restart Strapi. Open **Maison** in the admin menu and choose **Load demo catalog** under **Demo data**.

## Configuration

| Key | Default | Purpose |
|---|---|---|
| `liffUrl` | `null` | Base of the links in LINE confirmations, e.g. `https://liff.line.me/<LIFF ID>`. Use `http://localhost:<port>` for local development. Until it's set, Strapi sends no confirmations and `pending_confirmations` answers `not_configured`. An empty value counts as not set. |
| `timezone` | `Asia/Tokyo` | Opening-hours checks, the times in messages, and the day of the `date` filter |
| `defaultLocale` | `ja` | Content language when a tool call doesn't pass `locale` (`ja` or `en`) |
| `maxOpenRequestsPerCustomer` | `3` | Unconfirmed future requests a customer may have |
| `houseName` | `{ ja: 'メゾン', en: 'Maison' }` | Header of the LINE confirmation, in the visit's language |
| `disabledTools` | `[]` | Tool names to leave out of MCP and the admin chat |
| `lineChannelAccessToken` | `null` | The channel access token of your LINE Messaging API channel, which Strapi sends confirmations and staff's answers to customer questions with: `env('LINE_CHANNEL_ACCESS_TOKEN', null)`. Without it, Strapi sends none. An empty value counts as not set. |
| `lineApiBaseUrl` | `https://api.line.me` | Where Strapi sends them. Any https URL, or `http://127.0.0.1:<port>` and `http://localhost:<port>` for a stand-in in tests. No trailing slash. |

## Tools

| Tool | Permission | What it does |
|---|---|---|
| `browse_collections` | MCP: browse the catalog | Published collections, with a teaser and product count |
| `search_products` | MCP: browse the catalog | Products by collection, category, gift occasion, price, personalization and boutique stock |
| `view_product` | MCP: browse the catalog | One product: story, dimensions, personalization, stock per boutique |
| `find_boutiques` | MCP: browse the catalog | Boutiques, opening hours, open on a date, stock for chosen products |
| `search_knowledge` | MCP: browse the catalog | What Maison has written down for customers, such as care, sizing, delivery, repairs, warranty and gift wrapping: the best four published entries for a question, or none |
| `request_appointment` | MCP: request and view own appointments | Creates a **draft** visit request for the signed-in customer, and names the boutique and products in the customer's `locale`, which the visit keeps for its LINE confirmation |
| `my_appointments` | MCP: request and view own appointments | The signed-in customer's own requests and confirmations |
| `hand_off_to_staff` | MCP: hand questions to staff | Hands the signed-in customer's question to Maison's client advisors, with the piece it is about when it is about one, and answers a reference like `Q-4821`. Strapi sends the customer nothing: staff reply in the LINE chat ([Customer questions](#customer-questions)). Five questions can wait for one customer at a time, and asking one again that is still waiting answers its reference |
| `appointment_requests` | MCP: review appointment requests | Requests for staff, by default the ones still waiting. Customers are masked. |
| `confirm_appointment` | MCP: confirm appointment requests | Confirms a request by publishing it, which sends the customer's LINE confirmation, once |
| `pending_confirmations` | MCP: send appointment confirmations | Confirmed upcoming visits whose confirmation hasn't gone out, each with a ready LINE flex message |
| `record_confirmation` | MCP: send appointment confirmations | Records whether a LINE confirmation was delivered |

**Product knowledge** is a content type, `plugin::maison.knowledge`, localized with draft and publish. Each entry has a title, an answer of up to 2,000 characters, a category, the products it's about (`productSlugs`, empty for every piece) and keywords. `search_knowledge` scores published entries on the question's words: in the title most, then the keywords, then the answer. With `productSlugs`, it leaves out entries about other pieces, and an unknown or unpublished product is `not_found`. **Load demo catalog** adds 16 entries in English, also to a catalog loaded before. It adds them only when no English entry exists, so if it stops partway through them, delete the English product knowledge entries and press **Load demo catalog** again.

The **`send_pending_confirmations` prompt** tells an ops agent how to deliver confirmations with [LINE Bot MCP](https://github.com/line/line-bot-mcp-server): the ones Strapi couldn't send, since Strapi sends them itself. It checks that each customer is reachable (`get_profile`) before pushing, because LINE's push API answers 200 even when it can't deliver. The prompt drives both `pending_confirmations` and `record_confirmation`, so disabling either one in `disabledTools` also drops the prompt.

**Errors don't throw.** They come back as `isError` results whose text is `{"error":{"code","message","hint"}}`. The codes are `not_signed_in`, `not_found`, `invalid_input`, `boutique_closed`, `in_the_past`, `too_many_open_requests`, `too_many_open_questions` (MCP only: no REST route hands off a question), `not_published` and `not_configured`. The hint says what to do next.

One exception on MCP: arguments that fail the MCP SDK's schema check, such as a date that isn't on the calendar, come back as plain text (`Input validation error: …`), not in the JSON error shape. Errors from the tools themselves are always JSON.

## Three doors, one service layer

Maison's services sit behind three HTTP doors. Each door checks who is calling in its own way, then calls the same services with the same input checks.

| Door | Path | For | Who may call |
|---|---|---|---|
| REST routes | `/api/maison/…` | Websites and other apps | The catalog: a role or API token. Bookings: a LINE customer session |
| Admin routes | `/maison/…` | The Maison page and the Homepage widget | Admins whose role holds the action |
| MCP tools | `/mcp` | Agents | Admin tokens with Maison permissions |

### The REST routes

| Route | Mirrors | Access |
|---|---|---|
| `GET /api/maison/collections` | `browse_collections` | `plugin::maison.collections.find` |
| `GET /api/maison/products` | `search_products` | `plugin::maison.products.find` |
| `GET /api/maison/products/:slug` | `view_product` | `plugin::maison.products.findOne` |
| `GET /api/maison/boutiques` | `find_boutiques` | `plugin::maison.boutiques.find` |
| `GET /api/maison/knowledge` | `search_knowledge` | `plugin::maison.knowledge.find` |
| `POST /api/maison/appointments` | `request_appointment` | A LINE customer session |
| `GET /api/maison/my-appointments` | `my_appointments` | A LINE customer session |

Each route takes its tool's input, checks it with the same schema (`server/src/mcp/schemas.ts`), and answers with the tool's structured content:
- **Query parameters** have the tool's argument names, limits and checks: `?occasion=travel&maxPriceJpy=400000&locale=en`.
- **A list repeats its parameter:** `?productSlugs=weekender-50&productSlugs=passport-cover`. One is a list of one. A comma-separated list isn't split, so it fails the slug check.
- **`locale`** is `ja` or `en`, and defaults to `defaultLocale`, as on the tools. A booking takes it in the body.
- **The booking body** is `request_appointment`'s input, as JSON: `boutique`, `productSlugs`, `requestedFor`, and an optional `note` and `locale`. The `locale` picks the language of the boutique and product names in the answer, and of the visit's LINE confirmation. Any other field is ignored, a customer included.
- **A booking** answers 201 with `{ "appointment": … }`. The requests board shows it as made via `web`.

```bash
STRAPI=http://localhost:1338   # the demo's Strapi; a stock Strapi listens on 1337

# The catalog, once a role holds its actions (below)
curl "$STRAPI/api/maison/collections?locale=en"
curl "$STRAPI/api/maison/products?occasion=travel&maxPriceJpy=400000&inStockAt=ginza&locale=en"
curl "$STRAPI/api/maison/products/weekender-50?locale=en"
curl "$STRAPI/api/maison/boutiques?productSlugs=weekender-50&productSlugs=passport-cover&date=2026-10-10"
curl "$STRAPI/api/maison/knowledge?query=How%20do%20I%20care%20for%20the%20leather%3F&locale=en"

# Bookings, with a customer's LINE session
curl -X POST "$STRAPI/api/maison/appointments" \
  -H "Authorization: Bearer $SESSION" -H 'Content-Type: application/json' \
  -d '{"boutique":"ginza","productSlugs":["weekender-50"],"requestedFor":"2026-10-10T14:00:00+09:00","note":"A gift","locale":"en"}'
curl -H "Authorization: Bearer $SESSION" "$STRAPI/api/maison/my-appointments?locale=en"
```

**Errors** are `{ "error": { "code", "message", "hint" } }`, with the code, message and hint the tool would return. The hints are the tools' own words, so a tool they name stands for its route: `search_products` is `GET /products`.

| Status | Code | When |
|---|---|---|
| 400 | `invalid_input` | The shared schema rejects a value (no hint; MCP answers these as `Input validation error: …`), or a minimum price is above the maximum |
| 401 | `not_signed_in` | A customer route has no LINE customer session. Sent with `WWW-Authenticate: Bearer` |
| 404 | `not_found` | An unknown product, collection or boutique |
| 409 | `boutique_closed`, `too_many_open_requests` | The same request can succeed once something changes: the boutique's hours, or one of the customer's open requests |
| 422 | `in_the_past` | The visit starts less than 30 minutes from now |
| 503 | `not_configured` | Customer sign-in isn't configured: oauth-mcp-manager 1.1 isn't installed |
| 503 | `temporarily_unavailable` | Checking a customer's session failed on the server, such as a database error. It isn't a sign-out: try again. Only the REST door has this code |

Strapi answers some requests itself, in its own error body: a 403 when no role or token holds a catalog action, and a 401 for a bearer token it doesn't recognize on a catalog route.

### Grant the catalog

The catalog routes use Strapi's content-API permissions, so a request needs one of these:
- **A role holding their actions,** under **Settings → Users & Permissions plugin → Roles**: **Public** for a public website.
- **A read-only, full-access or custom API token,** under **Settings → API Tokens**. A custom token needs the actions. A read-only token can call them because they're named `find` and `findOne`, the only actions Strapi lets a read-only token call.

The five actions:
- `plugin::maison.collections.find`, for `GET /collections`
- `plugin::maison.products.find`, for `GET /products`
- `plugin::maison.products.findOne`, for `GET /products/:slug`
- `plugin::maison.boutiques.find`, for `GET /boutiques`
- `plugin::maison.knowledge.find`, for `GET /knowledge`

The list there also shows the two customer actions, `plugin::maison.customer.requestAppointment` and `plugin::maison.customer.myAppointments`. Roles don't apply to them, so granting them opens nothing.

These actions aren't the admin token permissions under Tokens. "MCP: browse the catalog" (`plugin::maison.catalog.read`) gates the tools only.

### The customer session

The customer routes take the same session as the MCP tools: the access token oauth-mcp-manager issues for a customer's LINE sign-in. The routes set `auth: false`, so users-permissions doesn't refuse that token, and Maison's `customer-session` policy checks it instead:
- It passes the `Authorization` header to `identity.customerSession`, the function behind the tools' `getCustomerSubject`.
- That first runs `/mcp`'s session check, oauth-mcp-manager's `resolveAccessToken`, and only then asks `resolveSubject` whose session it is. The tools skip the first step, because `/mcp` has already run it on their request.
- A LINE customer gets through, as `ctx.state.maisonCustomer`. The routes book and list for that customer only.
- Anything else is a 401 with `WWW-Authenticate: Bearer`: no header or a malformed one, an unknown, expired, revoked or rotated session, a user who is no longer active, a staff session, an admin or API token, or a users-permissions JWT.
- Without oauth-mcp-manager 1.1, it's a 503 `not_configured`, which says customer sign-in isn't configured.
- If checking the session fails on the server, such as a database error, it's a 503 `temporarily_unavailable`, not a 401: the session may still be good.
- It never logs a token, the admin key behind a session, or a full LINE user ID.

`/mcp` goes further than that check in two ways:
- **An expired admin token.** Strapi core also refuses a session whose admin token has expired (`checkExpiry`). The REST door accepts that session until the session itself expires: at most the session TTL, 1 hour, because oauth-mcp-manager issues no new session for an expired admin token. Closing this gap belongs in oauth-mcp-manager, with `resolveAccessToken` refusing an expired admin token, in a later release.
- **The tool's permission.** Each tool also needs its own permission on that admin token, such as "MCP: request and view own appointments" for `request_appointment`. The REST door doesn't check it: the customer's session is enough.

Send the session to the customer routes only. The catalog routes check tokens with Strapi's own content-API auth, which doesn't know LINE sessions and answers 401. A website on another origin also needs its origin in `strapi::cors`.

### Why the tools aren't REST wrappers

The two doors share what's underneath, not each other. A route doesn't call a tool, and a tool doesn't call a route: both call the services, with the same schemas and the same customer check. They're shaped for different callers:
- **An agent works through a task.** Each tool is one step of it. Its description tells the model when to use it and what it won't do, and its errors name the next tool to call, such as "Call find_boutiques to find valid boutique slugs."
- **A website works with resources.** It wants paths it can link to and cache, status codes, query strings, and Strapi's role permissions.
- **Some tools have no route, on purpose.** The staff tools sit behind the admin routes, for the board. `pending_confirmations` returns customers' full LINE user IDs, so it stays with the ops agent.

## The admin chat

strapi-plugin-tanstack-ai 1.6 finds Maison's `ai-tools` service and offers six of its tools as `maison__<name>`:
- `browse_collections`, `search_products`, `view_product` and `find_boutiques`
- `appointment_requests` and `confirm_appointment`

Each tool is offered only to admins whose role holds its permission. `search_knowledge`, the fifth catalog tool, isn't offered in the admin chat. The customer tools (`request_appointment`, `my_appointments` and `hand_off_to_staff`) are left out, because a chat has an admin rather than a LINE customer. `record_confirmation` is left out because it only follows a LINE push, and `pending_confirmations` because its result carries customers' full LINE user ids.

## The admin page

**Maison** in the admin menu is shown to admins with "MCP: review appointment requests", "Read customer questions" or "Load and reset demo data":
- **Appointment requests:** the Homepage widget's three cards (waiting for staff, confirmed and upcoming, LINE sent), then a board that refreshes every 5 seconds. You can filter it to requests waiting for staff, confirmed ones, or all. Each row shows the customer's note. Admins with "MCP: confirm appointment requests" get a **Confirm** button on requests whose visit is still ahead, and the cards update as soon as they confirm. They also get **Send again** on confirmed requests whose LINE column says "not sent", until the visit is over ([Send again](#send-again)).
- **Customer questions**, for admins with "Read customer questions": the questions the concierge handed to staff, with **Let them know** and **Answer** for admins with "Answer customer questions on LINE" ([Customer questions](#customer-questions)).
- **Demo data:** **Load demo catalog** and **Reset demo appointments and questions**, which also deletes the questions and the product knowledge their answers added.

## The Homepage widget

**Maison requests** on the admin's Homepage is shown to admins with "MCP: review appointment requests":
- Three cards count one pipeline of visits still ahead: **Waiting for staff**, **Confirmed, upcoming**, and **LINE sent**, the confirmed visits whose LINE confirmation has been sent. They wrap when the widget is narrow.
- Below them, a table lists the five newest requests, newest first. A narrow widget scrolls it sideways. Its columns are:
  - **Requested:** how long ago the request came in, like "12 min ago", and from a day on its date, like "Oct 1". Hover for the full date and time.
  - **Reference**, **Customer** (masked, like `line:U4af…88`) and **Boutique**.
  - **Visit:** the visit time in Tokyo.
  - **Note:** what the customer wrote, cut to one line. Hover for all of it. A dash when there is none.
  - **Status** and **LINE** ("LINE sent" or "not sent"), in the words and colours of the board.
- It refreshes every 5 seconds. If a refresh fails, it keeps the last result on screen with a note.
- **Open the board** goes to the Maison page. It shows the same three cards above the board, and the board has a **Note** column too, where the whole note wraps instead of being cut.

Its numbers and rows come from `GET /maison/appointments/summary`, which calls `appointments.summarizeRequests()` and follows the board's own definitions. Each row is a row of the board's "All requests" view, without the products and `createdVia`: its `createdAt` is when the request came in, and its `note` is what the customer wrote. Strapi keeps each admin's Homepage layout once they've changed it, so an admin who has moved or removed widgets adds this one with **Add Widget**.

## Tokens

Strapi's `/mcp` only accepts **admin** API tokens. Create them under **Settings → Administration Panel → Admin Tokens** and grant only the Maison permissions a caller needs:
- **Customer token:** "MCP: browse the catalog", "MCP: request and view own appointments" and "MCP: hand questions to staff". Map it to the LINE client in oauth-mcp-manager. Every customer session runs with this token's permissions, so keep it narrow.
- **Staff token:** "MCP: browse the catalog", "MCP: review appointment requests" and "MCP: confirm appointment requests", for an agent that works for staff.
- **Ops token:** only "MCP: send appointment confirmations".

The same permissions on an **admin role** decide what staff see in the chat and on the Maison page. "Load and reset demo data", "Read customer questions" and "Answer customer questions on LINE" are ordinary admin role permissions.

## Customer identity

A tool never takes the customer as an argument. Customer tools pass the caller's own `Authorization` header to oauth-mcp-manager:

```ts
strapi.plugin('strapi-oauth-mcp-manager').service('oauth').resolveSubject(authorization); // 'line:U…' or null
```

Anything but `line:U` followed by 32 lowercase hex characters counts as not signed in. That includes plain admin tokens, staff sessions, and a missing oauth-mcp-manager. Staff tools and the board show customers masked, as in `line:U4af…88`, and never the full LINE user ID.

The REST customer routes run the same lookup through the `customer-session` policy, after running `/mcp`'s session check (see [The customer session](#the-customer-session)).

The Content Manager doesn't show an appointment's `customer` field at all, in the list or the edit view. The Document Service still reads and writes it, and saving or publishing an appointment in the Content Manager leaves it as it was.

## LINE confirmations

Strapi sends the customer the LINE confirmation when staff confirm a visit, whichever way they do it:
- the board's **Confirm** button
- `confirm_appointment`, in the admin chat or from an MCP client
- **Publish** on the appointment in the Content Manager

Each of them publishes the appointment. Once that publish has gone through, Strapi pushes the visit's flex message to the customer with LINE's push API, `POST /v2/bot/message/push`. It's the message `pending_confirmations` lists for the visit, built by the same code. Sending never makes the publish fail.
- **Confirm and `confirm_appointment`** wait for LINE's answer, 8 seconds at most, so their answer and the board's next refresh show how it went.
- **Publish in the Content Manager**, and its bulk Publish, run inside a database transaction. Strapi sends once that transaction commits, and the publish doesn't wait for LINE: the board shows the outcome on its next refresh. A publish that's rolled back sends nothing.

**The message is in the language the customer booked in.** That's the appointment's `language`, `ja` or `en`, which the booking's `locale` sets, on `request_appointment` or the REST booking. A customer app passes the language its customer is using. A booking without a `locale` gets `defaultLocale`, and a visit without a `language`, such as one booked before appointments kept it, is Japanese.
- The message's words, the house name and the date follow it: `10月10日(土) 14:00` in Japanese, `Sat 10 Oct, 14:00` in English.
- So do the boutique's name and address and the pieces' names. They come from the published versions of the boutique and products in that language, field by field, with the default locale's value where one is missing or empty.
- `pending_confirmations` lists it in that language too.

Strapi records each attempt as a Maison notification, with `recordedBy` set to `strapi`:
- **sent**, with LINE's answer. LINE also answers 200 for a customer it can't deliver to, such as one who has blocked the account, so `sent` means LINE took the message.
- **failed**, with LINE's HTTP status and its message, or why LINE couldn't be reached

A visit gets one confirmation. Once a `sent` notification exists for it, Strapi sends nothing more, so publishing a confirmed visit again sends nothing. A visit that's over gets none, as `pending_confirmations` lists none, even when the Content Manager publishes it.

Two sends for the same visit at the same moment share one push, within one Strapi process. That's enough for this demo, which runs one Strapi. In production it isn't: several Strapi processes can each send, and a crash between the push and its record leaves no `sent` row. The usual remedies are a claim row with a unique index on the reference, written before the push so only one sender wins; LINE's `X-Line-Retry-Key` header on the push, with LINE's 409 answer to a repeated key treated as sent; or an outbox, where publishing only writes a pending row and a worker sends it and retries.

**Give Strapi the channel access token** of your LINE Messaging API channel: set `LINE_CHANNEL_ACCESS_TOKEN` in the app's `.env`, read it in `config/plugins.ts` as in [Install](#install-for-local-development), and restart Strapi. Without a token, Strapi sends and records nothing, and logs this once: "LINE_CHANNEL_ACCESS_TOKEN isn't set: confirmations aren't sent from Strapi." The board then shows those visits as "not sent". Without a `liffUrl`, it sends nothing either, because the message's button would have no link.

### Send again

On the board, a confirmed request whose LINE column says "not sent" has a **Send again** button until its visit is over, for admins with "MCP: confirm appointment requests". It sends the confirmation, unless it has gone out already, and shows a notification saying how it went. It calls `POST /maison/appointments/:reference/notify`, gated on the same permission as **Confirm**, which answers:

| Status | When |
|---|---|
| 200, with `status: "sent"` | LINE took the message |
| 200, with `status: "already_sent"` | It had gone out already, so nothing was sent |
| 200, with `status: "sent_unrecorded"` | LINE took the message, but recording it failed, so its row still says "not sent". Don't send it again |
| 404 | No appointment has that reference |
| 409 (`not_confirmed`) | The visit isn't confirmed |
| 422 (`past`) | The visit is over, so it gets no confirmation |
| 502 (`failed`) | LINE refused it or couldn't be reached. The failure is recorded |
| 503 (`not_configured`) | There's no `lineChannelAccessToken` or no `liffUrl` |

Every error says why in its message, which is what the board shows.

## Customer questions

When the concierge has no answer in product knowledge, or the customer asks for a person, it calls `hand_off_to_staff`. Strapi records the question for the signed-in customer under a reference like `Q-4821`, with the piece it's about and the customer's LINE name when LINE gives one, and sends the customer nothing. A question the customer already has with staff (open or taken), in the same words apart from capitals and extra spaces, isn't recorded twice: the tool answers the existing reference, before it counts the five. Staff follow up on the Maison page, under **Customer questions**.

**The section** refreshes every 5 seconds and filters to **Open** (open and taken questions, the default), **Answered** or **All**, newest first. Each row shows when the question came in (Tokyo time), the customer's LINE name with the masked ID under it, the piece, the question, why it was handed off ("No answer in product knowledge" or "Asked for a person"), and its status: Open, Taken by Jane, or Answered by Jane, with "Added to product knowledge" when it was. When the last LINE message for a question failed, the row says so, in LINE's words.

Two permissions, which an admin role holds like any other:

| Permission | What it gives |
|---|---|
| Read customer questions (`plugin::maison.questions.read`) | The section, and a way into the Maison page |
| Answer customer questions on LINE (`plugin::maison.questions.answer`) | The two buttons below. It needs Read customer questions too, because the buttons live in the section |

- **Let them know**, on an open question, sends the customer one LINE message in the admin's first name: a person has the question and will reply in the chat. The question becomes taken.
- **Answer**, on an open or taken question, opens a dialog with the question, a box for the answer (never pre-filled) and **Add to product knowledge**, ticked. **Send on LINE** sends the answer in the admin's name and marks the question answered. With the box ticked, it also publishes the answer as a product knowledge entry that every customer's concierge can use, so the answer should suit any customer. The entry is in the question's language, about the question's piece, under the category the admin picked, and titled by **Title in product knowledge**: the customer's own question (cut to 200 characters) to start with, which the admin can edit. Customers see the title with the answer, so the dialog says to take out anything personal. **Send on LINE** stays disabled while the box is ticked and the title is empty.

Both buttons are disabled while a request runs. Nothing guards two admins pressing them for the same question at the same moment: both messages could go out.

**The routes** are admin routes, so each takes an admin session that holds its permission:

| Route | Permission | Body |
|---|---|---|
| `GET /maison/questions?status=open\|answered\|all` | Read customer questions | None. Answers `{ questions }` |
| `POST /maison/questions/:reference/notify` | Answer customer questions on LINE | None |
| `POST /maison/questions/:reference/answer` | Answer customer questions on LINE | `{ text, addToKnowledge, category, title }` |

`text` is 1 to 2,000 characters. `addToKnowledge` defaults to `true`, and while it's true, `category` is one of `care`, `materials`, `sizing`, `personalization`, `delivery`, `returns`, `repairs`, `warranty`, `gifting` and `store`. With `addToKnowledge: false`, leave `category` out. `title` is 1 to 200 characters and only used while `addToKnowledge` is true: it titles the knowledge entry, and without one the customer's question (cut to 200 characters) is the title. The message is signed with the first name of the signed-in admin's account, never with anything the request says. An admin without a first name, or whose first name is the house's own, writes for the team.

The two POSTs answer:

| Status | When |
|---|---|
| 200 | LINE took the message. The answer is `{ reference, status: "sent", message }`, with `knowledgeDocumentId` when the answer became a knowledge entry, and `warning: true` when something after the message went wrong |
| 400 (`invalid_input`) | The reference isn't like `Q-4821`, `text` is empty or longer than 2,000 characters, `title` is empty or longer than 200 characters, or there's no `category` while `addToKnowledge` is true |
| 404 (`not_found`) | No question has that reference |
| 409 (`already_taken`) | Let them know, for a question someone has taken already |
| 409 (`already_answered`) | Either POST, for an answered question |
| 502 (`failed`) | LINE refused the message or couldn't be reached. The question stays as it was, apart from recording why, which its row shows, and nothing is saved as knowledge |
| 503 (`not_configured`) | There's no `lineChannelAccessToken`. Nothing is sent |

Every error says why in its message, which is what the page shows. A 200 with `warning: true` has the customer's message out, and its `message` says what went wrong after: "…, but recording it failed (…). Don't send it again." when LINE took the message but the question couldn't be updated, and "…It couldn't be added to product knowledge: …" when the answer went out but its entry wasn't made. The page shows that `message` as a warning, and any other 200's as a success.

**What the customer gets** is a LINE text message from Maison's channel, in the question's language, written in the admin's first name and quoting the question cut to 80 characters. Let them know, in English:

> Hello, this is Jane, a client advisor at Maison. Thank you for your question about the Jewelry Coffret: "Can it hold a watch?" I'm looking into it and will reply here in this chat as soon as I can.\
> Jane, Maison

And an answer:

> Hello, this is Jane, a client advisor at Maison. Thank you for your question about the Jewelry Coffret: "Can it hold a watch?"
>
> Yes, a watch up to 42 mm fits.
>
> If anything else comes to mind, just reply here.\
> Jane, Maison

A question in Japanese gets both messages in Japanese, signed with "Maison" and the name joined by a full-width space. Without a piece, "about the Jewelry Coffret" is left out. Without a first name, or with the house's own as the first name ("Maison", in any case, or either `houseName` in the config), the message opens "Hello, this is Maison's client advisor team." and is signed "Maison".

**Reset demo appointments and questions**, under Demo data, deletes every question and the product knowledge entries their answers added, in every language, as well as every appointment and notification. The catalog and the seeded product knowledge stay. Strapi answers `{ appointments, notifications, questions, knowledge }`, what it deleted, and the page says so.

## Run the ops agent

Strapi sends confirmations itself. The ops agent's tools are still there for an agent that retries the ones that didn't go out: `pending_confirmations` lists them, failed ones included, and `record_confirmation` records what the agent sent, with `recordedBy` set to `ops-agent`.

Point Claude Desktop at Strapi with the ops token and at LINE Bot MCP with a Messaging API channel access token. Then run the `send_pending_confirmations` prompt. The URL below is LaunchPad's dev server; Strapi's default port is 1337.

```json
{
  "mcpServers": {
    "maison": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://localhost:1338/mcp", "--header", "Authorization: Bearer ${MAISON_OPS_TOKEN}"],
      "env": { "MAISON_OPS_TOKEN": "<ops token>" }
    },
    "line-bot": {
      "command": "npx",
      "args": ["-y", "@line/line-bot-mcp-server"],
      "env": { "CHANNEL_ACCESS_TOKEN": "<channel access token>" }
    }
  }
}
```

## Extend it

- **Fields:** extend any Maison content type from your app with `src/extensions/maison/strapi-server.ts`.
- **Your own tools:** register them in your app's `register()`, reusing the plugin's services:
  - `strapi.plugin('maison').service('identity').getCustomerSubject(extra)` for the signed-in customer
  - `service('errors').toolError(code, message, hint)` for errors in the same shape
  - `service('catalog')` and `service('appointments')` for the same logic the tools use, including `listRequests` and `confirm`
- **Your own routes:** guard a customer route with `config: { auth: false, policies: ['plugin::maison.customer-session'] }`, and read the customer from `ctx.state.maisonCustomer`. For an `Authorization` header anywhere else, `service('identity').customerSession(authorization)` always runs `/mcp`'s session check first. It answers `{ status: 'signed_in', subject }`, `{ status: 'signed_out' }`, `{ status: 'unavailable' }` when customer sign-in isn't installed, or `{ status: 'error' }` when checking failed on the server: answer that with a 503, not a 401.
- **Fewer tools:** list them in `disabledTools`.

## Development

```bash
npm test                    # unit tests (vitest)
npm run test:ts:back        # type-check the server
npm run test:ts:front       # type-check the admin
STRAPI_APP_DIR=/path/to/strapi-app npm run test:integration   # boots that app against throwaway SQLite files
node --env-file=/path/to/strapi-app/.env scripts/mcp-dev-tokens.mjs && npm run test:mcp   # against a running app
```

The MCP smoke tests (the last line) need:
- the Strapi app running at `STRAPI_URL` (default `http://localhost:1338`)
- an admin's credentials in the environment: `ADMIN_EMAIL` and `ADMIN_PASSWORD`, or `LOCAL_TEST_ADMIN_EMAIL` and `LOCAL_TEST_ADMIN_PASSWORD`
- `liffUrl` set in the app, or `pending_confirmations` answers `not_configured`

The token script also loads the demo catalog, then saves a customer, a staff and an ops token to `test/mcp/.tokens.json`, readable by you only.

The integration tests never reach LINE. The harness keeps the app's `LINE_CHANNEL_ACCESS_TOKEN` out of Strapi, and the LINE confirmation suite points `lineApiBaseUrl` at a stand-in on a free local port.

The plugin runs from `dist/`, so rebuild (`npm run link`) and restart Strapi after changing it.
