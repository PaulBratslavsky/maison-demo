import { describe, expect, it } from 'vitest';

import { handOffAt, toolPartOf, toolView } from './tool-view';

/**
 * What Strapi answers to a hand_off_to_staff it recorded, as @ai-sdk/mcp passes it on: the question's reference, its
 * status, and its piece (null when it isn't about one).
 */
const recorded = (reference = 'Q-4821') => ({
  content: [{ type: 'text', text: JSON.stringify({ question: { reference, status: 'open', product: null } }) }],
  structuredContent: { question: { reference, status: 'open', product: null } },
});
/** What the model sent: a Maison tool's part holds it as `input`. */
const asked = { question: 'Can it hold a watch?', reason: 'no_answer', productSlug: 'jewelry-coffret', locale: 'en' };

describe('toolView', () => {
  it('counts what search_knowledge found, on an MCP line, with no hand-off', () => {
    const output = { content: [{ type: 'text', text: '{}' }], structuredContent: { locale: 'en', entries: [{ title: 'A' }, { title: 'B' }] } };
    const view = toolView({ toolName: 'search_knowledge', state: 'output-available', output }, 'en');
    expect(view.line).toBe('MCP · search_knowledge ✓ 2 results');
    expect(view.handOff).toBeNull();
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
    expect(view.handOff).toBeNull();
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

// hand_off_to_staff is a Maison tool: Strapi records the question and answers its reference.
describe('toolView: hand_off_to_staff', () => {
  const call = { toolName: 'hand_off_to_staff', input: asked };

  it('shows it as a Maison tool, and hands the page the reference Strapi gave and the question the model sent', () => {
    const view = toolView({ ...call, state: 'output-available', output: recorded('Q-4821') }, 'en');
    expect(view.line).toBe('MCP · hand_off_to_staff ✓');
    expect(view.failed).toBe(false);
    expect(view.handOff).toEqual({ reference: 'Q-4821', question: 'Can it hold a watch?' });
    expect(view.products).toBeNull();
    expect(view.appointment).toBeNull();
    // The same in Japanese: the line has no words in it.
    expect(toolView({ ...call, state: 'output-available', output: recorded('Q-4821') }, 'ja').line).toBe('MCP · hand_off_to_staff ✓');
  });

  it("reads the reference from the result's structuredContent, and the question from the call's input, nowhere else", () => {
    const view = toolView({ toolName: 'hand_off_to_staff', state: 'output-available', input: { question: 'Is it waterproof?' }, output: recorded('Q-0007') }, 'en');
    expect(view.handOff).toEqual({ reference: 'Q-0007', question: 'Is it waterproof?' });
    // A reference that is only in the result's text is not read.
    const textOnly = { content: [{ type: 'text', text: JSON.stringify({ question: { reference: 'Q-4821' } }) }] };
    expect(toolView({ ...call, state: 'output-available', output: textOnly }, 'en').handOff).toBeNull();
  });

  it('is still a recorded hand-off when the call has no readable question: the reference is what says Strapi has it', () => {
    for (const input of [undefined, null, {}, { question: 42 }]) {
      expect(toolView({ toolName: 'hand_off_to_staff', state: 'output-available', input, output: recorded('Q-4821') }, 'en').handOff, JSON.stringify(input)).toEqual({ reference: 'Q-4821', question: '' });
    }
  });

  it('hands the page nothing while it runs, and shows a line with …', () => {
    for (const state of ['input-streaming', 'input-available']) {
      const view = toolView({ ...call, state }, 'en');
      expect(view.line, state).toBe('MCP · hand_off_to_staff …');
      expect(view.handOff, state).toBeNull();
      expect(view.failed, state).toBe(false);
    }
  });

  it("shows a call that broke on the way as a red ✕ error, and hands the page nothing: the question isn't recorded", () => {
    const view = toolView({ ...call, state: 'output-error', errorText: 'fetch failed' }, 'en');
    expect(view.line).toBe('MCP · hand_off_to_staff ✕ error');
    expect(view.failed).toBe(true);
    expect(view.handOff).toBeNull();
  });

  it("shows one Maison refused as a red ✕ with the error's code, and hands the page nothing", () => {
    const refusal = {
      isError: true,
      content: [{ type: 'text', text: JSON.stringify({ error: { code: 'too_many_open_questions', message: 'You have 5 questions with the advisors.', hint: 'Tell the customer their earlier questions are with the advisors.' } }) }],
    };
    const view = toolView({ ...call, state: 'output-available', output: refusal }, 'en');
    expect(view.line).toBe('MCP · hand_off_to_staff ✕ too_many_open_questions');
    expect(view.failed).toBe(true);
    expect(view.handOff).toBeNull();
    // Input Strapi's schema refused comes back as plain text.
    const invalid = { isError: true, content: [{ type: 'text', text: 'Input validation error: question: Too small' }] };
    const refused = toolView({ ...call, state: 'output-available', output: invalid }, 'en');
    expect(refused.line).toBe('MCP · hand_off_to_staff ✕ invalid_input');
    expect(refused.failed).toBe(true);
    expect(refused.handOff).toBeNull();
  });

  it('hands the page nothing when the result has no reference to show: nothing says the question is recorded', () => {
    const results = [
      null,
      {},
      { content: [] },
      { content: [], structuredContent: {} },
      { content: [], structuredContent: { question: null } },
      { content: [], structuredContent: { question: {} } },
      { content: [], structuredContent: { question: { reference: '' } } },
      { content: [], structuredContent: { question: { reference: 4821 } } },
      { content: [], structuredContent: { question: 'Q-4821' } },
    ];
    for (const output of results) {
      const view = toolView({ ...call, state: 'output-available', output }, 'en');
      expect(view.handOff, JSON.stringify(output)).toBeNull();
      expect(view.line, JSON.stringify(output)).toBe('MCP · hand_off_to_staff ✓'); // it didn't fail: it just can't be shown as recorded
    }
  });

  it('is the only call that gives the page a hand-off, and resolve_date is the only local tool', () => {
    // Nothing but hand_off_to_staff, even with a result shaped like its own.
    expect(toolView({ toolName: 'search_knowledge', state: 'output-available', input: asked, output: recorded() }, 'en').handOff).toBeNull();
    expect(toolView({ toolName: 'request_appointment', state: 'output-available', input: asked, output: recorded() }, 'en').handOff).toBeNull();
    expect(toolView({ toolName: 'resolve_date', state: 'output-available', input: asked, output: recorded() }, 'en').line).toMatch(/^Local · resolve_date ✓/);
    expect(toolView({ toolName: 'hand_off_to_staff', state: 'output-available', output: recorded() }, 'en').line).toMatch(/^MCP · /);
  });
});

describe('toolPartOf', () => {
  it("reads a local tool's name from its part type, and skips text", () => {
    expect(toolPartOf({ type: 'tool-resolve_date' })?.toolName).toBe('resolve_date');
    expect(toolPartOf({ type: 'text' })).toBeNull();
  });

  it("reads a Maison tool's name from a dynamic part or, for a typed one, from its type, and keeps what the call was sent", () => {
    expect(toolPartOf({ type: 'dynamic-tool', toolName: 'hand_off_to_staff', input: asked } as { type: string })?.toolName).toBe('hand_off_to_staff');
    expect(toolPartOf({ type: 'dynamic-tool', toolName: 'hand_off_to_staff', input: asked } as { type: string })?.input).toEqual(asked);
    const typed = toolPartOf({ type: 'tool-hand_off_to_staff', input: asked } as { type: string });
    expect(typed?.toolName).toBe('hand_off_to_staff');
    expect(typed?.input).toEqual(asked);
  });
});

// Where the hand-off note goes in a message, and which note: the index of the part it goes under, with what Strapi
// recorded, or null for no note. The model may skip the hand_off_to_staff call (the local model does), so a search that
// found nothing shows a note too: the plain one, since nothing was recorded.
describe('handOffAt', () => {
  type Part = { type: string; [key: string]: unknown };
  /** A hand_off_to_staff call as the page holds it: a Maison tool, so a dynamic-tool part, whose output is the MCP result. */
  const handOff = (state: string, output?: unknown, question = 'Can it hold a watch?'): Part => ({
    type: 'dynamic-tool',
    toolName: 'hand_off_to_staff',
    state,
    input: { question, reason: 'no_answer' },
    ...(output === undefined ? {} : { output }),
  });
  const handedOff = handOff('output-available', recorded('Q-4821'));
  /** The note under a hand-off Strapi recorded, as handOffAt answers it. */
  const recordedAt = (index: number, reference = 'Q-4821', question = 'Can it hold a watch?') => ({ index, recorded: { reference, question } });
  /** The plain note under a search that found nothing: the call wasn't made, or didn't go through, so nothing is recorded. */
  const fallbackAt = (index: number) => ({ index, recorded: null });
  /** A search_knowledge call, an MCP tool: a dynamic-tool part, whose output is the MCP result. */
  const search = (state: string, output?: unknown): Part => ({ type: 'dynamic-tool', toolName: 'search_knowledge', state, ...(output === undefined ? {} : { output }) });
  const found = (...titles: string[]) => search('output-available', { content: [{ type: 'text', text: '{}' }], structuredContent: { locale: 'en', entries: titles.map((title) => ({ title })) } });
  const foundNothing = found();
  const foundAnAnswer = found('How do I care for the leather?');
  /** A result Maison refused (isError), as the MCP client passes it on. */
  const refusal = { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: { code: 'invalid_input', message: 'Check the query.', hint: 'Use 1 to 300 characters.' } }) }] };
  const words: Part = { type: 'text', text: 'I could not find a reliable answer, so I have passed your question to the advisors.' };
  const step: Part = { type: 'step-start' };

  it('puts the note under a hand-off that went through, and under the first of several', () => {
    expect(handOffAt([foundNothing, handedOff])).toEqual(recordedAt(1));
    expect(handOffAt([step, handedOff, words])).toEqual(recordedAt(1));
    const another = handOff('output-available', recorded('Q-4822'), 'And a ring?');
    expect(handOffAt([handedOff, foundNothing, another])).toEqual(recordedAt(0));
    expect(handOffAt([another, handedOff])).toEqual(recordedAt(0, 'Q-4822', 'And a ring?'));
    expect(handOffAt([handOff('output-error'), handedOff])).toEqual(recordedAt(1)); // a first one that failed doesn't count
    expect(handOffAt([handOff('output-available', refusal), handedOff])).toEqual(recordedAt(1)); // nor one that was refused
  });

  it('answers what Strapi recorded: the reference it gave and the question the model sent', () => {
    expect(handOffAt([handOff('output-available', recorded('Q-0007'), 'Is it waterproof?')])).toEqual({ index: 0, recorded: { reference: 'Q-0007', question: 'Is it waterproof?' } });
  });

  it('puts it under a hand-off whatever the searches found: the model made the call', () => {
    expect(handOffAt([foundAnAnswer, handedOff])).toEqual(recordedAt(1));
    expect(handOffAt([search('input-available'), handedOff])).toEqual(recordedAt(1));
    expect(handOffAt([search('output-error'), handedOff])).toEqual(recordedAt(1));
  });

  it('puts none under a hand-off that is running, failed or was refused, when no search found nothing', () => {
    expect(handOffAt([handOff('input-streaming')])).toBeNull();
    expect(handOffAt([handOff('input-available')])).toBeNull();
    expect(handOffAt([handOff('output-error')])).toBeNull();
    expect(handOffAt([handOff('output-available', refusal)])).toBeNull();
    expect(handOffAt([foundAnAnswer, handOff('output-error')])).toBeNull();
    expect(handOffAt([foundAnAnswer, handOff('output-available', refusal)])).toBeNull();
  });

  it('does not count a hand-off whose result has no reference: nothing says Strapi recorded the question', () => {
    expect(handOffAt([handOff('output-available', { content: [] })])).toBeNull();
    expect(handOffAt([handOff('output-available', { content: [], structuredContent: { question: { reference: '' } } })])).toBeNull();
    expect(handOffAt([handOff('output-available', null)])).toBeNull();
    expect(handOffAt([foundAnAnswer, handOff('output-available', { content: [] })])).toBeNull();
    // After a search that found nothing, the plain note shows, which claims nothing.
    expect(handOffAt([foundNothing, handOff('output-available', { content: [] })])).toEqual(fallbackAt(0));
  });

  it('falls back to the last search that found nothing, when the model made no hand-off: the plain note, with nothing recorded', () => {
    expect(handOffAt([foundNothing])).toEqual(fallbackAt(0));
    expect(handOffAt([step, foundNothing, step, words])).toEqual(fallbackAt(1)); // under the search, above the model's words
    expect(handOffAt([foundNothing, step, foundNothing])).toEqual(fallbackAt(2)); // two searches, both empty: under the last
    expect(handOffAt([foundNothing, handOff('output-error')])).toEqual(fallbackAt(0)); // a hand-off that failed doesn't take the note away
    expect(handOffAt([foundNothing, handOff('output-available', refusal)])).toEqual(fallbackAt(0));
    expect(handOffAt([foundNothing, handOff('input-available')])).toEqual(fallbackAt(0)); // still running: the note moves under it once it goes through
  });

  it('shows no fallback note when any search found entries', () => {
    expect(handOffAt([foundAnAnswer])).toBeNull();
    expect(handOffAt([foundNothing, foundAnAnswer])).toBeNull();
    expect(handOffAt([foundAnAnswer, foundNothing])).toBeNull();
    expect(handOffAt([foundAnAnswer, words])).toBeNull();
  });

  it('shows no fallback note while a search is running, or when the last one failed or was refused', () => {
    expect(handOffAt([search('input-streaming')])).toBeNull();
    expect(handOffAt([search('input-available')])).toBeNull();
    // Held back while a second search is under way, so the note doesn't show and then vanish when that one finds an answer.
    expect(handOffAt([foundNothing, search('input-available')])).toBeNull();
    expect(handOffAt([search('input-available'), foundNothing])).toBeNull();
    expect(handOffAt([search('output-error')])).toBeNull();
    expect(handOffAt([search('output-available', refusal)])).toBeNull();
    // The last search decides, and it failed: the question wasn't answered, and nothing says the knowledge is empty.
    expect(handOffAt([foundNothing, search('output-error')])).toBeNull();
    expect(handOffAt([foundNothing, search('output-available', refusal)])).toBeNull();
  });

  // Rule 6 has the model fix a refused call and call again, and the local model makes bad first calls.
  it('lets the last search decide: an earlier one that failed, was refused or could not be read does not cancel the note', () => {
    expect(handOffAt([search('output-available', refusal), foundNothing])).toEqual(fallbackAt(1));
    expect(handOffAt([search('output-error'), foundNothing])).toEqual(fallbackAt(1));
    expect(handOffAt([search('output-available', refusal), step, search('output-error'), step, foundNothing])).toEqual(fallbackAt(4)); // two bad ones, then an empty one
    expect(handOffAt([search('output-available', { content: [] }), foundNothing])).toEqual(fallbackAt(1)); // a result with nothing to read
    // A guessed slug is not_found; the model looks it up with search_products, then searches again.
    const notFound = search('output-available', { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: { code: 'not_found', message: 'No such product.', hint: 'Call search_products to find valid product slugs.' } }) }] });
    const products: Part = { type: 'dynamic-tool', toolName: 'search_products', state: 'output-available', output: { content: [], structuredContent: { products: [{ slug: 'weekender-50' }] } } };
    expect(handOffAt([notFound, products, foundNothing])).toEqual(fallbackAt(2));
    // The last one still has to be the empty one, and no search may have found entries or be running.
    expect(handOffAt([search('output-available', refusal), foundAnAnswer, foundNothing])).toBeNull();
    expect(handOffAt([search('output-error'), foundAnAnswer])).toBeNull();
    expect(handOffAt([search('output-available', refusal), search('input-available')])).toBeNull(); // the retry is still running
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

  it('reads a call from a static part too, and counts every part toward the index', () => {
    const typed: Part = { type: 'tool-search_knowledge', state: 'output-available', output: { content: [], structuredContent: { entries: [] } } };
    expect(handOffAt([step, words, typed])).toEqual(fallbackAt(2));
    expect(handOffAt([step, words, { ...typed, output: { content: [], structuredContent: { entries: [{ title: 'A' }] } } }])).toBeNull();
    const typedHandOff: Part = { type: 'tool-hand_off_to_staff', state: 'output-available', input: { question: 'Can it hold a watch?' }, output: recorded('Q-4821') };
    expect(handOffAt([step, typed, words, typedHandOff])).toEqual(recordedAt(3));
  });
});
