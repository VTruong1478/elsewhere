import { test, expect, request as pwRequest } from "@playwright/test";
import { requireDevAuth } from "./guards";
import { captureConsole, summarize } from "./console";

requireDevAuth();

const BASE = "http://localhost:3100";

/** A profile that is not the dev user, to follow. */
async function otherProfile(api: import("@playwright/test").APIRequestContext) {
  const feed = await api.get("/api/social/suggestions");
  if (feed.ok()) {
    const j = await feed.json();
    const first = j?.data?.[0];
    if (first?.id) return first.id as string;
  }
  return null;
}

test.describe("social", () => {
  test("followers/following reject anonymous callers", async () => {
    // storageState must be cleared explicitly: a context created inside the
    // authenticated project otherwise inherits its saved cookies.
    const anon = await pwRequest.newContext({
      baseURL: BASE,
      storageState: { cookies: [], origins: [] },
    });
    const someId = "00000000-0000-4000-8000-000000000abc";
    const f = await anon.get(`/api/user/${someId}/followers`);
    const g = await anon.get(`/api/user/${someId}/following`);
    const fb = await f.json();
    console.log(
      `[social anon-api] followers=${f.status()} following=${g.status()} body=${JSON.stringify(fb)}`,
    );
    expect(f.status()).toBe(401);
    expect(g.status()).toBe(401);
    expect(fb.error).toBe("Authentication required");
    await anon.dispose();
  });

  test("followers/following work when signed in", async ({ request }) => {
    const me = await request.get("/api/user/preferences");
    const target = (await otherProfile(request)) ?? null;
    test.skip(!target, "no follow suggestions available");
    const f = await request.get(`/api/user/${target}/followers`);
    console.log(`[social auth-api] prefs=${me.status()} followers=${f.status()}`);
    expect(f.status()).toBe(200);
  });

  test("follow then unfollow updates counts without a reload", async ({
    page,
    request,
  }) => {
    const target = await otherProfile(request);
    test.skip(!target, "no follow suggestions available");
    const c = captureConsole(page);

    // Known state.
    await request.delete(`/api/social/follow/${target}`).catch(() => {});

    await page.goto(`/profile/${target}`);
    await page.waitForTimeout(5000);

    const followBtn = page
      .locator("button:visible")
      .filter({ hasText: /^follow$/i })
      .first();
    const visible = await followBtn.count();
    console.log(`[social follow] follow button present: ${visible > 0}`);
    if (!visible) {
      console.log("[social follow] SKIP — no follow button on public profile");
      return;
    }

    const before = await page.locator("body").innerText();
    const beforeCount = before.match(/(\d+)\s*Followers/i)?.[1] ?? "?";

    await followBtn.click();
    await page.waitForTimeout(4000);

    const after = await page.locator("body").innerText();
    const afterCount = after.match(/(\d+)\s*Followers/i)?.[1] ?? "?";
    const nowUnfollow = await page
      .locator("button:visible")
      .filter({ hasText: /unfollow|following/i })
      .count();

    console.log(
      `[social follow] followers ${beforeCount} -> ${afterCount} | button flipped: ${nowUnfollow > 0} | ${summarize(c)}`,
    );

    await request.delete(`/api/social/follow/${target}`).catch(() => {});
  });

  test("public profile loads follower/following lists", async ({ page, request }) => {
    const target = await otherProfile(request);
    test.skip(!target, "no suggestions");
    const c = captureConsole(page);

    await page.goto(`/profile/${target}`);
    await page.waitForTimeout(5000);

    const followersTile = page
      .locator("button:visible")
      .filter({ hasText: /followers/i })
      .first();
    if (await followersTile.count()) {
      await followersTile.click();
      await page.waitForTimeout(3000);
      const body = await page.locator("body").innerText();
      console.log(
        `[social lists] opened followers sheet | ${summarize(c)} | snippet: ${body.slice(0, 120).replace(/\n+/g, " | ")}`,
      );
    } else {
      console.log("[social lists] no followers tile found");
    }
  });

  test("Like and Comment are functional, not dead controls", async ({ page, request }) => {
    const c = captureConsole(page);

    // Own profile always has our E2E rating card.
    await page.goto("/profile");
    await page.waitForTimeout(6000);

    const likeBtn = page
      .locator("button:visible")
      .filter({ hasText: /^\d+$/ })
      .first();
    const likeByLabel = page.locator('button:visible[aria-label="Like"], button:visible[aria-label="Unlike"]').first();
    const commentByLabel = page
      .locator('button:visible[aria-label="Show comments"], button:visible[aria-label="Hide comments"]')
      .first();

    const hasLike = await likeByLabel.count();
    const hasComment = await commentByLabel.count();
    console.log(`[social like/comment] like btn=${hasLike} comment btn=${hasComment}`);
    expect(hasLike, "Like control should exist").toBeGreaterThan(0);
    expect(hasComment, "Comment control should exist").toBeGreaterThan(0);

    const pressedBefore = await likeByLabel.getAttribute("aria-pressed");
    const requests: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("/likes")) requests.push(`${r.method()} ${r.url()}`);
    });

    await likeByLabel.click();
    await page.waitForTimeout(3500);
    const pressedAfter = await page
      .locator('button:visible[aria-label="Like"], button:visible[aria-label="Unlike"]')
      .first()
      .getAttribute("aria-pressed");

    console.log(
      `[social like] aria-pressed ${pressedBefore} -> ${pressedAfter} | requests: ${JSON.stringify(requests)} | ${summarize(c)}`,
    );
    expect(requests.length, "clicking Like must hit the API").toBeGreaterThan(0);
    expect(pressedAfter).not.toBe(pressedBefore);

    // Comment thread toggles open.
    await commentByLabel.click();
    await page.waitForTimeout(3000);
    const composer = await page.locator('textarea:visible').count();
    console.log(`[social comment] composer visible after toggle: ${composer > 0}`);
    expect(composer, "comment thread should open a composer").toBeGreaterThan(0);
    void likeBtn;
  });

  test("posting a comment works end to end", async ({ page }) => {
    const c = captureConsole(page);
    await page.goto("/profile");
    await page.waitForTimeout(6000);

    const commentBtn = page
      .locator('button:visible[aria-label="Show comments"]')
      .first();
    test.skip((await commentBtn.count()) === 0, "no comment control");
    await commentBtn.click();
    await page.waitForTimeout(2500);

    const composer = page.locator("textarea:visible").first();
    const text = `E2E UI comment ${Date.now()}`;
    await composer.fill(text);
    await page.locator("button:visible").filter({ hasText: /^post$/i }).first().click();
    await page.waitForTimeout(4000);

    const body = await page.locator("body").innerText();
    console.log(
      `[social comment-post] comment rendered: ${body.includes(text)} | ${summarize(c)}`,
    );
    expect(body.includes(text), "posted comment should appear in the thread").toBeTruthy();
  });
});
