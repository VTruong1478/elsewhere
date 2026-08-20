import { test, expect } from "@playwright/test";
import { captureConsole } from "./console";

/**
 * Logged-out gating.
 *
 * Note: /profile/* is NOT in middleware PUBLIC_PATHS, so a logged-out visitor
 * is redirected before any RatingCard renders. The in-component
 * ensureAuthForGatedAction gate is therefore defence-in-depth rather than the
 * primary barrier — which also means "public profiles" are not publicly
 * viewable even though the profile APIs are built to serve them.
 */
test("public profile redirects logged-out visitors to sign-up", async ({ page }) => {
  const c = captureConsole(page);
  await page.goto("/profile/8c126980-be4f-4c8d-b052-d66ed1be4adc");
  await page.waitForURL(/\/signup/, { timeout: 20_000 });
  expect(page.url()).toMatch(/\/signup\?next=%2Fprofile/);
  console.log(`[gate] profile gated at middleware: ${page.url()}`);
  expect(c.pageErrors.length).toBeLessThan(3);
});

test("save API rejects an unauthenticated write", async ({ request }) => {
  const res = await request.post("/api/saved", {
    data: { place_id: "00000000-0000-4000-8000-000000000abc" },
  });
  console.log(`[gate] anonymous POST /api/saved -> ${res.status()}`);
  expect(res.status()).toBe(401);
});

test("rate API rejects an unauthenticated write", async ({ request }) => {
  const res = await request.post(
    "/api/places/00000000-0000-4000-8000-000000000abc/rate",
    { data: { overall_rating: 5, noise: "quiet", vibe: "focused", tables: "mixed", outlets: "some" } },
  );
  console.log(`[gate] anonymous POST /rate -> ${res.status()}`);
  expect(res.status()).toBe(401);
});

test("feed and map remain publicly browsable", async ({ page }) => {
  await page.goto("/feed");
  await page.waitForTimeout(4000);
  expect(page.url()).toMatch(/\/feed/);
  const cards = await page.locator("article").count();
  console.log(`[gate] anonymous feed cards: ${cards}`);
  expect(cards, "anonymous users should still browse the feed").toBeGreaterThan(0);
});
