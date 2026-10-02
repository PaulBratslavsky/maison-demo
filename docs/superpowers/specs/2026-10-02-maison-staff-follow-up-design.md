# Maison: staff follow up on questions the concierge can't answer

**Status:** proof of concept, designed and built overnight on 2–3 October 2026 for Paul's review. Local only, on its own branches (`feat/maison-follow-up` in both repos). Nothing merges into `main` before Paul and Claude review it together.
**Builds on:** product knowledge (`docs/superpowers/plans/2026-10-02-maison-product-knowledge.md`, steps 1–2 of `2026-10-01-maison-inquiries-design.md`). It covers a cut-down version of that spec's steps 3, 5 and 6.
**Research:** best practices for handing an AI conversation to a person, and what LINE Official Accounts allow, read on 2 October 2026. The full report, with sources, is in Paul's morning notes folder (`handoff-research.md`). What it changed is under "What the research changed".

## What Paul asked for

> "if there is a question we can't answer it should mark it for staff, and staff should have the ability to follow in LINE chat, like send a notification 'Jane is aware of your question and will respond as soon as she knows the answer', then she joins the chat"

> "when looking at single products folks can ask questions about the product. If no similar response in knowledge base, question gets recorded, real human response. Then real human can update knowledge base in their interaction."

## The loop

Ask, answer from knowledge or from a person, and the person's answer becomes knowledge.

1. **Ask about this piece.** A product page gets **Ask about this piece**. It opens the concierge with that piece in context, so "Can it hold a watch?" means that piece.
2. **Answered from knowledge** when an entry fits, as product knowledge already does.
3. **Otherwise the question goes to staff.** The concierge calls `hand_off_to_staff`. Strapi records the question for the signed-in customer, with the piece, and gives it a reference such as `Q-4821`.
4. **The customer is told exactly what happens next:** the concierge has no reliable answer, Maison's client advisors have the question, and they reply in the LINE chat with Maison between 11:00 and 20:00, Japan time. A button opens that chat with the question already typed in.
5. **Staff see the question on the Maison page,** under **Customer questions**: when it came in, the customer's LINE name, the piece, the question, why it was handed off, and its status.
6. **Let them know** sends one LINE message in the staff member's own name: "Hello, this is Jane, a client advisor at Maison. Thank you for your question about the Jewelry Coffret… I'm looking into it and will reply here in this chat as soon as I can." The question is then taken by Jane.
7. **Answer** sends the answer on LINE in Jane's name. With **Add to product knowledge** ticked (the default), it also becomes a published knowledge entry for that piece. The next customer who asks gets the answer at once.
8. **Jane carries on in the LINE chat,** in LINE Official Account Manager, once Paul turns chat on.

## What the research changed

| Finding | What the POC does |
|---|---|
| A hand-off must say what happens next: no reliable answer, who has the question, where and when they reply. Promise a reply only once the question really reaches staff. | The concierge says all four, and only after Strapi has recorded the question. The hours (11:00–20:00) are the boutiques' own opening hours in the catalog. |
| Never make a customer fight to reach a person. | Asking for a person hands off at once, with the reason "asked for a person". |
| Don't make customers repeat themselves. | The LINE button opens the chat with the question already typed in. |
| On a free, unverified Official Account, staff can't start a chat. They only see people who have written to the account. | The typed-in question is how the customer writes first. Once they tap send, Jane sees the chat in LINE Official Account Manager and can reply there, for free. |
| There's no supported link from Strapi into one customer's chat. Staff find a chat by the customer's LINE name. | Strapi saves the customer's LINE display name with the question, and shows it to staff. |
| The first message should come from a named person, in the first person, in the customer's language, and restate the question. | Both messages do, signed with the staff member's first name from their Strapi account. |
| LINE's `sender` property (a staff name on the bubble) works only for messages sent through the API. Jane's own chat replies would still show as Maison. | Not used. Jane is named in the text. |
| Each push uses one of the free plan's 200 messages a month. Chat replies are free. | Only the two staff actions push. Nothing pushes automatically. |
| The bot should stay quiet in the chat: no automatic replies, no automatic "read". | The POC adds no webhook and no chat automation. |

Left for later, from the research: an always-visible "Ask an advisor" button, `liff.requestFriendship()` for customers who haven't added Maison, a hand-off note with the conversation, a reply-time target per question, and a verified account (needed to start chats and to see all friends).

## The customer's side (the app)

### Ask about this piece

- The product page gets a secondary button under the details, **Ask about this piece** (「この商品について質問する」). It links to `/concierge?product=<slug>`.
- With a product, the concierge's intro reads "Ask me anything about this piece: care, sizing, personalization, delivery." (「この商品について、お手入れ、サイズ、名入れ、配送など、何でもお尋ねください。」). Its suggestions become "Can I have it personalized?", "How do I care for it?" and "Which boutique has it in stock?" (「名入れはできますか？」「お手入れ方法を教えてください。」「どのブティックに在庫がありますか？」).
- The page sends the slug with each turn. The server checks it is a slug, and adds one instruction: the customer is on that piece's page, so "it" and "this" mean that piece, and its slug goes to `view_product`, to `search_knowledge` as `productSlugs`, and to `hand_off_to_staff` as `productSlug`. Anything that isn't a slug is ignored.

### The hand-off

- **`hand_off_to_staff` moves into Strapi,** as a Maison MCP tool, so Strapi records the question. The app's local tool of the same name goes. The chat line becomes `MCP · hand_off_to_staff ✓`.
- **The concierge's rules** (rules 9 and 10 in `lib/concierge.ts`):
  - When no knowledge entry answers, call `hand_off_to_staff` with the customer's question in their own words, the reason `no_answer`, and the piece's slug when it's about one piece. Then say, in one or two sentences, that there's no reliable answer, the question is with Maison's client advisors, and they'll reply in the LINE chat.
  - When the customer asks for a person, call it at once with the reason `asked_for_person`.
  - Hand off a question once. If it's already with the advisors, say so.
- **Under the hand-off's tool line,** a note and a button replace step 2's note:
  - English: "Your question is with Maison's client advisors (Q-4821). They reply in your LINE chat with Maison, 11:00–20:00 Japan time."
  - Japanese: 「ご質問（Q-4821）をMaisonのクライアントアドバイザーにお伝えしました。11:00〜20:00（日本時間）に、MaisonのLINEトークでご返信いたします。」
  - The button, **Send it in the LINE chat** (「LINEトークで送る」), opens `https://line.me/R/oaMessage/<basic ID>/?<text>`, the chat with Maison with this already typed in: "Question for a Maison advisor (Q-4821): <the question>" (「アドバイザーへの質問（Q-4821）：<the question>」). Without the setting `NEXT_PUBLIC_LINE_OA_ID`, there's no button.
- **A failed hand-off** (the tool returns an error) shows the usual red tool line, and the concierge says what the error's hint says. Step 2's plain chat button stays as the fallback.

## The staff side (Strapi)

### Customer questions on the Maison page

- A new section under the appointment requests: **Customer questions**, refreshed every 5 seconds, with the filter **Open** (open and taken, the default), **Answered** or **All**. Newest first.
- Columns: Reference, Asked (Tokyo time), Customer (LINE name, with the masked ID under it), Piece, Question, Why ("No answer in product knowledge" or "Asked for a person"), Status, and the actions.
- **Status:** Open; Taken by Jane; Answered by Jane, with "Added to product knowledge" when it was. When the last LINE message failed, the row says so, in LINE's words.
- **Let them know,** on an open question: sends the acknowledgement. The question becomes taken.
- **Answer,** on an open or taken question: a dialog with the question, a text box (never pre-filled), **Add to product knowledge** (ticked), and a category, needed only while the box is ticked. **Send on LINE** sends the answer. The hint under the text box: "It's sent on LINE in your name. With the box ticked, it's also saved as product knowledge, so write it for any customer."
- Only staff who may answer see the buttons.

### Permissions

| Action | Name in Strapi | Who |
|---|---|---|
| `plugin::maison.questions.ask` | MCP: hand questions to staff | The "Maison customer" token. `npm run setup` adds it locally. On Strapi Cloud, Paul ticks it on that token. |
| `plugin::maison.questions.read` | Read customer questions | Staff. Shows the section, and lets them open the page. |
| `plugin::maison.questions.answer` | Answer customer questions on LINE | Staff. Shows the buttons. |

The names end in `ask`, `read` and `answer`, never `review`: the admin's `useRBAC` names its flags after the last word of each action, and `review` is the appointments' flag already.

### Admin routes

- `GET /maison/questions?status=open|answered|all` (read): `{ questions: StaffQuestionView[] }`.
- `POST /maison/questions/:reference/notify` (answer): sends the acknowledgement.
- `POST /maison/questions/:reference/answer` (answer), body `{ text, addToKnowledge, category }`: sends the answer, and saves it as knowledge.

| Outcome | Notify | Answer |
|---|---|---|
| Sent | 200 | 200, with `knowledgeDocumentId` when it was saved |
| Bad input | 400 | 400 (text 1–2,000 characters, a category while `addToKnowledge` is true) |
| No such question | 404 | 404 |
| Taken already (notify), or answered already | 409 | 409 |
| LINE refused or didn't answer | 502, and the question is unchanged | 502, unchanged, nothing saved |
| No LINE token in Strapi | 503 | 503 |

The staff member's name is the signed-in admin's first name. Without one, the messages speak for "Maison's client advisors".

### Reset

**Reset demo appointments** becomes **Reset demo appointments and questions**. It also deletes every question, and the knowledge entries their answers added, so the demo can run again from the start. The seeded knowledge stays.

## The LINE messages

Text messages, in the question's language, quoting the question cut to 80 characters (with "…").

**Let them know**, English:
> Hello, this is Jane, a client advisor at Maison. Thank you for your question about the Jewelry Coffret: "Can it hold a watch?" I'm looking into it and will reply here in this chat as soon as I can.
> Jane, Maison

Japanese:
> Maisonのクライアントアドバイザー、Janeでございます。ジュエリー・コフレについてのご質問「腕時計は入りますか？」をいただき、ありがとうございます。ただいま確認しておりますので、分かり次第こちらのトークでご連絡いたします。
> Maison　Jane

**Answer**, English:
> Hello, this is Jane, a client advisor at Maison. Thank you for your question about the Jewelry Coffret: "Can it hold a watch?"
>
> (Jane's answer)
>
> If anything else comes to mind, just reply here.
> Jane, Maison

Japanese:
> Maisonのクライアントアドバイザー、Janeでございます。ジュエリー・コフレについてのご質問「腕時計は入りますか？」をいただき、ありがとうございます。
>
> (Jane's answer)
>
> ほかにもご不明な点がございましたら、こちらのトークにお気軽にご返信ください。
> Maison　Jane

- Without a piece, "about the Jewelry Coffret" (「ジュエリー・コフレについての」) is left out.
- Without a staff first name: "Hello, this is Maison's client advisor team." and the sign-off "Maison" (「Maisonのクライアントアドバイザーでございます。」 and 「Maison」).

## The data

### `plugin::maison.question`

Not localized, no draft and publish, and hidden from the Content Manager and the Content-Type Builder, since it holds customers' LINE IDs.

| Field | Type | Notes |
|---|---|---|
| `reference` | string, required | `Q-1234`. Unique among questions. |
| `customer` | string, required, private | The LINE subject, from the session. Staff only see it masked. |
| `customerName` | string, up to 100 | The customer's LINE display name when the question came in, if LINE gave one. |
| `question` | text, required, up to 1,000 | The customer's words. |
| `reason` | `no_answer` or `asked_for_person` | |
| `language` | `ja` or `en` | For the LINE messages and the knowledge entry. |
| `productSlug` | string | Only a published product's slug. Anything else is dropped. |
| `status` | `open`, `taken` or `answered` | |
| `staffName` | string, up to 100 | Who took it, then who answered it. |
| `takenAt`, `answeredAt` | datetime | |
| `answer` | text, up to 2,000 | |
| `knowledgeDocumentId` | string | The knowledge entry the answer became. |
| `lineOutcome` | `sent` or `failed` | The last message's outcome. |
| `lineDetail` | string, up to 500 | LINE's answer when it failed, never the token. |

### The knowledge entry an answer becomes

In the question's language, published at once: the question as its title (cut to 200 characters), the answer, the category staff picked, the piece's slug in `productSlugs` (or none), and no keywords. The title carries most of the search weight, so a customer asking the same thing in other words still finds it.

## The tool: `hand_off_to_staff`

- **Permission:** `questions.ask`.
- **Input:** `question` (1–1,000 characters, the customer's own words), `reason` (`no_answer` by default, or `asked_for_person`), an optional `productSlug`, and `locale`.
- **The customer comes from the session,** never from the arguments, as in every customer tool.
- **A limit:** five questions per customer still open or taken. Past that: `too_many_open_questions`, with the hint to tell the customer their earlier questions are with the advisors, who will reply in the LINE chat.
- **An unknown `productSlug` never refuses the hand-off.** It's dropped, so the question still reaches staff.
- **The LINE name** comes from LINE's Get profile API, with Strapi's channel token, within 3 seconds. Without a token, or when LINE doesn't answer, the question is saved without it.
- **Output:** `{ question: { reference, status: "open", product: { slug, name } | null } }`.
- **Known limit of the POC:** the record depends on the model calling the tool. The full spec logs every turn from the app's server instead.

## The code

| Part | Where |
|---|---|
| `pushMessages` and `getProfile`, out of `line-confirmations.ts`, which keeps its behaviour | `server/src/domain/line-push.ts` |
| The question content type, the `questions` service, the message builder | `server/src/content-types/question/`, `server/src/services/questions.ts`, `server/src/domain/question-messages.ts` |
| `hand_off_to_staff` | `server/src/mcp/tools/hand-off-to-staff.ts` |
| The admin routes and the section | `server/src/controllers/questions.ts`, `admin/src/components/QuestionsList.tsx`, `admin/src/components/AnswerDialog.tsx` |
| The app | `lib/concierge.ts`, `lib/tool-view.ts`, `lib/line-chat.ts`, `components/chat-parts.tsx`, `app/concierge/page.tsx`, `app/products/[slug]/page.tsx`, `lib/copy.ts` |
| Setup, and a LINE stand-in for local tests | `strapi/scripts/maison-setup.mjs`; `strapi/config/plugins.ts` reads `MAISON_LINE_API_BASE_URL`, unset everywhere but local tests |

## Security and privacy

- **The customer comes from the session.** The model never sees a LINE ID, and staff see it masked.
- **The question text is untrusted.** Staff read it as plain text, and LINE messages only quote it.
- **The LINE name is personal data.** Only staff who may read questions see it, and the reset deletes it with the question.
- **Pushes use Strapi's token,** which never leaves Strapi and never appears in a message or a log.
- **Local tests never reach LINE:** they point `lineApiBaseUrl` at a stand-in on this machine, so nothing reaches Paul's phone.

## Not in the POC

- Labels, sentiment and queues (spec step 4).
- A reply box in Strapi for a conversation. Staff reply in LINE's own chat.
- A LINE webhook, so customers' chat messages reach Strapi.
- Logging every turn on the server (spec step 3), instead of relying on the model's call.
- A guard for two staff pressing Let them know or Answer on the same question at the same moment: both could send. The buttons disable while one person's request runs.

## Testing

- **Unit:** the push helpers (moved, same behaviour), the message builder in both languages, with and without a piece and a name; the service (record, the open limit, an unknown slug dropped, the LINE name with and without a token, the list masked and filtered, notify and answer with each outcome, the knowledge entry); the tool; the routes; the controller's status codes.
- **Integration:** with a session and the LINE stand-in: the tool records a question, the list shows it masked with the LINE name, notify pushes one message quoting the question, answer pushes the answer and `search_knowledge` then finds it.
- **App:** the tool view's reference, the note and the chat link with the typed-in text, the product instruction, rules 9 and 10.
- **In the browser, locally,** against the LINE stand-in: ask about a piece, get handed off, see the question in Strapi, answer it with knowledge ticked, and ask again to get the answer from knowledge.

## What Paul switches on

In LINE Official Account Manager, under 設定 (Settings) › 応答設定 (Response settings):
1. **チャット (Chat):** on. **Webhook:** leave on.
2. **応答時間 (Response hours):** off for rehearsals and the demo. Outside response hours, staff get no notifications.
3. **応答方法 (Response method):** 手動チャット (Manual chat).
4. In the **応答メッセージ (Auto-response messages)** list, switch the default message to stopped (利用停止).
5. Optional: rewrite the **あいさつメッセージ (Greeting message)** to give the advisors' hours.

Then, from his phone, write to Maison: no auto-reply comes back, and the message shows in the chat.

## Open questions for Paul

1. Keep the POC for the talk, or show it as "coming next"?
2. Is "client advisor" the right title for Maison's staff?
3. Is 11:00–20:00 Japan time the promise to make, or should the note give no hours?
