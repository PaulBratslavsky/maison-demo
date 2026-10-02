import { describe, expect, it } from 'vitest';
import { INQUIRY_KINDS } from '../../server/src/constants';
import { queueFor } from '../../server/src/domain/inquiry-queue';

// Every kind and no kind, and every answer and none: the rule must not depend on what the labeller left out.
const KINDS = [...INQUIRY_KINDS, null] as const;
const ANSWERS = [true, false, null] as const;

describe('queueFor', () => {
  it('sends a hand-off to needs-answer, whatever the labels say or leave out', () => {
    for (const kind of KINDS) {
      for (const answered of ANSWERS) expect(queueFor({ handedOff: true, kind, answered }), `${kind} ${answered}`).toBe('needs-answer');
    }
  });

  it('sends a question that was not answered to needs-answer', () => {
    expect(queueFor({ handedOff: false, kind: 'question', answered: false })).toBe('needs-answer');
  });

  it('keeps an answered question out of the queues', () => {
    expect(queueFor({ handedOff: false, kind: 'question', answered: true })).toBe('none');
  });

  // Only an explicit "not answered" puts a question in Needs an answer: a staff relabel of an unlabelled row has no `answered`.
  it('keeps a question out of the queues while nobody has said whether it was answered', () => {
    expect(queueFor({ handedOff: false, kind: 'question', answered: null })).toBe('none');
  });

  it('sends a complaint to the complaint queue, answered or not', () => {
    for (const answered of ANSWERS) expect(queueFor({ handedOff: false, kind: 'complaint', answered }), `${answered}`).toBe('complaint');
  });

  it('sends praise to the praise queue, answered or not', () => {
    for (const answered of ANSWERS) expect(queueFor({ handedOff: false, kind: 'praise', answered }), `${answered}`).toBe('praise');
  });

  it('keeps anything else out of the queues, answered or not', () => {
    for (const answered of ANSWERS) expect(queueFor({ handedOff: false, kind: 'other', answered }), `${answered}`).toBe('none');
  });

  it('keeps a turn that has no labels yet out of the queues', () => {
    expect(queueFor({ handedOff: false, kind: null, answered: null })).toBe('none');
  });
});
