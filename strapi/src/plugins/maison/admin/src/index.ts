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

    app.registerPlugin({ id: PLUGIN_ID, name: 'Maison' });
  },
};
