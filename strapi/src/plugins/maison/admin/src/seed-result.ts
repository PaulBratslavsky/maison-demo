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
