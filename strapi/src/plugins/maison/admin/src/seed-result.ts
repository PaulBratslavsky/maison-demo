/** What POST /maison/demo/seed answers (the seed service's SeedResult). */
export type SeedResult = { created: boolean; collections: number; products: number; boutiques: number; stockLevels: number; knowledge: number };

/** "a, b and c": a list joined with commas, and "and" before its last item. */
const andList = (parts: string[]): string => (parts.length < 2 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`);

/** The notice after Load demo catalog. */
export const describeSeed = (result: SeedResult): string => {
  if (result.created) {
    const loaded = [`${result.products} products`, `${result.collections} collections`, `${result.boutiques} boutiques`, `${result.stockLevels} stock levels`];
    if (result.knowledge > 0) loaded.push(`${result.knowledge} product knowledge entries`);
    return `Loaded ${andList(loaded)}.`;
  }
  return result.knowledge > 0
    ? `The demo catalog is already loaded. Added ${result.knowledge} product knowledge entries.`
    : 'The demo catalog and its product knowledge are already loaded.';
};
