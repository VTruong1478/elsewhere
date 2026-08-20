import { test, expect } from "@playwright/test";
import { requireDevAuth } from "./guards";
import { captureConsole, summarize } from "./console";

requireDevAuth();

async function firstPlaceId(api: import("@playwright/test").APIRequestContext) {
  const res = await api.get("/api/feed?lat=38.8304&lng=-77.1941&radius_miles=25");
  return (await res.json())?.data?.[0]?.id as string | undefined;
}

test.describe("desktop save affordance", () => {
  test("place detail exposes a save control (icon or text)", async ({ page, request }) => {
    const id = await firstPlaceId(request);
    test.skip(!id, "no places");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/places/${id}`);
    await page.waitForTimeout(7000);

    const labels = await page.locator("button:visible").evaluateAll((els) =>
      els
        .map((e) => e.getAttribute("aria-label") || e.textContent?.trim() || "")
        .filter(Boolean),
    );
    const saveish = labels.filter((l) => /save|bookmark/i.test(l));
    console.log(`[desktop save] matching controls: ${JSON.stringify(saveish)}`);
    console.log(`[desktop save] all buttons: ${JSON.stringify(labels.slice(0, 14))}`);
  });
});

test.describe("toasts and rollback", () => {
  test("failed save surfaces a toast instead of a silent revert", async ({ page }) => {
    const c = captureConsole(page);
    await page.goto("/feed");
    await page.waitForTimeout(6000);

    // Force every save attempt to fail.
    await page.route("**/api/saved", (route) =>
      route.request().method() === "POST"
        ? route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({ error: "Save failed upstream" }),
          })
        : route.continue(),
    );

    // Save controls are icon-only with an aria-label like "Save <place>".
    const saveBtn = page.locator('button:visible[aria-label^="Save "]').first();
    const n = await saveBtn.count();
    console.log(`[toast] save buttons on feed: ${n}`);
    test.skip(n === 0, "no save control on feed cards");

    await saveBtn.click();

    const toast = page.getByRole("status").filter({ hasText: /save failed upstream/i });
    await expect(toast).toBeVisible({ timeout: 15_000 });
    console.log(`[toast failed-save] toast shown with server message | ${summarize(c)}`);
  });

  test("failed unsave surfaces a toast", async ({ page, request }) => {
    const id = await firstPlaceId(request);
    test.skip(!id, "no places");
    await request.post("/api/saved", { data: { place_id: id } });
    const c = captureConsole(page);

    await page.goto("/saved");
    await page.waitForTimeout(6000);

    await page.route("**/api/saved/**", (route) =>
      route.request().method() === "DELETE"
        ? route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({ error: "Unsave failed upstream" }),
          })
        : route.continue(),
    );

    const unsave = page
      .locator('button:visible[aria-label^="Remove "], button:visible[aria-label^="Unsave"]')
      .first();
    const n = await unsave.count();
    console.log(`[toast] unsave controls on /saved: ${n}`);
    if (n === 0) {
      console.log("[toast failed-unsave] SKIP — no unsave control matched");
      await request.delete(`/api/saved/${id}`).catch(() => {});
      return;
    }
    await unsave.click();
    const toast = page.getByRole("status").filter({ hasText: /unsave failed upstream/i });
    await expect(toast).toBeVisible({ timeout: 15_000 });
    console.log(`[toast failed-unsave] toast shown | ${summarize(c)}`);
    await request.delete(`/api/saved/${id}`).catch(() => {});
  });

  test("failed like surfaces a toast and rolls back", async ({ page }) => {
    const c = captureConsole(page);
    await page.goto("/profile");
    await page.waitForTimeout(7000);

    await page.route("**/likes", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Like failed upstream" }),
      }),
    );

    const like = page
      .locator('button:visible[aria-label="Like"], button:visible[aria-label="Unlike"]')
      .first();
    test.skip((await like.count()) === 0, "no like control");

    const before = await like.getAttribute("aria-pressed");
    await like.click();

    const toast = page.getByRole("status").filter({ hasText: /like failed upstream/i });
    await expect(toast).toBeVisible({ timeout: 15_000 });

    await page.waitForTimeout(1500);
    const after = await page
      .locator('button:visible[aria-label="Like"], button:visible[aria-label="Unlike"]')
      .first()
      .getAttribute("aria-pressed");
    console.log(
      `[toast failed-like] toast shown | aria-pressed ${before} -> ${after} (rolled back: ${before === after}) | ${summarize(c)}`,
    );
    expect(after, "like state should roll back on failure").toBe(before);
  });
});
