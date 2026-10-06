import type { Core } from '@strapi/strapi';

export default ({ strapi }: { strapi: Core.Strapi }) => ({
  async seed(ctx) {
    ctx.body = await strapi.plugin('maison').service('seed').loadDemoCatalog();
  },
  async reset(ctx) {
    ctx.body = await strapi.plugin('maison').service('seed').resetDemoAppointments();
  },
  /** Load demo activity: what it added, or all zeros when it was there already. A catalog that isn't loaded is a 404 that says so. */
  async activity(ctx) {
    const result = await strapi.plugin('maison').service('seed').loadDemoActivity();
    if (result.ok === false) {
      const { code, message, hint } = result;
      return code === 'not_found' ? ctx.notFound(message, { code, hint }) : ctx.badRequest(message, { code, hint });
    }
    ctx.body = result.value;
  },
});
