import type { Core } from '@strapi/strapi';

import { getConfig } from '../config';
import { fitUnits } from '../domain/text';
import { answerInput, describeIssues, questionReferenceInput, questionsListInput } from '../mcp/schemas';
import { fromQuery } from '../rest/query';
import type { ReplyOutcome, ReplyStatus } from '../services/questions';

const REFERENCE_HINT = 'Use a reference like Q-4821.';
const ANSWER_HINT = 'Write an answer of up to 2,000 characters, and pick a category to add it to product knowledge.';

/** Strapi's error helper for each outcome that isn't sent. */
const REPLY_ERRORS: Record<Exclude<ReplyStatus, 'sent'>, string> = {
  not_found: 'notFound',
  already_taken: 'conflict',
  already_answered: 'conflict',
  failed: 'badGateway',
  not_configured: 'serviceUnavailable',
};

/** What a staff name is cut to, in UTF-16 units: the question's `staffName` `maxLength`. */
const NAME_LENGTH = 100;

/**
 * The Customer questions section on the Maison page: the rows, Let them know, and Answer. Whoever is signed in is who
 * writes to the customer: the staff name comes from their account, never from the request.
 */
export default ({ strapi }: { strapi: Core.Strapi }) => {
  const questions = () => strapi.plugin('maison').service('questions');

  /**
   * The signed-in admin's first name: the name staff messages are signed with, cut to what the question's `staffName`
   * holds without splitting an emoji. Null makes the message speak for Maison's client advisor team: the admin has no
   * first name, or it is the house's own, "Maison" or either name in the config, in any case, which would have the
   * message introduce Maison as one of its own advisors and sign "Maison, Maison".
   */
  const staffNameOf = (ctx): string | null => {
    const firstname = ctx.state?.user?.firstname;
    const name = typeof firstname === 'string' ? firstname.trim() : '';
    if (!name) return null;
    const { houseName } = getConfig(strapi);
    const houseNames = ['Maison', houseName.en, houseName.ja].map((house) => house.trim().toLowerCase());
    return houseNames.includes(name.toLowerCase()) ? null : fitUnits(name, NAME_LENGTH);
  };

  /**
   * A 200 with the outcome when LINE took the message. Otherwise the error that says why not: 404, 409 when the
   * question is taken or answered already, 502 when LINE refused it or couldn't be reached, and 503 when Strapi has no
   * token to send with. The message goes to the admin as it is.
   */
  const answerWith = (ctx, outcome: ReplyOutcome) => {
    if (outcome.status === 'sent') {
      ctx.body = outcome;
      return;
    }
    return ctx[REPLY_ERRORS[outcome.status]](outcome.message, { code: outcome.status });
  };

  return {
    /** GET /questions: the section's rows, newest first. */
    async list(ctx) {
      // Query strings are text, so a limit arrives as "20".
      const filters = questionsListInput.safeParse(fromQuery(ctx.query, { numbers: ['limit'] }));
      if (!filters.success) {
        return ctx.badRequest(describeIssues(filters.error), { code: 'invalid_input', hint: 'Fix the filters and try again.' });
      }
      const result = await questions().list(filters.data);
      if (!result.ok) return ctx.badRequest(result.message, { code: result.code, hint: result.hint });
      ctx.body = { questions: result.value };
    },

    /** POST /questions/:reference/notify: the section's Let them know. */
    async notify(ctx) {
      const reference = questionReferenceInput.safeParse(ctx.params.reference);
      if (!reference.success) {
        return ctx.badRequest(describeIssues(reference.error), { code: 'invalid_input', hint: REFERENCE_HINT });
      }
      return answerWith(ctx, await questions().notify(reference.data, staffNameOf(ctx)));
    },

    /** POST /questions/:reference/answer, with `{ text, addToKnowledge, category }`: the dialog's Send on LINE. */
    async answer(ctx) {
      const reference = questionReferenceInput.safeParse(ctx.params.reference);
      if (!reference.success) {
        return ctx.badRequest(describeIssues(reference.error), { code: 'invalid_input', hint: REFERENCE_HINT });
      }
      const reply = answerInput.safeParse(ctx.request.body ?? {});
      if (!reply.success) {
        return ctx.badRequest(describeIssues(reply.error), { code: 'invalid_input', hint: ANSWER_HINT });
      }
      return answerWith(ctx, await questions().answer(reference.data, reply.data, staffNameOf(ctx)));
    },
  };
};
