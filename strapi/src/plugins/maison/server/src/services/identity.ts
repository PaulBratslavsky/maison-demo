import type { Core } from '@strapi/strapi';

import { OAUTH_PLUGIN_ID } from '../constants';
import { authorizationOf, parseSubject } from '../domain/subject';

export interface HandlerExtra {
  requestInfo?: { headers?: Record<string, string | string[] | undefined> };
}

type SubjectResolver = { resolveSubject?: (authorization: string) => Promise<unknown> };

export default ({ strapi }: { strapi: Core.Strapi }) => ({
  /**
   * The verified LINE subject of the MCP caller, or null.
   * Tools see the caller's original Authorization header (Strapi builds tool-visible headers from the
   * raw request), and oauth-mcp-manager maps its session token to the grant's subject.
   */
  async getCustomerSubject(extra: HandlerExtra | undefined): Promise<string | null> {
    const authorization = authorizationOf(extra?.requestInfo?.headers);
    if (!authorization) return null;
    let oauth: SubjectResolver | undefined;
    try {
      oauth = strapi.plugin(OAUTH_PLUGIN_ID)?.service('oauth') as SubjectResolver | undefined;
    } catch {
      oauth = undefined;
    }
    if (typeof oauth?.resolveSubject !== 'function') return null;
    try {
      return parseSubject(await oauth.resolveSubject(authorization));
    } catch (error) {
      strapi.log.warn(`[maison] resolveSubject failed: ${(error as Error).message}`);
      return null;
    }
  },
});
