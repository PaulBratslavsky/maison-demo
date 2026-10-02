# Maison product knowledge (inquiries spec, steps 1–2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The concierge answers questions about care, sizing, delivery, repairs, warranty and gift wrapping from product knowledge that staff write in Strapi, and sends anything it can't answer to Maison's LINE chat.

**Architecture:** A new localized content type, `plugin::maison.knowledge`, in the Maison plugin, with a keyword search in the catalog service (pure ranking in `domain/knowledge.ts`), exposed as the MCP tool `search_knowledge` and the REST route `GET /api/maison/knowledge`. **Load demo catalog** seeds 16 English entries, also into a catalog loaded before. In the app, the concierge gets a rule to answer from `search_knowledge` and a local tool, `hand_off_to_staff`, whose line in the chat shows a note and **Chat with Maison on LINE**.

**Tech Stack:** Strapi 5.55.1, the Maison plugin (TypeScript, `z` from `@strapi/utils`, Vitest, node:test integration suites), Next.js 16 with AI SDK 7 (`tool` from `ai`, zod), Vitest.

**Spec:** `docs/superpowers/specs/2026-10-01-maison-inquiries-design.md` (commit 3a47701), sections 1 and 2, and "Order of work" steps 1 and 2.

## Global Constraints

- **Scope: steps 1 and 2 only** (Paul, 2 Oct 2026: "Plan steps 1–2"). Nothing is logged, labelled or queued, and no Inquiries page, `log_inquiry` or Reply on LINE.
- **The hand-off never promises a reply.** In steps 1–2 nothing reaches staff, so where the spec has the concierge say "they'll reply in your LINE chat", it says instead that Maison's team answers questions like this in the LINE chat, which the button opens.
- **English only for the demo** (Paul, 2 Oct 2026: "stick with english for chat demo"). The content type is localized (`ja` default, `en`), like the catalog, but the seed creates `en` versions only.
- **The REST parameter is `query`**, `search_knowledge`'s own argument name, as on every other Maison route. The spec wrote `q`.
- **The plugin repo is the source of truth:** `~/work/plugin-dev/plugins/strapi-store-demo-mcp`, branch `feat/maison-plugin`. The demo (`~/work/maison-demo`, branch `feat/maison-demo`) gets a `git archive` copy at a commit (Task 5), as its README's "The Maison plugin in this repo" says.
- **No push, PR or deploy without Paul.** A push to the demo's `main` deploys Strapi Cloud and Vercel.
- **Never run `npm run setup` against Strapi Cloud.** It replaces the OAuth client, and the deployed app's client ID would stop working.
- **Copy:** plain, short English, written like the files around it.
- **Commits:** stage named paths only, and end each message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Plugin checks:** `npm test`, `npm run test:ts:back`, `npm run test:ts:front` in the plugin repo.
- **Integration suites:** from the plugin repo, `STRAPI_APP_DIR=$HOME/work/maison-demo/strapi npm run test:integration`, after the copy into the demo, with the demo's Strapi stopped. Each suite uses its own `.tmp/maison-test-<name>.db`, never the demo's database.
- **App checks:** `npm test --prefix liff` and `npm run typecheck --prefix liff` in the demo.

## Review Focus

1. **A question worded differently from the entry,** with a plural or another form ("Do you do repairs?" for an entry that says "repair"), still finds the entry. Tested in Task 3 (`searchTerms`, `rankKnowledge`).
2. **A wrong or unknown product slug from the model** answers `not_found` with the `search_products` hint, never a quietly narrower search. Tested in Task 3 (the service) and Task 4 (the tool and the route).
3. **A question of stop words or punctuation only** ("?", "What is it?") returns no entries and no error. Tested in Task 3.
4. **Drafts and missing translations:** a draft is never returned, and an entry without an `en` version is found from its `ja` version. Tested in Task 3 (unit and integration).
5. **The local model's untidy input to `hand_off_to_staff`** (`question: null`, an extra `locale`) is still accepted, and the note still shows. Tested in Task 6.

---

### Task 1: The knowledge content type and its save rules

Repo: the plugin.

**Files:**
- Create: `server/src/content-types/knowledge/schema.json`, `server/src/content-types/knowledge/index.ts`
- Modify: `server/src/content-types/index.ts`, `server/src/constants.ts`, `server/src/domain/validation.ts`, `server/src/document-middleware.ts`
- Test: `test/unit/knowledge-schema.test.ts` (new), `test/unit/validation.test.ts`, `test/unit/document-middleware.test.ts`

**Interfaces:**
- Produces: `UID.knowledge = 'plugin::maison.knowledge'`; `KNOWLEDGE_CATEGORIES` (readonly tuple of the ten categories); `validateSlugArray(value: unknown, field: string): string | null`.

- [ ] **Step 1: Write the failing tests**

Create `test/unit/knowledge-schema.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import contentTypes from '../../server/src/content-types';
import schema from '../../server/src/content-types/knowledge/schema.json';
import { KNOWLEDGE_CATEGORIES, UID } from '../../server/src/constants';

describe('the product knowledge content type', () => {
  it('is registered as plugin::maison.knowledge', () => {
    expect(contentTypes.knowledge.schema).toBe(schema);
    expect(UID.knowledge).toBe(`plugin::maison.${schema.info.singularName}`);
  });

  it('allows exactly the categories in constants.ts', () => {
    expect(schema.attributes.category.enum).toEqual([...KNOWLEDGE_CATEGORIES]);
  });

  it('is localized with draft and publish, and keeps the category and the products the same in every language', () => {
    expect(schema.options.draftAndPublish).toBe(true);
    expect(schema.pluginOptions.i18n.localized).toBe(true);
    for (const field of ['title', 'answer', 'keywords'] as const) expect(schema.attributes[field].pluginOptions.i18n.localized, field).toBe(true);
    for (const field of ['category', 'productSlugs'] as const) expect(schema.attributes[field].pluginOptions.i18n.localized, field).toBe(false);
  });

  it('limits the answer to 2,000 characters', () => {
    expect(schema.attributes.answer.maxLength).toBe(2000);
  });
});
```

In `test/unit/validation.test.ts`, change the import to `import { validateEnumArray, validateSlugArray } from '../../server/src/domain/validation';` and append:

```ts
describe('validateSlugArray', () => {
  it('accepts distinct product slugs, including none', () => {
    expect(validateSlugArray([], 'productSlugs')).toBeNull();
    expect(validateSlugArray(['weekender-50', 'cabin-case-55'], 'productSlugs')).toBeNull();
  });

  it('refuses anything but a list', () => {
    expect(validateSlugArray('weekender-50', 'productSlugs')).toBe('productSlugs must be an array of product slugs, e.g. ["weekender-50"]');
  });

  it('refuses a name or a number in place of a slug, quoting it', () => {
    expect(validateSlugArray(['Weekender 50'], 'productSlugs')).toBe('productSlugs contains "Weekender 50"; use product slugs like "weekender-50"');
    expect(validateSlugArray([50], 'productSlugs')).toBe('productSlugs contains 50; use product slugs like "weekender-50"');
  });

  it('refuses the same slug twice', () => {
    expect(validateSlugArray(['weekender-50', 'weekender-50'], 'productSlugs')).toBe('productSlugs lists "weekender-50" more than once');
  });
});
```

Append to `test/unit/document-middleware.test.ts` (its imports already have `UID` and `world`; `registered` is defined in the file):

```ts
describe('saving a product knowledge entry', () => {
  const save = (action: 'create' | 'update', productSlugs: unknown) =>
    registered().call({ uid: UID.knowledge, action, params: { data: { title: 'Leather care', productSlugs } } }, async () => ({ documentId: 'k1' }));

  it.each([[[]], [['weekender-50', 'cabin-case-55']], [null], [undefined]])('accepts productSlugs %j', async (productSlugs) => {
    await expect(save('create', productSlugs)).resolves.toEqual({ documentId: 'k1' });
  });

  it.each([
    ['text', 'weekender-50', 'productSlugs must be an array of product slugs'],
    ['a name, not a slug', ['Weekender 50'], 'productSlugs contains "Weekender 50"'],
    ['the same slug twice', ['weekender-50', 'weekender-50'], 'productSlugs lists "weekender-50" more than once'],
  ])('refuses %s, on create and on update', async (_label, productSlugs, message) => {
    for (const action of ['create', 'update'] as const) await expect(save(action, productSlugs)).rejects.toThrow(message);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run test/unit/knowledge-schema.test.ts test/unit/validation.test.ts test/unit/document-middleware.test.ts`
Expected: FAIL. The schema file doesn't exist, and `validateSlugArray` isn't exported.

- [ ] **Step 3: Write the content type, the constants and the save rule**

Create `server/src/content-types/knowledge/schema.json`:

```json
{
  "kind": "collectionType",
  "collectionName": "maison_knowledge_entries",
  "info": {
    "singularName": "knowledge",
    "pluralName": "knowledge-entries",
    "displayName": "Maison product knowledge",
    "description": "What Maison has written down for customers: care, materials, sizing, delivery, repairs and more. The concierge answers only from published entries."
  },
  "options": { "draftAndPublish": true },
  "pluginOptions": { "i18n": { "localized": true }, "content-manager": { "visible": true }, "content-type-builder": { "visible": false } },
  "attributes": {
    "title": { "type": "string", "required": true, "maxLength": 200, "pluginOptions": { "i18n": { "localized": true } } },
    "answer": { "type": "text", "required": true, "maxLength": 2000, "pluginOptions": { "i18n": { "localized": true } } },
    "category": {
      "type": "enumeration",
      "enum": ["care", "materials", "sizing", "personalization", "delivery", "returns", "repairs", "warranty", "gifting", "store"],
      "required": true,
      "pluginOptions": { "i18n": { "localized": false } }
    },
    "productSlugs": { "type": "json", "pluginOptions": { "i18n": { "localized": false } } },
    "keywords": { "type": "text", "maxLength": 500, "pluginOptions": { "i18n": { "localized": true } } }
  }
}
```

Create `server/src/content-types/knowledge/index.ts`:

```ts
import schema from './schema.json';

export default { schema };
```

In `server/src/content-types/index.ts`, add `import knowledge from './knowledge';` after the `import collection` line, and `knowledge,` after `notification,` in the exported object.

In `server/src/constants.ts`, add `knowledge: 'plugin::maison.knowledge',` as the last entry of `UID`, and after `PERSONALIZATION_KINDS`:

```ts
/** What a product knowledge entry is about. The knowledge content type's category enum must match (test/unit/knowledge-schema.test.ts). */
export const KNOWLEDGE_CATEGORIES = ['care', 'materials', 'sizing', 'personalization', 'delivery', 'returns', 'repairs', 'warranty', 'gifting', 'store'] as const;
```

Append to `server/src/domain/validation.ts`:

```ts
const SLUG = /^[a-z0-9-]+$/;

/** Validates a JSON field that must be an array of distinct product slugs, such as "weekender-50". Returns an error message or null. */
export function validateSlugArray(value: unknown, field: string): string | null {
  if (!Array.isArray(value)) return `${field} must be an array of product slugs, e.g. ["weekender-50"]`;
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'string' || !SLUG.test(item)) return `${field} contains ${JSON.stringify(item)}; use product slugs like "weekender-50"`;
    if (seen.has(item)) return `${field} lists "${item}" more than once`;
    seen.add(item);
  }
  return null;
}
```

In `server/src/document-middleware.ts`, change the validation import to `import { validateEnumArray, validateSlugArray } from './domain/validation';`, add after `validateBoutique`:

```ts
/** A knowledge entry's products are slugs, as stock levels keep them, so republishing a product never breaks the link. */
const validateKnowledge = (data: Data) => {
  if (data.productSlugs === undefined || data.productSlugs === null) return;
  const problem = validateSlugArray(data.productSlugs, 'productSlugs');
  if (problem) fail(problem);
};
```

and in the create/update branch of the first middleware, after the boutique line: `if (ctx.uid === UID.knowledge) validateKnowledge(data);`

- [ ] **Step 4: Run the tests and the type checks**

Run: `npx vitest run test/unit/knowledge-schema.test.ts test/unit/validation.test.ts test/unit/document-middleware.test.ts && npm run test:ts:back`
Expected: PASS, and no type errors.

- [ ] **Step 5: Run the whole unit suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/content-types/knowledge server/src/content-types/index.ts server/src/constants.ts server/src/domain/validation.ts server/src/document-middleware.ts test/unit/knowledge-schema.test.ts test/unit/validation.test.ts test/unit/document-middleware.test.ts
git commit -m "feat(knowledge): a product knowledge content type, its categories, and productSlugs checked on save

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The knowledge seed and Load demo catalog

Repo: the plugin.

**Files:**
- Create: `server/seed/knowledge.json`, `admin/src/seed-result.ts`, `test/unit/seed-knowledge.test.ts`, `test/unit/seed-result.test.ts`
- Modify: `server/src/services/seed.ts`, `admin/src/components/DemoData.tsx`, `test/unit/seed.test.ts`, `test/integration/seed.test.mjs`

**Interfaces:**
- Consumes: `UID.knowledge`, `KNOWLEDGE_CATEGORIES` (Task 1).
- Produces: `seed.loadDemoCatalog(): Promise<SeedResult>` with `SeedResult = { created: boolean; collections: number; products: number; boutiques: number; stockLevels: number; knowledge: number }`; `describeSeed(result: SeedResult): string` in `admin/src/seed-result.ts`.

- [ ] **Step 1: Write the seed file**

Create `server/seed/knowledge.json`. Every fact in it comes from `server/seed/content.json` (sizes, personalization kinds and lead days) or is the fictional house's policy:

```json
{
  "entries": [
    {
      "category": "care",
      "productSlugs": [],
      "title": "How do I care for the leather?",
      "answer": "Wipe the leather with a soft, dry cloth after use, and keep it away from direct sunlight and heat. If it gets wet, blot it gently and let it dry at room temperature, never with a hair dryer. Once or twice a year, any boutique can treat it with our neutral leather balm, free of charge.",
      "keywords": "leather, calfskin, clean, cleaning, wipe, polish, balm, cream, conditioner, wet, rain, water, stain, scratch, sun, dry, care, look after, maintain"
    },
    {
      "category": "care",
      "productSlugs": ["voyage-trunk-110"],
      "title": "How do I clean the canvas?",
      "answer": "Dust the canvas with a soft brush or a dry cloth. For a mark, use a cloth barely dampened with water, then let it dry in the open air. Avoid solvents and household cleaners, which dull the coated finish.",
      "keywords": "canvas, coated canvas, fabric, dust, dirt, mark, stain, clean, cleaning, wipe, water, care, look after"
    },
    {
      "category": "care",
      "productSlugs": ["voyage-trunk-110", "cabin-case-55"],
      "title": "How should I store a trunk or hard case?",
      "answer": "Keep it upright in a dry room, away from radiators and direct sun, and open it every few weeks to let it air. Wipe the brass fittings with a dry cloth. A soft patina on the brass is natural and part of the piece's character.",
      "keywords": "trunk, hard case, suitcase, cabin case, store, storage, keep, humidity, damp, mould, mold, brass, fittings, corners, patina, tarnish, care"
    },
    {
      "category": "materials",
      "productSlugs": [],
      "title": "What are Maison's pieces made of?",
      "answer": "Our leather is full-grain calfskin, finished by hand, and it gains a sheen with use. Trunks and hard cases are coated canvas over a wooden frame, with solid brass fittings. Linings are cotton satin or suede, depending on the piece.",
      "keywords": "material, materials, made of, leather, real leather, genuine, calfskin, full-grain, canvas, wood, wooden frame, brass, metal, lining, suede, cotton, satin"
    },
    {
      "category": "sizing",
      "productSlugs": ["cabin-case-55"],
      "title": "Will the Cabin Case 55 fit in an airline overhead bin?",
      "answer": "The Cabin Case 55 measures 55 × 40 × 23 cm with its wheels and handle, which fits the cabin size most airlines allow, usually up to 55 × 40 × 25 cm. Airlines set their own limits, so please check yours before you fly.",
      "keywords": "cabin, carry-on, carry on, hand luggage, overhead, bin, airline, plane, flight, fly, size, dimensions, fit, fits, allowed"
    },
    {
      "category": "sizing",
      "productSlugs": ["tote-soleil"],
      "title": "Does the Tote Soleil fit a laptop?",
      "answer": "The Tote Soleil measures 38 × 30 × 16 cm. It holds A4 documents and most 13-inch laptops, with an inner zip pocket for small things. A 15-inch laptop is usually too wide.",
      "keywords": "tote, laptop, computer, macbook, a4, documents, work, office, size, dimensions, fit, fits, how big"
    },
    {
      "category": "sizing",
      "productSlugs": ["weekender-50"],
      "title": "How much does the Weekender 50 hold?",
      "answer": "The Weekender 50 measures 50 × 29 × 22 cm and holds clothes for two or three nights, a pair of shoes and a wash bag. Its shoulder strap detaches, so you can carry it by the handles.",
      "keywords": "weekender, holdall, duffle, duffel, overnight, weekend, trip, nights, capacity, hold, how much, size, dimensions, how big, strap"
    },
    {
      "category": "sizing",
      "productSlugs": ["carnet-wallet", "card-case-quatre"],
      "title": "How many cards do the wallet and card case hold?",
      "answer": "The Carnet Wallet measures 19 × 10 cm and holds twelve cards, with a full-length pocket for notes. The Card Case Quatre measures 11 × 8 cm and has four pockets, for up to eight cards.",
      "keywords": "wallet, card case, cards, how many, capacity, notes, bills, cash, slim, size, dimensions, fit"
    },
    {
      "category": "sizing",
      "productSlugs": ["watch-roll-trois"],
      "title": "Will my watches fit in the Watch Roll Trois?",
      "answer": "The Watch Roll Trois holds three watches, each on its own suede cushion, and suits cases up to 46 mm across. Rolled up, it measures 26 × 9 × 9 cm.",
      "keywords": "watch, watches, watch roll, case size, mm, diameter, how many, three, travel, fit, size"
    },
    {
      "category": "personalization",
      "productSlugs": [],
      "title": "Can I personalize a piece, and how long does it take?",
      "answer": "Every piece can be personalized. Hot-stamped initials take about 3 days, a monogram in your choice of colour about 14 days, and hand-painted stripes on a trunk about 90 days. Each product page shows the options and the time for that piece. Personalized pieces can't be returned or exchanged.",
      "keywords": "personalize, personalise, personalization, personalisation, custom, initials, monogram, engrave, engraving, emboss, embossing, stamp, hot stamp, letters, name, stripes, paint, painted, colour, color, how long, lead time, days"
    },
    {
      "category": "delivery",
      "productSlugs": [],
      "title": "Do you deliver, and can I collect in a boutique?",
      "answer": "We deliver anywhere in Japan within 2 to 4 business days, free of charge, and you can collect any order at one of our boutiques instead. A personalized piece ships once its work is done. We don't ship outside Japan yet.",
      "keywords": "delivery, deliver, shipping, ship, send, post, courier, arrive, arrival, how long, pick up, pickup, collect, collection, click and collect, abroad, overseas, international"
    },
    {
      "category": "returns",
      "productSlugs": [],
      "title": "Can I return or exchange a piece?",
      "answer": "You can return or exchange an unused piece within 14 days of purchase, with its receipt, at any boutique. Personalized pieces can't be returned or exchanged.",
      "keywords": "return, returning, refund, money back, exchange, swap, change, receipt, unused, wrong, mistake, changed my mind"
    },
    {
      "category": "repairs",
      "productSlugs": [],
      "title": "Do you repair Maison pieces?",
      "answer": "Our workshop repairs every Maison piece, for as long as you own it: stitching, handles, zips, wheels, corners and linings. Bring the piece to any boutique, and we'll give you a quote and a date before any work starts. Most repairs take two to four weeks.",
      "keywords": "repair, repairs, fix, broken, broke, mend, stitching, seam, handle, zip, zipper, strap, wheel, wheels, corner, lining, restore, restoration, damaged"
    },
    {
      "category": "warranty",
      "productSlugs": [],
      "title": "Is there a warranty?",
      "answer": "Every piece has a two-year warranty against defects in materials and workmanship, from the date of purchase. Wear, accidents and water damage aren't covered, but our workshop can repair them for a fee.",
      "keywords": "warranty, guarantee, guaranteed, defect, defective, faulty, covered, cover, coverage, years, broken"
    },
    {
      "category": "gifting",
      "productSlugs": [],
      "title": "Do you gift wrap?",
      "answer": "Every purchase comes in a Maison box with a ribbon, free of charge, and we can add a handwritten card with your message. Ask for a gift receipt, which doesn't show the price.",
      "keywords": "gift, gift wrap, gift wrapping, wrap, wrapping, box, ribbon, card, message, note, present, packaging, gift receipt"
    },
    {
      "category": "store",
      "productSlugs": [],
      "title": "Do I need an appointment to visit a boutique?",
      "answer": "You can visit any boutique during its opening hours without an appointment. An appointment gives you a private consultation, with the pieces you chose ready to see, so it's the best way to see a piece that's usually in stock elsewhere.",
      "keywords": "appointment, booking, walk in, walk-in, visit, visiting, consultation, private, without an appointment, boutique, store, shop"
    }
  ]
}
```

- [ ] **Step 2: Write the failing tests**

Create `test/unit/seed-knowledge.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import content from '../../server/seed/content.json';
import knowledge from '../../server/seed/knowledge.json';
import schema from '../../server/src/content-types/knowledge/schema.json';
import { KNOWLEDGE_CATEGORIES } from '../../server/src/constants';

const productSlugs = new Set(content.products.map((product) => product.slug));

describe('the product knowledge seed', () => {
  it('has the sixteen demo entries, each with its own title', () => {
    expect(knowledge.entries).toHaveLength(16);
    expect(new Set(knowledge.entries.map((entry) => entry.title)).size).toBe(16);
  });

  it('files every entry under a category the content type allows', () => {
    for (const entry of knowledge.entries) expect(KNOWLEDGE_CATEGORIES, entry.title).toContain(entry.category);
  });

  it('names only products the demo catalog has', () => {
    for (const entry of knowledge.entries) {
      for (const slug of entry.productSlugs) expect(productSlugs.has(slug), `${entry.title}: ${slug}`).toBe(true);
    }
  });

  it('fits the content type limits', () => {
    for (const entry of knowledge.entries) {
      expect(entry.title.length, entry.title).toBeLessThanOrEqual(schema.attributes.title.maxLength);
      expect(entry.answer.length, entry.title).toBeLessThanOrEqual(schema.attributes.answer.maxLength);
      expect(entry.keywords.length, entry.title).toBeLessThanOrEqual(schema.attributes.keywords.maxLength);
    }
  });
});
```

Create `test/unit/seed-result.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { describeSeed } from '../../admin/src/seed-result';

const nothing = { created: false, collections: 0, products: 0, boutiques: 0, stockLevels: 0, knowledge: 0 };

describe('describeSeed', () => {
  it('names everything a first load created', () => {
    expect(describeSeed({ created: true, collections: 3, products: 12, boutiques: 3, stockLevels: 36, knowledge: 16 })).toBe(
      'Loaded 12 products, 3 collections, 3 boutiques, 36 stock levels and 16 product knowledge entries.'
    );
  });

  it('says when only the product knowledge was added', () => {
    expect(describeSeed({ ...nothing, knowledge: 16 })).toBe('The demo catalog is already loaded. Added 16 product knowledge entries.');
  });

  it('says when nothing changed', () => {
    expect(describeSeed(nothing)).toBe('The demo catalog and its product knowledge are already loaded.');
  });
});
```

In `test/unit/seed.test.ts`, add `import knowledge from '../../server/seed/knowledge.json';` after the content import, add `count: async () => 0,` to the `documents` object of the existing `loadDemoCatalog` test, and append:

```ts
describe('loadDemoCatalog and the product knowledge', () => {
  /** A Strapi whose catalog is or isn't there, with `knowledgeCount` English knowledge entries, recording what's created and published. */
  const strapiWith = ({ catalogThere, knowledgeCount }: { catalogThere: boolean; knowledgeCount: number }) => {
    const created: Array<{ uid: string; locale: string }> = [];
    const published: Array<{ uid: string; locale: string }> = [];
    const documents = (uid: string) => ({
      findFirst: async () => (catalogThere ? { documentId: 'existing' } : null),
      count: async () => (uid === 'plugin::maison.knowledge' ? knowledgeCount : 0),
      create: async ({ locale }: { locale: string }) => {
        created.push({ uid, locale });
        return { documentId: `doc-${created.length}` };
      },
      update: async () => ({}),
      publish: async ({ locale }: { locale: string }) => {
        published.push({ uid, locale });
        return {};
      },
    });
    const strapi = {
      plugin: (id: string) => ({
        service: () => (id === 'upload' ? { upload: async () => [{ id: 1 }] } : { findByCode: async () => ({}), create: async () => ({}) }),
      }),
      documents,
    } as any;
    return { strapi, created, published };
  };

  it('adds the product knowledge in English to a catalog loaded before, and publishes it', async () => {
    const { strapi, created, published } = strapiWith({ catalogThere: true, knowledgeCount: 0 });
    expect(await seedService({ strapi }).loadDemoCatalog()).toEqual({
      created: false, collections: 0, products: 0, boutiques: 0, stockLevels: 0, knowledge: knowledge.entries.length,
    });
    const entry = { uid: 'plugin::maison.knowledge', locale: 'en' };
    expect(created).toEqual(knowledge.entries.map(() => entry));
    expect(published).toEqual(knowledge.entries.map(() => entry));
  });

  it('adds nothing when there are English entries already', async () => {
    const { strapi, created } = strapiWith({ catalogThere: true, knowledgeCount: 3 });
    expect((await seedService({ strapi }).loadDemoCatalog()).knowledge).toBe(0);
    expect(created).toEqual([]);
  });
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `npx vitest run test/unit/seed-knowledge.test.ts test/unit/seed-result.test.ts test/unit/seed.test.ts`
Expected: FAIL. `admin/src/seed-result.ts` doesn't exist, and `loadDemoCatalog` returns no `knowledge`.

- [ ] **Step 4: Load the knowledge from the seed service**

In `server/src/services/seed.ts`:
- add `import knowledge from '../../seed/knowledge.json';` after the content import
- add after `imageMimeType`:

```ts
/** What Load demo catalog did: the catalog it created (all zeros when it was there already), and the product knowledge it added. */
export interface SeedResult {
  created: boolean;
  collections: number;
  products: number;
  boutiques: number;
  stockLevels: number;
  knowledge: number;
}
```

- move the body of `loadDemoCatalog` after `await ensureLocales();` into a new closure, `const loadCatalog = async (): Promise<Omit<SeedResult, 'knowledge'>> => { … }`, unchanged: the early `return { created: false, collections: 0, products: 0, boutiques: 0, stockLevels: 0 }` when the first collection exists, and the final return with the counts.
- add, after `loadCatalog`:

```ts
  /**
   * Maison's product knowledge, in English only for now, as the stage demo is in English: one published en document per
   * entry. It loads when there's no en entry yet, whether or not the catalog was there before, so a Strapi that loaded
   * the catalog earlier gets it too.
   */
  const loadKnowledge = async (): Promise<number> => {
    if ((await strapi.documents(UID.knowledge).count({ locale: 'en' })) > 0) return 0;
    for (const entry of knowledge.entries) {
      const { documentId } = await strapi.documents(UID.knowledge).create({ locale: 'en', data: entry });
      await strapi.documents(UID.knowledge).publish({ documentId, locale: 'en' });
    }
    return knowledge.entries.length;
  };
```

- make `loadDemoCatalog`:

```ts
    async loadDemoCatalog(): Promise<SeedResult> {
      await ensureLocales();
      const catalog = await loadCatalog();
      return { ...catalog, knowledge: await loadKnowledge() };
    },
```

Create `admin/src/seed-result.ts`:

```ts
/** What POST /maison/demo/seed answers (the seed service's SeedResult). */
export type SeedResult = { created: boolean; collections: number; products: number; boutiques: number; stockLevels: number; knowledge: number };

/** The notice after Load demo catalog. */
export const describeSeed = (result: SeedResult): string => {
  if (result.created) {
    const knowledge = result.knowledge > 0 ? ` and ${result.knowledge} product knowledge entries` : '';
    return `Loaded ${result.products} products, ${result.collections} collections, ${result.boutiques} boutiques, ${result.stockLevels} stock levels${knowledge}.`;
  }
  return result.knowledge > 0
    ? `The demo catalog is already loaded. Added ${result.knowledge} product knowledge entries.`
    : 'The demo catalog and its product knowledge are already loaded.';
};
```

In `admin/src/components/DemoData.tsx`, delete the local `SeedResult` type and `describeSeed`, import them with `import { describeSeed, type SeedResult } from '../seed-result';`, and make the description read: "Load demo catalog creates 3 collections, 12 products and 3 boutiques in Japanese and English, publishes them and sets stock, and adds 16 product knowledge entries in English. Whatever is there already stays as it is. Reset deletes every appointment and delivery record and keeps the catalog."

- [ ] **Step 5: Update the integration suite for the seed** (it runs in Task 5)

In `test/integration/seed.test.mjs`:
- in "loads the catalog in ja and en, published", expect `{ created: true, collections: 3, products: 12, boutiques: 3, stockLevels: 36, knowledge: 16 }`, and add `assert.equal(await strapi.documents('plugin::maison.knowledge').count({ locale: 'en', status: 'published' }), 16, '16 en knowledge entries');`
- in "does nothing the second time", expect `{ created: false, collections: 0, products: 0, boutiques: 0, stockLevels: 0, knowledge: 0 }`
- add after that test:

```js
  it('adds the product knowledge to a catalog loaded without it, and leaves the catalog as it is', async () => {
    const entries = await strapi.documents('plugin::maison.knowledge').findMany({ locale: 'en', fields: ['documentId'], limit: 100 });
    for (const { documentId } of entries) await strapi.documents('plugin::maison.knowledge').delete({ documentId, locale: '*' });
    assert.deepEqual(await seed.loadDemoCatalog(), { created: false, collections: 0, products: 0, boutiques: 0, stockLevels: 0, knowledge: 16 });
    assert.equal(await strapi.documents('plugin::maison.product').count({ locale: 'ja', status: 'published' }), 12);
  });
```

- [ ] **Step 6: Run the tests and the type checks**

Run: `npm test && npm run test:ts:back && npm run test:ts:front`
Expected: PASS, and no type errors. If `tsc` rejects the shape of `data` in `loadKnowledge`, pass the UID as `UID.knowledge as any`, as `createLocalized` does with its `uid`.

- [ ] **Step 7: Commit**

```bash
git add server/seed/knowledge.json server/src/services/seed.ts admin/src/seed-result.ts admin/src/components/DemoData.tsx test/unit/seed-knowledge.test.ts test/unit/seed-result.test.ts test/unit/seed.test.ts test/integration/seed.test.mjs
git commit -m "feat(knowledge): Load demo catalog adds 16 English product knowledge entries, also to a catalog loaded before

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Ranking and the catalog's searchKnowledge

Repo: the plugin.

**Files:**
- Create: `server/src/domain/knowledge.ts`, `test/unit/knowledge.test.ts`, `test/unit/catalog-knowledge.test.ts`, `test/integration/knowledge.test.mjs`
- Modify: `server/src/services/catalog.ts`, `server/src/domain/failures.ts`

**Interfaces:**
- Consumes: `UID.knowledge` (Task 1); the seed (Task 2, for the integration suite).
- Produces:
  - `searchTerms(query: string, locale: string): string[]`
  - `scoreEntry(entry: KnowledgeEntry, terms: string[]): number`
  - `rankKnowledge(entries: KnowledgeEntry[], query: string, locale: string, productSlugs?: string[]): KnowledgeEntry[]`
  - `MAX_RESULTS = 4`
  - `KnowledgeEntry = { title: string; answer: string; category: string; productSlugs: string[]; keywords: string }`
  - `productsNotFound(slugs: string[]): ServiceFailure`
  - `catalog.searchKnowledge(locale: Locale, input: { query: string; productSlugs?: string[] }): Promise<ServiceResult<{ entries: KnowledgeAnswer[] }>>`, where `KnowledgeAnswer = { title: string; answer: string; category: string; productSlugs: string[] }`

- [ ] **Step 1: Write the failing domain tests**

Create `test/unit/knowledge.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { MAX_RESULTS, rankKnowledge, scoreEntry, searchTerms, type KnowledgeEntry } from '../../server/src/domain/knowledge';

const entry = (title: string, extra: Partial<KnowledgeEntry> = {}): KnowledgeEntry => ({
  title, answer: '', category: 'care', productSlugs: [], keywords: '', ...extra,
});
const titles = (entries: KnowledgeEntry[]) => entries.map((found) => found.title);

describe('searchTerms', () => {
  it('keeps the words that name a topic, in lower case, without punctuation or stop words', () => {
    expect(searchTerms('How do I care for the LEATHER?', 'en')).toEqual(['care', 'leather']);
  });

  it('counts a plural as its singular, so "repairs" finds "repair"', () => {
    expect(searchTerms('Returns and repairs', 'en')).toEqual(['return', 'repair']);
  });

  it('has nothing to search for in a question of stop words or punctuation', () => {
    expect(searchTerms('?', 'en')).toEqual([]);
    expect(searchTerms('What is it?', 'en')).toEqual([]);
  });

  it('splits a Japanese question into words, without particles', () => {
    const terms = searchTerms('革製品のお手入れ方法を教えてください', 'ja');
    expect(terms).toContain('手入れ');
    expect(terms).not.toContain('の');
    expect(terms).not.toContain('を');
  });
});

describe('scoreEntry', () => {
  it('counts a word in the title most, then in the keywords, then in the answer', () => {
    expect(scoreEntry(entry('Leather care'), ['leather'])).toBe(3);
    expect(scoreEntry(entry('Care', { keywords: 'leather, balm' }), ['leather'])).toBe(2);
    expect(scoreEntry(entry('Care', { answer: 'Wipe the leather.' }), ['leather'])).toBe(1);
    expect(scoreEntry(entry('Care'), ['leather'])).toBe(0);
  });

  it('counts each word once, by the best place it is in', () => {
    expect(scoreEntry(entry('Leather care', { keywords: 'leather', answer: 'leather' }), ['leather'])).toBe(3);
  });
});

describe('rankKnowledge', () => {
  const leather = entry('How do I care for the leather?', { keywords: 'leather, clean, wipe' });
  const canvas = entry('How do I clean the canvas?', { keywords: 'canvas, clean', productSlugs: ['voyage-trunk-110'] });
  const repairs = entry('Do you repair Maison pieces?', { category: 'repairs', keywords: 'repair, fix' });
  const cabin = entry('Will the Cabin Case 55 fit in an overhead bin?', { category: 'sizing', keywords: 'fit, overhead', productSlugs: ['cabin-case-55'] });
  const tote = entry('Does the Tote Soleil fit a laptop?', { category: 'sizing', keywords: 'fit, laptop', productSlugs: ['tote-soleil'] });
  const all = [leather, canvas, repairs, cabin, tote];

  it('puts the best entry first', () => {
    expect(titles(rankKnowledge(all, 'How do I care for the leather?', 'en'))).toEqual(['How do I care for the leather?']);
  });

  it('finds an entry worded differently from the question', () => {
    expect(titles(rankKnowledge(all, 'Do you do repairs?', 'en'))).toEqual(['Do you repair Maison pieces?']);
  });

  it('returns none when no word matches, and none for a question of stop words', () => {
    expect(rankKnowledge(all, 'Can I pay in bitcoin?', 'en')).toEqual([]);
    expect(rankKnowledge(all, 'What is it?', 'en')).toEqual([]);
  });

  it('returns at most four entries', () => {
    const many = Array.from({ length: 6 }, (_, index) => entry(`Leather note ${index}`));
    expect(rankKnowledge(many, 'leather', 'en')).toHaveLength(MAX_RESULTS);
  });

  it("with products, leaves out entries about other pieces, keeps general ones, and ranks the piece's own first", () => {
    const general = entry('Does it fit? General sizing', { category: 'sizing', keywords: 'fit' });
    expect(titles(rankKnowledge([...all, general], 'Will it fit?', 'en', ['cabin-case-55']))).toEqual([
      'Will the Cabin Case 55 fit in an overhead bin?',
      'Does it fit? General sizing',
    ]);
  });

  it('never returns an entry only because it is about the piece, when none of its words match', () => {
    expect(rankKnowledge(all, 'Can I pay in bitcoin?', 'en', ['cabin-case-55'])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run test/unit/knowledge.test.ts`
Expected: FAIL: `server/src/domain/knowledge` doesn't exist.

- [ ] **Step 3: Write the ranking**

Create `server/src/domain/knowledge.ts`:

```ts
/** A product knowledge entry as the search reads it. */
export interface KnowledgeEntry {
  title: string;
  answer: string;
  category: string;
  productSlugs: string[];
  keywords: string;
}

/** The most entries a search returns. */
export const MAX_RESULTS = 4;

const TITLE = 3;
const KEYWORDS = 2;
const ANSWER = 1;
const PRODUCT_BONUS = 2;

/** Words that name no topic: an English question's glue, and a few Japanese question words. */
const STOPWORDS = new Set([
  'a', 'about', 'an', 'and', 'any', 'are', 'at', 'be', 'by', 'can', 'could', 'did', 'do', 'does', 'for', 'from', 'get',
  'has', 'have', 'hello', 'hi', 'how', 'i', 'if', 'in', 'is', 'it', 'its', 'maison', 'me', 'my', 'need', 'of', 'on', 'or',
  'please', 'should', 'so', 'thank', 'thanks', 'that', 'the', 'there', 'these', 'this', 'those', 'to', 'want', 'was', 'we',
  'what', 'when', 'where', 'which', 'who', 'why', 'will', 'with', 'would', 'you', 'your',
  '何', 'ください', 'どのくらい', 'どれくらい', 'について',
]);
const HIRAGANA_ONLY = /^[぀-ゟ]+$/u;

/** NFKC folds full-width letters and digits, and case doesn't count. */
const normalize = (text: string) => text.normalize('NFKC').toLowerCase();

/** A plural "s" doesn't count either: "returns" finds "return", "cards" finds "card". */
const singular = (word: string) => (/^[a-z]{4,}$/.test(word) && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word);

/**
 * The words of a question worth searching for. Intl.Segmenter splits them, Japanese included, and what's left out is
 * punctuation, stop words, single letters and digits, and Japanese particles and endings (one or two hiragana).
 */
export const searchTerms = (query: string, locale: string): string[] => {
  const terms = new Set<string>();
  for (const { segment, isWordLike } of new Intl.Segmenter(locale, { granularity: 'word' }).segment(normalize(query))) {
    if (!isWordLike || STOPWORDS.has(segment) || /^[a-z0-9]$/.test(segment)) continue;
    if (HIRAGANA_ONLY.test(segment) && segment.length <= 2) continue;
    terms.add(singular(segment));
  }
  return [...terms];
};

/** How well an entry answers: each term counts once, by the best field it's in. 0 when no term matches. */
export const scoreEntry = (entry: KnowledgeEntry, terms: string[]): number => {
  const title = normalize(entry.title);
  const keywords = normalize(entry.keywords);
  const answer = normalize(entry.answer);
  return terms.reduce(
    (score, term) => score + (title.includes(term) ? TITLE : keywords.includes(term) ? KEYWORDS : answer.includes(term) ? ANSWER : 0),
    0
  );
};

/**
 * The entries that answer `query` best, at most MAX_RESULTS. With productSlugs, only the entries about those pieces and
 * the general ones (no productSlugs), and a piece's own entries rank higher. An entry none of the question's words
 * match is never returned, so a question Maison hasn't written about gets none.
 */
export const rankKnowledge = (entries: KnowledgeEntry[], query: string, locale: string, productSlugs: string[] = []): KnowledgeEntry[] => {
  const terms = searchTerms(query, locale);
  if (terms.length === 0) return [];
  const asked = new Set(productSlugs);
  const aboutAsked = (entry: KnowledgeEntry) => entry.productSlugs.some((slug) => asked.has(slug));
  return entries
    .filter((entry) => asked.size === 0 || entry.productSlugs.length === 0 || aboutAsked(entry))
    .map((entry) => {
      const words = scoreEntry(entry, terms);
      return { entry, score: words > 0 && aboutAsked(entry) ? words + PRODUCT_BONUS : words };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title))
    .slice(0, MAX_RESULTS)
    .map(({ entry }) => entry);
};
```

- [ ] **Step 4: Run the domain tests**

Run: `npx vitest run test/unit/knowledge.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing service tests**

Create `test/unit/catalog-knowledge.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import catalogService from '../../server/src/services/catalog';
import { fakeStrapi } from './fake-strapi';

type Doc = Record<string, unknown>;
type Rows = { knowledge?: Record<string, Doc[]>; products?: Record<string, Doc[]> };

/** The catalog service over published rows per locale: knowledge entries, and products found by slug. */
const catalogWith = (rows: Rows) =>
  catalogService({
    strapi: fakeStrapi({
      documents: (uid: string) => ({
        findMany: vi.fn(async ({ locale, status, filters }: { locale: string; status: string; filters?: any }) => {
          if (status !== 'published') return [];
          if (uid === 'plugin::maison.knowledge') return rows.knowledge?.[locale] ?? [];
          if (uid === 'plugin::maison.product') {
            const wanted: string[] = filters?.slug?.$in ?? [];
            return (rows.products?.[locale] ?? []).filter((product) => wanted.includes(product.slug as string));
          }
          return [];
        }),
      }),
    }),
  });

const leather = { documentId: 'k1', title: 'How do I care for the leather?', answer: 'Wipe it with a dry cloth.', category: 'care', productSlugs: [], keywords: 'leather, wipe' };
const cabin = { documentId: 'k2', title: 'Will the Cabin Case 55 fit in an overhead bin?', answer: '55 × 40 × 23 cm.', category: 'sizing', productSlugs: ['cabin-case-55'], keywords: 'fit, overhead' };

describe('catalog.searchKnowledge', () => {
  it('answers from the published entries in the locale, without their keywords', async () => {
    const result = await catalogWith({ knowledge: { en: [leather, cabin] } }).searchKnowledge('en', { query: 'How do I care for the leather?' });
    expect(result).toEqual({
      ok: true,
      value: { entries: [{ title: leather.title, answer: leather.answer, category: 'care', productSlugs: [] }] },
    });
  });

  it('fills in from the default locale where an entry has no translation', async () => {
    const japaneseOnly = { ...leather, documentId: 'k3', title: '革のお手入れ', keywords: 'leather' };
    const result = await catalogWith({ knowledge: { en: [cabin], ja: [japaneseOnly] } }).searchKnowledge('en', { query: 'leather' });
    expect(result.ok && result.value.entries.map((found) => found.title)).toEqual(['革のお手入れ']);
  });

  it('reads a productSlugs value that is not a list as an entry for every piece', async () => {
    const broken = { ...leather, productSlugs: 'weekender-50' };
    const products = { en: [{ slug: 'cabin-case-55' }] };
    const result = await catalogWith({ knowledge: { en: [broken] }, products }).searchKnowledge('en', { query: 'leather', productSlugs: ['cabin-case-55'] });
    expect(result.ok && result.value.entries[0].productSlugs).toEqual([]);
  });

  it('answers an unknown or unpublished product with not_found and the search_products hint', async () => {
    const products = { en: [{ slug: 'cabin-case-55' }] };
    const result = await catalogWith({ knowledge: { en: [cabin] }, products }).searchKnowledge('en', {
      query: 'Will it fit?',
      productSlugs: ['cabin-case-55', 'no-such-piece'],
    });
    expect(result).toEqual({ ok: false, code: 'not_found', message: 'No published product "no-such-piece".', hint: 'Call search_products to find valid product slugs.' });
  });

  it('returns no entries for a question nothing matches', async () => {
    expect(await catalogWith({ knowledge: { en: [leather, cabin] } }).searchKnowledge('en', { query: 'Can I pay in bitcoin?' })).toEqual({
      ok: true,
      value: { entries: [] },
    });
  });
});
```

- [ ] **Step 6: Run them to see them fail**

Run: `npx vitest run test/unit/catalog-knowledge.test.ts`
Expected: FAIL: `searchKnowledge is not a function`.

- [ ] **Step 7: Add productsNotFound and searchKnowledge**

Append to `server/src/domain/failures.ts`:

```ts
/** Products in a request that aren't published, each named in the order given. */
export const productsNotFound = (slugs: string[]) =>
  failure(
    'not_found',
    `No published ${slugs.length === 1 ? 'product' : 'products'} ${slugs.map((slug) => `"${slug}"`).join(', ')}.`,
    'Call search_products to find valid product slugs.'
  );
```

In `server/src/services/catalog.ts`:
- add imports: `import { productsNotFound } from '../domain/failures';` and `import { rankKnowledge, type KnowledgeEntry } from '../domain/knowledge';`
- add after the `SearchFilters` interface:

```ts
/** A knowledge entry as search_knowledge returns it. */
export interface KnowledgeAnswer {
  title: string;
  answer: string;
  category: string;
  productSlugs: string[];
}
```

- in `getBoutiques`, replace the three lines that build and return the not_found failure with:

```ts
        const unknown = [...new Set(productSlugs.filter((slug) => !known.has(slug)))];
        if (unknown.length > 0) return productsNotFound(unknown);
```

  (The message and hint stay word for word what they were.)
- add a method after `getBoutiques`:

```ts
    /**
     * search_knowledge: the published entries that answer the question best, at most four, in `locale`, with the default
     * locale's entries where a translation is missing. A product that doesn't exist or isn't published is not_found,
     * never a narrower search that quietly leaves it out.
     */
    async searchKnowledge(locale: Locale, input: { query: string; productSlugs?: string[] }): Promise<ServiceResult<{ entries: KnowledgeAnswer[] }>> {
      const productSlugs = [...new Set(input.productSlugs ?? [])];
      if (productSlugs.length > 0) {
        const known = await publishedSlugs(UID.product, locale, productSlugs);
        const unknown = productSlugs.filter((slug) => !known.has(slug));
        if (unknown.length > 0) return productsNotFound(unknown);
      }
      const docs = await findPublished(UID.knowledge, locale, { fields: ['title', 'answer', 'category', 'productSlugs', 'keywords'] });
      const entries: KnowledgeEntry[] = docs.map((doc) => ({
        title: (doc.title as string | null) ?? '',
        answer: (doc.answer as string | null) ?? '',
        category: (doc.category as string | null) ?? '',
        productSlugs: arrayOf(doc.productSlugs),
        keywords: (doc.keywords as string | null) ?? '',
      }));
      const ranked = rankKnowledge(entries, input.query, locale, productSlugs);
      return { ok: true, value: { entries: ranked.map(({ title, answer, category, productSlugs: slugs }) => ({ title, answer, category, productSlugs: slugs })) } };
    },
```

- [ ] **Step 8: Write the integration suite** (it runs in Task 5)

Create `test/integration/knowledge.test.mjs`:

```js
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { bootStrapi } from './harness.mjs';

const KNOWLEDGE = 'plugin::maison.knowledge';

describe('product knowledge on seeded data', () => {
  let strapi;
  let catalog;
  before(async () => {
    strapi = await bootStrapi('knowledge');
    await strapi.plugin('maison').service('seed').loadDemoCatalog();
    catalog = strapi.plugin('maison').service('catalog');
  });
  after(async () => {
    await strapi?.destroy();
  });

  it('answers a leather care question with the leather care entry first', async () => {
    const result = await catalog.searchKnowledge('en', { query: 'How do I care for the leather?' });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.value.entries[0].title, 'How do I care for the leather?');
    assert.ok(result.value.entries.length <= 4);
  });

  it("puts a piece's own entry first, and leaves out entries about other pieces", async () => {
    const result = await catalog.searchKnowledge('en', { query: 'Will it fit in the overhead bin?', productSlugs: ['cabin-case-55'] });
    assert.equal(result.value.entries[0].title, 'Will the Cabin Case 55 fit in an airline overhead bin?');
    assert.ok(result.value.entries.every((entry) => entry.productSlugs.length === 0 || entry.productSlugs.includes('cabin-case-55')));
  });

  it('finds nothing for a question Maison has not written about', async () => {
    assert.deepEqual((await catalog.searchKnowledge('en', { query: 'Can I pay in bitcoin?' })).value.entries, []);
  });

  it('never returns a draft', async () => {
    await strapi.documents(KNOWLEDGE).create({
      locale: 'en',
      data: { title: 'A draft about zebras', answer: 'Not written yet.', category: 'store', productSlugs: [], keywords: 'zebra' },
    });
    assert.deepEqual((await catalog.searchKnowledge('en', { query: 'zebra' })).value.entries, []);
  });

  it('finds an entry that has no English version from its Japanese one', async () => {
    await strapi.documents(KNOWLEDGE).create({
      locale: 'ja', status: 'published',
      data: { title: 'キリンについて', answer: 'キリンの方針です。', category: 'store', productSlugs: [], keywords: 'giraffe' },
    });
    assert.deepEqual((await catalog.searchKnowledge('en', { query: 'giraffe' })).value.entries.map((entry) => entry.title), ['キリンについて']);
  });

  it('answers an unknown product with not_found and the search_products hint', async () => {
    const result = await catalog.searchKnowledge('en', { query: 'Will it fit?', productSlugs: ['no-such-piece'] });
    assert.equal(result.code, 'not_found');
    assert.equal(result.message, 'No published product "no-such-piece".');
    assert.match(result.hint, /search_products/);
  });
});
```

- [ ] **Step 9: Run the tests and the type check**

Run: `npm test && npm run test:ts:back`
Expected: PASS, including the catalog tools' existing `getBoutiques` tests, and no type errors.

- [ ] **Step 10: Commit**

```bash
git add server/src/domain/knowledge.ts server/src/domain/failures.ts server/src/services/catalog.ts test/unit/knowledge.test.ts test/unit/catalog-knowledge.test.ts test/integration/knowledge.test.mjs
git commit -m "feat(knowledge): rank published entries for a question, with products narrowing the search

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: search_knowledge, the REST door and the docs

Repo: the plugin.

**Files:**
- Create: `server/src/mcp/tools/search-knowledge.ts`, `server/src/controllers/knowledge.ts`
- Modify: `server/src/mcp/schemas.ts`, `server/src/mcp/index.ts`, `server/src/constants.ts`, `server/src/controllers/index.ts`, `server/src/routes/index.ts`, `README.md`, `CHANGELOG.md`
- Test: `test/unit/catalog-tools.test.ts`, `test/unit/rest-controllers.test.ts`, `test/unit/rest-routes.test.ts`, `test/unit/register-mcp.test.ts`, `test/unit/constants.test.ts`, `test/integration/rest.test.mjs`, `test/mcp/tools.test.mjs`

**Interfaces:**
- Consumes: `catalog.searchKnowledge` (Task 3).
- Produces:
  - the MCP tool `search_knowledge`, with input `{ query: string (1–300 characters); productSlugs?: string[] (up to 5 slugs); locale?: 'ja' | 'en' }` and output `{ locale: 'ja' | 'en'; entries: Array<{ title; answer; category; productSlugs }> }`
  - `GET /api/maison/knowledge?query=…&productSlugs=…&locale=…`, with the action `plugin::maison.knowledge.find`
  - `TOOL_NAMES` gains `'search_knowledge'`, after `'find_boutiques'`

- [ ] **Step 1: Write the failing tests**

In `test/unit/catalog-tools.test.ts`:
- add `import { searchKnowledgeTool } from '../../server/src/mcp/tools/search-knowledge';`
- in "each say what the tool won't do", add `expect(searchKnowledgeTool.description).toMatch(/Never make up a policy\./);`
- append:

```ts
describe('search_knowledge', () => {
  const entry = { title: 'How do I care for the leather?', answer: 'Wipe it with a dry cloth.', category: 'care', productSlugs: [] };

  it('searches in the default locale and returns schema-valid output', async () => {
    const searchKnowledge = vi.fn(async () => ({ ok: true, value: { entries: [entry] } }));
    const result = await run(searchKnowledgeTool, { searchKnowledge }, { query: 'leather care' });
    expect(searchKnowledge).toHaveBeenCalledWith('ja', { query: 'leather care' });
    expect(result.structuredContent).toEqual({ locale: 'ja', entries: [entry] });
    expect(() => matchesOutput(searchKnowledgeTool, result)).not.toThrow();
  });

  it('passes the products and the locale through', async () => {
    const searchKnowledge = vi.fn(async () => ({ ok: true, value: { entries: [] } }));
    await run(searchKnowledgeTool, { searchKnowledge }, { query: 'Will it fit?', productSlugs: ['cabin-case-55'], locale: 'en' });
    expect(searchKnowledge).toHaveBeenCalledWith('en', { query: 'Will it fit?', productSlugs: ['cabin-case-55'] });
  });

  it('answers an unknown product with not_found and the search_products hint', async () => {
    const message = 'No published product "no-such-piece".';
    const hint = 'Call search_products to find valid product slugs.';
    const searchKnowledge = vi.fn(async () => ({ ok: false, code: 'not_found', message, hint }));
    const result = await run(searchKnowledgeTool, { searchKnowledge }, { query: 'Will it fit?', productSlugs: ['no-such-piece'] });
    expect(result.isError).toBe(true);
    expect(errorOf(result)).toEqual({ code: 'not_found', message, hint });
  });

  it('refuses an empty question and one over 300 characters', () => {
    const input = searchKnowledgeTool.resolveInputSchema!(context);
    expect(input.safeParse({ query: 'How do I care for the leather?' }).success).toBe(true);
    expect(input.safeParse({ query: '' }).success).toBe(false);
    expect(input.safeParse({ query: 'x'.repeat(301) }).success).toBe(false);
  });
});
```

In `test/unit/rest-controllers.test.ts`:
- add `import knowledgeController from '../../server/src/controllers/knowledge';` and `import { searchKnowledgeTool } from '../../server/src/mcp/tools/search-knowledge';`
- append:

```ts
describe('GET /knowledge (knowledge.find)', () => {
  const entry = { title: 'How do I care for the leather?', answer: 'Wipe it with a dry cloth.', category: 'care', productSlugs: [] };

  it('reads productSlugs as a list, even one, and answers what search_knowledge returns', async () => {
    const searchKnowledge = vi.fn(async () => ({ ok: true, value: { entries: [entry] } }));
    const ctx = fakeCtx({ query: { query: 'leather care', productSlugs: 'weekender-50', locale: 'en' } });
    await withCatalog(knowledgeController, { searchKnowledge }).find(ctx);
    expect(searchKnowledge).toHaveBeenCalledWith('en', expect.objectContaining({ query: 'leather care', productSlugs: ['weekender-50'] }));
    expect(ctx.status).toBe(200);
    expect(ctx.body).toEqual({ locale: 'en', entries: [entry] });
    expect(searchKnowledgeTool.resolveOutputSchema(context).parse(ctx.body)).toEqual(ctx.body);
  });

  it('answers a missing question with 400 invalid_input, before calling the service', async () => {
    const searchKnowledge = vi.fn();
    const ctx = fakeCtx({ query: { locale: 'en' } });
    await withCatalog(knowledgeController, { searchKnowledge }).find(ctx);
    expect(ctx.status).toBe(400);
    expect(ctx.body.error.code).toBe('invalid_input');
    expect(searchKnowledge).not.toHaveBeenCalled();
  });

  it('answers an unknown product with 404 and the error the tool gives', async () => {
    const failure = { ok: false, code: 'not_found', message: 'No published product "no-such-piece".', hint: 'Call search_products to find valid product slugs.' };
    const ctx = fakeCtx({ query: { query: 'Will it fit?', productSlugs: 'no-such-piece' } });
    await withCatalog(knowledgeController, { searchKnowledge: vi.fn(async () => failure) }).find(ctx);
    expect(ctx.status).toBe(404);
    expect(ctx.body).toEqual({ error: { code: 'not_found', message: failure.message, hint: failure.hint } });
  });
});
```

In `test/unit/rest-routes.test.ts`:
- `CATALOG_PATHS` becomes `['/collections', '/products', '/products/:slug', '/boutiques', '/knowledge']`
- the first test is titled "are the seven REST routes, the catalog's on Strapi's find and findOne actions", and its list has `['GET', '/knowledge', 'knowledge.find'],` after the boutiques row.

In `test/unit/register-mcp.test.ts`, the expected names (with `find_boutiques` disabled) become:

```ts
      'browse_collections', 'search_products', 'view_product', 'search_knowledge',
      'request_appointment', 'my_appointments', 'appointment_requests', 'confirm_appointment',
      'pending_confirmations', 'record_confirmation',
```

In `test/unit/constants.test.ts`, the second test becomes `it('declares the eleven tools exactly once each', …)` with `toHaveLength(11)` and `size).toBe(11)`.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run test/unit/catalog-tools.test.ts test/unit/rest-controllers.test.ts test/unit/rest-routes.test.ts test/unit/register-mcp.test.ts test/unit/constants.test.ts`
Expected: FAIL: the tool and the controller don't exist.

- [ ] **Step 3: Add the schemas, the tool and its registration**

In `server/src/mcp/schemas.ts`, after `findBoutiquesInput`:

```ts
export const searchKnowledgeInput = z.object({
  query: z.string().min(1).max(300).describe('The customer\'s question in their own words, e.g. "How do I care for the leather?"'),
  productSlugs: z.array(slugInput).max(5).optional().describe('Products the question is about, from search_products: only entries about them, and general ones.'),
  locale: localeInput,
});

export const knowledgeEntryOutput = z.object({
  title: z.string(),
  answer: z.string().describe('What Maison has written. Answer from this, in the customer\'s language.'),
  category: z.string(),
  productSlugs: z.array(z.string()).describe('The pieces it is about; empty when it applies to every piece.'),
});
```

Create `server/src/mcp/tools/search-knowledge.ts`:

```ts
import { z } from '@strapi/utils';

import { getConfig } from '../../config';
import { ACTION } from '../../constants';
import { toolError, toolSuccess } from '../../domain/tool-result';
import { defineTool } from '../define';
import { knowledgeEntryOutput, searchKnowledgeInput } from '../schemas';

export const searchKnowledgeTool = defineTool({
  name: 'search_knowledge',
  title: 'Search product knowledge',
  description:
    "Searches what Maison has written down for customers: care, materials, sizing, personalization, delivery, returns, repairs, warranty, gift wrapping and visiting a boutique. Use it for every question about those, and answer only from the entries it returns. It returns at most 4 entries, best first, or none. Never make up a policy.",
  auth: { policies: [{ action: ACTION.catalogRead }] },
  resolveInputSchema: () => searchKnowledgeInput,
  resolveOutputSchema: () =>
    z.object({
      locale: z.enum(['ja', 'en']),
      entries: z.array(knowledgeEntryOutput).describe('Best first. Empty when nothing Maison has written answers the question.'),
    }),
  createHandler: (strapi) => async ({ args }) => {
    const locale = args.locale ?? getConfig(strapi).defaultLocale;
    const result = await strapi.plugin('maison').service('catalog').searchKnowledge(locale, { query: args.query, productSlugs: args.productSlugs });
    if (!result.ok) return toolError(result.code, result.message, result.hint);
    return toolSuccess({ locale, ...result.value });
  },
});
```

In `server/src/mcp/index.ts`, add `import { searchKnowledgeTool } from './tools/search-knowledge';`, and after the `find_boutiques` line: `if (enabled('search_knowledge')) mcp.registerTool(searchKnowledgeTool);`

In `server/src/constants.ts`, add `'search_knowledge',` to `TOOL_NAMES` after `'find_boutiques',`.

- [ ] **Step 4: Add the REST door**

Create `server/src/controllers/knowledge.ts`:

```ts
import type { Core } from '@strapi/strapi';

import { getConfig } from '../config';
import { searchKnowledgeInput } from '../mcp/schemas';
import { fromQuery } from '../rest/query';
import { parseOrReply, replyFailure, replyValue } from '../rest/reply';

/**
 * Product knowledge over REST, at /api/maison/knowledge, as search_knowledge: the tool's input as query parameters
 * (productSlugs repeated), checked with the same schema, the same service, and the tool's structured content back. The
 * action is find, so a read-only API token may call it, as may a role or token holding plugin::maison.knowledge.find.
 */
export default ({ strapi }: { strapi: Core.Strapi }) => ({
  /** GET /knowledge, as search_knowledge. */
  async find(ctx) {
    const input = parseOrReply(ctx, searchKnowledgeInput, fromQuery(ctx.query, { lists: ['productSlugs'] }));
    if (!input) return;
    const locale = input.locale ?? getConfig(strapi).defaultLocale;
    const result = await strapi.plugin('maison').service('catalog').searchKnowledge(locale, input);
    if (!result.ok) return replyFailure(ctx, result);
    replyValue(ctx, { locale, ...result.value });
  },
});
```

In `server/src/controllers/index.ts`, import `knowledge` from `./knowledge` and add it to the exported object, keeping the names in alphabetical order.

In `server/src/routes/index.ts`, add `{ method: 'GET', path: '/knowledge', handler: 'knowledge.find' },` after the `/boutiques` route.

- [ ] **Step 5: Update the suites that need a Strapi** (the integration suite runs in Task 5)

In `test/integration/rest.test.mjs`:
- `CATALOG_ACTIONS` becomes `{ collections: ['find'], products: ['find', 'findOne'], boutiques: ['find'], knowledge: ['find'] }`
- add `'/knowledge?query=leather%20care&locale=en'` to `CATALOG_PATHS`
- add after "takes a list of products as a repeated parameter":

```js
  it("answers a question from product knowledge, with a piece's own entry first", async () => {
    const { status, body } = await call('GET', '/knowledge?query=Will%20it%20fit%20in%20the%20overhead%20bin%3F&productSlugs=cabin-case-55&locale=en');
    assert.equal(status, 200, JSON.stringify(body));
    assert.equal(body.locale, 'en');
    assert.equal(body.entries[0].title, 'Will the Cabin Case 55 fit in an airline overhead bin?');
  });
```

In `test/mcp/tools.test.mjs`, add `'search_knowledge'` to the expected customer and staff tool lists, in alphabetical order (just before `'search_products'`). This smoke test needs tokens from `scripts/mcp-dev-tokens.mjs`, which signs in as an admin. Don't run it unless such tokens are already there.

- [ ] **Step 6: Update the README and the changelog**

`README.md`:
- line 5: "Ten MCP tools" becomes "Eleven MCP tools".
- the Tools table gains, after `find_boutiques`: `` | `search_knowledge` | MCP: browse the catalog | What Maison has written down for customers, such as care, sizing, delivery, repairs, warranty and gift wrapping: the best four published entries for a question, or none | ``
- after the Tools table, add: "**Product knowledge** is a content type, `plugin::maison.knowledge`, localized with draft and publish. Each entry has a title, an answer of up to 2,000 characters, a category, the products it's about (`productSlugs`, empty for every piece) and keywords. `search_knowledge` scores published entries on the question's words: in the title most, then the keywords, then the answer. With `productSlugs`, it leaves out entries about other pieces, and an unknown or unpublished product is `not_found`. **Load demo catalog** adds 16 entries in English, also to a catalog loaded before."
- the REST routes table gains, after `/boutiques`: `` | `GET /api/maison/knowledge` | `search_knowledge` | `plugin::maison.knowledge.find` | ``
- the curl block gains `curl "$STRAPI/api/maison/knowledge?query=How%20do%20I%20care%20for%20the%20leather%3F&locale=en"` after the boutiques line.
- in "Grant the catalog", "The four actions:" becomes "The five actions:", with `- `plugin::maison.knowledge.find`, for `GET /knowledge`` added last.

`CHANGELOG.md`, first bullet under "## Unreleased" → "### Added":

```markdown
- **Product knowledge, and `search_knowledge`.** A new content type, `plugin::maison.knowledge`, localized with draft and publish: a title, an answer of up to 2,000 characters, a category, the products it's about (`productSlugs`, empty for every piece) and keywords. Saving one refuses a `productSlugs` that isn't a list of distinct slugs.
  - `search_knowledge` (MCP: browse the catalog) returns the best four published entries for a question, in its locale with the default locale filling in, scored on the question's words in the title, the keywords and the answer, or none. With `productSlugs`, entries about other pieces are left out, and an unknown or unpublished product is `not_found`.
  - `GET /api/maison/knowledge` is the same search over REST, on the action `plugin::maison.knowledge.find`.
  - **Load demo catalog** adds 16 product knowledge entries in English, also to a catalog loaded before. Its notice says what it added.
```

- [ ] **Step 7: Run every check**

Run: `npm test && npm run test:ts:back && npm run test:ts:front`
Expected: PASS, and no type errors.

- [ ] **Step 8: Commit**

```bash
git add server/src/mcp/tools/search-knowledge.ts server/src/mcp/schemas.ts server/src/mcp/index.ts server/src/constants.ts server/src/controllers/knowledge.ts server/src/controllers/index.ts server/src/routes/index.ts README.md CHANGELOG.md test/unit/catalog-tools.test.ts test/unit/rest-controllers.test.ts test/unit/rest-routes.test.ts test/unit/register-mcp.test.ts test/unit/constants.test.ts test/integration/rest.test.mjs test/mcp/tools.test.mjs
git commit -m "feat(knowledge): search_knowledge over MCP, and GET /api/maison/knowledge over REST

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Copy the plugin into the demo, and run the integration suites

Repo: the demo. **Run by the controller:** it stops and starts the demo's dev servers.

**Files:**
- Modify: `strapi/src/plugins/maison/**` (the copy), `strapi/scripts/maison-setup.mjs`, `scripts/maison-setup.test.mjs`, `README.md`

- [ ] **Step 1: Stop the demo's Strapi and app**

They're the controller's preview servers (`demo-strapi`, `demo-app`). Stop both: the install rebuilds Maison under Strapi.

- [ ] **Step 2: Copy the plugin at its new commit**

From `~/work/maison-demo`, run the block in README "The Maison plugin in this repo" with `SRC=../plugin-dev/plugins/strapi-store-demo-mcp`. Expected: "The staged copy matches <sha>".

- [ ] **Step 3: Give the Public role the new read**

In `strapi/scripts/maison-setup.mjs`, add `'plugin::maison.knowledge.find',` to `PUBLIC_ACTIONS` after `'plugin::maison.boutiques.find',`. In the header comment, "the Public role gets Maison's four catalog actions" becomes "the Public role gets Maison's five catalog actions". In `scripts/maison-setup.test.mjs`, add `'plugin::maison.knowledge.find'` to the end of `CATALOG`.

- [ ] **Step 4: Run the demo's tests**

Run: `npm test`
Expected: PASS (liff, Maison, the share check and the node suites).

- [ ] **Step 5: Run the integration suites, with Strapi stopped**

From the plugin repo: `STRAPI_APP_DIR=$HOME/work/maison-demo/strapi npm run test:integration`
Expected: every suite passes, including `knowledge.test.mjs`, the updated `seed.test.mjs` and `rest.test.mjs`.

- [ ] **Step 6: Update the README**

In `README.md`:
- "What's in the repo": "content types, ten MCP tools and a prompt" becomes "content types, eleven MCP tools and a prompt".
- "The REST door": "Maison's four catalog actions (`plugin::maison.collections.find`, `products.find`, `products.findOne` and `boutiques.find`)" becomes "Maison's five catalog actions (`plugin::maison.collections.find`, `products.find`, `products.findOne`, `boutiques.find` and `knowledge.find`)". Add `curl "$STRAPI/api/maison/knowledge?query=How%20do%20I%20care%20for%20the%20leather%3F&locale=en"` after the boutiques curl line, and to the parameters bullet: "Product knowledge takes `query`, `productSlugs` and `locale`."
- "Handoff": add `search_knowledge` after `find_boutiques` in the customer tools.
- "The Maison plugin in this repo": the commit becomes the one just copied.
- "Before going on stage": add "- [ ] On the board, **Load demo catalog** once after updating: a catalog loaded before gets Maison's 16 product knowledge entries, in English."

- [ ] **Step 7: Commit**

```bash
git add strapi/src/plugins/maison strapi/scripts/maison-setup.mjs scripts/maison-setup.test.mjs README.md
git commit -m "chore(strapi): the Maison plugin at <sha>: product knowledge and search_knowledge

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(Write the real commit in place of `<sha>`.)

- [ ] **Step 8: Start Strapi and the app again, and load the knowledge**

Start `demo-strapi`. Wait for `http://127.0.0.1:1338/_health` to answer 204. Then, from the repo root, run `npm run setup`. This is for the local Strapi only, never Strapi Cloud. It loads the knowledge into the catalog loaded before, and gives the Public role `knowledge.find`. It also replaces the local OAuth client, so start `demo-app` only after it. Check both with `curl -s "http://localhost:1338/api/maison/knowledge?query=leather&locale=en"`: expected, 200 and the leather care entry first.

---

### Task 6: The concierge answers from product knowledge, and hands off to the LINE chat

Repo: the demo (`liff/`).

**Files:**
- Create: `liff/lib/tool-view.ts`, `liff/lib/tool-view.test.ts`
- Modify: `liff/lib/concierge.ts`, `liff/lib/concierge.test.ts`, `liff/components/chat-parts.tsx`, `liff/lib/copy.ts`, `liff/live/concierge.live.test.ts`, `README.md`

**Interfaces:**
- Consumes: the MCP tool `search_knowledge` (Task 4), whose output has one list, `entries`.
- Produces: the local tool `hand_off_to_staff` (input: an object, any keys ignored; output `{ handedOff: true }`); `toolView(part, locale)` in `lib/tool-view.ts`, returning `{ line, failed, products, appointment, handOff }`; `COPY[locale].handOff`.

- [ ] **Step 1: Write the failing tests**

Create `liff/lib/tool-view.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { toolPartOf, toolView } from './tool-view';

describe('toolView', () => {
  it('shows a hand-off as a local line, with the hand-off note under it', () => {
    const view = toolView({ toolName: 'hand_off_to_staff', state: 'output-available', output: { handedOff: true } }, 'en');
    expect(view.line).toBe('Local · hand_off_to_staff ✓');
    expect(view.handOff).toBe(true);
    expect(view.failed).toBe(false);
  });

  it('shows no note while the hand-off runs, or when it failed', () => {
    expect(toolView({ toolName: 'hand_off_to_staff', state: 'input-available' }, 'en').handOff).toBe(false);
    expect(toolView({ toolName: 'hand_off_to_staff', state: 'output-error', errorText: 'x' }, 'en').handOff).toBe(false);
  });

  it('counts what search_knowledge found, on an MCP line, with no note', () => {
    const output = { content: [{ type: 'text', text: '{}' }], structuredContent: { locale: 'en', entries: [{ title: 'A' }, { title: 'B' }] } };
    const view = toolView({ toolName: 'search_knowledge', state: 'output-available', output }, 'en');
    expect(view.line).toBe('MCP · search_knowledge ✓ 2 results');
    expect(view.handOff).toBe(false);
  });

  it('still names the day resolve_date worked out', () => {
    const output = { date: '2026-10-10', weekday: 'Saturday', isPast: false };
    expect(toolView({ toolName: 'resolve_date', state: 'output-available', output }, 'en').line).toBe('Local · resolve_date ✓ Saturday 2026-10-10');
  });
});

describe('toolPartOf', () => {
  it("reads a local tool's name from its part type, and skips text", () => {
    expect(toolPartOf({ type: 'tool-hand_off_to_staff' })?.toolName).toBe('hand_off_to_staff');
    expect(toolPartOf({ type: 'text' })).toBeNull();
  });
});
```

In `liff/lib/concierge.test.ts`:
- in "gives the model resolve_date next to the Maison tools", the expected names become `['hand_off_to_staff', 'resolve_date', 'search_products']`, and the title becomes "gives the model resolve_date and hand_off_to_staff next to the Maison tools".
- add after "never runs resolve_date on input that names more than one day, and tells the model why":

```ts
  it('answers hand_off_to_staff with handedOff, whatever blanks or extra keys the model sends', async () => {
    for (const input of [{}, { question: null, locale: 'en' }]) {
      const { createMcpClient } = fakeMcp();
      const model = callsThenReplies('hand_off_to_staff', input);
      const response = await handleConcierge(ask('Bearer mcp_at_x', { ...hello, locale: 'en' }), deps({ createMcpClient, model }));
      const result = eventsOf(await response.text()).find((event) => event.type === 'tool-output-available');
      expect(result?.output, JSON.stringify(input)).toEqual({ handedOff: true });
    }
  });
```

- in `describe('conciergeInstructions')`, add:

```ts
  it('sends questions about policies to search_knowledge, and the ones it has no answer to, to hand_off_to_staff, in both reply languages', () => {
    for (const locale of ['en', 'ja'] as const) {
      const text = conciergeInstructions(locale, now);
      expect(text, locale).toMatch(/call search_knowledge with the customer's own words/);
      expect(text, locale).toMatch(/Answer only from the entries it returns, and never invent a policy, a price or a time\./);
      expect(text, locale).toMatch(/If no entry answers the question, call hand_off_to_staff/);
      expect(text, locale).toMatch(/Never say the team will contact them\./);
    }
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm test --prefix liff`
Expected: FAIL: `lib/tool-view.ts` doesn't exist, the model gets no `hand_off_to_staff`, and the instructions have no rule 9.

- [ ] **Step 3: Move the tool lines into lib/tool-view.ts, with the hand-off**

Create `liff/lib/tool-view.ts`, with the code moved from `components/chat-parts.tsx` (relative imports, so Vitest can load it):

```ts
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import { COPY } from './copy';
import { toolErrorOf } from './mcp';
import type { Appointment, Locale, ProductCard } from './types';

/** What the chat needs from AI SDK 7's dynamic-tool UI part (MCP tools arrive as dynamic tools). */
export interface ToolPart {
  toolName: string;
  state: string;
  output?: unknown;
  errorText?: string;
}

/**
 * A message part as a tool call, or null when it isn't one. MCP tools arrive as `dynamic-tool` parts, which carry their
 * name. The concierge's own tools (resolve_date, hand_off_to_staff) arrive as `tool-<name>` parts, with the name in the type.
 */
export const toolPartOf = (part: { type: string }): ToolPart | null => {
  if (part.type === 'dynamic-tool') return part as unknown as ToolPart;
  if (part.type.startsWith('tool-')) return { ...part, toolName: part.type.slice('tool-'.length) } as unknown as ToolPart;
  return null;
};

/** The concierge's own tools. They aren't Maison tools, so their lines say "Local", not "MCP". */
const LOCAL_TOOLS = ['resolve_date', 'hand_off_to_staff'];

/** What `resolve_date` returned, for its line: the weekday and date the model was given. */
const resolvedDay = (output: unknown): string | null => {
  const day = output as { date?: unknown; weekday?: unknown } | null;
  return typeof day?.date === 'string' && typeof day.weekday === 'string' ? `${day.weekday} ${day.date}` : null;
};

/**
 * What a tool call shows in the chat, built from its structuredContent, never from the model's text: its line ("MCP ·
 * search_products ✓ 5 results", "Local · resolve_date ✓ Saturday 2026-10-10", "… ✕ boutique_closed"), the products a
 * search found, the appointment a request made, and whether a hand-off went through, for the note and the LINE chat
 * button under it.
 */
export const toolView = (part: ToolPart, locale: Locale) => {
  const t = COPY[locale];
  const local = LOCAL_TOOLS.includes(part.toolName);
  const output = part.state === 'output-available' ? (part.output as CallToolResult) : null;
  const error = output ? toolErrorOf(output) : null;
  const failed = part.state === 'output-error' || error !== null;
  const data = output && !error ? (output.structuredContent as Record<string, unknown> | undefined) : undefined;
  const list = Object.values(data ?? {}).find(Array.isArray) as unknown[] | undefined;
  const answer = local && !failed ? resolvedDay(part.output) : null;
  const status = part.state.startsWith('input')
    ? '…'
    : failed
      ? `✕ ${error?.code ?? 'error'}`
      : `✓${answer ? ` ${answer}` : list ? ` ${t.results(list.length)}` : ''}`;
  return {
    line: `${local ? 'Local' : 'MCP'} · ${part.toolName} ${status}`,
    failed,
    products: part.toolName === 'search_products' && Array.isArray(data?.products) ? (data.products as ProductCard[]) : null,
    appointment: part.toolName === 'request_appointment' ? ((data?.appointment as Appointment | undefined) ?? null) : null,
    handOff: part.toolName === 'hand_off_to_staff' && part.state === 'output-available' && !failed,
  };
};
```

In `liff/components/chat-parts.tsx`:
- delete `ToolPart`, `toolPartOf`, `LOCAL_TOOLS`, `resolvedDay` and `toolView`, and the imports only they used (`CallToolResult`, `toolErrorOf`)
- add `import { toolPartOf, toolView } from '@/lib/tool-view';`
- in `AssistantParts`, after the `if (view.appointment) { … }` block:

```tsx
    if (view.handOff) {
      cards.push(
        <div key={`hand-off-${index}`} data-testid="hand-off" className="flex flex-col gap-2.5">
          <p className="text-body text-graphite">{COPY[locale].handOff}</p>
          <LineChat />
        </div>
      );
    }
```

- `AssistantParts`' comment adds, after "'Chat with Maison on LINE' under the card,": "the hand-off note with the same button under a hand_off_to_staff line,".

In `liff/lib/copy.ts`, after `visitRequested` in `ja`:

```ts
    // Under the concierge's hand_off_to_staff line, above "Chat with Maison on LINE" (components/chat-parts.tsx). Nothing
    // reaches staff from the app yet: the customer asks in Maison's LINE chat.
    handOff: 'このようなご質問には、MaisonのLINEトークで担当者がお答えします。',
```

and after `visitRequested` in `en`: `handOff: "Our team answers questions like this in Maison's LINE chat.",`

- [ ] **Step 4: Give the concierge the rule and the tool**

In `liff/lib/concierge.ts`:
- add rule 9 as the last line of the instructions, after rule 8:

```
9. For a question about Maison's services and policies, such as care, materials, sizing, personalization, delivery, payment, returns, repairs, warranty or gift wrapping, call search_knowledge with the customer's own words, and with productSlugs when the question is about particular pieces. Answer only from the entries it returns, and never invent a policy, a price or a time. If no entry answers the question, call hand_off_to_staff next, before you write anything, and then say in one short sentence that you don't have that information: the app shows the customer where Maison's team answers. Don't mention the LINE chat yourself, and never say the team will contact them.
```

- add, after `resolveDateTool`:

```ts
/**
 * The concierge's second own tool. When nothing Maison has written answers a question, it calls this, and the chat
 * shows where Maison's team answers, with the LINE chat button (components/chat-parts.tsx). It sends nothing and logs
 * nothing yet, so the customer asks the team there. Any input is accepted and ignored: the local model sends nulls and a
 * locale.
 */
const handOffTool = () =>
  tool({
    description:
      "Call it when search_knowledge returns no entry that answers the customer's question. The app then shows the customer a button that opens Maison's LINE chat, where Maison's team answers. It sends nothing itself, so never say the team will contact the customer.",
    inputSchema: z.object({}),
    execute: async () => ({ handedOff: true }),
  });
```

- in `handleConcierge`, the tools become `{ ...(await withConversationLocale(await mcp.tools(), locale)), resolve_date: resolveDateTool(locale, now), hand_off_to_staff: handOffTool() }`.

- [ ] **Step 5: Run the tests and the type check**

Run: `npm test --prefix liff && npm run typecheck --prefix liff`
Expected: PASS, and no type errors.

- [ ] **Step 6: Add the live checks, in English as on stage**

In `liff/live/concierge.live.test.ts`, inside `describe.skipIf(!ready)('the concierge on the local model', …)`, after `afterAll`:

```ts
  /** One English turn through the real route, as the app sends it: the stream's events. */
  const turn = async (text: string) => {
    const response = await POST(
      new Request('http://localhost:3003/api/concierge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ locale: 'en', messages: [{ id: 'u1', role: 'user', parts: [{ type: 'text', text }] }] }),
      })
    );
    expect(response.status).toBe(200);
    return sseEvents(await response.text());
  };
  const toolsIn = (events: Array<Record<string, any>>) => events.filter((event) => event.type === 'tool-input-available').map((event) => event.toolName as string);
  const textOf = (events: Array<Record<string, any>>) => events.filter((event) => event.type === 'text-delta').map((event) => event.delta as string).join('');
```

and at the end of that describe:

```ts
  it("answers a care question from Maison's product knowledge", async () => {
    const events = await turn('How do I care for the leather?');
    const answer = textOf(events);
    const found = events
      .filter((event) => event.type === 'tool-output-available')
      .flatMap((event) => (event.output?.structuredContent?.entries as Array<{ title: string }> | undefined) ?? []);
    expect(toolsIn(events), answer).toContain('search_knowledge');
    expect(found.map((entry) => entry.title), answer).toContain('How do I care for the leather?');
    expect(toolsIn(events), answer).not.toContain('hand_off_to_staff');
    expect(answer, 'the answer uses the entry').toMatch(/cloth|sunlight|balm/i);
  });

  it("sends a question Maison hasn't written about to the LINE chat", async () => {
    const events = await turn('Can I pay in bitcoin?');
    const answer = textOf(events);
    expect(toolsIn(events), answer).toContain('search_knowledge');
    expect(toolsIn(events), answer).toContain('hand_off_to_staff');
  });
```

These run only with `npm run test:live` (Ollama, the local Strapi with the knowledge loaded, and a client ID). They book nothing.

- [ ] **Step 7: Update the README**

In `README.md`, "Models", add after the "Dates are a tool" bullet:

```markdown
- **Product questions go to product knowledge.** For care, sizing, delivery, repairs, warranty, gift wrapping and the like, the concierge calls `search_knowledge` and answers only from the entries it returns. When none answers, it calls `hand_off_to_staff`, a local tool like `resolve_date`. Its line reads `Local · hand_off_to_staff ✓`, with "Our team answers questions like this in Maison's LINE chat." and **Chat with Maison on LINE** under it. Nothing reaches staff from the app yet: the customer asks in the chat.
```

and under "The 3-minute run" table:

```markdown
**Optional, 20 seconds, after the booking:** ask "How do I care for the leather?". The line under the reply reads `MCP · search_knowledge ✓ …`, and the answer comes from Maison's own product knowledge in Strapi.
```

- [ ] **Step 8: Commit**

```bash
git add liff/lib/tool-view.ts liff/lib/tool-view.test.ts liff/lib/concierge.ts liff/lib/concierge.test.ts liff/components/chat-parts.tsx liff/lib/copy.ts liff/live/concierge.live.test.ts README.md
git commit -m "feat(liff): the concierge answers from product knowledge, and hands what it can't answer to the LINE chat

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Check it end to end, then deploy with Paul

**Run by the controller, with Paul for the push.**

- [ ] **Step 1: Check it in the browser, in local mode**

With `demo-strapi` and `demo-app` running and the knowledge loaded (Task 5, step 8), open `http://localhost:3003` at phone size, in English. Then:
- Ask the concierge "How do I care for the leather?". Expected: the line `MCP · search_knowledge ✓ …`, and an answer drawn from the leather care entry.
- Ask "Can I pay in bitcoin?". Expected: `Local · hand_off_to_staff ✓`, the note, and **Chat with Maison on LINE** under it.

With the local model, allow 20 to 60 seconds a turn. If Ollama is down, run the same two questions through `npm run test:live` later, or on Claude with Paul's key.

- [ ] **Step 2: Ask Paul to approve the push**

Every commit is local until he approves. Then fast-forward `main` to `feat/maison-demo` and push both. **This deploys Strapi Cloud and Vercel.** The plugin repo's `feat/maison-plugin` push is a separate yes.

- [ ] **Step 3: After the deploy**

- On the Strapi Cloud admin: Maison → Demo data → **Load demo catalog**. Expected notice: "The demo catalog is already loaded. Added 16 product knowledge entries."
- Optional, for websites: Settings → Users & Permissions plugin → Roles → Public → Maison → `knowledge` → `find`. Don't run `npm run setup` against Cloud.
- Phone check in LINE, in English: the two questions from step 1.

- [ ] **Step 4: Tell Paul what else changed**

The deck says "10 Maison tools" on the architecture slide. It's 11 now.
