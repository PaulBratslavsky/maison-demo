import { ACTION } from '../constants';

/** Signed-in admins whose role holds `action`. Admin routes are served at /maison/<path>. */
const allow = (action: string) => [
  'admin::isAuthenticatedAdmin',
  { name: 'admin::hasPermissions', config: { actions: [action] } },
];

export default {
  admin: {
    type: 'admin',
    routes: [
      { method: 'GET', path: '/appointments', handler: 'appointments.list', config: { policies: allow(ACTION.appointmentsReview) } },
      {
        method: 'POST',
        path: '/appointments/:reference/confirm',
        handler: 'appointments.confirm',
        config: { policies: allow(ACTION.appointmentsConfirm) },
      },
      { method: 'POST', path: '/demo/seed', handler: 'demo.seed', config: { policies: allow(ACTION.demoManage) } },
      { method: 'POST', path: '/demo/reset', handler: 'demo.reset', config: { policies: allow(ACTION.demoManage) } },
    ],
  },
};
