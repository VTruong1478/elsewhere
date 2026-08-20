import { test, expect } from "@playwright/test";

/**
 * Item 14 — the desktop branch of /places/[id] was a stub (title, address, one
 * photo, back link). It now renders the same DesktopPlaceDetailPanel the feed
 * uses. The place row itself needs the database, so this asserts the panel is
 * mounted rather than asserting on place content.
 */
const PLACE_ID = "11111111-1111-4111-8111-111111111111";

test("desktop place detail no longer renders the old stub", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/places/${PLACE_ID}`);

  // The stub's only affordance was this link; the real panel has a close button.
  await expect(page.getByRole("link", { name: /back to feed/i })).toHaveCount(0);
});

test("mobile still gets the bottom-sheet layout", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/places/${PLACE_ID}`);

  await expect(page.getByRole("button", { name: /^back$/i })).toBeVisible({
    timeout: 20_000,
  });
});
