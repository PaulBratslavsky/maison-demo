import { describe, expect, it } from 'vitest';

import { handOffAt, toolPartOf, toolView } from './tool-view';

describe('toolView', () => {
  it('shows a hand-off as a local line, with the hand-off note under it', () => {
    const view = toolView({ toolName: 'hand_off_to_staff', state: 'output-available', output: { handedOff: true } }, 'en');
    expect(view.line).toBe('Local · hand_off_to_staff ✓');
    expect(view.handOff).toBe(true);
    expect(view.failed).toBe(false);
  });

  it('shows no note while the hand-off runs, or when it failed', () => {
    expect(toolView({ toolName: 'hand_off_to_staff', state: 'input-available' }, 'en').handOff).toBe(false);
    expect(toolView({ toolName: 'hand_off_to_staff', state: 'output-error', errorText: 'x' }, 'en').handOff).toBe(false);
  });

  it('counts what search_knowledge found, on an MCP line, with no note', () => {
    const output = { content: [{ type: 'text', text: '{}' }], structuredContent: { locale: 'en', entries: [{ title: 'A' }, { title: 'B' }] } };
    const view = toolView({ toolName: 'search_knowledge', state: 'output-available', output }, 'en');
    expect(view.line).toBe('MCP · search_knowledge ✓ 2 results');
    expect(view.handOff).toBe(false);
  });

  it('still names the day resolve_date worked out', () => {
    const output = { date: '2026-10-10', weekday: 'Saturday', isPast: false };
    expect(toolView({ toolName: 'resolve_date', state: 'output-available', output }, 'en').line).toBe('Local · resolve_date ✓ Saturday 2026-10-10');
  });

  it('hands the page the appointment a booking made, and nothing else', () => {
    const appointment = { reference: 'MA-7Q2K', status: 'requested', boutique: { slug: 'ginza', name: 'Ginza' }, requestedFor: '2026-10-03T14:00:00+09:00', products: [], note: '', confirmationSent: false };
    const output = { content: [{ type: 'text', text: '{}' }], structuredContent: { appointment } };
    const view = toolView({ toolName: 'request_appointment', state: 'output-available', output }, 'en');
    expect(view.appointment).toEqual(appointment);
    expect(view.line).toBe('MCP · request_appointment ✓');
    expect(view.products).toBeNull();
    expect(view.handOff).toBe(false);
  });

  it('hands the page the products a search found, and counts them in the reply language', () => {
    const products = [{ slug: 'weekender-50', name: 'Weekender 50' }, { slug: 'voyage-trunk', name: 'Voyage Trunk' }];
    const found = (list: unknown[]) => ({ content: [{ type: 'text', text: '{}' }], structuredContent: { products: list } });
    const view = toolView({ toolName: 'search_products', state: 'output-available', output: found(products) }, 'en');
    expect(view.products).toEqual(products);
    expect(view.line).toBe('MCP · search_products ✓ 2 results');
    expect(view.appointment).toBeNull();
    expect(toolView({ toolName: 'search_products', state: 'output-available', output: found(products.slice(0, 1)) }, 'en').line).toBe('MCP · search_products ✓ 1 result');
    expect(toolView({ toolName: 'search_products', state: 'output-available', output: found(products) }, 'ja').line).toBe('MCP · search_products ✓ 2件');
  });

  it('shows a failed call as ✕ and its code, and hands the page nothing', () => {
    const refusal = { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: { code: 'boutique_closed', message: 'The boutique is closed.', hint: 'Pick an hour it is open.' } }) }] };
    const closed = toolView({ toolName: 'request_appointment', state: 'output-available', output: refusal }, 'en');
    expect(closed.line).toBe('MCP · request_appointment ✕ boutique_closed');
    expect(closed.failed).toBe(true);
    expect(closed.appointment).toBeNull();
    // A call that broke on the way has no code of its own, and a local tool's line says so the same way.
    const broken = toolView({ toolName: 'search_products', state: 'output-error', errorText: 'fetch failed' }, 'en');
    expect(broken.line).toBe('MCP · search_products ✕ error');
    expect(broken.failed).toBe(true);
    expect(broken.products).toBeNull();
    expect(toolView({ toolName: 'resolve_date', state: 'output-error', errorText: 'x' }, 'en').line).toBe('Local · resolve_date ✕ error');
  });

  it('shows a call that has not finished as …, on its own kind of line', () => {
    for (const state of ['input-streaming', 'input-available']) {
      const view = toolView({ toolName: 'search_products', state }, 'en');
      expect(view.line, state).toBe('MCP · search_products …');
      expect(view.failed, state).toBe(false);
      expect(view.products, state).toBeNull();
    }
    expect(toolView({ toolName: 'resolve_date', state: 'input-available' }, 'en').line).toBe('Local · resolve_date …');
  });
});

describe('toolPartOf', () => {
  it("reads a local tool's name from its part type, and skips text", () => {
    expect(toolPartOf({ type: 'tool-hand_off_to_staff' })?.toolName).toBe('hand_off_to_staff');
    expect(toolPartOf({ type: 'text' })).toBeNull();
  });
});

// Where the hand-off note goes in a message: the index of the part it goes under, or null. The model may skip the
// hand_off_to_staff call (the local model does), so a search that found nothing shows the note too.
describe('handOffAt', () => {
  type Part = { type: string; [key: string]: unknown };
  /** A hand_off_to_staff call as the page holds it: the concierge's own tool, so a `tool-<name>` part. */
  const handOff = (state: string, output?: unknown): Part => ({ type: 'tool-hand_off_to_staff', state, ...(output === undefined ? {} : { output }) });
  const handedOff = handOff('output-available', { handedOff: true });
  /** A search_knowledge call, an MCP tool: a dynamic-tool part, whose output is the MCP result. */
  const search = (state: string, output?: unknown): Part => ({ type: 'dynamic-tool', toolName: 'search_knowledge', state, ...(output === undefined ? {} : { output }) });
  const found = (...titles: string[]) => search('output-available', { content: [{ type: 'text', text: '{}' }], structuredContent: { locale: 'en', entries: titles.map((title) => ({ title })) } });
  const foundNothing = found();
  const foundAnAnswer = found('How do I care for the leather?');
  /** A result Maison refused (isError), as the MCP client passes it on. */
  const refusal = { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: { code: 'invalid_input', message: 'Check the query.', hint: 'Use 1 to 300 characters.' } }) }] };
  const words: Part = { type: 'text', text: "Maison's team answers questions like this in the LINE chat." };
  const step: Part = { type: 'step-start' };

  it('puts the note under a hand-off that went through, and under the first of several', () => {
    expect(handOffAt([foundNothing, handedOff])).toBe(1);
    expect(handOffAt([step, handedOff, words])).toBe(1);
    expect(handOffAt([handedOff, foundNothing, handedOff])).toBe(0);
    expect(handOffAt([handOff('output-error'), handedOff])).toBe(1); // a first one that failed doesn't count
  });

  it('puts it under a hand-off whatever the searches found: the model made the call', () => {
    expect(handOffAt([foundAnAnswer, handedOff])).toBe(1);
    expect(handOffAt([search('input-available'), handedOff])).toBe(1);
    expect(handOffAt([search('output-error'), handedOff])).toBe(1);
  });

  it('puts none under a hand-off that is running, failed or was refused, when no search found nothing', () => {
    expect(handOffAt([handOff('input-streaming')])).toBeNull();
    expect(handOffAt([handOff('input-available')])).toBeNull();
    expect(handOffAt([handOff('output-error')])).toBeNull();
    expect(handOffAt([handOff('output-available', refusal)])).toBeNull();
    expect(handOffAt([foundAnAnswer, handOff('output-error')])).toBeNull();
  });

  it('falls back to the last search that found nothing, when the model made no hand-off', () => {
    expect(handOffAt([foundNothing])).toBe(0);
    expect(handOffAt([step, foundNothing, step, words])).toBe(1); // under the search, above the model's words
    expect(handOffAt([foundNothing, step, foundNothing])).toBe(2); // two searches, both empty: under the last
    expect(handOffAt([foundNothing, handOff('output-error')])).toBe(0); // a hand-off that failed doesn't take the note away
    expect(handOffAt([foundNothing, handOff('input-available')])).toBe(0);
  });

  it('shows no fallback note when any search found entries', () => {
    expect(handOffAt([foundAnAnswer])).toBeNull();
    expect(handOffAt([foundNothing, foundAnAnswer])).toBeNull();
    expect(handOffAt([foundAnAnswer, foundNothing])).toBeNull();
    expect(handOffAt([foundAnAnswer, words])).toBeNull();
  });

  it('shows no fallback note while a search is running, or after one failed or was refused', () => {
    expect(handOffAt([search('input-streaming')])).toBeNull();
    expect(handOffAt([search('input-available')])).toBeNull();
    // Held back while a second search is under way, so the note doesn't show and then vanish when that one finds an answer.
    expect(handOffAt([foundNothing, search('input-available')])).toBeNull();
    expect(handOffAt([search('output-error')])).toBeNull();
    expect(handOffAt([foundNothing, search('output-error')])).toBeNull();
    expect(handOffAt([search('output-available', refusal)])).toBeNull();
    expect(handOffAt([foundNothing, search('output-available', refusal)])).toBeNull();
  });

  it("shows no fallback note when it can't tell that the search found nothing, or nothing was searched", () => {
    expect(handOffAt([search('output-available', { content: [] })])).toBeNull(); // no structuredContent
    expect(handOffAt([search('output-available', { content: [], structuredContent: { locale: 'en' } })])).toBeNull(); // no entries list
    expect(handOffAt([search('output-available', null)])).toBeNull();
    expect(handOffAt([])).toBeNull();
    expect(handOffAt([words, step])).toBeNull();
    // Another tool's empty list isn't knowledge.
    const products: Part = { type: 'dynamic-tool', toolName: 'search_products', state: 'output-available', output: { content: [], structuredContent: { products: [] } } };
    expect(handOffAt([products])).toBeNull();
    expect(handOffAt([{ type: 'dynamic-tool' }])).toBeNull(); // a dynamic part with no name
  });

  it('reads a search from a static part too, and counts every part toward the index', () => {
    const typed: Part = { type: 'tool-search_knowledge', state: 'output-available', output: { content: [], structuredContent: { entries: [] } } };
    expect(handOffAt([step, words, typed])).toBe(2);
    expect(handOffAt([step, words, { ...typed, output: { content: [], structuredContent: { entries: [{ title: 'A' }] } } }])).toBeNull();
  });
});
