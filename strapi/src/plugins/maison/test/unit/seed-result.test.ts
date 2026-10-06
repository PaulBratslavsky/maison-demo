import { describe, expect, it } from 'vitest';
import { describeActivity, describeReset, describeSeed } from '../../admin/src/seed-result';

const nothing = { created: false, collections: 0, products: 0, boutiques: 0, stockLevels: 0, knowledge: 0 };

describe('describeSeed', () => {
  it('names everything a first load created', () => {
    expect(describeSeed({ created: true, collections: 3, products: 12, boutiques: 3, stockLevels: 36, knowledge: 16 })).toBe(
      'Loaded 12 products, 3 collections, 3 boutiques, 36 stock levels and 16 product knowledge entries.'
    );
  });

  it('keeps the "and" before the last count when the product knowledge was there already', () => {
    expect(describeSeed({ created: true, collections: 3, products: 12, boutiques: 3, stockLevels: 36, knowledge: 0 })).toBe(
      'Loaded 12 products, 3 collections, 3 boutiques and 36 stock levels.'
    );
  });

  it('says when only the product knowledge was added', () => {
    expect(describeSeed({ ...nothing, knowledge: 16 })).toBe('The demo catalog is already loaded. Added 16 product knowledge entries.');
  });

  it('says when nothing changed', () => {
    expect(describeSeed(nothing)).toBe('The demo catalog and its product knowledge are already loaded.');
  });
});

describe('describeReset', () => {
  const none = { appointments: 0, notifications: 0, questions: 0, inquiries: 0, knowledge: 0 };

  it('names everything the reset deleted, with the "and" before the last count', () => {
    expect(describeReset({ appointments: 3, notifications: 2, questions: 1, inquiries: 2, knowledge: 1 })).toBe(
      'Deleted 3 appointments, 2 notifications, 1 question, 2 inquiries and 1 product knowledge entry.'
    );
  });

  it.each([
    ['appointment', { ...none, appointments: 1 }, 'Deleted 1 appointment, 0 notifications, 0 questions, 0 inquiries and 0 product knowledge entries.'],
    ['notification', { ...none, notifications: 1 }, 'Deleted 0 appointments, 1 notification, 0 questions, 0 inquiries and 0 product knowledge entries.'],
    ['question', { ...none, questions: 1 }, 'Deleted 0 appointments, 0 notifications, 1 question, 0 inquiries and 0 product knowledge entries.'],
    ['inquiry', { ...none, inquiries: 1 }, 'Deleted 0 appointments, 0 notifications, 0 questions, 1 inquiry and 0 product knowledge entries.'],
    ['product knowledge entry', { ...none, knowledge: 1 }, 'Deleted 0 appointments, 0 notifications, 0 questions, 0 inquiries and 1 product knowledge entry.'],
  ])('says "1 %s" for one, and the plural for every other count', (_label, result, notice) => {
    expect(describeReset(result)).toBe(notice);
  });

  it('puts every count in the plural for 0 and for 2', () => {
    expect(describeReset(none)).toBe('Deleted 0 appointments, 0 notifications, 0 questions, 0 inquiries and 0 product knowledge entries.');
    expect(describeReset({ appointments: 2, notifications: 2, questions: 2, inquiries: 2, knowledge: 2 })).toBe(
      'Deleted 2 appointments, 2 notifications, 2 questions, 2 inquiries and 2 product knowledge entries.'
    );
  });

  it('names inquiries, which the reset deletes with the questions', () => {
    expect(describeReset({ ...none, inquiries: 14 })).toContain('14 inquiries');
  });
});

describe('describeActivity', () => {
  it('names what Load demo activity added, and who it came from', () => {
    expect(describeActivity({ created: true, customers: 5, appointments: 5, confirmed: 2, questions: 5, inquiries: 10 })).toBe(
      'Loaded 5 requests (2 confirmed), 5 questions and 10 inquiries from 5 made-up customers.'
    );
  });

  it('says when the demo activity was there already, and how to load it again', () => {
    expect(describeActivity({ created: false, customers: 0, appointments: 0, confirmed: 0, questions: 0, inquiries: 0 })).toBe(
      'The demo activity is already loaded. Reset demo activity first to load it again.'
    );
  });
});
