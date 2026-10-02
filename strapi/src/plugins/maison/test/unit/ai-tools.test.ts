import { describe, expect, it, vi } from 'vitest';
import aiToolsService, { CHAT_TOOLS } from '../../server/src/services/ai-tools';
import { fakeStrapi } from './fake-strapi';

const chatTools = (services: Record<string, unknown> = {}, config: Record<string, unknown> = {}) =>
  aiToolsService({ strapi: fakeStrapi({ services, config }) }).getTools();
const toolNamed = (tools: any[], name: string) => tools.find((tool) => tool.name === name);

describe('ai-tools for the in-admin chat', () => {
  it('offers the catalog and staff tools, each gated by its MCP permission', () => {
    expect(chatTools().map((tool) => [tool.name, tool.action])).toEqual([
      ['browse_collections', 'plugin::maison.catalog.read'],
      ['search_products', 'plugin::maison.catalog.read'],
      ['view_product', 'plugin::maison.catalog.read'],
      ['find_boutiques', 'plugin::maison.catalog.read'],
      ['appointment_requests', 'plugin::maison.appointments.review'],
      ['confirm_appointment', 'plugin::maison.appointments.confirm'],
    ]);
  });

  it('never offers the customer tools or the LINE confirmation tools', () => {
    const names = chatTools().map((tool) => tool.name);
    // pending_confirmations returns every customer's full LINE user ID, and the chat has no LINE tool to use it with.
    // log_inquiry records a turn for a signed-in LINE customer, and a chat has an admin instead.
    for (const name of ['request_appointment', 'my_appointments', 'hand_off_to_staff', 'log_inquiry', 'pending_confirmations', 'record_confirmation']) {
      expect(names).not.toContain(name);
    }
  });

  it('uses the MCP descriptions, with schemas @tanstack/ai can turn into JSON Schema', () => {
    for (const tool of chatTools()) {
      expect(tool.description).toBe(CHAT_TOOLS.find((mcpTool) => mcpTool.name === tool.name)?.description);
      // @tanstack/ai reads zod 4's Standard JSON Schema; a zod 3 schema has none and would reach the model broken.
      const jsonSchema = (tool.schema as any)['~standard'].jsonSchema.input({ target: 'draft-07' });
      expect(jsonSchema.type, tool.name).toBe('object');
    }
  });

  it('leaves out tools listed in disabledTools, as MCP registration does', () => {
    const names = chatTools({}, { disabledTools: ['confirm_appointment'] }).map((tool) => tool.name);
    expect(names).not.toContain('confirm_appointment');
    expect(names).toContain('appointment_requests');
  });

  it('runs the MCP handler and returns its structured result', async () => {
    const searchProducts = vi.fn(async () => ({ ok: true, value: { total: 0, products: [] } }));
    const tool = toolNamed(chatTools({ catalog: { searchProducts } }), 'search_products');
    await expect(tool.execute({ occasion: 'travel', locale: 'en' })).resolves.toEqual({ locale: 'en', total: 0, products: [] });
    expect(searchProducts).toHaveBeenCalledWith('en', { occasion: 'travel', locale: 'en' });
  });

  it('unwraps a tool error into { error } with its code, message and hint', async () => {
    const confirm = vi.fn(async () => ({ ok: false, code: 'in_the_past', message: 'The visit has passed.', hint: 'Ask for a new time.' }));
    const tool = toolNamed(chatTools({ appointments: { confirm } }), 'confirm_appointment');
    await expect(tool.execute({ reference: 'APT-4821' })).resolves.toEqual({
      error: { code: 'in_the_past', message: 'The visit has passed.', hint: 'Ask for a new time.' },
    });
  });

  it('answers invalid arguments with invalid_input and never calls the service', async () => {
    const confirm = vi.fn();
    const tool = toolNamed(chatTools({ appointments: { confirm } }), 'confirm_appointment');
    const result = await tool.execute({ reference: '4821' });
    expect(result.error.code).toBe('invalid_input');
    expect(result.error.message).toBe('reference: Use a reference like APT-4821.');
    expect(confirm).not.toHaveBeenCalled();
  });

  it('adapts only tools that need no MCP handler context and gate on a single permission', () => {
    for (const tool of CHAT_TOOLS) {
      // The chat has no handler context to give, so neither the handler nor the schema resolver may declare the parameter.
      expect(tool.createHandler.length, tool.name).toBe(1);
      expect(tool.resolveInputSchema?.length ?? 0, tool.name).toBe(0);
      // MCP ORs a tool's policies, but the adapter gates the chat on the first one only.
      expect(tool.auth.policies, tool.name).toHaveLength(1);
    }
  });

  it("names Maison in the chat's Tools menu", () => {
    expect(aiToolsService({ strapi: fakeStrapi() }).getMeta()).toEqual({ label: 'Maison', description: expect.any(String) });
  });
});
