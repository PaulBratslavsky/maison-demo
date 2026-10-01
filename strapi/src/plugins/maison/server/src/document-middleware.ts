import type { Core } from '@strapi/strapi';
import { errors } from '@strapi/utils';

import { OCCASIONS, PERSONALIZATION_KINDS, UID } from './constants';
import { validateOpeningHours } from './domain/hours';
import { validateEnumArray } from './domain/validation';

type Data = Record<string, unknown>;

const fail = (message: string): never => {
  throw new errors.ValidationError(message);
};

const validateProduct = (data: Data) => {
  const fields = [
    ['personalizationKinds', PERSONALIZATION_KINDS],
    ['giftOccasions', OCCASIONS],
  ] as const;
  for (const [field, allowed] of fields) {
    if (data[field] === undefined || data[field] === null) continue;
    const problem = validateEnumArray(data[field], allowed, field);
    if (problem) fail(problem);
  }
};

const validateBoutique = (data: Data) => {
  if (data.openingHours === undefined) return;
  const result = validateOpeningHours(data.openingHours);
  if (result.ok === false) fail(result.reason);
};

const assertUniqueStockPair = async (strapi: Core.Strapi, data: Data) => {
  const { productSlug, boutiqueSlug } = data;
  if (typeof productSlug !== 'string' || typeof boutiqueSlug !== 'string') return;
  const existing = await strapi.documents(UID.stockLevel).count({
    filters: { productSlug: { $eq: productSlug }, boutiqueSlug: { $eq: boutiqueSlug } },
  });
  if (existing > 0) fail('A stock level for this product and boutique already exists; update it instead.');
};

/** Same rules for the admin and the tools: every create/update goes through the Document Service. */
export const registerDocumentMiddleware = (strapi: Core.Strapi) => {
  strapi.documents.use(async (ctx, next) => {
    if (ctx.action === 'create' || ctx.action === 'update') {
      const data = ((ctx.params as { data?: Data }).data ?? {}) as Data;
      if (ctx.uid === UID.product) validateProduct(data);
      if (ctx.uid === UID.boutique) validateBoutique(data);
      if (ctx.uid === UID.stockLevel && ctx.action === 'create') await assertUniqueStockPair(strapi, data);
    }
    return next();
  });
};
