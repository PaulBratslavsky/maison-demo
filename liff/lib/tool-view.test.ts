import { describe, expect, it } from 'vitest';

import { toolPartOf, toolView } from './tool-view';

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
