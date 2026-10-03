import { Chat } from '@ai-sdk/react';
import type { ChatTransport, UIMessage, UIMessageChunk } from 'ai';
import { describe, expect, it, vi } from 'vitest';

import { bookingState, isBookableDate } from './booking';
import type { BoutiqueInfo } from './types';
import {
  CHOOSE_VISIT,
  composerLocked,
  followScroll,
  isPickerAwaitingAnswer,
  isWaitingPicker,
  livePickerOf,
  piecesOf,
  pickerPrefill,
  pickerViewOf,
  requestedVisitOf,
  resumesAfterPicker,
  resumesOncePerAnswer,
  visitPickerOutputOf,
  type PickerMessage,
  type PickerPart,
  type VisitPickerOutput,
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

  it("tell the one state a picker's form shows for: its call came in whole, and it waits for the answer", () => {
    expect(isPickerAwaitingAnswer(waiting)).toBe(true);
    expect(isPickerAwaitingAnswer(picker('input-streaming'))).toBe(false);
    expect(isPickerAwaitingAnswer(requested)).toBe(false);
    expect(isPickerAwaitingAnswer({ type: 'tool-resolve_date', state: 'input-available' })).toBe(false);
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
    // A waiting picker is no longer live once a later one in the message has its answer: the customer answered that one.
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

  // A reply with no content at all never gets its step into the chat's messages: resumesOncePerAnswer covers that one.
  it("stops once the concierge's reply has continued the message in a new step, words or an empty text part", () => {
    expect(resumesAfterPicker({ messages: [asked, concierge(step, requested, step, words('Your visit is requested.'))] })).toBe(false);
    expect(resumesAfterPicker({ messages: [asked, concierge(step, closed, step, words(''))] })).toBe(false);
  });

  it('never resubmits when the customer spoke last, or there is nothing', () => {
    expect(resumesAfterPicker({ messages: [asked, concierge(step, requested), user('Thank you.')] })).toBe(false);
    expect(resumesAfterPicker({ messages: [] })).toBe(false);
  });
});

describe('resumesOncePerAnswer', () => {
  const asked = user('Can we schedule one?');

  it('resubmits once for each answer: the same answered picker never again, though the message still ends with it', () => {
    const resumes = resumesOncePerAnswer();
    const answered = [asked, concierge(step, words('Here is the picker.'), requested)];
    expect(resumes({ messages: answered })).toBe(true);
    // The reply came back empty, so the message is as it was.
    expect(resumes({ messages: answered })).toBe(false);
    expect(resumes({ messages: answered })).toBe(false);
  });

  it("resubmits for a later picker's answer, and keeps the step rule: nothing for a picker still waiting", () => {
    const resumes = resumesOncePerAnswer();
    expect(resumes({ messages: [asked, concierge(step, requested)] })).toBe(true);
    const later = (state: string, extra: Partial<PickerPart> = {}) => picker(state, { toolCallId: 'call-2', ...extra });
    const next = [asked, concierge(step, requested), user('And one for my mother?'), concierge(step, later('input-available'))];
    expect(resumes({ messages: next })).toBe(false);
    const answered = [asked, concierge(step, requested), user('And one for my mother?'), concierge(step, later('output-available', { output: { status: 'closed' } }))];
    expect(resumes({ messages: answered })).toBe(true);
    expect(resumes({ messages: answered })).toBe(false);
  });

  it("doesn't use an answer up while the step rule says no: a call beside the picker still running", () => {
    const resumes = resumesOncePerAnswer();
    const running = { type: 'dynamic-tool', toolName: 'find_boutiques', toolCallId: 'call-5', state: 'input-available' };
    expect(resumes({ messages: [asked, concierge(step, requested, running)] })).toBe(false);
    expect(resumes({ messages: [asked, concierge(step, requested, { ...running, state: 'output-available', output: { content: [] } })] })).toBe(true);
  });

  it('keeps its own answers: each chat makes one, and two never share', () => {
    const answered = [asked, concierge(step, requested)];
    const first = resumesOncePerAnswer();
    expect(first({ messages: answered })).toBe(true);
    expect(resumesOncePerAnswer()({ messages: answered })).toBe(true);
    expect(first({ messages: answered })).toBe(false);
  });

  /**
   * The page's chat as useChat builds it: the SDK's own Chat class, with `sendAutomaticallyWhen`, and a transport in
   * place of /api/concierge. The customer's request gets the concierge's words and a choose_visit call. A resume gets
   * what the server sends: the same message continued (its `start` carries that message's id), with `reply` in a new
   * step, or nothing in it at all. Returns the chat once it has settled, and every request it sent.
   */
  const chatThroughPicker = async (answer: VisitPickerOutput, reply: string | null) => {
    const requests: UIMessage[][] = [];
    const streamOf = (chunks: UIMessageChunk[]) =>
      new ReadableStream<UIMessageChunk>({
        start(controller) {
          for (const chunk of chunks) controller.enqueue(chunk);
          controller.close();
        },
      });
    const transport: ChatTransport<UIMessage> = {
      sendMessages: async ({ messages }) => {
        requests.push(structuredClone(messages));
        // A cap, so a chat that resubmits again and again stops: this one fails, and the chat ends in an error.
        if (requests.length > 6) throw new Error('Stopped after six requests.');
        const last = messages.at(-1);
        if (last?.role === 'user') {
          return streamOf([
            { type: 'start' },
            { type: 'start-step' },
            { type: 'text-start', id: 't1' },
            { type: 'text-delta', id: 't1', delta: 'Here is the picker.' },
            { type: 'text-end', id: 't1' },
            { type: 'tool-input-start', toolCallId: 'call-1', toolName: CHOOSE_VISIT },
            { type: 'tool-input-available', toolCallId: 'call-1', toolName: CHOOSE_VISIT, input: { productSlugs: ['weekender-50'], boutique: 'ginza' } },
            { type: 'finish-step' },
            { type: 'finish', finishReason: 'tool-calls' },
          ]);
        }
        const words: UIMessageChunk[] =
          reply === null
            ? []
            : [
                { type: 'text-start', id: 't2' },
                { type: 'text-delta', id: 't2', delta: reply },
                { type: 'text-end', id: 't2' },
              ];
        return streamOf([{ type: 'start', messageId: last?.id }, { type: 'start-step' }, ...words, { type: 'finish-step' }, { type: 'finish', finishReason: 'stop' }]);
      },
      reconnectToStream: async () => null,
    };
    const chat = new Chat<UIMessage>({ transport, sendAutomaticallyWhen: resumesOncePerAnswer() });
    await chat.sendMessage({ text: 'Can we schedule one?' });
    expect(livePickerOf(chat.messages)).toBe('call-1');
    // The page hands the answer over as the picker does, and the chat resubmits on its own, unawaited.
    await chat.addToolOutput({ tool: CHOOSE_VISIT, toolCallId: 'call-1', output: answer });
    await vi.waitFor(() => expect(requests.length).toBeGreaterThan(1));
    await vi.waitFor(() => expect(chat.status).not.toMatch(/submitted|streaming/));
    await new Promise((resolve) => setTimeout(resolve, 50)); // time for any resubmit after it
    return { chat, requests };
  };

  for (const [name, answer] of [
    ['requested', { status: 'requested', appointment }],
    ['closed', { status: 'closed' }],
  ] as const) {
    it(`resubmits once when the reply after the answer (${name}) is empty, and leaves the customer the answered picker and the composer`, async () => {
      const { chat, requests } = await chatThroughPicker(answer, null);
      expect(requests).toHaveLength(2);
      expect(requests[1].at(-1)?.parts.find((part) => part.type === `tool-${CHOOSE_VISIT}`)).toMatchObject({ state: 'output-available', output: answer });
      expect(chat.status).toBe('ready');
      // The empty reply left the message as it was: the step rule alone would resubmit it again.
      expect(resumesAfterPicker({ messages: chat.messages })).toBe(true);
      const busy = chat.status === 'submitted' || chat.status === 'streaming';
      expect(composerLocked(busy, false)).toBe(false);
      const part = chat.messages.at(-1)?.parts.find((entry) => entry.type === `tool-${CHOOSE_VISIT}`) as PickerPart;
      expect(pickerViewOf(part, { live: livePickerOf(chat.messages) === 'call-1', busy })).toEqual(
        answer.status === 'requested' ? { kind: 'requested', appointment } : { kind: 'closed' }
      );
    });
  }

  it('resubmits once when the reply after the answer has words, which end the message', async () => {
    const { chat, requests } = await chatThroughPicker({ status: 'requested', appointment }, 'Your visit is requested.');
    expect(requests).toHaveLength(2);
    expect(chat.status).toBe('ready');
    expect(chat.messages.at(-1)?.parts.at(-1)).toMatchObject({ type: 'text', text: 'Your visit is requested.' });
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

describe('followScroll', () => {
  it("shows a live picker's top once, the first time its form is there, while the page follows the conversation", () => {
    expect(followScroll({ following: true, form: 'call-1', shown: null })).toEqual({ to: 'picker', shown: 'call-1' });
    // The reply's tail (busy ending, the inquiry log) changes the page again: the form stays where it is.
    expect(followScroll({ following: true, form: 'call-1', shown: 'call-1' })).toEqual({ to: 'stay', shown: 'call-1' });
    // A later picker shows its top in turn.
    expect(followScroll({ following: true, form: 'call-2', shown: 'call-1' })).toEqual({ to: 'picker', shown: 'call-2' });
  });

  it('follows the newest words as before once no form waits: the customer answered it, or wrote past it', () => {
    expect(followScroll({ following: true, form: null, shown: 'call-1' })).toEqual({ to: 'end', shown: 'call-1' });
    expect(followScroll({ following: true, form: null, shown: null })).toEqual({ to: 'end', shown: null });
  });

  it('moves nothing while the customer reads further up, and never jumps to a form they scrolled past later', () => {
    expect(followScroll({ following: false, form: null, shown: null })).toEqual({ to: 'stay', shown: null });
    expect(followScroll({ following: false, form: 'call-1', shown: null })).toEqual({ to: 'stay', shown: 'call-1' });
    // Back at the end of the conversation, with the same form still there.
    expect(followScroll({ following: true, form: 'call-1', shown: 'call-1' })).toEqual({ to: 'stay', shown: 'call-1' });
  });
});
