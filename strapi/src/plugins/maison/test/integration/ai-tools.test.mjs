import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { SUBJECT_A, bootStrapi } from './harness.mjs';

describe('ai-tools for the in-admin chat', () => {
  let strapi;
  let tools;
  let reference;
  /** Everything a chat tool returned in this file, as JSON, for the last test to scan. */
  const outputs = [];
  const tool = (name) => {
    const chatTool = tools.find((candidate) => candidate.name === name);
    return {
      ...chatTool,
      async execute(...args) {
        const result = await chatTool.execute(...args);
        outputs.push(JSON.stringify(result));
        return result;
      },
    };
  };

  before(async () => {
    strapi = await bootStrapi('ai-tools');
    await strapi.plugin('maison').service('seed').loadDemoCatalog();
    // confirm_appointment uses the real clock, so the visit is years ahead.
    const requested = await strapi.plugin('maison').service('appointments').request({
      subject: SUBJECT_A, boutique: 'ginza', productSlugs: ['weekender-50'], requestedFor: '2030-01-12T14:00:00+09:00', createdVia: 'concierge',
    });
    reference = requested.value.reference;
    // The same lookup strapi-plugin-tanstack-ai makes for every installed plugin.
    tools = strapi.plugin('maison').service('ai-tools').getTools();
  });

  after(async () => {
    await strapi?.destroy();
  });

  it('declares only permission actions that Strapi has registered', () => {
    // The chat skips a tool whose action isn't registered, without an error.
    const { actionProvider } = strapi.service('admin::permission');
    for (const { name, action } of tools) assert.ok(actionProvider.get(action), `${name} needs ${action}`);
  });

  it('answers the demo question through search_products', async () => {
    const result = await tool('search_products').execute({ occasion: 'travel', maxPriceJpy: 400000, inStockAt: 'ginza', locale: 'en' }, strapi);
    assert.deepEqual(result.products.map((p) => p.slug), ['weekender-50', 'garment-carrier', 'watch-roll-trois', 'passport-cover', 'luggage-tag-duo']);
    assert.equal(result.products[0].name, 'Weekender 50');
  });

  it('lists requests for staff through appointment_requests, with the customer masked', async () => {
    // status "all", so the result doesn't depend on whether the next test has confirmed the request yet.
    const { appointments } = await tool('appointment_requests').execute({ status: 'all' }, strapi);
    const mine = appointments.find((appointment) => appointment.reference === reference);
    assert.ok(mine, `${reference} is listed`);
    assert.equal(mine.customer, 'line:Uaaa…aa');
  });

  it('confirms a request through confirm_appointment, once', async () => {
    const first = await tool('confirm_appointment').execute({ reference }, strapi);
    assert.equal(first.alreadyConfirmed, false);
    assert.equal(first.appointment.reference, reference);
    assert.equal(first.appointment.status, 'confirmed');
    assert.equal(first.appointment.customer, 'line:Uaaa…aa');
    assert.equal(await strapi.documents('plugin::maison.appointment').count({ status: 'published', filters: { reference } }), 1);

    const again = await tool('confirm_appointment').execute({ reference }, strapi);
    assert.equal(again.alreadyConfirmed, true);
  });

  it('returns expected failures as { error } for the model to read', async () => {
    const result = await tool('confirm_appointment').execute({ reference: 'APT-0000' }, strapi);
    assert.equal(result.error.code, 'not_found');
    assert.match(result.error.hint, /appointment_requests/);
  });

  // Last: it scans what the tests above got back from the chat tools.
  it('never puts a full LINE user ID in anything a chat tool returned', () => {
    assert.ok(outputs.some((output) => output.includes('line:Uaaa…aa')), 'the scan saw output that names a customer');
    for (const output of outputs) assert.doesNotMatch(output, /U[0-9a-f]{32}/);
  });
});
