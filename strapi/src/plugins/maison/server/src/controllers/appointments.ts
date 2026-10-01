import type { Core } from '@strapi/strapi';

import type { ServiceFailure } from '../domain/service-result';
import { appointmentRequestsInput, describeIssues, referenceInput } from '../mcp/schemas';

/** Query strings are text, so a limit arrives as "20". */
const filtersFrom = (query: Record<string, unknown> = {}) =>
  query.limit === undefined ? query : { ...query, limit: Number(query.limit) };

/** The tools' codes and hints in Strapi's error body: 404 for not_found, 400 for the rest. */
const fail = (ctx, { code, message, hint }: ServiceFailure) =>
  code === 'not_found' ? ctx.notFound(message, { code, hint }) : ctx.badRequest(message, { code, hint });

/** The requests board in the admin. Same service, same filters and same answers as the staff MCP tools. */
export default ({ strapi }: { strapi: Core.Strapi }) => ({
  async list(ctx) {
    const filters = appointmentRequestsInput.safeParse(filtersFrom(ctx.query));
    if (!filters.success) {
      return ctx.badRequest(describeIssues(filters.error), { code: 'invalid_input', hint: 'Fix the filters and try again.' });
    }
    const result = await strapi.plugin('maison').service('appointments').listRequests(filters.data);
    if (!result.ok) return fail(ctx, result);
    ctx.body = { appointments: result.value };
  },

  async confirm(ctx) {
    const reference = referenceInput.safeParse(ctx.params.reference);
    if (!reference.success) {
      return ctx.badRequest(describeIssues(reference.error), { code: 'invalid_input', hint: 'Use a reference like APT-4821.' });
    }
    const result = await strapi.plugin('maison').service('appointments').confirm(reference.data);
    if (!result.ok) return fail(ctx, result);
    ctx.body = result.value;
  },
});
