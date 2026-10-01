import { describe, expect, it, vi } from 'vitest';
import { PERMISSIONS } from '../../admin/src/permissions';
import bootstrap from '../../server/src/bootstrap';
import { ACTION } from '../../server/src/constants';
import { fakeStrapi } from './fake-strapi';

/** The full action names bootstrap registers with Strapi's admin permissions, as plugin::maison.<uid>. */
const registeredActions = async (): Promise<string[]> => {
  const registerMany = vi.fn();
  const strapi = { ...fakeStrapi(), service: () => ({ actionProvider: { registerMany } }), server: { use: vi.fn() } };
  await bootstrap({ strapi } as any);
  return registerMany.mock.calls.flatMap(([actions]) => actions.map(({ pluginName, uid }) => `plugin::${pluginName}.${uid}`));
};

describe("the admin panel's permissions", () => {
  it("gate the Homepage widget on the server's review action, the one its summary route checks", () => {
    expect(PERMISSIONS.widget).toHaveLength(1);
    expect(PERMISSIONS.widget[0].action).toBe(ACTION.appointmentsReview);
  });

  it('name only actions the server registers', async () => {
    const registered = await registeredActions();
    expect(registered).toContain(ACTION.appointmentsReview);
    for (const { action } of Object.values(PERMISSIONS).flat()) expect(registered, action).toContain(action);
  });
});
