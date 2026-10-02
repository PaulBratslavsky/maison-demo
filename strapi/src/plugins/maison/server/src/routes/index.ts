import { ACTION } from '../constants';

/** Signed-in admins whose role holds `action`. Admin routes are served at /maison/<path>. */
const allow = (action: string) => [
  'admin::isAuthenticatedAdmin',
  { name: 'admin::hasPermissions', config: { actions: [action] } },
];

/**
 * Only a LINE customer session gets through, resolved the way the MCP tools resolve theirs. auth: false keeps
 * users-permissions from refusing that token first, so roles don't apply to these routes. A new object per route,
 * because Strapi writes into route configs as it registers them.
 */
const customerOnly = () => ({ auth: false as const, policies: ['plugin::maison.customer-session'] });

export default {
  admin: {
    type: 'admin',
    routes: [
      { method: 'GET', path: '/appointments', handler: 'appointments.list', config: { policies: allow(ACTION.appointmentsReview) } },
      // Ahead of every route that takes a :reference, so none of them can take "summary" for one.
      {
        method: 'GET',
        path: '/appointments/summary',
        handler: 'appointments.summary',
        config: { policies: allow(ACTION.appointmentsReview) },
      },
      {
        method: 'POST',
        path: '/appointments/:reference/confirm',
        handler: 'appointments.confirm',
        config: { policies: allow(ACTION.appointmentsConfirm) },
      },
      // The board's Send again: whoever may confirm a visit may send its LINE confirmation again.
      {
        method: 'POST',
        path: '/appointments/:reference/notify',
        handler: 'appointments.notify',
        config: { policies: allow(ACTION.appointmentsConfirm) },
      },
      { method: 'POST', path: '/demo/seed', handler: 'demo.seed', config: { policies: allow(ACTION.demoManage) } },
      { method: 'POST', path: '/demo/reset', handler: 'demo.reset', config: { policies: allow(ACTION.demoManage) } },
    ],
  },
  /**
   * The REST door, served at /api/maison/<path>. The catalog routes use Strapi's own content-API auth: a role or a
   * custom API token must hold the action, plugin::maison.<handler>, e.g. the Public role under Settings → Roles. Their
   * actions are named find and findOne, the only ones Strapi lets a read-only API token call.
   */
  'content-api': {
    type: 'content-api',
    routes: [
      { method: 'GET', path: '/collections', handler: 'collections.find' },
      { method: 'GET', path: '/products', handler: 'products.find' },
      { method: 'GET', path: '/products/:slug', handler: 'products.findOne' },
      { method: 'GET', path: '/boutiques', handler: 'boutiques.find' },
      { method: 'GET', path: '/knowledge', handler: 'knowledge.find' },
      { method: 'POST', path: '/appointments', handler: 'customer.requestAppointment', config: customerOnly() },
      { method: 'GET', path: '/my-appointments', handler: 'customer.myAppointments', config: customerOnly() },
    ],
  },
};
