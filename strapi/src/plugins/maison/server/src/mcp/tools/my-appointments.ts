import { z } from '@strapi/utils';

import { getConfig } from '../../config';
import { ACTION } from '../../constants';
import { toolSuccess } from '../../domain/tool-result';
import { notSignedIn } from '../common';
import { defineTool } from '../define';
import { appointmentOutput, localeInput } from '../schemas';

export const myAppointmentsTool = defineTool({
  name: 'my_appointments',
  title: 'My appointments',
  description:
    "Lists the signed-in customer's own boutique appointments, newest first: requested (waiting for the boutique) or confirmed, and whether the LINE confirmation was sent. It never shows other customers.",
  auth: { policies: [{ action: ACTION.appointmentsRequest }] },
  resolveInputSchema: () => z.object({ locale: localeInput }),
  resolveOutputSchema: () => z.object({ appointments: z.array(appointmentOutput) }),
  createHandler: (strapi) => async ({ args, extra }) => {
    const subject = await strapi.plugin('maison').service('identity').getCustomerSubject(extra);
    if (!subject) return notSignedIn();
    const locale = args.locale ?? getConfig(strapi).defaultLocale;
    const appointments = await strapi.plugin('maison').service('appointments').listForCustomer(subject, locale);
    return toolSuccess({ appointments });
  },
});
