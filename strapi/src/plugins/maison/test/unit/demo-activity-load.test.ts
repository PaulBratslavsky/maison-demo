import { describe, expect, it } from 'vitest';
import activity from '../../server/seed/activity.json';
import content from '../../server/seed/content.json';
import { UID } from '../../server/src/constants';
import { HAND_OFF_LOGGED_AFTER_MS, hoursBefore } from '../../server/src/domain/demo-activity';
import { zonedParts } from '../../server/src/domain/hours';
import seedService from '../../server/src/services/seed';
import { fakeStrapi } from './fake-strapi';

const SUBJECTS = activity.customers.map((customer) => customer.subject);
const subjectOf = (key: string) => activity.customers.find((customer) => customer.key === key)?.subject;
const STOCK = Object.entries(content.stock).flatMap(([productSlug, perBoutique]) =>
  Object.entries(perBoutique).map(([boutiqueSlug, quantity]) => ({ productSlug, boutiqueSlug, quantity }))
);
// Monday 5 October 2026, 21:00 in Tokyo.
const NOW = new Date('2026-10-05T12:00:00.000Z');

type Counts = Partial<Record<string, number>>;

/**
 * A Strapi with the demo catalog loaded (or `boutiques`, `stock` in its place) and `counts` rows for the demo customers. It
 * records each count, each create, each request and confirmation the appointments service is asked for, and each row whose
 * received time is set. A request answers APT-1001, APT-1002 and so on, or `refuseRequest`'s failure for that one.
 */
const strapiWith = ({
  counts = {},
  boutiques = content.boutiques,
  stock = STOCK,
  refuseRequest,
}: { counts?: Counts; boutiques?: typeof content.boutiques; stock?: typeof STOCK; refuseRequest?: number } = {}) => {
  const counted: Array<{ uid: string; params: any }> = [];
  const created: Array<{ uid: string; data: any; documentId: string }> = [];
  const requested: any[] = [];
  const confirmed: string[] = [];
  const received: Array<{ uid: string; where: any; createdAt: Date }> = [];
  const documents = (uid: string) => ({
    count: async (params: any) => {
      counted.push({ uid, params });
      // The demo customers' rows: `counts`, and what this load added. A question reference is free unless a question has it.
      if (!params?.filters?.customer) return 0;
      return (counts[uid] ?? 0) + created.filter((row) => row.uid === uid).length + (uid === UID.appointment ? requested.length : 0);
    },
    findMany: async () => {
      if (uid === UID.boutique) return boutiques.map(({ slug, openingHours }) => ({ slug, openingHours }));
      if (uid === UID.product) return content.products.map(({ slug }) => ({ slug }));
      if (uid === UID.stockLevel) return stock;
      return [];
    },
    create: async ({ data }: { data: any }) => {
      const documentId = `${uid.split('.').pop()}-${created.length + 1}`;
      created.push({ uid, data, documentId });
      return { documentId };
    },
  });
  const appointments = {
    request: async (input: any) => {
      requested.push(input);
      if (requested.length === refuseRequest) return { ok: false, code: 'boutique_closed', message: 'Ginza is not open then.', hint: '' };
      return { ok: true, value: { reference: `APT-${1000 + requested.length}` } };
    },
    confirm: async (reference: string) => {
      confirmed.push(reference);
      return { ok: true, value: { appointment: { reference, confirmationSent: false }, alreadyConfirmed: false } };
    },
  };
  const strapi = {
    ...fakeStrapi({ services: { appointments }, documents }),
    db: {
      query: (uid: string) => ({
        updateMany: async ({ where, data }: { where: any; data: { createdAt: Date } }) => {
          received.push({ uid, where, createdAt: data.createdAt });
          return { count: 1 };
        },
      }),
    },
  } as any;
  return { strapi, counted, created, requested, confirmed, received };
};

const load = (strapi: any) => seedService({ strapi }).loadDemoActivity(NOW);
const NOTHING = { created: false, customers: 0, appointments: 0, confirmed: 0, questions: 0, inquiries: 0 };

describe('loadDemoActivity: when it adds nothing', () => {
  it.each([
    ['an appointment', UID.appointment],
    ['a question', UID.question],
    ['an inquiry', UID.inquiry],
  ])('adds nothing when one of the demo customers has %s already', async (_what, uid) => {
    const { strapi, created, requested, confirmed, received } = strapiWith({ counts: { [uid]: 1 } });
    expect(await load(strapi)).toEqual({ ok: true, value: NOTHING });
    expect([created, requested, confirmed, received]).toEqual([[], [], [], []]);
  });

  it("counts only the five demo customers' rows, so anyone else's activity never stops it", async () => {
    const { strapi, counted } = strapiWith();
    await load(strapi);
    for (const uid of [UID.appointment, UID.question, UID.inquiry]) {
      const reads = counted.filter((call) => call.uid === uid && call.params?.filters?.customer);
      expect(reads, uid).toHaveLength(1);
      expect(reads[0].params.filters).toEqual({ customer: { $in: SUBJECTS } });
    }
  });

  it('answers not_found and adds nothing when the demo catalog is not loaded', async () => {
    const { strapi, created, requested } = strapiWith({ boutiques: [] });
    const result = await load(strapi);
    expect(result).toMatchObject({ ok: false, code: 'not_found' });
    expect((result as { message: string }).message).toMatch(/Load demo catalog/);
    expect([created, requested]).toEqual([[], []]);
  });

  it('answers not_found and adds nothing when a boutique has no piece in stock', async () => {
    const { strapi, created, requested } = strapiWith({ stock: STOCK.filter((level) => level.boutiqueSlug !== 'osaka') });
    const result = await load(strapi);
    expect(result).toMatchObject({ ok: false, code: 'not_found' });
    expect((result as { message: string }).message).toMatch(/osaka/i);
    expect([created, requested]).toEqual([[], []]);
  });

  it('adds it once when pressed twice at the same moment: the second press waits for the first, then finds it there', async () => {
    const { strapi, requested } = strapiWith();
    const service = seedService({ strapi });
    const results = await Promise.all([service.loadDemoActivity(NOW), service.loadDemoActivity(NOW)]);
    expect(results.map((result: any) => result.value.created)).toEqual([true, false]);
    expect(requested).toHaveLength(5);
  });

  it('stops with a message that says to reset when a request is refused partway', async () => {
    const { strapi } = strapiWith({ refuseRequest: 3 });
    await expect(load(strapi)).rejects.toThrow(/Ginza is not open then\..*Reset demo activity/);
  });
});

describe('loadDemoActivity: what it adds', () => {
  it('answers what it added: five requests, two of them confirmed, five questions and ten inquiries, from five customers', async () => {
    const { strapi } = strapiWith();
    expect(await load(strapi)).toEqual({
      ok: true,
      value: { created: true, customers: 5, appointments: 5, confirmed: 2, questions: 5, inquiries: 10 },
    });
  });

  it("requests each visit through the appointments service, as its customer, in its language, made the seed's way, with its note", async () => {
    const { strapi, requested } = strapiWith();
    await load(strapi);
    expect(requested).toHaveLength(5);
    activity.appointments.forEach((visit, index) => {
      const input = requested[index];
      expect(input).toMatchObject({
        subject: subjectOf(visit.customer),
        boutique: visit.boutique,
        productSlugs: visit.pieces,
        createdVia: visit.createdVia,
        locale: visit.language,
        now: NOW,
      });
      expect(input.note ?? null, visit.customer).toBe(visit.note ?? null);
      const days = (Date.parse(`${zonedParts(new Date(input.requestedFor), 'Asia/Tokyo').isoDate}T00:00:00Z`) - Date.parse('2026-10-05T00:00:00Z')) / 86_400_000;
      expect(days, visit.customer).toBeGreaterThanOrEqual(2);
      expect(days, visit.customer).toBeLessThanOrEqual(13);
    });
  });

  it('confirms the two visits the seed marks confirmed, through the same service as the board', async () => {
    const { strapi, confirmed } = strapiWith();
    await load(strapi);
    const references = activity.appointments.flatMap((visit, index) => (visit.confirmed ? [`APT-${1001 + index}`] : []));
    expect(confirmed).toEqual(references);
  });

  it("records each question as the customer's, named, with a reference from the generator, and as far along as the seed says", async () => {
    const { strapi, created } = strapiWith();
    await load(strapi);
    const questions = created.filter((row) => row.uid === UID.question);
    expect(questions).toHaveLength(5);
    activity.questions.forEach((seed, index) => {
      const { data } = questions[index];
      expect(data.reference).toMatch(/^Q-\d{4}$/);
      expect(data).toMatchObject({
        customer: subjectOf(seed.customer),
        customerName: activity.customers.find((customer) => customer.key === seed.customer)?.name,
        question: seed.question,
        reason: seed.reason,
        language: seed.language,
        productSlug: seed.productSlug ?? null,
        status: seed.status,
      });
      if (seed.status === 'taken') expect(data).toMatchObject({ staffName: seed.staffName, takenAt: hoursBefore(NOW, seed.takenHoursAgo as number) });
      if (seed.status === 'answered') {
        expect(data).toMatchObject({ staffName: seed.staffName, answer: seed.answer, answeredAt: hoursBefore(NOW, seed.answeredHoursAgo as number) });
      }
      // Nothing went out on LINE, so nothing says it did, and an answer that never became knowledge leaves Reset nothing extra.
      expect(data).not.toHaveProperty('lineOutcome');
      expect(data).not.toHaveProperty('knowledgeDocumentId');
    });
  });

  it("logs each question's hand-off as the concierge's turn, linked to the question, in Needs an answer, and replied for the answered one", async () => {
    const { strapi, created } = strapiWith();
    await load(strapi);
    const questions = created.filter((row) => row.uid === UID.question);
    const handOffs = created.filter((row) => row.uid === UID.inquiry && row.data.handedOff);
    expect(handOffs).toHaveLength(5);
    activity.questions.forEach((seed, index) => {
      const { data } = handOffs[index];
      expect(data).toMatchObject({
        customer: subjectOf(seed.customer),
        message: seed.question,
        reply: seed.handOff.reply,
        language: seed.language,
        knowledgeFound: false,
        handedOff: true,
        questionReference: questions[index].data.reference,
        productSlug: seed.productSlug ?? null,
        via: 'concierge',
        kind: 'question',
        queue: 'needs-answer',
        analysisStatus: 'analyzed',
        modelVersion: 'demo-seed',
        status: seed.status === 'answered' ? 'replied' : 'open',
      });
      expect(data).not.toHaveProperty('promptVersion');
      if (seed.status === 'answered') {
        expect(data).toMatchObject({ replyText: seed.answer, repliedBy: seed.staffName, repliedAt: hoursBefore(NOW, seed.answeredHoursAgo as number) });
        expect(data).not.toHaveProperty('lineOutcome');
      }
    });
  });

  it('logs the five standalone turns, four labelled with their queues and one pending for the sweep', async () => {
    const { strapi, created } = strapiWith();
    await load(strapi);
    const standalone = created.filter((row) => row.uid === UID.inquiry && !row.data.handedOff);
    expect(standalone.map(({ data }) => [data.kind ?? null, data.queue, data.analysisStatus])).toEqual(
      activity.inquiries.map((seed) =>
        seed.labels === null
          ? [null, 'none', 'pending']
          : [seed.labels.kind, { complaint: 'complaint', praise: 'praise', question: 'none' }[seed.labels.kind as string], 'analyzed']
      )
    );
    for (const { data } of standalone) expect(data).toMatchObject({ via: 'concierge', handedOff: false, status: 'open' });
  });

  it('sets when each row came in from its hoursAgo, every row of a confirmed visit by its reference, and a hand-off 15 seconds after its question', async () => {
    const { strapi, created, received } = strapiWith();
    await load(strapi);
    const at = (uid: string, where: any) => received.find((row) => row.uid === uid && JSON.stringify(row.where) === JSON.stringify(where))?.createdAt;

    activity.appointments.forEach((visit, index) => {
      expect(at(UID.appointment, { reference: `APT-${1001 + index}` }), visit.customer).toEqual(hoursBefore(NOW, visit.hoursAgo));
    });
    const questions = created.filter((row) => row.uid === UID.question);
    const inquiries = created.filter((row) => row.uid === UID.inquiry);
    activity.questions.forEach((seed, index) => {
      const asked = hoursBefore(NOW, seed.hoursAgo);
      expect(at(UID.question, { documentId: questions[index].documentId })).toEqual(asked);
      expect(at(UID.inquiry, { documentId: inquiries[index].documentId })).toEqual(new Date(asked.getTime() + HAND_OFF_LOGGED_AFTER_MS));
    });
    activity.inquiries.forEach((seed, index) => {
      expect(at(UID.inquiry, { documentId: inquiries[5 + index].documentId })).toEqual(hoursBefore(NOW, seed.hoursAgo));
    });
    expect(received).toHaveLength(20);
  });
});
