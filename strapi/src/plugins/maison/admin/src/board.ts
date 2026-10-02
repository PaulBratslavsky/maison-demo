/** A row of the requests board, as far as these rules read it. */
export interface BoardRow {
  status: 'requested' | 'confirmed';
  /** The visit, in Tokyo time with its offset, e.g. "2026-10-10T14:00:00+09:00". */
  requestedFor: string;
  confirmationSent: boolean;
}

/** Confirm: a request staff haven't confirmed, until its visit starts. */
export const canStillConfirm = (row: BoardRow, now = Date.now()) => row.status === 'requested' && Date.parse(row.requestedFor) > now;

/**
 * Whether confirming sent the customer's LINE confirmation: confirm's answer says, or else the board's reloaded row.
 * undefined when neither does, such as when the row has left the view on screen.
 */
export const sentAfterConfirm = (
  answer: { appointment?: { confirmationSent?: unknown } } | undefined,
  rows: ReadonlyArray<{ reference: string; confirmationSent: boolean }> | null,
  reference: string
): boolean | undefined => {
  const fromAnswer = answer?.appointment?.confirmationSent;
  if (typeof fromAnswer === 'boolean') return fromAnswer;
  return rows?.find((row) => row.reference === reference)?.confirmationSent;
};

/**
 * The notice Confirm shows. Not knowing counts as not sent: Send again answers already_sent for a confirmation that
 * went out and was recorded.
 */
export const confirmedNotice = (reference: string, confirmationSent: boolean | undefined): { type: 'success' | 'warning'; message: string } =>
  confirmationSent
    ? { type: 'success', message: `Confirmed ${reference}. The customer's LINE confirmation was sent.` }
    : { type: 'warning', message: `Confirmed ${reference}. The LINE confirmation wasn't sent; use Send again.` };

/** What Send again's 200 answers say happened. */
export type SendAgainStatus = 'sent' | 'already_sent' | 'sent_unrecorded';

/** The notice Send again shows for a 200. Any other answer is an error, shown in the server's words. */
export const sendAgainNotice = (reference: string, status: SendAgainStatus): { type: 'success' | 'warning'; message: string } => {
  if (status === 'already_sent') return { type: 'success', message: `The LINE confirmation for ${reference} had already been sent.` };
  if (status === 'sent_unrecorded') {
    return {
      type: 'warning',
      message: `Sent the LINE confirmation for ${reference}, but it couldn't be recorded, so its row still says "not sent". Don't send it again.`,
    };
  }
  return { type: 'success', message: `Sent the LINE confirmation for ${reference}.` };
};

/**
 * Send again: a confirmed visit whose LINE column says "not sent", until the visit is over. Strapi sends no
 * confirmation for a visit that's over, as pending_confirmations lists none.
 */
export const canSendAgain = (row: BoardRow, now = Date.now()) =>
  row.status === 'confirmed' && !row.confirmationSent && Date.parse(row.requestedFor) >= now;
