import { describe, expect, it } from 'vitest';
import { needsRetry } from './chat-retry';

const text = (value: string) => ({ type: 'text', text: value });
const resolveDate = { type: 'tool-resolve_date' }; // the concierge's own tool
const searchProducts = { type: 'dynamic-tool' }; // a Maison tool
const user = (value: string) => ({ role: 'user', parts: [text(value)] });
const assistant = (...parts: Array<{ type: string; text?: string }>) => ({ role: 'assistant', parts });

describe('needsRetry', () => {
  it('is false for a reply that ends in something to read', () => {
    expect(needsRetry([user('Hello'), assistant(text('Good afternoon.'))], false)).toBe(false);
    expect(needsRetry([user('Hello'), assistant(resolveDate, searchProducts, text('Here are three options.'))], false)).toBe(false);
  });

  it('is true for a reply with no text at all', () => {
    expect(needsRetry([user('Hello'), assistant()], false)).toBe(true);
    expect(needsRetry([user('Hello'), assistant({ type: 'step-start' })], false)).toBe(true);
    expect(needsRetry([user('Hello'), assistant(resolveDate, searchProducts)], false)).toBe(true); // tool calls, then nothing
    expect(needsRetry([user('Hello'), assistant(text(''))], false)).toBe(true);
    expect(needsRetry([user('Hello'), assistant(text('  \n '))], false)).toBe(true);
  });

  it('is true for a reply that ends in tool calls, whatever came before them', () => {
    expect(needsRetry([user('Hello'), assistant(text('Let me look.'), searchProducts)], false)).toBe(true);
    expect(needsRetry([user('Hello'), assistant(text('Let me look.'), resolveDate, { type: 'step-start' })], false)).toBe(true);
  });

  it("doesn't count what the screen doesn't show: a blank text part after the answer, or its reasoning", () => {
    expect(needsRetry([user('Hello'), assistant(text('Good afternoon.'), text(''))], false)).toBe(false);
    expect(needsRetry([user('Hello'), assistant(text('Good afternoon.'), { type: 'reasoning', text: 'The customer greets me.' })], false)).toBe(false);
    expect(needsRetry([user('Hello'), assistant({ type: 'reasoning', text: 'Hmm.' })], false)).toBe(true);
  });

  it('is false while a reply is still coming in', () => {
    expect(needsRetry([user('Hello'), assistant(resolveDate)], true)).toBe(false);
    expect(needsRetry([user('Hello'), assistant()], true)).toBe(false);
  });

  it("is false when the customer spoke last, or there is nothing yet, and looks at the last message only", () => {
    expect(needsRetry([], false)).toBe(false);
    expect(needsRetry([user('Hello')], false)).toBe(false);
    expect(needsRetry([user('Hello'), assistant(resolveDate), user('Yes, please.')], false)).toBe(false);
    expect(needsRetry([user('Hello'), assistant(resolveDate), user('Yes, please.'), assistant(text('Done.'))], false)).toBe(false);
  });
});
