import { test, expect } from "@playwright/test";

/**
 * Item 8 — likes/comments endpoints. Anonymous half: writes are gated and ids
 * are validated. Reading a thread is deliberately auth-optional so counts and
 * comments render on public profile pages.
 */
const RATING_ID = "11111111-1111-4111-8111-111111111111";

test("liking requires a session", async ({ request }) => {
  const res = await request.post(`/api/social/ratings/${RATING_ID}/likes`);
  expect(res.status()).toBe(401);
  expect(await res.json()).toMatchObject({ error: "Authentication required" });
});

test("unliking requires a session", async ({ request }) => {
  const res = await request.delete(`/api/social/ratings/${RATING_ID}/likes`);
  expect(res.status()).toBe(401);
});

test("posting a comment requires a session", async ({ request }) => {
  const res = await request.post(
    `/api/social/ratings/${RATING_ID}/comments`,
    { data: { body: "hello" } },
  );
  expect(res.status()).toBe(401);
});

test("deleting a comment requires a session", async ({ request }) => {
  const res = await request.delete(
    `/api/social/ratings/${RATING_ID}/comments/${RATING_ID}`,
  );
  expect(res.status()).toBe(401);
});

test("a malformed rating id is rejected before any lookup", async ({ request }) => {
  const res = await request.get("/api/social/ratings/not-a-uuid/comments");
  expect(res.status()).toBe(400);
  expect(await res.json()).toMatchObject({ error: "Invalid rating id" });
});
