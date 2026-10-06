/**
 * What POST /maison/demo/seed answers (the seed service's SeedResult): `knowledge` is the English product knowledge
 * entries it added, and `knowledgeJa` the Japanese versions.
 */
export type SeedResult = {
  created: boolean;
  collections: number;
  products: number;
  boutiques: number;
  stockLevels: number;
  knowledge: number;
  knowledgeJa: number;
};

/** "a, b and c": a list joined with commas, and "and" before its last item. */
const andList = (parts: string[]): string => (parts.length < 2 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`);

/** "1 question", "0 questions": the singular for exactly one. */
const counted = (count: number, singular: string, plural: string): string => `${count} ${count === 1 ? singular : plural}`;

/** The product knowledge added, by language: "16 product knowledge entries in English", "16 in Japanese". */
const knowledgeAdded = ({ knowledge, knowledgeJa }: SeedResult): string[] => {
  const entries = (count: number) => counted(count, 'product knowledge entry', 'product knowledge entries');
  const added = knowledge > 0 ? [`${entries(knowledge)} in English`] : [];
  if (knowledgeJa > 0) added.push(`${added.length > 0 ? knowledgeJa : entries(knowledgeJa)} in Japanese`);
  return added;
};

/** The notice after Load demo catalog. */
export const describeSeed = (result: SeedResult): string => {
  const knowledge = knowledgeAdded(result);
  if (result.created) {
    const loaded = [`${result.products} products`, `${result.collections} collections`, `${result.boutiques} boutiques`, `${result.stockLevels} stock levels`];
    return `Loaded ${andList([...loaded, ...knowledge])}.`;
  }
  return knowledge.length > 0
    ? `The demo catalog is already loaded. Added ${andList(knowledge)}.`
    : 'The demo catalog and its product knowledge are already loaded.';
};

/** What POST /maison/demo/reset answers (the seed service's resetDemoAppointments): what it deleted. */
export type ResetResult = { appointments: number; notifications: number; questions: number; inquiries: number; knowledge: number };

/** The notice after Reset demo activity. */
export const describeReset = (result: ResetResult): string =>
  `Deleted ${andList([
    counted(result.appointments, 'appointment', 'appointments'),
    counted(result.notifications, 'notification', 'notifications'),
    counted(result.questions, 'question', 'questions'),
    counted(result.inquiries, 'inquiry', 'inquiries'),
    counted(result.knowledge, 'product knowledge entry', 'product knowledge entries'),
  ])}.`;

/** What POST /maison/demo/activity answers (the seed service's ActivityResult): all zeros, with `created` false, when it was there already. */
export type ActivityResult = { created: boolean; customers: number; appointments: number; confirmed: number; questions: number; inquiries: number };

/** The notice after Load demo activity. */
export const describeActivity = (result: ActivityResult): string =>
  result.created
    ? `Loaded ${andList([
        `${counted(result.appointments, 'request', 'requests')} (${result.confirmed} confirmed)`,
        counted(result.questions, 'question', 'questions'),
        counted(result.inquiries, 'inquiry', 'inquiries'),
      ])} from ${counted(result.customers, 'made-up customer', 'made-up customers')}.`
    : 'The demo activity is already loaded. Reset demo activity first to load it again.';
