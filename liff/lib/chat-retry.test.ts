import { describe, expect, it } from 'vitest';
import { needsRetry } from './chat-retry';

type Part = { type: string; text?: string; toolName?: string; state?: string; output?: unknown; errorText?: string };

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

/** A hand_off_to_staff call as the page holds it: the concierge's own tool, so a `tool-<name>` part. */
const handOff = (state: string, output?: unknown): Part => ({ type: 'tool-hand_off_to_staff', state, ...(output === undefined ? {} : { output }) });
const handedOff = handOff('output-available', { handedOff: true });
/** What search_knowledge answers when no entry fits: a result with an empty list. */
const searchKnowledge: Part = { type: 'dynamic-tool', toolName: 'search_knowledge', state: 'output-available', output: { content: [], structuredContent: { locale: 'en', entries: [] } } };
/** A question Maison has written nothing about: search_knowledge finds nothing, and the reply hands off. */
const askedAboutBitcoin = [user('Can I pay in bitcoin?')];

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

  // Under the hand-off's line are the note and the LINE chat button: they are the answer, with words after them or none.
  it('is false after a hand-off went through, even with no words after it', () => {
    expect(needsRetry([...askedAboutBitcoin, assistant(searchKnowledge, handedOff)], false)).toBe(false);
    expect(needsRetry([...askedAboutBitcoin, assistant({ type: 'step-start' }, searchKnowledge, { type: 'step-start' }, handedOff, { type: 'step-start' })], false)).toBe(false);
    expect(needsRetry([...askedAboutBitcoin, assistant(handedOff, searchKnowledge)], false)).toBe(false); // another tool call after it
  });

  it('still allows it when the hand-off failed or has no result: no note shows, so nothing answered', () => {
    expect(needsRetry([...askedAboutBitcoin, assistant(searchKnowledge, { ...handOff('output-error'), errorText: 'boom' })], false)).toBe(true);
    expect(needsRetry([...askedAboutBitcoin, assistant(searchKnowledge, handOff('input-available'))], false)).toBe(true);
    expect(needsRetry([...askedAboutBitcoin, assistant(searchKnowledge, handOff('output-available', refusal))], false)).toBe(true); // a result that is an error
    expect(needsRetry([...askedAboutBitcoin, assistant(searchKnowledge)], false)).toBe(true); // it searched, and stopped
  });
});
