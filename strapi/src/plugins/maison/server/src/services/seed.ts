import { stat } from 'node:fs/promises';
import path from 'node:path';
import type { Core } from '@strapi/strapi';

import content from '../../seed/content.json';
import knowledge from '../../seed/knowledge.json';
import { UID } from '../constants';
import { englishData, japaneseToAdd, type SeedKnowledgeEntry } from '../domain/knowledge-seed';
import type { ServiceResult } from '../domain/service-result';
import { loadDemoActivity, type ActivityResult } from './demo-activity';

type Localized = { ja: string; en: string };
const paragraph = (text: string) => [{ type: 'paragraph', children: [{ type: 'text', text }] }];

/** How many documents the reset reads at a time. */
const RESET_READ = 5000;

/** The most documents a read for the seeded product knowledge answers: many more than its 16 entries could match. */
const KNOWLEDGE_READ = 1000;

/** At runtime this file is bundled into dist/server/index.js, so the package root is two levels up. */
const seedDir = () => path.resolve(__dirname, '..', '..', 'server', 'seed');

const IMAGE_MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

/** The upload type of a seed image, from its file name's extension. Throws for any other extension. */
export const imageMimeType = (fileName: string): string => {
  const mimeType = IMAGE_MIME_TYPES[path.extname(fileName).toLowerCase()];
  if (!mimeType) {
    throw new Error(`Unsupported seed image "${fileName}": use a file ending in ${Object.keys(IMAGE_MIME_TYPES).join(', ')}.`);
  }
  return mimeType;
};

/**
 * What Load demo catalog did: the catalog it created (all zeros when it was there already), and the product knowledge it
 * added: `knowledge` English entries, and `knowledgeJa` Japanese versions of English entries.
 */
export interface SeedResult {
  created: boolean;
  collections: number;
  products: number;
  boutiques: number;
  stockLevels: number;
  knowledge: number;
  knowledgeJa: number;
}

/** The seeded product knowledge, in English with each entry's Japanese version. */
const seedKnowledge: SeedKnowledgeEntry[] = knowledge.entries;

export default ({ strapi }: { strapi: Core.Strapi }) => {
  const uploadImage = async (fileName: string, alternativeText: string): Promise<number> => {
    const filepath = path.join(seedDir(), 'images', fileName);
    const { size } = await stat(filepath);
    const [file] = await strapi.plugin('upload').service('upload').upload({
      data: { fileInfo: { name: fileName, alternativeText } },
      files: { filepath, originalFilename: fileName, mimetype: imageMimeType(fileName), size },
    });
    return file.id;
  };

  const ensureLocales = async () => {
    const locales = strapi.plugin('i18n').service('locales');
    for (const locale of content.locales) {
      if (!(await locales.findByCode(locale.code))) await locales.create({ code: locale.code, name: locale.name });
    }
  };

  /** Creates the ja version, adds the en localization, then publishes both. */
  const createLocalized = async (uid: string, ja: Record<string, unknown>, en: Record<string, unknown>) => {
    const { documentId } = await strapi.documents(uid as any).create({ locale: 'ja', data: ja });
    await strapi.documents(uid as any).update({ documentId, locale: 'en', data: en });
    await strapi.documents(uid as any).publish({ documentId, locale: '*' });
    return documentId as string;
  };

  const pick = (value: Localized, locale: 'ja' | 'en') => value[locale];

  const loadCatalog = async (): Promise<Omit<SeedResult, 'knowledge' | 'knowledgeJa'>> => {
    const existing = await strapi.documents(UID.collection).findFirst({
      locale: 'ja',
      filters: { slug: { $eq: content.collections[0].slug } },
    });
    if (existing) return { created: false, collections: 0, products: 0, boutiques: 0, stockLevels: 0 };

    for (const b of content.boutiques) {
      const image = await uploadImage(b.image, b.name.en);
      const version = (locale: 'ja' | 'en') => ({
        name: pick(b.name, locale), slug: b.slug, city: pick(b.city, locale), address: pick(b.address, locale),
        openingHours: b.openingHours, image,
      });
      await createLocalized(UID.boutique, version('ja'), version('en'));
    }

    const collectionIds: Record<string, string> = {};
    for (const c of content.collections) {
      const heroImage = await uploadImage(c.image, c.name.en);
      const version = (locale: 'ja' | 'en') => ({ name: pick(c.name, locale), slug: c.slug, story: paragraph(pick(c.story, locale)), heroImage });
      collectionIds[c.slug] = await createLocalized(UID.collection, version('ja'), version('en'));
    }

    for (const p of content.products) {
      const images = [await uploadImage(p.image, p.name.en)];
      const [widthCm, heightCm, depthCm] = p.dimensionsCm;
      const version = (locale: 'ja' | 'en') => ({
        name: pick(p.name, locale), slug: p.slug, sku: p.sku, category: p.category, priceJpy: p.priceJpy, images,
        widthCm, heightCm, depthCm, personalizable: p.personalizable, personalizationKinds: p.personalizationKinds,
        personalizationLeadDays: p.personalizationLeadDays, giftOccasions: p.giftOccasions,
        description: paragraph(pick(p.description, locale)), craftStory: pick(p.craftStory, locale),
        collection: collectionIds[p.collection],
      });
      await createLocalized(UID.product, version('ja'), version('en'));
    }

    let stockLevels = 0;
    for (const [productSlug, perBoutique] of Object.entries(content.stock)) {
      for (const [boutiqueSlug, quantity] of Object.entries(perBoutique)) {
        await strapi.documents(UID.stockLevel).create({ data: { productSlug, boutiqueSlug, quantity } });
        stockLevels += 1;
      }
    }

    return {
      created: true,
      collections: content.collections.length,
      products: content.products.length,
      boutiques: content.boutiques.length,
      stockLevels,
    };
  };

  /**
   * Maison's product knowledge in English: one published en document per entry. It loads when there's no en entry yet,
   * whether or not the catalog was there before, so a Strapi that loaded the catalog earlier gets it too. Returns how
   * many it added.
   */
  const loadEnglishKnowledge = async (): Promise<number> => {
    if ((await strapi.documents(UID.knowledge).count({ locale: 'en' })) > 0) return 0;
    for (const entry of seedKnowledge) {
      const { documentId } = await strapi.documents(UID.knowledge).create({ locale: 'en', data: englishData(entry) });
      await strapi.documents(UID.knowledge).publish({ documentId, locale: 'en' });
    }
    return seedKnowledge.length;
  };

  /**
   * The Japanese version of each seeded entry, on the English document with the entry's title, published in ja: only
   * where that document has none yet (japaneseToAdd has the rules). Returns how many it added.
   *
   * In Strapi 5's Document Service, update() with a locale the document doesn't have yet creates that locale's version,
   * with the fields every locale shares copied from an existing one (@strapi/core's document-service repository, and
   * docs.strapi.io's REST API locale page: "Create a new, or update an existing, locale version"). publish() with that
   * locale publishes only that version.
   */
  const loadJapaneseKnowledge = async (): Promise<number> => {
    const english = (await strapi.documents(UID.knowledge).findMany({
      locale: 'en',
      filters: { title: { $in: seedKnowledge.map((entry) => entry.title) } },
      fields: ['documentId', 'title'],
      limit: KNOWLEDGE_READ,
    })) as Array<{ documentId: string; title?: string | null }>;
    if (english.length === 0) return 0;
    const documentIds = english.map(({ documentId }) => documentId);
    const japanese = (await strapi.documents(UID.knowledge).findMany({
      locale: 'ja',
      filters: { documentId: { $in: documentIds } },
      fields: ['documentId'],
      limit: KNOWLEDGE_READ,
    })) as Array<{ documentId: string }>;
    const answers = (await strapi.documents(UID.question).findMany({
      filters: { knowledgeDocumentId: { $in: documentIds } },
      fields: ['knowledgeDocumentId'],
      limit: KNOWLEDGE_READ,
    })) as Array<{ knowledgeDocumentId?: string | null }>;

    const toAdd = japaneseToAdd(seedKnowledge, {
      english: english.map(({ documentId, title }) => ({ documentId, title: title ?? '' })),
      withJapanese: japanese.map(({ documentId }) => documentId),
      answers: answers.map(({ knowledgeDocumentId }) => knowledgeDocumentId).filter((id): id is string => Boolean(id)),
    });
    for (const { documentId, data } of toAdd) {
      // The plugin has no generated types for its content types, so update()'s types don't know these fields: a plain record.
      const version: Record<string, string> = { ...data };
      await strapi.documents(UID.knowledge).update({ documentId, locale: 'ja', data: version });
      await strapi.documents(UID.knowledge).publish({ documentId, locale: 'ja' });
    }
    return toAdd.length;
  };

  /**
   * Deletes every inquiry, reading up to RESET_READ at a time until none are left, and answers how many it deleted. One
   * read isn't enough: a busy concierge makes more inquiries than that. A delete that leaves its document there would
   * make the next read answer it again for ever, so the reset stops, and says which one.
   */
  const deleteEveryInquiry = async (): Promise<number> => {
    let deleted = 0;
    let previous = new Set<string>();
    for (;;) {
      const batch = (await strapi.documents(UID.inquiry).findMany({ fields: ['documentId'], limit: RESET_READ })) as Array<{ documentId: string }>;
      if (batch.length === 0) return deleted;
      const stuck = batch.find(({ documentId }) => previous.has(documentId));
      if (stuck) throw new Error(`Inquiry ${stuck.documentId} is still there after it was deleted, so the reset stops.`);
      for (const { documentId } of batch) await strapi.documents(UID.inquiry).delete({ documentId });
      deleted += batch.length;
      previous = new Set(batch.map(({ documentId }) => documentId));
    }
  };

  /** The Load demo activity under way, or the last one. Each waits for the one before it, so two presses never both add it. */
  let loadingActivity: Promise<unknown> = Promise.resolve();

  return {
    async loadDemoCatalog(): Promise<SeedResult> {
      await ensureLocales();
      const catalog = await loadCatalog();
      const englishKnowledge = await loadEnglishKnowledge();
      return { ...catalog, knowledge: englishKnowledge, knowledgeJa: await loadJapaneseKnowledge() };
    },

    /**
     * Load demo activity (demo-activity.ts): five made-up customers' requests, questions and inquiries, once. A press while
     * one is loading waits for it, and then finds it there. `now` is only for tests. It defaults to the current time.
     */
    loadDemoActivity(now?: Date): Promise<ServiceResult<ActivityResult>> {
      const loading = loadingActivity.then(() => loadDemoActivity(strapi, now));
      loadingActivity = loading.catch(() => undefined);
      return loading;
    },

    /**
     * Clears what a rehearsal leaves behind: first the product knowledge entries that answers to customers' questions
     * added, in every language, then every question and every inquiry (whether it is open, replied to or closed, and
     * however many there are), then every notification and appointment. The entries go first because a question is
     * where their ids are kept, so a reset that stops partway can run again and find them. Only entries a question
     * names are deleted: the seeded product knowledge and the catalog stay.
     */
    async resetDemoAppointments() {
      const questions = (await strapi.documents(UID.question).findMany({
        fields: ['documentId', 'knowledgeDocumentId'],
        limit: RESET_READ,
      })) as Array<{ documentId: string; knowledgeDocumentId?: string | null }>;
      const knowledgeIds = [...new Set(questions.map((q) => q.knowledgeDocumentId).filter((id): id is string => Boolean(id)))];
      for (const documentId of knowledgeIds) await strapi.documents(UID.knowledge).delete({ documentId, locale: '*' });
      for (const q of questions) await strapi.documents(UID.question).delete({ documentId: q.documentId });

      const inquiries = await deleteEveryInquiry();

      const notifications = await strapi.documents(UID.notification).findMany({ fields: ['documentId'], limit: RESET_READ });
      for (const n of notifications) await strapi.documents(UID.notification).delete({ documentId: n.documentId });
      const appointments = await strapi.documents(UID.appointment).findMany({ fields: ['documentId'], limit: RESET_READ });
      for (const a of appointments) await strapi.documents(UID.appointment).delete({ documentId: a.documentId });
      return {
        appointments: appointments.length,
        notifications: notifications.length,
        questions: questions.length,
        inquiries,
        knowledge: knowledgeIds.length,
      };
    },
  };
};
