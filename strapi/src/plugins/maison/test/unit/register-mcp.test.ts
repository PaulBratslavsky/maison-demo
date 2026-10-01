import { describe, expect, it } from 'vitest';
import { registerMcp } from '../../server/src/mcp';
import { TOOL_NAMES } from '../../server/src/constants';
import { fakeMcp, fakeStrapi } from './fake-strapi';

describe('registerMcp', () => {
  it('warns and registers nothing when Strapi MCP is disabled', () => {
    const mcp = fakeMcp(false);
    const strapi = fakeStrapi({ mcp });
    registerMcp(strapi);
    expect(strapi.log.warn).toHaveBeenCalledWith(expect.stringMatching(/server\.mcp\.enabled/));
    expect(mcp.registerTool).not.toHaveBeenCalled();
    expect(mcp.registerPrompt).not.toHaveBeenCalled();
  });

  it('warns when the host Strapi has no MCP service at all', () => {
    const strapi = fakeStrapi();
    expect(() => registerMcp(strapi)).not.toThrow();
    expect(strapi.log.warn).toHaveBeenCalled();
  });

  it('registers every enabled tool and skips the ones in disabledTools', () => {
    const mcp = fakeMcp(true);
    registerMcp(fakeStrapi({ mcp, config: { disabledTools: ['find_boutiques'] } }));
    const names = mcp.registerTool.mock.calls.map(([tool]) => tool.name);
    expect(names).toEqual([
      'browse_collections', 'search_products', 'view_product',
      'request_appointment', 'my_appointments', 'appointment_requests', 'confirm_appointment',
      'pending_confirmations', 'record_confirmation',
    ]);
    expect(mcp.registerPrompt.mock.calls.map(([prompt]) => prompt.name)).toEqual(['send_pending_confirmations']);
  });

  it('registers the confirmation prompt only when both tools it drives are enabled', () => {
    for (const disabledTools of [['record_confirmation'], ['pending_confirmations']]) {
      const mcp = fakeMcp(true);
      registerMcp(fakeStrapi({ mcp, config: { disabledTools } }));
      expect(mcp.registerPrompt, `disabledTools: ${disabledTools}`).not.toHaveBeenCalled();
    }
  });

  it('never claims a name Strapi generates for content types', () => {
    // Content Manager registers list_/get_/create_/update_/delete_/publish_/unpublish_/write_/discard_
    // tools for every content type in the host app (get_product for api::product.product), and a
    // duplicate name stops Strapi from booting.
    const generated = /^(list|get|create|update|delete|publish|unpublish|write|discard)_/;
    expect(TOOL_NAMES.filter((name) => generated.test(name))).toEqual([]);
  });
});
