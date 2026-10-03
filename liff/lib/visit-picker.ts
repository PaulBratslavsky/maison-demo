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
 */
export const livePickerOf = (messages: readonly PickerMessage[]): string | null => {
  const last = messages.at(-1);
  if (last?.role !== 'assistant') return null;
  const live = last.parts.filter((part) => isWaitingPicker(part) && typeof part.toolCallId === 'string').at(-1);
  return live?.toolCallId ?? null;
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
