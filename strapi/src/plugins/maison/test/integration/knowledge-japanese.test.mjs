import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';

import { SUBJECT_A, bootStrapi } from './harness.mjs';

const KNOWLEDGE = 'plugin::maison.knowledge';
const QUESTION = 'plugin::maison.question';
const seed = JSON.parse(readFileSync(new URL('../../server/seed/knowledge.json', import.meta.url), 'utf8')).entries;
const catalogThere = { created: false, collections: 0, products: 0, boutiques: 0, stockLevels: 0 };

/** Every knowledge document's version in `locale`, published or draft. */
const versions = (strapi, locale, status) => strapi.documents(KNOWLEDGE).findMany({ locale, status, limit: 100 });

/** The fields that make an entry what it is, and when it was last saved and published. */
const asSaved = ({ documentId, title, answer, keywords, category, productSlugs, updatedAt, publishedAt }) => ({
  documentId, title, answer, keywords, category, productSlugs, updatedAt: String(updatedAt), publishedAt: String(publishedAt),
});
const byDocument = (a, b) => a.documentId.localeCompare(b.documentId);

describe('product knowledge in Japanese', () => {
  let strapi;
  let seedService;
  let catalog;
  before(async () => {
    strapi = await bootStrapi('knowledge-japanese');
    seedService = strapi.plugin('maison').service('seed');
    catalog = strapi.plugin('maison').service('catalog');
  });
  after(async () => {
    await strapi?.destroy();
  });

  it('Load demo catalog publishes all 16 entries in English and in Japanese, as two versions of each document', async () => {
    assert.deepEqual(await seedService.loadDemoCatalog(), {
      created: true, collections: 3, products: 12, boutiques: 3, stockLevels: 36, knowledge: 16, knowledgeJa: 16,
    });
    const en = await versions(strapi, 'en', 'published');
    const ja = await versions(strapi, 'ja', 'published');
    assert.equal(en.length, 16);
    assert.equal(ja.length, 16);
    for (const entry of seed) {
      const english = en.find((doc) => doc.title === entry.title);
      assert.ok(english, `${entry.title}: no published English version`);
      const japanese = ja.find((doc) => doc.documentId === english.documentId);
      assert.ok(japanese, `${entry.title}: no published Japanese version`);
      assert.deepEqual({ title: japanese.title, answer: japanese.answer, keywords: japanese.keywords }, entry.ja);
      // The category and the products are shared by every locale.
      assert.equal(japanese.category, entry.category);
      assert.deepEqual(japanese.productSlugs, entry.productSlugs);
    }
  });

  it("search_knowledge in ja answers the leather care question with the leather care entry's Japanese answer", async () => {
    const leather = seed.find((entry) => entry.title === 'How do I care for the leather?');
    const result = await catalog.searchKnowledge('ja', { query: '革のお手入れ方法を教えてください' });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.value.entries[0].title, leather.ja.title);
    assert.equal(result.value.entries[0].answer, leather.ja.answer);
  });

  it('adds nothing when pressed again', async () => {
    assert.deepEqual(await seedService.loadDemoCatalog(), { ...catalogThere, knowledge: 0, knowledgeJa: 0 });
    assert.equal(await strapi.documents(KNOWLEDGE).count({ locale: 'en' }), 16);
    assert.equal(await strapi.documents(KNOWLEDGE).count({ locale: 'ja' }), 16);
  });

  it('adds exactly the 16 Japanese versions to a Strapi that has only the English entries, and leaves the English ones as they were', async () => {
    // Start over as Strapi Cloud has it: the English entries as the loader made them before, created and published in en.
    for (const { documentId } of await versions(strapi, 'en')) await strapi.documents(KNOWLEDGE).delete({ documentId, locale: '*' });
    for (const { ja: _ja, ...english } of seed) {
      const { documentId } = await strapi.documents(KNOWLEDGE).create({ locale: 'en', data: english });
      await strapi.documents(KNOWLEDGE).publish({ documentId, locale: 'en' });
    }
    assert.equal(await strapi.documents(KNOWLEDGE).count({ locale: 'ja' }), 0);
    const before = {
      draft: (await versions(strapi, 'en', 'draft')).map(asSaved).sort(byDocument),
      published: (await versions(strapi, 'en', 'published')).map(asSaved).sort(byDocument),
    };

    assert.deepEqual(await seedService.loadDemoCatalog(), { ...catalogThere, knowledge: 0, knowledgeJa: 16 });

    const ja = await versions(strapi, 'ja', 'published');
    assert.equal(ja.length, 16);
    assert.deepEqual(ja.map((doc) => doc.documentId).sort(), before.published.map((doc) => doc.documentId).sort());
    assert.deepEqual((await versions(strapi, 'en', 'draft')).map(asSaved).sort(byDocument), before.draft);
    assert.deepEqual((await versions(strapi, 'en', 'published')).map(asSaved).sort(byDocument), before.published);
  });

  it('Reset demo activity keeps the seeded product knowledge in both languages, and deletes the entry a staff answer added', async () => {
    const { documentId: answered } = await strapi.documents(KNOWLEDGE).create({
      locale: 'ja', data: { title: '日曜日は営業していますか？', answer: 'はい、営業しております。', category: 'store', productSlugs: [], keywords: '' },
    });
    await strapi.documents(KNOWLEDGE).publish({ documentId: answered, locale: 'ja' });
    await strapi.documents(QUESTION).create({
      data: { reference: 'Q-9001', customer: SUBJECT_A, question: '日曜日は営業していますか？', language: 'ja', status: 'answered', knowledgeDocumentId: answered },
    });

    assert.deepEqual(await seedService.resetDemoAppointments(), { appointments: 0, notifications: 0, questions: 1, inquiries: 0, knowledge: 1 });

    assert.equal((await versions(strapi, 'en', 'published')).length, 16);
    assert.equal((await versions(strapi, 'ja', 'published')).length, 16);
    assert.equal(await strapi.documents(KNOWLEDGE).count({ locale: 'ja', filters: { documentId: answered } }), 0);
  });

  it('skips an entry whose English title staff changed, never touches an entry a staff answer added, and adds the rest', async () => {
    const en = await versions(strapi, 'en', 'published');
    const documentOf = (title) => en.find((doc) => doc.title === title).documentId;
    const leather = documentOf('How do I care for the leather?');
    const gift = documentOf('Do you gift wrap?');
    const returns = documentOf('Can I return or exchange a piece?');

    // Staff renamed the leather care entry, which has no Japanese version.
    await strapi.documents(KNOWLEDGE).delete({ documentId: leather, locale: 'ja' });
    await strapi.documents(KNOWLEDGE).update({ documentId: leather, locale: 'en', data: { title: 'Leather care' } });
    await strapi.documents(KNOWLEDGE).publish({ documentId: leather, locale: 'en' });
    // The gift wrap entry is gone, and a staff answer to an English question added one with its title.
    await strapi.documents(KNOWLEDGE).delete({ documentId: gift, locale: '*' });
    const { documentId: answered } = await strapi.documents(KNOWLEDGE).create({
      locale: 'en', data: { title: 'Do you gift wrap?', answer: 'Yes, in a Maison box.', category: 'gifting', productSlugs: [], keywords: '' },
    });
    await strapi.documents(KNOWLEDGE).publish({ documentId: answered, locale: 'en' });
    await strapi.documents(QUESTION).create({
      data: { reference: 'Q-9002', customer: SUBJECT_A, question: 'Do you gift wrap?', language: 'en', status: 'answered', knowledgeDocumentId: answered },
    });
    // The returns entry has lost its Japanese version.
    await strapi.documents(KNOWLEDGE).delete({ documentId: returns, locale: 'ja' });

    assert.deepEqual(await seedService.loadDemoCatalog(), { ...catalogThere, knowledge: 0, knowledgeJa: 1 });

    const withJapanese = new Set((await versions(strapi, 'ja')).map((doc) => doc.documentId));
    assert.equal(withJapanese.has(returns), true, 'the returns entry gets its Japanese version back');
    assert.equal(withJapanese.has(leather), false, 'the renamed entry is skipped');
    assert.equal(withJapanese.has(answered), false, "the staff answer's entry is never touched");
    const answer = await strapi.documents(KNOWLEDGE).findOne({ documentId: answered, locale: 'en' });
    assert.equal(answer.answer, 'Yes, in a Maison box.');
  });
});
