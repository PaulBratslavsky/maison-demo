import { isAbortError } from './drafts';

/**
 * What staff read when a button that sends to a customer on LINE ends in a cancelled request. Strapi's fetch client cancels a component's requests when it
 * is removed, so staff who press Send on LINE and then leave the tab get the browser's words ("signal is aborted without reason"), and the send may well have
 * reached the server and LINE already. Those words in red invite a second send. This says what is true.
 */
export const SEND_MAY_HAVE_STOPPED = 'Leaving the tab may have stopped the send. Check the row before you send again.';

/** The notice for a send that failed: a warning for a cancelled request, and for any other failure the server's own words as a danger notice. */
export const sendFailureNotice = (error: unknown): { type: 'warning' | 'danger'; message: string } =>
  isAbortError(error) ? { type: 'warning', message: SEND_MAY_HAVE_STOPPED } : { type: 'danger', message: (error as Error).message };
