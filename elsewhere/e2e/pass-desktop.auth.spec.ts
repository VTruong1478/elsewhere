import { test, expect } from "@playwright/test";
import { requireDevAuth } from "./guards";
import { captureConsole, summarize } from "./console";

requireDevAuth();

async function firstPlaceId(api: import("@playwright/test").APIRequestContext) {
  const res = await api.get("/api/feed?lat=38.8304&lng=-77.1941&radius_miles=25");
  return (await res.json())?.data?.[0]?.id as string | undefined;
}

test.describe("desktop", () => {
  test("place detail at desktop width has full feature parity", async ({
    page,
    request,
  }) => {
    const id = await firstPlaceId(request);
    test.skip(!id, "no places");
    const c = captureConsole(page);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/places/${id}`);
    await page.waitForTimeout(8000);

    const body = await page.locator("body").innerText();

    // The old stub had only a title, address, one photo and "Back to feed".
    const oldStub = await page
      .locator("a:visible")
      .filter({ hasText: /back to feed/i })
      .count();

    const hasRateCta = await page
      .locator("a:visible, button:visible")
      .filter({ hasText: /rate/i })
      .count();
    const hasSave = await page
      .locator("button:visible")
      .filter({ hasText: /save|saved/i })
      .count();
    const hasMetrics = /noise|outlets|tables|vibe/i.test(body);
    const hasRatings = /rating|review|no ratings|be the first/i.test(body);

    console.log(
      `[desktop parity] oldStubLink=${oldStub} rateCta=${hasRateCta} save=${hasSave} metrics=${hasMetrics} ratings=${hasRatings} | ${summarize(c)}`,
    );

    expect(oldStub, "old stub back-link should be gone").toBe(0);
    expect(hasRateCta, "rate CTA missing at desktop width").toBeGreaterThan(0);
    expect(hasMetrics, "metrics missing at desktop width").toBeTruthy();
  });

  for (const route of ["/feed", "/saved", "/profile", "/map"]) {
    test(`no layout breakage at 1440px on ${route}`, async ({ page }) => {
      const c = captureConsole(page);
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(route);
      await page.waitForTimeout(5000);

      // Body must not scroll horizontally.
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      const navLinks = await page
        .locator('a[href="/feed"], a[href="/saved"]')
        .evaluateAll(
          (els) =>
            els.filter((el) => {
              const r = el.getBoundingClientRect();
              return r.width > 0 && r.height > 0;
            }).length,
        );
      console.log(
        `[desktop ${route}] hOverflow=${overflow}px visibleNav=${navLinks} | ${summarize(c)}`,
      );
      expect(overflow, `horizontal overflow on ${route}`).toBeLessThanOrEqual(1);
    });
  }
});
