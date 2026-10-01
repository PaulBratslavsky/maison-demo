import type { Core } from '@strapi/strapi';

import { getConfig } from '../config';
import { UID, type Locale } from '../constants';
import { checkOpenAt, validateOpeningHours, type Weekday } from '../domain/hours';
import { generateReference } from '../domain/reference';
import { failure, type ServiceResult } from '../domain/service-result';
import { maskSubject } from '../domain/subject';
import { toZonedIso, zonedDayRange } from '../domain/time';

type Doc = Record<string, any>;

export interface AppointmentView {
  reference: string;
  status: 'requested' | 'confirmed';
  boutique: { slug: string; name: string };
  requestedFor: string;
  products: Array<{ slug: string; name: string }>;
  note: string;
  confirmationSent: boolean;
}

export interface AppointmentRequest {
  subject: string;
  boutique: string;
  productSlugs: string[];
  requestedFor: string;
  note?: string;
  createdVia: 'concierge' | 'app';
  /** Only for tests. Defaults to the current time. */
  now?: Date;
}

/** An appointment as staff see it: the customer masked, labels from published versions only. */
export interface StaffAppointmentView {
  reference: string;
  status: 'requested' | 'confirmed';
  customer: string;
  boutique: { slug: string; name: string } | null;
  requestedFor: string;
  products: Array<{ slug: string; name: string }>;
  note: string;
  createdVia: 'concierge' | 'app';
  confirmationSent: boolean;
  createdAt: string;
}

export interface RequestFilters {
  status?: 'requested' | 'confirmed' | 'all';
  boutique?: string;
  date?: string;
  limit?: number;
  locale?: Locale;
  /** Only for tests. Defaults to the current time. */
  now?: Date;
}

export interface ConfirmedAppointment {
  appointment: StaffAppointmentView;
  alreadyConfirmed: boolean;
}

const MIN_LEAD_MINUTES = 30;
const DAY_NAMES: Record<Weekday, string> = {
  mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
};
const POPULATE = { boutique: { fields: ['slug', 'name'] }, products: { fields: ['slug', 'name'] } };
/** Staff views read only documentIds from the draft's relations; every label comes from a published version. */
const STAFF_POPULATE = { boutique: { fields: ['documentId'] }, products: { fields: ['documentId'] } };

export default ({ strapi }: { strapi: Core.Strapi }) => {
  const publishedBySlug = (uid: string, slug: string, locale: Locale) =>
    strapi.documents(uid as any).findFirst({ locale, status: 'published', filters: { slug: { $eq: slug } } }) as Promise<Doc | null>;

  /** The appointment documents among `documentIds` that have a published version, i.e. that staff confirmed. */
  const confirmedIds = async (documentIds: string[]): Promise<Set<string>> => {
    if (documentIds.length === 0) return new Set();
    const rows = await strapi.documents(UID.appointment).findMany({
      status: 'published',
      filters: { documentId: { $in: documentIds } },
      fields: ['documentId'],
      limit: documentIds.length,
    });
    return new Set(rows.map((row) => row.documentId as string));
  };

  /** documentIds of every appointment that has a published version, i.e. that staff confirmed. */
  const allConfirmedIds = async (): Promise<string[]> => {
    const rows = await strapi.documents(UID.appointment).findMany({ status: 'published', fields: ['documentId'], limit: 5000 });
    return rows.map((row) => row.documentId as string);
  };

  /** The appointment references among `references` that have a `sent` notification. */
  const sentReferences = async (references: string[]): Promise<Set<string>> => {
    if (references.length === 0) return new Set();
    const rows = await strapi.documents(UID.notification).findMany({
      filters: { outcome: { $eq: 'sent' }, appointmentReference: { $in: references } },
      fields: ['appointmentReference'],
      limit: 1000,
    });
    return new Set((rows as Doc[]).map((row) => row.appointmentReference as string));
  };

  /** slug and name per documentId in `locale`, falling back to the default locale. Published versions only. */
  const labels = async (uid: string, documentIds: string[], locale: Locale) => {
    const map = new Map<string, { slug: string; name: string }>();
    const ids = [...new Set(documentIds)];
    if (ids.length === 0) return map;
    const fallback = getConfig(strapi).defaultLocale;
    for (const loc of locale === fallback ? [locale] : [locale, fallback]) {
      const rows = await strapi.documents(uid as any).findMany({
        locale: loc,
        status: 'published',
        filters: { documentId: { $in: ids } },
        fields: ['slug', 'name'],
        limit: ids.length,
      });
      for (const row of rows as Doc[]) {
        if (!map.has(row.documentId)) map.set(row.documentId, { slug: row.slug, name: row.name });
      }
    }
    return map;
  };

  /** Draft appointment documents (populated with POPULATE) → what customers see. */
  const toViews = async (docs: Doc[], locale: Locale): Promise<AppointmentView[]> => {
    const ids = docs.map((doc) => doc.documentId as string);
    const [confirmed, sent, boutiques, products] = await Promise.all([
      confirmedIds(ids),
      sentReferences(docs.map((doc) => doc.reference as string)),
      labels(UID.boutique, docs.map((doc) => doc.boutique?.documentId).filter(Boolean), locale),
      labels(UID.product, docs.flatMap((doc) => (doc.products ?? []).map((product: Doc) => product.documentId)), locale),
    ]);
    const { timezone } = getConfig(strapi);
    return docs.map((doc) => ({
      reference: doc.reference,
      status: confirmed.has(doc.documentId) ? 'confirmed' : 'requested',
      boutique: boutiques.get(doc.boutique?.documentId) ?? { slug: doc.boutique?.slug ?? '', name: doc.boutique?.name ?? '' },
      requestedFor: toZonedIso(new Date(doc.requestedFor), timezone),
      products: (doc.products ?? []).map((product: Doc) => products.get(product.documentId) ?? { slug: product.slug, name: product.name }),
      note: doc.customerNote ?? '',
      confirmationSent: sent.has(doc.reference),
    }));
  };

  /** Drafts (populated with STAFF_POPULATE) → what staff see. A label with no published version is left out, never read from a draft. */
  const toStaffViews = async (docs: Doc[], locale: Locale): Promise<StaffAppointmentView[]> => {
    const [confirmed, sent, boutiques, products] = await Promise.all([
      confirmedIds(docs.map((doc) => doc.documentId as string)),
      sentReferences(docs.map((doc) => doc.reference as string)),
      labels(UID.boutique, docs.map((doc) => doc.boutique?.documentId).filter(Boolean), locale),
      labels(UID.product, docs.flatMap((doc) => (doc.products ?? []).map((product: Doc) => product.documentId)), locale),
    ]);
    const { timezone } = getConfig(strapi);
    return docs.map((doc) => ({
      reference: doc.reference,
      status: confirmed.has(doc.documentId) ? 'confirmed' : 'requested',
      customer: maskSubject(doc.customer),
      boutique: boutiques.get(doc.boutique?.documentId) ?? null,
      requestedFor: toZonedIso(new Date(doc.requestedFor), timezone),
      products: ((doc.products ?? []) as Doc[]).flatMap((product) => products.get(product.documentId) ?? []),
      note: doc.customerNote ?? '',
      createdVia: doc.createdVia === 'concierge' ? 'concierge' : 'app',
      confirmationSent: sent.has(doc.reference),
      createdAt: toZonedIso(new Date(doc.createdAt), timezone),
    }));
  };

  /** Future requests of this customer that staff haven't confirmed yet. */
  const openRequestCount = async (subject: string, now: Date) => {
    const drafts = await strapi.documents(UID.appointment).findMany({
      status: 'draft',
      filters: { customer: { $eq: subject }, requestedFor: { $gt: now.toISOString() } },
      fields: ['documentId'],
      limit: 100,
    });
    const confirmed = await confirmedIds(drafts.map((doc) => doc.documentId as string));
    return drafts.filter((doc) => !confirmed.has(doc.documentId as string)).length;
  };

  const uniqueReference = async () => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const reference = generateReference();
      const taken = await strapi.documents(UID.appointment).count({ filters: { reference: { $eq: reference } } });
      if (taken === 0) return reference;
    }
    throw new Error('[maison] Could not find a free appointment reference after 20 attempts.');
  };

  return {
    /** Checks, in the spec's order, then creates a draft. Nothing here can publish. */
    async request(input: AppointmentRequest): Promise<ServiceResult<AppointmentView>> {
      const { defaultLocale, timezone, maxOpenRequestsPerCustomer } = getConfig(strapi);
      const now = input.now ?? new Date();

      const boutique = await publishedBySlug(UID.boutique, input.boutique, defaultLocale);
      if (!boutique) {
        return failure('not_found', `No boutique "${input.boutique}".`, 'Call find_boutiques to find valid boutique slugs.');
      }
      const products: Doc[] = [];
      for (const slug of [...new Set(input.productSlugs)]) {
        const product = await publishedBySlug(UID.product, slug, defaultLocale);
        if (!product) {
          return failure('not_found', `No published product "${slug}".`, 'Call search_products to find valid product slugs.');
        }
        products.push(product);
      }

      const when = new Date(input.requestedFor);
      if (when.getTime() - now.getTime() < MIN_LEAD_MINUTES * 60_000) {
        return failure(
          'in_the_past',
          `The visit must start at least ${MIN_LEAD_MINUTES} minutes from now.`,
          `Ask the customer for a later time. It is now ${toZonedIso(now, timezone)}.`
        );
      }

      const hours = validateOpeningHours(boutique.openingHours);
      const check = checkOpenAt(hours.ok ? hours.hours : [], when, timezone);
      if (!check.open) {
        const day = `${DAY_NAMES[check.weekday]} ${check.isoDate}`;
        const hint = check.entry
          ? `${boutique.name} is open ${check.entry.opens}–${check.entry.closes} (${timezone}) on ${day}. Suggest a time in that window, or another day; find_boutiques shows hours for a date.`
          : `${boutique.name} is closed all day on ${day}. Suggest another day; find_boutiques shows hours for a date.`;
        return failure('boutique_closed', `${boutique.name} is not open at ${toZonedIso(when, timezone)}.`, hint);
      }

      if ((await openRequestCount(input.subject, now)) >= maxOpenRequestsPerCustomer) {
        return failure(
          'too_many_open_requests',
          `This customer already has ${maxOpenRequestsPerCustomer} requests waiting for a boutique to confirm.`,
          'Call my_appointments to show them. A new request is possible once one is confirmed or its time has passed.'
        );
      }

      const created = await strapi.documents(UID.appointment).create({
        data: {
          reference: await uniqueReference(),
          customer: input.subject,
          boutique: { documentId: boutique.documentId, locale: defaultLocale },
          products: products.map((product) => ({ documentId: product.documentId, locale: defaultLocale })),
          requestedFor: when.toISOString(),
          customerNote: input.note ?? '',
          createdVia: input.createdVia,
        },
      });
      const saved = await strapi.documents(UID.appointment).findOne({ documentId: created.documentId, status: 'draft', populate: POPULATE });
      const [view] = await toViews([saved as Doc], defaultLocale);
      return { ok: true, value: view };
    },

    /** The customer's own appointments, newest first. */
    async listForCustomer(subject: string, locale: Locale): Promise<AppointmentView[]> {
      const docs = await strapi.documents(UID.appointment).findMany({
        status: 'draft',
        filters: { customer: { $eq: subject } },
        sort: 'createdAt:desc',
        populate: POPULATE,
        limit: 50,
      });
      return toViews(docs as Doc[], locale);
    },

    /**
     * Appointments for staff. "requested" (the default) lists what staff can still confirm: not confirmed yet, with
     * the visit ahead, soonest visit first. "confirmed" and "all" list the newest requests first.
     */
    async listRequests(filters: RequestFilters = {}): Promise<ServiceResult<StaffAppointmentView[]>> {
      const { defaultLocale, timezone } = getConfig(strapi);
      const status = filters.status ?? 'requested';
      const conditions: Doc[] = [];

      if (filters.boutique) {
        const boutique = await publishedBySlug(UID.boutique, filters.boutique, defaultLocale);
        if (!boutique) {
          return failure('not_found', `No boutique "${filters.boutique}".`, 'Call find_boutiques to find valid boutique slugs.');
        }
        conditions.push({ boutique: { documentId: { $eq: boutique.documentId } } });
      }
      if (filters.date) {
        const { start, end } = zonedDayRange(filters.date, timezone);
        conditions.push({ requestedFor: { $gte: start.toISOString(), $lt: end.toISOString() } });
      }
      if (status !== 'all') {
        const confirmed = await allConfirmedIds();
        if (status === 'confirmed') {
          if (confirmed.length === 0) return { ok: true, value: [] };
          conditions.push({ documentId: { $in: confirmed } });
        } else {
          if (confirmed.length > 0) conditions.push({ documentId: { $notIn: confirmed } });
          conditions.push({ requestedFor: { $gte: (filters.now ?? new Date()).toISOString() } });
        }
      }

      const docs = await strapi.documents(UID.appointment).findMany({
        status: 'draft',
        filters: conditions.length > 0 ? { $and: conditions } : {},
        sort: status === 'requested' ? 'requestedFor:asc' : 'createdAt:desc',
        populate: STAFF_POPULATE,
        limit: filters.limit ?? 20,
      });
      return { ok: true, value: await toStaffViews(docs as Doc[], filters.locale ?? defaultLocale) };
    },

    /**
     * Staff confirmation: publishes the draft, the same as Publish in the Content Manager. Confirming twice is safe.
     * It never messages anyone; the LINE ops agent sends the confirmation afterwards.
     */
    async confirm(reference: string, now: Date = new Date()): Promise<ServiceResult<ConfirmedAppointment>> {
      const { defaultLocale, timezone } = getConfig(strapi);
      const draft = (await strapi.documents(UID.appointment).findFirst({
        status: 'draft',
        filters: { reference: { $eq: reference } },
        fields: ['documentId', 'requestedFor'],
      })) as Doc | null;
      if (!draft) {
        return failure('not_found', `No appointment ${reference}.`, 'Use a reference from appointment_requests.');
      }

      const alreadyConfirmed = (await confirmedIds([draft.documentId])).size > 0;
      if (!alreadyConfirmed) {
        const when = new Date(draft.requestedFor);
        if (when.getTime() < now.getTime()) {
          return failure(
            'in_the_past',
            `The visit for ${reference} was at ${toZonedIso(when, timezone)}, which has passed.`,
            "A past visit can't be confirmed. Ask the customer to request a new time."
          );
        }
        await strapi.documents(UID.appointment).publish({ documentId: draft.documentId });
      }

      const saved = await strapi.documents(UID.appointment).findOne({ documentId: draft.documentId, status: 'draft', populate: STAFF_POPULATE });
      const [appointment] = await toStaffViews([saved as Doc], defaultLocale);
      return { ok: true, value: { appointment, alreadyConfirmed } };
    },
  };
};
