import { describe, expect, it, vi } from 'vitest';
import appointments from '../../server/src/services/appointments';
import { UID } from '../../server/src/constants';
import { fakeStrapi } from './fake-strapi';

const SUBJECT = `line:U${'a'.repeat(32)}`;
const NOW = new Date('2029-12-31T16:00:00Z');

/**
 * Appointment drafts as the Document Service returns them for the board's "All requests" rows: newest first, which is
 * the order the service asks the database for. createdAt is stored in UTC, with milliseconds.
 */
const drafts = [
  {
    documentId: 'doc-newest', reference: 'APT-3333', customer: SUBJECT, boutique: { documentId: 'b-ginza' },
    products: [{ documentId: 'p-weekender' }], requestedFor: '2030-01-19T05:00:00.000Z', customerNote: 'Window seat, please',
    createdVia: 'app', createdAt: '2029-12-31T15:00:07.123Z',
  },
  {
    documentId: 'doc-oldest', reference: 'APT-1111', customer: SUBJECT, boutique: { documentId: 'b-ginza' },
    products: [], requestedFor: '2020-01-05T06:00:00.000Z', customerNote: undefined,
    createdVia: 'concierge', createdAt: '2029-12-30T03:30:00.000Z',
  },
];

/**
 * The appointments' findMany, kept so a test can read the query the newest rows come from. The fake answers from
 * `drafts` in fixture order whatever the sort and limit say, so the order itself is only proven by asking for it.
 */
const appointmentFindMany = vi.fn(async (query: { status: string; fields?: string[] }) => {
  if (query.status === 'published') return [{ documentId: 'doc-oldest' }]; // the oldest is confirmed
  if (query.fields?.includes('reference')) return []; // no confirmed visit is still ahead
  return drafts;
});

/** The Document Service calls summarizeRequests makes, answered from `drafts` whatever their filters say. */
const documents = (uid: string) => {
  if (uid === UID.appointment) return { count: vi.fn(async () => 1), findMany: appointmentFindMany };
  if (uid === UID.boutique) return { findMany: vi.fn(async () => [{ documentId: 'b-ginza', slug: 'ginza', name: 'Ginza Flagship' }]) };
  return { findMany: vi.fn(async () => []) }; // notifications, product labels
};

describe('appointments.summarizeRequests: the newest requests', () => {
  const summarize = () => appointments({ strapi: fakeStrapi({ documents }) }).summarizeRequests(NOW);

  it("carries each row's createdAt, in Tokyo time like the visit time, and its note", async () => {
    const { recent } = await summarize();
    expect(recent).toEqual([
      {
        reference: 'APT-3333',
        status: 'requested',
        customer: 'line:Uaaa…aa',
        boutique: { slug: 'ginza', name: 'Ginza Flagship' },
        requestedFor: '2030-01-19T14:00:00+09:00',
        note: 'Window seat, please',
        confirmationSent: false,
        createdAt: '2030-01-01T00:00:07+09:00',
      },
      {
        reference: 'APT-1111',
        status: 'confirmed',
        customer: 'line:Uaaa…aa',
        boutique: { slug: 'ginza', name: 'Ginza Flagship' },
        requestedFor: '2020-01-05T15:00:00+09:00',
        note: '',
        confirmationSent: false,
        createdAt: '2029-12-30T12:30:00+09:00',
      },
    ]);
  });

  it('keeps the rows in the order the board lists them, newest request first', async () => {
    appointmentFindMany.mockClear();
    const { recent } = await summarize();
    // The newest five of all the drafts, as the board's "All requests" view asks for them.
    expect(appointmentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'draft', filters: {}, sort: 'createdAt:desc', limit: 5 })
    );
    expect(recent.map((row) => row.reference)).toEqual(['APT-3333', 'APT-1111']);
    const times = recent.map((row) => Date.parse(row.createdAt));
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it('leaves the products and the way the request was made out of the rows', async () => {
    const { recent } = await summarize();
    for (const row of recent) {
      expect(Object.keys(row).sort()).toEqual(['boutique', 'confirmationSent', 'createdAt', 'customer', 'note', 'reference', 'requestedFor', 'status']);
    }
  });

  it('keeps the counts as they were', async () => {
    expect((await summarize()).counts).toEqual({ waitingForStaff: 1, confirmedUpcoming: 0, confirmationsSent: 0 });
  });
});
