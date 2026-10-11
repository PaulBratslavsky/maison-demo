import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { STARTERS, askMessage } from '../../admin/src/assistant';
import { CHAT_WIDTH, HISTORY_WIDTH, MAX_DRAWER_WIDTH, drawerWidthOf } from '../../admin/src/components/assistant/drawerWidth';
import { DRAFT_LIFETIME_MS } from '../../admin/src/draftStore';
import { SEND_MAY_HAVE_STOPPED } from '../../admin/src/sendFailure';
import { DRAFTED_LINE, NOT_FOUND_NOTICE, answerDraftOutcome, draftPath, replyDraftOutcome } from '../../admin/src/drafts';
import { PAGE_SUBTITLE, selectTab } from '../../admin/src/tabs';
import { DRAFT_TOOL_NAMES } from '../../server/src/assistant/tools';
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
    for (const heading of ['### How it is mounted', '### The screen', '### Saved chats', '### Ask about this', '### Drafts and Use this draft', '### Tools', '### What the model sees', '### Limits and errors', '### Routes', '### Checking it in the browser']) {
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

  it('lists the two read routes of Use this draft, as the server serves them, with the permissions of the lists', () => {
    const served = routes.admin.routes.filter((route) => route.handler === 'inquiries.findOne' || route.handler === 'questions.findOne');
    expect(served.map((route) => `${route.method} ${route.path}`).sort()).toEqual(['GET /inquiries/:documentId', 'GET /questions/:reference']);
    for (const { method, path } of served) expect(section, `${method} ${path}`).toContain(`\`${method} ${path}\``);
    expect(section).toContain('`GET /inquiries/:documentId`, for "Review customer inquiries"');
    expect(section).toContain('`GET /questions/:reference`, for "Read customer questions"');
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
    // The README says 90vw. The code holds the width 1px under that, so the border is inside the 90vw.
    expect(MAX_DRAWER_WIDTH).toBe('calc(90vw - 1px)');
    expect(screen).toContain('90vw');
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

describe("the README's account of saved chats and the routes", () => {
  it('says who can read a saved chat: each admin sees their own, and a Super Admin can read all through the Content Manager API', () => {
    for (const text of [readme, changelog]) {
      expect(text).not.toContain('only they can read them');
      expect(text).toContain('each admin sees only their own chats');
      expect(text).toContain("Super Admin can read every saved chat through Strapi's Content Manager API");
    }
  });

  it('says the History list shows the newest chats, as many as the code lists', () => {
    expect(SAVED_CHATS.listRows).toBe(100);
    expect(section).toContain('It shows the newest 100 chats.');
  });

  it('says a PUT with an empty body, or a title that is not text or has no words, answers 400', () => {
    expect(section).toContain('So does a `PUT` with an empty body, and a `PUT` whose `title` is not text or has no words.');
  });

  it('puts the check of a role with no tools, Tools (0), in the checklist for the browser', () => {
    expect(section).toContain('**Tools (0)**');
    expect(section).toContain('"Use the Maison assistant" and "Load and reset demo data" and nothing else');
  });

  it('says where the chats are stored, and keeps the tests out of the routes section', () => {
    expect(section).toContain('**Where it is stored:**');
    const routes = section.slice(section.indexOf('### Routes'), section.indexOf('### Checking it in the browser'));
    expect(routes).not.toContain('tests never reach');
  });

  it('names each TanStack AI package with its version', () => {
    for (const pin of ['`@tanstack/ai` 0.52.3', '`@tanstack/ai-anthropic` 0.18.3', '`@tanstack/ai-react` 0.22.4', '`@tanstack/ai-client` 0.29.2']) expect(section, pin).toContain(pin);
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

describe("the README's account of Ask about this, drafts and Use this draft", () => {
  const ask = section.slice(section.indexOf('### Ask about this'), section.indexOf('### Drafts and Use this draft'));
  const drafts = section.slice(section.indexOf('### Drafts and Use this draft'), section.indexOf('### Tools'));
  const checklist = section.slice(section.indexOf('### Checking it in the browser'));

  it('gives the three messages Ask about this sends, as the code writes them', () => {
    for (const item of [
      { kind: 'request', reference: 'APT-4821' },
      { kind: 'question', reference: 'Q-4821' },
      { kind: 'inquiry', documentId: '<documentId>' },
    ] as const) {
      expect(ask, askMessage(item)).toContain(`"${askMessage(item)}"`);
    }
  });

  it('says the button waits while an answer comes, leaves the text box alone, and needs no permission of the row\'s own', () => {
    expect(ask).toMatch(/waits while an answer comes|switched off then/);
    expect(ask).toContain('It leaves the text box alone.');
    expect(ask).toContain('It needs no permission of the row\'s own');
  });

  it('names both draft tools with the two permissions of each pair, and the labels staff read', () => {
    expect([...DRAFT_TOOL_NAMES]).toEqual(['draft_reply', 'draft_answer']);
    for (const name of DRAFT_TOOL_NAMES) expect(drafts, name).toContain(`\`${name}\``);
    expect(drafts).toContain('"Review customer inquiries" and "Reply to customer inquiries on LINE"');
    expect(drafts).toContain('"Read customer questions" and "Answer customer questions on LINE"');
    expect(section).toContain('"Draft a LINE reply" and "Draft an answer"');
  });

  it('gives the five notices of an item that changed, the line over a drafted box and the address Use this draft goes to, as the code has them', () => {
    const notices = [
      (replyDraftOutcome({ status: 'replied', question: null } as never) as { notice: string }).notice,
      (replyDraftOutcome({ status: 'closed', question: null } as never) as { notice: string }).notice,
      (replyDraftOutcome({ status: 'open', question: { reference: 'Q-4821', status: 'open' } } as never) as { notice: string }).notice,
      (answerDraftOutcome({ status: 'answered', reference: 'Q-4821' } as never) as { notice: string }).notice,
      NOT_FOUND_NOTICE,
    ];
    for (const notice of notices) expect(drafts, notice).toContain(`"${notice}"`);
    expect(drafts).toContain(`"${DRAFTED_LINE}"`);
    const reply = draftPath({ kind: 'reply', documentId: 'inq4abc', text: 'Thank you.' });
    const answer = draftPath({ kind: 'answer', reference: 'Q-4821', text: 'Yes.' });
    expect(drafts).toContain(`\`${reply}\``);
    expect(answer.endsWith('?tab=questions')).toBe(true);
    expect(drafts).toContain('`?tab=questions`');
  });

  it('says what is sent when: nothing until a person presses Send on LINE, and the text is never in the address', () => {
    expect(drafts).toContain('Nothing is sent until a person presses **Send on LINE**');
    expect(drafts).toMatch(/never in the address/);
  });

  it('puts Ask about this, the draft card, Use this draft, the "Drafted by" line, the changed items and the roles in the checklist for the browser', () => {
    for (const subject of ['Ask about this', 'It waits', 'Draft a reply', 'Use this draft', 'Drafted by the Maison assistant', 'Reset demo activity', 'Drafts and the roles', 'A reopened chat', 'Stop on a draft']) {
      expect(checklist, subject).toContain(subject);
    }
  });

  it('gives how long a draft that no list takes waits, as the code has it', () => {
    expect(drafts).toContain(`dropped after ${DRAFT_LIFETIME_MS / 1000} seconds`);
  });

  it('says Use this draft replaces the history entry on the Maison page and adds one from another page', () => {
    expect(drafts).toContain('adds a history entry, so Back returns there');
    expect(drafts).toContain('replaces the current one, as a click on a tab does');
  });

  it('says what staff read when leaving the tab cut off a send, as the code has it', () => {
    expect(readme).toContain(`"${SEND_MAY_HAVE_STOPPED}"`);
    expect(changelog).toContain(`"${SEND_MAY_HAVE_STOPPED}"`);
  });

  it('names each Ask about this button\'s accessible name', () => {
    expect(ask).toContain('"Ask about this: request APT-4821"');
    expect(ask).toContain('"Ask about this: question Q-4821"');
  });

  it('keeps the checklist off the rows that are the presenter\'s own: a send there reaches a phone', () => {
    expect(checklist).toContain('Leave the rows that carry the **Your LINE** label alone');
  });
});

describe('the CHANGELOG entry for Ask about this and the drafts', () => {
  it('names Ask about this, the two draft tools, Use this draft, the two read routes and the dialogs\' initialText', () => {
    for (const text of ['**Ask about this**', '`draft_reply` and `draft_answer`', '**Use this draft**', 'GET /maison/inquiries/:documentId', 'GET /maison/questions/:reference', '`initialText`']) {
      expect(changelog, text).toContain(text);
    }
  });

  it('gives the messages of Ask about this and the line over a drafted box', () => {
    expect(changelog).toContain('"Tell me about request APT-4821."');
    expect(changelog).toContain(`"${DRAFTED_LINE}"`);
  });
});
