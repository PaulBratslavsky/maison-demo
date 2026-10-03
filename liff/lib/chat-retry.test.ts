import { describe, expect, it } from 'vitest';
import { needsRetry } from './chat-retry';

type Part = { type: string; text?: string; toolName?: string; toolCallId?: string; state?: string; output?: unknown; errorText?: string };

const text = (value: string) => ({ type: 'text', text: value });
const resolveDate = { type: 'tool-resolve_date' }; // the concierge's own tool
const searchProducts = { type: 'dynamic-tool' }; // a Maison tool
const user = (value: string) => ({ role: 'user', parts: [text(value)] });
const assistant = (...parts: Part[]) => ({ role: 'assistant', parts });

/** A request_appointment call as the page holds it. MCP tools arrive as dynamic-tool parts. */
const booking = (state: string, output?: unknown): Part => ({ type: 'dynamic-tool', toolName: 'request_appointment', state, ...(output === undefined ? {} : { output }) });
/** What Maison answers, as @ai-sdk/mcp passes it on: the visit it stored, or a refusal (isError). */
const appointment = { reference: 'MA-7Q2K', status: 'requested', requestedFor: '2026-10-03T14:00:00+09:00' };
const stored = { content: [{ type: 'text', text: JSON.stringify({ appointment }) }], structuredContent: { appointment } };
const refusal = {
  isError: true,
  content: [{ type: 'text', text: JSON.stringify({ error: { code: 'too_many_open_requests', message: 'You have 3 requests waiting.', hint: 'Wait for the boutique.' } }) }],
};
const booked = booking('output-available', { ...stored, isError: false }); // the MCP client's parse can add isError: false
const refused = booking('output-available', refusal);
/** The demo's two messages, up to the customer's yes. */
const askedToBook = [
  user('A travel gift, and a visit to Ginza on Saturday at 2 pm?'),
  assistant(text('Shall I request Saturday 3 October at 14:00 at Ginza?')),
  user('Yes, please.'),
];

/** A hand_off_to_staff call as the page holds it: a Maison tool, so a dynamic-tool part. */
const handOff = (state: string, output?: unknown): Part => ({ type: 'dynamic-tool', toolName: 'hand_off_to_staff', state, ...(output === undefined ? {} : { output }) });
/** What Strapi answers to a hand-off it recorded: the question's reference. */
const recorded = { content: [{ type: 'text', text: '{}' }], structuredContent: { question: { reference: 'Q-4821', status: 'open', product: null } } };
const handedOff = handOff('output-available', recorded);
/** A search_knowledge call, an MCP tool: a dynamic-tool part. Its result lists the entries it found. */
const knowledge = (state: string, output?: unknown): Part => ({ type: 'dynamic-tool', toolName: 'search_knowledge', state, ...(output === undefined ? {} : { output }) });
const entries = (...titles: string[]) => ({ content: [{ type: 'text', text: '{}' }], structuredContent: { locale: 'en', entries: titles.map((title) => ({ title })) } });
const foundNothing = knowledge('output-available', entries());
const foundAnAnswer = knowledge('output-available', entries('How do I care for the leather?'));
/** A search that found nothing, and the app's server handed the question to staff itself: its result carries what Strapi recorded. */
const handedOffBySearch = knowledge('output-available', {
  content: [{ type: 'text', text: '{}' }],
  structuredContent: { locale: 'en', entries: [], handOff: { reference: 'Q-4821', question: 'Can I pay in bitcoin?', product: null } },
});
/** A question Maison has written nothing about, and one it has. */
const askedAboutBitcoin = [user('Can I pay in bitcoin?')];
const askedAboutCare = [user('How do I care for the leather?')];

describe('needsRetry', () => {
  it('is false for a reply that ends in something to read', () => {
    expect(needsRetry([user('Hello'), assistant(text('Good afternoon.'))], false)).toBe(false);
    expect(needsRetry([user('Hello'), assistant(resolveDate, searchProducts, text('Here are three options.'))], false)).toBe(false);
  });

  it('is true for a reply with no text at all', () => {
    expect(needsRetry([user('Hello'), assistant()], false)).toBe(true);
    expect(needsRetry([user('Hello'), assistant({ type: 'step-start' })], false)).toBe(true);
    expect(needsRetry([user('Hello'), assistant(resolveDate, searchProducts)], false)).toBe(true); // tool calls, then nothing
    expect(needsRetry([user('Hello'), assistant(text(''))], false)).toBe(true);
    expect(needsRetry([user('Hello'), assistant(text('  \n '))], false)).toBe(true);
  });

  it('is true for a reply that ends in tool calls, whatever came before them', () => {
    expect(needsRetry([user('Hello'), assistant(text('Let me look.'), searchProducts)], false)).toBe(true);
    expect(needsRetry([user('Hello'), assistant(text('Let me look.'), resolveDate, { type: 'step-start' })], false)).toBe(true);
  });

  it("doesn't count what the screen doesn't show: a blank text part after the answer, or its reasoning", () => {
    expect(needsRetry([user('Hello'), assistant(text('Good afternoon.'), text(''))], false)).toBe(false);
    expect(needsRetry([user('Hello'), assistant(text('Good afternoon.'), { type: 'reasoning', text: 'The customer greets me.' })], false)).toBe(false);
    expect(needsRetry([user('Hello'), assistant({ type: 'reasoning', text: 'Hmm.' })], false)).toBe(true);
  });

  it('is false while a reply is still coming in', () => {
    expect(needsRetry([user('Hello'), assistant(resolveDate)], true)).toBe(false);
    expect(needsRetry([user('Hello'), assistant()], true)).toBe(false);
  });

  it("is false when the customer spoke last, or there is nothing yet, and looks at the last message only", () => {
    expect(needsRetry([], false)).toBe(false);
    expect(needsRetry([user('Hello')], false)).toBe(false);
    expect(needsRetry([user('Hello'), assistant(resolveDate), user('Yes, please.')], false)).toBe(false);
    expect(needsRetry([user('Hello'), assistant(resolveDate), user('Yes, please.'), assistant(text('Done.'))], false)).toBe(false);
  });

  // Asking again drops the last reply and sends the customer's yes again: after a booking, the model books it twice.
  it('is false after a booking went through, even with no words after it', () => {
    expect(needsRetry([...askedToBook, assistant(booked)], false)).toBe(false);
    expect(needsRetry([...askedToBook, assistant({ type: 'step-start' }, resolveDate, { type: 'step-start' }, booked, { type: 'step-start' })], false)).toBe(false);
    expect(needsRetry([...askedToBook, assistant(booking('output-available', stored))], false)).toBe(false); // no isError at all
    expect(needsRetry([...askedToBook, assistant(booked, searchProducts)], false)).toBe(false); // another tool call after it
    expect(needsRetry([...askedToBook, assistant(refused, booked)], false)).toBe(false); // refused, then booked on a second try
    expect(needsRetry([...askedToBook, assistant(booked, refused)], false)).toBe(false); // booked, then a second one refused
    // A typed MCP tool (mcp.tools({ schemas })) arrives as a static part, with the name in the type.
    expect(needsRetry([...askedToBook, assistant({ type: 'tool-request_appointment', state: 'output-available', output: stored })], false)).toBe(false);
  });

  it('allows it after a booking Maison refused (isError): nothing was booked', () => {
    expect(needsRetry([...askedToBook, assistant(refused)], false)).toBe(true);
    expect(needsRetry([...askedToBook, assistant(text('One moment.'), refused, refused)], false)).toBe(true);
  });

  it("is false when it can't tell whether the booking went through: no result yet, or the call failed on the way", () => {
    expect(needsRetry([...askedToBook, assistant(booking('input-streaming'))], false)).toBe(false);
    expect(needsRetry([...askedToBook, assistant(booking('input-available'))], false)).toBe(false);
    expect(needsRetry([...askedToBook, assistant({ ...booking('output-error'), errorText: 'fetch failed' })], false)).toBe(false);
    expect(needsRetry([...askedToBook, assistant(booking('output-available', null))], false)).toBe(false);
  });

  it('still allows it for an empty reply with no tool call, and when the booking was in an earlier reply', () => {
    expect(needsRetry([...askedToBook, assistant()], false)).toBe(true);
    expect(needsRetry([...askedToBook, assistant({ type: 'step-start' })], false)).toBe(true);
    // Asking again keeps the earlier replies, so the model still sees that booking.
    expect(needsRetry([...askedToBook, assistant(booked, text('Requested.')), user('Anything else for him?'), assistant(searchProducts)], false)).toBe(true);
  });

  // Under the hand-off's line are the note and its LINE button: they are the answer, with words after them or none.
  it('is false after a hand-off went through, even with no words after it', () => {
    expect(needsRetry([...askedAboutBitcoin, assistant(foundNothing, handedOff)], false)).toBe(false);
    expect(needsRetry([...askedAboutBitcoin, assistant({ type: 'step-start' }, foundNothing, { type: 'step-start' }, handedOff, { type: 'step-start' })], false)).toBe(false);
    expect(needsRetry([...askedAboutBitcoin, assistant(handedOff, foundNothing)], false)).toBe(false); // another tool call after it
    expect(needsRetry([...askedAboutCare, assistant(foundAnAnswer, handedOff)], false)).toBe(false); // the call was made, whatever the search found
  });

  // A failed hand-off has the plain note and the LINE chat button under it, but they are no answer: the failure may be a
  // passing one, and "Try again" asks again.
  it('still allows it after a hand-off that failed, with no words after it, though the plain note shows under it', () => {
    expect(needsRetry([...askedAboutBitcoin, assistant({ ...handOff('output-error'), errorText: 'boom' })], false)).toBe(true);
    expect(needsRetry([...askedAboutBitcoin, assistant(handOff('output-available', refusal))], false)).toBe(true); // a result that is an error
    expect(needsRetry([...askedAboutBitcoin, assistant(handOff('output-available', { content: [] }))], false)).toBe(true); // a result with no reference: nothing says it was recorded
    expect(needsRetry([...askedAboutCare, assistant(foundAnAnswer, { ...handOff('output-error'), errorText: 'boom' })], false)).toBe(true);
    expect(needsRetry([...askedAboutBitcoin, assistant({ type: 'step-start' }, { ...handOff('output-error'), errorText: 'boom' }, { type: 'step-start' })], false)).toBe(true);
    expect(needsRetry([...askedAboutBitcoin, assistant(text('One moment.'), { ...handOff('output-error'), errorText: 'boom' })], false)).toBe(true); // the words came before it
  });

  it('is false once words follow a failed hand-off: the customer has something to read', () => {
    expect(needsRetry([...askedAboutBitcoin, assistant({ ...handOff('output-error'), errorText: 'boom' }, text('I could not pass it on. Please use the LINE chat.'))], false)).toBe(false);
    expect(needsRetry([...askedAboutBitcoin, assistant(handOff('output-available', refusal), text('You already have five questions with the advisors.'))], false)).toBe(false);
    expect(needsRetry([...askedAboutCare, assistant(foundAnAnswer, { ...handOff('output-error'), errorText: 'boom' }, text('Here is what I found.'))], false)).toBe(false);
  });

  it('still allows it while a hand-off has not finished, with no words after it: no note shows yet', () => {
    expect(needsRetry([...askedAboutBitcoin, assistant(handOff('input-available'))], false)).toBe(true);
    expect(needsRetry([...askedAboutBitcoin, assistant(handOff('input-streaming'))], false)).toBe(true);
    expect(needsRetry([...askedAboutBitcoin, assistant(foundNothing, handOff('input-available'))], false)).toBe(true); // the empty search's note waits for it
    expect(needsRetry([...askedAboutBitcoin, assistant(handOff('input-available'))], true)).toBe(false); // but never while a reply is coming in
  });

  // The local model often skips the hand-off. The chat then shows the note under the search that found nothing (handOffAt).
  it('is false after a search that found nothing, though the model never handed off and wrote nothing', () => {
    expect(needsRetry([...askedAboutBitcoin, assistant(foundNothing)], false)).toBe(false);
    expect(needsRetry([...askedAboutBitcoin, assistant({ type: 'step-start' }, foundNothing, { type: 'step-start' })], false)).toBe(false);
    expect(needsRetry([...askedAboutBitcoin, assistant(foundNothing, foundNothing)], false)).toBe(false); // two searches, both empty
    expect(needsRetry([...askedAboutBitcoin, assistant(foundNothing, { ...handOff('output-error'), errorText: 'boom' })], false)).toBe(false); // a failed hand-off doesn't take the note away: the search's note is the answer
    expect(needsRetry([...askedAboutBitcoin, assistant({ ...handOff('output-error'), errorText: 'boom' }, foundNothing)], false)).toBe(false);
    // A first search that was refused or broke, and a second that found nothing: rule 6 has the model call again, and the last one decides.
    expect(needsRetry([...askedAboutBitcoin, assistant(knowledge('output-available', refusal), foundNothing)], false)).toBe(false);
    expect(needsRetry([...askedAboutBitcoin, assistant({ ...knowledge('output-error'), errorText: 'fetch failed' }, foundNothing)], false)).toBe(false);
  });

  // The app records the question itself when a search finds nothing: the recorded note under that search is the answer.
  it('is false after a search the app handed the question to staff for, with no words after it, whatever the model did next', () => {
    expect(needsRetry([...askedAboutBitcoin, assistant(handedOffBySearch)], false)).toBe(false);
    expect(needsRetry([...askedAboutBitcoin, assistant({ type: 'step-start' }, handedOffBySearch, { type: 'step-start' })], false)).toBe(false);
    expect(needsRetry([...askedAboutBitcoin, assistant(handedOffBySearch, handedOff)], false)).toBe(false); // the model's call after it, answered with the same reference
    expect(needsRetry([...askedAboutBitcoin, assistant(handedOffBySearch, { ...handOff('output-error'), errorText: 'boom' })], false)).toBe(false);
    expect(needsRetry([...askedAboutBitcoin, assistant(handedOffBySearch, handOff('input-available'))], false)).toBe(false); // the note stays while a second call runs
    expect(needsRetry([...askedAboutBitcoin, assistant(handedOffBySearch, foundNothing)], false)).toBe(false); // a second search
    expect(needsRetry([...askedAboutBitcoin, assistant(foundNothing, handedOffBySearch)], false)).toBe(false);
    expect(needsRetry([...askedAboutBitcoin, assistant(handedOffBySearch, foundAnAnswer)], false)).toBe(false);
    expect(needsRetry([...askedAboutBitcoin, assistant(handedOffBySearch)], true)).toBe(false); // and never while a reply is coming in
  });

  it('still allows it after a search that found entries, failed or has not finished, with no words after it', () => {
    expect(needsRetry([...askedAboutCare, assistant(foundAnAnswer)], false)).toBe(true);
    expect(needsRetry([...askedAboutCare, assistant(foundNothing, foundAnAnswer)], false)).toBe(true);
    expect(needsRetry([...askedAboutBitcoin, assistant({ ...knowledge('output-error'), errorText: 'fetch failed' })], false)).toBe(true);
    expect(needsRetry([...askedAboutBitcoin, assistant(knowledge('output-available', refusal))], false)).toBe(true);
    expect(needsRetry([...askedAboutBitcoin, assistant(knowledge('input-available'))], false)).toBe(true);
    expect(needsRetry([...askedAboutBitcoin, assistant(foundNothing, knowledge('input-available'))], false)).toBe(true); // a second search is under way
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
      expect(needsRetry([...askedToVisit, assistant(text('Here it is.'), picker('input-available'))], false)).toBe(false);
      expect(needsRetry([...askedToVisit, assistant(step, resolveDate, step, picker('input-available'))], false)).toBe(false);
    });

    it('is false once the picker requested a visit, with no words after it, and after an empty reply to it', () => {
      expect(needsRetry([...askedToVisit, assistant(step, requestedVisit)], false)).toBe(false);
      expect(needsRetry([...askedToVisit, assistant(step, requestedVisit, step)], false)).toBe(false);
      expect(needsRetry([...askedToVisit, assistant(step, requestedVisit, step, text(' '))], false)).toBe(false);
    });

    // With no reply coming in, a call still at input-streaming is one the reply was cut off in: no form ever shows for it.
    it('allows it after a choose_visit call that was cut off while it came in, and not while the reply still comes in', () => {
      expect(needsRetry([...askedToVisit, assistant(step, picker('input-streaming'))], false)).toBe(true);
      expect(needsRetry([...askedToVisit, assistant(step, text('Here it is.'), picker('input-streaming'))], false)).toBe(true);
      expect(needsRetry([...askedToVisit, assistant(step, picker('input-streaming'))], true)).toBe(false);
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
