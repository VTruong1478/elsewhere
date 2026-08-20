import { test, expect } from "@playwright/test";

/**
 * Item 3 — profile edits moved off direct anon-client writes and behind
 * PATCH /api/user/profile. Anonymous half: the route exists and is gated.
 */
test("PATCH /api/user/profile requires a session", async ({ request }) => {
  const res = await request.patch("/api/user/profile", {
    data: { username: "someone" },
  });

  expect(res.status()).toBe(401);
  expect(await res.json()).toMatchObject({
    data: null,
    error: "Authentication required",
  });
});
