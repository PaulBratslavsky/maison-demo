import { COPY } from './copy';
import type { ToolError } from './mcp';
import type { Appointment, Locale } from './types';

export const statusLabel = (visit: Appointment, locale: Locale) => {
  const t = COPY[locale];
  if (visit.status === 'requested') return t.requested;
  return visit.confirmationSent ? t.confirmationSent : t.confirmed;
};

/** A tool error (or a sign-in error) in the customer's words. Unknown codes show the tool's own message. */
export const errorText = (error: Pick<ToolError, 'code' | 'message'>, locale: Locale): string =>
  (COPY[locale].errors as Record<string, string>)[error.code] ?? error.message;
