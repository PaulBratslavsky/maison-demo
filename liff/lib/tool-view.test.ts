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
});

describe('toolPartOf', () => {
  it("reads a local tool's name from its part type, and skips text", () => {
    expect(toolPartOf({ type: 'tool-hand_off_to_staff' })?.toolName).toBe('hand_off_to_staff');
    expect(toolPartOf({ type: 'text' })).toBeNull();
  });
});
