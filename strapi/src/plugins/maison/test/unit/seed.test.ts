import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import content from '../../server/seed/content.json';
import knowledge from '../../server/seed/knowledge.json';
import seedService, { imageMimeType } from '../../server/src/services/seed';

// The service finds its images from the bundled dist/ layout, so from the source tree they aren't there.
// Stand in for the file system: these tests only look at what gets uploaded.
vi.mock('node:fs/promises', () => ({ stat: async () => ({ size: 1024 }) }));

describe('imageMimeType', () => {
  it('maps each supported extension to its image type', () => {
    expect(imageMimeType('product-weekender-50.jpg')).toBe('image/jpeg');
    expect(imageMimeType('collection-voyage.jpeg')).toBe('image/jpeg');
    expect(imageMimeType('boutique-ginza.png')).toBe('image/png');
    expect(imageMimeType('boutique-osaka.webp')).toBe('image/webp');
  });

  it('ignores the case of the extension', () => {
    expect(imageMimeType('IMG_0042.JPG')).toBe('image/jpeg');
    expect(imageMimeType('logo.Png')).toBe('image/png');
  });

  it('goes by the last extension only', () => {
    expect(imageMimeType('photo.png.jpg')).toBe('image/jpeg');
  });

  it('throws a clear error for any other extension, naming the file and what is allowed', () => {
    for (const fileName of ['notes.txt', 'photo.gif', 'photo.jpg.bak', 'no-extension']) {
      expect(() => imageMimeType(fileName)).toThrow(`Unsupported seed image "${fileName}"`);
    }
    expect(() => imageMimeType('photo.gif')).toThrow('.jpg, .jpeg, .png, .webp');
  });
});

describe('loadDemoCatalog', () => {
  it('uploads every catalog image with the type of its file extension', async () => {
    const upload = vi.fn(async (_args: { files: { originalFilename: string; mimetype: string } }) => [{ id: 1 }]);
    const documents = {
      findFirst: async () => null,
      count: async () => 0,
      create: async () => ({ documentId: 'doc' }),
      update: async () => ({}),
      publish: async () => ({}),
    };
    const strapi = {
      plugin: (id: string) => ({
        service: () => (id === 'upload' ? { upload } : { findByCode: async () => ({}), create: async () => ({}) }),
      }),
      documents: () => documents,
    } as any;

    await seedService({ strapi }).loadDemoCatalog();

    const uploaded = upload.mock.calls.map(([{ files }]) => [files.originalFilename, files.mimetype]);
    expect(uploaded).toHaveLength(content.boutiques.length + content.collections.length + content.products.length);

    // The expected types are spelled out here, not taken from imageMimeType, so a wrong mapping can't agree with itself.
    const typeOf: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
    for (const [fileName, mimetype] of uploaded) expect(mimetype, fileName).toBe(typeOf[path.extname(fileName)]);
  });
});

describe('loadDemoCatalog and the product knowledge', () => {
  const KNOWLEDGE = 'plugin::maison.knowledge';

  /**
   * A Strapi whose catalog is or isn't there, with `knowledgeCount` English knowledge entries. It records every call to
   * count, create and publish with its arguments, and each create answers a documentId of its own.
   */
  const strapiWith = ({ catalogThere, knowledgeCount }: { catalogThere: boolean; knowledgeCount: number }) => {
    const counted: Array<{ uid: string; params: unknown }> = [];
    const created: Array<{ uid: string; locale: string; data: unknown }> = [];
    const published: Array<{ uid: string; documentId: string; locale: string }> = [];
    const documents = (uid: string) => ({
      findFirst: async () => (catalogThere ? { documentId: 'existing' } : null),
      count: async (params: unknown) => {
        counted.push({ uid, params });
        return uid === KNOWLEDGE ? knowledgeCount : 0;
      },
      create: async ({ locale, data }: { locale: string; data: unknown }) => {
        created.push({ uid, locale, data });
        return { documentId: `doc-${created.length}` };
      },
      update: async () => ({}),
      publish: async ({ documentId, locale }: { documentId: string; locale: string }) => {
        published.push({ uid, documentId, locale });
        return {};
      },
    });
    const strapi = {
      plugin: (id: string) => ({
        service: () => (id === 'upload' ? { upload: async () => [{ id: 1 }] } : { findByCode: async () => ({}), create: async () => ({}) }),
      }),
      documents,
    } as any;
    return { strapi, counted, created, published };
  };

  it('adds the product knowledge in English to a catalog loaded before, and publishes it', async () => {
    const { strapi, counted, created, published } = strapiWith({ catalogThere: true, knowledgeCount: 0 });
    expect(await seedService({ strapi }).loadDemoCatalog()).toEqual({
      created: false, collections: 0, products: 0, boutiques: 0, stockLevels: 0, knowledge: knowledge.entries.length,
    });
    // It looks for English entries, creates each entry in English with its own data, and publishes what it created.
    expect(counted).toEqual([{ uid: KNOWLEDGE, params: { locale: 'en' } }]);
    expect(created).toEqual(knowledge.entries.map((data) => ({ uid: KNOWLEDGE, locale: 'en', data })));
    expect(published).toEqual(knowledge.entries.map((_entry, index) => ({ uid: KNOWLEDGE, documentId: `doc-${index + 1}`, locale: 'en' })));
  });

  it('adds nothing when there are English entries already', async () => {
    const { strapi, counted, created, published } = strapiWith({ catalogThere: true, knowledgeCount: 3 });
    expect((await seedService({ strapi }).loadDemoCatalog()).knowledge).toBe(0);
    expect(counted).toEqual([{ uid: KNOWLEDGE, params: { locale: 'en' } }]);
    expect(created).toEqual([]);
    expect(published).toEqual([]);
  });
});

describe('resetDemoAppointments', () => {
  const KNOWLEDGE = 'plugin::maison.knowledge';
  const QUESTION = 'plugin::maison.question';
  const INQUIRY = 'plugin::maison.inquiry';
  const NOTIFICATION = 'plugin::maison.notification';
  const APPOINTMENT = 'plugin::maison.appointment';

  type Call = { uid: string; method: 'findMany' | 'delete'; params: any };

  /**
   * A Strapi holding these rows, by content type. It records every findMany and delete with its arguments, in order. A
   * delete of a document in `failing` throws, as one Strapi couldn't finish would.
   */
  const strapiHolding = (rows: Record<string, Array<Record<string, unknown>>>, { failing = [] }: { failing?: string[] } = {}) => {
    const calls: Call[] = [];
    const documents = (uid: string) => ({
      findMany: async (params: unknown) => {
        calls.push({ uid, method: 'findMany', params });
        return rows[uid] ?? [];
      },
      delete: async (params: { documentId: string }) => {
        calls.push({ uid, method: 'delete', params });
        if (failing.includes(params.documentId)) throw new Error(`could not delete ${params.documentId}`);
        return { documentId: params.documentId, entries: [] };
      },
    });
    return { strapi: { documents } as any, calls };
  };

  /**
   * Three appointments and two notifications. Of three questions, two have answers that became knowledge entries. Three
   * inquiries, whatever became of them: one is open, one was replied to and one was closed.
   */
  const REHEARSAL = {
    [APPOINTMENT]: [{ documentId: 'a1' }, { documentId: 'a2' }, { documentId: 'a3' }],
    [NOTIFICATION]: [{ documentId: 'n1' }, { documentId: 'n2' }],
    [QUESTION]: [
      { documentId: 'q1', knowledgeDocumentId: 'k1' },
      { documentId: 'q2', knowledgeDocumentId: 'k2' },
      // Still open, or answered with Add to product knowledge unticked.
      { documentId: 'q3', knowledgeDocumentId: null },
    ],
    [INQUIRY]: [{ documentId: 'i1' }, { documentId: 'i2' }, { documentId: 'i3' }],
  };

  const deletions = (calls: Call[]) => calls.filter(({ method }) => method === 'delete').map(({ uid, params }) => [uid, params]);

  it('answers what it deleted: appointments, notifications, questions, inquiries, and the knowledge entries the answers added', async () => {
    const { strapi } = strapiHolding(REHEARSAL);
    expect(await seedService({ strapi }).resetDemoAppointments()).toEqual({
      appointments: 3,
      notifications: 2,
      questions: 3,
      inquiries: 3,
      knowledge: 2,
    });
  });

  it('deletes the knowledge entries in every language first, then the questions and the inquiries, then the notifications and appointments', async () => {
    const { strapi, calls } = strapiHolding(REHEARSAL);
    await seedService({ strapi }).resetDemoAppointments();
    expect(deletions(calls)).toEqual([
      [KNOWLEDGE, { documentId: 'k1', locale: '*' }],
      [KNOWLEDGE, { documentId: 'k2', locale: '*' }],
      [QUESTION, { documentId: 'q1' }],
      [QUESTION, { documentId: 'q2' }],
      [QUESTION, { documentId: 'q3' }],
      [INQUIRY, { documentId: 'i1' }],
      [INQUIRY, { documentId: 'i2' }],
      [INQUIRY, { documentId: 'i3' }],
      [NOTIFICATION, { documentId: 'n1' }],
      [NOTIFICATION, { documentId: 'n2' }],
      [APPOINTMENT, { documentId: 'a1' }],
      [APPOINTMENT, { documentId: 'a2' }],
      [APPOINTMENT, { documentId: 'a3' }],
    ]);
  });

  it('deletes every inquiry, whether it is open, replied to or closed: it reads them with no filter, as many as the other content types', async () => {
    const { strapi, calls } = strapiHolding(REHEARSAL);
    await seedService({ strapi }).resetDemoAppointments();
    const read = calls.find(({ uid, method }) => uid === INQUIRY && method === 'findMany');
    expect(read?.params).toEqual({ fields: ['documentId'], limit: 5000 });
    expect(read?.params).not.toHaveProperty('filters');
  });

  it("asks Strapi for each question's knowledgeDocumentId, which it leaves out of a row unless the fields name it", async () => {
    const { strapi, calls } = strapiHolding(REHEARSAL);
    await seedService({ strapi }).resetDemoAppointments();
    const read = calls.find(({ uid, method }) => uid === QUESTION && method === 'findMany');
    expect(read?.params.fields).toEqual(expect.arrayContaining(['documentId', 'knowledgeDocumentId']));
  });

  it("leaves the seeded knowledge alone: it never lists knowledge, and deletes only the entries a question's answer added", async () => {
    const { strapi, calls } = strapiHolding(REHEARSAL);
    await seedService({ strapi }).resetDemoAppointments();
    expect(calls.filter(({ uid }) => uid === KNOWLEDGE).map(({ method, params }) => [method, params.documentId])).toEqual([
      ['delete', 'k1'],
      ['delete', 'k2'],
    ]);
  });

  it('deletes no knowledge when no question has an entry, or when there are no questions', async () => {
    const { strapi, calls } = strapiHolding({ ...REHEARSAL, [QUESTION]: [{ documentId: 'q1' }, { documentId: 'q2', knowledgeDocumentId: '' }] });
    expect(await seedService({ strapi }).resetDemoAppointments()).toEqual({
      appointments: 3,
      notifications: 2,
      questions: 2,
      inquiries: 3,
      knowledge: 0,
    });
    expect(calls.filter(({ uid }) => uid === KNOWLEDGE)).toEqual([]);

    const empty = strapiHolding({});
    expect(await seedService({ strapi: empty.strapi }).resetDemoAppointments()).toEqual({
      appointments: 0,
      notifications: 0,
      questions: 0,
      inquiries: 0,
      knowledge: 0,
    });
    expect(deletions(empty.calls)).toEqual([]);
  });

  it('deletes the inquiries when there are no questions, and the questions when there are no inquiries', async () => {
    const noQuestions = strapiHolding({ ...REHEARSAL, [QUESTION]: [] });
    expect((await seedService({ strapi: noQuestions.strapi }).resetDemoAppointments()).inquiries).toBe(3);
    expect(deletions(noQuestions.calls).filter(([uid]) => uid === INQUIRY)).toHaveLength(3);

    const noInquiries = strapiHolding({ ...REHEARSAL, [INQUIRY]: [] });
    expect((await seedService({ strapi: noInquiries.strapi }).resetDemoAppointments()).questions).toBe(3);
    expect(deletions(noInquiries.calls).filter(([uid]) => uid === QUESTION)).toHaveLength(3);
  });

  it('stops before it deletes any question when an entry will not delete, so running the reset again finds the same entries', async () => {
    const { strapi, calls } = strapiHolding(REHEARSAL, { failing: ['k2'] });
    await expect(seedService({ strapi }).resetDemoAppointments()).rejects.toThrow('could not delete k2');
    expect(deletions(calls).map(([uid]) => uid)).toEqual([KNOWLEDGE, KNOWLEDGE]);
  });
});
