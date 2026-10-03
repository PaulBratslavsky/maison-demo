# Maison: a visit picker in the concierge chat

**Status:** designed with Paul on 2 October 2026; this spec is for his review. Built on its own branch (`feat/maison-visit-picker` in maison-demo). Nothing merges into `main`, which deploys, before Paul reviews it.
**Builds on:** the concierge (`liff/lib/concierge.ts`), the product page's Book a visit sheet (`liff/components/booking-sheet.tsx`, `liff/lib/booking.ts`), and Maison's `find_boutiques`, `view_product` and `request_appointment` tools. Strapi doesn't change.
**For the talk:** its theme is "UX to AX while valuing human time". The agent prepares the visit; the customer decides with one tap.

## What Paul asked for

> "When in normal chat asking about product when requesting appointment it shouldnsame you is concierge service which shoes clickable time and date and location"

Then he chose:
- **Always, pre-filled.** The picker shows for every booking, also when the customer already named the boutique, day and time. The demo's "Yes, please." goes.
- **The tap books.** The picker sends `request_appointment` itself, as the sheet does, and hands the result to the concierge. The model no longer books on its own.

## The flow

1. **The customer asks to visit:** "Can we schedule one?", or the demo's first suggestion, "…Could I see it in Ginza on Saturday at 2 pm?".
2. **The concierge calls `choose_visit`.** It passes the pieces (1 to 5 slugs) and anything the customer named: a boutique, a day (worked out with `resolve_date`, as now) and a time. `choose_visit` is the app's own tool, answered by the customer, so the reply pauses there.
3. **The picker appears in the conversation,** filled in from the call. It's the Book a visit sheet's form, shared, with the sheet's **Send request** and a **Not now** under it.
4. **Send request books it.** The picker calls `request_appointment` over MCP with the customer's own session: the same call, input and rules as the sheet. A refusal shows in the picker, as on the sheet, and nothing reaches the concierge.
5. **The answer goes back to the concierge,** and the chat resumes on its own. The answer is either the appointment or "closed". The concierge says in one short sentence that the visit is requested and the boutique will confirm it on LINE, or, after Not now, offers to help without pushing.
6. **The booking card takes the picker's place,** with Chat with Maison on LINE under it, as after today's bookings. The lines above it read `Local · choose_visit ✓ requested` and `MCP · request_appointment ✓`.

## What the customer sees

- **The form is the sheet's own.** The sheet's form moves into a shared component. The sheet wraps it in its dialog over the product page; the chat wraps it in an inline card under the concierge's words. Same boutique radios, day chips (from tomorrow, two weeks), half-hour time chips while the chosen boutique is open, note, errors and spinner.
- **The heading** says Book a visit and names the pieces, read with `view_product` (never the model's words).
- **Filled in from the call, with the sheet's fallbacks:**
  - An unknown boutique, or one with none of the pieces, falls back to the first boutique that has one.
  - A day that isn't bookable or isn't among the chips falls back to the sheet's default (the next Saturday at least two days away).
  - A time between the half-hours goes to the half-hour it falls in (14:15 becomes 14:00). A time outside the chosen boutique's hours falls back to its first slot.
  - A `choose_visit` call whose input the schema refuses shows only its red line, with no form, and the model calls again.
- **Boutiques with several pieces:** a boutique is offered when it has at least one of the pieces in stock. One with none of them is greyed out, "not in stock" (for one piece, exactly as on the sheet).
- **One live picker.** Only the newest message's picker can send, and not while a reply is coming in. While its request is on its way, Send and the suggestion chips wait, so no message moves past a visit being booked. Once answered, it's replaced by the booking card or a short line, "Closed without a request." A picker the customer moved past by typing reads "No request sent."
- **Copy** is the sheet's own in both languages, plus three new lines (open question 1 asks Paul about the Japanese):

  | Key | English | Japanese |
  | --- | --- | --- |
  | `notNow` | Not now | 今回は見送る |
  | `pickerClosed` | Closed without a request. | リクエストせずに閉じました。 |
  | `pickerUnsent` | No request sent. | リクエストは送信されていません。 |

## The concierge

- **The rules** (`conciergeInstructions`) replace "restate and wait for yes" with:
  - To request a visit, call `choose_visit` with the pieces the customer wants to see and, when they named them, the boutique slug, the day (the date `resolve_date` returned) and the time (HH:MM, 24-hour). Never ask for a boutique, day or time in words, and never restate them for a yes: the app shows them filled in, and the customer sends the request there. If the customer asks to visit before choosing a piece, call choose_visit in the same reply with the pieces you suggest in that reply or suggested just before, at most three; ask which piece only when you have none to suggest.
  - When `choose_visit` answers requested, say in one short sentence that the visit is requested and the boutique will confirm it on LINE; the app shows the details. When it answers closed, offer help without pushing.
  - `resolve_date` keeps its rule for named days, now "before `find_boutiques` with a date and before `choose_visit`". The requestedFor format sentence goes: the model no longer writes one.
- **The tools:** the model loses `request_appointment`, the way it never gets `log_inquiry`. It keeps the other seven Maison tools, `resolve_date` and the new `choose_visit`. The title bar keeps "8 MCP tools": the screen still uses `request_appointment`, through the picker.
- **The suggestion chips:** "Yes, please." becomes "Can I book a visit?" (はい、お願いします。 becomes 来店を予約できますか？). The first suggestion stays and now ends in a picker filled in with Ginza, Saturday and 14:00. The piece chips don't change.

## Under the hood

- **`choose_visit` has no `execute`.** It's defined on the server with `tool({ description, inputSchema })`, so the model's call ends the step loop and reaches the browser as a `tool-choose_visit` part waiting for its output. Its input is a strict object:
  - `productSlugs`: 1 to 5 slugs
  - `boutique`: a slug, optional
  - `date`: YYYY-MM-DD, optional
  - `time`: HH:MM, optional
  It gets the same tidying as `resolve_date`: blanks and nulls mean "not given".
- **The answer** is added in the browser with `addToolOutput`: `{ status: 'requested', appointment }`, where `appointment` is `request_appointment`'s own `structuredContent.appointment`, or `{ status: 'closed' }`.
- **The resume.** `useChat` gets a `sendAutomaticallyWhen` that resubmits only when the last step of the last message holds an answered `choose_visit` and every other call in that step has finished, wherever the picker sits in it. A picker the customer moved past stays unanswered and doesn't count. It doesn't use the SDK's general `lastAssistantMessageIsCompleteWithToolCalls`, which would also resubmit a turn that ended on Strapi tools and could loop. The concierge's reply continues the same message in a new step, so the predicate turns false.
- **Typing instead of picking.** The server converts with `convertToModelMessages(messages, { tools, ignoreIncompleteToolCalls: true })`, so an unanswered picker is dropped and the model answers the new message.
- **One inquiry per customer message.** A request whose last message is the concierge's (the resume carrying the picker's answer) isn't logged again. The turn was logged when the customer's message arrived.
- **"Try again"** (`needsRetry`) is never offered on a message that ends in a waiting picker or holds a requested visit. It would drop the picker, or ask again and book twice.
- **What the server trusts.** The picker's answer comes from the customer's own browser. It only shapes the concierge's next sentence in that customer's chat. The booking itself already went through Strapi with their session, under Strapi's rules.

## Review focus

The inputs and conditions most likely to break a customer's evening, and what should happen:

1. **The customer types instead of tapping:** the picker reads "No request sent.", and the concierge answers the new message without an error.
2. **Send request is refused** (closed that day, a past time, three open requests already): the picker shows the sheet's message, and nothing reaches the concierge.
3. **The model passes a boutique, day or time that's wrong or unbookable:** the picker falls back, and Request only ever sends a bookable slot.
4. **"Try again" or a resubmit after a booking:** no second booking, and no resubmit loop.
5. **Japanese chat:** the same flow in Japanese, with the Japanese copy and the request sent with `locale: 'ja'`.

## The code

| File | Change |
| --- | --- |
| `liff/lib/concierge.ts` | `choose_visit`; `request_appointment` withheld from the model; the rules; `ignoreIncompleteToolCalls`; no second log on a resume |
| `liff/app/concierge/page.tsx` | `sendAutomaticallyWhen`, `addToolOutput` handed to the parts |
| `liff/components/booking-form.tsx` | New: the sheet's form, shared |
| `liff/components/booking-sheet.tsx` | Wraps the shared form in its dialog |
| `liff/components/visit-picker.tsx` | New: the inline card around the shared form, Request and Not now |
| `liff/lib/visit-picker.ts` | New, pure: the prefill fallbacks, the several-pieces rule, which picker is live, the resume predicate |
| `liff/components/chat-parts.tsx`, `liff/lib/tool-view.ts` | Render the picker, its lines and its card |
| `liff/lib/chat-retry.ts` | "Try again" rules for the picker |
| `liff/lib/copy.ts` | The suggestion chips and the three new lines |

## Not in this version

- Choosing the pieces inside the picker: the concierge picks them, or asks.
- Changing or cancelling a visit from the chat.
- A month calendar.

## Testing

- **Unit (vitest):**
  - `lib/visit-picker.ts`'s rules
  - the concierge: the tool set, the rules, `ignoreIncompleteToolCalls` with an unanswered picker, no second log on a resume, with the AI SDK's mock model as the current tests use it
  - `chat-retry` and `tool-view` for the picker's parts
- **Playwright:** the booking sheet's existing tests keep covering the shared form (boutiques, days, times, Osaka's Tuesday, stock, language).
- **Live:** the concierge's live test gains an opt-in Claude mode (`LIVE_MODEL=claude`, with the key in `liff/.env`) for two cases. "Can we schedule one?" in a piece's chat, and the demo's first suggestion, each end in a `choose_visit` call with that piece and the named boutique, day and time. In the local-model mode, the booking test (which needed "Yes, please." and the model's own `request_appointment`) becomes the same picker check; its other tests stay as they are.
- **By hand, before anything merges:** the local app with Claude, then Paul's phone through the tunnel.

## Open questions for Paul

1. The Japanese for the three new lines (in the copy table above).
2. Should the picker's heading show each piece's price, as the sheet's does?
3. Bookings from the picker are recorded as created via `app`, not `concierge`: the browser's own MCP connection can't carry the concierge's header. The board and the README then say "app" for them. Keep `app`, or route the request through the app's server so it reads `concierge` (a design change)?
