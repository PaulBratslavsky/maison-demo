import type { RawRunError, StaffError } from '../assistant/errors';

/** One event of the stream chat() gives: AG-UI's, with the fields this file reads. */
export interface Chunk {
  type: string;
  [field: string]: any;
}

/** The two events the wrapper adds to a stream, which the page turns into a note under the messages. */
export const CUSTOM_EVENTS = { maxTurns: 'max_turns', declined: 'declined' } as const;

export interface WrapOptions {
  /** The staff text for a RUN_ERROR, for the source's and for the wrapper's own timeout. */
  describe: (raw: RawRunError) => StaffError;
  /** Called once per RUN_ERROR the source sent, with the original, before it is rewritten. */
  onSourceError?: (original: RawRunError) => void;
  /** Called once when the stream ends, whatever the way: the tool names called (from TOOL_CALL_START) and the time taken. */
  onDone?: (summary: { tools: string[]; ms: number }) => void;
  deadlineMs: number;
  /** Held only by chat() and this wrapper. */
  chatController: AbortController;
  /** The response's signal: when it aborts (a closed tab, or Stop), the wrapper aborts chatController at once. */
  responseSignal: AbortSignal;
}

const TIMED_OUT = Symbol('timed out');
const RESPONSE_CLOSED = Symbol('response closed');

/** `finishReason` as ai-client reads it: at the top level of RUN_FINISHED, else in TanStack's metadata. */
const finishReasonOf = (chunk: Chunk): string | null | undefined => chunk.finishReason ?? chunk.metadata?.tanstack?.finishReason;

const customEvent = (name: string): Chunk => ({ type: 'CUSTOM', name, value: {}, timestamp: Date.now() });

/** Runs a callback that only logs: whatever it throws, the stream goes on. */
const quietly = (run: () => void) => {
  try {
    run();
  } catch {
    // A failed log line must never break an answer.
  }
};

/** What an error thrown by the source says, in the shape of a RUN_ERROR: the code is its code, else its HTTP status. */
const rawOfThrown = (error: unknown): RawRunError => {
  const thrown = error as { code?: unknown; status?: unknown; message?: unknown } | null | undefined;
  const code = typeof thrown?.code === 'string' || typeof thrown?.code === 'number' ? thrown.code : typeof thrown?.status === 'number' ? String(thrown.status) : undefined;
  return { code, message: typeof thrown?.message === 'string' ? thrown.message : String(error) };
};

/**
 * Takes the stream chat() gives and returns the stream the response sends.
 * - Each RUN_ERROR, and an error the source throws, becomes one with the staff text. The provider's own text goes to
 *   `onSourceError` and nowhere else.
 * - The whole request has `deadlineMs`, from the first pull. When it passes, the stream ends with a RUN_ERROR `timeout`,
 *   and chat() is stopped. The source need not answer: a call that hangs doesn't hold the wrapper up.
 * - When six model turns are spent on tool calls, chat() ends the run as a success, with a last RUN_FINISHED of
 *   `tool_calls`. The wrapper adds a `max_turns` event, unless the run is waiting for the browser to run a draft tool.
 * - A model turn that ends with "stop", no text and no tool call is a refusal, which the adapter can't report as one.
 *   The wrapper adds a `declined` event right after it.
 */
export async function* wrapStream(source: AsyncIterable<Chunk>, options: WrapOptions): AsyncGenerator<Chunk> {
  const { describe, onSourceError, onDone, deadlineMs, chatController, responseSignal } = options;
  const startedAt = Date.now();
  const tools: string[] = [];
  const iterator = source[Symbol.asyncIterator]();

  // The response closing (a closed tab, or Stop) stops the model call at once, and stops this stream waiting for the source.
  const stopChat = () => chatController.abort();
  let signalResponseClosed: () => void = () => {};
  const responseClosed = new Promise<typeof RESPONSE_CLOSED>((resolve) => {
    signalResponseClosed = () => resolve(RESPONSE_CLOSED);
  });
  const onResponseClosed = () => {
    stopChat();
    signalResponseClosed();
  };
  if (responseSignal.aborted) onResponseClosed();
  else responseSignal.addEventListener('abort', onResponseClosed, { once: true });

  let timer: ReturnType<typeof setTimeout> | undefined;
  let sourceDone = false;
  let timedOut = false;
  let failed = false;
  let lastFinished: Chunk | null = null;
  let sawText = false;
  let sawToolCall = false;

  /** The RUN_ERROR staff read, for what the source or the wrapper says went wrong. `rest` is the source's own, without its rawEvent. */
  const staffError = (raw: RawRunError, rest: Record<string, any> = {}): Chunk => {
    const staff = describe(raw);
    return {
      ...rest,
      type: 'RUN_ERROR',
      timestamp: rest.timestamp ?? Date.now(),
      message: staff.message,
      code: staff.code,
      error: { ...rest.error, message: staff.message, code: staff.code },
    };
  };

  try {
    while (true) {
      const remaining = startedAt + deadlineMs - Date.now();
      let step: IteratorResult<Chunk> | typeof TIMED_OUT | typeof RESPONSE_CLOSED;
      try {
        step =
          remaining <= 0
            ? TIMED_OUT
            : await Promise.race([
                iterator.next(),
                responseClosed,
                new Promise<typeof TIMED_OUT>((resolve) => {
                  timer = setTimeout(() => resolve(TIMED_OUT), remaining);
                }),
              ]);
      } catch (error) {
        sourceDone = true;
        failed = true;
        const raw = rawOfThrown(error);
        if (onSourceError) quietly(() => onSourceError(raw));
        yield staffError(raw);
        return;
      } finally {
        clearTimeout(timer);
      }

      if (step === RESPONSE_CLOSED) return;
      if (step === TIMED_OUT) {
        timedOut = true;
        failed = true;
        yield staffError({ code: 'timeout', message: 'The request took too long.' });
        return;
      }
      if (step.done) {
        sourceDone = true;
        break;
      }

      const chunk = step.value;
      switch (chunk.type) {
        case 'RUN_ERROR': {
          failed = true;
          const raw: RawRunError = { code: chunk.code ?? chunk.error?.code, message: chunk.message ?? chunk.error?.message };
          if (onSourceError) quietly(() => onSourceError(raw));
          const { rawEvent: _rawEvent, ...rest } = chunk;
          yield staffError(raw, rest);
          break;
        }
        case 'TOOL_CALL_START':
          sawToolCall = true;
          tools.push(chunk.toolCallName ?? chunk.toolName ?? 'unknown');
          yield chunk;
          break;
        case 'TEXT_MESSAGE_CONTENT':
          if (typeof chunk.delta === 'string' && chunk.delta.trim() !== '') sawText = true;
          yield chunk;
          break;
        case 'RUN_FINISHED': {
          lastFinished = chunk;
          const declined = finishReasonOf(chunk) === 'stop' && !sawText && !sawToolCall;
          sawText = false;
          sawToolCall = false;
          yield chunk;
          if (declined && !failed) yield customEvent(CUSTOM_EVENTS.declined);
          break;
        }
        default:
          yield chunk;
      }
    }

    if (!failed && lastFinished && finishReasonOf(lastFinished) === 'tool_calls' && lastFinished.outcome?.type !== 'interrupt') {
      yield customEvent(CUSTOM_EVENTS.maxTurns);
    }
  } finally {
    clearTimeout(timer);
    responseSignal.removeEventListener('abort', onResponseClosed);
    // A source that is still running, or hung, is told to stop and not waited for: its return() can't run until its pending pull ends.
    if (!sourceDone) quietly(() => void Promise.resolve(iterator.return?.()).catch(() => {}));
    if (timedOut) stopChat();
    if (onDone) quietly(() => onDone({ tools, ms: Date.now() - startedAt }));
  }
}
