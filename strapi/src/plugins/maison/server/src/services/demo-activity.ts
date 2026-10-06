import type { Core } from '@strapi/strapi';
import { errors } from '@strapi/utils';

import seed from '../../seed/activity.json';
import { getConfig } from '../config';
import { UID } from '../constants';
import {
  HAND_OFF_LOGGED_AFTER_MS,
  VISIT_DAYS,
  demoActivityLoaded,
  hoursBefore,
  inStockAt,
  inquiryLabels,
  piecesAt,
  visitTime,
  type ActivitySeed,
  type SeedAppointment,
  type SeedInquiry,
  type SeedQuestion,
  type StockLevel,
} from '../domain/demo-activity';
import { validateOpeningHours } from '../domain/hours';
import { failure, type ServiceResult } from '../domain/service-result';
import { uniqueQuestionReference } from './questions';

/*
 * Load demo activity, for the seed service. It is no service of its own: `services/index.ts` doesn't register it.
 */

type Doc = Record<string, any>;

const activity = seed as ActivitySeed;

/** What Load demo activity added. All zeros, with `created` false, when the demo activity was there already. */
export interface ActivityResult {
  created: boolean;
  customers: number;
  appointments: number;
  /** Of those requests, the ones confirmed. */
  confirmed: number;
  questions: number;
  inquiries: number;
}

const NOTHING_ADDED: ActivityResult = { created: false, customers: 0, appointments: 0, confirmed: 0, questions: 0, inquiries: 0 };

const LOAD_CATALOG = 'Press Load demo catalog, then Load demo activity again.';

/** A visit ready to request: what the seed says, and the time and pieces the boutique's hours and stock allow. */
interface PlannedVisit {
  visit: SeedAppointment;
  requestedFor: Date;
  pieces: string[];
}

/** `text` as a sentence: trimmed, ending in a full stop unless it ends in one already, or another mark. */
const asSentence = (text: string): string => (/[.!?。]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`);

const customerOf = (key: string) => {
  const customer = activity.customers.find((candidate) => candidate.key === key);
  if (!customer) throw new Error(`activity.json names no customer "${key}".`);
  return customer;
};

/**
 * Sets when a seeded row came in. Strapi stamps createdAt with the current time as it creates a row, so the seed's time is
 * written afterwards, through the query engine, to every row that matches `where`: for a confirmed visit, its draft and
 * its published version.
 */
const setReceived = (strapi: Core.Strapi, uid: string, where: Doc, createdAt: Date) =>
  strapi.db.query(uid as any).updateMany({ where, data: { createdAt } });

/**
 * Each seeded visit's time and pieces, from the boutiques' hours and stock as they are now, before anything is written.
 * A boutique that isn't published, is open on no day of the window, or has no published piece in stock is `not_found` or
 * `boutique_closed`, and nothing is added.
 */
const planVisits = async (strapi: Core.Strapi, now: Date): Promise<ServiceResult<PlannedVisit[]>> => {
  const { defaultLocale, timezone } = getConfig(strapi);
  const boutiqueSlugs = [...new Set(activity.appointments.map((visit) => visit.boutique))];
  const [boutiques, products, stock] = (await Promise.all([
    strapi.documents(UID.boutique).findMany({
      locale: defaultLocale,
      status: 'published',
      filters: { slug: { $in: boutiqueSlugs } },
      fields: ['slug', 'openingHours'],
      limit: boutiqueSlugs.length,
    }),
    strapi.documents(UID.product).findMany({ locale: defaultLocale, status: 'published', fields: ['slug'], limit: 1000 }),
    strapi.documents(UID.stockLevel).findMany({
      filters: { boutiqueSlug: { $in: boutiqueSlugs }, quantity: { $gt: 0 } },
      fields: ['productSlug', 'boutiqueSlug', 'quantity'],
      limit: 5000,
    }),
  ])) as [Doc[], Doc[], Doc[]];
  const published = products.map((product) => product.slug as string);
  const levels = stock as StockLevel[];

  const plans: PlannedVisit[] = [];
  for (const visit of activity.appointments) {
    const boutique = boutiques.find((candidate) => candidate.slug === visit.boutique);
    if (!boutique) {
      return failure('not_found', `Load demo catalog first: there's no published boutique "${visit.boutique}".`, LOAD_CATALOG);
    }
    const hours = validateOpeningHours(boutique.openingHours);
    const requestedFor = visitTime({ daysAhead: visit.daysAhead, time: visit.time, hours: hours.ok ? hours.hours : [], now, timezone });
    if (!requestedFor) {
      return failure(
        'boutique_closed',
        `The boutique "${visit.boutique}" isn't open on any day from ${VISIT_DAYS.first} to ${VISIT_DAYS.last} days from now.`,
        'Check its opening hours in the Content Manager, then press Load demo activity again.'
      );
    }
    const pieces = piecesAt(visit.pieces, inStockAt(levels, visit.boutique, published));
    if (pieces.length === 0) {
      return failure(
        'not_found',
        `The boutique "${visit.boutique}" has no published piece in stock.`,
        'Give it stock of a published piece in the Content Manager, then press Load demo activity again.'
      );
    }
    plans.push({ visit, requestedFor, pieces });
  }
  return { ok: true, value: plans };
};

/**
 * Requests each visit as its customer would, through the appointments service, so the board's own rules accept it and
 * it gets a reference from the same generator. A confirmed one is then confirmed as the board's Confirm does it: the
 * publish sends its LINE confirmation, and whatever LINE answers is recorded.
 */
const requestVisits = async (strapi: Core.Strapi, plans: PlannedVisit[], now: Date): Promise<void> => {
  const appointments = strapi.plugin('maison').service('appointments');
  for (const { visit, requestedFor, pieces } of plans) {
    const requested = await appointments.request({
      subject: customerOf(visit.customer).subject,
      boutique: visit.boutique,
      productSlugs: pieces,
      requestedFor: requestedFor.toISOString(),
      ...(visit.note ? { note: visit.note } : {}),
      createdVia: visit.createdVia,
      locale: visit.language,
      now,
    });
    if (requested.ok === false) throw new Error(requested.message);
    const { reference } = requested.value;
    if (visit.confirmed) {
      const confirmed = await appointments.confirm(reference, now);
      if (confirmed.ok === false) throw new Error(confirmed.message);
    }
    await setReceived(strapi, UID.appointment, { reference }, hoursBefore(now, visit.hoursAgo));
  }
};

/**
 * Records a question as the concierge's hand-off does, as far along as the seed says: taken, or answered. Nothing went to
 * the customer on LINE, so no LINE outcome is written, and an answer never becomes product knowledge. Then the
 * concierge's turn that handed it off is logged, linked to it, as the app logs it a moment later. The answered
 * question's inquiry is replied, with the answer, as answering a question marks it.
 */
const recordQuestion = async (strapi: Core.Strapi, question: SeedQuestion, now: Date): Promise<void> => {
  const customer = customerOf(question.customer);
  const reference = await uniqueQuestionReference(strapi);
  const asked = hoursBefore(now, question.hoursAgo);
  const answeredAt = question.status === 'answered' ? hoursBefore(now, question.answeredHoursAgo ?? 0) : null;
  const created = await strapi.documents(UID.question).create({
    data: {
      reference,
      customer: customer.subject,
      customerName: customer.name,
      question: question.question,
      reason: question.reason,
      language: question.language,
      productSlug: question.productSlug ?? null,
      status: question.status,
      ...(question.status === 'taken' ? { staffName: question.staffName, takenAt: hoursBefore(now, question.takenHoursAgo ?? 0) } : {}),
      ...(question.status === 'answered' ? { staffName: question.staffName, answer: question.answer, answeredAt } : {}),
    },
  });
  await setReceived(strapi, UID.question, { documentId: created.documentId }, asked);

  const handOff = await strapi.documents(UID.inquiry).create({
    data: {
      customer: customer.subject,
      message: question.question,
      reply: question.handOff.reply,
      language: question.language,
      knowledgeFound: false,
      handedOff: true,
      questionReference: reference,
      productSlug: question.productSlug ?? null,
      via: 'concierge',
      ...inquiryLabels(question.handOff.labels, true),
      status: answeredAt ? 'replied' : 'open',
      ...(answeredAt ? { replyText: question.answer, repliedAt: answeredAt, repliedBy: question.staffName } : {}),
    },
  });
  await setReceived(strapi, UID.inquiry, { documentId: handOff.documentId }, new Date(asked.getTime() + HAND_OFF_LOGGED_AFTER_MS));
};

/** Logs a concierge turn that handed nothing off, labelled as the seed says, or pending for the labelling sweep. */
const logInquiry = async (strapi: Core.Strapi, inquiry: SeedInquiry, now: Date): Promise<void> => {
  const created = await strapi.documents(UID.inquiry).create({
    data: {
      customer: customerOf(inquiry.customer).subject,
      message: inquiry.message,
      reply: inquiry.reply,
      language: inquiry.language,
      knowledgeFound: inquiry.knowledgeFound,
      handedOff: false,
      productSlug: inquiry.productSlug,
      via: 'concierge',
      ...inquiryLabels(inquiry.labels, false),
      status: 'open',
    },
  });
  await setReceived(strapi, UID.inquiry, { documentId: created.documentId }, hoursBefore(now, inquiry.hoursAgo));
};

/**
 * Load demo activity: five made-up customers' visit requests, questions and inquiries, received over the last three
 * days (server/seed/activity.json). It adds them only when none of those customers has an appointment, a question or an
 * inquiry, so pressing it again adds nothing, and nobody else's activity counts or is touched. Every visit's time and
 * pieces are worked out first, so a catalog that isn't loaded adds nothing. A failure after that stops partway, and the
 * error says to reset. `now` is only for tests. It defaults to the current time.
 */
export const loadDemoActivity = async (strapi: Core.Strapi, now: Date = new Date()): Promise<ServiceResult<ActivityResult>> => {
  const theirs = { filters: { customer: { $in: activity.customers.map((customer) => customer.subject) } } };
  const [appointments, questions, inquiries] = await Promise.all([
    strapi.documents(UID.appointment).count(theirs),
    strapi.documents(UID.question).count(theirs),
    strapi.documents(UID.inquiry).count(theirs),
  ]);
  if (demoActivityLoaded({ appointments, questions, inquiries })) return { ok: true, value: NOTHING_ADDED };

  const plans = await planVisits(strapi, now);
  if (plans.ok === false) return plans;

  try {
    await requestVisits(strapi, plans.value, now);
    for (const question of activity.questions) await recordQuestion(strapi, question, now);
    for (const inquiry of activity.inquiries) await logInquiry(strapi, inquiry, now);
  } catch (error) {
    const message = `Loading the demo activity stopped partway: ${asSentence(String((error as Error)?.message ?? error))} Press Reset demo activity, then Load demo activity again.`;
    strapi.log.error(`[maison] ${message}`);
    throw new errors.ApplicationError(message);
  }

  return {
    ok: true,
    value: {
      created: true,
      customers: activity.customers.length,
      appointments: plans.value.length,
      confirmed: plans.value.filter(({ visit }) => visit.confirmed).length,
      questions: activity.questions.length,
      inquiries: activity.questions.length + activity.inquiries.length,
    },
  };
};
