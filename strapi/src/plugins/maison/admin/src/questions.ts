/**
 * What the Customer questions section of the Maison page shows and sends, apart from React: the rows of
 * GET /maison/questions, and the answer POST /maison/questions/:reference/answer takes.
 */

export type QuestionStatus = 'open' | 'taken' | 'answered';
export type QuestionReason = 'no_answer' | 'asked_for_person';

/** One row of GET /maison/questions (StaffQuestionView on the server). */
export interface StaffQuestion {
  reference: string;
  /** The customer, masked like "line:U4af…88". Staff never see the full LINE user ID. */
  customer: string;
  /** The customer's LINE display name, when LINE gave one. */
  customerName: string | null;
  question: string;
  reason: QuestionReason;
  language: 'ja' | 'en';
  product: { slug: string; name: string } | null;
  status: QuestionStatus;
  /** Who took the question, then who answered it. */
  staffName: string | null;
  takenAt: string | null;
  answeredAt: string | null;
  answer: string | null;
  /** Whether the answer became a product knowledge entry. */
  addedToKnowledge: boolean;
  /** How the last LINE message to the customer went, or null before there was one. */
  line: { outcome: 'sent' | 'failed'; detail: string } | null;
  /** When the concierge handed the question over, as an ISO string in UTC. */
  createdAt: string;
}

/** Why the concierge handed a question to staff, in the words of the Why column. */
export const REASON_LABELS: Record<QuestionReason, string> = {
  no_answer: 'No answer in product knowledge',
  asked_for_person: 'Asked for a person',
};

/** "Open", "Taken by Jane" or "Answered by Jane". "staff" stands in for a name the question doesn't have. */
export const statusLabel = ({ status, staffName }: Pick<StaffQuestion, 'status' | 'staffName'>): string => {
  if (status === 'open') return 'Open';
  return `${status === 'taken' ? 'Taken' : 'Answered'} by ${staffName || 'staff'}`;
};

/** Let them know: only a question nobody has taken, since sending the message is what takes it. */
export const canLetThemKnow = ({ status }: Pick<StaffQuestion, 'status'>): boolean => status === 'open';

/** Answer: a question that is open, or taken by someone who let the customer know. */
export const canAnswer = ({ status }: Pick<StaffQuestion, 'status'>): boolean => status === 'open' || status === 'taken';

/** The categories of the Answer dialog's select: the server's KNOWLEDGE_CATEGORIES, in its order (test/unit/questions-admin.test.ts). */
export const CATEGORY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'care', label: 'Care' },
  { value: 'materials', label: 'Materials' },
  { value: 'sizing', label: 'Sizing' },
  { value: 'personalization', label: 'Personalization' },
  { value: 'delivery', label: 'Delivery' },
  { value: 'returns', label: 'Returns' },
  { value: 'repairs', label: 'Repairs' },
  { value: 'warranty', label: 'Warranty' },
  { value: 'gifting', label: 'Gifting' },
  { value: 'store', label: 'Boutiques and service' },
];

/** Tokyo's calendar and clock, written "2026-10-03 10:12", the way Swedish writes them. h23 writes midnight as 00:00, not 24:00. */
const TOKYO_TIME = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/**
 * "2026-10-03T01:12:00.000Z" → "2026-10-03 10:12": when the question came in, on the boutique's clock whatever the time
 * zone of the browser. A value that isn't a date is shown as it came, so one bad row can't fail the table.
 */
export const askedAt = (iso: string): string => (Number.isNaN(Date.parse(iso)) ? iso : TOKYO_TIME.format(new Date(iso)));

/** What the Answer dialog holds. `category` is '' until staff pick one. */
export interface AnswerForm {
  text: string;
  addToKnowledge: boolean;
  category: string;
}

/** Send on LINE: there's an answer, and with Add to product knowledge ticked, a category to file it under. */
export const canSendAnswer = ({ text, addToKnowledge, category }: AnswerForm): boolean =>
  text.trim() !== '' && (!addToKnowledge || CATEGORY_OPTIONS.some(({ value }) => value === category));

/** What POST /maison/questions/:reference/answer takes. */
export interface AnswerBody {
  text: string;
  addToKnowledge: boolean;
  /** Only with `addToKnowledge`. */
  category?: string;
}

/**
 * The body Send on LINE posts. With Add to product knowledge unticked there is no `category` key at all: the server's
 * schema refuses null and '' as a category, and a category picked before the box was unticked mustn't go with it.
 */
export const answerBody = ({ text, addToKnowledge, category }: AnswerForm): AnswerBody =>
  addToKnowledge ? { text, addToKnowledge, category } : { text, addToKnowledge };
