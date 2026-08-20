import { test, expect } from "@playwright/test";

/**
 * Item 2 — the follower/following endpoints were unauthenticated service-role
 * reads, so anyone could enumerate any user's social graph. They now require a
 * signed-in session. Runs anonymously, so it needs no dev-auth credentials.
 */
const SOME_USER_ID = "00000000-0000-4000-8000-000000000abc";

for (const route of ["followers", "following"]) {
  test(`/api/user/[id]/${route} rejects anonymous callers`, async ({ request }) => {
    const res = await request.get(`/api/user/${SOME_USER_ID}/${route}`);

    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body).toMatchObject({ data: null, error: "Authentication required" });
  });
}

test("photo proxy stays public so logged-out browsing keeps working", async ({
  request,
}) => {
  // Deliberately NOT gated: these are <img src> on public /feed, /map and
  // /places/[id], and the underlying bucket is public anyway.
  const res = await request.get("/api/storage/user-photos/nope/nope.jpg");
  expect(res.status()).not.toBe(401);
});
