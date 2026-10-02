import { describe, expect, it, vi } from 'vitest';
import bootstrap from '../../server/src/bootstrap';
import { fakeStrapi } from './fake-strapi';

/** Strapi after `bootstrap` ran, with `labelling` as the plugin's service of that name. */
const bootstrapped = async (labelling: { sweep: () => Promise<unknown> }) => {
  const strapi = {
    ...fakeStrapi({ services: { labelling }, config: { liffUrl: 'https://liff.line.me/1234567890-AbCdEfGh' } }),
    service: () => ({ actionProvider: { registerMany: vi.fn() } }),
    server: { use: vi.fn() },
  };
  await bootstrap({ strapi } as any);
  return strapi;
};

const JOB = 'maison-label-inquiries';

/** The one job bootstrap added to Strapi's cron. */
const jobOf = (strapi: Awaited<ReturnType<typeof bootstrapped>>) => {
  expect(strapi.cron.add).toHaveBeenCalledOnce();
  return strapi.cron.add.mock.calls[0][0][JOB];
};

describe('the labelling cron job', () => {
  it(`is the one job bootstrap registers, named ${JOB}, and runs every minute, as Pulse's analysisSweep does`, async () => {
    const strapi = await bootstrapped({ sweep: vi.fn() });

    expect(Object.keys(strapi.cron.add.mock.calls[0][0])).toEqual([JOB]);
    expect(jobOf(strapi).options).toEqual({ rule: '* * * * *' });
    expect(jobOf(strapi).task).toBeTypeOf('function');
  });

  it('runs the labelling sweep each time it fires, and says nothing when it goes well', async () => {
    const sweep = vi.fn(async () => ({ labelled: 1, failed: 0, skipped: 0 }));
    const strapi = await bootstrapped({ sweep });

    await jobOf(strapi).task({ strapi });
    await jobOf(strapi).task({ strapi });

    expect(sweep).toHaveBeenCalledTimes(2);
    expect(strapi.log.error).not.toHaveBeenCalled();
  });

  it('catches a crash and logs it with strapi.log.error, so the job never throws', async () => {
    const strapi = await bootstrapped({ sweep: vi.fn(async () => Promise.reject(new Error('The database is down.'))) });

    await expect(jobOf(strapi).task({ strapi })).resolves.toBeUndefined();

    expect(strapi.log.error).toHaveBeenCalledExactlyOnceWith('[maison] The labelling sweep crashed: The database is down.');
  });
});
