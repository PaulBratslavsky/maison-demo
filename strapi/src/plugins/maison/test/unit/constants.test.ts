import { describe, expect, it } from 'vitest';
import { ACTION, MAX_OPEN_QUESTIONS, PLUGIN_ID, QUESTION_REASONS, QUESTION_STATUSES, TOOL_NAMES, UID } from '../../server/src/constants';

describe('constants', () => {
  it('uses the maison plugin id everywhere', () => {
    expect(PLUGIN_ID).toBe('maison');
    for (const uid of Object.values(UID)) expect(uid.startsWith('plugin::maison.')).toBe(true);
    for (const action of Object.values(ACTION)) expect(action.startsWith('plugin::maison.')).toBe(true);
  });

  it('declares the twelve tools exactly once each', () => {
    expect(TOOL_NAMES).toHaveLength(12);
    expect(new Set(TOOL_NAMES).size).toBe(12);
  });

  it('lists hand_off_to_staff right after my_appointments, in the order the tools are registered', () => {
    expect(TOOL_NAMES).toEqual([
      'browse_collections', 'search_products', 'view_product', 'find_boutiques', 'search_knowledge',
      'request_appointment', 'my_appointments', 'hand_off_to_staff',
      'appointment_requests', 'confirm_appointment', 'pending_confirmations', 'record_confirmation',
    ]);
  });

  it('declares the staff actions', () => {
    expect(ACTION.appointmentsReview).toBe('plugin::maison.appointments.review');
    expect(ACTION.appointmentsConfirm).toBe('plugin::maison.appointments.confirm');
  });

  it('declares the question: its UID, its three actions, its reasons and statuses, and how many a customer can have open', () => {
    expect(UID.question).toBe('plugin::maison.question');
    expect(ACTION.questionsAsk).toBe('plugin::maison.questions.ask');
    expect(ACTION.questionsRead).toBe('plugin::maison.questions.read');
    expect(ACTION.questionsAnswer).toBe('plugin::maison.questions.answer');
    expect(QUESTION_REASONS).toEqual(['no_answer', 'asked_for_person']);
    expect(QUESTION_STATUSES).toEqual(['open', 'taken', 'answered']);
    expect(MAX_OPEN_QUESTIONS).toBe(5);
  });
});
