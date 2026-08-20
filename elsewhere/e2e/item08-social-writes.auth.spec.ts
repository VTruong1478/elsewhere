import { test, expect } from "@playwright/test";
import { requireDevAuth } from "./guards";
import { MAX_COMMENT_LENGTH } from "../lib/constants/comments";

requireDevAuth();

/**
 * Item 8 — authenticated behaviour. Requires the likes/comments migration to
 * have been applied to the target database.
 */
const MISSING_RATING = "11111111-1111-4111-8111-111111111111";

test("liking a rating that does not exist is a 404", async ({ request }) => {
  const res = await request.post(
    `/api/social/ratings/${MISSING_RATING}/likes`,
  );
  expect(res.status()).toBe(404);
});

test("an empty comment is rejected", async ({ request }) => {
  const res = await request.post(
    `/api/social/ratings/${MISSING_RATING}/comments`,
    { data: { body: "   " } },
  );
  expect(res.status()).toBe(400);
  expect((await res.json()).error).toMatch(/cannot be empty/i);
});

test("an over-long comment is rejected", async ({ request }) => {
  const res = await request.post(
    `/api/social/ratings/${MISSING_RATING}/comments`,
    { data: { body: "x".repeat(MAX_COMMENT_LENGTH + 1) } },
  );
  expect(res.status()).toBe(400);
  expect((await res.json()).error).toMatch(/characters or fewer/i);
});

test("a non-string comment body is rejected", async ({ request }) => {
  const res = await request.post(
    `/api/social/ratings/${MISSING_RATING}/comments`,
    { data: { body: 42 } },
  );
  expect(res.status()).toBe(400);
});
