import { test, expect, type Page } from "@playwright/test";
import { requireDevAuth } from "./guards";

requireDevAuth();

/**
 * The follower count came from a server-rendered prop, so it stayed stale
 * after follow/unfollow until a full reload. It is now mirrored in local state
 * and adjusted optimistically.
 */
async function followerCount(page: Page): Promise<number> {
  const tile = page
    .locator("button:visible")
    .filter({ hasText: /followers/i })
    .first();
  const text = await tile.innerText();
  return Number(text.match(/(\d+)/)?.[1] ?? "-1");
}

async function targetUser(api: import("@playwright/test").APIRequestContext) {
  const res = await api.get("/api/social/suggestions");
  if (!res.ok()) return null;
  return ((await res.json())?.data?.[0]?.id as string) ?? null;
}

test("follower count updates on follow and unfollow without a reload", async ({
  page,
  request,
}) => {
  const target = await targetUser(request);
  test.skip(!target, "no follow suggestions available");

  // Known starting state: not following.
  await request.delete(`/api/social/follow/${target}`).catch(() => {});

  await page.goto(`/profile/${target}`);
  await expect(
    page.locator("button:visible").filter({ hasText: /followers/i }).first(),
  ).toBeVisible({ timeout: 25_000 });

  const before = await followerCount(page);
  expect(before).toBeGreaterThanOrEqual(0);

  const followBtn = page
    .locator("button:visible")
    .filter({ hasText: /^follow$/i })
    .first();
  await expect(followBtn).toBeVisible({ timeout: 15_000 });

  // FOLLOW — count must rise with no navigation or reload.
  await followBtn.click();
  await expect
    .poll(() => followerCount(page), { timeout: 15_000 })
    .toBe(before + 1);

  await expect(
    page.locator("button:visible").filter({ hasText: /unfollow|following/i }).first(),
  ).toBeVisible({ timeout: 10_000 });
  console.log(`[followers] follow: ${before} -> ${before + 1} (no reload)`);

  // UNFOLLOW — count must fall back.
  await page
    .locator("button:visible")
    .filter({ hasText: /unfollow|following/i })
    .first()
    .click();
  await expect.poll(() => followerCount(page), { timeout: 15_000 }).toBe(before);
  console.log(`[followers] unfollow: ${before + 1} -> ${before} (no reload)`);

  // And the server agrees after a genuine reload.
  await page.reload();
  await expect(
    page.locator("button:visible").filter({ hasText: /followers/i }).first(),
  ).toBeVisible({ timeout: 25_000 });
  const afterReload = await followerCount(page);
  console.log(`[followers] after reload: ${afterReload}`);
  expect(afterReload, "optimistic value must match the server").toBe(before);
});

test("a failed follow rolls the count back", async ({ page, request }) => {
  const target = await targetUser(request);
  test.skip(!target, "no follow suggestions available");
  await request.delete(`/api/social/follow/${target}`).catch(() => {});

  await page.goto(`/profile/${target}`);
  await expect(
    page.locator("button:visible").filter({ hasText: /followers/i }).first(),
  ).toBeVisible({ timeout: 25_000 });
  const before = await followerCount(page);

  await page.route("**/api/social/follow/**", (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "Follow failed upstream" }),
    }),
  );

  await page.locator("button:visible").filter({ hasText: /^follow$/i }).first().click();

  await expect(
    page.getByRole("status").filter({ hasText: /follow failed upstream/i }),
  ).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => followerCount(page), { timeout: 15_000 }).toBe(before);
  console.log(`[followers] failed follow rolled back to ${before}`);
});
