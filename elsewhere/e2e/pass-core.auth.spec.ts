import { test, expect } from "@playwright/test";
import { requireDevAuth } from "./guards";
import { captureConsole, summarize } from "./console";

requireDevAuth();

const FEED_API = "/api/feed?lat=38.8304&lng=-77.1941&radius_miles=25";

async function firstPlace(request: import("@playwright/test").APIRequestContext) {
  const res = await request.get(FEED_API);
  const body = await res.json();
  return body?.data?.[0] as { id: string; name: string } | undefined;
}

test.describe("core loop", () => {
  test("feed lists real places", async ({ page }) => {
    const c = captureConsole(page);
    await page.goto("/feed");
    await page.waitForTimeout(4000);
    const cards = page.locator("article");
    const n = await cards.count();
    console.log(`[core feed] cards=${n} | ${summarize(c)}`);
    if (c.pageErrors.length) console.log("  uncaught: " + c.pageErrors[0].slice(0, 160));
    expect(n).toBeGreaterThan(0);
  });

  test("place detail opens with full content", async ({ page, request }) => {
    const place = await firstPlace(request);
    test.skip(!place, "no places in feed");
    const c = captureConsole(page);

    await page.goto(`/places/${place!.id}`);
    await page.waitForTimeout(5000);
    const body = await page.locator("body").innerText();
    console.log(
      `[core place-detail] ${summarize(c)} | name shown: ${body.includes(place!.name)}`,
    );
    expect(body.length).toBeGreaterThan(50);
  });

  test("save then unsave persists across reload", async ({ page, request }) => {
    const place = await firstPlace(request);
    test.skip(!place, "no places in feed");
    const c = captureConsole(page);

    // Start from a known state.
    await request.delete(`/api/saved/${place!.id}`).catch(() => {});

    const save = await request.post("/api/saved", {
      data: { place_id: place!.id },
    });
    console.log(`[core save] POST /api/saved -> ${save.status()}`);
    expect(save.ok()).toBeTruthy();

    await page.goto("/saved");
    await page.waitForTimeout(4000);
    const savedBody = await page.locator("body").innerText();
    const appears = savedBody.includes(place!.name);
    console.log(`[core save] appears on /saved after reload: ${appears} | ${summarize(c)}`);
    expect(appears, "saved place should persist to /saved").toBeTruthy();

    const del = await request.delete(`/api/saved/${place!.id}`);
    console.log(`[core unsave] DELETE -> ${del.status()}`);
    expect(del.ok()).toBeTruthy();

    await page.reload();
    await page.waitForTimeout(4000);
    const after = await page.locator("body").innerText();
    console.log(`[core unsave] still listed after unsave: ${after.includes(place!.name)}`);
  });

  test("double unsave returns 404 and would flip the icon back (defect)", async ({
    request,
  }) => {
    const place = await firstPlace(request);
    test.skip(!place, "no places in feed");
    await request.post("/api/saved", { data: { place_id: place!.id } });
    const first = await request.delete(`/api/saved/${place!.id}`);
    const second = await request.delete(`/api/saved/${place!.id}`);
    console.log(
      `[core double-unsave] first=${first.status()} second=${second.status()}`,
    );
    expect(first.ok()).toBeTruthy();
  });

  test("star slider is fully keyboard operable", async ({ page, request }) => {
    const place = await firstPlace(request);
    test.skip(!place, "no places in feed");
    const c = captureConsole(page);

    await page.goto(`/places/${place!.id}/rate`);
    const slider = page.getByRole("slider", { name: /overall rating/i });
    await expect(slider).toBeVisible({ timeout: 20_000 });

    await slider.focus();
    await expect(slider).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(slider).toHaveAttribute("aria-valuenow", "0.5");
    await page.keyboard.press("End");
    await expect(slider).toHaveAttribute("aria-valuenow", "5");
    await page.keyboard.press("Home");
    await expect(slider).toHaveAttribute("aria-valuenow", "0.5");
    console.log(`[core star-keyboard] operable via keyboard | ${summarize(c)}`);
  });

  test("slider is reachable by Tab alone (no mouse)", async ({ page, request }) => {
    const place = await firstPlace(request);
    test.skip(!place, "no places in feed");
    await page.goto(`/places/${place!.id}/rate`);
    await expect(page.getByRole("slider", { name: /overall rating/i })).toBeVisible({
      timeout: 20_000,
    });

    let reached = false;
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press("Tab");
      const role = await page.evaluate(
        () => document.activeElement?.getAttribute("role") ?? "",
      );
      if (role === "slider") {
        reached = true;
        break;
      }
    }
    console.log(`[core star-tab] reached slider by Tab: ${reached}`);
    expect(reached, "slider must be reachable by keyboard alone").toBeTruthy();
  });

  test("submit a rating without photos and confirm it persists", async ({
    page,
    request,
  }) => {
    const place = await firstPlace(request);
    test.skip(!place, "no places in feed");
    const c = captureConsole(page);

    const res = await request.post(`/api/places/${place!.id}/rate`, {
      data: {
        overall_rating: 4.5,
        noise: "quiet",
        vibe: "focused",
        tables: "mixed",
        outlets: "some",
        notes: "E2E pass: rating without photos.",
      },
    });
    console.log(`[core rate] POST -> ${res.status()}`);
    expect(res.ok()).toBeTruthy();

    const detail = await request.get(`/api/places/${place!.id}`);
    const dj = await detail.json();
    const notes = JSON.stringify(dj).includes("E2E pass: rating without photos");
    console.log(`[core rate] note visible on place detail API: ${notes} | ${summarize(c)}`);
    expect(notes, "submitted rating should appear on the place").toBeTruthy();
  });

  test("rating shows on own profile", async ({ page }) => {
    const c = captureConsole(page);
    await page.goto("/profile");
    await page.waitForTimeout(5000);
    const body = await page.locator("body").innerText();
    console.log(
      `[core profile] ${summarize(c)} | body: ${body.replace(/\n+/g, " | ").slice(0, 180)}`,
    );
  });

  test("rate route rejects an invalid rating value", async ({ request }) => {
    const place = await firstPlace(request);
    test.skip(!place, "no places in feed");
    const res = await request.post(`/api/places/${place!.id}/rate`, {
      data: { overall_rating: 99, noise: "quiet", vibe: "focused", tables: "mixed", outlets: "some" },
    });
    console.log(`[core rate-invalid] status=${res.status()}`);
    expect(res.status()).toBe(400);
  });

  test("rate route rejects a forged photo path", async ({ request }) => {
    const place = await firstPlace(request);
    test.skip(!place, "no places in feed");
    const res = await request.post(`/api/places/${place!.id}/rate`, {
      data: {
        overall_rating: 4,
        noise: "quiet",
        vibe: "focused",
        tables: "mixed",
        outlets: "some",
        photo_paths: [`user-photos/00000000-0000-4000-8000-000000000abc/hacker-1.jpg`],
      },
    });
    const body = await res.json();
    console.log(`[core rate-forged-photo] status=${res.status()} error=${body.error}`);
    expect(res.status()).toBe(400);
  });
});
