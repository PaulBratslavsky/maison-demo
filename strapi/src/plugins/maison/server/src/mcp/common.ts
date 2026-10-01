import { toolError } from '../domain/tool-result';

export const notSignedIn = () =>
  toolError(
    'not_signed_in',
    'No signed-in LINE customer is attached to this session.',
    'Customer tools need a session from LINE sign-in. Ask the customer to open the app in LINE, or sign in again. Staff and admin tokens cannot act for a customer.'
  );
