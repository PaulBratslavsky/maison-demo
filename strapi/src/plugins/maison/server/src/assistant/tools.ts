import type { Core } from '@strapi/strapi';
import { z } from '@strapi/utils';

import { getConfig } from '../config';
import { ACTION, ASSISTANT_LIMITS, INQUIRY_FILTERS, INQUIRY_KINDS } from '../constants';
import type { ServiceFailure } from '../domain/service-result';
import { describeIssues, isoDateInput, questionReferenceInput, referenceInput } from '../mcp/schemas';
import { searchKnowledgeTool } from '../mcp/tools/search-knowledge';
import { searchProductsTool } from '../mcp/tools/search-products';
import { viewProductTool } from '../mcp/tools/view-product';
import { toChatTool, type ChatToolError, type McpTool } from '../services/ai-tools';
import { DATA_RULE, capList, inquiryView, questionView, requestView, type ViewOptions } from './views';

/** What the chat needs from an admin's ability: whether they may use an action. Checked with no subject, as Maison registers every action without one. */
export interface Ability {
  can(action: string): boolean;
}

/** A tool as the service hands it to `toTools`: plain data, with no SDK in it. */
export interface AssistantToolSpec {
  name: string;
  description: string;
  inputSchema: z.ZodObject<z.ZodRawShape>;
  /** Runs on the server. A draft tool has none: the browser runs it, and it shows staff the draft. */
  execute?: (args: unknown) => Promise<unknown>;
}

export const READ_TOOL_NAMES = ['list_requests', 'list_questions', 'list_inquiries', 'inquiry_counts', 'search_knowledge', 'search_products', 'view_product'] as const;

/** What staff call each tool, in the drawer's list of tools. A tool with no entry here is shown under its own name. */
export const TOOL_LABELS: Record<string, string> = {
  list_requests: 'Visit requests',
  list_questions: 'Customer questions',
  list_inquiries: 'Inquiries',
  inquiry_counts: 'Inquiry counts',
  search_knowledge: 'Product knowledge',
  search_products: 'Product search',
  view_product: 'Product details',
  draft_reply: 'Draft a LINE reply',
  draft_answer: 'Draft an answer',
};

export const toolLabel = (name: string): string => (Object.prototype.hasOwnProperty.call(TOOL_LABELS, name) ? TOOL_LABELS[name] : name);

/** How many rows a list gives when the model names no limit, and the most it may ask for. */
const MAX_ROWS = ASSISTANT_LIMITS.listRows;

const limitInput = z
  .number()
  .int()
  .min(1)
  .max(MAX_ROWS)
  .optional()
  .describe(`Maximum rows, from 1 to ${MAX_ROWS}. Without it the list gives up to ${MAX_ROWS}.`);

const requestsInput = z.object({
  status: z
    .enum(['requested', 'confirmed', 'all'])
    .optional()
    .describe('"requested" (default): waiting for staff, with the visit still ahead. "confirmed": confirmed by staff. "all": every request.'),
  date: isoDateInput.optional().describe('Only visits on this day (YYYY-MM-DD), in the boutique time zone.'),
  reference: referenceInput.optional().describe('One request by its reference, such as APT-4821, with its full note. Any status, any visit day. The other filters are ignored.'),
  limit: limitInput,
});

const questionsInput = z.object({
  status: z.enum(['open', 'answered', 'all']).optional().describe('"open" (default): open, or taken by a staff member. "answered". "all".'),
  since: isoDateInput.optional().describe('Only questions that came in on or after this day (YYYY-MM-DD), in the boutique time zone.'),
  reference: questionReferenceInput.optional().describe('One question by its reference, such as Q-4821, with its full text. Any status, any day. The other filters are ignored.'),
  limit: limitInput,
});

const inquiriesInput = z.object({
  filter: z
    .enum(INQUIRY_FILTERS)
    .optional()
    .describe('One of the Inquiries tab filters. "needs-answer" (default), "complaint", "praise" and "not-labelled" list open inquiries only. "all" lists every inquiry, replied and closed ones too.'),
  kind: z.enum(INQUIRY_KINDS).optional().describe('Only inquiries the model labelled with this kind. With filter "all" this includes replied and closed ones.'),
  since: isoDateInput.optional().describe('Only inquiries that came in on or after this day (YYYY-MM-DD), in the boutique time zone.'),
  documentId: z.string().trim().min(1).max(64).optional().describe('One inquiry by its documentId, with its full text. The other filters are ignored.'),
  limit: limitInput,
});

const noInput = z.object({});

const LISTS = 'Customers are masked, and long customer text is cut in a list and marked truncated: true. capped: true means there were more rows than were returned.';

/** An expected failure, as the chat tools answer it: returned, never thrown. */
const failed = (result: ServiceFailure): ChatToolError => ({ error: { code: result.code, message: result.message, hint: result.hint } });
const notFound = (message: string, hint: string): ChatToolError => ({ error: { code: 'not_found', message, hint } });

/** What the schema refused, in the words the chat tools use. */
const invalidInput = (name: string, error: z.ZodError): ChatToolError => ({
  error: { code: 'invalid_input', message: describeIssues(error), hint: `Call ${name} again with arguments that match its schema.` },
});

/** `product` without its `images`, which the model has no use for. Anything else, an error among them, is as it was. */
const withoutImages = (result: unknown): unknown => {
  const product = (result as { product?: Record<string, unknown> } | null)?.product;
  if (!product) return result;
  const { images: _images, ...rest } = product;
  return { ...(result as object), product: rest };
};

interface ReadTool {
  name: (typeof READ_TOOL_NAMES)[number];
  /** The admin permission that offers the tool. */
  action: string;
  description: string;
  inputSchema: z.ZodObject<z.ZodRawShape>;
  /** Runs with input the schema has accepted. */
  run: (args: any) => Promise<unknown>;
}

const staffTools = (strapi: Core.Strapi): ReadTool[] => {
  const services = (name: string) => strapi.plugin('maison').service(name);
  const options = (mode: ViewOptions['mode']): ViewOptions => ({ mode, timezone: getConfig(strapi).timezone });

  return [
    {
      name: 'list_requests',
      action: ACTION.appointmentsReview,
      description: `Lists customers' visit requests (boutique appointments) for staff. By default it lists the requests waiting for staff, soonest visit first. Use status "confirmed" or "all" for the others, newest first, or date for one visit day. Use reference to get one request, with its full note, whatever its status or day. ${LISTS} It changes nothing.`,
      inputSchema: requestsInput,
      async run({ status, date, reference, limit = MAX_ROWS }) {
        // A reference names one request, so the visit day stays out: a request on another day is still the one asked for.
        const result = await services('appointments').listRequests({ status, date: reference ? undefined : date, reference, limit: limit + 1 });
        if (!result.ok) return failed(result);
        if (reference && result.value.length === 0) return notFound(`No request ${reference}.`, 'Check the reference. Call list_requests with status "all" to see every request.');
        const { rows, capped } = capList(result.value, limit);
        return { requests: rows.map((row: any) => requestView(row, options(reference ? 'single' : 'list'))), capped };
      },
    },
    {
      name: 'list_questions',
      action: ACTION.questionsRead,
      description: `Lists the questions the concierge handed to staff, newest first. By default it lists the open ones: open, or taken by a staff member. Use status "answered" or "all", since for the questions from one day on, or reference to get one question, with its full text, whatever its status. ${LISTS} It changes nothing.`,
      inputSchema: questionsInput,
      async run({ status, since, reference, limit = MAX_ROWS }) {
        // A reference names one question, so `since` stays out: a question from an earlier day is still the one asked for.
        const result = await services('questions').list({ status, since: reference ? undefined : since, reference, limit: limit + 1 });
        if (!result.ok) return failed(result);
        if (reference && result.value.length === 0) return notFound(`No question ${reference}.`, 'Check the reference. Call list_questions with status "all" to see every question.');
        const { rows, capped } = capList(result.value, limit);
        return { questions: rows.map((row: any) => questionView(row, options(reference ? 'single' : 'list'))), capped };
      },
    },
    {
      name: 'list_inquiries',
      action: ACTION.inquiriesView,
      description: `Lists what customers wrote to the concierge (inquiries), newest first, each with the model's labels: kind, sentiment, topic and reason. Use filter for one of the Inquiries tab lists. Most of them show open inquiries only: use filter "all" to include replied and closed ones. Use kind to keep one kind, since for the inquiries from one day on, or documentId to get one inquiry, with its full text. ${LISTS} It changes nothing.`,
      inputSchema: inquiriesInput,
      async run({ filter, kind, since, documentId, limit = MAX_ROWS }) {
        if (documentId) {
          const found = await services('inquiries').view(documentId);
          if (!found.ok) return failed(found);
          return { inquiries: [inquiryView(found.value, options('single'))], capped: false };
        }
        const result = await services('inquiries').list({ filter, kind, since, limit: limit + 1 });
        if (!result.ok) return failed(result);
        const { rows, capped } = capList(result.value, limit);
        return { inquiries: rows.map((row: any) => inquiryView(row, options('list'))), capped };
      },
    },
    {
      name: 'inquiry_counts',
      action: ACTION.inquiriesView,
      description:
        'Counts the open inquiries in each queue: needsAnswer, complaint, praise, and notLabelled (nobody has labelled them yet). Use it for "how many" questions. It changes nothing.',
      inputSchema: noInput,
      run: async () => services('inquiries').summary(),
    },
  ];
};

/** The three catalog tools, as the MCP definitions have them, with the data rule added. They need `catalog.read`. */
const catalogTools = (strapi: Core.Strapi): Array<{ tool: McpTool; spec: AssistantToolSpec }> =>
  [searchKnowledgeTool, searchProductsTool, viewProductTool].map((tool) => {
    const chat = toChatTool(strapi, tool);
    const answer = tool.name === viewProductTool.name ? async (args: unknown) => withoutImages(await chat.execute(args)) : (args: unknown) => chat.execute(args);
    return { tool, spec: { name: chat.name, description: `${chat.description} ${DATA_RULE}`, inputSchema: chat.schema, execute: answer } };
  });

/**
 * The read tools this admin may use, in the order of READ_TOOL_NAMES. A tool is offered only when the admin's ability
 * allows its action, and the catalog tools only when `disabledTools` doesn't name them. An admin with no permission
 * gets none.
 */
const readTools = (strapi: Core.Strapi, ability: Ability): AssistantToolSpec[] => {
  const disabled = new Set<string>(getConfig(strapi).disabledTools);
  const staff = staffTools(strapi)
    .filter((tool) => ability.can(tool.action))
    .map((tool): AssistantToolSpec => ({
      name: tool.name,
      description: `${tool.description} ${DATA_RULE}`,
      inputSchema: tool.inputSchema,
      execute: async (args) => {
        const parsed = tool.inputSchema.safeParse(args ?? {});
        return parsed.success ? tool.run(parsed.data) : invalidInput(tool.name, parsed.error);
      },
    }));
  const catalog = ability.can(ACTION.catalogRead) ? catalogTools(strapi).filter(({ tool }) => !disabled.has(tool.name)).map(({ spec }) => spec) : [];
  return [...staff, ...catalog];
};

/** The tools that draft. Each shows staff a draft in the chat, and neither sends anything. */
export const DRAFT_TOOL_NAMES = ['draft_reply', 'draft_answer'] as const;

/** A draft's text: 1 to 2,000 characters after trimming, as Reply on LINE and Answer take it. */
const draftText = z.string().trim().min(1).max(ASSISTANT_LIMITS.draftChars);

/**
 * The draft tools an admin may use. They have no `execute`: a call to one ends the run for the browser, which draws the draft as a card and
 * sends nothing. Each needs two permissions, because Use this draft goes to the tab that lists the item and loads the item there:
 * `inquiries.view` and `inquiries.reply` for a reply, `questions.read` and `questions.answer` for an answer. The card holds itself to the same
 * pairs.
 */
const draftTools = (ability: Ability): AssistantToolSpec[] => {
  const specs: AssistantToolSpec[] = [];
  if (ability.can(ACTION.inquiriesView) && ability.can(ACTION.inquiriesReply)) {
    specs.push({
      name: 'draft_reply',
      description: [
        'Shows staff a draft reply to one inquiry, as a card in the chat with a Use this draft button. It sends nothing: staff read the draft, edit it and send it themselves.',
        "Pass the inquiry's documentId, exactly as list_inquiries gave it, and the text of the reply.",
        "Write only the body of the message: Maison adds the quote of the customer's words and its own name.",
        DATA_RULE,
      ].join(' '),
      inputSchema: z.object({
        documentId: z.string().trim().min(1).max(64).describe("The inquiry's documentId, exactly as list_inquiries gave it."),
        text: draftText.describe('The reply for the customer: plain text of 1 to 2,000 characters, with no greeting and no signature.'),
      }),
    });
  }
  if (ability.can(ACTION.questionsRead) && ability.can(ACTION.questionsAnswer)) {
    specs.push({
      name: 'draft_answer',
      description: [
        'Shows staff a draft answer to one customer question, as a card in the chat with a Use this draft button. It sends nothing: staff read the draft, edit it and send it themselves.',
        "Pass the question's reference, such as Q-4821, and the text of the answer.",
        'Write only the body of the message: Maison adds the greeting, the quote of the question, an invitation to reply and the signature.',
        DATA_RULE,
      ].join(' '),
      inputSchema: z.object({
        reference: questionReferenceInput.describe("The question's reference, such as Q-4821."),
        text: draftText.describe('The answer for the customer: plain text of 1 to 2,000 characters, with no greeting and no signature.'),
      }),
    });
  }
  return specs;
};

/** The tools one admin may use in the assistant: the read tools their role allows, then the draft tools it allows. */
export const assistantTools = (strapi: Core.Strapi, ability: Ability): AssistantToolSpec[] => [...readTools(strapi, ability), ...draftTools(ability)];
