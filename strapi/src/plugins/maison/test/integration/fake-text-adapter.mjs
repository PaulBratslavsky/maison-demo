/**
 * A scripted text adapter for chat(). It is plain JavaScript because `node --test` can't import the unit tests'
 * TypeScript one (test/unit/fake-text-adapter.ts). It reaches no model.
 *
 * `turns` has one entry for each model call, in order. An entry is the chunks the adapter yields for that call, or
 * 'never', which yields nothing until the call is aborted. A call with no entry left throws, so a test that makes one
 * call too many fails with a message that says so. `requests` keeps the options of every call, so a test can read what
 * the model would have been sent.
 */
const MODEL = 'fake-chat-model';
let counter = 0;
const nextId = (prefix) => `${prefix}-${(counter += 1)}`;

/** A model turn that writes `text` and stops. */
export const textTurn = (text) => {
  const messageId = nextId('msg');
  return [
    { type: 'RUN_STARTED' },
    { type: 'TEXT_MESSAGE_START', messageId, role: 'assistant' },
    { type: 'TEXT_MESSAGE_CONTENT', messageId, delta: text, content: text },
    { type: 'TEXT_MESSAGE_END', messageId },
    { type: 'RUN_FINISHED', finishReason: 'stop' },
  ];
};

/** A model turn that calls the tool `name` with `args` and waits for its result. */
export const toolCallTurn = (name, args) => {
  const toolCallId = nextId('call');
  const json = JSON.stringify(args);
  return [
    { type: 'RUN_STARTED' },
    { type: 'TOOL_CALL_START', toolCallId, toolCallName: name, toolName: name, parentMessageId: nextId('msg'), index: 0 },
    { type: 'TOOL_CALL_ARGS', toolCallId, delta: json, args: json },
    { type: 'TOOL_CALL_END', toolCallId, toolCallName: name, toolName: name, input: args },
    { type: 'RUN_FINISHED', finishReason: 'tool_calls' },
  ];
};

/** A model turn that fails, as the adapter reports a provider's error: `message` and `code` twice, and the raw event. */
export const errorTurn = (code, message) => [
  { type: 'RUN_STARTED' },
  { type: 'RUN_ERROR', message, code, error: { message, code }, rawEvent: { status: Number(code) || undefined, message } },
];

export const fakeTextAdapter = (turns) => {
  const requests = [];
  let call = 0;
  const adapter = {
    kind: 'text',
    name: 'fake',
    model: MODEL,
    async *chatStream(options) {
      requests.push(options);
      const turn = turns[call];
      call += 1;
      if (turn === undefined) throw new Error(`The fake adapter was called ${call} times, and was scripted for ${turns.length}.`);
      if (turn === 'never') {
        // chat() hands the model call its abort signal as `request.signal`, as ai-anthropic reads it.
        const signal = options.request?.signal;
        await new Promise((resolve) => {
          if (!signal || signal.aborted) return resolve();
          signal.addEventListener('abort', () => resolve(), { once: true });
        });
        return;
      }
      for (const chunk of turn) {
        const stamped = { ...chunk, model: options.model ?? MODEL, timestamp: Date.now() };
        if (chunk.type === 'RUN_STARTED' || chunk.type === 'RUN_FINISHED') {
          stamped.runId = options.runId ?? 'run-fake';
          stamped.threadId = options.threadId ?? 'thread-fake';
        }
        yield stamped;
      }
    },
    async structuredOutput() {
      throw new Error('The fake adapter has no structured output.');
    },
  };
  return { adapter, requests };
};
