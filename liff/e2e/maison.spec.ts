import { expect, test, type Page } from '@playwright/test';

import { nextWeekday } from './support';

const SECOND_CUSTOMER = `U${'b'.repeat(32)}`;
const JAPANESE_CUSTOMER = `U${'c'.repeat(32)}`;

/** Today's date on Tokyo's calendar, as the app counts it (YYYY-MM-DD: en-CA writes dates that way). */
const tokyoToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date());

const openWeekender = async (page: Page) => {
  await page.goto('/');
  await page.getByTestId('collection-card').filter({ hasText: /Voyage|ヴォヤージュ/ }).click();
  await page.getByTestId('product-card').filter({ hasText: /Weekender|ウィークエンダー/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Weekender|ウィークエンダー/);
};

/** Books the Weekender at Ginza on the next Saturday at 14:00, and returns the new visit's reference (the URL has it). */
const bookWeekender = async (page: Page) => {
  await openWeekender(page);
  await page.getByRole('button', { name: /Book a visit|来店を予約/ }).click();
  await page.getByLabel(/Boutique|ブティック/).selectOption('ginza');
  await page.getByLabel(/Date|日付/).fill(nextWeekday(6));
  await page.getByLabel(/Time|時間/).selectOption('14:00');
  await page.getByRole('button', { name: /Send request|リクエストを送る/ }).click();
  await expect(page).toHaveURL(/\/visits\?ref=APT-\d{4}/);
  const reference = new URL(page.url()).searchParams.get('ref');
  expect(reference).toMatch(/^APT-\d{4}$/);
  return reference as string;
};

/** Opens the booking sheet on the Weekender, and waits for the answer to its first availability check: the Time select. */
const openSheet = async (page: Page) => {
  await openWeekender(page);
  await page.getByRole('button', { name: /Book a visit|来店を予約/ }).click();
  await expect(page.getByLabel(/Time|時間/)).toBeVisible();
};

type ToolCall = { name: string; arguments: Record<string, unknown> };

/** Every MCP tool the page calls on Strapi's /mcp, in order, from now on: its name, and the arguments it was sent. */
const toolCalls = (page: Page) => {
  const calls: ToolCall[] = [];
  page.on('request', (request) => {
    if (request.method() !== 'POST' || new URL(request.url()).pathname !== '/mcp') return;
    let body: unknown;
    try {
      body = request.postDataJSON();
    } catch {
      return; // not JSON, so not a tool call
    }
    for (const message of Array.isArray(body) ? body : [body]) {
      const { method, params } = (message ?? {}) as { method?: string; params?: { name?: string; arguments?: Record<string, unknown> } };
      if (method === 'tools/call' && typeof params?.name === 'string') calls.push({ name: params.name, arguments: params.arguments ?? {} });
    }
  });
  return calls;
};
const namesOf = (calls: ToolCall[]) => calls.map((call) => call.name);
/** The arguments of each call to the tool `name`, in order. */
const argumentsOf = (calls: ToolCall[], name: string) => calls.filter((call) => call.name === name).map((call) => call.arguments);

/**
 * Submits the booking form without its Send button, which is disabled: the way Enter in a field or a script could. The
 * browser's own validation is switched off too (a date before the input's `min` would stop the submit), so it's the sheet's
 * own guard that gets tested. Resolves to whether the form's submit event fired: without a submit, "nothing was sent" proves
 * nothing.
 */
const forceSubmit = (page: Page) =>
  page
    .getByRole('dialog')
    .locator('form')
    .evaluate(
      (form: HTMLFormElement) =>
        new Promise<boolean>((resolve) => {
          form.noValidate = true;
          form.addEventListener('submit', () => resolve(true), { once: true });
          form.requestSubmit(); // fires the submit event synchronously, or not at all
          resolve(false);
        })
    );

/** Lets whatever the page was about to send go out first, so that checking it sent nothing is fair. */
const settle = (page: Page) => page.waitForTimeout(500);

/** No request_appointment leaves the sheet: Send is disabled, and a submit that gets past the button is refused too. */
const expectNothingSent = async (page: Page, calls: ToolCall[]) => {
  await expect(page.getByRole('button', { name: /Send request|リクエストを送る/ })).toBeDisabled();
  expect(await forceSubmit(page), 'the form was submitted').toBe(true);
  await settle(page);
  expect(namesOf(calls)).not.toContain('request_appointment');
};

test('a customer browses, books a visit and finds it in My visits', async ({ page }) => {
  const calls = toolCalls(page);
  const reference = await bookWeekender(page);
  // The sheet sends the customer's language (English here, the app's default), so the answer names the boutique and
  // products in it.
  expect(argumentsOf(calls, 'request_appointment').map((args) => args.locale)).toEqual(['en']);
  // The visit just booked, found by its reference: the list isn't assumed to be in any order.
  const visit = page.getByTestId('visit').filter({ hasText: reference });
  await expect(visit).toContainText(/Ginza|銀座/);
  await expect(visit).toContainText(/Awaiting the boutique|ブティックの確認待ち/);
});

test("the booking sheet sends the customer's language: a request made in Japanese says ja", async ({ page }) => {
  // A customer of their own, so this visit isn't one of the default customer's three open requests. The switch's choice
  // is remembered by the browser, so the pages that follow start in Japanese.
  await page.goto(`/?demoUser=${JAPANESE_CUSTOMER}`);
  await page.getByRole('group', { name: /Language|言語/ }).getByRole('button', { name: 'JA' }).click();
  const calls = toolCalls(page);
  await bookWeekender(page);
  expect(argumentsOf(calls, 'request_appointment').map((args) => args.locale)).toEqual(['ja']);
});

test('Osaka is closed on Tuesdays, and the sheet says so before any request', async ({ page }) => {
  const calls = toolCalls(page);
  await openSheet(page);
  await page.getByLabel(/Boutique|ブティック/).selectOption('osaka');
  await page.getByLabel(/Date|日付/).fill(nextWeekday(2));
  await expect(page.getByText(/Closed on this day|この日は休業日です/)).toBeVisible();
  await expectNothingSent(page, calls);
});

test('a cleared date asks for one, and sends no request', async ({ page }) => {
  const calls = toolCalls(page);
  await openSheet(page);
  expect(namesOf(calls), 'the sheet checked its first date').toContain('find_boutiques');
  const before = [...calls];
  await page.getByLabel(/Date|日付/).fill('');
  await expect(page.getByText(/^(Please choose a date\.|日付をお選びください。)$/)).toBeVisible();
  await expectNothingSent(page, calls);
  expect(calls, 'no tool is called for a date that is not there').toEqual(before);
});

test("today's date asks for a later one, and sends no request", async ({ page }) => {
  const calls = toolCalls(page);
  await openSheet(page);
  expect(namesOf(calls), 'the sheet checked its first date').toContain('find_boutiques');
  const before = [...calls];
  await page.getByLabel(/Date|日付/).fill(tokyoToday());
  await expect(page.getByText(/^(Please choose a date from tomorrow on\.|明日以降の日付をお選びください。)$/)).toBeVisible();
  await expectNothingSent(page, calls);
  expect(calls, 'no tool is called for a date that is too soon').toEqual(before);
});

test('the agent view shows the MCP tools behind each screen', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('switch', { name: /Agent view|エージェントビュー/ }).click();
  await expect(page.getByTestId('agent-call').first()).toContainText('browse_collections');
  await page.getByTestId('collection-card').first().click();
  await expect(page.getByTestId('agent-call').filter({ hasText: 'search_products' })).toBeVisible();
});

test('an unknown product says so, and leads back to the start', async ({ page }) => {
  await page.goto('/products/no-such-piece');
  await expect(page.getByText(/We couldn't find that|お探しのものは見つかりませんでした/)).toBeVisible();
  await expect(page.getByRole('link', { name: /Back to the start|トップへ戻る/ })).toBeVisible();
});

test("a second customer doesn't see the first customer's visits", async ({ context }) => {
  // One browser, two customers. The first tab is the default demo customer, who books a visit here; the second tab
  // signs in as another customer with ?demoUser=.
  const first = await context.newPage();
  const reference = await bookWeekender(first);
  const firstVisit = first.getByTestId('visit').filter({ hasText: reference });
  await expect(firstVisit).toBeVisible();

  const second = await context.newPage();
  await second.goto(`/visits?demoUser=${SECOND_CUSTOMER}`);
  await expect(second.getByText(/No visits yet|ご来店予約はまだありません/)).toBeVisible();
  await expect(second.getByTestId('visit')).toHaveCount(0);

  // Signing the second customer in changed nothing for the first: looking again, they still have their visit.
  await first.reload();
  await expect(firstVisit).toBeVisible();
});

// LINE's MINI App safe area. On a phone the app fills the screen, without the phone-sized frame it draws on a laptop:
// emulating a phone makes the pointer coarse, which is what turns that frame off.
test.describe('a phone in portrait', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("keeps LINE's safe area: 34 px at the bottom", async ({ page }) => {
    await page.goto('/');
    const area = page.getByTestId('app-area');
    await expect(area).toHaveCSS('padding-bottom', '34px');
    await expect(area).toHaveCSS('padding-left', '0px');
  });
});

test.describe('a phone in landscape', () => {
  test.use({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });

  test("fills the screen inside LINE's safe area: 44 px at the sides, 21 px at the bottom", async ({ page }) => {
    await page.goto('/');
    const area = page.getByTestId('app-area');
    await expect(area).toHaveCSS('padding-left', '44px');
    await expect(area).toHaveCSS('padding-right', '44px');
    await expect(area).toHaveCSS('padding-bottom', '21px');
    expect((await area.boundingBox())?.width).toBe(844);
  });
});
