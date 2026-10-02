import type { Core } from '@strapi/strapi';
import { APICallError, NoObjectGeneratedError, RetryError, TypeValidationError, generateObject } from 'ai';

import { aiEnabled, languageModelOf, modelVersionOf, type AiSettings } from '../ai/provider';
import { getConfig } from '../config';
import { LABEL_BATCH, MAX_LABEL_ATTEMPTS, UID } from '../constants';
import {
  PROMPT_VERSION,
  labelSystemPrompt,
  labelUserMessage,
  labelsSchema,
  type LabelInput,
  type Labels,
} from '../domain/inquiry-criteria';
import { queueFor } from '../domain/inquiry-queue';

type Doc = Record<string, any>;

/** What `label` reads of an inquiry: the words and the turn's two facts, never the customer. A missing or null reply is no reply. */
export type LabelRequest = Omit<LabelInput, 'reply'> & { reply?: string | null };

export interface SweepResult {
  labelled: number;
  failed: number;
  skipped: number;
  /** Set when another sweep was running: this one did nothing. */
  busy?: true;
}

/**
 * The rows worth a model call: waiting (pending), passed over while AI was off (skipped, so labelling catches up once a
 * key is set), or failed fewer than MAX_LABEL_ATTEMPTS times. A failed row that used its attempts is parked until staff
 * press Label again: otherwise a row the model always answers in the wrong shape would take a place in every batch and
 * starve the rows behind it. A row a person labelled is never picked: their label wins.
 */
const TO_LABEL: Doc = {
  humanCorrected: { $ne: true },
  $or: [
    { analysisStatus: { $in: ['pending', 'skipped'] } },
    { analysisStatus: { $eq: 'failed' }, analysisAttempts: { $lt: MAX_LABEL_ATTEMPTS } },
  ],
};

/** The statuses a row has while the sweep may still write its labels. */
const LABELLABLE = ['pending', 'skipped', 'failed'];

/** How long one model call may take, as in Pulse. */
const LABEL_TIMEOUT_MS = 30_000;

/** `text` with every copy of the key taken out: nothing Strapi logs may carry it. */
const withoutKey = (text: string, key: string | null): string => (key ? text.split(key).join('[key]') : text);

/** What went wrong, from whatever was thrown, without the key. */
const reasonOf = (error: unknown, key: string | null): string => withoutKey(String((error as Error | undefined)?.message ?? error), key);

/**
 * What a failed labelling says, as far as the sweep acts on it:
 * - `wrong-shape`: the model answered, and the labels don't fit (`NoObjectGeneratedError`, `TypeValidationError`). That is
 *   a verdict on this inquiry, so it counts an attempt and can fail the row.
 * - `key-refused`: the provider answered 401 or 403. Every row would meet it, until the key is fixed.
 * - `no-answer`: the provider didn't answer. The SDK has already retried a call that never connected, or got a 429 or a
 *   5xx, and gives up with a `RetryError`, and the 30-second timeout or an abort is an error named `TimeoutError` or
 *   `AbortError`. Every row would meet it, until the network or the provider is back.
 * - `other`: anything else, such as a model that doesn't exist, or Strapi failing to save.
 * The last three say nothing against the inquiry, so a sweep that meets one leaves the row as it was and stops.
 */
type Failure = 'wrong-shape' | 'key-refused' | 'no-answer' | 'other';

const failureOf = (error: unknown): Failure => {
  if (NoObjectGeneratedError.isInstance(error) || TypeValidationError.isInstance(error)) return 'wrong-shape';
  if (APICallError.isInstance(error) && (error.statusCode === 401 || error.statusCode === 403)) return 'key-refused';
  const name = (error as { name?: unknown } | null | undefined)?.name;
  if (RetryError.isInstance(error) || name === 'TimeoutError' || name === 'AbortError') return 'no-answer';
  return 'other';
};

/** What the warning says when a sweep stops, for each failure that says nothing against the inquiry. */
const STOPPED: Record<Exclude<Failure, 'wrong-shape'>, string> = {
  'key-refused': 'The AI provider refused the API key',
  'no-answer': 'The AI provider gave no answer',
  other: 'It failed for another reason',
};

/** What the model factory is given: the AI settings, and none of the plugin's other config. */
const aiSettingsOf = (strapi: Core.Strapi): AiSettings => {
  const { aiProvider, aiModel, aiApiKey, aiBaseUrl } = getConfig(strapi);
  return { aiProvider, aiModel, aiApiKey, aiBaseUrl };
};

export default ({ strapi }: { strapi: Core.Strapi }) => {
  /**
   * Overlap guard: ten sequential model calls can outlast the minute between cron ticks, and a second sweep would label
   * the same rows again and double the model spend.
   */
  let sweeping = false;

  /** The labels for one exchange, with the settings the caller read. Throws on any failure. */
  const labelWith = async (settings: AiSettings, input: LabelRequest): Promise<Labels> => {
    const { object } = await generateObject({
      model: languageModelOf(settings),
      schema: labelsSchema,
      system: labelSystemPrompt(),
      prompt: labelUserMessage({ ...input, reply: input.reply ?? '' }),
      // A labelling that takes longer than this is a hung connection, not a slow model: the sweep leaves the row as it was, stops, and tries again on the next one.
      abortSignal: AbortSignal.timeout(LABEL_TIMEOUT_MS),
    });
    return object;
  };

  const findRow = async (documentId: string): Promise<Doc | null> => (await strapi.documents(UID.inquiry).findOne({ documentId })) as Doc | null;

  /** Writes `data` to the inquiry. Strapi's types know only `id` and `documentId` for this content type, and `update` checks its data against them. */
  const updateInquiry = (documentId: string, data: Doc) => strapi.documents(UID.inquiry).update({ documentId, data });

  /**
   * The row as it is now, if the sweep may still write to it. A person can change a label while the model is answering
   * (Change label sets `humanCorrected`), and theirs must win: so the row is read again right before anything is
   * written, and null means it is no longer the sweep's: a person labelled it, it has its labels already, or it is gone.
   */
  const stillWaiting = async (documentId: string): Promise<Doc | null> => {
    const row = await findRow(documentId);
    return row && !row.humanCorrected && LABELLABLE.includes(row.analysisStatus) ? row : null;
  };

  /**
   * Labels one row: its outcome, or null when the row was left as it is because it is no longer the sweep's. Only an
   * answer in the wrong shape fails the row, with one more attempt. Any other failure says nothing against it: the row
   * is left as it was, with no write and no attempt, the sweep logs one warning that says which kind it was, and the
   * outcome is `stopped`, for the batch to end.
   */
  const labelRow = async (row: Doc, settings: AiSettings): Promise<'labelled' | 'failed' | 'stopped' | null> => {
    try {
      const labels = await labelWith(settings, {
        message: row.message,
        reply: row.reply,
        knowledgeFound: Boolean(row.knowledgeFound),
        handedOff: Boolean(row.handedOff),
      });
      const current = await stillWaiting(row.documentId);
      if (!current) return null;
      // The queue is the code's rule over the labels and the hand-off, never the model's own say.
      await updateInquiry(row.documentId, {
        ...labels,
        analysisStatus: 'analyzed',
        modelVersion: modelVersionOf(settings),
        promptVersion: PROMPT_VERSION,
        queue: queueFor({ handedOff: Boolean(current.handedOff), kind: labels.kind, answered: labels.answered }),
      });
      return 'labelled';
    } catch (error) {
      const failure = failureOf(error);
      if (failure !== 'wrong-shape') {
        strapi.log.warn(`[maison] Labelling stopped until the next sweep. ${STOPPED[failure]}: ${reasonOf(error, settings.aiApiKey)}`);
        return 'stopped';
      }
      const current = await stillWaiting(row.documentId);
      if (!current) return null;
      const attempts = (current.analysisAttempts ?? 0) + 1;
      strapi.log.warn(
        `[maison] Labelling inquiry ${row.documentId} failed (attempt ${attempts} of ${MAX_LABEL_ATTEMPTS}): ${reasonOf(error, settings.aiApiKey)}`
      );
      await updateInquiry(row.documentId, { analysisStatus: 'failed', analysisAttempts: attempts });
      return 'failed';
    }
  };

  /**
   * With AI off, the sweep only marks the new rows skipped: inquiries still reach staff, a hand-off is in Needs an
   * answer from the start, and Change label labels by hand. `skipped` says AI was off when the sweep saw the row.
   */
  const skipPending = async (): Promise<SweepResult> => {
    const pending = (await strapi.documents(UID.inquiry).findMany({ filters: { analysisStatus: { $eq: 'pending' } }, fields: ['documentId'] })) as Doc[];
    for (const { documentId } of pending) await updateInquiry(documentId, { analysisStatus: 'skipped' });
    return { labelled: 0, failed: 0, skipped: pending.length };
  };

  const labelBatch = async (settings: AiSettings): Promise<SweepResult> => {
    const rows = (await strapi.documents(UID.inquiry).findMany({ filters: TO_LABEL, sort: 'createdAt:asc', limit: LABEL_BATCH })) as Doc[];
    let labelled = 0;
    let failed = 0;
    // One at a time, each in its own try: a row the model answers wrongly never stops the rows after it. A failure that says
    // nothing against the inquiry (a refused key, no answer) ends the batch: every row would meet it, and the next sweep tries again.
    for (const row of rows) {
      const outcome = await labelRow(row, settings);
      if (outcome === 'stopped') break;
      if (outcome === 'labelled') labelled += 1;
      if (outcome === 'failed') failed += 1;
    }
    return { labelled, failed, skipped: 0 };
  };

  return {
    /** The labels for one exchange, from the configured model. Throws on any failure: a wrong answer, a timeout, a refused key. */
    label: (input: LabelRequest): Promise<Labels> => labelWith(aiSettingsOf(strapi), input),

    /**
     * Labels the oldest waiting inquiries, as Pulse's analysis sweep does its mentions. Meant to run every minute, and it
     * answers how many it labelled, failed on and skipped. A sweep that starts while another is running does nothing and
     * says `busy`. It throws only when Strapi itself fails: the cron job logs that.
     */
    async sweep(): Promise<SweepResult> {
      if (sweeping) return { labelled: 0, failed: 0, skipped: 0, busy: true };
      sweeping = true;
      try {
        const settings = aiSettingsOf(strapi);
        const result = aiEnabled(settings) ? await labelBatch(settings) : await skipPending();
        if (result.labelled + result.failed + result.skipped > 0) {
          strapi.log.info(`[maison] Labelling sweep: ${result.labelled} labelled, ${result.failed} failed, ${result.skipped} skipped.`);
        }
        return result;
      } finally {
        sweeping = false;
      }
    },
  };
};
