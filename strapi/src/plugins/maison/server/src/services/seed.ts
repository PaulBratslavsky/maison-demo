import { stat } from 'node:fs/promises';
import path from 'node:path';
import type { Core } from '@strapi/strapi';

import content from '../../seed/content.json';
import { UID } from '../constants';

type Localized = { ja: string; en: string };
const paragraph = (text: string) => [{ type: 'paragraph', children: [{ type: 'text', text }] }];

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

  return {
    async loadDemoCatalog() {
      await ensureLocales();
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
    },

    /** Deletes every appointment and notification. The catalog is untouched. */
    async resetDemoAppointments() {
      const notifications = await strapi.documents(UID.notification).findMany({ fields: ['documentId'], limit: 5000 });
      for (const n of notifications) await strapi.documents(UID.notification).delete({ documentId: n.documentId });
      const appointments = await strapi.documents(UID.appointment).findMany({ fields: ['documentId'], limit: 5000 });
      for (const a of appointments) await strapi.documents(UID.appointment).delete({ documentId: a.documentId });
      return { appointments: appointments.length, notifications: notifications.length };
    },
  };
};
