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

describe('the actions bootstrap registers', () => {
  it('include the three question actions: handing a question to staff, reading questions and answering them', async () => {
    const registered = await registeredActions();
    for (const action of [ACTION.questionsAsk, ACTION.questionsRead, ACTION.questionsAnswer]) expect(registered, action).toContain(action);
  });
});

describe("the admin panel's permissions for customer questions", () => {
  const actionsOf = (permissions: ReadonlyArray<{ action: string }>) => permissions.map(({ action }) => action);

  /** The flag useRBAC answers for a permission: `can` and the action's last word, each part of a hyphenated word capitalised (useRBAC.mjs). */
  const capitalise = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);
  const flagOf = ({ action }: { action: string }) => `can${capitalise(action.split('.').slice(-1)[0].split('-').map(capitalise).join(''))}`;

  it('open the page to staff who can read questions, as well as to those who review requests or manage the demo data', () => {
    expect(actionsOf(PERMISSIONS.page)).toEqual(expect.arrayContaining([ACTION.appointmentsReview, ACTION.demoManage, ACTION.questionsRead]));
  });

  it('check reading and answering questions with useRBAC, for the page to read', () => {
    expect(actionsOf(PERMISSIONS.sections)).toEqual(expect.arrayContaining([ACTION.questionsRead, ACTION.questionsAnswer]));
  });

  it('make the flags the Maison page reads: canReview, canConfirm, canManage, canRead and canAnswer', () => {
    expect(PERMISSIONS.sections.map(flagOf)).toEqual(
      expect.arrayContaining(['canReview', 'canConfirm', 'canManage', 'canRead', 'canAnswer'])
    );
  });

  it('make a different flag for each action: actions that end in the same word would share one flag', () => {
    for (const [name, permissions] of Object.entries(PERMISSIONS)) {
      const flags = permissions.map(flagOf);
      expect(new Set(flags).size, `${name}: ${flags.join(', ')}`).toBe(flags.length);
    }
  });
});
