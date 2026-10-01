import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import content from '../../server/seed/content.json';
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
