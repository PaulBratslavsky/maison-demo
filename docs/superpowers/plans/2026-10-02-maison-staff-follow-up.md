# Staff Follow-up (POC) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the concierge can't answer, Strapi records the question for staff, staff let the customer know or answer on LINE in their own name, and an answer can become product knowledge.

**Architecture:** A new `plugin::maison.question` content type and `questions` service in the Maison plugin, a `hand_off_to_staff` MCP tool that replaces the app's local one, three admin routes behind two new permissions, and a **Customer questions** section on the Maison page. LINE pushes reuse the confirmations' push code, moved into `domain/line-push.ts`. The app gets **Ask about this piece**, product context in the concierge, and a LINE button that opens the chat with the question already typed in.

**Tech Stack:** Strapi 5.55 plugin (TypeScript, Document Service, `@strapi/design-system` v2), Vitest, node:test integration suites, Next.js 16 app with AI SDK 7.

**Spec:** `docs/superpowers/specs/2026-10-02-maison-staff-follow-up-design.md`. Read it first: every exact string below comes from it.

## Global Constraints

- **Local only, on its own branches.** Plugin: branch `feat/maison-follow-up`, from `feat/maison-plugin` after product knowledge Task 4, in the worktree `~/work/plugin-dev/plugins/strapi-store-demo-mcp-follow-up`. Demo: branch `feat/maison-follow-up`, from `feat/maison-demo` after product knowledge Task 7. Never push, open a PR, merge or deploy. Paul reviews it with Claude first ("dont deploy the branch into main unitll we review together").
- **Nothing reaches LINE from tests or local checks.** Unit tests stub `fetch`; integration suites point `lineApiBaseUrl` at a stand-in on this machine; the local browser check sets `MAISON_LINE_API_BASE_URL` to a stand-in. Never push to Paul's phone.
- **Never type credentials into a browser.** The admin side is checked by tests and type checks here, and by Paul in the morning.
- **Never run `npm run setup` against Strapi Cloud.** Locally it's fine; it replaces the local OAuth client, so the app restarts after it.
- **Copy:** plain, short English, and the spec's exact Japanese. No em dashes in new copy.
- **Commits:** stage named paths only. End each message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Plugin checks:** `npm test`, `npm run test:ts:back`, `npm run test:ts:front`, in the worktree.
- **App checks:** `npm test --prefix liff` and `npm run typecheck --prefix liff`, in the demo.
- **Integration suites:** from the plugin worktree, `STRAPI_APP_DIR=$HOME/work/maison-demo/strapi npm run test:integration`, only after the copy into the demo (Task 8), with the demo's Strapi stopped.
- **Experiment only on scratch copies,** never on the real files.

## Review Focus

1. **A second click.** Let them know on a taken question, or Answer on an answered one, must answer 409 and push nothing. (Task 4 tests it.)
2. **LINE fails after the click.** A refused or unanswered push leaves the question as it was, records why, and saves no knowledge. (Task 4.)
3. **The push went out, then Strapi failed to record it.** Staff must be told not to send again. (Task 4.)
4. **A hand-off about a piece that doesn't exist.** The question still reaches staff, without the piece. (Task 3.)
5. **Two `can` flags with the same name.** `useRBAC` names flags after the action's last word; a duplicate silently shares one flag. (Task 5 tests the names are unique.)

---

### Task 1: LINE push helpers, out of the confirmations

**Files:**
- Create: `server/src/domain/line-push.ts`
- Modify: `server/src/services/line-confirmations.ts`
- Test: `test/unit/line-push.test.ts` (new); `test/unit/line-confirmations.test.ts` stays unchanged and must pass

**Interfaces:**
- Produces: `LineApi`, `LineMessage`, `PUSH_TIMEOUT_MS`, `PROFILE_TIMEOUT_MS`, `pushMessages(api, to, messages)`, `getDisplayName(api, userId)`. Tasks 3 and 4 use them.

- [ ] **Step 1: Write the failing tests** in `test/unit/line-push.test.ts`, stubbing `fetch` with `vi.stubGlobal` as `line-confirmations.test.ts` does:
  - `pushMessages({ apiBaseUrl: 'http://127.0.0.1:4010', token: 'tok' }, 'U' + 'a'.repeat(32), [{ type: 'text', text: 'Hi' }])` posts to `http://127.0.0.1:4010/v2/bot/message/push` with headers `{ Authorization: 'Bearer tok', 'Content-Type': 'application/json' }` and the body `{ to, messages: [{ type: 'text', text: 'Hi' }] }`, and answers `{ status: 'sent', detail: <LINE's body> }`.
  - A 400 whose body is `{"message":"The request body has 1 error(s)"}` answers `{ status: 'failed', detail: 'LINE answered 400: The request body has 1 error(s)' }`.
  - A 500 with an empty body answers `{ status: 'failed', detail: 'LINE answered 500.' }`.
  - A `fetch` rejecting with an error named `TimeoutError` answers `detail: "LINE didn't answer within 8 seconds."`.
  - A `fetch` rejecting with `Object.assign(new TypeError('fetch failed'), { cause: new Error('connect ECONNREFUSED 127.0.0.1:4010') })` answers `detail: "LINE couldn't be reached: connect ECONNREFUSED 127.0.0.1:4010"`.
  - `getDisplayName(api, 'Uabc')` calls `GET http://127.0.0.1:4010/v2/bot/profile/Uabc` with `{ Authorization: 'Bearer tok' }` and answers `'Paul'` for `{"displayName":"  Paul "}`.
  - It answers `null` for a 404, for a body without a string `displayName`, for an empty name, and when `fetch` rejects; and cuts a 150-character name to 100.
- [ ] **Step 2: Run** `npx vitest run test/unit/line-push.test.ts`. Expected: FAIL, the module doesn't exist.
- [ ] **Step 3: Create `server/src/domain/line-push.ts`.** Move `lineMessageOf`, `unreachable` and `push` out of `line-confirmations.ts` unchanged in behaviour, with these signatures:

```ts
/**
 * LINE's Messaging API, as Strapi calls it: a push to one customer, and a customer's display name. Neither ever throws:
 * what went wrong becomes the detail, or no name.
 */

/** Where LINE answers, and Strapi's channel access token. */
export interface LineApi {
  apiBaseUrl: string;
  token: string;
}

/** The message objects Strapi sends: a confirmation's flex message, or a staff member's text. */
export type LineMessage = { type: 'flex'; altText: string; contents: unknown } | { type: 'text'; text: string };

/**
 * LINE gets this long to answer a push. A publish outside a transaction (Confirm, confirm_appointment) waits for its
 * confirmation this long at most; one inside a transaction (the Content Manager's Publish) doesn't wait, and sends
 * after the commit.
 */
export const PUSH_TIMEOUT_MS = 8000;
/** LINE gets this long to give a customer's display name. A hand-off never waits longer for it. */
export const PROFILE_TIMEOUT_MS = 3000;

/** One push to a customer, of up to five messages. It never throws: what went wrong becomes the detail. */
export const pushMessages = async (
  { apiBaseUrl, token }: LineApi,
  to: string,
  messages: LineMessage[]
): Promise<{ status: 'sent' | 'failed'; detail: string }> => { /* the moved push(), with body JSON.stringify({ to, messages }) */ };

/**
 * A customer's LINE display name, from LINE's Get profile API, or null when LINE gives none within PROFILE_TIMEOUT_MS:
 * someone who isn't a friend and hasn't written to the account, a refusal, or no answer. Trimmed, and cut to 100
 * characters, as the question keeps it.
 */
export const getDisplayName = async ({ apiBaseUrl, token }: LineApi, userId: string): Promise<string | null> => {
  try {
    const response = await fetch(`${apiBaseUrl}/v2/bot/profile/${encodeURIComponent(userId)}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(PROFILE_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { displayName?: unknown } | null;
    const name = typeof body?.displayName === 'string' ? body.displayName.trim() : '';
    return name ? Array.from(name).slice(0, 100).join('') : null;
  } catch {
    return null;
  }
};
```

`unreachable` keeps its words; it takes the timeout it waited for, so the push's message still reads "LINE didn't answer within 8 seconds."
- [ ] **Step 4: Use it in `line-confirmations.ts`.** Delete the moved code and `PUSH_TIMEOUT_MS`'s definition, import `PUSH_TIMEOUT_MS` and `pushMessages` from `../domain/line-push`, and keep the doc comment that mentions the timeout where the publish waits. The send becomes `pushMessages({ apiBaseUrl: lineApiBaseUrl, token }, confirmation.lineUserId, [{ type: 'flex', altText: confirmation.message.altText, contents: confirmation.message.contents }])`. Nothing else imports `PUSH_TIMEOUT_MS` from `line-confirmations` (checked), so it isn't re-exported.
- [ ] **Step 5: Run** `npx vitest run test/unit/line-push.test.ts test/unit/line-confirmations.test.ts`. Expected: PASS, with `line-confirmations.test.ts` unchanged.
- [ ] **Step 6: Run** `npm test` and `npm run test:ts:back`. Expected: PASS.
- [ ] **Step 7: Commit**

```bash
git add server/src/domain/line-push.ts server/src/services/line-confirmations.ts test/unit/line-push.test.ts
git commit -m "refactor(line): the push and a customer's display name, in one place for confirmations and staff messages

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The question, its constants, permissions and LINE messages

**Files:**
- Create: `server/src/content-types/question/schema.json`, `server/src/content-types/question/index.ts`, `server/src/domain/question-messages.ts`
- Modify: `server/src/content-types/index.ts`, `server/src/constants.ts`, `server/src/bootstrap.ts`, `server/src/domain/reference.ts`
- Test: `test/unit/question-schema.test.ts` (new), `test/unit/question-messages.test.ts` (new), `test/unit/reference.test.ts`, `test/unit/admin-permissions.test.ts` if it lists the registered actions

**Interfaces:**
- Produces: `UID.question`; `ACTION.questionsAsk`, `ACTION.questionsRead`, `ACTION.questionsAnswer`; `QUESTION_REASONS`, `QuestionReason`, `QUESTION_STATUSES`, `QuestionStatus`, `MAX_OPEN_QUESTIONS`; `generateReference(random?, prefix?)`; `quoteOf`, `acknowledgementText`, `answerText`, `knowledgeTitleOf`, `QuestionMessageInput`.

- [ ] **Step 1: Write the failing tests.**
  - `test/unit/question-schema.test.ts`: the schema's `reason` and `status` enums equal `QUESTION_REASONS` and `QUESTION_STATUSES`; `language` is `['ja', 'en']`, like `LOCALES`; `draftAndPublish` is false; it isn't localized; `content-manager.visible` and `content-type-builder.visible` are false; `customer` is private; and `content-types/index.ts` registers it under `question`.
  - `test/unit/question-messages.test.ts`, with the exact strings:
    - `acknowledgementText({ language: 'en', staffName: 'Jane', question: 'Can it hold a watch?', productName: 'Jewelry Coffret' })` is `Hello, this is Jane, a client advisor at Maison. Thank you for your question about the Jewelry Coffret: "Can it hold a watch?" I'm looking into it and will reply here in this chat as soon as I can.\nJane, Maison`.
    - Without the piece: `… Thank you for your question: "Can it hold a watch?" I'm looking …`.
    - Without a name: it starts `Hello, this is Maison's client advisor team. Thank you for your question` and ends `\nMaison`.
    - A question without end punctuation gets a full stop after the quote: `: "Can it hold a watch". I'm looking into it`.
    - Japanese, `{ language: 'ja', staffName: 'Jane', question: '腕時計は入りますか？', productName: 'ジュエリー・コフレ' }`: `Maisonのクライアントアドバイザー、Janeでございます。ジュエリー・コフレについてのご質問「腕時計は入りますか？」をいただき、ありがとうございます。ただいま確認しておりますので、分かり次第こちらのトークでご連絡いたします。\nMaison　Jane` (the space before Jane is the full-width U+3000).
    - Japanese without a piece drops `ジュエリー・コフレについての`; without a name it starts `Maisonのクライアントアドバイザーでございます。` and ends `\nMaison`.
    - `answerText({ ...english, answer: '  Yes, a watch up to 42 mm fits.  ' })` is the English opening, then `\n\nYes, a watch up to 42 mm fits.\n\nIf anything else comes to mind, just reply here.\nJane, Maison`.
    - `answerText` in Japanese: the opening, `\n\n`, the answer, `\n\nほかにもご不明な点がございましたら、こちらのトークにお気軽にご返信ください。\nMaison　Jane`.
    - `quoteOf` collapses runs of spaces and new lines to one space, keeps 80 characters as they are, cuts 81 to 79 plus `…`, and never splits an emoji (count with `Array.from`).
    - `knowledgeTitleOf` keeps 200 characters, and cuts 201 to 199 plus `…`.
  - `test/unit/reference.test.ts`: `generateReference(() => 0, 'Q')` is `Q-1000`, `generateReference(() => 0.99999, 'Q')` is `Q-9999`, and the existing APT cases are unchanged.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: The content type.** `server/src/content-types/question/schema.json`:

```json
{
  "kind": "collectionType",
  "collectionName": "maison_questions",
  "info": {
    "singularName": "question",
    "pluralName": "questions",
    "displayName": "Maison customer question",
    "description": "A question the concierge handed to Maison's client advisors. Staff see and answer it on the Maison page."
  },
  "options": { "draftAndPublish": false },
  "pluginOptions": { "content-manager": { "visible": false }, "content-type-builder": { "visible": false } },
  "attributes": {
    "reference": { "type": "string", "required": true },
    "customer": { "type": "string", "required": true, "private": true, "visible": false },
    "customerName": { "type": "string", "maxLength": 100 },
    "question": { "type": "text", "required": true, "maxLength": 1000 },
    "reason": { "type": "enumeration", "enum": ["no_answer", "asked_for_person"], "default": "no_answer" },
    "language": { "type": "enumeration", "enum": ["ja", "en"], "default": "ja" },
    "productSlug": { "type": "string" },
    "status": { "type": "enumeration", "enum": ["open", "taken", "answered"], "default": "open" },
    "staffName": { "type": "string", "maxLength": 100 },
    "takenAt": { "type": "datetime" },
    "answeredAt": { "type": "datetime" },
    "answer": { "type": "text", "maxLength": 2000 },
    "knowledgeDocumentId": { "type": "string" },
    "lineOutcome": { "type": "enumeration", "enum": ["sent", "failed"] },
    "lineDetail": { "type": "string", "maxLength": 500 }
  }
}
```

`index.ts` mirrors `knowledge/index.ts`. Register it in `content-types/index.ts` as `question`, after `knowledge`.
- [ ] **Step 4: Constants.** In `server/src/constants.ts`: `question: 'plugin::maison.question'` in `UID`, after `knowledge`; in `ACTION`, after `confirmationsSend`:

```ts
  questionsAsk: 'plugin::maison.questions.ask',
  questionsRead: 'plugin::maison.questions.read',
  questionsAnswer: 'plugin::maison.questions.answer',
```

and after `KNOWLEDGE_CATEGORIES`:

```ts
/** Why the concierge handed a question to staff. The question content type's reason enum must match (test/unit/question-schema.test.ts). */
export const QUESTION_REASONS = ['no_answer', 'asked_for_person'] as const;
export type QuestionReason = (typeof QUESTION_REASONS)[number];

/** A question is open until staff take it (Let them know) or answer it. The content type's status enum must match. */
export const QUESTION_STATUSES = ['open', 'taken', 'answered'] as const;
export type QuestionStatus = (typeof QUESTION_STATUSES)[number];

/** How many questions one customer can have with staff, open or taken, at a time. */
export const MAX_OPEN_QUESTIONS = 5;
```

Also export `type KnowledgeCategory = (typeof KNOWLEDGE_CATEGORIES)[number];` if product knowledge didn't already.
- [ ] **Step 5: Permissions.** In `server/src/bootstrap.ts`, add to `ACTIONS` after `confirmations.send`:

```ts
  { uid: 'questions.ask', displayName: 'MCP: hand questions to staff', subCategory: 'mcp' },
  { uid: 'questions.read', displayName: 'Read customer questions', subCategory: 'questions' },
  { uid: 'questions.answer', displayName: 'Answer customer questions on LINE', subCategory: 'questions' },
```

- [ ] **Step 6: References.** `generateReference(random: () => number = Math.random, prefix: 'APT' | 'Q' = 'APT')` gives `${prefix}-${1000 + Math.floor(random() * 9000)}`. Update its doc comment: "Short, human-readable reference for a visit (APT) or a question (Q)."
- [ ] **Step 7: `server/src/domain/question-messages.ts`:**

```ts
import type { Locale } from '../constants';

/** How much of the question a LINE message quotes. */
export const QUOTE_LENGTH = 80;
const TITLE_LENGTH = 200;

/** Text on one line, cut to `length` characters with "…". Characters, not UTF-16 units, so an emoji is never split. */
const cut = (text: string, length: number): string => {
  const chars = Array.from(text.trim().replace(/\s+/g, ' '));
  return chars.length > length ? `${chars.slice(0, length - 1).join('')}…` : chars.join('');
};

/** The question as a LINE message quotes it. */
export const quoteOf = (question: string): string => cut(question, QUOTE_LENGTH);

/** A knowledge entry's title, from the question it answers: the title's 200 characters at most. */
export const knowledgeTitleOf = (question: string): string => cut(question, TITLE_LENGTH);

export interface QuestionMessageInput {
  /** The question's language: the message is written in it. */
  language: Locale;
  /** The staff member's first name, or null to speak for the team. */
  staffName: string | null;
  question: string;
  /** The piece's name in the question's language, or null when the question isn't about one. */
  productName: string | null;
}

/** Who is writing, the question quoted, and thanks: the first sentence of every staff message. */
const opening = ({ language, staffName, question, productName }: QuestionMessageInput): string => {
  const quote = quoteOf(question);
  if (language === 'ja') {
    const who = staffName ? `Maisonのクライアントアドバイザー、${staffName}でございます。` : 'Maisonのクライアントアドバイザーでございます。';
    return `${who}${productName ? `${productName}についての` : ''}ご質問「${quote}」をいただき、ありがとうございます。`;
  }
  const who = staffName ? `Hello, this is ${staffName}, a client advisor at Maison.` : "Hello, this is Maison's client advisor team.";
  // The customer's words stay as they wrote them: a full stop goes after the quote, only when it doesn't end a sentence.
  const end = /[.!?。！？]$/.test(quote) ? '' : '.';
  return `${who} Thank you for your question${productName ? ` about the ${productName}` : ''}: "${quote}"${end}`;
};

const signature = ({ language, staffName }: QuestionMessageInput): string =>
  language === 'ja' ? (staffName ? `Maison　${staffName}` : 'Maison') : staffName ? `${staffName}, Maison` : 'Maison';

/** Let them know: a person has the question and is looking into it. */
export const acknowledgementText = (input: QuestionMessageInput): string =>
  input.language === 'ja'
    ? `${opening(input)}ただいま確認しておりますので、分かり次第こちらのトークでご連絡いたします。\n${signature(input)}`
    : `${opening(input)} I'm looking into it and will reply here in this chat as soon as I can.\n${signature(input)}`;

/** Answer: the answer, between the opening and an invitation to reply. */
export const answerText = (input: QuestionMessageInput & { answer: string }): string =>
  input.language === 'ja'
    ? `${opening(input)}\n\n${input.answer.trim()}\n\nほかにもご不明な点がございましたら、こちらのトークにお気軽にご返信ください。\n${signature(input)}`
    : `${opening(input)}\n\n${input.answer.trim()}\n\nIf anything else comes to mind, just reply here.\n${signature(input)}`;
```

- [ ] **Step 8: Run** the new tests, then `npm test` and `npm run test:ts:back`. Expected: PASS. Update any existing test that counts content types or registered actions.
- [ ] **Step 9: Commit**

```bash
git add server/src/content-types/question server/src/content-types/index.ts server/src/constants.ts server/src/bootstrap.ts server/src/domain/reference.ts server/src/domain/question-messages.ts test/unit/question-schema.test.ts test/unit/question-messages.test.ts test/unit/reference.test.ts
git commit -m "feat(questions): a customer question content type, its permissions, and staff messages in English and Japanese

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(Add any other test file you had to update to `git add`.)

---

### Task 3: The questions service records and lists, and `hand_off_to_staff`

**Files:**
- Create: `server/src/services/questions.ts`, `server/src/mcp/tools/hand-off-to-staff.ts`
- Modify: `server/src/services/index.ts`, `server/src/mcp/schemas.ts`, `server/src/mcp/index.ts`, `server/src/constants.ts` (`TOOL_NAMES`)
- Test: `test/unit/questions-ask.test.ts` (new), `test/unit/question-tool.test.ts` (new), `test/unit/constants.test.ts`, `test/unit/register-mcp.test.ts`, `test/unit/schemas.test.ts`, `test/mcp/tools.test.mjs`, and any test that lists the tool names

**Interfaces:**
- Consumes: Task 1's `getDisplayName`; Task 2's constants and `generateReference(random, 'Q')`.
- Produces: service `questions` with `ask(input: QuestionRequest): Promise<ServiceResult<QuestionView>>` and `list(filters?: QuestionFilters): Promise<ServiceResult<StaffQuestionView[]>>`; the tool `hand_off_to_staff`; `handOffToStaffInput`, `questionOutput`. Task 4 adds `notify` and `answer` to the same service.

- [ ] **Step 1: Write the failing tests.** Use `fakeStrapi` from `test/unit/fake-strapi.ts` with a `documents` stand-in, and stub `fetch` for LINE.
  - **ask:**
    - It creates one question with `customer` = the subject, the trimmed question, `reason`, `language` = the locale (or `defaultLocale`), `status: 'open'`, `productSlug: null`, and a reference matching `/^Q-\d{4}$/`, and answers `{ ok: true, value: { reference, status: 'open', product: null } }`.
    - With `productSlug: 'jewelry-coffret'` and a published product, it stores the slug and answers `product: { slug: 'jewelry-coffret', name }`, the name from the question's language, or from `defaultLocale` when that language has no version.
    - With an unknown slug, it stores `productSlug: null`, answers `product: null`, and still creates the question.
    - With a token in config, it calls LINE's profile for the user ID without `line:` and stores `customerName`. Without a token, `fetch` is never called and `customerName` is null. When LINE answers 404, `customerName` is null and the question is still created.
    - When `count` says the customer has 5 open or taken questions, it answers `too_many_open_questions` and creates nothing; the count's filters are `{ customer: { $eq: subject }, status: { $in: ['open', 'taken'] } }`.
    - A reference that's taken (the first `count` by reference answers 1) is drawn again.
  - **list:**
    - Default `status` is `open`, filtering `{ status: { $in: ['open', 'taken'] } }`; `answered` filters `{ status: { $eq: 'answered' } }`; `all` has no status filter. Sorted `createdAt: 'desc'`, `limit` 50 by default.
    - Each row's customer is masked (`line:U4af…88`), `customerName` kept, `addedToKnowledge` true only with a `knowledgeDocumentId`, `line` null without a `lineOutcome`, `createdAt` an ISO string, and the piece named in the row's language.
  - **The tool:** `hand_off_to_staff` requires `plugin::maison.questions.ask`; without a customer session it answers the shared not-signed-in error; it passes the subject from `identity.getCustomerSubject(extra)` and the arguments, with `reason` `no_answer` when it's left out; a service failure becomes `toolError(code, message, hint)`; success is `toolSuccess({ question })`.
  - **Schemas:** `handOffToStaffInput` accepts a question of 1 and 1,000 characters, trims it, refuses an empty or whitespace-only one and 1,001 characters, accepts both reasons, refuses another reason, and refuses a productSlug that isn't a slug.
  - **Lists:** `TOOL_NAMES` has 12 names, with `hand_off_to_staff` right after `my_appointments`; `registerMcp` registers it, and `disabledTools: ['hand_off_to_staff']` leaves it out; `test/mcp/tools.test.mjs` lists it wherever it lists the customer tools.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Schemas,** in `server/src/mcp/schemas.ts`, next to the appointment schemas:

```ts
export const handOffToStaffInput = z.object({
  question: z.string().trim().min(1).max(1000).describe("The customer's question, in their own words."),
  reason: z
    .enum(QUESTION_REASONS)
    .optional()
    .describe('"no_answer" (the default) when search_knowledge has no entry that answers it; "asked_for_person" when the customer asked for a person.'),
  productSlug: slugInput.optional().describe('The piece the question is about, when it is about one piece.'),
  locale: localeInput,
});

export const questionOutput = z.object({
  reference: z.string(),
  status: z.literal('open'),
  product: z.object({ slug: z.string(), name: z.string() }).nullable(),
});
```

- [ ] **Step 4: The service,** `server/src/services/questions.ts`:

```ts
import type { Core } from '@strapi/strapi';

import { getConfig } from '../config';
import { MAX_OPEN_QUESTIONS, UID, type Locale, type QuestionReason, type QuestionStatus } from '../constants';
import { getDisplayName } from '../domain/line-push';
import { generateReference } from '../domain/reference';
import { failure, type ServiceResult } from '../domain/service-result';
import { lineUserIdOf, maskSubject } from '../domain/subject';

type Doc = Record<string, any>;

export interface QuestionRequest {
  subject: string;
  question: string;
  reason: QuestionReason;
  productSlug?: string;
  /** The chat's language. Defaults to defaultLocale. */
  locale?: Locale;
}

/** What the concierge gets back. */
export interface QuestionView {
  reference: string;
  status: 'open';
  product: { slug: string; name: string } | null;
}

/** A question as staff see it: the customer masked, with their LINE name when LINE gave one. */
export interface StaffQuestionView {
  reference: string;
  customer: string;
  customerName: string | null;
  question: string;
  reason: QuestionReason;
  language: Locale;
  product: { slug: string; name: string } | null;
  status: QuestionStatus;
  staffName: string | null;
  takenAt: string | null;
  answeredAt: string | null;
  answer: string | null;
  addedToKnowledge: boolean;
  line: { outcome: 'sent' | 'failed'; detail: string } | null;
  createdAt: string;
}

export interface QuestionFilters {
  /** open: open or taken, the default. */
  status?: 'open' | 'answered' | 'all';
  limit?: number;
}

const STATUS_FILTERS: Record<NonNullable<QuestionFilters['status']>, Doc> = {
  open: { status: { $in: ['open', 'taken'] } },
  answered: { status: { $eq: 'answered' } },
  all: {},
};

export default ({ strapi }: { strapi: Core.Strapi }) => {
  /** A published piece by slug, named in `language`, or in the default language when it has no version in that one. */
  const productNamed = async (slug: string, language: Locale): Promise<{ slug: string; name: string } | null> => {
    const { defaultLocale } = getConfig(strapi);
    for (const locale of new Set([language, defaultLocale])) {
      const product = (await strapi.documents(UID.product).findFirst({
        locale,
        status: 'published',
        filters: { slug: { $eq: slug } },
        fields: ['slug', 'name'],
      })) as Doc | null;
      if (product) return { slug: product.slug, name: product.name };
    }
    return null;
  };

  /** A reference no question has. `random` is only for tests. */
  const uniqueReference = async (random: () => number = Math.random): Promise<string> => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const reference = generateReference(random, 'Q');
      if ((await strapi.documents(UID.question).count({ filters: { reference: { $eq: reference } } })) === 0) return reference;
    }
    throw new Error('[maison] Could not find a free question reference after 20 attempts.');
  };

  const toStaffView = (row: Doc, product: StaffQuestionView['product']): StaffQuestionView => ({ /* every field, as the tests say */ });

  return {
    /** Records a question for staff. Nothing here messages the customer. */
    async ask(input: QuestionRequest): Promise<ServiceResult<QuestionView>> {
      const { defaultLocale, lineChannelAccessToken: token, lineApiBaseUrl } = getConfig(strapi);
      const language = input.locale ?? defaultLocale;
      const waiting = await strapi.documents(UID.question).count({
        filters: { customer: { $eq: input.subject }, status: { $in: ['open', 'taken'] } },
      });
      if (waiting >= MAX_OPEN_QUESTIONS) {
        return failure(
          'too_many_open_questions',
          `This customer already has ${MAX_OPEN_QUESTIONS} questions with Maison's client advisors.`,
          "Don't hand this one off. Tell the customer their earlier questions are with the advisors, who will reply in the LINE chat with Maison."
        );
      }
      // An unknown piece never refuses the hand-off: the question still reaches staff, without it.
      const product = input.productSlug ? await productNamed(input.productSlug, language) : null;
      // Staff find the customer's chat in LINE by this name. Without a token, or an answer from LINE, there's none.
      const customerName = token ? await getDisplayName({ apiBaseUrl: lineApiBaseUrl, token }, lineUserIdOf(input.subject)) : null;
      const reference = await uniqueReference();
      await strapi.documents(UID.question).create({
        data: {
          reference,
          customer: input.subject,
          customerName,
          question: input.question.trim(),
          reason: input.reason,
          language,
          productSlug: product?.slug ?? null,
          status: 'open',
        },
      });
      return { ok: true, value: { reference, status: 'open', product } };
    },

    /** The Customer questions section's rows, newest first. Each piece is looked up once per language. */
    async list(filters: QuestionFilters = {}): Promise<ServiceResult<StaffQuestionView[]>> {
      /* findMany with STATUS_FILTERS[filters.status ?? 'open'], sort createdAt desc, limit ?? 50; names memoized by `${slug} ${language}` */
    },
  };
};
```

Register it as `questions` in `services/index.ts`, in alphabetical order.
- [ ] **Step 5: The tool,** `server/src/mcp/tools/hand-off-to-staff.ts`, shaped like `request-appointment.ts`:

```ts
export const handOffToStaffTool = defineTool({
  name: 'hand_off_to_staff',
  title: "Hand a question to Maison's staff",
  description:
    "Hands the signed-in customer's question to Maison's client advisors, who reply in the customer's LINE chat with Maison. Call it when search_knowledge has no entry that answers the question (reason \"no_answer\"), or at once when the customer asks for a person (reason \"asked_for_person\"). Pass the question in the customer's own words, and productSlug when it is about one piece. Call it once per question. The customer comes from their LINE sign-in, never from an argument.",
  auth: { policies: [{ action: ACTION.questionsAsk }] },
  resolveInputSchema: () => handOffToStaffInput,
  resolveOutputSchema: () => z.object({ question: questionOutput }),
  createHandler: (strapi) => async ({ args, extra }) => {
    const subject = await strapi.plugin('maison').service('identity').getCustomerSubject(extra);
    if (!subject) return notSignedIn();
    const result = await strapi.plugin('maison').service('questions').ask({
      subject,
      question: args.question,
      reason: args.reason ?? 'no_answer',
      productSlug: args.productSlug,
      locale: args.locale,
    });
    if (!result.ok) return toolError(result.code, result.message, result.hint);
    return toolSuccess({ question: result.value });
  },
});
```

Add `'hand_off_to_staff'` to `TOOL_NAMES` right after `'my_appointments'`, and register it in `mcp/index.ts` right after `my_appointments`.
- [ ] **Step 6: Run** the new tests, then `npm test` and `npm run test:ts:back`. Expected: PASS.
- [ ] **Step 7: Commit**

```bash
git add server/src/services/questions.ts server/src/services/index.ts server/src/mcp/tools/hand-off-to-staff.ts server/src/mcp/schemas.ts server/src/mcp/index.ts server/src/constants.ts test/unit/questions-ask.test.ts test/unit/question-tool.test.ts test/unit/constants.test.ts test/unit/register-mcp.test.ts test/unit/schemas.test.ts test/mcp/tools.test.mjs
git commit -m "feat(questions): hand_off_to_staff records the customer's question for Maison's client advisors

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Let them know, Answer, and the admin routes

**Files:**
- Create: `server/src/controllers/questions.ts`, `test/integration/questions.test.mjs`
- Modify: `server/src/services/questions.ts`, `server/src/controllers/index.ts`, `server/src/routes/index.ts`, `server/src/mcp/schemas.ts`
- Test: `test/unit/questions-reply.test.ts` (new), `test/unit/admin-routes.test.ts`

**Interfaces:**
- Consumes: Task 1's `pushMessages`; Task 2's messages and constants; Task 3's service.
- Produces: `questions.notify(reference, staffName, now?)` and `questions.answer(reference, reply, staffName, now?)`, both `Promise<ReplyOutcome>`; `ReplyStatus`, `ReplyOutcome`; routes `GET /questions`, `POST /questions/:reference/notify`, `POST /questions/:reference/answer`; schemas `questionReferenceInput`, `questionsListInput`, `answerInput`. Task 5's admin calls these routes.

- [ ] **Step 1: Write the failing unit tests** in `test/unit/questions-reply.test.ts`:
  - **notify**, for an open English question about a piece, by `'Jane'`:
    - It pushes one text message to the customer's LINE user ID, `acknowledgementText` for the question, its piece's name and `'Jane'`, and updates the question to `{ status: 'taken', staffName: 'Jane', takenAt: now, lineOutcome: 'sent', lineDetail: '' }`. It answers `{ reference, status: 'sent', message: 'Sent the LINE message for Q-4821.' }`.
    - A failed push records `{ lineOutcome: 'failed', lineDetail }` with the token replaced by `[token]` and cut to 500 characters, leaves the status open, and answers `failed` with a message that starts `The LINE message for Q-4821 wasn't sent.`.
    - No such question: `not_found`, `No question Q-4821.`, no push.
    - A taken question: `already_taken`, `Jane has let the customer know already.` (`Someone` without a name), no push.
    - An answered question: `already_answered`, `Question Q-4821 has been answered already.`, no push.
    - No token: `not_configured`, `LINE_CHANNEL_ACCESS_TOKEN isn't set: Strapi can't message customers on LINE.`, no push, no update.
  - **answer**, with `{ text: 'Yes, a watch up to 42 mm fits.', addToKnowledge: true, category: 'sizing' }`:
    - It pushes `answerText`, creates a knowledge entry in the question's language, `{ title: knowledgeTitleOf(question), answer: text, category: 'sizing', productSlugs: [productSlug], keywords: '' }`, publishes it in that language, and updates the question to `{ status: 'answered', staffName, answeredAt: now, answer: text, knowledgeDocumentId, lineOutcome: 'sent', lineDetail: '' }`. It answers `sent`, `Sent the answer to Q-4821 on LINE. Added it to product knowledge.`, with `knowledgeDocumentId`.
    - Without a piece, `productSlugs` is `[]`.
    - With `addToKnowledge: false`, nothing is created, `knowledgeDocumentId` is absent, and the message is `Sent the answer to Q-4821 on LINE.`.
    - A taken question can be answered.
    - A failed push creates nothing and leaves the question open or taken, with `lineOutcome: 'failed'`.
    - When creating the entry throws, the question is still answered, without `knowledgeDocumentId`, and the message ends ` It couldn't be added to product knowledge: <the error's message>`.
    - When updating the question throws after LINE took the message, it answers `sent` with the message `Sent the LINE message for Q-4821, but recording it failed (<reason>). Don't send it again.` (for answer: `Sent the answer to Q-4821 on LINE, but recording it failed (<reason>). Don't send it again.`), and logs it with `strapi.log.error`.
    - Answered already, not found and no token: as for notify.
  - **Routes and controller,** in `test/unit/admin-routes.test.ts`: 9 admin routes; `GET /questions` gated by `plugin::maison.questions.read`, both POSTs by `plugin::maison.questions.answer`; each handler exists. The controller: `list` passes the parsed filters and answers `{ questions }`, and bad filters are a 400 `invalid_input`; `notify` and `answer` refuse a reference that isn't `Q-` and four digits with 400, pass `ctx.state.user.firstname` trimmed (null when missing or blank) as the staff name, answer 200 with the outcome when sent, and otherwise call `notFound` (404), `conflict` (409, for both already_ cases), `badGateway` (502) or `serviceUnavailable` (503) with the message and `{ code: status }`; `answer` refuses an empty text, 2,001 characters, and `addToKnowledge` true without a category, each with 400 `invalid_input`, before calling the service; `addToKnowledge` defaults to true.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Schemas,** in `server/src/mcp/schemas.ts`:

```ts
export const questionReferenceInput = z.string().regex(/^Q-\d{4}$/, 'Use a reference like Q-4821.');

export const questionsListInput = z.object({
  status: z.enum(['open', 'answered', 'all']).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

export const answerInput = z
  .object({
    text: z.string().trim().min(1).max(2000),
    addToKnowledge: z.boolean().optional().default(true),
    category: z.enum(KNOWLEDGE_CATEGORIES).optional(),
  })
  .refine((reply) => !reply.addToKnowledge || reply.category !== undefined, {
    message: 'Pick a category to add the answer to product knowledge.',
    path: ['category'],
  });
```

- [ ] **Step 4: The service's notify and answer.** Add to `services/questions.ts`:

```ts
/**
 * What became of a staff message:
 * - `sent`: LINE took it, and the question says so (or the message says recording it failed).
 * - `failed`: LINE refused it or didn't answer. The question records why, and nothing else changed.
 * - `not_found`, `already_taken`, `already_answered`: nothing was sent.
 * - `not_configured`: there's no channel access token. Nothing was sent or recorded.
 */
export type ReplyStatus = 'sent' | 'failed' | 'not_found' | 'already_taken' | 'already_answered' | 'not_configured';

export interface ReplyOutcome {
  reference: string;
  status: ReplyStatus;
  /** What happened, in words staff can read. Never the token. */
  message: string;
  /** The knowledge entry the answer became. */
  knowledgeDocumentId?: string;
}

export interface Reply {
  text: string;
  addToKnowledge: boolean;
  category?: KnowledgeCategory;
}
```

Shape: one private `deliver(row, text, token, …)` that pushes a `{ type: 'text', text }` message to `lineUserIdOf(row.customer)` and, on failure, records `lineOutcome: 'failed'` and the redacted detail (`detail.split(token).join('[token]')`, cut to 500 characters). `notify` and `answer` find the question by reference (`findFirst({ filters: { reference: { $eq: reference } } })`), check its status, check the token, build the text with the piece's name in the question's language (`productNamed`), call `deliver`, then make their own updates, inside a `try` that turns a failure after LINE took the message into the "recording it failed" outcome. The answer's knowledge entry, when asked for, is created and published right after the push and before the question's update:

```ts
const { documentId } = await strapi.documents(UID.knowledge).create({
  locale: row.language,
  data: { title: knowledgeTitleOf(row.question), answer: reply.text, category: reply.category, productSlugs: row.productSlug ? [row.productSlug] : [], keywords: '' },
});
await strapi.documents(UID.knowledge).publish({ documentId, locale: row.language });
```

A failure there is caught on its own: the customer has the answer, so the question is still answered, and the message says the entry couldn't be added. Log every outcome with `strapi.log` like `line-confirmations.ts`, never with the token.
- [ ] **Step 5: The controller,** `server/src/controllers/questions.ts`, in the style of `controllers/appointments.ts`:

```ts
/** Strapi's error helper for each outcome that isn't sent. */
const REPLY_ERRORS: Record<Exclude<ReplyStatus, 'sent'>, string> = {
  not_found: 'notFound',
  already_taken: 'conflict',
  already_answered: 'conflict',
  failed: 'badGateway',
  not_configured: 'serviceUnavailable',
};

/** The signed-in admin's first name: the name staff messages are signed with. */
const staffNameOf = (ctx): string | null => {
  const name = ctx.state?.user?.firstname;
  return typeof name === 'string' && name.trim() ? name.trim().slice(0, 100) : null;
};
```

`list` parses `filtersFrom(ctx.query)` (limit as a number, as appointments do) with `questionsListInput` and answers `{ questions }`. `notify` parses the reference. `answer` parses the reference, then `ctx.request.body` with `answerInput`. Bad input: `ctx.badRequest(describeIssues(error), { code: 'invalid_input', hint })`, with the hints `Use a reference like Q-4821.` and `Write an answer of up to 2,000 characters, and pick a category to add it to product knowledge.`. Register `questions` in `controllers/index.ts`.
- [ ] **Step 6: Routes,** in `routes/index.ts`'s admin routes, after the appointments' routes:

```ts
      { method: 'GET', path: '/questions', handler: 'questions.list', config: { policies: allow(ACTION.questionsRead) } },
      {
        method: 'POST',
        path: '/questions/:reference/notify',
        handler: 'questions.notify',
        config: { policies: allow(ACTION.questionsAnswer) },
      },
      {
        method: 'POST',
        path: '/questions/:reference/answer',
        handler: 'questions.answer',
        config: { policies: allow(ACTION.questionsAnswer) },
      },
```

- [ ] **Step 7: Run** the unit tests, then `npm test` and `npm run test:ts:back`. Expected: PASS.
- [ ] **Step 8: The integration suite,** `test/integration/questions.test.mjs`, with its own database name and the LINE stand-in of `line-confirmations.test.mjs` (copy its `startLineStub`; answer `{ displayName: 'Paul (test)' }` for `GET /v2/bot/profile/…` and `SENT` for pushes). It boots with `lineChannelAccessToken` and `lineApiBaseUrl` pointing at the stand-in, loads the demo catalog, then, through `strapi.plugin('maison').service(…)`:
  1. `questions.ask` for `SUBJECT_A` about `jewelry-coffret`, in English, records `Q-…` with `customerName` `'Paul (test)'`.
  2. `questions.list()` shows it, masked, with the piece's English name.
  3. `questions.notify(reference, 'Jane')` answers `sent`; the stand-in got one push to the user ID whose text contains the quoted question and `Jane, Maison`; the question is taken.
  4. A second `notify` answers `already_taken`, and the stand-in got nothing more.
  5. `questions.answer(reference, { text: 'Yes, a watch up to 42 mm fits.', addToKnowledge: true, category: 'sizing' }, 'Jane')` answers `sent` with a `knowledgeDocumentId`.
  6. `catalog.searchKnowledge('en', { query: 'Can the jewelry coffret hold a watch?', productSlugs: ['jewelry-coffret'] })` returns that entry first.
  7. Six `ask`s for `SUBJECT_B` end with `too_many_open_questions`.
  Don't run it yet: it runs against the demo's copy in Task 8.
- [ ] **Step 9: Commit**

```bash
git add server/src/services/questions.ts server/src/controllers/questions.ts server/src/controllers/index.ts server/src/routes/index.ts server/src/mcp/schemas.ts test/unit/questions-reply.test.ts test/unit/admin-routes.test.ts test/integration/questions.test.mjs
git commit -m "feat(questions): staff let the customer know or answer on LINE in their own name, and an answer can become product knowledge

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Customer questions on the Maison page, and the reset

**Files:**
- Create: `admin/src/questions.ts`, `admin/src/components/QuestionsList.tsx`, `admin/src/components/AnswerDialog.tsx`
- Modify: `admin/src/permissions.ts`, `admin/src/pages/MaisonPage.tsx`, `admin/src/components/DemoData.tsx`, `admin/src/seed-result.ts`, `server/src/services/seed.ts`, `README.md`, `CHANGELOG.md`
- Test: `test/unit/questions-admin.test.ts` (new), `test/unit/admin-permissions.test.ts`, `test/unit/seed.test.ts`, `test/unit/seed-result.test.ts`

**Interfaces:**
- Consumes: Task 4's routes and their answers; `useRBAC`'s flags `canRead` and `canAnswer`.

- [ ] **Step 1: Write the failing tests.**
  - `test/unit/questions-admin.test.ts`, for `admin/src/questions.ts`:
    - `statusLabel`: `Open`; `Taken by Jane`; `Answered by Jane`; `staff` stands in for a missing name.
    - `REASON_LABELS`: `No answer in product knowledge`, `Asked for a person`.
    - `canLetThemKnow` only for open; `canAnswer` for open and taken.
    - `CATEGORY_OPTIONS`' values equal the server's `KNOWLEDGE_CATEGORIES`, in order, with the labels Care, Materials, Sizing, Personalization, Delivery, Returns, Repairs, Warranty, Gifting, Boutiques and service.
    - `askedAt('2026-10-03T01:12:00.000Z')` is `2026-10-03 10:12`, Tokyo time, in any time zone.
  - `test/unit/admin-permissions.test.ts`: `PERMISSIONS.page` includes `plugin::maison.questions.read`; `PERMISSIONS.sections` includes read and answer; and the flag names `useRBAC` makes (`can` plus the action's last word, capitalised) are all different.
  - `test/unit/seed.test.ts`: `resetDemoAppointments` also deletes every question, and the knowledge entries their answers added (`delete({ documentId, locale: '*' })` for each `knowledgeDocumentId`), and answers `{ appointments, notifications, questions, knowledge }`.
  - `test/unit/seed-result.test.ts`: `describeReset({ appointments: 3, notifications: 2, questions: 1, knowledge: 1 })` is `Deleted 3 appointments, 2 notifications, 1 question and 1 product knowledge entry.`, with plurals for other counts (`0 questions`, `2 product knowledge entries`).
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: `admin/src/questions.ts`:** the row type (the server's `StaffQuestionView`, written out as `board.ts` writes `StaffAppointment`), `REASON_LABELS`, `statusLabel`, `canLetThemKnow`, `canAnswer`, `CATEGORY_OPTIONS` (`{ value, label }[]`), and `askedAt` (format with `Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo', … })` or the helper in `admin/src/time.ts` if it has one).
- [ ] **Step 4: Permissions,** in `admin/src/permissions.ts`:

```ts
const QUESTIONS_READ = { action: 'plugin::maison.questions.read', subject: null };
const QUESTIONS_ANSWER = { action: 'plugin::maison.questions.answer', subject: null };

export const PERMISSIONS = {
  /** The menu entry and the page: staff who review requests, read questions, or manage the demo data. Any one is enough. */
  page: [REVIEW, MANAGE, QUESTIONS_READ],
  /** Checked with useRBAC, which answers canReview, canConfirm, canManage, canRead and canAnswer. */
  sections: [REVIEW, CONFIRM, MANAGE, QUESTIONS_READ, QUESTIONS_ANSWER],
  /** The Homepage widget, which shows the requests board's numbers: staff who review requests. */
  widget: [REVIEW],
};
```

- [ ] **Step 5: `QuestionsList.tsx`,** in the style of `RequestsBoard.tsx` (the same polling with `startPolling` every 5 seconds, a load that drops a response for a filter no longer on screen, the same loading, error and empty states):
  - Heading `Customer questions`; under it `Questions the concierge handed to Maison's client advisors. Refreshes every 5 seconds.`
  - The filter: `Open` (the default), `Answered`, `All`, sent as `status=open|answered|all`.
  - Empty: `No open questions.`, `No answered questions yet.`, `No questions yet.`
  - Columns: `Reference`, `Asked`, `Customer`, `Piece`, `Question`, `Why`, `Status`, and an action column only with `canAnswer`.
  - Customer: the LINE name (or `—`), with the masked ID under it in `neutral600`. Question: plain text that wraps within about 20rem, like the board's note. Piece: its name or `—`.
  - Status: a badge, `Open` (warning), `Taken by …` (secondary), `Answered by …` (success). Under it, `Added to product knowledge` when it was, and `LINE message failed: <detail>` in `danger600` when the last one failed.
  - Actions: `Let them know` (secondary, on open questions) posts to `/maison/questions/<reference>/notify`; `Answer` (on open and taken questions) opens the dialog. While one runs, both are disabled. Success shows the server's `message` as a success notification; an error shows its message as a danger notification. The list reloads after either.
- [ ] **Step 6: `AnswerDialog.tsx`:** `@strapi/design-system`'s `Modal` (check its v2 API in `node_modules/@strapi/design-system`), titled `Answer <reference>`:
  - The question, quoted, and `About the <piece>` when there is one.
  - A `Textarea` labelled `Your answer`, never pre-filled, with the hint `It's sent on LINE in your name. With the box ticked, it's also saved as product knowledge, so write it for any customer.`
  - A `Checkbox`, `Add to product knowledge`, ticked.
  - A `SingleSelect` labelled `Category`, with `CATEGORY_OPTIONS`, shown only while the box is ticked, with no category picked at first.
  - `Cancel`, and `Send on LINE`, disabled until there's an answer and, with the box ticked, a category. It posts `{ text, addToKnowledge, category }` to `/maison/questions/<reference>/answer`, and closes on success.
- [ ] **Step 7: The page.** In `MaisonPage.tsx`, after the requests board's block: `{allowedActions.canRead && <QuestionsList canAnswer={allowedActions.canAnswer} refreshKey={refreshKey} />}`. The header's subtitle becomes `Boutique appointment requests and customer questions, as they arrive.`
- [ ] **Step 8: The reset.** In `server/src/services/seed.ts`, `resetDemoAppointments` first deletes the knowledge entries questions added (each `knowledgeDocumentId`, `locale: '*'`), then the questions, then notifications and appointments as now; its doc comment says so, and that the seeded knowledge stays. In `admin/src/seed-result.ts`, add `ResetResult` and `describeReset` (moved out of `DemoData.tsx`). In `DemoData.tsx`, the button and the dialog's title become `Reset demo appointments and questions`, and the dialog's text names questions and the knowledge their answers added.
- [ ] **Step 9: Docs.** In the plugin `README.md`: the tool (with the new permission), the Customer questions section, the three routes and their status codes, the two staff permissions, what the LINE messages say, and the reset. In `CHANGELOG.md`, under Unreleased: one entry for the POC.
- [ ] **Step 10: Run** `npm test`, `npm run test:ts:back` and `npm run test:ts:front`. Expected: PASS.
- [ ] **Step 11: Commit**

```bash
git add admin/src/questions.ts admin/src/components/QuestionsList.tsx admin/src/components/AnswerDialog.tsx admin/src/permissions.ts admin/src/pages/MaisonPage.tsx admin/src/components/DemoData.tsx admin/src/seed-result.ts server/src/services/seed.ts README.md CHANGELOG.md test/unit/questions-admin.test.ts test/unit/admin-permissions.test.ts test/unit/seed.test.ts test/unit/seed-result.test.ts
git commit -m "feat(questions): Customer questions on the Maison page, with Let them know, Answer, and Add to product knowledge

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The app hands off through Strapi, and opens the LINE chat with the question typed in

Work in `~/work/maison-demo/liff`, branch `feat/maison-follow-up`. Product knowledge Task 6 added a local `hand_off_to_staff`, `lib/tool-view.ts` with a `handOff` flag, `COPY.handOff`, and the hand-off note in `components/chat-parts.tsx`. This task replaces them.

**Files:**
- Modify: `lib/concierge.ts`, `lib/tool-view.ts`, `lib/line-chat.ts`, `lib/copy.ts`, `components/chat-parts.tsx`, `components/line-chat.tsx`, `app/concierge/page.tsx` (`CONCIERGE_TOOLS`), `README.md` (the concierge's tools)
- Test: `lib/concierge.test.ts`, `lib/tool-view.test.ts`, `lib/line-chat.test.ts`

**Interfaces:**
- Consumes: the MCP tool `hand_off_to_staff` (Task 3), whose output is `{ question: { reference, status, product } }`.
- Produces: `lineMessageUrl(basicId, text)`; `toolView(...).handOff: { reference: string; question: string } | null`.

- [ ] **Step 1: Write the failing tests.**
  - `lib/line-chat.test.ts`: `lineMessageUrl('@maison', 'Question for a Maison advisor (Q-4821): Can it hold a watch?')` is `https://line.me/R/oaMessage/%40maison/?Question%20for%20a%20Maison%20advisor%20(Q-4821)%3A%20Can%20it%20hold%20a%20watch%3F`; it's null for an unset or invalid ID, as `lineChatUrl` is; text over 500 characters is cut to 500 before encoding.
  - `lib/tool-view.test.ts`: `hand_off_to_staff` is a Maison tool now: its line is `MCP · hand_off_to_staff ✓`; a successful call's `handOff` is `{ reference: 'Q-4821', question: <the call's input question> }`; a failed call's is null and its line is red with the error's code; `resolve_date` is still `Local`.
  - `lib/concierge.test.ts`: the tools given to the model are the MCP tools plus `resolve_date` only; the instructions contain rules 9 and 10 below, word for word.
- [ ] **Step 2: Run** `npm test --prefix liff`. Expected: FAIL.
- [ ] **Step 3: `lib/concierge.ts`.** Remove the local hand-off tool and its entry in the tools. Rule 9 becomes, and rule 10 is added:

```
9. For a question about Maison's services and policies, such as care, materials, sizing, personalization, delivery, returns, repairs, warranty or gift wrapping, call search_knowledge with the customer's own words, and with productSlugs when the question is about particular pieces. Answer only from the entries it returns, and never invent a policy, a price or a time. If no entry answers the question, call hand_off_to_staff with the customer's question in their own words, reason "no_answer", and productSlug when it is about one piece. Then say, in one or two sentences, that you couldn't find a reliable answer, that you've passed the question to Maison's client advisors, and that they'll reply in the customer's LINE chat with Maison.
10. If the customer asks to talk to a person, call hand_off_to_staff at once with their request, reason "asked_for_person". Hand off each question once: if it is already with the advisors, say so.
```

- [ ] **Step 4: `lib/tool-view.ts`.** `LOCAL_TOOLS` is `['resolve_date']` again. `ToolPart` gains `input?: unknown`. `handOff` is `{ reference, question }` for a successful `hand_off_to_staff` (the reference from `structuredContent.question.reference`, the question from the part's `input.question`), else null.
- [ ] **Step 5: `lib/line-chat.ts`:**

```ts
/** The longest question a typed-in LINE message carries, so the link stays well within what LINE opens. */
const MAX_TYPED = 500;

/**
 * LINE's link that opens the chat with Maison with `text` already typed in, for the customer to send: "Send it in the
 * LINE chat" under a hand-off. Once they send it, staff see the chat in LINE Official Account Manager, which on an
 * unverified account lists only customers who have written. Null when the setting is unset or isn't an @ ID.
 */
export const lineMessageUrl = (basicId: string | undefined, text: string): string | null => {
  const id = basicId?.trim() ?? '';
  return LINE_ID.test(id) ? `https://line.me/R/oaMessage/${encodeURIComponent(id)}/?${encodeURIComponent(Array.from(text).slice(0, MAX_TYPED).join(''))}` : null;
};
```

- [ ] **Step 6: Copy,** in `lib/copy.ts`, `handOff` becomes:

```ts
// en
handOff: {
  note: (reference: string) => `Your question is with Maison's client advisors (${reference}). They reply in your LINE chat with Maison, 11:00–20:00 Japan time.`,
  send: 'Send it in the LINE chat',
  typed: (reference: string, question: string) => `Question for a Maison advisor (${reference}): ${question}`,
},
// ja
handOff: {
  note: (reference: string) => `ご質問（${reference}）をMaisonのクライアントアドバイザーにお伝えしました。11:00〜20:00（日本時間）に、MaisonのLINEトークでご返信いたします。`,
  send: 'LINEトークで送る',
  typed: (reference: string, question: string) => `アドバイザーへの質問（${reference}）：${question}`,
},
```

- [ ] **Step 7: The chat.** In `components/chat-parts.tsx`, under a successful hand-off's tool line: the note (`data-testid="hand-off"`), then a secondary button (`data-testid="hand-off-line"`, the same classes as `LineChat`'s) linking to `lineMessageUrl(config.lineOaId, copy.typed(reference, question))`, with the words `copy.send`. Without a URL there's no button. A failed hand-off shows `<LineChat />` as before. Add `hand_off_to_staff` to `CONCIERGE_TOOLS` in `app/concierge/page.tsx`.
- [ ] **Step 8: Run** `npm test --prefix liff` and `npm run typecheck --prefix liff`. Expected: PASS.
- [ ] **Step 9: Commit**

```bash
git add liff/lib/concierge.ts liff/lib/tool-view.ts liff/lib/line-chat.ts liff/lib/copy.ts liff/components/chat-parts.tsx liff/app/concierge/page.tsx liff/lib/concierge.test.ts liff/lib/tool-view.test.ts liff/lib/line-chat.test.ts README.md
git commit -m "feat(liff): the hand-off reaches Maison's client advisors through Strapi, and opens the LINE chat with the question typed in

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(If `components/line-chat.tsx` changed, add it too.)

---

### Task 7: Ask about this piece

**Files:**
- Modify: `liff/app/products/[slug]/page.tsx`, `liff/app/concierge/page.tsx`, `liff/lib/concierge.ts`, `liff/lib/copy.ts`
- Test: `liff/lib/concierge.test.ts`

**Interfaces:**
- Produces: `pieceSlugOf(value: unknown): string | null` and `conciergeInstructions(locale, now, piece?: string | null)` in `lib/concierge.ts`.

- [ ] **Step 1: Write the failing tests** in `lib/concierge.test.ts`:
  - `pieceSlugOf('jewelry-coffret')` is `'jewelry-coffret'`, and `pieceSlugOf('weekender-50')` is `'weekender-50'`; it's null for `undefined`, `''`, `'Jewelry Coffret'`, `'../x'`, a 121-character slug, and a number.
  - `conciergeInstructions('en', now, 'jewelry-coffret')` ends with the piece paragraph below; without a piece, the instructions don't mention a piece's page.
  - `handleConcierge` with `{ locale: 'en', product: 'jewelry-coffret', messages }` gives the model instructions with the piece paragraph; with `product: '../etc'` they have none. Use the test file's existing fake model or MCP client to read what reaches `streamText`.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: `lib/concierge.ts`:**

```ts
/** A product's slug, as the Maison tools accept one (slugInput): lower-case letters, digits and hyphens. */
const PIECE_SLUG = /^[a-z0-9-]+$/;

/** The piece the customer is asking about, from the concierge page's ?product=, or null when it isn't a slug. */
export const pieceSlugOf = (value: unknown): string | null =>
  typeof value === 'string' && value.length <= 120 && PIECE_SLUG.test(value) ? value : null;
```

`conciergeInstructions` takes `piece?: string | null`, and with one, appends after the rules:

```
The customer is on the page of the piece with slug "<slug>". Unless they name another piece, "it" and "this" mean that piece: use that slug with view_product, as productSlugs for search_knowledge, and as productSlug for hand_off_to_staff.
```

`handleConcierge` reads `pieceSlugOf(body?.product)` and passes it on. The body type gains `product?: unknown`.
- [ ] **Step 4: Copy,** in `lib/copy.ts`:

```ts
// en
askAboutPiece: 'Ask about this piece',
conciergeIntroPiece: 'Ask me anything about this piece: care, sizing, personalization, delivery.',
pieceSuggestions: ['Can I have it personalized?', 'How do I care for it?', 'Which boutique has it in stock?'],
// ja
askAboutPiece: 'この商品について質問する',
conciergeIntroPiece: 'この商品について、お手入れ、サイズ、名入れ、配送など、何でもお尋ねください。',
pieceSuggestions: ['名入れはできますか？', 'お手入れ方法を教えてください。', 'どのブティックに在庫がありますか？'],
```

- [ ] **Step 5: The product page.** Under the details list: a `Link` to `/concierge?product=<slug>` (`data-testid="ask-about-piece"`), with `t.askAboutPiece`, styled `btn-secondary` with the page's 20px side margin and top margin to match the details.
- [ ] **Step 6: The concierge page.** Read `product` from the page's `searchParams` (a client page gets them as a promise: `use(searchParams)`), through `pieceSlugOf`. With a piece, show `t.conciergeIntroPiece` and `t.pieceSuggestions`, and send it with each turn: `body: () => ({ locale: localeRef.current, ...(piece ? { product: piece } : {}) })`.
- [ ] **Step 7: Run** `npm test --prefix liff` and `npm run typecheck --prefix liff`. Expected: PASS.
- [ ] **Step 8: Commit**

```bash
git add liff/app/products/[slug]/page.tsx liff/app/concierge/page.tsx liff/lib/concierge.ts liff/lib/copy.ts liff/lib/concierge.test.ts
git commit -m "feat(liff): Ask about this piece opens the concierge with the piece in context

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Into the demo, and a local check (controller)

**Files:**
- Modify: `strapi/src/plugins/maison/**` (the copy), `strapi/scripts/maison-setup.mjs`, `scripts/maison-setup.test.mjs`, `strapi/config/plugins.ts`, `README.md`

- [ ] **Step 1: Stop** `demo-strapi` and `demo-app`.
- [ ] **Step 2: Copy the plugin** from the worktree's `feat/maison-follow-up` into `strapi/src/plugins/maison`, the way product knowledge Task 5 did, and check the copy matches the commit.
- [ ] **Step 3: Setup.** In `maison-setup.mjs`, the "Maison customer" token gets `'plugin::maison.questions.ask'` after `'plugin::maison.appointments.request'`; update `scripts/maison-setup.test.mjs` if it checks those actions.
- [ ] **Step 4: A LINE stand-in for local checks.** In `strapi/config/plugins.ts`, under `lineChannelAccessToken`:

```ts
        // Where Strapi reaches LINE's Messaging API. Unset everywhere but local checks, which point it at a stand-in on
        // this machine (http://127.0.0.1:<port>) so nothing reaches a real phone.
        lineApiBaseUrl: env('MAISON_LINE_API_BASE_URL', '') || null,
```

- [ ] **Step 5: Run** the demo's `npm test`, then the plugin integration suites from the worktree with `STRAPI_APP_DIR=$HOME/work/maison-demo/strapi`. Expected: PASS, including `questions.test.mjs`.
- [ ] **Step 6: README.** The demo README's Strapi Cloud section: tick "MCP: hand questions to staff" on the "Maison customer" token, and give staff roles the two question permissions. The local section: `MAISON_LINE_API_BASE_URL` for checks.
- [ ] **Step 7: Commit** the copy and the demo's changes on `feat/maison-follow-up`.
- [ ] **Step 8: Local check.** Start a LINE stand-in on `127.0.0.1:4010` (a throwaway script in the session's scratchpad that logs pushes and answers profiles with `Paul (test)`), start `demo-strapi` with `MAISON_LINE_API_BASE_URL=http://127.0.0.1:4010`, run `npm run setup` (local), then start `demo-app`. In the browser, in mock mode: open a piece, **Ask about this piece**, ask something the knowledge doesn't cover, and check the hand-off line, the note with its `Q-` reference, and the LINE button's link. Then check the question in the local database through the integration suite's evidence or a read-only query. The admin side (the Customer questions section, Let them know, Answer) waits for Paul's morning check, since the admin needs his sign-in.
