import { describe, expect, it, vi } from 'vitest';
import { UID } from '../../server/src/constants';
import { uniqueReference } from '../../server/src/services/appointments';
import { fakeStrapi } from './fake-strapi';

type Filters = Record<string, { $eq?: string } | undefined>;

/** The references in use: by appointments, and by notifications, which outlive an appointment deleted on its own. */
const strapiWith = ({ appointments = [] as string[], notifications = [] as string[] }) =>
  fakeStrapi({
    documents: (uid: string) => ({
      count: vi.fn(async ({ filters }: { filters: Filters }) => {
        if (uid === UID.appointment) return appointments.filter((reference) => reference === filters.reference?.$eq).length;
        if (uid === UID.notification) return notifications.filter((reference) => reference === filters.appointmentReference?.$eq).length;
        return 0;
      }),
    }),
  });

/** Stands in for Math.random: 0 makes APT-1000, 0.5 makes APT-5500. */
const randoms = (...values: number[]) => {
  let index = 0;
  return () => values[index++];
};

describe('uniqueReference', () => {
  it('takes the first reference nothing uses', async () => {
    expect(await uniqueReference(strapiWith({}), randoms(0))).toBe('APT-1000');
  });

  it('skips a reference an appointment has', async () => {
    expect(await uniqueReference(strapiWith({ appointments: ['APT-1000'] }), randoms(0, 0.5))).toBe('APT-5500');
  });

  it('skips a reference a notification still names, or the new visit would count as already confirmed over LINE', async () => {
    expect(await uniqueReference(strapiWith({ notifications: ['APT-1000'] }), randoms(0, 0.5))).toBe('APT-5500');
  });
});
