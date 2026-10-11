// @vitest-environment jsdom
import { lightTheme } from '@strapi/design-system';
import { act, cleanup, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { attachHost, destroyHost, updateHost } from '../../admin/src/components/assistant/assistantHost';
import { NO_DRAFT_ACCESS, type DraftAccess } from '../../admin/src/drafts';
import './render';

/*
 * What the host gives the chat. Strapi draws a new menu icon on every change of address, and each icon tells the host again. The chat is drawn again
 * with each telling, so what it is given must be the same objects while nothing changed, or every message of the chat would be drawn again with it:
 * a context that gets a new value goes past the messages' memo.
 */
const seen = vi.hoisted(() => ({ calls: [] as Array<{ access: DraftAccess; navigate?: (to: string) => void }> }));
vi.mock('../../admin/src/components/assistant/GlobalAssistant', () => ({
  GlobalAssistant: (props: { access: DraftAccess; navigate?: (to: string) => void }) => {
    seen.calls.push(props);
    return null;
  },
}));

const MAY_REPLY: DraftAccess = { canView: true, canReply: true, canRead: false, canAnswer: false };
const allowed = { allowed: true, theme: lightTheme, locale: 'en' };
const last = () => seen.calls[seen.calls.length - 1];

afterEach(() => {
  cleanup();
  destroyHost();
  seen.calls.length = 0;
});

const drawn = async (count: number) => waitFor(() => expect(seen.calls.length).toBeGreaterThanOrEqual(count));

describe('what the host gives the chat', () => {
  it('gives the same access object while the four flags are the same, and a new one when a flag changes', async () => {
    attachHost();
    act(() => updateHost({ ...allowed, access: { ...MAY_REPLY } }));
    await drawn(1);
    const first = last().access;

    act(() => updateHost({ ...allowed, access: { ...MAY_REPLY } }));
    await drawn(2);
    expect(last().access).toBe(first);

    act(() => updateHost({ ...allowed, access: { ...MAY_REPLY, canRead: true } }));
    await drawn(3);
    expect(last().access).not.toBe(first);
    expect(last().access).toEqual({ ...MAY_REPLY, canRead: true });
  });

  it('gives the same navigate function each time, and it calls the router function of the icon that told the host last', async () => {
    const firstIcon = vi.fn();
    const secondIcon = vi.fn();
    attachHost();
    act(() => updateHost({ ...allowed, access: MAY_REPLY, navigate: firstIcon }));
    await drawn(1);
    const navigate = last().navigate as (to: string) => void;

    act(() => updateHost({ ...allowed, access: MAY_REPLY, navigate: secondIcon }));
    await drawn(2);
    expect(last().navigate).toBe(navigate);

    navigate('/plugins/maison?tab=inquiries');
    expect(firstIcon).not.toHaveBeenCalled();
    expect(secondIcon).toHaveBeenCalledExactlyOnceWith('/plugins/maison?tab=inquiries');
  });

  it('gives no navigate until the icon gives one, and no access means no draft may be used', async () => {
    attachHost();
    act(() => updateHost(allowed));
    await drawn(1);
    expect(last().navigate).toBeUndefined();
    expect(last().access).toEqual(NO_DRAFT_ACCESS);
  });

  it('forgets the icon when the host is removed: the next host starts with none', async () => {
    attachHost();
    act(() => updateHost({ ...allowed, access: MAY_REPLY, navigate: vi.fn() }));
    await drawn(1);
    destroyHost();
    seen.calls.length = 0;

    attachHost();
    act(() => updateHost(allowed));
    await drawn(1);
    expect(last().navigate).toBeUndefined();
    expect(last().access).toEqual(NO_DRAFT_ACCESS);
  });
});
