import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { READ_TOOL_NAMES, TOOL_LABELS } from '../../server/src/assistant/tools';
import { ACTION, ASSISTANT_LIMITS, SAVED_CHATS } from '../../server/src/constants';
import routes from '../../server/src/routes';

/**
 * The README's section on the Ask tab says what the code does. These hold the facts that are written twice, the tools, the routes, the
 * limits and the names of the settings, to the code that has them, so a change to one that forgets the other fails here.
 */
const readme = readFileSync(new URL('../../README.md', import.meta.url), 'utf8');
const changelog = readFileSync(new URL('../../CHANGELOG.md', import.meta.url), 'utf8');
const start = readme.indexOf('## The Ask tab');
const section = readme.slice(start, readme.indexOf('## The Homepage widgets'));

describe("the README's section on the Ask tab", () => {
  it('is there, between the admin page and the Homepage widgets', () => {
    expect(start).toBeGreaterThan(readme.indexOf('## The admin page'));
    expect(section.length).toBeGreaterThan(2000);
    for (const heading of ['### The screen', '### Saved chats', '### Tools', '### What the model sees', '### Limits and errors', '### Routes']) expect(section, heading).toContain(heading);
  });

  it('names every read tool with its label, in the table of tools', () => {
    for (const name of READ_TOOL_NAMES) expect(section, name).toContain(`| \`${name}\` |`);
    for (const label of Object.values(TOOL_LABELS)) expect(section, label).toContain(`| ${label} |`);
  });

  it('names the permission and the settings, and the default model', () => {
    expect(section).toContain(`"Use the Maison assistant" (\`${ACTION.assistantUse}\`)`);
    expect(section).toContain('`aiChatModel` (`AI_CHAT_MODEL`), `claude-sonnet-5-5` by default');
    expect(section).toContain('`AI_API_KEY`');
  });

  it('lists every route of the assistant and of the saved chats, as the server serves them', () => {
    const served = routes.admin.routes.filter((route) => route.handler.startsWith('assistant.') || route.handler.startsWith('conversations.'));
    expect(served).toHaveLength(7);
    for (const { method, path } of served) expect(section, `${method} ${path}`).toContain(`\`${method} ${path}\``);
  });

  it('gives the limits as the code has them', () => {
    expect(section).toContain(`| Messages from you in one chat | ${ASSISTANT_LIMITS.staffMessages}. The ${ASSISTANT_LIMITS.staffMessages + 1}st is refused`);
    expect(section).toContain(`| Model turns for one answer | ${ASSISTANT_LIMITS.modelTurns}. After that, "The assistant stopped after ${ASSISTANT_LIMITS.modelTurns} steps.`);
    expect(section).toContain(`| Time for one answer | ${ASSISTANT_LIMITS.deadlineMs / 1000} seconds |`);
    expect(section).toContain(`| Output of one model turn | ${ASSISTANT_LIMITS.maxTokens.toLocaleString('en-US')} tokens`);
    expect(section).toContain(`A list answer has at most ${ASSISTANT_LIMITS.listRows} rows`);
    expect(section).toContain(`cut to ${ASSISTANT_LIMITS.listTextChars} characters`);
    expect(section).toContain(`at most ${SAVED_CHATS.listRows}`);
    expect(section).toContain(`cut to ${SAVED_CHATS.titleChars} characters`);
  });

  it('has no em dash and no en dash, and the README has none either', () => {
    expect(section).not.toMatch(/[\u2013\u2014]/);
    expect(readme).not.toMatch(/[\u2013\u2014]/);
  });
});

describe('the README outside that section', () => {
  it('lists aiChatModel in the configuration table, with its default', () => {
    expect(readme).toMatch(/^\| `aiChatModel` \| `claude-sonnet-5-5` \|/m);
  });

  it('names the Ask tab among the admin page\'s tabs, and says Reset demo activity deletes the saved chats', () => {
    expect(readme).toContain('It has up to four tabs');
    expect(readme).toContain("every admin's saved Ask chats");
  });
});

describe('the CHANGELOG', () => {
  it('has an entry for the Ask tab, with its permission, its setting and its routes', () => {
    expect(changelog).toContain('**The Ask tab: a chat for staff on the Maison page.**');
    expect(changelog).toContain(ACTION.assistantUse);
    expect(changelog).toContain('`AI_CHAT_MODEL`');
    for (const route of ['GET /maison/assistant/status', 'POST /maison/assistant/chat']) expect(changelog, route).toContain(route);
    expect(changelog).toContain('`plugin::maison.conversation`');
  });

  it('has no em dash and no en dash', () => {
    expect(changelog).not.toMatch(/[\u2013\u2014]/);
  });
});
