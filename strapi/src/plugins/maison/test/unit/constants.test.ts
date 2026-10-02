import { describe, expect, it } from 'vitest';
import { ACTION, PLUGIN_ID, TOOL_NAMES, UID } from '../../server/src/constants';

describe('constants', () => {
  it('uses the maison plugin id everywhere', () => {
    expect(PLUGIN_ID).toBe('maison');
    for (const uid of Object.values(UID)) expect(uid.startsWith('plugin::maison.')).toBe(true);
    for (const action of Object.values(ACTION)) expect(action.startsWith('plugin::maison.')).toBe(true);
  });

  it('declares the eleven tools exactly once each', () => {
    expect(TOOL_NAMES).toHaveLength(11);
    expect(new Set(TOOL_NAMES).size).toBe(11);
  });

  it('declares the staff actions', () => {
    expect(ACTION.appointmentsReview).toBe('plugin::maison.appointments.review');
    expect(ACTION.appointmentsConfirm).toBe('plugin::maison.appointments.confirm');
  });
});
