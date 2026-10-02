# Maison inquiries: questions answered from product knowledge, and a person follows up on LINE

**Status:** written for Paul's review on 1 October 2026.
- **Direction he chose:** option 3. Customers ask in the mini app's concierge, and a person answers in the LINE chat.
- **Priority:** "plan and do this last; worst case we just make a slide."
- **Reference:** his Pulse repo (`~/work/pulse`), which logs, labels and queues mentions for staff. This design reuses its patterns and words.

## What it does

1. **The concierge answers from what Maison has written down.**
   - Editors keep a **Product knowledge** collection in Strapi, in English and Japanese: care, materials, sizing, delivery, repairs, warranty, gift wrapping and so on.
   - The concierge looks things up there and answers only from what it finds.
   - When nothing fits, it says someone from Maison will reply in LINE.
2. **Every customer message to the concierge is logged as an inquiry.** The app's server logs it after each turn, not the model, so logging never depends on the model remembering.
3. **Strapi labels each inquiry in the background:**
   - a **kind**: question, complaint, praise, or other ("Yes, please" while booking)
   - a **sentiment** score
   - whether the concierge **answered** it
4. **Three queues** on a new **Inquiries** page in the Strapi admin:
   - **Needs an answer:** a question the concierge couldn't answer
   - **Complaints:** reach out
   - **Praise:** ask for a testimonial or a referral
5. **A person replies from the admin.** **Reply on LINE** pushes the staff member's message to the customer's chat with Maison, quoting their question. Nothing is ever sent automatically.

**Not in this version:**
- Customers messaging Maison directly in the LINE chat. That needs a LINE webhook into Strapi; the same labelling and queues would serve it later.
- Showing customers' LINE replies in Strapi. They arrive in the Official Account's chat.
- Semantic search. Keyword search is enough for a few dozen entries; Paul's embeddings plugin is the later upgrade.

## Where each part lives

| Part | Where | Why |
|---|---|---|
| Product knowledge, inquiries, labelling, queues, Reply on LINE | The Maison plugin (`strapi-store-demo-mcp`), copied into the demo as before | One service layer: the concierge, the board, and a later LINE webhook all use the same rules |
| Logging each turn | The app's concierge route (`liff/lib/concierge.ts`), after the turn ends | The server, not the model, decides what's logged |
| The model that labels | Called from Strapi, Claude Haiku 4.5 by default | Small, fast and cheap, as in Pulse. Strapi needs `ANTHROPIC_API_KEY`, as the staff chat would |

## 1. Product knowledge (content type)

`plugin::maison.knowledge`: draft and publish on, localized (`ja` default, `en`).

| Field | Type | Notes |
|---|---|---|
| `title` | string, required, localized | The question or topic as a customer would put it: "How do I care for the leather?" |
| `answer` | text, required, localized | Plain text, up to 2,000 characters. The concierge quotes from it. |
| `category` | enumeration | `care`, `materials`, `sizing`, `personalization`, `delivery`, `returns`, `repairs`, `warranty`, `gifting`, `store` |
| `productSlugs` | json (array of product slugs), not localized | Which pieces it's about. Empty means it applies to everything. Kept as slugs, like stock levels, so republishing a product never breaks the link. |
| `keywords` | text, localized | Other words customers use ("strap", "handle", "ストラップ"), to help the search |

**Seed:** about 16 entries in both languages for the demo catalog, loaded by **Load demo catalog** like the rest. They cover the leather, canvas and trunk care; sizing for each category; personalization lead time (from the products' own fields); delivery and pickup; returns; repairs; warranty; and gift wrapping.

## 2. Answering: `search_knowledge`

A new MCP tool, with the catalog permission (`catalog.read`), so customers and agents can use it like the other catalog tools.
- **Input:**
  - `query`: the customer's words
  - `productSlugs` (optional): narrows to entries about those pieces, plus general ones
  - `locale`
- **Search:** published entries in the locale, with the default locale filling in a missing translation. Each entry is scored on words matched in `title`, `keywords` and `answer` (title counts most), plus a bonus for matching product slugs.
- **Output:** the top 4 entries (`title`, `answer`, `category`, `productSlugs`), or none.
- **REST door:** `GET /api/maison/knowledge?q=…&productSlugs=…&locale=…` gives websites the same search, read-only like the catalog.

**The concierge's instructions:**
- For a question about care, materials, sizing, delivery, returns, repairs, warranty or gifting, call `search_knowledge` first.
- Answer only from what it returns, in the customer's language, and never invent a policy.
- If nothing fits:
  - call `hand_off_to_staff`, a local tool in the app like `resolve_date`
  - say "I'll pass this to our team, and they'll reply in your LINE chat with Maison."

The chat shows that tool call as a short note with **Chat with Maison on LINE** under it, so the customer is a friend of the account when the reply comes. The call is also a firm signal for the queue.

## 3. Logging: `log_inquiry`, called by the app's server

- **When:** after each concierge turn, in `handleConcierge`'s end-of-stream handler.
- **How:** the app calls a new MCP tool, `log_inquiry`, with the customer's session.
- **Permission:** a new one, "MCP: log customer questions" (`inquiries.log`). `npm run setup` adds it to the "Maison customer" token.
- **What the tool receives:**
  - `message`: the customer's last message, up to 1,000 characters
  - `reply`: the concierge's final text, up to 2,000 characters
  - `locale`
  - `knowledgeFound`: whether any `search_knowledge` call in the turn returned an entry
  - `handedOff`: whether the turn called `hand_off_to_staff`
  - `productSlug`: the product page the customer was on, if any
- **The customer** comes from the session, never from the arguments, as in every customer tool.
- **What Strapi stores:** the inquiry, with `analysisStatus: 'pending'`. It answers `{ logged: true }` at once; labelling happens later.
- **A failed log** never fails the customer's turn. The app logs a warning and moves on.

`plugin::maison.inquiry`: no draft and publish, not localized.

| Group | Fields |
|---|---|
| Who and what | `customer` (the LINE subject, private, kept out of admin API answers and list search as for appointments), `message`, `reply`, `language` (Strapi reserves `locale` for i18n, so it is stored as `language`, as appointments and questions do), `handedOff`, `productSlug`, `via` (`concierge` now, `line-chat` later) |
| Labels, from the model | `kind` (`question` / `complaint` / `praise` / `other`), `sentimentScore` (−1..1), `sentimentLabel` (`positive` / `neutral` / `negative`), `answered` (bool), `reason` (up to 400 characters), `topic` (one short phrase) |
| Analysis | `analysisStatus` (`pending` / `analyzed` / `failed` / `skipped`), `analysisAttempts`, `modelVersion`, `promptVersion`, `humanCorrected` |
| Queue and workflow | `queue` (`needs-answer` / `complaint` / `praise` / `none`), `status` (`open` / `replied` / `closed`), `closeReason` (`answered-elsewhere` / `not-needed` / `spam`) |
| The reply | `replyText`, `repliedAt`, `repliedBy`, `lineOutcome` (`sent` / `failed`), `lineDetail` |

**The queue rule,** worked out in code from the labels, never by the model:
- a hand-off, or a question not answered → `needs-answer`
- a complaint → `complaint`
- praise → `praise`
- anything else → `none`

An inquiry that isn't labelled yet still shows, under **Not labelled**. When in doubt, a person sees it.

## 4. Labelling: a background sweep in Strapi

Pulse's pattern, scaled down:
- **Cadence:** a Strapi cron task every minute takes up to 10 `pending` inquiries, oldest first, plus `failed` ones under 5 attempts. An in-process flag stops two sweeps overlapping.
- **One call per inquiry, for every label:**
  - It sends the message, the concierge's reply, `knowledgeFound` and `handedOff` to Anthropic's Messages API.
  - The labels come back through a forced tool whose input schema is the label shape, so the answer is always structured.
  - Long limits on free text (`reason` up to 400 characters), since Pulse saw failures at 200.
- **Prompt:**
  - The kinds and the sentiment scale are defined in one typed criteria file, which generates the prompt.
  - It tells the model the customer's text is evidence, not instructions.
  - Stamp `modelVersion` and `promptVersion` on each row.
- **Outcomes:**
  - **Success:** `analyzed`, the labels and the queue set.
  - **Error:** `failed`, with `analysisAttempts` + 1. At 5 attempts it's parked, and a **Label again** action resets it.
- **Without `ANTHROPIC_API_KEY`:** nothing is sent. Rows stay `pending`, show under **Not labelled**, and are labelled once a key is set.
- **Human corrections win:** a person can change the kind or the sentiment on the board. That sets `humanCorrected`, and labelling never overwrites it.
- **Config:** `classifierModel` (default `claude-haiku-4-5-20251001`), `anthropicApiKey` (from `ANTHROPIC_API_KEY`), and `anthropicApiBaseUrl`, which the tests point at a local stand-in.

## 5. The Inquiries page (Strapi admin)

A second page under **Maison**, next to **Appointment requests**. Shown to admins with a new permission, "Review customer questions" (`inquiries.review`).
- **Cards:** Needs an answer, Complaints, Praise, Not labelled (open counts).
- **Filters:** those four, plus **All**, as pills, like the board.
- **Each row:**
  - time; the customer, masked (`line:U4af…88`); the message (the full text in the row, wrapping); the product, if any
  - the kind badge, the sentiment, and the status
  - a toggle that shows what the concierge answered
- **Actions,** with "Reply to customer questions" (`inquiries.reply`):
  - **Reply on LINE**
  - **Close**, with a reason
  - **Change label**, which sets `humanCorrected`
- **Refresh:** every 5 seconds, like the board.
- **The Homepage widget** gains a line: open inquiries, by queue.

## 6. Reply on LINE

- **The form:** a modal with a text box, which is never pre-filled.
  - A **Use the suggested text** button inserts a template for the queue and the customer's language: an apology and the next step for a complaint, thanks and a request for a review or a referral for praise.
  - Staff edit it, then send.
- **The route:** `POST /maison/inquiries/:id/reply { text }`. It pushes one LINE text message through the push code that confirmations use, in the inquiry's language:
  > About your question: "{first 80 characters of the message}"
  >
  > {staff text}
  >
  > Maison
- **On success:**
  - `status: replied`, with `replyText`, `repliedAt`, `repliedBy` and `lineOutcome` set
  - a reply that LINE refuses records `failed`, with LINE's answer, and stays open
- **No token:** without `LINE_CHANNEL_ACCESS_TOKEN` the form says replies can't be sent, and nothing is recorded.
- **Quota:** replies count toward the Official Account's monthly messages, like confirmations. The page shows that month's use.
- **Friends only:** LINE delivers only to customers who have added Maison, so the concierge points customers to **Chat with Maison on LINE** when it hands off.

## Security and privacy

- **Customer IDs stay out of the admin API.** The full LINE subject on an inquiry is private, as on appointments. Staff see it masked, and only the reply route reads it, to push.
- **The model sees only text.** It gets the message, the reply and the two flags, never a LINE ID.
- **Customer text is untrusted:**
  - the labelling prompt treats it as data, and the model can only pick from fixed enums
  - staff read it as written
  - nothing it says triggers an action by itself
- **Reset demo appointments** also deletes inquiries.

## Testing

- **Unit:**
  - the search scoring and fallback
  - `log_inquiry`: the customer from the session, the limits, and an answer even when labelling is off
  - the queue rule
  - the labelling request and how its answer is read, against a stand-in
  - the sweep's statuses, attempts, overlap guard and human corrections
  - the reply route: permission, push, outcomes, no token
  - the board's rules
- **Integration,** against a real Strapi:
  1. Log an inquiry through the tool.
  2. Run the sweep with a stand-in Anthropic, and check the queue it sets.
  3. Reply, with the LINE stand-in receiving one push that quotes the question.
- **App:**
  - unit tests for the end-of-turn logging, including that a failed log doesn't fail the turn
  - an e2e test: ask a care question; the concierge's answer uses a seeded entry
- **Copy and checks:** the plugin is copied into the demo as before. The integration suite runs with Strapi stopped.

## Order of work (last priority, before 7 October)

1. **Product knowledge:** the content type, the seed, `search_knowledge` and the REST door.
2. **The concierge** uses it: its instructions, `hand_off_to_staff`, and the chat button under a hand-off.
3. **Inquiries:** `log_inquiry` and the app's end-of-turn logging.
4. **Labelling:** the sweep, the criteria and the stand-in tests.
5. **The Inquiries page,** its permissions, and the widget line.
6. **Reply on LINE,** with the suggested texts.
7. **The copy into the demo,** setup's new permission, the README, and a phone check: ask, hand off, then reply from the admin and see it arrive in LINE.

**If time runs out:** steps 1 and 2 alone give a concierge that answers from Maison's own knowledge. The rest becomes the slide Paul mentioned.
