import * as React from 'react';

import { Crown } from '@strapi/icons';
import { useRBAC } from '@strapi/strapi/admin';
import { useIntl } from 'react-intl';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTheme } from 'styled-components';

import type { DraftAccess } from '../../drafts';
import { PERMISSIONS } from '../../permissions';
import { PLUGIN_ID } from '../../pluginId';
import { attachHost, detachHost, updateHost } from './assistantHost';
import { claim, owner, release, subscribe } from './menuIconOwner';

/**
 * What the icon that owns the assistant does besides being an icon. It renders nothing. It keeps the host in place for as long as it is on the
 * screen, and tells the host what only Strapi's providers can say: the theme, the language, whether this admin may use the assistant, which drafts
 * they may use, and the router's `navigate`, which Use this draft needs to take them to the Maison page.
 *
 * `useRBAC` starts from "loading" with every flag false each time an icon is drawn, and Strapi draws the icon again on every change of address.
 * That is not an admin who lost the permission, so nothing is told to the host until the check has answered. The host keeps what it was told
 * last, and the chat stays.
 */
const AssistantFeed = () => {
  const { allowedActions, isLoading } = useRBAC(PERMISSIONS.assistantHost);
  const theme = useTheme();
  const { locale } = useIntl();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const allowed = allowedActions.canUse === true;
  const { canView, canReply, canRead, canAnswer } = allowedActions;
  // A new object for each change of the four flags, and not for each render: the host draws again for each thing it is told.
  const access = React.useMemo<DraftAccess>(
    () => ({ canView: canView === true, canReply: canReply === true, canRead: canRead === true, canAnswer: canAnswer === true }),
    [canView, canReply, canRead, canAnswer]
  );
  // Use this draft takes the admin to a tab of the Maison page. From another page that adds a history entry, so Back returns there. On the Maison page
  // already it replaces the current one, as a click on a tab does, so a run of drafts does not leave a run of entries that Back steps over.
  // Strapi's `navigate` is a new function after each change of address, and so is this one: Strapi draws a new icon then, which tells the host again.
  // The host keeps one function of its own that calls the latest, so the chat is not given a new function each time (assistantHost.tsx).
  const navigateRef = React.useRef({ navigate, onMaisonPage: pathname === `/plugins/${PLUGIN_ID}` });
  navigateRef.current = { navigate, onMaisonPage: pathname === `/plugins/${PLUGIN_ID}` };
  const go = React.useCallback((to: string) => navigateRef.current.navigate(to, { replace: navigateRef.current.onMaisonPage }), []);

  React.useEffect(() => {
    attachHost();
    return detachHost;
  }, []);

  React.useEffect(() => {
    if (!isLoading) updateHost({ allowed, theme, locale, access, navigate: go });
  }, [isLoading, allowed, theme, locale, access, go]);

  return null;
};

/**
 * Maison's menu icon: the Crown, as Strapi draws it today, and the way the assistant gets onto every admin page. Strapi draws a menu link's
 * icon on every signed-in page, in the left menu and again in the mobile menu while that is open, so the icon can be on the screen more than
 * once. It claims when it mounts and releases when it unmounts (menuIconOwner.ts), and only the owner, the oldest icon, renders the feed above.
 * So there is one assistant however many icons are drawn, and when the owner goes the next takes over. What the assistant is, and why the
 * icon does not hold it, is in assistantHost.tsx.
 *
 * The props are the ones Strapi gives its icons (`width`, `height` and `fill`, and the accessible icon's `aria-hidden` and `focusable`), and go
 * to the Crown as they come, so the menu looks as it did.
 */
export const MaisonMenuIcon = (props: Omit<React.ComponentProps<typeof Crown>, 'ref'>) => {
  const id = React.useId();
  const current = React.useSyncExternalStore(subscribe, owner, owner);

  React.useEffect(() => {
    claim(id);
    return () => release(id);
  }, [id]);

  return (
    <>
      <Crown {...props} />
      {current === id && <AssistantFeed />}
    </>
  );
};
