import { test, expect } from "@playwright/test";
import { requireDevAuth } from "./guards";

requireDevAuth();

/**
 * Item 1 — a photo path must belong to this user AND to the place being rated,
 * and the object must actually exist. Previously the check was
 * `path.includes(userId)`, so a path from a different place passed.
 */
test.describe("rating photo ownership", () => {
  async function firstPlaceId(request: import("@playwright/test").APIRequestContext) {
    // Annandale fallback centre used by the app when geolocation is unavailable.
    const res = await request.get(
      "/api/feed?lat=38.8304&lng=-77.1941&radius_miles=25",
    );
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const id = body?.data?.[0]?.id;
    expect(id, "feed returned at least one place").toBeTruthy();
    return id as string;
  }

  test("rejects a photo path scoped to a different place", async ({ request }) => {
    const placeId = await firstPlaceId(request);
    const otherPlaceId = "00000000-0000-4000-8000-000000000abc";

    const res = await request.post(`/api/places/${placeId}/rate`, {
      data: {
        overall_rating: 4,
        noise: "quiet",
        vibe: "focused",
        tables: "mixed",
        outlets: "some",
        photo_paths: [`user-photos/${otherPlaceId}/someone-123.jpg`],
      },
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/belong to your account/i);
  });

  test("rejects a nonexistent object under the correct place", async ({ request }) => {
    const placeId = await firstPlaceId(request);

    const res = await request.post(`/api/places/${placeId}/rate`, {
      data: {
        overall_rating: 4,
        noise: "quiet",
        vibe: "focused",
        tables: "mixed",
        outlets: "some",
        // Well-formed and place-scoped, but no such object exists in the bucket.
        photo_paths: [`user-photos/${placeId}/definitely-not-a-real-file.jpg`],
      },
    });

    expect(res.status()).toBe(400);
  });
});
