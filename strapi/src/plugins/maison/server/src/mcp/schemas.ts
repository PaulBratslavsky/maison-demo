import { z } from '@strapi/utils';

import { CATEGORIES, LOCALES, OCCASIONS } from '../constants';
import { ISO_DATE, isRealIsoDate } from '../domain/hours';

const ISO_DATETIME_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;
const NOT_A_REAL_DATE = 'Not a real calendar date.';

export const localeInput = z.enum(LOCALES).optional().describe('Content language: "ja" (default) or "en".');
export const slugInput = z.string().min(1).max(120).regex(/^[a-z0-9-]+$/, 'Use a slug like "weekender-50".');
// A wrong format aborts the checks that follow, so it gets one message, not a calendar complaint as well.
export const isoDateInput = z
  .string()
  .regex(ISO_DATE, { error: 'Use YYYY-MM-DD.', abort: true })
  .refine(isRealIsoDate, NOT_A_REAL_DATE);
export const isoDateTimeInput = z
  .string()
  .regex(ISO_DATETIME_WITH_OFFSET, { error: 'Use ISO 8601 with a time zone, e.g. 2026-10-10T14:00:00+09:00.', abort: true })
  .refine((value) => isRealIsoDate(value.slice(0, 10)), NOT_A_REAL_DATE)
  .refine((value) => Number(value.slice(11, 13)) <= 23, 'Not a real time of day: the hour must be 00 to 23.')
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Not a real date and time.');
export const categoryInput = z.enum(CATEGORIES);
export const occasionInput = z.enum(OCCASIONS);

export const productCardOutput = z.object({
  slug: z.string(),
  name: z.string(),
  category: z.string(),
  priceJpy: z.number(),
  imageUrl: z.string().nullable(),
  occasions: z.array(z.string()),
  personalizable: z.boolean(),
  inStockAt: z.array(z.string()),
});

export const appointmentOutput = z.object({
  reference: z.string(),
  status: z.enum(['requested', 'confirmed']).describe('"requested" until the boutique confirms. Never call a requested visit confirmed.'),
  boutique: z.object({ slug: z.string(), name: z.string() }),
  requestedFor: z.string().describe('Visit start in the boutique\'s time zone, ISO 8601 with offset.'),
  products: z.array(z.object({ slug: z.string(), name: z.string() })),
  note: z.string(),
  confirmationSent: z.boolean().describe('Whether the LINE confirmation has been delivered.'),
});

/** An appointment reference such as APT-4821 (see domain/reference.ts). */
export const referenceInput = z.string().regex(/^APT-\d{4}$/, 'Use a reference like APT-4821.');

/** Staff filters for appointments. The appointment_requests tool, the chat and the admin board all use these. */
export const appointmentRequestsInput = z.object({
  status: z
    .enum(['requested', 'confirmed', 'all'])
    .optional()
    .describe('"requested" (default): waiting for staff, with the visit still ahead. "confirmed": confirmed by staff. "all": every request.'),
  boutique: slugInput.optional().describe('Only this boutique, by slug from find_boutiques.'),
  date: isoDateInput.optional().describe("Only visits on this calendar day (YYYY-MM-DD) in the boutique's time zone."),
  limit: z.number().int().min(1).max(50).optional().describe('Maximum appointments, default 20.'),
  locale: localeInput,
});

/** An appointment as staff see it. The customer is masked, and labels come from published versions only. */
export const staffAppointmentOutput = z.object({
  reference: z.string(),
  status: z.enum(['requested', 'confirmed']).describe('"confirmed" once staff have confirmed it.'),
  customer: z.string().describe('The LINE customer, masked like line:U4af…88. The full ID is never shown.'),
  boutique: z.object({ slug: z.string(), name: z.string() }).nullable().describe('null if the boutique is no longer published.'),
  requestedFor: z.string().describe("Visit start in the boutique's time zone, ISO 8601 with offset."),
  products: z.array(z.object({ slug: z.string(), name: z.string() })).describe('The published products the customer wants to see.'),
  note: z.string().describe("The customer's own words for the boutique."),
  createdVia: z.enum(['concierge', 'app']).describe('"concierge" when the AI concierge made the request, "app" for the app screens.'),
  confirmationSent: z.boolean().describe('Whether the LINE confirmation has been delivered.'),
  createdAt: z.string().describe('When the request was made, ISO 8601 with offset.'),
});

/** Zod issues on one line, e.g. `reference: Use a reference like APT-4821.` */
export const describeIssues = (error: z.ZodError): string =>
  error.issues.map((issue) => `${issue.path.map(String).join('.') || 'input'}: ${issue.message}`).join('; ');
