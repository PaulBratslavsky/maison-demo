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

/** What POST /maison/demo/reset answers (the seed service's resetDemoAppointments): what it deleted. */
export type ResetResult = { appointments: number; notifications: number; questions: number; knowledge: number };

/** "1 question", "0 questions": the singular for exactly one. */
const counted = (count: number, singular: string, plural: string): string => `${count} ${count === 1 ? singular : plural}`;

/** The notice after Reset demo appointments and questions. */
export const describeReset = (result: ResetResult): string =>
  `Deleted ${andList([
    counted(result.appointments, 'appointment', 'appointments'),
    counted(result.notifications, 'notification', 'notifications'),
    counted(result.questions, 'question', 'questions'),
    counted(result.knowledge, 'product knowledge entry', 'product knowledge entries'),
  ])}.`;
