import { describe, expect, it, vi } from 'vitest';
import identityService from '../../server/src/services/identity';
import { extraWith, fakeStrapi } from './fake-strapi';

const VALID = `line:U${'4af4980629c1a7b3f1e2d3c4b5a69788'}`;
const withResolver = (resolveSubject: (auth: string) => Promise<unknown>) =>
  identityService({ strapi: fakeStrapi({ plugins: { 'strapi-oauth-mcp-manager': { oauth: { resolveSubject } } } }) });

describe('identity.getCustomerSubject', () => {
  it('returns the subject oauth-mcp-manager resolves from the raw Authorization header', async () => {
    const resolveSubject = vi.fn(async () => VALID);
    const subject = await withResolver(resolveSubject).getCustomerSubject(extraWith({ authorization: 'Bearer mcp_at_x' }));
    expect(subject).toBe(VALID);
    expect(resolveSubject).toHaveBeenCalledWith('Bearer mcp_at_x');
  });

  it.each([
    ['uppercase hex', `line:U${'4AF4980629C1A7B3F1E2D3C4B5A69788'}`],
    ['no line: prefix', 'U4af4980629c1a7b3f1e2d3c4b5a69788'],
    ['null for a staff or admin token', null],
  ])('treats a resolver result with %s as not signed in', async (_label, value) => {
    expect(await withResolver(async () => value).getCustomerSubject(extraWith({ authorization: 'Bearer t' }))).toBeNull();
  });

  it('returns null without calling the resolver when the header is missing or repeated', async () => {
    const resolveSubject = vi.fn(async () => VALID);
    const service = withResolver(resolveSubject);
    expect(await service.getCustomerSubject(undefined)).toBeNull();
    expect(await service.getCustomerSubject(extraWith({}))).toBeNull();
    expect(await service.getCustomerSubject(extraWith({ authorization: ['Bearer a', 'Bearer b'] }))).toBeNull();
    expect(resolveSubject).not.toHaveBeenCalled();
  });

  it('returns null when oauth-mcp-manager is not installed or has no resolveSubject', async () => {
    expect(await identityService({ strapi: fakeStrapi() }).getCustomerSubject(extraWith({ authorization: 'Bearer t' }))).toBeNull();
    const old = identityService({ strapi: fakeStrapi({ plugins: { 'strapi-oauth-mcp-manager': { oauth: {} } } }) });
    expect(await old.getCustomerSubject(extraWith({ authorization: 'Bearer t' }))).toBeNull();
  });

  it('returns null and logs when the resolver throws', async () => {
    const strapi = fakeStrapi({ plugins: { 'strapi-oauth-mcp-manager': { oauth: { resolveSubject: async () => { throw new Error('db down'); } } } } });
    expect(await identityService({ strapi }).getCustomerSubject(extraWith({ authorization: 'Bearer t' }))).toBeNull();
    expect(strapi.log.warn).toHaveBeenCalled();
  });
});
