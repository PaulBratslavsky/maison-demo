# Maison Visit Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a customer asks the concierge for a visit, the chat shows the product page's Book a visit form inline, filled in from the conversation, and the customer's one tap on Send request books it; the model no longer books on its own.

**Architecture:** The server offers the model a new app-side tool, `choose_visit`, defined with `tool({ description, inputSchema })` and no `execute`, so its call ends the step loop and reaches the browser as a `tool-choose_visit` part waiting for its output. The browser renders that part as an inline card around the booking sheet's form (moved into a shared component), which calls `request_appointment` over the customer's own MCP session and hands the answer back with `addToolOutput`; `useChat`'s `sendAutomaticallyWhen` resumes the chat only for an answered picker. The rules (prefill fallbacks, which picker is live, the resume predicate, "Try again") are pure functions in `liff/lib/` with unit tests; the server change is tested with the AI SDK's mock model, as the current tests do.

**Tech Stack:** Next.js 16.3 (App Router) and React 19.3 in `liff/`, AI SDK 7 (`ai` 7.0.126, `@ai-sdk/react` 4.0.129), the MCP SDK's client, zod 4, Vitest 3, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-02-maison-visit-picker-design.md`

## Global Constraints

- **Branch:** `feat/maison-visit-picker` in `/Users/paul/work/maison-demo`, already checked out. Don't switch branches, never push, and nothing merges into `main` (it deploys) before Paul reviews.
- **App-only:** nothing in `strapi/` changes. No new dependencies: `liff/package.json` and `liff/package-lock.json` stay as they are.
- **Checks:** `npm test --prefix liff` (Vitest: `liff/lib/**/*.test.ts`) and `npm run typecheck --prefix liff` (`tsc --noEmit`, which leaves out tests, `e2e/` and `live/`). The booking sheet's browser tests: `npm run test:e2e --prefix liff`, unchanged, with Strapi running on 1338 in local mode.
- **Test files** sit next to their module as `liff/lib/<name>.test.ts` and import it relatively: `liff/vitest.config.ts` has no `@` alias. Live tests are `liff/live/*.live.test.ts`.
- **Copy**, exactly as the spec's table, in `COPY` (`liff/lib/copy.ts`), as flat keys per language: `notNow` "Not now" / "今回は見送る"; `pickerClosed` "Closed without a request." / "リクエストせずに閉じました。"; `pickerUnsent` "No request sent." / "リクエストは送信されていません。". The second suggestion: "Yes, please." becomes "Can I book a visit?", and はい、お願いします。 becomes 来店を予約できますか？. The first suggestion and the piece chips don't change. Everything else in the picker is the sheet's own copy. Customer-facing English is plain.
- **`choose_visit`'s input** is a strict object: `productSlugs`, 1 to 5 slugs; `boutique`, a slug, optional; `date`, YYYY-MM-DD, optional; `time`, HH:MM, optional. It gets `resolve_date`'s tidying: blanks and nulls mean "not given".
- **The picker's answer** is `{ status: 'requested', appointment }` (request_appointment's own `structuredContent.appointment`) or `{ status: 'closed' }`.
- **The model's tools:** never `request_appointment` or `log_inquiry`. The concierge's title bar keeps "8 MCP tools": `CONCIERGE_TOOLS` in `liff/app/concierge/page.tsx` doesn't change.
- **The picker's request** is the sheet's call: the same input and rules, the customer's own session, and the screen's language as `locale`.
- **Client code never imports `liff/lib/concierge.ts`:** its zod schema would join the browser bundle (`liff/lib/piece-slug.ts` says why).
- **AI SDK APIs** are checked against the installed types, never from memory (see "What the AI SDK does here").
- **Commits:** stage named paths only, and commit with a pathspec: `git add <paths>`, then `git commit -m "<subject>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- <paths>`. Every message ends with that line.
- **Never read or print a value from any `.env` file:** names only.
- **Line numbers** in the steps are the files' as they are on the branch before this plan: the quoted text is what to match.
- **Ports:** 1337, 1340 and 3000 belong to other apps. The local stack runs Strapi on 1338, the app on 3003, the LINE stand-in on 4010, and the verify mock on 4545 (which `npm run dev` starts).

## Review Focus

1. **The customer sends a message, or taps a suggestion, while Send request is still on its way:** the picker would read "No request sent." over a visit that was booked. Expected: Send and the suggestions wait until the picker has its answer. (`composerLocked`: Task 2 tests it, Task 4 wires it.)
2. **The local model calls `choose_visit` with input the schema refuses** (a time of "2 pm"): the SDK answers it as an error, and the page holds the call in `output-error`. Expected: only its red `Local · choose_visit ✕ error` line, no form and no "No request sent.", and the model calls again. (Task 2: `pickerViewOf` gives `none`; Task 3: the refusal; Task 4: the line.)
3. **The reply after the picker's answer comes back empty** (the local model): expected: no resubmit loop; no "Try again" after a requested visit, and "Try again" after a closed one. (Task 2: `resumesAfterPicker`; Task 4: `needsRetry`.)
4. **A time between the half-hours** ("2:15 pm", 14:15): expected: the picker shows 14:00, the half-hour it falls in, not the boutique's first slot, 11:00. (Task 2: `pickerPrefill`.)
5. **The model calls `choose_visit` twice in one reply:** expected: one live picker, the last; the other reads "No request sent." (Task 2: `livePickerOf`.)

## What the AI SDK does here

Checked in `liff/node_modules` (ai 7.0.126, @ai-sdk/react 4.0.129, @ai-sdk/provider-utils 5.0.53):

- **A tool without `execute`:** `tool()` takes one (`@ai-sdk/provider-utils/dist/index.d.ts:2058-2082`, `ToolOutputProperties`: with no output type, `execute` and `outputSchema` are optional; overload `tool<INPUT, CONTEXT>(tool: Tool<INPUT, never, CONTEXT>)` at `:2307`). `streamText` goes on to another step only when every client tool call has an output (`ai/dist/index.js:9901`), so the call ends the turn.
- **The part:** a static tool's UI part is `` `tool-${NAME}` `` (`ai/dist/index.d.ts:2299-2301`), with states `input-streaming`, `input-available`, `output-available`, `output-error` and the approval ones (`:2178-2298`). A call whose input fails the schema becomes an invalid tool call: a `tool-input-error` chunk (`ai/dist/index.js:7207-7219`), which leaves the call in `output-error`: on the `tool-choose_visit` part its input streamed into, or on a `dynamic-tool` part of that name when the input came whole (`ai/dist/index.js:6830-6853`). The picker's rules take both.
- **`addToolOutput`:** `({ tool, toolCallId, output, state?, options? })` (`ai/dist/index.d.ts:5931-5952`; on `useChat`'s helpers, `@ai-sdk/react/dist/index.d.ts:111`). It updates the call in the last message only, then asks `sendAutomaticallyWhen` and resubmits with that message's id (`ai/dist/index.js:19523-19560`).
- **`sendAutomaticallyWhen`:** `(options: { messages }) => boolean | PromiseLike<boolean>` on `ChatInit` (`ai/dist/index.d.ts:6028-6030`). It is asked again after every finished response (`ai/dist/index.js:19790-19796`), so it must turn false once the reply has continued the message.
- **`convertToModelMessages(messages, { tools, ignoreIncompleteToolCalls })`** (`ai/dist/index.d.ts:5716-5720`): the option drops tool parts with no output (`ai/dist/index.js:10522-10525`). Without it, a call with no result reaches the model call, which refuses it (`MissingToolResultsError`, `ai/dist/index.js:1375-1378`).
- **Continuing the message:** with `originalMessages` whose last message is the assistant's, the stream's `start` chunk carries that message's id (`ai/dist/index.d.ts:2776-2788`; `ai/dist/index.js:7011-7014`), and the chat appends to that message (`createStreamingUIMessageState`, `ai/dist/index.js:6466-6472`).

## File Structure

| File | Responsibility |
| --- | --- |
| `liff/lib/booking.ts` (modify) | The booking form's rules: the stock rule for several pieces, `defaultVisit`, and `requestVisit`, the sheet's `request_appointment` call as a function |
| `liff/components/booking-form.tsx` (create) | The sheet's form, shared: boutique radios, day and time chips, note, errors, spinner, Send request, an optional second button |
| `liff/components/booking-sheet.tsx` (modify) | The dialog around the shared form, with its handle, heading and close button |
| `liff/lib/visit-picker.ts` (create) | Pure: the tool's name, the answer's type, the prefill fallbacks, which picker is live, what a picker's part shows, the resume predicate, the composer's lock |
| `liff/lib/concierge.ts` (modify) | `choose_visit`; `request_appointment` withheld; rules 3 to 5; `ignoreIncompleteToolCalls`; no second log on a resume |
| `liff/lib/tool-view.ts` (modify) | The picker's line (`Local · choose_visit ✓ requested`), the `request_appointment` line under it, and the card from its answer |
| `liff/lib/chat-retry.ts` (modify) | No "Try again" on a waiting picker or a requested visit |
| `liff/lib/copy.ts` (modify) | The second suggestion and the three new lines |
| `liff/components/visit-picker.tsx` (create) | The inline card: heading with the pieces' names (`view_product`), the shared form, Send request and Not now |
| `liff/components/chat-parts.tsx` (modify) | Renders a picker under its line: the form, the card, or a short line |
| `liff/app/concierge/page.tsx` (modify) | `sendAutomaticallyWhen`, `addToolOutput` handed to the parts, the composer's lock |
| `liff/live/concierge.live.test.ts` (modify) | The Claude mode and the picker cases |
| `README.md` (modify) | The concierge's picker, the stage run, the live test |

---

### Task 1: The shared booking form, and the stock rule for several pieces

The sheet's form moves into `components/booking-form.tsx`, the sheet wraps it with the same markup and behaviour, and the booking rules take several pieces: a boutique is offered when it has at least one of them. For one piece nothing changes, and the sheet's browser tests pass untouched.

**Files:**
- Modify: `liff/lib/booking.ts` (whole file)
- Create: `liff/components/booking-form.tsx`
- Modify: `liff/components/booking-sheet.tsx` (whole file)
- Test: `liff/lib/booking.test.ts` (whole file); `liff/e2e/maison.spec.ts` (run, unchanged)

**Interfaces:**
- Consumes: nothing new.
- Produces (`liff/lib/booking.ts`):
  - `interface VisitChoice { boutique: string; date: string; time: string }`
  - `defaultVisit(now?: Date): VisitChoice`: Ginza, `nextSaturday(now)`, 14:00
  - `hasStock(boutique: BoutiqueInfo, products: readonly string[]): boolean`
  - `chooseBoutique(boutiques: BoutiqueInfo[], slug: string, products: readonly string[]): BoutiqueInfo | undefined`
  - `bookingState({ date, boutique, time, products: readonly string[], boutiques, loading, now? })`: returns `{ validDate, dateProblem, chosen, open, slots, startTime }` as before
  - `interface VisitRequest { boutique: string; products: readonly string[]; date: string; startTime: string; note: string; locale: Locale }`
  - `type VisitOutcome = { ok: true; appointment: Appointment } | { ok: false; problem: ScreenError }`
  - `visitArguments(request: VisitRequest): Record<string, unknown>`
  - `requestVisit(callTool: (name: string, args: Record<string, unknown>) => Promise<CallToolResult>, request: VisitRequest): Promise<VisitOutcome>`
  - `bookingDays`, `isBookableDate`, `dateProblem`, `isOpen`, `slotsFor`, `startTimeFrom`, `shouldCloseOnKey`, `BOOKING_DAYS`: unchanged
- Produces (`liff/components/booking-form.tsx`): `BookingForm({ screen: string; products: string[]; initial: VisitChoice; disabled?: boolean; onBooked: (appointment: Appointment) => void; onSendingChange?: (sending: boolean) => void; dismiss?: { label: string; onDismiss: () => void }; header: ReactNode; className: string })`

- [ ] **Step 1: Write the failing tests**

Replace `liff/lib/booking.test.ts` with:

```ts
import { describe, expect, it, vi } from 'vitest';

import { BOOKING_DAYS, bookingDays, bookingState, defaultVisit, hasStock, isBookableDate, requestVisit, shouldCloseOnKey, visitArguments } from './booking';
import { nextSaturday } from './format';
import { SessionError } from './session';
import type { BoutiqueInfo } from './types';

// 11:30 on Thursday 1 October 2026 in Tokyo. Tomorrow there is Friday 2 October.
const NOW = new Date('2026-10-01T02:30:00Z');
const TUESDAY = '2026-10-06';
const WEDNESDAY = '2026-10-07';

const week = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
/**
 * A boutique as find_boutiques returns it for one date and one product (the seed's hours: 11:00 to 20:00; Osaka has no
 * Tuesday). Its stock is the seed's for the Weekender 50, which Osaka doesn't have, and the Cabin Case 55, which it has.
 */
const boutique = (slug: string, name: string, openOnDate: boolean, hoursOnDate = openOnDate ? { opens: '11:00', closes: '20:00' } : null): BoutiqueInfo => ({
  slug,
  name,
  city: slug === 'osaka' ? 'Osaka' : 'Tokyo',
  address: `${name} (demo)`,
  hours: week.filter((day) => slug !== 'osaka' || day !== 'tue').map((weekday) => ({ weekday, opens: '11:00', closes: '20:00' })),
  openOnDate,
  hoursOnDate,
  stock: [
    { product: 'weekender-50', quantity: slug === 'osaka' ? 0 : 1 },
    { product: 'cabin-case-55', quantity: 1 },
  ],
});
const onTuesday = [boutique('ginza', 'Ginza Flagship', true), boutique('omotesando', 'Omotesando', true), boutique('osaka', 'Osaka Shinsaibashi', false)];
const onWednesday = [boutique('ginza', 'Ginza Flagship', true), boutique('omotesando', 'Omotesando', true), boutique('osaka', 'Osaka Shinsaibashi', true)];

const sheet = (overrides: Partial<Parameters<typeof bookingState>[0]> = {}) =>
  bookingState({ date: TUESDAY, boutique: 'ginza', time: '14:00', products: ['weekender-50'], boutiques: onTuesday, loading: false, now: NOW, ...overrides });

describe('bookingDays', () => {
  it("offers two weeks of days from tomorrow on Tokyo's calendar, each with its weekday", () => {
    const days = bookingDays(NOW);
    expect(BOOKING_DAYS).toBe(14);
    expect(days).toHaveLength(14);
    expect(days[0]).toEqual({ date: '2026-10-02', weekday: 5 });
    expect(days.at(-1)).toEqual({ date: '2026-10-15', weekday: 4 });
    expect(days.every((day) => isBookableDate(day.date, NOW))).toBe(true);
  });

  it('always holds the default day, the next Saturday at least two days away, and every weekday', () => {
    // Every hour for a fortnight, so each weekday and both sides of Tokyo's midnight come round.
    for (let hour = 0; hour < 14 * 24; hour++) {
      const now = new Date(NOW.getTime() + hour * 3_600_000);
      const days = bookingDays(now);
      expect(days.map((day) => day.date), now.toISOString()).toContain(nextSaturday(now));
      expect(new Set(days.map((day) => day.weekday)).size).toBe(7);
    }
  });

  it("moves on at Tokyo's midnight, not the machine's", () => {
    expect(bookingDays(new Date('2026-10-01T14:59:00Z'))[0].date).toBe('2026-10-02');
    expect(bookingDays(new Date('2026-10-01T15:00:00Z'))[0].date).toBe('2026-10-03');
  });
});

describe('defaultVisit', () => {
  it("is the sheet's own start: Ginza, the next Saturday at least two days away, at 14:00", () => {
    expect(defaultVisit(NOW)).toEqual({ boutique: 'ginza', date: '2026-10-03', time: '14:00' });
    expect(defaultVisit(NOW).date).toBe(nextSaturday(NOW));
    // On Friday 2 October, Saturday the 3rd is one day away: the default is the 10th.
    expect(defaultVisit(new Date('2026-10-02T02:30:00Z')).date).toBe('2026-10-10');
  });
});

describe('hasStock', () => {
  it('is true only where the boutique has at least one of the piece', () => {
    const [ginza, , osaka] = onTuesday;
    expect(hasStock(ginza, ['weekender-50'])).toBe(true);
    expect(hasStock(osaka, ['weekender-50'])).toBe(false);
    expect(hasStock(osaka, ['cabin-case-55'])).toBe(true);
    expect(hasStock(ginza, ['passport-cover']), 'no stock line for the piece').toBe(false);
  });

  it('is true where the boutique has at least one of several pieces, and false where it has none of them', () => {
    const [ginza, , osaka] = onTuesday;
    expect(hasStock(osaka, ['weekender-50', 'cabin-case-55']), 'Osaka has the Cabin Case, not the Weekender').toBe(true);
    expect(hasStock(osaka, ['cabin-case-55', 'weekender-50'])).toBe(true);
    expect(hasStock(ginza, ['weekender-50', 'cabin-case-55'])).toBe(true);
    expect(hasStock(osaka, ['weekender-50', 'passport-cover']), 'none of them').toBe(false);
    expect(hasStock(ginza, []), 'no pieces at all').toBe(false);
  });
});

describe('isBookableDate', () => {
  it('takes real calendar dates from tomorrow in Tokyo', () => {
    expect(isBookableDate('2026-10-02', NOW)).toBe(true);
    expect(isBookableDate(TUESDAY, NOW)).toBe(true);
  });

  it('refuses today, the past, impossible dates and a cleared field', () => {
    for (const date of ['2026-10-01', '2026-09-30', '2026-02-30', '2026-11-31', '']) expect(isBookableDate(date, NOW)).toBe(false);
  });
});

describe('bookingState', () => {
  it('offers the picked time at an open boutique on a bookable date', () => {
    const state = sheet();
    expect(state).toMatchObject({ validDate: true, dateProblem: null, open: true, startTime: '14:00' });
    expect(state.chosen?.slug).toBe('ginza');
    expect(state.slots).toHaveLength(18);
    expect([state.slots[0], state.slots.at(-1)]).toEqual(['11:00', '19:30']);
  });

  it('asks for a date when there is none, and offers nothing', () => {
    expect(sheet({ date: '' })).toMatchObject({ validDate: false, dateProblem: 'chooseDate', open: false, slots: [], startTime: undefined });
  });

  it('asks for a date when the date is not on the calendar', () => {
    expect(sheet({ date: '2026-02-30' })).toMatchObject({ validDate: false, dateProblem: 'chooseDate', open: false, startTime: undefined });
  });

  it('asks for a later date for today or a day in the past', () => {
    expect(sheet({ date: '2026-10-01' })).toMatchObject({ validDate: false, dateProblem: 'dateTooSoon', open: false, startTime: undefined });
    expect(sheet({ date: '2026-09-15' })).toMatchObject({ validDate: false, dateProblem: 'dateTooSoon', startTime: undefined });
  });

  it('is closed for Osaka on a Tuesday, with no time to send', () => {
    const state = sheet({ boutique: 'osaka', products: ['cabin-case-55'] });
    expect(state.chosen?.slug).toBe('osaka');
    expect(state).toMatchObject({ validDate: true, dateProblem: null, open: false, slots: [], startTime: undefined });
  });

  it('is not open while the date is being checked, even with the last answer saying open', () => {
    expect(sheet({ loading: true })).toMatchObject({ open: false, slots: [], startTime: undefined });
  });

  it('has nothing to send when an open day leaves no half-hour slot', () => {
    const short = [boutique('ginza', 'Ginza Flagship', true, { opens: '11:00', closes: '11:20' })];
    expect(sheet({ boutiques: short })).toMatchObject({ open: true, slots: [], startTime: undefined });
    const noHours = [boutique('ginza', 'Ginza Flagship', true, null)];
    expect(sheet({ boutiques: noHours })).toMatchObject({ open: true, slots: [], startTime: undefined });
  });

  it("uses the first boutique listed when the picked one isn't there, as the radios show", () => {
    const withoutGinza = onTuesday.filter((candidate) => candidate.slug !== 'ginza');
    expect(sheet({ boutiques: withoutGinza }).chosen?.slug).toBe('omotesando');
    expect(sheet({ boutiques: [] })).toMatchObject({ chosen: undefined, open: false, startTime: undefined });
  });

  it("never uses a boutique that doesn't have the piece: the picked one falls back to the first that has it", () => {
    // Osaka has no Weekender 50: its radio is disabled, and a pick of it (or a stale one) can't be sent.
    expect(sheet({ boutique: 'osaka' }).chosen?.slug).toBe('ginza');
    const osakaFirst = [onTuesday[2], ...onTuesday.slice(0, 2)];
    expect(sheet({ boutique: 'osaka', boutiques: osakaFirst }).chosen?.slug).toBe('ginza');
    // Where it is, a pick of Osaka stands.
    expect(sheet({ boutique: 'osaka', products: ['cabin-case-55'] }).chosen?.slug).toBe('osaka');
  });

  it('has no boutique, and nothing to send, when no boutique has the piece', () => {
    expect(sheet({ products: ['passport-cover'] })).toMatchObject({ chosen: undefined, open: false, slots: [], startTime: undefined });
  });

  it('falls back to the first slot when the picked time is not offered', () => {
    expect(sheet({ time: '09:00' }).startTime).toBe('11:00');
  });
});

// The visit picker books several pieces at once: a boutique is offered when it has at least one of them.
describe('bookingState for several pieces', () => {
  const visit = (overrides: Partial<Parameters<typeof bookingState>[0]>) => sheet({ date: WEDNESDAY, boutiques: onWednesday, ...overrides });

  it('offers a boutique that has one of them: Osaka, for the Weekender and the Cabin Case', () => {
    const state = visit({ boutique: 'osaka', products: ['weekender-50', 'cabin-case-55'] });
    expect(state.chosen?.slug).toBe('osaka');
    expect(state).toMatchObject({ open: true, startTime: '14:00' });
  });

  it('falls back to the first boutique with one of them when the picked one has none', () => {
    expect(visit({ boutique: 'osaka', products: ['weekender-50', 'passport-cover'] }).chosen?.slug).toBe('ginza');
  });

  it('has nothing to send when no boutique has any of them', () => {
    expect(visit({ products: ['passport-cover', 'tote-soleil'] })).toMatchObject({ chosen: undefined, open: false, slots: [], startTime: undefined });
  });

  it('is the one-piece rule for one piece: Osaka, without the Weekender, falls back to Ginza on any day', () => {
    expect(visit({ boutique: 'osaka', products: ['weekender-50'] }).chosen?.slug).toBe('ginza');
  });
});

describe('requestVisit', () => {
  const appointment = {
    reference: 'APT-0042',
    status: 'requested',
    boutique: { slug: 'ginza', name: 'Ginza Flagship' },
    requestedFor: '2026-10-03T14:00:00+09:00',
    products: [{ slug: 'weekender-50', name: 'Weekender 50' }],
    note: '',
    confirmationSent: false,
  };
  /** What Maison answers to a request it stored, as the MCP client passes it on. */
  const stored = { content: [{ type: 'text', text: JSON.stringify({ appointment }) }], structuredContent: { appointment } };
  /** What Maison answers to a request it refuses (isError). */
  const refusal = (code: string) => ({ isError: true, content: [{ type: 'text', text: JSON.stringify({ error: { code, message: 'Refused.', hint: 'Ask for another time.' } }) }] });
  const request = { boutique: 'ginza', products: ['weekender-50'], date: '2026-10-03', startTime: '14:00', note: '', locale: 'en' as const };

  it("sends request_appointment as the sheet always has: the pieces, the start in Tokyo time and the customer's language", async () => {
    const callTool = vi.fn(async (_name: string, _args: Record<string, unknown>) => stored as any);
    expect(await requestVisit(callTool, request)).toEqual({ ok: true, appointment });
    expect(callTool).toHaveBeenCalledTimes(1);
    expect(callTool).toHaveBeenCalledWith('request_appointment', { boutique: 'ginza', productSlugs: ['weekender-50'], requestedFor: '2026-10-03T14:00:00+09:00', locale: 'en' });
  });

  it("sends the note trimmed, and only when there's something in it", () => {
    expect(visitArguments({ ...request, note: '  For my father.\n' })).toMatchObject({ note: 'For my father.' });
    expect(visitArguments({ ...request, note: ' \n ' })).not.toHaveProperty('note');
  });

  it('sends every piece of a visit for several, and the language of a Japanese chat', () => {
    expect(visitArguments({ ...request, products: ['weekender-50', 'cabin-case-55'], locale: 'ja' })).toEqual({
      boutique: 'ginza',
      productSlugs: ['weekender-50', 'cabin-case-55'],
      requestedFor: '2026-10-03T14:00:00+09:00',
      locale: 'ja',
    });
  });

  it("gives Maison's refusal as the problem, and no visit", async () => {
    for (const code of ['too_many_open_requests', 'boutique_closed', 'in_the_past']) {
      const outcome = await requestVisit(async () => refusal(code) as any, request);
      expect(outcome, code).toEqual({ ok: false, problem: { code, message: 'Refused.', hint: 'Ask for another time.' } });
    }
  });

  it("gives a failure on the way as the screens show it, and keeps a sign-in problem's code", async () => {
    const offline = await requestVisit(async () => {
      throw new TypeError('Failed to fetch');
    }, request);
    expect(offline).toEqual({ ok: false, problem: { code: 'network', message: 'Failed to fetch', hint: '' } });
    const signIn = await requestVisit(async () => {
      throw new SessionError('invalid_grant', 'LINE refused the ID token.');
    }, request);
    expect(signIn).toMatchObject({ ok: false, problem: { code: 'invalid_grant' } });
  });

  it('never takes a success without an appointment for a visit', async () => {
    for (const answer of [{ content: [] }, { content: [], structuredContent: {} }, { content: [], structuredContent: { appointment: { reference: '' } } }]) {
      const outcome = await requestVisit(async () => answer as any, request);
      expect(outcome, JSON.stringify(answer)).toMatchObject({ ok: false, problem: { code: 'error' } });
    }
  });
});

describe('shouldCloseOnKey', () => {
  const key = (event: Partial<Pick<KeyboardEvent, 'key' | 'isComposing' | 'keyCode'>>) => ({ key: '', isComposing: false, keyCode: 0, ...event });

  it('closes the sheet on Escape', () => {
    expect(shouldCloseOnKey(key({ key: 'Escape', keyCode: 27 }))).toBe(true);
  });

  it('leaves it open while an input method composes, as when typing the note in Japanese: Escape there cancels the composition', () => {
    expect(shouldCloseOnKey(key({ key: 'Escape', keyCode: 27, isComposing: true }))).toBe(false);
    // Safari ends a composition before its keydown, and reports that keydown as keyCode 229 instead.
    expect(shouldCloseOnKey(key({ key: 'Escape', keyCode: 229 }))).toBe(false);
  });

  it('ignores every other key', () => {
    for (const other of ['Enter', 'Tab', 'a', ' ']) expect(shouldCloseOnKey(key({ key: other })), other).toBe(false);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm test --prefix liff -- lib/booking.test.ts`
Expected: FAIL, 18 of 32: `defaultVisit is not a function`, `requestVisit is not a function`, and the stock tests (`hasStock` still takes one slug, so a list is never found).

- [ ] **Step 3: Write the implementation**

Replace `liff/lib/booking.ts` with:

```ts
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import { isRealDate, nextSaturday, timeSlots, tokyoDays, tomorrow } from './format';
import { toolErrorOf } from './mcp';
import { errorOf, type ScreenError } from './status';
import type { Appointment, BoutiqueInfo, Locale } from './types';

/** Why a date can't be booked: the COPY key the form shows under the days. */
export type DateProblem = 'chooseDate' | 'dateTooSoon';

/** How many days the form offers, from tomorrow: two weeks. The concierge's calendar covers 14 days from today, so the form reaches one day further. */
export const BOOKING_DAYS = 14;

/** The boutique, day and time a booking form shows: a slug, YYYY-MM-DD and HH:MM. */
export interface VisitChoice {
  boutique: string;
  date: string;
  time: string;
}

/** What the form starts with when nothing else is asked for: Ginza, the next Saturday at least two days away, at 14:00. */
export const defaultVisit = (now: Date = new Date()): VisitChoice => ({ boutique: 'ginza', date: nextSaturday(now), time: '14:00' });

/**
 * The days the form offers, as chips: the next two weeks on Tokyo's calendar, from tomorrow. Each weekday comes up
 * twice, and the default day, the next Saturday at least two days away, is always among them.
 */
export const bookingDays = (now: Date = new Date()): Array<{ date: string; weekday: number }> => tokyoDays(BOOKING_DAYS + 1, now).slice(1);

/** A date the tools take and a visit can be on: a real calendar date, from tomorrow on Tokyo's calendar. */
export const isBookableDate = (date: string, now: Date = new Date()): boolean => isRealDate(date) && date >= tomorrow(now);

/**
 * No date, or an impossible one, asks for one; a real date today or in the past asks for a later one. The chips offer only
 * days from tomorrow, so a chosen day becomes too soon when Tokyo's midnight passes with the form open.
 */
export const dateProblem = (date: string, now: Date = new Date()): DateProblem | null =>
  isBookableDate(date, now) ? null : isRealDate(date) ? 'dateTooSoon' : 'chooseDate';

/**
 * Whether a boutique has something to see: at least one of the pieces in its stock, in find_boutiques' answer for them.
 * For one piece, whether it has that piece.
 */
export const hasStock = (boutique: BoutiqueInfo, products: readonly string[]): boolean =>
  boutique.stock.some((line) => products.includes(line.product) && line.quantity > 0);

/**
 * The boutique the form uses: the one picked, or else the first listed, as the radios show. Only a boutique that has one
 * of the pieces: one without any is a disabled radio, and is never chosen, even when picked before.
 */
export const chooseBoutique = (boutiques: BoutiqueInfo[], slug: string, products: readonly string[]): BoutiqueInfo | undefined => {
  const withPiece = boutiques.filter((candidate) => hasStock(candidate, products));
  return withPiece.find((candidate) => candidate.slug === slug) ?? withPiece[0];
};

/** Open on a bookable date. Never while that date's answer is loading: the boutiques held are the last date's. */
export const isOpen = (validDate: boolean, loading: boolean, boutique: BoutiqueInfo | undefined): boolean =>
  validDate && !loading && boutique?.openOnDate === true;

/** Half-hour start times on an open day, none otherwise. */
export const slotsFor = (open: boolean, boutique: BoutiqueInfo | undefined): string[] =>
  open && boutique?.hoursOnDate ? timeSlots(boutique.hoursOnDate.opens, boutique.hoursOnDate.closes) : [];

/** The time to send: the one picked when it's offered, else the first offered. Undefined when none is: nothing to send. */
export const startTimeFrom = (slots: string[], picked: string): string | undefined => (slots.includes(picked) ? picked : slots[0]);

/**
 * Whether a key closes the sheet: Escape, but not while an input method is composing text, as when the note is typed in
 * Japanese, where Escape cancels the composition. Safari reports that keydown as keyCode 229, without isComposing.
 */
export const shouldCloseOnKey = (event: Pick<KeyboardEvent, 'key' | 'isComposing' | 'keyCode'>): boolean =>
  event.key === 'Escape' && !event.isComposing && event.keyCode !== 229;

/**
 * The booking form's rules in one place: what it may send, and what it says when it may not. `boutiques` and `loading`
 * are find_boutiques' answer for the date and the `products`. The form may send only when `startTime` is set.
 */
export const bookingState = ({
  date,
  boutique,
  time,
  products,
  boutiques,
  loading,
  now = new Date(),
}: {
  date: string;
  boutique: string;
  time: string;
  products: readonly string[];
  boutiques: BoutiqueInfo[];
  loading: boolean;
  now?: Date;
}) => {
  const validDate = isBookableDate(date, now);
  const chosen = chooseBoutique(boutiques, boutique, products);
  const open = isOpen(validDate, loading, chosen);
  const slots = slotsFor(open, chosen);
  return { validDate, dateProblem: dateProblem(date, now), chosen, open, slots, startTime: startTimeFrom(slots, time) };
};

/** What a booking form sends: the boutique, day and start it shows, the pieces, the customer's note, and the screen's language. */
export interface VisitRequest {
  boutique: string;
  products: readonly string[];
  date: string;
  startTime: string;
  note: string;
  locale: Locale;
}

/** How a request went: the visit Strapi stored, or the problem the form shows (Maison's refusal, or a failure on the way). */
export type VisitOutcome = { ok: true; appointment: Appointment } | { ok: false; problem: ScreenError };

/**
 * request_appointment's arguments, as the sheet has always sent them: the pieces, the start in Tokyo time, the note only
 * when there's something in it (trimmed), and the customer's language, so the answer names the boutique and the pieces in it.
 */
export const visitArguments = (request: VisitRequest): Record<string, unknown> => ({
  boutique: request.boutique,
  productSlugs: [...request.products],
  requestedFor: `${request.date}T${request.startTime}:00+09:00`,
  ...(request.note.trim() ? { note: request.note.trim() } : {}),
  locale: request.locale,
});

/**
 * Sends a visit request with `callTool` (Maison's, for the form's screen) and says how it went. It never throws: a refusal
 * is Maison's own error, and a failure on the way is the screens' (errorOf), which keeps a sign-in problem's OAuth code
 * so the copy can say what to do. A success without an appointment is a problem too: there's no visit to show.
 */
export const requestVisit = async (
  callTool: (name: string, args: Record<string, unknown>) => Promise<CallToolResult>,
  request: VisitRequest
): Promise<VisitOutcome> => {
  let result: CallToolResult;
  try {
    result = await callTool('request_appointment', visitArguments(request));
  } catch (error) {
    return { ok: false, problem: errorOf(error) };
  }
  const refusal = toolErrorOf(result);
  if (refusal) return { ok: false, problem: refusal };
  const appointment = (result.structuredContent as { appointment?: Appointment } | undefined)?.appointment;
  if (typeof appointment?.reference !== 'string' || appointment.reference === '') {
    return { ok: false, problem: { code: 'error', message: 'request_appointment answered without an appointment.', hint: '' } };
  }
  return { ok: true, appointment };
};
```

- [ ] **Step 4: Run them to see them pass**

Run: `npm test --prefix liff -- lib/booking.test.ts`
Expected: PASS, 32 tests.

- [ ] **Step 5: Create the shared form**

Create `liff/components/booking-form.tsx`. `ChipRow`, the radios, the chips, the time area, the note, the problem and the button are the sheet's own markup, moved; the form takes the pieces, its start and its screen, and the submit goes through `requestVisit`:

```tsx
'use client';

import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';

import { bookingDays, bookingState, hasStock, isBookableDate, requestVisit, type VisitChoice } from '@/lib/booking';
import { COPY } from '@/lib/copy';
import { dayLabel } from '@/lib/format';
import { errorText, type ScreenError } from '@/lib/status';
import type { Appointment, BoutiqueInfo } from '@/lib/types';
import { useToday } from '@/lib/use-today';
import { useTool } from '@/lib/use-tool';
import { ErrorNote } from './error-note';
import { useMaison } from './maison-provider';
import { Spinner } from './spinner';

/** Arrow keys move along a row of radios, Home and End go to its ends: each picks the chip it lands on. */
const STEPS: Readonly<Record<string, number>> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

/**
 * A row of chips to pick one from, as the mockup draws the day and the time: a radio group named by its label, whose
 * chips are radios (one tab stop, arrow keys between them). It scrolls sideways when the chips don't fit, and brings the
 * chosen one into view when the row appears or its chips change.
 */
function ChipRow({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ value: string; label: string }>;
  value: string | undefined;
  onChange: (value: string) => void;
}) {
  const labelId = useId();
  const row = useRef<HTMLDivElement>(null);
  const checked = options.findIndex((option) => option.value === value);
  const focusable = Math.max(checked, 0);
  const chips = options.map((option) => option.value).join();

  useEffect(() => {
    const list = row.current;
    const chip = list?.querySelector<HTMLElement>('[aria-checked="true"]');
    if (list && chip) list.scrollLeft = chip.offsetLeft - (list.clientWidth - chip.offsetWidth) / 2;
  }, [chips]);

  const move = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = STEPS[event.key];
    const target =
      event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : step ? (focusable + step + options.length) % options.length : -1;
    if (target < 0 || options.length === 0) return;
    event.preventDefault();
    onChange(options[target].value);
    (row.current?.children[target] as HTMLElement | undefined)?.focus();
  };

  return (
    <div className="flex flex-col gap-2">
      <p id={labelId} className="label">
        {label}
      </p>
      <div
        ref={row}
        role="radiogroup"
        aria-labelledby={labelId}
        onKeyDown={move}
        // Bleeds to the form's edges, with 4 px above and below for a chip's focus ring, which a scroller would clip.
        className="relative -mx-5 -my-1 flex gap-2 overflow-x-auto px-5 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {options.map((option, index) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={index === checked}
            tabIndex={index === focusable ? 0 : -1}
            onClick={() => onChange(option.value)}
            className="chip w-[72px] flex-none"
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * The booking form, shared by the product page's Book a visit sheet (components/booking-sheet.tsx) and the concierge's
 * visit picker (components/visit-picker.tsx). The boutique is a radio per boutique, disabled where none of the pieces is
 * in stock; the day and the time are rows of chips: the next two weeks, and the half-hour slots the chosen boutique is
 * open on that day. Send request calls request_appointment with the customer's own session (requestVisit in
 * lib/booking.ts), and a refusal shows here, as it always has on the sheet. `header` comes first, inside the form: the
 * sheet's handle and heading, or the picker's. `dismiss` is a second button under Send request: the picker's Not now.
 */
export function BookingForm({
  screen,
  products,
  initial,
  disabled = false,
  onBooked,
  onSendingChange,
  dismiss,
  header,
  className,
}: {
  /** The screen whose agent view lists the form's calls: "product" for the sheet, "concierge" for the picker. */
  screen: string;
  /** The pieces to see: the sheet's one, or the picker's one to five. */
  products: string[];
  /** The boutique, day and time the form starts with. */
  initial: VisitChoice;
  /** While true, neither button does anything: a picker that isn't the live one, or that waits for a reply. */
  disabled?: boolean;
  /** The visit Strapi stored. Send request stays busy after it: the caller moves on. */
  onBooked: (appointment: Appointment) => void;
  /** Told when a request starts (true), and when it ends in a problem (false). */
  onSendingChange?: (sending: boolean) => void;
  dismiss?: { label: string; onDismiss: () => void };
  header: ReactNode;
  className: string;
}) {
  const { maison, locale } = useMaison();
  const t = COPY[locale];
  const now = useToday();
  const [date, setDate] = useState(initial.date);
  const [boutique, setBoutique] = useState(initial.boutique);
  const [time, setTime] = useState(initial.time);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<ScreenError | null>(null);
  const boutiqueLabel = useId();

  // Only a bookable date is checked, and sent: the tools take only real calendar dates.
  const availability = useTool<{ boutiques: BoutiqueInfo[] }>(
    screen,
    'find_boutiques',
    isBookableDate(date, now) ? { productSlugs: products, date, locale } : null
  );
  const boutiques = availability.data?.boutiques ?? [];
  const { validDate, dateProblem, chosen, open, slots, startTime } = bookingState({
    date,
    boutique,
    time,
    products,
    boutiques,
    loading: availability.loading,
    now,
  });

  /** A new boutique, date or time makes the last send's problem stale. */
  const changed = (set: (value: string) => void) => (value: string) => {
    set(value);
    setProblem(null);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (sending || disabled) return;
    if (!maison || !chosen || !startTime) return;
    setSending(true);
    setProblem(null);
    onSendingChange?.(true);
    // The answer names the boutique and products in the customer's language.
    const outcome = await requestVisit((name, args) => maison.callTool(screen, name, args), {
      boutique: chosen.slug,
      products,
      date,
      startTime,
      note,
      locale,
    });
    if (outcome.ok) {
      // `sending` stays on: the button stays disabled while the caller moves on.
      onBooked(outcome.appointment);
      return;
    }
    // A refusal, or a failure on the way, stays in the form: nothing else hears of it.
    setSending(false);
    setProblem(outcome.problem);
    onSendingChange?.(false);
  };

  return (
    <form onSubmit={submit} className={className}>
      {header}

      {/* A real radio per boutique, named by its label. One without any of the pieces is disabled and says so. */}
      <fieldset role="radiogroup" aria-labelledby={boutiqueLabel} className="m-0 min-w-0 border-0 p-0">
        <legend id={boutiqueLabel} className="label pb-2">
          {t.boutique}
        </legend>
        {boutiques.length === 0 && availability.loading ? (
          // Three rows' room while the first answer comes, so the form doesn't grow under the finger.
          <div className="h-[132px]" />
        ) : (
          boutiques.map((option) => {
            const stocked = hasStock(option, products);
            return (
              <label
                key={option.slug}
                className={`flex min-h-[44px] items-center justify-between gap-4 border-t border-hairline text-[14px] last:border-b ${stocked ? 'cursor-pointer' : 'cursor-not-allowed text-mist'}`}
              >
                <span>
                  {option.name}
                  {stocked ? '' : ` · ${t.notInStock}`}
                </span>
                <input
                  type="radio"
                  name="boutique"
                  value={option.slug}
                  checked={chosen?.slug === option.slug}
                  disabled={!stocked}
                  onChange={() => changed(setBoutique)(option.slug)}
                  className="m-0 h-[18px] w-[18px] shrink-0"
                />
              </label>
            );
          })
        )}
      </fieldset>

      <ChipRow
        label={t.date}
        options={bookingDays(now).map((day) => ({ value: day.date, label: dayLabel(day.date, locale) }))}
        value={date}
        onChange={changed(setDate)}
      />

      {/* The time, or why there's none yet. The room for a row of chips is kept, so nothing jumps while a day is checked. */}
      <div className="flex min-h-[68px] flex-col justify-center gap-3">
        {validDate && availability.loading ? (
          <Spinner label={t.loading} className="py-0" />
        ) : validDate && availability.error ? (
          <ErrorNote
            error={availability.error}
            action={
              <button type="button" onClick={availability.retry} className="btn-text">
                {t.retry}
              </button>
            }
          >
            {errorText(availability.error, locale)}
          </ErrorNote>
        ) : validDate && chosen && !open ? (
          <ErrorNote role="status">{t.closedOnDate}</ErrorNote>
        ) : open ? (
          <ChipRow label={t.time} options={slots.map((slot) => ({ value: slot, label: slot }))} value={startTime} onChange={changed(setTime)} />
        ) : null}
        {dateProblem && <ErrorNote role="status">{t[dateProblem]}</ErrorNote>}
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="label">{t.note}</span>
        <textarea
          maxLength={500}
          rows={1}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder={t.notePlaceholder}
          className="field max-h-32 resize-none [field-sizing:content]"
        />
      </label>

      {problem && (
        // `chosen` is the boutique the request was for: picking another clears the problem.
        <ErrorNote error={problem}>{errorText(problem, locale, chosen?.name)}</ErrorNote>
      )}
      <div className="flex flex-col gap-2.5">
        {/* While it sends, the button stays black with LINE's light spinner: it's busy, not unavailable. */}
        <button
          type="submit"
          disabled={sending || !startTime || disabled}
          className={`btn-primary w-full ${sending ? 'disabled:cursor-wait disabled:bg-ink disabled:text-paper' : ''}`}
        >
          {sending && <img src="/line/LINE_spinner_light.svg" width={16} height={16} alt="" />}
          {sending ? t.loading : t.request}
        </button>
        {dismiss && (
          <button type="button" onClick={dismiss.onDismiss} disabled={sending || disabled} className="btn-secondary w-full">
            {dismiss.label}
          </button>
        )}
        <p className="text-center text-[12px] text-graphite">{t.confirmsOnLine}</p>
      </div>
    </form>
  );
}
```

- [ ] **Step 6: Make the sheet wrap it**

Replace `liff/components/booking-sheet.tsx` with the dialog around the form. The form's children inside the dialog are the same as before (handle, heading row, fieldset, day chips, time, note, problem, buttons), so `getByRole('dialog').locator('form')` in the browser tests still finds one form:

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { defaultVisit, shouldCloseOnKey } from '@/lib/booking';
import { COPY } from '@/lib/copy';
import { yen } from '@/lib/format';
import type { Product } from '@/lib/types';
import { BookingForm } from './booking-form';
import { useMaison } from './maison-provider';

/**
 * "Book a visit", as a bottom sheet over the product: the booking form (components/booking-form.tsx) for this piece, in a
 * dialog that takes the focus when it opens, and closes on Escape, on its close button and on a tap on the backdrop.
 * After a request the app moves to My visits, with the new visit.
 */
export function BookingSheet({ product, onClose }: { product: Product; onClose: () => void }) {
  const { locale } = useMaison();
  const t = COPY[locale];
  const router = useRouter();
  // The sheet's own start: Ginza, the next Saturday at least two days away, at 14:00.
  const [initial] = useState(() => defaultVisit());
  const heading = useRef<HTMLHeadingElement>(null);
  const pressedOnBackdrop = useRef(false);

  // Focus moves into the dialog when it opens, and Escape closes it: not while Japanese input composes, which it cancels.
  useEffect(() => {
    heading.current?.focus();
  }, []);
  useEffect(() => {
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (shouldCloseOnKey(event)) onClose();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  return (
    // A click on the backdrop closes the sheet: pressed and released there, not a drag that ends outside the sheet.
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t.bookVisit}
      onPointerDown={(event) => {
        pressedOnBackdrop.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && pressedOnBackdrop.current) onClose();
      }}
      className="fixed inset-0 z-30 flex items-end bg-ink/45 stage:absolute"
    >
      <BookingForm
        screen="product"
        products={[product.slug]}
        initial={initial}
        // `sending` stays on in the form: its button stays disabled while the app moves to the visits screen.
        onBooked={(appointment) => router.push(`/visits?ref=${appointment.reference}`)}
        className="flex max-h-[90%] w-full flex-col gap-[18px] overflow-y-auto bg-paper px-[calc(1.25rem+var(--line-safe-x))] pb-[calc(1.25rem+var(--line-safe-bottom))] pt-2.5"
        header={
          <>
            {/* The grab handle: the one rounded thing in the design. */}
            <div aria-hidden="true" className="mx-auto h-1 w-9 shrink-0 rounded-[2px] bg-hairline" />
            <div className="flex items-center justify-between gap-4">
              <div className="flex min-w-0 flex-col gap-1">
                <h2 ref={heading} tabIndex={-1} className="text-[20px] font-normal leading-tight outline-none">
                  {t.bookVisit}
                </h2>
                <p className="text-[13px] text-graphite">
                  {product.name} · <span className="tabular-nums">{yen(product.priceJpy, locale)}</span>
                </p>
              </div>
              <button type="button" onClick={onClose} aria-label={t.close} className="-mr-3 flex h-11 w-11 shrink-0 items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" aria-hidden="true">
                  <path d="M2 2l12 12M14 2L2 14" />
                </svg>
              </button>
            </div>
          </>
        }
      />
    </div>
  );
}
```

- [ ] **Step 7: Run the unit tests and the typecheck**

Run: `npm test --prefix liff && npm run typecheck --prefix liff`
Expected: every test passes (456), and `tsc --noEmit` prints nothing.

- [ ] **Step 8: Run the sheet's browser tests, unchanged**

Strapi must be running on 1338 in local mode (`npm run dev:strapi` from the repo root, in its own terminal; `npm run mode` says local). Playwright reuses the app on 3003, or starts it with `npm run dev`.

Run: `npm run test:e2e --prefix liff`
Expected: PASS, with one of the two "Chat with Maison on LINE" tests skipped (which one depends on `NEXT_PUBLIC_LINE_OA_ID`). The booking ones (booking and My visits, the Japanese request's `ja`, Osaka's Tuesday, a boutique without the piece, a day that has become today) pass as they are. The run resets the demo's appointments, as it always has.

- [ ] **Step 9: Commit**

```bash
git add liff/lib/booking.ts liff/lib/booking.test.ts liff/components/booking-form.tsx liff/components/booking-sheet.tsx
git commit -m "feat(liff): the booking sheet's form is a component of its own, and a boutique is offered for several pieces when it has one of them" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- liff/lib/booking.ts liff/lib/booking.test.ts liff/components/booking-form.tsx liff/components/booking-sheet.tsx
```

---

### Task 2: The visit picker's rules, pure

`liff/lib/visit-picker.ts` holds everything about the picker that can be decided without React or a network: the tool's name, the answer's shape, the prefill and its fallbacks, which picker is live, what a picker's part shows, the resume predicate, and the composer's lock.

**Files:**
- Create: `liff/lib/visit-picker.ts`
- Test: `liff/lib/visit-picker.test.ts`

**Interfaces:**
- Consumes: `bookingDays`, `defaultVisit`, `type VisitChoice` (Task 1, `liff/lib/booking.ts`); `bookingState`, `isBookableDate` (Task 1, in the tests); `pieceSlugOf` (`liff/lib/piece-slug.ts`); `type Appointment` (`liff/lib/types.ts`).
- Produces (`liff/lib/visit-picker.ts`):
  - `CHOOSE_VISIT = 'choose_visit'`
  - `type VisitPickerOutput = { status: 'requested'; appointment: Appointment } | { status: 'closed' }`
  - `interface PickerPart { type: string; toolName?: string; toolCallId?: string; state?: string; input?: unknown; output?: unknown }`
  - `interface PickerMessage { role: string; parts: ReadonlyArray<PickerPart> }`
  - `type PickerView = { kind: 'form'; canSend: boolean } | { kind: 'requested'; appointment: Appointment } | { kind: 'closed' } | { kind: 'unsent' } | { kind: 'none' }`
  - `visitPickerOutputOf(output: unknown): VisitPickerOutput | null`
  - `requestedVisitOf(part: PickerPart): Appointment | null`
  - `isWaitingPicker(part: PickerPart): boolean`
  - `piecesOf(input: unknown): string[]`
  - `pickerPrefill(input: unknown, now: Date): VisitChoice`
  - `livePickerOf(messages: readonly PickerMessage[]): string | null`
  - `pickerViewOf(part: { state?: string; output?: unknown }, place: { live: boolean; busy: boolean }): PickerView`
  - `resumesAfterPicker({ messages }: { messages: readonly PickerMessage[] }): boolean`
  - `composerLocked(busy: boolean, pickerSending: boolean): boolean`

- [ ] **Step 1: Write the failing tests**

Create `liff/lib/visit-picker.test.ts`. The tests for Review Focus 1 to 5 are here: `composerLocked`, `pickerViewOf`'s `none` for a refused call, `resumesAfterPicker` after an empty reply, the half-hour, and two pickers in one message:

```ts
import { describe, expect, it } from 'vitest';

import { bookingState, isBookableDate } from './booking';
import type { BoutiqueInfo } from './types';
import {
  CHOOSE_VISIT,
  composerLocked,
  isWaitingPicker,
  livePickerOf,
  piecesOf,
  pickerPrefill,
  pickerViewOf,
  requestedVisitOf,
  resumesAfterPicker,
  visitPickerOutputOf,
  type PickerMessage,
  type PickerPart,
} from './visit-picker';

// 11:30 on Thursday 1 October 2026 in Tokyo. The form's chips run from Friday 2 to Thursday 15 October, and its default day
// is Saturday 3 October.
const NOW = new Date('2026-10-01T02:30:00Z');

const appointment = {
  reference: 'APT-0042',
  status: 'requested',
  boutique: { slug: 'ginza', name: 'Ginza Flagship' },
  requestedFor: '2026-10-10T14:00:00+09:00',
  products: [{ slug: 'weekender-50', name: 'Weekender 50' }],
  note: '',
  confirmationSent: false,
};
/** A choose_visit call as the page holds it: the concierge's own tools arrive as `tool-<name>` parts. */
const picker = (state: string, extra: Partial<PickerPart> = {}): PickerPart => ({
  type: `tool-${CHOOSE_VISIT}`,
  toolCallId: 'call-1',
  state,
  input: { productSlugs: ['weekender-50'], boutique: 'ginza', date: '2026-10-10', time: '14:00' },
  ...extra,
});
const requested = picker('output-available', { output: { status: 'requested', appointment } });
const closed = picker('output-available', { output: { status: 'closed' } });
const waiting = picker('input-available');
const step: PickerPart = { type: 'step-start' };
const words = (text: string): PickerPart => ({ type: 'text', text } as PickerPart);
const user = (text: string): PickerMessage => ({ role: 'user', parts: [words(text)] });
const concierge = (...parts: PickerPart[]): PickerMessage => ({ role: 'assistant', parts });

describe('visitPickerOutputOf', () => {
  it('reads the two answers the picker gives: the visit it requested, or closed', () => {
    expect(visitPickerOutputOf({ status: 'requested', appointment })).toEqual({ status: 'requested', appointment });
    expect(visitPickerOutputOf({ status: 'closed' })).toEqual({ status: 'closed' });
  });

  it("reads nothing else: a request with no visit to show isn't one", () => {
    for (const output of [undefined, null, 'closed', [], {}, { status: 'requested' }, { status: 'requested', appointment: {} }, { status: 'requested', appointment: { reference: '' } }, { status: 'booked', appointment }]) {
      expect(visitPickerOutputOf(output), JSON.stringify(output)).toBeNull();
    }
  });
});

describe('requestedVisitOf and isWaitingPicker', () => {
  it("give an answered picker's visit, and tell a picker still waiting for the customer", () => {
    expect(requestedVisitOf(requested)).toEqual(appointment);
    expect(requestedVisitOf(closed)).toBeNull();
    expect(requestedVisitOf(waiting)).toBeNull();
    expect(isWaitingPicker(waiting)).toBe(true);
    expect(isWaitingPicker(picker('input-streaming'))).toBe(true);
    expect(isWaitingPicker(requested)).toBe(false);
  });

  it('read only choose_visit: another tool with the same output is no picker', () => {
    const booking = { type: 'dynamic-tool', toolName: 'request_appointment', state: 'output-available', output: { status: 'requested', appointment } };
    expect(requestedVisitOf(booking)).toBeNull();
    expect(isWaitingPicker({ type: 'tool-resolve_date', state: 'input-available' })).toBe(false);
    // A call the SDK refused (its input broke the schema) arrives as a dynamic part of that name: it waits for nothing.
    expect(isWaitingPicker({ type: 'dynamic-tool', toolName: CHOOSE_VISIT, state: 'output-error' })).toBe(false);
  });
});

describe('piecesOf', () => {
  it("is the call's pieces, in order, each once, at most five", () => {
    expect(piecesOf({ productSlugs: ['weekender-50', 'cabin-case-55'] })).toEqual(['weekender-50', 'cabin-case-55']);
    expect(piecesOf({ productSlugs: ['weekender-50', 'weekender-50', 'cabin-case-55'] })).toEqual(['weekender-50', 'cabin-case-55']);
    expect(piecesOf({ productSlugs: ['a', 'b', 'c', 'd', 'e', 'f'] })).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('keeps only slugs, and is empty when the call has none', () => {
    expect(piecesOf({ productSlugs: ['Weekender 50', 'weekender-50', 42, null] })).toEqual(['weekender-50']);
    for (const input of [undefined, null, 'weekender-50', {}, { productSlugs: 'weekender-50' }]) expect(piecesOf(input), JSON.stringify(input)).toEqual([]);
  });
});

describe('pickerPrefill', () => {
  it('fills the form in with what the call named', () => {
    expect(pickerPrefill({ productSlugs: ['weekender-50'], boutique: 'omotesando', date: '2026-10-10', time: '16:30' }, NOW)).toEqual({
      boutique: 'omotesando',
      date: '2026-10-10',
      time: '16:30',
    });
  });

  it("falls back to the sheet's start for what the call left out: Ginza, the next Saturday at least two days away, 14:00", () => {
    for (const input of [{ productSlugs: ['weekender-50'] }, {}, null, undefined, 'ginza', []]) {
      expect(pickerPrefill(input, NOW), JSON.stringify(input)).toEqual({ boutique: 'ginza', date: '2026-10-03', time: '14:00' });
    }
  });

  it("keeps a boutique slug it doesn't know, for the form to fall back from, and drops what is no slug", () => {
    expect(pickerPrefill({ boutique: 'kyoto' }, NOW).boutique).toBe('kyoto');
    for (const boutique of ['Ginza Flagship', 42, '']) expect(pickerPrefill({ boutique }, NOW).boutique, JSON.stringify(boutique)).toBe('ginza');
  });

  it("falls back to the next Saturday for a day that isn't one of the form's chips", () => {
    for (const date of ['2026-10-01', '2026-09-30', '2026-10-16', '2026-02-30', '10/10', '2026-10-1', 20261010]) {
      expect(pickerPrefill({ date }, NOW).date, String(date)).toBe('2026-10-03');
    }
    // The first chip and the last.
    expect(pickerPrefill({ date: '2026-10-02' }, NOW).date).toBe('2026-10-02');
    expect(pickerPrefill({ date: '2026-10-15' }, NOW).date).toBe('2026-10-15');
  });

  it('falls back to 14:00 for a time that is no HH:MM', () => {
    for (const time of ['2 pm', '24:00', '14:00:00', '1400', 1400, '']) expect(pickerPrefill({ time }, NOW).time, String(time)).toBe('14:00');
  });

  // Review focus: "2:15 pm" must not become the boutique's first slot, 11:00. The chips are half-hours.
  it('puts a time between the half-hours on the half-hour it falls in', () => {
    expect(pickerPrefill({ time: '14:15' }, NOW).time).toBe('14:00');
    expect(pickerPrefill({ time: '14:45' }, NOW).time).toBe('14:30');
    expect(pickerPrefill({ time: '14:30' }, NOW).time).toBe('14:30');
    expect(formFor({ time: '14:15' }).startTime).toBe('14:00');
  });
});

/**
 * The seed's boutiques as find_boutiques answers for `date` and the Weekender 50 and the Cabin Case 55, 11:00 to 20:00:
 * Osaka has no Weekender, and is closed on Tuesdays.
 */
const boutiquesOn = (date: string): BoutiqueInfo[] => {
  const tuesday = new Date(`${date}T00:00:00Z`).getUTCDay() === 2;
  const boutique = (slug: string, open: boolean, weekenders: number): BoutiqueInfo => ({
    slug,
    name: slug,
    city: 'Tokyo',
    address: '',
    hours: [],
    openOnDate: open,
    hoursOnDate: open ? { opens: '11:00', closes: '20:00' } : null,
    stock: [
      { product: 'weekender-50', quantity: weekenders },
      { product: 'cabin-case-55', quantity: 1 },
    ],
  });
  return [boutique('ginza', true, 1), boutique('omotesando', true, 1), boutique('osaka', !tuesday, 0)];
};
/** The form a call opens with, once find_boutiques has answered: what it shows, and what Send request would send. */
const formFor = (input: Record<string, unknown>, products = ['weekender-50']) => {
  const { boutique, date, time } = pickerPrefill({ productSlugs: products, ...input }, NOW);
  return { date, ...bookingState({ date, boutique, time, products, boutiques: boutiquesOn(date), loading: false, now: NOW }) };
};

// What the model passes is never trusted: whatever it names, Send request only ever sends a slot the form offers.
describe('the form a call opens with', () => {
  it('falls back to the first boutique with one of the pieces, for a boutique unknown or without them', () => {
    expect(formFor({ boutique: 'kyoto' }).chosen?.slug).toBe('ginza');
    expect(formFor({ boutique: 'osaka', date: '2026-10-07' }).chosen?.slug).toBe('ginza'); // no Weekender there
    expect(formFor({ boutique: 'osaka', date: '2026-10-07' }, ['weekender-50', 'cabin-case-55']).chosen?.slug).toBe('osaka'); // one of the two
  });

  it("falls back to the boutique's first slot for a time outside its hours", () => {
    expect(formFor({ time: '09:00' }).startTime).toBe('11:00');
    expect(formFor({ time: '20:00' }).startTime).toBe('11:00');
    expect(formFor({ time: '19:30' }).startTime).toBe('19:30');
  });

  it('says closed on a day the boutique is closed, and sends nothing, as the sheet does', () => {
    const osakaOnTuesday = formFor({ boutique: 'osaka', date: '2026-10-06' }, ['cabin-case-55']);
    expect(osakaOnTuesday).toMatchObject({ open: false, startTime: undefined });
    expect(osakaOnTuesday.chosen?.slug).toBe('osaka');
  });

  it('only ever offers a slot that can be sent: a bookable day, at a boutique with one of the pieces, inside its hours', () => {
    for (const boutique of [undefined, 'ginza', 'osaka', 'kyoto', 'Ginza']) {
      for (const date of [undefined, '2026-10-01', '2026-10-02', '2026-10-06', '2026-10-10', '2026-10-31']) {
        for (const time of [undefined, '09:00', '11:00', '14:15', '19:30', '20:00', '2 pm']) {
          const form = formFor({ boutique, date, time });
          if (form.startTime === undefined) continue;
          const label = JSON.stringify({ boutique, date, time });
          expect(isBookableDate(form.date, NOW), label).toBe(true);
          expect(form.chosen?.stock.some((line) => line.product === 'weekender-50' && line.quantity > 0), label).toBe(true);
          expect(form.chosen?.openOnDate, label).toBe(true);
          expect(form.slots, label).toContain(form.startTime);
        }
      }
    }
  });
});

describe('livePickerOf', () => {
  it("is the newest message's picker, while it waits for the customer", () => {
    expect(livePickerOf([user('Can we schedule one?'), concierge(step, waiting)])).toBe('call-1');
    expect(livePickerOf([user('Can we schedule one?'), concierge(step, picker('input-streaming'))])).toBe('call-1');
  });

  it('is none once the customer has written after it: they moved past it', () => {
    expect(livePickerOf([user('Can we schedule one?'), concierge(step, waiting), user('Which boutique has it?')])).toBeNull();
  });

  it('is none once it has its answer, and none in an older message', () => {
    expect(livePickerOf([user('Can we schedule one?'), concierge(step, requested, step, words('Requested.'))])).toBeNull();
    expect(livePickerOf([user('Can we schedule one?'), concierge(step, waiting), user('Hello'), concierge(words('Good afternoon.'))])).toBeNull();
    expect(livePickerOf([])).toBeNull();
  });

  it('is none for a call with no id: an answer could not find it', () => {
    expect(livePickerOf([user('Can we schedule one?'), concierge({ ...waiting, toolCallId: undefined })])).toBeNull();
  });

  // Review focus: one live picker, even when the model called choose_visit twice in one reply.
  it('is the last waiting picker when the newest message has two: the other says no request was sent', () => {
    const second = picker('input-available', { toolCallId: 'call-2' });
    const messages = [user('Can we schedule one?'), concierge(step, waiting, step, second)];
    expect(livePickerOf(messages)).toBe('call-2');
    expect(pickerViewOf(waiting, { live: livePickerOf(messages) === waiting.toolCallId, busy: false })).toEqual({ kind: 'unsent' });
    // When an earlier picker is answered, it is no longer live, even if there's a later waiting picker after it.
    const asked = user('Can we schedule one?');
    expect(livePickerOf([asked, concierge(step, { ...waiting, toolCallId: 'call-0' }, requested)])).toBeNull();
    expect(livePickerOf([asked, concierge(step, { ...waiting, toolCallId: 'call-0' }, requested, step, words('Your visit is requested.'))])).toBeNull();
  });
});

describe('pickerViewOf', () => {
  it('shows the form for the live picker, which can send once no reply is coming in', () => {
    expect(pickerViewOf(waiting, { live: true, busy: false })).toEqual({ kind: 'form', canSend: true });
    expect(pickerViewOf(waiting, { live: true, busy: true })).toEqual({ kind: 'form', canSend: false });
  });

  it('shows nothing yet while the call is still coming in: the form opens with the whole of it', () => {
    expect(pickerViewOf(picker('input-streaming'), { live: true, busy: true })).toEqual({ kind: 'none' });
  });

  it('says no request was sent for a picker the customer moved past', () => {
    expect(pickerViewOf(waiting, { live: false, busy: false })).toEqual({ kind: 'unsent' });
    expect(pickerViewOf(picker('input-streaming'), { live: false, busy: false })).toEqual({ kind: 'unsent' });
  });

  it('shows the answer once there is one: the visit, or closed', () => {
    expect(pickerViewOf(requested, { live: false, busy: false })).toEqual({ kind: 'requested', appointment });
    expect(pickerViewOf(closed, { live: false, busy: true })).toEqual({ kind: 'closed' });
  });

  it("shows nothing for a call the SDK refused, and says nothing was sent for an answer it can't read", () => {
    expect(pickerViewOf({ state: 'output-error' }, { live: false, busy: false })).toEqual({ kind: 'none' });
    expect(pickerViewOf(picker('output-available', { output: { status: 'maybe' } }), { live: false, busy: false })).toEqual({ kind: 'unsent' });
  });
});

describe('resumesAfterPicker', () => {
  const asked = user('Can we schedule one?');

  it("resubmits when the last step holds the picker's answer, either answer, wherever the picker sits in it", () => {
    expect(resumesAfterPicker({ messages: [asked, concierge(step, requested)] })).toBe(true);
    expect(resumesAfterPicker({ messages: [asked, concierge(step, closed)] })).toBe(true);
    expect(resumesAfterPicker({ messages: [asked, concierge(step, words('Here is the picker.'), requested)] })).toBe(true);
    // The model called choose_visit beside another tool, which finished: the picker isn't the step's last part.
    const found = { type: 'dynamic-tool', toolName: 'find_boutiques', toolCallId: 'call-4', state: 'output-available', output: { content: [] } };
    expect(resumesAfterPicker({ messages: [asked, concierge(step, requested, found)] })).toBe(true);
    // The model called choose_visit twice: the earlier picker was never live and stays unanswered; the server drops it.
    expect(resumesAfterPicker({ messages: [asked, concierge(step, { ...waiting, toolCallId: 'call-0' }, requested)] })).toBe(true);
  });

  it('never resubmits for a picker still waiting, a call still running, or a turn that ended on Strapi tools: that could loop', () => {
    expect(resumesAfterPicker({ messages: [asked, concierge(step, waiting)] })).toBe(false);
    const searched = { type: 'dynamic-tool', toolName: 'search_products', toolCallId: 'call-2', state: 'output-available', output: { content: [] } };
    expect(resumesAfterPicker({ messages: [asked, concierge(step, searched)] })).toBe(false);
    expect(resumesAfterPicker({ messages: [asked, concierge(step, { type: 'tool-resolve_date', toolCallId: 'call-3', state: 'output-available', output: {} })] })).toBe(false);
    const running = { type: 'dynamic-tool', toolName: 'find_boutiques', toolCallId: 'call-5', state: 'input-available' };
    expect(resumesAfterPicker({ messages: [asked, concierge(step, requested, running)] })).toBe(false);
  });

  it("stops once the concierge's reply has continued the message, even when that reply was empty", () => {
    expect(resumesAfterPicker({ messages: [asked, concierge(step, requested, step, words('Your visit is requested.'))] })).toBe(false);
    expect(resumesAfterPicker({ messages: [asked, concierge(step, requested, step)] })).toBe(false);
    expect(resumesAfterPicker({ messages: [asked, concierge(step, closed, step, words(''))] })).toBe(false);
  });

  it('never resubmits when the customer spoke last, or there is nothing', () => {
    expect(resumesAfterPicker({ messages: [asked, concierge(step, requested), user('Thank you.')] })).toBe(false);
    expect(resumesAfterPicker({ messages: [] })).toBe(false);
  });
});

describe('composerLocked', () => {
  it("holds the composer while a reply comes in or the picker's request is on its way, so no message moves past a visit being booked", () => {
    expect(composerLocked(false, false)).toBe(false);
    expect(composerLocked(true, false)).toBe(true);
    expect(composerLocked(false, true)).toBe(true);
    expect(composerLocked(true, true)).toBe(true);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm test --prefix liff -- lib/visit-picker.test.ts`
Expected: FAIL: `Cannot find module './visit-picker'`.

- [ ] **Step 3: Write the implementation**

Create `liff/lib/visit-picker.ts`:

```ts
import { bookingDays, defaultVisit, type VisitChoice } from './booking';
import { pieceSlugOf } from './piece-slug';
import type { Appointment } from './types';

/**
 * The visit picker's rules, pure: the concierge's choose_visit call (lib/concierge.ts) shows the booking form in the chat
 * (components/visit-picker.tsx), filled in from the call, and the customer's answer goes back to the concierge.
 */

/** The concierge's own tool that shows the picker. It has no execute: the customer answers it, in the chat. */
export const CHOOSE_VISIT = 'choose_visit';

/** The most pieces one visit is for: choose_visit's and request_appointment's limit. */
const MAX_PIECES = 5;

/** HH:MM, 24-hour, as choose_visit takes a time. */
const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * The customer's answer, which the page hands the concierge (useChat's addToolOutput): the visit request_appointment
 * stored (its structuredContent.appointment), or that they closed the picker without a request.
 */
export type VisitPickerOutput = { status: 'requested'; appointment: Appointment } | { status: 'closed' };

/** What these rules need from a message part. */
export interface PickerPart {
  type: string;
  toolName?: string;
  toolCallId?: string;
  state?: string;
  input?: unknown;
  output?: unknown;
}

/** What these rules need from a message. */
export interface PickerMessage {
  role: string;
  parts: ReadonlyArray<PickerPart>;
}

/** What the chat shows for a picker: its form, the visit's card, a short line, or nothing more than its tool line. */
export type PickerView =
  | { kind: 'form'; canSend: boolean }
  | { kind: 'requested'; appointment: Appointment }
  | { kind: 'closed' }
  | { kind: 'unsent' }
  | { kind: 'none' };

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Whether a part is a choose_visit call: a `tool-choose_visit` part, as the concierge's own tools arrive, or a dynamic one
 * of that name, as a call whose input broke the schema arrives.
 */
const isPicker = (part: PickerPart): boolean => part.type === `tool-${CHOOSE_VISIT}` || (part.type === 'dynamic-tool' && part.toolName === CHOOSE_VISIT);

/** A call that has no output yet: the model is still writing it (input-streaming), or it waits for the customer (input-available). */
const waits = (state: string | undefined) => state === 'input-streaming' || state === 'input-available';

/** A picker's answer, as the page wrote it, or null for anything else: a request with no visit to show isn't one. */
export const visitPickerOutputOf = (output: unknown): VisitPickerOutput | null => {
  if (!isObject(output)) return null;
  if (output.status === 'closed') return { status: 'closed' };
  const { appointment } = output;
  if (output.status === 'requested' && isObject(appointment) && typeof appointment.reference === 'string' && appointment.reference !== '') {
    return { status: 'requested', appointment: appointment as unknown as Appointment };
  }
  return null;
};

/** The visit an answered picker requested, or null: for any other part, a closed picker and one still waiting. */
export const requestedVisitOf = (part: PickerPart): Appointment | null => {
  if (!isPicker(part) || part.state !== 'output-available') return null;
  const answer = visitPickerOutputOf(part.output);
  return answer?.status === 'requested' ? answer.appointment : null;
};

/** Whether a part is a picker that waits for the customer. */
export const isWaitingPicker = (part: PickerPart): boolean => isPicker(part) && waits(part.state);

/** The pieces a picker is for: its call's productSlugs that are slugs, in order, each once, at most five. */
export const piecesOf = (input: unknown): string[] => {
  const slugs = isObject(input) && Array.isArray(input.productSlugs) ? input.productSlugs : [];
  return [...new Set(slugs.flatMap((slug) => pieceSlugOf(slug) ?? []))].slice(0, MAX_PIECES);
};

/**
 * The boutique, day and time the picker's form starts with: what the call named, with the sheet's fallbacks
 * (defaultVisit). The form then applies the rest, once find_boutiques has answered (bookingState in lib/booking.ts).
 * - The boutique: the call's slug, else Ginza. The form uses it only when it has one of the pieces: else the first that has one.
 * - The day: the call's, when it is one of the form's chips (bookingDays), else the next Saturday at least two days away.
 * - The time: the call's, on the half-hour it falls in (14:15 is 14:00, as the chips are half-hours), else 14:00. The
 *   form uses it only when the boutique is open then: else its first slot.
 */
export const pickerPrefill = (input: unknown, now: Date): VisitChoice => {
  const fallback = defaultVisit(now);
  const call = isObject(input) ? input : {};
  // A boutique's slug has a piece's form: lower-case letters, digits and hyphens.
  const boutique = pieceSlugOf(call.boutique) ?? fallback.boutique;
  const date = typeof call.date === 'string' && bookingDays(now).some((day) => day.date === call.date) ? call.date : fallback.date;
  const time = typeof call.time === 'string' && HH_MM.test(call.time) ? `${call.time.slice(0, 3)}${Number(call.time.slice(3)) < 30 ? '00' : '30'}` : fallback.time;
  return { boutique, date, time };
};

/**
 * The picker that may send: the last one waiting in the newest message, when that message is the concierge's. Its call's
 * id, or null. A picker in an older message is one the customer moved past, and so is one the customer wrote after.
 * A waiting picker is live only if no answered picker comes after it in the message.
 */
export const livePickerOf = (messages: readonly PickerMessage[]): string | null => {
  const last = messages.at(-1);
  if (last?.role !== 'assistant') return null;

  // Find the last waiting picker that has no answered picker after it
  for (let i = last.parts.length - 1; i >= 0; i--) {
    const part = last.parts[i];
    if (isWaitingPicker(part) && typeof part.toolCallId === 'string') {
      // Check if there's an answered picker after this one
      const hasAnsweredAfter = last.parts.slice(i + 1).some((p) => {
        const isPickerPart = p.type === `tool-${CHOOSE_VISIT}` || (p.type === 'dynamic-tool' && p.toolName === CHOOSE_VISIT);
        return isPickerPart && p.state === 'output-available';
      });
      if (!hasAnsweredAfter) {
        return part.toolCallId;
      }
    }
  }
  return null;
};

/**
 * What the chat shows for a picker's part. `live`: it is the one livePickerOf names. `busy`: a reply is coming in.
 * - Its answer, once it has one: the visit it requested, or closed. An answer it can't read says no request was sent.
 * - The form, for the live picker once its call has arrived whole, which can send only when no reply is coming in.
 * - No request sent, for a picker the customer moved past.
 * - Nothing more than its tool line while the call is still coming in, and for a call the SDK refused (output-error).
 */
export const pickerViewOf = (part: { state?: string; output?: unknown }, { live, busy }: { live: boolean; busy: boolean }): PickerView => {
  if (part.state === 'output-available') {
    const answer = visitPickerOutputOf(part.output);
    if (answer?.status === 'requested') return { kind: 'requested', appointment: answer.appointment };
    return answer?.status === 'closed' ? { kind: 'closed' } : { kind: 'unsent' };
  }
  if (!waits(part.state)) return { kind: 'none' };
  if (!live) return { kind: 'unsent' };
  return part.state === 'input-available' ? { kind: 'form', canSend: !busy } : { kind: 'none' };
};

/** Whether a part is a tool call: a Maison tool (`dynamic-tool`), or one of the concierge's own (`tool-<name>`). */
const isCall = (part: PickerPart): boolean => part.type === 'dynamic-tool' || part.type.startsWith('tool-');

/**
 * useChat's sendAutomaticallyWhen: resubmit only when the last step of the last message holds an answered picker, and
 * every other call in that step has finished, wherever the picker sits in it (the model may call choose_visit beside
 * another tool). A picker the customer moved past stays unanswered and doesn't count: the server drops it
 * (ignoreIncompleteToolCalls). Not the SDK's lastAssistantMessageIsCompleteWithToolCalls, which would also resubmit a
 * turn that ended on Strapi's tools and could loop. The concierge's reply continues that same message in a new step (its
 * step-start), which turns this false.
 */
export const resumesAfterPicker = ({ messages }: { messages: readonly PickerMessage[] }): boolean => {
  const last = messages.at(-1);
  if (last?.role !== 'assistant') return false;
  const step = last.parts.slice(last.parts.findLastIndex((part) => part.type === 'step-start') + 1);
  const calls = step.filter(isCall);
  return calls.some((part) => isPicker(part) && part.state === 'output-available') && calls.every((part) => isPicker(part) || !waits(part.state));
};

/**
 * Whether the customer must wait to send a message: while a reply comes in, and while a picker's request is on its way.
 * A message sent then would move past the picker, which would read "No request sent." over a visit being booked.
 */
export const composerLocked = (busy: boolean, pickerSending: boolean): boolean => busy || pickerSending;
```

- [ ] **Step 4: Run them to see them pass**

Run: `npm test --prefix liff -- lib/visit-picker.test.ts`
Expected: PASS, 31 tests.

- [ ] **Step 5: Run the whole suite and the typecheck**

Run: `npm test --prefix liff && npm run typecheck --prefix liff`
Expected: every test passes (487), and `tsc --noEmit` prints nothing.

- [ ] **Step 6: Commit**

```bash
git add liff/lib/visit-picker.ts liff/lib/visit-picker.test.ts
git commit -m "feat(liff): the visit picker's rules: what it starts with, which one is live, and when the chat goes on" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- liff/lib/visit-picker.ts liff/lib/visit-picker.test.ts
```

---

### Task 3: The concierge's server: `choose_visit`, and no booking by the model

The model gets `choose_visit` (no `execute`, strict input with `resolve_date`'s tidying) and loses `request_appointment`. Rules 3 to 5 change to the spec's words. An unanswered picker is dropped from what the model reads, and a resume isn't logged twice.

**Files:**
- Modify: `liff/lib/concierge.ts` (imports; the instructions' comment and rules 3 to 5, lines 47-69; `resolveDateTool`'s description, line 125; a new tool after `resolveDateTool`; `handleConcierge`, lines 440-445, 452 and 488)
- Test: `liff/lib/concierge.test.ts`

**Interfaces:**
- Consumes: `CHOOSE_VISIT` (Task 2).
- Produces: the model's tools are the Maison tools without `request_appointment` and `log_inquiry`, plus `resolve_date` and `choose_visit`. A `choose_visit` call reaches the page as `{ type: 'tool-choose_visit', toolCallId, state: 'input-available', input }`, its input tidied: `{ productSlugs: string[]; boutique?: string; date?: string; time?: string }`. A request whose last message is the assistant's continues that message (its id in the stream's `start` chunk) and isn't logged.

- [ ] **Step 1: Update the tests that list the model's tools**

In `liff/lib/concierge.test.ts`, add the import after `import { handOffAt } from './tool-view';`:

```ts
import { CHOOSE_VISIT } from './visit-picker';
```

Replace every occurrence (four lines, at 282, 1061, 1426 and 1703) of each of these two assertions' lists:

```ts
.toEqual(['resolve_date', 'search_products']);
```
with
```ts
.toEqual([CHOOSE_VISIT, 'resolve_date', 'search_products']);
```
and
```ts
.toEqual(['resolve_date', 'search_knowledge']);
```
with
```ts
.toEqual([CHOOSE_VISIT, 'resolve_date', 'search_knowledge']);
```

Rename the test at line 277: replace

```ts
  it('gives the model resolve_date next to the Maison tools, and no tool of its own besides', async () => {
```
with
```ts
  it('gives the model resolve_date and choose_visit next to the Maison tools, and no tool of its own besides', async () => {
```

In the test at line 285 ("leaves hand_off_to_staff to Strapi"), replace

```ts
    expect(model.doStreamCalls[0].tools?.map((entry) => entry.name).sort()).toEqual(['hand_off_to_staff', 'resolve_date']);
```
with
```ts
    expect(model.doStreamCalls[0].tools?.map((entry) => entry.name).sort()).toEqual([CHOOSE_VISIT, 'hand_off_to_staff', 'resolve_date']);
```
and
```ts
    expect(other.doStreamCalls[0].tools?.map((entry) => entry.name)).toEqual(['resolve_date']);
```
with
```ts
    expect(other.doStreamCalls[0].tools?.map((entry) => entry.name).sort()).toEqual([CHOOSE_VISIT, 'resolve_date']);
```

- [ ] **Step 2: Move the locale tests off `request_appointment`**

The model no longer has `request_appointment`, so the two locale tests use `find_boutiques`, a Maison tool that takes a locale. In `maisonTools()` (line 318), replace

```ts
      request_appointment: maisonTool('request_appointment', { boutique: { type: 'string' }, locale: { type: 'string', enum: ['ja', 'en'] } }),
```
with
```ts
      find_boutiques: maisonTool('find_boutiques', { date: { type: 'string' }, locale: { type: 'string', enum: ['ja', 'en'] } }),
```

Replace the start of the two tests at lines 330-346:

```ts
  it("sends the conversation's locale to a Maison tool that takes one when the model leaves it out", async () => {
    // In an English chat the model booked without a locale, and the card showed 銀座本店, the catalog's default.
    for (const input of [{ boutique: 'ginza' }, { boutique: 'ginza', locale: null }, { boutique: 'ginza', locale: '' }]) {
      for (const locale of ['en', 'ja'] as const) {
        const { received, createMcpClient } = maisonTools();
        const model = callsThenReplies('request_appointment', input);
        await (await handleConcierge(ask('Bearer mcp_at_x', { ...hello, locale }), deps({ createMcpClient, model }))).text();
        expect(received, `${JSON.stringify(input)} in ${locale}`).toEqual([{ name: 'request_appointment', input: { boutique: 'ginza', locale } }]);
      }
    }
  });

  it("keeps the locale the model gives, and adds none to a tool that doesn't take one", async () => {
    const { received, createMcpClient } = maisonTools();
    const model = callsThenReplies('request_appointment', { boutique: 'ginza', locale: 'ja' });
    await (await handleConcierge(ask('Bearer mcp_at_x', { ...hello, locale: 'en' }), deps({ createMcpClient, model }))).text();
    expect(received).toEqual([{ name: 'request_appointment', input: { boutique: 'ginza', locale: 'ja' } }]);
```
with
```ts
  it("sends the conversation's locale to a Maison tool that takes one when the model leaves it out", async () => {
    // In an English chat the model booked without a locale, and the card showed 銀座本店, the catalog's default.
    for (const input of [{ date: '2026-10-10' }, { date: '2026-10-10', locale: null }, { date: '2026-10-10', locale: '' }]) {
      for (const locale of ['en', 'ja'] as const) {
        const { received, createMcpClient } = maisonTools();
        const model = callsThenReplies('find_boutiques', input);
        await (await handleConcierge(ask('Bearer mcp_at_x', { ...hello, locale }), deps({ createMcpClient, model }))).text();
        expect(received, `${JSON.stringify(input)} in ${locale}`).toEqual([{ name: 'find_boutiques', input: { date: '2026-10-10', locale } }]);
      }
    }
  });

  it("keeps the locale the model gives, and adds none to a tool that doesn't take one", async () => {
    const { received, createMcpClient } = maisonTools();
    const model = callsThenReplies('find_boutiques', { date: '2026-10-10', locale: 'ja' });
    await (await handleConcierge(ask('Bearer mcp_at_x', { ...hello, locale: 'en' }), deps({ createMcpClient, model }))).text();
    expect(received).toEqual([{ name: 'find_boutiques', input: { date: '2026-10-10', locale: 'ja' } }]);
```

- [ ] **Step 3: Add the picker's server tests**

Insert this block right before the comment `// When the knowledge search finds nothing, the app's server hands the question to staff itself (withAutoHandOff in` (line 599). It covers the spec's server cases: the tool set, the turn ending at the call, the tidying, refused input, an unanswered picker followed by a new user message (spec review focus 1), the resume, and one inquiry per customer message:

```ts
// The visit picker: the model calls choose_visit, the app's own tool with no execute, and the customer answers it in the
// chat. The picker books with request_appointment itself, so the model never gets that tool.
describe('the visit picker: choose_visit', () => {
  const say = (text: string, id = 'u1') => ({ id, role: 'user', parts: [{ type: 'text', text }] });
  const named = { productSlugs: ['weekender-50'], boutique: 'ginza', date: '2026-10-10', time: '14:00' };
  const appointment = {
    reference: 'APT-0042',
    status: 'requested',
    boutique: { slug: 'ginza', name: 'Ginza Flagship' },
    requestedFor: '2026-10-10T14:00:00+09:00',
    products: [{ slug: 'weekender-50', name: 'Weekender 50' }],
    note: '',
    confirmationSent: false,
  };
  /** The concierge's message with a picker in it, as the page holds it: waiting for the customer, or answered. */
  const withPicker = (state: 'input-available' | 'output-available', output?: unknown) => ({
    id: 'a1',
    role: 'assistant',
    parts: [{ type: 'step-start' }, { type: `tool-${CHOOSE_VISIT}`, toolCallId: 'call-1', state, input: named, ...(output === undefined ? {} : { output }) }],
  });
  /** One request through the route: the stream's events. */
  const converse = async (body: Record<string, unknown>, overrides: Record<string, unknown>) => {
    const response = await handleConcierge(ask('Bearer mcp_at_x', body), deps(overrides));
    expect(response.status).toBe(200);
    return eventsOf(await response.text());
  };
  /** The reply's message as the page rebuilds it from the stream (readUIMessageStream, as the chat reads it). */
  const replyOf = async (events: Array<Record<string, any>>): Promise<UIMessage> => {
    const stream = new ReadableStream<UIMessageChunk>({
      start(controller) {
        for (const event of events) controller.enqueue(event as UIMessageChunk);
        controller.close();
      },
    });
    let message: UIMessage | undefined;
    for await (const snapshot of readUIMessageStream({ stream })) message = snapshot;
    return message as UIMessage;
  };
  /** The tool calls the model was shown in its first call, by name. */
  const callsShown = (model: MockLanguageModelV4) =>
    model.doStreamCalls[0].prompt.flatMap((message) => (message.role === 'assistant' ? message.content : [])).flatMap((part) => (part.type === 'tool-call' ? [part.toolName] : []));

  it('never gives the model request_appointment, nor a description that names it: a call the model makes to it reaches nothing', async () => {
    const booked = vi.fn(async () => ({ content: [] }));
    const request = dynamicTool({ description: 'Requests a visit.', inputSchema: jsonSchema({ type: 'object', properties: {} }), execute: booked });
    const search = tool({ description: 'Search the catalog.', inputSchema: z.object({}), execute: async () => ({ products: [] }) });
    const { createMcpClient } = fakeMcp({ search_products: search, request_appointment: request });
    const model = callsThenReplies('request_appointment', { boutique: 'ginza' });
    await converse({ ...hello, locale: 'en' }, { createMcpClient, model });
    expect(model.doStreamCalls[0].tools?.map((entry) => entry.name).sort()).toEqual([CHOOSE_VISIT, 'resolve_date', 'search_products']);
    for (const entry of model.doStreamCalls[0].tools ?? []) expect(entry.type === 'function' ? entry.description : '', entry.name).not.toContain('request_appointment');
    expect(booked).not.toHaveBeenCalled();
  });

  it("ends the turn at a choose_visit call: the page gets a tool-choose_visit part waiting for the customer, and the model isn't called again", async () => {
    const { createMcpClient } = fakeMcp();
    const model = callsThenReplies(CHOOSE_VISIT, named);
    const events = await converse({ ...hello, locale: 'en' }, { createMcpClient, model });
    expect(model.doStreamCalls).toHaveLength(1);
    expect(events.some((event) => ['tool-output-available', 'tool-output-error', 'tool-input-error'].includes(event.type))).toBe(false);
    const picker = (await replyOf(events)).parts.find((part) => part.type === `tool-${CHOOSE_VISIT}`);
    expect(picker).toMatchObject({ toolCallId: 'call-1', state: 'input-available', input: named });
  });

  it("tidies choose_visit's input as resolve_date's: blanks and nulls are not given, case and spaces don't count, and a locale is ignored", async () => {
    const { createMcpClient } = fakeMcp();
    const sent = { productSlugs: ['weekender-50', 'cabin-case-55'], boutique: ' Ginza ', date: '', time: null, locale: 'en' };
    const events = await converse({ ...hello, locale: 'en' }, { createMcpClient, model: callsThenReplies(CHOOSE_VISIT, sent) });
    const picker = (await replyOf(events)).parts.find((part) => part.type === `tool-${CHOOSE_VISIT}`) as { input?: unknown } | undefined;
    expect(picker?.input).toStrictEqual({ productSlugs: ['weekender-50', 'cabin-case-55'], boutique: 'ginza' });
  });

  it("refuses choose_visit input it can't take, with the reason, so the model calls again: no picker shows for it", async () => {
    const refused = [
      {}, // no pieces
      { productSlugs: [] },
      { productSlugs: ['a', 'b', 'c', 'd', 'e', 'f'] }, // six
      { productSlugs: 'weekender-50' }, // not a list
      { productSlugs: ['Weekender 50'] }, // a name, not a slug
      { productSlugs: ['weekender-50'], boutique: 'Ginza Flagship' },
      { productSlugs: ['weekender-50'], date: '10 October' },
      { productSlugs: ['weekender-50'], time: '2 pm' },
      { productSlugs: ['weekender-50'], time: '14:00:00' },
      { productSlugs: ['weekender-50'], note: 'For my father.' }, // a key it doesn't have
    ];
    for (const input of refused) {
      const { createMcpClient } = fakeMcp();
      const model = callsThenReplies(CHOOSE_VISIT, input);
      const events = await converse({ ...hello, locale: 'en' }, { createMcpClient, model });
      expect(events.some((event) => event.type === 'tool-input-error'), JSON.stringify(input)).toBe(true);
      expect(model.doStreamCalls, `${JSON.stringify(input)}: the model is told why, and answers`).toHaveLength(2);
    }
  });

  it('drops a picker the customer moved past by writing: the model answers the new message, without an error', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {}); // a failed turn logs here
    try {
      const { createMcpClient } = fakeMcp();
      const model = replyModel();
      const messages = [say('Can we schedule one?'), withPicker('input-available'), say('Which boutique has it in stock?', 'u2')];
      const events = await converse({ messages, locale: 'en', product: 'weekender-50' }, { createMcpClient, model });
      expect(events.filter((event) => event.type === 'error')).toEqual([]);
      expect(events.filter((event) => event.type === 'text-delta').map((event) => event.delta).join('')).toBe('かしこまりました。');
      // The unanswered call is gone from what the model reads: a call with no result is one a provider refuses.
      expect(callsShown(model)).toEqual([]);
      expect(error).not.toHaveBeenCalled();
    } finally {
      error.mockRestore();
    }
  });

  it("shows the model the customer's answer, and replies in the same message: the concierge's own", async () => {
    for (const output of [{ status: 'requested', appointment }, { status: 'closed' }]) {
      const { createMcpClient } = fakeMcp();
      const model = replyModel();
      const messages = [say('Can we schedule one?'), withPicker('output-available', output)];
      const events = await converse({ messages, locale: 'en', product: 'weekender-50' }, { createMcpClient, model });
      // The reply continues the message with the picker in it (toUIMessageStream's originalMessages), so the page adds to it.
      expect(events.find((event) => event.type === 'start')?.messageId, output.status).toBe('a1');
      const results = model.doStreamCalls[0].prompt.flatMap((message) => (message.role === 'tool' ? message.content : []));
      expect(results, output.status).toMatchObject([{ type: 'tool-result', toolCallId: 'call-1', toolName: CHOOSE_VISIT, output: { type: 'json', value: output } }]);
    }
  });

  it("logs the customer's message once: when it arrives, and not again when the picker's answer resumes the turn", async () => {
    const logged = vi.fn(async (_input: unknown) => ({ content: [{ type: 'text', text: '{"logged":true}' }], structuredContent: { logged: true } }));
    const logTool = dynamicTool({ description: 'Logs a turn.', inputSchema: jsonSchema({ type: 'object', properties: {} }), execute: logged });
    const arrived = fakeMcp({ log_inquiry: logTool });
    await converse(
      { messages: [say('Can we schedule one?')], locale: 'en', product: 'weekender-50' },
      { createMcpClient: arrived.createMcpClient, model: callsThenReplies(CHOOSE_VISIT, { productSlugs: ['weekender-50'] }) }
    );
    await vi.waitFor(() => expect(arrived.close).toHaveBeenCalled());
    expect(logged).toHaveBeenCalledTimes(1);
    expect(logged.mock.calls[0][0]).toMatchObject({ message: 'Can we schedule one?', productSlug: 'weekender-50', locale: 'en' });

    const resumed = fakeMcp({ log_inquiry: logTool });
    const messages = [say('Can we schedule one?'), withPicker('output-available', { status: 'requested', appointment })];
    await converse({ messages, locale: 'en', product: 'weekender-50' }, { createMcpClient: resumed.createMcpClient });
    await vi.waitFor(() => expect(resumed.close).toHaveBeenCalled());
    expect(logged).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 4: Update the instruction tests to the new rules**

In the test "lets the model answer an opening-hours question without asking which day" (line 1964), replace

```ts
    // Rule 1 says to use the tools for opening hours; rule 4 must not forbid the one call that answers it. Only when no
    // day is named: a booking turn names one, and checks it with find_boutiques and that date.
    for (const locale of ['en', 'ja'] as const) {
      const text = conciergeInstructions(locale, now);
      expect(text, locale).toContain(
        "If the customer names no day, don't call it, don't pass a date to find_boutiques, and don't suggest a day yourself: ask which day suits them when they want to visit, and look up opening hours only when they ask about them, by calling find_boutiques without a date, which lists each boutique's weekly hours."
      );
      expect(text.match(/If the customer names no day/g), locale).toHaveLength(1); // one sentence, not two that start alike
      expect(text, locale).not.toMatch(/Don't look up opening hours unless/); // the old wording, which had no scope
```
with
```ts
    // Rule 1 says to use the tools for opening hours; rule 4 must not forbid the one call that answers it. Only when no
    // day is named: a booking turn names one, and checks it with find_boutiques and that date. With no day named, the
    // visit picker shows its own default: the model asks for none (rule 3).
    for (const locale of ['en', 'ja'] as const) {
      const text = conciergeInstructions(locale, now);
      expect(text, locale).toContain(
        "If the customer names no day, don't call it, don't pass a date to find_boutiques or choose_visit, and don't suggest a day yourself. Look up opening hours only when they ask about them, by calling find_boutiques without a date, which lists each boutique's weekly hours."
      );
      expect(text.match(/If the customer names no day/g), locale).toHaveLength(1); // one sentence, not two that start alike
      expect(text, locale).not.toMatch(/Don't look up opening hours unless/); // the old wording, which had no scope
      expect(text, locale).not.toMatch(/ask which day suits them/); // the picker shows a day: the model asks for none
```

Replace the test "forbids saying a visit is confirmed, in both reply languages" (line 1987)

```ts
  it('forbids saying a visit is confirmed, in both reply languages', () => {
    for (const locale of ['en', 'ja'] as const) {
      expect(conciergeInstructions(locale, now), locale).toMatch(/Never say a visit is confirmed\. Say it is requested, and that the boutique will confirm it on LINE/);
    }
  });
```
with it and two new tests, which hold rules 3 and 5 word for word:

```ts
  it('forbids saying a visit is confirmed, in both reply languages', () => {
    for (const locale of ['en', 'ja'] as const) {
      expect(conciergeInstructions(locale, now), locale).toContain('\n5. Never say a visit is confirmed.');
    }
  });

  // Rules 3 and 5, word for word: the visit picker. The model asks for nothing in words, and books nothing itself.
  const RULE_3 = `3. To request a visit, call choose_visit with the pieces the customer wants to see and, when they named them, the boutique slug, the day (the date resolve_date returned) and the time (HH:MM, 24-hour). Never ask for a boutique, day or time in words, and never restate them for a yes: the app shows them filled in, and the customer sends the request there. If no piece has come up yet, ask which one, or use the pieces you just suggested when the customer asks to see those.`;
  const RULE_5 = `5. Never say a visit is confirmed. When choose_visit answers requested, say in one short sentence that the visit is requested and the boutique will confirm it on LINE; the app shows the details. When it answers closed, offer help without pushing.`;

  it('sends a visit to choose_visit and the reply after it to one short sentence, in both reply languages', () => {
    for (const locale of ['en', 'ja'] as const) {
      const text = conciergeInstructions(locale, now);
      expect(text, locale).toContain(`\n${RULE_3}\n4. Call resolve_date only when the customer names a day`);
      expect(text, locale).toContain(`\n${RULE_5}\n6. If a tool returns an error`);
    }
  });

  it('never names request_appointment, asks for no yes, and has the model write no requestedFor: the picker books', () => {
    for (const locale of ['en', 'ja'] as const) {
      const text = conciergeInstructions(locale, now);
      expect(text, locale).not.toContain('request_appointment');
      expect(text, locale).not.toMatch(/wait for the customer's yes/);
      expect(text, locale).not.toContain('requestedFor');
    }
  });
```

In the test "sends the model to resolve_date for every day a customer names" (line 2030), replace

```ts
    expect(text).toMatch(/call resolve_date for it first, on its own, before find_boutiques with a date and before request_appointment/);
```
with
```ts
    expect(text).toMatch(/call resolve_date for it first, on its own, before find_boutiques with a date and before choose_visit/);
```
replace
```ts
    expect(text).toMatch(/If the customer names no day, don't call it, don't pass a date to find_boutiques, and don't suggest a day yourself/);
```
with
```ts
    expect(text).toMatch(/If the customer names no day, don't call it, don't pass a date to find_boutiques or choose_visit, and don't suggest a day yourself/);
```
and replace
```ts
    // What to send, and where the restatement after booking comes from.
    expect(text).toContain('YYYY-MM-DDTHH:MM:00+09:00');
    expect(text).toMatch(/the date from resolve_date/);
    expect(text).toMatch(/appointment\.requestedFor/);
    expect(text).toMatch(/never from what the customer asked/i);
    expect(text).toMatch(/no markdown/i);
```
with
```ts
    // What goes to the picker: the date resolve_date returned. The model writes no requestedFor and restates no booking.
    expect(text).toContain('the day (the date resolve_date returned)');
    expect(text).not.toContain('YYYY-MM-DDTHH:MM:00+09:00');
    expect(text).not.toMatch(/appointment\.requestedFor/);
    expect(text).toMatch(/no markdown/i);
```

- [ ] **Step 5: Run them to see them fail**

Run: `npm test --prefix liff -- lib/concierge.test.ts`
Expected: FAIL, 14 of 119:
- the five that list the model's tools ("gives the model resolve_date and choose_visit…", "leaves hand_off_to_staff to Strapi…", "leaves the search alone when the token has no hand_off_to_staff…", "never gives the model log_inquiry…", "logs nothing, and warns of nothing, when the token has no log_inquiry…");
- five picker tests ("never gives the model request_appointment…", "ends the turn at a choose_visit call…", "tidies choose_visit's input…", "drops a picker the customer moved past…": an `error` event from `MissingToolResultsError`, "logs the customer's message once…": called 2 times);
- four instruction tests (opening hours, rules 3 and 5, "never names request_appointment…", "sends the model to resolve_date…").

"refuses choose_visit input it can't take" and "shows the model the customer's answer…" already pass (an unknown tool is refused the same way, and `originalMessages` already continues the message): they stay as guards.

- [ ] **Step 6: Give the model `choose_visit`, withhold `request_appointment`, drop unanswered pickers, and log once**

In `liff/lib/concierge.ts`, add the import after `import { MAX_BODY_BYTES, isCustomerSession, readBody } from './strapi-proxy';`:

```ts
import { CHOOSE_VISIT } from './visit-picker';
```

In `resolveDateTool`'s description (line 125), replace `and call it before find_boutiques with a date and before request_appointment.` with `and call it before find_boutiques with a date and before choose_visit.`

Insert the new tool right after `resolveDateTool` (after its closing `  });`, before `export interface ConciergeDeps`). It has no `execute` (verified: `@ai-sdk/provider-utils/dist/index.d.ts:2058-2082` and `:2307`):

```ts
/** A slug, as the Maison tools take one (slugInput): lower-case letters, digits and hyphens. */
const SLUG = /^[a-z0-9-]{1,120}$/;

/**
 * choose_visit's input: a strict object, as resolve_date's, so a key it doesn't have is refused with its name, and the
 * same tidying (tidyInput): blanks and nulls mean "not given", case and spaces don't count, and a locale is ignored. The
 * picker checks the rest against the boutiques' hours and stock (lib/visit-picker.ts): a day or a time the call gets wrong
 * falls back, and is never sent as it is.
 */
const chooseVisitInput = z.preprocess(
  tidyInput,
  z.strictObject({
    productSlugs: z
      .array(z.string().regex(SLUG, 'Use product slugs, such as "weekender-50".'))
      .min(1)
      .max(5)
      .describe('The pieces the customer wants to see: 1 to 5 product slugs, from search_products or view_product.'),
    boutique: z.string().regex(SLUG, 'Use a boutique slug, such as "ginza".').optional().describe('Only when the customer named a boutique: its slug, such as "ginza".'),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD: the date resolve_date returned.').optional().describe('Only when the customer named a day: the date resolve_date returned, YYYY-MM-DD.'),
    time: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM, 24-hour: 2 pm is "14:00".')
      .optional()
      .describe('Only when the customer named a time: HH:MM, 24-hour, such as "14:00" for 2 pm.'),
  })
);

/**
 * The app's own tool for a visit: it shows the customer the visit picker, the product page's booking form, filled in
 * from the call. It has no execute: the model's call ends the step loop and reaches the browser as a tool-choose_visit
 * part waiting for its output, which the picker adds (addToolOutput) once the customer has sent the request or closed it.
 */
const chooseVisitTool = () =>
  tool({
    description:
      'Shows the customer the visit picker in the chat: the form to request a boutique visit, filled in with what you pass. Pass productSlugs, the pieces to see, and only what the customer named: the boutique slug, the date resolve_date returned, and the time as HH:MM (24-hour). The customer checks it and sends the request there, so your reply stops here until they answer. It answers status "requested", with the visit, once the customer has sent it, or status "closed" when they closed the picker without a request.',
    inputSchema: chooseVisitInput,
  });
```

In `handleConcierge`, replace

```ts
    // log_inquiry is the app's own call, made once a turn is over. The model is never offered it: the log says what happened, not what the model says happened.
    const { log_inquiry: logTool, ...mcpTools } = await mcp.tools();
    const question = lastQuestionOf(messages);
    // The Maison tools, with the chat's locale, and with the hand-off an empty knowledge search makes on its own.
    const maisonTools = withAutoHandOff(await withConversationLocale(mcpTools, locale), { question, piece, locale });
    const tools = { ...maisonTools, resolve_date: resolveDateTool(locale, now) };
```
with
```ts
    // log_inquiry is the app's own call, made once a turn is over. The model is never offered it: the log says what happened, not what the model says happened.
    // Nor request_appointment: the customer books in the visit picker (choose_visit), which calls it with their own session.
    const { log_inquiry: logTool, request_appointment: _bookedInThePicker, ...mcpTools } = await mcp.tools();
    const question = lastQuestionOf(messages);
    /**
     * A request whose last message is the concierge's own carries the customer's answer to a visit picker, and the reply
     * goes on in that message (resumesAfterPicker in lib/visit-picker.ts). Its turn was logged when the customer's message
     * arrived: one inquiry per customer message.
     */
    const resumed = messages.at(-1)?.role === 'assistant';
    // The Maison tools, with the chat's locale, and with the hand-off an empty knowledge search makes on its own.
    const maisonTools = withAutoHandOff(await withConversationLocale(mcpTools, locale), { question, piece, locale });
    const tools = { ...maisonTools, resolve_date: resolveDateTool(locale, now), [CHOOSE_VISIT]: chooseVisitTool() };
```

In `logTurn`, replace

```ts
      if (!logTool?.execute || question === '') return;
```
with
```ts
      if (!logTool?.execute || question === '' || resumed) return;
```

And in the `streamText` call, replace

```ts
      // With the tools, an earlier turn's tool results reach the model as each tool shapes them (toModelOutput), as
      // they did in that turn, and not as the raw MCP result.
      messages: await convertToModelMessages(messages, { tools }),
```
with (verified: `ai/dist/index.d.ts:5716-5720`)
```ts
      // With the tools, an earlier turn's tool results reach the model as each tool shapes them (toModelOutput), as
      // they did in that turn, and not as the raw MCP result. A visit picker the customer moved past by writing has no
      // answer: a call without a result is one the model call refuses (MissingToolResultsError), so it is left out, and
      // the model answers the new message (ignoreIncompleteToolCalls).
      messages: await convertToModelMessages(messages, { tools, ignoreIncompleteToolCalls: true }),
```

- [ ] **Step 7: Change rules 3 to 5**

In `conciergeInstructions`' comment (line 50), replace

```ts
 * resolve_date, uses what that returns, and restates the visit from what the booking returns. The calendar is only
```
with
```ts
 * resolve_date, and passes what that returns to choose_visit: the customer checks the visit, and sends it, in the app's
 * picker (lib/visit-picker.ts). The calendar is only
```

Replace rules 3, 4 and 5 (lines 67-69)

```ts
3. Before calling request_appointment, restate the boutique, the day (the weekday and date resolve_date returned), the time and the products in one short sentence, and wait for the customer's yes.
4. Call resolve_date only when the customer names a day, never to find out today's date, which is given above.${locale === 'ja' ? ' 日付が出ていないご相談では resolve_date を呼ばないでください。' : ''} Never work out or guess a date or weekday yourself. When the customer names a day ("Saturday", "tomorrow", "10 October"), call resolve_date for it first, on its own, before find_boutiques with a date and before request_appointment: weekday for a weekday name ("Saturday": week "this"; "next week's Saturday", 来週の土曜日: week "next"), relative for exactly "today", "tomorrow" or "day_after_tomorrow" ("the day after tomorrow", 明後日), date for any other day: a calendar date, or a day you read off the calendar, such as "in 3 days". If the customer names no day, don't call it, don't pass a date to find_boutiques, and don't suggest a day yourself: ask which day suits them when they want to visit, and look up opening hours only when they ask about them, by calling find_boutiques without a date, which lists each boutique's weekly hours. Use the date resolve_date returns, and the weekday it returns when you speak of that day, never a weekday from the customer's words. If isPast is true, that day has gone: ask for another day. For a day the calendar doesn't show ("next month"), ask the customer which day they mean. Write requestedFor as YYYY-MM-DDTHH:MM:00+09:00: the date from resolve_date, then T and the time in 24-hour form (2 pm is T14:00:00+09:00).
5. Never say a visit is confirmed. Say it is requested, and that the boutique will confirm it on LINE. After request_appointment, restate the boutique, date and time from the tool's result (appointment.boutique.name and appointment.requestedFor), with the weekday resolve_date returned for that date, never from what the customer asked for.
```
with these three lines. Rule 3 and rule 5's second half are the spec's words. Rule 4 keeps its text except: "before choose_visit" for "before request_appointment"; "or choose_visit" after "don't pass a date to find_boutiques"; "ask which day suits them when they want to visit" goes, because the new rule 3 says never to ask for a day in words (see Notes for the controller); and the requestedFor sentence goes:

```ts
3. To request a visit, call choose_visit with the pieces the customer wants to see and, when they named them, the boutique slug, the day (the date resolve_date returned) and the time (HH:MM, 24-hour). Never ask for a boutique, day or time in words, and never restate them for a yes: the app shows them filled in, and the customer sends the request there. If no piece has come up yet, ask which one, or use the pieces you just suggested when the customer asks to see those.
4. Call resolve_date only when the customer names a day, never to find out today's date, which is given above.${locale === 'ja' ? ' 日付が出ていないご相談では resolve_date を呼ばないでください。' : ''} Never work out or guess a date or weekday yourself. When the customer names a day ("Saturday", "tomorrow", "10 October"), call resolve_date for it first, on its own, before find_boutiques with a date and before choose_visit: weekday for a weekday name ("Saturday": week "this"; "next week's Saturday", 来週の土曜日: week "next"), relative for exactly "today", "tomorrow" or "day_after_tomorrow" ("the day after tomorrow", 明後日), date for any other day: a calendar date, or a day you read off the calendar, such as "in 3 days". If the customer names no day, don't call it, don't pass a date to find_boutiques or choose_visit, and don't suggest a day yourself. Look up opening hours only when they ask about them, by calling find_boutiques without a date, which lists each boutique's weekly hours. Use the date resolve_date returns, and the weekday it returns when you speak of that day, never a weekday from the customer's words. If isPast is true, that day has gone: ask for another day. For a day the calendar doesn't show ("next month"), ask the customer which day they mean.
5. Never say a visit is confirmed. When choose_visit answers requested, say in one short sentence that the visit is requested and the boutique will confirm it on LINE; the app shows the details. When it answers closed, offer help without pushing.
```

- [ ] **Step 8: Run the tests to see them pass**

Run: `npm test --prefix liff -- lib/concierge.test.ts`
Expected: PASS, 119 tests.

- [ ] **Step 9: Run the whole suite and the typecheck**

Run: `npm test --prefix liff && npm run typecheck --prefix liff`
Expected: every test passes (496), and `tsc --noEmit` prints nothing. (`_bookedInThePicker` is unused on purpose: the tsconfig has no `noUnusedLocals`.)

- [ ] **Step 10: Commit**

```bash
git add liff/lib/concierge.ts liff/lib/concierge.test.ts
git commit -m "feat(liff): the concierge prepares a visit with choose_visit, and only the customer's tap books it" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- liff/lib/concierge.ts liff/lib/concierge.test.ts
```

---

### Task 4: The picker in the chat

The chat renders a `choose_visit` part as the inline card around the shared form, its lines and the visit's card from its answer; "Try again" leaves pickers alone; the page resumes the chat after an answer and holds the composer while the picker sends; the suggestion chip and the three lines are in `COPY`.

**Files:**
- Modify: `liff/lib/copy.ts` (`ja.suggestions` line 107, `en.suggestions` line 207)
- Modify: `liff/lib/tool-view.ts` (imports, `ToolPart`, `LOCAL_TOOLS`, `toolView`)
- Modify: `liff/lib/chat-retry.ts` (imports, the comment, `needsRetry`)
- Create: `liff/components/visit-picker.tsx`
- Modify: `liff/components/chat-parts.tsx` (imports, `PickerContext`, `AssistantParts`)
- Modify: `liff/app/concierge/page.tsx`
- Test: `liff/lib/copy.test.ts` (create), `liff/lib/tool-view.test.ts`, `liff/lib/chat-retry.test.ts`

**Interfaces:**
- Consumes: `BookingForm` (Task 1); `CHOOSE_VISIT`, `type VisitPickerOutput`, `visitPickerOutputOf`, `isWaitingPicker`, `requestedVisitOf`, `piecesOf`, `pickerPrefill`, `livePickerOf`, `pickerViewOf`, `resumesAfterPicker`, `composerLocked` (Task 2); the `tool-choose_visit` part (Task 3).
- Produces:
  - `COPY[locale].notNow`, `.pickerClosed`, `.pickerUnsent`
  - `ToolPart.toolCallId?: string`; `toolView(part, locale).requestLine: string | null`
  - `interface PickerContext { live: string | null; busy: boolean; answer: (toolCallId: string, output: VisitPickerOutput) => void; onSending: (sending: boolean) => void }` and `AssistantParts({ parts, locale, picker: PickerContext })` (`liff/components/chat-parts.tsx`)
  - `VisitPicker({ input: unknown; canSend: boolean; onAnswer: (output: VisitPickerOutput) => void; onSending: (sending: boolean) => void })` (`liff/components/visit-picker.tsx`)

- [ ] **Step 1: Write the copy's test**

Create `liff/lib/copy.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { COPY } from './copy';

// The visit picker's words, as the spec's table has them, in both languages.
describe("the visit picker's copy", () => {
  it('has Not now and the two lines that take a picker\'s place', () => {
    expect([COPY.en.notNow, COPY.en.pickerClosed, COPY.en.pickerUnsent]).toEqual(['Not now', 'Closed without a request.', 'No request sent.']);
    expect([COPY.ja.notNow, COPY.ja.pickerClosed, COPY.ja.pickerUnsent]).toEqual(['今回は見送る', 'リクエストせずに閉じました。', 'リクエストは送信されていません。']);
  });

  it('suggests asking for a visit where "Yes, please." was, and keeps the first suggestion and the piece chips', () => {
    expect(COPY.en.suggestions).toEqual(["I'm looking for a gift under ¥400,000 for a friend who travels. Could I see it in Ginza on Saturday at 2 pm?", 'Can I book a visit?']);
    expect(COPY.ja.suggestions).toEqual(['旅好きの友人へのギフトを40万円以内で探しています。土曜日の14時に銀座で見られますか？', '来店を予約できますか？']);
    expect(COPY.en.pieceSuggestions).toEqual(['Can I have it personalized?', 'How do I care for it?', 'Which boutique has it in stock?']);
    expect(COPY.ja.pieceSuggestions).toEqual(['名入れはできますか？', 'お手入れ方法を教えてください。', 'どのブティックに在庫がありますか？']);
  });
});
```

- [ ] **Step 2: Write the picker's line tests**

In `liff/lib/tool-view.test.ts`, in the test "hands the page the appointment a booking made, and nothing else" (line 41), replace

```ts
    expect(view.line).toBe('MCP · request_appointment ✓');
    expect(view.products).toBeNull();
    expect(view.handOff).toBeNull();
  });
```
with
```ts
    expect(view.line).toBe('MCP · request_appointment ✓');
    expect(view.requestLine).toBeNull(); // its own line says it: only the picker's call needs one more
    expect(view.products).toBeNull();
    expect(view.handOff).toBeNull();
  });
```

Insert this block right before `describe('toolPartOf', () => {` (line 268):

```ts
// The visit picker's call (lib/visit-picker.ts): the concierge's own tool, answered by the customer in the chat. Its
// request_appointment call is made in the browser, outside the conversation, so its line comes from the picker's answer.
describe('toolView: choose_visit', () => {
  const appointment = { reference: 'APT-0042', status: 'requested', boutique: { slug: 'ginza', name: 'Ginza Flagship' }, requestedFor: '2026-10-10T14:00:00+09:00', products: [], note: '', confirmationSent: false };
  const call = { toolName: 'choose_visit', toolCallId: 'call-1', input: { productSlugs: ['weekender-50'], boutique: 'ginza', date: '2026-10-10', time: '14:00' } };

  it('shows a picker waiting for the customer as a local line with …, and hands the page nothing', () => {
    for (const state of ['input-streaming', 'input-available']) {
      const view = toolView({ ...call, state }, 'en');
      expect(view.line, state).toBe('Local · choose_visit …');
      expect(view.failed, state).toBe(false);
      expect(view.appointment, state).toBeNull();
      expect(view.requestLine, state).toBeNull();
    }
  });

  it("shows a requested visit as ✓ requested, with the line of the request_appointment call the picker made, and hands the page the visit's card", () => {
    const view = toolView({ ...call, state: 'output-available', output: { status: 'requested', appointment } }, 'en');
    expect(view.line).toBe('Local · choose_visit ✓ requested');
    expect(view.requestLine).toBe('MCP · request_appointment ✓');
    expect(view.appointment).toEqual(appointment);
    expect(view.failed).toBe(false);
    // The same in Japanese: the lines have no words of the copy in them.
    expect(toolView({ ...call, state: 'output-available', output: { status: 'requested', appointment } }, 'ja').line).toBe('Local · choose_visit ✓ requested');
  });

  it('shows a closed picker as ✓ closed, with no request line and no card', () => {
    const view = toolView({ ...call, state: 'output-available', output: { status: 'closed' } }, 'en');
    expect(view.line).toBe('Local · choose_visit ✓ closed');
    expect(view.requestLine).toBeNull();
    expect(view.appointment).toBeNull();
  });

  it("hands the page no card for an answer it can't read, and shows a refused call as a red ✕", () => {
    for (const output of [{ status: 'requested' }, { status: 'requested', appointment: {} }, null, 'requested']) {
      const view = toolView({ ...call, state: 'output-available', output }, 'en');
      expect(view.appointment, JSON.stringify(output)).toBeNull();
      expect(view.requestLine, JSON.stringify(output)).toBeNull();
      expect(view.line, JSON.stringify(output)).toBe('Local · choose_visit ✓');
    }
    // Input the schema refused: the SDK answers it as an error, and the model calls again.
    const refused = toolView({ toolName: 'choose_visit', state: 'output-error', errorText: 'Invalid input' }, 'en');
    expect(refused.line).toBe('Local · choose_visit ✕ error');
    expect(refused.failed).toBe(true);
  });

  it('keeps the call id the picker answers by', () => {
    expect(toolPartOf({ type: 'tool-choose_visit', toolCallId: 'call-1', state: 'input-available' } as { type: string })).toMatchObject({ toolName: 'choose_visit', toolCallId: 'call-1' });
  });
});
```

- [ ] **Step 3: Write the "Try again" tests**

In `liff/lib/chat-retry.test.ts`, replace the `Part` type on line 4:

```ts
type Part = { type: string; text?: string; toolName?: string; state?: string; output?: unknown; errorText?: string };
```
with
```ts
type Part = { type: string; text?: string; toolName?: string; toolCallId?: string; state?: string; output?: unknown; errorText?: string };
```

Then replace the end of the file:

```ts
    expect(needsRetry([...askedAboutBitcoin, assistant(foundNothing, knowledge('output-available', refusal))], false)).toBe(true); // the last search was refused
  });
});
```
with
```ts
    expect(needsRetry([...askedAboutBitcoin, assistant(foundNothing, knowledge('output-available', refusal))], false)).toBe(true); // the last search was refused
  });

  // The visit picker (lib/visit-picker.ts). Asking again drops the reply: a waiting picker with it, or, after a request,
  // the reply is asked for again, and the visit could be booked twice.
  describe('with a visit picker', () => {
    const picker = (state: string, output?: unknown): Part => ({ type: 'tool-choose_visit', toolCallId: 'call-1', state, ...(output === undefined ? {} : { output }) });
    const requestedVisit = picker('output-available', { status: 'requested', appointment: { reference: 'APT-0042', status: 'requested' } });
    const closedPicker = picker('output-available', { status: 'closed' });
    const askedToVisit = [user('Can we schedule one?')];
    const step = { type: 'step-start' };

    it('is false while a picker waits for the customer, with no words after it', () => {
      expect(needsRetry([...askedToVisit, assistant(step, picker('input-available'))], false)).toBe(false);
      expect(needsRetry([...askedToVisit, assistant(step, picker('input-streaming'))], false)).toBe(false);
      expect(needsRetry([...askedToVisit, assistant(text('Here it is.'), picker('input-available'))], false)).toBe(false);
      expect(needsRetry([...askedToVisit, assistant(step, resolveDate, step, picker('input-available'))], false)).toBe(false);
    });

    it('is false once the picker requested a visit, with no words after it, and after an empty reply to it', () => {
      expect(needsRetry([...askedToVisit, assistant(step, requestedVisit)], false)).toBe(false);
      expect(needsRetry([...askedToVisit, assistant(step, requestedVisit, step)], false)).toBe(false);
      expect(needsRetry([...askedToVisit, assistant(step, requestedVisit, step, text(' '))], false)).toBe(false);
    });

    it('still allows it after a picker the customer closed, when no words came after it: nothing was booked', () => {
      expect(needsRetry([...askedToVisit, assistant(step, closedPicker, step)], false)).toBe(true);
      expect(needsRetry([...askedToVisit, assistant(step, closedPicker, step, text('Happy to help with anything else.'))], false)).toBe(false);
    });

    it('allows it on a later reply that is empty, when the visit was requested in an earlier one', () => {
      expect(needsRetry([...askedToVisit, assistant(step, requestedVisit, step, text('Requested.')), user('Anything else for him?'), assistant(searchProducts)], false)).toBe(true);
    });
  });
});
```

- [ ] **Step 4: Run them to see them fail**

Run: `npm test --prefix liff -- lib/copy.test.ts lib/tool-view.test.ts lib/chat-retry.test.ts`
Expected: FAIL, 9 of 72: the two copy tests, five `toolView` tests (no `requestLine`, and `choose_visit` reads as an MCP tool), and two `needsRetry` tests (a waiting picker and a requested visit still offer "Try again").

- [ ] **Step 5: Add the copy**

In `liff/lib/copy.ts`, replace the Japanese suggestions (line 107)

```ts
    suggestions: ['旅好きの友人へのギフトを40万円以内で探しています。土曜日の14時に銀座で見られますか？', 'はい、お願いします。'],
```
with
```ts
    suggestions: ['旅好きの友人へのギフトを40万円以内で探しています。土曜日の14時に銀座で見られますか？', '来店を予約できますか？'],
    // The concierge's visit picker (components/visit-picker.tsx): the button beside Send request, and the lines that take
    // the picker's place when the customer closed it, or moved past it by writing.
    notNow: '今回は見送る',
    pickerClosed: 'リクエストせずに閉じました。',
    pickerUnsent: 'リクエストは送信されていません。',
```

and the English ones (line 207)

```ts
    suggestions: ["I'm looking for a gift under ¥400,000 for a friend who travels. Could I see it in Ginza on Saturday at 2 pm?", 'Yes, please.'],
```
with
```ts
    suggestions: ["I'm looking for a gift under ¥400,000 for a friend who travels. Could I see it in Ginza on Saturday at 2 pm?", 'Can I book a visit?'],
    notNow: 'Not now',
    pickerClosed: 'Closed without a request.',
    pickerUnsent: 'No request sent.',
```

- [ ] **Step 6: Show the picker's lines and card in `toolView`**

In `liff/lib/tool-view.ts`, replace

```ts
import type { Appointment, Locale, ProductCard } from './types';

/** What the chat needs from AI SDK 7's dynamic-tool UI part (MCP tools arrive as dynamic tools). */
export interface ToolPart {
  toolName: string;
  state: string;
```
with
```ts
import type { Appointment, Locale, ProductCard } from './types';
import { CHOOSE_VISIT, visitPickerOutputOf } from './visit-picker';

/** What the chat needs from AI SDK 7's dynamic-tool UI part (MCP tools arrive as dynamic tools). */
export interface ToolPart {
  toolName: string;
  /** The call's id: the visit picker hands its answer to the chat by it (addToolOutput). */
  toolCallId?: string;
  state: string;
```

Replace

```ts
/** The concierge's own tool. It isn't a Maison tool, so its line says "Local", not "MCP". */
const LOCAL_TOOLS = ['resolve_date'];
```
with
```ts
/** The concierge's own tools. They aren't Maison tools, so their lines say "Local", not "MCP". */
const LOCAL_TOOLS = ['resolve_date', CHOOSE_VISIT];
```

Insert after `resolvedDay` (after its closing `};`, before the comment `/**` that starts "What a call gave back"):

```ts
/** What a local tool's line says after its ✓: the day resolve_date worked out, or the customer's answer to the visit picker. */
const localAnswer = (part: ToolPart): string | null =>
  part.toolName === CHOOSE_VISIT ? (visitPickerOutputOf(part.output)?.status ?? null) : resolvedDay(part.output);

/** The visit an answered picker requested: request_appointment's own appointment, which the picker handed the chat. */
const pickedVisit = (part: ToolPart): Appointment | null => {
  const answer = part.state === 'output-available' ? visitPickerOutputOf(part.output) : null;
  return answer?.status === 'requested' ? answer.appointment : null;
};

/** The line of the request_appointment call the picker made in the browser, which isn't in the conversation: under the picker's own. */
const PICKER_REQUEST_LINE = 'MCP · request_appointment ✓';
```

Replace `toolView` (its comment and body, lines 81-106)

```ts
/**
 * What a tool call shows in the chat, built from its structuredContent, never from the model's text: its line ("MCP ·
 * search_products ✓ 5 results", "Local · resolve_date ✓ Saturday 2026-10-10", "… ✕ boutique_closed"), the products a
 * search found, the appointment a request made, and the question a hand-off recorded: the model's own call to
 * hand_off_to_staff, or the app's, which a search that found nothing carries (handOffAt decides where a message's note
 * goes).
 */
export const toolView = (part: ToolPart, locale: Locale) => {
  const t = COPY[locale];
  const local = LOCAL_TOOLS.includes(part.toolName);
  const { error, failed, data } = outcomeOf(part);
  const list = Object.values(data ?? {}).find(Array.isArray) as unknown[] | undefined;
  const answer = local && !failed ? resolvedDay(part.output) : null;
  const status = part.state.startsWith('input')
    ? '…'
    : failed
      ? `✕ ${error?.code ?? 'error'}`
      : `✓${answer ? ` ${answer}` : list ? ` ${t.results(list.length)}` : ''}`;
  return {
    line: `${local ? 'Local' : 'MCP'} · ${part.toolName} ${status}`,
    failed,
    products: part.toolName === 'search_products' && Array.isArray(data?.products) ? (data.products as ProductCard[]) : null,
    appointment: part.toolName === 'request_appointment' ? ((data?.appointment as Appointment | undefined) ?? null) : null,
    handOff: recordedBy(part),
  };
};
```
with

```ts
/**
 * What a tool call shows in the chat, built from its structuredContent, never from the model's text: its line ("MCP ·
 * search_products ✓ 5 results", "Local · resolve_date ✓ Saturday 2026-10-10", "Local · choose_visit ✓ requested", "… ✕
 * boutique_closed"), the products a search found, the appointment a request made (request_appointment's, or the one the
 * visit picker's answer carries, with `requestLine` for the call the picker made), and the question a hand-off recorded:
 * the model's own call to hand_off_to_staff, or the app's, which a search that found nothing carries (handOffAt decides
 * where a message's note goes).
 */
export const toolView = (part: ToolPart, locale: Locale) => {
  const t = COPY[locale];
  const local = LOCAL_TOOLS.includes(part.toolName);
  const { error, failed, data } = outcomeOf(part);
  const list = Object.values(data ?? {}).find(Array.isArray) as unknown[] | undefined;
  const answer = local && !failed ? localAnswer(part) : null;
  const status = part.state.startsWith('input')
    ? '…'
    : failed
      ? `✕ ${error?.code ?? 'error'}`
      : `✓${answer ? ` ${answer}` : list ? ` ${t.results(list.length)}` : ''}`;
  const appointment =
    part.toolName === 'request_appointment' ? ((data?.appointment as Appointment | undefined) ?? null) : part.toolName === CHOOSE_VISIT ? pickedVisit(part) : null;
  return {
    line: `${local ? 'Local' : 'MCP'} · ${part.toolName} ${status}`,
    failed,
    products: part.toolName === 'search_products' && Array.isArray(data?.products) ? (data.products as ProductCard[]) : null,
    appointment,
    requestLine: part.toolName === CHOOSE_VISIT && appointment ? PICKER_REQUEST_LINE : null,
    handOff: recordedBy(part),
  };
};
```

- [ ] **Step 7: Keep "Try again" off pickers**

In `liff/lib/chat-retry.ts`, add the import after `import { handOffAt } from './tool-view';`:

```ts
import { isWaitingPicker, requestedVisitOf } from './visit-picker';
```

In `needsRetry`'s comment, replace

```ts
 * Nor when the chat shows the reply's hand-off note (handOffAt in lib/tool-view.ts), under a hand-off that went through
```
with
```ts
 * Nor when the reply holds a visit picker that waits for the customer, or the visit one requested (lib/visit-picker.ts):
 * asking again would drop the picker, or ask for the reply after a booking again, and book twice.
 *
 * Nor when the chat shows the reply's hand-off note (handOffAt in lib/tool-view.ts), under a hand-off that went through
```

and in its body replace

```ts
  if (last.parts.some(mayHaveBooked)) return false;
  const note = handOffAt(last.parts);
```
with
```ts
  if (last.parts.some(mayHaveBooked)) return false;
  if (last.parts.some((part) => isWaitingPicker(part) || requestedVisitOf(part) !== null)) return false;
  const note = handOffAt(last.parts);
```

- [ ] **Step 8: Run the tests to see them pass**

Run: `npm test --prefix liff -- lib/copy.test.ts lib/tool-view.test.ts lib/chat-retry.test.ts`
Expected: PASS, 72 tests.

- [ ] **Step 9: Create the picker's card**

Create `liff/components/visit-picker.tsx`:

```tsx
'use client';

import { useState } from 'react';

import { COPY } from '@/lib/copy';
import type { Product } from '@/lib/types';
import { useTool } from '@/lib/use-tool';
import { piecesOf, pickerPrefill, type VisitPickerOutput } from '@/lib/visit-picker';
import { BookingForm } from './booking-form';
import { useMaison } from './maison-provider';

/** A piece's name in the picker's heading, as view_product gives it in the chat's language, never the model's words. Nothing until it's known. */
function PieceName({ slug }: { slug: string }) {
  const { locale } = useMaison();
  const piece = useTool<{ product: Product }>('concierge', 'view_product', { slug, locale });
  const name = piece.data?.product?.name;
  return name ? <li className="inline before:content-['_·_'] first:before:content-none">{name}</li> : null;
}

/**
 * The visit picker: the product page's booking form (components/booking-form.tsx) in an inline card under the concierge's
 * words, filled in from its choose_visit call (pickerPrefill in lib/visit-picker.ts). Send request books the visit as
 * the sheet does, with the customer's own session, and hands the concierge the appointment; Not now hands it "closed". A
 * refusal stays in the form, as on the sheet. Only the live picker sends, and not while a reply is coming in (`canSend`).
 */
export function VisitPicker({
  input,
  canSend,
  onAnswer,
  onSending,
}: {
  /** The choose_visit call's input: the pieces, and the boutique, day and time the customer named. */
  input: unknown;
  canSend: boolean;
  onAnswer: (output: VisitPickerOutput) => void;
  onSending: (sending: boolean) => void;
}) {
  const { locale } = useMaison();
  const t = COPY[locale];
  // The call is read once: from then on, what the form shows is the customer's to change.
  const [initial] = useState(() => pickerPrefill(input, new Date()));
  const products = piecesOf(input);

  return (
    <section data-testid="visit-picker" aria-label={t.bookVisit} className="border border-ink">
      <BookingForm
        screen="concierge"
        products={products}
        initial={initial}
        disabled={!canSend}
        onBooked={(appointment) => onAnswer({ status: 'requested', appointment })}
        onSendingChange={onSending}
        dismiss={{ label: t.notNow, onDismiss: () => onAnswer({ status: 'closed' }) }}
        className="flex flex-col gap-[18px] px-5 py-4"
        header={
          <div className="flex flex-col gap-1">
            <h2 className="text-[20px] font-normal leading-tight">{t.bookVisit}</h2>
            <ul className="text-[13px] text-graphite">
              {products.map((slug) => (
                <PieceName key={slug} slug={slug} />
              ))}
            </ul>
          </div>
        }
      />
    </section>
  );
}
```

- [ ] **Step 10: Render pickers in the chat's parts**

In `liff/components/chat-parts.tsx`, replace

```tsx
import type { Appointment, Locale, ProductCard } from '@/lib/types';
import { LineChat } from './line-chat';
import { ProductImage } from './product-grid';
```
with
```tsx
import type { Appointment, Locale, ProductCard } from '@/lib/types';
import { CHOOSE_VISIT, pickerViewOf, type VisitPickerOutput } from '@/lib/visit-picker';
import { LineChat } from './line-chat';
import { ProductImage } from './product-grid';
import { VisitPicker } from './visit-picker';
```

Replace `AssistantParts`' comment and signature

```tsx
/**
 * An assistant message, in the mockup's order: its words and tool lines as they came, a run of tool lines kept together,
 * with a booking card right under the lines that made it, "Chat with Maison on LINE" under the card, the hand-off note,
 * once, under the line handOffAt names (a hand-off that went through: the model's hand_off_to_staff, or a search that
 * found nothing and carries the one the app made; otherwise, with the plain note, the last search that found nothing, or
 * a hand-off that failed), and the pieces a search found under the message's words.
 */
export function AssistantParts({ parts, locale }: { parts: Array<{ type: string; text?: string }>; locale: Locale }) {
  const blocks: ReactNode[] = [];
```
with
```tsx
/** What the concierge page tells the parts about its visit pickers (lib/visit-picker.ts). */
export interface PickerContext {
  /** The picker that may send (livePickerOf): its call's id, or null. */
  live: string | null;
  /** A reply is coming in: the live picker waits for it to end. */
  busy: boolean;
  /** Hands the customer's answer to the chat for the call `toolCallId` (useChat's addToolOutput), which goes on by itself. */
  answer: (toolCallId: string, output: VisitPickerOutput) => void;
  /** Tells the page a picker's request is on its way (true), or ended in a problem (false): the composer waits meanwhile. */
  onSending: (sending: boolean) => void;
}

/**
 * An assistant message, in the mockup's order: its words and tool lines as they came, a run of tool lines kept together,
 * with a booking card right under the lines that made it, "Chat with Maison on LINE" under the card, the hand-off note,
 * once, under the line handOffAt names (a hand-off that went through: the model's hand_off_to_staff, or a search that
 * found nothing and carries the one the app made; otherwise, with the plain note, the last search that found nothing, or
 * a hand-off that failed), and the pieces a search found under the message's words. A visit picker sits under its line
 * (pickerViewOf): its form while it's the live one, then the visit's card, or a short line once closed or moved past.
 */
export function AssistantParts({ parts, locale, picker }: { parts: Array<{ type: string; text?: string }>; locale: Locale; picker: PickerContext }) {
  const t = COPY[locale];
  const blocks: ReactNode[] = [];
```

and in its loop replace

```tsx
    const view = toolView(tool, locale);
    lines.push(<ToolLine key={index} text={view.line} failed={view.failed} />);
    if (view.appointment) {
```
with
```tsx
    const view = toolView(tool, locale);
    lines.push(<ToolLine key={index} text={view.line} failed={view.failed} />);
    if (view.requestLine) lines.push(<ToolLine key={`request-${index}`} text={view.requestLine} failed={false} />);
    if (tool.toolName === CHOOSE_VISIT) {
      const toolCallId = tool.toolCallId ?? '';
      const shown = pickerViewOf(tool, { live: toolCallId !== '' && toolCallId === picker.live, busy: picker.busy });
      if (shown.kind === 'form') {
        cards.push(
          <VisitPicker
            key={`picker-${index}`}
            input={tool.input}
            canSend={shown.canSend}
            onAnswer={(output) => picker.answer(toolCallId, output)}
            onSending={picker.onSending}
          />
        );
      } else if (shown.kind === 'closed' || shown.kind === 'unsent') {
        cards.push(
          <p key={`picker-${index}`} data-testid="picker-note" className="text-body text-graphite">
            {shown.kind === 'closed' ? t.pickerClosed : t.pickerUnsent}
          </p>
        );
      }
    }
    if (view.appointment) {
```

- [ ] **Step 11: Wire the page**

In `liff/app/concierge/page.tsx`, replace

```tsx
import { AssistantParts } from '@/components/chat-parts';
```
with
```tsx
import { AssistantParts, type PickerContext } from '@/components/chat-parts';
```

add after `import { tunnelHeaders } from '@/lib/tunnel';`:

```tsx
import { CHOOSE_VISIT, composerLocked, livePickerOf, resumesAfterPicker } from '@/lib/visit-picker';
```

replace

```tsx
  const { messages, sendMessage, regenerate, status, error } = useChat({ transport });
  const [draft, setDraft] = useState('');
  const busy = status === 'submitted' || status === 'streaming';
  const failure = error ? errorOf(error) : null;
```
with (verified: `sendAutomaticallyWhen`, `ai/dist/index.d.ts:6028-6030`)
```tsx
  // After the customer answers a visit picker, the chat goes on by itself, and only then: never after a turn that ended
  // on Strapi's tools (resumesAfterPicker, as useChat's sendAutomaticallyWhen).
  const { messages, sendMessage, regenerate, status, error, addToolOutput } = useChat({ transport, sendAutomaticallyWhen: resumesAfterPicker });
  const [draft, setDraft] = useState('');
  // A picker's request on its way: no message may move past the picker until it has its answer.
  const [pickerSending, setPickerSending] = useState(false);
  const busy = status === 'submitted' || status === 'streaming';
  const locked = composerLocked(busy, pickerSending);
  const failure = error ? errorOf(error) : null;
```

replace

```tsx
  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
```
with (verified: `addToolOutput({ tool, toolCallId, output })`, `ai/dist/index.d.ts:5931-5952`)
```tsx
  // The visit pickers: which one may send, and where the customer's answer goes: useChat's addToolOutput, by the call's
  // id. Writing the answer resubmits the chat (resumesAfterPicker).
  const picker: PickerContext = {
    live: livePickerOf(messages),
    busy,
    answer: (toolCallId, output) => {
      setPickerSending(false);
      following.current = true;
      void addToolOutput({ tool: CHOOSE_VISIT, toolCallId, output });
    },
    onSending: setPickerSending,
  };

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || locked) return;
```

replace `<AssistantParts parts={message.parts} locale={locale} />` with `<AssistantParts parts={message.parts} locale={locale} picker={picker} />`; on the suggestion chips replace `disabled={busy}` with `disabled={locked}`; and on Send replace `disabled={busy || !draft.trim()}` with `disabled={locked || !draft.trim()}`. (`needsRetry(messages, busy)` and `{busy && <Spinner …/>}` stay as they are.)

- [ ] **Step 12: Run everything that checks the app**

Run: `npm test --prefix liff && npm run typecheck --prefix liff && npm run build --prefix liff`
Expected: every test passes (507); `tsc --noEmit` prints nothing; `next build` compiles and lists the routes, `/concierge` and `/api/concierge` among them. A running dev server isn't disturbed: Next 16 keeps its output in `.next/dev`.

- [ ] **Step 13: Commit**

```bash
git add liff/lib/copy.ts liff/lib/copy.test.ts liff/lib/tool-view.ts liff/lib/tool-view.test.ts liff/lib/chat-retry.ts liff/lib/chat-retry.test.ts liff/components/visit-picker.tsx liff/components/chat-parts.tsx liff/app/concierge/page.tsx
git commit -m "feat(liff): the visit picker in the chat: the booking form, filled in, and the chat goes on after the customer's tap" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- liff/lib/copy.ts liff/lib/copy.test.ts liff/lib/tool-view.ts liff/lib/tool-view.test.ts liff/lib/chat-retry.ts liff/lib/chat-retry.test.ts liff/components/visit-picker.tsx liff/components/chat-parts.tsx liff/app/concierge/page.tsx
```

---

### Task 5: The live test's Claude mode, the README, and the checks by hand

The live test gains `LIVE_MODEL=claude` for the spec's two cases. The local-model booking test, whose flow ("Yes, please." and the model's own `request_appointment`) this feature removes, becomes the picker check for the demo's first suggestion. The README says what changed where the concierge is described.

**Files:**
- Modify: `liff/live/concierge.live.test.ts`
- Modify: `README.md` (lines 133, 135, 209, 210, 217, 454)

**Interfaces:**
- Consumes: `CHOOSE_VISIT`, `livePickerOf` (Task 2); the server's picker flow (Task 3); `COPY.en.suggestions[0]` (unchanged).
- Produces: nothing other tasks use.

- [ ] **Step 1: The header, and which model answers**

In `liff/live/concierge.live.test.ts`, replace the file's start, through the `ready` line:

```ts
/**
 * The concierge end to end on the local model: the real route, a signed-in demo customer, real MCP tool calls to the
 * running Strapi. Opt-in (`npm run test:live`), and skipped when the app's client ID is missing (`npm run setup` writes
 * NEXT_PUBLIC_MAISON_CLIENT_ID to liff/.env), or Ollama or Strapi isn't up. In LINE mode it refuses to run
 * (live/support.ts). It always uses the local model, even when an API key is set, so it costs nothing and runs offline.
 */
import { randomBytes } from 'node:crypto';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { readUIMessageStream, type UIMessage, type UIMessageChunk } from 'ai';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { POST } from '@/app/api/concierge/route';
import { COPY } from '@/lib/copy';
import { resolveDate } from '@/lib/resolve-date';
import { createSession } from '@/lib/session';
import { handOffAt } from '@/lib/tool-view';
import { STRAPI_URL, datesIn, ensureVerifyMock, ollamaUp, saysConfirmed, sseEvents, strapiUp, weekdaysIn } from './support';

delete process.env.ANTHROPIC_API_KEY;
delete process.env.AI_GATEWAY_API_KEY;

const clientId = process.env.NEXT_PUBLIC_MAISON_CLIENT_ID ?? '';
const ready = Boolean(clientId) && (await strapiUp()) && (await ollamaUp());
```
with
```ts
/**
 * The concierge end to end: the real route, a signed-in demo customer, real MCP tool calls to the running Strapi. Opt-in
 * (`npm run test:live`), and skipped when the app's client ID is missing (`npm run setup` writes
 * NEXT_PUBLIC_MAISON_CLIENT_ID to liff/.env), or Strapi or the model isn't there. In LINE mode it refuses to run
 * (live/support.ts). Two modes:
 * - The local model, the default. It always uses Ollama, even when an API key is set, so it costs nothing and runs offline.
 * - Claude, opt-in: `LIVE_MODEL=claude npm run test:live` runs the visit picker's two cases on Claude, with the key the
 *   app uses from liff/.env (ANTHROPIC_API_KEY, or AI_GATEWAY_API_KEY). Skipped without one. The key is never printed:
 *   the test only checks that one is set.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { readUIMessageStream, type UIMessage, type UIMessageChunk } from 'ai';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { POST } from '@/app/api/concierge/route';
import { COPY } from '@/lib/copy';
import { resolveDate } from '@/lib/resolve-date';
import { createSession } from '@/lib/session';
import { handOffAt } from '@/lib/tool-view';
import { CHOOSE_VISIT, livePickerOf } from '@/lib/visit-picker';
import { STRAPI_URL, datesIn, ensureVerifyMock, ollamaUp, saysConfirmed, sseEvents, strapiUp, weekdaysIn } from './support';

/** Which model answers: Claude only when asked for by name, so a run costs nothing unless someone means it to. */
const claude = process.env.LIVE_MODEL === 'claude';
if (!claude) {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.AI_GATEWAY_API_KEY;
}
/** Whether a key for Claude is set: checked, never read out. */
const hasClaudeKey = Boolean(process.env.ANTHROPIC_API_KEY || process.env.AI_GATEWAY_API_KEY);

const clientId = process.env.NEXT_PUBLIC_MAISON_CLIENT_ID ?? '';
const ready = Boolean(clientId) && (await strapiUp()) && (claude ? hasClaudeKey : await ollamaUp());
```

- [ ] **Step 2: The shared helpers, and the demo's first suggestion as a check of its own**

Insert after `assistantMessageOf` (after its closing `};`, before `// These run without Ollama or Strapi: they check the checks.`):

```ts
const say = (id: string, text: string): UIMessage => ({ id, role: 'user', parts: [{ type: 'text', text }] });
/** For a failure's message: the calls the turn made, and what the concierge said. */
const traceOf = (events: Array<Record<string, any>>) =>
  `Tools: ${callsIn(events)
    .map((call) => `${call.name}(${JSON.stringify(call.input)})`)
    .join(', ')}. Reply: ${JSON.stringify(textIn(events))}`;

/** One request through the real route, as the app sends it, signed in with `token`: the stream's events, with no error among them. */
const converse = async (token: string, body: Record<string, unknown>) => {
  const response = await POST(
    new Request('http://localhost:3003/api/concierge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    })
  );
  expect(response.status).toBe(200);
  const events = sseEvents(await response.text());
  expect(events.filter((event) => event.type === 'error')).toEqual([]);
  return events;
};

/**
 * The demo's first suggestion, as the stage sends it, ends in a visit picker: for the next Saturday in Tokyo (the date
 * resolve_date returned, which it asked first) at 14:00 in Ginza, for pieces a search in that turn returned. Nothing is
 * booked: the turn stops at the picker, which waits for the customer, and the reply says no visit is confirmed and names
 * no other day.
 */
const expectTheDemoPicker = async (token: string) => {
  const saturday = resolveDate({ weekday: 'saturday' }, 'en').date; // by the code the tool runs
  const [ask] = COPY.en.suggestions;
  const events = await converse(token, { locale: 'en', messages: [say('u1', ask)] });
  const calls = callsIn(events);
  const trace = traceOf(events);

  const asked = calls.findIndex((call) => call.name === 'resolve_date');
  const shown = calls.findIndex((call) => call.name === CHOOSE_VISIT);
  expect(asked, `it asks resolve_date. ${trace}`).toBeGreaterThanOrEqual(0);
  expect(shown, `it shows the picker. ${trace}`).toBeGreaterThanOrEqual(0);
  expect(asked < shown, `it asks resolve_date before it shows the picker. ${trace}`).toBe(true);
  expect(
    calls.some((call) => call.name === 'resolve_date' && call.output?.date === saturday && call.output?.weekday === 'Saturday'),
    `resolve_date gave it ${saturday}, a Saturday. ${trace}`
  ).toBe(true);

  const picker = calls[shown];
  expect(picker.input, `the picker is for Ginza on ${saturday} at 14:00. ${trace}`).toMatchObject({ boutique: 'ginza', date: saturday, time: '14:00' });
  const found = new Set(
    calls
      .filter((call) => call.name === 'search_products')
      .flatMap((call) => (call.output?.structuredContent?.products as Product[] | undefined) ?? [])
      .map((product) => product.slug)
  );
  const pieces: string[] = picker.input.productSlugs ?? [];
  expect(pieces.length, `the picker has pieces. ${trace}`).toBeGreaterThan(0);
  for (const slug of pieces) expect(found.has(slug), `${slug} came from search_products in this turn. ${trace}`).toBe(true);

  // The customer books, in the picker: the model asks for no visit itself, and says none is confirmed.
  expect(events.some((event) => event.toolName === 'request_appointment'), `the model called request_appointment. ${trace}`).toBe(false);
  const reply = textIn(events);
  expect(saysConfirmed(reply), `the reply says the visit is confirmed. ${trace}`).toBe(false);
  const year = Number(saturday.slice(0, 4));
  expect(datesIn(reply, year).filter((date) => date !== saturday), `the reply names another date. ${trace}`).toEqual([]);
  expect(weekdaysIn(reply).filter((name) => name !== 'Saturday'), `the reply names another weekday. ${trace}`).toEqual([]);

  // The page shows that picker, live: the reply's message ends with it, waiting. No hand-off note: this is a gift and a visit.
  const message = await assistantMessageOf(events);
  expect(livePickerOf([say('u1', ask), message]), `the picker waits for the customer. ${trace}`).toBe(picker.id);
  expect(handOffAt(message.parts), `a hand-off note shows. ${trace}`).toBeNull();
};
```

- [ ] **Step 3: The local model's tests: skipped in Claude mode, and the booking test becomes the picker check**

Replace `describe.skipIf(!ready)('the concierge on the local model', () => {` with `describe.skipIf(!ready || claude)('the concierge on the local model', () => {`.

Then replace the whole booking test: from its comment `  /**` that starts `   * The demo's two messages, with "Saturday" in the first` down to the `  });` that closes `it('books the next Saturday in Tokyo, with the date resolve_date returned', …)`, just before `  it("answers a care question from Maison's product knowledge", …)`, with:

```ts
  it("ends the demo's first suggestion in a visit picker for Ginza, the next Saturday in Tokyo and 14:00, with the date resolve_date returned", async () => {
    await expectTheDemoPicker(token);
  });
```

- [ ] **Step 4: The Claude mode's two cases**

Append at the end of the file:

```ts
describe.skipIf(!ready || !claude)('the visit picker on Claude', () => {
  let stopMock = () => {};
  let token = '';

  beforeAll(async () => {
    stopMock = await ensureVerifyMock();
    token = await createSession({ strapiUrl: STRAPI_URL, clientId, getIdToken: () => `valid.${CUSTOMER}` }).getToken();
  });
  afterAll(() => stopMock());

  it("shows the picker for the piece on whose page the customer asks \"Can we schedule one?\", with nothing they didn't name", async () => {
    const asked = 'Can we schedule one?';
    const events = await converse(token, { locale: 'en', product: 'weekender-50', messages: [say('u1', asked)] });
    const trace = traceOf(events);
    const pickers = callsIn(events).filter((call) => call.name === CHOOSE_VISIT);
    expect(pickers, `it shows one picker. ${trace}`).toHaveLength(1);
    expect(pickers[0].input.productSlugs, `the picker is for the piece. ${trace}`).toEqual(['weekender-50']);
    // Nothing was named, so nothing is filled in: the picker starts as the sheet does.
    for (const key of ['boutique', 'date', 'time']) expect(pickers[0].input, `the model filled in ${key}. ${trace}`).not.toHaveProperty(key);
    expect(callsIn(events).some((call) => call.name === 'resolve_date'), `it asked resolve_date, for no day. ${trace}`).toBe(false);
    expect(saysConfirmed(textIn(events)), `the reply says a visit is confirmed. ${trace}`).toBe(false);
    const message = await assistantMessageOf(events);
    expect(livePickerOf([say('u1', asked), message]), `the picker waits for the customer. ${trace}`).toBe(pickers[0].id);
  });

  it("ends the demo's first suggestion in a visit picker for Ginza, the next Saturday in Tokyo and 14:00", async () => {
    await expectTheDemoPicker(token);
  });
});
```

- [ ] **Step 5: Run the file without a model**

Run: `node node_modules/vitest/vitest.mjs run --config vitest.live.config.ts` from `liff/` (without `--env-file`, so no client ID and no key are loaded: nothing is read from `.env`).
Expected: 4 passed (the reply checks), 6 skipped (the local model's four, Claude's two). Then `LIVE_MODEL=claude node node_modules/vitest/vitest.mjs run --config vitest.live.config.ts`: the same.

- [ ] **Step 6: The README**

In `README.md`, insert after line 133 (the bullet `- **Dates are a tool.** …`):

```markdown
- **A visit is booked in a picker.** When the customer asks to visit, the concierge calls `choose_visit`, the app's own tool (its line reads `Local · choose_visit`), with the pieces and whatever the customer named: a boutique, a day from `resolve_date`, a time. Its reply stops there, and the chat shows **Book a visit** under it: the product page's form, filled in, with **Send request** and **Not now**. Send request calls `request_appointment` with the customer's session, as the product page does, and the chat goes on by itself: the visit's card takes the picker's place, under `Local · choose_visit ✓ requested` and `MCP · request_appointment ✓`, and the concierge says in one sentence that the visit is requested. The model is never given `request_appointment`, so only the customer's tap books. After Not now, the picker's place reads "Closed without a request."; a picker the customer moved past by writing reads "No request sent.".
```

In line 135 (`- **An empty turn.** …`), replace

```text
A turn that booked a visit never offers it, so nothing is booked twice, and neither does a turn whose note is the answer, a recorded hand-off or a search that found nothing.
```
with
```text
A turn that booked a visit, or holds a visit picker that waits for the customer or requested a visit, never offers it, so nothing is booked twice and no picker is lost, and neither does a turn whose note is the answer, a recorded hand-off or a search that found nothing.
```

Replace lines 209 and 210:

```text
| 1:10–1:30 | Booking | Tap **Yes, please.** The request is sent and awaits the boutique. |
| 1:30–1:50 | The request arrives | On the board, the request appears, created via `concierge`, with the customer masked. |
```
with
```text
| 1:10–1:30 | Booking | The answer ends in **Book a visit**, filled in with Ginza, Saturday and 14:00. Tap **Send request**: the visit's card takes its place, the request awaits the boutique, and the concierge says so in one sentence. |
| 1:30–1:50 | The request arrives | On the board, the request appears, created via `app` (the customer's tap in the picker), with the customer masked. |
```

Replace line 217:

```text
**In Japanese (JA),** the same run uses the same tools, with Japanese labels: the second suggestion is はい、お願いします。, and the product page's button is 来店を予約.
```
with
```text
**In Japanese (JA),** the same run uses the same tools, with Japanese labels: the picker's button is リクエストを送る, and the product page's button is 来店を予約.
```

Replace line 454 (the `npm run test:live` row):

```text
| `npm run test:live` | The concierge on the local model, against the running Strapi. It books visits for a throwaway customer each run. The bitcoin test asks as one fixed customer, which leaves a question for staff open in the demo database until you reset or answer it, and Strapi allows a customer five questions open or taken: past that nothing is recorded, and the test still passes, on the plain note. Reset between rehearsals. | Strapi, Ollama, and the app's client ID from `npm run setup`. It's skipped when the client ID is missing, or Strapi or Ollama doesn't answer. Run it in local mode: it signs in with the verify mock's ID tokens. |
```
with
```text
| `npm run test:live` | The concierge on the local model, against the running Strapi: the gift answer, the demo's first suggestion ending in a visit picker for Ginza, the next Saturday and 14:00 (nothing is booked: the customer books in the picker), product knowledge, and the bitcoin hand-off. The bitcoin test asks as one fixed customer, which leaves a question for staff open in the demo database until you reset or answer it, and Strapi allows a customer five questions open or taken: past that nothing is recorded, and the test still passes, on the plain note. Reset between rehearsals. `LIVE_MODEL=claude npm run test:live` runs the visit picker's two cases on Claude instead: "Can we schedule one?" on the Weekender 50's page, and the demo's first suggestion. | Strapi, Ollama (with `LIVE_MODEL=claude`, the key in `liff/.env` instead: `ANTHROPIC_API_KEY` or `AI_GATEWAY_API_KEY`), and the app's client ID from `npm run setup`. It's skipped when the client ID is missing, or Strapi or the model doesn't answer. Run it in local mode: it signs in with the verify mock's ID tokens. |
```

- [ ] **Step 7: Run the live tests against the running stack (the controller)**

With Strapi on 1338 in local mode and Ollama up: `npm run test:live --prefix liff`. Expected: 8 passed, 2 skipped (Claude's). A model that strays fails with the turn's trace (its tool calls and reply).

With Paul's key in `liff/.env` (he adds it; it is never printed): `LIVE_MODEL=claude npm run test:live --prefix liff`. Expected: 6 passed (the four reply checks and Claude's two), 4 skipped (the local model's). That's two turns on Claude, a few cents.

- [ ] **Step 8: Commit**

```bash
git add liff/live/concierge.live.test.ts README.md
git commit -m "test(liff): the live test's Claude mode checks the visit picker, and the README says how a visit is booked in the chat" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- liff/live/concierge.live.test.ts README.md
```

- [ ] **Step 9: The checks by hand, before anything merges (the controller, with Paul)**

On this laptop, with Claude (Paul's key in `liff/.env`; restart the app after he changes it):
- `npm run dev` from the repo root: Strapi on 1338, the app on 3003, the verify mock. `http://localhost:1338/_health` answers 204. In the admin, **Maison** → **Reset demo activity**.
- **The first suggestion:** open `http://localhost:3003`, EN, **Ask the concierge**, tap the first suggestion. The lines show `Local · resolve_date ✓ Saturday …` and `Local · choose_visit …`; the card says **Book a visit**, names the pieces, and has Ginza checked, the Saturday chip and 14:00. The agent view lists `view_product` and `find_boutiques` on the concierge screen.
- **Send request:** the visit's card takes the picker's place, under `Local · choose_visit ✓ requested` and `MCP · request_appointment ✓`, with **Chat with Maison on LINE** under it when `NEXT_PUBLIC_LINE_OA_ID` is set; the concierge says, in one sentence, that it's requested and the boutique confirms on LINE. No **Try again**. The board shows the request.
- **On a piece's page:** **Ask about this piece**, type "Can we schedule one?": a picker for that piece, starting at Ginza, the next Saturday, 14:00. **Not now**: "Closed without a request.", and the concierge offers help without pushing.
- **Typing instead:** ask for a visit again, then type another question: the picker reads "No request sent.", and the concierge answers the question, with no error.
- **While it sends:** tap Send request and watch the composer: Send and the suggestions are disabled until the card appears.
- **A refusal:** with three requests waiting (book two more, or leave the rehearsal's), Send request shows the limit's message in the picker, and the chat says nothing more.
- **Japanese:** switch to JA and run the first suggestion again: the picker's copy is Japanese (今回は見送る, リクエストを送る), and the visit's card names the boutique in Japanese.
- **The product page:** **Book a visit** on the Weekender 50 books as before and moves to My visits.

On Paul's phone, through the tunnel (option B, as the README's "Each time" describes; the controller runs `npm run tunnel`, Paul restarts the app in LINE mode):
- Inside LINE: the first suggestion, then **Send request**. The card and the concierge's sentence appear, and the visit is in **My visits**.

---

### Task 6: Warmer words for a hand-off (Paul, 3 October)

Paul asked for the hand-off to sound human: "thanks for asking, give me a few minutes while I look that up and I will message back with the answer". The words are written for the boutiques' open hours; Paul covers what happens after hours in the slides. Run it after Task 4 (which creates `liff/lib/copy.test.ts` and edits `copy.ts`) and before Task 5, so the checks by hand see the new words.

**Files:**
- Modify: `liff/lib/copy.ts` (`handOff.note`, Japanese and English)
- Modify: `liff/lib/concierge.ts` (rule 9's closing sentence)
- Test: `liff/lib/line-chat.test.ts` (the two `copy.note('Q-4821')` expectations), `liff/lib/concierge.test.ts` (`RULE_9`)

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing other tasks use.

- [ ] **Step 1: Update the tests first**

In `liff/lib/line-chat.test.ts`, the English expectation becomes:

```ts
    expect(copy.note('Q-4821')).toBe('Thanks for asking! Give us a few minutes: one of our client advisors will message you here with the answer. (Q-4821)');
```

and the Japanese one:

```ts
    expect(copy.note('Q-4821')).toBe('ご質問ありがとうございます。少々お待ちください。クライアントアドバイザーがお調べのうえ、このLINEトークでご返信いたします（Q-4821）。');
```

In `liff/lib/concierge.test.ts`, in `RULE_9`, replace this sentence:

```
Then say in one short sentence that you couldn't find a reliable answer and have passed the question to Maison's client advisors: the app shows the customer where and when they reply.
```

with:

```
Then thank the customer and say in one short sentence that one of Maison's client advisors will look into it and message them here on LINE with the answer: the app shows the details.
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm test --prefix liff -- lib/line-chat.test.ts lib/concierge.test.ts`
Expected: FAIL: the two `copy.note` expectations and the rule 9 test, against the old words.

- [ ] **Step 3: The note's words**

In `liff/lib/copy.ts`, `ja.handOff.note` becomes:

```ts
      note: (reference: string) => `ご質問ありがとうございます。少々お待ちください。クライアントアドバイザーがお調べのうえ、このLINEトークでご返信いたします（${reference}）。`,
```

and `en.handOff.note`:

```ts
      note: (reference: string) => `Thanks for asking! Give us a few minutes: one of our client advisors will message you here with the answer. (${reference})`,
```

- [ ] **Step 4: Rule 9's sentence**

In `liff/lib/concierge.ts`, replace the same sentence as in Step 1 (`Then say in one short sentence that you couldn't find a reli…`) with the new one. The rest of rule 9, including "never promise a time yourself", stays: the app's note carries "a few minutes", the model doesn't.

- [ ] **Step 5: Run the tests to see them pass, then everything**

Run: `npm test --prefix liff -- lib/line-chat.test.ts lib/concierge.test.ts`, then `npm test --prefix liff` and `npm run typecheck --prefix liff`.
Expected: all pass; `tsc --noEmit` prints nothing.

- [ ] **Step 6: Commit**

```bash
git add liff/lib/copy.ts liff/lib/concierge.ts liff/lib/line-chat.test.ts liff/lib/concierge.test.ts
git commit -m "feat(liff): a hand-off thanks the customer and says an advisor will message them shortly" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- liff/lib/copy.ts liff/lib/concierge.ts liff/lib/line-chat.test.ts liff/lib/concierge.test.ts
```

## Decisions made while planning

The controller's rulings on what the planner found. The spec was updated to match.

1. **The resume rule checks the last step, not the last part.** The chat resumes when the last step of the last message holds an answered `choose_visit` and every other call in that step has finished. This covers the model calling `choose_visit` beside another tool. A picker the customer moved past stays unanswered and doesn't count; the server drops it. Task 2's `resumesAfterPicker` and its tests carry this.
2. **Rule 4 no longer asks for a day in words** when none was named, since the new rule 3 forbids it. It also no longer passes a date to `find_boutiques` or `choose_visit`. The exact text is in Task 3, Step 7.
3. **The local-model live test's booking case becomes the picker check.** It needed "Yes, please." and the model's own `request_appointment`, and both are gone. Its other tests are unchanged.
4. **Three small additions, all accepted (Review Focus 1, 2 and 4):**
   - Send and the suggestions wait while a picker's request is on its way.
   - A refused `choose_visit` call shows only its red line.
   - A time between the half-hours goes to the half-hour it falls in.
5. **Open for Paul:** picker bookings are recorded as created via `app`, not `concierge`, because the browser's MCP connection can't carry the concierge's header. Task 5 changes the README's line to `app`. The alternative, routing the call through the app's server, is a design change. See the spec's open question 3.
6. **Paul's hand-off words (3 October), Task 6:** the note thanks the customer and promises a reply in a few minutes, written for open hours; Paul covers after hours in the slides. The concierge's rule 9 sentence gets the same tone and still never promises a time itself. Task 6 runs after Task 4 and before Task 5.
