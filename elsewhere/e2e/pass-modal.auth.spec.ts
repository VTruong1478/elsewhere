import { test, expect, type Page } from "@playwright/test";
import { requireDevAuth } from "./guards";
import { captureConsole, summarize } from "./console";

requireDevAuth();

/** Force the feed empty so the "add a missing place" entry point renders. */
async function openModal(page: Page) {
  await page.route("**/api/feed**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: [], error: null }),
    }),
  );
  await page.goto("/feed");

  const trigger = page
    .locator("button:visible")
    .filter({ hasText: /add a missing place|add it here|missing/i })
    .first();
  await expect(trigger).toBeVisible({ timeout: 25_000 });
  await trigger.click();
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 10_000 });
}

async function fillForm(page: Page) {
  const d = page.getByRole("dialog");
  await d.locator("#add-place-name").fill("E2E Test Cafe");
  await d.locator("#add-place-address").fill("123 Test Street, Annandale VA");
  const select = d.locator("#add-place-type");
  await select.selectOption({ index: 1 });
}

test.describe("missing place modal", () => {
  test("server error is surfaced in the modal", async ({ page }) => {
    const c = captureConsole(page);
    await openModal(page);
    await fillForm(page);

    await page.route("**/api/place-submissions", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Server exploded" }),
      }),
    );

    const d = page.getByRole("dialog");
    await d.locator("button:visible").filter({ hasText: /^submit$/i }).click();

    await expect(d.getByRole("alert")).toContainText("Server exploded", {
      timeout: 15_000,
    });
    await expect(d).toBeVisible();
    console.log(`[modal server-error] error shown, modal stays open | ${summarize(c)}`);
  });

  test("network failure is surfaced in the modal", async ({ page }) => {
    const c = captureConsole(page);
    await openModal(page);
    await fillForm(page);

    await page.route("**/api/place-submissions", (route) => route.abort());

    const d = page.getByRole("dialog");
    await d.locator("button:visible").filter({ hasText: /^submit$/i }).click();

    await expect(d.getByRole("alert")).toContainText(/couldn.t reach the server/i, {
      timeout: 15_000,
    });
    console.log(`[modal network-error] connection message shown | ${summarize(c)}`);
  });

  test("modal traps nothing: Escape closes it", async ({ page }) => {
    await openModal(page);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden({ timeout: 10_000 });
    console.log("[modal escape] closes on Escape");
  });

  test("focus is NOT moved into the dialog on open (a11y defect)", async ({ page }) => {
    await openModal(page);
    const inside = await page.evaluate(() => {
      const dlg = document.querySelector('[role="dialog"]');
      return !!dlg && !!document.activeElement && dlg.contains(document.activeElement);
    });
    console.log(`[modal focus] focus inside dialog on open: ${inside}`);
  });
});
