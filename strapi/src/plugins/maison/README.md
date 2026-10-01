# Maison: a luxury house's catalog over Strapi MCP

A Strapi 5 plugin that shows one content model serving people and AI agents. It adds a fictional luxury house, "Maison": collections, products, boutiques and stock. Signed-in customers can request boutique visits, and staff review and confirm them.

- **Ten MCP tools and one MCP prompt** on Strapi's `/mcp`, each gated by a permission you grant per token
- **Six of the tools in the admin's AI chat**, through [strapi-plugin-tanstack-ai](https://github.com/PaulBratslavsky/strapi-plugin-tanstack-ai) 1.6
- **A human gate:** agents can request appointments, but only staff confirm them
- **Customer identity comes from sign-in, never from the model**, through [strapi-oauth-mcp-manager](https://github.com/PaulBratslavsky/strapi-oauth-mcp-manager) 1.1 and LINE
- **A live requests board and demo data** in the admin panel, with content in Japanese and English

Maison is fictional. The plugin uses no real brand's names, products or images.

## Four surfaces, one set of services

| Surface | Who uses it | What decides access |
|---|---|---|
| MCP tools on `/mcp` | The customer app, its AI concierge, an ops agent in Claude Desktop | The admin token's Maison permissions |
| The admin's AI chat | Staff, through strapi-plugin-tanstack-ai | The admin's role, tool by tool |
| The Maison admin page | Staff | The admin's role |
| The Content Manager | Staff | Content Manager permissions |

The tools, the chat and the board call the same services, so they give the same answers. The Content Manager goes through the Document Service instead, with the same validation on create and update.

Confirming a request is one act wherever it happens: the `confirm_appointment` tool, the board's **Confirm** button and **Publish** in the Content Manager all publish the appointment. None of them messages the customer. An ops agent sends the LINE confirmation afterwards. One difference: **Publish** in the Content Manager doesn't check the visit time, so it can confirm a visit that has already passed.

## Requirements

- Strapi `^5.55.1`, with the MCP server enabled: `mcp: { enabled: true }` in `config/server.ts`
- The i18n plugin, which is on by default
- For the customer tools, strapi-oauth-mcp-manager 1.1 with LINE sign-in configured. Without it, those tools answer `not_signed_in`.
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
    },
  },
});
```

Restart Strapi. Open **Maison** in the admin menu and choose **Load demo catalog** under **Demo data**.

## Configuration

| Key | Default | Purpose |
|---|---|---|
| `liffUrl` | `null` | Base of the links in LINE confirmations, e.g. `https://liff.line.me/<LIFF ID>`. Use `http://localhost:<port>` for local development. Until it's set, `pending_confirmations` answers `not_configured`. An empty value counts as not set. |
| `timezone` | `Asia/Tokyo` | Opening-hours checks, the times in messages, and the day of the `date` filter |
| `defaultLocale` | `ja` | Content language when a tool call doesn't pass `locale` (`ja` or `en`) |
| `maxOpenRequestsPerCustomer` | `3` | Unconfirmed future requests a customer may have |
| `houseName` | `{ ja: 'メゾン', en: 'Maison' }` | Header of the LINE confirmation |
| `disabledTools` | `[]` | Tool names to leave out of MCP and the admin chat |

## Tools

| Tool | Permission | What it does |
|---|---|---|
| `browse_collections` | MCP: browse the catalog | Published collections, with a teaser and product count |
| `search_products` | MCP: browse the catalog | Products by collection, category, gift occasion, price, personalization and boutique stock |
| `view_product` | MCP: browse the catalog | One product: story, dimensions, personalization, stock per boutique |
| `find_boutiques` | MCP: browse the catalog | Boutiques, opening hours, open on a date, stock for chosen products |
| `request_appointment` | MCP: request and view own appointments | Creates a **draft** visit request for the signed-in customer |
| `my_appointments` | MCP: request and view own appointments | The signed-in customer's own requests and confirmations |
| `appointment_requests` | MCP: review appointment requests | Requests for staff, by default the ones still waiting. Customers are masked. |
| `confirm_appointment` | MCP: confirm appointment requests | Confirms a request by publishing it. It sends nothing. |
| `pending_confirmations` | MCP: send appointment confirmations | Confirmed upcoming visits not yet sent, each with a ready LINE flex message |
| `record_confirmation` | MCP: send appointment confirmations | Records whether a LINE confirmation was delivered |

The **`send_pending_confirmations` prompt** tells an ops agent how to deliver confirmations with [LINE Bot MCP](https://github.com/line/line-bot-mcp-server). It checks that each customer is reachable (`get_profile`) before pushing, because LINE's push API answers 200 even when it can't deliver. The prompt drives both `pending_confirmations` and `record_confirmation`, so disabling either one in `disabledTools` also drops the prompt.

**Errors don't throw.** They come back as `isError` results whose text is `{"error":{"code","message","hint"}}`. The codes are `not_signed_in`, `not_found`, `invalid_input`, `boutique_closed`, `in_the_past`, `too_many_open_requests`, `not_published` and `not_configured`. The hint says what to do next.

One exception on MCP: arguments that fail the MCP SDK's schema check, such as a date that isn't on the calendar, come back as plain text (`Input validation error: …`), not in the JSON error shape. Errors from the tools themselves are always JSON.

## The admin chat

strapi-plugin-tanstack-ai 1.6 finds Maison's `ai-tools` service and offers six of its tools as `maison__<name>`:
- the four catalog tools
- `appointment_requests` and `confirm_appointment`

Each tool is offered only to admins whose role holds its permission. The customer tools are left out, because a chat has an admin rather than a LINE customer. `record_confirmation` is left out because it only follows a LINE push, and `pending_confirmations` because its result carries customers' full LINE user ids.

## The admin page

**Maison** in the admin menu is shown to admins with "MCP: review appointment requests" or "Load and reset demo data":
- **Appointment requests:** a board that refreshes every 5 seconds. You can filter it to requests waiting for staff, confirmed ones, or all. Admins with "MCP: confirm appointment requests" get a **Confirm** button on requests whose visit is still ahead.
- **Demo data:** **Load demo catalog** and **Reset demo appointments**.

## Tokens

Strapi's `/mcp` only accepts **admin** API tokens. Create them under **Settings → Administration Panel → Admin Tokens** and grant only the Maison permissions a caller needs:
- **Customer token:** "MCP: browse the catalog" and "MCP: request and view own appointments". Map it to the LINE client in oauth-mcp-manager. Every customer session runs with this token's permissions, so keep it narrow.
- **Staff token:** "MCP: browse the catalog", "MCP: review appointment requests" and "MCP: confirm appointment requests", for an agent that works for staff.
- **Ops token:** only "MCP: send appointment confirmations".

The same permissions on an **admin role** decide what staff see in the chat and on the Maison page. "Load and reset demo data" is an ordinary admin role permission.

## Customer identity

A tool never takes the customer as an argument. Customer tools pass the caller's own `Authorization` header to oauth-mcp-manager:

```ts
strapi.plugin('strapi-oauth-mcp-manager').service('oauth').resolveSubject(authorization); // 'line:U…' or null
```

Anything but `line:U` followed by 32 lowercase hex characters counts as not signed in. That includes plain admin tokens, staff sessions, and a missing oauth-mcp-manager. Staff tools and the board show customers masked, as in `line:U4af…88`, and never the full LINE user ID.

The Content Manager doesn't show an appointment's `customer` field at all, in the list or the edit view. The Document Service still reads and writes it, and saving or publishing an appointment in the Content Manager leaves it as it was.

## Run the ops agent

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

The plugin runs from `dist/`, so rebuild (`npm run link`) and restart Strapi after changing it.
