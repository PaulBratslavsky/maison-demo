import type { Core } from '@strapi/strapi';

export default ({ strapi }: { strapi: Core.Strapi }) => ({
  async seed(ctx) {
    ctx.body = await strapi.plugin('maison').service('seed').loadDemoCatalog();
  },
  async reset(ctx) {
    ctx.body = await strapi.plugin('maison').service('seed').resetDemoAppointments();
  },
});
