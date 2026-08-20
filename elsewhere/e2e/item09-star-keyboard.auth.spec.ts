import { test, expect } from "@playwright/test";
import { requireDevAuth } from "./guards";

requireDevAuth();

/**
 * Item 9 — the overall-rating slider was pointer-only (role="slider" with no
 * tabIndex and no onKeyDown), making a required field unreachable by keyboard.
 */
test("overall rating is operable with arrow keys", async ({ page, request }) => {
  const feed = await request.get("/api/feed?lat=38.8304&lng=-77.1941&radius_miles=25");
  const placeId = (await feed.json())?.data?.[0]?.id;
  test.skip(!placeId, "no places available from the feed");

  await page.goto(`/places/${placeId}/rate`);

  const slider = page.getByRole("slider", { name: /overall rating/i });
  await expect(slider).toBeVisible();

  await slider.focus();
  await expect(slider).toBeFocused();

  await page.keyboard.press("ArrowRight");
  await expect(slider).toHaveAttribute("aria-valuenow", "0.5");

  await page.keyboard.press("ArrowRight");
  await expect(slider).toHaveAttribute("aria-valuenow", "1");

  await page.keyboard.press("End");
  await expect(slider).toHaveAttribute("aria-valuenow", "5");

  await page.keyboard.press("Home");
  await expect(slider).toHaveAttribute("aria-valuenow", "0.5");
});
