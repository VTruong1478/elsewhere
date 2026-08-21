import { test, expect, type Page } from "@playwright/test";

/**
 * Feed pagination: /api/feed pages at FEED_PAGE_SIZE and the feed appends more
 * as the sentinel scrolls into view, ending on the "you're all caught up"
 * divider. /feed is public (middleware PUBLIC_PATHS), so no auth is needed and
 * nothing here writes to the database.
 */

const PAGE_SIZE = 25;
const CARDS = "article[data-place-id]";

/** Grants geolocation so the feed queries rather than sitting on the prompt. */
async function gotoFeed(page: Page) {
  await page.context().grantPermissions(["geolocation"]);
  // Annandale, VA — the app's own fallback centre, so results are guaranteed.
  await page.context().setGeolocation({ latitude: 38.8304, longitude: -77.1941 });
  await page.goto("/feed");
  await page.locator(CARDS).first().waitFor({ timeout: 30_000 });
}

async function scrollFeedToBottom(page: Page) {
  await page.evaluate(() => {
    const card = document.querySelector("article[data-place-id]");
    // Desktop puts the list in an overflow-y-auto column; mobile scrolls a
    // parent. Walk up to whichever ancestor actually scrolls.
    let node: HTMLElement | null = card?.parentElement ?? null;
    while (node) {
      if (node.scrollHeight > node.clientHeight + 4) {
        node.scrollTop = node.scrollHeight;
        return;
      }
      node = node.parentElement;
    }
    window.scrollTo(0, document.body.scrollHeight);
  });
}

test("feed requests a bounded first page", async ({ page }) => {
  const feedRequests: URL[] = [];
  page.on("request", (req) => {
    const url = new URL(req.url());
    if (url.pathname === "/api/feed") feedRequests.push(url);
  });

  await gotoFeed(page);

  expect(feedRequests.length).toBeGreaterThan(0);
  const first = feedRequests[0];
  expect(first.searchParams.get("limit")).toBe(String(PAGE_SIZE));
  expect(first.searchParams.get("offset")).toBe("0");

  await expect
    .poll(async () => page.locator(CARDS).count())
    .toBeLessThanOrEqual(PAGE_SIZE);
});

test("scrolling loads more places and ends on the caught-up divider", async ({
  page,
}) => {
  const offsetsRequested: string[] = [];
  page.on("request", (req) => {
    const url = new URL(req.url());
    if (url.pathname === "/api/feed") {
      offsetsRequested.push(url.searchParams.get("offset") ?? "");
    }
  });

  await gotoFeed(page);

  const caughtUp = page.getByText("You're all caught up", { exact: false });
  let previousCount = await page.locator(CARDS).count();
  const initialCount = previousCount;

  // Bounded loop: a full 25-mile radius is a few hundred places, so ~20 pages
  // is a generous ceiling. Stops as soon as the divider appears.
  let sawGrowth = false;
  for (let i = 0; i < 20; i++) {
    if (await caughtUp.isVisible().catch(() => false)) break;

    await scrollFeedToBottom(page);
    // Either more cards arrive, or the sentinel is gone and the divider shows.
    await expect
      .poll(
        async () =>
          (await page.locator(CARDS).count()) > previousCount ||
          (await caughtUp.count()) > 0,
        { timeout: 20_000 },
      )
      .toBe(true);

    const nextCount = await page.locator(CARDS).count();
    if (nextCount > previousCount) sawGrowth = true;
    previousCount = nextCount;
  }

  expect(sawGrowth, "scrolling should have appended at least one more page")
    .toBe(true);
  expect(previousCount).toBeGreaterThan(initialCount);

  // Paging really went through the API, not just client-side slicing.
  expect(offsetsRequested).toContain("0");
  expect(offsetsRequested).toContain(String(PAGE_SIZE));

  await expect(caughtUp).toBeVisible();

  // The end state is stable: no sentinel left, so no further pages fire.
  await expect(page.getByTestId("feed-sentinel")).toHaveCount(0);
  const settledCount = await page.locator(CARDS).count();
  await scrollFeedToBottom(page);
  await expect.poll(async () => page.locator(CARDS).count()).toBe(settledCount);
});

test("map tab still fetches the feed unpaginated", async ({ page }) => {
  const feedRequests: URL[] = [];
  page.on("request", (req) => {
    const url = new URL(req.url());
    if (url.pathname === "/api/feed") feedRequests.push(url);
  });

  await page.context().grantPermissions(["geolocation"]);
  await page.context().setGeolocation({ latitude: 38.8304, longitude: -77.1941 });
  await page.goto("/map");
  await expect.poll(() => feedRequests.length, { timeout: 30_000 }).toBeGreaterThan(0);

  // The map needs every pin in the radius; a limit here would silently drop
  // markers, so it must keep calling the unpaginated form.
  for (const url of feedRequests) {
    expect(url.searchParams.get("limit")).toBeNull();
  }
});
