# Running with real LINE

In local mode, the app signs in a demo customer with LINE's LIFF mock, and nothing reaches a phone. Two options connect the demo to real LINE:

- **Option A** sends the LINE confirmation to your phone, through your own LINE Official Account.
- **Option B** runs the app inside LINE on your phone, signed in by LINE, through one ngrok tunnel.

Your LINE values (LIFF ID, channel IDs, access token, Official Account ID and ngrok domain) go only in the `.env` files. Keep them out of commits and chats.

## Option A: a real LINE message on your phone

1. In the [LINE Developers Console](https://developers.line.biz/console/), create a provider and an Official Account with the [Messaging API](https://developers.line.biz/en/docs/messaging-api/overview/). Check first that your account can create one from your region. With option B, use your LINE Login channel's provider: LINE gives each user a different ID in each provider.
2. Add the Official Account as a friend on your phone.
3. Copy **Your user ID** from the Messaging API channel's **Basic settings** into `liff/.env` as `NEXT_PUBLIC_DEMO_LINE_USER_ID`. The mock sign-in then acts as you, as that provider sees you. Restart the app. With option B, skip this step: you sign in as yourself.
4. Issue a channel access token, on the Messaging API channel's **Messaging API** tab. Put it in `strapi/.env` as `LINE_CHANNEL_ACCESS_TOKEN`, and restart Strapi. Keep it out of commits and chats: it sends messages as your Official Account.
5. Book a visit and confirm it on the board. Strapi pushes the confirmation to you at once, with LINE's push API, and records it:
   - the notice says the customer's LINE confirmation was sent
   - the board shows LINE sent
   - **My visits** shows "Confirmed · LINE sent" (確定 · LINEで送信済み in Japanese)
6. Let customers add Maison themselves, since a confirmation only reaches a customer who has added the Official Account as a friend:
   - **In the app:** put the Official Account's basic ID, with its `@`, in `liff/.env` as `NEXT_PUBLIC_LINE_OA_ID`, and rebuild the app. **Chat with Maison on LINE** then appears on **My visits**, on a visit's page, after a booking and, in the concierge, under the note for a question nothing recorded. It opens `https://line.me/R/ti/p/%40…`: a friend gets the chat with Maison, anyone else its add-friend screen. Under a hand-off Strapi recorded, **Send it in the LINE chat** opens `https://line.me/R/oaMessage/%40…/?…`, the chat with Maison with the question already typed in. Without the setting there's no button of either kind. LINE's links work in LINE on phones, not in LINE for PC.
   - **At sign-in (option B):** in LINE Developers, open the LINE Login channel's **Basic settings**, set **Linked LINE Official Account** to yours, and turn on the LIFF app's **Add friend option**. LINE then offers to add Maison when a customer first allows the app. With the account linked, the app also asks LINE whether the customer has added Maison, and if not, the button reads **Add Maison on LINE**.

The message's button opens the visit in the app, at `MAISON_LIFF_URL` followed by `/visits/<reference>`. In local mode `MAISON_LIFF_URL` is `http://localhost:3003`, which your phone can't open. With option B it's your LIFF URL, which opens the app inside LINE.

- **Without option A, leave `LINE_CHANNEL_ACCESS_TOKEN` empty in local mode.** The mock's customer is then a made-up user ID, and nobody would receive what Strapi pushes to it.
- **"LINE sent" means LINE accepted the message.** LINE's push API answers 200 even when it can't deliver, for example to a customer who has blocked the Official Account, so the board shows LINE sent then too.
- **When LINE refuses it,** or can't be reached, the row stays "not sent", and Strapi's log says why. Fix the cause, then press **Send again**.

## Option B: the real app inside LINE

Local mode runs on the LIFF mock. Option B runs the same app inside LINE on your phone, signed in by LINE: your own [LINE Login](https://developers.line.biz/en/docs/line-login/overview/) channel and LIFF app, on one public https origin from [ngrok](https://ngrok.com). The mock stays the default. This path was tested on a phone inside LINE on 1 October 2026: LINE sign-in, the catalog, a booking, and staff confirmation on the board.

How the parts connect:
- **One origin.** ngrok forwards your domain to the app on :3003, a production build. The app passes three of Strapi's paths on to Strapi: `/mcp`, the token endpoint (`/api/strapi-oauth-mcp-manager/oauth/token`) and `/uploads`. Strapi, with its admin, stays on your laptop. `MAISON_APP_ORIGIN` isn't needed, because the browser never calls Strapi on another origin.
- **The proxy passes on only what those calls need:** the headers they use, and request bodies up to 1 MB. A longer body gets 413 before any of it reaches Strapi. Answers stream through as Strapi writes them, and any other Strapi path, such as `/admin`, answers 404 from the app.
- **And only what the phone sends:** on `/mcp`, a customer session or no `Authorization` at all (anything else gets 401), and at the token endpoint, the token exchange (anything else gets 400).
- **Only LINE mode's build serves those paths.** A build for the LIFF mock, and `npm run dev`, answer 404 on them, so a tunnel left open after `npm run mode:local` reaches no Strapi that trusts the verify mock.
- **LINE verifies the ID tokens.** Strapi checks each one with LINE, for your channel, not with the local mock.
- **Your values stay in `liff/.env`:** `LINE_MODE_LIFF_ID`, `LINE_MODE_CHANNEL_ID` and `LINE_MODE_DOMAIN`. The scripts never print them. Keep them out of commits.

### Once: your LINE Login channel and LIFF app

1. Link your LINE Developers account (Business ID) to your LINE account. Only a linked account can sign in to a channel in **Developing**.
2. In the [LINE Developers Console](https://developers.line.biz/console/), create a provider and a LINE Login channel, with app type **Web app**. Name it Maison, for example: a channel's name can't contain "LINE". Leave it in **Developing**, so only its admins and testers can sign in.
3. **Basic settings → Channel icon:** upload `liff/line/channel-icon.png`.
4. **LIFF → Add:**
   - Size: Full
   - Endpoint URL: `https://<your ngrok domain>/`
   - Scopes: `openid` and `profile`
   - Add friend option: On (Normal), once the Official Account is linked (option A, step 6)
5. Get a free [ngrok](https://ngrok.com/download) account, install the agent, and add your authtoken (`ngrok config add-authtoken`). Your dev domain (`<name>.ngrok-free.dev`) is on ngrok's dashboard.
6. Add three lines to `liff/.env`:

   ```ini
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

`npm run setup` also mints a new ops token: see [Ops tools for an agent](ops-tools.md), if you connected one.

**Open the app inside LINE.** Run `npm run qr`, then scan the code with LINE's QR reader: the QR icon next to the search bar on LINE's Home tab. The iPhone Camera app may give the link to Safari instead. The code opens `https://liff.line.me/<your LIFF ID>`, and `npm run qr -- /visits` opens a given screen. It also saves the code in `liff/line/qr/`, as a PNG and an SVG.
- **If LINE opens links in Safari or Chrome:** in LINE, go to **Settings → LINE Labs** and turn off "Open links in your default browser". Outside LINE the app never signs in: it shows an "Open in LINE" page, with the QR code and, on a phone, a button.
- **The first time,** ngrok's free plan may show its warning page: tap **Visit Site**. ngrok remembers it for 7 days. If the app then shows an error, close it and open it again.
- **LINE asks you to allow the app,** with your channel's icon and name.
- **The app's language** follows the LINE app's language, until you switch it with **EN**/**JA**.
- **The Strapi admin** stays at http://localhost:1338/admin on the laptop. Strapi prints your public URL as its own, but the admin isn't served there.

Who can sign in:
- **While your LINE Login channel is in Developing,** only its Admins and Testers can (LINE Developers Console → your channel → **Roles**).
- **Publishing the channel opens it to anyone with LINE.** Every visit then reaches your laptop through the tunnel, the concierge answers on your model or API key, and each visitor becomes a customer in the demo database:
  - **Each sign-in** stores a session in oauth-mcp-manager: the visitor's full LINE user ID (`line:U…`), a hash of the session token (not the token), the app's client ID, and when the session expires (an hour later) and was last used. Its hourly cleanup deletes expired sessions.
  - **Each visit request** stores a Maison appointment: the same full LINE user ID, the boutique, the products, the date and time, the visitor's note if they wrote one, a reference, and where it was made (`createdVia`: `app`, `concierge` or `web`). It stays until you reset the demo appointments. Each LINE confirmation Strapi sends, or an agent records, adds a log row: the reference, sent or failed, the time and a note, with no LINE user ID. Reset deletes those too.
  - **No other personal data:** no name, picture or email, and not the ID token. Strapi checks the ID token with LINE and keeps only the user ID. Staff see it masked (`line:U4af…88`), and the admin API never returns it. Strapi reads the full ID to send the LINE confirmation, and `pending_confirmations` returns it to the ops token (see [Ops tools for an agent](ops-tools.md)).
- **The QR image** holds your LIFF ID and stays out of git: `liff/line/qr/` is in `.gitignore`.

`npm run tunnel` refuses to start unless all of these hold:
- `strapi/.env` has no `LINE_VERIFY_URL`, and both `.env` files are in LINE mode
- nothing answers on the verify mock's port, 127.0.0.1:4545. `npm run dev` starts the mock, which is why LINE mode uses `npm run start:line`.
- the app on :3003 is the LINE build that `npm run start:line` serves: its `X-Maison-Liff` header says `line`. A build for the LIFF mock says `mock`, and a dev server in LINE mode says `line-dev`.
- the running Strapi, reached through the app, refuses a forged ID token with `invalid_grant`, because LINE checks it. The tunnel doesn't start either when Strapi can't be reached, or can't check the token.

It refuses because, with the local verify mock behind a tunnel, anyone could sign in as any customer.

`npm run tunnel -- --dry-run` runs the checks alone. ngrok runs with `--inspect=false`, so its local inspector keeps no copy of customers' tokens. In ngrok's dashboard, leave Traffic Inspector's full capture off.

### Back to local mode

Stop ngrok first (Ctrl-C in its terminal). Then stop the app and Strapi (Ctrl-C in each terminal), and run:

```bash
npm run mode:local
npm run dev          # Strapi, the app and the verify mock, as in local mode
```

`npm run mode` says which mode you're in. `npm run dev` and `npm run dev:app` refuse to start while the app is in LINE mode. The tests (`npm run test:e2e`, `npm run test:live`) need local mode, and refuse to run in LINE mode.
