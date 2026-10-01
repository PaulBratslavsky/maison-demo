import { z } from '@strapi/utils';

import { ACTION, SURFACE_HEADER } from '../../constants';
import { toolError, toolSuccess } from '../../domain/tool-result';
import { notSignedIn } from '../common';
import { defineTool } from '../define';
import { appointmentOutput, isoDateTimeInput, slugInput } from '../schemas';

const input = z.object({
  boutique: slugInput.describe('Boutique slug from find_boutiques, e.g. "ginza".'),
  productSlugs: z.array(slugInput).min(1).max(5).describe('One to five product slugs the customer wants to see.'),
  requestedFor: isoDateTimeInput.describe('Visit start, ISO 8601 with a time zone offset, e.g. 2026-10-10T14:00:00+09:00.'),
  note: z.string().max(500).optional().describe("The customer's own words for the boutique, e.g. who the gift is for."),
});

export const requestAppointmentTool = defineTool({
  name: 'request_appointment',
  title: 'Request a boutique appointment',
  description:
    'Requests a boutique visit for the signed-in customer. It creates a request that a boutique must confirm; never tell the customer it is confirmed. Check opening hours with find_boutiques first. The customer comes from their LINE sign-in, never from an argument.',
  auth: { policies: [{ action: ACTION.appointmentsRequest }] },
  resolveInputSchema: () => input,
  resolveOutputSchema: () => z.object({ appointment: appointmentOutput }),
  createHandler: (strapi) => async ({ args, extra }) => {
    const subject = await strapi.plugin('maison').service('identity').getCustomerSubject(extra);
    if (!subject) return notSignedIn();
    const surface = extra.requestInfo?.headers?.[SURFACE_HEADER];
    const result = await strapi.plugin('maison').service('appointments').request({
      subject,
      boutique: args.boutique,
      productSlugs: args.productSlugs,
      requestedFor: args.requestedFor,
      note: args.note,
      createdVia: surface === 'concierge' ? 'concierge' : 'app',
    });
    if (!result.ok) return toolError(result.code, result.message, result.hint);
    return toolSuccess({ appointment: result.value });
  },
});
