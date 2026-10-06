# Deploying and running in production

The app and Strapi deploy separately: the app in `liff/` to Vercel, and Strapi in `strapi/` to Strapi Cloud. This page has the production settings, the first-time setup on Strapi Cloud, and the notes for running Maison in production.

## Where each part runs

- **The app** is a Next.js project on [Vercel](https://vercel.com), with `liff/` as the project's root directory. `liff/vercel.json` runs its server in the `iad1` region (Washington, D.C.), close to the Strapi Cloud project: change it to the region nearest yours. The app's settings are the Vercel project's environment variables, listed in [The app on Vercel](#the-app-on-vercel). `liff/.vercelignore` keeps every `.env` file out of an upload.
- **Strapi** runs on [Strapi Cloud](https://strapi.io/cloud), with `strapi` as the project's **Base directory** (see Strapi's [Project deployment](https://docs.strapi.io/cloud/getting-started/deployment) page). `strapi/package.json` includes the `pg` driver for PostgreSQL. Strapi Cloud runs with `NODE_ENV=production`, so Strapi ignores `LINE_VERIFY_URL` there, and LINE verifies every ID token (`strapi/config/plugins.ts`).

## Production settings

Each value goes only into the Vercel project's environment variables or the Strapi Cloud project's **Variables**: never into a commit.

### The app on Vercel

Set these in the Vercel project's **Settings** → **Environment Variables**.

| Variable | What it's for | Required | Production value |
|---|---|---|---|
| `NEXT_PUBLIC_LIFF_MOCK` | Turns the LIFF mock off, so customers sign in with LINE. It also turns on the app's routes for `/mcp`, the token endpoint and `/uploads`. | Yes | `false`. Set it: `liff/.env.example` has `true`, and any value but `false` runs the mock, which Strapi refuses in production. |
| `NEXT_PUBLIC_LIFF_ID` | The LIFF app that signs customers in, and the "Open in LINE" link outside LINE. | Yes | Your production LIFF app's LIFF ID. The LIFF app's Endpoint URL is the Vercel app's URL. |
| `NEXT_PUBLIC_STRAPI_URL` | Where the browser reaches Strapi: the LINE sign-in token exchange and `/mcp`. It's also the base of relative media URLs. | Yes | The Vercel app's own https origin, with no trailing slash. The app's routes pass `/mcp`, the token endpoint and `/uploads` on to `STRAPI_URL`, so the browser only ever calls the app. |
| `NEXT_PUBLIC_MAISON_CLIENT_ID` | The "Maison app" OAuth client. The app refuses to start without it. | Yes | The client ID from step 9 of [First-time setup on Strapi Cloud](#first-time-setup-on-strapi-cloud). |
| `STRAPI_URL` | Where the app's server reaches Strapi: the concierge's MCP calls, the Home page text and the app's routes above. Its default, `http://127.0.0.1:1338`, doesn't exist on Vercel. | Yes | The Strapi Cloud URL: https, with no trailing slash. |
| `ANTHROPIC_API_KEY` | The concierge's model, Claude Sonnet 5. | Yes, or `AI_GATEWAY_API_KEY` | A secret: your Anthropic API key. |
| `AI_GATEWAY_API_KEY` | The same model through Vercel AI Gateway, instead of `ANTHROPIC_API_KEY`. The app uses the gateway only when this is set. | Yes, or `ANTHROPIC_API_KEY` | A secret: your AI Gateway key. When both are set, `ANTHROPIC_API_KEY` wins. |
| `NEXT_PUBLIC_LINE_OA_ID` | The **Chat with Maison on LINE** and **Send it in the LINE chat** buttons. Empty, they don't appear. | No, but recommended: a confirmation only reaches a customer who has added the Official Account | Your Official Account's basic ID, with the `@`. |
| `NEXT_PUBLIC_DEMO_LOCALE` | The language when neither the customer nor LINE gives one, such as on the "Open in LINE" page. | No | `en`, the default. |

- **Redeploy after any change.** Vercel applies a changed variable to new deployments only, and Next.js builds the `NEXT_PUBLIC_` values into the app.
- **Without a model key,** the concierge calls Ollama on localhost, which doesn't exist on Vercel.
- **Leave the laptop's settings unset:** `NEXT_PUBLIC_DEMO_LINE_USER_ID` (the mock's customer), `OLLAMA_MODEL` and `OLLAMA_BASE_URL` (the local model), `LINE_MODE_LIFF_ID`, `LINE_MODE_CHANNEL_ID` and `LINE_MODE_DOMAIN` (`npm run mode:line`), and `LINE_LOGIN_CHANNEL_ID` and `MOCK_LINE_VERIFY_PORT` (the verify mock).
- **`NEXT_PUBLIC_STRAPI_URL` can be the Strapi Cloud URL instead.** The browser then calls Strapi Cloud directly, and Strapi Cloud needs `MAISON_APP_ORIGIN` set to the Vercel app's origin, for CORS.

### Strapi on Strapi Cloud

Set these under the project's **Settings** → **Variables**, for its environment (Strapi's [Cloud project settings](https://docs.strapi.io/cloud/projects/settings#variables)).

| Variable | What it's for | Required | Production value |
|---|---|---|---|
| `APP_KEYS`, `ADMIN_JWT_SECRET`, `API_TOKEN_SALT`, `TRANSFER_TOKEN_SALT`, `JWT_SECRET` | Strapi's own secrets: session keys, admin sign-in, the token salts and the Users & Permissions plugin. | Yes | Secrets. Check that each one is listed under **Variables**, and add any that's missing with a random value. Never copy one from `strapi/.env`. |
| `ENCRYPTION_KEY` | Strapi encrypts admin token keys with it, and oauth-mcp-manager needs it for customer sign-in. | Yes | A secret random value. Set it before you create the admin tokens, and never change it afterwards. |
| `PUBLIC_URL` | Strapi's public address: the admin, absolute media URLs and oauth-mcp-manager's metadata. The production config has no default. | Yes | The Strapi Cloud URL: https, with no trailing slash. Not the app's origin: the admin is served here. |
| `LINE_LOGIN_CHANNEL_ID` | Turns on LINE sign-in. Strapi checks each ID token with LINE, for this channel. Unset, customers can't sign in. | Yes | Your LINE Login channel's ID, digits only: the channel that holds the production LIFF app. Never the mock's `1234567890`. |
| `MAISON_APP_ORIGIN` | Adds the app's origin to Strapi's CORS, so the browser can call the token endpoint and `/mcp` on Strapi Cloud directly. | Only when `NEXT_PUBLIC_STRAPI_URL` is the Strapi Cloud URL | The Vercel app's https origin: scheme and host, with no path and no trailing slash. |
| `MAISON_LIFF_URL` | The base of the link in each LINE confirmation, followed by `/visits/<reference>`. Unset, Strapi sends no confirmations. | Yes | `https://liff.line.me/` followed by your LIFF ID, with no trailing slash. Strapi refuses to start with one. |
| `LINE_CHANNEL_ACCESS_TOKEN` | Sends visit confirmations and staff replies on LINE. Unset, nothing is sent, and the board shows "not sent". | Yes | A secret: your Messaging API channel's access token. |
| `AI_API_KEY` | Labels customer inquiries. Unset, labelling is off, and inquiries wait under **Not labelled**. | No, but recommended | A secret: an Anthropic API key. |
| `AI_PROVIDER`, `AI_MODEL` | The labelling provider and model. | No | Leave unset: Anthropic, with `claude-haiku-4-5-20251001`. |
| `MCP_ENABLED` | Strapi's MCP server at `/mcp`, where Maison's tools live. | No | `true`, the default. Leave it unset. |
| `MAISON_DEMO_LINE_USER_ID` | Gives your own LINE account one waiting request, one open question and one open complaint when you press **Load demo activity**, so confirming and replying on stage reach your phone. Unset, the demo activity goes to five made-up customers only, who get no LINE message. | No | Your LINE user ID: `U` and 32 lowercase hex characters. Any other value is ignored with a warning in Strapi's log, and every demo item then goes to the made-up customers. Never logged. |

Never set these on Strapi Cloud:
- **`DATABASE_*`.** Strapi Cloud injects its own PostgreSQL connection, and stops injecting it when you add one of these (Strapi's [Database](https://docs.strapi.io/cloud/advanced/database) page).
- **`HOST` and `PORT`.** The production config listens on `0.0.0.0` and on Cloud's port. `HOST=127.0.0.1`, as in `strapi/.env.example`, would cut Strapi off from Cloud's proxy.
- **`NODE_ENV`.** Strapi Cloud sets it to `production`.
- **`LINE_VERIFY_URL`, `MAISON_LINE_API_BASE_URL` and `AI_BASE_URL`.** On a laptop they point at the verify mock, the LINE stand-in and a local model.
- **`DEMO_ADMIN_EMAIL`, `DEMO_ADMIN_PASSWORD`, `STRAPI_URL`, `MAISON_SETUP_LIFF_ENV` and `MAISON_SETUP_OPS_TOKEN_FILE`.** They're inputs for `npm run setup`, which never runs against Strapi Cloud. Strapi doesn't read them.

Redeploy after changing a variable: press **Save & deploy** in the **Variables** tab, or **Trigger deployment** on the project dashboard (Strapi's [Cloud deployments management](https://docs.strapi.io/cloud/projects/deploys)).

## First-time setup on Strapi Cloud

Never run `npm run setup` against Strapi Cloud. On a new Strapi Cloud project, these steps do by hand what it does locally:

1. **Node version.** The AI SDK needs Node 22.12 or later. Set it under the environment's **Configuration** → **Basic information** (Strapi's [Cloud project settings](https://docs.strapi.io/cloud/projects/settings)).
2. **Variables.** Set the variables in [Strapi on Strapi Cloud](#strapi-on-strapi-cloud), then deploy.
3. **The first admin.** Open `/admin` on the Strapi Cloud URL and fill in the registration form: first name, last name, email and password. The first admin is a Super Admin (Strapi's [Role-Based Access Control](https://docs.strapi.io/cms/features/rbac)). Create the customer token (step 7) and the client (step 9) as the same admin: a client can only map an admin token its creator owns. For a narrow service admin instead, see [The customer token](#the-customer-token).
4. **Check that sign-in is ready.** Open **MCP OAuth** in the sidebar. It should show no "Strapi's MCP server is disabled" or "Encryption key missing" alert, and **Connection details** should read "LINE sign-in is on for channel" with your channel's ID. If not, fix `MCP_ENABLED`, `ENCRYPTION_KEY` or `LINE_LOGIN_CHANNEL_ID`, and redeploy.
5. **The demo catalog.** Open **Maison** in the sidebar and press **Load demo catalog** under **Demo data** (the plugin's [admin page](../strapi/src/plugins/maison/README.md#the-admin-page)). It adds the `ja` and `en` locales, 3 boutiques, 3 collections and 12 products in both languages, their stock, and 16 product knowledge entries in English and Japanese. It leaves an existing catalog alone. It answers at once and adds them in the background, which takes up to a minute on Cloud's database: the notice starts "Loading demo catalog in the background". Press it again once that has passed: "The demo catalog and its product knowledge are already loaded." says it's done. The Home page's text needs no step: Strapi writes and publishes it on a new database.
6. **The Public role.** Go to **Settings** → **Users & Permissions plugin** → **Roles** → **Public** (Strapi's [Users & Permissions](https://docs.strapi.io/cms/features/users-permissions)). Tick these, leave the rest as it is, and save:
   - under **Maison**: `find` on collections, products, boutiques and knowledge, and `findOne` on products
   - under **Home-page**: `find`
7. **The "Maison customer" token.** Go to **Settings** → **Administration Panel** → **Admin Tokens**, and press **Create new Admin Token** (Strapi's [Admin tokens](https://docs.strapi.io/cms/features/admin-tokens)):
   - **Name:** `Maison customer`
   - **Description:** `Every customer session of the Maison app runs with this token.`
   - **Token duration:** Unlimited
   - **Plugins** tab → **Maison:** tick only "MCP: browse the catalog", "MCP: request and view own appointments", "MCP: hand questions to staff" and "MCP: log customer inquiries".

   Save. Its key goes nowhere: the client in step 9 uses the token itself.
8. **The "Maison ops" token.** Create a second admin token on the same page:
   - **Name:** `Maison ops`
   - **Description:** `An ops agent in the Maison demo, which can retry LINE confirmations.`
   - **Token duration:** Unlimited
   - **Plugins** tab → **Maison:** tick only "MCP: send appointment confirmations".

   Save, and copy the key Strapi shows. Skip this token if no agent retries confirmations.
9. **The "Maison app" client.** Open **MCP OAuth** in the sidebar, and go to its **OAuth clients** section. If another client with the **LINE sign-in** badge is active, turn off its **Active** switch first: only one LINE client can be active, and turning it off ends its sessions. Then press **Add client**:
   - **Name:** `Maison app`
   - **Customer sign-in:** "LINE: customers sign in with LINE". **Redirect URIs** and **Client type** then disappear.
   - **Admin token:** Maison customer. Only your own tokens are listed.

   Press **Create**, and copy the **Client ID**. A LINE client has no secret. Strapi's docs don't cover this plugin: see the [oauth-mcp-manager README](https://github.com/PaulBratslavsky/strapi-oauth-mcp-manager#readme).
10. **The app on Vercel.** Set the variables in [The app on Vercel](#the-app-on-vercel), with the Client ID from step 9 as `NEXT_PUBLIC_MAISON_CLIENT_ID`. Then redeploy the app.
11. **The ops agent.** Give it the "Maison ops" key from step 8 as `MAISON_OPS_AUTH="Bearer <key>"`, with the Strapi Cloud URL followed by `/mcp` in place of `http://localhost:1338/mcp` ([Ops tools for an agent](ops-tools.md)). The key goes into no variable on Vercel or Strapi Cloud.

Later:
- **Keep the customer token's owner active.** If that admin is deleted, their tokens are deleted too. If the admin is deactivated or blocked, Strapi refuses their tokens. Either way, customers can't sign in.
- **A new client gets a new client ID.** Set it as `NEXT_PUBLIC_MAISON_CLIENT_ID` on Vercel and redeploy. Delete the old client before its token: a client mapped to a deleted token refuses sign-in. Deleting the customer token ends every customer session.

### A Strapi Cloud database from before questions, inquiries and product knowledge

On a database set up before these features, the customer token lacks two actions, the Public role lacks one, and the catalog has no product knowledge:
- **On the "Maison customer" token,** tick "MCP: hand questions to staff" (`plugin::maison.questions.ask`) and "MCP: log customer inquiries" (`plugin::maison.inquiries.log`). When the token's owner is a narrow service admin, add both to the owner's role first.
- **On the Public role,** tick Maison's `find` on knowledge, for product knowledge over REST (`/api/maison/knowledge`). The concierge doesn't need it: it searches through MCP.
- **Press Load demo catalog again.** It adds the 16 product knowledge entries in English when there are none, gives each English entry its Japanese version when it has none, and leaves the catalog alone. A database with only the English entries gets the 16 Japanese versions this way, in the background: the notice says "Loading demo catalog in the background: 16 product knowledge entries in Japanese." Press it again a minute later to check: it then says everything is loaded.
- **Check steps 1 and 2.** Labelling needs Node 22.12 or later, and `AI_API_KEY`.

## Production notes

### Customer questions

The staff follow-up: the concierge hands questions to Maison's client advisors, who answer them on LINE.

- **The "Maison customer" token** needs "MCP: hand questions to staff" (`plugin::maison.questions.ask`). `npm run setup` adds it locally. On Strapi Cloud, tick it by hand ([First-time setup](#first-time-setup-on-strapi-cloud), step 7).
- **Staff** need "Read customer questions" to see the **Questions** tab, and "Answer customer questions on LINE" for its buttons.
- **Local checks with a LINE stand-in.** `MAISON_LINE_API_BASE_URL` points Strapi at a stand-in for LINE's Messaging API, so nothing reaches a phone. Start the stand-in with `npm run line:stand-in` (on 127.0.0.1:4010, logging what Strapi pushes to `strapi/.tmp/line-stand-in.jsonl`), then Strapi with `MAISON_LINE_API_BASE_URL=http://127.0.0.1:4010 LINE_CHANNEL_ACCESS_TOKEN=stand-in npm run dev:strapi`. Strapi sends and looks up nothing without a token, and the stand-in accepts any. Leave `MAISON_LINE_API_BASE_URL` unset everywhere else.

### Inquiries

- **The "Maison customer" token** needs "MCP: log customer inquiries" (`plugin::maison.inquiries.log`), or the app logs nothing. `npm run setup` adds it locally. On Strapi Cloud, tick it by hand ([First-time setup](#first-time-setup-on-strapi-cloud), step 7).
- **Staff** need "Review customer inquiries" to see the **Inquiries** tab and widget, and "Reply to customer inquiries on LINE" for its buttons.
- **Labelling** needs `AI_API_KEY` ([Strapi on Strapi Cloud](#strapi-on-strapi-cloud)) and Node 22.12 or later ([First-time setup](#first-time-setup-on-strapi-cloud), step 1).
- **The LINE stand-in** also answers the month's quota: 200 messages, and the pushes it took since it started.

### Staff

Give staff an admin role with the Maison actions they need (`catalog.read`, `appointments.review`, `appointments.confirm`) instead of Super Admin.

### The customer token

The "Maison customer" token belongs to a dedicated service admin with a narrow role. A token's permissions are limited to its owner's, so a narrow owner keeps the token from being given more by mistake. A token can't hold a permission its owner's role lacks, so that role needs:
- the token's four Maison actions: "MCP: browse the catalog", "MCP: request and view own appointments", "MCP: hand questions to staff" and "MCP: log customer inquiries"
- the **Admin tokens** settings permissions, to create the token
- "Manage MCP OAuth clients and grants", to create the client

The service admin then creates both the token and the "Maison app" client ([First-time setup](#first-time-setup-on-strapi-cloud), steps 7 and 9): a client can only map an admin token its creator owns.

### LINE sign-in and origins

- **Never set `LINE_VERIFY_URL`** in production.
- **Serve everything over https.** On Strapi Cloud, `PUBLIC_URL` is the Strapi Cloud URL, because the admin is served there. Only [option B](line-setup.md#option-b-the-real-app-inside-line)'s tunnel sets it to the app's origin.
- **`MAISON_APP_ORIGIN`** adds one origin to Strapi's CORS, for an app or website that calls Strapi from the browser on another origin. The Vercel app needs it only when its `NEXT_PUBLIC_STRAPI_URL` is the Strapi Cloud URL.
- **Bind to 127.0.0.1 on a laptop.** The demo does it for Strapi, the app and the verify mock. On Strapi Cloud, leave `HOST` unset: the production config listens on `0.0.0.0`, so Cloud's proxy can reach Strapi.

### The Public role

The Public role reads the catalog and the Home page over REST, because `npm run setup` grants it six actions on every run: the five catalog actions and `api::home-page.home-page.find`. If your catalog isn't public, remove its five under **Settings → Users & Permissions plugin → Roles → Public**, give websites an API token instead, and remove them from `PUBLIC_ACTIONS` in the setup script. On Strapi Cloud, leave them unticked in [step 6](#first-time-setup-on-strapi-cloud). Without the Home page's `find`, the app shows its built-in Home text.

### The REST API's customer routes

They skip two of `/mcp`'s checks (see [The REST API](architecture.md#the-rest-api)). Keep sessions short, with oauth-mcp-manager's `endUserAccessTokenTtl`.

### Staff agents read what customers wrote

`appointment_requests` gives a staff agent customers' notes, up to 500 characters each, which could try to instruct the model. The tool descriptions tell it to treat notes as information, and to confirm only a reference the staff member asked for. Keep `appointments.confirm` off an agent's token, or add an approval step for tools that write.

### LINE confirmations

One Strapi sends each LINE confirmation once. A visit's `sent` record stops a second send, and two sends at the same moment share one push, but only within one Strapi process. With more than one, add a claim row, LINE's `X-Line-Retry-Key` or an outbox (the plugin's README, [LINE confirmations](../strapi/src/plugins/maison/README.md#line-confirmations)).

### Strapi Enterprise

Nothing here needs Strapi Enterprise. If your license includes audit logs, they also record what admins do.
