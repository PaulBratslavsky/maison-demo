import type { Core } from '@strapi/strapi';

import { getConfig } from '../config';
import { UID } from '../constants';
import { buildConfirmationMessage, type FlexMessage } from '../domain/flex-message';
import { failure, type ServiceResult } from '../domain/service-result';
import { lineUserIdOf, parseSubject } from '../domain/subject';
import { formatJaDateTime, toZonedIso } from '../domain/time';

type Doc = Record<string, any>;
export type Outcome = 'sent' | 'failed';
/** Who recorded an outcome: Strapi itself, when it sent the confirmation, or the ops agent, through record_confirmation. */
export type RecordedBy = 'strapi' | 'ops-agent';

export interface PendingConfirmation {
  reference: string;
  lineUserId: string;
  boutique: { name: string; address: string };
  requestedFor: string;
  requestedForText: string;
  products: Array<{ name: string }>;
  previousAttempts: number;
  appLink: string;
  message: FlexMessage;
}

export interface RecordedConfirmation {
  notification: { reference: string; status: Outcome; sentAt: string; detail: string };
  alreadyRecorded: boolean;
}

/** Who gets an appointment's LINE confirmation, and what it says. */
export type LineConfirmation = Omit<PendingConfirmation, 'reference' | 'previousAttempts'>;

/** What a confirmation needs from a published appointment: the boutique's name and address, and the products' names. */
export const CONFIRMATION_POPULATE = { boutique: { fields: ['name', 'address'] }, products: { fields: ['name'] } };

/**
 * The LINE confirmation of a published appointment populated with CONFIRMATION_POPULATE: its recipient, its details
 * and its flex message. pending_confirmations lists it and Strapi sends it, so the two can't drift. null when the
 * appointment has no valid LINE customer.
 */
export const confirmationFor = (
  appointment: Doc,
  { liffUrl, timezone, houseName }: { liffUrl: string; timezone: string; houseName: { ja: string } }
): LineConfirmation | null => {
  const subject = parseSubject(appointment.customer);
  if (!subject) return null;
  const when = new Date(appointment.requestedFor);
  const appLink = `${liffUrl}/visits/${appointment.reference}`;
  const boutique = { name: appointment.boutique?.name ?? '', address: appointment.boutique?.address ?? '' };
  const products = ((appointment.products ?? []) as Doc[]).map((product) => ({ name: product.name as string }));
  const requestedForText = formatJaDateTime(when, timezone);
  return {
    lineUserId: lineUserIdOf(subject),
    boutique,
    requestedFor: toZonedIso(when, timezone),
    requestedForText,
    products,
    appLink,
    message: buildConfirmationMessage({
      houseName: houseName.ja,
      reference: appointment.reference,
      boutiqueName: boutique.name,
      boutiqueAddress: boutique.address,
      requestedForText,
      productNames: products.map((product) => product.name),
      appLink,
    }),
  };
};

const DETAIL_MAX = 500;
/** Strapi's maxLength counts UTF-16 units (an emoji is two), so measure that, and never cut a surrogate pair. */
const clip = (text: string) => {
  if (text.length <= DETAIL_MAX) return text;
  let clipped = '';
  for (const char of text) {
    if (clipped.length + char.length > DETAIL_MAX - 1) break;
    clipped += char;
  }
  return `${clipped}…`;
};

export default ({ strapi }: { strapi: Core.Strapi }) => {
  /** Per appointment reference: whether a `sent` notification exists, and how many `failed` ones. */
  const outcomes = async (references: string[]) => {
    const map = new Map<string, { sent: boolean; failed: number }>();
    if (references.length === 0) return map;
    const rows = await strapi.documents(UID.notification).findMany({
      filters: { appointmentReference: { $in: references } },
      fields: ['appointmentReference', 'outcome'],
      limit: 5000,
    });
    for (const row of rows as Doc[]) {
      const reference = row.appointmentReference as string;
      const entry = map.get(reference) ?? { sent: false, failed: 0 };
      if (row.outcome === 'sent') entry.sent = true;
      else entry.failed += 1;
      map.set(reference, entry);
    }
    return map;
  };

  /** References of every appointment with a `sent` notification. Not capped: a cap would let sent ones be listed again. */
  const sentReferences = async (): Promise<string[]> => {
    const rows = await strapi.documents(UID.notification).findMany({
      filters: { outcome: { $eq: 'sent' } },
      fields: ['appointmentReference'],
    });
    return [...new Set((rows as Doc[]).map((row) => row.appointmentReference as string))];
  };

  const toRecorded = (reference: string, row: Doc, alreadyRecorded: boolean): RecordedConfirmation => ({
    notification: { reference, status: row.outcome, sentAt: new Date(row.sentAt).toISOString(), detail: row.detail ?? '' },
    alreadyRecorded,
  });

  return {
    /** Upcoming published (staff-confirmed) appointments without a `sent` notification, soonest visit first. */
    async listPending(limit: number, now: Date = new Date()): Promise<ServiceResult<PendingConfirmation[]>> {
      const { liffUrl, timezone, houseName } = getConfig(strapi);
      if (!liffUrl) {
        return failure(
          'not_configured',
          'The maison plugin has no liffUrl, so the confirmation link would be broken.',
          'Set liffUrl in the maison plugin config (MAISON_LIFF_URL in LaunchPad) and restart Strapi. Send nothing until then.'
        );
      }
      // The query itself leaves out visits that are over and ones already sent, so `limit` counts only what's left to send.
      const sent = await sentReferences();
      const published = (await strapi.documents(UID.appointment).findMany({
        status: 'published',
        filters: {
          requestedFor: { $gte: now.toISOString() },
          ...(sent.length > 0 ? { reference: { $notIn: sent } } : {}),
        },
        sort: 'requestedFor:asc',
        populate: CONFIRMATION_POPULATE,
        limit,
      })) as Doc[];
      const state = await outcomes(published.map((doc) => doc.reference as string));

      const pending: PendingConfirmation[] = [];
      for (const doc of published) {
        if (state.get(doc.reference)?.sent) continue; // recorded as sent since the query above
        const confirmation = confirmationFor(doc, { liffUrl, timezone, houseName });
        if (!confirmation) {
          strapi.log.warn(`[maison] Appointment ${doc.reference} has no valid LINE customer, so it can't be confirmed over LINE.`);
          continue;
        }
        // In the order pending_confirmations has always listed them.
        pending.push({
          reference: doc.reference,
          lineUserId: confirmation.lineUserId,
          boutique: confirmation.boutique,
          requestedFor: confirmation.requestedFor,
          requestedForText: confirmation.requestedForText,
          products: confirmation.products,
          previousAttempts: state.get(doc.reference)?.failed ?? 0,
          appLink: confirmation.appLink,
          message: confirmation.message,
        });
      }
      return { ok: true, value: pending };
    },

    /**
     * Appends a delivery outcome. A second `sent` for the same appointment returns the first one instead.
     * `recordedBy` defaults to the ops agent, so record_confirmation, which never passes it, keeps writing 'ops-agent'.
     */
    async record(input: {
      reference: string;
      status: Outcome;
      detail: string;
      recordedBy?: RecordedBy;
    }): Promise<ServiceResult<RecordedConfirmation>> {
      const appointment = (await strapi.documents(UID.appointment).findFirst({
        status: 'draft',
        filters: { reference: { $eq: input.reference } },
        fields: ['documentId', 'reference'],
      })) as Doc | null;
      if (!appointment) {
        return failure('not_found', `No appointment ${input.reference}.`, 'Use a reference from pending_confirmations.');
      }
      const published = await strapi.documents(UID.appointment).count({
        status: 'published',
        filters: { documentId: { $eq: appointment.documentId } },
      });
      if (published === 0) {
        return failure(
          'not_published',
          `Appointment ${input.reference} has not been confirmed by the boutique.`,
          'Only published appointments get confirmations. Do not message the customer; call pending_confirmations for the ones to send.'
        );
      }
      if (input.status === 'sent') {
        const existing = (await strapi.documents(UID.notification).findFirst({
          filters: { outcome: { $eq: 'sent' }, appointmentReference: { $eq: input.reference } },
          sort: 'sentAt:asc',
        })) as Doc | null;
        if (existing) return { ok: true, value: toRecorded(input.reference, existing, true) };
      }
      const created = await strapi.documents(UID.notification).create({
        data: {
          appointmentReference: input.reference,
          channel: 'line',
          outcome: input.status,
          sentAt: new Date().toISOString(),
          detail: clip(input.detail),
          recordedBy: input.recordedBy ?? 'ops-agent',
        },
      });
      const saved = (await strapi.documents(UID.notification).findOne({ documentId: created.documentId })) as Doc;
      return { ok: true, value: toRecorded(input.reference, saved, false) };
    },
  };
};
