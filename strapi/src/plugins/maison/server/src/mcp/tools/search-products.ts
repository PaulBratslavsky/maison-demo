import { z } from '@strapi/utils';

import { getConfig } from '../../config';
import { ACTION } from '../../constants';
import { toolError, toolSuccess } from '../../domain/tool-result';
import { defineTool } from '../define';
import { categoryInput, localeInput, occasionInput, productCardOutput, slugInput } from '../schemas';

const input = z.object({
  query: z.string().max(100).optional().describe('Free text matched against product names and descriptions.'),
  collection: slugInput.optional().describe('Collection slug from browse_collections.'),
  category: categoryInput.optional(),
  occasion: occasionInput.optional().describe('Gift occasion, e.g. "travel" for someone who travels.'),
  minPriceJpy: z.number().int().min(0).optional(),
  maxPriceJpy: z.number().int().min(0).optional().describe('Budget ceiling in whole yen.'),
  personalizable: z.boolean().optional().describe('Only pieces that can be personalized (initials, stripes, colors).'),
  inStockAt: slugInput.optional().describe('Boutique slug from find_boutiques: only pieces in stock there now.'),
  locale: localeInput,
  limit: z.number().int().min(1).max(20).optional().describe('Maximum results, default 8.'),
});

export const searchProductsTool = defineTool({
  name: 'search_products',
  title: 'Search products',
  description:
    'Finds published products by collection, category, gift occasion, price range, personalization and boutique stock. Use it for every product question; never invent products, prices or availability. Results are sorted by price, highest first.',
  auth: { policies: [{ action: ACTION.catalogRead }] },
  resolveInputSchema: () => input,
  resolveOutputSchema: () => z.object({ locale: z.enum(['ja', 'en']), total: z.number(), products: z.array(productCardOutput) }),
  createHandler: (strapi) => async ({ args }) => {
    if (args.minPriceJpy !== undefined && args.maxPriceJpy !== undefined && args.minPriceJpy > args.maxPriceJpy) {
      return toolError('invalid_input', 'minPriceJpy is above maxPriceJpy.', 'Swap them, or drop one of the two limits.');
    }
    const locale = args.locale ?? getConfig(strapi).defaultLocale;
    const result = await strapi.plugin('maison').service('catalog').searchProducts(locale, args);
    if (!result.ok) return toolError(result.code, result.message, result.hint);
    return toolSuccess({ locale, ...result.value });
  },
});
