import { Readable } from 'node:stream';

import type { Core } from '@strapi/strapi';

import { ASSISTANT_LIMITS } from '../constants';
import { countStaffMessages } from '../services/assistant';

/**
 * The Ask tab: whether the assistant is ready, and one chat turn, streamed. Both routes are for admins who hold
 * assistant.use. What each tool may read is checked again inside the turn, against the admin's own role.
 */
export default ({ strapi }: { strapi: Core.Strapi }) => {
  const assistant = () => strapi.plugin('maison').service('assistant');

  /**
   * Sends the service's answer as server-sent events. Koa can't send a web stream: without the Node stream the browser
   * gets `{}`. The headers keep a proxy from buffering the stream or compressing it, which would show as a slow model.
   */
  const send = (ctx, response: Response) => {
    if (!response.body) return ctx.internalServerError('The assistant gave no answer.');
    ctx.status = 200;
    ctx.set('Content-Type', 'text/event-stream; charset=utf-8');
    ctx.set('Cache-Control', 'no-cache, no-transform');
    ctx.set('Connection', 'keep-alive');
    ctx.set('X-Accel-Buffering', 'no');
    ctx.body = Readable.fromWeb(response.body as never);
  };

  return {
    /** GET /assistant/status: `{ ready: true, model }`, or `{ ready: false, reason }`. Never the key. */
    async status(ctx) {
      ctx.body = assistant().status();
    },

    /**
     * POST /assistant/chat: one turn. The browser sends the whole history each time (an AG-UI run input). Not ready and a
     * chat that is too long are 200 event streams with one RUN_ERROR, because ai-client 0.29.2 never reads the body of an
     * HTTP error. Only a body that is no run input is a real error, a 400.
     */
    async chat(ctx) {
      if (assistant().status().ready === false) return send(ctx, await assistant().errorResponse('not_ready'));

      let params;
      try {
        params = await assistant().parseBody(ctx.request.body);
      } catch (error) {
        return ctx.badRequest((error as Error).message);
      }

      if (countStaffMessages(params.messages) > ASSISTANT_LIMITS.staffMessages) return send(ctx, await assistant().errorResponse('chat_too_long'));

      // Aborted only when the response closes before it ends: a closed tab, or Stop. The service stops the model call then.
      const responseController = new AbortController();
      ctx.res.once('close', () => {
        if (!ctx.res.writableEnded) responseController.abort();
      });

      return send(
        ctx,
        await assistant().turn(params, {
          ability: ctx.state.userAbility ?? { can: () => false },
          adminId: ctx.state.user?.id ?? null,
          responseController,
        })
      );
    },
  };
};
