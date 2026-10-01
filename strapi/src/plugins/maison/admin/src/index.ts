import { Crown } from '@strapi/icons';
import type { StrapiApp } from '@strapi/strapi/admin';

import { PERMISSIONS } from './permissions';
import { PLUGIN_ID } from './pluginId';

export default {
  register(app: StrapiApp) {
    app.addMenuLink({
      to: `plugins/${PLUGIN_ID}`,
      icon: Crown,
      intlLabel: { id: `${PLUGIN_ID}.plugin.name`, defaultMessage: 'Maison' },
      Component: () => import('./pages/MaisonPage'),
      permissions: PERMISSIONS.page,
    });

    // The Homepage widget (plugin::maison.requests), shown to admins who can review requests. Its link is an absolute
    // path, as Strapi's own widgets write theirs: the router adds the admin's base path. The menu link above is the
    // other way round, and takes no leading slash.
    app.widgets.register({
      id: 'requests',
      pluginId: PLUGIN_ID,
      icon: Crown,
      title: { id: `${PLUGIN_ID}.widget.requests.title`, defaultMessage: 'Maison requests' },
      link: { label: { id: `${PLUGIN_ID}.widget.requests.link`, defaultMessage: 'Open the board' }, href: `/plugins/${PLUGIN_ID}` },
      permissions: PERMISSIONS.widget,
      component: async () => (await import('./components/RequestsWidget')).default,
    });

    app.registerPlugin({ id: PLUGIN_ID, name: 'Maison' });
  },
};
