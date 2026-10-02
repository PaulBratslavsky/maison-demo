// A stand-in for Anthropic's Messages API on 127.0.0.1:4011, for local checks of the inquiries' labelling: nothing
// reaches Anthropic, and no key is needed. Strapi calls it when MAISON_ANTHROPIC_API_BASE_URL points here (README,
// "Production notes").
//   POST /v1/messages   answers Maison's forced record_labels call with labels made from a few keywords (labelsFor)
// A message that says "stand-in fail" is answered 529, as an overloaded API answers, so a failed label can be checked.
// Every other route answers 404. Labels and failures are logged to strapi/.tmp/anthropic-stand-in.jsonl, one JSON line
// each, without any header of the request: never the API key. From the repo root: npm run anthropic:stand-in.
// Env: ANTHROPIC_STAND_IN_PORT (4011).
import { appendFileSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOG_FILE = join(ROOT, 'strapi', '.tmp', 'anthropic-stand-in.jsonl');
/** The tool Maison forces (record_labels in the plugin's inquiry criteria): the only call this stand-in answers. */
const LABEL_TOOL = 'record_labels';

// Whole English words ("late" isn't "translate"); Japanese has no spaces to bound words with.
const COMPLAINT = /\b(broke|broken|damaged|scratched|late|disappointed|disappointing|refund)\b|壊れ|傷|遅れ|残念|不満/i;
const PRAISE = /\b(thanks|thank you|love|wonderful|beautiful|amazing)\b|ありがとう|素敵|素晴らしい|嬉しい/i;
const FAIL = /stand-in fail/i;

/** A log that adds one line of JSON to `file` for each entry, making its folder first. */
export const fileLog = (file) => (entry) => {
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, `${JSON.stringify(entry)}\n`);
};

/** The customer's message from Maison's labelling message: the text between its customer_message tags. */
const customerMessageOf = (content) => /<customer_message>\n([\s\S]*?)\n<\/customer_message>/.exec(content)?.[1] ?? '';

/**
 * The labels for one exchange, as Maison's labelling message gives it (labelUserMessage): a complaint when the
 * customer's message has a complaint word, praise when it has a word of thanks, and otherwise a question, answered
 * when knowledge was found and nothing was handed to staff. Only the customer's message is read, never the reply.
 */
export const labelsFor = (content) => {
  const message = customerMessageOf(content);
  if (COMPLAINT.test(message)) {
    return { kind: 'complaint', sentimentScore: -0.6, sentimentLabel: 'negative', answered: false, reason: 'The stand-in found a complaint word in the message.', topic: 'stand-in complaint' };
  }
  if (PRAISE.test(message)) {
    return { kind: 'praise', sentimentScore: 0.8, sentimentLabel: 'positive', answered: true, reason: 'The stand-in found a word of thanks in the message.', topic: 'stand-in praise' };
  }
  const answered = /Knowledge found: yes\./.test(content) && !/Handed to staff: yes\./.test(content);
  return {
    kind: 'question',
    sentimentScore: 0,
    sentimentLabel: 'neutral',
    answered,
    reason: answered ? 'The stand-in counts a question as answered when knowledge was found.' : 'The stand-in found no knowledge for this question.',
    topic: 'stand-in question',
  };
};

/**
 * The stand-in, as a server that isn't listening yet. `log` gets an entry for each labelling call it answers,
 * `{ at, kind: 'labels', model, labels }`, and each failure it was asked for, `{ at, kind: 'failure', model }`: what
 * came in, and when, and none of its headers.
 */
export const createStandIn = ({ log }) =>
  createServer((request, response) => {
    const answer = (status, body) => {
      response.writeHead(status, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(body));
    };
    const error = (status, type, message) => answer(status, { type: 'error', error: { type, message } });
    const pathname = (request.url ?? '/').split('?')[0];

    if (request.method !== 'POST' || pathname !== '/v1/messages') {
      request.resume(); // whatever body it has, unread
      return error(404, 'not_found_error', 'Not found');
    }
    if (!request.headers['x-api-key']) {
      request.resume();
      return error(401, 'authentication_error', 'x-api-key header is required');
    }

    let raw = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => (raw += chunk));
    request.on('end', () => {
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        return error(400, 'invalid_request_error', 'The request body is not JSON.');
      }
      if (body?.tool_choice?.type !== 'tool' || body.tool_choice.name !== LABEL_TOOL) {
        return error(400, 'invalid_request_error', `The stand-in only answers a forced ${LABEL_TOOL} call.`);
      }
      const content = typeof body.messages?.[0]?.content === 'string' ? body.messages[0].content : '';
      const model = typeof body.model === 'string' ? body.model : 'unknown';
      if (FAIL.test(customerMessageOf(content))) {
        log({ at: new Date().toISOString(), kind: 'failure', model });
        return error(529, 'overloaded_error', 'Overloaded (stand-in)');
      }
      const labels = labelsFor(content);
      log({ at: new Date().toISOString(), kind: 'labels', model, labels });
      answer(200, {
        id: `msg_stand_in_${Date.now()}`,
        type: 'message',
        role: 'assistant',
        model,
        content: [{ type: 'tool_use', id: `toolu_stand_in_${Date.now()}`, name: LABEL_TOOL, input: labels }],
        stop_reason: 'tool_use',
        stop_sequence: null,
        usage: { input_tokens: 0, output_tokens: 0 },
      });
    });
  });

/** One line for the terminal: the labels it gave, or the failure it was asked for. */
const describe = (entry) =>
  entry.kind === 'labels' ? `labels: ${entry.labels.kind}, ${entry.labels.sentimentLabel}, answered ${entry.labels.answered}` : 'answered 529, as asked';

const start = () => {
  // `||`, not `??`: a key left empty counts as unset.
  const port = Number(process.env.ANTHROPIC_STAND_IN_PORT || 4011);
  const toFile = fileLog(LOG_FILE);
  const server = createStandIn({
    log: (entry) => {
      try {
        toFile(entry);
      } catch (error) {
        console.error(`[anthropic-stand-in] The log couldn't be written: ${error.message}`); // the call is still answered
      }
      console.log(`[anthropic-stand-in] ${describe(entry)}`);
    },
  });
  // One line, and exit 1, rather than a stack trace: most likely another stand-in is already running.
  // exitCode, not process.exit(): the message must reach a pipe before the process ends.
  server.on('error', (error) => {
    console.error(error.code === 'EADDRINUSE' ? `Port ${port} is in use: is another Anthropic stand-in running?` : `The Anthropic stand-in couldn't start: ${error.message}`);
    process.exitCode = 1;
  });
  server.listen(port, '127.0.0.1', () => console.log(`Anthropic stand-in on http://127.0.0.1:${port}, logging to ${relative(process.cwd(), LOG_FILE) || LOG_FILE}`));
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) start();
