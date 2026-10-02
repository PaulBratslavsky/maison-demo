import type { Core } from '@strapi/strapi';

import { getConfig } from './config';
import { PLUGIN_ID } from './constants';
import { answerCustomerSessionErrors } from './policies/customer-session';

const ACTIONS = [
  { uid: 'catalog.read', displayName: 'MCP: browse the catalog', subCategory: 'mcp' },
  { uid: 'appointments.request', displayName: 'MCP: request and view own appointments', subCategory: 'mcp' },
  { uid: 'appointments.review', displayName: 'MCP: review appointment requests', subCategory: 'mcp' },
  { uid: 'appointments.confirm', displayName: 'MCP: confirm appointment requests', subCategory: 'mcp' },
  { uid: 'confirmations.send', displayName: 'MCP: send appointment confirmations', subCategory: 'mcp' },
  { uid: 'questions.ask', displayName: 'MCP: hand questions to staff', subCategory: 'mcp' },
  { uid: 'questions.read', displayName: 'Read customer questions', subCategory: 'questions' },
  { uid: 'questions.answer', displayName: 'Answer customer questions on LINE', subCategory: 'questions' },
  { uid: 'demo.manage', displayName: 'Load and reset demo data', subCategory: 'demo' },
];

/** Actions must be registered in bootstrap (registerMany throws once Strapi is loaded). */
const bootstrap = async ({ strapi }: { strapi: Core.Strapi }) => {
  await strapi
    .service('admin::permission')
    .actionProvider.registerMany(ACTIONS.map((action) => ({ section: 'plugins', pluginName: PLUGIN_ID, ...action })));

  // Strapi has added its global middlewares by now and mounts the routes after every bootstrap, so this sits
  // inside its error middleware and around the customer routes' policy.
  strapi.server.use(answerCustomerSessionErrors);

  if (!getConfig(strapi).liffUrl) {
    strapi.log.warn('[maison] config.liffUrl is not set, so pending_confirmations will return not_configured.');
  }
};

export default bootstrap;
