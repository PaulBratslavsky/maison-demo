import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { STARTERS } from '../../admin/src/assistant';
import { CHAT_WIDTH, HISTORY_WIDTH, MAX_DRAWER_WIDTH, drawerWidthOf } from '../../admin/src/components/assistant/drawerWidth';
import { PAGE_SUBTITLE, selectTab } from '../../admin/src/tabs';
import { READ_TOOL_NAMES, TOOL_LABELS } from '../../server/src/assistant/tools';
import { ACTION, ASSISTANT_LIMITS, SAVED_CHATS } from '../../server/src/constants';
import routes from '../../server/src/routes';

/**
 * The README's section on the assistant drawer says what the code does. These hold the facts that are written twice, the tools, the routes, the
 * limits, the widths, the five quick questions and the names of the settings, to the code that has them, so a change to one that forgets the other
 * fails here.
 */
const readme = readFileSync(new URL('../../README.md', import.meta.url), 'utf8');
const changelog = readFileSync(new URL('../../CHANGELOG.md', import.meta.url), 'utf8');
const start = readme.indexOf('## The assistant drawer');
const section = readme.slice(start, readme.indexOf('## The Homepage widgets'));
/** The part of the section that is about how the drawer looks and works, and not about the server. */
const screen = section.slice(section.indexOf('### The screen'), section.indexOf('### Saved chats'));

describe("the README's section on the assistant drawer", () => {
  it('is there, between the admin page and the Homepage widgets', () => {
    expect(start).toBeGreaterThan(readme.indexOf('## The admin page'));
    expect(section.length).toBeGreaterThan(2000);
    for (const heading of ['### How it is mounted', '### The screen', '### Saved chats', '### Tools', '### What the model sees', '### Limits and errors', '### Routes', '### Checking it in the browser']) {
      expect(section, heading).toContain(heading);
    }
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

  it('says an admin with the assistant permission and none that shows Maison\'s menu link has no drawer', () => {
    expect(section).toContain('has no menu link, and so no drawer');
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
    expect(section).not.toMatch(/[–—]/);
    expect(readme).not.toMatch(/[–—]/);
  });
});

describe("the README's description of the drawer", () => {
  it('gives the widths as the code has them: the chat, Expand, the list of saved chats, what the list adds to the drawer, and the limit', () => {
    expect(screen).toContain(`${CHAT_WIDTH.narrow}px`);
    expect(screen).toContain(`${CHAT_WIDTH.wide}px`);
    expect(screen).toContain(`${HISTORY_WIDTH}px`);
    expect(screen).toContain(`${drawerWidthOf({ expanded: false, historyOpen: true })}px`);
    expect(screen).toContain(`${drawerWidthOf({ expanded: true, historyOpen: true })}px`);
    expect(screen).toContain(MAX_DRAWER_WIDTH);
  });

  it('has none of the widths of the first build, 480px and 760px, and says the list is never drawn over the messages', () => {
    expect(section).not.toContain('480px');
    expect(section).not.toContain('760px');
    expect(section).not.toMatch(/History[^.]*over the messages/);
    expect(screen).toContain('never drawn over the messages');
  });

  it('says what Expand and History each do: Expand makes the chat wider and opens no list, and History makes the drawer wider and takes nothing from the chat', () => {
    expect(screen).toMatch(/Expand the assistant[^.]*widens the chat/);
    expect(screen).toMatch(/Expand[^.]*never opens the list/);
    expect(screen).toMatch(/History[^.]*wider[^.]*chat keeps its width/);
  });

  it('names the five quick questions as the code has them, in order, and says they stay for the whole chat', () => {
    let at = -1;
    for (const question of STARTERS) {
      const found = screen.indexOf(`"${question}"`);
      expect(found, question).toBeGreaterThan(at);
      at = found;
    }
    expect(screen).toMatch(/quick questions/i);
    expect(screen).toMatch(/for the whole chat/);
    expect(section).not.toMatch(/three suggestions/);
  });

  it('says what the tables do: header cells on one line, body cells wrapping between words, 7rem to 22rem, and a sideways scroll inside the bubble', () => {
    expect(screen).toMatch(/header cells stay on one line/i);
    expect(screen).toMatch(/between words/);
    expect(screen).toContain('7rem');
    expect(screen).toContain('22rem');
    expect(screen).toMatch(/scrolls sideways inside (its|the) bubble/);
  });

  // In a real browser a table that is made to fit the bubble breaks `2026-10-05` after its second hyphen, so the README says the table is never made to fit,
  // and that the admin's rem is 10px, which is what the 7rem and the 22rem come to there.
  it('says a table is never squeezed to fit the bubble, and what 7rem and 22rem come to in the admin', () => {
    expect(screen).toMatch(/never squeezed to fit the bubble/);
    expect(screen).toContain('70px to 220px');
  });

  it('says only the message list scrolls up and down, and that opening the drawer never starts a chat', () => {
    expect(screen).toMatch(/Only the message list scrolls up and down/);
    expect(section).toMatch(/never starts a chat|Opening the drawer never starts a chat/);
  });

  it('names the files of Strapi that the mount depends on, and says what the cost of it is', () => {
    expect(section).toContain('MaisonMenuIcon');
    expect(section).toContain('assistantHost.tsx');
    expect(section).toContain('menuIconOwner.ts');
    expect(section).toContain('components/MainNav/MainNavLinks.mjs');
    expect(section).toContain('components/LeftMenu.mjs');
    expect(section).toMatch(/A Strapi upgrade can need a fix here/);
  });

  it('says the round button needs a window 1080px wide, as Strapi draws the menu link only in its mobile menu below that', () => {
    expect(section).toContain('1080px');
  });
});

describe("the README's checklist for the browser", () => {
  // The last part of the section, up to the next section of the README.
  const checklist = section.slice(section.indexOf('### Checking it in the browser'));

  it('covers the drawer on a Content Manager page and on the Maison page, and Reply on LINE above the drawer', () => {
    expect(checklist).toContain('Content Manager');
    expect(checklist).toContain('Maison page');
    expect(checklist).toContain('Reply on LINE');
  });

  it('covers that the page stays usable, Escape and the focus, Expand and History, the quick questions, the tables and the scrolling', () => {
    for (const subject of ['clickable', 'Escape', 'focus', 'Expand', 'History', 'quick questions', 'table', 'scroll']) expect(checklist.toLowerCase(), subject).toContain(subject.toLowerCase());
  });

  it('covers that opening the drawer again shows the same chat, light and dark, and the compact header', () => {
    expect(checklist).toMatch(/same chat/);
    expect(checklist).toMatch(/dark/);
    expect(checklist).toMatch(/compact header/);
  });
});

describe('the README outside that section', () => {
  it('lists aiChatModel in the configuration table, with its default', () => {
    expect(readme).toMatch(/^\| `aiChatModel` \| `claude-sonnet-5-5` \|/m);
  });

  it('says the admin page has three tabs and the assistant is not one, and that Reset demo activity deletes the saved chats', () => {
    expect(readme).toContain('It has up to three tabs');
    expect(readme).toContain("every admin's saved assistant chats");
    expect(readme).not.toContain('four tabs');
    expect(readme).not.toContain("saved Ask chats");
  });

  it('says an address with ?tab=ask opens the first tab, as the page does', () => {
    expect(selectTab(['requests', 'questions', 'inquiries'], 'ask')).toBe('requests');
    expect(readme).toContain('`?tab=ask`');
    expect(readme).toContain('opens the first tab');
  });

  it('describes the compact header of the Maison page: the title and the subtitle on one row, in the page the README describes', () => {
    expect(readme).toContain('The title and its subtitle share one row at the top');
    expect(PAGE_SUBTITLE.length).toBeGreaterThan(0);
  });
});

describe('the CHANGELOG', () => {
  it('has an entry for the assistant, with its permission, its setting and its routes', () => {
    expect(changelog).toContain('**The assistant: a chat for staff, in a drawer on every admin page.**');
    expect(changelog).toContain(ACTION.assistantUse);
    expect(changelog).toContain('`AI_CHAT_MODEL`');
    for (const route of ['GET /maison/assistant/status', 'POST /maison/assistant/chat']) expect(changelog, route).toContain(route);
    expect(changelog).toContain('`plugin::maison.conversation`');
  });

  it('gives the widths of the drawer and names the five quick questions, as the code has them', () => {
    expect(changelog).toContain(`${CHAT_WIDTH.narrow}px`);
    expect(changelog).toContain(`${CHAT_WIDTH.wide}px`);
    expect(changelog).toContain(`${HISTORY_WIDTH}px`);
    expect(changelog).toContain(`${drawerWidthOf({ expanded: false, historyOpen: true })}px`);
    expect(changelog).toContain(`${drawerWidthOf({ expanded: true, historyOpen: true })}px`);
    for (const question of STARTERS) expect(changelog, question).toContain(`"${question}"`);
    expect(changelog).not.toContain('480px');
    expect(changelog).not.toContain('760px');
  });

  it('has no em dash and no en dash', () => {
    expect(changelog).not.toMatch(/[–—]/);
  });
});
