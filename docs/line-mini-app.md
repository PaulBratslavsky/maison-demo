# Running Maison as a LINE MINI App

The app follows LINE's [LINE MINI App](https://developers.line.biz/en/docs/line-mini-app/quickstart/) design guidelines, so it can run as a LINE MINI App. In the talk, QBurst presents the LINE MINI App side. This page has the integration slide, what's ready for a MINI App, and how to run the app as one.

## The integration slide

**Slide: connecting a LINE MINI App**
1. The MINI App calls `liff.getIDToken()`.
2. oauth-mcp-manager exchanges it for a short-lived session, after LINE verifies it (RFC 8693).
3. The MINI App, and any agent working for that customer, calls the Maison tools on Strapi `/mcp`.
4. Staff confirm in Strapi, on the Maison board or through a staff agent. Strapi sends the customer's LINE confirmation at once, through the Messaging API. A verified MINI App could send it as a service message instead.

## What's ready for QBurst

- **This repo.** Clone it and run it (see the [Quick start](../README.md#quick-start)). [Option B](line-setup.md#option-b-the-real-app-inside-line) runs it inside LINE, and [Run it as a LINE MINI App](#run-it-as-a-line-mini-app) below runs it on your MINI App channel.
- **Token endpoint:** `POST {STRAPI}/api/strapi-oauth-mcp-manager/oauth/token`, as a form, with the LINE ID token. Its parameters and answers are in [Customer sessions](architecture.md#customer-sessions).
- **MCP:** `POST {STRAPI}/mcp` with `Authorization: Bearer <access_token>`. The customer tools, the staff tools and the error format are in [MCP tools](architecture.md#mcp-tools).
- **REST, for websites:** the catalog at `/api/maison/…` with no credentials, and the customer's own bookings with the same session (see [The REST API](architecture.md#the-rest-api)).
- **Confirmation:** when a visit is confirmed, whichever way, Strapi pushes the customer a flex message in the language they booked in, English or Japanese, with the Messaging API channel's token (`LINE_CHANNEL_ACCESS_TOKEN`, see [option A](line-setup.md#option-a-a-real-line-message-on-your-phone)), and records it. `pending_confirmations` returns the same message for each upcoming confirmed visit, for an agent that retries.
- **Channels:** the MINI App channel and the Messaging API channel must be in one provider.

## Run it as a LINE MINI App

A LINE MINI App is a LIFF app on a LINE MINI App channel, so this app runs as one with its LIFF ID and channel ID changed.

Who can create a MINI App channel depends on LINE's MINI App Policy and your region. For example, an unverified MINI App can be created by an organization with a Japanese corporate number or a Taiwan or Thailand tax ID, an individual business owner in Japan, or an individual in Japan, Taiwan or Thailand. The presenter's LINE account couldn't create one, so the demo runs on a LINE Login channel (option B).

Create both channels in the same provider. Otherwise user IDs won't match, and confirmations can't be delivered.
1. **A LINE MINI App channel,** with your region (Japan, Taiwan or Thailand, per the policy):
   - **Channel icon:** `liff/line/channel-icon.png`, drawn to LINE's icon spec: 130×130 px, with a logo between 54 and 76 px. `liff/scripts/render-channel-icon.mjs` redraws it.
   - **Channel name:** Maison, with no "LINE" in it, and a Japanese name under **Localization**.
   - **A description,** in English and Japanese, and your **privacy policy URL**.
   - **Web app settings:** endpoint URL `https://<your host>/`, scopes `openid` and `profile`. A MINI App's size is always Full.
2. **A Messaging API channel** (an Official Account), whose channel access token Strapi sends the confirmations with (option A). A verified MINI App can send service messages instead.

Then, in this repo:
- **Two values change.** Put the MINI App's LIFF ID and channel ID in `liff/.env` as `LINE_MODE_LIFF_ID` and `LINE_MODE_CHANNEL_ID`, put your host in `LINE_MODE_DOMAIN`, and follow [option B](line-setup.md#option-b-the-real-app-inside-line). Nothing else changes. To serve it from your own https host instead of ngrok, leave the tunnel out: run `npm run start:line`, check it first with `npm run tunnel -- --dry-run`, which runs every check and starts nothing, and only then put the app behind that host.
- **Use one pair, from one internal channel.** A MINI App channel has three internal channels, Developing, Review and Published, and each has its own LIFF ID and channel ID. Use Developing's while you test. oauth-mcp-manager accepts one channel at a time, so switch to Published's at launch.
- **Its URL.** An unverified MINI App opens at `https://miniapp.line.me/<LIFF ID>`. `https://liff.line.me/<LIFF ID>` opens it too, so the confirmations' links (`MAISON_LIFF_URL`) keep working. Its header shows the page's title, Maison, and your domain.

## Done for LINE's MINI App guidelines

- **The icon:** as above.
- **The safe area:** 34 px clear at the bottom in portrait, and 44 px at the sides and 21 px at the bottom in landscape, where the app fills the screen (`liff/app/globals.css`).
- **The loading icon:** LINE's own spinner, 30×30 px and centered, wherever the app waits (`liff/components/spinner.tsx`).
- **LIFF inside LINE:**
  - `liff.init()` runs at or below the endpoint URL.
  - Outside LINE the app never starts LINE Login. It shows an "Open in LINE" page instead, with a QR code of the page's LINE link (`liff/components/open-in-line.tsx`).
  - When an ID token expires (they last an hour), the app logs out and reloads, LINE's own pattern.

## Before LINE's review

These still need work before LINE's review:
- **People without LINE.** LINE asks that a MINI App work in an external browser without LINE Login. Every screen here needs a LINE session, so an external browser gets the "Open in LINE" page.
- **Performance.** LINE asks for a Lighthouse Performance score of 50 or more, measured on your deployment without LINE Login.
- **The policy and the review request:**
  - the LINE MINI App Policy
  - the channel description, and the privacy policy
  - for a reservation service, test scenarios in the review request

## LINE's pages

- [Get started with LINE MINI App](https://developers.line.biz/en/docs/line-mini-app/quickstart/)
- design: the [icon](https://developers.line.biz/en/docs/line-mini-app/design/line-mini-app-icon/), the [safe area](https://developers.line.biz/en/docs/line-mini-app/design/landscape/) and the [loading icon](https://developers.line.biz/en/docs/line-mini-app/design/loading-icon/)
- [settings shown to users](https://developers.line.biz/en/docs/line-mini-app/develop/configure-console/), and the [console guide](https://developers.line.biz/en/docs/line-mini-app/discover/console-guide/)
- [permanent links](https://developers.line.biz/en/docs/line-mini-app/develop/permanent-links/), and [external browsers](https://developers.line.biz/en/docs/line-mini-app/develop/external-browser/)
- the [performance guidelines](https://developers.line.biz/en/docs/line-mini-app/develop/performance-guidelines/), which set the Lighthouse score
- the [LINE MINI App Policy](https://terms2.line.me/LINE_MINI_App?lang=en)
