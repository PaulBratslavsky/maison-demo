import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { SUBJECT_A, bootStrapi } from './harness.mjs';

describe('seed service', () => {
  let strapi;
  let seed;
  before(async () => {
    strapi = await bootStrapi('seed');
    seed = strapi.plugin('maison').service('seed');
  });
  after(async () => {
    await strapi?.destroy();
  });

  it('loads the catalog in ja and en, published', async () => {
    assert.deepEqual(await seed.loadDemoCatalog(), { created: true, collections: 3, products: 12, boutiques: 3, stockLevels: 36 });
    for (const locale of ['ja', 'en']) {
      assert.equal(await strapi.documents('plugin::maison.product').count({ locale, status: 'published' }), 12, `12 ${locale} products`);
      assert.equal(await strapi.documents('plugin::maison.boutique').count({ locale, status: 'published' }), 3, `3 ${locale} boutiques`);
    }
    const weekender = await strapi.documents('plugin::maison.product').findFirst({
      locale: 'en', status: 'published', filters: { slug: 'weekender-50' }, populate: { images: true, collection: true },
    });
    assert.equal(weekender.name, 'Weekender 50');
    assert.equal(weekender.collection?.slug, 'voyage');
    assert.equal(weekender.images?.length, 1);
  });

  it('does nothing the second time', async () => {
    assert.deepEqual(await seed.loadDemoCatalog(), { created: false, collections: 0, products: 0, boutiques: 0, stockLevels: 0 });
  });

  it('reset removes appointments and notifications and keeps the catalog', async () => {
    const boutique = await strapi.documents('plugin::maison.boutique').findFirst({ locale: 'ja', status: 'published', filters: { slug: 'ginza' } });
    await strapi.documents('plugin::maison.appointment').create({
      data: { reference: 'APT-9001', customer: SUBJECT_A, requestedFor: '2026-10-10T05:00:00.000Z', boutique: { documentId: boutique.documentId, locale: 'ja' } },
    });
    assert.deepEqual(await seed.resetDemoAppointments(), { appointments: 1, notifications: 0 });
    assert.equal(await strapi.documents('plugin::maison.product').count({ locale: 'ja', status: 'published' }), 12);
  });
});
