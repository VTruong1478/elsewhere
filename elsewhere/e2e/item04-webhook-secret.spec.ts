import { test, expect } from "@playwright/test";

/**
 * Item 4 — the webhook used to accept its shared secret from the query string
 * (which lands in access logs). It is now header-only.
 */
test("webhook rejects a secret passed in the query string", async ({ request }) => {
  const res = await request.post(
    "/api/webhooks/new-submission?x-webhook-secret=whatever",
    { data: { type: "INSERT", table: "place_submissions", schema: "public" } },
  );

  expect(res.status()).toBe(401);
});

test("webhook rejects a request with no secret", async ({ request }) => {
  const res = await request.post("/api/webhooks/new-submission", {
    data: { type: "INSERT", table: "place_submissions", schema: "public" },
  });

  expect(res.status()).toBe(401);
});
