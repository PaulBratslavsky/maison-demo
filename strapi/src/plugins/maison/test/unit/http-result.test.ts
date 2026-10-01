import { describe, expect, it } from 'vitest';
import { httpError, httpStatus } from '../../server/src/domain/http-result';
import type { ErrorCode } from '../../server/src/domain/tool-result';

describe('httpStatus', () => {
  it.each<[ErrorCode, number]>([
    ['invalid_input', 400],
    ['not_signed_in', 401],
    ['not_found', 404],
    // 409: the same request can succeed later, once the boutique's hours, the customer's open requests or a
    // confirmation change. 422: it can't succeed as sent, because time only moves forward.
    ['boutique_closed', 409],
    ['too_many_open_requests', 409],
    ['not_published', 409],
    ['in_the_past', 422],
    ['not_configured', 503],
    // A server fault while checking a customer's session: try again, it isn't a sign-out.
    ['temporarily_unavailable', 503],
  ])('answers %s with %i', (code, status) => {
    expect(httpStatus(code)).toBe(status);
  });
});

describe('httpError', () => {
  it('carries the code, message and hint the MCP tool would return, with the matching status', () => {
    expect(httpError('not_found', 'No published product "x".', 'Call search_products to find valid product slugs.')).toEqual({
      status: 404,
      body: { error: { code: 'not_found', message: 'No published product "x".', hint: 'Call search_products to find valid product slugs.' } },
    });
  });

  it('leaves the hint out when there is none', () => {
    expect(httpError('invalid_input', 'date: Not a real calendar date.')).toEqual({
      status: 400,
      body: { error: { code: 'invalid_input', message: 'date: Not a real calendar date.' } },
    });
  });
});
