# Deploying and running in production

The app and Strapi deploy separately: the app in `liff/` to Vercel, and Strapi in `strapi/` to Strapi Cloud. This page has the steps on Strapi Cloud and the notes for running Maison in production.

## Where each part runs

- **The app** is a Next.js project on [Vercel](https://vercel.com), with `liff/` as the project's root directory. `liff/vercel.json` runs its server in the `iad1` region (Washington, D.C.), close to the Strapi Cloud project: change it to the region nearest yours. The app's settings are the Vercel project's environment variables, with the names in `liff/.env.example`. `liff/.vercelignore` keeps every `.env` file out of an upload.
- **Strapi** runs on [Strapi Cloud](https://strapi.io/cloud), with `strapi` as the project's **Base directory** (see Strapi's [Project deployment](https://docs.strapi.io/cloud/getting-started/deployment) page). `strapi/package.json` includes the `pg` driver for PostgreSQL. Strapi Cloud runs with `NODE_ENV=production`, so Strapi ignores `LINE_VERIFY_URL` there, and LINE verifies every ID token (`strapi/config/plugins.ts`).

## Strapi Cloud steps

Never run `npm run setup` against Strapi Cloud. Do these steps by hand:

1. **Node version.** The AI SDK needs Node 22.12 or later. Strapi Cloud's Node version is set by hand under **Configuration** → **Basic information**.
2. **Labelling.** Set `AI_API_KEY` (an Anthropic key) under the project's **Variables**, and redeploy. Leave `AI_BASE_URL` unset there.
3. **The "Maison customer" token** needs "MCP: hand questions to staff" (`plugin::maison.questions.ask`) and "MCP: log customer inquiries" (`plugin::maison.inquiries.log`). Tick both on that token. When the token's owner is a narrow service admin ([The customer token](#the-customer-token)), add both to the owner's role first.
4. **The Public role** needs Maison's `knowledge.find` for product knowledge over REST (`/api/maison/knowledge`). A setup run from before product knowledge doesn't grant it, so tick it under **Settings → Users & Permissions plugin → Roles → Public**. The concierge doesn't need it: it searches through MCP.
5. **Product knowledge.** On the Maison page, press **Load demo catalog** under **Demo data**: on a new database, and on one whose catalog was loaded before product knowledge existed. It adds Maison's 16 product knowledge entries, in English, when there are none, and leaves an existing catalog alone. On a new database it also loads the catalog.

## Production notes

### Customer questions

The staff follow-up: the concierge hands questions to Maison's client advisors, who answer them on LINE.

- **The "Maison customer" token** needs "MCP: hand questions to staff" (`plugin::maison.questions.ask`). `npm run setup` adds it locally. On Strapi Cloud, tick it by hand (step 3 above).
- **Staff** need "Read customer questions" to see the **Questions** tab, and "Answer customer questions on LINE" for its buttons.
- **Local checks with a LINE stand-in.** `MAISON_LINE_API_BASE_URL` points Strapi at a stand-in for LINE's Messaging API, so nothing reaches a phone. Start the stand-in with `npm run line:stand-in` (on 127.0.0.1:4010, logging what Strapi pushes to `strapi/.tmp/line-stand-in.jsonl`), then Strapi with `MAISON_LINE_API_BASE_URL=http://127.0.0.1:4010 LINE_CHANNEL_ACCESS_TOKEN=stand-in npm run dev:strapi`. Strapi sends and looks up nothing without a token, and the stand-in accepts any. Leave `MAISON_LINE_API_BASE_URL` unset everywhere else.

### Inquiries

- **The "Maison customer" token** needs "MCP: log customer inquiries" (`plugin::maison.inquiries.log`), or the app logs nothing. `npm run setup` adds it locally. On Strapi Cloud, tick it by hand (step 3 above).
- **Staff** need "Review customer inquiries" to see the **Inquiries** tab and widget, and "Reply to customer inquiries on LINE" for its buttons.
- **Labelling** needs `AI_API_KEY` (step 2 above) and Node 22.12 or later (step 1).
- **The LINE stand-in** also answers the month's quota: 200 messages, and the pushes it took since it started.

### Staff

Give staff an admin role with the Maison actions they need (`catalog.read`, `appointments.review`, `appointments.confirm`) instead of Super Admin.

### The customer token

The "Maison customer" token belongs to a dedicated service admin with a narrow role. A token's permissions are limited to its owner's, so a narrow owner keeps the token from being given more by mistake. That role needs "MCP: hand questions to staff" and "MCP: log customer inquiries" too: a token can't hold a permission its owner's role lacks, so add them to the role, then tick them on the token.

### LINE sign-in and origins

- **Never set `LINE_VERIFY_URL`** in production.
- **Serve everything over https,** with `PUBLIC_URL` set to the public origin: the app's, when the app passes Strapi's paths on as in [option B](line-setup.md#option-b-the-real-app-inside-line).
- **`MAISON_APP_ORIGIN`** is only for a website on another origin that calls Strapi directly, from the browser: it adds that origin to Strapi's CORS.
- **Bind to 127.0.0.1** unless a proxy in front needs otherwise. The demo does it for Strapi, the app and the verify mock.

### The Public role

The Public role reads the catalog and the Home page over REST, because `npm run setup` grants it six actions on every run: the five catalog actions and `api::home-page.home-page.find`. If your catalog isn't public, remove its five under **Settings → Users & Permissions plugin → Roles → Public**, give websites an API token instead, and remove them from `PUBLIC_ACTIONS` in the setup script. Without the Home page's `find`, the app shows its built-in Home text.

### The REST API's customer routes

They skip two of `/mcp`'s checks (see [The REST API](architecture.md#the-rest-api)). Keep sessions short, with oauth-mcp-manager's `endUserAccessTokenTtl`.

### Staff agents read what customers wrote

`appointment_requests` gives a staff agent customers' notes, up to 500 characters each, which could try to instruct the model. The tool descriptions tell it to treat notes as information, and to confirm only a reference the staff member asked for. Keep `appointments.confirm` off an agent's token, or add an approval step for tools that write.

### LINE confirmations

One Strapi sends each LINE confirmation once. A visit's `sent` record stops a second send, and two sends at the same moment share one push, but only within one Strapi process. With more than one, add a claim row, LINE's `X-Line-Retry-Key` or an outbox (the plugin's README, [LINE confirmations](../strapi/src/plugins/maison/README.md#line-confirmations)).

### Strapi Enterprise

Nothing here needs Strapi Enterprise. If your license includes audit logs, they also record what admins do.
