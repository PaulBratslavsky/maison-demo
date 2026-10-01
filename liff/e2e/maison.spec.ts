import { expect, test, type Page } from '@playwright/test';

const pad = (n: number) => String(n).padStart(2, '0');
const isoDay = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
/** The next given weekday (0 = Sunday … 6 = Saturday) at least two days away. */
const next = (weekday: number) => {
  const date = new Date();
  const ahead = (weekday - date.getDay() + 7) % 7;
  date.setDate(date.getDate() + (ahead < 2 ? ahead + 7 : ahead));
  return isoDay(date);
};
const SECOND_CUSTOMER = `U${'b'.repeat(32)}`;

const openWeekender = async (page: Page) => {
  await page.goto('/');
  await page.getByTestId('collection-card').filter({ hasText: /Voyage|ヴォヤージュ/ }).click();
  await page.getByTestId('product-card').filter({ hasText: /Weekender|ウィークエンダー/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Weekender|ウィークエンダー/);
};

/** Every request_appointment the page sends to Strapi's /mcp, from now on. */
const appointmentRequests = (page: Page) => {
  const sent: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/mcp' && request.postData()?.includes('"request_appointment"')) sent.push(request.url());
  });
  return sent;
};

test('a customer browses, books a visit and finds it in My visits', async ({ page }) => {
  await openWeekender(page);
  await page.getByRole('button', { name: /Book a visit|来店を予約/ }).click();
  await page.getByLabel(/Boutique|ブティック/).selectOption('ginza');
  await page.getByLabel(/Date|日付/).fill(next(6));
  await page.getByLabel(/Time|時間/).selectOption('14:00');
  await page.getByRole('button', { name: /Send request|リクエストを送る/ }).click();
  await expect(page).toHaveURL(/\/visits\?ref=APT-\d{4}/);
  await expect(page.getByTestId('visit').first()).toContainText(/Awaiting the boutique|ブティックの確認待ち/);
});

test('Osaka is closed on Tuesdays, and the sheet says so before any request', async ({ page }) => {
  const sent = appointmentRequests(page);
  await openWeekender(page);
  await page.getByRole('button', { name: /Book a visit|来店を予約/ }).click();
  await page.getByLabel(/Boutique|ブティック/).selectOption('osaka');
  await page.getByLabel(/Date|日付/).fill(next(2));
  await expect(page.getByText(/Closed on this day|この日は休業日です/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Send request|リクエストを送る/ })).toBeDisabled();
  expect(sent).toEqual([]);
});

test('a cleared date asks for one, and sends no request', async ({ page }) => {
  const sent = appointmentRequests(page);
  await openWeekender(page);
  await page.getByRole('button', { name: /Book a visit|来店を予約/ }).click();
  await page.getByLabel(/Date|日付/).fill('');
  await expect(page.getByText(/Please choose a date|日付をお選びください/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Send request|リクエストを送る/ })).toBeDisabled();
  expect(sent).toEqual([]);
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

test("a second customer doesn't see the first customer's visits", async ({ page }) => {
  await page.goto(`/visits?demoUser=${SECOND_CUSTOMER}`);
  await expect(page.getByText(/No visits yet|ご来店予約はまだありません/)).toBeVisible();
  await expect(page.getByTestId('visit')).toHaveCount(0);
});

// LINE's MINI App safe area (Task 3). Phone emulation makes the pointer coarse, so there's no stage frame.
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
