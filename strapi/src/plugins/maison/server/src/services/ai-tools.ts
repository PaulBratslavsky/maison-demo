import type { Core, Modules } from '@strapi/strapi';
import { z } from '@strapi/utils';

import { getConfig } from '../config';
import type { ErrorCode } from '../domain/tool-result';
import { describeIssues } from '../mcp/schemas';
import { appointmentRequestsTool } from '../mcp/tools/appointment-requests';
import { browseCollectionsTool } from '../mcp/tools/browse-collections';
import { confirmAppointmentTool } from '../mcp/tools/confirm-appointment';
import { findBoutiquesTool } from '../mcp/tools/find-boutiques';
import { searchProductsTool } from '../mcp/tools/search-products';
import { viewProductTool } from '../mcp/tools/view-product';

type HandlerContext = Modules.MCP.McpHandlerContext;

/** The parts of a Maison MCP tool definition that the chat uses. */
interface McpTool {
  name: string;
  description: string;
  auth: { policies: ReadonlyArray<{ action: string }> };
  resolveInputSchema?: (context: HandlerContext) => z.ZodObject<z.ZodRawShape>;
  createHandler: (
    strapi: Core.Strapi,
    context: HandlerContext
  ) => (params: { args: any; extra: Modules.MCP.McpCapabilityHandlerContext }) => Promise<unknown>;
}

/** A tool as strapi-plugin-tanstack-ai 1.6 reads it from a plugin's `ai-tools` service. */
export interface ChatTool {
  name: string;
  description: string;
  schema: z.ZodObject<z.ZodRawShape>;
  /** The admin permission the chat checks before it offers the tool to the signed-in admin. */
  action: string;
  execute: (args: unknown) => Promise<unknown>;
}

export interface ChatToolError {
  error: { code: ErrorCode; message: string; hint: string };
}

type HandlerResult = { isError?: boolean; content: Array<{ type: string; text?: string }>; structuredContent?: unknown };

/**
 * What the in-admin chat offers: four catalog reads (not search_knowledge) and the two staff tools.
 * request_appointment, my_appointments, hand_off_to_staff and log_inquiry act for a signed-in LINE customer, and a chat has an admin instead.
 * pending_confirmations and record_confirmation are for the ops agent that delivers LINE confirmations. The chat has no
 * LINE tool, and pending_confirmations returns every customer's full LINE user ID, which would reach the model and its
 * memory and notes tools. Staff see whether a confirmation was sent, with the customer masked, through appointment_requests.
 */
export const CHAT_TOOLS: McpTool[] = [
  browseCollectionsTool,
  searchProductsTool,
  viewProductTool,
  findBoutiquesTool,
  appointmentRequestsTool,
  confirmAppointmentTool,
];

/**
 * The chat calls execute(args, strapi) with no admin user or ability, and no Maison handler reads the MCP handler
 * context: every createHandler takes only strapi, and the schema resolvers ignore it. A unit test keeps it that way.
 */
const NO_CONTEXT = { userAbility: undefined, user: { id: 0 } } as unknown as HandlerContext;

const invalidInput = (tool: McpTool, error: z.ZodError): ChatToolError => ({
  error: { code: 'invalid_input', message: describeIssues(error), hint: `Call ${tool.name} again with arguments that match its schema.` },
});

/** One MCP tool as a chat tool: the same schema, permission and handler, with the MCP result unwrapped. */
const toChatTool = (strapi: Core.Strapi, tool: McpTool): ChatTool => {
  const schema = tool.resolveInputSchema?.(NO_CONTEXT) ?? z.object({});
  return {
    name: tool.name,
    description: tool.description,
    schema,
    action: tool.auth.policies[0].action,
    async execute(args) {
      const parsed = schema.safeParse(args ?? {});
      if (!parsed.success) return invalidInput(tool, parsed.error);
      const result = (await tool.createHandler(strapi, NO_CONTEXT)({ args: parsed.data, extra: {} })) as HandlerResult;
      if (result.isError) return JSON.parse(result.content[0].text) as ChatToolError;
      return result.structuredContent;
    },
  };
};

/** Tools for strapi-plugin-tanstack-ai's in-admin chat, built from the MCP tool definitions so the two can't drift. */
export default ({ strapi }: { strapi: Core.Strapi }) => ({
  getTools(): ChatTool[] {
    const disabled = new Set<string>(getConfig(strapi).disabledTools);
    return CHAT_TOOLS.filter((tool) => !disabled.has(tool.name)).map((tool) => toChatTool(strapi, tool));
  },

  getMeta() {
    return { label: 'Maison', description: 'Catalog, boutiques and appointment requests of the Maison house' };
  },
});
