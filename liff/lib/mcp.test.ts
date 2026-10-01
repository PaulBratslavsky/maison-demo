import { StreamableHTTPError } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { describe, expect, it, vi } from 'vitest';

import { type ToolCallRecord, createMcp, toolErrorOf } from './mcp';

const ok = (data: Record<string, unknown>) => ({
  content: [{ type: 'text', text: JSON.stringify(data) }],
  structuredContent: data,
});
const unauthorized = () =>
  new StreamableHTTPError(401, 'Error POSTing to endpoint: Unauthorized');
const fakeSession = () => {
  let issued = 1;
  return {
    getToken: vi.fn(async () => 'mcp_at_1'),
    refresh: vi.fn(async () => `mcp_at_${++issued}`),
  };
};
const client = (callTool: () => Promise<unknown>) => ({
  callTool: vi.fn(callTool),
  close: vi.fn(async () => {}),
});

describe('createMcp', () => {
  it('connects once with the session token and records every call for the agent view', async () => {
    const records: ToolCallRecord[] = [];
    const connected = client(async () => ok({ total: 1 }));
    const connect = vi.fn(async () => connected);
    const mcp = createMcp({
      strapiUrl: 'http://strapi.test',
      session: fakeSession() as any,
      onRecord: (record) => records.push(record),
      connect: connect as any,
    });
    await mcp.callTool('home', 'browse_collections', { locale: 'ja' });
    await mcp.callTool('collection', 'search_products', {
      collection: 'voyage',
    });
    expect(connect).toHaveBeenCalledTimes(1);
    expect(connect).toHaveBeenCalledWith('mcp_at_1');
    expect(records.map((r) => [r.id, r.screen, r.name])).toEqual([
      [1, 'home', 'browse_collections'],
      [2, 'collection', 'search_products'],
    ]);
    expect(records[1].args).toEqual({ collection: 'voyage' });
    expect(records[0].result?.structuredContent).toEqual({ total: 1 });
    expect(records[0].ms).toBeGreaterThanOrEqual(0);
  });

  it('after a 401, exchanges a new token once, reconnects and retries', async () => {
    const expired = client(async () => {
      throw unauthorized();
    });
    const fresh = client(async () => ok({ appointments: [] }));
    const connect = vi
      .fn()
      .mockResolvedValueOnce(expired)
      .mockResolvedValueOnce(fresh);
    const session = fakeSession();
    const mcp = createMcp({
      strapiUrl: 'x',
      session: session as any,
      onRecord: () => {},
      connect,
    });
    expect(
      (await mcp.callTool('visits', 'my_appointments', {})).structuredContent
    ).toEqual({ appointments: [] });
    expect(session.refresh).toHaveBeenCalledTimes(1);
    expect(connect).toHaveBeenLastCalledWith('mcp_at_2');
    expect(expired.close).toHaveBeenCalled();
  });

  it('calls that get a 401 together share one reconnect, and neither is cut off by it', async () => {
    // Like the MCP SDK's client: closing a connection rejects the calls still in flight on it.
    const connection = (token: string) => {
      const inFlight = new Set<(error: Error) => void>();
      return {
        callTool: vi.fn(
          ({ name }: { name: string }) =>
            new Promise((resolve, reject) => {
              inFlight.add(reject);
              // The server refuses the expired token: the first call hears so after 5 ms, the second after 15 ms.
              setTimeout(
                () =>
                  token === 'mcp_at_1'
                    ? reject(unauthorized())
                    : resolve(ok({ name })),
                name === 'first' ? 5 : 15
              );
            })
        ),
        close: vi.fn(async () => {
          inFlight.forEach((reject) =>
            reject(new Error('MCP error -32000: Connection closed'))
          );
        }),
      };
    };
    const opened: Array<ReturnType<typeof connection>> = [];
    const connect = vi.fn(async (token: string) => {
      const made = connection(token);
      opened.push(made);
      return made;
    });
    const session = fakeSession();
    const mcp = createMcp({
      strapiUrl: 'x',
      session: session as any,
      onRecord: () => {},
      connect: connect as any,
    });
    const results = await Promise.allSettled([
      mcp.callTool('visits', 'first', {}),
      mcp.callTool('visits', 'second', {}),
    ]);
    expect(results.map((result) => result.status)).toEqual([
      'fulfilled',
      'fulfilled',
    ]);
    expect(session.refresh).toHaveBeenCalledTimes(1);
    expect(connect.mock.calls.map(([token]) => token)).toEqual([
      'mcp_at_1',
      'mcp_at_2',
    ]);
    expect(opened[0].close).toHaveBeenCalledTimes(1);
    expect(opened[1].close).not.toHaveBeenCalled();
  });

  it('gives up after one retry and records the failure', async () => {
    const connect = vi.fn(async () =>
      client(async () => {
        throw unauthorized();
      })
    );
    const session = fakeSession();
    const records: ToolCallRecord[] = [];
    const mcp = createMcp({
      strapiUrl: 'x',
      session: session as any,
      onRecord: (record) => records.push(record),
      connect: connect as any,
    });
    await expect(mcp.callTool('visits', 'my_appointments', {})).rejects.toThrow(
      /Unauthorized/
    );
    expect(session.refresh).toHaveBeenCalledTimes(1);
    expect(records[0].error).toMatch(/Unauthorized/);
  });

  it('does not retry other failures', async () => {
    const connect = vi.fn(async () =>
      client(async () => {
        throw new StreamableHTTPError(500, 'boom');
      })
    );
    const session = fakeSession();
    const mcp = createMcp({
      strapiUrl: 'x',
      session: session as any,
      onRecord: () => {},
      connect: connect as any,
    });
    await expect(
      mcp.callTool('home', 'browse_collections', {})
    ).rejects.toThrow(/boom/);
    expect(session.refresh).not.toHaveBeenCalled();
  });
});

describe('toolErrorOf', () => {
  it("reads the Maison tools' error JSON", () => {
    const error = {
      code: 'boutique_closed',
      message: 'Closed.',
      hint: 'Try Saturday.',
    };
    expect(
      toolErrorOf({
        isError: true,
        content: [{ type: 'text', text: JSON.stringify({ error }) }],
      } as any)
    ).toEqual(error);
  });

  it("reads the MCP SDK's plain-text schema errors as invalid_input", () => {
    const text =
      'Input validation error: Invalid arguments for tool request_appointment: requestedFor: Not a real calendar date.';
    expect(
      toolErrorOf({ isError: true, content: [{ type: 'text', text }] } as any)
    ).toEqual({ code: 'invalid_input', message: text, hint: '' });
  });

  it('wraps plain error text, and returns null for successes', () => {
    expect(
      toolErrorOf({
        isError: true,
        content: [{ type: 'text', text: 'MCP error -32602: Tool x not found' }],
      } as any)
    ).toEqual({
      code: 'error',
      message: 'MCP error -32602: Tool x not found',
      hint: '',
    });
    expect(toolErrorOf(ok({}) as any)).toBeNull();
    expect(toolErrorOf(null)).toBeNull();
  });
});
